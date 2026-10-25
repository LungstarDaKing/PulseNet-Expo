import { newId } from '../lib/id';
import { plainGetJSON, plainSetJSON } from '../lib/storage';

/** Safety profiles: presets that tune how the app behaves. SOS and companion services read the active one. */
export interface SafetyProfile {
  id: string;
  name: string;
  description: string;
  followUpMinutes: number; // SOS location follow-up cadence
  checkInMinutes: number; // companion / walk check-in cadence
  maxMissedCheckIns: number;
  deviationWarnMeters: number;
  builtIn?: boolean;
}

export const BUILT_IN: SafetyProfile[] = [
  { id: 'standard', name: 'Standard', description: 'Balanced defaults for everyday use', followUpMinutes: 3, checkInMinutes: 30, maxMissedCheckIns: 2, deviationWarnMeters: 100, builtIn: true },
  { id: 'night-out', name: 'Night out', description: 'Closer check-ins and faster escalation', followUpMinutes: 2, checkInMinutes: 15, maxMissedCheckIns: 1, deviationWarnMeters: 75, builtIn: true },
  { id: 'commute', name: 'Daily commute', description: 'Fewer prompts on a familiar route', followUpMinutes: 5, checkInMinutes: 45, maxMissedCheckIns: 2, deviationWarnMeters: 150, builtIn: true },
  { id: 'low-battery', name: 'Low battery', description: 'Slower follow-ups to save power', followUpMinutes: 10, checkInMinutes: 60, maxMissedCheckIns: 2, deviationWarnMeters: 200, builtIn: true },
];

const KEY = 'safety_profiles_custom_v3';
const ACTIVE = 'safety_profile_active_v3';

export const getCustomProfiles = () => plainGetJSON<SafetyProfile[]>(KEY, []);
export async function getAllProfiles(): Promise<SafetyProfile[]> {
  return [...BUILT_IN, ...(await getCustomProfiles())];
}
export async function getActiveProfile(): Promise<SafetyProfile> {
  const id = await plainGetJSON<string>(ACTIVE, 'standard');
  return (await getAllProfiles()).find((p) => p.id === id) ?? BUILT_IN[0];
}
export const setActiveProfile = (id: string) => plainSetJSON(ACTIVE, id);

export function validateProfile(p: Pick<SafetyProfile, 'name' | 'followUpMinutes' | 'checkInMinutes' | 'maxMissedCheckIns' | 'deviationWarnMeters'>): string | null {
  if (!p.name.trim()) return 'Enter a name';
  if (p.followUpMinutes < 1 || p.followUpMinutes > 60) return 'Follow-up must be 1 to 60 minutes';
  if (p.checkInMinutes < 5 || p.checkInMinutes > 180) return 'Check-in must be 5 to 180 minutes';
  if (p.maxMissedCheckIns < 1 || p.maxMissedCheckIns > 5) return 'Missed check-ins must be 1 to 5';
  if (p.deviationWarnMeters < 25 || p.deviationWarnMeters > 1000) return 'Deviation must be 25 to 1000 m';
  return null;
}

export async function saveProfile(p: Omit<SafetyProfile, 'id' | 'builtIn'> & { id?: string }): Promise<SafetyProfile> {
  const err = validateProfile(p);
  if (err) throw new Error(err);
  const list = await getCustomProfiles();
  const profile: SafetyProfile = { ...p, id: p.id ?? newId('p') };
  await plainSetJSON(KEY, [...list.filter((x) => x.id !== profile.id), profile]);
  return profile;
}
export async function deleteProfile(id: string): Promise<void> {
  await plainSetJSON(KEY, (await getCustomProfiles()).filter((p) => p.id !== id));
  if ((await plainGetJSON<string>(ACTIVE, 'standard')) === id) await setActiveProfile('standard');
}
