package nl.workclock.app

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri

/** Bounded Android-native reminders for workplace arrival and departure only.
 *  The initial notification is sent by GeoReceiver; at most three later alerts
 *  are requested, around 10, 20 and 30 minutes. Doze may delay delivery.
 */
object WorkReminderScheduler {
    private const val PREF = "workclock_native"
    private const val ACTIVE = "followup:"
    private const val STAGE = "followup_stage:"
    private const val TITLE = "followup_title:"
    private const val BODY = "followup_body:"
    private const val INTERVAL = 10 * 60 * 1000L
    private const val MAX_STAGE = 3

    fun enabled(context: Context): Boolean = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        .getBoolean("strong_reminders", false)

    fun setEnabled(context: Context, value: Boolean) {
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putBoolean("strong_reminders", value).apply()
        if (!value) resolve(context, null)
    }

    private fun alarmIntent(context: Context, tag: String, stage: Int): PendingIntent {
        val intent = Intent(context, ReminderRepeatReceiver::class.java).apply {
            // PendingIntent identity must be distinct for each workplace/tag.
            data = Uri.parse("workclock://repeat/${Uri.encode(tag)}")
            putExtra("tag", tag)
            putExtra("stage", stage)
        }
        return PendingIntent.getBroadcast(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun schedule(context: Context, tag: String, dueAt: Long, stage: Int) {
        if (stage > MAX_STAGE) return
        val manager = context.getSystemService(AlarmManager::class.java) ?: return
        val due = maxOf(dueAt, System.currentTimeMillis() + 1000L)
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, due, alarmIntent(context, tag, stage))
    }

    fun start(context: Context, tag: String, title: String, body: String) {
        if (!enabled(context) || !(tag.startsWith("arrive-") || tag.startsWith("leave-"))) return
        if (context.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() != true) return
        val started = System.currentTimeMillis()
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putLong(ACTIVE + tag, started)
            .putInt(STAGE + tag, 1)
            .putString(TITLE + tag, title)
            .putString(BODY + tag, body).apply()
        schedule(context, tag, started + INTERVAL, 1)
    }

    fun repeat(context: Context, tag: String, stage: Int) {
        if (!enabled(context) || stage !in 1..MAX_STAGE) return
        val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val started = prefs.getLong(ACTIVE + tag, 0L)
        if (started == 0L || prefs.getInt(STAGE + tag, 0) != stage) return
        val title = prefs.getString(TITLE + tag, "WorkClock reminder") ?: "WorkClock reminder"
        val body = prefs.getString(BODY + tag, "Confirm your work hours.") ?: "Confirm your work hours."
        val now = System.currentTimeMillis()
        // Don't deliver a cluster of stale alarms after Doze delays a wakeup.
        if (now - started > MAX_STAGE * INTERVAL + 60_000L) return
        GeoReceiver.show(context, title, body, tag)
        prefs.edit().putInt(STAGE + tag, stage + 1).apply()
        val next = maxOf(started + (stage + 1) * INTERVAL, now + INTERVAL)
        if (stage < MAX_STAGE && next <= started + MAX_STAGE * INTERVAL) {
            schedule(context, tag, next, stage + 1)
        }
    }

    /** scope is "arrive", "leave", or null for both. */
    fun resolve(context: Context, scope: String?) {
        val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val tags = prefs.all.keys.filter { it.startsWith(ACTIVE) }
            .map { it.removePrefix(ACTIVE) }
            .filter { scope == null || it.startsWith("$scope-") }
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        val notifications = context.getSystemService(NotificationManager::class.java)
        val edit = prefs.edit()
        for (tag in tags) {
            alarmManager?.cancel(alarmIntent(context, tag, 1))
            notifications?.cancel(tag, 1)
            edit.remove(ACTIVE + tag).remove(STAGE + tag).remove(TITLE + tag).remove(BODY + tag)
        }
        edit.apply()
    }
}

class ReminderRepeatReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val tag = intent.getStringExtra("tag") ?: return
        if (tag.length > 180 || !(tag.startsWith("arrive-") || tag.startsWith("leave-"))) return
        WorkReminderScheduler.repeat(context, tag, intent.getIntExtra("stage", 0))
    }
}
