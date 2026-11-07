package nl.workclock.app

import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** Run with kotlinc alongside WorkAlertPolicy.kt; uses no Android SDK. */
fun main() {
    TimeZone.setDefault(TimeZone.getTimeZone("Europe/Amsterdam"))
    val parse = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US)
    fun at(value: String) = requireNotNull(parse.parse(value)).time

    val friStart = at("2026-11-06 07:00")
    val friExit = at("2026-11-06 16:00")
    val satExit = at("2026-11-07 07:30")
    val friday = "2026-11-06"
    val saturday = "2026-11-07"
    val work = "storiginals"
    fun departure(day: String?, running: Boolean, finished: Boolean,
                  place: String = work, startedAt: Long = friStart,
                  eventAt: Long = friExit, now: Long = friExit + 120_000L) =
        WorkAlertPolicy.allowDeparture(day, running, finished, work, place, startedAt, eventAt, now)

    check(departure(friday, true, false)) { "Running Friday should prompt on Friday exit" }
    check(!departure(friday, false, false)) { "No start: no departure reminder" }
    check(!departure(friday, false, true)) { "Already finished: no reminder" }
    check(!departure(friday, true, true)) { "Finished must override stale running state" }
    check(!departure(friday, true, false, place = "other-work")) { "Other workplace may not end this session" }
    check(!departure(friday, true, false, eventAt = friStart - 120_000L)) { "Old exit before start" }
    check(!departure(friday, true, false, now = satExit, eventAt = friExit)) { "Delayed Friday EXIT on Saturday" }
    check(!departure(friday, false, true, now = satExit, eventAt = satExit)) { "Saturday false exit after Friday finish" }
    check(!departure(friday, true, false, now = satExit, eventAt = satExit)) { "Friday session must not carry into Saturday reminders" }
    check(!departure(saturday, false, false, startedAt = 0L, now = satExit, eventAt = satExit)) { "Saturday with no active session" }
    check(!departure(friday, true, false, eventAt = friStart, now = friExit + 3*60*60*1000L)) { "Stale event cannot interrupt" }
    check(WorkAlertPolicy.allowArrivalRepeat(friday, false, true, satExit, satExit)) { "Arrival on new day may be offered" }
    check(!WorkAlertPolicy.allowArrivalRepeat(saturday, true, false, satExit, satExit)) { "Started: no arrival repeat" }
    check(!WorkAlertPolicy.allowArrivalRepeat(saturday, false, true, satExit, satExit)) { "Finished: no arrival repeat" }
    check(!WorkAlertPolicy.allowArrivalRepeat(friday, false, false, friExit, satExit)) { "Yesterday's arrival repeat cancelled" }
    println("Work alert policy: 15 boundary checks passed (no session, completed, wrong workplace, stale event, Fri-to-Sat).")
}
