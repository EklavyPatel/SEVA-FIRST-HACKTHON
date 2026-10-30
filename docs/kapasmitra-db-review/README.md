# KapasMitra AI database proposal — review only

No remote changes have been made. Neither migration has been executed locally or remotely.
The technical/security review and local validation limitations are recorded in `REVIEW.md`.

## Inspection

The connected project reference is `kjlywmqsgkfiqciqwklt`. The MCP tools do not expose its display name.
Fresh inspection found no `public` tables, no policies in `public` or `storage`, no Storage buckets,
and zero Auth users. Existing Storage tables already have RLS enabled. The security advisor
returned no findings. The connection uses `supabase_read_only_user` with transaction read-only on.
Earlier connection inspection also confirmed MCP `read_only=true`.

## Implementation plan

1. Review these two SQL files and the backend contract below. No agricultural content is seeded.
2. After approval, apply `001_schema.sql`, then `002_access_and_storage.sql` in a local Supabase
   stack or staging project using the trusted migration owner. Migration 001 denies client access
   until 002 installs the policies. These are versioned, one-time migrations, not rerunnable scripts.
3. Run the authorization and lifecycle acceptance checks below with real Auth sessions.
4. Provision the first administrator through a trusted operator, then integrate Auth, Storage,
   a server-side Gemini worker, and privileged administrative endpoints.
5. Apply reviewed migrations to production only after staging validation; recheck existing policies
   and advisors immediately beforehand. Keep the private schema out of Data API exposed schemas.

## Data model

| Table | Purpose |
| --- | --- |
| profiles | Auth-linked identity, optional onboarding fields, language defaults to Gujarati (`gu`) |
| user_roles | One protected farmer/expert/admin role per identity |
| crop_reports | Farmer-owned cotton reports with date, district snapshot, symptoms, workflow status |
| report_images | One or more immutable photograph paths per report |
| report_assignments | Admin-created expert assignments, revocation retained for history |
| ai_diagnoses | Versioned Gemini output, Gujarati explanation, uncertainty and review requirement |
| diagnosis_candidates | Ranked possible pests/diseases; nullable model confidence |
| diagnosis_images | Exact images used for each inference |
| expert_reviews | Immutable submitted feedback, confirmed/corrected/inconclusive status |
| agricultural_advisories | Gujarati content, verified-source attestation, reviewer/date, revision link |

All primary keys are UUIDs. `profiles.id` and `user_roles.user_id` share the Auth user's UUID;
other primary keys default to `gen_random_uuid()`. All records have creation timestamps;
mutable records also have update timestamps. Assignment revocation and advisory reviews have
their own timestamps. Foreign keys use RESTRICT for evidence/history and CASCADE only for
Auth -> profile -> role. Consequently, deleting an Auth user with retained reports/reviews is
blocked: implement retention/anonymization and Storage cleanup before offering account deletion.

Separate image rows support multiple photos without PostgreSQL arrays of paths. Object paths are
`<farmer_uuid>/<report_uuid>/<image_uuid>.<jpg|png|webp>` inside `crop-photos`, never public URLs.
The report's district is a historical snapshot, independent of later profile changes.
Districts/villages currently use bounded text; introduce curated geographic identifiers before
district-based analytics requires canonical spellings. Language codes are an initial supported list.

## Authorization matrix

| Resource / operation | Farmer | Expert | Admin | Trusted backend |
| --- | --- | --- | --- | --- |
| Own profile and role | Read; edit profile fields only | Same | Same; read all profiles/roles | Provision/manage roles |
| Reports and related results | Own only | Active assigned reports only | Read all | Lifecycle writes |
| New report/image reservation/upload | Own, initially pending | Denied | Denied as client | Validated maintenance |
| Assign/revoke expert | Denied | Denied | Allowed | Allowed |
| AI diagnosis/candidates/evidence writes | Denied | Denied | Denied as client | Allowed |
| Submit final review | Denied | Own active assignment, report in expert_review | Denied as client | Controlled maintenance |
| Read advisories | Published only | Published only | All | All |
| Create advisory / verify draft / publish / withdraw | Denied | Denied | Allowed | Use admin JWT for review attestation |
| Role change, report status, delete, overwrite | Denied | Denied | Through protected backend only | Explicitly authorized operations |

An owner retains access to their historical reports after a role change. Expert assignment access
also checks the current database role: demotion removes access immediately without waiting for JWT
refresh. A revoked expert loses access to that report's rows/photos, including their old reviews,
unless they also own the report. Active assigned experts see the report's full diagnostic and review
history but not the farmer's private profile. Administrators have deliberate global read access.

No anonymous table access is granted. Supabase publishable keys plus authenticated user JWTs are
used in the browser. Database roles are the source of truth, never editable `user_metadata`.
RLS helpers are narrowly scoped SECURITY DEFINER functions owned by the migration owner,
with empty search paths and no user-ID parameter that a caller could impersonate.

First-admin bootstrap and later role changes require a trusted operator or protected backend;
there is intentionally no general role-writing client policy or RPC. For example, after validating
an actual Auth identity, a trusted operator can execute this parameterized statement:

```sql
-- Operational example only, NOT a migration or an instruction to execute now.
update public.user_roles set role = 'admin' where user_id = $1::uuid;
```

Administrative backend endpoints must verify the caller's Auth JWT and query their current role
before using elevated credentials. Ignore caller-supplied actor IDs. Require a current admin for
role changes and administrative status changes; record actor, target, old/new values and reason
in the production administrative audit log. Do not allow an admin to remove the last active admin.
The migrations retain assignment/review/advisory provenance; a general administrative audit log
and last-admin guard are backend integration requirements, not implemented by these migrations.

## Backend workflow contract

These migrations implement storage and access control. They do not deploy a Gemini worker or
automatically transition reports in response to reviews. Status writes are backend-only:

1. The farmer creates a pending report and image reservations, then uploads each object using
   `upsert: false`. SQL column grants prevent forging ownership, status, actor IDs or timestamps.
   Pending here includes the upload/inference queue; no separate processing status is introduced.
2. The worker authenticates and authorizes the request, locks the report (`FOR UPDATE`) and uses
   an inference idempotency key. It fetches registered images through Storage and validates actual
   bytes, size, dimensions, decoding, and MIME type. Bucket MIME settings are not byte validation.
   Strip EXIF/location metadata through the trusted upload/processing pipeline before Gemini use.
   Use timeouts, per-user rate limits, upload quotas and retry/backoff outside PostgreSQL.
3. Call Gemini outside a long-running SQL transaction. Treat all model output as untrusted data,
   validate its structure and size, and do not turn it into verified advisory content. Store the
   actual model identifier and application prompt version. Confidence is optional and represents
   a model estimate, not a calibrated probability or a guarantee of diagnostic accuracy.
4. In one transaction, lock the report again, confirm it is still eligible, insert diagnosis,
   ranked candidates and exact input-image links, and update status to `analyzed` or `expert_review`.
   `requires_expert_review` defaults true; only an explicitly approved application rule may disable
   it for low/medium uncertainty. A database check always requires review for high/unknown uncertainty.
   Low-confidence results route to expert review under backend rules. No automatic diagnostic threshold is
   invented here. Retry with the same request UUID must not duplicate records.
5. An admin assigns an expert. Only a current expert with an unrevoked assignment may insert
   a final review, against a diagnosis from that same report. Draft reviews are not stored. The
   backend processes submitted reviews under a report lock; inconclusive results remain in review.
   Resolution requires an explicit decision referencing the latest applicable diagnosis and review.
   A new inference after resolution reopens the workflow under backend rules.
6. Expert-review progress is derived from the diagnosis's `requires_expert_review`, its submitted
   reviews and report workflow status. The backend must decide how conflicting/multiple reviews
   are adjudicated; do not equate “a review exists” with “safe to resolve”. `expert_reviews.status`
   records the review outcome, not the overall report state.

An image reservation alone does not prove the file exists: cross-service foreign keys and atomic
DB+Storage commits are unavailable. Verify objects before analysis and clean abandoned reservations
and orphan uploads with a scheduled backend task. Snapshot input IDs before Gemini; immutable paths
prevent replacement, and `diagnosis_images` preserves exactly which images were analyzed. Additional
late uploads to a pending report must not silently become evidence for an earlier inference.

## Storage design

Private `crop-photos` bucket, 10 MiB maximum per image, JPEG/PNG/WebP only. No client UPDATE or
DELETE policies means no overwrites, upserts, moves, or direct evidence deletion. Upload INSERT
requires an exact pre-registered path belonging to a pending report owned by the farmer. SELECT
checks the report's current access, including expert assignments. The browser does not manage
buckets. Never delete object metadata through SQL: trusted retention tasks use the Storage API
before coordinated relational cleanup.

Prefer authenticated downloads for rapid revocation. If signed URLs are needed, issue short-lived
URLs (for example 60 seconds), never persist them in tables, and treat them as bearer credentials.
Previously issued signed URLs remain usable until expiry after assignment revocation; previously
downloaded bytes cannot be revoked. Keep privileged Storage/Gemini credentials only in server-side
secrets. Do not expose service-role or secret keys in frontend code, URLs, migrations, or logs.

No preexisting storage policies were found. PostgreSQL permissive policies combine with OR, so
audit any future policies to ensure a broad policy does not bypass this bucket's restrictions.
Migration 002 fails if any object policies already exist or object RLS is disabled; reconcile such
policies explicitly before deployment. Keep both `private` and the managed `storage` schema out of
the exposed Data API schemas. The Storage service, rather than REST table writes, handles objects.

Worker rate limits alone do not protect direct browser writes to the database and Storage API.
For a public launch, add a quota enforced at the database/upload boundary or require uploads through
a protected backend, plus signup abuse controls. The current SQL has a per-file limit, not per-user
or per-report storage quotas. An invite-only hackathon demo is the appropriate initial deployment.

## Advisory review

No pest names, treatment instructions, pesticides, doses, or sources are seeded. Administrators
must obtain actual source material and verify it before setting `source_verified`. The review
trigger records the authenticated administrator and database time; a URL format check is not
verification of credibility. Published rows require source verification and a reviewer/date.
Content is immutable through the client: create a linked revision and withdraw the prior version
when replacing it. Draft content can also be replaced by a new row. Only source verification and
status are client-updatable; verification can change only while a row is a draft. A verified draft
can be published. A published row can only be withdrawn, retaining its original reviewer and review
time. Withdrawn rows are terminal: publish a new revision instead of reviving stale content.
Experts may supply report reviews, but cannot publish advisory content under this initial policy.

## Validation before deployment

No PostgreSQL/Supabase runtime is installed in this workspace; SQL has received static review only.
Dependency acquisition was also unavailable because the local network DNS check failed. Do not
treat these files as execution-tested. A reusable, loopback-only runner and SQL authorization test
suite are provided under `tests/`. On a fresh disposable local Supabase stack, with `psql` installed:

```bash
KAPASMITRA_LOCAL_DISPOSABLE=1 python3 docs/kapasmitra-db-review/tests/run_local.py
```

The runner uses `127.0.0.1:54322` (override port with `KAPASMITRA_LOCAL_DB_PORT`) and default local
credentials. It never accepts a remote database URL. Use a direct local port, without forwarding
to a remote database. Migrations remain in that disposable database; synthetic fixtures roll back.
The tests emulate JWT claims and SQL roles; they do not test Auth's HTTP token verification or
upload/download bytes through the Storage service. A failing SQL run disconnects and rolls back
the test transaction. If migration 001 succeeded but 002 failed, reset the disposable stack before retrying.

Follow with integration tests using two farmers, two experts and an admin with actual Auth sessions:

- Signup creates exactly one profile and a farmer role; metadata claiming admin is ignored.
- Farmer A cannot read farmer B's report, images, candidates, evidence or reviews by guessing UUIDs.
- Profile edits cannot update role, IDs or timestamps. Report INSERT cannot forge status/owner.
- Expert A sees only active assignments, cannot self-assign or submit as Expert B, and cannot
  review a diagnosis from a different report or use an inactive assignment.
- Assignment revocation and role demotion remove expert row and authenticated-image access.
- Admin reads work; farmers cannot insert assignments or unpublished advisory rows.
- Advisory publication without verified source fails; reviewer spoofing and content UPDATE fail.
- Correct upload succeeds. Foreign/unregistered paths, public reads, overwrite, move, wrong MIME
  and oversize upload fail. Uploaded MIME is independently validated by the backend.
- Duplicate inference requests fail safely; cross-report diagnosis-image links fail; inference and
  review races do not silently resolve a stale diagnosis. Test abandoned/late uploads and retry paths.
- No anonymous table access, no direct client AI writes, no client deletion. Service-role access is
  separately tested through authorized backend endpoints because it bypasses RLS by design.
- Test Auth deletion restrictions, cleanup ordering and rollback of a failing signup trigger.
- Inspect `pg_policies`, grants, advisor findings and EXPLAIN plans with realistic report volumes.
  Use keyset pagination on `(created_at,id)` for report and diagnosis history; no early partitioning.

## References

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage private bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase functions and execution grants](https://supabase.com/docs/guides/database/functions)
- [Supabase Auth user data and signup triggers](https://supabase.com/docs/guides/auth/managing-user-data)

Private-bucket download and signed-URL behavior was checked against Supabase's connected documentation
search. The inspection results above came directly from read-only MCP queries, not assumptions.
