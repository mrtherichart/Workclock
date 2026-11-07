# WorkClock

WorkClock is an Android app for recording working hours and travel kilometres. It keeps your records on your phone and puts them into a weekly table you can copy onto a work slip.

You can enter hours yourself or use saved locations for arrival and departure reminders. Location reminders suggest times; you still review and confirm your workday.

## Install

Download the latest signed APK from [Releases](https://github.com/mrtherichart/Workclock/releases/latest).

To update an existing installation, open **Settings → App updates → Check for updates**. Install the signed release APK, not the debug APK from GitHub Actions.

## Using WorkClock

The [Wiki](https://github.com/mrtherichart/Workclock/wiki) covers the usual jobs:

- [Get started](https://github.com/mrtherichart/Workclock/wiki/Getting-started)
- [Save home and work locations](https://github.com/mrtherichart/Workclock/wiki/Places)
- [Record a workday](https://github.com/mrtherichart/Workclock/wiki/Workday)
- [Fill in a weekly work slip](https://github.com/mrtherichart/Workclock/wiki/Weeks)
- [Back up your records](https://github.com/mrtherichart/Workclock/wiki/Backups)

## Language support

WorkClock supports English, Dutch, German, French and Spanish. Open **Settings → Language**
and choose 🌐 Automatic (follows the device), or a language with its flag.
The preference applies to the WebView interface and Android background notifications.
On Android 13+, WorkClock also declares supported languages in Android app settings.
On Android 10–12, use the selector inside WorkClock.

All dictionaries are bundled offline: `app/src/main/assets/i18n/{en,nl,de,fr,es}.json`.
To modify translations, edit `tools/translation-strings.tsv` and run
`python tools/build-i18n.py`; the generator updates the JSON dictionaries,
WebView bundle, and localized Android notification resources. Business records
(project/location names and backup data) are never translated.

Run `node tests/i18n.test.cjs` to verify dictionary completeness and language switching.

## Building

WorkClock uses Kotlin for Android location services, notifications, backups and updates. The interface is HTML, CSS and JavaScript loaded from the APK. No account or server is needed to store work records.

See [Building and testing](https://github.com/mrtherichart/Workclock/wiki/Development) for the source layout, Linux UI tests and release notes.

Background location uses Android geofences, not continuous GPS tracking. Arrival notifications may be delayed by Android's location and battery settings. Route distances need an internet connection when first calculated.

## License

No license has been specified for this repository.
