(()=>{'use strict';if(window.AstraApiCash)return;
const protocol=window.AstraApiCashProtocol;if(!protocol)throw Error('Public cash protocol missing');
const PATH='/api-cash-items.json',CHOICES=['auto','api','legacy'],KEY='astra-api-cash-evidence-v1';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const sha=async raw=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(n=>n.toString(16).padStart(2,'0')).join('');
async function readBody(response){
 const size=response.headers.get('Content-Length');if(size!==null&&(!/^\d+$/.test(size)||Number(size)>100000))throw Error('invalid');
 if(response.body?.getReader){const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>100000)throw Error('invalid');parts.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const raw=new Uint8Array(size);let at=0;for(const part of parts){raw.set(part,at);at+=part.byteLength;}
  return{raw,text:new TextDecoder('utf-8',{fatal:true}).decode(raw)};
 }
 const text=await response.text(),raw=new TextEncoder().encode(text);if(raw.length>100000)throw Error('invalid');return{raw,text};
}
function createClient({fetcher=(...args)=>window.fetch(...args),now=Date.now,setTimer=(...args)=>setTimeout(...args),clearTimer=id=>clearTimeout(id),
 visible=()=>document.visibilityState!=='hidden',online=()=>navigator.onLine!==false,random=Math.random,onState=()=>{}}={}){
 let state=freeze({status:'idle',data:null,serverMode:null,error:null,checkedAt:null,nextAttemptAt:null}),timer=null,controller=null,flight=null,
  epoch=0,started=false,closed=false,lastStart=-Infinity,failures=0,etag=null;
 const emit=next=>{state=freeze({...state,...next});onState(state);return state;};
 const cancelTimer=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 function schedule(at){cancelTimer();if(!started||closed||!visible()||!online())return;timer=setTimer(()=>{timer=null;void refresh();},Math.max(1,at-now()));}
 async function load(signal){
  const response=await fetcher(PATH,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal,
   headers:{Accept:'application/json',...(etag?{'If-None-Match':etag}:{})}});
  if(signal.aborted)throw Error('cancelled');
  if(response.url){const url=new URL(response.url,location.href);if(url.origin!==location.origin||url.pathname!==PATH||url.search)throw Error('invalid');}
  if(response.status===401||response.status===403){try{window.astraPreviewSession?.onResponse(response);}catch{}throw Error('site_access');}
  if(response.status===404)throw Error('not_published');
  if(response.status===503)throw Error('unavailable');
  const mode=response.headers.get('X-Astra-Cash-Mode'),capture=response.headers.get('X-Astra-Cash-Captured-At');
  if(response.headers.get('X-Astra-Cash-Phase')!=='published_subset'||!['accepted_cache','retained_last_good'].includes(mode))throw Error('invalid');
  if(response.status===304){if(!state.data||capture!==state.data.capturedAt||response.headers.get('ETag')!==etag)throw Error('invalid');return{data:state.data,etag,mode};}
  if(response.status!==200||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type')||''))throw Error('invalid');
  const body=await readBody(response),receivedEtag=response.headers.get('ETag');
  if(!/^"[a-f0-9]{64}"$/.test(receivedEtag||'')||'"'+await sha(body.raw)+'"'!==receivedEtag)throw Error('invalid');
  const data=await protocol.validate(protocol.parse(body.text));if(capture!==data.capturedAt)throw Error('invalid');
  return{data,etag:receivedEtag,mode};
 }
 function refresh(){
  if(closed||!visible()||!online())return Promise.resolve(state);if(flight)return flight;
  const due=Math.max(lastStart+30000,state.error?state.nextAttemptAt||0:0);if(now()<due){schedule(due);return Promise.resolve(state);}
  lastStart=now();const mine=++epoch,requestController=new AbortController();controller=requestController;let timeout;
  emit({status:'loading',error:null,nextAttemptAt:null});
  const fail=new Promise((_,reject)=>{timeout=setTimer(()=>{requestController.abort();reject(Error('timeout'));},12000);});
  const pending=Promise.race([load(requestController.signal),fail]).then(value=>{
   if(mine!==epoch||closed)return state;etag=value.etag;failures=0;
   return emit({data:value.data,status:value.mode==='retained_last_good'?'retained':'ready',serverMode:value.mode,error:null,checkedAt:now(),nextAttemptAt:lastStart+60000});
  }).catch(error=>{
   if(mine!==epoch||closed)return state;
   const reason=['site_access','not_published','unavailable','timeout'].includes(error?.message)?error.message:'invalid';
   const discard=reason==='site_access'||reason==='not_published';if(discard)etag=null;
   failures++;const delay=Math.min(900000,60000*2**Math.min(failures-1,4))*(1+Math.max(0,Math.min(1,random()))*.1);
   return emit({status:discard?reason:state.data?'retained':'unavailable',data:discard?null:state.data,error:reason,
    checkedAt:now(),nextAttemptAt:now()+delay});
  }).finally(()=>{clearTimer(timeout);if(mine===epoch){flight=null;controller=null;schedule(state.nextAttemptAt??now()+60000);}});
  flight=pending;return pending;
 }
 function visibilityChanged(){
  cancelTimer();if(!visible()||!online()){++epoch;controller?.abort();controller=null;flight=null;emit({status:state.data?'retained':'paused'});return;}
  if(started)void refresh();
 }
 return Object.freeze({getState:()=>state,refresh,start(){if(closed)return;if(!started){started=true;void refresh();}},visibilityChanged,
  close(){closed=true;++epoch;cancelTimer();controller?.abort();controller=null;flight=null;},freshness(){
   if(!state.data)return'unavailable';const age=now()-Date.parse(state.data.capturedAt);return age<0?'clock_uncertain':age<=600000?'recent_retrieval':'aged_retrieval';}});
}
let choice='auto';try{const saved=localStorage.getItem(KEY);if(CHOICES.includes(saved))choice=saved;}catch{}
const client=createClient({onState:state=>document.dispatchEvent(new CustomEvent('astraapicashchange',{detail:state}))});
function model(){const s=client.getState(),data=s.data;
 const records=data?.records||protocol.targets.map(t=>({itemId:t.itemId,name:t.name,slug:t.slug,fixedNxCost:t.fixedNxCost,available:false,saleMedianMesos:null,recordedSalesCount:null,mesosPerNx:null}));
 const rows=records.map(r=>({id:r.itemId,name:r.name,slug:r.slug,nx:r.fixedNxCost,price:r.saleMedianMesos,rate:r.mesosPerNx,
  quantity:r.recordedSalesCount,referenceWeight:r.available?r.recordedSalesCount:0,windowDays:3,missing:!r.available,
  lowRate:null,highRate:null,referenceExclusion:r.available?null:'API median or minimum reported count unavailable',sourceCreditUrl:r.sourceCreditUrl||`https://maplestory.market/items/${r.itemId}?ref=v6kkdvp6`}));
 const eligible=rows.filter(r=>r.referenceWeight>0),total=eligible.reduce((sum,r)=>sum+r.referenceWeight,0),complete=eligible.length===29;
 const reference=complete&&Number.isSafeInteger(total)?eligible.reduce((sum,r)=>sum+r.rate*r.referenceWeight,0)/total:null;
 for(const row of rows){row.deltaPct=reference>0&&row.referenceWeight>0?(row.rate/reference-1)*100:null;row.verdict='unknown';}
 return{api:true,rows,reference,days:3,rolling:false,start:null,end:null,partial:!complete,eligibleCount:eligible.length,
  capturedAt:data?.capturedAt||null,requestStartedAt:data?.requestStartedAt||null,sourceUpdatedAt:null,
  retained:['retained','loading'].includes(s.status)||s.serverMode==='retained_last_good',sourceObservedAt:null,status:s.status,
  coverage:data?.coverage||{expected:29,available:0,missingOrInvalid:29},sourceKind:'api_item_sale_medians'};
}
function pricing(_report,{side='sell'}={}){const m=model();if(choice==='legacy'||choice==='auto'&&m.eligibleCount===0)return null;
 for(const row of m.rows)if(row.deltaPct!==null){const advantage=row.deltaPct*(side==='buy'?-1:1);row.verdict=Math.abs(advantage)<1e-9?'neutral':advantage>0?'favorable':'less-favorable';}return m;
}
function fallbackReason(){if(choice==='legacy')return'Other dated source selected';if(client.getState().data?.coverage.available===0)return'No qualifying API medians; other dated source shown';return'API reference unavailable; other dated source shown';}
function setChoice(value){if(!CHOICES.includes(value))return;choice=value;try{localStorage.setItem(KEY,value);}catch{}
 document.dispatchEvent(new CustomEvent('astraapicashchoice',{detail:{choice}}));}
window.AstraApiCash=Object.freeze({client,createClient,getState:client.getState,refresh:client.refresh,model,pricing,fallbackReason,getChoice:()=>choice,setChoice,
 rowFor(item){const row=client.getState().data?.records.find(r=>r.slug===item?.slug&&r.name===item?.name);if(!row)return null;
  const id=item.canonicalId??item.id,cost=item.knownNxCost??item.nx;return id!==null&&id!==undefined&&id!==row.itemId||cost!==null&&cost!==undefined&&cost!==row.fixedNxCost?null:row;}});
document.addEventListener('visibilitychange',()=>client.visibilityChanged());window.addEventListener('online',()=>client.visibilityChanged());window.addEventListener('offline',()=>client.visibilityChanged());
document.getElementById('refresh')?.addEventListener('click',()=>void client.refresh());client.start();
})();
