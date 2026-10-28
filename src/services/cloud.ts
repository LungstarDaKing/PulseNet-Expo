import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { LatLng } from '../lib/geo';
import { ensureNotificationPermission } from '../lib/notify';
import { isNetworkError, supabase } from '../lib/supabase';
import { plainGet, plainRemove, plainSet, secureGetJSON, secureSetJSON } from '../lib/storage';
import { logEvent } from './audit';
import { ALLOWED_MIME, CommunityAlert, EXT_FOR_MIME, MAX_EVIDENCE_BYTES, ReportInput, validateReportInput } from './alertsLogic';

/** All talking to Supabase lives here so screens never see raw responses. */

export class CloudError extends Error {
  constructor(public code: 'not_configured' | 'signed_out' | 'offline' | 'rejected' | 'invalid', message: string) {
    super(message);
  }
}

function client() {
  if (!supabase) throw new CloudError('not_configured', 'Community features are not connected yet.');
  return supabase;
}
async function requireUser(): Promise<string> {
  const { data } = await client().auth.getSession();
  if (!data.session) throw new CloudError('signed_out', 'Sign in to use community features.');
  return data.session.user.id;
}

// ------------------------------------------------------------------ alerts
export async function fetchNearbyAlerts(at: LatLng, radiusKm: number, sinceHours = 72): Promise<CommunityAlert[]> {
  await requireUser();
  const { data, error } = await client().rpc('nearby_alerts', { p_lat: at.latitude, p_lon: at.longitude, p_radius_km: radiusKm, p_since_hours: sinceHours });
  if (error) throw new CloudError(isNetworkError(error) ? 'offline' : 'rejected', isNetworkError(error) ? 'No connection.' : 'Could not load alerts.');
  return (data ?? []) as CommunityAlert[];
}

export type AlertEvent = { kind: 'upsert'; row: Omit<CommunityAlert, 'distance_km' | 'confirmed_by_me'> } | { kind: 'delete'; id: string };

/** Live updates (Supabase Realtime). Returns an unsubscribe function. */
export function subscribeAlerts(onEvent: (e: AlertEvent) => void, onStatus?: (live: boolean) => void): () => void {
  const sb = client();
  const channel = sb
    .channel('public-alerts')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'public_alerts' }, (p) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as { id?: string }).id;
        if (id) onEvent({ kind: 'delete', id });
      } else {
        onEvent({ kind: 'upsert', row: p.new as AlertEvent extends { row: infer R } ? R : never });
      }
    })
    .subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));
  return () => { void sb.removeChannel(channel); };
}

export async function setConfirmation(reportId: string, confirmed: boolean): Promise<void> {
  const uid = await requireUser();
  const sb = client();
  const { error } = confirmed
    ? await sb.from('incident_confirmations').insert({ report_id: reportId })
    : await sb.from('incident_confirmations').delete().eq('report_id', reportId).eq('user_id', uid);
  if (error && error.code !== '23505') throw new CloudError(isNetworkError(error) ? 'offline' : 'rejected', isNetworkError(error) ? 'No connection.' : 'You cannot confirm this report.');
}

export async function moderate(id: string, o: { status?: string; verified?: boolean; note?: string }): Promise<void> {
  await requireUser();
  const { error } = await client().rpc('moderate_report', { p_id: id, p_status: o.status ?? null, p_verified: o.verified ?? null, p_note: o.note ?? null });
  if (error) throw new CloudError('rejected', error.message.includes('forbidden') ? 'Only moderators can do that.' : 'Could not update the report.');
}

// ------------------------------------------------------------------ my reports
export interface MyReport {
  id: string;
  type: string;
  description: string;
  severity: string;
  status: string;
  verified: boolean;
  created_at: string;
  evidence: number;
}

export async function getMyReports(): Promise<MyReport[]> {
  await requireUser();
  const { data, error } = await client()
    .from('incident_reports')
    .select('id, type, description, severity, status, verified, created_at, incident_evidence(count)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new CloudError(isNetworkError(error) ? 'offline' : 'rejected', 'Could not load your reports.');
  return (data ?? []).map((r) => ({ ...(r as unknown as MyReport), evidence: ((r as { incident_evidence?: { count: number }[] }).incident_evidence?.[0]?.count) ?? 0 }));
}

export async function markMyReportResolved(id: string): Promise<void> {
  await requireUser();
  const { error } = await client().rpc('set_my_report_status', { p_id: id, p_status: 'resolved' });
  if (error) throw new CloudError('rejected', 'Could not update the report.');
}

export async function deleteMyReport(id: string): Promise<void> {
  await requireUser();
  const sb = client();
  const { data: ev } = await sb.from('incident_evidence').select('storage_path').eq('report_id', id);
  const paths = (ev ?? []).map((e: { storage_path: string }) => e.storage_path);
  if (paths.length) await sb.storage.from('evidence').remove(paths);
  const { error } = await sb.from('incident_reports').delete().eq('id', id);
  if (error) throw new CloudError('rejected', 'Could not delete the report.');
  await logEvent('report_deleted', 'Community report deleted by its author');
}

// ------------------------------------------------------------------ submitting (with offline outbox)
export interface SubmitOutcome {
  status: 'sent' | 'queued';
  id: string;
  evidenceFailed: number;
}

interface OutboxItem {
  id: string;
  input: ReportInput;
  createdAt: string;
  failed?: string;
}
const OUTBOX = 'report_outbox';
export const getOutbox = () => secureGetJSON<OutboxItem[]>(OUTBOX, []);

type SendResult = { ok: true; evidenceFailed: number } | { ok: false; network: boolean; message: string };

async function sendReport(id: string, input: ReportInput): Promise<SendResult> {
  const sb = client();
  const { data: s } = await sb.auth.getSession();
  if (!s.session) return { ok: false, network: false, message: 'Sign in to send reports.' };
  const uid = s.session.user.id;

  const { error } = await sb.from('incident_reports').insert({
    id,
    type: input.type,
    description: input.description.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy_m: input.accuracy,
    severity: input.severity,
    severity_source: input.severitySource,
    ai_summary: input.aiSummary ?? null,
  });
  // 23505 = the same report id already arrived (a retry after a lost response): treat as sent
  if (error && error.code !== '23505') {
    if (isNetworkError(error)) return { ok: false, network: true, message: 'No connection.' };
    return { ok: false, network: false, message: error.message.startsWith('rate_limit') ? 'You have sent too many reports this hour. Please wait.' : 'The report was rejected. Check the details and try again.' };
  }

  let failed = 0;
  for (let n = 0; n < input.evidence.length; n++) {
    const ev = input.evidence[n];
    try {
      if (!ALLOWED_MIME.includes(ev.mime)) throw new Error('type');
      const buf = await new File(ev.uri).arrayBuffer();
      if (buf.byteLength > MAX_EVIDENCE_BYTES) throw new Error('size');
      const path = `${uid}/${id}/${n}.${EXT_FOR_MIME[ev.mime]}`;
      const up = await sb.storage.from('evidence').upload(path, buf, { contentType: ev.mime, upsert: true });
      if (up.error) throw up.error;
      const row = await sb.from('incident_evidence').insert({ report_id: id, storage_path: path, mime: ev.mime });
      if (row.error && row.error.code !== '23505') throw row.error;
    } catch {
      failed++;
    }
  }
  return { ok: true, evidenceFailed: failed };
}

export async function submitCommunityReport(input: ReportInput): Promise<SubmitOutcome> {
  const invalid = validateReportInput(input);
  if (invalid) throw new CloudError('invalid', invalid);
  await requireUser();
  const id = Crypto.randomUUID();
  const res = await sendReport(id, input);
  if (res.ok) {
    await logEvent('report_sent', 'Community report sent', { type: input.type, severity: input.severity, evidence: input.evidence.length });
    return { status: 'sent', id, evidenceFailed: res.evidenceFailed };
  }
  if (res.network) {
    await secureSetJSON(OUTBOX, [...(await getOutbox()), { id, input, createdAt: new Date().toISOString() }]);
    await logEvent('report_queued', 'Report saved to outbox: no connection', undefined, 'warning');
    return { status: 'queued', id, evidenceFailed: 0 };
  }
  throw new CloudError('rejected', res.message);
}

/** Retries queued reports. Stops at the first network failure. Returns how many were sent. */
export async function flushOutbox(): Promise<number> {
  if (!supabase) return 0;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return 0;
  const items = await getOutbox();
  if (items.length === 0) return 0;
  const left: OutboxItem[] = [];
  let sent = 0;
  let offline = false;
  for (const it of items) {
    if (offline) { left.push(it); continue; }
    const r = await sendReport(it.id, it.input);
    if (r.ok) sent++;
    else if (r.network) { offline = true; left.push(it); }
    else left.push({ ...it, failed: r.message });
  }
  await secureSetJSON(OUTBOX, left);
  if (sent) await logEvent('outbox_flushed', 'Queued reports sent', { sent });
  return sent;
}
export async function discardOutboxItem(id: string): Promise<void> {
  await secureSetJSON(OUTBOX, (await getOutbox()).filter((i) => i.id !== id));
}

// ------------------------------------------------------------------ push notifications
const PUSH_TOKEN = 'push_token_v1';
const PUSH_RADIUS = 'push_radius_km_v1';
export const getStoredPushToken = () => plainGet(PUSH_TOKEN);
export const getPushRadius = async () => parseInt((await plainGet(PUSH_RADIUS)) ?? '10', 10);

export async function enablePush(at: LatLng, radiusKm: number): Promise<{ ok: boolean; reason?: string }> {
  try {
    await requireUser();
    if (!Device.isDevice) return { ok: false, reason: 'Push needs a real phone.' };
    if (!(await ensureNotificationPermission())) return { ok: false, reason: 'Notifications are turned off for PulseNet in phone settings.' };
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { ok: false, reason: 'This build has no EAS project id. Run "eas init" and rebuild.' };
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await client().rpc('register_push_token', { p_token: token, p_platform: Platform.OS === 'ios' ? 'ios' : 'android', p_lat: at.latitude, p_lon: at.longitude, p_radius_km: radiusKm });
    if (error) return { ok: false, reason: 'Could not register this phone. Try again.' };
    await plainSet(PUSH_TOKEN, token);
    await plainSet(PUSH_RADIUS, String(radiusKm));
    await logEvent('push_enabled', 'Push alerts enabled', { radiusKm });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (e instanceof CloudError) return { ok: false, reason: e.message };
    if (/expo go|development build|not supported|projectId/i.test(msg)) return { ok: false, reason: 'Background alerts need the installed app (APK), not Expo Go.' };
    return { ok: false, reason: 'Could not turn on background alerts.' };
  }
}

export async function disablePush(): Promise<void> {
  const token = await getStoredPushToken();
  if (token && supabase) await supabase.rpc('unregister_push_token', { p_token: token });
  await plainRemove(PUSH_TOKEN);
  await logEvent('push_disabled', 'Push alerts disabled');
}

/** Keeps the stored (rounded) location current while push is on. */
export async function refreshPushLocation(at: LatLng): Promise<void> {
  const token = await getStoredPushToken();
  if (!token || !supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS === 'ios' ? 'ios' : 'android', p_lat: at.latitude, p_lon: at.longitude, p_radius_km: await getPushRadius() });
}
