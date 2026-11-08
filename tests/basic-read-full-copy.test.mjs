import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {verifyBasicPrivateGraph} from '../ops/api-basic-current-public-projection.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('external proxy Array length and each entry read exactly once; captured views do not switch during copy',async()=>{
 const Native=Uint8Array,small=new Native(1),large=new Native(262144),counts=Array(40).fill(0);let lengths=0,copies=0;
 const target=Array(40),pages=new Proxy(target,{get(o,k){if(k==='length'){lengths++;return 40;}if(/^\d+$/.test(String(k))){const i=Number(k);return++counts[i]===1?small:large;}return Reflect.get(o,k);}}),root=new Native([123,125]);
 globalThis.Uint8Array=new Proxy(Native,{construct(t,a){if(a[0]===262144)copies++;return Reflect.construct(t,a,t);}});
 try{await assert.rejects(verifyBasicPrivateGraph({expectedRaw:root,expectedOriginalSha256:sha(root),pointerRaw:root,manifestRaw:root,pagesRaw:pages}));assert.equal(lengths,1);assert(counts.every(n=>n===1));assert.equal(copies,0);}finally{globalThis.Uint8Array=Native;}
});
test('resizable captured view growing during later entry cannot allocate above original admitted per-view cap',async()=>{
 const Native=Uint8Array,ab=new ArrayBuffer(1,{maxByteLength:262144}),view=new Native(ab),root=new Native([123,125]);let copies=0,hashes=0;
 const pages=[view];Object.defineProperty(pages,1,{get(){ab.resize(262144);return new Native(1);}});const original=crypto.subtle.digest.bind(crypto.subtle);
 globalThis.Uint8Array=new Proxy(Native,{construct(t,a){if(a[0]===262144)copies++;return Reflect.construct(t,a,t);}});crypto.subtle.digest=(...a)=>{hashes++;return original(...a);};
 try{await assert.rejects(verifyBasicPrivateGraph({expectedRaw:root,expectedOriginalSha256:sha(root),pointerRaw:root,manifestRaw:root,pagesRaw:pages}),/byte_bound/);assert.equal(copies,0);assert.equal(hashes,0);}finally{globalThis.Uint8Array=Native;crypto.subtle.digest=original;}
});
