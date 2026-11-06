-- REVIEW ONLY. Apply to a disposable local Supabase stack first.
-- Prerequisite: 202611040001_account_access.sql. No existing photos are migrated.
begin;
-- Expert authority is operator-provisioned; request approvals still grant researcher only.
alter table public.km_account_roles drop constraint km_account_roles_role_check;
alter table public.km_account_roles add constraint km_account_roles_role_check check(role in ('admin','researcher','expert'));

create table public.km_photo_submissions (
 id uuid primary key,
 owner_key text not null check(owner_key ~ '^(u:[0-9a-f-]{36}|g:[0-9a-f]{64})$'),
 owner_user_id uuid references auth.users(id) on delete restrict,
 request_key uuid not null,
 payload_hash text not null check(length(payload_hash)=64),
 bucket text not null default 'km-crop-photos' check(bucket='km-crop-photos'),
 object_path text not null unique check(object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
 created_at timestamptz not null default now(),
 status text not null check(status in ('ready','withdrawn')),
 width integer not null check(width between 64 and 1600),
 height integer not null check(height between 64 and 1600),
 byte_size integer not null check(byte_size between 20 and 3145728),
 retention_consent boolean not null,
 research_consent boolean not null default false,
 consent_version text not null check(consent_version='cotton-photo-v2'),
 consent_at timestamptz not null default now(),
 research_withdrawn_at timestamptz,
 details jsonb not null default '{}',
 research_details jsonb not null default '{}',
 ai_status text not null check(ai_status in ('completed','not_attached')),
 ai_result jsonb,
 ai_model text,
 ai_version text,
 unique(owner_key,request_key),
 check((owner_user_id is null and owner_key like 'g:%') or (owner_user_id is not null and owner_key='u:'||owner_user_id::text)),
 check(not research_consent or (retention_consent and status='ready' and research_withdrawn_at is null)),
 check((status='ready' and retention_consent) or (status='withdrawn' and not retention_consent and not research_consent)),
 check((ai_status='completed' and ai_result is not null) or (ai_status='not_attached' and ai_result is null))
);
create index km_photo_owner_created on public.km_photo_submissions(owner_key,created_at desc);
create index km_photo_shared_created on public.km_photo_submissions(created_at desc) where status='ready' and research_consent and retention_consent;
create table public.km_photo_annotations (
 id bigint generated always as identity primary key,
 photo_id uuid not null references public.km_photo_submissions(id) on delete cascade,
 reviewer_user_id uuid not null references auth.users(id) on delete restrict,
 reviewer_role text not null check(reviewer_role in ('researcher','expert','admin')),
 outcome text not null check(outcome in ('labeled','inconclusive','unsuitable')),
 label text not null check(length(label)<=150 and (outcome<>'labeled' or length(btrim(label))>0)),
 notes text not null check(length(btrim(notes)) between 1 and 2000),
 expert_confirmed boolean generated always as (reviewer_role='expert' and outcome='labeled') stored,
 created_at timestamptz not null default now()
);
create index km_photo_annotations_photo on public.km_photo_annotations(photo_id,id);
alter table public.km_photo_submissions enable row level security;
alter table public.km_photo_annotations enable row level security;
-- Owner/guest operations are exclusively server-mediated. No direct client writes,
-- no direct base table reads, and no anonymous policy. The service key stays private.
revoke all on public.km_photo_submissions,public.km_photo_annotations from public,anon,authenticated;
revoke all on sequence public.km_photo_annotations_id_seq from public,anon,authenticated;
grant all on public.km_photo_submissions,public.km_photo_annotations to service_role;
grant usage,select on sequence public.km_photo_annotations_id_seq to service_role;

create function public.km_photo_staff_role() returns text language sql stable security definer set search_path='' as $$
 select role from public.km_account_roles where user_id=(select auth.uid()) and role in ('researcher','expert','admin');
$$;
revoke all on function public.km_photo_staff_role() from public,anon;
grant execute on function public.km_photo_staff_role() to authenticated;

-- Only explicit, deidentified columns cross this boundary. No object paths, owner
-- IDs, private details, account email or exact location. All roles rechecked in DB.
create function public.km_research_photo_records(photo_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if public.km_photo_staff_role() is null then raise exception 'Approved researcher required' using errcode='42501'; end if;
 -- A scalar JSON array avoids PostgREST's row cap silently truncating a dataset.
 return (select coalesce(jsonb_agg(records.value order by records.created_at desc,records.id),'[]'::jsonb) from (
 select p.created_at,p.id,jsonb_build_object(
  'id',p.id,'created_at',p.created_at,'width',p.width,'height',p.height,'byte_size',p.byte_size,
  'research_consent',p.research_consent,'retention_consent',p.retention_consent,'consent_version',p.consent_version,
  'research_details',jsonb_build_object('plantPart',p.research_details->'plantPart','district','','symptoms','',
   'fieldContext',jsonb_strip_nulls(jsonb_build_object(
    'cropAgeDays',p.research_details#>'{fieldContext,cropAgeDays}',
    'growthStage',p.research_details#>'{fieldContext,growthStage}',
    'symptomDays',p.research_details#>'{fieldContext,symptomDays}',
    'spread',p.research_details#>'{fieldContext,spread}',
    'affectedPercent',p.research_details#>'{fieldContext,affectedPercent}',
    'irrigation',p.research_details#>'{fieldContext,irrigation}',
    'previousSeason',p.research_details#>'{fieldContext,previousSeason}'))),
  'ai_status',p.ai_status,'ai_result',p.ai_result,'ai_model',p.ai_model,'ai_version',p.ai_version,
  'annotations',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'outcome',a.outcome,'label',a.label,'notes',a.notes,
    'reviewer','Approved '||a.reviewer_role,'institution','Account approved by project administrator',
    'createdAt',a.created_at,'labelKind','human_annotation','expertConfirmed',a.expert_confirmed) order by a.id)
    from public.km_photo_annotations a where a.photo_id=p.id),'[]'::jsonb)) as value
 from public.km_photo_submissions p
 where p.status='ready' and p.retention_consent and p.research_consent and p.research_withdrawn_at is null
 and (photo_id is null or p.id=photo_id)
 ) as records);
end;
$$;
revoke all on function public.km_research_photo_records(uuid) from public,anon;
grant execute on function public.km_research_photo_records(uuid) to authenticated;

create function public.km_add_photo_annotation(submission_id uuid,expected_review_id bigint,review_outcome text,review_label text,review_notes text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare staff_role text; latest_id bigint;
begin
 staff_role:=public.km_photo_staff_role();
 if staff_role is null then raise exception 'Approved researcher required' using errcode='42501'; end if;
 -- Lock submission to serialize concurrent annotations and consent withdrawal.
 perform 1 from public.km_photo_submissions where id=submission_id and status='ready' and retention_consent and research_consent and research_withdrawn_at is null for update;
 if not found then raise exception 'Photo unavailable' using errcode='42501'; end if;
 select max(id) into latest_id from public.km_photo_annotations where photo_id=submission_id;
 if latest_id is distinct from expected_review_id then return jsonb_build_object('conflict',true); end if;
 insert into public.km_photo_annotations(photo_id,reviewer_user_id,reviewer_role,outcome,label,notes)
 values(submission_id,(select auth.uid()),staff_role,review_outcome,review_label,review_notes);
 return jsonb_build_object('saved',true);
end;
$$;
revoke all on function public.km_add_photo_annotation(uuid,bigint,text,text,text) from public,anon;
grant execute on function public.km_add_photo_annotation(uuid,bigint,text,text,text) to authenticated;

-- Private JPEG-only bucket; do not change any existing bucket or broad policies.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('km-crop-photos','km-crop-photos',false,3145728,array['image/jpeg']);
-- Restrictive guards protect this bucket even if another permissive client policy
-- already exists on storage.objects. service_role BYPASSRLS remains server-only.
create policy km_crop_no_direct_select on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'km-crop-photos');
create policy km_crop_no_direct_insert on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'km-crop-photos');
create policy km_crop_no_direct_update on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'km-crop-photos') with check(bucket_id<>'km-crop-photos');
create policy km_crop_no_direct_delete on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'km-crop-photos');
commit;
