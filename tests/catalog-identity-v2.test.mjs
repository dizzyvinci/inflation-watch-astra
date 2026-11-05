import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCachedProjectionFactory,createMarketCatalog} from '../ops/market-catalog.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>JSON.parse(readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const feed=read('cache/market.json'),ids=read('catalog-identities-v2.json'),proof=read('catalogue-identity-provenance-v2.json');

test('adopted1381 identities produce full Python/Worker index and metadata parity without changing provider values',async()=>{
  const expected=JSON.parse(execFileSync(process.env.PYTHON||'python',['-B','-c',`
import json
from market_catalog import MarketCatalog
from portable_hash import HASH_METHOD,portable_hash
read=lambda name:json.load(open(name,encoding='utf-8'))
feed=read('cache/market.json');ids=read('catalog-identities-v2.json');catalog=MarketCatalog(feed,ids)
meta={'schemaVersion':1,'hashMethod':HASH_METHOD,'catalogHash':catalog.catalog_hash,'sourceProjectionHash':catalog.source_projection_hash,'sourceUpdatedAt':catalog.source_updated_at,'itemCount':len(feed['items']),'identityVersion':portable_hash({'hashMethod':HASH_METHOD,'identityMap':ids})}
print(json.dumps({'index':catalog.build_index(),'metadata':meta},ensure_ascii=True,allow_nan=False))
`],{cwd:root,encoding:'utf8',maxBuffer:2_000_000}));
  const factory=createCachedProjectionFactory(ids),actual=await factory(feed),metadata=await factory.metadata(feed);
  assert.deepEqual(actual.index,expected.index);assert.deepEqual(metadata,expected.metadata);
  assert.equal(actual.index.identityCoverage.matchedItems,1381);
  assert.equal(metadata.sourceProjectionHash,proof.sourceProjectionHashAtAdoption);
  assert.equal(metadata.catalogHash,proof.catalogHashAtAdoption);assert.equal(metadata.identityVersion,proof.identityVersion);
  const prior=(await createMarketCatalog(feed,read('catalog-identities-v1.json'))).buildIndex();
  for(let i=0;i<prior.rows.length;i++){
    const {canonicalId:oldId,...old}=prior.rows[i],{canonicalId:newId,...row}=actual.index.rows[i];
    assert.deepEqual(row,old);if(oldId!==null)assert.equal(newId,oldId);
  }
  const unresolved=new Set(proof.unknownNames.map(row=>row.slug));
  for(const row of actual.index.rows)if(unresolved.has(row.slug))assert.equal(row.canonicalId,null);
});
