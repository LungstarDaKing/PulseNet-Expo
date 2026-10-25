# PulseNet (Expo + React Native + TypeScript)

Personal-safety app migrated from Flutter. No Flutter, no Dart. See `docs/MIGRATION.md` for the audit, feature matrix, limits and test results.

## Run it (Windows, small footprint)

```powershell
cd pulsenet
npm install
npx expo start          # scan the QR code with Expo Go
```
Expo Go runs every screen. Silent SMS/call, voice distress and Bluetooth need the APK below.

## Get an installable Android APK in the cloud (no Android Studio)

```powershell
npm install -g eas-cli
eas login                      # free Expo account
eas init                       # links the project, writes the project id into app.json
eas build -p android --profile preview     # APK for testing
```
When it finishes, EAS prints a download link / QR code. Open it on the phone and install (allow "install unknown apps").
- `development` profile: APK with the dev client (for debugging native features).
- `production` profile: Play Store bundle (.aab). EAS creates and stores the signing key for you. **Do not reuse the key from the old Flutter zip.**

## Test safely
Settings -> turn on **SOS drill mode**: the full SOS flow runs and nothing is sent. To test real sending, put only your own number in Contacts. Never test by calling 10111/10177/112.

## Checks
```powershell
npm run typecheck   # tsc
npm test            # 67 unit tests
npx expo-doctor
```

## Clean up disk space
- `rmdir /s /q node_modules` : removes installed packages (re-run `npm install` later).
- `npm cache clean --force` : empties npm's download cache.
- `rmdir /s /q .expo` : removes Expo's local cache for this project.
Nothing here touches your source files.

## Layout
`src/app` routes · `src/services` logic · `src/components` UI · `src/data` content · `src/lib` utilities · `modules/pulsenet-native` Kotlin bridge · `tests` · `docs`
