import { useSyncExternalStore } from 'react';
import { LatLng, haversine } from '../lib/geo';
import { getPosition } from '../lib/location';
import { cloudConfigured, supabase } from '../lib/supabase';
import { notifyNow } from '../lib/notify';
import { plainGet, plainSet } from '../lib/storage';
import { CommunityAlert, TRUST_LABEL, activeOnly, removeAlert, sevRank, trustLevel, typeInfo, upsertAlert } from './alertsLogic';
import { CloudError, AlertEvent, fetchNearbyAlerts, flushOutbox, getOutbox, refreshPushLocation, subscribeAlerts } from './cloud';

/**
 * One shared feed of community alerts for Home, Alerts and Map.
 * Status is explicit so the UI never shows an empty list as "all clear" when the real answer is
 * "not signed in", "no connection" or "no location".
 */
export type FeedStatus = 'unconfigured' | 'signedout' | 'nolocation' | 'loading' | 'ok' | 'offline' | 'error';

export interface FeedState {
  status: FeedStatus;
  alerts: CommunityAlert[];
  pos: LatLng | null;
  radiusKm: number;
  live: boolean;
  fetchedAt: number | null;
  outbox: number;
  message: string;
}

const initial: FeedState = { status: cloudConfigured ? 'loading' : 'unconfigured', alerts: [], pos: null, radiusKm: 10, live: false, fetchedAt: null, outbox: 0, message: '' };

class Feed {
  private s: FeedState = initial;
  private listeners = new Set<() => void>();
  private unsub: (() => void) | null = null;
  private notified = new Set<string>();
  private own = new Set<string>();
  private inflight: Promise<void> | null = null;

  getSnapshot = () => this.s;
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  private set(p: Partial<FeedState>) { this.s = { ...this.s, ...p }; this.listeners.forEach((l) => l()); }

  /** Remember reports you just sent so you are not notified about your own alert. */
  markOwn(id: string) { this.own.add(id); }

  async setRadius(km: number) { await plainSet('alerts_radius_km', String(km)); this.set({ radiusKm: km }); await this.refresh(); }

  refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = this.doRefresh().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  private async doRefresh() {
    if (!supabase) { this.set({ status: 'unconfigured', alerts: [] }); return; }
    const km = parseInt((await plainGet('alerts_radius_km')) ?? '10', 10);
    this.set({ radiusKm: km });
    const { data } = await supabase.auth.getSession();
    if (!data.session) { this.stopRealtime(); this.set({ status: 'signedout', alerts: [], message: '' }); return; }
    this.set({ status: this.s.alerts.length ? this.s.status : 'loading' });
    const sent = await flushOutbox().catch(() => 0);
    const outbox = (await getOutbox()).length;
    const pos = await getPosition();
    if (!pos) { this.set({ status: 'nolocation', outbox, message: 'Turn on location to see alerts near you.' }); return; }
    this.set({ pos });
    try {
      const alerts = await fetchNearbyAlerts(pos, km);
      this.set({ status: 'ok', alerts, fetchedAt: Date.now(), outbox, message: sent ? `${sent} queued report${sent > 1 ? 's' : ''} sent.` : '' });
      this.startRealtime();
      void refreshPushLocation(pos).catch(() => undefined);
    } catch (e) {
      const offline = e instanceof CloudError && e.code === 'offline';
      this.set({ status: offline ? 'offline' : 'error', outbox, message: offline ? 'No connection. Showing the last alerts we loaded.' : 'Could not load alerts. Pull to retry.' });
    }
  }

  private startRealtime() {
    if (this.unsub || !supabase) return;
    this.unsub = subscribeAlerts((e) => this.onEvent(e), (live) => this.set({ live }));
  }
  stopRealtime() { this.unsub?.(); this.unsub = null; this.set({ live: false }); }

  private onEvent(e: AlertEvent) {
    const pos = this.s.pos;
    if (e.kind === 'delete') { this.set({ alerts: removeAlert(this.s.alerts, e.id) }); return; }
    const r = e.row;
    if (r.status === 'dismissed') { this.set({ alerts: removeAlert(this.s.alerts, r.id) }); return; }
    const dist = pos ? haversine(pos, r) / 1000 : null;
    if (dist != null && dist > this.s.radiusKm) { this.set({ alerts: removeAlert(this.s.alerts, r.id) }); return; }
    const known = this.s.alerts.some((a) => a.id === r.id);
    const row: CommunityAlert = { ...r, distance_km: dist, confirmed_by_me: false };
    this.set({ alerts: upsertAlert(this.s.alerts, row) });
    // foreground heads-up for serious, new, active alerts that are not yours
    if (!known && !this.own.has(r.id) && activeOnly(r) && sevRank(r.severity) >= sevRank('high') && !this.notified.has(r.id)) {
      this.notified.add(r.id);
      void notifyNow(`${typeInfo(r.type).label} reported ${dist != null ? `${dist.toFixed(1)} km away` : 'nearby'}`, `${TRUST_LABEL[trustLevel(r)]}. Open PulseNet for details.`, { alertId: r.id });
    }
  }

  setConfirmedLocal(id: string, confirmed: boolean) {
    this.set({ alerts: this.s.alerts.map((a) => (a.id === id ? { ...a, confirmed_by_me: confirmed, confirmations: Math.max(0, a.confirmations + (confirmed ? 1 : -1)) } : a)) });
  }
}

export const feed = new Feed();
export const useFeed = (): FeedState => useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
