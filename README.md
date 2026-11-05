# inflation.watch · Astra

A MapleStory Classic market dashboard: a fixed-basket price index, a daily meso-per-NX estimate, recorded market-volume charts and separately dated scanner/offer references. Independent fan project; no Nexon affiliation.

Source repository: [dizzyvinci/inflation-watch-astra](https://github.com/dizzyvinci/inflation-watch-astra). This README describes the production design; a deployment URL and successful collection must be verified separately.

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

The v2 CPI selects 50 non-cash items by reference-period median-price-times-recorded-volume expenditure, after a liquidity screen. It freezes membership, base prices and capped base-expenditure weights. The base period is October 21–27, 2026; each item needs at least five base days with recorded volume of at least 50. Usable base observations include days with volume of at least five. Weights are capped at 8% and redistributed to sum to one.

`CPI = 100 × Σ(fixed weight × current qualifying daily median / fixed base price)`

The seed includes the specification, basket and original source-snapshot hashes. Those identify the frozen definition; they are not hashes of each subsequently fetched feed. Earlier CPI values are reconstructed with that definition. A missing indexed member stops publication; it never silently changes the basket. Wolbi is retained separately as zero-weight context when it is outside the index. The archived v1 CPI remains at `/history/cpi-v1.json`.

The daily NX estimate averages each tracked cash item's meso/NX ratio, weighted by that day's recorded sold volume, with at least three qualifying items. NX denominations and the base NX rate remain frozen. Recent activity uses the seven complete source-calendar days before the source date, independently of the frozen selection period.

Median price × recorded volume is an estimated turnover proxy, not audited trade expenditure or a measure of the money supply. The feed's transaction/lot/stack-unit semantics and equipment quality mixes are limitations. Source coverage and partial days remain visible.

## Production

Cloudflare Workers Static Assets delivers the UI. A scheduled Worker checks the public feed at minutes 3, 13, 23, 33, 43 and 53 UTC. A private R2 binding holds feed cache, collector state and immutable public-report snapshots. Visitors read reports through an allowlisted Worker path and never trigger upstream collection. Code deployment and data publication are separate.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the architecture, configuration, verification and recovery procedure.

```sh
npm run deploy:check
npm run deploy
```

These are operator commands, not automatic CI triggers. Configure the target account and existing private bucket before deployment; never commit tokens or provider credentials. Omission of `usage_model` preserves the account/Worker's configured billing model.

The authenticated-provider application remains **DRAFT ONLY**. This runtime does not submit it or call authenticated/proprietary feeds. Domain purchases and DNS changes are outside these commands; no domain ownership is implied by the dashboard name.

## Attribution

Market sources include [MapleStory Classic](https://maplestory-classic.com/market), [mesos.watch](https://mesos.watch/), [MapleStory Market](https://maplestory.market/ads?tab=services) and [NiaDB](https://meowdb.com/msclassic/free-market), with their individual provenance shown in the dashboard. Game names and sprites belong to Nexon; community sprite delivery is credited to [maplestory.io](https://maplestory.io/). Asset provenance is recorded alongside the local assets. The [BLS CPI methodology](https://www.bls.gov/opub/hom/cpi/calculation.htm) is a comparison reference, not a claim of equivalence to a household CPI.
