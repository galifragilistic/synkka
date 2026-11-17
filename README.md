# Synkka

Tiedostojen synkronointisovellus: **macOS ja Windows** (Tauri + React) sekä **Android** (Expo / React Native).
Käyttöliittymä on toteutettu `synkka-handover/`-paketin suunnitelman mukaan. Taustalla on vielä
**mock-SyncService** (muistissa, simuloi edistymistä) – oikea synkronointiprotokolla on erillinen päätös.

```
packages/core      Jaettu: tokenit, tyypit, i18n (fi), muotoilut, tila→ikoni/teksti/väri, ristiriitalogiikka, mock-palvelu, testit
apps/desktop       Tauri 2 + React 19 + Vite (macOS, Windows)
apps/mobile        Expo SDK 58 + expo-router (Android; toimii myös webissä esikatselua varten)
synkka-handover/   Alkuperäinen suunnittelupaketti (lähde, ei muokata)
```

## Vaatimukset

- Node **26** (`.nvmrc`; Expo 58 ja Vite 8 eivät toimi Node 20:llä): `nvm use`
- Työpöytä: Rust (asennettu: `brew install rustup && rustup default stable`, polku `/opt/homebrew/opt/rustup/bin`)
- Android-laitteelle: Android Studio / Android SDK + JDK 17, tai EAS-pilvibuild

```bash
npm install
```

## Ajaminen

```bash
npm test
```

```bash
npm run desktop:dev
```

```bash
npm run desktop:build
```

```bash
npm run mobile:web
```

```bash
npm run mobile:android
```

- `desktop:dev` avaa natiivi-ikkunan; `desktop:web` pelkän selainversion (portti 1420).
- `desktop:build` tuottaa macOS:llä `Synkka.app` + `.dmg` hakemistoon `apps/desktop/src-tauri/target/release/bundle/`.
- **Windows-asennuspaketit** (`.msi`, `.exe`) rakennetaan Windowsilla tai CI:ssä: `.github/workflows/desktop.yml`.
- **Android-APK** rakennetaan CI:ssä (`.github/workflows/android.yml`) tai paikallisesti (alla).
  Valmiit paketit kopioidaan kansioon `dist/` (gitignoroitu).
  Sovellus vaatii development buildin (ei Expo Go:ta), koska se käyttää react-native-svg:tä ja fontteja.

## Android-APK paikallisesti

Asennettu tälle koneelle: JDK 17 (`brew install openjdk@17`), komentorivityökalut
(`brew install --cask android-commandlinetools`) ja SDK hakemistoon `~/Library/Android/sdk`
(platform-tools, platforms;android-37.0, build-tools;37.0.0, ndk;27.1.12297006).

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=$HOME/Library/Android/sdk
```

```bash
cd apps/mobile && npx expo prebuild -p android && cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64
```

**Huom:** Gradle ei huomaa muutoksia `packages/core`-paketissa, joten JS-paketti voi jäädä vanhaksi.
Kun ydin on muuttunut, pakota JS-paketin uudelleenrakennus lisäämällä komentoon `app:createBundleReleaseJsAndAssets --rerun`
ennen `assembleRelease`-tehtävää.

Tulos: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`. Se on allekirjoitettu
**debug-avaimella** – sopii testaukseen (sivulataus), ei Play Storeen. Julkaisua varten tarvitaan oma
upload-avain (keystore) tai EAS Build.

Asennus puhelimeen USB:llä (kehittäjäasetukset + USB-vianetsintä päällä):

```bash
~/Library/Android/sdk/platform-tools/adb install dist/Synkka-0.1.0-android.apk
```

## Mitä on toteutettu

- Työpöytä: tiedostoselain (sivupalkki, haku 150 ms debouncella, tila-pilleri, tauko/jatka, tiedostotaulukko
  live-edistymisellä, laitteet, viimeisin toiminta, tallennustila), ristiriitadialogi (~480 px, mobiilin
  radiokorttimalli), toast. Responsiivinen: sivupalkki pinoutuu < 792 px, taulukko vierittyy < 620 px.
- Android: Tiedostot, Synkronointi (edistymisrengas, jono, asetukset), Ristiriidan ratkaisu, alavälilehdet.
- Windowsilla mock käyttää "Työaseman PC" -laitetta nykyisenä laitteena, macOS:llä "MacBook Pro", Androidilla "Pixel 9".

## Poikkeamat ja lisäykset handoveriin

- Tekstejä lisätty `packages/core/src/locales/fi.json`iin (lista `_notes.added`-kentässä), mm. monikkomuodot
  ("1 tiedosto" / "2 tiedostoa"), `network.*`, `files.folders`.
- `SyncService`-rajapintaan lisätty `recent()` ja `conflicts()`; `ConflictVersion`iin `deviceGenitive` ja `deviceType`.
- Ikoni `play` ("Jatka") ja `close` (dialogi) lisätty – eivät olleet glyph-listalla.

## Ei vielä suunniteltu (spec §7) – jätetty tarkoituksella toteuttamatta

Tyhjät tilat, virhe-/offline-tilat, kirjautuminen, jakodialogi, asetusnäkymä, tiedostojen lisäys,
kansioihin navigointi, tarjotin-/valikkopalkkivalikko, tumma tila, tablettiasettelu.
Mobiilin Kuvat- ja Tili-välilehdet näyttävät "ei vielä suunniteltu" -paikkamerkin.
Työpöydän muut navigaatiokohteet, "Lisää tiedostoja", "Jaa kansio", "Uusi kansio" ja asetusnappi ovat inerttejä.
