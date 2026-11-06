> Historical implementation notes. The current account/contribution/approval flow
> is documented in [account-setup.md](account-setup.md). Public research browsing
> and the legacy research login are disabled by the current implementation.

# Backend/account configuration follow-up — 2026-11-04

## Confirmed root cause

`src/components/Account.jsx` displays the account setup notice when its `configured`
prop is false. `src/App.jsx` gets that flag from `GET /api/account/me`.
`server/accounts.js` derives it from the Supabase project URL and client key passed
by `server/index.js`. The backend environment loader reads **only `api.env` and
`.env`**, with nonempty exported process values taking precedence.

The real Supabase project API URL and publishable client key had been entered in
**`api.env.example`**. Neither setting was in `api.env`, `.env`, or the current
process environment. Examples are deliberately never loaded. This was a confirmed
missing-runtime-configuration problem, not a frontend build-time variable problem,
authentication failure or DNS failure.

The two settings were moved into private `api.env`, preserving its Gemini values
and all other settings. The example values were cleared. The URL's format was
verified as a project HTTPS API URL, not a dashboard URL. The key has publishable
format, not elevated-secret format. Neither value is shown here. `api.env` has
owner-only filesystem permissions. Git-ignore patterns were verified in an isolated
scratch repository; this workspace's `.git` is empty, so actual tracked-file/history
status cannot be verified here.

The diagnostic now reports `accountsConfigured:true` and no missing variables.
This proves local initialization only. Supabase DNS lookup still fails with
`EAI_AGAIN`, so a working live account service is **not yet verified**.

## Fixes made

- Added `server/account-config.js`: trim configuration; validate project API URL
  and public/publishable or legacy anon key; reject elevated keys. Incorrect account
  settings produce actionable account status without crashing guest crop flows.
- `server/accounts.js`: distinguish DNS/connection, timeout, rejected client key,
  bad credentials, unconfirmed email, duplicate signup, disabled email provider,
  missing account tables/RPCs, RLS denial, expired sessions, and unreadable upstream
  responses. Raw upstream errors/credentials are never returned. Logout clears the
  local session even during provider outages. Refresh restores valid sessions;
  expired tokens clear their local session. Existing accounts can log in with
  older password lengths; the eight-character minimum applies to new signups.
- Signup uses a **server-controlled** email redirect to the configured
  `APP_ORIGIN` plus `/#/login`. It ignores caller-supplied roles, metadata and redirects.
  Duplicate/obfuscated signup responses never cause automatic login or claim email
  delivery. Users still confirm their email and log in with a password.
- Own-request queries now explicitly filter the authenticated user's ID in addition
  to RLS. Admin review still requires protected server/database roles. No policy was
  disabled, no admin password was hardcoded, and no live permission was changed.
- `server/app.js`: account error responses preserve the truthful `configured` flag.
- `src/App.jsx` and `src/components/Account.jsx`: loading, missing configuration and
  failed status requests are separate states. Network/schema errors no longer turn
  into the misleading unconfigured notice. Retry is available, errors are localized,
  and failed account restoration is not silently reported as successful login.
- `server/env.js`: safe source provenance, reporting variable names and source files
  without values. Existing precedence is unchanged.
- Added `scripts/check-backend.mjs` and `scripts/test-auth-live.mjs`; enhanced the
  existing Gemini script with `--language=gu|en` and optional `--followup`.
- Added `tests/account-config.test.mjs`, updated auth fixtures and interface tests;
  added read-only `supabase/check-account-setup.sql`. No extra infrastructure/dependency
  or new schema migration was needed to fix the confirmed configuration cause.

## Private configuration

In the project-root **`api.env`**, use these variable names only:

- `SUPABASE_URL`: the project's HTTPS API URL from its Connect/API settings.
- `SUPABASE_PUBLISHABLE_KEY`: publishable client key, or legacy `anon` key.
  Ordinary signup/login does **not** need a secret/service-role key.
- `GEMINI_API_KEY`: paste your replacement key here locally, never in examples/chat.
- `GEMINI_MODEL`: a model available to that Google project.

The two Supabase settings have already been transferred from the example in this
workspace; do not overwrite them accidentally. A nonempty Gemini key is loaded
from `api.env`, with no current exported override. DNS failure prevents checking
whether that value is the replacement or a valid/access-authorized credential;
generating a replacement does not update the file automatically.

`APP_ORIGIN` currently comes from `.env`. Keep it aligned with the local browser
URL (`http://127.0.0.1:5173`). For local HTTP, keep `SECURE_COOKIES` false/unset;
Secure cookies cannot be relied on over arbitrary HTTP. No browser-exposed `VITE_`
key is needed. Source priority is: **nonempty process values > api.env > .env**.
Stop/restart the backend after changing files or exported values. The frontend
fetches account configuration at runtime, so adding these values does not require
a frontend rebuild. This turn's frontend code changes do require a rebuild if using
`npm start` to serve production assets rather than the Vite development server.

## Dashboard steps, in order

1. Restore local DNS/connectivity. Run `npm run check:backend`. Until the Auth settings
   endpoint responds, do not interpret an error as an incorrect user password.
2. Choose the project matching the configured API URL. Run
   `supabase/check-account-setup.sql` in SQL Editor; it selects metadata only.
   If the `km_` tables/functions are absent, review and apply
   `supabase/migrations/202611040001_account_access.sql` in staging. If they already
   exist, inspect them rather than rerunning the one-time migration or disabling RLS.
   Missing-schema errors have their own `ACCOUNT_SCHEMA` code. After a deliberate
   reviewed schema change, `NOTIFY pgrst, 'reload schema';` requests cache reload.
3. In Authentication settings, enable the Email provider and signup, keep email
   confirmation enabled, and configure SMTP/delivery. Do not disable confirmation
   to work around a login error.
4. Set Site URL to `http://127.0.0.1:5173`; allow the exact redirect
   `http://127.0.0.1:5173/#/login`. Use one consistent hostname instead of mixing
   `localhost` and `127.0.0.1`. Verify the confirmation template uses the intended
   confirmation URL. The app uses password login after confirmation and does not
   import authentication tokens from URL fragments.
5. Create two isolated test accounts/inboxes. Confirm their email, then test login,
   page refresh and logout. An authenticated farmer with no role remains a farmer;
   a pending access request is not a login failure. No Storage bucket is needed for
   this account integration; crop/community data remains in local SQLite.
6. Provision `eklavy146@gmail.com` only after verifying the mailbox/identity, with a
   fresh password. Use the trusted-operator SQL in `docs/account-setup.md`; never
   grant a role based on signup metadata. No live admin was provisioned here.
7. Execute the anonymous/A/B/admin RLS matrix in `docs/account-setup.md`. Ensure
   ordinary users cannot modify role rows or review requests, and A cannot see B's
   request. Test admin approval with a dedicated pending test request only after
   your deliberate operator setup. The tests here do not prove live RLS execution.

Official behavior references: [Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes),
[password/email confirmation](https://supabase.com/docs/guides/auth/passwords),
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Ubuntu commands

From the project root, stop the old development process with Ctrl+C. Ensure any
exported old values are intentionally updated or unset, then run:

```bash
cd /home/hp/SEVA_HACKTHON
npm run check:backend
npm run dev
```

In another terminal, check the actual running configuration endpoint:

```bash
curl --fail-with-body http://127.0.0.1:5173/api/account/me
```

Expect `configured:true`; this endpoint does not prove external connectivity when
there is no signed-in session. `check:backend` separately probes Supabase Auth
settings and reports DNS/client-key/provider failures without printing keys.

Run repeatable checks:

```bash
npm test
npm run test:ui
npm run build
```

For real account checks, put **isolated** test inbox credentials in private `api.env`
under `TEST_AUTH_EMAIL_A`, `TEST_AUTH_PASSWORD_A`, `TEST_AUTH_EMAIL_B`,
`TEST_AUTH_PASSWORD_B`. Do not paste passwords into terminal arguments or chat.

```bash
npm run test:auth:live -- --signup
# Confirm each test inbox email, then:
npm run test:auth:live
```

The first command deliberately requests signup emails, never auto-confirms users.
The second logs in, reads session/own requests, simulates refresh and logs out.
It never approves requests or changes roles. Direct live A/B row-isolation checking
requires two distinct ordinary farmer accounts and an existing test request owned
by B; otherwise it reports that check as inconclusive. Create B's request through
its normal consent form. Use test accounts only. The script prints status metadata,
not emails, tokens, passwords or row contents.

For a limited real crop-photo Gemini check (each command can make one analysis
and one follow-up request; no retries/fake fallback):

```bash
npm run test:gemini -- /absolute/path/to/cotton.jpg --language=gu --followup
npm run test:gemini -- /absolute/path/to/cotton.jpg --language=en --followup
```

Omitting the image path uses a bundled **synthetic illustration**, not a real field
photograph or evidence of agricultural accuracy. Do not run the second command to
work around quota/configuration failure in the first; fix the reported cause first.
DNS can be checked without secrets using `getent hosts generativelanguage.googleapis.com`;
for Supabase run `getent hosts` with your project's API hostname locally. Never put
keys in curl URLs or output diagnostic environment dumps.

## Repeatable test results

- `npm test`: all six test files passed, covering 68 backend/security/account/configuration cases.
- `npm run test:ui`: all 16 interface tests passed, including Gujarati live-response/follow-up mocks and retryable account status failures.
- `npm run build`: passed. The existing layout, guest upload and explicit demo behavior remain intact.
- New focused checks cover ignored example files, configuration precedence, valid project URLs/public keys, elevated-key rejection, DNS/timeouts, invalid credentials, unconfirmed email, duplicate signup, missing schema, refresh, logout during outages, two-account query filtering, and existing shorter-password login compatibility.
- Actual environment values passed through the real account handler in memory: `/api/account/me` returned 200 and `configured:true`, without contacting Supabase. This is initialization verification, not live Auth verification.

## Live verification outcome in this session

- Configuration: settings present, valid project-URL/publishable-key format;
  diagnostic reports `accountsConfigured:true`, no missing variables, sources
  `api.env` for both Supabase settings and Gemini key/model.
- Supabase Auth settings: blocked by `EAI_AGAIN`; validity of the key, project
  availability, SMTP, email confirmation, tables/policies and admin provisioning
  remain unverified. No elevated credential was requested or used.
- Live Auth script: blocked before any requests because test inbox credentials
  are absent. No real signup or login is claimed.
- Gemini: attempted Gujarati analysis using the synthetic JPEG and the loaded
  backend credential; returned 503 `AI_NETWORK_ERROR` with DNS `EAI_AGAIN` before
  credential validation. English/live follow-up were not attempted after that
  failure. Actual generated-language verification remains mocked only.
- Local process restart: attempted `npm run dev`; this tool session denied socket
  binding (`EPERM`). Playwright also could not fetch the live local configuration
  endpoint reliably. Run the Ubuntu restart commands above outside this sandbox.
- No push, deployment, site visibility change, live SQL migration, or permission
  update was performed.
