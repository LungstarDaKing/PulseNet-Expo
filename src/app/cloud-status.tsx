import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useState } from 'react';
import { Btn, Card, H, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { Check, runChecks, testAi } from '../services/cloudStatus';

const ICON = { ok: '✅', fail: '❌', warn: '⚠️', skip: '➖' } as const;
const COLOR = { ok: C.ok, fail: C.crimson, warn: C.amber, skip: C.textDim } as const;

export default function CloudStatus() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<Check | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async () => { setBusy(true); setAi(null); setChecks([]); await runChecks(setChecks); setBusy(false); };
  useEffect(() => { void run(); }, []);

  const report = [...checks, ...(ai ? [ai] : [])].map((c) => `${c.state.toUpperCase()}  ${c.label}: ${c.detail}`).join('\n');

  return (
    <Screen>
      <H>Backend connection</H>
      <T dim small>Checks that this app can really talk to your Supabase project. Nothing here changes any data.</T>
      <Btn label={busy ? 'Checking…' : 'Run checks again'} busy={busy} onPress={() => void run()} />
      {[...checks, ...(ai ? [ai] : [])].map((c) => (
        <Card key={c.id} accent={COLOR[c.state]}>
          <T bold>{ICON[c.state]} {c.label}</T>
          <T dim small>{c.detail}</T>
          {c.fix ? <T small color={C.amber}>Fix: {c.fix}</T> : null}
        </Card>
      ))}
      {checks.some((c) => c.id === 'ai' && c.state === 'ok') && <Btn outline label="Test AI (uses 1 request)" onPress={async () => setAi(await testAi())} />}
      {checks.length > 0 && <Btn small outline color={C.textDim} label={copied ? 'Copied' : 'Copy results'} onPress={async () => { await Clipboard.setStringAsync(report); setCopied(true); }} />}
      <Card>
        <T bold>Where to look in the Supabase dashboard</T>
        <T small dim>• Authentication → Users: your sign-ups appear here.</T>
        <T small dim>• Table Editor → incident_reports and public_alerts: reports you send appear here (public_alerts holds the rounded public copy).</T>
        <T small dim>• Storage → evidence: uploaded photos, in one folder per user.</T>
        <T small dim>• Edge Functions → pulse-ai → Logs: every AI call and any error.</T>
        <T small dim>• Database → Replication / Realtime Inspector: live events.</T>
      </Card>
      <Notice kind="info">A green list means connected. Send a test report from Report Emergency, then look in Table Editor → incident_reports. If the row is there, everything works end to end.</Notice>
    </Screen>
  );
}
