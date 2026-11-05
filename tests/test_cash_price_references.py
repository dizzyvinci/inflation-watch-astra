import copy
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from cash_price_references import LEDGER, PROJECTION, _hash, import_capture, load_projection


def plan():
    value = {'schemaVersion': 1, 'kind': 'supplemental_cash_rolling_capture_plan', 'sourceUrl': 'https://mesos.watch/',
             'editionId': 'fixture_edition', 'scope': 'fixture_cash_rewards', 'expectedItemCount': 2,
             'officialAnnouncement': {'pageUrl': 'https://official.example/edition'}, 'probabilitySource': {'pageUrl': 'https://official.example/rates'},
             'requests': [{'expectedItemId': 1007133, 'expectedItemName': 'Teddy Bear Headgear'}, {'expectedItemId': 1007074, 'expectedItemName': 'Woodsman Hat'}], 'unresolved': []}
    value['planHash'] = _hash(value)
    return value


def receipt(item_id=1007133, name='Teddy Bear Headgear', at='2026-11-04T12:00:00Z', price=54999, roll='Clean'):
    raw = {'id': item_id, 'item': name, 'currency': 'mesos', 'typical_sale_price': price, 'sales_counted': 330,
           'window_days': 30, 'stat_roll': roll, 'price_basis': 'median of sales', 'site': 'https://mesos.watch/',
           'listings_now': 493, 'cheapest_listing': {'price_each': 30000, 'channel': 7, 'room': 7, 'owner': 'DO_NOT_COPY'}}
    return {'sourceUrl': 'https://mesos.watch/', 'capturedAt': at, 'expectedItemId': item_id, 'expectedItemName': name,
            'result': json.dumps({'content': [{'type': 'text', 'text': json.dumps(raw)}]})}


class CashReferences(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.plan = plan()

    def tearDown(self):
        self.tmp.cleanup()

    def test_real_shape_nested_receipt_unknown_source_clocks_and_no_identity_leak(self):
        result = import_capture(receipt(), self.plan, self.root)
        value = load_projection(self.root)
        self.assertEqual((result['capturedItemCount'], result['plannedItemCount'], result['completePlan']), (1, 2, False))
        row = value['items'][0]
        self.assertEqual((row['price'], row['salesCounted'], row['windowDays'], row['statRoll']), (54999, 330, 30, 'Clean'))
        self.assertEqual(row['capturedAt'], '2026-11-04T12:00:00Z')
        self.assertIsNone(row['sourceObservedAt'])
        self.assertFalse(row['qualityConstant'])
        self.assertFalse(row['headlineEligible'])
        self.assertFalse(row['dailyHistoryEligible'])
        self.assertFalse(row['cheapestListing']['availabilityConfirmed'])
        self.assertNotIn('owner', row['cheapestListing'])
        self.assertNotIn('DO_NOT_COPY', json.dumps(value))

    def test_partial_append_preserves_other_last_good_and_replay_bytes(self):
        import_capture(receipt(), self.plan, self.root)
        second = receipt(1007074, 'Woodsman Hat', '2026-11-04T12:01:00Z', 12345, None)
        value = import_capture(second, self.plan, self.root)['projection']
        self.assertEqual(value['capturedItemCount'], 2)
        self.assertFalse(value['latestBatch']['completePlan'], 'Two partial batches are not a claimed single complete capture')
        self.assertTrue(value['mixedCaptureTimes'])
        before = (self.root / PROJECTION).read_bytes()
        modified = (self.root / PROJECTION).stat().st_mtime_ns
        self.assertFalse(import_capture(second, self.plan, self.root)['projectionChanged'])
        self.assertEqual((self.root / PROJECTION).read_bytes(), before)
        self.assertEqual((self.root / PROJECTION).stat().st_mtime_ns, modified)
        with sqlite3.connect(self.root / LEDGER) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM captures').fetchone()[0], 2)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM observations').fetchone()[0], 2)

    def test_older_capture_not_false_refresh_and_variants_retained(self):
        import_capture(receipt(at='2026-11-04T12:00:00Z'), self.plan, self.root)
        value = import_capture(receipt(at='2026-11-04T11:00:00Z', price=90000, roll='+3 ATT'), self.plan, self.root)['projection']
        self.assertEqual(value['items'][0]['price'], 54999)
        self.assertEqual(value['items'][0]['capturedAt'], '2026-11-04T12:00:00Z')
        self.assertEqual(value['latestBatch']['capturedAt'], '2026-11-04T12:00:00Z')
        with sqlite3.connect(self.root / LEDGER) as db:
            self.assertEqual(db.execute('SELECT COUNT(DISTINCT variant_key) FROM observations').fetchone()[0], 2)

    def test_verified_no_sales_receipt_cannot_replace_sale_with_ask(self):
        import_capture(receipt(), self.plan, self.root)
        no_sales = receipt(at='2026-11-04T12:02:00Z')
        no_sales['result'] = {'id': 1007133, 'item': 'Teddy Bear Headgear', 'sales_counted': 0, 'price_basis': 'median asking price', 'typical_sale_price': 999999}
        value = import_capture(no_sales, self.plan, self.root)['projection']
        self.assertEqual(value['items'][0]['price'], 54999)
        self.assertEqual(value['items'][0]['capturedAt'], '2026-11-04T12:00:00Z')
        self.assertEqual(value['latestBatch']['noEligibleSalesCount'], 1)

    def test_full_scope_and_per_item_bounds(self):
        a, b = receipt(), receipt(1007074, 'Woodsman Hat', '2026-11-04T12:01:00Z', 12345)
        payload = {'sourceUrl': 'https://mesos.watch/', 'capturedAt': b['capturedAt'], 'captureStartedAt': a['capturedAt'],
                   'captureCompletedAt': b['capturedAt'], 'planHash': self.plan['planHash'], 'items': [a, b]}
        value = import_capture(payload, self.plan, self.root)['projection']
        self.assertTrue(value['latestBatch']['completePlan'])
        payload['items'][0]['capturedAt'] = '2026-11-04T11:59:00Z'
        previous = (self.root / PROJECTION).read_bytes()
        with self.assertRaises(ValueError):
            import_capture(payload, self.plan, self.root)
        self.assertEqual((self.root / PROJECTION).read_bytes(), previous)

    def test_bad_identity_plan_asking_and_future_reject_before_ledger(self):
        cases = []
        bad = receipt(); bad['expectedItemId'] = 1; cases.append((bad, self.plan))
        bad = receipt(); bad['result'] = {'id': 1007133, 'item': 'Not Teddy', 'price_basis': 'median of sales', 'typical_sale_price': 1, 'sales_counted': 1}; cases.append((bad, self.plan))
        bad = receipt(); bad['result'] = {'id': 1007133, 'item': 'Teddy Bear Headgear', 'price_basis': 'median asking price', 'typical_sale_price': 999, 'sales_counted': 3}; cases.append((bad, self.plan))
        bad_plan = copy.deepcopy(self.plan); bad_plan['requests'][0]['expectedItemId'] = 9; cases.append((receipt(), bad_plan))
        cases.append((receipt(at='2099-01-01T00:00:00Z'), self.plan))
        for payload, expected in cases:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    import_capture(payload, expected, self.root)
                self.assertFalse((self.root / LEDGER).exists())

    def test_projection_integrity(self):
        import_capture(receipt(), self.plan, self.root)
        value = load_projection(self.root); value['items'][0]['price'] = 42
        (self.root / PROJECTION).write_text(json.dumps(value))
        with self.assertRaises(ValueError):
            load_projection(self.root)


if __name__ == '__main__':
    unittest.main()
