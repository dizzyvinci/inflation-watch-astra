// Default-Off hidden same-owner staging. No provider, transport or registration.
import {FastCurrentRegistrySink,FAST_LIMITS} from './api-fast-current-owner.mjs';
import {isOwnedFastCurrentPreparation,isOwnedFastCurrentCommit} from './item-recurring-registry.mjs';
import {streamFastCurrent} from './api-fast-current-incremental.mjs';
import {assertFastManifest} from './api-fast-current-projection.mjs';
import {sha256} from './api-price-item-dto.mjs';
import {ownedCalculationSource} from './api-index-owner-bridge.mjs';
const memories=new WeakMap(),enc=new TextEncoder(),H=/^[a-f0-9]{64}$/;
const need=(v,c='fast_stage_review')=>{if(!v)throw Error(c);},num=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const length=s=>enc.encode(s).length,same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export class IncrementalFastCurrentRegistrySink extends FastCurrentRegistrySink{
 #streamTickets=new WeakMap();
 #finalTickets=new WeakMap();
 constructor(ctx,core,registry,{enabled=false,isEnabled=()=>true,waitMs=30000}={}){
  if(enabled===true)need(num(waitMs,1,30000)&&typeof isEnabled==='function','fast_stage_options');
  super(ctx,core,registry,{enabled,isEnabled});if(enabled!==true||this.scope?.enabled!==true)return;
  this.waitMs=waitMs;this.memory=memories.get(ctx)??{pending:null};memories.set(ctx,this.memory);
  this.exec("CREATE TABLE IF NOT EXISTS fast_current_staging(slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 3),receipt_key TEXT NOT NULL UNIQUE,source_json TEXT NOT NULL,captured_at TEXT NOT NULL,membership_sha TEXT NOT NULL,metadata_json TEXT NOT NULL,owner_epoch INTEGER NOT NULL,registry_claim INTEGER NOT NULL,registry_lease INTEGER NOT NULL,prepared_at INTEGER NOT NULL,state TEXT NOT NULL,manifest_sha TEXT,manifest_bytes INTEGER,shard_count INTEGER,staged_bytes INTEGER NOT NULL DEFAULT 0)");
  this.exec('CREATE TABLE IF NOT EXISTS fast_current_stage_checkpoints(slot INTEGER NOT NULL,shard_index INTEGER NOT NULL CHECK(shard_index BETWEEN 0 AND 511),descriptor_json TEXT NOT NULL,PRIMARY KEY(slot,shard_index))');
 }
 beforeRawRegistryCapture(job){if(!this.enabled||!this.active)return;this.source(job);need(!this.row('SELECT auth_stopped FROM api_control WHERE id=1').auth_stopped,'fast_stage_auth_paused');need(!this.memory.pending,'fast_stage_underlying_pending');}
 stageFence(v){need(!v.cancelled&&performance.now()<v.deadline,'fast_stage_deadline');need(!this.row('SELECT auth_stopped FROM api_control WHERE id=1').auth_stopped,'fast_stage_auth_paused');need(same(this.source(v.job),v.source),'fast_stage_source_rebound');const r=this.row('SELECT * FROM fast_current_staging WHERE slot=?',v.slot);need(r&&r.receipt_key===v.source.receiptKey&&r.source_json===v.sourceJson&&r.captured_at===v.capturedAt&&r.membership_sha===v.membershipSha&&r.metadata_json===v.metadataJson&&r.owner_epoch===this.epoch&&r.registry_claim===v.job.claim&&r.registry_lease===v.job.lease_until&&num(r.staged_bytes,0,FAST_LIMITS.generationBytes)&&['building','ready'].includes(r.state),'fast_stage_claim_rebound');return r;}
 reserveStage(v){return this.ctx.storage.transactionSync(()=>{
  need(same(this.source(v.job),v.source),'fast_stage_source_rebound');const c=this.control(),done=this.row('SELECT slot FROM fast_current_outbox WHERE receipt_key=?',v.source.receiptKey);if(done)return{action:'duplicate'};
  if(c.state==='held')return{action:'hold',reason:c.hold_reason};need(c.state==='ready');
  const rows=this.exec('SELECT slot,receipt_key,source_json,captured_at,membership_sha,metadata_json,owner_epoch,registry_claim,state,prepared_at FROM fast_current_staging ORDER BY slot LIMIT 4').toArray();need(rows.length<=3);
  const old=rows.find(r=>r.receipt_key===v.source.receiptKey),reservation=this.row('SELECT * FROM fast_current_reservation');
  if(reservation)need(num(reservation.epoch,1,this.epoch)&&num(reservation.registry_claim,1)&&num(reservation.registry_lease)&&reservation.limit_bytes===FAST_LIMITS.generationBytes&&['reserved','consumed'].includes(reservation.state),'fast_stage_reservation_review');
  if(reservation?.state==='reserved'&&reservation.epoch===this.epoch&&reservation.registry_lease>this.core.clock()&&(reservation.receipt_key!==v.source.receiptKey||reservation.source_attempt!==v.source.sourceAttemptId||reservation.registry_claim>v.job.claim))throw Error('fast_stage_reservation_pending');
  if(old){need(old.source_json===v.sourceJson&&old.captured_at===v.capturedAt&&old.membership_sha===v.membershipSha&&old.metadata_json===v.metadataJson&&['building','ready'].includes(old.state)&&num(old.owner_epoch,1,this.epoch)&&num(old.registry_claim,1,v.job.claim)&&num(old.prepared_at,0,this.core.clock()),'fast_stage_resume_review');v.slot=old.slot;v.preparedAt=old.prepared_at;}
  else{const slots=new Set([...rows.map(r=>r.slot),...this.exec('SELECT slot FROM fast_current_outbox LIMIT 4').toArray().map(r=>r.slot)]);v.slot=[1,2,3].find(n=>!slots.has(n));if(!v.slot||this.physicalBytes()+FAST_LIMITS.generationBytes>FAST_LIMITS.spoolBytes)return{action:'hold',reason:'spool_capacity_hold'};
   this.exec("INSERT INTO fast_current_staging(slot,receipt_key,source_json,captured_at,membership_sha,metadata_json,owner_epoch,registry_claim,registry_lease,prepared_at,state)VALUES(?,?,?,?,?,?,?,?,?,?,'building')",v.slot,v.source.receiptKey,v.sourceJson,v.capturedAt,v.membershipSha,v.metadataJson,this.epoch,v.job.claim,v.job.lease_until,v.preparedAt);}
  this.exec('UPDATE fast_current_staging SET owner_epoch=?,registry_claim=?,registry_lease=? WHERE slot=?',this.epoch,v.job.claim,v.job.lease_until,v.slot);
  this.exec("INSERT INTO fast_current_reservation VALUES(1,?,?,?,?,?,?,'reserved')ON CONFLICT(id)DO UPDATE SET epoch=excluded.epoch,receipt_key=excluded.receipt_key,source_attempt=excluded.source_attempt,registry_claim=excluded.registry_claim,registry_lease=excluded.registry_lease,limit_bytes=excluded.limit_bytes,state='reserved'",this.epoch,v.source.receiptKey,v.source.sourceAttemptId,v.job.claim,v.job.lease_until,FAST_LIMITS.generationBytes);
  return{action:'prepare'};
 });}
 emit(v,{descriptor,body}){this.stageFence(v);need(length(body)===descriptor.bytes&&descriptor.bytes<=262144&&num(descriptor.index,0,511)&&H.test(descriptor.sha256));return this.ctx.storage.transactionSync(()=>{
  this.stageFence(v);const row=this.row('SELECT * FROM fast_current_shards WHERE slot=? AND shard_index=?',v.slot,descriptor.index),checkpoint=this.row('SELECT descriptor_json FROM fast_current_stage_checkpoints WHERE slot=? AND shard_index=?',v.slot,descriptor.index),text=JSON.stringify(descriptor);
  if(row||checkpoint){need(row&&checkpoint&&row.body===body&&row.sha===descriptor.sha256&&row.bytes===descriptor.bytes&&checkpoint.descriptor_json===text,'fast_stage_existing_shard_review');return;}
  const n=this.row('SELECT COUNT(*)n FROM fast_current_shards WHERE slot=?',v.slot).n,stage=this.stageFence(v);need(n===descriptor.index&&stage.staged_bytes+descriptor.bytes<=FAST_LIMITS.generationBytes-FAST_LIMITS.manifestBytes&&this.physicalBytes()+descriptor.bytes<=FAST_LIMITS.spoolBytes,'fast_stage_capacity_hold');
  this.exec('INSERT INTO fast_current_shards VALUES(?,?,?,?,?)',v.slot,descriptor.index,body,descriptor.sha256,descriptor.bytes);this.exec('INSERT INTO fast_current_stage_checkpoints VALUES(?,?,?)',v.slot,descriptor.index,text);this.exec('UPDATE fast_current_staging SET staged_bytes=staged_bytes+? WHERE slot=?',descriptor.bytes,v.slot);
 });}
 async prepareRegistryCapture(input){
  if(!this.active)return null;need(isOwnedFastCurrentPreparation(input,this.registry,this.ctx),'fast_registry_preparation_capability');if(input.job.operation!=='prices')return null;
  need(!this.memory.pending,'fast_stage_underlying_pending');const job={...input.job},source=this.source(job);this.validateEnvelope(input.envelope,source);need(input.priceSnapshot?.summary?.rawBodySha256===source.rawSha256&&input.priceSnapshot.summary.source.retrievedAt===input.envelope.capturedAt,'fast_stage_snapshot_source');const r=this.registry.preparationLease(job);need(r?.claim===job.claim&&num(r.lease_until,this.core.clock()+1,this.core.clock()+130000));job.lease_until=r.lease_until;
  const v={job,source,sourceJson:JSON.stringify(source),capturedAt:input.envelope.capturedAt,preparedAt:this.core.clock(),cancelled:false,deadline:performance.now()+this.waitMs,slot:null};let timer;
  const action=(async()=>{
   const ids=[...input.itemIds],evidence=new Map();for(const id of ids){const dto=input.priceSnapshot.getItem(id);need(dto?.itemId===id);for(const e of dto.identity.evidence)evidence.set(e.sourceUrl+'|'+e.retainedMetadataSha256,{sourceUrl:e.sourceUrl,sha256:e.retainedMetadataSha256});}
   v.metadataJson=JSON.stringify([...evidence.values()].sort((a,b)=>a.sourceUrl.localeCompare(b.sourceUrl)));v.membershipSha=await sha256(enc.encode(JSON.stringify(ids)));need(!v.cancelled&&performance.now()<v.deadline);need(same(this.source(job),source));
   const permit=this.reserveStage(v);v.permit=permit;if(permit.action!=='prepare')return v;
   const result=await streamFastCurrent(input.priceSnapshot,ids,{maxTotalBytes:FAST_LIMITS.generationBytes-FAST_LIMITS.manifestBytes,guard:()=>{this.stageFence(v);return true;},emitShard:row=>this.emit(v,row)});this.stageFence(v);
   const manifest=JSON.parse(result.manifestText);assertFastManifest(manifest);need(manifest.source.rawBodySha256===source.rawSha256&&manifest.source.retrievedAt===v.capturedAt,'fast_stage_snapshot_source');need(result.totalShardBytes+length(result.manifestText)<=FAST_LIMITS.generationBytes&&this.physicalBytes()+length(result.manifestText)<=FAST_LIMITS.spoolBytes,'fast_stage_capacity_hold');
   this.ctx.storage.transactionSync(()=>{const row=this.stageFence(v);need(row.staged_bytes===result.totalShardBytes&&this.row('SELECT COUNT(*)n FROM fast_current_shards WHERE slot=?',v.slot).n===result.shardCount);this.exec("UPDATE fast_current_staging SET state='ready',manifest_sha=?,manifest_bytes=?,shard_count=? WHERE slot=?",result.manifestSha256,length(result.manifestText),result.shardCount,v.slot);});
   v.projection={manifest:result.manifestText,manifestSha:result.manifestSha256,descriptors:manifest.shards,spool:result.totalShardBytes+length(result.manifestText)};return v;
  })().catch(error=>{if(['projection_capacity_hold','single_item_capacity_hold','manifest_capacity_hold','fast_stage_capacity_hold'].includes(error?.message)){need(!v.cancelled&&performance.now()<v.deadline);need(same(this.source(job),source));if(v.slot)this.stageFence(v);v.permit={action:'hold',reason:'projection_capacity_hold'};return v;}throw error;});this.memory.pending=action;const done=()=>{if(this.memory.pending===action)this.memory.pending=null;};action.then(done,done);
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{v.cancelled=true;reject(Error('fast_stage_deadline'));},this.waitMs);});
  try{await Promise.race([action,deadline]);need(!v.cancelled&&performance.now()<v.deadline);const ticket=Object.freeze({});this.#streamTickets.set(ticket,v);return ticket;}finally{clearTimeout(timer);}
 }
 commitRegistryCapture(ticket,phase){
  if(ticket===null)return{status:'disabled'};need(isOwnedFastCurrentCommit(phase,this.registry,this.ctx,this.core,ticket),'fast_registry_commit_phase');const v=this.#streamTickets.get(ticket);need(v,'fast_stage_ticket');this.#streamTickets.delete(ticket);if(!this.active)return{status:'disabled'};
  need(same(this.source(v.job),v.source),'fast_stage_source_rebound');if(v.permit.action==='duplicate')return{status:'duplicate'};
  if(v.permit.action==='hold'){this.defer({s:v.source,job:v.job,capturedAt:v.capturedAt},v.permit.reason);return{status:'held',reason:v.permit.reason};}
  const stage=this.stageFence(v),p=v.projection;need(stage.state==='ready'&&stage.manifest_sha===p.manifestSha&&stage.manifest_bytes===length(p.manifest)&&stage.shard_count===p.descriptors.length&&stage.staged_bytes+length(p.manifest)===p.spool);
  const reservation=this.row('SELECT * FROM fast_current_reservation');need(reservation?.epoch===this.epoch&&reservation.registry_claim===v.job.claim&&reservation.registry_lease===v.job.lease_until&&reservation.receipt_key===v.source.receiptKey&&reservation.state==='reserved'&&reservation.limit_bytes===FAST_LIMITS.generationBytes,'fast_stage_reservation_rebound');
  const rows=this.exec('SELECT shard_index,sha,bytes FROM fast_current_shards WHERE slot=? ORDER BY shard_index LIMIT 513',v.slot).toArray();need(rows.length===p.descriptors.length&&rows.every((r,i)=>r.shard_index===i&&r.sha===p.descriptors[i].sha256&&r.bytes===p.descriptors[i].bytes),'fast_stage_inventory_review');
  const c=this.control();if(c.latest_captured_at!==null&&(Date.parse(v.capturedAt)<Date.parse(c.latest_captured_at)||v.capturedAt===c.latest_captured_at&&v.source.sourceAttemptId<=c.latest_source_attempt)){this.exec("UPDATE fast_current_staging SET state='superseded' WHERE slot=?",v.slot);this.exec("UPDATE fast_current_reservation SET state='consumed' WHERE id=1");return{status:'older_source_retained_in_registry'};}
  need(this.physicalBytes()+length(p.manifest)<=FAST_LIMITS.spoolBytes,'fast_stage_capacity_hold');
  this.exec("INSERT INTO fast_current_outbox(slot,receipt_key,job_key,source_attempt,request_at,raw_sha,captured_at,source_json,projector_version,manifest_json,manifest_sha,spool_bytes,state,prepared_at,accepted_at,replay_verified)VALUES(?,?,?,?,?,?,?,?,1,?,?,?,'pending',?,?,0)",v.slot,v.source.receiptKey,v.source.jobKey,v.source.sourceAttemptId,v.source.requestAt,v.source.rawSha256,v.capturedAt,v.sourceJson,p.manifest,p.manifestSha,p.spool,v.preparedAt,this.core.clock());
  this.exec("UPDATE fast_current_staging SET state='admitted' WHERE slot=?",v.slot);this.exec('UPDATE fast_current_control SET latest_captured_at=?,latest_source_attempt=? WHERE id=1',v.capturedAt,v.source.sourceAttemptId);this.exec("UPDATE fast_current_reservation SET state='consumed' WHERE id=1");
  this.#finalTickets.set(ticket,v);
  return{status:'fast_private_outbox_staged',sourceRetrievedAt:v.capturedAt,publicationAt:null,clientReceivedAt:null};
 }
 finalizeRegistryAdmission(ticket,phase){
  need(isOwnedFastCurrentCommit(phase,this.registry,this.ctx,this.core,ticket),'fast_registry_commit_phase');const v=this.#finalTickets.get(ticket);if(!v)return;
  // Called AFTER the registry's own final ACK write, still inside the SAME
  // transaction and phase. No body read/copy, await, or mutation follows here.
  const source=ownedCalculationSource(this.core,{receiptKey:v.source.receiptKey,jobKey:v.source.jobKey}),job=this.registry.finalAdmissionWitness(v.job),stage=this.row('SELECT state,owner_epoch,registry_claim,registry_lease,manifest_sha FROM fast_current_staging WHERE slot=?',v.slot),outbox=this.row('SELECT receipt_key,source_attempt,raw_sha,captured_at,manifest_sha,spool_bytes FROM fast_current_outbox WHERE slot=?',v.slot),reservation=this.row('SELECT state,epoch,registry_claim,registry_lease,receipt_key,source_attempt,limit_bytes FROM fast_current_reservation WHERE id=1'),auth=this.row('SELECT auth_stopped FROM api_control WHERE id=1').auth_stopped;
  need(same(source,v.source)&&job?.state==='complete'&&job.claim===v.job.claim&&job.lease_until===null&&stage?.state==='admitted'&&stage.owner_epoch===this.epoch&&stage.registry_claim===v.job.claim&&stage.registry_lease===v.job.lease_until&&stage.manifest_sha===v.projection.manifestSha&&outbox?.receipt_key===v.source.receiptKey&&outbox.source_attempt===v.source.sourceAttemptId&&outbox.raw_sha===v.source.rawSha256&&outbox.captured_at===v.capturedAt&&outbox.manifest_sha===v.projection.manifestSha&&outbox.spool_bytes===v.projection.spool&&reservation?.state==='consumed'&&reservation.epoch===this.epoch&&reservation.registry_claim===v.job.claim&&reservation.registry_lease===v.job.lease_until&&reservation.receipt_key===v.source.receiptKey&&reservation.source_attempt===v.source.sourceAttemptId&&reservation.limit_bytes===FAST_LIMITS.generationBytes,'fast_stage_final_authority');
  // Read monotonic time LAST: synchronous SQLite/flag checks can themselves
  // consume the budget while timer callbacks cannot run.
  need(!v.cancelled&&this.active&&auth===0&&this.core.clock()<v.job.lease_until&&performance.now()<v.deadline,'fast_stage_final_deadline_or_pause');
  this.#finalTickets.delete(ticket);
 }
 stagingHealth(){if(!this.enabled||!this.active)return{enabled:false,status:'disabled'};return{enabled:true,status:'hidden_incremental_staging_only',heldReason:this.control().hold_reason,stages:this.row('SELECT COUNT(*)n FROM fast_current_staging').n,hiddenStages:this.row("SELECT COUNT(*)n FROM fast_current_staging WHERE state!='admitted'").n,checkpointRows:this.row('SELECT COUNT(*)n FROM fast_current_stage_checkpoints').n,retainedBodyBytes:this.physicalBytes(),preparationPending:!!this.memory.pending,allShardOutputArrayRetained:false,sqlBodiesReleased:false,continuousReuse:false};}
}
