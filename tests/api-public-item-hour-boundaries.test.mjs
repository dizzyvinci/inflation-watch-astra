import test from 'node:test';import assert from 'node:assert/strict';
import {setImmediate as turn} from 'node:timers/promises';
import {createPublicItemHourRoute} from '../ops/api-public-item-hour-routes.mjs';
import {bytes,hash,pointerKey} from '../ops/item-hour-public-contract.mjs';
import {fixture,request,PATH,ID,flag,pause,curateItemHours,hour,record,HOUR} from './api-public-item-hour-fixture.mjs';

// Freeze ONLY deadline timers. Crypto/streams may take arbitrary wall time under
// parallel CI; advance the production-default2.5s deadline only after SDK barriers.
for(const channel of['get','body'])test('permanently pending '+channel+' retains ONE physical SDK flight across timeout/OffOn/retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let now=0;const f=await fixture(),route=createPublicItemHourRoute({now:()=>now,ttlMs:1000}),held=pause(),get=f.bucket.get;
 f.bucket.get=async key=>{const o=await get(key);if(key===pointerKey(ID)){held.enter();if(channel==='get')await held.held;else return{size:o.size,body:new ReadableStream({async start(c){await held.held;c.enqueue(new Uint8Array(await o.arrayBuffer()));c.close();}})};}return o;};
 const first=route(request(),f.env);let settled=false;void first.then(()=>settled=true);await held.entered;
 t.mock.timers.tick(2499);await turn();assert.equal(settled,false,'held SDK read must remain pending before the production deadline');
 t.mock.timers.tick(1);assert.equal((await first).status,503);await turn();assert.equal(f.calls.length,1);assert.equal(route.stats().sdkFlights,1);
 for(let i=0;i<6;i++){now+=310000;assert.equal((await route(request(),f.env)).status,503);}assert.equal(f.calls.length,1);
 f.env.API_PUBLIC_ITEM_HOUR_HISTORY_JSON='{"enabled":false}';assert.equal((await route(request(),f.env)).status,404);f.env.API_PUBLIC_ITEM_HOUR_HISTORY_JSON=flag(f.tree.manifest.generation);assert.equal((await route(request(),f.env)).status,503);assert.equal(f.calls.length,1);
 held.release();await turn();assert.equal(route.stats().sdkFlights,0);now+=310000;assert.equal((await route(request(),f.env)).status,200);assert.equal(f.calls.length,3);
});

test('four stuck cold page SDK reads cannot block warm manifest/page admission or duplicate reads',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let now=0,started=0;const f=await fixture({pages:6}),route=createPublicItemHourRoute({now:()=>now,maxRequests:4}),get=f.bucket.get,held=pause(),allStarted=pause(),blocked=new Set(f.tree.objects.slice(0,4).map(x=>x.key));
 assert.equal((await route(request(),f.env)).status,200);assert.equal((await route(request(f.page(5)),f.env)).status,200);
 f.bucket.get=async key=>{const o=await get(key);if(blocked.has(key)){if(++started===4)allStarted.enter();await held.held;}return o;};
 const jobs=[0,1,2,3].map(i=>route(request(f.page(i)),f.env));let settled=0;for(const job of jobs)void job.then(()=>settled++);await allStarted.entered;assert.equal(route.stats().sdkFlights,4);
 const warm=await Promise.all([route(request(),f.env),route(request(f.page(5)),f.env)]);assert.deepEqual(warm.map(r=>r.status),[200,200]);assert.equal((await route(request(f.page(4)),f.env)).status,503);
 t.mock.timers.tick(2499);await turn();assert.equal(settled,0,'all four physical reads stay held before the deadline');
 t.mock.timers.tick(1);assert((await Promise.all(jobs)).every(r=>r.status===503));await turn();const counts=new Map(f.calls.map(k=>[k,f.calls.filter(x=>x===k).length]));for(const key of blocked)assert.equal(counts.get(key),1);
 for(let i=0;i<20;i++)assert.equal((await route(request(f.page(i%4)),f.env)).status,503);assert.equal(f.calls.length,7);assert.equal(route.stats().slowRequests,0);assert.equal(route.stats().sdkFlights,4);held.release();await turn();assert.equal(route.stats().sdkFlights,0);
});

for(const method of['GET','HEAD'])for(const conditional of[false,true])test('Off fences pending '+method+' page including conditional='+conditional,async()=>{
 const f=await fixture(),route=createPublicItemHourRoute({waitMs:1000}),get=f.bucket.get,held=pause();assert.equal((await route(request(),f.env)).status,200);
 f.bucket.get=async key=>{const o=await get(key);if(key===f.tree.objects[0].key){held.enter();await held.held;}return o;};
 const old=route(request(f.page(0),{method,headers:conditional?{'If-None-Match':'"item-hour-'+f.tree.manifest.pages[0].sha256+'"'}:{}}),f.env);await held.entered;
 f.env.API_PUBLIC_ITEM_HOUR_HISTORY_JSON='{"enabled":false}';assert.equal((await route(request(),f.env)).status,404);held.release();const result=await old;assert.equal(result.status,404);assert.equal(result.headers.get('ETag'),null);assert.equal(result.headers.get('X-Astra-History-Source-Retrieved'),null);assert(!((await result.text()).includes('retained_item_hour_revisions')));assert.equal(route.stats().cachedPages,0);
});

test('late old-generation page cannot populate new pinned generation or return old conditional304',async()=>{
 const f=await fixture(),route=createPublicItemHourRoute({waitMs:1000}),get=f.bucket.get,held=pause();await route(request(),f.env);
 f.bucket.get=async key=>{const o=await get(key);if(key===f.tree.objects[0].key){held.enter();await held.held;}return o;};
 const old=route(request(f.page(0),{headers:{'If-None-Match':'"item-hour-'+f.tree.manifest.pages[0].sha256+'"'}}),f.env);await held.entered;
 const newer=await curateItemHours({itemId:ID,records:[await record(hour(HOUR,'12345.987'),{id:ID,at:'2026-11-05T00:00:00.000Z'})]});f.publish(newer);f.env.API_PUBLIC_ITEM_HOUR_HISTORY_JSON=flag(newer.manifest.generation);assert.equal((await route(request(),f.env)).status,200);held.release();const result=await old;assert.equal(result.status,409);assert.equal(result.headers.get('ETag'),null);assert.equal(route.stats().cachedPages,0);const p=newer.manifest.pages[0];assert.equal((await route(request(p.path+'?generation='+newer.manifest.generation),f.env)).status,200);
});

test('same semantic generation/new manifest bytes fences late body then revalidates cached page context',async()=>{
 let now=0;const f=await fixture(),route=createPublicItemHourRoute({now:()=>now,ttlMs:1000,waitMs:1000}),get=f.bucket.get,held=pause();await route(request(),f.env);
 f.bucket.get=async key=>{const o=await get(key);if(key===f.tree.objects[0].key){held.enter();await held.held;}return o;};const old=route(request(f.page(0)),f.env);await held.entered;
 const raw=new TextEncoder().encode(JSON.stringify(f.tree.manifest,null,2)),sha=await hash(raw),p={...f.tree.pointer,manifestHash:sha,manifestBytes:raw.length,manifestKey:'derived-item-hour-history/v1/'+ID+'/manifest-'+sha+'.json'};f.map.set(p.manifestKey,raw);f.map.set(pointerKey(ID),bytes(p));now=2000;
 const current=await route(request(),f.env);assert.equal(current.status,200);assert.equal(current.headers.get('etag'),'"item-hour-'+sha+'"');held.release();assert.equal((await old).status,409);assert.equal((await route(request(f.page(0)),f.env)).status,200);
});

test('body bytes/size/hash corruption cannot enter accepted public cache or renew original source clock',async()=>{
 for(const kind of['oversize','short','hash']){const f=await fixture(),route=createPublicItemHourRoute(),get=f.bucket.get;f.bucket.get=async key=>{const o=await get(key);if(key===f.tree.pointer.manifestKey){if(kind==='oversize')return{size:131073,arrayBuffer:()=>{throw Error('must not read');}};if(kind==='short')return{size:o.size+1,arrayBuffer:o.arrayBuffer};return{size:o.size,arrayBuffer:async()=>new Uint8Array(o.size).buffer};}return o;};const result=await route(request(),f.env);assert.equal(result.status,503);assert.equal(result.headers.get('ETag'),null);assert.equal(result.headers.get('X-Astra-History-Source-Retrieved'),null);assert.equal(route.stats().cachedManifest,0);}
});

test('LRU page cap is bounded and accepted private reader shard reuse does not copy a full body per waiter',async()=>{
 const f=await fixture({pages:3}),route=createPublicItemHourRoute({maxPages:1,maxBytes:262144});await route(request(),f.env);for(let i=0;i<3;i++){const r=await route(request(f.page(i)),f.env);assert.equal(r.status,200);assert.equal(await r.text(),new TextDecoder().decode(f.tree.objects[i].body));assert.equal(route.stats().cachedPages,1);assert(route.stats().cachedPageBytes<=262144);}const gets=f.calls.length;assert.equal((await route(request(f.page(0)),f.env)).status,200);assert.equal(f.calls.length,gets+1);assert.equal(route.stats().cachedPages,1);
});
