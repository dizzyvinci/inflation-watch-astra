import {basicReadProofURL} from './fixtures/basic-read-proof-output.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import{writeFileSync}from'node:fs';import{produced}from'./basic-read-selected-fixture.mjs';import{createBasicSelectedCacheReader}from'../ops/api-basic-current-cache-reader.mjs';
test('late synchronous pins admission cannot bypass joined absolute budget',async t=>{
 const g=await produced(t,{extraItems:0});
 let time=0,finishes=0,release,hit;
 const hold=new Promise(r=>release=r),entered=new Promise(r=>hit=r);
 const record={status:'ready',expectedRaw:g.inputs.expectedRaw,expectedOriginalSha256:g.inputs.expectedOriginalSha256,newerBasicObservedIntentPresent:false};
 const provider=()=>{const stack=new Error().stack;if(stack.includes('at fence ')&&stack.includes('at finish ')){finishes++;if(finishes===2)time=11;}return record;};
 const bucket={get:async key=>{if(key.endsWith('/current.json')){hit();await hold;}return g.f.bucket.get(key);}},mono=()=>time,opts={enabled:true,bucket,scope:g.e.scope,committedPinsProvider:provider,monotonic:mono};
 const long=createBasicSelectedCacheReader({...opts,waitMs:1000}),short=createBasicSelectedCacheReader({...opts,waitMs:10});
 // This case exercises synchronous closing admission using its virtual clock.
 // Native wall timers are covered by the separate waiter-deadline regression.
 // Hold timer dispatch here so machine load cannot expire the short caller
 // before it reaches the closing admission that this regression must exercise.
 const realSet=globalThis.setTimeout,realClear=globalThis.clearTimeout,timers=new Set();
 globalThis.setTimeout=(fn,ms)=>{const token={fn,ms};timers.add(token);return token;};
 globalThis.clearTimeout=token=>{if(!timers.delete(token))realClear(token);};
 try{
  const a=long.read(2040801);await entered;
  const b=short.read(2040801);release();
  const[av,bv]=await Promise.all([a,b]);
  const evidence={finishes,mono:time,longStatus:av.status,shortStatus:bv.status,shortCurrent:bv.currentAgainstProvidedPins,actualOperations:0};
  writeFileSync(basicReadProofURL('INDEPENDENT_LATE_WAITER_FENCE.json'),JSON.stringify(evidence,null,2)+'\n');
  assert.equal(finishes,2);
  assert.equal(av.status,'validated');
  assert.equal(bv.currentAgainstProvidedPins,false);
  assert.equal(time,11);
  assert.equal(timers.size,0);
 }finally{release();globalThis.setTimeout=realSet;globalThis.clearTimeout=realClear;}
});
