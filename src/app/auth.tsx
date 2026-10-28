import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Btn, Field, H, Notice, Screen, T } from '../components/ui';
import { cloudConfigured } from '../lib/supabase';
import { feed } from '../services/alertsStore';
import { requestPasswordReset, signIn, signUp } from '../services/auth';

export default function Auth() {
  const router = useRouter();
  const { mode: m } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'signin' | 'signup'>(m === 'signup' ? 'signup' : 'signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  if (!cloudConfigured) {
    return (
      <Screen>
        <H>Accounts are not connected</H>
        <Notice kind="warn">This build has no PulseNet backend settings, so sign-in is unavailable. SOS, first aid, walks and your other safety tools work without an account. See docs/SUPABASE.md.</Notice>
        <Btn outline label="Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  const submit = async () => {
    setBusy(true); setErr(''); setInfo('');
    try {
      if (mode === 'signup') {
        const r = await signUp(email, password, name);
        if (r.needsConfirmation) { setInfo('Account created. Open the confirmation link we emailed you, then sign in.'); setMode('signin'); setBusy(false); return; }
      } else {
        await signIn(email, password);
      }
      void feed.refresh();
      router.replace('/');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.'); }
    setBusy(false);
  };

  return (
    <Screen>
      <H>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</H>
      <T dim small>An account lets you send and see community reports. SOS never needs one.</T>
      {mode === 'signup' && <Field label="Your name (shown to moderators only)" value={name} onChangeText={setName} maxLength={60} autoCapitalize="words" />}
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Field label={mode === 'signup' ? 'Password (8 or more characters)' : 'Password'} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      {err ? <Notice kind="error">{err}</Notice> : null}
      {info ? <Notice kind="ok">{info}</Notice> : null}
      <Btn label={mode === 'signup' ? 'Create account' : 'Sign in'} busy={busy} onPress={() => void submit()} />
      <Btn outline label={mode === 'signup' ? 'I already have an account' : 'Create a new account'} onPress={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setErr(''); }} />
      {mode === 'signin' && <Btn small outline color="#9CA3AF" label="Forgot password" onPress={async () => { try { await requestPasswordReset(email); setInfo('If that email has an account, a reset link is on its way.'); setErr(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } }} />}
      <Btn small outline color="#9CA3AF" label="Continue without an account" onPress={() => router.replace('/')} />
    </Screen>
  );
}
