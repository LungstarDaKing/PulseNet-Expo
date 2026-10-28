/** Renders the real screens with native modules mocked, to catch render loops and thrown errors. */
import React from 'react';
import { act, create } from 'react-test-renderer';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }), useLocalSearchParams: () => ({}), Stack: { Screen: () => null } }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-secure-store', () => { const m = new Map<string, string>(); return { getItemAsync: async (k: string) => m.get(k) ?? null, setItemAsync: async (k: string, v: string) => { m.set(k, v); }, deleteItemAsync: async (k: string) => { m.delete(k); } }; });
jest.mock('expo-location', () => ({ hasServicesEnabledAsync: async () => true, getForegroundPermissionsAsync: async () => ({ granted: true }), requestForegroundPermissionsAsync: async () => ({ granted: true }), getCurrentPositionAsync: async () => ({ coords: { latitude: -29.86, longitude: 31.02, accuracy: 10 }, timestamp: Date.now() }), getLastKnownPositionAsync: async () => null, watchPositionAsync: async () => ({ remove: () => undefined }), Accuracy: { High: 4 } }));
jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn(), setNotificationChannelAsync: async () => undefined, getPermissionsAsync: async () => ({ granted: true }), requestPermissionsAsync: async () => ({ granted: true }), scheduleNotificationAsync: async () => 'id', cancelScheduledNotificationAsync: async () => undefined, AndroidImportance: { MAX: 5 }, SchedulableTriggerInputTypes: { DATE: 'date' } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('expo-sms', () => ({ isAvailableAsync: async () => false }));
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n), randomUUID: () => 'uuid' }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), notificationAsync: jest.fn(), NotificationFeedbackType: {} }));
jest.mock('../modules/pulsenet-native', () => ({ __esModule: true, default: null }));
jest.mock('react-native-safe-area-context', () => { const R = require('react'); const { View } = require('react-native'); return { SafeAreaView: ({ children, style }: any) => R.createElement(View, { style }, children), SafeAreaProvider: ({ children }: any) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }; });

const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

async function mount(el: React.ReactElement) {
  const errors: unknown[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a); });
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(el); });
  await flush();
  spy.mockRestore();
  return { r, errors };
}

describe.each([
  ['TabsHost (Home tab)', () => require('../src/app/index').default],
  ['ReportEmergency', () => require('../src/app/report-emergency').default],
  ['Assistant', () => require('../src/app/assistant').default],
  ['MyReports', () => require('../src/app/my-reports').default],
  ['Auth', () => require('../src/app/auth').default],
  ['Danger', () => require('../src/app/danger').default],
  ['SafePlaces', () => require('../src/app/safe-places').default],
  ['Profile settings', () => require('../src/app/profile').default],
  ['Vitals', () => require('../src/app/vitals').default],
])('%s', (_name, get) => {
  it('mounts without errors or render loops', async () => {
    const C = get();
    const { r, errors } = await mount(<C />);
    expect(errors).toEqual([]);
    expect(r.toJSON()).not.toBeNull();
    await act(async () => { r.unmount(); });
  });
});

it('Alerts, Map and Profile tabs mount', async () => {
  for (const f of ['AlertsTab', 'MapTab', 'ProfileTab']) {
    const C = require(`../src/components/${f}`)[f];
    const { r, errors } = await mount(<C />);
    expect(errors).toEqual([]);
    await act(async () => { r.unmount(); });
  }
});

it('Backend check screen explains a missing configuration instead of failing', async () => {
  jest.doMock('../src/lib/supabase', () => ({ supabase: null, cloudConfigured: false, isNetworkError: () => false }));
  const C = require('../src/app/cloud-status').default;
  const { r, errors } = await mount(<C />);
  expect(errors).toEqual([]);
  expect(JSON.stringify(r.toJSON())).toContain('no Supabase URL');
  await act(async () => { r.unmount(); });
});
