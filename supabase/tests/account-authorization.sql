-- DISPOSABLE LOCAL SUPABASE ONLY. Do not run against a live project.
-- Run after migrations/202611040001_account_access.sql with psql -v ON_ERROR_STOP=1.
-- Fixtures and all test actions roll back. Tests exercise actual PostgreSQL RLS.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('10000000-0000-4000-8000-000000000001','km-a@example.invalid',now()),
 ('10000000-0000-4000-8000-000000000002','km-b@example.invalid',now()),
 ('10000000-0000-4000-8000-000000000003','km-admin@example.invalid',now());
insert into public.km_account_roles(user_id,role) values
 ('10000000-0000-4000-8000-000000000003','admin');
insert into public.km_access_requests(id,user_id,kind,purpose) values
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','individual','Synthetic B request');

set local role anon;
do $$ begin
 begin perform 1 from public.km_account_roles; raise exception 'FAIL: anon read roles';
 exception when insufficient_privilege then null; end;
 begin perform 1 from public.km_access_requests; raise exception 'FAIL: anon read requests';
 exception when insufficient_privilege then null; end;
 begin perform public.km_review_access_request('20000000-0000-4000-8000-000000000002','approved');
 raise exception 'FAIL: anon reviewed'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Simulate JWT claims provided by PostgREST, not a service-role bypass.
do $$ begin perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true); end $$;
set local role authenticated;
insert into public.km_access_requests(user_id,kind,purpose) values
 ('10000000-0000-4000-8000-000000000001','individual','Synthetic A request');
do $$ begin
 if (select count(*) from public.km_access_requests) <> 1 then raise exception 'FAIL: own request visibility'; end if;
 if exists(select 1 from public.km_access_requests where user_id='10000000-0000-4000-8000-000000000002') then raise exception 'FAIL: cross-user read'; end if;
 if exists(select 1 from public.km_account_roles) then raise exception 'FAIL: other roles exposed'; end if;
 begin insert into public.km_access_requests(user_id,kind,purpose) values
 ('10000000-0000-4000-8000-000000000003','individual','Forged owner');
 raise exception 'FAIL: forged ownership'; exception when insufficient_privilege then null; end;
 begin insert into public.km_account_roles(user_id,role) values
 ('10000000-0000-4000-8000-000000000001','admin');
 raise exception 'FAIL: self admin'; exception when insufficient_privilege then null; end;
 begin update public.km_access_requests set status='approved';
 raise exception 'FAIL: direct approval'; exception when insufficient_privilege then null; end;
 begin insert into public.km_access_requests(user_id,kind,purpose,status) values
 ('10000000-0000-4000-8000-000000000001','individual','Forged status','approved');
 raise exception 'FAIL: status insert'; exception when insufficient_privilege then null; end;
 begin perform public.km_review_access_request('20000000-0000-4000-8000-000000000002','approved');
 raise exception 'FAIL: ordinary review'; exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ begin perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true); end $$;
set local role authenticated;
do $$ begin
 if not public.km_is_admin() then raise exception 'FAIL: admin role lookup'; end if;
 if (select count(*) from public.km_access_requests where status='pending') <> 2 then raise exception 'FAIL: admin pending list'; end if;
 perform public.km_review_access_request('20000000-0000-4000-8000-000000000002','approved');
 if not exists(select 1 from public.km_access_requests where id='20000000-0000-4000-8000-000000000002' and status='approved') then raise exception 'FAIL: admin approval'; end if;
 begin update public.km_account_roles set role='admin' where user_id='10000000-0000-4000-8000-000000000002';
 raise exception 'FAIL: admin direct role write'; exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ begin perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true); end $$;
set local role authenticated;
do $$ begin
 if (select role from public.km_account_roles) is distinct from 'researcher' then raise exception 'FAIL: approval must grant researcher only'; end if;
 if (select count(*) from public.km_access_requests) <> 1 then raise exception 'FAIL: B sees others'; end if;
 if public.km_is_admin() then raise exception 'FAIL: researcher became admin'; end if;
end $$;
reset role;
rollback;
