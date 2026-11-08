import test from'node:test';import assert from'node:assert/strict';
import{setup,noIO}from'./overview-window-fixture.mjs';
import{isOwnedOverviewActivityDelegate,overviewActivityConfiguration,createOverviewActivityRegistration}from'../ops/api-overview-activity-registration.mjs';
test('actual existing registry delegate is branded, no extra mux kind and base physical state suppresses fairness source bonus',async t=>{
 const g=await setup(t),slot=g.f.owner.privateCash.recurringWork,base=slot.base;assert(isOwnedOverviewActivityDelegate(slot,g.f.core.ctx,g.f.core,g.f.owner.recurring));assert.equal(slot.registry,g.f.owner.recurring.registry);assert.equal(slot.original,g.f.owner.recurring);assert.equal(g.f.owner.overviewActivityRegistration.wrap({}),null);
 const before=g.f.owner.privateCash.fairState({provider_turn_debt:0,last_derived_kind:null});assert.equal(before.includes('activity'),false);g.f.owner.recurring.registry.flight=Promise.resolve();assert.equal(slot.physicalPending,true);assert.equal(g.f.owner.privateCash.fairPhysicalPending(),true);g.f.owner.recurring.registry.flight=null;assert.equal(slot.base,base);assert.equal(g.f.provider.length,0);
});
test('mutable grant/round/shared profile mismatch disables derivative without touching completed source or SDK',async t=>{
 const g=await setup(t),s=g.seed();await g.accept(s);const starts=g.f.puts.length+g.f.reads.length;g.f.env.API_SHARED_OVERVIEW_PROFILE_JSON='{"enabled":false}';assert.equal((await g.d.drainOne(noIO)).status,'activity_disabled');assert.equal(g.f.puts.length+g.f.reads.length,starts);assert.equal(g.f.row('SELECT state FROM api_jobs WHERE job_key=?',s.jobKey).state,'complete');
});
test('strict explicit configs reject owner-as-grant/extra keys/publication widening and registration foreign identity',async t=>{
 const g=await setup(t),original=JSON.parse(g.f.env.API_OVERVIEW_ACTIVITY_JSON);for(const edit of [v=>v.grantReference='maplestory-market-account-primary-v1',v=>v.publicationEnabled=true,v=>v.epoch='Uppercase',v=>v.extra=1]){const v={...original};edit(v);assert.equal(overviewActivityConfiguration({API_OVERVIEW_ACTIVITY_JSON:JSON.stringify(v)}).status,'invalid');}
 assert.equal(await createOverviewActivityRegistration({},g.f.env,g.f.core,g.f.owner.recurring),null);assert.equal(g.f.provider.length,0);
});
