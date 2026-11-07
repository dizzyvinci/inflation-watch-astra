// WORK prototype only: no owner, transport, transaction authority or publication.
import {assertSafeItemDto,sha256} from './api-price-item-dto.mjs';
import {assertFastManifest,LIMITS} from './api-fast-current-projection.mjs';
const enc=new TextEncoder(),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const need=(v,c)=>{if(!v)throw Error(c);};
const keys=v=>Object.keys(v??{}).sort().join(',');
function immutable(v){if(v&&typeof v==='object'){need(Object.isFrozen(v),'immutable_snapshot_required');for(const d of Object.values(Object.getOwnPropertyDescriptors(v))){need(Object.hasOwn(d,'value'),'immutable_data_properties_required');immutable(d.value);}}}
function positive(v,max){return Number.isSafeInteger(v)&&v>0&&v<=max;}

// Own only the membership array, source descriptor and immutable DTO REFERENCES
// before the first await. Do not retain all serialized shard strings/byte arrays.
export async function streamFastCurrent(snapshot,ownedItemIds,{emitShard,guard=()=>true,maxTotalBytes=LIMITS.totalBytes}={}){
 need(typeof emitShard==='function'&&typeof guard==='function'&&positive(maxTotalBytes,LIMITS.totalBytes),'stream_options');
 const fence=()=>need(guard()===true,'stream_paused');fence();
 need(snapshot&&typeof snapshot.getItem==='function'&&keys(snapshot.summary)==='itemCount,profileVersion,rawBodySha256,source','snapshot');
 immutable(snapshot.summary);
 const source=structuredClone(snapshot.summary.source);
 need(Array.isArray(ownedItemIds)&&positive(ownedItemIds.length,LIMITS.items)&&snapshot.summary.itemCount===ownedItemIds.length&&snapshot.summary.profileVersion===1&&snapshot.summary.rawBodySha256===source.rawBodySha256,'membership');
 const ids=[...ownedItemIds].sort((a,b)=>a-b);
 need(ids.every((id,i)=>positive(id,999999999)&&(!i||ids[i-1]<id)),'duplicate_or_invalid_id');
 // Reuse the exact accepted source validator through a CLOSED temporary manifest.
 // This descriptor is validation-only; it is never staged, returned or published.
 assertFastManifest({schemaVersion:1,kind:'private_fast_item_current_manifest',profileVersion:1,source,itemCount:ids.length,itemIds:ids,totalBytes:1,shards:[{index:0,sha256:'0'.repeat(64),bytes:1,count:ids.length,firstId:ids[0],lastId:ids.at(-1)}]});
 const dtos=ids.map(itemId=>{const row=snapshot.getItem(itemId);need(row?.itemId===itemId,'snapshot_membership');assertSafeItemDto(row);immutable(row);need(same(row.source,source),'mixed_source');return row;});
 const empty=JSON.stringify({schemaVersion:1,kind:'private_fast_item_current_shard',profileVersion:1,source,items:[]});
 const prefix=empty.slice(0,-2),suffix=']}',overhead=enc.encode(prefix+suffix).length;
 const descriptors=[];let rows=[],rowBytes=0,total=0,maxShardBytes=0;
 async function flush(){
  if(!rows.length)return;
  fence();let body=prefix+rows.map(v=>v.json).join(',')+suffix;
  let bytes=enc.encode(body);need(bytes.length<=LIMITS.shardBytes,'single_item_capacity_hold');
  need(total+bytes.length<=maxTotalBytes&&descriptors.length<LIMITS.shards,'projection_capacity_hold');
  const sha=await sha256(bytes);fence();
  const descriptor=Object.freeze({index:descriptors.length,sha256:sha,bytes:bytes.length,count:rows.length,firstId:rows[0].itemId,lastId:rows.at(-1).itemId});
  // Drop our encoded buffer BEFORE awaiting a storage callback. The callback gets
  // a single immutable text payload, no mutable or multi-shard byte collection.
  bytes=null;fence();await emitShard(Object.freeze({descriptor,body}));fence();
  descriptors.push(descriptor);total+=descriptor.bytes;maxShardBytes=Math.max(maxShardBytes,descriptor.bytes);
  body=null;rows=[];rowBytes=0;
 }
 for(let i=0;i<dtos.length;i++){
  fence();const json=JSON.stringify(dtos[i]),n=enc.encode(json).length;
  need(overhead+n<=LIMITS.shardBytes,'single_item_capacity_hold');
  if(overhead+rowBytes+rows.length+n>LIMITS.shardBytes)await flush();
  rows.push({itemId:ids[i],json});rowBytes+=n;
 }
 await flush();fence();
 const manifest={schemaVersion:1,kind:'private_fast_item_current_manifest',profileVersion:1,source,itemCount:ids.length,itemIds:ids,totalBytes:total,shards:descriptors};
 assertFastManifest(manifest);const manifestText=JSON.stringify(manifest);
 need(enc.encode(manifestText).length<=LIMITS.manifestBytes,'manifest_capacity_hold');
 const manifestSha256=await sha256(enc.encode(manifestText));fence();
 return Object.freeze({manifestText,manifestSha256,shardCount:descriptors.length,totalShardBytes:total,maxEmittedShardBytes:maxShardBytes,allShardOutputArrayRetained:false});
}
