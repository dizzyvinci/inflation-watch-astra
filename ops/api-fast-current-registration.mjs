// Explicit WORK-only optional owner registration. Absent/Off has no heavy import,
// core/config/SQL, bucket, key, alarm, provider or timer access.
const REGISTERED=new WeakMap(),CACHE=new WeakMap();
const CONTRACT='e0c58417ac4bc4097d7a61d85797002708073a35fac48a7234c0bc646e977893';
const REF=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
function compact(text){let out='',string=false,escape=false;for(const c of text){if(string){out+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;}else if(c==='"'){string=true;out+=c;}else if(!/[\x20\t\r\n]/.test(c))out+=c;}return out;}
export function fastCurrentRegistrationConfiguration(env){
 try{const raw=env?.API_FAST_CURRENT_JSON;if(raw===undefined)return Object.freeze({status:'disabled'});
  if(typeof raw!=='string'||raw.length>2048)return Object.freeze({status:'invalid'});const v=JSON.parse(raw);
  // Flat closed configuration is canonical after whitespace removal; duplicate
  // keys/escaped aliases cannot become an ambiguous enabled configuration.
  if(JSON.stringify(v)!==compact(raw))return Object.freeze({status:'invalid'});
  if(v&&Object.keys(v).join(',')==='enabled'&&v.enabled===false)return Object.freeze({status:'disabled'});
  if(!v||Array.isArray(v)||Object.keys(v).sort().join('|')!=='approvalRecorded|contractSha256|enabled|grantReference|mode|publicationEnabled|roundReference|schemaVersion'||v.schemaVersion!==1||v.enabled!==true||v.approvalRecorded!==true||v.mode!=='continuous_v2_reprojection'||v.contractSha256!==CONTRACT||v.publicationEnabled!==false||typeof v.grantReference!=='string'||typeof v.roundReference!=='string'||!REF.test(v.grantReference)||!REF.test(v.roundReference))return Object.freeze({status:'invalid'});
  return Object.freeze({status:'ready',value:Object.freeze({schemaVersion:1,enabled:true,approvalRecorded:true,mode:v.mode,contractSha256:CONTRACT,grantReference:v.grantReference,roundReference:v.roundReference,publicationEnabled:false})});
 }catch{return Object.freeze({status:'invalid'});}
}
export function isOwnedFastCurrentRegistryDelegate(value,ctx,core,recurring){const b=REGISTERED.get(value);return !!b&&b.ctx===ctx&&b.core===core&&b.recurring===recurring;}
class RegisteredRegistrySlot{
 constructor(ctx,env,core,recurring,Implementation,enabled){this.ctx=ctx;this.env=env;this.core=core;this.original=recurring;this.Implementation=Implementation;this.enabled=enabled;this.inner=null;this.status='awaiting_initialization';this.review=false;}
 get active(){return this.original.active===true;}
 get registry(){return this.original.registry;}
 eventFrame(){return this.original.eventFrame();}
 nextProviderDue(){return this.original.nextProviderDue();}
 authPaused(){return this.core.row('SELECT auth_stopped FROM api_control WHERE id=1')?.auth_stopped!==0;}
 ensure(){
  if(!this.enabled())return null;if(this.inner||this.review)return this.inner;if(this.authPaused()){this.status='authentication_paused';return null;}
  let live=true;try{const work=new this.Implementation(this.ctx,this.core,this.original,{enabled:true,isEnabled:()=>live&&this.enabled()});if(!this.enabled()){live=false;this.status='paused_during_initialization';this.review=true;return null;}this.inner=work;this.status='ready';return work;}catch{live=false;this.review=true;this.status='initialization_review';return null;}
 }
 reconcile(limit=8,frame){const work=this.ensure();return work?work.reconcile(limit,frame):this.original.reconcile(limit,frame);}
 nextDue(){
  if(!this.enabled())return this.original.nextDue();
  if(this.inner){
   const work=this.inner;if(!work.fastActive)return this.original.nextDue();
   const now=this.core.clock(),ordinary=[this.original.nextDue(),work.registryDue()].filter(v=>v!==null);
   const later=(...values)=>values.every(v=>Number.isSafeInteger(v)&&v>=0)?Math.max(now,...values):now+30000;
   let fast=null;
   try{
    const c=work.journal.control(),g=work.journal.selected();
    // Physical settlement is separate from a retry. Keep its bounded hold,
    // while ready ordinary work remains eligible in this same mux slot.
    if(c.action_token||work.journal.gate.task)fast=later(c.retry_at,now+30000);
    else if(work.maintenance())fast=c.hold_reason==='continuous_action_review_or_retry'?later(c.retry_at):now;
    else if(c.selected_receipt){
     const floor=later(c.retry_at);
     if(!g?.manifest_sha){
      const r=work.reprojection.row();
      if(!r||r.receipt_key!==c.selected_receipt)fast=floor; // bounded SQL handoff
      else if(['pending','running'].includes(r.state))fast=later(c.retry_at,r.available_at,r.lease_until??0);
      else fast=later(c.retry_at,now+30000); // review/inconsistent child, no idle loop
     }else{
      const w=work.journal.row('SELECT state FROM fast_current_write_jobs WHERE slot=?',g.slot),p=work.publication.job();
      if(w?.state==='review'||['review','superseded'].includes(p?.state))fast=now; // existing metadata-only hold transition
      else if(!w)fast=floor; // reconcile writer from the admitted exact graph
      else if(w.state!=='written'){const at=work.writer.nextDue();fast=at===null?later(c.retry_at,now+30000):later(c.retry_at,at);}
      else if(!p||p.generation_id!==g.generation_id)fast=floor; // exact publication handoff
      else if(p.state==='committed'&&g.state==='committed_unconfirmed')fast=floor; // fixed current readback
      else{const at=work.publication.nextDue();fast=at===null?later(c.retry_at,now+30000):later(c.retry_at,at);}
     }
    }else if(c.pending_source)fast=later(c.retry_at); // selection may persist a capacity hold
    else if(c.hold_reason)fast=later(c.retry_at,now+30000);
   }catch{fast=now+30000;} // bounded optional metadata review; no deadline write
   const due=[...ordinary,fast].filter(v=>v!==null);return due.length?Math.min(...due):null;
  }
  const due=this.original.nextDue();return this.enabled()&&!this.review&&!this.authPaused()?(due===null?this.core.clock():Math.min(due,this.core.clock())):due;
 }
 defer(){return this.enabled()&&this.inner?this.inner.defer():this.original.defer();}
 drainOne(beforeIO,frame){const work=this.ensure();return work?work.drainOne(beforeIO,frame):this.original.drainOne(beforeIO,frame);}
}
export async function createFastCurrentRegistryRegistration(ctx,env,core,recurring){
 const cfg=fastCurrentRegistrationConfiguration(env);if(cfg.status!=='ready')return null;
 try{
 if(core?.ctx!==ctx||core.env!==env||recurring?.ctx!==ctx||recurring.core!==core)return Object.freeze({status:'scope_review',delegate:null});
 const text=JSON.stringify(cfg.value),enabled=()=>{const c=fastCurrentRegistrationConfiguration(env);return c.status==='ready'&&JSON.stringify(c.value)===text;};
 const g=core.config();if(g.enabled!==true||g.grantReference!==cfg.value.grantReference||g.probeRound!==cfg.value.roundReference)return Object.freeze({status:'scope_review',delegate:null});
 const prior=CACHE.get(recurring);if(prior){if(prior.text===text&&prior.ctx===ctx&&prior.core===core&&prior.env===env&&isOwnedFastCurrentRegistryDelegate(prior.registration.delegate,ctx,core,recurring))return prior.registration;return Object.freeze({status:'scope_review',delegate:null});}
 // The module graph and optional SQL are reached only after explicit closed On.
 const {ContinuousFastCurrentWork}=await import('./api-fast-current-continuous-work.mjs');if(!enabled())return null;
 const loadedPrior=CACHE.get(recurring);if(loadedPrior){if(loadedPrior.text===text&&loadedPrior.ctx===ctx&&loadedPrior.core===core&&loadedPrior.env===env&&isOwnedFastCurrentRegistryDelegate(loadedPrior.registration.delegate,ctx,core,recurring))return loadedPrior.registration;return Object.freeze({status:'scope_review',delegate:null});}
 const delegate=new RegisteredRegistrySlot(ctx,env,core,recurring,ContinuousFastCurrentWork,enabled);REGISTERED.set(delegate,{ctx,core,recurring});delegate.ensure();
 const registration=Object.freeze({get status(){return delegate.status;},delegate,publicReaderRegistered:false});CACHE.set(recurring,{registration,text,ctx,core,env});return registration;
 }catch{return Object.freeze({status:'initialization_review',delegate:null});}
}
