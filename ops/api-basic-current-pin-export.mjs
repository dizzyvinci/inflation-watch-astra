// Pure extraction from caller-trusted private SQL-mirror health bytes. NOT origin authentication.
import {sha256,parseStrictJson} from './api-price-item-dto.mjs';
import {B,exact,scope,source,integer,iso,hash,eq,encode} from './api-basic-current-contract.mjs';
import {BASIC_PUBLIC_DEFINITION_SHA,BASIC_PRIVATE_CONTRACT_SHA,ownBasicBytes} from './api-basic-current-public-contract.mjs';
import {admitBasicSelectedPins} from './api-basic-current-selected-proof.mjs';
const SECTION=['diagnosticVersion','profile','privateContractSha256','operatorCheckedAt','sourceObservedAt','remoteGraphVerification','pagePayloadsRehashed','rawReceiptReparsed','bodyShaVerification','upstreamLatestInspected','fullVariantFreshness','availabilityVerified','nativeResourceHeadroom','status','control','current','active','pending','verificationPins','sourceBindings','verificationScope'];
const PIN=['privateContractSha256','generation','pointerSha256','manifestSha256','manifestBytes','bodySha256','source','scope','sourceJobState','sourceAttemptResult','sourceLiveAttemptId','sourceLeaseCleared','basicGenerationRole','basicGenerationPhase'];
const CONTROL=['ownerEpoch','retryAt','actionPending','physicalPendingInCurrentInstance','physicalSettlementUnknown','capturePreparationPending','basicIntentPresent','newerBasicObservedIntentPresent','upstreamLatestInspected'];
const RECORD=['role','generation','phase','sourceAttempt','sourceCapturedAt','sourceBodySha256','claim','ownerEpoch','leaseUntil','graph'];
const GRAPH=['manifestSha256','manifestBytes','pointerSha256','itemCount','pageCount','totalPageBytes','membershipSha256'];
const PROGRESS=['pending','running','complete','capacity_hold','authority_review','quarantined'];
const need=v=>{if(!v)throw Error('basic_pin_export_unavailable');};
const status=s=>Object.freeze({pins:Object.freeze({status:s}),observation:null});
function data(object,keys){need(object&&typeof object==='object'&&!Array.isArray(object)&&[Object.prototype,null].includes(Object.getPrototypeOf(object)));const descriptors=Object.getOwnPropertyDescriptors(object);need(Reflect.ownKeys(descriptors).length===keys.length&&keys.every(k=>Object.hasOwn(descriptors,k)&&Object.hasOwn(descriptors[k],'value')));return Object.fromEntries(keys.map(k=>[k,descriptors[k].value]));}
function graph(g){exact(g,GRAPH);need(hash(g.manifestSha256)&&hash(g.pointerSha256)&&hash(g.membershipSha256)&&integer(g.manifestBytes,1,B.manifestBytes)&&integer(g.itemCount,1,B.rows)&&integer(g.pageCount,1,40)&&integer(g.totalPageBytes,1,B.totalBytes));}
function record(r,role,c,checked){if(r===null)return;exact(r,RECORD);need(r.role===role&&hash(r.generation)&&integer(r.sourceAttempt,1)&&hash(r.sourceBodySha256)&&integer(r.claim));iso(r.sourceCapturedAt);need(r.sourceCapturedAt<=checked);need(r.ownerEpoch===null||integer(r.ownerEpoch,1,c.ownerEpoch));if(r.leaseUntil!==null)iso(r.leaseUntil);if(r.graph!==null)graph(r.graph);
 if(role==='current')need(r.phase==='committed'&&r.claim>=1&&r.ownerEpoch!==null&&r.leaseUntil===null&&r.graph!==null);
 if(role==='pending')need(r.phase==='compile'&&r.graph===null);
 if(role==='active')need(['compile','write','replay','base','pointer','readback','review'].includes(r.phase));
}
export async function exportBasicSelectedPinSnapshot(options={}){
 let enabled;try{enabled=Object.getOwnPropertyDescriptor(options,'enabled')?.value;}catch{return status('unavailable');}if(enabled!==true)return status('disabled');
 try{
  // Capture every external data field and the original bytes before any digest await.
  const o=data(options,['enabled','healthRaw','expectedHealthSha256','expectedCheckedAt','observedAt','maxHealthAgeMs','expectedScope','expectedPrivateContractSha256','metadata']);
  const sc=data(o.expectedScope,['grantReference','roundReference','epoch']);scope(sc);const meta=data(o.metadata,['schemaVersion','kind','profile','definitionHash']);
  need(meta.schemaVersion===1&&meta.kind==='root_recorded_basic_private_graph_expected_v1'&&meta.profile==='basic_aggregate_v1'&&meta.definitionHash===BASIC_PUBLIC_DEFINITION_SHA&&o.expectedPrivateContractSha256===BASIC_PRIVATE_CONTRACT_SHA&&hash(o.expectedHealthSha256));
  iso(o.expectedCheckedAt);iso(o.observedAt);need(integer(o.maxHealthAgeMs,0,86400000));const checked=Date.parse(o.expectedCheckedAt),observed=Date.parse(o.observedAt);need(checked<=observed&&observed-checked<=o.maxHealthAgeMs);
  const raw=ownBasicBytes(o.healthRaw,99999),deadline=performance.now()+30000,fence=()=>need(performance.now()<deadline);
  need(await sha256(raw)===o.expectedHealthSha256);fence();
  const text=new TextDecoder('utf-8',{fatal:true}).decode(raw),seal=/,"healthSha256":"([a-f0-9]{64})"}$/.exec(text);
  need(seal&&seal.index+seal[0].length===text.length);const unsigned=raw.slice(0,raw.length-seal[0].length+1);unsigned[unsigned.length-1]=125;need(await sha256(unsigned)===seal[1]);fence();
  const h=parseStrictJson(raw);
  need(h&&typeof h==='object'&&!Array.isArray(h)&&h.schemaVersion===1&&h.kind==='private_api_collector_health'&&h.providerAlarmRecoveryVersion===1&&integer(h.revision,1)&&h.checkedAt===o.expectedCheckedAt&&h.checkedAtMeaning==='owner_check_completion_not_market_observation'&&h.authenticationStopped===false&&h.sourceObservedAt===null&&h.schemaVerified===false&&h.publicationEligible===false&&hash(h.healthSha256));
  need(h.healthSha256===seal[1]);fence();
  const d=h.privateBasicCurrent;need(d&&['committed','awaiting_current'].includes(d.status));exact(d,SECTION);
  need(d.diagnosticVersion===1&&d.profile===meta.profile&&d.privateContractSha256===o.expectedPrivateContractSha256&&d.operatorCheckedAt===o.expectedCheckedAt&&d.sourceObservedAt===null&&d.remoteGraphVerification==='not_checked'&&d.pagePayloadsRehashed===false&&d.rawReceiptReparsed===false&&d.bodyShaVerification==='producer_sql_attested_not_recomputed'&&d.upstreamLatestInspected===false&&d.fullVariantFreshness===false&&d.availabilityVerified===false&&d.nativeResourceHeadroom==='not_checked'&&d.verificationScope==='original_completed_owned_source_and_committed_sql_metadata_not_remote_pages');
  const c=d.control;exact(c,CONTROL);need(integer(c.ownerEpoch,1)&&c.upstreamLatestInspected===false);iso(c.retryAt);for(const k of ['actionPending','physicalPendingInCurrentInstance','physicalSettlementUnknown','capturePreparationPending','basicIntentPresent'])need(typeof c[k]==='boolean');
  for(const role of ['current','active','pending'])record(d[role],role,c,o.expectedCheckedAt);
  const live=[d.current,d.active,d.pending].filter(x=>x!==null).length;need(Array.isArray(d.sourceBindings)&&d.sourceBindings.length>=live&&d.sourceBindings.length<=live+1&&d.sourceBindings.length<=4);
  for(const w of d.sourceBindings){exact(w,['completedOwnedApiReceipt','normalRegistryState','normalizedRegistryCaptureBound']);need(w.completedOwnedApiReceipt===true&&PROGRESS.includes(w.normalRegistryState)&&typeof w.normalizedRegistryCaptureBound==='boolean');}
  const knownIntents=[d.active,d.pending].filter(x=>x!==null),missingIntentWitness=d.sourceBindings.length>live;
  need(c.basicIntentPresent===(knownIntents.length>0||missingIntentWitness));
  const observation=Object.freeze({originalHealthSha256:o.expectedHealthSha256,healthUnsignedSha256:h.healthSha256,operatorCheckedAt:o.expectedCheckedAt,observedAt:o.observedAt,healthRevision:h.revision,privateContractSha256:o.expectedPrivateContractSha256,definitionHash:meta.definitionHash,callerExpectedScope:Object.freeze({...sc}),originAuthenticated:false,deployedSourceAttested:false,trustedPrivateSqlMirrorChannelRequired:true});
  if(d.status==='awaiting_current'){need(d.current===null&&d.verificationPins===null&&c.newerBasicObservedIntentPresent===null);fence();return Object.freeze({pins:Object.freeze({status:'no_current'}),observation});}
  need(d.current!==null&&typeof c.newerBasicObservedIntentPresent==='boolean'&&(!c.newerBasicObservedIntentPresent||c.basicIntentPresent));
  const knownNewer=knownIntents.some(r=>r.sourceCapturedAt>d.current.sourceCapturedAt||r.sourceCapturedAt===d.current.sourceCapturedAt&&r.sourceAttempt>d.current.sourceAttempt);
  need((!knownNewer||c.newerBasicObservedIntentPresent)&& (missingIntentWitness||c.newerBasicObservedIntentPresent===knownNewer));
  const p=d.verificationPins;exact(p,PIN);source(p.source);scope(p.scope);need(eq(p.scope,sc)&&p.privateContractSha256===o.expectedPrivateContractSha256&&p.source.grantReference===sc.grantReference&&p.source.roundReference===sc.roundReference&&p.source.capturedAt<=o.expectedCheckedAt);
  const r=d.current,g=r.graph;need(p.generation===r.generation&&p.source.attempt===r.sourceAttempt&&p.source.capturedAt===r.sourceCapturedAt&&p.source.rawSha===r.sourceBodySha256&&p.pointerSha256===g.pointerSha256&&p.manifestSha256===g.manifestSha256&&p.manifestBytes===g.manifestBytes);
  // Fixed parent-key order; preserve actual producer source/scope key ordering.
  const expected={schemaVersion:meta.schemaVersion,kind:meta.kind,profile:meta.profile,privateContractSha256:p.privateContractSha256,definitionHash:meta.definitionHash,generation:p.generation,pointerSha256:p.pointerSha256,manifestSha256:p.manifestSha256,manifestBytes:p.manifestBytes,bodySha256:p.bodySha256,source:p.source,scope:p.scope,sourceJobState:p.sourceJobState,sourceAttemptResult:p.sourceAttemptResult,sourceLiveAttemptId:p.sourceLiveAttemptId,sourceLeaseCleared:p.sourceLeaseCleared,basicGenerationRole:p.basicGenerationRole,basicGenerationPhase:p.basicGenerationPhase};
  const expectedRaw=encode(expected);need(expectedRaw.length<=16384);const expectedOriginalSha256=await sha256(expectedRaw);fence();await admitBasicSelectedPins({expectedRaw,expectedOriginalSha256,deadline});fence();
  return Object.freeze({pins:Object.freeze({status:'ready',expectedRaw,expectedOriginalSha256,newerBasicObservedIntentPresent:c.newerBasicObservedIntentPresent}),observation});
 }catch{return status('unavailable');}
}
