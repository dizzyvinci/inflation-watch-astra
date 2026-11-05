"""Offline projections only: no collector, source requests or canonical writes."""
import copy
import gzip
import json
import math
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from market_catalog import MarketCatalog,build_index,resolve_item,source_summary


STAMP='2026-11-04T08:30:56+00:00'


def item(slug='iron-ore',name='Iron Ore',history=None,**extras):
    return {'s':slug,'n':name,'k':'Etc','p':110,'p25':100,'p75':120,'lo':80,'hi':1000,'sold':12,
            'ask':200,'asks':10,'sellers':3,'st':.5,'last':'2026-11-04T08:20:00Z',
            'h':history if history is not None else [['2026-11-01',90,4],['2026-11-03',100,5],['2026-11-04',111,1]],**extras}


class MarketCatalogTests(unittest.TestCase):
    def setUp(self):
        self.feed={'updatedAt':STAMP,'lowDataBelow':5,'items':[item(),item('thin-only','Thin only',[['2026-11-04',200,1]],ld=1),
                    item('empty','Empty',[],p=None),item('today','Today',[['2026-11-04',300,5]])]}

    def test_all_items_survive_qualification_and_index_has_no_histories_or_weights(self):
        before=copy.deepcopy(self.feed);index=build_index(self.feed)
        self.assertEqual(index['itemCount'],4);self.assertEqual([row['slug'] for row in index['rows']],['empty','iron-ore','thin-only','today'])
        self.assertEqual(index['coverage'],{'withQualifiedDailyPrice':2,'withoutQualifiedDailyPrice':2,'withPublisherSummaryMedian':3,'withRetainedDailyHistory':3})
        for row in index['rows']:
            self.assertNotIn('history',row);self.assertNotIn('h',row);self.assertNotIn('weight',row);self.assertNotIn('nx',row)
        self.assertEqual(self.feed,before)
        self.assertIn('not every game item',index['coverageNote']);self.assertIn('not independently verified',index['quantityNote'])
        self.assertEqual(index['sourceUpdatedAt'],STAMP);self.assertEqual(index['sourceScope'],'public_daily_developer_feed_collection')

    def test_carried_qualified_vs_thin_latest_and_summary_windows_are_separate(self):
        result=resolve_item(self.feed,'iron-ore')
        self.assertEqual(result['price'],100);self.assertEqual(result['priceDay'],'2026-11-03');self.assertEqual(result['quantity'],5)
        self.assertTrue(result['carried']);self.assertFalse(result['partial'])
        self.assertEqual(result['latestDaily']['median'],111);self.assertEqual(result['latestDaily']['recordedCount'],1)
        self.assertFalse(result['latestDaily']['qualified']);self.assertTrue(result['latestDaily']['partial'])
        self.assertEqual(result['publisherMedian'],110);self.assertEqual(result['sourceSummary']['medianSellerAsk'],200)
        self.assertEqual(result['sourceSummary']['window'],'unspecified_source_summary')
        self.assertEqual(result['sourceSummary']['reportedLastSaleAt'],'2026-11-04T08:20:00Z')
        self.assertIn('not_individual_trade_evidence',result['reportedLastSaleKind'])
        self.assertEqual(result['sourceReportedSales'],12);self.assertNotEqual(result['sourceReportedSales'],result['quantity'])
        thin=resolve_item(self.feed,'thin-only');self.assertIsNone(thin['currentQualified']);self.assertIsNone(thin['price'])
        self.assertEqual(thin['publisherMedian'],110);self.assertEqual(thin['historyDays'],1);self.assertTrue(thin['sourceLowData'])

    def test_all_history_points_zero_thin_qualified_and_source_day_partial(self):
        self.feed['items'][0]['h']=[['2026-10-30',1,0],['2026-10-31',2,1],['2026-11-01',3,4],['2026-11-02',4,5],['2026-11-04',5,10]]
        result=resolve_item(self.feed,'iron-ore');history=result['history']
        self.assertEqual([[p['day'],p['median'],p['recordedCount']] for p in history],self.feed['items'][0]['h'])
        self.assertEqual([p['quality'] for p in history],['zero_count','thin','thin','qualified','qualified'])
        self.assertEqual([p['qualified'] for p in history],[False,False,False,True,True])
        self.assertEqual([p['partial'] for p in history],[False,False,False,False,True]);self.assertTrue(result['partial']);self.assertFalse(result['carried'])
        self.assertEqual(result['historyDatePrecision'],'UTC_calendar_day');self.assertEqual(result['thinDays'],2);self.assertEqual(result['zeroCountDays'],1)
        self.assertEqual(resolve_item(self.feed,'empty')['history'],[])
        self.assertIsNone(resolve_item(self.feed,'empty')['latestDaily'])

    def test_exact_slug_no_name_case_id_alias_or_traversal(self):
        self.assertIsNone(resolve_item(self.feed,'missing'))
        for invalid in ['Iron Ore','IRON-ORE','../iron-ore','item/iron-ore','iron-ore?key=x',1,None,'iron--ore']:
            with self.assertRaises(ValueError):resolve_item(self.feed,invalid)
        self.assertIsNone(resolve_item(self.feed,'steel-ore'),'Names do not establish aliases')

    def test_identity_map_exact_names_only_and_all_ambiguous_ids_omitted(self):
        identity={'slug':'iron-ore','name':'Iron Ore','id':4011001,'planHash':'a'*64}
        result=resolve_item(self.feed,'iron-ore',[identity,identity]);self.assertEqual(result['canonicalId'],4011001)
        self.assertEqual(result['identityProvenance']['planHashes'],['a'*64])
        for wrong in [{**identity,'name':'iron ore'},{**identity,'slug':'thin-only'},{**identity,'id':True},{**identity,'planHash':'unknown'}]:
            result=resolve_item(self.feed,'iron-ore',[wrong]);self.assertIsNone(result['canonicalId']);self.assertEqual(result['price'],100)
        ambiguous=build_index(self.feed,[identity,{**identity,'id':4011002}]);self.assertEqual(ambiguous['identityCoverage']['ambiguousItems'],1)
        self.assertIsNone(next(row for row in ambiguous['rows'] if row['slug']=='iron-ore')['canonicalId'])
        reused={**identity,'slug':'today','name':'Today'};ambiguous=build_index(self.feed,[identity,reused])
        self.assertEqual(ambiguous['identityCoverage']['ambiguousItems'],2);self.assertTrue(all(row['canonicalId'] is None for row in ambiguous['rows']))
        self.assertEqual(ambiguous['itemCount'],4)

    def test_malformed_feed_rejected_without_silent_history_repair(self):
        variants=[{'updatedAt':'bad','items':[]},{'updatedAt':'2026-11-04','items':[]},{'updatedAt':STAMP,'items':None}]
        for change in [{'s':'../path'},{'n':''},{'h':None},{'h':[['2026-11-03',0,5]]},{'h':[['2026-11-03',math.inf,5]]},
                       {'h':[['2026-11-03',1,True]]},{'h':[['2026-11-03',1,-1]]},{'h':[['2026-11-03',1,1.5]]},
                       {'h':[['2026-11-05',1,5]]},{'h':[['2026-02-30',1,5]]},
                       {'h':[['2026-11-03',1,5],['2026-11-03',1,5]]},{'h':[['2026-11-04',1,5],['2026-11-03',1,5]]}]:
            variants.append({'updatedAt':STAMP,'items':[item(**change)]})
        variants.append({'updatedAt':STAMP,'items':[item(),item()]})
        for invalid in variants:
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):build_index(invalid)

    def test_unknown_fields_private_fields_never_exposed_and_result_is_detached(self):
        feed=copy.deepcopy(self.feed);feed['apiKey']='sensitive';feed['items'][0].update(player='sensitive',shop='sensitive',nx=1,stats={'ATT':99},tradeId='sensitive')
        catalog=MarketCatalog(feed);index=catalog.build_index();detail=catalog.resolve_item('iron-ore')
        self.assertNotIn('sensitive',json.dumps(index));self.assertNotIn('sensitive',json.dumps(detail))
        for key in ['nx','knownNxCost','stats','tradeId','weight','inBasket','builtAt','observedAt','capturedAt']:self.assertNotIn(key,detail)
        index['rows'][0]['name']='Changed';detail['history'][0]['median']=999;detail['sourceSummary']['medianSale']=999
        self.assertEqual(catalog.resolve_item('iron-ore')['history'][0]['median'],90)
        self.assertEqual(catalog.resolve_item('iron-ore')['sourceSummary']['medianSale'],110)
        feed['items'][0]['h'][0][1]=777;self.assertEqual(catalog.resolve_item('iron-ore')['history'][0]['median'],90)

    def test_hash_is_deterministic_semantic_source_hash_not_import_time(self):
        original=build_index(self.feed);reordered=copy.deepcopy(self.feed);reordered['items'].reverse()
        self.assertEqual(original,build_index(reordered));self.assertEqual(len(original['sourceProjectionHash']),64)
        changed=copy.deepcopy(self.feed);changed['items'][0]['h'][0][1]+=1
        self.assertNotEqual(original['sourceProjectionHash'],build_index(changed)['sourceProjectionHash'])
        self.assertEqual(original['sourceUpdatedAt'],build_index(changed)['sourceUpdatedAt'])
        self.assertEqual(resolve_item(self.feed,'iron-ore',expected_projection_hash=original['sourceProjectionHash'])['price'],100)
        with self.assertRaises(ValueError):resolve_item(changed,'iron-ore',expected_projection_hash=original['sourceProjectionHash'])
        identities=[{'slug':'iron-ore','name':'Iron Ore','id':1,'planHash':'a'*64}]
        new_identity=build_index(self.feed,identities)
        self.assertEqual(original['sourceProjectionHash'],new_identity['sourceProjectionHash'])
        self.assertNotEqual(original['catalogHash'],new_identity['catalogHash'])
        with self.assertRaises(ValueError):resolve_item(self.feed,'iron-ore',identities,expected_catalog_hash=original['catalogHash'])
        self.assertEqual(resolve_item(self.feed,'iron-ore',identities,expected_catalog_hash=new_identity['catalogHash'])['canonicalId'],1)
        clock=copy.deepcopy(self.feed);clock['updatedAt']='2026-11-05T00:30:00+02:00'
        self.assertEqual(build_index(clock)['sourceUtcDay'],'2026-11-04')

    def test_summary_sanitization_and_existing_engine_projection_contract(self):
        import engine
        summary=source_summary(self.feed['items'][0],STAMP);self.assertEqual(summary,engine.source_summary(self.feed['items'][0],STAMP))
        raw={'p':float('nan'),'p25':True,'p75':-1,'lo':0,'hi':float('inf'),'ask':{},'asks':1.5,'sellers':-1,'st':2,'last':'not-a-time'}
        result=source_summary(raw,STAMP)
        for key in ['medianSale','p25','p75','lowSale','highSale','medianSellerAsk','listings','sellers','sellThrough','reportedLastSaleAt']:self.assertIsNone(result[key])

    def test_portable_integer_fields_and_numeric_source_low_data_flag(self):
        feed={'updatedAt':STAMP,'items':[item(history=[['2026-11-03',1.0,5.0]],ld=True)]}
        ids=[{'slug':'iron-ore','name':'Iron Ore','id':1.0,'planHash':'a'*64}]
        detail=resolve_item(feed,'iron-ore',ids)
        self.assertEqual(detail['canonicalId'],1);self.assertIsInstance(detail['canonicalId'],int)
        self.assertEqual(detail['quantity'],5);self.assertIsInstance(detail['quantity'],int)
        self.assertFalse(detail['sourceLowData'])
        feed['items'][0]['ld']=1;self.assertTrue(resolve_item(feed,'iron-ore')['sourceLowData'])
        self.assertEqual(detail['hashMethod'],'mcat-typed-utf8-f64-v1')

    def test_offset_validation_and_fraction_precision_preserve_source_timestamp(self):
        stamp='2026-11-05T00:30:00.123456789+02:00'
        feed={'updatedAt':stamp,'items':[item()]}
        index=build_index(feed)
        self.assertEqual(index['sourceUpdatedAt'],stamp);self.assertEqual(index['sourceUtcDay'],'2026-11-04')
        self.assertIsNone(source_summary({'last':'2026-11-04T00:00:00+00:99'},stamp)['reportedLastSaleAt'])
        feed['updatedAt']='2026-11-04T00:00:00+00:99'
        with self.assertRaises(ValueError):build_index(feed)

    def test_current_accepted_feed_all_items_counts_histories_and_payload_sizes(self):
        root=Path(__file__).resolve().parents[1];feed=json.loads((root/'cache/market.json').read_text(encoding='utf-8'))
        seed=json.loads((root/'dist/data.json').read_text(encoding='utf-8'));identities=seed.get('cashCatalog',{}).get('identityMap',[])
        before=json.dumps(feed,sort_keys=True);catalog=MarketCatalog(feed,identities);index=catalog.build_index()
        self.assertEqual(index['itemCount'],len(feed['items']));self.assertEqual({r['slug'] for r in index['rows']},{r['s'] for r in feed['items']})
        import engine
        total_points=0
        for raw in feed['items']:
            detail=catalog.resolve_item(raw['s']);self.assertEqual(detail['sourceSummary'],engine.source_summary(raw,feed['updatedAt']))
            self.assertEqual([[p['day'],p['median'],p['recordedCount']] for p in detail['history']],raw['h'])
            self.assertEqual(detail['historyDays'],len(raw['h']));total_points+=len(raw['h'])
            expected=[p for p in raw['h'] if p[2]>=5]
            self.assertEqual(detail['price'],expected[-1][1] if expected else None)
            self.assertEqual(detail['priceDay'],expected[-1][0] if expected else None)
        encoded=json.dumps(index,ensure_ascii=False,separators=(',',':')).encode();compressed=gzip.compress(encoded,mtime=0)
        self.assertLess(len(encoded),600000);self.assertLess(len(compressed),100000)
        self.assertEqual(json.dumps(feed,sort_keys=True),before)
        print('Market catalog metrics:',json.dumps({'items':index['itemCount'],'dailyPoints':total_points,'indexBytes':len(encoded),'indexGzipBytes':len(compressed),'coverage':index['coverage'],'verifiedIds':index['identityCoverage']['matchedItems']}))


if __name__=='__main__':unittest.main()
