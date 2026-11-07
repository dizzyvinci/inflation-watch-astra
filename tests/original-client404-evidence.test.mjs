// Evidence of existing-client behavior, not an assertion of desired behavior.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {setup}from'./fast-public-fixture.mjs';
async function original(name){let code=fs.readFileSync(new URL('./fixtures/before-fast/'+name,import.meta.url),'utf8');for(const leaf of['api-item-reference-protocol.mjs','api-price-item-dto.mjs'])code=code.replaceAll('../../ops/'+leaf,new URL('../ops/'+leaf,import.meta.url).href);return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
test('preserved original client retains prior DTO after actual current-route409 then authoritative404; old lifecycle retains panel too',async t=>{
 const x=await setup(t,{extraItems:1});await x.publish();const route=x.route({ttlMs:0}),id=8000000,calls=[];
 const {createItemReferenceClient}=await original('item-loader.mjs'),{createItemPanelLifecycle}=await original('lifecycle.mjs');
 const client=createItemReferenceClient({enabled:true,ttlMs:0,now:()=>x.f.now[0],fetcher:async(url,opt)=>{const r=await route(new Request('https://own.example'+url,opt));calls.push(r.status);return r;}}),first=await client.loadItem({itemId:id});
 let reject=false,mounted=false;const panel=createItemPanelLifecycle({container:{ownerDocument:{}},loader:async()=>{if(reject)throw Object.assign(Error('not_found'),{code:'not_found'});return first.data;},mountPanel(){mounted=true;return{destroy(){mounted=false;},updateDto(){},updateTimezone(){}};}});await panel.show(id);reject=true;assert.equal((await panel.refresh()).status,'retained');assert(mounted);
 const raw=x.f.prices(),at=raw.lastIndexOf(',{"item_id":8000000,');await x.publish(raw.slice(0,at)+']','2026-11-06T12:02:00.000Z');x.f.now[0]+=30001;const retained=await client.loadItem({itemId:id});assert.deepEqual(calls,[200,409,404]);assert.equal(retained.mode,'retained');assert.equal(client.state(id).capturedAt,first.data.sourceCapturedAt);assert.equal(x.f.provider.length,0);
 t.diagnostic(JSON.stringify({originalClientStatusSequence:calls,originalClientBehavior:'retained_prior_DTO_after_authoritative404',originalLifecycleBehavior:'retained_panel_after_not_found',desiredBehavior:'per_ID_withdrawal',sourceCalls:0}));
});
