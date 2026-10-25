import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Btn, Card, Chip, Field, H, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { ensureNotificationPermission } from '../lib/notify';
import { DEFAULT, ExitStrategy, FakeCallConfig, STRATEGIES, cancelScheduled, execute, getConfig, getHistory, getScheduled, saveConfig, schedule } from '../services/fakeCall';

export default function FakeCall() {
  const router = useRouter();
  const [c, setC] = useState<FakeCallConfig>(DEFAULT);
  const [msg, setMsg] = useState('');
  const [at, setAt] = useState<number | null>(null);
  const [hist, setHist] = useState<{ at: string; strategy: ExitStrategy }[]>([]);

  const load = async () => { setC(await getConfig()); setAt((await getScheduled())?.at ?? null); setHist(await getHistory()); };
  useEffect(() => { void load(); }, []);

  const canSchedule = c.strategy === 'fakeCall' || c.strategy === 'fakeText';
  const num = (v: string, f: (n: number) => Partial<FakeCallConfig>) => setC({ ...c, ...f(parseInt(v, 10) || 0) });

  const run = async () => {
    try { await saveConfig(c); } catch (e) { setMsg(e instanceof Error ? e.message : 'Check settings'); return; }
    const r = await execute(c);
    if (r === 'call') router.push('/fake-call-live');
    else setMsg('Done.');
    await load();
  };
  const sched = async () => {
    try {
      await saveConfig(c);
      await ensureNotificationPermission();
      setAt(await schedule(c));
      setMsg(`Scheduled. Your phone will notify you in ${c.delaySeconds}s.`);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <Screen>
      <H>Leave a situation</H>
      <Row wrap>{STRATEGIES.map((s) => <Chip key={s.id} label={s.label} active={c.strategy === s.id} color={C.violet} onPress={() => setC({ ...c, strategy: s.id })} />)}</Row>
      <T dim small>{STRATEGIES.find((s) => s.id === c.strategy)?.description}</T>
      {(c.strategy === 'fakeCall' || c.strategy === 'fakeText') && (
        <Card>
          <Field label="Caller name" value={c.callerName} onChangeText={(v) => setC({ ...c, callerName: v })} />
          <Field label="Caller number (shown on screen)" value={c.callerNumber} onChangeText={(v) => setC({ ...c, callerNumber: v })} keyboardType="phone-pad" />
          {c.strategy === 'fakeText' && <Field label="Message" value={c.textMessage} onChangeText={(v) => setC({ ...c, textMessage: v })} multiline />}
          <Field label="Delay before it starts (seconds)" value={String(c.delaySeconds)} onChangeText={(v) => num(v, (n) => ({ delaySeconds: n }))} keyboardType="number-pad" />
          {c.strategy === 'fakeCall' && <Field label="Call length (seconds)" value={String(c.durationSeconds)} onChangeText={(v) => num(v, (n) => ({ durationSeconds: n }))} keyboardType="number-pad" />}
        </Card>
      )}
      {msg ? <Notice kind="info">{msg}</Notice> : null}
      <Btn label="Run now" color={C.violet} onPress={() => void run()} />
      {canSchedule && <Btn outline color={C.violet} label={`Run in ${c.delaySeconds}s (works in background)`} onPress={() => void sched()} />}
      {at && at > Date.now() && <Btn outline color={C.amber} label="Cancel scheduled" onPress={() => void cancelScheduled().then(load)} />}
      {c.strategy === 'silentSos' && <Notice kind="warn">This sends a real SOS to your contacts. Turn on drill mode in Settings to test safely.</Notice>}
      {hist.length > 0 && <T dim small>Last used: {new Date(hist[0].at).toLocaleString()}</T>}
    </Screen>
  );
}
