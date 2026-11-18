package fi.synkka.engine

import android.content.Context
import android.util.Log
import java.io.File
import java.net.ServerSocket
import java.security.SecureRandom

/** Owns the Syncthing child process. One instance per app process. */
object Engine {
  private const val TAG = "SynkkaEngine"
  private const val PREFS = "synkka_engine"

  @Volatile private var process: Process? = null
  @Volatile private var wantRunning = false
  @Volatile var port: Int = 0
    private set
  @Volatile var apiKey: String = ""
    private set

  fun isRunning(): Boolean = process?.isAlive == true

  /** Port/API key the engine uses; stable across launches unless the port is taken. */
  @Synchronized
  fun ensureCredentials(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    var key = prefs.getString("apiKey", null)
    if (key == null) {
      val bytes = ByteArray(24).also { SecureRandom().nextBytes(it) }
      key = bytes.joinToString("") { "%02x".format(it) }
    }
    var p = prefs.getInt("port", 0)
    if (!isRunning() && (p == 0 || !portFree(p))) p = freePort()
    prefs.edit().putString("apiKey", key).putInt("port", p).apply()
    apiKey = key
    port = p
  }

  @Synchronized
  fun startProcess(context: Context) {
    wantRunning = true
    if (isRunning()) return
    ensureCredentials(context)
    val bin = File(context.applicationInfo.nativeLibraryDir, "libsyncthing.so")
    val home = File(context.filesDir, "syncthing").apply { mkdirs() }
    val cmd = listOf(
      bin.absolutePath, "serve",
      "--home=${home.absolutePath}",
      "--gui-address=http://127.0.0.1:$port",
      "--gui-apikey=$apiKey",
      "--no-browser", "--no-restart", "--no-upgrade",
      "--log-file=${File(home, "syncthing.log").absolutePath}",
    )
    val pb = ProcessBuilder(cmd).redirectErrorStream(true)
    pb.environment().apply {
      put("HOME", context.filesDir.absolutePath)
      put("TMPDIR", context.cacheDir.absolutePath)
      put("STNODEFAULTFOLDER", "1")
      put("STNOUPGRADE", "1")
    }
    Log.i(TAG, "Starting Syncthing on 127.0.0.1:$port ($bin)")
    val p = pb.start()
    process = p
    Thread {
      p.inputStream.bufferedReader().forEachLine { Log.d(TAG, it) }
      val code = try { p.waitFor() } catch (_: InterruptedException) { -1 }
      Log.w(TAG, "Syncthing exited with $code")
      if (process === p) process = null
      if (wantRunning) {
        Thread.sleep(2000)
        try { startProcess(context) } catch (e: Exception) { Log.e(TAG, "Restart failed", e) }
      }
    }.apply { isDaemon = true; name = "syncthing-monitor" }.start()
  }

  /**
   * Syncthing runs as a monitor + worker pair; destroying only the monitor would orphan the
   * worker (which keeps the database lock and the port). Ask it to shut down over REST first.
   */
  @Synchronized
  fun stopProcess() {
    wantRunning = false
    val p = process ?: return
    val shutdown = Thread {
      try {
        val conn = java.net.URL("http://127.0.0.1:$port/rest/system/shutdown").openConnection() as java.net.HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("X-API-Key", apiKey)
        conn.connectTimeout = 2000
        conn.readTimeout = 2000
        conn.responseCode
        conn.disconnect()
      } catch (e: Exception) {
        Log.w(TAG, "Graceful shutdown failed", e)
      }
    }
    shutdown.start()
    shutdown.join(3000)
    try {
      p.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)
    } catch (_: InterruptedException) {
    }
    if (p.isAlive) p.destroyForcibly()
    process = null
  }

  private fun portFree(p: Int): Boolean = try { ServerSocket(p).use { true } } catch (_: Exception) { false }
  private fun freePort(): Int = ServerSocket(0).use { it.localPort }
}
