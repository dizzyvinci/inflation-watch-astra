const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash,webcrypto}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {JSDOM}=require('jsdom');
const canonical=path.resolve(__dirname,'..');
const result=spawnSync('python',[path.join(__dirname,'local_cash_interop_fixture.py')],{encoding:'utf8',windowsHide:true,maxBuffer:200000,timeout:10000});
assert.equal(result.status,0,result.stderr);const fixture=JSON.parse(result.stdout);assert.equal(fixture.synthetic,true);assert.equal(fixture.externalRequests,0);
const dom=new JSDOM('<!doctype html><button id="refresh"></button>',{url:'http://127.0.0.1:8765/',runScripts:'outside-only'}),w=dom.window;
for(const[k,v]of Object.entries({TextEncoder,TextDecoder,structuredClone,AbortController,Response,Request,Headers}))w[k]=v;
Object.defineProperty(w,'crypto',{value:webcrypto});Object.defineProperty(w.document,'visibilityState',{value:'hidden',configurable:true});w.fetch=()=>{throw Error('Unexpected default fetch');};
for(const name of ['api-cash-protocol.js','api-cash-client.js'])w.eval(fs.readFileSync(path.join(canonical,'web',name),'utf8'));
let now=Date.parse('2026-11-05T23:05:00Z'),next=0,calls=[];const timers=new Map();let timerId=0;
const options={now:()=>now,visible:()=>true,online:()=>true,random:()=>0,setTimer:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimer:id=>timers.delete(id),fetcher:async(url,opts)=>{assert.equal(url,'/api-cash-items.json');calls.push(opts);const r=fixture.responses[next++];return new Response(r.status===304?null:r.body,{status:r.status,headers:r.headers});}};
(async()=>{
 const first=fixture.responses[0],etag='"'+createHash('sha256').update(first.body).digest('hex')+'"';assert.equal(first.headers.ETag,etag);assert.match(etag,/^"[a-f0-9]{64}"$/);assert.equal(fixture.head.headers.ETag,etag);assert.equal(fixture.head.body,'');assert.equal(Number(fixture.head.headers['Content-Length']),Buffer.byteLength(first.body));
 const client=w.AstraApiCash.createClient(options);await client.refresh();assert.equal(client.getState().status,'ready');const stamp=client.getState().data.capturedAt;
 now+=30001;await client.refresh();assert.equal(client.getState().status,'ready');assert.equal(calls[1].headers['If-None-Match'],etag);assert.equal(client.getState().data.capturedAt,stamp);
 now+=30001;await client.refresh();assert.equal(client.getState().status,'retained');assert.equal(client.getState().serverMode,'retained_last_good');assert.equal(client.getState().data.capturedAt,stamp);assert.equal(client.getState().data.records.length,29);client.close();
 // Negative controls ensure this integration detects the actual prior defect.
 for(const changed of [{'ETag':'"local-cash-'+etag.slice(1,-1)+'"'},{'X-Astra-Cash-Phase':'wrong'},{'X-Astra-Cash-Mode':'wrong'},{'X-Astra-Cash-Captured-At':'2030-01-01T00:00:00.000Z'}]){
  const bad=w.AstraApiCash.createClient({...options,fetcher:async()=>new Response(first.body,{status:200,headers:{...first.headers,...changed}})});await bad.refresh();assert.equal(bad.getState().data,null);assert.equal(bad.getState().error,'invalid');bad.close();
 }
 assert.equal(calls.length,3);console.log('PASS real api-cash-client interoperability: local200, body-SHA ETag, HEAD, verified304, retained304 and negative header controls; synthetic only, zero external requests');
 w.AstraApiCash.client.close();w.close();
})().catch(error=>{console.error(error);w.AstraApiCash.client.close();w.close();process.exitCode=1;});
