"""Staged Handler over actual loopback HTTP; own-site transport remains synthetic."""
import http.client
import http.server
from pathlib import Path
import sys
import threading
import types
import unittest
from test_local_cash_reader import Fixture,PATH,body,STAMP

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
class IntegrationTests(unittest.TestCase):
 def setUp(self):
  # __file__ points at the actual preview location, so normal local static
  # bindings resolve correctly. No __main__, build, collector or transport runs.
  module=types.ModuleType('staged_preview_reader');module.__file__=str(ROOT/'preview.py')
  source=(ROOT/'preview.py').read_text(encoding='utf-8')
  exec(compile(source,str(ROOT/'preview.py'),'exec'),module.__dict__)
  self.f=Fixture();module._cash=self.f.reader
  class Handler(module.Handler):
   def log_message(self,*args):pass
  self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
  self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
 def tearDown(self):
  self.server.shutdown();self.server.server_close();self.thread.join(timeout=2)
 def request(self,method='GET',path=PATH,headers=None):
  connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=2)
  try:
   connection.request(method,path,headers=headers or {});response=connection.getresponse();return response.status,response.getheaders(),response.read()
  finally:connection.close()
 def test_same_origin_route_head_etag_and_private_headers(self):
  status,headers,raw=self.request();h=dict(headers);self.assertEqual(status,200);self.assertEqual(raw,body());self.assertEqual(h['X-Local-Cash-Source-Captured-At'],STAMP)
  self.assertEqual([v for k,v in headers if k.lower()=='cache-control'],['private, no-store, no-transform'])
  status,headers,raw=self.request('HEAD');self.assertEqual(status,200);self.assertEqual(raw,b'');self.assertEqual(int(dict(headers)['Content-Length']),len(body()))
  status,headers,raw=self.request(headers={'If-None-Match':h['ETag']});self.assertEqual(status,304);self.assertEqual(raw,b'');self.assertEqual(len(self.f.calls),1)
 def test_wrong_host_query_and_post_cannot_turn_into_proxy(self):
  self.assertEqual(self.request(headers={'Host':'evil.example'})[0],403)
  self.assertEqual(self.request(path=PATH+'?url=https://evil.example')[0],400)
  self.assertEqual(self.request('POST')[0],405);self.assertEqual(self.f.calls,[])

if __name__=='__main__':unittest.main()
