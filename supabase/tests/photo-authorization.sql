-- DISPOSABLE LOCAL DATABASE ONLY. Fixtures and any test policies roll back.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('10000000-0000-4000-8000-000000000001','photo-a@example.invalid',now()),
 ('10000000-0000-4000-8000-000000000002','photo-b@example.invalid',now()),
 ('10000000-0000-4000-8000-000000000003','photo-researcher@example.invalid',now()),
 ('10000000-0000-4000-8000-000000000004','photo-expert@example.invalid',now()),
 ('10000000-0000-4000-8000-000000000005','photo-admin@example.invalid',now());
insert into public.km_account_roles values
 ('10000000-0000-4000-8000-000000000003','researcher'),
 ('10000000-0000-4000-8000-000000000004','expert'),
 ('10000000-0000-4000-8000-000000000005','admin');
insert into public.km_photo_submissions(id,owner_key,owner_user_id,request_key,payload_hash,object_path,status,width,height,byte_size,retention_consent,research_consent,consent_version,details,research_details,ai_status,ai_result,ai_model) values
 ('20000000-0000-4000-8000-000000000001','u:10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',repeat('a',64),'40000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg','ready',640,480,100,true,true,'cotton-photo-v2','{"contact":"PRIVATE","coordinates":"PRIVATE"}','{"plantPart":"leaf","fieldContext":{"cropAgeDays":60,"village":"PRIVATE","coordinates":"PRIVATE"}}','completed','{"suggestions":["AI ONLY"]}','fixture'),
 ('20000000-0000-4000-8000-000000000002','u:10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',repeat('b',64),'40000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002.jpg','ready',640,480,100,true,false,'cotton-photo-v2','{}','{"plantPart":"leaf","fieldContext":{}}','not_attached',null,null);
insert into storage.objects(bucket_id,name) values('km-crop-photos','40000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg');
-- Ensure restrictive guards defeat an unrelated permissive client policy.
grant select on storage.objects to authenticated;
create policy km_photo_test_permissive on storage.objects for select to authenticated using(true);

set local role anon;
do $$ begin
 begin perform 1 from public.km_photo_submissions;raise exception 'FAIL anon base read';exception when insufficient_privilege then null;end;
 begin perform public.km_research_photo_records(null);raise exception 'FAIL anon RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;

do $$ begin perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);end $$;
set local role authenticated;
do $$ begin
 begin perform public.km_research_photo_records(null);raise exception 'FAIL unapproved RPC';exception when insufficient_privilege then null;end;
 begin perform 1 from public.km_photo_submissions;raise exception 'FAIL direct cross-user read';exception when insufficient_privilege then null;end;
 begin insert into public.km_account_roles values('10000000-0000-4000-8000-000000000002','admin');raise exception 'FAIL self admin';exception when insufficient_privilege then null;end;
end $$;
reset role;

do $$ begin perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);end $$;
set local role authenticated;
do $$ declare record jsonb;begin
 if jsonb_array_length(public.km_research_photo_records(null))<>1 then raise exception 'FAIL shared dataset';end if;
 record:=public.km_research_photo_records('20000000-0000-4000-8000-000000000001')->0;
 if record::text like '%PRIVATE%' or record ? 'owner_key' or record ? 'owner_user_id' or record ? 'object_path' then raise exception 'FAIL privacy projection';end if;
 if exists(select 1 from storage.objects where bucket_id='km-crop-photos') then raise exception 'FAIL private storage direct read';end if;
 perform public.km_add_photo_annotation('20000000-0000-4000-8000-000000000001',null,'inconclusive','','Need more evidence');
 record:=public.km_add_photo_annotation('20000000-0000-4000-8000-000000000001',null,'labeled','Stale','Test');
 if record->>'conflict' is distinct from 'true' then raise exception 'FAIL stale annotation';end if;
 begin update public.km_photo_submissions set research_consent=true;raise exception 'FAIL direct consent update';exception when insufficient_privilege then null;end;
end $$;
reset role;

do $$ begin perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}',true);end $$;
set local role authenticated;
do $$ declare latest bigint;record jsonb;begin
 select (records.value->'annotations'->0->>'id')::bigint into latest from jsonb_array_elements(public.km_research_photo_records('20000000-0000-4000-8000-000000000001')) as records(value);
 perform public.km_add_photo_annotation('20000000-0000-4000-8000-000000000001',latest,'labeled','Expert label','Expert evidence');
 record:=public.km_research_photo_records('20000000-0000-4000-8000-000000000001')->0;
 if record#>>'{annotations,1,expertConfirmed}' is distinct from 'true' then raise exception 'FAIL expert provenance';end if;
 if record#>>'{ai_result,suggestions,0}' is distinct from 'AI ONLY' then raise exception 'FAIL AI overwritten';end if;
end $$;
reset role;

do $$ begin perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}',true);end $$;
set local role authenticated;
do $$ begin
 if jsonb_array_length(public.km_research_photo_records(null))<>1 then raise exception 'FAIL admin dataset';end if;
 if jsonb_array_length(public.km_research_photo_records('20000000-0000-4000-8000-000000000002'))>0 then raise exception 'FAIL admin bypassed consent';end if;
end $$;
reset role;

update public.km_photo_submissions set research_consent=false,research_withdrawn_at=now() where id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if jsonb_array_length(public.km_research_photo_records(null))>0 then raise exception 'FAIL withdrawn access';end if;
 begin perform public.km_add_photo_annotation('20000000-0000-4000-8000-000000000001',null,'labeled','Forbidden','Withdrawn');raise exception 'FAIL withdrawn annotation';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
