import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ApiCollectorCore,OPERATIONS,OWNER_NAME} from '../ops/api-collector-core.mjs';
import {ApiCollectorCore as NxCore} from '../ops/api-collector-core.mjs';
import {ApiAlarmScheduler} from '../ops/api-alarm-scheduler.mjs';
import {loadObservedPlan,ObservedFirstPass} from '../ops/api-observed-firstpass.mjs';
import {ApiPrivateHealth} from '../ops/api-private-health.mjs';
const raw=observedPlanBytes();
import {observedPlanBytes} from '../ops/observed-firstpass-plan.mjs';
const PLAN_HASH='a271b2597096100cb8fa18c123f16a845ff9471b78deea2f61d0823ce427ccd8';
const actual=await loadObservedPlan(raw,PLAN_HASH),KEY='SYNTHETIC-OFFLINE-NONISSUED';
const SIX=['status','prices','catalogue','overview','apple-detail','apple-history'];
const START=Date.parse('2026-11-05T00:00:00Z');
const GRANT={enabled:true,approvalRecorded:true,exclusiveAccountOwnerConfirmed:true,grantReference:'synthetic-approved',grantedPerMinute:30,grantedPerDay:null,operatorDailyRequestCap:30000,minimumRequestIntervalSeconds:2.5,higherFrequencyExplicitlyGranted:true,allowedOperations:SIX,probeRound:'synthetic-round',publicationEnabled:false};
async function small(count=2){const input=JSON.parse(new TextDecoder().decode(raw));input.targets=input.targets.slice(0,count);input.summary.counts.allObservedIds=count;input.summary.counts.priorityIds=input.targets.filter(t=>t.priority).length;input.summary.proposedFiniteFirstPassRequests=count*2;const body=new TextEncoder().encode(JSON.stringify(input));return loadObservedPlan(body,createHash('sha256').update(body).digest('hex'));}
function fixture(t,{plan=actual,grant=GRANT,off=false,nx=false,chunk=32,highWater=64,maxAttempts=3,recurring=[]}={}){
 const directory=mkdtempSync(path.join(tmpdir(),'astra-firstpass-'));const file=path.join(directory,'fixture.sqlite');let db,core,scope,scheduler,alarm=null,sequence=0;
 const now=[START],calls=[],objects=new Map();let failOrdinal=null,responder=async()=>new Response('{"name":null}',{headers:{'content-type':'application/json'}});
 const config={enabled:true,approvalRecorded:true,planSha256:plan.hash,queueReference:'firstpass-v1',roundReference:grant.probeRound,grantReference:grant.grantReference,chunkSize:chunk,maxQueuedJobs:highWater,maxAttemptsPerJob:maxAttempts};
 const bucket={async get(name){const row=objects.get(name);return row?{etag:row.etag,json:async()=>JSON.parse(row.body)}:null;},async put(name,body,options){const old=objects.get(name),cond=options?.onlyIf;if(cond?.etagDoesNotMatch==='*'&&old||cond?.etagMatches&&old?.etag!==cond.etagMatches)return null;const row={body,etag:String(++sequence)};objects.set(name,row);return row;}};
 const env={API_GRANT_JSON:JSON.stringify(grant),API_OBSERVED_FIRSTPASS_JSON:JSON.stringify(off?{enabled:false}:config),API_SCHEDULE_JSON:JSON.stringify({enabled:true,scheduleReference:'synthetic-alarm',requestIntervalMilliseconds:2500,startupTargetSeconds:21600,recurring}),API_RAW_RECEIPTS:bucket,MAPLESTORY_MARKET_APPROVED_API_KEY:KEY};
 function open(){db=new DatabaseSync(file);const storage={sql:{exec(query,...args){if(failOrdinal!==null&&query.startsWith('INSERT INTO api_observed_jobs')&&args[5]===failOrdinal){failOrdinal=null;throw Error('synthetic atomic enqueue interruption');}const statement=db.prepare(query),rows=statement.columns().length?statement.all(...args):(statement.run(...args),[]);return{toArray:()=>rows};}},transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}},async setAlarm(value){alarm=value;},async deleteAlarm(){alarm=null;}};const ctx={storage};scope=new ObservedFirstPass(ctx,env,plan);core=new(nx?NxCore:ApiCollectorCore)(ctx,env,{observedScope:scope,now:()=>now[0],jitter:()=>0,fetcher:async(url,options)=>{calls.push({url,options,at:now[0]});return responder(url,options);}});scheduler=new ApiAlarmScheduler(ctx,env,core,{firstPass:scope});}
 open();t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
 return{env,config,now,calls,objects,get core(){return core;},get scope(){return scope;},get scheduler(){return scheduler;},row(q,...a){return db.prepare(q).get(...a);},rows(q,...a){return db.prepare(q).all(...a);},restart(){db.close();open();},failEnqueueOnce(ordinal){failOrdinal=ordinal;},respond(fn){responder=fn;},get alarm(){return alarm;},async fire(){assert.notEqual(alarm,null);now[0]=Math.max(now[0],alarm);alarm=null;return scheduler.alarm();},receipt(operation){const object=[...objects.values()].map(o=>JSON.parse(o.body)).filter(o=>o.operation===operation).at(-1);return object;}};
}

test('actual hash-pinned1551/3102 plan includes79 priorities and50fashion, no names invented',()=>{
 assert.equal(actual.targets.length,1551);assert.equal(actual.totalJobs,3102);assert.equal(actual.targets.filter(t=>t.priority).length,79);assert.equal(actual.targets.filter(t=>t.supplementalFashionIdentity).length,50);
 assert(actual.targets.slice(0,79).every(t=>t.priority));assert(actual.targets.slice(79).every(t=>!t.priority));assert.equal(OWNER_NAME,'maplestory-market-account-primary-v1');
 assert.deepEqual(Object.keys(OPERATIONS).slice(0,6),SIX);assert.equal(actual.targets.filter(t=>t.apiPresence.length===0).length,16);
});
test('pin/schema/duplicate IDs fail closed without queue writes',async()=>{
 await assert.rejects(loadObservedPlan(raw,'0'.repeat(64)),/hash/);
 const value=JSON.parse(new TextDecoder().decode(raw));value.targets[1]=value.targets[0];const body=new TextEncoder().encode(JSON.stringify(value));await assert.rejects(loadObservedPlan(body,createHash('sha256').update(body).digest('hex')),/identity/);
});
test('default off adds no dynamic jobs or secret read',async t=>{
 const f=fixture(t,{off:true});Object.defineProperty(f.env,'MAPLESTORY_MARKET_APPROVED_API_KEY',{get(){throw Error('must not read key');}});
 assert.equal(f.scope.enqueueChunk(f.core).status,'firstpass_disabled');assert.equal(f.row('SELECT COUNT(*) AS n FROM api_jobs').n,0);assert.equal(f.calls.length,0);
});
test('bounded chunk enqueue persists cursor and high-water idempotently over restart',t=>{
 const f=fixture(t);let result=f.scope.enqueueChunk(f.core);assert.equal(result.enqueued,32);assert.equal(result.cursor,32);result=f.scope.enqueueChunk(f.core);assert.equal(result.cursor,64);assert.equal(f.scope.enqueueChunk(f.core).enqueued,0);f.restart();assert.equal(f.scope.enqueueChunk(f.core).cursor,64);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_observed_jobs').n,64);assert.equal(f.calls.length,0);
 const operation=f.rows('SELECT operation FROM api_observed_jobs ORDER BY ordinal LIMIT1'.replace('LIMIT1','LIMIT 1'))[0].operation;assert.equal(f.scope.path(operation,f.core.config()),'/api/items/'+actual.targets[0].itemId);
 assert.equal(f.scope.definition('observed-detail-1'),null);assert.equal(f.scope.definition('observed-detail-1002156?x=y'),null);
});
test('six original identities execute first then priority IDs, no name echo required',async t=>{
 const f=fixture(t);await f.scheduler.kick();for(let i=0;i<170;i++)await f.fire();
 assert.deepEqual(f.calls.slice(0,6).map(c=>new URL(c.url).pathname),Object.values(OPERATIONS).slice(0,6));
 const paths=f.calls.slice(6,164).map(c=>new URL(c.url).pathname);assert.equal(paths.length,158);assert(paths.every((p,index)=>p===`/api/items/${actual.targets[Math.floor(index/2)].itemId}${index%2?'/history':''}`));
 const first=f.receipt('observed-detail-'+actual.targets[0].itemId);assert.equal(first.expectedItemName,null);assert.equal(first.publicationEligible,false);assert.equal(first.sourceObservedAt,null);assert.equal(first.observedPlanSha256,actual.hash);assert.deepEqual(first.sourcePresence,[...actual.targets[0].apiPresence]);
 for(let i=1;i<f.calls.length;i++)assert(f.calls[i].at-f.calls[i-1].at>=2500);assert(f.calls.every(c=>f.calls.filter(other=>other.at<=c.at&&other.at>c.at-60000).length<=24));
});
test('full1551 finite firstpass drains once, cursor/receipts survive restart without requeue',async t=>{
 const f=fixture(t);await f.scheduler.kick();let ticks=0;while(f.alarm!==null&&ticks++<3200){await f.fire();if(ticks===1550)f.restart();}
 assert.equal(f.calls.length,3108);assert.equal(f.row('SELECT cursor FROM api_observed_plans').cursor,3102);assert.notEqual(f.row('SELECT completed_at FROM api_observed_plans').completed_at,null);assert.equal(f.alarm,null);assert.equal(f.scope.enqueueChunk(f.core).status,'firstpass_complete');assert.equal(f.scope.enqueueChunk(f.core).enqueued,0);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,3108);assert.equal(new Set(f.rows('SELECT job_key FROM api_jobs').map(r=>r.job_key)).size,3108);
});
test('dynamic404 is per-job unavailable and does not stop auth or other IDs',async t=>{
 const plan=await small(2),f=fixture(t,{plan});await f.scheduler.kick();for(let i=0;i<6;i++)await f.fire();
 f.respond(async()=>new Response(null,{status:404}));assert.equal((await f.fire()).status,'unavailable');assert.equal(f.row('SELECT auth_stopped FROM api_control').auth_stopped,0);assert.equal(f.row("SELECT COUNT(*) AS n FROM api_jobs WHERE state='unavailable'").n,1);f.respond(async()=>new Response('{}',{headers:{'content-type':'application/json'}}));while(f.alarm!==null)await f.fire();assert.equal(f.calls.length,10);
});
test('429 retries same job/ledger, preserves cooldown even at bounded retry exhaustion',async t=>{
 const f=fixture(t,{plan:await small(1)});await f.scheduler.kick();for(let i=0;i<6;i++)await f.fire();
 f.respond(async()=>new Response(null,{status:429,headers:{'retry-after':'60'}}));for(let i=0;i<3;i++){const before=f.calls.length;await f.fire();assert.equal(f.calls.length,before+1);assert(f.alarm>=f.calls.at(-1).at+60000);}
 assert.equal(f.row("SELECT state FROM api_jobs WHERE operation LIKE 'observed-detail-%'").state,'unavailable');assert.equal(f.row("SELECT COUNT(*) AS n FROM api_attempts WHERE job_key LIKE '%:detail'").n,3);assert.equal(f.row('SELECT auth_stopped FROM api_control').auth_stopped,0);
});
test('401/403 globally stop same-owner old/new work through restart',async t=>{
 for(const status of[401,403]){const f=fixture(t,{plan:await small(1)});await f.scheduler.kick();for(let i=0;i<6;i++)await f.fire();f.respond(async()=>new Response(null,{status}));await f.fire();f.restart();const before=f.calls.length;assert.equal((await f.scheduler.kick()).status,'authentication_stopped');assert.equal(f.calls.length,before);assert.equal(f.alarm,null);}
});
test('actual daily cap applies to old and dynamic starts, plan does not replace grant with30000',async t=>{
 const f=fixture(t,{plan:await small(2),grant:{...GRANT,operatorDailyRequestCap:8}});await f.scheduler.kick();while(f.calls.length<8)await f.fire();assert.equal(f.core.dailyCap(f.core.config()),8);assert(f.alarm>=f.calls[0].at+86400000);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,8);
});
test('unregistered/wrong-round operations never fetch and config drift cannot advance cursor',async t=>{
 const f=fixture(t,{plan:await small(1)});f.scope.enqueueChunk(f.core);f.core.sql.exec('INSERT INTO api_jobs(job_key,operation,round_ref,available_at) VALUES(?,?,?,?)','a-forged','observed-detail-1',GRANT.probeRound,START);
 f.env.API_OBSERVED_FIRSTPASS_JSON=JSON.stringify({...f.config,chunkSize:1});assert.equal(f.scope.enqueueChunk(f.core).status,'firstpass_definition_changed_requires_review');f.env.API_OBSERVED_FIRSTPASS_JSON=JSON.stringify(f.config);
 await f.core.runOne();assert(!f.calls.some(c=>c.url==='https://maplestory.market/api/items/1'));f.env.API_GRANT_JSON=JSON.stringify({...GRANT,probeRound:'new-round'});f.now[0]+=2500;assert.equal((await f.core.runOne()).status,'idle');
});
test('existing recurring operation wins when due while finite queue remains',async t=>{
 const f=fixture(t,{plan:await small(10),recurring:[{operation:'status',intervalSeconds:10,priority:1}]});await f.scheduler.kick();for(let i=0;i<6;i++)await f.fire();f.now[0]+=10000;await f.scheduler.kick();await f.fire();assert(f.calls.at(-1).url.endsWith('/api/status'));assert(f.row('SELECT cursor FROM api_observed_plans').cursor>0);
});
test('reviewed optional NX effectiveOperations union keeps fixed6 thenNX6/7 then observed work',async t=>{
 const f=fixture(t,{plan:await small(1),nx:true,grant:{...GRANT,nxSchemaProbesEnabled:true,allowedOperations:[...SIX,'nx-rate','nx-history']}});await f.scheduler.kick();while(f.alarm!==null)await f.fire();assert.equal(f.calls.length,10);assert.deepEqual(f.calls.slice(0,6).map(c=>new URL(c.url).pathname),Object.values(OPERATIONS).slice(0,6));assert(f.calls[6].url.endsWith('/api/nx-rate'));assert(f.calls[7].url.endsWith('/api/nx-rate/history?range=7d&step=hour'));assert(f.calls[8].url.includes('/api/items/'));
});
test('interrupted chunk insertion rolls back cursor and both job tables',t=>{
 const f=fixture(t);f.failEnqueueOnce(1);assert.throws(()=>f.scope.enqueueChunk(f.core),/synthetic/);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_observed_jobs').n,0);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_jobs').n,0);f.restart();assert.equal(f.scope.enqueueChunk(f.core).cursor,32);
});
test('expired dynamic leases keep all reserved attempts and stop after retry cap without fourth fetch',async t=>{
 const f=fixture(t,{plan:await small(1)});f.scope.enqueueChunk(f.core);
 for(let i=0;i<3;i++){assert.equal(f.core.claim(f.core.config()).status,'claimed');f.restart();f.now[0]+=120001;}
 const outcome=await f.core.runOne();assert.equal(outcome.status,'success');assert.equal(f.row("SELECT state FROM api_jobs WHERE operation LIKE 'observed-detail-%'").state,'unavailable');assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,4);assert.equal(f.calls.length,1);assert(f.calls[0].url.endsWith('/history'));
});
test('forged registered key/ordinal/source presence is rejected before reserving an attempt',async t=>{
 const f=fixture(t,{plan:await small(1)});f.scope.enqueueChunk(f.core);const target=f.scope.plan.targets[0];
 f.core.sql.exec('INSERT INTO api_observed_jobs(job_key,plan_hash,operation,item_id,kind,ordinal,presence_json) VALUES(?,?,?,?,?,?,?)','a-forged',f.scope.plan.hash,`observed-detail-${target.itemId}`,target.itemId,'detail',1000,JSON.stringify(target));
 f.core.sql.exec('INSERT INTO api_jobs(job_key,operation,round_ref,available_at) VALUES(?,?,?,?)','a-forged',`observed-detail-${target.itemId}`,GRANT.probeRound,START);
 await f.core.runOne();assert.equal(f.row("SELECT state FROM api_jobs WHERE job_key='a-forged'").state,'unavailable');assert.equal(f.row("SELECT COUNT(*) AS n FROM api_attempts WHERE job_key='a-forged'").n,0);assert.equal(f.calls.length,1);
 const f2=fixture(t,{plan:await small(1)});f2.scope.enqueueChunk(f2.core);f2.core.sql.exec("UPDATE api_observed_jobs SET presence_json='{}' WHERE kind='detail'");await f2.core.runOne();assert.equal(f2.calls.length,1);assert(f2.calls[0].url.endsWith('/history'));assert.equal(f2.row('SELECT COUNT(*) AS n FROM api_attempts').n,1);
});
test('equivalent configuration key order does not reset/version the cursor',t=>{
 const f=fixture(t);assert.equal(f.scope.enqueueChunk(f.core).cursor,32);f.env.API_OBSERVED_FIRSTPASS_JSON=JSON.stringify(Object.fromEntries(Object.entries(f.config).reverse()));assert.equal(f.scope.enqueueChunk(f.core).cursor,64);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_observed_plans').n,1);
});
test('private health preserves unavailable vs failed and exposes only bounded aggregate plan progress',async t=>{
 const f=fixture(t,{plan:await small(1)});await f.scheduler.kick();for(let i=0;i<6;i++)await f.fire();f.respond(async()=>new Response(null,{status:404}));await f.fire();f.respond(async()=>new Response(null,{status:400}));await f.fire();
 const mirror=new ApiPrivateHealth(f.core.ctx,f.env,f.core);await mirror.afterRun({status:'unavailable'});
 const health=JSON.parse(f.objects.get('_private/provider-api/v1/health.json').body),progress=health.observedFirstPass;
 assert.equal(health.result,'unavailable');assert(health.jobs.some(row=>row.state==='unavailable'&&row.count===1));assert(health.jobs.some(row=>row.state==='failed'&&row.count===1));assert.equal(progress.status,'complete_with_failures');assert.equal(progress.completeCount,0);assert.equal(progress.unavailableCount,1);assert.equal(progress.failedCount,1);assert.equal(progress.plannedJobCount,2);assert.equal(progress.remainingToEnqueue,0);
 const serialized=JSON.stringify(progress);for(const forbidden of[KEY,GRANT.grantReference,GRANT.probeRound,OWNER_NAME,String(f.scope.plan.targets[0].itemId),'receiptKey','payload','sourcePresence'])assert(!serialized.includes(forbidden));assert.equal(health.sourceObservedAt,null);assert.equal(health.publicationEligible,false);
});


test('independent: valid ordinal cannot be rebound to another pinned ID and duplicate ordinal is atomic',async t=>{
 const f=fixture(t,{plan:await small(2)});f.scope.enqueueChunk(f.core);const [a,b]=f.scope.plan.targets;
 const row=f.row('SELECT * FROM api_observed_jobs WHERE ordinal=0');
 assert.throws(()=>f.core.sql.exec('INSERT INTO api_observed_jobs(job_key,plan_hash,operation,item_id,kind,ordinal,presence_json) VALUES(?,?,?,?,?,?,?)','another',f.scope.plan.hash,row.operation,row.item_id,row.kind,row.ordinal,row.presence_json),/UNIQUE/);
 f.core.sql.exec('UPDATE api_observed_jobs SET item_id=?,operation=?,presence_json=? WHERE ordinal=0',b.itemId,`observed-detail-${b.itemId}`,JSON.stringify(b));
 f.core.sql.exec('UPDATE api_jobs SET operation=? WHERE job_key=?',`observed-detail-${b.itemId}`,row.job_key);
 await f.core.runOne();assert.equal(f.row('SELECT state FROM api_jobs WHERE job_key=?',row.job_key).state,'unavailable');
 assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts WHERE job_key=?',row.job_key).n,0);assert.equal(f.calls.length,1);assert(f.calls[0].url.endsWith(`/api/items/${a.itemId}/history`));
});
