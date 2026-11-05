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
