import test from 'node:test';import assert from 'node:assert/strict';
import {setup} from './fast-public-fixture.mjs';
import {createItemReferenceClient} from '../ui-src/item-api/item-loader.mjs';
test('an actual newer membership404 at the SAME original capture must not resurrect the previous graph response',async t=>{
 const x=await setup(t,{extraItems:1}),a=await x.publish(),route=x.route({ttlMs:0}),id=8000000,calls=[];let oldResponse,stale=false;
 const client=createItemReferenceClient({enabled:true,ttlMs:0,now:()=>x.f.now[0],fetcher:async(url,opt)=>{const r=stale?oldResponse.clone():await route(new Request('https://own.example'+url,opt));calls.push({status:r.status,capturedAt:r.headers.get('X-Astra-API-Item-Captured-At'),generation:r.headers.get('X-Astra-API-Item-Generation')});if(!oldResponse&&r.status===200)oldResponse=r.clone();return r;}});
 const first=await client.loadItem({itemId:id}),oldGeneration=first.data.projectionGeneration,raw=x.f.prices(),at=raw.lastIndexOf(',{"item_id":8000000,');assert(at>0);
 const b=await x.publish(raw.slice(0,at)+']',a.e.capturedAt);assert(b.id>a.id);assert.equal(b.e.capturedAt,a.e.capturedAt);x.f.now[0]+=30001;
 await assert.rejects(client.loadItem({itemId:id}),e=>e.code==='not_found');assert.equal(client.state(id),null);const absence=calls.at(-1);assert.equal(absence.status,404);assert.equal(absence.capturedAt,first.data.sourceCapturedAt);assert.notEqual(absence.generation,oldGeneration);
 x.f.now[0]+=300001;stale=true;let observed;try{const r=await client.loadItem({itemId:id});observed={accepted:true,capture:r.data.sourceCapturedAt,generation:r.data.projectionGeneration,state:client.state(id)};}catch(e){observed={accepted:false,code:e.code};}
 t.diagnostic(JSON.stringify({sourceAttemptA:a.id,sourceAttemptB:b.id,capture:a.e.capturedAt,oldGeneration,newNegativeGeneration:absence.generation,statuses:calls.map(v=>v.status),afterNegative:observed,providerCalls:x.f.provider.length}));assert.equal(x.f.provider.length,0);assert.equal(observed.accepted,false,'negative membership belongs to a later genuine attempt even when original source capture clocks are equal');assert.equal(client.state(id),null);
});
