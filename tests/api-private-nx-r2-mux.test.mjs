import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {fixture as baseFixture,rawReceipt,PRIVATE_FLAG} from './api-public-cash-fixture.mjs';
import {NX_POINTER,NX_PREFIX,readPrivateNxProjection} from '../ops/api-private-nx-projection.mjs';
import {privateNxR2Configuration,privateNxR2Health} from '../ops/api-private-nx-r2-health.mjs';
const FLAG={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:false};
function receipt(operation='nx-history',attempt=50){
 const rate=(n)=>({posters:1,median:n,mode:n,low:n,high:n,steps:[[n,1]]});
 const value=operation==='nx-rate'?{buy:rate(15),sell:rate(20),window_hours:8,limited:false,last_heard:1793880000}:['buy','sell'].map((side,i)=>({at:1793880000,side,posters:1,low:15+i*5,p25:15+i*5,median:15+i*5,p75:15+i*5,high:15+i*5,steps:{[15+i*5]:1}}));
 const raw=JSON.stringify(value),sha=createHash('sha256').update(raw).digest('hex'),capturedAt='2026-11-05T10:00:01.000Z';
 return{operation,key:`_private/provider-api/v1/receipts/${String(attempt).padStart(12,'0')}-${operation}-${sha}.json`,body:JSON.stringify({kind:'unverified_provider_api_receipt',operation,httpStatus:200,sourceUrl:'https://maplestory.market/api/nx-rate'+(operation==='nx-history'?'/history?range=7d&step=hour':''),schemaVerified:false,publicationEligible:false,sourceObservedAt:null,observationTimestampKnown:false,captureTimeKind:'http_response_completed',requestStartedAt:'2026-11-05T10:00:00.000Z',capturedAt,attemptId:attempt,rawBodyEncoding:'base64',rawBodyBase64:Buffer.from(raw).toString('base64'),responseBytes:Buffer.byteLength(raw),responseSha256:sha})};
}
async function fixture(t,{r2=FLAG,cash=false,nx=FLAG}={}){
 const f=await baseFixture(t,{privateFlag:cash?PRIVATE_FLAG:{enabled:false},publicFlag:cash?undefined:null,nxFlag:nx});
 if(r2!==null)f.env.API_PRIVATE_NX_R2_JSON=JSON.stringify(r2);await f.restart();
 f.seedNx=(r=receipt())=>{f.objects.set(r.key,{body:r.body,etag:'synthetic-nx-'+r.key});f.core.sql.exec("INSERT INTO api_jobs(job_key,operation,round_ref,state,available_at,receipt_key) VALUES(?,?,?,'complete',?,?)",'stored:'+r.key,r.operation,'synthetic-r1',f.now[0],r.key);return r;};
 return f;
}
async function finish(f,until=()=>false){const events=[];for(let n=0;n<30&&!until();n++){if(await f.alarm()===null)return events;const calls=f.calls.length,result=await f.fire();assert.equal(f.calls.length,calls,'stored private events cannot call provider');events.push(result);}assert(until()||await f.alarm()===null,'bounded event drain');return events;}

test('private NX R2 defaultOff/invalid/uncoupled switches create no publication tables or writes',async t=>{
 for(const r2 of [null,{enabled:false},{...FLAG,unexpected:true},{...FLAG,publicationEnabled:true}]){
  const f=await fixture(t,{r2});f.seedNx();await f.owner.kickScheduledCollection();await finish(f);
  assert.equal(f.row("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='private_nx_r2_outbox'").n,0);assert.equal(f.puts.some(k=>k===NX_POINTER||k.startsWith(NX_PREFIX)),false);assert.equal(f.calls.length,0);
 }
 const f=await fixture(t,{nx:{enabled:false}});assert.equal(privateNxR2Configuration(f.env,f.core),'requires_private_nx');assert.equal(f.owner.privateCash.nxPublisher,undefined);assert.equal(f.row("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='private_nx_r2_outbox'").n,0);
});

test('NX raw decode and private R2 publication are separate heavy events; original context and provider ledger unchanged',async t=>{
 const f=await fixture(t),r=f.seedNx();await f.owner.kickScheduledCollection();assert.equal(f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation,0);
 const first=await f.fire();assert.equal(first.eventKind,'private_nx_offers');assert.equal(first.providerAttempted,false);assert.equal(f.objects.has(NX_POINTER),false);assert.equal(f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation,1);
 const second=await f.fire();assert.equal(second.eventKind,'private_nx_r2');assert.equal(second.status,'private_projection_published');assert.equal(f.calls.length,0);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,0);
 const {projection,pointer}=await readPrivateNxProjection(f.bucket);assert.equal(pointer.receiptWatermarkAt,JSON.parse(r.body).capturedAt);assert.equal(projection.captures[0].requestStartedAt,JSON.parse(r.body).requestStartedAt);assert.equal(projection.sourceObservedAt,null);assert.equal(await f.alarm(),null);
 assert.equal(f.owner.fetch(new Request('https://inflation.gg/api-nx-offers.json')).status,404);
});

test('five overdue queues rotate fairly, preserving original four queue names and one selection per event',async t=>{
 const f=await fixture(t,{cash:true}),mux=f.owner.privateCash;let now=f.now[0];
 mux.publisher.nextDue=()=>now;mux.nxProducer.nextDue=()=>now;mux.nxPublisher.nextDue=()=>now;
 const choices=[];for(let n=0;n<10;n++){f.core.sql.exec('UPDATE api_cash_alarm_mux SET provider_at=?,private_at=?,recovery_at=NULL WHERE id=1',now,now);choices.push(mux.chooseAlarm());}
 assert.deepEqual(choices.slice(0,5),['private','public','nx','nx-r2','provider']);assert.deepEqual(choices.slice(5),choices.slice(0,5));assert.equal(f.calls.length,0);
});

test('shared recovery deadline is durable before publication storage, including NX-only cashOff mode',async t=>{
 const f=await fixture(t);f.seedNx();await f.owner.kickScheduledCollection();await f.fire();const get=f.bucket.get;let checked=0;
 f.bucket.get=async key=>{if(key===NX_POINTER||key.startsWith(NX_PREFIX)){checked++;const r=f.row('SELECT recovery_at FROM api_cash_alarm_mux WHERE id=1');assert(r.recovery_at>f.now[0]);assert((await f.alarm())!==null);assert(f.row('SELECT lease_until FROM private_nx_r2_outbox WHERE id=1').lease_until>f.now[0]);}return get(key);};
 await f.fire();assert(checked>=2);assert.equal(f.row("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='private_cash_jobs'").n,0);assert.equal(f.row('SELECT paused FROM api_cash_provider_recovery WHERE id=1').paused,1);assert.equal(f.calls.length,0);
});

test('hot reset after accepted producer commit before scheduling recovers atomic R2 target without raw reread',async t=>{
 const f=await fixture(t);f.seedNx();await f.owner.kickScheduledCollection();f.now[0]=await f.alarm();await f.owner.ctx.storage.deleteAlarm();assert.equal(f.owner.privateCash.chooseAlarm(),'nx');
 await f.owner.privateCash.armNxR2Recovery(f.now[0]+130000);assert.equal((await f.owner.privateCash.nxProducer.drainOne(()=>f.owner.privateCash.arm())).status,'private_offer_committed');
 const reads=f.reads.filter(k=>k.includes('/receipts/')).length;await f.restart();assert.notEqual(await f.alarm(),null);const events=await finish(f);assert(events.some(e=>e.eventKind==='private_nx_r2'));assert(f.objects.has(NX_POINTER));assert.equal(f.reads.filter(k=>k.includes('/receipts/')).length,reads);assert.equal(f.calls.length,0);
});

test('publisher TypeError/backoff/restart uses saved bytes; source clocks and all provider charges remain intact',async t=>{
 const f=await fixture(t);f.seedNx();await f.owner.kickScheduledCollection();await f.fire();const put=f.bucket.put;f.bucket.put=async(k,...a)=>{if(k===NX_POINTER)throw new TypeError('synthetic_transport');return put(k,...a);};
 const failed=await f.fire();assert.equal(failed.status,'private_projection_storage_retry');const staged=f.row('SELECT body,pointer_json,retry_at FROM private_nx_r2_outbox WHERE id=1');assert.equal(f.objects.has(NX_POINTER),false);assert((await f.alarm())>=staged.retry_at);
 f.bucket.put=put;await f.restart();const old=f.bucket.get;f.bucket.get=async key=>{assert(!key.includes('/receipts/'));return old(key);};await finish(f);const read=await readPrivateNxProjection(f.bucket);assert.equal(read.text,staged.body);assert.equal(read.pointer.receiptWatermarkAt,'2026-11-05T10:00:01.000Z');assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,0);
});

test('R2 Off pauses only retained publication while private NX continues; reenable preserves target and original clocks',async t=>{
 const f=await fixture(t);f.seedNx();await f.owner.kickScheduledCollection();await f.fire();const generation=f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation;
 f.env.API_PRIVATE_NX_R2_JSON='{"enabled":false}';await f.restart();await finish(f);assert.equal(f.objects.has(NX_POINTER),false);assert.equal(f.owner.privateCash.nxActive,true);assert.equal(f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation,generation);
 f.env.API_PRIVATE_NX_R2_JSON=JSON.stringify(FLAG);await f.restart();await finish(f);assert.equal((await readPrivateNxProjection(f.bucket)).pointer.generation,generation);assert.equal(f.calls.length,0);
});

test('existing authenticated provider pause does not block stored private publication or manufacture new source activity',async t=>{
 const f=await fixture(t);f.core.sql.exec('UPDATE api_control SET auth_stopped=1 WHERE id=1');delete f.env.MAPLESTORY_MARKET_APPROVED_API_KEY;f.seedNx(receipt('nx-rate'));f.seedNx(receipt('nx-history',51));await f.owner.kickScheduledCollection();await finish(f);
 const read=await readPrivateNxProjection(f.bucket);assert.equal(read.projection.nativeSummary.summary.reportedWindowHours,8);assert.equal(read.pointer.receiptWatermarkAt,'2026-11-05T10:00:01.000Z');assert.equal(f.core.health().authenticationStopped,true);assert.equal(f.calls.length,0);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,0);
});

test('private health reports curated SQL publication status with exact hash and no false R2 availability',async t=>{
 const f=await fixture(t);f.seedNx();await f.owner.kickScheduledCollection();await finish(f);const before=f.reads.length;const d=privateNxR2Health(f.core,f.env);assert.equal(d.configuration,'ready');assert.equal(d.outboxState,'published');assert.equal(d.publishedGeneration,1);assert.equal(d.r2ObjectVerifiedByThisHealth,false);assert.equal(Object.hasOwn(d,'projectionAvailable'),false);assert.equal(f.reads.length,before);
 await f.owner.privateHealth.afterRun({status:'spacing_wait'});const health=JSON.parse(f.objects.get('_private/provider-api/v1/health.json').body);const {healthSha256,...body}=health;assert.equal(healthSha256,createHash('sha256').update(JSON.stringify(body)).digest('hex'));assert.deepEqual(health.privateNxPublication,d);assert.equal(health.privateNxOffers.diagnosticVersion,2);assert.equal(health.privateNxOffers.r2ProjectionAvailability,'not_checked');assert.equal(Object.hasOwn(health.privateNxOffers,'r2ProjectionAvailable'),false);assert.equal(health.sourceObservedAt,null);assert.equal(health.lastRawCapturedAt,null);
 f.env.API_PRIVATE_NX_R2_JSON='{"enabled":false}';assert.equal(privateNxR2Health(f.core,f.env).outboxState,'not_enabled');
});

test('recovery arming failure retries durably with no publication I/O',async t=>{
 const f=await fixture(t);f.seedNx();await f.owner.kickScheduledCollection();await f.fire();const reads=f.reads.length,puts=f.puts.length,set=f.owner.ctx.storage.setAlarm;let fail=true;
 f.owner.ctx.storage.setAlarm=async at=>{if(fail){fail=false;throw Error('synthetic_alarm');}return set(at);};const result=await f.fire();assert.equal(result.status,'private_nx_r2_event_retry');assert.equal(f.reads.length,reads);assert.equal(f.puts.length,puts);assert.equal(await f.alarm(),f.now[0]+30000);f.owner.ctx.storage.setAlarm=set;await finish(f);assert(f.objects.has(NX_POINTER));assert.equal(f.calls.length,0);
});


test('live raw provider lease remains protected while private R2 publication completes',async t=>{
 const f=await fixture(t);f.seedNx();await f.owner.kickScheduledCollection();await f.fire();
 const g=JSON.parse(f.env.API_GRANT_JSON);g.allowedOperations=['status','prices','catalogue','overview','apple-detail','apple-history'];f.env.API_GRANT_JSON=JSON.stringify(g);
 f.env.API_SCHEDULE_JSON=JSON.stringify({enabled:true,scheduleReference:'synthetic-mux-r2',requestIntervalMilliseconds:2500,startupTargetSeconds:21600,recurring:[]});await f.owner.kickScheduledCollection();
 const claimed=f.core.claim(f.core.config());assert.equal(claimed.status,'claimed');const lease=f.row("SELECT lease_until FROM api_jobs WHERE state='running'").lease_until;
 assert.equal((await f.owner.privateCash.runNxR2Alarm()).status,'private_projection_published');assert(f.row('SELECT recovery_at FROM api_cash_alarm_mux WHERE id=1').recovery_at>=lease);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,1);assert.equal(f.calls.length,0);
});

test('retained SQL initialization on adoption stages legacy captures without a raw/provider request',async t=>{
 const f=await fixture(t,{r2:null});f.seedNx();await f.owner.kickScheduledCollection();await finish(f);const reads=f.reads.filter(k=>k.includes('/receipts/')).length;
 f.env.API_PRIVATE_NX_R2_JSON=JSON.stringify(FLAG);await f.restart();await finish(f);
 const read=await readPrivateNxProjection(f.bucket);assert.equal(read.projection.captures[0].metadataCompleteness,'legacy_missing_request_metadata');assert.equal(read.projection.captures[0].requestStartedAt,null);assert.equal(read.pointer.receiptWatermarkAt,'2026-11-05T10:00:01.000Z');assert.equal(f.reads.filter(k=>k.includes('/receipts/')).length,reads);assert.equal(f.calls.length,0);
});

test('quarantined private R2 target retains last-good and creates no repair or provider spin',async t=>{
 const f=await fixture(t);f.seedNx();await f.owner.kickScheduledCollection();await finish(f);const original=f.objects.get(NX_POINTER).body;
 f.seedNx(receipt('nx-rate',51));await f.owner.kickScheduledCollection();await f.fire();const put=f.bucket.put;f.bucket.put=async(k,...a)=>{if(k===NX_POINTER)throw Error('synthetic_pointer');return put(k,...a);};await f.fire();f.bucket.put=put;
 const saved=f.row('SELECT body FROM private_nx_r2_outbox WHERE id=1').body;f.core.sql.exec('UPDATE private_nx_r2_outbox SET body=? WHERE id=1',saved.replace('private_nx_offer_projection','unknown_projection'));
 await finish(f);assert.equal(f.objects.get(NX_POINTER).body,original);assert.equal(privateNxR2Health(f.core,f.env).outboxState,'quarantined');assert.equal(await f.alarm(),null);await f.restart();assert.equal(await f.alarm(),null);assert.equal(f.calls.length,0);
});


test('featureOff accepted NX updates catch up from retained SQL after authstop and reenable without new provider/raw reads',async t=>{
 const f=await fixture(t);f.seedNx();await f.owner.kickScheduledCollection();await finish(f);const old=JSON.parse(f.objects.get(NX_POINTER).body);
 f.env.API_PRIVATE_NX_R2_JSON='{"enabled":false}';await f.restart();f.seedNx(receipt('nx-history',51));await f.owner.kickScheduledCollection();await finish(f);assert.equal(JSON.parse(f.objects.get(NX_POINTER).body).generation,old.generation);
 const reads=f.reads.filter(k=>k.includes('/receipts/')).length;f.core.sql.exec('UPDATE api_control SET auth_stopped=1 WHERE id=1');delete f.env.MAPLESTORY_MARKET_APPROVED_API_KEY;f.env.API_PRIVATE_NX_R2_JSON=JSON.stringify(FLAG);await f.restart();assert.notEqual(await f.alarm(),null);await finish(f);
 const read=await readPrivateNxProjection(f.bucket);assert.equal(read.pointer.generation,old.generation+1);assert(read.projection.captures.some(c=>c.attemptId===51));assert.equal(read.pointer.receiptWatermarkAt,old.receiptWatermarkAt);assert.equal(f.reads.filter(k=>k.includes('/receipts/')).length,reads);assert.equal(f.calls.length,0);assert.equal(f.core.health().authenticationStopped,true);
 await f.owner.kickScheduledCollection();assert.equal(await f.alarm(),null);assert.equal(JSON.parse(f.objects.get(NX_POINTER).body).generation,old.generation+1);
});
