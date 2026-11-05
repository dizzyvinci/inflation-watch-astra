(()=>{
'use strict';
// Lazy own-site catalog client; source projections remain version-bound.
// No DOM, provider access, search-query transmission or storage.
const SOURCE = 'https://maplestory-classic.com/market.json';
const SCOPE = 'public_daily_developer_feed_collection';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
const HASH_METHOD='mcat-typed-utf8-f64-v1';
const positive = n => Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER;
const count = n => Number.isSafeInteger(n) && n >= 0;
const id = n => Number.isSafeInteger(n) && n > 0;
const day = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d+'T00:00:00Z')) && new Date(d+'T00:00:00Z').toISOString().slice(0,10) === d;
const stamp = d => typeof d === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(d) && Number.isFinite(Date.parse(d));
const text = (s,n) => typeof s === 'string' && s.trim().length > 0 && s.length <= n && !/[\u0000-\u001f]/.test(s);
const slug = s => typeof s === 'string' && s.length <= 200 && SLUG.test(s);
const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; };
class CatalogError extends Error { constructor(code,message) { super(message); this.code=code; } }
const require = (valid,message,code='INVALID_CATALOG') => { if (!valid) throw new CatalogError(code,message); };
function context(raw,kind) {
  require(raw?.schemaVersion===1 && raw.kind===kind && raw.sourceScope===SCOPE && raw.sourceUrl===SOURCE && raw.minimumDailyCount===5,'Wrong source, schema, grain or qualification contract');
  require(stamp(raw.sourceUpdatedAt) && day(raw.sourceUtcDay) && new Date(raw.sourceUpdatedAt).toISOString().slice(0,10)===raw.sourceUtcDay && raw.hashMethod===HASH_METHOD && HASH.test(raw.sourceProjectionHash) && HASH.test(raw.catalogHash),'Invalid source clock, hash method or catalog hashes');
}
function brief(raw,sourceDay) {
  require(slug(raw?.slug) && text(raw.name,200) && text(raw.category,120) && (raw.canonicalId===null || id(raw.canonicalId)),'Invalid exact identity');
  for (const key of ['historyDays','qualifyingDays','thinDays','zeroCountDays']) require(count(raw[key]),'Invalid history coverage');
  require(raw.historyDays===raw.qualifyingDays+raw.thinDays+raw.zeroCountDays,'History coverage does not add up');
  const qualified=raw.price!==null;
  require(qualified ? positive(raw.price) && day(raw.priceDay) && raw.priceDay<=sourceDay && count(raw.quantity) && raw.quantity>=5 && raw.qualifyingDays>0 : raw.priceDay===null && raw.quantity===null && raw.qualifyingDays===0,'Qualified daily price cannot be replaced by a summary or thin observation');
  require(raw.publisherMedian===null || positive(raw.publisherMedian),'Invalid separately published summary median');
  require(raw.carried===(qualified && raw.priceDay<sourceDay) && raw.partial===(qualified && raw.priceDay===sourceDay),'Incorrect carried/partial flags');
  return Object.fromEntries(['slug','name','category','canonicalId','price','priceDay','quantity','publisherMedian','historyDays','qualifyingDays','thinDays','zeroCountDays','carried','partial'].map(k=>[k,raw[k]]));
}
function validateIndex(raw) {
  context(raw,'daily_market_search_index');
  require(Array.isArray(raw.rows) && raw.rows.length<=10000 && raw.itemCount===raw.rows.length,'Invalid item count');
  require(raw.priceKinds?.price==='latest_qualified_daily_median' && raw.priceKinds?.publisherMedian==='unspecified_window_source_summary','Mixed price bases');
  const rows=raw.rows.map(row=>brief(row,raw.sourceUtcDay)),slugs=new Set(),ids=new Set();
  for (const row of rows) { require(!slugs.has(row.slug),'Duplicate source slug'); slugs.add(row.slug); if(row.canonicalId!==null){require(!ids.has(row.canonicalId),'Ambiguous reviewed item ID');ids.add(row.canonicalId);} }
  require(raw.coverage?.withQualifiedDailyPrice===rows.filter(r=>r.price!==null).length && raw.coverage?.withoutQualifiedDailyPrice===rows.filter(r=>r.price===null).length,'Incorrect qualification totals');
  return freeze({schemaVersion:1,kind:raw.kind,sourceScope:SCOPE,sourceUrl:SOURCE,sourceUpdatedAt:raw.sourceUpdatedAt,sourceUtcDay:raw.sourceUtcDay,hashMethod:HASH_METHOD,sourceProjectionHash:raw.sourceProjectionHash,catalogHash:raw.catalogHash,minimumDailyCount:5,itemCount:rows.length,coverage:{...raw.coverage},rows});
}
function validateDetail(raw,index,expectedSlug) {
  context(raw,'daily_market_item_detail');
  require(raw.hashMethod===index.hashMethod && raw.catalogHash===index.catalogHash && raw.sourceProjectionHash===index.sourceProjectionHash && raw.sourceUpdatedAt===index.sourceUpdatedAt,'Index/detail versions differ','VERSION_MISMATCH');
  const row=index.rows.find(r=>r.slug===expectedSlug); require(row,'Unknown exact provider slug','NOT_FOUND');
  const identity=brief(raw,index.sourceUtcDay);require(identity.slug===row.slug && identity.name===row.name && identity.canonicalId===row.canonicalId && identity.category===row.category,'Detail identity differs from the selected record');
  for(const key of ['price','priceDay','quantity','publisherMedian','historyDays','qualifyingDays','thinDays','zeroCountDays','carried','partial'])require(identity[key]===row[key],'Index/detail price or coverage differs');
  require(raw.historyDatePrecision==='UTC_calendar_day' && Array.isArray(raw.history) && raw.history.length===row.historyDays && raw.history.length<=10000,'Invalid daily-history contract');
  let previous='';const history=raw.history.map(p=>{require(day(p.day)&&p.day>previous&&p.day<=index.sourceUtcDay&&positive(p.median)&&count(p.recordedCount),'Invalid/duplicate/future source day');previous=p.day;require(p.qualified===(p.recordedCount>=5)&&p.quality===(p.recordedCount>=5?'qualified':p.recordedCount>0?'thin':'zero_count')&&p.partial===(p.day===index.sourceUtcDay),'Thin/zero-count record mislabeled as qualified');return {day:p.day,median:p.median,recordedCount:p.recordedCount,qualified:p.qualified,quality:p.quality,partial:p.partial};});
  const qualified=history.filter(p=>p.qualified),latest=qualified.at(-1);
  require(qualified.length===row.qualifyingDays && history.filter(p=>p.recordedCount>0&&p.recordedCount<5).length===row.thinDays && history.filter(p=>p.recordedCount===0).length===row.zeroCountDays && (latest?latest.median===row.price&&latest.day===row.priceDay&&latest.recordedCount===row.quantity:row.price===null),'Qualified price does not match its actual retained source day');
  require(raw.sourceSummary?.kind==='source_published_summary' && raw.sourceSummary.window==='unspecified_source_summary' && raw.sourceSummary.sourceUpdatedAt===index.sourceUpdatedAt,'Missing separate source-summary basis');
  const summary={kind:'source_published_summary',window:'unspecified_source_summary',sourceUpdatedAt:index.sourceUpdatedAt};
  for(const key of ['medianSale','p25','p75','lowSale','highSale','medianSellerAsk'])summary[key]=positive(raw.sourceSummary[key])?raw.sourceSummary[key]:null;
  for(const key of ['listings','sellers'])summary[key]=count(raw.sourceSummary[key])?raw.sourceSummary[key]:null;
  summary.sellThrough=Number.isFinite(raw.sourceSummary.sellThrough)&&raw.sourceSummary.sellThrough>=0&&raw.sourceSummary.sellThrough<=1?raw.sourceSummary.sellThrough:null;
  summary.reportedLastSaleAt=stamp(raw.sourceSummary.reportedLastSaleAt)?raw.sourceSummary.reportedLastSaleAt:null;
  return freeze({...identity,kind:raw.kind,hashMethod:HASH_METHOD,catalogHash:index.catalogHash,sourceProjectionHash:index.sourceProjectionHash,sourceUpdatedAt:index.sourceUpdatedAt,sourceUtcDay:index.sourceUtcDay,historyDatePrecision:'UTC_calendar_day',history,sourceSummary:summary,itemSourceUrl:'https://maplestory-classic.com/market/'+identity.slug,sourceReportedSales:count(raw.sourceReportedSales)?raw.sourceReportedSales:null,identityProvenance:raw.identityProvenance??null});
}
function createMarketCatalogClient({fetchImpl=globalThis.fetch,onResponse=()=>true,maxCachedItems=32}={}) {
  require(typeof fetchImpl==='function' && Number.isInteger(maxCachedItems) && maxCachedItems>0 && maxCachedItems<=100,'Invalid client configuration');
  let index=null,indexPending=null;const cached=new Map(),pending=new Map();
  async function read(url,{cache='no-cache',limit=650000}={}) {
    // Only these constructed relative URLs ever reach fetch. No source URL,
    // entered search query, authentication token or external path is accepted.
    const response=await fetchImpl(url,{credentials:'same-origin',cache,redirect:'error',headers:{Accept:'application/json'},signal:typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(12000):undefined});
    if(onResponse(response)===false || response.status===401)throw new CatalogError('AUTH_REQUIRED','Preview session expired; unlock the site to continue');
    if(response.status===409 || response.status===412)throw new CatalogError('VERSION_MISMATCH','Catalog changed during item lookup');
    if(response.status===404)throw new CatalogError('NOT_FOUND','No record for that exact provider slug');
    require(response.ok,'Own-site catalog temporarily unavailable','HTTP_ERROR');
    require(/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''),'Expected JSON; login HTML or a different document is not market data');
    const body=await response.text();require(body.length<=limit,'Own-site catalog exceeds the agreed size bound');
    try{return JSON.parse(body);}catch{throw new CatalogError('INVALID_CATALOG','Malformed own-site catalog JSON');}
  }
  async function loadIndex({force=false}={}) {
    if(indexPending)return indexPending;if(index&&!force)return index;
    indexPending=(async()=>{const next=validateIndex(await read('/market-index.json'));if(index?.catalogHash!==next.catalogHash)cached.clear();index=next;return index;})().finally(()=>{indexPending=null;});return indexPending;
  }
  function oneItem(current,key) {
    const cacheKey=current.catalogHash+':'+key;
    if(cached.has(cacheKey)){const result=cached.get(cacheKey);cached.delete(cacheKey);cached.set(cacheKey,result);return Promise.resolve(result);}
    if(pending.has(cacheKey))return pending.get(cacheKey);
    const task=(async()=>{const raw=await read('/market-item/'+encodeURIComponent(key)+'.json?catalog='+current.catalogHash,{cache:'force-cache',limit:300000}),result=validateDetail(raw,current,key);require(index.catalogHash===current.catalogHash,'Index changed while loading item','VERSION_MISMATCH');cached.set(cacheKey,result);while(cached.size>maxCachedItems)cached.delete(cached.keys().next().value);return result;})().finally(()=>{pending.delete(cacheKey);});pending.set(cacheKey,task);return task;
  }
  async function getItem(key) {
    require(slug(key),'Use an exact provider slug, never a name, alias, ID or path','INVALID_SLUG');
    for(let attempt=0;attempt<2;attempt++){const current=await loadIndex();require(current.rows.some(r=>r.slug===key),'Unknown exact provider slug','NOT_FOUND');try{return await oneItem(current,key);}catch(error){if(error.code!=='VERSION_MISMATCH'||attempt===1)throw error;await loadIndex({force:true});}}
  }
  function bindSearch({inputs=[],routeTarget,readHash=()=>'',onReady=()=>{},onError=()=>{}}={}) {
    const demand=()=>{void loadIndex().then(onReady,onError);};
    for(const input of inputs)input.addEventListener('focus',demand);
    const route=()=>{if(readHash()==='#price-check')demand();};routeTarget?.addEventListener('hashchange',route);route();
    return()=>{for(const input of inputs)input.removeEventListener('focus',demand);routeTarget?.removeEventListener('hashchange',route);};
  }
  return Object.freeze({loadIndex,getItem,bindSearch,peek:()=>index,cacheSize:()=>cached.size});
}
// Merge into the existing price-check records/table, never a parallel table.
// Existing fields keep independent rolling/metadata evidence and verified NX costs.
function mergeSearchRecords(existing,index) {
  const consumed=new Set(),result=[];
  for(const row of index.rows){
    const exact=existing.map((record,i)=>({record,i})).filter(({record})=>(record.sourceSlug||record.slug)===row.slug);
    const verified=exact.length?[]:row.canonicalId===null?[]:existing.map((record,i)=>({record,i})).filter(({record})=>record.id===row.canonicalId&&record.name===row.name&&!record.slug);
    const matches=exact.length?exact:verified;require(matches.length<=1,'Ambiguous existing source identity');const previous=matches[0]?.record??{};if(matches.length)consumed.add(matches[0].i);
    if(matches.length)require(previous.name===row.name,'Same slug with a conflicting name cannot silently merge');
    const evidenceDate=(row.priceDay?'Qualified daily price · '+row.priceDay+(row.carried?' · carried':''):'No qualifying daily price · '+row.thinDays+' thin / '+row.zeroCountDays+' zero-count source days')+(previous.rollingReference?' · separate rolling median captured '+previous.rollingReference.capturedAt:'')+(previous.metadataDate?' · metadata receipt '+previous.metadataDate:'');
    result.push({...previous,key:row.slug,slug:row.slug,sourceSlug:row.slug,id:row.canonicalId??previous.id??null,name:row.name,sourceCategory:row.category,price:row.price,priceDay:row.priceDay,quantity:row.quantity,publisherMedian:row.publisherMedian,historyDays:row.historyDays,qualifyingDays:row.qualifyingDays,thinDays:row.thinDays,zeroCountDays:row.zeroCountDays,carried:row.carried,partial:row.partial,metadata:false,hasMetadata:previous.metadata===true||previous.hasMetadata===true,knownNxCost:previous.knownNxCost??null,dailyRate:positive(previous.knownNxCost)&&row.price!==null?row.price/previous.knownNxCost:null,lazyDetail:true,type:'Provider daily · '+row.category+(row.price===null?' · no qualifying price':' · qualified price'),catalog:previous.catalog??false,catalogHash:index.catalogHash,sourceUpdatedAt:index.sourceUpdatedAt,evidenceDate});
  }
  for(let i=0;i<existing.length;i++)if(!consumed.has(i))result.push({...existing[i]});return result;
}
// Input for the existing generic item renderer. Qualified graph points stay
// separate from all retained thin/zero rows, which must remain available in its table.
function toItemModel(detail) {
  return {catalogDetail:true,lazyDailyDetail:true,slug:detail.slug,canonicalId:detail.canonicalId,name:detail.name,sourceUpdatedAt:detail.sourceUpdatedAt,source:{slug:detail.slug,name:detail.name,category:detail.category,sourceUpdatedAt:detail.sourceUpdatedAt,sourceSummary:detail.sourceSummary,knownNxCost:null,partial:detail.partial,priceDay:detail.priceDay},history:detail.history.filter(p=>p.qualified).map(p=>[p.day,p.median,p.recordedCount]),reportedHistory:detail.history,summaryBasis:'unspecified_source_summary',metadata:null,supplemental:null,notIndexed:true,hashMethod:detail.hashMethod,catalogHash:detail.catalogHash,sourceProjectionHash:detail.sourceProjectionHash};
}

  const client=createMarketCatalogClient({fetchImpl:(...args)=>window.fetch(...args),onResponse:response=>window.astraPreviewSession?.onResponse(response)!==false});
  const models=new Map();
  function hasVersionedReport(report){const meta=report?.marketCatalog;return meta?.schemaVersion===1&&meta.hashMethod===HASH_METHOD&&HASH.test(meta.catalogHash)&&HASH.test(meta.sourceProjectionHash)&&HASH.test(meta.identityVersion)&&count(meta.itemCount)&&meta.sourceUpdatedAt===report.sourceUpdatedAt&&stamp(meta.sourceUpdatedAt);}
  function matchesReport(report,value){const meta=report?.marketCatalog;return hasVersionedReport(report)&&value?.hashMethod===meta.hashMethod&&value.catalogHash===meta.catalogHash&&value.sourceProjectionHash===meta.sourceProjectionHash&&value.sourceUpdatedAt===meta.sourceUpdatedAt&&(value.itemCount===undefined||value.itemCount===meta.itemCount);}
  function peekItem(route){const current=client.peek();if(!current)return null;const direct=models.get(route);if(direct?.catalogHash===current.catalogHash)return direct;const match=/^id-([1-9]\d*)$/.exec(route||'');if(!match)return null;const candidates=[...models.values()].filter(m=>m.catalogHash===current.catalogHash&&m.canonicalId===Number(match[1]));return candidates.length===1?candidates[0]:null;}
  async function loadItem(route,report){require(hasVersionedReport(report),'Awaiting the versioned full catalog','REPORT_PENDING');let index=client.peek();index=await client.loadIndex({force:!!index&&!matchesReport(report,index)});require(matchesReport(report,index),'Catalog and report versions differ','VERSION_MISMATCH');let exact=index.rows.find(row=>row.slug===route);if(!exact){const match=/^id-([1-9]\d*)$/.exec(route||'');const ids=match?index.rows.filter(row=>row.canonicalId===Number(match[1])):[];if(ids.length===1)exact=ids[0];}if(!exact)throw new CatalogError('NOT_FOUND','No collected exact provider record');const detail=await client.getItem(exact.slug);require(matchesReport(report,detail),'Catalog and report versions differ','VERSION_MISMATCH');const model=toItemModel(detail);for(const [key,old]of models)if(old.catalogHash!==detail.catalogHash)models.delete(key);models.delete(model.slug);models.set(model.slug,model);while(models.size>32)models.delete(models.keys().next().value);return model;}
  window.AstraFullMarket=Object.freeze({client,mergeSearchRecords,toItemModel,peekItem,loadItem,hasVersionedReport,matchesReport});

})();
