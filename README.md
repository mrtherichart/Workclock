# WorkClock

WorkClock is an Android app for recording working hours and travel kilometres. It keeps your records on your phone and puts them into a weekly table you can copy onto a work slip.

You can enter hours yourself or use saved locations for arrival and departure reminders. Location reminders suggest times; you still review and confirm your workday.

## Install

Download the latest signed APK from [Releases](https://github.com/mrtherichart/Workclock/releases/latest).

To update an existing installation, open **Settings → App updates → Check for updates**. Install the signed release APK, not the debug APK from GitHub Actions.

## Using WorkClock

The [user guide](docs/README.md) covers the usual jobs:

- [Get started](docs/getting-started.md)
- [Save home and work locations](docs/places.md)
- [Record a workday](docs/workday.md)
- [Fill in a weekly work slip](docs/weeks.md)
- [Back up your records](docs/backups.md)

## Building

WorkClock uses Kotlin for Android location services, notifications, backups and updates. The interface is HTML, CSS and JavaScript loaded from the APK. No account or server is needed to store work records.

See [Building and testing](docs/development.md) for the source layout, Linux UI tests and release notes.

Background location uses Android geofences, not continuous GPS tracking. Arrival notifications may be delayed by Android's location and battery settings. Route distances need an internet connection when first calculated.

## License

No license has been specified for this repository.
