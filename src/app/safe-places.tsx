import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { Btn, Card, Chip, Empty, Field, H, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { formatDistance } from '../lib/geo';
import { Fix, getPosition } from '../lib/location';
import { useAsync } from '../hooks/useAsync';
import { HelpKind, KIND_LABEL, NearbyHelp, addUserPlace, fetchNearbyHelp, getUserPlaces, isGeofenceActive, openInMapsUrl, removeUserPlace, startGeofenceMonitoring, stopGeofenceMonitoring } from '../services/safePlaces';
import { award } from '../services/safePoints';
import { dialEmergencyNumber } from '../services/sos';

const KINDS = Object.keys(KIND_LABEL) as HelpKind[];

export default function SafePlaces() {
  const [pos, setPos] = useState<Fix | null>(null);
  const [items, setItems] = useState<NearbyHelp[]>([]);
  const [filter, setFilter] = useState<HelpKind | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cached, setCached] = useState(false);
  const [name, setName] = useState('');
  const [radius, setRadius] = useState('150');
  const [fence, setFence] = useState(isGeofenceActive());
  const places = useAsync(getUserPlaces, []);

  const find = useCallback(async (force = false) => {
    setBusy(true); setErr('');
    const p = await getPosition();
    setPos(p);
    if (!p) { setErr('Location unavailable. Turn on location and allow PulseNet to use it.'); setBusy(false); return; }
    try {
      const r = await fetchNearbyHelp(p, 5000, force);
      setItems(r.items); setCached(r.cached);
    } catch {
      setErr('Could not reach OpenStreetMap. Check your connection and try again.');
    }
    setBusy(false);
  }, []);
  useEffect(() => { void find(); }, [find]);

  const shown = items.filter((i) => filter === 'all' || i.kind === filter).slice(0, 30);

  const addHere = async () => {
    try {
      const p = pos ?? (await getPosition());
      if (!p) throw new Error('Location unavailable');
      await addUserPlace({ name, at: p, radiusM: parseInt(radius, 10) || 0 });
      setName('');
      void award('place_added');
      await places.reload();
    } catch (e) { Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again'); }
  };

  return (
    <Screen>
      <H>Help near you</H>
      <T dim small>Real places from OpenStreetMap within 5 km. Data is community-maintained: opening hours and phone numbers may be missing or out of date.</T>
      <Row wrap>
        <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        {KINDS.map((k) => <Chip key={k} label={KIND_LABEL[k]} active={filter === k} onPress={() => setFilter(k)} />)}
      </Row>
      <Btn label={busy ? 'Searching…' : 'Refresh'} busy={busy} onPress={() => void find(true)} />
      {err ? <Notice kind="error">{err}</Notice> : null}
      {cached && <Notice kind="info">Showing saved results from the last search (works offline).</Notice>}
      {!busy && !err && shown.length === 0 && <Empty title="Nothing found" body="No matching places within 5 km in OpenStreetMap." />}
      {shown.map((i) => (
        <Card key={i.id} accent={i.kind === 'police' || i.kind === 'hospital' ? C.crimson : C.teal}>
          <T bold>{i.name}</T>
          <T dim small>{KIND_LABEL[i.kind]} · {formatDistance(i.distanceM)}{i.address ? ` · ${i.address}` : ''}</T>
          {i.openingHours ? <T dim small>Hours: {i.openingHours}</T> : null}
          <Row>
            <Btn small label="Directions" onPress={() => void Linking.openURL(openInMapsUrl(i, i.name))} />
            {i.phone ? <Btn small outline label={`Call ${i.phone}`} onPress={() => void dialEmergencyNumber(i.phone!)} /> : null}
          </Row>
        </Card>
      ))}

      <H>My safe places</H>
      <T dim small>Get an alert when you arrive or leave. Works while PulseNet is open on this phone.</T>
      {places.data.map((p) => (
        <Card key={p.id}>
          <T bold>{p.name}</T>
          <T dim small>{p.radiusM} m radius{p.lastVisitedAt ? ` · last here ${new Date(p.lastVisitedAt).toLocaleString()}` : ''}</T>
          <Btn small outline color={C.crimson} label="Remove" onPress={() => void removeUserPlace(p.id).then(places.reload)} />
        </Card>
      ))}
      <Card>
        <T bold>Save where I am now</T>
        <Field label="Name (Home, Work…)" value={name} onChangeText={setName} />
        <Field label="Radius in metres (50 to 2000)" value={radius} onChangeText={setRadius} keyboardType="number-pad" />
        <Btn label="Save this place" onPress={() => void addHere()} />
      </Card>
      <Btn outline label={fence ? 'Stop arrive/leave alerts' : 'Start arrive/leave alerts'} color={fence ? C.amber : C.teal} onPress={async () => {
        if (fence) { stopGeofenceMonitoring(); setFence(false); } else setFence(await startGeofenceMonitoring());
      }} />
    </Screen>
  );
}
