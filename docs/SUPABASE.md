# Connecting PulseNet to Supabase

PulseNet works without any of this (SOS, first aid, walks, vitals, local reports). Supabase adds accounts, community reports and alerts, live updates, photo evidence, push alerts and the Pulse AI assistant. **Nothing is shown as community data until it is connected, and the app says so.**

## 1. Create the project (about 10 minutes)
1. supabase.com -> New project (free tier is fine). Choose a region close to South Africa if offered.
2. **SQL Editor** -> paste all of `supabase/migrations/20261026000000_pulsenet.sql` -> Run. It is safe to run twice.
3. **Authentication -> Providers**: keep Email on. For testing you may turn off "Confirm email"; for real use leave it on.
4. **Project Settings -> API**: copy the **Project URL** and the **anon / publishable** key.

## 2. Give the app the two public values
In the project folder create `.env` (see `.env.example`):
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```
Then run `node scripts/apply-update.mjs`. It copies them into `eas.json` so cloud builds include them. Restart `npx expo start -c`.
Never use the `service_role` key in the app. The script refuses it.

## 3. Pulse AI with a free provider (optional)
The AI key lives only on the server (a Supabase Edge Function). Pick ONE:

**Groq (free tier, very fast)** - get a key at console.groq.com/keys (starts with `gsk_`)
```
supabase secrets set GROQ_API_KEY=gsk_xxxxxxxx
```
**Google Gemini (free tier)** - get a key at aistudio.google.com/apikey
```
supabase secrets set GEMINI_API_KEY=xxxxxxxx
```
Then deploy (first time only: `npm i -g supabase`, `supabase login`, `supabase link --project-ref YOUR-REF`):
```
supabase functions deploy pulse-ai
```
Defaults: Groq `llama-3.3-70b-versatile`, Gemini `gemini-2.5-flash-lite`. Model names change over time. If the test says "model not found", set another one from the provider's model list: `supabase secrets set AI_MODEL=<name>`. If you set several keys, force one with `supabase secrets set AI_PROVIDER=groq`.

Free-tier warnings:
- **Privacy:** Google says free-tier Gemini requests may be used to improve its products. Check Groq's terms too. Incident descriptions and chats are sent to the provider, so do not use a free tier if reports may contain sensitive personal information. A paid plan (or Anthropic) does not train on your data.
- **Limits:** free tiers are rate limited and can change or disappear. PulseNet shows "Pulse AI is not available" instead of guessing, and falls back to written first-aid steps.
- Each user is limited to 30 AI requests an hour by the function itself.

Prove it works: in the app, Profile -> Backend connection check -> "Test AI". Errors are explained there (bad key, wrong model, rate limit). The function's own logs are in the dashboard: Edge Functions -> pulse-ai -> Logs.

## 4. Push alerts to people near a serious report (optional, needs the installed APK)
```
supabase secrets set WEBHOOK_SECRET=$(openssl rand -hex 24)
supabase functions deploy notify-nearby --no-verify-jwt
```
Dashboard -> **Database -> Webhooks -> Create**: table `public_alerts`, events **Insert** and **Update**, type *Supabase Edge Functions*, function `notify-nearby`, add header `x-webhook-secret` = the same secret.
In the app: Profile -> Background alerts. Android also needs FCM credentials in EAS (`eas credentials`, Google Service Account / FCM v1) and a rebuild after `eas init`. Push does not work in Expo Go.

## 5. Make yourself a moderator
Sign up in the app, then in the SQL Editor:
```sql
update public.profiles set role = 'moderator' where id = (select id from auth.users where email = 'you@example.com');
```
Moderators see raw reports and photos, and can verify, resolve or dismiss from the alert screen. Only give this to people you trust: they can see reporter photos.

## How trust and safety are enforced (in the database, not just the app)
- Raw reports are private. The community sees `public_alerts`: coordinates rounded to ~110 m, no reporter id.
- Nobody can verify their own report or forge an alert; `verified` changes only via a moderator function.
- Anyone can confirm a report they did not write; 2 confirmations show as "Confirmed by other people". Confirmations are self-declared, so treat them as a hint, not proof.
- 5 reports per user per hour, 3 photos per report (5 MB, JPEG/PNG/WebP), private storage folders per user.
- Push locations are stored rounded to ~1 km and removed when you turn alerts off or delete your account.
- `supabase/tests/rls_test.sql` contains 49 checks of these rules. Run it against a scratch Postgres with `supabase/tests/stub.sql` loaded first.

## Limits you should know
- A community report is **not** an emergency call. Every report screen says so and shows 10111 / 10177 / 112.
- Moderation needs real people. Without moderators, alerts stay "unverified" unless others confirm them.
- Supabase free projects pause after inactivity and have usage limits.
- POPIA: reports contain location and free text. Publish a privacy notice, decide how long to keep reports, and offer deletion (the app lets users delete their own reports and photos).
- Realtime and push were designed to the Supabase/Expo documentation but not run end to end by me. Test with two phones before you rely on them.
