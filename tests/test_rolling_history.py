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
        self.assertEqual(item['cheapestListing'], {'price_each': 900, 'channel': 3, 'room': 4, 'availabilityConfirmed': False})
        self.assertFalse(item['availabilityConfirmed'])
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

    def test_casefold_receipt_names_match_comparison_and_ambiguous_names_reject(self):
        payload = rolling.normalize_capture(self.payload(None))
        item = payload['items'][0]
        item.update(name='bLaCk HaT', id=1802003)
        goods, cash, comparison = rolling.comparable_inputs(
            [{'name': 'Black Hat', 'category': 'Consumables', 'weight': 1}],
            [{'name': 'Black Hat', 'nx': 3200}], payload)
        self.assertEqual(set(goods), {'Black Hat'})
        self.assertEqual(set(cash), {'Black Hat'})
        self.assertEqual(comparison['cashReferenceWeights'][0]['referenceWeight'], 1)
        self.assertTrue(comparison['cashReferenceWeights'][0]['statRollKnown'])
        no_sales = {'items': [], 'rejectedItems': [{'name': 'bLaCk HaT', 'completedAttempt': True}]}
        _, _, excluded = rolling.comparable_inputs([], [{'name': 'Black Hat', 'nx': 3200}], no_sales)
        self.assertEqual(excluded['excludedCashItems'][0]['reason'], 'captured_item_has_no_eligible_sales')
        duplicate = self.payload(None)
        second = copy.deepcopy(duplicate['items'][0])
        second['result'].update(id=1082003, item='wOrK gLoVeS')
        duplicate['items'].append(second)
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            rolling.normalize_capture(duplicate)
        payload['items'].append({**item, 'name': 'BLACK HAT', 'id': 1802004})
        with self.assertRaisesRegex(ValueError, 'Ambiguous'):
            rolling.comparable_inputs([], [], payload)

    def test_v3_legacy_cash_unverified_preserves_published_history_bytes(self):
        legacy = {'sourceUrl': rolling.SOURCE, 'kind': 'rolling_scanner_reference',
                  'capturedAt': '2026-11-05T02:00:00Z', 'items': [
                      {'name': name, 'id': item_id, 'price': 50000, 'salesCounted': 5,
                       'windowDays': 3, 'salesPerHourProxy': 5/72}
                      for item_id, name in ((5000001, 'Pet A'), (5000002, 'Pet B'), (5000003, 'Pet C'))]}
        engine.atomic(self.root/'config.json', {'basket_version': 2})
        engine.atomic(self.root/'cache'/rolling.PROJECTION, legacy)
        original = {'at': legacy['capturedAt'], 'cpi': None, 'nxRate': 13.65173115963695,
                    'contentHash': 'published-legacy-hash', 'sourceUrl': rolling.SOURCE,
                    'timestampKind': 'captured_at', 'observationTimestampKnown': False}
        history_path = self.root/'cache/rolling-reference-history-v2.json'
        engine.atomic(history_path, [original])
        before, mtime = history_path.read_bytes(), history_path.stat().st_mtime_ns
        cash = [{'name': row['name'], 'nx': 5000} for row in legacy['items']]
        current, history = adapters.rolling_reference([], cash, self.root)
        self.assertIsNone(current['nxRateReference'])
        self.assertEqual(current['cashItems'], 0)
        self.assertEqual(current['comparison']['methodVersion'], 3)
        self.assertTrue(all(row['reason'] == 'cash_roll_metadata_unverified'
                            for row in current['comparison']['excludedCashItems']))
        self.assertTrue(all(not row['statRollKnown'] and row['statRollStatus'] == 'unknown_legacy'
                            and row['captureTimeKind'] == 'batch_timestamp_only' for row in current['items']))
        self.assertEqual(history, [original])
        self.assertEqual(history_path.read_bytes(), before)
        self.assertEqual(history_path.stat().st_mtime_ns, mtime)
        self.assertIn('Older aggregate points may lack roll identity', current['aggregateHistoryNote'])

    def known_plan(self, targets):
        plan = {'kind': 'offline_scanner_capture_request_plan', 'isCapture': False,
                'requestCount': len(targets), 'requests': [{'expectedItemId': item_id, 'expectedItemName': name} for item_id, name in targets]}
        plan['planHash'] = rolling._hash(plan)
        engine.atomic(self.root/'incoming/scanner-capture-plan.json', plan)
        return plan['planHash']

    def legacy_two(self):
        payload = {'sourceUrl': rolling.SOURCE, 'kind': 'rolling_scanner_reference', 'capturedAt': '2026-11-05T02:00:00Z',
                   'items': [{'name': name, 'id': item_id, 'price': 500, 'salesCounted': 5, 'windowDays': 3, 'salesPerHourProxy': 5/72}
                             for item_id, name in [(4010001, 'Ore A'), (4010002, 'Ore B')]]}
        engine.atomic(self.root/'cache'/rolling.PROJECTION, payload)
        return (self.root/'cache'/rolling.PROJECTION).read_bytes()

    def receipt(self, item_id, name, captured='2026-11-05T04:01:00Z', basis='median of sales', count=5):
        return {'expectedItemId': item_id, 'expectedItemName': name, 'capturedAt': captured,
                'result': {'id': item_id, 'item': name, 'typical_sale_price': 900, 'sales_counted': count,
                           'window_days': 3, 'stat_roll': None, 'price_basis': basis, 'listings_now': 5,
                           'cheapest_listing': {'price_each': 800, 'channel': 1, 'room': 2}}}

    def planned_batch(self, entries, plan_hash):
        return {'sourceUrl': rolling.SOURCE, 'captureStartedAt': '2026-11-05T04:00:00Z', 'capturedAt': '2026-11-05T04:03:00Z',
                'planHash': plan_hash, 'scannerFreshnessText': 'Maintenance; displayed scanner10h old; listings not confirmed open.', 'items': entries}

    def test_partial_known_plan_holds_projection_then_full_new_scope_publishes_without_losing_old_ids(self):
        original = self.legacy_two(); plan_hash = self.known_plan([(4010002, 'Ore B'), (4010003, 'Ore C')])
        first = self.receipt(4010002, 'Ore B'); second = self.receipt(4010003, 'Ore C', '2026-11-05T04:02:00Z')
        held = rolling.import_capture(self.root, self.planned_batch([first], plan_hash))
        self.assertEqual(held['intakeStatus']['status'], 'held'); self.assertEqual(held['intakeStatus']['missingTargetCount'], 1)
        self.assertEqual(held['capturedAt'], '2026-11-05T02:00:00Z')
        self.assertEqual((self.root/'cache'/rolling.PROJECTION).read_bytes(), original)
        complete = rolling.import_capture(self.root, self.planned_batch([first, second], plan_hash))
        self.assertEqual(complete['intakeStatus']['status'], 'published')
        self.assertEqual({item['id'] for item in complete['items']}, {4010002, 4010003})
        self.assertTrue(all(not item['availabilityConfirmed'] and item['sourceObservedAt'] is None for item in complete['items']))
        self.assertIn('scanner10h', complete['scannerFreshnessText'])
        with closing(sqlite3.connect(self.root/rolling.LEDGER)) as connection:
            self.assertEqual(connection.execute('SELECT COUNT(DISTINCT item_id) FROM observations').fetchone()[0], 3)
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM observations').fetchone()[0], 4)
        target = self.root/'cache'/rolling.PROJECTION; before = target.read_bytes(); modified = target.stat().st_mtime_ns
        rolling.import_capture(self.root, self.planned_batch([first, second], plan_hash))
        self.assertEqual(target.read_bytes(), before); self.assertEqual(target.stat().st_mtime_ns, modified)

    def test_full_plan_no_sales_and_asking_fallback_count_as_completed_but_never_sale_prices(self):
        self.legacy_two(); plan_hash = self.known_plan([(4010002, 'Ore B'), (4010003, 'Ore C')])
        result = rolling.import_capture(self.root, self.planned_batch([
            self.receipt(4010002, 'Ore B'), self.receipt(4010003, 'Ore C', basis='median asking price', count=0)], plan_hash))
        self.assertEqual(result['intakeStatus']['status'], 'published')
        self.assertEqual(result['intakeStatus']['verifiedAttemptCount'], 2)
        self.assertEqual(result['intakeStatus']['ineligibleVerifiedCount'], 1)
        self.assertEqual(len(result['items']), 1)
        self.assertEqual(result['rejectedItems'][0]['reason'], 'reported_no_eligible_sales')
        self.assertNotIn('price', result['rejectedItems'][0])
        _, _, comparison = rolling.comparable_inputs([{'name': 'Ore C', 'category': 'Materials', 'weight': 1}], [], result)
        self.assertEqual(comparison['excludedBasketItems'][0]['reason'], 'captured_item_has_no_eligible_sales')

    def test_complete_all_no_sales_is_receipt_only_and_keeps_projection_byte_identical(self):
        original = self.legacy_two(); plan_hash = self.known_plan([(4010002, 'Ore B'), (4010003, 'Ore C')])
        result = rolling.import_capture(self.root, self.planned_batch([
            self.receipt(4010002, 'Ore B', basis='no sales recorded in the window', count=0),
            self.receipt(4010003, 'Ore C', basis='median of asking prices', count=0)], plan_hash))
        status = result['intakeStatus']; self.assertEqual(status['status'], 'held')
        self.assertEqual(status['reason'], 'complete_receipt_only_no_eligible_sales')
        self.assertTrue(status['completeTargetScope']); self.assertEqual(status['missingTargetCount'], 0)
        self.assertEqual(status['eligibleSaleCount'], 0)
        self.assertEqual((self.root/'cache'/rolling.PROJECTION).read_bytes(), original)
        self.assertEqual(result['capturedAt'], '2026-11-05T02:00:00Z')
        with closing(sqlite3.connect(self.root/rolling.LEDGER)) as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM observations').fetchone()[0], 2)
            captures = [json.loads(row[0]) for row in connection.execute('SELECT payload FROM captures')]
            self.assertTrue(any(not capture['items'] and len(capture['rejectedItems']) == 2 for capture in captures))

    def test_errors_and_unknown_identity_remain_missing_and_cannot_create_ledger_or_new_projection(self):
        original = self.legacy_two(); plan_hash = self.known_plan([(4010002, 'Ore B'), (4010003, 'Ore C')])
        error = {'expectedItemId': 4010002, 'expectedItemName': 'Ore B', 'result': {'content': [{'type': 'text', 'text': 'OpeningRoom; timeout/auth failure'}]}}
        unknown = {'expectedItemId': 4010003, 'expectedItemName': 'Ore C', 'result': {'error': 'no item found'}}
        result = rolling.import_capture(self.root, self.planned_batch([error, unknown], plan_hash))
        self.assertEqual(result['intakeStatus']['status'], 'held'); self.assertEqual(result['intakeStatus']['missingTargetCount'], 2)
        self.assertEqual(result['intakeStatus']['verifiedAttemptCount'], 0)
        self.assertFalse((self.root/rolling.LEDGER).exists())
        self.assertEqual((self.root/'cache'/rolling.PROJECTION).read_bytes(), original)
        self.assertEqual(json.loads((self.root/rolling.STATUS).read_text())['status'], 'held')
        wrong = self.planned_batch([self.receipt(4010002, 'Ore B')], 'f'*64)
        with self.assertRaisesRegex(ValueError, 'planHash'): rolling.import_capture(self.root, wrong)
        self.assertFalse((self.root/rolling.LEDGER).exists())
        self.assertEqual((self.root/'cache'/rolling.PROJECTION).read_bytes(), original)

    def test_unplanned_partial_cannot_drop_prior_projection_items(self):
        original = self.legacy_two(); payload = self.planned_batch([self.receipt(4010002, 'Ore B')], '')
        del payload['planHash']
        result = rolling.import_capture(self.root, payload)
        self.assertEqual(result['intakeStatus']['status'], 'held')
        self.assertEqual(result['intakeStatus']['missingTargets'][0]['id'], 4010001)
        self.assertEqual((self.root/'cache'/rolling.PROJECTION).read_bytes(), original)

    def test_fixed_nx_cash_accepts_source_clean_or_explicit_null_not_upgraded_or_unknown(self):
        cash = [{'name': 'Black Hat', 'nx': 5000}, {'name': 'Pet', 'nx': 2500}, {'name': 'Upgraded', 'nx': 1000}, {'name': 'Legacy', 'nx': 1000}]
        items = [{'name': name, 'id': 1802003 if name == 'Black Hat' else 5000000+i, 'price': 50000, 'salesCounted': 5, 'windowDays': 2, 'salesPerHourProxy': proxy,
                  'statRollKnown': known, 'statRoll': roll}
                 for i, (name, known, roll, proxy) in enumerate([('Black Hat', True, 'Clean', 2), ('Pet', True, None, 1), ('Upgraded', True, '+3 ATT', 9), ('Legacy', False, None, 9)])]
        _, eligible, report = rolling.comparable_inputs([], cash, {'items': items})
        self.assertEqual(set(eligible), {'Black Hat', 'Pet'})
        weights = {row['name']: row['referenceWeight'] for row in report['cashReferenceWeights']}
        self.assertAlmostEqual(weights['Black Hat'], 2/3); self.assertAlmostEqual(weights['Pet'], 1/3)
        self.assertEqual(weights['Upgraded'], 0); self.assertEqual(weights['Legacy'], 0)
        self.assertEqual(report['methodVersion'], 3)
        self.assertEqual(report['cashCleanDefinitionSource'], 'https://mesos.watch/app.js')
        self.assertTrue(all(row['referenceWeight'] == 0 for row in report['excludedCashItems']))
        self.assertIsNone(rolling.comparison_reason({}, {'statRollKnown': True, 'statRoll': 'cLeAn'}, cash=True))
        self.assertEqual(rolling.comparison_reason({}, {'statRollKnown': True, 'statRoll': 'Clean · 2% crit rate'}, cash=True), 'cash_roll_may_include_upgrade_premium')


if __name__ == '__main__': unittest.main()
