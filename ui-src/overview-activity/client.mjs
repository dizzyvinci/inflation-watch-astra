// Explicit-demand only. No idle polling, storage, provider access or legacy mutation.
import {PROTOCOL,PROFILE_PATH,CURRENT_PATH,REQUEST_HEADER,profile,frame,digest,headers,copyBytes,own} from './contract.mjs';
const codes=new Set(['configuration','clock','access_disabled','cancelled','body','access_denied','off','unavailable','disabled','busy','profile','epoch_changed','conditional','status','physical_unknown','timed_out']);
const fail=code=>Object.assign(Error('overview_activity_unavailable'),{code:codes.has(code)?code:'unavailable'});
const errorCode=error=>{try{return codes.has(error?.code)?error.code:'unavailable';}catch{return 'unavailable';}};
export function createOverviewActivityClient({fetcher,isEnabled=()=>false,origin=globalThis.location?.origin,timeoutMs=10000,monotonic=()=>performance.now(),wall=()=>Date.now(),cryptoImpl=globalThis.crypto}={}){
 if(typeof fetcher!=='function'||!['https://inflation.gg','https://www.inflation.gg','http://127.0.0.1:8765','http://localhost:8765'].includes(origin)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>12000)throw fail('configuration');
 let enabled=false,paused=false,pauseReason='paused',epoch=0,flight=null,last=null,profileEpoch=null,status='off',quarantined=false;
 const allowed=()=>{try{return isEnabled()===true;}catch{return false;}};
 const mono=()=>{const n=monotonic();if(!Number.isFinite(n)||n<0)throw fail('clock');return n;};
 const wallTime=()=>{const n=wall();if(!Number.isFinite(n)||n<0)throw fail('clock');return n;};
 const live=(c)=>{const yes=allowed(),at=mono();if(!yes||!enabled||paused||c.epoch!==epoch||c.cancelled||at>=c.deadline)throw fail(!yes?'access_disabled':'cancelled');};
 function cancel(c){c.cancelled=true;c.controller.abort();if(c.reader&&!c.cancel)c.cancel=Promise.resolve().then(()=>c.reader.cancel()).catch(()=>{quarantined=true;});}
 function revoke(next,drop=true){epoch++;status=next;if(drop)last=null;if(flight)cancel(flight);}
 function snapshot(){const before=epoch,selected=last,prepared=selected?own(selected.record.reference):null,displayNow=wallTime(),yes=allowed(),at=mono();const same=selected===last,active=yes&&enabled&&!paused&&before===epoch&&same,fresh=selected&&at-selected.checkedMono<30000&&at>=selected.checkedMono,shown=status==='current'&&!fresh?'retained':status;return {status:!enabled||!yes?'off':paused?'paused':shown,pauseReason:paused?pauseReason:null,reference:enabled&&yes&&same?prepared:null,currentAgainstPublishedPointer:active&&shown==='current'&&selected?.record.currentAgainstPublishedPointer===true,upstreamLatestInspected:false,displayNow,lastVerifiedAt:same?selected?.verifiedAt??null:null,physicalPending:flight!==null,quarantined};}
 async function body(r,limit,c){
  const declared=r.headers.get('Content-Length');if(declared!==null&&(!/^[1-9][0-9]*$/.test(declared)||Number(declared)>limit))throw fail('body');
  if(!/^application\/json(?:;|$)/i.test(r.headers.get('Content-Type')??'')||!r.body)throw fail('body');live(c);
  const storage=new Uint8Array(limit);let n=0;c.reader=r.body.getReader();
  for(;;){const chunk=await c.reader.read();live(c);if(chunk.done)break;const owned=copyBytes(chunk.value,limit-n);storage.set(owned,n);n+=owned.byteLength;}
  c.reader.releaseLock();c.reader=null;if(n===0||declared!==null&&n!==Number(declared))throw fail('body');return storage.slice(0,n);
 }
 async function request(path,limit,c,conditions={}){
  live(c);const r=await fetcher(path,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{[REQUEST_HEADER]:PROTOCOL,...conditions},signal:c.controller.signal});c.response=r;live(c);
  if(r.status===401||r.status===403){revoke('access_denied');throw fail('access_denied');}
  if(r.status===404){revoke('unavailable');throw fail('off');}
  if(r.status===503)throw fail('unavailable');return r;
 }
 async function closeBody(c){
  if(c.reader){if(!c.cancel)c.cancel=Promise.resolve().then(()=>c.reader.cancel()).catch(()=>{quarantined=true;});await c.cancel;try{c.reader.releaseLock();}catch{}c.reader=null;}
  else if(c.response?.body&&!c.response.body.locked){try{await c.response.body.cancel();}catch{quarantined=true;}}
  c.response=null;
 }
 function delivered(c,candidate){
  const prepared={status:candidate.record.state,reference:own(candidate.record.reference),currentAgainstPublishedPointer:candidate.record.currentAgainstPublishedPointer,upstreamLatestInspected:false,lastVerifiedAt:candidate.verifiedAt,physicalPending:flight!==null,quarantined};
  live(c);if(last!==candidate||quarantined)throw fail('cancelled');return prepared;
 }
 return Object.freeze({
  setEnabled(value){if(value!==true){enabled=false;revoke('off');}else{enabled=true;status=last?'retained':'idle';}},
  setPaused(value,reason='paused'){if(!['paused','hidden','offline'].includes(reason))throw fail('configuration');if(value===true){paused=true;pauseReason=reason;revoke('paused',false);}else{paused=false;status=last?'retained':enabled?'idle':'off';}},
  clear(){revoke(enabled?'idle':'off');},
  withdraw(){revoke('access_denied');},
  state:snapshot,
  refresh(){
   if(!enabled||paused||!allowed())return Promise.reject(fail('disabled'));
   if(flight||quarantined)return Promise.reject(fail('busy'));
   const before=last,c={epoch,deadline:mono()+timeoutMs,controller:new AbortController(),cancelled:false,reader:null,response:null,cancel:null},startEpoch=epoch;
   flight=c;status='loading';let rejectTimeout,timer;
   const stopped=new Promise((_,reject)=>rejectTimeout=reject);
   const task=(async()=>{
    try{
     const pr=await request(PROFILE_PATH,512,c);if(pr.status!==200)throw fail('profile');const p=profile(await body(pr,512,c));await closeBody(c);live(c);
     if(profileEpoch!==null&&profileEpoch!==p.publicEpoch){revoke('unavailable');throw fail('epoch_changed');}profileEpoch=p.publicEpoch;
     const prior=last?.record.state==='current'&&last.record.publicEpoch===p.publicEpoch?last:null;
     const r=await request(CURRENT_PATH,8192,c,prior?{'If-None-Match':prior.etag}:{});let candidate;
     if(r.status===304){if(!prior)throw fail('conditional');headers(r,{hash:prior.responseHash,publicEpoch:p.publicEpoch,state:'current',capture:prior.record.reference.source.capturedAt,generated:prior.record.reference.source.sourceGeneratedAt});live(c);candidate=prior;}
     else{
      if(![200,409].includes(r.status))throw fail('status');const bytes=await body(r,8192,c),record=frame(bytes,r.status,p.publicEpoch),responseHash=await digest(bytes,cryptoImpl);live(c);
      const checked=headers(r,{hash:responseHash,publicEpoch:p.publicEpoch,state:record.state,capture:record.reference.source.capturedAt,generated:record.reference.source.sourceGeneratedAt});live(c);candidate={record,responseHash,etag:checked.etag};
     }
     await closeBody(c);candidate={...candidate,checkedMono:mono(),verifiedAt:wallTime()};live(c);if(quarantined)throw fail('physical_unknown');last=candidate;status=candidate.record.state;return candidate;
    }catch(error){if(last!==null&&last!==before&&epoch===startEpoch)last=before;if(epoch===startEpoch)status=before?'retained':'unavailable';throw fail(errorCode(error));}
    finally{await closeBody(c);clearTimeout(timer);if(!quarantined&&flight===c)flight=null;}
   })();
   timer=setTimeout(()=>{cancel(c);if(epoch===startEpoch){last=before;status=before?'retained':'unavailable';}rejectTimeout(fail('timed_out'));},timeoutMs);
   task.catch(()=>{});
   return Promise.race([task,stopped]).then(candidate=>delivered(c,candidate)).catch(error=>{if(epoch===startEpoch){last=before;status=before?'retained':'unavailable';}throw fail(errorCode(error));});
  },
  dispose(){enabled=false;revoke('off');}
 });
}
