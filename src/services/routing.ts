import { LatLng, haversine } from '../lib/geo';
import { fetchJson } from '../lib/http';

/**
 * Real routing and geocoding from public OpenStreetMap services:
 *  - Nominatim (geocoding) - usage policy: low volume, identify the app. https://operations.osmfoundation.org/policies/nominatim/
 *  - OSRM demo server (routing) - best effort, no SLA. For production traffic, self-host or use a paid provider.
 */
const UA = { 'User-Agent': 'PulseNet/1.0 (personal-safety app; contact via app store listing)' };

export interface Place extends LatLng {
  name: string;
}

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
}

export function parseNominatim(items: NominatimItem[]): Place[] {
  return items
    .map((i) => ({ latitude: parseFloat(i.lat), longitude: parseFloat(i.lon), name: i.display_name }))
    .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
}

export async function searchPlaces(query: string, near?: LatLng): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const view = near
    ? `&viewbox=${near.longitude - 0.5},${near.latitude + 0.5},${near.longitude + 0.5},${near.latitude - 0.5}`
    : '';
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=za&q=${encodeURIComponent(q)}${view}`;
  return parseNominatim(await fetchJson<NominatimItem[]>(url, { headers: UA }));
}

export interface RouteResult {
  points: LatLng[];
  distanceM: number;
  durationS: number;
}

interface OsrmResponse {
  code: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
}

export function parseOsrm(r: OsrmResponse): RouteResult | null {
  const route = r.routes?.[0];
  if (r.code !== 'Ok' || !route) return null;
  return {
    points: route.geometry.coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
    distanceM: route.distance,
    durationS: route.duration,
  };
}

export async function getRoute(from: LatLng, to: LatLng, profile: 'foot' | 'driving' = 'foot'): Promise<RouteResult | null> {
  const url = `https://router.project-osrm.org/route/v1/${profile}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
  const res = parseOsrm(await fetchJson<OsrmResponse>(url, { timeoutMs: 20000 }));
  if (res) return res;
  return null;
}

/** Straight-line fallback so deviation detection still has a corridor if routing is unreachable. */
export function straightLine(from: LatLng, to: LatLng): RouteResult {
  const d = haversine(from, to);
  return { points: [from, to], distanceM: d, durationS: d / 1.3 };
}
