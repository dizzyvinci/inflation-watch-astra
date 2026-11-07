import test from'node:test';import assert from'node:assert/strict';import{createRequire}from'node:module';
import {setup}from'./fast-public-fixture.mjs';
import {createItemReferenceClient}from'../ui-src/item-api/item-loader.mjs';
import {createItemPanelLifecycle}from'../ui-src/item-api/lifecycle.mjs';
import {mountItemPricingPanel}from'../ui-src/item-api/panel.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
test('actual DOM panel keeps transient last-good original clock then authoritative404 clears only that current panel',async t=>{
 const x=await setup(t,{extraItems:1}),a=await x.publish(),route=x.route({ttlMs:0}),id=8000000;
 const dom=new JSDOM('<main><div id="legacy-history">Separate daily evidence remains</div><div id="current"></div><output></output></main>',{url:'https://own.example/'});t.after(()=>dom.window.close());
 const doc=dom.window.document,host=doc.getElementById('current'),out=doc.querySelector('output'),calls=[];let fail=false;
 const client=createItemReferenceClient({enabled:true,ttlMs:0,now:()=>x.f.now[0],fetcher:async(url,opt)=>{const r=fail?new Response('{}',{status:503,headers:{'Content-Type':'application/json'}}):await route(new Request('https://own.example'+url,opt));calls.push(r.status);return r;}});
 const lifecycle=createItemPanelLifecycle({container:host,mountPanel:mountItemPricingPanel,loader:async q=>(await client.loadItem(q)).data,onStatus:(status)=>{out.textContent=status;}});
 assert.equal((await lifecycle.show(id)).status,'shown');const original=host.textContent;assert(host.querySelector('.api-item-panel'));assert(original.includes('25,000.0'));assert(original.includes('11-06-2026'));assert.equal(client.state(id).capturedAt,a.e.capturedAt);
 fail=true;x.f.now[0]+=1;assert.equal((await lifecycle.refresh()).status,'shown');assert.equal(out.textContent,'shown');assert.equal(client.state(id).mode,'retained');assert.equal(host.textContent,original);
 fail=false;const raw=x.f.prices(),at=raw.lastIndexOf(',{"item_id":8000000,');assert(at>0);await x.publish(raw.slice(0,at)+']','2026-11-06T12:02:00.000Z');x.f.now[0]+=300001;
 assert.deepEqual(await lifecycle.refresh(),{status:'unavailable',reason:'not_found'});assert.equal(out.textContent,'unavailable');assert.equal(host.querySelector('.api-item-panel'),null);assert.equal(host.textContent,'');assert.equal(doc.getElementById('legacy-history').textContent,'Separate daily evidence remains');assert.equal(client.state(id),null);assert(calls.includes(409)&&calls.at(-1)===404);assert.equal(x.f.provider.length,0);lifecycle.hide();
});
