//! Menu bar (tray) icon: Synkka keeps syncing in the background with no Dock icon. Closing the
//! window only hides it; the app quits from the tray menu. The web UI owns the texts (fi.json)
//! and the sync state, and pushes them here with `tray_update`.

use std::sync::Mutex;

use serde::Deserialize;
use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, Wry,
};
use tauri_plugin_autostart::ManagerExt;

/// Passed by the login item so a login start stays in the menu bar without opening the window.
pub const HIDDEN_ARG: &str = "--hidden";
const TRAY_ID: &str = "main";

pub struct Tray {
    status: MenuItem<Wry>,
    toggle: MenuItem<Wry>,
    open: MenuItem<Wry>,
    login: CheckMenuItem<Wry>,
    quit: MenuItem<Wry>,
    paused: Mutex<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayTexts {
    status: String,
    toggle: String,
    paused: bool,
    open: String,
    launch_at_login: String,
    quit: String,
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn create(app: &tauri::App) -> tauri::Result<()> {
    // Initial texts until the web UI has loaded and sends the localised ones.
    let status = MenuItem::with_id(app, "status", "Synkka", false, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Keskeytä", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Avaa Synkka", true, None::<&str>)?;
    let login_on = app.autolaunch().is_enabled().unwrap_or(false);
    let login = CheckMenuItem::with_id(app, "login", "Käynnistä kirjautuessa", true, login_on, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Lopeta Synkka", true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);
    let menu = Menu::with_items(app, &[&status, &toggle, &sep()?, &open, &login, &sep()?, &quit])?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(include_bytes!("../icons/tray-template.png"))?)
        .icon_as_template(true)
        .tooltip("Synkka")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "toggle" => {
                let paused = *app.state::<Tray>().paused.lock().unwrap();
                // The web UI runs pause/resume so its state stays the single source.
                let _ = app.emit("tray-action", if paused { "resume" } else { "pause" });
            }
            "login" => {
                let tray = app.state::<Tray>();
                let al = app.autolaunch();
                let want = !al.is_enabled().unwrap_or(false);
                let res = if want { al.enable() } else { al.disable() };
                if let Err(e) = res {
                    log::error!("autostart: {e}");
                }
                let _ = tray.login.set_checked(al.is_enabled().unwrap_or(false));
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    app.manage(Tray { status, toggle, open, login, quit, paused: Mutex::new(false) });
    Ok(())
}

#[tauri::command]
pub fn tray_update(app: AppHandle, tray: State<'_, Tray>, texts: TrayTexts) -> Result<(), String> {
    let e = |e: tauri::Error| e.to_string();
    *tray.paused.lock().unwrap() = texts.paused;
    tray.status.set_text(&texts.status).map_err(e)?;
    tray.toggle.set_text(&texts.toggle).map_err(e)?;
    tray.open.set_text(&texts.open).map_err(e)?;
    tray.login.set_text(&texts.launch_at_login).map_err(e)?;
    tray.quit.set_text(&texts.quit).map_err(e)?;
    if let Some(icon) = app.tray_by_id(TRAY_ID) {
        icon.set_tooltip(Some(format!("Synkka – {}", texts.status))).map_err(e)?;
    }
    Ok(())
}
