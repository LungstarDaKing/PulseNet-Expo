import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Central persistence (port of StorageService).
 *  - secure*: Keystore/Keychain-backed (contacts, medical data, PIN material, journeys, check-ins).
 *    Values are chunked because SecureStore warns above ~2 KB. If the secure store is unavailable
 *    the value falls back to AsyncStorage: an emergency contact must never be silently dropped.
 *  - plain*: non-sensitive flags and settings.
 * Nothing here leaves the device.
 */
const CHUNK = 1800;
const countKey = (k: string) => `${k}.__n`;
const partKey = (k: string, i: number) => `${k}.__${i}`;
const FALLBACK = (k: string) => `fallback:${k}`;

export async function secureGet(key: string): Promise<string | null> {
  try {
    const n = await SecureStore.getItemAsync(countKey(key));
    if (n != null) {
      const count = parseInt(n, 10);
      let out = '';
      for (let i = 0; i < count; i++) {
        const part = await SecureStore.getItemAsync(partKey(key, i));
        if (part == null) return null;
        out += part;
      }
      return out;
    }
  } catch {
    // fall through to fallback
  }
  return AsyncStorage.getItem(FALLBACK(key));
}

export async function secureSet(key: string, value: string): Promise<void> {
  try {
    const old = await SecureStore.getItemAsync(countKey(key));
    const parts = Math.max(1, Math.ceil(value.length / CHUNK));
    for (let i = 0; i < parts; i++) {
      await SecureStore.setItemAsync(partKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(countKey(key), String(parts));
    if (old != null) {
      for (let i = parts; i < parseInt(old, 10); i++) await SecureStore.deleteItemAsync(partKey(key, i));
    }
    await AsyncStorage.removeItem(FALLBACK(key));
  } catch {
    await AsyncStorage.setItem(FALLBACK(key), value);
  }
}

export async function secureDelete(key: string): Promise<void> {
  try {
    const n = await SecureStore.getItemAsync(countKey(key));
    if (n != null) {
      for (let i = 0; i < parseInt(n, 10); i++) await SecureStore.deleteItemAsync(partKey(key, i));
      await SecureStore.deleteItemAsync(countKey(key));
    }
  } catch {
    // ignore
  }
  await AsyncStorage.removeItem(FALLBACK(key));
}

export async function secureGetJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await secureGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
export const secureSetJSON = (key: string, v: unknown) => secureSet(key, JSON.stringify(v));

export async function plainGetJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export const plainSetJSON = (key: string, v: unknown) => AsyncStorage.setItem(key, JSON.stringify(v));
export const plainGet = (key: string) => AsyncStorage.getItem(key);
export const plainSet = (key: string, v: string) => AsyncStorage.setItem(key, v);
export const plainRemove = (key: string) => AsyncStorage.removeItem(key);

export async function getBool(key: string, def = false): Promise<boolean> {
  const v = await AsyncStorage.getItem(key);
  return v == null ? def : v === 'true';
}
export const setBool = (key: string, v: boolean) => AsyncStorage.setItem(key, String(v));

/** Every logical secure key used by the app, so wipeAllData can remove them. */
export const SECURE_KEYS = [
  'medical_profile',
  'emergency_contacts',
  'pin_hash',
  'pin_salt',
  'duress_hash',
  'duress_salt',
  'journey_points',
  'check_in_requests',
  'check_on_contacts',
  'taxi_active_ride',
  'taxi_history',
  'vitals_history',
  'incident_reports',
  'safe_places_user',
  'companion_state',
  'walk_state',
] as const;

/** "Forget me": wipes every trace of PulseNet data on this device. */
export async function wipeAllData(): Promise<void> {
  for (const k of SECURE_KEYS) await secureDelete(k);
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys);
}

export const K = {
  onboarded: 'hasSeenOnboarding',
  userName: 'user_name',
  locationSharing: 'location_sharing_enabled',
  appLockEnabled: 'app_lock_enabled',
  pinFails: 'pin_fail_count',
  pinLockUntil: 'pin_lock_until_ms',
} as const;
