// Integration against the frozen pure Source candidate; all prices below SYNTHETIC.
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{parseApiIndexSnapshot,unpackApiDailyItemHistory}from'../ops/api-index-public-contract.mjs';
import{calculateApiIndexSnapshot}from'../ops/api-index-calculations.mjs';
import{fullFixture}from'./api-index-test-helpers.mjs';
import{calculationView,calculationHeadline}from'../ui-src/api-calculations/view-model.mjs';import{createApiCalculationClient}from'../ui-src/api-calculations/client.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const source=await calculateApiIndexSnapshot(await fullFixture()),definition=read('../ops/api-index-definition-data-v1.json');
const legacy=read('../dist/data.json');
const options={expectedDefinitionHash:source.definitionHash,expectedRows:definition.goods,expectedCashRows:definition.cash};
const raw=new TextEncoder().encode(JSON.stringify(source));

test('Compare preserves its promised fixed headline for both chart anchor windows',()=>{
 for(const windowDays of [3,7]){const h=calculationHeadline(source,{mode:'compare',windowDays});assert.equal(h.rate,source.benchmarks.fixed.rateMesosPerNx);assert.equal(h.changePercent,source.current.index-100);assert.equal(h.meanMpi,null);assert.equal(h.cashAnchor,null);assert.equal(h.startDay,null);}
});
test('frozen Source closed snapshot binds the exact legacy50 without rewriting its source history',async()=>{
 const parsed=await parseApiIndexSnapshot(raw,options),before=structuredClone(legacy),v=calculationView(legacy,parsed);
 assert.equal(v.rows.length,50);assert.equal(v.categories.length,5);assert.equal(v.headline.windowDays,7);assert.equal(v.headline.available,true);assert.equal(v.index,source.current.index);assert.deepEqual(legacy,before);
 assert.equal(v.rows[0].legacyEvidence.priceDay,legacy.rows[0].priceDay);assert.equal(v.rows[0].priceDay,null);assert.equal(v.clocks.legacyDaily,legacy.sourceUpdatedAt);
});
test('API rows display actual raw sale medians while index changes use calibrated prices',async()=>{
 const p=await parseApiIndexSnapshot(raw,options),v=calculationView(legacy,p),input=p.current.rows.find(x=>Number(x.currentSaleMedianLexeme)!==x.currentLinkedPrice),row=v.rows.find(x=>x.slug===input.slug);
 assert.equal(row.price,Number(input.currentSaleMedianLexeme));assert.equal(row.currentApiReference.currentLinkedPrice,input.currentLinkedPrice);assert.equal(row.changeBase,input.changeBase);assert.notEqual(row.price,row.currentApiReference.currentLinkedPrice);
});
test('actual daily tuples remain UTC source days, with cash and goods plus original capture context',async()=>{
 const p=await parseApiIndexSnapshot(raw,options),expanded=unpackApiDailyItemHistory(p);
 assert.equal(expanded.length,79);assert.equal(expanded.filter(x=>x.role==='goods').length,50);assert.equal(expanded.filter(x=>x.role==='cash').length,29);
 for(const row of expanded)for(const point of row.points){assert.match(point.day,/^2026-\d\d-\d\d$/);assert.equal(typeof point.partialCalendarDay,'boolean');assert.equal(point.source.operation,'overview');assert.equal(point.source.sourceObservedAt,null);}
});
test('current snapshot, reference selection and source contexts pass through the real async public parser',async()=>{
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(n=>n.toString(16).padStart(2,'0')).join(''),head={'Cache-Control':'private, no-store, no-transform','Content-Type':'application/json','ETag':'"api-calculations-'+digest+'"','X-Astra-Calculations-Mode':'accepted_cache','X-Astra-Calculations-Definition-Hash':source.definitionHash,'X-Astra-Calculations-Prices-Captured-At':source.sources.prices.capturedAt,'X-Astra-Calculations-Overview-Captured-At':source.sources.overview.capturedAt};
 const client=createApiCalculationClient({origin:'https://inflation.gg',parse:(bytes)=>parseApiIndexSnapshot(bytes,options),expectedDefinitionHash:source.definitionHash,now:()=>Date.parse('2026-11-06T12:00:02.000Z'),fetcher:async()=>new Response(raw,{headers:head})});
 await client.refresh();assert.equal(client.state().status,'current');assert.equal(client.state().snapshot.snapshotHash,source.snapshotHash);assert.equal(calculationHeadline(client.state().snapshot,{windowDays:3}).rate,source.benchmarks.rolling3.rateMesosPerNx);
});
