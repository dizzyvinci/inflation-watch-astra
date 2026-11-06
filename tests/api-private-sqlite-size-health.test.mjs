import test from 'node:test';import assert from 'node:assert/strict';
import {privateSqliteStorageHealth as read,DOCUMENTED_PAID_OBJECT_LIMIT_BYTES as LIMIT} from '../ops/api-private-sqlite-size-health.mjs';
const checkedAt='2026-11-06T09:00:00.000Z',options={checkedAt};
const config={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:false};
const env={API_PRIVATE_SQLITE_SIZE_JSON:JSON.stringify(config)};
const forbidden=new Proxy({}, {get(){throw Error('forbidden capability');}});
test('absent and exact Off return no field before accessing any context capability',()=>{
  for(const e of [{},{API_PRIVATE_SQLITE_SIZE_JSON:'{"enabled":false}'}])assert.equal(read(forbidden,e,options),null);
});
test('closed malformed configuration never accesses storage or echoes supplied values',()=>{
  for(const value of ['{',null,[],JSON.stringify({...config,extra:'private-input'}),JSON.stringify({...config,publicationEnabled:true}),'{"enabled":false,"enabled":false}','{"\\u0065nabled":false}',JSON.stringify({...config,methodVersion:'1'}),'x'.repeat(513)]){
    const result=read(forbidden,{API_PRIVATE_SQLITE_SIZE_JSON:value},options);
    assert.equal(result.status,'invalid_configuration');assert(!JSON.stringify(result).includes('private-input'));assert.equal(result.databaseSizeBytes,null);
  }
});
test('exact synchronous databaseSize getter once, no exec, rows, key, provider or transport',()=>{
  let count=0;const sql=new Proxy({}, {get(_,key){assert.equal(key,'databaseSize');count++;return 12345;}});
  const ctx={storage:{sql}},guardedEnv=new Proxy(env,{get(t,k){assert.equal(k,'API_PRIVATE_SQLITE_SIZE_JSON');return t[k];}});
  const d=read(ctx,guardedEnv,options);assert.equal(d.status,'observed');assert.equal(d.databaseSizeBytes,12345);assert.equal(count,1);assert.equal(d.applicationSqlQueries,0);assert.equal(d.sourceRowsInspected,0);
});
test('zero is observed rather than unknown; source clock is never inspection time',()=>{
  const d=read({storage:{sql:{databaseSize:0}}},env,options);assert.equal(d.status,'observed');assert.equal(d.databaseSizeBytes,0);assert.equal(d.fractionOfDocumentedPaidLimit,0);assert.equal(d.measuredAt,checkedAt);assert.equal(d.sourceObservedAt,null);assert.equal(d.qualifiedIndividualTrades,0);
});
test('unsupported, thrown, invalid primitive and unsafe size remain unknown, not zero',()=>{
  const inputs=[{}, {storage:{get sql(){throw Error('private text');}}}, ...[undefined,null,false,'0',NaN,Infinity,-1,0.5,Number.MAX_SAFE_INTEGER+1].map(databaseSize=>({storage:{sql:{databaseSize}}}))];
  for(const ctx of inputs){const d=read(ctx,env,options);assert.equal(d.status,'unavailable');assert.equal(d.databaseSizeBytes,null);assert.equal(d.measuredAt,null);assert(!JSON.stringify(d).includes('private text'));}
});
test('decimal Paid limit is comparison only, not an invented hard validator or plan proof',()=>{
  assert.equal(LIMIT,10_000_000_000);for(const [n,relation]of [[LIMIT-1,'below'],[LIMIT,'at'],[LIMIT+1,'above'],[Number.MAX_SAFE_INTEGER,'above']]){const d=read({storage:{sql:{databaseSize:n}}},env,options);assert.equal(d.status,'observed');assert.equal(d.documentedLimitRelation,relation);assert.equal(d.actualPlanVerifiedByThisDiagnostic,false);assert.equal(d.remoteR2Availability,'not_checked');}
});
test('invalid or missing operator clock fails closed before storage read',()=>{
  for(const checkedAt of [undefined,null,'2026-02-30T00:00:00.000Z','2026-11-06','2026-11-06T09:00:00.000Z-private'])assert.equal(read(forbidden,env,{checkedAt}).status,'invalid_measurement_clock');
});
test('closed output contains no owner, object, source, job, actor, path or raw identities',()=>{
  const d=read({storage:{sql:{databaseSize:42}}},env,options);assert.deepEqual(Object.keys(d),['diagnosticVersion','status','metric','measuredAt','measurementClockKind','databaseSizeBytes','documentedPaidObjectLimitBytes','fractionOfDocumentedPaidLimit','documentedLimitRelation','actualPlanVerifiedByThisDiagnostic','remoteR2Availability','sourceObservedAt','qualifiedIndividualTrades','applicationSqlQueries','sourceRowsInspected']);
});
