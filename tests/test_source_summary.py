import copy
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import engine


STAMP = '2026-11-04T08:30:56+00:00'
SUMMARY = {'p': 123, 'p25': 100, 'p75': 150, 'lo': 10, 'hi': 999,
           'ask': 175, 'asks': 0, 'sellers': 12, 'st': .75,
           'last': '2026-11-04T08:45:00Z'}


class SourceSummaryTests(unittest.TestCase):
    def test_source_semantics_and_reported_time_are_preserved(self):
        summary = engine.source_summary(SUMMARY, STAMP)
        self.assertEqual(summary, {
            'sourceUpdatedAt': STAMP, 'window': 'unspecified_source_summary',
            'kind': 'source_published_summary', 'medianSale': 123, 'p25': 100, 'p75': 150,
            'lowSale': 10, 'highSale': 999, 'medianSellerAsk': 175, 'listings': 0,
            'sellers': 12, 'sellThrough': .75, 'reportedLastSaleAt': SUMMARY['last']})
        self.assertNotIn('bid', summary)
        self.assertNotIn('trades', summary)

    def test_invalid_optional_fields_become_null_without_throwing(self):
        bad = {'p': False, 'p25': float('inf'), 'p75': -1, 'lo': 0, 'hi': float('nan'),
               'ask': '175', 'asks': 1.5, 'sellers': 9007199254740992,
               'st': 1.01, 'last': '2026-11-04T08:30:00+00:99'}
        summary = engine.source_summary(bad, STAMP)
        for key in ('medianSale', 'p25', 'p75', 'lowSale', 'highSale', 'medianSellerAsk',
                    'listings', 'sellers', 'sellThrough', 'reportedLastSaleAt'):
            self.assertIsNone(summary[key], key)
        self.assertIsNone(engine.source_summary({'p': 10**1000}, STAMP)['medianSale'])
        self.assertEqual(engine.source_summary({'st': 0, 'asks': 0, 'sellers': 0}, STAMP)['sellThrough'], 0)

    def test_rows_cash_and_context_use_current_feed_summary_not_daily_history(self):
        project = engine.ROOT
        feed = engine.read(project / 'cache' / 'market.json')
        cfg = engine.read(project / 'config.json')
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(engine, 'ROOT', Path(temp)):
                engine.atomic(Path(temp) / 'config.json', cfg)
                before = engine.compute(copy.deepcopy(feed), {'status': 'cached'})
                modified = copy.deepcopy(feed)
                by_slug = {item['s']: item for item in modified['items']}
                for row in [before['rows'][0], before['cash'][0], before['contextItems'][0]]:
                    by_slug[row['slug']].update(SUMMARY)
                report = engine.compute(modified, {'status': 'cached'})
                for key in ('rows', 'cash', 'contextItems'):
                    row = report[key][0]
                    old = before[key][0]
                    self.assertEqual(row['price'], old['price'])
                    self.assertNotEqual(row['price'], row['sourceSummary']['medianSale'])
                    self.assertEqual(row['sourceSummary'], engine.source_summary(SUMMARY, feed['updatedAt']))
                # Invalid optional summary fields must not invalidate an established index.
                by_slug[report['rows'][0]['slug']].update({'p': float('nan'), 'asks': -1, 'last': 'bad'})
                after = engine.compute(modified, {'status': 'cached'})
                self.assertIsNone(after['rows'][0]['sourceSummary']['medianSale'])
                self.assertIsNone(after['rows'][0]['sourceSummary']['listings'])
                self.assertEqual(after['latest']['cpi'], report['latest']['cpi'])

    @unittest.skipUnless(shutil.which('node'), 'Node is needed for Worker/Python parity')
    def test_worker_and_python_optional_field_parity(self):
        cases = [SUMMARY, {}, {'p': False, 'ask': '5', 'asks': -1, 'sellers': 1.5, 'st': True},
                 {'p': 1e300, 'asks': 9007199254740991, 'sellers': 0, 'st': 0,
                  'last': '2026-11-04T08:30:00.123456789-06:00'},
                 {'last': '2026-02-30T08:30:00Z'}, {'last': '2026-11-04T08:30:00+00:99'},
                 {'last': '2026-11-04T08:30:00'}, {'last': '2026-11-04T08:30:00+23:59'}]
        module = (engine.ROOT / 'ops' / 'worker-core.mjs').as_uri()
        script = (f'import {{sourceSummary}} from {json.dumps(module)};'
                  'let body=""; for await (const chunk of process.stdin) body+=chunk;'
                  f'process.stdout.write(JSON.stringify(JSON.parse(body).map(item=>sourceSummary(item,{json.dumps(STAMP)}))));')
        result = subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps(cases),
                                text=True, capture_output=True, check=True)
        self.assertEqual(json.loads(result.stdout), [engine.source_summary(item, STAMP) for item in cases])


if __name__ == '__main__':
    unittest.main()
