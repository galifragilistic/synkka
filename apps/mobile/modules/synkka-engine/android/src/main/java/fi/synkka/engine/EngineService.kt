package fi.synkka.engine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Foreground service that keeps the Syncthing engine alive in the background.
 *
 * Android requires a notification for this. While idle it uses a minimum-importance channel
 * (no status-bar icon, collapsed, silent); while files are moving it switches to a low-importance
 * channel with the animated sync icon and a "N files" text. EngineMonitor drives the switch.
 */
class EngineService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      EngineMonitor.stop()
      Engine.stopProcess()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    ensureChannels(this)
    val notification = build(this, activeCount = 0)
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    Engine.startProcess(applicationContext)
    EngineMonitor.start(applicationContext)
    return START_STICKY
  }

  override fun onDestroy() {
    EngineMonitor.stop()
    Engine.stopProcess()
    super.onDestroy()
  }

  companion object {
    const val ACTION_STOP = "fi.synkka.engine.STOP"
    private const val CHANNEL_IDLE = "synkka_idle"
    private const val CHANNEL_ACTIVE = "synkka_active"
    private const val LEGACY_CHANNEL = "synkka_engine"
    private const val NOTIFICATION_ID = 4711
    private const val PREFS = "synkka_engine_texts"

    /** Localized texts come from the JS side (copy lives in fi.json); these are fallbacks. */
    private val DEFAULTS = mapOf(
      "idleChannel" to "Taustasynkronointi",
      "activeChannel" to "Tiedostojen siirto",
      "idleTitle" to "Synkka",
      "idleText" to "Kaikki synkronoitu",
      "activeOne" to "Synkronoidaan {count} tiedosto",
      "activeOther" to "Synkronoidaan {count} tiedostoa",
    )

    fun setTexts(context: Context, texts: Map<String, String>) {
      val e = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      texts.forEach { (k, v) -> e.putString(k, v) }
      e.apply()
      ensureChannels(context, rename = true)
    }

    private fun text(context: Context, key: String) =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(key, null) ?: DEFAULTS.getValue(key)

    private fun ensureChannels(context: Context, rename: Boolean = false) {
      if (Build.VERSION.SDK_INT < 26) return
      val nm = context.getSystemService(NotificationManager::class.java)
      nm.deleteNotificationChannel(LEGACY_CHANNEL) // v0.2 used one LOW channel
      val idle = NotificationChannel(CHANNEL_IDLE, text(context, "idleChannel"), NotificationManager.IMPORTANCE_MIN).apply {
        setShowBadge(false)
      }
      val active = NotificationChannel(CHANNEL_ACTIVE, text(context, "activeChannel"), NotificationManager.IMPORTANCE_LOW).apply {
        setShowBadge(false)
      }
      if (rename || nm.getNotificationChannel(CHANNEL_IDLE) == null) nm.createNotificationChannel(idle)
      if (rename || nm.getNotificationChannel(CHANNEL_ACTIVE) == null) nm.createNotificationChannel(active)
    }

    private fun build(context: Context, activeCount: Int): Notification {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      val pi = launch?.let {
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      }
      val active = activeCount > 0
      val channel = if (active) CHANNEL_ACTIVE else CHANNEL_IDLE
      val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, channel) else Notification.Builder(context)
      val body = if (active) {
        text(context, if (activeCount == 1) "activeOne" else "activeOther").replace("{count}", activeCount.toString())
      } else {
        text(context, "idleText")
      }
      return builder
        // Animated sync icon only while transferring; a static one otherwise.
        .setSmallIcon(if (active) android.R.drawable.stat_notify_sync else android.R.drawable.stat_notify_sync_noanim)
        .setContentTitle(text(context, "idleTitle"))
        .setContentText(body)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setCategory(Notification.CATEGORY_SERVICE)
        .setContentIntent(pi)
        .apply { if (Build.VERSION.SDK_INT >= 31) setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_DEFERRED) }
        .build()
    }

    /** Called by EngineMonitor when the number of items in transfer changes. */
    fun updateNotification(context: Context, activeCount: Int) {
      if (!Engine.isRunning()) return
      ensureChannels(context)
      context.getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, build(context, activeCount))
    }
  }
}
