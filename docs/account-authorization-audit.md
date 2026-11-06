> Historical implementation notes. The current account/contribution/approval flow
> is documented in [account-setup.md](account-setup.md). Public research browsing
> and the legacy research login are disabled by the current implementation.

# Account authorization audit

The checker sends `apikey` only, with no `Authorization` header. The publishable
key identifies the application; without a user's JWT, PostgREST uses `anon`.
For these private tables, HTTP 401/403 with PostgreSQL 42501 is an expected
permission denial, even for `limit=0`. This does not test authenticated RLS.
HTTP 200 from Auth settings only proves the key and Auth service are reachable.

## Session trace

1. Browser signup posts email/password to the same-origin account backend.
   Backend calls Auth signup with the public key and a server-controlled
   confirmation redirect. Submitted roles and redirect URLs are discarded.
   No application session cookie is created at signup.
2. The mailbox owner confirms the email through Supabase. The app does not
   consume fragment tokens; return to Log in and submit credentials. Supabase
   must allow the configured confirmation redirect URL.
3. Password login calls `/auth/v1/token?grant_type=password`. An unconfirmed
   email is rejected. A confirmed response supplies `access_token` and expiry.
4. Backend holds that token in its in-memory session map and sends an opaque
   HttpOnly, SameSite=Strict cookie to the browser. Browser requests explicitly
   include same-origin cookies. Tokens are not returned to browser JavaScript.
5. `/me` and every protected action resolve the cookie, call `/auth/v1/user`
   with `Authorization: Bearer <user access token>`, verify confirmed identity,
   and fetch `km_account_roles` using the same token and verified user ID.
6. Request reads, inserts and review RPC receive that same token. PostgreSQL
   role is `authenticated` for farmers, researchers AND app admins. App admin
   authority comes from the protected role row, not an elevated database JWT
   or user-supplied metadata. Requests use verified ownership; admin list reads
   pending requests across owners. Review checks admin in both app and SQL.
7. Logout removes the local session and attempts upstream logout with its token.
   Sessions expire within one hour and disappear on backend restart; no refresh
   flow exists. A user must log in again after expiry/restart.

## Live inspection (read-only)

Both tables have RLS enabled. `anon` lacks SELECT. `authenticated` has schema
USAGE and table SELECT, plus INSERT on only user_id/kind/institution/purpose
for requests. The role lookup policy allows only the user's own role row;
request reads allow own rows or the protected admin predicate. Inserts require
own identity, pending status and unset review metadata. No client role writes
or direct request updates are granted. Both SECURITY DEFINER functions have
an empty search_path; anon lacks execution, authenticated has execution.
The review function independently checks the protected admin row, updates only
pending requests and grants researcher, never admin; conflict cannot overwrite
an existing administrator.

No missing grant/policy was confirmed. No SQL permission patch is needed.
Do not grant anonymous SELECT or authenticated role-table writes to silence probes.

## Changes and evidence

- `scripts/check-backend.mjs` now labels the database role and separates
  `expected_denial`, `unexpected_anonymous_access`, and `failure`. Missing tables,
  unrecognized 401 responses, network errors and unexpected anonymous SELECT
  make the checker fail. Authenticated flow is explicitly `not_tested`.
- Probe tests cover header selection, expected denials, missing schema, rejected
  keys, network errors and anonymous exposure without exposing provider bodies.
- Account tests verify bearer propagation through identity, roles, own reads,
  insertion, admin list and RPC, separate session ownership, signed-out denial,
  ordinary review denial, metadata stripping and logout. These use HTTP mocks;
  they prove application behavior, not PostgreSQL policy execution.
- The live auth script now fails incomplete isolation checks instead of reporting
  success when ordinary-user fixtures are absent or unsuitable, and treats failed
  logout as a failure. Syntax checked; not run against real credentials here.

| Boundary | Evidence / outcome |
| --- | --- |
| Signed-out REST | User-reported live 401/42501: expected denial; live ACL audit agrees |
| Signed-out app requests | Application test passes: 401, no REST call |
| Confirmed user's own requests | Token/owner propagation application tests pass |
| Unconfirmed login | Existing error-mapping tests pass: confirmation required |
| Cross-user app requests | Separate token/owner-filter tests pass |
| Ordinary review / self-promotion | Application tests deny review and discard role/status/owner input; SQL audit denies direct role writes |
| Admin list and review | Application tests pass with admin's bearer token; SQL requires protected admin row |
| Actual own/cross-user/admin RLS with populated records | Not executed; no live fixture requests or admins, no local PostgreSQL available |

`supabase/tests/account-authorization.sql` is prepared for a disposable local
Supabase database after the account migration. It creates synthetic fixtures,
exercises anon, normal user, other user, admin and approved researcher under
actual PostgreSQL roles/claims, asserts denials and permitted operations, and
rolls everything back. It is unrun here. It is a test script, not a migration;
do not run it on the live project. For live JWT/end-to-end verification, use
separate confirmed test accounts with an existing request plus a preprovisioned
admin; no such credentials were read or printed here.

No live permission changes, test admin provisioning, email sends or deployment
were performed during this audit.

References: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys),
[password auth](https://supabase.com/docs/guides/auth/passwords),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
