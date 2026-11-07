// Shared finite own-site HTTP physical latch; same origin cached JSON only.
const ORIGINS=new Set(['https://inflation.gg','https://inflation-watch-astra.dizzyvinci.workers.dev','http://127.0.0.1:8765']);
export const approvedInventoryOrigin=value=>typeof value==='string'&&ORIGINS.has(value);
const fail=c=>Object.assign(Error(c),{code:c}),need=(v,c)=>{if(!v)throw fail(c)};
const ALLOWED=new Set(['etag','content-type','content-length','x-astra-api-item-mode','x-astra-api-item-captured-at','x-astra-api-item-generation','x-astra-api-item-protocol','x-astra-api-item-epoch','x-astra-api-item-publication','x-astra-api-item-binding','x-astra-search-identity-protocol','x-astra-search-identity-epoch','x-astra-search-identity-revision','x-astra-search-identity-index','x-astra-search-identity-binding','x-astra-search-identity-mode','x-astra-search-identity-object']);
function route(path){need(typeof path==='string'&&path.length<=220,'fixed_cache_path');if(path==='/api-search-identities/v2/manifest.json')return{phase:'identity',id:null,max:65536};if(/^\/api-search-identities\/v2\/[a-f0-9]{64}\.json$/.test(path))return{phase:'identity',id:null,max:131072};const m=/^\/api-item-prices\/([1-9][0-9]{0,8})\.json(?:\?generation=[a-f0-9]{64})?$/.exec(path);need(m,'fixed_cache_path');return{phase:'price',id:Number(m[1]),max:300000}}
export function createInventoryPhysicalFetch({origin,fetcher,isEnabled=()=>false,onHeaders=()=>{},onState=()=>{}}={}){
 const leases=new Set();let epoch=0,action=null,peak=0,totalStarts=0;
 const state=()=>({physicalPending:leases.size,physicalPeak:peak,totalStarts,actionPending:action!==null,budgetExceeded:action?.failed===true,unknownLockedBodies:[...leases].filter(l=>l.unknownLockedBody).length});
 const notify=()=>{try{onState(state())}catch{}},active=()=>{try{return isEnabled()===true}catch{return false}};
 const cancelLease=async l=>{l.cancelRequested=true;if(l.cancelBody)await l.cancelBody();return l.done};
 function begin(){need(active()&&ORIGINS.has(origin)&&typeof fetcher==='function','cache_not_connected');need(action===null&&leases.size===0,'physical_wait');action={epoch,starts:0,priceBytes:0,identityBytes:0};return action}
 function end(a){if(action===a)action=null;notify()}
 async function read(path,options={}){
  const r=route(path),a=action;need(a&&!a.failed&&a.epoch===epoch&&active(),'cache_action_revoked');need(leases.size<4&&a.starts<529,'physical_capacity');need(ORIGINS.has(origin)&&typeof fetcher==='function','cache_not_connected');
  need(options.method==='GET'&&options.credentials==='same-origin'&&options.redirect==='error'&&options.body===undefined,'fixed_cache_request');const reqHeaders=new Headers(options.headers);
  for(const[k,v]of reqHeaders){need(k==='if-none-match'||k==='x-astra-request-item-protocol','fixed_cache_header');need(v.length<=160&&!/[\r\n]/.test(v),'fixed_cache_header');if(k==='x-astra-request-item-protocol')need(r.phase==='price'&&v==='fast-current-v1','fixed_cache_header')}
  let resolve;const l={...r,cancelRequested:false,cancelBody:null,done:new Promise(done=>resolve=done)};leases.add(l);peak=Math.max(peak,leases.size);a.starts++;totalStarts++;notify();let completed=false;
  const release=()=>{if(!completed){completed=true;leases.delete(l);resolve();notify()}};
  let response=null,reader=null,ended=false,cancelling=null;
  const cancel=()=>{l.cancelRequested=true;if(!cancelling)cancelling=(async()=>{try{if(reader)await reader.cancel();else if(response?.body){if(response.body.locked){l.unknownLockedBody=true;notify();await new Promise(()=>{})}else await response.body.cancel()}}finally{try{reader?.releaseLock()}catch{}release()}})();return cancelling};
  try{
   response=await fetcher(path,{...options,mode:'same-origin',referrerPolicy:'no-referrer'});
   l.cancelBody=cancel;
   need(response&&response.url===origin+path&&!response.redirected,'cache_response_destination');
   const headers=new Headers();let count=0,bytes=0;for(const[k,v]of response.headers){count++;bytes+=k.length+v.length;need(count<=100&&bytes<=65536,'cache_header_bound');if(ALLOWED.has(k.toLowerCase()))headers.set(k,v)}
   // Native Fetch exposes decoded body bytes while Content-Length can describe
   // encoded transport. Bound/hash decoded bytes; do not assert false equality.
   if(response.headers.get('Content-Encoding')&&response.headers.get('Content-Encoding').toLowerCase()!=='identity')headers.delete('Content-Length');
   onHeaders({itemId:r.id,status:response.status,protocol:headers.get('X-Astra-API-Item-Protocol'),epoch:headers.get('X-Astra-API-Item-Epoch')});
   if(a.epoch!==epoch||!active()||l.cancelRequested){await cancel();throw fail('cache_action_revoked')}
   if(response.status===304){if(response.body)await cancel();else release();return{status:304,headers,body:null}}
   if(![200,404,409].includes(response.status)){await cancel();return{status:response.status,headers,body:null}}
   need(response.body&&typeof response.body.getReader==='function','cache_body_missing');reader=response.body.getReader();let length=0,chunks=0;const max=[404,409].includes(response.status)?4096:r.max;
   const body=new ReadableStream({async pull(controller){
    try{
     // Headers reach the typed client first, so a declared404 withdraws BEFORE
     // a malformed/held body; no invented revision/tombstone authority here.
     const declared=headers.get('Content-Length');need(declared===null||/^[0-9]+$/.test(declared)&&Number(declared)<=max,'cache_body_bound');
     const p=await reader.read();need(a.epoch===epoch&&active()&&!l.cancelRequested,'cache_action_revoked');
     if(p.done){need(declared===null||Number(declared)===length,'cache_body_length');ended=true;reader.releaseLock();release();controller.close();return}
     need(++chunks<=1024&&p.value instanceof Uint8Array,'cache_chunk_bound');length+=p.value.byteLength;need(length<=max,'cache_body_bound');
     const field=r.phase==='price'?'priceBytes':'identityBytes';a[field]+=p.value.byteLength;if(a[field]>(r.phase==='price'?2000000:8454144)){a.failed=true;notify();throw fail('cache_action_byte_bound')}controller.enqueue(new Uint8Array(p.value));
    }catch(error){try{await cancel()}finally{controller.error(fail(['cache_action_revoked','cache_action_byte_bound'].includes(error?.code)?error.code:'cache_body_unavailable'))}}
   },async cancel(){if(!ended)await cancel()}},{highWaterMark:0});
   return{status:response.status,headers,body};
  }catch(error){await cancel();throw fail(['cache_response_destination','cache_action_revoked'].includes(error?.code)?error.code:'cache_unavailable')}
 }
 return Object.freeze({read,begin,end,state,async settlePhase(phase){const set=[...leases].filter(l=>l.phase===phase);await Promise.all(set.map(cancelLease))},async settleItem(id){await Promise.all([...leases].filter(l=>l.id===id).map(cancelLease))},revoke(){epoch++;for(const l of leases){l.cancelRequested=true;if(l.cancelBody)void l.cancelBody().catch(()=>{})}notify()},get busy(){return leases.size>0||action!==null}});
}
