package fi.synkka.engine

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.DocumentsContract
import android.provider.Settings
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
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

    /** Localized notification texts (copy lives in fi.json on the JS side). */
    Function("setNotificationTexts") { texts: Map<String, String> ->
      EngineService.setTexts(context, texts)
    }

    Function("openNotificationSettings") { channelId: String ->
      val intent = if (Build.VERSION.SDK_INT >= 26) {
        Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
          .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
          .putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
      }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      Unit
    }

    /** Opens a synced file in another app. Returns false when no app can open it. */
    Function("openFile") { path: String ->
      val file = File(path)
      if (!file.isFile) throw IllegalStateException("Not a file: $path")
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.synkka.files", file)
      val ext = file.extension.lowercase()
      val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "*/*"
      val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(Intent.createChooser(intent, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      } catch (_: Exception) {
        false
      }
    }

    /**
     * Opens a folder in the device's file manager. Tries Samsung My Files, then the system
     * Files app (DocumentsUI) on the shared-storage document for that path.
     */
    Function("openFolder") { path: String ->
      val root = Environment.getExternalStorageDirectory().absolutePath
      if (!path.startsWith(root)) throw IllegalStateException("Not on shared storage: $path")
      val rel = path.removePrefix(root).trimStart('/')
      val docUri = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:$rel")
      val attempts = listOf(
        Intent("samsung.myfiles.intent.action.LAUNCH_MY_FILES")
          .setPackage("com.sec.android.app.myfiles")
          .putExtra("samsung.myfiles.intent.extra.START_PATH", path),
        Intent(Intent.ACTION_VIEW).setDataAndType(docUri, DocumentsContract.Document.MIME_TYPE_DIR),
        Intent(Intent.ACTION_VIEW).setDataAndType(docUri, "vnd.android.document/root"),
      )
      for (intent in attempts) {
        try {
          context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
          return@Function true
        } catch (_: Exception) {
        }
      }
      false
    }
  }
}
