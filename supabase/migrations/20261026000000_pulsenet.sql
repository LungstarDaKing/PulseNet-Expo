-- PulseNet backend schema for Supabase (PostgreSQL).
-- Run once in the Supabase SQL editor, or with `supabase db push`.
--
-- Design rules
--  * Raw reports are PRIVATE (owner + moderators). The community only sees public_alerts:
--    a sanitised copy with coordinates rounded to ~110 m and no reporter identity.
--  * Nothing can mark itself "verified". Only moderators (via moderate_report) or other users'
--    confirmations change trust, and the app shows the trust level on every alert.
--  * Every table has Row Level Security. Writes that must not be free-form go through
--    SECURITY DEFINER functions with fixed behaviour.

-- ------------------------------------------------------------------ profiles
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 60),
  role         text not null default 'user' check (role in ('user', 'moderator')),
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());

-- users may change their display name only, never their role
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60), ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'moderator');
$$;

-- ------------------------------------------------------------------ incident_reports (private)
create table if not exists public.incident_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type            text not null check (type in ('medical', 'fire', 'crime', 'accident', 'other')),
  description     text not null check (char_length(description) between 10 and 1000),
  latitude        double precision not null check (latitude between -90 and 90),
  longitude       double precision not null check (longitude between -180 and 180),
  accuracy_m      real check (accuracy_m is null or accuracy_m >= 0),
  severity        text not null default 'low' check (severity in ('low', 'medium', 'high', 'critical')),
  severity_source text not null default 'rules' check (severity_source in ('user', 'rules', 'ai')),
  ai_summary      text check (ai_summary is null or char_length(ai_summary) <= 500),
  status          text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  verified        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists incident_reports_reporter_idx on public.incident_reports (reporter_id, created_at desc);
alter table public.incident_reports enable row level security;

drop policy if exists "reports: read own or moderator" on public.incident_reports;
create policy "reports: read own or moderator" on public.incident_reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_moderator());

drop policy if exists "reports: insert own" on public.incident_reports;
create policy "reports: insert own" on public.incident_reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open' and verified = false);

drop policy if exists "reports: delete own" on public.incident_reports;
create policy "reports: delete own" on public.incident_reports
  for delete to authenticated using (reporter_id = auth.uid());

-- no direct updates: status/verification change only through the functions below
revoke update on public.incident_reports from authenticated, anon;

create or replace function public.enforce_report_rate_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.incident_reports
        where reporter_id = new.reporter_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate_limit: too many reports in the last hour' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists report_rate_limit on public.incident_reports;
create trigger report_rate_limit before insert on public.incident_reports
  for each row execute function public.enforce_report_rate_limit();

-- ------------------------------------------------------------------ evidence
create table if not exists public.incident_evidence (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.incident_reports(id) on delete cascade,
  storage_path text not null,
  mime         text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  created_at   timestamptz not null default now()
);
create index if not exists incident_evidence_report_idx on public.incident_evidence (report_id);
alter table public.incident_evidence enable row level security;

create or replace function public.owns_report(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.incident_reports where id = rid and reporter_id = auth.uid());
$$;

drop policy if exists "evidence: read own or moderator" on public.incident_evidence;
create policy "evidence: read own or moderator" on public.incident_evidence
  for select to authenticated using (public.owns_report(report_id) or public.is_moderator());

drop policy if exists "evidence: insert own" on public.incident_evidence;
create policy "evidence: insert own" on public.incident_evidence
  for insert to authenticated
  with check (public.owns_report(report_id)
              and storage_path like (auth.uid()::text || '/' || report_id::text || '/%'));

create or replace function public.limit_evidence_per_report()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.incident_evidence where report_id = new.report_id) >= 3 then
    raise exception 'evidence_limit: at most 3 files per report' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists evidence_limit on public.incident_evidence;
create trigger evidence_limit before insert on public.incident_evidence
  for each row execute function public.limit_evidence_per_report();

-- ------------------------------------------------------------------ status history
create table if not exists public.incident_updates (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.incident_reports(id) on delete cascade,
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status     text not null check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  note       text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);
alter table public.incident_updates enable row level security;
drop policy if exists "updates: read own or moderator" on public.incident_updates;
create policy "updates: read own or moderator" on public.incident_updates
  for select to authenticated using (public.owns_report(report_id) or public.is_moderator());
-- inserts only through the functions below

-- ------------------------------------------------------------------ public_alerts (community view)
create table if not exists public.public_alerts (
  id            uuid primary key references public.incident_reports(id) on delete cascade,
  type          text not null,
  severity      text not null,
  description   text not null,
  latitude      double precision not null,   -- rounded to 3 decimals (~110 m)
  longitude     double precision not null,
  status        text not null,
  verified      boolean not null default false,
  confirmations integer not null default 0,
  created_at    timestamptz not null,
  updated_at    timestamptz not null default now()
);
create index if not exists public_alerts_created_idx on public.public_alerts (created_at desc);
alter table public.public_alerts enable row level security;
drop policy if exists "alerts: read all signed-in" on public.public_alerts;
create policy "alerts: read all signed-in" on public.public_alerts
  for select to authenticated using (status <> 'dismissed');
revoke insert, update, delete on public.public_alerts from authenticated, anon;

create or replace function public.sync_public_alert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'dismissed' then
    delete from public.public_alerts where id = new.id;
    return new;
  end if;
  insert into public.public_alerts as a
    (id, type, severity, description, latitude, longitude, status, verified, created_at, updated_at)
  values
    (new.id, new.type, new.severity, new.description,
     round(new.latitude::numeric, 3)::double precision,
     round(new.longitude::numeric, 3)::double precision,
     new.status, new.verified, new.created_at, now())
  on conflict (id) do update set
    type = excluded.type, severity = excluded.severity, description = excluded.description,
    status = excluded.status, verified = excluded.verified, updated_at = now();
  return new;
end $$;
drop trigger if exists report_to_public_alert on public.incident_reports;
create trigger report_to_public_alert after insert or update on public.incident_reports
  for each row execute function public.sync_public_alert();

-- ------------------------------------------------------------------ confirmations
create table if not exists public.incident_confirmations (
  report_id  uuid not null references public.incident_reports(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);
alter table public.incident_confirmations enable row level security;

create or replace function public.can_confirm(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.incident_reports r
                  where r.id = rid and r.reporter_id <> auth.uid()
                    and r.status in ('open', 'investigating'));
$$;

drop policy if exists "confirm: read own" on public.incident_confirmations;
create policy "confirm: read own" on public.incident_confirmations
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "confirm: insert own" on public.incident_confirmations;
create policy "confirm: insert own" on public.incident_confirmations
  for insert to authenticated with check (user_id = auth.uid() and public.can_confirm(report_id));
drop policy if exists "confirm: delete own" on public.incident_confirmations;
create policy "confirm: delete own" on public.incident_confirmations
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.refresh_confirmations()
returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid := coalesce(new.report_id, old.report_id);
begin
  update public.public_alerts
     set confirmations = (select count(*) from public.incident_confirmations where report_id = rid)
   where id = rid;
  return null;
end $$;
drop trigger if exists confirmations_count on public.incident_confirmations;
create trigger confirmations_count after insert or delete on public.incident_confirmations
  for each row execute function public.refresh_confirmations();

-- ------------------------------------------------------------------ push tokens
create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text check (platform in ('android', 'ios')),
  latitude   real check (latitude between -90 and 90),
  longitude  real check (longitude between -180 and 180),
  radius_km  real not null default 10 check (radius_km between 1 and 50),
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
-- no policies on purpose: clients use the functions below

create or replace function public.register_push_token(
  p_token text, p_platform text, p_lat double precision, p_lon double precision, p_radius_km double precision default 10)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_token !~ '^(Expo|Exponent)PushToken\[.+\]$' then raise exception 'invalid_token'; end if;
  insert into public.push_tokens (token, user_id, platform, latitude, longitude, radius_km, updated_at)
  values (p_token, auth.uid(), p_platform,
          round(p_lat::numeric, 2)::real, round(p_lon::numeric, 2)::real,  -- ~1 km: coarse on purpose
          least(50, greatest(1, p_radius_km))::real, now())
  on conflict (token) do update set
    user_id = auth.uid(), platform = excluded.platform, latitude = excluded.latitude,
    longitude = excluded.longitude, radius_km = excluded.radius_km, updated_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

-- used by the notify-nearby Edge Function (service role only)
create or replace function public.push_tokens_near(p_lat double precision, p_lon double precision, p_exclude uuid default null)
returns table (token text)
language sql stable security definer set search_path = public as $$
  select t.token from public.push_tokens t
   where (p_exclude is null or t.user_id <> p_exclude)
     and t.latitude is not null and t.longitude is not null
     and 6371 * 2 * asin(least(1, sqrt(
           power(sin(radians(t.latitude - p_lat) / 2), 2) +
           cos(radians(p_lat)) * cos(radians(t.latitude)) * power(sin(radians(t.longitude - p_lon) / 2), 2)
         ))) <= t.radius_km + 1;   -- +1 km because stored positions are rounded
$$;

-- ------------------------------------------------------------------ AI usage (rate limiting by the Edge Function)
create table if not exists public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;  -- no policies: service role only

-- ------------------------------------------------------------------ community feed query
create or replace function public.nearby_alerts(
  p_lat double precision, p_lon double precision,
  p_radius_km double precision default 10, p_since_hours integer default 72)
returns table (
  id uuid, type text, severity text, description text, latitude double precision, longitude double precision,
  status text, verified boolean, confirmations integer, created_at timestamptz, distance_km double precision,
  confirmed_by_me boolean)
language sql stable set search_path = public as $$
  select * from (
    select a.id, a.type, a.severity, a.description, a.latitude, a.longitude, a.status, a.verified,
           a.confirmations, a.created_at,
           6371 * 2 * asin(least(1, sqrt(
             power(sin(radians(a.latitude - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(a.latitude)) * power(sin(radians(a.longitude - p_lon) / 2), 2)
           ))) as distance_km,
           exists (select 1 from public.incident_confirmations c
                    where c.report_id = a.id and c.user_id = auth.uid()) as confirmed_by_me
      from public.public_alerts a
     where a.created_at > now() - make_interval(hours => least(greatest(p_since_hours, 1), 720))
  ) x
  where x.distance_km <= least(greatest(p_radius_km, 0.5), 100)
  order by x.created_at desc
  limit 100;
$$;

-- ------------------------------------------------------------------ status changes
create or replace function public.set_my_report_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status <> 'resolved' then raise exception 'owners can only mark a report resolved'; end if;
  if not public.owns_report(p_id) then raise exception 'not_found'; end if;
  update public.incident_reports set status = 'resolved', updated_at = now() where id = p_id;
  insert into public.incident_updates (report_id, author_id, status) values (p_id, auth.uid(), 'resolved');
end $$;

create or replace function public.moderate_report(
  p_id uuid, p_status text default null, p_verified boolean default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'forbidden'; end if;
  if p_status is not null and p_status not in ('open', 'investigating', 'resolved', 'dismissed') then
    raise exception 'invalid_status';
  end if;
  update public.incident_reports
     set status = coalesce(p_status, status), verified = coalesce(p_verified, verified), updated_at = now()
   where id = p_id;
  if not found then raise exception 'not_found'; end if;
  insert into public.incident_updates (report_id, author_id, status, note)
  select p_id, auth.uid(), r.status, left(p_note, 300) from public.incident_reports r where r.id = p_id;
end $$;

-- ------------------------------------------------------------------ function privileges
revoke execute on function public.nearby_alerts(double precision, double precision, double precision, integer) from public, anon;
revoke execute on function public.set_my_report_status(uuid, text) from public, anon;
revoke execute on function public.moderate_report(uuid, text, boolean, text) from public, anon;
revoke execute on function public.register_push_token(text, text, double precision, double precision, double precision) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
revoke execute on function public.push_tokens_near(double precision, double precision, uuid) from public, anon, authenticated;
grant execute on function public.nearby_alerts(double precision, double precision, double precision, integer) to authenticated;
grant execute on function public.set_my_report_status(uuid, text) to authenticated;
grant execute on function public.moderate_report(uuid, text, boolean, text) to authenticated;
grant execute on function public.register_push_token(text, text, double precision, double precision, double precision) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.push_tokens_near(double precision, double precision, uuid) to service_role;

-- ------------------------------------------------------------------ storage: private evidence bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "evidence: upload to own folder" on storage.objects;
create policy "evidence: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "evidence: read own or moderator" on storage.objects;
create policy "evidence: read own or moderator" on storage.objects
  for select to authenticated
  using (bucket_id = 'evidence' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_moderator()));

drop policy if exists "evidence: delete own" on storage.objects;
create policy "evidence: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------------ realtime
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.public_alerts;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
