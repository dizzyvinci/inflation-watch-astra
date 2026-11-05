import copy
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import adapters
import engine
import rolling_history as rolling


class RollingCaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def payload(self, roll='7 ATT / 0 slots', price=1000, captured='2026-11-05T03:02:00Z', item_capture='2026-11-05T03:01:00Z', days=3):
        return {'sourceUrl': rolling.SOURCE, 'capturedAt': captured,
                'captureStartedAt': '2026-11-05T03:00:00Z', 'captureCompletedAt': captured,
                'items': [{'requested': 'Work Gloves', 'capturedAt': item_capture,
                           'result': {'item': 'Work Gloves', 'id': 1082002, 'currency': 'mesos',
                                      'typical_sale_price': price, 'sales_counted': 10, 'window_days': days,
                                      'stat_roll': roll, 'price_basis': 'median of sales', 'listings_now': 5,
                                      'cheapest_listing': {'price_each': 900, 'channel': 3, 'room': 4, 'owner': 'DO_NOT_RETAIN'},
                                      'site': rolling.SOURCE, 'sellerIdentity': 'DO_NOT_RETAIN'}}]}

    def counts(self):
        with closing(sqlite3.connect(self.root/rolling.LEDGER)) as connection:
            return tuple(connection.execute('SELECT (SELECT COUNT(*) FROM captures),(SELECT COUNT(*) FROM observations)').fetchone())

    def test_per_item_clock_roll_window_listing_provenance_and_privacy_are_retained(self):
        payload = self.payload(); payload['items'][0].update(sourceObservedAt='2026-11-05T02:59:00Z', sourceWindowStartAt='2026-11-02T00:00:00Z', sourceWindowEndAt='2026-11-05T02:59:00Z')
        result = rolling.import_capture(self.root, payload); item = result['items'][0]
        self.assertEqual(item['capturedAt'], payload['items'][0]['capturedAt'])
        self.assertEqual(item['captureTimeKind'], 'per_item_return')
        self.assertEqual(item['sourceObservedAt'], '2026-11-05T02:59:00Z')
        self.assertEqual(item['sourceWindowStartAt'], '2026-11-02T00:00:00Z')
        self.assertEqual(item['statRoll'], '7 ATT / 0 slots'); self.assertEqual(item['windowDays'], 3)
        self.assertEqual(item['cheapestListing'], {'price_each': 900, 'channel': 3, 'room': 4})
        self.assertFalse(item['qualityConstant']); self.assertEqual(self.counts(), (1, 1))
        history = rolling.variant_history(self.root/rolling.LEDGER, item['variantKey'])
        self.assertEqual(history[0]['price'], 1000)
        self.assertNotIn('DO_NOT_RETAIN', json.dumps(history))
        self.assertNotIn('DO_NOT_RETAIN', json.dumps(result))

    def test_rolls_split_histories_and_windows_split_measurement_series(self):
        a = rolling.import_capture(self.root, self.payload())['items'][0]
        b = rolling.import_capture(self.root, self.payload('10 ATT / 0 slots', captured='2026-11-05T04:02:00Z', item_capture='2026-11-05T04:01:00Z'))['items'][0]
        c = rolling.import_capture(self.root, self.payload('10 ATT / 0 slots', captured='2026-11-05T05:02:00Z', item_capture='2026-11-05T05:01:00Z', days=4))['items'][0]
        self.assertNotEqual(a['variantKey'], b['variantKey']); self.assertEqual(b['variantKey'], c['variantKey'])
        self.assertNotEqual(b['seriesKey'], c['seriesKey']); self.assertEqual(self.counts(), (3, 3))
        self.assertEqual(len(rolling.variant_history(self.root/rolling.LEDGER, a['variantKey'])), 1)
        self.assertEqual(len(rolling.variant_history(self.root/rolling.LEDGER, b['variantKey'], b['seriesKey'])), 1)

    def test_replay_is_idempotent_and_conflicting_actual_capture_rolls_back(self):
        payload = self.payload(); rolling.import_capture(self.root, payload)
        target = self.root/'cache'/rolling.PROJECTION; original = target.read_bytes(); modified = target.stat().st_mtime_ns
        rolling.import_capture(self.root, copy.deepcopy(payload))
        self.assertEqual(self.counts(), (1, 1)); self.assertEqual(target.stat().st_mtime_ns, modified)
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            rolling.import_capture(self.root, self.payload(price=2000))
        self.assertEqual(self.counts(), (1, 1)); self.assertEqual(target.read_bytes(), original)

    def test_late_conflict_rolls_back_earlier_new_rows_and_lock_prevents_projection_races(self):
        rolling.import_capture(self.root, self.payload())
        incoming = self.payload(captured='2026-11-05T04:02:00Z', item_capture='2026-11-05T04:01:00Z')
        ore = copy.deepcopy(incoming['items'][0]); ore['result'].update(item='Ore', id=4010001, stat_roll=None)
        conflict = self.payload(price=2000)['items'][0]
        incoming['items'] = [ore, conflict]
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            rolling.import_capture(self.root, incoming)
        self.assertEqual(self.counts(), (1, 1))
        lock = self.root/'cache/.rolling-captures.lock'; lock.touch()
        try:
            with self.assertRaisesRegex(RuntimeError, 'owns the ledger'):
                rolling.import_capture(self.root, self.payload())
        finally:
            lock.unlink()

    def test_legacy_roll_and_time_unknown_are_not_recast_as_clean_or_per_item(self):
        legacy = {'sourceUrl': rolling.SOURCE, 'kind': 'rolling_scanner_reference', 'capturedAt': '2026-11-05T02:00:00Z',
                  'items': [{'name': 'Work Gloves', 'id': 1082002, 'price': 500, 'salesCounted': 5, 'windowDays': 3, 'salesPerHourProxy': 5/72}]}
        engine.atomic(self.root/'cache'/rolling.PROJECTION, legacy)
        current = rolling.import_capture(self.root, self.payload())
        unknown = rolling.legacy_capture(legacy)['items'][0]
        self.assertEqual(unknown['statRollStatus'], 'unknown_legacy'); self.assertFalse(unknown['statRollKnown'])
        self.assertEqual(unknown['captureTimeKind'], 'batch_timestamp_only'); self.assertIsNone(unknown['sourceObservedAt'])
        self.assertNotEqual(unknown['variantKey'], current['items'][0]['variantKey'])
        self.assertEqual(self.counts(), (2, 2))
        restored = rolling.import_capture(self.root, {'sourceUrl': rolling.SOURCE, 'capturedAt': legacy['capturedAt'],
                                                     'items': [{'item': 'Work Gloves', 'id': 1082002, 'typical_sale_price': 500, 'sales_counted': 5, 'window_days': 3, 'price_basis': 'median of sales'}]})
        self.assertEqual(restored['capturedAt'], current['capturedAt'])

    def test_non_sales_and_failed_browser_returns_cannot_create_an_observation(self):
        for value in ['median asking price', 'no sales recorded in the window']:
            payload = self.payload(); payload['items'][0]['result']['price_basis'] = value
            with self.assertRaisesRegex(ValueError, 'No usable'): rolling.import_capture(self.root, payload)
        payload = self.payload(); payload['items'][0]['result'] = {'content': [{'type': 'text', 'text': 'Opening room; Turnstile failed'}]}
        with self.assertRaises(ValueError): rolling.import_capture(self.root, payload)
        self.assertFalse((self.root/rolling.LEDGER).exists())

    def test_expected_request_id_and_casefold_name_are_validated_before_ledger_creation(self):
        for expected_id, expected_name in [(1082003, 'Work Gloves'), (True, 'Work Gloves'), (0, 'Work Gloves'), ('1082002', 'Work Gloves'), (1082002, 'Different Gloves'), (1082002, ''), (1082002, 123)]:
            with self.subTest(expected_id=expected_id, expected_name=expected_name):
                payload = self.payload(); payload['items'][0].update(expectedItemId=expected_id, expectedItemName=expected_name)
                with self.assertRaisesRegex(ValueError, 'expectedItem'):
                    rolling.import_capture(self.root, payload)
                self.assertFalse((self.root/rolling.LEDGER).exists())
        payload = self.payload(); payload['items'][0].update(expectedItemId=1082002, expectedItemName='wOrK gLoVeS')
        result = rolling.import_capture(self.root, payload)
        self.assertEqual(result['items'][0]['expectedItemId'], 1082002)
        self.assertEqual(result['items'][0]['expectedItemName'], 'wOrK gLoVeS')
        self.assertEqual(self.counts(), (1, 1))
        # Adding validated receipt expectations does not make a new price point.
        without_expectations = self.payload()
        rolling.import_capture(self.root, without_expectations)
        self.assertEqual(self.counts(), (2, 1))
        missing = self.payload(); missing['items'][0].update(expectedItemId=1082002, expectedItemName='Work Gloves')
        del missing['items'][0]['result']['item']
        with self.assertRaisesRegex(ValueError, 'expectedItemName'):
            rolling.normalize_capture(missing)

    def test_bad_clocks_and_bad_quantities_reject_without_invented_source_times(self):
        for change in [{'capturedAt': '2099-01-01T00:00:00Z'}, {'capturedAt': '2026-11-05T02:59:00Z'}, {'sourceObservedAt': '2026-11-05T03:01:01Z'}, {'sourceWindowStartAt': '2026-11-04T00:00:00Z', 'sourceWindowEndAt': '2026-11-03T00:00:00Z'}]:
            payload = self.payload(); payload['items'][0].update(change)
            with self.assertRaises(ValueError): rolling.normalize_capture(payload)
        for count in [True, 1.2, 0, -1]:
            payload = self.payload(); payload['items'][0]['result']['sales_counted'] = count
            with self.assertRaises(ValueError): rolling.normalize_capture(payload)
        item = rolling.normalize_capture(self.payload())['items'][0]
        self.assertIsNone(item['sourceObservedAt']); self.assertNotIn('sourceWindowStartAt', item)

    def test_projection_failure_replay_repairs_from_committed_append_only_ledger(self):
        with patch.object(rolling, '_atomic', side_effect=OSError('Local publication unavailable')):
            with self.assertRaises(OSError): rolling.import_capture(self.root, self.payload())
        self.assertEqual(self.counts(), (1, 1)); self.assertFalse((self.root/'cache'/rolling.PROJECTION).exists())
        rolling.import_capture(self.root, self.payload()); self.assertEqual(self.counts(), (1, 1))
        self.assertTrue((self.root/'cache'/rolling.PROJECTION).exists())

    def test_comparable_coverage_and_reasons_exclude_unmatched_gear(self):
        payload = rolling.normalize_capture(self.payload())
        payload['items'].append({'name': 'Ore', 'id': 4010001, 'price': 100, 'salesCounted': 5, 'windowDays': 2, 'salesPerHourProxy': 5/48})
        rows = [{'name': 'Work Gloves', 'category': 'Equipment', 'weight': .7}, {'name': 'Ore', 'category': 'Materials', 'weight': .3}]
        goods, cash, report = rolling.comparable_inputs(rows, [], payload)
        self.assertAlmostEqual(report['capturedBasketCoverage'], 1)
        self.assertAlmostEqual(report['comparableBasketCoverage'], .3)
        self.assertEqual(set(goods), {'Ore'}); self.assertIn('reported_roll', report['excludedBasketItems'][0]['reason'])
        self.assertFalse(report['qualityConstant'])
        gear = copy.deepcopy(payload['items'][0]); gear['statRoll'] = None
        self.assertEqual(rolling.comparison_reason(rows[0], gear), 'daily_equipment_baseline_has_unidentified_roll_mix')
        self.assertIsNone(rolling.comparison_reason({'category': 'Weapons'}, {'id': 2070001, 'statRoll': None}))
        self.assertEqual(rolling.comparison_reason({'category': 'Weapons'}, {'id': 1372000, 'statRoll': None}), 'daily_weapon_baseline_has_unidentified_roll_mix')

    def test_aggregate_replay_does_not_turn_a_new_pull_clock_into_new_measurement(self):
        payload = rolling.normalize_capture(self.payload(None))
        item = payload['items'][0]; item.update(name='Ore', id=4010001)
        engine.atomic(self.root/'cache'/rolling.PROJECTION, payload)
        rows = [{'name': 'Ore', 'category': 'Materials', 'weight': 1, 'basePrice': 1000}]
        result, first = adapters.rolling_reference(rows, [], self.root)
        later = copy.deepcopy(payload); later['capturedAt'] = '2026-11-05T04:02:00Z'; later['items'][0]['capturedAt'] = '2026-11-05T04:01:00Z'; later['items'][0]['listingsNow'] = 100
        engine.atomic(self.root/'cache'/rolling.PROJECTION, later)
        result, repeated = adapters.rolling_reference(rows, [], self.root)
        self.assertEqual(len(first), 1); self.assertEqual(repeated, first)
        self.assertEqual(result['capturedAt'], later['capturedAt'])


if __name__ == '__main__': unittest.main()
