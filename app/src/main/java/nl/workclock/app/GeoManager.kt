package nl.workclock.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import org.json.JSONArray
import org.json.JSONObject

object GeoManager {
    private const val PREF = "workclock_native"
    private const val KEY = "places"

    fun hasPrecisePermission(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun hasForegroundPermission(context: Context): Boolean =
        hasPrecisePermission(context) ||
        context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun hasBackgroundPermission(context: Context): Boolean =
        Build.VERSION.SDK_INT < 29 ||
            context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun canRegister(context: Context) = hasPrecisePermission(context) && hasBackgroundPermission(context)

    private const val STATUS = "geofence_status"
    private const val REGISTERED_AT = "geofence_registered_at"
    private const val MAX_REGISTRATION_AGE_MS = 12L * 60L * 60L * 1000L
    fun registrationStatus(context: Context): String = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        .getString(STATUS, "not-configured") ?: "not-configured"
    private fun status(context: Context, value: String) {
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putString(STATUS, value).apply()
    }

    /** Android retains geofences across normal app resumes, but not reboots.
     * Recheck after 12 hours to recover lost registrations without constant churn. */
    fun ensureRegistered(context: Context, onComplete: () -> Unit = {}) {
        val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val active = prefs.getString(STATUS, "") == "active"
        val last = prefs.getLong(REGISTERED_AT, 0L)
        val fresh = last > 0L && System.currentTimeMillis() - last in 0 until MAX_REGISTRATION_AGE_MS
        if (active && fresh && canRegister(context)) onComplete()
        else registerSaved(context, onComplete)
    }

    private var registering = false
    private var registerAgain = false
    private val completionCallbacks = mutableListOf<() -> Unit>()

    private fun pendingIntent(context: Context): PendingIntent {
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
        return PendingIntent.getBroadcast(
            context, 0, Intent(context, GeoReceiver::class.java), flags
        )
    }

    fun syncPlaces(context: Context, json: String) {
        // Verify incoming data before persisting it, and avoid re-registering
        // geofences on every unrelated WorkClock state change.
        try {
            val arr = JSONArray(json)
            if (arr.length() > 100) return
            for (i in 0 until arr.length()) {
                val p = arr.getJSONObject(i)
                val lat = p.getDouble("lat")
                val lon = p.getDouble("lon")
                if (lat !in -90.0..90.0 || lon !in -180.0..180.0) return
                if (p.getString("id").length > 150) return
            }
            val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            if (prefs.getString(KEY, "") == arr.toString()) return
            prefs.edit().putString(KEY, arr.toString()).apply()
            registerSaved(context)
        } catch (e: Exception) {
            Log.w("WorkClock", "Invalid places data", e)
        }
    }

    fun place(context: Context, id: String): JSONObject? {
        val raw = context.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY, "[]")
        val arr = JSONArray(raw)
        for (i in 0 until arr.length()) {
            val item = arr.getJSONObject(i)
            if (item.optString("id") == id) return item
        }
        return null
    }

    @Synchronized
    fun registerSaved(context: Context, onComplete: () -> Unit = {}) {
        completionCallbacks.add(onComplete)
        if (registering) {
            registerAgain = true
            return
        }
        registering = true
        performRegistration(context.applicationContext)
    }

    private fun finishRegistration(context: Context) {
        val rerun: Boolean
        val callbacks: List<() -> Unit>
        synchronized(this) {
            rerun = registerAgain
            registerAgain = false
            if (rerun) callbacks = emptyList()
            else {
                registering = false
                callbacks = completionCallbacks.toList()
                completionCallbacks.clear()
            }
        }
        if (rerun) performRegistration(context)
        else callbacks.forEach { try { it() } catch (_: Exception) {} }
    }

    @SuppressLint("MissingPermission")
    private fun performRegistration(context: Context) {
        if (!canRegister(context)) {
            status(context, if (hasPrecisePermission(context)) "background-permission-needed"
                else "precise-permission-needed")
            finishRegistration(context)
            return
        }
        val client = LocationServices.getGeofencingClient(context)
        val intent = pendingIntent(context)
        try {
            client.removeGeofences(intent).addOnCompleteListener {
                try {
                    val raw = context.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY, "[]")
                    val arr = JSONArray(raw)
                    val geofences = mutableListOf<Geofence>()
                    for (i in 0 until arr.length()) {
                        val place = arr.getJSONObject(i)
                        geofences.add(Geofence.Builder()
                            .setRequestId(place.getString("id"))
                            .setCircularRegion(place.getDouble("lat"), place.getDouble("lon"),
                                maxOf(100f, place.optDouble("radius", 150.0).toFloat()))
                            .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
                            .setExpirationDuration(Geofence.NEVER_EXPIRE)
                            .setNotificationResponsiveness(5 * 60 * 1000)
                            .build())
                    }
                    if (geofences.isEmpty()) {
                        status(context, "no-saved-places")
                        finishRegistration(context)
                    } else {
                        client.addGeofences(GeofencingRequest.Builder()
                            .setInitialTrigger(0)
                            .addGeofences(geofences)
                            .build(), intent).addOnCompleteListener { task ->
                            if (task.isSuccessful) {
                                status(context, "active")
                                context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
                                    .putLong(REGISTERED_AT, System.currentTimeMillis()).apply()
                            }
                            else {
                                val reason = task.exception?.message ?: "unknown Android location error"
                                Log.e("WorkClock", "Geofences not registered", task.exception)
                                status(context, "error: $reason")
                            }
                            finishRegistration(context)
                        }
                    }
                } catch (e: Exception) {
                    Log.e("WorkClock", "Failed to restore geofences", e)
                    status(context, "error: ${e.message ?: e.javaClass.simpleName}")
                    finishRegistration(context)
                }
            }
        } catch (e: Exception) {
            Log.e("WorkClock", "Failed to register geofences", e)
            status(context, "error: ${e.message ?: e.javaClass.simpleName}")
            finishRegistration(context)
        }
    }
}