import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { C } from '../constants/theme';
import { formatDistance } from '../lib/geo';
import { AlertFilter, activeOnly, matchesFilter } from '../services/alertsLogic';
import { feed, useFeed } from '../services/alertsStore';
import { DEFAULT_CONFIG, DangerAlert, refreshDanger } from '../services/danger';
import { AlertCard } from './AlertCard';
import { FeedNotice } from './FeedNotice';
import { Btn, Card, Chip, H, Row, SEV_COLOR, T } from './ui';

const FILTERS: { id: AlertFilter; label: string; color: string }[] = [
  { id: 'all', label: 'All', color: C.brand },
  { id: 'emergency', label: 'Emergency', color: C.crimson },
  { id: 'info', label: 'Info', color: C.sky },
];

export function AlertsTab() {
  const router = useRouter();
  const f = useFeed();
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [env, setEnv] = useState<DangerAlert[]>([]);
  const [envNote, setEnvNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    await feed.refresh();
    // environmental alerts from real public feeds (USGS, NASA EONET, Open-Meteo)
    const r = await refreshDanger({ ...DEFAULT_CONFIG, types: ['naturalDisaster', 'environmentalHazard'] });
    setEnv(r.alerts.filter((a) => a.source !== 'Reported on this device'));
    setEnvNote(r.errors.length ? `Could not reach: ${r.errors.map((e) => e.source).join(', ')}.` : '');
    setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const community = f.alerts.filter((a) => activeOnly(a) && matchesFilter(a.severity, filter));
  const environmental = env.filter((a) => matchesFilter(a.severity, filter));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void load()} tintColor={C.brand} />}>
      <H>Alerts</H>
      <Row>{FILTERS.map((x) => <Chip key={x.id} label={x.label} active={filter === x.id} color={x.color} onPress={() => setFilter(x.id)} />)}</Row>
      <T dim small>{f.live ? 'Live: new reports appear here as they are filed.' : 'Pull down to refresh.'} Radius {f.radiusKm} km.</T>
      <Row wrap>{[5, 10, 25].map((km) => <Chip key={km} label={`${km} km`} active={f.radiusKm === km} onPress={() => void feed.setRadius(km)} />)}</Row>

      <FeedNotice f={f} onRetry={() => void load()} />
      <T bold>Community reports</T>
      {f.status === 'ok' && community.length === 0 && <Card><T dim small>No {filter === 'all' ? '' : filter + ' '}reports within {f.radiusKm} km in the last 3 days. This is not a safety guarantee.</T></Card>}
      {community.map((a) => <AlertCard key={a.id} a={a} onPress={() => router.push({ pathname: '/alert-detail', params: { id: a.id } })} />)}

      <T bold>Environmental alerts</T>
      <T dim small>Live data from USGS, NASA EONET and the Open-Meteo forecast. Not official warnings.</T>
      {envNote ? <T small color={C.amber}>{envNote}</T> : null}
      {!busy && environmental.length === 0 && !envNote && <Card><T dim small>Nothing from these sources for your area right now.</T></Card>}
      {environmental.map((a) => (
        <Card key={a.id} accent={SEV_COLOR[a.severity]}>
          <T bold>{a.title}</T>
          <T dim small>{a.description}{a.distanceM > 0 ? ` · ${formatDistance(a.distanceM)} away` : ''}</T>
          <T dim small>Why {a.severity}: {a.basis}. Source: {a.source}</T>
        </Card>
      ))}
      <Btn outline label="Open full environmental view" onPress={() => router.push('/danger')} />
    </ScrollView>
  );
}
