import { Href, useRouter } from 'expo-router';
import React, { useRef } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Btn, Card, H, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { dispatchSos } from '../services/sos';
import { StealthTap } from '../services/stealthTap';
import { safetyState, useSafetyState } from '../services/safetyState';
import { useAsync } from '../hooks/useAsync';
import { getContacts } from '../services/contacts';

const TILES: { label: string; sub: string; href: Href; color: string }[] = [
  { label: 'Danger around me', sub: 'Live hazards nearby', href: '/danger', color: C.amber },
  { label: 'Walk With Me', sub: 'Timer with auto-alert', href: '/walk', color: C.teal },
  { label: 'Companion walk', sub: 'Route and check-ins', href: '/companion', color: C.teal },
  { label: 'Taxi and ride safety', sub: 'Share and track a ride', href: '/taxi', color: C.violet },
  { label: 'Safe places', sub: 'Help near you', href: '/safe-places', color: C.sky },
  { label: 'Check on someone', sub: 'Ask "are you safe?"', href: '/check-on', color: C.sky },
  { label: 'Fake call and exit', sub: 'Leave a situation', href: '/fake-call', color: C.violet },
  { label: 'Vitals', sub: 'Heart rate', href: '/vitals', color: C.crimson },
  { label: 'First aid', sub: 'Step by step', href: '/first-aid', color: C.ok },
  { label: 'Safety tips', sub: 'Learn and earn points', href: '/safety-tips', color: C.ok },
  { label: 'Helplines', sub: 'Verified SA numbers', href: '/helplines', color: C.crimson },
  { label: 'Safe points', sub: 'Levels and badges', href: '/safe-points', color: C.amber },
];

export default function Dashboard() {
  const router = useRouter();
  const s = useSafetyState();
  const contacts = useAsync(getContacts, []);
  const stealth = useRef(new StealthTap()).current;

  const logoTap = async () => {
    if (stealth.registerTap()) {
      safetyState.setRed(true);
      await dispatchSos({ emergencyType: 'stealth SOS', silent: true });
      router.push('/stealth');
    }
  };

  return (
    <Screen>
      <Row>
        <Pressable onPress={logoTap} accessibilityLabel="PulseNet logo">
          <Image source={require('../../assets/pulsenet_logo.png')} style={{ width: 44, height: 44 }} resizeMode="contain" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <H>PulseNet</H>
          <T dim small>{s.level === 'green' ? 'You are in normal mode' : s.level === 'yellow' ? 'Check-in mode' : 'EMERGENCY ACTIVE'}</T>
        </View>
        <Btn small outline color={C.textDim} label="Settings" onPress={() => router.push('/profile')} />
      </Row>

      {s.isEmergencyActive && (
        <Card accent={C.crimson}>
          <T bold color={C.crimson}>Emergency active</T>
          <T small dim>Contacts have been alerted. Press "I am safe" to stop updates and tell them.</T>
          <Btn label="I am safe" color={C.ok} onPress={() => router.push('/sos')} />
        </Card>
      )}

      {contacts.data.length === 0 && !contacts.loading && (
        <Notice kind="warn">You have no emergency contacts. SOS cannot alert anyone until you add one.</Notice>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Emergency SOS"
        onPress={() => router.push('/sos')}
        style={{ backgroundColor: C.crimson, borderRadius: 24, paddingVertical: 36, alignItems: 'center', gap: 4 }}
      >
        <Text style={{ color: '#fff', fontSize: 40, fontWeight: '900' }}>SOS</Text>
        <Text style={{ color: '#fff', opacity: 0.85 }}>Tap to start a {5}-second countdown</Text>
      </Pressable>

      <Row gap={8}>
        <View style={{ flex: 1 }}><Btn outline label="Call 10111" onPress={() => void import('../services/sos').then((m) => m.dialEmergencyNumber('10111'))} /></View>
        <View style={{ flex: 1 }}><Btn outline label="Call 10177" onPress={() => void import('../services/sos').then((m) => m.dialEmergencyNumber('10177'))} /></View>
      </Row>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {TILES.map((t) => (
          <Pressable key={t.label} onPress={() => router.push(t.href)} accessibilityRole="button" style={{ width: '48%', backgroundColor: C.surface, borderRadius: 14, padding: 14, borderTopWidth: 3, borderTopColor: t.color, gap: 2 }}>
            <Text style={{ color: C.text, fontWeight: '700' }}>{t.label}</Text>
            <Text style={{ color: C.textDim, fontSize: 12 }}>{t.sub}</Text>
          </Pressable>
        ))}
      </View>
      <Row wrap>
        <Btn small outline color={C.textDim} label="Contacts" onPress={() => router.push('/contacts')} />
        <Btn small outline color={C.textDim} label="Safety profiles" onPress={() => router.push('/profiles')} />
        <Btn small outline color={C.textDim} label="Audit log" onPress={() => router.push('/audit')} />
      </Row>
    </Screen>
  );
}
