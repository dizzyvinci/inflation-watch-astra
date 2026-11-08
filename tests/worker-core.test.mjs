import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeReport } from '../ops/worker-core.mjs';

const seed = historical('report');
import {historical} from './fixtures/worker-historical-inputs.mjs';
const feed = historical('feed');
const clone = value => structuredClone(value);
const options = { checkedAt: seed.builtAt, builtAt: seed.builtAt, sourceStatus: { status: 'ok' } };
const compute = (input = feed, baseline = seed, opts = options) => computeReport(input, baseline, opts);
// Python 3.12 sum() and JavaScript can differ in their final floating-point
// bits. Allow only 1e-10 absolute + 1e-12 relative error on derived values;
// source values, frozen definitions, counts, dates, hashes and keys stay exact.
const close = (actual, expected, label) => {
  assert.ok(typeof actual === 'number' && Number.isFinite(actual), `${label}: finite actual`);
  assert.ok(typeof expected === 'number' && Number.isFinite(expected), `${label}: finite expected`);
  assert.ok(Math.abs(actual - expected) <= 1e-10 + 1e-12 * Math.max(Math.abs(actual), Math.abs(expected)),
    `${label}: ${actual} != ${expected}`);
};
const equalWithDerivedFloats = (actual, expected, fields, label) => {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${label} keys`);
  for (const [key, value] of Object.entries(expected)) {
    if (fields.includes(key) && typeof value === 'number') close(actual[key], value, `${label} ${key}`);
    else assert.deepEqual(actual[key], value, `${label} ${key}`);
  }
};
const recent = (input, start, end, slugs) => input.items
  .filter(item => !slugs || slugs.has(item.s))
  .flatMap(item => item.h).filter(([day]) => start <= day && day < end);

test('daily source summaries refresh for basket, cash and context independently of daily history', () => {
  const altered = clone(feed);
  const baseline = clone(seed);
  const summaryInput = { p: 123, p25: 100, p75: 150, lo: 10, hi: 999,
    ask: 175, asks: 0, sellers: 12, st: 0.75, last: '2026-11-04T08:45:00Z' };
  for (const row of [baseline.rows[0], baseline.cash[0], baseline.contextItems[0]]) {
    row.sourceSummary = { medianSale: 999999, sourceUpdatedAt: 'stale seed value' };
    Object.assign(altered.items.find(item => item.s === row.slug), summaryInput);
  }
  const report = compute(altered, baseline);
  for (const key of ['rows', 'cash', 'contextItems']) {
    const row = report[key][0];
    assert.equal(row.price, baseline[key][0].price);
    assert.notEqual(row.price, row.sourceSummary.medianSale);
    assert.deepEqual(row.sourceSummary, {
      sourceUpdatedAt: altered.updatedAt, window: 'unspecified_source_summary', kind: 'source_published_summary',
      medianSale: 123, p25: 100, p75: 150, lowSale: 10, highSale: 999,
      medianSellerAsk: 175, listings: 0, sellers: 12, sellThrough: 0.75,
      reportedLastSaleAt: summaryInput.last,
    });
    assert.equal(Object.hasOwn(row.sourceSummary, 'bid'), false);
    assert.equal(Object.hasOwn(row.sourceSummary, 'trades'), false);
  }
  close(report.latest.cpi, seed.latest.cpi, 'summary-only CPI');
  close(report.latest.nxRate, seed.latest.nxRate, 'summary-only NX');
});

test('invalid optional source summaries cannot reject valid daily medians or inherit old values', () => {
  const altered = clone(feed);
  const baseline = clone(seed);
  const member = altered.items.find(item => item.s === baseline.rows[0].slug);
  baseline.rows[0].sourceSummary = { medianSale: 999999, listings: 999999 };
  Object.assign(member, { p: Number.NaN, p25: Number.POSITIVE_INFINITY, p75: -1,
    lo: 0, hi: true, ask: '123', asks: 1.5, sellers: Number.MAX_SAFE_INTEGER + 1,
    st: 2, last: '2026-11-04T08:30:00+00:99' });
  const report = compute(altered, baseline);
  for (const key of ['medianSale', 'p25', 'p75', 'lowSale', 'highSale',
    'medianSellerAsk', 'listings', 'sellers', 'sellThrough', 'reportedLastSaleAt']) {
    assert.equal(report.rows[0].sourceSummary[key], null, key);
  }
  close(report.latest.cpi, baseline.latest.cpi, 'invalid-summary CPI');
  const missing = clone(feed);
  missing.items = missing.items.filter(item => item.s !== baseline.contextItems[0].slug);
  baseline.contextItems[0].sourceSummary = { medianSale: 999999 };
  assert.equal(compute(missing, baseline).contextItems[0].sourceSummary, null);
});

test('current feed matches published CPI, NX, category and full volume histories', () => {
  const report = compute();
  assert.equal(report.history.length, seed.history.length);
  report.history.forEach((point, i) => {
    const old = seed.history[i];
    for (const key of ['day', 'at', 'partial', 'cashItems']) assert.equal(point[key], old[key]);
    for (const key of ['cpi', 'nxRate', 'coverage']) {
      if (old[key] === null) assert.equal(point[key], null);
      else close(point[key], old[key], `${point.day} ${key}`);
    }
  });
  close(report.latest.cpi, seed.latest.cpi, 'latest CPI');
  close(report.latest.nxRate, seed.latest.nxRate, 'latest NX');
  close(report.baseNxRate, seed.baseNxRate, 'base NX');
  assert.equal(report.volumeHistory.length, seed.volumeHistory.length);
  report.volumeHistory.forEach((point, index) => equalWithDerivedFloats(point, seed.volumeHistory[index],
    ['allMesos', 'basketMesos'], `volume history ${index}`));
  assert.equal(report.categories.length, seed.categories.length);
  report.categories.forEach((category, index) => equalWithDerivedFloats(category, seed.categories[index],
    ['weight', 'index'], `category ${index}`));
  assert.equal(report.salesSinceLaunch, seed.salesSinceLaunch);
  assert.equal(report.itemsAvailable, feed.items.length);
  for (const row of report.rows) {
    const old = seed.rows.find(point => point.slug === row.slug);
    for (const key of ['price', 'priceDay', 'quantity', 'basePrice', 'baseQuantity', 'baseExpenditure', 'weight']) {
      assert.equal(row[key], old[key], `${row.slug} ${key}`);
    }
    close(row.indexContribution, 100 * row.weight * row.price / row.basePrice, `${row.slug} contribution`);
    close(row.changeContribution, 100 * row.weight * (row.price / row.basePrice - 1), `${row.slug} change contribution`);
    assert.equal(row.notIndexed, false);
    if (old.indexContribution !== undefined) close(row.indexContribution, old.indexContribution, `${row.slug} published contribution`);
  }
  close(report.rows.reduce((sum, row) => sum + row.indexContribution, 0), report.latest.cpi, 'summed contributions');
  for (const key of ['methodVersion', 'indexSpecification', 'specificationHash', 'basketHash',
    'sourceSnapshotHash', 'historyKind', 'historyNote', 'baseTurnoverCoverageProxy',
    'eligibleBaseTurnoverCoverageProxy', 'legacyCpiHistoryUrl']) {
    assert.deepEqual(report[key], seed[key], `frozen ${key}`);
  }
  assert.equal(report.contextItems.length, seed.contextItems?.length ?? 0);
  for (const context of report.contextItems) {
    const old = seed.contextItems.find(row => row.slug === context.slug);
    equalWithDerivedFloats(Object.fromEntries(Object.keys(old).map(key => [key, context[key]])), old,
      ['changeBase', 'changeDay', 'recentTurnoverProxy', 'indexContribution', 'changeContribution'], 'context');
    assert.equal(context.weight, 0);
    assert.equal(context.notIndexed, true);
  }
  assert.equal(report.cash.length, seed.cash.length);
  report.cash.forEach((row, index) => {
    const old = seed.cash[index];
    assert.deepEqual([row.slug, row.nx, row.price, row.quantity], [old.slug, old.nx, old.price, old.quantity]);
    close(row.rate, old.rate, `${row.slug} cash rate`);
  });
});

test('source calendar date stays partial and is independent of UTC offset/check date', () => {
  const altered = clone(feed);
  altered.updatedAt = `${feed.updatedAt.slice(0, 10)}T23:30:00-06:00`;
  const report = compute(altered, seed, { checkedAt: '2026-11-05T06:00:00Z' });
  assert.equal(report.latest.day, '2026-11-04');
  assert.equal(report.latest.at, altered.updatedAt);
  assert.equal(report.latest.partial, true);
  assert.equal(report.volumeHistory.at(-1).partial, true);
  assert.equal(report.history.at(-2).partial, false);
  assert.equal(report.lastCompleteDay, '2026-11-03');
});

test('seven-day quantity and turnover window rolls while basket selection and weights stay frozen', () => {
  const altered = clone(feed);
  altered.updatedAt = '2026-11-06T08:30:00Z';
  for (const item of altered.items) {
    item.h.push(['2026-11-05', item.h.at(-1)?.[1] ?? 100, 9]);
  }
  const report = compute(altered, seed, { checkedAt: '2026-11-06T09:00:00Z' });
  assert.equal(report.recentStart, '2026-10-30');
  assert.equal(report.recentEndExclusive, '2026-11-06');
  assert.equal(report.selectionStart, seed.selectionStart);
  assert.equal(report.selectionEndExclusive, seed.selectionEndExclusive);
  assert.equal(report.basketVersion, seed.basketVersion);
  const basket = new Set(seed.rows.map(row => row.slug));
  const all = recent(altered, '2026-10-30', '2026-11-06');
  const selected = recent(altered, '2026-10-30', '2026-11-06', basket);
  assert.equal(report.allRecentQuantity, all.reduce((sum, point) => sum + point[2], 0));
  assert.equal(report.basketRecentQuantity, selected.reduce((sum, point) => sum + point[2], 0));
  close(report.quantityCoverage, report.basketRecentQuantity / report.allRecentQuantity, 'quantity coverage');
  close(report.turnoverCoverageProxy,
    selected.reduce((sum, [, p, q]) => sum + p * q, 0) / all.reduce((sum, [, p, q]) => sum + p * q, 0),
    'turnover coverage');
  for (const row of report.rows) {
    const old = seed.rows.find(entry => entry.slug === row.slug);
    assert.equal(row.weight, old.weight);
    assert.equal(row.basePrice, old.basePrice);
    assert.equal(row.selectionQuantity, old.selectionQuantity);
    const observations = recent(altered, report.recentStart, report.recentEndExclusive, new Set([row.slug]));
    assert.equal(row.recentQuantity, observations.reduce((sum, point) => sum + point[2], 0));
  }
  for (const row of report.cash) {
    const observations = recent(altered, report.recentStart, report.recentEndExclusive, new Set([row.slug]));
    assert.equal(row.recentQuantity, observations.reduce((sum, point) => sum + point[2], 0));
  }
});

test('new daily prices, volume and new feed members recompute all daily-derived values', () => {
  const altered = clone(feed);
  const member = altered.items.find(item => item.s === seed.rows[0].slug);
  const observation = member.h.at(-1);
  observation[1] *= 2;
  observation[2] += 100;
  member.sold += 100;
  const added = clone(altered.items.find(item => !seed.rows.some(row => row.slug === item.s) && item.k !== 'Cash Shop'));
  added.s = 'test-new-market-item';
  added.n = 'New public item';
  added.sold = 123;
  added.h = [[feed.updatedAt.slice(0, 10), 101, 13]];
  altered.items.push(added);
  const report = compute(altered);
  assert.equal(report.itemsAvailable, seed.itemsAvailable + 1);
  assert.equal(report.salesSinceLaunch, seed.salesSinceLaunch + 223);
  assert.equal(report.rows[0].quantity, seed.rows[0].quantity + 100);
  assert.equal(report.rows[0].price, seed.rows[0].price * 2);
  close(report.rows[0].indexContribution, 100 * seed.rows[0].weight * member.h.at(-1)[1] / seed.rows[0].basePrice,
    'changed row contribution');
  close(report.rows[0].changeContribution, 100 * seed.rows[0].weight * (member.h.at(-1)[1] / seed.rows[0].basePrice - 1),
    'changed row change contribution');
  close(report.latest.cpi,
    seed.latest.cpi + seed.rows[0].weight * seed.rows[0].price / seed.rows[0].basePrice * 100,
    'changed CPI');
  const day = report.volumeHistory.at(-1);
  const old = seed.volumeHistory.at(-1);
  const extra = added.h.at(-1);
  assert.equal(day.allSoldVolume, old.allSoldVolume + 100 + extra[2]);
  assert.equal(day.basketSoldVolume, old.basketSoldVolume + 100);
  assert.equal(day.allItemsObserved, old.allItemsObserved + 1);
  assert.equal(report.rows.length, 50);
  assert.ok(!report.rows.some(row => row.slug === added.s));
  for (const key of ['indexSpecification', 'specificationHash', 'basketHash', 'sourceSnapshotHash']) {
    assert.deepEqual(report[key], seed[key], `changed prices preserve frozen ${key}`);
  }
});

test('context item prices, histories and recent counts refresh without entering the fixed index', () => {
  const baseline = clone(seed);
  const contextSlug = 'wolbi-throwing-stars';
  const sourceItem = feed.items.find(item => item.s === contextSlug);
  assert.ok(sourceItem);
  assert.equal(baseline.basketVersion, 2);
  assert.ok(baseline.contextItems.some(row => row.slug === contextSlug));
  const altered = clone(feed);
  const old = compute(altered, baseline);
  const item = altered.items.find(entry => entry.s === contextSlug);
  item.h.at(-1)[1] *= 2;
  item.h.at(-2)[2] += 123;
  const report = compute(altered, baseline);
  const context = report.contextItems.find(row => row.slug === contextSlug);
  assert.equal(context.price, item.h.at(-1)[1]);
  assert.deepEqual(context.history, item.h);
  assert.equal(context.recentQuantity, old.contextItems.find(row => row.slug === contextSlug).recentQuantity + 123);
  assert.equal(context.basePrice, baseline.contextItems.find(row => row.slug === contextSlug).basePrice);
  assert.equal(context.indexContribution, 0);
  assert.equal(context.changeContribution, 0);
  assert.equal(context.notIndexed, true);
  assert.equal(context.weight, 0);
  assert.equal(context.retained, false);
  assert.equal(context.sourceUpdatedAt, altered.updatedAt);
  assert.equal(context.recentStart, report.recentStart);
  assert.equal(context.recentEndExclusive, report.recentEndExclusive);
  assert.deepEqual(report.history, old.history);
  assert.deepEqual(report.categories, old.categories);
  assert.deepEqual(report.rows, old.rows);
});

test('missing context retains its explicitly dated evidence and cannot block CPI', () => {
  assert.ok(seed.contextItems.length);
  const altered = clone(feed);
  const prior = seed.contextItems[0];
  altered.items = altered.items.filter(item => item.s !== prior.slug);
  altered.updatedAt = '2026-11-06T08:30:00Z';
  const report = compute(altered, seed, { checkedAt: altered.updatedAt });
  const retained = report.contextItems.find(row => row.slug === prior.slug);
  assert.equal(retained.retained, true);
  assert.match(retained.retainedReason, /missing/);
  assert.equal(retained.sourceUpdatedAt, seed.sourceUpdatedAt);
  assert.equal(retained.recentStart, seed.recentStart);
  assert.equal(retained.recentEndExclusive, seed.recentEndExclusive);
  assert.equal(retained.priceDay, prior.priceDay);
  assert.equal(retained.price, prior.price);
  assert.deepEqual(retained.history, prior.history);
  close(report.latest.cpi, seed.latest.cpi, 'missing-context CPI');
  assert.equal(report.sourceSnapshotHash, seed.sourceSnapshotHash);
  assert.equal(report.basketHash, seed.basketHash);
  const thin = clone(feed);
  thin.items.find(item => item.s === prior.slug).h = [['2026-11-04', 1, 1]];
  const thinReport = compute(thin);
  assert.equal(thinReport.contextItems[0].retained, true);
  assert.match(thinReport.contextItems[0].retainedReason, /No qualified/);
  close(thinReport.latest.cpi, seed.latest.cpi, 'thin-context CPI');
});

test('daily cash NX uses seed denomination schedule and exact-date qualifying sale counts', () => {
  const altered = clone(feed);
  const cash = altered.items.find(item => item.s === seed.cash[0].slug);
  cash.h.at(-1)[1] *= 3;
  cash.h.at(-1)[2] += 50;
  const report = compute(altered, seed, { ...options, config: { nx_prices: { [cash.n]: 1 } } });
  const points = report.cash.flatMap(row => row.history
    .filter(([day, , quantity]) => day === report.latest.day && quantity >= 5)
    .map(([, price, quantity]) => [price / row.nx, quantity]));
  close(report.latest.nxRate,
    points.reduce((sum, [rate, quantity]) => sum + rate * quantity, 0) / points.reduce((sum, [, quantity]) => sum + quantity, 0),
    'changed NX');
  assert.notEqual(report.latest.nxRate, seed.latest.nxRate);
  assert.equal(report.cash[0].nx, seed.cash[0].nx);
});

test('low-sample current observations affect recorded volume but do not create qualified CPI or NX sales', () => {
  const altered = clone(feed);
  const sourceDay = altered.updatedAt.slice(0, 10);
  const first = altered.items.find(item => item.s === seed.rows[0].slug);
  first.h.at(-1)[2] = 4;
  const cashSlugs = new Set(seed.cash.map(row => row.slug));
  let kept = 0;
  for (const item of altered.items) {
    if (!cashSlugs.has(item.s)) continue;
    const today = item.h.find(([day, , quantity]) => day === sourceDay && quantity >= 5);
    if (today && ++kept > 2) today[2] = 4;
  }
  const report = compute(altered);
  const row = report.rows[0];
  const previous = first.h.filter(([, , quantity]) => quantity >= 5).at(-1);
  assert.equal(row.priceDay, previous[0]);
  assert.equal(row.price, previous[1]);
  assert.equal(report.latest.cashItems, 2);
  assert.equal(report.latest.nxRate, null);
  close(report.latest.coverage, seed.latest.coverage - row.weight, 'qualified current CPI coverage');
  const actualRecorded = altered.items.flatMap(item => item.h)
    .filter(([day]) => day === sourceDay).reduce((sum, [, , quantity]) => sum + quantity, 0);
  assert.equal(report.volumeHistory.at(-1).allSoldVolume, actualRecorded);
});

test('disappearing basket member or missing qualified history rejects silent rebase', () => {
  const absent = clone(feed);
  absent.items = absent.items.filter(item => item.s !== seed.rows[0].slug);
  assert.throws(() => compute(absent), /Basket members disappeared/);
  const thin = clone(feed);
  thin.items.find(item => item.s === seed.rows[0].slug).h = [['2026-11-04', 100, 4]];
  assert.throws(() => compute(thin), /No qualified historical observation/);
});

test('separately dated rolling, smega, comparison, private API and live references are unchanged', () => {
  const baseline = clone(seed);
  baseline.live = {
    observedAt: '2026-10-31T00:00:00Z', sourceUrl: 'https://example.com/qualified-scanner',
    coverage: 1, nxCoverage: 1, cpi: 110, nxRate: 14,
  };
  baseline.intraday = [{ ...baseline.live }];
  const report = compute(feed, baseline, { checkedAt: '2026-11-06T10:00:00Z', builtAt: '2026-11-06T10:00:01Z' });
  for (const key of ['rollingReference', 'rollingReferenceHistory', 'smega', 'smegaSource',
    'comparisons', 'live', 'liveNote', 'intraday', 'publicApiStatus']) {
    assert.deepEqual(report[key], baseline[key], key);
  }
  assert.equal(report.live.observedAt, '2026-10-31T00:00:00Z');
  assert.equal(report.history.length, seed.history.length);
  assert.equal(report.sourceStatus.checkedAt, '2026-11-06T10:00:00Z');
  assert.equal(report.sourceUpdatedAt, feed.updatedAt);
});

test('zero recent sales return unknown shares and JSON-safe output', () => {
  const altered = clone(feed);
  altered.updatedAt = '2026-12-01T08:30:00Z';
  const report = compute(altered, seed, { checkedAt: altered.updatedAt });
  assert.equal(report.allRecentQuantity, 0);
  assert.equal(report.basketRecentQuantity, 0);
  assert.equal(report.quantityCoverage, null);
  assert.equal(report.turnoverCoverageProxy, null);
  assert.ok(JSON.stringify(report).length > 0);
});

test('frozen NX baseline survives rolling source history dropping the base period', () => {
  const altered = clone(feed);
  for (const item of altered.items) item.h = item.h.filter(([day]) => day > seed.baseEnd);
  const report = compute(altered);
  assert.equal(report.baseNxRate, seed.baseNxRate);
  assert.deepEqual(report.rows.map(row => [row.slug, row.basePrice, row.weight]),
    seed.rows.map(row => [row.slug, row.basePrice, row.weight]));
  close(report.latest.nxRate, seed.latest.nxRate, 'retained-base NX');
  const badSeed = clone(seed);
  badSeed.baseNxRate = null;
  assert.throws(() => compute(feed, badSeed), /frozen base NX rate/);
});

test('invalid dates, nonfinite values, unsafe counts and duplicate observations reject publication', () => {
  const changes = [
    input => { input.updatedAt = '2099-01-01T00:00:00Z'; },
    input => { input.updatedAt = '2026-02-30T00:00:00Z'; },
    input => { input.updatedAt = '2026-11-04T08:30:00'; },
    input => { input.items[0].h[0][0] = '2026-02-30'; },
    input => { input.items[0].h.at(-1)[0] = '2026-11-07'; },
    input => { input.items[0].h[0][1] = Number.NaN; },
    input => { input.items[0].h[0][1] = Number.POSITIVE_INFINITY; },
    input => { input.items[0].h[0][1] = -1; },
    input => { input.items[0].h[0][2] = true; },
    input => { input.items[0].h[0][2] = Number.MAX_SAFE_INTEGER + 1; },
    input => { input.items[0].sold = -1; },
    input => { input.items[0].h[1] = [...input.items[0].h[0]]; },
    input => { input.items[1].s = input.items[0].s; },
  ];
  for (const change of changes) {
    const altered = clone(feed);
    change(altered);
    assert.throws(() => compute(altered), TypeError);
  }
  const badSeed = clone(seed);
  badSeed.rows[0].weight = 0;
  assert.throws(() => compute(feed, badSeed), /basket row/);
  assert.throws(() => compute(feed, seed, { ...options, checkedAt: 'not-a-date' }), /check timestamp/);
  assert.throws(() => compute(feed, seed, { ...options, config: { base_start: '2026-10-22' } }), /cannot rebase/);
  assert.throws(() => compute(feed, seed, { ...options, config: { weight_cap: 0.05 } }), /frozen index specification/);
});

test('arithmetic overflow and source regression reject publication', () => {
  const overflow = clone(feed);
  overflow.items[0].h.at(-1)[1] = Number.MAX_VALUE;
  assert.throws(() => compute(overflow), /Unsafe/);
  const newerSeed = clone(seed);
  newerSeed.sourceUpdatedAt = '2026-11-05T00:00:00Z';
  assert.throws(() => compute(feed, newerSeed), /moved backwards/);
});

test('compute is deterministic, has no I/O, and does not mutate either input', () => {
  const originalFeed = JSON.stringify(feed);
  const originalSeed = JSON.stringify(seed);
  const a = compute();
  const b = compute();
  assert.deepEqual(a, b);
  a.rows[0].history[0][1] = -10;
  if (a.rollingReference) a.rollingReference.capturedAt = 'changed';
  assert.equal(JSON.stringify(feed), originalFeed);
  assert.equal(JSON.stringify(seed), originalSeed);
  assert.deepEqual(computeReport(feed, seed), computeReport(feed, seed));
  const core = readFileSync(new URL('../ops/worker-core.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(core, /(?:from\s+['"]node:|\b(?:fetch|readFile|writeFile|require|process)\s*\()/);
});
