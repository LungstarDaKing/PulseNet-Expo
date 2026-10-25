export interface LatLng {
  latitude: number;
  longitude: number;
}

const R_EARTH = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance from point p to segment a-b in metres (local equirectangular projection). */
export function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const lat0 = rad(p.latitude);
  const kx = Math.cos(lat0) * R_EARTH * (Math.PI / 180);
  const ky = R_EARTH * (Math.PI / 180);
  const px = (p.longitude - a.longitude) * kx;
  const py = (p.latitude - a.latitude) * ky;
  const bx = (b.longitude - a.longitude) * kx;
  const by = (b.latitude - a.latitude) * ky;
  const len2 = bx * bx + by * by;
  if (len2 === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Distance from p to the nearest point of a polyline; Infinity for an empty route. */
export function distanceToRoute(p: LatLng, route: LatLng[]): number {
  if (route.length === 0) return Infinity;
  if (route.length === 1) return haversine(p, route[0]);
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    best = Math.min(best, distanceToSegment(p, route[i], route[i + 1]));
  }
  return best;
}

/** Bounding box [minLat, minLon, maxLat, maxLon] around a point for a radius in metres. */
export function boundingBox(c: LatLng, radiusM: number): [number, number, number, number] {
  const dLat = (radiusM / R_EARTH) * (180 / Math.PI);
  const dLon = dLat / Math.max(0.01, Math.cos(rad(c.latitude)));
  return [c.latitude - dLat, c.longitude - dLon, c.latitude + dLat, c.longitude + dLon];
}

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return 'unknown';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function mapLink(p: LatLng): string {
  return `https://maps.google.com/?q=${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;
}
