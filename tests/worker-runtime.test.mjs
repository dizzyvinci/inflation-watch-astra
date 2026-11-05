import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { collect } from '../ops/worker.mjs';

const seed = JSON.parse(readFileSync(new URL('../dist/data.json', import.meta.url), 'utf8'));
const compiledVersion = JSON.parse(readFileSync(new URL('../dist/version.json', import.meta.url), 'utf8'));
const feed = JSON.parse(readFileSync(new URL('../cache/market.json', import.meta.url), 'utf8'));
const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const POINTER = 'version.json';
const STATE = '_private/collector-state.json';
const LOCK = '_private/collector-lock.json';
const clone = value => structuredClone(value);
const NOW = Date.parse('2026-11-05T05:00:00Z');

class FakeR2 {
  values = new Map();
  events = [];
  sequence = 0;
  broken = false;
  beforePut = null;
  async get(key) {
    if (this.broken) throw new Error('Binding unavailable');
    this.events.push({ op: 'get', key });
    const stored = this.values.get(key);
    if (!stored) return null;
    return {
      key, etag: stored.etag, httpEtag: `"${stored.etag}"`,
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

test('successful collection writes an immutable snapshot before the final public pointer', async () => {
  const bucket = new FakeR2();
  let call;
  const result = await collect(envFor(bucket), { now: NOW, fetcher: async (...args) => { call = args; return response(); } });
  assert.equal(result.status, 'published', result.detail);
  assert.equal(call[0], cfg.feed_url);
  assert.match(call[1].headers.get('User-Agent'), /github.com\/dizzyvinci\/inflation-watch-astra/);
  assert.equal(call[1].redirect, 'error');
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
  assert.equal(bucket.read(LOCK).released, true);
  assert.ok(bucket.read(LOCK).expiresAt <= NOW);
});

test('304 sends validators, preserves source/build/fetch clocks and writes no new snapshot', async () => {
  const { bucket, env, pointer } = await initialize();
  const beforeSnapshots = [...bucket.values.keys()].filter(key => key.startsWith('data-'));
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
  assert.equal(merged.history.at(-1).cpi, seed.latest.cpi);
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
  assert.equal(report.latest.cpi, seed.latest.cpi);
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
    for (const path of ['/data-evil.json', '/data-../../_private/collector-state.json', '/data-%2f_private.json', '/_private/collector-state.json', '/collect', '/admin']) {
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

test('runtime/config contain no credentials or public collection endpoint', () => {
  const source = readFileSync(new URL('../ops/worker.mjs', import.meta.url), 'utf8');
  const wrangler = JSON.parse(readFileSync(new URL('../ops/wrangler.jsonc', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /(?:from\s+['"]node:|CLOUDFLARE_API_TOKEN|Authorization\s*:)/);
  assert.equal(wrangler.name, 'inflation-watch-astra');
  assert.equal(wrangler.r2_buckets[0].binding, 'SNAPSHOTS');
  assert.equal(wrangler.limits.cpu_ms, 1000);
  assert.deepEqual(wrangler.assets.run_worker_first, ['/version.json', '/data.json', '/data-*', '/health.json']);
  assert.deepEqual(wrangler.triggers.crons, ['3,13,23,33,43,53 * * * *']);
});
