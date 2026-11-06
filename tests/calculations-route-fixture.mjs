import {createHash} from 'node:crypto';
import {loadApiIndexDefinition,EXPECTED_DEFINITION_HASH} from '../ops/api-index-definition.mjs';
import * as api from '../ops/api-index-calculations.mjs';
import {createPriceSnapshot,createIdentityIndex} from '../ops/api-price-item-dto.mjs';
import {INDEX_PREFIX,INDEX_POINTER} from '../ops/api-index-publication-contract.mjs';
export const sha=v=>createHash('sha256').update(v).digest('hex');
export const config={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:true,definitionHash:EXPECTED_DEFINITION_HASH};
export const request=(method='GET',headers={},url='https://inflation.gg/api-market-calculations.json')=>new Request(url,{method,headers});
export async function artifact({at='2026-11-06T12:00:00.000Z',factor=1,eventId=1,withPrices=true}={}){
 const definition=await loadApiIndexDefinition(),data=api.definitionData(definition),context={operation:'prices',sourceUrl:'https://maplestory.market/api/prices',capturedAt:at,sourceObservedAt:null,captureTimeKind:'http_response_completed'};
 const raw=new TextEncoder().encode(JSON.stringify([...data.goods,...data.cash].map(r=>({item_id:r.itemId,sold:{sales:5,units:50,day_sales:0,day_units:0,avg_unit_price:999999,median_unit_price:('APIlinkPrice'in r?Number(r.APIlinkPrice):10000)*factor},seen:null,reference:null}))));
 const meta=new TextEncoder().encode('[{"id":2010001,"name":"Synthetic Apple"}]'),identities=await createIdentityIndex([{raw:meta,expectedSha256:sha(meta),sourceUrl:'https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000',format:'noncash_list'}]),snapshot=await createPriceSnapshot(raw,{expectedSha256:sha(raw),context,identities}),capture=withPrices?await api.normalizeApiPriceSubset(definition.targetItemIds.map(id=>snapshot.getItem(id)).filter(Boolean),{definition,context}):null;
 const model=await api.calculateApiIndexSnapshot({definition,priceCapture:capture}),body=JSON.stringify(model),bodySha=sha(body),pointer={schemaVersion:1,kind:'private_api_index_pointer',definitionHash:definition.definitionHash,publicationOrdinal:eventId,modelKey:INDEX_PREFIX+'models/'+'b'.repeat(64)+'.json',modelSha256:'b'.repeat(64),modelBytes:2,snapshotHash:model.snapshotHash,causeCaptureHash:capture?.captureHash??'c'.repeat(64),priceCaptureHash:capture?.captureHash??null,overviewCaptureHash:null,calculatedAt:'2026-11-06T12:10:00.000Z',publicKey:INDEX_PREFIX+'public-models/'+bodySha+'.json',publicBodySha256:bodySha,publicBytes:Buffer.byteLength(body),pricesCapturedAt:withPrices?at:null,overviewCapturedAt:null,sourceObservedAt:null,publicationEligible:false};
 return{model,body,pointer,objects:new Map([[INDEX_POINTER,JSON.stringify(pointer)],[pointer.publicKey,body]])};
}
export function bucket(art){const reads=[];let hook=null;return{reads,setHook:v=>{hook=v;},async get(key){reads.push(key);if(hook)await hook(key);const value=art.objects.get(key);return value===undefined?null:{size:Buffer.byteLength(value),text:async()=>value};}};}
