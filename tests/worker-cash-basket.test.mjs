import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeCashBasket, computeReport } from '../ops/worker-core.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const feed = JSON.parse(readFileSync(new URL('../cache/market.json', import.meta.url), 'utf8'));
const seed = JSON.parse(readFileSync(new URL('../dist/data.json', import.meta.url), 'utf8'));
const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
// This pure Python call creates no canonical cache/build artifacts. It compares
// both implementations from one identical frozen definition, before a rebuild.
const expected = JSON.parse(execFileSync(process.env.PYTHON || 'python', ['-c', `
import json
from cash_basket import make_definition, compute_from_definition
feed=json.load(open('cache/market.json',encoding='utf-8'))
cfg=json.load(open('config.json',encoding='utf-8'))
print(json.dumps(compute_from_definition(feed,make_definition(feed,cfg),cfg),allow_nan=False))
`], { cwd: project, encoding: 'utf8', maxBuffer: 5_000_000 }));
const clone = value => structuredClone(value);
const close = (actual, value) => assert.ok(Math.abs(actual - value) <= 1e-10 + 1e-12 * Math.max(Math.abs(actual), Math.abs(value)), `${actual} != ${value}`);
const compare = (actual, value, key = '') => {
  const derived = new Set(['cpi', 'coverage', 'pricedCoverage', 'changeBase', 'indexContribution', 'changeContribution', 'baseExpenditure', 'baseQuantity']);
  if (typeof value === 'number' && derived.has(key)) return close(actual, value);
  if (Array.isArray(value)) {
    assert.equal(actual.length, value.length);
    return value.forEach((entry, i) => compare(actual[i], entry));
  }
  if (value !== null && typeof value === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(value).sort());
    return Object.entries(value).forEach(([field, entry]) => compare(actual[field], entry, field));
  }
  assert.deepEqual(actual, value);
};

test('cash basket Python/Worker parity includes frozen metadata, all histories and contributions', () => {
  const actual = computeCashBasket(feed, expected, cfg);
  assert.equal(actual.status, 'ok');
  assert.equal(actual.itemCount, 28);
  assert.deepEqual(actual.missingBaselineNames, ['Red Hat']);
  compare(actual, expected);
});

test('cash baseline prices normalize to 100; current volume never changes frozen weights', () => {
  const input = { updatedAt: feed.updatedAt, items: expected.rows.map(row => ({
    s: row.slug, n: row.name, k: 'Cash Shop', h: [['2026-11-04', row.basePrice, 5]],
  })) };
  close(computeCashBasket(input, expected, cfg).latest.cpi, 100);
  for (const item of input.items) { item.h[0][1] *= 2; item.h[0][2] *= 100; }
  const actual = computeCashBasket(input, expected, cfg);
  close(actual.latest.cpi, 200);
  assert.deepEqual(actual.rows.map(row => row.weight), expected.rows.map(row => row.weight));
});

test('cash prices carry only after observation and missing members are never silently imputed', () => {
  const input = { updatedAt: feed.updatedAt, items: expected.rows.map((row, i) => ({
    s: row.slug, n: row.name, k: 'Cash Shop', h: [[i ? '2026-11-03' : '2026-11-04', row.basePrice, 5]],
  })) };
  let actual = computeCashBasket(input, expected, cfg);
  assert.equal(actual.history[0].cpi, null);
  close(actual.latest.cpi, 100);
  close(actual.latest.coverage, expected.rows[0].weight);
  assert.equal(actual.latest.partial, true);
  input.items.shift();
  actual = computeCashBasket(input, expected, cfg);
  assert.equal(actual.itemCount, 28);
  assert.equal(actual.latest.cpi, null);
  assert.equal(actual.rows[0].price, null);
  assert.equal(actual.rows[0].missingSource, true);
  assert.equal(actual.basketHash, expected.basketHash);
});

test('rolling source retention never rebases the immutable cash reference or adds a newly eligible member', () => {
  const input = clone(feed);
  for (const item of input.items) item.h = item.h.filter(point => point[0] > cfg.base_end);
  const redHat = input.items.find(item => item.n === 'Red Hat');
  redHat.h.unshift(['2026-10-21', 1_000_000, 1000]);
  const actual = computeCashBasket(input, expected, cfg);
  assert.equal(actual.status, 'ok');
  assert.equal(actual.itemCount, 28);
  assert.equal(actual.rows.some(row => row.name === 'Red Hat'), false);
  assert.deepEqual(actual.rows.map(row => [row.slug, row.basePrice, row.weight]), expected.rows.map(row => [row.slug, row.basePrice, row.weight]));
  assert.equal(actual.sourceSnapshotHash, expected.sourceSnapshotHash);
  close(actual.latest.cpi, expected.latest.cpi);
});

test('old seed and cash-specific configuration drift stay explicitly unavailable without blocking goods/NX', () => {
  assert.equal(computeCashBasket(feed, null, cfg).status, 'unavailable');
  const altered = clone(cfg); altered.nx_prices['Red Hat'] += 1;
  const actual = computeCashBasket(feed, expected, altered);
  assert.equal(actual.status, 'unavailable');
  assert.equal(actual.latest, null);
  assert.deepEqual(actual.rows, []);
  assert.match(actual.reason, /configuration changed/);
  const goodSeed = { ...seed, cashBasket: expected };
  const opts = { checkedAt: seed.builtAt, builtAt: seed.builtAt, config: cfg };
  const good = computeReport(feed, goodSeed, opts);
  const oldSeed = clone(seed); delete oldSeed.cashBasket;
  const old = computeReport(feed, oldSeed, opts);
  // JSON seeds omit absent optional fields, rather than carry undefined values.
  assert.equal(old.cashBasket.status, 'unavailable');
  for (const key of ['latest', 'rows', 'cash', 'history', 'categories', 'baseNxRate']) assert.deepEqual(good[key], old[key]);
});

test('invalid frozen cash weights do not become fresh cash estimates', () => {
  const invalid = clone(expected); invalid.rows[0].weight = .5;
  const actual = computeCashBasket(feed, invalid, cfg);
  assert.equal(actual.status, 'unavailable');
  assert.equal(actual.latest, null);
  assert.deepEqual(actual.history, []);
  assert.equal(actual.sourceUpdatedAt, feed.updatedAt);
});
