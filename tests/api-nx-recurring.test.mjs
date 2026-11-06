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


const NX_GRANT={...GRANT,operatorDailyRequestCap:30000,nxSchemaProbesEnabled:true,allowedOperations:[...OPS,'nx-rate','nx-history']};
const NX_SCHEDULE={...SCHEDULE,scheduleReference:'synthetic-nx-v2',recurring:[{operation:'nx-rate',intervalSeconds:60,priority:1},{operation:'nx-history',intervalSeconds:300,priority:2}]};
async function completeEight(f){await f.scheduler.kick();for(let i=0;i<8;i++)await f.fire();}
test('NX recurring events only begin after both exact capability jobs complete',async t=>{
 const f=fixture(t,{grant:NX_GRANT,schedule:NX_SCHEDULE});await f.scheduler.kick();for(let i=0;i<6;i++)await f.fire();assert.equal(f.row('SELECT COUNT(*) AS n FROM api_alarm_events').n,0);await f.fire();assert.equal(f.row('SELECT COUNT(*) AS n FROM api_alarm_events').n,0);await f.fire();assert.equal(f.row('SELECT COUNT(*) AS n FROM api_alarm_events').n,2);assert.equal(f.calls.length,8);assert.equal(f.core.nxSchemaProbeState().status,'complete');
 const keys=[...f.objects.keys()].filter(k=>k.includes('/receipts/'));f.restart();await f.scheduler.kick();assert.equal(f.calls.length,8);assert.deepEqual([...f.objects.keys()].filter(k=>k.includes('/receipts/')),keys);await f.fire();assert.equal(f.calls.at(-1).url,'https://maplestory.market/api/nx-rate');assert.equal(f.calls.length,9);assert(f.calls.at(-1).at-f.calls[7].at>=60000);
});
test('NX schedule requires explicit flag and both granted operations; unknown route rejected',async t=>{
 for(const grant of[{...NX_GRANT,nxSchemaProbesEnabled:false},{...GRANT,operatorDailyRequestCap:30000}]){const f=fixture(t,{grant,schedule:NX_SCHEDULE});assert.equal((await f.scheduler.kick()).status,'nx_recurring_scope_not_granted');assert.equal(f.calls.length,0);}
 assert.throws(()=>scheduleConfig({API_SCHEDULE_JSON:JSON.stringify({...NX_SCHEDULE,recurring:[{operation:'nx-trades',intervalSeconds:60,priority:1}]})}));
});
test('scheduled NX cannot bypass exact two successful capability identities',async t=>{
 const f=fixture(t,{grant:NX_GRANT,schedule:NX_SCHEDULE});assert.throws(()=>f.core.enqueueScheduledOperation({jobKey:'synthetic-r1:r:000:forged',operation:'nx-rate',availableAt:START}));await completeEight(f);assert.doesNotThrow(()=>f.core.enqueueScheduledOperation({jobKey:'synthetic-r1:r:000:approved',operation:'nx-rate',availableAt:START+60000}));assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,8);
});
test('new schedule reference preserves original eight and old ledger; same-reference cadence drift fails',async t=>{
 const f=fixture(t,{grant:NX_GRANT,schedule:NX_SCHEDULE});await completeEight(f);const before=f.row('SELECT COUNT(*) AS n FROM api_jobs').n;f.env.API_SCHEDULE_JSON=JSON.stringify({...NX_SCHEDULE,recurring:[{operation:'nx-rate',intervalSeconds:120,priority:1}]});assert.equal((await f.scheduler.kick()).status,'schedule_reference_changed_requires_new_version');assert.equal(f.calls.length,8);f.env.API_SCHEDULE_JSON=JSON.stringify({...NX_SCHEDULE,scheduleReference:'synthetic-nx-v3'});f.restart();await f.scheduler.kick();assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,8);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_jobs').n,before);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_alarm_plans').n,2);assert.equal(f.calls.length,8);
});
test('NX recurrent429 preserves RetryAfter across restart and auth denial stops same owner',async t=>{
 const f=fixture(t,{grant:NX_GRANT,schedule:NX_SCHEDULE});await completeEight(f);f.respond(async()=>new Response(null,{status:429,headers:{'retry-after':'120'}}));await f.fire();const failed=f.calls.at(-1).at;assert((await f.alarmAt())>=failed+120000);f.restart();await f.scheduler.kick();assert((await f.alarmAt())>=failed+120000);assert.equal(f.calls.length,9);f.respond(async()=>new Response(null,{status:403}));await f.fire();assert.equal(f.calls.length,10);assert.equal(await f.alarmAt(),null);f.restart();assert.equal((await f.scheduler.kick()).status,'authentication_stopped');assert.equal(f.calls.length,10);
});
test('private deadline alarmControl adapter retained and minute/day limits share all old attempts',async t=>{
 const f=fixture(t,{grant:{...NX_GRANT,operatorDailyRequestCap:9},schedule:NX_SCHEDULE});const original=f.scheduler.alarmControl,seen=[];f.scheduler.alarmControl={async setAlarm(at){seen.push(['set',at]);return original.setAlarm(at);},async deleteAlarm(){seen.push(['delete']);return original.deleteAlarm();}};await completeEight(f);await f.fire();assert.equal(f.calls.length,9);for(let i=0;i<4&&(await f.alarmAt())<f.calls[0].at+86400000;i++)await f.fire();assert.equal(f.calls.length,9);assert((await f.alarmAt())>=f.calls[0].at+86400000);assert(seen.some(r=>r[0]==='set'));assert.equal(f.core.dailyCap(f.core.config()),9);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,9);
});
test('capability404 remains NX-only incomplete while recurrent404 pauses plan for review',async t=>{
 const f=fixture(t,{grant:NX_GRANT,schedule:NX_SCHEDULE});await f.scheduler.kick();for(let i=0;i<6;i++)await f.fire();f.respond(async()=>new Response(null,{status:404}));await f.fire();assert.equal(f.core.nxSchemaProbeState().status,'permanent_failure_needs_review');assert.equal(f.row('SELECT COUNT(*) AS n FROM api_alarm_events').n,0);assert.equal(f.row('SELECT auth_stopped FROM api_control').auth_stopped,0);
 const other=fixture(t,{grant:NX_GRANT,schedule:NX_SCHEDULE});await completeEight(other);other.respond(async()=>new Response(null,{status:404}));await other.fire();assert.equal(await other.alarmAt(),null);assert.equal(other.row('SELECT auth_stopped FROM api_control').auth_stopped,0);assert.equal((await other.scheduler.kick()).status,'recurring_permanent_failure_needs_review');
});
