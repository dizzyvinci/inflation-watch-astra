// Synthetic actor-free RAM fixtures through the actual public normalizer and cache owner.
const {pathToFileURL}=require('node:url'),path=require('node:path'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'),load=n=>import(pathToFileURL(path.join(root,n)).href),E=new TextEncoder();
async function reference({id=1082000,name='Work Gloves',rows=[],aggregate=null,basis='sold',capturedAt='2026-11-08T11:59:00Z',generation='1'.repeat(64)}={}){
 const p=await load('ops/api-price-item-dto.mjs'),protocol=await load('ops/api-item-reference-protocol.mjs');
 const meta=E.encode(JSON.stringify([{id,name}])),identities=await p.createIdentityIndex([{raw:meta,expectedSha256:await p.sha256(meta),sourceUrl:'https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000',format:'noncash_list'}]);
 const raw=E.encode(JSON.stringify([{item_id:id,sold:null,seen:null,reference:aggregate?{unit_price:aggregate.price,basis:aggregate.basis??basis,samples:aggregate.samples??6,scope:'item'}:null,by_stats:rows.map(r=>({stats:r.stats,slots_left:r.slotsLeft,upgrades:r.upgrades,reference:{unit_price:r.price,basis:r.basis??basis,samples:r.samples??6,scope:'stats'}}))}]));
 const snapshot=await p.createPriceSnapshot(raw,{expectedSha256:await p.sha256(raw),context:{operation:'prices',sourceUrl:'https://maplestory.market/api/prices',capturedAt,sourceObservedAt:null,captureTimeKind:'http_response_completed'},identities});
 const dto=snapshot.getItem(id),dtoHash=await p.sha256(E.encode(JSON.stringify(dto)));return protocol.makePublicItemReference(dto,generation,dtoHash);
}
async function owner(f,records){const {createItemReferenceClient}=await load('ui-src/item-api/item-loader.mjs'),p=await load('ops/api-price-item-dto.mjs');let enabled=true,basicDenied=false;const calls=[];
 const client=createItemReferenceClient({enabled:true,isEnabled:()=>enabled,now:()=>f.clock[0],fetcher:async url=>{calls.push(url);const id=Number(/\/(\d+)\.json/.exec(url)[1]),v=records.find(r=>r.itemId===id);if(!v)throw Error('unknown synthetic ID');const raw=JSON.stringify(v),hash=await p.sha256(E.encode(raw));return new Response(raw,{status:200,headers:{'Content-Type':'application/json','ETag':'"api-item-'+hash+'"','X-Astra-API-Item-Mode':'validated_cache','X-Astra-API-Item-Captured-At':v.sourceCapturedAt,'X-Astra-API-Item-Generation':v.projectionGeneration}});}});
 for(const row of records)await client.loadItem({itemId:row.itemId});
 Object.defineProperty(f.w,'crypto',{value:webcrypto,configurable:true});f.w.AstraItemApiPreview=Object.freeze({peekCachedReferences:()=>client.peekCachedReferences(),peekCachedBasicReferences:()=>({status:basicDenied?'access_denied':'disabled',references:[]})});
 const wake=()=>f.d.dispatchEvent(new f.w.Event('astrapiitemcache'));
 return{client,calls,async replace(record){const i=records.findIndex(v=>v.itemId===record.itemId);if(i<0)throw Error('known synthetic ID required');records[i]=record;f.clock[0]+=30001;await client.loadItem({itemId:record.itemId});wake();},disable(){enabled=false;wake();},enable(){enabled=true;wake();},deny(){basicDenied=true;f.d.dispatchEvent(new f.w.Event('astrabasicitemcache'));},clearDeny(){basicDenied=false;wake();},clear(){client.clear();wake();}};
}
module.exports={reference,owner};
