import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixtures/current-dataflow-factory-fixture.mjs';
import {privateProviderFairnessHealth as health} from '../ops/api-provider-fairness-health.mjs';
import {PROVIDER_FAIRNESS_CONTRACT_SHA as SHA} from '../ops/api-provider-fairness-registration.mjs';
import {scheduleConfig} from '../ops/api-alarm-scheduler.mjs';
import {ApiPrivateHealth as BaselineHealth} from './fixtures/current-dataflow-health-baseline.mjs';
const texts=JSON.parse(readFileSync(new URL('./fixtures/current-dataflow-runtime27-texts.json',import.meta.url))),grant=JSON.parse(texts.API_GRANT_JSON);
const profile=()=>({schemaVersion:1,enabled:true,approvalRecorded:true,policy:'three_bulk_one_registered_oldest_available_v1',maxEligibleDerivedDeferral:2,sameOwner:'maplestory-market-account-primary-v1',sameGrant:grant.grantReference,sameRound:grant.probeRound,contractSha256:SHA});
const options=()=>({fast:false,runtimeTexts:texts,fairnessConfig:profile()});
const checked=f=>new Date(f.now[0]).toISOString();
const run=f=>health(f.core,f.env,{delegate:f.owner.privateHealth.providerFairnessDelegate,checkedAt:checked(f)});
function completeBucketObjectInterface(f){const get=f.bucket.get;f.bucket.get=async(...a)=>{const object=await get(...a);return object&&{...object,json:async()=>JSON.parse(await object.text())};};}

test('absent, exactOff and invalid profiles omit before any core, delegate or SQL access',()=>{
  const forbidden=new Proxy({}, {get(){throw Error('forbidden_core');}});
  for(const value of [undefined,'{"enabled":false}','{"enabled":true}','not JSON']){
    const env=value===undefined?{}:{API_PROVIDER_FAIRNESS_JSON:value};
    assert.equal(health(forbidden,env,{get delegate(){throw Error('delegate_access');}}),null);
  }
});

test('actual registered owner produces coupled scalar evidence with unknown source/native state and3read-onlySQL',async t=>{
  const f=await fixture(t,options());f.env.MAPLESTORY_MARKET_APPROVED_API_KEY='offline-synthetic-only';
  const events=scheduleConfig(f.env),now=f.now[0];
  for(const e of events.recurring)f.exec('INSERT INTO api_alarm_events(schedule_ref,operation,interval_ms,priority,next_due)VALUES(?,?,?,?,?)',events.scheduleReference,e.operation,e.intervalSeconds*1000,e.priority,now+e.intervalSeconds*1000);
  const key=grant.probeRound+':synthetic-diagnostic-prices';
  f.core.enqueueScheduledOperation({jobKey:key,operation:'prices',availableAt:now-5400000});
  f.exec('UPDATE api_alarm_events SET active_job_key=? WHERE operation=?',key,'prices');
  const before=f.core.sql.exec('SELECT job_key,available_at,attempts,lease_until,attempt_id FROM api_jobs ORDER BY job_key').toArray();
  const calls=[],original=f.core.sql.exec.bind(f.core.sql);f.core.sql.exec=(q,...a)=>{const c=original(q,...a);calls.push({query:q,rows:c.toArray().length});return c;};
  let result;try{result=run(f);}finally{f.core.sql.exec=original;}
  assert.equal(result.status,'ready');assert.equal(result.coupledPolicyActive,true);
  assert.deepEqual(result.claimState,{lastClass:null,bulkStreak:0});
  assert.equal(result.sourceFreshness,'not_checked');assert.equal(result.remoteAvailability,'not_checked');assert.equal(result.nativeResourceHeadroom,'not_checked');
  const prices=result.scheduledOperations.find(r=>r.operation==='prices');assert.equal(prices.activeJobState,'pending');assert.equal(prices.activeJobDueAgeMs,5400000);
  assert.equal(prices.activeJobAvailableAt,new Date(now-5400000).toISOString());
  assert.equal(calls.length,3);assert(calls.every(x=>x.query.trimStart().startsWith('SELECT')));assert(calls.every(x=>x.rows<=8));
  assert.deepEqual(f.core.sql.exec('SELECT job_key,available_at,attempts,lease_until,attempt_id FROM api_jobs ORDER BY job_key').toArray(),before);
  assert(!JSON.stringify(result).includes(key));assert(!JSON.stringify(result).includes('offline-synthetic-only'));assert(Buffer.byteLength(JSON.stringify(result))<8192);
  assert.equal(f.provider.length,0);
});

test('genuine registration is required and hotOff omits with no furtherSQL',async t=>{
  const f=await fixture(t,options());
  const forged=health(f.core,f.env,{delegate:{registration:{status:'ready',enabled:true},mux:f.owner.privateCash},checkedAt:checked(f)});
  assert.equal(forged.status,'registration_unavailable');assert.equal(forged.coupledPolicyActive,false);
  f.env.API_PROVIDER_FAIRNESS_JSON='{"enabled":false}';
  const original=f.core.sql.exec;f.core.sql.exec=()=>{throw Error('forbidden_sql');};
  try{assert.equal(run(f),null);}finally{f.core.sql.exec=original;}
});

test('missing rows are unknown, schedulerOff empty is explicit and invalid clock cannot imply ready',async t=>{
  const f=await fixture(t,options());const d=run(f);assert.equal(d.status,'ready');
  assert(d.scheduledOperations.every(r=>r.scheduleState==='not_present'&&r.nextDueAt===null&&r.skippedScheduleIntervals===null));
  f.env.API_SCHEDULE_JSON='{"enabled":false}';const off=run(f);assert.equal(off.status,'ready');assert.equal(off.scheduleEnabled,false);assert.deepEqual(off.scheduledOperations,[]);
  for(const clock of ['Nov 6, 2026','2026-02-30T12:00:00.000Z','2026-11-06T12:00:00Z']){
    const invalid=health(f.core,f.env,{delegate:f.owner.privateHealth.providerFairnessDelegate,checkedAt:clock});assert.equal(invalid.status,'diagnostic_unavailable');assert.equal(invalid.coupledPolicyActive,false);
  }
});

test('corrupt oversized private scalars and scheduler identity fail without echoing raw text',async t=>{
  const f=await fixture(t,options()),bad='private-test-sentinel-'.repeat(10000);
  f.exec('UPDATE api_control SET last_claim_class=?',bad);const d=run(f);assert.equal(d.status,'diagnostic_unavailable');assert(!JSON.stringify(d).includes('private-test-sentinel'));
  f.exec('UPDATE api_control SET last_claim_class=NULL');
  const s=scheduleConfig(f.env);f.exec('INSERT INTO api_alarm_events(schedule_ref,operation,interval_ms,priority,next_due,active_job_key)VALUES(?,?,?,?,?,?)',s.scheduleReference,'prices',300000,1,f.now[0],bad);
  const broken=run(f);assert.equal(broken.status,'diagnostic_unavailable');assert(!JSON.stringify(broken).includes('private-test-sentinel'));
});

test('actual private-health publication omits Off field and includes On SQL evidence without a provider attempt',async t=>{
  const f=await fixture(t,options());completeBucketObjectInterface(f);const before=f.provider.length;
  await f.owner.privateHealth.afterRun({status:'idle'});
  const on=JSON.parse(f.row('SELECT body FROM api_private_health WHERE id=1').body);
  assert.equal(on.privateProviderService.coupledPolicyActive,true);
  assert.equal(on.privateProviderService.operatorCheckedAt,on.checkedAt);
  f.env.API_PROVIDER_FAIRNESS_JSON='{"enabled":false}';
  await f.owner.privateHealth.afterRun({status:'idle'});
  const off=JSON.parse(f.row('SELECT body FROM api_private_health WHERE id=1').body);
  assert(!Object.hasOwn(off,'privateProviderService'));assert.equal(f.provider.length,before);
  assert.equal(off.lastRawCapturedAt,on.lastRawCapturedAt);
});

test('historicallyOn thenOff actual publication body remains byte-identical to independent no-fairness baseline with current unrelated diagnostics',async t=>{
  const f=await fixture(t,options());completeBucketObjectInterface(f);f.env.API_PROVIDER_FAIRNESS_JSON='{"enabled":false}';
  const actual=f.owner.privateHealth,baseline=new BaselineHealth(f.owner.ctx,f.env,f.core);
  baseline.fastCurrentDelegate=actual.fastCurrentDelegate;baseline.searchIdentityDelegate=actual.searchIdentityDelegate;
  const initial=f.row('SELECT revision,body,pending FROM api_private_health WHERE id=1');
  await baseline.afterRun({status:'idle'});const original=f.row('SELECT body FROM api_private_health WHERE id=1').body;
  f.exec('UPDATE api_private_health SET revision=?,body=?,pending=? WHERE id=1',initial.revision,initial.body,initial.pending);
  await actual.afterRun({status:'idle'});const after=f.row('SELECT body FROM api_private_health WHERE id=1').body;
  assert.equal(after,original);assert.equal(f.provider.length,0);
});

test('Fairness Off independently preserves full SQL row, wire seal and unrelated normalized diagnostics',async t=>{
  const f=await fixture(t,options());completeBucketObjectInterface(f);f.env.API_PROVIDER_FAIRNESS_JSON='{"enabled":false}';

  const KEY='_private/provider-api/v1/health.json',initial=f.row('SELECT revision,body,pending FROM api_private_health WHERE id=1'),priorObject=f.objects.get(KEY);
  const actual=f.owner.privateHealth,baseline=new BaselineHealth(f.owner.ctx,f.env,f.core);
  for(const name of ['fastCurrentDelegate','searchIdentityDelegate'])baseline[name]=actual[name];
  await baseline.afterRun({status:'idle'});
  const expected=f.row('SELECT revision,body,pending FROM api_private_health WHERE id=1'),expectedWire=f.objects.get(KEY).body;
  const expectedBody=JSON.parse(expected.body);
  assert(Object.hasOwn(expectedBody,'privateNormalizedSourceReceipts'));
  assert.equal(expectedBody.privateNormalizedSourceReceipts.rawBodyRead,false);
  assert.equal(expectedBody.privateNormalizedSourceReceipts.upstreamLatestInspected,false);
  assert.equal(expectedBody.privateNormalizedSourceReceipts.operatorCheckedAt,expectedBody.checkedAt);
  f.exec('UPDATE api_private_health SET revision=?,body=?,pending=? WHERE id=1',initial.revision,initial.body,initial.pending);
  if(priorObject===undefined)f.objects.delete(KEY);else f.objects.set(KEY,priorObject);
  await actual.afterRun({status:'idle'});
  const got=f.row('SELECT revision,body,pending FROM api_private_health WHERE id=1'),wire=f.objects.get(KEY).body;
  const {createHash}=await import('node:crypto'),digest=body=>createHash('sha256').update(body).digest('hex');
  assert.deepEqual(got,expected);assert.equal(got.body,expected.body);assert.equal(digest(got.body),digest(expected.body));assert.equal(wire,expectedWire);
  assert.equal(got.revision,initial.revision+1);assert.equal(got.pending,0);
  const published=JSON.parse(wire);assert.equal(published.healthSha256,digest(got.body));assert.equal(published.revision,got.revision);
  assert.equal(published.privateNormalizedSourceReceipts.operatorCheckedAt,published.checkedAt);
  assert(!Object.hasOwn(published,'privateProviderService'));assert(!Object.hasOwn(published,'privateBasicCurrent'));
  assert.equal(f.provider.length,0);
});
