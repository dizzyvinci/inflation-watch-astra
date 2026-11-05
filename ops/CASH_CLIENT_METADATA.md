# Broader client catalog archive

The optional browser loads an owned, sanitized static archive only after the user
opens “Broader client catalog” on the cash-catalog page. Its metadata never enters
MPI, the frozen Cash Basket, the NX29 estimator, or observed market rows.

The initial manual public research capture completed on November 5, 2026 at
11:48:27.840134 UTC. The documented MapleStory.io MCW/1 bulk item-list endpoint
with `cashFilter=true&count=10000` returned 4,706 distinct explicit cash-flagged
records (2,755 equipment items and 1,951 hair/face styles). The separate filtered
count endpoint confirmed 4,706. The source response was 2,500,435 bytes. Original
raw captures and HTTP receipts are retained privately outside the public export.

Public provenance is `assets/cash-client-catalog-provenance.json`. The small
`assets/cash-client-catalog.json` manifest names a SHA-256-addressed immutable
archive. Only allowlisted item IDs, names, cash flags, categories and source
metadata are public; no local paths, account information, credentials, raw images,
sender identities, or visitor information is included. Preserve older hashed
archives. Identical input produces identical archive bytes.

To archive an already verified local candidate (no source request is made):

```text
python ops/archive-client-cash-metadata.py --candidate PATH_TO_PRIVATE_CANDIDATE.json
```

Unattended metadata refresh is **not connected**. A future owned background
adapter can make one daily bulk request, aligned with the observed provider cache
TTL of 86,400 seconds, and optionally check the count for completeness. Use the
documented `startPosition`/`count` only for bounded pagination if the first page
becomes insufficient; do not crawl thousands of individual items. Validate
explicit `isCash:true`, unique IDs, names, complete counts, a 10,000-record bound
and a response-size limit before archival. Preserve receipt clocks and hashes,
deduplicate unchanged content, and append revisions instead of erasing evidence.

Client presence is not proof of release or sale availability. This endpoint's
result consists of equipment and appearance metadata; independently evidenced
cash consumables and market rows must remain. Game release dates and current
reward pools require separately dated official announcements or supported public
observations. API response Date/Last-Modified headers are not game patch dates.
Random crate prices do not establish direct NX costs for particular rewards.
