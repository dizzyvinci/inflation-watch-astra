// WORK proposal: one existing owner/alarm, separate raw-provider and private-decode events.
import {PrivateCashMaterializer} from './api-private-cash-materializer.mjs';
import bindings from './api-cash-bindings-v1.json' with {type:'json'};
import {ApiPublicCashPublisher} from './api-public-cash-publisher.mjs';
import {PrivateNxOffersProducer} from './api-private-nx-offers.mjs';
import {PrivateNxPublisher} from './api-private-nx-publisher.mjs';
import {privateNxR2Configuration,privateNxR2Health} from './api-private-nx-r2-health.mjs';
import {scheduleConfig} from './api-alarm-scheduler.mjs';
import {PrivateItemDiscoveryWork,privateDiscoveryConfiguration} from './api-private-item-discovery-work.mjs';
import {privateItemDiscoveryHealth} from './api-private-item-discovery-health.mjs';
import {PrivateItemHistoryWork} from './api-private-item-history-work.mjs';
import {privateHistoryConfiguration} from './api-private-item-history-contract.mjs';
import {privateItemHistoryHealth} from './api-private-item-history-health.mjs';
import {PrivateItemWork} from './api-private-item-work.mjs';
import {privateItemConfiguration,privateItemHealth} from './api-private-item-health.mjs';

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
    if(this.hasMux)this.ensureProviderRecoveryControl();
    this.initialStatus=this.status();
    if(this.initialStatus==='ready')this.materializer=new PrivateCashMaterializer(ctx,env.API_RAW_RECEIPTS,bindings,{enabled:true,now:()=>core.clock()});
    if(this.nxStatus()==='ready')this.nxProducer=new PrivateNxOffersProducer(ctx,env.API_RAW_RECEIPTS,{enabled:true,now:()=>core.clock(),isEnabled:()=>this.nxStatus()==='ready',privatePublicationEnabled:this.nxR2Status()==='ready'});
    if(this.nxProducer&&this.nxR2Status()==='ready')this.nxPublisher=new PrivateNxPublisher(ctx,env.API_RAW_RECEIPTS,{enabled:true,now:()=>core.clock(),isEnabled:()=>this.nxR2Status()==='ready'});
    if(this.itemsStatus()==='ready')this.itemWork=new PrivateItemWork(ctx,env,core);
    if(this.historyStatus()==='ready')this.historyWork=new PrivateItemHistoryWork(ctx,env,core);
    if(this.discoveryStatus()==='ready')this.discoveryWork=new PrivateItemDiscoveryWork(ctx,env,core,{getItemWork:()=>this.itemWork});
    if(!this.cashActive&&!this.nxActive&&!this.itemsActive&&!this.historyActive&&!this.discoveryActive)return;
    core.sql.exec(`CREATE TABLE IF NOT EXISTS api_cash_alarm_mux(id INTEGER PRIMARY KEY CHECK(id=1),
      provider_at INTEGER,private_at INTEGER,recovery_at INTEGER,last_kind TEXT,initialized INTEGER NOT NULL DEFAULT 0)`);
    core.sql.exec('INSERT OR IGNORE INTO api_cash_alarm_mux(id) VALUES(1)');
    this.hasMux=true;this.ensureProviderRecoveryControl();
    if(this.cashActive)this.publisher=new ApiPublicCashPublisher(ctx,env,core,()=>this.cashActive);
  }
  ensureProviderRecoveryControl(){
    // A stop is different from a provider callback interrupted after its claim.
    // Keep that distinction across hot resets without reading a credential here.
    this.core.sql.exec(`CREATE TABLE IF NOT EXISTS api_cash_provider_recovery(id INTEGER PRIMARY KEY CHECK(id=1),paused INTEGER NOT NULL DEFAULT 0)`);
    this.core.sql.exec('INSERT OR IGNORE INTO api_cash_provider_recovery(id) VALUES(1)');
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
  nxStatus(){
    try{const v=JSON.parse(this.env.API_PRIVATE_NX_JSON??'{"enabled":false}');
      if(v?.enabled===false)return'private_nx_disabled';
      if(!v||Object.keys(v).sort().join(',')!=='enabled,methodVersion,publicationEnabled,schemaVersion'||v.enabled!==true||v.schemaVersion!==1||v.methodVersion!==1||v.publicationEnabled!==false)return'invalid_private_nx_configuration';
      return this.core.config().enabled===true?'ready':'private_nx_requires_enabled_grant';
    }catch{return'invalid_private_nx_configuration';}
  }
  nxR2Status(){return privateNxR2Configuration(this.env,this.core);}
  discoveryStatus(){return privateDiscoveryConfiguration(this.env,this.core);}
  get discoveryActive(){return this.discoveryWork!==undefined&&this.discoveryStatus()==='ready';}
  historyStatus(){return privateHistoryConfiguration(this.env,this.core);}
  get historyActive(){return this.historyWork!==undefined&&this.historyStatus()==='ready';}
  itemsStatus(){return privateItemConfiguration(this.env,this.core);}
  get itemsActive(){return this.itemWork!==undefined&&this.itemsStatus()==='ready';}
  get nxR2Active(){return this.nxPublisher!==undefined&&this.nxActive&&this.nxR2Status()==='ready';}
  get cashActive(){return this.materializer!==undefined&&this.status()==='ready';}
  get nxActive(){return this.nxProducer!==undefined&&this.nxStatus()==='ready';}
  get active(){return this.cashActive||this.nxActive||this.itemsActive||this.historyActive||this.discoveryActive;}
  row(){return this.core.row('SELECT * FROM api_cash_alarm_mux WHERE id=1');}
  async setProviderAlarm(at){
    this.ctx.storage.transactionSync(()=>{
      this.core.sql.exec('UPDATE api_cash_alarm_mux SET provider_at=? WHERE id=1',at);
      this.core.sql.exec('UPDATE api_cash_provider_recovery SET paused=0 WHERE id=1');
    });
    return this.arm();
  }
  async clearProviderAlarm(){
    this.ctx.storage.transactionSync(()=>{
      this.core.sql.exec('UPDATE api_cash_alarm_mux SET provider_at=NULL WHERE id=1');
      this.core.sql.exec('UPDATE api_cash_provider_recovery SET paused=1 WHERE id=1');
    });
    return this.arm();
  }
  get providerControl(){return{setAlarm:at=>this.setProviderAlarm(at),deleteAlarm:()=>this.clearProviderAlarm()};}
  async arm(){
    const row=this.row(),now=this.core.clock();
    const choices=[row.provider_at,...(this.cashActive?[row.private_at,this.publisher?.nextDue()??null]:[]),...(this.active?[row.recovery_at]:[]),...(this.nxActive?[this.nxProducer.nextDue()]:[]),...(this.nxR2Active?[this.nxPublisher.nextDue()]:[]),...(this.itemsActive?[this.itemWork.nextDue()]:[]),...(this.historyActive?[this.historyWork.nextDue()]:[]),...(this.discoveryActive?[this.discoveryWork.nextDue()]:[])].filter(value=>value!==null);
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
    let privateAt=this.row().private_at;
    if(this.cashActive){
      const pending=this.core.row("SELECT MIN(available_at) AS at FROM private_cash_jobs WHERE state='pending'").at;
      const lease=this.core.row("SELECT MIN(lease_until) AS at FROM private_cash_jobs WHERE state='running'").at;
      const outbox=this.core.row('SELECT pending,blocked_until FROM private_cash_outbox WHERE id=1');
      const candidates=[pending,lease,outbox.pending?now+1:null].filter(value=>value!==null);
      privateAt=candidates.length?Math.max(now+1,outbox.blocked_until,Number.isSafeInteger(result.retryAt)?result.retryAt:0,Math.min(...candidates)):null;
    }
    const rawLease=this.core.row("SELECT MIN(lease_until) AS at FROM api_jobs WHERE state='running'").at;
    // Recover a consumed provider callback after any reset cutpoint: before
    // claim, while its raw lease is live/expired, or after raw success before
    // scheduler re-arm. A scheduler stop is explicitly paused and must not spin.
    const mux=this.row(),control=this.core.row('SELECT auth_stopped,blocked_until,next_allowed FROM api_control WHERE id=1');
    const paused=this.core.row('SELECT paused FROM api_cash_provider_recovery WHERE id=1').paused;
    const providerStopped=control.auth_stopped||paused;
    const consumedProvider=mux.provider_at===null&&(mux.last_kind==='provider'||rawLease!==null);
    if(consumedProvider&&!providerStopped){
      const candidates=[this.core.nextAttemptAt(this.core.config())].filter(at=>at!==null);
      let storageAt=0;
      if(this.core.row("SELECT name FROM sqlite_master WHERE type='table' AND name='api_alarm_events'")){
        let schedule;try{schedule=scheduleConfig(this.env);}catch{}
        if(schedule?.enabled){const event=this.core.row('SELECT MIN(next_due) AS at FROM api_alarm_events WHERE schedule_ref=? AND active_job_key IS NULL',schedule.scheduleReference).at;if(event!==null)candidates.push(event);}
      }
      if(this.core.row("SELECT name FROM sqlite_master WHERE type='table' AND name='api_alarm_storage'"))storageAt=this.core.row('SELECT blocked_until FROM api_alarm_storage WHERE id=1')?.blocked_until??0;
      const due=candidates.length?Math.min(...candidates):now+1;
      this.core.sql.exec('UPDATE api_cash_alarm_mux SET provider_at=? WHERE id=1 AND provider_at IS NULL',Math.max(now+1,rawLease===null?0:rawLease+1,control.blocked_until,control.next_allowed,storageAt,due));
    }
    // A live raw lease keeps protection until it expires. Expired raw recovery
    // belongs to the separate provider event above, never a private-only loop.
    const recoveryAt=rawLease===null||rawLease<=now||providerStopped?null:Math.max(now+30_000,rawLease+1);
    this.core.sql.exec('UPDATE api_cash_alarm_mux SET private_at=?,recovery_at=? WHERE id=1',privateAt,recoveryAt);
  }
  async scheduleStoredWork(){
    if(!this.active)return{status:this.status()};
    try{
      const reconciled=this.cashActive?this.materializer.reconcileCompletedPrices(8):{queued:0};
      if(this.cashActive)this.publisher?.reconcile();
      if(this.nxActive)this.nxProducer.reconcile(8);
      if(this.nxR2Active)this.nxPublisher.reconcileStored(); // SQL-only restart/adoption repair
      if(this.itemsActive)this.itemWork.reconcile();
      if(this.historyActive)this.historyWork.reconcile(8);
      if(this.discoveryActive)this.discoveryWork.reconcile();
      this.refreshPrivateDeadline();await this.arm();
      return{status:'private_projection_scheduled',queued:reconciled.queued};
    }catch{
      const retryAt=this.core.clock()+30_000;
      if(this.cashActive)this.core.sql.exec('UPDATE api_cash_alarm_mux SET private_at=? WHERE id=1',retryAt);
      // NX-only mode must arm an active durable slot; private_at is ignored
      // while cash is off. Preserve any earlier shared recovery deadline.
      if(this.nxActive)this.core.sql.exec('UPDATE api_cash_alarm_mux SET recovery_at=CASE WHEN recovery_at IS NULL THEN ? ELSE MIN(recovery_at,?) END WHERE id=1',retryAt,retryAt);
      if(this.itemsActive)this.itemWork.defer();
      if(this.historyActive)this.historyWork.defer();
      if(this.discoveryActive)this.discoveryWork.defer();
      await this.arm();return{status:'private_projection_schedule_retry'};
    }
  }
  async afterProviderEvent(){return this.scheduleStoredWork();} // SQL only; never decode here.
  chooseAlarm(){
    if(!this.active)return'provider';
    const row=this.row(),now=this.core.clock();
    const recoveryDue=row.recovery_at!==null&&row.recovery_at<=now;
    const privateDue=this.cashActive&&([row.private_at].some(at=>at!==null&&at<=now)||recoveryDue);
    const nxAt=this.nxActive?this.nxProducer.nextDue():null,nxDue=this.nxActive&&(nxAt!==null&&nxAt<=now||!this.cashActive&&recoveryDue);
    const providerDue=row.provider_at!==null&&row.provider_at<=now;
    const publicAt=this.cashActive?this.publisher?.nextDue()??null:null,publicDue=publicAt!==null&&publicAt<=now;
    const nxR2At=this.nxR2Active?this.nxPublisher.nextDue():null,nxR2Due=nxR2At!==null&&nxR2At<=now;
    const itemsAt=this.itemsActive?this.itemWork.nextDue():null,itemsDue=itemsAt!==null&&itemsAt<=now;
    const historyAt=this.historyActive?this.historyWork.nextDue():null,historyDue=historyAt!==null&&historyAt<=now;
    const discoveryAt=this.discoveryActive?this.discoveryWork.nextDue():null,discoveryDue=discoveryAt!==null&&discoveryAt<=now;
    if(!privateDue&&!providerDue&&!publicDue&&!nxDue&&!nxR2Due&&!itemsDue&&!historyDue&&!discoveryDue)return'early';
    // At most one heavy operation per event; alternate when both are overdue.
    let kind=privateDue&&(!providerDue||row.last_kind!=='private')?'private':'provider';
    if(publicDue||nxDue||nxR2Due||itemsDue||historyDue||discoveryDue){const order=['private','public','nx','nx-r2','items','history','discovery','provider'],start=(order.indexOf(row.last_kind)+1)%order.length;
      kind=[...order.slice(start),...order.slice(0,start)].find(k=>({private:privateDue,public:publicDue,nx:nxDue,'nx-r2':nxR2Due,items:itemsDue,history:historyDue,discovery:discoveryDue,provider:providerDue})[k]);}
    this.core.sql.exec(kind==='private'?'UPDATE api_cash_alarm_mux SET last_kind=?,private_at=NULL,recovery_at=NULL WHERE id=1':
      kind==='provider'?'UPDATE api_cash_alarm_mux SET last_kind=?,provider_at=NULL WHERE id=1':'UPDATE api_cash_alarm_mux SET last_kind=? WHERE id=1',kind);return kind;
  }
  async runPrivateAlarm(){
    if(!this.cashActive)return{status:this.status()};
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
      if(this.nxActive)this.nxProducer.reconcile(8);
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
    if(!this.cashActive||!this.publisher?.active)return{status:'public_disabled'};
    // Durable fallback BEFORE claim or I/O. Busy callbacks also retain recovery.
    await this.ctx.storage.setAlarm(this.core.clock()+130000);
    try{const result=await this.publisher.drainOne(()=>this.arm());
      this.refreshPrivateDeadline();await this.arm();return{...result,eventKind:'public_subset',providerAttempted:false};}
    catch{await this.ctx.storage.setAlarm(this.core.clock()+30000);return{status:'public_event_retry',eventKind:'public_subset',providerAttempted:false};}
  }
  async runNxAlarm(){
    if(!this.nxActive)return{status:this.nxStatus()};
    this.core.sql.exec('UPDATE api_cash_alarm_mux SET recovery_at=? WHERE id=1',this.core.clock()+130000);await this.arm();
    try{this.nxProducer.reconcile(8);const result=await this.nxProducer.drainOne(async()=>{await this.arm();});
      this.refreshPrivateDeadline();await this.arm();return{...result,eventKind:'private_nx_offers',providerAttempted:false};
    }catch{this.core.sql.exec('UPDATE api_cash_alarm_mux SET recovery_at=? WHERE id=1',this.core.clock()+30000);await this.arm();return{status:'private_nx_event_retry',eventKind:'private_nx_offers',providerAttempted:false};}
  }
  async armNxR2Recovery(until){
    // Persist the SAME owner recovery deadline before any publication I/O.
    // The outbox lease also survives reset; no provider work is created here.
    this.core.sql.exec('UPDATE api_cash_alarm_mux SET recovery_at=CASE WHEN recovery_at IS NULL THEN ? ELSE MIN(recovery_at,?) END WHERE id=1',until,until);
    await this.arm();
  }
  async runNxR2Alarm(){
    if(!this.nxR2Active)return{status:this.nxR2Status(),eventKind:'private_nx_r2',providerAttempted:false};
    try{
      await this.armNxR2Recovery(this.core.clock()+130000);
      const result=await this.nxPublisher.drainOne(until=>this.armNxR2Recovery(until));
      this.refreshPrivateDeadline();await this.arm();
      return{...result,eventKind:'private_nx_r2',providerAttempted:false};
    }catch{
      // Keep a durable owner continuation even if claim/arming/SQL failed.
      const at=this.core.clock()+30000;
      this.core.sql.exec('UPDATE api_cash_alarm_mux SET recovery_at=? WHERE id=1',at);
      await this.ctx.storage.setAlarm(at);
      return{status:'private_nx_r2_event_retry',eventKind:'private_nx_r2',providerAttempted:false};
    }
  }
  async armItemsRecovery(until){
    this.core.sql.exec('UPDATE api_cash_alarm_mux SET recovery_at=CASE WHEN recovery_at IS NULL THEN ? ELSE MIN(recovery_at,?) END WHERE id=1',until,until);
    await this.arm();
  }
  async runItemsAlarm(){
    if(!this.itemsActive)return{status:this.itemsStatus(),eventKind:'private_items',providerAttempted:false};
    try{
      await this.armItemsRecovery(this.core.clock()+130000);
      this.itemWork.reconcile();
      const result=await this.itemWork.drainOne(until=>this.armItemsRecovery(until));
      this.itemWork.reconcile();
      this.refreshPrivateDeadline();await this.arm();
      return{...result,eventKind:'private_items',providerAttempted:false};
    }catch{
      const at=this.itemWork.defer();
      try{await this.arm();}catch{const prior=await this.ctx.storage.getAlarm();await this.ctx.storage.setAlarm(prior===null?at:Math.min(prior,at));}
      return{status:'private_items_event_retry',eventKind:'private_items',providerAttempted:false};
    }
  }
  async runHistoryAlarm(){
    if(!this.historyActive)return{status:this.historyStatus(),eventKind:'private_item_history',providerAttempted:false};
    try{
      await this.armItemsRecovery(this.core.clock()+130000);
      const result=await this.historyWork.drainOne(until=>this.armItemsRecovery(until));
      if(result.status==='history_registry_ready')this.historyWork.reconcile(8);
      this.refreshPrivateDeadline();await this.arm();
      return{...result,eventKind:'private_item_history',providerAttempted:false};
    }catch{
      const at=this.historyWork.defer();
      try{await this.arm();}catch{const prior=await this.ctx.storage.getAlarm();await this.ctx.storage.setAlarm(prior===null?at:Math.min(prior,at));}
      return{status:'private_item_history_event_retry',eventKind:'private_item_history',providerAttempted:false};
    }
  }
  async runDiscoveryAlarm(){
    if(!this.discoveryActive)return{status:this.discoveryStatus(),eventKind:'private_item_discovery',providerAttempted:false};
    try{
      await this.armItemsRecovery(this.core.clock()+130000);
      const result=await this.discoveryWork.drainOne(until=>this.armItemsRecovery(until));
      this.refreshPrivateDeadline();await this.arm();
      return{...result,eventKind:'private_item_discovery',providerAttempted:false};
    }catch{
      const at=this.discoveryWork.defer();
      try{await this.arm();}catch{if(Number.isSafeInteger(at)){const prior=await this.ctx.storage.getAlarm();await this.ctx.storage.setAlarm(prior===null?at:Math.min(prior,at));}}
      return{status:'private_item_discovery_event_retry',eventKind:'private_item_discovery',providerAttempted:false};
    }
  }
  health(){
    if(!this.active)return{status:this.status()};
    const row=this.row();return{status:'private_only_ready',methodVersion:1,publicationEligible:false,
      privateAlarmAt:row.private_at,recoveryAlarmAt:row.recovery_at,privateNxPublication:privateNxR2Health(this.core,this.env),privateItems:privateItemHealth(this.core,this.env),privateItemHistory:privateItemHistoryHealth(this.core,this.env),privateItemDiscovery:privateItemDiscoveryHealth(this.core,this.env),
      jobs:this.cashActive?this.core.sql.exec('SELECT state,COUNT(*) AS count FROM private_cash_jobs GROUP BY state').toArray():[],
      ...(this.nxProducer?{nxOffers:this.nxActive?this.nxProducer.health():{status:this.nxStatus()}}:{})};
  }
}
