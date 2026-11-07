package nl.workclock.app

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Pure policy for when a GPS transition may interrupt someone about work.
 *  A geofence crossing is not evidence that the employee has an open shift.
 *  Using the current local day also rejects delayed events from yesterday.
 */
object WorkAlertPolicy {
    private const val MAX_EVENT_DELAY_MS = 2 * 60 * 60 * 1000L
    private const val CLOCK_TOLERANCE_MS = 60 * 1000L

    fun localDay(at: Long): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(at))

    fun validTodayEvent(eventAt: Long, now: Long): Boolean =
        eventAt > 0L &&
        eventAt <= now + CLOCK_TOLERANCE_MS &&
        now - eventAt <= MAX_EVENT_DELAY_MS &&
        localDay(eventAt) == localDay(now)

    fun allowDeparture(
        sessionDay: String?, running: Boolean, finished: Boolean,
        workplaceId: String?, eventPlaceId: String, sessionStartedAt: Long,
        eventAt: Long, now: Long
    ): Boolean {
        if (!running || finished || sessionDay != localDay(now)) return false
        if (!validTodayEvent(eventAt, now)) return false
        if (!workplaceId.isNullOrBlank() && workplaceId != eventPlaceId) return false
        if (sessionStartedAt > 0L && eventAt < sessionStartedAt - CLOCK_TOLERANCE_MS) return false
        return true
    }

    /** Arrival reminders are unnecessary once today's work is started or finished. */
    fun allowArrivalRepeat(
        sessionDay: String?, running: Boolean, finished: Boolean,
        eventAt: Long, now: Long
    ): Boolean = validTodayEvent(eventAt, now) &&
        (sessionDay != localDay(now) || (!running && !finished))
}
