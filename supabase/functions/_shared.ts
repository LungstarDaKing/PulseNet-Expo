// Shared helpers for PulseNet Edge Functions (Deno).
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export const EMERGENCY_LINE =
  'If anyone is in immediate danger, call 10111 (police), 10177 (ambulance) or 112 now. PulseNet cannot call anyone for you.';

/** Words that mean "act now". Used only to show call buttons: never to downplay anything. */
const URGENT = /\b(gun|shot|shooting|stab|stabbed|rape|raped|kidnap|hijack|bomb|explosion|fire|burning|bleeding|unconscious|not breathing|overdose|suicide|kill myself|being followed|attacked|trapped|choking|chest pain|drowning)\b/i;
export const looksUrgent = (text: string) => URGENT.test(text);
