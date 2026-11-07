import {decodeCanonicalBase64} from './bounded-base64.mjs';
// Same-owner optional normalized calculation queue. No provider transport/key,
// visitor handler, public route or reconfiguration of the existing raw schedule.
import {historyEnvelopeText,parseHistoryEnvelope} from './api-private-item-history-receipt.mjs';
import {validateIndexPointer} from './api-index-publication-contract.mjs';
import {prepareOverviewAdaptation,overviewIndex79FromAdaptation,isOverviewAdaptation} from './api-overview-adapter.mjs';
import {sharedOverviewConfiguration} from './api-shared-overview-guard.mjs';
import {isOwnedRecurringRegistry,isOwnedStampRegistryCommit} from './item-recurring-registry.mjs';
import {OverviewProfileError} from './api-overview-snapshot.mjs';
const HASH=/^[a-f0-9]{64}$/,KEY=/^_private\/provider-api\/v1\/receipts\/(\d{12,16})-(prices|overview)-([a-f0-9]{64})\.json$/;
const URLS={prices:'https://maplestory.market/api/prices',overview:'https://maplestory.market/api/market/overview'},PREFIX='_private/provider-api/v1/api-index/v1/',LEASE=130000;
export const INDEX_POINTER=PREFIX+'current.json',ACTIVE_DAYS=64,MAX_PUBLIC_BYTES=600000;
const enc=new TextEncoder(),bytes=s=>enc.encode(s).length,integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const clock=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
class StorageFailure extends Error{}class Paused extends Error{}class ContractFailure extends Error{}class Stale extends Error{}class Waiting extends Error{}
const check=(v,c='index_owner_contract')=>{if(!v)throw new ContractFailure(c);};
const io=async fn=>{try{return await fn();}catch{throw new StorageFailure('index_owned_storage_retry');}};
const shape=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|'));
const parsed=text=>{try{return JSON.parse(text);}catch{throw new ContractFailure('stored_index_json');}};
export function apiIndexOwnerConfiguration(env){try{
 const v=JSON.parse(env.API_PRIVATE_INDEX_JSON??'{"enabled":false}');
 if(v&&Object.keys(v).join(',')==='enabled'&&v.enabled===false)return{status:'disabled'};
 if(!v||Object.keys(v).sort().join(',')!=='definitionHash,enabled,methodVersion,publicationEnabled,schemaVersion'||v.schemaVersion!==1||v.enabled!==true||v.methodVersion!==1||v.publicationEnabled!==false||!HASH.test(v.definitionHash))return{status:'invalid_configuration'};
 return{status:'ready',definitionHash:v.definitionHash};
 }catch{return{status:'invalid_configuration'};}}
export function ownedCalculationSource(core,{receiptKey,jobKey}){
 const m=KEY.exec(receiptKey??'');check(m&&String(Number(m[1])).padStart(12,'0')===m[1]&&integer(Number(m[1]),1),'owned_receipt_key');
 const g=core.config();if(g.enabled!==true)throw new Paused();
 const r=core.row(`SELECT j.job_key,j.operation,j.state,j.round_ref,j.receipt_key,a.id,a.at,a.result,a.grant_ref
  FROM api_jobs j JOIN api_attempts a ON a.job_key=j.job_key AND a.id=? WHERE j.job_key=?`,Number(m[1]),jobKey);
 check(r&&r.operation===m[2]&&r.state==='complete'&&r.round_ref===g.probeRound&&r.receipt_key===receiptKey&&r.result==='success'&&r.grant_ref===g.grantReference&&integer(r.at,1)&&r.at<=core.clock(),'completed_owned_source');
 return Object.freeze({receiptKey,jobKey:r.job_key,operation:r.operation,sourceAttemptId:r.id,requestAt:r.at,rawSha256:m[3],sourceUrl:URLS[r.operation],grantReference:g.grantReference,roundReference:g.probeRound});
}
const STAMP_INDEX_OWNERS=new WeakMap(),STAMP_INDEX_PHASES=new WeakMap();
export function isOwnedStampIndexBridge(value,ctx,core,registry){const b=STAMP_INDEX_OWNERS.get(value);return !!b&&b.ctx===ctx&&b.core===core&&b.registry===registry;}
export function isOwnedStampIndexCommit(value,bridge,ctx,core,ticket){const b=STAMP_INDEX_PHASES.get(value);return !!b&&b.bridge===bridge&&b.ctx===ctx&&b.core===core&&b.ticket===ticket;}
export class ApiIndexOwnerBridge{
 #tickets=new WeakMap();
 #stampTickets=new WeakMap();
 constructor(ctx,env,core,{definition=null,api=null,registry=null,stampReferences=null}={}){
  this.ctx=ctx;this.env=env;this.core=core;this.definition=definition;this.api=api;this.registry=registry;this.flight=null;
  const cfg=apiIndexOwnerConfiguration(env);this.definitionHash=cfg.definitionHash;
  if(cfg.status!=='ready')return;
  check(core.ctx===ctx,'same_owner_required');
  if(!definition||definition.definitionHash!==cfg.definitionHash||!api||!registry)return;
  api.definitionData(definition);this.binding=core.config();if(this.binding.enabled!==true)return;
  this.ensure();
  STAMP_INDEX_OWNERS.set(this,{ctx,core,registry});this.stampReferences=stampReferences;if(stampReferences)stampReferences.bindBridge(this);
 }
 get stampReferencePhaseRequired(){return this.stampReferences?.active===true;}
 get active(){try{const c=apiIndexOwnerConfiguration(this.env),g=this.core.config();return c.status==='ready'&&c.definitionHash===this.definitionHash&&this.definition?.definitionHash===c.definitionHash&&!!this.api&&!!this.registry&&this.binding?.enabled===true&&g.enabled===true&&g.grantReference===this.binding.grantReference&&g.probeRound===this.binding.probeRound;}catch{return false;}}
 guard(){if(!this.active)throw new Paused();}
 row(q,...a){return this.core.row(q,...a);}
 ensure(){if(!this.active)return;this.ctx.storage.transactionSync(()=>{
  this.core.sql.exec(`CREATE TABLE IF NOT EXISTS api_index_owner(id INTEGER PRIMARY KEY CHECK(id=1),definition_hash TEXT NOT NULL,grant_ref TEXT NOT NULL,round_ref TEXT NOT NULL,last_published INTEGER NOT NULL DEFAULT 0,next_publication INTEGER NOT NULL DEFAULT 0,cell_revision INTEGER NOT NULL DEFAULT 0)`);
  this.core.sql.exec('INSERT OR IGNORE INTO api_index_owner(id,definition_hash,grant_ref,round_ref)VALUES(1,?,?,?)',this.definitionHash,this.binding.grantReference,this.binding.probeRound);
  const c=this.row('SELECT * FROM api_index_owner WHERE id=1');check(c.definition_hash===this.definitionHash&&c.grant_ref===this.binding.grantReference&&c.round_ref===this.binding.probeRound,'frozen_definition_or_authority_changed');
  this.core.sql.exec(`CREATE TABLE IF NOT EXISTS api_index_inputs(id INTEGER PRIMARY KEY AUTOINCREMENT,receipt_key TEXT NOT NULL UNIQUE,job_key TEXT NOT NULL,operation TEXT NOT NULL,source_attempt INTEGER NOT NULL,request_at INTEGER NOT NULL,raw_sha TEXT NOT NULL,definition_hash TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',phase TEXT NOT NULL DEFAULT 'normalize',available_at INTEGER NOT NULL,claim INTEGER NOT NULL DEFAULT 0,lease_until INTEGER,failures INTEGER NOT NULL DEFAULT 0,capture_hash TEXT,capture_body TEXT,capture_sha TEXT,capture_key TEXT,captured_at TEXT,model_body TEXT,model_sha TEXT,model_key TEXT,snapshot_hash TEXT,price_capture_hash TEXT,overview_capture_hash TEXT,calculated_at TEXT,public_body TEXT,public_sha TEXT,public_key TEXT,prices_captured_at TEXT,overview_captured_at TEXT,publication_ordinal INTEGER,last_result TEXT)`);
  this.core.sql.exec('CREATE INDEX IF NOT EXISTS api_index_inputs_ready ON api_index_inputs(state,phase,available_at,id)');
  this.core.sql.exec('CREATE INDEX IF NOT EXISTS api_index_inputs_committed ON api_index_inputs(publication_ordinal,state,phase)');
  this.core.sql.exec('CREATE INDEX IF NOT EXISTS api_index_owned_source_jobs ON api_jobs(round_ref,state,operation)');
  this.core.sql.exec('CREATE INDEX IF NOT EXISTS api_index_owned_source_attempts ON api_attempts(grant_ref,result,id,job_key)');
  this.core.sql.exec('CREATE INDEX IF NOT EXISTS api_index_owned_attempt_jobs ON api_attempts(job_key,grant_ref,result,id)');
  this.core.sql.exec('CREATE TABLE IF NOT EXISTS api_index_days(item_id INTEGER NOT NULL,day TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(item_id,day))');
  this.core.sql.exec('CREATE INDEX IF NOT EXISTS api_index_days_window ON api_index_days(day,item_id)');
  this.core.sql.exec('CREATE TABLE IF NOT EXISTS api_index_day_revisions(item_id INTEGER NOT NULL,day TEXT NOT NULL,capture_hash TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(item_id,day,capture_hash))');
  this.core.sql.exec('CREATE TABLE IF NOT EXISTS api_index_latest(operation TEXT PRIMARY KEY,capture_body TEXT NOT NULL,capture_hash TEXT NOT NULL,captured_at TEXT NOT NULL,source_attempt INTEGER NOT NULL)');
 });}
 reconcile(limit=8){if(!this.active)return{status:'disabled',queued:0};check(integer(limit,1,8));
  return this.ctx.storage.transactionSync(()=>{
   const pending=this.row("SELECT COUNT(*)n FROM api_index_inputs WHERE state IN ('pending','running')").n;if(pending>=64)return{status:'input_backpressure',queued:0};
   const g=this.core.config(),rows=this.core.sql.exec(`WITH owned AS(SELECT j.job_key,j.operation,j.receipt_key,a.id,a.at,
    ROW_NUMBER() OVER(PARTITION BY j.operation ORDER BY a.id DESC)priority_rank,
    ROW_NUMBER() OVER(PARTITION BY j.operation,CAST(a.at/86400000 AS INTEGER) ORDER BY a.id DESC)request_day_rank
    FROM api_jobs j JOIN api_attempts a ON a.job_key=j.job_key WHERE j.state='complete' AND j.operation IN ('prices','overview') AND j.round_ref=? AND a.grant_ref=? AND a.result='success'
    AND j.receipt_key=('_private/provider-api/v1/receipts/'||printf('%012d',a.id)||'-'||j.operation||'-'||substr(j.receipt_key,-69)))
    SELECT o.* FROM owned o LEFT JOIN api_index_inputs c ON c.receipt_key=o.receipt_key
    WHERE c.receipt_key IS NULL AND (?=0 OR o.priority_rank=1)
    ORDER BY CASE WHEN o.priority_rank=1 THEN 0 ELSE 1 END,CASE WHEN o.operation='overview' AND o.request_day_rank=1 THEN 0 ELSE 1 END,CASE WHEN o.operation='overview' THEN 0 ELSE 1 END,o.id DESC LIMIT ?`,g.probeRound,g.grantReference,pending,Math.min(limit,64-pending)).toArray();
   let queued=0;for(const r of rows){const s=ownedCalculationSource(this.core,{receiptKey:r.receipt_key,jobKey:r.job_key});this.insert(s);queued++;}return{status:'owned_index_reconciled',queued};
  });
 }
 reserveSharedOverview(job){if(!this.active)return{status:'unavailable'};check(sharedOverviewConfiguration(this.env).status==='ready'&&isOwnedRecurringRegistry(this.registry,this.ctx),'shared_overview_registry_authority');const s=ownedCalculationSource(this.core,{receiptKey:job.receipt_key,jobKey:job.job_key});check(s.operation==='overview','shared_overview_operation');return this.ctx.storage.transactionSync(()=>{const old=this.row('SELECT id FROM api_index_inputs WHERE receipt_key=?',s.receiptKey);if(!old&&this.row("SELECT COUNT(*)n FROM api_index_inputs WHERE state IN ('pending','running')").n>=64)return{status:'backpressure'};this.insert(s);return{status:'reserved'};});}
 insert(s){this.core.sql.exec('INSERT OR IGNORE INTO api_index_inputs(receipt_key,job_key,operation,source_attempt,request_at,raw_sha,definition_hash,available_at)VALUES(?,?,?,?,?,?,?,?)',s.receiptKey,s.jobKey,s.operation,s.sourceAttemptId,s.requestAt,s.rawSha256,this.definitionHash,this.core.clock());}
 validateEnvelope(e,s){
  check(e&&e.kind==='unverified_provider_api_receipt'&&e.operation===s.operation&&e.sourceUrl===s.sourceUrl&&e.httpStatus===200&&e.attemptId===s.sourceAttemptId&&e.grantReference===s.grantReference&&e.roundReference===s.roundReference&&clock(e.requestStartedAt)&&Date.parse(e.requestStartedAt)===s.requestAt&&clock(e.capturedAt)&&Date.parse(e.capturedAt)>=s.requestAt&&Date.parse(e.capturedAt)<=this.core.clock()&&e.sourceObservedAt===null&&e.observationTimestampKnown===false&&e.schemaVerified===false&&e.publicationEligible===false&&e.captureTimeKind==='http_response_completed'&&e.responseSha256===s.rawSha256&&integer(e.responseBytes,1,5000000),'owned_normalization_context');
 }
 async normalize(s,envelope,raw,priceSnapshot=null,overviewAdaptation=null){
  this.validateEnvelope(envelope,s);const context={operation:s.operation,sourceUrl:s.sourceUrl,capturedAt:envelope.capturedAt,sourceObservedAt:null,captureTimeKind:'http_response_completed'};
  let capture,stampTicket=null;if(s.operation==='prices'){
   const snapshot=priceSnapshot??await this.registry.createCalculationSnapshot(raw,{...context,rawBodySha256:s.rawSha256});
   if(this.stampReferences?.active){try{stampTicket=await this.stampReferences.prepareFromSnapshot(this,s,envelope,snapshot);}catch{this.stampReferences.notePreparationFailure();}}
   const dtos=this.definition.targetItemIds.map(id=>snapshot.getItem(id)).filter(Boolean);
   capture=await this.api.normalizeApiPriceSubset(dtos,{context:{...context,rawBodySha256:s.rawSha256},definition:this.definition});
  }else{const shared=sharedOverviewConfiguration(this.env).status==='ready';if(overviewAdaptation&&!shared)throw new Paused();if(shared){check(isOwnedRecurringRegistry(this.registry,this.ctx),'shared_overview_registry_authority');const adaptation=overviewAdaptation??await prepareOverviewAdaptation(raw,{expectedSha256:s.rawSha256,context,definition:this.definition});if(sharedOverviewConfiguration(this.env).status!=='ready')throw new Paused();check(isOverviewAdaptation(adaptation)&&adaptation.source.rawBodySha256===s.rawSha256&&adaptation.source.capturedAt===envelope.capturedAt&&adaptation.source.sourceUrl===s.sourceUrl,'shared_overview_source_binding');const result=overviewIndex79FromAdaptation(adaptation,{definition:this.definition});if(result.status!=='ready')throw new this.api.InvalidCalculation(result.status==='derived_capacity_hold'?'shared_overview_capacity_hold':'shared_overview_profile_review');capture=result.capture;}else capture=await this.api.normalizeOverviewDailySubset(raw,{expectedSha256:s.rawSha256,context,definition:this.definition});}
  capture=await this.api.validateIndexCapture(capture,{definition:this.definition});check(capture.source.operation===s.operation&&capture.source.rawBodySha256===s.rawSha256&&capture.source.capturedAt===envelope.capturedAt,'normalized_capture_binding');if(stampTicket)this.#stampTickets.set(capture,stampTicket);return capture;
 }
 async prepareRegistryCapture({job,envelope,raw,priceSnapshot=null,overviewAdaptation=null}){
  if(!this.active||!['prices','overview'].includes(job.operation))return null;
  const s=ownedCalculationSource(this.core,{receiptKey:job.receipt_key,jobKey:job.job_key});
  // The normal path reuses the registry's already normalized prices snapshot.
  // Failures are confined to this optional model; ID admission is never quarantined by it.
  let capture=null,error=false,sharedHold=null;try{capture=await this.normalize(s,envelope,raw,priceSnapshot,overviewAdaptation);}catch(reason){error=true;if(overviewAdaptation&&isOverviewAdaptation(overviewAdaptation)&&sharedOverviewConfiguration(this.env).status==='ready'&&['shared_overview_capacity_hold','shared_overview_profile_review'].includes(reason?.message))sharedHold=reason.message==='shared_overview_capacity_hold'?'capacity_hold':'quarantined';}
  if(!this.active)return null;const ticket=Object.freeze({});this.#tickets.set(ticket,{s,capture,error,sharedHold,sharedCommit:overviewAdaptation!==null&&isOverviewAdaptation(overviewAdaptation)&&sharedOverviewConfiguration(this.env).status==='ready',stampTicket:capture?this.#stampTickets.get(capture)??null:null});if(capture)this.#stampTickets.delete(capture);return ticket;
 }
 commitRegistryCapture(ticket,stampPhase=null){
  if(ticket===null||!this.active)return;const prepared=this.#tickets.get(ticket);check(prepared,'owned_normalization_ticket');this.#tickets.delete(ticket);const {s,capture,error,sharedHold,sharedCommit}=prepared;
  const current=ownedCalculationSource(this.core,{receiptKey:s.receiptKey,jobKey:s.jobKey});check(Object.keys(s).every(k=>s[k]===current[k]),'prepared_source_rebound');
  if(prepared.stampTicket&&this.stampReferences?.active){check(isOwnedStampRegistryCommit(stampPhase,this.registry,this.ctx,this.core,ticket),'stamp_registry_commit_phase');this.stampReferences.commitFromRegistry(prepared.stampTicket,{bridge:this,phase:stampPhase,calculationTicket:ticket});check(this.stampReferences.active,'stamp_commit_paused');}
  // A full optional queue never blocks existing registry admission. The raw
  // completed source remains in api_jobs and is reconciled after the backlog.
  const old=this.row('SELECT id FROM api_index_inputs WHERE receipt_key=?',s.receiptKey);
  if(!old&&this.row("SELECT COUNT(*)n FROM api_index_inputs WHERE state IN ('pending','running')").n>=64)return;
  this.insert(s);
  // A concurrent normalize claim must not discard the already prepared shared result.
  // Cancel ONLY that raw-normalization lease inside the registry commit transaction.
  if(sharedCommit){const r=this.row('SELECT state,phase,claim FROM api_index_inputs WHERE receipt_key=?',s.receiptKey);if(r?.state==='running'&&r.phase==='normalize'){check(integer(r.claim,0,Number.MAX_SAFE_INTEGER-1),'shared_normalization_claim_capacity');this.core.sql.exec("UPDATE api_index_inputs SET state='pending',lease_until=NULL,claim=claim+1 WHERE receipt_key=? AND state='running' AND phase='normalize' AND claim=?",s.receiptKey,r.claim);}}
  // A retry/strict failure leaves durable own-source metadata for a separate
  // recovery event, without rolling back the already verified ID registry.
  if(error){if(sharedHold)this.core.sql.exec("UPDATE api_index_inputs SET state=?,last_result='shared_overview_derived_review' WHERE receipt_key=? AND state='pending' AND phase='normalize'",sharedHold,s.receiptKey);return;}
  const body=JSON.stringify(capture);check(bytes(body)<=1048576,'normalized_capture_capacity');
  this.core.sql.exec("UPDATE api_index_inputs SET capture_hash=?,capture_body=?,captured_at=?,phase='archive',last_result='registry_normalization_reused' WHERE receipt_key=? AND state='pending' AND phase='normalize'",capture.captureHash,body,capture.source.capturedAt,s.receiptKey);
 }
 indexNextDue(){if(!this.active)return null;const running=this.row("SELECT lease_until FROM api_index_inputs WHERE state='running' ORDER BY id LIMIT 1");if(running)return running.lease_until;return this.nextPending()?.available_at??null;}
 nextDue(){const current=this.indexNextDue();if(!this.stampReferences?.active)return current;const stamp=this.stampReferences.nextDue();return current===null?stamp:stamp===null?current:Math.min(current,stamp);}
 nextPending(){const g=this.core.config();return this.row(`SELECT i.* FROM api_index_inputs i WHERE i.state='pending'
  ORDER BY CASE WHEN i.phase NOT IN ('normalize','archive') THEN 0 ELSE 1 END,
   CASE WHEN i.source_attempt=(SELECT MAX(a.id) FROM api_jobs j JOIN api_attempts a ON a.job_key=j.job_key
    WHERE j.operation=i.operation AND j.state='complete' AND j.round_ref=? AND a.grant_ref=? AND a.result='success'
     AND j.receipt_key=('_private/provider-api/v1/receipts/'||printf('%012d',a.id)||'-'||j.operation||'-'||substr(j.receipt_key,-69))) THEN 0 ELSE 1 END,
   CASE WHEN i.operation='overview' AND CAST(i.request_at/86400000 AS INTEGER)<(SELECT CAST(MAX(a.at)/86400000 AS INTEGER) FROM api_jobs j JOIN api_attempts a ON a.job_key=j.job_key WHERE j.operation='overview' AND j.state='complete' AND j.round_ref=? AND a.grant_ref=? AND a.result='success') THEN 0 ELSE 1 END,
   CASE WHEN i.operation='overview' THEN 0 ELSE 1 END,i.source_attempt DESC,i.id DESC LIMIT 1`,g.probeRound,g.grantReference,g.probeRound,g.grantReference);}
 defer(){if(!this.active)return null;const at=this.core.clock()+30000;if(this.stampReferences?.active)this.stampReferences.defer();this.core.sql.exec("UPDATE api_index_inputs SET available_at=MAX(available_at,?) WHERE state='pending'",at);return at;}
 claim(){return this.ctx.storage.transactionSync(()=>{
  this.core.sql.exec("UPDATE api_index_inputs SET state='pending',lease_until=NULL,last_result='interrupted' WHERE state='running' AND lease_until<=?",this.core.clock());if(this.row("SELECT 1 FROM api_index_inputs WHERE state='running' LIMIT 1"))return null;
  const job=this.nextPending();if(!job||job.available_at>this.core.clock())return null;
  check(integer(job.claim)&&job.claim<Number.MAX_SAFE_INTEGER,'index_claim_capacity');this.core.sql.exec("UPDATE api_index_inputs SET state='running',claim=claim+1,lease_until=? WHERE id=?",this.core.clock()+LEASE,job.id);return{...job,claim:job.claim+1};
 });}
 fence(j){this.guard();const c=this.row('SELECT * FROM api_index_owner WHERE id=1'),r=this.row('SELECT state,claim,lease_until FROM api_index_inputs WHERE id=?',j.id);check(c.definition_hash===this.definitionHash&&c.grant_ref===this.binding.grantReference&&c.round_ref===this.binding.probeRound,'frozen_index_scope');if(r?.state!=='running'||r.claim!==j.claim||r.lease_until<=this.core.clock())throw new Stale();const s=ownedCalculationSource(this.core,{receiptKey:j.receipt_key,jobKey:j.job_key});check(s.operation===j.operation&&s.sourceAttemptId===j.source_attempt&&s.requestAt===j.request_at&&s.rawSha256===j.raw_sha&&j.definition_hash===this.definitionHash,'stored_source_rebound');}
 async immutable(key,body,job){
  this.fence(job);const old=await io(()=>this.core.env.API_RAW_RECEIPTS.get(key));this.fence(job);if(old){check(integer(old.size,1,2097152)&&old.size===bytes(body),'immutable_index_size');const text=await io(()=>old.text());this.fence(job);check(text===body,'immutable_index_conflict');return;}
  this.fence(job);
  const result=await io(()=>this.core.env.API_RAW_RECEIPTS.put(key,body,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}}));if(!result)throw new StorageFailure('immutable_index_write_race');
 }
 cells(){const latest=this.row('SELECT MAX(day)day FROM api_index_days').day;if(!latest)return[];const start=new Date(Date.parse(latest+'T00:00:00Z')-(ACTIVE_DAYS-1)*86400000).toISOString().slice(0,10);const rows=this.core.sql.exec('SELECT body FROM api_index_days WHERE day>=? ORDER BY day,item_id LIMIT 5057',start).toArray();check(rows.length<=79*ACTIVE_DAYS,'active_cell_capacity');return rows.map(r=>parsed(r.body));}
 async drainOne(beforeIO){if(!this.active)return{status:'disabled',providerAttempted:false};if(this.flight)return{status:'busy',providerAttempted:false};check(typeof beforeIO==='function','index_recovery_required');const stamp=this.stampReferences?.active&&this.stampReferences.fairnessStampDue(this.indexNextDue());this.flight=stamp?this.stampReferences.drainOne(beforeIO):this.perform(beforeIO);try{return await this.flight;}finally{this.flight=null;if(this.stampReferences?.active)this.stampReferences.noteKind(stamp?'stamp':'index');}}
 async perform(beforeIO){const job=this.claim();if(!job)return{status:'idle',providerAttempted:false};try{
  await beforeIO(this.core.clock()+LEASE);this.fence(job);
  const source=ownedCalculationSource(this.core,{receiptKey:job.receipt_key,jobKey:job.job_key});
  if(job.phase==='normalize'){
   if(job.operation==='overview'&&sharedOverviewConfiguration(this.env).status==='ready'){check(isOwnedRecurringRegistry(this.registry,this.ctx),'shared_overview_registry_authority');const r=this.row('SELECT state FROM recurring_registry_jobs WHERE receipt_key=?',job.receipt_key);if(!r||r.state==='pending'||r.state==='running')throw new Waiting();check(r.state==='complete','shared_overview_registry_review');const c=this.row('SELECT * FROM recurring_registry_captures WHERE receipt_key=?',job.receipt_key);check(c&&c.operation==='overview'&&c.source_attempt===job.source_attempt&&c.raw_sha===job.raw_sha&&Date.parse(c.request_started_at)===job.request_at,'shared_overview_registry_capture_binding');}
   const o=await io(()=>this.core.env.API_RAW_RECEIPTS.get(job.receipt_key));this.fence(job);check(o&&integer(o.size,1,7500000),'owned_receipt_size');
   let text;try{text=await historyEnvelopeText(o);}catch(e){if(e?.name==='ItemHistoryContractError')throw new ContractFailure('owned_envelope_contract');throw new StorageFailure('owned_envelope_read');}
   let e;try{e=parseHistoryEnvelope(text);}catch{throw new ContractFailure('owned_envelope_contract');}this.validateEnvelope(e,source);check(e.rawBodyEncoding==='base64'&&typeof e.rawBodyBase64==='string'&&e.rawBodyBase64.length<=6666668,'owned_raw_encoding');let raw;try{raw=decodeCanonicalBase64(e.rawBodyBase64,e.responseBytes);}catch{throw new ContractFailure('owned_raw_bytes');}const capture=await this.normalize(source,e,raw);this.fence(job);const body=JSON.stringify(capture);check(bytes(body)<=1048576,'normalized_capture_capacity');const stampTicket=this.#stampTickets.get(capture);this.#stampTickets.delete(capture);if(stampTicket&&this.stampReferences?.active){this.ctx.storage.transactionSync(()=>{this.fence(job);const phase=Object.freeze({});STAMP_INDEX_PHASES.set(phase,{bridge:this,ctx:this.ctx,core:this.core,ticket:stampTicket});try{this.stampReferences.commitFromIndex(stampTicket,{bridge:this,phase});this.fence(job);check(this.stampReferences.active,'stamp_commit_paused');this.core.sql.exec("UPDATE api_index_inputs SET capture_body=?,capture_hash=?,captured_at=?,phase='archive',state='pending',lease_until=NULL,available_at=? WHERE id=? AND claim=?",body,capture.captureHash,capture.source.capturedAt,this.core.clock(),job.id,job.claim);}finally{STAMP_INDEX_PHASES.delete(phase);}});}else{this.core.sql.exec("UPDATE api_index_inputs SET capture_body=?,capture_hash=?,captured_at=?,phase='archive',state='pending',lease_until=NULL,available_at=? WHERE id=? AND claim=?",body,capture.captureHash,capture.source.capturedAt,this.core.clock(),job.id,job.claim);}return{status:'index_capture_normalized',providerAttempted:false};
  }
  const capture=await this.api.validateIndexCapture(parsed(job.capture_body),{definition:this.definition});this.fence(job);check(capture.captureHash===job.capture_hash&&capture.source.rawBodySha256===job.raw_sha&&capture.source.capturedAt===job.captured_at,'stored_index_capture_binding');
  if(job.phase==='archive'){
   const body=job.capture_body,sha=await hash(body),key=PREFIX+'captures/'+sha+'.json';await this.immutable(key,body,job);this.fence(job);this.core.sql.exec("UPDATE api_index_inputs SET capture_sha=?,capture_key=?,phase='apply',state='pending',lease_until=NULL,available_at=? WHERE id=? AND claim=?",sha,key,this.core.clock(),job.id,job.claim);return{status:'index_source_archived',providerAttempted:false};
  }
  if(job.phase==='apply'){
   const current=this.row('SELECT * FROM api_index_latest WHERE operation=?',job.operation),prior=current?await this.api.validateIndexCapture(parsed(current.capture_body),{definition:this.definition}):null;
   if(prior&&Date.parse(capture.source.capturedAt)===Date.parse(prior.source.capturedAt)&&capture.captureHash!==prior.captureHash)throw new ContractFailure('same_clock_source_conflict');
   const cells=job.operation==='overview'?this.api.dailyCaptureCells(capture,{definition:this.definition}):null;this.fence(job);
   this.ctx.storage.transactionSync(()=>{this.fence(job);if(cells){for(const c of cells){const b=JSON.stringify(c),old=this.row('SELECT body FROM api_index_days WHERE item_id=? AND day=?',c.itemId,c.day),p=old?parsed(old.body):null;
    if(p&&Date.parse(p.source.capturedAt)===Date.parse(c.source.capturedAt)&&(p.captureHash!==c.captureHash||old.body!==b))throw new ContractFailure('same_clock_daily_revision');
    const revisionFields=x=>JSON.stringify([x.medianUnitPriceLexeme,x.recordedSalesCount,x.reportedUnitCount,x.sourceCashFlag,x.day>=x.source.sourceGeneratedAt.slice(0,10)]);
    // Every receipt is archived above; repeated identical historical tuples do
    // not multiply SQLite market revisions. Latest provenance still advances.
    if(!p||revisionFields(p)!==revisionFields(c))this.core.sql.exec('INSERT OR IGNORE INTO api_index_day_revisions VALUES(?,?,?,?)',c.itemId,c.day,c.captureHash,b);
    if(!p||Date.parse(p.source.capturedAt)<Date.parse(c.source.capturedAt))this.core.sql.exec('INSERT INTO api_index_days VALUES(?,?,?)ON CONFLICT(item_id,day)DO UPDATE SET body=excluded.body',c.itemId,c.day,b);
   }this.core.sql.exec('UPDATE api_index_owner SET cell_revision=cell_revision+1 WHERE id=1');}
    if(!prior||Date.parse(capture.source.capturedAt)>Date.parse(prior.source.capturedAt)||capture.captureHash===prior.captureHash)this.core.sql.exec('INSERT INTO api_index_latest VALUES(?,?,?,?,?)ON CONFLICT(operation)DO UPDATE SET capture_body=excluded.capture_body,capture_hash=excluded.capture_hash,captured_at=excluded.captured_at,source_attempt=excluded.source_attempt',job.operation,job.capture_body,job.capture_hash,job.captured_at,job.source_attempt);
    this.core.sql.exec("UPDATE api_index_inputs SET phase='compute',state='pending',lease_until=NULL,available_at=? WHERE id=? AND claim=?",this.core.clock(),job.id,job.claim);
   });return{status:'index_daily_ledger_applied',providerAttempted:false};
  }
  if(job.phase==='compute'){
   const p=this.row("SELECT * FROM api_index_latest WHERE operation='prices'"),o=this.row("SELECT * FROM api_index_latest WHERE operation='overview'");const priceCapture=p?await this.api.validateIndexCapture(parsed(p.capture_body),{definition:this.definition}):null,overview=o?await this.api.validateIndexCapture(parsed(o.capture_body),{definition:this.definition}):null;
   const model=await this.api.assertApiIndexSnapshot(await this.api.calculateApiIndexSnapshot({definition:this.definition,priceCapture,dailyCells:this.cells(),latestOverview:overview?.source??null,activeWindowDays:ACTIVE_DAYS}),{definition:this.definition});this.fence(job);const calculatedAt=new Date(this.core.clock()).toISOString();check(model.maxInputCapturedAt===null||Date.parse(model.maxInputCapturedAt)<=this.core.clock(),'future_calculation_input');
   const publicBody=JSON.stringify(model);check(bytes(publicBody)<=MAX_PUBLIC_BYTES,'public_model_capacity');const publicSha=await hash(publicBody),publicKey=PREFIX+'public-models/'+publicSha+'.json';
   this.fence(job);const ordinal=this.ctx.storage.transactionSync(()=>{this.fence(job);const next=this.row('SELECT next_publication FROM api_index_owner WHERE id=1').next_publication;if(job.publication_ordinal!==null){check(integer(job.publication_ordinal,1,next),'stored_publication_ordinal');return job.publication_ordinal;}check(integer(next,0,Number.MAX_SAFE_INTEGER-1),'publication_ordinal_capacity');this.core.sql.exec('UPDATE api_index_owner SET next_publication=? WHERE id=1',next+1);this.core.sql.exec('UPDATE api_index_inputs SET publication_ordinal=? WHERE id=? AND claim=?',next+1,job.id,job.claim);return next+1;});
   const body=JSON.stringify({schemaVersion:1,kind:'private_api_index_model_event',definitionHash:this.definitionHash,eventId:job.id,publicationOrdinal:ordinal,causeCaptureHash:job.capture_hash,priceCaptureHash:p?.capture_hash??null,overviewCaptureHash:o?.capture_hash??null,calculatedAt,model,sourceObservedAt:null,publicationEligible:false});check(bytes(body)<=2097152,'index_model_size');const sha=await hash(body);this.fence(job);this.core.sql.exec("UPDATE api_index_inputs SET model_body=?,model_sha=?,model_key=?,snapshot_hash=?,price_capture_hash=?,overview_capture_hash=?,calculated_at=?,public_body=?,public_sha=?,public_key=?,prices_captured_at=?,overview_captured_at=?,phase='artifact',state='pending',lease_until=NULL,available_at=? WHERE id=? AND claim=?",body,sha,PREFIX+'models/'+sha+'.json',model.snapshotHash,p?.capture_hash??null,o?.capture_hash??null,calculatedAt,publicBody,publicSha,publicKey,model.sources.prices?.capturedAt??null,model.sources.overview?.capturedAt??null,this.core.clock(),job.id,job.claim);return{status:'index_model_computed',providerAttempted:false};
  }
  if(job.phase==='artifact'){
   check(typeof job.model_body==='string'&&await hash(job.model_body)===job.model_sha&&job.model_key===PREFIX+'models/'+job.model_sha+'.json','staged_model_binding');await this.immutable(job.model_key,job.model_body,job);this.fence(job);this.core.sql.exec("UPDATE api_index_inputs SET phase='public-artifact',state='pending',lease_until=NULL,available_at=? WHERE id=? AND claim=?",this.core.clock(),job.id,job.claim);return{status:'index_model_artifact_stored',providerAttempted:false};
  }
  if(job.phase==='public-artifact'){
   check(typeof job.public_body==='string'&&bytes(job.public_body)<=MAX_PUBLIC_BYTES&&await hash(job.public_body)===job.public_sha&&job.public_key===PREFIX+'public-models/'+job.public_sha+'.json','staged_public_model_binding');await this.api.assertApiIndexSnapshot(parsed(job.public_body),{definition:this.definition});this.fence(job);await this.immutable(job.public_key,job.public_body,job);this.fence(job);this.core.sql.exec("UPDATE api_index_inputs SET phase='pointer',state='pending',lease_until=NULL,available_at=? WHERE id=? AND claim=?",this.core.clock(),job.id,job.claim);return{status:'index_public_safe_artifact_stored',providerAttempted:false};
  }
  check(job.phase==='pointer','index_phase');const pointerKey=PREFIX+'current.json',old=await io(()=>this.core.env.API_RAW_RECEIPTS.get(pointerKey));this.fence(job);
  const intended={schemaVersion:1,kind:'private_api_index_pointer',definitionHash:this.definitionHash,publicationOrdinal:job.publication_ordinal,modelKey:job.model_key,modelSha256:job.model_sha,modelBytes:bytes(job.model_body),snapshotHash:job.snapshot_hash,causeCaptureHash:job.capture_hash,priceCaptureHash:job.price_capture_hash,overviewCaptureHash:job.overview_capture_hash,calculatedAt:job.calculated_at,publicKey:job.public_key,publicBodySha256:job.public_sha,publicBytes:bytes(job.public_body),pricesCapturedAt:job.prices_captured_at,overviewCapturedAt:job.overview_captured_at,sourceObservedAt:null,publicationEligible:false};
  try{validateIndexPointer(intended,{definitionHash:this.definitionHash});}catch{throw new ContractFailure('staged_index_pointer');}
  check(await hash(job.model_body)===job.model_sha&&await hash(job.public_body)===job.public_sha,'pointer_staged_body_binding');
  const event=parsed(job.model_body),publicModel=await this.api.assertApiIndexSnapshot(parsed(job.public_body),{definition:this.definition});
  shape(event,['schemaVersion','kind','definitionHash','eventId','publicationOrdinal','causeCaptureHash','priceCaptureHash','overviewCaptureHash','calculatedAt','model','sourceObservedAt','publicationEligible']);
  check(event.schemaVersion===1&&event.kind==='private_api_index_model_event'&&event.definitionHash===this.definitionHash&&event.eventId===job.id&&event.publicationOrdinal===job.publication_ordinal&&event.causeCaptureHash===job.capture_hash&&event.priceCaptureHash===job.price_capture_hash&&event.overviewCaptureHash===job.overview_capture_hash&&event.calculatedAt===job.calculated_at&&event.sourceObservedAt===null&&event.publicationEligible===false&&JSON.stringify(event.model)===job.public_body&&publicModel.snapshotHash===job.snapshot_hash&&publicModel.sources.prices?.capturedAt=== (job.prices_captured_at??undefined)&&publicModel.sources.overview?.capturedAt===(job.overview_captured_at??undefined),'pointer_event_binding');
  if(old){check(integer(old.size,1,8192),'index_pointer_size');const text=await io(()=>old.text());check(bytes(text)===old.size,'index_pointer_size');let previous;try{previous=validateIndexPointer(parsed(text),{definitionHash:this.definitionHash});}catch{throw new ContractFailure('index_pointer_contract');}check(previous.publicationOrdinal<=job.publication_ordinal,'index_pointer_scope_or_rollback');for(const k of ['pricesCapturedAt','overviewCapturedAt'])if(previous[k]!==null)check(intended[k]!==null&&Date.parse(intended[k])>=Date.parse(previous[k]),'index_input_clock_rollback');if(previous.publicationOrdinal===job.publication_ordinal){check(JSON.stringify(previous)===JSON.stringify(intended),'same_event_pointer_conflict');this.complete(job);return{status:'index_pointer_ack_recovered',providerAttempted:false};}}
  this.fence(job);
  const written=await io(()=>this.core.env.API_RAW_RECEIPTS.put(pointerKey,JSON.stringify(intended),{onlyIf:old?{etagMatches:old.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}}));this.fence(job);if(!written)throw new StorageFailure('index_pointer_cas');this.complete(job);return{status:'index_model_published_private',providerAttempted:false};
 }catch(error){
  const r=this.row('SELECT state,claim FROM api_index_inputs WHERE id=?',job.id);if(r?.state!=='running'||r.claim!==job.claim)return{status:'stale_index_claim',providerAttempted:false};
  if(error instanceof Waiting){const retryAt=this.core.clock()+30000;this.core.sql.exec("UPDATE api_index_inputs SET state='pending',lease_until=NULL,available_at=?,last_result='shared_registry_wait' WHERE id=? AND claim=?",retryAt,job.id,job.claim);return{status:'index_shared_registry_wait',retryAt,providerAttempted:false};}
  const paused=error instanceof Paused||error instanceof Stale||!this.active,capacity=!paused&&/capacity|_size$/.test(error?.message??''),bad=error instanceof ContractFailure||error instanceof OverviewProfileError||error?.name==='InvalidCalculation'||error?.name==='InvalidProfile';const retryAt=this.core.clock()+(paused?30000:Math.min(300000,30000*2**Math.min(job.failures,4)));
  this.core.sql.exec('UPDATE api_index_inputs SET state=?,lease_until=NULL,failures=failures+1,available_at=?,last_result=? WHERE id=? AND claim=?',paused?'pending':capacity?'capacity_hold':bad?'quarantined':'pending',retryAt,paused?'paused':capacity?'calculation_capacity_review':bad?'calculation_contract_review':'owned_storage_retry',job.id,job.claim);
  return{status:paused?'index_paused':capacity?'index_capacity_hold':bad?'index_contract_review':'index_storage_retry',retryAt,providerAttempted:false};
 }}
 complete(job){this.ctx.storage.transactionSync(()=>{this.fence(job);this.core.sql.exec("UPDATE api_index_inputs SET state='complete',phase='done',lease_until=NULL,capture_body=NULL,model_body=NULL,public_body=NULL,last_result='published' WHERE id=? AND claim=?",job.id,job.claim);this.core.sql.exec('UPDATE api_index_owner SET last_published=MAX(last_published,?) WHERE id=1',job.publication_ordinal);});}
 health(){if(!this.active)return{status:apiIndexOwnerConfiguration(this.env).status};const counts={pending:0,running:0,complete:0,quarantined:0,capacity_hold:0};for(const r of this.core.sql.exec('SELECT state,COUNT(*)count FROM api_index_inputs GROUP BY state').toArray()){check(Object.hasOwn(counts,r.state)&&integer(r.count),'index_health_counter');counts[r.state]=r.count;}
  const p=this.row("SELECT captured_at FROM api_index_latest WHERE operation='prices'"),o=this.row("SELECT captured_at FROM api_index_latest WHERE operation='overview'");
  return{diagnosticVersion:1,status:counts.capacity_hold?'capacity_hold':counts.quarantined?'contract_review':counts.pending||counts.running?'pending':'private_only',definitionHash:this.definitionHash,sourceObservedAt:null,qualifiedIndividualTrades:0,remoteR2Availability:'not_checked',counts,dailyCells:this.row('SELECT COUNT(*)n FROM api_index_days').n,activeComputeWindowDays:ACTIVE_DAYS,lastPublishedOrdinal:this.row('SELECT last_published FROM api_index_owner WHERE id=1').last_published,pricesCapturedAt:p?.captured_at??null,overviewCapturedAt:o?.captured_at??null};}
}
