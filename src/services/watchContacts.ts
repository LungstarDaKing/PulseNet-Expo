import { isValidPhone, normalizePhone } from '../lib/phone';
import { newId } from '../lib/id';
import { secureGetJSON, secureSetJSON } from '../lib/storage';
import { CheckInResponse, escalate, recordResponse, sendCheckInRequest } from './checkIn';

export type Relationship = 'spouse' | 'child' | 'parent' | 'sibling' | 'friend' | 'other';
export const RELATIONSHIPS: Relationship[] = ['spouse', 'child', 'parent', 'sibling', 'friend', 'other'];

/** A person the user regularly checks on ("Check on her"). */
export interface WatchedContact {
  id: string;
  name: string;
  phone: string;
  relationship: Relationship;
  lastCheckTime?: string;
  lastResponse?: CheckInResponse;
  lastRequestId?: string;
}

const KEY = 'check_on_contacts';
export const getWatched = () => secureGetJSON<WatchedContact[]>(KEY, []);

export async function addWatched(name: string, phone: string, relationship: Relationship = 'other'): Promise<void> {
  if (!name.trim()) throw new Error('Enter a name');
  if (!isValidPhone(phone)) throw new Error('Enter a valid phone number');
  const p = normalizePhone(phone);
  const list = (await getWatched()).filter((c) => c.phone !== p);
  await secureSetJSON(KEY, [...list, { id: newId('w'), name: name.trim(), phone: p, relationship }]);
}
export async function removeWatched(id: string): Promise<void> {
  await secureSetJSON(KEY, (await getWatched()).filter((c) => c.id !== id));
}

export async function checkOn(c: WatchedContact, note?: string): Promise<boolean> {
  const id = await sendCheckInRequest({ contactName: c.name, contactPhone: c.phone, note });
  if (!id) return false;
  await secureSetJSON(KEY, (await getWatched()).map((w) => (w.id === c.id ? { ...w, lastCheckTime: new Date().toISOString(), lastResponse: undefined, lastRequestId: id } : w)));
  return true;
}

export async function recordWatchedResponse(c: WatchedContact, r: CheckInResponse): Promise<void> {
  if (c.lastRequestId) await recordResponse(c.lastRequestId, r);
  await secureSetJSON(KEY, (await getWatched()).map((w) => (w.id === c.id ? { ...w, lastResponse: r } : w)));
}
export const escalateWatched = (c: WatchedContact) => (c.lastRequestId ? escalate(c.lastRequestId) : Promise.resolve(0));
