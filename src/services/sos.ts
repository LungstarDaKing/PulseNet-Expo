import * as SMS from 'expo-sms';
import { Fix, getPosition, ensureLocationPermission, watchPosition } from '../lib/location';
import { mapLink } from '../lib/geo';
import { callNumber, sendSmsSilently } from '../lib/native';
import { normalizePhone } from '../lib/phone';
import { clock } from '../lib/id';
import { logEvent } from './audit';
import { contactNumbers } from './contacts';
import { getActiveProfile } from './safetyProfiles';
import { getLocationSharing, getSettings, getUserName } from './settings';

/**
 * Outcome of an SOS dispatch. The UI must show this honestly: never say "help is on the way"
 * unless `delivered` is true. `delivered` means the SMS was handed to the phone's radio;
 * network delivery to the recipient cannot be confirmed by Android.
 */
export interface SosResult {
  contactsTotal: number;
  smsSent: number;
  locationIncluded: boolean;
  usedManualComposer: boolean;
  noContacts: boolean;
  simulated: boolean;
  duplicate: boolean;
  composerOpened?: boolean;
}
export const delivered = (r: SosResult): boolean => !r.simulated && r.smsSent > 0;

const DEDUPE_WINDOW_MS = 10_000;
const MAX_FOLLOW_UPS = 20;

let alertActive = false;
let followUpTimer: ReturnType<typeof setInterval> | null = null;
let followUps = 0;
let lastDispatch: { at: number; type: string; result: SosResult } | null = null;
let inFlight: Promise<SosResult> | null = null;
let trackSub: { remove: () => void } | null = null;

export const isEmergencyActive = () => alertActive;

/** Plain ASCII on purpose: keeps the SMS in cheap GSM-7 segments. */
export function buildMessage(o: { name: string; emergencyType: string; position?: Fix | null; isUpdate?: boolean; now?: Date }): string {
  const who = o.name || 'Your contact';
  let s = o.isUpdate ? `UPDATE: ${who} is still in danger. ` : `EMERGENCY! ${who} needs help NOW (${o.emergencyType}). `;
  if (o.position) {
    s += `Location: ${mapLink(o.position)} (+/-${Math.round(o.position.accuracy ?? 0)}m at ${clock(o.now)}). `;
  } else {
    s += 'Location unavailable - call them. ';
  }
  if (!o.isUpdate) s += 'Call them, then SAPS 10111 or GBV line 0800 428 428. ';
  return s + 'Sent by PulseNet.';
}

async function sendSms(numbers: string[], message: string): Promise<number> {
  if (numbers.length === 0) return 0;
  return sendSmsSilently(numbers, message);
}

async function openComposer(numbers: string[], message: string): Promise<boolean> {
  try {
    if (!(await SMS.isAvailableAsync())) return false;
    await SMS.sendSMSAsync(numbers, message);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sends the alert SMS (with a map link) to every emergency contact. Needs only a cellular signal.
 * Protected against duplicate submissions: a second identical dispatch within 10 s returns the first result.
 */
export function dispatchSos(opts: { emergencyType?: string; silent?: boolean } = {}): Promise<SosResult> {
  const type = opts.emergencyType ?? 'manual SOS';
  if (inFlight) return inFlight.then((r) => ({ ...r, duplicate: true }));
  if (lastDispatch && lastDispatch.type === type && Date.now() - lastDispatch.at < DEDUPE_WINDOW_MS) {
    return Promise.resolve({ ...lastDispatch.result, duplicate: true });
  }
  inFlight = doDispatch(type, !!opts.silent).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doDispatch(type: string, silent: boolean): Promise<SosResult> {
  const numbers = await contactNumbers();
  const settings = await getSettings();
  const sharing = await getLocationSharing();
  const position = sharing ? await getPosition() : null;
  const name = await getUserName();

  if (numbers.length === 0) {
    await logEvent('sos_no_contacts', 'SOS triggered but no emergency contacts configured', undefined, 'warning');
    return { contactsTotal: 0, smsSent: 0, locationIncluded: false, usedManualComposer: false, noContacts: true, simulated: false, duplicate: false };
  }

  const message = buildMessage({ name, emergencyType: type, position });

  if (settings.drillMode) {
    // Drill: nothing is sent to anybody.
    await logEvent('sos_drill', 'SOS drill completed, no message sent', { contactsTotal: numbers.length, locationIncluded: !!position });
    const r: SosResult = { contactsTotal: numbers.length, smsSent: 0, locationIncluded: !!position, usedManualComposer: false, noContacts: false, simulated: true, duplicate: false };
    lastDispatch = { at: Date.now(), type, result: r };
    return r;
  }

  let sent = await sendSms(numbers, message);
  let usedComposer = false;
  if (sent <= 0 && !silent) usedComposer = await openComposer(numbers, message);

  alertActive = sent > 0 || usedComposer;
  if (alertActive) void startFollowUps(name, numbers);

  // Audit holds counts only: no numbers, no coordinates.
  await logEvent(sent > 0 ? 'sos_sms_sent' : 'sos_sms_failed', `SOS dispatch (${silent ? 'silent' : 'visible'})`, {
    contactsTotal: numbers.length,
    smsSent: Math.max(0, sent),
    locationIncluded: !!position,
    manualComposer: usedComposer,
    emergencyType: type,
  }, sent > 0 ? 'critical' : 'error');

  const r: SosResult = {
    contactsTotal: numbers.length,
    smsSent: Math.max(0, sent),
    locationIncluded: !!position,
    usedManualComposer: usedComposer,
    noContacts: false,
    simulated: false,
    duplicate: false,
  };
  lastDispatch = { at: Date.now(), type, result: r };
  return r;
}

async function startFollowUps(name: string, numbers: string[]): Promise<void> {
  if (followUpTimer) clearInterval(followUpTimer);
  followUps = 0;
  const every = (await getActiveProfile()).followUpMinutes * 60_000;
  followUpTimer = setInterval(async () => {
    if (!alertActive || followUps >= MAX_FOLLOW_UPS) {
      if (followUpTimer) clearInterval(followUpTimer);
      followUpTimer = null;
      return;
    }
    const p = await getPosition();
    if (!p) return;
    followUps++;
    await sendSms(numbers, buildMessage({ name, emergencyType: '', position: p, isUpdate: true }));
  }, every);
}

/** Tells contacts the user is safe (prevents panic after a false alarm). */
export async function sendAllClear(): Promise<number> {
  const numbers = await contactNumbers();
  if (numbers.length === 0) return 0;
  const name = (await getUserName()) || 'Your contact';
  if ((await getSettings()).drillMode) return 0;
  const n = await sendSms(numbers, `UPDATE: ${name} is SAFE. Please ignore the earlier emergency alert. - PulseNet`);
  await logEvent('sos_all_clear_sent', 'All-clear sent to contacts', { contactsTotal: numbers.length });
  return Math.max(0, n);
}

/** Sends [message] to specific phone numbers (not the emergency-contact list). */
export async function sendSmsTo(phones: string[], message: string, opts: { allowComposer?: boolean } = {}): Promise<number> {
  const numbers = [...new Set(phones.map(normalizePhone).filter((n) => n.length >= 7))];
  if (numbers.length === 0) return 0;
  if ((await getSettings()).drillMode) return 0;
  const sent = await sendSms(numbers, message);
  if (sent > 0) return sent;
  if (opts.allowComposer && (await openComposer(numbers, message))) return numbers.length;
  return 0;
}

/** Sends a custom SMS (walk updates, escalations) to every emergency contact. Returns how many it reached. */
export async function sendMessageToContacts(message: string, opts: { appendLocation?: boolean; allowComposer?: boolean } = {}): Promise<number> {
  const numbers = await contactNumbers();
  if (numbers.length === 0) return 0;
  let text = message;
  if ((opts.appendLocation ?? true) && (await getLocationSharing())) {
    const p = await getPosition();
    if (p) text = `${text} Location: ${mapLink(p)}`;
  }
  return sendSmsTo(numbers, `${text} - PulseNet`, { allowComposer: opts.allowComposer });
}

export async function dialEmergencyNumber(number: string): Promise<boolean> {
  const ok = await callNumber(number);
  await logEvent(ok ? 'emergency_call_dialed' : 'emergency_call_error', ok ? 'Emergency call placed' : 'Emergency call failed', { number }, ok ? 'info' : 'error');
  return ok;
}

export async function startEmergencyTracking(onFix: (f: Fix) => void): Promise<void> {
  if (trackSub || !(await ensureLocationPermission())) return;
  trackSub = await watchPosition(onFix, { distanceInterval: 10 });
}
export function stopEmergencyTracking(): void {
  trackSub?.remove();
  trackSub = null;
}

/** Ends the emergency: stops tracking/follow-ups and reassures contacts. */
export async function cancelEmergency(): Promise<void> {
  const hadAlert = alertActive;
  if (followUpTimer) clearInterval(followUpTimer);
  followUpTimer = null;
  alertActive = false;
  lastDispatch = null;
  stopEmergencyTracking();
  if (hadAlert) await sendAllClear();
  await logEvent('emergency_cancelled', 'Emergency ended by user');
}

/** Test hook. */
export function _resetForTests(): void {
  if (followUpTimer) clearInterval(followUpTimer);
  followUpTimer = null;
  alertActive = false;
  lastDispatch = null;
  inFlight = null;
}
