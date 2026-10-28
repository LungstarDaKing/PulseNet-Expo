import React from 'react';
import { Alert } from 'react-native';
import { Btn, Card, Empty, H, Notice, Row, SEV_COLOR, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { useAsync } from '../hooks/useAsync';
import { Severity, TRUST_LABEL, timeAgo, trustLevel, typeInfo } from '../services/alertsLogic';
import { useSession } from '../services/auth';
import { MyReport, deleteMyReport, discardOutboxItem, flushOutbox, getMyReports, getOutbox, markMyReportResolved } from '../services/cloud';
import { deleteReport, getReports } from '../services/incidents';
import { cloudConfigured } from '../lib/supabase';

export default function MyReports() {
  const { session } = useSession();
  const cloud = useAsync<MyReport[]>(async () => (session ? getMyReports() : []), []);
  const outbox = useAsync(getOutbox, []);
  const local = useAsync(getReports, []);
  const reload = async () => { await cloud.reload(); await outbox.reload(); await local.reload(); };

  return (
    <Screen>
      {!cloudConfigured && <Notice kind="info">Community sharing is not connected in this build. Only reports saved on this phone are listed.</Notice>}
      {cloudConfigured && !session && <Notice kind="info">Sign in to see reports you sent to PulseNet.</Notice>}
      {cloud.error && <Notice kind="warn">{cloud.error}</Notice>}

      {outbox.data.length > 0 && (
        <>
          <H>Waiting to send</H>
          <Notice kind="warn">These reports are saved on your phone and have NOT been sent.</Notice>
          {outbox.data.map((o) => (
            <Card key={o.id} accent={C.amber}>
              <T>{o.input.description}</T>
              <T dim small>{typeInfo(o.input.type).label} · {o.input.severity} · {timeAgo(o.createdAt)}{o.failed ? ` · ${o.failed}` : ''}</T>
              <Row><Btn small label="Retry now" onPress={async () => { const n = await flushOutbox(); Alert.alert(n ? 'Sent' : 'Still waiting', n ? `${n} report(s) sent.` : 'No connection or sign-in needed.'); await reload(); }} /><Btn small outline color={C.crimson} label="Discard" onPress={() => void discardOutboxItem(o.id).then(reload)} /></Row>
            </Card>
          ))}
        </>
      )}

      <H>Sent to PulseNet</H>
      {session && cloud.data.length === 0 && !cloud.loading && <Empty title="Nothing sent yet" body="Reports you send appear here with their status." />}
      {cloud.data.map((r) => (
        <Card key={r.id} accent={SEV_COLOR[r.severity as Severity] ?? C.border}>
          <T bold>{typeInfo(r.type).label} · {r.status}</T>
          <T>{r.description}</T>
          <T dim small>{r.severity} · {timeAgo(r.created_at)} · {TRUST_LABEL[trustLevel({ verified: r.verified, confirmations: 0 })]} · {r.evidence} photo(s)</T>
          <Row wrap>
            {r.status !== 'resolved' && r.status !== 'dismissed' && <Btn small outline color={C.ok} label="Mark resolved" onPress={() => void markMyReportResolved(r.id).then(reload).catch((e) => Alert.alert('Failed', e.message))} />}
            <Btn small outline color={C.crimson} label="Delete" onPress={() => Alert.alert('Delete this report?', 'It disappears for everyone, including its photos.', [{ text: 'Keep' }, { text: 'Delete', style: 'destructive', onPress: () => void deleteMyReport(r.id).then(reload).catch((e) => Alert.alert('Failed', e.message)) }])} />
          </Row>
        </Card>
      ))}

      <H>Saved on this phone only</H>
      {local.data.length === 0 ? <Empty title="Nothing saved locally" body="Reports saved without sharing appear here." /> : local.data.map((r) => (
        <Card key={r.id}>
          <T>{r.description}</T>
          <T dim small>{r.type} · {r.severity} · {r.status} · {timeAgo(r.reportedAt)}</T>
          <Btn small outline color={C.crimson} label="Delete" onPress={() => void deleteReport(r.id).then(reload)} />
        </Card>
      ))}
    </Screen>
  );
}
