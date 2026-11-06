import {createNxHistoryClient} from './nx-history-client.mjs';
import {mergeNxArchivedWeeks} from './nx-history-merge.mjs';
import {CANONICAL_SOURCE,SOURCE,LIMITS} from '../ops/nx-history-contract.mjs';
const DAY=86400000;
const utcDay=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
export const windowLabel=selection=>`${utcDay.format(new Date(selection.from))} through ${utcDay.format(new Date(selection.end+'T00:00:00Z'))} (UTC)`;
const day=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function historicalWindow(start,end){
 if(!day(start)||!day(end)||end<start||(Date.parse(end)-Date.parse(start))/DAY>76)throw TypeError('bounded_utc_date_window');
 return{start,end,from:start+'T00:00:00.000Z',until:new Date(Date.parse(end+'T00:00:00Z')+DAY).toISOString()};
}
export function monthWindow(month){
 if(typeof month!=='string'||!/^\d{4}-\d\d$/.test(month))throw TypeError('month');const first=month+'-01';if(!day(first))throw TypeError('month');const end=new Date(first+'T00:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);return historicalWindow(first,end.toISOString().slice(0,10));
}
export function createNxHistoricalController({fetcher,now=Date.now,onChange=()=>{},isVisible=()=>true,isOnline=()=>true}={}){
 let selection=null,loaded=null,pending=false,status='current',lastError=null,epoch=0,flight=null,attempted=null;const transports=new Set();
 const available=()=>isVisible()&&isOnline();
 const transport=async(url,options)=>{if(!available())throw Error('paused');if(transports.size>=5)throw Error('transport_capacity');const abort=new AbortController(),stop=()=>abort.abort(),cleanup=()=>{options.signal.removeEventListener('abort',stop);transports.delete(abort);};options.signal.addEventListener('abort',stop,{once:true});transports.add(abort);try{const response=await fetcher(url,{...options,signal:abort.signal});if(abort.signal.aborted){response.body?.cancel().catch(()=>{});throw Error('paused');}const max=url==='/api-nx-history.json'?LIMITS.manifestBytes:LIMITS.pageBytes;if(response.status!==200||!/^"nx-history-[a-f0-9]{64}"$/.test(response.headers.get('ETag')??'')||!['accepted_cache','retained_last_good'].includes(response.headers.get('X-Astra-NX-History-Mode'))||!/^[a-f0-9]{64}$/.test(response.headers.get('X-Astra-NX-History-Generation')??'')||!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')??'')||Number(response.headers.get('Content-Length'))>max){cleanup();response.body?.cancel().catch(()=>{});return response;}if(!response.body){cleanup();return response;}const reader=response.body.getReader();return new Response(new ReadableStream({async pull(controller){try{const part=await reader.read();if(part.done){cleanup();controller.close();}else controller.enqueue(part.value);}catch(error){cleanup();controller.error(error);}},async cancel(reason){cleanup();await reader.cancel(reason);}}),{status:response.status,statusText:response.statusText,headers:response.headers});}catch(error){cleanup();throw error;}};
 const client=createNxHistoryClient({enabled:true,fetcher:transport,now,isEnabled:available});
 const state=()=>({selection:selection?{...selection}:null,pending,status,error:lastError,requested:attempted?{...attempted}:null,mode:loaded?.mode??null,indexHash:loaded?.indexHash??null});
 const emit=()=>onChange(state());
 async function load(window){
  if(!available()){status='paused';emit();return null;}
  if(flight)return flight;
  const mine=++epoch;attempted=window;pending=true;status='loading';lastError=null;emit();
  flight=(async()=>{try{
   const entry=await client.manifest(),weeks=entry.manifest.pages.filter(p=>Date.parse(p.weekStartUtc+'T00:00:00Z')<Date.parse(window.until)&&Date.parse(p.weekStartUtc+'T00:00:00Z')+7*DAY>Date.parse(window.from)).map(p=>p.weekStartUtc);
   if(!weeks.length)throw Object.assign(Error('no_published_hours_in_window'),{emptyWindow:true});
   const next=await client.loadWeeks({weeks});if(mine!==epoch||!available())return null;
   selection=window;loaded=next;status=next.mode==='retained_last_good'?'retained':'accepted';lastError=null;emit();return next;
  }catch(error){if(mine!==epoch)return null;status=available()?(loaded?'retained':error.notPublished?'unpublished':error.emptyWindow?'empty':'unavailable'):'paused';lastError=error.notPublished?'not_published':error.emptyWindow?'no_published_hours':'read_failed';emit();return null;
  }finally{if(mine===epoch){pending=false;flight=null;emit();}}})();return flight;
 }
 function current(){epoch++;for(const abort of transports)abort.abort();transports.clear();flight=null;selection=null;loaded=null;pending=false;status='current';lastError=null;attempted=null;emit();}
 function pause(){epoch++;for(const abort of transports)abort.abort();transports.clear();flight=null;pending=false;if(selection||attempted)status='paused';emit();}
 function chartView(report){
  if(!selection||!loaded)return null;
  const merged=mergeNxArchivedWeeks(report,loaded,{enabled:true});
  const points=merged.smega.filter(p=>[CANONICAL_SOURCE,SOURCE].includes(p.sourceUrl)&&p.aggregation==='source_published_hourly'&&Date.parse(p.at)>=Date.parse(selection.from)&&Date.parse(p.at)<Date.parse(selection.until)).map(p=>({...p}));
  return{points,selection:{...selection},mode:status==='accepted'?'accepted_cache':'retained_last_good',indexHash:loaded.indexHash,label:'Historical source hours · '+windowLabel(selection),sourceObservedAt:null,qualifiedIndividualTrades:0};
 }
 return Object.freeze({state,selectWindow:(start,end)=>load(historicalWindow(start,end)),selectMonth:month=>load(monthWindow(month)),refresh:()=>selection?load(selection):Promise.resolve(null),current,pause,chartView});
}
