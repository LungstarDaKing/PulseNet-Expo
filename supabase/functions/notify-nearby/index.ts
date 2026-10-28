// Sends Expo push notifications to people near a serious new alert.
// Wire-up: Dashboard -> Database -> Webhooks -> create webhook on table public_alerts (Insert + Update)
//          type "Supabase Edge Functions" -> notify-nearby, add HTTP header  x-webhook-secret: <WEBHOOK_SECRET>
// Secrets: supabase secrets set WEBHOOK_SECRET=<long random string>
//
// Only HIGH / CRITICAL alerts notify. Unverified reports are described as unverified.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json } from '../_shared.ts';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('WEBHOOK_SECRET');

const LABEL: Record<string, string> = { medical: 'Medical emergency', fire: 'Fire', crime: 'Crime', accident: 'Road accident', other: 'Incident' };

interface Alert {
  id: string; type: string; severity: string; status: string; verified: boolean;
  latitude: number; longitude: number;
}
interface Hook { type: 'INSERT' | 'UPDATE' | 'DELETE'; table: string; record: Alert | null; old_record: Alert | null }

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-webhook-secret') !== SECRET) return json(401, { error: 'unauthorized' });
  let hook: Hook;
  try { hook = await req.json(); } catch { return json(400, { error: 'bad_json' }); }
  if (hook.table !== 'public_alerts' || !hook.record) return json(200, { skipped: 'ignored' });

  const a = hook.record;
  const isNew = hook.type === 'INSERT';
  const becameVerified = hook.type === 'UPDATE' && a.verified && !hook.old_record?.verified;
  if (!isNew && !becameVerified) return json(200, { skipped: 'no_notify_event' });
  if (!['open', 'investigating'].includes(a.status)) return json(200, { skipped: 'not_active' });
  if (!['high', 'critical'].includes(a.severity)) return json(200, { skipped: 'severity' });

  const admin = createClient(URL, SERVICE);
  const { data: rep } = await admin.from('incident_reports').select('reporter_id').eq('id', a.id).maybeSingle();
  const { data: tokens, error } = await admin.rpc('push_token_near', {
  p_lat: a.latitude,
  p_long: a.longitude,
  p_exclude: rep?.reporter_id ?? null,
});
  if (error) return json(500, { error: 'token_lookup_failed' });
  const list: string[] = (tokens ?? []).map((t: { token: string }) => t.token);
  if (list.length === 0) return json(200, { sent: 0 });

  const label = LABEL[a.type] ?? 'Incident';
  const title = a.verified ? `Verified: ${label.toLowerCase()} near you` : `${label} reported near you`;
  const body = a.verified
    ? 'A moderator verified this report. Open PulseNet for details. Call 10111 / 10177 / 112 if you are in danger.'
    : 'Unverified community report. Stay alert and open PulseNet for details. Call 10111 / 10177 / 112 if you are in danger.';

  let sent = 0;
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(chunk.map((to) => ({ to, title, body, sound: 'default', priority: 'high', channelId: 'pulsenet-alerts', data: { alertId: a.id } }))),
    });
    if (!res.ok) continue;
    const out = await res.json();
    const tickets: { status: string; details?: { error?: string } }[] = out.data ?? [];
    const dead: string[] = [];
    tickets.forEach((t, idx) => {
      if (t.status === 'ok') sent++;
      else if (t.details?.error === 'DeviceNotRegistered') dead.push(chunk[idx]);
    });
    if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
  }
  return json(200, { sent });
});
