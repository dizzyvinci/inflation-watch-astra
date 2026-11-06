import {fixture,PRIVATE_FLAG} from './api-public-cash-fixture.mjs';
import {receipt} from './item-hour-fixture.mjs';
export const HISTORY_FLAG=PRIVATE_FLAG;
export async function historyFixture(t,{flag=HISTORY_FLAG,cash=false,nx=false,r2=false,items=false}={}){
 const f=await fixture(t,{privateFlag:cash?PRIVATE_FLAG:{enabled:false},publicFlag:null,nxFlag:nx?PRIVATE_FLAG:{enabled:false}});
 f.now[0]=Date.parse('2026-11-06T01:00:00Z');
 if(flag!==null)f.env.API_PRIVATE_ITEM_HISTORY_JSON=JSON.stringify(flag);
 if(r2)f.env.API_PRIVATE_NX_R2_JSON=JSON.stringify(PRIVATE_FLAG);
 if(items){f.env.API_PRIVATE_ITEMS_JSON=JSON.stringify(PRIVATE_FLAG);f.env.API_PRIVATE_ITEM_PILOT_JSON=JSON.stringify({schemaVersion:1,enabled:true,sourceAttemptId:1});}
 const restart=f.restart;f.restart=async()=>{const old=Date.now;Date.now=()=>f.now[0];try{await restart();}finally{Date.now=old;}};await f.restart();
 f.finishOwnedHistory=(r,key)=>{const e=r.envelope;f.core.sql.exec("INSERT INTO api_jobs(job_key,operation,round_ref,state,available_at,lease_until,attempt_id) VALUES(?,?,?,'running',?,?,?)",key,e.operation,e.roundReference,Date.parse(e.requestStartedAt),f.now[0]+130000,e.attemptId);
   f.core.sql.exec('INSERT INTO api_attempts(id,job_key,at,grant_ref) VALUES(?,?,?,?)',e.attemptId,key,Date.parse(e.requestStartedAt),e.grantReference);
   const j=f.row('SELECT * FROM api_jobs WHERE job_key=?',key),outcome=f.core.finish(j,f.core.config(),{kind:'success',receiptKey:r.key,capturedAt:e.capturedAt});if(outcome.status!=='success'||f.row('SELECT attempt_id FROM api_jobs WHERE job_key=?',key).attempt_id!==null)throw Error('Real core.finish did not preserve completed receipt and clear lease');
  };
 f.seedHistory=(options={})=>{const scope={grantReference:f.core.config().grantReference,roundReference:f.core.config().probeRound},r=receipt({...options,scope}),e=r.envelope,key=`${scope.roundReference}:5:apple-history`;
  f.objects.set(r.key,{body:JSON.stringify(e),etag:r.key});
  f.finishOwnedHistory(r,key);return r;};
 f.makeObservedReceipt=options=>receipt({...options,scope:{grantReference:f.core.config().grantReference,roundReference:f.core.config().probeRound}});
 f.bootstrap=async()=>{if(f.owner.privateCash.historyWork?.plan)return;const r=await f.fire();if(r.status!=='history_registry_ready')throw Error('bootstrap failed '+r.status);};
 f.finishHistory=async(limit=12)=>{const events=[];for(let i=0;i<limit&&await f.alarm()!==null;i++){const before=f.calls.length,reads=f.reads.length,r=await f.fire();if(r.eventKind==='private_item_history'){if(f.calls.length!==before)throw Error('history called provider');if(f.reads.length-reads>1)throw Error('more than one raw/event');}events.push(r);}return events;};
 return f;
}
