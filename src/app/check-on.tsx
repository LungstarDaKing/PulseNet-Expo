import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Btn, Card, Chip, Empty, Field, H, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { useAsync } from '../hooks/useAsync';
import { OVERDUE_MINUTES, getRequests, isOverdue } from '../services/checkIn';
import { award } from '../services/safePoints';
import { RELATIONSHIPS, Relationship, WatchedContact, addWatched, checkOn, escalateWatched, getWatched, recordWatchedResponse, removeWatched } from '../services/watchContacts';

export default function CheckOn() {
  const list = useAsync(getWatched, [] as WatchedContact[]);
  const reqs = useAsync(getRequests, []);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rel, setRel] = useState<Relationship>('friend');
  const [err, setErr] = useState('');

  const reload = async () => { await list.reload(); await reqs.reload(); };
  const add = async () => { try { await addWatched(name, phone, rel); setName(''); setPhone(''); setErr(''); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } };

  return (
    <Screen>
      <Notice kind="info">Sends a text asking "Are you safe?". They reply SAFE, LATE or HELP in the normal messaging app. PulseNet never reads your SMS, so record their answer here. If the phone cannot send silently, your messaging app opens: press send there.</Notice>
      {list.data.length === 0 && <Empty title="Nobody yet" body="Add someone you want to check on." />}
      {list.data.map((c) => {
        const req = reqs.data.find((r) => r.id === c.lastRequestId);
        const overdue = req ? isOverdue(req) : false;
        return (
          <Card key={c.id} accent={c.lastResponse === 'needHelp' ? C.crimson : overdue ? C.amber : C.teal}>
            <T bold>{c.name} <T dim small>({c.relationship})</T></T>
            <T dim small>{c.lastCheckTime ? `Asked ${new Date(c.lastCheckTime).toLocaleString()} · ${c.lastResponse ?? (overdue ? `no answer after ${OVERDUE_MINUTES} min` : 'waiting')}` : 'Not checked yet'}</T>
            <Row wrap>
              <Btn small label="Check on them" onPress={async () => { const ok = await checkOn(c); if (ok) void award('check_sent'); else Alert.alert('Not sent', 'The text could not be started. Check SMS availability.'); await reload(); }} />
              {c.lastRequestId && !c.lastResponse && (['safe', 'delayed', 'needHelp'] as const).map((r) => <Btn key={r} small outline color={r === 'safe' ? C.ok : r === 'delayed' ? C.amber : C.crimson} label={r === 'needHelp' ? 'Needs help' : r === 'safe' ? 'Safe' : 'Late'} onPress={async () => { await recordWatchedResponse(c, r); await reload(); }} />)}
              {overdue && <Btn small color={C.crimson} label="No reply: alert my contacts" onPress={async () => { const n = await escalateWatched(c); Alert.alert(n > 0 ? 'Contacts alerted' : 'Not sent', n > 0 ? `Message handed to ${n} contact(s).` : 'No message could be sent.'); }} />}
              <Btn small outline color={C.textDim} label="Remove" onPress={() => void removeWatched(c.id).then(reload)} />
            </Row>
          </Card>
        );
      })}
      <Card>
        <H>Add someone</H>
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Row wrap>{RELATIONSHIPS.map((r) => <Chip key={r} label={r} active={rel === r} onPress={() => setRel(r)} />)}</Row>
        {err ? <Notice kind="error">{err}</Notice> : null}
        <Btn label="Save" onPress={() => void add()} />
      </Card>
    </Screen>
  );
}
