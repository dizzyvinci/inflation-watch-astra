// TEST ONLY: converts synthetic1535 identity fixtures into synthetic paged responses.
// Production entry never imports this module or the flat retained fixture.
import {createHash} from 'node:crypto';
import {syntheticTransport} from './item-api-fixture.mjs';
const sha=text=>createHash('sha256').update(text).digest('hex');
export function pagedFixture(legacy,{mutate=()=>{}}={}) {
  const rows=legacy.rows.map(r=>({itemId:r.itemId,name:r.nameStatus==='unique_client_id'?r.name:null,nameStatus:r.nameStatus,sprite:r.sprite,spriteStatus:r.spriteStatus,providerBindings:r.providerBindings,memberships:r.memberships.map(m=>({operation:m.operation,presentInSnapshot:true,lastSeenRetrievedAt:m.capturedAt,latestSnapshotRetrievedAt:m.capturedAt,sourceObservedAt:null})),priceMembership:r.hasRetainedPriceSnapshot?'in_committed_price_snapshot':'no_accepted_price_membership'}));
  const sources=legacy.sourceSnapshots.map(s=>({operation:s.operation,sourceUrl:s.sourceUrl,retrievedAt:s.capturedAt,sourceObservedAt:null,sourceGeneratedAt:null,sourceGeneratedAtKind:null,itemCount:0}));
  mutate(rows,sources);rows.sort((a,b)=>a.itemId-b.itemId);
  for(const source of sources)source.itemCount=rows.filter(r=>r.memberships.some(m=>m.operation===source.operation&&m.presentInSnapshot)).length;
  const objects=new Map(),pages=[];
  for(let offset=0;offset<rows.length;offset+=128){const batch=rows.slice(offset,offset+128),text=JSON.stringify({schemaVersion:1,kind:'api_item_identity_page',rows:batch}),hash=sha(text);pages.push({page:pages.length,firstItemId:batch[0].itemId,lastItemId:batch.at(-1).itemId,itemCount:batch.length,sha256:hash,bytes:Buffer.byteLength(text),url:'/api-item-identities/'+hash+'.json'});objects.set('/api-item-identities/'+hash+'.json',text);}
  const manifest={schemaVersion:1,kind:'api_item_identity_manifest',scope:'accepted_api_identity_union_with_retained_api_memberships',sourceCreditUrl:'https://maplestory.market/?ref=v6kkdvp6',priceProjectionGeneration:'b'.repeat(64),identityMetadata:legacy.identityMetadata,spriteBindingsSha256:'c'.repeat(64),providerBindingsSha256:'d'.repeat(64),sources,itemCount:rows.length,pages};manifest.indexHash=sha(JSON.stringify(manifest));objects.set('/api-item-identities.json',JSON.stringify(manifest));return{manifest,rows,objects};
}
export async function transport() {
  const base=await syntheticTransport(),calls=[];let current=pagedFixture(base.discovery),callback=null;
  return {...base,calls,get paged(){return current;},publish(options){current=pagedFixture(base.discovery,options);},hook(fn){callback=fn;base.hook(fn);},
    async fetch(input,options={}) {const url=new URL(typeof input==='string'?input:input.url,'http://127.0.0.1:8779');if(url.origin!=='http://127.0.0.1:8779')throw Error('External forbidden');calls.push(url.pathname+url.search);
      if(url.pathname==='/api-item-identities.json'||url.pathname.startsWith('/api-item-identities/')){const override=await callback?.(url,options);if(override instanceof Response)return override;
        if(url.pathname!=='/api-item-identities.json'&&url.searchParams.get('generation')!==current.manifest.indexHash)return new Response('{"error":"generation_changed"}',{status:409});const text=current.objects.get(url.pathname);if(!text)return new Response('{}',{status:404});const etag='"api-identities-'+sha(text)+'"',headers={'Content-Type':'application/json','ETag':etag,'X-Astra-API-Identity-Mode':'validated_cache','X-Astra-API-Identity-Generation':current.manifest.indexHash};return new Response(new Headers(options.headers).get('If-None-Match')===etag?null:text,{status:new Headers(options.headers).get('If-None-Match')===etag?304:200,headers});}
      return base.fetch(input,options);
    }
  };
}
