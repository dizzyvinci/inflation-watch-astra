import test from'node:test';import assert from'node:assert/strict';
import{setup}from'./fast-public-fixture.mjs';import{createItemReferenceClient}from'../ui-src/item-api/item-loader.mjs';
import{createItemReferenceClient as original}from'./fixtures/item-loader-before-fast.mjs';
const block=()=>{const until=performance.now()+125;while(performance.now()<until){}};
test('one monotonic client budget covers final hashes,200/304cachecommit and negative floors',async t=>{
 const x=await setup(t,{extraItems:1}),a=await x.publish(),route=x.route({ttlMs:0}),id=8000000,response=await route(x.request(id));
 await t.test('faithful original125ms second-digest input admits beforeimage but rejects R2/no cache under100msbudget',async()=>{
  const observed=[];
  for(const[label,make]of[['original',original],['R2',createItemReferenceClient]]){let digests=0,blocked=false;const digest=crypto.subtle.digest.bind(crypto.subtle),mock=t.mock.method(crypto.subtle,'digest',async(...args)=>{const answer=await digest(...args);if(++digests===2){blocked=true;block();}return answer;});
   try{const client=make({enabled:true,timeoutMs:100,ttlMs:0,now:()=>x.f.now[0],fetcher:async()=>response.clone()}),start=performance.now();let accepted=false,reason=null;try{await client.loadItem({itemId:id});accepted=true;}catch(e){reason=e.code;}observed.push({label,accepted,reason,blocked,elapsedMs:performance.now()-start,cached:client.state(id)!==null});}finally{mock.mock.restore();}}
  assert(observed.every(v=>v.blocked&&v.elapsedMs>=125));assert.deepEqual(observed.map(v=>v.accepted),[true,false]);assert.equal(observed[1].reason,'timeout');assert.equal(observed[1].cached,false);t.diagnostic(JSON.stringify({scope:'preexisting limitation closed in touchedclient, not newR1regression',observed}));
 });
 await t.test('blocking after header verification before200cachecommit cannot install data or revision floor',async()=>{
  let ready=false,once=true;const digest=crypto.subtle.digest.bind(crypto.subtle),mock=t.mock.method(crypto.subtle,'digest',async(...args)=>{const r=await digest(...args);if(new TextDecoder().decode(args[1]).startsWith('["fast-current-v1"'))ready=true;return r;});
  const client=createItemReferenceClient({enabled:true,ttlMs:0,timeoutMs:100,fetcher:async()=>response.clone(),now:()=>{if(ready&&once){once=false;block();}return x.f.now[0];}});
  try{await assert.rejects(client.loadItem({itemId:id}),e=>e.code==='timeout');assert.equal(client.state(id),null);assert.equal(client.ordering().revision,null);}finally{mock.mock.restore();}
 });
 let override=null;const client=createItemReferenceClient({enabled:true,ttlMs:0,timeoutMs:100,now:()=>x.f.now[0],fetcher:(url,opt)=>override?Promise.resolve(override.clone()):route(new Request('https://own.example'+url,opt))});await client.loadItem({itemId:id});
 await x.publish(x.f.prices(),a.e.capturedAt);x.f.now[0]+=30001;
 override=await route(x.request(id,{headers:{'If-None-Match':response.headers.get('ETag')}}));assert.equal(override.status,304);
 await t.test('late304 binding cannot advance revision or freshen source capture',async()=>{
  const digest=crypto.subtle.digest.bind(crypto.subtle);let blocked=false;const mock=t.mock.method(crypto.subtle,'digest',async(...args)=>{const r=await digest(...args);if(new TextDecoder().decode(args[1]).startsWith('["fast-current-v1"')){blocked=true;block();}return r;});
  try{const value=await client.loadItem({itemId:id});assert(blocked);assert.equal(value.mode,'retained');assert.equal(value.data.sourceCapturedAt,a.e.capturedAt);assert.equal(client.ordering().revision,1);}finally{mock.mock.restore();override=null;}
 });
 x.f.now[0]+=300001;await client.loadItem({itemId:id});assert.equal(client.ordering().revision,2);const raw=x.f.prices(),at=raw.lastIndexOf(',{"item_id":8000000,');await x.publish(raw.slice(0,at)+']',a.e.capturedAt);x.f.now[0]+=300001;client.clear();
 await t.test('deadline crossing final negative tombstone write rolls back new authority while retaining conservative withdrawal',async()=>{
  let blocked=false;const set=Map.prototype.set,mock=t.mock.method(Map.prototype,'set',function(k,v){const result=set.call(this,k,v);if(!blocked&&k===id&&v?.revision===3&&v?.bodySha256){blocked=true;block();}return result;});
  try{await assert.rejects(client.loadItem({itemId:id}),e=>e.code==='not_found');assert(blocked);assert.equal(client.state(id),null);assert.equal(client.ordering().revision,2);assert.equal(client.diagnostic(id).reason,'timeout');}finally{mock.mock.restore();}
 });
 assert.equal(x.f.provider.length,0);
});
