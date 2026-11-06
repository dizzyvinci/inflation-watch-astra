import {createSharedReadWait,cachedBodyStream} from './bounded-read-flight.mjs';
// WORK-only fixed-route library. No owner/DO, provider fetch, key, SQL or activation.
import {assertSafeItemDto,parseStrictJson,sha256} from './api-price-item-dto.mjs';
import {makePublicItemReference} from './api-item-reference-protocol.mjs';
const PREFIX='_private/provider-api/v1/item-projections/v1/',POINTER=PREFIX+'current.json';
const VERSION='full-item-v1-0bd41244',PROJECTOR='0bd41244adb111eb56d4dfe2ce2a2d4a7204c8c73f303b337af905d4a37c8b40';
const SHA=/^[a-f0-9]{64}$/,enc=new TextEncoder(),size=s=>enc.encode(s).length;
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'};
const fail=()=>{throw Error('invalid_private_projection');};const check=v=>{if(!v)fail();};
const integer=(v,min,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const clock=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const shape=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(','));
const moneyHash=async text=>sha256(enc.encode(text));
function pointerShape(p){shape(p,['schemaVersion','kind','producerVersion','generation','sourceAttemptId','manifestKey','manifestSha256','manifestBytes','itemCount','rawBodySha256','capturedAt','sourceObservedAt','publicationEligible']);check(p.schemaVersion===1&&p.kind==='private_api_item_pointer'&&p.producerVersion===VERSION&&SHA.test(p.generation)&&integer(p.sourceAttemptId,1)&&p.manifestKey===PREFIX+p.generation+'/manifest.json'&&SHA.test(p.manifestSha256)&&integer(p.manifestBytes,1,2097152)&&integer(p.itemCount,1,20000)&&SHA.test(p.rawBodySha256)&&clock(p.capturedAt)&&p.sourceObservedAt===null&&p.publicationEligible===false);return p;}
async function manifestShape(m,p,metadata){
 shape(m,['schemaVersion','kind','producerVersion','projectorSha256','generation','sourceAttemptId','rawReceiptKey','rawBodySha256','requestStartedAt','capturedAt','sourceObservedAt','publicationEligible','metadata','itemCount','totalItemBytes','shards','items']);
 check(m.schemaVersion===1&&m.kind==='private_api_item_manifest'&&m.producerVersion===VERSION&&m.projectorSha256===PROJECTOR&&m.generation===p.generation&&m.sourceAttemptId===p.sourceAttemptId&&m.rawReceiptKey===`_private/provider-api/v1/receipts/${String(p.sourceAttemptId).padStart(12,'0')}-prices-${p.rawBodySha256}.json`&&m.rawBodySha256===p.rawBodySha256&&clock(m.requestStartedAt)&&clock(m.capturedAt)&&m.capturedAt===p.capturedAt&&Date.parse(m.requestStartedAt)<=Date.parse(m.capturedAt)&&m.sourceObservedAt===null&&m.publicationEligible===false&&JSON.stringify(m.metadata)===JSON.stringify(metadata)&&m.itemCount===p.itemCount&&integer(m.totalItemBytes,1,33554432));
 const generation=await moneyHash(JSON.stringify({producerVersion:VERSION,projectorSha256:PROJECTOR,metadata,rawBodySha256:m.rawBodySha256,capturedAt:m.capturedAt,sourceAttemptId:m.sourceAttemptId,requestStartedAt:m.requestStartedAt}));check(generation===p.generation);
 check(Array.isArray(m.shards)&&m.shards.length>0&&m.shards.length<=512&&Array.isArray(m.items)&&m.items.length===m.itemCount);let last=0,total=0;const byId=new Map(),members=new Map();
 for(const [i,d]of m.shards.entries()){shape(d,['ordinal','key','sha256','bytes']);check(d.ordinal===i&&d.key===PREFIX+p.generation+'/shard-'+i+'.json'&&SHA.test(d.sha256)&&integer(d.bytes,1,262144));members.set(i,[]);}
 for(const d of m.items){shape(d,['itemId','shard','bodySha256','bytes']);check(integer(d.itemId,last+1,999999999)&&integer(d.shard,0,m.shards.length-1)&&SHA.test(d.bodySha256)&&integer(d.bytes,1,262144));last=d.itemId;total+=d.bytes;byId.set(d.itemId,d);members.get(d.shard).push(d);}
 check(total===m.totalItemBytes&&[...members.values()].every(a=>a.length>0&&a.length<=64));return {manifest:m,byId,members};
}
async function objectBytes(bucket,key,limit,expectedBytes,hash){
 const o=await bucket.get(key);check(o&&integer(o.size,1,limit)&&(!expectedBytes||o.size===expectedBytes)&&typeof o.arrayBuffer==='function');const bytes=new Uint8Array(await o.arrayBuffer());check(bytes.length===o.size&&bytes.length<=limit&&(!hash||await sha256(bytes)===hash));return bytes;
}
export function createApiItemPriceRoute({bucket,metadata=[],enabled=false,isEnabled=()=>true,now=Date.now,pointerTtlMs=30000,waitMs=2500,maxItems=32,maxCacheBytes=2097152,maxFlights=4,maxRequests=32}={}){
 check(integer(pointerTtlMs,0,60000)&&integer(waitMs,1,10000)&&integer(maxItems,1,64)&&integer(maxCacheBytes,262144,8388608)&&integer(maxFlights,1,8)&&integer(maxRequests,1,64));
 metadata=structuredClone(metadata);if(enabled){check(bucket&&typeof bucket.get==='function'&&Array.isArray(metadata)&&metadata.length>=1&&metadata.length<=4);for(const m of metadata){shape(m,['expectedSha256','sourceUrl','format']);check(SHA.test(m.expectedSha256)&&['cash_client_catalog','noncash_list'].includes(m.format)&&m.sourceUrl===`https://maplestory.io/api/MCW/1/item/list?cashFilter=${m.format==='cash_client_catalog'?'true':'false'}&count=10000`);}metadata=metadata.map(m=>({expectedSha256:m.expectedSha256,sourceUrl:m.sourceUrl,format:m.format}));}
 let current=null,refreshFlight=null,expires=0,retryAt=0,failures=0,healthy=false,requests=0,cacheBytes=0;const items=new Map(),flights=new Map(),shardFailures=new Map(),itemFlights=new Map(),shards=new Map();let shardBytes=0;
 const active=()=>{try{return enabled===true&&isEnabled()===true;}catch{return false;}};
 const guard=()=>check(active());
 const wait=createSharedReadWait(waitMs);
 const remember=(id,record)=>{const prior=items.get(id);if(prior)cacheBytes-=prior.bytes;items.delete(id);items.set(id,record);cacheBytes+=record.bytes;while(items.size>maxItems||cacheBytes>maxCacheBytes){const first=items.keys().next().value;cacheBytes-=items.get(first).bytes;items.delete(first);}};
 const cached=id=>{const r=items.get(id);if(r){items.delete(id);items.set(id,r);}return r;};
 function refresh(){
  if(now()<expires||now()<retryAt)return current;if(refreshFlight)return refreshFlight;
  refreshFlight=(async()=>{try{const bytes=await objectBytes(bucket,POINTER,4096),p=pointerShape(parseStrictJson(bytes));check(Date.parse(p.capturedAt)<=now());
    if(current){check(p.sourceAttemptId>=current.pointer.sourceAttemptId);if(p.sourceAttemptId===current.pointer.sourceAttemptId)check(JSON.stringify(p)===JSON.stringify(current.pointer));}
    let checked=current;if(!current||p.generation!==current.pointer.generation){const b=await objectBytes(bucket,p.manifestKey,2097152,p.manifestBytes,p.manifestSha256);checked={pointer:p,...await manifestShape(parseStrictJson(b),p,metadata)};}
    guard();if(current!==checked){shardFailures.clear();shards.clear();shardBytes=0;}current=checked;healthy=true;failures=0;retryAt=0;expires=now()+pointerTtlMs;return current;
   }catch{healthy=false;retryAt=now()+Math.min(300000,30000*2**Math.min(failures++,4));return current;}finally{refreshFlight=null;}})();return refreshFlight;
 }
 function shard(entry,ordinal){
  const d=entry.manifest.shards[ordinal],key=d.key,stored=shards.get(key);if(stored&&stored.entry===entry&&stored.hash===d.sha256&&stored.bytes===d.bytes){guard();shards.delete(key);shards.set(key,stored);return stored.rows;}if(flights.has(key))return flights.get(key);if((shardFailures.get(key)?.retryAt??0)>now())throw Error('stored_read_backoff');if(flights.size>=maxFlights)throw Error('bounded_read_capacity');
  const flight=(async()=>{const raw=await objectBytes(bucket,d.key,262144,d.bytes,d.sha256),document=parseStrictJson(raw);shape(document,['items']);const expected=entry.members.get(ordinal);check(Array.isArray(document.items)&&document.items.length===expected.length);const result=new Map();
    for(let i=0;i<expected.length;i++){const dto=document.items[i],description=expected[i];assertSafeItemDto(dto);const body=JSON.stringify(dto);check(dto.itemId===description.itemId&&size(body)===description.bytes&&await moneyHash(body)===description.bodySha256&&dto.source.rawBodySha256===entry.pointer.rawBodySha256&&dto.source.retrievedAt===entry.pointer.capturedAt);
      for(const e of dto.identity.evidence)check(metadata.some(m=>m.sourceUrl===e.sourceUrl&&m.expectedSha256===e.retainedMetadataSha256));result.set(dto.itemId,{dto,hash:description.bodySha256});}
    guard();shardFailures.delete(key);if(current===entry){const previous=shards.get(key);if(previous)shardBytes-=previous.bytes;shards.delete(key);shards.set(key,{entry,hash:d.sha256,bytes:d.bytes,rows:result});shardBytes+=d.bytes;while(shards.size>4||shardBytes>1048576){const first=shards.keys().next().value;shardBytes-=shards.get(first).bytes;shards.delete(first);}}return result;})().catch(error=>{const failures=shardFailures.get(key)?.failures??0;shardFailures.delete(key);shardFailures.set(key,{failures:failures+1,retryAt:now()+Math.min(300000,30000*2**Math.min(failures,4))});while(shardFailures.size>64)shardFailures.delete(shardFailures.keys().next().value);throw error;});flights.set(key,flight);flight.finally(()=>{if(flights.get(key)===flight)flights.delete(key);}).catch(()=>{});return flight;
 }
 function item(entry,id){const old=cached(id);if(old?.generation===entry.pointer.generation)return old;
  const description=entry.byId.get(id);if(!description)return null;const key=entry.pointer.generation+':'+id;if(itemFlights.has(key))return itemFlights.get(key);if(itemFlights.size>=64)throw Error('bounded_item_capacity');
  const task=(async()=>{const rows=await wait(shard(entry,description.shard)),row=rows.get(id);check(row);const body=JSON.stringify(await makePublicItemReference(row.dto,entry.pointer.generation,row.hash)),data=enc.encode(body),record={generation:entry.pointer.generation,data,bytes:data.byteLength,capturedAt:row.dto.source.retrievedAt,etag:'"api-item-'+await moneyHash(body)+'"'};guard();
   if(current!==entry)throw Error('generation_changed');remember(id,record);return record;
  })().finally(()=>{if(itemFlights.get(key)===task)itemFlights.delete(key);});itemFlights.set(key,task);return task;
 }

 const response=(request,status,body,extra={})=>new Response(request.method==='HEAD'?null:body,{status,headers:{...HEADERS,...extra}});
 const error=(request,status,code,extra={})=>response(request,status,JSON.stringify({error:code,sourceObservedAt:null,...extra}));
 const serve=(request,record,mode)=>{const headers={ETag:record.etag,'X-Astra-API-Item-Mode':mode,'X-Astra-API-Item-Captured-At':record.capturedAt,'X-Astra-API-Item-Generation':record.generation};if(request.headers.get('If-None-Match')===record.etag)return response(request,304,null,headers);return response(request,200,request.method==='HEAD'?null:cachedBodyStream(record.data),headers);};
 return async function apiItemPriceFetch(request){
  const url=new URL(request.url),match=/^\/api-item-prices\/([1-9][0-9]{0,8})\.json$/.exec(url.pathname);if(!match)return null;
  if(!['GET','HEAD'].includes(request.method))return response(request,405,JSON.stringify({error:'method_not_allowed'}),{Allow:'GET, HEAD'});
  const params=[...url.searchParams];if(params.length>1||params.length===1&&(params[0][0]!=='generation'||!SHA.test(params[0][1])))return error(request,400,'invalid_query');
  if(!active())return error(request,404,'not_published');const id=Number(match[1]),wanted=url.searchParams.get('generation');
  const warm=current&&healthy&&now()<expires,retained=current&&!healthy&&(now()<retryAt||refreshFlight!==null);
  if(warm||retained){if(wanted&&wanted!==current.pointer.generation)return error(request,409,'generation_changed',{generation:current.pointer.generation});if(!current.byId.has(id))return warm?error(request,404,'item_not_in_projection',{generation:current.pointer.generation}):error(request,503,'item_reference_unavailable');const hit=cached(id);if(hit?.generation===current.pointer.generation){if(!active())return error(request,404,'not_published');return serve(request,hit,warm?'validated_cache':'retained');}}
  if(requests>=maxRequests)return error(request,503,'read_capacity');requests++;
  try{let entry;try{entry=await wait(refresh());}catch{healthy=false;}guard();entry??=current;
   let record=null,mode='validated_cache';if(entry){if(wanted&&wanted!==entry.pointer.generation)return error(request,409,'generation_changed',{generation:entry.pointer.generation});
    if(!entry.byId.has(id))return healthy?error(request,404,'item_not_in_projection',{generation:entry.pointer.generation}):error(request,503,'item_reference_unavailable');
    try{record=await wait(item(entry,id));if(current!==entry){entry=current;if(wanted&&wanted!==entry.pointer.generation)return error(request,409,'generation_changed',{generation:entry.pointer.generation});record=await wait(item(entry,id));}if(!healthy)mode='retained';}catch{mode='retained';record=cached(id);}
   }else mode='retained';record??=cached(id);guard();if(!record)return error(request,503,'item_reference_unavailable');if(wanted&&wanted!==record.generation)return error(request,503,'requested_generation_unavailable');
   return serve(request,record,mode);
  }catch{return active()?error(request,503,'item_reference_unavailable'):error(request,404,'not_published');}finally{requests--;}
 };
}
