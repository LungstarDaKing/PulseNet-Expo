import React, { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Btn, Card, Empty, Field, H, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { useAsync } from '../hooks/useAsync';
import { BleDevice, Reading, Zone, bleSupported, bpmFromTaps, classifyBpm, connectHeartRate, disconnectHeartRate, getHistory, recordReading, scanHeartRateDevices } from '../services/vitals';

const ZONE: Record<Zone, { label: string; color: string }> = {
  'critical-low': { label: 'Critically low', color: C.crimson },
  low: { label: 'Low', color: C.amber },
  normal: { label: 'Normal range', color: C.ok },
  elevated: { label: 'Elevated', color: C.amber },
  'critical-high': { label: 'Critically high', color: C.crimson },
};

export default function Vitals() {
  const hist = useAsync(getHistory, [] as Reading[]);
  const [live, setLive] = useState<number | null>(null);
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [manual, setManual] = useState('');
  const [taps, setTaps] = useState<number[]>([]);
  const [err, setErr] = useState('');
  const last = useRef(0);

  const save = async (bpm: number, src: Reading['source']) => {
    try {
      const { outcome } = await recordReading(bpm, src);
      if (outcome.alerted) Alert.alert('Critical heart rate', 'Sustained critical readings. If you feel unwell call 10177 or 112.');
      await hist.reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); }
  };

  const scan = async () => {
    setErr(''); setDevices([]); setScanning(true);
    try { await scanHeartRateDevices((d) => setDevices((p) => (p.some((x) => x.id === d.id) ? p : [...p, d]))); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Scan failed'); }
    setScanning(false);
  };
  const connect = async (d: BleDevice) => {
    try {
      await connectHeartRate(d.id, (bpm) => {
        setLive(bpm);
        if (Date.now() - last.current > 15000) { last.current = Date.now(); void save(bpm, 'ble'); } // store one reading every 15 s
      }, () => setConnected(false));
      setConnected(true); setErr('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not connect'); }
  };

  const tapBpm = bpmFromTaps(taps);
  const tap = () => setTaps((t) => [...t.filter((x) => Date.now() - x < 15000), Date.now()]);

  return (
    <Screen>
      <Notice kind="warn">PulseNet is not a medical device. Readings are for awareness only. If you feel unwell call 10177 or 112.</Notice>
      <Card accent={live ? ZONE[classifyBpm(live)].color : C.border}>
        <H>{live ? `${live} bpm` : '-- bpm'}</H>
        <T dim>{live ? ZONE[classifyBpm(live)].label : connected ? 'Waiting for the first reading…' : 'Not connected'}</T>
      </Card>

      <H>Bluetooth heart-rate monitor</H>
      {!bleSupported() && <Notice kind="info">Bluetooth needs the installed APK or a development build. It is not available in Expo Go.</Notice>}
      <Btn label={scanning ? 'Scanning (10 s)…' : 'Scan for monitors'} busy={scanning} onPress={() => void scan()} />
      {devices.map((d) => <Card key={d.id}><T bold>{d.name ?? 'Unnamed device'}</T><Btn small label="Connect" onPress={() => void connect(d)} /></Card>)}
      {connected && <Btn outline color={C.amber} label="Disconnect" onPress={() => void disconnectHeartRate().then(() => { setConnected(false); setLive(null); })} />}

      <H>Count it yourself</H>
      <T dim small>Find your pulse, then tap the button on every beat (5 or more taps).</T>
      <Btn label={tapBpm ? `${tapBpm} bpm · tap again or save` : `Tap each beat (${taps.length})`} color={C.violet} onPress={tap} />
      <Row>
        <Btn small outline disabled={!tapBpm} label="Save this" onPress={() => { if (tapBpm) { void save(tapBpm, 'tap'); setTaps([]); } }} />
        <Btn small outline color={C.textDim} label="Reset" onPress={() => setTaps([])} />
      </Row>
      <Field label="Or enter a reading (bpm)" value={manual} onChangeText={setManual} keyboardType="number-pad" />
      <Btn outline label="Save reading" onPress={() => { void save(parseInt(manual, 10), 'manual'); setManual(''); }} />
      {err ? <Notice kind="error">{err}</Notice> : null}

      <H>History</H>
      {hist.data.length === 0 ? <Empty title="No readings yet" body="Saved readings appear here (last 100, encrypted on this phone)." /> : hist.data.slice(0, 20).map((r) => (
        <Card key={r.id} accent={ZONE[r.zone].color}><T bold>{r.bpm} bpm · {ZONE[r.zone].label}</T><T dim small>{new Date(r.at).toLocaleString()} · {r.source}</T></Card>
      ))}
    </Screen>
  );
}
