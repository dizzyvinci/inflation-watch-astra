// WORK-only typed HTTP adapter. No worker binding, provider/raw receipt, SQL or timer cadence.
import {createFastCurrentItemReader} from './api-fast-current-item-reader.mjs';
import {sha256} from './api-price-item-dto.mjs';
import {validatePublicItemReference} from './api-item-reference-protocol.mjs';
import {makeFastItemHeaders,makeFastItemError,validPublicEpoch} from './api-fast-item-public-protocol.mjs';
const enc=new TextEncoder(),HASH=/^[a-f0-9]{64}$/,PATH=/^\/api-item-prices\/([1-9][0-9]{0,8})\.json$/;
const BASE={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'};
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const need=v=>{if(!v)throw Error('fast_public_reference_unavailable');};
const clock=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
function response(request,status,body,extra={}){const bytes=typeof body==='string'?enc.encode(body):body;return new Response(request.method==='HEAD'||status===304?null:bytes,{status,headers:{...BASE,...(status===304?{}:{'Content-Length':String(bytes?.length??0)}),...extra}});}
const error=(request,status,code,extra={})=>response(request,status,JSON.stringify({error:code,sourceObservedAt:null,...extra}));
export function createFastCurrentPublicItemPriceRoute({bucket,scope,metadata,publicEpoch,enabled=false,isEnabled=()=>true,now=Date.now,monotonicNow=()=>performance.now(),waitMs=2500,ttlMs=30000,maxItems=32,maxCacheBytes=2097152,maxRequests=32,readerFactory=createFastCurrentItemReader}={}){
 // Default Off never inspects bucket, scope, metadata, reader or optional callback.
 if(enabled!==true)return Object.freeze(request=>new URL(request.url).pathname.startsWith('/api-item-prices/')?error(request,404,'not_published'):null);
 need(typeof isEnabled==='function'&&typeof now==='function'&&typeof monotonicNow==='function'&&typeof readerFactory==='function');
  need(validPublicEpoch(publicEpoch));
 need(integer(waitMs,1,10000)&&integer(ttlMs,0,30000)&&integer(maxItems,1,32)&&integer(maxCacheBytes,300000,2097152)&&integer(maxRequests,1,32));
 scope=structuredClone(scope);metadata=structuredClone(metadata);
 let on=true,observedOn=false,epoch=0,reader=null,cacheBytes=0,requests=0,latest=null,pointerExpires=0,healthy=false;
 const cache=new Map(),flights=new Map(),failures=new Map();
 const external=()=>{try{return on&&isEnabled()===true;}catch{return false;}};
 function invalidate(){epoch++;cache.clear();cacheBytes=0;latest=null;pointerExpires=0;healthy=false;failures.clear();reader?.setEnabled(false);}
 function active(){const current=external();if(current!==observedOn){invalidate();observedOn=current;if(current)reader?.setEnabled(true);}return current;}
 function setEnabled(value){on=value===true;invalidate();observedOn=external();if(observedOn)reader?.setEnabled(true);}
 function getReader(){if(!reader)reader=readerFactory({bucket,scope,metadata,enabled:true,isEnabled:external,now,waitMs});return reader;}
 function fence(c){need(active()&&c.epoch===epoch&&!c.cancelled&&monotonicNow()<c.deadline);}
 function evidence(value){const source=value.status==='validated'?value.reference?.sourceCapturedAt:value.sourceCapturedAt,generation=value.status==='validated'?value.reference?.projectionGeneration:value.generation;need(HASH.test(generation)&&clock(source)&&Date.parse(source)<=now()&&integer(value.publicationOrdinal,1,Number.MAX_SAFE_INTEGER));return{generation,capturedAt:source,ordinal:value.publicationOrdinal};}
 function monotonic(next){if(!latest)return;need(next.ordinal>=latest.ordinal&&Date.parse(next.capturedAt)>=Date.parse(latest.capturedAt));if(next.ordinal===latest.ordinal)need(next.generation===latest.generation&&next.capturedAt===latest.capturedAt);}
 function remember(id,record){const old=cache.get(id);if(old)cacheBytes-=old.bytes;cache.delete(id);cache.set(id,record);cacheBytes+=record.bytes;while(cache.size>maxItems||cacheBytes>maxCacheBytes){const first=cache.keys().next().value;cacheBytes-=cache.get(first).bytes;cache.delete(first);}}
 function accepted(c,id,result,record){fence(c);monotonic(record);latest={generation:record.generation,capturedAt:record.capturedAt,ordinal:record.ordinal};healthy=true;pointerExpires=now()+ttlMs;record.expires=pointerExpires;record.kind=result;remember(id,record);failures.delete(id);return{kind:result,record};}
 async function ordered(c,source,raw){const bodySha256=await sha256(raw);fence(c);const headers=await makeFastItemHeaders({epoch:publicEpoch,revision:source.ordinal,generation:source.generation,capturedAt:source.capturedAt,bodySha256},{now:now()});fence(c);return{raw,bytes:raw.length,etag:'"api-item-'+bodySha256+'"',headers};}
 async function perform(c,id){
  const result=await getReader().read(id);fence(c);need(['validated','not_in_projection'].includes(result.status));const source=evidence(result);monotonic(source);
  if(result.status==='not_in_projection'){const raw=makeFastItemError('membership_absent',{itemId:id,generation:source.generation,capturedAt:source.capturedAt});return accepted(c,id,'missing',{...source,...await ordered(c,source,raw)});}
  need(result.reference?.itemId===id&&result.reference.sourceCapturedAt===source.capturedAt);
  // The production reader already validates the closed public DTO and all siblings.
  // Own serialized public bytes before awaiting their HTTP hash; no raw source parse.
  const reference=await validatePublicItemReference(result.reference);fence(c);
  const raw=enc.encode(JSON.stringify(reference));need(raw.length>0&&raw.length<=300000);const publication=await ordered(c,source,raw);fence(c);monotonic(source);
  return accepted(c,id,'item',{...source,...publication});
 }
 function load(id){
  if(flights.has(id))return flights.get(id).visible;
  if(flights.size>=maxItems)return Promise.resolve({kind:'unavailable'});
  const c={epoch,cancelled:false,deadline:monotonicNow()+waitMs},slot={visible:null};let timer;
  const task=perform(c,id).catch(()=>{if(c.epoch===epoch&&active()){healthy=false;const prior=failures.get(id)?.count??0;failures.delete(id);failures.set(id,{count:prior+1,retryAt:now()+Math.min(300000,30000*2**Math.min(prior,4))});while(failures.size>64)failures.delete(failures.keys().next().value);}return{kind:'unavailable'};});
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>{c.cancelled=true;if(c.epoch===epoch)healthy=false;resolve({kind:'unavailable'});},waitMs);});
  slot.visible=Promise.race([task,timeout]).finally(()=>clearTimeout(timer));flights.set(id,slot);
  // Keep a pending serializer/hash keyed until it settles. Underlying SDK/cancel
  // reservations remain in the accepted reader's shared per-bucket pool.
  task.finally(()=>{if(flights.get(id)===slot)flights.delete(id);}).catch(()=>{});return slot.visible;
 }
 const fresh=()=>healthy&&latest&&now()<pointerExpires;
 function serve(request,record,mode){const headers={...record.headers,ETag:record.etag,'X-Astra-API-Item-Mode':mode,'X-Astra-API-Item-Captured-At':record.capturedAt,'X-Astra-API-Item-Generation':record.generation};if(record.kind==='missing')return response(request,404,record.raw.slice(),headers);if(request.headers.get('If-None-Match')===record.etag)return response(request,304,null,headers);return response(request,200,record.raw.slice(),headers);}
 async function changed(request,id,requestEpoch){const c={epoch:requestEpoch,cancelled:false,deadline:monotonicNow()+waitMs};try{const source={...latest},raw=makeFastItemError('generation_changed',{itemId:id,generation:source.generation,capturedAt:source.capturedAt}),r=await ordered(c,source,raw);fence(c);monotonic(source);return response(request,409,r.raw,{...r.headers,ETag:r.etag,'X-Astra-API-Item-Generation':source.generation,'X-Astra-API-Item-Captured-At':source.capturedAt});}catch{return error(request,503,'item_reference_unavailable');}}
 async function route(request){
  const url=new URL(request.url);if(!url.pathname.startsWith('/api-item-prices/'))return null;
  if(!active())return error(request,404,'not_published');const requestEpoch=epoch,match=PATH.exec(url.pathname);if(!match)return error(request,404,'not_found');
  if(!['GET','HEAD'].includes(request.method))return response(request,405,'',{Allow:'GET, HEAD'});
  const params=[...url.searchParams];if(params.length>1||params.length===1&&(params[0][0]!=='generation'||!HASH.test(params[0][1])))return error(request,400,'invalid_query');
  const id=Number(match[1]),wanted=url.searchParams.get('generation');
  if(fresh()&&wanted&&wanted!==latest.generation)return changed(request,id,requestEpoch);
  let record=cache.get(id),mode='validated_cache',observed=false;const prior=record?.kind==='item'?record:null;
  if(!(fresh()&&record&&record.generation===latest.generation&&now()<record.expires&&!failures.has(id))){
   if(requests>=maxRequests)return error(request,503,'read_capacity');requests++;
   try{const result=(failures.get(id)?.retryAt??0)>now()?{kind:'unavailable'}:await load(id);if(!active())return error(request,404,'not_published');
    if(result.kind==='item'||result.kind==='missing'){record=result.record;observed=true;}else{record=prior;mode='retained';}
   }catch{record=prior;mode='retained';}finally{requests--;}
  }
  if(!active())return error(request,404,'not_published');
  if(requestEpoch!==epoch)return error(request,503,'item_reference_unavailable');
  if((observed||fresh())&&wanted&&wanted!==latest.generation)return changed(request,id,requestEpoch);
  if(!record)return error(request,503,'item_reference_unavailable');
  if(wanted&&wanted!==record.generation)return error(request,503,'requested_generation_unavailable');
  return serve(request,record,mode);
 }
 Object.defineProperties(route,{setEnabled:{value:setEnabled},state:{value:()=>Object.freeze({enabled:external(),cacheItems:cache.size,cacheBytes,inflightItems:flights.size,activeRequests:requests,physicalPending:reader?.state().physicalPending??0})}});return Object.freeze(route);
}
