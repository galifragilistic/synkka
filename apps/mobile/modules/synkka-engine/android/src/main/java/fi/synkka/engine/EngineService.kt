package fi.synkka.engine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** Foreground service that keeps the Syncthing engine alive while the app is in the background. */
class EngineService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      Engine.stopProcess()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    Engine.startProcess(applicationContext)
    return START_STICKY
  }

  override fun onDestroy() {
    Engine.stopProcess()
    super.onDestroy()
  }

  private fun buildNotification(): Notification {
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Synkronointi", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Pitää synkronoinnin käynnissä taustalla"
          setShowBadge(false)
        },
      )
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pi = launch?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this)
    return builder
      .setSmallIcon(android.R.drawable.ic_popup_sync)
      .setContentTitle("Synkka")
      .setContentText("Synkronointi käynnissä")
      .setOngoing(true)
      .setContentIntent(pi)
      .build()
  }

  companion object {
    const val ACTION_STOP = "fi.synkka.engine.STOP"
    private const val CHANNEL_ID = "synkka_engine"
    private const val NOTIFICATION_ID = 4711
  }
}
