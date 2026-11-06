import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,receipt,row,HOUR,summary} from './api-private-nx-publication-fixture.mjs';
import {createPublicNxRoute} from '../ops/api-public-nx-routes.mjs';
import {publicNxStatus,validatePublicNx,publicNxSubset,MAX_PUBLIC_NX_BYTES} from '../ops/api-public-nx-contract.mjs';
import {NX_POINTER,MAX_NX_BYTES,byteHash} from '../ops/api-private-nx-projection.mjs';
import {withPreviewGate} from '../ops/preview-gate.mjs';
const FLAG={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:true},req=(options={},path='/api-nx-offers.json')=>new Request('https://inflation.gg'+path,options);
async function setup(t){const f=fixture(t);await f.accept(receipt('nx-rate',1,summary()));await f.accept(receipt('nx-history',2,[row('buy'),row('sell',HOUR,20)],'2026-11-05T22:54:51.939Z'));await f.publish();return{f,env:{API_PUBLIC_NX_JSON:JSON.stringify(FLAG),API_RAW_RECEIPTS:f.bucket}};}

test('defaultOff/invalid route exits before private binding, DO, provider key or grants are inspected',async()=>{
 for(const flag of [undefined,'{"enabled":false}','{"enabled":"true"}',JSON.stringify({...FLAG,extra:true}),JSON.stringify({...FLAG,publicationEnabled:false})]){
  const env={API_PUBLIC_NX_JSON:flag};for(const key of ['API_RAW_RECEIPTS','SNAPSHOTS','API_BUDGET_OWNER','API_GRANT_JSON','MAPLESTORY_MARKET_APPROVED_API_KEY'])Object.defineProperty(env,key,{get(){throw Error('forbidden access');}});
  assert.equal((await createPublicNxRoute()(req(),env)).status,404);
 }
});

test('cold100 concurrent readers share exactly one pointer/object read; independent bodies stay private allowlisted aggregates',async t=>{
 const {f,env}=await setup(t),before=f.reads.length,route=createPublicNxRoute({now:()=>f.now[0]});
 for(const key of ['API_GRANT_JSON','API_BUDGET_OWNER','MAPLESTORY_MARKET_APPROVED_API_KEY'])Object.defineProperty(env,key,{get(){throw Error('no owner/provider path');}});
 const responses=await Promise.all(Array.from({length:100},()=>route(req(),env))),texts=await Promise.all(responses.map(r=>r.text()));assert(responses.every(r=>r.status===200));assert.equal(f.reads.length-before,2);assert(texts.every(x=>x===texts[0]));
 const dto=JSON.parse(texts[0]);validatePublicNx(dto);assert.equal(dto.nativeSummary.reportedWindowHours,8);assert.equal(dto.derived24.hours,24);assert.equal(dto.hourlyHistory.rows.length,2);assert.equal(dto.sourceObservedAt,null);assert.equal(dto.qualifiedIndividualTrades,0);assert.equal(dto.changesHeadlineBenchmark,false);assert.equal(dto.changesGoodsIndex,false);
 assert.equal(responses[0].headers.get('ETag'),'"'+await byteHash(texts[0])+'"');for(const marker of ['_private/','captureId','attemptId','rawResponse','projectionHash','ownerScope','grantReference','sourceCaptureId','steps'])assert(!texts[0].includes(marker));
 const a=JSON.parse(texts[0]),b=JSON.parse(texts[1]);a.hourlyHistory.rows[0].median=999;assert.notEqual(b.hourlyHistory.rows[0].median,999);await route(req(),env);assert.equal(f.reads.length-before,2);
});

test('HEAD/ETag304/unsupported method/query/private paths preserve strict response protocol with no additional storage',async t=>{
 const {f,env}=await setup(t),route=createPublicNxRoute(),r=await route(req(),env),text=await r.text(),n=f.reads.length;
 const head=await route(req({method:'HEAD'}),env);assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('ETag'),r.headers.get('ETag'));
 const notModified=await route(req({headers:{'If-None-Match':r.headers.get('ETag')}}),env);assert.equal(notModified.status,304);assert.equal(await notModified.text(),'');assert.equal(notModified.headers.get('X-Astra-NX-Captured-At'),JSON.parse(text).capturedAt);
 assert.equal((await route(req({method:'POST',body:'do-not-read'}),env)).status,405);assert.equal((await route(req({},'/api-nx-offers.json?key=unused'),env)).status,400);assert.equal(await route(req({},'/_private/provider-api/v1/nx-offer-projection.json'),env),null);assert.equal(f.reads.length,n);
});

test('storage failures retain byte-identical lastgood clocks, while a cold reader fails closed',async t=>{
 const {f,env}=await setup(t),route=createPublicNxRoute({now:()=>f.now[0]}),first=await route(req(),env),text=await first.text();f.now[0]+=30001;f.onGet(()=>{throw new TypeError('synthetic_storage');});
 const retained=await route(req(),env);assert.equal(retained.status,200);assert.equal(retained.headers.get('X-Astra-NX-Mode'),'retained_last_good');assert.equal(await retained.text(),text);assert.equal(retained.headers.get('X-Astra-NX-Captured-At'),first.headers.get('X-Astra-NX-Captured-At'));assert.equal((await createPublicNxRoute()(req(),env)).status,503);
});

test('malformed private pointer and validly rehashed unknown private fields never reach public DTOs',async t=>{
 const {f,env}=await setup(t),original=f.objects.get(NX_POINTER),p=JSON.parse(original.body);f.set(NX_POINTER,JSON.stringify({...p,objectKey:'_private/arbitrary.json'}));const reads=f.reads.length;assert.equal((await createPublicNxRoute()(req(),env)).status,503);assert.deepEqual(f.reads.slice(reads),[NX_POINTER]);f.set(NX_POINTER,original.body);
 const body=JSON.parse(f.objects.get(p.objectKey).body);body.rawActor='SYNTHETIC_SENTINEL';const text=JSON.stringify(body),sha=await byteHash(text),key=p.objectKey.replace(p.objectSha256,sha);f.set(key,text);f.set(NX_POINTER,JSON.stringify({...p,objectKey:key,objectSha256:sha,objectBytes:Buffer.byteLength(text)}));const r=await createPublicNxRoute()(req(),env);assert.equal(r.status,503);assert(!(await r.text()).includes('SYNTHETIC_SENTINEL'));
});

test('generation/clock rollback or same-generation descriptor mutation retains prior verified subset',async t=>{
 const {f,env}=await setup(t),old=f.objects.get(NX_POINTER);await f.accept(receipt('nx-history',3,[row('buy',HOUR,17),row('sell',HOUR,22)],'2026-11-05T23:03:51.939Z'));await f.publish();const route=createPublicNxRoute({now:()=>f.now[0]}),newest=await(await route(req(),env)).text();f.set(NX_POINTER,old.body);f.now[0]+=30001;const kept=await route(req(),env);assert.equal(await kept.text(),newest);assert.equal(kept.headers.get('X-Astra-NX-Mode'),'retained_last_good');
});

test('feature disabled mid-flight cannot expose coalesced/cached body; distinct buckets never share evidence',async t=>{
 const {f,env}=await setup(t);let release,enter;const wait=new Promise(r=>release=r),entered=new Promise(r=>enter=r);f.onGet(async key=>{if(key===NX_POINTER){enter();await wait;}});const route=createPublicNxRoute({now:()=>f.now[0]}),pending=route(req(),env);await entered;env.API_PUBLIC_NX_JSON='{"enabled":false}';release();assert.equal((await pending).status,404);f.onGet(null);env.API_PUBLIC_NX_JSON=JSON.stringify(FLAG);assert.equal((await route(req(),env)).status,503);f.now[0]+=30000;assert.equal((await route(req(),env)).status,200);const other={...env,API_RAW_RECEIPTS:{async get(){return null;}}};assert.equal((await route(req(),other)).status,503);
});

test('outer password gate runs before any new route storage/cache, review and unlocked responses remain private/no-store',async t=>{
 const {f,env}=await setup(t),route=createPublicNxRoute(),handle=withPreviewGate(route),gate={...env,PREVIEW_ACCESS:'password',PREVIEW_PASSWORD:'synthetic',PREVIEW_SESSION_SECRET:'synthetic-session-secret-at-least-thirty-two-characters'};const n=f.reads.length;
 assert.equal((await handle(req(),gate)).status,401);assert.equal(f.reads.length,n);const review=await handle(req(),{...gate,PREVIEW_ACCESS:'review'});assert.equal(review.status,200);assert.equal(review.headers.get('Cache-Control'),'private, no-store, no-transform');assert.equal(review.headers.get('CDN-Cache-Control'),'no-store');
 const login=await handle(req({method:'POST',headers:{Origin:'https://inflation.gg','Content-Type':'application/x-www-form-urlencoded'},body:'password=synthetic'},'/__preview_login'),gate);assert.equal(login.status,303);const cookie=login.headers.get('Set-Cookie').split(';')[0],unlocked=await handle(req({headers:{Cookie:cookie}}),gate);assert.equal(unlocked.status,200);assert.equal(unlocked.headers.get('Cache-Control'),'private, no-store, no-transform');
});

test('bounded1488-row public projection remains below600KB and carries native versus derived counts distinctly',async t=>{
 const f=fixture(t),rows=[];for(let i=0;i<750;i++)for(const side of ['buy','sell'])rows.push(row(side,HOUR-i*3600,side==='buy'?15:20,1));await f.accept(receipt('nx-history',1,rows));await f.publish();const dto=await publicNxSubset((await f.read()).projection),text=JSON.stringify(dto);assert(Buffer.byteLength(text)<MAX_PUBLIC_NX_BYTES);assert.equal(dto.hourlyHistory.rows.length,1488);assert.equal(dto.hourlyHistory.omittedRetainedSourceHourSideRows,12);assert.equal(dto.derived24.sides.buy.posterHourObservations,24);assert.equal(dto.nativeSummary,null);assert.equal(dto.derived24.sides.buy.availableHourBuckets,24);
});


test('many sequential cold failures perform one R2 read per30/60/120/240/300s deadline, never an invented market check clock',async()=>{
 let now=Date.parse('2026-11-06T02:00:00Z'),reads=0;const bucket={async get(){reads++;throw new TypeError('synthetic_sdk_failure');}},env={API_PUBLIC_NX_JSON:JSON.stringify(FLAG),API_RAW_RECEIPTS:bucket},route=createPublicNxRoute({now:()=>now});
 for(const delay of [30000,60000,120000,240000,300000,300000]){
  const count=reads,first=await route(req(),env);assert.equal(first.status,503);assert.equal(reads,count+1);
  assert.equal(first.headers.get('X-Astra-NX-Captured-At'),null);assert.deepEqual(await first.json(),{error:'nx_offers_unavailable',sourceObservedAt:null});
  for(let n=0;n<100;n++)assert.equal((await route(req(),env)).status,503);assert.equal(reads,count+1,'sequential cold requests respect the same failure deadline');
  now+=delay-1;assert.equal((await route(req({method:'HEAD'}),env)).status,503);assert.equal(reads,count+1,'no early retry at deadline-1');now++;
 }
 const before=reads;assert.equal((await route(req(),env)).status,503);assert.equal(reads,before+1,'retry resumes at exact capped deadline');
});

test('cold error burst is singleflight and cooldowns are isolated by bucket; a successful bucket cannot reset another failure',async t=>{
 const {f,env:good}=await setup(t);let calls=0,release,enter;const wait=new Promise(r=>release=r),entered=new Promise(r=>enter=r);let now=f.now[0];const bad={async get(){calls++;enter();await wait;return null;}},env={...good,API_RAW_RECEIPTS:bad},route=createPublicNxRoute({now:()=>now});
 const pending=Array.from({length:100},()=>route(req(),env));await entered;assert.equal(calls,1);release();assert((await Promise.all(pending)).every(r=>r.status===503));for(let n=0;n<20;n++)await route(req(),env);assert.equal(calls,1);
 const before=f.reads.length;assert.equal((await route(req(),good)).status,200);assert.equal(f.reads.length-before,2);assert.equal((await route(req(),env)).status,503);assert.equal(calls,1,'success of another bucket must not clear this failure');now+=30000;await route(req(),env);assert.equal(calls,2);
});

test('lastgood survives increasing failure cooldown with identical bytes/ETag/original clocks; recovery resets the next failure to30s',async t=>{
 const {f,env}=await setup(t),route=createPublicNxRoute({now:()=>f.now[0]}),first=await route(req(),env),text=await first.text(),capture=first.headers.get('X-Astra-NX-Captured-At'),etag=first.headers.get('ETag');
 f.now[0]+=30001;f.onGet(()=>{throw new TypeError('synthetic_failure');});const n=f.reads.length,r1=await route(req(),env);assert.equal(f.reads.length,n+1);assert.equal(r1.headers.get('X-Astra-NX-Mode'),'retained_last_good');
 for(let i=0;i<30;i++){const r=await route(req(),env);assert.equal(await r.text(),text);assert.equal(r.headers.get('ETag'),etag);assert.equal(r.headers.get('X-Astra-NX-Captured-At'),capture);}assert.equal(f.reads.length,n+1);
 f.now[0]+=30000;await route(req(),env);assert.equal(f.reads.length,n+2);f.onGet(null);f.now[0]+=59999;assert.equal((await route(req(),env)).headers.get('X-Astra-NX-Mode'),'retained_last_good');assert.equal(f.reads.length,n+2);
 f.now[0]++;const recovered=await route(req(),env);assert.equal(recovered.headers.get('X-Astra-NX-Mode'),'accepted_cache');assert.equal(await recovered.text(),text);assert.equal(recovered.headers.get('X-Astra-NX-Captured-At'),capture);assert.equal(f.reads.length,n+4);
 // A success resets failures. Next failure is30s rather than the prior120s step.
 f.now[0]+=30001;f.onGet(()=>{throw new TypeError('synthetic_again');});await route(req(),env);const failed=f.reads.length;f.onGet(null);f.now[0]+=29999;await route(req(),env);assert.equal(f.reads.length,failed);f.now[0]++;assert.equal((await route(req(),env)).headers.get('X-Astra-NX-Mode'),'accepted_cache');assert.equal(f.reads.length,failed+2);
});

test('an SDK stall remains one shared read even across five minutes; completion starts one cooldown, not overlapping requests',async()=>{
 let now=Date.parse('2026-11-06T02:00:00Z'),reads=0,release,enter;const wait=new Promise(r=>release=r),entered=new Promise(r=>enter=r),bucket={async get(){reads++;enter();await wait;return null;}},env={API_PUBLIC_NX_JSON:JSON.stringify(FLAG),API_RAW_RECEIPTS:bucket},route=createPublicNxRoute({now:()=>now});
 const pending=[route(req(),env)];await entered;for(let n=0;n<20;n++){now+=30000;pending.push(route(req(),env));}await Promise.resolve();assert.equal(reads,1,'stalled request must not be replaced by elapsed TTL/backoff');release();assert((await Promise.all(pending)).every(r=>r.status===503));for(let n=0;n<20;n++)await route(req(),env);assert.equal(reads,1);now+=30000;await route(req(),env);assert.equal(reads,2);
});

test('disable before or during a retry stays closed without R2 access and cannot bypass a retained cooldown on reenable',async()=>{
 let now=Date.parse('2026-11-06T02:00:00Z'),reads=0,fail=true;const bucket={async get(){reads++;if(fail)return null;throw Error('still synthetic unavailable');}},env={API_PUBLIC_NX_JSON:JSON.stringify(FLAG),API_RAW_RECEIPTS:bucket},route=createPublicNxRoute({now:()=>now});
 assert.equal((await route(req(),env)).status,503);assert.equal(reads,1);env.API_PUBLIC_NX_JSON='{"enabled":false}';const descriptor=Object.getOwnPropertyDescriptor(env,'API_RAW_RECEIPTS');Object.defineProperty(env,'API_RAW_RECEIPTS',{configurable:true,get(){throw Error('binding forbidden while off');}});for(let n=0;n<20;n++)assert.equal((await route(req(),env)).status,404);assert.equal(reads,1);
 Object.defineProperty(env,'API_RAW_RECEIPTS',descriptor);env.API_PUBLIC_NX_JSON=JSON.stringify(FLAG);await route(req(),env);assert.equal(reads,1);now+=30000;
 let enter,release;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);bucket.get=async()=>{reads++;enter();await wait;return null;};const pending=route(req(),env);await entered;env.API_PUBLIC_NX_JSON='{"enabled":false}';release();assert.equal((await pending).status,404);assert.equal(reads,2);env.API_PUBLIC_NX_JSON=JSON.stringify(FLAG);assert.equal((await route(req(),env)).status,503);assert.equal(reads,2,'a disabled retry result still backs off storage safely');
});
