-- Live database permission smoke check. Synthetic fixtures always roll back.
-- Does not test Auth login, email delivery, or Storage HTTP requests.
-- No policies/grants are changed, and existing user data is not modified.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('60000000-0000-4000-8000-000000000001','approval-a@example.invalid',now()),
 ('60000000-0000-4000-8000-000000000002','approval-b@example.invalid',now()),
 ('60000000-0000-4000-8000-000000000003','approval-admin@example.invalid',now());
insert into public.km_account_roles(user_id,role) values('60000000-0000-4000-8000-000000000003','admin');
insert into public.km_photo_submissions(id,owner_key,owner_user_id,request_key,payload_hash,object_path,status,width,height,byte_size,retention_consent,research_consent,consent_version,details,research_details,ai_status) values
 ('61000000-0000-4000-8000-000000000001','u:60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),'62000000-0000-4000-8000-000000000001/61000000-0000-4000-8000-000000000001.jpg','ready',640,480,100,true,true,'cotton-photo-v2','{"contact":"PRIVATE"}','{"plantPart":"leaf","fieldContext":{"village":"PRIVATE","cropAgeDays":60}}','not_attached'),
 ('61000000-0000-4000-8000-000000000002','u:60000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',gen_random_uuid(),repeat('b',64),'62000000-0000-4000-8000-000000000001/61000000-0000-4000-8000-000000000002.jpg','ready',640,480,100,true,false,'cotton-photo-v2','{"contact":"PRIVATE"}','{}','not_attached');
insert into storage.objects(bucket_id,name) values('km-crop-photos','62000000-0000-4000-8000-000000000001/61000000-0000-4000-8000-000000000001.jpg');
set local role anon;
do $$ begin
 begin perform public.km_submit_access_request('individual','A','Institution','Purpose','Use');raise exception 'FAIL anonymous submit';exception when insufficient_privilege then null;end;
 begin perform public.km_bootstrap_admin('60000000-0000-4000-8000-000000000001');raise exception 'FAIL anonymous bootstrap';exception when insufficient_privilege then null;end;
 begin perform public.km_public_research_photo_records(null);raise exception 'FAIL anonymous public RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.km_submit_access_request('individual','Applicant A','Institution A','Purpose A','Use A');
do $$ declare rid uuid; begin
 select id into rid from public.km_access_requests;
 if rid is null then raise exception 'FAIL own application missing';end if;
 if exists(select 1 from public.km_account_roles) then raise exception 'FAIL submit granted role';end if;
 begin perform public.km_submit_access_request('individual','A','I','P','U');raise exception 'FAIL duplicate pending';exception when unique_violation then null;end;
 begin insert into public.km_account_roles values(auth.uid(),'admin');raise exception 'FAIL self promotion';exception when insufficient_privilege then null;end;
 begin update public.km_access_requests set status='approved';raise exception 'FAIL review write';exception when insufficient_privilege then null;end;
 begin insert into public.km_access_requests(user_id,kind,purpose) values(auth.uid(),'individual','Bypass RPC');raise exception 'FAIL direct insert';exception when insufficient_privilege then null;end;
 begin perform public.km_review_access_request(rid,'approved','',1);raise exception 'FAIL applicant reviewed';exception when insufficient_privilege then null;end;
 begin perform public.km_bootstrap_admin(auth.uid());raise exception 'FAIL authenticated bootstrap';exception when insufficient_privilege then null;end;
 begin perform public.km_research_photo_records(null);raise exception 'FAIL unapproved dataset';exception when insufficient_privilege then null;end;
 if (select count(*) from public.km_photo_submissions)<>1 then raise exception 'FAIL owner photo isolation';end if;
 if exists(select 1 from public.km_photo_submissions where owner_user_id<>auth.uid()) then raise exception 'FAIL private cross-user rows';end if;
 if exists(select 1 from storage.objects where bucket_id='km-crop-photos') then raise exception 'FAIL direct storage SELECT';end if;
 begin insert into storage.objects(bucket_id,name) values('km-crop-photos','forged.jpg');raise exception 'FAIL direct storage INSERT';exception when insufficient_privilege then null;end;
 update storage.objects set name='forged.jpg' where bucket_id='km-crop-photos';
 if found then raise exception 'FAIL direct storage UPDATE';end if;
 begin
  delete from storage.objects where bucket_id='km-crop-photos';
  if found then raise exception 'FAIL direct storage DELETE';end if;
 exception when insufficient_privilege then null;end;
 begin perform public.km_withdraw_own_photo('61000000-0000-4000-8000-000000000002',false);raise exception 'FAIL cross-user withdrawal';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.km_access_requests) or exists(select 1 from public.km_access_request_history) then raise exception 'FAIL other user application/history';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ declare rid uuid;begin
 select id into rid from public.km_access_requests where user_id='60000000-0000-4000-8000-000000000001';
 perform public.km_review_access_request(rid,'rejected','Clarify your protocol',1);
 -- Retried identical decision is idempotent, not another history event.
 perform public.km_review_access_request(rid,'rejected','Clarify your protocol',1);
 if (select count(*) from public.km_access_request_history where request_id=rid)<>2 then raise exception 'FAIL duplicate history';end if;
 begin perform public.km_review_access_request(rid,'approved','',1);raise exception 'FAIL conflicting decision';exception when sqlstate 'KM409' then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.km_access_requests where review_reason='Clarify your protocol') then raise exception 'FAIL visible reason';end if;
 perform public.km_submit_access_request('individual','Applicant A edited','Institution A','Purpose edited','Use edited');
 if not exists(select 1 from public.km_access_requests where revision=2 and status='pending') then raise exception 'FAIL resubmit';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ declare rid uuid;begin
 select id into rid from public.km_access_requests where user_id='60000000-0000-4000-8000-000000000001';
 begin perform public.km_review_access_request(rid,'approved','',1);raise exception 'FAIL stale revision';exception when sqlstate 'KM409' then null;end;
 perform public.km_review_access_request(rid,'approved','',2);
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare dataset jsonb;begin
 dataset:=public.km_research_photo_records('61000000-0000-4000-8000-000000000001');
 if jsonb_array_length(dataset)<>1 then raise exception 'FAIL consent filter';end if;
 if dataset::text like '%PRIVATE%' or dataset::text like '%owner_user_id%' or dataset::text like '%object_path%' or dataset::text like '%@%' then raise exception 'FAIL researcher privacy';end if;
 if (select role from public.km_account_roles) is distinct from 'researcher' then raise exception 'FAIL approval role';end if;
 perform public.km_withdraw_own_photo('61000000-0000-4000-8000-000000000001',false);
 if jsonb_array_length(public.km_research_photo_records('61000000-0000-4000-8000-000000000001'))<>0 then raise exception 'FAIL active withdrawal';end if;
end $$;
reset role;
-- Add a self application as a trusted fixture to prove self-review is denied even for admins.
insert into public.km_access_requests(user_id,kind,purpose) values('60000000-0000-4000-8000-000000000003','individual','Self review fixture');
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ declare rid uuid;begin
 select id into rid from public.km_access_requests where user_id=auth.uid();
 begin perform public.km_review_access_request(rid,'approved','',1);raise exception 'FAIL self review';exception when insufficient_privilege then null;end;
 select id into rid from public.km_access_requests where user_id='60000000-0000-4000-8000-000000000001';
 perform public.km_review_access_request(rid,'revoked','Agreement ended',2);
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 begin perform public.km_research_photo_records(null);raise exception 'FAIL revoked dataset';exception when insufficient_privilege then null;end;
 begin perform public.km_add_photo_annotation('61000000-0000-4000-8000-000000000001',null,'inconclusive','','Revoked');raise exception 'FAIL revoked annotation';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.km_account_roles) then raise exception 'FAIL revoked role retained';end if;
 if not exists(select 1 from public.km_access_requests where status='revoked' and review_reason='Agreement ended') then raise exception 'FAIL revoked status';end if;
 if (select count(*) from public.km_access_request_history)<>5 then raise exception 'FAIL history lost';end if;
end $$;
reset role;
rollback;
