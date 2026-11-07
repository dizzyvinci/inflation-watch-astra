import test from 'node:test';import assert from 'node:assert/strict';import {createHash}from'node:crypto';
import {setup}from'./fast-public-fixture.mjs';
import {createFastCurrentPublicItemPriceRoute}from'../ops/api-fast-current-public-route.mjs';
import {validatePublicItemReference}from'../ops/api-item-reference-protocol.mjs';
import {parseStrictJson}from'../ops/api-price-item-dto.mjs';
import {createIdentityIndex,createPriceSnapshot}from'../ops/api-price-item-dto.mjs';
import fs from'node:fs';
import {loadStampReferenceDefinition}from'../ops/stamp-reference-contract.mjs';
import {createItemReferenceClient}from'../ui-src/item-api/item-loader.mjs';
import {createItemPanelLifecycle}from'../ui-src/item-api/lifecycle.mjs';
import {withPreviewGate}from'../ops/preview-gate.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function typed(r){const b=new Uint8Array(await r.arrayBuffer()),v=await validatePublicItemReference(parseStrictJson(b));assert.equal(r.headers.get('ETag'),'"api-item-'+sha(b)+'"');assert.equal(r.headers.get('X-Astra-API-Item-Captured-At'),v.sourceCapturedAt);assert.equal(r.headers.get('X-Astra-API-Item-Generation'),v.projectionGeneration);return{b,v};}
test('defaultOff and outer password gate start zero derived/source reads',async()=>{
 const poison=new Proxy({},{get(){throw Error('Off inspected dependency')}}),route=createFastCurrentPublicItemPriceRoute({bucket:poison,scope:poison,metadata:poison,isEnabled:()=>{throw Error('Off callback')}});
 assert.equal((await route(new Request('https://own.example/api-item-prices/1.json'))).status,404);assert.equal(await route(new Request('https://own.example/elsewhere')),null);
 let calls=0;const protectedRoute=withPreviewGate(()=>{calls++;return new Response('not reached')});assert.equal((await protectedRoute(new Request('https://own.example/api-item-prices/1.json'),{PREVIEW_ACCESS:'password',PREVIEW_PASSWORD:'synthetic-only',PREVIEW_SESSION_SECRET:'s'.repeat(32)},{})).status,401);assert.equal(calls,0);
});
test('real graph GET HEAD304 exact DTO/fullstat/lexemes; no source or identity read; warm response reuses original clock',async t=>{
 const x=await setup(t),a=await x.publish(),id=[...x.f.names.keys()][0],route=x.route(),start=x.f.reads.length,r=await route(x.request(id));assert.equal(r.status,200);const{b,v}=await typed(r);assert.equal(v.sourceCapturedAt,a.e.capturedAt);assert.equal(v.item.variants.reportedStats.length,2);assert.equal(v.item.aggregate.asking.medianUnitPrice,'25000.04999999999999999');
 const readKeys=x.f.reads.slice(start);assert.equal(readKeys.length,3);assert(readKeys.every(k=>k.includes('/fast-current/')));const n=x.f.reads.length,head=await route(x.request(id,{method:'HEAD'}));assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);const conditional=await route(x.request(id,{headers:{'If-None-Match':r.headers.get('ETag')}}));assert.equal(conditional.status,304);assert.equal(conditional.headers.get('X-Astra-API-Item-Captured-At'),a.e.capturedAt);assert.equal(x.f.reads.length,n);assert(!new TextDecoder().decode(b).includes('sourceAttemptId'));assert.equal(x.f.provider.length,0);
});
test('fresh next graph gives409 before old conditional304; unscoped retry typed and original clock preserved',async t=>{
 const x=await setup(t),a=await x.publish(),id=[...x.f.names.keys()][0],route=x.route(),first=await route(x.request(id)),old=await typed(first);const b=await x.publish(x.f.prices(),'2026-11-06T12:02:00.000Z');x.f.now[0]+=30001;
 const changed=await route(new Request('https://own.example/api-item-prices/'+id+'.json?generation='+old.v.projectionGeneration,{headers:{'If-None-Match':first.headers.get('ETag')}}));assert.equal(changed.status,409);const next=await route(x.request(id));assert.equal(next.status,200);const current=await typed(next);assert.notEqual(current.v.projectionGeneration,old.v.projectionGeneration);assert.equal(current.v.sourceCapturedAt,b.e.capturedAt);assert.equal(a.e.capturedAt,'2026-11-06T12:00:00.000Z');assert.equal(x.f.provider.length,0);
});
test('same graph later genuine receipt permits same body304 without capture renewal',async t=>{
 const x=await setup(t),a=await x.publish(),id=[...x.f.names.keys()][0],route=x.route(),first=await route(x.request(id));await typed(first);const ordinal=x.f.row("SELECT publication_ordinal FROM fast_v2_generations WHERE role='current'").publication_ordinal;await x.publish(x.f.prices(),a.e.capturedAt);assert(x.f.row("SELECT publication_ordinal FROM fast_v2_generations WHERE role='current'").publication_ordinal>ordinal);x.f.now[0]+=30001;const r=await route(x.request(id,{headers:{'If-None-Match':first.headers.get('ETag')}}));assert.equal(r.status,304);assert.equal(r.headers.get('X-Astra-API-Item-Captured-At'),a.e.capturedAt);assert.equal(x.f.provider.length,0);
});
test('transient graph error retains only SAME-ID accepted bytes/date; no prior gives503; Off clears cache',async t=>{
 const x=await setup(t),a=await x.publish(),id=[...x.f.names.keys()][0],route=x.route(),first=await route(x.request(id));const before=await typed(first);x.f.now[0]+=30001;x.f.hook(async(kind,key)=>{if(kind==='get'&&key.endsWith('/fast-current/v1/current.json'))throw Error('synthetic owned object unavailable')});const r=await route(x.request(id));assert.equal(r.status,200);assert.equal(r.headers.get('X-Astra-API-Item-Mode'),'retained');assert.deepEqual((await typed(r)).b,before.b);assert.equal(r.headers.get('X-Astra-API-Item-Captured-At'),a.e.capturedAt);assert.equal((await route(x.request(999999999))).status,503);route.setEnabled(false);assert.equal((await route(x.request(id))).status,404);assert.equal(route.state().cacheItems,0);assert.equal(x.f.provider.length,0);
});
test('HTTP route validates paths/method/query before derived I/O and bounded cache evicts by count',async t=>{
 const x=await setup(t);await x.publish();const route=x.route({maxItems:2}),n=x.f.reads.length;assert.equal((await route(x.request(1,{method:'POST'}))).status,405);assert.equal((await route(new Request('https://own.example/api-item-prices/1.json?generation=x'))).status,400);assert.equal((await route(new Request('https://own.example/api-item-prices/01.json'))).status,404);assert.equal(x.f.reads.length,n);for(const id of[...x.f.names.keys()].slice(0,3))assert.equal((await route(x.request(id))).status,200);assert.equal(route.state().cacheItems,2);assert(route.state().cacheBytes<=2097152);assert.equal(x.f.provider.length,0);
});
test('public serialization hash deadline and ClearOffOn fence pending acceptance; original private graph unchanged',async t=>{
 const x=await setup(t),a=await x.publish(),id=[...x.f.names.keys()][0];let elapsed=0;const route=x.route({waitMs:1000,monotonicNow:()=>elapsed}),digest=crypto.subtle.digest.bind(crypto.subtle);let release,enter;const held=new Promise(r=>release=r),hit=new Promise(r=>enter=r);crypto.subtle.digest=async(...args)=>{if(args[1] instanceof Uint8Array&&new TextDecoder().decode(args[1]).includes('"kind":"api_item_price_reference"')){enter();await held;}return digest(...args)};
 try{const action=route(x.request(id));await hit;elapsed=1001;route.setEnabled(false);route.setEnabled(true);release();assert.equal((await action).status,503);assert.equal(route.state().cacheItems,0);assert.equal(x.f.row("SELECT captured_at FROM fast_v2_generations WHERE role='current'").captured_at,a.e.capturedAt);assert.equal(x.f.provider.length,0);}finally{release();crypto.subtle.digest=digest;}
});
test('actual route and client withdraw per-ID404 while other accepted reference remains unchanged',async t=>{
 const x=await setup(t,{extraItems:1}),a=await x.publish(),route=x.route({ttlMs:0}),id=8000000,other=[...x.f.names.keys()][0];let replyOverride=null;const client=createItemReferenceClient({enabled:true,now:()=>x.f.now[0],ttlMs:0,fetcher:(url,opt)=>replyOverride?Promise.resolve(replyOverride.clone()):route(new Request('https://own.example'+url,opt))});const first=await client.loadItem({itemId:id});const second=await client.loadItem({itemId:other});let mounted=false,updates=0;const status=[];
 const panel=createItemPanelLifecycle({container:{ownerDocument:{}},loader:async q=>(await client.loadItem(q)).data,mountPanel(){mounted=true;return{destroy(){mounted=false;},updateDto(){updates++;},updateTimezone(){}};},onStatus:(s,d)=>status.push({s,d})});assert.equal((await panel.show(id)).status,'shown');assert(mounted);
 const raw=x.f.prices(),at=raw.lastIndexOf(',{"item_id":8000000,');assert(at>0);await x.publish(raw.slice(0,at)+']','2026-11-06T12:02:00.000Z');x.f.now[0]+=30001;
 assert.deepEqual(await panel.refresh(),{status:'unavailable',reason:'not_found'});assert(!mounted);assert.equal(updates,0);assert.equal(status.at(-1).d.hasData,false);
 await assert.rejects(client.loadItem({itemId:id}),e=>e.code==='not_found');assert.equal(client.state(id),null);assert.equal(client.state(other).capturedAt,second.data.sourceCapturedAt);
 // A new-but-older fully typed response cannot restore the withdrawn ID. The
 // bounded failure record and the panel both retain the original capture floor.
 const old=structuredClone(first.data);old.sourceCapturedAt=old.item.source.retrievedAt='2026-11-06T12:01:00.000Z';old.dtoSha256=sha(JSON.stringify(old.item));const body=JSON.stringify(old);
 replyOverride=new Response(body,{headers:{'Content-Type':'application/json',ETag:'"api-item-'+sha(body)+'"','X-Astra-API-Item-Mode':'validated_cache','X-Astra-API-Item-Captured-At':old.sourceCapturedAt,'X-Astra-API-Item-Generation':old.projectionGeneration}});x.f.now[0]+=300001;
 await assert.rejects(client.loadItem({itemId:id}),e=>e.code==='invalid');assert.equal(client.state(id),null);assert.equal((await panel.refresh()).status,'unavailable');assert(!mounted);assert.equal(client.state(other).capturedAt,second.data.sourceCapturedAt);assert.equal(a.e.capturedAt,'2026-11-06T12:00:00.000Z');assert.equal(x.f.provider.length,0);
});

test('monotonic final HTTP hash fence refuses a blocked continuation even before timer delivery',async t=>{
 const x=await setup(t);await x.publish();const id=[...x.f.names.keys()][0],route=x.route({waitMs:100}),digest=crypto.subtle.digest.bind(crypto.subtle);let blocked=false;
 const mock=t.mock.method(crypto.subtle,'digest',async(...args)=>{const value=await digest(...args);if(new TextDecoder().decode(args[1]).includes('"kind":"api_item_price_reference"')){blocked=true;const until=performance.now()+125;while(performance.now()<until){};}return value;});
 try{const result=await route(x.request(id));assert(blocked);assert.equal(result.status,503);assert.equal(route.state().cacheItems,0);}finally{mock.mock.restore();}
});

test('actual reader cancellation keeps both shared physical slots after HTTP timeout until cancel settles',async()=>{
 let release,entered=0,hit;const held=new Promise(r=>release=r),both=new Promise(r=>hit=r);let gets=0;
 const bucket={async get(){gets++;return{size:0,body:new ReadableStream({cancel(){entered++;if(entered===2)hit();return held;}})};}};
 const opts={bucket,scope:{grantReference:'synthetic-grant',roundReference:'synthetic-r1'},metadata:[{sourceUrl:'https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000',expectedSha256:'a'.repeat(64)}],publicEpoch:'fast-public-synthetic-v1',enabled:true,waitMs:100};
 const routes=[0,1,2].map(()=>createFastCurrentPublicItemPriceRoute(opts)),req=id=>new Request('https://own.example/api-item-prices/'+id+'.json');
 try{const a=routes[0](req(1)),b=routes[1](req(2));await both;assert.equal((await a).status,503);assert.equal((await b).status,503);assert.equal(routes[0].state().physicalPending,2);assert.equal((await routes[2](req(3))).status,503);assert.equal(gets,2);assert.equal(routes[1].state().physicalPending,2);}finally{release();}
 for(let i=0;i<20&&routes[0].state().physicalPending;i++)await new Promise(r=>setImmediate(r));assert.equal(routes[0].state().physicalPending,0);
});

test('HTTP boundary independently rejects private/unknown fields even from a trusted reader factory',async t=>{
 const x=await setup(t);await x.publish();const id=[...x.f.names.keys()][0],real=await x.f.reader().read(id);assert.equal(real.status,'validated');const canary='PRIVATE_CANARY_MUST_NOT_ESCAPE';
 const route=x.route({readerFactory:()=>({read:async()=>({...real,reference:{...real.reference,privateActor:canary}}),setEnabled(){},state:()=>({physicalPending:0})})});const result=await route(x.request(id));assert.equal(result.status,503);assert(!(await result.text()).includes(canary));assert.equal(route.state().cacheItems,0);
});

test('1500 real-owner full-stat graph matches production snapshot for every ID; selected HTTP reads do not touch source or SQL',async t=>{
 const stamp=await loadStampReferenceDefinition(),def=JSON.parse(fs.readFileSync(new URL('../ops/api-index-definition-data-v1.json',import.meta.url))),known=new Set([...def.goods,...def.cash].map(v=>v.itemId));for(const[id]of stamp.rows)known.add(id);
 const x=await setup(t,{extraItems:1500-known.size}),a=await x.publish(),g=x.f.row("SELECT * FROM fast_v2_generations WHERE role='current'"),manifest=JSON.parse(x.f.objects.get('_private/provider-api/v1/fast-current/v1/manifests/'+g.manifest_sha+'.json').body);
 assert.equal(g.item_count,1500);assert.equal(manifest.itemIds.length,1500);const raw=Buffer.from(a.e.rawBodyBase64,'base64'),snapshot=await createPriceSnapshot(raw,{expectedSha256:a.e.responseSha256,identities:await createIdentityIndex(x.f.sources),context:{operation:'prices',sourceUrl:a.e.sourceUrl,capturedAt:a.e.capturedAt,captureTimeKind:a.e.captureTimeKind,sourceObservedAt:null}});
 let count=0,stats=0;for(const d of manifest.shards){const body=Buffer.from(x.f.objects.get('_private/provider-api/v1/fast-current/v1/shards/'+d.sha256+'.json').body);assert.equal(body.length,d.bytes);assert.equal(sha(body),d.sha256);for(const item of parseStrictJson(body).items){assert.equal(JSON.stringify(item),JSON.stringify(snapshot.getItem(item.itemId)));stats+=item.variants.reportedStats.length;count++;}}
 assert.equal(count,1500);assert.equal(stats,3000);const route=x.route({waitMs:10000}),before=x.f.reads.length,puts=x.f.puts.length,exec=x.f.core.sql.exec;let sql=0;x.f.core.sql.exec=(...args)=>{sql++;return exec(...args);};
 try{for(const id of[manifest.itemIds[0],manifest.itemIds[750],manifest.itemIds.at(-1)]){const r=await route(x.request(id));assert.equal(r.status,200);const{v}=await typed(r);assert.deepEqual(v.item,snapshot.getItem(id));assert.equal(v.sourceCapturedAt,a.e.capturedAt);}}finally{x.f.core.sql.exec=exec;}
 assert.equal(sql,0);assert.equal(x.f.puts.length,puts);assert.equal(x.f.reads.length-before,9);assert(x.f.reads.slice(before).every(k=>k.includes('/fast-current/')));assert.equal(x.f.provider.length,0);
 t.diagnostic(JSON.stringify({allIdDtoParity:1500,reportedStatsGroups:stats,realOwnerShards:g.shard_count,selectedHttpIds:3,derivedObjectGets:9,publicRawReads:0,publicSqlStatements:sql,publicSearchIdentitySidecarImplemented:false,nativeCapacityClaimed:false}));
});
