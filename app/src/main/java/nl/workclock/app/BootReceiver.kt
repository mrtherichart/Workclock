package nl.workclock.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Android removes geofences on reboot; restore them without opening WebView. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            // Pending alarms do not survive a reboot; do not retain phantom alerts.
            WorkReminderScheduler.resolve(context.applicationContext, null)
            val pending = goAsync()
            GeoManager.registerSaved(context.applicationContext) { pending.finish() }
        }
    }
}