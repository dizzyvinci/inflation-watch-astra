// Explicit optional WORK facade for the EXISTING registry slot. No flag/registration.
import {ApiCollectorCore} from './api-collector-core.mjs';
import {isOwnedFastCurrentPreparation,isOwnedFastCurrentCommit} from './item-recurring-registry.mjs';
import {ItemRecurringWork} from './api-item-recurring.mjs';
import {IncrementalFastCurrentRegistrySink} from './api-fast-current-incremental-owner.mjs';
import {FastCurrentImmutableWriter} from './api-fast-current-immutable-writer.mjs';
import {FastCurrentReplayEngine} from './api-fast-current-replay-engine.mjs';
import {FastCurrentReprojection,prepareFastObservation} from './api-fast-current-reprojection.mjs';
import {FastCurrentContinuousJournal,fastV2Policy} from './api-fast-current-continuous-journal.mjs';
const need=(v,c='fast_v2_work_review')=>{if(!v)throw Error(c)};
const TICKETS=new WeakMap();
class ContinuousSink extends IncrementalFastCurrentRegistrySink{
 // Ordinary admission never enters optional FAST compiler/memory/action gates.
 beforeRawRegistryCapture(job){if(job.fastDerivativeLease&&this.active){super.beforeRawRegistryCapture(job);this.journal.beforeRaw(job)}}
 selectRegistryJob(oldest){if(!this.journal?.active)return oldest;const c=this.journal.control(),latest=this.row("SELECT * FROM recurring_registry_jobs WHERE operation='prices' AND state='pending' AND available_at<=? ORDER BY source_attempt DESC LIMIT 1",this.core.clock());const chosen=c.registry_turn==='fast'&&latest?latest:oldest;if(chosen)this.journal.exec('UPDATE fast_v2_control SET registry_turn=? WHERE id=1',c.registry_turn==='fast'?'ordinary':'fast');return chosen;}
 async prepareRegistryCapture(input){
  if(!this.active)return null;need(isOwnedFastCurrentPreparation(input,this.registry,this.ctx),'fast_v2_registry_preparation_capability');
  if(!input.job.fastDerivativeLease){let profile,missingReason=null;try{profile=await prepareFastObservation(this.registry,input)}catch(error){if(error?.message!=='fast_optional_profile_bound')throw error;missingReason='optional_profile_bound_hold';}if(!this.active)return null;const ticket=Object.freeze({});TICKETS.set(ticket,{normal:true,profile,missingReason,job:input.job});return ticket;}
  need(input.job.receipt_key===this.journal.selectedReceipt(),'fast_v2_derivative_selection');const generation=await this.journal.reserveGeneration(input),ticket=await super.prepareRegistryCapture(input);this.journal.finalFence(generation);if(ticket)TICKETS.set(ticket,{generation});return ticket;
 }
 commitRegistryCapture(ticket,phase){const held=TICKETS.get(ticket);if(held?.normal){need(isOwnedFastCurrentCommit(phase,this.registry,this.ctx,this.core,ticket),'fast_observation_commit_phase');this.registry.fence(held.job);if(!this.active)return{status:'optional_fast_paused_normal_admission_preserved'};return held.profile?this.journal.recordObservation(held.profile):this.journal.recordMissingObservation(held.job,held.missingReason);}
  const result=super.commitRegistryCapture(ticket,phase);if(held&&result.status==='fast_private_outbox_staged')this.journal.bindStaged(held.generation);return result;}
 finalizeRegistryAdmission(ticket,phase){const held=TICKETS.get(ticket);if(held?.normal){need(isOwnedFastCurrentCommit(phase,this.registry,this.ctx,this.core,ticket),'fast_observation_final_phase');const r=this.registry.finalAdmissionWitness(held.job);need(r?.state==='complete'&&r.claim===held.job.claim&&r.lease_until===null,'fast_observation_original_ack');TICKETS.delete(ticket);return{status:'normal_registry_optional_pin_complete'};}
  if(held)this.journal.finalFence(held.generation);TICKETS.delete(ticket);return super.finalizeRegistryAdmission(ticket,phase);}
 stageFence(v){const row=super.stageFence(v);if(this.journal){const g=this.journal.selected();if(g){need(g.receipt_key===v.source.receiptKey&&g.slot===v.slot,'fast_v2_stage_slot_rebound');this.journal.finalFence(g)}}return row;}
 defer(v,reason){if(!this.journal)return super.defer(v,reason);const g=this.journal.selected();if(g)this.journal.holdGeneration(g,reason,{inTransaction:true});}
}
class ContinuousWriter extends FastCurrentImmutableWriter{
 claim(){const j=super.claim();if(j&&!j.review){const g=this.journal.bySlot(j.slot);need(g&&g.receipt_key===j.receipt_key&&g.manifest_sha===j.manifest_sha,'fast_v2_writer_slot_binding');j.generation_id=g.generation_id;j.slot_epoch=g.slot_epoch;}return j;}
 fence(j){const s=super.fence(j),g=this.journal.generation(j.generation_id);need(g&&g.slot===j.slot&&g.slot_epoch===j.slot_epoch&&g.receipt_key===j.receipt_key,'fast_v2_writer_slot_epoch');this.journal.finalFence(g);return s;}
 async drainOne(beforeIO){need(this.journal.gate.token,'fast_v2_writer_action_required');return super.drainOne(beforeIO)}
}
export class ContinuousFastCurrentWork{
 constructor(ctx,core,registryWork,{enabled=false,isEnabled=()=>true,waitMs=30000}={}){
  this.enabled=enabled===true;this.registryWork=registryWork;if(!this.enabled)return;
  need(core instanceof ApiCollectorCore&&core.ctx===ctx&&registryWork instanceof ItemRecurringWork&&registryWork.ctx===ctx&&registryWork.core===core&&registryWork.active,'fast_v2_same_owner');this.ctx=ctx;this.core=core;this.isEnabled=isEnabled;this.flight=null;
  // Reject unsupported populated policy BEFORE even the shared sink epoch can
  // change. Constructor failure is not a migration or a cancellation signal.
  const prior=core.row("SELECT name FROM sqlite_master WHERE name='fast_v2_control'");if(prior)need(core.row('SELECT policy_json FROM fast_v2_control WHERE id=1')?.policy_json===fastV2Policy(core.config()),'fast_v2_migration_required');
  for(const table of ['fast_publication_owner','fast_publication_job','fast_current_finite_work'])if(core.row('SELECT name FROM sqlite_master WHERE name=?',table))need(!core.row('SELECT 1 n FROM '+table+' LIMIT 1'),'fast_v2_migration_required');
  this.sink=new ContinuousSink(ctx,core,registryWork.registry,{enabled:true,isEnabled,waitMs});this.journal=new FastCurrentContinuousJournal(ctx,core,this.sink,{enabled:true,isEnabled});this.sink.journal=this.journal;registryWork.registry.setFastCurrentSink(this.sink);
  this.writer=new ContinuousWriter(ctx,core,this.sink,{enabled:true,isEnabled,waitMs});this.writer.journal=this.journal;
  this.publication=new FastCurrentReplayEngine(ctx,core,this.sink,this.writer,{enabled:true,isEnabled,waitMs,adapter:this.journal});this.reprojection=new FastCurrentReprojection(this.journal);
 }
 get active(){return this.registryWork?.active===true}
 get fastActive(){return this.enabled&&this.journal?.active===true&&this.writer.active&&this.publication.active}
 get registry(){return this.registryWork.registry}
 eventFrame(){return this.registryWork.eventFrame()}
 nextProviderDue(){return this.registryWork.nextProviderDue()}
 reconcile(limit=8,frame){
  if(!this.fastActive)return this.registryWork.reconcile(limit,frame);need(Number.isSafeInteger(limit)&&limit>=1&&limit<=8,'fast_v2_handoff_bound');
  // Existing newest and FIFO handoff remain normal-registry work. Optional FAST
  // selects only a provenance profile already ACKed by this same registry.
  const latest=this.registryWork.reconcileLatestPrice(frame),rest=limit-latest.queued,ordinary=rest>0?this.registryWork.reconcile(rest,frame):{queued:0};
  this.journal.observeLatest();this.journal.selectPending();this.reconcileFast();return{status:'continuous_same_registry_handoff',queued:latest.queued+ordinary.queued,providerRequested:false};
 }
 reconcileFast(){if(!this.fastActive)return;const g=this.journal.selected();if(g?.manifest_sha){this.writer.reconcile(3);this.publication.reconcile()}}
 maintenance(){const j=this.journal,p=j.row('SELECT * FROM fast_v2_archive_pending WHERE id=1');if(p)return p.generation_id==='skipped'?'archive-skipped':'archive';if(j.row("SELECT 1 n FROM fast_v2_generations WHERE role IN ('recovery','historical') AND archive_done=1 AND payload_released=0 LIMIT 1"))return'release';if(j.archiveCandidate())return'archive';if(j.row('SELECT 1 n FROM fast_v2_skipped_intents LIMIT 1'))return'archive-skipped';if(j.row("SELECT 1 n FROM fast_v2_generations WHERE role='historical' AND payload_released=1 AND archive_done=1 LIMIT 1"))return'prune';return null;}
 registryDue(){return this.registry.nextDue();}
 nextDue(){const ordinary=this.registryWork.nextDue();if(!this.fastActive)return ordinary;const values=[ordinary,this.registryDue(),this.journal.nextDue(),this.writer.nextDue(),this.publication.nextDue(),this.reprojection.nextDue()].filter(v=>v!==null);return values.length?Math.min(...values):null;}
 defer(){return this.registryWork.defer();}
 async drainOrdinary(beforeIO,frame){
  const direct=this.registryDue(),now=this.core.clock();this.journal.exec("UPDATE fast_v2_control SET last_kind='ordinary' WHERE id=1");
  // This is the existing registry's independently bounded physical flight;
  // it does not borrow or clear the sticky FAST SDK reservation.
  return direct!==null&&direct<=now?this.registry.drainOne(beforeIO):this.registryWork.drainOne(beforeIO,frame);
 }
 async drainOne(beforeIO,frame){
  if(!this.fastActive)return this.registryWork.drainOne(beforeIO,frame);need(typeof beforeIO==='function');this.reconcile(8,frame);
  const j=this.journal,now=this.core.clock(),ordinary=[this.registryDue(),this.registryWork.nextDue()].some(v=>v!==null&&v<=now);
  if(ordinary&&(this.flight||j.gate.task||j.control().action_token||j.control().last_kind!=='ordinary'))return this.drainOrdinary(beforeIO,frame);
  if(this.flight)return{status:'busy_fast_only'};const action=this.perform(beforeIO,frame);this.flight=action;try{return await action}finally{if(this.flight===action)this.flight=null;}
 }
 async perform(beforeIO,frame){
  const j=this.journal,c=j.control(),now=this.core.clock();if(c.action_token||j.gate.task)return{status:'protected_recovery_hold',retryAt:Math.max(c.retry_at,now+30000)};
  const g=j.selected(),job=this.publication.job();let fastKind=null;
  if(g&&j.row('SELECT state FROM fast_current_write_jobs WHERE slot=?',g.slot)?.state==='review'){j.holdGeneration(g,'writer_review');return{status:'continuous_generation_review_hold'};}
  if(g&&['review','superseded'].includes(job?.state)){j.holdGeneration(g,'publication_'+job.state);return{status:'continuous_generation_review_hold'};}
  if(c.retry_at<=now){
   if(g&&!g.manifest_sha)fastKind='reprojection';
   else if(!g&&j.selectedReceipt())fastKind='reprojection';
   else if(job?.state==='committed'&&g?.state==='committed_unconfirmed')fastKind='readback';
   else if(g?.manifest_sha&&this.writer.nextDue()!==null&&this.writer.nextDue()<=now)fastKind='writer';
   else if(g?.manifest_sha&&this.publication.nextDue()!==null&&this.publication.nextDue()<=now)fastKind='publication';
  }
  const maintenance=this.maintenance();if(maintenance&&fastKind)fastKind=['archive','archive-skipped','release','prune'].includes(c.last_kind)?fastKind:maintenance;else fastKind??=maintenance;
  if(!fastKind){const ready=[this.registryDue(),this.registryWork.nextDue()].some(v=>v!==null&&v<=now);return ready?this.drainOrdinary(beforeIO,frame):{status:'continuous_fast_idle'};}
  j.exec('UPDATE fast_v2_control SET last_kind=? WHERE id=1',fastKind);
  const kind=fastKind.startsWith('archive')?'archive':fastKind;let target=g;if(fastKind==='archive')target=j.archiveCandidate();else if(fastKind==='release')target=j.row("SELECT * FROM fast_v2_generations WHERE role IN ('recovery','historical') AND archive_done=1 AND payload_released=0 ORDER BY source_attempt LIMIT 1");else if(fastKind==='archive-skipped'||fastKind==='prune')target=null;
  try{return await j.runAction(kind,target,()=>fastKind==='reprojection'?this.reprojection.drainOne(beforeIO):fastKind==='writer'?this.writer.drainOne(beforeIO):fastKind==='publication'?this.publication.drainOne(beforeIO):fastKind==='readback'?j.confirmCurrent(beforeIO):fastKind==='archive-skipped'?j.archiveSkipped(beforeIO):fastKind==='archive'?j.archiveOld(beforeIO):fastKind==='release'?j.releaseOld(beforeIO):j.pruneHistoryOne(),()=>fastKind==='writer'?this.writer.pendingAction:fastKind==='publication'?this.publication.pending:null)}catch(error){if(this.fastActive)j.defer(error?.message?.includes('capacity')?'spool_capacity_hold':'continuous_action_review_or_retry');return{status:'continuous_fast_action_held',reason:'reviewed_state_or_storage_retry',retryAt:now+30000,providerRequested:false};}
 }
 health(){if(!this.enabled)return{enabled:false,status:'disabled'};return this.journal.diagnostic()}
}
