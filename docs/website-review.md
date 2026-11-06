# Local website review — 2026-11-04

Used the installed Sites skill's local-only preview/verification workflow and
Playwright browser tools against the existing server at
http://127.0.0.1:5173. No server was started/stopped, no source code was changed,
and no deployment, signup email, paid Gemini request or Supabase write was made.

## Findings

1. **Research photo storage is unconfigured (functional setup blocker).** The
   running `/api/health` reports `researchAvailable: false` and
   `services.photos: unconfigured`. It reports analysis/accounts configured and
   community using SQLite; `connectivityChecked: false` correctly distinguishes
   configuration from real provider connectivity. Complete the separately
   reviewed [photo setup](supabase-photo-storage.md) before expecting cloud photo
   saving. No migrations or elevated credentials were applied during this review.
2. **Tablet brand/home link has no accessible name (accessibility issue).** At
   width 780px, Playwright's accessibility snapshot shows the `.workspace-brand`
   anchor as an unnamed `link`. `src/workspace.css:227` hides its text at
   761–980px, leaving an aria-hidden decorative icon; the anchor in
   `src/App.jsx:229` has no aria-label. Add a localized accessible name to the
   link, independent of responsive text visibility. This was observed and
   reported, not changed during the review.

## Checks completed

| Check | Result |
| --- | --- |
| Live browser loads website and backend health | Pass |
| Sample illustration → explicitly labelled demo results | Pass; no Google request |
| Research, community, guidance and about navigation | Pass; correct route and visible headings |
| Signup form rendering and required empty-email validity | Pass; no signup submitted |
| Gujarati/English language switch and page title | Pass; restored English |
| Invalid text-file upload | Pass; JPG/PNG/WebP error and analysis disabled |
| Horizontal overflow at 390, 780 and 1440px | None observed |
| Browser console errors during this review | Zero |
| `npm run test:ui` | 17/17 pass |

The DOM test suite uses mocked providers and covers additional consent,
failed-save/retry, research annotation and withdrawal flows. Those passing mocks
do not establish live Supabase storage/RLS or email delivery. Live signup,
confirmation, paid AI analysis and photo saving were intentionally not exercised
in this website review.

## Screenshots

- [Desktop](../artifacts/site-review-desktop.png)
- [Mobile](../artifacts/site-review-mobile.png)

Skill reference: `/home/hp/.codex/plugins/cache/openai-curated-remote/sites/1.1.3/skills/sites/SKILL.md`,
with `references/preview/local.md`. This was local inspection only.
