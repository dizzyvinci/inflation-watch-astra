// WORK-only producer implementing the future shared-owner private producer contract.
// Never imports fetch, a provider key, native alarms, public routes or cash-price state.
import {decodeNxReceipt} from './api-nx-offers.mjs';
const RECEIPT=/^_private\/provider-api\/v1\/receipts\/([0-9]{12,16})-(nx-rate|nx-history)-([a-f0-9]{64})\.json$/;
const LEASE=130000;
class Disabled extends Error{}
export class PrivateNxOffersProducer{
 constructor(ctx,bucket,{enabled=false,now=Date.now,isEnabled=()=>true}={}){this.ctx=ctx;this.sql=ctx.storage.sql;this.bucket=bucket;this.enabled=enabled===true;this.isEnabled=isEnabled;this.now=now;this.flight=null;if(!this.active)return;
  this.sql.exec(`CREATE TABLE IF NOT EXISTS private_nx_captures(receipt_key TEXT PRIMARY KEY,operation TEXT NOT NULL,source_attempt INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending',available_at INTEGER NOT NULL,lease_until INTEGER,claim INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,raw_sha TEXT,captured_at TEXT,last_result TEXT)`);
  // Cover health's latest-completed lookup and state counts without sorting raw rows.
  this.sql.exec('CREATE INDEX IF NOT EXISTS private_nx_capture_latest_v1 ON private_nx_captures(operation,state,captured_at DESC,source_attempt DESC,raw_sha)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS private_nx_capture_state_v1 ON private_nx_captures(state)');
  this.sql.exec(`CREATE TABLE IF NOT EXISTS private_nx_latest(source_url TEXT NOT NULL,hour_label TEXT NOT NULL,side TEXT NOT NULL,captured_at TEXT NOT NULL,source_attempt INTEGER NOT NULL,receipt_key TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(source_url,hour_label,side))`);
  this.sql.exec(`CREATE TABLE IF NOT EXISTS private_nx_revisions(id INTEGER PRIMARY KEY AUTOINCREMENT,source_url TEXT NOT NULL,hour_label TEXT NOT NULL,side TEXT NOT NULL,captured_at TEXT NOT NULL,source_attempt INTEGER NOT NULL,receipt_key TEXT NOT NULL,body TEXT NOT NULL,UNIQUE(source_url,hour_label,side,receipt_key))`);
 }
 get active(){return this.enabled&&this.isEnabled()===true;}
 guard(){if(!this.active)throw new Disabled();}
 row(q,...args){return this.sql.exec(q,...args).toArray()[0];}
 reconcile(limit=8){if(!this.active)return{status:'disabled',queued:0};if(!Number.isSafeInteger(limit)||limit<1||limit>8)throw new TypeError('bounded_reconcile_required');return this.ctx.storage.transactionSync(()=>{
  const rows=this.sql.exec(`SELECT api_jobs.operation,api_jobs.receipt_key FROM api_jobs LEFT JOIN private_nx_captures ON private_nx_captures.receipt_key=api_jobs.receipt_key WHERE api_jobs.state='complete' AND api_jobs.operation IN ('nx-rate','nx-history') AND api_jobs.receipt_key IS NOT NULL AND private_nx_captures.receipt_key IS NULL ORDER BY api_jobs.job_key LIMIT ?`,limit).toArray();let queued=0;
  for(const r of rows){const match=RECEIPT.exec(r.receipt_key);if(!match||match[2]!==r.operation||!Number.isSafeInteger(Number(match[1])))continue;this.sql.exec('INSERT OR IGNORE INTO private_nx_captures(receipt_key,operation,source_attempt,available_at) VALUES(?,?,?,?)',r.receipt_key,r.operation,Number(match[1]),this.now());queued++;}return{status:'reconciled',queued};
 });}
 nextDue(){if(!this.active)return null;const a=this.row("SELECT MIN(available_at) AS at FROM private_nx_captures WHERE state='pending'").at,b=this.row("SELECT MIN(lease_until) AS at FROM private_nx_captures WHERE state='running'").at;const values=[a,b].filter(v=>v!==null);return values.length?Math.min(...values):null;}
 health(){if(!this.active)return{status:'disabled'};return{status:'private_only',publicationEligible:false,sourceObservedAt:null,qualifiedIndividualTrades:0,jobs:this.sql.exec('SELECT state,COUNT(*) AS count FROM private_nx_captures GROUP BY state').toArray(),nextPrivateDue:this.nextDue(),hourlyRows:this.row("SELECT COUNT(*) AS count FROM private_nx_latest WHERE side IN ('buy','sell')").count};}
 async drainOne(beforeIO){if(!this.active)return{status:'disabled'};if(this.flight)return{status:'busy'};if(typeof beforeIO!=='function')throw new TypeError('beforeIO_mux_arm_callback_required');this.flight=this.perform(beforeIO);try{return await this.flight;}finally{this.flight=null;}}
 async perform(beforeIO){const now=this.now(),job=this.ctx.storage.transactionSync(()=>{
  this.sql.exec("UPDATE private_nx_captures SET state='pending',lease_until=NULL,last_result='interrupted' WHERE state='running' AND lease_until<=?",now);
  const r=this.row("SELECT * FROM private_nx_captures WHERE state='pending' AND available_at<=? ORDER BY source_attempt LIMIT 1",now);if(!r)return null;
  this.sql.exec("UPDATE private_nx_captures SET state='running',claim=claim+1,lease_until=? WHERE receipt_key=?",now+LEASE,r.receipt_key);return{...r,claim:r.claim+1};
 });if(!job)return{status:'idle'};
 let permanent=false;
 try{
  await beforeIO(now+LEASE);this.guard(); // Durable recovery MUST be armed before any R2 read/decode.
  const object=await this.bucket.get(job.receipt_key);if(!object)throw new Error('private_raw_not_available');
  const envelope=await object.json(),match=RECEIPT.exec(job.receipt_key);permanent=true;
  if(envelope.operation!==job.operation||envelope.attemptId!==job.source_attempt||envelope.responseSha256!==match[3])throw new TypeError('raw_job_identity_mismatch');
  const p=await decodeNxReceipt(envelope);const entries=p.kind==='nx_offer_summary'?[{hour_label:'native_summary',side:'summary',body:p.summary}]:p.rows.map(r=>({hour_label:r.at,side:r.side,body:r}));
  this.guard();return this.ctx.storage.transactionSync(()=>{
   const current=this.row('SELECT state,claim FROM private_nx_captures WHERE receipt_key=?',job.receipt_key);if(current?.state!=='running'||current.claim!==job.claim)return{status:'stale_private_claim'};
   for(const e of entries){const body=JSON.stringify(e.body),old=this.row('SELECT * FROM private_nx_latest WHERE source_url=? AND hour_label=? AND side=?',p.sourceUrl,e.hour_label,e.side);
    if(old&&Date.parse(old.captured_at)===Date.parse(p.capturedAt)&&old.receipt_key!==job.receipt_key){const prior=this.row('SELECT raw_sha FROM private_nx_captures WHERE receipt_key=?',old.receipt_key);if(prior?.raw_sha!==p.rawSha256)throw new TypeError('conflicting_capture_clock');}
    // Original immutable raw receipts/capture registry retain every response;
    // append row revisions only for content changes, avoiding331 unchanged copies each poll.
    if(!old||old.body!==body)this.sql.exec('INSERT OR IGNORE INTO private_nx_revisions(source_url,hour_label,side,captured_at,source_attempt,receipt_key,body) VALUES(?,?,?,?,?,?,?)',p.sourceUrl,e.hour_label,e.side,p.capturedAt,p.attemptId,job.receipt_key,body);
    if(!old||Date.parse(p.capturedAt)>Date.parse(old.captured_at)||p.capturedAt===old.captured_at&&p.attemptId>old.source_attempt)this.sql.exec(`INSERT INTO private_nx_latest(source_url,hour_label,side,captured_at,source_attempt,receipt_key,body) VALUES(?,?,?,?,?,?,?) ON CONFLICT(source_url,hour_label,side) DO UPDATE SET captured_at=excluded.captured_at,source_attempt=excluded.source_attempt,receipt_key=excluded.receipt_key,body=excluded.body`,p.sourceUrl,e.hour_label,e.side,p.capturedAt,p.attemptId,job.receipt_key,body);
   }
   this.sql.exec("UPDATE private_nx_captures SET state='complete',raw_sha=?,captured_at=?,lease_until=NULL,last_result='private_offer_commit' WHERE receipt_key=? AND claim=?",p.rawSha256,p.capturedAt,job.receipt_key,job.claim);return{status:'private_offer_committed',operation:p.kind,records:entries.length,providerAttempted:false};
  });
 }catch(error){return this.ctx.storage.transactionSync(()=>{
  const current=this.row('SELECT state,claim,failures FROM private_nx_captures WHERE receipt_key=?',job.receipt_key);if(current?.state!=='running'||current.claim!==job.claim)return{status:'stale_private_claim'};
  if(error instanceof Disabled){this.sql.exec("UPDATE private_nx_captures SET state='pending',lease_until=NULL WHERE receipt_key=? AND claim=?",job.receipt_key,job.claim);return{status:'disabled',providerAttempted:false};}
  const quarantine=permanent&&error instanceof TypeError,failures=current.failures+1,retryAt=this.now()+Math.min(300000,30000*2**Math.min(failures-1,4));
  this.sql.exec('UPDATE private_nx_captures SET state=?,lease_until=NULL,failures=?,available_at=?,last_result=? WHERE receipt_key=? AND claim=?',quarantine?'quarantined':'pending',failures,retryAt,quarantine?'schema_quarantine':'private_storage_retry',job.receipt_key,job.claim);return{status:quarantine?'schema_quarantine':'private_storage_retry',retryAt:quarantine?null:retryAt,providerAttempted:false};
 });}
 }
}
