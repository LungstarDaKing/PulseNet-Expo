import { plainGetJSON, plainRemove, plainSetJSON } from './storage';

/**
 * Remembers the last uncaught JavaScript error so that, after a crash and reload, the app can show
 * what happened. Contains the error message and top of the stack only: no user data.
 */
const KEY = 'last_crash_v1';
export interface CrashRecord { at: string; message: string; stack: string; fatal: boolean }

export async function recordCrash(e: unknown, fatal: boolean): Promise<void> {
  const err = e instanceof Error ? e : new Error(String(e));
  const rec: CrashRecord = { at: new Date().toISOString(), message: err.message.slice(0, 400), stack: (err.stack ?? '').split('\n').slice(0, 8).join('\n').slice(0, 1200), fatal };
  try { await plainSetJSON(KEY, rec); } catch { /* nothing more we can do */ }
}
export const getLastCrash = () => plainGetJSON<CrashRecord | null>(KEY, null);
export const clearLastCrash = () => plainRemove(KEY);

let installed = false;
export function installCrashRecorder(): void {
  if (installed) return;
  installed = true;
  const eu = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, f?: boolean) => void; setGlobalHandler: (h: (e: unknown, f?: boolean) => void) => void } }).ErrorUtils;
  if (!eu) return;
  const prev = eu.getGlobalHandler();
  eu.setGlobalHandler((e, fatal) => {
    void recordCrash(e, !!fatal);
    prev(e, fatal);
  });
}

export const crashText = (c: CrashRecord) => `PulseNet error ${c.at}${c.fatal ? ' (fatal)' : ''}\n${c.message}\n${c.stack}`;
