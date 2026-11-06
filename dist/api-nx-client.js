(()=>{'use strict';if(window.AstraApiNxOffers)return;
const protocol=window.AstraApiNxProtocol;if(!protocol)throw Error('Public NX protocol missing');
const PATH='/api-nx-offers.json';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const sha=async raw=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(n=>n.toString(16).padStart(2,'0')).join('');
async function readBody(response){
 const size=response.headers.get('Content-Length');if(size!==null&&(!/^\d+$/.test(size)||Number(size)>600000))throw Error('invalid');
 if(response.body?.getReader){const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>600000)throw Error('invalid');parts.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const raw=new Uint8Array(size);let at=0;for(const part of parts){raw.set(part,at);at+=part.byteLength;}
  return{raw,text:new TextDecoder('utf-8',{fatal:true}).decode(raw)};
 }
 const text=await response.text(),raw=new TextEncoder().encode(text);if(raw.length>600000)throw Error('invalid');return{raw,text};
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
  const mode=response.headers.get('X-Astra-NX-Mode'),capture=response.headers.get('X-Astra-NX-Captured-At');
  if(response.headers.get('X-Astra-NX-Phase')!=='published_offer_subset'||!['accepted_cache','retained_last_good'].includes(mode))throw Error('invalid');
  if(response.status===304){if(!state.data||capture!==state.data.capturedAt||response.headers.get('ETag')!==etag)throw Error('invalid');return{data:state.data,etag,mode};}
  if(response.status!==200||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type')||''))throw Error('invalid');
  const body=await readBody(response),receivedEtag=response.headers.get('ETag');
  if(!/^"[a-f0-9]{64}"$/.test(receivedEtag||'')||'"'+await sha(body.raw)+'"'!==receivedEtag)throw Error('invalid');
  const data=await protocol.validate(protocol.parse(body.text));if(capture!==data.capturedAt)throw Error('invalid');
  if(state.data&&data.capturedAt<state.data.capturedAt)throw Error('invalid');
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
const CANONICAL=protocol.canonicalSource,ALIASES=new Set([CANONICAL,protocol.historySource]);
const instant=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
function merge(report,api){
 if(!report||!Array.isArray(report.smega)||report.smega.length>20000)throw Error('bounded_legacy_offers');
 const records=new Map(),others=[],conflicts=[];
 const value=(p,origin)=>{
  const at=instant(p.at),capturedAt=instant(p.capturedAt),count=p.sampleCount??p.distinctSenders??null;
  if(!at||Date.parse(at)%3600000||!['buy','sell'].includes(p.side)||!(p.rate===null||typeof p.rate==='number'&&Number.isFinite(p.rate)&&p.rate>0)||!(count===null||Number.isSafeInteger(count)&&count>=0))return null;
  if(capturedAt&&Date.parse(capturedAt)<Date.parse(at))return null;
  if(![p.p25??null,p.p75??null].every(v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>0))return null;
  return{at,side:p.side,rate:p.rate,p25:p.p25??null,p75:p.p75??null,sampleCount:count,kind:p.side==='sell'?'smega_ask':'smega_bid',aggregation:'source_published_hourly',sourceUrl:CANONICAL,capturedAt,partial:p.partial===true?true:origin==='approved_api_subset'?null:p.partial??null,bucketCompletionKnown:origin==='approved_api_subset'?false:typeof p.partial==='boolean',originalSourceUrl:p.sourceUrl,provenance:[{sourceUrl:p.sourceUrl,capturedAt,transport:origin}],sourceObservedAt:null};
 };
 const add=p=>{
  const key=p.at+'|'+p.side,prior=records.get(key);if(!prior){records.set(key,p);return;}
  const newer=p.capturedAt!==null&&(prior.capturedAt===null||p.capturedAt>prior.capturedAt),older=prior.capturedAt!==null&&(p.capturedAt===null||p.capturedAt<prior.capturedAt);
  if(newer){records.set(key,p);return;}if(older)return;
  const same=['rate','p25','p75','sampleCount'].every(k=>p[k]===prior[k]);
  if(same){prior.provenance.push(...p.provenance);prior.bucketCompletionKnown=prior.bucketCompletionKnown&&p.bucketCompletionKnown;prior.partial=prior.partial===true||p.partial===true?true:prior.bucketCompletionKnown?prior.partial:null;return;}
  conflicts.push(key);records.set(key,{...prior,rate:null,p25:null,p75:null,sampleCount:null,provenance:[...prior.provenance,...p.provenance],conflict:true});
 };
 for(const p of report.smega){if(!ALIASES.has(p.sourceUrl)||p.aggregation!=='source_published_hourly'){others.push({...p});continue;}const r=value(p,'legacy_browser_capture');if(r)add(r);}
 if(api){protocol.validate(api);for(const p of api.hourlyHistory.rows){const r=value({at:p.at,side:p.side,rate:p.median,p25:p.p25,p75:p.p75,sampleCount:p.reportedPosterCount,capturedAt:p.capturedAt,sourceUrl:protocol.historySource},'approved_api_subset');if(r)add(r);}}
 const rows=[...records.values()].sort((a,b)=>a.at.localeCompare(b.at)||a.side.localeCompare(b.side));
 const legacySource=report.smegaSource||{},legacySummaryClock=ALIASES.has(legacySource.sourceUrl)?instant(legacySource.summaryCapturedAt||legacySource.capturedAt):null,n=api?.nativeSummary;
 let summary=legacySummaryClock&&legacySource.summary?{...legacySource.summary}:null,summaryCapturedAt=legacySummaryClock,summaryOrigin='legacy_browser_capture',summaryConflict=false;
 if(n){const next={sellerRate:n.sell?.median??null,buyerRate:n.buy?.median??null,windowHours:n.reportedWindowHours,sellerPosters:n.sell?.reportedPosterCount??null,buyerPosters:n.buy?.reportedPosterCount??null};
  if(!summaryCapturedAt||n.capturedAt>summaryCapturedAt){summary=next;summaryCapturedAt=n.capturedAt;summaryOrigin='approved_api_subset';}
  else if(n.capturedAt===summaryCapturedAt&&summary&&Object.keys(next).some(k=>summary[k]!==next[k])){summary=null;summaryConflict=true;}
 }
 const known=rows.map(p=>p.capturedAt).filter(Boolean).sort(),historyCapturedAt=known.at(-1)||instant(legacySource.capturedAt);
 return{smega:[...others,...rows],smegaSource:{...legacySource,sourceUrl:CANONICAL,capturedAt:historyCapturedAt,summary,summaryCapturedAt,summaryOrigin,summaryConflict,continuousApiConnected:!!api&&api.hourlyHistory.rows.length>0,apiOfferCacheVerified:!!api,historyCaptureMeaning:'original_receipt_capture_not_trade_time'},offerEvidence:{api:api||null,conflictingHourSideKeys:[...records].filter(([,p])=>p.conflict).map(([key])=>key),unknownBucketCompletion:rows.some(p=>p.bucketCompletionKnown===false),legacyOriginalCount:report.smega.length,mergedSourceHourSideRows:rows.length,historyCapturedAt,nativeSummaryCapturedAt:summaryCapturedAt}};
}
const client=createClient({onState:state=>document.dispatchEvent(new CustomEvent('astraapinxchange',{detail:state}))});
let lastRows=null,lastSource=null,lastData=null,lastMerge=null;
function view(report){const data=client.getState().data;if(lastRows!==report.smega||lastSource!==report.smegaSource||lastData!==data){lastMerge=merge(report,data);lastRows=report.smega;lastSource=report.smegaSource;lastData=data;}return{...report,...lastMerge};}
function sourceDescriptor(){const s=client.getState(),data=s.data,age=data?Date.now()-Date.parse(data.capturedAt):null,retained=s.status==='retained';return{connected:!!data,status:s.status,tone:!data?(s.error&&s.status!=='not_published'&&s.status!=='paused'?'red':'amber'):retained||age<0||age>600000?'amber':'green',state:!data?(s.error&&s.status!=='not_published'&&s.status!=='paused'?'API read failed; no accepted offer cache':'Dated browser history retained'):retained?'Own-site read failed; accepted offers retained':age<0?'Accepted API cache verified; receipt clock needs review':'Accepted API offer cache verified'+(age>600000?' · dated receipt':''),capturedAt:data?.capturedAt||null,detail:data?'Source-native summary and hourly poster aggregates; original receipt clocks retained. These are offers, not completed trades.':'The last dated browser capture remains available. A missing API subset does not erase its history.'};}
window.AstraApiNxOffers=Object.freeze({client,createClient,merge,view,sourceDescriptor,getState:client.getState,refresh:client.refresh});
document.addEventListener('visibilitychange',()=>client.visibilityChanged());window.addEventListener('online',()=>client.visibilityChanged());window.addEventListener('offline',()=>client.visibilityChanged());document.getElementById('refresh')?.addEventListener('click',()=>void client.refresh());client.start();
})();
