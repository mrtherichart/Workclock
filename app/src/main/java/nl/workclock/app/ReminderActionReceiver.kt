package nl.workclock.app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** A notification action is a user decision, not an inferred work timestamp.
 * Queue the original tap time while WorkClock is closed, then open its review UI. */
class ReminderActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val decision = intent.getStringExtra("decision") ?: return
        if (decision !in setOf("START_NOW","START_EARLIER","NOT_WORKING",
                "FINISH_NOW","FINISH_EARLIER","STILL_WORKING")) return
        val placeId = intent.getStringExtra("placeId") ?: ""
        if (placeId.length > 150) return
        EventStore.appendAction(context, placeId, decision, System.currentTimeMillis())
        val tag = intent.getStringExtra("notificationTag")
        if (tag != null) context.getSystemService(NotificationManager::class.java)?.cancel(tag, 1)
        try {
            context.startActivity(Intent(context, MainActivity::class.java).addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP))
        } catch (_: Exception) {
            // Decision remains in EventStore until the user opens the app.
        }
    }
}
