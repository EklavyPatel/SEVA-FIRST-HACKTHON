# Account and research approval setup

The public home page introduces KapasMitra. Crop analysis, community, saved photos,
and applications require a confirmed Supabase account. **Any normal account can
contribute photos. Research approval is needed only to access the shared dataset,
image links, annotations and CSV exports.** Retention and research sharing remain
separate choices. New registrations have normal access (`farmer` internally).

## Upgrade the existing project

1. Keep existing private `api.env`; do not overwrite it with an example. Set
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `GEMINI_API_KEY` and an exact `APP_ORIGIN`. Example files contain blank keys.
   The obsolete `PUBLIC_RESEARCH_ACCESS` flag cannot enable public access anymore.
2. Review `supabase/migrations/202611060001_complete_account_approval.sql` and
   apply that migration to an existing project where migrations
   `202611040001`, `202611040002` and `202611040003` already ran. Verify their
   presence first in your trusted Supabase SQL Editor/migration history.
   Then apply `202611060002_supabase_community.sql`. Both upgrades are already
   applied to the connected project. For fresh staging, apply all five files
   in chronological order.
   Do not reapply the older table/bucket creation migrations to an existing project.
3. The upgrade extends `km_access_requests` with name, intended use, reason and
   revision; preserves existing decisions as history snapshots; adds immutable
   application/review history; replaces the old review RPC; and adds owner RLS
   reads/withdrawal. Old histories cannot be reconstructed beyond recorded fields.
   It disables the public research RPC. Existing data, consents and the private
   `km-crop-photos` bucket remain in place. No guest records are assigned to an
   account automatically.
4. Enable email/password signup and email confirmation in Supabase Auth. Configure
   working SMTP and exact allowed local callback URLs under URL Configuration:
   `http://127.0.0.1:5173/#/login` and
   `http://127.0.0.1:5173/#/reset-password`. Set Site URL to that app origin.
   Use your actual approved HTTPS origin if running elsewhere.
5. The standard Supabase email links are supported. The app captures their access
   token in memory, removes provider tokens from the URL before rendering, verifies
   the user server-side, and revokes the temporary session after confirmation or
   password reset. It never stores access/refresh tokens in browser storage.
   The optional token-hash templates below keep link verification on the backend
   and require a button click, which also helps avoid link scanners consuming them.
6. Restart the backend and frontend with `npm run dev`. No deployment is required.

Auth email template links (use HTML `&amp;` inside an HTML attribute):

```html
<!-- Confirm signup -->
<a href="{{ .SiteURL }}/#/confirm?token_hash={{ .TokenHash }}">Confirm email</a>
<!-- Reset password -->
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery">Set a new password</a>
<!-- Invite user -->
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=invite">Accept invitation and set a password</a>
```

For recovery/invitation, the server supplies `RedirectTo` ending in
`/#/reset-password`. The page clears the token from browser history, verifies it
server-side on submission, changes the password through Supabase Auth, and revokes
that temporary provider session. The user then logs in normally. Expired/used
links require a fresh email. Standard signup confirmation links may still confirm
with Supabase and return to login; use the above templates consistently for the
complete in-app flow. Do not disable email confirmation to get tests working.

## Set up the initial administrator

The operator-only bootstrap targets **eklavypatel23@gmail.com** and grants admin
only to its verified Supabase Auth UUID. The web server never compares emails to
grant privileges and never exposes this bootstrap as a web route.

```sh
npm run setup:admin             # read-only plan, safe to inspect
npm run setup:admin -- --apply  # trusted operator action
```

- Existing confirmed account: the script calls `km_bootstrap_admin` with the UUID.
  Its password is never read, changed, reset or replaced.
- Existing unconfirmed account: confirm it through the mailbox, then rerun. The
  script preserves it and grants nothing while unconfirmed.
- Missing account: `--apply` sends a Supabase invitation. The inbox owner accepts
  the invitation, sets a password, then the operator reruns the command to grant
  admin to the now-confirmed UUID. No default password is created.
- The bootstrap transaction records a one-time singleton. A retry for the same
  UUID is harmless; a different UUID or an unrelated existing administrator blocks
  setup and needs a trusted operator to inspect the project. A deleted bootstrap
  user also needs operator review. It does not silently replace another admin.

Log in through the single Log in page, then open **Admin dashboard**. A researcher
cannot become an administrator by registering, changing metadata, selecting an
applicant type, or submitting an application. No browser has role-write grants.

## Complete an end-to-end approval test

Use synthetic crop photos and separate confirmed normal accounts A and B. Use a
separate browser profile for the admin so you do not reuse cookies accidentally.

1. Signed out, open Home. Try `#/crop`, `#/community`, `#/my-submissions`, and
   `#/research`: login is required and the intended destination survives login.
2. As A, analyse a synthetic photo and ask a Gujarati follow-up. Save one photo
   with retention enabled but sharing off, then another with sharing on. Neither
   save requires research approval. My submissions should show both.
3. As B, verify A's private submissions and withdrawal actions are unavailable.
   Both accounts can participate in explicitly shared community discussions;
   only the author can delete or mark their post resolved.
4. As B, open Request research access. Enter name, institution, purpose and data
   use. Submit once; status becomes Pending. Retry submission: no second pending
   application should appear. B still cannot access the dataset.
Pending applicants can refresh status manually; while visible, their application
status also refreshes every 15 seconds. Returning focus refreshes the account role.

5. As admin, open Pending, inspect details and Reject with a reason. As B, check
   the reason, edit and resubmit. Confirm the old submission/rejection remains in
   history and the revision increments.
6. As admin, approve the new revision. As B, refresh My account or focus the tab
   and open Research dashboard. Only A's actively shared photo should appear;
   no account emails, owner IDs, exact locations or private free text appear in
   the researcher projection. Open the photo, annotate it and export the CSV.
7. As A, withdraw research sharing while retaining the photo. As B, it disappears
   and new image links/reviews are denied. A still sees the retained photo.
8. Share another synthetic photo, then use Reviewed → Revoke research access as
   admin with a reason. B's **next request** must lose research permissions,
   even with the same session. B sees Revoked and the reason in My account.
   Previously issued signed image links can last **up to 60 seconds**; downloaded
   copies cannot be recalled. Normal analysis/contribution access remains.
9. Try repeated and competing review actions from two admin tabs. One decision
   wins atomically; conflicting/stale actions return 409. Repeating an identical
   decision by the same reviewer is idempotent and adds no history entry.
10. Verify logout and expired sessions; check a wrong password and an unconfirmed
    signup; exercise Forgot password, a used/expired email link, and invitation
    setup through an actual mailbox. No tests manufacture email confirmation.

Direct database/Storage verification is separate from UI checks. On a **fresh,
disposable local Supabase stack** with `psql`:

```sh
KAPASMITRA_DISPOSABLE_DB=1 npm run test:photos:sql
```

The runner refuses non-loopback/populated databases. It applies migrations, tests
previous photo policies, then runs `supabase/tests/complete-account-flow.sql`.
SQL fixtures roll back; a final two-connection concurrency test commits synthetic
fixtures only on that disposable stack and removes them in a finally block. Tests cover anonymous denial, user separation, immutable
roles/review/history fields, self-review, duplicate/resubmitted applications,
stale/conflicting decisions, bootstrap grants, researcher consent filtering,
withdrawal/revocation, and direct Storage operations even with an unrelated
permissive policy. Destroy the disposable stack afterwards. These SQL checks are
not a substitute for real SMTP/Auth/Storage HTTP checks on staging.

Use ordinary users' JWTs (not the service key) for direct staging REST calls to
`km_account_roles`, `km_access_requests`, `km_access_request_history`, owner
`km_photo_submissions`, `km_submit_access_request`, `km_review_access_request`,
`km_research_photo_records`, `km_withdraw_own_photo`, and private Storage
list/download/upload/delete/sign endpoints. The service-role key is intentionally
limited to trusted setup and the server's validated photo ingest, signing,
annotation projection, and cleanup. Owner reads and withdrawal use the user's
JWT and RLS; researcher reads/reviews use role-checked user JWT RPCs. Direct photo
writes and all direct private Storage operations remain denied to clients.

## Verification limits for this workspace

The new connection results supersede the earlier network-blocked report: see
[Supabase connection verification](supabase-connection-verification.md). Both
upgrades and the initial verified-owner admin bootstrap are applied. Live Auth,
PostgREST and transactional account-permission checks passed. Shell networking and
local socket binding remain restricted; live HTTP checks used Playwright's
request transport. Actual email delivery and deployed-domain callbacks still need
verification on the intended host. The real user passwords were not read or changed.

Sessions use the existing opaque HttpOnly/SameSite cookie with server-held access
tokens, verified identity and protected role reads per request. Sessions expire
within one hour and disappear on backend restart; users sign in again. There is
no refresh token in browser storage. Multiple backend replicas still require a
shared session/rate-limit design. Legacy SQLite research/password login is no
longer routed by the web app; existing historical records remain untouched.

Real keys were found in `api.env.example` and removed. Rotate the exposed Gemini
and Supabase service keys through their provider consoles; updating examples does
not invalidate prior copies. Keep `api.env`, `deploy.env`, archives and traces
private. This workspace's `.git` is empty, so no Git history was available to audit.

References: [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates),
[OTP verification](https://supabase.com/docs/reference/javascript/auth-verifyotp),
[Auth API](https://github.com/supabase/auth),
[Storage access control](https://supabase.com/docs/guides/storage/security/access-control),
[signed image downloads](https://supabase.com/docs/guides/storage/serving/downloads).
