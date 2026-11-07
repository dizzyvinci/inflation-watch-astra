// Actual accepted clients over already-admitted in-memory local responses only.
import assert from 'node:assert/strict';
if(!process.argv.includes('--synthetic-stdin')){console.log(JSON.stringify({status:'default_zero',networkCalls:0}));}
else{
 let bytes=0,parts=[];for await(const p of process.stdin){bytes+=p.byteLength;assert(bytes<=4194304);parts.push(p);}const input=JSON.parse(Buffer.concat(parts));
 const {createItemReferenceClient}=await import('../ui-src/item-api/item-loader.mjs'),{createSearchIdentityClient}=await import('../ui-src/item-api/search-identity-client.mjs'),{createSearchSelectedPriceFetcher}=await import('../ui-src/item-api/search-selected-price.mjs');
 const make=p=>new Response([204,304].includes(p.status)?null:Buffer.from(p.body,'base64'),{status:p.status,headers:p.headers});let now=input.wallNow,calls=[];
 if(input.scenario==='atomic'){
  let phase=0;const fetcher=async(path,options)=>{calls.push(path);assert(path.startsWith('/api-search-identities/v2/'));if(path.endsWith('/manifest.json'))return make(phase===1?input.manifest304:phase===2?input.failure:input.manifest);return make(input.pages[path]);};
  const c=createSearchIdentityClient({enabled:true,expectedEpoch:input.profile.identityEpoch,fetcher,now:()=>now}),a=await c.load();assert.equal(a.rows.length,1500);const clock=a.manifest.sources[0].capturedAt,n=calls.length;phase=1;now+=31001;const b=await c.load();assert.equal(b.rows.length,1500);assert.equal(calls.length,n+1);phase=2;now+=31001;const retained=await c.load();assert.equal(retained.mode,'retained');assert.equal(retained.rows.length,1500);assert.equal(retained.manifest.sources[0].capturedAt,clock);console.log(JSON.stringify({status:'PASS',scenario:input.scenario,itemCount:1500,priceCalls:0,networkCalls:0,retainedClock:clock}));
 }else{
  let i=0;const fetcher=async(path,options)=>{calls.push(path);assert.equal(new Headers(options.headers).get('X-Astra-Request-Item-Protocol'),'fast-current-v1');assert(i<input.replies.length,'finite local response sequence exhausted');return make(input.replies[i++]);},c=createItemReferenceClient({enabled:true,fetcher:createSearchSelectedPriceFetcher(fetcher,{expectedEpoch:input.profile.fastEpoch}),now:()=>now});
  const a=await c.loadItem({itemId:input.itemId}),clock=a.data.sourceCapturedAt;now+=31001;
  if(input.scenario==='order'){
   await assert.rejects(c.loadItem({itemId:input.itemId}));assert.equal(c.state(input.itemId),null);now+=310001;await assert.rejects(c.loadItem({itemId:input.itemId}));assert.equal(c.state(input.itemId),null);now+=310001;const fresh=await c.loadItem({itemId:input.itemId});assert.equal(fresh.data.sourceCapturedAt,clock);assert.equal(c.ordering().revision,3);assert.equal(i,5);
  }else if(input.scenario==='malformed404'){
   await assert.rejects(c.loadItem({itemId:input.itemId}));assert.equal(c.state(input.itemId),null);assert(c.ordering().tombstones>0);assert.equal(c.ordering().revision,1);
  }else if(input.scenario==='auth'){
   await assert.rejects(c.loadItem({itemId:input.itemId}));assert.equal(c.diagnostic(input.itemId).blocked,true);assert.equal(c.peekCachedReferences().references.length,0);
  }else if(input.scenario==='retained'){
   const retained=await c.loadItem({itemId:input.itemId});assert.equal(retained.mode,'retained');assert.equal(retained.data.sourceCapturedAt,clock);
  }else assert.fail('closed synthetic scenario');
  console.log(JSON.stringify({status:'PASS',scenario:input.scenario,priceCalls:i,networkCalls:0,originalCapture:clock,ordering:c.ordering()}));
 }
}
