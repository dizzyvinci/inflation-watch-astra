// Optional, explicitly configured alarms. Transport/budgets remain in the SAME core/owner.
const INITIAL=['status','prices','catalogue','overview','apple-detail','apple-history'];
const NX_RECURRING=['nx-rate','nx-history'];
const RECURRING=[...INITIAL,...NX_RECURRING];
const REF=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

// Strict parsing and byte hashing are opt-in only; legacy parser below is unchanged.
const CADENCE_TICKETS=new WeakMap(),CADENCE_OWNER='maplestory-market-account-primary-v1',CADENCE_PREFIX='cadence_superseded:';
function cadenceNeed(ok,code){if(!ok)throw new TypeError(code);}
function cadenceJson(raw,cap=16384){
 cadenceNeed(typeof raw==='string'&&new TextEncoder().encode(raw).length<=cap,'cadence_json_bound');let i=0,nodes=0;
 const ws=()=>{while(/[\x20\t\r\n]/.test(raw[i]??'x'))i++;};
 function string(){const start=i++;for(;i<raw.length;i++){if(raw[i]==='\\'){i++;continue;}if(raw[i]==='"'){i++;return JSON.parse(raw.slice(start,i));}}throw TypeError('cadence_json_string');}
 function value(depth){cadenceNeed(depth<=16&&++nodes<=256,'cadence_json_depth');ws();const c=raw[i];if(c==='"'){string();return;}if(c==='{'){i++;ws();const keys=new Set();if(raw[i]==='}'){i++;return;}while(true){cadenceNeed(raw[i]==='"','cadence_json_key');const k=string();cadenceNeed(!keys.has(k),'cadence_duplicate_key');keys.add(k);ws();cadenceNeed(raw[i++]===':','cadence_json_colon');value(depth+1);ws();if(raw[i]==='}'){i++;return;}cadenceNeed(raw[i++ ]===',','cadence_json_comma');ws();}}if(c==='['){i++;ws();if(raw[i]===']'){i++;return;}while(true){value(depth+1);ws();if(raw[i]===']'){i++;return;}cadenceNeed(raw[i++ ]===',','cadence_json_comma');}}const m=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(raw.slice(i));cadenceNeed(m,'cadence_json_value');i+=m[0].length;}
 value(0);ws();cadenceNeed(i===raw.length,'cadence_json_trailing');return JSON.parse(raw);
}
function cadenceKeys(v,keys,code){cadenceNeed(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(','),code);}
function cadenceBaseText(raw){const v=cadenceJson(raw,4096);cadenceKeys(v,['enabled','scheduleReference','requestIntervalMilliseconds','startupTargetSeconds','recurring'],'cadence_base_keys');cadenceNeed(v.enabled===true,'cadence_enabled');for(const r of v.recurring??[])cadenceKeys(r,['operation','intervalSeconds','priority'],'cadence_row_keys');return legacyScheduleConfig({API_SCHEDULE_JSON:raw});}
export function scheduleConfig(env){
 const raw=env.API_SCHEDULE_JSON;
 if(typeof raw!=='string'||!raw.includes('deadlinePreservingMigration'))return legacyScheduleConfig(env);
 const loose=JSON.parse(raw);if(loose?.enabled!==true||!Object.hasOwn(loose,'deadlinePreservingMigration'))return legacyScheduleConfig(env);
 const outer=cadenceJson(raw);cadenceKeys(outer,['enabled','scheduleReference','requestIntervalMilliseconds','startupTargetSeconds','recurring','deadlinePreservingMigration'],'cadence_outer_keys');const d=outer.deadlinePreservingMigration;
 cadenceKeys(d,['schemaVersion','migrationReference','sourceConfiguration','targetConfiguration','sourceConfigSha256','targetConfigSha256'],'cadence_descriptor_keys');cadenceNeed(d.schemaVersion===1&&typeof d.migrationReference==='string'&&REF.test(d.migrationReference)&&typeof d.sourceConfigSha256==='string'&&/^[a-f0-9]{64}$/.test(d.sourceConfigSha256)&&typeof d.targetConfigSha256==='string'&&/^[a-f0-9]{64}$/.test(d.targetConfigSha256),'cadence_descriptor');
 const source=cadenceBaseText(d.sourceConfiguration),target=cadenceBaseText(d.targetConfiguration),base={...outer};delete base.deadlinePreservingMigration;const actual=legacyScheduleConfig({API_SCHEDULE_JSON:JSON.stringify(base)});
 cadenceNeed(JSON.stringify(actual)===JSON.stringify(target)&&source.scheduleReference!==target.scheduleReference&&/(?:[.:-])v[1-9][0-9]{0,5}$/.test(target.scheduleReference)&&/(?:[.:-])v[1-9][0-9]{0,5}$/.test(d.migrationReference)&&source.requestIntervalMilliseconds===2500&&target.requestIntervalMilliseconds===2500&&source.startupTargetSeconds===target.startupTargetSeconds&&source.recurring.length===target.recurring.length,'cadence_target_or_scope');
 let changes=0;for(let i=0;i<source.recurring.length;i++){const a=source.recurring[i],b=target.recurring[i];cadenceNeed(a.operation===b.operation&&a.priority===b.priority,'cadence_operation_or_priority');if(a.operation==='prices'){cadenceNeed(a.intervalSeconds===300&&b.intervalSeconds===60,'cadence_prices');changes++;}else if(a.operation==='overview'){cadenceNeed(a.intervalSeconds===900&&b.intervalSeconds===300,'cadence_overview');changes++;}else cadenceNeed(a.intervalSeconds===b.intervalSeconds,'cadence_other_interval');}cadenceNeed(changes===2,'cadence_both_intervals');
 CADENCE_TICKETS.set(actual,{raw,descriptor:JSON.stringify(d),d,source,target});return actual;
}
function cadencePlan(core,ref){return core.row(`SELECT schedule_ref,CASE WHEN typeof(config_json)='text' AND length(CAST(config_json AS BLOB))<=4096 THEN config_json END config_json,CASE WHEN typeof(round_ref)='text' AND length(CAST(round_ref AS BLOB))<=160 THEN round_ref END round_ref,CASE WHEN typeof(started_at)='integer' AND started_at>=0 AND started_at<=8639999999999999 THEN started_at ELSE -1 END started_at,CASE WHEN typeof(target_at)='integer' AND target_at>=0 AND target_at<=8639999999999999 THEN target_at ELSE -1 END target_at,CASE WHEN typeof(initial_complete_at)='integer' AND initial_complete_at>=0 AND initial_complete_at<=8639999999999999 THEN initial_complete_at ELSE -1 END initial_complete_at,CASE WHEN typeof(phase)='text' AND length(CAST(phase AS BLOB))<=128 THEN phase END phase FROM api_alarm_plans WHERE schedule_ref=?`,ref);}
function cadenceEvents(core,ref){return core.sql.exec(`SELECT schedule_ref,CASE WHEN typeof(operation)='text' AND length(CAST(operation AS BLOB))<=64 THEN operation END operation,CASE WHEN typeof(interval_ms)='integer' AND interval_ms>=0 AND interval_ms<=86400000 THEN interval_ms ELSE -1 END interval_ms,CASE WHEN typeof(priority)='integer' AND priority>=0 AND priority<=999 THEN priority ELSE -1 END priority,CASE WHEN typeof(next_due)='integer' AND next_due>=0 AND next_due<=8639999999999999 THEN next_due ELSE -1 END next_due,CASE WHEN active_job_key IS NULL THEN NULL WHEN typeof(active_job_key)='text' AND length(CAST(active_job_key AS BLOB))<=160 THEN active_job_key ELSE 0 END active_job_key,CASE WHEN typeof(skipped_intervals)='integer' AND skipped_intervals>=0 AND skipped_intervals<=9007199254740991 THEN skipped_intervals ELSE -1 END skipped_intervals FROM api_alarm_events WHERE schedule_ref=? ORDER BY operation LIMIT 9`,ref).toArray();}
function cadenceActive(core,e,grant,refs){if(e.active_job_key===null)return;cadenceNeed(typeof e.active_job_key==='string'&&e.active_job_key.length<=160,'cadence_active_key');let bound=false;for(const ref of refs){const a=`${grant.probeRound}:r:${String(e.priority).padStart(3,'0')}:${ref}:`,z=':'+e.operation;if(e.active_job_key.startsWith(a)&&e.active_job_key.endsWith(z)){const at=e.active_job_key.slice(a.length,-z.length);bound=/^(?:0|[1-9][0-9]{0,15})$/.test(at)&&Number.isSafeInteger(Number(at))&&Number(at)<8640000000000000;}}cadenceNeed(bound,'cadence_active_key');const j=core.row('SELECT operation,round_ref,state,lease_until,attempt_id,attempts FROM api_jobs WHERE job_key=?',e.active_job_key);cadenceNeed(j&&j.operation===e.operation&&j.round_ref===grant.probeRound&&['pending','running','complete'].includes(j.state)&&Number.isSafeInteger(j.attempts)&&j.attempts>=0,'cadence_active_job');if(j.state==='running')cadenceNeed(Number.isSafeInteger(j.lease_until)&&j.lease_until>=0&&j.lease_until<8640000000000000&&Number.isSafeInteger(j.attempt_id)&&j.attempt_id>0,'cadence_running_lease');if(j.attempts>0){const a=core.row('SELECT grant_ref FROM api_attempts WHERE job_key=? ORDER BY id DESC LIMIT 1',e.active_job_key);cadenceNeed(a?.grant_ref===grant.grantReference,'cadence_active_grant');}}
async function cadenceSha(text){for(const c of text){const p=c.codePointAt(0);cadenceNeed(p<0xd800||p>0xdfff,'cadence_utf8');}return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function hasDeadlineMigration(env){try{const raw=env.API_SCHEDULE_JSON;if(typeof raw!=='string'||!raw.includes('deadlinePreservingMigration'))return false;const v=JSON.parse(raw);return v?.enabled===true&&Object.hasOwn(v,'deadlinePreservingMigration');}catch{return false;}}

function legacyScheduleConfig(env){
  if(!env.API_SCHEDULE_JSON)return{enabled:false};
  const input=JSON.parse(env.API_SCHEDULE_JSON);
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.enabled!=='boolean')throw new TypeError('Invalid schedule');
  if(!input.enabled)return{enabled:false};
  if(Object.keys(input).some(key=>!['enabled','scheduleReference','requestIntervalMilliseconds','startupTargetSeconds','recurring'].includes(key)))throw new TypeError('Unknown schedule field');
  if(!REF.test(input.scheduleReference??''))throw new TypeError('Nonsecret schedule reference required');
  if(!Number.isSafeInteger(input.requestIntervalMilliseconds)||input.requestIntervalMilliseconds<2500||input.requestIntervalMilliseconds>86_400_000)throw new TypeError('Pacing minimum is2500ms');
  if(!Number.isSafeInteger(input.startupTargetSeconds)||input.startupTargetSeconds<1||input.startupTargetSeconds>86_400)throw new TypeError('Explicit startup target required');
  if(!Array.isArray(input.recurring)||input.recurring.length>RECURRING.length)throw new TypeError('Bounded recurring plan required');
  const seen=new Set();
  const recurring=input.recurring.map(row=>{
    if(!row||Object.keys(row).sort().join(',')!=='intervalSeconds,operation,priority'||!RECURRING.includes(row.operation)||seen.has(row.operation))throw new TypeError('Unreviewed recurring operation');
    seen.add(row.operation);
    if(!Number.isSafeInteger(row.intervalSeconds)||row.intervalSeconds*1000<input.requestIntervalMilliseconds||row.intervalSeconds>86400||!Number.isSafeInteger(row.priority)||row.priority<0||row.priority>999)throw new TypeError('Invalid recurring cadence');
    return{operation:row.operation,intervalSeconds:row.intervalSeconds,priority:row.priority};
  }).sort((a,b)=>a.operation.localeCompare(b.operation));
  return{enabled:true,scheduleReference:input.scheduleReference,requestIntervalMilliseconds:input.requestIntervalMilliseconds,
    startupTargetSeconds:input.startupTargetSeconds,recurring};
}

export class ApiAlarmScheduler{
  constructor(ctx,env,core,{alarmControl=ctx.storage,firstPass=null,recurring=null}={}){
    this.ctx=ctx;this.env=env;this.core=core;this.flight=null;this.alarmControl=alarmControl;this.firstPass=firstPass;this.recurring=recurring;
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
  async prepareDeadlinePreservingMigration(){
    let schedule;try{schedule=scheduleConfig(this.env);}catch{return{status:'invalid_schedule_configuration'};}
    const ticket=CADENCE_TICKETS.get(schedule);if(!ticket)return null;
    const checked=this.preflight(true);if(checked.status!=='ready')return checked;
    const grant=checked.grant,grantBytes=JSON.stringify(grant),raw=ticket.raw;this.cadencePrepared=null;
    const control=this.core.row('SELECT * FROM api_control WHERE id=1');if(control.auth_stopped)return{status:'authentication_stopped'};
    try{
      cadenceNeed(this.core.ctx?.storage===this.ctx.storage&&this.core.env===this.env&&grant.grantedPerMinute===30&&grant.grantedPerDay===null&&grant.operatorDailyRequestCap===30000&&grant.minimumRequestIntervalSeconds===2.5,'cadence_owner_or_grant');
      for(const ref of [ticket.d.migrationReference,ticket.source.scheduleReference,ticket.target.scheduleReference])this.core.validateScheduleReferences(ref);
      cadenceNeed(await cadenceSha(ticket.d.sourceConfiguration)===ticket.d.sourceConfigSha256&&await cadenceSha(ticket.d.targetConfiguration)===ticket.d.targetConfigSha256,'cadence_original_hash');
      const old=cadencePlan(this.core,ticket.source.scheduleReference);cadenceNeed(old&&old.config_json===JSON.stringify(ticket.source)&&old.round_ref===grant.probeRound,'cadence_source_snapshot');const storedSha=await cadenceSha(old.config_json);
      const fence=()=>{const auth=this.core.authorizationStatus(),currentGrant=JSON.stringify(this.core.config());cadenceNeed(auth==='ready'&&currentGrant===grantBytes&&this.env.API_SCHEDULE_JSON===raw,'cadence_scope_changed');};fence();
      const latest=this.core.row('SELECT auth_stopped FROM api_control WHERE id=1');if(latest.auth_stopped)return{status:'authentication_stopped'};
      this.ctx.storage.transactionSync(()=>{
        fence();const c=this.core.row('SELECT auth_stopped FROM api_control WHERE id=1');cadenceNeed(!c.auth_stopped,'cadence_paused');
        const present=this.core.row("SELECT 1 n FROM sqlite_master WHERE type='table' AND name='api_alarm_cadence_migration'");const prior=present?this.core.row("SELECT CASE WHEN typeof(migration_ref)='text' AND length(CAST(migration_ref AS BLOB))<=64 THEN migration_ref END migration_ref,CASE WHEN typeof(owner_name)='text' AND length(CAST(owner_name AS BLOB))<=128 THEN owner_name END owner_name,CASE WHEN typeof(grant_ref)='text' AND length(CAST(grant_ref AS BLOB))<=160 THEN grant_ref END grant_ref,CASE WHEN typeof(round_ref)='text' AND length(CAST(round_ref AS BLOB))<=160 THEN round_ref END round_ref,CASE WHEN typeof(source_ref)='text' AND length(CAST(source_ref AS BLOB))<=64 THEN source_ref END source_ref,CASE WHEN typeof(target_ref)='text' AND length(CAST(target_ref AS BLOB))<=64 THEN target_ref END target_ref,CASE WHEN typeof(descriptor_json)='text' AND length(CAST(descriptor_json AS BLOB))<=16384 THEN descriptor_json END descriptor_json,CASE WHEN typeof(source_supplied_text_sha)='text' AND length(CAST(source_supplied_text_sha AS BLOB))<=64 THEN source_supplied_text_sha END source_supplied_text_sha,CASE WHEN typeof(target_supplied_text_sha)='text' AND length(CAST(target_supplied_text_sha AS BLOB))<=64 THEN target_supplied_text_sha END target_supplied_text_sha,CASE WHEN typeof(source_snapshot_sha)='text' AND length(CAST(source_snapshot_sha AS BLOB))<=64 THEN source_snapshot_sha END source_snapshot_sha FROM api_alarm_cadence_migration WHERE id=1"):null;
        if(prior){cadenceNeed(prior.migration_ref===ticket.d.migrationReference&&prior.descriptor_json===ticket.descriptor&&prior.owner_name===CADENCE_OWNER&&prior.grant_ref===grant.grantReference&&prior.round_ref===grant.probeRound&&prior.source_snapshot_sha===storedSha,'cadence_replay_conflict');const target=cadencePlan(this.core,ticket.target.scheduleReference);cadenceNeed(target?.config_json===JSON.stringify(ticket.target)&&target.round_ref===grant.probeRound&&old.phase===CADENCE_PREFIX+ticket.d.migrationReference&&prior.source_ref===ticket.source.scheduleReference&&prior.target_ref===ticket.target.scheduleReference&&prior.source_supplied_text_sha===ticket.d.sourceConfigSha256&&prior.target_supplied_text_sha===ticket.d.targetConfigSha256,'cadence_replay_state');const events=cadenceEvents(this.core,ticket.target.scheduleReference);cadenceNeed(events.length===ticket.target.recurring.length,'cadence_replay_events');for(let i=0;i<events.length;i++){const e=events[i],r=ticket.target.recurring[i],marker=this.core.row(`SELECT CASE WHEN cadence_inherited_due IS NULL THEN NULL WHEN typeof(cadence_inherited_due)='integer' AND cadence_inherited_due>=0 AND cadence_inherited_due<8640000000000000 THEN cadence_inherited_due ELSE -1 END cadence_inherited_due,CASE WHEN cadence_target_interval_ms IS NULL THEN NULL WHEN typeof(cadence_target_interval_ms)='integer' AND cadence_target_interval_ms>=2500 AND cadence_target_interval_ms<=86400000 THEN cadence_target_interval_ms ELSE -1 END cadence_target_interval_ms,CASE WHEN typeof(cadence_migration_ref)='text' AND length(CAST(cadence_migration_ref AS BLOB))<=64 THEN cadence_migration_ref END cadence_migration_ref FROM api_alarm_events WHERE schedule_ref=? AND operation=?`,ticket.target.scheduleReference,e.operation);cadenceNeed(e.operation===r.operation&&e.priority===r.priority&&Number.isSafeInteger(e.next_due)&&e.next_due>=0&&e.next_due<8640000000000000&&Number.isSafeInteger(e.skipped_intervals)&&e.skipped_intervals>=0&&marker?.cadence_migration_ref===ticket.d.migrationReference,'cadence_replay_events');if(marker.cadence_inherited_due===null)cadenceNeed(marker.cadence_target_interval_ms===null&&e.interval_ms===r.intervalSeconds*1000,'cadence_replay_consumed');else cadenceNeed(marker.cadence_inherited_due===e.next_due&&marker.cadence_target_interval_ms===r.intervalSeconds*1000&&e.interval_ms===ticket.source.recurring[i].intervalSeconds*1000,'cadence_replay_pending');cadenceActive(this.core,e,grant,[ticket.source.scheduleReference,ticket.target.scheduleReference]);}fence();return;}
        cadenceNeed(!this.core.row('SELECT 1 n FROM api_alarm_plans WHERE schedule_ref=?',ticket.target.scheduleReference),'cadence_target_exists');
        const source=cadencePlan(this.core,ticket.source.scheduleReference);cadenceNeed(source?.config_json===old.config_json&&source.round_ref===grant.probeRound&&source.phase==='recurring_raw_only'&&Number.isSafeInteger(source.initial_complete_at)&&source.initial_complete_at>=source.started_at&&Number.isSafeInteger(source.started_at)&&source.started_at>=0&&Number.isSafeInteger(source.target_at)&&source.target_at>=source.started_at&&source.target_at<8640000000000000,'cadence_source_state');cadenceNeed(!this.core.row('SELECT 1 n FROM api_alarm_plans WHERE schedule_ref=?',ticket.target.scheduleReference),'cadence_target_exists');
        const events=cadenceEvents(this.core,ticket.source.scheduleReference);cadenceNeed(events.length===ticket.source.recurring.length&&events.length<=8,'cadence_event_count');
        const finite=t=>Number.isSafeInteger(t)&&t>=0&&t<8640000000000000;
        for(let i=0;i<events.length;i++){const e=events[i],r=ticket.source.recurring[i];cadenceNeed(e.operation===r.operation&&e.interval_ms===r.intervalSeconds*1000&&e.priority===r.priority&&finite(e.next_due)&&Number.isSafeInteger(e.skipped_intervals)&&e.skipped_intervals>=0&&finite(e.next_due+ticket.target.recurring[i].intervalSeconds*1000),'cadence_event_state');cadenceActive(this.core,e,grant,[ticket.source.scheduleReference]);}
        for(let i=0;i<INITIAL.length;i++){const key=`${grant.probeRound}:${i}:${INITIAL[i]}`,r=this.core.row("SELECT j.state,j.round_ref,a.grant_ref FROM api_jobs j JOIN api_attempts a ON a.job_key=j.job_key WHERE j.job_key=? AND a.result='success' ORDER BY a.id DESC LIMIT 1",key);cadenceNeed(r?.state==='complete'&&r.round_ref===grant.probeRound&&r.grant_ref===grant.grantReference,'cadence_original_grant');}
        this.core.sql.exec(`CREATE TABLE api_alarm_cadence_migration(id INTEGER PRIMARY KEY CHECK(id=1),migration_ref TEXT NOT NULL,owner_name TEXT NOT NULL,grant_ref TEXT NOT NULL,round_ref TEXT NOT NULL,source_ref TEXT NOT NULL,target_ref TEXT NOT NULL,descriptor_json TEXT NOT NULL,source_supplied_text_sha TEXT NOT NULL,target_supplied_text_sha TEXT NOT NULL,source_snapshot_sha TEXT NOT NULL,source_plan_json TEXT NOT NULL,source_events_json TEXT NOT NULL)`);
        for(const [name,type]of[['cadence_inherited_due','INTEGER'],['cadence_target_interval_ms','INTEGER'],['cadence_migration_ref','TEXT']])this.core.sql.exec(`ALTER TABLE api_alarm_events ADD COLUMN ${name} ${type}`);
        this.core.sql.exec('INSERT INTO api_alarm_cadence_migration VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?)',ticket.d.migrationReference,CADENCE_OWNER,grant.grantReference,grant.probeRound,ticket.source.scheduleReference,ticket.target.scheduleReference,ticket.descriptor,ticket.d.sourceConfigSha256,ticket.d.targetConfigSha256,storedSha,JSON.stringify(source),JSON.stringify(events));
        this.core.sql.exec('INSERT INTO api_alarm_plans VALUES(?,?,?,?,?,?,?)',ticket.target.scheduleReference,JSON.stringify(ticket.target),grant.probeRound,source.started_at,source.target_at,source.initial_complete_at,source.phase);
        for(let i=0;i<events.length;i++){const e=events[i];this.core.sql.exec('INSERT INTO api_alarm_events(schedule_ref,operation,interval_ms,priority,next_due,active_job_key,skipped_intervals,cadence_inherited_due,cadence_target_interval_ms,cadence_migration_ref) VALUES(?,?,?,?,?,?,?,?,?,?)',ticket.target.scheduleReference,e.operation,e.interval_ms,e.priority,e.next_due,e.active_job_key,e.skipped_intervals,e.next_due,ticket.target.recurring[i].intervalSeconds*1000,ticket.d.migrationReference);}
        this.core.sql.exec('UPDATE api_alarm_plans SET phase=? WHERE schedule_ref=?',CADENCE_PREFIX+ticket.d.migrationReference,ticket.source.scheduleReference);fence();
      });
      this.cadencePrepared={raw,descriptor:ticket.descriptor,grantBytes};return{status:'cadence_migration_ready'};
    }catch{return{status:'cadence_migration_review_required'};}
  }

  selectedCadenceStatus(schedule,ticket,grant){
    const table=this.core.row("SELECT 1 n FROM sqlite_master WHERE type='table' AND name='api_alarm_cadence_migration'");if(!table)return null;
    try{
      const fields=[['migration_ref',64],['owner_name',128],['grant_ref',160],['round_ref',160],['source_ref',64],['target_ref',64],['descriptor_json',16384]],projection=fields.map(([name,cap])=>`CASE WHEN typeof(${name})='text' AND length(CAST(${name} AS BLOB))<=${cap} THEN ${name} END ${name}`).join(',');
      const installed=this.core.row(`SELECT ${projection} FROM api_alarm_cadence_migration WHERE id=1`);
      cadenceNeed(installed&&installed.owner_name===CADENCE_OWNER&&installed.grant_ref===grant.grantReference&&installed.round_ref===grant.probeRound&&REF.test(installed.source_ref??'')&&REF.test(installed.target_ref??'')&&REF.test(installed.migration_ref??''),'cadence_selected_identity');
      const target=cadencePlan(this.core,installed.target_ref),source=cadencePlan(this.core,installed.source_ref);
      cadenceNeed(target&&target.round_ref===grant.probeRound&&source?.round_ref===grant.probeRound&&source.phase===CADENCE_PREFIX+installed.migration_ref,'cadence_selected_state');
      const descriptor=cadenceJson(installed.descriptor_json),replay=scheduleConfig({API_SCHEDULE_JSON:JSON.stringify({...cadenceJson(descriptor.targetConfiguration,4096),deadlinePreservingMigration:descriptor})}),admitted=CADENCE_TICKETS.get(replay);
      cadenceNeed(admitted&&admitted.d.migrationReference===installed.migration_ref&&admitted.source.scheduleReference===installed.source_ref&&admitted.target.scheduleReference===installed.target_ref&&JSON.stringify(admitted.source)===source.config_json&&JSON.stringify(admitted.target)===target.config_json,'cadence_selected_canonical');
      if(!ticket&&schedule.scheduleReference===installed.source_ref&&JSON.stringify(schedule)===source.config_json)return'schedule_reference_superseded_requires_target';
      cadenceNeed(schedule.scheduleReference===installed.target_ref&&JSON.stringify(schedule)===target.config_json,'cadence_selected_target');
      if(ticket)cadenceNeed(ticket.descriptor===installed.descriptor_json&&ticket.d.migrationReference===installed.migration_ref&&ticket.source.scheduleReference===installed.source_ref,'cadence_selected_descriptor');
      if(this.core.row('SELECT auth_stopped FROM api_control WHERE id=1').auth_stopped)return'authentication_stopped';
      return'ready';
    }catch{return ticket?'cadence_migration_review_required':'cadence_selected_lineage_requires_review';}
  }

  preflight(forCadenceAdmission=false){
    let schedule;try{schedule=scheduleConfig(this.env);}catch{return{status:'invalid_schedule_configuration'};}
    if(!schedule.enabled)return{status:'schedule_disabled'};
    const status=this.core.authorizationStatus();if(status!=='ready')return{status};
    const grant=this.core.config();
    const ticket=CADENCE_TICKETS.get(schedule),selected=this.selectedCadenceStatus(schedule,ticket,grant);if(selected&&selected!=='ready')return{status:selected};
    if(ticket&&!forCadenceAdmission){const p=this.cadencePrepared;if(!p||p.raw!==ticket.raw||p.descriptor!==ticket.descriptor||p.grantBytes!==JSON.stringify(grant))return{status:'cadence_migration_requires_owned_admission'};}
    if(grant.minimumRequestIntervalSeconds*1000<schedule.requestIntervalMilliseconds)return{status:'schedule_pacing_not_enforced_by_core'};
    try{this.core.validateScheduleReferences(schedule.scheduleReference);}catch{return{status:'invalid_schedule_configuration'};}
    if(INITIAL.some(op=>!grant.allowedOperations.includes(op)))return{status:'schedule_scope_not_granted'};
    if(schedule.recurring.some(row=>NX_RECURRING.includes(row.operation))&&(grant.nxSchemaProbesEnabled!==true||NX_RECURRING.some(op=>!grant.allowedOperations.includes(op))))return{status:'nx_recurring_scope_not_granted'};
    if(`${grant.probeRound}:r:999:${schedule.scheduleReference}:8640000000000000:apple-history`.length>160)return{status:'schedule_job_key_too_long'};
    if(this.core.dailyCap(grant)<INITIAL.length)return{status:'operator_budget_too_small_for_initial_round'};
    return{status:'ready',schedule,grant};
  }
  plan(){
    const checked=this.preflight();if(checked.status!=='ready')return checked;
    const{schedule,grant}=checked;const now=this.core.clock();
    const snapshot=JSON.stringify(schedule);
    const existing=this.core.row('SELECT config_json,round_ref,phase FROM api_alarm_plans WHERE schedule_ref=?',schedule.scheduleReference);
    if(existing?.phase?.startsWith(CADENCE_PREFIX))return{status:'schedule_reference_superseded_requires_target'};
    if(existing&&(existing.config_json!==snapshot||existing.round_ref!==grant.probeRound))return{status:'schedule_reference_changed_requires_new_version'};
    this.core.enqueueProbeRound(grant.probeRound);
    const firstPass=this.firstPass?.enqueueChunk(this.core);
    if(firstPass&&! ['firstpass_disabled','firstpass_chunk_ready','firstpass_complete'].includes(firstPass.status))return firstPass;
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
        for(const event of schedule.recurring.filter(row=>!NX_RECURRING.includes(row.operation)))this.core.sql.exec(`INSERT OR IGNORE INTO api_alarm_events
          (schedule_ref,operation,interval_ms,priority,next_due) VALUES(?,?,?,?,?)`,
          schedule.scheduleReference,event.operation,event.intervalSeconds*1000,event.priority,now+event.intervalSeconds*1000);
        plan={...plan,initial_complete_at:now,phase};
      }
      if(plan.initial_complete_at!==null){
        // Capability identities6/7 must BOTH complete before NX recurring events exist.
        if(this.core.nxSchemaProbeState(grant).status==='complete')for(const event of schedule.recurring.filter(row=>NX_RECURRING.includes(row.operation)))this.core.sql.exec(`INSERT OR IGNORE INTO api_alarm_events
          (schedule_ref,operation,interval_ms,priority,next_due) VALUES(?,?,?,?,?)`,
          schedule.scheduleReference,event.operation,event.intervalSeconds*1000,event.priority,now+event.intervalSeconds*1000);
        const events=this.core.sql.exec('SELECT * FROM api_alarm_events WHERE schedule_ref=?',schedule.scheduleReference).toArray();
        for(const event of events){
          const inherited=event.cadence_inherited_due!==undefined&&event.cadence_inherited_due!==null;
          if(inherited){const target=schedule.recurring.find(r=>r.operation===event.operation);if(!target||event.cadence_inherited_due!==event.next_due||!Number.isSafeInteger(event.next_due)||event.next_due<0||event.next_due>=8640000000000000||!Number.isSafeInteger(event.interval_ms)||event.interval_ms<2500||event.interval_ms>86400000||event.cadence_target_interval_ms!==target.intervalSeconds*1000||!REF.test(event.cadence_migration_ref??''))return{status:'cadence_inherited_deadline_review'};}
          else if(event.cadence_target_interval_ms!==undefined&&event.cadence_target_interval_ms!==null)return{status:'cadence_inherited_deadline_review'};
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
          const skipped=inherited?0:Math.floor((now-event.next_due)/event.interval_ms);
          const due=inherited?event.next_due:event.next_due+skipped*event.interval_ms;
          const key=`${grant.probeRound}:r:${String(event.priority).padStart(3,'0')}:${schedule.scheduleReference}:${due}:${event.operation}`;
          this.core.enqueueScheduledOperation({jobKey:key,operation:event.operation,availableAt:due});
          if(inherited)this.core.sql.exec(`UPDATE api_alarm_events SET active_job_key=?,next_due=?,interval_ms=?,cadence_inherited_due=NULL,cadence_target_interval_ms=NULL WHERE schedule_ref=? AND operation=?`,key,due+event.cadence_target_interval_ms,event.cadence_target_interval_ms,schedule.scheduleReference,event.operation);
          else this.core.sql.exec(`UPDATE api_alarm_events SET active_job_key=?,next_due=?,skipped_intervals=skipped_intervals+?
            WHERE schedule_ref=? AND operation=?`,key,due+event.interval_ms,skipped,schedule.scheduleReference,event.operation);
        }
      }
      return{status:'ready',schedule,grant,plan};
    });
  }
  async stop(status){await this.alarmControl.deleteAlarm();return{status,alarmScheduled:false};}
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
    const candidates=[pending,event,this.recurring?.nextProviderDue()??null,outbox?Math.max(now+1,storage.blocked_until):null].filter(value=>value!==null);
    if(!candidates.length)return{...result,...await this.stop('raw_probe_round_complete_no_recurring_work')};
    // Pace request STARTS, not response completion. Existing reservations/cooldowns stay authoritative.
    const latest=this.core.row('SELECT MAX(at) AS at FROM api_attempts').at;
    const pacing=latest===null?now+schedule.requestIntervalMilliseconds:latest+schedule.requestIntervalMilliseconds;
    const next=Math.max(now+1,pacing,storage.blocked_until,Math.min(...candidates));
    await this.alarmControl.setAlarm(next);
    return{...result,alarmScheduled:true,nextAlarmAt:new Date(next).toISOString()};
  }
  async kick(){if(hasDeadlineMigration(this.env)){const m=await this.prepareDeadlinePreservingMigration();if(m&&m.status!=='cadence_migration_ready')return this.stop(m.status);}const checked=this.plan();if(checked.status==='ready')this.recurring?.enqueueDue(8);return this.arm(checked);}
  async alarm(){
    if(this.flight)return{status:'scheduler_busy'};
    this.flight=this.tick();try{return await this.flight;}finally{this.flight=null;}
  }
  async tick(){
    if(hasDeadlineMigration(this.env)){const m=await this.prepareDeadlinePreservingMigration();if(m&&m.status!=='cadence_migration_ready')return this.stop(m.status);}
    const checked=this.plan();if(checked.status!=='ready')return this.stop(checked.status);
    if(this.core.row('SELECT auth_stopped AS stopped FROM api_control WHERE id=1').stopped)return this.stop('authentication_stopped');
    this.recurring?.enqueueDue(8);
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
