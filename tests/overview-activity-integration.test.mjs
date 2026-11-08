import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{createRequire}from'node:module';import{webcrypto,createHash}from'node:crypto';
import{fullFixture,priceCapture,context,spec}from'./api-index-test-helpers.mjs';import{calculateApiIndexSnapshot}from'../ops/api-index-calculations.mjs';
const require=createRequire(import.meta.url),{JSDOM,VirtualConsole}=require('jsdom'),read=n=>fs.readFileSync(new URL('../'+n,import.meta.url),'utf8'),legacy=JSON.parse(read('dist/data.json')),wire=JSON.parse(read('tests/overview-activity-route-wire.json'));
const fixtureData=await fullFixture(),complete=await calculateApiIndexSnapshot(fixtureData),partial=await calculateApiIndexSnapshot({...fixtureData,priceCapture:await priceCapture(fixtureData.definition,{omit:spec.goods[0].itemId})}),sameValueNewReceipt=await calculateApiIndexSnapshot({...fixtureData,priceCapture:await priceCapture(fixtureData.definition,{ctx:context('prices','2026-11-06T12:01:00.000Z')})});
const flush=()=>new Promise(r=>setImmediate(r));async function until(fn){const end=performance.now()+4000;while(!fn()&&performance.now()<end)await flush();assert(fn(),'actual generated integration did not settle');}
function apiResponse(dto,status=200){const body=JSON.stringify(dto),hash=createHash('sha256').update(body).digest('hex');return new Response(status===200?body:null,{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store, no-transform',ETag:'"api-calculations-'+hash+'"','X-Astra-Calculations-Mode':'accepted_cache','X-Astra-Calculations-Definition-Hash':dto.definitionHash,'X-Astra-Calculations-Prices-Captured-At':dto.sources.prices?.capturedAt??'none','X-Astra-Calculations-Overview-Captured-At':dto.sources.overview?.capturedAt??'none'}});}
function rowResponse(row){return new Response(row.status===304?null:row.body,{status:row.status,headers:row.headers});}
async function fixture(t,{available=true,local=false,localMarker=true,dto=complete,fullApp=true}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));let clock=Date.parse('2026-11-06T12:05:00.000Z'),monotonic=0,hidden=false,online=true,apiStatus=200,dataStatus=200,held=null;
 const dom=new JSDOM(read('web/index.html'),{url:(local?'http://127.0.0.1:8765':'https://inflation.gg')+'/#highlights',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document,calls=[],timers=[],intervals=[];
 if(available)d.body.dataset.apiCalculationsAvailable='true';else delete d.body.dataset.apiCalculationsAvailable;
 if(local&&localMarker)Object.assign(d.body.dataset,{overviewActivityProfile:'overview_window_aggregate_v1',overviewActivityEnabled:'true',overviewActivityEpoch:'activity-public-v1'});
 Object.assign(w,{TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Headers,Request,Response,ReadableStream,structuredClone,AbortController});Object.defineProperty(w.crypto,'subtle',{value:webcrypto.subtle});w.Date.now=()=>clock;w.performance.now=()=>monotonic;w.AbortSignal.timeout=()=>undefined;
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.matchMedia=()=>({matches:true,addEventListener(){}});
 Object.defineProperty(d,'hidden',{get:()=>hidden,configurable:true});Object.defineProperty(w.navigator,'onLine',{get:()=>online,configurable:true});
 const realTimer=w.setTimeout.bind(w),realClear=w.clearTimeout.bind(w);let synthetic=-1;
 w.setTimeout=(fn,ms,...args)=>{timers.push(ms);return ms>=30000?synthetic--:realTimer(fn,ms,...args);};w.clearTimeout=id=>{if(id>=0)realClear(id);};w.setInterval=(fn,ms)=>{intervals.push({fn,ms});return synthetic--;};w.clearInterval=()=>{};
 w.fetch=async(url,options={})=>{const path=String(url);calls.push({path,options});
  if(path===w.location.origin+'/api-market-calculations.json')return apiResponse(dto,apiStatus);
  if(path==='/api-overview-window-activity/profile.json')return rowResponse(wire.profile);
  if(path==='/api-overview-window-activity/current.json'){if(held)return held.promise;if(dataStatus===401||dataStatus===403)return new Response(null,{status:dataStatus});return rowResponse(wire.current);}
  if(path==='version.json')return new Response(JSON.stringify({version:'fixture',data:'data-0123456789abcdef.json'}),{headers:{'Content-Type':'application/json'}});
  if(path==='data-0123456789abcdef.json')return new Response(JSON.stringify(legacy),{headers:{'Content-Type':'application/json'}});
  throw Error('unexpected own-site test route');};
 if(fullApp)w.eval(read('web/community.js'));
 w.eval(read('web/api-calculations.js'));
 if(fullApp){w.eval(read('web/rolling-benchmark-preview.js'));w.eval(read('web/app.js'));w.eval(read('web/market-highlights.js'));}
 if(available)await until(()=>w.AstraApiCalculations.state().evidenceSnapshot!==null);
 await flush();await flush();
 const ui=w.AstraOverviewWindowActivity;
 t.after(()=>{ui.dispose();w.close();});
 return{w,d,ui,calls,errors,timers,intervals,api:w.AstraApiCalculations,overview:()=>calls.filter(c=>c.path.startsWith('/api-overview-window-activity/')),async on(){const b=d.querySelector('[data-overview-activity-toggle]');assert(b);b.click();await until(()=>ui.state().reference!==null);},advance:ms=>clock+=ms,age:ms=>monotonic+=ms,apiStatus:s=>apiStatus=s,dto:v=>dto=v,dataStatus:s=>dataStatus=s,hide(v){hidden=v;d.dispatchEvent(new w.Event('visibilitychange'));},online(v){online=v;w.dispatchEvent(new w.Event(v?'online':'offline'));},route(hash){w.history.replaceState(null,'',hash);w.dispatchEvent(new w.Event('hashchange'));},hold(){let release;const promise=new Promise(r=>release=r);held={promise,release};return async()=>{held=null;release(rowResponse(wire.current));await flush();await flush();};},async shared(){d.getElementById('refresh').click();await flush();await flush();}};
}

test('actual entry defaults Off: absent parent has zeroHTTP/timers; available parent adds no overviewHTTP before explicit toggle',async t=>{
 const a=await fixture(t,{available:false,fullApp:false});assert.equal(a.calls.length,0);assert.equal(a.timers.length,0);assert.equal(a.ui.available,false);assert.equal(a.ui.setEnabled(true),false);
 const f=await fixture(t);assert.equal(f.overview().length,0);assert.equal(f.ui.state().status,'off');assert.equal(f.d.querySelector('[data-overview-activity-toggle]').getAttribute('aria-pressed'),'false');assert.equal(f.intervals.length,1);assert.equal(f.intervals[0].ms,30000);assert.deepEqual(f.errors,[]);
});
test('generated actual app mounts before row facts and typed Source window sums remain separate from legacy totals/model/clocks',async t=>{
 const f=await fixture(t);const before={stats:f.d.getElementById('market-stats').textContent,headline:f.d.getElementById('main-rate').textContent,cpi:f.d.getElementById('main-cpi').textContent,source:f.api.getView().clocks.legacyDaily};await f.on();
 const root=f.d.querySelector('[data-overview-activity]'),facts=f.d.getElementById('highlights-fact-grid');assert(root.parentNode===facts.parentNode);assert(root.compareDocumentPosition(facts)&f.w.Node.DOCUMENT_POSITION_FOLLOWING);
 assert.match(root.textContent,/Recorded-sales counters5/);assert.match(root.textContent,/Reported-unit counters15/);assert.match(root.textContent,/Median × count proxy6.5/);assert.match(root.textContent,/24h reported window; scanned 23h.*previous 22h/);assert.match(root.textContent,/Not since-launch totals or a daily ledger/);
 assert.equal(f.ui.state().reference.source.capturedAt,'2026-11-06T12:00:01.000Z');assert.equal(f.d.getElementById('market-stats').textContent,before.stats);assert.equal(f.d.getElementById('main-rate').textContent,before.headline);assert.equal(f.d.getElementById('main-cpi').textContent,before.cpi);assert.equal(f.api.getView().clocks.legacyDaily,before.source);assert.equal(f.api.overlayReport(legacy).volumeHistory,legacy.volumeHistory);assert.deepEqual(f.errors,[]);
});
test('shared owned check304 and new receipt with identical numerical index refresh window data',async t=>{
 const f=await fixture(t);await f.on();assert.equal(f.overview().length,2);const index=f.api.getView().index;
 f.apiStatus(304);f.advance(60001);await f.shared();await until(()=>f.overview().length===4&&f.ui.state().status==='current');
 f.apiStatus(200);f.dto(sameValueNewReceipt);f.advance(60001);await f.shared();await until(()=>f.api.state().snapshot.snapshotHash===sameValueNewReceipt.snapshotHash&&f.overview().length===6&&f.ui.state().status==='current');assert.equal(f.api.getView().index,index);assert.equal(f.ui.state().reference.source.capturedAt,'2026-11-06T12:00:01.000Z');assert.deepEqual(f.errors,[]);
});
test('actual valid partialAPI50 is not an authorization failure and admits independent window view',async t=>{
 const f=await fixture(t,{dto:partial});assert.equal(f.api.state().blocked,false);assert.equal(f.api.state().snapshot,null);assert.equal(f.api.state().evidenceSnapshot.current.available,false);await f.on();assert.equal(f.ui.state().reference.counterSums.sourceRecordedSalesCounterSumLexeme,'5');assert.equal(f.d.getElementById('main-rate').textContent,'—');assert.deepEqual(f.errors,[]);
});
for(const code of[401,403])test('full parent'+code+' withdraws late held overview and prevents cached quote resurrection',async t=>{
 const f=await fixture(t);await f.on();const release=f.hold();f.advance(60001);await f.shared();await until(()=>f.overview().length===4&&f.ui.state().physicalPending);f.apiStatus(code);f.advance(60001);await f.shared();await until(()=>f.api.state().blocked);
 assert.equal(f.ui.state().reference,null);assert.equal(f.ui.state().physicalPending,true);await release();await until(()=>!f.ui.state().physicalPending);assert.equal(f.ui.state().reference,null);assert.equal(f.ui.state().currentAgainstPublishedPointer,false);assert(!f.d.getElementById('overview-window-activity-data').textContent.includes('Recorded-sales counters5'));assert.deepEqual(f.errors,[]);
});
test('overview route401 clears data and waits for deliberate OffOn after shared checks',async t=>{
 const f=await fixture(t);await f.on();f.dataStatus(401);f.advance(60001);await f.shared();await until(()=>f.ui.state().reference===null);const n=f.overview().length;f.advance(60001);await f.shared();await flush();assert.equal(f.overview().length,n);assert.equal(f.ui.state().currentAgainstPublishedPointer,false);
});
test('Off during held request retains physical lease and ignores late response without another read',async t=>{
 const f=await fixture(t);await f.on();const release=f.hold();f.advance(60001);await f.shared();await until(()=>f.overview().length===4&&f.ui.state().physicalPending);f.ui.setEnabled(false);const n=f.overview().length;f.advance(60001);await f.shared();assert.equal(f.overview().length,n);assert.equal(f.ui.state().reference,null);assert.equal(f.ui.state().physicalPending,true);await release();await until(()=>!f.ui.state().physicalPending);assert.equal(f.ui.state().reference,null);
});
test('hidden/offline/other route pause shared reads and resume on existing lifecycle only',async t=>{
 const f=await fixture(t);await f.on();let n=f.overview().length;f.hide(true);f.advance(60001);await f.shared();assert.equal(f.overview().length,n);assert.equal(f.ui.state().currentAgainstPublishedPointer,false);f.hide(false);await until(()=>f.overview().length>n&&!f.ui.state().physicalPending);n=f.overview().length;
 f.online(false);f.advance(60001);await f.shared();assert.equal(f.overview().length,n);f.online(true);await until(()=>f.overview().length>n&&!f.ui.state().physicalPending);n=f.overview().length;
 f.route('#basket');f.advance(60001);await f.shared();assert.equal(f.overview().length,n);f.route('#highlights');await until(()=>f.overview().length>n&&!f.ui.state().physicalPending);assert.equal(f.intervals.length,1);assert.deepEqual(f.errors,[]);
});
test('existing app30s age tick renders retained evidence with original clocks and zero extraHTTP',async t=>{
 const f=await fixture(t);await f.on();const before=f.ui.state(),n=f.overview().length,timers=f.timers.length;
 f.advance(60001);f.age(30001);f.intervals[0].fn();assert.equal(f.overview().length,n);assert.equal(f.timers.length,timers);assert.equal(f.ui.state().status,'retained');assert.equal(f.ui.state().currentAgainstPublishedPointer,false);assert.equal(f.ui.state().lastVerifiedAt,before.lastVerifiedAt);assert.equal(f.ui.state().reference.source.capturedAt,before.reference.source.capturedAt);assert.match(f.d.querySelector('[data-overview-activity]').textContent,/11-06-2026/);
});
test('local old resident has no marker capability; changed actual marker fences held context',async t=>{
 const absent=await fixture(t,{local:true,localMarker:false});assert.equal(absent.ui.available,false);assert.equal(absent.ui.setEnabled(true),false);assert.equal(absent.overview().length,0);
 const f=await fixture(t,{local:true});await f.on();const release=f.hold();f.advance(60001);await f.shared();await until(()=>f.ui.state().physicalPending);f.d.body.dataset.overviewActivityEpoch='new-public-context';f.ui.afterOwnedCheck();assert.equal(f.ui.state().reference,null);await release();await until(()=>!f.ui.state().physicalPending);assert.equal(f.ui.setEnabled(true),false);assert.match(f.d.querySelector('[data-overview-activity]').textContent,/context changed/);
});
test('native workspace closure withdrawal clears data; forged event detail cannot grant or reenable',async t=>{
 const f=await fixture(t);let verified=true;f.w.AstraPrivateWorkspace=Object.freeze({current:()=>({verified,mode:'private_workspace',expiresAt:f.w.Date.now()+10000})});await f.on();verified=false;f.d.dispatchEvent(new f.w.CustomEvent('astraprivateworkspace',{detail:{verified:true}}));assert.equal(f.ui.state().reference,null);const n=f.overview().length;f.d.dispatchEvent(new f.w.CustomEvent('astramarketsnapshot',{detail:{sourceUpdatedAt:'2026-11-06T12:03:00.000Z'}}));await flush();assert.equal(f.overview().length,n);assert.equal(f.ui.setEnabled(true),false);
});
test('changed native workspace expiry is a context change and cannot admit a held old response',async t=>{
 const f=await fixture(t);let expiry=f.w.Date.now()+1000000;f.w.AstraPrivateWorkspace=Object.freeze({current:()=>({verified:true,mode:'private_workspace',expiresAt:expiry})});await f.on();const release=f.hold();f.advance(60001);await f.shared();await until(()=>f.ui.state().physicalPending);expiry+=1000;f.d.dispatchEvent(new f.w.CustomEvent('astraprivateworkspace',{detail:{verified:true}}));assert.equal(f.ui.state().reference,null);assert.equal(f.ui.state().physicalPending,true);await release();await until(()=>!f.ui.state().physicalPending);assert.equal(f.ui.state().reference,null);f.ui.setEnabled(false);assert.equal(f.ui.setEnabled(true),true);await until(()=>f.ui.state().reference!==null);assert.equal(f.ui.state().reference.source.capturedAt,'2026-11-06T12:00:01.000Z');
});
test('maintained artifact has exact12 publicJS inputs plus explicit accepted stylesheet registration',()=>{
 const m=JSON.parse(read('ui-src/api-calculations/generated-manifest.json'));
 assert.equal(m.buildVersion,'0.28.2');assert.equal(m.inputs.length,12);assert(m.inputs.some(r=>r.path==='ui-src/overview-activity/integration.mjs'));
 assert(m.inputs.every(r=>r.path.startsWith('ui-src/api-calculations/')||r.path.startsWith('ui-src/overview-activity/')||r.path==='ui-src/item-api/reference-status.mjs'||['ops/api-index-public-contract.mjs','ops/api-index-definition-data-v1.json','ops/portable-hash.mjs'].includes(r.path)));
 const css=read(m.style.path).replace(/\r\n?/g,'\n');assert.equal(read(m.style.output),css);assert.equal(createHash('sha256').update(css).digest('hex'),m.style.sha256);assert.equal(Buffer.byteLength(css),m.style.bytes);
 assert.equal(read('web/index.html').split('href="overview-window-activity.css"').length,2);assert.equal(read('engine.py').split("'overview-window-activity.css'").length,2);
});

for(const code of [401,403])test('manual panel'+code+' latches all refresh paths until real OffOn with valid workspace',async t=>{
 const f=await fixture(t);let verified=true;const expiry=f.w.Date.now()+1000000;
 f.w.AstraPrivateWorkspace=Object.freeze({current:()=>({verified,mode:'private_workspace',expiresAt:expiry})});
 await f.on();f.dataStatus(code);f.d.querySelector('#overview-window-activity-data button').click();
 await until(()=>f.ui.state().status==='access_denied'&&!f.ui.state().physicalPending);
 const n=f.overview().length;assert.equal(f.ui.state().reference,null);assert.equal(f.ui.state().currentAgainstPublishedPointer,false);
 f.dataStatus(200);assert.equal(f.ui.setEnabled(true),false);
 const parentDone=new Promise(resolve=>f.d.addEventListener('astracalculationcheck',resolve,{once:true}));
 f.advance(60001);await f.shared();await parentDone;await flush();await flush();
 f.d.dispatchEvent(new f.w.CustomEvent('astramarketsnapshot',{detail:{sourceUpdatedAt:'2026-11-06T12:03:00.000Z'}}));
 f.intervals[0].fn();await flush();assert.equal(f.overview().length,n);assert.equal(f.ui.state().reference,null);
 assert.equal(f.ui.state().status,'access_denied');assert.equal(f.intervals.length,1);
 f.d.querySelector('[data-overview-activity-toggle]').click();assert.equal(f.ui.state().status,'off');assert.equal(f.overview().length,n);
 verified=false;assert.equal(f.ui.setEnabled(true),false);assert.equal(f.overview().length,n);
 verified=true;f.d.querySelector('[data-overview-activity-toggle]').click();await until(()=>f.ui.state().status==='current');
 assert.equal(f.overview().length,n+2);assert.equal(f.ui.state().reference.source.capturedAt,'2026-11-06T12:00:01.000Z');
 const before=f.overview().length;f.dto(sameValueNewReceipt);f.advance(60001);await f.shared();
 await until(()=>f.api.state().snapshot.snapshotHash===sameValueNewReceipt.snapshotHash&&f.overview().length===before+2&&f.ui.state().status==='current');
 assert.equal(f.ui.state().reference.source.capturedAt,'2026-11-06T12:00:01.000Z');assert.deepEqual(f.errors,[]);
});

test('manual Refresh holds physical work across OffOn before admitting the explicitly queued new request',async t=>{
 const f=await fixture(t);await f.on();const release=f.hold();
 f.d.querySelector('#overview-window-activity-data button').click();await until(()=>f.overview().length===4&&f.ui.state().physicalPending);
 const n=f.overview().length;f.ui.setEnabled(false);assert.equal(f.ui.state().reference,null);
 assert.equal(f.ui.setEnabled(true),true);await flush();assert.equal(f.overview().length,n);assert.equal(f.ui.state().physicalPending,true);
 await release();await until(()=>!f.ui.state().physicalPending&&f.ui.state().status==='current');
 assert.equal(f.overview().length,n+2,'explicit On queues a fresh profile/current only after prior physical settlement');assert.deepEqual(f.errors,[]);
});
