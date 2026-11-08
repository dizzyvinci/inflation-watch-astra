"""Catalog coverage/provenance tests. No source requests or canonical writes."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from historical_market_fixture import historical_market
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import engine


class CashCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.feed = engine.read(engine.ROOT / 'cache/market.json')
        cls.cfg = engine.read(engine.ROOT / 'config.json')
        cls.seed = engine.read(engine.ROOT / 'dist/data.json')
        cls.metadata = engine.read(engine.ROOT / 'cache/cash-catalog-metadata.json', {})
        # Public-checkout fixtures must not depend on private intake files.
        # Before the first catalog build, derive only test joins from IDs and
        # exact expected names already present in the public accepted snapshot.
        reference = cls.seed.get('rollingReference', {})
        cls.identities = cls.seed.get('cashCatalog', {}).get('identityMap') or [
            {'slug': row['slug'], 'name': row['name'], 'id': item['id'], 'planHash': reference['planHash']}
            for row in cls.seed['cash'] for item in reference.get('items', [])
            if item.get('id') == item.get('expectedItemId') and item.get('name') == item.get('expectedItemName') == row['name']]
        cls.plan = {'kind': 'offline_scanner_capture_request_plan', 'isCapture': False,
                    'requests': [{'cohort': 'cash', 'slug': 'synthetic-cash', 'expectedItemId': 123,
                                  'expectedItemName': 'Synthetic cash'}]}
        cls.plan['planHash'] = hashlib.sha256(json.dumps(cls.plan, sort_keys=True, ensure_ascii=False,
                                                        separators=(',', ':')).encode()).hexdigest()

    def catalog(self, feed=None, rolling=None, identities=None):
        return engine.cash_catalog(feed or self.feed, self.cfg, self.seed.get('cashBasket'),
                                   self.seed.get('rollingReference') if rolling is None else rolling,
                                   self.identities if identities is None else identities, self.metadata)

    def test_all_source_cash_items_survive_without_cost_or_reference_week(self):
        self.feed = historical_market()
        result = self.catalog()
        source = [item for item in self.feed['items'] if item['k'] == 'Cash Shop']
        self.assertEqual(result['itemCount'], len(source))
        self.assertEqual(result['coverage']['fixedNxItems'], len(self.cfg['nx_prices']))
        self.assertEqual(result['coverage']['cashIndexItems'], self.seed['cashBasket']['itemCount'])
        self.assertEqual(result['coverage']['withRollingObservation'], 29)
        halloween = next(row for row in result['rows'] if row['slug'] == 'halloween-mystery-fashion-crate')
        self.assertEqual(halloween['firstObservedDay'], '2026-10-28')
        self.assertEqual(halloween['qualifyingDays'], 8)
        self.assertIsNone(halloween['knownNxCost'])
        self.assertFalse(halloween['inCashBasket'])
        self.assertIn('no_qualifying_reference_period_history_in_retained_source', halloween['notIndexedReasons'])
        self.assertEqual(halloween['publisherMedian'], 59595.91)
        self.assertEqual(halloween['price'], 64646.45)
        self.assertTrue(halloween['partial'])
        self.assertIn('not a release date', result['notes']['firstObservedDay'])
        self.assertFalse(any('teddy' in row['name'].lower() for row in result['rows']))
        self.assertFalse(any('release' in key.lower() for row in result['rows'] for key in row))
        self.assertEqual(result['providerItemCount'], len(source))
        self.assertEqual(result['catalogItemCount'], len(source) + 1)
        teddy = next(item for item in result['metadataItems'] if item['id'] == 1007133)
        self.assertEqual(teddy['name'], 'Teddy Bear Headgear')
        self.assertFalse(teddy['marketDataAvailable'])
        self.assertIsNone(teddy['knownNxCost'])
        self.assertIsNone(teddy['price'])
        self.assertEqual(teddy['history'], [])
        self.assertIsNone(teddy['firstObservedDay'])

    def test_metadata_is_allowlisted_bounded_and_never_a_price_or_release(self):
        entry = copy.deepcopy(self.metadata['items'][0])
        entry.update({'price': 9999, 'knownNxCost': 3500, 'releaseDate': '2026-11-04',
                      'playerName': 'synthetic-private-name'})
        result = engine.cash_catalog_metadata([entry, entry, {**entry, 'region': 'GMS'},
                                                {**entry, 'metadataCapturedAt': 'invalid'}], [])
        self.assertEqual(len(result), 1)
        self.assertIsNone(result[0]['price'])
        self.assertIsNone(result[0]['knownNxCost'])
        self.assertNotIn('releaseDate', result[0])
        self.assertNotIn('playerName', result[0])
        self.assertEqual(engine.cash_catalog_metadata({'schemaVersion': 99, 'items': [entry]}, []), [])

    def test_public_seed_identity_fallback_is_curated_without_private_intake(self):
        identity = {**self.identities[0], 'notPublic': 'synthetic-private-field'}
        result = engine.cash_catalog_seed_identities({'cashCatalog': {'identityMap': [identity]}})
        self.assertEqual(result, [self.identities[0]])
        self.assertEqual(engine.cash_catalog_seed_identities({'cashCatalog': {'identityMap': [identity, identity]}}), [])
        self.assertEqual(engine.cash_catalog_seed_identities({'cashCatalog': {'identityMap': [{**identity, 'planHash': 'bad'}]}}), [])

    def test_separate_observations_keep_clocks_windows_variants_and_no_shop_details(self):
        result = self.catalog()
        row = next(row for row in result['rows'] if row['slug'] == 'selective-5-slot-coupon')
        daily, rolling = row['sourceObservations']
        self.assertEqual(daily['kind'], 'daily_provider_summary')
        self.assertEqual(daily['sourceUpdatedAt'], self.feed['updatedAt'])
        captured = next(item for item in self.seed['rollingReference']['items'] if item['id'] == rolling['id'])
        self.assertEqual(rolling['capturedAt'], captured['capturedAt'])
        self.assertEqual(rolling['windowDays'], captured['windowDays'])
        self.assertIsNone(rolling['sourceObservedAt'])
        self.assertFalse(rolling['observationTimestampKnown'])
        self.assertEqual(rolling['variantKey'], captured['variantKey'])
        self.assertEqual(rolling['price'], captured['price'])
        self.assertNotIn('cheapestListing', rolling)
        self.assertNotIn('channel', rolling)
        altered = copy.deepcopy(self.seed['rollingReference'])
        altered['planHash'] = 'different-plan'
        self.assertEqual(self.catalog(rolling=altered)['coverage']['withRollingObservation'], 0)
        self.assertEqual(self.catalog(identities=[])['coverage']['withRollingObservation'], 0)
        self.assertEqual(engine.cash_catalog_identities({**self.plan, 'planHash': 'wrong'}), [])
        self.assertEqual(engine.cash_catalog_identities(self.plan), [
            {'slug': 'synthetic-cash', 'name': 'Synthetic cash', 'id': 123, 'planHash': self.plan['planHash']}])

    def test_unknown_and_thin_items_are_retained_without_fabricated_prices(self):
        feed = copy.deepcopy(self.feed)
        feed['items'].extend([
            {'n': 'Synthetic thin cash', 's': 'synthetic-thin-cash', 'k': 'Cash Shop',
             'h': [['2026-11-03', 7, 4], ['2026-11-04', 8, 5]], 'p': float('nan'), 'last': 'not-a-date'},
            {'n': 'Synthetic no history', 's': 'synthetic-no-history', 'k': 'Cash Shop', 'h': []},
        ])
        result = self.catalog(feed)
        thin, empty = result['rows'][-2:]
        self.assertEqual(thin['historyDays'], 2)
        self.assertEqual(thin['qualifyingDays'], 1)
        self.assertEqual(thin['recordedCount'], 9)
        self.assertEqual(thin['price'], 8)
        self.assertTrue(thin['limitedHistory'])
        self.assertIsNone(thin['publisherMedian'])
        self.assertIsNone(thin['sourceLastSeenAt'])
        for key in ('price', 'priceDay', 'quantity', 'firstObservedDay', 'knownNxCost'):
            self.assertIsNone(empty[key])
        self.assertEqual(empty['history'], [])
        json.dumps(result, allow_nan=False)

    def test_rolling_base_retention_never_removes_fixed_cash_members(self):
        feed = copy.deepcopy(self.feed)
        for item in feed['items']:
            item['h'] = [point for point in item['h'] if point[0] > self.cfg['base_end']]
        result = self.catalog(feed)
        self.assertEqual(result['coverage']['cashIndexItems'], self.seed['cashBasket']['itemCount'])
        self.assertEqual(result['cashIndexBasketHash'], self.seed['cashBasket']['basketHash'])
        for row in result['rows']:
            if row['inCashBasket']:
                self.assertEqual(row['notIndexedReasons'], [])

    def test_compute_adds_catalog_without_changing_headlines_or_frozen_membership(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(engine, 'ROOT', root):
                engine.atomic(root / 'config.json', self.cfg)
                before = engine.compute(copy.deepcopy(self.feed), {'status': 'cached'})
                feed = copy.deepcopy(self.feed)
                item = next(row for row in feed['items'] if row['s'] == 'halloween-mystery-fashion-crate')
                item['p'] *= 2
                report = engine.compute(feed, {'status': 'cached'})
                for key in ('latest', 'rows', 'cash', 'history', 'baseNxRate', 'basketHash'):
                    self.assertEqual(report[key], before[key], key)
                self.assertEqual(report['cashBasket'], before['cashBasket'])
                row = next(row for row in report['cashCatalog']['rows'] if row['slug'] == item['s'])
                self.assertEqual(row['publisherMedian'], item['p'])
                self.assertEqual(row['price'], before['cashCatalog']['rows'][next(i for i, r in enumerate(before['cashCatalog']['rows']) if r['slug'] == item['s'])]['price'])


if __name__ == '__main__':
    unittest.main()
