import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './fast-registration-fixture.mjs';
import {privateFastCurrentVerificationHealth} from '../ops/api-fast-current-verification-health.mjs';
const cfg={schemaVersion:1,enabled:true,approvalRecorded:true,mode:'continuous_v2_reprojection',contractSha256:'e0c58417ac4bc4097d7a61d85797002708073a35fac48a7234c0bc646e977893',grantReference:'synthetic-grant',roundReference:'synthetic-r1',publicationEnabled:false};
test('actual SQLite helper costs exactly two bounded snapshots and uses indexed metadata lookups without a body/page scan',async t=>{
 const f=await fixture(t,{fast:false,registrationConfig:cfg});f.seed();await f.owner.privateCash.afterProviderEvent(f.owner.recurring.eventFrame());for(let i=0;i<100&&!f.row("SELECT 1 n FROM fast_v2_generations WHERE role='current'");i++)await f.owner.alarm();
 const exec=f.core.sql.exec,queries=[];let rows=0;f.core.sql.exec=(sql,...args)=>{queries.push({sql,args});const result=exec(sql,...args);return{toArray(){const values=result.toArray();rows+=values.length;return values;}};};let value;try{value=await privateFastCurrentVerificationHealth(f.core,{delegate:f.owner.fastCurrentRegistration.delegate,checkedAt:new Date(f.now[0]).toISOString()});}finally{f.core.sql.exec=exec;}
 assert.equal(value.status,'committed_sql_only');assert.equal(queries.length,26);assert(rows<=26);const plans=[];
 for(const {sql,args}of queries){assert(/^SELECT\b/.test(sql));const details=exec('EXPLAIN QUERY PLAN '+sql,...args).toArray().map(v=>v.detail);assert(details.every(d=>!(/\bSCAN\b/.test(d))),details.join(';'));plans.push(details);}
 assert(queries.every(v=>!v.sql.includes('fast_current_shards')&&!v.sql.includes('fast_current_stage_checkpoints')&&!v.sql.includes('fast_v2_generation_replay')&&!v.sql.includes('fast_v2_price_profiles')));assert.equal(f.provider.length,0);t.diagnostic(JSON.stringify({queries:queries.length,returnedRows:rows,fullScans:0,receiptOrShardBodies:0,externalCalls:0,outputBytes:Buffer.byteLength(JSON.stringify(value)),snapshotCount:2}));
});
