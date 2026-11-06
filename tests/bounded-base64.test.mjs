import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {decodeCanonicalBase64} from '../ops/bounded-base64.mjs';
import {PrivateItemProducer} from '../ops/api-private-item-producer.mjs';
const encode=b=>Buffer.from(b).toString('base64');
function frame(raw){const hash=createHash('sha256').update(raw).digest('hex'),request=Date.parse('2026-11-06T04:00:00.000Z');return{env:{kind:'unverified_provider_api_receipt',operation:'prices',sourceUrl:'https://maplestory.market/api/prices',httpStatus:200,attemptId:1,grantReference:'synthetic',roundReference:'synthetic',requestStartedAt:new Date(request).toISOString(),capturedAt:new Date(request+50).toISOString(),captureTimeKind:'http_response_completed',sourceObservedAt:null,observationTimestampKnown:false,schemaVerified:false,publicationEligible:false,responseSha256:hash,responseBytes:raw.length,rawBodyEncoding:'base64',rawBodyBase64:encode(raw)},job:{source_attempt:1,grant_ref:'synthetic',round_ref:'synthetic',request_at:request,raw_sha:hash},now:request+100};}
test('all256 byte values roundtrip over every padding case; empty/unsafe/oversize bounds rejected',()=>{
 for(const n of [1,2,3,4,5,255,256,257]){const bytes=Uint8Array.from({length:n},(_,i)=>i%256);assert.deepEqual(decodeCanonicalBase64(encode(bytes),n),bytes);}
 for(const n of [0,-1,5000001,NaN,Infinity,1.5,'1',true])assert.throws(()=>decodeCanonicalBase64('AAAA',n));
});
test('canonical padding bits and alphabet reject malformed/noncanonical input before decode',()=>{
 for(const [value,n]of [['AB==',1],['AAB=',2],['AAAA=',3],['AAA',2],['AA=A',2],['A===',1],['=AAA',3],['AA\n=',2],['AAAA ',3],['\u0100AAA',3],['!!!!',3],['',1]])assert.throws(()=>decodeCanonicalBase64(value,n));
});
test('full5MB valid raw now passes actual unchanged producer envelope identity/clocks/hash frame',()=>{
 const raw=new Uint8Array(5000000);for(let i=0;i<raw.length;i++)raw[i]=i%256;
 const f=frame(raw),result=PrivateItemProducer.prototype.envelope.call({now:()=>f.now},f.env,f.job);
 assert.equal(result.rawBytes.length,5000000);assert.equal(createHash('sha256').update(result.rawBytes).digest('hex'),f.env.responseSha256);
});
test('producer still rejects declared counts/hash/clock/grant/round/evidence mismatches',()=>{
 const f=frame(new Uint8Array([1,2,3]));for(const [key,value]of [['responseBytes',4],['responseSha256','f'.repeat(64)],['attemptId',2],['grantReference','foreign'],['roundReference','foreign'],['capturedAt','2099-01-01T00:00:00.000Z'],['schemaVerified',true],['sourceObservedAt','2026-11-06T04:00:00.050Z']])assert.throws(()=>PrivateItemProducer.prototype.envelope.call({now:()=>f.now},{...f.env,[key]:value},f.job));
});
test('noncanonical equal-decoded bytes are rejected; owned caller bytes are returned separately',()=>{
 const raw=new Uint8Array([0]),f=frame(raw);assert.throws(()=>PrivateItemProducer.prototype.envelope.call({now:()=>f.now},{...f.env,rawBodyBase64:'AB=='},f.job));
 const result=PrivateItemProducer.prototype.envelope.call({now:()=>f.now},f.env,f.job);result.rawBytes[0]=255;assert.equal(raw[0],0);assert.equal(f.env.rawBodyBase64,'AA==');
});
