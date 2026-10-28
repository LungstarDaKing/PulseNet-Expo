\set ON_ERROR_STOP on
create schema if not exists t;
-- users
insert into auth.users (id, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a@x.z','{"display_name":"Alice"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@x.z','{}'),
 ('cccccccc-0000-0000-0000-000000000003','m@x.z','{}');
update public.profiles set role='moderator' where id='cccccccc-0000-0000-0000-000000000003';

create or replace function t.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, false); end $$;
create or replace function t.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS  (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % was allowed', label;
end $$;
create or replace function t.expect(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS  %', label; else raise exception 'FAIL: %', label; end if; end $$;
grant all on function t.as_user(uuid), t.expect_fail(text,text), t.expect(boolean,text) to public;
grant usage on schema t to public;

-- A files a report
select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
insert into public.incident_reports (id, type, description, latitude, longitude, severity)
values ('11111111-0000-0000-0000-000000000001','fire','Shack fire spreading near the taxi rank', -29.857412, 31.021899, 'high');
select t.expect((select count(*) from public.incident_reports) = 1, 'A sees own report');
select t.expect((select reporter_id from public.incident_reports) = 'aaaaaaaa-0000-0000-0000-000000000001', 'reporter_id forced to caller');
select t.expect_fail($q$insert into public.incident_reports (type, description, latitude, longitude, verified) values ('fire','self verified report attempt',1,1,true)$q$, 'insert verified=true');
select t.expect_fail($q$insert into public.incident_reports (reporter_id, type, description, latitude, longitude) values ('bbbbbbbb-0000-0000-0000-000000000002','fire','impersonating another reporter',1,1)$q$, 'insert as someone else');
select t.expect_fail($q$insert into public.incident_reports (type, description, latitude, longitude) values ('fire','short',1,1)$q$, 'description too short');
select t.expect_fail($q$insert into public.incident_reports (type, description, latitude, longitude) values ('fire','coordinates are impossible here',95,1)$q$, 'latitude out of range');
select t.expect_fail($q$update public.incident_reports set verified = true$q$, 'owner updating verified');
select t.expect_fail($q$update public.incident_reports set status = 'dismissed'$q$, 'owner direct update');
select t.expect_fail($q$update public.profiles set role = 'moderator'$q$, 'self-promote to moderator');
select t.expect_fail($q$select public.push_tokens_near(0,0,null)$q$, 'authenticated calling push_tokens_near');

-- B (stranger) privacy
select t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select t.expect((select count(*) from public.incident_reports) = 0, 'B cannot read raw reports');
select t.expect((select count(*) from public.public_alerts) = 1, 'B sees the community alert');
select t.expect((select latitude from public.public_alerts) = -29.857 and (select longitude from public.public_alerts) = 31.022, 'public coordinates are rounded (~110 m)');
select t.expect((select count(*) from information_schema.columns where table_name='public_alerts' and column_name in ('reporter_id','accuracy_m'))=0, 'public alert has no reporter id');
select t.expect((select count(*) from public.nearby_alerts(-29.86, 31.02, 5, 24)) = 1, 'nearby_alerts finds it within 5 km');
select t.expect((select count(*) from public.nearby_alerts(-26.20, 28.04, 5, 24)) = 0, 'nearby_alerts excludes Johannesburg');
select t.expect_fail($q$insert into public.public_alerts (id,type,severity,description,latitude,longitude,status,created_at) values (gen_random_uuid(),'fire','critical','forged alert',0,0,'open',now())$q$, 'forging a public alert');
select t.expect_fail($q$update public.public_alerts set verified = true$q$, 'editing public alert');
select t.expect_fail($q$delete from public.public_alerts$q$, 'deleting public alert');
select t.expect_fail($q$select public.moderate_report('11111111-0000-0000-0000-000000000001','dismissed',true,null)$q$, 'non-moderator moderating');
select t.expect_fail($q$select public.set_my_report_status('11111111-0000-0000-0000-000000000001','resolved')$q$, 'B resolving As report');
insert into public.incident_confirmations (report_id) values ('11111111-0000-0000-0000-000000000001');
select t.expect((select confirmations from public.public_alerts) = 1, 'B confirmation counted');
select t.expect((select confirmed_by_me from public.nearby_alerts(-29.86, 31.02, 5, 24)), 'confirmed_by_me true');
select t.expect_fail($q$insert into public.incident_confirmations (report_id) values ('11111111-0000-0000-0000-000000000001')$q$, 'double confirmation');
select t.expect_fail($q$insert into public.incident_confirmations (report_id, user_id) values ('11111111-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000003')$q$, 'confirming as another user');

-- A cannot confirm own report
select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select t.expect_fail($q$insert into public.incident_confirmations (report_id) values ('11111111-0000-0000-0000-000000000001')$q$, 'self-confirmation');

-- evidence rules
insert into public.incident_evidence (report_id, storage_path, mime) values ('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-000000000001/0.jpg','image/jpeg');
select t.expect_fail($q$insert into public.incident_evidence (report_id, storage_path, mime) values ('11111111-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002/x/0.jpg','image/jpeg')$q$, 'evidence path outside own folder');
select t.expect_fail($q$insert into public.incident_evidence (report_id, storage_path, mime) values ('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-000000000001/1.exe','application/x-msdownload')$q$, 'evidence wrong mime');
insert into public.incident_evidence (report_id, storage_path, mime) values ('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-000000000001/1.jpg','image/jpeg');
insert into public.incident_evidence (report_id, storage_path, mime) values ('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-000000000001/2.jpg','image/jpeg');
select t.expect_fail($q$insert into public.incident_evidence (report_id, storage_path, mime) values ('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-000000000001/3.jpg','image/jpeg')$q$, 'fourth evidence file');
-- storage object policies
insert into storage.objects (bucket_id, name) values ('evidence','aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-000000000001/0.jpg');
select t.expect_fail($q$insert into storage.objects (bucket_id, name) values ('evidence','bbbbbbbb-0000-0000-0000-000000000002/stolen.jpg')$q$, 'uploading into another users folder');

select t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select t.expect((select count(*) from storage.objects) = 0, 'B cannot see As evidence file');
select t.expect((select count(*) from public.incident_evidence) = 0, 'B cannot see evidence rows');

-- moderator
select t.as_user('cccccccc-0000-0000-0000-000000000003');
select t.expect((select count(*) from public.incident_reports) = 1, 'moderator reads raw reports');
select t.expect((select count(*) from storage.objects) = 1, 'moderator reads evidence');
select public.moderate_report('11111111-0000-0000-0000-000000000001', 'investigating', true, 'Confirmed by SAPS call');
select t.expect((select verified from public.public_alerts) and (select status from public.public_alerts)='investigating', 'moderator verification flows to public alert');
select t.expect((select count(*) from public.incident_updates) = 1, 'moderation recorded in history');

-- A resolves own; then rate limit
select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.set_my_report_status('11111111-0000-0000-0000-000000000001','resolved');
select t.expect((select status from public.public_alerts)='resolved', 'owner resolving updates public alert');
select t.expect_fail($q$select public.set_my_report_status('11111111-0000-0000-0000-000000000001','dismissed')$q$, 'owner dismissing via RPC');
insert into public.incident_reports (type, description, latitude, longitude) select 'other','report number '||g||' for rate limiting', 0, 0 from generate_series(1,4) g;
select t.expect_fail($q$insert into public.incident_reports (type, description, latitude, longitude) values ('other','sixth report within the hour',0,0)$q$, 'rate limit (6th report/hour)');

-- deleting own report removes public alert
delete from public.incident_reports where id='11111111-0000-0000-0000-000000000001';
select t.expect((select count(*) from public.public_alerts where id='11111111-0000-0000-0000-000000000001')=0, 'deleting a report removes the public alert');

-- push tokens
select public.register_push_token('ExponentPushToken[abc]','android',-29.8574,31.0219,10);
select t.expect_fail($q$select public.register_push_token('not-a-token','android',0,0,10)$q$, 'invalid push token');
select t.expect((select count(*) from public.push_tokens) = 0, 'direct read of push_tokens returns nothing');
reset role;
select t.expect((select latitude from public.push_tokens)::numeric = -29.86, 'push location stored rounded (~1 km)');
set role service_role;
select t.expect((select count(*) from public.push_tokens_near(-29.857,31.022,null)) = 1, 'push_tokens_near finds nearby token');
select t.expect((select count(*) from public.push_tokens_near(-29.857,31.022,'aaaaaaaa-0000-0000-0000-000000000001')) = 0, 'reporter excluded from push');
select t.expect((select count(*) from public.push_tokens_near(-26.2,28.04,null)) = 0, 'distant token not notified');
reset role;
-- anon
set role anon;
select t.expect((select count(*) from public.public_alerts) = 0, 'anonymous sees no alerts');
select t.expect_fail($q$select * from public.nearby_alerts(0,0,5,24)$q$, 'anonymous nearby_alerts');
reset role;
\echo ALL SQL TESTS PASSED
