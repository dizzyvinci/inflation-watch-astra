import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {produced} from './basic-read-selected-fixture.mjs';
import {verifyBasicPrivateGraph,projectBasicPublicItem} from '../ops/api-basic-current-public-projection.mjs';
import {admitBasicSelectedPins,verifyBasicSelectedSqlProof,projectBasicSelectedPublicItem} from '../ops/api-basic-current-selected-proof.mjs';
import {parseBasicPublicItem,BASIC_PUBLIC_DEFINITION_SHA} from '../ops/api-basic-current-public-contract.mjs';
const enc=new TextEncoder(),encode=v=>enc.encode(JSON.stringify(v)),sha=b=>createHash('sha256').update(b).digest('hex');
function selected(inputs,itemId){const m=JSON.parse(new TextDecoder().decode(inputs.manifestRaw)),i=m.pages.findIndex(d=>itemId>=d.firstId&&itemId<=d.lastId);return{expectedRaw:inputs.expectedRaw,expectedOriginalSha256:inputs.expectedOriginalSha256,itemId,pointerRaw:inputs.pointerRaw,manifestRaw:inputs.manifestRaw,pageRaw:i<0?null:inputs.pagesRaw[i]};}
async function parse(out){return parseBasicPublicItem(out.raw,{expectedItemId:out.value.itemId,expectedDefinitionHash:BASIC_PUBLIC_DEFINITION_SHA,expectedPayloadSha256:sha(out.raw),expectedGeneration:out.value.generation,expectedCapturedAt:out.value.capturedAt});}

test('actual1537 producer independentSQL witness→selectedpage proof equals full projection, brands/scopes distinct',async t=>{
 const {f,inputs}=await produced(t),full=await verifyBasicPrivateGraph(inputs),ids=[...f.names.keys()].sort((a,b)=>a-b);
 for(const id of [ids[0],2040801,ids.at(-1)]){const proof=await verifyBasicSelectedSqlProof(selected(inputs,id)),out=projectBasicSelectedPublicItem(proof);assert.equal(proof.verificationScope,'committed_sql_attestation_and_selected_page');assert.equal(proof.bodyHashVerification,'producer_sql_attested_not_recomputed');assert.equal(proof.fullBodyRecomputed,false);assert.equal(Buffer.compare(out.raw,projectBasicPublicItem(full,id).raw),0);const dto=await parse(out);assert.equal(dto.itemId,id);assert.equal(dto.sold.medianUnitPrice,'34567.89');assert.equal(dto.sold.averageUnitPrice,'999999');assert.equal(dto.asking.medianUnitPrice,'25000.04999999999999999');assert.equal(dto.upstreamLatestInspected,false);assert.throws(()=>projectBasicPublicItem(proof,id),/verified_graph/);assert.throws(()=>projectBasicSelectedPublicItem(full),/proof_brand/);assert.throws(()=>projectBasicSelectedPublicItem({...proof}),/proof_brand/);}
 assert.equal(f.provider.length,0);
});

test('scoped absence outside complete manifest ranges or inside a verified page is null, not globalabsence/zero',async t=>{
 const {f,inputs}=await produced(t,{extraItems:0}),ids=[...f.names.keys()].sort((a,b)=>a-b);let gap=null;for(let i=1;i<ids.length;i++)if(ids[i]>ids[i-1]+1){gap=ids[i-1]+1;break;}assert(gap);
 const hole=await verifyBasicSelectedSqlProof(selected(inputs,gap));assert.equal(hole.membershipVerification,'pinned_complete_manifest_and_selected_page');const h=await parse(projectBasicSelectedPublicItem(hole));assert.equal(h.state,'absent_in_generation');assert.equal(h.sold,null);assert.equal(h.asking,null);
 const outer=selected(inputs,999999999);assert.equal(outer.pageRaw,null);const proof=await verifyBasicSelectedSqlProof(outer);assert.equal(proof.membershipVerification,'pinned_complete_manifest_ranges');assert.equal((await parse(projectBasicSelectedPublicItem(proof))).state,'absent_in_generation');await assert.rejects(verifyBasicSelectedSqlProof({...outer,pageRaw:inputs.pagesRaw[0]}),/unexpected_page/);
});

test('independent pin admission is reusable before acquisition with owned frozen scope/source and unforgeable local brand',async t=>{
 const {inputs}=await produced(t,{extraItems:0}),admitted=await admitBasicSelectedPins({expectedRaw:inputs.expectedRaw,expectedOriginalSha256:inputs.expectedOriginalSha256});assert(Object.isFrozen(admitted.expectation)&&Object.isFrozen(admitted.expectation.source)&&Object.isFrozen(admitted.expectation.scope));const s=selected(inputs,2040801);await assert.rejects(verifyBasicSelectedSqlProof({...s,admittedPins:admitted}),/ambiguous_pins/);delete s.expectedRaw;delete s.expectedOriginalSha256;assert.equal((await verifyBasicSelectedSqlProof({...s,admittedPins:admitted})).itemId,2040801);await assert.rejects(verifyBasicSelectedSqlProof({...s,admittedPins:{...admitted}}),/pins_brand/);
});

test('selected proof explicitly relies on attested fullbodySHA rather than silently reusing full-body recomputation',async t=>{
 const {inputs,e}=await produced(t,{extraItems:0}),expected={...e,bodySha256:'f'.repeat(64)},expectedRaw=encode(expected),differentAttestation={...inputs,expectedRaw,expectedOriginalSha256:sha(expectedRaw)};
 const proof=await verifyBasicSelectedSqlProof(selected(differentAttestation,2040801));assert.equal(proof.producerAttestedBodySha256,'f'.repeat(64));assert.equal(proof.fullBodyRecomputed,false);assert.equal(proof.bodyHashVerification,'producer_sql_attested_not_recomputed');
 await assert.rejects(verifyBasicPrivateGraph(differentAttestation),/membership_body_hash/);
});

test('missing/wrong page and original witness/hash/scope/current-state substitutions never establish selected brand',async t=>{
 const {inputs,e}=await produced(t,{extraItems:0}),s=selected(inputs,2040801);assert(s.pageRaw);await assert.rejects(verifyBasicSelectedSqlProof({...s,pageRaw:null}),/page_hash/);const badPage=s.pageRaw.slice();badPage[100]^=1;await assert.rejects(verifyBasicSelectedSqlProof({...s,pageRaw:badPage}));
 for(const mutate of [v=>v.basicGenerationRole='active',v=>v.basicGenerationPhase='readback',v=>v.sourceJobState='pending',v=>v.sourceLiveAttemptId=9,v=>v.scope.epoch='other-epoch',v=>v.privateContractSha256='0'.repeat(64),v=>v.definitionHash='0'.repeat(64)]){const changed=structuredClone(e);mutate(changed);const raw=encode(changed);await assert.rejects(verifyBasicSelectedSqlProof({...s,expectedRaw:raw,expectedOriginalSha256:sha(raw)}));}
 const stale=encode({...e,bodySha256:'e'.repeat(64)});await assert.rejects(verifyBasicSelectedSqlProof({...s,expectedRaw:stale}),/original_sha/);
});

test('all chosen-page siblings are semantically checked even with coherent replacement hashes',async t=>{
 const {inputs,e}=await produced(t,{extraItems:0}),s=selected(inputs,2040801),m=JSON.parse(new TextDecoder().decode(s.manifestRaw)),p=JSON.parse(new TextDecoder().decode(s.pointerRaw)),i=m.pages.findIndex(d=>2040801>=d.firstId&&2040801<=d.lastId),page=JSON.parse(new TextDecoder().decode(s.pageRaw));
 const sibling=page.rows.find(r=>r[0]!==2040801);assert(sibling);sibling[4]=-1;const pageRaw=encode(page),old=m.pages[i].bytes;m.pages[i].sha=sha(pageRaw);m.pages[i].bytes=pageRaw.length;m.totalBytes+=pageRaw.length-old;const manifestRaw=encode(m);p.manifestSha=sha(manifestRaw);p.manifestBytes=manifestRaw.length;const pointerRaw=encode(p),changed={...e,manifestSha256:sha(manifestRaw),manifestBytes:manifestRaw.length,pointerSha256:sha(pointerRaw)},expectedRaw=encode(changed);
 await assert.rejects(verifyBasicSelectedSqlProof({...s,pageRaw,manifestRaw,pointerRaw,expectedRaw,expectedOriginalSha256:sha(expectedRaw)}),/sold_counts/);
});

test('owned inputs,<=262144 selectedpage, original absolute budget and cancellation retain no authority afterexpiry',async t=>{
 const {inputs}=await produced(t,{extraItems:0}),s=selected(inputs,2040801),copy=structuredClone(s),task=verifyBasicSelectedSqlProof(copy);for(const k of ['expectedRaw','pointerRaw','manifestRaw','pageRaw'])copy[k].fill(0);assert.equal((await task).itemId,2040801);await assert.rejects(verifyBasicSelectedSqlProof({...s,pageRaw:new Uint8Array(262145)}),/byte_bound/);
 const original=crypto.subtle.digest.bind(crypto.subtle);let mono=0,count=0;crypto.subtle.digest=async(...a)=>{const r=await original(...a);if(++count===6)mono=21;return r;};try{await assert.rejects(verifyBasicSelectedSqlProof({...s,monotonic:()=>mono,waitMs:20,deadline:20}),/deadline/);assert.equal(count,6);}finally{crypto.subtle.digest=original;}
 const c=new AbortController();c.abort();await assert.rejects(verifyBasicSelectedSqlProof({...s,signal:c.signal}),/deadline/);await assert.rejects(verifyBasicSelectedSqlProof({...s,monotonic:()=>0,waitMs:20,deadline:21}),/budget/);
});
