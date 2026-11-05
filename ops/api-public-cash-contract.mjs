import {portableHash} from './portable-hash.mjs';
import metadata from './api-cash-bindings-v1.json' with {type:'json'};
export const PUBLIC_POINTER='_private/provider-api/v1/public-cash-pointer.json';
export const PUBLIC_PREFIX='derived-cash-items/v1/';
export const PUBLIC_PATH='/api-cash-items.json';
export const MAX_SUBSET_BYTES=100_000;
export const PRIVATE_METHOD='raw-prices-v1-fixed29-median-v1';
export const IDENTITY_HASH='8d426b6222c70399851ad9106219b71b4f011064ad20632c7949fd3ee5bbf2ef';
const targets=new Map(structuredClone(metadata.targets).map(row=>[row.itemId,Object.freeze(row)]));
const HEX=/^[a-f0-9]{64}$/;
export const check=(ok,message)=>{if(!ok)throw new TypeError(message);};
export const samePointer=(a,b)=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);
export const bytes=text=>new TextEncoder().encode(text).length;
export const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const clock=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const exact=(v,names)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===names.split(' ').sort().join('|'),'Unexpected display fields');
const equal=(a,b)=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>a[k]===b[k]);
const METHOD={price:'Source-reported item sale median',count:'Reported sale count; not physical units',
 quality:'Item-level aggregates can mix equipment qualities',identity:'Bound game item IDs; provider item-name echo not verified',
 use:'Compare fixed-NX items; not an executable exchange quote or the goods-inflation headline',
 clocks:'Retrieval time is known; individual sale timestamps and exact window bounds are not supplied'};
const WINDOW={reportedLookbackDays:3,start:null,end:null,boundsKnown:false};
const ATTRIBUTION={label:'Prices from maplestory.market',url:'https://maplestory.market/?ref=v6kkdvp6'};

export function publicCashStatus(env){
  try{
    if(!env.API_PUBLIC_CASH_JSON)return'public_disabled';
    const v=JSON.parse(env.API_PUBLIC_CASH_JSON);
    if(!v||typeof v!=='object'||Array.isArray(v)||typeof v.enabled!=='boolean')return'invalid_public_configuration';
    if(!v.enabled)return'public_disabled';
    if(Object.keys(v).sort().join(',')!=='enabled,methodVersion,publicationEnabled,schemaVersion'||v.schemaVersion!==1||v.methodVersion!==1||v.publicationEnabled!==true)return'invalid_public_configuration';
    const p=JSON.parse(env.API_PRIVATE_CASH_JSON??'null');
    if(!p||p.enabled!==true)return'private_projection_required';
    if(Object.keys(p).sort().join(',')!=='enabled,methodVersion,publicationEnabled,schemaVersion'||p.schemaVersion!==1||p.methodVersion!==1||p.publicationEnabled!==false)return'private_projection_required';
    return'ready';
  }catch{return'invalid_public_configuration';}
}
export function validatePublicPointer(p){
  exact(p,'schemaVersion kind methodVersion sourceAttemptId dataKey subsetHash subsetSha256 subsetBytes privateProjectionHash requestStartedAt capturedAt sourceObservedAt expectedItems availableItems');
  check(p.schemaVersion===1&&p.kind==='fixed_nx_item_api_display_pointer'&&p.methodVersion===1,'Wrong display pointer');
  check(integer(p.sourceAttemptId,1)&&HEX.test(p.subsetHash)&&HEX.test(p.subsetSha256)&&HEX.test(p.privateProjectionHash),'Bad display binding');
  check(p.dataKey===PUBLIC_PREFIX+p.subsetSha256+'.json'&&integer(p.subsetBytes,1,MAX_SUBSET_BYTES),'Wrong public object key/size');
  check(clock(p.requestStartedAt)&&clock(p.capturedAt)&&p.requestStartedAt<=p.capturedAt&&p.sourceObservedAt===null,'Wrong pointer clock');
  check(p.expectedItems===29&&integer(p.availableItems,0,29),'Wrong pointer scope');return p;
}
export function validatePrivateDescriptor(p){
  check(p?.schemaVersion===1&&p.kind==='private_api_cash_projection_pointer'&&p.materializerVersion===PRIVATE_METHOD,'Wrong completed private projection');
  check(integer(p.sourceAttemptId,1)&&HEX.test(p.projectionHash)&&HEX.test(p.projectionSha256)&&integer(p.projectionBytes,1,MAX_SUBSET_BYTES),'Bad private projection binding');
  check(p.projectionKey===`_private/provider-api/v1/cash-projections/${PRIVATE_METHOD}/${p.projectionHash}.json`&&p.identitySubsetHash===IDENTITY_HASH&&HEX.test(p.rawResponseSha256),'Wrong owned private object');
  check(clock(p.capturedAt)&&p.sourceObservedAt===null&&p.publicationEligible===false,'Wrong private source clock');
  return Object.fromEntries(['schemaVersion','kind','materializerVersion','publicationEligible','sourceObservedAt','sourceAttemptId','projectionHash','projectionSha256','projectionBytes','projectionKey','identitySubsetHash','rawResponseSha256','capturedAt'].map(k=>[k,p[k]]));
}
export async function validatePublicBody(dto){
  exact(dto,'schemaVersion kind sourceUrl privateProjectionHash requestStartedAt capturedAt captureTimeKind sourceObservedAt window coverage records methodology attribution isExecutableQuote changesGoodsIndex changesHeadlineBenchmark subsetHash');
  check(dto.schemaVersion===1&&dto.kind==='fixed_nx_item_api_display_subset'&&dto.sourceUrl==='https://maplestory.market/api/prices'&&HEX.test(dto.privateProjectionHash)&&HEX.test(dto.subsetHash),'Wrong display contract');
  check(clock(dto.requestStartedAt)&&clock(dto.capturedAt)&&dto.requestStartedAt<=dto.capturedAt&&dto.captureTimeKind==='http_response_completed'&&dto.sourceObservedAt===null,'Wrong display clock');
  check(equal(dto.window,WINDOW)&&equal(dto.methodology,METHOD)&&equal(dto.attribution,ATTRIBUTION)&&dto.isExecutableQuote===false&&dto.changesGoodsIndex===false&&dto.changesHeadlineBenchmark===false,'Changed public methodology');
  exact(dto.coverage,'expected available missingOrInvalid');check(Array.isArray(dto.records)&&dto.records.length===29,'Wrong displayed scope');
  const ids=new Set();let available=0;
  for(const row of dto.records){
    exact(row,'itemId name slug fixedNxCost available saleMedianMesos recordedSalesCount mesosPerNx sourceCreditUrl');
    const target=targets.get(row.itemId);check(target&&!ids.has(row.itemId)&&row.name===target.name&&row.slug===target.slug&&row.fixedNxCost===target.fixedNxCost,'Wrong displayed identity');ids.add(row.itemId);
    check(row.sourceCreditUrl===`https://maplestory.market/items/${row.itemId}?ref=v6kkdvp6`,'Wrong display credit');
    if(row.available===true){check(typeof row.saleMedianMesos==='number'&&Number.isFinite(row.saleMedianMesos)&&row.saleMedianMesos>0&&row.saleMedianMesos<=Number.MAX_SAFE_INTEGER&&integer(row.recordedSalesCount,5)&&row.mesosPerNx===row.saleMedianMesos/row.fixedNxCost,'Invalid displayed values');available++;}
    else check(row.available===false&&row.saleMedianMesos===null&&row.recordedSalesCount===null&&row.mesosPerNx===null,'Unknown values became numbers');
  }
  check(dto.coverage.expected===29&&dto.coverage.available===available&&dto.coverage.missingOrInvalid===29-available,'Wrong displayed coverage');
  const {subsetHash,...body}=dto;check(await portableHash(body)===subsetHash,'Display semantic hash mismatch');return dto;
}
export async function boundedText(object,max=MAX_SUBSET_BYTES){
  check(object,'Missing cached object');check(Number.isSafeInteger(object.size)&&object.size>=0&&object.size<=max,'Cached object size unavailable or too large');
  if(object.body?.getReader){
    const reader=object.body.getReader(),chunks=[];let length=0;
    try{while(true){const{done,value}=await reader.read();if(done)break;length+=value.byteLength;check(length<=max,'Cached stream too large');chunks.push(value);}}
    catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    check(length===object.size,'Cached stream length mismatch');const raw=new Uint8Array(length);let at=0;
    for(const chunk of chunks){raw.set(chunk,at);at+=chunk.byteLength;}return new TextDecoder('utf-8',{fatal:true}).decode(raw);
  }
  const text=await object.text();check(typeof text==='string'&&bytes(text)===object.size&&bytes(text)<=max,'Cached text size mismatch');return text;
}
