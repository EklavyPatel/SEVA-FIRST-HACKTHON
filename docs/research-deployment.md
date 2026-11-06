# Research repair and deployment status

## Confirmed cause and completed fixes

The running website returned `RESEARCH_UNAVAILABLE` (503), and its health report
showed `services.photos: unconfigured`. Private backend configuration had a
Supabase URL and publishable key, but no `SUPABASE_SERVICE_ROLE_KEY`. The live
project contained only account-role/access-request tables; no photo tables or
bucket existed. The UI incorrectly advised restarting, which could not create
missing resources or supply a credential.

The reviewed migration is now applied to the connected project as
**20261104173655_private_crop_photos**. Do not apply the local photo migration a
second time there. It created:

- Private Storage bucket `km-crop-photos`, JPEG only, maximum 3145728 bytes.
- RLS-enabled `public.km_photo_submissions` and `public.km_photo_annotations`.
- Protected research read/annotation functions and restrictive bucket policies.
- Expert as an allowed protected role; no user was assigned any privileged role.

Live catalog checks verified the bucket settings, RLS, absence of anonymous and
authenticated direct table SELECT grants, authenticated RPC execution with fixed
search_path, and all four restrictive Storage guards. Read-only SQL role tests
verified anonymous table/RPC denial and unapproved authenticated table/RPC denial.
One synthetic guest photo was saved for live verification and fully withdrawn afterward; its Storage object was deleted. No staff identities were created or promoted. The project currently has zero confirmed accounts and zero approved staff roles.

The UI now explains missing setup accurately and includes **Retry photo
connection**, which reloads capabilities after backend configuration is repaired.
The API distinguishes missing schema, rejected storage credentials and saving
failures instead of mapping them all to one generic message.

New diagnostics:

- `npm run check:research`: read-only schema, restricted bucket and staff-RPC
  denial checks using the backend credential. Prints no key, token or farmer row.
- `GET /api/health`: liveness and configuration only, still 200 without optional
  integrations.
- `GET /api/ready`: 503 until the research configuration/infrastructure checks
  pass; probes are cached/coalesced for 30 seconds. A 200 is infrastructure
  readiness, not proof of email delivery, staff approval or completed user flows.

## Credential recovery and live verification

The final security checks found supplied credentials in `api.env.example` and
`deploy.env.example` rather than only in private runtime files. The backend key
was transferred into `api.env`, and deployment values were preserved in ignored
`deploy.env`; both private files have mode 0600. Credential values were cleared
from the distributable examples without printing them. The
running backend reloaded it. All three example env files now have credential
regression checks. Rotate keys placed in templates before public release because they had been
placed in distributable files; no key was printed or published by this work.

The running website now reports `researchAvailable: true`, `photos: supabase`,
and **GET /api/ready → 200** with all infrastructure checks passing. The agent's
restricted shell still cannot resolve external DNS; a shell-only network failure
is distinct from the successful checks through the running backend.

| Live operation | Result |
| --- | --- |
| Both consent choices initially unchecked | Verified in browser |
| One synthetic guest photo save | 201, one database record and one Storage object |
| Repeat identical submission | 200, duplicate=true, same ID and no second file |
| My contributions and private image | Visible, image/jpeg, HTTP 200 |
| Authorized signed link | HTTP 200, 60-second expiry; token not printed |
| Separate browser without owner cookie: read/image/link/delete | All 404; unauthorized access denied |
| Withdraw research sharing | 200; database consent=false; owner image retained |
| Full withdrawal | 200; owner image/new links 404; own collection empty |
| Physical cleanup | Storage object removed; private details/AI cleared; minimal audit tombstone remains |

No paid Gemini call or signup/confirmation email was used for this test. Evidence:
[synthetic live photo screenshot](../artifacts/research-live-verification.png).

## Required owner actions before public release

1. Rotate keys that were placed in templates, including the backend key in
   Supabase Dashboard → Project Settings → API Keys,
   update **private api.env**, and keep all example files blank. Do not paste it
   into chat, frontend code or a distributable file. Runtime configuration is now
   correct; the rotation addresses its earlier placement in an example file.
2. Restart the local backend, then click Retry photo connection or reload the
   page. Environment files are loaded at startup, not dynamically per request.
   Run `npm run check:research`; all checks must pass. Resolve any credential,
   bucket or schema failure rather than bypassing it.
3. Register an account using a mailbox you control and confirm its email. Follow
   [SMTP/rate-limit guidance](signup-rate-limit.md) if delivery is blocked. Email
   confirmation remains enabled. No new signup emails were sent by these tests.
4. As the trusted project operator, provision only the intended **confirmed**
   administrator in `km_account_roles` using that account's Auth UUID. Do not
   promote all users or infer admin authority from metadata. Then use the existing
   access-request/admin-approval flow for researchers. Expert role requires
   independent operator verification. No account was promoted during this repair.
5. The guest save and withdrawal flow passed live. Before release, test approved
   researcher/admin/expert flows using real confirmed test accounts. Confirm the
   generated object in Dashboard → Storage → km-crop-photos and its record in
   Table Editor → km_photo_submissions. Test approved research access, annotation,
   sharing withdrawal and full withdrawal. Already-issued image links last at
   most their original 60 seconds; downloaded copies cannot be recalled.

## Deployment package prepared — not published

`Dockerfile` builds the frontend separately, installs backend runtime dependencies,
runs as the non-root node user, serves the built frontend/API together, and uses
`/api/ready` for its health check. `.dockerignore` excludes environment files,
credentials, archives, SQLite data and browser artifacts. Runtime keys are passed
at launch and never copied into image layers. A writable, persistent data volume
is needed for community SQLite and the photo cleanup journal.

Production startup requires:

- `NODE_ENV=production` and an explicit HTTPS `APP_ORIGIN`.
- Gemini key plus valid Supabase URL/public/backend keys.
- `HOST=0.0.0.0` inside a container; public binding remains disallowed in dev.
- TLS termination at the intended reverse proxy/platform. Preserve canonical
  Host/Origin behavior; proxy-header values are not blindly trusted.

Private `deploy.env` has been prepared from the supplied deployment settings;
`deploy.env.example` remains blank for credentials. **APP_ORIGIN still contains
a placeholder: replace it with the real HTTPS site origin before launch.** The
configured local Gemini model is preserved when no deployment model was supplied. This example is a launch recipe for review, not
an action performed here:

```sh
docker build -t kapasmitra:research .
docker volume create kapasmitra-data
docker run --name kapasmitra --init --restart unless-stopped \
  --env-file deploy.env --read-only --tmpfs /tmp \
  --mount source=kapasmitra-data,target=/app/data \
  -p 127.0.0.1:3001:3001 kapasmitra:research
```

Place the approved HTTPS proxy in front of port 3001; do not publicly expose Vite.
For other platforms, attach equivalent persistent storage and runtime secrets.
Run **one backend instance**: account sessions, rate buckets and analysis receipts
are process-local. Restarts require users to sign in again. A reverse proxy may
cause users to share an IP rate bucket; this repair does not trust spoofable
forwarded headers or claim multi-replica support.

Schedule `node scripts/reconcile-photos.mjs` in that same runtime after setup.
It now honors DATA_DIRECTORY, matching the backend's outbox path. Preserve the
volume and inspect pending cleanup counters. It uses Storage APIs, not direct
SQL deletion of storage metadata.

## Verification and remaining release gates

Backend/security/configuration tests and the frontend production build pass.
UI tests include failed-save preservation, retry, collection/withdrawal and
recovery from initially unavailable capabilities. Supabase/Gemini positive flows
in automated tests use mocked providers; image decoding/EXIF removal and request
handlers run locally.

Live tests performed: schema/bucket/grant/policy inspection, read-only denial
checks, and the complete guest save/retry/privacy/withdrawal flow above. Live
authenticated positive flows remain unverified because confirmed/approved test
accounts are not yet available. The full local SQL fixture
suite remains unrun because psql/local PostgreSQL are unavailable.

Docker is unavailable in this environment, so the image has **not been built or
run here**. A build plus container health/HTTPS/account/storage smoke test on the
selected deployment host is required before release. No site or backend was
deployed or published.

Supabase Advisor still reports intentional SECURITY DEFINER RPC execution and
RLS-with-no-direct-policy informational entries for server-mediated tables; do not
add anonymous access to silence these. Its separate confirmed warning is
[leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection);
review and enable the available Auth security setting before public release.
[RPC advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

References: [Supabase API key handling](https://supabase.com/docs/guides/getting-started/api-keys),
[Docker multi-stage builds](https://docs.docker.com/learn/content/shrink-your-image-with-multi-stage-builds/),
[Node container practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md).
