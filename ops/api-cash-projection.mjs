// WORK-only pure projection AFTER strict original-byte ingestion. No fetch/storage/activation.
import {portableHash,HASH_METHOD} from './portable-hash.mjs';
const MAX=Number.MAX_SAFE_INTEGER,HEX=/^[a-f0-9]{64}$/;
const EXPECTED={candidatePlanHash:'1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a',
  fixedNxScheduleSha256:'70219b72825f2b8e23591986abb74be245d1d547cf69caddd6687622819c137c',
  identitySubsetHash:'8d426b6222c70399851ad9106219b71b4f011064ad20632c7949fd3ee5bbf2ef'};
const ROUTER_SHA='1d08886333ef15b7615efc9330c5cf673946256265caf19e672621e32a856cf7';
const requireValue=(condition,message)=>{if(!condition)throw new TypeError(message);};
const exactKeys=(value,expected)=>requireValue(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join('|')===[...expected].sort().join('|'),'Unreviewed projection input fields');
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=MAX;
const integer=value=>Number.isSafeInteger(value)&&value>0;
const sortedObject=value=>Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]]));
async function semanticSha(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(sortedObject(value)))))].map(b=>b.toString(16).padStart(2,'0')).join('');}

export async function project(inputs,publicLinkCode=null){
  // Own the complete input before the first awaited digest. Caller mutation must
  // never separate a validated cohort/hash from the values used in the DTO.
  inputs=structuredClone(inputs);
  exactKeys(inputs,['schemaVersion','kind','sourceUrl','rawResponseSha256','rawResponseBytes','requestStartedAt','capturedAt','sourceObservedAt','priceField','weightField','candidatePlanHash','fixedNxScheduleSha256','targets','sourceRows','routeEvidence']);
  requireValue(inputs.schemaVersion===1&&inputs.kind==='private_validated_api_cash_median_inputs','Wrong input contract');
  requireValue(inputs.sourceUrl==='https://maplestory.market/api/prices'&&inputs.sourceObservedAt===null,'Wrong source/unknown clock contract');
  for(const key of ['rawResponseSha256','candidatePlanHash','fixedNxScheduleSha256'])requireValue(typeof inputs[key]==='string'&&HEX.test(inputs[key]),'Invalid source binding hash');
  requireValue(integer(inputs.rawResponseBytes)&&inputs.rawResponseBytes<=5_000_000,'Invalid raw byte count');
  for(const key of ['requestStartedAt','capturedAt'])requireValue(typeof inputs[key]==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(inputs[key])&&Number.isFinite(Date.parse(inputs[key]))&&new Date(inputs[key]).toISOString()===inputs[key],'Actual UTC receipt clock required');
  requireValue(inputs.capturedAt>=inputs.requestStartedAt,'Receipt clocks out of order');
  requireValue(inputs.priceField==='sold.median_unit_price'&&inputs.weightField==='sold.sales','Wrong price/weight basis');
  const targets=inputs.targets,sourceRows=inputs.sourceRows;
  requireValue(Array.isArray(targets)&&targets.length===29&&Array.isArray(sourceRows)&&sourceRows.length<=29,'Bounded29-only projection');
  const ids=new Set(),names=new Set(),slugs=new Set(),schedule=Object.create(null);
  for(const target of targets){
    exactKeys(target,['itemId','name','slug','fixedNxCost','identityProofHash']);
    requireValue(integer(target.itemId)&&!ids.has(target.itemId),'Invalid/duplicate target ID');
    requireValue(typeof target.name==='string'&&target.name.length>0&&target.name.length<=200&&!names.has(target.name)&&!/[\x00-\x1f]/.test(target.name),'Invalid/duplicate name');
    requireValue(typeof target.slug==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.slug)&&!slugs.has(target.slug),'Invalid/duplicate slug');
    requireValue(integer(target.fixedNxCost),'Invalid fixed NX cost');
    requireValue(typeof target.identityProofHash==='string'&&HEX.test(target.identityProofHash),'Missing identity proof');
    ids.add(target.itemId);names.add(target.name);slugs.add(target.slug);schedule[target.name]=target.fixedNxCost;
  }
  requireValue(await semanticSha(schedule)===inputs.fixedNxScheduleSha256,'Schedule hash mismatch');
  requireValue(inputs.candidatePlanHash===EXPECTED.candidatePlanHash&&inputs.fixedNxScheduleSha256===EXPECTED.fixedNxScheduleSha256,'Unreviewed fixed cohort/schedule version');
  const sortedTargets=[...targets].sort((a,b)=>a.itemId-b.itemId);
  requireValue(await portableHash(sortedTargets)===EXPECTED.identitySubsetHash,'Unreviewed identity subset version');
  const source=new Map();
  for(const row of sourceRows){
    exactKeys(row,['itemId','saleMedianMesos','recordedSales']);
    requireValue(integer(row.itemId)&&ids.has(row.itemId)&&!source.has(row.itemId),'Unexpected/duplicate source ID');source.set(row.itemId,row);
  }
  const route=inputs.routeEvidence;exactKeys(route,['verified','sourceUrl','sha256','routeTemplate']);
  requireValue(typeof route.verified==='boolean'&&typeof route.sha256==='string'&&HEX.test(route.sha256),'Invalid route evidence');
  const routeVerified=route.verified&&route.sourceUrl==='https://maplestory.market/assets/VDivider-1_mhy5kl.js'&&route.routeTemplate==='/items/{item_id}'&&route.sha256===ROUTER_SHA;
  requireValue(publicLinkCode===null||typeof publicLinkCode==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(publicLinkCode),'Invalid nonsecret public link code');
  const records=[];let numerator=0,salesTotal=0;
  for(const target of sortedTargets){
    const row=source.get(target.itemId),valid=!!(row&&positive(row.saleMedianMesos)&&Number.isSafeInteger(row.recordedSales)&&row.recordedSales>=5);
    const sourceItemUrl=routeVerified?'https://maplestory.market/items/'+target.itemId:null;
    const record={itemId:target.itemId,name:target.name,slug:target.slug,fixedNxCost:target.fixedNxCost,
      available:valid,reason:valid?null:'missing_or_invalid_sale_median_or_count',saleMedianMesos:valid?row.saleMedianMesos:null,
      recordedSalesCount:valid?row.recordedSales:null,rateMesosPerNx:valid?row.saleMedianMesos/target.fixedNxCost:null,
      priceBasis:'source_reported_sale_median',sourcePriceField:'sold.median_unit_price',sourceWeightField:'sold.sales',
      itemNameEchoVerified:false,qualityConstantVerified:false,sourceItemUrl,
      sourceCreditUrl:sourceItemUrl&&publicLinkCode?sourceItemUrl+'?ref='+publicLinkCode:null};
    records.push(record);if(valid){numerator+=record.rateMesosPerNx*record.recordedSalesCount;salesTotal+=record.recordedSalesCount;}
  }
  requireValue(Number.isSafeInteger(salesTotal)&&salesTotal<=MAX&&Number.isFinite(numerator),'Aggregate exceeds portable numeric limits');
  const count=records.filter(row=>row.available).length;
  const base={schemaVersion:1,kind:'private_api_cash_sale_median_projection',hashMethod:HASH_METHOD,publicationEligible:false,
    sourceUrl:inputs.sourceUrl,rawResponseSha256:inputs.rawResponseSha256,rawResponseBytes:inputs.rawResponseBytes,
    candidatePlanHash:inputs.candidatePlanHash,fixedNxScheduleSha256:inputs.fixedNxScheduleSha256,
    identitySubsetHash:await portableHash(sortedTargets),requestStartedAt:inputs.requestStartedAt,capturedAt:inputs.capturedAt,
    captureTimeKind:'http_response_completed',sourceObservedAt:null,
    window:{reportedLookbackDays:3,start:null,end:null,boundsKnown:false},
    coverage:{expected:29,available:count,missingOrInvalid:29-count},
    aggregate:{method:'recorded_sales_count_weighted_mean_of_item_sale_medians_per_fixed_nx',rateMesosPerNx:count===29?numerator/salesTotal:null,
      recordedSalesCountWeightTotal:salesTotal,usesPhysicalUnitsAsWeights:false,isExecutableExchangeQuote:false,qualifiedIndividualTrades:0},
    publisherReferenceNuance:{field:'reference.unit_price',initialCaptureBasis:'sold_average_or_listed_asking_median_fallback',
      usedByThisProjection:false,directSaleMedianFieldUsedInstead:'sold.median_unit_price'},
    attribution:{label:'Prices from maplestory.market',itemRouteVerified:routeVerified,routeEvidenceSha256:routeVerified?ROUTER_SHA:null,publicLinkCodePresent:publicLinkCode!==null,
      complete:routeVerified&&publicLinkCode!==null,gate:routeVerified&&publicLinkCode?null:'pending_verified_route_or_project_public_link_code'},records};
  return{...base,projectionHash:await portableHash(base)};
}
