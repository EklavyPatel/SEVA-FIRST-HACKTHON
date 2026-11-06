-- Additive upgrade of the existing account flow. Apply after 001, 002 and 003.
begin;
alter table public.km_access_requests add column applicant_name text not null default '' check(length(applicant_name)<=150);
alter table public.km_access_requests add column intended_use text not null default '' check(length(intended_use)<=1500);
alter table public.km_access_requests add column review_reason text not null default '' check(length(review_reason)<=1500);
alter table public.km_access_requests add column revision integer not null default 1 check(revision>0);
alter table public.km_access_requests add column updated_at timestamptz not null default now();
alter table public.km_access_requests drop constraint km_access_requests_status_check;
alter table public.km_access_requests add constraint km_access_requests_status_check check(status in ('pending','approved','rejected','revoked'));
create table public.km_access_request_history (
 id bigint generated always as identity primary key,
 request_id uuid not null references public.km_access_requests(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 revision integer not null,
 event text not null check(event in ('submitted','pending','approved','rejected','revoked')),
 applicant_name text not null, institution text not null, purpose text not null, intended_use text not null,
 reason text not null default '', reviewer_user_id uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create index km_access_history_request on public.km_access_request_history(request_id,id);
alter table public.km_access_request_history enable row level security;
revoke all on public.km_access_request_history from public,anon,authenticated;
revoke all on sequence public.km_access_request_history_id_seq from public,anon,authenticated;
grant select on public.km_access_request_history to authenticated;
create policy km_access_history_read on public.km_access_request_history for select to authenticated
 using(user_id=(select auth.uid()) or (select public.km_is_admin()));
-- Snapshot existing reviews without inventing missing historic details.
insert into public.km_access_request_history(request_id,user_id,revision,event,applicant_name,institution,purpose,intended_use,reason,reviewer_user_id,created_at)
 select id,user_id,revision,status,applicant_name,institution,purpose,intended_use,review_reason,reviewed_by,coalesce(reviewed_at,created_at) from public.km_access_requests;
-- All submission/review changes go through narrow, identity-bound transactions.
revoke insert,update,delete on public.km_access_requests from authenticated;
revoke insert(user_id,kind,institution,purpose) on public.km_access_requests from authenticated;
drop policy km_requests_submit on public.km_access_requests;
create function public.km_submit_access_request(applicant_kind text,applicant_name text,applicant_institution text,applicant_purpose text,applicant_intended_use text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare applicant uuid := auth.uid(); current_request public.km_access_requests;
begin
 if applicant is null or not exists(select 1 from auth.users where id=applicant and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501'; end if;
 if applicant_kind is null or applicant_kind not in ('individual','university') or coalesce(length(btrim(applicant_name)),0) not between 1 and 150
 or coalesce(length(btrim(applicant_institution)),0) not between 1 and 150 or coalesce(length(btrim(applicant_purpose)),0) not between 1 and 1500
 or coalesce(length(btrim(applicant_intended_use)),0) not between 1 and 1500 then raise exception 'Invalid application' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(applicant::text,0));
 select * into current_request from public.km_access_requests where user_id=applicant for update;
 if current_request.status in ('pending','approved') then raise exception 'Application already active' using errcode='23505'; end if;
 if exists(select 1 from public.km_account_roles where user_id=applicant) then raise exception 'Account already approved' using errcode='42501'; end if;
 insert into public.km_access_requests as r(user_id,kind,applicant_name,institution,purpose,intended_use)
 values(applicant,applicant_kind,btrim(applicant_name),btrim(applicant_institution),btrim(applicant_purpose),btrim(applicant_intended_use))
 on conflict(user_id) do update set kind=excluded.kind,applicant_name=excluded.applicant_name,institution=excluded.institution,purpose=excluded.purpose,intended_use=excluded.intended_use,
 status='pending',review_reason='',reviewed_by=null,reviewed_at=null,updated_at=now(),revision=r.revision+1
 returning * into current_request;
 insert into public.km_access_request_history(request_id,user_id,revision,event,applicant_name,institution,purpose,intended_use)
 values(current_request.id,applicant,current_request.revision,'submitted',current_request.applicant_name,current_request.institution,current_request.purpose,current_request.intended_use);
 return jsonb_build_object('id',current_request.id,'revision',current_request.revision,'status','pending');
end;
$$;
revoke all on function public.km_submit_access_request(text,text,text,text,text) from public,anon;
grant execute on function public.km_submit_access_request(text,text,text,text,text) to authenticated;
drop function public.km_review_access_request(uuid,text);
create function public.km_review_access_request(request_id uuid,decision text,review_reason text,expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_request public.km_access_requests; reviewer uuid:=auth.uid(); clean_reason text:=btrim(coalesce(review_reason,''));
begin
 if not public.km_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
 if decision is null or decision not in ('approved','rejected','revoked') or length(clean_reason)>1500 or (decision in ('rejected','revoked') and length(clean_reason)=0) then raise exception 'Decision and reason required' using errcode='22023'; end if;
 select * into current_request from public.km_access_requests where id=request_id for update;
 if not found then raise exception 'Application unavailable' using errcode='KM409'; end if;
 if current_request.user_id=reviewer then raise exception 'Self review forbidden' using errcode='42501'; end if;
 if expected_revision is null or current_request.revision<>expected_revision then raise exception 'Application changed' using errcode='KM409'; end if;
 if current_request.status=decision and current_request.reviewed_by=reviewer and current_request.review_reason=clean_reason then
  return jsonb_build_object('reviewed',true,'alreadyApplied',true);
 end if;
 if not ((current_request.status='pending' and decision in ('approved','rejected')) or (current_request.status='approved' and decision='revoked')) then raise exception 'Decision already made' using errcode='KM409'; end if;
 -- Approval cannot replace an administrator/expert. Revocation removes only the researcher grant.
 if decision='approved' then
  insert into public.km_account_roles(user_id,role) values(current_request.user_id,'researcher') on conflict(user_id) do nothing;
 elsif decision='revoked' then
  if exists(select 1 from public.km_account_roles where user_id=current_request.user_id and role<>'researcher') then raise exception 'Operator managed role cannot be revoked here' using errcode='42501'; end if;
  delete from public.km_account_roles where user_id=current_request.user_id and role='researcher';
 end if;
 update public.km_access_requests set status=decision,review_reason=clean_reason,reviewed_by=reviewer,reviewed_at=now(),updated_at=now() where id=request_id;
 insert into public.km_access_request_history(request_id,user_id,revision,event,applicant_name,institution,purpose,intended_use,reason,reviewer_user_id)
 values(current_request.id,current_request.user_id,current_request.revision,decision,current_request.applicant_name,current_request.institution,current_request.purpose,current_request.intended_use,clean_reason,reviewer);
 return jsonb_build_object('reviewed',true,'issuedLinkMaxSeconds',60);
end;
$$;
revoke all on function public.km_review_access_request(uuid,text,text,integer) from public,anon;
grant execute on function public.km_review_access_request(uuid,text,text,integer) to authenticated;
-- This RPC is callable ONLY by a trusted backend operator, never normal requests.
create table public.km_admin_bootstrap (
 singleton boolean primary key default true check(singleton),
 user_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
alter table public.km_admin_bootstrap enable row level security;
revoke all on public.km_admin_bootstrap from public,anon,authenticated;
create function public.km_bootstrap_admin(target_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing uuid;
begin
 perform pg_advisory_xact_lock(604110623);
 if not exists(select 1 from auth.users where id=target_user_id and lower(email)='eklavypatel23@gmail.com' and email_confirmed_at is not null) then raise exception 'Verified bootstrap user required' using errcode='42501'; end if;
 select user_id into existing from public.km_admin_bootstrap where singleton;
 if existing is not null then
  if existing<>target_user_id then raise exception 'Bootstrap already completed' using errcode='42501'; end if;
  return jsonb_build_object('alreadyCompleted',true,'userId',existing);
 end if;
 if exists(select 1 from public.km_account_roles where role='admin' and user_id<>target_user_id) then raise exception 'Existing administrator: use trusted operator review' using errcode='42501'; end if;
 insert into public.km_account_roles(user_id,role) values(target_user_id,'admin') on conflict(user_id) do update set role='admin';
 insert into public.km_admin_bootstrap(user_id) values(target_user_id);
 return jsonb_build_object('provisioned',true,'userId',target_user_id);
end;
$$;
revoke all on function public.km_bootstrap_admin(uuid) from public,anon,authenticated;
grant execute on function public.km_bootstrap_admin(uuid) to service_role;
-- Disable the former public research path even for the server's elevated key.
create or replace function public.km_public_research_photo_records(photo_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin raise exception 'Approved researcher required' using errcode='42501'; end;
$$;
revoke all on function public.km_public_research_photo_records(uuid) from public,anon,authenticated,service_role;
-- Owner reads/withdrawals now use the user's verified JWT and RLS, not the service key.
grant select on public.km_photo_submissions to authenticated;
create policy km_photo_owner_select on public.km_photo_submissions for select to authenticated using(owner_user_id=(select auth.uid()));
create policy km_photo_owner_guard on public.km_photo_submissions as restrictive for select to authenticated using(owner_user_id=(select auth.uid()));
create function public.km_withdraw_own_photo(submission_id uuid,remove_retention boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare found_photo public.km_photo_submissions;
begin
 select * into found_photo from public.km_photo_submissions where id=submission_id and owner_user_id=(select auth.uid()) and status='ready' for update;
 if not found then raise exception 'Photo unavailable' using errcode='42501'; end if;
 update public.km_photo_submissions set research_consent=false,public_research_consent=false,research_withdrawn_at=now(),
 retention_consent=case when remove_retention then false else retention_consent end,status=case when remove_retention then 'withdrawn' else status end,
 details=case when remove_retention then '{}'::jsonb else details end,research_details=case when remove_retention then '{}'::jsonb else research_details end,
 ai_status=case when remove_retention then 'not_attached' else ai_status end,ai_result=case when remove_retention then null else ai_result end,
 ai_model=case when remove_retention then null else ai_model end,ai_version=case when remove_retention then null else ai_version end where id=submission_id;
 return jsonb_build_object('withdrawn',true);
end;
$$;
revoke all on function public.km_withdraw_own_photo(uuid,boolean) from public,anon;
grant execute on function public.km_withdraw_own_photo(uuid,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
