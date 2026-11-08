from pathlib import Path
import contextlib,io,sys,types,unittest
from unittest.mock import patch
P=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(P),str(P/'tests')]
import local_login as login
import test_local_browser_login as old

class Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):old.PreviewTests.setUpClass();cls.m=old.PreviewTests.mod
 def test_recognized_absolute_network_fragment_targets_reject_without_query_logs_or_echo(self):
  fixture=old.Tests();controller,session,backend,clock,attached=fixture.fixture();handler=old.PreviewTests()
  for target in ['/__local_login?password=SYNTHETIC_QUERY_CANARY','http://127.0.0.1:8765/__local_login?password=SYNTHETIC_QUERY_CANARY','//127.0.0.1:8765/__local_login?password=SYNTHETIC_QUERY_CANARY','https://foreign.invalid/__local_login?password=SYNTHETIC_QUERY_CANARY','/__local_login#SYNTHETIC_QUERY_CANARY']:
   x=handler.handler(path=target);error=io.StringIO()
   with patch.object(self.m,'_browser_login',controller),contextlib.redirect_stderr(error):self.assertTrue(self.m._serve_browser_login(x))
   self.assertIn(b'400 Bad Request',x.wfile.getvalue());self.assertNotIn(b'SYNTHETIC_QUERY_CANARY',x.wfile.getvalue());self.assertEqual(error.getvalue(),'')
  self.assertEqual(backend.calls,[]);self.assertFalse(session.enabled);self.assertEqual(attached,[])
 def test_malformed_url_or_non_string_new_match_paths_decline_without_parse_exception(self):
  controller,session,backend,clock,attached=old.Tests().fixture()
  for target in ['http://[broken/__local_login','//[broken/__local_login',None,b'/__local_login',1]:
   self.assertFalse(login.is_login_target(target));self.assertFalse(self.m._serve_browser_login(types.SimpleNamespace(path=target)))
   self.assertIsNone(controller.handle('GET',target,{},bind_host='127.0.0.1',client_host='127.0.0.1',port=8765))
  self.assertEqual(backend.calls,[]);self.assertIsNone(controller.nonce)
 def test_near_paths_and_login_text_in_other_query_are_not_claimed(self):
  controller,session,backend,clock,attached=old.Tests().fixture()
  for target in ['/__local_login-extra','/%5f%5flocal_login','/__LOCAL_LOGIN','/ordinary?returnTo=/__local_login','/__local_login/']:
   self.assertFalse(login.is_login_target(target));self.assertFalse(self.m._serve_browser_login(types.SimpleNamespace(path=target)))
   self.assertIsNone(controller.handle('GET',target,{},bind_host='127.0.0.1',client_host='127.0.0.1',port=8765))
  self.assertEqual(backend.calls,[])
 def test_shared_matcher_does_not_accept_absolute_or_network_targets_for_authentication(self):
  controller,session,backend,clock,attached=old.Tests().fixture();reads=[]
  for target in ['http://127.0.0.1:8765/__local_login','//127.0.0.1:8765/__local_login']:
   self.assertTrue(login.is_login_target(target))
   out=controller.handle('POST',target,old.headers(**{'Content-Length':'40','Content-Type':'application/x-www-form-urlencoded'}),bind_host='127.0.0.1',client_host='127.0.0.1',port=8765,read_body=lambda n,t:reads.append(n))
   self.assertEqual(out.status,400);self.assertNotIn('Location',out.headers)
  self.assertEqual(reads,[]);self.assertEqual(backend.calls,[]);self.assertFalse(session.enabled)

if __name__=='__main__':unittest.main(verbosity=2)
