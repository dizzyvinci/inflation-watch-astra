// Private append-only accepted-hour ledger. No R2, source transport, native timer or route.
import {projectItemHistoryReceipt,historyOperation,ItemHistoryContractError,validateProjectedHour} from './api-item-hour-history-profile.mjs';
import {portableHash} from './portable-hash.mjs';
const check=(v,code)=>{if(!v)throw new ItemHistoryContractError(code);};
const REF=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/,HEX=/^[a-f0-9]{64}$/;
const KEY=/^_private\/provider-api\/v1\/receipts\/([0-9]{12,16})-(apple-history|observed-history-[1-9][0-9]{0,8})-([a-f0-9]{64})\.json$/;
export class PrivateItemHourLedger{
 constructor(ctx,{enabled=false,isEnabled=()=>true,getScope=()=>({enabled:false})}={}){this.ctx=ctx;this.enabled=enabled===true;this.sql=this.enabled?ctx.storage.sql:null;this.isEnabled=isEnabled;this.getScope=getScope;this.flight=null;if(this.active)this.initialize();}
 get active(){try{return this.enabled&&this.isEnabled()===true&&this.scope().enabled===true;}catch{return false;}}
 scope(){const x=this.getScope();check(x?.enabled===true&&REF.test(x.grantReference??'')&&REF.test(x.roundReference??''),'history_authorized_scope_required');return{enabled:true,grantReference:x.grantReference,roundReference:x.roundReference,observedPlanHash:x.observedPlanHash??null};}
 row(q,...args){return this.sql.exec(q,...args).toArray()[0];}
 initialize(){this.ctx.storage.transactionSync(()=>{
  this.sql.exec('CREATE TABLE IF NOT EXISTS private_item_hour_captures(receipt_key TEXT PRIMARY KEY,capture_hash TEXT NOT NULL UNIQUE,item_id INTEGER NOT NULL,source_url TEXT NOT NULL,operation TEXT NOT NULL,source_attempt INTEGER NOT NULL,raw_sha TEXT NOT NULL,raw_bytes INTEGER NOT NULL,request_started_at TEXT NOT NULL,captured_at TEXT NOT NULL,context_json TEXT NOT NULL,coverage_json TEXT NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS private_item_hour_latest(source_url TEXT NOT NULL,item_id INTEGER NOT NULL,bucket_epoch INTEGER NOT NULL,capture_hash TEXT NOT NULL,captured_at TEXT NOT NULL,source_attempt INTEGER NOT NULL,body_hash TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(source_url,item_id,bucket_epoch))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS private_item_hour_revisions(source_url TEXT NOT NULL,item_id INTEGER NOT NULL,bucket_epoch INTEGER NOT NULL,capture_hash TEXT NOT NULL,captured_at TEXT NOT NULL,source_attempt INTEGER NOT NULL,body_hash TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(source_url,item_id,bucket_epoch,capture_hash))');
  this.sql.exec('CREATE INDEX IF NOT EXISTS private_item_hour_revision_order ON private_item_hour_revisions(source_url,item_id,bucket_epoch,captured_at,source_attempt)');
 });}
 owned(receiptKey){
  check(this.active,'history_private_feature_disabled');const scope=this.scope(),m=KEY.exec(receiptKey??'');check(m,'history_owned_key');const attemptId=Number(m[1]),operation=m[2],target=historyOperation(operation);check(Number.isSafeInteger(attemptId)&&attemptId>0&&target,'history_owned_target');
  const r=this.row(`SELECT j.job_key,j.operation,j.round_ref,j.state,j.receipt_key,a.id,a.at,a.result,a.grant_ref FROM api_jobs j JOIN api_attempts a ON a.job_key=j.job_key AND a.id=? WHERE j.receipt_key=?`,attemptId,receiptKey);
  check(r&&r.state==='complete'&&r.operation===operation&&r.result==='success'&&r.id===attemptId&&r.grant_ref===scope.grantReference&&r.round_ref===scope.roundReference&&Number.isSafeInteger(r.at)&&r.at>0,'history_successful_owned_attempt_required');
  if(operation.startsWith('observed-')){
   check(HEX.test(scope.observedPlanHash??''),'history_registered_plan_required');const registered=this.row('SELECT item_id,kind,operation,plan_hash FROM api_observed_jobs WHERE job_key=?',r.job_key);
   check(registered&&registered.item_id===target.itemId&&registered.kind==='history'&&registered.operation===operation&&registered.plan_hash===scope.observedPlanHash,'history_registered_operation_target');
  }
  return{operation,itemId:target.itemId,sourceUrl:target.sourceUrl,attemptId,receiptKey,requestStartedAt:new Date(r.at).toISOString(),grantReference:scope.grantReference,roundReference:scope.roundReference,observedPlanHash:scope.observedPlanHash};
 }
 async append(receiptKey,input,{onAccepted=()=>{}}={}){if(!this.active)return{status:'disabled'};if(this.flight)return{status:'busy'};this.flight=this.perform(receiptKey,input,onAccepted);try{return await this.flight;}finally{this.flight=null;}}
 async perform(receiptKey,input,onAccepted){
  check(typeof onAccepted==='function','history_acceptance_hook_required');
  const expected=this.owned(receiptKey),projection=await projectItemHistoryReceipt(input,expected),context=projection.context;
  const prepared=[];for(const row of projection.rows)prepared.push({row,body:JSON.stringify(row),bodyHash:await portableHash(row)});
  // The source hash await cannot launder a changed grant/round/job or caller mutation.
  return this.ctx.storage.transactionSync(()=>{
   check(JSON.stringify(this.owned(receiptKey))===JSON.stringify(expected),'history_ownership_changed_during_projection');
   const old=this.row('SELECT capture_hash FROM private_item_hour_captures WHERE receipt_key=?',receiptKey);
   if(old){check(old.capture_hash===projection.captureHash,'history_same_receipt_context_conflict');onAccepted(projection);return{status:'unchanged_capture',rows:projection.rows.length,sourceObservedAt:null,individualTradesQualified:0};}
   this.sql.exec('INSERT INTO private_item_hour_captures VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',receiptKey,projection.captureHash,context.itemId,context.sourceUrl,context.operation,context.attemptId,context.rawBodySha256,context.rawBytes,context.requestStartedAt,context.capturedAt,JSON.stringify(context),JSON.stringify(projection.coverage));
   let changed=0,updated=0;
   for(const p of prepared){const at=p.row.providerBucketEpochSeconds,prior=this.row('SELECT * FROM private_item_hour_latest WHERE source_url=? AND item_id=? AND bucket_epoch=?',context.sourceUrl,context.itemId,at);
    if(!prior||prior.body_hash!==p.bodyHash){this.sql.exec('INSERT INTO private_item_hour_revisions VALUES(?,?,?,?,?,?,?,?)',context.sourceUrl,context.itemId,at,projection.captureHash,context.capturedAt,context.attemptId,p.bodyHash,p.body);changed++;}
    if(!prior||context.capturedAt>prior.captured_at||context.capturedAt===prior.captured_at&&context.attemptId>prior.source_attempt){this.sql.exec('INSERT INTO private_item_hour_latest VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(source_url,item_id,bucket_epoch) DO UPDATE SET capture_hash=excluded.capture_hash,captured_at=excluded.captured_at,source_attempt=excluded.source_attempt,body_hash=excluded.body_hash,body=excluded.body',context.sourceUrl,context.itemId,at,projection.captureHash,context.capturedAt,context.attemptId,p.bodyHash,p.body);updated++;}
   }
   onAccepted(projection);return{status:'private_hour_capture_appended',rows:projection.rows.length,changedRowRevisions:changed,updatedLatestRows:updated,sourceObservedAt:null,individualTradesQualified:0,originalCapturedAt:context.capturedAt};
  });
 }
 // Bounded private local analysis only; no public endpoint. Explicit target and
 // cursor cannot cause source I/O or synthesize gaps/zero rows. Original clocks.
 async read(itemId,{afterEpoch=0,limit=200}={}){
  check(this.active&&Number.isSafeInteger(itemId)&&itemId>0&&itemId<=999999999&&Number.isSafeInteger(afterEpoch)&&afterEpoch>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=500,'history_bounded_read');
  const sourceUrl=`https://maplestory.market/api/items/${itemId}/history`,rows=this.sql.exec('SELECT l.body,l.body_hash,l.captured_at,l.source_attempt,l.capture_hash,l.bucket_epoch,c.context_json FROM private_item_hour_latest l LEFT JOIN private_item_hour_captures c ON c.capture_hash=l.capture_hash WHERE l.source_url=? AND l.item_id=? AND l.bucket_epoch>? ORDER BY l.bucket_epoch LIMIT ?',sourceUrl,itemId,afterEpoch,limit+1).toArray(),more=rows.length>limit,selected=rows.slice(0,limit);
  const output=[];for(const r of selected){const row=validateProjectedHour(JSON.parse(r.body)),context=JSON.parse(r.context_json??'null');check(row.providerBucketEpochSeconds===r.bucket_epoch&&context&&context.itemId===itemId&&context.sourceUrl===sourceUrl&&context.capturedAt===r.captured_at&&context.attemptId===r.source_attempt,'history_saved_source_context');check(await portableHash(row)===r.body_hash,'history_saved_row_hash');output.push({...row,originalCapturedAt:r.captured_at,sourceAttemptId:r.source_attempt,captureHash:r.capture_hash});}
  check(this.active,'history_disabled_during_read');return{itemId,sourceUrl,sourceObservedAt:null,individualTradesQualified:0,qualityConstant:false,variantIdentity:null,rows:output,nextAfterEpoch:more?selected.at(-1).bucket_epoch:null,completeTradeHistory:false};
 }
}
