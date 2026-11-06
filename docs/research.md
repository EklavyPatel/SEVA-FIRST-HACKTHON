# Research storage and access

This feature is implemented, locally persistent, and independent of Gemini. It
uses `server/research-store.js` (SQLite), `server/research-api.js` (HTTP access and
image normalization), and `src/components/Research.jsx` (contribution/gallery/
review/Settings UI). The server owns all authorization decisions.

## Farmer workflow

1. Prepare a real crop photo with the existing upload flow.
2. Open the optional contribution panel. Do not include people, phone numbers,
   addresses or exact location. All questions, including district and plant part, are optional.
3. Accept the per-photo research statement and explicitly save. The server
   requires consent version `cotton-research-v1`, records its timestamp, decodes
   the image and stores a metadata-free JPEG plus the supplied crop details.
4. Visit My contributions in the same browser to view review history or withdraw.

Normal AI analysis does not save photos or AI output. Client-labelled sample
illustrations are blocked by the contribution UI, but the server cannot establish
that an arbitrary uploaded JPEG is a real crop photo. Contributions start
unreviewed; researchers must screen and annotate them before dataset use.
There is no implied model-training licence or institutional partnership beyond the
specific research statement shown to the contributor. Establish the actual study
terms and retention process before real-world collection.

## Optional field context

`details.fieldContext` holds only allowed optional keys defined in
`shared/research-fields.js`. The server validates numbers, dates, lengths and
choices before image decoding, drops unknown keys, and never manufactures missing
answers. Omitted plant part is `unknown`. Location and research context are visible
only through the existing owner/researcher access rules and researcher CSV export.

Optional device coordinates require `shareCoordinates: true` in the same object;
both latitude and longitude must be finite and within geographic bounds. The
backend rounds them to two decimal places independently of the browser. The UI
explains that this is device position, not verified image capture position. A
separate checkbox covers sharing these coordinates with authorized researchers and
their exports. No coordinates are collected automatically. Core research consent
remains required even when every question is skipped.

The SQLite additive migration adds `field_context TEXT NOT NULL DEFAULT '{}'`.
Named-column inserts maintain compatibility with databases from earlier editions.
Metadata participates in the idempotency fingerprint; changing it with an existing
request key returns 409. Withdrawal removes the context together with the photo.
The future Supabase adapter should use a JSONB column and preserve these rules.

## Roles

| Operation | Farmer browser | Active researcher |
|---|---|---|
| Save a contribution with consent | Yes | Only as a contributor, with consent |
| Read photos and reviews | Own contributions | Shared consented collection |
| Withdraw | Own contributions | Cannot withdraw other farmers' photos |
| Add a research review | No | Yes; identity comes from the account |
| Export labels/metadata CSV | No | Yes |
| Create/disable researcher accounts | No | No; local operator CLI only |

Research passwords are salted with scrypt. Sessions are random, stored as hashes,
and checked against the account's current active state for every request. The
initial project contains no default accounts. Team membership and affiliation
verification are administrative responsibilities, not inferred from a display name.

The farmer ownership cookie lasts one year. It is not a cross-device identity.
Losing it removes self-service access, not the saved research data; the operator
must arrange withdrawal support. The browser UI warns about this limitation.

## HTTP contract

All endpoints are same-origin and return non-cacheable responses. Host/origin
checks cover research as well as crop analysis. JSON mutation bodies are bounded.

| Method and path | Purpose |
|---|---|
| GET `/api/research/me` | Own contribution count/bytes and optional researcher identity |
| POST `/api/research/contributions` | Explicitly consented save; includes image, metadata, request key and consent version |
| GET `/api/research/contributions?scope=mine` | Current browser's contributions |
| GET `/api/research/contributions?scope=dataset` | Authenticated researcher collection |
| GET `/api/research/photos/:id` | Authorized photo metadata and immutable review history |
| GET/HEAD `/api/research/photos/:id/image` | Authorized JPEG bytes; never a public file URL |
| DELETE `/api/research/photos/:id` | Owner-only withdrawal; cascades annotations |
| POST `/api/research/login` | Researcher username/password login; HttpOnly session cookie |
| POST `/api/research/logout` | Session invalidation |
| POST `/api/research/photos/:id/reviews` | Append annotation with optimistic concurrency check |
| GET `/api/research/export.csv` | Authenticated metadata/label export without photos or farmer identity |

Collection filters: `q` (district/symptoms/latest label), `status`
(`all`, `reviewed`, `unreviewed`), `part`, and `offset`; page size 12.

A contribution includes `requestKey`, `details: { district, plantPart, symptoms }`,
`image: { mimeType: 'image/jpeg', base64 }`, and
`consent: { accepted: true, version: 'cotton-research-v1' }`.
For the same owner and request key, an identical payload returns the existing
record; changed data returns 409. A new browser which lost its ownership cookie
cannot use an old request key to recover ownership.

A review includes `outcome` (`labeled`, `inconclusive`, `unsuitable`), `label`,
`notes`, and `expectedReviewId` (null for the first review). Required notes and
conditional label requirements are validated on the server. A stale review ID
returns 409. Submitted identity fields are ignored. Research labels do not modify
Gemini responses or the verified agricultural advisory catalogue.

## Database operations

`data/research.sqlite` is private, ignored by Git and omitted from deliverables.
It stores contributors, researcher accounts, hashed sessions, research photos with
consent, and append-only reviews. All queries use bound values. Withdrawal clears
image bytes and cascades review deletion inside a transaction. `secure_delete`
clears removed content from database pages; backups and exported copies are a
separate retention responsibility. CSV exports do not persist on the server.

Account commands run from the project root after `npm run setup:backend`:

```bash
npm run research:users
npm run research:users -- list
npm run research:users -- disable username
```

Account creation requires an interactive terminal and a 12–128 character password.
Do not pass passwords in arguments or copy the database into a public repository.
There is no web-based privilege escalation, automatic institution verification,
password recovery, or shared cloud hosting in this local prototype.

Current verification uses temporary databases and a synthetic JPEG. It validates
persistence, decoding/metadata stripping, ownership, role checks, sessions,
concurrency, quota boundaries, withdrawal and export handling. It does not
validate agronomic labels, real institutional access or real-world consent terms.
