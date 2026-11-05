import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cash_basket
import engine


class CashBasketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cfg = engine.read(engine.ROOT / 'config.json')
        cls.feed = engine.read(engine.ROOT / 'cache' / 'market.json')

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def compute(self, feed=None, cfg=None):
        return cash_basket.compute_cash_basket(feed or self.feed, cfg or self.cfg, self.root)

    def test_real_cohort_and_cap_are_feasible_and_normalized(self):
        result = self.compute()
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['itemCount'], 28)
        self.assertEqual(result['configuredItemCount'], 29)
        self.assertEqual(result['missingBaselineNames'], ['Red Hat'])
        self.assertAlmostEqual(sum(row['weight'] for row in result['rows']), 1)
        self.assertLessEqual(max(row['weight'] for row in result['rows']), .08 + 1e-12)
        expected = engine.capped_weights([row['baseExpenditure'] for row in result['rows']], .08)
        for row, weight in zip(result['rows'], expected):
            self.assertAlmostEqual(row['weight'], weight)

    def test_base_prices_normalize_to_100_and_double_prices_to_200(self):
        definition = cash_basket.make_definition(self.feed, self.cfg)
        feed = {'updatedAt': self.feed['updatedAt'], 'items': [
            {'s': row['slug'], 'n': row['name'], 'k': 'Cash Shop',
             'h': [['2026-11-04', row['basePrice'], 5]]} for row in definition['rows']]}
        result = cash_basket.compute_from_definition(feed, definition, self.cfg)
        self.assertAlmostEqual(result['latest']['cpi'], 100)
        for item in feed['items']:
            item['h'][0][1] *= 2
            item['h'][0][2] *= 100  # Current volume cannot change frozen cash weights.
        self.assertAlmostEqual(cash_basket.compute_from_definition(feed, definition, self.cfg)['latest']['cpi'], 200)

    def test_daily_median_base_is_volume_weighted_and_q4_excluded(self):
        cfg = {**self.cfg, 'nx_prices': {f'Cash {i}': 1000 for i in range(13)}}
        feed = {'updatedAt': self.feed['updatedAt'], 'items': [
            {'s': f'cash-{i}', 'n': f'Cash {i}', 'k': 'Cash Shop',
             'h': [['2026-10-21', 100, 5], ['2026-10-22', 400, 10], ['2026-10-23', 99999, 4]]}
            for i in range(13)]}
        result = self.compute(feed, cfg)
        self.assertEqual(result['rows'][0]['basePrice'], 300)
        self.assertEqual(result['rows'][0]['baseQuantity'], 15)
        self.assertEqual(result['rows'][0]['baseObservationDays'], 2)

    def test_missing_initial_prices_are_null_and_carry_only_after_observed(self):
        definition = cash_basket.make_definition(self.feed, self.cfg)
        items = []
        for index, row in enumerate(definition['rows']):
            day = '2026-11-03' if index else '2026-11-04'
            items.append({'s': row['slug'], 'n': row['name'], 'k': 'Cash Shop', 'h': [[day, row['basePrice'], 5]]})
        feed = {'updatedAt': self.feed['updatedAt'], 'items': items}
        result = cash_basket.compute_from_definition(feed, definition, self.cfg)
        self.assertIsNone(result['history'][0]['cpi'])
        self.assertAlmostEqual(result['latest']['cpi'], 100)
        self.assertAlmostEqual(result['latest']['coverage'], definition['rows'][0]['weight'])
        self.assertAlmostEqual(result['latest']['pricedCoverage'], 1)
        self.assertTrue(result['latest']['partial'])

    def test_missing_source_member_does_not_reuse_seed_price_or_reweight(self):
        first = self.compute()
        altered = copy.deepcopy(self.feed)
        missing = first['rows'][0]['slug']
        altered['items'] = [item for item in altered['items'] if item['s'] != missing]
        result = self.compute(altered)
        self.assertEqual(result['itemCount'], first['itemCount'])
        self.assertIsNone(result['latest']['cpi'])
        self.assertTrue(result['rows'][0]['missingSource'])
        self.assertIsNone(result['rows'][0]['price'])
        self.assertEqual(result['basketHash'], first['basketHash'])

    def test_frozen_definition_survives_base_history_rolloff(self):
        first = self.compute()
        path = self.root / 'cache' / 'cash-basket-v1.json'
        frozen_bytes = path.read_bytes()
        altered = copy.deepcopy(self.feed)
        altered['updatedAt'] = '2026-11-20T08:30:00Z'
        for item in altered['items']:
            item['h'] = [['2026-11-19', item['h'][-1][1], 10]]
        result = self.compute(altered)
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['basketHash'], first['basketHash'])
        self.assertEqual(path.read_bytes(), frozen_bytes)
        self.assertEqual(result['latest']['day'], '2026-11-20')
        self.assertEqual(result['latest']['coverage'], 0)
        self.assertAlmostEqual(result['latest']['pricedCoverage'], 1)

    def test_insufficient_baseline_unavailable_without_persisting(self):
        cfg = {**self.cfg, 'nx_prices': dict(list(self.cfg['nx_prices'].items())[:3])}
        result = self.compute(cfg=cfg)
        self.assertEqual(result['status'], 'unavailable')
        self.assertIn('at least 13', result['reason'])
        self.assertIsNone(result['latest'])
        self.assertFalse((self.root / 'cache' / 'cash-basket-v1.json').exists())

    def test_config_mismatch_and_tampering_are_unavailable_not_rebased(self):
        self.compute()
        path = self.root / 'cache' / 'cash-basket-v1.json'
        before = path.read_bytes()
        cfg = copy.deepcopy(self.cfg)
        cfg['nx_prices']['Red Hat'] += 1
        self.assertEqual(self.compute(cfg=cfg)['status'], 'unavailable')
        self.assertEqual(path.read_bytes(), before)
        definition = json.loads(before)
        definition['rows'][0]['basePrice'] *= 2
        engine.atomic(path, definition)
        result = self.compute()
        self.assertEqual(result['status'], 'unavailable')
        self.assertIn('integrity', result['reason'])

    def test_goods_and_nx_unchanged_when_cash_definition_is_unavailable(self):
        engine.atomic(self.root / 'config.json', self.cfg)
        with patch.object(engine, 'ROOT', self.root):
            good = engine.compute(copy.deepcopy(self.feed), {'status': 'ok'})
            engine.atomic(self.root / 'cache' / 'cash-basket-v1.json', {'version': 999})
            unavailable = engine.compute(copy.deepcopy(self.feed), {'status': 'ok'})
        self.assertEqual(unavailable['cashBasket']['status'], 'unavailable')
        for key in ('latest', 'rows', 'cash', 'categories', 'history', 'baseNxRate'):
            self.assertEqual(unavailable[key], good[key], key)


if __name__ == '__main__':
    unittest.main()
