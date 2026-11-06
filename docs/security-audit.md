# Security audit and Gujarati verification — 2026-11-04

Configuration follow-up: the misplaced Supabase settings were moved to private
`api.env`; live verification is still blocked by DNS. See
[backend configuration verification](backend-configuration-verification.md). The
findings below describe the earlier audit state; the user reports rotating the
exposed Gemini key. Replacement-key validity could not be checked live.

## Scope and implementation

Inspected React 19/Vite 7 frontend, Node 22 HTTP backend, Gemini SDK calls,
image handling, research/community SQLite stores, environment loading, static
serving, browser preferences, and tests. No AGENTS.md was found. `.git` is an empty
read-only directory, so tracked files/history/remotes cannot be inspected.

At audit start, farmer accounts, admin approval, and live Supabase integration did
not exist. A local researcher username/password login did exist. Historical SQL
under `docs/kapasmitra-db-review/` was not a deployed backend.

The requested optional Supabase account integration and approval UI have now been
added locally. It is disabled until configured. No live permissions, remote data,
GitHub files, hosting visibility, or production records were changed.

## Confirmed findings

### Critical

None confirmed within the inspected local implementation. This is not a claim
that the application is completely secure.

### High

**H1 — Configured Gemini credential in an example file.** `api.env.example`
contained the same credential used by the private backend environment. A shared
checkout/example file could disclose billable API access. Removed the example
value and added an empty-placeholder regression check. No matching credential
was found in source, the built frontend, or the existing ZIP during the scan.
Actual GitHub history exposure is unknown. **Rotation is still required.** No
credential value is included in this report.

**H2 — Vite could serve private workspace artifacts.** `vite.config.js` denied
some environment files but did not deny SQLite/data, ZIP archives, backend source,
artifacts or environment-backup names. Anyone able to reach that development
server could request private files by path. A downloaded SQLite database would
include contributor-token hashes, researcher password hashes and consented photos.
Expanded `server.fs.deny`; also ignored archives/browser traces/environment backups.
Playwright verified `/data/research.sqlite`, `/SEVA_HACKTHON.zip` and
`/server/index.js` now return 403; `/api.env` returns 404. No private response
contents were read. Production already served only `dist/` and passed path tests.
The listener remains loopback-only; impact requires reaching the development server.

### Medium

**M1 — AI paths accepted a JPEG header without decoding pixels.**
`server/image.js` checked magic bytes/dimensions but `/api/analyze` and
`/api/followup` forwarded the original bytes. A direct client could bypass browser
preparation, forward malformed images or embedded EXIF/GPS, and consume provider
requests with invalid content. Both paths now decode with sharp using bounded
pixels, fail on decoder warnings, re-encode to metadata-free JPEG and limit output
size. Tests reject a forged SOF header before any provider call and verify EXIF
removal. Research uploads already decoded/stripped metadata.

**M2 — Concurrency limits were checked before awaiting request bodies.**
`server/app.js` and `server/research-api.js` could let multiple pending bodies pass
before incrementing the active counter. Simultaneously released requests could
exceed the intended two-request inference/decoder limit. Slots are now reserved
before the first asynchronous body read and released on every exit. Three isolated
concurrent invalid requests demonstrate two validation failures plus one 429,
followed by a successful request proving capacity was released.

**M3 — Live-analysis consent existed only in the UI.** `/api/analyze` did not
validate consent. Direct callers bypassed the stated photo-processing choice.
The backend now requires literal `consent:true` in live mode; the frontend sends
the actual checkbox state. This is a privacy boundary, not identity proof or a
substitute for rate limiting. The intentionally supported guest flow remains.

**M4 — Gujarati dosage/confidence filter gaps.** `server/followup.js` accepted
Gujarati-number dosages and unvalidated confidence percentages; ASCII `\d` and
`\b` did not cover Gujarati numerals/units. Shared Unicode-aware guards now reject
these in both model paths. Tests cover Gujarati grams, litres and percentages.
These lexical checks are defense in depth, not proof of safe agricultural content.

### Low / functional defects

**L1 — English content could be accepted as Gujarati.** Language routing was
already correct, but the provider's actual descriptive strings were never checked
for language. A schema key ending in `_gu` does not require Gujarati text.
Follow-up also seeded the model with an English acknowledgement. Both model paths
now receive explicit server-controlled Gujarati-script/English instructions;
Gujarati acknowledgement is used for Gujarati follow-up, and descriptive responses
are checked for the selected script before success. Wrong-language output returns
a localized 502 and never becomes a fabricated diagnosis. This explains how the
reported English-only result could pass the implementation; a provider-specific
cause could not be reproduced live because DNS failed.

**L2 — Follow-up error language and conversation cap.** Several follow-up errors
were always English, and the API accepted a sixth question despite the five-exchange
UI cap. Added localized backend errors, selected-language request headers,
controlled network/timeout handling, and server rejection after five exchanges.
Fresh follow-up processing consent is cleared after each successful answer.

Navigation/focus/search-label/long-content wrapping fixes from the preceding QA
remain in place. Added header account actions wrap on narrow screens.

## Data flow and preserved boundaries

- Browser JPEG/PNG/WebP → browser decode/resize → backend bounded JSON/JPEG decode
  → metadata-free JPEG → Google Gemini after processing consent. No automatic
  retries, fallback diagnoses, external image URLs, or model-authorized database
  operations exist. Analysis results and follow-up stay in memory; no cache exists.
- A separately consented research upload → server decoding/metadata removal →
  private local SQLite image BLOB and optional bounded field context. Approximate
  coordinates require separate opt-in and round to two decimals on both sides.
- Contributor cookies are random, HttpOnly/SameSite=Strict; stored tokens are
  hashed. Image/read/delete paths check ownership. Research dataset/review/export
  require a local researcher session or a verified Supabase role. Withdrawal is
  owner-only even for staff. Existing user A/B/anonymous tests cover these paths.
- Community posts/replies publish only explicitly submitted text after separate
  sharing consent. Photos/diagnoses/location are not copied automatically. SQL is
  parameterized; React renders untrusted text. Browser tests showed HTML/script
  payloads as literal text without execution. Researcher badges are server-derived.
- New account passwords go to Supabase Auth through the backend, never SQLite or
  browser localStorage. Opaque HttpOnly cookies map to process-local access tokens.
  Confirmed email and current protected role rows are checked on protected actions.
  Signup ignores role/admin fields. RLS-backed request insertion uses the verified
  user ID, and review requires admin both in Node and in a reviewable SQL RPC.
  No service-role key is used. Public community labels omit login email addresses.
- CSP, nosniff, frame denial, no-referrer, Host/Origin checks, JSON-only mutations,
  request/body/time limits, and socket-address rate limiting remain. Forwarded IP
  headers are ignored. HTTPS deployments can mark all cookies Secure. No raw
  upstream error message or credential is sent to clients or diagnostic logs.

## Gujarati behavior

`src/App.jsx` language preference → `src/lib/api.js` JSON `language` and
Accept-Language → server `gu|en` allowlist → server-controlled Gemini instructions
→ response parsing/safety/script validation → result with explicit `language`
→ rendering with the original response language. Existing field names remain:
Gujarati `_gu` fields and the existing English neutral shape. Follow-up uses the
current setting, resets history on language changes, and returns its language.

Changing UI language keeps the existing result in its original language, with an
explicit note to rerun. It does not relabel old English text as Gujarati or charge
for automatic regeneration. No cache keys need changing because there is no cache.
Research SQLite stores farmer-supplied text (including Gujarati) as UTF-8; it does
not store generated diagnoses. A safe unclear/non-cotton response remains a valid
result with no forced disease prediction. The reviewed treatment catalogue remains
empty. Practical next steps are localized observation/escalation steps, not cures.

A script check cannot prove idiomatic language or agricultural accuracy. It permits
necessary Latin scientific terms and rejects wholly English/romanized answers in
Gujarati mode. Language failure produces an error rather than another paid request.

## Files changed

- Backend: `server/app.js`, `image.js`, `gemini.js`, `followup.js`,
  `research-api.js`, `research-store.js`, `community.js`, `index.js`;
  new `accounts.js`, `error-language.js`, `output-language.js`, `output-safety.js`.
- Frontend: `src/App.jsx`, `src/lib/api.js`, `src/components/Community.jsx`,
  `src/components/Research.jsx`, `src/lib/i18n.js`, new `src/components/Account.jsx`, `src/workspace.css`.
- Configuration/docs: `.gitignore`, `vite.config.js`, `api.env.example`,
  `package.json`, `README.md`, this report, `docs/account-setup.md`, and the new
  review-only `supabase/migrations/202611040001_account_access.sql`.
- Validation: updated server/feature/UI tests and live-check consent;
  new `tests/security.test.mjs` and `tests/accounts.test.mjs`.

## Verification and limitations

- Existing backend tests: 28 server, 12 research, 4 feature cases.
- Added 11 security and 5 account cases, using isolated data/mocked providers.
- All 60 backend/security/account tests and all 15 DOM tests passed.
- DOM suite includes upload/result/error/retake, language switching, settings,
  research contribution/withdrawal/review and Gujarati live-result/follow-up tests.
- Production build passed. See the final test outputs for aggregate results.
- Playwright MCP: eight pages at widths 1440/390/320 with no horizontal overflow;
  real demo/upload-preview/navigation/FAQ/skip-link checks; mocked auth/admin,
  English/Gujarati analysis/follow-up and malicious-community rendering checks.
  No production records were created or deleted. Screenshots in `artifacts/`:
  `qa-gujarati-demo-mobile.png`, `qa-signup-mobile.png`,
  `qa-admin-mocked-desktop.png`, `qa-gujarati-live-mocked-mobile.png`.
  The latter two explicitly use mocks and are not evidence of live Supabase/Gemini.
- One limited live Gemini attempt used the synthetic bundled JPEG and stopped
  immediately on 503 `AI_NETWORK_ERROR` / DNS `EAI_AGAIN`. No live Gujarati,
  English or follow-up generation was verified. Credentials/model access/quota
  cannot be inferred from that failure. `artifacts/live-language-check.json`
  records only nonsecret status metadata.
- Both root and backend `npm audit` could not reach registry.npmjs.org (`EAI_AGAIN`). Dependency advisory
  status is **unverified**; this is not a clean audit. No version was blindly upgraded.
- Supabase project configuration, SQL execution, live RLS with anonymous/A/B/admin,
  Auth email delivery, existing buckets, deployment/proxy/HTTPS, GitHub history and
  hosting permissions remain **unverified**. The migration is prepared, not applied.
- Single-process in-memory account sessions and rate limits are demo constraints.
  Backend restarts log accounts out; account ownership does not replace guest
  contributor cookies. Moderation/reporting, recovery, account deletion UI,
  retention and shared-hosting operations are not implemented. See setup guide.

## Required operator steps / demo checklist

1. **Rotate/revoke the exposed Gemini key**, update backend private configuration,
   restart and check usage/billing. Inspect the actual repository history privately.
2. Review/apply the account migration in staging; configure public project settings,
   email confirmation and SMTP; provision the specified administrator with a fresh
   password. Do not reuse the predictable password supplied in chat.
3. Execute the staging anonymous/A/B/admin RLS matrix in `docs/account-setup.md`.
   Approve only verified researchers; approval exposes all consented research data.
4. Once DNS/network access works, run the test suites, both npm audits, and a limited
   real Gujarati/English/follow-up check. Inspect the actual guidance with a Gujarati
   speaker and agricultural reviewer. Keep demo results clearly labelled.
5. Keep the hackathon app local until a separately reviewed HTTPS deployment is
   ready. No GitHub push/deployment was performed under the latest restrictions.
