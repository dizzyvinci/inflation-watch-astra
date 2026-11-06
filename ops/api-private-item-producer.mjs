// WORK-only private producer. No provider fetch, key, alarms, mux or HTTP route.
import {grantConfig} from './api-collector-core.mjs';
import {createIdentityIndex,createPriceSnapshot,InvalidProfile,sha256} from './api-price-item-dto.mjs';
export const ITEM_PRODUCER_VERSION='full-item-v1-0bd41244';
export const ITEM_PROJECTOR_SHA256='0bd41244adb111eb56d4dfe2ce2a2d4a7204c8c73f303b337af905d4a37c8b40';
export const ITEM_POINTER='_private/provider-api/v1/item-projections/v1/current.json';
const PREFIX='_private/provider-api/v1/item-projections/v1/',SOURCE='https://maplestory.market/api/prices';
const RECEIPT=/^_private\/provider-api\/v1\/receipts\/([0-9]{12,16})-prices-([a-f0-9]{64})\.json$/;
const SHA=/^[a-f0-9]{64}$/,LEASE=130000,CAP=262144,MAX_TOTAL=33554432,MAX_MANIFEST=2097152;
const enc=new TextEncoder(),size=s=>enc.encode(s).length;
class InvalidBinding extends Error{} class StorageFailure extends Error{} class Disabled extends Error{} class LostLease extends Error{}
class AuthorityPause extends Error{constructor(code){super(code);this.code=code;}} class ArtifactHold extends Error{}
const check=(ok,code)=>{if(!ok)throw new InvalidBinding(code);};
const stamp=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
const storage=async fn=>{try{return await fn();}catch{throw new StorageFailure('private_storage_unavailable');}};
const ownedSources=sources=>{check(Array.isArray(sources)&&sources.length>=1&&sources.length<=4,'reviewed_metadata_sources');return sources.map(s=>{check(s.raw instanceof Uint8Array&&s.raw.length>0&&s.raw.length<=5000000&&SHA.test(s.expectedSha256),'reviewed_metadata_bytes');return{raw:new Uint8Array(s.raw),expectedSha256:s.expectedSha256,sourceUrl:s.sourceUrl,format:s.format};});};

export class PrivateItemProducer{
 #sources;#sourceDescriptors;
 constructor(ctx,env,identitySources,{enabled=false,isEnabled=()=>true,now=Date.now}={}){
  this.ctx=ctx;this.env=env;this.enabled=enabled===true;this.sql=this.enabled?ctx.storage.sql:null;this.bucket=this.enabled?env.API_RAW_RECEIPTS:null;
  this.isEnabled=isEnabled;this.now=now;this.flight=null;
  // These are reviewed static constructor inputs, never route/query arguments.
  // Own metadata bytes and descriptors synchronously before any digest/await.
  this.#sources=this.enabled?ownedSources(identitySources??[]):[];
  this.#sourceDescriptors=this.#sources.map(({raw,...s})=>Object.freeze(s));
  if(this.enabled)this.ensureTables();
 }
 get active(){if(!this.enabled)return false;try{return this.isEnabled()===true&&grantConfig(this.env).enabled===true;}catch{return false;}}
 guard(){if(!this.active)throw new Disabled();}
 scope(){let c;try{c=grantConfig(this.env);}catch{throw new AuthorityPause('authority_context_changed');}if(c.enabled!==true)throw new AuthorityPause('authority_context_changed');return{grant:c.grantReference,round:c.probeRound};}
 syncAuthority(scope){
  this.sql.exec("UPDATE private_item_jobs SET state='paused',lease_until=NULL,last_result='authority_context_changed' WHERE state IN ('pending','running') AND (grant_ref<>? OR round_ref<>?)",scope.grant,scope.round);
  this.sql.exec("UPDATE private_item_jobs SET state='pending',lease_until=NULL WHERE state='paused' AND phase='decode' AND grant_ref=? AND round_ref=?",scope.grant,scope.round);
  const rows=this.sql.exec("SELECT receipt_key,manifest FROM private_item_jobs WHERE state='paused' AND phase<>'decode' AND grant_ref=? AND round_ref=?",scope.grant,scope.round).toArray();
  for(const row of rows){let m;try{m=JSON.parse(row.manifest);}catch{continue;}if(m.producerVersion===ITEM_PRODUCER_VERSION&&m.projectorSha256===ITEM_PROJECTOR_SHA256&&JSON.stringify(m.metadata)===JSON.stringify(this.#sourceDescriptors))this.sql.exec("UPDATE private_item_jobs SET state='pending',lease_until=NULL WHERE receipt_key=? AND state='paused'",row.receipt_key);}
 }
 row(q,...a){return this.sql.exec(q,...a).toArray()[0];}
 ensureTables(){this.ctx.storage.transactionSync(()=>{
  this.sql.exec(`CREATE TABLE IF NOT EXISTS private_item_jobs(receipt_key TEXT PRIMARY KEY,job_key TEXT NOT NULL,source_attempt INTEGER NOT NULL,request_at INTEGER NOT NULL,grant_ref TEXT NOT NULL,round_ref TEXT NOT NULL,raw_sha TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',phase TEXT NOT NULL DEFAULT 'decode',available_at INTEGER NOT NULL,lease_until INTEGER,claim INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,generation TEXT,manifest TEXT,manifest_sha TEXT,pointer_body TEXT,last_result TEXT)`);
  this.sql.exec('CREATE INDEX IF NOT EXISTS private_item_ready ON private_item_jobs(state,available_at,source_attempt)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS private_item_rejections(receipt_key TEXT PRIMARY KEY,reason TEXT NOT NULL)');
  this.sql.exec(`CREATE TABLE IF NOT EXISTS private_item_shards(receipt_key TEXT NOT NULL,ordinal INTEGER NOT NULL,body TEXT NOT NULL,body_sha TEXT NOT NULL,object_key TEXT NOT NULL,written INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(receipt_key,ordinal))`);
 });}
 owned(job){const s=this.scope();const r=this.row(`SELECT j.job_key,j.operation,j.state,j.round_ref,j.receipt_key,a.id,a.at,a.result,a.grant_ref FROM api_jobs j JOIN api_attempts a ON a.job_key=j.job_key AND a.id=? WHERE j.job_key=?`,job.source_attempt,job.job_key);
  return !!r&&r.state==='complete'&&r.operation==='prices'&&r.receipt_key===job.receipt_key&&r.result==='success'&&r.grant_ref===s.grant&&r.round_ref===s.round&&r.at===job.request_at&&job.grant_ref===s.grant&&job.round_ref===s.round;
 }
 reconcile(limit=8){if(!this.active)return{status:'disabled',queued:0};check(Number.isSafeInteger(limit)&&limit>=1&&limit<=8,'bounded_reconcile');const scope=this.scope();
  return this.ctx.storage.transactionSync(()=>{this.syncAuthority(scope);
   const candidates=this.sql.exec(`SELECT j.job_key,j.receipt_key,j.round_ref FROM api_jobs j LEFT JOIN private_item_jobs p ON p.receipt_key=j.receipt_key LEFT JOIN private_item_rejections x ON x.receipt_key=j.receipt_key WHERE j.operation='prices' AND j.state='complete' AND j.round_ref=? AND j.receipt_key IS NOT NULL AND p.receipt_key IS NULL AND x.receipt_key IS NULL ORDER BY j.job_key LIMIT ?`,scope.round,limit).toArray();let queued=0,rejected=0;
   for(const c of candidates){const m=RECEIPT.exec(c.receipt_key),id=m?Number(m[1]):NaN;if(!Number.isSafeInteger(id)||id<1){this.sql.exec('INSERT OR IGNORE INTO private_item_rejections VALUES(?,?)',c.receipt_key,'invalid_owned_receipt_key');rejected++;continue;}
    const a=this.row('SELECT * FROM api_attempts WHERE id=? AND job_key=? AND result=? AND grant_ref=?',id,c.job_key,'success',scope.grant);
    if(!a){this.sql.exec('INSERT OR IGNORE INTO private_item_rejections VALUES(?,?)',c.receipt_key,'missing_successful_owner_attempt');rejected++;continue;}
    this.sql.exec('INSERT OR IGNORE INTO private_item_jobs(receipt_key,job_key,source_attempt,request_at,grant_ref,round_ref,raw_sha,available_at) VALUES(?,?,?,?,?,?,?,?)',c.receipt_key,c.job_key,id,a.at,scope.grant,scope.round,m[2],this.now());queued++;
   }return{status:'reconciled',queued,rejected};
  });
 }
 nextDue(){if(!this.active)return null;this.ctx.storage.transactionSync(()=>this.syncAuthority(this.scope()));
  if(this.row("SELECT 1 FROM private_item_jobs WHERE state IN ('paused','review') AND phase<>'decode' LIMIT 1"))return null;
  const running=this.row("SELECT MIN(lease_until) AS at FROM private_item_jobs WHERE state='running'").at;if(running!==null)return running;
  const staged=this.row("SELECT MIN(available_at) AS at FROM private_item_jobs WHERE state='pending' AND phase<>'decode'").at;if(staged!==null)return staged;
  return this.row("SELECT MIN(available_at) AS at FROM private_item_jobs WHERE state='pending'").at;
 }
 health(){if(!this.active)return{status:'disabled'};return{status:'private_only',producerVersion:ITEM_PRODUCER_VERSION,publicationEligible:false,sourceObservedAt:null,qualifiedIndividualTrades:0,nextPrivateDue:this.nextDue(),jobs:this.sql.exec('SELECT state,COUNT(*) AS count FROM private_item_jobs GROUP BY state').toArray(),stagedShards:this.row('SELECT COUNT(*) AS n FROM private_item_shards').n};}
 fence(job){this.guard();const scope=this.scope();if(job.grant_ref!==scope.grant||job.round_ref!==scope.round)throw new AuthorityPause('authority_context_changed');const current=this.row('SELECT state,claim,lease_until FROM private_item_jobs WHERE receipt_key=?',job.receipt_key);if(current?.state!=='running'||current.claim!==job.claim||current.lease_until<=this.now())throw new LostLease();}
 claim(){const now=this.now();return this.ctx.storage.transactionSync(()=>{this.syncAuthority(this.scope());
  this.sql.exec("UPDATE private_item_jobs SET state='pending',lease_until=NULL,last_result='interrupted' WHERE state='running' AND lease_until<=?",now);
  if(this.row("SELECT 1 FROM private_item_jobs WHERE state='running' LIMIT 1"))return null;
  if(this.row("SELECT 1 FROM private_item_jobs WHERE state IN ('paused','review') AND phase<>'decode' LIMIT 1"))return null;
  // Only one unfinished staged generation at once. Storage backoff cannot let
  // every new prices receipt add another 8+ MiB staged tree or spin on raw work.
  let r=this.row("SELECT * FROM private_item_jobs WHERE state='pending' AND phase<>'decode' ORDER BY source_attempt DESC LIMIT 1");
  if(r&&r.available_at>now)return null;
  r??=this.row("SELECT * FROM private_item_jobs WHERE state='pending' AND available_at<=? ORDER BY source_attempt DESC,receipt_key LIMIT 1",now);if(!r)return null;
  this.sql.exec("UPDATE private_item_jobs SET state='running',claim=claim+1,lease_until=? WHERE receipt_key=?",now+LEASE,r.receipt_key);return{...r,claim:r.claim+1};
 });}
 async drainOne(beforeIO){if(!this.active)return{status:'disabled'};if(this.flight)return{status:'busy'};if(typeof beforeIO!=='function')throw new TypeError('durable_recovery_callback_required');this.flight=this.perform(beforeIO);try{return await this.flight;}finally{this.flight=null;}}
 async perform(beforeIO){const job=this.claim();if(!job)return{status:'idle'};
  try{await beforeIO(this.now()+LEASE);this.fence(job);
   if(job.phase==='decode')return await this.decode(job);
   if(job.phase==='shards')return await this.writeShard(job);
   if(job.phase==='manifest')return await this.writeManifest(job);
   if(job.phase==='pointer')return await this.writePointer(job);
   throw new InvalidBinding('unknown_private_phase');
  }catch(error){return this.ctx.storage.transactionSync(()=>{
   const current=this.row('SELECT state,claim FROM private_item_jobs WHERE receipt_key=?',job.receipt_key);
   if(current?.state!=='running'||current.claim!==job.claim)return{status:'stale_private_claim',providerAttempted:false};
   if(error instanceof Disabled||error instanceof LostLease){this.sql.exec("UPDATE private_item_jobs SET state='pending',lease_until=NULL WHERE receipt_key=? AND claim=?",job.receipt_key,job.claim);return{status:error instanceof Disabled?'disabled':'expired_private_claim',providerAttempted:false};}
   if(error instanceof AuthorityPause){this.sql.exec("UPDATE private_item_jobs SET state='paused',lease_until=NULL,last_result=? WHERE receipt_key=? AND claim=?",error.code,job.receipt_key,job.claim);return{status:'authority_paused',providerAttempted:false};}
   if(error instanceof ArtifactHold){this.sql.exec("UPDATE private_item_jobs SET state='review',lease_until=NULL,last_result='private_artifact_review' WHERE receipt_key=? AND claim=?",job.receipt_key,job.claim);return{status:'private_artifact_review',providerAttempted:false};}
   const quarantine=error instanceof InvalidProfile||error instanceof InvalidBinding;
   const resultCode=quarantine?'profile_quarantine':error instanceof StorageFailure?'private_storage_retry':'private_internal_retry';
   const wait=this.now()+Math.min(300000,30000*2**Math.min(job.failures,4));
   this.sql.exec('UPDATE private_item_jobs SET state=?,lease_until=NULL,available_at=?,failures=failures+1,last_result=? WHERE receipt_key=? AND claim=?',quarantine?'quarantined':'pending',wait,resultCode,job.receipt_key,job.claim);
   if(quarantine){this.sql.exec('DELETE FROM private_item_shards WHERE receipt_key=?',job.receipt_key);this.sql.exec('UPDATE private_item_jobs SET manifest=NULL,pointer_body=NULL WHERE receipt_key=?',job.receipt_key);}
   return{status:resultCode,retryAt:quarantine?null:wait,providerAttempted:false};
  });}
 }
 finishPhase(job,phase){this.fence(job);this.sql.exec("UPDATE private_item_jobs SET state='pending',phase=?,lease_until=NULL,available_at=?,failures=0,last_result='phase_committed' WHERE receipt_key=? AND claim=?",phase,this.now(),job.receipt_key,job.claim);}
 envelope(raw,job){
  check(raw&&typeof raw==='object','invalid_envelope');
  // Only own needed primitives; unused lossy payload never enters the projector.
  const e={};for(const k of ['kind','operation','sourceUrl','httpStatus','attemptId','grantReference','roundReference','requestStartedAt','capturedAt','captureTimeKind','sourceObservedAt','observationTimestampKnown','schemaVerified','publicationEligible','rawBodyEncoding','rawBodyBase64','responseSha256','responseBytes'])e[k]=raw[k];
  check(e.kind==='unverified_provider_api_receipt'&&e.operation==='prices'&&e.sourceUrl===SOURCE&&e.httpStatus===200&&e.attemptId===job.source_attempt&&e.grantReference===job.grant_ref&&e.roundReference===job.round_ref,'raw_attempt_identity');
  check(stamp(e.requestStartedAt)&&Date.parse(e.requestStartedAt)===job.request_at&&stamp(e.capturedAt)&&Date.parse(e.capturedAt)>=job.request_at&&Date.parse(e.capturedAt)<=this.now(),'raw_original_clocks');
  check(e.captureTimeKind==='http_response_completed'&&e.sourceObservedAt===null&&e.observationTimestampKnown===false&&e.schemaVerified===false&&e.publicationEligible===false,'raw_evidence_context');
  check(e.responseSha256===job.raw_sha&&SHA.test(e.responseSha256)&&Number.isSafeInteger(e.responseBytes)&&e.responseBytes>0&&e.responseBytes<=5000000&&e.rawBodyEncoding==='base64'&&typeof e.rawBodyBase64==='string'&&e.rawBodyBase64.length<=6666668&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e.rawBodyBase64),'raw_byte_envelope');
  let rawBytes;try{rawBytes=Uint8Array.from(atob(e.rawBodyBase64),c=>c.charCodeAt(0));}catch{throw new InvalidBinding('raw_base64');}check(rawBytes.byteLength===e.responseBytes,'raw_byte_count');return{e,rawBytes};
 }
 async decode(job){check(this.owned(job),'source_job_attempt_changed');
  const object=await storage(()=>this.bucket.get(job.receipt_key));this.fence(job);if(!object)throw new StorageFailure();check(object.size<=40000000,'raw_envelope_bound');
  const text=await storage(()=>object.text());this.fence(job);check(size(text)<=40000000,'raw_envelope_bound');let parsed;try{parsed=JSON.parse(text);}catch{throw new InvalidBinding('raw_envelope_json');}
  const {e,rawBytes}=this.envelope(parsed,job);parsed=null;
  const identities=await createIdentityIndex(this.#sources),snapshot=await createPriceSnapshot(rawBytes,{expectedSha256:job.raw_sha,identities,context:{operation:'prices',sourceUrl:SOURCE,capturedAt:e.capturedAt,sourceObservedAt:null,captureTimeKind:e.captureTimeKind}});this.fence(job);
  // JSON.parse is used ONLY to enumerate safe item IDs; all numeric evidence is
  // independently decoded/validated losslessly by the closed projector above.
  const ids=JSON.parse(new TextDecoder().decode(rawBytes)).map(r=>r.item_id).sort((a,b)=>a-b);check(ids.length===snapshot.summary.itemCount,'snapshot_enumeration');
  const metadata=this.#sourceDescriptors.map(s=>({...s}));
  const generation=await sha256(enc.encode(JSON.stringify({producerVersion:ITEM_PRODUCER_VERSION,projectorSha256:ITEM_PROJECTOR_SHA256,metadata,rawBodySha256:job.raw_sha,capturedAt:e.capturedAt,sourceAttemptId:job.source_attempt,requestStartedAt:e.requestStartedAt})));
  const prefix=PREFIX+generation+'/',shards=[],items=[];let members=[],bytes=12,total=0;
  const emit=()=>{if(!members.length)return;shards.push({ordinal:shards.length,body:'{"items":['+members.join(',')+']}',key:prefix+'shard-'+shards.length+'.json'});members=[];bytes=12;};
  for(const id of ids){const dto=snapshot.getItem(id);check(dto!==null,'snapshot_item');const body=JSON.stringify(dto),n=size(body);check(n<=CAP,'private_item_bound');total+=n;check(total<=MAX_TOTAL,'private_generation_bound');if(members.length&&(bytes+n+1>CAP||members.length===64))emit();
   items.push({itemId:id,shard:shards.length,bodySha256:await sha256(enc.encode(body)),bytes:n});members.push(body);bytes+=n+(members.length>1?1:0);
  }emit();check(shards.length<=512,'private_shard_count');
  for(const s of shards){check(size(s.body)<=CAP,'private_shard_bound');s.sha=await sha256(enc.encode(s.body));}
  const manifest={schemaVersion:1,kind:'private_api_item_manifest',producerVersion:ITEM_PRODUCER_VERSION,projectorSha256:ITEM_PROJECTOR_SHA256,generation,sourceAttemptId:job.source_attempt,rawReceiptKey:job.receipt_key,rawBodySha256:job.raw_sha,requestStartedAt:e.requestStartedAt,capturedAt:e.capturedAt,sourceObservedAt:null,publicationEligible:false,metadata,itemCount:ids.length,totalItemBytes:total,shards:shards.map(s=>({ordinal:s.ordinal,key:s.key,sha256:s.sha,bytes:size(s.body)})),items};
  const manifestBody=JSON.stringify(manifest);check(size(manifestBody)<=MAX_MANIFEST,'private_manifest_bound');const manifestSha=await sha256(enc.encode(manifestBody));
  const pointerBody=JSON.stringify({schemaVersion:1,kind:'private_api_item_pointer',producerVersion:ITEM_PRODUCER_VERSION,generation,sourceAttemptId:job.source_attempt,manifestKey:prefix+'manifest.json',manifestSha256:manifestSha,manifestBytes:size(manifestBody),itemCount:ids.length,rawBodySha256:job.raw_sha,capturedAt:e.capturedAt,sourceObservedAt:null,publicationEligible:false});
  this.ctx.storage.transactionSync(()=>{this.fence(job);check(this.owned(job),'source_job_attempt_changed');
   for(const s of shards)this.sql.exec('INSERT INTO private_item_shards(receipt_key,ordinal,body,body_sha,object_key) VALUES(?,?,?,?,?)',job.receipt_key,s.ordinal,s.body,s.sha,s.key);
   this.sql.exec('UPDATE private_item_jobs SET generation=?,manifest=?,manifest_sha=?,pointer_body=? WHERE receipt_key=? AND claim=?',generation,manifestBody,manifestSha,pointerBody,job.receipt_key,job.claim);this.finishPhase(job,'shards');
  });return{status:'private_staged',items:ids.length,shards:shards.length,providerAttempted:false};
 }
 artifact(ok){if(!ok)throw new ArtifactHold();}
 async immutable(job,key,body,expectedSha){this.fence(job);this.artifact(key.startsWith(PREFIX+job.generation+'/'));const old=await storage(()=>this.bucket.get(key));this.fence(job);
  if(old){this.artifact(old.size<=Math.max(CAP,MAX_MANIFEST));const text=await storage(()=>old.text());this.fence(job);this.artifact(text===body&&await sha256(enc.encode(text))===expectedSha);return;}
  const written=await storage(()=>this.bucket.put(key,body,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}}));this.fence(job);if(!written)throw new StorageFailure();
 }
 async writeShard(job){await this.stagedPointer(job);const m=JSON.parse(job.manifest),s=this.row('SELECT * FROM private_item_shards WHERE receipt_key=? AND written=0 ORDER BY ordinal LIMIT 1',job.receipt_key);this.artifact(s&&Number.isSafeInteger(s.ordinal)&&s.ordinal>=0);const d=m.shards[s.ordinal];
  this.artifact(d&&d.ordinal===s.ordinal&&d.key===PREFIX+job.generation+'/shard-'+s.ordinal+'.json'&&s.object_key===d.key&&d.sha256===s.body_sha&&d.bytes===size(s.body)&&size(s.body)<=CAP&&await sha256(enc.encode(s.body))===s.body_sha);
  await this.immutable(job,s.object_key,s.body,s.body_sha);this.ctx.storage.transactionSync(()=>{this.fence(job);this.sql.exec('UPDATE private_item_shards SET written=1 WHERE receipt_key=? AND ordinal=?',job.receipt_key,s.ordinal);const remaining=this.row('SELECT COUNT(*) AS n FROM private_item_shards WHERE receipt_key=? AND written=0',job.receipt_key).n;this.finishPhase(job,remaining?'shards':'manifest');});return{status:'private_shard_written',providerAttempted:false};
 }
 async stagedPointer(job){this.artifact(typeof job.manifest==='string'&&size(job.manifest)<=MAX_MANIFEST&&await sha256(enc.encode(job.manifest))===job.manifest_sha);let m;try{m=JSON.parse(job.manifest);}catch{throw new ArtifactHold();}
  this.artifact(m&&typeof m==='object'&&typeof m.producerVersion==='string'&&SHA.test(m.projectorSha256)&&Array.isArray(m.metadata));
  if(m.producerVersion!==ITEM_PRODUCER_VERSION||m.projectorSha256!==ITEM_PROJECTOR_SHA256||JSON.stringify(m.metadata)!==JSON.stringify(this.#sourceDescriptors))throw new AuthorityPause('metadata_context_changed');
  this.artifact(m.schemaVersion===1&&m.kind==='private_api_item_manifest'&&m.generation===job.generation&&m.sourceAttemptId===job.source_attempt&&m.rawReceiptKey===job.receipt_key&&m.rawBodySha256===job.raw_sha&&m.requestStartedAt===new Date(job.request_at).toISOString()&&stamp(m.capturedAt)&&Date.parse(m.capturedAt)>=job.request_at&&m.sourceObservedAt===null&&m.publicationEligible===false&&Number.isSafeInteger(m.itemCount)&&m.itemCount>0&&m.itemCount<=20000&&Array.isArray(m.shards)&&m.shards.length>0&&m.shards.length<=512);
  this.artifact(m.shards.every((d,i)=>d&&d.ordinal===i&&d.key===PREFIX+job.generation+'/shard-'+i+'.json'&&SHA.test(d.sha256)&&Number.isSafeInteger(d.bytes)&&d.bytes>0&&d.bytes<=CAP));
  const counts=new Map();let lastId=0,total=0;
  this.artifact(Array.isArray(m.items)&&m.items.length===m.itemCount&&m.items.every(d=>{if(!d||!Number.isSafeInteger(d.itemId)||d.itemId<=lastId||d.itemId>999999999||!Number.isSafeInteger(d.shard)||d.shard<0||d.shard>=m.shards.length||!SHA.test(d.bodySha256)||!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>CAP)return false;lastId=d.itemId;total+=d.bytes;counts.set(d.shard,(counts.get(d.shard)??0)+1);return true;})&&total===m.totalItemBytes&&total<=MAX_TOTAL&&m.shards.every((_,i)=>(counts.get(i)??0)>0&&counts.get(i)<=64));
  const p={schemaVersion:1,kind:'private_api_item_pointer',producerVersion:ITEM_PRODUCER_VERSION,generation:job.generation,sourceAttemptId:job.source_attempt,manifestKey:PREFIX+job.generation+'/manifest.json',manifestSha256:job.manifest_sha,manifestBytes:size(job.manifest),itemCount:m.itemCount,rawBodySha256:job.raw_sha,capturedAt:m.capturedAt,sourceObservedAt:null,publicationEligible:false};this.artifact(JSON.stringify(p)===job.pointer_body);return p;
 }
 async writeManifest(job){const p=await this.stagedPointer(job),m=JSON.parse(job.manifest),rows=this.sql.exec('SELECT ordinal,body_sha,object_key,written FROM private_item_shards WHERE receipt_key=? ORDER BY ordinal',job.receipt_key).toArray();this.artifact(rows.length===m.shards.length&&rows.every((r,i)=>r.ordinal===i&&r.written===1&&r.object_key===m.shards[i].key&&r.object_key===PREFIX+job.generation+'/shard-'+i+'.json'&&r.body_sha===m.shards[i].sha256));await this.immutable(job,p.manifestKey,job.manifest,job.manifest_sha);this.ctx.storage.transactionSync(()=>this.finishPhase(job,'pointer'));return{status:'private_manifest_written',providerAttempted:false};}
 priorPointer(text){let p;try{p=JSON.parse(text);}catch{throw new ArtifactHold();}
  const keys=['schemaVersion','kind','producerVersion','generation','sourceAttemptId','manifestKey','manifestSha256','manifestBytes','itemCount','rawBodySha256','capturedAt','sourceObservedAt','publicationEligible'];
  this.artifact(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).sort().join(',')===keys.sort().join(',')&&p.schemaVersion===1&&p.kind==='private_api_item_pointer'&&p.producerVersion===ITEM_PRODUCER_VERSION&&SHA.test(p.generation)&&Number.isSafeInteger(p.sourceAttemptId)&&p.sourceAttemptId>0&&p.manifestKey===PREFIX+p.generation+'/manifest.json'&&SHA.test(p.manifestSha256)&&Number.isSafeInteger(p.manifestBytes)&&p.manifestBytes>0&&p.manifestBytes<=MAX_MANIFEST&&Number.isSafeInteger(p.itemCount)&&p.itemCount>0&&p.itemCount<=20000&&SHA.test(p.rawBodySha256)&&stamp(p.capturedAt)&&Date.parse(p.capturedAt)<=this.now()&&p.sourceObservedAt===null&&p.publicationEligible===false);
  const owned=this.row('SELECT pointer_body,state,phase FROM private_item_jobs WHERE source_attempt=? AND generation=?',p.sourceAttemptId,p.generation);this.artifact(owned?.pointer_body===text&&(owned.phase==='pointer'||owned.phase==='done'&&['complete','superseded'].includes(owned.state)));return p;
 }
 async writePointer(job){const body=job.pointer_body;this.artifact(typeof body==='string'&&size(body)<=4096);await this.stagedPointer(job);this.fence(job);
  const old=await storage(()=>this.bucket.get(ITEM_POINTER));this.fence(job);let prior=null;
  if(old){this.artifact(old.size<=4096);const text=await storage(()=>old.text());this.fence(job);prior=this.priorPointer(text);
   if(prior.sourceAttemptId>job.source_attempt){this.complete(job,'superseded');return{status:'private_superseded',providerAttempted:false};}
   if(prior.sourceAttemptId===job.source_attempt){this.artifact(text===body);this.complete(job,'complete');return{status:'private_complete',providerAttempted:false};}
  }
  const written=await storage(()=>this.bucket.put(ITEM_POINTER,body,{onlyIf:old?{etagMatches:old.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}}));this.fence(job);if(!written)throw new StorageFailure();this.complete(job,'complete');return{status:'private_complete',providerAttempted:false};
 }
 complete(job,state){this.ctx.storage.transactionSync(()=>{this.fence(job);this.sql.exec("UPDATE private_item_jobs SET state=?,phase='done',lease_until=NULL,last_result=? WHERE receipt_key=? AND claim=?",state,state,job.receipt_key,job.claim);
  // Retain only two terminal staged generations; pending/running bodies are never
  // evicted. Completed receipts remain tombstoned so reconcile cannot re-decode.
  const old=this.sql.exec("SELECT receipt_key FROM private_item_jobs WHERE state IN ('complete','superseded') ORDER BY source_attempt DESC LIMIT -1 OFFSET 2").toArray();
  for(const r of old){this.sql.exec('DELETE FROM private_item_shards WHERE receipt_key=?',r.receipt_key);this.sql.exec('UPDATE private_item_jobs SET manifest=NULL,pointer_body=NULL WHERE receipt_key=?',r.receipt_key);}
 });}
}
