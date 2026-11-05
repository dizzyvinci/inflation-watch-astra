// Local accepted feed + canonical pure projector. No network or WORK fixtures.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
module.exports=async()=>{
 const {createMarketCatalog}=await import(pathToFileURL(path.join(root,'ops/market-catalog.mjs')));
 const {portableHash,HASH_METHOD}=await import(pathToFileURL(path.join(root,'ops/portable-hash.mjs')));
 const feed=JSON.parse(read('cache/market.json')),snapshot=JSON.parse(read('dist/data.json')),identities=JSON.parse(read('catalog-identities-v2.json'));
 const identityVersion=await portableHash({hashMethod:HASH_METHOD,identityMap:identities});
 const makeCatalog=async input=>createMarketCatalog(input,identities),prepared=await makeCatalog(feed),index=prepared.buildIndex();
 const known=new Set([...snapshot.rows,...snapshot.cash,...(snapshot.contextItems||[]),...(snapshot.cashCatalog?.rows||[])].map(r=>r.slug));
 const qualified=index.rows.find(r=>!known.has(r.slug)&&r.price!==null),unqualified=index.rows.find(r=>r.price===null&&r.thinDays>0&&r.publisherMedian!==null);
 if(!qualified||!unqualified)throw Error('Accepted feed needs qualified and thin test examples');
 const binding=index=>({schemaVersion:1,hashMethod:index.hashMethod,catalogHash:index.catalogHash,sourceProjectionHash:index.sourceProjectionHash,sourceUpdatedAt:index.sourceUpdatedAt,identityVersion,itemCount:index.itemCount});
 return {root,read,feed,snapshot,identities,index,detail:prepared.resolveItem(qualified.slug,{expectedCatalogHash:index.catalogHash}),thin:prepared.resolveItem(unqualified.slug,{expectedCatalogHash:index.catalogHash}),manifest:{qualifiedSlug:qualified.slug,thinSlug:unqualified.slug},binding,makeCatalog};
};
