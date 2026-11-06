import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,receipt} from './nx-history-source-fixture.mjs';
import {NxHistoryArchiveWork,nxHistoryArchiveConfiguration} from '../ops/nx-history-owner-work.mjs';
const flag={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:true};
function owner(f,env){return new NxHistoryArchiveWork(f.ctx,env,{getSourceProducer:()=>f.producer,now:()=>f.now[0]});}
const archiveTables=f=>f.sql.exec("SELECT name FROM sqlite_master WHERE name LIKE 'nx_archive_%'").toArray().length;
test('owner bootstrap defaultOff/invalid creates no control/schema/IO and inactive defer stays harmless',t=>{
 for(const v of [undefined,{enabled:false},{...flag,extra:1},{...flag,publicationEnabled:false}]){
  const f=fixture(t),env={API_RAW_RECEIPTS:f.bucket,...(v?{API_NX_HISTORY_JSON:JSON.stringify(v)}:{})},work=owner(f,env);
  assert.equal(work.active,false);assert.equal(work.nextDue(),null);assert.equal(work.defer(),null);
  assert.equal(f.sql.exec("SELECT name FROM sqlite_master WHERE name IN ('api_nx_history_owner','nx_archive_control')").toArray().length,0);assert.equal(f.reads.length,0);assert.equal(f.puts.length,0);
 }
 assert.equal(nxHistoryArchiveConfiguration({API_NX_HISTORY_JSON:'{"enabled":false,"unknown":1}'}),'invalid_configuration');
});
test('bootstrap beforeIO TypeError durably backs off30..300s across resets, then resumes one heavy phase without raw IO',async t=>{
 const f=fixture(t);await f.accept(receipt());const env={API_RAW_RECEIPTS:f.bucket,API_NX_HISTORY_JSON:JSON.stringify(flag)},reads=f.reads.length,puts=f.puts.length;let work=owner(f,env),callbacks=0;
 for(const delay of [30000,60000,120000,240000,300000]){
  const result=await work.drainOne(async()=>{callbacks++;throw TypeError('synthetic arm storage');});assert.equal(result.status,'archive_owner_bootstrap_retry');assert.equal(result.retryAt,f.now[0]+delay);
  assert.equal(archiveTables(f),0);assert.equal(work.flight,null);work=owner(f,env);assert.equal(work.nextDue(),f.now[0]+delay);
  assert.equal((await work.drainOne(async()=>assert.fail('not due'))).status,'backoff');f.now[0]+=delay;
 }
 assert.equal(callbacks,5);assert.equal((await work.drainOne(async()=>{})).status,'archive_owner_bootstrapped');assert(archiveTables(f)>0);
 assert.equal(f.reads.length,reads);assert.equal(f.puts.length,puts);assert.equal(work.row().failures,0);assert.equal(work.row().retry_at,0);
 assert.equal((await work.drainOne(async()=>{})).status,'source_indexes_ready');
});
test('running bootstrap lease and epoch survive reset; late old callback cannot overwrite replacement ready state',async t=>{
 const f=fixture(t),env={API_RAW_RECEIPTS:f.bucket,API_NX_HISTORY_JSON:JSON.stringify(flag)},first=owner(f,env);let enter,release;
 const entered=new Promise(r=>enter=r),blocked=new Promise(r=>release=r),old=first.drainOne(async()=>{enter();await blocked;});await entered;
 const second=owner(f,env);assert.equal((await second.drainOne(async()=>assert.fail('live lease'))).status,'backoff');assert.equal(archiveTables(f),0);
 f.now[0]+=130001;assert.equal((await second.drainOne(async()=>{})).status,'archive_owner_bootstrapped');const row=second.row();release();assert.equal((await old).status,'archive_owner_stale_bootstrap');
 assert.deepEqual(second.row(),row);assert.equal(first.producer,null);assert.equal(f.reads.length,0);assert.equal(f.puts.length,0);
});
test('Off during bootstrap awaits preserves control but makes no archive SQL/IO; On resumes',async t=>{
 const f=fixture(t),env={API_RAW_RECEIPTS:f.bucket,API_NX_HISTORY_JSON:JSON.stringify(flag)},work=owner(f,env);
 const r=await work.drainOne(async()=>{env.API_NX_HISTORY_JSON='{"enabled":false}';});assert.equal(r.status,'archive_owner_paused');assert.equal(archiveTables(f),0);assert.equal(work.nextDue(),null);assert.equal(work.defer(),null);
 env.API_NX_HISTORY_JSON=JSON.stringify(flag);assert.equal((await work.drainOne(async()=>{})).status,'archive_owner_bootstrapped');assert.equal(f.reads.length,0);assert.equal(f.puts.length,0);
});
test('explicit outer event defer before producer exists is durable and does not touch accepted source/budgets',t=>{
 const f=fixture(t),env={API_RAW_RECEIPTS:f.bucket,API_NX_HISTORY_JSON:JSON.stringify(flag)},work=owner(f,env),source=f.sql.exec('SELECT * FROM private_nx_captures').toArray();
 const at=work.defer();assert.equal(at,f.now[0]+30000);assert.equal(owner(f,env).nextDue(),at);assert.equal(archiveTables(f),0);assert.deepEqual(f.sql.exec('SELECT * FROM private_nx_captures').toArray(),source);assert.equal(f.reads.length,0);
});
test('archive producer backoff/stage survives facade reset; bootstrap does not clear producer retry or original source',async t=>{
 const f=fixture(t);await f.accept(receipt());const env={API_RAW_RECEIPTS:f.bucket,API_NX_HISTORY_JSON:JSON.stringify(flag)};let work=owner(f,env);
 await work.drainOne(async()=>{});for(let i=0;i<20&&!f.row('SELECT 1 AS n FROM nx_archive_outbox');i++)await work.drainOne(async()=>{});
 assert(f.row('SELECT 1 AS n FROM nx_archive_outbox'));const body=f.row('SELECT page_body FROM nx_archive_outbox').page_body;
 f.onGet(()=>{throw TypeError('SDK');});const r=await work.drainOne(async()=>{});assert.equal(r.status,'storage_retry');const due=work.producer.nextDue();
 work=owner(f,env);await work.drainOne(async()=>{});assert.equal(work.producer.nextDue(),due);assert.equal((await work.drainOne(async()=>{})).status,'backoff');assert.equal(f.row('SELECT page_body FROM nx_archive_outbox').page_body,body);
});
test('corrupt bootstrap counters/unknown state hold only this kind without scheduling or IO',async t=>{
 const f=fixture(t),env={API_RAW_RECEIPTS:f.bucket,API_NX_HISTORY_JSON:JSON.stringify(flag)},work=owner(f,env);
 f.sql.exec("UPDATE api_nx_history_owner SET state='unexpected',claim=-1");assert.equal(work.nextDue(),null);assert.equal(work.defer(),null);
 assert.equal((await work.drainOne(async()=>assert.fail('held'))).status,'idle');assert.equal(work.health().status,'archive_owner_invalid_state');assert.equal(archiveTables(f),0);assert.equal(f.reads.length,0);
});
