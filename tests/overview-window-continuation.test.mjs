import test from 'node:test';import assert from 'node:assert/strict';
import {setup,sha,noIO,deferred,tick} from './overview-window-fixture.mjs';
import {OverviewActivityDelivery} from '../ops/api-overview-activity-delivery.mjs';
import {createOverviewActivityRegistration,overviewActivityConfiguration} from '../ops/api-overview-activity-registration.mjs';

test('absent/Off/malformed private profile performs no Core/bucket/SQL access',async()=>{
 const forbidden=new Proxy({},{get(){throw Error('forbidden_core');}});
 for(const value of [undefined,'{"enabled":false}','not JSON','{"enabled":true}','{"enabled":false,"extra":1}']){
  const env=value===undefined?{}:{API_OVERVIEW_ACTIVITY_JSON:value};assert.equal(await createOverviewActivityRegistration(forbidden,env,forbidden,forbidden),null);assert.notEqual(overviewActivityConfiguration(env).status,'ready');
 }
});
test('actual factory absent registration preserves original slot and SQL schema',async t=>{
 const g=await setup(t,{enabled:false,actualRuntime:false});assert.equal(g.f.owner.overviewActivityRegistration,undefined);assert.equal(g.f.row("SELECT COUNT(*)n FROM sqlite_master WHERE name LIKE 'overview_activity_%'").n,0);assert.equal(g.f.owner.privateCash.recurringWork,g.f.owner.recurring);assert.equal(g.f.provider.length,0);
});
test('continuing70 accepted receipts reuse64 SQL slots, retain only bounded derived bodies, never delete raw',async t=>{
 const g=await setup(t);let first=null;const rawKeys=[];
 for(let n=0;n<70;n++){
  const at=new Date(Date.parse('2026-11-06T12:00:01.000Z')+n*60000).toISOString();g.f.now[0]=Math.max(g.f.now[0],Date.parse(at)+1000);const s=g.seed(g.rawOverview({factor:n+1}),at);rawKeys.push(s.receiptKey);if(!first)first=s;
  await g.accept(s);const states=await g.publish();assert(states.includes('activity_current_readback_confirmed'),JSON.stringify({n,states}));
  assert(g.f.row('SELECT COUNT(*)n FROM overview_activity_receipts').n<=64);assert(g.f.row('SELECT COUNT(*)n FROM overview_activity_generations').n<=4);
 }
 const names=[...g.f.objects.keys()].filter(k=>k.includes('/derived/overview-window-activity-v1/'));assert(names.length<=4,names.length);assert(rawKeys.every(k=>g.f.objects.has(k)));assert(g.d.control().released_sources>=6);assert.equal(g.f.row('SELECT COUNT(*)n FROM api_attempts').n,70);assert.equal(g.f.provider.length,0);
 assert.equal(g.f.row('SELECT state FROM api_jobs WHERE job_key=?',first.jobKey).state,'complete');assert.equal(g.f.row('SELECT COUNT(*)n FROM recurring_registry_captures').n,70);
});
test('equal sums/raw/capture values with distinct owned receipts still change generation and witness',async t=>{
 const g=await setup(t),body=g.rawOverview();const a=g.seed(body);await g.accept(a);await g.publish();const first=JSON.parse(g.d.current().body);const b=g.seed(body);await g.accept(b);await g.publish();const second=JSON.parse(g.d.current().body);assert.deepEqual(second.counterSums,first.counterSums);assert.deepEqual(second.source,first.source);assert.notEqual(second.generation,first.generation);assert.notEqual(second.sourceWitnessSha256,first.sourceWitnessSha256);assert.equal(g.f.reads.filter(k=>k===b.receiptKey).length,1);
});
test('normal cold constructor resumes pending immutable phases and confirmed head',async t=>{
 const g=await setup(t),s=g.seed();await g.accept(s);assert.equal((await g.d.drainOne(noIO)).status,'activity_summary_staged');await g.f.restart();assert(g.d);const statuses=await g.publish();assert(statuses.includes('activity_current_readback_confirmed'),JSON.stringify(statuses));assert.equal(JSON.parse(g.d.current().body).source.capturedAt,s.e.capturedAt);
});
test('crash after pointer PUT but before SQL phase ACK recovers from exact target without second PUT',async t=>{
 const g=await setup(t);await g.accept(g.seed());for(let n=0;n<4;n++)assert.notEqual((await g.d.drainOne(noIO)).status,'activity_action_hold');assert.equal(g.d.pending().phase,'pointer');let fault=true;const exec=g.d.exec.bind(g.d);g.d.exec=(q,...a)=>{if(fault&&q.includes("SET phase='readback'")){fault=false;throw Error('synthetic_ack_cutpoint');}return exec(q,...a);};assert.equal((await g.d.drainOne(noIO)).status,'activity_action_hold');const writes=g.f.puts.filter(k=>k.endsWith('/current.json')).length;await g.f.restart();const statuses=await g.publish();assert(statuses.includes('activity_pointer_recovered'),JSON.stringify(statuses));assert(statuses.includes('activity_current_readback_confirmed'));assert.equal(g.f.puts.filter(k=>k.endsWith('/current.json')).length,writes);
});
test('held actual PUT keeps physical slot through expiry/Off and no second SDK or ACK',async t=>{
 const g=await setup(t);await g.accept(g.seed());await g.d.drainOne(noIO);let mono=0;g.d.mono=()=>mono;const held=deferred(),entered=deferred();g.f.hook(async(kind,key)=>{if(kind==='put'&&key.includes('/overview-window-activity-v1/')){entered.resolve();await held.promise;}});
 const action=g.d.drainOne(noIO);await entered.promise;const count=g.f.puts.length;mono=30001;assert.equal((await g.d.drainOne(noIO)).status,'activity_physical_or_unknown_hold');assert.equal(g.f.puts.length,count);g.f.env.API_OVERVIEW_ACTIVITY_JSON='{"enabled":false}';held.resolve();assert.equal((await action).status,'activity_action_hold');assert.equal(g.d.pending().phase,'body_write');assert.equal(g.d.current(),null);assert.equal(g.d.pool.task,null);assert.equal(g.f.provider.length,0);
});
test('source mutation at final SQL ACK rolls back phase and never confirms current',async t=>{
 const g=await setup(t),source=g.seed();await g.accept(source);await g.d.drainOne(noIO);const before=g.d.pending().phase;let mutate=true;const cap=g.d.capacity.bind(g.d);g.d.capacity=()=>{const v=cap();if(mutate&&g.f.row("SELECT phase FROM overview_activity_generations WHERE role='pending'")?.phase==='body_readback'){mutate=false;g.f.exec("UPDATE api_attempts SET result='changed' WHERE id=?",source.id);}return v;};assert.equal((await g.d.drainOne(noIO)).status,'activity_action_hold');assert.equal(g.d.pending().phase,before);assert.equal(g.d.current(),null);assert.equal(g.f.row('SELECT result FROM api_attempts WHERE id=?',source.id).result,'success');
});
test('auth stop before publication yields zero SDK and original source remains completed',async t=>{
 const g=await setup(t),s=g.seed();await g.accept(s);const reads=g.f.reads.length,puts=g.f.puts.length;g.f.exec('UPDATE api_control SET auth_stopped=1 WHERE id=1');assert.equal((await g.d.drainOne(noIO)).status,'activity_disabled');assert.equal(g.f.reads.length,reads);assert.equal(g.f.puts.length,puts);assert.equal(g.f.row('SELECT state FROM api_jobs WHERE job_key=?',s.jobKey).state,'complete');
});
test('HotOff optional profile does not block the original overview registry path',async t=>{
 const g=await setup(t);g.f.env.API_OVERVIEW_ACTIVITY_JSON='{"enabled":false}';const s=g.seed();await g.accept(s);assert.equal(g.f.row('SELECT state FROM recurring_registry_jobs WHERE receipt_key=?',s.receiptKey).state,'complete');assert.equal(g.f.row('SELECT COUNT(*)n FROM overview_activity_receipts').n,0);assert.equal(g.f.provider.length,0);
});
