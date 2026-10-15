package nl.workclock.app

import android.Manifest
import android.app.NotificationManager
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var permissionCallback: GeolocationPermissions.Callback? = null
    private var permissionOrigin: String? = null
    private var pendingBackup: String? = null
    private var pageReady = false
    private var screenVisible = false
    private var lastNativeFix: JSONObject? = null
    private lateinit var foregroundLocator: ForegroundLocator
    private lateinit var updater: WorkClockUpdater

    companion object {
        private const val LOCAL_ORIGIN = "https://appassets.androidplatform.net"
        private const val FOREGROUND_PERMISSION = 100
        private const val BACKGROUND_PERMISSION = 101
        private const val NOTIFICATION_PERMISSION = 102
        private const val EXPORT_BACKUP = 200
        private const val IMPORT_BACKUP = 201
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(7, 11, 15)
        window.navigationBarColor = android.graphics.Color.rgb(7, 11, 15)
        updater = WorkClockUpdater(this) { info -> sendToPage("__WorkClockUpdateStatus", info) }
        foregroundLocator = ForegroundLocator(this,
            { fix ->
                lastNativeFix = fix
                sendToPage("__WorkClockNativeLocation", fix)
            },
            { error -> sendToPage("__WorkClockNativeLocationError", error) }
        )
        webView = WebView(this)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setGeolocationEnabled(true)
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
        }
        webView.addJavascriptInterface(Bridge(), "WorkClockAndroid")
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView, request: WebResourceRequest
            ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.toString().startsWith("$LOCAL_ORIGIN/assets/")) return false
                if (request.isForMainFrame && (request.url.scheme == "https" || request.url.scheme == "http")) {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                pageReady = url.startsWith("$LOCAL_ORIGIN/assets/")
                webView.evaluateJavascript("window.__WorkClockAppResume?.();", null)
                lastNativeFix?.let { sendToPage("__WorkClockNativeLocation", it) }
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String, callback: GeolocationPermissions.Callback
            ) {
                val requested = Uri.parse(origin)
                if (requested.scheme != "https" || requested.host != "appassets.androidplatform.net" ||
                    requested.port !in listOf(-1, 443)) {
                    callback.invoke(origin, false, false)
                    return
                }
                if (GeoManager.hasForegroundPermission(this@MainActivity)) {
                    callback.invoke(origin, true, false)
                } else {
                    permissionCallback = callback
                    permissionOrigin = origin
                    requestForegroundLocation()
                }
            }
        }
        setContentView(webView)
        webView.loadUrl("$LOCAL_ORIGIN/assets/index.html")
    }

    override fun onResume() {
        super.onResume()
        screenVisible = true
        // Clear notifications when the user opens WorkClock.
        getSystemService(NotificationManager::class.java)?.cancelAll()
        if (::webView.isInitialized && pageReady) {
            webView.evaluateJavascript("window.__WorkClockAppResume?.();", null)
        }
        GeoManager.registerSaved(this) { runOnUiThread { deliverEvents() } }
        if (::updater.isInitialized) updater.onResume()
        if (::foregroundLocator.isInitialized && GeoManager.hasForegroundPermission(this)) {
            foregroundLocator.start()
        }
    }

    private fun sendToPage(function: String, payload: JSONObject) {
        if (pageReady && ::webView.isInitialized) {
            webView.evaluateJavascript("window.$function?.(${payload});", null)
        }
    }

    private fun deliverEvents() {
        if (::webView.isInitialized) webView.evaluateJavascript(
            "window.__WorkClockNativeSync && window.__WorkClockNativeSync();", null
        )
    }

    private fun requestForegroundLocation() {
        if (!GeoManager.hasForegroundPermission(this)) {
            requestPermissions(
                arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION),
                FOREGROUND_PERMISSION
            )
        } else {
            foregroundLocator.start()
            GeoManager.registerSaved(this)
        }
    }

    private fun requestBackgroundLocation() {
        if (!GeoManager.hasForegroundPermission(this)) {
            requestForegroundLocation()
            return
        }
        if (GeoManager.hasBackgroundPermission(this)) {
            GeoManager.registerSaved(this)
            deliverEvents()
            return
        }
        if (Build.VERSION.SDK_INT == 29) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), BACKGROUND_PERMISSION)
        } else {
            // Android 11+ requires users to select "Allow all the time" in system settings.
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:$packageName")))
        }
    }

    private fun requestNotification() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_PERMISSION)
        else deliverEvents()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == FOREGROUND_PERMISSION) {
            val granted = GeoManager.hasForegroundPermission(this)
            permissionCallback?.invoke(permissionOrigin ?: LOCAL_ORIGIN, granted, false)
            permissionCallback = null
            permissionOrigin = null
            if (granted) {
                foregroundLocator.start()
                GeoManager.registerSaved(this)
            } else {
                sendToPage("__WorkClockNativeLocationError", JSONObject().put("code", "permission")
                    .put("message", "Location permission denied in Android settings."))
            }
        } else if (requestCode == BACKGROUND_PERMISSION) {
            GeoManager.registerSaved(this)
        } else if (requestCode == NOTIFICATION_PERMISSION) {
            if (Build.VERSION.SDK_INT < 33 ||
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            ) deliverEvents()
        }
        deliverEvents()
    }

    @Deprecated("Used for minimal Android Storage Access Framework integration")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != RESULT_OK || data?.data == null) return
        val uri = data.data ?: return
        try {
            when (requestCode) {
                EXPORT_BACKUP -> {
                    contentResolver.openOutputStream(uri)?.bufferedWriter(Charsets.UTF_8)?.use {
                        it.write(pendingBackup ?: "")
                    }
                    pendingBackup = null
                    webView.evaluateJavascript("window.__WorkClockBackupResult?.('Backup saved');", null)
                }
                IMPORT_BACKUP -> {
                    val contents = contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use {
                        it.readText()
                    } ?: return
                    // Safely escape file contents before delivering to the local app.
                    webView.evaluateJavascript(
                        "window.__WorkClockReceiveImport?.(${JSONObject.quote(contents)});", null
                    )
                }
            }
        } catch (ex: Exception) {
            webView.evaluateJavascript(
                "window.__WorkClockBackupResult?.(${JSONObject.quote("Could not open or save the file: ${ex.message}")});", null
            )
        }
    }

    private inner class Bridge {
        @JavascriptInterface fun appVersion(): String = updater.appVersion()
        @JavascriptInterface fun checkForUpdates() {
            runOnUiThread { updater.beginCheck() }
        }
        @JavascriptInterface fun installUpdate() {
            runOnUiThread { updater.beginInstall() }
        }
        @JavascriptInterface fun syncPlaces(json: String) =
            GeoManager.syncPlaces(applicationContext, json)

        @JavascriptInterface fun getEvents(): String = EventStore.read(applicationContext)

        @JavascriptInterface fun acknowledgeEvent(id: String) =
            EventStore.acknowledge(applicationContext, id)

        @JavascriptInterface fun requestBackgroundTracking() {
            runOnUiThread { requestBackgroundLocation() }
        }

        @JavascriptInterface fun requestForegroundTracking() {
            runOnUiThread { requestForegroundLocation() }
        }

        @JavascriptInterface fun requestNotifications() {
            runOnUiThread { requestNotification() }
        }

        @JavascriptInterface fun testNotification() {
            runOnUiThread { GeoReceiver.test(this@MainActivity) }
        }

        @JavascriptInterface fun showNotification(title: String, body: String, tag: String) {
            runOnUiThread { if (!screenVisible) GeoReceiver.show(this@MainActivity, title, body, tag) }
        }

        @JavascriptInterface fun refreshLocation() {
            runOnUiThread { foregroundLocator.start() }
        }

        @JavascriptInterface fun permissionStatus(): String = JSONObject()
            .put("location", GeoManager.hasForegroundPermission(applicationContext))
            .put("precise", GeoManager.hasPrecisePermission(applicationContext))
            .put("background", GeoManager.hasBackgroundPermission(applicationContext))
            .put("services", ForegroundLocator.servicesEnabled(applicationContext))
            .put("geofences", GeoManager.registrationStatus(applicationContext))
            .put("notification", Build.VERSION.SDK_INT < 33 ||
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
            .toString()

        @JavascriptInterface fun exportBackup(json: String) {
            runOnUiThread {
                pendingBackup = json
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/json")
                    .putExtra(Intent.EXTRA_TITLE, "workclock-backup.json")
                startActivityForResult(intent, EXPORT_BACKUP)
            }
        }

        @JavascriptInterface fun importBackup() {
            runOnUiThread {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/json")
                startActivityForResult(intent, IMPORT_BACKUP)
            }
        }
    }

    override fun onBackPressed() {
        // WebView tabs are not browser history: close sheets, then return Today.
        if (::webView.isInitialized && pageReady) {
            webView.evaluateJavascript("window.__WorkClockHandleBack?.() === true") { handled ->
                if (handled != "true") {
                    if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
                }
            }
        } else super.onBackPressed()
    }

    override fun onPause() {
        screenVisible = false
        if (::foregroundLocator.isInitialized) foregroundLocator.stop()
        super.onPause()
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface("WorkClockAndroid")
        webView.destroy()
        super.onDestroy()
    }
}