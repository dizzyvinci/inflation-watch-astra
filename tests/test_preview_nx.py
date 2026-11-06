"""Ephemeral loopback only. No own-site/provider transport is performed."""
import http.client
import http.server
from pathlib import Path
import sys
import threading
import types
import unittest
from test_local_nx_reader import Fixture,STAMP
import local_nx_reader as nx

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

class PreviewTests(unittest.TestCase):
    def setUp(self):
        module=types.ModuleType('staged_preview_nx');module.__file__=str(ROOT/'preview.py')
        exec(compile((ROOT/'preview.py').read_text(encoding='utf-8'),str(ROOT/'preview.py'),'exec'),module.__dict__)
        self.f=Fixture();module._nx=self.f.reader;self.cash_calls=[]
        class Cash:
            def handle(inner,method,path,headers,**kwargs):
                self.cash_calls.append(path)
                if path=='/api-cash-items.json':return nx.LocalResponse(200,{'Content-Length':'9','Cache-Control':'private, no-store, no-transform'},b'' if method=='HEAD' else b'cash-kept')
        module._cash=Cash()
        class Handler(module.Handler):
            def log_message(self,*args):pass
        self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join(2)
    def request(self,method='GET',path=nx.PATH,headers=None):
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        try:
            c.request(method,path,headers=headers or {});r=c.getresponse();return r.status,r.getheaders(),r.read()
        finally:c.close()
    def test_get_head304_and_cash_handler_stays_first(self):
        status,headers,raw=self.request();h=dict(headers);self.assertEqual(status,200);self.assertEqual(h['X-Astra-NX-Captured-At'],STAMP);self.assertEqual([v for k,v in headers if k.lower()=='cache-control'],['private, no-store, no-transform'])
        self.assertEqual(self.request('HEAD')[2],b'');self.assertEqual(self.request(headers={'If-None-Match':h['ETag']})[0],304);self.assertEqual(len(self.f.calls),1)
        count=len(self.f.calls);self.assertEqual(self.request(path='/api-cash-items.json')[2],b'cash-kept');self.assertEqual(len(self.f.calls),count)
    def test_host_query_and_methods_do_not_issue_ownsite_calls(self):
        self.assertEqual(self.request(headers={'Host':'evil.example'})[0],403);self.assertEqual(self.request(path=nx.PATH+'?url=https://provider.example')[0],400);self.assertEqual(self.request('POST')[0],405);self.assertEqual(self.f.calls,[])

if __name__=='__main__':unittest.main()
