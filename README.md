# KapasMitra AI

Gujarati/English crop-photo website with a React/Vite frontend and a Node.js
backend for Gemini analysis, Supabase accounts, community discussions and private
research photos. The existing interface talks to same-origin `/api` endpoints.

Home is public; crop analysis, community and photo contribution require login.
**Every normal account can contribute photos. Only access to shared research data
requires admin approval.** See [account setup and the admin approval test](docs/account-setup.md).

## Start locally

Requires Node.js **22.13+** and npm. Run commands from this project directory:

```sh
npm ci
npm run setup:backend
# Create api.env from api.env.example only if you do not already have api.env.
npm run dev
```

Open **http://127.0.0.1:5173**. Vite forwards `/api` requests to the backend at
**http://127.0.0.1:3001**. To run just the backend, use `npm run dev:server`.
For the built website, run `npm run build` followed by `npm start`, then open
**http://127.0.0.1:3001**. These commands run locally; they do not deploy anything.

The development backend stays on loopback. Production containers may bind to 0.0.0.0 only with production mode, an explicit HTTPS origin and required credentials. If local socket binding is restricted, the command
reports EPERM/EACCES rather than claiming it started. `npm run backend:smoke`
verifies production request wiring without a socket or external services.

## Private backend configuration

Keep real values in **api.env**, which is ignored by version control. Existing
nonempty process environment values take precedence, followed by api.env and .env.
Example files are documentation and are never loaded as runtime credentials.

| Setting | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Live crop observations and follow-up; optional for the demo |
| `GEMINI_MODEL` | Model available to your Google project |
| `SUPABASE_URL` | Project HTTPS API URL |
| `SUPABASE_PUBLISHABLE_KEY` | Public key used with Auth and user JWTs |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend-only elevated key for private photo operations; configure after photo setup review |
| `APP_ORIGIN` | Browser origin, normally `http://127.0.0.1:5173` in development |
| `PORT` / `HOST` | Defaults `3001` / `127.0.0.1`; loopback in development; production containers support 0.0.0.0 |
| `ENABLE_DEMO` | `true` or `false`, default true |
| `SECURE_COOKIES` | `true` behind HTTPS; local HTTP defaults false; HTTPS origin always enables it |

Never put elevated keys in a VITE_ variable, browser code or chat. The backend
validates its port, origin and flags before opening storage. If you change PORT,
update the Vite proxy in vite.config.js to match. Keep origin URLs exact.

`GET /api/health` reports **configuration availability**, not verified provider
connectivity. It lists analysis/accounts/community/photos without revealing keys.
`npm run check:backend` separately performs read-only live Auth/anonymous database
probes; expected anonymous permission denials are not authenticated-flow failures.

## Backend features and API

| Routes | Behavior |
| --- | --- |
| `GET /api/health` | Capabilities and nonsecret service status |
| `POST /api/analyze` | Explicit demo or consented live Gemini observations |
| `POST /api/followup` | Bounded, consented follow-up about a crop photo |
| `/api/account/me`, `/signup`, `/login`, `/logout` | Supabase accounts with server-held tokens and HttpOnly cookies |
| `/api/account/requests`, `/review` | Access requests and admin review using protected database roles |
| `/api/community/posts` and post/reply/status routes | Account-owned community questions/replies in Supabase; author-only changes |
| `/api/research/me`, `/contributions` | Owner collection or approved-researcher dataset; explicit photo save |
| `/api/research/photos/:id` | Authorized detail or owner withdrawal |
| `/api/research/photos/:id/image`, `/image-link` | Authorized image access; signed links expire in 60 seconds |
| `/api/research/photos/:id/reviews` | Attributed human annotations separate from original AI output |
| `PATCH /api/research/photos/:id/consent` | Withdraw sharing while retaining the owner's photo |
| `GET /api/research/export.csv` | Approved researchers' deidentified labels and provenance |

Analysis fully decodes/re-encodes images and removes EXIF before Gemini. It does
not retain photos. Demo is explicitly labelled and does not call Google.
Responses remain provisional observations, not a confirmed diagnosis or a chemical
treatment recommendation. Follow-up does not automatically retry provider errors.

Research saving is a separate action. Photo retention and researcher sharing are
separate unchecked choices, and all field/location questions are optional.
Ownership uses the verified Supabase Auth identity; owner reads use user JWTs/RLS.
Failed optional saves preserve crop guidance and never falsely report success.
Duplicate submissions, uncertain commits and orphan cleanup are handled separately
from the AI call. Original AI suggestions, human annotations and expert-confirmed
labels have distinct provenance.

## Supabase connection

The account integration uses existing `km_account_roles` / `km_access_requests`.
Signup requires email confirmation. Project email quota and recipient restrictions
are independent of the backend's own request limiter. See
[signup email diagnostics](docs/signup-rate-limit.md).

The existing private **km-crop-photos** bucket and photo tables are preserved.
The account-approval and community migrations are applied to the connected
Supabase project. Live Auth, PostgREST, account isolation, community actions and
password reset checks passed. The configured verified owner has admin access.
See [connection verification](docs/supabase-connection-verification.md) for the
exact checks and remaining email-delivery/deployment limits.
Use [account setup](docs/account-setup.md) for migration order, email templates,
the one-time `eklavypatel23@gmail.com` bootstrap, and an end-to-end approval test.

New community activity uses Supabase. The existing account-owned post was copied
with its original ID and author after verifying that the Auth account exists.
The one legacy guest post and historical research data remain in local
`data/research.sqlite`; guest ownership is not assigned to a new account.
Production community and photo operations do not fall back to SQLite. Treat the
data directory and photo outbox as private and durable.

After approved photo setup, `npm run photos:reconcile` processes metadata-only
cleanup jobs in `data/photo-outbox`. Schedule it on the same backend and preserve
that directory. Research withdrawal blocks future access immediately; links
issued earlier can last until their original 60-second expiry, and downloaded
copies cannot be recalled.

## Verification

```sh
npm run backend:smoke   # Offline production-wiring smoke check; no credentials needed
npm test               # Backend/configuration/security and mocked service tests
npm run test:ui        # DOM flows, including failed-save/retry/withdrawal
npm run build          # Production frontend build
```

Automated tests mock Supabase/Gemini and do not send confirmation emails or consume
live provider quotas. The smoke check uses temporary SQLite and removes it when
finished. `npm run test:photos:sql` is a separate, explicitly gated test requiring
psql and a fresh disposable **local** Supabase stack; it is not part of npm test.
See the photo setup guide for its exact prerequisites and test limitations.

Account sessions currently live in one backend process and expire on restart or
within an hour. Account-owned photos survive browser cookie clearing after signing in again. This project is
not deployed; shared sessions, moderation and hosting need separate review.
Previous implementation/security notes remain in [docs](docs/), including the
[security report](docs/security-audit.md) and [account setup](docs/account-setup.md).

For current research recovery, readiness checks and the Docker deployment package, see [deployment notes](docs/research-deployment.md). `npm run check:research` performs read-only setup checks; `GET /api/ready` returns 503 until research infrastructure passes.

Public research browsing is disabled in both the backend and upgrade migration.
The legacy public flag cannot override approval. Historical public consent is not
republished through an anonymous endpoint.
