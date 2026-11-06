# Supabase connection verification — 2026-11-06

The existing website is connected to project `kjlywmqsgkfiqciqwklt`. Backend
settings in private `api.env` and `deploy.env` use the project's current
publishable key. The service key stays on the backend. The browser continues to
call same-origin `/api` endpoints and uses an opaque HttpOnly session cookie.

## Changes completed

- Applied the pending account approval upgrade as live migration
  `20261106070801_complete_account_approval`. It adds application/history fields,
  atomic submit/review/revoke RPCs, and owner photo read/withdraw permissions.
- Applied `20261106071206_supabase_community`. New posts/replies use Supabase,
  with verified account ownership, explicit sharing consent, protected staff
  badges, author-only status/deletion, reply limits, and per-account write limits.
  Community responses expose display names rather than owner UUIDs/emails.
- Copied the existing account-owned SQLite community post after checking its
  author against confirmed Supabase accounts. Its original ID was preserved.
  The legacy guest post remains in SQLite; it was not assigned to an account.
- Ran the existing one-time bootstrap for the configured confirmed owner,
  `eklavypatel23@gmail.com`. This account now has the protected admin role.
  Its password and email confirmation were not changed.
- Added standard Supabase confirmation/recovery/invitation callback support,
  while preserving custom token-hash email links. Provider tokens are captured
  in memory, removed from the URL before rendering, verified by the backend,
  and never persisted in browser storage. Temporary sessions are revoked.
- Updated diagnostics and added `npm run test:supabase:live` for explicit,
  disposable Auth/PostgREST checks. It generates links without sending emails
  and deletes its fixture users in `finally`.

## Actual verification

| Check | Result |
| --- | --- |
| Live Auth settings | Email/password enabled; signup enabled; email confirmation required |
| Confirmation return URL | `http://127.0.0.1:5173/#/login` accepted by Supabase |
| Recovery return URL | `http://127.0.0.1:5173/#/reset-password` accepted by Supabase |
| Live HTTP with two disposable users | Unconfirmed login denied; confirmation token verification, password login, identity, wrong-password denial, recovery/password change and logout passed |
| Live PostgREST | Application save/history isolation, private photo isolation, unapproved research denial and anonymous table denial passed |
| Live community RPC | Post, reply, status and delete passed; cross-author deletion and forged staff badges denied; owner IDs absent from responses |
| Live SQL account smoke | Submit, duplicate prevention, reject/resubmit, revision checks, approve/revoke, immutable history, owner photo isolation, research projection and withdrawal passed with rolled-back fixtures |
| Cleanup | All temporary Auth users deleted; zero `km-check-*` accounts remain; no test emails sent |
| `npm test` | 16 test files passed, zero failures |
| `npm run test:ui` | 17 DOM tests passed, zero failures |
| `npm run build` | Production Vite build passed |
| `npm run backend:smoke` | Passed; signed-out protected routes denied; no network requests |
| Built website in Playwright | Standard recovery/custom confirmation rendered and submitted correctly; callback URLs scrubbed; provider tokens absent from browser storage; zero page errors. HTTP responses were intercepted fixtures for this browser check. |

The shell cannot open local sockets or reach Supabase in this workspace. Live
HTTP tests therefore used Playwright's API request transport against the real
project. Backend request handling was checked separately by the automated tests.
This is not a claim that a deployed frontend-to-backend flow was tested.

## Remaining operational limits

Actual inbox delivery and SMTP quotas have not been tested; generated test links
do not send email. The local callback URLs above are accepted. Before public
deployment, replace `APP_ORIGIN=https://YOUR_DOMAIN` in private `deploy.env`,
configure that HTTPS origin and callback URLs in Supabase, and verify delivery
through an actual mailbox. No website deployment was performed.

Restart the local app with `npm run dev` to load the updated backend and private
settings. Sessions remain in server memory and expire within one hour; backend
restart signs users out. Multiple replicas require shared sessions/rate limits.
Existing photo objects and historical research records were preserved.

The Supabase security advisor still reports the existing disabled
[leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
It also flags intentional [RPC security-definer access](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
and [RPC-only tables without direct RLS policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
These RPCs check confirmed identity, ownership or protected roles explicitly;
direct anonymous/authenticated table writes remain revoked. The live checks
above exercised those boundaries.
