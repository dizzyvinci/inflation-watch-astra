import copy
import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from historical_market_fixture import historical_market
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import engine
import smega

class MarketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_root=engine.ROOT
        cls.feed=engine.read(engine.ROOT/'cache'/'market.json')
        cls.cfg=engine.read(engine.ROOT/'config.json')
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        engine.atomic(self.root/'config.json',self.cfg)
        self.patcher=patch.object(engine,'ROOT',self.root);self.patcher.start()
    def tearDown(self):
        self.patcher.stop();self.temp.cleanup()
    def compute(self):return engine.compute(copy.deepcopy(self.feed),{'status':'ok','checkedAt':engine.now()})
    def test_cap_is_iterative_and_normalized(self):
        weights=engine.capped_weights([100000,50000,10000]+[100]*47)
        self.assertAlmostEqual(sum(weights),1,places=12)
        self.assertLessEqual(max(weights),.08000000001)
        self.assertEqual(weights[:3],[.08,.08,.08])
    def test_cap_rejects_infeasible_basket(self):
        with self.assertRaises(ValueError):engine.capped_weights([1]*5,.08)
    def test_real_feed_50_items_29_cash(self):
        report=self.compute();self.assertEqual(len(report['rows']),50);self.assertEqual(len(report['cash']),29)
        self.assertAlmostEqual(sum(r['weight'] for r in report['rows']),1)
        self.assertGreater(report['salesSinceLaunch'],1_500_000)
    def test_cpi_recomputes_from_weighted_price_relatives(self):
        report=self.compute();expected=100*sum(r['weight']*r['price']/r['basePrice'] for r in report['rows'])
        self.assertAlmostEqual(expected,report['latest']['cpi'])
    def test_weights_use_price_times_volume(self):
        report=self.compute()
        uncapped=[r for r in report['rows'] if r['weight']<.079999]
        a,b=uncapped[:2]
        self.assertAlmostEqual(a['weight']/b['weight'],a['baseExpenditure']/b['baseExpenditure'])
    def test_basket_membership_does_not_drift(self):
        before=engine.create_basket(self.feed,self.cfg)
        altered=copy.deepcopy(self.feed)
        for i in altered['items']:
            if len(i['h'])>1:i['h'][-2][2]*=100
        self.assertEqual(before,engine.create_basket(altered,self.cfg))
    def test_nx_conversion_uses_per_nx_units(self):
        rate=engine.nx_rate([(82500,5000,10),(70000,7000,10)])
        self.assertEqual(rate,13.25);self.assertEqual(rate*1000,13250)
        self.assertEqual(f'{16497/1000:.1f}','16.5')
    def test_zero_and_nan_not_valid(self):
        self.assertIsNone(engine.nx_rate([(0,5000,10),(10,0,10),(10,5,0)]))
        self.assertFalse(engine.positive(float('nan')))
    def test_latest_day_is_partial(self):
        report=self.compute();self.assertTrue(report['history'][-1]['partial']);self.assertFalse(report['history'][-2]['partial'])
    def test_poll_does_not_create_intraday_ticks(self):
        a=self.compute();b=self.compute();self.assertEqual(a['intraday'],[]);self.assertEqual(b['intraday'],[])
    def test_volume_aggregation_counts_cash_and_small_sales_without_imputing(self):
        feed={'updatedAt':'2026-11-04T08:30:00Z','items':[
            {'s':'basket','h':[['2026-11-03',10,2],['2026-11-04',20,1]]},
            {'s':'cash','h':[['2026-11-03',100,3]]}]}
        points=engine.volume_history(feed,{'basket'})
        self.assertEqual([(p['allMesos'],p['basketMesos']) for p in points],[(320,20),(20,20)])
        self.assertEqual([(p['allSoldVolume'],p['basketSoldVolume']) for p in points],[(5,2),(1,1)])
        self.assertEqual(points[1]['allItemsObserved'],1)
        self.assertFalse(points[0]['partial']);self.assertTrue(points[1]['partial'])
    def test_volume_totals_reconcile_with_seven_day_market_stats(self):
        report=self.compute()
        points=[p for p in report['volumeHistory'] if report['recentStart']<=p['day']<report['recentEndExclusive']]
        self.assertEqual(sum(p['allSoldVolume'] for p in points),report['allRecentQuantity'])
        self.assertEqual(sum(p['basketSoldVolume'] for p in points),report['basketRecentQuantity'])
        self.assertAlmostEqual(sum(p['basketMesos'] for p in points),sum(r['recentTurnoverProxy'] for r in report['rows']))
        self.assertTrue(all(p['allMesos']>=p['basketMesos'] for p in points))
    def test_recent_volume_rolls_while_basket_and_nx_base_stay_frozen(self):
        self.feed = historical_market()
        before=self.compute()
        feed=copy.deepcopy(self.feed);feed['updatedAt']='2026-11-05T00:01:00Z'
        for item in feed['items']:
            item['h'].append(['2026-11-05',item['h'][-1][1],5])
        after=engine.compute(feed,{'status':'ok','checkedAt':engine.now()})
        self.assertEqual(after['selectionStart'],before['selectionStart'])
        self.assertEqual(after['recentStart'],'2026-10-29')
        self.assertEqual(after['baseNxRate'],before['baseNxRate'])
        expected=sum(q for item in feed['items'] for day,p,q in item['h'] if '2026-10-29'<=day<'2026-11-05')
        self.assertEqual(after['allRecentQuantity'],expected)
    def test_nx_base_survives_source_history_retention(self):
        before=self.compute();feed=copy.deepcopy(self.feed)
        for item in feed['items']:
            item['h']=[point for point in item['h'] if point[0]>'2026-10-27']
        after=engine.compute(feed,{'status':'ok'})
        self.assertEqual(after['baseNxRate'],before['baseNxRate'])
    def test_failed_fetch_keeps_source_timestamp(self):
        engine.atomic(self.root/'cache'/'market.json',self.feed)
        with patch('urllib.request.urlopen',side_effect=TimeoutError('test timeout')):
            feed,status=engine.fetch_feed()
        self.assertEqual(feed['updatedAt'],self.feed['updatedAt']);self.assertEqual(status['status'],'degraded')
    def test_no_cache_and_failed_source_refuses_build(self):
        with patch('urllib.request.urlopen',side_effect=TimeoutError('test timeout')):
            with self.assertRaises(RuntimeError):engine.fetch_feed()
    def test_malformed_data_rejected(self):
        bad=copy.deepcopy(self.feed);bad['items'][0]['h'][0][1]=-1
        with self.assertRaises(ValueError):engine.validate_feed(bad)
    def test_future_source_rejected(self):
        bad=copy.deepcopy(self.feed);bad['updatedAt']='2099-01-01T00:00:00Z'
        with self.assertRaises(ValueError):engine.validate_feed(bad)
    def test_duplicate_items_rejected(self):
        bad=copy.deepcopy(self.feed);bad['items'][1]['s']=bad['items'][0]['s']
        with self.assertRaises(ValueError):engine.validate_feed(bad)
    def test_missing_basket_member_refuses_silent_rebase(self):
        self.compute();member=engine.read(self.root/'cache'/('basket-v'+str(self.cfg.get('basket_version',1))+'.json'))['rows'][0]['slug']
        bad=copy.deepcopy(self.feed);bad['items']=[i for i in bad['items'] if i['s']!=member]
        with self.assertRaises(ValueError):engine.compute(bad,{'status':'ok'})
    def test_overlap_lock_is_respected(self):
        (self.root/'.collector.lock').write_text('other')
        with self.assertRaises(RuntimeError):engine.build(True)
        self.assertTrue((self.root/'.collector.lock').exists())
    def test_stale_live_not_a_headline(self):
        report=self.compute();basket=engine.read(self.root/'cache'/('basket-v'+str(self.cfg.get('basket_version',1))+'.json'))
        engine.atomic(self.root/'incoming'/'observations.json',{'observedAt':(dt.datetime.now(engine.UTC)-dt.timedelta(hours=2)).isoformat(),'sourceUrl':'https://example.com/scanner','kind':'scanner_sales','items':[]})
        live,note=engine.load_live(self.cfg,basket,{i['s']:i for i in self.feed['items']},report['cash'])
        self.assertIsNone(live);self.assertIn('40 minutes',note)
    def test_low_coverage_live_cannot_replace_cpi_or_nx(self):
        report=self.compute();basket=engine.read(self.root/'cache'/('basket-v'+str(self.cfg.get('basket_version',1))+'.json'))
        engine.atomic(self.root/'incoming'/'observations.json',{'observedAt':engine.now(),'sourceUrl':'https://example.com/scanner','kind':'scanner_sales','items':[{'slug':report['rows'][0]['slug'],'price':99999,'quantity':10,'evidence':'sold'}]})
        live,_=engine.load_live(self.cfg,basket,{i['s']:i for i in self.feed['items']},report['cash'])
        self.assertIsNone(live['cpi']);self.assertIsNone(live['nxRate'])
    def test_full_live_accepted_and_deduplicated(self):
        report=self.compute()
        obs={'observedAt':engine.now(),'sourceUrl':'https://example.com/scanner','kind':'scanner_sales','items':[{'slug':r['slug'],'price':r['price'],'quantity':max(r['quantity'],1),'evidence':'sold'} for r in report['rows']+report['cash']]}
        engine.atomic(self.root/'incoming'/'observations.json',obs)
        a=self.compute();b=self.compute()
        self.assertIsNotNone(a['live']['cpi']);self.assertIsNotNone(a['live']['nxRate']);self.assertEqual(len(b['intraday']),1)
    def test_asks_cannot_enter_live_sale_input(self):
        report=self.compute();basket=engine.read(self.root/'cache'/('basket-v'+str(self.cfg.get('basket_version',1))+'.json'))
        engine.atomic(self.root/'incoming'/'observations.json',{'observedAt':engine.now(),'sourceUrl':'https://example.com/scanner','kind':'player_report','items':[]})
        with self.assertRaises(ValueError):engine.load_live(self.cfg,basket,{},report['cash'])

class SmegaTests(unittest.TestCase):
    def test_explicit_units(self):
        self.assertEqual(smega.parse_rate('S> 1k NX for 16.5k mesos'),16.5)
        self.assertEqual(smega.parse_rate('B> 16500 mesos = 1000 NX'),16.5)
    def test_ambiguous_or_zero_rejected(self):
        self.assertIsNone(smega.parse_rate('NX 1:16.5'))
        self.assertIsNone(smega.parse_rate('0 NX for 1000 mesos'))
    def test_smega_spam_deduplicated(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);messages=[{'at':'2026-11-04T00:10:00Z','senderId':'same','text':'1k NX for 16.5k mesos','sourceUrl':'https://example.com/smega'}]*10
            engine.atomic(root/'input.json',messages)
            with patch.object(smega,'ROOT',root):self.assertEqual(smega.ingest(root/'input.json'),[])
    def test_offer_side_requires_unambiguous_evidence(self):
        self.assertIsNone(smega.offer_side('1k NX for 20k mesos'))
        self.assertIsNone(smega.offer_side('S> NX; B> scrolls'))
        self.assertIsNone(smega.offer_side('WTB NX', 'sell'))
        self.assertEqual(smega.offer_side('WTS 1k NX for 20k mesos'), 'sell')
        self.assertEqual(smega.offer_side('Buying 1k NX for 13k mesos'), 'buy')
    def test_buyer_and_seller_medians_stay_separate(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            messages=[{'at':'2026-11-04T00:10:00Z','senderId':str(i),'text':f'{side}> 1k NX for {rate}k mesos','sourceUrl':'https://example.com/smega'} for side,rate in [('S',20),('B',13)] for i in range(3)]
            engine.atomic(root/'input.json',messages)
            with patch.object(smega,'ROOT',root):points=smega.ingest(root/'input.json')
            self.assertEqual({p['side']:p['rate'] for p in points},{'sell':20,'buy':13})
            self.assertEqual({p['kind'] for p in points},{'smega_ask','smega_bid'})


class SmegaNumericTokenTests(unittest.TestCase):
    """Business-unit equations, not expectations generated by the parser regex."""
    def test_complete_decimal_and_grouped_tokens_match_independent_fraction_equations(self):
        from fractions import Fraction as Q
        cases = [
            ('S> .5k NX for 10k mesos', Q(500), Q(10000)),
            ('S> 0.5k NX for 10k mesos', Q(500), Q(10000)),
            ('S> 1,500 NX for 16,500 mesos', Q(1500), Q(16500)),
            ('B> 16,500 mesos for 1,500 NX', Q(1500), Q(16500)),
            ('WTS 1,500.5 NX for 16,505.5 mesos', Q(3001,2), Q(33011,2)),
            ('S> .5m NX for 1m mesos', Q(500000), Q(1000000)),
            ('S> 250NX:5kmesos', Q(250), Q(5000)),
            ('S> 1,000,000 NX for 20,000,000 mesos', Q(1000000), Q(20000000)),
            ('S> .5 NX for .25 mesos', Q(1,2), Q(1,4)),
            ('S> (1,500 NX for 16,500 mesos), contact separately', Q(1500), Q(16500)),
            ('B> [16,500mesos/1,500NX]', Q(1500), Q(16500)),
        ]
        for text, nx, mesos in cases:
            with self.subTest(text=text):
                self.assertEqual(smega.parse_rate(text), float(mesos/nx))
    def test_unsupported_signed_scientific_malformed_or_fractional_tokens_are_not_sliced(self):
        tokens = ['-1k', '+1k', '\u22121k', '- .5k', '1e3', '1E+3', '1.2.5k',
                  '1,50', '1,5000', '1,,500', '1,500,', '1.2,500', '.5.5k',
                  '1/2k', '1 / 2k', '$1k', '$ 1k']
        for token in tokens:
            for text in ('S> '+token+' NX for 10k mesos', 'B> '+token+' mesos for 1k NX'):
                with self.subTest(text=text):self.assertIsNone(smega.parse_rate(text))
    def test_old_explicit_units_zero_and_rate_caps_are_preserved(self):
        self.assertEqual(smega.parse_rate('S> 1k NX for 16.5k mesos'),16.5)
        self.assertEqual(smega.parse_rate('B> 16500 mesos = 1000 NX'),16.5)
        self.assertIsNone(smega.parse_rate('NX 1:16.5'))
        self.assertIsNone(smega.parse_rate('0 NX for 1000 mesos'))
        self.assertEqual(smega.parse_rate('S> 1NX for .01mesos'),.01)
        self.assertIsNone(smega.parse_rate('S> 1NX for .009mesos'))
        self.assertEqual(smega.parse_rate('S> 1NX for 10,000mesos'),10000)
        self.assertIsNone(smega.parse_rate('S> 1NX for 10,001mesos'))
    def test_whole_unit_words_and_numeric_context_are_not_discarded(self):
        for text in ['S> - 1k NX for 20k mesos','B> USD$ 16,500 mesos for 1k NX',
                     'S> abc.5k NX for 10k mesos','S> 1k NX for 20k mesoscam',
                     'B> 16,500 mesos for 1k NXbonus']:
            with self.subTest(text=text):self.assertIsNone(smega.parse_rate(text))
        self.assertEqual(smega.parse_rate('S> [1kNX/20kmesos].'),20)
    def test_real_ingest_keeps_correct_quote_median_and_actor_free_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            messages=[{'at':'2026-11-04T00:10:00Z','senderId':'fixture-speaker-'+str(i),
                       'text':('S> 1k NX for 20k mesos' if i<3 else 'S> .5k NX for 10k mesos'),
                       'sourceUrl':'https://example.invalid/smega'}for i in range(6)]
            engine.atomic(root/'input.json',messages)
            with patch.object(smega,'ROOT',root):points=smega.ingest(root/'input.json')
            self.assertEqual(len(points),1);point=points[0]
            self.assertEqual(point['rate'],20);self.assertEqual(point['distinctSenders'],6)
            self.assertEqual(point['side'],'sell');self.assertEqual(point['kind'],'smega_ask')
            self.assertEqual(point['at'],'2026-11-04T00:00:00+00:00')
            self.assertNotIn('fixture-speaker',json.dumps(points));self.assertNotIn('text',point)
    def test_invalid_numeric_tokens_cannot_create_a_published_quote_point(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            messages=[{'at':'2026-11-04T00:10:00Z','senderId':'fixture-invalid-'+str(i),
                       'text':'S> -1k NX for 20k mesos','sourceUrl':'https://example.invalid/smega'}for i in range(3)]
            engine.atomic(root/'input.json',messages)
            with patch.object(smega,'ROOT',root):self.assertEqual(smega.ingest(root/'input.json'),[])



class SmegaNumericPrefixTests(unittest.TestCase):
 def test_spaced_malformed_prefixes_abstain_in_both_unit_orders(self):
  from smega import parse_rate
  for prefix in ('1, ', '1.2. ', '1e ', '.5e ', '1 ', '1. '):
   for text in (f'S> {prefix}500 NX for 10k mesos', f'B> {prefix}10k mesos for 500 NX'):
    with self.subTest(text=text):self.assertIsNone(parse_rate(text))

 def test_spaced_signs_are_never_discarded(self):
  from smega import parse_rate
  for sign in ('-', '+', '−', '–', '—'):
   for gap in (' ', '\t'):
    for text in (f'S> {sign}{gap}500 NX for 10k mesos', f'B> {sign}{gap}10k mesos for 500 NX'):
     with self.subTest(text=text):self.assertIsNone(parse_rate(text))

 def test_ordinary_words_wrappers_and_complete_amounts_remain_usable(self):
  from fractions import Fraction
  from smega import parse_rate
  for text,nx,mesos in (
   ('S> selling 500 NX for 10k mesos',Fraction(500),Fraction(10000)),
   ('S> price: 1,500 NX for 30k mesos',Fraction(1500),Fraction(30000)),
   ('S> [ .5k NX for 10k mesos ]',Fraction(500),Fraction(10000)),
   ('B> (30,000 mesos for 1,500 NX)',Fraction(1500),Fraction(30000))):
   with self.subTest(text=text):self.assertEqual(float(mesos/nx),parse_rate(text))

 def test_second_quantity_cannot_skip_malformed_tokens(self):
  from smega import parse_rate
  for text in ('S> 500 NX for 1, 000 mesos','S> 500 NX for 1.2. 5k mesos',
               'S> 500 NX for 1e 3 mesos','B> 10k mesos for 1, 000 NX'):
   with self.subTest(text=text):self.assertIsNone(parse_rate(text))


class SmegaNumericContinuationTests(unittest.TestCase):
 def test_numeric_operators_never_create_a_boundary_through_whitespace(self):
  from smega import parse_rate
  for left in ('', ' ', '\t', '\n'):
   for right in ('', ' ', '\t', '\n'):
    for marker in (',', '.', 'e', 'E'):
     prefix='1'+left+marker+right
     for text in (f'S> {prefix}500 NX for 10k mesos',f'B> {prefix}10k mesos for 500 NX'):
      # A contiguous valid decimal/grouped amount is tested by the positive
      # oracle, not relabelled malformed merely because this matrix contains it.
      if not left and not right and marker in (',','.'):continue
      with self.subTest(text=text):self.assertIsNone(parse_rate(text))

 def test_spaced_leading_decimal_and_repeated_continuations_abstain(self):
  from smega import parse_rate
  for prefix in ('. ','.\t','1 e e ', '1 , e ', '1 . e ', '1 , . ', '1_ ', '1k '):
   for text in (f'S> {prefix}5k NX for 10k mesos',f'B> {prefix}10k mesos for 5k NX'):
    with self.subTest(text=text):self.assertIsNone(parse_rate(text))

 def test_no_numeric_prefix_keeps_normal_words_and_channel_labels(self):
  from smega import parse_rate
  for prefix in ('','selling ', 'channel1 ', 'channel10 ', 'price: ', 'selling, ', 'selling , ', 'price e ', '[', '('):
   with self.subTest(prefix=prefix):self.assertEqual(20,parse_rate('S> '+prefix+'500 NX for 10k mesos'))

 def test_whole_supported_amounts_stay_exact_with_fraction_oracle(self):
  from fractions import Fraction
  from smega import parse_rate
  for text,nx,mesos in (('S> 1,500 NX for 30k mesos',1500,30000),
                         ('S> .5k NX for 10k mesos',500,10000),
                         ('S> 1.500 NX for 30 mesos',Fraction(3,2),30),
                         ('B> 30,000 mesos/1,500NX',1500,30000)):
   with self.subTest(text=text):self.assertEqual(float(Fraction(mesos)/Fraction(nx)),parse_rate(text))


class SmegaNumericMarkerTests(unittest.TestCase):
 def test_every_numeric_marker_walks_back_to_the_original_fragment(self):
  from smega import parse_rate
  for gap in (' ', '\t', '\n', '\u2003'):
   for marker in ('_', 'k', 'K', 'm', 'M', '_ k', 'k m', 'e _ K', ', m'):
    for text in (f'S> 1{gap}{marker}{gap}500 NX for 10k mesos',f'B> 1{gap}{marker}{gap}10k mesos for 500 NX'):
     with self.subTest(text=text):self.assertIsNone(parse_rate(text))

 def test_marker_words_without_a_numeric_prefix_are_not_invented_quantities(self):
  from smega import parse_rate
  for prefix in ('k ', 'K ', 'm ', 'M ', '_ ', 'm k ', 'selling k ', 'channel1 k ', 'channel1 m _ '):
   with self.subTest(prefix=prefix):self.assertEqual(20,parse_rate('S> '+prefix+'500 NX for 10k mesos'))
if __name__=='__main__':unittest.main()
