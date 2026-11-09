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
  daily:{...structuredClone(snapshot.daily),latestDay:latestDaily?.day??null,recordedDays:snapshot.daily.history.length,observedEligibleDays:snapshot.daily.history.filter(p=>p.status==='available'&&!p.partialCalendarDay&&Number.isFinite(p.index)&&p.observedWeight>=.8).length,latestObservedDay:snapshot.daily.history.filter(p=>p.status==='available'&&!p.partialCalendarDay&&Number.isFinite(p.index)&&p.observedWeight>=.8).at(-1)?.day??null},
  clocks:{currentPrices:snapshot.sources.prices?.capturedAt??null,dailyCapture:snapshot.sources.overview?.capturedAt??null,
   dailyPublisher:snapshot.sources.overview?.sourceGeneratedAt??null,legacyDaily:legacy.sourceUpdatedAt,sourceObservedAt:null},
  legacyDailyHistory:structuredClone(legacy.history),calibration:structuredClone(snapshot.calibration),dependencies:[...DEPENDENCIES]});
}
// A separately bound item view is not an accepted complete aggregate.
export function calculationItemEvidenceView(legacy,snapshot,{definitions,dailyItems,status='current',reason=null}={}){
 need(definitions&&Array.isArray(definitions.goods)&&definitions.goods.length===50&&Array.isArray(definitions.cash)&&definitions.cash.length===29);
 const bound=calculationView(legacy,snapshot),base=new Map(legacy.rows.map(r=>[r.slug,r])),targets=new Map([...definitions.goods.map(r=>({...r,role:'goods'})),...definitions.cash.map(r=>({...r,role:'cash'}))].map(r=>[r.itemId,r]));
 need(targets.size===79&&snapshot.current.rows.length===50&&Array.isArray(dailyItems)&&dailyItems.length===79&&new Set(dailyItems.map(r=>r.itemId)).size===79);
 for(const expected of definitions.goods){const row=snapshot.current.rows.find(r=>r.itemId===expected.itemId),old=base.get(expected.slug);need(row&&old&&row.slug===expected.slug&&row.name===expected.name&&old.name===expected.name&&(old.canonicalId===undefined||old.canonicalId===null||old.canonicalId===expected.itemId));}
 for(const row of dailyItems){const expected=targets.get(row.itemId);need(expected&&row.slug===expected.slug&&row.name===expected.name&&row.role===expected.role&&(row.role!=='cash'||row.fixedNxCost===expected.fixedNxCost));}
 need(['current','retained'].includes(status));
 return freeze({kind:'api_item_evidence_view',snapshotHash:snapshot.snapshotHash,definitionHash:snapshot.definitionHash,basketHash:snapshot.calibration.basketHash,status,reason,
  rows:bound.rows.map(row=>({...row,indexContribution:null,changeContribution:null})),dailyItems:structuredClone(dailyItems),clocks:structuredClone(bound.clocks),
  currentReference:{...bound.currentReference},sourceObservedAt:null,qualifiedIndividualTrades:0,aggregateSelectionSeparate:true});
}
export function createCalculationSelection(){
 let good=null,evidence=null,latestCheck=null,status='unavailable',evidenceStatus='unavailable',evidenceReason=null;
 return Object.freeze({
  accept(validatedSnapshot,{checkedAt,readerMode='accepted_cache'}={}){
   need(clock(checkedAt)&&['accepted_cache','retained_last_good'].includes(readerMode));latestCheck=checkedAt;
   if(good)need(validatedSnapshot.definitionHash===good.definitionHash);if(evidence)need(validatedSnapshot.definitionHash===evidence.definitionHash);
   if(evidence&&['prices','overview'].some(k=>evidence.sources[k]&&(!validatedSnapshot.sources[k]||validatedSnapshot.sources[k].capturedAt<evidence.sources[k].capturedAt))){status=good?'retained':'unavailable';evidenceStatus='retained';evidenceReason='source_pair_rollback';return false;}
   if(evidence?.snapshotHash!==validatedSnapshot.snapshotHash)evidence=freeze(structuredClone(validatedSnapshot));
   evidenceStatus=readerMode==='retained_last_good'?'retained':'current';evidenceReason=readerMode==='retained_last_good'?'route_retained_last_good':null;
   if(validatedSnapshot.current.available!==true){status=good?'retained':'unavailable';return false;}
   if(good){const before=good.sources,after=validatedSnapshot.sources;
    if(after.prices.capturedAt<before.prices.capturedAt||(before.overview?.capturedAt&&(after.overview?.capturedAt??'')<before.overview.capturedAt)){status='retained';return false;}}
   if(good?.snapshotHash===validatedSnapshot.snapshotHash){status='current';return false;}
   good=freeze(structuredClone(validatedSnapshot));status='current';return true;
  },
  failed({checkedAt,reason='own_reader_failed'}={}){need(clock(checkedAt));latestCheck=checkedAt;status=good?'retained':'unavailable';evidenceStatus=evidence?'retained':'unavailable';evidenceReason=reason;},
  state(){return {snapshot:good,evidenceSnapshot:evidence,checkedAt:latestCheck,status,evidenceStatus,evidenceReason,marketSourceAt:good?.sources.prices.capturedAt??null};}
 });
}
