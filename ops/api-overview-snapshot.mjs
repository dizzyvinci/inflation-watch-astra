// Pure shared overview profile candidate. No transport, storage, owner authority or publication.
import {parseStrictJson,sha256} from './api-price-item-dto.mjs';
import {portableHash} from './portable-hash.mjs';
import {definitionData,validateIndexCapture} from './api-index-calculations.mjs';

export const OVERVIEW_PROFILE='overview-membership-and-derived-v1';
export const OVERVIEW_LIMITS=Object.freeze({rawBytes:5000000,items:20000,baseDaysPerItem:10000,derivedDaysPerItem:32,itemDays:120000,derivedBytes:4194304});
export class OverviewProfileError extends TypeError{}
export class OverviewDerivedProfileError extends TypeError{}
export class OverviewCapacityError extends TypeError{}
export class OverviewCapabilityError extends TypeError{}
const STATE=new WeakMap(),URL='https://maplestory.market/api/market/overview',HASH=/^[a-f0-9]{64}$/,enc=new TextEncoder(),NUMBER_PROTO=Object.getPrototypeOf(parseStrictJson('0.5'));
const ROOT=['generated_at','window_hours','scanned_hours','previous_scanned_hours','comparable','totals','items','movers','most_sales','best_sellers','top_turnover','most_listed','activity','maintenance','top_sellers'];
const ITEM=['item_id','cash','sales','units','mesos','median_unit_price','previous_sales','previous_median_unit_price','daily'];
const DAY=['day','sales','units','median_unit_price'];
const fail=(ok,code)=>{if(!ok)throw new OverviewProfileError(code);};
const derived=(ok,code)=>{if(!ok)throw new OverviewDerivedProfileError(code);};
const capacity=(ok,code)=>{if(!ok)throw new OverviewCapacityError(code);};
const freeze=v=>{if(v&&typeof v==='object'){for(const value of Object.values(v))freeze(value);Object.freeze(v);}return v;};
const shape=(v,keys)=>fail(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'overview_fields');
function integer(v,min=0,max=Number.MAX_SAFE_INTEGER){fail(Number.isSafeInteger(v)&&v>=min&&v<=max,'overview_integer');return v;}
function sourceContext(context,expectedSha256){
 fail(context&&[Object.prototype,null].includes(Object.getPrototypeOf(context)),'overview_context');
 const keys=['operation','sourceUrl','capturedAt','sourceObservedAt','captureTimeKind'],descriptors=Object.getOwnPropertyDescriptors(context);
 fail(Reflect.ownKeys(context).length===keys.length&&keys.every(k=>Object.hasOwn(descriptors,k)&&Object.hasOwn(descriptors[k],'value')),'overview_context_fields');
 const value=Object.fromEntries(keys.map(k=>[k,descriptors[k].value]));
 fail(value.operation==='overview'&&value.sourceUrl===URL&&value.sourceObservedAt===null&&value.captureTimeKind==='http_response_completed','overview_context');
 fail(typeof value.capturedAt==='string'&&Number.isFinite(Date.parse(value.capturedAt))&&new Date(value.capturedAt).toISOString()===value.capturedAt,'overview_capture_clock');
 return freeze({operation:'overview',sourceUrl:URL,rawBodySha256:expectedSha256,capturedAt:value.capturedAt,sourceObservedAt:null,captureTimeKind:'http_response_completed'});
}
function baseAmount(v,nullable=true){
 if(v===null&&nullable)return null;
 if(typeof v==='number'){fail(Number.isSafeInteger(v)&&v>=0,'overview_price_number');return String(v);}
 fail(v&&Object.getPrototypeOf(v)===NUMBER_PROTO&&typeof v.lexeme==='string'&&!v.lexeme.startsWith('-')&&Number.isFinite(Number(v.lexeme))&&v.lexeme.length<=256,'overview_price_token');
 return v.lexeme;
}
function canonicalAmount(token){
 if(token===null)return null;
 const match=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);derived(!!match,'overview_derived_price');
 const digits=match[2]+(match[3]||''),exponent=Number(match[4]||0)-(match[3]||'').length;
 derived(!(match[1]&&/[1-9]/.test(digits))&&digits.length<=128&&Number.isSafeInteger(exponent)&&exponent>=-32&&exponent<=18,'overview_derived_price_precision');
 const at=digits.length+exponent,value=(at<=0?'0.'+'0'.repeat(-at)+digits:at>=digits.length?digits+'0'.repeat(at-digits.length):digits.slice(0,at)+'.'+digits.slice(at)).replace(/^0+(?=\d)/,'');
 derived(value.length<=160&&Number.isFinite(Number(value))&&Number(value)<=Number.MAX_SAFE_INTEGER,'overview_derived_price_range');return value;
}
function state(value){const found=STATE.get(value);if(!found)throw new OverviewCapabilityError('overview_profile_capability');return found;}
export function isOverviewSnapshot(value){return STATE.has(value);}

export async function createOverviewSnapshot(input,{expectedSha256,context}={}){
 // Take byte/context ownership before the first await; never retain caller objects or parsed actors.
 fail(typeof expectedSha256==='string'&&HASH.test(expectedSha256),'overview_expected_hash');
 if(typeof input==='string')input=enc.encode(input);
 fail(input instanceof Uint8Array&&input.byteLength>0&&input.byteLength<=OVERVIEW_LIMITS.rawBytes,'overview_byte_bound');
 const raw=new Uint8Array(input),source=sourceContext(context,expectedSha256);
 fail(await sha256(raw)===expectedSha256,'overview_raw_hash');
 const document=parseStrictJson(raw);shape(document,ROOT);
 const generated=integer(document.generated_at,0,8640000000000);let generatedAt;try{generatedAt=new Date(generated*1000).toISOString();}catch{throw new OverviewProfileError('overview_publication_range');}
 fail(Date.parse(generatedAt)<=Date.parse(source.capturedAt),'overview_future_publication');
 const window={windowHours:integer(document.window_hours),scannedHours:integer(document.scanned_hours),previousScannedHours:integer(document.previous_scanned_hours),comparable:document.comparable,exactStartAt:null,exactEndAt:null};fail(typeof window.comparable==='boolean','overview_comparable');
 fail(Array.isArray(document.items)&&document.items.length<=OVERVIEW_LIMITS.items,'overview_item_bound');
 const rows=[],ids=new Set();let itemDays=0;
 for(const row of document.items){
  shape(row,ITEM);const id=integer(row.item_id,1,999999999);fail(!ids.has(id),'overview_duplicate_id');ids.add(id);fail(typeof row.cash==='boolean','overview_cash_flag');
  const out={itemId:id,sourceCashFlag:row.cash,recordedSalesCount:integer(row.sales),reportedUnitCount:integer(row.units),sourceReportedMesosLexeme:baseAmount(row.mesos,false),medianUnitPriceLexeme:baseAmount(row.median_unit_price),previousRecordedSalesCount:integer(row.previous_sales),previousMedianUnitPriceLexeme:baseAmount(row.previous_median_unit_price),days:[]};
  fail(Array.isArray(row.daily)&&row.daily.length<=OVERVIEW_LIMITS.baseDaysPerItem,'overview_base_daily_bound');const days=new Set();
  for(const point of row.daily){shape(point,DAY);const day=integer(point.day);fail(day%86400===0&&!days.has(day),'overview_duplicate_or_unaligned_day');days.add(day);out.days.push({sourceDayEpochSeconds:day,medianUnitPriceLexeme:baseAmount(point.median_unit_price),recordedSalesCount:integer(point.sales),reportedUnitCount:integer(point.units)});itemDays++;}
  out.days.sort((a,b)=>a.sourceDayEpochSeconds-b.sourceDayEpochSeconds);rows.push(out);
 }
 rows.sort((a,b)=>a.itemId-b.itemId);
 const value=freeze({source:{...source,sourceGeneratedAt:generatedAt},window,rows,itemDays,generatedEpoch:generated});
 // Raw SHA plus fixed algorithm/version/context binds deterministic projection without a giant typed-hash tree.
 const descriptor=freeze({schemaVersion:1,profileVersion:OVERVIEW_PROFILE,source:value.source,window:value.window,itemCount:rows.length,itemDayCount:itemDays});
 const handle=freeze({...descriptor,kind:'validated_overview_profile_not_owner_authority',profileHash:await portableHash(descriptor),sourceActorsExported:false,publicationEligible:false});
 STATE.set(handle,value);return handle;
}

export function overviewMembership(handle){
 const v=state(handle);return freeze({ids:v.rows.map(r=>r.itemId),sourceGeneratedAt:v.source.sourceGeneratedAt,sourceGeneratedAtKind:'publisher_generation_not_individual_sale_time'});
}
function derivedRows(handle){
 const v=state(handle);capacity(v.itemDays<=OVERVIEW_LIMITS.itemDays,'overview_derived_item_day_bound');
 derived(v.generatedEpoch>=1&&v.generatedEpoch<=253402300799,'overview_derived_publication_range');
 for(const n of [v.window.windowHours,v.window.scannedHours,v.window.previousScannedHours])derived(n<=100000,'overview_derived_window_bound');
 function* rows(){for(const row of v.rows){
  capacity(row.days.length<=OVERVIEW_LIMITS.derivedDaysPerItem,'overview_derived_daily_bound');
  const out={itemId:row.itemId,sourceCashFlag:row.sourceCashFlag,recordedSalesCount:row.recordedSalesCount,reportedUnitCount:row.reportedUnitCount,sourceReportedMesosLexeme:canonicalAmount(row.sourceReportedMesosLexeme),medianUnitPriceLexeme:canonicalAmount(row.medianUnitPriceLexeme),previousRecordedSalesCount:row.previousRecordedSalesCount,previousMedianUnitPriceLexeme:canonicalAmount(row.previousMedianUnitPriceLexeme),days:[]};
  for(const point of row.days){derived(point.sourceDayEpochSeconds<=253402214400,'overview_derived_day_range');const day=new Date(point.sourceDayEpochSeconds*1000).toISOString().slice(0,10);derived(day<=v.source.sourceGeneratedAt.slice(0,10),'overview_future_daily_day');out.days.push({day,medianUnitPriceLexeme:canonicalAmount(point.medianUnitPriceLexeme),recordedSalesCount:point.recordedSalesCount,reportedUnitCount:point.reportedUnitCount});}
  yield out;
 }}
 return {value:v,rows:rows()};
}
export async function overviewIndex79Capture(handle,{definition}={}){
 const spec=definitionData(definition),{value,rows}=derivedRows(handle),ids=new Set([...spec.goods,...spec.cash].map(r=>r.itemId)),selected=[];
 for(const row of rows)if(ids.has(row.itemId))selected.push({itemId:row.itemId,sourceCashFlag:row.sourceCashFlag,days:row.days});
 const body=freeze({schemaVersion:1,kind:'private_api_index_daily_capture',definitionHash:definition.definitionHash,source:value.source,rows:selected});
 return validateIndexCapture({...body,captureHash:await portableHash(body)},{definition});
}
export async function overviewDerivedCapture(handle){
 const {value,rows}=derivedRows(handle),header={schemaVersion:1,kind:'private_normalized_overview_capture',profileVersion:OVERVIEW_PROFILE,profileHash:handle.profileHash,source:value.source,window:value.window,publicationEligible:false,sourceActorsExported:false,individualTradesQualified:0},selected=[];
 // Account rows incrementally; never materialize an arbitrarily oversized final JSON string.
 let byteCount=enc.encode(JSON.stringify({...header,rows:[]})).byteLength;
 for(const row of rows){byteCount+=enc.encode(JSON.stringify(row)).byteLength+(selected.length?1:0);capacity(byteCount<=OVERVIEW_LIMITS.derivedBytes,'overview_derived_byte_bound');selected.push(row);}
 const capture=freeze({...header,rows:selected}),body=enc.encode(JSON.stringify(capture));capacity(body.byteLength===byteCount&&body.byteLength<=OVERVIEW_LIMITS.derivedBytes,'overview_derived_byte_bound');
 const bodySha256=await sha256(body);
 return freeze({capture,bodySha256,bodyBytes:body.byteLength,hashMethod:'sha256-exact-json-utf8-overview-derived-v1'});
}
