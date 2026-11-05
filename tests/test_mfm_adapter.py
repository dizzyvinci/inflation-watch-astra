import copy
import datetime as dt
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import mfm_adapter as mfm


class OwnDataTests(unittest.TestCase):
    def setUp(self):
        self.con = mfm.connect(':memory:')
        self.now = dt.datetime(2026, 11, 5, 2, 30, tzinfo=mfm.UTC)
        self.source = 'https://own.example.test'
        self.seed = {'items': [{'n': 'Iron Ore', 's': 'iron-ore'}, {'n': 'Leather', 's': 'leather'}]}

    def tearDown(self):
        self.con.close()

    def row(self, uid='a', seq=1, minutes=10, **changes):
        sale = mfm.iso((self.now-dt.timedelta(minutes=minutes)).timestamp())
        row = {'uid': uid, 'seq': seq, 'ts': '2026-11-05T01:00:00Z',
               'last_seen': sale, 'item': 'Iron Ore', 'price': 100, 'qty': 1,
               'sold': 1, 'sold_ts': sale, 'evidence': 'sold', 'seller': 'PRIVATE NAME'}
        row.update(changes)
        return row

    def delta(self, *rows, seq=None, **changes):
        payload = {'authorized': True, 'recordModel': mfm.MODEL,
                   'priceUnit': 'mesos_per_unit', 'sourceUrl': self.source,
                   'seq': seq if seq is not None else max((r['seq'] for r in rows), default=0),
                   'sightings': list(rows)}
        payload.update(changes)
        return payload

    def apply(self, payload):
        return mfm.apply_delta(self.con, payload, self.now)

    def build(self, now=None):
        return mfm.build_observations(self.con, self.source, self.seed, now or self.now)

    def test_uid_dedup_revision_and_old_replay(self):
        initial = self.delta(self.row())
        self.apply(initial)
        self.apply(initial)
        self.assertEqual(self.build()['items'][0]['quantity'], 1)
        self.apply(self.delta(self.row(seq=2, price=300, qty=4)))
        self.apply(initial)
        self.assertEqual(self.build()['items'][0]['price'], 300)
        self.assertEqual(self.build()['items'][0]['quantity'], 4)

    def test_conflicting_revision_rolls_back_whole_delta(self):
        self.apply(self.delta(self.row()))
        with self.assertRaises(ValueError):
            self.apply(self.delta(self.row(uid='b', seq=2), self.row(price=500)))
        self.assertEqual(self.con.execute('SELECT COUNT(*) FROM sightings').fetchone()[0], 1)

    def test_asks_unknown_and_ambiguous_names_excluded(self):
        self.apply(self.delta(self.row(), self.row(uid='b', seq=2, item='Unknown'),
                              self.row(uid='c', seq=3, sold=0, sold_ts=None, evidence='ask')))
        self.assertEqual(len(self.build()['items']), 1)
        self.assertEqual(self.build()['items'][0]['quantity'], 1)
        self.seed['items'].append({'n': 'Iron Ore', 's': 'ambiguous'})
        self.assertIsNone(self.build())

    def test_explicit_quantity_uid_and_unit_evidence_required(self):
        for field in ('qty', 'uid', 'seq', 'evidence', 'sold_ts', 'last_seen'):
            row = self.row()
            del row[field]
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.apply(self.delta(row, seq=1))
        for field in ('authorized', 'recordModel', 'priceUnit', 'sourceUrl'):
            payload = self.delta(self.row())
            del payload[field]
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.apply(payload)
        for field in ('qty', 'price'):
            for invalid in (0, -1, 1.5, True, '2'):
                with self.subTest(field=field, invalid=invalid), self.assertRaises(ValueError):
                    self.apply(self.delta(self.row(**{field: invalid})))

    def test_stale_future_and_naive_timestamps(self):
        self.apply(self.delta(self.row(minutes=41)))
        self.assertIsNone(self.build())
        for stamp in ('2026-11-05T02:31:00Z', '2026-11-05T02:20:00', '2026-11-05T02:20:00+01:00'):
            with self.subTest(stamp=stamp), self.assertRaises(ValueError):
                self.apply(self.delta(self.row(uid='b', seq=2, sold_ts=stamp)))

    def test_weighted_median_and_even_boundary(self):
        self.apply(self.delta(self.row(price=100, qty=1), self.row(uid='b', seq=2, price=500, qty=3)))
        self.assertEqual(self.build()['items'][0]['price'], 500)
        self.apply(self.delta(self.row(seq=3, price=100, qty=3)))
        self.assertEqual(self.build()['items'][0]['price'], 300)
        self.assertEqual(self.build()['items'][0]['quantity'], 6)

    def test_import_time_never_refreshes_observation_clock(self):
        payload = self.delta(self.row(minutes=20), self.row(uid='b', seq=2, minutes=5, item='Leather'))
        self.apply(payload)
        before = self.build()
        later = self.now + dt.timedelta(minutes=3)
        mfm.apply_delta(self.con, payload, later)
        after = self.build(later)
        self.assertEqual(before['observedAt'], '2026-11-05T02:10:00Z')
        self.assertEqual(before['observedAt'], after['observedAt'])
        self.assertEqual(before['items'], after['items'])
        self.assertNotIn('PRIVATE NAME', json.dumps(after))
        self.assertIsNone(self.build(self.now+dt.timedelta(minutes=41)))

    def test_retraction_tombstone_prevents_old_replay(self):
        original = self.delta(self.row())
        self.apply(original)
        self.apply(self.delta(seq=2, retractions=[{'uid': 'a', 'seq': 2}]))
        self.apply(original)
        self.assertIsNone(self.build())
        self.apply(self.delta(self.row(seq=3, price=200)))
        self.assertEqual(self.build()['items'][0]['price'], 200)

    def test_sold_revision_to_ask_removes_sale(self):
        self.apply(self.delta(self.row()))
        self.apply(self.delta(self.row(seq=2, sold=0, sold_ts=None, evidence='ask')))
        self.assertIsNone(self.build())

    def test_fractional_timestamps_keep_earliest_actual_sale(self):
        self.apply(self.delta(self.row(sold_ts='2026-11-05T02:20:00Z'),
                              self.row(uid='b', seq=2, item='Leather', sold_ts='2026-11-05T02:20:00.001Z')))
        self.assertEqual(self.build()['observedAt'], '2026-11-05T02:20:00Z')

    def test_first_time_purge_and_unknown_retraction(self):
        self.apply(self.delta(self.row()))
        self.apply(self.delta(seq=2, retractions=[{'uid': 'future-page', 'seq': 2}]))
        self.apply(self.delta(self.row(uid='future-page', seq=1)))
        self.assertEqual(self.build()['items'][0]['quantity'], 1)
        purge = {'id': 2, 'ts': '2026-11-05T02:30:00Z', 'what': 'prices,megaphones',
                 'field': 'first', 'start': '2026-11-05T00:00:00Z', 'end': '2026-11-05T01:01:00Z'}
        self.apply(self.delta(seq=2, purges=[purge]))
        self.assertIsNone(self.build())

    def test_durable_purge_and_idempotence(self):
        original = self.delta(self.row(), self.row(uid='b', seq=2, item='Leather', minutes=5))
        self.apply(original)
        purge = {'id': 1, 'ts': '2026-11-05T02:30:00Z', 'what': 'prices', 'field': 'seen',
                 'start': '2026-11-05T02:19:00Z', 'end': '2026-11-05T02:21:00Z'}
        self.apply(self.delta(seq=2, purges=[purge]))
        self.apply(self.delta(seq=2, purges=[purge]))
        # Old page has original active state; purge is still enforced.
        self.apply(original)
        self.assertEqual([r['slug'] for r in self.build()['items']], ['leather'])
        changed = copy.deepcopy(purge)
        changed['end'] = '2026-11-05T02:26:00Z'
        with self.assertRaises(ValueError):
            self.apply(self.delta(seq=2, purges=[changed]))

    def test_atomic_publication_removes_retracted_output_and_protects_other_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'observations.json'
            self.apply(self.delta(self.row()))
            mfm.publish(path, self.build(), self.source)
            self.assertEqual(json.loads(path.read_text())['kind'], 'scanner_sales')
            mfm.publish(path, None, self.source)
            self.assertFalse(path.exists())
            path.write_text('{"adapter":"another","sourceUrl":"https://other.test"}')
            with self.assertRaises(ValueError):
                mfm.publish(path, self.build(), self.source)

    def test_payload_accepted_by_engine_without_claiming_nx_coverage(self):
        import engine
        self.now = dt.datetime.now(mfm.UTC)
        self.apply(self.delta(self.row()))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            mfm.publish(root/'incoming'/'observations.json', self.build(), self.source)
            cfg = {'minimum_live_coverage': .8, 'minimum_nx_live_items': 3,
                   'minimum_nx_live_coverage': .6}
            basket = {'rows': [{'slug': 'iron-ore', 'weight': 1, 'basePrice': 100}]}
            with patch.object(engine, 'ROOT', root):
                live, note = engine.load_live(cfg, basket, {'iron-ore': {}}, [])
            self.assertEqual(live['cpi'], 100)
            self.assertIsNone(live['nxRate'])


if __name__ == '__main__':
    unittest.main()
