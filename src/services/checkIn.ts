import { newId } from '../lib/id';
import { secureGetJSON, secureSetJSON } from '../lib/storage';
import { logEvent } from './audit';
import { sendMessageToContacts, sendSmsTo } from './sos';
import { getUserName } from './settings';

/**
 * "Are you safe?" checks sent by SMS (works without data, and the other person needs no app).
 * Replies arrive in the phone's messages; the user records them here. PulseNet never reads private SMS.
 */
export type CheckInResponse = 'safe' | 'delayed' | 'needHelp';

export interface CheckInRequest {
  id: string;
  contactName: string;
  contactPhone: string;
  sentAt: string;
  viaComposer: boolean;
  note?: string;
  response?: CheckInResponse;
  respondedAt?: string;
}

const KEY = 'check_in_requests';
const MAX_KEPT = 50;
export const OVERDUE_MINUTES = 15;

export const isOverdue = (r: CheckInRequest, now = Date.now()) => !r.response && (now - Date.parse(r.sentAt)) / 60000 >= OVERDUE_MINUTES;

export const getRequests = () => secureGetJSON<CheckInRequest[]>(KEY, []);

export async function sendCheckInRequest(o: { contactName: string; contactPhone: string; note?: string }): Promise<string | null> {
  const me = (await getUserName()) || 'A friend';
  const text = `${o.note?.trim() || 'Are you safe?'} ${me} is checking on you with PulseNet. Please reply SAFE, LATE or HELP.`;
  const before = Date.now();
  const sent = await sendSmsTo([o.contactPhone], text, { allowComposer: true });
  if (sent === 0) return null;
  const req: CheckInRequest = {
    id: newId('ci'),
    contactName: o.contactName,
    contactPhone: o.contactPhone,
    sentAt: new Date(before).toISOString(),
    // the composer only opens the SMS app: the user still has to press send
    viaComposer: false,
    note: o.note,
  };
  const list = await getRequests();
  await secureSetJSON(KEY, [...list, req].slice(-MAX_KEPT));
  await logEvent('check_in_sent', 'Safety check sent', { pending: list.filter((r) => !r.response).length + 1 });
  return req.id;
}

export async function recordResponse(id: string, response: CheckInResponse): Promise<boolean> {
  const list = await getRequests();
  if (!list.some((r) => r.id === id)) return false;
  await secureSetJSON(KEY, list.map((r) => (r.id === id ? { ...r, response, respondedAt: new Date().toISOString() } : r)));
  await logEvent('check_in_response', 'Safety check answered', { response });
  return true;
}

/** No reply: tell the user's own emergency contacts to try to reach them. */
export async function escalate(id: string): Promise<number> {
  const req = (await getRequests()).find((r) => r.id === id);
  if (!req) return 0;
  const who = (await getUserName()) || 'Your contact';
  const t = new Date(req.sentAt);
  const clock = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  const n = await sendMessageToContacts(`${who} is worried: ${req.contactName} has not replied to a safety check sent at ${clock}. Please try to reach them.`, { appendLocation: false, allowComposer: true });
  await logEvent('check_in_escalated', 'Safety check escalated', { contactsMessaged: n });
  return n;
}
