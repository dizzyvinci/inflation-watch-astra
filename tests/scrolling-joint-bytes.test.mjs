import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';
import{evaluateManualBytes}from'../ui-src/scrolling-joint/solver/joint-economics.mjs';import{decodeManualBytes,INPUT_CAP}from'../ui-src/scrolling-joint/solver/joint-manual-wire.mjs';
const cases=JSON.parse(fs.readFileSync(new URL('./fixtures/scrolling-joint-economic-oracles.json',import.meta.url))),valid=JSON.stringify(cases.cases.find(c=>c.name==='known94-global-unknown').wire),enc=new TextEncoder(),dec=new TextDecoder();
const result=raw=>JSON.parse(dec.decode(evaluateManualBytes(raw,{enabled:true})));
test('oversized intrinsic view rejects byteLength shadows1/0/huge/getter before any decoder',()=>{
 for(const mode of[1,0,2**40,'getter']){
  const raw=enc.encode(' '.repeat(100000)+valid);let reads=0,decodes=0;
  Object.defineProperty(raw,'byteLength',mode==='getter'?{get(){reads++;return 1}}:{value:mode});
  const Original=globalThis.TextDecoder;globalThis.TextDecoder=class{constructor(){decodes++}decode(){throw Error('must not decode oversized')}};
  let error;try{decodeManualBytes(raw)}catch(e){error=e}finally{globalThis.TextDecoder=Original;}
  assert.equal(error?.message,'manual_body_bound');assert.equal(decodes,0);assert.equal(reads,0);assert.equal(result(raw).reason,'manual_body_bound');
 }
});
test('ordinary bounds exact65536 whitespace succeeds and65537refuses',()=>{
 const validBytes=enc.encode(valid),exact=enc.encode(' '.repeat(INPUT_CAP-validBytes.length)+valid);assert.equal(exact.byteLength,65536);assert.equal(result(exact).bestKnownNet,'94');
 const large=enc.encode(' '.repeat(INPUT_CAP+1-validBytes.length)+valid);assert.equal(result(large).reason,'manual_body_bound');assert.equal(result(new Uint8Array()).reason,'manual_body_bound');
});
test('small actual views ignore byteLength/byteOffset/buffer/length shadows and own only view',()=>{
 for(const mode of[1,0,2**40,'getter']){
  const payload=enc.encode(valid),backing=new Uint8Array(payload.length+200);backing.fill(88);backing.set(payload,100);const raw=new Uint8Array(backing.buffer,100,payload.length);let reads=0;
  Object.defineProperty(raw,'byteLength',mode==='getter'?{get(){reads++;throw Error('shadow')}}:{value:mode});
  for(const key of['byteOffset','buffer','length'])Object.defineProperty(raw,key,{get(){reads++;throw Error('shadow')}});
  assert.equal(result(raw).bestKnownNet,'94');assert.equal(reads,0);assert.equal(backing[0],88);assert.equal(backing[backing.length-1],88);
 }
});
test('wrong views/proxy/prototype spoof/shared/detached refuse intrinsic brand',()=>{
 const byte=enc.encode(valid),backing=new ArrayBuffer(2048),views=[new DataView(backing),new Uint16Array(backing),new Uint8ClampedArray(backing),backing,{},Object.create(Uint8Array.prototype),new Proxy(byte,{get(){throw Error('no proxy getter')}})];
 if(typeof SharedArrayBuffer==='function')views.push(new Uint8Array(new SharedArrayBuffer(1024)));
 const detached=enc.encode(valid);structuredClone(detached.buffer,{transfer:[detached.buffer]});Object.defineProperty(detached,'byteLength',{value:1});views.push(detached);
 for(const raw of views)assert.equal(result(raw).reason,'manual_body_bound');
});
test('genuine cross-realm Uint8 and stable resizable view use native range, out-of-bounds refuses',()=>{
 const raw=vm.runInNewContext('new Uint8Array('+JSON.stringify([...enc.encode(valid)])+')');assert.equal(result(raw).bestKnownNet,'94');
 if(typeof ArrayBuffer.prototype.resize==='function'){
  const p=enc.encode(valid),buffer=new ArrayBuffer(p.length+8,{maxByteLength:p.length+32}),view=new Uint8Array(buffer,4,p.length);view.set(p);assert.equal(result(view).bestKnownNet,'94');buffer.resize(2);Object.defineProperty(view,'byteLength',{value:1});assert.equal(result(view).reason,'manual_body_bound');
 }
});
