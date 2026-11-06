// Portable synthetic-only private NX health/index integration tests. No network or retained receipts.
import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import {privateNxHealth} from '../ops/api-private-nx-health.mjs';
import {PrivateNxOffersProducer} from '../ops/api-private-nx-offers.mjs';
import {ApiPrivateHealth} from '../ops/api-private-health.mjs';
const ROUND='synthetic-r1',GRANT='synthetic-g1',flag={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:false};
const URL='https://maplestory.market/api/nx-rate';
const stats=(rate=20,count=1)=>({posters:count,median:count?rate:null,mode:count?rate:null,low:count?rate:null,high:count?rate:null,steps:count?[[rate,count]]:[]});
const summary=()=>({buy:stats(15,2),sell:stats(20,3),window_hours:8,limited:false,last_heard:1793919140});
const row=(side,at,rate,count=1)=>({at,side,posters:count,p25:count?rate:null,median:count?rate:null,p75:count?rate:null,low:count?rate:null,high:count?rate:null,steps:count?{[rate]:count}:{}});
function receipt(op='nx-history',attempt=27,value=[row('buy',1793916000,15),row('sell',1793916000,20)],capturedAt='2026-11-05T22:53:51.939Z'){
 const raw=JSON.stringify(value),sha=createHash('sha256').update(raw).digest('hex');const key=`_private/provider-api/v1/receipts/${String(attempt).padStart(12,'0')}-${op}-${sha}.json`;
 const e={kind:'unverified_provider_api_receipt',operation:op,httpStatus:200,sourceUrl:URL+(op==='nx-history'?'/history?range=7d&step=hour':''),rawBodyEncoding:'base64',schemaVerified:false,publicationEligible:false,sourceObservedAt:null,observationTimestampKnown:false,captureTimeKind:'http_response_completed',requestStartedAt:'2026-11-05T22:00:00.000Z',capturedAt,attemptId:attempt,rawBodyBase64:Buffer.from(raw).toString('base64'),responseBytes:Buffer.byteLength(raw),responseSha256:sha,roundReference:ROUND,grantReference:GRANT};
 return{e,key,bytes:new TextEncoder().encode(JSON.stringify(e)),selector:{operation:op,receiptKey:key,roundReference:ROUND}};
}
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const sql={exec(q,...a){const s=db.prepare(q),r=s.columns().length?s.all(...a):(s.run(...a),[]);return{toArray:()=>r};}};
 const ctx={storage:{sql,transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 sql.exec('CREATE TABLE api_jobs(job_key TEXT,operation TEXT,state TEXT,receipt_key TEXT)');const objects=new Map();let reads=0;
 const bucket={async get(key){reads++;return objects.has(key)?{json:async()=>objects.get(key)}:null;}};
 const producer=new PrivateNxOffersProducer(ctx,bucket,{enabled:true,now:()=>Date.parse('2026-11-06T00:00:00Z')});
 const core={sql,row:(q,...a)=>sql.exec(q,...a).toArray()[0],config:()=>({enabled:true})};
 async function accept(r){objects.set(r.key,r.e);sql.exec('INSERT INTO api_jobs VALUES(?,?,?,?)','job'+r.e.attemptId,r.e.operation,'complete',r.key);producer.reconcile();assert.equal((await producer.drainOne(async()=>{})).status,'private_offer_committed');}
 return{producer,core,ctx,bucket,accept,get reads(){return reads;}};
}
test('curated health reads actual accepted producer SQLite without raw/private fields or R2 reads',async t=>{
 const f=fixture(t);await f.accept(receipt('nx-rate',26,summary()));await f.accept(receipt());const before=f.reads;const health=privateNxHealth(f.core,{API_PRIVATE_NX_JSON:JSON.stringify(flag)});
 assert.equal(health.status,'private_only');assert.equal(health.diagnosticVersion,2);assert.equal(health.r2ProjectionAvailability,'not_checked');assert.equal(Object.hasOwn(health,'r2ProjectionAvailable'),false);assert.equal(health.latestCaptures.length,2);assert.equal(health.nativeSummary.reportedWindowHours,8);assert.equal(health.history.latestSourceHourSideRows,2);assert.equal(health.history.uniqueSourceHourLabels,1);assert.equal(health.history.changedRowRevisions,2);assert.equal(f.reads,before);
 for(const bad of ['receiptKey','receipt_key','body','steps','owner_name','rawBodyBase64'])assert(!JSON.stringify(health).includes('"'+bad+'"'));
});
test('unchanged repeated capture does not inflate row/revision counts; changed row adds one revision',async t=>{
 const f=fixture(t);await f.accept(receipt());await f.accept(receipt('nx-history',28,[row('buy',1793916000,15),row('sell',1793916000,20)],'2026-11-05T22:54:51.939Z'));
 let h=privateNxHealth(f.core,{API_PRIVATE_NX_JSON:JSON.stringify(flag)});assert.equal(h.captures.complete,2);assert.equal(h.history.latestSourceHourSideRows,2);assert.equal(h.history.changedRowRevisions,2);
 await f.accept(receipt('nx-history',29,[row('buy',1793916000,16),row('sell',1793916000,20)],'2026-11-05T22:55:51.939Z'));
 h=privateNxHealth(f.core,{API_PRIVATE_NX_JSON:JSON.stringify(flag)});assert.equal(h.history.changedRowRevisions,3);assert.equal(h.latestCaptures[0].attemptId,29);assert.equal(h.history.latestSourceHourSideRows,2);
});
test('off/invalid/missing tables remain explicit; corrupt state never leaks values',t=>{
 const f=fixture(t);assert.equal(privateNxHealth(f.core,{}).configuration,'disabled');assert.equal(privateNxHealth(f.core,{API_PRIVATE_NX_JSON:'bad'}).configuration,'invalid_configuration');
 f.core.sql.exec("INSERT INTO private_nx_captures(receipt_key,operation,source_attempt,state,available_at,raw_sha,captured_at) VALUES('x','nx-history',3,'complete',0,'SYNTHETIC_PRIVATE_ERROR','bad')");
 const h=privateNxHealth(f.core,{API_PRIVATE_NX_JSON:JSON.stringify(flag)});assert.equal(h.status,'diagnostic_unavailable');assert(!JSON.stringify(h).includes('SYNTHETIC_PRIVATE_ERROR'));
 f.core.sql.exec('DROP TABLE private_nx_revisions');assert.equal(privateNxHealth(f.core,{API_PRIVATE_NX_JSON:JSON.stringify(flag)}).status,'not_initialized');
});
test('producer constructor indexes preserve existing rows and cover latest lookup/state grouping without temporary sort',t=>{
 const f=fixture(t);const values=[];f.ctx.storage.transactionSync(()=>{
  for(let i=1;i<=5000;i++){
   const operation=i%2?'nx-history':'nx-rate',state=i%4?'complete':'pending',captured=new Date(Date.parse('2026-11-05T00:00:00Z')+i*1000).toISOString();
   f.core.sql.exec('INSERT INTO private_nx_captures(receipt_key,operation,source_attempt,state,available_at,raw_sha,captured_at) VALUES(?,?,?,?,?,?,?)','synthetic-index-'+i,operation,i,state,0,'a'.repeat(64),captured);values.push({operation,state,source_attempt:i,captured_at:captured,raw_sha:'a'.repeat(64)});
  }
 });
 f.core.sql.exec('DROP INDEX private_nx_capture_latest_v1');f.core.sql.exec('DROP INDEX private_nx_capture_state_v1');
 f.core.sql.exec("UPDATE private_nx_captures SET state='running',lease_until=1234567,claim=7,failures=2,last_result='synthetic_preserved_lease' WHERE receipt_key='synthetic-index-2'");
 f.core.sql.exec('CREATE TABLE api_attempts(id INTEGER PRIMARY KEY,round_ref TEXT,owner_marker TEXT)');f.core.sql.exec("INSERT INTO api_attempts VALUES(17,'synthetic-r1','synthetic-same-owner')");
 const beforeRowsHash=createHash('sha256').update(JSON.stringify(f.core.sql.exec('SELECT * FROM private_nx_captures ORDER BY receipt_key').toArray())).digest('hex');
 const before=f.core.row('SELECT COUNT(*) AS n FROM private_nx_captures').n;
 new PrivateNxOffersProducer(f.ctx,f.bucket,{enabled:true});new PrivateNxOffersProducer(f.ctx,f.bucket,{enabled:true}); // idempotent migration/restart
 assert.doesNotThrow(()=>new PrivateNxOffersProducer({storage:{sql:{exec(){throw Error('SQL forbidden while off');}}}},null,{enabled:false}));
 assert.equal(f.core.row('SELECT COUNT(*) AS n FROM private_nx_captures').n,before);
 assert.equal(createHash('sha256').update(JSON.stringify(f.core.sql.exec('SELECT * FROM private_nx_captures ORDER BY receipt_key').toArray())).digest('hex'),beforeRowsHash);assert.equal(f.core.row('SELECT COUNT(*) AS n FROM api_attempts').n,1);assert.equal(f.core.row('SELECT owner_marker FROM api_attempts WHERE id=17').owner_marker,'synthetic-same-owner');assert.equal(f.core.row('SELECT round_ref FROM api_attempts WHERE id=17').round_ref,'synthetic-r1');
 const query="SELECT source_attempt,raw_sha,captured_at FROM private_nx_captures WHERE operation=? AND state='complete' ORDER BY captured_at DESC,source_attempt DESC LIMIT 1";
 const latestPlan=f.core.sql.exec('EXPLAIN QUERY PLAN '+query,'nx-history').toArray();
 assert(latestPlan.some(r=>r.detail.includes('USING COVERING INDEX private_nx_capture_latest_v1')));assert(!latestPlan.some(r=>r.detail.includes('TEMP B-TREE')));
 const latest=f.core.row(query,'nx-history'),expected=values.filter(v=>v.operation==='nx-history'&&v.state==='complete').at(-1);assert.equal(latest.source_attempt,expected.source_attempt);assert.equal(latest.captured_at,expected.captured_at);
 const states=f.core.sql.exec('EXPLAIN QUERY PLAN SELECT state,COUNT(*) AS count FROM private_nx_captures GROUP BY state').toArray();assert(states.some(r=>r.detail.includes('USING COVERING INDEX private_nx_capture_state_v1')));assert(!states.some(r=>r.detail.includes('TEMP B-TREE')));
});
test('actual private-health afterRun embeds enabled/off NX status with correct hash and unchanged original source clocks',async t=>{
 const f=fixture(t);await f.accept(receipt('nx-rate',26,summary()));await f.accept(receipt());let now=Date.parse('2026-11-06T00:10:00Z'),saved=null;
 const env={API_PRIVATE_NX_JSON:JSON.stringify(flag),API_RAW_RECEIPTS:{async get(){return saved?{etag:'previous',json:async()=>JSON.parse(saved)}:null;},async put(key,body){assert.equal(key,'_private/provider-api/v1/health.json');saved=body;return{etag:'next'};}}};
 f.core.clock=()=>now;f.core.config=()=>({enabled:true,grantedPerMinute:30,grantedPerDay:null,operatorDailyRequestCap:30000});
 f.core.health=()=>({attempts:27,jobs:[],lastRawCapturedAt:'2026-11-05T22:53:51.939Z'});
 const health=new ApiPrivateHealth(f.ctx,env,f.core),reads=f.reads;assert.equal((await health.afterRun({status:'success'})).status,'published_private_health');
 function verified(){const record=JSON.parse(saved),{healthSha256,...unsigned}=record;assert.equal(createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'),healthSha256);assert.equal(record.providerAlarmRecoveryVersion,1);assert.equal(record.sourceObservedAt,null);assert.equal(record.publicationEligible,false);return record;}
 const first=verified();assert.equal(first.privateNxOffers.status,'private_only');assert.equal(first.privateNxOffers.nativeSummary.capturedAt,'2026-11-05T22:53:51.939Z');assert.equal(first.privateNxOffers.latestCaptures[0].capturedAt,'2026-11-05T22:53:51.939Z');
 now+=60000;await health.afterRun({status:'spacing_wait'});const next=verified();assert.notEqual(next.checkedAt,first.checkedAt);assert.deepEqual(next.privateNxOffers,first.privateNxOffers);assert.equal(next.lastRawCapturedAt,first.lastRawCapturedAt);assert.equal(f.reads,reads);
 const before=f.core.row('SELECT COUNT(*) AS n FROM private_nx_captures').n;env.API_PRIVATE_NX_JSON=JSON.stringify({enabled:false});await health.afterRun({status:'spacing_wait'});const off=verified();assert.equal(off.privateNxOffers.configuration,'disabled');assert.equal(off.privateNxOffers.status,'disabled_or_unavailable');assert.equal(off.privateNxOffers.sourceObservedAt,null);assert.equal(f.core.row('SELECT COUNT(*) AS n FROM private_nx_captures').n,before);
});
