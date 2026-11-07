package nl.workclock.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.net.Uri
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent

class GeoReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError()) return
        val transition = when (event.geofenceTransition) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> "ENTER"
            Geofence.GEOFENCE_TRANSITION_EXIT -> "EXIT"
            else -> return
        }
        val prefs = context.getSharedPreferences("workclock_native", Context.MODE_PRIVATE)
        event.triggeringGeofences?.forEach { geofence ->
            val placeId = geofence.requestId
            val place = GeoManager.place(context, placeId) ?: return@forEach
            val triggerTime = event.triggeringLocation?.time ?: 0L
            val now = System.currentTimeMillis()
            val eventTime = if (triggerTime in 1L..(now + 60_000L)) triggerTime else now
            EventStore.append(context, placeId, transition, eventTime)
            val label = place.optString("name", "this place")
            val type = place.optString("type")
            if (type == "work" && transition == "ENTER") {
                prefs.edit().putString("pending_work", placeId).apply()
                val tag = "arrive-$placeId"
                prefs.edit().putLong("recent_enter:$placeId", eventTime).apply()
                if (WorkAlertPolicy.allowArrivalRepeat(
                        prefs.getString("session_day", null),
                        prefs.getBoolean("session_running", false),
                        prefs.getBoolean("session_finished", false), eventTime, now)) {
                    show(context, "Arrived at $label", "Check whether you started work.", tag)
                    WorkReminderScheduler.start(context, tag, "Arrived at $label", "Check whether you started work.", eventTime)
                }
            } else if (type == "work" && transition == "EXIT") {
                val tag = "leave-$placeId"
                prefs.edit().putLong("recent_exit:$placeId", eventTime).apply()
                if (WorkAlertPolicy.allowDeparture(
                        prefs.getString("session_day", null),
                        prefs.getBoolean("session_running", false),
                        prefs.getBoolean("session_finished", false),
                        prefs.getString("session_workplace", null), placeId,
                        prefs.getLong("session_started_at", 0L), eventTime, now)) {
                    show(context, "Left $label", "Check whether you finished work.", tag)
                    WorkReminderScheduler.start(context, tag, "Left $label", "Check whether you finished work.", eventTime)
                }
            } else if (type == "home" && transition == "ENTER" && prefs.contains("pending_work")) {
                prefs.edit().remove("pending_work").apply()
                show(context, "Arrived home", "Open WorkClock to complete your return trip.", "home-$placeId")
            }
        }
    }

    companion object {
    fun show(context: Context, title: String, body: String, tag: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel("workclock", "Work and travel", NotificationManager.IMPORTANCE_DEFAULT)
        )
        val strong = tag == "strong-test" || (WorkReminderScheduler.enabled(context) &&
            (tag.startsWith("arrive-") || tag.startsWith("leave-")))
        if (strong) {
            // Channel attributes are immutable after creation, so use a separate ID.
            val channel = NotificationChannel("workclock_strong_v1", "Persistent work alerts",
                NotificationManager.IMPORTANCE_HIGH)
            channel.description = "Workplace arrival and departure; vibration only, no sound"
            channel.setSound(null, null)
            channel.enableVibration(true)
            channel.setVibrationPattern(longArrayOf(0L) + LongArray(19) { 500L })
            manager.createNotificationChannel(channel)
        }
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java).addFlags(
                Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            ), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = NotificationCompat.Builder(context, if (strong) "workclock_strong_v1" else "workclock")
            .setPriority(if (strong) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setTimeoutAfter(2 * 60 * 60 * 1000L)
        val arrive = tag.startsWith("arrive-")
        val leave = tag.startsWith("leave-")
        val placeId = when {
            arrive -> tag.removePrefix("arrive-")
            leave -> tag.removePrefix("leave-")
            else -> ""
        }
        if (arrive || leave) {
            val actions = if (arrive) listOf(
                "START_NOW" to "Start now", "START_EARLIER" to "Earlier…",
                "NOT_WORKING" to "Not working"
            ) else listOf(
                "FINISH_NOW" to "Finish now", "FINISH_EARLIER" to "Earlier…",
                "STILL_WORKING" to "Still working"
            )
            for ((decision, label) in actions) {
                val actionIntent = Intent(context, ReminderActionReceiver::class.java).apply {
                    data = Uri.parse("workclock://reminder/$decision/${Uri.encode(tag)}")
                    putExtra("decision", decision)
                    putExtra("placeId", placeId)
                    putExtra("notificationTag", tag)
                }
                val action = PendingIntent.getBroadcast(context, 0, actionIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                builder.addAction(android.R.drawable.ic_menu_edit, label, action)
            }
        }
        manager.notify(tag, 1, builder.build())
    }

        fun testStrong(context: Context) {
            // Uses the same Android vibration channel as real work alerts.
            // A test is never registered with WorkReminderScheduler.
            show(context, "WorkClock vibration test", "Ten pulses, no repeat reminders.", "strong-test")
        }

        fun test(context: Context) {
            val intent = Intent(context, MainActivity::class.java)
            val pending = PendingIntent.getActivity(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel("workclock", "Work and travel", NotificationManager.IMPORTANCE_DEFAULT)
            )
            if (Build.VERSION.SDK_INT >= 33 &&
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) return
            manager.notify("test", 1, NotificationCompat.Builder(context, "workclock")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("WorkClock")
                .setContentText("Notifications are working on this device.")
                .setContentIntent(pending).setAutoCancel(true).setTimeoutAfter(30_000L).build())
        }
    }
}