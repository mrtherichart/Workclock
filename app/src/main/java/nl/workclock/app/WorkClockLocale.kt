package nl.workclock.app

import android.app.LocaleManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.LocaleList
import java.util.Locale

/** Single locale preference for the WebView UI and Android background notifications.
 * Android 13+ also exposes the five supported languages in system app settings.
 * On older devices (including Android 10), preferences remain private to WorkClock.
 */
object WorkClockLocale {
    private const val PREFS = "workclock_native"
    private const val KEY = "ui_language"
    private val supported = setOf("en", "nl", "de", "fr", "es")

    private fun checked(value: String?): String {
        val code = (value ?: "").substringBefore('-').substringBefore('_').lowercase(Locale.ROOT)
        return if (code in supported) code else "auto"
    }

    fun preference(context: Context): String {
        if (Build.VERSION.SDK_INT >= 33) {
            val manager = context.getSystemService(LocaleManager::class.java)
            val override = manager?.applicationLocales?.get(0)?.language
            val chosen = checked(override)
            if (chosen != "auto") return chosen
        }
        return checked(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, "auto"))
    }

    fun deviceLanguage(): String = checked(
        if (Build.VERSION.SDK_INT >= 24)
            android.content.res.Resources.getSystem().configuration.locales.get(0)?.language
        else Locale.getDefault().language
    ).let { if (it == "auto") "en" else it }

    fun current(context: Context): String = preference(context).let { if (it == "auto") deviceLanguage() else it }

    fun setPreference(context: Context, value: String) {
        val chosen = checked(value)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY, chosen).apply()
        if (Build.VERSION.SDK_INT >= 33) {
            val manager = context.getSystemService(LocaleManager::class.java)
            manager?.applicationLocales = if (chosen == "auto") LocaleList.getEmptyLocaleList()
                else LocaleList.forLanguageTags(chosen)
        }
    }

    private fun localizedContext(context: Context): Context {
        val locale = Locale.forLanguageTag(current(context))
        val configuration = Configuration(context.resources.configuration)
        configuration.setLocale(locale)
        return context.createConfigurationContext(configuration)
    }

    fun text(context: Context, id: Int): String = localizedContext(context).getString(id)

    fun arrivedAt(context: Context, place: String): String = when (current(context)) {
        "nl" -> "Aangekomen bij $place"
        "de" -> "Angekommen bei $place"
        "fr" -> "Arrivé à $place"
        "es" -> "Llegada a $place"
        else -> "Arrived at $place"
    }

    fun left(context: Context, place: String): String = when (current(context)) {
        "nl" -> "$place verlaten"
        "de" -> "$place verlassen"
        "fr" -> "Départ de $place"
        "es" -> "Salida de $place"
        else -> "Left $place"
    }
}
