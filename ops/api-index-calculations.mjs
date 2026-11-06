// Pure WORK foundation. No transport, storage, provider authority or publication.
import {parseStrictJson,assertSafeItemDto,sha256} from './api-price-item-dto.mjs';
import {portableHash,canonicalBytes} from './portable-hash.mjs';
export const METHOD_VERSION='api-v2-chainlink-20261104-v1';
export const ITEM_HISTORY_COLUMNS=Object.freeze(['day','medianUnitPriceLexeme','recordedSalesCount','reportedUnitCount','qualified','partialCalendarDay','sourceContextId','linkedPrice']);
export const LIMITS=Object.freeze({targets:79,goods:50,cash:29,sourceRows:20000,daysPerReceipt:32,retainedDays:400,minimumSales:5,minimumDailyObservedWeight:.8,minimumCashItems:3});
const HASH=/^[a-f0-9]{64}$/, DAY=/^\d{4}-\d\d-\d\d$/, DEF=new WeakMap();
const URLS={prices:'https://maplestory.market/api/prices',overview:'https://maplestory.market/api/market/overview'};
const DECIMAL_PROTO=Object.getPrototypeOf(parseStrictJson('0.1'));
export class InvalidCalculation extends Error{constructor(code){super(code);this.name='InvalidCalculation';}}
const fail=code=>{throw new InvalidCalculation(code);};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const own=v=>structuredClone(v);
const same=(a,b)=>{const x=canonicalBytes(a),y=canonicalBytes(b);return x.length===y.length&&x.every((v,i)=>v===y[i]);};
function shape(v,keys,optional=[]){if(!v||typeof v!=='object'||Array.isArray(v)||keys.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!keys.includes(k)&&!optional.includes(k)))fail('unexpected_fields');}
function text(v,max=300){if(typeof v!=='string'||!v.trim()||v.length>max)fail('text');return v;}
function integer(v,min=0,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(v)||v<min||v>max)fail('integer');return v;}
function number(v,min=0,max=Number.MAX_SAFE_INTEGER){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail('number');return v;}
function positive(v){return number(v,Number.MIN_VALUE);}
function hash(v){if(typeof v!=='string'||!HASH.test(v))fail('hash');return v;}
function instant(v){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v.slice(0,10))fail('clock');return v;}
function day(v){if(typeof v!=='string'||!DAY.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)fail('day');return v;}
function amount(v,nullable=true){if(v===null&&nullable)return null;if(typeof v!=='string'||v.length>160||!/^\d+(?:\.\d+)?$/.test(v))fail('amount_lexeme');const n=Number(v);if(!Number.isFinite(n)||n>Number.MAX_SAFE_INTEGER)fail('amount_range');return v;}
function rawAmount(v,nullable=true){
  if(v===null&&nullable)return null;if(Number.isSafeInteger(v)&&v>=0)return String(v);
  if(!v||Object.getPrototypeOf(v)!==DECIMAL_PROTO)fail('original_json_amount');
  const m=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(v.lexeme);if(!m)fail('original_json_amount');
  const digits=m[2]+(m[3]||''),exp=Number(m[4]||0)-(m[3]||'').length;
  if((m[1]&&/[1-9]/.test(digits))||digits.length>128||exp< -32||exp>18)fail('amount_precision');
  const at=digits.length+exp;const out=(at<=0?'0.'+'0'.repeat(-at)+digits:at>=digits.length?digits+'0'.repeat(at-digits.length):digits.slice(0,at)+'.'+digits.slice(at)).replace(/^0+(?=\d)/,'');return amount(out,false);
}
function sourceContext(v,operation,rawBodySha256){
  shape(v,['operation','sourceUrl','capturedAt','sourceObservedAt','captureTimeKind']);
  if(v.operation!==operation||v.sourceUrl!==URLS[operation]||v.sourceObservedAt!==null||v.captureTimeKind!=='http_response_completed')fail('source_context');
  return {operation,sourceUrl:URLS[operation],rawBodySha256:hash(rawBodySha256),capturedAt:instant(v.capturedAt),sourceObservedAt:null,captureTimeKind:'http_response_completed'};
}
function validateSource(v,operation){
  shape(v,['operation','sourceUrl','rawBodySha256','capturedAt','sourceObservedAt','captureTimeKind'],operation==='overview'?['sourceGeneratedAt']:[]);
  const source=sourceContext({operation:v.operation,sourceUrl:v.sourceUrl,capturedAt:v.capturedAt,sourceObservedAt:v.sourceObservedAt,captureTimeKind:v.captureTimeKind},operation,v.rawBodySha256);
  if(operation==='overview'){source.sourceGeneratedAt=instant(v.sourceGeneratedAt);if(Date.parse(source.sourceGeneratedAt)>Date.parse(source.capturedAt))fail('future_generated_at');}
  return source;
}
function getDefinition(v){const d=DEF.get(v);if(!d)fail('definition_capability');return d;}
export async function createApiIndexDefinition(spec){
  spec=own(spec);shape(spec,['schemaVersion','methodVersion','linkDay','basketHash','legacySourceUpdatedAt','legacyReportSha256','anchorOverviewRawSha256','anchorOverviewCapturedAt','anchorOverviewGeneratedAt','fixedNxBaseRate','goods','cash']);
  if(spec.schemaVersion!==1||spec.methodVersion!==METHOD_VERSION||spec.linkDay!=='2026-11-04')fail('definition_version');
  for(const k of ['basketHash','legacyReportSha256','anchorOverviewRawSha256'])hash(spec[k]);for(const k of ['legacySourceUpdatedAt','anchorOverviewCapturedAt','anchorOverviewGeneratedAt'])instant(spec[k]);positive(spec.fixedNxBaseRate);
  if(spec.legacySourceUpdatedAt.slice(0,10)!==spec.linkDay||spec.anchorOverviewGeneratedAt.slice(0,10)<=spec.linkDay||Date.parse(spec.anchorOverviewGeneratedAt)>Date.parse(spec.anchorOverviewCapturedAt))fail('calibration_clock');
  if(!Array.isArray(spec.goods)||spec.goods.length!==50||!Array.isArray(spec.cash)||spec.cash.length!==29)fail('definition_cohorts');
  const ids=new Set(),slugs=new Set();let weights=0;
  for(const r of spec.goods){
    shape(r,['slug','name','category','weight','basePrice','itemId','legacyLinkPrice','APIlinkPrice','legacyPriceDay','legacyCarried','legacyUnit','APIlinkRecordedSalesCount','APIlinkReportedUnitCount']);
    integer(r.itemId,1,999999999);text(r.slug,200);text(r.name);text(r.category,80);positive(r.weight);if(r.weight>.080000000001)fail('weight_cap');weights+=r.weight;positive(r.basePrice);positive(r.legacyLinkPrice);amount(r.APIlinkPrice,false);if(Number(r.APIlinkPrice)<=0)fail('api_link_price');day(r.legacyPriceDay);if(r.legacyPriceDay>spec.linkDay||r.legacyCarried!==(r.legacyPriceDay!==spec.linkDay))fail('legacy_carry');integer(r.APIlinkRecordedSalesCount,5);integer(r.APIlinkReportedUnitCount);if(r.legacyUnit!==null&&typeof r.legacyUnit!=='string')fail('legacy_unit');
    if(ids.has(r.itemId)||slugs.has(r.slug))fail('duplicate_identity');ids.add(r.itemId);slugs.add(r.slug);
  }
  if(Math.abs(weights-1)>1e-12)fail('weight_sum');
  for(const r of spec.cash){shape(r,['itemId','name','slug','fixedNxCost','identityProofHash']);integer(r.itemId,1,999999999);text(r.name);text(r.slug,200);positive(r.fixedNxCost);hash(r.identityProofHash);if(ids.has(r.itemId)||slugs.has(r.slug))fail('duplicate_identity');ids.add(r.itemId);slugs.add(r.slug);}
  freeze(spec);const definitionHash=await portableHash(spec);const handle=freeze({schemaVersion:1,methodVersion:METHOD_VERSION,definitionHash,targetItemIds:[...ids].sort((a,b)=>a-b)});
  DEF.set(handle,{spec,definitionHash,ids});return handle;
}
export function definitionData(definition){return getDefinition(definition).spec;}
async function seal(v){v=freeze(v);return freeze({...v,captureHash:await portableHash(v)});}
export async function normalizeApiPriceSubset(itemDtos,{context,definition}={}){
  const d=getDefinition(definition);if(!Array.isArray(itemDtos)||itemDtos.length>79)fail('price_targets_bound');
  // Own the entire compact input and context before digest/other awaits.
  itemDtos=own(itemDtos);context=own(context);const declaredHash=context?.rawBodySha256??null;if(declaredHash!==null)hash(declaredHash);if(context&&Object.hasOwn(context,'rawBodySha256'))delete context.rawBodySha256;let source=null;const ids=new Set(),rows=[];
  for(const dto of itemDtos){assertSafeItemDto(dto);if(!d.ids.has(dto.itemId)||ids.has(dto.itemId))fail('price_identity');ids.add(dto.itemId);
    const s=sourceContext(context,'prices',dto.source.rawBodySha256);
    if(declaredHash!==null&&declaredHash!==s.rawBodySha256)fail('declared_price_hash');
    if(dto.source.retrievedAt!==s.capturedAt||JSON.stringify(dto.source.window)!==JSON.stringify({reportedDays:3,exactStartAt:null,exactEndAt:null}))fail('mixed_prices_context');
    if(source&&!same(source,s))fail('mixed_prices_capture');source=s;
    const sold=dto.aggregate.sold;rows.push({itemId:dto.itemId,medianUnitPriceLexeme:sold?.medianUnitPrice??null,recordedSalesCount:sold?.reportedSalesCount??0,reportedUnitCount:sold?.reportedUnitCount??0});
  }
  // A completely empty accepted response is still meaningful unavailable evidence.
  if(!source){if(declaredHash===null)fail('empty_capture_hash_required');source=sourceContext(context,'prices',declaredHash);}
  rows.sort((a,b)=>a.itemId-b.itemId);
  return seal({schemaVersion:1,kind:'private_api_index_price_capture',definitionHash:d.definitionHash,source,reportedDays:3,exactStartAt:null,exactEndAt:null,rows});
}
const OVERVIEW_KEYS=['generated_at','window_hours','scanned_hours','previous_scanned_hours','comparable','totals','items','movers','most_sales','best_sellers','top_turnover','most_listed','activity','maintenance','top_sellers'];
export async function normalizeOverviewDailySubset(raw,{expectedSha256,context,definition}={}){
  const d=getDefinition(definition);if(typeof raw==='string')raw=new TextEncoder().encode(raw);if(!(raw instanceof Uint8Array)||!raw.length||raw.length>5000000)fail('overview_byte_bound');
  raw=new Uint8Array(raw);context=own(context);expectedSha256=hash(expectedSha256);const source=sourceContext(context,'overview',expectedSha256);
  if(await sha256(raw)!==expectedSha256)fail('overview_raw_hash');const input=parseStrictJson(raw);shape(input,OVERVIEW_KEYS);
  const epoch=integer(input.generated_at,1,253402300799);source.sourceGeneratedAt=new Date(epoch*1000).toISOString();if(Date.parse(source.sourceGeneratedAt)>Date.parse(source.capturedAt))fail('future_generated_at');
  for(const k of ['window_hours','scanned_hours','previous_scanned_hours'])integer(input[k],0,100000);if(typeof input.comparable!=='boolean')fail('overview_comparable');
  if(!Array.isArray(input.items)||input.items.length>20000)fail('overview_item_bound');const ids=new Set(),rows=[];
  for(const r of input.items){shape(r,['item_id','cash','sales','units','mesos','median_unit_price','previous_sales','previous_median_unit_price','daily']);integer(r.item_id,1,999999999);if(ids.has(r.item_id))fail('overview_duplicate_id');ids.add(r.item_id);
    if(typeof r.cash!=='boolean')fail('source_cash_flag');for(const k of ['sales','units','previous_sales'])integer(r[k]);rawAmount(r.mesos,false);rawAmount(r.median_unit_price);rawAmount(r.previous_median_unit_price);
    if(!Array.isArray(r.daily)||r.daily.length>32)fail('daily_bound');const days=[],seen=new Set();
    for(const x of r.daily){shape(x,['day','sales','units','median_unit_price']);const t=integer(x.day,0,253402214400);if(t%86400)fail('source_day_alignment');const key=new Date(t*1000).toISOString().slice(0,10);if(seen.has(key)||key>source.sourceGeneratedAt.slice(0,10))fail('duplicate_or_future_day');seen.add(key);const cell={day:key,medianUnitPriceLexeme:rawAmount(x.median_unit_price),recordedSalesCount:integer(x.sales),reportedUnitCount:integer(x.units)};if(d.ids.has(r.item_id))days.push(cell);}
    if(d.ids.has(r.item_id))rows.push({itemId:r.item_id,sourceCashFlag:r.cash,days:days.sort((a,b)=>a.day.localeCompare(b.day))});
  }
  rows.sort((a,b)=>a.itemId-b.itemId);return seal({schemaVersion:1,kind:'private_api_index_daily_capture',definitionHash:d.definitionHash,source,rows});
}
function checkCapture(v,d,kind){
  if(!['private_api_index_price_capture','private_api_index_daily_capture'].includes(kind))fail('capture_kind');
  shape(v,['schemaVersion','kind','definitionHash','source','rows','captureHash'],kind==='private_api_index_price_capture'?['reportedDays','exactStartAt','exactEndAt']:[]);
  if(v.schemaVersion!==1||v.kind!==kind||v.definitionHash!==d.definitionHash)fail('capture_definition');hash(v.captureHash);validateSource(v.source,kind==='private_api_index_price_capture'?'prices':'overview');
  if(!Array.isArray(v.rows)||v.rows.length>79)fail('capture_rows_bound');const ids=new Set();
  for(const r of v.rows){integer(r.itemId,1);if(!d.ids.has(r.itemId)||ids.has(r.itemId))fail('capture_identity');ids.add(r.itemId);
    if(kind==='private_api_index_price_capture'){shape(r,['itemId','medianUnitPriceLexeme','recordedSalesCount','reportedUnitCount']);amount(r.medianUnitPriceLexeme);integer(r.recordedSalesCount);integer(r.reportedUnitCount);}
    else{shape(r,['itemId','sourceCashFlag','days']);if(typeof r.sourceCashFlag!=='boolean'||!Array.isArray(r.days)||r.days.length>32)fail('capture_daily');const seen=new Set();for(const x of r.days){shape(x,['day','medianUnitPriceLexeme','recordedSalesCount','reportedUnitCount']);day(x.day);if(seen.has(x.day)||x.day>v.source.sourceGeneratedAt.slice(0,10))fail('capture_day');seen.add(x.day);amount(x.medianUnitPriceLexeme);integer(x.recordedSalesCount);integer(x.reportedUnitCount);}}
  }
  if(kind==='private_api_index_price_capture'&&(v.reportedDays!==3||v.exactStartAt!==null||v.exactEndAt!==null))fail('capture_window');
  return v;
}
export async function validateIndexCapture(value,{definition}={}){const d=getDefinition(definition);value=own(value);checkCapture(value,d,value.kind);const {captureHash,...body}=value;if(await portableHash(body)!==captureHash)fail('capture_hash');return freeze(value);}
export function dailyCaptureCells(capture,{definition}={}){const d=getDefinition(definition);checkCapture(capture,d,'private_api_index_daily_capture');return freeze(capture.rows.flatMap(r=>r.days.map(x=>({...own(x),itemId:r.itemId,sourceCashFlag:r.sourceCashFlag,source:own(capture.source),captureHash:capture.captureHash}))));}
function checkCell(c,d){shape(c,['day','medianUnitPriceLexeme','recordedSalesCount','reportedUnitCount','itemId','sourceCashFlag','source','captureHash']);day(c.day);amount(c.medianUnitPriceLexeme);integer(c.recordedSalesCount);integer(c.reportedUnitCount);integer(c.itemId,1);if(!d.ids.has(c.itemId)||typeof c.sourceCashFlag!=='boolean')fail('cell_identity');hash(c.captureHash);validateSource(c.source,'overview');if(c.day>c.source.sourceGeneratedAt.slice(0,10))fail('cell_future_day');}
export function mergeDailyCells(existing,newCapture,{definition}={}){
  const d=getDefinition(definition);if(!Array.isArray(existing)||existing.length>31600)fail('retained_cell_bound');existing=own(existing);const incoming=dailyCaptureCells(newCapture,{definition});const map=new Map();
  for(const c of [...existing,...incoming]){checkCell(c,d);const k=c.itemId+':'+c.day,old=map.get(k);if(!old||Date.parse(c.source.capturedAt)>Date.parse(old.source.capturedAt))map.set(k,c);else if(Date.parse(c.source.capturedAt)===Date.parse(old.source.capturedAt)&&!same(c,old))fail('same_clock_conflicting_revision');}
  if(map.size>31600||new Set([...map.values()].map(c=>c.day)).size>400)fail('retained_cell_capacity_hold');return freeze([...map.values()].sort((a,b)=>a.day.localeCompare(b.day)||a.itemId-b.itemId));
}
function qualified(r){return r&&r.medianUnitPriceLexeme!==null&&Number(r.medianUnitPriceLexeme)>0&&r.recordedSalesCount>=5;}
function safeSum(values){const v=values.reduce((a,b)=>a+b,0);if(!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER)fail('calculation_range');return v;}
function baseRow(r,p){const linked=p===null?null:r.legacyLinkPrice*p/Number(r.APIlinkPrice),ratio=linked===null?null:linked/r.basePrice;if(linked!==null){number(linked);number(100*ratio);}
  return {itemId:r.itemId,slug:r.slug,name:r.name,category:r.category,weight:r.weight,basePrice:r.basePrice,legacyLinkPrice:r.legacyLinkPrice,APIlinkPrice:r.APIlinkPrice,currentSaleMedianLexeme:null,currentLinkedPrice:linked,indexContribution:ratio===null?null:100*r.weight*ratio,changeContribution:ratio===null?null:100*r.weight*(ratio-1),changeBase:ratio===null?null:100*(ratio-1),recordedSalesCount:null};}
function categories(rows){return [...new Set(rows.map(r=>r.category))].map(category=>{const rr=rows.filter(r=>r.category===category),available=rr.filter(r=>r.currentLinkedPrice!==null),weight=safeSum(rr.map(r=>r.weight)),observedWeight=safeSum(available.map(r=>r.weight));const index=available.length===rr.length?safeSum(rr.map(r=>r.indexContribution))/weight:null;return {category,index,changeBase:index===null?null:index-100,weight,observedWeight,expectedItems:rr.length,availableItems:available.length};});}
const unavailable=reason=>({status:'unavailable',available:false,rateMesosPerNx:null,reason});
export async function calculateApiIndexSnapshot({definition,priceCapture=null,dailyCells=[],latestOverview=null,activeWindowDays=64}={}){
  const d=getDefinition(definition),spec=d.spec;
  integer(activeWindowDays,3,400);
  // Snapshot every caller-owned graph before the first async operation.
  priceCapture=priceCapture===null?null:own(priceCapture);dailyCells=own(dailyCells);latestOverview=latestOverview===null?null:own(latestOverview);
  if(priceCapture)priceCapture=await validateIndexCapture(priceCapture,{definition});
  if(!Array.isArray(dailyCells)||dailyCells.length>31600)fail('daily_cells_bound');dailyCells.sort((a,b)=>String(a.day).localeCompare(String(b.day))||a.itemId-b.itemId);const cells=new Map(),days=new Set(),captureSources=new Map();
  for(const c of dailyCells){checkCell(c,d);const key=c.itemId+':'+c.day;if(cells.has(key))fail('duplicate_daily_cell');cells.set(key,c);days.add(c.day);const prior=captureSources.get(c.captureHash);if(prior&&!same(prior,c.source))fail('cell_capture_source_conflict');captureSources.set(c.captureHash,c.source);}
  if(days.size>activeWindowDays)fail('daily_day_bound');const calendarDays=[...days].sort();if(calendarDays.length&&Date.parse(calendarDays.at(-1)+'T00:00:00Z')-Date.parse(calendarDays[0]+'T00:00:00Z')>(activeWindowDays-1)*86400000)fail('active_daily_window_bound');if(latestOverview)validateSource(latestOverview,'overview');
  for(const c of dailyCells)if(latestOverview&&Date.parse(c.source.capturedAt)>Date.parse(latestOverview.capturedAt))fail('cell_after_latest_overview');
  const currentMap=new Map(priceCapture?.rows.map(r=>[r.itemId,r])??[]),rows=spec.goods.map(r=>{const p=currentMap.get(r.itemId),ok=qualified(p),out=baseRow(r,ok?Number(p.medianUnitPriceLexeme):null);out.currentSaleMedianLexeme=p?.medianUnitPriceLexeme??null;out.recordedSalesCount=p?.recordedSalesCount??null;return out;});
  const valid=rows.filter(r=>r.currentLinkedPrice!==null),complete=valid.length===50,index=complete?safeSum(rows.map(r=>r.indexContribution)):null;
  const current={basis:'api_reported_3day_sale_median_reference',status:complete?'available':'unavailable',available:complete,index,expectedItems:50,availableItems:valid.length,observedWeight:safeSum(valid.map(r=>r.weight)),rows,categories:categories(rows),reason:complete?null:'requires_all_50_qualified_items_from_one_price_capture'};
  const history=[],sortedDays=[...days].sort(),lastById=new Map();
  for(const targetDay of sortedDays){let observed=0,carried=0,all=true,partial=false;const contributions=[];for(const r of spec.goods){const cell=cells.get(r.itemId+':'+targetDay);if(qualified(cell))lastById.set(r.itemId,cell);const chosen=lastById.get(r.itemId);if(!chosen){all=false;continue;}if(chosen.day===targetDay)observed+=r.weight;else carried+=r.weight;partial ||= chosen.day>=chosen.source.sourceGeneratedAt.slice(0,10);contributions.push(baseRow(r,Number(chosen.medianUnitPriceLexeme)).indexContribution);}
    // Completed item-days only; a partial cash observation stays in itemHistory,
    // and does not veto three other genuinely completed cash item-days.
    const cash=spec.cash.map(r=>({target:r,cell:cells.get(r.itemId+':'+targetDay)})).filter(x=>qualified(x.cell)&&x.cell.day<x.cell.source.sourceGeneratedAt.slice(0,10));let cashWeight=0,cashTotal=0;for(const {target,cell}of cash){cashWeight=safeSum([cashWeight,cell.recordedSalesCount]);cashTotal=safeSum([cashTotal,Number(cell.medianUnitPriceLexeme)/target.fixedNxCost*cell.recordedSalesCount]);}
    history.push({day:targetDay,index:all?safeSum(contributions):null,status:all&&observed>=.8?'available':'unavailable',observedWeight:observed,carriedWeight:carried,partialCalendarDay:partial,backcast:targetDay<spec.linkDay,nxRate:cash.length>=3?cashTotal/cashWeight:null,cashItems:cash.length,cashRecordedSalesCount:cashWeight});
  }
  const sourceDay=latestOverview?.sourceGeneratedAt.slice(0,10)??null;
  const endDay=sortedDays.at(-1)??null,startDay=endDay?new Date(Date.parse(endDay+'T00:00:00Z')-30*86400000).toISOString().slice(0,10):null;
  const historyCells=dailyCells.filter(c=>startDay!==null&&c.day>=startDay&&c.day<=endDay),historySources=[...new Set(historyCells.map(c=>c.captureHash))].sort();
  const contextIds=new Map(historySources.map((h,i)=>[h,'c'+i]));
  const itemHistory={schemaVersion:1,basis:'actual_api_overview_daily_medians_not_3day_snapshots',windowDays:31,startDayInclusive:startDay,endDayInclusive:endDay,columns:[...ITEM_HISTORY_COLUMNS],contexts:historySources.map(h=>({contextId:contextIds.get(h),captureHash:h,...own(captureSources.get(h))})),rows:[...spec.goods.map(r=>({...r,role:'goods'})),...spec.cash.map(r=>({...r,role:'cash'}))].map(r=>({itemId:r.itemId,slug:r.slug,name:r.name,role:r.role,fixedNxCost:r.role==='cash'?r.fixedNxCost:null,points:historyCells.filter(c=>c.itemId===r.itemId).map(c=>[c.day,c.medianUnitPriceLexeme,c.recordedSalesCount,c.reportedUnitCount,!!qualified(c),c.day>=c.source.sourceGeneratedAt.slice(0,10),contextIds.get(c.captureHash),r.role==='goods'&&qualified(c)?baseRow(r,Number(c.medianUnitPriceLexeme)).currentLinkedPrice:null])}))};
  const rolling=k=>{
    const result={...unavailable('missing_daily_anchor'),cashAnchorRate:null,meanLinkedDailyMpi:null,windowStart:null,windowEndExclusive:sourceDay,dayCount:k,missingDays:[],basis:'cash_daily_anchor_x_current_3day_index_over_daily_mean',currentCapturedAt:priceCapture?.source.capturedAt??null};
    if(!sourceDay)return result;const anchorDays=Array.from({length:k},(_,i)=>new Date(Date.parse(sourceDay+'T00:00:00Z')-(k-i)*86400000).toISOString().slice(0,10));result.windowStart=anchorDays[0];let cashTotal=0,cashCount=0;const mpi=[];
    for(const key of anchorDays){const h=history.find(r=>r.day===key);let good=!!h&&h.status==='available'&&!h.partialCalendarDay;if(good)mpi.push(h.index);const cash=spec.cash.map(target=>({target,cell:cells.get(target.itemId+':'+key)})).filter(x=>qualified(x.cell)&&x.cell.day<x.cell.source.sourceGeneratedAt.slice(0,10));if(cash.length<3)good=false;if(!good){result.missingDays.push(key);continue;}for(const {target,cell}of cash){cashCount=safeSum([cashCount,cell.recordedSalesCount]);cashTotal=safeSum([cashTotal,Number(cell.medianUnitPriceLexeme)/target.fixedNxCost*cell.recordedSalesCount]);}}
    if(result.missingDays.length)return result;result.cashAnchorRate=cashTotal/cashCount;result.meanLinkedDailyMpi=safeSum(mpi)/k;if(!complete){result.reason='current_reference_unavailable';return result;}return {...result,status:'available',available:true,reason:null,rateMesosPerNx:result.cashAnchorRate*index/result.meanLinkedDailyMpi};
  };
  const sources={prices:priceCapture?{...priceCapture.source,reportedDays:3,exactStartAt:null,exactEndAt:null,captureHash:priceCapture.captureHash}:null,overview:latestOverview?own(latestOverview):null};
  const inputClocks=[sources.prices?.capturedAt,sources.overview?.capturedAt].filter(Boolean);const maxInputCapturedAt=inputClocks.sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)??null;
  const dailyInputHash=await portableHash({sources:[...captureSources].sort(([a],[b])=>a.localeCompare(b)),cells:dailyCells.map(c=>[c.itemId,c.day,c.medianUnitPriceLexeme,c.recordedSalesCount,c.reportedUnitCount,c.sourceCashFlag,c.captureHash])});
  const out={schemaVersion:1,kind:'api_linked_market_calculations',methodVersion:METHOD_VERSION,definitionHash:d.definitionHash,calibration:{linkDay:spec.linkDay,basketHash:spec.basketHash,legacySourceUpdatedAt:spec.legacySourceUpdatedAt,legacyReportSha256:spec.legacyReportSha256,anchorOverviewRawSha256:spec.anchorOverviewRawSha256,anchorOverviewCapturedAt:spec.anchorOverviewCapturedAt,qualityConstant:false,retrospectiveLink:true},sources,current,daily:{basis:'api_overview_daily_linked_v2',activeWindowDays,availableDayCount:history.length,latestDay:sortedDays.at(-1)??null,history,itemHistory},benchmarks:{fixed:complete?{status:'available',available:true,rateMesosPerNx:spec.fixedNxBaseRate*index/100,basis:'frozen_legacy_nx_base_x_current_3day_index',baseRate:spec.fixedNxBaseRate}:unavailable('current_reference_unavailable'),rolling7:rolling(7),rolling3:rolling(3)},maxInputCapturedAt,publicationEligible:false,sourceObservedAt:null,qualifiedIndividualTrades:0,limitations:{qualityConstant:false,countsAreVerifiedTradeUnits:false,exactWindowBoundsKnown:false,sourceCashFlagIsEconomicClassification:false,linkedHistoryReplacesLegacyHistory:false},dailyInputHash};
  const snapshotHash=await portableHash(out),result={...out,snapshotHash};if(new TextEncoder().encode(JSON.stringify(result)).length>600000)fail('public_snapshot_capacity_hold');return freeze(result);
}
export async function assertApiIndexSnapshot(value,{expectedDefinitionHash,definition}={}){value=own(value);const d=definition===undefined?null:getDefinition(definition);expectedDefinitionHash=d?.definitionHash??expectedDefinitionHash;const {validateApiIndexSnapshot}=await import('./api-index-public-contract.mjs');validateApiIndexSnapshot(value,{expectedDefinitionHash,expectedRows:d?.spec.goods,expectedCashRows:d?.spec.cash});const {snapshotHash,...body}=value;if(await portableHash(body)!==snapshotHash)fail('snapshot_hash');return freeze(value);}
