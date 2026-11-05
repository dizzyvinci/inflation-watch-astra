import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCatalogRoutes,digest} from '../ops/catalog-routes.mjs';
import {createMarketCatalog} from '../ops/market-catalog.mjs';
import worker from '../ops/worker.mjs';
import {withPreviewGate} from '../ops/preview-gate.mjs';
const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const feed=read('cache/market.json');
const identities=read('catalog-identities-v2.json');
const prepared=await createMarketCatalog(feed,identities),index=prepared.buildIndex();
const details=Object.fromEntries(['apple','adamantium-guards'].map(slug=>[slug,prepared.resolveItem(slug)]));
const clone=value=>structuredClone(value);
const base='https://preview.example';

class R2 {
  values=new Map();reads=[];broken=false;
  async get(key){this.reads.push(key);await new Promise(resolve=>setTimeout(resolve,1));if(this.broken)throw Error('SECRET STORAGE ERROR');const value=this.values.get(key);if(!value)return null;const text=JSON.stringify(value);return{size:Buffer.byteLength(text),text:async()=>text};}
}
async function fixture({gated=false,corrupt=false,slowResolve=false,withArchive=true}={}){
  const bucket=new R2(),hash=await digest(JSON.stringify(feed)),version='1234567890abcdef';
  const archiveKey=`_private/sources/${feed.updatedAt.slice(0,10)}/${hash}.json`;
  bucket.values.set('version.json',{version,data:`data-${version}.json`,sourceUpdatedAt:feed.updatedAt});
  bucket.values.set('_private/collector-state.json',{feed:clone(feed),feedHash:hash,publishedVersion:version,
    ...(withArchive?{archivedFeedHash:hash,archivedSourceKey:archiveKey}:{})});
  bucket.values.set(archiveKey,{feedHash:hash,sourceUpdatedAt:feed.updatedAt,feed:clone(feed)});
  if(corrupt)bucket.values.get('_private/collector-state.json').feedHash='0'.repeat(64);
  const calls={compile:0,resolve:0,fetch:0};let now=100000;
  const factory=async _source=>{
    calls.compile++;await new Promise(resolve=>setTimeout(resolve,1));
    return{index:{...clone(index),apiKey:'SECRET',rows:index.rows.map(row=>({...row,player:'SECRET',history:['SECRET']}))},resolve:async slug=>{
      calls.resolve++;if(slowResolve)await new Promise(resolve=>setTimeout(resolve,5));
      const item=clone(details[slug]??null);if(item){item.apiKey='SECRET';item.sourceSummary.player='SECRET';item.history[0].player='SECRET';}return item;
    }};
  };
  const handler=withPreviewGate(createCatalogRoutes({projectionFactory:factory,compiledFeed:feed,identityVersion:'fixture-v1',now:()=>now,ttlMs:5000}));
  const env={SNAPSHOTS:bucket,...(gated?{PREVIEW_ACCESS:'password',PREVIEW_PASSWORD:'TEST ONLY PASSWORD',PREVIEW_SESSION_SECRET:'TEST ONLY SECRET LONG ENOUGH FOR FIXTURE'}:{})};
  let cookie='';
  async function request(path,options={}){const headers=new Headers(options.headers);if(cookie)headers.set('Cookie',cookie);return handler(new Request(base+path,{...options,headers}),env,{});}
  async function login(){const response=await request('/__preview_login',{method:'POST',headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:env.PREVIEW_PASSWORD,returnTo:'/market-index.json'})});assert.equal(response.status,303);cookie=response.headers.get('Set-Cookie').split(';')[0];}
  return {handler,env,bucket,calls,request,login,setNow:value=>now=value};
}

test('gate rejects unauthenticated requests before any R2/projector read; authenticated JSON stays private',async()=>{
  const f=await fixture({gated:true});let response=await f.request('/market-index.json');assert.equal(response.status,401);assert.equal(f.bucket.reads.length,0);assert.equal(f.calls.compile,0);
  await f.login();response=await f.request('/market-index.json');assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/application\/json/);assert.equal(response.headers.get('X-Astra-Preview'),'password');assert.match(response.headers.get('Cache-Control'),/private, no-store/);assert.equal(response.headers.get('CDN-Cache-Control'),'no-store');assert.equal((await response.json()).itemCount,1424);
});

test('accepted R2 source is hash/commit/archive verified and concurrent index reads are coalesced',async()=>{
  const f=await fixture();const results=await Promise.all(Array.from({length:20},()=>f.request('/market-index.json')));
  assert(results.every(response=>response.status===200));assert.equal(f.calls.compile,1);assert.equal(f.bucket.reads.length,3);
  const values=await Promise.all(results.map(response=>response.json()));assert(values.every(value=>value.catalogHash===index.catalogHash));assert(values.every(value=>value.rows.length===1424));assert(!JSON.stringify(values[0]).includes('SECRET'));assert(!Object.hasOwn(values[0].rows[0],'history'));
  assert.equal(values[0].coverage.withoutQualifiedDailyPrice,251);assert.equal(values[0].sourceUpdatedAt,feed.updatedAt);
});

test('exact item/hash binding, all thin points retained, no private fields or inferred NX',async()=>{
  const f=await fixture({slowResolve:true}),path='/market-item/apple.json?catalog='+index.catalogHash;
  const responses=await Promise.all(Array.from({length:12},()=>f.request(path)));assert(responses.every(response=>response.status===200));assert.equal(f.calls.resolve,1);
  const actual=await responses[0].json();assert.equal(actual.slug,'apple');assert.equal(actual.catalogHash,index.catalogHash);assert.equal(actual.price,null);assert.equal(actual.history.length,4);assert(actual.history.every(point=>point.quality==='thin'));assert.equal(actual.sourceUpdatedAt,feed.updatedAt);assert(!JSON.stringify(actual).includes('SECRET'));assert(!Object.hasOwn(actual,'nx'));
  let response=await f.request('/market-item/apple.json?catalog='+'0'.repeat(64));assert.equal(response.status,409);assert.equal((await response.json()).catalogHash,index.catalogHash);
  response=await f.request('/market-item/definitely-not-collected.json?catalog='+index.catalogHash);assert.equal(response.status,404);
  response=await f.request('/market-item/iron-ore.json?catalog='+index.catalogHash);assert.equal(response.status,503,'An indexed item whose prototype detail is absent must not pretend item absence');
});

test('ETag/HEAD responses are independent and use bound generation; metadata/key paths cannot read R2',async()=>{
  const f=await fixture();let response=await f.request('/market-index.json');const etag=response.headers.get('ETag');assert(etag);
  response=await f.request('/market-index.json',{headers:{'If-None-Match':etag}});assert.equal(response.status,304);assert.equal(await response.text(),'');
  response=await f.request('/market-index.json',{method:'HEAD'});assert.equal(response.status,200);assert.equal(await response.text(),'');assert.equal(response.headers.get('ETag'),etag);
  for(const path of ['/_private/collector-state.json','/market-item/apple.json?key=SECRET','/market-item/apple.json','/market-item/Apple.json?catalog='+index.catalogHash,'/market-index.json?q=private-search']){
    const before=f.bucket.reads.length;response=await f.request(path);assert([400,404].includes(response.status));assert.equal(f.bucket.reads.length,before);assert(!(await response.text()).includes('SECRET'));
  }
  const before=f.bucket.reads.length;response=await f.request('/market-index.json',{method:'POST'});
  assert.equal(response.status,405);assert.equal(response.headers.get('Allow'),'GET, HEAD');assert.equal(f.bucket.reads.length,before);
});

test('approved review mode serves the catalogue publicly through the existing gate with private review headers',async()=>{
  const f=await fixture();Object.assign(f.env,{PREVIEW_ACCESS:'review',PREVIEW_PASSWORD:'TEST ONLY PASSWORD',PREVIEW_SESSION_SECRET:'TEST ONLY SECRET LONG ENOUGH FOR FIXTURE'});
  const response=await f.request('/market-index.json');assert.equal(response.status,200);
  assert.equal(response.headers.get('X-Astra-Preview'),'review');assert.match(response.headers.get('Cache-Control'),/private, no-store/);
  assert.equal(response.headers.get('Set-Cookie'),null);assert.equal((await response.json()).hashMethod,index.hashMethod);
});

test('staged state, tampered hash/archive and unavailable storage use only compiled approved fallback',async()=>{
  for(const mutation of ['uncommitted','bad_hash','bad_archive','missing_binding']){
    const f=await fixture();
    if(mutation==='uncommitted')f.bucket.values.get('_private/collector-state.json').publishedVersion='fedcba0987654321';
    if(mutation==='bad_hash')f.bucket.values.get('_private/collector-state.json').feedHash='0'.repeat(64);
    if(mutation==='bad_archive'){const key=f.bucket.values.get('_private/collector-state.json').archivedSourceKey;f.bucket.values.get(key).feedHash='0'.repeat(64);}
    if(mutation==='missing_binding')delete f.env.SNAPSHOTS;
    const response=await f.request('/market-index.json');assert.equal(response.status,200);assert.equal(response.headers.get('X-Catalog-Mode'),'compiled_daily_fallback');assert.equal((await response.json()).sourceUpdatedAt,feed.updatedAt);
  }
});

test('TTL recheck retains prior accepted generation on R2 failure without manufacturing new source clock',async()=>{
  const f=await fixture();const initial=await (await f.request('/market-index.json')).json();f.bucket.broken=true;f.setNow(106000);
  const response=await f.request('/market-index.json'),retained=await response.json();assert.equal(response.headers.get('X-Catalog-Mode'),'retained_accepted_r2');assert.deepEqual(retained,initial);assert.equal(f.calls.compile,1);
});

test('unchanged publication polls only the small pointer after TTL, not raw feed/archive again',async()=>{
  const f=await fixture();await f.request('/market-index.json');assert.equal(f.bucket.reads.length,3);
  f.setNow(106000);const response=await f.request('/market-index.json');assert.equal(response.status,200);assert.equal(f.bucket.reads.length,4);assert.equal(f.bucket.reads.at(-1),'version.json');assert.equal(f.calls.compile,1);
});

test('legacy accepted state and cached-upgrade publication markers are supported without new archives',async()=>{
  const f=await fixture({withArchive:false}),state=f.bucket.values.get('_private/collector-state.json'),pointer=f.bucket.values.get('version.json');
  state.publishedVersion='fedcba0987654321';state.cachedUpgradeSourceVersion=pointer.version;state.cachedUpgradeSourceHash=state.feedHash;
  const response=await f.request('/market-index.json');assert.equal(response.status,200);assert.equal(response.headers.get('X-Catalog-Mode'),'accepted_r2');
});

test('router has no provider request capability and does not modify original data/report',async()=>{
  const before=JSON.stringify(feed),original=globalThis.fetch;globalThis.fetch=()=>{throw Error('No visitor upstream call');};
  try{const f=await fixture();assert.equal((await f.request('/market-index.json')).status,200);assert.equal((await f.request('/market-item/adamantium-guards.json?catalog='+index.catalogHash)).status,200);assert.equal(JSON.stringify(feed),before);}finally{globalThis.fetch=original;}
});

test('actual Worker dispatches catalogue before static assets and applies only its existing outer gate',async()=>{
  const before=JSON.stringify(feed),original=globalThis.fetch;
  globalThis.fetch=()=>{throw Error('A visitor must never contact a provider');};
  try{
    let assetCalls=0,reads=0;
    const passwordEnv={PREVIEW_ACCESS:'password',PREVIEW_PASSWORD:'TEST ONLY PASSWORD',PREVIEW_SESSION_SECRET:'TEST ONLY SECRET LONG ENOUGH FOR FIXTURE',
      ASSETS:{fetch(){assetCalls++;throw Error('Catalogue must not use static SPA fallback');}},
      SNAPSHOTS:{async get(){reads++;return null;}}};
    let response=await worker.fetch(new Request(base+'/market-index.json'),passwordEnv);
    assert.equal(response.status,401);assert.equal(reads,0);assert.equal(assetCalls,0);
    const login=await worker.fetch(new Request(base+'/__preview_login',{method:'POST',headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:passwordEnv.PREVIEW_PASSWORD})}),passwordEnv);
    const cookie=login.headers.get('Set-Cookie').split(';')[0];
    response=await worker.fetch(new Request(base+'/market-index.json',{headers:{Cookie:cookie}}),passwordEnv);
    assert.equal(response.status,200);assert.equal(response.headers.get('X-Astra-Preview'),'password');
    assert.deepEqual(await response.json(),index);assert.equal(assetCalls,0);
    const reviewEnv={...passwordEnv,PREVIEW_ACCESS:'review',SNAPSHOTS:{async get(){return null;}}};
    response=await worker.fetch(new Request(base+'/market-item/apple.json?catalog='+index.catalogHash),reviewEnv);
    assert.equal(response.status,200);assert.equal(response.headers.get('X-Astra-Preview'),'review');
    assert.equal(response.headers.get('X-Catalog-Mode'),'compiled_daily_fallback');
    assert.deepEqual(await response.json(),prepared.resolveItem('apple'));assert.equal(assetCalls,0);
    for(const path of ['/market-item/Apple.json','/market-item/apple.json?catalog='+'0'.repeat(64),'/market-item/apple.json']){
      response=await worker.fetch(new Request(base+path),reviewEnv);assert([400,404,409].includes(response.status));
    }
    assert.equal(assetCalls,0);assert.equal(JSON.stringify(feed),before);
  }finally{globalThis.fetch=original;}
});
