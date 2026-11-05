import datetime as dt
import io,json,tempfile,unittest,urllib.error
from pathlib import Path
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import engine

class SourceRetryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.patch=patch.object(engine,'ROOT',self.root);self.patch.start()
        self.feed={'updatedAt':'2026-11-04T08:30:56Z','items':[{'n':str(n),'s':str(n),'k':'Scrolls','h':[['2026-11-03',100,5]]} for n in range(50)]}
        engine.atomic(self.root/'cache/market.json',self.feed)
        engine.atomic(self.root/'config.json',{'feed_url':'https://example.com/market.json'})
        engine.atomic(self.root/'cache/fetch.json',{'checkedAt':'2026-11-05T07:00:00+00:00','lastSuccessfulFetchAt':'2026-11-05T07:00:00+00:00','etag':'old'})
    def tearDown(self):
        self.patch.stop();self.tmp.cleanup()
    def fail(self,code,header=None):
        return urllib.error.HTTPError('https://example.com/market.json',code,'unavailable',{'Retry-After':header} if header is not None else {},io.BytesIO())
    def test_provider_errors_honor_seconds_and_date_without_fake_checks(self):
        for code,header in [(503,'1800'),(521,'Thu, 05 Nov 2026 08:30:00 GMT')]:
            with self.subTest(code=code):
                engine.atomic(self.root/'cache/fetch.json',{'lastSuccessfulFetchAt':'2026-11-05T07:00:00+00:00','etag':'old'})
                with patch('engine.now',return_value='2026-11-05T08:00:00+00:00'),patch('urllib.request.urlopen',side_effect=self.fail(code,header)):
                    feed,status=engine.fetch_feed()
                self.assertEqual(status['nextAllowedAt'],'2026-11-05T08:30:00+00:00')
                self.assertEqual(feed,self.feed)
                with patch('engine.now',return_value='2026-11-05T08:10:00+00:00'),patch('urllib.request.urlopen') as network:
                    _,cool=engine.fetch_feed()
                network.assert_not_called()
                self.assertEqual(cool['checkedAt'],'2026-11-05T08:00:00+00:00')
                self.assertEqual(cool['lastSuccessfulFetchAt'],'2026-11-05T07:00:00+00:00')
                self.assertEqual(engine.read(self.root/'cache/fetch.json'),status)
    def test_next_real_304_clears_cooldown_and_preserves_source(self):
        with patch('engine.now',return_value='2026-11-05T08:00:00+00:00'),patch('urllib.request.urlopen',side_effect=self.fail(503,'1800')):
            engine.fetch_feed()
        with patch('engine.now',return_value='2026-11-05T08:30:00+00:00'),patch('urllib.request.urlopen',side_effect=self.fail(304)) as network:
            feed,status=engine.fetch_feed()
        network.assert_called_once()
        self.assertEqual(status['status'],'unchanged');self.assertIsNone(status['nextAllowedAt'])
        self.assertEqual(status['lastSuccessfulFetchAt'],'2026-11-05T08:30:00+00:00')
        self.assertEqual(feed['updatedAt'],self.feed['updatedAt'])
    def test_offline_preserves_last_failure_without_claiming_check(self):
        with patch('engine.now',return_value='2026-11-05T08:00:00+00:00'),patch('urllib.request.urlopen',side_effect=TimeoutError()):
            engine.fetch_feed()
        with patch('urllib.request.urlopen') as network:
            _,status=engine.fetch_feed(True)
        network.assert_not_called();self.assertEqual(status['status'],'degraded')
        self.assertEqual(status['checkedAt'],'2026-11-05T08:00:00+00:00')
    def test_invalid_retry_values_do_not_manufacture_long_delay(self):
        checked='2026-11-05T08:00:00+00:00'
        for value in [None,'','nonsense','-1','inf','9'*200,'Wed, 04 Nov 2026 08:30:00 GMT']:
            self.assertIsNone(engine.source_retry_deadline(value,checked))
            self.assertEqual(engine.source_retry_deadline(value,checked,True),'2026-11-05T08:10:00+00:00')
        self.assertEqual(engine.source_retry_deadline('0',checked),checked)
    def test_source_regression_compares_actual_instants_across_timezone_offsets(self):
        for stamp,accepted in [('2026-11-04T04:00:00-05:00',True),('2026-11-04T10:00:00+02:00',False)]:
            with self.subTest(stamp=stamp):
                engine.atomic(self.root/'cache/market.json',self.feed)
                candidate={**self.feed,'updatedAt':stamp}
                response=io.BytesIO(json.dumps(candidate).encode());response.headers={}
                with patch('engine.now',return_value='2026-11-05T08:00:00+00:00'),patch('urllib.request.urlopen',return_value=response):
                    result,status=engine.fetch_feed()
                self.assertEqual(status['status'],'ok' if accepted else 'degraded')
                self.assertEqual(result['updatedAt'],stamp if accepted else self.feed['updatedAt'])
                self.assertEqual(engine.read(self.root/'cache/market.json')['updatedAt'],result['updatedAt'])

    def test_missing_cache_cooldown_does_not_hammer_or_manufacture_data(self):
        (self.root/'cache/market.json').unlink()
        with patch('engine.now',return_value='2026-11-05T08:00:00+00:00'),patch('urllib.request.urlopen',side_effect=self.fail(429)):
            with self.assertRaises(RuntimeError):engine.fetch_feed()
        with patch('engine.now',return_value='2026-11-05T08:01:00+00:00'),patch('urllib.request.urlopen') as network:
            with self.assertRaises(RuntimeError):engine.fetch_feed()
        network.assert_not_called()
if __name__=='__main__':unittest.main()

