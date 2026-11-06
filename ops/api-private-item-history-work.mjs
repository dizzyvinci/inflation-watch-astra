// Private retained-source intake: one owner, one cached receipt/event; no provider transport.
import {PrivateItemHourLedger} from './api-item-hour-history-ledger.mjs';
import {ItemHistoryContractError} from './api-item-hour-history-profile.mjs';
import {loadObservedPlan} from './api-observed-firstpass.mjs';
import {observedPlanBytes} from './observed-firstpass-plan.mjs';
import {privateHistoryConfiguration,historyScope,ownedHistorySource,HistoryAuthorityPause,OBSERVED_PLAN_SHA256} from './api-private-item-history-contract.mjs';
import {historyEnvelopeText,parseHistoryEnvelope} from './api-private-item-history-receipt.mjs';
const LEASE=130000,HIGH_WATER=64;
class Disabled extends Error{}class Stale extends Error{}class StorageFailure extends Error{}
const io=async fn=>{try{return await fn();}catch(e){if(e instanceof ItemHistoryContractError)throw e;throw new StorageFailure();}};
export class PrivateItemHistoryWork{
 constructor(ctx,env,core,{planLoader=()=>loadObservedPlan(observedPlanBytes(),OBSERVED_PLAN_SHA256)}={}){
  this.ctx=ctx;this.env=env;this.core=core;this.planLoader=planLoader;this.flight=null;this.plan=core.observed?.plan?.hash===OBSERVED_PLAN_SHA256?core.observed.plan:null;
  if(!this.active)return;
  ctx.storage.transactionSync(()=>{
   core.sql.exec("CREATE TABLE IF NOT EXISTS private_item_history_control(id INTEGER PRIMARY KEY CHECK(id=1),registry_state TEXT NOT NULL DEFAULT 'pending',available_at INTEGER NOT NULL,lease_until INTEGER,claim INTEGER NOT NULL DEFAULT 0,event_retry_at INTEGER NOT NULL DEFAULT 0,reconcile_pending INTEGER NOT NULL DEFAULT 0,blocked_until INTEGER NOT NULL DEFAULT 0,storage_failures INTEGER NOT NULL DEFAULT 0)");
   core.sql.exec('INSERT OR IGNORE INTO private_item_history_control(id,available_at) VALUES(1,?)',core.clock());
   core.sql.exec("CREATE TABLE IF NOT EXISTS private_item_history_jobs(receipt_key TEXT PRIMARY KEY,source_job_key TEXT NOT NULL,operation TEXT NOT NULL,item_id INTEGER NOT NULL,source_attempt INTEGER NOT NULL,raw_sha TEXT NOT NULL,request_at INTEGER NOT NULL,grant_ref TEXT NOT NULL,round_ref TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',available_at INTEGER NOT NULL,lease_until INTEGER,claim INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,last_result TEXT,captured_at TEXT,capture_hash TEXT,accepted_rows INTEGER)");
   core.sql.exec('CREATE INDEX IF NOT EXISTS private_item_history_source_jobs ON api_jobs(state,round_ref,job_key,receipt_key)');
   core.sql.exec('CREATE INDEX IF NOT EXISTS private_item_history_ready ON private_item_history_jobs(state,available_at,source_attempt)');
   core.sql.exec('CREATE INDEX IF NOT EXISTS private_item_history_latest ON private_item_history_jobs(state,captured_at DESC,source_attempt DESC)');
   core.sql.exec('CREATE INDEX IF NOT EXISTS private_item_history_item_state ON private_item_history_jobs(state,item_id)');
   core.sql.exec('CREATE TABLE IF NOT EXISTS private_item_history_rejections(source_job_key TEXT PRIMARY KEY,reason TEXT NOT NULL,authority_scope TEXT)');
   if(this.plan)core.sql.exec("UPDATE private_item_history_control SET registry_state='ready',lease_until=NULL WHERE id=1 AND registry_state<>'review'");
   else core.sql.exec("UPDATE private_item_history_control SET registry_state='pending',available_at=?,lease_until=NULL WHERE id=1 AND registry_state='ready'",core.clock());
  });
  this.ledger=new PrivateItemHourLedger(ctx,{enabled:true,isEnabled:()=>this.active,getScope:()=>historyScope(core)});
 }
 get active(){return privateHistoryConfiguration(this.env,this.core)==='ready';}
 row(q,...a){return this.core.row(q,...a);}control(){return this.row('SELECT * FROM private_item_history_control WHERE id=1');}
 guard(){if(!this.active)throw new Disabled();}
 syncAuthority(){const s=historyScope(this.core);this.core.sql.exec("UPDATE private_item_history_jobs SET state='paused',lease_until=NULL,last_result='authority_changed' WHERE state IN ('pending','running') AND (grant_ref<>? OR round_ref<>?)",s.grantReference,s.roundReference);this.core.sql.exec("UPDATE private_item_history_jobs SET state='pending',lease_until=NULL WHERE state='paused' AND grant_ref=? AND round_ref=?",s.grantReference,s.roundReference);return s;}
 reconcile(limit=8){if(!this.active)return{status:'disabled',queued:0};if(!Number.isSafeInteger(limit)||limit<1||limit>8)throw new ItemHistoryContractError('history_bounded_reconcile');if(!this.plan||this.control().registry_state!=='ready')return{status:'history_registry_pending',queued:0};
  return this.ctx.storage.transactionSync(()=>{const s=this.syncAuthority();this.core.sql.exec("DELETE FROM private_item_history_rejections WHERE reason='authority_paused' AND authority_scope<>?",JSON.stringify(s));const outstanding=this.row("SELECT COUNT(*) AS n FROM private_item_history_jobs WHERE state IN ('pending','running')").n,n=Math.min(limit,Math.max(0,HIGH_WATER-outstanding));if(!n){this.core.sql.exec('UPDATE private_item_history_control SET reconcile_pending=0 WHERE id=1');return{status:'history_queue_bounded',queued:0};}
   const rows=this.core.sql.exec("SELECT j.job_key,j.receipt_key FROM api_jobs j LEFT JOIN private_item_history_jobs h ON h.receipt_key=j.receipt_key LEFT JOIN private_item_history_rejections x ON x.source_job_key=j.job_key WHERE j.state='complete' AND j.round_ref=? AND (j.operation='apple-history' OR j.operation LIKE 'observed-history-%') AND j.receipt_key IS NOT NULL AND h.receipt_key IS NULL AND x.source_job_key IS NULL ORDER BY j.job_key LIMIT ?",s.roundReference,n).toArray();let queued=0;
   for(const r of rows){let source;try{source=ownedHistorySource(this.core,this.plan,r.receipt_key);}catch(error){if(error instanceof HistoryAuthorityPause){this.core.sql.exec('INSERT OR IGNORE INTO private_item_history_rejections VALUES(?,?,?)',r.job_key,'authority_paused',JSON.stringify(s));continue;}if(!(error instanceof ItemHistoryContractError))throw error;this.core.sql.exec('INSERT OR IGNORE INTO private_item_history_rejections VALUES(?,?,NULL)',r.job_key,'invalid_owned_history_source');continue;}
    this.core.sql.exec('INSERT OR IGNORE INTO private_item_history_jobs(receipt_key,source_job_key,operation,item_id,source_attempt,raw_sha,request_at,grant_ref,round_ref,available_at) VALUES(?,?,?,?,?,?,?,?,?,?)',source.receiptKey,source.jobKey,source.operation,source.itemId,source.sourceAttempt,source.rawSha,source.requestAt,source.grantReference,source.roundReference,this.core.clock());queued++;
   }
   this.core.sql.exec('UPDATE private_item_history_control SET reconcile_pending=? WHERE id=1',rows.length===n?1:0);return{status:'history_reconciled',queued};
  });
 }
 nextDue(){if(!this.active)return null;const c=this.control();if(c.registry_state==='review')return null;
  let due;if(!this.plan||c.registry_state!=='ready')due=c.registry_state==='running'?c.lease_until:c.available_at;
  else{const pending=this.row("SELECT MIN(available_at) AS at FROM private_item_history_jobs WHERE state='pending'").at,running=this.row("SELECT MIN(lease_until) AS at FROM private_item_history_jobs WHERE state='running'").at,n=this.row("SELECT COUNT(*) AS n FROM private_item_history_jobs WHERE state IN ('pending','running')").n;const values=[pending,running,c.reconcile_pending&&n<HIGH_WATER?this.core.clock():null].filter(v=>v!==null);due=values.length?Math.min(...values):null;}
  return due===null?c.event_retry_at>0?c.event_retry_at:null:Math.max(due,c.event_retry_at,c.blocked_until);
 }
 defer(){const at=this.core.clock()+30000;this.core.sql.exec('UPDATE private_item_history_control SET event_retry_at=? WHERE id=1',at);return at;}
 async drainOne(beforeIO){if(!this.active)return{status:'disabled'};if(this.flight)return{status:'history_busy'};if(typeof beforeIO!=='function')throw new ItemHistoryContractError('history_recovery_callback_required');const c=this.control();if(Math.max(c.blocked_until,c.event_retry_at)>this.core.clock())return{status:'history_storage_backoff',retryAt:Math.max(c.blocked_until,c.event_retry_at)};
  this.flight=this.perform(beforeIO);try{return await this.flight;}finally{this.flight=null;}
 }
 async registry(beforeIO){const now=this.core.clock(),claim=this.ctx.storage.transactionSync(()=>{const c=this.control();if(c.registry_state==='running'&&c.lease_until>now)return null;if(!Number.isSafeInteger(c.claim)||c.claim>=Number.MAX_SAFE_INTEGER)throw new ItemHistoryContractError('history_registry_claim_exhausted');this.core.sql.exec("UPDATE private_item_history_control SET registry_state='running',claim=claim+1,lease_until=? WHERE id=1",now+LEASE);return this.control().claim;});if(claim===null)return{status:'history_registry_leased'};
  try{await beforeIO(now+LEASE);this.guard();const plan=await this.planLoader();this.guard();if(plan.hash!==OBSERVED_PLAN_SHA256)throw new ItemHistoryContractError('history_registry_hash');const c=this.control();if(c.claim!==claim||c.registry_state!=='running')return{status:'history_stale_registry_claim'};this.plan=plan;this.core.sql.exec("UPDATE private_item_history_control SET registry_state='ready',lease_until=NULL,event_retry_at=0 WHERE id=1 AND claim=?",claim);return{status:'history_registry_ready',providerAttempted:false};}
  catch(error){const c=this.control();if(c.claim!==claim)return{status:'history_stale_registry_claim'};if(error instanceof Disabled){this.core.sql.exec("UPDATE private_item_history_control SET registry_state='pending',lease_until=NULL WHERE id=1");return{status:'disabled'};}const review=error instanceof TypeError;this.core.sql.exec('UPDATE private_item_history_control SET registry_state=?,lease_until=NULL,available_at=? WHERE id=1',review?'review':'pending',this.core.clock()+30000);return{status:review?'history_registry_review':'history_registry_retry',providerAttempted:false};}
 }
 claim(){return this.ctx.storage.transactionSync(()=>{this.syncAuthority();const now=this.core.clock();this.core.sql.exec("UPDATE private_item_history_jobs SET state='pending',lease_until=NULL,last_result='interrupted' WHERE state='running' AND lease_until<=?",now);const job=this.row("SELECT * FROM private_item_history_jobs WHERE state='pending' AND available_at<=? ORDER BY source_attempt LIMIT 1",now);if(!job)return null;if(!Number.isSafeInteger(job.claim)||job.claim>=Number.MAX_SAFE_INTEGER)throw new ItemHistoryContractError('history_claim_exhausted');this.core.sql.exec("UPDATE private_item_history_jobs SET state='running',claim=claim+1,lease_until=? WHERE receipt_key=?",now+LEASE,job.receipt_key);return{...job,claim:job.claim+1};});}
 fence(job){this.guard();const current=this.row('SELECT state,claim,lease_until FROM private_item_history_jobs WHERE receipt_key=?',job.receipt_key);if(current?.state!=='running'||current.claim!==job.claim||current.lease_until<=this.core.clock())throw new Stale();const source=ownedHistorySource(this.core,this.plan,job.receipt_key);if(source.jobKey!==job.source_job_key||source.rawSha!==job.raw_sha||source.requestAt!==job.request_at||source.grantReference!==job.grant_ref||source.roundReference!==job.round_ref)throw new HistoryAuthorityPause('history_source_context_changed');return source;}
 async perform(beforeIO){this.core.sql.exec('UPDATE private_item_history_control SET event_retry_at=0 WHERE id=1');if(!this.plan||this.control().registry_state!=='ready')return this.registry(beforeIO);
  this.reconcile(8);const job=this.claim();if(!job)return{status:'history_reconciliation_only',providerAttempted:false};
  try{
   await beforeIO(this.core.clock()+LEASE);let source=this.fence(job);const object=await io(()=>this.env.API_RAW_RECEIPTS.get(job.receipt_key));this.fence(job);if(!object)throw new StorageFailure();const text=await io(()=>historyEnvelopeText(object));source=this.fence(job);const envelope=parseHistoryEnvelope(text);
   if(envelope.operation!==source.operation||envelope.attemptId!==source.sourceAttempt||envelope.responseSha256!==source.rawSha||envelope.grantReference!==source.grantReference||envelope.roundReference!==source.roundReference||Date.parse(envelope.requestStartedAt)!==source.requestAt||Date.parse(envelope.capturedAt)>this.core.clock())throw new ItemHistoryContractError('history_raw_context');
   if(source.planHash&&(envelope.observedPlanSha256!==source.planHash||envelope.expectedItemId!==source.itemId||JSON.stringify(envelope.sourcePresence)!==JSON.stringify(source.sourcePresence)))throw new ItemHistoryContractError('history_raw_registry_context');
   const accepted=await this.ledger.append(job.receipt_key,envelope,{onAccepted:projection=>{
    this.fence(job);this.core.sql.exec("UPDATE private_item_history_jobs SET state='complete',lease_until=NULL,failures=0,last_result='history_sql_accepted',captured_at=?,capture_hash=?,accepted_rows=? WHERE receipt_key=? AND claim=?",projection.context.capturedAt,projection.captureHash,projection.rows.length,job.receipt_key,job.claim);
    this.core.sql.exec('UPDATE private_item_history_control SET blocked_until=0,storage_failures=0 WHERE id=1');
   }});
   if(!['private_hour_capture_appended','unchanged_capture'].includes(accepted.status))throw new Stale();return{status:'private_item_history_accepted',records:accepted.rows,providerAttempted:false,sourceObservedAt:null,individualTradesQualified:0};
  }catch(error){return this.ctx.storage.transactionSync(()=>{
   const current=this.row('SELECT state,claim,failures FROM private_item_history_jobs WHERE receipt_key=?',job.receipt_key);if(current?.state!=='running'||current.claim!==job.claim)return{status:'history_stale_claim',providerAttempted:false};
   if(!this.active||error instanceof Disabled||error instanceof Stale){this.core.sql.exec("UPDATE private_item_history_jobs SET state='pending',lease_until=NULL WHERE receipt_key=? AND claim=?",job.receipt_key,job.claim);return{status:!this.active||error instanceof Disabled?'disabled':'history_expired_claim',providerAttempted:false};}
   const scope=historyScope(this.core);
   if(error instanceof HistoryAuthorityPause||scope.grantReference!==job.grant_ref||scope.roundReference!==job.round_ref){this.core.sql.exec("UPDATE private_item_history_jobs SET state='paused',lease_until=NULL,last_result='authority_changed' WHERE receipt_key=? AND claim=?",job.receipt_key,job.claim);return{status:'history_authority_paused',providerAttempted:false};}
   const bad=error instanceof ItemHistoryContractError,step=Math.min(16,this.control().storage_failures+1),retryAt=this.core.clock()+Math.min(300000,30000*2**Math.min(step-1,4));
   this.core.sql.exec('UPDATE private_item_history_jobs SET state=?,lease_until=NULL,failures=failures+1,last_result=?,available_at=? WHERE receipt_key=? AND claim=?',bad?'quarantined':'pending',bad?'history_schema_quarantine':'history_storage_retry',retryAt,job.receipt_key,job.claim);
   if(!bad)this.core.sql.exec('UPDATE private_item_history_control SET blocked_until=?,storage_failures=? WHERE id=1',retryAt,step);return{status:bad?'history_schema_quarantine':'history_storage_retry',retryAt:bad?null:retryAt,providerAttempted:false};
  });}
 }
}
