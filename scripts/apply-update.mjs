// Run once after copying the update into your project:   node scripts/apply-update.mjs
// - adds the expo-image-picker plugin (camera/photo permission text) to app.json
// - removes newArchEnabled if present (not allowed in SDK 58)
// - copies EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY from .env into eas.json so cloud builds get them
//   (both values are public by design; the service-role key must NEVER go in .env or eas.json)
import fs from 'node:fs';

const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n');

const app = read('app.json');
const e = app.expo;
delete e.newArchEnabled;
delete e.splash; // SDK 58: splash is configured only through the expo-splash-screen plugin
e.plugins = e.plugins ?? [];
if (!e.plugins.some((p) => (Array.isArray(p) ? p[0] : p) === 'expo-image-picker')) {
  e.plugins.push(['expo-image-picker', {
    photosPermission: 'PulseNet attaches photos you choose to an incident report.',
    cameraPermission: 'PulseNet takes a photo you choose to attach to an incident report.',
  }]);
  console.log('app.json: added expo-image-picker plugin');
}
e.android = e.android ?? {};
e.android.permissions = e.android.permissions ?? [];
for (const p of ['CAMERA']) if (!e.android.permissions.includes(p)) { e.android.permissions.push(p); console.log('app.json: added Android permission ' + p); }
e.android.permissions = e.android.permissions.filter((p) => p !== 'ACCESS_BACKGROUND_LOCATION');
write('app.json', app);

if (fs.existsSync('package.json')) {
  const pkg = read('package.json');
  if (pkg.jest) {
    pkg.jest.testMatch = ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'];
    write('package.json', pkg);
    console.log('package.json: jest now also runs .tsx tests');
  }
}

let url = '', key = '';
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(EXPO_PUBLIC_SUPABASE_URL|EXPO_PUBLIC_SUPABASE_ANON_KEY)\s*=\s*(.+?)\s*$/);
    if (m) (m[1].endsWith('URL') ? (url = m[2]) : (key = m[2]));
  }
}
if (/service_role/i.test(key) || (key.split('.')[1] && Buffer.from(key.split('.')[1], 'base64').toString().includes('"service_role"'))) {
  console.error('STOP: that key is a service_role key. Use the anon / publishable key only.');
  process.exit(1);
}
if (url && key && fs.existsSync('eas.json')) {
  const eas = read('eas.json');
  for (const p of Object.keys(eas.build ?? {})) {
    eas.build[p].env = { ...(eas.build[p].env ?? {}), EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: key };
  }
  write('eas.json', eas);
  console.log('eas.json: Supabase URL and anon key added to every build profile');
} else {
  console.log('No .env with both Supabase values found: cloud features stay off until you add them (see docs/SUPABASE.md).');
}
console.log('Done. Next: npx expo install @supabase/supabase-js react-native-url-polyfill expo-image-picker react-native-webview  &&  npm i -D react-test-renderer@19.3.0');
