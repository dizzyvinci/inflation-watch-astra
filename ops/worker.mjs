import seed from '../dist/data.json' with { type: 'json' };
import seedVersion from '../dist/version.json' with { type: 'json' };
import config from '../config.json' with { type: 'json' };
import { computeReport } from './worker-core.mjs';

const POINTER = 'version.json';
const STATE = '_private/collector-state.json';
const LOCK = '_private/collector-lock.json';
const MAX_BYTES = 5_000_000;
const LEASE_MS = 120_000;
const SNAPSHOT = /^data-[a-f0-9]{16}\.json$/;
const USER_AGENT = 'inflation.watch/1.0 (+https://github.com/dizzyvinci/inflation-watch-astra; scheduled public daily-feed collector)';
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
const clone = value => structuredClone(value);
const iso = time => new Date(time).toISOString();
const stamp = value => typeof value === 'string' ? Date.parse(value) : Number.NaN;
const metadata = { httpMetadata: { contentType: 'application/json; charset=utf-8' } };

class LeaseLost extends Error {}

function clock(options) {
  const now = options.now ?? Date.now;
  return () => {
    const value = typeof now === 'function' ? now() : now;
    const time = typeof value === 'string' ? stamp(value) : value instanceof Date ? value.getTime() : value;
    if (!Number.isFinite(time)) throw new TypeError('Invalid collector clock');
    return time;
  };
}

async function digest(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function getJson(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return { value: null, etag: null };
  return { value: await object.json(), etag: object.etag };
}

function validPointer(value) {
  return value && /^[a-f0-9]{16}$/.test(value.version) && value.data === `data-${value.version}.json`
    && value.basketVersion === seed.basketVersion && Number.isFinite(stamp(value.sourceUpdatedAt))
    && Number.isFinite(stamp(value.builtAt)) && value.sourceStatus && typeof value.sourceStatus.status === 'string';
}

function fallbackPointer(reason = 'awaiting_collector') {
  return {
    ...clone(seedVersion), basketVersion: seed.basketVersion, mode: 'seed_fallback',
    sourceStatus: {
      status: reason === 'awaiting_collector' ? reason : 'degraded',
      checkedAt: seed.sourceStatus?.checkedAt ?? null, lastSuccessfulFetchAt: null,
      detail: reason === 'awaiting_collector'
        ? 'Collector has not published yet; showing the compiled dated seed snapshot.'
        : 'Snapshot storage is unavailable; showing the compiled dated seed snapshot.',
    },
    lastSuccessfulFetchAt: null, nextAllowedAt: null,
  };
}

async function readPointer(env) {
  if (!env.SNAPSHOTS) return fallbackPointer('storage_unavailable');
  try {
    const { value } = await getJson(env.SNAPSHOTS, POINTER);
    if (!validPointer(value)) return fallbackPointer(value ? 'invalid_pointer' : 'awaiting_collector');
    if (value.mode === 'seed_fallback' && value.version !== seedVersion.version) {
      // A prior deployment may have stored only its fallback pointer, with no
      // R2 report object. Its compiled asset disappears on upgrade. Serve this
      // deployment's seed while retaining the actual prior collection result.
      return {
        ...fallbackPointer(),
        sourceStatus: { ...value.sourceStatus, fallback: 'current_compiled_seed' },
        lastSuccessfulFetchAt: value.lastSuccessfulFetchAt ?? null,
        nextAllowedAt: value.nextAllowedAt ?? null,
        fallbackDetail: 'Serving the current compiled dated seed after a code update; prior collector status is retained, with no new source fetch implied.',
      };
    }
    return value;
  } catch {
    return fallbackPointer('storage_unavailable');
  }
}

async function acquire(bucket, now, owner) {
  const current = await getJson(bucket, LOCK);
  if (current.value && Number.isFinite(current.value.expiresAt) && current.value.expiresAt > now) return null;
  const value = { owner, acquiredAt: now, expiresAt: now + LEASE_MS };
  const object = await bucket.put(LOCK, JSON.stringify(value), {
    ...metadata,
    onlyIf: current.etag ? { etagMatches: current.etag } : new Headers({ 'If-None-Match': '*' }),
  });
  return object ? { ...value, etag: object.etag } : null;
}

async function checkLease(bucket, lease, now) {
  if (now >= lease.expiresAt) throw new LeaseLost('Collector lease expired');
  const current = await getJson(bucket, LOCK);
  if (!current.value || current.etag !== lease.etag || current.value.owner !== lease.owner) {
    throw new LeaseLost('Collector lease changed');
  }
}

async function release(bucket, lease, now) {
  // R2 DELETE has no conditional variant. CAS an expired tombstone instead of
  // deleting a newer collector's lease during a read/delete race.
  await bucket.put(LOCK, JSON.stringify({ owner: lease.owner, acquiredAt: lease.acquiredAt, expiresAt: Math.min(now, lease.expiresAt), released: true }), {
    ...metadata, onlyIf: { etagMatches: lease.etag },
  });
}

async function casJson(bucket, key, value, etag) {
  const result = await bucket.put(key, JSON.stringify(value), {
    ...metadata, onlyIf: etag ? { etagMatches: etag } : new Headers({ 'If-None-Match': '*' }),
  });
  if (!result) throw new LeaseLost(`Conditional write lost for ${key}`);
  return result;
}

async function boundedBody(response) {
  const length = response.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) throw new Error('Oversized or invalid feed length');
  if (!response.body) throw new Error('Empty source response');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error('Oversized source feed');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function retryTime(value, now) {
  if (value && /^\d+$/.test(value.trim())) {
    const seconds = Number(value.trim());
    if (Number.isSafeInteger(seconds) && Number.isSafeInteger(now + seconds * 1000)) return now + seconds * 1000;
  }
  const parsed = stamp(value);
  return Number.isFinite(parsed) && parsed > now ? parsed : now + 600_000;
}

function sameMethod(previous, next) {
  return previous?.basketVersion === next.basketVersion
    && (!next.basketHash || previous.basketHash === next.basketHash);
}

function boundedComputeFeed(feed) {
  if (!feed || !Array.isArray(feed.items) || typeof feed.updatedAt !== 'string') return feed;
  const sourceDay = feed.updatedAt.slice(0, 10);
  const cutoff = stamp(`${sourceDay}T00:00:00Z`) - 364 * 86_400_000;
  if (!Number.isFinite(cutoff)) return feed; // The core supplies the timestamp error.
  const items = feed.items.map(item => {
    if (!Array.isArray(item?.h)) throw new Error('Malformed historical observation');
    let previous = '';
    const h = [];
    for (const point of item.h) {
      const [day, price, quantity] = Array.isArray(point) ? point : [];
      const time = stamp(`${day}T00:00:00Z`);
      if (!Array.isArray(point) || point.length !== 3 || typeof day !== 'string'
          || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(time)
          || iso(time).slice(0, 10) !== day || day <= previous || day > sourceDay
          || typeof price !== 'number' || !Number.isFinite(price) || price <= 0
          || !Number.isSafeInteger(quantity) || quantity < 0 || !Number.isFinite(price * quantity)) {
        throw new Error('Invalid historical observation');
      }
      previous = day;
      if (time >= cutoff) h.push(point);
    }
    return { ...item, h: h.slice(-365) };
  });
  return { ...feed, items };
}

function mergeDays(previous, current, limit) {
  const values = new Map();
  for (const row of [...(Array.isArray(previous) ? previous : []), ...current]) {
    if (row && typeof row.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.day)) values.set(row.day, row);
  }
  return [...values.keys()].sort().slice(-limit).map(day => values.get(day));
}

function recordTime(row) { return stamp(row?.observedAt ?? row?.at ?? row?.capturedAt); }

function retainHistories(report, previous) {
  if (sameMethod(previous, report)) {
    report.history = mergeDays(previous.history, report.history, 7300);
    report.volumeHistory = mergeDays(previous.volumeHistory, report.volumeHistory, 7300);
    for (const key of ['intraday', 'comparisons', 'smega', 'rollingReferenceHistory']) {
      const entries = new Map();
      for (const row of [...(previous[key] ?? []), ...(report[key] ?? [])]) {
        if (!row || !Number.isFinite(recordTime(row))) continue;
        const id = [row.sourceUrl ?? '', row.observedAt ?? row.at ?? row.capturedAt, row.kind ?? '', row.side ?? ''].join('|');
        entries.set(id, row);
      }
      report[key] = [...entries.values()].sort((a, b) => recordTime(a) - recordTime(b)).slice(-10_000);
    }
    for (const key of ['rollingReference', 'smegaSource']) {
      if (Number.isFinite(recordTime(previous[key])) && recordTime(previous[key]) > (recordTime(report[key]) || 0)) {
        report[key] = clone(previous[key]);
      }
    }
    report.contextItems = (report.contextItems ?? []).map(context => {
      const old = previous.contextItems?.find(row => row.slug === context.slug);
      if (context.retained && old && stamp(old.sourceUpdatedAt) > stamp(context.sourceUpdatedAt)) {
        return { ...clone(old), retained: true, retainedReason: context.retainedReason };
      }
      return context;
    });
  }
  report.history = report.history.slice(-7300);
  report.volumeHistory = report.volumeHistory.slice(-7300);
  const cutoff = stamp(`${report.sourceUpdatedAt.slice(0, 10)}T00:00:00Z`) - 364 * 86_400_000;
  for (const row of [...report.rows, ...report.cash, ...(report.contextItems ?? [])]) {
    // A retained context history keeps its original date/window. Cap length
    // rather than moving its old observations into the current source window.
    row.history = row.retained ? row.history.slice(-365)
      : row.history.filter(([day]) => stamp(`${day}T00:00:00Z`) >= cutoff).slice(-365);
  }
  return report;
}

async function previousReport(bucket, pointer) {
  if (!pointer || !SNAPSHOT.test(pointer.data)) return null;
  try {
    const { value } = await getJson(bucket, pointer.data);
    return value ?? (pointer.data === seedVersion.data ? clone(seed) : null);
  } catch { return null; }
}

/** Scheduled-only collector. Tests may inject fetcher and now; visitors cannot. */
export async function collect(env, options = {}) {
  const now = clock(options);
  const checkedAt = iso(now());
  const bucket = env.SNAPSHOTS;
  if (!bucket) return { status: 'storage_unavailable', checkedAt };
  let lease;
  let pointerRecord;
  let stateRecord;
  let pointer;
  let state;
  try {
    lease = await acquire(bucket, now(), options.owner ?? crypto.randomUUID());
    if (!lease) return { status: 'locked', checkedAt };
    pointerRecord = await getJson(bucket, POINTER);
    pointer = validPointer(pointerRecord.value) ? pointerRecord.value : null;
    stateRecord = await getJson(bucket, STATE);
    state = stateRecord.value ?? {};
    if (Number.isFinite(state.nextAllowedAt) && state.nextAllowedAt > now()) {
      return { status: 'cooldown', checkedAt: state.checkedAt ?? null, nextAllowedAt: iso(state.nextAllowedAt) };
    }
    const headers = new Headers({ Accept: 'application/json', 'User-Agent': USER_AGENT });
    if (state.etag) headers.set('If-None-Match', state.etag);
    if (state.lastModified) headers.set('If-Modified-Since', state.lastModified);
    const response = await (options.fetcher ?? fetch)(config.feed_url, {
      // workerd supports follow/manual, not the browser/Node 'error' mode.
      // Handle redirects ourselves so collection never follows an unknown host.
      headers, signal: AbortSignal.timeout(20_000), redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400 && response.status !== 304) {
      throw new Error(`Source redirect rejected (HTTP ${response.status}); configured source URL remains fixed`);
    }
    if (response.status === 429) {
      const nextAllowedAt = retryTime(response.headers.get('Retry-After'), now());
      const error = new Error('Source HTTP 429; retry cooldown honored');
      error.nextAllowedAt = nextAllowedAt;
      throw error;
    }
    if (response.status !== 304 && !response.ok) throw new Error(`Source HTTP ${response.status}`);
    let feed;
    let feedHash;
    let etag = state.etag ?? null;
    let lastModified = state.lastModified ?? null;
    let lastSuccessfulFetchAt = state.lastSuccessfulFetchAt ?? pointer?.lastSuccessfulFetchAt ?? null;
    if (response.status === 304) {
      if (!state.feed) throw new Error('Source returned 304 without a validated private feed cache');
      feed = state.feed;
      feedHash = await digest(JSON.stringify(feed));
    } else {
      feed = JSON.parse(await boundedBody(response));
      feedHash = await digest(JSON.stringify(feed));
      etag = response.headers.get('ETag');
      lastModified = response.headers.get('Last-Modified');
      lastSuccessfulFetchAt = iso(now());
    }
    if (pointer && stamp(feed.updatedAt) < stamp(pointer.sourceUpdatedAt)) throw new Error('Source timestamp moved backwards');
    const status = {
      status: response.status === 304 ? 'unchanged' : 'ok', checkedAt,
      lastSuccessfulFetchAt, detail: 'Public daily source checked by the scheduled collector; source observation time remains separately dated.',
    };
    const unchanged = pointer && state.publishedVersion === pointer.version
      && feedHash === state.feedHash && pointer.sourceUpdatedAt === feed.updatedAt;
    const computeFeed = boundedComputeFeed(feed);
    let nextPointer;
    if (unchanged) {
      // Validate again without creating a new snapshot or new market clock.
      computeReport(computeFeed, seed, { checkedAt, builtAt: pointer.builtAt, sourceStatus: status, config });
      status.status = 'unchanged';
      nextPointer = { ...pointer, mode: 'collector', sourceStatus: status, lastSuccessfulFetchAt, nextAllowedAt: null };
    } else {
      const computed = computeReport(computeFeed, seed, { checkedAt, builtAt: iso(now()), sourceStatus: status, config });
      const previous = await previousReport(bucket, pointer);
      const report = retainHistories(computed, previous);
      const text = JSON.stringify(report);
      const version = (await digest(text)).slice(0, 16);
      const data = `data-${version}.json`;
      await checkLease(bucket, lease, now());
      const written = await bucket.put(data, text, {
        httpMetadata: { ...metadata.httpMetadata, cacheControl: 'public, max-age=31536000, immutable' },
        onlyIf: new Headers({ 'If-None-Match': '*' }),
      });
      if (!written) {
        const existing = await bucket.get(data);
        if (!existing || await existing.text() !== text) throw new Error('Snapshot content-address conflict; refusing overwrite');
      }
      nextPointer = {
        version, data, basketVersion: report.basketVersion, builtAt: report.builtAt,
        sourceUpdatedAt: report.sourceUpdatedAt, sourceStatus: status, mode: 'collector',
        lastSuccessfulFetchAt, nextAllowedAt: null,
      };
    }
    const nextState = {
      feed, feedHash, etag, lastModified, checkedAt, lastSuccessfulFetchAt,
      nextAllowedAt: null, publishedVersion: nextPointer.version,
    };
    await checkLease(bucket, lease, now());
    await casJson(bucket, STATE, nextState, stateRecord.etag);
    await checkLease(bucket, lease, now());
    // The public pointer is the final publication write; immutable payload exists.
    await casJson(bucket, POINTER, nextPointer, pointerRecord.etag);
    return { status: unchanged ? 'unchanged' : 'published', version: nextPointer.version, checkedAt };
  } catch (error) {
    if (error instanceof LeaseLost) return { status: 'lease_lost', checkedAt };
    if (lease && pointerRecord && stateRecord) {
      try {
        await checkLease(bucket, lease, now());
        const retained = pointer ?? fallbackPointer();
        const nextAllowedAt = error.nextAllowedAt ?? null;
        const detail = `${String(error.message ?? 'Source collection failed').slice(0, 160)}. Retaining the last valid dated snapshot.`;
        const status = { status: 'degraded', checkedAt, lastSuccessfulFetchAt: state.lastSuccessfulFetchAt ?? retained.lastSuccessfulFetchAt ?? null, detail };
        const nextState = { ...state, checkedAt, nextAllowedAt, lastError: detail };
        const nextPointer = {
          ...retained, sourceStatus: status, lastSuccessfulFetchAt: status.lastSuccessfulFetchAt,
          nextAllowedAt: nextAllowedAt === null ? null : iso(nextAllowedAt),
        };
        await casJson(bucket, STATE, nextState, stateRecord.etag);
        await checkLease(bucket, lease, now());
        await casJson(bucket, POINTER, nextPointer, pointerRecord.etag);
        return { status: 'degraded', checkedAt, detail, nextAllowedAt: nextPointer.nextAllowedAt };
      } catch { /* R2/CAS failure: existing public pointer is left untouched. */ }
    }
    return { status: 'storage_unavailable', checkedAt, detail: 'Collector could not safely update storage; existing snapshots remain available.' };
  } finally {
    if (lease) {
      try { await release(bucket, lease, now()); } catch { /* Lease expires within 120 seconds. */ }
    }
  }
}

function jsonResponse(value, cacheControl, headers = {}) {
  return new Response(JSON.stringify(value), { headers: { ...JSON_HEADERS, 'Cache-Control': cacheControl, ...headers } });
}

function etagResponse(request, response) {
  const tag = response.headers.get('ETag');
  if (tag && request.headers.get('If-None-Match')?.split(',').map(value => value.trim()).includes(tag)) {
    return new Response(null, { status: 304, headers: response.headers });
  }
  return request.method === 'HEAD' ? new Response(null, response) : response;
}

async function serveSnapshot(request, env, data) {
  if (!SNAPSHOT.test(data)) return new Response('Not found', { status: 404 });
  try {
    const object = await env.SNAPSHOTS?.get(data);
    if (object?.body) return new Response(object.body, {
      headers: { ...JSON_HEADERS, 'Cache-Control': 'public, max-age=31536000, immutable', ETag: `"${data.slice(5, 21)}"` },
    });
  } catch { /* A compiled seed remains available independently of R2. */ }
  if (data === seedVersion.data) {
    return jsonResponse(seed, 'public, max-age=31536000, immutable', { ETag: `"${seedVersion.version}"`, 'X-Inflation-Mode': 'seed_fallback' });
  }
  return new Response('Snapshot not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

async function handleFetch(request, env, ctx) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const url = new URL(request.url);
  const path = url.pathname;
  const dynamic = ['/version.json', '/data.json', '/health.json'].includes(path);
  const namedSnapshot = /^\/data-[a-f0-9]{16}\.json$/.test(path);
  if (!dynamic && !namedSnapshot) {
    if (path.startsWith('/data-') || path.startsWith('/_private/') || path === '/collect' || path === '/admin') {
      return new Response('Not found', { status: 404 });
    }
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Static assets unavailable', { status: 503 });
  }
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(`${url.origin}${path}`, { method: 'GET' });
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return etagResponse(request, cached);
    } catch { /* Edge cache failure must not blank the dashboard. */ }
  }
  let response;
  if (namedSnapshot) response = await serveSnapshot(request, env, path.slice(1));
  else {
    const pointer = await readPointer(env);
    const modeHeaders = { 'X-Inflation-Mode': pointer.mode ?? 'collector' };
    const cacheControl = 'public, max-age=0, s-maxage=30, stale-if-error=600';
    if (path === '/version.json') {
      response = jsonResponse(pointer, cacheControl, modeHeaders);
    } else if (path === '/health.json') {
      response = jsonResponse({
        status: pointer.sourceStatus.status, mode: pointer.mode, version: pointer.version,
        basketVersion: pointer.basketVersion, sourceUpdatedAt: pointer.sourceUpdatedAt,
        checkedAt: pointer.sourceStatus.checkedAt ?? null,
        lastSuccessfulFetchAt: pointer.lastSuccessfulFetchAt ?? null, nextAllowedAt: pointer.nextAllowedAt ?? null,
        detail: pointer.sourceStatus.detail, schedule: 'Every ten minutes; collection is independent of visitors.',
      }, cacheControl, modeHeaders);
    } else {
      response = await serveSnapshot(request, env, pointer.data);
      if (response.status === 404) {
        response = jsonResponse({ ...clone(seed), sourceStatus: fallbackPointer('missing_snapshot').sourceStatus }, cacheControl, { 'X-Inflation-Mode': 'seed_fallback' });
      } else {
        response = new Response(response.body, response);
        response.headers.set('Cache-Control', cacheControl);
        response.headers.set('X-Inflation-Mode', pointer.mode ?? 'collector');
      }
    }
  }
  if (cache && response.status === 200) {
    const task = cache.put(cacheKey, response.clone()).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  return etagResponse(request, response);
}

export default {
  fetch: handleFetch,
  async scheduled(_controller, env, ctx) {
    const task = collect(env).then(result => { console.log(JSON.stringify({ collector: result.status, checkedAt: result.checkedAt })); });
    if (ctx?.waitUntil) ctx.waitUntil(task);
    else await task;
  },
};
