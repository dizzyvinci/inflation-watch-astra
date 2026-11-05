// Optional, explicitly configured alarms. Transport/budgets remain in the SAME core/owner.
const INITIAL=['status','prices','catalogue','overview','apple-detail','apple-history'];
const REF=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

export function scheduleConfig(env){
  if(!env.API_SCHEDULE_JSON)return{enabled:false};
  const input=JSON.parse(env.API_SCHEDULE_JSON);
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.enabled!=='boolean')throw new TypeError('Invalid schedule');
  if(!input.enabled)return{enabled:false};
  if(Object.keys(input).some(key=>!['enabled','scheduleReference','requestIntervalMilliseconds','startupTargetSeconds','recurring'].includes(key)))throw new TypeError('Unknown schedule field');
  if(!REF.test(input.scheduleReference??''))throw new TypeError('Nonsecret schedule reference required');
  if(!Number.isSafeInteger(input.requestIntervalMilliseconds)||input.requestIntervalMilliseconds<2500||input.requestIntervalMilliseconds>86_400_000)throw new TypeError('Pacing minimum is2500ms');
  if(!Number.isSafeInteger(input.startupTargetSeconds)||input.startupTargetSeconds<1||input.startupTargetSeconds>86_400)throw new TypeError('Explicit startup target required');
  if(!Array.isArray(input.recurring)||input.recurring.length>INITIAL.length)throw new TypeError('Bounded recurring plan required');
  const seen=new Set();
  const recurring=input.recurring.map(row=>{
    if(!row||Object.keys(row).sort().join(',')!=='intervalSeconds,operation,priority'||!INITIAL.includes(row.operation)||seen.has(row.operation))throw new TypeError('Unreviewed recurring operation');
    seen.add(row.operation);
    if(!Number.isSafeInteger(row.intervalSeconds)||row.intervalSeconds*1000<input.requestIntervalMilliseconds||row.intervalSeconds>86400||!Number.isSafeInteger(row.priority)||row.priority<0||row.priority>999)throw new TypeError('Invalid recurring cadence');
    return{operation:row.operation,intervalSeconds:row.intervalSeconds,priority:row.priority};
  }).sort((a,b)=>a.operation.localeCompare(b.operation));
  return{enabled:true,scheduleReference:input.scheduleReference,requestIntervalMilliseconds:input.requestIntervalMilliseconds,
    startupTargetSeconds:input.startupTargetSeconds,recurring};
}

export class ApiAlarmScheduler{
  constructor(ctx,env,core){
    this.ctx=ctx;this.env=env;this.core=core;this.flight=null;
    ctx.storage.transactionSync(()=>{
      core.sql.exec(`CREATE TABLE IF NOT EXISTS api_alarm_plans(schedule_ref TEXT PRIMARY KEY,config_json TEXT NOT NULL,
        round_ref TEXT NOT NULL,started_at INTEGER NOT NULL,target_at INTEGER NOT NULL,initial_complete_at INTEGER,phase TEXT NOT NULL)`);
      core.sql.exec(`CREATE TABLE IF NOT EXISTS api_alarm_events(schedule_ref TEXT NOT NULL,operation TEXT NOT NULL,
        interval_ms INTEGER NOT NULL,priority INTEGER NOT NULL,next_due INTEGER NOT NULL,active_job_key TEXT,
        skipped_intervals INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(schedule_ref,operation))`);
      core.sql.exec(`CREATE TABLE IF NOT EXISTS api_alarm_storage(id INTEGER PRIMARY KEY CHECK(id=1),
        blocked_until INTEGER NOT NULL DEFAULT 0,backoff_step INTEGER NOT NULL DEFAULT 0,last_status TEXT)`);
      core.sql.exec('INSERT OR IGNORE INTO api_alarm_storage(id) VALUES(1)');
    });
  }
  preflight(){
    let schedule;try{schedule=scheduleConfig(this.env);}catch{return{status:'invalid_schedule_configuration'};}
    if(!schedule.enabled)return{status:'schedule_disabled'};
    const status=this.core.authorizationStatus();if(status!=='ready')return{status};
    const grant=this.core.config();
    if(grant.minimumRequestIntervalSeconds*1000<schedule.requestIntervalMilliseconds)return{status:'schedule_pacing_not_enforced_by_core'};
    try{this.core.validateScheduleReferences(schedule.scheduleReference);}catch{return{status:'invalid_schedule_configuration'};}
    if(INITIAL.some(op=>!grant.allowedOperations.includes(op)))return{status:'schedule_scope_not_granted'};
    if(`${grant.probeRound}:r:999:${schedule.scheduleReference}:8640000000000000:apple-history`.length>160)return{status:'schedule_job_key_too_long'};
    if(this.core.dailyCap(grant)<INITIAL.length)return{status:'operator_budget_too_small_for_initial_round'};
    return{status:'ready',schedule,grant};
  }
  plan(){
    const checked=this.preflight();if(checked.status!=='ready')return checked;
    const{schedule,grant}=checked;const now=this.core.clock();
    const snapshot=JSON.stringify(schedule);
    const existing=this.core.row('SELECT config_json,round_ref FROM api_alarm_plans WHERE schedule_ref=?',schedule.scheduleReference);
    if(existing&&(existing.config_json!==snapshot||existing.round_ref!==grant.probeRound))return{status:'schedule_reference_changed_requires_new_version'};
    this.core.enqueueProbeRound(grant.probeRound);
    return this.ctx.storage.transactionSync(()=>{
      let plan=this.core.row('SELECT * FROM api_alarm_plans WHERE schedule_ref=?',schedule.scheduleReference);
      if(plan&&(plan.config_json!==snapshot||plan.round_ref!==grant.probeRound))return{status:'schedule_reference_changed_requires_new_version'};
      if(!plan){
        this.core.sql.exec("INSERT INTO api_alarm_plans(schedule_ref,config_json,round_ref,started_at,target_at,phase) VALUES(?,?,?,?,?,'initial')",
          schedule.scheduleReference,snapshot,grant.probeRound,now,now+schedule.startupTargetSeconds*1000);
        plan=this.core.row('SELECT * FROM api_alarm_plans WHERE schedule_ref=?',schedule.scheduleReference);
      }
      const initialKeys=INITIAL.map((op,index)=>`${grant.probeRound}:${index}:${op}`);
      const rows=initialKeys.map(key=>this.core.row('SELECT * FROM api_jobs WHERE job_key=?',key));
      if(rows.some(row=>row?.state==='failed')){
        this.core.sql.exec("UPDATE api_alarm_plans SET phase='needs_review' WHERE schedule_ref=?",schedule.scheduleReference);
        return{status:'initial_permanent_failure_needs_review'};
      }
      if(plan.initial_complete_at===null&&rows.every(row=>row?.state==='complete')){
        const phase=schedule.recurring.length?'recurring_raw_only':'raw_probe_round_complete';
        this.core.sql.exec('UPDATE api_alarm_plans SET initial_complete_at=?,phase=? WHERE schedule_ref=?',now,phase,schedule.scheduleReference);
        for(const event of schedule.recurring)this.core.sql.exec(`INSERT OR IGNORE INTO api_alarm_events
          (schedule_ref,operation,interval_ms,priority,next_due) VALUES(?,?,?,?,?)`,
          schedule.scheduleReference,event.operation,event.intervalSeconds*1000,event.priority,now+event.intervalSeconds*1000);
        plan={...plan,initial_complete_at:now,phase};
      }
      if(plan.initial_complete_at!==null){
        const events=this.core.sql.exec('SELECT * FROM api_alarm_events WHERE schedule_ref=?',schedule.scheduleReference).toArray();
        for(const event of events){
          if(event.active_job_key){
            const active=this.core.row('SELECT state FROM api_jobs WHERE job_key=?',event.active_job_key);
            if(active?.state==='failed'){
              this.core.sql.exec("UPDATE api_alarm_plans SET phase='needs_review' WHERE schedule_ref=?",schedule.scheduleReference);
              return{status:'recurring_permanent_failure_needs_review'};
            }
            if(active?.state!=='complete')continue;
            this.core.sql.exec('UPDATE api_alarm_events SET active_job_key=NULL WHERE schedule_ref=? AND operation=?',schedule.scheduleReference,event.operation);
          }
          if(event.next_due>now)continue;
          const skipped=Math.floor((now-event.next_due)/event.interval_ms);
          const due=event.next_due+skipped*event.interval_ms;
          const key=`${grant.probeRound}:r:${String(event.priority).padStart(3,'0')}:${schedule.scheduleReference}:${due}:${event.operation}`;
          this.core.enqueueScheduledOperation({jobKey:key,operation:event.operation,availableAt:due});
          this.core.sql.exec(`UPDATE api_alarm_events SET active_job_key=?,next_due=?,skipped_intervals=skipped_intervals+?
            WHERE schedule_ref=? AND operation=?`,key,due+event.interval_ms,skipped,schedule.scheduleReference,event.operation);
        }
      }
      return{status:'ready',schedule,grant,plan};
    });
  }
  async stop(status){await this.ctx.storage.deleteAlarm();return{status,alarmScheduled:false};}
  storageGate(){
    const pending=this.core.row('SELECT pointer_pending FROM api_control WHERE id=1').pointer_pending;
    let state=this.core.row('SELECT * FROM api_alarm_storage WHERE id=1');
    // Recover a crash between raw success/outbox persistence and scheduler acknowledgement.
    if(pending&&state.blocked_until===0){
      this.core.sql.exec("UPDATE api_alarm_storage SET blocked_until=?,backoff_step=1,last_status='outbox_pending_recovery' WHERE id=1",this.core.clock()+30_000);
      state=this.core.row('SELECT * FROM api_alarm_storage WHERE id=1');
    }
    return state;
  }
  recordStorageResult(result){
    const pending=this.core.row('SELECT pointer_pending FROM api_control WHERE id=1').pointer_pending;
    if(pending||['private_storage_unavailable','private_pointer_pending'].includes(result.status)){
      const state=this.core.row('SELECT * FROM api_alarm_storage WHERE id=1');
      const step=Math.min(state.backoff_step+1,10),delay=Math.min(300_000,30_000*2**(step-1));
      this.core.sql.exec('UPDATE api_alarm_storage SET blocked_until=?,backoff_step=?,last_status=? WHERE id=1',
        this.core.clock()+delay,step,'private_outbox_retry');
    }else this.core.sql.exec('UPDATE api_alarm_storage SET blocked_until=0,backoff_step=0,last_status=NULL WHERE id=1');
  }
  async arm(checked,result={status:'scheduled'}){
    if(checked.status!=='ready')return{...result,...await this.stop(checked.status)};
    const control=this.core.row('SELECT * FROM api_control WHERE id=1');
    if(control.auth_stopped)return this.stop('authentication_stopped');
    const now=this.core.clock();const{schedule,grant}=checked;
    const pending=this.core.nextAttemptAt(grant);
    const event=this.core.row(`SELECT MIN(next_due) AS at FROM api_alarm_events
      WHERE schedule_ref=? AND active_job_key IS NULL`,schedule.scheduleReference).at;
    const storage=this.storageGate();
    const outbox=this.core.row('SELECT pointer_pending FROM api_control WHERE id=1').pointer_pending;
    const candidates=[pending,event,outbox?Math.max(now+1,storage.blocked_until):null].filter(value=>value!==null);
    if(!candidates.length)return{...result,...await this.stop('raw_probe_round_complete_no_recurring_work')};
    // Pace request STARTS, not response completion. Existing reservations/cooldowns stay authoritative.
    const latest=this.core.row('SELECT MAX(at) AS at FROM api_attempts').at;
    const pacing=latest===null?now+schedule.requestIntervalMilliseconds:latest+schedule.requestIntervalMilliseconds;
    const next=Math.max(now+1,pacing,storage.blocked_until,Math.min(...candidates));
    await this.ctx.storage.setAlarm(next);
    return{...result,alarmScheduled:true,nextAlarmAt:new Date(next).toISOString()};
  }
  async kick(){return this.arm(this.plan());}
  async alarm(){
    if(this.flight)return{status:'scheduler_busy'};
    this.flight=this.tick();try{return await this.flight;}finally{this.flight=null;}
  }
  async tick(){
    const checked=this.plan();if(checked.status!=='ready')return this.stop(checked.status);
    if(this.core.row('SELECT auth_stopped AS stopped FROM api_control WHERE id=1').stopped)return this.stop('authentication_stopped');
    const gate=this.storageGate();
    if(this.core.clock()<gate.blocked_until)return this.arm(checked,{status:'private_storage_backoff'});
    const result=await this.core.runOne();
    this.recordStorageResult(result);
    // Never swallow storage exceptions: native at-least-once alarm retry re-enters the same budget/lease gates.
    return this.arm(this.plan(),{...result,ownerRunStatus:result.status});
  }
  health(){
    const checked=this.preflight();if(checked.status!=='ready')return{status:checked.status};
    const plan=this.core.row('SELECT * FROM api_alarm_plans WHERE schedule_ref=?',checked.schedule.scheduleReference);
    if(!plan)return{status:'not_started'};
    const storage=this.core.row('SELECT * FROM api_alarm_storage WHERE id=1');
    return{status:plan.phase,privateStorageBackoffAt:storage.blocked_until?new Date(storage.blocked_until).toISOString():null,
      privateStorageBackoffStep:storage.backoff_step,startedAt:new Date(plan.started_at).toISOString(),startupTargetAt:new Date(plan.target_at).toISOString(),
      startupTargetMissed:plan.initial_complete_at===null&&this.core.clock()>plan.target_at,
      initialCompleteAt:plan.initial_complete_at===null?null:new Date(plan.initial_complete_at).toISOString(),
      events:this.core.sql.exec('SELECT operation,next_due,skipped_intervals FROM api_alarm_events WHERE schedule_ref=? ORDER BY priority,operation',checked.schedule.scheduleReference).toArray(),
      clockKind:'operator_scheduling_metadata_not_market_observation'};
  }
}
