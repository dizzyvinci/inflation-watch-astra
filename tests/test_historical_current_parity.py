"""Historical goldens and current input invariants remain separate, offline."""
import copy
import datetime as dt
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import engine
import cash_basket
from market_catalog import MarketCatalog
import historical_market_fixture as historical

ROOT = Path(__file__).resolve().parents[1]

class HistoricalAndCurrentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = (ROOT / 'cache/market.json').read_bytes()
        cls.feed = json.loads(cls.raw)
        cls.cfg = engine.read(ROOT / 'config.json')

    def test_existing_historical_fixture_is_hash_pinned_owned_and_distinct_from_current(self):
        old = historical.historical_market()
        self.assertEqual(old['updatedAt'], '2026-11-04T08:30:56+00:00')
        self.assertEqual(len(old['items']), 1424)
        old['items'].clear()
        self.assertEqual(len(historical.historical_market()['items']), 1424)
        self.assertEqual((ROOT / 'cache/market.json').read_bytes(), self.raw)

    def test_historical_fixture_tamper_rejects_without_using_current_cache(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp) / 'historical.json'
            p.write_bytes(self.raw)
            with patch.object(historical, '_PATH', p):
                with self.assertRaisesRegex(ValueError, '^historical_test_input_changed$'):
                    historical.historical_market()

    def test_current_feed_identity_projection_keeps_all_prices_counts_and_source_clocks(self):
        engine.validate_feed(copy.deepcopy(self.feed))
        old = MarketCatalog(self.feed, engine.read(ROOT / 'catalog-identities-v1.json'))
        current = MarketCatalog(self.feed, engine.read(ROOT / 'catalog-identities-v2.json'))
        self.assertEqual(old.source_projection_hash, current.source_projection_hash)
        self.assertEqual(len(current.build_index()['rows']), len(self.feed['items']))
        self.assertNotEqual(old.catalog_hash, current.catalog_hash)
        for before, after in zip(old.build_index()['rows'], current.build_index()['rows']):
            self.assertEqual({k:v for k,v in before.items() if k != 'canonicalId'},
                             {k:v for k,v in after.items() if k != 'canonicalId'})
            excluded = {'canonicalId', 'identityProvenance', 'catalogHash'}
            self.assertEqual({k:v for k,v in old.resolve_item(before['slug']).items() if k not in excluded},
                             {k:v for k,v in current.resolve_item(after['slug']).items() if k not in excluded})
        self.assertEqual((ROOT / 'cache/market.json').read_bytes(), self.raw)

    def test_current_feed_next_day_volume_rolls_without_reordering_or_rebasing(self):
        feed = copy.deepcopy(self.feed)
        next_day = dt.date.fromisoformat(feed['updatedAt'][:10]) + dt.timedelta(days=1)
        start = (next_day - dt.timedelta(days=7)).isoformat()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            engine.atomic(root / 'config.json', self.cfg)
            with patch.object(engine, 'ROOT', root):
                before = engine.compute(copy.deepcopy(self.feed), {'status':'cached'})
                feed['updatedAt'] = next_day.isoformat() + 'T00:01:00Z'
                for item in feed['items']:
                    self.assertTrue(item['h'])
                    self.assertLess(item['h'][-1][0], next_day.isoformat())
                    item['h'].append([next_day.isoformat(), item['h'][-1][1], 5])
                after = engine.compute(feed, {'status':'cached'})
        self.assertEqual(after['selectionStart'], before['selectionStart'])
        self.assertEqual(after['basketHash'], before['basketHash'])
        self.assertEqual(after['baseNxRate'], before['baseNxRate'])
        self.assertEqual(after['recentStart'], start)
        self.assertEqual(after['allRecentQuantity'], sum(q for item in feed['items'] for day,p,q in item['h'] if start <= day < next_day.isoformat()))
        self.assertEqual((ROOT / 'cache/market.json').read_bytes(), self.raw)

    def test_current_source_day_initial_cash_gap_and_carry_are_still_checked(self):
        definition = cash_basket.make_definition(self.feed, self.cfg)
        day = dt.date.fromisoformat(self.feed['updatedAt'][:10])
        previous = (day - dt.timedelta(days=1)).isoformat()
        feed = {'updatedAt': self.feed['updatedAt'], 'items': [
            {'s':row['slug'], 'n':row['name'], 'k':'Cash Shop',
             'h':[[(day.isoformat() if index == 0 else previous), row['basePrice'], 5]]}
            for index,row in enumerate(definition['rows'])]}
        result = cash_basket.compute_from_definition(feed, definition, self.cfg)
        self.assertIsNone(result['history'][0]['cpi'])
        self.assertAlmostEqual(result['latest']['cpi'], 100)
        self.assertAlmostEqual(result['latest']['coverage'], definition['rows'][0]['weight'])
        self.assertAlmostEqual(result['latest']['pricedCoverage'], 1)
        self.assertEqual(result['latest']['day'], day.isoformat())
        self.assertTrue(result['latest']['partial'])
        self.assertEqual((ROOT / 'cache/market.json').read_bytes(), self.raw)

if __name__ == '__main__':
    unittest.main()
