import test from'node:test';import assert from'node:assert/strict';import{createApiCalculationClient}from'../ui-src/api-calculations/client.mjs';
const definition='a'.repeat(64),t0=Date.parse('2026-11-06T12:00:01.000Z');
const dto=(minute=0,available=true)=>({kind:'api_linked_market_calculations',definitionHash:definition,snapshotHash:(minute?'c':'b').repeat(64),sources:{prices:{capturedAt:`2026-11-06T12:${String(minute).padStart(2,'0')}:00.000Z`},overview:{capturedAt:'2026-11-06T11:59:00.000Z'}},current:{available,index:available?126:null}});
const digest=async raw=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function response(value,{status=200,wrongHash=false}={}){const raw=new TextEncoder().encode(JSON.stringify(value)),h={'Cache-Control':'private, no-store, no-transform','Content-Type':'application/json','ETag':'"api-calculations-'+(wrongHash?'0'.repeat(64):await digest(raw))+'"','X-Astra-Calculations-Definition-Hash':definition,'X-Astra-Calculations-Prices-Captured-At':value.sources.prices.capturedAt,'X-Astra-Calculations-Overview-Captured-At':value.sources.overview.capturedAt,'X-Astra-Calculations-Mode':'accepted_cache'};return new Response(status===304?null:raw,{status,headers:h});}
const make=(options={})=>createApiCalculationClient({origin:'https://inflation.gg',parse:async bytes=>JSON.parse(new TextDecoder().decode(bytes)),expectedDefinitionHash:definition,now:()=>t0,...options});
test('construction is offline; simultaneous refreshes share one own request; TTL reads no network',async()=>{
 let calls=0,release;const pending=new Promise(r=>release=r),c=make({fetcher:async(url,options)=>{calls++;assert.equal(url,'https://inflation.gg/api-market-calculations.json');assert.equal(options.redirect,'error');await pending;return response(dto());}});assert.equal(calls,0);
 const first=c.refresh(),second=c.refresh();release();await Promise.all([first,second]);assert.equal(calls,1);await c.refresh();assert.equal(calls,1);assert.equal(c.state().marketSourceAt,'2026-11-06T12:00:00.000Z');
});
test('304 verifies the original source context and never freshens the market timestamp',async()=>{
 let now=t0,calls=0;const c=make({now:()=>now,fetcher:async(url,options)=>{calls++;if(calls===2)assert.match(options.headers['If-None-Match'],/^"api-calculations-/);return response(dto(),{status:calls===1?200:304});}});
 await c.refresh();now+=60001;await c.refresh();assert.equal(calls,2);assert.equal(c.state().status,'current');assert.equal(c.state().marketSourceAt,'2026-11-06T12:00:00.000Z');assert.equal(c.state().checkedAt,'2026-11-06T12:01:01.001Z');
});
test('a newer valid source capture invalidates equal-valued calculations',async()=>{
 let now=t0,calls=0;const changes=[];const c=make({now:()=>now,onChange:s=>changes.push(s),fetcher:async()=>response(dto(calls++?5:0))});await c.refresh();now+=300000;await c.refresh();assert.equal(c.state().snapshot.current.index,126);assert.equal(c.state().marketSourceAt,'2026-11-06T12:05:00.000Z');assert.equal(changes.filter(x=>x.changed).length,2);
});
test('tampered body retains last-good aggregate and original capture, never partial new fields',async()=>{
 let now=t0,calls=0;const c=make({now:()=>now,fetcher:async()=>response(dto(calls++?5:0),{wrongHash:calls===2})});await c.refresh();now+=300000;await c.refresh();assert.equal(c.state().status,'retained');assert.equal(c.state().reason,'own_reader_failed');assert.equal(c.state().snapshot.snapshotHash,'b'.repeat(64));assert.equal(c.state().marketSourceAt,'2026-11-06T12:00:00.000Z');
});
test('missing current aggregate retains the entire previous snapshot with a separately dated check',async()=>{
 let now=t0,calls=0;const c=make({now:()=>now,fetcher:async()=>response(dto(calls?5:0,++calls===1))});await c.refresh();now+=300000;await c.refresh();assert.equal(c.state().status,'retained');assert.equal(c.state().snapshot.current.available,true);assert.equal(c.state().snapshot.sources.prices.capturedAt,'2026-11-06T12:00:00.000Z');assert.equal(c.state().reason,'current_aggregate_unavailable_or_older');
});
test('authorization denial stops automatic retries without new provider or account requests',async()=>{
 let now=t0,calls=0,access=0;const c=make({now:()=>now,onAccessDenied:status=>{assert.equal(status,403);access++;},fetcher:async()=>{calls++;return new Response(null,{status:403});}});await c.refresh();now+=99999999;await c.refresh();assert.equal(calls,1);assert.equal(access,1);assert.equal(c.state().blocked,true);assert.equal(c.state().snapshot,null);
});
test('oversized declared body fails before parsing',async()=>{
 let parsed=0;const c=make({parse:async()=>{parsed++;throw Error('must_not_parse');},fetcher:async()=>new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':'600001','Cache-Control':'private, no-store'}})});await c.refresh();assert.equal(parsed,0);assert.equal(c.state().status,'unavailable');
});
test('response timeout is bounded and cannot create a new observation',async()=>{
 const c=make({timeoutMs:100,fetcher:async()=>new Promise(()=>{})});await c.refresh();assert.equal(c.state().snapshot,null);assert.equal(c.state().reason,'own_reader_failed');
});
test('foreign host configuration is rejected before any request',()=>{assert.throws(()=>make({origin:'https://provider.example'}));});
