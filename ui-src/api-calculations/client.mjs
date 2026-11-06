// WORK candidate: one bounded own-site reader. No provider URLs or timers.
import{createCalculationSelection}from'./view-model.mjs';
const ROUTE='/api-market-calculations.json',MAX_BYTES=600000;
const allowed=new Set(['https://inflation.gg','https://inflation-watch-astra.dizzyvinci.workers.dev','http://127.0.0.1:8765']);
const sha=async raw=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('');
const need=(v,c)=>{if(!v)throw Error(c);};
const iso=t=>new Date(t).toISOString();
export function createApiCalculationClient({origin,parse,expectedDefinitionHash,fetcher=fetch,now=()=>Date.now(),timeoutMs=8000,onChange=()=>{},onAccessDenied=()=>{}}){
 need(allowed.has(origin)&&typeof parse==='function'&&/^[a-f0-9]{64}$/.test(expectedDefinitionHash),'invalid_own_reader_configuration');
 need(Number.isFinite(timeoutMs)&&timeoutMs>0&&timeoutMs<=8000,'invalid_own_reader_deadline');
 const selection=createCalculationSelection();let flight=null,etag=null,nextCheck=0,failures=0,blocked=false,readerMode=null,reason=null;
 const state=()=>({...selection.state(),readerMode,reason,blocked,nextCheckAt:nextCheck});
 function context(response,snapshot){
  need(response.headers.get('X-Astra-Calculations-Definition-Hash')===expectedDefinitionHash&&snapshot.definitionHash===expectedDefinitionHash,'definition_changed');
  need(response.headers.get('X-Astra-Calculations-Prices-Captured-At')===(snapshot.sources.prices?.capturedAt??'none')&&response.headers.get('X-Astra-Calculations-Overview-Captured-At')===(snapshot.sources.overview?.capturedAt??'none'),'source_clock_binding');
  const mode=response.headers.get('X-Astra-Calculations-Mode');need(['accepted_cache','retained_last_good'].includes(mode),'invalid_reader_mode');return mode;
 }
 async function read(){
  const controller=new AbortController();let deadline;
  const guard=new Promise((_,reject)=>{deadline=setTimeout(()=>{controller.abort();reject(Error('own_reader_timeout'));},timeoutMs);});
  const wait=p=>Promise.race([p,guard]);
  try{
   const response=await wait(fetcher(origin+ROUTE,{method:'GET',credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,
    headers:{Accept:'application/json',...(etag?{'If-None-Match':etag}:{})}}));
   if([401,403].includes(response.status)){blocked=true;onAccessDenied(response.status);throw Error('access_denied');}
   need(response.status===200||response.status===304,response.status===404?'not_published':'own_reader_unavailable');
   need(/(?:^|,)\s*private\s*(?:,|$)/i.test(response.headers.get('Cache-Control')||'')&&/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control')||''),'private_policy');
   if(response.status===304){const snapshot=selection.state().snapshot;need(snapshot&&response.headers.get('ETag')===etag,'invalid_not_modified');readerMode=context(response,snapshot);selection.accept(snapshot,{checkedAt:iso(now())});reason=null;failures=0;nextCheck=now()+60000;onChange(state());return state();}
   need((response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase()==='application/json','not_json');
   const length=response.headers.get('Content-Length');if(length!==null)need(/^\d+$/.test(length)&&Number(length)>0&&Number(length)<=MAX_BYTES,'body_bound');
   const reader=response.body?.getReader();need(reader,'missing_body');let size=0;const chunks=[];
   try{for(;;){const chunk=await wait(reader.read());if(chunk.done)break;need(chunk.value instanceof Uint8Array,'body_chunk');size+=chunk.value.length;need(size<=MAX_BYTES,'body_bound');chunks.push(chunk.value);}}
   catch(error){reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
   need(size>0&&(length===null||Number(length)===size),'body_bound');const raw=new Uint8Array(size);let at=0;for(const chunk of chunks){raw.set(chunk,at);at+=chunk.length;}
   const digest=await wait(sha(raw)),nextEtag='"api-calculations-'+digest+'"';need(response.headers.get('ETag')===nextEtag,'body_hash');
   const snapshot=await wait(parse(raw,{expectedDefinitionHash}));readerMode=context(response,snapshot);
   const accepted=selection.accept(snapshot,{checkedAt:iso(now())});
   if(selection.state().snapshot?.snapshotHash===snapshot.snapshotHash)etag=nextEtag;
   else readerMode='retained_last_good';
   reason=selection.state().status==='retained'?'current_aggregate_unavailable_or_older':null;
   failures=0;nextCheck=now()+60000;onChange({...state(),changed:accepted});return state();
  }catch(error){failures++;selection.failed({checkedAt:iso(now())});reason=['access_denied','not_published'].includes(error.message)?error.message:'own_reader_failed';readerMode=selection.state().snapshot?'retained_last_good':null;nextCheck=blocked?Infinity:now()+Math.min(600000,60000*2**Math.min(failures-1,4));onChange(state());return state();}
  finally{clearTimeout(deadline);}
 }
 return Object.freeze({state,refresh(){if(blocked||now()<nextCheck)return Promise.resolve(state());if(flight)return flight;flight=read();return flight.finally(()=>{flight=null;});}});
}
