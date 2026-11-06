# Earlier account flow verification — 2026-11-06

Superseded by [the completed Supabase connection verification](supabase-connection-verification.md).
The results below describe the earlier network-restricted run.

Implemented in the existing Supabase account/session/photo architecture. No live
migration, account creation, invitation, password change, role grant, deployment
or public publishing was completed in this session.

## Passed

| Check | Actual result | What it proves |
| --- | --- | --- |
| `npm test` | 14 test files passed, 0 failed | Backend/configuration/security contracts with mocked Auth, PostgREST, Storage and Gemini; includes application, bootstrap, role, consent and isolation cases |
| `npm run test:ui` | 17 DOM tests passed, 0 failed | Upload/results, language switching, follow-up, failed-save recovery, own photo withdrawal, public landing/login and account navigation with mock services |
| `npm run build` | Vite production build succeeded | Current React/CSS builds successfully |
| `npm run backend:smoke` | Passed, zero network requests | Signed-out protected endpoints fail closed through production wiring |
| Targeted current backend checks | 35 passed, 0 failed | Latest approval/readiness, account and private-photo changes |
| Browser checks using the built app and intercepted HTTP fixtures | Passed; zero browser console errors | Gujarati mobile home/login, no horizontal overflow at 390px, Home CTA → Login → intended Crop URL, normal-user `#/research` → `#/request-research`, one login form |
| Desktop/mobile browser layout previews | Inspected at 1440px and 390px | Home and login visual layout, including Gujarati |
| Example credential checks | Passed in security tests | Key/token/password/secret values are blank in distributable example files |

`npm test` reports files as top-level tests in this sandbox; the isolated file
results must not be mistaken for live provider verification. The historical
SQLite research adapter has isolated contract tests, but is no longer exposed by
the web application's research routes. Production photos do not fall back to it.

Backend contract cases cover signup role injection, unconfirmed email, invalid
credentials, provider/rate errors, expired sessions/logout, recovery/invitation
verification, signed-out denial, ordinary-user photo contribution without approval,
two-user isolation, pending duplicate prevention, reviewer restrictions,
rejection/reason, edited resubmission and history, stale/conflicting/repeated
reviews, approval, revocation, consent filtering, annotation provenance, withdrawal,
private image links and cleanup. **Mocked RPC decisions do not prove PostgreSQL
transaction/RLS behavior.**

Browser screenshots are local artifacts under `artifacts/`:

- `approval-home-desktop.png` — desktop layout preview.
- `approval-home-mobile-real.png` — running built frontend, fixture backend.
- `approval-login-mobile-real.png` — running built frontend, fixture backend.
- `approval-login-mobile-gu.png` — standalone Gujarati login layout preview.

## Blocked / not verified live

- `npm run check:backend`: actual Supabase Auth connection failed with DNS
  `EAI_AGAIN`. Configured credentials passing local format validation is not a
  live authentication success.
- `node scripts/bootstrap-admin.mjs`: read-only operator plan failed with
  `Supabase connection failed (EAI_AGAIN)`. The existing/missing state of
  `eklavypatel23@gmail.com` is unknown. No invitation or password/role change ran.
- `npm run check:research`: all seven live infrastructure checks failed with
  `RESEARCH_NETWORK`; no setup check was reported as passing.
- `npm run test:auth:live`: stopped before provider calls because
  `TEST_AUTH_EMAIL_A`, `TEST_AUTH_PASSWORD_A`, `TEST_AUTH_EMAIL_B`, and
  `TEST_AUTH_PASSWORD_B` are not configured. These must be separate confirmed
  normal test accounts for real isolation verification.
- `KAPASMITRA_DISPOSABLE_DB=1 npm run test:photos:sql`: blocked because `psql` and
  a fresh local Supabase stack are unavailable. Actual SQL migration execution,
  policy tests, and the two-connection concurrent review test are **unrun**.
  PostgreSQL/Docker are also unavailable; an attempted temporary SQL-engine install
  failed with DNS `EAI_AGAIN`. No SQL test success is claimed.
- `npm run dev`: local listeners refused with `EPERM`. A direct local Chromium
  launch was also unavailable in the command sandbox. Browser tool checks instead
  served the built assets through intercepted requests, with a fixture account
  service. These did not contact Supabase or verify email delivery.
- `npm run test:e2e` against the local backend was not run because a listener
  cannot start. The script now supports the public-home/login checks and, when
  explicit test credentials are configured, the authenticated demo/upload/logout
  flow. Live signup, mailbox confirmation, password reset, invitations, real
  database/Storage HTTP authorization and approval/revocation still require the
  staging procedure in [account-setup.md](account-setup.md).

## Operator steps still required

Apply the additive upgrade migration after reviewing the existing migration
history, configure the three email templates and SMTP, run the one-time admin
setup, and complete the documented A/B/admin approval test. Normal users can
contribute without research approval; shared dataset access requires approval.
Previously issued signed image links can remain valid for up to 60 seconds after
withdrawal/revocation. Keep all real credentials in private environment files;
rotate those previously exposed in the example file.
