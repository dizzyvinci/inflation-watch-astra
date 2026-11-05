const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),errors=[],requests=[];
const seed=JSON.parse(fs.readFileSync(path.join(root,'dist/data.json'),'utf8'));
const fixture=JSON.parse(JSON.stringify(seed));
const clock='2026-11-05T02:10:54.740Z',oldRate=13.65173115963695;
const legacy={at:clock,nxRate:oldRate,cpi:null,contentHash:'earlier-published-hash',
 sourceUrl:'https://mesos.watch/',timestampKind:'captured_at',observationTimestampKnown:false};
fixture.rollingReferenceHistory=[legacy];
fixture.rollingReference={...fixture.rollingReference,capturedAt:clock,nxRateReference:null,
 comparison:{methodVersion:3,comparableCashItems:0,capturedBasketCoverage:.3,comparableBasketCoverage:.2,
  excludedCashItems:Array.from({length:7},(_,i)=>({name:'Cash '+i,reason:'cash_roll_metadata_unverified',referenceWeight:0})),
  cashReferenceWeights:Array.from({length:7},(_,i)=>({name:'Cash '+i,eligible:false,referenceWeight:0,exclusionReason:'cash_roll_metadata_unverified'}))}};
const unchanged={latest:JSON.stringify(fixture.latest),history:JSON.stringify(fixture.history),
 rolling:JSON.stringify(fixture.rollingReferenceHistory)};
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM(fs.readFileSync(path.join(root,'web/index.html'),'utf8'),
 {url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,doc=w.document;
w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.AbortSignal.timeout=()=>undefined;
w.fetch=async url=>{requests.push(url);assert(['version.json','data-0123456789abcdef.json'].includes(url));
 return {ok:true,json:async()=>url==='version.json'?{version:'fixture',data:'data-0123456789abcdef.json'}:fixture};};
w.eval(fs.readFileSync(path.join(root,'web/app.js'),'utf8')+`;window.__review={points:rollingHistoryPoints,note:rollingNxPolicyNote,chart:chartHTML,export:marketHistoryExport,setReference:value=>{snapshot.rollingReference=value;renderComparisons();renderSourceComparisons();}};csvDownload=(...args)=>window.__download=args;`);
const wait=async predicate=>{const end=Date.now()+1500;while(!predicate()&&Date.now()<end)await new Promise(r=>setTimeout(r,5));assert(predicate(),'Fixture did not render');};
(async()=>{
 await wait(()=>doc.querySelector('.rolling-policy-note'));
 const review=w.__review;
 assert.match(doc.querySelector('.rolling-policy-note').textContent,/unavailable under method 3: 0\/7 fixed-NX items eligible/);
 assert.match(doc.querySelector('.rolling-policy-note').textContent,/7 captured cash inputs lack retained roll metadata/);
 assert.match(doc.getElementById('comparison-card').textContent,/0\/7 fixed-NX items eligible/);
 assert.doesNotMatch(doc.querySelector('.rolling-policy-note').textContent,/64|79|private/);
 assert(![...doc.querySelectorAll('#main-chart circle')].some(point=>point.dataset.chartDate===clock),'Rolling reference is OFF by default');
 assert.equal(doc.querySelector('[data-main-overlay="rolling"]'),null,'Overview model has no observed cash overlay control');
 const probe=doc.createElement('div');probe.innerHTML=review.chart([{name:'Retained rolling cash reference',color:'#edc471',line:false,points:review.points([legacy],'nxRate')}]);
 const circle=[...probe.querySelectorAll('circle')].find(p=>p.dataset.chartDate===clock);
 assert(circle,'Legacy point still plotted');
 assert.equal(Number(circle.dataset.chartValue),oldRate);
 assert.equal(circle.dataset.chartDatePrecision,'timestamp');
 assert.match(circle.dataset.chartSeries,/Legacy.*earlier method \/ unverified rolls/);
 assert.match(circle.dataset.chartNote,/roll identity unverified/);
 assert.match(circle.querySelector('title').textContent,/13\.7.*Earlier method/);
 assert.match(doc.getElementById('chart-note').textContent,/modelled, not observed cash sales/i);
 const mapped=review.points([legacy],'nxRate')[0];
 assert.equal(mapped.contentHash,legacy.contentHash);assert.equal(mapped.timestampKind,'captured_at');
 assert.equal(mapped.observationTimestampKnown,false);assert.equal(mapped.value,oldRate);
 assert.equal(mapped.at,clock);assert.equal(mapped.comparisonMethodVersion,undefined);
 doc.getElementById('export-cash-history').click();
 const [filename,headers,rows]=w.__download;
 assert.equal(filename,'inflation-watch-cash-reference-history.csv');
 assert(rows.every(row=>row.length===headers.length));
 const exported=Object.fromEntries(headers.map((name,i)=>[name,rows.at(-1)[i]]));
 assert.equal(exported.observed_at,clock);assert.equal(exported.nx_rate_mesos_per_nx,oldRate);
 assert.equal(exported.comparison_method_version,'');assert.equal(exported.content_hash,legacy.contentHash);
 assert.equal(exported.roll_identity_status,'unverified_legacy_roll_identity');
 assert.equal(exported.source_observation_time_known,false);assert.equal(exported.quality_constant,'');
 assert.match(exported.kind,/legacy_rolling_scanner/);assert.match(exported.reference_note,/Earlier method/);
 const futurePoint={...legacy,at:'2026-11-06T09:00:00Z',nxRate:14.123456789,
  comparisonMethodVersion:3,comparableCoverage:.9,capturedCoverage:1,qualityConstant:false};
 const future=JSON.parse(JSON.stringify(fixture.rollingReference));future.nxRateReference=futurePoint.nxRate;
 future.comparison.comparableCashItems=7;future.comparison.excludedCashItems=[];
 future.comparison.cashReferenceWeights.forEach(row=>{row.eligible=true;row.referenceWeight=1/7;row.exclusionReason=null;});
 review.setReference(future);
 const futureCopy=doc.querySelector('.rolling-policy-note').textContent;
 assert.match(futureCopy,/Method 3: 7\/7/);assert.doesNotMatch(futureCopy,/unavailable|lack retained/);
 const recovery={...future,captureStartedAt:'2026-11-05T09:01:45.815Z',
  captureCompletedAt:'2026-11-05T10:10:10.823Z',capturedAt:'2026-11-05T10:10:10.823Z',
  scannerFreshnessText:'Capture crossed source recovery: first64 receipts displayed delayed scans and maintenance. The user refreshed around10:03UTC; CUA/kernel operational note. Later receipts reported scans Just now. Listing availability not confirmed.'};
 const rawRecovery=JSON.stringify(recovery);
 review.setReference(recovery);
 const publicContext=doc.getElementById('rolling-reference-card').textContent;
 assert.match(publicContext,/Batch capture window:/);
 assert.match(publicContext,/09:01.*10:10/s);
 assert.match(publicContext,/delayed scans and maintenance, followed by resumed scans/);
 assert.match(publicContext,/Per-item return clocks are retained/);
 assert.match(publicContext,/underlying scan\/trade timestamps are unknown/);
 assert.match(publicContext,/Listing availability is unconfirmed/);
 assert.doesNotMatch(publicContext,/The user|CUA|kernel|first64|10:03/);
 assert.equal(JSON.stringify(recovery),rawRecovery,'Public summary must not rewrite raw audit provenance');
 const noRecoveryTag={...recovery,scannerFreshnessText:'Long batch; the user refreshed via CUA/kernel.'};
 review.setReference(noRecoveryTag);
 const noRecoveryCopy=doc.getElementById('rolling-reference-card').textContent;
 assert.match(noRecoveryCopy,/batch window does not establish source freshness/);
 assert.doesNotMatch(noRecoveryCopy,/followed by resumed scans|The user|CUA|kernel/);
 const older={...future,scannerFreshnessText:'Source displayed 10h ago; maintenance delayed scans.'};
 delete older.captureStartedAt;delete older.captureCompletedAt;
 review.setReference(older);
 assert(doc.getElementById('rolling-reference-card').textContent.includes(older.scannerFreshnessText));
 assert.doesNotMatch(doc.getElementById('rolling-reference-card').textContent,/followed by resumed scans/);
 const futureMapped=review.points([futurePoint],'nxRate')[0];
 assert.equal(futureMapped.comparisonMethodVersion,3);assert.equal(futureMapped.qualityConstant,false);
 assert.doesNotMatch(futureMapped.seriesLabel,/Legacy|unverified/);
 const futureExport=review.export({...fixture,rollingReferenceHistory:[futurePoint]}),last=futureExport.rows.at(-1);
 const read=name=>last[futureExport.headers.indexOf(name)];
 assert.equal(read('comparison_method_version'),3);assert.equal(read('comparable_basket_coverage'),.9);
 assert.equal(read('captured_basket_coverage'),1);assert.equal(read('quality_constant'),false);
 assert.equal(read('nx_rate_mesos_per_nx'),14.123456789);
 assert.match(review.note({nxRateReference:oldRate}),/Legacy rolling NX reference/);
 assert.equal(JSON.stringify(fixture.latest),unchanged.latest);
 assert.equal(JSON.stringify(fixture.history),unchanged.history);
 assert.equal(JSON.stringify(fixture.rollingReferenceHistory),unchanged.rolling);
 assert.equal(requests.length,2);assert.deepEqual(errors,[]);
 console.log('Rolling labels: legacy value/clocks/metadata, v3 unavailable, future eligibility, neutral recovery copy with raw audit provenance retained, CSV and primary data unchanged; 0 DOM errors.');
 dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
