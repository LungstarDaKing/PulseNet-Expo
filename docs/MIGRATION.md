# PulseNet: Flutter to Expo + React Native migration record

Source audited: `PulseNet_App_fixed.zip` (Flutter, ~21,000 lines of Dart, 38 screens/services). The original project was left untouched. The new app is in this folder; it has no Flutter, no Dart.

## 1. Audit findings (what the original really was)

- **Local-first.** No backend, no database, no auth server, no API keys. Everything lived in SharedPreferences / secure storage. The brief's Supabase/AI-classification/duplicate-detection items **did not exist** in the source. Where the brief asked for them, they were built as honest on-device logic (see section 3) and labelled as rule-based.
- **Placeholders found in the original and how they were resolved**

| Original module | Problem found | Now |
|---|---|---|
| Danger Around Me | Deliberately had no data source (earlier fake alerts were removed) | Real data: USGS earthquakes, NASA EONET events, Open-Meteo forecast hazards, plus your own reports. Coverage shown in-app. |
| Safe Places "verified" places | 5 hard-coded **New York** hospitals/police in a South African app | Real nearby police, hospitals, clinics, pharmacies, fire stations, shelters from OpenStreetMap (Overpass), cached 24 h |
| Companion Walk | Hard-coded mock route | Real destination search (Nominatim) and walking route (OSRM), live deviation checks |
| Taxi ride | Sample ride / no expected route | Real driving route (OSRM), deviation alerts, shareable ride SMS, transparent risk score |
| Safety tips | `_getMockTipsForCategory` with a fake network delay | Static content with stable ids; progress persists |
| First aid | Asset files held **only 10 titles, no steps** | Written step-by-step guidance (Red Cross / St John style) for all 10 topics. English steps; Afrikaans titles kept. |
| xh/zu first-aid titles | Garbled machine translations (e.g. "skin disease" for CPR) | Not carried over |
| xh/zu distress phrases | Contained "thank you" and "I am speaking": would false-trigger SOS | Removed; replaced with distress phrases. **Need native-speaker review.** |
| Vitals sharing | Simulated | Real: BLE heart-rate (standard 0x180D) + tap counter + manual entry. Contacts are texted only if you enable it. |
| Camera pulse | Raw camera-frame analysis | **Not migrated** (see section 5) |
| Safe Points character / inventory / redeem | Cosmetic, no real-world effect | **Not migrated** (points, levels, badges, streak, daily challenges are) |

- **Security issue in the original zip:** it contains `pulsenet-release.jks` and `key.properties` (an Android signing key). Treat that key as exposed if the zip was shared. These files were **not** copied. `.gitignore` excludes them. Create a new signing key via EAS (it manages credentials) and do not reuse the old one for a public release unless you are sure it never leaked.
- The original `android` package id `com.pulsenet.pulsenet` is kept so existing installs can be upgraded only if you reuse the old signing key. With a new key it installs as a fresh app.

## 2. Migration matrix

| Feature | Flutter source | Expo implementation | Test | Status |
|---|---|---|---|---|
| Emergency SOS + countdown | sos_service.dart, home | `services/sos.ts`, `app/sos.tsx` | unit (6 cases) | Done. Real-device SMS **unverified** |
| Silent SMS / direct call / FLAG_SECURE | MainActivity.kt | `modules/pulsenet-native` (Kotlin) | none possible here | Written, **not compiled or run** |
| Silent SOS, stealth | stealth_emergency_service | `stealthTap.ts`, `app/stealth.tsx` | unit | Done |
| Duress PIN, app lock, lockout | storage_service | `pinLock.ts` (PBKDF2-SHA256, 10k iters, salted) | unit | Done |
| Distress listener | distress_listener_service | `distress.ts` (expo-speech-recognition) | unit (matching, taps) | Needs dev build, **unverified on device** |
| Emergency contacts | storage_service | `contacts.ts` (encrypted) | via sos tests | Done |
| Check-ins / Check on someone | check_in_service, check_on_contact_service | `checkIn.ts`, `watchContacts.ts` | manual | Done |
| Safe Places + geofence | safe_places_service | `safePlaces.ts` | unit | Done (foreground geofence only) |
| Walk With Me | companion/journey | `walk.ts` | unit | Done (foreground timer + notification) |
| Companion walk + journey monitor | companion_mode_service, journey_monitor_service | `walk.ts`, `journey.ts`, `routing.ts` | unit | Done |
| Taxi / ride safety | taxi_ride_service | `taxi.ts` | unit | Done |
| Fake call / exit strategies | fake_call_service | `fakeCall.ts`, `fake-call*.tsx` | unit (validation) | Done. 4 strategies (see below) |
| Danger Around Me | danger_around_me_service | `danger.ts`, `incidents.ts` | unit (parsers, ranking) | Done. Live APIs **not reachable from build sandbox** |
| Incident report/classify/dedupe/status | (not in source) | `incidents.ts` | unit | New, rule-based |
| Vitals | health_vitals_service | `vitals.ts` (BLE + manual) | unit | BLE needs dev build, **unverified** |
| First aid, tips, helplines | assets, services | `data/`, `constants/helplines.ts` | unit | Done |
| Safe Points (gamification) | safe_points_service | `safePoints.ts` | unit | Core done |
| Safety profiles | safety_profile_service | `safetyProfiles.ts` (read by SOS and companion) | unit | Done |
| Audit log | audit_log_service | `audit.ts` (hash-chained, redacted) | unit | Done |
| Offline | prefs | Cached nearby help; SOS needs only cellular | partial | See limits |

Fake-call strategies: the original had ~8 (calendar event, poor signal, etc.). Four that do something real were kept: fake call, fake text, share location, silent SOS. The rest were theatrical UI effects and were not migrated.

Dependency replacements: shared_preferences + flutter_secure_storage -> AsyncStorage + expo-secure-store; geolocator -> expo-location; flutter_local_notifications -> expo-notifications; url_launcher/telephony -> local native module + Linking; speech_to_text -> expo-speech-recognition; flutter_blue_plus -> react-native-ble-plx; camera -> (dropped); crypto -> @noble/hashes; provider -> `useSyncExternalStore` store; maps SDK -> "Open in Maps" links (no API key needed).

## 3. What "no placeholder data" means here (and its limits)

- Nothing shown as live data is invented. Every alert shows its source and how its severity was derived.
- **Not available as live data anywhere I can verify:** crime, civil unrest, traffic accidents and disease outbreaks. No free, verified, real-time geolocated public feed exists for these. The app shows those categories only from reports you make yourself, and says so. Real crime/unrest alerts need a data partner or your own backend: that is a product decision, not something to fake.
- Reports are saved **on your phone only**. Other users do not see them.
- Weather items are derived from forecast numbers (thresholds in `danger.ts`). They are **not** official warnings. The SA Weather Service is the authority.
- Public APIs used: USGS, NASA EONET, Open-Meteo (all keyless), Overpass, Nominatim (policy: light use, identify the app), OSRM demo server (best effort, no SLA). For a public launch, self-host or pay for routing/geocoding.
- The AI-style items in the brief are **rule-based** (keywords, distance/time/text similarity). They are not machine learning.

## 4. Native-only features and how to test them

| Feature | Needs | How to test |
|---|---|---|
| Silent SMS, direct call, screenshot block | Preview/dev APK (local Kotlin module) | Install APK, add **your own** number as the only contact, press SOS with drill mode OFF; confirm SMS arrives. Check airplane mode + cellular. Never test with real emergency numbers: use drill mode, and call only your own numbers. |
| Voice distress listener | Dev build + microphone | Tap 4 times, speak "help me"; confirm silent SOS to your own number |
| BLE heart rate | Dev build + a real strap/watch | Scan, connect, watch readings |
| Notifications/timers in background | Real device | Start a 1-minute walk, lock the phone |
| Foreground location | Expo Go works | Dashboard, Safe places, Danger |

Expo Go: all screens run, but silent SMS/calls fall back to the messaging app / dialer, and BLE and voice are unavailable. The app tells you this on the Settings screen.

## 5. Not migrated / known limits

- Camera pulse (PPG): needs per-frame camera access that Expo does not provide. A frame-processor library would add a large native dependency. A tap counter and BLE replace it.
- Background tracking when the app is closed: not implemented. Walk and companion timers stop if the app is force-closed. (Android foreground service / background location would need extra native work and Play Store review for `ACCESS_BACKGROUND_LOCATION`.)
- iOS: no silent SMS exists on iOS; the composer is used. iOS is untested.
- Afrikaans/Zulu/Xhosa UI text: the UI is English. Only distress phrases are multilingual.
- The `expo-speech-recognition` Android service may send audio to Google's recognizer depending on device.
- Rate limiting is local only (10 s duplicate window for SOS, 2 min cooldown for vitals alerts, 120 s minimum between API refreshes).

## 6. Verification actually performed

- `tsc --noEmit` (strict): clean.
- `jest`: 67 tests, 7 suites, all pass (geo, phone, PIN/lockout, SOS delivery states, duplicate protection, drill mode, composer fallback, state transitions, walk and companion timers, journey monitor, parsers for USGS/EONET/Open-Meteo/Overpass/Nominatim/OSRM using **test fixtures shaped like the APIs**, classifier, duplicates, vitals, taxi risk, geofence, gamification, audit chain).
- `expo export --platform android`: JavaScript bundle compiled (Hermes, 3.2 MB).
- `expo-doctor`: 18 of 20 checks passed. 2 could not run: no network to exp.host in the build sandbox (config schema check, React Native Directory check). **Re-run `npx expo-doctor` on your machine.**
- **Not done:** EAS cloud build (needs your Expo login), the Kotlin module compile, any run on a phone, any call to the live public APIs, lint. No APK exists yet.


## 7. Update: Supabase backend and redesigned dashboard
Added: Home / Map / Alerts / Profile tabs, Report Emergency (type, details, photos, location), Pulse AI assistant, community alerts with Realtime, push alerts, accounts. See `docs/SUPABASE.md`.
Verified here: database schema and 49 row-level-security checks on a real Postgres 16 (`supabase/tests`), 80 unit tests, TypeScript strict, Android bundle build, native prebuild.
Not verified here: the two Edge Functions (Deno) were not run, Realtime and push were not run end to end, the map's tile loading was not run, nothing was run on a phone.
Deliberate differences from the mock-up: the AI never says it shared your location or contacted authorities (it cannot), unverified reports are labelled as such, and the app never fakes alerts when signed out or offline.
