import http.client,http.server,json,threading,unittest
from test_local_own_site_session_integration import preview,S
from test_local_own_site_session import Server
class Tests(unittest.TestCase):
 def setUp(self):
  self.m=preview();self.source=Server();self.m._own_session.opener_factory=self.source
  class Handler(self.m.Handler):
   def log_message(self,*a):pass
  self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.port=self.server.server_port
 def tearDown(self):self.server.shutdown();self.server.server_close();self.thread.join()
 def get(self,path,headers=None):
  connection=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5)
  try:
   connection.request('GET',path,headers=headers or {});response=connection.getresponse();return response.status,dict(response.getheaders()),response.read()
  finally:connection.close()
 def test_explicit_profile_header_candidate_then_closed_status_no_HTML_or_cookie_rewrite(self):
  self.m.enable_private_own_site('SYNTHETIC_PASSWORD');status,h,raw=self.get('/version.json');self.assertEqual(status,200);self.assertEqual(raw,(S/'dist/version.json').read_bytes());self.assertEqual(h['X-Astra-Preview'],'password');self.assertEqual(h['Cache-Control'],'private, no-store, no-transform');self.assertNotIn('Set-Cookie',h)
  status,h,raw=self.get('/__preview_controls',{'Origin':f'http://127.0.0.1:{self.port}','Accept':'application/json','X-Astra-Controls-Status':'1'});self.assertEqual(status,200);self.assertEqual(set(json.loads(raw)),{'unlocked','mode','expiresAt'});self.assertEqual(json.loads(raw)['expiresAt'],self.source.cookie_epoch*1000);self.assertEqual(h['X-Astra-Workspace'],'private_workspace');self.assertNotIn('Set-Cookie',h);self.assertEqual(self.source.logins,1)
  status,h,raw=self.get('/index.html');self.assertEqual(status,200);self.assertNotIn('X-Astra-Preview',h);self.assertNotIn(b'data-private-workspace-status',raw)
 def test_default_has_no_header_login_or_status_route_change(self):
  status,h,raw=self.get('/version.json');self.assertEqual(status,200);self.assertNotIn('X-Astra-Preview',h);self.assertEqual(self.source.calls,[])
  status,h,raw=self.get('/__preview_controls',{'Origin':f'http://127.0.0.1:{self.port}','Accept':'application/json','X-Astra-Controls-Status':'1'});self.assertEqual(status,404);self.assertEqual(self.source.calls,[])
 def test_observed_review_revokes_profile_and_emits_review_without_extra_status_GET(self):
  self.m.enable_private_own_site('SYNTHETIC_PASSWORD');status,h,raw=self.get('/version.json');self.assertEqual(h['X-Astra-Preview'],'password');before=sum(p=='/__preview_controls'for p,_ in self.source.calls)
  self.source.mode='review';self.m._cash.transport({},1);self.assertIsNone(self.m._own_session.profile)
  status,h,raw=self.get('/version.json');self.assertEqual(status,200);self.assertEqual(h['X-Astra-Preview'],'review');self.assertEqual(raw,(S/'dist/version.json').read_bytes());self.assertEqual(sum(p=='/__preview_controls'for p,_ in self.source.calls),before)
 def test_failed_profile_never_signals_private_but_original_report_bytes_remain_available(self):
  self.source.fail_login=True;self.m.enable_private_own_site('SYNTHETIC_PASSWORD');status,h,raw=self.get('/version.json');self.assertEqual(status,200);self.assertNotIn('X-Astra-Preview',h);self.assertEqual(raw,(S/'dist/version.json').read_bytes())
  status,h,raw=self.get('/__preview_controls',{'Origin':f'http://127.0.0.1:{self.port}','Accept':'application/json','X-Astra-Controls-Status':'1'});self.assertEqual(status,401);self.assertEqual(json.loads(raw),{'unlocked':False});self.assertNotIn('X-Astra-Workspace',h);self.assertEqual(self.source.logins,1)
if __name__=='__main__':unittest.main()
