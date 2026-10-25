import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export type AuditLevel = 'info' | 'warning' | 'error' | 'critical';

export interface AuditEntry {
  id: string;
  ts: string;
  level: AuditLevel;
  event: string;
  description: string;
  data?: Record<string, unknown>;
  prev: string;
  hash: string;
}

const SENSITIVE = /(phone|number|pin|password|secret|token|latitude|longitude|lat|lon|address|coords?)/i;

export function redact(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (SENSITIVE.test(k)) out[k] = '[redacted]';
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = redact(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

export function hashEntry(e: Omit<AuditEntry, 'hash'>): string {
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify([e.id, e.ts, e.level, e.event, e.description, e.data ?? null, e.prev]))));
}

export function verifyChain(entries: AuditEntry[]): { ok: boolean; brokenAt?: number } {
  for (let i = 0; i < entries.length; i++) {
    if (hashEntry(entries[i]) !== entries[i].hash) return { ok: false, brokenAt: i };
    // after pruning, the first retained entry's `prev` references a removed entry: only check links inside the window
    if (i > 0 && entries[i].prev !== entries[i - 1].hash) return { ok: false, brokenAt: i };
  }
  return { ok: true };
}

