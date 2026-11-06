begin;
create table public.km_community_posts (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 160),
 body text not null check(length(btrim(body)) between 1 and 3000),
 alias text not null check(length(btrim(alias)) between 1 and 50),
 created_at timestamptz not null default now(),
 resolved boolean not null default false
);
create table public.km_community_replies (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references public.km_community_posts(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 2000),
 alias text not null check(length(btrim(alias)) between 1 and 50),
 staff boolean not null default false,
 created_at timestamptz not null default now()
);
create index km_community_posts_created on public.km_community_posts(created_at desc,id);
create index km_community_posts_owner on public.km_community_posts(owner_user_id,created_at);
create index km_community_replies_post on public.km_community_replies(post_id,created_at,id);
create index km_community_replies_owner on public.km_community_replies(owner_user_id,created_at);
alter table public.km_community_posts enable row level security;
alter table public.km_community_replies enable row level security;
-- Clients use the identity-bound RPC. It projects display names, never owner IDs.
revoke all on public.km_community_posts,public.km_community_replies from public,anon,authenticated;
grant all on public.km_community_posts,public.km_community_replies to service_role;
create function public.km_community(action text,post_id uuid default null,input jsonb default '{}'::jsonb,search_query text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.km_community_posts; result jsonb; staff_role text;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then
  raise exception 'Confirmed account required' using errcode='42501';
 end if;
 if action is null or action not in ('list','get','post','reply','status','delete') or length(coalesce(search_query,''))>100 then
  raise exception 'Invalid community action' using errcode='22023';
 end if;
 if action in ('post','reply') then
  if input->'shared' is distinct from 'true'::jsonb then raise exception 'Sharing consent required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('community:'||actor::text,0));
  if (select count(*) from public.km_community_posts p where p.owner_user_id=actor and p.created_at>now()-interval '10 minutes')+
     (select count(*) from public.km_community_replies r where r.owner_user_id=actor and r.created_at>now()-interval '10 minutes')>=30 then
   raise exception 'Too many community requests' using errcode='KM429';
  end if;
 end if;
 if action in ('get','reply','status','delete') then
  select * into target from public.km_community_posts p where p.id=post_id for update;
  if not found then raise exception 'Question unavailable' using errcode='KM404'; end if;
 end if;
 if action in ('status','delete') and target.owner_user_id<>actor then
  raise exception 'Only the author can change this question' using errcode='42501';
 end if;
 if action='post' then
  perform pg_advisory_xact_lock(604110624);
  if (select count(*) from public.km_community_posts)>=1000 then raise exception 'Community capacity reached' using errcode='KM507'; end if;
  insert into public.km_community_posts(owner_user_id,title,body,alias)
   values(actor,btrim(input->>'title'),btrim(input->>'body'),btrim(input->>'alias')) returning * into target;
 elsif action='reply' then
  if (select count(*) from public.km_community_replies r where r.post_id=target.id)>=100 then raise exception 'Reply limit reached' using errcode='KM429'; end if;
  staff_role:=public.km_photo_staff_role();
  insert into public.km_community_replies(post_id,owner_user_id,body,alias,staff)
   values(target.id,actor,btrim(input->>'body'),case when staff_role is null then btrim(input->>'alias') else 'Approved '||staff_role end,staff_role is not null);
 elsif action='status' then
  if jsonb_typeof(input->'resolved') is distinct from 'boolean' then raise exception 'Choose a question status' using errcode='22023'; end if;
  update public.km_community_posts p set resolved=(input->>'resolved')::boolean where p.id=target.id;
 elsif action='delete' then
  delete from public.km_community_posts p where p.id=target.id;
  return jsonb_build_object('removed',true);
 end if;
 select coalesce(jsonb_agg(records.value order by records.created_at desc,records.id),'[]'::jsonb) into result from (
  select p.id,p.created_at,jsonb_build_object('id',p.id,'title',p.title,'body',p.body,'alias',p.alias,
   'createdAt',p.created_at,'resolved',p.resolved,'mine',p.owner_user_id=actor,
   'replies',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'alias',r.alias,'staff',r.staff,'createdAt',r.created_at) order by r.created_at,r.id)
    from public.km_community_replies r where r.post_id=p.id),'[]'::jsonb)) as value
  from public.km_community_posts p
  where (action='list' and strpos(lower(p.title||' '||p.body),lower(coalesce(search_query,'')))>0) or (action<>'list' and p.id=target.id)
  order by p.created_at desc,p.id limit 100
 ) records;
 return case when action='list' then jsonb_build_object('posts',result) else jsonb_build_object('post',result->0) end;
end;
$$;
revoke all on function public.km_community(text,uuid,jsonb,text) from public,anon;
grant execute on function public.km_community(text,uuid,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
