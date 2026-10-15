package nl.workclock.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Handler
import android.os.Looper
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import org.json.JSONObject

/** Foreground-only fix provider. The HTML never needs to ask WebView for GPS in the APK. */
class ForegroundLocator(
    private val activity: Activity,
    private val onFix: (JSONObject) -> Unit,
    private val onError: (JSONObject) -> Unit
) {
    private val client = LocationServices.getFusedLocationProviderClient(activity)
    private val handler = Handler(Looper.getMainLooper())
    private var listening = false
    private var pending: CancellationTokenSource? = null
    private var attempt = 0
    private var lastFix: Location? = null

    companion object {
        fun servicesEnabled(context: Context): Boolean {
            val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            return manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        }
    }

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let { report(it) }
        }
    }

    private fun error(code: String, message: String) = onError(
        JSONObject().put("code", code).put("message", message)
    )

    private fun report(location: Location) {
        if (location.latitude !in -90.0..90.0 || location.longitude !in -180.0..180.0) return
        if (location.time <= (lastFix?.time ?: 0L)) return
        lastFix = location
        onFix(JSONObject()
            .put("lat", location.latitude)
            .put("lon", location.longitude)
            .put("accuracy", if (location.hasAccuracy()) location.accuracy.toDouble() else 0.0)
            .put("at", location.time))
    }

    @SuppressLint("MissingPermission")
    fun start() {
        if (!GeoManager.hasForegroundPermission(activity)) {
            error("permission", "WorkClock has no Android location permission. Tap Enable location and allow location access.")
            return
        }
        if (!servicesEnabled(activity)) {
            error("services", "Phone location services are off. Enable Location in Android quick settings.")
            return
        }
        if (!listening) {
            try {
                val request = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 60_000L)
                    .setMinUpdateIntervalMillis(20_000L)
                    .build()
                client.requestLocationUpdates(request, callback, Looper.getMainLooper())
                    .addOnFailureListener { error("provider", "Android could not start location updates: ${it.message ?: "location provider unavailable"}") }
                listening = true
            } catch (e: Exception) {
                error("provider", "Android location updates failed: ${e.message ?: e.javaClass.simpleName}")
            }
        }
        refresh()
    }

    @SuppressLint("MissingPermission")
    fun refresh() {
        if (!GeoManager.hasForegroundPermission(activity)) {
            error("permission", "Android location access is not granted. Enable it in WorkClock's app permissions.")
            return
        }
        if (!servicesEnabled(activity)) {
            error("services", "Phone location services are switched off. Turn on Location and try again.")
            return
        }
        val thisAttempt = ++attempt
        val beforeRequest = lastFix?.time ?: 0L
        pending?.cancel()
        val cancellation = CancellationTokenSource()
        pending = cancellation
        try {
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellation.token)
                .addOnSuccessListener { location ->
                    if (thisAttempt != attempt) return@addOnSuccessListener
                    if (location != null) report(location)
                    else if (lastFix?.time == beforeRequest) {
                        error("no-fix", "Location is permitted, but Android has no current GPS fix. Try again near a window with Location enabled.")
                    }
                }
                .addOnFailureListener { ex ->
                    if (thisAttempt == attempt) error("provider", "Android location failed: ${ex.message ?: ex.javaClass.simpleName}")
                }
            handler.postDelayed({
                if (thisAttempt == attempt && lastFix?.time == beforeRequest) {
                    cancellation.cancel()
                    error("timeout", "Location is allowed but no position arrived within 20 seconds. Check Android Location services and try again.")
                }
            }, 20_000L)
        } catch (e: SecurityException) {
            error("permission", "Android revoked location access. Re-enable it in app settings.")
        } catch (e: Exception) {
            error("provider", "Location request failed: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    fun stop() {
        attempt++
        pending?.cancel()
        pending = null
        if (listening) client.removeLocationUpdates(callback)
        listening = false
    }
}