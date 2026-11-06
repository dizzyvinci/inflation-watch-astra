"""Local HTTP semantics and publication guards; no server or provider is started."""
import copy
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import types
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import catalog_local
from catalog_local import LocalCatalog
from market_catalog import MarketCatalog
from portable_hash import HASH_METHOD, portable_hash


def encoded(value):
    return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()


def decoded(response):
    return json.loads(response.body)


def metadata(feed,ids):
    catalog=MarketCatalog(feed,ids)
    return {'schemaVersion':1,'hashMethod':HASH_METHOD,'catalogHash':catalog.catalog_hash,
            'sourceProjectionHash':catalog.source_projection_hash,'sourceUpdatedAt':feed['updatedAt'],
            'itemCount':len(feed['items']),'identityVersion':portable_hash({'hashMethod':HASH_METHOD,'identityMap':ids})}


class LocalCatalogTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name)
        (self.root/'cache').mkdir();(self.root/'dist').mkdir()
        self.feed={'updatedAt':'2026-11-04T08:30:56+00:00','secret':'DO_NOT_EXPOSE','items':[
            {'s':'apple','n':'Apple','k':'Consumable','p':100,'last':'2026-11-03T12:00:00Z','h':[['2026-11-02',100,1],['2026-11-04',101,4]],'player':'DO_NOT_EXPOSE'},
            {'s':'iron-ore','n':'Iron Ore','k':'Etc','p':300,'h':[['2026-11-01',200,0],['2026-11-02',250,5],['2026-11-04',300,1]],'nx':999},
        ]}
        self.ids=[{'slug':'iron-ore','name':'Iron Ore','id':4011000,'planHash':'a'*64}]
        self.publish();self.local=LocalCatalog(self.root)

    def publish(self,feed=None,ids=None,report_metadata=None,pointer_metadata=None):
        feed=copy.deepcopy(self.feed if feed is None else feed);ids=copy.deepcopy(self.ids if ids is None else ids)
        meta=metadata(feed,ids)
        report={'schemaVersion':1,'sourceUpdatedAt':feed['updatedAt'],'builtAt':'2026-11-05T18:00:00Z',
                'marketCatalog':meta if report_metadata is None else report_metadata,'privateField':'DO_NOT_EXPOSE'}
        raw=encoded(report);version=hashlib.sha256(raw).hexdigest()[:16]
        pointer={'version':version,'data':'data-'+version+'.json','sourceUpdatedAt':feed['updatedAt'],
                 'builtAt':report['builtAt'],'marketCatalog':meta if pointer_metadata is None else pointer_metadata}
        (self.root/'cache/market.json').write_bytes(encoded(feed))
        (self.root/'catalog-identities-v2.json').write_bytes(encoded(ids))
        (self.root/'dist'/pointer['data']).write_bytes(raw)
        (self.root/'dist/version.json').write_bytes(encoded(pointer))
        return pointer

    def test_exact_public_dtos_all_thin_points_clocks_and_no_raw_fields(self):
        response=self.local.handle('GET','/market-index.json');self.assertEqual(response.status,200)
        expected=MarketCatalog(self.feed,self.ids)
        self.assertEqual(decoded(response),expected.build_index())
        self.assertEqual(response.headers['X-Catalog-Mode'],'accepted_local')
        self.assertEqual(response.headers['Cache-Control'],'private, no-store, no-transform')
        h=decoded(response)['catalogHash']
        for slug in ['apple','iron-ore']:
            detail=self.local.handle('GET','/market-item/'+slug+'.json?catalog='+h)
            self.assertEqual(detail.status,200);self.assertEqual(decoded(detail),expected.resolve_item(slug))
            self.assertNotIn(b'DO_NOT_EXPOSE',detail.body);self.assertNotIn('nx',decoded(detail))
        self.assertIsNone(expected.resolve_item('apple')['price'])
        self.assertEqual(expected.resolve_item('iron-ore')['priceDay'],'2026-11-02')
        self.assertTrue(expected.resolve_item('iron-ore')['carried'])
        self.assertFalse((self.root/'dist/data.json').exists(),'Only the named report is required')

    def test_strict_queries_paths_methods_and_version_binding(self):
        with patch.object(self.local,'_load',side_effect=AssertionError('Must reject before local reads')):
            for path,status in [('/market-item/Apple.json',404),('/market-item/%61pple.json',404),('/market-item/apple.json',400),
                                ('/market-item/apple.json?catalog=bad',400),('/market-index.json?q=typed-search',400),
                                ('/market-index.json?catalog=x&catalog=x',400),('/market-index.json?secret=private',400)]:
                response=self.local.handle('GET',path);self.assertEqual(response.status,status,path)
                self.assertNotIn(b'private',response.body)
            for method in ['POST','PUT','DELETE','OPTIONS']:
                response=self.local.handle(method,'/market-index.json');self.assertEqual(response.status,405)
                self.assertEqual(response.headers['Allow'],'GET, HEAD')
        self.assertIsNone(self.local.handle('GET','/style.css'))
        wrong=self.local.handle('GET','/market-item/apple.json?catalog='+'0'*64)
        self.assertEqual(wrong.status,409);h=decoded(wrong)['catalogHash']
        absent=self.local.handle('GET','/market-item/not-collected.json?catalog='+h)
        self.assertEqual(absent.status,404);self.assertEqual(decoded(absent),{'error':'item_not_in_accepted_collection'})
        self.assertEqual(self.local.handle('GET','/market-item/'+'x'*201+'.json?catalog='+h).status,404)
        with patch.object(self.local._last_good.catalog,'resolve_item',return_value=None):
            self.assertEqual(self.local.handle('GET','/market-item/apple.json?catalog='+h).status,503,'A missing indexed detail is not item absence')

    def test_head_etag_304_and_independent_response_headers(self):
        response=self.local.handle('GET','/market-index.json');tag=response.headers['ETag']
        head=self.local.handle('HEAD','/market-index.json')
        self.assertEqual(head.status,200);self.assertEqual(head.body,b'')
        self.assertEqual(head.headers['Content-Length'],str(len(response.body)))
        self.assertEqual(head.headers['ETag'],tag)
        unchanged=self.local.handle('GET','/market-index.json',{'If-None-Match':'"different", W/'+tag})
        self.assertEqual(unchanged.status,304);self.assertEqual(unchanged.body,b'')
        response.headers['ETag']='changed';self.assertEqual(self.local.handle('GET','/market-index.json').headers['ETag'],tag)
        h=decoded(response)['catalogHash'];path='/market-item/apple.json?catalog='+h
        detail=self.local.handle('GET',path);self.assertIn(':apple',detail.headers['ETag'])
        self.assertEqual(self.local.handle('HEAD',path,{'If-None-Match':detail.headers['ETag']}).status,304)

    def test_lock_cold_503_and_warm_retention_then_complete_publication(self):
        lock=self.root/'.collector.lock';lock.touch()
        cold=self.local.handle('GET','/market-index.json')
        self.assertEqual(cold.status,503);self.assertEqual(decoded(cold),{'error':'catalogue_unavailable'})
        self.assertEqual(cold.headers['Retry-After'],'2')
        lock.unlink();before=self.local.handle('GET','/market-index.json')
        lock.touch();newer=copy.deepcopy(self.feed);newer['updatedAt']='2026-11-05T08:30:56+00:00';self.publish(newer)
        retained=self.local.handle('GET','/market-index.json')
        self.assertEqual(retained.status,200);self.assertEqual(retained.body,before.body)
        self.assertEqual(retained.headers['X-Catalog-Mode'],'retained_verified_local')
        lock.unlink();current=self.local.handle('GET','/market-index.json')
        self.assertNotEqual(decoded(current)['catalogHash'],decoded(before)['catalogHash'])
        self.assertEqual(decoded(current)['sourceUpdatedAt'],newer['updatedAt'])
        old_hash=decoded(before)['catalogHash']
        self.assertEqual(self.local.handle('GET','/market-item/apple.json?catalog='+old_hash).status,409)

    def test_corrupt_or_mismatched_publications_retain_last_good_and_cold_fail_closed(self):
        for fault in ['report_bytes','source','identities','pointer_metadata','report_metadata','pointer_path','boolean_schema']:
            with self.subTest(fault=fault):
                self.publish();local=LocalCatalog(self.root);before=local.handle('GET','/market-index.json')
                pointer=json.loads((self.root/'dist/version.json').read_text())
                if fault=='report_bytes':
                    with (self.root/'dist'/pointer['data']).open('ab') as target:target.write(b' ')
                elif fault=='source':
                    changed=copy.deepcopy(self.feed);changed['items'][0]['h'][0][1]+=1
                    (self.root/'cache/market.json').write_bytes(encoded(changed))
                elif fault=='identities':
                    (self.root/'catalog-identities-v2.json').write_bytes(encoded([]))
                elif fault in ['pointer_metadata','boolean_schema']:
                    if fault=='boolean_schema':pointer['marketCatalog']['schemaVersion']=True
                    else:pointer['marketCatalog']['identityVersion']='0'*64
                    (self.root/'dist/version.json').write_bytes(encoded(pointer))
                elif fault=='report_metadata':
                    altered=metadata(self.feed,self.ids);altered['catalogHash']='0'*64
                    self.publish(report_metadata=altered)
                else:
                    pointer['data']='../cache/market.json';(self.root/'dist/version.json').write_bytes(encoded(pointer))
                retained=local.handle('GET','/market-index.json')
                self.assertEqual(retained.status,200);self.assertEqual(retained.body,before.body)
                self.assertEqual(retained.headers['X-Catalog-Mode'],'retained_verified_local')
                self.assertEqual(LocalCatalog(self.root).handle('GET','/market-index.json').status,503)

    def test_threaded_reads_coalesce_projection_and_retain_two_generations(self):
        real=MarketCatalog;calls=[]
        def prepare(*args):
            calls.append(1);time.sleep(.01);return real(*args)
        with patch('catalog_local.MarketCatalog',side_effect=prepare):
            with ThreadPoolExecutor(max_workers=16) as workers:
                results=list(workers.map(lambda _:self.local.handle('GET','/market-index.json'),range(32)))
            self.assertEqual(len(calls),1);self.assertTrue(all(value.body==results[0].body for value in results))
            for price in [400,500]:
                changed=copy.deepcopy(self.feed);changed['items'][0]['p']=price;self.publish(changed)
                self.assertEqual(self.local.handle('GET','/market-index.json').status,200)
        self.assertEqual(len(self.local._generations),2)

    def test_item_result_cache_is_bounded_and_build_start_during_verification_is_not_accepted(self):
        many=copy.deepcopy(self.feed);many['items']=[{'s':'item-'+str(i),'n':'Item '+str(i),'k':'Etc','h':[['2026-11-03',1,1]]} for i in range(70)]
        self.publish(many,ids=[]);value=self.local.handle('GET','/market-index.json');h=decoded(value)['catalogHash']
        for i in range(70):self.assertEqual(self.local.handle('GET','/market-item/item-'+str(i)+'.json?catalog='+h).status,200)
        self.assertEqual(len(self.local._last_good.details),64)
        self.publish();before=self.local.handle('GET','/market-index.json')
        changed=copy.deepcopy(self.feed);changed['items'][0]['p']=999;self.publish(changed)
        real=MarketCatalog
        def racing(*args):
            result=real(*args);(self.root/'.collector.lock').touch();return result
        with patch('catalog_local.MarketCatalog',side_effect=racing):
            retained=self.local.handle('GET','/market-index.json')
        self.assertEqual(retained.body,before.body);self.assertEqual(retained.headers['X-Catalog-Mode'],'retained_verified_local')
        self.assertEqual(LocalCatalog(self.root).handle('GET','/market-index.json').status,503)

    def test_transient_preparation_failure_can_retry_without_changing_source_clock(self):
        with patch('catalog_local.time.monotonic',return_value=100),patch('catalog_local.MarketCatalog',side_effect=ValueError('DO_NOT_EXPOSE')):
            response=self.local.handle('GET','/market-index.json');self.assertEqual(response.status,503);self.assertNotIn(b'DO_NOT_EXPOSE',response.body)
        with patch('catalog_local.time.monotonic',return_value=103):
            response=self.local.handle('GET','/market-index.json')
        self.assertEqual(response.status,200);self.assertEqual(decoded(response)['sourceUpdatedAt'],self.feed['updatedAt'])

    def test_preview_handler_integration_without_server_and_without_build_or_provider(self):
        import preview
        class Socket:
            def __init__(self,request):self.input=io.BytesIO(request);self.output=io.BytesIO()
            def makefile(self,*args,**kwargs):return self.input
            def sendall(self,data):self.output.write(data)
        class Quiet(preview.Handler):
            def log_message(self,*args):pass
        with patch.object(preview,'_catalog',self.local),patch.object(preview,'build',side_effect=AssertionError('No visitor build')),patch('urllib.request.urlopen',side_effect=AssertionError('No provider request')):
            for method in ['GET','HEAD','POST']:
                socket=Socket((method+' /market-index.json HTTP/1.0\r\nHost: localhost\r\n\r\n').encode())
                Quiet(socket,('127.0.0.1',1),types.SimpleNamespace(server_address=('127.0.0.1',8765)))
                raw=socket.output.getvalue();headers,body=raw.split(b'\r\n\r\n',1)
                self.assertIn(b'200' if method!='POST' else b'405',headers.split(b'\r\n')[0])
                self.assertEqual(headers.lower().count(b'cache-control:'),3,'One browser and two distinct CDN cache headers')
                self.assertEqual(headers.lower().count(b'\r\nx-content-type-options:'),1)
                self.assertNotIn(b'DO_NOT_EXPOSE',body)
                if method=='HEAD':self.assertEqual(body,b'')
                elif method=='GET':self.assertEqual(json.loads(body)['itemCount'],2)


if __name__=='__main__':unittest.main()
