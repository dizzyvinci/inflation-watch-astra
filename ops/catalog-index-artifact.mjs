// Immutable sanitized index artifacts. No provider transport, auth or raw feed.
// Invoke the reader only behind the Worker's outer access gate.
import {HASH_METHOD,codepointCompare} from './portable-hash.mjs';
const SOURCE='https://maplestory-classic.com/market.json',SCOPE='public_daily_developer_feed_collection';
const HASH=/^[a-f0-9]{64}$/,VERSION=/^[a-f0-9]{16}$/,SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_CATALOG_INDEX_BYTES=1048576;
const META=['schemaVersion','hashMethod','catalogHash','sourceProjectionHash','sourceUpdatedAt','itemCount','identityVersion'];
const CONTEXT=['schemaVersion','hashMethod','kind','sourceScope','sourceUrl','sourceUpdatedAt','sourceUtcDay','sourceProjectionHash','catalogHash','minimumDailyCount'];
const ROW=['slug','name','category','canonicalId','price','priceDay','quantity','publisherMedian','historyDays','qualifyingDays','thinDays','zeroCountDays','carried','partial'];
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const count=value=>Number.isSafeInteger(value)&&value>=0;
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=Number.MAX_SAFE_INTEGER;
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const sameMeta=(left,right)=>META.every(key=>left[key]===right[key]);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&Array.from(value).length<=max&&!/[\u0000-\u001f]/.test(value);
function day(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export async function indexArtifactDigest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof bytes==='string'?encoder.encode(bytes):bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');}
export function validateCatalogMetadata(meta){
  if(!exact(meta,META)||meta.schemaVersion!==1||meta.hashMethod!==HASH_METHOD||!HASH.test(meta.catalogHash)||!HASH.test(meta.sourceProjectionHash)
    ||!HASH.test(meta.identityVersion)||!count(meta.itemCount)||meta.itemCount>20000||typeof meta.sourceUpdatedAt!=='string'
    ||!/(?:Z|[+-]\d\d:\d\d)$/.test(meta.sourceUpdatedAt)||!Number.isFinite(Date.parse(meta.sourceUpdatedAt)))throw Error('Invalid catalogue metadata');
  return meta;
}
export function validateCatalogIndex(index,metadata){
  const meta=validateCatalogMetadata(metadata);
  if(!exact(index,[...CONTEXT,'rows','itemCount','coverage','identityCoverage','priceKinds','coverageNote','quantityNote'])
    ||index.schemaVersion!==1||index.hashMethod!==HASH_METHOD||index.kind!=='daily_market_search_index'||index.sourceScope!==SCOPE||index.sourceUrl!==SOURCE||index.minimumDailyCount!==5
    ||index.catalogHash!==meta.catalogHash||index.sourceProjectionHash!==meta.sourceProjectionHash||index.sourceUpdatedAt!==meta.sourceUpdatedAt
    ||index.sourceUtcDay!==new Date(meta.sourceUpdatedAt).toISOString().slice(0,10)||index.itemCount!==meta.itemCount||!Array.isArray(index.rows)||index.rows.length!==meta.itemCount)throw Error('Invalid index artifact context');
  let previous='',qualified=0,summary=0,history=0,matched=0;
  const ids=new Set();
  for(const row of index.rows){
    if(!exact(row,ROW)||typeof row.slug!=='string'||row.slug.length>200||!SLUG.test(row.slug)||codepointCompare(row.slug,previous)<=0
      ||!text(row.name,200)||!text(row.category,120)||!(row.canonicalId===null||count(row.canonicalId)&&row.canonicalId>0)
      ||![row.historyDays,row.qualifyingDays,row.thinDays,row.zeroCountDays].every(count)
      ||row.qualifyingDays+row.thinDays+row.zeroCountDays!==row.historyDays||typeof row.carried!=='boolean'||typeof row.partial!=='boolean'
      ||!(row.publisherMedian===null||positive(row.publisherMedian)))throw Error('Invalid index artifact row');
    previous=row.slug;
    if(row.price===null){if(row.priceDay!==null||row.quantity!==null||row.qualifyingDays!==0||row.carried||row.partial)throw Error('Invalid unqualified index row');}
    else{
      if(!positive(row.price)||!count(row.quantity)||row.quantity<5||!day(row.priceDay)||row.priceDay>index.sourceUtcDay||row.qualifyingDays<1
        ||row.carried!==(row.priceDay<index.sourceUtcDay)||row.partial!==(row.priceDay===index.sourceUtcDay))throw Error('Invalid qualified index row');
      qualified++;
    }
    if(row.publisherMedian!==null)summary++;
    if(row.historyDays>0)history++;
    if(row.canonicalId!==null){if(ids.has(row.canonicalId))throw Error('Duplicate index identity');ids.add(row.canonicalId);matched++;}
  }
  if(!exact(index.coverage,['withQualifiedDailyPrice','withoutQualifiedDailyPrice','withPublisherSummaryMedian','withRetainedDailyHistory'])
    ||index.coverage.withQualifiedDailyPrice!==qualified||index.coverage.withoutQualifiedDailyPrice!==index.itemCount-qualified
    ||index.coverage.withPublisherSummaryMedian!==summary||index.coverage.withRetainedDailyHistory!==history
    ||!exact(index.identityCoverage,['matchedItems','ambiguousItems','ignoredEntries'])||!Object.values(index.identityCoverage).every(count)||index.identityCoverage.matchedItems!==matched
    ||!exact(index.priceKinds,['price','publisherMedian'])||index.priceKinds.price!=='latest_qualified_daily_median'||index.priceKinds.publisherMedian!=='unspecified_window_source_summary'
    ||index.coverageNote!=='All items in this accepted public daily provider collection, including thin and unqualified records; not every game item or every trade. No MPI membership or weight is assigned.'
    ||index.quantityNote!=='Provider-recorded daily counts; exact stack/bundle-versus-unit semantics are not independently verified.')throw Error('Invalid index artifact coverage');
  return index;
}
function artifactKey(meta,sha){return `_private/catalog-index/v1/${meta.catalogHash}/${meta.identityVersion}/${sha}.json`;}
export function validateCatalogIndexDescriptor(pointer,identityVersion){
  const meta=validateCatalogMetadata(pointer?.marketCatalog),descriptor=pointer.catalogIndexArtifact;
  if(!VERSION.test(pointer.version)||pointer.data!==`data-${pointer.version}.json`||pointer.sourceUpdatedAt!==meta.sourceUpdatedAt||meta.identityVersion!==identityVersion
    ||!exact(descriptor,['schemaVersion','kind','key','sha256','bytes','marketCatalog'])||descriptor.schemaVersion!==1||descriptor.kind!=='daily_market_index_artifact'
    ||!HASH.test(descriptor.sha256)||!count(descriptor.bytes)||descriptor.bytes<2||descriptor.bytes>MAX_CATALOG_INDEX_BYTES
    ||!sameMeta(validateCatalogMetadata(descriptor.marketCatalog),meta)||descriptor.key!==artifactKey(meta,descriptor.sha256))throw Error('Invalid index artifact binding');
  return descriptor;
}
export async function writeCatalogIndexArtifact(bucket,index,metadata,{previous=null,beforeWrite=async()=>{}}={}){
  validateCatalogIndex(index,metadata);
  const serialized=JSON.stringify(index),bytes=encoder.encode(serialized);
  if(bytes.byteLength>MAX_CATALOG_INDEX_BYTES)throw Error('Oversized index artifact');
  const sha256=await indexArtifactDigest(bytes);
  const descriptor={schemaVersion:1,kind:'daily_market_index_artifact',key:artifactKey(metadata,sha256),sha256,bytes:bytes.byteLength,marketCatalog:structuredClone(metadata)};
  // Previously committed descriptor proves this exact artifact was published.
  // Do not rewrite it for unchanged polls/reference-only report publications.
  if(previous&&JSON.stringify(previous)===JSON.stringify(descriptor))return descriptor;
  await beforeWrite();
  const written=await bucket.put(descriptor.key,serialized,{httpMetadata:{contentType:'application/json; charset=utf-8'},onlyIf:new Headers({'If-None-Match':'*'})});
  if(!written){
    const existing=await readObject(bucket,descriptor.key,descriptor.bytes);
    if(existing!==serialized)throw Error('Immutable catalogue artifact conflict');
  }
  return descriptor;
}
async function boundedText(response,expected){
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_CATALOG_INDEX_BYTES||size>expected){await reader.cancel();throw Error('Oversized index artifact');}chunks.push(value);}}
  finally{reader.releaseLock();}
  if(size!==expected)throw Error('Index artifact length mismatch');
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return decoder.decode(bytes);
}
async function readObject(bucket,key,expected){
  const object=await bucket.get(key);if(!object)throw Error('Missing index artifact');
  if(Number.isFinite(object.size)&&object.size!==expected)throw Error('Index artifact size mismatch');
  // R2 object bodies are streaming; the text-only branch supports bounded fakes.
  if(object.body)return boundedText(new Response(object.body),expected);
  const value=await object.text();if(encoder.encode(value).byteLength!==expected||expected>MAX_CATALOG_INDEX_BYTES)throw Error('Index artifact size mismatch');return value;
}
export function createCatalogIndexArtifactReader(){
  const scopes=new WeakMap();
  async function read(bucket,pointer,identityVersion){
    const descriptor=validateCatalogIndexDescriptor(pointer,identityVersion);
    const cache=globalThis.caches?.default;
    // Synthetic key never takes visitor query/cookie/auth input. Content SHA,
    // full generation and compiled proof identity prevent cross-generation joins.
    const key=new Request(`https://inflation.gg/__catalog_index_cache/v1/${descriptor.marketCatalog.catalogHash}/${identityVersion}/${descriptor.sha256}.json`);
    async function validate(serialized){
      if(await indexArtifactDigest(serialized)!==descriptor.sha256)throw Error('Index artifact hash mismatch');
      const index=validateCatalogIndex(JSON.parse(serialized),descriptor.marketCatalog);
      return {index,text:serialized};
    }
    try{
      const hit=await cache?.match(key);
      if(hit?.status===200&&hit.headers.get('Content-Type')==='application/json'&&!hit.headers.has('Set-Cookie'))return await validate(await boundedText(hit,descriptor.bytes));
    }catch{/* Cache outages or corrupt cached bytes fall back to private R2. */}
    const result=await validate(await readObject(bucket,descriptor.key,descriptor.bytes));
    if(cache){try{await cache.put(key,new Response(result.text,{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=86400, no-transform'}}));}catch{/* Internal cache is best effort, never acceptance state. */}}
    return result;
  }
  return async(bucket,pointer,identityVersion)=>{
    const descriptor=validateCatalogIndexDescriptor(pointer,identityVersion);
    let flights=scopes.get(bucket);if(!flights){flights=new Map();scopes.set(bucket,flights);}
    const key=descriptor.sha256+':'+identityVersion+':'+JSON.stringify(descriptor.marketCatalog);
    if(flights.has(key))return flights.get(key);
    const task=Promise.resolve().then(()=>read(bucket,pointer,identityVersion));
    if(flights.size>=16)return task;
    const shared=task.finally(()=>{if(flights.get(key)===shared)flights.delete(key);});flights.set(key,shared);return shared;
  };
}
