import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {produced} from './basic-read-selected-fixture.mjs';
import {createBasicSelectedCacheReader} from '../ops/api-basic-current-cache-reader.mjs';
import {BASIC_PUBLIC_DEFINITION_SHA,BASIC_PRIVATE_CONTRACT_SHA} from '../ops/api-basic-current-public-contract.mjs';
const enc=new TextEncoder(),encode=v=>enc.encode(JSON.stringify(v)),sha=b=>createHash('sha256').update(b).digest('hex'),PK='_private/provider-api/v1/basic-current/v1/current.json',tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};
function pins(f,owner){const r=f.row("SELECT * FROM basic_generations WHERE role='current'");assert(r);const source=JSON.parse(r.source_json),j=f.row('SELECT state,attempt_id,lease_until FROM api_jobs WHERE job_key=?',source.jobKey),a=f.row('SELECT result FROM api_attempts WHERE id=?',source.attempt);f.registry.owned({receipt_key:source.receiptKey,job_key:source.jobKey,source_attempt:source.attempt,raw_sha:source.rawSha,request_at:Date.parse(source.requestAt),operation:'prices'});
 const e={schemaVersion:1,kind:'root_recorded_basic_private_graph_expected_v1',profile:'basic_aggregate_v1',privateContractSha256:BASIC_PRIVATE_CONTRACT_SHA,definitionHash:BASIC_PUBLIC_DEFINITION_SHA,generation:r.gid,pointerSha256:sha(enc.encode(r.pointer_raw)),manifestSha256:r.manifest_sha,manifestBytes:enc.encode(r.manifest_raw).length,bodySha256:r.body_sha,source,scope:JSON.parse(owner.control().scope_json),sourceJobState:j.state,sourceAttemptResult:a.result,sourceLiveAttemptId:j.attempt_id,sourceLeaseCleared:j.lease_until===null,basicGenerationRole:r.role,basicGenerationPhase:r.phase};
 const expectedRaw=encode(e);return{status:'ready',expectedRaw,expectedOriginalSha256:sha(expectedRaw),newerBasicObservedIntentPresent:false};}
async function setup(t,{extraItems=1239,waitMs=5000,maxWaiters=64}={}){const g=await produced(t,{extraItems});let record=pins(g.f,g.owner),hook=null;const starts=[],time={v:0},mono=()=>time.v;
 const bucket={get:async key=>{starts.push(key);return hook?hook(key):g.f.bucket.get(key);}};const provider=()=>record;
 const options={enabled:true,bucket,scope:g.e.scope,committedPinsProvider:provider,monotonic:mono,waitMs,maxWaiters};const reader=createBasicSelectedCacheReader(options);
 return{...g,record,starts,bucket,time,mono,options,reader,setRecord:v=>record=v,setHook:v=>hook=v,getRecord:()=>record};}
async function settled(reader){for(let i=0;i<100&&reader.state().physicalPending;i++)await tick();assert.equal(reader.state().physicalPending,0);}
async function generation(g,body,at){const a=g.f.seed(body,at);g.f.registry.reconcile(8);assert.equal((await g.f.registry.drainOne(async()=>{})).status,'registry_capture_accepted');for(let i=0;i<200&&!g.f.row("SELECT source_json FROM basic_generations WHERE role='current'")?.source_json.includes(a.receiptKey);i++){await g.owner.drainOne(async()=>{});g.f.now[0]=Math.max(g.f.now[0]+1,g.owner.nextDue()??0);}const p=pins(g.f,g.owner);assert(JSON.parse(new TextDecoder().decode(p.expectedRaw)).source.receiptKey===a.receiptKey);return p;}

test('defaultOff reads no other option getters, timers, bucket or pins; invalid IDs/signals make no SDK starts',async t=>{
 const off=createBasicSelectedCacheReader({enabled:false,get bucket(){throw Error('offbucket');},get scope(){throw Error('offscope');},get committedPinsProvider(){throw Error('offpins');}});assert.equal((await off.read(1)).status,'disabled');assert.equal(off.state().physicalPending,0);
 const g=await setup(t,{extraItems:0});for(const id of [0,-1,1.5,1000000000,NaN,'2040801'])assert.equal((await g.reader.read(id)).status,'invalid_item_id');assert.equal((await g.reader.read(2040801,{signal:{aborted:false}})).status,'cancelled');assert.equal(g.starts.length,0);
});

test('genuine1537 producer→independentSQLpins beforeGET→selectedtypedDTO; shared samepage cache is0SDK and no producer token',async t=>{
 const g=await setup(t),before=g.f.row('SELECT COUNT(*)n FROM api_attempts').n,a=await g.reader.read(2040801);assert.equal(a.status,'validated');assert.equal(a.reference.sold.medianUnitPrice,'34567.89');assert.equal(a.reference.sold.averageUnitPrice,'999999');assert.equal(a.reference.asking.medianUnitPrice,'25000.04999999999999999');assert.equal(a.reference.capturedAt,g.a.e.capturedAt);assert.equal(a.reference.upstreamLatestInspected,false);assert.equal(a.bodyHashVerification,'producer_sql_attested_not_recomputed');assert.equal(g.starts.length,3);assert(g.starts.every(k=>k===PK||k.startsWith('_private/provider-api/v1/basic-current/v1/objects/')));
 const b=createBasicSelectedCacheReader(g.options),same=await b.read(2040801);assert.equal(same.status,'validated');assert.equal(g.starts.length,3);same.raw.fill(0);assert.equal((await b.read(2040801)).reference.sold.medianUnitPrice,'34567.89');assert.equal(g.owner.control().action_token,null);assert.equal(g.f.row('SELECT COUNT(*)n FROM api_attempts').n,before);assert.equal(g.f.provider.length,0);
});

test('one held SDK flight/sameID bounded waiters; timeout and new factories/Off/newscopecannot release physical reservation',async t=>{
 const g=await setup(t,{extraItems:0,waitMs:1000,maxWaiters:2}),held=deferred(),hit=deferred();g.setHook(async key=>{hit.resolve();await held.promise;return g.f.bucket.get(key);});const a=g.reader.read(2040801);await hit.promise;const b=g.reader.read(2040801),c=await g.reader.read(2040801);assert.equal(c.reason,'waiter_cap');assert.equal(g.reader.state().waiters,2);assert.equal(g.starts.length,1);assert.equal((await a).status,'unavailable');assert.equal((await b).status,'unavailable');assert.equal(g.reader.state().physicalPending,1);const newer=createBasicSelectedCacheReader(g.options);assert.equal((await newer.read(2040801)).reason,'physical_hold');g.reader.setEnabled(false);assert.equal(newer.state().enabled,false);const nextScope=createBasicSelectedCacheReader({...g.options,scope:{...g.e.scope,epoch:'independently-new-epoch'}});assert.equal((await nextScope.read(2040801)).reason,'physical_hold');assert.equal(g.starts.length,1);held.resolve();await settled(nextScope);assert.equal(g.starts.length,1);assert.equal(g.owner.control().action_token,null);
});

test('hung body cancellation keeps slot until actualsettlement; rejected cancellation quarantines acrossOff/newfactory',async t=>{
 for(const reject of [false,true]){const g=await setup(t,{extraItems:0,waitMs:1000}),read=deferred(),cancel=deferred(),hit=deferred(),cancelHit=deferred();g.setHook(async()=>({size:1,body:{getReader(){return{read(){hit.resolve();return read.promise;},cancel(){cancelHit.resolve();return cancel.promise;},releaseLock(){}};}}}));const request=g.reader.read(2040801);await hit.promise;assert.equal((await request).status,'unavailable');read.resolve({done:false,value:new Uint8Array([1])});await cancelHit.promise;assert.equal(g.reader.state().physicalPending,1);assert.equal((await createBasicSelectedCacheReader(g.options).read(2040801)).reason,'physical_hold');if(reject)cancel.resolve(Promise.reject(Error('synthetic_cancel_rejected')));else cancel.resolve();for(let i=0;i<20;i++)await tick();assert.equal(g.reader.state().quarantined,reject);assert.equal(g.reader.state().physicalPending,reject?1:0);if(reject){g.reader.setEnabled(false);const n=createBasicSelectedCacheReader(g.options);assert.equal((await n.read(2040801)).reason,'physical_unknown');assert.equal(g.starts.length,1);}}
});

test('late pins change during firstSDK causes no secondGET or stale authority',async t=>{
 const g=await setup(t,{extraItems:0}),held=deferred(),hit=deferred();g.setHook(async key=>{hit.resolve();await held.promise;return g.f.bucket.get(key);});const task=g.reader.read(2040801);await hit.promise;g.setRecord({status:'no_current'});held.resolve();const out=await task;assert.equal(out.status,'unavailable');await settled(g.reader);assert.equal(g.starts.length,1);assert.equal(g.reader.state().lastGoodItems,0);
});

test('new generation withdraws item, old pin replay cannotresurrect, sameclock genuinely newer completedC recovers',async t=>{
 const g=await setup(t),a=g.getRecord(),first=await g.reader.read(2040801);assert.equal(first.status,'validated');const b=await generation(g,JSON.stringify(JSON.parse(g.f.prices()).filter(r=>r.item_id!==2040801)),'2026-11-06T12:01:00.000Z');g.setRecord(b);const missing=await g.reader.read(2040801);assert.equal(missing.status,'absent');assert.equal(missing.reference.state,'absent_in_generation');assert.equal(missing.reference.sold,null);assert.equal(missing.reference.capturedAt,'2026-11-06T12:01:00.000Z');const count=g.starts.length;g.setRecord(a);const replay=await g.reader.read(2040801);assert.equal(replay.status,'retained_absent');assert.equal(replay.reference.generation,missing.reference.generation);assert.equal(g.starts.length,count);
 const c=await generation(g,g.f.prices(),'2026-11-06T12:01:00.000Z');g.setRecord(c);g.time.v+=1001;const recovered=await g.reader.read(2040801);assert.equal(recovered.status,'validated');assert.notEqual(recovered.reference.generation,missing.reference.generation);assert.equal(recovered.reference.capturedAt,missing.reference.capturedAt);assert.equal(g.f.provider.length,0);
});

test('observednewer/pins-unavailable preserve lastgood originalclock only; Off removesquote, errors/backoffshared',async t=>{
 const g=await setup(t,{extraItems:0}),first=await g.reader.read(2040801),raw=g.getRecord();g.setRecord({...raw,newerBasicObservedIntentPresent:true});const newer=await g.reader.read(2040801);assert.equal(newer.status,'retained');assert.equal(newer.currentAgainstProvidedPins,false);assert.equal(newer.reference.capturedAt,first.reference.capturedAt);const before=g.starts.length;g.setRecord({status:'unavailable'});const held=await g.reader.read(2040801);assert.equal(held.status,'retained');assert.equal(held.reference.capturedAt,first.reference.capturedAt);assert.equal(g.starts.length,before);g.setRecord(raw);assert.equal((await createBasicSelectedCacheReader(g.options).read(2040801)).reason,'backoff');g.reader.setEnabled(false);assert.equal((await g.reader.read(2040801)).reference,null);assert.equal(g.reader.state().lastGoodItems,0);
});

test('late finalpayload hash budget fails with no lastgood commit; cache admission never freshens originalsource',async t=>{
 const g=await setup(t,{extraItems:0,waitMs:1000}),original=crypto.subtle.digest.bind(crypto.subtle);let payloads=0;crypto.subtle.digest=async(algorithm,bytes)=>{const result=await original(algorithm,bytes);if(new TextDecoder().decode(bytes).includes('"kind":"basic_current_item_reference"')&&++payloads===2)g.time.v=1001;return result;};try{const out=await g.reader.read(2040801);assert.equal(out.status,'unavailable');assert.equal(g.reader.state().lastGoodItems,0);assert.equal(payloads,2);}finally{crypto.subtle.digest=original;}await settled(g.reader);assert.equal(g.reader.state().physicalPending,0);assert.equal(g.starts.length,3);
});

test('declared-size/truncated/invalidUTF pointer failures stop before manifest and backoff releases only settledSDK',async t=>{
 for(const mode of ['oversized','truncated','invalid_utf']){const g=await setup(t,{extraItems:0});if(mode==='invalid_utf'){const e=JSON.parse(new TextDecoder().decode(g.getRecord().expectedRaw)),bad=new Uint8Array([255]);e.pointerSha256=sha(bad);const raw=encode(e);g.setRecord({...g.getRecord(),expectedRaw:raw,expectedOriginalSha256:sha(raw)});g.setHook(async()=>({size:1,body:new Response(bad).body}));}else g.setHook(async()=>({size:mode==='oversized'?4097:20,body:new Response(new Uint8Array([1])).body}));const out=await g.reader.read(2040801);assert.equal(out.status,'unavailable');await settled(g.reader);assert.equal(g.starts.length,1);assert.equal(g.reader.state().lastGoodItems,0);assert.equal(g.reader.state().quarantined,false);assert.equal((await g.reader.read(2040801)).reason,'backoff');assert.equal(g.starts.length,1);}
});

test('fixed4page/32lastgood retention and callerabort keep pureselected costs bounded withoutproducerlease',async t=>{
 const g=await setup(t),m=JSON.parse(new TextDecoder().decode(g.inputs.manifestRaw));for(const d of m.pages){assert.equal((await g.reader.read(d.firstId)).status,'validated');assert(g.reader.state().cachedPages<=4);}for(const id of [...g.f.names.keys()].slice(0,35))assert.equal((await g.reader.read(id)).status,'validated');assert.equal(g.reader.state().lastGoodItems,32);assert(g.reader.state().cachedPages<=4);const before=g.starts.length,c=new AbortController();c.abort();assert.equal((await g.reader.read(2040801,{signal:c.signal})).status,'cancelled');assert.equal(g.starts.length,before);assert.equal(g.owner.control().action_token,null);assert.equal(g.f.provider.length,0);
});

test('closed synchronous RAM pins are independently admitted before SDK, including wrong originalSHA/scope/size/accessors',async t=>{
 const g=await setup(t,{extraItems:0}),valid=g.getRecord(),e=JSON.parse(new TextDecoder().decode(valid.expectedRaw));let reads=0;
 const accessor={status:'ready',expectedOriginalSha256:valid.expectedOriginalSha256,newerBasicObservedIntentPresent:false,get expectedRaw(){reads++;throw Error('synthetic_untrusted_accessor');}};
 for(const record of [Promise.resolve(valid),accessor,{...valid,expectedOriginalSha256:'0'.repeat(64)},{...valid,expectedRaw:new Uint8Array(16385)},(()=>{const raw=encode({...e,scope:{...e.scope,epoch:'unadmitted-epoch'}});return{...valid,expectedRaw:raw,expectedOriginalSha256:sha(raw)};})()]){
  g.setRecord(record);g.time.v+=31001;assert.equal((await g.reader.read(2040801)).status,'unavailable');assert.equal(g.starts.length,0);assert.equal(g.reader.state().lastGoodItems,0);
 }assert.equal(reads,0);g.setRecord(valid);g.time.v+=31001;assert.equal((await g.reader.read(2040801)).status,'validated');assert.equal(g.starts.length,3);
});

test('one waiter abort cannot cancel its remaining singleflight peer; shared physical gate survives reentrant factory call',async t=>{
 const g=await setup(t,{extraItems:0}),held=deferred(),hit=deferred(),aborted=new AbortController();let reentrant;
 g.setHook(async key=>{if(key===PK){reentrant=await createBasicSelectedCacheReader(g.options).read(2040000);hit.resolve();await held.promise;}return g.f.bucket.get(key);});
 const first=g.reader.read(2040801,{signal:aborted.signal});await hit.promise;const second=createBasicSelectedCacheReader(g.options).read(2040801);aborted.abort();assert.equal((await first).status,'cancelled');assert.equal(reentrant.reason,'physical_hold');assert.equal(g.reader.state().waiters,1);assert.equal(g.starts.length,1);held.resolve();assert.equal((await second).status,'validated');assert.equal(g.starts.length,3);assert.equal(g.reader.state().physicalPending,0);
});

test('same-source conflicting independent pin hash and final wrong original bytes never mint fresh authority',async t=>{
 const g=await setup(t,{extraItems:0}),valid=g.getRecord(),first=await g.reader.read(2040801),e=JSON.parse(new TextDecoder().decode(valid.expectedRaw)),raw=encode({...e,bodySha256:'0'.repeat(64)});g.setRecord({...valid,expectedRaw:raw,expectedOriginalSha256:sha(raw)});const before=g.starts.length,bad=await g.reader.read(2040801);assert.equal(bad.status,'retained');assert.equal(bad.currentAgainstProvidedPins,false);assert.equal(bad.reference.generation,first.reference.generation);assert.equal(g.starts.length,before);
 g.time.v+=1001;g.setRecord(valid);let payloads=0;const original=crypto.subtle.digest.bind(crypto.subtle);crypto.subtle.digest=async(algorithm,bytes)=>{const result=await original(algorithm,bytes);if(new TextDecoder().decode(bytes).includes('"kind":"basic_current_item_reference"')&&++payloads===2)g.setRecord({...valid,expectedRaw:encode({...e,sourceLiveAttemptId:123})});return result;};
 try{const out=await g.reader.read(2040801);assert.equal(out.status,'retained');assert.equal(out.currentAgainstProvidedPins,false);assert.equal(out.reference.capturedAt,first.reference.capturedAt);assert.equal(payloads,2);assert.equal(g.starts.length,before);}finally{crypto.subtle.digest=original;}
});

test('synchronous pins provider abort before first waiter admission cancels zero-waiter work before any SDK',async t=>{
 const g=await setup(t,{extraItems:0}),abort=new AbortController();let calls=0;
 const reader=createBasicSelectedCacheReader({...g.options,committedPinsProvider:()=>{if(++calls===2)abort.abort();return g.getRecord();}});
 assert.equal((await reader.read(2040801,{signal:abort.signal})).status,'cancelled');await settled(reader);assert.equal(g.starts.length,0);assert.equal(reader.state().lastGoodItems,0);assert.equal(reader.state().physicalPending,0);
});

test('provider disabled clears dated quote authority during unrelated held SDK without freeing physical reservation',async t=>{
 const g=await setup(t,{extraItems:0});assert.equal((await g.reader.read(2040801)).status,'validated');const held=deferred(),hit=deferred();
 const m=JSON.parse(new TextDecoder().decode(g.inputs.manifestRaw)),id=m.pages.at(-1).firstId;g.setHook(async key=>{hit.resolve();await held.promise;return g.f.bucket.get(key);});const flight=g.reader.read(id);await hit.promise;const before=g.starts.length;g.setRecord({status:'disabled'});const out=await g.reader.read(2040801);assert.equal(out.status,'disabled');assert.equal(out.reference,null);assert.equal(g.reader.state().lastGoodItems,0);assert.equal(g.reader.state().physicalPending,1);assert.equal(g.starts.length,before);held.resolve();assert.equal((await flight).status,'disabled');await settled(g.reader);assert.equal(g.starts.length,before);
});
