package fi.synkka.engine

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Watches the Syncthing event stream natively (independent of the JS runtime) and tells the
 * foreground service whether files are being transferred, so the notification can drop to a
 * silent, icon-less state when idle.
 */
object EngineMonitor {
  private const val TAG = "SynkkaMonitor"
  private const val EVENTS = "FolderSummary,FolderCompletion,StateChanged,DeviceDisconnected,ConfigSaved"
  private val TRANSFER_STATES = setOf("syncing", "sync-preparing")

  @Volatile private var thread: Thread? = null

  /** Items this device still needs, per folder. */
  private val localNeed = HashMap<String, Int>()
  /** Items a connected remote device still needs from us, per "folder|device". */
  private val remoteNeed = HashMap<String, Int>()
  private val folderState = HashMap<String, String>()
  private var lastReported: Int? = null

  @Synchronized
  fun start(context: Context) {
    if (thread?.isAlive == true) return
    thread = Thread { loop(context.applicationContext) }.apply {
      isDaemon = true
      name = "synkka-monitor"
      start()
    }
  }

  @Synchronized
  fun stop() {
    thread?.interrupt()
    thread = null
    lastReported = null
  }

  private fun get(path: String, timeoutMs: Int): String {
    val conn = URL("http://127.0.0.1:${Engine.port}$path").openConnection() as HttpURLConnection
    conn.setRequestProperty("X-API-Key", Engine.apiKey)
    conn.connectTimeout = 3000
    conn.readTimeout = timeoutMs
    try {
      if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode} $path")
      return conn.inputStream.bufferedReader().readText()
    } finally {
      conn.disconnect()
    }
  }

  private fun seed() {
    localNeed.clear(); remoteNeed.clear(); folderState.clear()
    val folders = JSONArray(get("/rest/config/folders", 10_000))
    for (i in 0 until folders.length()) {
      val id = folders.getJSONObject(i).getString("id")
      val status = JSONObject(get("/rest/db/status?folder=${java.net.URLEncoder.encode(id, "UTF-8")}", 10_000))
      localNeed[id] = waiting(status)
      folderState[id] = status.optString("state", "idle")
    }
  }

  /** Items still to transfer; ones that failed (e.g. a file name Android can't store) don't count. */
  private fun waiting(status: JSONObject): Int =
    maxOf(0, status.optInt("needTotalItems", 0) - status.optInt("pullErrors", 0))

  private fun activeCount(): Int {
    val local = localNeed.values.sum()
    val remote = remoteNeed.values.sum()
    val busyState = folderState.values.any { it in TRANSFER_STATES }
    val n = local + remote
    return if (n == 0 && busyState) 1 else n
  }

  private fun report(context: Context) {
    val n = activeCount()
    if (n != lastReported) {
      lastReported = n
      EngineService.updateNotification(context, n)
    }
  }

  private fun loop(context: Context) {
    var since = 0L
    var needSeed = true
    while (!Thread.currentThread().isInterrupted) {
      try {
        if (needSeed) {
          seed()
          // Start from "now": the seed already reflects past events.
          val latest = JSONArray(get("/rest/events?since=0&limit=1&timeout=0&events=$EVENTS", 10_000))
          since = if (latest.length() > 0) latest.getJSONObject(latest.length() - 1).getLong("id") else 0
          needSeed = false
          report(context)
        }
        val events = JSONArray(get("/rest/events?since=$since&timeout=60&events=$EVENTS", 75_000))
        for (i in 0 until events.length()) {
          val e = events.getJSONObject(i)
          since = maxOf(since, e.getLong("id"))
          val data = e.optJSONObject("data") ?: continue
          when (e.getString("type")) {
            "FolderSummary" -> localNeed[data.getString("folder")] = waiting(data.getJSONObject("summary"))
            "FolderCompletion" -> remoteNeed["${data.getString("folder")}|${data.getString("device")}"] = data.optInt("needItems", 0)
            "StateChanged" -> folderState[data.getString("folder")] = data.optString("to", "idle")
            "DeviceDisconnected" -> {
              val dev = data.optString("id")
              remoteNeed.keys.removeAll { it.endsWith("|$dev") }
            }
            "ConfigSaved" -> needSeed = true
          }
        }
        report(context)
      } catch (_: InterruptedException) {
        return
      } catch (e: Exception) {
        // Engine starting or restarting: retry, then re-seed.
        Log.d(TAG, "monitor: ${e.message}")
        needSeed = true
        try { Thread.sleep(3000) } catch (_: InterruptedException) { return }
      }
    }
  }
}
