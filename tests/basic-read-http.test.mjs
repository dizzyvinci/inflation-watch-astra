import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {produced} from './basic-read-selected-fixture.mjs';
import {verifyBasicSelectedSqlProof, projectBasicSelectedPublicItem} from '../ops/api-basic-current-selected-proof.mjs';
import {createBasicPublicItemHttpRoute} from '../ops/api-basic-item-http-route.mjs';
import {BASIC_ITEM_HTTP_PROTOCOL} from '../ops/api-basic-item-http-protocol.mjs';

const enc = new TextEncoder(), sha = bytes => createHash('sha256').update(bytes).digest('hex');
const tick = () => new Promise(resolve => setImmediate(resolve));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; return {promise: new Promise(r => { resolve = r; }), resolve}; };
const publicEpoch = 'root-synthetic-public-v1';
const scope = {grantReference: 'synthetic-grant', roundReference: 'synthetic-r1', epoch: 'synthetic-basic-v1'};
function request(id = 2040801, {method = 'GET', query = '', headers = {}, signal} = {}) {
  return new Request('https://own.invalid/api-basic-item-prices/' + id + '.json' + query, {
    method, headers: {'X-Astra-Request-Basic-Protocol': BASIC_ITEM_HTTP_PROTOCOL, ...headers}, signal,
  });
}
async function genuine(t) {
  const g = await produced(t, {extraItems: 0});
  const manifest = JSON.parse(new TextDecoder().decode(g.inputs.manifestRaw));
  let calls = 0;
  async function result(id) {
    calls++;
    const index = manifest.pages.findIndex(page => id >= page.firstId && id <= page.lastId);
    const proof = await verifyBasicSelectedSqlProof({
      expectedRaw: g.inputs.expectedRaw, expectedOriginalSha256: g.inputs.expectedOriginalSha256,
      itemId: id, pointerRaw: g.inputs.pointerRaw, manifestRaw: g.inputs.manifestRaw,
      pageRaw: index === -1 ? null : g.inputs.pagesRaw[index],
    });
    const projected = projectBasicSelectedPublicItem(proof);
    return {status: projected.value.state === 'present_in_generation' ? 'validated' : 'absent',
      reference: projected.value, raw: projected.raw, payloadSha256: sha(projected.raw),
      verificationScope: proof.verificationScope, bodyHashVerification: proof.bodyHashVerification,
      currentAgainstProvidedPins: true, upstreamLatestInspected: false};
  }
  const reader = {read: result, setEnabled() {}};
  return {...g, result, reader, calls: () => calls};
}
function routeFor(reader, options = {}) {
  return createBasicPublicItemHttpRoute({enabled: true, identity: {}, reader, scope, publicEpoch, ...options});
}
async function drain(route) {
  for (let i = 0; i < 100 && route.state().physicalResponsesPending; i++) await tick();
  assert.equal(route.state().physicalResponsesPending, 0);
}

test('Off never inspects other options; separate path and malformed protocols make zero reader calls', async () => {
  const off = createBasicPublicItemHttpRoute({enabled: false, get reader() { throw Error('off'); }, get identity() { throw Error('off'); }});
  assert.equal((await off(request())).status, 404);
  assert.equal(await off(new Request('https://own.invalid/api-item-prices/2040801.json')), null);
  let calls = 0;
  const route = routeFor({read() { calls++; throw Error('no'); }, setEnabled() {}});
  for (const [req, status] of [
    [request('01'), 404], [request(2040801, {method: 'POST'}), 405],
    [request(2040801, {headers: {'X-Astra-Request-Basic-Protocol': 'fast-current-v1'}}), 400],
    [request(2040801, {query: '?actor=private'}), 400],
    [request(2040801, {query: '?generation=' + 'a'.repeat(64) + '&generation=' + 'a'.repeat(64)}), 400],
  ]) assert.equal((await route(req)).status, status);
  assert.equal(calls, 0);
});

test('genuine producer SQL pins and selected proof serve typed exact decimals, original clocks, GET HEAD 304', async t => {
  const g = await genuine(t), before = g.f.row('SELECT COUNT(*)n FROM api_attempts').n;
  const route = routeFor(g.reader), response = await route(request()), bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(response.status, 200);
  const value = JSON.parse(new TextDecoder().decode(bytes));
  assert.equal(value.sold.medianUnitPrice, '34567.89');
  assert.equal(value.asking.medianUnitPrice, '25000.04999999999999999');
  assert.equal(value.capturedAt, g.e.source.capturedAt);
  assert.equal(value.sourceObservedAt, null);
  assert.equal(response.headers.get('X-Astra-Basic-Body-SHA256'), sha(bytes));
  assert.equal(response.headers.get('X-Astra-Basic-Captured-At'), g.e.source.capturedAt);
  assert.equal(response.headers.get('X-Astra-Basic-Mode'), 'current');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store, no-transform');
  assert.equal(response.headers.get('X-Astra-Basic-Body-Verification'), 'producer-sql-attested-not-recomputed');
  assert(!new TextDecoder().decode(bytes).includes('receiptKey'));
  const head = await route(request(2040801, {method: 'HEAD'}));
  assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(head.headers.get('Content-Length'), String(bytes.length));
  assert.equal(head.headers.get('ETag'), response.headers.get('ETag'));
  const conditional = await route(request(2040801, {headers: {'If-None-Match': response.headers.get('ETag')}}));
  assert.equal(conditional.status, 304); assert.equal((await conditional.arrayBuffer()).byteLength, 0);
  assert.equal(conditional.headers.get('Content-Length'), null);
  assert.equal(g.f.row('SELECT COUNT(*)n FROM api_attempts').n, before);
  assert.equal(g.owner.control().action_token, null); assert.equal(g.f.provider.length, 0);
});

test('generation mismatch is explicit409 only for accepted pins; absence is dated404 not zero/stock', async t => {
  const g = await genuine(t), route = routeFor(g.reader);
  const conflict = await route(request(2040801, {query: '?generation=' + 'f'.repeat(64)}));
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).error, 'generation_changed');
  const absent = await route(request(999999999));
  assert.equal(absent.status, 404); assert.equal(absent.headers.get('X-Astra-Basic-Mode'), 'absent');
  const value = await absent.json();
  assert.equal(value.state, 'absent_in_generation'); assert.equal(value.sold, null); assert.equal(value.asking, null);
  assert.equal(value.availabilityKnown, false); assert.equal(value.capturedAt, g.e.source.capturedAt);
});

test('retained positive/negative evidence preserves original clocks and never receives a fresh304', async t => {
  const g = await genuine(t);
  const reader = {setEnabled() {}, async read(id) {
    const value = await g.result(id);
    return {...value, status: value.status === 'absent' ? 'retained_absent' : 'retained', currentAgainstProvidedPins: false};
  }};
  const route = routeFor(reader), first = await route(request());
  assert.equal(first.status, 200); assert.equal(first.headers.get('X-Astra-Basic-Mode'), 'retained');
  const same = await route(request(2040801, {headers: {'If-None-Match': first.headers.get('ETag')}}));
  assert.equal(same.status, 200); assert.equal(same.headers.get('X-Astra-Basic-Captured-At'), g.e.source.capturedAt);
  assert.equal((await route(request(999999999))).headers.get('X-Astra-Basic-Mode'), 'retained_absent');
  assert.equal((await route(request(2040801, {query: '?generation=' + 'f'.repeat(64)}))).status, 503);
});

test('thin protocol refuses full quality/raw actor fields, hash drift, impossible mode, unknown source and future clock', async t => {
  const g = await genuine(t), valid = await g.result(2040801);
  const changed = value => {
    const raw = enc.encode(JSON.stringify(value));
    return {...valid, raw, payloadSha256: sha(raw), reference: value};
  };
  const cases = [
    changed({...valid.reference, actor: 'private-person'}),
    changed({...valid.reference, sourceObservedAt: valid.reference.capturedAt}),
    changed({...valid.reference, fullVariantFreshness: true}),
    {...valid, payloadSha256: '0'.repeat(64)},
    {...valid, status: 'retained', currentAgainstProvidedPins: true},
    {...valid, bodyHashVerification: 'full-body-recomputed'},
    {...valid, upstreamLatestInspected: true},
  ];
  for (const value of cases) {
    const route = routeFor({read: async () => value, setEnabled() {}}), response = await route(request());
    assert.equal(response.status, 503); assert(!(await response.text()).includes('private-person'));
  }
  assert.equal((await routeFor(g.reader, {now: () => 0})(request())).status, 503);
});

test('timeout and new factories/Off/scope cannot release a held dependency response reservation', async () => {
  const hold = deferred(), identity = {}, reader = {read: () => hold.promise, setEnabled() {}};
  const first = routeFor(reader, {identity, waitMs: 25, maxRequests: 1});
  assert.equal((await first(request())).status, 503); assert.equal(first.state().physicalResponsesPending, 1);
  const second = routeFor(reader, {identity, waitMs: 25, maxRequests: 1});
  assert.equal((await second(request())).status, 503);
  first.setEnabled(false);
  const third = routeFor(reader, {identity, waitMs: 25, maxRequests: 1, publicEpoch: 'another-public-v2'});
  assert.equal((await third(request())).status, 503); assert.equal(third.state().physicalResponsesPending, 1);
  hold.resolve({status: 'unavailable'}); await drain(third);
});

test('caller abort returns promptly while its actual dependency stays reserved; late positive cannot escape', async t => {
  const g = await genuine(t), value = await g.result(2040801), held = deferred(), controller = new AbortController();
  const route = routeFor({read: () => held.promise, setEnabled() {}}, {maxRequests: 1});
  const promise = route(request(2040801, {signal: controller.signal}));
  controller.abort(); assert.equal((await promise).status, 503); assert.equal(route.state().physicalResponsesPending, 1);
  held.resolve(value); await drain(route);
  assert.equal(route.state().physicalResponsesPending, 0);
});

test('short HTTP caller cannot inherit a longer reader budget; event-loop-delayed positive is rejected', async t => {
  const g = await genuine(t), value = await g.result(2040801), held = deferred();
  const route = routeFor({read: () => held.promise, setEnabled() {}}, {waitMs: 20});
  const task = route(request()); await sleep(60);
  assert.equal((await task).status, 503); assert.equal(route.state().physicalResponsesPending, 1);
  held.resolve(value); await drain(route);
  let clock = 0;
  const delayed = routeFor({read: async () => { clock = 100; return value; }, setEnabled() {}}, {waitMs: 20, monotonic: () => clock});
  assert.equal((await delayed(request())).status, 503);
});

test('hotOff and replacement public epoch revoke old serialization without cancelling a new scope', async t => {
  const g = await genuine(t), value = await g.result(2040801), held = deferred(), identity = {};
  const old = routeFor({read: () => held.promise, setEnabled() {}}, {identity});
  const task = old(request()); old.setEnabled(false);
  const next = routeFor(g.reader, {identity, publicEpoch: 'new-public-epoch-v2'});
  old.setEnabled(false); held.resolve(value);
  assert.equal((await task).status, 404);
  const response = await next(request()); assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Astra-Basic-Epoch'), 'new-public-epoch-v2');
});

test('operator clock changes do not freshen body/etag and public epoch changes invalidate conditional cache', async t => {
  const g = await genuine(t);
  let wall = Date.parse('2026-11-08T00:00:00.000Z');
  const identity = {}, first = routeFor(g.reader, {identity, now: () => wall});
  const a = await first(request()), etag = a.headers.get('ETag');
  wall += 3600000;
  const b = await first(request());
  assert.equal(b.headers.get('ETag'), etag);
  assert.equal(b.headers.get('X-Astra-Basic-Captured-At'), g.e.source.capturedAt);
  const second = routeFor(g.reader, {identity, now: () => wall, publicEpoch: 'new-root-epoch-v2'});
  const c = await second(request(2040801, {headers: {'If-None-Match': etag}}));
  assert.equal(c.status, 200); assert.notEqual(c.headers.get('ETag'), etag);
  assert.equal((await first(request())).status, 404);
});

test('late equal-clock older generation cannot overwrite newer admitted response ordering', async t => {
  const g = await genuine(t), value = await g.result(2040801), hold = deferred();
  const alter = generation => {
    const reference = {...value.reference, generation}, raw = enc.encode(JSON.stringify(reference));
    return {...value, reference, raw, payloadSha256: sha(raw)};
  };
  const old = alter('a'.repeat(64)), newer = alter('b'.repeat(64));
  let calls = 0;
  const route = routeFor({read: () => ++calls === 1 ? hold.promise : Promise.resolve(newer), setEnabled() {}});
  const first = route(request());
  assert.equal((await route(request())).status, 200);
  hold.resolve(old);
  assert.equal((await first).status, 503);
});

test('external hotOff cannot serve held evidence and a broken monotonic callback does not allocate a response slot', async t => {
  const g = await genuine(t), value = await g.result(2040801), hold = deferred();
  let enabled = true;
  const route = routeFor({read: () => hold.promise, setEnabled() {}}, {isEnabled: () => enabled});
  const task = route(request()); enabled = false; hold.resolve(value);
  assert.equal((await task).status, 404); await drain(route);
  const broken = routeFor(g.reader, {monotonic() { throw Error('private-clock-detail'); }});
  const response = await broken(request());
  assert.equal(response.status, 503); assert(!(await response.text()).includes('private-clock-detail'));
  assert.equal(broken.state().physicalResponsesPending, 0);
});
