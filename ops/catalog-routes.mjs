// Own-site catalogue from accepted cached daily data. No provider transport.
// The Worker applies its single outer access gate before invoking this handler.
import { HASH_METHOD, portableHash } from './portable-hash.mjs';

const SOURCE = 'https://maplestory-classic.com/market.json';
const SCOPE = 'public_daily_developer_feed_collection';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
const VERSION = /^[a-f0-9]{16}$/;
const MAX_BYTES = 5_000_000;
const encoder = new TextEncoder();
const contextKeys = ['schemaVersion','hashMethod','kind','sourceScope','sourceUrl','sourceUpdatedAt','sourceUtcDay','sourceProjectionHash','catalogHash','minimumDailyCount'];
const rowKeys = ['slug','name','category','canonicalId','price','priceDay','quantity','publisherMedian','historyDays','qualifyingDays','thinDays','zeroCountDays','carried','partial'];
const summaryKeys = ['sourceUpdatedAt','window','kind','medianSale','p25','p75','lowSale','highSale','medianSellerAsk','listings','sellers','sellThrough','reportedLastSaleAt'];
const select = (value,keys) => Object.fromEntries(keys.filter(key=>Object.hasOwn(value??{},key)).map(key=>[key,value[key]]));
const clone = value => structuredClone(value);
export async function digest(text) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join(''); }

function safeContext(value,kind) {
  if(value?.schemaVersion!==1||value.hashMethod!==HASH_METHOD||value.kind!==kind||value.sourceUrl!==SOURCE||value.sourceScope!==SCOPE||value.minimumDailyCount!==5
    ||!HASH.test(value.sourceProjectionHash)||!HASH.test(value.catalogHash)||!Number.isFinite(Date.parse(value.sourceUpdatedAt)))throw Error('Invalid projection context');
  return select(value,contextKeys);
}
function safeIndex(index,feed) {
  const output=safeContext(index,'daily_market_search_index');
  if(!Array.isArray(index.rows)||index.itemCount!==feed.items.length||index.rows.length!==feed.items.length||index.sourceUpdatedAt!==feed.updatedAt)throw Error('Invalid catalogue scope');
  const bySlug=new Map(feed.items.map(item=>[item.s,item]));
  const seen=new Set();
  output.rows=index.rows.map(row=>{
    const source=bySlug.get(row?.slug);
    if(!source||source.n!==row.name||source.k!==row.category||seen.has(row.slug)||!SLUG.test(row.slug))throw Error('Invalid catalogue identity');
    seen.add(row.slug);return select(row,rowKeys);
  });
  output.itemCount=index.itemCount;
  output.coverage=select(index.coverage,['withQualifiedDailyPrice','withoutQualifiedDailyPrice','withPublisherSummaryMedian','withRetainedDailyHistory']);
  output.identityCoverage=select(index.identityCoverage,['matchedItems','ambiguousItems','ignoredEntries']);
  output.priceKinds=select(index.priceKinds,['price','publisherMedian']);
  for(const key of ['coverageNote','quantityNote'])if(typeof index[key]==='string')output[key]=index[key];
  return output;
}
function safeDetail(detail,row,context,source) {
  const output=safeContext(detail,'daily_market_item_detail');
  if(detail.hashMethod!==context.hashMethod||detail.catalogHash!==context.catalogHash||detail.sourceProjectionHash!==context.sourceProjectionHash||detail.sourceUpdatedAt!==context.sourceUpdatedAt
    ||detail.slug!==row.slug||detail.name!==row.name||detail.canonicalId!==row.canonicalId||!Array.isArray(detail.history)||detail.history.length!==source.h.length)throw Error('Detail binding mismatch');
  Object.assign(output,select(detail,rowKeys));
  output.itemSourceUrl='https://maplestory-classic.com/market/'+row.slug;
  output.sourceSummary=select(detail.sourceSummary,summaryKeys);
  for(const key of ['sourceReportedSales','sourceLowData','reportedLastSaleKind','firstObservedDay','lastHistoryDay','historyDatePrecision'])output[key]=detail[key];
  const pointKeys=['day','median','recordedCount','qualified','quality','partial'];
  output.history=detail.history.map((point,i)=>{
    const raw=source.h[i];
    if(point.day!==raw[0]||point.median!==raw[1]||point.recordedCount!==raw[2]||point.qualified!==(raw[2]>=5))throw Error('Retained history mismatch');
    return select(point,pointKeys);
  });
  for(const key of ['latestDaily','currentQualified'])output[key]=detail[key]===null?null:select(detail[key],pointKeys);
  output.identityProvenance=detail.identityProvenance===null?null:select(detail.identityProvenance,['kind','planHashes']);
  output.limitations=select(detail.limitations,['summaryWindow','dailyCounts','priceDate','partial','quality','scope','metadata']);
  return output;
}

async function readJson(bucket,key) {
  const object=await bucket.get(key);if(!object)return null;
  if(Number.isFinite(object.size)&&object.size>MAX_BYTES)throw Error('Oversized cached object');
  const text=await object.text();if(encoder.encode(text).byteLength>MAX_BYTES)throw Error('Oversized cached object');
  return JSON.parse(text);
}
function validPointer(pointer){return pointer&&VERSION.test(pointer.version)&&pointer.data===`data-${pointer.version}.json`&&Number.isFinite(Date.parse(pointer.sourceUpdatedAt));}
async function acceptedFeed(bucket,pointer) {
  const state=await readJson(bucket,'_private/collector-state.json');
  if(!pointer||!VERSION.test(pointer.version)||pointer.data!==`data-${pointer.version}.json`||!state?.feed||!HASH.test(state.feedHash)
    ||state.feed.updatedAt!==pointer.sourceUpdatedAt||!Array.isArray(state.feed.items))throw Error('No accepted daily snapshot');
  if(state.publishedVersion!==pointer.version&&!(state.cachedUpgradeSourceVersion===pointer.version&&state.cachedUpgradeSourceHash===state.feedHash))throw Error('Staged source was not committed');
  if(await digest(JSON.stringify(state.feed))!==state.feedHash)throw Error('Accepted feed hash mismatch');
  if(state.archivedFeedHash!==undefined||state.archivedSourceKey!==undefined){
    const key=`_private/sources/${state.feed.updatedAt.slice(0,10)}/${state.feedHash}.json`;
    if(state.archivedFeedHash!==state.feedHash||state.archivedSourceKey!==key)throw Error('Archive marker mismatch');
    const archived=await readJson(bucket,key);
    if(archived?.feedHash!==state.feedHash||archived.sourceUpdatedAt!==state.feed.updatedAt||await digest(JSON.stringify(archived.feed))!==state.feedHash)throw Error('Archive mismatch');
  }
  return {feed:state.feed,feedHash:state.feedHash,mode:'accepted_r2',pointerVersion:pointer.version};
}

export function createCatalogRoutes({projectionFactory,compiledFeed,identityMap=[],identityVersion=null,now=Date.now,ttlMs=30000}) {
  if(typeof projectionFactory!=='function'||!compiledFeed)throw Error('A reviewed projection factory and compiled accepted feed are required');
  // Snapshot reviewed proofs once. The full map AND protocol participate in the
  // preparation key, even if a caller forgets to advance an optional label.
  const approvedIdentityMap=clone(identityMap);
  const identityKey=portableHash({hashMethod:HASH_METHOD,identityMap:approvedIdentityMap});
  const scopes=new WeakMap();
  function scopeFor(env){const binding=env.SNAPSHOTS??env;let scope=scopes.get(binding);if(!scope){scope={flight:null,expires:0,current:null,lastGood:null,projects:new Map()};scopes.set(binding,scope);}return scope;}
  async function project(scope,source) {
    const key=source.feedHash+':'+await identityKey+':'+(identityVersion??'');
    if(!scope.projects.has(key)){
      const task=Promise.resolve().then(()=>projectionFactory(clone(source.feed),clone(approvedIdentityMap))).then(factory=>{
        const index=safeIndex(factory.index,source.feed);
        return {index,text:JSON.stringify(index),resolve:factory.resolve,sourceItems:new Map(source.feed.items.map(item=>[item.s,item])),bySlug:new Map(index.rows.map(row=>[row.slug,row])),details:new Map(),detailFlights:new Map()};
      }).catch(error=>{scope.projects.delete(key);throw error;});
      scope.projects.set(key,task);while(scope.projects.size>2)scope.projects.delete(scope.projects.keys().next().value);
    }
    return {...await scope.projects.get(key),mode:source.mode,pointerVersion:source.pointerVersion??null};
  }
  async function load(env) {
    const scope=scopeFor(env);
    if(scope.current&&now()<scope.expires)return scope.current;
    if(scope.flight)return scope.flight;
    scope.flight=(async()=>{
      let projection;
      try{
        if(!env.SNAPSHOTS)throw Error('No snapshot binding');
        const pointer=await readJson(env.SNAPSHOTS,'version.json');
        if(!validPointer(pointer))throw Error('Invalid accepted pointer');
        if(scope.lastGood?.pointerVersion===pointer.version&&scope.lastGood.index.sourceUpdatedAt===pointer.sourceUpdatedAt)projection={...scope.lastGood,mode:'accepted_r2'};
        else projection=await project(scope,await acceptedFeed(env.SNAPSHOTS,pointer));
        scope.lastGood=projection;
      }catch{
        if(scope.lastGood)projection={...scope.lastGood,mode:'retained_accepted_r2'};
        else projection=await project(scope,{feed:compiledFeed,feedHash:await digest(JSON.stringify(compiledFeed)),mode:'compiled_daily_fallback'});
      }
      scope.current=projection;scope.expires=now()+Math.max(0,Math.min(30000,ttlMs));return projection;
    })().finally(()=>{scope.flight=null;});
    return scope.flight;
  }
  function respond(request,value,status=200,etag=null,mode=null,serialized=null) {
    const headers=new Headers({'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store, no-transform','X-Robots-Tag':'noindex, nofollow, noarchive'});
    if(status===405)headers.set('Allow','GET, HEAD');
    if(etag)headers.set('ETag',etag);if(mode)headers.set('X-Catalog-Mode',mode);
    if(status===200&&etag&&request.headers.get('If-None-Match')?.split(',').map(v=>v.trim().replace(/^W\//,'')).includes(etag))return new Response(null,{status:304,headers});
    return new Response(request.method==='HEAD'?null:serialized??JSON.stringify(value),{status,headers});
  }
  async function handle(request,env) {
    if(!['GET','HEAD'].includes(request.method))return respond(request,{error:'method_not_allowed'},405);
    const url=new URL(request.url),match=/^\/market-item\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(url.pathname);
    if(url.pathname!=='/market-index.json'&&!match)return respond(request,{error:'not_found'},404);
    if([...url.searchParams.keys()].some(key=>key!=='catalog')||url.searchParams.getAll('catalog').length>1)return respond(request,{error:'unsupported_parameters'},400);
    const expected=url.searchParams.get('catalog');
    if(match&&(!expected||!HASH.test(expected)))return respond(request,{error:'catalog_hash_required'},400);
    try {
      const generation=await load(env),index=generation.index;
      if(expected&&expected!==index.catalogHash)return respond(request,{error:'catalog_version_changed',catalogHash:index.catalogHash},409,null,generation.mode);
      if(!match)return respond(request,index,200,`"catalog-${index.catalogHash}"`,generation.mode,generation.text);
      const slug=match[1],row=generation.bySlug.get(slug);if(!row)return respond(request,{error:'item_not_in_accepted_collection'},404,null,generation.mode);
      if(!generation.details.has(slug)){
        if(generation.detailFlights.size>=16&&!generation.detailFlights.has(slug))return respond(request,{error:'catalogue_busy'},503);
        if(!generation.detailFlights.has(slug))generation.detailFlights.set(slug,Promise.resolve().then(()=>generation.resolve(slug,index.catalogHash)).then(value=>{
          if(!value)throw Error('Known item detail missing');
          const detail=safeDetail(value,row,index,generation.sourceItems.get(slug));
          generation.details.set(slug,detail);while(generation.details.size>64)generation.details.delete(generation.details.keys().next().value);return detail;
        }).finally(()=>generation.detailFlights.delete(slug)));
        await generation.detailFlights.get(slug);
      }
      return respond(request,generation.details.get(slug),200,`"catalog-${index.catalogHash}:${slug}"`,generation.mode);
    }catch{return respond(request,{error:'catalogue_unavailable'},503);}
  }
  return handle;
}
