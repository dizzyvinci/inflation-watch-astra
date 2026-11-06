// WORK candidate. Pure consumer of a production-validated calculation snapshot.
// No source collection, DOM, timers, storage or mutation of the legacy report.
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const clock=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)&&new Date(s).toISOString()===s;
const need=v=>{if(!v)throw Error('invalid_calculation_view_binding');};
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const DEPENDENCIES=Object.freeze(['headline','calculator','mpi','category-dials','basket-prices','index-contributions','methodology','comparison','source-clocks']);
export function calculationHeadline(snapshot,{mode='rolling',windowDays=7}={}){
 need(snapshot?.kind==='api_linked_market_calculations'&&hash(snapshot.snapshotHash)&&hash(snapshot.definitionHash));
 need(['rolling','fixed','compare'].includes(mode)&&[3,7].includes(windowDays));
 const current=snapshot.current,fixedHeadline=mode!=='rolling',model=fixedHeadline?snapshot.benchmarks.fixed:snapshot.benchmarks['rolling'+windowDays];
 need(model&&typeof model.available==='boolean'&&['available','unavailable'].includes(model.status)&&model.available===(model.status==='available'));
 const available=current.available===true&&model.available&&positive(current.index)&&positive(model.rateMesosPerNx);
 const change=available?(fixedHeadline?current.index-100:positive(model.meanLinkedDailyMpi)?100*(current.index/model.meanLinkedDailyMpi-1):null):null;
 return freeze({available,rate:available?model.rateMesosPerNx:null,currentMpi:current.available?current.index:null,at:snapshot.sources.prices?.capturedAt??null,
  sourceObservedAt:null,observed:false,qualityConstant:false,mode,requestedMode:mode,windowDays:mode==='fixed'?null:windowDays,
  sourceKind:'api_reported_3day_sale_median_reference',cashAnchor:model.cashAnchorRate??null,meanMpi:model.meanLinkedDailyMpi??null,
  startDay:model.windowStart??null,endExclusive:model.windowEndExclusive??null,missingDays:[...(model.missingDays||[])],changePercent:change,
  label:fixedHeadline?'Fixed-anchor goods NX model · API 3-day reference':`Latest 3-day sale-median reference · ${windowDays}-day anchor`,
  changeLabel:fixedHeadline?'vs frozen reference period':`vs previous ${windowDays} source-calendar days`,
  reason:available?null:current.available!==true?'Current aggregate unavailable; all 50 same-capture item prices are required.':`The requested ${fixedHeadline?'fixed':windowDays+'-day'} anchor is unavailable.`,
  snapshotHash:snapshot.snapshotHash,definitionHash:snapshot.definitionHash});
}
export function calculationView(legacy,snapshot,selection={}){
 need(legacy&&Array.isArray(legacy.rows)&&legacy.rows.length===50);
 need(snapshot?.schemaVersion===1&&snapshot.kind==='api_linked_market_calculations'&&hash(snapshot.definitionHash)&&hash(snapshot.snapshotHash));
 need(hash(legacy.basketHash)&&legacy.basketHash===snapshot.calibration.basketHash);
 need((snapshot.current.available!==true||clock(snapshot.sources?.prices?.capturedAt)&&snapshot.sources.prices.reportedDays===3)&&snapshot.sourceObservedAt===null);
 need(snapshot.current&&Array.isArray(snapshot.current.rows)&&Array.isArray(snapshot.current.categories));
 const original=new Map(legacy.rows.map(row=>[row.slug,row]));need(original.size===50);
 const supplied=new Map();for(const row of snapshot.current.rows){need(original.has(row.slug)&&!supplied.has(row.slug));const base=original.get(row.slug);need(row.category===base.category&&row.weight===base.weight&&row.basePrice===base.basePrice);supplied.set(row.slug,row);}
 if(snapshot.current.available)need(supplied.size===50&&positive(snapshot.current.index));
 const rows=legacy.rows.map(base=>{const item=supplied.get(base.slug),rawPrice=item&&typeof item.currentSaleMedianLexeme==='string'?Number(item.currentSaleMedianLexeme):null;return {
  ...structuredClone(base),price:positive(rawPrice)?rawPrice:null,priceDay:null,priceTimeKind:'reported_3day_window_with_unknown_bounds',
  sourceUrl:item?`https://maplestory.market/items/${item.itemId}?ref=v6kkdvp6`:null,
  currentApiReference:item?{...structuredClone(item),capturedAt:snapshot.sources.prices?.capturedAt??null,reportedDays:3,sourceObservedAt:null}:null,
  changeBase:item?.changeBase??null,indexContribution:item?.indexContribution??null,changeContribution:item?.changeContribution??null,
  legacyEvidence:{price:base.price,priceDay:base.priceDay,sourceUrl:base.sourceUrl},history:base.history.map(point=>[...point])};});
 const headline=calculationHeadline(snapshot,selection);
 const categories=snapshot.current.categories.map(row=>({name:row.category,index:row.index,weight:row.weight,count:row.expectedItems,
  availableItems:row.availableItems,observedWeight:row.observedWeight,changeBase:row.changeBase,capturedAt:snapshot.sources.prices?.capturedAt??null}));
 const latestDaily=snapshot.daily.history.at(-1)??null;
 return freeze({kind:'api_calculation_view',snapshotHash:snapshot.snapshotHash,definitionHash:snapshot.definitionHash,
  headline,index:snapshot.current.available?snapshot.current.index:null,rows,categories,
  currentReference:{capturedAt:snapshot.sources.prices?.capturedAt??null,reportedDays:3,exactStartAt:null,exactEndAt:null,sourceObservedAt:null,
   available:snapshot.current.available,availableItems:snapshot.current.availableItems,expectedItems:50},
  daily:{...structuredClone(snapshot.daily),latestDay:latestDaily?.day??null},
  clocks:{currentPrices:snapshot.sources.prices?.capturedAt??null,dailyCapture:snapshot.sources.overview?.capturedAt??null,
   dailyPublisher:snapshot.sources.overview?.sourceGeneratedAt??null,legacyDaily:legacy.sourceUpdatedAt,sourceObservedAt:null},
  legacyDailyHistory:structuredClone(legacy.history),calibration:structuredClone(snapshot.calibration),dependencies:[...DEPENDENCIES]});
}
export function createCalculationSelection(){
 let good=null,latestCheck=null,status='unavailable';
 return Object.freeze({
  accept(validatedSnapshot,{checkedAt}={}){
   need(clock(checkedAt));latestCheck=checkedAt;
   if(good)need(validatedSnapshot.definitionHash===good.definitionHash);
   if(validatedSnapshot.current.available!==true){status=good?'retained':'unavailable';return false;}
   if(good){const before=good.sources,after=validatedSnapshot.sources;
    if(after.prices.capturedAt<before.prices.capturedAt||(before.overview?.capturedAt&&(after.overview?.capturedAt??'')<before.overview.capturedAt)){status='retained';return false;}}
   if(good?.snapshotHash===validatedSnapshot.snapshotHash){status='current';return false;}
   good=freeze(structuredClone(validatedSnapshot));status='current';return true;
  },
  failed({checkedAt}={}){need(clock(checkedAt));latestCheck=checkedAt;status=good?'retained':'unavailable';},
  state(){return {snapshot:good,checkedAt:latestCheck,status,marketSourceAt:good?.sources.prices.capturedAt??null};}
 });
}
