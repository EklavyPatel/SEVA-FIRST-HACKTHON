# Signup email-limit diagnosis

## Confirmed live cause

Read-only Supabase edge logs show `/auth/v1/signup` returning HTTP **429** with
**over_email_send_rate_limit** at 2026-11-04 16:23:21, 16:29:15 and 16:31:37 UTC.
The matching Auth logs report the same status/code. Retry-After was not available
in captured log attributes; no reset time is claimed. These are provider email
sending denials, not the backend's local account limiter or database/RLS denials.

The exact displayed message was the English `ACCOUNT_RATE` string in
`src/components/Account.jsx`. Previously, `server/accounts.js` mapped every
upstream 429 to that code. The local limiter also used ACCOUNT_RATE, masking
which service rejected the attempt. No unrelated 400/500 is mapped to rate limit.

Two recorded mail events use a Supabase sender domain. This supports use of the
built-in sender at those send times; it does not independently prove the current
SMTP dashboard setting. Available MCP tools do not expose Auth SMTP configuration
or organization membership, and no management credential is configured. Current
custom SMTP enablement and the intended recipient's team membership still need
the owner's dashboard check. No SMTP credentials, recipient addresses, passwords,
keys or tokens were selected into diagnostic output.

## Code fixes

- Distinct ACCOUNT_LOCAL_RATE, ACCOUNT_EMAIL_RATE and ACCOUNT_PROVIDER_RATE
  responses. email_address_not_authorized maps to ACCOUNT_EMAIL_RECIPIENT.
- Allowlisted provider codes/status and numeric Retry-After (seconds or HTTP date)
  enter sanitized diagnostics; arbitrary provider bodies/codes do not. Known retry
  seconds are returned in JSON and Retry-After. Missing/invalid timing stays null.
  Local limiter reports the actual remaining bucket duration, rather than a
  fixed ten minutes after every rejection. Capacity protection does not invent
  a retry time. The 15 attempts per ten-minute window remains enforced.
- Explicit submit-button disabled state and a synchronous ref guard prevent
  two submit events in the same React update from sending two requests. Existing
  disabled fieldset remains. There is no automatic signup retry, retry timer,
  signup effect, or signup-on-mount behavior.
- Mocked regression tests exercise email/request/unknown/local rate errors,
  rejected recipients, known/unknown retry timing, malformed 429 bodies,
  per-app limiter isolation, pending button state and same-tick duplicate submits.
- `npm test` fixtures use injected fetch implementations and their own createApp
  instances, never the running development backend or Supabase email delivery.
  Browser QA uses the running app but contains no signup/login action. Vite
  forwards browser requests through loopback, so actual local users/tabs share
  the backend IP bucket. No forwarded-IP trust bypass was introduced.
- The explicitly invoked live script shares the project-wide provider limits
  even though its own backend limiter is isolated. `--signup` now sends at most
  ONE signup, instead of A and B (which could consume the built-in hourly quota).
  It does not retry. `--single` can verify A's confirmed login/read/logout without
  a second account; it explicitly leaves cross-account isolation untested.

## Dashboard setup if using built-in sending

Supabase's built-in sender currently allows **two emails per hour per project**
across email-sending Auth endpoints and only delivers to the project's
organization team member addresses. Merely creating an Auth user does not make
that email a team member. Check the address under the project's organization
Team/Members and Authentication email settings. A quota denial does not establish
whether the blocked recipient would pass the separate recipient restriction.
Use a controlled permitted team mailbox for the demo, or configure custom SMTP
for normal website users. Do not add arbitrary website users to your project team.

For custom SMTP:

1. In an email provider, verify the sending domain/address and configure the
   provider-required DNS records (SPF/DKIM; DMARC as appropriate). If the provider
   account is sandboxed, verify the test recipient or obtain sending approval.
2. Open Supabase **Authentication → Email → SMTP Settings** (the Custom SMTP
   section), enable custom SMTP, and enter the verified sender address/name,
   SMTP host, supported port and SMTP username/password supplied by the provider.
   Save credentials in the dashboard, not frontend source or chat. Disable email
   link tracking if the provider rewrites confirmation links.
3. In Authentication → Rate Limits, review the email-send limit and set it within
   the provider's approved quota. Custom SMTP initially has a separate low default;
   enabling it alone is not a promise that arbitrary request volume succeeds.
4. Keep email/password signup and **Confirm email** enabled. Under URL
   Configuration, use the intended app Site URL and permit the exact callback,
   locally `http://127.0.0.1:5173/#/login`. Do not broaden redirect patterns.
5. After provider limits permit another attempt, make one signup using a mailbox
   you control. A 202 response means confirmation requested, not proven delivery.
   Open the confirmation link, return to Log in, log in with the same password,
   and verify the account and request lookup, then logout. Do not manufacture
   confirmation by editing auth.users or disabling confirmation.

## Limited live verification

No new email was sent during diagnosis. The intended controlled mailbox and
SMTP/team-member check were requested from the owner. No test account credentials
were available, and inbox confirmation requires the mailbox owner. A fresh full
signup → inbox confirmation → login flow remains unverified until that input is
available. Existing logs confirm the rejection but do not prove a later successful
confirmation flow.

For a controlled run, put TEST_AUTH_EMAIL_A and TEST_AUTH_PASSWORD_A privately in
api.env (do not pass passwords on a shell command line). Explicitly run
`node scripts/test-auth-live.mjs --signup` once. After opening the email link,
run `node scripts/test-auth-live.mjs --single`. These commands print status and
sanitized diagnostics, not credentials or session tokens. Do not run them as part
of automated tests or repeatedly retry when email quota is exhausted.

No deployment, live SMTP changes, rate-limit removal, RLS changes or email
confirmation bypass was performed.

Official references:
[Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits),
[custom SMTP and permitted recipients](https://supabase.com/docs/guides/auth/auth-smtp),
[Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes).
