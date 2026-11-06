// PRIVATE publication foundation. No provider/key transport, native alarm or public route.
import {NX_POINTER,NX_PREFIX,NX_METHOD,NX_OWNER,MAX_NX_BYTES,check,byteSize,byteHash,
 captureFromProjection,legacyCapture,validateCapture,parseStored,snapshotFromSql,sealProjection,
 validateNxPointer,validateProjection,boundedText,NxProjectionContractError} from './api-private-nx-projection.mjs';
const LEASE=120000;
class Disabled extends Error{}class Stale extends Error{}class StorageFailure extends Error{}
const io=async action=>{try{return await action();}catch(error){if(error instanceof NxProjectionContractError)throw error;throw new StorageFailure('private_projection_storage');}};
export function initializeNxPublication(ctx){
 const sql=ctx.storage.sql;
 sql.exec(`CREATE TABLE IF NOT EXISTS private_nx_r2_capture_context(receipt_key TEXT PRIMARY KEY,operation TEXT NOT NULL,source_attempt INTEGER NOT NULL,body TEXT NOT NULL,UNIQUE(operation,source_attempt))`);
 sql.exec(`CREATE TABLE IF NOT EXISTS private_nx_r2_outbox(id INTEGER PRIMARY KEY CHECK(id=1),target_generation INTEGER NOT NULL DEFAULT 0,
 target_capture_json TEXT,state TEXT NOT NULL DEFAULT 'idle',body TEXT,pointer_json TEXT,retry_at INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER,claim INTEGER NOT NULL DEFAULT 0,tries INTEGER NOT NULL DEFAULT 0,published_generation INTEGER NOT NULL DEFAULT 0,last_result TEXT)`);
 sql.exec('INSERT OR IGNORE INTO private_nx_r2_outbox(id) VALUES(1)');
 sql.exec("CREATE TABLE IF NOT EXISTS private_nx_r2_reconciled(operation TEXT PRIMARY KEY CHECK(operation IN ('nx-rate','nx-history')),receipt_key TEXT NOT NULL,completed_count INTEGER NOT NULL)");
}
// Two bounded per-operation markers detect accepted evidence during feature pauses.
// Counts include older captured receipts too; such a receipt may add an older hour.
function retainedSources(ctx){
 const sql=ctx.storage.sql,out=[];
 for(const operation of ['nx-rate','nx-history']){
  const r=sql.exec("SELECT * FROM private_nx_captures WHERE operation=? AND state='complete' ORDER BY captured_at DESC,source_attempt DESC LIMIT 1",operation).toArray()[0];
  if(!r)continue;
  const count=sql.exec("SELECT COUNT(*) AS n FROM private_nx_captures WHERE operation=? AND state='complete'",operation).toArray()[0].n;
  check(Number.isSafeInteger(count)&&count>0,'retained_capture_count');
  const legacy=legacyCapture(r),original=sql.exec('SELECT body FROM private_nx_r2_capture_context WHERE receipt_key=?',r.receipt_key).toArray()[0];
  const capture=original?validateCapture(parseStored(original.body,5000)):legacy;
  check(capture.captureId===legacy.captureId&&capture.capturedAt===legacy.capturedAt,'retained_capture_context');
  out.push({operation,receiptKey:r.receipt_key,count,capture});
 }
 return out;
}
function markRetained(ctx,sources){for(const s of sources)ctx.storage.sql.exec('INSERT INTO private_nx_r2_reconciled(operation,receipt_key,completed_count) VALUES(?,?,?) ON CONFLICT(operation) DO UPDATE SET receipt_key=excluded.receipt_key,completed_count=excluded.completed_count',s.operation,s.receiptKey,s.count);}
function stageTarget(ctx,capture){
 const sql=ctx.storage.sql,row=sql.exec('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').toArray()[0];
 check(Number.isSafeInteger(row.target_generation)&&row.target_generation>=0&&row.target_generation<Number.MAX_SAFE_INTEGER,'publication_generation_exhausted');
 sql.exec("UPDATE private_nx_r2_outbox SET target_generation=target_generation+1,target_capture_json=?,state='pending',body=NULL,pointer_json=NULL,retry_at=0,lease_until=NULL,tries=0,last_result='accepted_sql_handoff' WHERE id=1",JSON.stringify(capture));
}
// Must run inside the same storage.transactionSync as the accepted producer commit.
export function recordNxPublicationCommit(ctx,projection,receiptKey){
 const capture=captureFromProjection(projection),text=JSON.stringify(capture),sql=ctx.storage.sql;
 const expected=`_private/provider-api/v1/receipts/${String(capture.attemptId).padStart(12,'0')}-${capture.operation}-${capture.rawResponseSha256}.json`;check(receiptKey===expected,'publication_receipt_key');
 const prior=sql.exec('SELECT receipt_key,body FROM private_nx_r2_capture_context WHERE operation=? AND source_attempt=?',capture.operation,capture.attemptId).toArray()[0];
 if(prior){check(prior.receipt_key===receiptKey&&prior.body===text,'same_attempt_context_conflict');return{status:'unchanged_capture_handoff'};}
 sql.exec('INSERT INTO private_nx_r2_capture_context VALUES(?,?,?,?)',receiptKey,capture.operation,capture.attemptId,text);stageTarget(ctx,capture);markRetained(ctx,retainedSources(ctx).filter(s=>s.operation===capture.operation));return{status:'private_publication_staged'};
}
export class PrivateNxPublisher{
 constructor(ctx,bucket,{enabled=false,now=Date.now,isEnabled=()=>true}={}){this.ctx=ctx;this.sql=ctx.storage.sql;this.bucket=bucket;this.enabled=enabled===true;this.isEnabled=isEnabled;this.now=now;this.flight=null;if(this.active)initializeNxPublication(ctx);}
 get active(){return this.enabled&&this.isEnabled()===true;}
 row(){return this.sql.exec('SELECT * FROM private_nx_r2_outbox WHERE id=1').toArray()[0];}
 guard(){if(!this.active)throw new Disabled();}
 reconcileStored(){
  if(!this.active)return{status:'private_publication_disabled'};
  return this.ctx.storage.transactionSync(()=>{
   const target=this.row(),sources=retainedSources(this.ctx);
   if(!sources.length)return{status:'no_completed_nx_source'};
   const changed=sources.filter(s=>{const old=this.sql.exec('SELECT receipt_key,completed_count FROM private_nx_r2_reconciled WHERE operation=?',s.operation).toArray()[0];if(old)check(Number.isSafeInteger(old.completed_count)&&old.completed_count>0&&old.completed_count<=s.count,'retained_count_regression');return!old||old.receipt_key!==s.receiptKey||old.completed_count!==s.count;});
   if(!changed.length)return{status:'private_publication_target_exists'};
   // Supersede only on newly observed retained receipt/count evidence. The same
   // transaction records both markers, so unchanged kicks preserve staged bytes,
   // claims/retry/leases. Pre-marker upgrades deliberately reconcile once.
   changed.sort((a,b)=>b.capture.capturedAt.localeCompare(a.capture.capturedAt)||b.capture.attemptId-a.capture.attemptId||a.operation.localeCompare(b.operation));
   stageTarget(this.ctx,changed[0].capture);markRetained(this.ctx,sources);
   return{status:target.target_generation===0?'legacy_private_projection_staged':'retained_private_projection_staged',originalClockPreserved:true};
  });
 }
 nextDue(){if(!this.active)return null;const r=this.row();return['pending','ready'].includes(r.state)?Math.max(r.retry_at,r.lease_until??0):null;}
 health(){if(!this.active)return{status:'disabled'};const r=this.row();return{status:r.state,targetGeneration:r.target_generation,publishedGeneration:r.published_generation,nextDue:this.nextDue(),publicationEligible:false,sourceObservedAt:null};}
 claim(){return this.ctx.storage.transactionSync(()=>{
  const r=this.row(),now=this.now();if(!['pending','ready'].includes(r.state))return{status:'private_publication_idle'};
  if(r.lease_until!==null&&r.lease_until>now)return{status:'private_publication_leased',retryAt:r.lease_until};
  if(r.retry_at>now)return{status:'private_publication_backoff',retryAt:r.retry_at};
  check(Number.isSafeInteger(r.claim)&&r.claim<Number.MAX_SAFE_INTEGER&&Number.isSafeInteger(r.tries)&&r.tries<Number.MAX_SAFE_INTEGER,'publication_claim_exhausted');
  this.sql.exec('UPDATE private_nx_r2_outbox SET claim=claim+1,tries=tries+1,lease_until=? WHERE id=1',now+LEASE);return{job:r,claim:r.claim+1,tries:r.tries+1};
 });}
 owns(job,claim){const r=this.row();return r.target_generation===job.target_generation&&r.target_capture_json===job.target_capture_json&&r.claim===claim;}
 async drainOne(beforeIO){
  if(!this.active)return{status:'private_publication_disabled'};if(typeof beforeIO!=='function')throw TypeError('beforeIO_recovery_callback_required');if(this.flight)return{status:'private_publication_busy'};
  const claimed=this.claim();if(!claimed.job)return claimed;this.flight=this.perform(claimed,beforeIO);try{return await this.flight;}finally{this.flight=null;}
 }
 async perform({job,claim,tries},beforeIO){
  try{
   try{await beforeIO(this.now()+LEASE);}catch{throw new StorageFailure('recovery_deadline_unavailable');}this.guard();if(!this.owns(job,claim))throw new Stale();
   let body=job.body,pointer=job.pointer_json?validateNxPointer(parseStored(job.pointer_json,8192)):null;
   if(!body){
    const unsigned=this.ctx.storage.transactionSync(()=>{if(!this.owns(job,claim))throw new Stale();return snapshotFromSql(this.ctx,validateCapture(parseStored(job.target_capture_json,5000)));});
    const projection=await sealProjection(unsigned);this.guard();if(!this.owns(job,claim))throw new Stale();body=JSON.stringify(projection);const digest=await byteHash(body);
    pointer=validateNxPointer({schemaVersion:1,kind:'private_nx_offer_projection_pointer',methodVersion:NX_METHOD,ownerScope:NX_OWNER,generation:job.target_generation,objectKey:NX_PREFIX+digest+'.json',projectionHash:projection.projectionHash,objectSha256:digest,objectBytes:byteSize(body),receiptWatermarkAt:projection.receiptWatermarkAt,sourceObservedAt:null,publicationEligible:false,qualifiedIndividualTrades:0});
    this.ctx.storage.transactionSync(()=>{if(!this.owns(job,claim))throw new Stale();this.sql.exec("UPDATE private_nx_r2_outbox SET body=?,pointer_json=?,state='ready',last_result='projection_prepared' WHERE id=1",body,JSON.stringify(pointer));});
   }
   if(job.body){const saved=await validateProjection(parseStored(body));check(saved.projectionHash===pointer.projectionHash&&saved.receiptWatermarkAt===pointer.receiptWatermarkAt,'saved_projection_context');}
   check(pointer&&pointer.generation===job.target_generation&&byteSize(body)===pointer.objectBytes&&await byteHash(body)===pointer.objectSha256,'saved_projection_binding');
   this.guard();if(!this.owns(job,claim))throw new Stale();
   const priorObject=await io(()=>this.bucket.get(pointer.objectKey));
   if(priorObject)check(await io(()=>boundedText(priorObject))===body,'immutable_projection_conflict');
   else{
    this.guard();if(!this.owns(job,claim))throw new Stale();
    const created=await io(()=>this.bucket.put(pointer.objectKey,body,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}}));
    if(!created)check(await io(async()=>boundedText(await this.bucket.get(pointer.objectKey)))===body,'immutable_projection_race');
   }
   for(let n=0;n<3;n++){
    this.guard();if(!this.owns(job,claim))throw new Stale();const previousObject=await io(()=>this.bucket.get(NX_POINTER));
    const previous=previousObject?validateNxPointer(parseStored(await io(()=>boundedText(previousObject,8192)),8192)):null;
    if(previous?.generation>pointer.generation){this.complete(job,claim,'superseded',previous.generation);return{status:'private_projection_superseded'};}
    if(previous?.generation===pointer.generation){check(Object.keys(previous).every(k=>previous[k]===pointer[k]),'same_generation_pointer_conflict');this.complete(job,claim,'published',pointer.generation);return{status:'private_projection_published',generation:pointer.generation};}
    check(!previous||previous.receiptWatermarkAt<=pointer.receiptWatermarkAt,'receipt_watermark_regression');
    this.guard();if(!this.owns(job,claim))throw new Stale();
    const written=await io(()=>this.bucket.put(NX_POINTER,JSON.stringify(pointer),{onlyIf:previousObject?{etagMatches:previousObject.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}}));
    if(written){this.complete(job,claim,'published',pointer.generation);return{status:'private_projection_published',generation:pointer.generation};}
   }
   throw new StorageFailure();
  }catch(error){
   if(error instanceof Stale||!this.owns(job,claim))return{status:'private_projection_stale_claim'};
   if(error instanceof Disabled){this.sql.exec("UPDATE private_nx_r2_outbox SET lease_until=NULL,last_result='disabled' WHERE id=1");return{status:'private_publication_disabled'};}
   if(error instanceof StorageFailure){const retryAt=this.now()+Math.min(300000,30000*2**Math.min(tries-1,4));this.sql.exec("UPDATE private_nx_r2_outbox SET lease_until=NULL,retry_at=?,last_result='storage_retry' WHERE id=1",retryAt);return{status:'private_projection_storage_retry',retryAt};}
   this.sql.exec("UPDATE private_nx_r2_outbox SET state='quarantined',lease_until=NULL,last_result='projection_contract_quarantine' WHERE id=1");return{status:'private_projection_quarantined'};
  }
 }
 complete(job,claim,state,generation){if(!this.owns(job,claim))throw new Stale();this.sql.exec('UPDATE private_nx_r2_outbox SET state=?,lease_until=NULL,retry_at=0,published_generation=MAX(published_generation,?),last_result=? WHERE id=1',state,generation,state);}
}
