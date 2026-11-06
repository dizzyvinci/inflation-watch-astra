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
