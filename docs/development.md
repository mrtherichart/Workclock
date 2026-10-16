# Building and testing

The Android project is in `app/`. It uses a WebView for the UI and Kotlin for location, notifications, Android file access and the installer.

- `app/src/main/assets/` — HTML, CSS and JavaScript used by the APK.
- `app/src/main/java/nl/workclock/app/` — Android services and the JavaScript bridge.
- `tests/` — Linux smoke tests and a simulated Android bridge. These files aren't packaged in the APK.
- `.github/workflows/` — test builds, checks and signed releases.

With Node.js 22 and Chromium installed, you can run the UI and calculation tests on Linux:

```sh
node tests/weekstaat.test.cjs
node tests/linux-ui-smoke.cjs
node tests/linux-ui-smoke.cjs --first-run
node tests/linux-ui-smoke.cjs --preview
```

The preview uses mock Android services. It can't verify real background location detection; that needs a phone.

To build a debug APK, use the **Android APK (test build)** GitHub Action or run the Android Gradle build locally. Debug APKs aren't signed for updating the stable app.

Signed releases use `.github/workflows/stable-release.yml`. Bump both `versionCode` and `versionName` in `app/build.gradle.kts` when preparing a release. The signing password is an Actions secret; the encrypted signing key is in `signing/`. Never commit the decrypted key or its password. Keep an independent private copy of both.

The release workflow checks and signs the package before publishing `WorkClock.apk` to [Releases](https://github.com/mrtherichart/Workclock/releases).

Screenshots in the guide are captured from the current UI with sample records. Regenerate them with `node tests/capture-docs.cjs` in Linux (Chromium required), and commit the resulting files in `docs/screenshots/`.
