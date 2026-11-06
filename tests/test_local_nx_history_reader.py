import copy
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
import base64
import http.server
import http.client
from pathlib import Path
import subprocess
import sys
import threading
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from local_nx_history_reader import LocalNxHistoryReader,TransportResponse,validate,route,own_site_transport,Invalid,MANIFEST

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        p=subprocess.run(['node',str(ROOT/'tests/local-nx-history-fixtures.mjs')],capture_output=True,timeout=10)
        if p.returncode:raise RuntimeError(p.stderr.decode())
        cls.fixtures=json.loads(p.stdout)
    def setUp(self):
        self.f=copy.deepcopy(self.fixtures);self.replies=self.f['a']['replies'];self.calls=[];self.now=[0];self.fail=None
        self.reader=LocalNxHistoryReader(transport=self.transport,monotonic=lambda:self.now[0],wall=lambda:1793998800)
    def transport(self,path,conditions,timeout):
        self.calls.append((path,conditions,timeout))
        if self.fail:raise self.fail
        v=self.replies[path]
        return TransportResponse(v['status'],v['headers'],v['body'].encode())
    def page(self,f='a',n=0):return self.f[f]['manifest']['pages'][n]['url']+'?generation='+self.f[f]['manifest']['indexHash']
    def get(self,path=MANIFEST,method='GET',headers=None,**kw):return self.reader.handle(method,path,{'Host':'localhost:8765',**(headers or {})},**kw)
    def test_exact_production_protocol_clock_and_bytes(self):
        m=self.get();p=self.get(self.page())
        self.assertEqual((m.status,p.status),(200,200));self.assertEqual(len(self.calls),2)
        self.assertEqual(p.body,self.replies[self.page()]['body'].encode());self.assertEqual(json.loads(p.body)['rows'][0]['sourceObservedAt'],None)
        self.assertEqual(p.headers['X-Astra-NX-History-Captured-At'],'2026-11-06T01:00:00.000Z')
        self.assertEqual(p.headers['ETag'],'"nx-history-'+hashlib.sha256(p.body).hexdigest()+'"')
    def test_get_head_conditional304_no_new_transport(self):
        first=self.get(self.page());head=self.get(self.page(),'HEAD');notmod=self.get(self.page(),headers={'If-None-Match':first.headers['ETag']})
        self.assertEqual((head.status,notmod.status),(200,304));self.assertEqual(head.body,b'');self.assertEqual(notmod.body,b'')
        self.assertEqual(int(head.headers['Content-Length']),len(first.body));self.assertEqual(len(self.calls),2)
        self.assertEqual(head.headers['X-Astra-NX-History-Generation'],first.headers['X-Astra-NX-History-Generation'])
    def test_real_upstream304_context_must_match_original(self):
        first=self.get();self.now[0]=61;self.replies[MANIFEST]['status']=304;self.replies[MANIFEST]['body']=''
        self.assertEqual(self.get().body,first.body);self.assertEqual(self.calls[-1][1],{'If-None-Match':first.headers['ETag']})
        self.now[0]=122;self.replies[MANIFEST]['headers']['X-Astra-NX-History-Captured-At']='2026-11-06T02:00:00.000Z'
        r=self.get();self.assertEqual(r.headers['X-Astra-NX-History-Mode'],'retained_last_good');self.assertEqual(r.body,first.body)
    def test_failure_retains_exact_bytes_and_clocks_with_backoff(self):
        first=self.get(self.page());self.now[0]=61;self.fail=TimeoutError()
        r=self.get(self.page());self.assertEqual(r.body,first.body);self.assertEqual(r.headers['X-Astra-NX-History-Mode'],'retained_last_good')
        self.assertEqual(r.headers['X-Astra-NX-History-Captured-At'],first.headers['X-Astra-NX-History-Captured-At']);n=len(self.calls)
        self.get(self.page());self.assertEqual(len(self.calls),n)
    def test_cold_unpublished404_vs_failure503(self):
        self.replies[MANIFEST]={'status':404,'headers':{},'body':''};self.assertEqual(self.get().status,404)
        self.assertNotIn('X-Astra-NX-History-Captured-At',self.get().headers)
        self.now[0]=31;self.replies[MANIFEST]={'status':503,'headers':{},'body':''};self.assertEqual(self.get().status,503)
    def test_withdrawal_clears_only_this_reader_and_no_stale_pages(self):
        self.get(self.page());self.now[0]=61;self.replies[MANIFEST]={'status':404,'headers':{},'body':''}
        self.assertEqual(self.get().status,404);self.assertIsNone(self.reader.current)
        self.assertEqual(self.get(self.page()).status,404)
        self.assertTrue(all(e['raw'] is None for e in self.reader.entries.values()))
    def test_generation_change_conflict_no_wrong_clock_or_page_fetch(self):
        self.get(self.page());self.now[0]=61;self.replies=self.f['b']['replies'];self.assertEqual(self.get().status,200)
        n=len(self.calls);r=self.get(self.page());self.assertEqual(r.status,409);self.assertEqual(len(self.calls),n)
        self.assertEqual(json.loads(r.body)['generation'],self.f['b']['manifest']['indexHash'])
        self.assertEqual(self.get(self.page('b')).status,200)
    def test_coherent_manifest_descriptor_drift_never_reuses_cached_authority(self):
        self.get(self.page());self.now[0]=61;d=self.f['drift'];self.replies[MANIFEST]=d['reply'];self.assertEqual(self.get().status,200)
        path=d['manifest']['pages'][0]['url']+'?generation='+d['manifest']['indexHash']
        old=copy.deepcopy(self.f['a']['replies'][self.page()]);old['headers']['X-Astra-NX-History-Generation']=d['manifest']['indexHash'];self.replies[path]=old
        self.assertEqual(self.get(path).status,503)
    def test_corrupt_json_duplicates_bad_mime_etag_or_source_context_rejected(self):
        base=self.f['a']['replies'][MANIFEST]
        variants=[]
        for field,value in [('Content-Type','text/html'),('ETag','"bad"'),('X-Astra-NX-History-Generation','0'*64),('X-Astra-NX-History-Captured-At','2026-11-06T02:00:00.000Z')]:
            v=copy.deepcopy(base);v['headers'][field]=value;variants.append(v)
        v=copy.deepcopy(base);v['body']=v['body'].replace('{','{"schemaVersion":1,',1);v['headers']['ETag']='"nx-history-'+hashlib.sha256(v['body'].encode()).hexdigest()+'"';variants.append(v)
        for v in variants:
            self.reader=LocalNxHistoryReader(transport=self.transport,monotonic=lambda:self.now[0],wall=lambda:1793998800);self.replies[MANIFEST]=v
            self.assertEqual(self.get().status,503)
    def test_cold_32_threads_singleflight_one_fetch(self):
        entered=threading.Event();release=threading.Event();original=self.transport
        def slow(*a):entered.set();release.wait(3);return original(*a)
        self.reader.transport=slow
        with ThreadPoolExecutor(max_workers=32) as pool:
            fs=[pool.submit(self.get) for _ in range(32)];self.assertTrue(entered.wait(1));release.set();results=[f.result(5) for f in fs]
        self.assertTrue(all(r.status==200 for r in results));self.assertEqual(len(self.calls),1)
    def test_late_page_after_manifest_withdrawal_cannot_resurrect(self):
        self.get();entered=threading.Event();release=threading.Event();original=self.transport
        def slow(path,*a):
            if path!=MANIFEST:entered.set();release.wait(3)
            return original(path,*a)
        self.reader.transport=slow
        with ThreadPoolExecutor(max_workers=2) as pool:
            page=pool.submit(self.get,self.page());self.assertTrue(entered.wait(1));self.now[0]=61
            self.replies[MANIFEST]={'status':404,'headers':{},'body':''};self.assertEqual(self.get().status,404);release.set()
            self.assertNotEqual(page.result(5).status,200)
        self.assertIsNone(self.reader.current)
    def test_routes_hosts_methods_and_unknown_page_no_transport(self):
        for path in [MANIFEST+'?x=1','/api-nx-history/'+('a'*64)+'.json',MANIFEST+'#fragment','https://evil.invalid'+MANIFEST]:
            self.assertEqual(self.get(path).status,400)
        self.assertEqual(self.get('/api-nx-history/%2f.json?generation='+('a'*64)).status,404)
        for host in ['evil.invalid','localhost'+'@'+'evil.invalid','localhost/path','localhost:999999']:
            self.assertEqual(self.get(headers={'Host':host}).status,403)
        self.assertEqual(self.get(client_host='192.0.2.1').status,403);self.assertEqual(self.get(method='POST').status,405);self.assertEqual(len(self.calls),0)
        self.get();n=len(self.calls);r=self.get('/api-nx-history/'+('a'*64)+'.json?generation='+self.f['a']['manifest']['indexHash'])
        self.assertEqual(r.status,404);self.assertEqual(len(self.calls),n)
    def test_retry_after_and_bounded_cache(self):
        self.replies[MANIFEST]={'status':429,'headers':{'Retry-After':'120'},'body':''};self.get();self.now[0]=119;self.get();self.assertEqual(len(self.calls),1)
        self.now[0]=121;self.replies=self.f['b']['replies'];self.reader.max_pages=1
        self.get(self.page('b'));self.get(self.page('b',1));self.assertLessEqual(len(self.reader.entries),2)
    def test_fixed_transport_no_proxy_cookie_auth_redirect_or_arbitrary_url(self):
        class Response:
            status=200;headers={'Content-Length':'2'}
            def __enter__(self):return self
            def __exit__(self,*a):pass
            def read1(self,n):return b''
        class Opener:
            def open(inner,request,timeout):
                self.assertEqual(request.full_url,'https://inflation.gg/api-nx-history.json');self.assertEqual(request.get_method(),'GET')
                self.assertFalse(any(k.lower() in ('authorization','cookie') for k in request.headers));return Response()
        with patch('local_nx_history_reader.build_opener',return_value=Opener()) as p:
            own_site_transport(MANIFEST,{},3)
            self.assertEqual(p.call_args.args[0].proxies,{})
            self.assertIsNone(p.call_args.args[1].redirect_request(None,None,302,'',{},'https://evil.invalid'))
        for path in ['https://evil.invalid/a','/api-nx-history.json?url=x']:
            with self.assertRaises(Invalid):own_site_transport(path,{},3)
    def test_actual_browser_history_client_accepts_exact_local_responses(self):
        packet={}
        for path in [MANIFEST,self.page()]:
            r=self.get(path);packet[path]={'body':base64.b64encode(r.body).decode(),'headers':r.headers,'status':r.status}
        p=subprocess.run(['node',str(ROOT/'tests/local-nx-history-client-interop.mjs')],input=json.dumps(packet).encode(),capture_output=True,timeout=10)
        self.assertEqual(p.returncode,0,p.stderr.decode());out=json.loads(p.stdout)
        self.assertTrue(out['ok']);self.assertEqual(out['rows'],2);self.assertEqual(out['capture'],'2026-11-06T01:00:00.000Z')
    def test_work_preview_handler_loopback_mock_get_head304_and_methods(self):
        # Only ephemeral local mock HTTP; no existing server or collector starts.
        canonical=ROOT if (ROOT/'local_cash_reader.py').exists() else ROOT.parents[2]/'outputs/inflation-watch'
        module=types.ModuleType('local_history_preview_test');module.__file__=str(ROOT/'preview.py')
        with patch.object(sys,'path',[str(ROOT),str(canonical),*sys.path]):
            exec(compile((ROOT/'preview.py').read_text(encoding='utf-8'),module.__file__,'exec'),module.__dict__)
        module._nx_history=self.reader
        class Quiet(module.Handler):
            def log_message(self,*a):pass
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Quiet);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            def request(method,headers=None):
                c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=5);c.request(method,MANIFEST,headers=headers or {})
                r=c.getresponse();out=(r.status,dict(r.headers),r.read());c.close();return out
            first=request('GET');self.assertEqual(first[0],200);self.assertEqual(request('HEAD')[2],b'')
            self.assertEqual(request('GET',{'If-None-Match':first[1]['ETag']})[0],304)
            self.assertEqual(request('POST')[0],405);self.assertEqual(request('GET',{'Host':'evil.invalid'})[0],403);self.assertEqual(len(self.calls),1)
        finally:server.shutdown();server.server_close();thread.join(2)
    def test_helper_timeout_and_size_bounds_are_safe(self):
        with patch('local_nx_history_reader.subprocess.run',side_effect=subprocess.TimeoutExpired('node',3)):
            self.assertEqual(self.get().status,503)
        self.assertRaises(Invalid,validate,b'x'*196609,{})
        self.assertIsNone(self.get('/unrelated.json'))
    def test_page304_retains_context_no_false_clock_refresh(self):
        first=self.get(self.page());self.now[0]=61
        self.replies[self.page()]['status']=304;self.replies[self.page()]['body']=''
        self.assertEqual(self.get(self.page()).body,first.body)
        self.now[0]=122;self.replies[self.page()]['headers']['X-Astra-NX-History-Captured-At']='2026-11-06T02:00:00.000Z'
        r=self.get(self.page());self.assertEqual(r.headers['X-Astra-NX-History-Mode'],'retained_last_good');self.assertEqual(r.headers['X-Astra-NX-History-Captured-At'],first.headers['X-Astra-NX-History-Captured-At'])
    def test_older_manifest_does_not_roll_back_generation_coverage_or_clock(self):
        self.replies=self.f['b']['replies'];first=self.get();self.now[0]=61;self.replies=self.f['a']['replies']
        r=self.get();self.assertEqual(r.body,first.body);self.assertEqual(r.headers['X-Astra-NX-History-Mode'],'retained_last_good')
        self.assertEqual(r.headers['X-Astra-NX-History-Captured-At'],'2026-11-06T02:00:00.000Z')
    def test_auth_failure_drops_cached_history_without_affecting_other_reader(self):
        self.get(self.page());self.now[0]=61;self.replies[MANIFEST]={'status':403,'headers':{},'body':''}
        self.assertEqual(self.get().status,403);self.assertIsNone(self.reader.current);self.assertEqual(self.get(self.page()).status,403)
    def test_known_page_withdrawal_clears_manifest_and_other_pages(self):
        self.get(self.page());self.now[0]=61
        self.replies[self.page()]={'status':403,'headers':{},'body':''}
        self.assertEqual(self.get(self.page()).status,403);self.assertIsNone(self.reader.current)
        n=len(self.calls);self.assertEqual(self.get().status,403);self.assertEqual(len(self.calls),n)
    def test_future_capture_oversize_and_304_without_body_rejected(self):
        for reply in [{'status':304,'headers':self.f['a']['replies'][MANIFEST]['headers'],'body':''},
                      {'status':200,'headers':self.f['a']['replies'][MANIFEST]['headers'],'body':'x'*131073}]:
            self.reader=LocalNxHistoryReader(transport=self.transport);self.replies[MANIFEST]=reply;self.assertEqual(self.get().status,503)
        self.reader=LocalNxHistoryReader(transport=self.transport,wall=lambda:1);self.replies=self.f['a']['replies'];self.assertEqual(self.get().status,503)

if __name__=='__main__':unittest.main()
