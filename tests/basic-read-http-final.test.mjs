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

test('final enabled callback crossing budget rejects before HTTP authority',async t=>{const g=await genuine(t),value=await g.result(2040801);let time=0;const route=routeFor({setEnabled(){},read:async()=>value},{monotonic:()=>time,waitMs:10,isEnabled:()=>{if(new Error().stack.includes('at fence '))time=11;return true;}});assert.equal((await route(request())).status,503);await drain(route);});
test('final conditional header callback crossing budget cannot return304',async t=>{const g=await genuine(t),value=await g.result(2040801);let time=0;const route=routeFor({setEnabled(){},read:async()=>value},{monotonic:()=>time,waitMs:10});const first=await route(request());assert.equal(first.status,200);const req=request(2040801,{headers:{'If-None-Match':first.headers.get('ETag')}}),get=req.headers.get.bind(req.headers);req.headers.get=name=>{if(name==='If-None-Match')time=11;return get(name);};const response=await route(req);const e={monotonic:time,waitMs:10,status:response.status,bodyMode:response.headers.get('X-Astra-Basic-Mode'),actualOperations:0};const{writeFileSync}=await import('node:fs');writeFileSync(new URL('../INDEPENDENT_HTTP_FINAL_HEADER.json',import.meta.url),JSON.stringify(e,null,2)+'\n');assert.equal(response.status,503);});

test('final conditional header callback hotOff cannot return current304',async t=>{const g=await genuine(t),value=await g.result(2040801);let enabled=true;const route=routeFor({setEnabled(){},read:async()=>value},{isEnabled:()=>enabled});const first=await route(request());assert.equal(first.status,200);const req=request(2040801,{headers:{'If-None-Match':first.headers.get('ETag')}}),get=req.headers.get.bind(req.headers);req.headers.get=name=>{if(name==='If-None-Match')enabled=false;return get(name);};const response=await route(req);assert.equal(response.status,404);});
