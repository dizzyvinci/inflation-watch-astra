import {validatePublicItemReference} from '../../ops/api-item-reference-protocol.mjs';
import {parseStrictJson} from '../../ops/api-price-item-dto.mjs';
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const abort=()=>Object.assign(Error('Aborted'),{name:'AbortError'});
export async function boundedBytes(response,limit){const size=Number(response.headers.get('content-length'));if(Number.isFinite(size)&&size>limit)throw Error('Body bound');if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let length=0;try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw Error('Body bound');}chunks.push(value);}}finally{reader.releaseLock();}const out=new Uint8Array(length);let at=0;for(const b of chunks){out.set(b,at);at+=b.length;}return out;}const b=new Uint8Array(await response.arrayBuffer());if(b.length>limit)throw Error('Body bound');return b;}
const failure=code=>Object.assign(Error(code),{code});
export function createItemReferenceClient({fetcher,enabled=false,isEnabled=()=>true,now=Date.now,ttlMs=30000,timeoutMs=10000,maxItems=32,maxBytes=2097152,maxFlights=4}={}){
 if(!Number.isInteger(ttlMs)||ttlMs<0||ttlMs>60000||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>12000||!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>64||!Number.isSafeInteger(maxBytes)||maxBytes<300000||maxBytes>8388608||!Number.isSafeInteger(maxFlights)||maxFlights<1||maxFlights>8)throw Error('Bounded client settings required');
 let bytes=0,blocked=false;const cache=new Map(),flights=new Map(),controllers=new Map(),failures=new Map();
 const active=()=>enabled===true&&isEnabled()===true;
 const touch=(id,value)=>{if(cache.has(id))bytes-=cache.get(id).bytes;cache.delete(id);cache.set(id,value);bytes+=value.bytes;while(cache.size>maxItems||bytes>maxBytes){const first=cache.keys().next().value;bytes-=cache.get(first).bytes;cache.delete(first);}};
 const wait=(promise,signal)=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(abort());const onAbort=()=>{cleanup();reject(abort());},cleanup=()=>signal?.removeEventListener('abort',onAbort);signal?.addEventListener('abort',onAbort,{once:true});promise.then(v=>{cleanup();signal?.aborted?reject(abort()):resolve(v);},e=>{cleanup();reject(e);});});
 async function read(id){
  const prior=cache.get(id),control={controller:new AbortController(),cancelled:false,timedOut:false};controllers.set(id,control);let timer;
  const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{control.timedOut=true;control.controller.abort();reject(failure('timeout'));},timeoutMs);});const deadline=p=>Promise.race([p,expired]);
  const fence=()=>{if(control.cancelled||!active())throw abort();if(control.timedOut)throw failure('timeout');if(blocked)throw failure('access_denied');};
  try{
   let response;
   for(let attempt=0;attempt<2;attempt++){
    const generation=attempt===0?prior?.data.projectionGeneration:null,url='/api-item-prices/'+id+'.json'+(generation?'?generation='+generation:'');
    response=await deadline(fetcher(url,{method:'GET',credentials:'same-origin',cache:'no-cache',redirect:'error',signal:control.controller.signal,headers:prior?{'If-None-Match':prior.etag}:{}}));fence();
    if(response.status===401||response.status===403)throw failure('access_denied');
    if(response.status===404)throw failure('not_found');
    if(response.status!==409)break;
    if(attempt===1)throw failure('generation_changed');
   }
   const mode=response.headers.get('X-Astra-API-Item-Mode'),captured=response.headers.get('X-Astra-API-Item-Captured-At'),generation=response.headers.get('X-Astra-API-Item-Generation'),etag=response.headers.get('ETag');
   if(response.status!==200&&response.status!==304)throw failure('unavailable');
   if(!['validated_cache','retained'].includes(mode)||!/^"api-item-[a-f0-9]{64}"$/.test(etag??''))throw failure('invalid');
   if(response.status===304){
    if(!prior||prior.etag!==etag||prior.data.sourceCapturedAt!==captured||prior.data.projectionGeneration!==generation)throw failure('invalid');
    fence();const value={...prior,mode,expires:now()+ttlMs};touch(id,value);failures.delete(id);return value;
   }
   if(!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')??''))throw failure('invalid');
   const body=await deadline(boundedBytes(response,300000));fence();
   if('"api-item-'+await deadline(sha(body))+'"'!==etag)throw failure('invalid');fence();let data;
   try{data=await deadline(validatePublicItemReference(parseStrictJson(body)));}catch{throw failure('invalid');}fence();
   if(data.itemId!==id||data.sourceCapturedAt!==captured||data.projectionGeneration!==generation||prior&&Date.parse(data.sourceCapturedAt)<Date.parse(prior.data.sourceCapturedAt))throw failure('invalid');
   const value={data,mode,etag,bytes:body.length,expires:now()+ttlMs};touch(id,value);failures.delete(id);return value;
  }catch(error){
   if(control.cancelled||!active()||error?.name==='AbortError'&&!control.timedOut)throw abort();
   const reason=control.timedOut?'timeout':['timeout','access_denied','not_found','generation_changed','invalid','unavailable'].includes(error?.code)?error.code:'unavailable',old=failures.get(id)?.count??0;
   failures.set(id,{count:old+1,reason,checkedAt:now(),retryAt:now()+Math.min(300000,30000*2**Math.min(old,4))});while(failures.size>64)failures.delete(failures.keys().next().value);
   if(reason==='access_denied'){blocked=true;throw failure(reason);}
   if(prior&&active()){const value={...prior,mode:'retained'};touch(id,value);return value;}
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
  cancelItem(id){const c=controllers.get(id);if(c){c.cancelled=true;c.controller.abort();}return(flights.get(id)??Promise.resolve()).catch(()=>{});},
  resetAccess(){if(blocked){for(const[id,value]of [...cache])touch(id,{...value,expires:0});failures.clear();}blocked=false;},
  clear(){for(const c of controllers.values()){c.cancelled=true;c.controller.abort();}cache.clear();failures.clear();bytes=0;blocked=false;}
 });
}
