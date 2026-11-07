# inflation.gg · Astra

An independent MapleStory Classic World market observatory: a fixed-goods Meso Price Index (MPI), a modelled goods-inflation NX benchmark, separate cash-item value comparisons, item search, and dated market evidence. No Nexon affiliation.

## Current status

The working site is password-protected at [inflation.gg](https://inflation.gg/) and [its Worker alias](https://inflation-watch-astra.dizzyvinci.workers.dev/). One verified eight-hour site session also unlocks design controls. The personal footer remains hidden behind a DRAFT placeholder. The earlier clean public API-review presentation is preserved as a restore snapshot; it is not the current access mode.

The last verified deployed code at this documentation checkpoint is commit `9a76a7e4f03df6c9c362375f950da3139e4e7b24`, Worker version `71348825-95e1-413e-af4f-01fc6725269f` (November 7, 2026). The execution CPU cap is 30,000 ms. A cap is not measured resource headroom, a subscription change or a traffic-capacity certification. Later local changes are not deployed merely because they appear in this checkout.

MapleStory Market API access has been approved and the shared authenticated collector is active. Its credentials stay server-side. The finite 1,551-ID / 3,102-request detail-and-history first pass completed without failed or unavailable jobs. That establishes raw retention for that finite plan, not full-game coverage, complete schema validation or public rendering of every retained field. Other sources retain their own permission and coverage status.

## Evidence and calculations

| Evidence | Meaning and current use |
| --- | --- |
| Retained public daily source | Daily medians and reported counts from MapleStory Classic. Its last retained publication is November 4, 2026 at 08:30:56 UTC. Broader legacy market/activity views retain that date. |
| API bulk prices | Reported three-day sale-median references and reported sales counts. Exact window bounds and individual sale times are unknown. Accepted receipts feed the shared current 50-goods / 29-fixed-NX calculation path. |
| API overview daily history | Actual source-calendar-day observations, retained with original receipt provenance and revision precedence. Supplies daily history and rolling anchors; a three-day snapshot is never converted into daily observations. |
| Item prices and identities | Separate accepted generations support additive sprite search and per-item summaries/stat filters. Identity-only rows do not acquire a price. Full-item publication has a slower independent schedule; minute-level catalogue parity remains unfinished. |
| NX offers | Native eight-hour summary, source last-heard label, derived 24-hour histogram pool and hourly chart proxies remain separate. These are advertised offers, not completed trades, unique people or traded volume. |
| Finite item-hour preview | Explicitly pinned item `1082002`, Steel Fingerless Gloves. Whole-item aggregates with unknown roll mix; not ATT/slot-matched history or individual trades. It does not automatically expand to other items or future generations. |

The frozen v2 basket contains 50 representative goods selected outside the provider's Cash Shop category using reference-period expenditure and a liquidity screen. Base prices and capped weights remain fixed to October 21–27, 2026. The category screen does not prove that every retained item has a non-monetized acquisition route. Mystery Palette Exchange Coupon retains its frozen weight; changing that policy requires a versioned definition and compatible history.

The active API-linked calculation preserves the old index level through a retrospective November 4 calibration:

```text
linkedPrice_i(t) = legacyLinkPrice_i × apiPrice_i(t) / apiLinkPrice_i
MPI(t) = 100 × Σ(fixedWeight_i × linkedPrice_i(t) / fixedBasePrice_i)
```

This link does not make equipment quality constant or merge the two sources' observation clocks. Current API prices are reported three-day medians; daily history uses actual daily observations. Pre-link API points are retrospective backcasts. The prior legacy history remains available separately.

The headline defaults to the prior seven complete UTC source days' count-weighted cash-item rate, multiplied by current MPI and divided by the arithmetic mean of linked daily MPI over those same days. A three-day anchor and the frozen-reference alternative are reversible selections. Missing seven-day evidence makes that model unavailable or retains a separately dated last-good result; it never silently substitutes three days. The headline is a purchasing-power benchmark, not an executable exchange quote or a policy that controls inflation.

Cash-item rankings remain separate from the goods MPI. Sale medians, asking medians, actual lowest listings, hypothetical after-fee values and expected returns have different meanings. Reported counts are not verified physical units. Median × count is a turnover proxy, not audited expenditure or total mesos in circulation. Qualified individual intraday trades remain zero at this checkpoint.

## Updating and serving

One existing provider owner shares a durable ledger, pacing, raw retention and derivative work across all visitors. Current configured provider cadences are status every 600 seconds, prices every 300 seconds, catalogue/overview every 900 seconds, NX summary every 60 seconds and NX history every 300 seconds. Per-item priority and regular refresh schedules are separate. These are scheduler settings, not source-publication or end-to-end latency guarantees.

Accepted source receipts can recompute the current MPI, benchmark, cards and calculation-backed search evidence without rebuilding the static site. Original price, daily-anchor, legacy-publication, offer-hour and receipt clocks stay distinct. Own-site readers coalesce storage reads; visible clients poll bounded shared caches and pause while hidden or offline. Visitors never trigger provider collection. Missing or invalid input does not become zero, a new observation time or an unlabelled substitute source.

Full-catalogue faster publication, broader all-market/fashion derivations, durable model-history integration and additional analyses remain under development. A local FAST foundation is unregistered and disabled; its presence in source is not continuous live adoption. Scanner research and an inventory prototype do not establish a deployed OCR scanner or private inventory access.

## Local development and verification

The already running authenticated local preview uses own-site caches and a RAM-only session, not a second provider-key consumer. Do not start another collector over that checkout. Python keeps imported code until a controlled restart; browser reload alone does not replace a Python process.

For a separate offline checkout:

```sh
python engine.py --offline
python preview.py --offline --no-collector
```

Those commands render retained offline evidence. They do not enable authenticated API collection or prove current source freshness. The explicit `--private-own-site` mode supports the existing own-site session; enter its password only through the prompt or `--private-password-stdin`, never in an argument, environment variable or saved file.

Relevant local checks:

```sh
npm run check
npm run test:worker
npm run test:dom
python -m unittest discover -s tests -v
```

Use the pinned dependency lock and deterministic builders for generated browser bundles. A changed imported source can require a provenance-manifest rebuild even if tree-shaking leaves browser JavaScript byte-identical. Preserve all prior test registrations and historical assets. The checks above are offline software evidence, not live provider or large-scale load certification.

See [DEPLOYMENT.md](DEPLOYMENT.md) for release, access, failure and recovery boundaries. The previous published documents are preserved in [the historical README](https://github.com/dizzyvinci/inflation-watch-astra/blob/9a76a7e4f03df6c9c362375f950da3139e4e7b24/README.md) and [the historical runbook](https://github.com/dizzyvinci/inflation-watch-astra/blob/9a76a7e4f03df6c9c362375f950da3139e4e7b24/DEPLOYMENT.md); their old pending/DRAFT/configuration statements are historical.

## Attribution

Sources include [MapleStory Classic](https://maplestory-classic.com/market), [MapleStory Market](https://maplestory.market/?ref=v6kkdvp6), separately dated [mesos.watch](https://mesos.watch/) references and [NiaDB](https://meowdb.com/msclassic/free-market). A source link or login does not itself grant programmatic access. Singular meso.watch and mesos.watch are different operators; no-data-sharing restrictions are not an invitation to copy data through a browser.

Game art belongs to Nexon and its respective owners; sprite provenance is retained alongside assets, including [maplestory.io](https://maplestory.io/) references. No official OST website-background licence has been verified; fresh music remains Off. The [BLS CPI methodology](https://www.bls.gov/opub/hom/cpi/calculation.htm) is explanatory context, not a claim that this game index is a household CPI.
