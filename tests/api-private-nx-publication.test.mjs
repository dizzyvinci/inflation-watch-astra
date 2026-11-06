import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,receipt,row,summary,HOUR} from './api-private-nx-publication-fixture.mjs';
import {NX_POINTER,NX_PREFIX,MAX_HOURS,MAX_NX_BYTES,validateProjection,validateNxPointer,readPrivateNxProjection,byteHash,NxProjectionContractError,boundedText,parseStored} from '../ops/api-private-nx-projection.mjs';
import {PrivateNxPublisher,recordNxPublicationCommit} from '../ops/api-private-nx-publisher.mjs';
import {decodeNxReceipt} from '../ops/api-nx-offers.mjs';
import {PrivateNxOffersProducer} from '../ops/api-private-nx-offers.mjs';

test('default producer option/off publisher create no publication tables or R2 writes',t=>{
 const f=fixture(t,{publication:false});assert.equal(f.row("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'private_nx_r2_%'").n,0);
 new PrivateNxPublisher(f.ctx,f.bucket,{enabled:false});assert.equal(f.row("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'private_nx_r2_%'").n,0);assert.equal(f.reads.length,0);assert.equal(f.puts.length,0);
});
test('accepted commit and outbox are atomic; no raw/provider/attempt work in publisher',async t=>{
 const f=fixture(t),r=receipt();assert.equal((await f.accept(r)).status,'private_offer_committed');assert.equal(f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation,1);
 assert.equal(f.row("SELECT COUNT(*) AS n FROM private_nx_captures WHERE state='complete'").n,1);assert.equal(f.row('SELECT COUNT(*) AS n FROM private_nx_r2_capture_context').n,1);const rawReads=f.reads.length;
 f.events.length=0;assert.equal((await f.publish()).status,'private_projection_published');assert.equal(f.events[0],'arm');assert(f.recovery>f.now[0]);assert(f.reads.slice(rawReads).every(key=>!key.includes('/receipts/')));
 const pointer=f.pointer(),bodyAt=f.puts.indexOf(pointer.objectKey),pointerAt=f.puts.indexOf(NX_POINTER);assert(bodyAt>=0&&pointerAt>bodyAt);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,1);assert.equal(f.row('SELECT round_ref FROM api_attempts').round_ref,'synthetic-r1');
 const {projection}=await f.read();assert.equal(projection.sourceObservedAt,null);assert.equal(projection.qualifiedIndividualTrades,0);assert.equal(projection.publicationEligible,false);assert.equal(projection.captures[0].requestStartedAt,r.envelope.requestStartedAt);assert.equal(projection.captures[0].rawResponseBytes,r.envelope.responseBytes);assert.equal(projection.captures[0].capturedAt,r.envelope.capturedAt);
});
test('SQL handoff failure rolls back acceptance/rows/context and retry uses only retained raw',async t=>{
 const f=fixture(t);f.failSql(q=>q.startsWith('UPDATE private_nx_r2_outbox SET target_generation'));
 const result=await f.accept();assert.equal(result.status,'private_storage_retry');assert.equal(f.row("SELECT COUNT(*) AS n FROM private_nx_captures WHERE state='complete'").n,0);assert.equal(f.row('SELECT COUNT(*) AS n FROM private_nx_latest').n,0);assert.equal(f.row('SELECT COUNT(*) AS n FROM private_nx_r2_capture_context').n,0);assert.equal(f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation,0);
 f.failSql(null);f.now[0]=result.retryAt;assert.equal((await f.producer.drainOne(async()=>{})).status,'private_offer_committed');assert.equal(f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation,1);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,1);
});
test('native8h and derived24hour evidence stay distinct; consumer hash/schema checks and independent bodies',async t=>{
 const f=fixture(t);await f.accept(receipt('nx-rate',1,summary()));const rows=[];for(let i=0;i<25;i++){rows.push(row('sell',HOUR-i*3600,20,3));if(i!==3)rows.push(row('buy',HOUR-i*3600,15,2));}await f.accept(receipt('nx-history',2,rows,'2026-11-05T22:54:51.939Z'));await f.publish();
 const a=await f.read(),b=await f.read();assert.equal(a.projection.nativeSummary.summary.reportedWindowHours,8);assert.equal(a.projection.derived24.sides.sell.availableHourBuckets,24);assert.equal(a.projection.derived24.sides.sell.posterHourObservations,72);assert.equal(a.projection.derived24.sides.buy.availableHourBuckets,23);assert.equal(a.projection.derived24.sides.buy.missingHourBuckets,1);assert.equal(a.projection.derived24.sides.buy.posterHourObservations,46);
 assert.equal(a.pointer.objectSha256,await byteHash(a.text));a.projection.hourlyHistory.rows[0].median=999;assert.notEqual(b.projection.hourlyHistory.rows[0].median,999);assert.equal((await f.read()).text,b.text);
 const bad=structuredClone(b.pointer);bad.objectKey='_private/other.json';assert.throws(()=>validateNxPointer(bad));const changed=structuredClone(b.projection);changed.owner_name='SYNTHETIC_ACTOR';await assert.rejects(validateProjection(changed));
});
test('unchanged polling does not duplicate hourly identities or changed revisions; older revisions never replace latest',async t=>{
 const f=fixture(t);await f.accept(receipt());await f.publish();const original=f.pointer().receiptWatermarkAt;
 await f.accept(receipt('nx-history',2,[row('buy'),row('sell',HOUR,20)],'2026-11-05T22:54:51.939Z'));await f.publish();let {projection}=await f.read();assert.equal(projection.hourlyHistory.rows.length,2);assert(projection.hourlyHistory.rows.every(r=>r.changedRevisionCount===1));assert.equal(f.row('SELECT COUNT(*) AS n FROM private_nx_captures').n,2);
 await f.accept(receipt('nx-history',3,[row('buy',HOUR,18),row('sell',HOUR,20)],'2026-11-05T22:55:51.939Z'));await f.publish();const latest=f.pointer().receiptWatermarkAt;
 await f.accept(receipt('nx-history',4,[row('buy',HOUR,11),row('sell',HOUR,20)],'2026-11-05T22:53:52.939Z'));await f.publish();projection=(await f.read()).projection;assert.equal(projection.hourlyHistory.rows.find(r=>r.side==='buy').median,18);assert.equal(projection.hourlyHistory.rows.length,2);assert.equal(projection.receiptWatermarkAt,latest);assert(latest>original);
 const target=f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation;f.producer.reconcile();assert.equal((await f.producer.drainOne(async()=>{})).status,'idle');assert.equal(f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation,target);
});
test('body write failure persists staged bytes and restart publishes without rebuilding/source reads',async t=>{
 const f=fixture(t);await f.accept();f.fail('body');assert.equal((await f.publish()).status,'private_projection_storage_retry');const saved=f.row('SELECT body,pointer_json,retry_at FROM private_nx_r2_outbox WHERE id=1');assert(saved.body&&saved.pointer_json);assert.equal(f.pointer(),null);
 f.fail(null);f.restart();f.now[0]=saved.retry_at;f.failSql(q=>q.includes('SELECT l.*'));assert.equal((await f.publish()).status,'private_projection_published');f.failSql(null);assert.equal((await f.read()).text,saved.body);
});
test('pointer failure leaves immutable object and repairable outbox; acknowledgement after commit is idempotent',async t=>{
 const f=fixture(t);await f.accept();f.fail('pointer');const r=await f.publish();assert.equal(r.status,'private_projection_storage_retry');const saved=f.row('SELECT body,pointer_json FROM private_nx_r2_outbox WHERE id=1');assert(f.objects.has(JSON.parse(saved.pointer_json).objectKey));f.fail(null);f.restart();f.now[0]=r.retryAt;assert.equal((await f.publish()).status,'private_projection_published');
 const pointerBytes=f.objects.get(NX_POINTER).body;f.sql.exec("UPDATE private_nx_r2_outbox SET state='ready',lease_until=NULL,retry_at=0,published_generation=0 WHERE id=1");f.restart();assert.equal((await f.publish()).status,'private_projection_published');assert.equal(f.objects.get(NX_POINTER).body,pointerBytes);assert.equal(f.objects.get(JSON.parse(pointerBytes).objectKey).body,saved.body);
});
test('corrupt current SQL quarantines publication and retains last-good; next valid accepted commit can recover',async t=>{
 const f=fixture(t);await f.accept();await f.publish();const before=f.objects.get(NX_POINTER).body;
 await f.accept(receipt('nx-history',2,[row('buy',HOUR,16),row('sell',HOUR,20)],'2026-11-05T22:54:51.939Z'));
 const raw=f.row("SELECT body FROM private_nx_latest WHERE side='buy'").body,bad={...JSON.parse(raw),owner_name:'SYNTHETIC_ACTOR'};f.sql.exec("UPDATE private_nx_latest SET body=? WHERE side='buy'",JSON.stringify(bad));assert.equal((await f.publish()).status,'private_projection_quarantined');assert.equal(f.objects.get(NX_POINTER).body,before);
 await f.accept(receipt('nx-history',3,[row('buy',HOUR,17),row('sell',HOUR,20)],'2026-11-05T22:55:51.939Z'));assert.equal((await f.publish()).status,'private_projection_published');assert.equal((await f.read()).projection.hourlyHistory.rows.find(r=>r.side==='buy').median,17);
});
test('disable during I/O cannot advance pointer; re-enable retains exact clocks and saved object',async t=>{
 const f=fixture(t);await f.accept();let enter,release;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);
 f.onGet(async key=>{if(key.startsWith(NX_PREFIX)){enter();await wait;}});const running=f.publish();await entered;f.enabled[0]=false;release();assert.equal((await running).status,'private_publication_disabled');assert.equal(f.pointer(),null);assert(!f.puts.some(key=>key===NX_POINTER));f.onGet(null);f.enabled[0]=true;f.restart();assert.equal((await f.publish()).status,'private_projection_published');assert.equal(f.pointer().receiptWatermarkAt,'2026-11-05T22:53:51.939Z');
});
test('a new accepted generation fences an older publisher; pointer CAS cannot roll back a newer generation',async t=>{
 const f=fixture(t);await f.accept();let enter,release;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);let held=true;
 f.onGet(async key=>{if(held&&key.startsWith(NX_PREFIX)){held=false;enter();await wait;}});const older=f.publish();await entered;
 await f.accept(receipt('nx-history',2,[row('buy',HOUR,18),row('sell',HOUR,20)],'2026-11-05T22:54:51.939Z'));const other=new PrivateNxPublisher(f.ctx,f.bucket,{enabled:true,now:()=>f.now[0]});assert.equal((await other.drainOne(async()=>{})).status,'private_projection_published');const newer=f.objects.get(NX_POINTER).body;release();assert.equal((await older).status,'private_projection_stale_claim');assert.equal(f.objects.get(NX_POINTER).body,newer);assert.equal((await f.read()).projection.hourlyHistory.rows.find(r=>r.side==='buy').median,18);
});
test('overlap/expired lease restart fences the old claim; beforeIO recovery failure makes no R2 call',async t=>{
 const f=fixture(t);await f.accept();const reads=f.reads.length;assert.equal((await f.publisher.drainOne(async()=>{throw Error('Synthetic deadline failure');})).status,'private_projection_storage_retry');assert.equal(f.reads.length,reads);f.now[0]=f.row('SELECT retry_at FROM private_nx_r2_outbox WHERE id=1').retry_at;
 let enter,release;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);let held=true;f.onGet(async key=>{if(held&&key.startsWith(NX_PREFIX)){held=false;enter();await wait;}});const first=f.publish();await entered;
 const second=new PrivateNxPublisher(f.ctx,f.bucket,{enabled:true,now:()=>f.now[0]});assert.equal((await second.drainOne(async()=>{})).status,'private_publication_leased');f.now[0]+=120001;assert.equal((await second.drainOne(async()=>{})).status,'private_projection_published');const before=f.objects.get(NX_POINTER).body;release();assert.equal((await first).status,'private_projection_stale_claim');assert.equal(f.objects.get(NX_POINTER).body,before);
});
test('bounded projection selects744source labels while retaining older SQLite/archive rows',async t=>{
 const f=fixture(t),rows=[];for(let i=0;i<750;i++){rows.push(row('buy',HOUR-i*3600,15));rows.push(row('sell',HOUR-i*3600,20));}await f.accept(receipt('nx-history',1,rows));assert.equal((await f.publish()).status,'private_projection_published');const h=(await f.read()).projection.hourlyHistory;
 assert.equal(h.maxSelectedHours,MAX_HOURS);assert.equal(h.rows.length,1488);assert.equal(h.totalRetainedSourceHourSideRows,1500);assert.equal(h.omittedRetainedSourceHourSideRows,12);assert.equal(f.row('SELECT COUNT(*) AS n FROM private_nx_latest').n,1500);assert(f.objects.has(receipt('nx-history',1,rows).key));
});
test('legacy completed SQL can stage without provider/raw reread; unknown request metadata stays null',async t=>{
 const f=fixture(t,{publication:false});await f.accept();const rawReads=f.reads.length;const publisher=new PrivateNxPublisher(f.ctx,f.bucket,{enabled:true,now:()=>f.now[0]});assert.equal(publisher.reconcileStored().status,'legacy_private_projection_staged');assert.equal((await publisher.drainOne(async()=>{})).status,'private_projection_published');assert.equal(f.reads.slice(rawReads).some(key=>key.includes('/receipts/')),false);
 const {projection}=await readPrivateNxProjection(f.bucket);assert(projection.captures.every(c=>c.metadataCompleteness==='legacy_missing_request_metadata'&&c.requestStartedAt===null&&c.rawResponseBytes===null));assert.equal(projection.receiptWatermarkAt,'2026-11-05T22:53:51.939Z');assert.equal(publisher.reconcileStored().status,'private_publication_target_exists');
});
test('duplicate handoff is idempotent; changed context for the same accepted attempt is rejected atomically',async t=>{
 const f=fixture(t),r=receipt();await f.accept(r);const p=await decodeNxReceipt(r.envelope),generation=f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation;
 assert.equal(f.ctx.storage.transactionSync(()=>recordNxPublicationCommit(f.ctx,p,r.key)).status,'unchanged_capture_handoff');assert.equal(f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation,generation);
 assert.throws(()=>f.ctx.storage.transactionSync(()=>recordNxPublicationCommit(f.ctx,{...p,requestStartedAt:'2026-11-05T19:00:00.000Z'},r.key)),/context_conflict/);assert.equal(f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation,generation);assert.equal(f.row('SELECT COUNT(*) AS n FROM private_nx_r2_capture_context').n,1);
});
test('pointer CAS contention is bounded and remote higher generation cannot be overwritten',async t=>{
 const f=fixture(t);await f.accept();f.contentions(3);const result=await f.publish();assert.equal(result.status,'private_projection_storage_retry');assert.equal(f.puts.filter(key=>key===NX_POINTER).length,3);assert.equal(f.pointer(),null);
 f.now[0]=result.retryAt;assert.equal((await f.publish()).status,'private_projection_published');const ahead={...f.pointer(),generation:99};f.set(NX_POINTER,JSON.stringify(ahead));const before=f.objects.get(NX_POINTER).body;
 await f.accept(receipt('nx-history',2,[row('buy',HOUR,16),row('sell',HOUR,20)],'2026-11-05T22:54:51.939Z'));assert.equal((await f.publish()).status,'private_projection_superseded');assert.equal(f.objects.get(NX_POINTER).body,before);assert.equal(f.publisher.health().publishedGeneration,99);
});
test('corrupt immutable object, saved DTO or regressed remote receipt clock quarantines without replacing last-good',async t=>{
 for(const kind of ['immutable','saved','watermark']){
  const f=fixture(t);await f.accept();await f.publish();const before=f.objects.get(NX_POINTER).body;
  await f.accept(receipt('nx-history',2,[row('buy',HOUR,16),row('sell',HOUR,20)],'2026-11-05T22:54:51.939Z'));f.fail('body');assert.equal((await f.publish()).status,'private_projection_storage_retry');f.fail(null);f.now[0]=f.row('SELECT retry_at FROM private_nx_r2_outbox WHERE id=1').retry_at;
  const saved=f.row('SELECT body,pointer_json FROM private_nx_r2_outbox WHERE id=1'),p=JSON.parse(saved.pointer_json);
  if(kind==='immutable')f.set(p.objectKey,'{"corrupted":true}');
  else if(kind==='saved'){const bad={...JSON.parse(saved.body),player_name:'SYNTHETIC_ACTOR'},body=JSON.stringify(bad),sha=await byteHash(body);p.objectKey=NX_PREFIX+sha+'.json';p.objectSha256=sha;p.objectBytes=Buffer.byteLength(body);f.sql.exec('UPDATE private_nx_r2_outbox SET body=?,pointer_json=? WHERE id=1',body,JSON.stringify(p));}
  else f.set(NX_POINTER,JSON.stringify({...f.pointer(),receiptWatermarkAt:'2030-01-01T00:00:00.000Z'}));
  const expected=f.objects.get(NX_POINTER).body;assert.equal((await f.publish()).status,'private_projection_quarantined');assert.equal(f.objects.get(NX_POINTER).body,expected);if(kind!=='watermark')assert.equal(expected,before);
 }
});
test('private consumer rejects unsafe descriptor keys, size/hash/unknown-field corruption without arbitrary reads',async t=>{
 const f=fixture(t);await f.accept();await f.publish();const pointer=f.pointer(),original=f.objects.get(NX_POINTER).body;f.set(NX_POINTER,JSON.stringify({...pointer,objectKey:'_private/arbitrary.json'}));const reads=f.reads.length;await assert.rejects(f.read());assert.deepEqual(f.reads.slice(reads),[NX_POINTER]);f.set(NX_POINTER,original);
 const get=f.bucket.get;let touched=false;f.bucket.get=async key=>key===pointer.objectKey?{size:MAX_NX_BYTES+1,text:async()=>{touched=true;return'';}}:get(key);await assert.rejects(f.read(),/object_bound/);assert.equal(touched,false);f.bucket.get=get;
 f.set(pointer.objectKey,'{}');await assert.rejects(f.read(),/byte_integrity/);
});
test('same-generation pointer acknowledgement is independent of JSON property order',async t=>{
 const f=fixture(t);await f.accept();await f.publish();const pointer=f.pointer();f.set(NX_POINTER,JSON.stringify(Object.fromEntries(Object.entries(pointer).reverse())));const before=f.objects.get(NX_POINTER).body;f.sql.exec("UPDATE private_nx_r2_outbox SET state='ready',lease_until=NULL,retry_at=0 WHERE id=1");f.restart();assert.equal((await f.publish()).status,'private_projection_published');assert.equal(f.objects.get(NX_POINTER).body,before);
});
test('R2 pointer CAS fences an older in-flight write after the newer target has already published',async t=>{
 const f=fixture(t);await f.accept();let enter,release,held=true;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);
 f.onPut(async key=>{if(held&&key===NX_POINTER){held=false;enter();await wait;}});const first=f.publish();await entered;
 await f.accept(receipt('nx-history',2,[row('buy',HOUR,18),row('sell',HOUR,20)],'2026-11-05T22:54:51.939Z'));const second=new PrivateNxPublisher(f.ctx,f.bucket,{enabled:true,now:()=>f.now[0]});assert.equal((await second.drainOne(async()=>{})).status,'private_projection_published');const before=f.objects.get(NX_POINTER).body;
 release();assert.equal((await first).status,'private_projection_stale_claim');assert.equal(f.objects.get(NX_POINTER).body,before);assert.equal(f.pointer().generation,2);
});
test('SQL byte-budget guard rejects oversized projection before loading unbounded bodies or advancing pointer',async t=>{
 const f=fixture(t);await f.accept();await f.publish();const before=f.objects.get(NX_POINTER).body;
 await f.accept(receipt('nx-history',2,[row('buy',HOUR,16),row('sell',HOUR,20)],'2026-11-05T22:54:51.939Z'));
 f.sql.exec("UPDATE private_nx_latest SET body=? WHERE side='buy'",' '.repeat(MAX_NX_BYTES+1));const puts=f.puts.length;assert.equal((await f.publish()).status,'private_projection_quarantined');assert.equal(f.puts.length,puts);assert.equal(f.objects.get(NX_POINTER).body,before);
});


test('R2 get/put/text/stream TypeError failures retry durably with identical staged bytes and original clocks',async t=>{
 for(const phase of ['get-object','get-pointer','put-object','put-pointer','text-object','text-pointer','stream-object','stream-pointer']){
  const f=fixture(t);await f.accept();await f.publish();const originalPointer=f.objects.get(NX_POINTER).body;
  const r=receipt('nx-history',2,[row('buy',HOUR,17),row('sell',HOUR,20)],'2026-11-05T22:54:51.939Z');await f.accept(r);
  // Pre-stage exact bytes once, so retry tests can reject any accidental source rebuild.
  f.fail('body');assert.equal((await f.publish()).status,'private_projection_storage_retry');f.fail(null);
  const staged=f.row('SELECT body,pointer_json,retry_at FROM private_nx_r2_outbox WHERE id=1'),p=JSON.parse(staged.pointer_json);
  f.now[0]=staged.retry_at;
  const wantsPointer=phase.endsWith('-pointer'),key=wantsPointer?NX_POINTER:p.objectKey;
  if(phase.startsWith('text')||phase.startsWith('stream'))f.set(p.objectKey,staged.body);
  const get=f.bucket.get,put=f.bucket.put;let attempted=0,cancelled=0;
  f.bucket.get=async k=>{
   if(k===key&&phase.startsWith('get')){attempted++;throw new TypeError('synthetic_sdk_get_transport');}
   const object=await get(k);
   if(k!==key||!object)return object;
   if(phase.startsWith('text'))return{...object,text:async()=>{attempted++;throw new TypeError('synthetic_sdk_text_transport');}};
   if(phase.startsWith('stream'))return{...object,body:{getReader:()=>({read:async()=>{attempted++;throw new TypeError('synthetic_stream_transport');},cancel:async()=>{cancelled++;},releaseLock(){}})}};
   return object;
  };
  f.bucket.put=async(k,...args)=>{if(k===key&&phase.startsWith('put')){attempted++;throw new TypeError('synthetic_sdk_put_transport');}return put(k,...args);};
  f.failSql(q=>q.includes('SELECT l.*'));
  const failed=await f.publish();assert.equal(failed.status,'private_projection_storage_retry',phase);assert.equal(attempted,1,phase);
  if(phase.startsWith('stream'))assert.equal(cancelled,1);
  const retained=f.row('SELECT * FROM private_nx_r2_outbox WHERE id=1');assert.equal(retained.state,'ready');assert.equal(retained.last_result,'storage_retry');assert(retained.retry_at>f.now[0]);assert.equal(retained.body,staged.body);assert.equal(retained.pointer_json,staged.pointer_json);
  assert.equal(f.objects.get(NX_POINTER).body,originalPointer);assert.equal(JSON.parse(retained.body).receiptWatermarkAt,r.envelope.capturedAt);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,1);
  f.bucket.get=get;f.bucket.put=put;f.restart();f.now[0]=retained.retry_at;
  assert.equal((await f.publish()).status,'private_projection_published',phase);f.failSql(null);
  const read=await f.read();assert.equal(read.text,staged.body);assert.equal(read.pointer.receiptWatermarkAt,r.envelope.capturedAt);assert.equal(read.projection.captures.at(-1).capturedAt,r.envelope.capturedAt);
 }
});

test('explicit byte/UTF8/JSON contract failures stay typed and quarantine rather than retrying transport',async t=>{
 assert.throws(()=>parseStored('{"a":1,"a":2}'),NxProjectionContractError);
 for(const kind of ['advertised-bound','stream-bound','stream-size','utf8','stream-chunk','json']){
  const f=fixture(t);await f.accept();await f.publish();const old=f.objects.get(NX_POINTER).body;
  await f.accept(receipt('nx-history',2,[row('buy',HOUR,17),row('sell',HOUR,20)],'2026-11-05T22:54:51.939Z'));
  f.fail('body');await f.publish();f.fail(null);const staged=f.row('SELECT body,pointer_json,retry_at FROM private_nx_r2_outbox WHERE id=1'),p=JSON.parse(staged.pointer_json);f.now[0]=staged.retry_at;
  const get=f.bucket.get;
  f.bucket.get=async key=>{
   if(key!==p.objectKey)return get(key);
   if(kind==='advertised-bound')return{size:MAX_NX_BYTES+1,text:async()=>{throw Error('must_not_read');}};
   if(kind==='json')return{size:1,text:async()=>'{'};
   const bytes=kind==='utf8'?new Uint8Array([255]):kind==='stream-chunk'?'not_bytes':kind==='stream-bound'?new Uint8Array(MAX_NX_BYTES+1):new Uint8Array([65]);let sent=false;
   return{size:kind==='stream-size'?2:kind==='stream-bound'?1:kind==='stream-chunk'?9:1,body:{getReader:()=>({async read(){if(sent)return{done:true};sent=true;return{done:false,value:bytes};},async cancel(){},releaseLock(){}})}};
  };
  const result=await f.publish();assert.equal(result.status,'private_projection_quarantined',kind);const state=f.row('SELECT state,last_result FROM private_nx_r2_outbox WHERE id=1');assert.equal(state.state,'quarantined');assert.equal(state.last_result,'projection_contract_quarantine');assert.equal(f.objects.get(NX_POINTER).body,old);
 }
 const invalidUtf8={size:1,body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array([255]));controller.close();}})};
 await assert.rejects(boundedText(invalidUtf8),NxProjectionContractError);
});


test('off-window accepted retained SQL reconciles on reenable after authstop without raw reread or new provider attempts',async t=>{
 const f=fixture(t);await f.accept();await f.publish();const before=f.pointer();
 const off=new PrivateNxOffersProducer(f.ctx,f.bucket,{enabled:true,privatePublicationEnabled:false,now:()=>f.now[0]});
 const r=receipt('nx-history',2,[row('buy',HOUR,18),row('sell',HOUR,22)],'2026-11-05T23:03:51.939Z');f.seed(r);off.reconcile();assert.equal((await off.drainOne(async()=>{})).status,'private_offer_committed');
 // Simulate globally paused provider after its already-authorized receipts exist.
 f.sql.exec('CREATE TABLE test_provider_control(auth_stopped INTEGER)');f.sql.exec('INSERT INTO test_provider_control VALUES(1)');
 const reads=f.reads.length;assert.equal(f.publisher.reconcileStored().status,'retained_private_projection_staged');assert.notEqual(f.publisher.nextDue(),null);assert.deepEqual(f.pointer(),before);assert.equal(f.reads.length,reads);
 const generation=f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation;
 for(let n=0;n<3;n++)assert.equal(f.publisher.reconcileStored().status,'private_publication_target_exists');assert.equal(f.row('SELECT target_generation FROM private_nx_r2_outbox WHERE id=1').target_generation,generation);
 assert.equal((await f.publish()).status,'private_projection_published');const read=await f.read();assert.equal(read.projection.hourlyHistory.rows.find(r=>r.side==='buy').median,18);assert.equal(read.pointer.receiptWatermarkAt,r.envelope.capturedAt);assert.equal(read.projection.captures.find(c=>c.attemptId===2).requestStartedAt,null);assert.equal(f.reads.slice(reads).some(k=>k.includes('/receipts/')),false);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,1);assert.equal(f.row('SELECT auth_stopped FROM test_provider_control').auth_stopped,1);
 const bytes=f.objects.get(NX_POINTER).body;for(let n=0;n<3;n++)f.publisher.reconcileStored();assert.equal(f.publisher.nextDue(),null);assert.equal(f.objects.get(NX_POINTER).body,bytes);
});

test('retained summary/history are reconciled independently even when the summary clock precedes newer history',async t=>{
 const f=fixture(t);await f.accept(receipt('nx-rate',1,summary()));await f.accept(receipt('nx-history',2,[row('buy'),row('sell',HOUR,20)],'2026-11-05T23:30:51.939Z'));await f.publish();
 const off=new PrivateNxOffersProducer(f.ctx,f.bucket,{enabled:true,privatePublicationEnabled:false,now:()=>f.now[0]}),s=summary();s.buy.median=16;s.buy.mode=16;s.buy.low=16;s.buy.high=16;s.buy.steps=[[16,2]];
 f.seed(receipt('nx-rate',3,s,'2026-11-05T23:10:51.939Z'));off.reconcile();await off.drainOne(async()=>{});assert.equal(f.publisher.reconcileStored().status,'retained_private_projection_staged');await f.publish();const read=await f.read();assert.equal(read.projection.nativeSummary.summary.buy.median,16);assert.equal(read.pointer.receiptWatermarkAt,'2026-11-05T23:30:51.939Z');assert.equal(f.publisher.reconcileStored().status,'private_publication_target_exists');
});

test('retained older receipt adding a source hour is noticed without reverting newer row/capture clocks',async t=>{
 const f=fixture(t);await f.accept(receipt('nx-history',1,[row('buy'),row('sell',HOUR,20)],'2026-11-05T23:30:51.939Z'));await f.publish();const old=f.pointer();
 const off=new PrivateNxOffersProducer(f.ctx,f.bucket,{enabled:true,privatePublicationEnabled:false,now:()=>f.now[0]});f.seed(receipt('nx-history',2,[row('buy',HOUR-3600,14)],'2026-11-05T23:10:51.939Z'));off.reconcile();await off.drainOne(async()=>{});
 assert.equal(f.publisher.reconcileStored().status,'retained_private_projection_staged');await f.publish();const read=await f.read();assert.equal(read.projection.hourlyHistory.rows.length,3);assert.equal(read.projection.hourlyHistory.rows.find(r=>r.sourceEpochSeconds===HOUR&&r.side==='buy').median,15);assert.equal(read.pointer.receiptWatermarkAt,old.receiptWatermarkAt);assert.equal(f.publisher.reconcileStored().status,'private_publication_target_exists');
});

test('unchanged retained reconciliation preserves pending staged bytes, retry deadline, leases and fencing claims',async t=>{
 const f=fixture(t);await f.accept();f.fail('pointer');await f.publish();const staged=f.row('SELECT * FROM private_nx_r2_outbox WHERE id=1');
 for(let n=0;n<5;n++){assert.equal(f.publisher.reconcileStored().status,'private_publication_target_exists');assert.deepEqual(f.row('SELECT * FROM private_nx_r2_outbox WHERE id=1'),staged);}
 // New off-window accepted source fences an old persisted claim without mutating last-good.
 const off=new PrivateNxOffersProducer(f.ctx,f.bucket,{enabled:true,privatePublicationEnabled:false,now:()=>f.now[0]});f.seed(receipt('nx-history',2,[row('buy',HOUR,19),row('sell',HOUR,22)],'2026-11-05T23:03:51.939Z'));off.reconcile();await off.drainOne(async()=>{});f.publisher.reconcileStored();const changed=f.row('SELECT * FROM private_nx_r2_outbox WHERE id=1');assert.equal(changed.target_generation,staged.target_generation+1);assert.equal(changed.body,null);assert.equal(changed.state,'pending');assert.equal(f.publisher.owns(staged,staged.claim),false);f.fail(null);await f.publish();assert.equal((await f.read()).projection.hourlyHistory.rows.find(r=>r.side==='buy').median,19);
});
