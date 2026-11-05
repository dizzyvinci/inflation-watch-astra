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


const NX_GRANT={...GRANT,allowedOperations:[...OPS,'nx-rate','nx-history'],nxSchemaProbesEnabled:true};
async function finish(f){let events=0;while(await f.alarm()!==null&&events++<40)await f.fire();assert.ok(events<40,'bounded event completion');}

test('COMBINED sameowner exacteight rawprobes plus29privateprojection, no repeatedprovider or public route',async t=>{
 const f=await fixture(t,{grant:NX_GRANT});await f.owner.kickScheduledCollection();await finish(f);
 assert.equal(f.calls.length,8);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,8);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_jobs').n,8);
 assert.deepEqual(f.calls.slice(-2).map(row=>row.url),['https://maplestory.market/api/nx-rate','https://maplestory.market/api/nx-rate/history?range=7d&step=hour']);
 assert.ok(f.pointer());assert.equal(f.pointer().sourceAttemptId,2);assert.equal(f.pointer().publicationEligible,false);
 const dto=JSON.parse(f.objects.get(f.pointer().projectionKey).body);assert.equal(dto.records.length,29);assert.equal(dto.coverage.available,29);assert.equal(dto.sourceObservedAt,null);assert.equal(dto.publicationEligible,false);
 const health=JSON.parse(f.objects.get('_private/provider-api/v1/health.json').body);assert.equal(health.completedReceipts.length,6);assert.equal(health.completedNxProbeReceipts.length,2);
 await f.owner.kickScheduledCollection();assert.equal(await f.alarm(),null);assert.equal(f.calls.length,8);
 assert.equal(f.owner.fetch(new Request('https://inflation.gg/_private/provider-api/v1/cash-projection.json')).status,404);
});

test('COMBINED NX401stopsallprovider yetretainedauthorizedprices materialize onprivate-only retry withoutmoreGETs',async t=>{
 const f=await fixture(t,{grant:NX_GRANT});f.fail('projection');const old=f.core.fetcher;
 f.core.fetcher=async(url,...args)=>{if(new URL(url).pathname==='/api/nx-rate'){f.calls.push({url,at:f.now[0]});return new Response(null,{status:401});}return old(url,...args);};
 await f.owner.kickScheduledCollection();let events=0;
 while(!f.core.health().authenticationStopped&&events++<30)await f.fire();assert.ok(events<30);
 assert.equal(f.calls.length,7);assert.equal(f.pointer(),null);assert.notEqual(await f.alarm(),null);
 assert.equal(f.row('SELECT provider_at FROM api_cash_alarm_mux WHERE id=1').provider_at,null);
 f.fail(null);await finish(f);assert.ok(f.pointer());assert.equal(f.calls.length,7);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,7);
 assert.equal(f.core.health().authenticationStopped,true);assert.equal(f.row('SELECT state FROM api_jobs WHERE operation=?','nx-history').state,'pending');
 assert.equal(f.pointer().sourceAttemptId,2);assert.equal(f.pointer().sourceObservedAt,null);
});

test('COMBINED privateOFF retainsNXeightjobs with zeroderivedtables and no extratransport',async t=>{
 const f=await fixture(t,{grant:NX_GRANT,feature:{enabled:false}});await f.owner.kickScheduledCollection();await finish(f);
 assert.equal(f.calls.length,8);assert.equal(f.row("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='private_cash_jobs'").n,0);assert.equal(f.pointer(),null);
 assert.equal(f.core.nxSchemaProbeState().status,'complete');
});

test('INDEPENDENT fixed reenable preserves newlylegacyresumed providerdeadline with initialized mux',async t=>{
 const f=await fixture(t,{key:null});await f.owner.kickScheduledCollection();assert.equal(await f.alarm(),null);
 f.env.API_PRIVATE_CASH_JSON=JSON.stringify({enabled:false});f.env.MAPLESTORY_MARKET_APPROVED_API_KEY='SYNTHETIC-KEY';await f.restart();await f.owner.kickScheduledCollection();
 const due=await f.alarm();assert.equal(due,START+2500);assert.equal(f.row('SELECT provider_at FROM api_cash_alarm_mux WHERE id=1').provider_at,due);
 f.env.API_PRIVATE_CASH_JSON=JSON.stringify(FEATURE);await f.restart();assert.equal(await f.alarm(),due);
 assert.equal((await f.fire()).status,'success');assert.equal(f.calls.length,1);
});
