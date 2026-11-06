// Same-owner retained history scope only. No transport, keys or job authorization.
import {OBSERVED_PLAN_SHA256} from './observed-firstpass-plan.mjs';
import {historyOperation,ItemHistoryContractError} from './api-item-hour-history-profile.mjs';
export {OBSERVED_PLAN_SHA256};
export class HistoryAuthorityPause extends Error{}
const need=(v,code)=>{if(!v)throw new ItemHistoryContractError(code);};
const REF=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,31}$/;
export function privateHistoryConfiguration(env,core){try{
 const v=JSON.parse(env.API_PRIVATE_ITEM_HISTORY_JSON??'{"enabled":false}');if(v?.enabled===false)return'disabled';
 if(!v||Object.keys(v).sort().join(',')!=='enabled,methodVersion,publicationEnabled,schemaVersion'||v.enabled!==true||v.schemaVersion!==1||v.methodVersion!==1||v.publicationEnabled!==false)return'invalid_configuration';
 if(core.config().enabled!==true)return'requires_enabled_grant';if(typeof env.API_RAW_RECEIPTS?.get!=='function')return'requires_private_storage';return'ready';
}catch{return'invalid_configuration';}}
export function historyScope(core){const g=core.config();if(g.enabled!==true)throw new HistoryAuthorityPause('history_grant_disabled');return{enabled:true,grantReference:g.grantReference,roundReference:g.probeRound,observedPlanHash:OBSERVED_PLAN_SHA256};}
export function ownedHistorySource(core,plan,receiptKey){
 const scope=historyScope(core),m=/^_private\/provider-api\/v1\/receipts\/([0-9]{12,16})-(apple-history|observed-history-[1-9][0-9]{0,8})-([a-f0-9]{64})\.json$/.exec(receiptKey??'');need(m,'history_receipt_key');const id=Number(m[1]),operation=m[2],definition=historyOperation(operation);need(Number.isSafeInteger(id)&&id>0&&String(id).padStart(12,'0')===m[1]&&definition,'history_source_target');
 // Completed transport deliberately clears api_jobs.attempt_id; it is a lease, not history authority.
 const a=core.row("SELECT * FROM api_attempts WHERE id=? AND result='success'",id);need(a&&Number.isSafeInteger(a.at)&&a.at>0,'history_successful_source_attempt');
 const j=core.row('SELECT * FROM api_jobs WHERE job_key=? AND receipt_key=?',a.job_key,receiptKey);need(j&&j.state==='complete'&&j.operation===operation,'history_completed_source_job');
 if(j.round_ref!==scope.roundReference)throw new HistoryAuthorityPause('history_source_round_changed');if(a.grant_ref!==scope.grantReference)throw new HistoryAuthorityPause('history_source_grant_changed');
 let presence=null;
 if(operation==='apple-history')need(j.job_key===`${scope.roundReference}:5:apple-history`,'history_fixed_probe_identity');
 else{
  need(plan?.hash===OBSERVED_PLAN_SHA256,'history_pinned_registry');const r=core.row('SELECT * FROM api_observed_jobs WHERE job_key=?',j.job_key),p=core.row('SELECT * FROM api_observed_plans WHERE plan_hash=?',OBSERVED_PLAN_SHA256);need(r&&p&&r.plan_hash===plan.hash&&Number.isSafeInteger(r.ordinal)&&r.ordinal>=0&&r.ordinal<plan.totalJobs,'history_registered_ordinal');
  let cfg;try{cfg=JSON.parse(p.config_json);}catch{need(false,'history_registered_config');}
  need(cfg&&Object.keys(cfg).sort().join(',')==='approvalRecorded,chunkSize,enabled,grantReference,maxAttemptsPerJob,maxQueuedJobs,planSha256,queueReference,roundReference'&&cfg.enabled===true&&cfg.approvalRecorded===true&&cfg.planSha256===plan.hash&&REF.test(cfg.queueReference??'')&&Number.isSafeInteger(cfg.chunkSize)&&cfg.chunkSize>=1&&cfg.chunkSize<=64&&Number.isSafeInteger(cfg.maxQueuedJobs)&&cfg.maxQueuedJobs>=cfg.chunkSize&&cfg.maxQueuedJobs<=128&&Number.isSafeInteger(cfg.maxAttemptsPerJob)&&cfg.maxAttemptsPerJob>=1&&cfg.maxAttemptsPerJob<=5,'history_registered_config');
  if(cfg.grantReference!==scope.grantReference||cfg.roundReference!==scope.roundReference||p.round_ref!==scope.roundReference)throw new HistoryAuthorityPause('history_registry_authority_changed');
  const target=plan.targets[Math.floor(r.ordinal/2)],kind=r.ordinal%2?'history':'detail',key=`${scope.roundReference}:s:${cfg.queueReference}:${target.priority?0:1}:${String(r.ordinal).padStart(6,'0')}:${kind}`;
  need(kind==='history'&&r.kind===kind&&r.item_id===target.itemId&&definition.itemId===target.itemId&&r.operation===`observed-history-${target.itemId}`&&j.job_key===key&&r.presence_json===JSON.stringify(target)&&p.queue_ref===cfg.queueReference&&p.total_jobs===plan.totalJobs&&Number.isSafeInteger(p.cursor)&&p.cursor>r.ordinal,'history_registered_identity_presence');presence=[...target.apiPresence];
 }
 return{jobKey:j.job_key,receiptKey,operation,itemId:definition.itemId,sourceUrl:definition.sourceUrl,sourceAttempt:id,rawSha:m[3],requestAt:a.at,grantReference:scope.grantReference,roundReference:scope.roundReference,planHash:operation==='apple-history'?null:plan.hash,sourcePresence:presence};
}
