import test from 'node:test';import assert from 'node:assert/strict';
import worker from '../ops/worker.mjs';
import {createPublicItemPriceRoute,publicItemPricesStatus} from '../ops/api-public-item-routes.mjs';
const FLAG={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:true},origin='https://inflation.gg',request=(path='/api-item-prices/1082000.json',init={})=>new Request(origin+path,init);
const forbidden=(env,names)=>{for(const key of names)Object.defineProperty(env,key,{get(){throw Error('forbidden '+key);}});return env;};
test('absent/off/malformed item publication cannot inspect bindings, keys, owner or cache',async()=>{
 for(const flag of [undefined,'{"enabled":false}','{bad',JSON.stringify({...FLAG,extra:true}),JSON.stringify({...FLAG,publicationEnabled:false})]){
  const env=forbidden({API_PUBLIC_ITEM_PRICES_JSON:flag},['API_RAW_RECEIPTS','SNAPSHOTS','API_BUDGET_OWNER','MAPLESTORY_MARKET_APPROVED_API_KEY','API_GRANT_JSON']);assert.notEqual(publicItemPricesStatus(env),'ready');
  assert.equal((await createPublicItemPriceRoute()(request(),env)).status,404);
  assert.equal((await worker.fetch(request(),env)).status,404);
 }
});
test('whole-site password gate denies item reads before touching any private binding',async()=>{
 const env=forbidden({PREVIEW_ACCESS:'password',PREVIEW_PASSWORD:'test-only-password',PREVIEW_SESSION_SECRET:'test-only-random-session-secret-at-least-32-characters',API_PUBLIC_ITEM_PRICES_JSON:JSON.stringify(FLAG)},['API_RAW_RECEIPTS','API_BUDGET_OWNER','MAPLESTORY_MARKET_APPROVED_API_KEY']);
 const r=await worker.fetch(request(),env);assert.equal(r.status,401);assert.equal(r.headers.get('Cache-Control'),'private, no-store, no-transform');
});
test('fixed ID/method/query validation happens before bucket access',async()=>{
 const env=forbidden({API_PUBLIC_ITEM_PRICES_JSON:JSON.stringify(FLAG)},['API_RAW_RECEIPTS']),route=createPublicItemPriceRoute();
 for(const [path,method,status]of [['/api-item-prices/001.json','GET',404],['/api-item-prices/1082000.json','POST',405],['/api-item-prices/1082000.json?source=https://example.com','GET',400],['/api-item-prices/1082000.json?generation=x','GET',400]])assert.equal((await route(request(path,{method}),env)).status,status);
});
test('one fixed-metadata reader per bucket; feature off mid-flight suppresses its response',async()=>{
 let factories=0,resolve;const bucket={get(){throw Error('unused');}},env={API_PUBLIC_ITEM_PRICES_JSON:JSON.stringify(FLAG),API_RAW_RECEIPTS:bucket};
 const route=createPublicItemPriceRoute({routeFactory(options){factories++;assert.equal(options.metadata.length,2);assert(options.metadata.every(m=>m.sourceUrl.startsWith('https://maplestory.io/api/MCW/1/item/list?cashFilter=')));assert.equal(options.enabled,true);return()=>new Promise(r=>{resolve=r;});}});
 const pending=route(request(),env);env.API_PUBLIC_ITEM_PRICES_JSON='{"enabled":false}';resolve(new Response('not authorized after Off'));assert.equal((await pending).status,404);assert.equal(factories,1);
 env.API_PUBLIC_ITEM_PRICES_JSON=JSON.stringify(FLAG);const next=route(request(),env);resolve(new Response('{}',{headers:{'Content-Type':'application/json'}}));assert.equal((await next).status,200);assert.equal(factories,1);
});
test('actual integrated reader reports unpublished artifact honestly, never source/owner fallback',async()=>{
 let reads=0;const env=forbidden({PREVIEW_ACCESS:'review',PREVIEW_PASSWORD:'test-only-password',PREVIEW_SESSION_SECRET:'test-only-random-session-secret-at-least-32-characters',API_PUBLIC_ITEM_PRICES_JSON:JSON.stringify(FLAG),API_RAW_RECEIPTS:{async get(key){reads++;assert.equal(key,'_private/provider-api/v1/item-projections/v1/current.json');return null;}}},['API_BUDGET_OWNER','MAPLESTORY_MARKET_APPROVED_API_KEY','API_GRANT_JSON']);
 const r=await worker.fetch(request(),env);assert.equal(r.status,503);assert.equal(r.headers.get('X-Astra-Preview'),'review');assert.equal(r.headers.get('CDN-Cache-Control'),'no-store');assert.equal(reads,1);
 const second=await worker.fetch(request(),env);assert.equal(second.status,503);assert.equal(reads,1,'Cold failure cooldown is shared');
});
