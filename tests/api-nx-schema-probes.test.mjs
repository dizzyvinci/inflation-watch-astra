import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ApiPrivateHealth} from '../ops/api-private-health.mjs';
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
  let db,core,scheduler,mirror;const now=[START],calls=[],objects=new Map();let sequence=0;
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
    scheduler=new ApiAlarmScheduler({storage},env,core);mirror=new ApiPrivateHealth({storage},env,core);
  }
  open();t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
  return{env,now,calls,objects,get mirror(){return mirror;},get core(){return core;},get scheduler(){return scheduler;},
    respond(fn){respond=fn;},alarmAt:()=>storage.getAlarm(),restart(){db.close();open();},
    failPointer(value){failPointer=value;},
    async fire(){const at=await storage.getAlarm();assert.notEqual(at,null);now[0]=Math.max(now[0],at);
      await storage.deleteAlarm();return scheduler.alarm();},
    row(sql,...args){return db.prepare(sql).get(...args);}};
}


const NX=['nx-rate','nx-history'];
const EXT={...GRANT,allowedOperations:[...OPS,...NX],nxSchemaProbesEnabled:true};
async function initial(f){await f.scheduler.kick();for(let n=0;n<6;n++)await f.fire();assert.equal(f.calls.length,6);}
function enable(f,extra={}){f.env.API_GRANT_JSON=JSON.stringify({...EXT,...extra});}

test('NXpermission alone without explicitflag leaves legacy sixjobs/identities/idle unchanged',async t=>{
 const f=fixture(t,{grant:{...EXT,nxSchemaProbesEnabled:false}});await initial(f);
 assert.equal(await f.alarmAt(),null);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_jobs').n,6);
 assert.equal(f.core.nxSchemaProbeState().status,'disabled');
 for(const [i,op]of OPS.entries())assert.equal(f.row('SELECT operation FROM api_jobs WHERE job_key=?',`${GRANT.probeRound}:${i}:${op}`).operation,op);
});

test('explicitfeature waits for allsix then creates exactlytwofixedpostjobs once and never recurs',async t=>{
 const f=fixture(t,{grant:EXT});await f.scheduler.kick();
 assert.equal(f.core.nxSchemaProbeState().status,'waiting_for_initial_six');assert.equal(f.row('SELECT COUNT(*) AS n FROM api_jobs').n,6);
 for(let n=0;n<5;n++)await f.fire();assert.equal(f.row('SELECT COUNT(*) AS n FROM api_jobs').n,6);
 await f.fire();assert.equal(f.row('SELECT COUNT(*) AS n FROM api_jobs').n,8);
 for(const [i,op]of NX.entries())assert.equal(f.row('SELECT operation FROM api_jobs WHERE job_key=?',`${GRANT.probeRound}:${6+i}:${op}`).operation,op);
 await f.fire();await f.fire();assert.deepEqual(f.calls.slice(6).map(r=>r.url),['https://maplestory.market/api/nx-rate','https://maplestory.market/api/nx-rate/history?range=7d&step=hour']);
 assert.equal(f.core.nxSchemaProbeState().status,'complete');assert.equal(await f.alarmAt(),null);
 f.now[0]+=3*86400000;await f.scheduler.kick();assert.equal(f.calls.length,8);assert.equal(await f.alarmAt(),null);
 assert.equal(f.row('SELECT COUNT(*) AS n FROM api_jobs').n,8);
 for(const row of f.calls.slice(6)){assert.equal(row.options.method,'GET');assert.equal(row.options.redirect,'manual');assert.equal(row.options.headers.Authorization,'Bearer '+KEY);assert.equal(row.options.headers.Cookie,undefined);}
});

test('alreadycompleted six-plan and originalreceiptkeys/attempts/deadlines survive same-round extension',async t=>{
 const f=fixture(t);await initial(f);const plan=f.row('SELECT * FROM api_alarm_plans'),before=OPS.map((op,i)=>f.row('SELECT * FROM api_jobs WHERE job_key=?',`${GRANT.probeRound}:${i}:${op}`));
 const oldNext=f.core.health().nextAllowedAt;enable(f);await f.scheduler.kick();
 assert.equal(f.core.health().attempts,6);assert.ok(await f.alarmAt()>=Date.parse(oldNext));
 assert.equal(f.row('SELECT started_at FROM api_alarm_plans').started_at,plan.started_at);
 assert.equal(f.row('SELECT initial_complete_at FROM api_alarm_plans').initial_complete_at,plan.initial_complete_at);
 f.restart();await f.fire();await f.fire();assert.equal(f.core.health().attempts,8);
 for(const [i,op]of OPS.entries())assert.deepEqual(f.row('SELECT * FROM api_jobs WHERE job_key=?',`${GRANT.probeRound}:${i}:${op}`),before[i]);
});

test('old charged attempts still exhaust slidingdaybudget; restart/extension cannot buy fresh budget',async t=>{
 const f=fixture(t,{grant:{...GRANT,operatorDailyRequestCap:6}});await initial(f);enable(f,{operatorDailyRequestCap:6});await f.scheduler.kick();
 assert.equal(f.calls.length,6);assert.ok(await f.alarmAt()>=f.calls[0].at+86400000);
 const due=await f.alarmAt();f.restart();assert.equal(await f.alarmAt(),due);await f.fire();await f.fire();
 assert.equal(f.calls.length,8);assert.equal(f.core.health().attempts,8);
});

test('NX401or403 hard-stops account with no secondNX/history/session/challenge fallback through restart',async t=>{
 for(const status of [401,403]){
  const f=fixture(t);await initial(f);enable(f);f.respond(async()=>new Response(null,{status}));await f.scheduler.kick();await f.fire();
  assert.equal(f.calls.length,7);assert.equal(f.core.health().authenticationStopped,true);assert.equal(await f.alarmAt(),null);
  assert.equal(f.calls.at(-1).url,'https://maplestory.market/api/nx-rate');
  f.restart();await f.scheduler.kick();assert.equal(f.calls.length,7);assert.equal(await f.alarmAt(),null);
 }
 const partial=fixture(t);await initial(partial);enable(partial);await partial.scheduler.kick();await partial.fire();
 partial.respond(async()=>new Response(null,{status:403}));await partial.fire();
 assert.equal(partial.core.nxSchemaProbeState().completed,1);assert.equal(partial.core.health().authenticationStopped,true);
 assert.equal(await partial.alarmAt(),null);assert.equal(partial.calls.length,8);
});

test('NX429 RetryAfter persists; retries chargeoldledger and never reset twojob identity',async t=>{
 const f=fixture(t);await initial(f);enable(f);f.respond(async()=>new Response(null,{status:429,headers:{'retry-after':'120'}}));await f.scheduler.kick();await f.fire();
 assert.equal(f.calls.length,7);const due=await f.alarmAt();assert.ok(due>=f.calls[6].at+120000);
 assert.equal((await f.core.runOne()).status,'backoff');assert.equal(f.calls.length,7);
 f.restart();assert.equal(await f.alarmAt(),due);f.respond(async()=>new Response('{}',{headers:{'content-type':'application/json'}}));
 await f.fire();await f.fire();assert.equal(f.calls.length,9);assert.equal(f.core.health().attempts,9);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_jobs').n,8);
 assert.equal(f.core.nxSchemaProbeState().status,'complete');
});

test('permanentNX failure pauses remainingNXonly for review; featuretoggle cannot reset failedjob',async t=>{
 const f=fixture(t);await initial(f);enable(f);f.respond(async()=>new Response(null,{status:404}));await f.scheduler.kick();await f.fire();
 assert.equal(f.calls.length,7);assert.equal(f.core.health().authenticationStopped,false);
 assert.equal(f.core.nxSchemaProbeState().status,'permanent_failure_needs_review');assert.equal(await f.alarmAt(),null);
 enable(f,{nxSchemaProbesEnabled:false});await f.scheduler.kick();enable(f);await f.scheduler.kick();
 assert.equal(f.calls.length,7);assert.equal(await f.alarmAt(),null);
 assert.equal(f.row('SELECT state FROM api_jobs WHERE operation=?','nx-history').state,'pending');
});

test('flagdisable retains queuedNXwithout running; recurrenceandmanualscheduledNX remain forbidden',async t=>{
 const f=fixture(t);await initial(f);enable(f);await f.scheduler.kick();enable(f,{nxSchemaProbesEnabled:false});await f.scheduler.kick();
 assert.equal(await f.alarmAt(),null);assert.equal(f.calls.length,6);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_jobs').n,8);
 f.restart();enable(f);await f.scheduler.kick();await f.fire();await f.fire();assert.equal(f.calls.length,8);
 assert.throws(()=>scheduleConfig({API_SCHEDULE_JSON:JSON.stringify({...SCHEDULE,recurring:[{operation:'nx-rate',intervalSeconds:300,priority:1}]})}));
 assert.throws(()=>f.core.enqueueScheduledOperation({jobKey:'synthetic-r1:r:nx-rate',operation:'nx-rate',availableAt:f.now[0]}));
});

test('privatehealth adds separateexacttwoNXreceiptindex, retains initialsix index and never mirrorsrawdata',async t=>{
 const f=fixture(t);await initial(f);enable(f);f.respond(async()=>new Response('{"raw_personal":"MUST-NOT-COPY-TO-HEALTH"}',{headers:{'content-type':'application/json'}}));
 await f.scheduler.kick();await f.fire();await f.fire();await f.mirror.afterRun({status:'success'});
 const body=f.objects.get('_private/provider-api/v1/health.json').body,h=JSON.parse(body);
 assert.equal(h.completedReceipts.length,6);assert.deepEqual(h.completedNxProbeReceipts.map(row=>row.operation),NX);
 assert.deepEqual(h.nxSchemaProbes,{status:'complete',completed:2});assert.equal(h.schemaVerified,false);assert.equal(h.publicationEligible,false);assert.equal(h.sourceObservedAt,null);
 assert.ok(!body.includes('MUST-NOT-COPY-TO-HEALTH'));assert.ok(!body.includes(KEY));
 for(const row of h.completedNxProbeReceipts)assert.deepEqual(Object.keys(row),['operation','receiptKey','roundReference']);
});
