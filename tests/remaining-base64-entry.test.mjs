import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeNxReceipt} from '../ops/api-nx-offers.mjs';
import {projectItemHistoryReceipt,ItemHistoryContractError} from '../ops/api-item-hour-history-profile.mjs';
import {fixture as historyFixture,receipt as historyReceipt} from './item-hour-fixture.mjs';
import {fixture as discoveryFixture} from './api-item-discovery-fixture.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const maxBody='[]'+' '.repeat(4999998);
function nx(raw='[]'){
 return{kind:'unverified_provider_api_receipt',operation:'nx-history',httpStatus:200,sourceUrl:'https://maplestory.market/api/nx-rate/history?range=7d&step=hour',rawBodyEncoding:'base64',schemaVerified:false,publicationEligible:false,sourceObservedAt:null,observationTimestampKnown:false,captureTimeKind:'http_response_completed',requestStartedAt:'2026-11-05T22:53:50.000Z',capturedAt:'2026-11-05T22:53:51.000Z',attemptId:50,rawBodyBase64:Buffer.from(raw).toString('base64'),responseBytes:Buffer.byteLength(raw),responseSha256:hash(raw)};
}
async function history(t,raw='[]',mutate=()=>{}){const f=historyFixture(t),r=f.seed(historyReceipt({raw}));mutate(r.envelope);return projectItemHistoryReceipt(r.envelope,f.ledger.owned(r.key));}
async function discovery(t,raw='[]',mutate=()=>{}){
 const f=await discoveryFixture(t),r=f.seedMembership('catalogue',2,raw);mutate(r.value);f.objects.set(r.key,{body:JSON.stringify(r.value),etag:'synthetic'});f.discovery.reconcile();assert.equal((await f.step()).status,'metadata_ready');return{f,r,result:await f.step()};
}
test('NX actual production decoder admits canonical exactly5MB originalJSON; originalclock/hash/source semantics survive',async()=>{const e=nx(maxBody),p=await decodeNxReceipt(e);assert.equal(p.rawBytes,5000000);assert.equal(p.rawSha256,e.responseSha256);assert.equal(p.capturedAt,e.capturedAt);assert.equal(p.rows.length,0);assert.equal(p.qualifiedIndividualTrades,0)});
test('hourly actual production projector admits canonical exactly5MB originalJSON; originalcontext and emptyunknown coverage survive',async t=>{const p=await history(t,maxBody);assert.equal(p.context.rawBytes,5000000);assert.equal(p.context.rawBodySha256,hash(maxBody));assert.equal(p.context.capturedAt,'2026-11-05T22:03:50.050Z');assert.equal(p.rows.length,0);assert.equal(p.coverage.missingBucketHours,null);assert.equal(p.individualTradesQualified,0)});
test('discovery actual production drain admits canonical exactly5MB ownedJSON and marks ONLYsuccessful ownedcapture',async t=>{const{f,r,result}=await discovery(t,maxBody);assert.equal(result.status,'membership_accepted');assert.equal(result.itemCount,0);assert.equal(f.row('SELECT state FROM discovery_jobs WHERE receipt_key=?',r.key).state,'complete');assert.equal(f.calls?.length??0,0);assert(f.objects.has(r.key))});
for(const [label,mutate]of[
 ['alphabet',e=>e.rawBodyBase64='!'+e.rawBodyBase64.slice(1)],
 ['paddingbits',e=>e.rawBodyBase64='W11='],
 ['paddingplacement',e=>e.rawBodyBase64='W=0='],
 ['declaredlength',e=>e.responseBytes++],
 ['rawSHA',e=>e.responseSha256='0'.repeat(64)],
 ['overcap',e=>e.responseBytes=5000001]
]){
 test(`NX ${label} fails closed with existingTypeError classification`,async()=>{const e=nx();mutate(e);await assert.rejects(decodeNxReceipt(e),TypeError)});
 test(`hourly ${label} fails closed with existingItemHistoryContractError classification`,async t=>{await assert.rejects(history(t,'[]',mutate),ItemHistoryContractError)});
 test(`discovery ${label} quarantines onlysource withoutnewprovider/delete/publication`,async t=>{const{f,r,result}=await discovery(t,'[]',mutate);assert.equal(result.status,'profile_quarantine');assert.equal(f.row('SELECT state FROM discovery_jobs WHERE receipt_key=?',r.key).state,'quarantined');assert(f.objects.has(r.key));assert.equal(f.calls?.length??0,0)});
}
test('all three entrychannels preserve canonical one/two/no-padding validJSON byte cases',async t=>{for(const raw of ['[]','[] ','[]  ']){assert.equal((await decodeNxReceipt(nx(raw))).rows.length,0);assert.equal((await history(t,raw)).rows.length,0);assert.equal((await discovery(t,raw)).result.status,'membership_accepted')}});
