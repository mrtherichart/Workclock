package nl.workclock.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale
import kotlin.concurrent.thread

/**
 * Small, no-background-service updater. GitHub Releases metadata is fetched over HTTPS;
 * the APK is SHA-256 checked before handing it to Android's Package Installer.
 * A new signature from the old ephemeral debug builds is never offered as an in-place update.
 */
class WorkClockUpdater(
    private val activity: MainActivity,
    private val send: (JSONObject) -> Unit
) {
    companion object {
        private const val API = "https://api.github.com/repos/mrtherichart/Workclock/releases/latest"
        private const val DOWNLOAD_PREFIX = "https://github.com/mrtherichart/Workclock/releases/download/"
        private const val ASSET = "WorkClock.apk"
        private const val MAX_BYTES = 80L * 1024L * 1024L
        private const val PINNED_CERT = "d321aebe6255506998d22009a6d46deb98a41c34717839ea4ec0a5e77faa3209"
    }

    private data class Candidate(val version: String, val url: String, val sha256: String)
    private val ui = Handler(Looper.getMainLooper())
    @Volatile private var candidate: Candidate? = null
    @Volatile private var busy = false
    private var pendingInstall: File? = null

    private fun versionName(): String = try {
        activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: "unknown"
    } catch (_: Exception) { "unknown" }

    private fun versionCode(): Long = try {
        val info = activity.packageManager.getPackageInfo(activity.packageName, 0)
        if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
    } catch (_: Exception) { 0 }

    fun appVersion(): String = versionName()

    fun beginCheck() {
        if (busy) return
        busy = true
        notify("checking", "Checking GitHub for an update…")
        thread(name = "WorkClock-update-check") {
            try {
                val data = JSONObject(readText(API))
                val tag = data.optString("tag_name").removePrefix("v")
                val assets = data.getJSONArray("assets")
                var entry: JSONObject? = null
                for (i in 0 until assets.length()) {
                    val a = assets.getJSONObject(i)
                    if (a.optString("name") == ASSET && a.optString("state") == "uploaded") {
                        entry = a; break
                    }
                }
                if (entry == null) throw IllegalStateException("The latest GitHub release contains no WorkClock APK.")
                val url = entry.getString("browser_download_url")
                if (!url.startsWith(DOWNLOAD_PREFIX) || !url.endsWith("/" + ASSET))
                    throw IllegalStateException("Unexpected APK download address.")
                val digest = entry.optString("digest")
                if (!digest.matches(Regex("sha256:[0-9a-fA-F]{64}")))
                    throw IllegalStateException("GitHub hasn't provided an APK checksum yet.")
                if (compareVersions(tag, versionName()) <= 0) {
                    candidate = null
                    notify("current", "WorkClock ${versionName()} is up to date.", tag)
                } else if (!hasStableSignature()) {
                    candidate = null
                    notify("migration", "One-time change of signing key needed. First export a backup in Settings. Then uninstall this test app and install the stable release from GitHub. Future updates will work here without deleting data.", tag)
                } else {
                    candidate = Candidate(tag, url, digest.removePrefix("sha256:").lowercase(Locale.US))
                    notify("available", "WorkClock $tag is available.", tag)
                }
            } catch (e: Exception) {
                candidate = null
                notify("error", "Update check failed: ${e.message ?: "network error"}")
            } finally { busy = false }
        }
    }

    fun beginInstall() {
        val target = candidate ?: run {
            notify("error", "Check for updates first.")
            return
        }
        if (busy) return
        if (!hasStableSignature()) {
            notify("migration", "This test build has a different signing key. Export a backup, uninstall it, then install the stable WorkClock release.", target.version)
            return
        }
        busy = true
        notify("downloading", "Downloading WorkClock ${target.version}…", target.version)
        thread(name = "WorkClock-update-download") {
            val dest = File(activity.cacheDir, "updates/WorkClock.apk")
            val temp = File(activity.cacheDir, "updates/WorkClock.apk.part")
            try {
                temp.parentFile?.mkdirs()
                val digest = MessageDigest.getInstance("SHA-256")
                val connection = connect(target.url)
                val total = connection.contentLengthLong
                if (total > MAX_BYTES) throw IllegalStateException("The update is unexpectedly large.")
                var copied = 0L
                connection.inputStream.use { input ->
                    temp.outputStream().use { out ->
                        val buf = ByteArray(16 * 1024)
                        while (true) {
                            val count = input.read(buf)
                            if (count == -1) break
                            copied += count
                            if (copied > MAX_BYTES) throw IllegalStateException("APK exceeds the download size limit.")
                            out.write(buf, 0, count)
                            digest.update(buf, 0, count)
                        }
                    }
                }
                connection.disconnect()
                val actual = digest.digest().joinToString("") { "%02x".format(it) }
                if (!MessageDigest.isEqual(actual.toByteArray(), target.sha256.toByteArray()))
                    throw IllegalStateException("APK checksum mismatch: update rejected.")
                val archive = activity.packageManager.getPackageArchiveInfo(temp.absolutePath, 0)
                    ?: throw IllegalStateException("Downloaded file is not a valid Android APK.")
                if (archive.packageName != activity.packageName)
                    throw IllegalStateException("The update belongs to a different app.")
                val archiveCode = if (Build.VERSION.SDK_INT >= 28) archive.longVersionCode
                    else archive.versionCode.toLong()
                if (archiveCode <= versionCode())
                    throw IllegalStateException("The downloaded APK isn't newer than this installation.")
                if (dest.exists()) dest.delete()
                if (!temp.renameTo(dest)) throw IllegalStateException("Could not finish saving the APK.")
                ui.post {
                    pendingInstall = dest
                    notify("installing", "Download verified. Confirm installation when Android asks.", target.version)
                    launchInstaller()
                }
            } catch (e: Exception) {
                temp.delete()
                notify("error", "Update failed: ${e.message ?: "download error"}", target.version)
            } finally { busy = false }
        }
    }

    fun onResume() {
        if (pendingInstall != null && activity.packageManager.canRequestPackageInstalls()) {
            ui.post { launchInstaller() }
        }
    }

    private fun launchInstaller() {
        val apk = pendingInstall ?: return
        if (!activity.packageManager.canRequestPackageInstalls()) {
            notify("permission", "Allow WorkClock to install updates in Android settings, then return to WorkClock.")
            try {
                activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${activity.packageName}")))
            } catch (_: ActivityNotFoundException) {
                activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:${activity.packageName}")))
            }
            return
        }
        pendingInstall = null
        val uri = FileProvider.getUriForFile(activity,
            "${activity.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try {
            activity.startActivity(intent)
        } catch (e: Exception) {
            notify("error", "Android couldn't open Package Installer: ${e.message}")
        }
    }

    private fun hasStableSignature(): Boolean = try {
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES
            else PackageManager.GET_SIGNATURES
        val info = activity.packageManager.getPackageInfo(activity.packageName, flags)
        val signatures = if (Build.VERSION.SDK_INT >= 28)
            info.signingInfo?.apkContentsSigners
        else info.signatures
        signatures?.any { s ->
            val hex = MessageDigest.getInstance("SHA-256").digest(s.toByteArray())
                .joinToString("") { "%02x".format(it) }
            hex.equals(PINNED_CERT, ignoreCase = true)
        } ?: false
    } catch (_: Exception) { false }

    private fun readText(url: String): String {
        val connection = connect(url)
        return try {
            connection.inputStream.bufferedReader().use { it.readText().also { s ->
                if (s.length > 1024 * 1024) throw IllegalStateException("Update metadata is too large.")
            } }
        } finally { connection.disconnect() }
    }

    private fun connect(address: String): HttpURLConnection {
        var current = URL(address)
        repeat(7) {
            if (current.protocol != "https") throw IllegalStateException("Non-HTTPS update address rejected.")
            val host = current.host.lowercase(Locale.US)
            if (host != "api.github.com" && host != "github.com" &&
                host != "release-assets.githubusercontent.com" &&
                host != "objects.githubusercontent.com")
                throw IllegalStateException("Unexpected update download host.")
            val connection = (current.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 15000
                readTimeout = 30000
                setRequestProperty("Accept", "application/vnd.github+json")
                setRequestProperty("User-Agent", "WorkClock-Android-Updater")
                connect()
            }
            val status = connection.responseCode
            if (status in 300..399) {
                val target = connection.getHeaderField("Location")
                    ?: throw IllegalStateException("GitHub redirect has no destination.")
                connection.disconnect()
                current = URL(current, target)
            } else {
                if (status != 200) {
                    connection.disconnect()
                    if (status == 404) throw IllegalStateException("No stable release is published yet.")
                    throw IllegalStateException("GitHub returned HTTP $status.")
                }
                return connection
            }
        }
        throw IllegalStateException("Too many redirects while downloading update.")
    }

    private fun compareVersions(first: String, second: String): Int {
        fun parts(v: String): List<Int> {
            val values = v.split(".")
            if (values.size != 3 || values.any { !it.matches(Regex("[0-9]{1,5}")) })
                throw IllegalStateException("Unexpected WorkClock version: $v")
            return values.map { it.toInt() }
        }
        val a = parts(first)
        val b = parts(second)
        for (i in 0..2) if (a[i] != b[i]) return a[i].compareTo(b[i])
        return 0
    }

    private fun notify(state: String, message: String, version: String = "") {
        val json = JSONObject().put("state", state).put("message", message)
            .put("current", versionName()).put("latest", version)
        ui.post { send(json) }
    }
}