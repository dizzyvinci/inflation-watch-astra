import {privateHistoryConfiguration} from './api-private-item-history-contract.mjs';
// SQL-only operator diagnostic; never an assertion about a remote projection.
export function privateItemHistoryHealth(core,env){
 const configuration=privateHistoryConfiguration(env,core),base={diagnosticVersion:1,configuration,remoteR2Availability:'not_checked',remoteR2ObjectVerified:false,publicationEligible:false,sourceObservedAt:null,qualifiedIndividualTrades:0,clockKind:'operator_intake_progress_not_market_observation'};
 if(configuration!=='ready')return{...base,status:'disabled_or_invalid'};
 try{
  if(!core.row("SELECT name FROM sqlite_master WHERE type='table' AND name='private_item_history_control'"))return{...base,status:'not_initialized'};
  const control=core.row('SELECT registry_state,blocked_until,event_retry_at FROM private_item_history_control WHERE id=1');
  const counts={pending:0,running:0,complete:0,paused:0,quarantined:0};
  for(const r of core.sql.exec('SELECT state,COUNT(*) AS n FROM private_item_history_jobs GROUP BY state').toArray()){if(!Object.hasOwn(counts,r.state)||!Number.isSafeInteger(r.n)||r.n<0)throw Error();counts[r.state]=r.n;}
  const latest=core.row("SELECT captured_at,capture_hash,accepted_rows FROM private_item_history_jobs WHERE state='complete' ORDER BY captured_at DESC,source_attempt DESC LIMIT 1");
  if(latest&&(!/^[a-f0-9]{64}$/.test(latest.capture_hash??'')||!Number.isFinite(Date.parse(latest.captured_at))||!Number.isSafeInteger(latest.accepted_rows)||latest.accepted_rows<0))throw Error();
  const rows=core.row('SELECT COUNT(*) AS n FROM private_item_hour_latest').n,revisions=core.row('SELECT COUNT(*) AS n FROM private_item_hour_revisions').n;
  return{...base,status:'private_sql_only',registryState:control.registry_state,jobs:counts,latestOriginalCapturedAt:latest?.captured_at??null,latestCaptureSha256:latest?.capture_hash??null,latestCaptureRows:latest?.accepted_rows??null,sourceHourRows:rows,changedRowRevisions:revisions,retryNotBefore:Math.max(control.blocked_until,control.event_retry_at)>0?new Date(Math.max(control.blocked_until,control.event_retry_at)).toISOString():null};
 }catch{return{...base,status:'diagnostic_unavailable'};}
}
