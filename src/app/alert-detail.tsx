import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { CallRow } from '../components/CallRow';
import { Btn, Card, H, Notice, Row, SEV_COLOR, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { formatDistance } from '../lib/geo';
import { TRUST_LABEL, timeAgo, trustLevel, typeInfo } from '../services/alertsLogic';
import { feed, useFeed } from '../services/alertsStore';
import { Profile, getMyProfile, useSession } from '../services/auth';
import { moderate, setConfirmation } from '../services/cloud';

export default function AlertDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const f = useFeed();
  const { session } = useSession();
  const a = f.alerts.find((x) => x.id === id);
  const [me, setMe] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void getMyProfile().then(setMe).catch(() => setMe(null)); }, [session?.user.id]);

  if (!a) return <Screen><Notice kind="info">This alert is no longer available. It may have been resolved or removed.</Notice></Screen>;
  const info = typeInfo(a.type);
  const trust = trustLevel(a);

  const confirm = async () => {
    setBusy(true);
    const next = !a.confirmed_by_me;
    try { await setConfirmation(a.id, next); feed.setConfirmedLocal(a.id, next); }
    catch (e) { Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.'); }
    setBusy(false);
  };
  const mod = async (o: { status?: string; verified?: boolean }) => {
    setBusy(true);
    try { await moderate(a.id, o); await feed.refresh(); } catch (e) { Alert.alert('Failed', e instanceof Error ? e.message : 'Try again.'); }
    setBusy(false);
  };

  return (
    <Screen>
      <Card accent={SEV_COLOR[a.severity]}>
        <H>{info.label}</H>
        <T>{a.description}</T>
        <T dim small>{a.severity.toUpperCase()} · {timeAgo(a.created_at)} · {a.distance_km != null ? `${formatDistance(a.distance_km * 1000)} away` : 'distance unknown'} · {a.status}</T>
        <T small color={trust === 'verified' ? C.ok : C.textDim}>{TRUST_LABEL[trust]}{a.confirmations ? ` · ${a.confirmations} confirmation(s)` : ''}</T>
      </Card>
      {trust === 'unverified' && <Notice kind="warn">Nobody has checked this report. Do not rely on it, and do not go towards it. If it is near you and you are unsafe, call for help.</Notice>}
      <T dim small>Location is approximate (rounded to about 110 m) to protect the person who reported it.</T>
      <CallRow />
      <Btn outline label="Open approximate area in Maps" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${a.latitude},${a.longitude}`)} />
      {session && a.status !== 'resolved' && (
        <Btn busy={busy} outline={!a.confirmed_by_me} label={a.confirmed_by_me ? 'You confirmed this (tap to undo)' : 'I can confirm this is happening'} onPress={() => void confirm()} />
      )}
      {!session && <T dim small>Sign in to confirm reports.</T>}
      <T dim small>Only confirm if you have seen it yourself. You cannot confirm your own report.</T>
      {me?.role === 'moderator' && (
        <Card>
          <T bold>Moderator</T>
          <Row wrap>
            <Btn small busy={busy} color={C.ok} label={a.verified ? 'Remove verification' : 'Mark verified'} onPress={() => void mod({ verified: !a.verified })} />
            <Btn small busy={busy} outline label="Investigating" onPress={() => void mod({ status: 'investigating' })} />
            <Btn small busy={busy} outline label="Resolved" onPress={() => void mod({ status: 'resolved' })} />
            <Btn small busy={busy} outline color={C.crimson} label="Dismiss as false" onPress={() => void mod({ status: 'dismissed' })} />
          </Row>
        </Card>
      )}
    </Screen>
  );
}
