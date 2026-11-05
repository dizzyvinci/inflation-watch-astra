// WORK proposal: one existing owner/alarm, separate raw-provider and private-decode events.
import {PrivateCashMaterializer} from './api-private-cash-materializer.mjs';
import bindings from './api-cash-bindings-v1.json' with {type:'json'};
import {ApiPublicCashPublisher} from './api-public-cash-publisher.mjs';

export function privateCashConfig(env){
  if(!env.API_PRIVATE_CASH_JSON)return{enabled:false};
  const value=JSON.parse(env.API_PRIVATE_CASH_JSON);
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.enabled!=='boolean')throw new TypeError('Explicit private projection configuration required');
  if(!value.enabled)return{enabled:false};
  if(Object.keys(value).sort().join(',')!=='enabled,methodVersion,publicationEnabled,schemaVersion'||value.schemaVersion!==1||value.methodVersion!==1||value.publicationEnabled!==false)
    throw new TypeError('Unreviewed private projection configuration');
  return{enabled:true};
}

export class ApiPrivateCashAlarm{
  constructor(ctx,env,core){
    this.ctx=ctx;this.env=env;this.core=core;this.flight=null;
    // A retained mux must keep tracking legacy provider set/delete operations
    // while the private feature is off. Never create one just for default-off.
    this.hasMux=!!core.row("SELECT name FROM sqlite_master WHERE type='table' AND name='api_cash_alarm_mux'")&&
      !!core.row('SELECT id FROM api_cash_alarm_mux WHERE id=1');
    this.initialStatus=this.status();
    if(this.initialStatus!=='ready')return;
    this.materializer=new PrivateCashMaterializer(ctx,env.API_RAW_RECEIPTS,bindings,{enabled:true,now:()=>core.clock()});
    core.sql.exec(`CREATE TABLE IF NOT EXISTS api_cash_alarm_mux(id INTEGER PRIMARY KEY CHECK(id=1),
      provider_at INTEGER,private_at INTEGER,recovery_at INTEGER,last_kind TEXT,initialized INTEGER NOT NULL DEFAULT 0)`);
    core.sql.exec('INSERT OR IGNORE INTO api_cash_alarm_mux(id) VALUES(1)');
    this.hasMux=true;
    this.publisher=new ApiPublicCashPublisher(ctx,env,core,()=>this.active);
  }
  async initialize(){
    if(!this.active)return;
    // Explicit feature adoption can occur while the legacy scheduler already
    // has a durable provider alarm. Preserve that deadline before arbitration.
    const inherited=await this.ctx.storage.getAlarm();
    const at=Number.isSafeInteger(inherited)&&inherited>0?inherited:null;
    this.core.sql.exec('UPDATE api_cash_alarm_mux SET provider_at=?,initialized=1 WHERE id=1 AND initialized=0',at);
    // On resumption, provider metadata already reflects every off-mode legacy
    // scheduler change. Re-arm the earliest retained deadline without guessing
    // that a native private/recovery alarm belongs to the provider.
    // Recover completed private/public SQL handoffs on adoption or restart.
    // This performs no raw decode, R2 I/O or provider transport.
    await this.scheduleStoredWork();
  }
  status(){
    let config;try{config=privateCashConfig(this.env);}catch{return'invalid_private_projection_configuration';}
    if(!config.enabled)return'private_projection_disabled';
    try{if(this.core.config().enabled!==true)return'private_projection_requires_enabled_grant';}
    catch{return'private_projection_requires_valid_grant';}
    return'ready'; // Do not inspect a key: stored authorized raw can be processed after auth stop.
  }
  get active(){return this.materializer!==undefined&&this.status()==='ready';}
  row(){return this.core.row('SELECT * FROM api_cash_alarm_mux WHERE id=1');}
  async setProviderAlarm(at){
    this.core.sql.exec('UPDATE api_cash_alarm_mux SET provider_at=? WHERE id=1',at);
    return this.arm();
  }
  async clearProviderAlarm(){
    this.core.sql.exec('UPDATE api_cash_alarm_mux SET provider_at=NULL WHERE id=1');return this.arm();
  }
  get providerControl(){return{setAlarm:at=>this.setProviderAlarm(at),deleteAlarm:()=>this.clearProviderAlarm()};}
  async arm(){
    const row=this.row(),now=this.core.clock();
    const choices=[row.provider_at,...(this.active?[row.private_at,row.recovery_at,this.publisher?.nextDue()??null]:[])].filter(value=>value!==null);
    if(!choices.length){await this.ctx.storage.deleteAlarm();return null;}
    const at=Math.max(now+1,Math.min(...choices));await this.ctx.storage.setAlarm(at);return at;
  }
  async beforeProviderEvent(){
    if(!this.active)return;
    // Set a recovery alarm BEFORE transport. Completed api_jobs is the durable
    // handoff if the process exits after raw success but before reconciliation.
    this.core.sql.exec('UPDATE api_cash_alarm_mux SET recovery_at=? WHERE id=1',this.core.clock()+130_000);
    await this.arm();
  }
  refreshPrivateDeadline(result={}){
    const now=this.core.clock();
    const pending=this.core.row("SELECT MIN(available_at) AS at FROM private_cash_jobs WHERE state='pending'").at;
    const lease=this.core.row("SELECT MIN(lease_until) AS at FROM private_cash_jobs WHERE state='running'").at;
    const outbox=this.core.row('SELECT pending,blocked_until FROM private_cash_outbox WHERE id=1');
    const candidates=[pending,lease,outbox.pending?now+1:null].filter(value=>value!==null);
    const privateAt=candidates.length?Math.max(now+1,outbox.blocked_until,Number.isSafeInteger(result.retryAt)?result.retryAt:0,Math.min(...candidates)):null;
    const rawLease=this.core.row("SELECT MIN(lease_until) AS at FROM api_jobs WHERE state='running'").at;
    // A private recovery event must not erase protection for an in-flight raw GET.
    const recoveryAt=rawLease===null?null:Math.max(now+30_000,rawLease+1);
    this.core.sql.exec('UPDATE api_cash_alarm_mux SET private_at=?,recovery_at=? WHERE id=1',privateAt,recoveryAt);
  }
  async scheduleStoredWork(){
    if(!this.active)return{status:this.status()};
    try{
      const reconciled=this.materializer.reconcileCompletedPrices(8);
      this.publisher?.reconcile();
      this.refreshPrivateDeadline();await this.arm();
      return{status:'private_projection_scheduled',queued:reconciled.queued};
    }catch{
      this.core.sql.exec('UPDATE api_cash_alarm_mux SET private_at=? WHERE id=1',this.core.clock()+30_000);
      await this.arm();return{status:'private_projection_schedule_retry'};
    }
  }
  async afterProviderEvent(){return this.scheduleStoredWork();} // SQL only; never decode here.
  chooseAlarm(){
    if(!this.active)return'provider';
    const row=this.row(),now=this.core.clock();
    const privateDue=[row.private_at,row.recovery_at].some(at=>at!==null&&at<=now);
    const providerDue=row.provider_at!==null&&row.provider_at<=now;
    const publicAt=this.publisher?.nextDue()??null,publicDue=publicAt!==null&&publicAt<=now;
    if(!privateDue&&!providerDue&&!publicDue)return'early';
    // At most one heavy operation per event; alternate when both are overdue.
    let kind=privateDue&&(!providerDue||row.last_kind!=='private')?'private':'provider';
    if(publicDue){const order=['private','public','provider'],start=(order.indexOf(row.last_kind)+1)%3;
      kind=[...order.slice(start),...order.slice(0,start)].find(k=>({private:privateDue,public:publicDue,provider:providerDue})[k]);}
    this.core.sql.exec(kind==='private'?'UPDATE api_cash_alarm_mux SET last_kind=?,private_at=NULL,recovery_at=NULL WHERE id=1':
      kind==='provider'?'UPDATE api_cash_alarm_mux SET last_kind=?,provider_at=NULL WHERE id=1':'UPDATE api_cash_alarm_mux SET last_kind=? WHERE id=1',kind);return kind;
  }
  async runPrivateAlarm(){
    if(!this.active)return{status:this.status()};
    if(this.flight)return{status:'private_projection_busy'};
    this.flight=this.privateTick();try{return await this.flight;}finally{this.flight=null;}
  }
  async privateTick(){
    // Crash while decoding/committing leaves a real recovery alarm. On restart,
    // materializer's persisted lease/outbox/backoff decides the safe next action.
    this.core.sql.exec('UPDATE api_cash_alarm_mux SET recovery_at=? WHERE id=1',this.core.clock()+130_000);
    await this.arm();
    try{
      this.materializer.reconcileCompletedPrices(8);
      const result=await this.materializer.drainOne(); // exactly ONE decode/drain per event
      this.publisher?.reconcile(); // SQL-only; no public read/publish in raw-decode event
      this.refreshPrivateDeadline(result);await this.arm();
      return{...result,eventKind:'private_projection',providerAttempted:false};
    }catch{
      this.core.sql.exec('UPDATE api_cash_alarm_mux SET private_at=?,recovery_at=NULL WHERE id=1',this.core.clock()+30_000);
      await this.arm();return{status:'private_projection_event_retry',eventKind:'private_projection',providerAttempted:false};
    }
  }
  async runPublicAlarm(){
    if(!this.active||!this.publisher?.active)return{status:'public_disabled'};
    // Durable fallback BEFORE claim or I/O. Busy callbacks also retain recovery.
    await this.ctx.storage.setAlarm(this.core.clock()+130000);
    try{const result=await this.publisher.drainOne(()=>this.arm());
      this.refreshPrivateDeadline();await this.arm();return{...result,eventKind:'public_subset',providerAttempted:false};}
    catch{await this.ctx.storage.setAlarm(this.core.clock()+30000);return{status:'public_event_retry',eventKind:'public_subset',providerAttempted:false};}
  }
  health(){
    if(!this.active)return{status:this.status()};
    const row=this.row();return{status:'private_only_ready',methodVersion:1,publicationEligible:false,
      privateAlarmAt:row.private_at,recoveryAlarmAt:row.recovery_at,
      jobs:this.core.sql.exec('SELECT state,COUNT(*) AS count FROM private_cash_jobs GROUP BY state').toArray()};
  }
}
