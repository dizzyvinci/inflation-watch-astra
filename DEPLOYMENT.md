# Astra production architecture and operations

This runbook describes `ops/worker.mjs` and `ops/wrangler.jsonc`. Deployment, bucket binding and scheduled execution must be verified against Cloudflare before describing the service as continuously updating.

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

## Traffic and build planning

Data checks do not rebuild the site: ten-minute scheduling is approximately 4,320 invocations per 30-day month, independently of visitor traffic. Deployments happen on code changes. The [Workers Static Assets billing documentation](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) describes static requests as free and unlimited; JSON Worker invocations, CPU and R2 operations are separately metered under the account's actual plan. See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [R2 pricing](https://developers.cloudflare.com/r2/pricing/) for current terms.

For scale estimates, 500,000 visits with five pointer checks each produce about 2.5 million dynamic pointer requests before other JSON requests. Concurrent tabs and long sessions can produce much more. Account-wide usage, bots, actual payload size, cache hit rates and CPU must be measured; this design is not a capacity or cost guarantee. Pages deployment quotas and Workers build-minute allowances are different products and are not interchangeable.

The authenticated-source application remains **DRAFT ONLY**. No provider-key submission, new authenticated feed, domain purchase or DNS mutation is part of this deployment workflow.
