import {validatePublicItemReference} from '../../ops/api-item-reference-protocol.mjs';
import {parseStrictJson} from '../../ops/api-price-item-dto.mjs';
import {hasFastItemHeaders,validateFastItemHeaders,parseFastItemError} from '../../ops/api-fast-item-public-protocol.mjs';
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const abort=()=>Object.assign(Error('Aborted'),{name:'AbortError'});
export async function boundedBytes(response,limit){const size=Number(response.headers.get('content-length'));if(Number.isFinite(size)&&size>limit)throw Error('Body bound');if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let length=0;try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw Error('Body bound');}chunks.push(value);}}finally{reader.releaseLock();}const out=new Uint8Array(length);let at=0;for(const b of chunks){out.set(b,at);at+=b.length;}return out;}const b=new Uint8Array(await response.arrayBuffer());if(b.length>limit)throw Error('Body bound');return b;}
const failure=code=>Object.assign(Error(code),{code});
export function createItemReferenceClient({fetcher,enabled=false,isEnabled=()=>true,now=Date.now,ttlMs=30000,timeoutMs=10000,maxItems=32,maxBytes=2097152,maxFlights=4}={}){
 if(!Number.isInteger(ttlMs)||ttlMs<0||ttlMs>60000||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>12000||!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>64||!Number.isSafeInteger(maxBytes)||maxBytes<300000||maxBytes>8388608||!Number.isSafeInteger(maxFlights)||maxFlights<1||maxFlights>8)throw Error('Bounded client settings required');
 let bytes=0,blocked=false,fastSeen=false,fastEpoch=null,high=null,saturatedAt=0;const cache=new Map(),flights=new Map(),controllers=new Map(),failures=new Map(),tombstones=new Map();
 const active=()=>enabled===true&&isEnabled()===true;
 const touch=(id,value)=>{if(cache.has(id))bytes-=cache.get(id).bytes;cache.delete(id);cache.set(id,value);bytes+=value.bytes;while(cache.size>maxItems||bytes>maxBytes){const first=cache.keys().next().value;bytes-=cache.get(first).bytes;cache.delete(first);}};
 const drop=id=>{const old=cache.get(id);if(old)bytes-=old.bytes;cache.delete(id);};
 function recognize(response){const marked=hasFastItemHeaders(response.headers);if(marked&&!fastSeen){fastSeen=true;for(const[id,v]of [...cache])if(!v.fast)drop(id);}return marked;}
 function missing(id,frame){if(!frame)return;const old=tombstones.get(id);if(old&&old.revision>frame.revision)return;if(!old&&tombstones.size>=64){saturatedAt=Math.max(saturatedAt,frame.revision);return;}tombstones.set(id,frame);}
 function admit(frame,id,negative=false,prior=null){
  if(fastEpoch!==null&&frame.epoch!==fastEpoch)throw failure('invalid');
  if(high&&(frame.revision<high.revision||Date.parse(frame.capturedAt)<Date.parse(high.capturedAt)||frame.revision===high.revision&&(frame.generation!==high.generation||frame.capturedAt!==high.capturedAt)))throw failure('invalid');
  const absent=tombstones.get(id);if(!negative&&(frame.revision<=saturatedAt||absent&&frame.revision<=absent.revision))throw failure('invalid');
  if(!negative&&prior?.fast&&frame.revision===prior.fast.revision&&(frame.bodySha256!==prior.fast.bodySha256||frame.generation!==prior.fast.generation||frame.capturedAt!==prior.fast.capturedAt))throw failure('invalid');
  if(!high||frame.revision>high.revision){for(const[k,v]of tombstones)if(v.revision<frame.revision)tombstones.delete(k);if(saturatedAt<frame.revision)saturatedAt=0;for(const[k,v]of [...cache])if(v.fast&&v.fast.revision<frame.revision)touch(k,{...v,mode:'retained',expires:0});}
  high={epoch:frame.epoch,revision:frame.revision,generation:frame.generation,capturedAt:frame.capturedAt};fastEpoch=frame.epoch;if(negative)missing(id,frame);else tombstones.delete(id);
 }
 const wait=(promise,signal)=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(abort());const onAbort=()=>{cleanup();reject(abort());},cleanup=()=>signal?.removeEventListener('abort',onAbort);signal?.addEventListener('abort',onAbort,{once:true});promise.then(v=>{cleanup();signal?.aborted?reject(abort()):resolve(v);},e=>{cleanup();reject(e);});});
 async function read(id){
  const prior=cache.get(id),control={controller:new AbortController(),cancelled:false,timedOut:false,fastDeadline:performance.now()+timeoutMs};let captureFloor=prior?.data.sourceCapturedAt??failures.get(id)?.capturedAtFloor??null,negativeSeen=false;controllers.set(id,control);let timer;
  const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{control.timedOut=true;control.controller.abort();reject(failure('timeout'));},timeoutMs);});const deadline=p=>Promise.race([p,expired]);
  const fence=()=>{if(control.cancelled||!active())throw abort();if(control.timedOut||performance.now()>=control.fastDeadline){control.timedOut=true;control.controller.abort();throw failure('timeout');}if(blocked)throw failure('access_denied');};
  function commit(action){const old={bytes,fastEpoch,high,saturatedAt,cache:new Map(cache),tombstones:new Map(tombstones),failures:new Map(failures)};fence();try{action();fence();}catch(error){bytes=old.bytes;fastEpoch=old.fastEpoch;high=old.high;saturatedAt=old.saturatedAt;for(const[target,saved]of[[cache,old.cache],[tombstones,old.tombstones],[failures,old.failures]]){target.clear();for(const[k,v]of saved)target.set(k,v);}throw error;}}
  async function headerFrame(response,values){try{const frame=await deadline(validateFastItemHeaders(response.headers,{...values,now:now()}));fence();return frame;}catch{fence();throw failure('invalid');}}
  async function errorFrame(response,kind){const capturedAt=response.headers.get('X-Astra-API-Item-Captured-At'),generation=response.headers.get('X-Astra-API-Item-Generation'),etag=response.headers.get('ETag');if(!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')??'')||!/^"api-item-[a-f0-9]{64}"$/.test(etag??''))throw failure('invalid');const raw=await deadline(boundedBytes(response,4096));fence();const bodySha256=await deadline(sha(raw));fence();if(etag!=='"api-item-'+bodySha256+'"')throw failure('invalid');try{parseFastItemError(raw,{kind,itemId:id,generation,capturedAt});}catch{throw failure('invalid');}return headerFrame(response,{generation,capturedAt,bodySha256});}
  try{
   let response;
   for(let attempt=0;attempt<2;attempt++){
    const generation=attempt===0?prior?.data.projectionGeneration:null,url='/api-item-prices/'+id+'.json'+(generation?'?generation='+generation:'');
    response=await deadline(fetcher(url,{method:'GET',credentials:'same-origin',cache:'no-cache',redirect:'error',signal:control.controller.signal,headers:prior?{'If-None-Match':prior.etag}:{}}));fence();
    if(response.status===401||response.status===403)throw failure('access_denied');
    const marked=recognize(response);fence();
    if(response.status===404){
     // Withdraw immediately; only a fully bound negative body may raise the
     // authoritative revision floor. A held/malformed body cannot restore prior.
     negativeSeen=true;drop(id);missing(id,prior?.fast);
     if(fastSeen){if(!marked)throw failure('invalid');const frame=await errorFrame(response,'membership_absent');commit(()=>admit(frame,id,true));if(captureFloor===null||Date.parse(frame.capturedAt)>Date.parse(captureFloor))captureFloor=frame.capturedAt;}
     throw failure('not_found');
    }
    if(response.status!==409)break;
    if(fastSeen){if(!marked)throw failure('invalid');const frame=await errorFrame(response,'generation_changed');commit(()=>admit(frame,id));}
    if(attempt===1)throw failure('generation_changed');
   }
   const mode=response.headers.get('X-Astra-API-Item-Mode'),captured=response.headers.get('X-Astra-API-Item-Captured-At'),generation=response.headers.get('X-Astra-API-Item-Generation'),etag=response.headers.get('ETag');
   if(response.status!==200&&response.status!==304)throw failure('unavailable');
   if(!['validated_cache','retained'].includes(mode)||!/^"api-item-[a-f0-9]{64}"$/.test(etag??''))throw failure('invalid');
   if(response.status===304){
    if(!prior||prior.etag!==etag||prior.data.sourceCapturedAt!==captured||prior.data.projectionGeneration!==generation)throw failure('invalid');
    let fast=null;if(fastSeen){if(!hasFastItemHeaders(response.headers))throw failure('invalid');fast=await headerFrame(response,{generation,capturedAt:captured,bodySha256:etag.slice(10,-1)});fence();}
    const value={...prior,mode,fast,expires:now()+ttlMs};commit(()=>{if(fast)admit(fast,id,false,prior);touch(id,value);failures.delete(id);});return value;
   }
   if(!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')??''))throw failure('invalid');
   const body=await deadline(boundedBytes(response,300000));fence();
   if('"api-item-'+await deadline(sha(body))+'"'!==etag)throw failure('invalid');fence();let data;
   try{data=await deadline(validatePublicItemReference(parseStrictJson(body)));}catch{throw failure('invalid');}fence();
   if(data.itemId!==id||data.sourceCapturedAt!==captured||data.projectionGeneration!==generation||captureFloor!==null&&Date.parse(data.sourceCapturedAt)<Date.parse(captureFloor))throw failure('invalid');
   let fast=null;if(fastSeen){if(!hasFastItemHeaders(response.headers))throw failure('invalid');fast=await headerFrame(response,{generation,capturedAt:captured,bodySha256:etag.slice(10,-1)});fence();}
   const value={data,mode,etag,fast,bytes:body.length,expires:now()+ttlMs};commit(()=>{if(fast)admit(fast,id,false,prior);touch(id,value);failures.delete(id);});return value;
  }catch(error){
   if(control.cancelled||!active()||error?.name==='AbortError'&&!control.timedOut)throw abort();
   const reason=control.timedOut?'timeout':['timeout','access_denied','not_found','generation_changed','invalid','unavailable'].includes(error?.code)?error.code:'unavailable',old=failures.get(id)?.count??0;
   failures.set(id,{count:old+1,reason,checkedAt:now(),retryAt:now()+Math.min(300000,30000*2**Math.min(old,4)),capturedAtFloor:captureFloor});while(failures.size>64)failures.delete(failures.keys().next().value);
   if(reason==='access_denied'){blocked=true;throw failure(reason);}
   if(negativeSeen||reason==='not_found'){drop(id);throw failure('not_found');}
   if(prior&&active()&&(!fastSeen||prior.fast)){const value={...prior,mode:'retained',expires:prior.fast&&high&&prior.fast.revision<high.revision?0:prior.expires};touch(id,value);return value;}
   throw failure(reason);
  }finally{clearTimeout(timer);if(controllers.get(id)===control)controllers.delete(id);}
 }
 return Object.freeze({
  async loadItem({itemId,signal}={}){
   if(!Number.isSafeInteger(itemId)||itemId<1||itemId>999999999)throw Error('Exact numeric ID required');if(!active()||typeof fetcher!=='function')throw failure('disabled');if(blocked)throw failure('access_denied');
   let value=cache.get(itemId);if(value&&now()<value.expires)return{data:structuredClone(value.data),mode:value.mode};
   if((failures.get(itemId)?.retryAt??0)>now()){if(value)return{data:structuredClone(value.data),mode:'retained'};throw failure(failures.get(itemId).reason);}
   if(!flights.has(itemId)){if(flights.size>=maxFlights)throw failure('read_capacity');const task=read(itemId);flights.set(itemId,task);task.finally(()=>{if(flights.get(itemId)===task)flights.delete(itemId);}).catch(()=>{});}
   value=await wait(flights.get(itemId),signal);return{data:structuredClone(value.data),mode:value.mode};
  },
  peekCachedReferences(){return !active()||blocked?{status:blocked?'access_denied':'disabled',references:[]}:{status:'cache_only',references:[...cache.values()].map(v=>({data:structuredClone(v.data),mode:now()<v.expires?v.mode:'retained'}))};},
  state(id){const value=cache.get(id);return value?{mode:value.mode,capturedAt:value.data.sourceCapturedAt,generation:value.data.projectionGeneration}:null;},
  diagnostic(id){const f=failures.get(id),value=cache.get(id);return{blocked,reason:blocked?'access_denied':f?.reason??null,retryAt:f?.retryAt??0,partial:!!value&&(value.data.item.aggregate.sold===null||value.data.item.aggregate.asking===null||value.data.item.aggregate.reference===null)};},
  ordering(){return Object.freeze({protocolSeen:fastSeen,epoch:fastEpoch,revision:high?.revision??null,tombstones:tombstones.size,saturatedAt});},
  cancelItem(id){const c=controllers.get(id);if(c){c.cancelled=true;c.controller.abort();}return(flights.get(id)??Promise.resolve()).catch(()=>{});},
  resetAccess(){if(blocked){for(const[id,value]of [...cache])touch(id,{...value,expires:0});failures.clear();}blocked=false;},
  clear(){for(const c of controllers.values()){c.cancelled=true;c.controller.abort();}cache.clear();failures.clear();bytes=0;blocked=false;}
 });
}
