import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Btn, Card, Chip, Field, Notice, Row, SEV_COLOR, Screen, T } from '../components/ui';
import { getPosition } from '../lib/location';
import { useAsync } from '../hooks/useAsync';
import { Classification, IncidentReport, classifyIncident, deleteReport, getReports, submitReport, summarize, updateStatus, validateReport } from '../services/incidents';
import { award } from '../services/safePoints';

export default function Report() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState<IncidentReport | null>(null);
  const list = useAsync(getReports, [] as IncidentReport[]);
  const cls: Classification | null = text.trim().length >= 10 ? classifyIncident(text) : null;

  const send = async (force = false) => {
    const err = validateReport(text);
    if (err) { Alert.alert('Check your report', err); return; }
    setBusy(true);
    const p = await getPosition();
    if (!p) { setBusy(false); Alert.alert('Location needed', 'Turn on location so the report is placed correctly.'); return; }
    try {
      const r = await submitReport(text, p, undefined, force);
      if (!r.saved && r.duplicate) { setDup(r.duplicate); }
      else { setText(''); setDup(null); void award('report_made'); await list.reload(); Alert.alert('Saved', 'Your report is saved on this phone and shows in Danger around me.'); }
    } catch (e) { Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again'); }
    setBusy(false);
  };

  return (
    <Screen>
      <Notice kind="warn">This saves the report on YOUR phone only. It does not alert police or other PulseNet users. For a crime in progress call 10111.</Notice>
      <Field label="What did you see, and where exactly?" value={text} onChangeText={setText} multiline maxLength={500} />
      {cls && (
        <Card>
          <T small dim>Rule-based suggestion (keywords, not AI)</T>
          <T>Type: {cls.type} · severity: <T color={SEV_COLOR[cls.severity]} bold>{cls.severity}</T></T>
          {cls.matched.length > 0 && <T small dim>Matched: {cls.matched.slice(0, 6).join(', ')}</T>}
        </Card>
      )}
      {dup && (
        <Notice kind="warn">Similar report already saved nearby ({dup.type}, {new Date(dup.reportedAt).toLocaleTimeString()}). Save anyway?</Notice>
      )}
      <Row><Btn label={dup ? 'Save anyway' : 'Save report'} busy={busy} onPress={() => void send(!!dup)} /><Btn outline label="Back" onPress={() => router.back()} /></Row>
      <T bold>Your reports</T>
      <T dim small>{summarize(list.data)}</T>
      {list.data.map((r) => (
        <Card key={r.id} accent={SEV_COLOR[r.severity]}>
          <T>{r.description}</T>
          <T dim small>{r.type} · {r.severity} · {r.status} · {new Date(r.reportedAt).toLocaleString()}{r.duplicateOf ? ' · similar to an earlier report' : ''}</T>
          <Row wrap>
            {r.status !== 'investigating' && r.status !== 'resolved' && <Btn small outline label="Mark investigating" onPress={() => void updateStatus(r.id, 'investigating').then(list.reload)} />}
            {r.status !== 'resolved' && <Btn small outline label="Mark resolved" onPress={() => void updateStatus(r.id, 'resolved').then(list.reload)} />}
            <Btn small outline color="#E11D48" label="Delete" onPress={() => void deleteReport(r.id).then(list.reload)} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
