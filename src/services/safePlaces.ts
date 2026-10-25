import { LatLng, haversine } from '../lib/geo';
import { fetchJson } from '../lib/http';
import { newId } from '../lib/id';
import { Fix, watchPosition } from '../lib/location';
import { notifyNow } from '../lib/notify';
import { plainGetJSON, plainSetJSON, secureGetJSON, secureSetJSON } from '../lib/storage';
import { logEvent } from './audit';

/**
 * Safe Places.
 *  1. Your own places (home, work...) with a geofence and enter/exit alerts. Stored encrypted.
 *  2. Real nearby help from OpenStreetMap (police, hospitals, clinics, pharmacies, fire stations, shelters)
 *     via the Overpass API. These replace the original app's hard-coded New York sample entries.
 */
export type HelpKind = 'police' | 'hospital' | 'clinic' | 'pharmacy' | 'fire_station' | 'shelter';

export interface NearbyHelp extends LatLng {
  id: string;
  kind: HelpKind;
  name: string;
  phone?: string;
  address?: string;
  openingHours?: string;
  distanceM: number;
}

export interface UserPlace extends LatLng {
  id: string;
  name: string;
  radiusM: number;
  tags: string[];
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
  createdAt: string;
  lastVisitedAt?: string;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function kindOf(tags: Record<string, string> = {}): HelpKind | null {
  switch (tags.amenity) {
    case 'police': return 'police';
    case 'hospital': return 'hospital';
    case 'clinic': return 'clinic';
    case 'pharmacy': return 'pharmacy';
    case 'fire_station': return 'fire_station';
    default: return tags.social_facility === 'shelter' ? 'shelter' : null;
  }
}

export const KIND_LABEL: Record<HelpKind, string> = {
  police: 'Police station',
  hospital: 'Hospital',
  clinic: 'Clinic',
  pharmacy: 'Pharmacy',
  fire_station: 'Fire station',
  shelter: 'Shelter',
};

export function parseOverpass(r: { elements: OverpassElement[] }, at: LatLng): NearbyHelp[] {
  const out: NearbyHelp[] = [];
  for (const e of r.elements ?? []) {
    const kind = kindOf(e.tags);
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!kind || lat == null || lon == null) continue;
    const t = e.tags ?? {};
    const street = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] ?? t['addr:city']].filter(Boolean).join(' ');
    out.push({
      id: `osm:${e.type}/${e.id}`,
      kind,
      name: t.name ?? KIND_LABEL[kind],
      phone: t.phone ?? t['contact:phone'],
      address: street || undefined,
      openingHours: t.opening_hours,
      latitude: lat,
      longitude: lon,
      distanceM: haversine(at, { latitude: lat, longitude: lon }),
    });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

const TTL_MS = 24 * 3600_000;
interface CacheEntry {
  at: number;
  items: NearbyHelp[];
}

export async function fetchNearbyHelp(at: LatLng, radiusM = 5000, force = false): Promise<{ items: NearbyHelp[]; cached: boolean }> {
  const key = `nearby_help_${at.latitude.toFixed(2)}_${at.longitude.toFixed(2)}_${radiusM}`;
  const cached = await plainGetJSON<CacheEntry | null>(key, null);
  if (cached && !force && Date.now() - cached.at < TTL_MS) {
    // distances are relative to the cached query point: recompute for the current position
    return { items: cached.items.map((i) => ({ ...i, distanceM: haversine(at, i) })).sort((a, b) => a.distanceM - b.distanceM), cached: true };
  }
  const q = `[out:json][timeout:25];(nwr["amenity"~"^(police|hospital|clinic|pharmacy|fire_station)$"](around:${radiusM},${at.latitude},${at.longitude});nwr["social_facility"="shelter"](around:${radiusM},${at.latitude},${at.longitude}););out center tags 120;`;
  try {
    const res = await fetchJson<{ elements: OverpassElement[] }>(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, { timeoutMs: 30000 });
    const items = parseOverpass(res, at);
    await plainSetJSON(key, { at: Date.now(), items } satisfies CacheEntry);
    return { items, cached: false };
  } catch (e) {
    if (cached) return { items: cached.items.map((i) => ({ ...i, distanceM: haversine(at, i) })).sort((a, b) => a.distanceM - b.distanceM), cached: true };
    throw e;
  }
}

export function openInMapsUrl(p: LatLng, label?: string): string {
  const q = `${p.latitude},${p.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}${label ? `&query_place_id=&q=${encodeURIComponent(label)}` : ''}`;
}

// ---------------------------------------------------------------- user places
const KEY = 'safe_places_user';
export const getUserPlaces = () => secureGetJSON<UserPlace[]>(KEY, []);

export function validatePlace(name: string, radiusM: number): string | null {
  if (!name.trim()) return 'Enter a name';
  if (!(radiusM >= 50 && radiusM <= 2000)) return 'Radius must be between 50 and 2000 m';
  return null;
}

export async function addUserPlace(p: { name: string; at: LatLng; radiusM: number; tags?: string[]; notifyOnEnter?: boolean; notifyOnExit?: boolean }): Promise<UserPlace> {
  const err = validatePlace(p.name, p.radiusM);
  if (err) throw new Error(err);
  const place: UserPlace = {
    id: newId('sp'),
    name: p.name.trim(),
    latitude: p.at.latitude,
    longitude: p.at.longitude,
    radiusM: p.radiusM,
    tags: p.tags ?? [],
    notifyOnEnter: p.notifyOnEnter ?? true,
    notifyOnExit: p.notifyOnExit ?? true,
    createdAt: new Date().toISOString(),
  };
  await secureSetJSON(KEY, [...(await getUserPlaces()), place]);
  return place;
}
export async function removeUserPlace(id: string): Promise<void> {
  await secureSetJSON(KEY, (await getUserPlaces()).filter((p) => p.id !== id));
}

// ---------------------------------------------------------------- geofencing
export interface GeofenceEvent {
  placeId: string;
  kind: 'enter' | 'exit';
}

/** Pure geofence step with 10% hysteresis so GPS jitter at the edge does not spam alerts. */
export function geofenceStep(places: UserPlace[], inside: Set<string>, at: LatLng): { events: GeofenceEvent[]; inside: Set<string> } {
  const next = new Set(inside);
  const events: GeofenceEvent[] = [];
  for (const p of places) {
    const d = haversine(at, p);
    const was = inside.has(p.id);
    if (!was && d <= p.radiusM) {
      next.add(p.id);
      events.push({ placeId: p.id, kind: 'enter' });
    } else if (was && d > p.radiusM * 1.1) {
      next.delete(p.id);
      events.push({ placeId: p.id, kind: 'exit' });
    }
  }
  return { events, inside: next };
}

let sub: { remove: () => void } | null = null;
let inside = new Set<string>();
export const isGeofenceActive = () => sub != null;

export async function startGeofenceMonitoring(): Promise<boolean> {
  if (sub) return true;
  sub = await watchPosition(async (f: Fix) => {
    const places = await getUserPlaces();
    const step = geofenceStep(places, inside, f);
    inside = step.inside;
    for (const ev of step.events) {
      const p = places.find((x) => x.id === ev.placeId);
      if (!p) continue;
      if (ev.kind === 'enter') {
        await secureSetJSON(KEY, places.map((x) => (x.id === p.id ? { ...x, lastVisitedAt: new Date().toISOString() } : x)));
      }
      if ((ev.kind === 'enter' && p.notifyOnEnter) || (ev.kind === 'exit' && p.notifyOnExit)) {
        await notifyNow(ev.kind === 'enter' ? `Arrived: ${p.name}` : `Left: ${p.name}`, ev.kind === 'enter' ? 'You are inside this safe place.' : 'You have left this safe place.');
      }
      await logEvent(`geofence_${ev.kind}`, `Geofence ${ev.kind}`, { placeTag: p.tags[0] ?? 'place' });
    }
  }, { distanceInterval: 25, timeInterval: 15000 });
  return sub != null;
}
export function stopGeofenceMonitoring(): void {
  sub?.remove();
  sub = null;
  inside = new Set();
}
