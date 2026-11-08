import test from 'node:test';import assert from 'node:assert/strict';
import{setup,noIO,deferred,tick}from'./overview-window-fixture.mjs';
import{activityScopeKey}from'../ops/api-overview-activity-storage-contract.mjs';
import{createOverviewActivityReader}from'../ops/api-overview-activity-reader.mjs';
async function current(g){for(let n=0;n<6;n++)assert.notEqual((await g.d.drainOne(noIO)).status,'activity_action_hold');assert.equal(g.d.pending(),null);assert(g.d.current());}
test('rapid equal-capture publications backpressure at six; retirement grace uses publication clocks and preserves just-read old body',async t=>{
 const g=await setup(t),raw=g.rawOverview();let first;
 for(let n=0;n<6;n++){await g.accept(g.seed(raw));await current(g);if(n===0)first=g.d.current();}
 const key=activityScopeKey(g.d.scopeHash),firstBody=key+'objects/'+first.body_sha+'.json',old=g.d.garbage();assert(g.f.objects.has(firstBody));assert.equal(g.f.row('SELECT COUNT(*)n FROM overview_activity_generations').n,6);assert.equal([...g.f.objects.keys()].filter(k=>k.startsWith(key)).length,7);
 assert.equal(JSON.parse(first.body).source.capturedAt,JSON.parse(g.d.current().body).source.capturedAt);assert.notEqual(first.gid,g.d.current().gid);assert.equal(old.retired_at,g.f.now[0]);
 await g.accept(g.seed(raw));const starts=g.f.reads.length+g.f.puts.length;assert.equal((await g.d.drainOne(noIO)).status,'activity_retention_grace_backpressure');assert.equal(g.f.reads.length+g.f.puts.length,starts);assert(g.f.objects.has(firstBody));
 // A pointer already acquired can consume its old body throughout the declared
 // 30s cache +2.5s read horizon; no visitor lease or source-capture redating.
 g.f.now[0]+=32500;assert.equal((await g.d.drainOne(noIO)).status,'activity_retention_grace_backpressure');assert(g.f.objects.has(firstBody));
 g.f.now[0]+=2500;assert.equal((await g.d.drainOne(noIO)).status,'activity_obsolete_summary_deleted');assert.equal(g.f.objects.has(firstBody),false);assert.equal((await g.d.drainOne(noIO)).status,'activity_obsolete_reference_released');
 await g.publish();assert.equal(g.f.row('SELECT COUNT(*)n FROM overview_activity_generations').n,3);assert.equal([...g.f.objects.keys()].filter(k=>k.startsWith(key)).length,4);assert.equal(g.f.provider.length,0);
});
test('forward wall jump alone cannot retire history; cold owner adds fresh monotonic recovery grace',async t=>{
 const g=await setup(t);for(let n=0;n<4;n++){await g.accept(g.seed(g.rawOverview({factor:n+1})));await current(g);}const old=g.d.garbage();let mono=g.d.mono();g.d.mono=()=>mono;g.f.now[0]+=3600000;assert(g.d.retirementDue(old)>g.f.now[0]);const key=activityScopeKey(g.d.scopeHash)+'objects/'+old.body_sha+'.json';assert(g.f.objects.has(key));
 await g.f.restart();const d=g.d;assert(d.retirementDue(d.garbage())>=g.f.now[0]+35000);assert(g.f.objects.has(key));g.f.now[0]+=34999;assert(d.retirementDue(d.garbage())>g.f.now[0]);g.f.now[0]++;assert.equal((await d.drainOne(noIO)).status,'activity_obsolete_summary_deleted');assert.equal(g.f.objects.has(key),false);
});
test('pointer changes after old body read: closing same-pointer fence refuses current without retry',async t=>{
 const g=await setup(t);await g.accept(g.seed());await current(g);const old=g.d.current(),key=activityScopeKey(g.d.scopeHash),oldPointer=g.f.objects.get(key+'current.json'),entered=deferred(),held=deferred();let calls=0;const bucket={async get(k){calls++;if(calls===2){entered.resolve();await held.promise;}return g.f.bucket.get(k);}},reader=createOverviewActivityReader({enabled:true,bucket,scopeHash:g.d.scopeHash});const reading=reader.read();await entered.promise;await g.accept(g.seed(g.rawOverview({factor:2})));await current(g);assert(g.f.objects.has(key+'objects/'+old.body_sha+'.json'));assert.notEqual(g.f.objects.get(key+'current.json').body,oldPointer.body);held.resolve();const result=await reading;assert.equal(result.status,'unavailable');assert.equal(result.currentAgainstPublishedPointer,false);assert.equal(calls,3);assert.equal(reader.physicalPending,false);
});
test('final pointer read held remains physically reserved across Off and new scope',async t=>{
 const g=await setup(t);await g.accept(g.seed());await current(g);const held=deferred(),entered=deferred(),controller=new AbortController();let calls=0;const bucket={async get(k){calls++;if(calls===3){entered.resolve();await held.promise;}return g.f.bucket.get(k);}},reader=createOverviewActivityReader({enabled:true,bucket,scopeHash:g.d.scopeHash}),reading=reader.read({signal:controller.signal});await entered.promise;controller.abort();reader.setEnabled(false);assert.equal((await reading).currentAgainstPublishedPointer,false);assert.equal(reader.physicalPending,true);const other=createOverviewActivityReader({enabled:true,bucket,scopeHash:'f'.repeat(64)});assert.equal((await other.read()).status,'unavailable');assert.equal(calls,3);held.resolve();for(let n=0;n<20;n++)await tick();assert.equal(reader.physicalPending,false);assert.equal(calls,3);
});
