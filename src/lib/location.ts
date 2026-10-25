import * as Location from 'expo-location';
import { LatLng } from './geo';

export interface Fix extends LatLng {
  accuracy: number | null;
  timestamp: number;
}

export async function ensureLocationPermission(): Promise<boolean> {
  try {
    if (!(await Location.hasServicesEnabledAsync())) return false;
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.granted) return true;
    return (await Location.requestForegroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

const toFix = (p: Location.LocationObject): Fix => ({
  latitude: p.coords.latitude,
  longitude: p.coords.longitude,
  accuracy: p.coords.accuracy,
  timestamp: p.timestamp,
});

/** Best-effort position: fresh fix (8 s) -> last known -> null. Never throws. */
export async function getPosition(timeoutMs = 8000): Promise<Fix | null> {
  try {
    if (!(await ensureLocationPermission())) return null;
    try {
      const fresh = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
      ]);
      return toFix(fresh);
    } catch {
      const last = await Location.getLastKnownPositionAsync();
      return last ? toFix(last) : null;
    }
  } catch {
    return null;
  }
}

export async function watchPosition(
  onFix: (f: Fix) => void,
  opts: { distanceInterval?: number; timeInterval?: number } = {},
): Promise<{ remove: () => void } | null> {
  if (!(await ensureLocationPermission())) return null;
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, distanceInterval: opts.distanceInterval ?? 10, timeInterval: opts.timeInterval ?? 5000 },
    (p) => onFix(toFix(p)),
  );
  return { remove: () => sub.remove() };
}
