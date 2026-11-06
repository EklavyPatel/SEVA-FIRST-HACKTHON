> Historical implementation notes. The current account/contribution/approval flow
> is documented in [account-setup.md](account-setup.md). Public research browsing
> and the legacy research login are disabled by the current implementation.

# Temporary public research browsing

Enabled on 2026-11-04 with **PUBLIC_RESEARCH_ACCESS=true** in private api.env and
deploy.env. Restart the backend after changing this flag; set it to false to
restore the approved-account browsing gate. Example files default to false.

Research collection browsing, photo details and short-lived image access require
no login while enabled. Review/annotation, approval, CSV export and another
owner's withdrawal remain protected. The page opens the public collection by
default and does not show a research login panel.

The sharing checkbox now explicitly describes public access without login.
Retention and public sharing are separate unchecked choices. The public consent
version is `cotton-photo-public-v1`, and the database stores
`public_research_consent`. Previous restricted-consent records are not republished.
Private retained photos, withdrawn photos, ownership/contact fields and location
information do not enter public responses.

The additive `public_research_browsing` Supabase migration adds that opt-in and a
service-only RPC, `km_public_research_photo_records`. The backend mediates access;
anonymous/authenticated direct RPC execution and private table reads are still
denied. The Storage bucket remains private and existing RLS guards are unchanged.
Issued image links can last up to 60 seconds; downloaded copies cannot be recalled.

Verified: unauthenticated dataset HTTP 200, no login panel, safe SQL privileges,
and a synthetic live public save/list/detail/image flow in a separate guest
context. Private test fields were omitted, unauthorized deletion/review denied,
and the test image was withdrawn afterward. Mocked tests also cover restricted
legacy consent, declined public sharing, privacy and access after withdrawal.
