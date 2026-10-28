import { useRouter } from 'expo-router';
import React from 'react';
import { Btn, Card, Notice, T } from './ui';
import { FeedState } from '../services/alertsStore';

/** Explains why the list is empty or stale: never lets "no data" look like "all clear". */
export function FeedNotice({ f, onRetry }: { f: FeedState; onRetry: () => void }) {
  const router = useRouter();
  if (f.status === 'unconfigured') {
    return <Card><T bold>Community alerts are not connected</T><T dim small>This build has no PulseNet backend settings. SOS, first aid and your other safety tools still work. See docs/SUPABASE.md to connect it.</T></Card>;
  }
  if (f.status === 'signedout') {
    return <Card><T bold>Sign in to see alerts near you</T><T dim small>Community reports are only shared with signed-in users. SOS works without an account.</T><Btn label="Sign in or create account" onPress={() => router.push('/auth')} /></Card>;
  }
  if (f.status === 'nolocation') return <Notice kind="warn">{f.message} <T small color="#F59E0B" bold>Tap Refresh after turning it on.</T></Notice>;
  if (f.status === 'offline' || f.status === 'error') return <Notice kind="warn">{f.message}</Notice>;
  if (f.status === 'loading') return <T dim small>Loading alerts…</T>;
  return f.message ? <Notice kind="info">{f.message}</Notice> : null;
}
