import{assertSafeItemDto,parseStrictJson,sha256,PROFILE}from'./api-price-item-dto.mjs';
// WORK-only pure compiler/selector. This is NOT an owner, outbox or publication authority.
const encoder=new TextEncoder(),HASH=/^[a-f0-9]{64}$/;
export const LIMITS=Object.freeze({items:20000,shards:512,shardBytes:262144,totalBytes:33554432,manifestBytes:1048576});
const fail=c=>{throw Error(c);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,n)=>{if(!object(v)||Object.keys(v).sort().join(',')!==n.slice().sort().join(','))fail('shape');};
const id=v=>{if(!Number.isSafeInteger(v)||v<1||v>999999999)fail('item_id');return v;};
const integer=(v,min,max)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail('integer');return v;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const encode=v=>encoder.encode(JSON.stringify(v));
function source(v){const s=structuredClone(v);exact(s,['provider','operation','sourceUrl','rawBodySha256','retrievedAt','retrievalTimeKind','sourceObservedAt','window','sourceWindowSemantics']);if(s.provider!=='maplestory.market'||s.operation!=='prices'||s.sourceUrl!==PROFILE.sourceUrl||!HASH.test(s.rawBodySha256)||s.sourceObservedAt!==null||s.retrievalTimeKind!=='http_response_completed'||s.sourceWindowSemantics!=='primary_client_reported_window_not_exact_observation_bounds'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(s.retrievedAt)||!Number.isFinite(Date.parse(s.retrievedAt)))fail('source');exact(s.window,['reportedDays','exactStartAt','exactEndAt']);if(s.window.reportedDays!==3||s.window.exactStartAt!==null||s.window.exactEndAt!==null)fail('window');return s;}
function shardDocument(s,rows){return{schemaVersion:1,kind:'private_fast_item_current_shard',profileVersion:1,source:s,items:rows};}
// Call only inside the existing owned registry prepare/commit ticket. This API itself
// cannot prove that caller authority; publication must independently rebind the receipt.
export async function compileFastCurrent(snapshot,ownedItemIds,{maxTotalBytes=LIMITS.totalBytes}={}){
 integer(maxTotalBytes,1,LIMITS.totalBytes);
 if(!snapshot||typeof snapshot.getItem!=='function')fail('snapshot');exact(snapshot.summary,['profileVersion','itemCount','rawBodySha256','source']);
 const s=source(snapshot.summary.source);if(snapshot.summary.profileVersion!==1||snapshot.summary.rawBodySha256!==s.rawBodySha256)fail('snapshot_source');
 if(!Array.isArray(ownedItemIds)||!ownedItemIds.length||ownedItemIds.length>LIMITS.items||snapshot.summary.itemCount!==ownedItemIds.length)fail('membership');
 const ids=ownedItemIds.map(id).sort((a,b)=>a-b);if(new Set(ids).size!==ids.length)fail('duplicate_id');
 // Own serialized bytes synchronously before the first digest await. No raw reparse,
 // lossy decimal conversion, variant pooling, or implicit carry between receipts.
 const bodies=[],bounds=[];let rows=[],rowBytes=0,total=0;
 const empty=JSON.stringify(shardDocument(s,[])),prefix=empty.slice(0,-2),suffix=']}';
 const overhead=encoder.encode(prefix+suffix).length;
 function flush(){if(!rows.length)return;const raw=encoder.encode(prefix+rows.map(v=>v.json).join(',')+suffix);if(raw.length>LIMITS.shardBytes)fail('single_item_capacity_hold');total+=raw.length;if(total>maxTotalBytes||bodies.length>=LIMITS.shards)fail('projection_capacity_hold');bodies.push(raw);bounds.push({count:rows.length,firstId:rows[0].itemId,lastId:rows.at(-1).itemId});rows=[];rowBytes=0;}
 for(const itemId of ids){const dto=snapshot.getItem(itemId);if(!dto||dto.itemId!==itemId)fail('snapshot_membership');assertSafeItemDto(dto);if(!same(dto.source,s))fail('mixed_source');const json=JSON.stringify(dto),n=encoder.encode(json).length;if(overhead+n>LIMITS.shardBytes)fail('single_item_capacity_hold');if(overhead+rowBytes+rows.length+n>LIMITS.shardBytes)flush();rows.push({itemId,json});rowBytes+=n;}flush();
 const descriptors=[];for(let i=0;i<bodies.length;i++){const raw=bodies[i];descriptors.push({index:i,sha256:await sha256(raw),bytes:raw.length,...bounds[i]});}
 const manifest={schemaVersion:1,kind:'private_fast_item_current_manifest',profileVersion:1,source:s,itemCount:ids.length,itemIds:ids,totalBytes:total,shards:descriptors};const raw=encode(manifest);if(raw.length>LIMITS.manifestBytes)fail('manifest_capacity_hold');return Object.freeze({manifest:freeze(manifest),manifestBytes:raw,manifestSha256:await sha256(raw),shardBytes:Object.freeze(bodies)});
}
export function assertFastManifest(v){exact(v,['schemaVersion','kind','profileVersion','source','itemCount','itemIds','totalBytes','shards']);if(v.schemaVersion!==1||v.kind!=='private_fast_item_current_manifest'||v.profileVersion!==1)fail('manifest_profile');source(v.source);integer(v.itemCount,1,LIMITS.items);integer(v.totalBytes,1,LIMITS.totalBytes);if(!Array.isArray(v.itemIds)||v.itemIds.length!==v.itemCount||v.itemIds.some((n,i)=>id(n)!==n||(i&&v.itemIds[i-1]>=n))||!Array.isArray(v.shards)||!v.shards.length||v.shards.length>LIMITS.shards)fail('manifest_membership');let count=0,total=0;for(let i=0;i<v.shards.length;i++){const d=v.shards[i];exact(d,['index','sha256','bytes','count','firstId','lastId']);if(d.index!==i||!HASH.test(d.sha256))fail('descriptor');integer(d.bytes,1,LIMITS.shardBytes);integer(d.count,1,LIMITS.items);if(d.firstId!==v.itemIds[count]||d.lastId!==v.itemIds[count+d.count-1])fail('descriptor_membership');count+=d.count;total+=d.bytes;}if(count!==v.itemCount||total!==v.totalBytes||encode(v).length>LIMITS.manifestBytes)fail('manifest_counts');return true;}
export async function selectFastItem(manifest,raw,requestedId){
 // Reader must first hash-bind this closed manifest to its fenced own pointer.
 const m=structuredClone(manifest);assertFastManifest(m);requestedId=id(requestedId);const offset=m.itemIds.indexOf(requestedId);if(offset<0)return null;const d=m.shards.find(d=>requestedId>=d.firstId&&requestedId<=d.lastId);if(!(raw instanceof Uint8Array)||raw.length!==d.bytes)fail('shard_bytes');raw=new Uint8Array(raw);if(await sha256(raw)!==d.sha256)fail('shard_hash');let v;try{v=parseStrictJson(raw);}catch{fail('shard_json');}exact(v,['schemaVersion','kind','profileVersion','source','items']);if(v.schemaVersion!==1||v.kind!=='private_fast_item_current_shard'||v.profileVersion!==1||!same(v.source,m.source)||!Array.isArray(v.items)||v.items.length!==d.count)fail('shard_context');const start=m.shards.slice(0,d.index).reduce((a,x)=>a+x.count,0);for(let i=0;i<v.items.length;i++){const row=v.items[i];assertSafeItemDto(row);if(row.itemId!==m.itemIds[start+i]||!same(row.source,m.source))fail('shard_membership');}return freeze(v.items.find(v=>v.itemId===requestedId));
}
