// WORK proposal only. Owned raw R2 -> private29 DTO. Never provider fetch/public output.
import {projectReceipt} from './api-raw-prices-decoder.mjs';
const VERSION='raw-prices-v1-fixed29-median-v1';
const PUBLIC_REF='v6kkdvp6';
const PREFIX='_private/provider-api/v1/';
const POINTER=PREFIX+'cash-projection.json';
const KEY=/^_private\/provider-api\/v1\/receipts\/(\d{12,16})-prices-([a-f0-9]{64})\.json$/;
const sha=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))]
  .map(value=>value.toString(16).padStart(2,'0')).join('');
const check=(value,message)=>{if(!value)throw new TypeError(message);};
const freezeTree=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freezeTree(child);Object.freeze(value);}return value;};
class StorageFailure extends Error{}
const storage=async action=>{try{return await action();}catch{throw new StorageFailure('Private storage unavailable');}};

export class PrivateCashMaterializer{
  constructor(ctx,bucket,bindingInputs,{enabled=false,now=Date.now}={}){
    this.ctx=ctx;this.sql=ctx.storage.sql;this.bucket=bucket;
    // Compile only owned static proof metadata, never caller-owned/live rows.
    const {candidatePlanHash,fixedNxScheduleSha256,targets,routeEvidence}=bindingInputs;
    Object.defineProperty(this,'bindings',{value:freezeTree(structuredClone({candidatePlanHash,fixedNxScheduleSha256,targets,routeEvidence})),writable:false});
    this.enabled=enabled===true;this.now=now;this.flight=null;
    ctx.storage.transactionSync(()=>{
      this.sql.exec(`CREATE TABLE IF NOT EXISTS private_cash_jobs(raw_key TEXT NOT NULL,version TEXT NOT NULL,
        source_attempt INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending',available_at INTEGER NOT NULL,
        lease_until INTEGER,tries INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(raw_key,version))`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS private_cash_outbox(id INTEGER PRIMARY KEY CHECK(id=1),
        source_attempt INTEGER NOT NULL DEFAULT 0,body TEXT,pending INTEGER NOT NULL DEFAULT 0,blocked_until INTEGER NOT NULL DEFAULT 0)`);
      this.sql.exec('INSERT OR IGNORE INTO private_cash_outbox(id) VALUES(1)');
    });
  }
  row(sql,...args){return this.sql.exec(sql,...args).toArray()[0];}
  recordOwnedReceipt(rawKey){
    if(!this.enabled)return{status:'disabled'};
    const match=KEY.exec(rawKey??'');check(match,'Expected owned immutable prices receipt key');
    const attempt=Number(match[1]);check(Number.isSafeInteger(attempt)&&attempt>0,'Invalid owner attempt');
    // Derivative work only. Completed api_jobs is the durable reconciliation source;
    // a failure here must never roll back or retry a successful provider request.
    this.sql.exec('INSERT OR IGNORE INTO private_cash_jobs(raw_key,version,source_attempt,available_at) VALUES(?,?,?,?)',rawKey,VERSION,attempt,this.now());
    return{status:'recorded_idempotently'};
  }
  reconcileCompletedPrices(limit=8){
    if(!this.enabled)return{status:'disabled'};
    check(Number.isSafeInteger(limit)&&limit>0&&limit<=8,'Bounded private reconciliation required');
    this.sql.exec('CREATE INDEX IF NOT EXISTS private_cash_api_source ON api_jobs(operation,state,receipt_key)');
    const rows=this.sql.exec(`SELECT j.receipt_key FROM api_jobs j LEFT JOIN private_cash_jobs d
      ON d.raw_key=j.receipt_key AND d.version=? WHERE j.operation='prices' AND j.state='complete'
      AND j.receipt_key IS NOT NULL AND d.raw_key IS NULL ORDER BY j.receipt_key DESC LIMIT ?`,VERSION,limit).toArray();
    for(const row of rows)this.recordOwnedReceipt(row.receipt_key);
    return{status:'reconciled_owned_prices',queued:rows.length};
  }
  async drainOne(){
    if(!this.enabled)return{status:'disabled'};
    if(this.flight)return{status:'busy'};
    this.flight=this.perform();try{return await this.flight;}finally{this.flight=null;}
  }
  async flush(){
    if(!this.enabled)return false;
    for(let retry=0;retry<3;retry++){
      const pending=this.row('SELECT * FROM private_cash_outbox WHERE id=1');
      if(!pending.pending||!pending.body)return true;
      const intended=JSON.parse(pending.body);const old=await storage(()=>this.bucket.get(POINTER));
      if(old){
        const previous=await storage(()=>old.json());
        check(Number.isSafeInteger(previous.sourceAttemptId),'Unreviewed private pointer');
        if(previous.materializerVersion!==VERSION||previous.identitySubsetHash!==intended.identitySubsetHash)return false;
        if(previous.sourceAttemptId>pending.source_attempt)return false;
        if(previous.sourceAttemptId===pending.source_attempt){
          if(JSON.stringify(previous)!==pending.body)return false;
          this.sql.exec('UPDATE private_cash_outbox SET pending=0,blocked_until=0 WHERE id=1 AND source_attempt=?',pending.source_attempt);return true;
        }
      }
      const written=await storage(()=>this.bucket.put(POINTER,pending.body,{onlyIf:old?{etagMatches:old.etag}:{etagDoesNotMatch:'*'},
        httpMetadata:{contentType:'application/json'}}));
      if(!written)continue;
      this.sql.exec('UPDATE private_cash_outbox SET pending=0,blocked_until=0 WHERE id=1 AND source_attempt=?',intended.sourceAttemptId);return true;
    }
    return false;
  }
  async perform(){
    const now=this.now();const control=this.row('SELECT * FROM private_cash_outbox WHERE id=1');
    if(now<control.blocked_until)return{status:'private_backoff',retryAt:control.blocked_until};
    try{if(!await this.flush()){
      this.sql.exec('UPDATE private_cash_outbox SET blocked_until=? WHERE id=1',now+300_000);return{status:'private_pointer_conflict',retryAt:now+300_000};}}
    catch{this.sql.exec('UPDATE private_cash_outbox SET blocked_until=? WHERE id=1',now+30_000);return{status:'private_storage_retry',retryAt:now+30_000};}
    const job=this.ctx.storage.transactionSync(()=>{
      this.sql.exec("UPDATE private_cash_jobs SET state='pending',lease_until=NULL WHERE state='running' AND lease_until<=?",now);
      if(this.row("SELECT 1 FROM private_cash_jobs WHERE state='running' LIMIT 1"))return null;
      const row=this.row("SELECT * FROM private_cash_jobs WHERE version=? AND state='pending' AND available_at<=? ORDER BY source_attempt DESC LIMIT 1",VERSION,now);
      if(row)this.sql.exec("UPDATE private_cash_jobs SET state='running',lease_until=?,tries=tries+1 WHERE raw_key=? AND version=?",now+120_000,row.raw_key,VERSION);
      return row;
    });
    if(!job){
      const running=this.row("SELECT MIN(lease_until) AS at FROM private_cash_jobs WHERE version=? AND state='running'",VERSION).at;
      if(running!==null)return{status:'leased',retryAt:running};
      const pending=this.row("SELECT MIN(available_at) AS at FROM private_cash_jobs WHERE version=? AND state='pending'",VERSION).at;
      return pending===null?{status:'idle'}:{status:'private_backoff',retryAt:pending};
    }
    try{
      const stored=await storage(()=>this.bucket.get(job.raw_key));check(stored&&stored.size<=40_000_000,'Missing/oversized owned receipt');
      const text=await storage(()=>stored.text());check(new TextEncoder().encode(text).length<=40_000_000,'Oversized receipt envelope');
      const envelope=JSON.parse(text),match=KEY.exec(job.raw_key);
      check(envelope.kind==='unverified_provider_api_receipt'&&envelope.captureTimeKind==='http_response_completed'&&
        envelope.schemaVerified===false&&envelope.publicationEligible===false&&envelope.sourceObservedAt===null&&
        envelope.observationTimestampKnown===false,'Wrong private receipt context');
      check(envelope.attemptId===job.source_attempt&&envelope.responseSha256===match[2],'Receipt key/attempt/raw binding mismatch');
      // Only static cohort/proof metadata is needed in compiled code; never embed live API rows/clocks.
      const inputs={schemaVersion:1,kind:'private_validated_api_cash_median_inputs',sourceUrl:envelope.sourceUrl,
        rawResponseSha256:envelope.responseSha256,rawResponseBytes:envelope.responseBytes,
        requestStartedAt:envelope.requestStartedAt,capturedAt:envelope.capturedAt,sourceObservedAt:null,
        priceField:'sold.median_unit_price',weightField:'sold.sales',candidatePlanHash:this.bindings.candidatePlanHash,
        fixedNxScheduleSha256:this.bindings.fixedNxScheduleSha256,targets:this.bindings.targets,sourceRows:[],routeEvidence:this.bindings.routeEvidence};
      const dto=await projectReceipt(envelope,inputs,PUBLIC_REF);
      check(dto.records.length===29&&dto.publicationEligible===false&&dto.sourceObservedAt===null,'Private29-only DTO required');
      check(dto.attribution.complete&&dto.records.every(row=>row.sourceCreditUrl===`https://maplestory.market/items/${row.itemId}?ref=${PUBLIC_REF}`),'Exact project credit required');
      const body=JSON.stringify(dto),hash=await sha(body),key=PREFIX+`cash-projections/${VERSION}/${dto.projectionHash}.json`;
      const existing=await storage(()=>this.bucket.get(key));
      if(existing)check(await storage(()=>existing.text())===body,'Immutable projection conflict');
      else check(await storage(()=>this.bucket.put(key,body,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}})),'Projection write conflict');
      const pointer={schemaVersion:1,kind:'private_api_cash_projection_pointer',materializerVersion:VERSION,
        sourceAttemptId:job.source_attempt,projectionKey:key,projectionHash:dto.projectionHash,
        projectionSha256:hash,projectionBytes:new TextEncoder().encode(body).length,
        rawReceiptKey:job.raw_key,rawResponseSha256:dto.rawResponseSha256,identitySubsetHash:dto.identitySubsetHash,
        capturedAt:dto.capturedAt,sourceObservedAt:null,publicationEligible:false};
      this.ctx.storage.transactionSync(()=>{
        const current=this.row('SELECT state,tries FROM private_cash_jobs WHERE raw_key=? AND version=?',job.raw_key,VERSION);
        check(current?.state==='running'&&current.tries===job.tries+1,'Stale materialization lease');
        this.sql.exec("UPDATE private_cash_jobs SET state='complete',lease_until=NULL WHERE raw_key=? AND version=?",job.raw_key,VERSION);
        const control=this.row('SELECT source_attempt FROM private_cash_outbox WHERE id=1');
        if(job.source_attempt>control.source_attempt)this.sql.exec('UPDATE private_cash_outbox SET source_attempt=?,body=?,pending=1 WHERE id=1',job.source_attempt,JSON.stringify(pointer));
      });
      try{
        if(await this.flush())return{status:'materialized_private',projectionHash:dto.projectionHash};
        const retryAt=this.now()+300_000;this.sql.exec('UPDATE private_cash_outbox SET blocked_until=? WHERE id=1',retryAt);
        return{status:'private_pointer_pending',retryAt};
      }catch{const retryAt=this.now()+30_000;this.sql.exec('UPDATE private_cash_outbox SET blocked_until=? WHERE id=1',retryAt);return{status:'private_pointer_pending',retryAt};}
    }catch(error){
      if(error instanceof StorageFailure){
        const wait=this.now()+Math.min(300_000,30_000*2**Math.min(job.tries,4));
        this.sql.exec("UPDATE private_cash_jobs SET state='pending',lease_until=NULL,available_at=? WHERE raw_key=? AND version=? AND state='running' AND tries=?",wait,job.raw_key,VERSION,job.tries+1);
        return{status:'private_storage_retry',retryAt:wait};
      }
      // Schema/data failures quarantine locally, keep raw and last-good; never retry a provider request.
      this.sql.exec("UPDATE private_cash_jobs SET state='quarantined',lease_until=NULL WHERE raw_key=? AND version=? AND state='running' AND tries=?",job.raw_key,VERSION,job.tries+1);
      return{status:'quarantined_private_materialization'};
    }
  }
}
