const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{webcrypto,createHash}=require('node:crypto');
const project=process.env.ASTRA_TEST_PROJECT?path.resolve(process.env.ASTRA_TEST_PROJECT):path.resolve(__dirname,'..'),appPath=process.env.ASTRA_TEST_APP||path.join(project,'web/app.js');
const {JSDOM,VirtualConsole}=require(path.join(project,'node_modules/jsdom')),read=p=>fs.readFileSync(path.join(project,p),'utf8'),load=p=>import(pathToFileURL(path.join(project,p)).href),tick=()=>new Promise(r=>setTimeout(r,5));
async function cashDto({missing=0,scale=1,capturedAt='2026-11-06T12:00:01.000Z'}={}){
 const{project:projectCash}=await load('ops/api-cash-projection.mjs'),{publicCashSubset}=await load('ops/api-public-cash-subset.mjs'),binding=JSON.parse(read('ops/api-cash-bindings-v1.json'));
 const inputs={schemaVersion:1,kind:'private_validated_api_cash_median_inputs',sourceUrl:'https://maplestory.market/api/prices',rawResponseSha256:'a'.repeat(64),rawResponseBytes:1000,requestStartedAt:new Date(Date.parse(capturedAt)-1000).toISOString(),capturedAt,sourceObservedAt:null,priceField:'sold.median_unit_price',weightField:'sold.sales',...binding,sourceRows:binding.targets.slice(missing).map((t,i)=>({itemId:t.itemId,saleMedianMesos:t.fixedNxCost*(10+i*.7)*scale,recordedSales:5+i}))};
 return publicCashSubset(await projectCash(inputs,'v6kkdvp6'),{enabled:true});
}
function cashResponse(dto,mode='accepted_cache'){const text=JSON.stringify(dto);return new Response(text,{headers:{'Content-Type':'application/json',ETag:'"'+createHash('sha256').update(text).digest('hex')+'"','X-Astra-Cash-Phase':'published_subset','X-Astra-Cash-Mode':mode,'X-Astra-Cash-Captured-At':dto.capturedAt}});}
async function fixture({available=true,refreshGoods=true,cash=true,goodsMode='good',cashMissing=0,missingRuntime=false,markupAvailable=false}={}){
 const{createCalculationRuntime}=await load('ui-src/api-calculations/runtime.mjs'),helpers=await load('tests/api-index-test-helpers.mjs'),{calculateApiIndexSnapshot}=await load('ops/api-index-calculations.mjs'),{parseApiIndexSnapshot,unpackApiDailyItemHistory}=await load('ops/api-index-public-contract.mjs');
 const inputs=await helpers.fullFixture(),source=await calculateApiIndexSnapshot(inputs),definition=JSON.parse(read('ops/api-index-definition-data-v1.json'));
 const thin=await calculateApiIndexSnapshot({...inputs,priceCapture:await helpers.priceCapture(inputs.definition,{omit:helpers.spec.goods[0].itemId})});
 let clock=Date.parse('2026-11-06T12:00:03.000Z'),report=JSON.parse(read('dist/data.json')),revision=0,cashReply=await cashDto({missing:cashMissing}),cashMode='accepted_cache',goodsReply=goodsMode;
 const before=JSON.stringify(report),events=[],errors=[],requests=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(read('web/index.html'),{url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
 Object.assign(w,{TextEncoder,TextDecoder,structuredClone,AbortController,Response,Request,Headers});Object.defineProperty(w,'crypto',{value:webcrypto});w.Date.now=()=>clock;
 w.matchMedia=()=>({matches:true,addEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.AbortSignal.timeout=()=>undefined;
 Object.defineProperty(d,'visibilityState',{value:'hidden',configurable:true});
 w.fetch=async u=>{requests.push(String(u));if(u==='/api-cash-items.json')return cashMode==='failure'?new Response(null,{status:503}):cashResponse(cashReply,cashMode);assert(['version.json','data-0123456789abcdef.json'].includes(u),'own-site mock only');return{ok:true,json:async()=>u==='version.json'?{version:'test'+revision,data:'data-0123456789abcdef.json'}:report};};
 const runtime=createCalculationRuntime({origin:'https://inflation.gg',available,definitionHash:source.definitionHash,parse:b=>parseApiIndexSnapshot(b,{expectedDefinitionHash:source.definitionHash,expectedRows:definition.goods,expectedCashRows:definition.cash}),unpackDaily:unpackApiDailyItemHistory,now:()=>clock,selection:()=>w.AstraRollingBenchmark.getState(),fetcher:async url=>{
  requests.push(url);assert.equal(url,'https://inflation.gg/api-market-calculations.json');if(goodsReply==='failure')return new Response(null,{status:503});const value=goodsReply==='thin'?thin:source,raw=new TextEncoder().encode(JSON.stringify(value)),digest=createHash('sha256').update(raw).digest('hex');return new Response(raw,{headers:{ETag:'"api-calculations-'+digest+'"','Content-Type':'application/json','Cache-Control':'private, no-store, no-transform','X-Astra-Calculations-Mode':'accepted_cache','X-Astra-Calculations-Definition-Hash':source.definitionHash,'X-Astra-Calculations-Prices-Captured-At':value.sources.prices.capturedAt,'X-Astra-Calculations-Overview-Captured-At':value.sources.overview.capturedAt}});
 },notify:()=>d.dispatchEvent(new w.CustomEvent('astracalculationchange'))});if(!missingRuntime)w.AstraApiCalculations=runtime;if(markupAvailable)d.body.dataset.apiCalculationsAvailable='true';
 d.addEventListener('astramarketsnapshot',e=>events.push({report:e.detail,rate:d.getElementById('main-rate').textContent,cpi:d.getElementById('main-cpi').textContent}));
 try{
  if(cash){w.eval(read('web/api-cash-protocol.js'));w.eval(read('web/api-cash-client.js'));}
  for(const p of ['community.js','rolling-benchmark-preview.js','nx-benchmark.js','rate-arrival.js'])w.eval(p==='nx-benchmark.js'&&process.env.ASTRA_TEST_METHOD?fs.readFileSync(process.env.ASTRA_TEST_METHOD,'utf8'):read('web/'+p));
  w.eval(fs.readFileSync(appPath,'utf8')+';window.__bindingTest={checkSnapshot,sourceTick:()=>{renderFreshness();renderSources();},rate:activeRate,cpi:activeCpi,headline:()=>benchmarkHeadline(snapshot),state:()=>snapshot};');
  for(let n=0;n<100&&!events.length;n++)await tick();assert(events.length);if(refreshGoods)await runtime.refresh();await tick();
  const f={w,d,source,runtime,events,errors,requests,before,original:report,
   async replace(change){report=JSON.parse(before);change(report);revision++;await w.__bindingTest.checkSnapshot();await tick();return events.at(-1).report;},
   async goods(mode){clock+=61000;goodsReply=mode;await runtime.refresh();await tick();},
   async cash({missing=cashMissing,scale=1,mode='accepted_cache',capturedAt='2026-11-06T12:01:01.000Z'}={}){clock+=61000;cashReply=await cashDto({missing,scale,capturedAt});cashMode=mode;Object.defineProperty(d,'visibilityState',{value:'visible',configurable:true});await w.AstraApiCash.refresh();await tick();return w.AstraApiCash.pricing(report);},
   sell(amount='1000'){d.getElementById('quick-sell').click();d.getElementById('quick-amount').value=amount;d.getElementById('quick-amount').dispatchEvent(new w.Event('input'));},
   close(){w.AstraApiCash?.client.close();dom.window.close();}};return f;
 }catch(e){w.AstraApiCash?.client.close();dom.window.close();throw e;}
}
function goodsUnavailable(f,reason){const{w,d}=f,detail=f.events.at(-1).report;
 for(const id of ['main-rate','main-cpi','rate-change','cpi-change'])assert.equal(d.getElementById(id).textContent,'\u2014',id);
 assert.equal(w.AstraNxBenchmark.calculate(detail),null);assert(d.querySelector('#method-nx-benchmark .nx-benchmark-results').hidden);assert.equal(w.__bindingTest.cpi(),null);assert.equal(w.__bindingTest.headline().available,false);assert.equal(detail.apiCalculationView,undefined);assert.equal(detail.apiDailyItems,undefined);assert.equal(detail.retainedLegacyRows,undefined);
 assert(detail.apiCalculationUnavailable);if(reason)assert.equal(detail.apiCalculationUnavailable.reason,reason);assert.equal(detail.apiCalculationUnavailable.legacySourceUpdatedAt,f.original.sourceUpdatedAt);
 assert.match(d.getElementById('notice').textContent,/No legacy model headline or MPI is substituted/);assert.match(d.getElementById('notice').textContent,/Legacy.*separately dated/);assert.equal(d.getElementById('rate-arrival-status').dataset.phase,'unavailable');
 assert.equal(detail.history.length,f.original.history.length);assert.equal(detail.sourceUpdatedAt,f.original.sourceUpdatedAt);assert.equal(detail.rows[0].price,f.original.rows[0].price);assert.equal(detail.rows[0].changeBase,f.original.rows[0].changeBase);return detail;
}
function cashAmount(f,rate){f.sell();assert.equal(f.d.getElementById('quick-result').textContent,'\u2248 '+(rate*1000).toLocaleString('en-US',{maximumFractionDigits:0,minimumFractionDigits:0})+' mesos');assert.equal(f.w.__bindingTest.rate(),rate);}
test('API-on initial loading and cold failure never substitute legacy goods values',async()=>{const f=await fixture({refreshGoods:false});try{
 goodsUnavailable(f,'awaiting_accepted_complete_calculation');for(const button of f.d.querySelectorAll('[data-rate-caption]')){button.click();assert.match(f.d.getElementById('exact-rate').textContent,/unavailable/);assert.doesNotMatch(f.d.getElementById('exact-rate').textContent,/definition mismatch/);} assert.equal(f.d.getElementById('rate-kind').dataset.marketAt,'');await f.goods('failure');const detail=goodsUnavailable(f,'own_reader_failed');assert.equal(detail.apiCalculationUnavailable.pricesCapturedAt,null);f.w.__bindingTest.sourceTick();goodsUnavailable(f,'own_reader_failed');for(const button of f.d.querySelectorAll('[data-rate-caption]')){button.click();assert.match(f.d.getElementById('exact-rate').textContent,/unavailable/);assert.doesNotMatch(f.d.getElementById('exact-rate').textContent,/definition mismatch/);} assert.deepEqual(f.errors,[]);
 }finally{f.close();}});
test('first validated thin 49/50 aggregate remains unavailable while independently valid cash works',async()=>{const f=await fixture({goodsMode:'thin'});try{
 goodsUnavailable(f);const m=await f.cash();assert.equal(m.eligibleCount,29);cashAmount(f,m.reference);goodsUnavailable(f);assert.match(f.d.getElementById('quick-fee-note').textContent,/All 29.*Reported 3-day lookback/);assert.deepEqual(f.errors,[]);
 }finally{f.close();}});
test('bound events and ready handshake retain exact legacy prices/changeBase/recent fields and history',async()=>{const f=await fixture();try{
 const detail=f.events.at(-1).report;assert(detail.apiCalculationView);assert.equal(detail.apiDailyItems.length,79);assert.notEqual(detail.rows,detail.retainedLegacyRows);assert.match(f.d.getElementById('basket-table').textContent,/API-linked index change/);
 for(let i=0;i<50;i++)for(const key of ['price','priceDay','changeBase','history',...Object.keys(f.original.rows[i]).filter(k=>k.startsWith('recent'))])assert.equal(JSON.stringify(detail.retainedLegacyRows[i][key]),JSON.stringify(f.original.rows[i][key]),key);
 assert.equal(JSON.stringify(f.original),f.before);f.d.dispatchEvent(new f.w.Event('astramarkethighlightsready'));assert.equal(f.events.at(-1).report.retainedLegacyRows,detail.retainedLegacyRows);assert.deepEqual(f.errors,[]);
 }finally{f.close();}});
test('basket mismatch suppresses only goods calculation; API29 conversion survives and compatible base recovers',async()=>{const f=await fixture();try{
 const m=await f.cash();await f.replace(r=>r.basketHash='a'.repeat(64));const detail=goodsUnavailable(f,'legacy_calculation_definition_mismatch');assert.equal(detail.apiCalculationUnavailable.pricesCapturedAt,f.source.sources.prices.capturedAt);assert.equal(detail.apiCalculationUnavailable.overviewCapturedAt,f.source.sources.overview.capturedAt);cashAmount(f,m.reference);
 for(const mode of ['fixed','compare','rolling']){f.w.AstraRollingBenchmark.setMode(mode);f.w.AstraRollingBenchmark.setWindowDays(3);goodsUnavailable(f);cashAmount(f,m.reference);}
 f.w.__bindingTest.sourceTick();f.d.dispatchEvent(new f.w.Event('astramarkethighlightsready'));goodsUnavailable(f);await f.replace(()=>{});assert(f.events.at(-1).report.apiCalculationView);assert.equal(f.events.at(-1).report.apiCalculationUnavailable,undefined);assert.notEqual(f.d.getElementById('main-rate').textContent,'\u2014');assert.equal(f.w.__bindingTest.cpi(),f.source.current.index);cashAmount(f,m.reference);assert.deepEqual(f.errors,[]);
 }finally{f.close();}});
test('identity binding drift fails closed even with the correct basket hash',async()=>{const f=await fixture();try{
 await f.replace(r=>r.rows[0].category='incompatible category');goodsUnavailable(f,'legacy_calculation_definition_mismatch');assert.deepEqual(f.errors,[]);
 }finally{f.close();}});
test('valid retained goods and cash keep original distinct capture clocks after failures',async()=>{const f=await fixture();try{
 const m=await f.cash(),originalRate=f.d.getElementById('main-rate').textContent;await f.goods('failure');assert.equal(f.d.getElementById('main-rate').textContent,originalRate);assert(f.events.at(-1).report.apiCalculationView);assert.equal(f.d.getElementById('rate-kind').dataset.marketAt,f.source.sources.prices.capturedAt);
 await f.cash({mode:'failure'});cashAmount(f,m.reference);assert.match(f.d.getElementById('quick-fee-note').textContent,/retained original input/);assert.equal(f.d.getElementById('quick-fee-note').dataset.cashCapturedAt,m.capturedAt);assert.match(f.d.querySelector('#comparison-card [data-cash-reference-kind]').textContent,/retained original input/);assert.deepEqual(f.errors,[]);
 }finally{f.close();}});
test('cash changes/choice update actual amounts and paired comparison clocks without changing goods model',async()=>{const f=await fixture();try{
 const first=await f.cash(),rate=f.d.getElementById('main-rate').textContent;f.w.eval(read('web/api-cash-ui.js'));assert.match(f.d.querySelector('.api-cash-converter-note').textContent,/API cash-item sale-median reference/);assert.doesNotMatch(f.d.querySelector('.api-cash-converter-note').textContent,/does not use the API29/);cashAmount(f,first.reference);assert.notEqual(f.w.__bindingTest.headline().rate,first.reference);
 const second=await f.cash({scale:2,capturedAt:'2026-11-06T12:02:01.000Z'});assert.equal(second.reference,first.reference*2);assert.equal(f.d.getElementById('quick-result').textContent,'\u2248 '+(second.reference*1000).toLocaleString('en-US',{maximumFractionDigits:0})+' mesos');
 const box=f.d.querySelector('#comparison-card [data-cash-reference-kind]');assert.equal(box.dataset.cashCapturedAt,second.capturedAt);assert.equal(box.dataset.cashReferenceKind,'api_cash_reference');assert.match(box.textContent,/reported 3-day lookback/);assert.match(box.textContent,/exact bounds.*unknown/);assert.equal(f.d.getElementById('main-rate').textContent,rate);
 await f.cash({missing:1});f.sell();assert.match(f.d.getElementById('quick-result').textContent,/Unavailable/);assert.equal(f.w.__bindingTest.rate(),null);assert.equal(f.d.querySelector('#comparison-card [data-cash-reference-kind] strong').textContent,'\u2014');
 f.w.AstraApiCash.setChoice('legacy');cashAmount(f,f.original.latest.nxRate);assert.equal(f.d.querySelector('#comparison-card [data-cash-reference-kind]').dataset.cashReferenceKind,'legacy_cash_reference');assert.equal(f.d.getElementById('quick-fee-note').dataset.cashCapturedAt,f.original.sourceUpdatedAt);assert.match(f.d.getElementById('quick-fee-note').textContent,/Explicitly selected legacy.*Separately dated/);
 f.w.AstraApiCash.setChoice('api');assert.match(f.d.getElementById('quick-result').textContent,/Unavailable/);assert.equal(f.d.getElementById('main-rate').textContent,rate);assert.deepEqual(f.errors,[]);
 }finally{f.close();}});
test('API-off without cash client preserves ordinary legacy headline and observed conversion',async()=>{const f=await fixture({available:false,cash:false});try{
 await f.replace(r=>r.basketHash='a'.repeat(64));const detail=f.events.at(-1).report;assert.equal(detail.apiCalculationView,undefined);assert.equal(detail.apiCalculationUnavailable,undefined);assert.equal(detail.retainedLegacyRows,undefined);assert.equal(f.w.__bindingTest.cpi(),f.original.latest.cpi);assert.notEqual(f.d.getElementById('main-rate').textContent,'\u2014');cashAmount(f,f.original.latest.nxRate);assert.match(f.d.getElementById('basket-table').textContent,/Vs. base/);assert.doesNotMatch(f.d.getElementById('basket-table').textContent,/API-linked index change/);assert.match(f.d.getElementById('quick-fee-note').textContent,/before fees/);assert.match(f.d.getElementById('quick-fee-note').textContent,/Fees are not deducted/);assert.deepEqual(f.errors,[]);
 }finally{f.close();}});
test('valid API29 observed conversion is independent of goods-API availability',async()=>{const f=await fixture({available:false});try{
 const headline=f.d.getElementById('main-rate').textContent,m=await f.cash();cashAmount(f,m.reference);assert.notEqual(m.reference,f.original.latest.nxRate);assert.equal(f.d.getElementById('main-rate').textContent,headline);assert.equal(f.d.getElementById('quick-fee-note').dataset.cashCapturedAt,m.capturedAt);assert.deepEqual(f.errors,[]);
 }finally{f.close();}});

test('HTML-enabled calculation route with failed client initialization never revives legacy goods',async()=>{const f=await fixture({missingRuntime:true,markupAvailable:true,refreshGoods:false});try{
 goodsUnavailable(f,'calculation_client_unavailable');const m=await f.cash();cashAmount(f,m.reference);goodsUnavailable(f);assert.deepEqual(f.errors,[]);
 }finally{f.close();}});


// Dated actor-free saved public response: a presentation regression, never live prices.
const frozenPartialBody=fs.readFileSync(path.join(project,'tests/fixtures/api-current-partial-20261109.json'));
assert.equal(createHash('sha256').update(frozenPartialBody).digest('hex'),'d5716ef63e3866d5d18a991754f502a449203452867717ceb1f8529927754e92');
const partialFixture=require('./api-partial-item-fixture.cjs').fixture;
const partialOptions={generated:true,goodsMode:'provided',rawGoods:frozenPartialBody,clockAt:'2026-11-09T08:02:03.971Z'};

test('dated cold33of50 shows qualified partial input clocks across headline, Method, Compare and Sources without an aggregate',async()=>{
 const f=await partialFixture(partialOptions);try{
  const s=f.runtime.state(),dto=s.evidenceSnapshot,detail=f.events.at(-1).report;
  assert.equal(dto.current.availableItems,33);assert.equal(dto.current.expectedItems,50);assert.equal(s.snapshot,null);
  assert.equal(f.runtime.getView(),null);assert.equal(f.w.__bindingTest.cpi(),null);assert.equal(f.w.__bindingTest.headline().available,false);
  assert.equal(detail.apiCalculationUnavailable.reason,'partial_current_goods_coverage');
  assert.equal(detail.apiCalculationUnavailable.pricesCapturedAt,'2026-11-09T07:11:53.516Z');
  assert.equal(detail.apiCalculationUnavailable.overviewCapturedAt,'2026-11-09T07:34:53.167Z');
  assert.match(f.d.getElementById('header-freshness').textContent,/33\/50 qualified/);
  assert.equal(f.d.getElementById('status-dot').dataset.statusTone,'amber');
  assert.equal(f.d.getElementById('status-dot').dataset.retrievalState,'aged');
  for(const id of ['method-nx-benchmark','cash-goods-comparison','market-comparison-clock','sources-cards']){
   const text=f.d.querySelector('#'+id+' [data-api-calculation-method]').textContent;
   assert.match(text,/33\/50 qualified/);assert.match(text,/all 50 from one price capture/);
   assert.match(text,/weights are not renormalized/);assert.doesNotMatch(text,/awaiting_accepted_complete_calculation/);
  }
  const card=f.d.querySelector('[data-status-key="api-calculations"]');
  assert.equal(card.dataset.rawCapturedAt,dto.sources.prices.capturedAt);assert.equal(card.dataset.overviewCapturedAt,dto.sources.overview.capturedAt);
  assert.doesNotMatch(card.textContent,/No validated reference available/);
  assert.equal(detail.apiCalculationView,undefined);assert.equal(detail.apiDailyItems,undefined);
  assert.equal(detail.sourceUpdatedAt,f.original.sourceUpdatedAt);assert.deepEqual(f.errors,[]);
 }finally{f.close()}
});

test('partial error retains original provenance while actual denied access remains distinct and blocked',async()=>{
 const f=await partialFixture(partialOptions);try{
  const original=f.runtime.state().evidenceSnapshot;
  await f.goods('failure');const failure=f.events.at(-1).report.apiCalculationUnavailable;
  assert.equal(failure.reason,'own_reader_failed');assert.equal(failure.partialEvidence.status,'retained');
  assert.equal(failure.pricesCapturedAt,original.sources.prices.capturedAt);
  assert.match(f.d.querySelector('#method-nx-benchmark [data-api-calculation-method]').textContent,/Retained validated partial/);
  assert.equal(f.d.getElementById('status-dot').dataset.statusTone,'red');
  assert.match(f.d.querySelector('[data-status-key="api-calculations"]').textContent,/Retained reference/);
  await f.goods('denied');const denied=f.events.at(-1).report.apiCalculationUnavailable;
  assert.equal(denied.reason,'access_denied');assert.equal(denied.partialEvidence,null);
  assert.equal(f.d.getElementById('status-dot').dataset.retrievalState,'access_blocked');
  assert.equal(f.runtime.state().blocked,true);const before=f.requests.length;await f.runtime.refresh();assert.equal(f.requests.length,before);
  assert.equal(f.w.__bindingTest.cpi(),null);assert.deepEqual(f.errors,[]);
 }finally{f.close()}
});

test('new partial evidence never replaces a retained complete model or its original input clock',async()=>{
 const f=await partialFixture({...partialOptions,goodsMode:'good'});try{
  const original=f.runtime.state().snapshot;assert(original);const originalClock=original.sources.prices.capturedAt;
  await f.goods('provided');assert.equal(f.runtime.state().evidenceSnapshot.current.availableItems,33);
  assert.equal(f.runtime.state().snapshot.snapshotHash,original.snapshotHash);assert.equal(f.runtime.state().status,'retained');
  assert.equal(f.runtime.getView().rows.length,50);assert.equal(f.events.at(-1).report.apiCalculationUnavailable,undefined);
  assert.equal(f.runtime.getView().clocks.currentPrices,originalClock);
  assert.equal(f.d.getElementById('rate-kind').dataset.marketAt,originalClock);assert.deepEqual(f.errors,[]);
 }finally{f.close()}
});
