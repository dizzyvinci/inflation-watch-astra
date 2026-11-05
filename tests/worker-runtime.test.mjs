import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { collect, calculationFingerprint, referenceFingerprint, retainHistories, CALCULATION_MODEL_VERSION, MAX_PUBLIC_READ_FLIGHTS, MAX_SHARED_REPORT_BYTES } from '../ops/worker.mjs';

const seed = JSON.parse(readFileSync(new URL('../dist/data.json', import.meta.url), 'utf8'));
const compiledVersion = JSON.parse(readFileSync(new URL('../dist/version.json', import.meta.url), 'utf8'));
const feed = JSON.parse(readFileSync(new URL('../cache/market.json', import.meta.url), 'utf8'));
const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const POINTER = 'version.json';
const STATE = '_private/collector-state.json';
const LOCK = '_private/collector-lock.json';
const clone = value => structuredClone(value);
const NOW = Math.max(Date.parse('2026-11-05T05:00:00Z'), Date.parse(seed.builtAt)) + 60_000;
// Cross-runtime derived sums may differ in their last bits (Python 3.12 vs
// JavaScript). Keep source/frozen fields exact; only derived CPI uses tolerance.
const close = (actual, expected, label) => {
  assert.ok(typeof actual === 'number' && Number.isFinite(actual), `${label}: finite actual`);
  assert.ok(typeof expected === 'number' && Number.isFinite(expected), `${label}: finite expected`);
  assert.ok(Math.abs(actual - expected) <= 1e-10 + 1e-12 * Math.max(Math.abs(actual), Math.abs(expected)),
    `${label}: ${actual} != ${expected}`);
};

class FakeR2 {
  values = new Map();
  events = [];
  sequence = 0;
  broken = false;
  beforePut = null;
  beforeGet = null;
  async get(key) {
    if (this.broken) throw new Error('Binding unavailable');
    this.events.push({ op: 'get', key });
    if (this.beforeGet) await this.beforeGet(key);
    const stored = this.values.get(key);
    if (!stored) return null;
    return {
      key, size: new TextEncoder().encode(stored.text).byteLength, etag: stored.etag, httpEtag: `"${stored.etag}"`,
      body: new Response(stored.text).body,
      json: async () => JSON.parse(stored.text),
      text: async () => stored.text,
    };
  }
  raw(key, value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const entry = { text, etag: `e${++this.sequence}` };
    this.values.set(key, entry);
    return entry;
  }
  read(key) { return JSON.parse(this.values.get(key).text); }
  async put(key, value, options = {}) {
    if (this.broken) throw new Error('Binding unavailable');
    if (this.beforePut) await this.beforePut(key, value, options);
    const old = this.values.get(key);
    const condition = options.onlyIf;
    const absent = condition instanceof Headers && condition.get('If-None-Match') === '*';
    if ((absent && old) || (condition?.etagMatches && old?.etag !== condition.etagMatches)) {
      this.events.push({ op: 'conflict', key });
      return null;
    }
    this.events.push({ op: 'put', key, options });
    const saved = this.raw(key, value);
    return { key, etag: saved.etag, httpEtag: `"${saved.etag}"` };
  }
}

class FakeCache {
  values = new Map();
  matches = 0;
  puts = 0;
  async match(request) { this.matches++; return this.values.get(request.url)?.clone(); }
  async put(request, response) { this.puts++; this.values.set(request.url, response.clone()); }
}

function response(input = feed, headers = {}) {
  return new Response(JSON.stringify(input), {
    headers: { 'Content-Type': 'application/json', ETag: '"source-v1"', 'Last-Modified': 'Wed, 04 Nov 2026 08:30:56 GMT', ...headers },
  });
}

function envFor(bucket = new FakeR2()) {
  return {
    SNAPSHOTS: bucket,
    ASSETS: { fetch: async request => new Response(`asset:${new URL(request.url).pathname}`, { status: new URL(request.url).pathname === '/' ? 200 : 404 }) },
  };
}

async function initialize(bucket = new FakeR2(), time = NOW) {
  const env = envFor(bucket);
  const result = await collect(env, { now: time, fetcher: async () => response() });
  assert.equal(result.status, 'published', result.detail);
  return { bucket, env, pointer: bucket.read(POINTER) };
}

async function request(env, path, init) {
  return worker.fetch(new Request(`https://inflation.example${path}`, init), env);
}

test('startup and unavailable storage return the compiled dated seed without upstream calls', async () => {
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Visitor attempted upstream fetch'); };
  try {
    const env = envFor();
    const pointer = await (await request(env, '/version.json')).json();
    assert.equal(pointer.version, compiledVersion.version);
    assert.equal(pointer.sourceUpdatedAt, seed.sourceUpdatedAt);
    assert.equal(pointer.sourceStatus.status, 'awaiting_collector');
    assert.equal(pointer.lastSuccessfulFetchAt, null);
    const dataResponse = await request(env, `/${pointer.data}`);
    assert.equal(dataResponse.headers.get('X-Inflation-Mode'), 'seed_fallback');
    assert.equal((await dataResponse.json()).latest.cpi, seed.latest.cpi);
    env.SNAPSHOTS.broken = true;
    const failed = await (await request(env, '/version.json')).json();
    assert.equal(failed.sourceStatus.status, 'degraded');
    assert.equal(failed.sourceUpdatedAt, seed.sourceUpdatedAt);
    assert.equal((await (await request(env, '/data.json')).json()).rows.length, 50);
    assert.equal((await request(env, '/')).status, 200);
  } finally { globalThis.fetch = savedFetch; }
});

test('a prior deployment seed-fallback pointer resolves to the current compiled seed without changing collection clocks or R2', async () => {
  const bucket = new FakeR2();
  const oldVersion = compiledVersion.version === 'aaaaaaaaaaaaaaaa' ? 'bbbbbbbbbbbbbbbb' : 'aaaaaaaaaaaaaaaa';
  const old = {
    ...clone(compiledVersion), version: oldVersion, data: `data-${oldVersion}.json`,
    basketVersion: seed.basketVersion, mode: 'seed_fallback',
    sourceStatus: { status: 'degraded', checkedAt: '2026-11-05T04:33:00Z', lastSuccessfulFetchAt: null, detail: 'Prior scheduled collection failed; retaining dated data.' },
    lastSuccessfulFetchAt: null, nextAllowedAt: '2026-11-05T04:43:00Z',
  };
  bucket.raw(POINTER, old);
  const env = envFor(bucket);
  const current = await (await request(env, '/version.json')).json();
  assert.equal(current.version, compiledVersion.version);
  assert.equal(current.data, compiledVersion.data);
  assert.equal(current.builtAt, compiledVersion.builtAt);
  assert.equal(current.sourceUpdatedAt, compiledVersion.sourceUpdatedAt);
  assert.equal(current.mode, 'seed_fallback');
  for (const key of ['status', 'checkedAt', 'lastSuccessfulFetchAt', 'detail']) assert.equal(current.sourceStatus[key], old.sourceStatus[key]);
  assert.equal(current.sourceStatus.fallback, 'current_compiled_seed');
  assert.equal(current.lastSuccessfulFetchAt, null);
  assert.equal(current.nextAllowedAt, old.nextAllowedAt);
  const body = await request(env, `/${current.data}`);
  assert.equal(body.status, 200);
  assert.equal((await body.json()).basketVersion, seed.basketVersion);
  assert.equal((await (await request(env, '/health.json')).json()).checkedAt, old.sourceStatus.checkedAt);
  assert.equal(bucket.events.filter(event => event.op === 'put').length, 0);
  assert.deepEqual(bucket.read(POINTER), old);
});

test('successful collection writes an immutable snapshot before the final public pointer', async () => {
  const bucket = new FakeR2();
  let call;
  const result = await collect(envFor(bucket), { now: NOW, fetcher: async (...args) => { call = args; return response(); } });
  assert.equal(result.status, 'published', result.detail);
  assert.equal(call[0], cfg.feed_url);
  assert.match(call[1].headers.get('User-Agent'), /github.com\/dizzyvinci\/inflation-watch-astra/);
  assert.equal(call[1].redirect, 'manual');
  assert.ok(call[1].signal instanceof AbortSignal);
  const pointer = bucket.read(POINTER);
  assert.match(pointer.data, /^data-[a-f0-9]{16}\.json$/);
  const report = bucket.read(pointer.data);
  assert.equal(report.basketVersion, seed.basketVersion);
  assert.equal(report.sourceSnapshotHash, seed.sourceSnapshotHash);
  assert.equal(report.sourceUpdatedAt, feed.updatedAt);
  assert.equal(pointer.sourceUpdatedAt, feed.updatedAt);
  assert.equal(pointer.lastSuccessfulFetchAt, new Date(NOW).toISOString());
  assert.equal(pointer.sourceStatus.checkedAt, pointer.lastSuccessfulFetchAt);
  const publicWrites = bucket.events.filter(event => event.op === 'put' && !event.key.startsWith('_private/'));
  assert.deepEqual(publicWrites.map(event => event.key), [pointer.data, POINTER]);
  assert.ok(bucket.read(STATE).feed.items.length > 1000);
  const state = bucket.read(STATE);
  assert.match(state.archivedSourceKey, /^_private\/sources\/2026-11-04\/[a-f0-9]{64}\.json$/);
  const archived = bucket.read(state.archivedSourceKey);
  assert.deepEqual(archived.feed, feed);
  assert.equal(archived.sourceUpdatedAt, feed.updatedAt);
  assert.equal(archived.archiveAt, new Date(NOW).toISOString());
  assert.equal(archived.feedHash, state.feedHash);
  assert.equal(state.archivedFeedHash, state.feedHash);
  assert.equal(report.calculationModelVersion, CALCULATION_MODEL_VERSION);
  assert.equal(report.calculationFingerprint, state.calculationFingerprint);
  const writes = bucket.events.filter(event => event.op === 'put').map(event => event.key);
  assert.ok(writes.indexOf(state.archivedSourceKey) < writes.indexOf(pointer.data));
  assert.equal(bucket.read(LOCK).released, true);
  assert.ok(bucket.read(LOCK).expiresAt <= NOW);
});

test('304 sends validators, preserves source/build/fetch clocks and writes no new snapshot', async () => {
  const { bucket, env, pointer } = await initialize();
  const beforeSnapshots = [...bucket.values.keys()].filter(key => key.startsWith('data-'));
  const archiveWrites = bucket.events.filter(event => event.op === 'put' && event.key.startsWith('_private/sources/')).length;
  let headers;
  const result = await collect(env, { now: NOW + 600_000, fetcher: async (_url, init) => {
    headers = init.headers;
    return new Response(null, { status: 304 });
  } });
  assert.equal(result.status, 'unchanged');
  assert.equal(headers.get('If-None-Match'), '"source-v1"');
  assert.equal(headers.get('If-Modified-Since'), 'Wed, 04 Nov 2026 08:30:56 GMT');
  const next = bucket.read(POINTER);
  for (const key of ['version', 'data', 'builtAt', 'sourceUpdatedAt', 'lastSuccessfulFetchAt']) assert.equal(next[key], pointer[key], key);
  assert.equal(next.sourceStatus.checkedAt, new Date(NOW + 600_000).toISOString());
  assert.equal(next.sourceStatus.status, 'unchanged');
  assert.deepEqual([...bucket.values.keys()].filter(key => key.startsWith('data-')), beforeSnapshots);
  assert.equal(bucket.events.filter(event => event.op === 'put' && event.key.startsWith('_private/sources/')).length, archiveWrites);
});

test('collection start, successful fetch completion and source observation clocks remain separate', async () => {
  const bucket = new FakeR2();
  let time = NOW;
  const result = await collect(envFor(bucket), { now: () => time, fetcher: async () => {
    time += 5000;
    return response();
  } });
  assert.equal(result.status, 'published');
  const pointer = bucket.read(POINTER);
  assert.equal(pointer.sourceStatus.checkedAt, new Date(NOW).toISOString());
  assert.equal(pointer.lastSuccessfulFetchAt, new Date(NOW + 5000).toISOString());
  assert.equal(pointer.builtAt, new Date(NOW + 5000).toISOString());
  assert.equal(pointer.sourceUpdatedAt, feed.updatedAt);
});

test('unchanged 200 updates only check/fetch status and does not manufacture versions', async () => {
  const { bucket, env, pointer } = await initialize();
  const offset = bucket.events.length;
  const result = await collect(env, { now: NOW + 600_000, fetcher: async () => response() });
  assert.equal(result.status, 'unchanged');
  const next = bucket.read(POINTER);
  assert.equal(next.version, pointer.version);
  assert.equal(next.builtAt, pointer.builtAt);
  assert.equal(next.sourceUpdatedAt, pointer.sourceUpdatedAt);
  assert.equal(next.lastSuccessfulFetchAt, new Date(NOW + 600_000).toISOString());
  assert.ok(!bucket.events.slice(offset).some(event => event.op === 'put' && event.key.startsWith('data-')));
});

test('changed feed recomputes from immutable seed, not a prior incomplete cash schedule', async () => {
  const { bucket, env, pointer } = await initialize();
  const old = bucket.read(pointer.data);
  old.cash = old.cash.slice(0, 1);
  old.rows[0].basePrice = 1;
  bucket.raw(pointer.data, old);
  const changed = clone(feed);
  changed.items.find(item => item.s === seed.rows[0].slug).h.at(-1)[1] *= 2;
  const result = await collect(env, { now: NOW + 600_000, fetcher: async () => response(changed) });
  assert.equal(result.status, 'published');
  const next = bucket.read(bucket.read(POINTER).data);
  assert.equal(next.cash.length, 29);
  assert.equal(next.rows[0].basePrice, seed.rows[0].basePrice);
  assert.equal(next.baseNxRate, seed.baseNxRate);
  assert.equal(next.sourceUpdatedAt, feed.updatedAt);
  assert.notEqual(next.latest.cpi, old.latest.cpi);
});

test('malformed, future and regressed sources keep last-good data and mark checks degraded', async () => {
  const cases = [
    () => new Response('{bad json'),
    () => { const bad = clone(feed); bad.items[0].h[0][1] = -1; return response(bad); },
    () => { const bad = clone(feed); bad.updatedAt = '2099-01-01T00:00:00Z'; return response(bad); },
    () => { const bad = clone(feed); bad.updatedAt = '2026-11-03T00:00:00Z'; return response(bad); },
    () => new Response('too big', { headers: { 'Content-Length': '5000001' } }),
    () => new Response('x'.repeat(5_000_001)),
    () => new Response(null, { status: 503 }),
  ];
  for (const badResponse of cases) {
    const { bucket, env, pointer } = await initialize();
    const before = bucket.values.get(pointer.data).text;
    const result = await collect(env, { now: NOW + 600_000, fetcher: async () => badResponse() });
    assert.equal(result.status, 'degraded');
    const next = bucket.read(POINTER);
    for (const key of ['version', 'builtAt', 'sourceUpdatedAt', 'lastSuccessfulFetchAt']) assert.equal(next[key], pointer[key], key);
    assert.equal(next.sourceStatus.status, 'degraded');
    assert.equal(next.sourceStatus.checkedAt, new Date(NOW + 600_000).toISOString());
    assert.equal(bucket.values.get(pointer.data).text, before);
  }
});

test('manual redirect handling rejects a 302 without following its destination or replacing last-good data', async () => {
  const { bucket, env, pointer } = await initialize();
  const beforeState = bucket.read(STATE);
  const offset = bucket.events.length;
  const calls = [];
  const result = await collect(env, { now: NOW + 600_000, fetcher: async (url, init) => {
    calls.push(url);
    assert.equal(init.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://different-host.invalid/market.json' } });
  } });
  assert.equal(result.status, 'degraded');
  assert.match(result.detail, /redirect rejected \(HTTP 302\)/);
  assert.deepEqual(calls, [cfg.feed_url]);
  const next = bucket.read(POINTER);
  for (const key of ['version', 'data', 'builtAt', 'sourceUpdatedAt', 'lastSuccessfulFetchAt']) {
    assert.equal(next[key], pointer[key], key);
  }
  assert.equal(next.sourceStatus.status, 'degraded');
  assert.equal(next.sourceStatus.checkedAt, new Date(NOW + 600_000).toISOString());
  assert.equal(bucket.read(STATE).feedHash, beforeState.feedHash);
  assert.ok(!bucket.events.slice(offset).some(event => event.op === 'put' && event.key.startsWith('data-')));
});

test('429 Retry-After persists a cooldown and future schedule checks skip upstream', async () => {
  for (const retryAfter of ['1800', new Date(NOW + 2_400_000).toUTCString()]) {
    const { bucket, env, pointer } = await initialize();
    const result = await collect(env, { now: NOW + 600_000, fetcher: async () => new Response(null, { status: 429, headers: { 'Retry-After': retryAfter } }) });
    assert.equal(result.status, 'degraded');
    assert.equal(result.nextAllowedAt, new Date(NOW + 2_400_000).toISOString());
    const failed = bucket.read(POINTER);
    assert.equal(failed.version, pointer.version);
    assert.equal(failed.lastSuccessfulFetchAt, pointer.lastSuccessfulFetchAt);
    let fetched = false;
    const skipped = await collect(env, { now: NOW + 1_200_000, fetcher: async () => { fetched = true; return response(); } });
    assert.equal(skipped.status, 'cooldown');
    assert.equal(fetched, false);
    assert.equal(bucket.read(POINTER).sourceStatus.checkedAt, failed.sourceStatus.checkedAt);
  }
});

test('overlapping collectors are excluded and expired leases can be acquired', async () => {
  const bucket = new FakeR2();
  const env = envFor(bucket);
  let resume;
  let started;
  const begun = new Promise(resolve => { started = resolve; });
  const blocked = new Promise(resolve => { resume = resolve; });
  const first = collect(env, { now: NOW, owner: 'first', fetcher: async () => { started(); await blocked; return response(); } });
  await begun;
  let secondFetched = false;
  const second = await collect(env, { now: NOW + 30_000, owner: 'second', fetcher: async () => { secondFetched = true; return response(); } });
  assert.equal(second.status, 'locked');
  assert.equal(secondFetched, false);
  resume();
  assert.equal((await first).status, 'published');
  bucket.raw(LOCK, { owner: 'expired', expiresAt: NOW - 1 });
  assert.equal((await collect(env, { now: NOW + 600_000, fetcher: async () => response() })).status, 'unchanged');
});

test('lease expiry and conditional release cannot publish over or delete a newer collector', async () => {
  const bucket = new FakeR2();
  let time = NOW;
  const result = await collect(envFor(bucket), { now: () => time, owner: 'old', fetcher: async () => {
    time += 121_000;
    bucket.raw(LOCK, { owner: 'new', expiresAt: time + 120_000 });
    return response();
  } });
  assert.equal(result.status, 'lease_lost');
  assert.equal(bucket.read(LOCK).owner, 'new');
  assert.equal(bucket.values.has(POINTER), false);
  assert.ok(bucket.events.some(event => event.op === 'conflict' && event.key === LOCK));
});

test('pointer CAS conflict keeps the winner and the next 304 can recover private candidate state', async () => {
  const { bucket, env, pointer } = await initialize();
  let raced = false;
  bucket.beforePut = key => {
    if (key === POINTER && !raced) {
      raced = true;
      bucket.raw(POINTER, { ...pointer, sourceStatus: { ...pointer.sourceStatus, detail: 'Winner wrote this pointer' } });
    }
  };
  const changed = clone(feed);
  changed.items.find(item => item.s === seed.rows[0].slug).h.at(-1)[1] *= 2;
  const failed = await collect(env, { now: NOW + 600_000, fetcher: async () => response(changed) });
  assert.equal(failed.status, 'lease_lost');
  assert.equal(bucket.read(POINTER).sourceStatus.detail, 'Winner wrote this pointer');
  assert.equal(bucket.read(POINTER).version, pointer.version);
  bucket.beforePut = null;
  const recovered = await collect(env, { now: NOW + 1_200_000, fetcher: async () => new Response(null, { status: 304 }) });
  assert.equal(recovered.status, 'published');
  assert.notEqual(bucket.read(POINTER).version, pointer.version);
});

test('same-method daily histories merge by date, new points win, and v1 is never spliced into v2', async () => {
  const { bucket, env, pointer } = await initialize();
  const prior = bucket.read(pointer.data);
  prior.history.unshift({ day: '2026-01-01', at: '2026-01-01T23:59:59Z', cpi: 999, coverage: 1, partial: false });
  prior.history.at(-1).cpi = -123;
  prior.volumeHistory.unshift({ day: '2026-01-01', at: '2026-01-01T12:00:00Z', allMesos: 999, basketMesos: 100 });
  bucket.raw(pointer.data, prior);
  const changed = clone(feed);
  changed.items[0].sold += 1;
  await collect(env, { now: NOW + 600_000, fetcher: async () => response(changed) });
  const mergedPointer = bucket.read(POINTER);
  const merged = bucket.read(mergedPointer.data);
  assert.equal(merged.history[0].day, '2026-01-01');
  assert.equal(merged.volumeHistory[0].day, '2026-01-01');
  close(merged.history.at(-1).cpi, seed.latest.cpi, 'merged latest CPI');
  merged.basketVersion = 1;
  bucket.raw(mergedPointer.data, merged);
  changed.items[0].sold += 1;
  await collect(env, { now: NOW + 1_200_000, fetcher: async () => response(changed) });
  const clean = bucket.read(bucket.read(POINTER).data);
  assert.ok(!clean.history.some(row => row.day === '2026-01-01'));
  assert.ok(!clean.volumeHistory.some(row => row.day === '2026-01-01'));
});

test('bounded source histories retain 365 days and daily series retain at most 7300 dates', async () => {
  const { bucket, env, pointer } = await initialize();
  const prior = bucket.read(pointer.data);
  const end = Date.parse('2026-10-06T00:00:00Z');
  const dates = Array.from({ length: 7301 }, (_, index) => new Date(end - (7301 - index) * 86_400_000).toISOString().slice(0, 10));
  prior.history = dates.map(day => ({ day, at: `${day}T23:59:59Z`, cpi: 100, coverage: 1, partial: false }));
  prior.volumeHistory = dates.map(day => ({ day, at: `${day}T12:00:00Z`, allMesos: 50, basketMesos: 10 }));
  const offer = { at: '2026-11-04T00:01:00Z', sourceUrl: 'https://example.com/dated-offer', rate: 14, kind: 'smega_ask', side: 'sell' };
  prior.smega.push(offer);
  bucket.raw(pointer.data, prior);
  const changed = clone(feed);
  const row = changed.items.find(item => item.s === seed.rows[0].slug);
  row.h = [...dates.slice(-500).map(day => [day, 100, 5]), ...row.h];
  const result = await collect(env, { now: NOW + 600_000, fetcher: async () => response(changed) });
  assert.equal(result.status, 'published', result.detail);
  const report = bucket.read(bucket.read(POINTER).data);
  assert.equal(report.history.length, 7300);
  assert.equal(report.volumeHistory.length, 7300);
  assert.ok(report.rows[0].history.length <= 365);
  const sourceCutoff = Date.parse(`${feed.updatedAt.slice(0, 10)}T00:00:00Z`) - 364 * 86_400_000;
  assert.ok(report.rows[0].history.every(([day]) => Date.parse(`${day}T00:00:00Z`) >= sourceCutoff));
  assert.equal(report.rows[0].basePrice, seed.rows[0].basePrice);
  assert.equal(report.baseNxRate, seed.baseNxRate);
  assert.equal(report.sourceSnapshotHash, seed.sourceSnapshotHash);
  assert.deepEqual(report.smega.find(point => point.sourceUrl === offer.sourceUrl), offer);
  close(report.latest.cpi, seed.latest.cpi, 'bounded-history latest CPI');
  const archive = bucket.read(bucket.read(STATE).archivedSourceKey);
  assert.deepEqual(archive.feed, changed);
  assert.ok(archive.feed.items.find(item => item.s === row.s).h.length > 365);
});

test('snapshot storage failure never advances the public pointer to a missing object', async () => {
  const { bucket, env, pointer } = await initialize();
  const changed = clone(feed);
  changed.items[0].sold++;
  let failed = false;
  bucket.beforePut = key => {
    if (key.startsWith('data-') && !failed) { failed = true; throw new Error('Injected storage failure'); }
  };
  const result = await collect(env, { now: NOW + 600_000, fetcher: async () => response(changed) });
  assert.equal(result.status, 'degraded');
  assert.equal(bucket.read(POINTER).version, pointer.version);
  assert.equal(bucket.read(POINTER).sourceStatus.status, 'degraded');
  assert.equal(bucket.read(STATE).feedHash, await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(feed)))
    .then(bytes => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('')));
});

test('visitor routes only expose allowlisted snapshots and use edge cache without source fetches', async () => {
  const { bucket, env, pointer } = await initialize();
  const savedFetch = globalThis.fetch;
  const savedCaches = globalThis.caches;
  const cache = new FakeCache();
  globalThis.caches = { default: cache };
  globalThis.fetch = async () => { throw new Error('Visitor attempted upstream'); };
  try {
    const first = await request(env, '/version.json?cachebuster=1');
    assert.equal((await first.json()).version, pointer.version);
    const readCount = bucket.events.filter(event => event.op === 'get').length;
    assert.equal((await (await request(env, '/version.json?cachebuster=2')).json()).version, pointer.version);
    assert.equal(bucket.events.filter(event => event.op === 'get').length, readCount);
    assert.ok(cache.matches >= 2);
    const snapshot = await request(env, `/${pointer.data}`);
    assert.equal((await snapshot.json()).rows.length, 50);
    assert.match(snapshot.headers.get('Cache-Control'), /immutable/);
    const head = await request(env, `/${pointer.data}`, { method: 'HEAD' });
    assert.equal(await head.text(), '');
    const unchanged = await request(env, `/${pointer.data}`, { headers: { 'If-None-Match': `"${pointer.version}"` } });
    assert.equal(unchanged.status, 304);
    const health = await (await request(env, '/health.json')).json();
    assert.equal(health.sourceUpdatedAt, feed.updatedAt);
    assert.ok(!('feed' in health));
    for (const path of ['/data-evil.json', '/data-../../_private/collector-state.json', '/data-%2f_private.json', '/_private/collector-state.json', `/${bucket.read(STATE).archivedSourceKey}`, '/collect', '/admin']) {
      const result = await request(env, path);
      assert.equal(result.status, 404, path);
      assert.doesNotMatch(await result.text(), /items|etag|collector-state/);
    }
    assert.equal((await request(env, '/version.json', { method: 'POST' })).status, 405);
    assert.ok(!bucket.events.some(event => event.op === 'get' && event.key.includes('evil')));
  } finally {
    globalThis.fetch = savedFetch;
    if (savedCaches === undefined) delete globalThis.caches;
    else globalThis.caches = savedCaches;
  }
});

test('missing raw cache on 304 degrades honestly and an initial failure keeps seed fallback', async () => {
  const bucket = new FakeR2();
  const env = envFor(bucket);
  const failed = await collect(env, { now: NOW, fetcher: async () => new Response(null, { status: 304 }) });
  assert.equal(failed.status, 'degraded');
  const pointer = bucket.read(POINTER);
  assert.equal(pointer.version, compiledVersion.version);
  assert.equal(pointer.sourceStatus.status, 'degraded');
  assert.equal(pointer.lastSuccessfulFetchAt, null);
  assert.equal((await (await request(env, `/${pointer.data}`)).json()).sourceUpdatedAt, seed.sourceUpdatedAt);
});

test('legacy calculation state migrates on 304 once, archives once, and preserves all market/fetch clocks', async () => {
  const { bucket, env, pointer } = await initialize();
  const legacy = bucket.read(STATE);
  const oldArchive = legacy.archivedSourceKey;
  for (const key of ['calculationFingerprint', 'archivedFeedHash', 'archivedSourceKey', 'archivedAt']) delete legacy[key];
  bucket.raw(STATE, legacy);
  bucket.values.delete(oldArchive);
  const prior = bucket.read(pointer.data);
  delete prior.cashBasket;
  delete prior.calculationFingerprint;
  delete prior.calculationModelVersion;
  bucket.raw(pointer.data, prior);
  const offset = bucket.events.length;
  const result = await collect(env, { now: NOW + 600_000, fetcher: async () => new Response(null, { status: 304 }) });
  assert.equal(result.status, 'published', result.detail);
  const next = bucket.read(POINTER), state = bucket.read(STATE), report = bucket.read(next.data);
  assert.notEqual(next.version, pointer.version);
  assert.equal(next.sourceUpdatedAt, pointer.sourceUpdatedAt);
  assert.equal(next.lastSuccessfulFetchAt, pointer.lastSuccessfulFetchAt);
  assert.equal(next.builtAt, new Date(NOW + 600_000).toISOString());
  assert.ok(report.cashBasket);
  assert.equal(report.cashBasket.status, seed.cashBasket?.status ?? 'unavailable');
  assert.equal(report.cashBasket.sourceUpdatedAt, feed.updatedAt);
  for (const key of ['history', 'intraday', 'smega', 'comparisons', 'rollingReferenceHistory']) assert.deepEqual(report[key], prior[key], key);
  assert.equal(state.calculationFingerprint, await calculationFingerprint());
  assert.equal(state.archivedAt, new Date(NOW + 600_000).toISOString());
  assert.equal(state.lastSuccessfulFetchAt, pointer.lastSuccessfulFetchAt);
  const puts = bucket.events.slice(offset).filter(event => event.op === 'put');
  assert.equal(puts.filter(event => event.key.startsWith('_private/sources/')).length, 1);
  const after = bucket.events.length;
  const repeat = await collect(env, { now: NOW + 1_200_000, fetcher: async () => new Response(null, { status: 304 }) });
  assert.equal(repeat.status, 'unchanged');
  assert.equal(bucket.read(POINTER).version, next.version);
  assert.equal(bucket.read(POINTER).builtAt, next.builtAt);
  assert.ok(!bucket.events.slice(after).some(event => event.op === 'put' && (event.key.startsWith('data-') || event.key.startsWith('_private/sources/'))));
});

test('archive storage failure retains last-good publication and cannot advance the accepted source marker', async () => {
  const { bucket, env, pointer } = await initialize();
  const state = bucket.read(STATE), changed = clone(feed);
  changed.items[0].sold++;
  const offset = bucket.events.length;
  bucket.beforePut = key => { if (key.startsWith('_private/sources/')) throw new Error('Injected private archive failure'); };
  const result = await collect(env, { now: NOW + 600_000, fetcher: async () => response(changed) });
  assert.equal(result.status, 'degraded');
  assert.match(result.detail, /archive failure/);
  const next = bucket.read(POINTER), retained = bucket.read(STATE);
  assert.equal(next.version, pointer.version);
  assert.equal(next.sourceUpdatedAt, pointer.sourceUpdatedAt);
  assert.equal(retained.feedHash, state.feedHash);
  assert.equal(retained.archivedFeedHash, state.archivedFeedHash);
  assert.equal(retained.archivedAt, state.archivedAt);
  assert.ok(!bucket.events.slice(offset).some(event => event.op === 'put' && event.key.startsWith('data-')));
});

test('invalid input cannot enter the private accepted-source archive', async () => {
  const bucket = new FakeR2(), malformed = clone(feed);
  malformed.items[0].h[0][2] = -1;
  const result = await collect(envFor(bucket), { now: NOW, fetcher: async () => response(malformed) });
  assert.equal(result.status, 'degraded');
  assert.ok(![...bucket.values.keys()].some(key => key.startsWith('_private/sources/')));
});

test('an existing content-addressed source archive is reused and never overwritten on marker recovery', async () => {
  const { bucket, env, pointer } = await initialize();
  const originalState = bucket.read(STATE), key = originalState.archivedSourceKey;
  const archivedText = bucket.values.get(key).text;
  const clearMarker = () => {
    const state = bucket.read(STATE);
    for (const field of ['archivedFeedHash', 'archivedSourceKey', 'archivedAt']) delete state[field];
    bucket.raw(STATE, state);
  };
  clearMarker();
  const reused = await collect(env, { now: NOW + 600_000, fetcher: async () => new Response(null, { status: 304 }) });
  assert.equal(reused.status, 'unchanged');
  assert.equal(bucket.values.get(key).text, archivedText);
  assert.equal(bucket.read(STATE).archivedAt, originalState.archivedAt);
  assert.equal(bucket.read(POINTER).version, pointer.version);
  const corrupted = bucket.read(key); corrupted.feed.items[0].sold++;
  bucket.raw(key, corrupted);
  clearMarker();
  const rejected = await collect(env, { now: NOW + 1_200_000, fetcher: async () => new Response(null, { status: 304 }) });
  assert.equal(rejected.status, 'degraded');
  assert.match(rejected.detail, /archive content-address conflict/);
  assert.equal(bucket.read(POINTER).version, pointer.version);
  assert.deepEqual(bucket.read(key), corrupted);
});

test('calculation fingerprint tracks definitions and ignores build, source and check clocks', async () => {
  const base = clone(seed), value = await calculationFingerprint(base);
  base.builtAt = '2030-01-01T00:00:00Z';
  base.sourceUpdatedAt = '2029-12-31T00:00:00Z';
  base.sourceStatus = { checkedAt: '2030-01-01T00:00:01Z' };
  base.history = [];
  base.comparisons = [];
  assert.equal(await calculationFingerprint(base), value);
  const nx = clone(seed); nx.cash[0].nx += 1;
  assert.notEqual(await calculationFingerprint(nx), value);
  const cash = clone(seed); cash.cashBasket = { version: 1, basketHash: 'a'.repeat(64) };
  assert.notEqual(await calculationFingerprint(cash), value);
  const goods = clone(seed); goods.basketHash = 'b'.repeat(64);
  assert.notEqual(await calculationFingerprint(goods), value);
});

test('reference fingerprint selects dated evidence, preserves observation clocks and ignores unrelated state', async () => {
  const base = clone(seed), fingerprint = await referenceFingerprint(base);
  base.builtAt = '2030-01-01T00:00:00Z';
  base.sourceUpdatedAt = '2030-01-01T00:00:00Z';
  base.sourceStatus = { checkedAt: '2030-01-01T00:00:00Z', status: 'ok' };
  base.privatePlanningStatus = { phase: 'changed' };
  base.history = [];
  assert.equal(await referenceFingerprint(base), fingerprint);
  const reorder = value => Array.isArray(value) ? value.map(reorder)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value;
  assert.equal(await referenceFingerprint(reorder(seed)), fingerprint, 'object key order is immaterial');
  for (const key of ['comparisons', 'reportedNxHistory', 'rollingReference', 'rollingReferenceHistory', 'smega', 'smegaSource']) {
    const changed = clone(seed);
    changed[key] = { evidence: changed[key] ?? null, capturedAt: '2026-11-05T04:59:00Z' };
    assert.notEqual(await referenceFingerprint(changed), fingerprint, key);
    assert.equal(await calculationFingerprint(changed), await calculationFingerprint(seed), `${key} is not a calculation definition`);
  }
  for (const key of ['metadataItems', 'identityMap']) {
    const changed = clone(seed);
    changed.cashCatalog = { ...changed.cashCatalog, [key]: [{ id: 1007133, sourceUrl: 'https://maplestory.io/api/MCW/1/item/1007133', evidence: 'accepted catalog metadata' }] };
    assert.notEqual(await referenceFingerprint(changed), fingerprint, key + ' is additive reference evidence');
    assert.equal(await calculationFingerprint(changed), await calculationFingerprint(seed), 'catalog evidence never rebases the baskets');
  }
  const decorated = clone(seed);
  decorated.spriteMap = { ...decorated.spriteMap, '1007133': 'assets/teddy-bear-headgear.png' };
  assert.notEqual(await referenceFingerprint(decorated), fingerprint, 'accepted decorative sprite metadata can publish independently');
  assert.equal(await calculationFingerprint(decorated), await calculationFingerprint(seed), 'art does not change the calculation definition');
});

function captureBaseline(capturedAt) {
  const baseline = clone(seed);
  baseline.comparisons = [{ kind: 'player_report', rate: 19.7, observedAt: capturedAt,
    timestampKind: 'captured_at', sourceDate: '2026-11-04', sourceUrl: 'https://meowdb.com/msclassic/free-market' }];
  baseline.smegaSource = { ...baseline.smegaSource, capturedAt };
  return baseline;
}

test('a later approved reference capture publishes once on 304 without refreshing daily or trade clocks', async () => {
  const bucket = new FakeR2(), env = envFor(bucket);
  const older = captureBaseline('2026-11-05T03:00:00Z');
  const newer = captureBaseline('2026-11-05T04:30:00Z');
  assert.equal((await collect(env, { now: NOW, baseline: older, fetcher: async () => response() })).status, 'published');
  const oldPointer = bucket.read(POINTER), oldReport = bucket.read(oldPointer.data);
  const offset = bucket.events.length;
  const changed = await collect(env, { now: NOW + 600_000, baseline: newer, fetcher: async () => new Response(null, { status: 304 }) });
  assert.equal(changed.status, 'published', changed.detail);
  const pointer = bucket.read(POINTER), report = bucket.read(pointer.data);
  assert.notEqual(pointer.version, oldPointer.version);
  assert.equal(pointer.sourceUpdatedAt, oldPointer.sourceUpdatedAt);
  assert.equal(pointer.lastSuccessfulFetchAt, oldPointer.lastSuccessfulFetchAt);
  assert.equal(pointer.builtAt, new Date(NOW + 600_000).toISOString());
  assert.equal(report.comparisons.at(-1).observedAt, '2026-11-05T04:30:00Z');
  assert.equal(report.smegaSource.capturedAt, '2026-11-05T04:30:00Z');
  for (const key of ['history', 'intraday', 'smega', 'rollingReferenceHistory']) assert.deepEqual(report[key], oldReport[key], key);
  assert.equal(report.latest.at, oldReport.latest.at);
  assert.equal(report.referenceFingerprint, await referenceFingerprint(newer));
  assert.equal(pointer.referenceFingerprint, report.referenceFingerprint);
  assert.equal(bucket.read(STATE).referenceFingerprint, report.referenceFingerprint);
  const writes = bucket.events.slice(offset).filter(event => event.op === 'put');
  assert.equal(writes.filter(event => event.key.startsWith('data-')).length, 1);
  assert.equal(writes.filter(event => event.key.startsWith('_private/sources/')).length, 0);
  const after = bucket.events.length;
  const repeated = await collect(env, { now: NOW + 1_200_000, baseline: newer, fetcher: async () => new Response(null, { status: 304 }) });
  assert.equal(repeated.status, 'unchanged');
  assert.equal(bucket.read(POINTER).version, pointer.version);
  assert.equal(bucket.read(POINTER).builtAt, pointer.builtAt);
  assert.ok(!bucket.events.slice(after).some(event => event.op === 'put' && event.key.startsWith('data-')));
});

test('reference fingerprint legacy migration on 304 publishes only once', async () => {
  const { bucket, env, pointer } = await initialize();
  const state = bucket.read(STATE);
  delete state.referenceFingerprint;
  const legacy = clone(pointer); delete legacy.referenceFingerprint;
  bucket.raw(STATE, state); bucket.raw(POINTER, legacy);
  const options = { now: NOW + 600_000, fetcher: async () => new Response(null, { status: 304 }) };
  assert.equal((await collect(env, options)).status, 'published');
  const upgraded = bucket.read(POINTER);
  assert.equal(upgraded.sourceUpdatedAt, pointer.sourceUpdatedAt);
  assert.equal(upgraded.lastSuccessfulFetchAt, pointer.lastSuccessfulFetchAt);
  assert.equal((await collect(env, { ...options, now: NOW + 1_200_000 })).status, 'unchanged');
  assert.equal(bucket.read(POINTER).version, upgraded.version);
});

test('failed snapshot or pointer publication cannot acknowledge a new reference capture', async () => {
  for (const phase of ['snapshot', 'pointer']) {
    const { bucket, env, pointer } = await initialize();
    const oldFingerprint = bucket.read(STATE).referenceFingerprint;
    const baseline = captureBaseline('2026-11-05T04:45:00Z');
    let failed = false;
    bucket.beforePut = key => {
      if (!failed && (phase === 'snapshot' ? key.startsWith('data-') : key === POINTER)) {
        failed = true;
        if (phase === 'snapshot') throw new Error('Snapshot storage unavailable');
        bucket.raw(POINTER, { ...pointer, raceWinner: true });
      }
    };
    const result = await collect(env, { now: NOW + 600_000, baseline, fetcher: async () => new Response(null, { status: 304 }) });
    assert.equal(result.status, phase === 'pointer' ? 'lease_lost' : 'degraded');
    assert.equal(bucket.read(POINTER).version, pointer.version, phase);
    assert.equal(bucket.read(POINTER).referenceFingerprint, oldFingerprint, phase);
    assert.equal(bucket.read(STATE).referenceFingerprint, oldFingerprint, phase);
    bucket.beforePut = null;
    assert.equal((await collect(env, { now: NOW + 1_200_000, baseline, fetcher: async () => new Response(null, { status: 304 }) })).status, 'published');
    assert.equal(bucket.read(STATE).referenceFingerprint, await referenceFingerprint(baseline));
  }
});

test('failed private reference acknowledgement repairs on 304 without duplicate publication', async () => {
  const { bucket, env } = await initialize();
  const baseline = captureBaseline('2026-11-05T04:45:00Z');
  const expected = await referenceFingerprint(baseline);
  bucket.beforePut = (key, value) => {
    if (key === STATE && JSON.parse(value).referenceFingerprint === expected) throw new Error('Acknowledgement unavailable');
  };
  assert.equal((await collect(env, { now: NOW + 600_000, baseline, fetcher: async () => new Response(null, { status: 304 }) })).status, 'published');
  const pointer = bucket.read(POINTER);
  assert.equal(pointer.referenceFingerprint, expected);
  assert.notEqual(bucket.read(STATE).referenceFingerprint, expected);
  bucket.beforePut = null;
  const offset = bucket.events.length;
  assert.equal((await collect(env, { now: NOW + 1_200_000, baseline, fetcher: async () => new Response(null, { status: 304 }) })).status, 'unchanged');
  assert.equal(bucket.read(POINTER).version, pointer.version);
  assert.equal(bucket.read(STATE).referenceFingerprint, expected);
  assert.ok(!bucket.events.slice(offset).some(event => event.op === 'put' && event.key.startsWith('data-')));
});

test('cash history retains at most 7300 dates only for the identical independent cash definition', () => {
  const hash = 'c'.repeat(64), day = feed.updatedAt.slice(0, 10);
  const point = { day, at: feed.updatedAt, cpi: 123, coverage: .9, pricedCoverage: 1, partial: true };
  const report = { basketVersion: 2, basketHash: 'goods-v2', sourceUpdatedAt: feed.updatedAt,
    history: [point], volumeHistory: [], rows: [], cash: [],
    cashBasket: { status: 'ok', kind: 'cash_price_index', version: 1, basketHash: hash, rows: [], history: [point], latest: point } };
  const end = Date.parse('2026-10-06T00:00:00Z');
  const older = Array.from({ length: 7301 }, (_, i) => ({ day: new Date(end - (7301 - i) * 86_400_000).toISOString().slice(0, 10), cpi: 100 }));
  const previous = { basketVersion: 1, basketHash: 'goods-v1', history: [{ day: '1999-01-01', cpi: 999 }],
    cashBasket: { status: 'ok', kind: 'cash_price_index', version: 1, basketHash: hash, history: [...older, { ...point, cpi: -999 }] } };
  const retained = retainHistories(clone(report), previous);
  assert.equal(retained.cashBasket.history.length, 7300);
  assert.equal(retained.cashBasket.history.at(-1).cpi, 123);
  assert.equal(retained.cashBasket.latest.cpi, 123);
  assert.deepEqual(retained.history, [point]);
  const changed = clone(previous); changed.cashBasket.basketHash = 'd'.repeat(64);
  assert.deepEqual(retainHistories(clone(report), changed).cashBasket.history, [point]);
  const wrongVersion = clone(previous); wrongVersion.cashBasket.version = 2;
  assert.deepEqual(retainHistories(clone(report), wrongVersion).cashBasket.history, [point]);
  const unavailable = clone(report); unavailable.cashBasket = { status: 'unavailable', rows: [], history: [], latest: null };
  assert.deepEqual(retainHistories(unavailable, previous).cashBasket.history, []);
});

test('runtime/config contain no credentials or public collection endpoint', () => {
  const source = readFileSync(new URL('../ops/worker.mjs', import.meta.url), 'utf8');
  const wrangler = JSON.parse(readFileSync(new URL('../ops/wrangler.jsonc', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /(?:from\s+['"]node:|CLOUDFLARE_API_TOKEN|Authorization\s*:)/);
  assert.equal(wrangler.name, 'inflation-watch-astra');
  assert.equal(wrangler.r2_buckets[0].binding, 'SNAPSHOTS');
  assert.equal(wrangler.limits.cpu_ms, 1000);
  assert.equal(wrangler.assets.run_worker_first, true);
  assert.deepEqual(wrangler.triggers.crons, ['3,13,23,33,43,53 * * * *']);
});

test('1000 simultaneous cold pointer visitors coalesce one R2 read with no provider fetch', async () => {
  const { bucket, env, pointer } = await initialize();
  const savedCaches = globalThis.caches, savedFetch = globalThis.fetch;
  delete globalThis.caches;
  let providerCalls = 0, release;
  globalThis.fetch = async () => { providerCalls++; throw new Error('Forbidden provider call'); };
  const gate = new Promise(resolve => { release = resolve; });
  bucket.beforeGet = key => key === POINTER ? gate : undefined;
  const offset = bucket.events.length;
  try {
    const tasks = Array.from({ length: 1000 }, () => request(env, '/version.json').then(response => response.json()));
    await new Promise(resolve => setImmediate(resolve));
    const pendingReads = bucket.events.slice(offset).filter(event => event.op === 'get' && event.key === POINTER).length;
    release();
    const results = await Promise.all(tasks);
    assert.equal(pendingReads, 1);
    assert(results.every(value => value.version === pointer.version && value.data === pointer.data));
    results[0].sourceStatus.status = 'changed only in one client';
    assert.notEqual(results[1].sourceStatus.status, results[0].sourceStatus.status);
    assert.equal(providerCalls, 0);
    assert.ok(!bucket.events.slice(offset).some(event => event.op === 'put'));
  } finally { release(); globalThis.fetch = savedFetch; if (savedCaches === undefined) delete globalThis.caches; else globalThis.caches = savedCaches; }
});

test('250 simultaneous cold report-alias visitors share one pointer and one payload read with independent bodies', async () => {
  const { bucket, env, pointer } = await initialize();
  const saved = globalThis.caches; delete globalThis.caches;
  let release; const gate = new Promise(resolve => { release = resolve; });
  bucket.beforeGet = key => key === POINTER ? gate : undefined;
  const offset = bucket.events.length;
  try {
    const tasks = Array.from({ length: 250 }, async () => {
      const response = await request(env, '/data.json');
      assert.equal(response.status, 200);
      assert.match(response.headers.get('Cache-Control'), /s-maxage=30/);
      return response.json();
    });
    await new Promise(resolve => setImmediate(resolve)); release();
    const results = await Promise.all(tasks);
    assert.equal(bucket.events.slice(offset).filter(event => event.op === 'get' && event.key === POINTER).length, 1);
    assert.equal(bucket.events.slice(offset).filter(event => event.op === 'get' && event.key === pointer.data).length, 1);
    assert(results.every(value => value.rows.length === 50 && value.cash.length === 29 && value.cashBasket.rows.length === 28));
    assert.equal(new Set(results.map(value => value.sourceUpdatedAt)).size, 1);
  } finally { release(); if (saved === undefined) delete globalThis.caches; else globalThis.caches = saved; }
});

test('coalesced named snapshots preserve independent GET, HEAD and ETag responses', async () => {
  const { bucket, env, pointer } = await initialize();
  const saved = globalThis.caches; delete globalThis.caches;
  let release; const gate = new Promise(resolve => { release = resolve; });
  bucket.beforeGet = key => key === pointer.data ? gate : undefined;
  const offset = bucket.events.length;
  try {
    const tasks = Array.from({ length: 150 }, async (_, i) => {
      const mode = i % 3;
      const response = await request(env, '/' + pointer.data, mode === 1 ? { method: 'HEAD' } : mode === 2 ? { headers: { 'If-None-Match': `"${pointer.version}"` } } : undefined);
      assert.equal(response.status, mode === 2 ? 304 : 200);
      assert.equal(response.headers.get('ETag'), `"${pointer.version}"`);
      if (mode) assert.equal(await response.text(), '');
      else assert.equal((await response.json()).rows.length, 50);
    });
    await new Promise(resolve => setImmediate(resolve)); release(); await Promise.all(tasks);
    assert.equal(bucket.events.slice(offset).filter(event => event.op === 'get' && event.key === pointer.data).length, 1);
  } finally { release(); if (saved === undefined) delete globalThis.caches; else globalThis.caches = saved; }
});

test('cold-read coalescing isolates different bucket bindings and clears storage/cache failures for retries', async () => {
  const one = await initialize(), two = await initialize();
  const other = two.bucket.read(POINTER); other.sourceStatus.detail = 'Different binding'; two.bucket.raw(POINTER, other);
  const saved = globalThis.caches; delete globalThis.caches;
  let release; const gate = new Promise(resolve => { release = resolve; });
  one.bucket.beforeGet = key => key === POINTER ? gate : undefined;
  two.bucket.beforeGet = key => key === POINTER ? gate : undefined;
  try {
    const tasks = [request(one.env, '/version.json'), request(two.env, '/version.json')];
    await new Promise(resolve => setImmediate(resolve)); release();
    const [a, b] = await Promise.all(tasks.map(async task => (await task).json()));
    assert.notEqual(a.sourceStatus.detail, b.sourceStatus.detail);
    let fail = true;
    one.bucket.beforeGet = () => { if (fail) { fail = false; throw new Error('One read failed'); } };
    const fallback = await (await request(one.env, '/version.json')).json();
    assert.equal(fallback.sourceStatus.status, 'degraded');
    const retry = await (await request(one.env, '/version.json')).json();
    assert.equal(retry.version, one.pointer.version);
    let puts = 0;
    globalThis.caches = { default: { match: async () => { throw new Error('Cache unavailable'); }, put: async () => { puts++; throw new Error('Cache unavailable'); } } };
    for (let i = 0; i < 2; i++) assert.equal((await request(one.env, '/' + one.pointer.data)).status, 200);
    assert.equal(puts, 2, 'Rejected cache writes must not remain in flight');
    const missing = 'data-' + 'e'.repeat(16) + '.json';
    assert.equal((await request(one.env, '/' + missing)).status, 404);
    one.bucket.raw(missing, seed);
    assert.equal((await (await request(one.env, '/' + missing)).json()).rows.length, 50);
  } finally { release(); if (saved === undefined) delete globalThis.caches; else globalThis.caches = saved; }
});

test('distinct cold snapshot names cannot grow the pending map beyond its fixed bound and private paths never enter it', async () => {
  const bucket = new FakeR2(), env = envFor(bucket);
  const saved = globalThis.caches; delete globalThis.caches;
  let release; const gate = new Promise(resolve => { release = resolve; });
  bucket.beforeGet = () => gate;
  const names = Array.from({ length: MAX_PUBLIC_READ_FLIGHTS + 1 }, (_, i) => `data-${i.toString(16).padStart(16, '0')}.json`);
  try {
    const tasks = names.map(name => request(env, '/' + name));
    await new Promise(resolve => setImmediate(resolve));
    tasks.push(request(env, '/' + names[0]), request(env, '/' + names.at(-1)));
    assert.equal((await request(env, '/_private/sources/2026-11-04/private.json')).status, 404);
    assert.equal((await request(env, '/data-invalid.json')).status, 404);
    await new Promise(resolve => setImmediate(resolve));
    const firstReads = bucket.events.filter(event => event.op === 'get' && event.key === names[0]).length;
    const overflowReads = bucket.events.filter(event => event.op === 'get' && event.key === names.at(-1)).length;
    release(); assert((await Promise.all(tasks)).every(response => response.status === 404));
    assert.equal(firstReads, 1);
    assert.equal(overflowReads, 2, 'Overflow bypasses coalescing instead of allocating another entry');
    assert(bucket.events.filter(event => event.op === 'get').every(event => /^data-[a-f0-9]{16}\.json$/.test(event.key)));
    await request(env, '/' + names[0]);
    assert.equal(bucket.events.filter(event => event.op === 'get' && event.key === names[0]).length, 2, 'Settled entries must be removed');
  } finally { release(); if (saved === undefined) delete globalThis.caches; else globalThis.caches = saved; }
});

test('reports above the sharing size bound keep independent streams without buffering a shared large body', async () => {
  const bucket = new FakeR2(), env = envFor(bucket), name = 'data-' + 'd'.repeat(16) + '.json';
  const value = { text: 'x'.repeat(MAX_SHARED_REPORT_BYTES + 1) }; bucket.raw(name, value);
  const saved = globalThis.caches; delete globalThis.caches;
  let release; const gate = new Promise(resolve => { release = resolve; }); bucket.beforeGet = () => gate;
  try {
    const tasks = Array.from({ length: 8 }, async () => {
      const response = await request(env, '/' + name); assert.equal(response.status, 200);
      return (await response.json()).text.length;
    });
    await new Promise(resolve => setImmediate(resolve)); release();
    assert((await Promise.all(tasks)).every(length => length === value.text.length));
    assert.equal(bucket.events.filter(event => event.op === 'get' && event.key === name).length, 8);
  } finally { release(); if (saved === undefined) delete globalThis.caches; else globalThis.caches = saved; }
});

test('HTTP521 or network failure publishes newer references once from verified accepted cache without freshening daily evidence', async () => {
  for (const offline of [async () => new Response(null, { status: 521 }), async () => { throw new Error('Network unavailable'); }]) {
    const { bucket, env, pointer } = await initialize();
    const old = bucket.read(pointer.data), capturedAt = new Date(NOW + 300_000).toISOString(), baseline = captureBaseline(capturedAt);
    const state = bucket.read(STATE), offset = bucket.events.length;
    let calls = 0;
    const options = { now: NOW + 600_000, baseline, fetcher: async () => { calls++; return offline(); } };
    const result = await collect(env, options);
    assert.equal(result.status, 'degraded', result.detail);
    assert.equal(result.upgraded, true);
    assert.equal(calls, 1);
    const next = bucket.read(POINTER), report = bucket.read(next.data);
    assert.notEqual(next.version, pointer.version);
    assert.equal(next.sourceStatus.status, 'degraded');
    assert.match(next.sourceStatus.detail, /no new daily fetch succeeded/);
    assert.equal(next.sourceUpdatedAt, pointer.sourceUpdatedAt);
    assert.equal(next.lastSuccessfulFetchAt, pointer.lastSuccessfulFetchAt);
    assert.equal(report.sourceUpdatedAt, old.sourceUpdatedAt);
    assert.equal(report.comparisons.at(-1).observedAt, capturedAt);
    assert.equal(report.smegaSource.capturedAt, capturedAt);
    for (const key of ['latest', 'rows', 'cash', 'cashBasket', 'history', 'volumeHistory', 'intraday']) assert.deepEqual(report[key], old[key], key);
    assert.equal(bucket.read(STATE).feedHash, state.feedHash);
    assert.equal(bucket.read(STATE).archivedAt, state.archivedAt);
    assert.equal(bucket.read(STATE).referenceFingerprint, await referenceFingerprint(baseline));
    const writes = bucket.events.slice(offset).filter(event => event.op === 'put');
    assert.equal(writes.filter(event => event.key.startsWith('data-')).length, 1);
    assert.equal(writes.filter(event => event.key.startsWith('_private/sources/')).length, 0);
    assert.ok(writes.findIndex(event => event.key === next.data) < writes.findIndex(event => event.key === POINTER));
    const after = bucket.events.length;
    const repeat = await collect(env, { ...options, now: NOW + 1_200_000 });
    assert.equal(repeat.status, 'degraded');
    assert.equal(repeat.upgraded, undefined);
    assert.equal(bucket.read(POINTER).version, next.version);
    assert.equal(bucket.read(POINTER).builtAt, next.builtAt);
    assert.ok(!bucket.events.slice(after).some(event => event.op === 'put' && event.key.startsWith('data-')));
  }
});

test('a calculation upgrade also uses accepted cache on source failure and legacy committed feed hashes need no new archive', async () => {
  const { bucket, env, pointer } = await initialize();
  const state = bucket.read(STATE);
  for (const key of ['archivedFeedHash', 'archivedSourceKey', 'archivedAt']) delete state[key];
  state.calculationFingerprint = 'old-calculation';
  const legacy = clone(pointer); delete legacy.calculationFingerprint;
  bucket.raw(STATE, state); bucket.raw(POINTER, legacy);
  const offset = bucket.events.length;
  const result = await collect(env, { now: NOW + 600_000, fetcher: async () => new Response(null, { status: 521 }) });
  assert.equal(result.status, 'degraded'); assert.equal(result.upgraded, true);
  const next = bucket.read(POINTER);
  assert.equal(next.calculationFingerprint, await calculationFingerprint());
  assert.equal(next.sourceUpdatedAt, pointer.sourceUpdatedAt);
  assert.equal(next.lastSuccessfulFetchAt, pointer.lastSuccessfulFetchAt);
  assert.ok(!bucket.events.slice(offset).some(event => event.op === 'put' && event.key.startsWith('_private/sources/')));
  assert.equal(bucket.read(STATE).archivedFeedHash, undefined);
});

test('429 upgrade retains Retry-After and another independent reference upgrade can publish during cooldown without a fetch', async () => {
  const { bucket, env, pointer } = await initialize();
  const first = captureBaseline(new Date(NOW + 300_000).toISOString()), second = captureBaseline(new Date(NOW + 900_000).toISOString());
  const result = await collect(env, { now: NOW + 600_000, baseline: first,
    fetcher: async () => new Response(null, { status: 429, headers: { 'Retry-After': '1800' } }) });
  assert.equal(result.status, 'degraded'); assert.equal(result.upgraded, true);
  const failed = bucket.read(POINTER), checkClock = failed.sourceStatus.checkedAt;
  assert.equal(failed.nextAllowedAt, new Date(NOW + 2_400_000).toISOString());
  let calls = 0;
  const skipped = await collect(env, { now: NOW + 1_200_000, baseline: second, fetcher: async () => { calls++; return response(); } });
  assert.equal(skipped.status, 'cooldown'); assert.equal(skipped.upgraded, true); assert.equal(calls, 0);
  const next = bucket.read(POINTER), report = bucket.read(next.data);
  assert.notEqual(next.version, failed.version);
  assert.equal(next.sourceStatus.status, 'degraded');
  assert.equal(next.sourceStatus.checkedAt, checkClock, 'A skipped fetch does not create a new source check');
  assert.equal(next.nextAllowedAt, failed.nextAllowedAt);
  assert.equal(next.lastSuccessfulFetchAt, pointer.lastSuccessfulFetchAt);
  assert.equal(report.smegaSource.capturedAt, second.smegaSource.capturedAt);
  const repeated = await collect(env, { now: NOW + 1_800_000, baseline: second, fetcher: async () => { calls++; return response(); } });
  assert.equal(repeated.status, 'cooldown'); assert.equal(repeated.upgraded, undefined); assert.equal(calls, 0);
  assert.equal(bucket.read(POINTER).version, next.version);
});

test('cached reference publication storage/CAS failures retain last-good state and can retry without another accepted source fetch', async () => {
  for (const phase of ['snapshot', 'pointer']) {
    const { bucket, env, pointer } = await initialize();
    const oldFingerprint = pointer.referenceFingerprint, baseline = captureBaseline('2026-11-05T04:45:00Z');
    let failed = false;
    bucket.beforePut = key => {
      if (!failed && (phase === 'snapshot' ? key.startsWith('data-') : key === POINTER)) {
        failed = true;
        if (phase === 'snapshot') throw new Error('Snapshot unavailable');
        bucket.raw(POINTER, { ...pointer, raceWinner: true });
      }
    };
    const options = { now: NOW + 600_000, baseline, fetcher: async () => new Response(null, { status: 521 }) };
    const rejected = await collect(env, options);
    assert.equal(rejected.status, phase === 'snapshot' ? 'degraded' : 'lease_lost');
    assert.equal(bucket.read(POINTER).version, pointer.version);
    assert.equal(bucket.read(POINTER).referenceFingerprint, oldFingerprint);
    assert.equal(bucket.read(STATE).referenceFingerprint, oldFingerprint);
    bucket.beforePut = null;
    const retry = await collect(env, { ...options, now: NOW + 1_200_000 });
    assert.equal(retry.status, 'degraded', retry.detail); assert.equal(retry.upgraded, true);
    assert.equal(bucket.read(POINTER).referenceFingerprint, await referenceFingerprint(baseline));
    assert.equal(bucket.read(POINTER).lastSuccessfulFetchAt, pointer.lastSuccessfulFetchAt);
  }
});

test('unverifiable or invalid cached feeds cannot publish new references after a source failure', async () => {
  const hash = async value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
    .then(buffer => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join(''));
  for (const mode of ['hash', 'structure', 'commit', 'archive']) {
    const { bucket, env, pointer } = await initialize();
    const state = bucket.read(STATE);
    if (mode === 'hash') state.feed.items[0].h.at(-1)[1] *= 2;
    if (mode === 'structure') {
      state.feed.items[0].h[0][2] = -1;
      state.feedHash = await hash(state.feed);
      for (const key of ['archivedFeedHash', 'archivedSourceKey', 'archivedAt']) delete state[key];
    }
    if (mode === 'commit') state.publishedVersion = '0'.repeat(16);
    if (mode === 'archive') bucket.values.delete(state.archivedSourceKey);
    bucket.raw(STATE, state);
    const offset = bucket.events.length;
    const result = await collect(env, { now: NOW + 600_000, baseline: captureBaseline('2026-11-05T04:45:00Z'), fetcher: async () => new Response(null, { status: 521 }) });
    assert.equal(result.status, 'degraded', mode);
    assert.ok(result.upgradeDeclined, mode);
    assert.equal(bucket.read(POINTER).version, pointer.version, mode);
    assert.ok(!bucket.events.slice(offset).some(event => event.op === 'put' && (event.key.startsWith('data-') || event.key.startsWith('_private/sources/'))), mode);
  }
});

test('a declined cache upgrade during cooldown cannot erase the provider cooldown or source failure clock', async () => {
  const { bucket, env } = await initialize();
  await collect(env, { now: NOW + 600_000, fetcher: async () => new Response(null, { status: 429, headers: { 'Retry-After': '1800' } }) });
  const pointer = bucket.read(POINTER), state = bucket.read(STATE);
  state.feedHash = '0'.repeat(64); bucket.raw(STATE, state);
  const result = await collect(env, { now: NOW + 1_200_000, baseline: captureBaseline('2026-11-05T04:45:00Z'), fetcher: async () => { throw new Error('Cooldown must skip fetch'); } });
  assert.equal(result.status, 'cooldown'); assert.ok(result.upgradeDeclined);
  assert.equal(bucket.read(STATE).nextAllowedAt, state.nextAllowedAt);
  assert.deepEqual(bucket.read(POINTER), pointer);
});


test('503 and 521 Retry-After skip future source requests without renewing evidence clocks', async () => {
  for (const status of [503, 521]) {
    const { bucket, env, pointer } = await initialize();
    const result = await collect(env, { now: NOW + 600_000,
      fetcher: async () => new Response(null, { status, headers: { 'Retry-After': '1800' } }) });
    assert.equal(result.status, 'degraded');
    assert.equal(result.nextAllowedAt, new Date(NOW + 2_400_000).toISOString());
    const retained = bucket.read(POINTER);
    assert.equal(retained.version, pointer.version);
    assert.equal(retained.sourceUpdatedAt, pointer.sourceUpdatedAt);
    assert.equal(retained.lastSuccessfulFetchAt, pointer.lastSuccessfulFetchAt);
    let calls = 0;
    const skipped = await collect(env, { now: NOW + 1_200_000, fetcher: async () => { calls++; return response(); } });
    assert.equal(skipped.status, 'cooldown'); assert.equal(calls, 0);
    assert.equal(bucket.read(POINTER).sourceStatus.checkedAt, retained.sourceStatus.checkedAt);
  }
});
