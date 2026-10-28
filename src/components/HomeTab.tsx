import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { C, R } from '../constants/theme';
import { dialEmergencyNumber, dispatchSos } from '../services/sos';
import { useSafetyState, safetyState } from '../services/safetyState';
import { StealthTap } from '../services/stealthTap';
import { getUserName } from '../services/settings';
import { getMyProfile } from '../services/auth';
import { useAsync } from '../hooks/useAsync';
import { getContacts } from '../services/contacts';
import { useFeed } from '../services/alertsStore';
import { activeOnly } from '../services/alertsLogic';
import { AlertCard } from './AlertCard';
import { FeedNotice } from './FeedNotice';
import { Btn, Card, Notice, T } from './ui';
import * as Clipboard from 'expo-clipboard';
import { CrashRecord, clearLastCrash, crashText, getLastCrash } from '../lib/crashLog';

const greeting = (h = new Date().getHours()) => (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');

const QUICK: { label: string; sub: string; icon: string; color: string; href: Href }[] = [
  { label: 'Report Emergency', sub: 'Tell people nearby', icon: 'warning', color: '#EF4444', href: '/report-emergency' },
  { label: 'AI Assistant', sub: 'Ask Pulse', icon: 'sparkles', color: '#3B82F6', href: '/assistant' },
  { label: 'My Reports', sub: 'Status and history', icon: 'document-text', color: '#10B981', href: '/my-reports' },
  { label: 'Settings', sub: 'Lock, medical, SOS', icon: 'settings', color: '#8B5CF6', href: '/profile' },
];

const TOOLS: { label: string; icon: string; href: Href }[] = [
  { label: 'Danger around me', icon: 'thunderstorm', href: '/danger' },
  { label: 'Walk With Me', icon: 'walk', href: '/walk' },
  { label: 'Companion walk', icon: 'people', href: '/companion' },
  { label: 'Taxi safety', icon: 'car', href: '/taxi' },
  { label: 'Safe places', icon: 'location', href: '/safe-places' },
  { label: 'Check on someone', icon: 'chatbubbles', href: '/check-on' },
  { label: 'Fake call', icon: 'call', href: '/fake-call' },
  { label: 'Vitals', icon: 'heart', href: '/vitals' },
  { label: 'First aid', icon: 'medkit', href: '/first-aid' },
  { label: 'Safety tips', icon: 'bulb', href: '/safety-tips' },
  { label: 'Helplines', icon: 'headset', href: '/helplines' },
  { label: 'Safe points', icon: 'trophy', href: '/safe-points' },
];

export function HomeTab({ goAlerts, goProfile }: { goAlerts: () => void; goProfile: () => void }) {
  const router = useRouter();
  const s = useSafetyState();
  const feed = useFeed();
  const contacts = useAsync(getContacts, []);
  const [name, setName] = useState('');
  const [crash, setCrash] = useState<CrashRecord | null>(null);
  useEffect(() => { void getLastCrash().then(setCrash); }, []);
  const stealth = useRef(new StealthTap()).current;

  useEffect(() => {
    void (async () => {
      const p = await getMyProfile().catch(() => null);
      setName(p?.display_name || (await getUserName()));
    })();
  }, []);

  const logoTap = async () => {
    if (stealth.registerTap()) {
      safetyState.setRed(true);
      await dispatchSos({ emergencyType: 'stealth SOS', silent: true });
      router.push('/stealth');
    }
  };

  const recent = feed.alerts.filter(activeOnly).slice(0, 3);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={logoTap} accessibilityLabel="PulseNet logo" style={{ flex: 1 }}>
          <Text style={{ color: C.textDim, fontSize: 13 }}>{greeting()},</Text>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '800' }}>{name || 'there'}</Text>
        </Pressable>
        <Pressable onPress={goProfile} accessibilityLabel="Profile" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.brandDeep, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>{(name || 'P').slice(0, 1).toUpperCase()}</Text>
        </Pressable>
      </View>

      {crash && (
        <Card accent={C.amber}>
          <T bold color={C.amber}>PulseNet closed unexpectedly last time</T>
          <T small dim>{crash.message}</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn small outline label="Copy details" onPress={() => void Clipboard.setStringAsync(crashText(crash))} />
            <Btn small outline color={C.textDim} label="Dismiss" onPress={() => void clearLastCrash().then(() => setCrash(null))} />
          </View>
        </Card>
      )}

      {s.isEmergencyActive && (
        <Card accent={C.crimson}>
          <T bold color={C.crimson}>Emergency active</T>
          <T small dim>Contacts have been alerted. Press "I am safe" to stop updates and tell them.</T>
          <Btn label="I am safe" color={C.ok} onPress={() => router.push('/sos')} />
        </Card>
      )}

      <Pressable onPress={() => router.push('/report-emergency')} accessibilityRole="button" style={{ backgroundColor: C.brandDeep, borderRadius: R.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="shield-checkmark" size={26} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Stay Safe</Text>
          <Text style={{ color: '#D1FAE5', fontSize: 13 }}>Report. Get Help. Make an Impact.</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#fff" />
      </Pressable>

      {contacts.data.length === 0 && !contacts.loading && (
        <Notice kind="warn">You have no emergency contacts, so SOS cannot alert anyone yet. <T small bold color={C.amber} >Add one in Settings, Contacts.</T></Notice>
      )}

      <Pressable accessibilityRole="button" accessibilityLabel="Emergency SOS" onPress={() => router.push('/sos')} style={{ backgroundColor: C.crimson, borderRadius: 22, paddingVertical: 26, alignItems: 'center', gap: 2 }}>
        <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900' }}>SOS</Text>
        <Text style={{ color: '#fff', opacity: 0.9, fontSize: 13 }}>Texts your contacts your location</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Btn outline color={C.crimson} label="Police 10111" onPress={() => void dialEmergencyNumber('10111')} /></View>
        <View style={{ flex: 1 }}><Btn outline color={C.crimson} label="Ambulance 10177" onPress={() => void dialEmergencyNumber('10177')} /></View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {QUICK.map((q) => (
          <Pressable key={q.label} onPress={() => router.push(q.href)} accessibilityRole="button" style={{ width: '48%', backgroundColor: C.surface, borderRadius: R.md, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.border }}>
            <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: q.color, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={q.icon as never} size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>{q.label}</Text>
              <Text style={{ color: C.textDim, fontSize: 11 }}>{q.sub}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>Recent activity near you</Text>
        <Pressable onPress={goAlerts}><Text style={{ color: C.brand, fontSize: 13 }}>See all</Text></Pressable>
      </View>
      <FeedNotice f={feed} onRetry={() => void import('../services/alertsStore').then((m) => m.feed.refresh())} />
      {recent.map((a) => <AlertCard key={a.id} a={a} onPress={() => router.push({ pathname: '/alert-detail', params: { id: a.id } })} />)}
      {feed.status === 'ok' && recent.length === 0 && <Card><T bold>No active reports within {feed.radiusKm} km</T><T dim small>That only means nobody nearby has reported anything on PulseNet. It does not mean it is safe. Trust your instincts.</T></Card>}

      <Text style={{ color: C.text, fontSize: 17, fontWeight: '800', marginTop: 4 }}>Safety tools</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {TOOLS.map((t) => (
          <Pressable key={t.label} onPress={() => router.push(t.href)} accessibilityRole="button" style={{ width: '31%', backgroundColor: C.surface, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.border }}>
            <Ionicons name={t.icon as never} size={22} color={C.brand} />
            <Text style={{ color: C.text, fontSize: 11, textAlign: 'center' }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
