// Optional same-owner finite SQL persistence only. No R2, raw parse, timer,
// route, public pointer, source release or daily-history storage.
import {ApiCollectorCore} from './api-collector-core.mjs';
import {isOwnedRecurringRegistry,isOwnedOverviewActivityCommit} from './item-recurring-registry.mjs';
import {isOwnedOverviewIndexBridge,ownedCalculationSource} from './api-index-owner-bridge.mjs';
import {overviewActivityFromAdaptation} from './api-overview-adapter.mjs';
import {sharedOverviewConfiguration} from './api-shared-overview-guard.mjs';
export const OVERVIEW_ACTIVITY_OWNER_LIMITS=Object.freeze({references:64,summaryBytes:65536,sourceMetadataBytes:4096,waitMs:30000});
const enc=new TextEncoder(),bytes=s=>enc.encode(s).length;
const check=(v,c)=>{if(!v)throw Error(c);};
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const RESULTS=new Set(['activity_summary_admitted','activity_summary_duplicate','activity_capacity_hold','activity_profile_review']);
export class OverviewActivityRegistrySink{
 #tickets=new WeakMap();#starts=new Map();
 constructor(ctx,core,registry,{enabled=false,isEnabled=()=>true,waitMs=30000}={}){
  this.enabled=enabled===true;if(!this.enabled)return;
  check(core instanceof ApiCollectorCore&&core.ctx===ctx&&registry.core===core&&isOwnedRecurringRegistry(registry,ctx),'activity_same_owner');
  check(typeof isEnabled==='function'&&integer(waitMs,1,OVERVIEW_ACTIVITY_OWNER_LIMITS.waitMs),'activity_options');
  this.ctx=ctx;this.core=core;this.registry=registry;this.isEnabled=isEnabled;this.waitMs=waitMs;this.scope=core.config();
  if(this.scope.enabled!==true)return;
  ctx.storage.transactionSync(()=>{
   core.sql.exec('CREATE TABLE IF NOT EXISTS overview_activity_control(id INTEGER PRIMARY KEY CHECK(id=1),grant_ref TEXT NOT NULL,round_ref TEXT NOT NULL,epoch INTEGER NOT NULL,last_result TEXT)');
   core.sql.exec('INSERT OR IGNORE INTO overview_activity_control VALUES(1,?,?,0,NULL)',this.scope.grantReference,this.scope.probeRound);
   const c=core.row('SELECT * FROM overview_activity_control WHERE id=1');check(c.grant_ref===this.scope.grantReference&&c.round_ref===this.scope.probeRound&&integer(c.epoch,0,Number.MAX_SAFE_INTEGER-1),'activity_scope_changed');
   core.sql.exec('UPDATE overview_activity_control SET epoch=epoch+1 WHERE id=1');this.epoch=c.epoch+1;
   core.sql.exec("CREATE TABLE IF NOT EXISTS overview_activity_receipts(slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 64),receipt_key TEXT NOT NULL UNIQUE,source_json TEXT NOT NULL,source_attempt INTEGER NOT NULL,raw_sha TEXT NOT NULL,epoch INTEGER NOT NULL,registry_claim INTEGER NOT NULL,registry_lease INTEGER NOT NULL,state TEXT NOT NULL,summary_body TEXT,summary_sha TEXT,summary_bytes INTEGER,captured_at TEXT,admitted_at INTEGER,result TEXT)");
  });
 }
 bindBridge(bridge){if(!this.enabled)return;check(!this.bridge&&isOwnedOverviewIndexBridge(bridge,this.ctx,this.core,this.registry),'activity_bridge_authority');this.bridge=bridge;}
 get active(){if(!this.enabled)return false;try{const g=this.core.config(),c=this.core.row('SELECT * FROM overview_activity_control WHERE id=1');return this.isEnabled()===true&&sharedOverviewConfiguration(this.core.env).status==='ready'&&this.bridge?.active===true&&this.registry.active&&g.enabled===true&&g.grantReference===this.scope.grantReference&&g.probeRound===this.scope.probeRound&&c.epoch===this.epoch&&c.grant_ref===g.grantReference&&c.round_ref===g.probeRound&&this.core.row('SELECT auth_stopped FROM api_control WHERE id=1').auth_stopped===0;}catch{return false;}}
 guard(){check(this.active,'activity_paused');}
 source(job){this.guard();this.registry.fence(job);const s=ownedCalculationSource(this.core,{receiptKey:job.receipt_key,jobKey:job.job_key});check(s.operation==='overview'&&job.operation==='overview'&&s.sourceAttemptId===job.source_attempt&&s.requestAt===job.request_at&&s.rawSha256===job.raw_sha,'activity_owned_overview');check(bytes(JSON.stringify(s))<=4096,'activity_source_metadata_capacity');return s;}
 capacity(){const v=this.core.row('SELECT COUNT(*)n,COALESCE(SUM(length(CAST(source_json AS BLOB))),0)m,COALESCE(SUM(length(CAST(summary_body AS BLOB))),0)b FROM overview_activity_receipts');check(integer(v.n,0,64)&&integer(v.m,0,64*4096)&&integer(v.b,0,64*65536),'activity_existing_capacity_review');return v;}
 reserve(job){
  const s=this.source(job),sourceJson=JSON.stringify(s),lease=this.core.row('SELECT claim,lease_until FROM recurring_registry_jobs WHERE receipt_key=?',s.receiptKey);check(lease.claim===job.claim&&integer(lease.lease_until,this.core.clock()+1,this.core.clock()+130000),'activity_registry_lease');
  return this.ctx.storage.transactionSync(()=>{
   this.source(job);const n=this.capacity(),r=this.core.row('SELECT * FROM overview_activity_receipts WHERE receipt_key=?',s.receiptKey);
   if(r){check(r.source_json===sourceJson&&r.source_attempt===s.sourceAttemptId&&r.raw_sha===s.rawSha256,'activity_reservation_rebound');if(r.state==='admitted'||r.state==='held')return{status:'activity_existing'};check(r.state==='reserved'&&integer(r.registry_claim,1)&&r.registry_claim<job.claim,'activity_reservation_claim');}
   else if(n.n>=64)return{status:'activity_capacity_hold'};
   const slot=r?.slot??this.core.row('SELECT COALESCE(MAX(slot),0)+1 n FROM overview_activity_receipts').n;check(integer(slot,1,64),'activity_slots');
   this.core.sql.exec("INSERT INTO overview_activity_receipts(slot,receipt_key,source_json,source_attempt,raw_sha,epoch,registry_claim,registry_lease,state)VALUES(?,?,?,?,?,?,?,?,'reserved')ON CONFLICT(receipt_key)DO UPDATE SET epoch=excluded.epoch,registry_claim=excluded.registry_claim,registry_lease=excluded.registry_lease",slot,s.receiptKey,sourceJson,s.sourceAttemptId,s.rawSha256,this.epoch,job.claim,lease.lease_until);
   this.#starts.set(s.receiptKey,{claim:job.claim,deadline:performance.now()+this.waitMs});return{status:'activity_reserved'};
  });
 }
 requested(job){if(!this.active)return false;const r=this.core.row('SELECT state,epoch,registry_claim FROM overview_activity_receipts WHERE receipt_key=?',job.receipt_key);return r?.state==='reserved'&&r.epoch===this.epoch&&r.registry_claim===job.claim;}
 prepare(bridge,{job,envelope,overviewAdaptation}){
  check(bridge===this.bridge,'activity_bridge_authority');const s=this.source(job);bridge.validateEnvelope(envelope,s);
  const r=this.core.row('SELECT * FROM overview_activity_receipts WHERE receipt_key=?',s.receiptKey),start=this.#starts.get(s.receiptKey),base={s,job:{...job},epoch:this.epoch,capturedAt:envelope.capturedAt,lease:this.core.row('SELECT lease_until FROM recurring_registry_jobs WHERE receipt_key=?',s.receiptKey).lease_until,deadline:start?.claim===job.claim?start.deadline:performance.now()+this.waitMs};
  let result,body=null,bodySha=null;
  if(!r)result='activity_capacity_hold';
  else if(r.state==='admitted')result='activity_summary_duplicate';
  else if(r.state==='held')result=r.result;
  else{
   check(r.state==='reserved'&&r.epoch===this.epoch&&r.registry_claim===job.claim&&start?.claim===job.claim,'activity_preparation_claim');
   const a=overviewActivityFromAdaptation(overviewAdaptation);
   if(a.status==='ready'){const v=a.artifact;check(v.summary.source.operation==='overview'&&v.summary.source.rawBodySha256===s.rawSha256&&v.summary.source.capturedAt===envelope.capturedAt&&v.summary.source.sourceUrl===s.sourceUrl&&v.summary.source.sourceObservedAt===null,'activity_summary_source');body=JSON.stringify(v.summary);check(bytes(body)===v.bodyBytes&&v.bodyBytes<=65536&&/^[a-f0-9]{64}$/.test(v.bodySha256),'activity_summary_capacity');bodySha=v.bodySha256;result='activity_summary_admitted';}
   else{check(['derived_capacity_hold','derived_profile_review'].includes(a.status),'activity_not_prepared');result=a.status==='derived_capacity_hold'?'activity_capacity_hold':'activity_profile_review';}
  }
  check(RESULTS.has(result),'activity_result');const ticket=Object.freeze({});this.#tickets.set(ticket,{...base,result,body,bodySha,committed:false});this.fence(this.#tickets.get(ticket),false);return ticket;
 }
 fence(v,completed){
  this.guard();check(v.epoch===this.epoch&&equal(ownedCalculationSource(this.core,{receiptKey:v.s.receiptKey,jobKey:v.s.jobKey}),v.s),'activity_source_changed');const r=this.core.row('SELECT state,claim,lease_until FROM recurring_registry_jobs WHERE receipt_key=?',v.s.receiptKey);check(r?.claim===v.job.claim&&r.state===(completed?'complete':'running')&&(completed?r.lease_until===null:r.lease_until===v.lease),'activity_registry_fence');check(this.core.clock()<v.lease,'activity_lease_expired');check(performance.now()<v.deadline,'activity_deadline');
 }
 commit(ticket,{bridge,phase,calculationTicket}){
  check(bridge===this.bridge&&isOwnedOverviewActivityCommit(phase,this.registry,this.ctx,this.core,calculationTicket),'activity_commit_phase');const v=this.#tickets.get(ticket);check(v&&!v.committed,'activity_ticket');this.fence(v,false);const r=this.core.row('SELECT * FROM overview_activity_receipts WHERE receipt_key=?',v.s.receiptKey);
  if(r?.state==='reserved'&&['activity_summary_admitted','activity_profile_review','activity_capacity_hold'].includes(v.result)){
   check(r?.state==='reserved'&&r.epoch===this.epoch&&r.registry_claim===v.job.claim&&r.registry_lease===v.lease&&r.source_json===JSON.stringify(v.s),'activity_admission_claim');
   this.core.sql.exec("UPDATE overview_activity_receipts SET state=?,summary_body=?,summary_sha=?,summary_bytes=?,captured_at=?,admitted_at=?,result=? WHERE receipt_key=? AND epoch=? AND registry_claim=?",v.body===null?'held':'admitted',v.body,v.bodySha,v.body===null?null:bytes(v.body),v.capturedAt,this.core.clock(),v.result,v.s.receiptKey,this.epoch,v.job.claim);
  }else if(v.result==='activity_summary_duplicate'){check(r?.state==='admitted'&&r.raw_sha===v.s.rawSha256&&r.source_json===JSON.stringify(v.s),'activity_duplicate');}
  else check(!r||r.state==='held'&&r.result===v.result,'activity_hold');
  this.core.sql.exec('UPDATE overview_activity_control SET last_result=? WHERE id=1',v.result);v.committed=true;
 }
 finalize(ticket,{bridge,phase,calculationTicket}){
  check(bridge===this.bridge&&isOwnedOverviewActivityCommit(phase,this.registry,this.ctx,this.core,calculationTicket),'activity_final_phase');const v=this.#tickets.get(ticket);check(v?.committed,'activity_final_ticket');
  const r=this.core.row('SELECT * FROM overview_activity_receipts WHERE receipt_key=?',v.s.receiptKey);if(v.body!==null)check(r?.state==='admitted'&&r.summary_body===v.body&&r.summary_sha===v.bodySha&&r.summary_bytes===bytes(v.body)&&r.captured_at===v.capturedAt&&r.epoch===this.epoch&&r.registry_claim===v.job.claim,'activity_final_artifact');this.capacity();
  // Last controlled check is monotonic, AFTER all final SQL writes/metadata reads.
  this.fence(v,true);this.#tickets.delete(ticket);this.#starts.delete(v.s.receiptKey);return v.result;
 }
}
