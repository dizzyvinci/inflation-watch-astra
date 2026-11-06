import test from'node:test';import assert from'node:assert/strict';
import{calculationView,calculationHeadline,createCalculationSelection}from'../ui-src/api-calculations/view-model.mjs';
function fixture(){
 const rows=Array.from({length:50},(_,i)=>({slug:'item-'+i,name:'Item '+i,category:'Goods',basePrice:100,weight:.02,price:120,priceDay:'2026-11-04',history:[['2026-11-04',120,5]],sourceSummary:{medianSale:120},sourceUrl:'https://legacy.example/item-'+i}));
 const legacy={rows,basketHash:'1'.repeat(64),sourceUpdatedAt:'2026-11-04T08:30:56+00:00',history:[{day:'2026-11-04',cpi:120}]};
 const available={status:'available',available:true,rateMesosPerNx:21,cashAnchorRate:20,meanLinkedDailyMpi:120,windowStart:'2026-10-30',windowEndExclusive:'2026-11-06',missingDays:[]};
 const dto={schemaVersion:1,kind:'api_linked_market_calculations',definitionHash:'a'.repeat(64),snapshotHash:'b'.repeat(64),sourceObservedAt:null,
  calibration:{linkDay:'2026-11-04',basketHash:'1'.repeat(64),retrospectiveLink:true,qualityConstant:false},
  sources:{prices:{capturedAt:'2026-11-06T12:00:00.000Z',reportedDays:3},overview:{capturedAt:'2026-11-06T11:59:00.000Z',sourceGeneratedAt:'2026-11-06T11:58:00.000Z'}},
  current:{status:'available',available:true,index:126,availableItems:50,rows:rows.map((r,i)=>({...r,itemId:1000+i,currentSaleMedianLexeme:'252.000000000000000001',currentLinkedPrice:126,indexContribution:2.52,changeContribution:.52,changeBase:26,recordedSalesCount:5})),categories:[{category:'Goods',index:126,changeBase:26,weight:1,observedWeight:1,expectedItems:50,availableItems:50}]},
  daily:{basis:'actual_daily',history:[{day:'2026-11-05',index:124,partialCalendarDay:false}]},benchmarks:{fixed:{...available,rateMesosPerNx:25.2},rolling7:{...available},rolling3:{...available,rateMesosPerNx:22,windowStart:'2026-11-03'}}};return {legacy,dto};
}
test('all dependent current views update together while raw sale and calibrated price remain distinct',()=>{
 const{legacy,dto}=fixture(),v=calculationView(legacy,dto);
 assert.equal(v.index,126);assert.equal(v.headline.rate,21);assert.equal(v.categories[0].index,126);
 assert.equal(v.rows[0].price,252);assert.equal(v.rows[0].currentApiReference.currentLinkedPrice,126);
 assert.equal(v.rows[0].currentApiReference.currentSaleMedianLexeme,'252.000000000000000001');assert.equal(v.rows[0].changeContribution,.52);
 assert.equal(v.rows[0].priceDay,null);assert.equal(v.headline.sourceObservedAt,null);
 assert.deepEqual(v.daily.history,dto.daily.history);assert.equal(v.legacyDailyHistory[0].cpi,120);
});
test('source windows and capture clocks never turn into a fabricated current daily observation',()=>{
 const{legacy,dto}=fixture(),v=calculationView(legacy,dto);
 assert.equal(v.clocks.legacyDaily,'2026-11-04T08:30:56+00:00');assert.equal(v.currentReference.capturedAt,'2026-11-06T12:00:00.000Z');
 assert.equal(v.rows[0].priceTimeKind,'reported_3day_window_with_unknown_bounds');assert.equal(v.rows[0].legacyEvidence.priceDay,'2026-11-04');
 assert.equal(v.headline.at,v.clocks.currentPrices);assert.equal(v.headline.windowDays,7);assert.equal(v.headline.changePercent,5.000000000000004);
});
test('seven-day anchor absence never silently selects the available three-day rate or old fixed rate',()=>{
 const{dto}=fixture();dto.benchmarks.rolling7={status:'unavailable',available:false,rateMesosPerNx:null,missingDays:['2026-10-30']};
 assert.equal(calculationHeadline(dto).rate,null);assert.equal(calculationHeadline(dto,{windowDays:3}).rate,22);assert.equal(calculationHeadline(dto,{mode:'fixed'}).rate,25.2);
});
test('input legacy values and nested objects remain editable and unchanged',()=>{
 const{legacy,dto}=fixture(),before=structuredClone(legacy);calculationView(legacy,dto);assert.deepEqual(legacy,before);
 assert.equal(Object.isFrozen(legacy.rows[0].sourceSummary),false);legacy.rows[0].sourceSummary.medianSale=121;assert.equal(legacy.rows[0].sourceSummary.medianSale,121);
});
test('identity/weight drift rejects the view instead of silently changing the basket',()=>{
 const{legacy,dto}=fixture();dto.current.rows[0].weight=.03;assert.throws(()=>calculationView(legacy,dto));
});
test('an unavailable nullable median is unknown, never zero; startup has no invented capture',()=>{
 const{legacy,dto}=fixture();dto.current.available=false;dto.current.index=null;dto.current.rows[0].currentSaleMedianLexeme=null;dto.sources.prices=null;
 for(const value of Object.values(dto.benchmarks)){value.available=false;value.status='unavailable';value.rateMesosPerNx=null;}
 const v=calculationView(legacy,dto);assert.equal(v.rows[0].price,null);assert.equal(v.headline.at,null);assert.equal(v.currentReference.capturedAt,null);assert.equal(v.headline.rate,null);
});
test('incomplete new aggregate retains the entire prior generation and original clock',()=>{
 const{dto}=fixture(),store=createCalculationSelection();store.accept(dto,{checkedAt:'2026-11-06T12:00:01.000Z'});
 const next=structuredClone(dto);next.snapshotHash='c'.repeat(64);next.sources.prices.capturedAt='2026-11-06T12:05:00.000Z';next.current.available=false;next.current.index=null;
 assert.equal(store.accept(next,{checkedAt:'2026-11-06T12:05:01.000Z'}),false);assert.equal(store.state().status,'retained');assert.equal(store.state().marketSourceAt,'2026-11-06T12:00:00.000Z');assert.equal(store.state().snapshot.snapshotHash,'b'.repeat(64));
});
test('new source capture invalidates dependents even if the calculated number is identical',()=>{
 const{dto}=fixture(),store=createCalculationSelection();assert.equal(store.accept(dto,{checkedAt:'2026-11-06T12:00:01.000Z'}),true);
 assert.equal(store.accept(dto,{checkedAt:'2026-11-06T12:00:02.000Z'}),false);
 const next=structuredClone(dto);next.snapshotHash='d'.repeat(64);next.sources.prices.capturedAt='2026-11-06T12:05:00.000Z';assert.equal(store.accept(next,{checkedAt:'2026-11-06T12:05:01.000Z'}),true);
 assert.equal(store.state().snapshot.current.index,126);assert.equal(store.state().marketSourceAt,'2026-11-06T12:05:00.000Z');
});
test('late response and request failure cannot overwrite a newer aggregate or its capture clock',()=>{
 const{dto}=fixture(),store=createCalculationSelection();store.accept(dto,{checkedAt:'2026-11-06T12:00:01.000Z'});
 const older=structuredClone(dto);older.sources.overview.capturedAt='2026-11-06T11:55:00.000Z';assert.equal(store.accept(older,{checkedAt:'2026-11-06T12:01:00.000Z'}),false);
 store.failed({checkedAt:'2026-11-06T12:02:00.000Z'});assert.equal(store.state().status,'retained');assert.equal(store.state().marketSourceAt,'2026-11-06T12:00:00.000Z');
});
