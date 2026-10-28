import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Card, H, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { EMERGENCY_NUMBERS } from '../constants/helplines';
import { award } from '../services/safePoints';
import { safetyState, useSafetyState } from '../services/safetyState';
import { SosResult, cancelEmergency, delivered, dialEmergencyNumber, dispatchSos } from '../services/sos';
import { getSettings, updateSettings } from '../services/settings';

type Phase = 'countdown' | 'sending' | 'done';

export default function Sos() {
  const router = useRouter();
  const state = useSafetyState();
  const [phase, setPhase] = useState<Phase>(state.isEmergencyActive ? 'done' : 'countdown');
  const [left, setLeft] = useState(5);
  const [drill, setDrill] = useState(false);
  const [res, setRes] = useState<SosResult | null>(null);
  const fired = useRef(false);

  useEffect(() => { void getSettings().then((s) => { setLeft(s.sosCountdownSeconds); setDrill(s.drillMode); }); }, []);

  const fire = async () => {
    if (fired.current) return;
    fired.current = true;
    setPhase('sending');
    safetyState.setRed(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const r = await dispatchSos({ emergencyType: 'manual SOS' });
    setRes(r);
    if (r.simulated) { safetyState.setGreen(); void award('drill_done'); }
    setPhase('done');
  };

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (left <= 0) { void fire(); return; }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    void Haptics.selectionAsync();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, phase]);

  const safe = async () => {
    await cancelEmergency();
    safetyState.setGreen();
    router.replace('/');
  };

  if (phase === 'countdown') {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {drill && <Notice kind="info">Drill mode is ON. Nothing will be sent to anyone.</Notice>}
          <Text style={{ color: C.crimson, fontSize: 96, fontWeight: '900' }}>{left}</Text>
          <T dim>Sending alert to your emergency contacts</T>
          <Btn label="Cancel" outline color={C.text} onPress={() => router.back()} />
          <Btn label="Send now" color={C.crimson} onPress={() => void fire()} />
        </View>
      </Screen>
    );
  }
  if (phase === 'sending') return <Screen scroll={false}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><H>Sending…</H></View></Screen>;

  return (
    <Screen>
      {res && <Result r={res} />}
      {!res && <Notice kind="warn">Emergency is active. Your contacts were alerted earlier.</Notice>}
      <Card>
        <T bold>Call for help now</T>
        <Row gap={8}>
          <View style={{ flex: 1 }}><Btn label="Police 10111" color={C.crimson} onPress={() => void dialEmergencyNumber(EMERGENCY_NUMBERS.police)} /></View>
          <View style={{ flex: 1 }}><Btn label="Ambulance" color={C.crimson} onPress={() => void dialEmergencyNumber(EMERGENCY_NUMBERS.ambulance)} /></View>
        </Row>
        <Btn outline color={C.crimson} label="Any mobile: 112" onPress={() => void dialEmergencyNumber(EMERGENCY_NUMBERS.general)} />
        <Btn outline color={C.crimson} label="GBV Command Centre" onPress={() => void dialEmergencyNumber(EMERGENCY_NUMBERS.gbvCommandCentre)} />
      </Card>
      <Btn label="I am safe" color={C.ok} onPress={() => void safe()} />
      {drill && <Btn outline color={C.textDim} label="Turn drill mode off" onPress={async () => { await updateSettings({ drillMode: false }); setDrill(false); }} />}
    </Screen>
  );
}

function Result({ r }: { r: SosResult }) {
  if (r.simulated) return <Notice kind="info">Drill complete: the full flow ran, nothing was sent. {r.locationIncluded ? 'Your location was available.' : 'Location was not available.'}</Notice>;
  if (r.noContacts) return <Notice kind="error">No alert was sent: you have no emergency contacts. Call 10111 or 112 now, then add contacts.</Notice>;
  if (delivered(r)) {
    return <Notice kind="ok">Alert handed to the network for {r.smsSent} of {r.contactsTotal} contacts{r.locationIncluded ? ' with your location' : ' (no location was available)'}. Delivery to their phones is not confirmed. Updates repeat until you press "I am safe".</Notice>;
  }
  if (r.usedManualComposer) return <Notice kind="warn">PulseNet could not send automatically here, so your messaging app opened with the alert filled in. The alert is NOT sent until you press send there.</Notice>;
  return <Notice kind="error">The alert could not be sent. Check SMS permission and signal, and call 10111 or 112 now.</Notice>;
}
