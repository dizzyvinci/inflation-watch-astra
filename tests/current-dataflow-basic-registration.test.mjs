import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {fixture} from './fixtures/current-dataflow-basic-fixture.mjs';
import {basicCurrentConfiguration,createBasicCurrentRegistration,BASIC_CURRENT_CONTRACT_SHA,isOwnedBasicCurrentRegistryDelegate} from '../ops/api-basic-current-registration.mjs';
const config=(extra={})=>({schemaVersion:1,enabled:true,approvalRecorded:true,profile:'basic_aggregate_v1',contractSha256:BASIC_CURRENT_CONTRACT_SHA,grantReference:'synthetic-grant',roundReference:'synthetic-r1',epoch:'synthetic-basic-v1',publicationEnabled:false,...extra});
const noIO=async()=>{};
async function accept(f){f.owner.recurring.reconcile(8,f.owner.recurring.eventFrame());return f.owner.privateCash.runRegistryAlarm(f.owner.recurring.eventFrame());}
async function drive(f,until,max=180){const trace=[];for(let i=0;i<max&&!until();i++){trace.push((await f.owner.privateCash.runRegistryAlarm(f.owner.recurring.eventFrame())).status);const due=f.owner.privateCash.recurringWork.nextDue();f.now[0]=Math.max(f.now[0]+1,due??0);}assert(until(),JSON.stringify(trace.slice(-20)));return trace;}

test('defaultAbsent/Off/invalid return before core/SQL/bucket access; actual factoryOff preserves schema and no sink',async t=>{
 for(const raw of [undefined,'{"enabled":false}','{"enabled":true}','{"enabled":false,"enabled":true}',JSON.stringify(config({publicationEnabled:true}))]){const env=new Proxy({API_BASIC_CURRENT_JSON:raw},{get(o,k){assert.equal(k,'API_BASIC_CURRENT_JSON');return o[k];}});assert.equal(await createBasicCurrentRegistration(null,env,new Proxy({},{get(){throw Error('core access');}}),null),null);}
 const f=await fixture(t,{fast:false});assert.equal(f.owner.basicCurrentRegistration,undefined);assert.equal(f.row("SELECT name FROM sqlite_master WHERE name LIKE 'basic_%' LIMIT 1"),undefined);const a=f.seed();assert.equal((await accept(f)).status,'registry_capture_accepted');assert(f.row('SELECT receipt_key FROM api_index_inputs WHERE receipt_key=?',a.receiptKey));assert.equal(f.reads.filter(k=>k===a.receiptKey).length,1);assert.equal(f.provider.length,0);
});

test('real constructor +genuine finish +same existing registry mux publish pre79 full snapshot without second raw read/provider',async t=>{
 const f=await fixture(t,{fast:false,extraItems:1239,basicRegistrationConfig:config()}),r=f.owner.basicCurrentRegistration;assert.equal(r.status,'ready');assert.equal(f.owner.privateCash.recurringWork,r.delegate);assert(isOwnedBasicCurrentRegistryDelegate(r.delegate,f.owner.ctx,f.core,f.owner.recurring));
 const a=f.seed();assert.equal(f.row('SELECT state FROM api_jobs WHERE job_key=?',a.jobKey).state,'complete');assert.equal((await accept(f)).status,'registry_capture_accepted');assert.equal(JSON.parse(f.row("SELECT body FROM basic_generations WHERE role='pending'").body).length,1537);assert(f.row('SELECT receipt_key FROM api_index_inputs WHERE receipt_key=?',a.receiptKey));assert(f.row('SELECT receipt_key FROM stamp_reference_captures WHERE receipt_key=?',a.receiptKey));
 const trace=await drive(f,()=>!!f.row("SELECT gid FROM basic_generations WHERE role='current'"));assert(trace.includes('basic_current_readback_confirmed'));const selected=await r.owner.readItem([...f.names.keys()].at(-1),noIO);assert.equal(selected.status,'basic_selected_ready');assert.equal(selected.reference.upstreamLatestInspected,false);assert.equal(selected.reference.fullVariantFreshness,false);assert.equal(selected.reference.capturedAt,a.e.capturedAt);assert.equal(f.reads.filter(k=>k===a.receiptKey).length,1);assert.equal(f.provider.length,0);assert(r.owner.retainedBytes()<18874368);
});

test('repeated creation shares one owner; closed scope/config changes refuse replacement while base stays active',async t=>{
 const f=await fixture(t,{fast:false,basicRegistrationConfig:config()}),r=f.owner.basicCurrentRegistration,epoch=r.owner.ownerEpoch;
 const again=await createBasicCurrentRegistration(f.owner.ctx,f.env,f.core,f.owner.recurring);assert.equal(again,r);assert.equal(r.owner.ownerEpoch,epoch);
 f.env.API_BASIC_CURRENT_JSON=JSON.stringify(config({epoch:'another-basic-epoch'}));assert.equal((await createBasicCurrentRegistration(f.owner.ctx,f.env,f.core,f.owner.recurring)).delegate,null);assert.equal(r.delegate.active,true);assert.equal(r.delegate.ensure(),null);assert.equal(r.owner.active,false);
});

test('current saved27 constructor preserves FAST/Search delegates and distinct actual grant scope; no provider consumer added',async t=>{
 const texts=JSON.parse(readFileSync(new URL('./fixtures/current-dataflow-basic-runtime27-texts.json',import.meta.url))),g=JSON.parse(texts.API_GRANT_JSON),cfg=config({grantReference:g.grantReference,roundReference:g.probeRound});assert.notEqual(g.grantReference,'maplestory-market-account-primary-v1');
 const f=await fixture(t,{fast:false,runtimeTexts:texts,basicRegistrationConfig:cfg}),r=f.owner.basicCurrentRegistration;assert.equal(r.status,'ready');assert.equal(r.delegate.base,f.owner.searchIdentityRegistration.delegate);assert.equal(r.delegate.base.base,f.owner.fastCurrentRegistration.delegate);assert.equal(r.delegate.registry,f.registry);assert.equal(r.owner.scope.grantReference,g.grantReference);assert.equal(r.owner.scope.roundReference,g.probeRound);assert.equal(f.owner.privateCash.recurringWork,r.delegate);assert.equal(f.provider.length,0);
 const wrong=await fixture(t,{fast:false,runtimeTexts:texts,basicRegistrationConfig:config({grantReference:'maplestory-market-account-primary-v1',roundReference:g.probeRound})});assert.equal(wrong.owner.basicCurrentRegistration.delegate,null);assert.equal(wrong.row("SELECT name FROM sqlite_master WHERE name='basic_control'"),undefined);assert.equal(wrong.owner.privateCash.recurringWork,wrong.owner.searchIdentityRegistration.delegate);
});

test('held Basic physical job keeps reservation; base keeps existing budget gate and original registry can admit newer capture independently',async t=>{
 const f=await fixture(t,{fast:false,basicRegistrationConfig:config()}),r=f.owner.basicCurrentRegistration;const a=f.seed();await accept(f);await drive(f,()=>r.owner.job()?.phase==='write');let release,hit,starts=0,mono=0;const entered=new Promise(resolve=>hit=resolve),held=new Promise(resolve=>release=resolve);r.owner.mono=()=>mono;r.owner.waitMs=1000;f.hook(async(op,key)=>{if(op==='put'&&key.includes('/basic-current/')){starts++;hit();mono=1001;await held;}});
 f.exec("UPDATE basic_control SET mux_turn='base' WHERE id=1");
 const action=r.delegate.drainOne(noIO,f.owner.recurring.eventFrame());
 try{await Promise.race([entered,new Promise((_,reject)=>setTimeout(()=>reject(Error('synthetic_expected_basic_put_not_entered')),2000))]);assert.equal(starts,1);assert.equal((await action).status,'basic_action_pending');assert(r.owner.pool.task);assert.equal(r.delegate.physicalPending,true);const writes=f.puts.length,lease=r.owner.job().lease_until,cursor=r.owner.job().cursor;
 const b=f.seed(f.prices(),'2026-11-06T12:01:00.000Z');assert.equal((await accept(f)).status,'recurring_budget_hold');assert.equal(f.reads.filter(k=>k===b.receiptKey).length,0);assert.equal((await f.registry.drainOne(noIO)).status,'registry_capture_accepted');assert(f.row('SELECT receipt_key FROM api_index_inputs WHERE receipt_key=?',b.receiptKey));assert.equal(f.puts.length,writes);assert(r.owner.pool.task);assert.equal(f.reads.filter(k=>k===a.receiptKey).length,1);assert.equal(f.reads.filter(k=>k===b.receiptKey).length,1);assert.equal(r.owner.job().lease_until,lease);assert.equal(r.owner.job().cursor,cursor);
 }finally{f.hook(null);release();if(r.owner.pool.task)await r.owner.pool.task;}
 assert.equal(starts,1);assert.equal(r.owner.job().cursor,0);assert.equal(f.row("SELECT gid FROM basic_generations WHERE role='current'"),undefined);assert.equal(f.provider.length,0);
});

test('final readback source revocation cannot ACK or release graph payload through integrated slot',async t=>{
 const f=await fixture(t,{fast:false,basicRegistrationConfig:config()}),r=f.owner.basicCurrentRegistration,a=f.seed();await accept(f);await drive(f,()=>r.owner.job()?.phase==='readback');const pages=f.row('SELECT COUNT(*)n FROM basic_pages').n;assert(pages>0);
 f.exec("UPDATE basic_control SET mux_turn='base' WHERE id=1");f.hook(async(op,key)=>{if(op==='get'&&key.endsWith('/basic-current/v1/current.json'))f.exec('UPDATE api_attempts SET result=? WHERE id=?','synthetic_revoked',a.id);});const result=await r.delegate.drainOne(noIO,f.owner.recurring.eventFrame());assert.equal(result.status,'basic_action_hold');assert.equal(f.row("SELECT gid FROM basic_generations WHERE role='current'"),undefined);assert.equal(f.row('SELECT COUNT(*)n FROM basic_pages').n,pages);assert.equal(f.provider.length,0);
});

test('actual owner alarm chooses existing registry kind for Basic derivative; Off during SDK prevents late ACK',async t=>{
 const f=await fixture(t,{fast:false,basicRegistrationConfig:config()}),r=f.owner.basicCurrentRegistration;f.seed();await accept(f);const before=f.row('SELECT COUNT(*)n FROM api_attempts').n;
 f.exec('UPDATE api_cash_alarm_mux SET provider_at=NULL');const result=await f.owner.alarm();assert.equal(result.eventKind,'private_item_registry');assert.equal(f.owner.privateCash.row().last_kind,'registry');assert.equal(f.row('SELECT COUNT(*)n FROM api_attempts').n,before);
 await drive(f,()=>r.owner.job()?.phase==='readback');f.exec("UPDATE basic_control SET mux_turn='base' WHERE id=1");f.hook(async(op,key)=>{if(op==='get'&&key.endsWith('/basic-current/v1/current.json'))f.env.API_BASIC_CURRENT_JSON='{"enabled":false}';});const stopped=await r.delegate.drainOne(noIO,f.owner.recurring.eventFrame());assert.equal(stopped.status,'basic_action_hold');assert.equal(f.row("SELECT gid FROM basic_generations WHERE role='current'"),undefined);assert.equal(f.provider.length,0);
});

// Separate negative control: expiry during preparation must not count as a held PUT.
test('controlled20ms preparation expiry returns action_hold with zero SDK entry',async t=>{
 const f=await fixture(t,{fast:false,basicRegistrationConfig:config()}),r=f.owner.basicCurrentRegistration;f.seed();await accept(f);await drive(f,()=>r.owner.job()?.phase==='write');f.exec("UPDATE basic_control SET mux_turn='base' WHERE id=1");let mono=0,hit=false,starts=0;r.owner.mono=()=>mono;r.owner.waitMs=20;const original=crypto.subtle.digest.bind(crypto.subtle);crypto.subtle.digest=async(algorithm,bytes)=>{if(new TextDecoder().decode(bytes).includes('"kind":"private_basic_manifest"')){hit=true;mono=21;}return original(algorithm,bytes);};f.hook(async(op,key)=>{if(op==='put'&&key.includes('/basic-current/'))starts++;});try{const result=await r.delegate.drainOne(noIO,f.owner.recurring.eventFrame());assert(hit);assert.equal(result.status,'basic_action_hold');assert.equal(starts,0);assert.equal(r.owner.job().cursor,0);assert.equal(f.provider.length,0);}finally{crypto.subtle.digest=original;f.hook(null);}
});
