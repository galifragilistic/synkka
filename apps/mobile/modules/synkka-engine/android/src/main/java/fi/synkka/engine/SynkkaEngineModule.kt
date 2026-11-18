package fi.synkka.engine

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class SynkkaEngineModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context not available" }

  override fun definition() = ModuleDefinition {
    Name("SynkkaEngine")

    AsyncFunction("start") {
      Engine.ensureCredentials(context)
      val intent = Intent(context, EngineService::class.java)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      mapOf("port" to Engine.port, "apiKey" to Engine.apiKey)
    }

    AsyncFunction("stop") {
      val intent = Intent(context, EngineService::class.java).setAction(EngineService.ACTION_STOP)
      context.startService(intent)
      Unit
    }

    Function("isRunning") { Engine.isRunning() }

    AsyncFunction("rename") { from: String, to: String, overwrite: Boolean ->
      val src = File(from)
      val dst = File(to)
      if (!src.exists()) throw IllegalStateException("Source missing: $from")
      dst.parentFile?.mkdirs()
      if (dst.exists()) {
        if (!overwrite) throw IllegalStateException("Destination exists: $to")
        if (!dst.delete()) throw IllegalStateException("Cannot replace: $to")
      }
      if (!src.renameTo(dst)) {
        src.copyTo(dst, overwrite = true)
        if (!src.delete()) throw IllegalStateException("Copied but could not remove: $from")
      }
      Unit
    }

    AsyncFunction("diskUsage") {
      val stat = StatFs(Environment.getExternalStorageDirectory().absolutePath)
      val total = stat.totalBytes
      mapOf("usedBytes" to (total - stat.availableBytes).toDouble(), "totalBytes" to total.toDouble())
    }

    Function("hasAllFilesAccess") {
      if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager() else true
    }

    Function("requestAllFilesAccess") {
      if (Build.VERSION.SDK_INT >= 30) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          context.startActivity(intent)
        } catch (_: Exception) {
          context.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
      }
      Unit
    }

    Function("networkType") {
      val cm = context.getSystemService(ConnectivityManager::class.java)
      val caps = cm?.getNetworkCapabilities(cm.activeNetwork)
      when {
        caps == null -> "offline"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "wifi"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
        else -> "wifi"
      }
    }

    Function("deviceModel") { Build.MODEL ?: "Android" }
  }
}
