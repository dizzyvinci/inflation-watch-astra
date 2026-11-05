import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,PUBLIC_FLAG,PUBLIC_POINTER} from './api-public-cash-fixture.mjs';
import {createPublicCashRoute} from '../ops/api-public-cash-routes.mjs';
import {hash,bytes,boundedText} from '../ops/api-public-cash-contract.mjs';
const request=(options={},path='/api-cash-items.json')=>new Request('https://inflation.gg'+path,options);

test('route defaultOff/invalid/privateOff fails closed before any cache/binding/key access',async()=>{
 for(const flag of [undefined,'{"enabled":false}','{"enabled":"true"}',JSON.stringify(PUBLIC_FLAG)]){
  const env={API_PUBLIC_CASH_JSON:flag,API_PRIVATE_CASH_JSON:'{"enabled":false}'};
  for(const key of ['SNAPSHOTS','MAPLESTORY_MARKET_APPROVED_API_KEY'])Object.defineProperty(env,key,{get(){throw new Error('Forbidden off access');}});
  const response=await createPublicCashRoute()(request(),env);assert.equal(response.status,404);
 }
});
test('only fixed29 DTO serves with source clocks/phase; concurrent readers singleflight for30s',async t=>{
 const f=await fixture(t);await f.complete();const route=createPublicCashRoute({now:()=>f.now[0]}),before=f.reads.length;
 Object.defineProperty(f.env,'MAPLESTORY_MARKET_APPROVED_API_KEY',{get(){throw new Error('No provider key in reader');}});
 const responses=await Promise.all(Array.from({length:40},()=>route(request(),f.env)));
 assert.ok(responses.every(r=>r.status===200));assert.equal(f.reads.length-before,2);
 const values=await Promise.all(responses.map(r=>r.text()));assert.ok(values.every(v=>v===values[0]));
 const dto=JSON.parse(values[0]);assert.equal(dto.records.length,29);assert.equal(dto.sourceObservedAt,null);
 for(const r of responses){assert.equal(r.headers.get('X-Astra-Cash-Phase'),'published_subset');assert.equal(r.headers.get('X-Astra-Cash-Captured-At'),dto.capturedAt);}
 for(const value of ['_private/','owner_name','player_id','rawBody','grantReference','published_attempt'])assert.ok(!values[0].includes(value));
 await route(request(),f.env);assert.equal(f.reads.length-before,2);assert.equal(f.calls.length,0);
});
test('GET/HEAD/304/405 and strict query handling preserve body/ETag without extra reads',async t=>{
 const f=await fixture(t);await f.complete();const route=createPublicCashRoute(),get=await route(request(),f.env),etag=get.headers.get('ETag'),n=f.reads.length;
 assert.equal((await route(request({method:'HEAD'}),f.env)).status,200);
 const notModified=await route(request({headers:{'If-None-Match':etag}}),f.env);assert.equal(notModified.status,304);assert.equal(await notModified.text(),'');
 const post=await route(request({method:'POST',body:'provider-key-DO-NOT-READ'}),f.env);assert.equal(post.status,405);assert.equal(post.headers.get('Allow'),'GET, HEAD');
 assert.equal((await route(request({},'/api-cash-items.json?item=2010001'),f.env)).status,400);assert.equal(f.reads.length,n);
 assert.equal(await route(request({},'/_private/provider-api/v1/public-cash-pointer.json'),f.env),null);
});
test('expired cache retains byte-identical lastgood on storage failure, never refreshing captured clock',async t=>{
 const f=await fixture(t);await f.complete();const route=createPublicCashRoute({now:()=>f.now[0]}),first=await route(request(),f.env),text=await first.text();
 f.now[0]+=30001;f.fail('get_public');const retained=await route(request(),f.env);
 assert.equal(retained.status,200);assert.equal(retained.headers.get('X-Astra-Cash-Mode'),'retained_last_good');
 assert.equal(await retained.text(),text);assert.equal(retained.headers.get('X-Astra-Cash-Captured-At'),first.headers.get('X-Astra-Cash-Captured-At'));
 const cold=await createPublicCashRoute()(request(),f.env);assert.equal(cold.status,503);assert.equal(f.calls.length,0);
});
test('malformed descriptor cannot request a private/raw object, and corrupt public body cannot leak fields',async t=>{
 const f=await fixture(t);await f.complete();const original=f.objects.get(PUBLIC_POINTER),p=JSON.parse(original.body);
 const corrupted={...p,dataKey:'_private/provider-api/v1/receipts/SECRET.json'};f.objects.set(PUBLIC_POINTER,{body:JSON.stringify(corrupted),etag:'bad'});
 const before=f.reads.length;assert.equal((await createPublicCashRoute()(request(),f.env)).status,503);
 assert.deepEqual(f.reads.slice(before),[PUBLIC_POINTER]);
 f.objects.set(PUBLIC_POINTER,original);const body=JSON.parse(f.objects.get(p.dataKey).body);body.owner_name='SYNTHETIC-PRIVATE-SENTINEL';const text=JSON.stringify(body);
 f.objects.set(p.dataKey,{body:text,etag:'poison'});f.objects.set(PUBLIC_POINTER,{body:JSON.stringify({...p,subsetBytes:bytes(text),subsetSha256:await hash(text)}),etag:'poisonptr'});
 const response=await createPublicCashRoute()(request(),f.env);assert.equal(response.status,503);assert.ok(!(await response.text()).includes('SYNTHETIC-PRIVATE-SENTINEL'));
});
test('route rejects rollback or changed same-attempt descriptors and retains newer verified data',async t=>{
 const f=await fixture(t);await f.complete(1,10);const old=f.objects.get(PUBLIC_POINTER);await f.complete(2,12);
 const route=createPublicCashRoute({now:()=>f.now[0]}),newest=await(await route(request(),f.env)).text();
 f.objects.set(PUBLIC_POINTER,old);f.now[0]+=30001;assert.equal(await(await route(request(),f.env)).text(),newest);
 const response=await route(request(),f.env);assert.equal(response.headers.get('X-Astra-Cash-Mode'),'retained_last_good');
});
test('publication disabled during a coalesced storage read never returns a cached public body',async t=>{
 const f=await fixture(t);await f.complete();const get=f.bucket.get.bind(f.bucket);let release,entered;
 const wait=new Promise(r=>release=r),inside=new Promise(r=>entered=r);
 f.bucket.get=async key=>{if(key===PUBLIC_POINTER){entered();await wait;}return get(key);};
 const pending=createPublicCashRoute()(request(),f.env);await inside;f.env.API_PUBLIC_CASH_JSON='{"enabled":false}';release();
 assert.equal((await pending).status,404);assert.equal(f.calls.length,0);
});
test('unknown/oversized cached bodies reject before text read; streams enforce actual byte and UTF8 bounds',async()=>{
 for(const size of [undefined,-1,100001])await assert.rejects(boundedText({size,text(){throw new Error('Must not read');}}));
 const object=(chunks,size)=>({size,body:new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(Uint8Array.from(chunk));controller.close();}})});
 await assert.rejects(boundedText(object([[1,2,3,4,5]],1),4));
 await assert.rejects(boundedText(object([[0xff]],1)));
 assert.equal(await boundedText(object([[123,125]],2)),'{}');
});
test('same-body cache reuse binds every source clock/lineage/coverage field and cannot manufacture freshness',async t=>{
 const f=await fixture(t);await f.complete();const original=f.objects.get(PUBLIC_POINTER),p=JSON.parse(original.body);
 const route=createPublicCashRoute({now:()=>f.now[0]}),first=await route(request(),f.env),text=await first.text();
 const changes=[v=>v.capturedAt=new Date(Date.parse(v.capturedAt)+1000).toISOString(),
  v=>v.requestStartedAt=new Date(Date.parse(v.requestStartedAt)-1000).toISOString(),
  v=>v.privateProjectionHash='0'.repeat(64),v=>v.subsetHash='0'.repeat(64),v=>v.availableItems=28,v=>v.subsetBytes++];
 for(const change of changes){const v={...p,sourceAttemptId:p.sourceAttemptId+1};change(v);
  f.objects.set(PUBLIC_POINTER,{body:JSON.stringify(v),etag:'bad-context'});f.now[0]+=30001;
  const response=await route(request(),f.env);assert.equal(response.status,200);assert.equal(await response.text(),text);
  assert.equal(response.headers.get('X-Astra-Cash-Mode'),'retained_last_good');
  assert.equal(response.headers.get('X-Astra-Cash-Captured-At'),p.capturedAt);
 }
 const before=f.reads.length;f.objects.set(PUBLIC_POINTER,{body:JSON.stringify({...p,sourceAttemptId:p.sourceAttemptId+1}),etag:'same-evidence-new-ordinal'});f.now[0]+=30001;
 const accepted=await route(request(),f.env);assert.equal(accepted.headers.get('X-Astra-Cash-Mode'),'accepted_cache');assert.equal(await accepted.text(),text);
 assert.equal(accepted.headers.get('X-Astra-Cash-Captured-At'),p.capturedAt);assert.deepEqual(f.reads.slice(before),[PUBLIC_POINTER]);
});
