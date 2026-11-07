// Fixed stdin typed validation only. No network, credentials or payload output.
import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
const root=process.argv[2],load=path=>import(pathToFileURL(resolve(root,'ops',path)).href);
const check=v=>{if(!v)throw Error('invalid_local_current_search');};
try{
 const chunks=[];let bytes=0;for await(const part of process.stdin){bytes+=part.byteLength;check(bytes<=1048576);chunks.push(part);}const {parseStrictJson,sha256}=await load('api-price-item-dto.mjs'),{decodeCanonicalBase64}=await load('bounded-base64.mjs');
 const input=parseStrictJson(Buffer.concat(chunks));check(input&&Object.keys(input).sort().join('|')===['status','route','headers','condition','identityEpoch','fastEpoch','wallNow','raw','rawBytes'].sort().join('|'));check(Number.isInteger(input.status)&&Number.isFinite(input.wallNow));
 const route=input.route;check(route&&typeof route==='object'&&typeof route.path==='string'&&['manifest','page','fast'].includes(route.kind)&&route.limit===({manifest:65536,page:131072,fast:300000})[route.kind]);const h=new Headers(input.headers),condition=input.condition;
 check(condition===null||typeof condition==='string'&&condition.length<=160);check(h.get('x-astra-preview')==='password');check([200,304,404,409].includes(input.status)&&(route.kind==='fast'||input.status===200||input.status===304));check(Number.isInteger(input.rawBytes)&&input.rawBytes>=0&&input.rawBytes<=(input.status===304?0:input.status===404||input.status===409?4096:route.limit));
 const raw=input.rawBytes?decodeCanonicalBase64(input.raw,input.rawBytes):(check(input.raw===''),new Uint8Array());const status=input.status;
 check((h.get('Content-Encoding')??'identity')==='identity');if(status!==304)check((h.get('Content-Type')??'').split(';')[0].trim().toLowerCase()==='application/json');
 if(route.kind==='fast'){
  const {validatePublicItemReference}=await load('api-item-reference-protocol.mjs'),{validateFastItemHeaders,parseFastItemError,validPublicEpoch}=await load('api-fast-item-public-protocol.mjs');check(validPublicEpoch(input.fastEpoch));
  check(Object.keys(route).sort().join('|')===['kind','path','limit','itemId','wanted'].sort().join('|')&&route.limit===300000&&Number.isSafeInteger(route.itemId)&&/^[1-9][0-9]{0,8}$/.test(String(route.itemId))&&(route.wanted===null||typeof route.wanted==='string'&&/^[a-f0-9]{64}$/.test(route.wanted))&&route.path==='/api-item-prices/'+route.itemId+'.json'+(route.wanted?'?generation='+route.wanted:''));
  check([200,304,404,409].includes(status));if(status===200||status===304)check(['validated_cache','retained'].includes(h.get('X-Astra-API-Item-Mode')));
  const tag=h.get('ETag');check(/^"api-item-[a-f0-9]{64}"$/.test(tag??''));const hash=tag.slice(10,-1),capturedAt=h.get('X-Astra-API-Item-Captured-At'),generation=h.get('X-Astra-API-Item-Generation');
  if(status===304)check(raw.length===0&&condition===tag);else{check(raw.length>0&&await sha256(raw)===hash);const body=parseStrictJson(raw);if(status===200){const dto=await validatePublicItemReference(body);check(dto.itemId===route.itemId&&dto.projectionGeneration===generation&&dto.sourceCapturedAt===capturedAt&&(!route.wanted||route.wanted===generation));}else{check(raw.length<=4096);parseFastItemError(raw,{kind:status===404?'membership_absent':'generation_changed',itemId:route.itemId,generation,capturedAt});}}
  const frame=await validateFastItemHeaders(h,{generation,capturedAt,bodySha256:hash,now:input.wallNow});check(frame.epoch===input.fastEpoch);
 }else{
  const {parseIdentityManifest,parseIdentityPageObject}=await load('api-search-identity-contract.mjs'),{validateSearchIdentityHeaders,validateSearchIdentityPageHeaders}=await load('api-search-identity-protocol.mjs'),{matchesSearchIdentityDefinition,SEARCH_IDENTITY_DEFINITION}=await load('api-search-identity-definition.mjs');
  check([200,304].includes(status));const tag=h.get('ETag');check(/^"search-identities-v2-[a-f0-9]{64}"$/.test(tag??''));const hash=tag.slice(22,-1);
  if(status===304)check(raw.length===0&&condition===tag);else check(raw.length>0&&await sha256(raw)===hash);
  if(route.kind==='manifest'){
   check(Object.keys(route).sort().join('|')===['kind','path','limit'].sort().join('|')&&route.path==='/api-search-identities/v2/manifest.json'&&route.limit===65536);const frame=await validateSearchIdentityHeaders(h,{expectedEpoch:input.identityEpoch,bodySha256:hash});
   if(status===200){const m=await parseIdentityManifest(raw);check(matchesSearchIdentityDefinition(m,SEARCH_IDENTITY_DEFINITION)&&m.publicationEpoch===frame.publicationEpoch&&m.publicationRevision===frame.publicationRevision&&m.indexHash===frame.indexHash);}
  }else{
   check(Object.keys(route).sort().join('|')===['kind','path','limit','pageHash'].sort().join('|')&&route.kind==='page'&&route.limit===131072&&/^[a-f0-9]{64}$/.test(route.pageHash)&&route.path==='/api-search-identities/v2/'+route.pageHash+'.json'&&hash===route.pageHash);validateSearchIdentityPageHeaders(h,{bodySha256:hash});if(status===200)await parseIdentityPageObject(raw,hash);
  }
 }
 process.stdout.write(JSON.stringify({valid:true}));
}catch{process.stderr.write('local_current_search_contract_invalid');process.exitCode=2;}
