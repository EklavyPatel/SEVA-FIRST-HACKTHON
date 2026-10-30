# Technical and security review

## Decision

The revised migrations are ready for **disposable local/staging execution and integration testing**.
They are **not yet cleared for remote application or public production use**: there was no PostgreSQL
runtime available to validate SQL execution, and Auth/Storage HTTP integration remains untested.
No remote queries, migrations, or configuration changes were made during this review.

## Findings fixed locally

| Severity | Original issue | Change |
| --- | --- | --- |
| Medium | Updating a verified advisory's status rewrote its reviewer and review date, falsely attributing the original verification to the withdrawing administrator. | Preserve original attribution on status changes; stamp only initial verification. |
| Medium | Unverified drafts could never become verified through the allowed client grants. | Allow an admin to update source verification while a row is a draft; database CHECK still blocks unverified publication. |
| Medium | Previously withdrawn content could be republished without a new review/version. | Published rows can only be withdrawn; withdrawn rows are terminal. |
| Medium | Diagnosis/image report equality depended on an invoker trigger and mutable referenced rows. A subsequent parent UPDATE could invalidate the relation. | Replace the trigger with two composite foreign keys through an explicit report ID, including the required referenced unique key. PostgreSQL enforces INSERT, UPDATE and parent changes. |
| Medium | Reusing an unrelated `private` schema could revoke its existing privileges and functions. | Initial migration now requires a newly created schema; existing schema causes a safe transaction failure. |
| Medium | Additional permissive Storage policies could bypass the intended bucket policies. | Migration 002 fails if object RLS is disabled or preexisting object policies exist. Future policy changes still require review. |
| Low | Assignment partial indexes excluded revoked history from FK lookups. | Add full report/expert FK indexes, retaining the active-assignment indexes. |
| Low | Row-specific opaque report helper hid the ownership predicate from the root report query planner. | Root report SELECT policy now exposes farmer ownership and an assignment subquery, with statement-level role checks. Query plans still need runtime measurement. |
| Low | Image path regex allowed malformed UUID-shaped strings; Storage policy column reference was implicit. | Enforce canonical UUID path shape; qualify `storage.objects.name` explicitly. Client RLS still requires exact owner/report/image path equality. |
| Low | A high/unknown uncertainty diagnosis could disable expert review. | Add a database CHECK requiring expert review for those uncertainty levels. No confidence threshold or advisory content is invented. |

## Review of the requested areas

1. **Relationships/FKs:** Auth users reference only the stable primary key `auth.users.id`.
   Profile and role IDs are shared UUIDs. Reviews use composite FKs that bind diagnosis/report and
   assignment/report/expert together; an assigned expert cannot review another report accidentally.
   Diagnosis evidence now uses composite FKs rather than a trigger. RESTRICT protects diagnostic
   history. Auth deletion intentionally fails when retained report, assignment, review or advisory
   dependencies exist. A retention/anonymization workflow is required before account deletion.
2. **RLS:** All ten application tables enable RLS and revoke default client privileges, even before
   migration 002. Policies are explicitly `TO authenticated`. Column grants prevent writing owner,
   role, timestamp, report status and review actor fields. Service-role and trusted table owners
   bypass RLS by design; they are never suitable credentials for browser clients. FORCE RLS is not
   enabled: the tightly scoped owner-defined helpers need access without recursive RLS evaluation.
3. **Farmer isolation:** Clients can insert pending reports only for themselves, reserve paths only
   on their pending reports, and read only owned report results/evidence/reviews. There is no public
   report discovery. A farmer cannot update a report to change ownership or status. Default UUIDs
   are unpredictable, but access control does not depend on UUID secrecy. An owner retains access
   after their role changes; this is an explicit historical-ownership rule.
4. **Experts/escalation:** Roles are separate from profile fields and JWT user metadata. Signup
   always grants farmer. No client INSERT/UPDATE/DELETE permission exists on user_roles. Experts
   cannot self-assign, provision roles or write AI outputs. Active assignment and current expert role
   are checked; revocation/demotion affects subsequent statements without waiting for token refresh.
   Experts can insert final reviews only while the report is in expert_review and cannot impersonate
   another expert. They see assigned report history but do not receive private farmer profiles.
5. **Images:** Bucket is private; exact registered paths determine SELECT/INSERT permission.
   There are no client UPDATE/DELETE policies. Per-file size and MIME allowlists are present.
   Neither registration nor SQL metadata proves the bytes exist or are safe; actual decoding,
   EXIF removal and MIME validation belong to the upload/processing pipeline. Signed URLs have
   expiry-based revocation, not immediate revocation. Already-downloaded bytes cannot be revoked.
6. **Syntax/dependencies:** Both migrations are transactional, ordered and one-time. Migration 001
   creates all types/tables/trigger dependencies; migration 002 creates RLS helpers and policies.
   Composite FK targets have matching unique keys. Function/trigger declarations and column grants
   were reviewed manually, and lexical delimiter/quote/transaction checks passed. This is **not**
   PostgreSQL grammar or execution validation. A trusted Supabase migration owner is required to
   create the Auth trigger and Storage policies. Run 001 then 002 with stop-on-error enabled.
7. **Auth:** The SECURITY DEFINER signup trigger uses an empty search_path and qualified names,
   ignores user-controlled metadata for roles, and backfills existing users without changing their
   roles. Auth signup trigger failures abort signup, so actual GoTrue signup must be tested. Current
   profile fields allow incomplete onboarding; Gujarati is the default supported language.
8. **Constraints/indexes:** Required text is bounded, probabilities are nullable but constrained,
   statuses/kinds are constrained, rank is positive and unique within an inference, and corrected
   reviews require a correction. All FK lookup paths have a supporting leading-column index; some
   composite FKs use a selective first-column index rather than indexing all redundant columns.
   Active assignments are unique per report/expert. No premature partitioning or broad JSON payloads
   are introduced. Report dates are supplied by the farmer; the application must validate dates if
   future or historical dates are restricted by product requirements.
9. **Other security:** Helpers use qualified names, fixed empty search paths, explicit execution
   grants and the current authenticated user. Keep the private schema outside Data API exposure.
   Administrative service-role endpoints must authenticate their caller, check the current database
   role, and audit changes. Frontend renderers must treat model output and user symptoms as untrusted
   text. Source URLs are provenance, not proof of correctness and not instructions to fetch arbitrary
   URLs from privileged infrastructure. No agricultural content or credentials are included.
10. **MVP complexity:** Ten tables are more than the absolute minimum, but they directly support
    the requested privacy and review model. Profiles/roles separation and explicit assignments are
    worth retaining. Image/candidate/evidence tables add joins but prevent ambiguous arrays and retain
    exact inference inputs. Keep them unless the product explicitly drops multiple images or
    inference history. Avoid adding geography catalogs, role hierarchies, workflow engines or
    partitioning for the demo. Administrative auditing and advanced retention can remain backend
    integration work for an invite-only demo, but must not be silently assumed to exist.

## Validation performed

- Re-read all three original files and reviewed role and policy interactions, FK targets and indexes.
- Checked current official Supabase guidance for RLS, function permissions, Auth triggers and Storage.
- Lexical checks passed for both SQL migrations: closed quotes/dollar blocks, balanced outer
  parentheses, statement delimiters, trailing whitespace and closing transaction. These checks
  counted 49 outer statements in 001 and 44 in 002 at review time.
- Python compilation passed for `tests/run_local.py`.
- Invoked the loopback-only runner with the explicit disposable-local flag. It exited with:
  `Cannot run: psql is not installed. No database connection was attempted.`
- Runtime discovery found no psql, postgres, Docker or Supabase CLI, and no locally cached PostgreSQL
  runtime. A dependency retrieval check failed with DNS resolution unavailable. No system packages
  were installed, no privileged execution was requested, and no remote fallback was attempted.

## Added tests, not executed

`tests/authorization.sql` applies synthetic SQL-role/JWT-claim contexts and checks signup role
defaults, farmer isolation, protected columns, expert assignment/revocation/demotion, cross-report
evidence rejection, immutable reviews, Storage metadata isolation, advisory publication/provenance,
anonymous access and Auth deletion restrictions. Fixtures and test functions roll back.

`tests/run_local.py` applies the migrations and runs that suite only against a fresh local Supabase
database on literal loopback, using no supplied database URL. It rejects nonfresh targets and
clears external libpq connection configuration. A loopback port must not be a remote tunnel.
These tests are useful future checks, **not evidence that execution has passed**.

## Tests still required / remaining issues

- Execute both SQL files and the authorization suite on disposable local Supabase. Resolve any
  runtime, managed-schema permission, trigger or policy behavior errors before remote application.
- Test real GoTrue signup/login, signed JWT validation and user JWT forwarding. The SQL test only
  simulates claims; direct fixture inserts do not test Supabase's Auth HTTP service.
- Test Storage bytes through the API: owner/foreign upload, download, list, upsert, copy/move, deletion,
  MIME/size rejection and signed URL expiry. SQL metadata tests cannot prove HTTP behavior.
- Test service-role backend workflows separately. The SQL deliberately does not expose AI/status
  writes to end users and does not implement a Gemini worker or resolution endpoint. The backend
  must recheck authorization and the latest diagnosis/review when changing workflow status.
- Concurrent review/revocation/resolution operates on PostgreSQL statement snapshots: an in-flight
  action may finish. Serialize lifecycle decisions on report rows and recheck current assignments
  before using a review to resolve a report. No concurrency/load tests have been run.
- Multiple immutable reviews per expert/diagnosis are allowed, including repeated submissions. The
  UI/backend must handle retries and clearly order/adjudicate reviews. The MVP schema does not choose
  a winning review or enforce review rate limits; latest-review existence alone cannot resolve a case.
- Per-user/per-report upload quotas are absent. Backend worker throttling alone cannot protect direct
  client DB/Storage requests. Add ingress/boundary enforcement before opening signup publicly.
- Implement audited role provisioning, a last-admin guard, retention cleanup and abandoned upload
  cleanup in privileged backend tooling. No general admin audit log or account suspension model is
  included in this schema. An elevated key bypasses all row policies; keep it server-side.
- Measure query plans and advisor findings with representative data; no scalability benchmark or
  Supabase linter was run against the revised schema because it was never installed on any database.

For an invite-only hackathon MVP, the remaining application work is reasonable. For a public launch,
abuse controls, lifecycle validation and integration tests are release requirements.

## Official references checked

- [RLS and Auth identity](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Functions and execution privileges](https://supabase.com/docs/guides/database/functions)
- [Auth profiles and triggers](https://supabase.com/docs/guides/auth/managing-user-data)
- [Storage policies and upsert requirements](https://supabase.com/docs/guides/storage/security/access-control)
