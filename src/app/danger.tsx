import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Switch } from 'react-native';
import { Btn, Card, Chip, Empty, H, Notice, Row, SEV_COLOR, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { formatDistance } from '../lib/geo';
import { ALL_TYPES, COVERAGE, DEFAULT_CONFIG, DangerConfig, MIN_INTERVAL_S, RefreshResult, getDangerConfig, isMonitoring, onDangerUpdate, refreshDanger, saveDangerConfig, startDangerMonitoring, stopDangerMonitoring } from '../services/danger';
import { ensureNotificationPermission } from '../lib/notify';

const LABEL: Record<string, string> = { crime: 'Crime', environmentalHazard: 'Weather and environment', trafficAccident: 'Traffic', naturalDisaster: 'Natural events', civilUnrest: 'Civil unrest', diseaseOutbreak: 'Disease' };
const RADII = [1000, 5000, 10000, 25000];

export default function Danger() {
  const router = useRouter();
  const [cfg, setCfg] = useState<DangerConfig>(DEFAULT_CONFIG);
  const [res, setRes] = useState<RefreshResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [mon, setMon] = useState(isMonitoring());

  const refresh = useCallback(async (c: DangerConfig) => {
    setBusy(true);
    setRes(await refreshDanger(c));
    setBusy(false);
  }, []);

  useEffect(() => {
    let off = () => {};
    void (async () => {
      const c = await getDangerConfig();
      setCfg(c);
      await refresh(c);
      off = onDangerUpdate(setRes);
    })();
    return () => off();
  }, [refresh]);

  const update = async (patch: Partial<DangerConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    await saveDangerConfig(next);
    await refresh(next);
  };

  return (
    <Screen>
      <Notice kind="info">Shows real data from USGS, NASA EONET and the Open-Meteo forecast, plus hazards you report. Nothing is invented. This is not an official warning system: follow SA Weather Service and local authorities.</Notice>
      <Btn label={busy ? 'Checking…' : 'Check my surroundings now'} busy={busy} onPress={() => void refresh(cfg)} />
      <Row gap={8}>
        <Btn small outline color={C.amber} label="Report a hazard" onPress={() => router.push('/report')} />
        <Btn small outline color={mon ? C.amber : C.teal} label={mon ? 'Stop background checks' : 'Check every few minutes'} onPress={async () => {
          if (mon) { stopDangerMonitoring(); setMon(false); } else { await ensureNotificationPermission(); await startDangerMonitoring(); setMon(true); }
        }} />
      </Row>
      {mon && <T dim small>Checks run every {Math.max(MIN_INTERVAL_S, cfg.updateIntervalSeconds) / 60} min while PulseNet is open and alert you about high or critical items.</T>}

      {res?.errors.map((e) => <Notice key={e.source} kind="warn">{e.source}: {e.message}</Notice>)}
      {res && !busy && res.at && res.alerts.length === 0 && res.errors.length === 0 && <Empty title="Nothing reported nearby" body={`No events from our sources within range as of ${new Date(res.fetchedAt).toLocaleTimeString()}. That does not guarantee safety.`} />}
      {res?.alerts.map((a) => (
        <Card key={a.id} accent={SEV_COLOR[a.severity]}>
          <Row><T bold style={{ flex: 1 }}>{a.title}</T><T small color={SEV_COLOR[a.severity]} bold>{a.severity}</T></Row>
          <T dim small>{a.description}</T>
          <T dim small>{a.distanceM > 0 ? `${formatDistance(a.distanceM)} away · ` : ''}{new Date(a.timestamp).toLocaleString()}</T>
          <T dim small>Why {a.severity}: {a.basis}. Source: {a.source}</T>
          {a.sourceUrl ? <Btn small outline label="Open source" onPress={() => void Linking.openURL(a.sourceUrl!)} /> : null}
        </Card>
      ))}

      <H>What is monitored</H>
      <Row wrap>{ALL_TYPES.map((t) => <Chip key={t} label={LABEL[t]} active={cfg.types.includes(t)} onPress={() => void update({ types: cfg.types.includes(t) ? cfg.types.filter((x) => x !== t) : [...cfg.types, t] })} />)}</Row>
      {ALL_TYPES.map((t) => <T key={t} small dim>{LABEL[t]}: {COVERAGE[t].live ? 'live feed · ' : ''}{COVERAGE[t].sources}</T>)}
      <T bold>Radius for your reports</T>
      <Row wrap>{RADII.map((r) => <Chip key={r} label={`${r / 1000} km`} active={cfg.radiusM === r} onPress={() => void update({ radiusM: r })} />)}</Row>
      <Row><T style={{ flex: 1 }}>Notify me about high and critical alerts</T><Switch value={cfg.notifications} onValueChange={(v) => void update({ notifications: v })} trackColor={{ true: C.teal }} /></Row>
    </Screen>
  );
}
