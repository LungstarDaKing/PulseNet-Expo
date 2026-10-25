import { Vibration } from 'react-native';
import { cancelNotification, notifyAt, notifyNow } from '../lib/notify';
import { Fix, watchPosition } from '../lib/location';
import { LatLng } from '../lib/geo';
import { secureGetJSON, secureSetJSON } from '../lib/storage';
import { logEvent } from './audit';
import { JourneyMonitor } from './journey';
import { getActiveProfile } from './safetyProfiles';
import { safetyState } from './safetyState';
import { dispatchSos, sendAllClear, sendMessageToContacts, sendSmsTo } from './sos';
import { getContacts } from './contacts';
import { getUserName } from './settings';
import { mapLink } from '../lib/geo';

/**
 * Walk With Me (timer + auto-escalation) and Companion Walk (route + check-ins).
 * Timers run in the app; a local notification is also scheduled so the user is alerted in the background.
 * Do not force-close the app while walking: foreground timers stop with the process.
 */
export const GRACE_SECONDS = 60;

export interface WalkState {
  active: boolean;
  endAt: number | null;
  graceUntil: number | null;
  notificationId: string | null;
  durationMin: number;
}
const WALK_KEY = 'walk_state';
const IDLE: WalkState = { active: false, endAt: null, graceUntil: null, notificationId: null, durationMin: 0 };

let walk: WalkState = IDLE;
let walkTimer: ReturnType<typeof setInterval> | null = null;
const walkListeners = new Set<(s: WalkState) => void>();
export const onWalk = (l: (s: WalkState) => void) => {
  walkListeners.add(l);
  return () => { walkListeners.delete(l); };
};
const setWalk = async (s: WalkState) => {
  walk = s;
  walkListeners.forEach((l) => l(s));
  await secureSetJSON(WALK_KEY, s);
};
export const getWalk = () => walk;

/** Pure state step used by the timer and the tests. */
export function walkStep(s: WalkState, now: number): { next: WalkState; action: 'none' | 'grace' | 'escalate' } {
  if (!s.active || s.endAt == null) return { next: s, action: 'none' };
  if (s.graceUntil != null) return now >= s.graceUntil ? { next: s, action: 'escalate' } : { next: s, action: 'none' };
  if (now >= s.endAt) return { next: { ...s, graceUntil: now + GRACE_SECONDS * 1000 }, action: 'grace' };
  return { next: s, action: 'none' };
}

async function tickWalk(): Promise<void> {
  const { next, action } = walkStep(walk, Date.now());
  if (action === 'grace') {
    await setWalk(next);
    Vibration.vibrate([0, 500, 300, 500, 300, 500], true);
    await logEvent('walk_timer_expired', 'Walk timer ended, waiting for confirmation', undefined, 'warning');
  } else if (action === 'escalate') {
    Vibration.cancel();
    stopWalkTimer();
    await setWalk(IDLE);
    safetyState.setRed(false);
    await dispatchSos({ emergencyType: 'Walk With Me timer expired without confirmation' });
  }
}
function stopWalkTimer() {
  if (walkTimer) clearInterval(walkTimer);
  walkTimer = null;
}

export async function startWalk(minutes: number, announce: boolean): Promise<void> {
  if (!(minutes >= 1 && minutes <= 240)) throw new Error('Choose 1 to 240 minutes');
  const endAt = Date.now() + minutes * 60_000;
  const notificationId = await notifyAt(new Date(endAt), 'Walk timer finished', `Open PulseNet within ${GRACE_SECONDS}s and confirm you are safe, or your contacts will be alerted.`);
  await setWalk({ active: true, endAt, graceUntil: null, notificationId, durationMin: minutes });
  if (announce) {
    const sent = await sendMessageToContacts(`I am walking and expect to be done in ${minutes} min. I will message when I am safe.`, { allowComposer: true });
    await logEvent('walk_started', 'Walk With Me started', { minutes, contactsMessaged: sent });
  }
  stopWalkTimer();
  walkTimer = setInterval(() => void tickWalk(), 1000);
}

export async function confirmWalkSafe(): Promise<void> {
  Vibration.cancel();
  await cancelNotification(walk.notificationId);
  stopWalkTimer();
  await setWalk(IDLE);
  await sendAllClear();
  await logEvent('walk_safe', 'Walk ended safely');
}
export async function extendWalk(extraMin: number): Promise<void> {
  if (!walk.active || walk.endAt == null) return;
  Vibration.cancel();
  await cancelNotification(walk.notificationId);
  const endAt = Math.max(walk.endAt, Date.now()) + extraMin * 60_000;
  const notificationId = await notifyAt(new Date(endAt), 'Walk timer finished', 'Confirm you are safe.');
  await setWalk({ ...walk, endAt, graceUntil: null, notificationId });
}

/** Restores an unfinished walk after the app was restarted. */
export async function restoreWalk(): Promise<WalkState> {
  const saved = await secureGetJSON<WalkState>(WALK_KEY, IDLE);
  walk = saved;
  if (saved.active) {
    stopWalkTimer();
    walkTimer = setInterval(() => void tickWalk(), 1000);
  }
  return saved;
}

// ===================================================================== companion walk
export interface CompanionState {
  active: boolean;
  companionIds: string[];
  destinationName: string;
  route: LatLng[];
  startedAt: number;
  checkInMinutes: number;
  maxMissed: number;
  nextCheckInAt: number | null;
  pendingUntil: number | null;
  missed: number;
  lastLevel: 'ok' | 'warning' | 'critical';
  lastReason: string;
}
const COMP_KEY = 'companion_state';
const COMP_IDLE: CompanionState = { active: false, companionIds: [], destinationName: '', route: [], startedAt: 0, checkInMinutes: 30, maxMissed: 2, nextCheckInAt: null, pendingUntil: null, missed: 0, lastLevel: 'ok', lastReason: '' };
const RESPONSE_WINDOW_MS = 2 * 60_000;

let comp: CompanionState = COMP_IDLE;
let compTimer: ReturnType<typeof setInterval> | null = null;
let compSub: { remove: () => void } | null = null;
let monitor: JourneyMonitor | null = null;
const compListeners = new Set<(s: CompanionState) => void>();
export const onCompanion = (l: (s: CompanionState) => void) => {
  compListeners.add(l);
  return () => { compListeners.delete(l); };
};
export const getCompanion = () => comp;
const setComp = async (s: CompanionState) => {
  comp = s;
  compListeners.forEach((l) => l(s));
  await secureSetJSON(COMP_KEY, s);
};

/** Pure check-in scheduler used by the timer and tests. */
export function companionStep(s: CompanionState, now: number): { next: CompanionState; action: 'none' | 'prompt' | 'missed' | 'escalate' } {
  if (!s.active) return { next: s, action: 'none' };
  if (s.pendingUntil != null) {
    if (now < s.pendingUntil) return { next: s, action: 'none' };
    const missed = s.missed + 1;
    if (missed >= s.maxMissed) return { next: { ...s, missed, pendingUntil: null }, action: 'escalate' };
    return { next: { ...s, missed, pendingUntil: null, nextCheckInAt: now + s.checkInMinutes * 60_000 }, action: 'missed' };
  }
  if (s.nextCheckInAt != null && now >= s.nextCheckInAt) return { next: { ...s, pendingUntil: now + RESPONSE_WINDOW_MS }, action: 'prompt' };
  return { next: s, action: 'none' };
}

async function companionPhones(ids: string[]): Promise<string[]> {
  return (await getContacts()).filter((c) => ids.includes(c.id)).map((c) => c.phone);
}

async function tickCompanion(): Promise<void> {
  const { next, action } = companionStep(comp, Date.now());
  if (action === 'none') return;
  await setComp(next);
  if (action === 'prompt') {
    Vibration.vibrate([0, 400, 200, 400]);
    await notifyNow('Check-in', 'Tap "I am OK" in PulseNet within 2 minutes.');
  } else if (action === 'missed') {
    await notifyNow('Missed check-in', `${next.missed} missed. Open PulseNet and confirm you are OK.`);
    await logEvent('companion_missed', 'Companion check-in missed', { missed: next.missed }, 'warning');
  } else if (action === 'escalate') {
    await escalateCompanion('missed check-ins');
  }
}

async function escalateCompanion(reason: string): Promise<void> {
  const phones = await companionPhones(comp.companionIds);
  const who = (await getUserName()) || 'Your contact';
  safetyState.setRed(false);
  await sendSmsTo(phones, `${who} may need help: ${reason} during a walk to ${comp.destinationName || 'a destination'}. Please call them now.`, { allowComposer: true });
  await dispatchSos({ emergencyType: `Companion walk: ${reason}` });
  await logEvent('companion_escalated', 'Companion walk escalated', { reason }, 'critical');
  await stopCompanion(false);
}

export async function startCompanion(o: { companionIds: string[]; destinationName: string; route: LatLng[]; origin: LatLng }): Promise<void> {
  if (o.companionIds.length === 0) throw new Error('Pick at least one companion');
  const profile = await getActiveProfile();
  const now = Date.now();
  await setComp({
    ...COMP_IDLE,
    active: true,
    companionIds: o.companionIds,
    destinationName: o.destinationName,
    route: o.route,
    startedAt: now,
    checkInMinutes: profile.checkInMinutes,
    maxMissed: profile.maxMissedCheckIns,
    nextCheckInAt: now + profile.checkInMinutes * 60_000,
  });
  const who = (await getUserName()) || 'Your contact';
  await sendSmsTo(await companionPhones(o.companionIds), `${who} started walking to ${o.destinationName || 'a destination'}. Start: ${mapLink(o.origin)}. You will get an alert if they miss check-ins. - PulseNet`, { allowComposer: true });
  await beginMonitoring(profile.deviationWarnMeters);
  await logEvent('companion_started', 'Companion walk started', { companions: o.companionIds.length });
}

async function beginMonitoring(devWarn: number) {
  monitor = new JourneyMonitor({ route: comp.route, deviationWarnM: devWarn, deviationCritM: devWarn * 2 });
  compSub?.remove();
  compSub = await watchPosition(async (f: Fix) => {
    const a = monitor!.add({ latitude: f.latitude, longitude: f.longitude, t: f.timestamp, accuracy: f.accuracy });
    if (a.level !== comp.lastLevel) {
      await setComp({ ...comp, lastLevel: a.level, lastReason: a.reasons.join('; ') });
      if (a.level === 'critical') {
        // ask the walker to confirm: a missed answer escalates
        await setComp({ ...comp, pendingUntil: Date.now() + RESPONSE_WINDOW_MS });
        await notifyNow('Are you OK?', `${a.reasons.join('; ')}. Confirm in PulseNet.`);
      } else if (a.level === 'warning') {
        await notifyNow('Check your route', a.reasons.join('; '));
      }
    }
  }, { distanceInterval: 15, timeInterval: 5000 });
  if (compTimer) clearInterval(compTimer);
  compTimer = setInterval(() => void tickCompanion(), 5000);
}

export async function confirmCompanionOk(): Promise<void> {
  if (!comp.active) return;
  Vibration.cancel();
  await setComp({ ...comp, missed: 0, pendingUntil: null, nextCheckInAt: Date.now() + comp.checkInMinutes * 60_000, lastLevel: 'ok', lastReason: '' });
  await logEvent('companion_ok', 'Companion check-in confirmed');
}

export async function stopCompanion(arrived: boolean): Promise<void> {
  const phones = await companionPhones(comp.companionIds);
  compSub?.remove();
  compSub = null;
  if (compTimer) clearInterval(compTimer);
  compTimer = null;
  const wasActive = comp.active;
  await setComp(COMP_IDLE);
  if (arrived && wasActive) {
    const who = (await getUserName()) || 'Your contact';
    await sendSmsTo(phones, `${who} has arrived safely. - PulseNet`, { allowComposer: true });
  }
}

export async function restoreCompanion(): Promise<CompanionState> {
  const saved = await secureGetJSON<CompanionState>(COMP_KEY, COMP_IDLE);
  comp = saved;
  if (saved.active) await beginMonitoring((await getActiveProfile()).deviationWarnMeters);
  return saved;
}
