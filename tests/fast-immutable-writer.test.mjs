import test from'node:test';import assert from'node:assert/strict';
import{RecurringItemRegistry}from'../ops/item-recurring-registry.mjs';
import{FastCurrentRegistrySink}from'../ops/api-fast-current-owner.mjs';
import{FastCurrentImmutableWriter,FAST_OBJECT_PREFIX,FAST_WRITE_LIMITS}from'../ops/api-fast-current-immutable-writer.mjs';
import{fixture,receipt,sources,grant,raw,sha}from'./api-private-item-fixture.mjs';
const noIO=async()=>{};
async function staged(t,{count=2}={}){
 const f=await fixture(t),r=new RecurringItemRegistry(f.ctx,f.core,{enabled:true,isEnabled:()=>f.on[0],loaderFactory:()=>({load:async()=>({status:'ready',sources:sources()})})}),sink=new FastCurrentRegistrySink(f.ctx,f.core,r,{enabled:true});r.setFastCurrentSink(sink);assert.equal((await r.drainOne(noIO)).status,'registry_metadata_ready');
 const row=JSON.parse(raw)[0],body=count===2?raw:JSON.stringify(Array.from({length:count},(_,i)=>({...row,item_id:2000000+i}))),rec=receipt(1,body);f.seed(rec);const key='synthetic-prices-1';f.exec("UPDATE api_jobs SET state='running',attempt_id=1,attempts=1 WHERE job_key=?",key);assert.equal(f.core.finish({job_key:key,attempt_id:1,attempts:1,operation:'prices'},f.core.config(),{kind:'success',receiptKey:rec.key,capturedAt:rec.value.capturedAt}).status,'success');assert.equal(f.row('SELECT attempt_id FROM api_jobs WHERE job_key=?',key).attempt_id,null);r.reconcile();assert.equal((await r.drainOne(noIO)).status,'registry_capture_accepted');
 const bucket=f.env.API_RAW_RECEIPTS,get=bucket.get.bind(bucket);bucket.get=async key=>{const v=await get(key);if(!v)return v;const s=await v.text();return{...v,body:new Response(s).body}};
 const on=[true],make=()=>new FastCurrentImmutableWriter(f.ctx,f.core,sink,{enabled:true,isEnabled:()=>on[0]}),writer=make();assert.equal(writer.reconcile().queued,1);f.reads.length=0;f.puts.length=0;return{f,r,sink,writer,make,on,rec};
}
async function finish(x,max=30){for(let i=0;i<max;i++){const s=await x.writer.drainOne(noIO);if(s.status==='fast_immutable_graph_written')return s;assert.equal(s.status,'fast_immutable_shards_written')}throw Error('bounded fixture did not finish')}

test('defaultOff touches no ownership/getter/SQL/bucket or scheduling',()=>{const trap=new Proxy({},{get(){assert.fail('off touched authority')}}),w=new FastCurrentImmutableWriter(trap,trap,trap);assert.equal(w.active,false);assert.equal(w.nextDue(),null);assert.equal(w.defer(),null);assert.deepEqual(w.health(),{enabled:false,status:'disabled'})});
test('real finished source stages and writes exact immutable graph without identity generation, extra raw read or pointer',async t=>{
 const x=await staged(t),{f,w}=x,stage=f.row('SELECT * FROM fast_current_outbox'),before=f.row('SELECT COUNT(*)n FROM api_attempts').n;await finish(x);
 const m=JSON.parse(stage.manifest_json);assert.equal(f.objects.get(FAST_OBJECT_PREFIX+'manifests/'+stage.manifest_sha+'.json').body,stage.manifest_json);
 for(const d of m.shards){const sql=f.row('SELECT body FROM fast_current_shards WHERE slot=? AND shard_index=?',stage.slot,d.index).body;assert.equal(f.objects.get(FAST_OBJECT_PREFIX+'shards/'+d.sha256+'.json').body,sql)}
 assert(f.puts.every(k=>k.startsWith(FAST_OBJECT_PREFIX)&&!k.endsWith('/current.json')));assert.equal(f.reads.length,0);assert.equal(f.row('SELECT COUNT(*)n FROM api_attempts').n,before);assert.equal(f.row('SELECT replay_verified FROM fast_current_outbox').replay_verified,0);assert.equal(f.row('SELECT current_slot,recovery_slot FROM fast_current_control').current_slot,null);assert.equal(x.writer.health().currentPointerPublished,false);assert.equal(x.writer.health().remoteGraphIndependentlyVerified,false);assert.equal(x.writer.nextDue(),null);assert.equal(m.source.retrievedAt,x.rec.value.capturedAt);
});
test('each multishard event writes at most4 objects/1MiB and source clocks stay original',async t=>{
 const x=await staged(t,{count:320}),m=JSON.parse(x.f.row('SELECT manifest_json FROM fast_current_outbox').manifest_json);assert(m.shards.length>4);let actions=0;
 while(x.writer.nextDue()!==null){const before=x.f.puts.length,r=await x.writer.drainOne(noIO),added=x.f.puts.slice(before);assert(added.length<=4);if(r.status==='fast_immutable_shards_written'){assert(r.bytes<=1048576);assert(r.objects<=4)}else assert.equal(r.status,'fast_immutable_graph_written');assert.equal(r.sourceRetrievedAt,x.rec.value.capturedAt);actions++;assert(actions<=Math.ceil(m.shards.length/4)+1)}
 assert.equal(actions,Math.ceil(m.shards.length/4)+1);
});
test('recovery is durably armed before any PUT and rejecting arm causes no storage call',async t=>{
 const x=await staged(t);assert.equal((await x.writer.drainOne(async()=>{throw Error('storage alarm unavailable')})).status,'fast_writer_retry');assert.equal(x.f.puts.length,0);assert(x.writer.nextDue()>x.f.now[0]);
 x.f.now[0]=x.writer.nextDue();let armed=0;await x.writer.drainOne(async at=>{armed++;assert(at>x.f.now[0]);assert.equal(x.f.row('SELECT state FROM fast_current_write_jobs').state,'running');assert.equal(x.f.puts.length,0)});assert.equal(armed,1);
});
test('failed PUT retries same staged bytes without source reread or provider reattempt',async t=>{
 const x=await staged(t);x.f.fail((kind,key)=>kind==='put'&&key.startsWith(FAST_OBJECT_PREFIX));assert.equal((await x.writer.drainOne(noIO)).status,'fast_writer_retry');assert.equal(x.f.row('SELECT next_index FROM fast_current_write_jobs').next_index,0);x.f.fail(null);x.f.now[0]=x.writer.nextDue();await finish(x);assert.equal(x.f.reads.length,0);assert.equal(x.f.row('SELECT COUNT(*)n FROM api_attempts').n,1);
});
test('lost write ack is verified using only same immutable key and cannot overwrite conflict',async t=>{
 const x=await staged(t),bucket=x.f.env.API_RAW_RECEIPTS,put=bucket.put.bind(bucket);let once=true;bucket.put=async(...args)=>{const r=await put(...args);if(once){once=false;throw Error('ack lost')}return r};
 assert.equal((await x.writer.drainOne(noIO)).status,'fast_writer_retry');x.f.now[0]=x.writer.nextDue();await finish(x);assert.equal(x.f.reads.length,1);assert(x.f.reads[0].startsWith(FAST_OBJECT_PREFIX));
 const y=await staged(t),m=JSON.parse(y.f.row('SELECT manifest_json FROM fast_current_outbox').manifest_json),key=FAST_OBJECT_PREFIX+'shards/'+m.shards[0].sha256+'.json';y.f.objects.set(key,{body:'conflict',etag:'foreign'});assert.equal((await y.writer.drainOne(noIO)).status,'fast_writer_review');assert.equal(y.f.objects.get(key).body,'conflict');assert.equal(y.f.row('SELECT state FROM fast_current_write_jobs').state,'review');assert.equal(y.writer.nextDue(),null);
});
test('restart preserves written progress and never rerequests raw or an acknowledged shard',async t=>{
 const x=await staged(t,{count:320});assert.equal((await x.writer.drainOne(noIO)).status,'fast_immutable_shards_written');const next=x.f.row('SELECT next_index FROM fast_current_write_jobs').next_index;assert.equal(next,4);const old=x.writer;x.writer=x.make();assert.equal(old.active,false);await finish(x);assert.equal(new Set(x.f.puts).size,x.f.puts.length);assert.equal(x.f.reads.length,0);assert.equal(x.f.row('SELECT COUNT(*)n FROM api_attempts').n,1);
});
test('Off/grantOff/authstop pause with no spin or body loss and On resumes',async t=>{
 const x=await staged(t),body=x.f.row('SELECT body FROM fast_current_shards WHERE shard_index=0').body;
 for(const mutate of [()=>{x.on[0]=false;return()=>x.on[0]=true},()=>{x.f.env.API_GRANT_JSON=JSON.stringify({...grant,enabled:false});return()=>x.f.env.API_GRANT_JSON=JSON.stringify(grant)},()=>{x.f.exec('UPDATE api_control SET auth_stopped=1');return()=>x.f.exec('UPDATE api_control SET auth_stopped=0')}]){const restore=mutate();assert.equal(x.writer.nextDue(),null);assert.equal((await x.writer.drainOne(noIO)).status,'disabled');assert.equal(x.f.puts.length,0);restore();}
 await finish(x);assert.equal(x.f.row('SELECT body FROM fast_current_shards WHERE shard_index=0').body,body);
});
test('tampered attempt/source, shard or manifest is artifact review, never raw quarantine or path injection',async t=>{
 for(const change of [x=>x.f.exec('UPDATE api_attempts SET at=at+1'),x=>x.f.exec("UPDATE fast_current_shards SET body='corrupt'"),x=>x.f.exec("UPDATE fast_current_outbox SET manifest_json='{}'")]){const x=await staged(t);change(x);assert.equal((await x.writer.drainOne(noIO)).status,'fast_writer_review');assert.equal(x.f.puts.length,0);assert.equal(x.f.row('SELECT state FROM api_jobs').state,'complete');assert.equal(x.f.row('SELECT state FROM recurring_registry_jobs').state,'complete');assert.equal(x.writer.nextDue(),null)}
});
test('mutating source after awaited durable arm blocks NEW PUT and retains unacknowledged stage',async t=>{
 const x=await staged(t);assert.equal((await x.writer.drainOne(async()=>{x.f.exec('UPDATE api_attempts SET at=at+1')})).status,'fast_writer_review');assert.equal(x.f.puts.length,0);assert.equal(x.f.row('SELECT next_index FROM fast_current_write_jobs').next_index,0);
});
test('whole-drain deadline settles a held physical PUT and same-instance retry cannot duplicate it',async t=>{
 const x=await staged(t);t.mock.timers.enable({apis:['setTimeout']});let enter,release,once=true;const started=new Promise(r=>enter=r),wait=new Promise(r=>release=r);
 x.f.hook(async(kind,key)=>{if(kind==='put'&&key.startsWith(FAST_OBJECT_PREFIX)&&once){once=false;enter();await wait}});
 const pending=x.writer.drainOne(noIO);await started;t.mock.timers.tick(30000);assert.equal((await pending).status,'fast_writer_retry');assert.equal(x.writer.health().physicalIoPending,1);assert.equal((await x.writer.drainOne(noIO)).status,'physical_io_pending');assert.equal(x.f.puts.length,1);assert(x.writer.nextDue()>=x.f.now[0]+30000);
 release();await new Promise(r=>setImmediate(r));assert.equal(x.f.row('SELECT next_index FROM fast_current_write_jobs').next_index,0);x.f.hook(null);x.f.now[0]=x.writer.nextDue();await finish(x);assert.equal(x.writer.health().written,1);
});
test('same SQL newer writer can finish before an old held operation settles; late callback cannot acknowledge or overwrite mutable state',async t=>{
 const x=await staged(t);t.mock.timers.enable({apis:['setTimeout']});let enter,release,once=true;const started=new Promise(r=>enter=r),wait=new Promise(r=>release=r);
 x.f.hook(async(kind,key)=>{if(kind==='put'&&key.startsWith(FAST_OBJECT_PREFIX)&&once){once=false;enter();await wait}});
 const old=x.writer,pending=old.drainOne(noIO);await started;t.mock.timers.tick(30000);assert.equal((await pending).status,'fast_writer_retry');x.f.now[0]+=130001;x.writer=x.make();await finish(x);const before=x.f.row('SELECT * FROM fast_current_write_jobs');release();await new Promise(r=>setImmediate(r));assert.deepEqual(x.f.row('SELECT * FROM fast_current_write_jobs'),before);assert.equal(old.active,false);assert.equal(x.writer.health().written,1);assert(!x.f.puts.some(k=>k.endsWith('/current.json')));
});
test('Off while an immutable PUT is pending permits no subsequent PUT or progress acknowledgement',async t=>{
 const x=await staged(t);let enter,release;const started=new Promise(r=>enter=r),wait=new Promise(r=>release=r);x.f.hook(async(kind,key)=>{if(kind==='put'&&key.startsWith(FAST_OBJECT_PREFIX)){enter();await wait}});
 const pending=x.writer.drainOne(noIO);await started;x.on[0]=false;release();assert.equal((await pending).status,'disabled');assert.equal(x.f.puts.length,1);assert.equal(x.f.row('SELECT next_index FROM fast_current_write_jobs').next_index,0);assert.equal(x.writer.nextDue(),null);
 x.f.hook(null);x.on[0]=true;x.f.now[0]+=130001;await finish(x);assert.equal(x.writer.health().written,1);
});
test('disabled prerequisite facade never creates writer tables or crashes defer/reconcile',async t=>{
 const f=await fixture(t),sink=new FastCurrentRegistrySink(f.ctx,f.core,{},{}),w=new FastCurrentImmutableWriter(f.ctx,f.core,sink,{enabled:true});assert.equal(w.active,false);assert.equal(w.defer(),null);assert.equal(w.nextDue(),null);assert.deepEqual(w.reconcile(),{status:'disabled',queued:0});assert.equal((await w.drainOne(noIO)).status,'disabled');assert.equal(f.row("SELECT COUNT(*)n FROM sqlite_master WHERE name LIKE 'fast_current_write_%'").n,0);
});
test('invalid write-job metadata becomes a durable review hold, not an immediate retry spin',async t=>{
 const x=await staged(t);x.f.exec("UPDATE fast_current_write_jobs SET phase='not-a-phase'");assert.equal((await x.writer.drainOne(noIO)).status,'fast_writer_review');assert.equal(x.f.row('SELECT state FROM fast_current_write_jobs').state,'review');assert.equal(x.writer.nextDue(),null);assert.equal(x.f.puts.length,0);
});
test('declared spool accounting cannot bypass physical staged byte reservation',async t=>{
 const x=await staged(t);x.f.exec('UPDATE fast_current_outbox SET spool_bytes=1');assert.equal((await x.writer.drainOne(noIO)).status,'fast_writer_review');assert.equal(x.f.puts.length,0);assert.equal(x.f.row('SELECT state FROM fast_current_write_jobs').state,'review');
});
test('malformed future retry is explicit diagnostic review and no due-spin; reconcile persists hold',async t=>{
 const x=await staged(t);x.f.exec("UPDATE fast_current_write_jobs SET retry_at='private-invalid-clock'");assert.equal(x.writer.nextDue(),null);assert.equal(x.writer.health().status,'fast_writer_review');x.writer.reconcile();assert.equal(x.f.row('SELECT state FROM fast_current_write_jobs').state,'review');assert.equal(x.f.puts.length,0);assert.doesNotMatch(JSON.stringify(x.writer.health()),/private-invalid-clock/);
});
test('ready stage without durable registry commit or membership proof cannot authorize writes',async t=>{
 for(const change of [x=>x.f.exec("UPDATE recurring_registry_jobs SET state='pending'"),x=>x.f.exec('DELETE FROM recurring_registry_captures'),x=>x.f.exec("UPDATE recurring_registry_sets SET ids_json='[1082000]'"),x=>x.f.exec('UPDATE recurring_registry_captures SET id_count=id_count+1')]){const x=await staged(t);change(x);assert.equal((await x.writer.drainOne(noIO)).status,'fast_writer_review');assert.equal(x.f.puts.length,0);assert.equal(x.writer.nextDue(),null);assert.equal(x.f.row('SELECT state FROM api_jobs').state,'complete')}
});
test('timed-out non-SDK await also retains one underlying action instead of accumulating retries',async t=>{
 const x=await staged(t);t.mock.timers.enable({apis:['setTimeout']});let enter,release;const started=new Promise(r=>enter=r),wait=new Promise(r=>release=r);
 const pending=x.writer.drainOne(async()=>{enter();await wait});await started;t.mock.timers.tick(30000);assert.equal((await pending).status,'fast_writer_retry');assert.equal(x.writer.health().physicalIoPending,0);assert.equal(x.writer.health().underlyingActionPending,true);assert.equal((await x.writer.drainOne(noIO)).status,'underlying_action_pending');assert.equal(x.f.puts.length,0);
 release();await new Promise(r=>setImmediate(r));assert.equal(x.writer.health().underlyingActionPending,false);assert.equal(x.f.puts.length,0);x.f.now[0]=x.writer.nextDue();await finish(x);
});
test('writer never consults slow item/discovery identity generations after accepted staging',async t=>{
 const x=await staged(t),exec=x.f.core.sql.exec;x.f.core.sql.exec=(q,...a)=>{assert.doesNotMatch(q,/private_item_|discovery_|identity|metadata/i);return exec(q,...a)};try{await finish(x)}finally{x.f.core.sql.exec=exec}
 assert.equal(x.f.reads.length,0);assert.equal(x.writer.health().written,1);
});
test('foreign owner construction and mid-await bucket rebinding cannot authorize private writes',async t=>{
 const x=await staged(t);assert.throws(()=>new FastCurrentImmutableWriter({},x.f.core,x.sink,{enabled:true}),/same_owner/);let calls=0;
 const original=x.f.env.API_RAW_RECEIPTS;assert.equal((await x.writer.drainOne(async()=>{x.f.env.API_RAW_RECEIPTS={get(){calls++;throw Error('foreign')},put(){calls++;throw Error('foreign')}}})).status,'disabled');assert.equal(calls,0);assert.equal(x.f.puts.length,0);x.f.env.API_RAW_RECEIPTS=original;x.f.now[0]+=130001;await finish(x);
});

test('damaged impossible progress cannot skip shards or claim a complete graph',async t=>{
 for(const mutate of [
 x=>x.f.exec("UPDATE fast_current_write_jobs SET phase='manifest',next_index=?",JSON.parse(x.f.row('SELECT manifest_json FROM fast_current_outbox').manifest_json).shards.length),
 x=>x.f.exec('UPDATE fast_current_write_jobs SET next_index=1'),
 x=>x.f.exec('UPDATE fast_current_write_jobs SET first_write_at=?',x.f.now[0]),
 x=>x.f.exec('UPDATE fast_current_write_jobs SET graph_written_at=?',x.f.now[0]),
 x=>x.f.exec("UPDATE fast_current_write_jobs SET phase='manifest',next_index=500,first_write_at=?",x.f.now[0]),
 x=>x.f.exec("UPDATE fast_current_write_jobs SET phase='manifest',next_index=1,first_write_at=?",x.f.now[0]+1)
 ]){const x=await staged(t);mutate(x);assert.equal((await x.writer.drainOne(noIO)).status,'fast_writer_review');assert.equal(x.f.puts.length,0);assert.equal(x.f.row('SELECT state FROM fast_current_write_jobs').state,'review');assert.equal(x.writer.health().written??0,0);assert.equal(x.writer.nextDue(),null)}
});
test('actual acknowledged progress remains resumable with exact original clocks and separate manifest action',async t=>{
 const x=await staged(t);assert.equal((await x.writer.drainOne(noIO)).status,'fast_immutable_shards_written');const row=x.f.row('SELECT * FROM fast_current_write_jobs');assert.equal(row.phase,'manifest');assert(row.next_index>0);assert.equal(row.first_write_at,x.f.now[0]);assert.equal(row.graph_written_at,null);x.writer=x.make();const old=x.f.puts.length;assert.equal((await x.writer.drainOne(noIO)).status,'fast_immutable_graph_written');assert.equal(x.f.puts.length,old+1);assert.equal(x.writer.health().written,1);
});


test('reachable last-shard ACK then phase-release SQL failure resumes manifest after owner restart',async t=>{
 const x=await staged(t),sql=x.f.core.sql,exec=sql.exec;let once=true;sql.exec=(q,...a)=>{if(once&&q.startsWith("UPDATE fast_current_write_jobs SET state='pending',phase=?")){once=false;throw Error('synthetic phase release failure')}return exec(q,...a)};
 try{assert.equal((await x.writer.drainOne(noIO)).status,'fast_writer_retry')}finally{sql.exec=exec}
 const m=JSON.parse(x.f.row('SELECT manifest_json FROM fast_current_outbox').manifest_json),j=x.f.row('SELECT * FROM fast_current_write_jobs');assert.equal(j.phase,'manifest');assert.equal(j.next_index,m.shards.length);assert.notEqual(j.first_write_at,null);assert.equal(j.graph_written_at,null);assert(m.shards.every(d=>x.f.objects.has(FAST_OBJECT_PREFIX+'shards/'+d.sha256+'.json')));assert.equal(x.f.puts.filter(k=>k.includes('/manifests/')).length,0);
 const source=j.captured_at,puts=x.f.puts.length;x.f.now[0]=x.writer.nextDue();x.writer=x.make();assert.equal((await x.writer.drainOne(noIO)).status,'fast_immutable_graph_written');assert.equal(x.f.puts.length,puts+1);assert.equal(x.writer.health().written,1);assert.equal(x.f.row('SELECT captured_at FROM fast_current_write_jobs').captured_at,source);assert.equal(x.f.row('SELECT COUNT(*)n FROM api_attempts').n,1);
});
test('atomic shard ACK SQL failure preserves empty progress and same-key lost-ACK verification on restart',async t=>{
 const x=await staged(t),sql=x.f.core.sql,exec=sql.exec;let once=true;sql.exec=(q,...a)=>{if(once&&q.startsWith('UPDATE fast_current_write_jobs SET next_index=')){once=false;throw Error('synthetic atomic ack failure')}return exec(q,...a)};
 try{assert.equal((await x.writer.drainOne(noIO)).status,'fast_writer_retry')}finally{sql.exec=exec}
 const j=x.f.row('SELECT * FROM fast_current_write_jobs');assert.equal(j.phase,'shards');assert.equal(j.next_index,0);assert.equal(j.first_write_at,null);assert.equal(j.graph_written_at,null);assert.equal(x.f.puts.length,1);assert.equal(x.f.reads.length,0);
 x.f.now[0]=x.writer.nextDue();x.writer=x.make();await finish(x);assert.equal(x.writer.health().written,1);assert.equal(x.f.reads.length,1);assert(x.f.reads[0].startsWith(FAST_OBJECT_PREFIX+'shards/'));assert.equal(x.f.row('SELECT COUNT(*)n FROM api_attempts').n,1);assert.equal(x.f.row('SELECT captured_at FROM fast_current_write_jobs').captured_at,x.rec.value.capturedAt);
});
test('partial-batch release SQL failure preserves acknowledged cursor and resumes without duplicate objects',async t=>{
 const x=await staged(t,{count:320}),sql=x.f.core.sql,exec=sql.exec;let once=true;sql.exec=(q,...a)=>{if(once&&q.startsWith("UPDATE fast_current_write_jobs SET state='pending',phase=?")){once=false;throw Error('synthetic batch release failure')}return exec(q,...a)};
 try{assert.equal((await x.writer.drainOne(noIO)).status,'fast_writer_retry')}finally{sql.exec=exec}
 const j=x.f.row('SELECT * FROM fast_current_write_jobs'),m=JSON.parse(x.f.row('SELECT manifest_json FROM fast_current_outbox').manifest_json);assert.equal(j.phase,'shards');assert.equal(j.next_index,4);assert(m.shards.length>4);assert.notEqual(j.first_write_at,null);assert.equal(x.f.puts.length,4);x.f.now[0]=x.writer.nextDue();x.writer=x.make();await finish(x);assert.equal(new Set(x.f.puts).size,x.f.puts.length);assert.equal(x.f.reads.length,0);assert.equal(x.writer.health().written,1);
});

test('actual SQLite abort trigger on atomic cursor update rolls all progress fields back then safely verifies existing bytes',async t=>{
 const x=await staged(t);x.f.exec("CREATE TEMP TRIGGER fast_review_abort_ack BEFORE UPDATE OF next_index ON fast_current_write_jobs BEGIN SELECT RAISE(ABORT,'synthetic_sqlite_ack_abort'); END");assert.equal((await x.writer.drainOne(noIO)).status,'fast_writer_retry');const j=x.f.row('SELECT * FROM fast_current_write_jobs');assert.equal(j.phase,'shards');assert.equal(j.next_index,0);assert.equal(j.first_write_at,null);assert.equal(x.f.puts.length,1);x.f.exec('DROP TRIGGER fast_review_abort_ack');x.f.now[0]=x.writer.nextDue();x.writer=x.make();await finish(x);assert.equal(x.writer.health().written,1);assert.equal(x.f.reads.length,1);assert.equal(x.f.row('SELECT captured_at FROM fast_current_write_jobs').captured_at,x.rec.value.capturedAt);
});
test('actual SQLite phase-release abort after last ACK preserves atomic manifest-ready progress across restart',async t=>{
 const x=await staged(t);x.f.exec("CREATE TEMP TRIGGER fast_review_abort_release BEFORE UPDATE OF phase ON fast_current_write_jobs WHEN NEW.state='pending' AND NEW.phase='manifest' BEGIN SELECT RAISE(ABORT,'synthetic_sqlite_release_abort'); END");assert.equal((await x.writer.drainOne(noIO)).status,'fast_writer_retry');const j=x.f.row('SELECT * FROM fast_current_write_jobs'),m=JSON.parse(x.f.row('SELECT manifest_json FROM fast_current_outbox').manifest_json);assert.equal(j.phase,'manifest');assert.equal(j.next_index,m.shards.length);assert.notEqual(j.first_write_at,null);assert.equal(j.graph_written_at,null);x.f.exec('DROP TRIGGER fast_review_abort_release');x.f.now[0]=x.writer.nextDue();x.writer=x.make();assert.equal((await x.writer.drainOne(noIO)).status,'fast_immutable_graph_written');assert.equal(x.writer.health().written,1);assert.equal(x.f.reads.length,0);assert.equal(new Set(x.f.puts).size,x.f.puts.length);
});
