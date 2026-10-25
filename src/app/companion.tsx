import React, { useEffect, useState } from 'react';
import { Btn, Card, Chip, Empty, Field, H, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { formatDistance } from '../lib/geo';
import { getPosition } from '../lib/location';
import { ensureNotificationPermission } from '../lib/notify';
import { useAsync, useNow } from '../hooks/useAsync';
import { getContacts } from '../services/contacts';
import { Place, getRoute, searchPlaces, straightLine } from '../services/routing';
import { CompanionState, confirmCompanionOk, getCompanion, onCompanion, startCompanion, stopCompanion } from '../services/walk';

export default function Companion() {
  const [s, setS] = useState<CompanionState>(getCompanion());
  const contacts = useAsync(getContacts, []);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [dest, setDest] = useState<Place | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [info, setInfo] = useState('');
  const now = useNow(1000);
  useEffect(() => onCompanion(setS), []);

  const search = async () => {
    setBusy(true); setMsg('');
    try {
      const here = await getPosition();
      const r = await searchPlaces(q, here ?? undefined);
      setResults(r);
      if (r.length === 0) setMsg('No matches in South Africa. Try a fuller address.');
    } catch { setMsg('Search failed. Check your connection.'); }
    setBusy(false);
  };

  const start = async () => {
    if (!dest) return;
    setBusy(true); setMsg('');
    try {
      await ensureNotificationPermission();
      const here = await getPosition();
      if (!here) throw new Error('Location unavailable. Turn on location first.');
      let route = null;
      try { route = await getRoute(here, dest, 'foot'); } catch { /* use fallback */ }
      const r = route ?? straightLine(here, dest);
      setInfo(`${route ? 'Walking route' : 'Straight-line corridor (routing offline)'}: ${formatDistance(r.distanceM)}`);
      await startCompanion({ companionIds: picked, destinationName: dest.name.split(',')[0], route: r.points, origin: here });
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not start'); }
    setBusy(false);
  };

  if (s.active) {
    const secs = s.nextCheckInAt ? Math.round((s.nextCheckInAt - now) / 1000) : 0;
    const pending = s.pendingUntil != null;
    return (
      <Screen>
        <Card accent={s.lastLevel === 'ok' ? C.teal : s.lastLevel === 'warning' ? C.amber : C.crimson}>
          <H>Walking to {s.destinationName || 'destination'}</H>
          <T dim>Route status: {s.lastLevel}{s.lastReason ? ` · ${s.lastReason}` : ''}</T>
          <T dim>{pending ? 'Check-in due now' : `Next check-in in ${Math.max(0, Math.floor(secs / 60))} min`} · missed {s.missed}/{s.maxMissed}</T>
        </Card>
        {pending && <Notice kind="warn">Confirm you are OK within 2 minutes or your companions are alerted.</Notice>}
        <Btn label="I am OK" color={C.ok} onPress={() => void confirmCompanionOk()} />
        <Btn label="I have arrived" color={C.teal} onPress={() => void stopCompanion(true)} />
        <Btn outline color={C.textDim} label="Stop without telling anyone" onPress={() => void stopCompanion(false)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <H>Where are you walking?</H>
      <Field label="Destination (street, suburb or place)" value={q} onChangeText={setQ} returnKeyType="search" onSubmitEditing={() => void search()} />
      <Btn label="Search" busy={busy} onPress={() => void search()} />
      {msg ? <Notice kind="warn">{msg}</Notice> : null}
      {results.map((p) => <Chip key={p.name} label={p.name.slice(0, 60)} active={dest?.name === p.name} onPress={() => setDest(p)} />)}
      <H>Who follows along?</H>
      {contacts.data.length === 0 ? <Empty title="No contacts" body="Add emergency contacts first." /> : (
        <Row wrap>{contacts.data.map((c) => <Chip key={c.id} label={c.name} active={picked.includes(c.id)} onPress={() => setPicked(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id])} />)}</Row>
      )}
      {info ? <T dim small>{info}</T> : null}
      <Btn label="Start companion walk" color={C.teal} disabled={!dest || picked.length === 0} busy={busy} onPress={() => void start()} />
      <T dim small>Companions get a text when you start and when you arrive. Missing check-ins or leaving the route triggers an alert to them and an SOS to your contacts. Check-in timing comes from your active safety profile.</T>
    </Screen>
  );
}
