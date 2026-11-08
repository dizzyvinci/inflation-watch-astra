// Pure aggregate-only contract. Hash validity is not origin/runtime attestation.
import definition from './api-overview-activity-public-definition-v1.json' with {type:'json'};
import {sha256,parseStrictJson} from './api-price-item-dto.mjs';
export const ACTIVITY_DEFINITION_SHA='65bf9403902e24eb6ab24a9d9b3d1f2ec4c49304ec57671869208e45335f8b36';
export const ACTIVITY_PROTOCOL='overview-window-activity-v1',ACTIVITY_PROFILE='overview_window_aggregate_v1';
export const ACTIVITY_HTTP_PREFIX='/api-overview-window-activity/',ACTIVITY_MAX_BYTES=8192;
export const activityEnc=new TextEncoder();
const HASH=/^[a-f0-9]{64}$/,EPOCH=/^[a-z][a-z0-9-]{0,63}$/;
export const activityNeed=(v,code)=>{if(!v)throw Error(code);};
export const activityExact=(v,keys)=>activityNeed(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'activity_fields');
export const activityInteger=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export const activityHash=v=>typeof v==='string'&&HASH.test(v);
export const activityEpoch=v=>typeof v==='string'&&EPOCH.test(v);
export const activityIso=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Date.parse(v)>=0&&Date.parse(v)<=253402300799999&&new Date(v).toISOString()===v;
export function freezeActivity(v){if(v&&typeof v==='object'){Object.values(v).forEach(freezeActivity);Object.freeze(v);}return v;}
freezeActivity(definition);
const {schemaVersion:unusedSchema,profile:unusedProfile,protocol:unusedProtocol,...semanticFields}=definition;
export const ACTIVITY_SEMANTICS=freezeActivity(semanticFields);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),money=v=>typeof v==='string'&&v.length<=192&&/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/.test(v),count=v=>money(v)&&!v.includes('.');
const SOURCE=['operation','sourceUrl','rawBodySha256','capturedAt','sourceObservedAt','captureTimeKind','sourceGeneratedAt'];
const COVERAGE=['receivedItemRows','countEligibleItemRows','reportedUnitEligibleItemRows','sourceReportedMesosEligibleItemRows','medianCountProxyEligibleItemRows','medianCountProxyMissingPriceRows'];
const SUMS=['sourceRecordedSalesCounterSumLexeme','sourceReportedUnitCounterSumLexeme','sourceReportedMesosSumLexeme','medianCountProxySumLexeme'];
export async function verifyActivityDefinition(){activityNeed(await sha256(activityEnc.encode(JSON.stringify(definition)+'\n'))===ACTIVITY_DEFINITION_SHA,'activity_definition');}
let definitionReady=null;
export function activityDefinitionReady(){return definitionReady??=verifyActivityDefinition();}
export function activityReferenceShape(v){
 activityExact(v,['schemaVersion','kind','profile','definitionHash','generation','sourceWitnessSha256','derivedBodySha256','source','window','coverage','counterSums','semantics']);
 activityNeed(v.schemaVersion===1&&v.kind==='overview_window_activity'&&v.profile===ACTIVITY_PROFILE&&v.definitionHash===ACTIVITY_DEFINITION_SHA&&[v.generation,v.sourceWitnessSha256,v.derivedBodySha256].every(activityHash),'activity_reference');
 const s=v.source;activityExact(s,SOURCE);activityNeed(s.operation==='overview'&&s.sourceUrl==='https://maplestory.market/api/market/overview'&&activityHash(s.rawBodySha256)&&activityIso(s.capturedAt)&&activityIso(s.sourceGeneratedAt)&&s.sourceGeneratedAt<=s.capturedAt&&s.sourceObservedAt===null&&s.captureTimeKind==='http_response_completed','activity_source');
 const w=v.window;activityExact(w,['windowHours','scannedHours','previousScannedHours','comparable','exactStartAt','exactEndAt']);activityNeed([w.windowHours,w.scannedHours,w.previousScannedHours].every(n=>activityInteger(n,0,100000))&&typeof w.comparable==='boolean'&&w.exactStartAt===null&&w.exactEndAt===null,'activity_window');
 const c=v.coverage;activityExact(c,COVERAGE);activityNeed(COVERAGE.every(k=>activityInteger(c[k],0,20000))&&c.countEligibleItemRows===c.receivedItemRows&&c.reportedUnitEligibleItemRows===c.receivedItemRows&&c.sourceReportedMesosEligibleItemRows===c.receivedItemRows&&c.medianCountProxyEligibleItemRows+c.medianCountProxyMissingPriceRows===c.receivedItemRows,'activity_coverage');
 const n=v.counterSums;activityExact(n,SUMS);activityNeed(count(n.sourceRecordedSalesCounterSumLexeme)&&count(n.sourceReportedUnitCounterSumLexeme)&&money(n.sourceReportedMesosSumLexeme)&&(c.medianCountProxyEligibleItemRows===0?n.medianCountProxySumLexeme===null:money(n.medianCountProxySumLexeme)),'activity_sums');
 if(c.receivedItemRows===0)activityNeed(n.sourceRecordedSalesCounterSumLexeme==='0'&&n.sourceReportedUnitCounterSumLexeme==='0'&&n.sourceReportedMesosSumLexeme==='0'&&n.medianCountProxySumLexeme===null,'activity_empty_coverage');activityNeed(same(v.semantics,ACTIVITY_SEMANTICS),'activity_semantics');return v;
}
export function activityProfileShape(v){activityExact(v,['schemaVersion','kind','protocol','definitionHash','publicEpoch','available']);activityNeed(v.schemaVersion===1&&v.kind==='overview_activity_public_profile'&&v.protocol===ACTIVITY_PROTOCOL&&v.definitionHash===ACTIVITY_DEFINITION_SHA&&activityEpoch(v.publicEpoch)&&v.available===true,'activity_profile');return freezeActivity(v);}
export function activityResponse(reference,publicEpoch,state='current'){
 activityReferenceShape(reference);activityNeed(activityEpoch(publicEpoch)&&['current','retained'].includes(state),'activity_response_context');
 return freezeActivity({schemaVersion:1,kind:'overview_window_activity_response',protocol:ACTIVITY_PROTOCOL,definitionHash:ACTIVITY_DEFINITION_SHA,publicEpoch,state,currentAgainstPublishedPointer:state==='current',upstreamLatestInspected:false,reference});
}
const typed=Object.getPrototypeOf(Uint8Array.prototype),length=Object.getOwnPropertyDescriptor(typed,'byteLength').get,tag=Object.getOwnPropertyDescriptor(typed,Symbol.toStringTag).get;
export function ownActivityBytes(input,max=ACTIVITY_MAX_BYTES){let n;try{activityNeed(tag.call(input)==='Uint8Array','activity_byte_type');n=length.call(input);}catch{throw Error('activity_byte_type');}activityNeed(activityInteger(n,1,max),'activity_byte_bound');const owned=new Uint8Array(n);Uint8Array.prototype.set.call(owned,input);return owned;}
export async function parseActivityResponse(input,{expectedEpoch,expectedSha256,status=200}={}){
 const raw=ownActivityBytes(input);activityNeed(activityEpoch(expectedEpoch)&&activityHash(expectedSha256)&&[200,409].includes(status),'activity_expected');
 activityNeed(await sha256(raw)===expectedSha256,'activity_response_hash');const v=parseStrictJson(raw);activityExact(v,['schemaVersion','kind','protocol','definitionHash','publicEpoch','state','currentAgainstPublishedPointer','upstreamLatestInspected','reference']);
 activityNeed(v.schemaVersion===1&&v.kind==='overview_window_activity_response'&&v.protocol===ACTIVITY_PROTOCOL&&v.definitionHash===ACTIVITY_DEFINITION_SHA&&v.publicEpoch===expectedEpoch&&v.state===(status===200?'current':'retained')&&v.currentAgainstPublishedPointer===(status===200)&&v.upstreamLatestInspected===false,'activity_response');activityReferenceShape(v.reference);return freezeActivity(v);
}
export async function projectActivitySummary(summary,{sourceWitnessSha256,scopeHash}={}){
 activityExact(summary,['schemaVersion','kind','profileVersion','profileHash','derivedBodySha256','source','window','grain','publicationEligible','sourceActorsExported','individualTradesQualified','coverage','counterSums','top20','semantics']);activityNeed(activityHash(sourceWitnessSha256)&&activityHash(scopeHash)&&summary.schemaVersion===1&&summary.profileVersion==='overview-membership-and-derived-v1'&&activityHash(summary.profileHash)&&summary.grain==='source_reported_overview_window_not_daily'&&summary.kind==='overview_window_activity_summary'&&summary.publicationEligible===false&&summary.sourceActorsExported===false&&summary.individualTradesQualified===0&&activityHash(summary.derivedBodySha256),'activity_summary_projection');
 const copy=v=>JSON.parse(JSON.stringify(v)),base={schemaVersion:1,kind:'overview_window_activity',profile:ACTIVITY_PROFILE,definitionHash:ACTIVITY_DEFINITION_SHA,sourceWitnessSha256,derivedBodySha256:summary.derivedBodySha256,source:copy(summary.source),window:copy(summary.window),coverage:copy(summary.coverage),counterSums:copy(summary.counterSums),semantics:ACTIVITY_SEMANTICS};
 const generation=await sha256(activityEnc.encode(JSON.stringify({scopeHash,...base}))),v={schemaVersion:base.schemaVersion,kind:base.kind,profile:base.profile,definitionHash:base.definitionHash,generation,sourceWitnessSha256:base.sourceWitnessSha256,derivedBodySha256:base.derivedBodySha256,source:base.source,window:base.window,coverage:base.coverage,counterSums:base.counterSums,semantics:base.semantics};activityReferenceShape(v);activityNeed(activityEnc.encode(JSON.stringify(activityResponse(v,'reference-public-v1'))).length<=ACTIVITY_MAX_BYTES,'activity_public_bound');return freezeActivity(v);
}
