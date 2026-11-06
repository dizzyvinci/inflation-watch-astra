import {DurableObject} from 'cloudflare:workers';
import {ApiCollectorCore} from './api-collector-core.mjs';
import {ApiPrivateHealth} from './api-private-health.mjs';
import {ApiAlarmScheduler} from './api-alarm-scheduler.mjs';
import {ApiPrivateCashAlarm} from './api-private-cash-alarm.mjs';
import {ObservedFirstPass,loadObservedPlan} from './api-observed-firstpass.mjs';
import {OBSERVED_PLAN_SHA256,observedPlanBytes} from './observed-firstpass-plan.mjs';

export class ApiGrantCollector extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.firstPass = env.API_OBSERVED_FIRSTPASS_JSON && JSON.parse(env.API_OBSERVED_FIRSTPASS_JSON).enabled === true
        ? new ObservedFirstPass(ctx,env,await loadObservedPlan(observedPlanBytes(),OBSERVED_PLAN_SHA256)) : null;
      this.core = new ApiCollectorCore(ctx, env,{observedScope:this.firstPass});
      this.privateHealth = new ApiPrivateHealth(ctx, env, this.core);
      this.privateCash = new ApiPrivateCashAlarm(ctx, env, this.core);
      await this.privateCash.initialize();
      this.scheduler = new ApiAlarmScheduler(ctx, env, this.core,{firstPass:this.firstPass,...(this.privateCash.hasMux?{alarmControl:this.privateCash.providerControl}:{})});
    });
  }
  async enqueueProbeRound(round) {await this.ready; return this.core.enqueueProbeRound(round);}
  async runOne() {
    await this.ready;
    await this.privateCash.beforeProviderEvent();
    let result;
    try {result=await this.core.runOne();}
    catch(error) {
      await this.privateCash.afterProviderEvent();
      try {await this.privateHealth.afterRun({status:'internal_error'});} catch {}
      throw error;
    }
    await this.privateCash.afterProviderEvent();
    try {
      const mirrored=await this.privateHealth.afterRun(result);
      return mirrored.status==='private_health_pending'?{...result,privateHealthPending:true}:result;
    } catch {return {...result,privateHealthPending:true};}
  }
  async health() {await this.ready; return {...this.core.health(),schedule:this.scheduler.health(),privateProjection:this.privateCash.health()};}
  async kickScheduledCollection() {
    await this.ready;await this.privateCash.scheduleStoredWork();const result=await this.scheduler.kick();
    // Optional private-health outbox repair costs no provider attempt.
    try {await this.privateHealth?.flush();} catch {return {...result,privateHealthPending:true};}
    return result;
  }
  async alarm() {
    await this.ready;
    if(this.ownerAlarmFlight){await this.ctx.storage.setAlarm(this.core.clock()+130000);return{status:'owner_alarm_busy'};}
    this.ownerAlarmFlight=this.ownerAlarmEvent();
    try{return await this.ownerAlarmFlight;}finally{this.ownerAlarmFlight=null;}
  }
  async ownerAlarmEvent(){
    const kind=this.privateCash.chooseAlarm();
    if(kind==='private')return this.privateCash.runPrivateAlarm();
    if(kind==='public')return this.privateCash.runPublicAlarm();
    if(kind==='nx')return this.privateCash.runNxAlarm();
    if(kind==='early'){await this.privateCash.arm();return{status:'early_owner_alarm'};}
    await this.privateCash.beforeProviderEvent();
    let result;
    try{result=await this.scheduler.alarm();}
    finally{await this.privateCash.afterProviderEvent();}
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
