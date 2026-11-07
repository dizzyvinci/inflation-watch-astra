// Unregistered private immutable-artifact writer only. No current pointer or route.
import{ApiCollectorCore}from'./api-collector-core.mjs';
import{FastCurrentRegistrySink,FAST_LIMITS}from'./api-fast-current-owner.mjs';
import{isOwnedRecurringRegistry}from'./item-recurring-registry.mjs';
import{ownedCalculationSource}from'./api-index-owner-bridge.mjs';
import{assertFastManifest,selectFastItem}from'./api-fast-current-projection.mjs';
import{sha256}from'./api-price-item-dto.mjs';
export const FAST_OBJECT_PREFIX='_private/provider-api/v1/fast-current/v1/';
export const FAST_WRITE_LIMITS=Object.freeze({slots:3,batchObjects:4,batchBytes:1048576,manifestBytes:1048576,shardBytes:262144,leaseMs:130000,waitMs:30000});
const enc=new TextEncoder(),bytes=s=>enc.encode(s).length,HASH=/^[a-f0-9]{64}$/;
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
class Review extends Error{}class Paused extends Error{}class Stale extends Error{}class Retry extends Error{}class Expired extends Error{}
const need=(v,c='fast_artifact_review')=>{if(!v)throw new Review(c)};
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
function canonical(text,max){need(typeof text==='string'&&bytes(text)>0&&bytes(text)<=max);let value;try{value=JSON.parse(text)}catch{throw new Review('fast_stored_json')};need(JSON.stringify(value)===text,'fast_noncanonical_stored_json');return value;}
const SOURCE_KEYS=['receiptKey','jobKey','operation','sourceAttemptId','requestAt','rawSha256','sourceUrl','grantReference','roundReference'];
const sameSource=(a,b)=>a&&Object.keys(a).sort().join('|')===SOURCE_KEYS.slice().sort().join('|')&&SOURCE_KEYS.every(k=>a[k]===b[k]);
const validProgress=j=>(j.first_write_at===null?j.next_index===0:integer(j.first_write_at)&&j.next_index>0&&j.first_write_at>=Date.parse(j.captured_at))&&(j.phase!=='manifest'||j.next_index>0&&j.first_write_at!==null)&&(j.state==='written'?j.phase==='manifest'&&integer(j.graph_written_at)&&j.first_write_at!==null&&j.graph_written_at>=j.first_write_at:j.graph_written_at===null);
const validJob=j=>j&&validProgress(j)&&integer(j.slot,1,3)&&['pending','running','written','review'].includes(j.state)&&['shards','manifest'].includes(j.phase)&&integer(j.next_index,0,512)&&integer(j.claim,0,Number.MAX_SAFE_INTEGER-1)&&integer(j.owner_epoch)&&integer(j.retry_at)&&integer(j.failures,0,100)&&(j.lease_until===null||integer(j.lease_until))&&integer(j.source_attempt,1)&&iso(j.captured_at)&&HASH.test(j.manifest_sha);

export class FastCurrentImmutableWriter{
 constructor(ctx,core,sink,{enabled=false,isEnabled=()=>true,waitMs=FAST_WRITE_LIMITS.waitMs}={}){
  this.enabled=enabled===true;this.initialized=false;if(!this.enabled)return;
  need(core instanceof ApiCollectorCore&&core.ctx===ctx&&sink instanceof FastCurrentRegistrySink,'fast_writer_same_owner');
  need(typeof isEnabled==='function'&&integer(waitMs,1,FAST_WRITE_LIMITS.waitMs),'fast_writer_options');
  this.ctx=ctx;this.core=core;this.sink=sink;this.isEnabled=isEnabled;this.waitMs=waitMs;this.flight=null;this.pendingAction=null;this.physical=new Map();
  if(sink.enabled!==true)return;
  need(sink.ctx===ctx&&sink.core===core&&isOwnedRecurringRegistry(sink.registry,ctx),'fast_writer_same_owner');
  if(!sink.active)return;
  this.binding=core.config();this.bucket=core.env.API_RAW_RECEIPTS;need(this.bucket&&typeof this.bucket.get==='function'&&typeof this.bucket.put==='function','fast_writer_binding');
  ctx.storage.transactionSync(()=>{
   this.exec('CREATE TABLE IF NOT EXISTS fast_current_write_owner(id INTEGER PRIMARY KEY CHECK(id=1),grant_ref TEXT NOT NULL,round_ref TEXT NOT NULL,epoch INTEGER NOT NULL DEFAULT 0)');
   this.exec('INSERT OR IGNORE INTO fast_current_write_owner(id,grant_ref,round_ref)VALUES(1,?,?)',this.binding.grantReference,this.binding.probeRound);
   const c=this.row('SELECT * FROM fast_current_write_owner');need(c.grant_ref===this.binding.grantReference&&c.round_ref===this.binding.probeRound&&integer(c.epoch,0,Number.MAX_SAFE_INTEGER-1),'fast_writer_scope_changed');this.epoch=c.epoch+1;
   this.exec('UPDATE fast_current_write_owner SET epoch=? WHERE id=1',this.epoch);
   this.exec("CREATE TABLE IF NOT EXISTS fast_current_write_jobs(slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 3),receipt_key TEXT NOT NULL UNIQUE,manifest_sha TEXT NOT NULL,source_attempt INTEGER NOT NULL,captured_at TEXT NOT NULL,phase TEXT NOT NULL DEFAULT 'shards',next_index INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'pending',owner_epoch INTEGER NOT NULL DEFAULT 0,claim INTEGER NOT NULL DEFAULT 0,lease_until INTEGER,retry_at INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,first_write_at INTEGER,graph_written_at INTEGER)");
  });this.initialized=true;
 }
 exec(q,...a){return this.core.sql.exec(q,...a)}row(q,...a){return this.core.row(q,...a)}
 get active(){if(!this.enabled||!this.initialized)return false;try{const c=this.row('SELECT * FROM fast_current_write_owner'),g=this.core.config();return this.isEnabled()===true&&this.sink.active&&g.enabled===true&&g.grantReference===this.binding.grantReference&&g.probeRound===this.binding.probeRound&&this.core.env.API_RAW_RECEIPTS===this.bucket&&c.epoch===this.epoch&&c.grant_ref===g.grantReference&&c.round_ref===g.probeRound&&!this.row('SELECT auth_stopped FROM api_control WHERE id=1').auth_stopped}catch{return false}}
 defer(){if(!this.active)return null;return this.core.clock()+30000;}
 source(stage){
  if(!this.active)throw new Paused();let current;try{current=ownedCalculationSource(this.core,{receiptKey:stage.receipt_key,jobKey:stage.job_key})}catch{if(!this.active)throw new Paused();throw new Review('fast_writer_owned_source')}
  need(current.operation==='prices'&&stage.projector_version===1&&stage.state==='pending'&&current.sourceAttemptId===stage.source_attempt&&current.requestAt===stage.request_at&&current.rawSha256===stage.raw_sha&&iso(stage.captured_at)&&Date.parse(stage.captured_at)>=stage.request_at&&Date.parse(stage.captured_at)<=this.core.clock()&&HASH.test(stage.manifest_sha),'fast_writer_source');
  const recorded=canonical(stage.source_json,4096);need(sameSource(recorded,current),'fast_writer_source');
  const r=this.row('SELECT j.state,j.operation,j.job_key,j.source_attempt,j.request_at,j.raw_sha,c.operation AS capture_operation,c.source_attempt AS capture_attempt,c.raw_sha AS capture_raw,c.request_started_at,c.captured_at FROM recurring_registry_jobs j JOIN recurring_registry_captures c ON c.receipt_key=j.receipt_key WHERE j.receipt_key=?',stage.receipt_key);
  need(r&&r.state==='complete'&&r.operation==='prices'&&r.capture_operation==='prices'&&r.job_key===stage.job_key&&r.source_attempt===current.sourceAttemptId&&r.capture_attempt===current.sourceAttemptId&&r.request_at===current.requestAt&&iso(r.request_started_at)&&Date.parse(r.request_started_at)===current.requestAt&&r.raw_sha===current.rawSha256&&r.capture_raw===current.rawSha256&&r.captured_at===stage.captured_at,'fast_writer_registry_commit');return current;
 }
 reconcile(limit=3){
  if(!this.active)return{status:'disabled',queued:0};need(integer(limit,1,3),'fast_writer_reconcile_bound');let queued=0;
  return this.ctx.storage.transactionSync(()=>{for(const s of this.exec('SELECT * FROM fast_current_outbox WHERE state=? ORDER BY source_attempt LIMIT ?','pending',limit).toArray()){
   this.source(s);const old=this.row('SELECT * FROM fast_current_write_jobs WHERE slot=?',s.slot);
   if(old){need(old.receipt_key===s.receipt_key&&old.manifest_sha===s.manifest_sha&&old.source_attempt===s.source_attempt&&old.captured_at===s.captured_at,'fast_writer_slot_rebound');if(!validJob(old))this.exec("UPDATE fast_current_write_jobs SET state='review',lease_until=NULL WHERE slot=?",old.slot);continue;}
   this.exec('INSERT INTO fast_current_write_jobs(slot,receipt_key,manifest_sha,source_attempt,captured_at)VALUES(?,?,?,?,?)',s.slot,s.receipt_key,s.manifest_sha,s.source_attempt,s.captured_at);queued++;
  }return{status:'fast_immutable_handoff',queued};});
 }
 nextDue(){if(!this.active)return null;if(this.pendingAction||this.physical.size)return this.core.clock()+30000;const rows=this.exec("SELECT * FROM fast_current_write_jobs WHERE state IN ('pending','running') ORDER BY captured_at,source_attempt LIMIT 3").toArray();if(rows.some(r=>!validJob(r)))return null;return rows.length?Math.min(...rows.map(r=>Math.max(r.retry_at,r.lease_until??0))):null;}
 claim(){return this.ctx.storage.transactionSync(()=>{
  if(!this.active)throw new Paused();const now=this.core.clock(),j=this.row("SELECT * FROM fast_current_write_jobs WHERE state IN ('pending','running') AND retry_at<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY captured_at,source_attempt LIMIT 1",now,now);if(!j)return null;
  if(!validJob(j)){this.exec("UPDATE fast_current_write_jobs SET state='review',lease_until=NULL WHERE slot=?",j.slot);return{review:true};}const claim=j.claim+1,lease=now+FAST_WRITE_LIMITS.leaseMs;
  this.exec("UPDATE fast_current_write_jobs SET state='running',owner_epoch=?,claim=?,lease_until=? WHERE slot=?",this.epoch,claim,lease,j.slot);return{...j,state:'running',owner_epoch:this.epoch,claim,lease_until:lease,cancelled:false};
 });}
 fence(j){
  if(j.cancelled)throw new Stale();if(!this.active)throw new Paused();const row=this.row('SELECT * FROM fast_current_write_jobs WHERE slot=?',j.slot);
  if(!row||row.state!=='running'||row.owner_epoch!==this.epoch||row.claim!==j.claim||row.lease_until<=this.core.clock())throw new Stale();
  need(row.receipt_key===j.receipt_key&&row.manifest_sha===j.manifest_sha&&row.source_attempt===j.source_attempt&&row.captured_at===j.captured_at,'fast_writer_job_rebound');
  const stage=this.row('SELECT * FROM fast_current_outbox WHERE slot=?',j.slot);need(stage&&stage.receipt_key===j.receipt_key&&stage.manifest_sha===j.manifest_sha&&stage.source_attempt===j.source_attempt&&stage.captured_at===j.captured_at&&(!j.manifestText||stage.manifest_json===j.manifestText),'fast_writer_stage_rebound');this.source(stage);
  if(j.artifact){const r=this.row('SELECT body,sha,bytes FROM fast_current_shards WHERE slot=? AND shard_index=?',j.slot,j.artifact.index);need(r&&r.body===j.artifact.body&&r.sha===j.artifact.sha&&r.bytes===j.artifact.bytes,'fast_writer_shard_rebound');}return stage;
 }
 async manifest(j){const s=this.fence(j);j.manifestText=s.manifest_json;const m=canonical(s.manifest_json,FAST_WRITE_LIMITS.manifestBytes);try{assertFastManifest(m)}catch{throw new Review('fast_writer_manifest_shape')}need(await sha256(enc.encode(s.manifest_json))===j.manifest_sha,'fast_writer_manifest_hash');this.fence(j);
  need(m.source.rawBodySha256===s.raw_sha&&m.source.retrievedAt===s.captured_at,'fast_writer_manifest_source');need(j.phase==='manifest'?j.next_index===m.shards.length:j.next_index<m.shards.length,'fast_writer_progress_manifest_binding');need(j.first_write_at===null||j.first_write_at<=this.core.clock(),'fast_writer_progress_clock');const count=this.row('SELECT COUNT(*)n,SUM(bytes)nbytes,SUM(length(CAST(body AS BLOB)))physical FROM fast_current_shards WHERE slot=?',j.slot);need(count.n===m.shards.length&&count.nbytes===m.totalBytes&&count.physical===count.nbytes&&count.physical+bytes(s.manifest_json)===s.spool_bytes&&s.spool_bytes<=FAST_LIMITS.generationBytes,'fast_writer_shard_count');
  const membership=this.row('SELECT c.id_count,c.set_hash,s.ids_json FROM recurring_registry_captures c JOIN recurring_registry_sets s ON s.set_hash=c.set_hash WHERE c.receipt_key=?',s.receipt_key);need(membership&&membership.id_count===m.itemCount&&membership.ids_json===JSON.stringify(m.itemIds)&&await sha256(enc.encode(membership.ids_json))===membership.set_hash,'fast_writer_registry_membership');this.fence(j);return{m,text:s.manifest_json};}
 async io(j,beforeIO,key,fn){
  this.fence(j);need(typeof beforeIO==='function','fast_writer_recovery_required');await beforeIO(this.core.clock()+this.waitMs+1000);this.fence(j);
  if(this.physical.size)throw new Retry();const p=Promise.resolve().then(()=>{this.fence(j);return fn()});this.physical.set(key,p);const done=()=>{if(this.physical.get(key)===p)this.physical.delete(key)};p.then(done,done);const result=await p;this.fence(j);return result;
 }
 async put(j,beforeIO,key,text,sha){
  const result=await this.io(j,beforeIO,'put:'+key,()=>this.bucket.put(key,text,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}}));
  if(result){need(typeof result.etag==='string'&&result.etag.length>0&&result.etag.length<=512,'fast_writer_storage_ack');return;}
  // Existing immutable key or an earlier lost acknowledgement: verify only this
  // exact known artifact. A conflict is review, never an overwrite or deletion.
  const existing=await this.io(j,beforeIO,'get:'+key,async()=>{
   const object=await this.bucket.get(key);if(!object)throw new Retry();let reader=null;const parts=[];let n=0,chunks=0;
   try{
    need(object.size===bytes(text)&&object.body?.getReader,'fast_writer_existing_artifact');reader=object.body.getReader();
    for(;;){const v=await reader.read();if(v.done)break;need(v.value instanceof Uint8Array&&++chunks<=1024,'fast_writer_existing_artifact');n+=v.value.length;need(n<=bytes(text),'fast_writer_existing_artifact');parts.push(v.value)}
    const raw=new Uint8Array(n);let at=0;for(const b of parts){raw.set(b,at);at+=b.length}return raw;
   }catch(error){if(reader)await reader.cancel().catch(()=>{});else if(object.body?.cancel)await object.body.cancel().catch(()=>{});throw error;}finally{if(reader)reader.releaseLock();}

  });need(existing.length===bytes(text)&&await sha256(existing)===sha,'fast_writer_immutable_conflict');this.fence(j);
 }
 async perform(j,beforeIO){
  const {m,text}=await this.manifest(j);
  if(j.phase==='shards'){
   need(j.next_index<=m.shards.length,'fast_writer_index_review');let index=j.next_index,count=0,total=0;
   while(index<m.shards.length&&count<FAST_WRITE_LIMITS.batchObjects){
    const d=m.shards[index];if(total+d.bytes>FAST_WRITE_LIMITS.batchBytes)break;
    this.fence(j);const row=this.row('SELECT body,sha,bytes FROM fast_current_shards WHERE slot=? AND shard_index=?',j.slot,index);need(row&&row.sha===d.sha256&&row.bytes===d.bytes&&typeof row.body==='string'&&bytes(row.body)===d.bytes,'fast_writer_shard_binding');const raw=enc.encode(row.body);
    j.artifact={index,body:row.body,sha:row.sha,bytes:row.bytes};try{await selectFastItem(m,raw,d.firstId)}catch{this.fence(j);throw new Review('fast_writer_shard_profile')}this.fence(j);
    await this.put(j,beforeIO,FAST_OBJECT_PREFIX+'shards/'+d.sha256+'.json',row.body,d.sha256);this.fence(j);
    index++;count++;total+=d.bytes;this.exec('UPDATE fast_current_write_jobs SET next_index=?,first_write_at=COALESCE(first_write_at,?),phase=? WHERE slot=? AND owner_epoch=? AND claim=?',index,this.core.clock(),index===m.shards.length?'manifest':'shards',j.slot,this.epoch,j.claim);j.artifact=null;
   }
   this.fence(j);this.exec("UPDATE fast_current_write_jobs SET state='pending',phase=?,lease_until=NULL,retry_at=0 WHERE slot=? AND owner_epoch=? AND claim=?",index===m.shards.length?'manifest':'shards',j.slot,this.epoch,j.claim);
   return{status:'fast_immutable_shards_written',objects:count,bytes:total,sourceRetrievedAt:m.source.retrievedAt};
  }
  need(j.next_index===m.shards.length,'fast_writer_incomplete_shards');await this.put(j,beforeIO,FAST_OBJECT_PREFIX+'manifests/'+j.manifest_sha+'.json',text,j.manifest_sha);this.fence(j);
  this.exec("UPDATE fast_current_write_jobs SET state='written',lease_until=NULL,retry_at=0,graph_written_at=? WHERE slot=? AND owner_epoch=? AND claim=?",this.core.clock(),j.slot,this.epoch,j.claim);
  return{status:'fast_immutable_graph_written',sourceRetrievedAt:m.source.retrievedAt,currentPointerPublished:false,remoteGraphIndependentlyVerified:false};
 }
 async drainOne(beforeIO){
  if(!this.active)return{status:'disabled'};if(this.flight)return{status:'busy'};if(this.physical.size)return{status:'physical_io_pending'};if(this.pendingAction)return{status:'underlying_action_pending'};
  let j;try{j=this.claim()}catch{return{status:'fast_writer_review'}}if(!j)return{status:'idle'};if(j.review)return{status:'fast_writer_review'};
  let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{j.cancelled=true;reject(new Expired())},this.waitMs)}),task=this.perform(j,beforeIO);this.flight=task;this.pendingAction=task;const settled=()=>{if(this.pendingAction===task)this.pendingAction=null};task.then(settled,settled);
  try{return await Promise.race([task,timeout])}catch(error){
   let row;try{row=this.row('SELECT * FROM fast_current_write_jobs WHERE slot=?',j.slot)}catch{}
   if(this.active&&row?.state==='running'&&row.owner_epoch===this.epoch&&row.claim===j.claim){
    if(error instanceof Review)this.exec("UPDATE fast_current_write_jobs SET state='review',lease_until=NULL WHERE slot=? AND owner_epoch=? AND claim=?",j.slot,this.epoch,j.claim);
    else if(!(error instanceof Paused||error instanceof Stale)){const failures=Math.min(100,row.failures+1),at=this.core.clock()+Math.min(300000,30000*2**Math.min(4,failures-1));this.exec("UPDATE fast_current_write_jobs SET state='pending',lease_until=NULL,retry_at=?,failures=? WHERE slot=? AND owner_epoch=? AND claim=?",at,failures,j.slot,this.epoch,j.claim);}
   }
   return{status:error instanceof Review?'fast_writer_review':error instanceof Paused?'disabled':error instanceof Stale?'stale':'fast_writer_retry',providerAttempted:false};
  }finally{clearTimeout(timer);if(this.flight===task)this.flight=null;}
 }
 health(){if(!this.enabled||!this.initialized)return{enabled:false,status:'disabled'};if(!this.active)return{enabled:true,status:'paused',remoteAvailability:'not_checked'};const rows=this.exec('SELECT * FROM fast_current_write_jobs ORDER BY slot LIMIT 3').toArray();if(rows.some(r=>!validJob(r)))return{enabled:true,status:'fast_writer_review',remoteAvailability:'not_checked'};return{enabled:true,status:'immutable_writer_only',staged:rows.length,written:rows.filter(r=>r.state==='written').length,review:rows.filter(r=>r.state==='review').length,physicalIoPending:this.physical.size,underlyingActionPending:!!this.pendingAction,currentPointerPublished:false,remoteGraphIndependentlyVerified:false,sourceObservedAt:null,qualifiedIndividualTrades:0,objectsDeleted:0};}
}
