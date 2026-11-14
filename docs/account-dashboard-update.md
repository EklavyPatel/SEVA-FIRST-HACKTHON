# Account and administrator workspaces

My Account now groups profile/role information, crop/photo/community shortcuts,
research permissions and the latest application status into separate cards.
Dataset access reflects the server-returned role. Photo contribution remains
available to every signed-in account without research approval. The account
page links to the existing application and dataset routes; it does not add
profile editing or change privileges.

The admin workspace adds a page summary, Pending/Reviewed/All filters, search
within the loaded page, and application cards with separate context and review
panels. Counts are explicitly scoped to the current page and filter, not
advertised as totals for all accounts or requests. Pagination still uses the
existing 25-item API and server `hasMore` flag. Dates, applicant information,
status, revision, reviewer notes and history come from the existing API.

Reviews use the existing revision-checked endpoint. Self-review is disabled,
rejection/revocation require a reason, and every decision disables duplicate
actions while pending. Backend role/RLS enforcement remains unchanged. Failed
loads now leave Refresh status enabled so users can recover without reloading
the whole website. No database migration or additional service is required.

Both workspaces use Gujarati/English labels and responsive layouts with the
existing light/dark theme variables. New copy distinguishes unavailable data
from loading and empty results.

Validation: backend suite (16 test files), 19 full-app UI tests, six focused
account UI tests and production build pass. Added focused coverage exercises
search/filtering, status counts, decision revisions, required review reasons,
self-review protection, failed-load retry, pagination and Gujarati account
permissions/status. Chromium checks used synthetic routed account/application
fixtures on desktop and 390px mobile; both pages fit without horizontal
overflow, and admin search/filtering worked. No production account data or
research permissions were changed during verification.

Local previews: `artifacts/admin-dashboard-desktop.png`,
`artifacts/admin-dashboard-mobile.png`, `artifacts/my-account-desktop.png`,
and `artifacts/my-account-gujarati-mobile.png`.
