import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { C, R } from '../constants/theme';
import { getPosition } from '../lib/location';
import { cloudConfigured } from '../lib/supabase';
import { Btn, Card, H, Notice, Row, T } from './ui';
import { Profile, getMyProfile, signOut, useSession } from '../services/auth';
import { disablePush, enablePush, getPushRadius, getStoredPushToken } from '../services/cloud';
import { feed } from '../services/alertsStore';

const LINKS: { label: string; icon: string; href: Href }[] = [
  { label: 'Emergency contacts', icon: 'people', href: '/contacts' },
  { label: 'Settings, lock and medical', icon: 'settings', href: '/profile' },
  { label: 'My reports', icon: 'document-text', href: '/my-reports' },
  { label: 'Backend connection check', icon: 'pulse', href: '/cloud-status' },
  { label: 'Safety profiles', icon: 'options', href: '/profiles' },
  { label: 'Safe points', icon: 'trophy', href: '/safe-points' },
  { label: 'Audit log', icon: 'list', href: '/audit' },
];

export function ProfileTab() {
  const router = useRouter();
  const { session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [push, setPush] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    void getMyProfile().then(setProfile).catch(() => setProfile(null));
    void getStoredPushToken().then((t) => setPush(!!t));
  }, [session?.user.id]);

  const togglePush = async (on: boolean) => {
    setMsg('');
    if (!on) { await disablePush(); setPush(false); return; }
    const p = await getPosition();
    if (!p) { setMsg('Turn on location first so we know which alerts are near you.'); return; }
    const r = await enablePush(p, await getPushRadius());
    setPush(r.ok);
    setMsg(r.ok ? 'Background alerts are on for serious reports near you.' : r.reason ?? 'Could not turn on alerts.');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}>
      <H>Profile</H>
      <Card>
        <Row>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.brandDeep, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{(profile?.display_name || session?.user.email || 'P').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <T bold>{session ? profile?.display_name || 'PulseNet member' : 'Not signed in'}</T>
            <T dim small>{session ? session.user.email : cloudConfigured ? 'SOS and local tools work without an account.' : 'Community features are not connected in this build.'}</T>
            {profile?.role === 'moderator' && <T small color={C.brand}>Moderator</T>}
          </View>
        </Row>
        {session ? (
          <Btn outline color={C.textDim} label="Sign out" onPress={() => Alert.alert('Sign out?', 'SOS and your safety tools keep working. You will stop receiving community alerts.', [{ text: 'Cancel' }, { text: 'Sign out', onPress: () => void signOut().then(() => void feed.refresh()) }])} />
        ) : cloudConfigured ? (
          <Btn label="Sign in or create account" onPress={() => router.push('/auth')} />
        ) : null}
      </Card>

      {session && (
        <Card>
          <Row><View style={{ flex: 1 }}><T bold>Background alerts</T><T dim small>Push notification for high and critical reports within your radius. Your location is stored rounded to about 1 km.</T></View><Switch value={push} onValueChange={(v) => void togglePush(v)} trackColor={{ true: C.brand }} /></Row>
          {msg ? <Notice kind="info">{msg}</Notice> : null}
        </Card>
      )}

      {LINKS.map((l) => (
        <Pressable key={l.label} onPress={() => router.push(l.href)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: R.md, padding: 14, borderWidth: 1, borderColor: C.border }}>
          <Ionicons name={l.icon as never} size={20} color={C.brand} />
          <Text style={{ color: C.text, flex: 1 }}>{l.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={C.textDim} />
        </Pressable>
      ))}
      <T dim small>PulseNet supports your safety but is not an emergency service. In danger, call 10111, 10177 or 112.</T>
    </ScrollView>
  );
}
