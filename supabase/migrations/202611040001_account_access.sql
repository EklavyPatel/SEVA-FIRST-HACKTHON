-- REVIEW ONLY: apply to staging first. This adds account approval tables only;
-- existing crop photos/community remain in the local SQLite adapter.
begin;
create table public.km_account_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('admin','researcher'))
);
create table public.km_access_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 kind text not null check (kind in ('individual','university')),
 institution text not null default '' check (length(institution)<=150),
 purpose text not null check (length(btrim(purpose)) between 1 and 1500),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id)
);
alter table public.km_account_roles enable row level security;
alter table public.km_access_requests enable row level security;
revoke all on public.km_account_roles,public.km_access_requests from public,anon,authenticated;
grant select on public.km_account_roles,public.km_access_requests to authenticated;
grant insert(user_id,kind,institution,purpose) on public.km_access_requests to authenticated;

-- Fixed search_path; role rows are writable only by trusted migration operators.
create function public.km_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.km_account_roles where user_id=(select auth.uid()) and role='admin');
$$;
revoke all on function public.km_is_admin() from public,anon;
grant execute on function public.km_is_admin() to authenticated;
create policy km_roles_read_self on public.km_account_roles for select to authenticated
 using(user_id=(select auth.uid()));
create policy km_requests_read on public.km_access_requests for select to authenticated
 using(user_id=(select auth.uid()) or (select public.km_is_admin()));
create policy km_requests_submit on public.km_access_requests for insert to authenticated
 with check(user_id=(select auth.uid()) and status='pending' and reviewed_at is null and reviewed_by is null
  and (kind<>'university' or length(btrim(institution))>0));

create function public.km_review_access_request(request_id uuid,decision text) returns void
language plpgsql security definer set search_path='' as $$
declare applicant uuid;
begin
 if not public.km_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if decision not in ('approved','rejected') or decision is null then raise exception 'Invalid decision'; end if;
 update public.km_access_requests set status=decision,reviewed_at=now(),reviewed_by=(select auth.uid())
 where id=request_id and status='pending' returning user_id into applicant;
 if applicant is null then raise exception 'Pending request unavailable'; end if;
 if decision='approved' then
  insert into public.km_account_roles(user_id,role) values(applicant,'researcher')
  on conflict(user_id) do nothing; -- approval cannot overwrite an administrator
 end if;
end;
$$;
revoke all on function public.km_review_access_request(uuid,text) from public,anon;
grant execute on function public.km_review_access_request(uuid,text) to authenticated;
commit;
