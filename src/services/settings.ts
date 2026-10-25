import { K, getBool, plainGet, plainGetJSON, plainSet, plainSetJSON, setBool } from '../lib/storage';

export const getUserName = async () => (await plainGet(K.userName)) ?? '';
export const setUserName = (n: string) => plainSet(K.userName, n.trim());
/** Defaults to TRUE: in an emergency the location is included unless the user switched it off. */
export const getLocationSharing = () => getBool(K.locationSharing, true);
export const setLocationSharing = (v: boolean) => setBool(K.locationSharing, v);

export interface AppSettings {
  /** SOS drill: runs the whole flow but sends NOTHING to contacts or services. */
  drillMode: boolean;
  /** Vitals: text emergency contacts automatically after sustained critical readings. */
  vitalsAutoAlert: boolean;
  sosCountdownSeconds: number;
}
const DEFAULTS: AppSettings = { drillMode: false, vitalsAutoAlert: false, sosCountdownSeconds: 5 };
export const getSettings = async (): Promise<AppSettings> => ({ ...DEFAULTS, ...(await plainGetJSON<Partial<AppSettings>>('app_settings_v1', {})) });
export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await getSettings()), ...patch };
  await plainSetJSON('app_settings_v1', next);
  return next;
}
