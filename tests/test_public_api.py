import io
import json
import tempfile
import threading
import email.message
import urllib.request
import urllib.response
import urllib.error
import unittest
from unittest.mock import patch
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import public_api
from public_api import PublicMarketClient, refresh, collector_lock


class PublicTransportTests(unittest.TestCase):
    def test_no_key_makes_no_network_request(self):
        with patch('public_api.open_request') as network:
            result=PublicMarketClient('').get('/api/prices')
        self.assertEqual(result['status'],'requires_api_key');network.assert_not_called()
    def test_unreviewed_route_rejected(self):
        with self.assertRaises(ValueError):PublicMarketClient('test').get('/api/me')
    def test_denied_key_stops_repeated_requests(self):
        client=PublicMarketClient('test-only-fixture')
        error=urllib.error.HTTPError('https://maplestory.market/api/prices',401,'Unauthorized',{},io.BytesIO())
        with patch('public_api.open_request',side_effect=error) as network:
            self.assertEqual(client.get('/api/prices')['status'],'authentication_denied')
            self.assertEqual(client.get('/api/prices')['status'],'authentication_denied')
            self.assertEqual(network.call_count,1)
    def test_retry_after_honored(self):
        client=PublicMarketClient('test-only-fixture')
        error=urllib.error.HTTPError('https://maplestory.market/api/prices',429,'Too many',{'Retry-After':'1800'},io.BytesIO())
        with patch('public_api.open_request',side_effect=error),patch('time.time',return_value=10000):
            result=client.get('/api/prices')
        self.assertEqual(result['retryAt'],11800)
        with patch('public_api.open_request') as network,patch('time.time',return_value=10500):
            self.assertEqual(client.get('/api/status')['status'],'backoff');network.assert_not_called()
    def test_errors_do_not_expose_credentials(self):
        client=PublicMarketClient('sensitive-test-fixture')
        with patch('public_api.open_request',side_effect=RuntimeError('sensitive-test-fixture')):
            result=client.get('/api/prices')
        self.assertNotIn('sensitive-test-fixture',str(result));self.assertEqual(result['status'],'unavailable')

    def test_redirect_handler_never_forwards_authorization(self):
        original=urllib.request.build_opener
        for location in ['https://unrelated.example/private','https://maplestory.market/api/status']:
            requests=[]
            class FixtureHTTPS(urllib.request.HTTPSHandler):
                def https_open(self,request):
                    requests.append(request)
                    if len(requests)>1:raise AssertionError('Redirect was followed')
                    headers=email.message.Message();headers['Location']=location
                    response=urllib.response.addinfourl(io.BytesIO(b'{}'),headers,request.full_url,302)
                    response.msg='Found'
                    return response
            with patch('urllib.request.build_opener',side_effect=lambda *handlers:original(*handlers,FixtureHTTPS())):
                result=PublicMarketClient('test-redirect-secret').get('/api/prices')
            self.assertEqual(len(requests),1)
            self.assertEqual(requests[0].get_header('Authorization'),'Bearer test-redirect-secret')
            self.assertEqual(result['status'],'unavailable');self.assertEqual(result['httpStatus'],302)
            self.assertNotIn('test-redirect-secret',str(result))

    def test_retry_after_http_date_and_missing_header(self):
        for headers,expected in [({'Retry-After':'Thu, 01 Jan 1970 03:16:40 GMT'},11800), ({'Retry-After':'bad'},10600), (None,10600)]:
            client=PublicMarketClient('fixture')
            error=urllib.error.HTTPError('https://maplestory.market/api/prices',429,'Too many',headers,io.BytesIO())
            with patch('public_api.open_request',side_effect=error),patch('time.time',return_value=10000):result=client.get('/api/prices')
            self.assertEqual(result['retryAt'],expected)

    def test_refresh_denial_persists_without_exposing_private_key_id(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            error=urllib.error.HTTPError('https://maplestory.market/api/prices',403,'Forbidden',{},io.BytesIO())
            with patch.object(public_api,'CLIENT',PublicMarketClient('fixture-rejected')),patch('public_api.open_request',side_effect=error) as network,patch('time.time',return_value=10000):
                result=refresh(root)
                self.assertEqual(network.call_count,1)
            with patch.object(public_api,'CLIENT',PublicMarketClient('fixture-rejected')),patch('public_api.open_request') as network,patch('time.time',return_value=20000):
                result=refresh(root);network.assert_not_called()
            self.assertEqual(result['status'],'authentication_denied')
            self.assertNotIn('fixture-rejected',json.dumps(result))
            self.assertNotIn('KeyId',json.dumps(result))
            control=json.loads((root/'cache/provider-api-control.json').read_text())
            self.assertEqual(len(control['authenticationDeniedKeyId']),64)
            self.assertNotIn('fixture-rejected',(root/'cache/provider-api-control.json').read_text())
            with patch.object(public_api,'CLIENT',PublicMarketClient('fixture-new-approved')),patch('public_api.open_request',return_value=io.BytesIO(b'{"fixture":true}')) as network,patch('time.time',return_value=20000):
                self.assertEqual(refresh(root)['status'],'received');self.assertEqual(network.call_count,1)

    def test_refresh_last_good_and_persisted_cooldown(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            with patch.object(public_api,'CLIENT',PublicMarketClient('fixture')),patch('public_api.open_request',return_value=io.BytesIO(b'{"fixture":true}')),patch('time.time',return_value=10000):
                self.assertEqual(refresh(root)['status'],'received')
            path=root/'cache/provider-prices.json';before=path.read_bytes()
            with patch.object(public_api,'CLIENT',PublicMarketClient('fixture')),patch('public_api.open_request') as network,patch('time.time',return_value=10500):
                self.assertEqual(refresh(root)['status'],'backoff');network.assert_not_called()
            with patch.object(public_api,'CLIENT',PublicMarketClient('fixture')),patch('public_api.open_request',side_effect=RuntimeError('secret fixture')),patch('time.time',return_value=11000):
                self.assertEqual(refresh(root)['status'],'unavailable')
            self.assertEqual(path.read_bytes(),before)
            self.assertNotIn('secret fixture',(root/'cache/public-api-status.json').read_text())

    def test_rate_limit_cooldown_persists_across_client_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            error=urllib.error.HTTPError('https://maplestory.market/api/prices',429,'Too many',{'Retry-After':'1800'},io.BytesIO())
            with patch.object(public_api,'CLIENT',PublicMarketClient('fixture')),patch('public_api.open_request',side_effect=error),patch('time.time',return_value=10000):
                self.assertEqual(refresh(root)['nextAllowedAt'],11800)
            with patch.object(public_api,'CLIENT',PublicMarketClient('fixture')),patch('public_api.open_request') as network,patch('time.time',return_value=11000):
                result=refresh(root);self.assertEqual(result['status'],'backoff');self.assertEqual(result['nextAllowedAt'],11800);network.assert_not_called()

    def test_reserved_slot_survives_interrupted_request(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            with patch.object(public_api,'CLIENT',PublicMarketClient('fixture')),patch('public_api.open_request',side_effect=KeyboardInterrupt),patch('time.time',return_value=10000):
                with self.assertRaises(KeyboardInterrupt):refresh(root)
            with patch.object(public_api,'CLIENT',PublicMarketClient('fixture')),patch('public_api.open_request') as network,patch('time.time',return_value=10001):
                self.assertEqual(refresh(root)['status'],'backoff');network.assert_not_called()

    def test_refresh_nonoverlap_thread_and_process_lock(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);started=threading.Event();release=threading.Event();results=[]
            def response(*args,**kwargs):
                started.set();release.wait(3);return io.BytesIO(b'{"fixture":true}')
            with patch.object(public_api,'CLIENT',PublicMarketClient('fixture')),patch('public_api.open_request',side_effect=response) as network:
                thread=threading.Thread(target=lambda:results.append(refresh(root)));thread.start()
                try:
                    self.assertTrue(started.wait(3));self.assertEqual(refresh(root)['status'],'collector_busy')
                finally:release.set();thread.join(3)
                self.assertFalse(thread.is_alive());self.assertEqual(network.call_count,1);self.assertEqual(results[0]['status'],'received')
            with collector_lock(root/'incoming/provider-api.lock') as acquired:
                self.assertTrue(acquired)
                with patch('public_api.open_request') as network:
                    self.assertEqual(refresh(root)['status'],'collector_busy');network.assert_not_called()


if __name__=='__main__':unittest.main()
