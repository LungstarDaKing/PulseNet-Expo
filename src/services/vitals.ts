import { PermissionsAndroid, Platform } from 'react-native';
import { newId } from '../lib/id';
import { notifyNow } from '../lib/notify';
import { secureGetJSON, secureSetJSON } from '../lib/storage';
import { logEvent } from './audit';
import { getSettings } from './settings';
import { sendMessageToContacts } from './sos';

/**
 * Vitals. Real sources only:
 *  - Bluetooth LE heart-rate straps/watches that expose the standard Heart Rate Service (0x180D).
 *  - Manual entry and a tap-along pulse counter.
 * The original camera-based pulse estimator relied on raw camera frames, which Expo does not expose;
 * it is NOT migrated (see docs/MIGRATION.md). Nothing here is simulated.
 */
export type Zone = 'critical-low' | 'low' | 'normal' | 'elevated' | 'critical-high';
export interface Reading { id: string; bpm: number; at: string; source: 'ble' | 'manual' | 'tap'; zone: Zone }

/** Thresholds from the original VITALS_SECTION_SUMMARY: <40 critical, 40-50 low, >120 elevated, >140 critical. */
export function classifyBpm(bpm: number): Zone {
  if (bpm < 40) return 'critical-low';
  if (bpm < 50) return 'low';
  if (bpm > 140) return 'critical-high';
  if (bpm > 120) return 'elevated';
  return 'normal';
}
export const isCritical = (z: Zone) => z === 'critical-low' || z === 'critical-high';

/** Bluetooth Heart Rate Measurement characteristic (0x2A37): flags bit0 selects uint8 vs uint16. */
export function parseHeartRate(bytes: Uint8Array): number | null {
  if (bytes.length < 2) return null;
  const v = bytes[0] & 1 ? bytes[1] | (bytes[2] << 8) : bytes[1];
  return Number.isFinite(v) && v > 0 && v < 300 ? v : null;
}
export const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** BPM from a series of tap timestamps (ms): needs at least 5 taps; uses the median interval to ignore a stray tap. */
export function bpmFromTaps(times: number[]): number | null {
  if (times.length < 5) return null;
  const gaps = times.slice(1).map((t, i) => t - times[i]).filter((g) => g > 250 && g < 2000).sort((a, b) => a - b);
  if (gaps.length < 3) return null;
  const med = gaps[Math.floor(gaps.length / 2)];
  return Math.round(60000 / med);
}

const KEY = 'vitals_history';
const MAX = 100;
const COOLDOWN_MS = 2 * 60_000;
const SUSTAINED = 3;
let recentZones: Zone[] = [];
let lastAlertAt = 0;

export const getHistory = () => secureGetJSON<Reading[]>(KEY, []);
export const clearHistory = () => secureSetJSON(KEY, []);

export interface AlertOutcome { alerted: boolean; contactsMessaged: number }

export async function recordReading(bpm: number, source: Reading['source'], now = Date.now()): Promise<{ reading: Reading; outcome: AlertOutcome }> {
  if (!(bpm >= 20 && bpm <= 260)) throw new Error('Enter a heart rate between 20 and 260');
  const reading: Reading = { id: newId('v'), bpm: Math.round(bpm), at: new Date(now).toISOString(), source, zone: classifyBpm(bpm) };
  await secureSetJSON(KEY, [reading, ...(await getHistory())].slice(0, MAX));
  recentZones = [...recentZones, reading.zone].slice(-SUSTAINED);
  const outcome: AlertOutcome = { alerted: false, contactsMessaged: 0 };
  const sustained = recentZones.length === SUSTAINED && recentZones.every(isCritical);
  if (sustained && now - lastAlertAt > COOLDOWN_MS) {
    lastAlertAt = now;
    outcome.alerted = true;
    await notifyNow('Critical heart rate', `${reading.bpm} bpm for several readings. If you feel unwell, call 10177 or 112.`);
    await logEvent('vitals_critical', 'Sustained critical heart rate', { bpm: reading.bpm }, 'critical');
    if ((await getSettings()).vitalsAutoAlert) {
      outcome.contactsMessaged = await sendMessageToContacts(`Heart rate alert: ${reading.bpm} bpm sustained. Please check on me.`);
    }
  }
  return { reading, outcome };
}
export const _resetVitalsForTests = () => { recentZones = []; lastAlertAt = 0; };

// ---------------------------------------------------------------- BLE
export interface BleDevice { id: string; name: string | null; rssi: number | null }
const HR_SERVICE = '180d';
const HR_CHAR = '2a37';

/* eslint-disable @typescript-eslint/no-explicit-any */
let manager: any = null;
let managerTried = false;
function getManager(): any {
  if (manager || managerTried) return manager;
  managerTried = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager } = require('react-native-ble-plx');
    manager = new BleManager();
  } catch {
    manager = null;
  }
  return manager;
}
export const bleSupported = () => Platform.OS === 'android' || Platform.OS === 'ios' ? getManager() != null : false;

async function bleAllowed(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const r = await PermissionsAndroid.requestMultiple([
    'android.permission.BLUETOOTH_SCAN' as any,
    'android.permission.BLUETOOTH_CONNECT' as any,
    'android.permission.ACCESS_FINE_LOCATION' as any,
  ]);
  return Object.values(r).every((v) => v === 'granted');
}

export async function scanHeartRateDevices(onDevice: (d: BleDevice) => void, ms = 10000): Promise<void> {
  const m = getManager();
  if (!m) throw new Error('Bluetooth needs a development build (not available in Expo Go)');
  if (!(await bleAllowed())) throw new Error('Bluetooth permission denied');
  await new Promise<void>((resolve, reject) => {
    m.startDeviceScan([HR_SERVICE], null, (err: any, dev: any) => {
      if (err) { m.stopDeviceScan(); reject(err); return; }
      if (dev) onDevice({ id: dev.id, name: dev.name ?? dev.localName, rssi: dev.rssi });
    });
    setTimeout(() => { m.stopDeviceScan(); resolve(); }, ms);
  });
}

let connectedId: string | null = null;
export async function connectHeartRate(id: string, onBpm: (bpm: number) => void, onDisconnect: () => void): Promise<void> {
  const m = getManager();
  if (!m) throw new Error('Bluetooth needs a development build (not available in Expo Go)');
  const dev = await m.connectToDevice(id, { timeout: 15000 });
  await dev.discoverAllServicesAndCharacteristics();
  connectedId = id;
  m.onDeviceDisconnected(id, () => { connectedId = null; onDisconnect(); });
  dev.monitorCharacteristicForService(HR_SERVICE, HR_CHAR, (err: any, ch: any) => {
    if (err || !ch?.value) return;
    const bpm = parseHeartRate(b64ToBytes(ch.value));
    if (bpm != null) onBpm(bpm);
  });
}
export async function disconnectHeartRate(): Promise<void> {
  const m = getManager();
  if (m && connectedId) {
    try { await m.cancelDeviceConnection(connectedId); } catch { /* ignore */ }
  }
  connectedId = null;
}
