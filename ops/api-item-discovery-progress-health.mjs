// Private observation only. No queue scan, object I/O, work admission or mutation.
import {itemLifecycleRuntimeFlights,itemLifecycleDecisionObservations} from './api-item-continuous-lifecycle.mjs';
import {discoveryPriceMembershipConfiguration} from './api-discovery-price-membership.mjs';
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const clock=v=>integer(v)&&v<8640000000000000;
const nullableClock=v=>v===null||clock(v);
const check=v=>{if(!v)throw Error('invalid_discovery_progress');};
const due=v=>v===0?null:v;
const base=()=>({diagnosticVersion:2,profile:'control_only',remoteR2Availability:'not_checked',remoteR2ObjectVerified:false,qualifiedIndividualTrades:0});
function readProgress(core,decisions=false){
 try{
  const tables=core.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('private_item_continuous','discovery_control','discovery_outbox') ORDER BY name LIMIT 3").toArray();
  check(Array.isArray(tables)&&tables.length<=3);const names=new Set(tables.map(r=>r.name));
  check(names.size===tables.length&&tables.every(r=>['private_item_continuous','discovery_control','discovery_outbox'].includes(r.name)));
  if(!names.has('private_item_continuous'))return null;
  const attached=names.has('discovery_control')&&names.has('discovery_outbox');
  check(attached||!names.has('discovery_control')&&!names.has('discovery_outbox'));
  const r=core.row(attached?
   (decisions?'SELECT c.selected_generation,d.last_price_generation,':'SELECT ')+ 'c.phase,c.retry_at,c.lease_until,c.failures,d.id AS control_id,d.dirty,d.retry_at AS discovery_retry_at,d.generation,o.id AS outbox_id,o.state AS outbox_state,o.phase AS outbox_phase,o.retry_at AS outbox_retry_at,o.lease_until AS outbox_lease_until,o.failures AS outbox_failures FROM private_item_continuous c LEFT JOIN discovery_control d ON d.id=1 LEFT JOIN discovery_outbox o ON o.id=1 WHERE c.id=1 LIMIT 1':
   (decisions?'SELECT selected_generation,':'SELECT ')+ 'phase,retry_at,lease_until,failures FROM private_item_continuous WHERE id=1 LIMIT 1');
  check(r&&['bootstrap','idle','items','discovery','review'].includes(r.phase)&&clock(r.retry_at)&&nullableClock(r.lease_until)&&integer(r.failures));
  let discovery=null,outbox=null;
  if(attached){
   check(r.control_id===1&&r.outbox_id===1&&[0,1].includes(r.dirty)&&clock(r.discovery_retry_at)&&integer(r.generation));
   check(['idle','pending','published','superseded','quarantined'].includes(r.outbox_state)&&[null,'pages','manifest','pointer'].includes(r.outbox_phase)&&clock(r.outbox_retry_at)&&nullableClock(r.outbox_lease_until)&&integer(r.outbox_failures));
   discovery={dirty:r.dirty===1,operatorRetryAt:due(r.discovery_retry_at),generationOrdinal:r.generation};
   outbox={state:r.outbox_state,phase:r.outbox_phase,operatorRetryAt:due(r.outbox_retry_at),operatorLeaseUntil:r.outbox_lease_until,failures:r.outbox_failures};
  }
  let extra={};if(decisions){const selected=r.selected_generation,last=attached?r.last_price_generation:null;check(selected===null||typeof selected==='string'&&/^[a-f0-9]{64}$/.test(selected));check(last===null||typeof last==='string'&&/^[a-f0-9]{64}$/.test(last));let configuration='not_inspected';try{const env=core.env;if(env&&typeof env==='object')configuration=discoveryPriceMembershipConfiguration(env);}catch{}extra={diagnosticVersion:3,profile:'control_decisions',priceBuildBinding:!attached?'not_checked':selected===null?'not_selected':selected===last?'matches':'differs',membershipConfiguration:configuration,decisions:itemLifecycleDecisionObservations(core)};}
  return{...base(),...extra,status:'observed',scope:'local_SQL_and_in_memory_flights_not_remote_object_verification',lifecycle:{phase:r.phase,operatorRetryAt:due(r.retry_at),operatorLeaseUntil:r.lease_until,failures:r.failures},discovery,outbox,membershipJobs:{status:'not_checked_control_only'},runtime:itemLifecycleRuntimeFlights(core)};
 }catch{return{...base(),...(decisions?{diagnosticVersion:3,profile:'control_decisions'}:{}),status:'diagnostic_unavailable'};}
}

export function privateItemDiscoveryProgressHealth(core){return readProgress(core);}
export function privateItemDiscoveryDecisionHealth(core){return readProgress(core,true);}

// V4 is a separate metadata-only view. V2/V3 above remain unchanged.
const checkpointBase=()=>({...base(),diagnosticVersion:4,profile:'control_checkpoint'});
const lifecycleResults=['continuous_bootstrapped','one_owned_prices_selected','item_committed','item_profile_or_artifact_review','normalized_price_membership_configuration_review','membership_profile_review','normalized_price_membership_review','continuous_capacity_hold','item_and_discovery_committed'];
const muxKinds=['private','public','nx','nx-r2','items','history','discovery','registry','nx-history','calculations','provider'];
const selectedJobFields=['source_attempt','state','phase','claim','available_at','lease_until'];
const fixedSqlResult=(column,values)=>`CASE WHEN ${column} IS NULL THEN NULL WHEN ${column} IN (${values.map(v=>`'${v}'`).join(',')}) THEN ${column} ELSE 'other' END`;
const fixedOptionalInitialization=core=>{const d=Object.getOwnPropertyDescriptor(core,'indexBridgeInitialization');return !d?null:d.value==='definition_or_scope_review'?'definition_or_scope_review':'other';};
export function privateItemDiscoveryCheckpointHealth(core){
 try{
  // Aggregate only five fixed schema names; one returned row, no queue/source scan.
  const names=core.row("SELECT MAX(CASE WHEN name='private_item_continuous' THEN 1 ELSE 0 END) AS c,MAX(CASE WHEN name='discovery_control' THEN 1 ELSE 0 END) AS d,MAX(CASE WHEN name='discovery_outbox' THEN 1 ELSE 0 END) AS o,MAX(CASE WHEN name='private_item_jobs' THEN 1 ELSE 0 END) AS j,MAX(CASE WHEN name='api_cash_alarm_mux' THEN 1 ELSE 0 END) AS m FROM sqlite_master WHERE type='table' AND name IN ('private_item_continuous','discovery_control','discovery_outbox','private_item_jobs','api_cash_alarm_mux')");
  check(names&&Object.keys(names).sort().join(',')==='c,d,j,m,o'&&Object.values(names).every(v=>v===null||v===0||v===1));
  if(names.c!==1)return null;
  check((names.d===1)===(names.o===1));const attached=names.d===1;
  const fields=[
   'c.phase','c.retry_at','c.lease_until','c.failures','c.selected_generation','c.selected_attempt','c.cutoff_attempt','c.claim',
   fixedSqlResult('c.last_result',lifecycleResults)+' AS last_result',
   ...(attached?['d.id AS control_id','d.dirty','d.retry_at AS discovery_retry_at','d.generation','d.last_price_generation','o.id AS outbox_id','o.state AS outbox_state','o.phase AS outbox_phase','o.retry_at AS outbox_retry_at','o.lease_until AS outbox_lease_until','o.failures AS outbox_failures','o.claim AS outbox_claim','o.revision AS outbox_revision']:[]),
   ...selectedJobFields.map(k=>`${names.j===1?'j.'+k:'NULL'} AS job_${k}`),
   ...(names.m===1?['m.id AS mux_id',fixedSqlResult('m.last_kind',muxKinds)+' AS mux_last_kind','m.provider_at AS mux_provider_at','m.recovery_at AS mux_recovery_at','m.initialized AS mux_initialized']:['NULL AS mux_id','NULL AS mux_last_kind','NULL AS mux_provider_at','NULL AS mux_recovery_at','NULL AS mux_initialized'])
  ];
  const sql='SELECT '+fields.join(',')+' FROM private_item_continuous c'+(attached?' LEFT JOIN discovery_control d ON d.id=1 LEFT JOIN discovery_outbox o ON o.id=1':'')+(names.j===1?' LEFT JOIN private_item_jobs j ON j.receipt_key=c.selected_receipt':'')+(names.m===1?' LEFT JOIN api_cash_alarm_mux m ON m.id=1':'')+' WHERE c.id=1 LIMIT 1';
  const r=core.row(sql),at=core.clock();
  check(r&&clock(at)&&['bootstrap','idle','items','discovery','review'].includes(r.phase)&&clock(r.retry_at)&&nullableClock(r.lease_until)&&integer(r.failures)&&integer(r.claim));
  check([r.selected_attempt,r.cutoff_attempt].every(v=>v===null||integer(v)&&v>0)&&!(r.selected_attempt!==null&&r.cutoff_attempt!==null&&r.cutoff_attempt<r.selected_attempt));
  check(r.last_result===null||[...lifecycleResults,'other'].includes(r.last_result));
  let discovery=null,outbox=null;
  if(attached){
   check(r.control_id===1&&r.outbox_id===1&&[0,1].includes(r.dirty)&&clock(r.discovery_retry_at)&&integer(r.generation));
   check(['idle','pending','published','superseded','quarantined'].includes(r.outbox_state)&&[null,'pages','manifest','pointer'].includes(r.outbox_phase)&&clock(r.outbox_retry_at)&&nullableClock(r.outbox_lease_until)&&integer(r.outbox_failures)&&integer(r.outbox_claim)&&(r.outbox_revision===null||integer(r.outbox_revision)));
   discovery={dirty:r.dirty===1,operatorRetryAt:due(r.discovery_retry_at),generationOrdinal:r.generation};
   outbox={state:r.outbox_state,phase:r.outbox_phase,operatorRetryAt:due(r.outbox_retry_at),operatorLeaseUntil:r.outbox_lease_until,failures:r.outbox_failures,claim:r.outbox_claim,revision:r.outbox_revision};
  }
  const selected=r.selected_generation,last=attached?r.last_price_generation:null;
  check(selected===null||typeof selected==='string'&&/^[a-f0-9]{64}$/.test(selected));check(last===null||typeof last==='string'&&/^[a-f0-9]{64}$/.test(last));
  let job=null;
  if(r.job_source_attempt!==null){
   check(names.j===1&&integer(r.job_source_attempt)&&r.job_source_attempt>0&&['pending','running','complete','superseded','paused','review','quarantined'].includes(r.job_state)&&['decode','shards','manifest','pointer','done'].includes(r.job_phase)&&integer(r.job_claim)&&clock(r.job_available_at)&&nullableClock(r.job_lease_until));
   job={state:r.job_state,phase:r.job_phase,claim:r.job_claim,operatorAvailableAt:r.job_available_at,operatorLeaseUntil:r.job_lease_until,selectedAttemptMatches:r.job_source_attempt===r.selected_attempt};
  }else check(selectedJobFields.every(k=>r['job_'+k]===null));
  let mux=null;
  if(r.mux_id!==null){check(r.mux_id===1&&(r.mux_last_kind===null||[...muxKinds,'other'].includes(r.mux_last_kind))&&nullableClock(r.mux_provider_at)&&nullableClock(r.mux_recovery_at)&&[0,1].includes(r.mux_initialized));mux={lastKind:r.mux_last_kind,operatorProviderDeadline:r.mux_provider_at,operatorRecoveryDeadline:r.mux_recovery_at,initialized:r.mux_initialized===1};}
  else check(['mux_last_kind','mux_provider_at','mux_recovery_at','mux_initialized'].every(k=>r[k]===null));
  let configuration='not_inspected';if(core.env&&typeof core.env==='object')configuration=discoveryPriceMembershipConfiguration(core.env);
  return{...checkpointBase(),status:'observed',scope:'local_SQL_and_in_memory_flights_not_remote_object_verification',operatorObservedAt:at,clockKind:'operator_checkpoint_not_market_or_dispatch_time',priceBuildBinding:!attached?'not_checked':selected===null?'not_selected':selected===last?'matches':'differs',membershipConfiguration:configuration,decisions:itemLifecycleDecisionObservations(core),lifecycle:{phase:r.phase,operatorRetryAt:due(r.retry_at),operatorLeaseUntil:r.lease_until,failures:r.failures},discovery,outbox,membershipJobs:{status:'not_checked_control_only'},runtime:itemLifecycleRuntimeFlights(core),checkpoint:{controllerClaim:r.claim,lastResult:r.last_result,selectedAttempt:r.selected_attempt,cutoffAttempt:r.cutoff_attempt,selectedJob:job,mux,indexInitialization:fixedOptionalInitialization(core),sharedReconciliationOutcome:'not_recorded',dispatchHistory:'not_recorded'}};
 }catch{return{...checkpointBase(),status:'diagnostic_unavailable'};}
}

// Separate V5 wrapper: no arming, scheduling, source work or additional SQL.
import {continuousConfiguration as checkpointContinuousConfiguration} from './api-item-continuous-lifecycle.mjs';
export async function privateItemDiscoveryCheckpointAndAlarmHealth(core,storage){
 const value=privateItemDiscoveryCheckpointHealth(core);
 if(value===null||!checkpointAlarmEnabled(core))return value;
 let nativeAlarm={status:'unknown'};
 try{
  const getAlarm=storage?.getAlarm;
  if(typeof getAlarm==='function'){
   const scheduled=await getAlarm.call(storage),observed=core.clock();
   if(nullableAlarm(scheduled)&&clock(observed))nativeAlarm={status:'observed',operatorScheduledAt:scheduled,operatorObservedAt:observed};
  }
 }catch{}
 if(!checkpointAlarmEnabled(core))return value;
 return{...value,diagnosticVersion:5,profile:'control_checkpoint_and_alarm',nativeAlarm};
}
function nullableAlarm(value){return value===null||clock(value);}
function checkpointAlarmEnabled(core){try{return checkpointContinuousConfiguration(core.env??{}).status==='continuous_ready';}catch{return false;}}
