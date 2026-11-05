// Same owner, private completion reconciliation -> durable public29 outbox. No HTTP transport.
import {publicCashSubset} from './api-public-cash-subset.mjs';
import {PUBLIC_POINTER,PUBLIC_PREFIX,MAX_SUBSET_BYTES,check,bytes,hash,publicCashStatus,
 validatePrivateDescriptor,validatePublicPointer,validatePublicBody,boundedText,samePointer} from './api-public-cash-contract.mjs';
class StorageFailure extends Error{}
class Disabled extends Error{}
class Stale extends Error{}
const io=async fn=>{try{return await fn();}catch{throw new StorageFailure('Cached subset storage unavailable');}};

export class ApiPublicCashPublisher{
  constructor(ctx,env,core,isPrivateActive){
    this.ctx=ctx;this.env=env;this.core=core;this.isPrivateActive=isPrivateActive;this.flight=null;this.initialized=false;
    if(!this.permitted())return;
    core.sql.exec(`CREATE TABLE IF NOT EXISTS api_public_cash_outbox(id INTEGER PRIMARY KEY CHECK(id=1),
      target_attempt INTEGER NOT NULL DEFAULT 0,target_json TEXT,state TEXT NOT NULL DEFAULT 'idle',
      body TEXT,pointer_json TEXT,subset_hash TEXT,retry_at INTEGER NOT NULL DEFAULT 0,
      lease_until INTEGER,tries INTEGER NOT NULL DEFAULT 0,published_attempt INTEGER NOT NULL DEFAULT 0)`);
    core.sql.exec('INSERT OR IGNORE INTO api_public_cash_outbox(id) VALUES(1)');
    this.initialized=true;
  }
  permitted(){return this.isPrivateActive()===true&&publicCashStatus(this.env)==='ready';}
  get active(){return this.initialized&&this.permitted();}
  guard(){if(!this.active)throw new Disabled();}
  row(){return this.core.row('SELECT * FROM api_public_cash_outbox WHERE id=1');}
  reconcile(){
    if(!this.active)return{status:'public_disabled'};
    try{return this.ctx.storage.transactionSync(()=>{
      const source=this.core.row('SELECT source_attempt,body FROM private_cash_outbox WHERE id=1');
      if(!source?.body)return{status:'no_completed_private_projection'};
      check(source.body.length<=5000,'Private descriptor too large');const p=validatePrivateDescriptor(JSON.parse(source.body));
      check(source.source_attempt===p.sourceAttemptId,'Private SQL completion binding mismatch');
      const row=this.row(),text=JSON.stringify(p);
      if(p.sourceAttemptId<row.target_attempt)return{status:'older_private_ignored'};
      if(p.sourceAttemptId===row.target_attempt){check(row.target_json===text,'Same attempt changed private descriptor');return{status:'unchanged_public_target'};}
      // Equivalent durable handoff: source body was committed atomically with
      // private completion. Recovery/kick replays this bounded SQL-only step.
      this.core.sql.exec(`UPDATE api_public_cash_outbox SET target_attempt=?,target_json=?,state='pending',body=NULL,
        pointer_json=NULL,subset_hash=NULL,retry_at=0,lease_until=NULL,tries=0 WHERE id=1`,p.sourceAttemptId,text);
      return{status:'public_target_recorded',sourceAttemptId:p.sourceAttemptId};
    });}catch(error){if(error instanceof TypeError||error instanceof SyntaxError)return{status:'public_reconcile_held'};throw error;}
  }
  nextDue(){
    if(!this.active)return null;const r=this.row();if(!['pending','ready'].includes(r.state))return null;
    return Math.max(r.retry_at,r.lease_until??0);
  }
  claim(){
    if(!this.active)return{status:'public_disabled'};
    return this.ctx.storage.transactionSync(()=>{
      const r=this.row(),now=this.core.clock();if(!['pending','ready'].includes(r.state))return{status:'public_idle'};
      if(r.lease_until!==null&&r.lease_until>now)return{status:'public_leased',retryAt:r.lease_until};
      if(r.retry_at>now)return{status:'public_backoff',retryAt:r.retry_at};
      this.core.sql.exec('UPDATE api_public_cash_outbox SET lease_until=?,tries=tries+1 WHERE id=1',now+120000);
      return{job:r,claimTry:r.tries+1};
    });
  }
  owns(job,claimTry){const r=this.row();return r.target_attempt===job.target_attempt&&r.target_json===job.target_json&&r.tries===claimTry;}
  async drainOne(beforeIO=async()=>{}){
    if(!this.active)return{status:'public_disabled'};if(this.flight)return{status:'public_busy'};
    const claim=this.claim();if(!claim.job)return claim;
    this.flight=this.perform(claim,beforeIO);try{return await this.flight;}finally{this.flight=null;}
  }
  async perform({job,claimTry},beforeIO){
    const bucket=this.env.API_RAW_RECEIPTS;
    try{
      await beforeIO();this.guard();
      let body=job.body,pointer=job.pointer_json?validatePublicPointer(JSON.parse(job.pointer_json)):null;
      if(!body){
        const p=validatePrivateDescriptor(JSON.parse(job.target_json));
        const object=await io(()=>bucket.get(p.projectionKey));
        const text=await io(()=>boundedText(object));
        check(bytes(text)===p.projectionBytes&&await hash(text)===p.projectionSha256,'Private DTO integrity mismatch');
        const dto=JSON.parse(text);check(dto.projectionHash===p.projectionHash&&dto.rawResponseSha256===p.rawResponseSha256&&dto.capturedAt===p.capturedAt&&dto.identitySubsetHash===p.identitySubsetHash,'Private DTO context mismatch');
        const subset=await publicCashSubset(dto,{enabled:true});await validatePublicBody(subset);this.guard();
        body=JSON.stringify(subset);check(bytes(body)<=MAX_SUBSET_BYTES,'Subset too large');
        const bodySha=await hash(body);
        pointer=validatePublicPointer({schemaVersion:1,kind:'fixed_nx_item_api_display_pointer',methodVersion:1,
          sourceAttemptId:job.target_attempt,dataKey:PUBLIC_PREFIX+bodySha+'.json',subsetHash:subset.subsetHash,
          subsetSha256:bodySha,subsetBytes:bytes(body),privateProjectionHash:subset.privateProjectionHash,
          requestStartedAt:subset.requestStartedAt,capturedAt:subset.capturedAt,sourceObservedAt:null,expectedItems:29,availableItems:subset.coverage.available});
        this.guard();
        this.ctx.storage.transactionSync(()=>{
          if(!this.owns(job,claimTry))throw new Stale();
          this.core.sql.exec("UPDATE api_public_cash_outbox SET body=?,pointer_json=?,subset_hash=?,state='ready' WHERE id=1",body,JSON.stringify(pointer),pointer.subsetHash);
        });
      }
      // Retried publication uses saved subset bytes; no private/raw read/decoding.
      check(bytes(body)===pointer.subsetBytes&&await hash(body)===pointer.subsetSha256,'Saved subset mismatch');this.guard();
      if(!this.owns(job,claimTry))throw new Stale();
      const existing=await io(()=>bucket.get(pointer.dataKey));
      if(existing)check(await io(()=>boundedText(existing))===body,'Immutable subset conflict');
      else{
        this.guard();const written=await io(()=>bucket.put(pointer.dataKey,body,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}}));
        if(!written){const winner=await io(()=>bucket.get(pointer.dataKey));check(await io(()=>boundedText(winner))===body,'Immutable subset race conflict');}
      }
      for(let attempt=0;attempt<3;attempt++){
        this.guard();if(!this.owns(job,claimTry))throw new Stale();
        const old=await io(()=>bucket.get(PUBLIC_POINTER));let previous=null;
        if(old)previous=validatePublicPointer(JSON.parse(await io(()=>boundedText(old,5000))));
        if(previous?.sourceAttemptId>pointer.sourceAttemptId){
          this.complete(job,claimTry,'superseded',previous.sourceAttemptId);return{status:'public_superseded'};
        }
        if(previous?.sourceAttemptId===pointer.sourceAttemptId){check(samePointer(previous,pointer),'Same attempt public pointer conflict');
          this.complete(job,claimTry,'published',pointer.sourceAttemptId);return{status:'public_published',subsetHash:pointer.subsetHash};}
        this.guard();if(!this.owns(job,claimTry))throw new Stale();
        const saved=await io(()=>bucket.put(PUBLIC_POINTER,JSON.stringify(pointer),{onlyIf:old?{etagMatches:old.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}}));
        if(saved){this.complete(job,claimTry,'published',pointer.sourceAttemptId);return{status:'public_published',subsetHash:pointer.subsetHash};}
      }
      throw new StorageFailure('Pointer contention');
    }catch(error){
      if(error instanceof Stale)return{status:'public_stale_target'};
      if(!this.owns(job,claimTry))return{status:'public_stale_target'};
      if(error instanceof Disabled){this.core.sql.exec('UPDATE api_public_cash_outbox SET lease_until=NULL WHERE id=1');return{status:'public_disabled'};}
      if(error instanceof StorageFailure){const retryAt=this.core.clock()+Math.min(300000,30000*2**Math.min(claimTry-1,4));
        this.core.sql.exec('UPDATE api_public_cash_outbox SET lease_until=NULL,retry_at=? WHERE id=1',retryAt);return{status:'public_storage_retry',retryAt};}
      this.core.sql.exec("UPDATE api_public_cash_outbox SET state='quarantined',lease_until=NULL WHERE id=1");
      return{status:'public_quarantined'};
    }
  }
  complete(job,claimTry,state,published){
    if(!this.owns(job,claimTry))throw new Stale();
    this.core.sql.exec('UPDATE api_public_cash_outbox SET state=?,lease_until=NULL,retry_at=0,published_attempt=MAX(published_attempt,?) WHERE id=1',state,published);
  }
  health(){if(!this.active)return{status:publicCashStatus(this.env)};const r=this.row();return{status:r.state,methodVersion:1,nextAttemptAt:this.nextDue(),publishedAttempt:r.published_attempt};}
}
