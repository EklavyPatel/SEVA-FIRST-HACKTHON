-- REVIEW DRAFT ONLY. Not applied. Run as postgres/migration owner after approval.
begin;

-- Fail rather than revoke privileges on an unrelated preexisting helper schema.
create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.app_role as enum ('farmer', 'expert', 'admin');
create type public.report_status as enum ('pending','analyzed','expert_review','resolved');
create type public.review_status as enum ('confirmed','corrected','inconclusive');
create type public.advisory_status as enum ('draft','published','withdrawn');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(btrim(full_name)) between 1 and 150),
  district text check (char_length(btrim(district)) between 1 and 100),
  village text check (char_length(btrim(village)) between 1 and 150),
  preferred_language text not null default 'gu' check (preferred_language in ('gu','hi','en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deliberately separate from user-editable profiles and JWT user_metadata.
create table public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.app_role not null default 'farmer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crop_reports (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  report_date date not null default current_date,
  symptoms text not null check (char_length(btrim(symptoms)) between 1 and 10000),
  district text not null check (char_length(btrim(district)) between 1 and 100),
  status public.report_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reserve a path before uploading; multiple images per report, immutable evidence.
create table public.report_images (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.crop_reports(id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  created_at timestamptz not null default now(),
  unique (id, report_id),
  check (storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
);

create table public.report_assignments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.crop_reports(id) on delete restrict,
  expert_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= created_at),
  unique (id, report_id, expert_id)
);
create unique index assignments_one_active on public.report_assignments(report_id,expert_id)
  where revoked_at is null;
create index assignments_expert_active on public.report_assignments(expert_id,report_id)
  where revoked_at is null;
create index assignments_assigned_by on public.report_assignments(assigned_by);
-- Partial active indexes do not cover historical foreign-key checks.
create index assignments_report_history on public.report_assignments(report_id);
create index assignments_expert_history on public.report_assignments(expert_id);

create table public.ai_diagnoses (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.crop_reports(id) on delete restrict,
  request_id uuid not null unique, -- backend idempotency key
  model_name text not null check (char_length(btrim(model_name)) between 1 and 200),
  prompt_version text not null check (char_length(btrim(prompt_version)) between 1 and 100),
  visible_symptoms_gu text not null check (char_length(btrim(visible_symptoms_gu)) between 1 and 10000),
  explanation_gu text not null check (char_length(btrim(explanation_gu)) between 1 and 20000),
  uncertainty_level text not null check (uncertainty_level in ('low','medium','high','unknown')),
  uncertainty_reason_gu text not null check (char_length(btrim(uncertainty_reason_gu)) between 1 and 10000),
  requires_expert_review boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id,report_id),
  check (requires_expert_review or uncertainty_level in ('low','medium'))
);
create table public.diagnosis_candidates (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.ai_diagnoses(id) on delete restrict,
  rank smallint not null check (rank between 1 and 20),
  kind text not null check (kind in ('disease','pest','other','unknown')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  confidence numeric(5,4) check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (diagnosis_id,rank)
);
-- Record exactly which immutable photos each inference used.
create table public.diagnosis_images (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.crop_reports(id) on delete restrict,
  diagnosis_id uuid not null,
  image_id uuid not null,
  created_at timestamptz not null default now(),
  unique (diagnosis_id,image_id),
  foreign key (diagnosis_id,report_id) references public.ai_diagnoses(id,report_id) on delete restrict,
  foreign key (image_id,report_id) references public.report_images(id,report_id) on delete restrict
);
create index diagnosis_images_image on public.diagnosis_images(image_id);
create index diagnosis_images_report on public.diagnosis_images(report_id);

-- Submitted reviews are immutable. A correction is another review, never an AI overwrite.
create table public.expert_reviews (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.crop_reports(id) on delete restrict,
  diagnosis_id uuid not null,
  assignment_id uuid not null,
  expert_id uuid not null default auth.uid(),
  status public.review_status not null,
  feedback_gu text not null check (char_length(btrim(feedback_gu)) between 1 and 20000),
  corrected_diagnosis_gu text check (char_length(btrim(corrected_diagnosis_gu)) between 1 and 10000),
  created_at timestamptz not null default now(),
  foreign key (diagnosis_id,report_id) references public.ai_diagnoses(id,report_id) on delete restrict,
  foreign key (assignment_id,report_id,expert_id)
    references public.report_assignments(id,report_id,expert_id) on delete restrict,
  check ((status = 'corrected') = (corrected_diagnosis_gu is not null))
);

create table public.agricultural_advisories (
  id uuid primary key default gen_random_uuid(),
  supersedes_id uuid references public.agricultural_advisories(id) on delete restrict,
  kind text not null check (kind in ('disease','pest')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  symptoms_gu text not null check (char_length(btrim(symptoms_gu)) between 1 and 20000),
  prevention_gu text not null check (char_length(btrim(prevention_gu)) between 1 and 20000),
  next_steps_gu text not null check (char_length(btrim(next_steps_gu)) between 1 and 20000),
  source_title text not null check (char_length(btrim(source_title)) between 1 and 500),
  source_url text not null check (source_url ~ '^https://[^[:space:]]+$'),
  source_verified boolean not null default false,
  reviewer_id uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  status public.advisory_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((reviewer_id is null) = (reviewed_at is null)),
  check (status <> 'published' or (source_verified and reviewer_id is not null and reviewed_at is not null)),
  check (supersedes_id is null or supersedes_id <> id)
);

create index reports_farmer_date on public.crop_reports(farmer_id,created_at desc,id);
create index reports_status_date on public.crop_reports(status,created_at,id);
create index reports_district_date on public.crop_reports(district,report_date desc);
create index images_report on public.report_images(report_id);
create index diagnoses_report_date on public.ai_diagnoses(report_id,created_at desc,id);
create index reviews_report_date on public.expert_reviews(report_id,created_at desc,id);
create index reviews_expert on public.expert_reviews(expert_id);
create index reviews_assignment on public.expert_reviews(assignment_id);
create index reviews_diagnosis_report on public.expert_reviews(diagnosis_id,report_id);
create index advisories_published on public.agricultural_advisories(kind,name) where status='published';
create index advisories_reviewer on public.agricultural_advisories(reviewer_id);
create index advisories_supersedes on public.agricultural_advisories(supersedes_id);

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger roles_touch before update on public.user_roles for each row execute function private.touch_updated_at();
create trigger reports_touch before update on public.crop_reports for each row execute function private.touch_updated_at();
create trigger advisories_touch before update on public.agricultural_advisories for each row execute function private.touch_updated_at();

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id);
  insert into public.user_roles(user_id,role) values (new.id,'farmer');
  return new;
end;
$$;
create trigger kapasmitra_new_user after insert on auth.users
for each row execute function private.handle_new_user();
-- Handles preexisting Auth users if staging differs from the inspected empty project.
insert into public.profiles(id) select id from auth.users on conflict (id) do nothing;
insert into public.user_roles(user_id) select id from public.profiles on conflict (user_id) do nothing;

-- Fail closed even if migration 002 has not yet been applied.
do $$
declare t text;
begin
  foreach t in array array['profiles','user_roles','crop_reports','report_images','report_assignments',
    'ai_diagnoses','diagnosis_candidates','diagnosis_images','expert_reviews','agricultural_advisories'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
  end loop;
end;
$$;
revoke execute on all functions in schema private from public, anon, authenticated;

commit;
