import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React from 'react';
import { Alert } from 'react-native';
import { Btn, Card, Empty, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { useAsync } from '../hooks/useAsync';
import { AuditEntry, auditStats, clearAuditLog, exportAuditText, getEntries } from '../services/audit';

const COLOR = { info: C.sky, warning: C.amber, error: C.crimson, critical: C.crimson } as const;

export default function Audit() {
  const list = useAsync(getEntries, [] as AuditEntry[]);
  const stats = useAsync(auditStats, null as Awaited<ReturnType<typeof auditStats>> | null);

  const share = async () => {
    try {
      const file = new File(Paths.cache, 'pulsenet-audit.txt');
      if (file.exists) file.delete();
      file.create();
      file.write(await exportAuditText());
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/plain' });
      else Alert.alert('Sharing unavailable', 'This device cannot share files.');
    } catch { Alert.alert('Export failed', 'Could not write the log file.'); }
  };

  return (
    <Screen>
      <Notice kind="info">Counts and events only. Phone numbers and coordinates are never stored here. Entries are hash-chained so tampering is detectable.</Notice>
      {stats.data && <T dim small>{stats.data.total} entries · chain {stats.data.integrity.ok ? 'intact' : `BROKEN at entry ${stats.data.integrity.brokenAt}`}</T>}
      <Row><Btn small outline label="Export" onPress={() => void share()} /><Btn small outline color={C.crimson} label="Clear" onPress={() => void clearAuditLog().then(() => { void list.reload(); void stats.reload(); })} /></Row>
      {list.data.length === 0 ? <Empty title="Nothing logged" body="Emergency and safety events appear here." /> : [...list.data].reverse().slice(0, 100).map((e) => (
        <Card key={e.id} accent={COLOR[e.level]}><T bold>{e.event}</T><T dim small>{e.description}{e.data ? ` · ${JSON.stringify(e.data)}` : ''}</T><T dim small>{new Date(e.ts).toLocaleString()}</T></Card>
      ))}
    </Screen>
  );
}
