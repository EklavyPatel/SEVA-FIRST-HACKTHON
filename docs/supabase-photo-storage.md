# Private crop photos and research — review package

**Status update, 2026-11-04:** the reviewed photo migration was applied to the connected Supabase project as `20261104173655_private_crop_photos`. Both tables have RLS enabled, the bucket is private with JPEG/3 MiB restrictions, and anonymous/unapproved SQL denial checks passed. The backend key is now loaded from private api.env. A live guest save, idempotent retry, private image access, cross-guest denial, sharing withdrawal and physical Storage cleanup passed; authenticated researcher approval/annotation still requires a confirmed approved account. No website was deployed. See [current recovery and deployment steps](research-deployment.md). Existing account setup was preserved.

## Exact resources

| Resource | Name |
| --- | --- |
| Private Storage bucket | `km-crop-photos` |
| Submission/ownership/consent/AI table | `public.km_photo_submissions` |
| Append-only human annotation table | `public.km_photo_annotations` |
| Existing protected account roles | `public.km_account_roles` |
| Existing approval requests | `public.km_access_requests` |
| Research read RPC | `public.km_research_photo_records` |
| Annotation RPC | `public.km_add_photo_annotation` |
| Protected staff predicate | `public.km_photo_staff_role` |

After setup and a successful save, open **Supabase Dashboard → Storage →
km-crop-photos → generated UUID folder → UUID.jpg** to inspect the photo as a
project operator. The associated row is in **Table Editor → km_photo_submissions**;
match its `bucket` and `object_path`. Annotations appear in
`km_photo_annotations`, linked by `photo_id`. No public/signed URL is persisted.
The website's **Research → My contributions** lists the owner's saved photos.

## Consent and upload flow

- Existing upload preparation and the server's `decodeImage` perform real JPEG
  decoding, rotation, flattening and re-encoding, remove EXIF/GPS/ICC/trailing
  content, and bound input dimensions, pixels and size. Saved JPEGs are at most
  1600×1600 and 3 MiB. The bucket independently restricts JPEG MIME and 3 MiB.
- Normal Gemini analysis stays temporary: request/image bytes are held in memory,
  not written to SQLite, Supabase or the cleanup journal. The existing explicit
  consent to sending the photo to Google remains. This describes application
  storage, not a claim about Google's provider retention terms.
- The existing contribution form now has **two separate, unchecked choices**:
  retain this photo/details; optionally share limited crop data with approved
  researchers. Location and all field questions remain optional. Sharing without
  retention is rejected on the backend before any Storage write.
- Save is a separate explicit action after/before analysis. A failed optional
  save leaves the successful guidance visible and shows a saving error. No save
  occurs just from running analysis or viewing research.
- A successful live Gemini analysis supplies an opaque receipt valid for 30
  minutes in this server process. The receipt binds the normalized image hash to
  the server's original validated AI output, configured model and provider
  modelVersion when reported. No image bytes enter the receipt cache. Client
  JSON cannot fabricate AI results or expert labels. Model version is null when
  the provider does not report it; it is never guessed from the model name.
- Analyze before saving to attach the AI output. A save without a verified receipt
  has `ai_status=not_attached`; it does not falsely claim that Gemini ran or
  failed. Restart/expiry clears temporary receipts; rerun analysis or uncheck
  attachment to save without AI. Saving does not trigger another paid AI call.
- `/api/research/me` establishes an HttpOnly, SameSite=Strict guest owner cookie
  before a submission. The UI already performs this handshake. Direct guest
  POST without this session is rejected, preventing owner identity regeneration
  during retries. Only its SHA-256 hash enters `owner_key`; the raw bearer
  credential never enters the database. Preserve browser cookies for retries.
- Confirmed logged-in users are owned by their verified Auth UUID, taken from
  the server session rather than form data. Guest photos remain tied to the
  guest cookie; logging in does not automatically claim/transfer guest photos.
  Log out in the same browser to manage those guest photos. Losing/clearing the
  cookie loses guest self-service access; it grants no access to others.
- The server generates the photo UUID and a separate random UUID folder. No
  original filenames, farmer IDs, emails or location enter object names.

## Research and expert access

Production uses Supabase for the existing research endpoints. The community
feature and historical SQLite records remain local, and there is no silent
SQLite fallback for photo saves. Existing SQLite photos are not automatically
migrated or re-consented. The legacy adapter remains for historical local tests;
`server/index.js` explicitly selects the cloud adapter (or unavailable state).

- Base photo and annotation tables have RLS enabled and no anon/authenticated
  client grants or policies. Guest/owner operations are server-mediated using
  the backend-only elevated key and verified cookie/account ownership.
- Dataset reads and annotations use the **user's JWT**, public API key and narrow
  SECURITY DEFINER RPCs, with an empty search_path. The SQL independently checks
  the current protected role and current consent; a service key is not used to
  authorize a researcher. Local legacy researcher cookies do not authorize cloud
  records. Role revocation takes effect on the next request.
- Existing approvals still grant `researcher`, never admin or expert. The new
  migration permits an operator-assigned `expert` role in the existing protected
  table. Provision expert status only after verifying expertise using trusted
  operator tools; normal signup, approval and metadata cannot self-promote.
- Ordinary approved researchers and admins may add attributed human annotations.
  An annotation is marked `expert_confirmed` only when its author's protected
  role is `expert` and outcome is `labeled`. Admin status alone is not expertise.
  The original AI output is stored separately and never overwritten by a review.
  The UI distinguishes AI suggestions, human research annotations and
  expert-confirmed labels; none is presented as a definitive laboratory diagnosis.
- Research responses exclude ownership keys, Auth IDs, contact fields, object
  paths, exact/coarse coordinates, village/subdistrict and farmer free text.
  The default field projection includes only plant part and structured crop age,
  growth stage, symptom duration/spread, affected percentage, irrigation and
  previous-season enum values. AI crop suggestions and human annotation history
  are included. SQL repeats the projection rather than trusting a JSON blob.
  Own-photo views retain the owner's optional field context. No account email
  or contact list is joined into research queries. Identifying visual content in
  a photo still requires appropriate human screening; metadata stripping does
  not remove faces or writing that is part of the image.
- Existing UI images use a same-origin endpoint that authorizes each request,
  obtains a **60-second** Storage signed URL server-side and proxies the bytes
  with `Cache-Control: no-store`. The optional `/photos/:id/image-link` endpoint
  also authorizes before returning a 60-second link. The bucket stays private.

## Withdrawal and failures

**Keep photo, withdraw research sharing** revokes `research_consent` in the
database first. Subsequent dataset reads, annotations, researcher image requests
and new image links are denied, including to admins. Owner image access remains
while retention is still permitted. **Withdraw my photo** also revokes retention,
marks a tombstone, clears optional private details and AI output, and deletes the
Storage object. Minimal ownership/idempotency/consent audit metadata and human
annotation audit records remain private; they are not part of the dataset.

Already-issued links can remain usable until their original **60-second expiry**;
already-downloaded/exported copies cannot be recalled. Requests authorized before
withdrawal may be in flight. The proxy does not expose permanent image URLs.

Saving uses an owner-scoped unique request UUID and normalized payload hash.
Same-key retries return the existing saved record; changed payloads conflict.
A synchronous UI guard, disabled controls and server in-flight guard prevent
repeated clicks from creating multiple uploads. A database unique constraint
handles concurrent server processes. Request keys are not accepted as ownership.

Before uploading, the backend writes a metadata-only job under
`data/photo-outbox/`. If database insertion fails, it checks for a possibly
committed row (lost-response recovery) and removes an uncommitted object. A failed
delete leaves the durable job for reconciliation. If database connectivity makes
commit status unknowable, the server reports save failure, keeps the job and
avoids deleting a potentially committed photo. Check My contributions before
retrying; the same request key prevents duplicate rows/files.

After reviewed setup, run **`npm run photos:reconcile`** periodically on the same
backend with its durable data directory. It processes jobs older than 15 minutes,
retains objects referenced by a ready record, removes unreferenced/withdrawn
objects, and reports only counters. It never scans/deletes other buckets.
Withdrawal blocks research access immediately even if deletion must be retried.
Preserve the data directory and handle pending cleanup counters operationally.

## Exact setup changes to review before applying

1. Review `supabase/migrations/202611040002_private_crop_photos.sql`. It:
   - adds expert as an allowed protected role (without provisioning anyone);
   - creates the two RLS-enabled tables and three protected RPC/helper functions;
   - grants only elevated server operations on base data and authenticated
     execution of role-checked functions;
   - creates the private `km-crop-photos` bucket with JPEG/3 MiB restrictions;
   - adds four bucket-specific **restrictive** Storage policies denying direct
     client SELECT/INSERT/UPDATE/DELETE, including when unrelated permissive
     policies exist. Other buckets are unaffected; service_role bypass is private.
   The migration deliberately fails rather than modifying an existing same-name
   bucket/table silently. It does not touch existing crop/community data or RLS.
2. On a **fresh disposable local Supabase stack**, with psql installed, run:
   ```sh
   KAPASMITRA_DISPOSABLE_DB=1 npm run test:photos:sql
   ```
   The runner accepts only loopback, applies the existing account migration and
   photo migration, then runs rollback-only fixture tests. It refuses a populated
   public schema/users. Destroy that local stack afterward. If needed, set
   KAPASMITRA_LOCAL_DB_PORT and KAPASMITRA_LOCAL_DB_PASSWORD privately.
3. Only after SQL tests and review, apply **the photo migration only** to the
   intended staging/live project through a trusted operator. The existing
   account migration is already a prerequisite and must not be reapplied there.
   This step was performed for the connected project on 2026-11-04. Do not reapply it there; other environments still need their own reviewed setup.
4. In private backend `api.env`, configure the existing URL/public key plus
   **SUPABASE_SERVICE_ROLE_KEY** with an elevated project secret (`sb_secret_…`)
   or legacy service-role key. Do not put it in a VITE_ variable, browser code,
   screenshots or chat. The example file contains only a blank placeholder.
5. Restart `npm run dev`. Without the elevated configuration, photo storage is
   unavailable and normal guest Gemini analysis remains usable. Verify the
   bucket is private, file restrictions and RPC grants in the dashboard. Keep
   normal Supabase email confirmation enabled and use confirmed test accounts.
6. Reuse the existing account/research approval flow. Optionally provision a
   verified expert as an operator; no expert/admin was created here. Then make
   a controlled staging save, check Storage/Table Editor, exercise own/other-user
   access, expert annotation and both withdrawal actions, and run reconciliation.

## Verification performed and limits

- `npm test`: local HTTP-contract tests mock Supabase Auth, PostgREST, Storage and
  Gemini. Real server routing, cookie/session handling, normalization, image
  decoding/EXIF removal, receipt validation and cleanup journal persistence run.
- Cases include retention accepted/declined, optional sharing declined, guest and
  authenticated ownership, cross-user read/delete denial, unapproved/revoked
  researcher denial, approved researcher/expert/admin access, private DTOs,
  annotations without AI overwrite, model/version capture, failed upload/DB save,
  cleanup failure/recovery, lost commit response, concurrent duplicate/retry,
  malformed/oversized images, withdrawal and new-link denial.
- `npm run test:ui`: existing interface regressions plus a mocked cloud end-to-end
  case: analyze → save fails without losing guidance → retry succeeds → own
  collection → original AI panel → withdraw research sharing.
- `npm run build`: production bundle verification.
- **Original local verification:** no email sends, Storage uploads, user-role provisioning or deployments occurred. The later recovery applied the reviewed schema and private bucket, and verified denial behavior live; successful upload/researcher flows remain unverified. The SQL authorization suite is prepared
  but was **not executed**: psql/PostgreSQL/Docker are absent here, and dependency
  retrieval was blocked by DNS. HTTP mocks do not prove live SQL/RLS execution.
  Actual local/staging SQL tests and a live controlled flow remain setup gates.

Official references: [private buckets and restrictions](https://supabase.com/docs/guides/storage/buckets/fundamentals),
[Storage access control](https://supabase.com/docs/guides/storage/security/access-control),
[short-lived signed URLs](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl).
