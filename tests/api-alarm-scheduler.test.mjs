import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ApiCollectorCore,PRIVATE_PREFIX} from '../ops/api-collector-core.mjs';
import {ApiAlarmScheduler,scheduleConfig} from '../ops/api-alarm-scheduler.mjs';
import {maybeRunApprovedApiSchemaProbe} from '../ops/api-cron-hook.mjs';

const KEY='SYNTHETIC-ALARM-TEST-KEY';
const START=Date.parse('2026-11-05T00:00:00Z');
const OPS=['status','prices','catalogue','overview','apple-detail','apple-history'];
const GRANT={enabled:true,approvalRecorded:true,exclusiveAccountOwnerConfirmed:true,
  grantReference:'synthetic-grant',grantedPerMinute:30,grantedPerDay:null,operatorDailyRequestCap:1000,
  minimumRequestIntervalSeconds:2.5,higherFrequencyExplicitlyGranted:true,
  allowedOperations:OPS,probeRound:'synthetic-r1',publicationEnabled:false};
const SCHEDULE={enabled:true,scheduleReference:'synthetic-s1',requestIntervalMilliseconds:2500,
  startupTargetSeconds:21600,recurring:[]};

function fixture(t,{grant=GRANT,schedule=SCHEDULE,key=KEY}={}){
  const directory=mkdtempSync(path.join(tmpdir(),'astra-alarm-test-'));const file=path.join(directory,'private.sqlite');
  let db,core,scheduler;const now=[START],calls=[],objects=new Map();let sequence=0;
  let respond=async()=>new Response('{}',{headers:{'content-type':'application/json'}});
  let failPointer=false;
  const bucket={async get(key){const row=objects.get(key);return row?{etag:row.etag,json:async()=>JSON.parse(row.body)}:null;},
    async put(key,body,opts){if(failPointer&&key.endsWith('/last-good.json'))throw new Error('Synthetic pointer storage failure');
      const old=objects.get(key),cond=opts?.onlyIf;
      if(cond?.etagDoesNotMatch==='*'&&old||cond?.etagMatches&&cond.etagMatches!==old?.etag)return null;
      const row={body,etag:String(++sequence)};objects.set(key,row);return row;}};
  const env={API_GRANT_JSON:JSON.stringify(grant),API_SCHEDULE_JSON:JSON.stringify(schedule),API_RAW_RECEIPTS:bucket};
  if(key!==null)env.MAPLESTORY_MARKET_APPROVED_API_KEY=key;
  let storage;
  function open(){
    db=new DatabaseSync(file);db.exec('CREATE TABLE IF NOT EXISTS test_alarm(id INTEGER PRIMARY KEY,time INTEGER)');
    db.exec('INSERT OR IGNORE INTO test_alarm(id,time) VALUES(1,NULL)');
    storage={sql:{exec(sql,...args){const s=db.prepare(sql);const rows=s.columns().length?s.all(...args):(s.run(...args),[]);return{toArray:()=>rows};}},
      transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}},
      async setAlarm(value){db.prepare('UPDATE test_alarm SET time=? WHERE id=1').run(value);},
      async getAlarm(){return db.prepare('SELECT time FROM test_alarm WHERE id=1').get().time;},
      async deleteAlarm(){db.prepare('UPDATE test_alarm SET time=NULL WHERE id=1').run();}};
    core=new ApiCollectorCore({storage},env,{now:()=>now[0],jitter:()=>0,fetcher:async(url,options)=>{
      calls.push({url,at:now[0],options});return respond(url,options);}});
    scheduler=new ApiAlarmScheduler({storage},env,core);
  }
  open();t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
  return{env,now,calls,objects,get core(){return core;},get scheduler(){return scheduler;},
    respond(fn){respond=fn;},alarmAt:()=>storage.getAlarm(),restart(){db.close();open();},
    failPointer(value){failPointer=value;},
    async fire(){const at=await storage.getAlarm();assert.notEqual(at,null);now[0]=Math.max(now[0],at);
      await storage.deleteAlarm();return scheduler.alarm();},
    row(sql,...args){return db.prepare(sql).get(...args);}};
}

test('off schedule/absent grant/key never invokes transport; cancel an existing alarm when disabled',async t=>{
  const f=fixture(t,{schedule:{enabled:false}});
  Object.defineProperty(f.env,'MAPLESTORY_MARKET_APPROVED_API_KEY',{get(){throw new Error('No secret access off');}});
  assert.equal((await f.scheduler.kick()).status,'schedule_disabled');assert.equal(await f.alarmAt(),null);assert.equal(f.calls.length,0);
  const missing=fixture(t,{key:null});assert.equal((await missing.scheduler.kick()).status,'requires_approved_key');
  assert.equal(await missing.alarmAt(),null);assert.equal(missing.row('SELECT COUNT(*) AS n FROM api_jobs').n,0);
});

test('new hook keeps legacy path when alarms off and chooses same owner/kick when enabled',async()=>{
  const seen=[];const stub={enqueueProbeRound:async()=>seen.push('enqueue'),runOne:async()=>({status:'legacy'}),
    kickScheduledCollection:async()=>({status:'alarm_kick'})};
  const env={API_GRANT_JSON:JSON.stringify(GRANT),API_BUDGET_OWNER:{getByName(name){seen.push(name);return stub;}}};
  assert.equal((await maybeRunApprovedApiSchemaProbe(env)).status,'legacy');
  env.API_SCHEDULE_JSON=JSON.stringify(SCHEDULE);assert.equal((await maybeRunApprovedApiSchemaProbe(env)).status,'alarm_kick');
  assert.equal(seen.filter(x=>x==='maplestory-market-account-primary-v1').length,2);
});

test('six fixed raw routes pace at2500ms and stop, with explicit Apple identity still unverified',async t=>{
  const f=fixture(t);assert.equal((await f.scheduler.kick()).alarmScheduled,true);
  for(let n=0;n<6;n++)assert.equal((await f.fire()).status,n===5?'raw_probe_round_complete_no_recurring_work':'success');
  assert.equal(await f.alarmAt(),null);assert.equal(f.calls.length,6);
  for(let i=1;i<6;i++)assert.ok(f.calls[i].at-f.calls[i-1].at>=2500);
  assert.deepEqual(f.calls.map(row=>new URL(row.url).pathname),['/api/status','/api/prices','/api/items','/api/market/overview','/api/items/2010001','/api/items/2010001/history']);
  const receipts=[...f.objects].filter(([key])=>key.includes('/receipts/')).map(([,row])=>JSON.parse(row.body));
  for(const row of receipts){assert.equal(row.sourceObservedAt,null);assert.equal(row.publicationEligible,false);}
  const apple=receipts.find(row=>row.operation==='apple-history');assert.equal(apple.expectedItemId,2010001);
  assert.equal(apple.identityStatus,'known_canonical_id_not_yet_verified_in_this_provider_response');
});

test('existing successful static status job is reused, never replaced/refetched by schedule startup',async t=>{
  const f=fixture(t);f.core.enqueueProbeRound(GRANT.probeRound);assert.equal((await f.core.runOne()).status,'success');
  const old=f.row('SELECT receipt_key FROM api_jobs WHERE operation=?','status').receipt_key;
  await f.scheduler.kick();for(let n=0;n<5;n++)await f.fire();
  assert.equal(f.calls.length,6);assert.equal(f.calls.filter(row=>row.url.endsWith('/status')).length,1);
  assert.equal(f.row('SELECT receipt_key FROM api_jobs WHERE operation=?','status').receipt_key,old);
});

test('recurring priorities are explicit, coalesce missed intervals and keep at most one outstanding per operation',async t=>{
  const f=fixture(t,{schedule:{...SCHEDULE,recurring:[{operation:'status',intervalSeconds:10,priority:2},{operation:'prices',intervalSeconds:10,priority:1}]}});
  await f.scheduler.kick();for(let n=0;n<6;n++)await f.fire();
  assert.equal((await f.fire()).status,'success');assert.ok(f.calls.at(-1).url.endsWith('/prices'));
  assert.equal((await f.fire()).status,'success');assert.ok(f.calls.at(-1).url.endsWith('/status'));
  f.now[0]+=100_000;await f.scheduler.kick();await f.fire();
  assert.ok(f.row('SELECT SUM(skipped_intervals) AS n FROM api_alarm_events').n>0);
  assert.ok(f.row("SELECT COUNT(*) AS n FROM api_jobs WHERE state='pending'").n<=2);
  assert.equal(f.scheduler.health().clockKind,'operator_scheduling_metadata_not_market_observation');
});

test('operator daily cap and minute gate defer alarms rather than bypass budgets',async t=>{
  const f=fixture(t,{grant:{...GRANT,grantedPerMinute:2,operatorDailyRequestCap:6},
    schedule:{...SCHEDULE,recurring:[{operation:'status',intervalSeconds:10,priority:1}]}});
  await f.scheduler.kick();await f.fire();await f.fire();
  const next=await f.alarmAt();assert.ok(next>=f.calls[0].at+60_000);
  while(f.calls.length<6)await f.fire();await f.fire();
  assert.equal(f.calls.length,6);assert.ok(await f.alarmAt()>=f.calls[0].at+86_400_000);
});

test('429 and auth stops persist through restart; absent/new alarms cannot spend early',async t=>{
  const f=fixture(t);f.respond(async()=>new Response(null,{status:429,headers:{'retry-after':'1800'}}));
  await f.scheduler.kick();await f.fire();const deadline=await f.alarmAt();assert.ok(deadline>=f.calls[0].at+1_800_000);
  f.restart();assert.equal(await f.alarmAt(),deadline);f.respond(async()=>new Response(null,{status:401}));
  await f.fire();assert.equal(await f.alarmAt(),null);assert.equal(f.core.health().authenticationStopped,true);
  await f.scheduler.kick();assert.equal(await f.alarmAt(),null);assert.equal(f.calls.length,2);
});

test('durable schedule survives restart and version changes require new reference',async t=>{
  const f=fixture(t);await f.scheduler.kick();await f.fire();const due=await f.alarmAt();
  const started=f.scheduler.health().startedAt;f.restart();assert.equal(await f.alarmAt(),due);
  await f.fire();assert.equal(f.calls.length,2);assert.equal(f.scheduler.health().startedAt,started);
  f.env.API_SCHEDULE_JSON=JSON.stringify({...SCHEDULE,startupTargetSeconds:22000});
  assert.equal((await f.scheduler.kick()).status,'schedule_reference_changed_requires_new_version');assert.equal(await f.alarmAt(),null);
});

test('at-least-once concurrent deliveries and manual run cannot overlap the same transport',async t=>{
  const f=fixture(t);let release;const gate=new Promise(resolve=>{release=resolve;});
  f.respond(async()=>{await gate;return new Response('{}',{headers:{'content-type':'application/json'}});});
  await f.scheduler.kick();const first=f.fire();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.length,1);
  assert.equal((await f.scheduler.alarm()).status,'scheduler_busy');
  assert.equal((await f.core.runOne()).status,'busy');release();await first;assert.equal(f.calls.length,1);
});

test('startup target miss is honest and retries may continue later days, permanent failures pause',async t=>{
  const f=fixture(t,{schedule:{...SCHEDULE,startupTargetSeconds:1}});await f.scheduler.kick();await f.fire();
  assert.equal(f.scheduler.health().startupTargetMissed,true);assert.notEqual(await f.alarmAt(),null);
  f.respond(async()=>new Response(null,{status:404}));await f.fire();
  assert.equal(await f.alarmAt(),null);assert.equal(f.scheduler.health().status,'needs_review');
});

test('current4/day restriction cannot accidentally activate six-probe alarm plan; invalid keyrefs remain blocked',async t=>{
  const f=fixture(t,{grant:{...GRANT,operatorDailyRequestCap:4}});
  assert.equal((await f.scheduler.kick()).status,'operator_budget_too_small_for_initial_round');assert.equal(f.calls.length,0);
  const bad=fixture(t,{schedule:{...SCHEDULE,scheduleReference:KEY}});
  assert.equal((await bad.scheduler.kick()).status,'invalid_schedule_configuration');assert.equal(bad.row('SELECT COUNT(*) AS n FROM api_jobs').n,0);
  assert.throws(()=>scheduleConfig({API_SCHEDULE_JSON:JSON.stringify({...SCHEDULE,requestIntervalMilliseconds:100})}));
});

test('last successful raw receipt with pending pointer keeps a storage-only alarm and repairs without7thAPIattempt',async t=>{
  const f=fixture(t);await f.scheduler.kick();for(let n=0;n<5;n++)await f.fire();
  f.failPointer(true);await f.fire();assert.equal(f.calls.length,6);
  assert.equal(f.core.health().privatePointerPending,true);assert.notEqual(await f.alarmAt(),null);
  assert.ok(await f.alarmAt()>=f.now[0]+30_000);const attempts=f.core.health().attempts;
  f.restart();f.failPointer(false);await f.fire();
  assert.equal(f.calls.length,6);assert.equal(f.core.health().attempts,attempts);
  assert.equal(f.core.health().privatePointerPending,false);assert.equal(await f.alarmAt(),null);
});

test('persistent pointer failure backs off durably with other jobs pending, never a2500ms storage loop',async t=>{
  const f=fixture(t);f.failPointer(true);await f.scheduler.kick();await f.fire();
  let previous=f.now[0];
  for(let n=0;n<4;n++){
    const due=await f.alarmAt();assert.ok(due-previous>=30_000);
    f.restart();assert.equal(await f.alarmAt(),due);await f.fire();previous=f.now[0];
  }
  assert.equal(f.calls.length,1);assert.equal(f.core.health().attempts,1);
  assert.ok(f.scheduler.health().privateStorageBackoffStep>=5);
  f.failPointer(false);await f.fire();assert.equal(f.calls.length,2);
  assert.equal(f.core.health().privatePointerPending,false);
});

test('latency counts toward start pacing, short response does not add another full2500ms wait',async t=>{
  const f=fixture(t);f.respond(async()=>{f.now[0]+=1500;return new Response('{}',{headers:{'content-type':'application/json'}});});
  await f.scheduler.kick();await f.fire();
  const firstStart=f.calls[0].at;assert.equal(f.now[0],firstStart+1500);
  assert.equal(await f.alarmAt(),firstStart+2500); // not completion+2500 = start+4000
  await f.fire();assert.equal(f.calls[1].at-firstStart,2500);
});

test('response longer than pacing interval permits the next eligible start immediately after completion',async t=>{
  const f=fixture(t);f.respond(async()=>{f.now[0]+=3500;return new Response('{}',{headers:{'content-type':'application/json'}});});
  await f.scheduler.kick();await f.fire();
  assert.equal(await f.alarmAt(),f.now[0]+1); // no unnecessary full interval after a slow response
  await f.fire();assert.equal(f.calls[1].at-f.calls[0].at,3501);
});

test('manual/core entry points must enforce at least the configured schedule start interval',async t=>{
  const f=fixture(t,{grant:{...GRANT,minimumRequestIntervalSeconds:1}});
  assert.equal((await f.scheduler.kick()).status,'schedule_pacing_not_enforced_by_core');
  assert.equal(await f.alarmAt(),null);assert.equal(f.calls.length,0);
});

// Opt-in deadline migration controls; original assertions above are retained byte-exact.
import {createHash}from'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const source={...SCHEDULE,recurring:[{operation:'prices',intervalSeconds:300,priority:0},{operation:'overview',intervalSeconds:900,priority:1}]};
const target={...source,scheduleReference:'synthetic-cadence-v2',recurring:source.recurring.map(r=>({...r,intervalSeconds:r.operation==='prices'?60:300}))};
function carrier(src=source,dst=target,modify=()=>{}){const sourceConfiguration=JSON.stringify(src),targetConfiguration=JSON.stringify(dst),d={schemaVersion:1,migrationReference:'synthetic-deadline-v1',sourceConfiguration,targetConfiguration,sourceConfigSha256:sha(sourceConfiguration),targetConfigSha256:sha(targetConfiguration)};modify(d);return JSON.stringify({...dst,deadlinePreservingMigration:d});}
const all=(f,t)=>f.core.sql.exec('SELECT * FROM '+t+' ORDER BY rowid').toArray();
const current=(f,op='prices')=>f.row('SELECT * FROM api_alarm_events WHERE schedule_ref=? AND operation=?',target.scheduleReference,op);
async function boot(t,cfg=source){const f=fixture(t,{grant:{...GRANT,operatorDailyRequestCap:30000},schedule:cfg});await f.scheduler.kick();for(let i=0;i<6;i++)await f.fire();f.now[0]+=2500;return f;}
const noJournal=f=>!f.row("SELECT 1 n FROM sqlite_master WHERE name='api_alarm_cadence_migration'");
test('migration copies exact first deadlines/origin, no enqueue/charge/alarm; later ordinary recurrence switches only after inherited due',async t=>{const f=await boot(t),old=f.row('SELECT * FROM api_alarm_plans'),events=all(f,'api_alarm_events'),tables=['api_jobs','api_attempts','api_control','api_alarm_storage'],snap=Object.fromEntries(tables.map(k=>[k,all(f,k)])),alarm=await f.alarmAt();f.env.API_SCHEDULE_JSON=carrier();assert.equal(f.scheduler.plan().status,'cadence_migration_requires_owned_admission');assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_ready');for(const k of tables)assert.deepEqual(all(f,k),snap[k],k);assert.equal(await f.alarmAt(),alarm);const p=f.row('SELECT * FROM api_alarm_plans WHERE schedule_ref=?',target.scheduleReference);for(const k of ['round_ref','started_at','target_at','initial_complete_at'])assert.equal(p[k],old[k]);for(const e of events){const n=current(f,e.operation);for(const k of ['interval_ms','priority','next_due','active_job_key','skipped_intervals'])assert.equal(n[k],e[k]);assert.equal(n.cadence_inherited_due,e.next_due);}const due=current(f).next_due;f.now[0]=due+125000;assert.equal(f.scheduler.plan().status,'ready');let e=current(f),j=f.row('SELECT * FROM api_jobs WHERE job_key=?',e.active_job_key);assert.equal(j.available_at,due);assert.equal(e.next_due,due+60000);assert.equal(e.interval_ms,60000);assert.equal(e.skipped_intervals,0);assert.equal(e.cadence_inherited_due,null);assert.equal(f.calls.length,6);f.env.API_SCHEDULE_JSON=JSON.stringify(source);assert.equal(f.scheduler.plan().status,'schedule_reference_superseded_requires_target');});
test('actual pending/running charged lease remains exact through migration; first inherited future survives active completion',async t=>{const f=await boot(t);f.now[0]=f.row("SELECT next_due FROM api_alarm_events WHERE operation='prices'").next_due;f.scheduler.plan();const claimed=f.core.claim(f.core.config());assert.equal(claimed.status,'claimed');f.now[0]+=2500;const jobs=all(f,'api_jobs'),attempts=all(f,'api_attempts'),control=all(f,'api_control'),old=f.row("SELECT * FROM api_alarm_events WHERE operation='prices'");f.env.API_SCHEDULE_JSON=carrier();assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_ready');assert.deepEqual(all(f,'api_jobs'),jobs);assert.deepEqual(all(f,'api_attempts'),attempts);assert.deepEqual(all(f,'api_control'),control);assert.equal(current(f).active_job_key,old.active_job_key);assert.equal(f.scheduler.plan().status,'ready');assert.equal(current(f).next_due,old.next_due);assert.equal(f.core.claim(f.core.config()).status,'leased');const completed=f.core.finish(claimed.job,f.core.config(),{kind:'success',receiptKey:'_private/provider-api/v1/receipts/synthetic-migration-owned.json',capturedAt:new Date(f.now[0]).toISOString()});assert.equal(completed.status,'success');assert.equal(f.scheduler.plan().status,'ready');assert.equal(current(f).next_due,old.next_due);assert.equal(current(f).interval_ms,300000);f.now[0]=old.next_due+125000;f.scheduler.plan();const e=current(f),j=f.row('SELECT * FROM api_jobs WHERE job_key=?',e.active_job_key);assert.equal(j.available_at,old.next_due);assert.equal(e.interval_ms,60000);assert.equal(all(f,'api_attempts').length,attempts.length);});
test('restart/idempotence, carrier removal and remaining first-deadline marker survive',async t=>{const f=await boot(t);f.env.API_SCHEDULE_JSON=carrier();await f.scheduler.prepareDeadlinePreservingMigration();const before=all(f,'api_alarm_events');f.restart();assert.equal(f.scheduler.plan().status,'cadence_migration_requires_owned_admission');assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_ready');assert.deepEqual(all(f,'api_alarm_events'),before);f.env.API_SCHEDULE_JSON=JSON.stringify(target);f.restart();const due=current(f).next_due;f.now[0]=due+125000;assert.equal(f.scheduler.plan().status,'ready');assert.equal(f.row('SELECT available_at FROM api_jobs WHERE job_key=?',current(f).active_job_key).available_at,due);});
for(const kind of ['sourceHash','targetHash','sourcePriority','targetOther','sameReference','wrongGrant'])test(kind+' refuses without source/target/job mutations',async t=>{const f=await boot(t),sourceRows=all(f,'api_alarm_plans'),events=all(f,'api_alarm_events'),jobs=all(f,'api_jobs'),attempts=all(f,'api_attempts');let src=structuredClone(source),dst=structuredClone(target);if(kind==='sourcePriority')src.recurring[0].priority=99;if(kind==='targetOther')dst.startupTargetSeconds++;if(kind==='sameReference')dst.scheduleReference=src.scheduleReference;if(kind==='wrongGrant'){const g=JSON.parse(f.env.API_GRANT_JSON);g.grantReference='foreign-grant';f.env.API_GRANT_JSON=JSON.stringify(g);}f.env.API_SCHEDULE_JSON=carrier(src,dst,d=>{if(kind==='sourceHash')d.sourceConfigSha256='0'.repeat(64);if(kind==='targetHash')d.targetConfigSha256='0'.repeat(64);});assert(['invalid_schedule_configuration','cadence_migration_review_required'].includes((await f.scheduler.prepareDeadlinePreservingMigration()).status));assert(noJournal(f));assert.deepEqual(all(f,'api_alarm_plans'),sourceRows);assert.deepEqual(all(f,'api_alarm_events'),events);assert.deepEqual(all(f,'api_jobs'),jobs);assert.deepEqual(all(f,'api_attempts'),attempts);});
test('strict duplicate/unknown new descriptor and inner text rejection; Off ignores descriptor as legacy did',()=>{const raw=carrier();assert.throws(()=>scheduleConfig({API_SCHEDULE_JSON:raw.replace('"schemaVersion":1','"schemaVersion":1,"schemaVersion":1')}),/duplicate/);const outer=JSON.parse(raw);outer.deadlinePreservingMigration.extra=true;assert.throws(()=>scheduleConfig({API_SCHEDULE_JSON:JSON.stringify(outer)}));const inner=JSON.parse(raw);inner.deadlinePreservingMigration.sourceConfiguration=inner.deadlinePreservingMigration.sourceConfiguration.replace('"enabled":true','"enabled":true,"enabled":true');inner.deadlinePreservingMigration.sourceConfigSha256=sha(inner.deadlinePreservingMigration.sourceConfiguration);assert.throws(()=>scheduleConfig({API_SCHEDULE_JSON:JSON.stringify(inner)}),/duplicate/);assert.deepEqual(scheduleConfig({API_SCHEDULE_JSON:'{"enabled":false,"deadlinePreservingMigration":{"nonsense":1}}'}),{enabled:false});});
test('third migration write failure rolls DDL+target+source phase back atomically',async t=>{const f=await boot(t),plans=all(f,'api_alarm_plans'),events=all(f,'api_alarm_events'),jobs=all(f,'api_jobs');f.env.API_SCHEDULE_JSON=carrier();const exec=f.core.sql.exec;let writes=0;f.core.sql.exec=(sql,...a)=>{if(/^(?:CREATE TABLE api_alarm_cadence|ALTER TABLE api_alarm_events|INSERT INTO api_alarm|UPDATE api_alarm)/.test(sql)&&++writes===3)throw Error('synthetic third write');return exec(sql,...a);};try{assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_review_required');}finally{f.core.sql.exec=exec;}assert.equal(writes,3);assert(noJournal(f));assert.deepEqual(all(f,'api_alarm_plans'),plans);assert.deepEqual(all(f,'api_alarm_events'),events);assert.deepEqual(all(f,'api_jobs'),jobs);});
test('auth pause stops without migration; storage/spacing holds permit metadata copy without resetting gates',async t=>{const f=await boot(t);f.env.API_SCHEDULE_JSON=carrier();f.core.sql.exec('UPDATE api_control SET auth_stopped=1');const before=all(f,'api_control');assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'authentication_stopped');assert(noJournal(f));assert.deepEqual(all(f,'api_control'),before);f.core.sql.exec('UPDATE api_control SET auth_stopped=0,blocked_until=?,next_allowed=?',f.now[0]+120000,f.now[0]+2500);const gates=all(f,'api_control'),plans=all(f,'api_alarm_plans');assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_ready');assert.equal(f.scheduler.plan().status,'ready');assert.deepEqual(all(f,'api_control'),gates);const targetPlan=f.row('SELECT * FROM api_alarm_plans WHERE schedule_ref=?',target.scheduleReference);assert.equal(targetPlan.started_at,plans[0].started_at);});

test('migration preserves all unchanged-operation overdue first deadlines exactly too',async t=>{const src={...source,recurring:[...source.recurring,{operation:'status',intervalSeconds:600,priority:4},{operation:'catalogue',intervalSeconds:900,priority:3}]},dst={...target,recurring:[...target.recurring,{operation:'status',intervalSeconds:600,priority:4},{operation:'catalogue',intervalSeconds:900,priority:3}]},f=await boot(t,src),before=all(f,'api_alarm_events');f.env.API_SCHEDULE_JSON=carrier(src,dst);assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_ready');f.now[0]=Math.max(...before.map(r=>r.next_due))+1300000;assert.equal(f.scheduler.plan().status,'ready');for(const old of before){const e=current(f,old.operation),j=f.row('SELECT available_at FROM api_jobs WHERE job_key=?',e.active_job_key);assert.equal(j.available_at,old.next_due);assert.equal(e.skipped_intervals,old.skipped_intervals);}assert.equal(f.calls.length,6);});
test('minute gate and earliest existing charge remain authoritative after exact inherited enqueue',async t=>{const f=await boot(t);f.core.sql.exec('UPDATE api_alarm_events SET next_due=? WHERE operation=?',f.now[0]+1,'prices');f.core.sql.exec("WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<24) INSERT INTO api_attempts(job_key,at,result,grant_ref) SELECT 'synthetic-existing-quota',?,'success','synthetic-grant' FROM n",f.now[0]);const attempts=all(f,'api_attempts');assert.equal(attempts.length,30);f.env.API_SCHEDULE_JSON=carrier();assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_ready');const due=current(f).next_due;f.now[0]=due+1;f.scheduler.plan();assert.equal(f.row('SELECT available_at FROM api_jobs WHERE job_key=?',current(f).active_job_key).available_at,due);assert.notEqual((await f.core.runOne()).status,'success');assert.deepEqual(all(f,'api_attempts'),attempts);assert.equal(f.calls.length,6);const next=f.core.nextAttemptAt(f.core.config());assert(next>=Math.min(...attempts.map(a=>a.at))+60000);});
test('rolling24h operator30k hold crosses midnight without reset or new migration charge',async t=>{const f=await boot(t);f.core.sql.exec('UPDATE api_alarm_events SET next_due=? WHERE operation=?',f.now[0]+1,'prices');f.core.sql.exec("WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<29994) INSERT INTO api_attempts(job_key,at,result,grant_ref) SELECT 'synthetic-prior-day-charge',?,'success','synthetic-grant' FROM n",f.now[0]-60001);const count=f.row('SELECT COUNT(*)n FROM api_attempts').n;assert.equal(count,30000);f.env.API_SCHEDULE_JSON=carrier();assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_ready');const due=current(f).next_due;f.now[0]=due+1;f.scheduler.plan();const inheritedKey=current(f).active_job_key;assert.equal(f.row('SELECT available_at FROM api_jobs WHERE job_key=?',inheritedKey).available_at,due);assert.notEqual((await f.core.runOne()).status,'success');assert.equal(f.calls.length,6);assert.equal(f.row('SELECT COUNT(*)n FROM api_attempts').n,count);assert.equal(f.row('SELECT available_at FROM api_jobs WHERE job_key=?',inheritedKey).available_at,due);const at=f.core.nextAttemptAt(f.core.config());assert(at>f.now[0]+23*3600000);f.now[0]=at+1;assert.equal((await f.core.runOne()).status,'success');assert.equal(f.calls.length,7);assert.equal(f.row('SELECT COUNT(*)n FROM api_attempts').n,count+1);assert.equal(current(f).active_job_key,inheritedKey);assert.equal(f.row('SELECT available_at FROM api_jobs WHERE job_key=?',inheritedKey).available_at,f.now[0]);assert.equal(current(f).next_due,due+60000);});
test('held actual fake transport permits metadata copy while preserving charge/lease and physical flight',async t=>{const f=await boot(t);f.now[0]=f.row("SELECT next_due FROM api_alarm_events WHERE operation='prices'").next_due;f.scheduler.plan();let entered,release;const hit=new Promise(r=>entered=r),hold=new Promise(r=>release=r);f.respond(async()=>{entered();await hold;return new Response('{}',{headers:{'content-type':'application/json'}});});const task=f.core.runOne();try{await hit;const physicalFlight=f.core.flight;assert(physicalFlight);const jobs=all(f,'api_jobs'),attempts=all(f,'api_attempts');f.env.API_SCHEDULE_JSON=carrier();assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_ready');assert.equal(f.core.flight,physicalFlight);assert.deepEqual(all(f,'api_jobs'),jobs);assert.deepEqual(all(f,'api_attempts'),attempts);}finally{release();await task;}f.now[0]+=2500;assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_ready');assert.equal(f.calls.length,7);});
test('closing hash callback profile withdrawal rolls back before any migration schema',async t=>{const f=await boot(t),plans=all(f,'api_alarm_plans');f.env.API_SCHEDULE_JSON=carrier();const digest=crypto.subtle.digest.bind(crypto.subtle);let changed=false;t.mock.method(crypto.subtle,'digest',async(...a)=>{const r=await digest(...a);if(!changed){changed=true;f.env.API_SCHEDULE_JSON='{"enabled":false}';}return r;});assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_review_required');assert(changed);assert(noJournal(f));assert.deepEqual(all(f,'api_alarm_plans'),plans);assert.equal(f.calls.length,6);});
for(const kind of ['missing','extra','malformedScalar','unsafeFuture'])test('source '+kind+' metadata refuses before copy/schema',async t=>{const f=await boot(t);if(kind==='missing')f.core.sql.exec("DELETE FROM api_alarm_events WHERE operation='overview'");if(kind==='extra')f.core.sql.exec("INSERT INTO api_alarm_events(schedule_ref,operation,interval_ms,priority,next_due)VALUES(?,'status',600000,2,?)",source.scheduleReference,f.now[0]+100);if(kind==='malformedScalar')f.core.sql.exec("UPDATE api_alarm_events SET active_job_key=? WHERE operation='prices'",'x'.repeat(100000));if(kind==='unsafeFuture')f.core.sql.exec("UPDATE api_alarm_events SET next_due=8639999999999999 WHERE operation='prices'");const before=all(f,'api_alarm_plans');f.env.API_SCHEDULE_JSON=carrier();assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_review_required');assert(noJournal(f));assert.deepEqual(all(f,'api_alarm_plans'),before);});
test('conflicting immutable migrationReference and cold target missing-row state refuse, never recreate',async t=>{const f=await boot(t);f.env.API_SCHEDULE_JSON=carrier();await f.scheduler.prepareDeadlinePreservingMigration();const before=all(f,'api_alarm_events');f.env.API_SCHEDULE_JSON=carrier(source,target,d=>d.migrationReference='different-version-v2');assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_review_required');assert.deepEqual(all(f,'api_alarm_events'),before);f.env.API_SCHEDULE_JSON=carrier();f.core.sql.exec('DELETE FROM api_alarm_events WHERE schedule_ref=? AND operation=?',target.scheduleReference,'prices');f.restart();assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_review_required');assert.equal(f.row('SELECT COUNT(*)n FROM api_alarm_events WHERE schedule_ref=?',target.scheduleReference).n,1);});
test('cold restart with valid admitted target respects existing storage pause without source rollback',async t=>{const f=await boot(t);f.env.API_SCHEDULE_JSON=carrier();await f.scheduler.prepareDeadlinePreservingMigration();f.core.sql.exec('UPDATE api_alarm_storage SET blocked_until=?,backoff_step=2',f.now[0]+60000);const events=all(f,'api_alarm_events'),gates=all(f,'api_alarm_storage');f.restart();assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_ready');assert.equal(f.scheduler.plan().status,'ready');assert.deepEqual(all(f,'api_alarm_events'),events);assert.deepEqual(all(f,'api_alarm_storage'),gates);});
test('actual same collector mux/provider recovery version1 and native alarm remain untouched by metadata migration',async t=>{const {fixture:owned}=await import('./api-public-cash-fixture.mjs'),f=await owned(t,{publicFlag:{enabled:false},grantOverride:{...GRANT,operatorDailyRequestCap:30000},schedule:source});await f.owner.kickScheduledCollection();for(let i=0;i<40&&f.row('SELECT initial_complete_at FROM api_alarm_plans').initial_complete_at===null;i++)await f.fire();assert.equal(f.row('SELECT COUNT(*)n FROM api_attempts').n,6);f.now[0]+=2500;const table=k=>f.core.sql.exec('SELECT * FROM '+k+' ORDER BY rowid').toArray(),before=Object.fromEntries(['api_cash_alarm_mux','api_cash_provider_recovery','api_control','api_jobs','api_attempts'].map(k=>[k,table(k)])),alarm=await f.alarm();f.env.API_SCHEDULE_JSON=carrier();assert.equal((await f.owner.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_ready');for(const k in before)assert.deepEqual(table(k),before[k],k);assert.equal(await f.alarm(),alarm);await f.owner.privateHealth.afterRun({status:'spacing_wait'});const health=JSON.parse(f.objects.get('_private/provider-api/v1/health.json').body);assert.equal(health.providerAlarmRecoveryVersion,1);assert.equal(f.row('SELECT COUNT(*)n FROM api_attempts').n,6);});

test('ordinary kick and native alarm queue exact inherited overdue deadline, then use new recurring60s',async t=>{const f=await boot(t),due=f.row("SELECT next_due FROM api_alarm_events WHERE operation='prices'").next_due;f.now[0]=due+125000;f.env.API_SCHEDULE_JSON=carrier();assert.equal((await f.scheduler.kick()).status,'scheduled');const first=current(f).active_job_key;assert.equal(f.row('SELECT available_at FROM api_jobs WHERE job_key=?',first).available_at,due);assert.equal(f.calls.length,6);assert.equal((await f.fire()).status,'success');assert.equal(f.calls.length,7);assert.equal(f.row('SELECT state FROM api_jobs WHERE job_key=?',first).state,'complete');const second=current(f).active_job_key;assert.notEqual(second,first);assert.equal(f.row('SELECT available_at FROM api_jobs WHERE job_key=?',second).available_at,due+120000);assert.equal(current(f).next_due,due+180000);assert.equal(current(f).skipped_intervals,1);assert.equal(current(f).interval_ms,60000);assert.equal((await f.fire()).status,'success');assert.equal(f.calls.length,8);assert(f.calls[7].at-f.calls[6].at>=2500);});
test('supplied UTF8 source text hash is separate from actual stored canonical digest, without historical raw claim',async t=>{const f=await boot(t),canonical=f.row('SELECT config_json FROM api_alarm_plans').config_json,outer=JSON.parse(carrier()),d=outer.deadlinePreservingMigration;d.sourceConfiguration=JSON.stringify(source,null,2)+'\n';d.sourceConfigSha256=sha(d.sourceConfiguration);f.env.API_SCHEDULE_JSON=JSON.stringify(outer);assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_ready');const row=f.row('SELECT * FROM api_alarm_cadence_migration');assert.equal(row.source_supplied_text_sha,sha(d.sourceConfiguration));assert.equal(row.source_snapshot_sha,sha(canonical));assert.notEqual(row.source_snapshot_sha,row.source_supplied_text_sha);assert.equal(row.source_plan_json!==null,true);});
test('unversioned target or migration reference and inner unknown fields refuse',()=>{for(const field of ['target','migration','inner']){const o=JSON.parse(carrier()),d=o.deadlinePreservingMigration;if(field==='target'){o.scheduleReference='unversioned';const x=JSON.parse(d.targetConfiguration);x.scheduleReference=o.scheduleReference;d.targetConfiguration=JSON.stringify(x);d.targetConfigSha256=sha(d.targetConfiguration);}if(field==='migration')d.migrationReference='unversioned';if(field==='inner'){const x=JSON.parse(d.sourceConfiguration);x.unapproved=true;d.sourceConfiguration=JSON.stringify(x);d.sourceConfigSha256=sha(d.sourceConfiguration);}assert.throws(()=>scheduleConfig({API_SCHEDULE_JSON:JSON.stringify(o)}),field);}});

test('overdue first deadline survives actual backoff/storage/pointer hold and ordinary kick without source coalescing',async t=>{const f=await boot(t),due=f.row("SELECT next_due FROM api_alarm_events WHERE operation='prices'").next_due;f.now[0]=due+625000;const until=f.now[0]+90000;f.core.sql.exec('UPDATE api_control SET blocked_until=?,next_allowed=?,pointer_pending=1',until,until-1000);f.core.sql.exec('UPDATE api_alarm_storage SET blocked_until=?,backoff_step=2',until);const control=all(f,'api_control'),storage=all(f,'api_alarm_storage'),attempts=all(f,'api_attempts');f.env.API_SCHEDULE_JSON=carrier();assert.equal((await f.scheduler.kick()).status,'scheduled');assert.deepEqual(all(f,'api_control'),control);assert.deepEqual(all(f,'api_alarm_storage'),storage);assert.deepEqual(all(f,'api_attempts'),attempts);assert.equal(f.row('SELECT available_at FROM api_jobs WHERE job_key=?',current(f).active_job_key).available_at,due);assert.equal(current(f).next_due,due+60000);assert.equal(current(f).skipped_intervals,0);assert.equal(f.calls.length,6);assert((await f.alarmAt())>=until);assert.equal(f.core.claim(f.core.config()).status,'backoff');assert.equal(f.calls.length,6);});

test('closing transaction withdrawal rolls back metadata and replay withdrawal refuses',async t=>{for(const replay of [false,true]){const f=await boot(t);f.env.API_SCHEDULE_JSON=carrier();if(replay)await f.scheduler.prepareDeadlinePreservingMigration();const plans=all(f,'api_alarm_plans'),events=all(f,'api_alarm_events'),exec=f.core.sql.exec;let hit=false;f.core.sql.exec=(sql,...a)=>{const rows=exec(sql,...a);if(!hit&&(replay?sql.startsWith('SELECT CASE WHEN cadence_inherited_due'):sql.startsWith('UPDATE api_alarm_plans SET phase='))){hit=true;f.env.API_SCHEDULE_JSON='{"enabled":false}';}return rows;};try{assert.equal((await f.scheduler.prepareDeadlinePreservingMigration()).status,'cadence_migration_review_required');}finally{f.core.sql.exec=exec;}assert(hit);assert.deepEqual(all(f,'api_alarm_plans'),plans);assert.deepEqual(all(f,'api_alarm_events'),events);if(!replay)assert(noJournal(f));assert.equal(f.calls.length,6);}});

// R2 selected-lineage controls: no extra cadence transition policy.
for(const cold of [false,true])test('selected descriptor-free exact target resumes through Off/auth stop without clearing lineage; cold='+cold,async t=>{const f=await boot(t);f.env.API_SCHEDULE_JSON=carrier();await f.scheduler.kick();const due=current(f).next_due,journal=all(f,'api_alarm_cadence_migration'),attempts=all(f,'api_attempts');f.env.API_SCHEDULE_JSON='{"enabled":false}';assert.equal((await f.scheduler.kick()).status,'schedule_disabled');assert.equal(await f.alarmAt(),null);assert.deepEqual(all(f,'api_alarm_cadence_migration'),journal);if(cold)f.restart();f.env.API_SCHEDULE_JSON=JSON.stringify(target,null,2);f.core.sql.exec('UPDATE api_control SET auth_stopped=1');assert.equal((await f.scheduler.kick()).status,'authentication_stopped');assert.equal(await f.alarmAt(),null);assert.deepEqual(all(f,'api_alarm_cadence_migration'),journal);assert.deepEqual(all(f,'api_attempts'),attempts);assert.equal(current(f).next_due,due);f.core.sql.exec('UPDATE api_control SET auth_stopped=0');assert.equal((await f.scheduler.kick()).status,'scheduled');assert.equal(current(f).next_due,due);assert.deepEqual(all(f,'api_attempts'),attempts);await f.fire();assert.equal(f.calls.length,7);assert(f.calls[6].at>=due);});
for(const kind of ['newRef','sameRefChangedInterval','forgedDescriptor','unsupportedChain'])test('selected '+kind+' refuses before enqueue, charge or history replacement, including cold start',async t=>{const f=await boot(t);f.env.API_SCHEDULE_JSON=carrier();await f.scheduler.kick();const tables=['api_alarm_plans','api_alarm_events','api_alarm_cadence_migration','api_jobs','api_attempts','api_control'],before=Object.fromEntries(tables.map(k=>[k,all(f,k)]));let cfg=structuredClone(target);if(kind==='newRef')cfg.scheduleReference='unapproved-v3';if(kind==='sameRefChangedInterval')cfg.recurring[0].intervalSeconds=120;if(kind==='forgedDescriptor')cfg=JSON.parse(carrier(source,{...target,scheduleReference:'forged-v3'},d=>d.migrationReference='forged-v2'));if(kind==='unsupportedChain')cfg=JSON.parse(carrier(target,{...target,scheduleReference:'future-chain-v3'},d=>d.migrationReference='future-chain-v2'));f.env.API_SCHEDULE_JSON=JSON.stringify(cfg);f.restart();assert.notEqual((await f.scheduler.kick()).status,'scheduled');assert.equal(await f.alarmAt(),null);for(const k of tables)assert.deepEqual(all(f,k),before[k],k);assert.equal(f.calls.length,6);f.env.API_SCHEDULE_JSON=carrier();assert.equal((await f.scheduler.kick()).status,'scheduled');for(const k of tables)assert.deepEqual(all(f,k),before[k],k);});
test('never-selected legacy can still use its existing new-reference behavior without migration schema',async t=>{const f=await boot(t);f.env.API_SCHEDULE_JSON=JSON.stringify({...source,scheduleReference:'ordinary-new-reference-v2'});assert.equal((await f.scheduler.kick()).status,'scheduled');assert(f.row('SELECT * FROM api_alarm_plans WHERE schedule_ref=?','ordinary-new-reference-v2'));assert(noJournal(f));assert.equal(f.calls.length,6);});

test('selected canonical remains bound to installed descriptor rather than a changed target-plan row',async t=>{const f=await boot(t);f.env.API_SCHEDULE_JSON=carrier();await f.scheduler.kick();const cfg=structuredClone(target);cfg.recurring[0].intervalSeconds=120;const altered=scheduleConfig({API_SCHEDULE_JSON:JSON.stringify(cfg)});f.core.sql.exec('UPDATE api_alarm_plans SET config_json=? WHERE schedule_ref=?',JSON.stringify(altered),target.scheduleReference);const jobs=all(f,'api_jobs'),attempts=all(f,'api_attempts'),journal=all(f,'api_alarm_cadence_migration');f.env.API_SCHEDULE_JSON=JSON.stringify(cfg);assert.equal((await f.scheduler.kick()).status,'cadence_selected_lineage_requires_review');assert.deepEqual(all(f,'api_jobs'),jobs);assert.deepEqual(all(f,'api_attempts'),attempts);assert.deepEqual(all(f,'api_alarm_cadence_migration'),journal);assert.equal(f.calls.length,6);});
