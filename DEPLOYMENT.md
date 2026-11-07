# Astra architecture and operations

This is the current runbook as of November 7, 2026. The earlier runbook is preserved [here](https://github.com/dizzyvinci/inflation-watch-astra/blob/9a76a7e4f03df6c9c362375f950da3139e4e7b24/DEPLOYMENT.md). Historical defaults, approval status and old operator scripts do not override the current verified runtime.

## Verified baseline and access

The most recently verified deployment at this checkpoint is commit `9a76a7e4f03df6c9c362375f950da3139e4e7b24`, Worker `71348825-95e1-413e-af4f-01fc6725269f`. Both [inflation.gg](https://inflation.gg/) and [the Worker alias](https://inflation-watch-astra.dizzyvinci.workers.dev/) require the existing whole-site password. A signed eight-hour session also unlocks design controls after the actual server session check. A DOM marker or event cannot confer authentication.

Personal author information remains omitted from generated HTML and replaced by a DRAFT placeholder. The full Methodology and Compare pages are available after the verified private-session handshake. Preserve the earlier clean public-review restore point if a later API application needs anonymous URL review. Do not change access mode merely to silence a monitor warning.

The deployed CPU execution cap is 30,000 ms. The actual subscription plan, sustainable throughput and exclusive Durable Object headroom are separate questions. Prior bounded HTTP tests and configured client counts do not certify 10,000 concurrent users or a million daily visits.

## Collection and derived publication

```text
Public daily collector (existing ten-minute cron)
  → conditional public-source fetch
  → frozen-v2 legacy calculation and retained histories
  → immutable report, then mutable pointer

Approved provider (one existing account owner and ledger)
  → paced, charged request → immutable private raw receipt
  → validated normalized evidence and original provenance
  → durable derivative outboxes / immutable bodies
  → approved typed own-site readers

Browser → whole-site gate → static UI and bounded own-site caches
        → no provider fetch or visitor-owned collection job
```

The provider API is approved and collecting. Runtime secrets and the reviewed grant are server-side; do not read or print their values. The checked-in configuration intentionally contains disabled defaults and is not the live runtime settings inventory. Deploying those defaults over an active owner would be a regression.

The existing owner, round, Durable Object namespace and key binding must survive code upgrades. Preserve charged attempts, in-flight leases, callbacks, deadlines, explicit pauses, authentication stops and `recoveryVersion1`. Do not create another key consumer, reset the round/ledger, rotate credentials for quota, force a provider callback for proof or bypass browser/session/challenge protection.

The actual provider allowance is 30 requests/minute; its daily grant is unknown. Operator restrictions are at most 30,000 attempted requests per rolling 24 hours and starts at least 2,500 ms apart. They do not establish a provider daily grant. Honor 401/403 stops and 429/Retry-After. Existing status/prices/catalogue/overview/NX/per-ID schedules share this same accounting. The completed finite 1,551-ID first pass must not silently become a repeated startup backfill.

The current calculation bridge consumes accepted receipts for the fixed 50-goods / 29-fixed-NX calibration and actual overview daily history. Downstream browser views reuse validated typed results without new provider requests. This is not a claim of globally single-parse source normalization: fallback paths and the default-Off shared-overview optimization remain separate. Publication, receipt, source day/hour and actual trade time remain distinct; unknown trade times stay unknown. The three-day bulk reference is not daily history. No seven-day-to-three-day fallback is permitted.

Item/identity publication, per-ID refresh and finite hourly history have independent generations and readiness. The finite hourly public scope is item `1082002`, Steel Fingerless Gloves, explicitly pinned to its approved generation. It must not follow a newer private generation or expand to all items automatically. Existing stat filters do not apply to mixed-roll whole-item hourly aggregates.

## Serving, caching and failure

`ops/worker-entry.mjs` registers the current Worker and owner. `run_worker_first: true` places the whole-site gate before static assets and dynamic routes. This differs from the historical selective-JSON routing design.

The allowlisted route families include the legacy report/pointer/status paths, `/api-cash-items.json`, `/api-nx-offers.json`, `/api-market-calculations.json`, bounded item identity/price readers, approved NX history and the explicitly pinned finite item-hour manifest/known hashed pages. Exact endpoint schemas and bounds are enforced by their route modules. Unknown IDs/hashes do not fall through to a raw bucket mirror or an ad hoc provider query.

R2 remains private. Raw receipts, provider credentials, player/shop strings, jobs and private owner diagnostics are not public API responses. Public item summaries and filters contain only approved projections. An item identity or name match does not imply a sale, stock, price, exact quantity or conversion eligibility.

Anonymous requests encounter the expected password gate, including data paths. Authenticated response cache headers preserve private access boundaries. Within the Worker, bounded caches coalesce concurrent storage reads, retain validated last-good bodies and back off on failures. A retained result keeps its original capture clocks. A cold missing/invalid publication stays unavailable; it does not fabricate empty data. ETag/HEAD/304 behavior is tested for the enabled route families.

The UI polls own-site data while visible and online, and invalidates dependent views when a new accepted body/hash arrives. Data checks do not redeploy or rebuild the static UI. Hash-named UI assets and old report objects remain available across releases. The local preview shares own-site caches/session access and does not use the provider key.

The legacy daily source remains separately dated November 4, 2026 at 08:30:56 UTC at this checkpoint. API calculation receipts may be newer without refreshing legacy market-activity evidence. NX offers are not completed trades; native summary windows, source last-heard labels, derived histogram pools and hourly proxies must not be conflated. Reported counts, median×count turnover estimates and individual trades are distinct quantities.

## Release procedure

1. Preserve the previous source snapshot, failed candidates, content-addressed assets and immutable report/history objects. Do not touch the separate Claude project.
2. Freeze reviewed current source and a finite file manifest. Distinguish existing afterimages, new production files, tests, documentation and validation-only copies. Do not replace a current whole Worker/app with a stale candidate copy.
3. Run appropriate Python, Worker and DOM/browser checks. Use the existing deterministic builders for generated modules and CSS. Verify that generated HTML preserves the redacted footer and that source hashes match browser manifests. Keep existing test commands and their ordering constraints.
4. Export through the reviewed explicit allowlist and verify every archive file against its manifest. No wildcard ops expansion or private tool/receipt inclusion. CI must test the actual release candidate; an earlier green run is historical evidence.
5. Use a newly reviewed operator bound to the actual active baseline, current CPU limit and all 25 plaintext override texts (24 API settings plus access mode), without reading secret values. Check the same namespace/key-binding metadata/owner/round. A verification-only operator for a previous UUID cannot deploy the next release.
6. Deploy once only after the coherent review/CI/export gates pass. Preserve every current runtime text byte-for-byte unless a separately authorized configuration change is the explicit purpose of the release. Do not buy a plan or change DNS as part of routine code release.
7. Independently verify the active deployment percentage/version, CPU cap, binding metadata and exact runtime texts. A normal changed script ETag is permitted only by a reviewed closed metadata comparison; it is not remote source-code attestation.
8. Verify both hosts anonymously and through the actual signed session: gate, controls, typed API responses, HTTP GET/HEAD/304 semantics, exact UI assets and browser rendering. Verify local own-site parity separately. Password/session material stays in RAM or stdin, never files, environment, command arguments or logs.
9. Install the matching reviewed monitor-access policy pair only after its release/runtime proof is valid. Preserve the original monitoring schedule and last-good clocks. Record deployment, artifact, configuration, source and browser evidence separately.

The checked-in `npm run deploy:check` and `npm run deploy` commands are operator primitives. They do not on their own preserve the active private runtime configuration or satisfy this release procedure. CI/source checks are not permission to replace current grants with checked-in disabled defaults.

## Diagnostics and recovery

Use bounded own-site or own-R2 inspections on meaningful transitions. A SQL health record proves committed metadata at its recorded check, not remote artifact availability, current pointer equality, a new trade or full-game coverage. For private graph verification, save independent committed SQL pins before downloading the pointer/body/pages; never obtain expected hashes from the downloaded pointer itself.

Observe automatic owner adoption and selected deadlines without resetting them or forcing RPC/provider work. Deferred owner code updates can lag Worker version metadata. An incomplete callback or observation timeout is not proof that a job stopped. Recovery must retain source ownership and charged attempts; an explicit pause/authentication stop remains stopped.

For code rollback, restore a verified prior deployment and its matching runtime/access/monitor policy, while retaining immutable history. For a bad derived artifact, hold that publication and serve an explicitly dated last-good result where its contract allows it. Do not overwrite raw receipts or rewrite source clocks to conceal the problem.

The local preview should have one collector per checkout. A restart is deliberate and only after code/configuration changes require it. Re-authenticate through the existing prompt or stdin; RAM-only sessions are not transferred between processes. Preserve cadence settings and original source clocks; exact next-due continuity requires separate verification. Do not start a second provider consumer to repair a local display issue. Optional resource monitoring must use the existing reviewed process/schedule or a controlled single-process handoff; a stale saved PID is not proof that monitoring is running.

## Unfinished and disabled work

Faster full-catalogue updates, continuous FAST admission/slot reuse/reference release, broader all-market/fashion derivations, durable model-history integration, additional item-hour scopes, scanner/OCR intake, inventory valuation, EV/arbitrage studies and capacity validation remain unfinished. WORK packets and passing Node tests do not activate these paths. Retention planning is not authorization to delete raw/source history.

Current runtime proof distinguishes disabled shared-overview optimization, stamp sidecar/fixed-fashion pilot and admission-governor switches from reviewed code foundations. Do not infer availability from a module, test fixture or preview toggle. Actual lowest listings/lot cost/available quantity remain separate from reported sale/asking medians, and official item conversion conditions remain mandatory.

Source replies are monitored only in the verified intended account/session. Keep cancelled or held drafts unsent. New requests require a dedicated API invitation/form and final human approval; no new plans or agreements are accepted through this workflow. Official OST website-background rights remain unverified and fresh music stays Off.
