import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {registerHooks} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';import bindings from '../ops/api-cash-bindings-v1.json' with {type:'json'};
const hooks=registerHooks({resolve(specifier,context,next){return specifier==='cloudflare:workers'?
  {url:'data:text/javascript,export class DurableObject { constructor(ctx,env) { this.ctx=ctx; this.env=env; } }',shortCircuit:true}:next(specifier,context);}});
let ApiGrantCollector;try{({ApiGrantCollector}=await import('../ops/api-grant-collector.mjs'));}finally{hooks.deregister();}
const START=Date.parse('2026-11-05T22:00:00Z'),POINTER='_private/provider-api/v1/cash-projection.json';
const OPS=['status','prices','catalogue','overview','apple-detail','apple-history'];
const GRANT={enabled:true,approvalRecorded:true,exclusiveAccountOwnerConfirmed:true,grantReference:'synthetic-grant',
  grantedPerMinute:30,grantedPerDay:null,operatorDailyRequestCap:1000,minimumRequestIntervalSeconds:2.5,
  higherFrequencyExplicitlyGranted:true,allowedOperations:OPS,probeRound:'synthetic-r1',publicationEnabled:false};
const SCHEDULE={enabled:true,scheduleReference:'synthetic-s1',requestIntervalMilliseconds:2500,startupTargetSeconds:21600,recurring:[]};
const FEATURE={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:false};
function priceBody(invalid=false){return JSON.stringify(bindings.targets.map(t=>({item_id:t.itemId,
  sold:{sales:invalid?true:5,units:8,avg_unit_price:101.1,median_unit_price:95.5,day_sales:1,day_units:1},
  seen:null,reference:{unit_price:101.1,basis:'sold',samples:5,scope:'item'}})));}
function receipt(attempt=1,invalid=false){const raw=priceBody(invalid),hash=createHash('sha256').update(raw).digest('hex');
  return{key:`_private/provider-api/v1/receipts/${String(attempt).padStart(12,'0')}-prices-${hash}.json`,body:JSON.stringify({
    kind:'unverified_provider_api_receipt',operation:'prices',httpStatus:200,sourceUrl:'https://maplestory.market/api/prices',
    schemaVerified:false,publicationEligible:false,sourceObservedAt:null,observationTimestampKnown:false,captureTimeKind:'http_response_completed',
    requestStartedAt:'2026-11-05T21:13:48.138Z',capturedAt:'2026-11-05T21:13:49.724Z',attemptId:attempt,
    rawBodyEncoding:'base64',rawBodyBase64:Buffer.from(raw).toString('base64'),responseBytes:Buffer.byteLength(raw),responseSha256:hash,payload:{}})};}

async function fixture(t,{feature=FEATURE,grant=GRANT,schedule=SCHEDULE,key='SYNTHETIC-KEY'}={}){
  const directory=mkdtempSync(path.join(tmpdir(),'astra-private-hook-')),file=path.join(directory,'db.sqlite');
  let db,owner,storage,etag=0,fail=null;const now=[START],objects=new Map(),calls=[],reads=[];
  const bucket={async get(key){reads.push(key);if(fail==='raw'&&key.includes('/receipts/'))throw new Error('Synthetic R2');
    const r=objects.get(key);return r?{etag:r.etag,size:Buffer.byteLength(r.body),text:async()=>r.body,json:async()=>JSON.parse(r.body)}:null;},
    async put(key,body,opts){if(fail==='projection'&&key.includes('/cash-projections/')||fail==='pointer'&&key===POINTER)throw new Error('Synthetic R2');
      const old=objects.get(key),condition=opts?.onlyIf;
      if(condition?.etagDoesNotMatch==='*'&&old||condition?.etagMatches&&old?.etag!==condition.etagMatches)return null;
      const r={body,etag:String(++etag)};objects.set(key,r);return r;}};
  const env={API_GRANT_JSON:JSON.stringify(grant),API_SCHEDULE_JSON:JSON.stringify(schedule),API_RAW_RECEIPTS:bucket};
  if(feature!==null)env.API_PRIVATE_CASH_JSON=JSON.stringify(feature);if(key!==null)env.MAPLESTORY_MARKET_APPROVED_API_KEY=key;
  async function open(){
    db=new DatabaseSync(file);db.exec('CREATE TABLE IF NOT EXISTS test_alarm(id INTEGER PRIMARY KEY,time INTEGER)');
    db.exec('INSERT OR IGNORE INTO test_alarm(id,time) VALUES(1,NULL)');
    storage={sql:{exec(sql,...args){const s=db.prepare(sql),rows=s.columns().length?s.all(...args):(s.run(...args),[]);return{toArray:()=>rows};}},
      transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},
      async setAlarm(at){db.prepare('UPDATE test_alarm SET time=? WHERE id=1').run(at);},
      async deleteAlarm(){db.prepare('UPDATE test_alarm SET time=NULL WHERE id=1').run();},
      async getAlarm(){if(fail==='initialization')throw new Error('Synthetic alarm read failure');return db.prepare('SELECT time FROM test_alarm WHERE id=1').get().time;}};
    owner=new ApiGrantCollector({storage,blockConcurrencyWhile:fn=>fn()},env);
    owner.core.now=()=>now[0];owner.core.jitter=()=>0;owner.core.fetcher=async url=>{calls.push({url,at:now[0]});
      return new Response(new URL(url).pathname==='/api/prices'?priceBody():JSON.stringify({synthetic:true}),{headers:{'content-type':'application/json'}});};
    await owner.ready;
  }
  await open();t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
  return{env,now,calls,objects,reads,get owner(){return owner;},get core(){return owner.core;},
    row:(sql,...args)=>db.prepare(sql).get(...args),fail(value){fail=value;},alarm:()=>storage.getAlarm(),
    async restart(){db.close();await open();},async fire(){const at=await storage.getAlarm();assert.notEqual(at,null);now[0]=Math.max(now[0],at);await storage.deleteAlarm();return owner.alarm();},
    seed(r){objects.set(r.key,{body:r.body,etag:String(++etag)});db.prepare(`INSERT INTO api_jobs(job_key,operation,round_ref,state,available_at,receipt_key)
      VALUES(?,?,?,?,?,?)`).run('stored:'+r.key,'prices','synthetic-r1','complete',START,r.key);},
    pointer:()=>objects.has(POINTER)?JSON.parse(objects.get(POINTER).body):null};
}

test('absent/off/invalid private flag has no derived tables, R2 access or secret read',async t=>{
  for(const feature of [null,{enabled:false},{enabled:'true'},{...FEATURE,publicationEnabled:true}]){
    const f=await fixture(t,{feature,schedule:{enabled:false},grant:{enabled:false,publicationEnabled:false}});
    Object.defineProperty(f.env,'MAPLESTORY_MARKET_APPROVED_API_KEY',{get(){throw new Error('Secret forbidden while off');}});
    assert.equal((await f.owner.kickScheduledCollection()).status,'schedule_disabled');
    assert.equal(f.row("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='private_cash_jobs'").n,0);
    assert.equal(f.reads.length,0);assert.equal(f.calls.length,0);assert.equal(await f.alarm(),null);
  }
});
test('provider prices success only schedules a separate later alarm; heavy decode never shares its event',async t=>{
  const f=await fixture(t);await f.owner.kickScheduledCollection();assert.equal((await f.fire()).status,'success');
  assert.equal((await f.fire()).status,'success');assert.equal(f.calls.length,2);assert.equal(f.pointer(),null);
  const attempts=f.row('SELECT COUNT(*) AS n FROM api_attempts').n;
  const result=await f.fire();assert.equal(result.eventKind,'private_projection');assert.equal(result.status,'materialized_private');
  assert.equal(f.calls.length,2);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,attempts);
  assert.equal(f.pointer().publicationEligible,false);assert.equal(f.pointer().sourceObservedAt,null);
  assert.ok(f.objects.has(f.pointer().rawReceiptKey));
});
test('restart recovers raw-success handoff gap through prearmed alarm without repeating provider',async t=>{
  const f=await fixture(t,{schedule:{enabled:false}}),r=receipt();await f.owner.privateCash.beforeProviderEvent();f.seed(r);
  const deadline=await f.alarm();assert.equal(deadline,START+130000);await f.restart();
  assert.equal((await f.fire()).status,'materialized_private');assert.equal(f.calls.length,0);assert.equal(f.pointer().sourceAttemptId,1);
});
test('auth stopped/missing key may process stored authorized raw but cannot issue another provider GET',async t=>{
  const f=await fixture(t,{key:null}),r=receipt();f.seed(r);f.core.sql.exec('UPDATE api_control SET auth_stopped=1 WHERE id=1');
  await f.owner.kickScheduledCollection();assert.equal((await f.fire()).status,'materialized_private');
  assert.equal(f.calls.length,0);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,0);assert.equal(await f.alarm(),null);
});
test('private storage retry deadline survives restart without provider repeat or zero-delay spin',async t=>{
  const f=await fixture(t,{schedule:{enabled:false}}),r=receipt();f.seed(r);await f.owner.kickScheduledCollection();f.fail('projection');
  const result=await f.fire();assert.equal(result.status,'private_storage_retry');const deadline=await f.alarm();
  assert.equal(deadline,f.now[0]+30000);await f.restart();assert.equal(await f.alarm(),deadline);
  f.fail(null);assert.equal((await f.fire()).status,'materialized_private');assert.equal(f.calls.length,0);
});
test('final private pointer failure retains a repair alarm and repairs without redecoding raw',async t=>{
  const f=await fixture(t,{schedule:{enabled:false}}),r=receipt();f.seed(r);await f.owner.kickScheduledCollection();f.fail('pointer');
  assert.equal((await f.fire()).status,'private_pointer_pending');const reads=f.reads.filter(key=>key===r.key).length;
  const at=await f.alarm();assert.equal(at,f.now[0]+30000);await f.restart();f.fail(null);
  assert.equal((await f.fire()).status,'idle');assert.equal(f.reads.filter(key=>key===r.key).length,reads);
  assert.equal(f.pointer().capturedAt,'2026-11-05T21:13:49.724Z');assert.equal(f.calls.length,0);assert.equal(await f.alarm(),null);
});
test('quarantine retains lastgood and schedules no provider retry; repeat kick remains idempotent',async t=>{
  const f=await fixture(t,{schedule:{enabled:false}});f.seed(receipt(1));await f.owner.kickScheduledCollection();await f.fire();
  const before=f.objects.get(POINTER).body;f.seed(receipt(2,true));await f.owner.kickScheduledCollection();
  assert.equal((await f.fire()).status,'quarantined_private_materialization');assert.equal(f.objects.get(POINTER).body,before);
  await f.owner.kickScheduledCollection();assert.equal(await f.alarm(),null);assert.equal(f.calls.length,0);
});
test('each alarm reconciles at most8 records and drains at most1 without losing older stored work',async t=>{
  const f=await fixture(t,{schedule:{enabled:false}});for(let id=1;id<=10;id++)f.seed(receipt(id));
  await f.owner.kickScheduledCollection();assert.equal(f.row('SELECT COUNT(*) AS n FROM private_cash_jobs').n,8);
  await f.fire();assert.equal(f.row("SELECT COUNT(*) AS n FROM private_cash_jobs WHERE state='complete'").n,1);
  assert.equal(f.row('SELECT COUNT(*) AS n FROM private_cash_jobs').n,10);
  for(let i=0;i<9;i++)await f.fire();assert.equal(await f.alarm(),null);
  assert.equal(f.row("SELECT COUNT(*) AS n FROM private_cash_jobs WHERE state='complete'").n,10);
  assert.equal(f.pointer().sourceAttemptId,10);assert.equal(f.calls.length,0);
});
test('provider scheduling stop cannot erase a pending private alarm; API core invariants unchanged',async t=>{
  const f=await fixture(t,{key:null}),r=receipt();f.seed(r);await f.owner.kickScheduledCollection();
  assert.ok(await f.alarm()>START);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,0);
  const before=JSON.stringify(f.row('SELECT * FROM api_control WHERE id=1'));await f.fire();
  assert.equal(JSON.stringify(f.row('SELECT * FROM api_control WHERE id=1')),before);
});
test('overdue provider and private deadlines alternate without starving either job type',async t=>{
  const f=await fixture(t);for(let id=1;id<=3;id++)f.seed(receipt(id));await f.owner.kickScheduledCollection();f.now[0]+=3000;
  assert.equal((await f.fire()).eventKind,'private_projection');assert.equal(f.calls.length,0);
  assert.equal((await f.fire()).status,'success');assert.equal(f.calls.length,1);
  assert.equal((await f.fire()).eventKind,'private_projection');assert.equal(f.calls.length,1);
});
test('private recovery cannot clear protection for a raw GET that is still leased',async t=>{
  const f=await fixture(t,{schedule:{enabled:false}}),old=receipt(1),newer=receipt(2);f.seed(old);
  await f.owner.privateCash.beforeProviderEvent();
  f.core.sql.exec(`INSERT INTO api_jobs(job_key,operation,round_ref,state,available_at,lease_until)
    VALUES(?,?,?,?,?,?)`,'slow-raw','prices','synthetic-r1','running',START,START+200000);
  assert.equal((await f.fire()).status,'materialized_private');assert.equal(await f.alarm(),START+200001);
  f.objects.set(newer.key,{body:newer.body,etag:'newer-synthetic'});
  f.core.sql.exec("UPDATE api_jobs SET state='complete',lease_until=NULL,receipt_key=? WHERE job_key='slow-raw'",newer.key);
  await f.restart();assert.equal((await f.fire()).status,'materialized_private');assert.equal(f.pointer().sourceAttemptId,2);assert.equal(f.calls.length,0);
});
test('first explicit opt-in preserves an already-persisted legacy provider alarm',async t=>{
  const f=await fixture(t,{feature:{enabled:false}});await f.owner.kickScheduledCollection();
  const existing=await f.alarm();assert.equal(existing,START+2500);
  f.env.API_PRIVATE_CASH_JSON=JSON.stringify(FEATURE);await f.restart();
  assert.equal(f.row('SELECT provider_at FROM api_cash_alarm_mux WHERE id=1').provider_at,existing);
  assert.equal((await f.fire()).status,'success');assert.equal(f.calls.length,1);
});
test('constructor exit before inherited alarm read is retried durably on restart',async t=>{
  const f=await fixture(t,{feature:{enabled:false}});await f.owner.kickScheduledCollection();const existing=await f.alarm();
  f.env.API_PRIVATE_CASH_JSON=JSON.stringify(FEATURE);f.fail('initialization');await assert.rejects(f.restart());
  assert.equal(f.row('SELECT initialized FROM api_cash_alarm_mux WHERE id=1').initialized,0);
  f.fail(null);await f.restart();assert.equal(f.row('SELECT provider_at FROM api_cash_alarm_mux WHERE id=1').provider_at,existing);
  assert.equal((await f.fire()).status,'success');assert.equal(f.calls.length,1);
});
test('re-enable after off-mode legacy credentials resumption retains the NEW provider alarm',async t=>{
  const f=await fixture(t,{key:null});await f.owner.kickScheduledCollection();
  assert.equal(await f.alarm(),null);assert.equal(f.row('SELECT initialized FROM api_cash_alarm_mux WHERE id=1').initialized,1);
  f.env.API_PRIVATE_CASH_JSON=JSON.stringify({enabled:false});f.env.MAPLESTORY_MARKET_APPROVED_API_KEY='SYNTHETIC-KEY';
  await f.restart();await f.owner.kickScheduledCollection();const deadline=await f.alarm();assert.equal(deadline,START+2500);
  assert.equal(f.row('SELECT provider_at FROM api_cash_alarm_mux WHERE id=1').provider_at,deadline);
  f.env.API_PRIVATE_CASH_JSON=JSON.stringify(FEATURE);await f.restart();assert.equal(await f.alarm(),deadline);
  assert.equal((await f.fire()).status,'success');assert.equal(f.calls.length,1);
});
test('off-on resumption preserves a TRUE private repair deadline without promoting it to provider',async t=>{
  const f=await fixture(t,{schedule:{enabled:false}}),r=receipt();f.seed(r);await f.owner.kickScheduledCollection();f.fail('pointer');
  assert.equal((await f.fire()).status,'private_pointer_pending');const repairAt=await f.alarm();
  f.env.API_PRIVATE_CASH_JSON=JSON.stringify({enabled:false});await f.restart();await f.owner.kickScheduledCollection();
  assert.equal(await f.alarm(),null);assert.equal(f.row('SELECT private_at FROM api_cash_alarm_mux WHERE id=1').private_at,repairAt);
  assert.equal(f.row('SELECT provider_at FROM api_cash_alarm_mux WHERE id=1').provider_at,null);
  f.env.API_PRIVATE_CASH_JSON=JSON.stringify(FEATURE);f.fail(null);await f.restart();assert.equal(await f.alarm(),repairAt);
  assert.equal((await f.fire()).eventKind,'private_projection');assert.equal(f.calls.length,0);assert.equal(f.pointer().capturedAt,'2026-11-05T21:13:49.724Z');
});
