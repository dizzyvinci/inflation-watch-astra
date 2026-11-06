import {ObservedFirstPass} from '../ops/api-observed-firstpass.mjs';
export function seedObserved(f,{count=1,start=0,raw=null}={}){
 const work=f.owner.privateCash.historyWork,plan=work.plan,config=f.core.config(),cfg={enabled:true,approvalRecorded:true,planSha256:plan.hash,queueReference:'synthetic-history',roundReference:config.probeRound,grantReference:config.grantReference,chunkSize:8,maxQueuedJobs:64,maxAttemptsPerJob:3};
 const observed=new ObservedFirstPass({storage:{sql:f.core.sql}},f.env,plan);observed.ensureTables();
 f.core.sql.exec('INSERT OR REPLACE INTO api_observed_plans(plan_hash,queue_ref,round_ref,config_json,total_jobs,cursor,created_at) VALUES(?,?,?,?,?,?,?)',plan.hash,cfg.queueReference,config.probeRound,JSON.stringify(cfg),plan.totalJobs,(start+count)*2,f.now[0]);
 const all=[];for(let i=start;i<start+count;i++){const target=plan.targets[i],ordinal=i*2+1,op=`observed-history-${target.itemId}`,key=`${config.probeRound}:s:${cfg.queueReference}:${target.priority?0:1}:${String(ordinal).padStart(6,'0')}:history`,r=f.makeObservedReceipt({operation:op,attemptId:100+i,raw:raw??undefined}),e=r.envelope;
  Object.assign(e,{observedPlanSha256:plan.hash,expectedItemId:target.itemId,sourcePresence:[...target.apiPresence]});
  f.objects.set(r.key,{body:JSON.stringify(e),etag:r.key});
  f.core.sql.exec('INSERT INTO api_observed_jobs(job_key,plan_hash,operation,item_id,kind,ordinal,presence_json) VALUES(?,?,?,?,?,?,?)',key,plan.hash,op,target.itemId,'history',ordinal,JSON.stringify(target));
  f.finishOwnedHistory(r,key);all.push(r);
 }return all;
}
