import { isValidPhone, normalizePhone } from '../lib/phone';
import { newId } from '../lib/id';
import { secureGetJSON, secureSetJSON } from '../lib/storage';

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship?: string;
}

const KEY = 'emergency_contacts';
export const MAX_CONTACTS = 10;

export const getContacts = () => secureGetJSON<EmergencyContact[]>(KEY, []);

export function validateContact(name: string, phone: string): string | null {
  if (!name.trim()) return 'Enter a name';
  if (!isValidPhone(phone)) return 'Enter a valid phone number';
  return null;
}

export async function addContact(name: string, phone: string, relationship?: string): Promise<EmergencyContact> {
  const err = validateContact(name, phone);
  if (err) throw new Error(err);
  const list = await getContacts();
  if (list.length >= MAX_CONTACTS) throw new Error(`You can save up to ${MAX_CONTACTS} contacts`);
  const normalized = normalizePhone(phone);
  if (list.some((c) => normalizePhone(c.phone) === normalized)) throw new Error('That number is already saved');
  const c: EmergencyContact = { id: newId('c'), name: name.trim(), phone: normalized, relationship: relationship?.trim() || undefined };
  await secureSetJSON(KEY, [...list, c]);
  return c;
}

export async function removeContact(id: string): Promise<void> {
  await secureSetJSON(KEY, (await getContacts()).filter((c) => c.id !== id));
}

export async function contactNumbers(): Promise<string[]> {
  const out: string[] = [];
  for (const c of await getContacts()) {
    const n = normalizePhone(c.phone);
    if (n.length >= 7 && !out.includes(n)) out.push(n);
  }
  return out;
}
