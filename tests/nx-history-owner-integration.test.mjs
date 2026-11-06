import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {fixture as cashFixture,PRIVATE_FLAG,PUBLIC_FLAG} from './api-public-cash-fixture.mjs';
import {POINTER,PREFIX} from '../ops/nx-history-contract.mjs';
import {nxHistoryArchiveHealth} from '../ops/nx-history-health.mjs';
const FLAG={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:true},sha=s=>createHash('sha256').update(s).digest('hex');
async function fixture(t,{flag=FLAG,allKinds=false}={}){
 const f=await cashFixture(t,{privateFlag:allKinds?PRIVATE_FLAG:{enabled:false},publicFlag:allKinds?PUBLIC_FLAG:null,nxFlag:PRIVATE_FLAG});
 const cfg=JSON.parse(f.env.API_GRANT_JSON);cfg.allowedOperations=['status','prices','catalogue','overview','apple-detail','apple-history','nx-rate','nx-history'];cfg.nxSchemaProbesEnabled=true;f.env.API_GRANT_JSON=JSON.stringify(cfg);
 f.env.API_PRIVATE_NX_R2_JSON=JSON.stringify(PRIVATE_FLAG);
 if(flag!==null)f.env.API_NX_HISTORY_JSON=JSON.stringify(flag);
 if(allKinds){f.env.API_PRIVATE_ITEMS_JSON=JSON.stringify(PRIVATE_FLAG);f.env.API_PRIVATE_ITEM_PILOT_JSON=JSON.stringify({schemaVersion:1,enabled:true,sourceAttemptId:1});f.env.API_PRIVATE_ITEM_HISTORY_JSON=JSON.stringify(PRIVATE_FLAG);f.env.API_PRIVATE_ITEM_DISCOVERY_JSON=JSON.stringify(PRIVATE_FLAG);}
 const restart=f.restart;f.restart=async()=>{const old=Date.now;Date.now=()=>f.now[0];try{await restart();}finally{Date.now=old;}};await f.restart();
 f.seedNx=(id=1)=>{const cfg=f.core.config(),at=Math.floor((f.now[0]-3600000)/3600000)*3600,body=JSON.stringify(['buy','sell'].map((side,i)=>({at,side,posters:2,p25:15+i*5,median:15+i*5,p75:15+i*5,low:15+i*5,high:15+i*5,steps:{[15+i*5]:2}}))),hash=sha(body),started=f.now[0]-1000,key='_private/provider-api/v1/receipts/'+String(id).padStart(12,'0')+'-nx-history-'+hash+'.json',job='synthetic-archive-'+id;
  const e={kind:'unverified_provider_api_receipt',operation:'nx-history',httpStatus:200,sourceUrl:'https://maplestory.market/api/nx-rate/history?range=7d&step=hour',attemptId:id,grantReference:cfg.grantReference,roundReference:cfg.probeRound,requestStartedAt:new Date(started).toISOString(),capturedAt:new Date(started+50).toISOString(),rawBodyEncoding:'base64',rawBodyBase64:Buffer.from(body).toString('base64'),responseBytes:Buffer.byteLength(body),responseSha256:hash,sourceObservedAt:null,observationTimestampKnown:false,captureTimeKind:'http_response_completed',schemaVerified:false,publicationEligible:false};
  f.objects.set(key,{body:JSON.stringify(e),etag:hash});f.core.sql.exec("INSERT INTO api_jobs(job_key,operation,round_ref,state,available_at,attempt_id)VALUES(?,?,?,'running',?,?)",job,'nx-history',cfg.probeRound,started,id);f.core.sql.exec('INSERT INTO api_attempts(id,job_key,at,grant_ref)VALUES(?,?,?,?)',id,job,started,cfg.grantReference);
  assert.equal(f.core.finish(f.row('SELECT * FROM api_jobs WHERE job_key=?',job),cfg,{kind:'success',receiptKey:key,capturedAt:e.capturedAt}).status,'success');assert.equal(f.row('SELECT attempt_id FROM api_jobs WHERE job_key=?',job).attempt_id,null);return{key,e};
 };
 f.drain=async(max=70)=>{const out=[];for(let i=0;i<max&&await f.alarm()!==null;i++){const beforeCalls=f.calls.length,beforePuts=f.puts.length,beforeReads=f.reads.length;const r=await f.fire();
  if(r.eventKind==='nx_history_archive'){assert.equal(f.calls.length,beforeCalls);assert(f.puts.length-beforePuts<=1);assert(f.reads.slice(beforeReads).every(k=>k===POINTER||k.startsWith(PREFIX)));}
  out.push(r);
 }return out;};return f;
}
for(const flag of [null,{enabled:false},{...FLAG,extra:true},{...FLAG,publicationEnabled:false}])test('tenth archive defaultOff/invalid preserves old owner and does not create archive controls '+JSON.stringify(flag),async t=>{
 const f=await fixture(t,{flag});assert.equal(f.owner.privateCash.nxArchiveWork,undefined);assert.equal(f.row("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='api_nx_history_owner' OR name LIKE 'nx_archive_%'").n,0);assert.equal(f.calls.length,0);assert.equal(f.reads.length,0);assert.equal(f.puts.length,0);
});
test('all ten overdue kinds rotate exactly once without changing existing nine relative order or budget',async t=>{
 const f=await fixture(t,{allKinds:true}),m=f.owner.privateCash;for(const work of [m.publisher,m.nxProducer,m.nxPublisher,m.itemWork,m.historyWork,m.discoveryWork,m.nxArchiveWork])work.nextDue=()=>f.now[0];
 m.recurringWork={active:true,nextDue:()=>f.now[0]};const chosen=[];
 for(let i=0;i<10;i++){f.core.sql.exec('UPDATE api_cash_alarm_mux SET private_at=?,provider_at=? WHERE id=1',f.now[0],f.now[0]);chosen.push(m.chooseAlarm());}
 assert.deepEqual(chosen,['private','public','nx','nx-r2','items','history','discovery','registry','nx-history','provider']);assert.equal(f.calls.length,0);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,0);
});
test('actual owner uses retained successful NULL-lease history, one heavy action/event and no archive raw reread',async t=>{
 const f=await fixture(t),r=f.seedNx();await f.owner.kickScheduledCollection();const events=await f.drain();const p=JSON.parse(f.objects.get(POINTER).body);
 assert.equal(p.rowCount,2);assert.equal(p.receiptWatermarkAt,r.e.capturedAt);assert.equal(f.reads.filter(k=>k===r.key).length,1);assert.equal(f.calls.length,0);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,1);
 assert(events.some(e=>e.status==='archive_owner_bootstrapped'));assert(events.some(e=>e.status==='archive_published'));assert(events.filter(e=>e.eventKind==='nx_history_archive').every(e=>e.providerAttempted===false));assert.equal(await f.alarm(),null);
});
test('mux arm failure before any producer exists retains durable30s retry across reset, without immediate spin',async t=>{
 const f=await fixture(t),m=f.owner.privateCash,arm=m.arm.bind(m);let once=true;m.arm=async()=>{if(once){once=false;throw TypeError('alarm storage');}return arm();};
 const result=await m.runNxHistoryAlarm();assert.equal(result.status,'nx_history_archive_event_retry');const due=f.now[0]+30000;assert.equal(await f.alarm(),due);assert.equal(f.row("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='nx_archive_control'").n,0);
 await f.restart();assert.equal(await f.alarm(),due);assert.equal(f.owner.privateCash.nxArchiveWork.nextDue(),due);assert.equal(f.reads.length,0);assert.equal(f.calls.length,0);
 assert.equal((await f.fire()).status,'archive_owner_bootstrapped');
});
test('actual owner second beforeIO callback failure backs off before archive schema, then resumes safely',async t=>{
 const f=await fixture(t),m=f.owner.privateCash,arm=m.armItemsRecovery.bind(m);let calls=0;m.armItemsRecovery=async until=>{if(++calls===2)throw TypeError('recovery unavailable');return arm(until);};
 const r=await m.runNxHistoryAlarm();assert.equal(r.status,'archive_owner_bootstrap_retry');assert.equal(await f.alarm(),f.now[0]+30000);assert.equal(f.row("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='nx_archive_control'").n,0);
 await f.restart();assert.equal((await f.fire()).status,'archive_owner_bootstrapped');assert.equal(f.calls.length,0);
});
test('auth stop/provider pause/key unavailable cannot block accepted SQL archive or reset charged attempts',async t=>{
 const f=await fixture(t),r=f.seedNx();await f.owner.kickScheduledCollection();for(let i=0;i<10;i++){const e=await f.fire();if(e.eventKind==='private_nx_offers')break;}
 assert.equal(f.row("SELECT state FROM private_nx_captures WHERE receipt_key=?",r.key).state,'complete');f.core.sql.exec('UPDATE api_control SET auth_stopped=1,blocked_until=?,next_allowed=? WHERE id=1',f.now[0]+86400000,f.now[0]+86400000);await f.owner.privateCash.clearProviderAlarm();
 Object.defineProperty(f.env,'MAPLESTORY_MARKET_APPROVED_API_KEY',{configurable:true,get(){throw Error('key forbidden');}});const before=f.row('SELECT COUNT(*) AS n FROM api_attempts').n;await f.restart();await f.drain();
 assert(f.objects.has(POINTER));assert.equal(f.calls.length,0);assert.equal(f.row('SELECT COUNT(*) AS n FROM api_attempts').n,before);assert.equal(f.row('SELECT auth_stopped FROM api_control').auth_stopped,1);assert.equal(f.row('SELECT paused FROM api_cash_provider_recovery').paused,1);
});
test('grantOff and archiveOff preserve staged bytes; same-scope resume uses no removed raw source',async t=>{
 for(const mode of ['grant','archive']){const f=await fixture(t),r=f.seedNx();await f.owner.kickScheduledCollection();for(let i=0;i<30&&!f.row("SELECT name FROM sqlite_master WHERE name='nx_archive_outbox'")?.name;i++)await f.fire();for(let i=0;i<30&&!f.row('SELECT 1 AS n FROM nx_archive_outbox');i++)await f.fire();
  const saved=f.row('SELECT page_body FROM nx_archive_outbox').page_body;f.objects.delete(r.key);const grant=f.env.API_GRANT_JSON;
  if(mode==='grant')f.env.API_GRANT_JSON=JSON.stringify({...JSON.parse(grant),enabled:false});else f.env.API_NX_HISTORY_JSON='{"enabled":false}';await f.restart();
  for(let i=0;i<8&&await f.alarm()!==null;i++)await f.fire();assert.equal(f.row('SELECT page_body FROM nx_archive_outbox').page_body,saved);assert(!f.objects.has(POINTER));
  f.env.API_GRANT_JSON=grant;f.env.API_NX_HISTORY_JSON=JSON.stringify(FLAG);await f.restart();await f.drain();assert(f.objects.has(POINTER));assert.equal(f.reads.filter(k=>k===r.key).length,1);assert.equal(f.calls.length,0);
 }
});
test('private health afterRun hashes new diagnostic exactly while source clock stays original and R2 verification remains unknown',async t=>{
 const f=await fixture(t),r=f.seedNx();await f.owner.kickScheduledCollection();await f.drain();const reads=f.reads.length;await f.owner.privateHealth.afterRun({status:'spacing_wait'});
 const body=JSON.parse(f.objects.get('_private/provider-api/v1/health.json').body),{healthSha256,...unsigned}=body;assert.equal(sha(JSON.stringify(unsigned)),healthSha256);
 const h=body.privateNxHistoryArchive,afterMirror=f.reads.length;assert.deepEqual(h,nxHistoryArchiveHealth(f.core,f.env));assert.equal(h.publishedReceiptWatermarkAt,r.e.capturedAt);assert.equal(h.remoteR2Availability,'not_checked');assert.equal(h.remoteR2ObjectVerified,false);assert.equal(f.reads.length,afterMirror);assert(f.reads.slice(reads).every(k=>k==='_private/provider-api/v1/health.json'));
 f.env.API_NX_HISTORY_JSON='{"enabled":false}';await f.owner.privateHealth.afterRun({status:'spacing_wait'});const off=JSON.parse(f.objects.get('_private/provider-api/v1/health.json').body).privateNxHistoryArchive;assert.equal(off.status,'not_enabled');assert(!JSON.stringify(h).includes('receipts/'));
});
