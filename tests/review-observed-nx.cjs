const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const report=JSON.parse(read('dist/data.json'));
async function fixture(review){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(read('web/index.html'),{url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
 if(review)d.querySelector('footer').dataset.footerPrivacyLock='on';
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.AbortSignal.timeout=()=>undefined;
 w.fetch=async url=>({ok:true,status:200,json:async()=>JSON.parse(read('dist/'+url))});
 w.eval(read('web/community.js'));w.eval(read('web/rolling-benchmark-preview.js'));
 w.eval(read('web/app.js')+';window.__mainExport=mainHistoryExport;');
 await new Promise(r=>setTimeout(r,40));return {dom,w,d,errors};
}
(async()=>{
 const f=await fixture(true);try{
  const {w,d}=f,select=d.getElementById('chart-metric'),chart=d.getElementById('main-chart');
  assert.equal(select.value,'observed-nx');assert.equal(d.getElementById('main-history-title').textContent,'Observed NX rate history');
  const points=[...chart.querySelectorAll('circle[data-chart-value]')],expected=report.history.filter(p=>p.cashItems>=3&&Number.isFinite(p.nxRate)&&p.nxRate>0);
  assert.equal(points.length,expected.length);points.forEach((p,i)=>{assert.equal(Number(p.dataset.chartValue),expected[i].nxRate);assert.equal(p.dataset.chartDate,expected[i].at);assert.equal(p.dataset.chartDatePrecision,'day');assert.equal(p.dataset.chartUnit,'mesos per NX');assert(p.querySelector('title').textContent.includes('source time unspecified'));assert(p.dataset.chartNote.includes('Not an executable'));});
  assert(chart.querySelector('[data-event-id="grand-launch"]'));assert.equal(chart.querySelector('.chart-y-axis-label').textContent,'Rate (mesos per NX)');
  assert(d.getElementById('chart-note').textContent.includes('headline remains'));assert(!chart.textContent.includes('Smega'));
  const headline=d.getElementById('main-rate').textContent;assert.equal(headline,w.AstraGoodsNxBenchmark.headline(report).rate.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
  const exported=w.__mainExport(report,'observed-nx');assert.equal(exported.rows.length,expected.length);assert(!exported.headers.includes('formula'));exported.rows.forEach((r,i)=>{assert.equal(r[0],expected[i].day);assert.equal(r[3],expected[i].nxRate);assert.equal(r[4],expected[i].cashItems);assert.equal(r[8],false)});
  const sparse={...report,history:[{...report.history.at(-1),cashItems:2,nxRate:999}]};assert.equal(w.AstraGoodsNxBenchmark.history(sparse,'observed-nx').length,0,'fewer than three cash inputs is not an observed daily proxy');
  const period=d.getElementById('launch-period');assert(period);period.value='founders';period.dispatchEvent(new w.Event('change'));assert([...chart.querySelectorAll('circle[data-chart-date]')].every(p=>p.dataset.chartDate.slice(0,10)<'2026-10-21'));assert(w.__mainExport(report,'observed-nx').rows.every(r=>r[0]<'2026-10-21'));period.value='all';period.dispatchEvent(new w.Event('change'));
  select.value='nx';select.dispatchEvent(new w.Event('change'));assert(chart.getAttribute('aria-label').includes('Modelled'));assert(w.__mainExport(report,'nx').headers.includes('formula'));assert.equal(d.getElementById('main-rate').textContent,headline);
  select.value='cpi';select.dispatchEvent(new w.Event('change'));assert(chart.getAttribute('aria-label').includes('price index'));assert.equal(d.getElementById('main-rate').textContent,headline);assert.deepEqual(f.errors,[]);
 }finally{f.dom.window.close()}
 const normal=await fixture(false);try{assert.equal(normal.d.getElementById('chart-metric').value,'nx');assert(normal.d.getElementById('main-chart').getAttribute('aria-label').includes('Modelled'));assert.deepEqual(normal.errors,[])}finally{normal.dom.window.close()}
 console.log('PASS review-only observed NX default; exact daily values/CSV; ≥3 cash inputs; source-date tooltips/launch filters; model/MPI switching; unchanged headline and normal default');
})().catch(e=>{console.error(e);process.exitCode=1});
