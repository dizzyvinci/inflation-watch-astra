const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {JSDOM}=require('jsdom');
const here=path.resolve(__dirname,'..'),canonical=here;
(async()=>{
 const {fixture,row,legacyReport}=await import('./nx-history-public-fixture.mjs'),{createPublicNxHistoryRoute}=await import('../ops/api-public-nx-history-routes.mjs');
 const f=await fixture([row('2026-08-25T01:00:00Z'),row('2026-08-25T01:00:00Z','sell',14),row('2026-09-25T01:00:00Z'),row('2026-09-25T01:00:00Z','sell',15),row('2026-10-01T01:00:00Z'),row('2026-10-01T01:00:00Z','sell',18)]),route=createPublicNxHistoryRoute();
 const dom=new JSDOM(fs.readFileSync(path.join(canonical,'web/index.html'),'utf8'),{url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document;
 Object.defineProperty(w,'crypto',{value:webcrypto});Object.assign(w,{TextEncoder,TextDecoder,Response,Request,Headers,ReadableStream,structuredClone,AbortController,AbortSignal});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 Object.defineProperty(doc,'hidden',{value:false,configurable:true});doc.getElementById('smega-section').getClientRects=()=>[{}];
 let calls=0;w.fetch=async(url,opts)=>{calls++;assert(/^\/api-nx-history(?:\.json|\/[a-f0-9]{64}\.json\?generation=[a-f0-9]{64})$/.test(url));return route(new Request('https://inflation.gg'+url,opts),f.env);};
 const app=fs.readFileSync(path.join(here,'web/app.js'),'utf8').replace(/route\(\);focusRouteAnchor\(\);checkSnapshot\(\);setInterval\([\s\S]*$/,'');
 w.eval(app+';window.__testSmega=(report)=>{snapshot=report;selectedSmegaRange="24";smegaComparison=false;renderSmega();};window.__captureCSV=()=>{let result;csvDownload=(...args)=>{result=args;};document.getElementById("export-smega").click();return result;};');
 w.eval(fs.readFileSync(path.join(here,'web/nx-history-browser.js'),'utf8'));
 const report=legacyReport(),before=JSON.stringify(report);w.__testSmega(report);const stats=doc.getElementById('smega-stats').innerHTML,original=doc.getElementById('smega-offer-chart').innerHTML;
 assert.equal(calls,0);assert.equal(doc.querySelectorAll('#nx-history-picker').length,1);assert(doc.getElementById('smega-section').contains(doc.getElementById('nx-history-picker')));
 await w.AstraNxHistory.selectMonth('2026-10');
 const points=[...doc.querySelectorAll('#smega-offer-chart circle[data-chart-date]')];assert.equal(points.length,2);assert(points.every(p=>p.dataset.chartDate.startsWith('2026-10-01')));assert(points.every(p=>p.dataset.chartDatePrecision==='timestamp'));assert.deepEqual(points.map(p=>Number(p.dataset.chartValue)).sort((a,b)=>a-b),[10,18]);assert.equal(doc.getElementById('smega-stats').innerHTML,stats);assert.equal(JSON.stringify(report),before);assert(doc.getElementById('smega-point-note').textContent.includes('Historical source hours'));assert(doc.getElementById('smega-history-note').textContent.includes('Native 8h and derived 24h evidence are unchanged'));
 const csv=w.__captureCSV();assert.equal(csv[2].length,1);assert.equal(csv[2][0][0],'2026-10-01T01:00:00.000Z');assert.equal(csv[2][0][2],18);assert.equal(csv[2][0][3],10);assert.equal(csv[1][9],'seller_captured_at');assert.equal(csv[2][0][9],'2026-11-06T01:00:00.000Z');assert.equal(csv[2][0][10],'2026-11-06T01:00:00.000Z');assert.equal(csv[2][0][11],null);assert.equal(csv[2][0][12],'2026-10-01');assert.equal(csv[2][0][13],'2026-10-31');assert(/^[a-f0-9]{64}$/.test(csv[2][0][14]));assert(points.every(p=>p.dataset.chartNote.includes('Original retrieval')));assert(points.every(p=>p.dataset.chartNote.includes('not an individual trade time')));
 await w.AstraNxHistory.selectMonth('2026-08');assert([...doc.querySelectorAll('#smega-offer-chart circle[data-chart-date]')].every(p=>p.dataset.chartDate.startsWith('2026-08-25')));assert.equal(doc.querySelectorAll('#smega-offer-chart circle[data-chart-date]').length,2);assert.equal(doc.getElementById('smega-stats').innerHTML,stats);
 // Same shared renderer retains the separate static legacy hours without summing overlap.
 await w.AstraNxHistory.selectMonth('2026-09');const selected=[...doc.querySelectorAll('#smega-offer-chart circle[data-chart-date]')];assert(selected.some(p=>p.dataset.chartDate.startsWith('2026-09-25')));assert(selected.length>2);assert.equal(doc.getElementById('smega-stats').innerHTML,stats);
 doc.querySelector('[data-smega-range="24"]').click();assert.equal(w.AstraNxHistory.chartView(report),null);assert.equal(doc.getElementById('smega-offer-chart').innerHTML.replace(/plot-\d+/g,'plot-ID'),original.replace(/plot-\d+/g,'plot-ID'));assert.equal(doc.getElementById('smega-stats').innerHTML,stats);
 const count=calls;Object.defineProperty(doc,'hidden',{value:true,configurable:true});doc.dispatchEvent(new w.Event('visibilitychange'));await w.AstraNxHistory.refresh();assert.equal(calls,count);assert.equal(JSON.stringify(report),before);
 dom.window.close();console.log('PASS actual app shared chart/tooltip/CSV, default current summaries, older history, return, zero default fetch');
})().catch(error=>{console.error(error);process.exitCode=1;});


