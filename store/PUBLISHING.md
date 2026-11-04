# Publishing Echoes on Google Play

Everything here is what **you** do in your own Google account; the code side is ready.
Rules change, so check the Play Console's own prompts when they differ from this page.

## 0. What is already done (in this repo)
- Android app (Capacitor) in `android/`, app id `app.echoes.rescue`, portrait, full screen, dark splash, launcher icons.
- Release builds are signed from `android/keystore.properties` if that file exists (it is git-ignored).
- Store graphics in `store/`: 512×512 icon, 1024×500 feature graphic, four 1080×1920 phone screenshots.
- Store text in `store/listing.md`, privacy policy in `store/privacy-policy.md`.

**Decide the app id before the first upload.** `app.echoes.rescue` is a placeholder. Once an app is
on Play its id can never change. If you own a domain, use it reversed (e.g. `com.yourname.echoes`):
change `appId` in `capacitor.config.json` and `namespace`/`applicationId` in `android/app/build.gradle`,
and move `MainActivity.java` to the matching folder. I can do this for you.

## 1. Create your developer account (once)
1. Go to https://play.google.com/console and sign up: one-time $25 fee, identity verification
   (government ID; it can take a few days).
2. **New personal accounts must run a closed test before going public**: at least 12 testers
   opted in for 14 days in a row (Google's current rule for personal accounts created after
   November 2023). Organisation accounts (needs a D-U-N-S number) skip this.

## 2. Make your upload key (once, on your own computer; never share it or commit it)
```
keytool -genkeypair -v -keystore echoes-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```
Then create `android/keystore.properties` (not committed):
```
storeFile=/full/path/to/echoes-upload.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=upload
keyPassword=YOUR_KEY_PASSWORD
```
Back up the `.jks` file and passwords somewhere safe. With Play App Signing (the default),
Google keeps the real app-signing key; if you lose this upload key you can ask Google to reset it.

## 3. Build the release bundle
Needs Node 22, JDK 21 and the Android SDK (or Android Studio).
```
npm install
npm run app:build        # web bundle + copy into the Android project
npm run app:release      # android/app/build/outputs/bundle/release/app-release.aab (signed)
```
For every new release raise `versionCode` (1, 2, 3, ...) and `versionName` in `android/app/build.gradle`.

## 4. Create the app in Play Console
1. **Create app**: name "Echoes: Space Survivor" (or your choice, up to 30 characters), Game, Free.
2. **Store listing**: paste from `store/listing.md`; upload `store/icon-512.png`,
   `store/feature-1024x500.png` and the four images in `store/screenshots/`.
3. **App content** (Policy section), each one is a short form:
   - Privacy policy: a public URL to `store/privacy-policy.md` (I can publish it as a web page).
   - Ads: No ads.
   - App access: all functionality available without special access.
   - Content rating: fill the IARC questionnaire (cartoon space action, no blood, no chat,
     no purchases); expect a low age rating.
   - Target audience: 13+ (choosing under-13 brings the Families policy and extra rules).
   - Data safety: see `store/privacy-policy.md`. Today the app collects and shares **no data**.
     When the Firebase leaderboard is added, update it (anonymous ID, callsign, scores).
   - Government app / financial features / health: No.
4. **Testing → Closed testing**: create a track, upload `app-release.aab`, add your testers'
   Google accounts (email list or a Google Group), and send them the opt-in link. Keep at least
   12 opted in for 14 days.
5. **Apply for production** (button appears after the closed test), answer the short questions,
   then create a **Production** release with the same or a newer bundle and roll it out.
   Review usually takes from a few hours to a few days.

## 5. After launch
- Each update: raise `versionCode`, rebuild, upload to a track, roll out.
- Play requires targeting a recent Android version every year; bump `compileSdkVersion` /
  `targetSdkVersion` in `android/variables.gradle` when Play Console warns you.
