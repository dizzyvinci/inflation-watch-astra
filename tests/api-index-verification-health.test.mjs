import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,prices,sha} from './index-owner-fixture.mjs';
import {ApiPrivateHealth} from '../ops/api-private-health.mjs';
import {committedCalculationVerificationPins as pins} from '../ops/api-index-verification-health.mjs';
const checked=f=>new Date(f.now[0]).toISOString();
const bind=f=>{f.core.indexBridge=f.bridge;return f;};
async function published(t){const f=bind(await fixture(t));f.seed();f.bridge.reconcile();await f.drain();return f;}
test('Off returns null before any storage, network, key or source access',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('forbidden');};
 const core={indexBridge:{active:false},get ctx(){return trap();},get sql(){return trap();},get env(){return trap();},row:trap};
 assert.equal(pins(core,{checkedAt:'bad'}),null);assert.equal(calls,0);
});
test('enabled pristine owner zero means not committed, not fabricated zero hashes',async t=>{
 const f=bind(await fixture(t));const result=pins(f.core,{checkedAt:checked(f)});assert.equal(result.status,'not_committed');assert.equal('publicationOrdinal'in result,false);assert.equal(result.remoteR2Availability,'not_checked');
});
test('actual committed finished row reproduces exact independent pointer hashes and original clocks',async t=>{
 const f=await published(t),p=f.pointer(),result=pins(f.core,{checkedAt:checked(f)});
 assert.equal(result.status,'committed_sql_only');for(const k of ['publicationOrdinal','modelKey','modelSha256','publicKey','publicBodySha256','snapshotHash','priceCaptureHash','overviewCaptureHash','pricesCapturedAt','overviewCapturedAt','calculatedAt'])assert.deepEqual(result[k],p[k],k);
 assert.equal(result.remoteR2ObjectVerified,false);assert.equal(result.sourceObservedAt,null);assert.equal(result.publicationEligible,false);
 assert.equal(f.row("SELECT model_body FROM api_index_inputs WHERE state='complete'").model_body,null);
 assert.ok(f.row("SELECT name FROM sqlite_master WHERE name='api_index_inputs_committed'"));
});
test('uncommitted newer applied input never renews committed pins or their original source clocks',async t=>{
 const f=await published(t),before=pins(f.core,{checkedAt:checked(f)});f.seed('prices',prices({factor:2}),{capturedAt:'2026-11-06T12:03:00.000Z'});f.bridge.reconcile();
 for(let i=0;i<5;i++){if(f.row("SELECT phase FROM api_index_inputs WHERE state='pending'")?.phase==='compute')break;await f.bridge.drainOne(async()=>{});}
 assert.equal(f.bridge.health().pricesCapturedAt,'2026-11-06T12:03:00.000Z');assert.deepEqual(pins(f.core,{checkedAt:checked(f)}),before);
 await f.drain();const next=pins(f.core,{checkedAt:checked(f)});assert.equal(next.publicationOrdinal,before.publicationOrdinal+1);assert.equal(next.pricesCapturedAt,'2026-11-06T12:03:00.000Z');
});
test('SQL-only lookup is bounded, contains no source/body joins and does no R2 reads',async t=>{
 const f=await published(t),exec=f.core.sql.exec.bind(f.core.sql),queries=[],reads=f.reads.length,puts=f.puts.length;
 t.mock.method(f.core.sql,'exec',(q,...args)=>{queries.push(q);assert.doesNotMatch(q,/api_jobs|api_attempts|api_index_days|model_body|public_body|capture_body/);return exec(q,...args);});
 assert.equal(pins(f.core,{checkedAt:checked(f)}).status,'committed_sql_only');assert.equal(queries.length,2);assert.match(queries[1],/LIMIT 2/);assert.equal(f.reads.length,reads);assert.equal(f.puts.length,puts);
});
test('unknown row, noncommitted phase and duplicate committed ordinal fail without partial echo',async t=>{
 for(const change of ["UPDATE api_index_owner SET last_published=2,next_publication=2", "UPDATE api_index_owner SET grant_ref='damaged'", "UPDATE api_index_owner SET round_ref='damaged'", "UPDATE api_index_inputs SET state='pending'", "UPDATE api_index_inputs SET phase='artifact'"]){const f=await published(t);f.exec(change);const result=pins(f.core,{checkedAt:checked(f)});assert.equal(result.status,'diagnostic_unavailable');assert.equal('modelKey'in result,false);}
 const f=await published(t);f.exec("INSERT INTO api_index_inputs(receipt_key,job_key,operation,source_attempt,request_at,raw_sha,definition_hash,available_at,state,phase,publication_ordinal)SELECT 'duplicate','duplicate',operation,source_attempt,request_at,raw_sha,definition_hash,available_at,state,phase,publication_ordinal FROM api_index_inputs LIMIT 1");assert.equal(pins(f.core,{checkedAt:checked(f)}).status,'diagnostic_unavailable');
});
test('path/hash/definition/source-clock mutation rejects entire pins object',async t=>{
 const changes=[['model_key',"'private-secret'"],['public_key',"'_private/provider-api/v1/receipts/forbidden.json'"],['model_sha',"'not-a-hash'"],['definition_hash',"'"+'b'.repeat(64)+"'"],['prices_captured_at',"NULL"],['overview_capture_hash',"'"+'a'.repeat(64)+"'"],['calculated_at',"'2026-11-06T13:00:00.000Z'"],['prices_captured_at',"'2026-11-06T13:00:00.000Z'"]];
 for(const [key,value]of changes){const f=await published(t);f.exec(`UPDATE api_index_inputs SET ${key}=${value}`);const result=pins(f.core,{checkedAt:checked(f)});assert.equal(result.status,'diagnostic_unavailable',key);assert.doesNotMatch(JSON.stringify(result),/private-secret|receipts/);}
});
test('clock boundary and authority withdrawn within lookup never emits committed evidence',async t=>{
 const f=await published(t);for(const value of [null,'invalid','2026-11-06T11:00:00.000Z'])assert.equal(pins(f.core,{checkedAt:value}).status,'diagnostic_unavailable');
 const exec=f.core.sql.exec.bind(f.core.sql);t.mock.method(f.core.sql,'exec',(q,...a)=>{const r=exec(q,...a);if(q.includes('LIMIT 2'))f.env.API_PRIVATE_INDEX_JSON='{"enabled":false}';return r;});assert.equal(pins(f.core,{checkedAt:checked(f)}).status,'diagnostic_unavailable');
});
test('actual afterRun embeds committed SQL pins and hashes the exact unsigned JSON bytes',async t=>{
 const f=await published(t);const health=new ApiPrivateHealth(f.ctx,f.env,f.core);await health.afterRun({status:'success'});const body=f.row('SELECT body FROM api_private_health').body,stored=JSON.parse(f.objects.get('_private/provider-api/v1/health.json').body);assert.equal(stored.healthSha256,sha(body));assert.deepEqual(stored.privateMarketCalculations.verificationPins,pins(f.core,{checkedAt:stored.checkedAt}));assert.equal(stored.privateMarketCalculations.lastPublishedOrdinal,stored.privateMarketCalculations.verificationPins.publicationOrdinal);assert.doesNotMatch(JSON.stringify(stored.privateMarketCalculations),/receipt|attempt|owner/i);
});
test('index Off actual old health body and exact SHA remain byte-identical',async t=>{
 const after=await fixture(t,{on:false});after.core.indexBridge=after.bridge;
 await new ApiPrivateHealth(after.ctx,after.env,after.core).afterRun({status:'success'});
 const body=after.row('SELECT body FROM api_private_health').body;assert.equal(sha(body),'0bc3528465701ed22548b03992a6a27256002625df38b0b9c5f5f2e060e44517');assert.equal('privateMarketCalculations'in JSON.parse(body),false);
});
test('lost pointer acknowledgement never claims SQL commit merely because remote mock pointer exists',async t=>{
 const f=bind(await fixture(t));f.seed();f.bridge.reconcile();const put=f.env.API_RAW_RECEIPTS.put;let cut=false;
 f.env.API_RAW_RECEIPTS.put=async(k,...args)=>{const value=await put(k,...args);if(k.endsWith('/api-index/v1/current.json')&&!cut){cut=true;throw Error('lost acknowledgement');}return value;};
 assert.equal((await f.drain()).status,'index_storage_retry');assert.ok(f.pointer());assert.equal(f.row('SELECT last_published FROM api_index_owner').last_published,0);assert.equal(pins(f.core,{checkedAt:checked(f)}).status,'not_committed');
 f.now[0]+=30001;assert.equal((await f.drain()).status,'index_pointer_ack_recovered');assert.equal(pins(f.core,{checkedAt:checked(f)}).status,'committed_sql_only');
});
