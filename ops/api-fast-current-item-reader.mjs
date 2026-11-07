// Unregistered derived FAST graph reader. No route, source parse, provider or writes.
import {parseStrictJson,sha256} from './api-price-item-dto.mjs';
import {assertFastManifest,selectFastItem} from './api-fast-current-projection.mjs';
import {makePublicItemReference} from './api-item-reference-protocol.mjs';
const PREFIX='_private/provider-api/v1/fast-current/v1/';
export const FAST_READER_POINTER=PREFIX+'current.json';
export const FAST_READ_LIMITS=Object.freeze({physical:2,pointerBytes:4096,manifestBytes:1048576,shardBytes:262144,chunks:1024,actionMs:10000});
const reservations=new WeakMap(),enc=new TextEncoder(),H=/^[a-f0-9]{64}$/;
const check=v=>{if(!v)throw Error('fast_item_unavailable');};
const num=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const closed=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.split(' ').sort().join('|'));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function validatePointer(p,scope,now){
 closed(p,'schemaVersion kind profileVersion generation manifestKey manifestSha256 manifestBytes itemCount sourceAttemptId rawBodySha256 capturedAt sourceObservedAt publicationEligible publicationOrdinal grantReference roundReference');
 check(p.schemaVersion===1&&p.kind==='private_fast_item_current_pointer'&&p.profileVersion===1&&H.test(p.generation)&&p.generation===p.manifestSha256&&p.manifestKey===PREFIX+'manifests/'+p.manifestSha256+'.json'&&num(p.manifestBytes,1,1048576)&&num(p.itemCount,1,20000)&&num(p.sourceAttemptId,1)&&H.test(p.rawBodySha256)&&iso(p.capturedAt)&&Date.parse(p.capturedAt)<=now&&p.sourceObservedAt===null&&p.publicationEligible===false&&num(p.publicationOrdinal,1)&&p.grantReference===scope.grantReference&&p.roundReference===scope.roundReference);
 return p;
}
export function createFastCurrentItemReader({bucket,scope,metadata,enabled=false,isEnabled=()=>true,now=Date.now,waitMs=2500}={}){
 // Off does not inspect bucket/scope/metadata or construct a reservation.
 if(enabled!==true)return Object.freeze({read:async()=>Object.freeze({status:'disabled'}),setEnabled:()=>{},state:()=>Object.freeze({enabled:false,physicalPending:0})});
 check(bucket&&typeof bucket.get==='function'&&typeof isEnabled==='function'&&typeof now==='function'&&num(waitMs,1,10000));
 const monotonicNow=performance.now.bind(performance);
 scope=structuredClone(scope);closed(scope,'grantReference roundReference');check([scope.grantReference,scope.roundReference].every(v=>typeof v==='string'&&v.length>0&&v.length<=300));
 metadata=structuredClone(metadata);check(Array.isArray(metadata)&&metadata.length>=1&&metadata.length<=4);
 for(const m of metadata){closed(m,'sourceUrl expectedSha256');check(H.test(m.expectedSha256)&&/^https:\/\/maplestory\.io\/api\/MCW\/1\/item\/list\?cashFilter=(?:true|false)&count=10000$/.test(m.sourceUrl));}
 const reservation=reservations.get(bucket)??{pending:0};reservations.set(bucket,reservation);
 let on=true,epoch=0,last=null,retryAt=0,failures=0;const flights=new Map();
 const active=()=>{try{return on&&isEnabled()===true;}catch{return false;}};
 function setEnabled(value){on=value===true;epoch++;last=null;retryAt=0;failures=0;}
 function fence(c){check(active()&&!c.cancelled&&c.epoch===epoch&&monotonicNow()<c.deadline);}
 async function bytes(c,key,max,expected,hash){
  fence(c);const o=await bucket.get(key);const body=o?.body;
  try{fence(c);check(o);const size=o.size;check(num(size,1,max)&&(!expected||size===expected)&&body&&typeof body.getReader==='function');return await readBody(c,body,size,hash);}
  catch(e){try{if(body&&!body.locked)void Promise.resolve(body.cancel()).catch(()=>{});}catch{}throw e;}
 }
 async function readBody(c,body,declaredSize,hash){
  const reader=body.getReader(),parts=[];let size=0,chunks=0;
  try{for(;;){const v=await reader.read();fence(c);if(v.done)break;check(v.value instanceof Uint8Array&&++chunks<=1024);size+=v.value.byteLength;check(size<=declaredSize);parts.push(v.value.slice());}}
  catch(e){try{void Promise.resolve(reader.cancel()).catch(()=>{});}catch{}throw e;}
  finally{reader.releaseLock();}
  check(size===declaredSize);const raw=new Uint8Array(size);let at=0;for(const p of parts){raw.set(p,at);at+=p.length;}
  if(hash)check(await sha256(raw)===hash);fence(c);return raw;
 }
 function monotonic(p){if(!last)return;check(p.publicationOrdinal>=last.publicationOrdinal&&p.sourceAttemptId>=last.sourceAttemptId&&Date.parse(p.capturedAt)>=Date.parse(last.capturedAt));if(p.publicationOrdinal===last.publicationOrdinal||p.sourceAttemptId===last.sourceAttemptId)check(JSON.stringify(p)===JSON.stringify(last));}
 async function perform(c,id){
  const p=validatePointer(parseStrictJson(await bytes(c,FAST_READER_POINTER,4096)),scope,now());monotonic(p);
  const raw=await bytes(c,p.manifestKey,1048576,p.manifestBytes,p.manifestSha256),m=parseStrictJson(raw);assertFastManifest(m);
  check(m.itemCount===p.itemCount&&m.source.rawBodySha256===p.rawBodySha256&&m.source.retrievedAt===p.capturedAt);
  const d=m.shards.find(d=>id>=d.firstId&&id<=d.lastId);
  if(!m.itemIds.includes(id)){fence(c);monotonic(p);last=p;return freeze({status:'not_in_projection',generation:p.generation,sourceCapturedAt:p.capturedAt});}
  check(d);const shard=await bytes(c,PREFIX+'shards/'+d.sha256+'.json',262144,d.bytes,d.sha256),dto=await selectFastItem(m,shard,id);fence(c);check(dto);
  // Selector validates ALL siblings, not just the requested item. Bind every
  // sibling's identity evidence to the caller's reviewed metadata references.
  for(const row of parseStrictJson(shard).items)for(const e of row.identity.evidence)check(metadata.some(m=>m.sourceUrl===e.sourceUrl&&m.expectedSha256===e.retainedMetadataSha256));
  fence(c);const dtoHash=await sha256(enc.encode(JSON.stringify(dto)));fence(c);
  const reference=await makePublicItemReference(dto,p.generation,dtoHash);fence(c);monotonic(p);last=p;
  return freeze({status:'validated',reference,publicationOrdinal:p.publicationOrdinal});
 }
 function read(id){
  if(!active())return Promise.resolve(freeze({status:'disabled'}));
  if(!num(id,1,999999999))return Promise.resolve(freeze({status:'invalid_item_id'}));
  if(flights.has(id))return flights.get(id).visible;
  if(now()<retryAt||reservation.pending>=2)return Promise.resolve(freeze({status:'unavailable'}));
  const c={epoch,cancelled:false,deadline:monotonicNow()+waitMs},slot={visible:null};reservation.pending++;
  let timer;const timeout=new Promise(resolve=>{timer=setTimeout(()=>{c.cancelled=true;resolve(freeze({status:active()?'unavailable':'disabled'}));},waitMs);});
  const task=perform(c,id).then(value=>{fence(c);failures=0;retryAt=0;return value;}).catch(()=>{if(c.epoch===epoch&&active()){retryAt=now()+Math.min(30000,1000*2**Math.min(5,failures++));}return freeze({status:active()?'unavailable':'disabled'});});
  slot.visible=Promise.race([task,timeout]).then(value=>{if(value.status==='validated'||value.status==='not_in_projection'){try{fence(c);}catch{return freeze({status:active()?'unavailable':'disabled'});}}return value;}).finally(()=>clearTimeout(timer));flights.set(id,slot);
  // Timeouts do NOT release physical capacity. Even a newly constructed reader
  // on this bucket shares the reservation until the underlying body/hash settles.
  task.finally(()=>{reservation.pending--;if(flights.get(id)===slot)flights.delete(id);}).catch(()=>{});
  return slot.visible;
 }
 return Object.freeze({read,setEnabled,state:()=>freeze({enabled:active(),physicalPending:reservation.pending})});
}
