# WorkClock Android

Dit project behoudt de WorkClock-interface van **2 oktober 2026** en voegt een kleine echte Android-laag toe.

## Wat zit erin?

- Originele WorkClock HTML/CSS/JavaScript in `app/src/main/assets/index.html`.
- Een kleine Kotlin-`WebView`, via `WebViewAssetLoader` op een veilige lokale HTTPS-origin; geen website, server of UI-herbouw nodig.
- Android-geofences rond opgeslagen thuis- en werklocaties. Android/Google Play services doet de detectie zonder constant GPS-pollen.
- Native meldingen op aankomst/vertrek, ook als de app niet openstaat, zolang Android toestemming en achtergrondlevering toestaat.
- Een **persistente wachtrij** met aankomst-/vertrekgebeurtenissen. Die wordt bij de volgende appstart in WorkClock verwerkt.
- Back-up import/export in Settings, via Androids bestandskiezer (JSON).
- GitHub Actions bouwt automatisch een test-APK. Geen Android Studio op je telefoon nodig.

## Wat is nog géén garantie?

Geofences zijn energiezuinig maar **niet seconde-precies**: Android kan meldingen minuten later leveren. Fabrikant-specifieke batterijbeperkingen kunnen meldingen extra vertragen. Na expliciet `Force stop` vanuit Android-instellingen werkt achtergrondlevering niet totdat je de app weer opent. Zonder Google Play services is deze implementatie van geofencing niet beschikbaar. Routes berekenen via OSRM/ORS vereist internet (tijden en locaties worden lokaal bewaard).

De **uren worden niet zonder bevestiging automatisch op basis van GPS ingevuld**. De native laag legt gebeurtenissen vast; bestaande WorkClock-logica herinnert je aan invoeren/controleren en reconstrueert de terugreis zodra de app weer wordt geopend. De oorspronkelijke JS-app is dus nog de bron van waarheid voor uren en kilometers.

## Van GitHub naar je telefoon

1. Deze broncode staat in de bestaande GitHub-repository `mrtherichart/Workclock` (branch `main`).
2. Na elke wijziging in `main` bouwt GitHub Actions automatisch een nieuwe APK.
3. Ga in GitHub naar **Actions** -> `Android APK` -> de nieuwste succesvolle run -> **Artifacts** -> `workclock-android-debug` downloaden. Pak de ZIP uit en installeer `app-debug.apk` op Android.
4. In WorkClock: voeg je locaties toe, schakel Android-locatie in, geef **Altijd toestaan** voor achtergrondlocatie en geef meldingsrechten. Test daarna eerst thuis -> werk -> thuis.

### Belangrijke waarschuwing over updates en data

**Dit eerste workflowbestand levert test-APK's met een nieuwe debug-handtekening per buildrunner.** Daardoor kan een latere test-APK soms niet over de vorige heen worden geïnstalleerd. Voor echt dagelijks gebruik richten we vóór de eerste productierelease een **vaste persoonlijke Android-ondertekeningssleutel** via GitHub Secrets in. Sla de sleutel veilig buiten GitHub op. Zet de ondertekeningssleutel nooit in de repository.

Een nieuwe app heeft een ander opslaggebied dan de oude mobiele browser. In de nieuwe app is daarom import/export toegevoegd. Als je al gegevens in de oude webversie hebt, moet je **eerst vanuit diezelfde web-origin een JSON-back-up exporteren**; upload/publiceer dus zo nodig eerst de vernieuwde HTML op de bestaande origin en gebruik daar Export backup. De nieuwe app kan browser-localStorage niet zelf uitlezen. Verwijder de oude webapp niet voordat een proefimport van de back-up is geslaagd.

## Invoeren van een afwijkend tijdstip

Bij een vergeten start- of eindtijd blijven de bestaande keuzes (nu, 15/30/45/60 minuten geleden) intact. De extra knop **Custom · enter exact time** opent een datum- en tijdveld voor een precieze invoer. Een toekomstig tijdstip en een eindtijd vóór de start worden afgewezen.

## Ontwerpkeuzes

Geen React Native, Flutter, Cordova, losse backend, account of tracker die elke paar seconden GPS opvraagt. De native laag is alleen voor hetgeen een gewone webpagina op Android niet betrouwbaar kan doen: achtergrondlocatie, meldingen, bestandskiezer en hervatten. De WorkClock UI blijft de oorspronkelijke versie.

Bronnen: Android Developers `WebViewAssetLoader`, geofencing/background location documentation; Gradle setup actions.


## Android location fix (0.1.2)

- **Foreground positioning is native** through Android's fused location API, not the WebView geolocation permission layer. `Places → Enable location` requests Android permission and acquires a fix. While visible, updates use a 60-second balanced-power request. Closing the activity stops updates; background uses geofences only.
- Approximate-only location is accepted for showing a foreground fix. **Precise** and **Always allow** permissions are both needed for reliable background geofences on Android 10+.
- Location failures (system location services off, permission denied, no fix, provider error, 20-second timeout) are shown in the Places view instead of misleading website-permission advice.
- Background geofence registration now serializes overlapping requests and reports actual registration errors/active/no-places statuses.
- On Android 10 and newer, permissions must be configured in Android's own app settings; the app's Settings panel shows current permission levels separately.

**Upgrade note:** GitHub runner debug APK signing keys are not stable across builds. Before uninstalling the previous test APK, use WorkClock → Settings → Export backup (JSON). If Android rejects the updated APK with a signature mismatch, uninstall the old test APK, install the new one, then import the JSON backup. Do not uninstall until export is confirmed. We should set up a securely stored persistent release keystore before daily use.

## One-time permanent signing activation — WorkClock 0.2.0

WorkClock now has an in-app updater in **Settings → App updates**. It checks the **latest published GitHub Release**, downloads `WorkClock.apk` securely, verifies its SHA-256 digest and Android package ID, then launches Android's Package Installer. The user still needs to approve installation, and may need to allow installs from WorkClock once.

The APK signing key is **fixed across future releases**, provided the following one-time setup is completed. The public repository holds only an **AES-256 encrypted** copy of the key (`signing/workclock-signing.p12.enc`) using PBKDF2 with 250,000 iterations. The password is not in GitHub and is not printed in workflow logs. Keep a separate, private copy of the signing key and password. Losing both means Android updates with this app ID cannot continue.

1. Obtain the privately generated `WorkClock-signing-password.txt` and `WorkClock-signing-keystore.p12` files from the ChatGPT conversation. **Do not upload the raw keystore or password to the public repository.** Save the keystore and password safely outside GitHub.
2. Open [GitHub Actions secrets for this repository](https://github.com/mrtherichart/Workclock/settings/secrets/actions) → **New repository secret**; set **name** `WORKCLOCK_SIGNING_PASSWORD` and **value** to the single line in the password file. One secret only.
3. Open [GitHub Actions settings](https://github.com/mrtherichart/Workclock/settings/actions) → General → **Workflow permissions** → grant **Read and write permissions** to the `GITHUB_TOKEN` if the workflow reports a publish permission error.
4. Open [Signed Android release workflow](https://github.com/mrtherichart/Workclock/actions/workflows/stable-release.yml) → **Run workflow** (main). After success, the signed update will appear under [GitHub Releases](https://github.com/mrtherichart/Workclock/releases/latest) as `WorkClock.apk`. Future new version pushes publish automatically once the version is incremented.
5. **One-time migration from earlier test APK (0.1.x):** In the installed app choose **Settings → Export backup**. Verify the JSON is stored somewhere safe. **Uninstall the test APK** and install the new stable `WorkClock.apk` downloaded from Releases via Android Downloads. Open app → **Import backup** and verify history/places. Old debug signing keys cannot be upgraded in place. This step must not be skipped.
6. Thereafter, use **Settings → App updates → Check for updates → Download & install**. Android may ask once to allow WorkClock to install APKs; the update retains its existing data because package ID and signing certificate stay the same. Only signed **Releases** are offered; downloadable GitHub Actions debug artifacts are **not** suitable for updates.

Current stable signing certificate SHA-256: `d321aebe6255506998d22009a6d46deb98a41c34717839ea4ec0a5e77faa3209`.

### Publishing later versions

Increment **both** `versionName` and `versionCode` in `app/build.gradle.kts` on each published change. The Release workflow only publishes a new version tag once. There is no continuous location tracking or network access added by the updater: it checks on app launch and on demand, and only downloads when the user taps the install button.

## Visual design 0.3.0

WorkClock now uses a cohesive slate-blue color palette inspired by `#253e4e`. The timer, forms, nav, overlays and active controls retain their existing interaction patterns. The functional warm amber finish/review state and red destructive controls remain distinct.

Typography uses only two font stacks: system UI sans-serif for body/control/timer text and a serif display stack for headings. No external font downloading is needed.

The Android launcher now uses the approved briefcase/clock/location icon, with a legacy fallback and adaptive icon foreground on a `#253e4e` background.

## Android-only application and Linux testing (0.3.2)

The **APK contains only the Android runtime UI**. The browser-specific GPS,
web notification/Service Worker, browser file picker, and browser-geolocation
permission paths have been removed. The native Android bridge handles those
features instead. The embedded WebView, HTML/CSS/JavaScript, and its local
DOM storage remain: they power the actual app, not a separate web edition.

For Linux tests, **the HTML inside the APK is tested directly**. The separate
`tests/linux-android-mock.js` emulates only the native `WorkClockAndroid`
bridge and is injected by the test runner. It is never stored under
`app/src/main/assets` or bundled in the APK.

With Node.js 22 and Chromium or Google Chrome installed:

```sh
node tests/weekstaat.test.cjs
node tests/linux-ui-smoke.cjs
node tests/linux-ui-smoke.cjs --preview
```

The last command hosts an interactive preview at the printed localhost URL;
open it in your Linux browser. All sample records and fake Android permissions
live in the Linux-only test environment, not on the user's device. Browser-side
fallbacks are intentionally not part of the production app.

The `Android HTML Linux smoke` GitHub workflow checks the actual embedded
production HTML, including History/Weekstaat UI, calculations and Android bridge
calls, before merging changes.
