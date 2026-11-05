import {DurableObject} from 'cloudflare:workers';
import {ApiCollectorCore} from './api-collector-core.mjs';
import {ApiPrivateHealth} from './api-private-health.mjs';
import {ApiAlarmScheduler} from './api-alarm-scheduler.mjs';

export class ApiGrantCollector extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.core = new ApiCollectorCore(ctx, env);
      this.privateHealth = new ApiPrivateHealth(ctx, env, this.core);
      this.scheduler = new ApiAlarmScheduler(ctx, env, this.core);
    });
  }
  async enqueueProbeRound(round) {await this.ready; return this.core.enqueueProbeRound(round);}
  async runOne() {
    await this.ready;
    let result;
    try {result=await this.core.runOne();}
    catch(error) {
      try {await this.privateHealth.afterRun({status:'internal_error'});} catch {}
      throw error;
    }
    try {
      const mirrored=await this.privateHealth.afterRun(result);
      return mirrored.status==='private_health_pending'?{...result,privateHealthPending:true}:result;
    } catch {return {...result,privateHealthPending:true};}
  }
  async health() {await this.ready; return {...this.core.health(),schedule:this.scheduler.health()};}
  async kickScheduledCollection() {
    await this.ready;const result=await this.scheduler.kick();
    // Optional private-health outbox repair costs no provider attempt.
    try {await this.privateHealth?.flush();} catch {return {...result,privateHealthPending:true};}
    return result;
  }
  async alarm() {
    await this.ready;const result=await this.scheduler.alarm();
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
