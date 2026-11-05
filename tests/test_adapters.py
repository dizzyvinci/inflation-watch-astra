import copy
import datetime as dt
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import adapters
import engine


class PublicAdapterTests(unittest.TestCase):
    def prices(self):
        return {'sourceUrl':'https://mesos.watch/','capturedAt':engine.now(),'items':[{'item':'A','id':1,'typical_sale_price':100000,'sales_counted':5000,'window_days':2,'price_basis':'median of sales','stat_roll':None},{'item':'B','id':2,'typical_sale_price':50000,'sales_counted':5000,'window_days':30,'price_basis':'median of sales','stat_roll':None},{'item':'C','id':3,'typical_sale_price':50000,'sales_counted':5000,'window_days':30,'price_basis':'median of sales','stat_roll':None}]}
    def table(self):
        return {'sourceUrl':'https://maplestory.market/ads?tab=services','capturedAt':engine.now(),'year':2026,'utcOffsetMinutes':-360,'rows':[['Nov 4, 07:00 PM','1:20 (20–20) · 2','1:15 (13–15) · 3']]}
    def test_nested_webmcp_envelope(self):
        raw={'item':'Iron Ore','typical_sale_price':315}
        envelope=json.dumps({'content':[{'type':'text','text':json.dumps(raw)}]})
        self.assertEqual(adapters.unpack_tool_result(envelope),raw)
    def test_windows_preserved_and_rate_normalized(self):
        result=adapters.normalize_prices(self.prices())
        self.assertEqual([r['windowDays'] for r in result['items']],[2,30,30])
        self.assertEqual(result['items'][0]['salesPerHourProxy'],5000/48)
        self.assertFalse(result['observationTimestampKnown'])
        self.assertNotIn('observedAt',result)
    def test_asking_prices_excluded(self):
        payload=self.prices();payload['items'][0]['price_basis']='median asking price'
        self.assertEqual(len(adapters.normalize_prices(payload)['items']),2)
    def test_unknown_source_rejected(self):
        payload=self.prices();payload['sourceUrl']='https://example.com/'
        with self.assertRaises(ValueError):adapters.normalize_prices(payload)
    def test_duplicate_item_rejected(self):
        payload=self.prices();payload['items'].append(payload['items'][0])
        with self.assertRaises(ValueError):adapters.normalize_prices(payload)
    def test_bad_window_rejected(self):
        payload=self.prices();payload['items'][0]['window_days']=999
        with self.assertRaises(ValueError):adapters.normalize_prices(payload)
    def test_capture_future_rejected(self):
        with self.assertRaises(ValueError):adapters.check_stamp('2099-01-01T00:00:00Z')
    def test_rolling_history_deduplicates_unchanged_prices(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);payload=adapters.normalize_prices(self.prices());engine.atomic(root/'cache/public-browser-prices.json',payload)
            rows=[{'name':'A','category':'Consumables','weight':1,'basePrice':50000}];cash=[{'name':name,'nx':5000} for name in ['A','B','C']]
            a,h1=adapters.rolling_reference(rows,cash,root)
            b,h2=adapters.rolling_reference(rows,cash,root)
            self.assertEqual(len(h1),1);self.assertEqual(len(h2),1)
            self.assertAlmostEqual(a['nxRateReference'],(20/2+10/30+10/30)/(1/2+1/30+1/30))
            self.assertEqual(a['cpiReference'],200)
    def test_hourly_table_converts_explicit_timezone(self):
        points=adapters.normalize_smega_table(self.table())
        self.assertEqual(points[0]['at'],'2026-11-05T01:00:00+00:00')
        self.assertEqual({p['side'] for p in points},{'buy','sell'})
        sell=next(p for p in points if p['side']=='sell')
        self.assertEqual((sell['rate'],sell['p25'],sell['p75'],sell['sampleCount']),(20,20,20,2))
    def test_smega_bad_quantiles_rejected(self):
        payload=self.table();payload['rows'][0][1]='1:20 (21–22) · 2'
        with self.assertRaises(ValueError):adapters.normalize_smega_table(payload)
    def test_duplicate_dst_hour_rejected(self):
        payload=self.table();payload['rows'].append(payload['rows'][0])
        with self.assertRaises(ValueError):adapters.normalize_smega_table(payload)
    def test_explicit_per_row_offsets_distinguish_dst_hours(self):
        payload=self.table();payload['rows']=[['Nov 1, 01:00 AM','1:20 (20–20) · 2','—']]*2
        payload['rowUtcOffsetMinutes']=[-360,-300]
        points=adapters.normalize_smega_table(payload)
        self.assertEqual([p['at'] for p in points],['2026-11-01T06:00:00+00:00','2026-11-01T07:00:00+00:00'])
        self.assertTrue(all(p['capturedAt']==payload['capturedAt'] for p in points))
        del payload['utcOffsetMinutes']
        self.assertEqual(adapters.normalize_smega_table(payload),points)
    def test_invalid_per_row_offset_contract_rejected(self):
        for offsets in [[],[-360,-300],None,'-360',[-841],[841],[-360.0],[True],['-360'],[None]]:
            with self.subTest(offsets=offsets):
                payload=self.table();payload['rowUtcOffsetMinutes']=offsets
                with self.assertRaises(ValueError):adapters.normalize_smega_table(payload)
        for offset in [-840,840]:
            payload=self.table();payload['rowUtcOffsetMinutes']=[offset]
            self.assertEqual(len(adapters.normalize_smega_table(payload)),2)
    def test_ambiguous_singleton_requires_per_row_declaration(self):
        payload=self.table();payload['displayTimeZone']='America/Chicago';payload['rows'][0][0]='Nov 1, 01:00 AM'
        with self.assertRaisesRegex(ValueError,'per-row'):adapters.normalize_smega_table(payload)

if __name__=='__main__':unittest.main()
