import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Btn, Card, Chip, Empty, Field, H, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { formatDistance } from '../lib/geo';
import { getPosition } from '../lib/location';
import { ensureNotificationPermission } from '../lib/notify';
import { useAsync } from '../hooks/useAsync';
import { getContacts } from '../services/contacts';
import { award } from '../services/safePoints';
import { Place, searchPlaces } from '../services/routing';
import { CHECKS, Ride, endRide, currentRide, getHistory, onRide, reportConcern, rideDistanceM, rideEmergency, riskLabel, setCheck, shareRide, startRide } from '../services/taxi';

export default function Taxi() {
  const [ride, setRide] = useState<Ride | null>(currentRide());
  const contacts = useAsync(getContacts, []);
  const hist = useAsync(getHistory, [] as Ride[]);
  const [f, setF] = useState({ driverName: '', plate: '', vehicle: '', operator: '', destQ: '' });
  const [dest, setDest] = useState<Place | null>(null);
  const [results, setResults] = useState<Place[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [concern, setConcern] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => onRide(setRide), []);

  if (ride) {
    const col = ride.riskScore >= 60 ? C.crimson : ride.riskScore >= 30 ? C.amber : C.ok;
    return (
      <Screen>
        <Card accent={col}>
          <H>{ride.plate} · {ride.vehicle || 'vehicle'}</H>
          <T dim>{ride.operator || 'Taxi'} · driver {ride.driverName || 'unknown'} → {ride.destinationName || 'no destination'}</T>
          <T color={col} bold>Risk: {riskLabel(ride.riskScore)} ({ride.riskScore}/100)</T>
          <T dim small>Distance so far {formatDistance(rideDistanceM(ride))} · off-route alerts {ride.deviations} · route source: {ride.routeSource}</T>
        </Card>
        <H>Safety checks</H>
        {CHECKS.map((c) => <Chip key={c.key} label={c.label} active={ride.checks[c.key]} color={C.ok} onPress={() => void setCheck(c.key, !ride.checks[c.key])} />)}
        <H>Share this ride</H>
        <Row wrap>{contacts.data.map((c) => <Chip key={c.id} label={c.name} active={picked.includes(c.id)} onPress={() => setPicked(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id])} />)}</Row>
        <Btn label="Text ride details and location" disabled={picked.length === 0} onPress={async () => { const n = await shareRide(picked); Alert.alert(n > 0 ? 'Shared' : 'Not sent', n > 0 ? 'Ride details handed to your messaging.' : 'Nothing was sent.'); }} />
        <Field label="Something feels wrong? Note it" value={concern} onChangeText={setConcern} />
        <Btn outline label="Record concern" onPress={() => { void reportConcern(concern); setConcern(''); }} />
        <Btn color={C.crimson} label="Emergency: alert contacts now" onPress={() => void rideEmergency().then(() => Alert.alert('Alert sent', 'Open the SOS screen for status.'))} />
        <Btn color={C.ok} label="End ride (arrived safely)" onPress={async () => { const done = await endRide(); if (done && CHECKS.filter((c) => done.checks[c.key]).length >= 3) void award('ride_done'); await hist.reload(); }} />
      </Screen>
    );
  }

  const search = async () => {
    setBusy(true);
    try { setResults(await searchPlaces(f.destQ, (await getPosition()) ?? undefined)); } catch { setErr('Destination search failed. You can still start without one.'); }
    setBusy(false);
  };
  const start = async () => {
    setBusy(true);
    try { await ensureNotificationPermission(); await startRide({ driverName: f.driverName, plate: f.plate, vehicle: f.vehicle, operator: f.operator, destinationName: dest?.name.split(',')[0] ?? '', destination: dest ?? undefined }); setErr(''); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not start'); }
    setBusy(false);
  };

  return (
    <Screen>
      <H>Before you get in</H>
      <Field label="Number plate" value={f.plate} onChangeText={(v) => setF({ ...f, plate: v })} autoCapitalize="characters" />
      <Field label="Driver name (from the app)" value={f.driverName} onChangeText={(v) => setF({ ...f, driverName: v })} />
      <Field label="Vehicle (colour, make)" value={f.vehicle} onChangeText={(v) => setF({ ...f, vehicle: v })} />
      <Field label="Operator (Uber, Bolt, metered taxi…)" value={f.operator} onChangeText={(v) => setF({ ...f, operator: v })} />
      <Field label="Destination (optional, enables route tracking)" value={f.destQ} onChangeText={(v) => setF({ ...f, destQ: v })} onSubmitEditing={() => void search()} />
      <Btn small outline label="Find destination" busy={busy} onPress={() => void search()} />
      {results.map((p) => <Chip key={p.name} label={p.name.slice(0, 60)} active={dest?.name === p.name} onPress={() => setDest(p)} />)}
      {err ? <Notice kind="error">{err}</Notice> : null}
      <Btn label="Start ride safety" color={C.violet} busy={busy} onPress={() => void start()} />
      <H>Past rides</H>
      {hist.data.length === 0 ? <Empty title="No rides yet" body="Completed rides are listed here." /> : hist.data.map((r) => <Card key={r.id}><T bold>{r.plate} · {new Date(r.startedAt).toLocaleDateString()}</T><T dim small>Risk {riskLabel(r.riskScore)} · {r.deviations} off-route alerts · {r.concerns.length} concerns</T></Card>)}
    </Screen>
  );
}
