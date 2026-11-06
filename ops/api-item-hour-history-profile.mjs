// Pure retained-hourly profile. No network, filesystem, key, route or persistence.
import {parseStrictJson,isOriginalJsonNumber} from './api-raw-prices-decoder.mjs';
import {portableHash} from './portable-hash.mjs';
export const HISTORY_METHOD='retained-item-hour-aggregate-v1';
export class ItemHistoryContractError extends TypeError{}
const check=(v,why)=>{if(!v)throw new ItemHistoryContractError(why);};
const HEX=/^[a-f0-9]{64}$/,MAX=BigInt(Number.MAX_SAFE_INTEGER),enc=new TextEncoder();
const exact=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&!isOriginalJsonNumber(v)&&Object.keys(v).sort().join('|')===keys.split(' ').sort().join('|'),'history_fields');
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>{check(isOriginalJsonNumber(v)&&/^(?:0|[1-9][0-9]*)$/.test(v.token),'history_integer_token');const n=BigInt(v.token);check(n>=BigInt(min)&&n<=BigInt(max)&&n<=MAX,'history_integer_bound');return Number(n);};
const clock=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
function decimal(v,positive){
 check(isOriginalJsonNumber(v)&&v.token.length<=256,'history_price_token');const token=v.token,m=/^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);check(m,'history_decimal');
 const digits=(m[2]+(m[3]||'')).replace(/^0+/,''),exponent=Number(m[4]||0)-(m[3]||'').length;check(!(m[1]&&digits)&&Number.isSafeInteger(exponent)&&Math.abs(exponent)<=1000&&(!positive||digits.length>0),'history_nonnegative_price');return{token,digits,power:exponent};
}
function compare(a,b){if(!a.digits)return b.digits?-1:0;if(!b.digits)return 1;const x=a.digits.length+a.power,y=b.digits.length+b.power;if(x!==y)return x<y?-1:1;const n=Math.max(a.digits.length,b.digits.length),left=a.digits.padEnd(n,'0'),right=b.digits.padEnd(n,'0');return left===right?0:left<right?-1:1;}
function prices(v,keys){const values=keys.map(k=>decimal(v[k],true));check(values.every((x,i)=>!i||compare(values[i-1],x)<=0),'history_quantile_order');return Object.fromEntries(keys.map((k,i)=>[k,values[i].token]));}
function seen(v){if(v===null)return null;exact(v,'listings min_unit_price median_unit_price max_unit_price');return{reportedListingCount:integer(v.listings),...prices(v,['min_unit_price','median_unit_price','max_unit_price']),basis:'source_seen_asking_prices',currentAvailabilityVerified:false};}
function sold(v){if(v===null)return null;exact(v,'bundles units min_unit_price avg_unit_price max_unit_price p25_unit_price median_unit_price p75_unit_price');return{reportedBundles:integer(v.bundles),reportedUnits:integer(v.units),...prices(v,['min_unit_price','p25_unit_price','median_unit_price','p75_unit_price','max_unit_price']),avg_unit_price:decimal(v.avg_unit_price,false).token,basis:'source_labeled_sold_hourly_aggregate_not_individual_trades',bundlesEquivalentToSalesVerified:false};}
export function historyOperation(operation){
 if(operation==='apple-history')return{itemId:2010001,sourceUrl:'https://maplestory.market/api/items/2010001/history'};
 const m=/^(?:observed|recurring)-history-([1-9][0-9]{0,8})$/.exec(operation);if(!m)return null;const itemId=Number(m[1]);return{itemId,sourceUrl:`https://maplestory.market/api/items/${itemId}/history`};
}
export async function historyByteHash(bytes){return[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function projectItemHistoryReceipt(input,expected){
 // Capture original immutable primitive receipt metadata BEFORE any await.
 const fields=['kind','operation','sourceUrl','httpStatus','attemptId','grantReference','roundReference','requestStartedAt','capturedAt','rawBodyEncoding','rawBodyBase64','responseBytes','responseSha256','sourceObservedAt','observationTimestampKnown','schemaVerified','publicationEligible','captureTimeKind','expectedItemId','observedPlanSha256','recurringPolicyReference','recurringPolicySha256','recurringRegistryCaptureHash','recurringCycle','recurringCadenceSeconds'];
 const e=Object.freeze(Object.fromEntries(fields.map(k=>[k,input?.[k]]))),x=Object.freeze({...expected,...(expected.recurringMetadata?{recurringMetadata:Object.freeze(structuredClone(expected.recurringMetadata))}:{})}),definition=historyOperation(e.operation);
 check(definition&&definition.itemId===x.itemId&&definition.sourceUrl===x.sourceUrl&&e.operation===x.operation&&e.sourceUrl===x.sourceUrl,'history_owned_operation_target');
 if(x.recurringMetadata)for(const key of Object.keys(x.recurringMetadata))if(key!=='expectedItemName'&&key!=='identityStatus')check(e[key]===x.recurringMetadata[key],'history_recurring_cycle_context');
 check((e.expectedItemId===undefined||e.expectedItemId===x.itemId)&&(e.observedPlanSha256===undefined||e.observedPlanSha256===x.observedPlanHash),'history_expected_metadata_target');
 check(e.kind==='unverified_provider_api_receipt'&&e.httpStatus===200&&e.rawBodyEncoding==='base64'&&e.sourceObservedAt===null&&e.observationTimestampKnown===false&&e.schemaVerified===false&&e.publicationEligible===false&&e.captureTimeKind==='http_response_completed','history_receipt_flags');
 check(Number.isSafeInteger(e.attemptId)&&e.attemptId>0&&e.attemptId===x.attemptId&&e.grantReference===x.grantReference&&e.roundReference===x.roundReference&&typeof e.grantReference==='string'&&typeof e.roundReference==='string','history_owned_attempt_context');
 check(clock(e.requestStartedAt)&&clock(e.capturedAt)&&e.requestStartedAt<=e.capturedAt&&e.requestStartedAt===x.requestStartedAt,'history_original_clock');
 check(Number.isSafeInteger(e.responseBytes)&&e.responseBytes>0&&e.responseBytes<=5000000&&HEX.test(e.responseSha256)&&typeof e.rawBodyBase64==='string'&&e.rawBodyBase64.length<=6666668&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e.rawBodyBase64),'history_raw_bound');
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';check(e.rawBodyBase64.endsWith('==')?(alphabet.indexOf(e.rawBodyBase64.at(-3))&15)===0:e.rawBodyBase64.endsWith('=')?(alphabet.indexOf(e.rawBodyBase64.at(-2))&3)===0:true,'history_canonical_base64');
 const key=`_private/provider-api/v1/receipts/${String(e.attemptId).padStart(12,'0')}-${e.operation}-${e.responseSha256}.json`;check(x.receiptKey===key,'history_owned_receipt_key');
 const raw=Uint8Array.from(atob(e.rawBodyBase64),c=>c.charCodeAt(0));check(raw.length===e.responseBytes&&await historyByteHash(raw)===e.responseSha256,'history_raw_integrity');
 check(!(raw[0]===239&&raw[1]===187&&raw[2]===191),'history_unexpected_bom');let values;try{values=parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw new ItemHistoryContractError('history_json_or_utf8');}check(Array.isArray(values)&&values.length<=10000,'history_rows');let previous=0;
 const rows=values.map(v=>{exact(v,'hour seen sold');const at=integer(v.hour,946684800,4102444799);check(at%3600===0&&at>previous,'history_hour_order');previous=at;return{providerBucketEpochSeconds:at,providerBucketTimestampUtc:new Date(at*1000).toISOString().replace('.000Z','Z'),seen:seen(v.seen),sold:sold(v.sold),sourceObservedAt:null,bucketCompletionKnown:false,exactBucketStartAt:null,exactBucketEndAt:null,qualityConstant:false,variantIdentity:null};});
 const first=rows[0]?.providerBucketEpochSeconds??null,last=rows.at(-1)?.providerBucketEpochSeconds??null,span=first===null?null:(last-first)/3600+1;
 const context={operation:e.operation,grantReference:e.grantReference,roundReference:e.roundReference,itemId:x.itemId,sourceUrl:e.sourceUrl,attemptId:e.attemptId,rawBodySha256:e.responseSha256,rawBytes:raw.length,requestStartedAt:e.requestStartedAt,capturedAt:e.capturedAt,sourceObservedAt:null,captureTimeKind:e.captureTimeKind,itemIdBinding:'owned_request_context_no_item_id_or_name_echo_in_history',...(x.recurringMetadata?{recurringMetadata:x.recurringMetadata}:{})};
 const dto={schemaVersion:1,kind:'private_item_hourly_aggregate_capture',methodVersion:HISTORY_METHOD,context,priceRepresentation:'original_JSON_decimal_lexeme_not_binary64_price',priceUnitMeaning:'source_unit_price_fields_physical_stack_conversion_unverified',individualTradesQualified:0,publicationEligible:false,sourceObservedAt:null,qualityConstant:false,variantIdentity:null,retentionWindowKnown:false,rows,coverage:{retainedBucketRows:rows.length,expectedHoursInInclusiveSpan:span,missingBucketHours:span===null?null:span-rows.length,firstBucketTimestampUtc:rows[0]?.providerBucketTimestampUtc??null,lastBucketTimestampUtc:rows.at(-1)?.providerBucketTimestampUtc??null,seenBranches:rows.filter(r=>r.seen!==null).length,soldBranches:rows.filter(r=>r.sold!==null).length,nullSoldMeansVerifiedZero:false,missingBucketMeansZero:false}};
 return freeze({...dto,captureHash:await portableHash(dto)});
}

export function validateProjectedHour(row){
 exact(row,'providerBucketEpochSeconds providerBucketTimestampUtc seen sold sourceObservedAt bucketCompletionKnown exactBucketStartAt exactBucketEndAt qualityConstant variantIdentity');const at=row.providerBucketEpochSeconds;
 check(Number.isSafeInteger(at)&&at>=946684800&&at<4102444800&&at%3600===0&&row.providerBucketTimestampUtc===new Date(at*1000).toISOString().replace('.000Z','Z')&&row.sourceObservedAt===null&&row.bucketCompletionKnown===false&&row.exactBucketStartAt===null&&row.exactBucketEndAt===null&&row.qualityConstant===false&&row.variantIdentity===null,'history_saved_bucket');
 const price=(v,positive)=>{check(typeof v==='string','history_saved_decimal');return decimal(parseStrictJson(v),positive);};
 for(const [kind,value]of [['seen',row.seen],['sold',row.sold]]){if(value===null)continue;
  const fields=kind==='seen'?'reportedListingCount min_unit_price median_unit_price max_unit_price basis currentAvailabilityVerified':'reportedBundles reportedUnits min_unit_price p25_unit_price median_unit_price p75_unit_price max_unit_price avg_unit_price basis bundlesEquivalentToSalesVerified';exact(value,fields);
  const keys=kind==='seen'?['min_unit_price','median_unit_price','max_unit_price']:['min_unit_price','p25_unit_price','median_unit_price','p75_unit_price','max_unit_price'],prices=keys.map(k=>price(value[k],true));check(prices.every((p,i)=>!i||compare(prices[i-1],p)<=0),'history_saved_quantiles');
  const counts=kind==='seen'?[value.reportedListingCount]:[value.reportedBundles,value.reportedUnits];check(counts.every(v=>Number.isSafeInteger(v)&&v>=0),'history_saved_counts');
  if(kind==='seen')check(value.basis==='source_seen_asking_prices'&&value.currentAvailabilityVerified===false,'history_saved_asking_basis');else{price(value.avg_unit_price,false);check(value.basis==='source_labeled_sold_hourly_aggregate_not_individual_trades'&&value.bundlesEquivalentToSalesVerified===false,'history_saved_sold_basis');}
 }
 return row;
}
