import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {after} from 'node:test';
import {performance} from 'node:perf_hooks';
import {createMarketCatalog,sourceSummary,projectionFactory,createCachedProjectionFactory} from '../ops/market-catalog.mjs';
import {canonicalBytes,portableHash,HASH_METHOD,codepointCompare} from '../ops/portable-hash.mjs';
import {createCatalogRoutes,digest} from '../ops/catalog-routes.mjs';
const temporary=mkdtempSync(resolve(tmpdir(),'astra-catalog-parity-'));
after(()=>{if(dirname(temporary)!==resolve(tmpdir())||!basename(temporary).startsWith('astra-catalog-parity-'))throw Error('Unsafe temporary cleanup path');rmSync(temporary,{recursive:true,force:true});});
execFileSync(process.env.PYTHON||'python',['-B',fileURLToPath(new URL('./catalog_parity_fixtures.py',import.meta.url)),temporary],{encoding:'utf8',maxBuffer:100000});
const read=name=>JSON.parse(readFileSync(resolve(temporary,name),'utf8'));
const fixture=read('actual.json'),cases=read('adversarial.json'),vectors=read('hash-vectors.json');
const clone=value=>structuredClone(value);

test('portable typed protocol matches Python bytes and SHA for every vector',async()=>{
  assert.equal(vectors.hashMethod,HASH_METHOD);
  for(const vector of vectors.vectors){assert.equal(Buffer.from(canonicalBytes(vector.value)).toString('hex'),vector.bytesHex);assert.equal(await portableHash(vector.value),vector.hash);}
  assert.equal(await portableHash(1),await portableHash(1.0));assert.equal(await portableHash(-0),await portableHash(0));assert.notEqual(await portableHash(true),await portableHash(1));assert.notEqual(await portableHash('1'),await portableHash(1));
  assert(codepointCompare('\ue000','\u{10000}')<0,'Sort by code point, not UTF16 code unit');
  for(const value of [NaN,Infinity,-Infinity,Number.MAX_SAFE_INTEGER+1,1n,undefined,'\ud800',new Date(),new Array(2)])assert.throws(()=>canonicalBytes(value));
});

test('all1424 index records and25801 daily points exactly match Python portable projection',async()=>{
  const before=JSON.stringify(fixture.feed),start=performance.now(),catalog=await createMarketCatalog(fixture.feed,fixture.identities),prepared=performance.now();
  const index=catalog.buildIndex();assert.deepEqual(index,fixture.index);assert.equal(index.itemCount,1424);assert.equal(index.coverage.withQualifiedDailyPrice,1173);assert.equal(index.coverage.withoutQualifiedDailyPrice,251);assert.equal(index.identityCoverage.matchedItems,79);
  let points=0;
  for(const raw of fixture.feed.items){const detail=catalog.resolveItem(raw.s,{expectedCatalogHash:index.catalogHash});assert.deepEqual(detail,fixture.items[raw.s],raw.s);points+=detail.history.length;}
  assert.equal(points,25801);assert.equal(JSON.stringify(fixture.feed),before);
  const done=performance.now(),metrics={nodeVersion:process.version,items:index.itemCount,points,exactVerifiedIds:index.identityCoverage.matchedItems,prepareMs:prepared-start,indexAndAllDetailsParityMs:done-prepared,sourceProjectionHash:index.sourceProjectionHash,catalogHash:index.catalogHash,scope:'One local Node process; not Worker cold-start/CPU or production throughput guarantee'};
  console.log('Catalogue parity metrics',JSON.stringify(metrics));
});

test('22 adversarial fixtures match Python values, validation and exact hashes',async()=>{
  for(const item of cases){
    if(item.error){await assert.rejects(createMarketCatalog(item.feed,item.identities),undefined,item.name);continue;}
    const catalog=await createMarketCatalog(item.feed,item.identities);assert.deepEqual(catalog.buildIndex(),item.expected.index,item.name);
    for(const [slug,expected] of Object.entries(item.expected.items))assert.deepEqual(catalog.resolveItem(slug),expected,item.name+':'+slug);
  }
});

test('full accepted-source report and pointer metadata exactly matches Python including identityVersion',async()=>{
  const metadata=await createCachedProjectionFactory(fixture.identities).metadata(fixture.feed);
  assert.deepEqual(metadata,fixture.metadata);
});

test('hash guards, detached values and exact lookup cannot mutate or silently join a generation',async()=>{
  const catalog=await createMarketCatalog(fixture.feed,fixture.identities),index=catalog.buildIndex(),detail=catalog.resolveItem('apple');
  index.rows[0].name='changed';detail.history[0].median=999;detail.sourceSummary.medianSale=999;
  assert.deepEqual(catalog.resolveItem('apple'),fixture.items.apple);assert.equal(catalog.resolveItem('unknown-exact-slug'),null);
  assert.throws(()=>catalog.resolveItem('Apple'));assert.throws(()=>catalog.resolveItem('../apple'));assert.throws(()=>catalog.resolveItem('apple',{expectedCatalogHash:'0'.repeat(64)}));
  const source=clone(fixture.feed);source.items[0].h[0][1]+=1;const changed=await createMarketCatalog(source,fixture.identities);assert.notEqual(changed.catalogHash,catalog.catalogHash);assert.equal(changed.sourceUpdatedAt,catalog.sourceUpdatedAt);
  const noIds=await createMarketCatalog(fixture.feed,[]);assert.equal(noIds.sourceProjectionHash,catalog.sourceProjectionHash);assert.notEqual(noIds.catalogHash,catalog.catalogHash);
});

test('malformed/nonfinite optional summary fields sanitize without source or secret leakage',()=>{
  const summary=sourceSummary({p:NaN,p25:Infinity,p75:true,lo:0,hi:-1,ask:{},asks:1.5,sellers:-1,st:2,last:'2026-11-04T00:00:00+00:99',apiKey:'PRIVATE'},fixture.feed.updatedAt);
  for(const key of ['medianSale','p25','p75','lowSale','highSale','medianSellerAsk','listings','sellers','sellThrough','reportedLastSaleAt'])assert.equal(summary[key],null);
  assert(!JSON.stringify(summary).includes('PRIVATE'));
});

test('own-site router can use the real JS projector for arbitrary collected items, no fixture-only factory',async()=>{
  const feedHash=await digest(JSON.stringify(fixture.feed)),version='1234567890abcdef',values=new Map([
    ['version.json',{version,data:`data-${version}.json`,sourceUpdatedAt:fixture.feed.updatedAt}],
    ['_private/collector-state.json',{feed:fixture.feed,feedHash,publishedVersion:version}],
  ]);
  const env={SNAPSHOTS:{async get(key){const value=values.get(key);return value?{text:async()=>JSON.stringify(value)}:null;}}};
  const handler=createCatalogRoutes({projectionFactory,compiledFeed:fixture.feed,identityMap:fixture.identities,identityVersion:HASH_METHOD});
  const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('No visitor provider request');};
  try{
    let response=await handler(new Request('https://preview.example/market-index.json'),env);assert.equal(response.status,200);const index=await response.json();assert.deepEqual(index,fixture.index);
    for(const slug of ['apple','iron-ore','blue-sauna-robe','painting-of-shade']){
      response=await handler(new Request('https://preview.example/market-item/'+slug+'.json?catalog='+index.catalogHash),env);assert.equal(response.status,200,slug);const detail=await response.json();
      assert.deepEqual(detail,fixture.items[slug]);
    }
    response=await handler(new Request('https://preview.example/market-item/apple.json?catalog='+'0'.repeat(64)),env);assert.equal(response.status,409);
  }finally{globalThis.fetch=original;}
});

test('router rejects an unknown hash method and mismatched item method instead of serving an unbound generation',async()=>{
  for(const fault of ['index','detail']){
    const handler=createCatalogRoutes({compiledFeed:fixture.feed,projectionFactory:async()=>{
      const index=clone(fixture.index);if(fault==='index')delete index.hashMethod;
      return{index,resolve:slug=>({...clone(fixture.items[slug]),hashMethod:'unknown-method'})};
    }});
    const url=fault==='index'?'/market-index.json':'/market-item/apple.json?catalog='+fixture.index.catalogHash;
    const response=await handler(new Request('https://preview.example'+url),{});
    assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'catalogue_unavailable'});
  }
});

test('shared bounded factory coalesces HTTP preparation and report metadata, freezes proofs and retries failures',async()=>{
  const source=clone(cases.find(item=>item.expected).feed),ids=clone(cases.find(item=>item.expected).identities),originalIds=clone(ids);
  let calls=0;
  const factory=createCachedProjectionFactory(ids,{prepare:async(...args)=>{calls++;return createMarketCatalog(...args);}});
  ids.length=0;
  const [projected,metadata,replayed]=await Promise.all([factory(source),factory.metadata(source),factory(clone(source))]);
  assert.equal(calls,1);assert.deepEqual(projected.index,replayed.index);
  assert.deepEqual(metadata,{schemaVersion:1,hashMethod:HASH_METHOD,catalogHash:projected.index.catalogHash,sourceProjectionHash:projected.index.sourceProjectionHash,sourceUpdatedAt:source.updatedAt,itemCount:source.items.length,identityVersion:await portableHash({hashMethod:HASH_METHOD,identityMap:originalIds})});
  for(const price of [11,12]){const newer=clone(source);newer.items[0].p=price;await factory.metadata(newer);}
  await factory.metadata(source);assert.equal(calls,4,'Only two prepared generations are retained');
  let failures=0;
  const retry=createCachedProjectionFactory([],{prepare:async(...args)=>{if(++failures===1)throw Error('Synthetic preparation failure');return createMarketCatalog(...args);}});
  await assert.rejects(retry.metadata(source));assert.equal((await retry.metadata(source)).itemCount,source.items.length);assert.equal(failures,2);
});
