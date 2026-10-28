import { FunctionsHttpError } from '@supabase/supabase-js';
import { isNetworkError, supabase } from '../lib/supabase';
import { ReportType, Severity } from './alertsLogic';

/** Client for the pulse-ai Edge Function. When it is unavailable the UI says so: it never fakes an answer. */
export type PulseFailure = 'not_configured' | 'signed_out' | 'ai_not_configured' | 'rate_limited' | 'offline' | 'unavailable';

export class PulseError extends Error {
  constructor(public code: PulseFailure, public detail?: string) {
    super(code);
  }
}

export const PULSE_MESSAGES: Record<PulseFailure, string> = {
  not_configured: 'Pulse AI needs the PulseNet backend, which is not connected in this build.',
  signed_out: 'Sign in to use Pulse AI.',
  ai_not_configured: 'Pulse AI has not been switched on by the app owner yet.',
  rate_limited: 'You have used Pulse AI a lot this hour. Please try again later.',
  offline: 'No connection. Pulse AI needs the internet.',
  unavailable: 'Pulse AI is not available right now.',
};

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new PulseError('not_configured');
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) throw new PulseError('signed_out');
  const { data, error } = await supabase.functions.invoke('pulse-ai', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const status = (error.context as Response).status;
      let code = '';
      let detail = '';
      try {
        const j = (await (error.context as Response).json()) as { error?: string; detail?: string; provider?: string; model?: string };
        code = j.error ?? '';
        detail = [j.provider, j.model, j.detail].filter(Boolean).join(' / ');
      } catch { /* ignore */ }
      if (code === 'ai_not_configured') throw new PulseError('ai_not_configured');
      if (status === 429) throw new PulseError('rate_limited');
      if (status === 401) throw new PulseError('signed_out');
      throw new PulseError('unavailable', detail || `HTTP ${status}`);
    }
    throw new PulseError(isNetworkError(error as { message?: string }) || /network|fetch/i.test(error.message) ? 'offline' : 'unavailable');
  }
  return data as T;
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export interface ChatReply { reply: string; emergency: boolean; emergencyLine: string | null }
export const askPulse = (messages: ChatTurn[]) => invoke<ChatReply>({ mode: 'chat', messages });

export interface Analysis { type: ReportType; severity: Severity; summary: string; advice: string[] }
export const analyzeReport = (description: string, type: ReportType) => invoke<Analysis>({ mode: 'analyze', description, type });

export interface AiStatus { configured: boolean; provider: string | null; model: string | null }
/** Free check: is a provider key set on the server? Does not call the model. */
export const aiStatus = () => invoke<AiStatus>({ mode: 'status' });
/** Sends one tiny request to the provider to prove the key and model work (uses 1 of your hourly requests). */
export const aiPing = () => invoke<{ ok: boolean; provider: string; model: string; sample: string }>({ mode: 'ping' });
