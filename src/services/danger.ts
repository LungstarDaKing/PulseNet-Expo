import { LatLng, boundingBox, haversine } from '../lib/geo';
import { fetchJson } from '../lib/http';
import { getPosition } from '../lib/location';
import { notifyNow } from '../lib/notify';
import { plainGetJSON, plainSetJSON } from '../lib/storage';
import { logEvent } from './audit';
import { DangerType, IncidentReport, Severity, SEVERITY_ORDER, getReports } from './incidents';

/**
 * Danger Around Me, backed by REAL public data - nothing is invented.
 *  - USGS earthquake feed            (naturalDisaster)       https://earthquake.usgs.gov
 *  - NASA EONET open natural events  (naturalDisaster / environmentalHazard)  https://eonet.gsfc.nasa.gov
 *  - Open-Meteo forecast             (environmentalHazard)   derived from forecast values; NOT an official warning
 *  - Your own incident reports       (any type)              stored on this device
 * There is no verified live public feed for crime, civil unrest or disease outbreaks, so those types
 * only ever show your own reports. COVERAGE below is shown in the UI so nobody assumes otherwise.
 */
export interface DangerAlert {
  id: string;
  type: DangerType;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  distanceM: number;
  timestamp: string;
  severity: Severity;
  source: string;
  sourceUrl?: string;
  /** How the severity was derived (shown to the user for transparency). */
  basis: string;
}

export const COVERAGE: Record<DangerType, { live: boolean; sources: string }> = {
  naturalDisaster: { live: true, sources: 'USGS earthquakes, NASA EONET (fires, storms, floods, volcanoes)' },
  environmentalHazard: { live: true, sources: 'Open-Meteo forecast (storms, heavy rain, wind, heat), NASA EONET (dust, haze)' },
  crime: { live: false, sources: 'No verified live public feed. Shows your own reports only.' },
  trafficAccident: { live: false, sources: 'No verified live public feed. Shows your own reports only.' },
  civilUnrest: { live: false, sources: 'No verified live public feed. Shows your own reports only.' },
  diseaseOutbreak: { live: false, sources: 'No verified live public feed. Shows your own reports only.' },
};

export interface DangerConfig {
  isEnabled: boolean;
  radiusM: number;
  types: DangerType[];
  updateIntervalSeconds: number;
  notifications: boolean;
}
export const ALL_TYPES: DangerType[] = ['crime', 'environmentalHazard', 'trafficAccident', 'naturalDisaster', 'civilUnrest', 'diseaseOutbreak'];
export const DEFAULT_CONFIG: DangerConfig = { isEnabled: true, radiusM: 5000, types: ALL_TYPES, updateIntervalSeconds: 300, notifications: true };
/** Public APIs are shared infrastructure: never refresh faster than this. */
export const MIN_INTERVAL_S = 120;

const sevMax = (a: Severity, b: Severity): Severity => (SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b);

// ---------------------------------------------------------------- USGS
export interface UsgsResponse {
  features: { id: string; properties: { mag: number | null; place: string | null; time: number; url?: string; title?: string }; geometry: { coordinates: [number, number, number] } }[];
}

export function parseUsgs(r: UsgsResponse, at: LatLng): DangerAlert[] {
  const out: DangerAlert[] = [];
  for (const f of r.features ?? []) {
    const [lon, lat] = f.geometry.coordinates;
    const mag = f.properties.mag;
    if (mag == null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const distanceM = haversine(at, { latitude: lat, longitude: lon });
    let severity: Severity = mag >= 7 ? 'critical' : mag >= 6 ? 'high' : mag >= 4.5 ? 'medium' : 'low';
    // shaking that is both strong and close matters more
    if (mag >= 5 && distanceM < 100_000) severity = sevMax(severity, 'high');
    out.push({
      id: `usgs:${f.id}`,
      type: 'naturalDisaster',
      title: `Magnitude ${mag.toFixed(1)} earthquake`,
      description: f.properties.place ?? 'Earthquake',
      latitude: lat,
      longitude: lon,
      distanceM,
      timestamp: new Date(f.properties.time).toISOString(),
      severity,
      source: 'USGS',
      sourceUrl: f.properties.url,
      basis: `Magnitude ${mag.toFixed(1)}, ${Math.round(distanceM / 1000)} km away`,
    });
  }
  return out;
}

export async function fetchUsgs(at: LatLng, radiusKm = 300): Promise<DangerAlert[]> {
  const start = new Date(Date.now() - 24 * 3600_000).toISOString();
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${at.latitude}&longitude=${at.longitude}&maxradiuskm=${radiusKm}&starttime=${start}&minmagnitude=2.5&orderby=time&limit=50`;
  return parseUsgs(await fetchJson<UsgsResponse>(url), at);
}

// ---------------------------------------------------------------- EONET
export interface EonetResponse {
  events: { id: string; title: string; link?: string; categories: { id: string; title: string }[]; geometry: { date: string; type: string; coordinates: unknown }[] }[];
}

const EONET_MAP: Record<string, { type: DangerType; severity: Severity }> = {
  wildfires: { type: 'naturalDisaster', severity: 'high' },
  severeStorms: { type: 'naturalDisaster', severity: 'high' },
  floods: { type: 'naturalDisaster', severity: 'high' },
  volcanoes: { type: 'naturalDisaster', severity: 'critical' },
  landslides: { type: 'naturalDisaster', severity: 'high' },
  earthquakes: { type: 'naturalDisaster', severity: 'medium' },
  dustHaze: { type: 'environmentalHazard', severity: 'medium' },
  manmade: { type: 'environmentalHazard', severity: 'medium' },
  tempExtremes: { type: 'environmentalHazard', severity: 'medium' },
  drought: { type: 'environmentalHazard', severity: 'low' },
  snow: { type: 'environmentalHazard', severity: 'low' },
};

function pointOf(coords: unknown, type: string): LatLng | null {
  try {
    if (type === 'Point') {
      const [lon, lat] = coords as [number, number];
      return { latitude: lat, longitude: lon };
    }
    if (type === 'Polygon') {
      const ring = (coords as [number, number][][])[0];
      const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      const lon = ring.reduce((s, p) => s + p[0], 0) / ring.length;
      return { latitude: lat, longitude: lon };
    }
  } catch {
    // ignore malformed geometry
  }
  return null;
}

export function parseEonet(r: EonetResponse, at: LatLng): DangerAlert[] {
  const out: DangerAlert[] = [];
  for (const e of r.events ?? []) {
    const cat = e.categories?.[0];
    const map = cat ? EONET_MAP[cat.id] : undefined;
    if (!map) continue;
    const g = e.geometry?.[e.geometry.length - 1];
    const p = g ? pointOf(g.coordinates, g.type) : null;
    if (!g || !p) continue;
    out.push({
      id: `eonet:${e.id}`,
      type: map.type,
      title: e.title,
      description: `${cat.title} reported by NASA EONET`,
      latitude: p.latitude,
      longitude: p.longitude,
      distanceM: haversine(at, p),
      timestamp: new Date(g.date).toISOString(),
      severity: map.severity,
      source: 'NASA EONET',
      sourceUrl: e.link,
      basis: `Category "${cat.title}"`,
    });
  }
  return out;
}

export async function fetchEonet(at: LatLng, radiusKm = 150): Promise<DangerAlert[]> {
  const [minLat, minLon, maxLat, maxLon] = boundingBox(at, radiusKm * 1000);
  const url = `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7&bbox=${minLon},${maxLat},${maxLon},${minLat}`;
  return parseEonet(await fetchJson<EonetResponse>(url), at).filter((a) => a.distanceM <= radiusKm * 1000);
}

// ---------------------------------------------------------------- Open-Meteo
export interface MeteoResponse {
  hourly: { time: string[]; weather_code: number[]; wind_gusts_10m: number[]; precipitation: number[]; temperature_2m: number[] };
}

/** Rules over the next [hours] of forecast. These are derived hazards, not official warnings. */
export function deriveWeatherHazards(r: MeteoResponse, at: LatLng, now = new Date(), hours = 6): DangerAlert[] {
  const h = r.hourly;
  const out: DangerAlert[] = [];
  if (!h?.time) return out;
  const startIdx = h.time.findIndex((t) => Date.parse(`${t}:00Z`) >= now.getTime() - 3600_000);
  if (startIdx < 0) return out;
  const idxs = h.time.map((_, i) => i).slice(startIdx, startIdx + hours);

  const add = (key: string, title: string, severity: Severity, i: number, basis: string) => {
    if (out.some((a) => a.id === `meteo:${key}`)) return;
    out.push({
      id: `meteo:${key}`,
      type: 'environmentalHazard',
      title,
      description: `Forecast for around ${h.time[i].slice(11, 16)} UTC at your location`,
      latitude: at.latitude,
      longitude: at.longitude,
      distanceM: 0,
      timestamp: new Date(`${h.time[i]}:00Z`).toISOString(),
      severity,
      source: 'Open-Meteo forecast (not an official warning)',
      sourceUrl: 'https://open-meteo.com',
      basis,
    });
  };

  for (const i of idxs) {
    const code = h.weather_code[i];
    const gust = h.wind_gusts_10m[i];
    const rain = h.precipitation[i];
    const temp = h.temperature_2m[i];
    if (code === 96 || code === 99) add('hail', 'Thunderstorm with hail forecast', 'high', i, `WMO weather code ${code}`);
    else if (code === 95) add('thunder', 'Thunderstorm forecast', 'medium', i, 'WMO weather code 95');
    if (rain >= 7.6 || code === 65 || code === 67 || code === 82) add('rain', 'Heavy rain forecast', rain >= 15 ? 'high' : 'medium', i, `${rain.toFixed(1)} mm in one hour`);
    if (code === 75 || code === 86 || code === 77) add('snow', 'Heavy snow forecast', 'medium', i, `WMO weather code ${code}`);
    if (gust >= 89) add('gale', 'Storm-force wind gusts forecast', 'high', i, `Gusts to ${Math.round(gust)} km/h`);
    else if (gust >= 62) add('wind', 'Gale-force wind gusts forecast', 'medium', i, `Gusts to ${Math.round(gust)} km/h`);
    if (temp >= 40) add('heat', 'Extreme heat forecast', 'high', i, `${Math.round(temp)} °C`);
    else if (temp >= 35) add('heat', 'Very hot conditions forecast', 'medium', i, `${Math.round(temp)} °C`);
    if (temp <= -5) add('cold', 'Severe cold forecast', 'medium', i, `${Math.round(temp)} °C`);
    if (code === 45 || code === 48) add('fog', 'Dense fog forecast', 'low', i, 'Reduced visibility (WMO code 45/48)');
  }
  return out;
}

export async function fetchWeather(at: LatLng): Promise<DangerAlert[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${at.latitude}&longitude=${at.longitude}&hourly=weather_code,wind_gusts_10m,precipitation,temperature_2m&forecast_days=1&timezone=GMT&wind_speed_unit=kmh`;
  return deriveWeatherHazards(await fetchJson<MeteoResponse>(url), at);
}

// ---------------------------------------------------------------- user reports
export function reportsToAlerts(reports: IncidentReport[], at: LatLng): DangerAlert[] {
  return reports
    .filter((r) => r.status !== 'resolved' && !r.duplicateOf)
    .map((r) => ({
      id: `report:${r.id}`,
      type: r.type,
      title: `Your report: ${r.type}`,
      description: r.description,
      latitude: r.latitude,
      longitude: r.longitude,
      distanceM: haversine(at, { latitude: r.latitude, longitude: r.longitude }),
      timestamp: r.reportedAt,
      severity: r.severity,
      source: 'Reported on this device',
      basis: r.matched.length ? `Keywords: ${r.matched.slice(0, 4).join(', ')}` : 'Severity set by you',
    }));
}

// ---------------------------------------------------------------- aggregation
export interface RefreshResult {
  alerts: DangerAlert[];
  errors: { source: string; message: string }[];
  at: LatLng | null;
  fetchedAt: string;
}

/** Filters by config and sorts: most severe first, then nearest. */
export function selectAlerts(all: DangerAlert[], cfg: DangerConfig): DangerAlert[] {
  const seen = new Set<string>();
  return all
    .filter((a) => cfg.types.includes(a.type))
    // global natural events are kept inside their own search radius; user reports and weather use the monitoring radius
    .filter((a) => a.source.startsWith('Open-Meteo') || a.source === 'USGS' || a.source === 'NASA EONET' || a.distanceM <= cfg.radiusM)
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .sort((a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity) || a.distanceM - b.distanceM);
}

export async function refreshDanger(cfg: DangerConfig, at?: LatLng | null): Promise<RefreshResult> {
  const pos = at ?? (await getPosition());
  const errors: RefreshResult['errors'] = [];
  const reports = await getReports();
  if (!pos) {
    return { alerts: [], errors: [{ source: 'Location', message: 'Location unavailable. Turn on location to check your surroundings.' }], at: null, fetchedAt: new Date().toISOString() };
  }
  const jobs: [string, Promise<DangerAlert[]>][] = [
    ['USGS', fetchUsgs(pos)],
    ['NASA EONET', fetchEonet(pos)],
    ['Open-Meteo', fetchWeather(pos)],
  ];
  const settled = await Promise.allSettled(jobs.map((j) => j[1]));
  let all: DangerAlert[] = reportsToAlerts(reports, pos);
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') all = all.concat(s.value);
    else errors.push({ source: jobs[i][0], message: s.reason instanceof Error ? s.reason.message : 'Request failed' });
  });
  return { alerts: selectAlerts(all, cfg), errors, at: pos, fetchedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------- monitoring
const CFG_KEY = 'danger_config_v3';
const NOTIFIED_KEY = 'danger_notified_v3';
export const getDangerConfig = async (): Promise<DangerConfig> => ({ ...DEFAULT_CONFIG, ...(await plainGetJSON<Partial<DangerConfig>>(CFG_KEY, {})) });
export const saveDangerConfig = (c: DangerConfig) => plainSetJSON(CFG_KEY, { ...c, updateIntervalSeconds: Math.max(MIN_INTERVAL_S, c.updateIntervalSeconds) });

type Listener = (r: RefreshResult) => void;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();
export const onDangerUpdate = (l: Listener) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
export const isMonitoring = () => timer != null;

async function tick(): Promise<void> {
  const cfg = await getDangerConfig();
  if (!cfg.isEnabled) return;
  const res = await refreshDanger(cfg);
  listeners.forEach((l) => l(res));
  if (!cfg.notifications) return;
  const notified = await plainGetJSON<string[]>(NOTIFIED_KEY, []);
  const fresh = res.alerts.filter((a) => SEVERITY_ORDER.indexOf(a.severity) >= SEVERITY_ORDER.indexOf('high') && !notified.includes(a.id));
  for (const a of fresh.slice(0, 3)) {
    await notifyNow(`${a.severity === 'critical' ? 'Critical' : 'High'} alert nearby`, `${a.title}. ${a.basis}.`, { alertId: a.id });
    notified.push(a.id);
  }
  if (fresh.length) {
    await plainSetJSON(NOTIFIED_KEY, notified.slice(-200));
    await logEvent('danger_alerts_notified', 'Danger alerts shown', { count: fresh.length });
  }
}

export async function startDangerMonitoring(): Promise<void> {
  if (timer) return;
  const cfg = await getDangerConfig();
  await tick();
  timer = setInterval(() => void tick(), Math.max(MIN_INTERVAL_S, cfg.updateIntervalSeconds) * 1000);
}
export function stopDangerMonitoring(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
