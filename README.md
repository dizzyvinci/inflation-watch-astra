# inflation.gg · Astra

A MapleStory Classic World market dashboard: a fixed-basket price index, a modelled goods-inflation NX benchmark, separate cash-item comparisons, recorded market-volume charts and dated scanner/offer references. Independent fan project; no Nexon affiliation.

Password-gated preview: [inflation.gg](https://inflation.gg/) and [the Worker alias](https://inflation-watch-astra.dizzyvinci.workers.dev/). Both hosts and their whole-site access gate were verified on November 5, 2026. Source repository: [dizzyvinci/inflation-watch-astra](https://github.com/dizzyvinci/inflation-watch-astra).

Scheduled production collection was verified on November 5, 2026 at 04:43 UTC: the public pointer reported `status: ok`, `mode: collector` and report version `59106aecbc3821ba`; its referenced report contained the fixed 50-item basket and 29 cash items. The check began at `04:43:46.813Z` and the successful fetch completed at `04:43:49.137Z`. The source publication remained **November 4 at 08:30:56 UTC**. A successful collection does not turn those daily observations into fresh trades or a connected intraday feed. See [health status](https://inflation-watch-astra.dizzyvinci.workers.dev/health.json) and [the operational record](DEPLOYMENT.md).

That historical check verified the scheduled fetch, compute and R2 publication path. The custom domain is connected. Code release, report publication, source publication and browser receipt retain separate clocks; a successful check does not create fresh trades. Qualified unattended intraday sales are not connected, and the authenticated-source application remains an unsubmitted draft. Existing bounded serving tests are not a global-capacity certification.

## Run and verify

Python runs the local collector/preview. Node 22 or newer runs the Worker tests; the Node test suite uses JSON module import attributes.

```sh
python engine.py --offline
python preview.py --offline --no-collector
```

Open `http://127.0.0.1:8765`. To run the local ten-minute source collector instead, use `python preview.py`. Run one Python preview collector per checkout and restart it after engine/config changes; an old process retains its imported code.

```sh
npm install
npm run check
npm run test:worker
npm run test:dom
python -m unittest discover -s tests -v
```

The Worker suite tests computation parity, fixed definitions, changing daily observations, clocks, invalid sources, conditional storage, collector overlap, cooldowns and visitor isolation using fake R2/cache bindings. It makes no Cloudflare API calls.

## Data and method

The public [daily market feed](https://maplestory-classic.com/market.json) supplies dated daily medians and recorded sold volume. Ten-minute checks do not imply ten-minute source observations. Daily-source data, rolling scanner captures and buyer/seller offers retain separate timestamps and meanings.

The v2 MPI selects 50 items outside the provider's `Cash Shop` category by reference-period median-price-times-recorded-volume expenditure, after a liquidity screen. This is a source-category filter, not a verified exclusion of every item with a monetized acquisition route. Mystery Palette Exchange Coupon is classified `Use` by the provider and retains its frozen 2.01% weight despite its stamp-shop connection; it is distinct from the excluded Mystery Palette cash-shop row. Membership, base prices and capped base-expenditure weights stay fixed. The base period is October 21–27, 2026; each item needs at least five base days with recorded volume of at least 50. Usable base observations include days with volume of at least five. Weights are capped at 8% and redistributed to sum to one.

`CPI = 100 × Σ(fixed weight × current qualifying daily median / fixed base price)`

The seed includes the specification, basket and original source-snapshot hashes. Those identify the frozen definition; they are not hashes of each subsequently fetched feed. Earlier CPI values are reconstructed with that definition. A missing indexed member stops publication; it never silently changes the basket. Wolbi is retained separately as zero-weight context when it is outside the index. The archived v1 CPI remains at `/history/cpi-v1.json`.

The daily NX estimate averages each tracked cash item's meso/NX ratio, weighted by that day's recorded sold volume, with at least three qualifying items. NX denominations and the base NX rate remain frozen. Recent activity uses the seven complete source-calendar days before the source date, independently of the frozen selection period.

The headline defaults to a rolling model: the prior seven complete source days' count-weighted cash-item rate multiplied by current MPI divided by the mean MPI over those same days. A three-day anchor and the original fixed-reference model are reversible options. The active model, formulas and chart exports change together. This is a purchasing-power benchmark, not an observed or executable exchange quote; cash-item pricing and player offers remain separate evidence.

Median price × recorded volume is an estimated turnover proxy, not audited trade expenditure or a measure of the money supply. The feed's transaction/lot/stack-unit semantics and equipment quality mixes are limitations. Source coverage and partial days remain visible.

## Production

Cloudflare Workers Static Assets delivers the UI. A scheduled Worker checks the public feed at minutes 3, 13, 23, 33, 43 and 53 UTC. A private R2 binding holds feed cache, collector state and immutable public-report snapshots. Visitors read reports through an allowlisted Worker path and never trigger upstream collection. Code deployment and data publication are separate.

This project's configuration enables deterministic offline UI bundles: two guarded optional-module bundles, a separately executed content-hashed app, and one stylesheet. Original modules remain available, prior verified hashed assets are retained, and the preview gate keeps every response private/no-store. See [the bundle contract](ops/UI_ASSET_BUNDLES.md). The durable provider queue is disabled until explicit approved limits and a reviewed transport are supplied; its presence alone does not connect a feed.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the architecture, configuration, verification and recovery procedure.

```sh
npm run deploy:check
npm run deploy
```

These are operator commands, not automatic CI triggers. Configure the target account and existing private bucket before deployment; never commit tokens or provider credentials. Omission of `usage_model` preserves the account/Worker's configured billing model.

The authenticated-provider application remains **DRAFT ONLY**. This runtime does not submit it or call authenticated/proprietary feeds. Domain purchases and DNS changes are outside these commands; no domain ownership is implied by the dashboard name.

## Attribution

Market sources include [MapleStory Classic](https://maplestory-classic.com/market), [mesos.watch](https://mesos.watch/), [MapleStory Market](https://maplestory.market/ads?tab=services) and [NiaDB](https://meowdb.com/msclassic/free-market), with their individual provenance shown in the dashboard. Game names and sprites belong to Nexon; community sprite delivery is credited to [maplestory.io](https://maplestory.io/). Asset provenance is recorded alongside the local assets. The [BLS CPI methodology](https://www.bls.gov/opub/hom/cpi/calculation.htm) is a comparison reference, not a claim of equivalence to a household CPI.
