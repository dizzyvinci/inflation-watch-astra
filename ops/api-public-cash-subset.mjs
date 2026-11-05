// WORK-only derived29 display contract. No transport/storage/activation or bulk API mirror.
import {portableHash,HASH_METHOD} from './portable-hash.mjs';
import bindingMetadata from './api-cash-bindings-v1.json' with {type:'json'};
const freezeTree=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freezeTree(child);Object.freeze(value);}return value;};
const bindings=freezeTree(structuredClone(bindingMetadata));
const IDENTITY_HASH='8d426b6222c70399851ad9106219b71b4f011064ad20632c7949fd3ee5bbf2ef';
const ROUTER_SHA='1d08886333ef15b7615efc9330c5cf673946256265caf19e672621e32a856cf7';
const check=(ok,message)=>{if(!ok)throw new TypeError(message);};
const expected=new Map(bindings.targets.map(row=>[row.itemId,row]));
const finitePositive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=Number.MAX_SAFE_INTEGER;
const clock=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&new Date(value).toISOString()===value;

export async function publicCashSubset(input,{enabled=false}={}){
 if(enabled!==true)return null;
 // Own a copy before awaited digest; no caller mutation can alter checked evidence.
 const dto=structuredClone(input),{projectionHash,...hashed}=dto;
 check(dto.schemaVersion===1&&dto.kind==='private_api_cash_sale_median_projection'&&dto.hashMethod===HASH_METHOD&&dto.publicationEligible===false,'Wrong reviewed private projection');
 check(await portableHash(hashed)===projectionHash,'Private projection hash mismatch');
 check(dto.identitySubsetHash===IDENTITY_HASH,'Unreviewed identity subset');
 check(typeof dto.rawResponseSha256==='string'&&/^[a-f0-9]{64}$/.test(dto.rawResponseSha256)&&Number.isSafeInteger(dto.rawResponseBytes)&&dto.rawResponseBytes>=1&&dto.rawResponseBytes<=5_000_000,'Original raw binding required');
 check(dto.sourceUrl==='https://maplestory.market/api/prices'&&dto.sourceObservedAt===null&&dto.captureTimeKind==='http_response_completed','Wrong source/clock kind');
 check(clock(dto.requestStartedAt)&&clock(dto.capturedAt)&&dto.requestStartedAt<=dto.capturedAt,'Actual receipt clocks required');
 check(dto.candidatePlanHash===bindings.candidatePlanHash&&dto.fixedNxScheduleSha256===bindings.fixedNxScheduleSha256,'Unreviewed cohort/schedule');
 check(dto.window?.reportedLookbackDays===3&&dto.window.start===null&&dto.window.end===null&&dto.window.boundsKnown===false,'Unknown source window bounds must stay unknown');
 check(dto.attribution?.complete===true&&Array.isArray(dto.records)&&dto.records.length===29,'Fixed attributed29 display only');
 check(dto.attribution.itemRouteVerified===true&&dto.attribution.routeEvidenceSha256===ROUTER_SHA&&dto.attribution.publicLinkCodePresent===true,'Verified project attribution proof required');
 const ids=new Set();let available=0,countTotal=0;
 const records=dto.records.map(row=>{
  const target=expected.get(row.itemId);check(target&&!ids.has(row.itemId),'Wrong/duplicate display identity');ids.add(row.itemId);
  check(row.name===target.name&&row.slug===target.slug&&row.fixedNxCost===target.fixedNxCost,'Changed fixed identity/cost');
  check(row.priceBasis==='source_reported_sale_median'&&row.sourcePriceField==='sold.median_unit_price'&&row.sourceWeightField==='sold.sales','Wrong statistic');
  check(row.itemNameEchoVerified===false&&row.qualityConstantVerified===false,'Unverified source/quality claims');
  check(row.sourceCreditUrl===`https://maplestory.market/items/${row.itemId}?ref=v6kkdvp6`,'Project item attribution required');
  if(row.available){
   check(row.available===true&&finitePositive(row.saleMedianMesos)&&Number.isSafeInteger(row.recordedSalesCount)&&row.recordedSalesCount>=5,'Invalid qualifying median/count');
   check(row.rateMesosPerNx===row.saleMedianMesos/row.fixedNxCost,'Changed rate units');available++;countTotal+=row.recordedSalesCount;
   check(Number.isSafeInteger(countTotal),'Unsafe aggregate count sum');
  }else check(row.available===false&&row.saleMedianMesos===null&&row.recordedSalesCount===null&&row.rateMesosPerNx===null,'Unknown values must not become zero');
  // Explicit whitelist: no raw branch, player/shop record, registry or metadata leak.
  return{itemId:row.itemId,name:row.name,slug:row.slug,fixedNxCost:row.fixedNxCost,
   available:row.available,saleMedianMesos:row.saleMedianMesos,recordedSalesCount:row.recordedSalesCount,
   mesosPerNx:row.rateMesosPerNx,sourceCreditUrl:row.sourceCreditUrl};
 });
 check(dto.coverage.expected===29&&dto.coverage.available===available&&dto.coverage.missingOrInvalid===29-available,'Coverage mismatch');
 check(dto.aggregate.recordedSalesCountWeightTotal===countTotal&&dto.aggregate.usesPhysicalUnitsAsWeights===false&&dto.aggregate.qualifiedIndividualTrades===0,'Count/event-grain mismatch');
 const publicDto={schemaVersion:1,kind:'fixed_nx_item_api_display_subset',sourceUrl:dto.sourceUrl,
  privateProjectionHash:projectionHash,requestStartedAt:dto.requestStartedAt,capturedAt:dto.capturedAt,
  captureTimeKind:'http_response_completed',sourceObservedAt:null,window:{reportedLookbackDays:3,start:null,end:null,boundsKnown:false},
  coverage:{expected:29,available,missingOrInvalid:29-available},records,
  methodology:{price:'Source-reported item sale median',count:'Reported sale count; not physical units',
   quality:'Item-level aggregates can mix equipment qualities',identity:'Bound game item IDs; provider item-name echo not verified',
   use:'Compare fixed-NX items; not an executable exchange quote or the goods-inflation headline',
   clocks:'Retrieval time is known; individual sale timestamps and exact window bounds are not supplied'},
  attribution:{label:'Prices from maplestory.market',url:'https://maplestory.market/?ref=v6kkdvp6'},
  isExecutableQuote:false,changesGoodsIndex:false,changesHeadlineBenchmark:false};
 return{...publicDto,subsetHash:await portableHash(publicDto)};
}
