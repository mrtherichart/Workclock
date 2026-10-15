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