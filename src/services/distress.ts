import { matchDistress } from '../data/distressPhrases';
import { logEvent } from './audit';
import { dispatchSos } from './sos';
import { safetyState } from './safetyState';

/**
 * Distress listener: 4 quick taps anywhere arm the microphone for 90 s; if a distress phrase is
 * recognised a SILENT SOS is sent. Needs a development build (expo-speech-recognition is native).
 * The recogniser may use the device's speech service (online on some Android devices).
 */
export const ARM_MS = 90_000;
export const TAP_RESET_MS = 5_000;
export const TAPS_REQUIRED = 4;

/** Pure tap counter so the gesture can be tested without timers. */
export function tapStep(taps: number[], now: number): { taps: number[]; armed: boolean } {
  const recent = [...taps.filter((t) => now - t <= TAP_RESET_MS), now];
  return recent.length >= TAPS_REQUIRED ? { taps: [], armed: true } : { taps: recent, armed: false };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let taps: number[] = [];
let armed = false;
let disarmTimer: ReturnType<typeof setTimeout> | null = null;
let subs: { remove: () => void }[] = [];
let mod: any = null;
const listeners = new Set<(armed: boolean) => void>();
export const onArmed = (l: (a: boolean) => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const isArmed = () => armed;

function load(): any {
  if (mod) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
  } catch {
    mod = null;
  }
  return mod;
}
export const distressSupported = () => load() != null;

export function handleTap(now = Date.now()): void {
  if (armed) return;
  const r = tapStep(taps, now);
  taps = r.taps;
  if (r.armed) void arm();
}

export async function arm(locale = 'en-ZA'): Promise<boolean> {
  const m = load();
  if (!m) return false;
  try {
    const perm = await m.requestPermissionsAsync();
    if (!perm.granted) return false;
    armed = true;
    listeners.forEach((l) => l(true));
    subs.push(m.addListener('result', (e: any) => {
      const text: string = e?.results?.[0]?.transcript ?? '';
      const hit = matchDistress(text, locale);
      if (hit && armed) void trigger();
    }));
    subs.push(m.addListener('end', () => { if (armed) m.start({ lang: locale, interimResults: true, continuous: true }); }));
    m.start({ lang: locale, interimResults: true, continuous: true });
    disarmTimer = setTimeout(disarm, ARM_MS);
    await logEvent('distress_armed', 'Distress listener armed');
    return true;
  } catch {
    disarm();
    return false;
  }
}

async function trigger() {
  disarm();
  safetyState.setRed(true);
  await dispatchSos({ emergencyType: 'voice distress phrase', silent: true });
}

export function disarm(): void {
  armed = false;
  taps = [];
  if (disarmTimer) clearTimeout(disarmTimer);
  disarmTimer = null;
  subs.forEach((s) => s.remove());
  subs = [];
  try { load()?.stop(); } catch { /* ignore */ }
  listeners.forEach((l) => l(false));
}
