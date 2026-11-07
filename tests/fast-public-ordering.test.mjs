import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{setup}from'./fast-public-fixture.mjs';
import{createItemReferenceClient}from'../ui-src/item-api/item-loader.mjs';
import{FAST_ITEM_PROTOCOL,FAST_ITEM_HEADERS as F,hasFastItemHeaders,makeFastItemHeaders,validateFastItemHeaders,makeFastItemError}from'../ops/api-fast-item-public-protocol.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),epoch='fast-public-synthetic-v1',turn=()=>new Promise(setImmediate);
const frame=r=>({epoch:r.headers.get(F.epoch),revision:Number(r.headers.get(F.revision)),generation:r.headers.get('X-Astra-API-Item-Generation'),capturedAt:r.headers.get('X-Astra-API-Item-Captured-At'),bodySha256:r.headers.get('ETag').slice(10,-1)});
async function cloned(r,edit){const raw=await r.clone().arrayBuffer(),headers=new Headers(r.headers);await edit(headers);return new Response(r.status===304?null:raw,{status:r.status,headers});}
async function unsigned(r){return cloned(r,h=>{for(const k of Object.values(F))h.delete(k);});}
const clientFor=(x,fetcher,options={})=>createItemReferenceClient({enabled:true,ttlMs:0,now:()=>x.f.now[0],fetcher,...options});
async function omit(x,a){const raw=x.f.prices(),at=raw.lastIndexOf(',{"item_id":8000000,');assert(at>0);return x.publish(raw.slice(0,at)+']',a.e.capturedAt);}

test('shared public header protocol canonical bounds and independent exact binding, without private authority values',async()=>{
 const v={epoch,revision:1,generation:'a'.repeat(64),capturedAt:'2026-11-06T12:00:00.000Z',bodySha256:'b'.repeat(64)},now=Date.parse('2026-11-06T12:10:00Z'),h=await makeFastItemHeaders(v,{now}),headers=new Headers(h);
 assert.equal(h[F.binding],sha(JSON.stringify([FAST_ITEM_PROTOCOL,epoch,'1',v.generation,v.capturedAt,v.bodySha256])));assert.deepEqual(await validateFastItemHeaders(headers,{...v,now}),v);assert(hasFastItemHeaders(headers));
 for(const [key,value]of[[F.protocol,'legacy'],[F.revision,'01'],[F.revision,'0'],[F.revision,'-1'],[F.revision,'1.0'],[F.revision,'1e0'],[F.revision,'9007199254740992'],[F.epoch,'private/unsafe'],[F.binding,'0'.repeat(64)]]){const bad=new Headers(headers);bad.set(key,value);await assert.rejects(validateFastItemHeaders(bad,{...v,now}));}
 for(const key of Object.values(F)){const bad=new Headers(headers);bad.delete(key);await assert.rejects(validateFastItemHeaders(bad,{...v,now}));}
 const top=await makeFastItemHeaders({...v,revision:Number.MAX_SAFE_INTEGER},{now});assert.equal((await validateFastItemHeaders(new Headers(top),{...v,now})).revision,Number.MAX_SAFE_INTEGER);assert(!JSON.stringify(h).includes('grantReference'));
});

test('actual A-B missing at equal capture rejects original A, bounded global floor protects evicted IDs, genuine C restores',async t=>{
 const x=await setup(t,{extraItems:1}),a=await x.publish(),route=x.route({ttlMs:0}),id=8000000,other=[...x.f.names.keys()][0];let oldA,override=null;const calls=[];
 const client=clientFor(x,async(url,opt)=>{const r=override?override.clone():await route(new Request('https://own.example'+url,opt));calls.push(r.status);if(!oldA&&r.status===200&&url.includes('/'+id+'.json'))oldA=r.clone();return r;},{maxItems:1});
 await client.loadItem({itemId:other});const first=await client.loadItem({itemId:id});await omit(x,a);x.f.now[0]+=30001;await assert.rejects(client.loadItem({itemId:id}),e=>e.code==='not_found');assert.equal(client.ordering().revision,2);assert.equal(client.state(id),null);
 x.f.now[0]+=300001;override=oldA;await assert.rejects(client.loadItem({itemId:id}),e=>e.code==='invalid');assert.equal(client.state(id),null);
 // A coherent but adversarial same-revision positive wrapper is still blocked
 // by the validated per-ID missing tombstone, not merely its capture clock.
 const rebound=JSON.parse(await oldA.clone().text()),negative=await route(x.request(id));rebound.projectionGeneration=negative.headers.get('X-Astra-API-Item-Generation');const reboundRaw=JSON.stringify(rebound),reboundFrame={epoch,revision:2,generation:rebound.projectionGeneration,capturedAt:rebound.sourceCapturedAt,bodySha256:sha(reboundRaw)},reboundHeaders=new Headers(oldA.headers);reboundHeaders.set('ETag','"api-item-'+reboundFrame.bodySha256+'"');reboundHeaders.set('X-Astra-API-Item-Generation',reboundFrame.generation);for(const[k,v]of Object.entries(await makeFastItemHeaders(reboundFrame,{now:x.f.now[0]})))reboundHeaders.set(k,v);override=new Response(reboundRaw,{headers:reboundHeaders});x.f.now[0]+=300001;await assert.rejects(client.loadItem({itemId:id}),e=>e.code==='invalid');assert.equal(client.state(id),null);
 override=null;for(let k=0;k<65;k++)await assert.rejects(client.loadItem({itemId:900000000+k}),e=>e.code==='not_found');assert.equal(client.ordering().tombstones,64);assert.equal(client.ordering().saturatedAt,2);client.clear();assert.equal(client.ordering().revision,2);assert.equal(client.ordering().saturatedAt,2);
 override=oldA;await assert.rejects(client.loadItem({itemId:id}),e=>e.code==='invalid');override=null;const c=await x.publish(x.f.prices(),a.e.capturedAt);x.f.now[0]+=300001;const restored=await client.loadItem({itemId:id});assert.equal(restored.data.projectionGeneration,first.data.projectionGeneration);assert.equal(restored.data.sourceCapturedAt,a.e.capturedAt);assert.equal(client.ordering().revision,3);assert.equal(client.ordering().saturatedAt,0);assert(c.id>a.id);assert.equal(x.f.provider.length,0);t.diagnostic(JSON.stringify({sameCapture:true,oldReplayRejected:true,cohortRevision:3,boundedTombstones:true,sourceClockRenewed:false,statuses:calls.slice(0,7)}));
});

test('HEAD and304 bind same body; later same-body receipt advances only public revision and keeps original capture',async t=>{
 const x=await setup(t),a=await x.publish(),route=x.route({ttlMs:0}),id=[...x.f.names.keys()][0];const first=await route(x.request(id)),v=frame(first),raw=new Uint8Array(await first.clone().arrayBuffer());assert.equal(v.bodySha256,sha(raw));assert.deepEqual(await validateFastItemHeaders(first.headers,{...v,now:x.f.now[0]}),v);
 const head=await route(x.request(id,{method:'HEAD'}));assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(head.headers.get(F.binding),first.headers.get(F.binding));
 const client=clientFor(x,(url,opt)=>route(new Request('https://own.example'+url,opt)));await client.loadItem({itemId:id});await x.publish(x.f.prices(),a.e.capturedAt);x.f.now[0]+=30001;const r=await route(x.request(id,{headers:{'If-None-Match':first.headers.get('ETag')}}));assert.equal(r.status,304);assert.equal((await r.arrayBuffer()).byteLength,0);assert.equal(r.headers.get('ETag'),first.headers.get('ETag'));assert.equal(r.headers.get(F.revision),'2');assert.notEqual(r.headers.get(F.binding),first.headers.get(F.binding));const value=await client.loadItem({itemId:id});assert.equal(value.data.sourceCapturedAt,a.e.capturedAt);assert.equal(client.ordering().revision,2);assert.equal(x.f.provider.length,0);
});

test('legacy allowed before explicitFAST, then missing/wrong protocol or epoch cannot silently reset backend',async t=>{
 const x=await setup(t);await x.publish();const id=[...x.f.names.keys()][0],route=x.route({ttlMs:0}),base=await route(x.request(id)),legacy=await unsigned(base);let reply=legacy;
 const client=clientFor(x,async()=>reply.clone());await client.loadItem({itemId:id});assert.equal(client.ordering().protocolSeen,false);reply=base;await client.loadItem({itemId:id});assert.equal(client.ordering().protocolSeen,true);assert.equal(client.ordering().epoch,epoch);
 const badReplies=[legacy,await cloned(base,h=>h.delete(F.protocol)),await cloned(base,h=>h.set(F.revision,'01')),await cloned(base,h=>h.set(F.binding,'0'.repeat(64))),await cloned(base,async h=>{const f={...frame(base),epoch:'another-public-epoch'};for(const[k,v]of Object.entries(await makeFastItemHeaders(f,{now:x.f.now[0]})))h.set(k,v);})];
 for(const bad of badReplies){client.clear();reply=bad;x.f.now[0]+=300001;await assert.rejects(client.loadItem({itemId:id}),e=>e.code==='invalid');assert.equal(client.state(id),null);assert.equal(client.ordering().epoch,epoch);assert.equal(client.ordering().revision,1);}
 const old=JSON.parse(await base.clone().text());old.sourceCapturedAt=old.item.source.retrievedAt='2026-11-06T11:59:00.000Z';old.dtoSha256=sha(JSON.stringify(old.item));old.projectionGeneration='f'.repeat(64);const raw=JSON.stringify(old),next={epoch,revision:2,generation:old.projectionGeneration,capturedAt:old.sourceCapturedAt,bodySha256:sha(raw)},h=new Headers(base.headers);h.set('ETag','"api-item-'+next.bodySha256+'"');h.set('X-Astra-API-Item-Generation',next.generation);h.set('X-Astra-API-Item-Captured-At',next.capturedAt);for(const[k,v]of Object.entries(await makeFastItemHeaders(next,{now:x.f.now[0]})))h.set(k,v);reply=new Response(raw,{headers:h});client.clear();x.f.now[0]+=300001;await assert.rejects(client.loadItem({itemId:id}),e=>e.code==='invalid');assert.equal(client.ordering().revision,1);
});

test('authoritative404 binding tamper or held body withdraws before acceptance but cannot advance revision authority',async t=>{
 const x=await setup(t,{extraItems:1}),a=await x.publish(),route=x.route({ttlMs:0}),id=8000000,originalA=await route(x.request(id));let reply=null;const client=clientFor(x,(url,opt)=>reply?Promise.resolve(reply.clone()):route(new Request('https://own.example'+url,opt)),{timeoutMs:150});await client.loadItem({itemId:id});await omit(x,a);x.f.now[0]+=30001;const negative=await route(x.request(id));assert.equal(negative.status,404);assert.equal(negative.headers.get(F.revision),'2');
 reply=await cloned(negative,h=>h.set(F.binding,'0'.repeat(64)));await assert.rejects(client.loadItem({itemId:id}),e=>e.code==='not_found');assert.equal(client.state(id),null);assert.equal(client.ordering().revision,1);
 const second=clientFor(x,(url,opt)=>route(new Request('https://own.example'+url,opt)));const good=await second.loadItem({itemId:[...x.f.names.keys()][0]});assert.equal(good.data.sourceCapturedAt,a.e.capturedAt);
 const realA=await x.f.reader().read([...x.f.names.keys()][0]);assert.equal(realA.status,'validated');
 // Fresh client begins with the exact saved A response, then receives a held
 // B negative. Cache withdrawal precedes its body; no revisionB is inferred.
 let release,entered;const ready=new Promise(r=>entered=r);const heldBody=new ReadableStream({start(controller){release=()=>controller.close();}});let n=0;
 const heldClient=clientFor(x,async()=>++n===1?originalA.clone():(entered(),new Response(heldBody,{status:404,headers:negative.headers})),{timeoutMs:50});await heldClient.loadItem({itemId:id});const priorRevision=heldClient.ordering().revision;const pending=heldClient.loadItem({itemId:id});await ready;await turn();assert.equal(heldClient.state(id),null);await assert.rejects(pending,e=>e.code==='not_found');assert.equal(heldClient.ordering().revision,priorRevision);release();assert.equal(x.f.provider.length,0);
});
