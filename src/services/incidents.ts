import { LatLng, haversine } from '../lib/geo';
import { newId } from '../lib/id';
import { secureGetJSON, secureSetJSON } from '../lib/storage';
import { logEvent } from './audit';

/**
 * On-device incident reporting with RULE-BASED classification, severity scoring and duplicate
 * detection. This is keyword/similarity logic, not a machine-learning model. Reports are stored
 * on this device only; there is no server, so other users do not see them.
 */
export type DangerType = 'crime' | 'environmentalHazard' | 'trafficAccident' | 'naturalDisaster' | 'civilUnrest' | 'diseaseOutbreak';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'investigating' | 'resolved';

export const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];

const TYPE_KEYWORDS: Record<DangerType, string[]> = {
  crime: ['robbery', 'robbed', 'mugging', 'mugged', 'theft', 'stolen', 'stole', 'hijack', 'hijacking', 'assault', 'attacked', 'stabbing', 'stabbed', 'shooting', 'shots', 'gun', 'armed', 'knife', 'rape', 'kidnap', 'break-in', 'burglary', 'suspicious', 'gang', 'tsotsi', 'skollie', 'roof', 'steel', 'gesteel', 'aanval', 'inbraak', 'ukuphanga', 'ukutshontsha'],
  trafficAccident: ['accident', 'crash', 'collision', 'overturned', 'pile-up', 'hit and run', 'ongeluk', 'ingozi', 'injury on road', 'pedestrian hit'],
  environmentalHazard: ['fire', 'smoke', 'gas leak', 'chemical', 'spill', 'flood', 'flooded', 'sinkhole', 'power line', 'live wire', 'downed wire', 'burst pipe', 'brand', 'vuur', 'umlilo', 'unomlilo'],
  naturalDisaster: ['earthquake', 'tremor', 'tornado', 'storm', 'hail', 'landslide', 'mudslide', 'veldfire', 'wildfire', 'tsunami', 'cyclone'],
  civilUnrest: ['protest', 'riot', 'looting', 'barricade', 'burning tyres', 'tear gas', 'rubber bullets', 'strike', 'march', 'unrest', 'stone throwing', 'optog'],
  diseaseOutbreak: ['outbreak', 'cholera', 'measles', 'contaminated water', 'epidemic', 'mass illness', 'food poisoning'],
};

const SEVERITY_KEYWORDS: Record<Severity, string[]> = {
  critical: ['gun', 'shooting', 'shots', 'stabbing', 'stabbed', 'rape', 'kidnap', 'hijack', 'explosion', 'bomb', 'unconscious', 'not breathing', 'trapped', 'fatal', 'dead', 'killed', 'tornado', 'tsunami'],
  high: ['armed', 'knife', 'robbery', 'robbed', 'assault', 'attacked', 'fire', 'riot', 'looting', 'bleeding', 'collapse', 'overturned', 'gas leak', 'chemical', 'flood', 'live wire', 'tear gas', 'rubber bullets', 'burning'],
  medium: ['theft', 'stolen', 'accident', 'crash', 'collision', 'protest', 'barricade', 'smoke', 'spill', 'suspicious', 'break-in', 'burglary', 'outbreak'],
  low: [],
};

export const tokenize = (text: string): string[] =>
  text.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter((t) => t.length > 2);

const contains = (text: string, kw: string): boolean => (kw.includes(' ') || kw.includes('-') ? text.includes(kw) : new RegExp(`\\b${kw}\\b`).test(text));

export interface Classification {
  type: DangerType;
  severity: Severity;
  matched: string[];
  /** Share of the strongest type's keyword evidence among all matches; 0 when nothing matched. */
  matchStrength: number;
}

export function classifyIncident(text: string): Classification {
  const t = text.toLowerCase();
  let best: DangerType = 'crime';
  let bestHits: string[] = [];
  let total = 0;
  for (const type of Object.keys(TYPE_KEYWORDS) as DangerType[]) {
    const hits = TYPE_KEYWORDS[type].filter((k) => contains(t, k));
    total += hits.length;
    if (hits.length > bestHits.length) {
      best = type;
      bestHits = hits;
    }
  }
  let severity: Severity = 'low';
  const sevHits: string[] = [];
  for (const s of ['critical', 'high', 'medium'] as Severity[]) {
    const hits = SEVERITY_KEYWORDS[s].filter((k) => contains(t, k));
    if (hits.length) {
      if (severity === 'low') severity = s;
      sevHits.push(...hits);
    }
  }
  return {
    type: best,
    severity,
    matched: [...new Set([...bestHits, ...sevHits])],
    matchStrength: total === 0 ? 0 : bestHits.length / total,
  };
}

export interface IncidentReport {
  id: string;
  type: DangerType;
  severity: Severity;
  description: string;
  latitude: number;
  longitude: number;
  reportedAt: string;
  status: IncidentStatus;
  matched: string[];
  duplicateOf?: string;
  updates: { at: string; status: IncidentStatus; note?: string }[];
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  A.forEach((x) => B.has(x) && inter++);
  return inter / (A.size + B.size - inter);
}

/** A report is a likely duplicate if it is close in space/time and similar in type or wording. */
export function findDuplicate(
  candidate: { type: DangerType; description: string; at: LatLng; time: number },
  existing: IncidentReport[],
): IncidentReport | null {
  let best: { r: IncidentReport; score: number } | null = null;
  for (const r of existing) {
    if (r.status === 'resolved') continue;
    const dist = haversine(candidate.at, { latitude: r.latitude, longitude: r.longitude });
    const age = Math.abs(candidate.time - Date.parse(r.reportedAt));
    if (dist > 200 || age > 3 * 3600_000) continue;
    const sim = jaccard(tokenize(candidate.description), tokenize(r.description));
    const sameType = candidate.type === r.type;
    const score = sim + (sameType ? 0.25 : 0);
    if ((sameType && sim >= 0.2) || sim >= 0.5) {
      if (!best || score > best.score) best = { r, score };
    }
  }
  return best?.r ?? null;
}

const KEY = 'incident_reports';
export const getReports = () => secureGetJSON<IncidentReport[]>(KEY, []);

export interface SubmitResult {
  report: IncidentReport;
  duplicate: IncidentReport | null;
  saved: boolean;
}

export function validateReport(description: string): string | null {
  const d = description.trim();
  if (d.length < 10) return 'Describe what you saw in at least 10 characters';
  if (d.length > 500) return 'Keep the description under 500 characters';
  return null;
}

export async function submitReport(description: string, at: LatLng, override?: { type?: DangerType; severity?: Severity }, force = false): Promise<SubmitResult> {
  const err = validateReport(description);
  if (err) throw new Error(err);
  const c = classifyIncident(description);
  const type = override?.type ?? c.type;
  const severity = override?.severity ?? c.severity;
  const existing = await getReports();
  const dup = findDuplicate({ type, description, at, time: Date.now() }, existing);
  const report: IncidentReport = {
    id: newId('i'),
    type,
    severity,
    description: description.trim(),
    latitude: at.latitude,
    longitude: at.longitude,
    reportedAt: new Date().toISOString(),
    status: 'open',
    matched: c.matched,
    duplicateOf: dup?.id,
    updates: [{ at: new Date().toISOString(), status: 'open' }],
  };
  if (dup && !force) return { report, duplicate: dup, saved: false };
  await secureSetJSON(KEY, [report, ...existing].slice(0, 200));
  await logEvent('incident_reported', 'Incident report saved', { type, severity, duplicate: !!dup });
  return { report, duplicate: dup, saved: true };
}

export async function updateStatus(id: string, status: IncidentStatus, note?: string): Promise<void> {
  const list = await getReports();
  await secureSetJSON(
    KEY,
    list.map((r) => (r.id === id ? { ...r, status, updates: [...r.updates, { at: new Date().toISOString(), status, note }] } : r)),
  );
}

export async function deleteReport(id: string): Promise<void> {
  await secureSetJSON(KEY, (await getReports()).filter((r) => r.id !== id));
}

export function summarize(reports: IncidentReport[]): string {
  if (reports.length === 0) return 'No reports on this device.';
  const open = reports.filter((r) => r.status !== 'resolved');
  const byType: Record<string, number> = {};
  for (const r of open) byType[r.type] = (byType[r.type] ?? 0) + 1;
  const worst = open.reduce<Severity>((w, r) => (SEVERITY_ORDER.indexOf(r.severity) > SEVERITY_ORDER.indexOf(w) ? r.severity : w), 'low');
  const parts = Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(', ');
  return open.length === 0
    ? `${reports.length} reports, all resolved.`
    : `${open.length} open of ${reports.length}: ${parts}. Highest severity: ${worst}.`;
}
