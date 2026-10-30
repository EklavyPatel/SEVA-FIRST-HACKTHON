-- LOCAL DISPOSABLE SUPABASE ONLY. Run after 001 and 002 as postgres.
-- Uses SQL roles + JWT claim settings: tests PostgreSQL authorization, not JWT verification.
\set ON_ERROR_STOP on
begin;

create function public._km_assert(ok boolean, label text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %',label;
end;
$$;
create function public._km_denied(statement text, expected_state text, label text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then raise notice 'PASS: %',label; return; end if;
    raise exception 'FAIL: %, expected %, got %: %',label,expected_state,sqlstate,sqlerrm;
  end;
  raise exception 'FAIL: %, statement unexpectedly succeeded',label;
end;
$$;
create function public._km_identity(who uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',who::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',who,'role','authenticated')::text,true);
end;
$$;
grant execute on function public._km_assert(boolean,text), public._km_denied(text,text,text),
  public._km_identity(uuid) to authenticated, anon;

-- Synthetic identities. The signup trigger must ignore spoofed role metadata.
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000001','farmer-a@example.invalid','{"role":"admin"}'),
 ('10000000-0000-0000-0000-000000000002','farmer-b@example.invalid','{}'),
 ('20000000-0000-0000-0000-000000000001','expert-a@example.invalid','{}'),
 ('20000000-0000-0000-0000-000000000002','expert-b@example.invalid','{}'),
 ('30000000-0000-0000-0000-000000000001','admin@example.invalid','{}');
select public._km_assert((select count(*)=5 from public.profiles),'Auth trigger creates profiles');
select public._km_assert((select bool_and(role='farmer') from public.user_roles),'signup metadata cannot grant admin');
update public.user_roles set role='expert' where user_id::text like '20000000%';
update public.user_roles set role='admin' where user_id='30000000-0000-0000-0000-000000000001';

set local role authenticated;
select public._km_identity('10000000-0000-0000-0000-000000000001');
insert into public.crop_reports(id,symptoms,district) values
 ('aaaaaaaa-0000-0000-0000-000000000001','TEST ONLY','TEST DISTRICT');
insert into public.report_images(id,report_id,storage_path,mime_type) values
 ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000001.jpg','image/jpeg');
select public._km_assert((select count(*)=1 from public.crop_reports),'farmer can read own report');
select public._km_denied($q$update public.user_roles set role='admin'$q$,'42501','no self-promotion');
select public._km_denied($q$update public.profiles set id=gen_random_uuid()$q$,'42501','profile ID protected');
select public._km_denied($q$insert into public.crop_reports(symptoms,district,status) values ('TEST','TEST','resolved')$q$,'42501','report status protected');
select public._km_denied($q$insert into public.crop_reports(farmer_id,symptoms,district) values ('10000000-0000-0000-0000-000000000002','TEST','TEST')$q$,'42501','report owner protected');
update public.profiles set full_name='TEST FARMER' where id='10000000-0000-0000-0000-000000000001';

select public._km_identity('10000000-0000-0000-0000-000000000002');
select public._km_assert((select count(*)=0 from public.crop_reports),'farmer B cannot see farmer A');
select public._km_assert((select count(*)=0 from public.report_images),'farmer B cannot see image paths');
insert into public.crop_reports(id,symptoms,district) values
 ('aaaaaaaa-0000-0000-0000-000000000002','TEST ONLY','TEST DISTRICT');
insert into public.report_images(id,report_id,storage_path,mime_type) values
 ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002/aaaaaaaa-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000002.jpg','image/jpeg');
select public._km_denied($q$insert into public.report_images(report_id,storage_path,mime_type) values
 ('aaaaaaaa-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002/aaaaaaaa-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000003.jpg','image/jpeg')$q$,'42501','cannot reserve on foreign report');

reset role;
-- Storage metadata fixtures exercise SQL policies only; no real objects are uploaded.
insert into storage.objects(bucket_id,name) select 'crop-photos',storage_path from public.report_images;
insert into public.ai_diagnoses(id,report_id,request_id,model_name,prompt_version,
 visible_symptoms_gu,explanation_gu,uncertainty_level,uncertainty_reason_gu) values
 ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000001','TEST MODEL','TEST','TEST ONLY','TEST ONLY','unknown','TEST ONLY');
insert into public.diagnosis_candidates(diagnosis_id,rank,kind,name) values
 ('cccccccc-0000-0000-0000-000000000001',1,'unknown','TEST ONLY');
insert into public.diagnosis_images(report_id,diagnosis_id,image_id) values
 ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001');
select public._km_denied($q$insert into public.diagnosis_images(report_id,diagnosis_id,image_id) values
 ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002')$q$,'23503','cross-report evidence rejected by FK');
update public.crop_reports set status='expert_review' where id='aaaaaaaa-0000-0000-0000-000000000001';

set local role authenticated;
select public._km_identity('10000000-0000-0000-0000-000000000002');
select public._km_assert((select count(*)=0 from public.ai_diagnoses),'foreign diagnoses hidden');
select public._km_assert((select count(*)=0 from public.diagnosis_candidates),'foreign candidates hidden');
select public._km_assert((select count(*)=0 from public.diagnosis_images),'foreign evidence hidden');
select public._km_assert((select count(*)=1 from storage.objects where bucket_id='crop-photos'),'Storage metadata isolates farmers');
select public._km_denied($q$insert into storage.objects(bucket_id,name) values ('crop-photos','unregistered.jpg')$q$,'42501','unregistered upload denied');
with changed as (update storage.objects set name='moved.jpg' where bucket_id='crop-photos' returning 1)
select public._km_assert((select count(*)=0 from changed),'object overwrite/move denied');
with removed as (delete from storage.objects where bucket_id='crop-photos' returning 1)
select public._km_assert((select count(*)=0 from removed),'client object delete denied');

select public._km_identity('20000000-0000-0000-0000-000000000001');
select public._km_assert((select count(*)=0 from public.crop_reports),'unassigned expert sees no reports');
select public._km_denied($q$insert into public.report_assignments(report_id,expert_id) values
 ('aaaaaaaa-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001')$q$,'42501','expert cannot self-assign');

select public._km_identity('30000000-0000-0000-0000-000000000001');
select public._km_assert((select count(*)=2 from public.crop_reports),'admin can read all reports');
insert into public.report_assignments(report_id,expert_id) values
 ('aaaaaaaa-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');

select public._km_identity('20000000-0000-0000-0000-000000000001');
select public._km_assert((select count(*)=1 from public.crop_reports),'assigned expert sees one report');
select public._km_assert((select count(*)=1 from storage.objects where bucket_id='crop-photos'),'assigned expert sees one image');
select public._km_assert((select count(*)=1 from public.profiles),'expert cannot read farmer profile');
insert into public.expert_reviews(report_id,diagnosis_id,assignment_id,status,feedback_gu)
select report_id,'cccccccc-0000-0000-0000-000000000001',id,'inconclusive','TEST ONLY'
from public.report_assignments;
select public._km_assert((select count(*)=1 from public.expert_reviews),'assigned expert can submit review');
select public._km_denied($q$update public.expert_reviews set feedback_gu='CHANGED'$q$,'42501','submitted review immutable');

select public._km_identity('20000000-0000-0000-0000-000000000002');
select public._km_assert((select count(*)=0 from public.expert_reviews),'unassigned expert cannot read reviews');
select public._km_denied($q$insert into public.expert_reviews(report_id,diagnosis_id,assignment_id,status,feedback_gu)
 values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',
 'eeeeeeee-0000-0000-0000-000000000001','inconclusive','TEST ONLY')$q$,'42501','unassigned expert cannot submit review');

select public._km_identity('30000000-0000-0000-0000-000000000001');
update public.report_assignments set revoked_at=now();
select public._km_identity('20000000-0000-0000-0000-000000000001');
select public._km_assert((select count(*)=0 from public.crop_reports),'revocation hides reports');
select public._km_assert((select count(*)=0 from storage.objects where bucket_id='crop-photos'),'revocation hides photos');
select public._km_assert((select count(*)=0 from public.expert_reviews),'revocation hides historical reviews');

-- Demotion must also remove access even with an unrevoked assignment.
select public._km_identity('30000000-0000-0000-0000-000000000001');
insert into public.report_assignments(report_id,expert_id) values
 ('aaaaaaaa-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
reset role;
update public.user_roles set role='farmer' where user_id='20000000-0000-0000-0000-000000000001';
set local role authenticated;
select public._km_identity('20000000-0000-0000-0000-000000000001');
select public._km_assert((select count(*)=0 from public.crop_reports),'role demotion hides reports without JWT refresh');

-- Neutral placeholders verify provenance without inventing advisory content.
select public._km_identity('30000000-0000-0000-0000-000000000001');
insert into public.agricultural_advisories(kind,name,symptoms_gu,prevention_gu,next_steps_gu,source_title,source_url)
values ('pest','TEST ONLY','TEST ONLY','TEST ONLY','TEST ONLY','TEST ONLY','https://example.invalid/test');
select public._km_denied($q$update public.agricultural_advisories set status='published'$q$,'23514','unverified draft cannot publish');
update public.agricultural_advisories set source_verified=true,status='published';
select public._km_assert((select reviewer_id=auth.uid() and reviewed_at is not null from public.agricultural_advisories),'draft can be verified and published');
select public._km_denied($q$update public.agricultural_advisories set symptoms_gu='CHANGED'$q$,'42501','published content immutable');
select public._km_denied($q$update public.agricultural_advisories set reviewer_id=auth.uid()$q$,'42501','cannot forge reviewer');
reset role;
-- Different admin withdrawal: retain original review time and reviewer.
update public.user_roles set role='admin' where user_id='20000000-0000-0000-0000-000000000002';
set local role authenticated;
select public._km_identity('20000000-0000-0000-0000-000000000002');
update public.agricultural_advisories set status='withdrawn';
select public._km_assert((select reviewer_id='30000000-0000-0000-0000-000000000001' from public.agricultural_advisories),'withdrawal preserves original reviewer');
select public._km_denied($q$update public.agricultural_advisories set status='published'$q$,'P0001','withdrawn advisory cannot be republished');

select public._km_identity('10000000-0000-0000-0000-000000000001');
select public._km_assert((select count(*)=0 from public.agricultural_advisories),'withdrawn advisory hidden from farmers');
select public._km_denied($q$insert into public.ai_diagnoses default values$q$,'42501','client cannot write AI results');
select public._km_denied($q$delete from public.crop_reports$q$,'42501','client cannot delete reports');
set local role anon;
select public._km_denied($q$select * from public.crop_reports$q$,'42501','anonymous report read denied');
select public._km_assert((select count(*)=0 from storage.objects where bucket_id='crop-photos'),'anonymous image metadata hidden');

reset role;
select public._km_assert((select not public from storage.buckets where id='crop-photos'),'bucket is private');
select public._km_assert((select count(*)=10 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relrowsecurity),'all ten application tables have RLS');
select public._km_denied($q$delete from auth.users where id='10000000-0000-0000-0000-000000000001'$q$,'23503','Auth deletion cannot silently erase evidence');
rollback;
\echo 'Authorization tests completed; synthetic fixtures and test functions rolled back.'
