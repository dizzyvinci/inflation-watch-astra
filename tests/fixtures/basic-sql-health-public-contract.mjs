// Pure thin-value contract. Structural/hash validity is not origin authentication.
import definition from './basic-sql-health-definition-v1.json' with {type:'json'};
import {sha256,parseStrictJson} from '../../ops/api-price-item-dto.mjs';
import {B,need,exact,integer,iso,hash,enc} from '../../ops/api-basic-current-contract.mjs';
export const BASIC_PUBLIC_DEFINITION_SHA='3d7f8257dda8568ab99e743a4e6adee8ca911786528b5e56919d65675a724705';
export const BASIC_PRIVATE_CONTRACT_SHA='26679889a74809b0ba8e0f87ff3ef52ab93bca18690ac05dab5b7c7061eb3a23';
export const BASIC_PUBLIC_MAX_BYTES=8192;
Object.freeze(definition.rowColumns);Object.freeze(definition);
const proto=Object.getPrototypeOf(Uint8Array.prototype),byteLength=Object.getOwnPropertyDescriptor(proto,'byteLength').get,tag=Object.getOwnPropertyDescriptor(proto,Symbol.toStringTag).get;
export function basicByteLength(raw,max){
 need(integer(max,1,B.totalBytes),'basic_public_max_bound');
 let n;try{need(tag.call(raw)==='Uint8Array','basic_public_byte_type');n=byteLength.call(raw);}catch{throw Error('basic_public_byte_type');}
 need(integer(n,1,max),'basic_public_byte_bound');return n;
}
export function ownBasicBytes(raw,max){
 const n=basicByteLength(raw,max);const out=new Uint8Array(n);Uint8Array.prototype.set.call(out,raw);return out;
}
export async function verifyBasicPublicDefinition(){need(await sha256(enc.encode(JSON.stringify(definition)+'\n'))===BASIC_PUBLIC_DEFINITION_SHA,'basic_public_definition');}
const money=v=>v===null||typeof v==='string'&&v.length<=160&&/^\d+(?:\.\d+)?$/.test(v);
export function basicPublicShape(v){
 exact(v,['schemaVersion','kind','profile','definitionHash','itemId','generation','sourceBodySha256','capturedAt','sourceObservedAt','captureTimeKind','reportedWindowDays','exactStartAt','exactEndAt','state','sold','asking','upstreamLatestInspected','fullVariantFreshness','availabilityKnown','lowestListingKnown','qualityMatched','verifiedIndividualTrades']);
 need(v.schemaVersion===1&&v.kind==='basic_current_item_reference'&&v.profile==='basic_aggregate_v1'&&v.definitionHash===BASIC_PUBLIC_DEFINITION_SHA&&integer(v.itemId,1,999999999)&&hash(v.generation)&&hash(v.sourceBodySha256),'basic_public_profile');iso(v.capturedAt);
 need(v.sourceObservedAt===null&&v.captureTimeKind==='http_response_completed'&&v.reportedWindowDays===3&&v.exactStartAt===null&&v.exactEndAt===null,'basic_public_source_clock');
 for(const k of ['upstreamLatestInspected','fullVariantFreshness','availabilityKnown','lowestListingKnown','qualityMatched','verifiedIndividualTrades'])need(v[k]===false,'basic_public_false_claim');
 need(['present_in_generation','absent_in_generation'].includes(v.state),'basic_public_state');
 if(v.state==='absent_in_generation')need(v.sold===null&&v.asking===null,'basic_public_absence');
 if(v.sold!==null){exact(v.sold,['medianUnitPrice','averageUnitPrice','reportedSalesCount','reportedUnitCount','reportedDaySalesCount','reportedDayUnitCount']);need(money(v.sold.medianUnitPrice)&&money(v.sold.averageUnitPrice),'basic_public_sold_money');for(const k of ['reportedSalesCount','reportedUnitCount','reportedDaySalesCount','reportedDayUnitCount'])need(integer(v.sold[k]),'basic_public_sold_count');Object.freeze(v.sold);}
 if(v.asking!==null){exact(v.asking,['medianUnitPrice','reportedListingCount','reportedSellerCount']);need(money(v.asking.medianUnitPrice)&&integer(v.asking.reportedListingCount)&&integer(v.asking.reportedSellerCount),'basic_public_asking');Object.freeze(v.asking);}
 return Object.freeze(v);
}
export async function parseBasicPublicItem(raw,{expectedItemId,expectedDefinitionHash,expectedPayloadSha256,expectedGeneration,expectedCapturedAt,signal=null,monotonic=()=>performance.now(),waitMs=30000}={}){
 need(integer(expectedItemId,1,999999999)&&expectedDefinitionHash===BASIC_PUBLIC_DEFINITION_SHA&&hash(expectedPayloadSha256)&&hash(expectedGeneration)&&integer(waitMs,1,30000),'basic_public_expectations');iso(expectedCapturedAt);
 const end=monotonic()+waitMs,fence=()=>need(!signal?.aborted&&Number.isFinite(end)&&monotonic()<end,'basic_public_deadline');fence();
 const owned=ownBasicBytes(raw,BASIC_PUBLIC_MAX_BYTES);await verifyBasicPublicDefinition();fence();need(await sha256(owned)===expectedPayloadSha256,'basic_public_body_hash');fence();
 const v=basicPublicShape(parseStrictJson(owned));need(v.itemId===expectedItemId&&v.generation===expectedGeneration&&v.capturedAt===expectedCapturedAt,'basic_public_binding');fence();return v;
}
