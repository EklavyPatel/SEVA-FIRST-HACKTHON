-- Temporary public browsing, served by the backend. Storage remains private.
-- Prior restricted-consent records are NOT republished.
begin;
alter table public.km_photo_submissions add column public_research_consent boolean not null default false;
alter table public.km_photo_submissions drop constraint km_photo_submissions_consent_version_check;
alter table public.km_photo_submissions add constraint km_photo_submissions_consent_version_check check(consent_version in ('cotton-photo-v2','cotton-photo-public-v1'));
alter table public.km_photo_submissions add constraint km_photo_public_consent_check check(not public_research_consent or (research_consent and retention_consent and status='ready' and consent_version='cotton-photo-public-v1'));
create function public.km_public_research_photo_records(photo_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
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
 where p.status='ready' and p.retention_consent and p.research_consent and p.research_withdrawn_at is null and p.public_research_consent and p.consent_version='cotton-photo-public-v1'
 and (photo_id is null or p.id=photo_id)
 ) as records);
end;
$$;
revoke all on function public.km_public_research_photo_records(uuid) from public,anon,authenticated;
grant execute on function public.km_public_research_photo_records(uuid) to service_role;

commit;
