// Pure full-graph verification before selected projection. No transport or SQL.
import {sha256,parseStrictJson} from './api-price-item-dto.mjs';
import {B,need,exact,hash,source,scope,eq,encode,pointer,manifest,pageRows,checkRows,integer} from './api-basic-current-contract.mjs';
import {BASIC_PUBLIC_DEFINITION_SHA,BASIC_PRIVATE_CONTRACT_SHA,BASIC_PUBLIC_MAX_BYTES,basicByteLength,ownBasicBytes,verifyBasicPublicDefinition,basicPublicShape} from './api-basic-current-public-contract.mjs';
const VERIFIED=new WeakMap();
export async function verifyBasicPrivateGraph({expectedRaw,expectedOriginalSha256,pointerRaw,manifestRaw,pagesRaw,signal=null,monotonic=()=>performance.now(),waitMs=30000}={}){
 need(hash(expectedOriginalSha256)&&integer(waitMs,1,30000),'basic_graph_original_expectations');const end=monotonic()+waitMs,fence=()=>need(!signal?.aborted&&Number.isFinite(end)&&monotonic()<end,'basic_graph_deadline');fence();
 // Own all caller buffers before the first digest await; inspect intrinsic size.
 const expectedBytes=ownBasicBytes(expectedRaw,16384),head=ownBasicBytes(pointerRaw,B.pointerBytes),mr=ownBasicBytes(manifestRaw,B.manifestBytes);
 need(Array.isArray(pagesRaw),'basic_graph_page_count');const pageCount=pagesRaw.length;need(integer(pageCount,1,40),'basic_graph_page_count');let total=0;const captured=[];
 for(let i=0;i<pageCount;i++){const view=pagesRaw[i],bytes=basicByteLength(view,B.pageBytes);total+=bytes;need(total<=B.totalBytes,'basic_graph_total');captured.push({view,bytes});}
 // Never re-read an external Array entry. A length-tracking view may grow
 // during a later accessor: cap its copy by its own already-admitted bytes.
 const pages=captured.map(({view,bytes})=>ownBasicBytes(view,bytes));
 need(await sha256(expectedBytes)===expectedOriginalSha256,'basic_graph_original_sha');fence();const e=parseStrictJson(expectedBytes);
 exact(e,['schemaVersion','kind','profile','privateContractSha256','definitionHash','generation','pointerSha256','manifestSha256','manifestBytes','bodySha256','source','scope','sourceJobState','sourceAttemptResult','sourceLiveAttemptId','sourceLeaseCleared','basicGenerationRole','basicGenerationPhase']);
 need(e.schemaVersion===1&&e.kind==='root_recorded_basic_private_graph_expected_v1'&&e.profile===B.profile&&e.privateContractSha256===BASIC_PRIVATE_CONTRACT_SHA&&e.definitionHash===BASIC_PUBLIC_DEFINITION_SHA&&hash(e.generation)&&hash(e.pointerSha256)&&hash(e.manifestSha256)&&hash(e.bodySha256)&&integer(e.manifestBytes,1,B.manifestBytes),'basic_graph_expected_profile');
 source(e.source);scope(e.scope);need(e.sourceJobState==='complete'&&e.sourceAttemptResult==='success'&&e.sourceLiveAttemptId===null&&e.sourceLeaseCleared===true&&e.basicGenerationRole==='current'&&e.basicGenerationPhase==='committed','basic_graph_source_witness');
 await verifyBasicPublicDefinition();fence();need(await sha256(head)===e.pointerSha256&&await sha256(mr)===e.manifestSha256&&mr.length===e.manifestBytes,'basic_graph_root_hashes');fence();
 const p=pointer(parseStrictJson(head)),m=manifest(parseStrictJson(mr));need(p.generation===e.generation&&m.generation===e.generation&&p.manifestSha===e.manifestSha256&&p.manifestBytes===e.manifestBytes&&eq(p.source,e.source)&&eq(m.source,e.source)&&eq(p.scope,e.scope)&&eq(m.scope,e.scope),'basic_graph_original_binding');
 need(await sha256(encode({source:e.source,scope:e.scope}))===e.generation,'basic_graph_generation');fence();need(pages.length===m.pages.length&&total===m.totalBytes,'basic_graph_total');
 const rows=[];for(let i=0;i<pages.length;i++){const d=m.pages[i];need(pages[i].length===d.bytes&&await sha256(pages[i])===d.sha,'basic_graph_page_hash');fence();rows.push(...pageRows(pages[i],m,d));}
 checkRows(rows);need(rows.length===m.itemCount&&await sha256(encode(rows.map(r=>r[0])))===m.membershipSha&&await sha256(encode(rows))===e.bodySha256,'basic_graph_membership_body_hash');fence();
 const result=Object.freeze({profile:B.profile,generation:e.generation,capturedAt:e.source.capturedAt,itemCount:rows.length,upstreamLatestInspected:false});
 VERIFIED.set(result,{source:Object.freeze({...e.source}),rows:new Map(rows.map(r=>[r[0],Object.freeze([...r])]))});return result;
}
export function projectBasicPublicItem(verified,itemId){
 const trusted=VERIFIED.get(verified);need(trusted&&integer(itemId,1,999999999),'basic_public_verified_graph');const r=trusted.rows.get(itemId);
 const value=basicPublicShape({schemaVersion:1,kind:'basic_current_item_reference',profile:B.profile,definitionHash:BASIC_PUBLIC_DEFINITION_SHA,itemId,generation:verified.generation,sourceBodySha256:trusted.source.rawSha,capturedAt:trusted.source.capturedAt,sourceObservedAt:null,captureTimeKind:'http_response_completed',reportedWindowDays:3,exactStartAt:null,exactEndAt:null,state:r?'present_in_generation':'absent_in_generation',
 sold:r&&(r[1]&1)?{medianUnitPrice:r[2],averageUnitPrice:r[3],reportedSalesCount:r[4],reportedUnitCount:r[5],reportedDaySalesCount:r[6],reportedDayUnitCount:r[7]}:null,
 asking:r&&(r[1]&2)?{medianUnitPrice:r[8],reportedListingCount:r[9],reportedSellerCount:r[10]}:null,
 upstreamLatestInspected:false,fullVariantFreshness:false,availabilityKnown:false,lowestListingKnown:false,qualityMatched:false,verifiedIndividualTrades:false});
 const raw=encode(value);need(raw.length<=BASIC_PUBLIC_MAX_BYTES,'basic_public_output_bound');return Object.freeze({value,raw});
}
