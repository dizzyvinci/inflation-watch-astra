// Explicit finite facade for the EXISTING registry mux slot; not registered here.
import {ApiCollectorCore} from './api-collector-core.mjs';
import {ItemRecurringWork} from './api-item-recurring.mjs';
import {IncrementalFastCurrentRegistrySink} from './api-fast-current-incremental-owner.mjs';
import {FastCurrentImmutableWriter} from './api-fast-current-immutable-writer.mjs';
import {FastCurrentPublication} from './api-fast-current-publication.mjs';
const need=(v,c='fast_finite_owner_review')=>{if(!v)throw Error(c);};
export class FiniteFastCurrentWork{
 constructor(ctx,core,registryWork,sink,writer,publication,{enabled=false}={}){
  this.enabled=enabled===true;this.registryWork=registryWork;if(!this.enabled)return;
  need(core instanceof ApiCollectorCore&&core.ctx===ctx&&registryWork instanceof ItemRecurringWork&&registryWork.ctx===ctx&&registryWork.core===core&&sink instanceof IncrementalFastCurrentRegistrySink&&sink.registry===registryWork.registry&&sink.ctx===ctx&&sink.core===core&&writer instanceof FastCurrentImmutableWriter&&writer.ctx===ctx&&writer.core===core&&writer.sink===sink&&publication instanceof FastCurrentPublication&&publication.ctx===ctx&&publication.core===core&&publication.sink===sink&&publication.writer===writer,'fast_finite_same_owner');
  need(registryWork.active&&sink.active&&writer.active&&publication.active,'fast_finite_not_ready');this.ctx=ctx;this.core=core;this.sink=sink;this.writer=writer;this.publication=publication;this.expected=Object.freeze({...publication.expected});this.policy=JSON.stringify(this.expected);this.scope=core.config();this.flight=null;
  ctx.storage.transactionSync(()=>{core.sql.exec("CREATE TABLE IF NOT EXISTS fast_current_finite_work(id INTEGER PRIMARY KEY CHECK(id=1),grant_ref TEXT NOT NULL,round_ref TEXT NOT NULL,policy_json TEXT NOT NULL,epoch INTEGER NOT NULL DEFAULT 0,last_kind TEXT NOT NULL DEFAULT 'registry',retry_at INTEGER NOT NULL DEFAULT 0)");core.sql.exec('INSERT OR IGNORE INTO fast_current_finite_work(id,grant_ref,round_ref,policy_json)VALUES(1,?,?,?)',this.scope.grantReference,this.scope.probeRound,this.policy);const c=this.row();need(c.grant_ref===this.scope.grantReference&&c.round_ref===this.scope.probeRound&&c.policy_json===this.policy&&Number.isSafeInteger(c.epoch)&&c.epoch>=0&&c.epoch<Number.MAX_SAFE_INTEGER,'fast_finite_policy_changed');this.epoch=c.epoch+1;core.sql.exec('UPDATE fast_current_finite_work SET epoch=? WHERE id=1',this.epoch);});
 }
 row(){return this.core.row('SELECT * FROM fast_current_finite_work WHERE id=1');}
 get active(){return this.registryWork?.active===true;}
 get fastActive(){if(!this.enabled)return false;try{const c=this.row(),g=this.core.config();return this.active&&this.sink.active&&this.writer.active&&this.publication.active&&c.epoch===this.epoch&&c.policy_json===this.policy&&c.grant_ref===g.grantReference&&c.round_ref===g.probeRound;}catch{return false;}}
 exactScope(){if(!this.fastActive)return false;const rows=this.core.sql.exec('SELECT source_attempt,raw_sha,captured_at,manifest_sha FROM fast_current_outbox ORDER BY slot LIMIT 4').toArray(),e=this.expected;return rows.length===1&&rows[0].source_attempt===e.sourceAttemptId&&rows[0].raw_sha===e.rawBodySha256&&rows[0].captured_at===e.capturedAt&&rows[0].manifest_sha===e.manifestSha256;}
 reconcileFast(){if(this.exactScope()){this.writer.reconcile(3);const row=this.core.row('SELECT state FROM fast_current_write_jobs WHERE manifest_sha=?',this.expected.manifestSha256);if(row?.state==='written')this.publication.reconcile();}}
 reconcile(limit=8,frame){const result=this.registryWork.reconcile(limit,frame);this.reconcileFast();return result;}
 nextDue(){const ordinary=this.registryWork.nextDue();if(!this.exactScope())return ordinary;const values=[ordinary,this.writer.nextDue(),this.publication.nextDue()].filter(v=>v!==null);return values.length?Math.max(this.row().retry_at,Math.min(...values)):null;}
 defer(){const ordinary=this.registryWork.defer();if(this.fastActive){const retry=this.core.clock()+30000;this.core.sql.exec('UPDATE fast_current_finite_work SET retry_at=MAX(retry_at,?) WHERE id=1 AND epoch=?',retry,this.epoch);}return ordinary;}
 async drainOne(beforeIO,frame){
  if(!this.enabled||!this.exactScope())return this.registryWork.drainOne(beforeIO,frame);
  if(this.flight)return{status:'busy',providerAttempted:false};need(typeof beforeIO==='function');this.reconcileFast();const c=this.row(),now=this.core.clock();need(['registry','writer','publication'].includes(c.last_kind)&&Number.isSafeInteger(c.retry_at)&&c.retry_at>=0);if(c.retry_at>now)return{status:'fast_finite_wait',providerAttempted:false};
  const due={registry:this.registryWork.nextDue(),writer:this.writer.nextDue(),publication:this.publication.nextDue()},order=['registry','writer','publication'],start=(order.indexOf(c.last_kind)+1)%3;let kind=null;for(let i=0;i<3;i++){const k=order[(start+i)%3];if(due[k]!==null&&due[k]<=now){kind=k;break;}}
  if(!kind)return{status:'fast_finite_wait',providerAttempted:false};need(this.exactScope(),'fast_finite_source_rebound');this.core.sql.exec('UPDATE fast_current_finite_work SET last_kind=?,retry_at=0 WHERE id=1 AND epoch=?',kind,this.epoch);
  const action=kind==='registry'?this.registryWork.drainOne(beforeIO,frame):kind==='writer'?this.writer.drainOne(beforeIO):this.publication.drainOne(beforeIO);this.flight=action;try{const result=await action;this.reconcileFast();return result;}finally{if(this.flight===action)this.flight=null;}
 }
 health(){if(!this.enabled)return{enabled:false,status:'disabled'};const kind=this.fastActive?this.row().last_kind:null,known=['registry','writer','publication'].includes(kind);return{enabled:true,status:kind!==null&&!known?'finite_metadata_review':this.exactScope()?'finite_registry_mux_facade':'finite_scope_or_pause_hold',operatorLastKind:known?kind:null,sourceCapturedAt:this.expected.capturedAt,sourceObservedAt:null,providerRequested:false,newNativeAlarms:false,continuousReuse:false,runtimeRegistrationProvidedByThisModule:false};}
}
