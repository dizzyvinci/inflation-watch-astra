import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ApiPrivateHealth} from '../ops/api-private-health.mjs';

function fixture(t,{enabled=true}={}){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());const now=[1793912627923],objects=new Map();let etag=0,fail=false,beforePut=null;
  db.exec('CREATE TABLE api_jobs(job_key TEXT PRIMARY KEY,operation TEXT,round_ref TEXT,state TEXT,receipt_key TEXT)');
  db.prepare('INSERT INTO api_jobs VALUES(?,?,?,?,?)').run('synthetic-r1:0:status','status','synthetic-r1','complete',
    '_private/provider-api/v1/receipts/000000000001-status-'+'a'.repeat(64)+'.json');
  const sql={exec(text,...args){const s=db.prepare(text);const rows=s.columns().length?s.all(...args):(s.run(...args),[]);return{toArray:()=>rows};}};
  const storage={transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}},sql};
  const core={sql,row(text,...args){return sql.exec(text,...args).toArray()[0];},clock:()=>now[0],
    config:()=>({enabled,grantedPerMinute:30,grantedPerDay:4,grantReference:'SECRET-NEVER-COPY',probeRound:'synthetic-r1'}),
    health:()=>({authenticationStopped:false,retryNotBefore:null,nextAllowedAt:'2026-11-05T21:13:47.814Z',
      lastRawCapturedAt:'2026-11-05T21:03:47.923Z',sourceObservedAt:'NEVER-COPY',schemaVerified:true,
      rawPayload:'SECRET-NEVER-COPY',privatePointerPending:false,attempts:1,jobs:[{state:'complete',count:1},{state:'RAW-PRIVATE-NAME',count:1}]})};
  const bucket={async get(key){if(fail)throw new Error('Synthetic storage failure');const row=objects.get(key);return row?{etag:row.etag,json:async()=>JSON.parse(row.body)}:null;},
    async put(key,body,opts){if(fail)throw new Error('Synthetic storage failure');if(beforePut)await beforePut(body);
      const old=objects.get(key),cond=opts.onlyIf;if(cond.etagDoesNotMatch==='*'&&old||cond.etagMatches&&cond.etagMatches!==old?.etag)return null;
      const row={body,etag:String(++etag)};objects.set(key,row);return row;}};
  const mirror=new ApiPrivateHealth({storage},{API_RAW_RECEIPTS:bucket},core);
  return{mirror,objects,now,core,row:()=>core.row('SELECT * FROM api_private_health'),setFail(v){fail=v;},setBefore(fn){beforePut=fn;}};
}
const KEY='_private/provider-api/v1/health.json';

test('off never writes R2 or advances revision',async t=>{
  const f=fixture(t,{enabled:false});assert.equal((await f.mirror.afterRun({status:'disabled'})).status,'skipped_off');
  assert.equal(f.row().revision,0);assert.equal(f.objects.size,0);
});
test('spacing wait is a real owner check, preserves last receipt/source semantics and allowlists fields',async t=>{
  const f=fixture(t);assert.equal((await f.mirror.afterRun({status:'spacing_wait'})).status,'published_private_health');
  const raw=f.objects.get(KEY).body,health=JSON.parse(raw);
  assert.equal(health.result,'spacing_wait');assert.equal(health.lastRawCapturedAt,'2026-11-05T21:03:47.923Z');
  assert.equal(health.sourceObservedAt,null);assert.equal(health.schemaVerified,false);assert.equal(health.publicationEligible,false);
  assert.equal(health.configuredDailyCeiling,4);assert.equal(health.jobs.length,1);
  assert.equal(health.completedReceipts.length,1);assert.equal(health.completedReceipts[0].operation,'status');
  assert.ok(!raw.includes('SECRET-NEVER-COPY'));assert.ok(!raw.includes('RAW-PRIVATE-NAME'));assert.ok(!raw.includes('rawPayload'));
});
test('completed receipt index is current initial six only, excludes recurring/other-round/untrusted paths',async t=>{
  const f=fixture(t);const operations=['status','prices','catalogue','overview','apple-detail','apple-history'];
  for(let index=1;index<6;index++)f.core.sql.exec('INSERT INTO api_jobs VALUES(?,?,?,?,?)',
    `synthetic-r1:${index}:${operations[index]}`,operations[index],'synthetic-r1','complete',
    `_private/provider-api/v1/receipts/00000000000${index+1}-${operations[index]}-${'b'.repeat(64)}.json`);
  f.core.sql.exec('INSERT INTO api_jobs VALUES(?,?,?,?,?)','old:0:status','status','old','complete','SECRET-NEVER-COPY');
  f.core.sql.exec('INSERT INTO api_jobs VALUES(?,?,?,?,?)','synthetic-r1:r:1:status','status','synthetic-r1','complete','SECRET-NEVER-COPY');
  await f.mirror.afterRun({status:'success'});const health=JSON.parse(f.objects.get(KEY).body);
  assert.equal(health.completedReceipts.length,6);assert.deepEqual(health.completedReceipts.map(row=>row.operation),operations);
  for(const row of health.completedReceipts)assert.deepEqual(Object.keys(row),['operation','receiptKey','roundReference']);
  assert.ok(!f.objects.get(KEY).body.includes('SECRET-NEVER-COPY'));
});
test('failed write retains outbox; retry publishes exact old checkedAt without a new provider attempt',async t=>{
  const f=fixture(t);f.setFail(true);await assert.rejects(f.mirror.afterRun({status:'success'}));
  const before=f.row();assert.equal(before.pending,1);f.now[0]+=600000;f.setFail(false);assert.equal(await f.mirror.flush(),true);
  assert.equal(JSON.parse(f.objects.get(KEY).body).checkedAt,JSON.parse(before.body).checkedAt);assert.equal(f.row().pending,0);
});
test('slower stale writer cannot overwrite a newer health revision',async t=>{
  const f=fixture(t);let entered,release;const observed=new Promise(resolve=>{entered=resolve;});const gate=new Promise(resolve=>{release=resolve;});
  f.setBefore(async body=>{if(JSON.parse(body).revision===1){entered();await gate;}});
  const old=f.mirror.afterRun({status:'spacing_wait'});await observed;f.now[0]+=1000;
  assert.equal((await f.mirror.afterRun({status:'success'})).status,'published_private_health');release();await old;
  const health=JSON.parse(f.objects.get(KEY).body);assert.equal(health.revision,2);assert.equal(health.result,'success');assert.equal(f.row().pending,0);
});
