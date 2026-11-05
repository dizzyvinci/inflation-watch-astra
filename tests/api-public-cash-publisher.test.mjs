import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,rawReceipt,PUBLIC_FLAG,PRIVATE_FLAG,PUBLIC_POINTER} from './api-public-cash-fixture.mjs';
import {publicCashStatus,validatePublicBody} from '../ops/api-public-cash-contract.mjs';

test('public defaultOff/invalid/privateOff creates no public outbox or public writes',async t=>{
 for(const publicFlag of [null,{enabled:false},{enabled:'true'},{...PUBLIC_FLAG,publicationEnabled:false}]){
  const f=await fixture(t,{publicFlag});f.seed(rawReceipt());await f.owner.kickScheduledCollection();await f.fire();
  assert.equal(f.row("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='api_public_cash_outbox'").n,0);
  assert.equal(f.publicPointer(),null);assert.ok(!f.puts.some(k=>k.startsWith('derived-cash-items/')));
 }
 const off=await fixture(t,{privateFlag:{enabled:false}});assert.equal(publicCashStatus(off.env),'private_projection_required');
 assert.equal(off.row("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='api_public_cash_outbox'").n,0);
});
test('raw provider event, private raw decode and public publication are distinct; retries never spend provider',async t=>{
 const f=await fixture(t);await f.owner.enqueueProbeRound('synthetic-r1');assert.equal((await f.owner.runOne()).status,'success');
 assert.equal(f.calls.length,1);assert.equal(f.publicPointer(),null);assert.equal(f.row("SELECT COUNT(*) AS n FROM private_cash_jobs WHERE state='complete'").n,0);
 assert.equal((await f.fire()).eventKind,'private_projection');assert.equal(f.publicPointer(),null);
 const result=await f.fire();assert.equal(result.eventKind,'public_subset');assert.equal(result.status,'public_published');
 assert.equal(f.calls.length,1);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,1);
 const dto=JSON.parse(f.objects.get(f.publicPointer().dataKey).body);await validatePublicBody(dto);
 assert.equal(dto.records.length,29);assert.ok(dto.records.every(r=>r.mesosPerNx===10&&r.recordedSalesCount===5));
 const text=JSON.stringify(dto);for(const privateText of ['_private/','rawBody','owner_name','player_id','grantReference','by_stats'])assert.ok(!text.includes(privateText));
});
test('crash after private completion before public enqueue recovers from durable private SQL without raw redecode',async t=>{
 const f=await fixture(t);f.seed(rawReceipt());await f.owner.privateCash.beforeProviderEvent();
 f.owner.privateCash.materializer.reconcileCompletedPrices();await f.owner.privateCash.materializer.drainOne();
 const rawReads=f.reads.filter(k=>k.includes('/receipts/')).length;assert.equal(f.row('SELECT target_attempt FROM api_public_cash_outbox WHERE id=1').target_attempt,0);
 await f.restart();const recovered=await f.fire();assert.equal(recovered.eventKind,'public_subset');assert.equal(recovered.status,'public_published');
 assert.equal(f.reads.filter(k=>k.includes('/receipts/')).length,rawReads);assert.equal(f.calls.length,0);
});
test('public body write failure retains private completion; restart publishes saved bytes without private/raw reread',async t=>{
 const f=await fixture(t);f.seed(rawReceipt());await f.owner.kickScheduledCollection();await f.fire();f.fail('public_body');
 assert.equal((await f.fire()).status,'public_storage_retry');const row=f.row('SELECT * FROM api_public_cash_outbox WHERE id=1');assert.ok(row.body&&row.pointer_json);
 const reads=f.reads.length,privateState=f.row("SELECT state FROM private_cash_jobs").state;assert.equal(privateState,'complete');
 f.fail(null);await f.restart();assert.equal((await f.fire()).status,'public_published');
 assert.ok(f.reads.slice(reads).every(k=>!k.includes('/receipts/')&&!k.includes('/cash-projections/')));
 assert.equal(f.objects.get(f.publicPointer().dataKey).body,row.body);assert.equal(f.calls.length,0);
});
test('final public pointer failure preserves repair alarm and clocks through restart without another source read',async t=>{
 const f=await fixture(t);f.seed(rawReceipt());await f.owner.kickScheduledCollection();await f.fire();f.fail('public_pointer');
 assert.equal((await f.fire()).status,'public_storage_retry');const deadline=await f.alarm();assert.equal(deadline,f.now[0]+30000);
 const privateReads=f.reads.filter(k=>k.includes('/cash-projections/')).length;f.fail(null);await f.restart();
 assert.equal((await f.fire()).status,'public_published');assert.equal(f.reads.filter(k=>k.includes('/cash-projections/')).length,privateReads);
 assert.equal(f.publicPointer().capturedAt,JSON.parse(rawReceipt().body).capturedAt);assert.equal(f.calls.length,0);
});
test('newer public pointer cannot be rolled back by older private completion replay',async t=>{
 const f=await fixture(t);const newer=await f.complete(2,12),body=f.objects.get(PUBLIC_POINTER).body;
 const current=f.core.row('SELECT body FROM private_cash_outbox WHERE id=1');
 f.seed(rawReceipt(1,10));await f.owner.kickScheduledCollection();if(await f.alarm()!==null)await f.fire();
 assert.equal(f.objects.get(PUBLIC_POINTER).body,body);assert.equal(f.publicPointer().sourceAttemptId,newer.sourceAttemptId);
 assert.equal(f.core.row('SELECT body FROM private_cash_outbox WHERE id=1').body,current.body);
});
test('private pointer storage failure does not undo completed private DTO or independently staged public subset',async t=>{
 const f=await fixture(t);f.seed(rawReceipt());f.fail('private_pointer');await f.owner.kickScheduledCollection();await f.fire();
 assert.equal(f.row("SELECT state FROM private_cash_jobs").state,'complete');
 // Public deadline is earlier than private pointer retry; no need to repair it first.
 assert.equal((await f.fire()).eventKind,'public_subset');assert.ok(f.publicPointer());assert.equal(f.calls.length,0);
});
test('privateOff and publicOff pause retained public work and re-enable with the exact old source clocks',async t=>{
 const f=await fixture(t);f.seed(rawReceipt());await f.owner.kickScheduledCollection();await f.fire();f.fail('public_pointer');await f.fire();
 const saved=f.row('SELECT body FROM api_public_cash_outbox WHERE id=1').body;
 f.env.API_PUBLIC_CASH_JSON=JSON.stringify({enabled:false});await f.restart();await f.owner.kickScheduledCollection();assert.equal(f.publicPointer(),null);
 assert.equal(f.publisher.active,false);f.env.API_PUBLIC_CASH_JSON=JSON.stringify(PUBLIC_FLAG);f.env.API_PRIVATE_CASH_JSON=JSON.stringify({enabled:false});await f.restart();
 assert.equal(f.owner.privateCash.active,false);f.env.API_PRIVATE_CASH_JSON=JSON.stringify(PRIVATE_FLAG);f.fail(null);await f.restart();await f.owner.kickScheduledCollection();
 assert.equal((await f.fire()).status,'public_published');assert.equal(f.objects.get(f.publicPointer().dataKey).body,saved);assert.equal(f.calls.length,0);
});
test('bad private semantic/hash proof cannot corrupt lastgood public pointer or block private collection',async t=>{
 const f=await fixture(t);await f.complete();const before=f.objects.get(PUBLIC_POINTER).body;
 f.seed(rawReceipt(2,12));await f.owner.kickScheduledCollection();await f.fire();
 const p=JSON.parse(f.row('SELECT body FROM private_cash_outbox WHERE id=1').body);
 f.objects.set(p.projectionKey,{body:'{}',etag:'corrupt-synthetic'});
 assert.equal((await f.fire()).status,'public_quarantined');assert.equal(f.objects.get(PUBLIC_POINTER).body,before);
 assert.equal(f.row("SELECT COUNT(*) AS n FROM private_cash_jobs WHERE state='complete'").n,2);
});
test('a remote newer pointer defeats an older durable outbox, even after an older SQL recovery',async t=>{
 const f=await fixture(t);f.seed(rawReceipt(1));await f.owner.kickScheduledCollection();await f.fire();f.fail('public_body');await f.fire();
 const old=f.row('SELECT * FROM api_public_cash_outbox WHERE id=1');f.fail(null);await f.complete(2,12);const before=f.objects.get(PUBLIC_POINTER).body;
 f.core.sql.exec("UPDATE api_public_cash_outbox SET target_attempt=?,target_json=?,state='ready',body=?,pointer_json=?,subset_hash=?,lease_until=NULL,retry_at=0,tries=0 WHERE id=1",
  old.target_attempt,old.target_json,old.body,old.pointer_json,old.subset_hash);
 assert.equal((await f.publisher.drainOne()).status,'public_superseded');assert.equal(f.objects.get(PUBLIC_POINTER).body,before);assert.equal(f.calls.length,0);
});
test('async newer private completion fences an older publisher before any public pointer commit',async t=>{
 const f=await fixture(t);f.seed(rawReceipt(1));await f.owner.kickScheduledCollection();await f.fire();
 const oldTarget=JSON.parse(f.row('SELECT target_json FROM api_public_cash_outbox WHERE id=1').target_json),get=f.bucket.get.bind(f.bucket);
 let release,entered;const wait=new Promise(r=>release=r),inside=new Promise(r=>entered=r);
 f.bucket.get=async key=>{if(key===oldTarget.projectionKey){entered();await wait;}return get(key);};
 const old=f.publisher.drainOne();await inside;
 f.seed(rawReceipt(2,12));f.owner.privateCash.materializer.reconcileCompletedPrices();await f.owner.privateCash.materializer.drainOne();f.publisher.reconcile();
 release();assert.equal((await old).status,'public_stale_target');assert.equal(f.publicPointer(),null);
 assert.equal((await f.publisher.drainOne()).status,'public_published');assert.equal(f.publicPointer().sourceAttemptId,2);
});
test('flag disabled while awaiting private DTO cannot publish; re-enable uses same source evidence',async t=>{
 const f=await fixture(t);f.seed(rawReceipt());await f.owner.kickScheduledCollection();await f.fire();
 const target=JSON.parse(f.row('SELECT target_json FROM api_public_cash_outbox WHERE id=1').target_json),get=f.bucket.get.bind(f.bucket);
 let release,entered;const wait=new Promise(r=>release=r),inside=new Promise(r=>entered=r);
 f.bucket.get=async key=>{if(key===target.projectionKey){entered();await wait;}return get(key);};
 const pending=f.publisher.drainOne();await inside;f.env.API_PUBLIC_CASH_JSON=JSON.stringify({enabled:false});release();
 assert.equal((await pending).status,'public_disabled');assert.equal(f.publicPointer(),null);assert.ok(!f.puts.some(k=>k.startsWith('derived-cash-items/')));
 f.env.API_PUBLIC_CASH_JSON=JSON.stringify(PUBLIC_FLAG);assert.equal((await f.publisher.drainOne()).status,'public_published');assert.equal(f.calls.length,0);
});
test('duplicate alarm while an owner event waits on storage preserves a durable recovery deadline',async t=>{
 const f=await fixture(t);f.seed(rawReceipt());await f.owner.kickScheduledCollection();await f.fire();
 const target=JSON.parse(f.row('SELECT target_json FROM api_public_cash_outbox WHERE id=1').target_json),get=f.bucket.get.bind(f.bucket);
 let release,entered;const wait=new Promise(r=>release=r),inside=new Promise(r=>entered=r);
 f.bucket.get=async key=>{if(key===target.projectionKey){entered();await wait;}return get(key);};
 const pending=f.fire();await inside;assert.equal((await f.owner.alarm()).status,'owner_alarm_busy');
 assert.ok(await f.alarm()>=f.now[0]+130000);release();assert.equal((await pending).status,'public_published');assert.equal(f.calls.length,0);
});
test('pointer already committed before SQL acknowledgement recovers idempotently from the saved outbox',async t=>{
 const f=await fixture(t);await f.complete();const before=f.objects.get(PUBLIC_POINTER),reads=f.reads.length;
 f.core.sql.exec("UPDATE api_public_cash_outbox SET state='ready',lease_until=NULL,retry_at=0,published_attempt=0 WHERE id=1");
 await f.restart();assert.equal((await f.fire()).status,'public_published');
 assert.deepEqual(f.objects.get(PUBLIC_POINTER),before);
 assert.ok(f.reads.slice(reads).every(k=>!k.includes('/receipts/')&&!k.includes('/cash-projections/')));assert.equal(f.calls.length,0);
});


test('public flag adoption recovers a completed retained private outbox without another provider event',async t=>{
 const f=await fixture(t,{publicFlag:{enabled:false}});f.seed(rawReceipt());
 await f.owner.kickScheduledCollection();await f.fire();
 assert.equal(f.row('SELECT pending FROM private_cash_outbox WHERE id=1').pending,0);
 assert.equal(f.publicPointer(),null);f.env.API_PUBLIC_CASH_JSON=JSON.stringify(PUBLIC_FLAG);
 await f.restart();assert.equal(f.row('SELECT state FROM api_public_cash_outbox WHERE id=1').state,'pending');
 assert.equal((await f.fire()).status,'public_published');assert.equal(f.calls.length,0);
 assert.equal(f.publicPointer().capturedAt,JSON.parse(rawReceipt().body).capturedAt);
});
