// Optional private Basic aggregate uses the existing registry derivative slot.
// Absent/Off is decided before heavy imports or core/SQL/bucket access.
const BRAND=new WeakMap(),CACHE=new WeakMap();
export const BASIC_CURRENT_CONTRACT_SHA='26679889a74809b0ba8e0f87ff3ef52ab93bca18690ac05dab5b7c7061eb3a23';
const REF=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/,EPOCH=/^[a-z][a-z0-9-]{0,63}$/;
function compact(s){let r='',q=false,e=false;for(const c of s){if(q){r+=c;if(e)e=false;else if(c==='\\')e=true;else if(c==='"')q=false;}else if(c==='"'){r+=c;q=true;}else if(!/[\x20\t\r\n]/.test(c))r+=c;}return r;}
export function basicCurrentConfiguration(env){try{
 const raw=env?.API_BASIC_CURRENT_JSON;if(raw===undefined)return{status:'disabled'};
 if(typeof raw!=='string'||raw.length>2048)return{status:'invalid'};const v=JSON.parse(raw);
 if(JSON.stringify(v)!==compact(raw))return{status:'invalid'};
 if(v&&Object.keys(v).join(',')==='enabled'&&v.enabled===false)return{status:'disabled'};
 if(!v||Array.isArray(v)||Object.keys(v).sort().join('|')!=='approvalRecorded|contractSha256|enabled|epoch|grantReference|profile|publicationEnabled|roundReference|schemaVersion'||v.schemaVersion!==1||v.enabled!==true||v.approvalRecorded!==true||v.contractSha256!==BASIC_CURRENT_CONTRACT_SHA||v.profile!=='basic_aggregate_v1'||v.publicationEnabled!==false||typeof v.grantReference!=='string'||!REF.test(v.grantReference)||typeof v.roundReference!=='string'||!REF.test(v.roundReference)||typeof v.epoch!=='string'||!EPOCH.test(v.epoch))return{status:'invalid'};
 return{status:'ready',value:Object.freeze({...v})};
}catch{return{status:'invalid'};}}
export function isOwnedBasicCurrentRegistryDelegate(v,ctx,core,original){const b=BRAND.get(v);return!!b&&b.ctx===ctx&&b.core===core&&b.original===original;}
class BasicRegistrySlot{
 constructor(ctx,core,original,base,Implementation,enabled,cfg,pilot=null){this.pilot=pilot;this.ctx=ctx;this.core=core;this.original=original;this.base=base;this.Implementation=Implementation;this.enabled=enabled;this.cfg=cfg;this.owner=null;this.review=false;this.status='awaiting_initialization';this.last='base';}
 get active(){return this.original.active===true;}get registry(){return this.original.registry;}
 eventFrame(){return this.original.eventFrame();}nextProviderDue(){return this.original.nextProviderDue();}
 ensure(){
  if(!this.enabled()){if(this.owner)void this.owner.active;this.status='disabled';return null;}
  if(this.owner){if(this.owner.active)return this.owner;this.status='paused_or_review';return null;}
  if(this.review||this.core.row('SELECT auth_stopped FROM api_control WHERE id=1')?.auth_stopped!==0)return null;
  let live=true;
  try{const owner=new this.Implementation(this.ctx,this.core,this.registry,{enabled:true,isEnabled:()=>live&&this.enabled(),epoch:this.cfg.epoch,...(this.pilot?{pilotPolicy:this.pilot}:{})});
   if(!this.enabled()||!owner.active)throw Error('basic_initialization_gate');
   const c=owner.control();if(c.mux_turn!==null&&!['base','basic'].includes(c.mux_turn))throw Error('basic_mux_state');
   this.registry.setBasicCurrentSink(owner);this.owner=owner;this.status='ready';return owner;
  }catch{live=false;this.review=true;this.status='initialization_review';return null;}
 }
 reconcile(limit=8,frame){const owner=this.ensure();if(!owner?.pricePriorityEligible())return this.base.reconcile(limit,frame);if(!Number.isSafeInteger(limit)||limit<1||limit>8)throw TypeError('bounded_basic_registry_handoff');
  // Consume the original owned frame once: latest first, FIFO remainder. If an
  // existing FAST delegate also offers latest, that second handoff is a no-op.
  const latest=this.original.reconcileLatestPrice(frame),remaining=limit-latest.queued,ordinary=remaining>0?this.base.reconcile(remaining,frame):{queued:0};return{status:'basic_pilot_latest_fifo_handoff',queued:latest.queued+ordinary.queued};
 }
 nextDue(){const base=this.base.nextDue(),owner=this.ensure();if(!owner)return base;const basic=owner.nextDue();return base===null?basic:basic===null?base:Math.min(base,basic);}
 defer(){const owner=this.ensure();if(this.last!=='basic'||!owner)return this.base.defer();return owner.nextDue();}
 // Reports only known in-slot signals, never a new cross-domain physical permit.
 get physicalPending(){const o=this.owner,b=this.base,fast=b?.inner??b?.base?.inner;return!!(o?.pool?.task||o?.control()?.action_token||this.registry?.flight||b?.owner?.busy||fast?.journal?.gate?.task||fast?.journal?.control()?.action_token||fast?.writer?.pendingAction||fast?.writer?.physical?.size||fast?.publication?.pending||fast?.publication?.reservation?.physical);}
 async drainOne(beforeIO,frame){
  const owner=this.ensure();if(!owner)return this.base.drainOne(beforeIO,frame);
  const now=this.core.clock(),baseDue=this.base.nextDue(),basicDue=owner.nextDue(),baseReady=baseDue!==null&&baseDue<=now,basicReady=basicDue!==null&&basicDue<=now;
  if(!baseReady&&!basicReady)return{status:'basic_registry_not_due',providerAttempted:false};
  const pick=basicReady&&(!baseReady||owner.control().mux_turn!=='basic')?'basic':'base';this.last=pick;
  // The original beforeIO recovery hook is forwarded unchanged. One selected
  // component quantum only; no renewed action deadline or provider operation.
  const result=pick==='basic'?await owner.drainOne(beforeIO):await this.base.drainOne(beforeIO,frame);
  if(this.enabled()&&owner.active)this.core.ctx.storage.transactionSync(()=>{owner.guard();const c=owner.control();if(c.owner_epoch!==owner.ownerEpoch)throw Error('basic_mux_epoch');owner.exec('UPDATE basic_control SET mux_turn=? WHERE id=1 AND owner_epoch=?',pick,owner.ownerEpoch);owner.checkCapacity();owner.guard();});
  return result;
 }
}
export async function createBasicCurrentRegistration(ctx,env,core,original,{baseDelegate=original}={}){
 const cfg=basicCurrentConfiguration(env);if(cfg.status!=='ready')return null;
 const pilot=basicPilotBudgetConfiguration(env,cfg.value);if(pilot.status==='invalid')return{status:'scope_review',delegate:null};
 try{
  if(core?.ctx!==ctx||core.env!==env||original?.ctx!==ctx||original.core!==core)return{status:'scope_review',delegate:null};
  const text=JSON.stringify(cfg.value)+(pilot.status==='ready'?'|'+JSON.stringify(pilot.value):''),prior=CACHE.get(original);if(prior)return prior.text===text&&prior.ctx===ctx&&prior.core===core&&prior.env===env&&prior.base===baseDelegate?await prior.promise:{status:'scope_review',delegate:null};
  const enabled=()=>{const c=basicCurrentConfiguration(env);if(c.status!=='ready')return false;const p=basicPilotBudgetConfiguration(env,c.value);return p.status!=='invalid'&&JSON.stringify(c.value)+(p.status==='ready'?'|'+JSON.stringify(p.value):'')===text;};
  const entry={text,ctx,core,env,base:baseDelegate,promise:null};CACHE.set(original,entry);
  entry.promise=(async()=>{
   const [{BasicCurrentOwner},{isOwnedFastCurrentRegistryDelegate},{isOwnedSearchIdentityRegistryDelegate}]=await Promise.all([import('./api-basic-current-owner.mjs'),import('./api-fast-current-registration.mjs'),import('./api-search-identity-registration.mjs')]);
   if(!enabled())return null;const g=core.config();
   if(g.enabled!==true||g.grantReference!==cfg.value.grantReference||g.probeRound!==cfg.value.roundReference||baseDelegate!==original&&!isOwnedFastCurrentRegistryDelegate(baseDelegate,ctx,core,original)&&!isOwnedSearchIdentityRegistryDelegate(baseDelegate,ctx,core,original))return{status:'scope_review',delegate:null};
   const delegate=new BasicRegistrySlot(ctx,core,original,baseDelegate,BasicCurrentOwner,enabled,cfg.value,pilot.status==='ready'?await admitBasicPilotPolicy(pilot):null);BRAND.set(delegate,{ctx,core,original});delegate.ensure();return Object.freeze({get status(){return delegate.status;},delegate,get owner(){return delegate.owner;},publicRouteRegistered:false,upstreamLatestInspected:false});
  })().catch(()=>({status:'initialization_review',delegate:null}));return await entry.promise;
 }catch{return{status:'initialization_review',delegate:null};}
}

// Optional finite PRIVATE pilot. Absence/Off retains the original v1 path.
const PILOT_BRAND=new WeakSet();
export function basicPilotBudgetConfiguration(env,privateConfig=null){try{
 const raw=env?.API_BASIC_PILOT_BUDGET_JSON;if(raw===undefined)return{status:'disabled'};
 if(typeof raw!=='string'||raw.length>4096)return{status:'invalid'};const v=JSON.parse(raw);
 if(JSON.stringify(v)!==compact(raw))return{status:'invalid'};
 if(v&&Object.keys(v).join(',')==='enabled'&&v.enabled===false)return{status:'disabled'};
 const fields='approvalRecorded|enabled|grantReference|maxCapturedGenerations|maxReservationRows|maxReservedRemoteBytes|policy|privateEpoch|publicationEnabled|roundReference|schemaVersion|sourceNotBefore|windowMs';
 const integer=(x,max)=>Number.isSafeInteger(x)&&x>=1&&x<=max;
 if(!v||Array.isArray(v)||Object.keys(v).sort().join('|')!==fields||v.schemaVersion!==1||v.enabled!==true||v.approvalRecorded!==true||v.policy!=='private_basic_finite_pilot_v1'||v.publicationEnabled!==false||!integer(v.maxCapturedGenerations,4)||!integer(v.maxReservedRemoteBytes,67108864)||!integer(v.maxReservationRows,256)||v.maxReservationRows<v.maxCapturedGenerations||!integer(v.windowMs,900000)||typeof v.grantReference!=='string'||!REF.test(v.grantReference)||v.grantReference==='maplestory-market-account-primary-v1'||typeof v.roundReference!=='string'||!REF.test(v.roundReference)||typeof v.privateEpoch!=='string'||!EPOCH.test(v.privateEpoch)||typeof v.sourceNotBefore!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.sourceNotBefore)||!Number.isFinite(Date.parse(v.sourceNotBefore))||new Date(v.sourceNotBefore).toISOString()!==v.sourceNotBefore)return{status:'invalid'};
 if(privateConfig&&(v.grantReference!==privateConfig.grantReference||v.roundReference!==privateConfig.roundReference||v.privateEpoch!==privateConfig.epoch))return{status:'invalid'};
 const pub=env.API_PUBLIC_BASIC_ITEM_PRICES_JSON;
 if(pub!==undefined&&(typeof pub!=='string'||compact(pub)!=='{"enabled":false}'))return{status:'invalid'};
 return{status:'ready',value:Object.freeze({...v})};
}catch{return{status:'invalid'};}}
export async function admitBasicPilotPolicy(config){if(config?.status!=='ready')throw Error('basic_pilot_policy');
 // Revalidate through the exact JSON interface; never brand caller-owned data.
 const c=basicPilotBudgetConfiguration({API_BASIC_PILOT_BUDGET_JSON:JSON.stringify(config.value)});if(c.status!=='ready')throw Error('basic_pilot_policy');
 const {sha256}=await import('./api-price-item-dto.mjs'),text=JSON.stringify(c.value),p=Object.freeze({value:c.value,text,sha256:await sha256(new TextEncoder().encode(text))});PILOT_BRAND.add(p);return p;}
export function isAdmittedBasicPilotPolicy(p){return PILOT_BRAND.has(p);}
