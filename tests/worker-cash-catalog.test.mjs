import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeCashCatalog, cashCatalogMetadata, computeReport } from '../ops/worker-core.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const feed = JSON.parse(readFileSync(new URL('../cache/market.json', import.meta.url), 'utf8'));
const seed = JSON.parse(readFileSync(new URL('../dist/data.json', import.meta.url), 'utf8'));
const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const metadata = JSON.parse(readFileSync(new URL('../cache/cash-catalog-metadata.json', import.meta.url), 'utf8'));
// Pure Python helpers only: no compute/build, SQLite, canonical cache or network.
const expected = JSON.parse(execFileSync(process.env.PYTHON || 'python', ['-c', `
import engine,json
feed=engine.read('cache/market.json');cfg=engine.read('config.json');seed=engine.read('dist/data.json')
ref=seed.get('rollingReference',{})
ids=seed.get('cashCatalog',{}).get('identityMap') or [
 {'slug':row['slug'],'name':row['name'],'id':item['id'],'planHash':ref['planHash']}
 for row in seed['cash'] for item in ref.get('items',[])
 if item.get('id')==item.get('expectedItemId') and item.get('name')==item.get('expectedItemName')==row['name']]
print(json.dumps(engine.cash_catalog(feed,cfg,seed.get('cashBasket'),seed.get('rollingReference'),ids,engine.read('cache/cash-catalog-metadata.json')),allow_nan=False))
`], { cwd: project, encoding: 'utf8', maxBuffer: 5_000_000 }));
const opts = { checkedAt: seed.builtAt, builtAt: seed.builtAt, config: cfg };
const inputSeed = { ...seed, cashCatalog: expected };

test('entire cash catalog Python/Worker parity includes independently dated supplemental observations', () => {
  const actual = computeCashCatalog(feed, cfg, seed.cashBasket, seed.rollingReference, expected.identityMap, metadata);
  assert.deepEqual(actual, expected);
  assert.equal(actual.itemCount, feed.items.filter(item => item.k === 'Cash Shop').length);
  assert.equal(actual.coverage.fixedNxItems, 29);
  assert.equal(actual.coverage.cashIndexItems, 28);
  assert.equal(actual.coverage.withRollingObservation, 29);
  const report = computeReport(feed, inputSeed, opts);
  assert.deepEqual(report.cashCatalog, expected);
  // This remains inside the existing bounded shared-response coalescer limit.
  assert.ok(Buffer.byteLength(JSON.stringify(report)) < 1024 * 1024);
});

test('Halloween is catalog coverage, with no invented NX cost, reference baseline or release badge', () => {
  const row = expected.rows.find(item => item.slug === 'halloween-mystery-fashion-crate');
  assert.equal(row.firstObservedDay, '2026-10-28');
  assert.equal(row.qualifyingDays, 8);
  assert.equal(row.knownNxCost, null);
  assert.equal(row.notIndexed, true);
  assert.ok(row.notIndexedReasons.includes('no_qualifying_reference_period_history_in_retained_source'));
  assert.notEqual(row.publisherMedian, row.price);
  assert.match(expected.notes.firstObservedDay, /not a release date/);
  assert.equal(expected.rows.some(item => /teddy/i.test(item.name)), false);
  assert.equal(expected.rows.some(item => Object.keys(item).some(key => /release/i.test(key))), false);
  assert.equal(expected.providerItemCount, expected.itemCount);
  assert.equal(expected.catalogItemCount, expected.providerItemCount + 1);
  const teddy = expected.metadataItems.find(item => item.id === 1007133);
  assert.equal(teddy.name, 'Teddy Bear Headgear');
  assert.equal(teddy.marketDataAvailable, false);
  for (const key of ['price', 'knownNxCost', 'firstObservedDay', 'sourceLastSeenAt']) assert.equal(teddy[key], null);
  assert.deepEqual(teddy.history, []);
});

test('verified game metadata cannot smuggle market quotes, credentials or release claims', () => {
  const item = { ...metadata.items[0], price: 9999, knownNxCost: 3500,
    releaseDate: '2026-11-04', playerName: 'synthetic-private-name' };
  const actual = cashCatalogMetadata([item, item, { ...item, region: 'GMS' },
    { ...item, metadataCapturedAt: 'invalid' }], []);
  assert.equal(actual.length, 1);
  assert.equal(actual[0].price, null);
  assert.equal(actual[0].knownNxCost, null);
  for (const key of ['releaseDate', 'playerName']) assert.equal(key in actual[0], false);
  assert.deepEqual(cashCatalogMetadata({ schemaVersion: 99, items: [item] }, []), []);
  const many = Array.from({ length: 80 }, (_, i) => ({ ...item, id: 2000000 + i,
    sourceUrl: `https://maplestory.io/api/MCW/1/item/${2000000 + i}` }));
  assert.equal(cashCatalogMetadata(many, []).length, 64);
});

test('unknown, thin and missing daily history remains visible; invalid optional summaries are null', () => {
  const input = structuredClone(feed);
  input.items.push({ n: 'Synthetic thin cash', s: 'synthetic-thin-cash', k: 'Cash Shop',
    h: [['2026-11-03', 7, 4], ['2026-11-04', 8, 5]], p: NaN, last: 'invalid' });
  input.items.push({ n: 'Synthetic missing cash', s: 'synthetic-missing-cash', k: 'Cash Shop', h: [] });
  const actual = computeReport(input, inputSeed, opts);
  const [thin, missing] = actual.cashCatalog.rows.slice(-2);
  assert.equal(thin.historyDays, 2);
  assert.equal(thin.qualifyingDays, 1);
  assert.equal(thin.recordedCount, 9);
  assert.equal(thin.price, 8);
  assert.equal(thin.limitedHistory, true);
  assert.equal(thin.publisherMedian, null);
  assert.equal(thin.sourceLastSeenAt, null);
  for (const key of ['price', 'quantity', 'priceDay', 'firstObservedDay', 'knownNxCost']) assert.equal(missing[key], null);
  assert.deepEqual(missing.history, []);
  const baseline = computeReport(feed, inputSeed, opts);
  for (const key of ['latest', 'rows', 'cash', 'history', 'baseNxRate', 'cashBasket', 'basketHash']) {
    assert.deepEqual(actual[key], baseline[key], key);
  }
});

test('new source summaries do not overwrite daily prices or independently dated rolling evidence', () => {
  const input = structuredClone(feed);
  const item = input.items.find(row => row.s === 'selective-5-slot-coupon');
  item.p *= 2;
  item.last = '2026-11-04T08:30:00Z';
  const report = computeReport(input, inputSeed, opts);
  const row = report.cashCatalog.rows.find(entry => entry.slug === item.s);
  const old = expected.rows.find(entry => entry.slug === item.s);
  assert.equal(row.publisherMedian, item.p);
  assert.equal(row.price, old.price);
  assert.equal(row.sourceLastSeenAt, item.last);
  assert.deepEqual(row.sourceObservations.slice(1), old.sourceObservations.slice(1));
  const rolling = row.sourceObservations[1];
  for (const key of ['cheapestListing', 'channel', 'room', 'seller', 'playerName']) assert.equal(key in rolling, false);
});

test('daily history changes recompute catalog counts and price while retaining frozen membership', () => {
  const input = structuredClone(feed);
  const item = input.items.find(row => row.s === 'halloween-mystery-fashion-crate');
  const old = expected.rows.find(row => row.slug === item.s);
  item.h.at(-1)[1] *= 3;
  item.h.at(-1)[2] += 10;
  const report = computeReport(input, inputSeed, opts);
  const row = report.cashCatalog.rows.find(entry => entry.slug === item.s);
  assert.equal(row.price, old.price * 3);
  assert.equal(row.recordedCount, old.recordedCount + 10);
  assert.equal(row.historyDays, old.historyDays);
  assert.equal(row.knownNxCost, null);
  assert.equal(row.inCashBasket, false);
  assert.equal(report.cashCatalog.cashIndexBasketHash, expected.cashIndexBasketHash);
  assert.deepEqual(report.cashBasket.rows.map(entry => [entry.slug, entry.weight]), seed.cashBasket.rows.map(entry => [entry.slug, entry.weight]));
});

test('verified plan/ID joins preserve multiple distinct variants and reject names, wrong plans and asks', () => {
  const reference = structuredClone(seed.rollingReference);
  const target = reference.items.find(item => item.name === 'Selective 5-slot Coupon');
  const duplicate = { ...target, variantKey: 'synthetic-distinct-variant', statRoll: 'Synthetic variant', price: 12345 };
  reference.items.push(duplicate);
  let actual = computeCashCatalog(feed, cfg, seed.cashBasket, reference, expected.identityMap);
  let row = actual.rows.find(item => item.slug === 'selective-5-slot-coupon');
  assert.equal(row.sourceObservations.length, 3);
  assert.equal(row.sourceObservations[2].variantKey, duplicate.variantKey);
  assert.equal(row.sourceObservations[2].price, 12345);
  duplicate.expectedItemId += 1;
  actual = computeCashCatalog(feed, cfg, seed.cashBasket, reference, expected.identityMap);
  row = actual.rows.find(item => item.slug === 'selective-5-slot-coupon');
  assert.equal(row.sourceObservations.length, 2);
  target.priceBasis = 'asking';
  actual = computeCashCatalog(feed, cfg, seed.cashBasket, reference, expected.identityMap);
  assert.equal(actual.rows.find(item => item.slug === row.slug).sourceObservations.length, 1);
  reference.planHash = 'different';
  actual = computeCashCatalog(feed, cfg, seed.cashBasket, reference, expected.identityMap);
  assert.equal(actual.coverage.withRollingObservation, 0);
});

test('old seeds remain usable, rolling retention never reselects members or grants new fixed costs', () => {
  const oldSeed = structuredClone(seed);
  delete oldSeed.cashCatalog;
  const report = computeReport(feed, oldSeed, opts);
  assert.equal(report.cashCatalog.itemCount, expected.itemCount);
  assert.equal(report.cashCatalog.coverage.withRollingObservation, 0);
  assert.equal(report.cashCatalog.coverage.fixedNxItems, 29);
  const input = structuredClone(feed);
  for (const item of input.items) item.h = item.h.filter(point => point[0] > cfg.base_end);
  const actual = computeReport(input, inputSeed, opts);
  assert.equal(actual.cashCatalog.coverage.cashIndexItems, 28);
  assert.equal(actual.cashCatalog.cashIndexBasketHash, expected.cashIndexBasketHash);
  for (const row of actual.cashCatalog.rows.filter(item => item.inCashBasket)) assert.deepEqual(row.notIndexedReasons, []);
  const changedConfig = structuredClone(cfg);
  changedConfig.nx_prices['Halloween Mystery Fashion Crate'] = 3500;
  const noNewCost = computeReport(feed, inputSeed, { ...opts, config: changedConfig });
  assert.equal(noNewCost.cashCatalog.rows.find(item => item.slug === 'halloween-mystery-fashion-crate').knownNxCost, null);
});
