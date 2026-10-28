import { fetchJson } from '../lib/http';
import { cloudConfigured, supabase } from '../lib/supabase';
import { getStoredPushToken } from './cloud';
import { PulseError, PULSE_MESSAGES, aiPing, aiStatus } from './pulse';

/** Connection checks with plain-language fixes. Each check is independent so one failure never hides the rest. */
export type CheckState = 'ok' | 'fail' | 'warn' | 'skip';
export interface Check { id: string; label: string; state: CheckState; detail: string; fix?: string }

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function interpretRpcError(e: { code?: string; message?: string }): { state: CheckState; detail: string; fix: string } {
  if (e.code === 'PGRST202' || /could not find the function/i.test(e.message ?? '')) return { state: 'fail', detail: 'The database has no PulseNet tables or functions yet.', fix: 'Supabase dashboard -> SQL Editor -> paste supabase/migrations/20261026000000_pulsenet.sql -> Run.' };
  if (e.code === '42501') return { state: 'warn', detail: 'Database reachable, but access was denied.', fix: 'Sign in first, or re-run the SQL file so permissions are set.' };
  if (/jwt|token/i.test(e.message ?? '')) return { state: 'fail', detail: 'The key was rejected.', fix: 'Copy the anon / publishable key again from Project Settings -> API.' };
  return { state: 'fail', detail: e.message ?? 'Unknown database error', fix: 'Check the Supabase project is not paused (dashboard -> project home -> Restore).' };
}

async function waitRealtime(ms = 7000): Promise<boolean> {
  if (!supabase) return false;
  const sb = supabase;
  return new Promise<boolean>((resolve) => {
    const ch = sb.channel(`status-${Date.now()}`);
    const done = (v: boolean) => { clearTimeout(t); void sb.removeChannel(ch); resolve(v); };
    const t = setTimeout(() => done(false), ms);
    ch.subscribe((s) => { if (s === 'SUBSCRIBED') done(true); if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') done(false); });
  });
}

export async function runChecks(onUpdate: (c: Check[]) => void): Promise<Check[]> {
  const out: Check[] = [];
  const push = (c: Check) => { out.push(c); onUpdate([...out]); };

  if (!cloudConfigured || !supabase) {
    push({ id: 'env', label: 'App settings', state: 'fail', detail: 'This build has no Supabase URL / key.', fix: 'Create .env with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart with: npx expo start -c  (for an APK, run node scripts/apply-update.mjs and rebuild).' });
    return out;
  }
  push({ id: 'env', label: 'App settings', state: 'ok', detail: `Project ${url.replace(/^https?:\/\//, '').split('.')[0]}` });

  try {
    await fetchJson(`${url}/auth/v1/health`, { headers: { apikey: key }, timeoutMs: 8000 });
    push({ id: 'server', label: 'Supabase reachable', state: 'ok', detail: 'The server answered.' });
  } catch (e) {
    push({ id: 'server', label: 'Supabase reachable', state: 'fail', detail: e instanceof Error ? e.message : 'No answer', fix: 'Check your internet. If it still fails, the URL may be wrong or the project paused: dashboard -> project home -> Restore.' });
  }

  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  push(uid
    ? { id: 'auth', label: 'Signed in', state: 'ok', detail: s.session!.user.email ?? 'Signed in' }
    : { id: 'auth', label: 'Signed in', state: 'warn', detail: 'Not signed in. Database checks below need an account.', fix: 'Profile tab -> Sign in or create account.' });

  if (uid) {
    const rpc = await supabase.rpc('nearby_alerts', { p_lat: 0, p_lon: 0, p_radius_km: 1, p_since_hours: 1 });
    push(rpc.error ? { id: 'db', label: 'Database set up', ...interpretRpcError(rpc.error) } : { id: 'db', label: 'Database set up', state: 'ok', detail: 'Tables, security rules and functions are in place.' });

    const prof = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
    push(prof.error ? { id: 'profile', label: 'Your profile row', state: 'fail', detail: prof.error.message, fix: 'Re-run the SQL file.' }
      : prof.data ? { id: 'profile', label: 'Your profile row', state: 'ok', detail: `Role: ${prof.data.role}` }
        : { id: 'profile', label: 'Your profile row', state: 'fail', detail: 'No profile was created for this account.', fix: 'The signup trigger is missing: re-run the SQL file, then sign out and sign up again.' });

    const bucket = await supabase.storage.from('evidence').list(uid, { limit: 1 });
    push(bucket.error ? { id: 'storage', label: 'Photo storage', state: 'fail', detail: bucket.error.message, fix: 'Re-run the SQL file: it creates the private "evidence" bucket.' } : { id: 'storage', label: 'Photo storage', state: 'ok', detail: 'Private evidence bucket is ready.' });

    const live = await waitRealtime();
    push(live ? { id: 'realtime', label: 'Live updates (Realtime)', state: 'ok', detail: 'Connected.' } : { id: 'realtime', label: 'Live updates (Realtime)', state: 'warn', detail: 'Could not connect within 7 seconds.', fix: 'Check your connection. In the dashboard make sure Realtime is enabled (Project Settings -> API / Realtime).' });

    try {
      const st = await aiStatus();
      push(st.configured ? { id: 'ai', label: 'Pulse AI', state: 'ok', detail: `${st.provider} / ${st.model}. Use "Test AI" to prove the key works.` } : { id: 'ai', label: 'Pulse AI', state: 'warn', detail: 'Function deployed, but no AI key is set.', fix: 'supabase secrets set GROQ_API_KEY=...  (or GEMINI_API_KEY) then redeploy: supabase functions deploy pulse-ai' });
    } catch (e) {
      const code = e instanceof PulseError ? e.code : 'unavailable';
      push({ id: 'ai', label: 'Pulse AI', state: 'warn', detail: code === 'unavailable' ? 'The pulse-ai function is not deployed (or is failing).' : PULSE_MESSAGES[code], fix: 'supabase functions deploy pulse-ai   (see docs/SUPABASE.md section 3)' });
    }
    const tok = await getStoredPushToken();
    push({ id: 'push', label: 'Background alerts', state: tok ? 'ok' : 'skip', detail: tok ? 'This phone is registered.' : 'Off (optional). Turn on in Profile. Needs the installed APK.' });
  }
  return out;
}

export async function testAi(): Promise<Check> {
  try {
    const r = await aiPing();
    return { id: 'aiping', label: 'AI test call', state: r.ok ? 'ok' : 'fail', detail: `${r.provider} / ${r.model} answered: "${r.sample}"` };
  } catch (e) {
    if (e instanceof PulseError) {
      const bad = e.detail ?? '';
      const fix = /provider_401|provider_403/.test(bad) ? 'The AI key was rejected. Create a new key and set it again with supabase secrets set.'
        : /provider_404/.test(bad) ? 'That model name does not exist for your key. Set another: supabase secrets set AI_MODEL=<model>.'
          : /provider_429/.test(bad) ? 'You hit the free-tier limit. Wait a minute and try again.'
            : 'See the function logs: Supabase dashboard -> Edge Functions -> pulse-ai -> Logs.';
      return { id: 'aiping', label: 'AI test call', state: 'fail', detail: `${PULSE_MESSAGES[e.code]}${bad ? ` (${bad})` : ''}`, fix };
    }
    return { id: 'aiping', label: 'AI test call', state: 'fail', detail: 'Unexpected error.' };
  }
}
