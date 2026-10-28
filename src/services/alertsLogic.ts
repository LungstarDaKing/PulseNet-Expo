/** Pure logic for community alerts (no network, easy to test). */
export type ReportType = 'medical' | 'fire' | 'crime' | 'accident' | 'other';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';

export interface CommunityAlert {
  id: string;
  type: ReportType;
  severity: Severity;
  description: string;
  latitude: number;
  longitude: number;
  status: AlertStatus;
  verified: boolean;
  confirmations: number;
  created_at: string;
  distance_km: number | null;
  confirmed_by_me: boolean;
}

export const REPORT_TYPES: { id: ReportType; label: string; icon: string; color: string; floor: Severity }[] = [
  { id: 'medical', label: 'Medical', icon: 'medkit', color: '#3B82F6', floor: 'medium' },
  { id: 'fire', label: 'Fire', icon: 'flame', color: '#EF4444', floor: 'high' },
  { id: 'crime', label: 'Crime', icon: 'shield', color: '#F59E0B', floor: 'low' },
  { id: 'accident', label: 'Accident', icon: 'car', color: '#8B5CF6', floor: 'low' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal', color: '#9CA3AF', floor: 'low' },
];
export const typeInfo = (t: string) => REPORT_TYPES.find((x) => x.id === t) ?? REPORT_TYPES[4];

export const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];
export const sevRank = (s: Severity) => SEVERITIES.indexOf(s);
export const maxSeverity = (a: Severity, b: Severity): Severity => (sevRank(a) >= sevRank(b) ? a : b);

/** Trust shown on every alert: nothing is presented as confirmed unless it is. */
export type Trust = 'verified' | 'corroborated' | 'unverified';
export const CORROBORATION_THRESHOLD = 2;
export function trustLevel(a: Pick<CommunityAlert, 'verified' | 'confirmations'>): Trust {
  if (a.verified) return 'verified';
  return a.confirmations >= CORROBORATION_THRESHOLD ? 'corroborated' : 'unverified';
}
export const TRUST_LABEL: Record<Trust, string> = {
  verified: 'Verified by a moderator',
  corroborated: 'Confirmed by other people',
  unverified: 'Unverified community report',
};

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export type AlertFilter = 'all' | 'emergency' | 'info';
/** Emergency = high or critical. Info = everything else. */
export function matchesFilter(sev: Severity, f: AlertFilter): boolean {
  if (f === 'all') return true;
  return f === 'emergency' ? sevRank(sev) >= sevRank('high') : sevRank(sev) < sevRank('high');
}

export function activeOnly(a: Pick<CommunityAlert, 'status'>): boolean {
  return a.status === 'open' || a.status === 'investigating';
}

export function sortAlerts<T extends { created_at: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function upsertAlert(list: CommunityAlert[], row: CommunityAlert): CommunityAlert[] {
  const i = list.findIndex((a) => a.id === row.id);
  const next = i >= 0 ? list.map((a, j) => (j === i ? { ...a, ...row, distance_km: row.distance_km ?? a.distance_km, confirmed_by_me: a.confirmed_by_me } : a)) : [row, ...list];
  return sortAlerts(next).slice(0, 100);
}
export const removeAlert = (list: CommunityAlert[], id: string) => list.filter((a) => a.id !== id);

/** Severity to pre-select: the rule-based result, never lower than the floor for the chosen type. */
export function suggestedSeverity(type: ReportType, rules: Severity): Severity {
  return maxSeverity(rules, typeInfo(type).floor);
}

export interface ReportInput {
  type: ReportType;
  description: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  severity: Severity;
  severitySource: 'user' | 'rules' | 'ai';
  aiSummary?: string | null;
  evidence: { uri: string; mime: string }[];
}

export function validateReportInput(i: Pick<ReportInput, 'description' | 'latitude' | 'longitude' | 'evidence'>): string | null {
  const d = i.description.trim();
  if (d.length < 10) return 'Describe what is happening in at least 10 characters.';
  if (d.length > 1000) return 'Keep the description under 1000 characters.';
  if (!Number.isFinite(i.latitude) || !Number.isFinite(i.longitude) || Math.abs(i.latitude) > 90 || Math.abs(i.longitude) > 180) {
    return 'Your location is needed so people nearby can be told where this is.';
  }
  if (i.evidence.length > 3) return 'You can attach up to 3 photos.';
  return null;
}

/** Looks like a phone number or ID in text that will be shown to the whole community. */
export function containsPersonalData(text: string): boolean {
  return /(\+?\d[\d\s-]{8,}\d)/.test(text) || /\b\d{13}\b/.test(text);
}

export const EXT_FOR_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const ALLOWED_MIME = Object.keys(EXT_FOR_MIME);
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

const URGENT = /\b(gun|shot|shooting|stab|stabbed|rape|raped|kidnap|hijack|bomb|explosion|fire|burning|bleeding|unconscious|not breathing|overdose|suicide|kill myself|being followed|following me|attacked|trapped|choking|chest pain|drowning|gas leak)\b/i;
/** Only used to SHOW call buttons sooner. It never lowers anything. */
export const looksUrgent = (text: string): boolean => URGENT.test(text);

const FIRST_AID_KEYWORDS: [RegExp, string][] = [
  [/\b(cpr|not breathing|no pulse|unconscious)\b/i, 'cpr'],
  [/\b(chok)/i, 'choking'],
  [/\b(bleed|blood|cut|wound)/i, 'bleeding'],
  [/\b(heart attack|chest pain)\b/i, 'heart-attack'],
  [/\b(stroke|face droop)/i, 'stroke'],
  [/\b(burn|scald)/i, 'burns'],
  [/\b(broken|fracture|sprain)/i, 'fractures'],
  [/\b(seizure|fit|convuls)/i, 'seizures'],
  [/\b(allerg|anaphyla|epipen)/i, 'allergy'],
  [/\b(diabet|low sugar|hypo)/i, 'diabetic'],
];
/** Matches a message to a written first-aid topic id (real content in data/firstAid.ts) or null. */
export function firstAidTopicFor(text: string): string | null {
  for (const [re, id] of FIRST_AID_KEYWORDS) if (re.test(text)) return id;
  return null;
}
