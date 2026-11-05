# Astra production architecture and operations

This runbook describes `ops/worker.mjs` and `ops/wrangler.jsonc`. The public test is [inflation-watch-astra.dizzyvinci.workers.dev](https://inflation-watch-astra.dizzyvinci.workers.dev/). The custom domain remains pending and is not represented as active.

## Verified production record

On **November 5, 2026 at 04:43 UTC**, scheduled collection successfully fetched the public daily source, computed the report and published it through the private R2 binding. Public `version.json` reported `status: ok`, `mode: collector` and version `59106aecbc3821ba`. Its referenced immutable JSON was retrieved successfully, with basket version 2, 50 indexed rows and 29 cash rows; its source date matched the pointer.

| Clock | Verified value |
| --- | --- |
| Collector check began | `2026-11-05T04:43:46.813Z` |
| Last successful full fetch completed | `2026-11-05T04:43:49.137Z` |
| Provider publication | `2026-11-04T08:30:56+00:00` |

The provider publication remained dated after collection. This is a record of a successful production invocation, not evidence of new individual trades, a continuously connected authenticated feed, a load test or an uptime guarantee. Later live status is available at [/health.json](https://inflation-watch-astra.dizzyvinci.workers.dev/health.json).

The first production attempt exposed an edge-runtime incompatibility with fetch redirect mode `error`. The collector now uses supported `manual` mode and rejects redirect responses explicitly, while allowing conditional HTTP 304 responses. It never follows the supplied redirect location. The regression tests verify retention of the last-good report and clocks when a redirect is rejected. Code upgrades also remap obsolete compiled-seed fallback pointers to the current compiled seed without visitor storage writes or a fabricated collection time.

## Delivery and collection

```text
Code changes → Python static build → Worker + Static Assets deployment

Scheduled collector, every ten minutes
  → conditional request to the public daily source
  → validate and compute using the compiled immutable seed
  → private raw-feed/state cache in R2
  → immutable data-<16 hex>.json
  → version.json pointer published last

Visitor → Cloudflare Static Assets for UI/images
        → Worker edge cache/R2 for allowlisted public JSON
        → no provider requests
```

The frontend checks `version.json`; it must consume `sourceStatus` even when the content version is unchanged. A 304 or unchanged valid 200 updates pointer status without publishing another full report. New source values create a content-addressed report before the pointer advances. The original full cash-denomination seed is always the compute input; a previous report is only retained data/history, never the next basket or NX schedule.

Only `/version.json`, `/data.json`, `/data-<16 lowercase hex>.json` and `/health.json` are dynamic public JSON paths. A hashed object must match that exact name format. There is no public collection/admin endpoint. Raw source feed, validators, lock and state use private `_private/` keys and cannot be requested through the snapshot handler. The R2 bucket must remain private; no `r2.dev` URL is required.

Static asset requests avoid Worker execution by default. Selective Worker-first routing applies only to the configured JSON paths. Pointer/status responses use a 30-second edge cache; immutable report responses use a one-year cache. Active-page polling and edge propagation add delay to the scheduled cadence, which is also bounded by the source's actual publication frequency.

## Clocks, failure and retained history

- `sourceUpdatedAt`: the provider's actual dated publication, preserved on unchanged/error checks.
- `sourceStatus.checkedAt`: collector attempt start, including failed attempts.
- `lastSuccessfulFetchAt`: completion of the last validated full HTTP 200 fetch; a 304 does not renew it.
- `builtAt`: the immutable report computation time, preserved when no report changes.
- Separately dated scanner captures, offers and comparisons never receive a new observation timestamp from a daily poll.

The collector sends `If-None-Match` and `If-Modified-Since` when available, identifies the public repository in its User-Agent, rejects redirects, limits the body to 5 MB and times out fetching after 20 seconds. It rejects malformed/future/regressed sources and missing indexed members. HTTP 429 `Retry-After` persists a cooldown; skipped cooldown invocations do not claim another provider check.

Overlapping invocations use an R2 conditional lease capped at 120 seconds. Conditional writes protect private state and the public pointer. R2 has no conditional DELETE in its Worker binding API, so release conditionally writes an expired lease tombstone. It cannot blindly delete another collector's lease. A losing publication may leave an unreferenced immutable report; the public pointer stays on the winning/last-good report. These multiple object writes are not a cross-object transaction.

Where the frozen method matches, retained daily CPI/volume series merge by day and new source points replace matching dates. V1 and v2 are never spliced. Those series are capped at 7,300 dates. Source/item histories are bounded to 365 days for computation and publication; older immutable report objects are not rewritten. Frozen base prices, base NX rate and selection-source metadata survive a rolling source window. Missing context items retain their own original source date and activity-window bounds.

On source failure, the collector keeps the last-good version and marks pointer status degraded. If storage/pointer is unavailable, the compiled dated seed supplies startup/fallback data with an explicit fallback status. `/health.json` exposes only public version, clocks, mode, status and cooldown information.

## Configuration and deployment

Current target:

| Setting | Value |
| --- | --- |
| Worker | `inflation-watch-astra` |
| Assets | `dist/`, binding `ASSETS` |
| Private bucket | `inflation-watch-astra-data`, binding `SNAPSHOTS` |
| Cron | `3,13,23,33,43,53 * * * *` (UTC) |
| CPU cap | 1,000 ms per invocation |
| Observability | Enabled, 1% head sampling |
| Usage model | Omitted; preserve configured account/Worker model |

Run from the repository root with a compatible Node/Wrangler installation and authorized Cloudflare authentication. The account ID is already explicit in `ops/wrangler.jsonc`; a different operator must select their own target. Use existing scoped credentials. Dashboard sign-in alone is not proof of CLI authentication or binding permission. Runtime R2 bindings do not require putting a storage token in Worker code.

```sh
npm run check
npm run test:worker
npm run test:dom
python -m unittest discover -s tests -v
python engine.py --offline
npm run deploy:check
npm run deploy
```

The dry run validates bundling/configuration without publishing. It does not prove the token can publish/bind R2, that the bucket exists, that the cron is installed or that runtime reads/writes succeed. Verify imported `dist/data.json` and `config.json` share the same frozen basket version before deploying. Stop/restart old Python preview collectors after code changes so an older imported engine cannot overwrite the static seed.

After deployment, inspect the returned URL, UI, `/version.json`, `/health.json` and the referenced report. Confirm a real scheduled check changes `checkedAt`, preserves the provider timestamp when unchanged and records a valid R2-backed collector mode. Cron configuration can take several minutes to propagate. Do not create a public force-refresh route to shortcut this verification.

For rollback, use the previous Worker deployment; retained immutable report objects remain available. Inspect health/source dates before publishing claims about update frequency. If the source fails, repair collection while the last-good report remains served. If a token lacks deployment/binding permission, report the exact missing operation rather than expanding credentials by default.

## Prepared API schema probes

The optional hosted API collector is disabled by default: `API_GRANT_JSON` is
`{"enabled":false,"publicationEnabled":false}`. Scheduled checks return before
reading its key, creating a Durable Object instance or making an API request.
The normal daily collector operates independently. Registering the internal
`ApiGrantCollector` class and its SQLite namespace does not activate collection.

After an actual approval, record the granted scope and limits separately from
the requested allowance. Configure the server-side secret
`MAPLESTORY_MARKET_APPROVED_API_KEY` and an explicit reviewed grant only then.
One fixed Durable Object owns the account-wide request budget; do not run a
separate Python collector against the same allowance. The six documented GET
probes include Apple detail/history and capture private raw schema receipts, with persisted spacing, rolling
minute/day budgets, Retry-After and an authentication stop. Their existence is
not evidence of historical coverage, sales quantities, item variants or a live
intraday feed.

`API_RAW_RECEIPTS` aliases the existing private R2 bucket under
`_private/provider-api/v1/`. Keep public bucket URLs and custom domains disabled.
No HTTP route exposes the receipts or collector administration. Raw response
bytes and their hashes are retained for inspection; parsed JSON is explicitly
only a potentially lossy view. Publication remains prohibited even after raw
collection is enabled. Schema validation and normalization require a separate
implementation once actual responses and provider permissions are available.

An optional `API_SCHEDULE_JSON` enables alarm-assisted scheduling after explicit
grant and operator-budget review. It remains absent/off by default. One alarm
runs at most one metered request, preserving existing attempts, deadlines,
authentication stops and Retry-After across restarts. Recurring raw checks require
an explicit bounded plan. Faster scheduling does not activate normalized prices,
historical backfill or public API data automatically.

Private `_private/provider-api/v1/health.json` records owner checks, queue counts
and a bounded index of the initial schema receipts. Its check time is separate
from provider observations, and the public `/health.json` still describes the
daily collector. Storage-only pointer repairs use durable exponential backoff
without repeating a successful provider request.

The optional private calculation stage uses `API_PRIVATE_CASH_JSON` with exactly
`{"schemaVersion":1,"enabled":true,"methodVersion":1,"publicationEnabled":false}`.
It validates retained original bytes and creates a private, attributed 29-item
projection. It uses sale medians and reported sale-count weights; physical units,
asking prices and source averages do not replace those fields. Missing records
remain missing. This does not update the public headline or publish API prices.
One existing owner multiplexes provider and calculation deadlines, with one heavy
operation per alarm event. Separate durable jobs and outboxes retain retries,
quarantine and last-good results without another upstream request.

An explicit `nxSchemaProbesEnabled:true` grant flag plus both `nx-rate` and
`nx-history` in `allowedOperations` permits two additional capability probes
after the original six complete. Their fixed keys retain the same owner, round
and request ledger. They do not enable recurring offer collection. Server
acceptance is not assumed from the public client helper: authentication failures
stop collection, and no browser-session or challenge fallback is implemented.

When passing JSON runtime overrides through PowerShell, use PowerShell 7 or
newer (`pwsh`). Windows PowerShell 5 can strip JSON quotes in native arguments.
Verify the deployed variables against the reviewed configuration, the existing
Durable Object namespace and server-secret binding before declaring success.
Never print the secret value to perform this verification.

`API_OBSERVED_FIRSTPASS_JSON` is a separate, absent-by-default finite backfill
switch. The compiled plan pins 1,551 observed item IDs, including 79 priorities
and the 50 supplemental fashion identities. One detail and one retained-history
request per ID produce 3,102 jobs. The raw plan SHA256 is
`a271b2597096100cb8fa18c123f16a845ff9471b78deea2f61d0823ce427ccd8`.
Enqueue at most 32 jobs per chunk with a 64-job pending high-water mark; all
requests use the existing account-wide reservations, pacing and budgets.
The operator's daily cap must be reviewed independently of the provider's
displayed per-minute allowance; an unknown daily grant must remain unknown.
Do not run a second collector or reset the existing round to obtain more quota.

The finite plan binds registered keys, ordinals, item IDs and source-presence
metadata before reserving a request. Unknown item names remain unknown.
An item/history 404 becomes a per-job unavailable result; 401/403 still stops
the account. Bounded retries retain their attempts and Retry-After cooldown.
Track complete, unavailable and failed results separately: a terminal queue does
not prove that every item has history. Chunks, leases and the cursor survive
restarts. Existing bulk refreshes continue, while repeating the full per-item
plan or publishing its raw data requires a separate implementation decision.

`API_PUBLIC_CASH_JSON` is a separate derived-display switch, absent by default.
The reviewed opt-in is `{"schemaVersion":1,"enabled":true,"methodVersion":1,"publicationEnabled":true}`.
It also requires the existing private29 projection to remain enabled. It does
not turn raw collection publication on or alter the goods-inflation headline.
The existing owner stages a whitelisted29-item subset in a separate durable
outbox and alarm event. Storage retries reuse saved bytes and never request the
provider again. Original private receipts, player/shop records and progress
metadata remain private.

`GET /api-cash-items.json` serves only that validated subset through the existing
preview gate. It coalesces storage reads for30seconds, supports ETag/HEAD, and
retains verified last-good bytes and their original retrieval clocks on a
storage failure. A cold missing/invalid publication returns503; disabled returns404.
The29bound identities carry attributed source links, fixedNX costs, source sale
medians and reported sale counts. Counts are not physical units. The source
reports a three-day lookback without exact bounds or individual-sale timestamps;
neither an HTTP cache refresh nor owner health establishes new market evidence.
Keep partial/null rows visible and separate from historical daily-source data.

## Traffic and build planning

Data checks do not rebuild the site: ten-minute scheduling is approximately 4,320 invocations per 30-day month, independently of visitor traffic. Deployments happen on code changes. The [Workers Static Assets billing documentation](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) describes static requests as free and unlimited; JSON Worker invocations, CPU and R2 operations are separately metered under the account's actual plan. See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [R2 pricing](https://developers.cloudflare.com/r2/pricing/) for current terms.

For scale estimates, 500,000 visits with five pointer checks each produce about 2.5 million dynamic pointer requests before other JSON requests. Concurrent tabs and long sessions can produce much more. Account-wide usage, bots, actual payload size, cache hit rates and CPU must be measured; this design is not a capacity or cost guarantee. Pages deployment quotas and Workers build-minute allowances are different products and are not interchangeable.

API credentials and collection opt-ins remain server-side. This deployment workflow does not submit applications, register domains or change DNS. Configure only the source permissions and limits actually granted to the deployed account.
