import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import{createManualInventoryCacheController}from'../ui-src/inventory-manual/cache-controller.mjs';
import{fixtureReferences,priceResponse}from'./inventory-manual-cache-fixtures.mjs';
const origin='https://inflation.gg',path='/api-item-prices/9000001.json';
test('own positive real typed bytes complete within the batch budget',async()=>{const ref=(await fixtureReferences())[0],response=await priceResponse(ref,path);const c=createManualInventoryCacheController({enabled:true,origin,timeoutMs:1000,fetcher:async()=>response});assert.equal((await c.refresh([9000001])).status,'ready');assert.equal(c.peek().length,1);});
test('required whole-action deadline rejects final real digest continuation after budget even when timer delivery is blocked',async()=>{
 const ref=(await fixtureReferences())[0],response=await priceResponse(ref,path),subtle=crypto.subtle,old=Object.getOwnPropertyDescriptor(subtle,'digest'),original=subtle.digest.bind(subtle);let calls=0;
 Object.defineProperty(subtle,'digest',{configurable:true,writable:true,value:async(...args)=>{const value=await original(...args);calls++;if(calls===2){const until=performance.now()+100;while(performance.now()<until){}}return value;}});
 try{const c=createManualInventoryCacheController({enabled:true,origin,timeoutMs:40,fetcher:async()=>response}),start=performance.now(),result=await c.refresh([9000001]),elapsedMs=performance.now()-start,observation={status:result.status,elapsedMs,configuredBatchMs:40,actualDigestCalls:calls,cachedReferenceItems:c.peek().length,pendingPhysical:c.state().physical.physicalPending,realTypedBytes:true,nativeNetwork:0};
 /* CI retains the observation in test output, without writing a tracked proof. */console.log(JSON.stringify(observation));assert(elapsedMs>=100);assert.equal(result.status,'timed_out');assert.equal(c.peek().length,0);
 }finally{if(old)Object.defineProperty(subtle,'digest',old);else delete subtle.digest;}
});
