// Fixed-owner finite pilot: one immutable successful prices attempt; no provider IO.
import {PrivateItemProducer} from './api-private-item-producer.mjs';
const RECEIPT=/^_private\/provider-api\/v1\/receipts\/([0-9]{12,16})-prices-([a-f0-9]{64})\.json$/;
const LEASE=130000;
export function itemPilotConfiguration(env){try{const p=JSON.parse(env.API_PRIVATE_ITEM_PILOT_JSON??'{"enabled":false}');
 if(p&&Object.keys(p).join(',')==='enabled'&&p.enabled===false)return Object.freeze({status:'disabled'});
 if(!p||Object.keys(p).sort().join(',')!=='enabled,schemaVersion,sourceAttemptId'||p.schemaVersion!==1||p.enabled!==true||!Number.isSafeInteger(p.sourceAttemptId)||p.sourceAttemptId<1)return Object.freeze({status:'invalid_pilot_configuration'});
 return Object.freeze({status:'ready',sourceAttemptId:p.sourceAttemptId});
 }catch{return Object.freeze({status:'invalid_pilot_configuration'});}}

export class FinitePrivateItemProducer extends PrivateItemProducer{
 constructor(ctx,env,sources,options={}){const p=itemPilotConfiguration(env);super(ctx,env,sources,{...options,enabled:options.enabled===true&&p.status==='ready'});
  Object.defineProperty(this,'pilotAttempt',{value:p.sourceAttemptId??null,writable:false,configurable:false});
  if(this.enabled)this.sql.exec(`CREATE TABLE IF NOT EXISTS private_item_finite_pilot(id INTEGER PRIMARY KEY CHECK(id=1),source_attempt INTEGER NOT NULL,job_key TEXT NOT NULL,grant_ref TEXT NOT NULL,round_ref TEXT NOT NULL,receipt_key TEXT NOT NULL,raw_sha TEXT NOT NULL,state TEXT NOT NULL,generation TEXT)`);
 }
 get active(){if(!super.active)return false;const p=itemPilotConfiguration(this.env);if(p.status!=='ready'||p.sourceAttemptId!==this.pilotAttempt)return false;const latch=this.row('SELECT source_attempt,grant_ref,round_ref FROM private_item_finite_pilot WHERE id=1');
  if(!latch)return true;try{const s=this.scope();return latch.source_attempt===this.pilotAttempt&&latch.grant_ref===s.grant&&latch.round_ref===s.round;}catch{return false;}}
 selected(){const s=this.scope(),rows=this.sql.exec(`SELECT j.job_key,j.operation,j.state,j.round_ref,j.receipt_key,a.id,a.at,a.result,a.grant_ref FROM api_attempts a JOIN api_jobs j ON j.job_key=a.job_key WHERE a.id=?`,this.pilotAttempt).toArray();
  if(rows.length!==1)return null;const r=rows[0],m=typeof r.receipt_key==='string'?RECEIPT.exec(r.receipt_key):null;
  if(r.operation!=='prices'||r.state!=='complete'||r.result!=='success'||r.grant_ref!==s.grant||r.round_ref!==s.round||!Number.isSafeInteger(r.at)||r.at<0||r.at>this.now()||!m||Number(m[1])!==this.pilotAttempt)return null;
  const latch=this.row('SELECT * FROM private_item_finite_pilot WHERE id=1');if(latch&&(!['selected','complete'].includes(latch.state)||latch.state==='selected'&&latch.generation!==null||latch.state==='complete'&&!/^[a-f0-9]{64}$/.test(latch.generation)||latch.job_key!==r.job_key||latch.source_attempt!==r.id||latch.receipt_key!==r.receipt_key||latch.raw_sha!==m[2]||latch.grant_ref!==s.grant||latch.round_ref!==s.round))return null;
  return{...r,raw_sha:m[2]};
 }
 // Never alter authority/state for skipped older or future receipts.
 syncAuthority(){const s=this.scope();if(s.grant===undefined||s.round===undefined)throw new Error('pilot_authority_unavailable');}
 reconcile(limit=8){if(!this.active)return{status:'disabled',queued:0};if(!Number.isSafeInteger(limit)||limit<1||limit>8)throw new TypeError('bounded_pilot_reconcile');
  return this.ctx.storage.transactionSync(()=>{this.guard();const r=this.selected();if(!r)return{status:'pilot_receipt_not_owned',queued:0};
   let latch=this.row('SELECT * FROM private_item_finite_pilot WHERE id=1');if(latch&&latch.state==='complete')return{status:'pilot_complete',queued:0};
   if(!latch){const s=this.scope();this.sql.exec("INSERT INTO private_item_finite_pilot VALUES(1,?,?,?,?,?,?,'selected',NULL)",r.id,r.job_key,s.grant,s.round,r.receipt_key,r.raw_sha);}
   const old=this.row('SELECT * FROM private_item_jobs WHERE receipt_key=?',r.receipt_key);
   if(old){if(old.source_attempt!==r.id||old.job_key!==r.job_key||old.raw_sha!==r.raw_sha||old.request_at!==r.at||old.grant_ref!==r.grant_ref||old.round_ref!==r.round_ref)return{status:'pilot_artifact_review',queued:0};if(['complete','superseded'].includes(old.state)){if(old.phase!=='done'||!/^[a-f0-9]{64}$/.test(old.generation)||!/^[a-f0-9]{64}$/.test(old.manifest_sha))return{status:'pilot_artifact_review',queued:0};this.sql.exec("UPDATE private_item_finite_pilot SET state='complete',generation=? WHERE id=1",old.generation);return{status:'pilot_complete',queued:0};}return{status:'pilot_selected',queued:0};}
   if(this.row('SELECT 1 FROM private_item_rejections WHERE receipt_key=?',r.receipt_key))return{status:'pilot_receipt_rejected',queued:0};const s=this.scope();
   this.sql.exec('INSERT INTO private_item_jobs(receipt_key,job_key,source_attempt,request_at,grant_ref,round_ref,raw_sha,available_at) VALUES(?,?,?,?,?,?,?,?)',r.receipt_key,r.job_key,r.id,r.at,s.grant,s.round,r.raw_sha,this.now());return{status:'pilot_selected',queued:1};
  });
 }
 nextDue(){if(!this.active)return null;const r=this.selected();if(!r)return null;const latch=this.row('SELECT * FROM private_item_finite_pilot WHERE id=1');if(latch?.state==='complete')return null;const j=this.row('SELECT * FROM private_item_jobs WHERE receipt_key=?',r.receipt_key);if(!j||!['pending','running'].includes(j.state)||!this.owned(j)||!Number.isSafeInteger(j.available_at)||j.state==='running'&&!Number.isSafeInteger(j.lease_until))return null;return j.state==='running'?j.lease_until:j.available_at;}
 claim(){if(!this.active)return null;return this.ctx.storage.transactionSync(()=>{this.guard();const r=this.selected();if(!r||this.row("SELECT 1 FROM private_item_finite_pilot WHERE id=1 AND state='complete'"))return null;
  const now=this.now();this.sql.exec("UPDATE private_item_jobs SET state='pending',lease_until=NULL,last_result='interrupted' WHERE receipt_key=? AND state='running' AND lease_until<=?",r.receipt_key,now);
  const job=this.row('SELECT * FROM private_item_jobs WHERE receipt_key=?',r.receipt_key);if(!job||job.state!=='pending'||job.available_at>now||!this.owned(job))return null;
  this.sql.exec("UPDATE private_item_jobs SET state='running',claim=claim+1,lease_until=? WHERE receipt_key=?",now+LEASE,r.receipt_key);return{...job,claim:job.claim+1};
 });}
 fence(job){super.fence(job);const r=this.selected();if(job.source_attempt!==this.pilotAttempt||!r||job.receipt_key!==r.receipt_key||job.job_key!==r.job_key||job.raw_sha!==r.raw_sha||job.request_at!==r.at)throw new Error('pilot_context_changed');}
 complete(job,state){this.ctx.storage.transactionSync(()=>{this.fence(job);this.sql.exec("UPDATE private_item_jobs SET state=?,phase='done',lease_until=NULL,last_result=? WHERE receipt_key=? AND claim=?",state,state,job.receipt_key,job.claim);this.sql.exec("UPDATE private_item_finite_pilot SET state='complete',generation=? WHERE id=1 AND source_attempt=?",job.generation,this.pilotAttempt);});}
}
