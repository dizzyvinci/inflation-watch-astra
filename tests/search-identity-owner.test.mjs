import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,noIO} from './fast-registration-fixture.mjs';
import {SearchIdentityOwner} from '../ops/api-search-identity-owner.mjs';
import {SEARCH_IDENTITY_POINTER,SEARCH_IDENTITY_PREFIX} from '../ops/api-search-identity-contract.mjs';
const waitSignal=promise=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('synthetic_entry_not_reached')),1000);})]).finally(()=>clearTimeout(timer));};
const epoch='identity-owner-test-v2',tick=()=>new Promise(r=>setImmediate(r)),defer=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};
async function setup(t,{waitMs=2500}={}){const f=await fixture(t,{fast:false}),deletes=[];f.bucket.delete=async key=>{deletes.push(key);f.objects.delete(key);};const seed=f.seed();f.registry.reconcile(8);assert.equal((await f.registry.drainOne(noIO)).status,'registry_capture_accepted');const make=(options={})=>new SearchIdentityOwner(f.owner.ctx,f.core,f.registry,{enabled:true,publicationEpoch:epoch,waitMs,...options});return{f,seed,deletes,make,owner:make()};}
async function advance(x,revision=1,max=100){const trace=[];for(let i=0;i<max;i++){const row=x.f.row("SELECT revision,pointer_raw FROM search_identity_generations WHERE role='current'");if(row?.revision>=revision)return{row,trace};const retry=x.f.row('SELECT retry_at FROM search_identity_control').retry_at;if(retry>x.f.now[0])x.f.now[0]=retry;trace.push(await x.owner.drainOne(noIO));await tick();}assert.fail(JSON.stringify(trace));}
async function accept(x,clock){const a=x.f.seed(x.f.prices(),clock);x.f.registry.reconcile(8);assert.equal((await x.f.registry.drainOne(noIO)).status,'registry_capture_accepted');return a;}
test('defaultOff construction touches no SQL/registry/bucket',()=>{const poison=new Proxy({},{get(){throw Error('Off touched optional dependency');}});const owner=new SearchIdentityOwner(poison,poison,poison);assert.equal(owner.active,false);assert.equal(owner.nextDue(),null);});
test('actual normal completed receipt publishes immutable complete identity pages without legacy item pointer',async t=>{const x=await setup(t),before=x.f.reads.length,{row}=await advance(x),pointer=JSON.parse(row.pointer_raw);assert.equal(pointer.publicationRevision,1);assert.equal(x.f.row("SELECT COUNT(*)n FROM search_identity_generations WHERE role='current'").n,1);const reads=x.f.reads.slice(before);assert(reads.every(k=>k===SEARCH_IDENTITY_POINTER||k.startsWith(SEARCH_IDENTITY_PREFIX)));assert.equal(x.f.provider.length,0);assert.equal(x.f.row('SELECT captured_at FROM api_index_inputs WHERE receipt_key=?',x.seed.receiptKey).captured_at,x.seed.e.capturedAt);assert.equal(x.f.row('SELECT captured_at FROM stamp_reference_captures WHERE receipt_key=?',x.seed.receiptKey).captured_at,x.seed.e.capturedAt);assert(x.owner.retainedBytes()<=33554432);});
test('recreate actual owner/context between EVERY publication callback still reaches committed',async t=>{const x=await setup(t);for(let i=0;i<40;i++){const current=x.f.row("SELECT revision FROM search_identity_generations WHERE role='current'");if(current){assert.equal(current.revision,1);assert.equal(x.f.provider.length,0);return;}await x.owner.drainOne(noIO);await x.f.restart();x.owner=x.make();}assert.fail('cold publication failed to progress');});
test('real immutable PUT success plus SQLite ACK ABORT recovers known object without second PUT',async t=>{const x=await setup(t);assert.equal((await x.owner.drainOne(noIO)).status,'search_identity_staged');x.f.exec("CREATE TRIGGER fail_identity_ready BEFORE UPDATE OF state ON search_identity_objects WHEN NEW.state='ready' BEGIN SELECT RAISE(ABORT,'synthetic_lost_ready_ack');END");assert.equal((await x.owner.drainOne(noIO)).status,'search_identity_review_or_retry');const key=x.f.puts.at(-1);assert(key.startsWith(SEARCH_IDENTITY_PREFIX));x.f.exec('DROP TRIGGER fail_identity_ready');await advance(x);assert.equal(x.f.puts.filter(k=>k===key).length,1);assert(x.f.reads.includes(key));});
test('real pointer PUT success plus phase SQL ACK ABORT safely recovers through exact readback',async t=>{const x=await setup(t);await x.owner.drainOne(noIO);for(let i=0;i<20&&x.f.row("SELECT phase FROM search_identity_generations WHERE role='active'").phase!=='pointer';i++)await x.owner.drainOne(noIO);assert.equal(x.f.row("SELECT phase FROM search_identity_generations WHERE role='active'").phase,'pointer');x.f.exec("CREATE TRIGGER fail_pointer_phase BEFORE UPDATE OF phase ON search_identity_generations WHEN NEW.phase='readback' BEGIN SELECT RAISE(ABORT,'synthetic_lost_pointer_ack');END");assert.equal((await x.owner.drainOne(noIO)).status,'search_identity_review_or_retry');assert(x.f.objects.has(SEARCH_IDENTITY_POINTER));x.f.exec('DROP TRIGGER fail_pointer_phase');await advance(x);assert.equal(x.f.row("SELECT phase FROM search_identity_generations WHERE role='current'").phase,'committed');});
test('held real PUT after logicaltimeout does not block ordinary B/C79+219; later C stages without new receipt',async t=>{
 const x=await setup(t);assert.equal((await x.owner.drainOne(noIO)).status,'search_identity_staged');
 const {identityStorageState}=await import('../ops/api-search-identity-storage.mjs');
 const held=defer(),entered=defer(),realSetTimeout=globalThis.setTimeout,realClearTimeout=globalThis.clearTimeout,mono=[performance.now()],timerToken={kind:'test_only_identity_20ms_timer'};
 let scheduled=null,deadline=null,once=false,heldKey=null,visibleSettled=false,cleared=false,restored=false,preparationWallMs=null;
 // Virtual monotonic time and ONLY this owner's20ms timer share one phase clock.
 // The original1000ms SDK-entry watchdog and the injected35ms prep use real time.
 const clockMock=t.mock.method(performance,'now',()=>mono[0]);
 const timerMock=t.mock.method(globalThis,'setTimeout',(callback,delay,...args)=>{if(delay===20){assert.equal(scheduled,null);scheduled={delay,fire:()=>callback(...args)};return timerToken;}return realSetTimeout(callback,delay,...args);});
 const clearMock=t.mock.method(globalThis,'clearTimeout',token=>{if(token===timerToken){cleared=true;return;}return realClearTimeout(token);});
 const restore=()=>{if(!restored){clearMock.mock.restore();timerMock.mock.restore();clockMock.mock.restore();restored=true;}};
 try{
  x.owner=x.make({waitMs:20});const publish=x.owner.publish;
  x.owner.publish=async function(c,...args){deadline=c.deadline;return Reflect.apply(publish,this,[c,...args]);};
  x.f.hook(async(kind,key)=>{if(kind==='put'&&key.startsWith(SEARCH_IDENTITY_PREFIX)&&!once){once=true;heldKey=key;entered.resolve();await held.promise;}});
  const beforePut=async()=>{const begin=process.hrtime.bigint();await new Promise(resolve=>realSetTimeout(resolve,35));preparationWallMs=Number(process.hrtime.bigint()-begin)/1e6;};
  const p=x.owner.drainOne(beforePut);p.then(()=>{visibleSettled=true;});
  await waitSignal(entered.promise);
  assert(preparationWallMs>20);assert.equal(deadline,mono[0]+20);assert.equal(scheduled.delay,20);assert.equal(visibleSettled,false);
  assert.equal(identityStorageState(x.f.bucket).physicalPending,1);assert.equal(x.f.objects.has(heldKey),false);
  mono[0]+=21;scheduled.fire();
  assert.equal((await p).status,'search_identity_action_pending');assert.equal(cleared,true);
  assert.equal((await x.owner.drainOne(noIO)).status,'search_identity_physical_wait');
  const b=await accept(x,'2026-11-06T12:01:00.000Z'),c=await accept(x,'2026-11-06T12:02:00.000Z');
  for(const source of[b,c]){
   assert.equal(x.f.row('SELECT captured_at FROM api_index_inputs WHERE receipt_key=?',source.receiptKey).captured_at,source.e.capturedAt);
   assert.equal(x.f.row('SELECT captured_at FROM stamp_reference_captures WHERE receipt_key=?',source.receiptKey).captured_at,source.e.capturedAt);
   assert.deepEqual({...x.f.row('SELECT state,lease_until FROM recurring_registry_jobs WHERE receipt_key=?',source.receiptKey)},{state:'complete',lease_until:null});
  }
  assert.equal(identityStorageState(x.f.bucket).physicalPending,1);assert.equal(x.f.objects.has(heldKey),false);assert.equal((await x.owner.drainOne(noIO)).status,'search_identity_physical_wait');
  held.resolve();for(let i=0;i<100;i++)await tick();
  assert.equal(identityStorageState(x.f.bucket).physicalPending,0);assert.equal(x.f.objects.has(heldKey),true);
  const heldHash=heldKey.slice(SEARCH_IDENTITY_PREFIX.length,-5);
  assert.equal(x.f.row('SELECT state FROM search_identity_objects WHERE sha=?',heldHash).state,'uncertain');
  assert.equal(x.f.row('SELECT last_result FROM search_identity_control').last_result,'review_or_retry');
  assert.equal(x.f.objects.has(SEARCH_IDENTITY_POINTER),false);
  x.f.hook(null);restore();x.owner=x.make();await advance(x,2);
  const row=x.f.row("SELECT original_json,manifest_raw FROM search_identity_generations WHERE role='current'");
  assert.equal(JSON.parse(row.original_json).sources[0].sourceAttempt,c.id);assert.equal(JSON.parse(row.manifest_raw).sources[0].capturedAt,c.e.capturedAt);
  assert.equal(x.f.reads.filter(k=>k===b.receiptKey).length,1);assert.equal(x.f.reads.filter(k=>k===c.receiptKey).length,1);
  assert.equal(x.f.puts.filter(k=>k===heldKey).length,1);assert(x.f.reads.includes(heldKey));assert.equal(x.f.provider.length,0);
  t.diagnostic(JSON.stringify({scope:'test_phase_control_only_not_production_capacity',ownerWaitMs:20,entryWatchdogMs:1000,injectedPreparationMs:35,actualPreparationOver20ms:preparationWallMs>20,virtualExpiryAdvanceMs:21,realSdkEntered:true,lateSdkWriteRetainedWithoutSqlAck:true,normalBandC79And219BeforeSettlement:true,latestCOriginalCapture:c.e.capturedAt,providerCalls:0}));
 }finally{held.resolve();for(let i=0;i<100;i++)await tick();x.f.hook(null);restore();}
});
test('snapshot A remains selected while B arrives during static prepare; pending B is not silently skipped',async t=>{const x=await setup(t),held=defer(),entered=defer(),art=x.owner.loadArt;let once=false;x.owner.loadArt=async()=>{if(!once){once=true;entered.resolve();await held.promise;}return art();};const staging=x.owner.drainOne(noIO);await waitSignal(entered.promise);const b=await accept(x,'2026-11-06T12:01:00.000Z');held.resolve();assert.equal((await staging).status,'search_identity_staged');await advance(x,2);const last=JSON.parse(x.f.row("SELECT original_json FROM search_identity_generations WHERE role='current'").original_json);assert.equal(last.sources[0].sourceAttempt,b.id);});
test('three retained generations hold next admission; nonewsource GC drains and latest membership publishes',async t=>{const x=await setup(t);await advance(x,1);await accept(x,'2026-11-06T12:01:00.000Z');await advance(x,2);await accept(x,'2026-11-06T12:02:00.000Z');await advance(x,3);const d=await accept(x,'2026-11-06T12:03:00.000Z');assert.equal((await x.owner.drainOne(noIO)).status,'search_identity_review_or_retry');assert.equal(x.f.row('SELECT COUNT(*)n FROM search_identity_generations').n,3);assert(x.owner.nextDue()>x.f.now[0]);x.f.now[0]+=120001;await advance(x,4);const current=JSON.parse(x.f.row("SELECT original_json FROM search_identity_generations WHERE role='current'").original_json);assert.equal(current.sources[0].sourceAttempt,d.id);assert(x.deletes.length>0);for(const key of x.deletes)assert(key.startsWith(SEARCH_IDENTITY_PREFIX));assert(x.f.objects.has(x.seed.receiptKey));assert.equal(x.f.provider.length,0);});
