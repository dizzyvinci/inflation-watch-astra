const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..');
const{JSDOM,VirtualConsole}=require(path.join(project,'node_modules/jsdom'));
const read=p=>fs.readFileSync(path.join(project,p),'utf8');
test('one accepted source generation updates headline, MPI, category cards, prices and event reports atomically',async()=>{
 const{createCalculationRuntime}=await import('../ui-src/api-calculations/runtime.mjs');
 const{fullFixture}=await import('./api-index-test-helpers.mjs');
 const{calculateApiIndexSnapshot}=await import('../ops/api-index-calculations.mjs');
 const{parseApiIndexSnapshot,unpackApiDailyItemHistory}=await import('../ops/api-index-public-contract.mjs');
 const source=await calculateApiIndexSnapshot(await fullFixture()),definition=JSON.parse(read('ops/api-index-definition-data-v1.json'));
 const raw=new TextEncoder().encode(JSON.stringify(source)),digest=Buffer.from(await crypto.subtle.digest('SHA-256',raw)).toString('hex');
 const report=JSON.parse(read('dist/data.json')),before=JSON.stringify(report),events=[],errors=[];
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(read('web/index.html'),{url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,d=w.document;w.matchMedia=()=>({matches:true,addEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.AbortSignal.timeout=()=>undefined;
 w.fetch=async u=>({ok:true,json:async()=>u==='version.json'?{version:'test',data:'data-0123456789abcdef.json'}:report});
 const runtime=createCalculationRuntime({origin:'https://inflation.gg',available:true,definitionHash:source.definitionHash,
  parse:b=>parseApiIndexSnapshot(b,{expectedDefinitionHash:source.definitionHash,expectedRows:definition.goods,expectedCashRows:definition.cash}),unpackDaily:unpackApiDailyItemHistory,
  now:()=>Date.parse('2026-11-06T12:00:03.000Z'),selection:()=>w.AstraRollingBenchmark.getState(),
  fetcher:async()=>new Response(raw,{headers:{ETag:'"api-calculations-'+digest+'"','Content-Type':'application/json','Cache-Control':'private, no-store, no-transform','X-Astra-Calculations-Mode':'accepted_cache','X-Astra-Calculations-Definition-Hash':source.definitionHash,'X-Astra-Calculations-Prices-Captured-At':source.sources.prices.capturedAt,'X-Astra-Calculations-Overview-Captured-At':source.sources.overview.capturedAt}}),
  notify:()=>d.dispatchEvent(new w.CustomEvent('astracalculationchange'))});
 w.AstraApiCalculations=runtime;
 d.addEventListener('astramarketsnapshot',e=>events.push({report:e.detail,rate:d.getElementById('main-rate').textContent,cpi:d.getElementById('main-cpi').textContent}));
 try{
  w.eval(read('web/community.js'));w.eval(read('web/rolling-benchmark-preview.js'));w.eval(read('web/nx-benchmark.js'));w.eval(read('web/rate-arrival.js'));w.eval(read('web/app.js')+';window.__apiHistoryExport=()=>mainHistoryExport(snapshot);window.__apiSourceTick=()=>{renderFreshness();renderSources();};');
  for(let n=0;n<100&&!events.length;n++)await new Promise(r=>setTimeout(r,5));assert(events.length);
  await runtime.refresh();await new Promise(r=>setTimeout(r,20));const final=events.at(-1),view=final.report.apiCalculationView;
  assert(view);assert.equal(view.snapshotHash,source.snapshotHash);assert.equal(final.report.apiDailyItems.length,79);
  assert.equal(final.rate,source.benchmarks.rolling7.rateMesosPerNx.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));assert.equal(final.cpi,source.current.index.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1}));
  assert.equal(d.getElementById('main-rate').textContent,final.rate);assert.equal(d.getElementById('rate-arrival-status').dataset.phase,'latest-api');
  assert.equal(final.report.sourceUpdatedAt,report.sourceUpdatedAt);assert.equal(final.report.history.length,report.history.length);assert.equal(JSON.stringify(report),before);
  assert.match(d.getElementById('basket-table').textContent,/API 3-day median/);assert.match(d.getElementById('basket-table').textContent,/3-day sale-median reference/);assert.match(d.getElementById('notice').textContent,/Broader market activity retains/);
  assert.equal(d.getElementById('rate-kind').dataset.marketAt,source.sources.prices.capturedAt);for(const id of ['method-nx-benchmark','cash-goods-comparison','market-comparison-clock','sources-cards'])if(d.getElementById(id))assert(d.getElementById(id).querySelector('[data-api-calculation-method]'));
  assert.equal(final.report.rows[0].priceDay,null);assert.equal(final.report.rows[0].price,Number(source.current.rows[0].currentSaleMedianLexeme));assert.match(d.getElementById('chart-note').textContent,/separate from retained legacy/);
  w.eval(read('web/price-check.js'));
  const query=d.getElementById('price-check-header-query');query.value=source.current.rows[0].name;query.dispatchEvent(new w.Event('input',{bubbles:true}));
  const currentPriceRows=[...d.querySelectorAll('tr[data-price-key]')].filter(r=>r.textContent.includes(source.current.rows[0].name));assert(currentPriceRows.length);assert(currentPriceRows.some(r=>r.textContent.includes('3-day')));assert(d.getElementById('view-price-check').textContent.includes('Fixed-basket API references: 50/50'));
  w.__apiSourceTick();assert(d.querySelector('#sources-cards [data-api-calculation-method]'));
  const beforeCount=events.length;d.dispatchEvent(new w.Event('astramarkethighlightsready'));assert(events.length>beforeCount);assert.equal(events.at(-1).report.apiCalculationView.snapshotHash,source.snapshotHash);
  const exported=w.__apiHistoryExport();assert(exported.rows.some(row=>row[2].includes('API')&&row[6]===source.sources.prices.capturedAt));assert(exported.rows.filter(row=>row[2].includes('retained legacy')).every(row=>row[6]===null&&row[7]===null));
  w.AstraRollingBenchmark.setWindowDays(3);assert.equal(events.at(-1).report.apiCalculationView.headline.windowDays,3);
  assert.match(d.querySelector('#method-nx-benchmark [data-nx-model-formula]').textContent,/previous 3 complete source-calendar days/);
  assert.match(d.querySelector('#method-nx-benchmark .nx-benchmark-status').textContent,/not trade times/);
  w.AstraRollingBenchmark.setMode('fixed');assert.equal(events.at(-1).report.apiCalculationView.headline.mode,'fixed');assert.equal(events.at(-1).rate,source.benchmarks.fixed.rateMesosPerNx.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
  for(const days of [3,7]){w.AstraRollingBenchmark.setWindowDays(days);w.AstraRollingBenchmark.setMode('compare');const h=runtime.headline();assert.equal(h.rate,source.benchmarks.fixed.rateMesosPerNx);assert.equal(h.changePercent,source.current.index-100);assert.equal(d.getElementById('main-rate').textContent,events.at(-1).rate);assert.match(d.querySelector('#method-nx-benchmark [data-nx-model-formula]').textContent,/Frozen reference NX rate/);assert.equal(runtime.sourceSeries('nx').length,2);}
  d.querySelector('[data-rate-arrival-style="still"]').click();assert.equal(d.getElementById('main-rate').textContent,source.benchmarks.fixed.rateMesosPerNx.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));assert.match(d.getElementById('rate-arrival-status').textContent,/capture history is session-only/);
  assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
