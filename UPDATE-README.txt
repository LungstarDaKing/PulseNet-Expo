PulseNet update v2 (cumulative: use this instead of the earlier update zip)
===========================================================================
1. Unzip over your existing pulsenet folder (replace files).
2. npx expo install @supabase/supabase-js react-native-url-polyfill expo-image-picker react-native-webview
   npm i -D react-test-renderer@19.3.0
3. node scripts/apply-update.mjs
4. npx tsc --noEmit      then      npm test       (95 tests)
5. npx expo start -c
6. In the app: Profile tab -> "Backend connection check".
   Connect Supabase + a free AI: docs/SUPABASE.md
