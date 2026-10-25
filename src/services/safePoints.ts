import { plainGetJSON, plainSetJSON } from '../lib/storage';

/**
 * Safe Points: points, levels, badges, streak and daily challenges. Points are earned only for real
 * safety actions the app can observe (see EVENTS). Level table ported from the original service.
 * Not migrated: the original's character/inventory/redeem cosmetics, which had no real-world effect.
 */
export const LEVELS: { level: number; name: string; points: number }[] = [
  { level: 1, name: 'Newcomer', points: 0 }, { level: 2, name: 'Novice', points: 5 }, { level: 3, name: 'Beginner', points: 10 },
  { level: 4, name: 'Scout', points: 20 }, { level: 5, name: 'Sentry', points: 50 }, { level: 6, name: 'Watcher', points: 100 },
  { level: 7, name: 'Warden', points: 250 }, { level: 8, name: 'Defender', points: 500 }, { level: 9, name: 'Protector', points: 1000 },
  { level: 10, name: 'Sentinel', points: 2500 }, { level: 11, name: 'Guardian', points: 5000 }, { level: 12, name: 'Hero', points: 10000 },
  { level: 13, name: 'Champion', points: 25000 }, { level: 14, name: 'Elder', points: 50000 }, { level: 15, name: 'Legendary', points: 100000 },
];

export function levelFor(points: number) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (points >= l.points) cur = l;
  const next = LEVELS.find((l) => l.level === cur.level + 1) ?? null;
  return { ...cur, next, toNext: next ? next.points - points : 0, progress: next ? (points - cur.points) / (next.points - cur.points) : 1 };
}

export const EVENTS = {
  contact_added: { points: 5, label: 'Added an emergency contact', once: false },
  profile_saved: { points: 10, label: 'Saved your medical profile', once: true },
  pin_set: { points: 10, label: 'Turned on app lock', once: true },
  duress_set: { points: 5, label: 'Set a duress PIN', once: true },
  tip_read: { points: 1, label: 'Read a safety tip', once: false },
  first_aid_read: { points: 2, label: 'Studied a first-aid topic', once: false },
  place_added: { points: 5, label: 'Added a safe place', once: false },
  check_sent: { points: 3, label: 'Checked on someone', once: false },
  walk_done: { points: 10, label: 'Finished a walk safely', once: false },
  ride_done: { points: 5, label: 'Finished a ride with safety checks', once: false },
  report_made: { points: 3, label: 'Reported a hazard', once: false },
  drill_done: { points: 5, label: 'Ran an SOS drill', once: false },
  daily_open: { points: 1, label: 'Daily check-in', once: false },
} as const;
export type EventId = keyof typeof EVENTS;

export const BADGES: { id: string; name: string; description: string; test: (c: Counts, s: State) => boolean }[] = [
  { id: 'first-contact', name: 'Not alone', description: 'Add your first emergency contact', test: (c) => (c.contact_added ?? 0) >= 1 },
  { id: 'three-contacts', name: 'Safety net', description: 'Add three emergency contacts', test: (c) => (c.contact_added ?? 0) >= 3 },
  { id: 'locked', name: 'Locked down', description: 'Turn on app lock', test: (c) => (c.pin_set ?? 0) >= 1 },
  { id: 'prepared', name: 'Prepared', description: 'Save your medical profile', test: (c) => (c.profile_saved ?? 0) >= 1 },
  { id: 'drill', name: 'Drill sergeant', description: 'Run an SOS drill', test: (c) => (c.drill_done ?? 0) >= 1 },
  { id: 'reader', name: 'Well read', description: 'Read 10 safety tips', test: (c) => (c.tip_read ?? 0) >= 10 },
  { id: 'medic', name: 'First responder', description: 'Study 5 first-aid topics', test: (c) => (c.first_aid_read ?? 0) >= 5 },
  { id: 'walker', name: 'Safe walker', description: 'Finish 3 walks safely', test: (c) => (c.walk_done ?? 0) >= 3 },
  { id: 'caring', name: 'Looking out', description: 'Check on someone 3 times', test: (c) => (c.check_sent ?? 0) >= 3 },
  { id: 'streak7', name: 'Week streak', description: '7 days in a row', test: (_c, s) => s.bestStreak >= 7 },
  { id: 'streak30', name: 'Month streak', description: '30 days in a row', test: (_c, s) => s.bestStreak >= 30 },
  { id: 'level5', name: 'Sentry', description: 'Reach level 5', test: (_c, s) => levelFor(s.points).level >= 5 },
];

type Counts = Partial<Record<EventId, number>>;
export interface HistoryEntry { at: string; event: EventId; points: number }
export interface State {
  points: number;
  counts: Counts;
  badges: string[];
  streak: number;
  bestStreak: number;
  lastDay: string | null;
  seen: string[]; // once-only events and per-item dedupe keys
  history: HistoryEntry[];
  daily: { day: string; counts: Counts };
}

const KEY = 'safe_points_v3';
const EMPTY: State = { points: 0, counts: {}, badges: [], streak: 0, bestStreak: 0, lastDay: null, seen: [], history: [], daily: { day: '', counts: {} } };
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const getState = async (): Promise<State> => ({ ...EMPTY, ...(await plainGetJSON<Partial<State>>(KEY, {})) });

/** Streak rule: consecutive calendar days with at least one point-earning event. */
export function nextStreak(lastDay: string | null, today: string, streak: number): number {
  if (lastDay === today) return streak;
  if (!lastDay) return 1;
  const diff = Math.round((Date.parse(today) - Date.parse(lastDay)) / 86400000);
  return diff === 1 ? streak + 1 : 1;
}

export const DAILY_POOL: { id: string; label: string; event: EventId; target: number }[] = [
  { id: 'd-tip', label: 'Read 2 safety tips', event: 'tip_read', target: 2 },
  { id: 'd-aid', label: 'Study a first-aid topic', event: 'first_aid_read', target: 1 },
  { id: 'd-open', label: 'Open PulseNet today', event: 'daily_open', target: 1 },
  { id: 'd-check', label: 'Check on someone you care about', event: 'check_sent', target: 1 },
  { id: 'd-report', label: 'Report a hazard you see', event: 'report_made', target: 1 },
  { id: 'd-drill', label: 'Run an SOS drill', event: 'drill_done', target: 1 },
];
/** Three challenges per day, chosen deterministically from the date. */
export function dailyChallenges(day = dayKey()) {
  const seed = [...day].reduce((s, c) => s + c.charCodeAt(0), 0);
  const picks = [DAILY_POOL[2]];
  for (let i = 0; picks.length < 3; i++) {
    const c = DAILY_POOL[(seed + i * 2) % DAILY_POOL.length];
    if (!picks.includes(c)) picks.push(c);
  }
  return picks;
}

/** Records a real action. `itemKey` dedupes per item (e.g. each tip only counts once). Returns points awarded. */
export async function award(event: EventId, itemKey?: string): Promise<{ points: number; newBadges: string[] }> {
  const st = await getState();
  const def = EVENTS[event];
  const seenKey = itemKey ? `${event}:${itemKey}` : def.once ? event : null;
  if (seenKey && st.seen.includes(seenKey)) return { points: 0, newBadges: [] };
  const today = dayKey();
  const daily = st.daily.day === today ? st.daily : { day: today, counts: {} };
  // daily_open only counts once a day
  if (event === 'daily_open' && (daily.counts.daily_open ?? 0) >= 1) return { points: 0, newBadges: [] };

  const next: State = {
    ...st,
    points: st.points + def.points,
    counts: { ...st.counts, [event]: (st.counts[event] ?? 0) + 1 },
    seen: seenKey ? [...st.seen, seenKey].slice(-500) : st.seen,
    daily: { day: today, counts: { ...daily.counts, [event]: (daily.counts[event] ?? 0) + 1 } },
    streak: nextStreak(st.lastDay, today, st.streak),
    lastDay: today,
    history: [{ at: new Date().toISOString(), event, points: def.points }, ...st.history].slice(0, 100),
  };
  next.bestStreak = Math.max(st.bestStreak, next.streak);
  const newBadges = BADGES.filter((b) => !next.badges.includes(b.id) && b.test(next.counts, next)).map((b) => b.id);
  next.badges = [...next.badges, ...newBadges];
  await plainSetJSON(KEY, next);
  return { points: def.points, newBadges };
}
