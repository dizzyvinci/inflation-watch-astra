import test from 'node:test';import assert from 'node:assert/strict';
import {createFastCurrentItemReader,FAST_READER_POINTER} from '../ops/api-fast-current-item-reader.mjs';
import {createIdentityIndex,createPriceSnapshot,sha256,parseStrictJson} from '../ops/api-price-item-dto.mjs';
import {compileFastCurrent} from '../ops/api-fast-current-projection.mjs';
import {makePublicItemReference,validatePublicItemReference} from '../ops/api-item-reference-protocol.mjs';
import {fixture,receipt,sources,grant,raw,sha} from './api-private-item-fixture.mjs';
import {RecurringItemRegistry} from '../ops/item-recurring-registry.mjs';
import {FastCurrentRegistrySink} from '../ops/api-fast-current-owner.mjs';
import {FastCurrentImmutableWriter,FAST_OBJECT_PREFIX} from '../ops/api-fast-current-immutable-writer.mjs';
import {FastCurrentPublication} from '../ops/api-fast-current-publication.mjs';
const enc=new TextEncoder(),tick=()=>new Promise(r=>setImmediate(r));
async function graph({count=2,attempt=1,capturedAt='2026-11-05T21:00:01.050Z'}={}){
 const body=count===2?raw:JSON.stringify(Array.from({length:count},(_,i)=>({...JSON.parse(raw)[0],item_id:2000000+i}))),identities=await createIdentityIndex(sources()),hash=await sha256(enc.encode(body));
 const snapshot=await createPriceSnapshot(enc.encode(body),{expectedSha256:hash,identities,context:{operation:'prices',sourceUrl:'https://maplestory.market/api/prices',capturedAt,sourceObservedAt:null,captureTimeKind:'http_response_completed'}});
 const ids=count===2?[1082000,9999999]:Array.from({length:count},(_,i)=>2000000+i),g=await compileFastCurrent(snapshot,ids);
 const pointer={schemaVersion:1,kind:'private_fast_item_current_pointer',profileVersion:1,generation:g.manifestSha256,manifestKey:FAST_OBJECT_PREFIX+'manifests/'+g.manifestSha256+'.json',manifestSha256:g.manifestSha256,manifestBytes:g.manifestBytes.length,itemCount:ids.length,sourceAttemptId:attempt,rawBodySha256:hash,capturedAt,sourceObservedAt:null,publicationEligible:false,publicationOrdinal:attempt,grantReference:grant.grantReference,roundReference:grant.probeRound};
 const objects=new Map([[FAST_READER_POINTER,enc.encode(JSON.stringify(pointer))],[pointer.manifestKey,g.manifestBytes]]);g.manifest.shards.forEach((d,i)=>objects.set(FAST_OBJECT_PREFIX+'shards/'+d.sha256+'.json',g.shardBytes[i]));
 const gets=[];let hook=null;const bucket={async get(key){gets.push(key);if(hook)await hook(key);const b=objects.get(key);return b?{size:b.length,body:new Response(b).body}:null;}};
 const options={bucket,scope:{grantReference:grant.grantReference,roundReference:grant.probeRound},metadata:sources().map(s=>({sourceUrl:s.sourceUrl,expectedSha256:s.expectedSha256})),enabled:true,now:()=>Date.parse('2026-11-06T00:00:00Z')};
 return {g,ids,snapshot,pointer,objects,gets,bucket,options,reader:createFastCurrentItemReader(options),hook:f=>hook=f};
}


for(const blockAt of [1,2,3,4,5])test('real digest continuation '+blockAt+' cannot admit data after monotonic deadline',async()=>{
 const x=await graph(),original=Object.getOwnPropertyDescriptor(crypto.subtle,'digest'),digest=crypto.subtle.digest.bind(crypto.subtle);let calls=0;
 try{
  Object.defineProperty(crypto.subtle,'digest',{configurable:true,value:async(...args)=>{const v=await digest(...args);calls++;if(calls===blockAt){const until=performance.now()+250;while(performance.now()<until){}}return v;}});
  const r=createFastCurrentItemReader({...x.options,waitMs:100}),start=performance.now(),result=await r.read(x.ids[0]);
  assert.equal(result.status,'unavailable');assert.equal(calls,blockAt);assert(performance.now()-start>=250);assert.equal(r.state().physicalPending,0);assert.equal('reference' in result,false);assert(x.gets.length<=3);
 }finally{if(original)Object.defineProperty(crypto.subtle,'digest',original);else delete crypto.subtle.digest;}
});
test('held final real digest remains physically reserved through timeout and late settlement',async()=>{
 const x=await graph(),original=Object.getOwnPropertyDescriptor(crypto.subtle,'digest'),digest=crypto.subtle.digest.bind(crypto.subtle);let calls=0,release,entered;
 const held=new Promise(r=>release=r),hit=new Promise(r=>entered=r);
 try{
  Object.defineProperty(crypto.subtle,'digest',{configurable:true,value:async(...args)=>{const v=await digest(...args);calls++;if(calls===5){entered();await held;}return v;}});
  const r=createFastCurrentItemReader({...x.options,waitMs:100}),pending=r.read(x.ids[0]);await hit;
  assert.equal((await pending).status,'unavailable');assert.equal(r.state().physicalPending,1);assert.equal(x.gets.length,3);
  r.setEnabled(false);r.setEnabled(true);release();await tick();assert.equal(r.state().physicalPending,0);assert.equal(x.gets.length,3);
 }finally{release?.();if(original)Object.defineProperty(crypto.subtle,'digest',original);else delete crypto.subtle.digest;}
});
