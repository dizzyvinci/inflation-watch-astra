const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./api-partial-item-fixture.cjs'),tick=()=>new Promise(r=>setImmediate(r));
const priceCheck=fs.readFileSync(path.join(__dirname,'../web/price-check.js'),'utf8');
test('cold49 renders independently bound79 daily histories and49 current references while headline/MPI stay unavailable',async()=>{
 const f=await fixture({goodsMode:'thin',cash:false});try{
  const detail=f.events.at(-1).report;assert.equal(detail.apiCalculationView,undefined);assert.equal(detail.apiDailyItems,undefined);assert.equal(detail.apiItemEvidence.dailyItems.length,79);assert.equal(f.d.getElementById('main-rate').textContent,'—');assert.equal(f.d.getElementById('main-cpi').textContent,'—');
  for(const target of [f.thin.current.rows[1],f.thin.daily.itemHistory.rows.find(r=>r.role==='cash')]){
   const r=f.w.__bindingTest.findItem('id-'+target.itemId);assert(r);const html=f.w.__bindingTest.itemDetailHTML(r,true);assert.match(html,new RegExp('data-api-item-daily="'+target.itemId+'"'));assert.match(html,/Item evidence keeps its own retrieval clocks/);
  }
  const missing=f.w.__bindingTest.findItem(f.thin.current.rows[0].slug),html=f.w.__bindingTest.itemDetailHTML(missing,true);assert.match(html,/Source count unavailable or zero/);assert.match(html,/<strong>Unknown<\/strong>/);assert.doesNotMatch(html,/NaN|Infinity/);
  f.w.eval(priceCheck);f.d.dispatchEvent(new f.w.Event('astramarkethighlightsready'));await tick();const rows=[...f.d.querySelectorAll('tr[data-price-key]')];assert(rows.length);assert.match(f.d.querySelector('.price-check-coverage').textContent,/49\/50/);assert.match(f.d.querySelector('.price-check-coverage').textContent,/12:05:00/);
  assert.equal(f.runtime.state().snapshot,null);assert.equal(f.errors.length,0);
 }finally{f.close();}
});
test('complete→newer49 refreshes open item/search values and own clock but retains whole aggregate/clock',async()=>{
 const f=await fixture({cash:false});try{
  const original=f.runtime.getView(),rate=f.d.getElementById('main-rate').textContent,oldAt=original.clocks.currentPrices,target=f.source.current.rows[1];
  f.w.__bindingTest.showItem(target.slug);const dialog=f.d.getElementById('item-detail');assert.match(dialog.textContent,/12:00:00/);
  f.w.eval(priceCheck);await f.goods('thin');await tick();const detail=f.events.at(-1).report;
  assert.equal(detail.apiCalculationView.snapshotHash,original.snapshotHash);assert.equal(detail.apiCalculationView.clocks.currentPrices,oldAt);assert.equal(f.d.getElementById('main-rate').textContent,rate);
  assert.equal(detail.apiItemEvidence.snapshotHash,f.thin.snapshotHash);assert.equal(dialog.querySelector('[data-api-daily-snapshot]').dataset.apiDailySnapshot,f.thin.snapshotHash);assert.match(dialog.querySelector('[data-api-item-current]').textContent,/12:05:00/);
  const latest=f.thin.current.rows[1],cell=dialog.querySelector('[data-api-item-current] [data-exact-api-median]');assert.equal(cell.dataset.exactApiMedian,latest.currentSaleMedianLexeme);
  const search=f.d.getElementById('price-check-header-query');search.value=target.name;search.dispatchEvent(new f.w.Event('input',{bubbles:true}));const option=f.d.querySelector('[role="option"]');assert.match(option.textContent,/12:05:00/);assert.match(option.textContent,/API sale median/);assert.equal(f.d.getElementById('item-dialog').open,true);assert.equal(f.errors.length,0);
 }finally{f.close();}
});

test('all79 exact numeric aliases admit only their own daily identity and original source contexts',async()=>{
 const f=await fixture({goodsMode:'thin'});try{
  for(const target of f.runtime.getItemEvidence().dailyItems){const r=f.w.__bindingTest.findItem('id-'+target.itemId);assert(r,target.slug);const host=f.d.createElement('div');host.innerHTML=f.w.__bindingTest.itemDetailHTML(r,true);assert.equal(host.querySelector('[data-api-item-daily]')?.dataset.apiItemDaily,String(target.itemId));assert.equal(host.querySelector('[data-api-daily-snapshot]')?.dataset.apiDailySnapshot,f.thin.snapshotHash);}
  assert.equal(JSON.stringify(f.original),f.before);assert.equal(f.runtime.capturePoints().length,0);assert.equal(f.runtime.sourceSeries('cpi').length,0);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
test('another partial capture updates open numeric route and dialog without advancing complete aggregate or capture history',async()=>{
 const f=await fixture();try{
  const target=f.source.current.rows[2],good=f.runtime.getView().snapshotHash,points=JSON.stringify(f.runtime.capturePoints());f.w.location.hash='#item/id-'+target.itemId;f.w.dispatchEvent(new f.w.HashChangeEvent('hashchange'));f.w.__bindingTest.showItem(target.slug);await f.goods('thin');const count=f.events.length;await f.goods('next');
  assert(f.events.length>count);for(const id of ['item-page-detail','item-detail']){const el=f.d.getElementById(id);assert.equal(el.querySelector('[data-api-daily-snapshot]').dataset.apiDailySnapshot,f.next.snapshotHash);assert.match(el.querySelector('[data-api-item-current]').textContent,/12:06:00/);assert.equal(el.querySelector('[data-exact-api-median]').dataset.exactApiMedian,f.next.current.rows[2].currentSaleMedianLexeme);}
  assert.equal(f.runtime.getView().snapshotHash,good);assert.equal(JSON.stringify(f.runtime.capturePoints()),points);assert.match(f.d.getElementById('cpi-period').textContent,/Retained complete/);assert.match(f.d.getElementById('notice').textContent,/Retained complete calculation/);assert.equal(f.runtime.state().evidenceSnapshot.snapshotHash,f.next.snapshotHash);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
test('selected timezone changes receipt presentation while UTC source days, original clocks and sort attributes remain exact',async()=>{
 const f=await fixture({goodsMode:'thin'});try{
  f.w.__bindingTest.showItem(f.thin.current.rows[1].slug);const before=f.d.querySelector('#item-detail [data-api-day]'),raw=before.dataset.apiDay,sort=before.querySelector('[data-raw-api-captured-at]').dataset.sortValue;
  f.d.getElementById('display-timezone').value='America/Chicago';f.d.getElementById('display-timezone').dispatchEvent(new f.w.Event('change'));
  const after=f.d.querySelector('#item-detail [data-api-day]');assert.equal(after.dataset.apiDay,raw);assert.equal(after.querySelector('[data-raw-api-captured-at]').dataset.sortValue,sort);assert.match(after.querySelector('[data-raw-api-captured-at]').textContent,/\(11-06-2026 06:00:00 CST\)/);assert.match(after.firstElementChild.textContent,/^\(10-30-2026\)$/);assert.equal(f.runtime.getItemEvidence().clocks.currentPrices,f.thin.sources.prices.capturedAt);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
test('basket and exact name/ID mismatch remove item evidence rather than splicing latest clocks onto other identities',async()=>{
 const f=await fixture({goodsMode:'thin'});try{
  const target=f.thin.current.rows[1];for(const mutate of [r=>r.basketHash='f'.repeat(64),r=>r.rows[1].name+=' mismatch',r=>r.rows[1].canonicalId=999999999]){await f.replace(mutate);assert.equal(f.events.at(-1).report.apiItemEvidence,undefined);assert.equal(f.runtime.getItemEvidence(),null);assert.doesNotMatch(f.w.__bindingTest.itemDetailHTML(f.w.__bindingTest.findItem(target.slug),true),/data-api-item-daily|data-api-item-current/);}
  await f.replace(()=>{});assert.equal(f.runtime.getItemEvidence().snapshotHash,f.thin.snapshotHash);assert.equal(f.d.getElementById('main-rate').textContent,'—');assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
test('Off replaces latest item evidence with prior-source view and delayed old event cannot resurrect it',async()=>{
 const f=await fixture({goodsMode:'thin'});try{
  f.w.eval(priceCheck);const target=f.thin.current.rows[1];f.w.__bindingTest.showItem(target.slug);const legacy=f.original.rows.find(r=>r.slug===target.slug);const {createCalculationRuntime}=await import('../ui-src/api-calculations/runtime.mjs');f.w.AstraApiCalculations=createCalculationRuntime({available:false});f.w.AstraApiCalculations.setLegacy(f.original);f.d.body.removeAttribute('data-api-calculations-available');f.d.dispatchEvent(new f.w.Event('astracalculationchange'));await tick();
  assert.equal(f.events.at(-1).report.apiItemEvidence,undefined);assert.equal(f.events.at(-1).report.apiCalculationView,undefined);assert.doesNotMatch(f.d.getElementById('item-detail').innerHTML,/data-api-item-daily|data-api-item-current/);assert.doesNotMatch(f.d.querySelector('.price-check-coverage').textContent,/Fixed-basket API references/);assert.equal(f.events.at(-1).report.rows.find(r=>r.slug===target.slug).price,legacy.price);
  await f.goods('next');assert.equal(f.events.at(-1).report.apiItemEvidence,undefined);assert.doesNotMatch(f.d.getElementById('item-detail').innerHTML,/data-api-item-daily/);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
test('generated strict-IIFE entry binds definitions before real app and retains cold partial evidence with no secondary transport',async()=>{
 const f=await fixture({goodsMode:'thin',generated:true});try{
  assert.equal(f.runtime.getView(),null);assert.equal(f.runtime.getItemEvidence().dailyItems.length,79);const target=f.thin.current.rows[1];f.w.location.hash='#item/id-'+target.itemId;f.w.dispatchEvent(new f.w.HashChangeEvent('hashchange'));assert.equal(f.d.querySelector('#item-page-detail [data-api-item-daily]').dataset.apiItemDaily,String(target.itemId));assert.equal(f.d.getElementById('main-rate').textContent,'—');assert(f.requests.every(u=>['version.json','data-0123456789abcdef.json','https://inflation.gg/api-market-calculations.json'].includes(u)));assert.equal(f.requests.filter(u=>u.includes('api-market')).length,1);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
test('absent API bundle gate preserves prior source and starts zero calculation requests',async()=>{
 const f=await fixture({available:false,generated:true});try{assert.equal(f.runtime.available,false);assert.equal(f.events.at(-1).report.apiItemEvidence,undefined);assert.equal(f.runtime.state().evidenceSnapshot,undefined);assert(f.requests.every(u=>!u.includes('api-market')));assert.notEqual(f.d.getElementById('main-rate').textContent,'—');assert.deepEqual(f.errors,[]);}finally{f.close();}
});
