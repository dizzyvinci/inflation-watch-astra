// Curated SQL-only owner diagnostic. Never reads R2, raw receipts or a credential.
import {nxHistoryArchiveConfiguration} from './nx-history-owner-work.mjs';
import {validatePointer} from './nx-history-contract.mjs';
import {parseStored} from './api-private-nx-projection.mjs';
const integer=v=>Number.isSafeInteger(v)&&v>=0;
export function nxHistoryArchiveHealth(core,env){
 const configuration=nxHistoryArchiveConfiguration(env),base={diagnosticVersion:1,configuration,diagnosticOnly:true,
  remoteR2Availability:'not_checked',remoteR2ObjectVerified:false,sourceObservedAt:null,qualifiedIndividualTrades:0,
  clockKind:'operator_archive_queue_not_market_observation'};
 if(configuration!=='ready')return{...base,status:'not_enabled'};
 try{
  if(!core.row("SELECT name FROM sqlite_master WHERE type='table' AND name='api_nx_history_owner'"))return{...base,status:'not_initialized'};
  const o=core.row('SELECT state,lease_until,retry_at,failures,last_result FROM api_nx_history_owner WHERE id=1');
  if(!o||!['pending','running','ready','review'].includes(o.state)||!integer(o.retry_at)||!integer(o.failures)||o.lease_until!==null&&!integer(o.lease_until)||![null,'owner_event_retry','archive_owner_bootstrapped','archive_owner_paused','archive_owner_bootstrap_review'].includes(o.last_result))throw Error();
  const owner={bootstrapState:o.state,bootstrapFailures:o.failures,operatorRetryAt:o.retry_at||null,operatorLeaseUntil:o.lease_until,bootstrapResult:o.last_result};
  if(!core.row("SELECT name FROM sqlite_master WHERE type='table' AND name='nx_archive_control'"))return{...base,status:'bootstrap_pending',owner};
  const a=core.row('SELECT state,row_count,event_count,variant_count,object_count,object_bytes,generation,retry_at,lease_until,pointer_json FROM nx_archive_control WHERE id=1');
  if(!a||!['ready','review'].includes(a.state)||!['row_count','event_count','variant_count','object_count','object_bytes','generation','retry_at'].every(k=>integer(a[k]))||a.lease_until!==null&&!integer(a.lease_until))throw Error();
  let watermark=null,publishedRows=0;
  if(a.pointer_json!==null){const p=validatePointer(parseStored(a.pointer_json,8192));if(p.generation!==a.generation)throw Error();watermark=p.receiptWatermarkAt;publishedRows=p.rowCount;}
  else if(a.generation!==0)throw Error();
  return{...base,status:'private_sql_only',owner,archiveState:a.state,acceptedHourSideRows:a.row_count,changedRevisionEvents:a.event_count,
   semanticVariants:a.variant_count,reservedImmutableObjects:a.object_count,reservedImmutableBytes:a.object_bytes,
   publishedGeneration:a.generation,publishedHourSideRows:publishedRows,publishedReceiptWatermarkAt:watermark,
   publishedClockMeaning:'original_included_HTTP_captures_not_inspection_time_or_individual_trade',
   operatorRetryAt:a.retry_at||null,operatorLeaseUntil:a.lease_until};
 }catch{return{...base,status:'diagnostic_unavailable'};}
}
