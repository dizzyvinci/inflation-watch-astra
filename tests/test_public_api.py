import io
import urllib.error
import unittest
from unittest.mock import patch
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from public_api import PublicMarketClient


class PublicTransportTests(unittest.TestCase):
    def test_no_key_makes_no_network_request(self):
        with patch('urllib.request.urlopen') as network:
            result=PublicMarketClient('').get('/api/prices')
        self.assertEqual(result['status'],'requires_api_key');network.assert_not_called()
    def test_unreviewed_route_rejected(self):
        with self.assertRaises(ValueError):PublicMarketClient('test').get('/api/me')
    def test_denied_key_stops_repeated_requests(self):
        client=PublicMarketClient('test-only-fixture')
        error=urllib.error.HTTPError('https://maplestory.market/api/prices',401,'Unauthorized',{},io.BytesIO())
        with patch('urllib.request.urlopen',side_effect=error) as network:
            self.assertEqual(client.get('/api/prices')['status'],'authentication_denied')
            self.assertEqual(client.get('/api/prices')['status'],'authentication_denied')
            self.assertEqual(network.call_count,1)
    def test_retry_after_honored(self):
        client=PublicMarketClient('test-only-fixture')
        error=urllib.error.HTTPError('https://maplestory.market/api/prices',429,'Too many',{'Retry-After':'1800'},io.BytesIO())
        with patch('urllib.request.urlopen',side_effect=error),patch('time.time',return_value=10000):
            result=client.get('/api/prices')
        self.assertEqual(result['retryAt'],11800)
        with patch('urllib.request.urlopen') as network,patch('time.time',return_value=10500):
            self.assertEqual(client.get('/api/status')['status'],'backoff');network.assert_not_called()
    def test_errors_do_not_expose_credentials(self):
        client=PublicMarketClient('sensitive-test-fixture')
        with patch('urllib.request.urlopen',side_effect=RuntimeError('sensitive-test-fixture')):
            result=client.get('/api/prices')
        self.assertNotIn('sensitive-test-fixture',str(result));self.assertEqual(result['status'],'unavailable')

if __name__=='__main__':unittest.main()
