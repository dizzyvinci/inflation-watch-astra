// Explicit same-owner derivative registration. Absent/Off touches no core/SQL/bucket.
import {ACTIVITY_DEFINITION_SHA,ACTIVITY_PROFILE,activityDefinitionReady} from './api-overview-activity-public-contract.mjs';
const CACHE=new WeakMap(),BRAND=new WeakMap(),MONO=()=>performance.now(),REF=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/,EPOCH=/^[a-z][a-z0-9-]{0,63}$/;
function compact(s){let r='',q=false,e=false;for(const c of s){if(q){r+=c;if(e)e=false;else if(c==='\\')e=true;else if(c==='"')q=false;}else if(c==='"'){r+=c;q=true;}else if(!/[\x20\t\r\n]/.test(c))r+=c;}return r;}
export function overviewActivityConfiguration(env){try{const raw=env?.API_OVERVIEW_ACTIVITY_JSON;if(raw===undefined)return{status:'disabled'};if(typeof raw!=='string'||raw.length>2048)return{status:'invalid'};const v=JSON.parse(raw);if(JSON.stringify(v)!==compact(raw))return{status:'invalid'};if(v&&Object.keys(v).join('|')==='enabled'&&v.enabled===false)return{status:'disabled'};
 if(!v||Array.isArray(v)||Object.keys(v).sort().join('|')!=='approvalRecorded|definitionHash|enabled|epoch|grantReference|profile|publicationEnabled|roundReference|schemaVersion'||v.schemaVersion!==1||v.enabled!==true||v.approvalRecorded!==true||v.definitionHash!==ACTIVITY_DEFINITION_SHA||v.profile!==ACTIVITY_PROFILE||v.publicationEnabled!==false||typeof v.grantReference!=='string'||!REF.test(v.grantReference)||v.grantReference==='maplestory-market-account-primary-v1'||typeof v.roundReference!=='string'||!REF.test(v.roundReference)||typeof v.epoch!=='string'||!EPOCH.test(v.epoch))return{status:'invalid'};return{status:'ready',value:Object.freeze({...v})};
}catch{return{status:'invalid'};}}
export function isOwnedOverviewActivityDelegate(v,ctx,core,original){const b=BRAND.get(v);return!!b&&b.ctx===ctx&&b.core===core&&b.original===original;}
export async function createOverviewActivityRegistration(ctx,env,core,original,{waitMs=30000,monotonic=MONO}={}){
 const cfg=overviewActivityConfiguration(env);if(cfg.status!=='ready')return null;
 try{if(core?.ctx!==ctx||core.env!==env||original?.ctx!==ctx||original.core!==core||!original.registry)return null;
  const text=JSON.stringify(cfg.value),same=e=>e.text===text&&e.ctx===ctx&&e.core===core&&e.waitMs===waitMs&&e.monotonic===monotonic,prior=CACHE.get(original);if(prior)return same(prior)?prior.registration:null;
  const [{OverviewActivityDelivery},{sharedOverviewConfiguration},{sha256},{isOwnedBasicCurrentRegistryDelegate},{isOwnedSearchIdentityRegistryDelegate},{isOwnedFastCurrentRegistryDelegate},{ItemRecurringWork}]=await Promise.all([import('./api-overview-activity-delivery.mjs'),import('./api-shared-overview-guard.mjs'),import('./api-price-item-dto.mjs'),import('./api-basic-current-registration.mjs'),import('./api-search-identity-registration.mjs'),import('./api-fast-current-registration.mjs'),import('./api-item-recurring.mjs')]);
  const enabled=()=>{const v=overviewActivityConfiguration(env);return v.status==='ready'&&JSON.stringify(v.value)===text&&sharedOverviewConfiguration(env).status==='ready';};
  await activityDefinitionReady();const g=core.config();if(!(original instanceof ItemRecurringWork)||!enabled()||g.enabled!==true||!g.allowedOperations.includes('overview')||g.grantReference!==cfg.value.grantReference||g.probeRound!==cfg.value.roundReference)return null;
  const scope={grantReference:g.grantReference,roundReference:g.probeRound,epoch:cfg.value.epoch,definitionHash:ACTIVITY_DEFINITION_SHA},scopeHash=await sha256(new TextEncoder().encode(JSON.stringify(scope)));if(!enabled())return null;const loaded=CACHE.get(original);if(loaded)return same(loaded)?loaded.registration:null;
  const delivery=new OverviewActivityDelivery(ctx,core,original.registry,{scope,scopeHash,isEnabled:enabled,waitMs,monotonic});let wrapped=null,base=null;
  const registration=Object.freeze({sink:delivery.sink,delivery,scope:Object.freeze(scope),scopeHash,wrap(next){
   if(wrapped)return next===base?wrapped:null;
   if(next!==original&&!isOwnedBasicCurrentRegistryDelegate(next,ctx,core,original)&&!isOwnedSearchIdentityRegistryDelegate(next,ctx,core,original)&&!isOwnedFastCurrentRegistryDelegate(next,ctx,core,original))return null;base=next;
   const basePhysical=()=>{try{let b=base;if(isOwnedBasicCurrentRegistryDelegate(b,ctx,core,original)){if(b.physicalPending!==false)return true;b=b.base;}const fast=b?.base??b,w=fast?.inner;return!!(original.registry?.flight||b?.owner?.busy||w?.journal?.gate?.task||w?.journal?.control()?.action_token||w?.writer?.pendingAction||w?.writer?.physical?.size||w?.publication?.pending||w?.publication?.reservation?.physical);}catch{return true;}};
   wrapped={ctx,core,original,get base(){return base;},get active(){return original.active===true;},get registry(){return original.registry;},eventFrame:()=>original.eventFrame(),nextProviderDue:()=>original.nextProviderDue(),reconcile:(limit,frame)=>base.reconcile(limit,frame),
    nextDue(){const a=base.nextDue(),b=delivery.nextDue();return a===null?b:b===null?a:Math.min(a,b);},
    defer(){return delivery.control().last_turn==='activity'?delivery.nextDue():base.defer();},
    get physicalPending(){return delivery.physicalPending||basePhysical();},
    async drainOne(beforeIO,frame){if(!delivery.active)return base.drainOne(beforeIO,frame);const now=core.clock(),a=base.nextDue(),b=delivery.nextDue(),baseReady=a!==null&&a<=now,ownReady=b!==null&&b<=now&&!basePhysical()&&(!delivery.physicalPending||delivery.settlementRecoverable);const pick=ownReady&&(!baseReady||delivery.control().last_turn!=='activity')?'activity':'base';
     // Record actual dispatch BEFORE the source final ACK, never write afterward.
     if(baseReady||ownReady){delivery.guard();core.sql.exec('UPDATE overview_activity_delivery SET last_turn=? WHERE id=1',pick);}
     return pick==='activity'?delivery.drainOne(beforeIO):base.drainOne(beforeIO,frame);
    }};Object.freeze(wrapped);BRAND.set(wrapped,{ctx,core,original});return wrapped;
  },publicRouteRegistered:false,providerConsumerAdded:false,muxKindAdded:false});CACHE.set(original,{text,ctx,core,registration,waitMs,monotonic});return registration;
 }catch{return null;}
}
