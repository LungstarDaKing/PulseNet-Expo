import { plainGetJSON, plainSetJSON } from '../lib/storage';
import { newId } from '../lib/id';
import { AuditEntry, AuditLevel, hashEntry, redact, verifyChain } from './auditCore';

export type { AuditEntry, AuditLevel } from './auditCore';
export { hashEntry, redact, verifyChain } from './auditCore';

const KEY = 'audit_log_v3';
const MAX_ENTRIES = 1000;
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

let queue: Promise<unknown> = Promise.resolve();

export function logEvent(
  event: string,
  description: string,
  data?: Record<string, unknown>,
  level: AuditLevel = 'info',
): Promise<void> {
  // serialised so concurrent events never fork the chain
  const run = queue.then(async () => {
    try {
      const list = await plainGetJSON<AuditEntry[]>(KEY, []);
      const cutoff = Date.now() - MAX_AGE_MS;
      const fresh = list.filter((e) => Date.parse(e.ts) >= cutoff);
      const base = { id: newId('a'), ts: new Date().toISOString(), level, event, description, data: redact(data), prev: fresh.length ? fresh[fresh.length - 1].hash : 'genesis' };
      fresh.push({ ...base, hash: hashEntry(base) });
      await plainSetJSON(KEY, fresh.slice(-MAX_ENTRIES));
    } catch {
      // logging must never break an emergency flow
    }
  });
  queue = run;
  return run;
}

export const getEntries = () => plainGetJSON<AuditEntry[]>(KEY, []);
export const clearAuditLog = () => plainSetJSON(KEY, []);

export async function auditStats() {
  const list = await getEntries();
  const byLevel: Record<string, number> = {};
  for (const e of list) byLevel[e.level] = (byLevel[e.level] ?? 0) + 1;
  return { total: list.length, byLevel, integrity: verifyChain(list) };
}

export async function exportAuditText(): Promise<string> {
  const list = await getEntries();
  return list
    .map((e) => `${e.ts} [${e.level}] ${e.event}: ${e.description}${e.data ? ' ' + JSON.stringify(e.data) : ''}`)
    .join('\n');
}
