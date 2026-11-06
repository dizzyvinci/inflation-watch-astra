import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{createCalculationRuntime}from'../ui-src/api-calculations/runtime.mjs';
import{parseApiIndexSnapshot,unpackApiDailyItemHistory}from'../ops/api-index-public-contract.mjs';
import{calculateApiIndexSnapshot}from'../ops/api-index-calculations.mjs';
import{fullFixture}from'./api-index-test-helpers.mjs';
const snapshot=await calculateApiIndexSnapshot(await fullFixture()),raw=new TextEncoder().encode(JSON.stringify(snapshot)),legacy=JSON.parse(fs.readFileSync(new URL('../dist/data.json',import.meta.url),'utf8'));
const definition=JSON.parse(fs.readFileSync(new URL('../ops/api-index-definition-data-v1.json',import.meta.url),'utf8'));
const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('');
function setup({available=true,origin='https://inflation.gg',clock=()=>Date.parse('2026-11-06T12:00:02.000Z')}={}){let calls=0,chosen={mode:'rolling',windowDays:7};const notices=[];const runtime=createCalculationRuntime({origin,available,parse:b=>parseApiIndexSnapshot(b,{expectedDefinitionHash:snapshot.definitionHash,expectedRows:definition.goods,expectedCashRows:definition.cash}),definitionHash:snapshot.definitionHash,unpackDaily:unpackApiDailyItemHistory,now:clock,selection:()=>chosen,notify:s=>notices.push(s),fetcher:async()=>{calls++;return new Response(raw,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store, no-transform','ETag':'"api-calculations-'+digest+'"','X-Astra-Calculations-Definition-Hash':snapshot.definitionHash,'X-Astra-Calculations-Prices-Captured-At':snapshot.sources.prices.capturedAt,'X-Astra-Calculations-Overview-Captured-At':snapshot.sources.overview.capturedAt,'X-Astra-Calculations-Mode':'accepted_cache'}});}});return {runtime,calls:()=>calls,choose:s=>{chosen=s;},notices};}
test('Off runtime performs zero requests even on an unsupported static preview origin',async()=>{
 const s=setup({available:false,origin:'https://static.example'});await s.runtime.refresh();assert.equal(s.calls(),0);assert.equal(s.runtime.state().status,'off');assert.equal(s.runtime.getView(),null);
});
test('one accepted snapshot supplies all current consumer values atomically; legacy report stays unchanged',async()=>{
 const s=setup(),before=structuredClone(legacy);s.runtime.setLegacy(legacy);await s.runtime.refresh();const v=s.runtime.getView();assert.equal(v.rows.length,50);assert.equal(v.index,snapshot.current.index);assert.equal(v.categories[0].index,snapshot.current.categories[0].index);assert.equal(v.headline.rate,snapshot.benchmarks.rolling7.rateMesosPerNx);assert.deepEqual(legacy,before);assert.equal(s.calls(),1);
});
test('a source result before the legacy basket is bound cannot supply a mismatched headline',async()=>{
 const s=setup();await s.runtime.refresh();assert.equal(s.runtime.headline(),null);assert.equal(s.runtime.getView(),null);s.runtime.setLegacy(legacy);assert.equal(s.runtime.headline().available,true);
});
test('rebasket or calibration mismatch fails closed without changing the incoming legacy view',async()=>{
 const s=setup();s.runtime.setLegacy(legacy);await s.runtime.refresh();const changed=structuredClone(legacy);changed.basketHash='0'.repeat(64);s.runtime.setLegacy(changed);assert.equal(s.runtime.headline(),null);assert.equal(s.runtime.overlayReport(changed),changed);assert.equal(s.runtime.state().bindingError,'legacy_calculation_definition_mismatch');
});
test('window/method toggles change the bound model and its explanation without another request',async()=>{
 const s=setup();s.runtime.setLegacy(legacy);await s.runtime.refresh();s.choose({mode:'rolling',windowDays:3});assert.equal(s.runtime.headline().windowDays,3);assert.equal(s.runtime.headline().rate,snapshot.benchmarks.rolling3.rateMesosPerNx);s.choose({mode:'fixed',windowDays:7});assert.equal(s.runtime.headline().rate,snapshot.benchmarks.fixed.rateMesosPerNx);assert.equal(s.runtime.headline().windowDays,null);assert.equal(s.calls(),1);
});
test('actual source-day series and session capture models remain different clocks and kinds',async()=>{
 const s=setup();s.runtime.setLegacy(legacy);await s.runtime.refresh();const daily=s.runtime.sourceSeries('cpi')[0].points,capture=s.runtime.sourceSeries('nx')[0].points;
 assert.ok(daily.length>=7);assert.equal(daily[0].datePrecision,'day');assert.equal(daily[0].at,daily[0].day+'T12:00:00Z');assert.equal(capture[0].datePrecision,'capture');assert.equal(capture[0].at,snapshot.maxInputCapturedAt);assert.match(capture[0].referenceNote,/session-only/);
 const report=s.runtime.overlayReport(legacy);assert.equal(report.sourceUpdatedAt,legacy.sourceUpdatedAt);assert.equal(report.apiDailyItems.length,79);assert.equal(report.apiCalculationView.snapshotHash,snapshot.snapshotHash);
});
test('an unchanged accepted body updates check status without rebuilding every hidden dashboard table',async()=>{
 let now=Date.parse('2026-11-06T12:00:02.000Z');const s=setup({clock:()=>now});s.runtime.setLegacy(legacy);await s.runtime.refresh();const first=s.runtime.getView();now+=60001;await s.runtime.refresh();assert.equal(s.calls(),2);assert.equal(s.notices.length,1);assert.equal(s.runtime.getView(),first);assert.equal(s.runtime.state().checkedAt,'2026-11-06T12:01:02.001Z');
});
