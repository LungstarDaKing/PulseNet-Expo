import React, { useEffect, useState } from 'react';
import { Btn, Card, Chip, H, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { useNow } from '../hooks/useAsync';
import { ensureNotificationPermission } from '../lib/notify';
import { award } from '../services/safePoints';
import { GRACE_SECONDS, WalkState, confirmWalkSafe, extendWalk, getWalk, onWalk, startWalk } from '../services/walk';

const OPTIONS = [10, 20, 30, 45, 60, 90];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;

export default function Walk() {
  const [w, setW] = useState<WalkState>(getWalk());
  const [mins, setMins] = useState(30);
  const [announce, setAnnounce] = useState(true);
  const [err, setErr] = useState('');
  const now = useNow(1000);
  useEffect(() => onWalk(setW), []);

  const remaining = w.endAt ? Math.round((w.endAt - now) / 1000) : 0;
  const grace = w.graceUntil ? Math.round((w.graceUntil - now) / 1000) : 0;

  if (w.active) {
    const inGrace = w.graceUntil != null;
    return (
      <Screen>
        <Card accent={inGrace ? C.crimson : C.teal}>
          <H>{inGrace ? 'Are you safe?' : 'Walking'}</H>
          <T style={{ fontSize: 48, fontWeight: '800' }} color={inGrace ? C.crimson : C.text}>{inGrace ? `${Math.max(0, grace)}s` : fmt(Math.max(0, remaining))}</T>
          <T dim small>{inGrace ? `Confirm within ${GRACE_SECONDS} seconds or your contacts get an emergency alert.` : 'If the timer ends and you do not confirm, your contacts are alerted automatically.'}</T>
        </Card>
        <Btn label="I am safe" color={C.ok} onPress={async () => { await confirmWalkSafe(); void award('walk_done'); }} />
        <Row><Btn outline label="+10 min" onPress={() => void extendWalk(10)} /><Btn outline label="+30 min" onPress={() => void extendWalk(30)} /></Row>
        <Notice kind="warn">Keep PulseNet open or in the background. If you force-close it, the countdown stops (a notification still reminds you).</Notice>
      </Screen>
    );
  }

  return (
    <Screen>
      <H>How long will you be?</H>
      <Row wrap>{OPTIONS.map((m) => <Chip key={m} label={`${m} min`} active={mins === m} onPress={() => setMins(m)} />)}</Row>
      <Row><Chip label={announce ? 'Text my contacts when I start' : 'Do not text on start'} active={announce} onPress={() => setAnnounce(!announce)} /></Row>
      {err ? <Notice kind="error">{err}</Notice> : null}
      <Btn label="Start Walk With Me" color={C.teal} onPress={async () => { try { await ensureNotificationPermission(); await startWalk(mins, announce); setErr(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start'); } }} />
      <T dim small>When the time is up you have {GRACE_SECONDS} seconds to confirm. Otherwise PulseNet sends an SOS to your emergency contacts with your location.</T>
    </Screen>
  );
}
