import { LatLng, distanceToRoute, haversine, mapLink } from '../lib/geo';
import { newId } from '../lib/id';
import { Fix, getPosition, watchPosition } from '../lib/location';
import { notifyNow } from '../lib/notify';
import { secureGetJSON, secureSetJSON } from '../lib/storage';
import { logEvent } from './audit';
import { getContacts } from './contacts';
import { getRoute, straightLine } from './routing';
import { safetyState } from './safetyState';
import { dispatchSos, sendSmsTo } from './sos';
import { getUserName } from './settings';

/** Taxi / e-hailing ride safety: real route (OSRM), live deviation checks, shareable ride details. */
export const CHECKS = [
  { key: 'plateMatches', label: 'Number plate matches the booking' },
  { key: 'driverMatches', label: 'Driver matches the photo in the app' },
  { key: 'bookedInApp', label: 'Ride was booked in the app (not street hail)' },
  { key: 'childLocksOff', label: 'Doors open from the inside' },
  { key: 'routeFollowed', label: 'Route matches the map' },
] as const;
export type CheckKey = (typeof CHECKS)[number]['key'];

export interface Ride {
  id: string;
  startedAt: string;
  endedAt?: string;
  driverName: string;
  plate: string;
  vehicle: string;
  operator: string;
  destinationName: string;
  destination?: LatLng;
  expectedRoute: LatLng[];
  routeSource: 'osrm' | 'straight-line' | 'none';
  trail: LatLng[];
  checks: Record<CheckKey, boolean>;
  concerns: string[];
  deviations: number;
  sharedWith: string[];
  riskScore: number;
  status: 'active' | 'completed';
}

export const DEVIATION_M = 300;
const ACTIVE = 'taxi_active_ride';
const HISTORY = 'taxi_history';

export function validateRide(d: { driverName: string; plate: string }): string | null {
  if (!d.plate.trim()) return 'Enter the number plate';
  if (!/^[A-Za-z0-9 -]{3,12}$/.test(d.plate.trim())) return 'Plate looks wrong: use letters and numbers only';
  return null;
}

/** Transparent 0-100 risk score. Higher = riskier. */
export function riskScore(r: Pick<Ride, 'checks' | 'deviations' | 'concerns'> & { startedAt: string }, now = new Date()): number {
  let s = 0;
  for (const c of CHECKS) if (!r.checks[c.key]) s += c.key === 'plateMatches' || c.key === 'driverMatches' ? 15 : 8;
  s += Math.min(30, r.deviations * 15);
  s += Math.min(15, r.concerns.length * 5);
  const h = new Date(r.startedAt).getHours();
  if (h >= 22 || h < 5) s += 10;
  void now;
  return Math.min(100, s);
}
export const riskLabel = (s: number) => (s >= 60 ? 'High' : s >= 30 ? 'Elevated' : 'Low');

let ride: Ride | null = null;
let sub: { remove: () => void } | null = null;
let offRouteStreak = 0;
const listeners = new Set<(r: Ride | null) => void>();
export const onRide = (l: (r: Ride | null) => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
const commit = async (r: Ride | null) => {
  ride = r;
  listeners.forEach((l) => l(r));
  if (r) await secureSetJSON(ACTIVE, r);
  else await secureSetJSON(ACTIVE, null);
};
export const currentRide = () => ride;
export async function restoreRide(): Promise<Ride | null> {
  const saved = await secureGetJSON<Ride | null>(ACTIVE, null);
  ride = saved && saved.status === 'active' ? saved : null;
  if (ride) await track();
  return ride;
}
export const getHistory = () => secureGetJSON<Ride[]>(HISTORY, []);

export async function startRide(d: { driverName: string; plate: string; vehicle: string; operator: string; destinationName: string; destination?: LatLng }): Promise<Ride> {
  const err = validateRide(d);
  if (err) throw new Error(err);
  const here = await getPosition();
  let route: LatLng[] = [];
  let routeSource: Ride['routeSource'] = 'none';
  if (here && d.destination) {
    try {
      const r = await getRoute(here, d.destination, 'driving');
      if (r) {
        route = r.points;
        routeSource = 'osrm';
      }
    } catch {
      // fall through
    }
    if (route.length === 0) {
      route = straightLine(here, d.destination).points;
      routeSource = 'straight-line';
    }
  }
  const base = {
    id: newId('r'),
    startedAt: new Date().toISOString(),
    ...d,
    plate: d.plate.trim().toUpperCase(),
    expectedRoute: route,
    routeSource,
    trail: here ? [here] : [],
    checks: { plateMatches: false, driverMatches: false, bookedInApp: false, childLocksOff: false, routeFollowed: true } as Record<CheckKey, boolean>,
    concerns: [] as string[],
    deviations: 0,
    sharedWith: [] as string[],
    status: 'active' as const,
  };
  await commit({ ...base, riskScore: riskScore(base) });
  safetyState.startJourney(base.id);
  await logEvent('taxi_started', 'Ride safety started', { route: routeSource });
  await track();
  return ride!;
}

async function track() {
  sub?.remove();
  offRouteStreak = 0;
  sub = await watchPosition((f) => void onFix(f), { distanceInterval: 30, timeInterval: 10000 });
}

async function onFix(f: Fix) {
  if (!ride) return;
  const trail = [...ride.trail, { latitude: f.latitude, longitude: f.longitude }].slice(-300);
  let deviations = ride.deviations;
  if (ride.expectedRoute.length >= 2 && (f.accuracy ?? 0) <= 100) {
    if (distanceToRoute(f, ride.expectedRoute) > DEVIATION_M) offRouteStreak++;
    else offRouteStreak = 0;
    if (offRouteStreak === 2) {
      deviations++;
      await notifyNow('Route deviation', 'Your ride is more than 300 m off the expected route. Check where you are going.');
      await logEvent('taxi_deviation', 'Ride left expected route', undefined, 'warning');
    }
  }
  const next = { ...ride, trail, deviations };
  await commit({ ...next, riskScore: riskScore(next) });
}

export async function setCheck(key: CheckKey, v: boolean) {
  if (!ride) return;
  const next = { ...ride, checks: { ...ride.checks, [key]: v } };
  await commit({ ...next, riskScore: riskScore(next) });
}
export async function reportConcern(text: string) {
  if (!ride || !text.trim()) return;
  const next = { ...ride, concerns: [...ride.concerns, text.trim()] };
  await commit({ ...next, riskScore: riskScore(next) });
  await logEvent('taxi_concern', 'Ride concern recorded', { count: next.concerns.length }, 'warning');
}

/** SMS to chosen contacts with driver, plate and a live-location link. Returns how many were reached. */
export async function shareRide(contactIds: string[]): Promise<number> {
  if (!ride) return 0;
  const phones = (await getContacts()).filter((c) => contactIds.includes(c.id)).map((c) => c.phone);
  const here = await getPosition();
  const who = (await getUserName()) || 'Your contact';
  const msg = `${who} is in a ${ride.operator || 'taxi'}: ${ride.vehicle || 'vehicle'} plate ${ride.plate}, driver ${ride.driverName || 'unknown'}. Going to ${ride.destinationName || 'a destination'}. ${here ? `Now: ${mapLink(here)}` : ''} - PulseNet`;
  const n = await sendSmsTo(phones, msg, { allowComposer: true });
  if (n > 0) await commit({ ...ride, sharedWith: [...new Set([...ride.sharedWith, ...contactIds])] });
  await logEvent('taxi_shared', 'Ride shared', { contacts: n });
  return n;
}

export async function rideEmergency(): Promise<void> {
  if (!ride) return;
  safetyState.setRed(false);
  await dispatchSos({ emergencyType: `taxi ride, plate ${ride.plate}` });
}

export async function endRide(): Promise<Ride | null> {
  if (!ride) return null;
  sub?.remove();
  sub = null;
  const done: Ride = { ...ride, status: 'completed', endedAt: new Date().toISOString() };
  const hist = await getHistory();
  await secureSetJSON(HISTORY, [done, ...hist].slice(0, 30));
  await commit(null);
  safetyState.endJourney();
  await logEvent('taxi_ended', 'Ride ended', { deviations: done.deviations, risk: done.riskScore });
  return done;
}

export const rideDistanceM = (r: Ride) => r.trail.reduce((s, p, i) => (i ? s + haversine(r.trail[i - 1], p) : 0), 0);
