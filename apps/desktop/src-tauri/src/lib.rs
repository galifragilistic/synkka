//! Synkka desktop shell: runs the bundled Syncthing engine as a sidecar and exposes a
//! narrow bridge to the web UI. The API key never reaches the web view; the UI can only
//! call `/rest/*` through `st_request`, and file moves are limited to synced folders.

use std::{
    net::TcpListener,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use serde::Serialize;
use serde_json::Value;
use tauri::{Manager, RunEvent, State, WindowEvent};

mod tray;
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

struct Engine {
    base: String,
    api_key: String,
    client: reqwest::Client,
    child: Mutex<Option<CommandChild>>,
    exit_error: Mutex<Option<String>>,
}

fn free_port() -> std::io::Result<u16> {
    Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port())
}

fn random_key() -> String {
    use rand::distr::{Alphanumeric, SampleString};
    Alphanumeric.sample_string(&mut rand::rng(), 40)
}

/// Proxies a Syncthing REST call. Only `/rest/…` paths are allowed.
#[tauri::command]
async fn st_request(
    engine: State<'_, Engine>,
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, String> {
    if !path.starts_with("/rest/") || path.contains("..") {
        return Err("forbidden path".into());
    }
    if let Some(err) = engine.exit_error.lock().unwrap().clone() {
        return Err(err);
    }
    let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let mut req = engine
        .client
        .request(method, format!("{}{}", engine.base, path))
        .header("X-API-Key", &engine.api_key);
    if let Some(b) = body {
        req = req.json(&b);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("{} {}", status.as_u16(), text.trim()));
    }
    if text.trim().is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

fn expand_home(p: &str) -> PathBuf {
    if p == "~" {
        if let Some(home) = home_dir() {
            return home;
        }
    }
    if let Some(rest) = p.strip_prefix("~/").or_else(|| p.strip_prefix("~\\")) {
        if let Some(home) = home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(p)
}

/// Paths of all folders configured in Syncthing.
async fn folder_roots(engine: &Engine) -> Result<Vec<PathBuf>, String> {
    let res = engine
        .client
        .get(format!("{}/rest/config/folders", engine.base))
        .header("X-API-Key", &engine.api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let folders: Vec<Value> = res.json().await.map_err(|e| e.to_string())?;
    Ok(folders
        .iter()
        .filter_map(|f| f.get("path").and_then(Value::as_str))
        .map(expand_home)
        .collect())
}

fn is_inside(p: &Path, roots: &[PathBuf]) -> bool {
    p.is_absolute()
        && !p.components().any(|c| matches!(c, Component::ParentDir))
        && roots.iter().any(|r| p.starts_with(r) && p != r)
}

/// Moves a file inside a synced folder (conflict resolution). Creates parent directories.
#[tauri::command]
async fn fs_rename(engine: State<'_, Engine>, from: String, to: String, overwrite: bool) -> Result<(), String> {
    let roots = folder_roots(&engine).await?;
    // Paths come from Syncthing's folder config and may start with "~".
    let (from, to) = (expand_home(&from), expand_home(&to));
    if !is_inside(&from, &roots) || !is_inside(&to, &roots) {
        return Err("path outside synced folders".into());
    }
    if !overwrite && to.exists() {
        return Err(format!("already exists: {}", to.display()));
    }
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiskUsage {
    used_bytes: u64,
    total_bytes: u64,
}

/// Disk usage of the volume holding the first synced folder (or the home directory).
#[tauri::command]
async fn disk_usage(engine: State<'_, Engine>) -> Result<DiskUsage, String> {
    let roots = folder_roots(&engine).await.unwrap_or_default();
    let path = roots
        .into_iter()
        .find(|p| p.exists())
        .or_else(home_dir)
        .unwrap_or_else(|| PathBuf::from("/"));
    let total = fs2::total_space(&path).map_err(|e| e.to_string())?;
    let avail = fs2::available_space(&path).map_err(|e| e.to_string())?;
    Ok(DiskUsage { used_bytes: total.saturating_sub(avail), total_bytes: total })
}

fn is_inside_or_root(p: &Path, roots: &[PathBuf]) -> bool {
    p.is_absolute()
        && !p.components().any(|c| matches!(c, Component::ParentDir))
        && roots.iter().any(|r| p.starts_with(r))
}

/// Opens a synced file with its default app (Finder's "Open" / Explorer double-click).
#[tauri::command]
async fn open_path(engine: State<'_, Engine>, path: String) -> Result<(), String> {
    let roots = folder_roots(&engine).await?;
    let p = expand_home(&path);
    if !is_inside_or_root(&p, &roots) || !p.exists() {
        return Err("path outside synced folders".into());
    }
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open").arg(&p).status();
    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("explorer").arg(&p).status();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let status = std::process::Command::new("xdg-open").arg(&p).status();
    status.map(|_| ()).map_err(|e| e.to_string())
}

/// Shows a synced file or folder in Finder / Explorer (selected in its parent window).
#[tauri::command]
async fn reveal_path(engine: State<'_, Engine>, path: String) -> Result<(), String> {
    let roots = folder_roots(&engine).await?;
    let p = expand_home(&path);
    if !is_inside_or_root(&p, &roots) || !p.exists() {
        return Err("path outside synced folders".into());
    }
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open").arg("-R").arg(&p).status();
    // Explorer parses its own command line: the path must be quoted after "/select," as-is,
    // which Rust's argument escaping would not produce for paths with spaces.
    #[cfg(target_os = "windows")]
    let status = {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer").raw_arg(format!("/select,\"{}\"", p.display())).status()
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let status = std::process::Command::new("xdg-open").arg(p.parent().unwrap_or(&p)).status();
    status.map(|_| ()).map_err(|e| e.to_string())
}

const SHARED_IGNORE_FILE: &str = ".stglobalignore";

/// The shared ignore file of a synced folder: only `<folder root>/.stglobalignore` is allowed.
async fn shared_ignore_path(engine: &Engine, folder_path: &str) -> Result<PathBuf, String> {
    let roots = folder_roots(engine).await?;
    let root = expand_home(folder_path);
    if !roots.iter().any(|r| r == &root) {
        return Err("not a synced folder".into());
    }
    Ok(root.join(SHARED_IGNORE_FILE))
}

#[tauri::command]
async fn read_shared_ignores(engine: State<'_, Engine>, folder_path: String) -> Result<Option<String>, String> {
    let p = shared_ignore_path(&engine, &folder_path).await?;
    match std::fs::read_to_string(&p) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn write_shared_ignores(engine: State<'_, Engine>, folder_path: String, content: String) -> Result<(), String> {
    let p = shared_ignore_path(&engine, &folder_path).await?;
    std::fs::write(&p, content).map_err(|e| e.to_string())
}

/// Host name without the macOS ".local" suffix, used as the default device name.
#[tauri::command]
fn host_name() -> String {
    #[cfg(target_os = "macos")]
    let name = std::process::Command::new("scutil")
        .args(["--get", "ComputerName"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty());
    #[cfg(not(target_os = "macos"))]
    let name: Option<String> = None;
    name.or_else(|| std::env::var("COMPUTERNAME").ok()).unwrap_or_default()
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

fn start_engine(app: &tauri::App) -> Result<Engine, Box<dyn std::error::Error>> {
    let data = app.path().app_data_dir()?;
    let home = data.join("syncthing");
    std::fs::create_dir_all(&home)?;
    let log_dir = app.path().app_log_dir()?;
    std::fs::create_dir_all(&log_dir)?;
    let port = free_port()?;
    let api_key = random_key();

    let (mut rx, child) = app
        .shell()
        .sidecar("syncthing")?
        .args([
            "serve".to_string(),
            format!("--home={}", home.display()),
            format!("--gui-address=http://127.0.0.1:{port}"),
            "--no-browser".into(),
            "--no-restart".into(),
            "--no-upgrade".into(),
            format!("--log-file={}", log_dir.join("syncthing.log").display()),
        ])
        .env("STNODEFAULTFOLDER", "1")
        // Via env, not argv: other local users can read process arguments.
        .env("STGUIAPIKEY", &api_key)
        .spawn()?;

    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Terminated(payload) = event {
                let msg = format!("Syncthing stopped (code {:?})", payload.code);
                log::error!("{msg}");
                if let Some(engine) = handle.try_state::<Engine>() {
                    *engine.exit_error.lock().unwrap() = Some(msg);
                }
            }
        }
    });

    Ok(Engine {
        base: format!("http://127.0.0.1:{port}"),
        api_key,
        // Event long-polls last up to 60 s.
        client: reqwest::Client::builder().timeout(Duration::from_secs(90)).build()?,
        child: Mutex::new(Some(child)),
        exit_error: Mutex::new(None),
    })
}

/// Graceful shutdown: Syncthing runs a monitor + worker process pair, and killing only the
/// monitor would orphan the worker. Ask it to shut down over REST first (flushes its database),
/// then kill whatever is left.
fn stop_engine(engine: &Engine) {
    let client = engine.client.clone();
    let url = format!("{}/rest/system/shutdown", engine.base);
    let key = engine.api_key.clone();
    let _ = tauri::async_runtime::block_on(async move {
        tokio::time::timeout(
            Duration::from_secs(3),
            client.post(url).header("X-API-Key", key).send(),
        )
        .await
    });
    std::thread::sleep(Duration::from_millis(1500));
    if let Some(child) = engine.child.lock().unwrap().take() {
        let _ = child.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_home_and_limits_paths_to_synced_folders() {
        let home = home_dir().unwrap();
        let roots = vec![expand_home("~/Synkka/Testi")];
        assert_eq!(roots[0], home.join("Synkka/Testi"));
        assert_eq!(expand_home("~\\Synkka\\Testi"), home.join("Synkka\\Testi"));
        assert!(is_inside(&expand_home("~/Synkka/Testi/a.txt"), &roots));
        assert!(!is_inside(&expand_home("~/Synkka/Testi"), &roots)); // the root itself can't be moved
        assert!(is_inside_or_root(&expand_home("~/Synkka/Testi"), &roots));
        assert!(!is_inside(&expand_home("~/Synkka/Testi/../../.ssh/id_rsa"), &roots));
        assert!(!is_inside(&PathBuf::from("/etc/passwd"), &roots));
        assert!(!is_inside(&PathBuf::from("C:\\Windows\\win.ini"), &roots));
        assert!(!is_inside(&PathBuf::from("Synkka/Testi/a.txt"), &roots)); // relative
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first. A second launch (Start menu, desktop shortcut) would start a
        // second Syncthing on the same database; instead it shows the running app's window.
        // macOS gets this from LaunchServices (RunEvent::Reopen below).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main_window(app)))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![tray::HIDDEN_ARG]),
        ))
        .setup(|app| {
            // Menu bar app: no Dock icon, the window opens from the tray menu.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            tray::create(app)?;
            if !std::env::args().any(|a| a == tray::HIDDEN_ARG) {
                tray::show_main_window(app.handle());
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let engine = start_engine(app)?;
            app.manage(engine);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing hides the window; syncing goes on in the background.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![st_request, fs_rename, disk_usage, host_name, open_path, reveal_path, read_shared_ignores, write_shared_ignores, tray::tray_update])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            match event {
                RunEvent::Exit => {
                    if let Some(engine) = app.try_state::<Engine>() {
                        stop_engine(&engine);
                    }
                }
                // Launched again from Finder/Spotlight while already running.
                #[cfg(target_os = "macos")]
                RunEvent::Reopen { .. } => tray::show_main_window(app),
                _ => {}
            }
        });
}
