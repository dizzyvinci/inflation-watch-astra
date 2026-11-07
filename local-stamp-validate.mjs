import {loadStampReferenceDefinition,parseStampReferenceCapture,stampSha256} from './ops/stamp-reference-contract.mjs';
const need=value=>{if(!value)throw Error('invalid_local_stamp_reference')};
try{
 let length=0;const parts=[];for await(const part of process.stdin){length+=part.length;need(length<=200000);parts.push(part)}
 const input=JSON.parse(Buffer.concat(parts).toString('utf8'));
 need(input&&Object.keys(input).sort().join(',')==='capturedAt,etag,publicationOrdinal,raw,registryHash,wallNow');
 need(typeof input.raw==='string'&&input.raw.length<=174768&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.raw));
 need(Number.isSafeInteger(input.wallNow)&&Number.isSafeInteger(input.publicationOrdinal)&&input.publicationOrdinal>0);
 const raw=new Uint8Array(Buffer.from(input.raw,'base64'));need(raw.length>0&&raw.length<=131072);
 const definition=await loadStampReferenceDefinition(),capture=parseStampReferenceCapture(raw,{definition,checkedAt:input.wallNow+60000}),hash=await stampSha256(raw);
 need(input.etag==='"stamp-references-'+hash+'"'&&input.registryHash===definition.registryArtifactSha256&&input.capturedAt===capture.source.capturedAt);
 process.stdout.write(JSON.stringify({bodySha256:hash,registryHash:definition.registryArtifactSha256,capturedAt:capture.source.capturedAt,publicationOrdinal:input.publicationOrdinal}));
}catch{process.stdout.write(JSON.stringify({status:'invalid_local_stamp_reference'}));process.exitCode=2}
