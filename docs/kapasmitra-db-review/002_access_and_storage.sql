-- REVIEW DRAFT ONLY. Apply immediately after 001, before enabling application traffic.
begin;

-- Owned by the trusted migration owner, never by an application role.
-- Fixed search_path, qualified names, no caller-supplied user ID, no dynamic SQL.
create function private.has_role(wanted public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_roles where user_id=(select auth.uid()) and role=wanted);
$$;
create function private.can_read_report(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('admin') or exists (
    select 1 from public.crop_reports r where r.id=target and (
      r.farmer_id=(select auth.uid()) or (
        private.has_role('expert') and exists (
          select 1 from public.report_assignments a
          where a.report_id=r.id and a.expert_id=(select auth.uid()) and a.revoked_at is null
        )
      )
    )
  );
$$;
create function private.can_upload_report(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('farmer') and exists (
    select 1 from public.crop_reports where id=target and farmer_id=(select auth.uid()) and status='pending'
  );
$$;
create function private.can_read_diagnosis(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.ai_diagnoses where id=target and private.can_read_report(report_id));
$$;
create function private.can_review(assignment uuid, target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('expert') and exists (
    select 1 from public.report_assignments a join public.crop_reports r on r.id=a.report_id
    where a.id=assignment and a.report_id=target and a.expert_id=(select auth.uid())
      and a.revoked_at is null and r.status='expert_review'
  );
$$;

-- All role changes are trusted-operator/backend-only. No self-promotion policy exists.
-- Administrators create assignments; experts cannot assign themselves.
create function private.validate_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.user_roles where user_id=new.expert_id and role='expert') then
    raise exception 'Assignee must currently be an expert';
  end if;
  return new;
end;
$$;
create trigger assignment_validate before insert on public.report_assignments
for each row execute function private.validate_assignment();

-- Administrators attest to source verification. This records who attested;
-- it does not claim SQL can verify agricultural accuracy or external URLs.
create function private.stamp_advisory_review() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not private.has_role('admin') then raise exception 'Admin review required'; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'withdrawn' then raise exception 'Withdrawn advisories are immutable'; end if;
    if old.status = 'published' and new.status <> 'withdrawn' then
      raise exception 'A published advisory can only be withdrawn; create a revision for changes';
    end if;
    if old.status = 'published' and new.source_verified is distinct from old.source_verified then
      raise exception 'Published source verification is immutable';
    end if;
    -- Withdrawing a published row must preserve its original reviewer and time.
    if new.source_verified and not old.source_verified then
      new.reviewer_id := auth.uid(); new.reviewed_at := now();
    elsif not new.source_verified then
      new.reviewer_id := null; new.reviewed_at := null;
    else
      new.reviewer_id := old.reviewer_id; new.reviewed_at := old.reviewed_at;
    end if;
  elsif new.source_verified then
    new.reviewer_id := auth.uid(); new.reviewed_at := now();
  else
    new.reviewer_id := null; new.reviewed_at := null;
  end if;
  return new;
end;
$$;
create trigger advisory_review_stamp before insert or update on public.agricultural_advisories
for each row execute function private.stamp_advisory_review();

-- Explicit privileges override permissive project default grants.
do $$
declare t text;
begin
  foreach t in array array['profiles','user_roles','crop_reports','report_images','report_assignments',
    'ai_diagnoses','diagnosis_candidates','diagnosis_images','expert_reviews','agricultural_advisories'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end;
$$;

grant update(full_name,district,village,preferred_language) on public.profiles to authenticated;
grant insert(id,report_date,symptoms,district) on public.crop_reports to authenticated;
grant insert(id,report_id,storage_path,mime_type) on public.report_images to authenticated;
grant insert(report_id,expert_id) on public.report_assignments to authenticated;
grant update(revoked_at) on public.report_assignments to authenticated;
grant insert(report_id,diagnosis_id,assignment_id,status,feedback_gu,corrected_diagnosis_gu)
  on public.expert_reviews to authenticated;
grant insert(supersedes_id,kind,name,symptoms_gu,prevention_gu,next_steps_gu,source_title,source_url,source_verified,status)
  on public.agricultural_advisories to authenticated;
-- Published content is immutable: publish drafts or withdraw them, create a new revision to edit content.
grant update(source_verified,status) on public.agricultural_advisories to authenticated;

create policy profiles_read on public.profiles for select to authenticated
using (id=(select auth.uid()) or private.has_role('admin'));
create policy profiles_edit on public.profiles for update to authenticated
using (id=(select auth.uid())) with check (id=(select auth.uid()));
create policy roles_read on public.user_roles for select to authenticated
using (user_id=(select auth.uid()) or private.has_role('admin'));

create policy reports_read on public.crop_reports for select to authenticated
using (
  farmer_id=(select auth.uid()) or (select private.has_role('admin')) or (
    (select private.has_role('expert')) and id in (
      select a.report_id from public.report_assignments a
      where a.expert_id=(select auth.uid()) and a.revoked_at is null
    )
  )
);
create policy reports_create on public.crop_reports for insert to authenticated
with check (farmer_id=(select auth.uid()) and private.has_role('farmer') and status='pending');
create policy images_read on public.report_images for select to authenticated
using (private.can_read_report(report_id));
create policy images_reserve on public.report_images for insert to authenticated
with check (
  private.can_upload_report(report_id) and storage_path =
    (select auth.uid())::text || '/' || report_id::text || '/' || id::text ||
    case mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' end
);

create policy assignments_read on public.report_assignments for select to authenticated
using (private.has_role('admin') or
  (private.has_role('expert') and expert_id=(select auth.uid()) and revoked_at is null));
create policy assignments_create on public.report_assignments for insert to authenticated
with check (private.has_role('admin') and assigned_by=(select auth.uid()) and revoked_at is null);
create policy assignments_revoke on public.report_assignments for update to authenticated
using (private.has_role('admin') and revoked_at is null)
with check (private.has_role('admin') and revoked_at is not null);

create policy diagnoses_read on public.ai_diagnoses for select to authenticated
using (private.can_read_report(report_id));
create policy candidates_read on public.diagnosis_candidates for select to authenticated
using (private.can_read_diagnosis(diagnosis_id));
create policy diagnosis_images_read on public.diagnosis_images for select to authenticated
using (private.can_read_diagnosis(diagnosis_id));
create policy reviews_read on public.expert_reviews for select to authenticated
using (private.can_read_report(report_id));
create policy reviews_submit on public.expert_reviews for insert to authenticated
with check (expert_id=(select auth.uid()) and private.can_review(assignment_id,report_id));

create policy advisories_read on public.agricultural_advisories for select to authenticated
using (status='published' or private.has_role('admin'));
create policy advisories_create on public.agricultural_advisories for insert to authenticated
with check (private.has_role('admin'));
create policy advisories_status on public.agricultural_advisories for update to authenticated
using (private.has_role('admin')) with check (private.has_role('admin'));

-- Private helper schema must NOT be exposed through the Data API.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(public.app_role), private.can_read_report(uuid),
  private.can_upload_report(uuid), private.can_read_diagnosis(uuid), private.can_review(uuid,uuid)
  to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('crop-photos','crop-photos',false,10485760,array['image/jpeg','image/png','image/webp']);

-- An unrelated permissive policy could OR around the policies below. Fail closed
-- if this initial migration is applied to a different, already-configured project.
do $$
begin
  if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then
    raise exception 'storage.objects must already have RLS enabled';
  end if;
  if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects') then
    raise exception 'Review existing storage.objects policies before installing KapasMitra policies';
  end if;
end;
$$;

-- No public reads, overwrites, upserts, client deletes, or client moves.
-- Exact registered paths, rather than folder ownership alone, control access.
create policy crop_photos_read on storage.objects for select to authenticated
using (bucket_id='crop-photos' and exists (
  select 1 from public.report_images i where i.storage_path=storage.objects.name and private.can_read_report(i.report_id)
));
create policy crop_photos_upload on storage.objects for insert to authenticated
with check (bucket_id='crop-photos' and exists (
  select 1 from public.report_images i where i.storage_path=storage.objects.name and private.can_upload_report(i.report_id)
));

commit;
