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

    fun hasForegroundPermission(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun hasBackgroundPermission(context: Context): Boolean =
        Build.VERSION.SDK_INT < 29 ||
            context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun canRegister(context: Context) = hasForegroundPermission(context) && hasBackgroundPermission(context)

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

    @SuppressLint("MissingPermission")
    fun registerSaved(context: Context, onComplete: () -> Unit = {}) {
        if (!canRegister(context)) { onComplete(); return }
        val client = LocationServices.getGeofencingClient(context)
        // Removing by the same PendingIntent clears fences for places deleted
        // in WorkClock. Recreate afterwards with the new list.
        val intent = pendingIntent(context)
        client.removeGeofences(intent).addOnCompleteListener {
            try {
                val raw = context.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY, "[]")
                val arr = JSONArray(raw)
                val geofences = mutableListOf<Geofence>()
                for (i in 0 until arr.length()) {
                    val place = arr.getJSONObject(i)
                    geofences.add(
                        Geofence.Builder()
                            .setRequestId(place.getString("id"))
                            .setCircularRegion(
                                place.getDouble("lat"), place.getDouble("lon"),
                                maxOf(100f, place.optDouble("radius", 150.0).toFloat())
                            )
                            .setTransitionTypes(
                                Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT
                            )
                            .setExpirationDuration(Geofence.NEVER_EXPIRE)
                            .setNotificationResponsiveness(5 * 60 * 1000)
                            .build()
                    )
                }
                if (geofences.isNotEmpty()) {
                    val request = GeofencingRequest.Builder()
                        .setInitialTrigger(0)
                        .addGeofences(geofences)
                        .build()
                    client.addGeofences(request, intent).addOnCompleteListener { task ->
                        if (!task.isSuccessful) Log.e("WorkClock", "Geofences not registered", task.exception)
                        onComplete()
                    }
                } else {
                    onComplete()
                }
            } catch (e: Exception) {
                Log.e("WorkClock", "Failed to restore geofences", e)
                onComplete()
            }
        }
    }
}