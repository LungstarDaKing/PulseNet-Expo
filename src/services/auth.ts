import { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Profile {
  id: string;
  display_name: string | null;
  role: 'user' | 'moderator';
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function validateCredentials(email: string, password: string, mode: 'signin' | 'signup'): string | null {
  if (!EMAIL.test(email.trim())) return 'Enter a valid email address.';
  if (mode === 'signup' && password.length < 8) return 'Use at least 8 characters for your password.';
  if (password.length < 1) return 'Enter your password.';
  return null;
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Email or password is wrong.';
  if (m.includes('already registered')) return 'That email already has an account. Try signing in.';
  if (m.includes('email not confirmed')) return 'Confirm your email first: open the link we sent you.';
  if (m.includes('network') || m.includes('fetch')) return 'No connection. Check your internet and try again.';
  if (m.includes('rate limit')) return 'Too many attempts. Wait a few minutes.';
  return message;
}

export async function signUp(email: string, password: string, displayName: string): Promise<{ needsConfirmation: boolean }> {
  if (!supabase) throw new Error('Cloud is not set up.');
  const err = validateCredentials(email, password, 'signup');
  if (err) throw new Error(err);
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: displayName.trim().slice(0, 60) } } });
  if (error) throw new Error(friendly(error.message));
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Cloud is not set up.');
  const err = validateCredentials(email, password, 'signin');
  if (err) throw new Error(err);
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendly(error.message));
}

export async function requestPasswordReset(email: string): Promise<void> {
  if (!supabase) throw new Error('Cloud is not set up.');
  if (!EMAIL.test(email.trim())) throw new Error('Enter your email first.');
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw new Error(friendly(error.message));
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const token = await getPushTokenForSignOut();
  if (token) await supabase.rpc('unregister_push_token', { p_token: token });
  await supabase.auth.signOut();
}
/** Local-only sign out (used by "forget me": works offline). */
export async function signOutLocal(): Promise<void> {
  if (supabase) await supabase.auth.signOut({ scope: 'local' });
}
async function getPushTokenForSignOut(): Promise<string | null> {
  try {
    const { getStoredPushToken } = await import('./cloud');
    return await getStoredPushToken();
  } catch {
    return null;
  }
}

export async function getMyProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return null;
  const { data } = await supabase.from('profiles').select('id, display_name, role').eq('id', s.session.user.id).maybeSingle();
  return (data as Profile | null) ?? null;
}

export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setLoading(false); } });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (alive) setSession(s); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);
  return { session, loading };
}
