"""Offline v2 adoption/provenance guards; no private archives or network needed."""
import hashlib
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from market_catalog import MarketCatalog
from portable_hash import HASH_METHOD,portable_hash

ROOT=Path(__file__).resolve().parents[1]
READ=lambda name:json.loads((ROOT/name).read_text(encoding='utf-8'))


class IdentityAdoptionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old=READ('catalog-identities-v1.json');cls.current=READ('catalog-identities-v2.json')
        cls.proof=READ('catalogue-identity-provenance-v2.json');cls.feed=READ('cache/market.json')

    def test_immutable_prior_exact_entries_unique_ids_and_exact_provider_names(self):
        self.assertEqual(hashlib.sha256((ROOT/'catalog-identities-v1.json').read_bytes()).hexdigest(),'c7b56e5744ec4e94514a17caf68f1a136e7c2148186a6b5d1048b46da2a5b2bd')
        self.assertEqual(len(self.old),79);self.assertEqual(len(self.current),1381)
        self.assertEqual(len({r['id'] for r in self.current}),1381);self.assertEqual(len({r['slug'] for r in self.current}),1381)
        self.assertEqual(self.current,sorted(self.current,key=lambda row:row['slug']))
        by_slug={row['slug']:row for row in self.current};names={row['s']:row['n'] for row in self.feed['items']}
        for row in self.old:self.assertEqual(by_slug[row['slug']],row)
        for row in self.current:
            self.assertEqual(set(row),{'slug','name','id','planHash'});self.assertEqual(row['name'],names[row['slug']])
            self.assertIs(type(row['id']),int);self.assertGreater(row['id'],0)
        prior={row['slug'] for row in self.old};new=[row for row in self.current if row['slug'] not in prior]
        self.assertEqual(len(new),1302);self.assertTrue(all(row['planHash']==self.proof['reviewPlanHash'] for row in new))

    def test_public_provenance_pins_both_archives_receipt_clocks_and_no_private_paths(self):
        proof=self.proof
        self.assertEqual(proof['identityMapVersion'],2);self.assertEqual(proof['region'],'MCW');self.assertEqual(proof['clientVersion'],'1')
        self.assertEqual(proof['identityFileSha256'],hashlib.sha256((ROOT/proof['identityFile']).read_bytes()).hexdigest())
        self.assertEqual(proof['priorIdentityFileSha256'],hashlib.sha256((ROOT/proof['priorIdentityFile']).read_bytes()).hexdigest())
        self.assertEqual([row['cashFilter'] for row in proof['archives']],[True,False])
        self.assertEqual([row['recordCount'] for row in proof['archives']],[4706,2655])
        self.assertEqual([row['sha256'] for row in proof['archives']],['60bf86bcd6dec8b7644c6366c4c8b1032c43325854fda3151a074d469e1973c9','60166ef0713a547a73b81473fbfa43d5d63f5182c978f5194b16411cd5e88a92'])
        for row in proof['archives']:
            self.assertEqual(row['sourceUrl'],'https://maplestory.io/api/MCW/1/item/list?cashFilter='+str(row['cashFilter']).lower()+'&count=10000')
            self.assertEqual(row['timestampKind'],'http_response_completed_at');self.assertIsNone(row['sourceObservedAt'])
        for private in ['C:/','C:\\','work/','work\\','Authorization','cookie','apiKey']:
            self.assertNotIn(private,json.dumps(proof))

    def test_ambiguity_and_unknown_inventory_preserved_with_one_independent_exception(self):
        proof=self.proof;by_slug={row['slug']:row for row in self.current}
        self.assertEqual(len(proof['ambiguousNames']),31);self.assertEqual(len(proof['unknownNames']),13)
        exceptions=proof['independentlyRetainedExceptions'];self.assertEqual(len(exceptions),1)
        retained=exceptions[0];self.assertEqual((retained['slug'],retained['name'],retained['id']),('dark-shadow-pants','Dark Shadow Pants',1060059))
        self.assertFalse(retained['qualityConstant']);self.assertIsNone(retained['sourceObservedAt'])
        for row in proof['ambiguousNames']:
            self.assertGreater(len(row['candidateIds']),1)
            if row['slug']==retained['slug']:self.assertEqual(by_slug[row['slug']]['id'],retained['id'])
            else:self.assertNotIn(row['slug'],by_slug)
        for row in proof['unknownNames']:self.assertNotIn(row['slug'],by_slug)
        self.assertEqual(proof['counts']['remainingUnmappedAtAdoption'],43)
        self.assertEqual(proof['counts']['bulkUniqueMatches']+len(exceptions),len(self.current))

    def test_identity_hash_advances_but_all_provider_prices_counts_dates_and_summaries_stay_exact(self):
        prior=MarketCatalog(self.feed,self.old);current=MarketCatalog(self.feed,self.current)
        self.assertEqual(prior.source_projection_hash,current.source_projection_hash)
        self.assertEqual(current.source_projection_hash,self.proof['sourceProjectionHashAtAdoption'])
        self.assertEqual(current.catalog_hash,'061bd38cfed551beecd1ec54296a96bd16ef9caac51de9c8ec7878668d799795')
        self.assertEqual(current.catalog_hash,self.proof['catalogHashAtAdoption'])
        self.assertEqual(portable_hash({'hashMethod':HASH_METHOD,'identityMap':self.current}),self.proof['identityVersion'])
        self.assertEqual(self.proof['identityVersion'],'5eff8ada04b4ffce1af4ba4cf1245c65fe59ce574ce515f42ebfb777aba8827a')
        self.assertNotEqual(prior.catalog_hash,current.catalog_hash)
        for old,new in zip(prior.build_index()['rows'],current.build_index()['rows']):
            self.assertEqual({k:v for k,v in old.items() if k!='canonicalId'},{k:v for k,v in new.items() if k!='canonicalId'})
            before=prior.resolve_item(old['slug']);after=current.resolve_item(old['slug'])
            excluded={'canonicalId','identityProvenance','catalogHash'}
            self.assertEqual({k:v for k,v in before.items() if k not in excluded},{k:v for k,v in after.items() if k not in excluded})
        self.assertEqual(current.build_index()['identityCoverage'],{'matchedItems':1381,'ambiguousItems':0,'ignoredEntries':0})


if __name__=='__main__':unittest.main()
