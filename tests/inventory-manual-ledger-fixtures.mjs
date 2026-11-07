import{createIdentityIndex,createPriceSnapshot,sha256}from'../ui-src/inventory-manual/deps/api-price-item-dto.mjs';
import{makePublicItemReference}from'../ui-src/inventory-manual/deps/api-item-reference-protocol.mjs';
const E=new TextEncoder();
export async function refs({generation='a'.repeat(64),capturedAt='2026-11-06T12:00:00.000Z',count=10}={}){
 const metadata=E.encode(JSON.stringify([{id:9000001,name:'Synthetic material'},{id:9000002,name:'Synthetic equipment'}])),identities=await createIdentityIndex([{raw:metadata,expectedSha256:await sha256(metadata),sourceUrl:'https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000',format:'noncash_list'}]);
 const raw=E.encode(JSON.stringify([9000001,9000002].map(item_id=>({item_id,sold:{sales:count,units:999,day_sales:0,day_units:0,avg_unit_price:999,median_unit_price:10.25},seen:null,reference:null,by_stats:[{upgrades:1,slots_left:3,stats:{16:2},reference:{unit_price:20.125,basis:'sold',samples:10,scope:'stats'}}]}))));
 const snapshot=await createPriceSnapshot(raw,{identities,expectedSha256:await sha256(raw),context:{operation:'prices',sourceUrl:'https://maplestory.market/api/prices',capturedAt,sourceObservedAt:null,captureTimeKind:'http_response_completed'}});
 return Promise.all([9000001,9000002].map(async id=>{const dto=snapshot.getItem(id),hash=await sha256(E.encode(JSON.stringify(dto)));return makePublicItemReference(dto,generation,hash);}));
}
export const entry=(overrides={})=>({entryId:'row-1',itemId:9000001,quantity:'3',unitFactor:'1',unitConfirmed:true,tradeable:'yes',kind:'commodity',upgrades:null,slots:null,stats:null,reportedSignatureAcknowledged:false,...overrides});
