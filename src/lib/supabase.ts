import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { secureDelete, secureGet, secureSet } from './storage';

/**
 * Supabase client. The URL and anon key are PUBLIC by design (Row Level Security protects the data),
 * but the service-role key must never appear in this app.
 * Sessions are kept in the Android Keystore through the same encrypted store as the rest of the app.
 * If the env vars are missing the app still works offline and every cloud screen says so honestly.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const cloudConfigured = /^https?:\/\/.+/.test(url) && key.length > 20;

const storage = {
  getItem: (k: string) => secureGet(`sb.${k}`),
  setItem: (k: string, v: string) => secureSet(`sb.${k}`, v),
  removeItem: (k: string) => secureDelete(`sb.${k}`),
};

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(url, key, { auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })
  : null;

if (supabase) {
  // refresh tokens only while the app is in the foreground
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

/** PostgREST errors carry a code; a dropped connection does not. */
export function isNetworkError(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return !e.code && /network|fetch|timeout|abort|offline/i.test(e.message ?? '');
}
