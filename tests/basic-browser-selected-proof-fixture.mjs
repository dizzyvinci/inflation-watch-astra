import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import vm from 'node:vm';
import {fixture} from './basic-browser-source-fixture.mjs';
import {BASIC_CURRENT_CONTRACT_SHA} from '../ops/api-basic-current-registration.mjs';
import {verifyBasicPrivateGraph,projectBasicPublicItem} from '../ops/api-basic-current-public-projection.mjs';
import {parseBasicPublicItem,BASIC_PUBLIC_DEFINITION_SHA,BASIC_PRIVATE_CONTRACT_SHA,BASIC_PUBLIC_MAX_BYTES,ownBasicBytes} from '../ops/api-basic-current-public-contract.mjs';
const enc=new TextEncoder(),sha=b=>createHash('sha256').update(b).digest('hex'),encode=v=>enc.encode(JSON.stringify(v)),clone=structuredClone;
const cfg={schemaVersion:1,enabled:true,approvalRecorded:true,profile:'basic_aggregate_v1',contractSha256:BASIC_CURRENT_CONTRACT_SHA,grantReference:'synthetic-grant',roundReference:'synthetic-r1',epoch:'synthetic-basic-v1',publicationEnabled:false};
export async function produced(t,{extraItems=1239,change=null}={}){
 const f=await fixture(t,{fast:false,extraItems,basicRegistrationConfig:cfg}),owner=f.owner.basicCurrentRegistration.owner,a=f.seed(change?change(f.prices()):f.prices());f.registry.reconcile(8);assert.equal((await f.registry.drainOne(async()=>{})).status,'registry_capture_accepted');
 for(let i=0;i<200&&!f.row("SELECT gid FROM basic_generations WHERE role='current'");i++){await owner.drainOne(async()=>{});f.now[0]=Math.max(f.now[0]+1,owner.nextDue()??0);}const r=f.row("SELECT * FROM basic_generations WHERE role='current'");assert(r);
 // Independent source/SQL expected witness is captured BEFORE any graph bytes.
 const source=JSON.parse(r.source_json),job=f.row('SELECT state,attempt_id,lease_until,receipt_key FROM api_jobs WHERE job_key=?',source.jobKey),attempt=f.row('SELECT result FROM api_attempts WHERE id=?',source.attempt);f.registry.owned({receipt_key:source.receiptKey,job_key:source.jobKey,source_attempt:source.attempt,raw_sha:source.rawSha,request_at:Date.parse(source.requestAt),operation:'prices'});
 assert.equal(job.state,'complete');assert.equal(job.attempt_id,null);assert.equal(job.lease_until,null);assert.equal(attempt.result,'success');assert.equal(job.receipt_key,source.receiptKey);
 const e={schemaVersion:1,kind:'root_recorded_basic_private_graph_expected_v1',profile:'basic_aggregate_v1',privateContractSha256:BASIC_PRIVATE_CONTRACT_SHA,definitionHash:BASIC_PUBLIC_DEFINITION_SHA,generation:r.gid,pointerSha256:sha(enc.encode(r.pointer_raw)),manifestSha256:r.manifest_sha,manifestBytes:enc.encode(r.manifest_raw).length,bodySha256:r.body_sha,source,scope:JSON.parse(owner.control().scope_json),sourceJobState:job.state,sourceAttemptResult:attempt.result,sourceLiveAttemptId:job.attempt_id,sourceLeaseCleared:job.lease_until===null,basicGenerationRole:r.role,basicGenerationPhase:r.phase};
 const expectedRaw=encode(e),expectedOriginalSha256=sha(expectedRaw),originalManifest=JSON.parse(r.manifest_raw),get=key=>{const b=f.objects.get(key)?.body;assert(b,key);return typeof b==='string'?enc.encode(b):new Uint8Array(b);};
 const inputs={expectedRaw,expectedOriginalSha256,pointerRaw:get('_private/provider-api/v1/basic-current/v1/current.json'),manifestRaw:get('_private/provider-api/v1/basic-current/v1/objects/'+r.manifest_sha+'.json'),pagesRaw:originalManifest.pages.map(p=>get('_private/provider-api/v1/basic-current/v1/objects/'+p.sha+'.json'))};
 assert.equal(f.reads.filter(k=>k===a.receiptKey).length,1);assert.equal(f.provider.length,0);return{f,a,e,inputs,owner};
}
