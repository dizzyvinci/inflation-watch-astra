import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import adapters
import engine
import smega_history as history


class SmegaHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def table(self, stamp='2026-11-05T02:10:54.740Z', sell='1:20 (19–21) · 2', rows=None):
        return {'sourceUrl': history.SOURCE, 'capturedAt': stamp, 'year': 2026,
                'utcOffsetMinutes': -360, 'displayTimeZone': 'America/Chicago',
                'rows': rows if rows is not None else [['Nov 4, 07:00 PM', sell, '1:13 (12–14) · 3']],
                'summary': {'sellerRate': 20, 'sellerPosters': 2, 'buyerRate': 13,
                            'buyerPosters': 3, 'windowHours': 8}}

    def ingest(self, payload):
        return history.import_capture(self.root, payload, adapters.normalize_smega_table(payload),
                                      normalize_raw=adapters.normalize_smega_table, raw_paths=[])

    def ledger(self):
        return engine.read(self.root / 'cache' / history.LEDGER)

    def test_first_import_keeps_raw_aggregate_and_latest_materialized_contract(self):
        payload = self.table()
        payload['senderId'] = 'must-not-be-retained'
        payload['summary']['senderNames'] = ['must-not-be-retained']
        points = self.ingest(payload)
        self.assertEqual(points, adapters.normalize_smega_table(payload))
        ledger = self.ledger()
        self.assertEqual(len(ledger['captures']), 1)
        self.assertEqual(len(ledger['buckets']), 2)
        self.assertEqual(ledger['captures'][0]['rawCaptures'][0]['rows'], payload['rows'])
        self.assertNotIn('must-not-be-retained', json.dumps(ledger))
        self.assertEqual(engine.read(self.root / 'cache' / history.SERIES), points)

    def test_replay_is_byte_idempotent(self):
        payload = self.table()
        first = self.ingest(payload)
        before = (self.root / 'cache' / history.LEDGER).read_bytes()
        again = self.ingest(copy.deepcopy(payload))
        self.assertEqual(first, again)
        self.assertEqual(before, (self.root / 'cache' / history.LEDGER).read_bytes())
        self.assertEqual(sum(len(bucket['revisions']) for bucket in self.ledger()['buckets']), 2)

    def test_revision_replaces_latest_bucket_but_retains_prior_values_and_captures(self):
        self.ingest(self.table())
        later = self.table('2026-11-05T03:10:00Z', '1:21 (20–22) · 5')
        points = self.ingest(later)
        sell = next(point for point in points if point['side'] == 'sell')
        self.assertEqual((sell['rate'], sell['sampleCount'], sell['capturedAt']), (21, 5, later['capturedAt']))
        revisions = next(bucket['revisions'] for bucket in self.ledger()['buckets'] if bucket['side'] == 'sell')
        self.assertEqual([point['rate'] for point in revisions], [20, 21])
        self.assertEqual(len(self.ledger()['captures']), 2)

    def test_partial_update_and_out_of_order_capture_preserve_other_buckets(self):
        latest = self.table('2026-11-05T03:10:00Z', rows=[['Nov 4, 07:00 PM', '1:22 (21–23) · 5', '—']])
        self.ingest(latest)
        older = self.table('2026-11-05T02:10:00Z', rows=[
            ['Nov 4, 07:00 PM', '1:20 (19–21) · 2', '1:13 (12–14) · 3'],
            ['Nov 4, 06:00 PM', '1:19 (18–20) · 4', '—']])
        points = self.ingest(older)
        self.assertEqual(len(points), 3)
        newest_sell = next(point for point in points if point['side'] == 'sell' and point['at'].startswith('2026-11-05T01'))
        self.assertEqual(newest_sell['rate'], 22)
        self.assertEqual(engine.read(self.root / 'cache' / history.SUMMARY)['capturedAt'], latest['capturedAt'])

    def test_same_capture_conflict_rejects_atomically(self):
        self.ingest(self.table())
        before = {name: (self.root / 'cache' / name).read_bytes() for name in (history.LEDGER, history.SERIES, history.SUMMARY)}
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            self.ingest(self.table(sell='1:22 (21–23) · 2'))
        for name, value in before.items():
            self.assertEqual((self.root / 'cache' / name).read_bytes(), value)

    def test_missing_capture_is_not_replaced_with_build_import_or_bucket_time(self):
        payload = self.table()
        del payload['capturedAt']
        with self.assertRaises(ValueError):
            adapters.normalize_smega_table(payload)
        points = adapters.normalize_smega_table(self.table())
        points[0].pop('capturedAt')
        engine.atomic(self.root / 'dist' / 'data-old.json', {'builtAt': '2026-11-05T03:00:00Z', 'smega': points})
        ledger, stats = history.migrate_history(self.root, raw_paths=[], dry_run=True)
        self.assertEqual(stats['unverifiablePointsSkipped'], 1)
        self.assertEqual(len(history.materialize(ledger)), 1)
        self.assertFalse((self.root / 'cache' / history.LEDGER).exists())

    def test_verified_public_snapshots_and_raw_tables_recover_only_aggregate_history(self):
        old = self.table()
        points = adapters.normalize_smega_table(old)
        unapproved = dict(points[0], sourceUrl='https://other.example/source', senderId='not-imported')
        unrelated = {'kind': 'smega_ask', 'sourceUrl': history.SOURCE, 'senderId': 'not-imported'}
        engine.atomic(self.root / 'dist' / 'data-first.json', {'smega': points + [unapproved, unrelated], 'smegaSource': old})
        engine.atomic(self.root / 'dist' / 'data-repeat.json', {'smega': points})
        newer = self.table('2026-11-05T03:10:00Z', '1:22 (21–23) · 5')
        raw_path = self.root / 'raw-table.json'
        engine.atomic(raw_path, newer)
        ledger, stats = history.migrate_history(self.root, normalize_raw=adapters.normalize_smega_table,
                                              raw_paths=[raw_path], dry_run=False)
        self.assertEqual((stats['captures'], stats['buckets'], stats['revisions']), (2, 2, 4))
        self.assertEqual((stats['snapshotsRead'], stats['rawTablesRead']), (2, 1))
        self.assertNotIn('not-imported', json.dumps(ledger))
        self.assertEqual(next(point['rate'] for point in history.materialize(ledger) if point['side'] == 'sell'), 22)
        self.assertTrue(any(entry['kind'] == 'canonical_public_snapshot' for entry in ledger['captures'][0]['provenance']))

    def test_first_adapter_import_recovers_older_canonical_buckets(self):
        older = self.table(rows=[['Nov 4, 06:00 PM', '1:19 (18–20) · 4', '—']])
        engine.atomic(self.root / 'dist' / 'data-old.json', {'smega': adapters.normalize_smega_table(older)})
        path = self.root / 'incoming.json'
        engine.atomic(path, self.table('2026-11-05T03:10:00Z'))
        with patch.object(adapters, 'ROOT', self.root):
            result = adapters.import_smega_table(path)
        self.assertEqual(len(result), 3)
        self.assertEqual(len(self.ledger()['captures']), 2)

    def test_sources_and_sides_never_collapse_into_one_identity(self):
        payload = self.table()
        points = adapters.normalize_smega_table(payload)
        ledger = history.add_capture(history.empty_ledger(), payload, points)
        other = dict(payload, sourceUrl='https://other.example/published')
        other_points = [dict(point, sourceUrl=other['sourceUrl'], rate=15, p25=14, p75=16) for point in points]
        ledger = history.add_capture(ledger, other, other_points)
        self.assertEqual(len(ledger['captures']), 2)
        self.assertEqual(len(history.materialize(ledger)), 4)

    def test_overlapping_import_does_not_delete_another_imports_lock(self):
        lock = self.root / 'cache' / '.smega-history.lock'
        lock.parent.mkdir()
        lock.write_text('other importer', encoding='utf-8')
        with self.assertRaises(RuntimeError):
            self.ingest(self.table())
        self.assertEqual(lock.read_text(encoding='utf-8'), 'other importer')

    def test_replay_repairs_materialized_file_after_write_failure_without_duplicate_revision(self):
        self.ingest(self.table())
        later = self.table('2026-11-05T03:10:00Z', '1:22 (21–23) · 5')
        real_atomic = history.atomic
        def failing_atomic(path, value):
            if path.name == history.SERIES:
                raise OSError('simulated materialization failure')
            real_atomic(path, value)
        with patch.object(history, 'atomic', failing_atomic):
            with self.assertRaises(OSError):
                self.ingest(later)
        self.assertEqual(next(point['rate'] for point in engine.read(self.root / 'cache' / history.SERIES)
                              if point['side'] == 'sell'), 20)
        points = self.ingest(later)
        self.assertEqual(next(point['rate'] for point in points if point['side'] == 'sell'), 22)
        self.assertEqual(sum(len(bucket['revisions']) for bucket in self.ledger()['buckets']), 4)


if __name__ == '__main__':
    unittest.main()
