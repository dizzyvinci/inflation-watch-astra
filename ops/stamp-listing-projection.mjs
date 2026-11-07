// WORK-only pure safe-slice admission/ranking plus explicit bounded owner witness adapter.
// No raw-body reader, actor parser, transport, persistence, scheduler or publication.
import {ApiCollectorCore} from './api-collector-core.mjs';
import {selectFixedFashionSource,FIXED_FASHION} from './fixed-fashion-listing-source.mjs';
import {bindRecurringCompleted} from './api-item-recurring.mjs';
import {decodeCanonicalBase64} from './bounded-base64.mjs';
import {parseListingChannel,originalNumberToken} from './actor-free-listing-json.mjs';
const WITNESSES=new WeakMap(),CAPTURES=new WeakMap(),REGISTRIES=new WeakMap();
const HEX=/^[a-f0-9]{64}$/,MAX=Number.MAX_SAFE_INTEGER,enc=new TextEncoder();
export const LISTING_LIMITS=Object.freeze({sliceBytes:1048576,rows:1000,registryBytes:262144,registryRows:512,captures:512});
export const KNOWN_LISTING_PROFILE=Object.freeze({id:'retained-apple-null-equip-v1',itemId:2010001,kind:'old_apple_structure_only_not_fashion',currency:'mesos',generalFashionVerified:false});
const check=(v,c)=>{if(!v)throw TypeError(c)};
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v)}return v};
const exact=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.split(' ').sort().join('|'),'closed_fields');
const integer=(v,min=0,max=MAX)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
function canonical(text,max){check(typeof text==='string'&&enc.encode(text).length>0&&enc.encode(text).length<=max,'input_bytes');let v;try{v=JSON.parse(text)}catch{throw TypeError('input_json')}check(JSON.stringify(v)===text,'noncanonical_or_duplicate_json');return v;}
export function exactPositivePrice(text){
 check(typeof text==='string'&&text.length<=256,'price_lexeme');const m=/^(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(text);check(m,'positive_price');let n=BigInt(m[1]+(m[2]||'')),power=Number(m[3]||0)-(m[2]||'').length;check(n>0n&&integer(Math.abs(power),0,1000),'price_bound');return power>=0?{n:n*10n**BigInt(power),d:1n}:{n,d:10n**BigInt(-power)};
}
const gcd=(a,b)=>{while(b){[a,b]=[b,a%b]}return a};
const ratio=(n,d)=>{const g=gcd(n,d);return Object.freeze({numerator:(n/g).toString(),denominator:(d/g).toString()})};
const rational=v=>({n:BigInt(v.numerator),d:BigInt(v.denominator)});
export function formatRationalTenth(value){const{n,d}=rational(value),t=(n*20n+d)/(d*2n),s=t.toString().padStart(2,'0');return s.slice(0,-1).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+s.slice(-1);}
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');

// This snapshots actual successful completed recurring-ledger metadata. It does
// NOT verify original bytes or establish a raw-to-sanitized-slice relationship.
export function bindCompletedListingWitness(ctx,core,receiptKey,frameText){
 check(core instanceof ApiCollectorCore&&core.ctx===ctx,'same_owner_required');const g=core.config();check(g.enabled===true&&!core.row('SELECT auth_stopped FROM api_control WHERE id=1').auth_stopped,'authority_paused');
 const frame=canonical(frameText,4096);exact(frame,'operation sourceUrl httpStatus attemptId grantReference roundReference requestStartedAt capturedAt responseSha256 responseBytes sourceObservedAt');
 const s=bindRecurringCompleted(core.sql,{grantReference:g.grantReference,roundReference:g.probeRound},receiptKey);
 check(/^recurring-detail-[1-9][0-9]{0,8}$/.test(s.operation)&&frame.operation===s.operation&&frame.sourceUrl===s.sourceUrl&&frame.httpStatus===200&&frame.attemptId===s.sourceAttempt&&frame.grantReference===s.grantReference&&frame.roundReference===s.roundReference&&frame.responseSha256===s.rawSha&&HEX.test(frame.responseSha256)&&integer(frame.responseBytes,1,5000000)&&frame.sourceObservedAt===null&&iso(frame.requestStartedAt)&&Date.parse(frame.requestStartedAt)===s.requestAt&&iso(frame.capturedAt)&&frame.requestStartedAt<=frame.capturedAt&&Date.parse(frame.capturedAt)<=core.clock(),'completed_receipt_frame_binding');
 const value=freeze({kind:'owned_completed_listing_receipt_metadata_witness',itemId:s.itemId,capturedAt:frame.capturedAt,requestStartedAt:frame.requestStartedAt,sourceUrl:s.sourceUrl,rawBodySha256:s.rawSha,rawBodyBytes:frame.responseBytes,originalByteChannelVerified:false,sanitizedSliceBoundToOriginalBytes:false});WITNESSES.set(value,{...value,completedSource:s});return value;
}
export async function createBoundEligibilityRegistry(text,expectedSha256){
 // expected hash is an owner-code/operator pin, not a value derived from browser input.
 check(typeof expectedSha256==='string'&&HEX.test(expectedSha256),'registry_expected_hash');const raw=enc.encode(text),v=canonical(text,LISTING_LIMITS.registryBytes);check(await hash(raw)===expectedSha256,'registry_hash');exact(v,'schemaVersion kind validFrom expiresAt rows');check(v.schemaVersion===1&&v.kind==='reviewed_conditional_stamp_eligibility'&&iso(v.validFrom)&&iso(v.expiresAt)&&v.validFrom<v.expiresAt&&Array.isArray(v.rows)&&v.rows.length<=512,'registry_profile');const ids=new Set();for(const r of v.rows){exact(r,'itemId status stamps');check(integer(r.itemId,1,999999999)&&!ids.has(r.itemId)&&['eligible','ineligible','unknown'].includes(r.status)&&(r.status==='eligible'?integer(r.stamps,1,20):r.stamps===null),'registry_row');ids.add(r.itemId)}const out=freeze({...v,registrySha256:expectedSha256,authorityMeaning:'exact_expected_registry_hash_not_independent_official_rule_verification'});REGISTRIES.set(out,true);return out;
}
export function projectSanitizedListingSlice(text,witness,{profileId,currency}={}){
 const w=WITNESSES.get(witness);check(w,'branded_owned_witness_required');const v=canonical(text,LISTING_LIMITS.sliceBytes);exact(v,'itemId listings');check(v.itemId===w.itemId&&Array.isArray(v.listings)&&v.listings.length<=1000,'slice_target_or_bound');
 if(profileId!==KNOWN_LISTING_PROFILE.id||w.itemId!==KNOWN_LISTING_PROFILE.itemId){const out=freeze({status:'unavailable',reason:'unreviewed_item_or_fashion_profile',itemId:w.itemId,originalCapturedAt:w.capturedAt,candidates:[],availabilityVerified:false});CAPTURES.set(out,{w,rows:[]});return out;}
 check(currency==='mesos','unverified_currency');const rows=[],seen=new Set();for(const r of v.listings){
  exact(r,'snapshotId slot itemId priceLexeme unitPriceLexeme quantity perBundle soldOut listedAtEpochSeconds updatedAtEpochSeconds equip');
  check(integer(r.snapshotId,1)&&integer(r.slot)&&r.itemId===w.itemId&&integer(r.quantity)&&integer(r.perBundle,1)&&typeof r.soldOut==='boolean'&&r.equip===null,'listing_profile');
  check(integer(r.listedAtEpochSeconds,946684800,4102444799)&&integer(r.updatedAtEpochSeconds,r.listedAtEpochSeconds,4102444799)&&r.updatedAtEpochSeconds*1000<=Date.parse(w.capturedAt),'listing_original_clocks');
  check(typeof r.priceLexeme==='string'&&/^[1-9][0-9]*$/.test(r.priceLexeme)&&BigInt(r.priceLexeme)<=BigInt(MAX),'quote_integer_bound');const price=exactPositivePrice(r.priceLexeme),unit=exactPositivePrice(r.unitPriceLexeme);const k=r.snapshotId+':'+r.slot;check(!seen.has(k),'duplicate_listing_observation');seen.add(k);
  // Original profile does not establish stack conversion. Only source-reported
  // single-copy lots with exact quote==unit price are comparable for stamp cost.
  const comparable=r.perBundle===1&&price.n*unit.d===unit.n*price.d;
  rows.push(freeze({itemId:w.itemId,priceLexeme:r.priceLexeme,unitPriceLexeme:r.unitPriceLexeme,reportedQuantity:r.quantity,reportedPerBundle:r.perBundle,soldOut:r.soldOut,currency:'mesos',reportedListedAt:new Date(r.listedAtEpochSeconds*1000).toISOString(),reportedUpdatedAt:new Date(r.updatedAtEpochSeconds*1000).toISOString(),originalCapturedAt:w.capturedAt,quoteBasis:comparable?'source_reported_one_per_bundle_quote':'unit_or_bundle_semantics_unverified',costComparable:comparable,physicalUnitSemanticsVerified:false,variantState:'null_equipment_profile_only',tradability:'unknown',unopenedState:'unknown',availabilityVerified:false}));
 }
 const out=freeze({status:'projected_reviewed_profile',itemId:w.itemId,profileId,currency:'mesos',originalCapturedAt:w.capturedAt,originalRequestStartedAt:w.requestStartedAt,sourceObservedAt:null,originalByteChannelVerified:false,sanitizedSliceBoundToOriginalBytes:false,availabilityVerified:false,listingRows:rows.length,candidates:rows});CAPTURES.set(out,{w,rows});return out;
}
export function rankReportedStampAsks(captures,registry,{asOf,thresholdMesosPerStampLexeme='30000'}={}){
 check(Array.isArray(captures)&&captures.length<=512&&REGISTRIES.has(registry)&&iso(asOf),'ranking_input');const threshold=exactPositivePrice(thresholdMesosPerStampLexeme),now=Date.parse(asOf),active=asOf>=registry.validFrom&&asOf<registry.expiresAt;
 const latest=new Map(),conflict=new Set();for(const c of captures){const data=CAPTURES.get(c);check(data,'branded_projected_capture_required');check(Date.parse(c.originalCapturedAt)<=now,'future_capture');const old=latest.get(c.itemId);if(!old||old.originalCapturedAt<c.originalCapturedAt){latest.set(c.itemId,c);conflict.delete(c.itemId)}else if(old.originalCapturedAt===c.originalCapturedAt&&JSON.stringify(old)!==JSON.stringify(c))conflict.add(c.itemId)}
 const result=[],coverage={eligibleTypes:registry.rows.filter(r=>r.status==='eligible').length,unknownEligibilityTypes:registry.rows.filter(r=>r.status==='unknown').length,captureTypes:latest.size,unsupportedProfileTypes:0,pricedTypes:0,conflictedTypes:conflict.size};
 for(const rule of registry.rows){const c=latest.get(rule.itemId);if(!c||rule.status!=='eligible'||!active||conflict.has(rule.itemId))continue;if(c.status!=='projected_reviewed_profile'&&c.status!=='projected_original_generic_quote_fields'){coverage.unsupportedProfileTypes++;continue}let best=null;for(const r of c.candidates){if(r.soldOut||r.reportedQuantity===0||!r.costComparable)continue;const p=exactPositivePrice(r.priceLexeme),cost=ratio(p.n,p.d*BigInt(rule.stamps));if(!best){best={r,p,cost};continue}const a=rational(cost),b=rational(best.cost);if(a.n*b.d<b.n*a.d)best={r,p,cost};}
  if(best){const q=rational(best.cost);result.push(freeze({...best.r,stampsPerReportedUnit:rule.stamps,requiredUpfrontMesosLexeme:best.r.priceLexeme,mesosPerStamp:best.cost,displayMesosPerStamp:formatRationalTenth(best.cost),underThresholdPerStamp:q.n*threshold.d<threshold.n*q.d,underThresholdIsUpfrontBudget:false,eligibilityRegistrySha256:registry.registrySha256,eligibilityCheckedAt:asOf,originalByteChannelVerified:false,sanitizedSliceBoundToOriginalBytes:false}));coverage.pricedTypes++;}
 }
 result.sort((a,b)=>{const x=rational(a.mesosPerStamp),y=rational(b.mesosPerStamp),delta=x.n*y.d-y.n*x.d;return delta<0n?-1:delta>0n?1:a.itemId-b.itemId});return freeze({status:active?'reported_asking_candidates':'eligibility_season_inactive',basis:'minimum_reported_comparable_asking_quote_not_median_or_live_floor',rows:result,coverage,availabilityVerified:false,individualTrades:0,completeMarketCoverageVerified:false,sourceClocksRenewed:false,sourceClockMeaning:'original_HTTP_capture_distinct_provider_reported_listing_times'});
}

// Separate original-byte path. It does not invoke the Apple safe-slice profile.
// No raw/store/equip/player values or private ledger IDs are included in output.
export async function projectOriginalListingEnvelope(envelopeBytes,witness){
 const owned=WITNESSES.get(witness);check(owned?.completedSource,'branded_owned_witness_required');check(envelopeBytes instanceof Uint8Array&&envelopeBytes.length>0&&envelopeBytes.length<=12582912,'envelope_bound');
 // Own the entire original channel BEFORE the first digest await.
 const original=new Uint8Array(envelopeBytes),e=parseListingChannel(original,'envelope'),s=owned.completedSource;
 const ni=(v,min=0,max=MAX)=>{const token=originalNumberToken(v);check(typeof token==='string'&&/^(?:0|[1-9][0-9]*)$/.test(token),'original_integer');const n=BigInt(token);check(n>=BigInt(min)&&n<=BigInt(max),'original_integer_bound');return Number(n)};
 check(e&&e.kind==='unverified_provider_api_receipt'&&e.operation===s.operation&&e.sourceUrl===s.sourceUrl&&ni(e.httpStatus)===200&&ni(e.attemptId,1)===s.sourceAttempt&&e.grantReference===s.grantReference&&e.roundReference===s.roundReference&&e.requestStartedAt===owned.requestStartedAt&&e.capturedAt===owned.capturedAt,'original_receipt_context');
 if(s.planHash)check(e.observedPlanSha256===s.planHash&&ni(e.expectedItemId,1)===FIXED_FASHION.itemId,'original_observed_plan');
 check(e.captureTimeKind==='http_response_completed'&&e.sourceObservedAt===null&&e.observationTimestampKnown===false&&e.schemaVerified===false&&e.publicationEligible===false&&e.rawBodyEncoding==='base64'&&e.responseSha256===owned.rawBodySha256&&ni(e.responseBytes,1,5000000)===owned.rawBodyBytes,'original_receipt_flags');
 let raw;try{raw=decodeCanonicalBase64(e.rawBodyBase64,owned.rawBodyBytes)}catch{throw TypeError('original_base64')}
 check(await hash(raw)===owned.rawBodySha256,'original_raw_sha');const envelopeSha256=await hash(original),v=parseListingChannel(raw,'detail');
 const fields=(o,list)=>check(o&&Array.isArray(o._sourceFields)&&o._sourceFields.slice().sort().join('|')===list.split(' ').sort().join('|'),'generic_listing_fields');
 fields(v,'item_id stats listings npc craft used_in recent_sales');check(ni(v.item_id,1,999999999)===owned.itemId&&Array.isArray(v.listings),'original_item_target');
 const rows=[],seen=new Set();for(const r of v.listings){
  fields(r,'snapshot_id store updated_at listed_at item_id slot price quantity per_bundle equip unit_price sold_out');check(ni(r.item_id,1,999999999)===owned.itemId,'original_listing_target');
  const snapshot=ni(r.snapshot_id,1),slot=ni(r.slot),key=snapshot+':'+slot;check(!seen.has(key),'duplicate_listing_observation');seen.add(key);
  const listed=ni(r.listed_at,946684800,4102444799),updated=ni(r.updated_at,listed,4102444799);check(updated*1000<=Date.parse(owned.capturedAt),'original_listing_future');
  const quote=originalNumberToken(r.price),unit=originalNumberToken(r.unit_price);check(typeof quote==='string'&&/^[1-9][0-9]*$/.test(quote)&&BigInt(quote)<=BigInt(MAX),'original_quote_bound');exactPositivePrice(unit);check(typeof r.sold_out==='boolean','original_sold_out');
  rows.push(freeze({itemId:owned.itemId,priceLexeme:quote,unitPriceLexeme:unit,reportedQuantity:ni(r.quantity),reportedPerBundle:ni(r.per_bundle,1),soldOut:r.sold_out,currency:'unknown',currencyQualification:'generic_docs_mesos_context_not_independently_verified_field',reportedListedAt:new Date(listed*1000).toISOString(),reportedUpdatedAt:new Date(updated*1000).toISOString(),originalCapturedAt:owned.capturedAt,quoteBasis:'source_reported_listing_quote_not_median',costComparable:false,physicalUnitSemanticsVerified:false,variantState:'not_inspected_unused_equipment_subtree',tradability:'unknown',unopenedState:'unknown',copyStampEligibility:'unknown_requires_game_confirmation',availabilityVerified:false}));
 }
 const encodedSafeRows=enc.encode(JSON.stringify(rows));check(encodedSafeRows.length<=1048576,'quote_projection_capacity_hold');
 const out=freeze({status:'projected_original_generic_quote_fields',itemId:owned.itemId,profileId:'generic-item-detail-safe-quote-v1',currency:'unknown',originalCapturedAt:owned.capturedAt,originalRequestStartedAt:owned.requestStartedAt,sourceObservedAt:null,originalByteChannelVerified:true,sanitizedSliceBoundToOriginalBytes:true,originalRawSha256:owned.rawBodySha256,originalEnvelopeSha256:envelopeSha256,safeQuoteProjectionHash:await hash(encodedSafeRows),availabilityVerified:false,listingRows:rows.length,receiptEnvelopeStorageOriginVerified:false,sqlCapturedAtAttestation:false,unitAndCopyQualification:'unverified_excluded_from_stamp_ranking',actualFashionPayloadPreviouslyReviewed:false,candidates:rows});CAPTURES.set(out,{w:owned,rows});return out;
}

export function bindFixedFashionListingWitness(ctx,core,receiptKey,frameText){
 const s=selectFixedFashionSource(ctx,core);check(s.receiptKey===receiptKey,'fixed_receipt_changed');const frame=canonical(frameText,4096);exact(frame,'operation sourceUrl httpStatus attemptId grantReference roundReference requestStartedAt capturedAt responseSha256 responseBytes sourceObservedAt');
 check(frame.operation===s.operation&&frame.sourceUrl===s.sourceUrl&&frame.httpStatus===200&&frame.attemptId===s.sourceAttempt&&frame.grantReference===s.grantReference&&frame.roundReference===s.roundReference&&frame.responseSha256===s.rawSha&&integer(frame.responseBytes,1,5000000)&&frame.sourceObservedAt===null&&iso(frame.requestStartedAt)&&Date.parse(frame.requestStartedAt)===s.requestAt&&iso(frame.capturedAt)&&frame.requestStartedAt<=frame.capturedAt&&Date.parse(frame.capturedAt)<=core.clock(),'fixed_original_frame');
 const value=freeze({kind:'owned_completed_listing_receipt_metadata_witness',itemId:s.itemId,capturedAt:frame.capturedAt,requestStartedAt:frame.requestStartedAt,sourceUrl:s.sourceUrl,rawBodySha256:s.rawSha,rawBodyBytes:frame.responseBytes,originalByteChannelVerified:false,sanitizedSliceBoundToOriginalBytes:false});WITNESSES.set(value,{...value,completedSource:s});return value;
}
