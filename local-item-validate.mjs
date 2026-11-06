// Local-only stdin contract validation. No network, credentials or source reads.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=process.argv[2];
const {parseStrictJson,sha256}=await import(pathToFileURL(resolve(root,'ops/api-price-item-dto.mjs')));
const {validatePublicItemReference}=await import(pathToFileURL(resolve(root,'ops/api-item-reference-protocol.mjs')));
const {validateManifest,validatePage}=await import(pathToFileURL(resolve(root,'ops/api-item-discovery-contract.mjs')));
const check=v=>{if(!v)throw Error('invalid');};
try{
 let text='';for await(const part of process.stdin){text+=part;check(Buffer.byteLength(text)<=1048576);}
 const input=JSON.parse(text),raw=Buffer.from(input.raw,'base64'),v=parseStrictJson(raw),sha=await sha256(raw);
 check(input.mode==='validated_cache'||input.mode==='retained');check(/^[a-f0-9]{64}$/.test(input.generation));
 if(input.kind==='item'){
  await validatePublicItemReference(v);check(v.itemId===input.itemId&&v.projectionGeneration===input.generation);
  check(input.etag==='"api-item-'+sha+'"'&&input.capturedAt===v.sourceCapturedAt);
  check(Date.parse(v.sourceCapturedAt)<=input.wallNow+300000);
  if(input.previous)check(Date.parse(v.sourceCapturedAt)>=Date.parse(input.previous.sourceCapturedAt));
 }else if(input.kind==='manifest'){
  await validateManifest(v);check(v.indexHash===input.generation&&input.etag==='"api-identities-'+sha+'"');
  check(v.sources.every(s=>Date.parse(s.retrievedAt)<=input.wallNow+300000));
  if(input.previous)for(const old of input.previous.sources){const next=v.sources.find(s=>s.operation===old.operation);check(next&&Date.parse(next.retrievedAt)>=Date.parse(old.retrievedAt));}
 }else if(input.kind==='page'){
  const m=await validateManifest(input.manifest),d=m.pages.find(d=>d.sha256===input.pageHash);
  check(d&&m.indexHash===input.generation&&sha===d.sha256&&raw.length===d.bytes&&input.etag==='"api-identities-'+sha+'"');validatePage(v,d,m);
 }else check(false);
 process.stdout.write(JSON.stringify(v));
}catch{process.stderr.write('local_item_contract_invalid');process.exitCode=2;}
