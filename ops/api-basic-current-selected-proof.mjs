// Selected evidence only. Body SHA is independently committed-SQL attestation,
// NOT recomputation of all normalized rows. This has a separate private brand.
import {sha256,parseStrictJson} from './api-price-item-dto.mjs';
import {B,need,exact,hash,source,scope,eq,encode,pointer,manifest,pageRows,integer} from './api-basic-current-contract.mjs';
import {BASIC_PUBLIC_DEFINITION_SHA,BASIC_PRIVATE_CONTRACT_SHA,BASIC_PUBLIC_MAX_BYTES,ownBasicBytes,verifyBasicPublicDefinition,basicPublicShape} from './api-basic-current-public-contract.mjs';
const SELECTED=new WeakMap(),PINNED=new WeakSet();
function budget({signal,monotonic,waitMs,deadline}){
 need(integer(waitMs,1,30000),'basic_selected_expectations');
 const start=monotonic(),end=deadline===undefined?start+waitMs:deadline;need(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end<=start+waitMs,'basic_selected_budget');
 const fence=()=>need(!signal?.aborted&&monotonic()<end,'basic_selected_deadline');fence();return fence;
}
async function admitOwned(er,expectedOriginalSha256,fence){
 need(hash(expectedOriginalSha256),'basic_selected_expectations');
 need(await sha256(er)===expectedOriginalSha256,'basic_selected_original_sha');fence();const e=parseStrictJson(er);
 exact(e,['schemaVersion','kind','profile','privateContractSha256','definitionHash','generation','pointerSha256','manifestSha256','manifestBytes','bodySha256','source','scope','sourceJobState','sourceAttemptResult','sourceLiveAttemptId','sourceLeaseCleared','basicGenerationRole','basicGenerationPhase']);
 need(e.schemaVersion===1&&e.kind==='root_recorded_basic_private_graph_expected_v1'&&e.profile===B.profile&&e.privateContractSha256===BASIC_PRIVATE_CONTRACT_SHA&&e.definitionHash===BASIC_PUBLIC_DEFINITION_SHA&&hash(e.generation)&&hash(e.pointerSha256)&&hash(e.manifestSha256)&&hash(e.bodySha256)&&integer(e.manifestBytes,1,B.manifestBytes),'basic_selected_profile');
 source(e.source);scope(e.scope);need(e.sourceJobState==='complete'&&e.sourceAttemptResult==='success'&&e.sourceLiveAttemptId===null&&e.sourceLeaseCleared===true&&e.basicGenerationRole==='current'&&e.basicGenerationPhase==='committed','basic_selected_sql_attestation');
 await verifyBasicPublicDefinition();fence();need(await sha256(encode({source:e.source,scope:e.scope}))===e.generation,'basic_selected_generation');fence();
 Object.freeze(e.source);Object.freeze(e.scope);Object.freeze(e);const admitted=Object.freeze({expectation:e,originalSha256:expectedOriginalSha256});PINNED.add(admitted);return admitted;
}
// Reusable before any future transport GET. This is hash/schema admission of
// caller's independently trusted SQL witness, not an authentication mechanism.
export async function admitBasicSelectedPins({expectedRaw,expectedOriginalSha256,signal=null,monotonic=()=>performance.now(),waitMs=30000,deadline=undefined}={}){
 const fence=budget({signal,monotonic,waitMs,deadline});return admitOwned(ownBasicBytes(expectedRaw,16384),expectedOriginalSha256,fence);
}
export async function verifyBasicSelectedSqlProof({expectedRaw,expectedOriginalSha256,admittedPins=null,itemId,pointerRaw,manifestRaw,pageRaw=null,signal=null,monotonic=()=>performance.now(),waitMs=30000,deadline=undefined}={}){
 need(integer(itemId,1,999999999),'basic_selected_expectations');const fence=budget({signal,monotonic,waitMs,deadline});
 if(admittedPins!==null){need(PINNED.has(admittedPins),'basic_selected_pins_brand');need(expectedRaw===undefined&&expectedOriginalSha256===undefined,'basic_selected_ambiguous_pins');}
 const er=admittedPins===null?ownBasicBytes(expectedRaw,16384):null,head=ownBasicBytes(pointerRaw,B.pointerBytes),mr=ownBasicBytes(manifestRaw,B.manifestBytes),pr=pageRaw===null?null:ownBasicBytes(pageRaw,B.pageBytes);
 const admitted=admittedPins??await admitOwned(er,expectedOriginalSha256,fence);const e=admitted.expectation;fence();
 need(await sha256(head)===e.pointerSha256&&await sha256(mr)===e.manifestSha256&&mr.length===e.manifestBytes,'basic_selected_root_hashes');fence();
 const p=pointer(parseStrictJson(head)),m=manifest(parseStrictJson(mr));need(p.generation===e.generation&&m.generation===e.generation&&p.manifestSha===e.manifestSha256&&p.manifestBytes===e.manifestBytes&&eq(p.source,e.source)&&eq(m.source,e.source)&&eq(p.scope,e.scope)&&eq(m.scope,e.scope),'basic_selected_root_binding');
 const d=m.pages.find(d=>itemId>=d.firstId&&itemId<=d.lastId);let selected=null;
 if(d){need(pr!==null&&pr.length===d.bytes&&await sha256(pr)===d.sha,'basic_selected_page_hash');fence();selected=pageRows(pr,m,d).find(r=>r[0]===itemId)??null;}
 else need(pr===null,'basic_selected_unexpected_page');
 fence();const proof=Object.freeze({verificationScope:'committed_sql_attestation_and_selected_page',bodyHashVerification:'producer_sql_attested_not_recomputed',fullBodyRecomputed:false,membershipVerification:d?'pinned_complete_manifest_and_selected_page':'pinned_complete_manifest_ranges',itemId,generation:e.generation,capturedAt:e.source.capturedAt,manifestSha256:e.manifestSha256,selectedPageSha256:d?.sha??null,producerAttestedBodySha256:e.bodySha256,originalExpectedSha256:admitted.originalSha256,upstreamLatestInspected:false});
 SELECTED.set(proof,{source:Object.freeze({...e.source}),row:selected?Object.freeze([...selected]):null});return proof;
}
export function projectBasicSelectedPublicItem(proof){
 const b=SELECTED.get(proof);need(b,'basic_selected_proof_brand');const r=b.row;
 const value=basicPublicShape({schemaVersion:1,kind:'basic_current_item_reference',profile:B.profile,definitionHash:BASIC_PUBLIC_DEFINITION_SHA,itemId:proof.itemId,generation:proof.generation,sourceBodySha256:b.source.rawSha,capturedAt:b.source.capturedAt,sourceObservedAt:null,captureTimeKind:'http_response_completed',reportedWindowDays:3,exactStartAt:null,exactEndAt:null,state:r?'present_in_generation':'absent_in_generation',
 sold:r&&(r[1]&1)?{medianUnitPrice:r[2],averageUnitPrice:r[3],reportedSalesCount:r[4],reportedUnitCount:r[5],reportedDaySalesCount:r[6],reportedDayUnitCount:r[7]}:null,
 asking:r&&(r[1]&2)?{medianUnitPrice:r[8],reportedListingCount:r[9],reportedSellerCount:r[10]}:null,
 upstreamLatestInspected:false,fullVariantFreshness:false,availabilityKnown:false,lowestListingKnown:false,qualityMatched:false,verifiedIndividualTrades:false});
 const raw=encode(value);need(raw.length<=BASIC_PUBLIC_MAX_BYTES,'basic_selected_output_bound');return Object.freeze({value,raw,verificationScope:proof.verificationScope,bodyHashVerification:proof.bodyHashVerification});
}
