import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,sha} from './fast-registration-fixture.mjs';
import {privateFastCurrentVerificationHealth as health} from '../ops/api-fast-current-verification-health.mjs';
const cfg={schemaVersion:1,enabled:true,approvalRecorded:true,mode:'continuous_v2_reprojection',contractSha256:'e0c58417ac4bc4097d7a61d85797002708073a35fac48a7234c0bc646e977893',grantReference:'synthetic-grant',roundReference:'synthetic-r1',publicationEnabled:false};
const checked=f=>new Date(f.now[0]).toISOString(),read=f=>health(f.core,{delegate:f.owner.fastCurrentRegistration?.delegate,checkedAt:checked(f)});
async function ready(t){const f=await fixture(t,{fast:false,registrationConfig:cfg}),a=f.seed();await f.owner.privateCash.afterProviderEvent(f.owner.recurring.eventFrame());for(let i=0;i<100;i++){if(f.row("SELECT 1 n FROM fast_v2_generations WHERE role='current'"))return{f,a};await f.owner.alarm();}throw Error('actual current SQL not reached');}
test('absent and exact Off return before any FAST/core/context/SQL inspection',async()=>{for(const value of[undefined,'{"enabled":false}']){const env={};if(value!==undefined)env.API_FAST_CURRENT_JSON=value;const core=new Proxy({env},{get(t,p){if(p==='env')return t.env;throw Error('no core or SQL access '+String(p));}});assert.equal(await health(core),null);}});
test('On without registration is closed not_initialized and forged delegate cannot read SQL',async()=>{const core={env:{API_FAST_CURRENT_JSON:JSON.stringify(cfg)},clock:()=>Date.parse('2026-11-06T12:10:00.000Z')};assert.equal((await health(core,{checkedAt:'2026-11-06T12:10:00.000Z'})).status,'not_initialized');core.ctx={};core.recurring={};Object.defineProperty(core,'sql',{get(){throw Error('no SQL');}});assert.equal((await health(core,{checkedAt:'2026-11-06T12:10:00.000Z',delegate:{}})).status,'diagnostic_unavailable');});
test('actual registered SQL current yields independent exact graph pins with no SDK call or SQL write',async t=>{
 const {f,a}=await ready(t),g=f.row("SELECT * FROM fast_v2_generations WHERE role='current'"),before={reads:f.reads.length,puts:f.puts.length,attempts:f.row('SELECT COUNT(*)n FROM api_attempts').n};
 const q=[],exec=f.core.sql.exec;f.core.sql.exec=(sql,...args)=>{q.push(sql);return exec(sql,...args);};let result;try{result=await read(f);}finally{f.core.sql.exec=exec;}
 assert.equal(result.status,'committed_sql_only',JSON.stringify(result));assert.deepEqual(result.verificationPins,{generation:g.manifest_sha,pointerSha256:g.pointer_sha,manifestBytes:g.manifest_bytes,itemCount:g.item_count,sourceAttemptId:a.id,rawBodySha256:a.e.responseSha256,capturedAt:a.e.capturedAt,publicationOrdinal:g.publication_ordinal,grantReference:f.grant.grantReference,roundReference:f.grant.probeRound});
 assert.equal(result.verificationPins.pointerSha256,sha(g.pointer_json));assert.equal(result.provenance.generationId,g.generation_id);assert.equal(result.provenance.slotEpoch,g.slot_epoch);assert.equal(result.originalAdmissionProfileAttestation,'not_checked');assert.equal(result.rawReprojectionEquivalence,'not_checked');assert.equal(result.remoteGraphVerification,'not_checked');assert.equal(result.independentlyVerifiedRemoteGraph,false);assert.equal(result.publicReaderRegistered,false);assert.equal(result.sourceObservedAt,null);
 assert(q.every(s=>/^SELECT\b/.test(s)));assert(q.length<=32,q.length);assert(q.every(s=>!s.includes('fast_current_shards')&&!s.includes('rawBodyBase64')));assert.equal(f.reads.length,before.reads);assert.equal(f.puts.length,before.puts);assert.equal(f.row('SELECT COUNT(*)n FROM api_attempts').n,before.attempts);assert.equal(f.provider.length,0);t.diagnostic(JSON.stringify({selects:q.length,outputBytes:Buffer.byteLength(JSON.stringify(result)),sourceAttempt:a.id,rawOrShardBodyReads:0,externalCalls:0}));
});
test('actual committed SQL rejects bounded independent-pin/source/capture/slot/metadata damage without echo',async t=>{
 const {f}=await ready(t),g=f.row("SELECT * FROM fast_v2_generations WHERE role='current'"),source=JSON.parse(g.source_json),secret='SHOULD_NEVER_ECHO_PRIVATE_BODY';
 const cases=[
 ['generation pointer hash',"UPDATE fast_v2_generations SET pointer_sha=? WHERE generation_id=?",'a'.repeat(64),g.generation_id],
 ['generation manifest size',"UPDATE fast_v2_generations SET manifest_bytes=? WHERE generation_id=?",g.manifest_bytes+1,g.generation_id],
 ['generation item count',"UPDATE fast_v2_generations SET item_count=? WHERE generation_id=?",g.item_count+1,g.generation_id],
 ['generation attempt',"UPDATE fast_v2_generations SET source_attempt=? WHERE generation_id=?",g.source_attempt+1,g.generation_id],
 ['generation raw SHA',"UPDATE fast_v2_generations SET raw_sha=? WHERE generation_id=?",'b'.repeat(64),g.generation_id],
 ['generation original clock',"UPDATE fast_v2_generations SET captured_at=? WHERE generation_id=?",'2026-11-07T00:00:00.000Z',g.generation_id],
 ['generation ordinal',"UPDATE fast_v2_generations SET publication_ordinal=? WHERE generation_id=?",g.publication_ordinal+1,g.generation_id],
 ['slot epoch',"UPDATE fast_v2_slots SET slot_epoch=? WHERE slot=?",g.slot_epoch+1,g.slot],
 ['original attempt grant',"UPDATE api_attempts SET grant_ref=? WHERE id=?",'wrong-grant',g.source_attempt],
 ['oversized original scalar',"UPDATE api_attempts SET grant_ref=? WHERE id=?",secret.repeat(10000),g.source_attempt],
 ['original job active attempt',"UPDATE api_jobs SET attempt_id=? WHERE job_key=?",g.source_attempt,source.jobKey],
 ['registry job lease',"UPDATE recurring_registry_jobs SET lease_until=? WHERE receipt_key=?",f.now[0]+130000,g.receipt_key],
 ['registry capture hash',"UPDATE recurring_registry_captures SET capture_hash=? WHERE receipt_key=?",'c'.repeat(64),g.receipt_key],
 ['registry membership hash',"UPDATE recurring_registry_captures SET set_hash=? WHERE receipt_key=?",'d'.repeat(64),g.receipt_key],
 ['admitted metadata',"UPDATE fast_current_staging SET metadata_json=? WHERE slot=?",JSON.stringify([{sourceUrl:secret,sha256:'f'.repeat(64)}]),g.slot],
 ['admitted manifest bytes',"UPDATE fast_current_outbox SET manifest_json=? WHERE slot=?",JSON.stringify({secret}),g.slot],
 ['oversized pointer text',"UPDATE fast_v2_generations SET pointer_json=? WHERE generation_id=?",secret.repeat(200),g.generation_id],
 ['oversized metadata text',"UPDATE fast_v2_generations SET metadata_json=? WHERE generation_id=?",secret.repeat(3000),g.generation_id],
 ['oversized control policy',"UPDATE fast_v2_control SET policy_json=? WHERE id=?",secret.repeat(10000),1],
 ['oversized hold reason',"UPDATE fast_v2_control SET hold_reason=? WHERE id=?",secret.repeat(1000),1],
 ];
 for(const [name,sql,value,key]of cases)await t.test(name,async()=>{let answer;f.core.sql.exec('SAVEPOINT damage');try{f.exec(sql,value,key);answer=await read(f);}finally{f.core.sql.exec('ROLLBACK TO damage');f.core.sql.exec('RELEASE damage');}assert.equal(answer.status,'diagnostic_unavailable');assert.equal(answer.verificationPins,null);assert(!JSON.stringify(answer).includes(secret));assert.equal((await read(f)).status,'committed_sql_only');});
});
test('full rotating admission profile is not needed for original SQL graph expectations; same graph different attempt remains distinct',async t=>{
 const {f,a}=await ready(t),before=await read(f),b=f.seed(f.prices(),a.e.capturedAt);await f.owner.privateCash.afterProviderEvent(f.owner.recurring.eventFrame());let sawRetained=false,sawUnconfirmed=false;
 for(let i=0;i<100;i++){const profile=f.row("SELECT receipt_key FROM fast_v2_price_profiles WHERE role='selected'"),g=f.row("SELECT source_attempt FROM fast_v2_generations WHERE role='current'");if(profile?.receipt_key===b.receiptKey&&g.source_attempt===a.id){const r=await read(f);if(r.status==='committed_sql_only'){assert.deepEqual(r.verificationPins,before.verificationPins);sawRetained=true;}else{assert.equal(r.status,'current_transition_unconfirmed');assert.equal(r.verificationPins,null);sawUnconfirmed=true;}}
  if(g.source_attempt===b.id)break;await f.owner.alarm();}
 const after=await read(f);assert(sawRetained);assert(sawUnconfirmed);assert.equal(after.status,'committed_sql_only');assert.equal(after.verificationPins.generation,before.verificationPins.generation);assert.equal(after.verificationPins.capturedAt,before.verificationPins.capturedAt);assert.notEqual(after.verificationPins.sourceAttemptId,before.verificationPins.sourceAttemptId);assert.notEqual(after.verificationPins.publicationOrdinal,before.verificationPins.publicationOrdinal);assert.notEqual(after.verificationPins.pointerSha256,before.verificationPins.pointerSha256);assert.notEqual(after.provenance.generationId,before.provenance.generationId);assert.equal(f.provider.length,0);
});
test('Off and original-source mutation during digest cannot publish late verification pins',async t=>{
 const {f}=await ready(t),digest=crypto.subtle.digest.bind(crypto.subtle);for(const mode of['off','source']){let release,enter;const held=new Promise(r=>release=r),hit=new Promise(r=>enter=r);let once=true;const mocked=t.mock.method(crypto.subtle,'digest',async(...args)=>{if(once){once=false;enter();await held;}return digest(...args);});const promise=read(f);await hit;const g=f.row("SELECT * FROM fast_v2_generations WHERE role='current'");try{if(mode==='off')f.env.API_FAST_CURRENT_JSON='{"enabled":false}';else f.exec('UPDATE api_attempts SET grant_ref=? WHERE id=?','late-wrong-grant',g.source_attempt);release();const answer=await promise;if(mode==='off')assert.equal(answer,null);else{assert.equal(answer.status,'diagnostic_unavailable');assert.equal(answer.verificationPins,null);}}finally{release();mocked.mock.restore();f.env.API_FAST_CURRENT_JSON=JSON.stringify(cfg);f.exec('UPDATE api_attempts SET grant_ref=? WHERE id=?',f.grant.grantReference,g.source_attempt);await promise;}assert.equal((await read(f)).status,'committed_sql_only');}
});
test('normal existing health publication incorporates independently validated pins and hashes complete unsigned body',async t=>{
 const {f}=await ready(t),key='_private/provider-api/v1/health.json';await f.owner.privateHealth.afterRun({status:'idle'});const published=JSON.parse(f.objects.get(key).body),{healthSha256,...unsigned}=published;assert.equal(sha(JSON.stringify(unsigned)),healthSha256);assert.equal(published.privateFastCurrent.status,'committed_sql_only');assert.deepEqual(published.privateFastCurrent.verificationPins,(await read(f)).verificationPins);assert.equal(published.privateFastCurrent.verificationPins.capturedAt,'2026-11-06T12:00:00.000Z');assert.equal(published.lastRawCapturedAt,'2026-11-06T12:00:00.000Z');assert.equal(f.provider.length,0);
});
test('pending writer/replay cursors and actual review are distinct from independently committed pins',async t=>{
 const f=await fixture(t,{fast:false,registrationConfig:cfg});assert.equal((await read(f)).status,'not_committed');f.seed();await f.owner.privateCash.afterProviderEvent(f.owner.recurring.eventFrame());let writer=false,publication=false,review=false;
 const get=f.bucket.get;f.bucket.get=async key=>{if(key.includes('/fast-current/v1/manifests/'))return{size:1,body:new Response('{').body,etag:'synthetic-malformed'};return get(key);};
 for(let i=0;i<80;i++){const r=await read(f);assert.equal(r.verificationPins,null);if(r.control?.writer){assert.equal(typeof r.control.writer.cursor,'number');writer=true;}if(r.control?.publication){assert.equal(typeof r.control.publication.cursor,'number');publication=true;if(r.control.publication.state==='review'){assert.equal(r.status,'not_committed');review=true;break;}}await f.owner.alarm();}
 assert(writer&&publication&&review);assert.equal(f.provider.length,0);
});
test('same-owner auth pause and forged delegate expose no committed pins',async t=>{
 const {f}=await ready(t);f.exec('UPDATE api_control SET auth_stopped=1 WHERE id=1');const r=await read(f);assert.equal(r.status,'authentication_paused');assert.equal(r.verificationPins,null);f.exec('UPDATE api_control SET auth_stopped=0 WHERE id=1');const delegate=f.owner.fastCurrentRegistration.delegate;const fake=Object.create(delegate);assert.equal((await health(f.core,{delegate:fake,checkedAt:checked(f)})).status,'diagnostic_unavailable');assert.equal((await read(f)).status,'committed_sql_only');
});
