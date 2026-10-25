import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import * as Crypto from 'expo-crypto';
import { K, getBool, plainGet, plainRemove, plainSet, secureDelete, secureGet, secureSet, setBool } from '../lib/storage';

/** App lock: salted PBKDF2-HMAC-SHA256, lockout back-off, duress PIN (port of StorageService). */
const ITERATIONS = 10000;

export let onDuressPin: (() => void) | null = null;
export function setDuressHandler(fn: (() => void) | null): void {
  onDuressPin = fn;
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function derive(pin: string, salt: Uint8Array): Uint8Array {
  return pbkdf2(sha256, utf8ToBytes(pin), salt, { c: ITERATIONS, dkLen: 32 });
}

export function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Seconds of lockout after [fails] consecutive failures: none below 5, then 30s doubling, capped at 1h. */
export function lockoutSeconds(fails: number): number {
  return fails >= 5 ? Math.min(3600, 30 * 2 ** (fails - 5)) : 0;
}

async function store(hashKey: string, saltKey: string, pin: string): Promise<void> {
  const salt = Crypto.getRandomBytes(16);
  await secureSet(saltKey, toB64(salt));
  await secureSet(hashKey, toB64(derive(pin, salt)));
}

async function matches(hashKey: string, saltKey: string, pin: string): Promise<boolean> {
  const h = await secureGet(hashKey);
  const s = await secureGet(saltKey);
  if (!h || !s) return false;
  return constantTimeEquals(fromB64(h), derive(pin, fromB64(s)));
}

export const isValidPinFormat = (pin: string) => /^\d{4,8}$/.test(pin);

export async function setAppLockPin(pin: string): Promise<void> {
  if (!isValidPinFormat(pin)) throw new Error('PIN must be 4 to 8 digits');
  await store('pin_hash', 'pin_salt', pin);
  await plainRemove(K.pinFails);
  await plainRemove(K.pinLockUntil);
  await setBool(K.appLockEnabled, true);
}

export const getAppLockEnabled = () => getBool(K.appLockEnabled);

export async function getPinLockoutSeconds(): Promise<number> {
  const until = parseInt((await plainGet(K.pinLockUntil)) ?? '0', 10);
  const remaining = until - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/** True for the real PIN AND for the duress PIN (which silently triggers [onDuressPin]). */
export async function checkAppLockPin(pin: string): Promise<boolean> {
  if ((await getPinLockoutSeconds()) > 0) return false;
  if (await matches('pin_hash', 'pin_salt', pin)) {
    await plainRemove(K.pinFails);
    await plainRemove(K.pinLockUntil);
    return true;
  }
  if (await matches('duress_hash', 'duress_salt', pin)) {
    onDuressPin?.();
    return true; // indistinguishable from a normal unlock
  }
  const fails = parseInt((await plainGet(K.pinFails)) ?? '0', 10) + 1;
  await plainSet(K.pinFails, String(fails));
  const secs = lockoutSeconds(fails);
  if (secs > 0) await plainSet(K.pinLockUntil, String(Date.now() + secs * 1000));
  return false;
}

export async function setDuressPin(pin: string): Promise<void> {
  if (!isValidPinFormat(pin)) throw new Error('PIN must be 4 to 8 digits');
  if (await matches('pin_hash', 'pin_salt', pin)) throw new Error('Duress PIN must differ from your real PIN');
  await store('duress_hash', 'duress_salt', pin);
}
export const hasDuressPin = async () => (await secureGet('duress_hash')) != null;
export async function clearDuressPin(): Promise<void> {
  await secureDelete('duress_hash');
  await secureDelete('duress_salt');
}
export async function clearAppLock(): Promise<void> {
  await secureDelete('pin_hash');
  await secureDelete('pin_salt');
  await clearDuressPin();
  await plainRemove(K.pinFails);
  await plainRemove(K.pinLockUntil);
  await setBool(K.appLockEnabled, false);
}
