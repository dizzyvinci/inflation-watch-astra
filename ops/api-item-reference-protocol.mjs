// Closed, per-item public contract only. No private path, provider call or route.
import {assertSafeItemDto,sha256} from './api-price-item-dto.mjs';
const HASH=/^[a-f0-9]{64}$/,enc=new TextEncoder(),check=v=>{if(!v)throw TypeError('Invalid item reference');};
export async function validatePublicItemReference(v){
 v=structuredClone(v);check(enc.encode(JSON.stringify(v)).length<=300000);
 const keys=['schemaVersion','kind','itemId','projectionGeneration','dtoSha256','sourceCapturedAt','sourceObservedAt','reportedWindowDays','exactWindowBoundsKnown','qualifiedIndividualTrades','sourceCreditUrl','item'];
 check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(','));assertSafeItemDto(v.item);
 check(v.schemaVersion===1&&v.kind==='api_item_price_reference'&&v.itemId===v.item.itemId&&HASH.test(v.projectionGeneration)&&HASH.test(v.dtoSha256)&&v.sourceCapturedAt===v.item.source.retrievedAt&&v.sourceObservedAt===null&&v.reportedWindowDays===3&&v.exactWindowBoundsKnown===false&&v.qualifiedIndividualTrades===0&&v.sourceCreditUrl===`https://maplestory.market/items/${v.itemId}?ref=v6kkdvp6`);
 check(await sha256(enc.encode(JSON.stringify(v.item)))===v.dtoSha256);return v;
}
export async function makePublicItemReference(dto,generation,dtoHash){
 const value={schemaVersion:1,kind:'api_item_price_reference',itemId:dto.itemId,projectionGeneration:generation,dtoSha256:dtoHash,sourceCapturedAt:dto.source.retrievedAt,sourceObservedAt:null,reportedWindowDays:3,exactWindowBoundsKnown:false,qualifiedIndividualTrades:0,sourceCreditUrl:`https://maplestory.market/items/${dto.itemId}?ref=v6kkdvp6`,item:dto};return validatePublicItemReference(value);
}
