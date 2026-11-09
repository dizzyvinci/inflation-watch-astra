import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseApiIndexSnapshot} from '../ops/api-index-public-contract.mjs';
import {calculationView} from '../ui-src/api-calculations/view-model.mjs';
import {createCalculationRuntime} from '../ui-src/api-calculations/runtime.mjs';
const raw=fs.readFileSync(new URL('./fixtures/api-daily-coverage-post-fairness.json',import.meta.url)),definition=JSON.parse(fs.readFileSync(new URL('../ops/api-index-definition-data-v1.json',import.meta.url))),legacy={basketHash:definition.basketHash,sourceUpdatedAt:definition.legacySourceUpdatedAt,history:[],rows:definition.goods.map(row=>({...row,history:[]}))};
const hash=b=>createHash('sha256').update(b).digest('hex'),NOW=Date.parse('2026-11-09T00:40:00Z');
const headers=dto=>({'Content-Type':'application/json','Cache-Control':'private, no-store, no-transform',ETag:'"api-calculations-'+hash(raw)+'"','X-Astra-Calculations-Definition-Hash':dto.definitionHash,'X-Astra-Calculations-Prices-Captured-At':dto.sources.prices.capturedAt,'X-Astra-Calculations-Overview-Captured-At':dto.sources.overview.capturedAt,'X-Astra-Calculations-Mode':'accepted_cache'});

test('actual v1 body keeps9 recorded rows and original strict wire count; view derives8 complete eligible days',async()=>{
 assert.equal(hash(raw),'dace47f3c61eef6bf3b6dac039ffc110b8ced3fbada4a9f7e52a18f5f6372b0f');
 const dto=await parseApiIndexSnapshot(raw),view=calculationView(legacy,dto);
 assert.equal(dto.daily.availableDayCount,9);assert.equal(dto.daily.history.length,9);
 assert.equal(view.daily.recordedDays,9);assert.equal(view.daily.observedEligibleDays,8);assert.equal(view.daily.latestObservedDay,'2026-11-06');assert.equal(view.daily.latestDay,'2026-11-08');
 const tail=view.daily.history.at(-1);assert.equal(tail.status,'unavailable');assert.equal(tail.observedWeight,0);assert(tail.carriedWeight>.99);assert.equal(tail.index,dto.daily.history.at(-2).index);
 assert.equal(dto.benchmarks.rolling7.available,false);assert.deepEqual([...dto.benchmarks.rolling7.missingDays],['2026-11-07','2026-11-08']);assert.equal(dto.benchmarks.rolling3.available,false);
 assert.deepEqual(JSON.parse(JSON.stringify(view.daily.history)),JSON.parse(JSON.stringify(dto.daily.history)));
 assert.equal(view.clocks.dailyCapture,'2026-11-09T00:31:39.147Z');assert.equal(view.clocks.currentPrices,'2026-11-09T00:13:38.152Z');
});

test('actual maintained runtime omits unavailable carried-only CPI endpoint without erasing raw evidence or cash history',async()=>{
 const dto=await parseApiIndexSnapshot(raw);let requests=0;
 const runtime=createCalculationRuntime({origin:'https://inflation.gg',available:true,parse:parseApiIndexSnapshot,definitionHash:dto.definitionHash,now:()=>NOW,fetcher:async()=>{requests++;return new Response(raw,{headers:headers(dto)});}});
 runtime.setLegacy(legacy);await runtime.refresh();assert(runtime.getView());
 const points=runtime.sourceSeries('cpi')[0].points;assert.equal(points.length,8);assert.equal(points.at(-1).day,'2026-11-06');assert(!points.some(p=>p.day==='2026-11-08'));
 assert.equal(runtime.sourceSeries('observed-nx')[0].points.length,8);assert.equal(runtime.getView().daily.history.length,9);assert.equal(requests,1);
});

test('actual app clock-copy/spark fragment receives null for unavailable row and labels internal9/8 counts honestly',async()=>{
 const dto=await parseApiIndexSnapshot(raw),view=calculationView(legacy,dto),source=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
 const start=source.indexOf('function renderApiCalculationCopy(){'),end=source.indexOf("\n$('chart-metric')",start),fn=source.slice(start,end).trim();assert(start>=0&&end>start);
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{dataset:{},querySelector:()=>({textContent:''}),nextElementSibling:{},setAttribute(){}});return elements.get(id);};let sparkValues;
 const ctx=vm.createContext({apiView:()=>view,apiBindingFailure:()=>null,$:get,apiCalculationCopy:()=> 'Dated API method.',renderApiCalculationSourceStatus(){},apiCalculationStatus:()=>({tone:'green',phase:'recent',label:'capture only'}),referencePeriodLabel:()=> 'frozen',window:{AstraApiCalculations:{state:()=>({status:'current',readerMode:'accepted_cache'})}},spark:v=>{sparkValues=v;return '<svg></svg>';}});
 const labelStart=source.indexOf('function instantLabel('),labelEnd=source.indexOf('const zones=',labelStart),actualDateHelpers=source.slice(labelStart,labelEnd);assert(labelStart>=0&&labelEnd>labelStart);
 vm.runInContext("let displayTimeZone='UTC',instantLabelZone,instantLabelFormatter;"+actualDateHelpers+'('+fn+')()',ctx);
 assert.equal(sparkValues.length,9);assert.equal(sparkValues.at(-1),null);assert.equal(sparkValues.filter(Number.isFinite).length,8);
 assert.match(get('chart-note').textContent,/8 eligible complete daily model days \/ 9 recorded source-day rows/);assert.match(get('chart-note').textContent,/latest eligible \(11-06-2026\)/);assert.match(get('chart-note').textContent,/Unavailable or partial model days are omitted/);
});

test('actual generated12-input browser entry accepts the unchanged v1 body and exposes honest coverage without extra source requests',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dto=await parseApiIndexSnapshot(raw),dom=new JSDOM('<body data-api-calculations-available="true"></body>',{url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{let requests=0;Object.assign(w,{TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,structuredClone,AbortController,Response,Request,Headers});Object.defineProperty(w,'crypto',{value:webcrypto});w.Date.now=()=>NOW;w.setTimeout=()=>0;w.clearTimeout=()=>{};
  w.fetch=async url=>{requests++;assert.equal(url,'https://inflation.gg/api-market-calculations.json');return new Response(raw,{headers:headers(dto)});};
  w.eval(fs.readFileSync(new URL('../web/api-calculations.js',import.meta.url),'utf8'));w.AstraApiCalculations.setLegacy(legacy);
  for(let i=0;i<60&&!w.AstraApiCalculations.state().snapshot;i++)await new Promise(setImmediate);
  const view=w.AstraApiCalculations.getView();assert(view);assert.equal(view.daily.recordedDays,9);assert.equal(view.daily.observedEligibleDays,8);assert.equal(w.AstraApiCalculations.sourceSeries('cpi')[0].points.length,8);assert.equal(w.AstraApiCalculations.state().snapshot.daily.availableDayCount,9);assert.equal(requests,1);
 }finally{dom.window.close();}
});
