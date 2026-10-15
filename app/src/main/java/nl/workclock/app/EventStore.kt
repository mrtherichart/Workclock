package nl.workclock.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Keep geofence transitions until the UI acknowledges them. */
object EventStore {
    private const val PREF = "workclock_native"
    private const val KEY = "events"

    @Synchronized fun append(context: Context, placeId: String, transition: String) {
        val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val all = JSONArray(prefs.getString(KEY, "[]"))
        val record = JSONObject()
            .put("id", UUID.randomUUID().toString())
            .put("placeId", placeId)
            .put("transition", transition)
            .put("at", System.currentTimeMillis())
        all.put(record)
        val limited = JSONArray()
        for (i in maxOf(0, all.length() - 100) until all.length()) limited.put(all.get(i))
        prefs.edit().putString(KEY, limited.toString()).apply()
    }

    @Synchronized fun read(context: Context): String =
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY, "[]") ?: "[]"

    @Synchronized fun acknowledge(context: Context, id: String) {
        val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val arr = JSONArray(prefs.getString(KEY, "[]"))
        val remaining = JSONArray()
        for (i in 0 until arr.length()) {
            val event = arr.getJSONObject(i)
            if (event.optString("id") != id) remaining.put(event)
        }
        prefs.edit().putString(KEY, remaining.toString()).apply()
    }
}