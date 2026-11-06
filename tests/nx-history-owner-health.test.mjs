import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,receipt} from './nx-history-source-fixture.mjs';
import {NxHistoryArchiveWork} from '../ops/nx-history-owner-work.mjs';
import {nxHistoryArchiveHealth} from '../ops/nx-history-health.mjs';
const flag=JSON.stringify({schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:true});
test('curated archive health is defaultOff SQL-free and ready-only missing state is not remote absence',()=>{
 const core={row(){throw Error('SQL forbidden');}};
 assert.equal(nxHistoryArchiveHealth(core,{}).status,'not_enabled');
 const health=nxHistoryArchiveHealth({row:()=>null},{API_NX_HISTORY_JSON:flag});assert.equal(health.status,'not_initialized');assert.equal(health.remoteR2Availability,'not_checked');
});
test('private archive health preserves original included clock with aggregate-only closed SQL result',async t=>{
 const f=fixture(t);await f.accept(receipt());const env={API_RAW_RECEIPTS:f.bucket,API_NX_HISTORY_JSON:flag},core={row:f.row},work=new NxHistoryArchiveWork(f.ctx,env,{getSourceProducer:()=>f.producer,now:()=>f.now[0]});
 assert.equal(nxHistoryArchiveHealth(core,env).status,'bootstrap_pending');
 for(let i=0;i<30&&work.nextDue()!==null;i++)await work.drainOne(async()=>{});
 const reads=f.reads.length,health=nxHistoryArchiveHealth(core,env);assert.equal(health.status,'private_sql_only');assert.equal(health.publishedGeneration,1);assert.equal(health.publishedHourSideRows,2);
 assert.equal(health.publishedReceiptWatermarkAt,'2026-11-05T22:53:51.939Z');assert.equal(health.remoteR2ObjectVerified,false);assert.equal(f.reads.length,reads);
 assert(!/receipt_key|rawSha|sourceAttempt|owner_name|derived-api|_private\//.test(JSON.stringify(health)));
 f.now[0]+=3600000;assert.equal(nxHistoryArchiveHealth(core,env).publishedReceiptWatermarkAt,health.publishedReceiptWatermarkAt);
});
test('corrupt archive diagnostics return one fixed unavailable state without leaking stored values',t=>{
 const f=fixture(t),env={API_RAW_RECEIPTS:f.bucket,API_NX_HISTORY_JSON:flag};new NxHistoryArchiveWork(f.ctx,env,{getSourceProducer:()=>f.producer,now:()=>f.now[0]});
 f.sql.exec("UPDATE api_nx_history_owner SET last_result='raw-secret-not-for-output'");const health=nxHistoryArchiveHealth({row:f.row},env);
 assert.equal(health.status,'diagnostic_unavailable');assert(!JSON.stringify(health).includes('raw-secret'));
});
