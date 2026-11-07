import {createSearchIdentityRegistration} from './api-search-identity-registration.mjs';
import {createFastCurrentRegistryRegistration} from './api-fast-current-registration.mjs';
import {FixedFashionPilotOwner} from './fixed-fashion-pilot-owner.mjs';
import {DurableObject} from 'cloudflare:workers';
import {apiIndexOwnerConfiguration,ApiIndexOwnerBridge} from './api-index-owner-bridge.mjs';
import {StampReferenceOwner,stampReferenceConfiguration} from './stamp-reference-owner.mjs';
import {loadStampReferenceDefinition} from './stamp-reference-contract.mjs';
import * as indexApi from './api-index-calculations.mjs';
import {loadApiIndexDefinition} from './api-index-definition.mjs';
import {ApiCollectorCore} from './api-collector-core.mjs';
import {ApiPrivateHealth} from './api-private-health.mjs';
import {ApiAlarmScheduler} from './api-alarm-scheduler.mjs';
import {ApiPrivateCashAlarm} from './api-private-cash-alarm.mjs';
import {ItemRecurringWork,CompositeItemScope,itemRecurringRequested} from './api-item-recurring.mjs';
import {ObservedFirstPass,loadObservedPlan} from './api-observed-firstpass.mjs';
import {OBSERVED_PLAN_SHA256,observedPlanBytes} from './observed-firstpass-plan.mjs';

export class ApiGrantCollector extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.firstPass = (env.API_OBSERVED_FIRSTPASS_JSON && JSON.parse(env.API_OBSERVED_FIRSTPASS_JSON).enabled === true)||itemRecurringRequested(env)
        ? new ObservedFirstPass(ctx,env,await loadObservedPlan(observedPlanBytes(),OBSERVED_PLAN_SHA256)) : null;
      this.core = new ApiCollectorCore(ctx, env,{observedScope:this.firstPass});
      this.recurring=new ItemRecurringWork(ctx,env,this.core,this.firstPass);
      this.core.recurring=this.recurring;
      if(this.recurring.active)this.core.observed=new CompositeItemScope(this.firstPass,this.recurring);
      if(apiIndexOwnerConfiguration(env).status==='ready'){
        // A failed optional compiled definition closes this feature, never the raw owner.
        try{const definition=await loadApiIndexDefinition();const registry=this.recurring.registry;
          if(registry){let stampReferences=null;try{const stampCfg=stampReferenceConfiguration(env);if(stampCfg.status==='ready'){const stampDefinition=await loadStampReferenceDefinition();if(stampDefinition.definitionHash===stampCfg.definitionHash)stampReferences=new StampReferenceOwner(ctx,env,this.core,registry,stampDefinition,{enabled:true});else this.core.stampReferenceInitialization='definition_review';}}catch{this.core.stampReferenceInitialization='optional_initialization_review';}this.core.indexBridge=new ApiIndexOwnerBridge(ctx,env,this.core,{definition,api:indexApi,registry,stampReferences});registry.setCalculationSink(this.core.indexBridge);}}catch{this.core.indexBridgeInitialization='definition_or_scope_review';}
      }
      try{this.core.fixedFashionPilot=new FixedFashionPilotOwner(ctx,env,this.core);}catch{this.core.fixedFashionPilotInitialization='unavailable';}
      this.privateHealth = new ApiPrivateHealth(ctx, env, this.core);
      const fastRegistration=await createFastCurrentRegistryRegistration(ctx,env,this.core,this.recurring);
      if(fastRegistration){this.fastCurrentRegistration=fastRegistration;this.privateHealth.fastCurrentDelegate=fastRegistration.delegate;}
      const searchRegistration=await createSearchIdentityRegistration(ctx,env,this.core,this.recurring,{baseDelegate:fastRegistration?.delegate??this.recurring});
      if(searchRegistration?.delegate){this.searchIdentityRegistration=searchRegistration;this.privateHealth.searchIdentityDelegate=searchRegistration.delegate;}
      const registryDelegate=searchRegistration?.delegate??fastRegistration?.delegate;
      this.privateCash = registryDelegate
        ? new ApiPrivateCashAlarm(ctx,env,this.core,{registryDelegate})
        : new ApiPrivateCashAlarm(ctx, env, this.core);
      await this.privateCash.initialize();
      this.scheduler = new ApiAlarmScheduler(ctx, env, this.core,{firstPass:this.firstPass,recurring:this.recurring,...(this.privateCash.hasMux?{alarmControl:this.privateCash.providerControl}:{})});
    });
  }
  async enqueueProbeRound(round) {await this.ready; return this.core.enqueueProbeRound(round);}
  async runOne() {
    await this.ready;const recurringFrame=this.recurring.eventFrame();
    await this.privateCash.beforeProviderEvent();
    let result;
    try {result=await this.core.runOne();}
    catch(error) {
      await this.privateCash.afterProviderEvent(recurringFrame);
      try {await this.privateHealth.afterRun({status:'internal_error'});} catch {}
      throw error;
    }
    await this.privateCash.afterProviderEvent(recurringFrame);
    try {
      const mirrored=await this.privateHealth.afterRun(result);
      return mirrored.status==='private_health_pending'?{...result,privateHealthPending:true}:result;
    } catch {return {...result,privateHealthPending:true};}
  }
  async health() {await this.ready; return {...this.core.health(),schedule:this.scheduler.health(),privateProjection:this.privateCash.health()};}
  async kickScheduledCollection() {
    await this.ready;const recurringFrame=this.recurring.eventFrame();await this.privateCash.scheduleStoredWork(recurringFrame);const result=await this.scheduler.kick();
    // Optional private-health outbox repair costs no provider attempt.
    try {await this.privateHealth?.flush();} catch {return {...result,privateHealthPending:true};}
    return result;
  }
  async alarm() {
    await this.ready;
    if(this.ownerAlarmFlight){await this.ctx.storage.setAlarm(this.core.clock()+130000);return{status:'owner_alarm_busy'};}
    this.ownerAlarmFlight=this.ownerAlarmEvent(this.recurring.eventFrame());
    try{return await this.ownerAlarmFlight;}finally{this.ownerAlarmFlight=null;}
  }
  async ownerAlarmEvent(recurringFrame){
    const kind=this.privateCash.chooseAlarm();
    if(kind==='private')return this.privateCash.runPrivateAlarm();
    if(kind==='public')return this.privateCash.runPublicAlarm();
    if(kind==='nx')return this.privateCash.runNxAlarm();
    if(kind==='nx-r2')return this.privateCash.runNxR2Alarm();
    if(kind==='items')return this.privateCash.runItemsAlarm();
    if(kind==='history')return this.privateCash.runHistoryAlarm();
    if(kind==='discovery')return this.privateCash.runDiscoveryAlarm();
    if(kind==='registry')return this.privateCash.runRegistryAlarm(recurringFrame);
    if(kind==='nx-history')return this.privateCash.runNxHistoryAlarm();
    if(kind==='calculations')return this.privateCash.runIndexAlarm();
    if(kind==='early'){await this.privateCash.arm();return{status:'early_owner_alarm'};}
    await this.privateCash.beforeProviderEvent();
    let result;
    try{result=await this.scheduler.alarm();}
    finally{await this.privateCash.afterProviderEvent(recurringFrame);}
    if(result.ownerRunStatus&&this.privateHealth){
      try {await this.privateHealth.afterRun({status:result.ownerRunStatus});}
      catch {return {...result,privateHealthPending:true};}
    }
    return result;
  }
  async resumeAfterCredentialsReview(reference) {await this.ready; return this.core.resumeAfterCredentialsReview(reference);}
  // Even accidental HTTP exposure must not become an administrative endpoint.
  fetch() {return new Response('Not found', {status: 404, headers: {'Cache-Control': 'no-store'}});}
}

// No public administration route; the default fallback remains closed.
export default {fetch() {return new Response('Not found', {status: 404});}};
