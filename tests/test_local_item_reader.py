import base64
import copy
from concurrent.futures import ThreadPoolExecutor
import hashlib
import http.server
import http.client
import json
from pathlib import Path
import subprocess
import sys
import types
import threading
import time
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
sys.path.insert(0,str(ROOT))
from local_item_reader import LocalItemReader,TransportResponse,validate,route,Invalid,own_site_transport
ITEM='/api-item-prices/1082000.json';MANIFEST='/api-item-identities.json'

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        p=subprocess.run(['node',str(HERE/'local-item-fixtures.mjs')],capture_output=True,text=True,timeout=10)
        if p.returncode:raise RuntimeError('Synthetic fixture generation failed')
        cls.fixture=json.loads(p.stdout)
    def setUp(self):
        self.f=copy.deepcopy(self.fixture);self.now=[0];self.calls=[]
        self.replies={ITEM:self.f['item'],MANIFEST:self.f['manifest'],self.f['pagePath']:self.f['page']}
        self.fail=None
        self.reader=LocalItemReader(ROOT,transport=self.transport,monotonic=lambda:self.now[0],wall=lambda:1793998800)
    def transport(self,path,conditions,timeout):
        self.calls.append((path,conditions))
        if self.fail:raise self.fail
        value=self.replies.get(path.split('?')[0],{'status':404,'headers':{},'body':''})
        return TransportResponse(value['status'],value['headers'],value['body'].encode())
    def get(self,path=ITEM,method='GET',headers=None,**kw):return self.reader.handle(method,path,{'Host':'localhost:8765',**(headers or {})},**kw)
    def test_real_protocol_item_and_original_clock(self):
        r=self.get();self.assertEqual(r.status,200)
        self.assertEqual(r.headers['ETag'],'"api-item-'+hashlib.sha256(r.body).hexdigest()+'"')
        self.assertEqual(r.headers['X-Astra-API-Item-Captured-At'],self.f['at'])
        self.assertEqual(json.loads(r.body)['sourceObservedAt'],None)
    def test_real_identity_manifest_page_and_hash(self):
        self.assertEqual(self.get(MANIFEST).status,200)
        p=self.get(self.f['pagePath']+'?generation='+self.f['indexHash'])
        self.assertEqual(p.status,200);self.assertEqual(len(self.calls),2)
        self.assertEqual(p.headers['ETag'],'"api-identities-'+hashlib.sha256(p.body).hexdigest()+'"')
    def test_actual_browser_clients_accept_local_headers_and_exact_bytes(self):
        responses={k:self.get(path) for k,path in [('item',ITEM),('manifest',MANIFEST),('page',self.f['pagePath']+'?generation='+self.f['indexHash'])]}
        packet={k:{'body':base64.b64encode(r.body).decode(),'headers':r.headers,'status':r.status} for k,r in responses.items()}
        p=subprocess.run(['node',str(HERE/'local-item-client-interop.mjs')],input=json.dumps(packet),capture_output=True,text=True,timeout=10)
        self.assertEqual(p.returncode,0,'Actual browser client interop failed')
        out=json.loads(p.stdout);self.assertTrue(out['browserInterop']);self.assertEqual(out['originalCapture'],self.f['at']);self.assertEqual(out['statGroups'],1)
    def test_ttl_head_and_conditional_response(self):
        first=self.get();head=self.get(method='HEAD');self.assertEqual(head.status,200);self.assertEqual(head.body,b'')
        self.assertEqual(int(head.headers['Content-Length']),len(first.body))
        not_modified=self.get(headers={'If-None-Match':first.headers['ETag']})
        self.assertEqual(not_modified.status,304);self.assertEqual(not_modified.body,b'');self.assertEqual(len(self.calls),1)
        self.assertIn('no-store',head.headers['Cache-Control'])
    def test_upstream304_context_and_conditions(self):
        first=self.get();self.now[0]=61;self.replies[ITEM]={**self.f['item'],'status':304,'body':''}
        r=self.get();self.assertEqual(r.body,first.body);self.assertEqual(self.calls[-1][1],{'If-None-Match':first.headers['ETag']})
        self.assertEqual(r.headers['X-Astra-API-Item-Mode'],'validated_cache')
        self.now[0]=122;self.replies[ITEM]['headers']['X-Astra-API-Item-Captured-At']='2026-11-05T21:01:00.000Z'
        self.assertEqual(self.get().headers['X-Astra-API-Item-Mode'],'retained')
    def test_cold_failure_backoff_and_later_recovery(self):
        self.fail=TimeoutError();self.assertEqual(self.get().status,503)
        for _ in range(20):self.assertEqual(self.get().status,503)
        self.assertEqual(len(self.calls),1);self.now[0]=31;self.fail=None;self.assertEqual(self.get().status,200)
    def test_last_good_on_timeout_bytes_and_original_clock_unchanged(self):
        first=self.get();self.now[0]=61;self.fail=TimeoutError();stale=self.get()
        self.assertEqual(stale.body,first.body);self.assertEqual(stale.headers['ETag'],first.headers['ETag'])
        self.assertEqual(stale.headers['X-Astra-API-Item-Mode'],'retained');self.assertEqual(stale.headers['X-Astra-API-Item-Captured-At'],self.f['at'])
    def test_429_retry_after_is_operator_backoff_not_source_clock(self):
        self.replies[ITEM]={'status':429,'headers':{'Retry-After':'120'},'body':''}
        self.assertEqual(self.get().status,503);self.now[0]=119;self.get();self.assertEqual(len(self.calls),1)
        self.now[0]=121;self.replies[ITEM]=self.f['item'];self.assertEqual(self.get().status,200)
    def test_cold_singleflight_40_threads(self):
        entered=threading.Event();release=threading.Event();original=self.transport
        def slow(*a):entered.set();release.wait(3);return original(*a)
        self.reader.transport=slow
        with ThreadPoolExecutor(max_workers=40) as pool:
            futures=[pool.submit(self.get) for _ in range(40)];self.assertTrue(entered.wait(1));release.set();results=[f.result(5) for f in futures]
        self.assertTrue(all(r.status==200 for r in results));self.assertEqual(len(self.calls),1)
    def test_private_bind_host_method_and_query_guards_before_transport(self):
        for kwargs in [{'bind_host':'0.0.0.0'},{'client_host':'192.0.2.1'},{'headers':{'Host':'evil.example'}}]:self.assertEqual(self.get(**kwargs).status,403)
        self.assertEqual(self.get(method='POST').status,405)
        for p in [ITEM+'?search=test',ITEM+'?generation=a&generation=b','/api-item-prices/0.json','/api-item-prices/%31.json',ITEM+'#x',ITEM+'?generation='+('a'*64)+'&']:
            self.assertEqual(self.get(p).status,400)
        self.assertEqual(self.calls,[])
    def test_unknown_page_never_transport_and_requested_generation_conflict(self):
        self.get(MANIFEST);before=len(self.calls)
        self.assertEqual(self.get('/api-item-identities/'+('d'*64)+'.json').status,404)
        self.assertEqual(self.get(self.f['pagePath']+'?generation='+('e'*64)).status,409)
        self.assertEqual(len(self.calls),before)
    def test_409_is_propagated_not_mixed_with_old_good_generation(self):
        self.get();self.now[0]=61;self.replies[ITEM]={'status':409,'headers':{},'body':''}
        self.assertEqual(self.get().status,409)
    def test_unknown_item_and_source_not_enabled_no_fake_data(self):
        self.assertEqual(self.get('/api-item-prices/999.json').status,404)
        self.assertEqual(self.reader.handle('GET','/data.json',{}),None)
    def test_wrong_hash_mime_captured_clock_and_unknown_fields_fail_closed(self):
        for change in ['hash','mime','clock','field']:
            with self.subTest(change=change):
                self.setUp();v=self.replies[ITEM]
                if change=='hash':v['headers']['ETag']='"api-item-'+('b'*64)+'"'
                if change=='mime':v['headers']['Content-Type']='text/html'
                if change=='clock':v['headers']['X-Astra-API-Item-Captured-At']='2026-11-05T22:00:00.000Z'
                if change=='field':
                    x=json.loads(v['body']);x['rawPlayer']='never';v['body']=json.dumps(x,separators=(',',':'));v['headers']['ETag']='"api-item-'+hashlib.sha256(v['body'].encode()).hexdigest()+'"'
                self.assertEqual(self.get().status,503)
    def test_max_inflight_and_negative_key_memory_bounded(self):
        start=threading.Event();release=threading.Event()
        def stall(*a):start.set();release.wait(3);raise TimeoutError()
        self.reader=LocalItemReader(ROOT,transport=stall,max_entries=4,max_flights=1,wait_seconds=.05)
        with ThreadPoolExecutor(max_workers=1) as pool:
            f=pool.submit(self.get);self.assertTrue(start.wait(1))
            for n in range(1,101):self.get('/api-item-prices/'+str(n)+'.json')
            self.assertLessEqual(len(self.reader.entries),4);self.assertEqual(len(self.reader.flights),1);release.set();f.result(4)
    def test_literal_transport_has_no_arbitrary_url_cookie_proxy_or_redirect(self):
        class Fake:
            def open(inner,request,timeout):
                self.assertEqual(request.full_url,'https://inflation.gg'+ITEM)
                self.assertNotIn('Cookie',request.headers);self.assertNotIn('Authorization',request.headers)
                raise TimeoutError()
        with patch('local_item_reader.build_opener',return_value=Fake()) as build:
            with self.assertRaises(TimeoutError):own_site_transport(ITEM,{},3)
            self.assertEqual(build.call_args[0][0].proxies,{})
        for p in ['https://elsewhere.invalid'+ITEM,'//elsewhere.invalid'+ITEM,ITEM+'?url=https://elsewhere.invalid']:
            with self.assertRaises(Invalid):own_site_transport(p,{},3)
    def changed_item(self,at):
        value=copy.deepcopy(self.f['item']);dto=json.loads(value['body']);dto['sourceCapturedAt']=at;dto['item']['source']['retrievedAt']=at
        dto['dtoSha256']=hashlib.sha256(json.dumps(dto['item'],separators=(',',':')).encode()).hexdigest()
        value['body']=json.dumps(dto,separators=(',',':'));value['headers']['ETag']='"api-item-'+hashlib.sha256(value['body'].encode()).hexdigest()+'"'
        value['headers']['X-Astra-API-Item-Captured-At']=at
        return value
    def test_valid_older_capture_retains_last_good_and_future_rejected(self):
        first=self.get();self.now[0]=61;self.replies[ITEM]=self.changed_item('2026-11-05T20:00:00.000Z')
        older=self.get();self.assertEqual(older.body,first.body);self.assertEqual(older.headers['X-Astra-API-Item-Mode'],'retained')
        self.reader=LocalItemReader(ROOT,transport=self.transport,wall=lambda:1793998800)
        self.replies[ITEM]=self.changed_item('2026-11-10T21:00:00.000Z');self.assertEqual(self.get().status,503)
    def test_cached_page_must_validate_against_current_manifest_context(self):
        self.get(MANIFEST);self.assertEqual(self.get(self.f['pagePath']).status,200)
        m=json.loads(self.f['manifest']['body']);m['sources'][0]['retrievedAt']='2026-11-05T22:00:00.000Z'
        m.pop('indexHash');m['indexHash']=hashlib.sha256(json.dumps(m,separators=(',',':')).encode()).hexdigest()
        value=copy.deepcopy(self.f['manifest']);value['body']=json.dumps(m,separators=(',',':'))
        value['headers']['ETag']='"api-identities-'+hashlib.sha256(value['body'].encode()).hexdigest()+'"'
        value['headers']['X-Astra-API-Identity-Generation']=m['indexHash'];self.replies[MANIFEST]=value
        self.replies[self.f['pagePath']]['headers']['X-Astra-API-Identity-Generation']=m['indexHash']
        self.now[0]=61;self.assertEqual(self.get(MANIFEST).status,200)
        # Same page hash/bytes, but its old membership clock is not valid under
        # the new manifest. The old cached page must not bypass validation.
        self.assertEqual(self.get(self.f['pagePath']).status,503)
    def test_304_without_accepted_body_and_oversize_fail_closed(self):
        self.replies[ITEM]={**self.f['item'],'status':304,'body':''};self.assertEqual(self.get().status,503)
        self.reader=LocalItemReader(ROOT,transport=self.transport)
        self.replies[ITEM]={**self.f['item'],'body':'x'*300001};self.assertEqual(self.get().status,503)
    def test_body_and_header_return_values_are_independent(self):
        first=self.get();first.headers['ETag']='tampered';second=self.get()
        self.assertNotEqual(second.headers['ETag'],'tampered');self.assertEqual(first.body,second.body)
    def test_actual_preview_handler_get_head_304_and_wrong_host(self):
        module=types.ModuleType('local_item_preview_test');module.__file__=str(ROOT/'preview.py')
        with patch.object(sys,'path',[str(HERE),str(ROOT),*sys.path]):
            exec(compile((ROOT/'preview.py').read_text(),module.__file__,'exec'),module.__dict__)
        module._items=self.reader
        class Quiet(module.Handler):
            def log_message(self,*a):pass
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Quiet)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            def request(method,headers=None):
                c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=5)
                c.request(method,ITEM,headers=headers or {});r=c.getresponse();out=(r.status,dict(r.headers),r.read());c.close();return out
            first=request('GET');self.assertEqual(first[0],200)
            self.assertEqual(request('HEAD')[2],b'')
            self.assertEqual(request('GET',{'If-None-Match':first[1]['ETag']})[0],304)
            self.assertEqual(request('POST')[0],405)
            self.assertEqual(request('GET',{'Host':'evil.example'})[0],403)
            self.assertEqual(len(self.calls),1)
        finally:server.shutdown();server.server_close();thread.join(2)

if __name__=='__main__':unittest.main()
