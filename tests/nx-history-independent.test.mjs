import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,receipt,row,HOUR} from './nx-history-source-fixture.mjs';
import {archive} from './nx-history-archive-fixture.mjs';
import {POINTER,PREFIX,CANONICAL_SOURCE} from '../ops/nx-history-contract.mjs';
import {createNxHistoryReader} from '../ops/nx-history-reader.mjs';
import {NxHistoryArchiveWork} from '../ops/nx-history-owner-work.mjs';
import {mergeNxArchivedWeeks} from '../browser/nx-history-merge.mjs';
const root='https://inflation.gg';
async function stage(t){const f=fixture(t);await f.accept(receipt());const a=archive(f);for(let i=0;i<30&&!f.row('SELECT 1 AS n FROM nx_archive_outbox');i++)await a.step();assert(f.row('SELECT 1 AS n FROM nx_archive_outbox'));return{f,a};}

test('independent: completed SQL with forged original capture context cannot advance any archive cursor',async t=>{
 const f=fixture(t);await f.accept(receipt());const context=JSON.parse(f.row('SELECT body FROM private_nx_r2_capture_context').body);
 context.attemptId++;context.captureId=context.operation+':'+context.attemptId+':'+context.rawResponseSha256;
 f.sql.exec('UPDATE private_nx_r2_capture_context SET body=?',JSON.stringify(context));const a=archive(f),before=f.puts.length;
 assert.equal((await a.step()).status,'source_indexes_ready');assert.equal((await a.step()).status,'artifact_review');
 assert.equal(f.row('SELECT revision_cursor FROM nx_archive_control').revision_cursor,0);assert.equal(f.row('SELECT COUNT(*) AS n FROM nx_archive_events').n,0);
 assert.equal(f.puts.length,before);assert.equal(a.p.nextDue(),null);assert.equal(f.row('SELECT COUNT(*) AS n FROM private_nx_latest').n,2);
});

test('independent: legacy missing request context uses original accepted capture, never archive wall time',async t=>{
 const f=fixture(t);await f.accept(receipt());f.sql.exec('DELETE FROM private_nx_r2_capture_context');const a=archive(f),rawReads=f.reads.length;
 f.now[0]+=30*86400000;await a.drain();const tree=await a.tree();assert(tree.rows.every(r=>r.capturedAt==='2026-11-05T22:53:51.939Z'));
 assert(tree.rows.every(r=>r.sourceObservedAt===null));assert.equal(tree.manifest.receiptWatermarkAt,'2026-11-05T22:53:51.939Z');
 assert(f.reads.slice(rawReads).every(k=>k===POINTER||k.startsWith(PREFIX)));
});

test('independent: expired old epoch cannot PUT after replacement claim finishes the same staged phase',async t=>{
 const {f,a}=await stage(t);let entered,release,first=true;
 const enteredP=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);
 f.onGet(async k=>{if(first&&k.startsWith(PREFIX)){first=false;entered();await blocked;}});
 const old=a.step();await enteredP;f.now[0]+=130001;const newer=archive(f);assert.equal((await newer.step()).status,'archive_object_written');
 const puts=f.puts.length;release();assert.equal((await old).status,'stale_claim');assert.equal(f.puts.length,puts);
 f.onGet(null);await newer.drain();assert.equal(newer.p.health().publishedGeneration,1);assert.equal((await newer.tree()).rows.length,2);
});

test('independent: pointer CAS null retries saved bytes; no source state or original clocks change',async t=>{
 const {f,a}=await stage(t);await a.step();await a.step();const saved=f.row('SELECT pointer_json FROM nx_archive_outbox').pointer_json;
 const original=f.bucket.put.bind(f.bucket);let once=true;f.bucket.put=async(k,...args)=>{if(k===POINTER&&once){once=false;return null;}return original(k,...args);};
 const events=f.row('SELECT COUNT(*) AS n FROM private_nx_revisions').n;assert.equal((await a.step()).status,'storage_retry');assert.equal(f.objects.has(POINTER),false);
 assert.equal(f.row('SELECT pointer_json FROM nx_archive_outbox').pointer_json,saved);a.restart();assert.equal((await a.step()).status,'backoff');
 f.now[0]+=30000;await a.drain();assert.equal(f.objects.get(POINTER).body,saved);assert.equal(f.row('SELECT COUNT(*) AS n FROM private_nx_revisions').n,events);
 assert.equal((await a.tree()).manifest.receiptWatermarkAt,'2026-11-05T22:53:51.939Z');
});

test('independent: unknown remote pointer ownership quarantines only archive and retains prior source and staged data',async t=>{
 const {f,a}=await stage(t);await a.step();await a.step();const staged=JSON.parse(f.row('SELECT pointer_json FROM nx_archive_outbox').pointer_json);
 f.set(POINTER,JSON.stringify({...staged,generation:staged.generation+1}));const before=f.objects.get(POINTER).body;
 assert.equal((await a.step()).status,'artifact_review');assert.equal(f.objects.get(POINTER).body,before);assert.equal(a.p.nextDue(),null);
 assert(f.row('SELECT 1 AS n FROM nx_archive_outbox'));assert.equal(f.row('SELECT COUNT(*) AS n FROM private_nx_latest').n,2);
});

test('independent: Off during lazy bootstrap recovery callback creates no archive SQL until explicitly resumed',async t=>{
 const f=fixture(t),feature=JSON.stringify({schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:true});
 const env={API_NX_HISTORY_JSON:feature,API_RAW_RECEIPTS:f.bucket};Object.defineProperty(env,'MAPLESTORY_MARKET_APPROVED_API_KEY',{get(){throw Error('key forbidden');}});
 const work=new NxHistoryArchiveWork(f.ctx,env,{getSourceProducer:()=>f.producer,now:()=>f.now[0]});
 await work.drainOne(async()=>{env.API_NX_HISTORY_JSON='{"enabled":false}';});
 assert.equal(work.nextDue(),null);assert.equal(f.sql.exec("SELECT name FROM sqlite_master WHERE name LIKE 'nx_archive_%'").toArray().length,0);
 env.API_NX_HISTORY_JSON=feature;assert.equal((await work.drainOne(async()=>{})).status,'archive_owner_bootstrapped');
 assert.equal(f.reads.length,0);assert.equal(f.puts.length,0);
});

test('independent: synthetic356 legacy observations remain intact beyond selected archive weeks; no headlines or native pools change',()=>{
 const capturedAt='2026-11-05T22:53:51.939Z',legacy=[];
 for(let i=0;i<178;i++)for(const side of ['buy','sell'])legacy.push({at:new Date((HOUR-i*3600)*1000).toISOString().replace('.000Z','Z'),side,rate:15,p25:15,p75:15,sampleCount:3,capturedAt,sourceUrl:CANONICAL_SOURCE,aggregation:'source_published_hourly'});
 const report={smega:legacy,smegaSource:{summary:{windowHours:8}},offerEvidence:{api:{derived24:{hours:24}}},latest:{nxRate:17.086,cpi:156.1},history:[{at:'2026-11-04',cpi:156.1}]},before=JSON.stringify(report);
 const at=new Date((HOUR+3600)*1000).toISOString().replace('.000Z','Z'),row={at,side:'buy',capturedAt:'2026-11-05T23:53:51.939Z',sourceObservedAt:null,low:16,p25:16,median:16,p75:16,high:16,reportedPosterCount:2,statisticsComplete:true,conflict:false};
 const merged=mergeNxArchivedWeeks(report,{rows:[row],weeks:['2026-11-02'],indexHash:'a'.repeat(64),mode:'accepted_cache',archivePublishedRows:1},{enabled:true});
 assert.equal(merged.smega.length,357);assert.equal(merged.smega.filter(r=>r.at!==new Date((HOUR+3600)*1000).toISOString()).length,356);
 assert.equal(JSON.stringify(report),before);assert.equal(merged.latest,report.latest);assert.equal(merged.history,report.history);assert.equal(merged.offerEvidence,report.offerEvidence);assert.equal(merged.smegaSource,report.smegaSource);
});

test('independent: sequential cold failures back off to five minutes, recovery resets, last-good keeps body and original capture',async t=>{
 const f=fixture(t);await f.accept(receipt());const a=archive(f);await a.drain();let failure=true,reads=0;
 const reader=createNxHistoryReader({enabled:true,ttlMs:0,now:()=>f.now[0],bucket:{get(k){reads++;if(failure)throw TypeError('SDK transient');return f.bucket.get(k);}}}),request=()=>reader(new Request(root+'/api-nx-history.json'));
 for(const delay of [30000,60000,120000,240000,300000]){const prior=reads;assert.equal((await request()).status,503);assert.equal(reads,prior+1);for(let n=0;n<30;n++)assert.equal((await request()).status,503);assert.equal(reads,prior+1);f.now[0]+=delay;}
 failure=false;const good=await request(),body=await good.text(),capture=good.headers.get('X-Astra-NX-History-Captured-At');assert.equal(good.status,200);
 failure=true;const prior=reads;f.now[0]++;const stale=await request();assert.equal(await stale.text(),body);assert.equal(stale.headers.get('X-Astra-NX-History-Captured-At'),capture);
 assert.equal(stale.headers.get('X-Astra-NX-History-Mode'),'retained_last_good');f.now[0]+=29999;await request();assert.equal(reads,prior+1);
 f.now[0]++;await request();assert.equal(reads,prior+2);
});
