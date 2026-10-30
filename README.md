# KapasMitra AI

A Gujarati-first cotton-photo observation MVP built with React, Vite, Tailwind CSS and a Node.js
backend. Supabase remains postponed: no Supabase client, migrations, buckets or remote writes are
used by this application. The existing database review documents are unchanged.

## Run locally

Requires Node.js 22.13+ and npm. Run from this repository's root:

```bash
npm ci
npm run setup:gemini
# Enter GEMINI_API_KEY in your existing api.env file locally.
npm run dev
```

Open **http://127.0.0.1:5173**. The backend uses **http://127.0.0.1:3001**. Vite forwards `/api`
to the backend. Keep the default ports together; if changing the backend port, also change the
Vite proxy. The default app origin is `http://127.0.0.1:5173`.

Without a Gemini key, live analysis is unavailable and the UI visibly selects **ડેમો મોડ · સિમ્યુલેશન**.
Choose a crop photo or **નમૂના સાથે જુઓ**, then **ડેમો પરિણામ જુઓ**. Demo output never examines
the photograph and is labelled at both input and results. The included sample is an original SVG
illustration, explicitly labelled as an illustration, not a real crop photograph.

For real analysis, set `GEMINI_API_KEY` **only in `api.env` on the backend**, then restart the server.
Do not overwrite an existing key file with a template. `api.env.example` shows the required names
without a credential. The backend loads nonempty exported environment values first, then `api.env`,
then `.env` defaults. Blank defaults cannot hide a populated key in `api.env`. Neither the dev launcher
nor Vite loads this secret file; only the backend entry point and the live-test CLI do so.
The current default model is `gemini-3.8-flash`; override `GEMINI_MODEL` with an image-capable model
available to your Google project. Model availability and billing are Google-project-specific.
The health endpoint requires key presence and a detected SDK installation, not proof that the
key/model has been authenticated.

The official `@google/genai` SDK is pinned to release **2.31.0** in `server/package.json`, separately
from browser dependencies. `npm run setup:gemini` installs it into `server/node_modules` and creates
its backend lockfile. Installation was attempted here but failed with registry DNS error `EAI_AGAIN`;
the SDK is **not installed** and its lockfile has **not been generated** in this environment. The
existing frontend lockfile remains usable. Missing SDK support returns a controlled 503 error;
there is no homemade SDK implementation or silent REST fallback.

The frontend requires consent before sending a live photo to Google Gemini. Do not prefix secrets
with `VITE_`. Vite does not load `.env` files (`envDir: false`). No Gemini keys are requested,
stored or rendered in the browser. Both `.env` and `api.env` are excluded by `.gitignore`, including
nested `*.env` files. Vite explicitly denies serving `*.env` files, and the built server serves only
`dist/`. Ignore rules were checked using Git in a temporary repository without copying credentials;
the main workspace's actual tracked-file index is unavailable for verification.

### Built app

```bash
npm run build
npm start
```

Open **http://127.0.0.1:3001**. The Node backend serves only `dist/`, alongside `/api` endpoints.
This is a local MVP: the server intentionally refuses non-loopback binds. Add authentication,
shared quotas/rate limits and production HTTPS/origin configuration before external deployment.

## Core experience

- Header language selector switches between Gujarati (default) and English, including navigation,
  upload controls, errors, demo results, and safety notices. Only this language preference is saved
  in browser localStorage. New live analyses request the selected language. Existing live results
  retain their original language with a notice to rerun; switching languages never triggers a paid call.
  Approved agricultural content stays in its reviewed original Gujarati, with an English notice.
- Responsive Gujarati homepage, locally hosted Gujarati fonts, botanical SVG artwork and navigation.
- JPEG/PNG/WebP upload, drag-and-drop, mobile camera capture, preview, replacement and retake.
- Original files limited to 10 MiB; browser decodes and resizes to at most 1600 pixels, removes
  embedded metadata by canvas re-encoding, and sends a JPEG of at most 3 MiB.
- Explicit live/demo states, consent, real loading state, error messages and retry. Replacing a
  photo or retaking during analysis aborts the active request and suppresses stale results.
- Live results contain possible conditions, visible symptoms, a Gujarati explanation and qualitative
  uncertainty. All results require expert review and are labelled as provisional observations.
- No treatment or dosage is generated. The independently reviewed guidance area stays unavailable
  until approved content has been supplied.
- No persistent report storage, accounts, telemetry or automatic Supabase calls. Browser localStorage
  stores only the language preference, never photos, consent, results or credentials.

## Backend and safety boundaries

`POST /api/analyze` accepts:

```json
{
  "mode": "live",
  "language": "gu",
  "image": { "mimeType": "image/jpeg", "base64": "<canonical JPEG base64>" }
}
```

Mode must be explicitly `live` or `demo`; provider errors never silently fall back to demo.
Language is `gu` (default) or `en`. Gujarati results retain the original `_gu` field names.
English results use `name`, `evidence`, `visible_symptoms`, `explanation` and uncertainty `reason`;
`name_en` remains the canonical condition name for approved-catalog lookup. Responses include `language`.
The response includes `mode`, `model`, `analysis`, `advisories`, `expertReviewRequired: true` and
`persisted: false`. Its `id` is a request identifier, **not a saved Supabase report ID**.

`GET /api/health` exposes only live/demo capability flags and the lack of persistence.

Backend protections include a request-size limit, canonical base64 and JPEG magic/SOF dimension
validation, a 12-million-pixel bound, an upstream timeout, two concurrent live calls maximum,
15 requests per client address per ten minutes, host/origin checks, secret/error redaction and
same-origin browser requests. Forwarded IP headers are ignored. Limits are in-memory and reset
on restart; they are suitable for local development, not multi-instance public deployment.

The server header validator is **not a full JPEG decoder**. The browser performs actual decoding
and Gemini must decode the submitted bytes; a direct caller could submit malformed compressed
data with a plausible header. Nothing is persisted or decoded into server-side image buffers.
Use a hardened image processing pipeline before storing untrusted uploads in a future deployment.

The official SDK's `models.generateContent` receives a fixed observation-only system prompt,
inline image data and a structured response
schema. The server independently validates/allowlists fields, rejects incomplete/blocked responses,
drops unsolicited fields and rejects numeric percentages and treatment/dosage language as defense in depth. A text filter
cannot prove semantic safety or agricultural correctness. Model output remains untrusted and is
never displayed as a confirmed diagnosis or verified treatment. React renders it as plain text.
Google's own data-handling policies apply to live requests; the app's no-persistence statement does
not promise that Google retains no data. No raw images, model responses or keys are logged by us.
The SDK is pinned to Google's developer endpoint, has a 45-second timeout and only one request
attempt (no automatic retries). Provider 429 errors return a safe 429 and `Retry-After: 60`.
Authentication/model configuration errors return 503; provider failures return 502; connection and
timeout errors return 504. Original SDK messages and stack traces are never returned to users.

## Approved agricultural guidance

`server/approved-advisories.json` intentionally starts with empty `approvedSourceHosts` and `entries`.
No agricultural institution, domain, treatment or dosage is assumed approved by the project owner.
The AI cannot write this file or provide treatment text to this section.

To add content later, an authorized editor must obtain approval of the source and actual content,
have the Gujarati content reviewed, and add an entry with:

- `conditionKey`: exact normalized English condition name for catalog matching.
- `approved: true`, `reviewedBy` and a real `reviewedAt` ISO date/time.
- `nameGu`, `symptomsGu`, `preventionGu`, `nextStepsGu`: reviewed content, not model-generated advice.
- `source: { title, url }`: the actual HTTPS source, whose host is explicitly allowlisted.

This describes the structure only; no treatment example is fabricated. The lookup requires the
approval marker, reviewer, nonfuture review date, exact host allowlist and required content.
An HTTPS URL alone is not verification. Demo results never receive real advisories.

## Tests and verification

```bash
npm test
npm run test:ui
npm run build
# With npm run dev running separately and a supported browser installed:
npm run test:e2e
```

- **Backend tests: 21 passed.** Run the real handler with in-memory HTTP streams and an injected
  SDK interface; verify demo/live separation, environment precedence, validation, provider failures,
  redaction, origins, rate limits/retry hints, percentage rejection, content gating and private-file
  access. The SDK constructor contract is tested with an injected class, not the unavailable package.
- **DOM workflow tests: 8 passed.** Mount the real React component and connect it to the real
  handler through in-memory requests. Verify preview, simulated results, retake/cancellation,
  unsupported files, consent, provider-error retry, language switching/persistence and English output.
  Canvas/image decoding is explicitly stubbed
  in these tests; live provider responses are mocked, not real diagnoses.
- **Production Vite build passed.** A final client bundle audit checks that a test-only backend
  key sentinel is absent from built assets.
- **Actual local HTTP/browser verification was blocked.** The environment rejects loopback socket
  binds (`listen EPERM`), and Chrome exits because socket operations are forbidden. Therefore no
  working local URL, screenshot, real mobile camera test, visual layout inspection or full browser
  flow is claimed from this environment. Responsive CSS and the browser test are present but still
  need visual verification on your machine.
- **Live Gemini smoke test was attempted and blocked.** The current `api.env` is empty and `.env`
  has no populated key. The CLI validated the 720 × 500 sample JPEG, then stopped without a provider
  call. SDK installation was also blocked by registry DNS. Request/response behavior is covered by
  test doubles; the real SDK package, credentials and Google-project access remain unverified.

### One-request live test

After installing the SDK and saving the key locally, run from the project root:

```bash
npm run test:gemini -- /absolute/path/to/a/sample-cotton.jpg
```

This invokes the real API handler in memory and makes one live SDK request, so it does not need
permission to bind a local HTTP port. It prints only validation/result metadata, not the key,
image bytes, raw model response or provider errors. The supplied JPEG must be at most 3 MiB with
dimensions within the backend limits. Gujarati is requested by default. This is a real Google
request and may use your project's quota.

Without a path, the test uses `tests/fixtures/cotton-illustration.jpg`, a clearly labelled generated
illustration, **not a field photograph**. The local automated test passed this actual JPEG through
validation and the handler using a simulated SDK response; this does not establish real pest
identification accuracy. Use an actual cotton photograph for a meaningful provider smoke test.

The browser script uses installed Chrome when available, otherwise Playwright's Chromium. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if needed, or install Playwright Chromium normally outside
this restricted environment. It captures desktop/mobile screenshots into ignored `artifacts/` and
tests the explicit demo, actual JPEG canvas preparation, invalid files and retake without calling
live Gemini. It accepts only a loopback `E2E_BASE_URL`.

Frontend dependencies were installed from existing local npm cache archives because registry DNS is unavailable
here. This does not include the newly declared Google SDK. Sandbox process restrictions also required skipping install hooks; the cached native tooling
was subsequently exercised by the successful Vite build. `package-lock.json` uses normal registry
tarball URLs and integrity hashes, with no temporary cache or local registry dependencies. A fresh
machine with registry access should use normal `npm ci` as above. No vulnerability advisory service
was reachable, so an online dependency audit remains a later check.

## Supabase integration later

The migration proposal remains under `docs/kapasmitra-db-review/` and is not run by any npm script.
The frontend has one API boundary (`src/lib/api.js`); backend image validation, Gemini and curated
advisories are separate modules. When database work resumes:

1. Execution-test/review the migrations separately, then add Auth and forward the user's JWT.
2. Create authenticated reports and private image records through a repository adapter; preserve RLS.
3. In the worker, save actual inference image IDs, model name and immutable diagnosis output, and
   transition report status transactionally. Map the current response into those explicit records.
4. Replace the editorial JSON catalog with published, reviewed database advisory records.
5. Implement assigned expert reviews, account retention, orphan upload cleanup and audited admin tools.

Do not expose service-role keys and do not assume the local unauthenticated endpoint is production-ready.

## Implementation references

- [Google image understanding](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding)
- [Gemini generateContent REST API](https://ai.google.dev/api/generate-content)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Current Gemini 3.8 Flash model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [Official JavaScript SDK release v2.31.0](https://github.com/googleapis/js-genai/releases/tag/v2.31.0)
- [SDK HTTP options](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpOptions.html)

These are API implementation references, **not approved agricultural treatment sources**.
