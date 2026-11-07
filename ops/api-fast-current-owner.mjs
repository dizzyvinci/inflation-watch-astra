// WORK-only bounded same-owner transaction foundation. No R2 writer/route/mux flag.
import{ApiCollectorCore}from'./api-collector-core.mjs';
import{isOwnedRecurringRegistry,isOwnedFastCurrentPreparation,isOwnedFastCurrentCommit}from'./item-recurring-registry.mjs';
import{ownedCalculationSource}from'./api-index-owner-bridge.mjs';
import{compileFastCurrent,assertFastManifest}from'./api-fast-current-projection.mjs';
export const FAST_LIMITS=Object.freeze({version:1,slots:3,generationBytes:12582912,spoolBytes:33554432,manifestBytes:1048576,registryLeaseMs:130000});
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const byteLength=s=>enc.encode(s).length;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=v=>structuredClone(v);
const integer=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const check=(v,c)=>{if(!v)throw Error(c);};
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const hash=/^[a-f0-9]{64}$/;
const HOLD_REASONS=new Set(['spool_capacity_hold','projection_capacity_hold','projection_review','reservation_busy']);
const SOURCE_KEYS=['receiptKey','jobKey','operation','sourceAttemptId','requestAt','rawSha256','sourceUrl','grantReference','roundReference'];
function equalSource(a,b){return SOURCE_KEYS.every(k=>a[k]===b[k]);}
export class FastCurrentRegistrySink{
 #tickets=new WeakMap();
 constructor(ctx,core,registry,{enabled=false,isEnabled=()=>true}={}){
  this.enabled=enabled===true;if(!this.enabled)return;
  check(core instanceof ApiCollectorCore&&core.ctx===ctx&&isOwnedRecurringRegistry(registry,ctx)&&registry.core===core,'fast_same_owner_required');
  this.ctx=ctx;this.core=core;this.registry=registry;this.isEnabled=isEnabled;
  this.scope=core.config();if(this.scope.enabled!==true)return;
  this.ctx.storage.transactionSync(()=>{
   this.exec('CREATE TABLE IF NOT EXISTS fast_current_control(id INTEGER PRIMARY KEY CHECK(id=1),grant_ref TEXT NOT NULL,round_ref TEXT NOT NULL,epoch INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT \'ready\',hold_reason TEXT,hold_at INTEGER,latest_captured_at TEXT,latest_source_attempt INTEGER NOT NULL DEFAULT 0,current_slot INTEGER,recovery_slot INTEGER)');
   this.exec('INSERT OR IGNORE INTO fast_current_control(id,grant_ref,round_ref)VALUES(1,?,?)',this.scope.grantReference,this.scope.probeRound);
   const c=this.row('SELECT * FROM fast_current_control');check(c.grant_ref===this.scope.grantReference&&c.round_ref===this.scope.probeRound&&integer(c.epoch,0,Number.MAX_SAFE_INTEGER-1),'fast_scope_changed');
   this.exec('UPDATE fast_current_control SET epoch=epoch+1 WHERE id=1');this.epoch=c.epoch+1;
   this.exec('CREATE TABLE IF NOT EXISTS fast_current_reservation(id INTEGER PRIMARY KEY CHECK(id=1),epoch INTEGER NOT NULL,receipt_key TEXT NOT NULL,source_attempt INTEGER NOT NULL,registry_claim INTEGER NOT NULL,registry_lease INTEGER NOT NULL,limit_bytes INTEGER NOT NULL,state TEXT NOT NULL)');
   this.exec('CREATE TABLE IF NOT EXISTS fast_current_outbox(slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 3),receipt_key TEXT NOT NULL UNIQUE,job_key TEXT NOT NULL,source_attempt INTEGER NOT NULL,request_at INTEGER NOT NULL,raw_sha TEXT NOT NULL,captured_at TEXT NOT NULL,source_json TEXT NOT NULL,projector_version INTEGER NOT NULL,manifest_json TEXT NOT NULL,manifest_sha TEXT NOT NULL,spool_bytes INTEGER NOT NULL,state TEXT NOT NULL,prepared_at INTEGER NOT NULL,accepted_at INTEGER NOT NULL,replay_verified INTEGER NOT NULL DEFAULT 0)');
   this.exec('CREATE TABLE IF NOT EXISTS fast_current_shards(slot INTEGER NOT NULL,shard_index INTEGER NOT NULL,body TEXT NOT NULL,sha TEXT NOT NULL,bytes INTEGER NOT NULL,PRIMARY KEY(slot,shard_index))');
   this.exec('CREATE TABLE IF NOT EXISTS fast_current_deferred(id INTEGER PRIMARY KEY CHECK(id=1),receipt_key TEXT NOT NULL,job_key TEXT NOT NULL,source_attempt INTEGER NOT NULL,request_at INTEGER NOT NULL,raw_sha TEXT NOT NULL,captured_at TEXT NOT NULL,reason TEXT NOT NULL,operator_recorded_at INTEGER NOT NULL)');
  });
 }
 exec(q,...a){return this.core.sql.exec(q,...a);}
 row(q,...a){return this.core.row(q,...a);}
 get active(){if(!this.enabled)return false;try{const g=this.core.config(),c=this.row('SELECT * FROM fast_current_control');return this.isEnabled()===true&&this.registry.active&&g.enabled===true&&g.grantReference===this.scope.grantReference&&g.probeRound===this.scope.probeRound&&c.grant_ref===g.grantReference&&c.round_ref===g.probeRound&&c.epoch===this.epoch;}catch{return false;}}
 guard(){check(this.active,'fast_paused');}
 source(job){this.guard();this.registry.fence(job);const s=ownedCalculationSource(this.core,{receiptKey:job.receipt_key,jobKey:job.job_key});check(s.operation==='prices'&&job.operation==='prices'&&s.sourceAttemptId===job.source_attempt&&s.requestAt===job.request_at&&s.rawSha256===job.raw_sha,'fast_owned_source');return s;}
 validateEnvelope(e,s){check(e&&e.kind==='unverified_provider_api_receipt'&&e.operation==='prices'&&e.httpStatus===200&&e.sourceUrl===s.sourceUrl&&e.attemptId===s.sourceAttemptId&&e.grantReference===s.grantReference&&e.roundReference===s.roundReference&&iso(e.requestStartedAt)&&Date.parse(e.requestStartedAt)===s.requestAt&&iso(e.capturedAt)&&Date.parse(e.capturedAt)>=s.requestAt&&Date.parse(e.capturedAt)<=this.core.clock()&&e.sourceObservedAt===null&&e.observationTimestampKnown===false&&e.schemaVerified===false&&e.publicationEligible===false&&e.captureTimeKind==='http_response_completed'&&e.responseSha256===s.rawSha256&&integer(e.responseBytes,1,5000000),'fast_envelope');}
 control(){const c=this.row('SELECT * FROM fast_current_control');check(c&&['ready','held'].includes(c.state)&&(c.hold_reason===null||HOLD_REASONS.has(c.hold_reason))&&(c.latest_captured_at===null?c.latest_source_attempt===0:iso(c.latest_captured_at)&&integer(c.latest_source_attempt,1))&&c.current_slot===null&&c.recovery_slot===null,'fast_control_review');return c;}
 physicalBytes(){const n=this.row('SELECT COALESCE(SUM(length(CAST(manifest_json AS BLOB))),0)n FROM fast_current_outbox').n+this.row('SELECT COALESCE(SUM(length(CAST(body AS BLOB))),0)n FROM fast_current_shards').n;check(integer(n,0,FAST_LIMITS.spoolBytes),'fast_existing_spool_review');return n;}
 reserve(s,job){return this.ctx.storage.transactionSync(()=>{
  this.guard();const c=this.control(),old=this.row('SELECT slot FROM fast_current_outbox WHERE receipt_key=?',s.receiptKey);
  if(old)return{action:'duplicate'};
  if(c.state==='held')return{action:'hold',reason:c.hold_reason??'capacity_hold'};
  check(c.state==='ready','fast_control_review');
  const n=this.row('SELECT COUNT(*)n FROM fast_current_outbox').n,bytes=this.physicalBytes();
  if(n>=FAST_LIMITS.slots||bytes+FAST_LIMITS.generationBytes>FAST_LIMITS.spoolBytes)return{action:'hold',reason:'spool_capacity_hold'};
  const r=this.row('SELECT * FROM fast_current_reservation');
  // A real registry rollback can leave its preparation reservation alive. Only
  // a newer, currently leased claim for that EXACT receipt may supersede it.
  // This changes no registry lease and cannot take a competing receipt/epoch.
  const retry=r?.state==='reserved'&&r.epoch===this.epoch&&r.receipt_key===s.receiptKey&&r.source_attempt===s.sourceAttemptId&&integer(r.registry_claim,0)&&r.registry_claim<job.claim&&r.limit_bytes===FAST_LIMITS.generationBytes;
  if(retry)check(equalSource(this.source(job),s),'fast_retry_reservation_source');
  if(r?.state==='reserved'&&r.epoch===this.epoch&&r.registry_lease>this.core.clock()&&!retry)return{action:'hold',reason:'reservation_busy'};
  this.exec("INSERT INTO fast_current_reservation VALUES(1,?,?,?,?,?,?,'reserved')ON CONFLICT(id)DO UPDATE SET epoch=excluded.epoch,receipt_key=excluded.receipt_key,source_attempt=excluded.source_attempt,registry_claim=excluded.registry_claim,registry_lease=excluded.registry_lease,limit_bytes=excluded.limit_bytes,state='reserved'",this.epoch,s.receiptKey,s.sourceAttemptId,job.claim,job.lease_until,FAST_LIMITS.generationBytes);
  return{action:'prepare',limit:FAST_LIMITS.generationBytes};
 });}
 ticket(value){const token=Object.freeze({});this.#tickets.set(token,value);return token;}
 async prepareRegistryCapture(input){
  if(!this.active)return null;check(isOwnedFastCurrentPreparation(input,this.registry,this.ctx),'fast_registry_preparation_capability');const{job,envelope,priceSnapshot,itemIds}=input;
  if(job.operation!=='prices')return null;
  const ownedJob=clone(job),s=this.source(ownedJob);this.validateEnvelope(envelope,s);const capturedAt=envelope.capturedAt;
  const lease=this.row('SELECT claim,lease_until FROM recurring_registry_jobs WHERE receipt_key=?',s.receiptKey);check(lease?.claim===ownedJob.claim&&integer(lease.lease_until,this.core.clock()+1,this.core.clock()+FAST_LIMITS.registryLeaseMs),'fast_registry_lease');ownedJob.lease_until=lease.lease_until;
  check(priceSnapshot?.summary?.rawBodySha256===s.rawSha256&&priceSnapshot.summary.source.retrievedAt===capturedAt,'fast_snapshot_source');
  const permit=this.reserve(s,ownedJob),base={s,job:ownedJob,capturedAt,epoch:this.epoch,permit,preparedAt:this.core.clock()};
  if(permit.action!=='prepare')return this.ticket(base);
  try{
   const p=await compileFastCurrent(priceSnapshot,itemIds,{maxTotalBytes:permit.limit-FAST_LIMITS.manifestBytes});
   // The registry fence after this method remains necessary too. No body can
   // commit on an expired/changed source, feature, scope, epoch or opaque limit.
   check(equalSource(this.source(ownedJob),s),'fast_prepared_source_rebound');
   assertFastManifest(p.manifest);check(p.manifest.source.rawBodySha256===s.rawSha256&&p.manifest.source.retrievedAt===capturedAt,'fast_projection_context');
   const manifest=JSON.stringify(p.manifest),bodies=p.shardBytes.map(v=>dec.decode(v)),spool=byteLength(manifest)+bodies.reduce((n,s)=>n+byteLength(s),0);
   check(spool<=permit.limit&&hash.test(p.manifestSha256),'fast_generation_capacity');
   return this.ticket({...base,projection:{manifest,manifestSha:p.manifestSha256,bodies,descriptors:clone(p.manifest.shards),spool}});
  }catch(e){
   // Optional current derivation never makes accepted IDs/raw receipts schema-bad.
   // The existing same-owner registry preserves its own source/lease fence.
   const reason=/capacity|bound/.test(e?.message??'')?'projection_capacity_hold':'projection_review';
   return this.ticket({...base,permit:{action:'hold',reason},reservation:permit});
  }
 }
 defer(v,reason){const old=this.row('SELECT * FROM fast_current_deferred');if(!old||Date.parse(v.capturedAt)>Date.parse(old.captured_at)||v.capturedAt===old.captured_at&&v.s.sourceAttemptId>old.source_attempt)this.exec('INSERT INTO fast_current_deferred VALUES(1,?,?,?,?,?,?,?,?)ON CONFLICT(id)DO UPDATE SET receipt_key=excluded.receipt_key,job_key=excluded.job_key,source_attempt=excluded.source_attempt,request_at=excluded.request_at,raw_sha=excluded.raw_sha,captured_at=excluded.captured_at,reason=excluded.reason,operator_recorded_at=excluded.operator_recorded_at',v.s.receiptKey,v.s.jobKey,v.s.sourceAttemptId,v.s.requestAt,v.s.rawSha256,v.capturedAt,reason,this.core.clock());if(reason!=='reservation_busy')this.exec("UPDATE fast_current_control SET state='held',hold_reason=?,hold_at=? WHERE id=1",reason,this.core.clock());}
 // MUST be called by the registry's existing transactionSync, immediately before
 // registry completion. It issues NO I/O and starts NO nested transaction.
 commitRegistryCapture(token,phase){
  if(token===null)return{status:'disabled'};check(isOwnedFastCurrentCommit(phase,this.registry,this.ctx,this.core,token),'fast_registry_commit_phase');const v=this.#tickets.get(token);check(v,'fast_opaque_ticket');this.#tickets.delete(token);
  if(!this.active)return{status:'disabled'};
  const current=this.source(v.job);check(v.epoch===this.epoch&&equalSource(current,v.s),'fast_prepared_source_rebound');
  if(v.permit.action==='duplicate')return{status:'duplicate'};
  if(v.permit.action==='hold'){this.defer(v,v.permit.reason);return{status:'held',reason:v.permit.reason};}
  const r=this.row('SELECT * FROM fast_current_reservation');
  check(r?.state==='reserved'&&r.epoch===v.epoch&&r.receipt_key===v.s.receiptKey&&r.source_attempt===v.s.sourceAttemptId&&r.registry_claim===v.job.claim&&r.registry_lease===v.job.lease_until&&r.registry_lease>this.core.clock()&&r.limit_bytes===FAST_LIMITS.generationBytes&&r.limit_bytes===v.permit.limit,'fast_reservation_rebound');
  const old=this.row('SELECT slot FROM fast_current_outbox WHERE receipt_key=?',v.s.receiptKey);if(old){this.exec("UPDATE fast_current_reservation SET state='consumed' WHERE id=1");return{status:'duplicate'};}
  const c=this.control();
  if(c.latest_captured_at!==null&&(Date.parse(v.capturedAt)<Date.parse(c.latest_captured_at)||v.capturedAt===c.latest_captured_at&&v.s.sourceAttemptId<=c.latest_source_attempt)){this.exec("UPDATE fast_current_reservation SET state='consumed' WHERE id=1");return{status:'older_source_retained_in_registry'};}
  const slots=new Set(this.exec('SELECT slot FROM fast_current_outbox').toArray().map(r=>r.slot));const slot=[1,2,3].find(n=>!slots.has(n));
  if(!slot||this.physicalBytes()+v.projection.spool>FAST_LIMITS.spoolBytes){this.defer(v,'spool_capacity_hold');this.exec("UPDATE fast_current_reservation SET state='consumed' WHERE id=1");return{status:'held',reason:'spool_capacity_hold'};}
  check(v.projection.spool<=r.limit_bytes,'fast_staged_limit');
  this.exec("INSERT INTO fast_current_outbox(slot,receipt_key,job_key,source_attempt,request_at,raw_sha,captured_at,source_json,projector_version,manifest_json,manifest_sha,spool_bytes,state,prepared_at,accepted_at,replay_verified)VALUES(?,?,?,?,?,?,?,?,1,?,?,?,'pending',?,?,0)",slot,v.s.receiptKey,v.s.jobKey,v.s.sourceAttemptId,v.s.requestAt,v.s.rawSha256,v.capturedAt,JSON.stringify(v.s),v.projection.manifest,v.projection.manifestSha,v.projection.spool,v.preparedAt,this.core.clock());
  for(let i=0;i<v.projection.bodies.length;i++){const d=v.projection.descriptors[i],body=v.projection.bodies[i];check(d.index===i&&d.bytes===byteLength(body)&&hash.test(d.sha256),'fast_staged_shard');this.exec('INSERT INTO fast_current_shards VALUES(?,?,?,?,?)',slot,i,body,d.sha256,d.bytes);}
  this.exec('UPDATE fast_current_control SET latest_captured_at=?,latest_source_attempt=? WHERE id=1',v.capturedAt,v.s.sourceAttemptId);
  this.exec("UPDATE fast_current_reservation SET state='consumed' WHERE id=1");return{status:'fast_private_outbox_staged',sourceRetrievedAt:v.capturedAt,publicationAt:null,clientReceivedAt:null};
 }
 diagnostic(){if(!this.active)return{enabled:false,status:'disabled'};let c;try{c=this.control();}catch{return{enabled:true,status:'private_staging_review',remoteProjectionAvailability:'not_checked',replayVerified:false,publishedAt:null,clientReceivedAt:null};}return{enabled:true,status:c.state==='held'?'held':'private_staging_only',heldReason:c.hold_reason,outboxCount:this.row('SELECT COUNT(*)n FROM fast_current_outbox').n,spoolBytes:this.physicalBytes(),sourceRetrievedAt:c.latest_captured_at,sourceObservedAt:null,qualifiedIndividualTrades:0,publishedAt:null,clientReceivedAt:null,remoteProjectionAvailability:'not_checked',replayVerified:false,objectsDeleted:0};}
}
