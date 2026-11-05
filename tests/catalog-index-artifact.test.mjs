import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{collect,catalogIdentityVersion} from '../ops/worker.mjs';
import {createMarketCatalog} from '../ops/market-catalog.mjs';
import {createCatalogRoutes,digest} from '../ops/catalog-routes.mjs';
import {withPreviewGate} from '../ops/preview-gate.mjs';
import {writeCatalogIndexArtifact,validateCatalogIndex,validateCatalogIndexDescriptor,createCatalogIndexArtifactReader,indexArtifactDigest} from '../ops/catalog-index-artifact.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const workerSource=readFileSync(new URL('../ops/worker.mjs',import.meta.url),'utf8');
const identityFile=/import catalogIdentities from '\.\.\/([^']+)'/.exec(workerSource)[1];
const identities=read(identityFile),feed=read('cache/market.json'),seed=read('dist/data.json');
const prepared=await createMarketCatalog(feed,identities),index=prepared.buildIndex();
const meta={schemaVersion:1,hashMethod:index.hashMethod,catalogHash:index.catalogHash,sourceProjectionHash:index.sourceProjectionHash,
  sourceUpdatedAt:index.sourceUpdatedAt,itemCount:index.itemCount,identityVersion:await catalogIdentityVersion};
const NOW=Math.max(Date.parse(seed.builtAt),Date.parse(feed.updatedAt))+60000;
const clone=value=>structuredClone(value),base='https://inflation.gg';
class R2{
  values=new Map();events=[];sequence=0;beforePut=null;
  raw(key,value){const stored={text:typeof value==='string'?value:JSON.stringify(value),etag:'e'+(++this.sequence)};this.values.set(key,stored);return stored;}
  read(key){return JSON.parse(this.values.get(key).text);}
  async get(key){this.events.push({op:'get',key});const value=this.values.get(key);return value?{size:Buffer.byteLength(value.text),etag:value.etag,body:new Response(value.text).body,json:async()=>JSON.parse(value.text),text:async()=>value.text}:null;}
  async put(key,value,options={}){
    if(this.beforePut)await this.beforePut(key,value,options);
    const old=this.values.get(key),condition=options.onlyIf;
    if(condition instanceof Headers&&condition.get('If-None-Match')==='*'&&old||condition?.etagMatches&&condition.etagMatches!==old?.etag){this.events.push({op:'conflict',key});return null;}
    this.events.push({op:'put',key});return this.raw(key,value);
  }
}
class Cache{
  values=new Map();gets=0;puts=0;broken=false;
  async match(key){this.gets++;if(this.broken)throw Error('Synthetic cache outage');return this.values.get(key.url)?.clone();}
  async put(key,response){this.puts++;if(this.broken)throw Error('Synthetic cache outage');this.values.set(key.url,new Response(await response.arrayBuffer(),response));}
}
function environment(bucket){return{SNAPSHOTS:bucket,ASSETS:{fetch:async()=>new Response('not found',{status:404})}};}
async function accepted(){
  const bucket=new R2(),feedHash=await digest(JSON.stringify(feed)),version='0123456789abcdef';
  const archiveKey=`_private/sources/${feed.updatedAt.slice(0,10)}/${feedHash}.json`;
  bucket.raw('version.json',{version,data:`data-${version}.json`,sourceUpdatedAt:feed.updatedAt,marketCatalog:meta});
  bucket.raw('_private/collector-state.json',{feed,feedHash,publishedVersion:version,archivedFeedHash:feedHash,archivedSourceKey:archiveKey});
  bucket.raw(archiveKey,{feed,feedHash,sourceUpdatedAt:feed.updatedAt});
  const artifact=await writeCatalogIndexArtifact(bucket,index,meta);
  bucket.raw('version.json',{...bucket.read('version.json'),catalogIndexArtifact:artifact});
  return{bucket,artifact,env:environment(bucket)};
}
function routeFixture(env,{cacheTime=0}={}){
  const counts={project:0};let now=cacheTime;
  const handler=createCatalogRoutes({compiledFeed:feed,identityMap:identities,now:()=>now,
    projectionFactory:async()=>{counts.project++;return{index,resolve:slug=>prepared.resolveItem(slug)};}});
  return{request:(path='/market-index.json',init={})=>handler(new Request(base+path,init),env),handler,counts,setNow:value=>{now=value;}};
}

test('collector commits immutable sanitized index before report/state/pointer; unchanged304 reuses it without a new report',async()=>{
  const bucket=new R2(),env=environment(bucket);
  const first=await collect(env,{now:NOW,fetcher:async()=>new Response(JSON.stringify(feed),{headers:{ETag:'"test-source"'}})});
  assert.equal(first.status,'published',first.detail);
  const pointer=bucket.read('version.json'),descriptor=validateCatalogIndexDescriptor(pointer,await catalogIdentityVersion);
  const body=bucket.values.get(descriptor.key).text;
  assert.equal(await indexArtifactDigest(body),descriptor.sha256);assert.equal(Buffer.byteLength(body),descriptor.bytes);
  assert.deepEqual(JSON.parse(body),index);assert.deepEqual(pointer.marketCatalog,meta);
  assert.equal(Object.hasOwn(bucket.read(pointer.data),'catalogIndexArtifact'),false,'Report metadata contract remains unchanged');
  const writes=bucket.events.filter(event=>event.op==='put').map(event=>event.key);
  for(const key of [pointer.data,'_private/collector-state.json','version.json'])assert(writes.indexOf(descriptor.key)<writes.indexOf(key));
  const offset=bucket.events.length;
  const unchanged=await collect(env,{now:NOW+600000,fetcher:async()=>new Response(null,{status:304})});
  assert.equal(unchanged.status,'unchanged');
  const next=bucket.read('version.json');assert.equal(next.version,pointer.version);assert.equal(next.builtAt,pointer.builtAt);
  assert.equal(next.sourceUpdatedAt,pointer.sourceUpdatedAt);assert.equal(next.lastSuccessfulFetchAt,pointer.lastSuccessfulFetchAt);
  assert.deepEqual(next.catalogIndexArtifact,descriptor);
  assert(!bucket.events.slice(offset).some(event=>event.op==='put'&&(event.key===descriptor.key||event.key.startsWith('data-'))));
});

test('cold index reads only pointer+artifact; fresh handler uses internal cache with only pointer; detail still verifies source/archive',async()=>{
  const {bucket,env,artifact}=await accepted(),cache=new Cache(),saved=globalThis.caches;globalThis.caches={default:cache};
  try{
    bucket.events=[];const first=routeFixture(env);
    const responses=await Promise.all(Array.from({length:100},()=>first.request()));
    for(const response of responses)assert.deepEqual(await response.json(),index);
    assert.deepEqual(bucket.events.map(event=>event.key),['version.json',artifact.key]);assert.equal(first.counts.project,0);assert.equal(cache.puts,1);
    bucket.events=[];const fresh=routeFixture(env);
    assert.deepEqual(await(await fresh.request()).json(),index);assert.deepEqual(bucket.events.map(event=>event.key),['version.json']);assert.equal(fresh.counts.project,0);
    bucket.events=[];const detail=await fresh.request('/market-item/apple.json?catalog='+index.catalogHash);
    assert.deepEqual(await detail.json(),prepared.resolveItem('apple'));assert.equal(fresh.counts.project,1);
    assert.equal(bucket.events.length,3);assert(bucket.events.some(event=>event.key==='_private/collector-state.json'));assert(bucket.events.some(event=>event.key.startsWith('_private/sources/')));
  }finally{if(saved===undefined)delete globalThis.caches;else globalThis.caches=saved;}
});

test('index GET/HEAD/304 bodies independent; outward review/password privacy and gate-first behavior preserved',async()=>{
  const {bucket,env}=await accepted(),cache=new Cache(),saved=globalThis.caches;globalThis.caches={default:cache};
  try{
    const f=routeFixture(env),handler=withPreviewGate(f.handler);
    Object.assign(env,{PREVIEW_ACCESS:'password',PREVIEW_PASSWORD:'SYNTHETIC PASSWORD ONLY',PREVIEW_SESSION_SECRET:'SYNTHETIC SIGNING KEY FOR THIS TEST ONLY'});
    bucket.events=[];const denied=await handler(new Request(base+'/market-index.json'),env,{});
    assert.equal(denied.status,401);assert.equal(bucket.events.length,0);assert.equal(cache.gets,0);
    const login=await handler(new Request(base+'/__preview_login',{method:'POST',headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:env.PREVIEW_PASSWORD,returnTo:'/market-index.json'})}),env,{});
    assert.equal(login.status,303);
    const authorized=await handler(new Request(base+'/market-index.json',{headers:{Cookie:login.headers.get('Set-Cookie').split(';')[0]}}),env,{});
    assert.equal(authorized.status,200);assert.equal(authorized.headers.get('Cache-Control'),'private, no-store, no-transform');assert.deepEqual(await authorized.json(),index);
    env.PREVIEW_ACCESS='review';
    const get=await handler(new Request(base+'/market-index.json'),env,{}),tag=get.headers.get('ETag');
    assert.equal(get.headers.get('Cache-Control'),'private, no-store, no-transform');assert.equal(get.headers.get('CDN-Cache-Control'),'no-store');assert.equal(get.headers.get('Cloudflare-CDN-Cache-Control'),'no-store');assert.equal(get.headers.get('X-Astra-Preview'),'review');
    assert.equal(get.headers.get('X-Artifact-Bytes-Hash'),null);assert.equal(get.headers.get('Set-Cookie'),null);
    const head=await f.request('/market-index.json',{method:'HEAD'}),conditional=await f.request('/market-index.json',{headers:{'If-None-Match':'W/'+tag}});
    assert.equal(await head.text(),'');assert.equal(head.headers.get('ETag'),tag);assert.equal(conditional.status,304);assert.equal(await conditional.text(),'');
    assert.deepEqual(await get.json(),index);assert.deepEqual(await(await f.request()).json(),index);
    assert.equal((await f.request('/market-item/apple.json?catalog='+'0'.repeat(64))).status,409);
  }finally{if(saved===undefined)delete globalThis.caches;else globalThis.caches=saved;}
});

test('legacy/missing/corrupt artifacts use accepted-feed fallback; unknown DTO fields never escape even with a matching content hash',async()=>{
  const saved=globalThis.caches;delete globalThis.caches;
  try{
    for(const corruption of ['legacy','missing','bytes','unknown_field','wrong_binding','identity']){
      const {bucket,env,artifact}=await accepted(),pointer=bucket.read('version.json');
      if(corruption==='legacy')delete pointer.catalogIndexArtifact;
      if(corruption==='missing')bucket.values.delete(artifact.key);
      if(corruption==='bytes')bucket.raw(artifact.key,'{}');
      if(corruption==='wrong_binding')pointer.catalogIndexArtifact.marketCatalog.sourceProjectionHash='d'.repeat(64);
      if(corruption==='identity')pointer.marketCatalog.identityVersion='e'.repeat(64);
      if(corruption==='unknown_field'){
        const bad={...clone(index),privatePlayer:'MUST NOT ESCAPE'},serialized=JSON.stringify(bad),sha=await indexArtifactDigest(serialized);
        const key=artifact.key.replace(artifact.sha256,sha);bucket.raw(key,serialized);pointer.catalogIndexArtifact={...artifact,key,sha256:sha,bytes:Buffer.byteLength(serialized)};
      }
      bucket.raw('version.json',pointer);const f=routeFixture(env),response=await f.request();
      assert.equal(response.headers.get('X-Catalog-Mode'),'accepted_r2',corruption);assert.deepEqual(await response.json(),index,corruption);assert.equal(f.counts.project,1,corruption);
    }
  }finally{if(saved!==undefined)globalThis.caches=saved;}
});

test('staged private state cannot replace committed artifact; bad artifact plus uncommitted state falls back honestly',async()=>{
  const {bucket,env,artifact}=await accepted(),state=bucket.read('_private/collector-state.json');
  state.publishedVersion='f'.repeat(16);state.feed.items[0].p*=2;bucket.raw('_private/collector-state.json',state);
  let f=routeFixture(env),response=await f.request();assert.equal(response.headers.get('X-Catalog-Mode'),'accepted_r2');assert.deepEqual(await response.json(),index);assert.equal(f.counts.project,0);
  bucket.raw(artifact.key,'{}');f=routeFixture(env);response=await f.request();assert.equal(response.headers.get('X-Catalog-Mode'),'compiled_daily_fallback');assert.deepEqual(await response.json(),index);
});

test('metadata/descriptor strict binding, producer unknown fields and immutable conflict are fail closed',async()=>{
  const {bucket,artifact}=await accepted(),pointer=bucket.read('version.json');
  assert.throws(()=>validateCatalogIndex({...index,player:'private'},meta));
  assert.throws(()=>validateCatalogIndex({...index,rows:[{...index.rows[0],history:[]},...index.rows.slice(1)]},meta));
  assert.throws(()=>validateCatalogIndex({...index,coverage:{...index.coverage,withQualifiedDailyPrice:1}},meta));
  assert.throws(()=>validateCatalogIndexDescriptor({...pointer,catalogIndexArtifact:{...artifact,key:'_private/collector-state.json'}},meta.identityVersion));
  assert.throws(()=>validateCatalogIndexDescriptor({...pointer,marketCatalog:{...meta,extra:'unknown'}},meta.identityVersion));
  assert.throws(()=>validateCatalogIndexDescriptor(pointer,'0'.repeat(64)),'Compiled proof identity must match the descriptor');
  await assert.rejects(writeCatalogIndexArtifact(bucket,{...index,extra:'private'},meta));
  bucket.raw(artifact.key,'bad stored bytes');await assert.rejects(writeCatalogIndexArtifact(bucket,index,meta),/conflict|mismatch/);
});

test('new committed generation invalidates warm index; same-byte metadata tampering cannot reuse a last-good fast path',async()=>{
  const {bucket,env}=await accepted(),f=routeFixture(env);
  assert.deepEqual(await(await f.request()).json(),index);
  const nextFeed=clone(feed);nextFeed.updatedAt=new Date(Date.parse(feed.updatedAt)+60000).toISOString();
  const nextCatalog=await createMarketCatalog(nextFeed,identities),nextIndex=nextCatalog.buildIndex();
  const nextMeta={...meta,catalogHash:nextIndex.catalogHash,sourceProjectionHash:nextIndex.sourceProjectionHash,sourceUpdatedAt:nextIndex.sourceUpdatedAt};
  const artifact=await writeCatalogIndexArtifact(bucket,nextIndex,nextMeta);
  const pointer={...bucket.read('version.json'),version:'fedcba9876543210',data:'data-fedcba9876543210.json',sourceUpdatedAt:nextMeta.sourceUpdatedAt,marketCatalog:nextMeta,catalogIndexArtifact:artifact};
  bucket.raw('version.json',pointer);f.setNow(30001);
  assert.deepEqual(await(await f.request()).json(),nextIndex);assert.equal(f.counts.project,0);
  pointer.marketCatalog.sourceProjectionHash='c'.repeat(64);pointer.catalogIndexArtifact.marketCatalog=clone(pointer.marketCatalog);
  bucket.raw('version.json',pointer);f.setNow(60002);
  // No committed feed for the new pointer exists in this fixture. A corrupted
  // metadata descriptor therefore declines the shortcut and uses dated seed.
  const fallback=await f.request();assert.equal(fallback.headers.get('X-Catalog-Mode'),'retained_accepted_r2');assert.deepEqual(await fallback.json(),nextIndex);assert.equal(f.counts.project,1);
});

test('artifact coalescing does not share a valid binding with a concurrently corrupted metadata descriptor',async()=>{
  const {bucket,artifact}=await accepted(),reader=createCatalogIndexArtifactReader(),pointer=bucket.read('version.json');
  const bad=clone(pointer);bad.marketCatalog.sourceProjectionHash='f'.repeat(64);bad.catalogIndexArtifact.marketCatalog=clone(bad.marketCatalog);
  const [goodResult,badResult]=await Promise.allSettled([reader(bucket,pointer,meta.identityVersion),reader(bucket,bad,meta.identityVersion)]);
  assert.equal(goodResult.status,'fulfilled');assert.equal(goodResult.value.index.catalogHash,index.catalogHash);assert.equal(badResult.status,'rejected');
  assert.equal(pointer.catalogIndexArtifact.sha256,artifact.sha256);
});

test('cached artifact corruption/cache outages retry R2 safely; retained index survives total storage outage after TTL',async()=>{
  const {bucket,env,artifact}=await accepted(),cache=new Cache(),saved=globalThis.caches;globalThis.caches={default:cache};
  try{
    await routeFixture(env).request();const key=[...cache.values.keys()][0];cache.values.set(key,new Response('{"unexpected":true}',{headers:{'Content-Type':'application/json'}}));
    bucket.events=[];assert.deepEqual(await(await routeFixture(env).request()).json(),index);assert.deepEqual(bucket.events.map(event=>event.key),['version.json',artifact.key]);
    cache.broken=true;assert.deepEqual(await(await routeFixture(env).request()).json(),index);
    const f=routeFixture(env);await f.request();bucket.get=async()=>{throw Error('Storage down');};f.setNow(30001);
    const retained=await f.request();assert.equal(retained.headers.get('X-Catalog-Mode'),'retained_accepted_r2');assert.deepEqual(await retained.json(),index);
  }finally{if(saved===undefined)delete globalThis.caches;else globalThis.caches=saved;}
});

test('artifact failure and pointer CAS loss cannot advertise an incomplete/new index generation',async()=>{
  const bucket=new R2(),env=environment(bucket);
  await collect(env,{now:NOW,fetcher:async()=>new Response(JSON.stringify(feed))});
  const original=bucket.read('version.json'),changed=clone(feed);changed.items[0].p*=1.1;
  bucket.beforePut=async key=>{if(key.startsWith('_private/catalog-index/'))throw Error('Artifact storage failed');};
  const failed=await collect(env,{now:NOW+600000,fetcher:async()=>new Response(JSON.stringify(changed))});
  assert.equal(failed.status,'degraded');let after=bucket.read('version.json');assert.equal(after.version,original.version);assert.deepEqual(after.catalogIndexArtifact,original.catalogIndexArtifact);assert.equal(after.sourceUpdatedAt,original.sourceUpdatedAt);
  bucket.beforePut=null;const winner={...after,version:'f'.repeat(16),data:'data-'+ 'f'.repeat(16)+'.json'};let injected=false;
  bucket.beforePut=async key=>{if(key==='version.json'&&!injected){injected=true;bucket.raw(key,winner);}};
  await collect(env,{now:NOW+1200000,fetcher:async()=>new Response(JSON.stringify(changed))});
  assert.deepEqual(bucket.read('version.json'),winner);
});

test('legacy artifact migration on source521 preserves failed-check status and all daily/fetch clocks',async()=>{
  const bucket=new R2(),env=environment(bucket);
  await collect(env,{now:NOW,fetcher:async()=>new Response(JSON.stringify(feed))});
  const pointer=bucket.read('version.json');delete pointer.catalogIndexArtifact;bucket.raw('version.json',pointer);
  const result=await collect(env,{now:NOW+600000,fetcher:async()=>new Response('unavailable',{status:521})});
  assert.equal(result.status,'degraded');assert.equal(result.upgraded,true);
  const upgraded=bucket.read('version.json');validateCatalogIndexDescriptor(upgraded,await catalogIdentityVersion);
  assert.equal(upgraded.sourceStatus.status,'degraded');assert.match(upgraded.sourceStatus.detail,/521/);
  assert.equal(upgraded.sourceUpdatedAt,pointer.sourceUpdatedAt);assert.equal(upgraded.lastSuccessfulFetchAt,pointer.lastSuccessfulFetchAt);
  assert.equal(bucket.read(upgraded.data).latest.nxRate,bucket.read(pointer.data).latest.nxRate);
});

test('internal cache path is not a public artifact route even through the default Worker',async()=>{
  const env=environment(new R2());env.PREVIEW_ACCESS='review';env.PREVIEW_PASSWORD='SYNTHETIC';env.PREVIEW_SESSION_SECRET='SYNTHETIC SIGNING KEY LONG ENOUGH FOR TEST';
  const response=await worker.fetch(new Request(base+'/__catalog_index_cache/v1/'+index.catalogHash+'.json'),env,{});
  assert.equal(response.status,404);assert.equal(response.headers.get('Cache-Control'),'private, no-store, no-transform');
});
