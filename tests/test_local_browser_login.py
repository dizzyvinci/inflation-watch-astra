from pathlib import Path
import ast,contextlib,importlib.util,io,json,os,re,sys,threading,time,types,unittest
from email.message import Message
from urllib.parse import urlencode
from unittest.mock import patch
HERE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(HERE));sys.path.insert(0,str(HERE/'tests'))
import local_login as login
from local_own_site_session import OwnSiteSession,AuthenticationUnavailable
from test_local_own_site_session import Server

def headers(**changes):
 d={'Host':'127.0.0.1:8765','Origin':'http://127.0.0.1:8765','Sec-Fetch-Site':'same-origin'};d.update(changes)
 h=Message()
 for k,v in d.items():
  if v is not None:h[k]=v
 return h

class Tests(unittest.TestCase):
 def fixture(self):
  backend=Server();clock=[0.0];session=OwnSiteSession(opener_factory=backend,monotonic=lambda:clock[0])
  attached=[];controller=login.LocalBrowserLogin(session,lambda:attached.append('attached'),enabled=True)
  return controller,session,backend,clock,attached
 def get(self,c,**kw):
  return c.handle('GET',login.PATH,headers(**kw),bind_host='127.0.0.1',client_host='127.0.0.1',port=8765)
 def form(self,c):
  out=self.get(c);self.assertEqual(out.status,200)
  return re.search(rb'name="nonce" value="([A-Za-z0-9_-]+)"',out.body).group(1).decode()
 def post(self,c,nonce=None,password='SYNTHETIC_PASSWORD',raw=None,read=None,**kw):
  raw=raw if raw is not None else urlencode({'nonce':nonce,'password':password}).encode()
  h=headers(**{'Content-Type':'application/x-www-form-urlencoded','Content-Length':str(len(raw)),**kw})
  return c.handle('POST',login.PATH,h,bind_host='127.0.0.1',client_host='127.0.0.1',port=8765,read_body=read or (lambda n,t:raw))
 def test_default_off_has_zero_nonce_read_body_native_or_auth(self):
  c,s,v,clock,a=self.fixture();c.enabled=False
  c.nonce_factory=lambda:(_ for _ in ()).throw(AssertionError('nonce must remain off'))
  out=self.post(c,'x',read=lambda n,t:(_ for _ in ()).throw(AssertionError('no read')))
  self.assertEqual(out.status,404);self.assertEqual(v.calls,[]);self.assertFalse(s.enabled);self.assertEqual(a,[])
 def test_script_free_form_is_blank_fixed_action_nonce_and_private_no_store(self):
  c,*_=self.fixture();out=self.get(c,Origin=None)
  self.assertEqual(out.status,200);self.assertIn(b'type="password" name="password" value="" autocomplete="off"',out.body)
  self.assertIn(b'action="/__local_login"',out.body);self.assertNotIn(b'<script',out.body)
  self.assertEqual(out.headers['Referrer-Policy'],'same-origin');self.assertEqual(out.headers['X-Frame-Options'],'DENY')
  self.assertIn("script-src 'none'",out.headers['Content-Security-Policy']);self.assertEqual(out.headers['Cache-Control'],'private, no-store, no-transform')
  self.assertNotIn('Set-Cookie',out.headers);self.assertEqual(int(out.headers['Content-Length']),len(out.body))
 def test_real_same_session_success_requires_profile_and_returns_empty303_only_root(self):
  c,s,v,clock,a=self.fixture();out=self.post(c,self.form(c))
  self.assertEqual(out.status,303);self.assertEqual(out.body,b'');self.assertEqual(out.headers['Location'],'/')
  self.assertEqual([p for p,r in v.calls],['/__preview_login','/__preview_controls']);self.assertEqual(a,['attached'])
  self.assertTrue(s.enabled);self.assertEqual(s.access_mode,'password');self.assertEqual(len(s.flights),0)
  self.assertNotIn('SYNTHETIC_PASSWORD',json.dumps(out.headers));self.assertNotIn('Set-Cookie',out.headers)
 def test_no_origin_foreign_origin_host_port_or_remote_client_reaches_body(self):
  c,s,v,clock,a=self.fixture();nonce=self.form(c);reads=[]
  for extra in [{'Origin':None},{'Origin':'https://evil.invalid'},{'Host':'localhost:8765'},{'Host':'127.0.0.1:8766'},{'Sec-Fetch-Site':'cross-site'}]:
   out=self.post(c,nonce,read=lambda n,t:reads.append(n)or b'',**extra);self.assertEqual(out.status,400)
  for key,value in [('port',8766),('bind_host','0.0.0.0'),('client_host','192.0.2.1')]:
   opts={'bind_host':'127.0.0.1','client_host':'127.0.0.1','port':8765,key:value}
   out=c.handle('GET',login.PATH,headers(),**opts);self.assertEqual(out.status,400)
  self.assertEqual(reads,[]);self.assertEqual(v.calls,[])
 def test_localhost_exact_origin_pair_is_supported(self):
  c,s,v,clock,a=self.fixture();nonce=self.form(c)
  self.assertEqual(self.post(c,nonce,Host='localhost:8765',Origin='http://localhost:8765').status,303)
 def test_bad_framing_type_duplicate_and_transfer_encoding_reject_before_read(self):
  c,s,v,clock,a=self.fixture();nonce=self.form(c);reads=[]
  for changes in [{'Content-Length':'4097'},{'Content-Length':'01'},{'Content-Length':None},{'Content-Length':'-1'},{'Content-Type':'application/json'},{'Transfer-Encoding':'chunked'}]:
   out=self.post(c,nonce,read=lambda n,t:reads.append(n)or b'',**changes);self.assertEqual(out.status,400)
  h=headers(**{'Content-Length':'20','Content-Type':'application/x-www-form-urlencoded'});h['Host']='127.0.0.1:8765'
  self.assertEqual(c.handle('POST',login.PATH,h,bind_host='127.0.0.1',client_host='127.0.0.1',port=8765,read_body=lambda n,t:reads.append(n)).status,400)
  self.assertEqual(reads,[]);self.assertEqual(v.calls,[])
 def test_strict_fields_encoding_password_and_nonce_never_echo_or_auth(self):
  c,s,v,clock,a=self.fixture();nonce=self.form(c)
  bodies=[b'password=x',b'nonce=x&password=a&password=b',b'nonce=x&password=%ZZ',b'nonce=x&password=%FF',b'nonce=x&password=a%0Ab',b'nonce=x&password=',urlencode({'nonce':nonce,'password':'x'*257}).encode(),urlencode({'nonce':'wrong','password':'SYNTHETIC_PASSWORD'}).encode()]
  for body in bodies:
   out=self.post(c,raw=body);self.assertEqual(out.status,401);self.assertNotIn(b'SYNTHETIC_PASSWORD',out.body)
  self.assertEqual(v.calls,[]);self.assertEqual(c.attempts,[])
 def test_nonce_single_use_rotation_and_expiry(self):
  c,s,v,clock,a=self.fixture();old=self.form(c);nonce=self.form(c)
  self.assertEqual(self.post(c,old).status,401);clock[0]=301
  self.assertEqual(self.post(c,nonce).status,401);self.assertEqual(v.calls,[])
  nonce=self.form(c);self.assertEqual(self.post(c,nonce).status,303);before=len(v.calls)
  self.assertEqual(self.post(c,nonce).status,401);self.assertEqual(len(v.calls),before)
 def test_failed_password_disables_logical_state_preserves_native_backoff_no_retry(self):
  c,s,v,clock,a=self.fixture();out=self.post(c,self.form(c),password='SYNTHETIC_WRONG')
  self.assertEqual(out.status,401);self.assertFalse(s.enabled);self.assertGreater(s.retry_at,clock[0]);self.assertEqual(v.logins,1);self.assertEqual(a,[])
  self.assertEqual(self.get(c).status,429);self.assertEqual(self.post(c,'old').status,429);self.assertEqual(v.logins,1)
  clock[0]=s.retry_at;self.assertEqual(self.post(c,self.form(c)).status,303);self.assertEqual(v.logins,2)
 def test_actual_malformed_private_profile_is_not_attach_or_redirect(self):
  c,s,v,clock,a=self.fixture();v.bad_profile=True;out=self.post(c,self.form(c))
  self.assertEqual(out.status,401);self.assertFalse(s.enabled);self.assertEqual(a,[]);self.assertGreater(s.profile_retry,0)
 def test_actual_review_mode_is_not_private_workspace_success(self):
  c,s,v,clock,a=self.fixture();v.mode='review';out=self.post(c,self.form(c))
  self.assertEqual(out.status,401);self.assertFalse(s.enabled);self.assertEqual(a,[])
 def test_three_manual_attempts_per60_seconds_demand_only_not_lifetime(self):
  c,s,v,clock,a=self.fixture()
  for at in [0,1,2]:
   clock[0]=at;self.assertEqual(self.post(c,self.form(c)).status,303)
  self.assertEqual(self.get(c).status,429);self.assertEqual(v.logins,3)
  clock[0]=60;self.assertEqual(v.logins,3);self.assertEqual(self.post(c,self.form(c)).status,303);self.assertEqual(v.logins,4)
 def test_held_native_work_prevents_reconfigure_and_late_password_commit(self):
  c,s,v,clock,a=self.fixture();v.hold_login=threading.Event();nonce=self.form(c)
  def timeout(*args,**kw):
   s.cv.release()
   try:self.assertTrue(v.login_entered.wait(1))
   finally:s.cv.acquire()
   return False
  with patch.object(s.cv,'wait_for',side_effect=timeout):out=self.post(c,nonce)
  self.assertEqual(out.status,401);self.assertFalse(s.enabled);self.assertEqual(len(s.flights),1);epoch=s.epoch
  self.assertEqual(self.get(c).status,423);self.assertEqual(self.post(c,'old').status,423);self.assertEqual(s.epoch,epoch);self.assertEqual(v.logins,1)
  v.hold_login.set()
  with s.cv:self.assertTrue(s.cv.wait_for(lambda:not s.flights,timeout=1))
  self.assertFalse(s.enabled);self.assertEqual(a,[])
 def test_single_body_slot_blocks_second_form_and_submit_before_native_auth(self):
  c,s,v,clock,a=self.fixture();nonce=self.form(c);inside=threading.Event();release=threading.Event();out=[]
  raw=urlencode({'nonce':nonce,'password':'SYNTHETIC_PASSWORD'}).encode()
  def read(n,t):inside.set();self.assertTrue(release.wait(1));return raw
  thread=threading.Thread(target=lambda:out.append(self.post(c,nonce,read=read)));thread.start();self.assertTrue(inside.wait(1))
  self.assertEqual(self.get(c).status,423);self.assertEqual(self.post(c,nonce).status,423);self.assertEqual(v.calls,[])
  release.set();thread.join(1);self.assertFalse(thread.is_alive());self.assertEqual(out[0].status,303);self.assertEqual(v.logins,1)
 def test_short_body_timeout_and_original_absolute_body_budget(self):
  c,s,v,clock,a=self.fixture();nonce=self.form(c);limits=[]
  def short(n,t):limits.append((n,t));return b'x'
  self.assertEqual(self.post(c,nonce,read=short).status,401);self.assertLessEqual(limits[0][1],3)
  def late(n,t):clock[0]+=3;return urlencode({'nonce':nonce,'password':'SYNTHETIC_PASSWORD'}).encode()
  self.assertEqual(self.post(c,nonce,read=late).status,401);self.assertEqual(v.calls,[])
 def test_final_attach_callback_disable_cannot_emit_success(self):
  c,s,v,clock,a=self.fixture();c.on_success=s.disable
  self.assertEqual(self.post(c,self.form(c)).status,401);self.assertFalse(s.enabled)
 def test_query_and_other_methods_never_reflect_input(self):
  c,s,v,clock,a=self.fixture()
  for method,path,status in [('GET',login.PATH+'?password=SYNTHETIC_PASSWORD',400),('PUT',login.PATH,405),('HEAD',login.PATH,405)]:
   out=c.handle(method,path,headers(),bind_host='127.0.0.1',client_host='127.0.0.1',port=8765);self.assertEqual(out.status,status);self.assertNotIn(b'SYNTHETIC_PASSWORD',out.body)
  self.assertIsNone(c.handle('GET','/api-cash-items.json',{},bind_host='no',client_host='no',port=0));self.assertEqual(v.calls,[])

class PreviewTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  spec=importlib.util.spec_from_file_location('login_preview_test',HERE/'preview.py');cls.mod=importlib.util.module_from_spec(spec);sys.modules[spec.name]=cls.mod;spec.loader.exec_module(cls.mod)
 def test_cli_old_defaults_and_input_modes_preserved_new_combinations_closed(self):
  m=self.mod;a=m.parse_arguments([]);self.assertEqual((a.port,a.no_collector,a.private_own_site,a.offline),(8765,False,False,False))
  self.assertTrue(m.parse_arguments(['--private-own-site','--private-password-stdin']).private_password_stdin)
  for args in [['--private-own-site-browser-login','--private-own-site'],['--private-own-site-browser-login','--private-password-stdin'],['--private-own-site-browser-login','--port','8766'],['--existing-build'],['--existing-build','--no-collector','--offline']]:
   with self.assertRaises(SystemExit):m.parse_arguments(args)
  a=m.parse_arguments(['--private-own-site-browser-login','--existing-build','--no-collector']);self.assertTrue(a.existing_build)
 def test_existing_build_main_uses_verified_only_no_password_build_collector_or_real_server(self):
  m=self.mod;calls=[]
  class FakeServer:
   def __init__(self,address,handler):calls.append(('server',address))
   def serve_forever(self):calls.append(('serve',));raise KeyboardInterrupt()
   def server_close(self):calls.append(('closed',))
  tree=ast.parse((HERE/'preview.py').read_text());main=next(n for n in tree.body if isinstance(n,ast.If)and isinstance(n.test,ast.Compare)and isinstance(n.test.left,ast.Name)and n.test.left.id=='__name__')
  code=compile(ast.fix_missing_locations(ast.Module(body=main.body,type_ignores=[])),'fake-main-only','exec')
  with patch.object(sys,'argv',['preview.py','--private-own-site-browser-login','--existing-build','--no-collector']),patch.object(m,'build',side_effect=AssertionError('no build')),patch.object(m,'read_password',side_effect=AssertionError('no console')),patch.object(m,'verified_output',return_value=({'sourceUpdatedAt':'2026-11-07T14:14:00Z'},'a'*16))as verify,patch.object(m.http.server,'ThreadingHTTPServer',FakeServer),patch.object(m.threading,'Thread',side_effect=AssertionError('no collector')),contextlib.redirect_stdout(io.StringIO()):exec(code,m.__dict__)
  self.assertEqual(verify.call_count,1);self.assertEqual(calls,[('server',('127.0.0.1',8765)),('serve',),('closed',)])
  m._browser_login.enabled=False
 def handler(self,path=login.PATH,method='GET',raw=b'',h=None):
  m=self.mod;x=object.__new__(m.Handler);x.path=path;x.command=method;x.headers=h or headers();x.server=types.SimpleNamespace(server_address=('127.0.0.1',8765));x.client_address=('127.0.0.1',1);x.wfile=io.BytesIO();x.rfile=io.BytesIO(raw);x.request_version='HTTP/1.1';x.requestline=method+' '+path+' HTTP/1.1';x.connection=types.SimpleNamespace(gettimeout=lambda:None,settimeout=lambda t:None)
  return x
 def test_actual_handler_emits_one_strict_csp_referrer_no_store_without_base_private_headers(self):
  m=self.mod;c,s,v,clock,a=Tests().fixture();x=self.handler()
  with patch.object(m,'_browser_login',c):self.assertTrue(m._serve_browser_login(x))
  raw=x.wfile.getvalue();self.assertIn(b'200 OK',raw);self.assertEqual(raw.count(b'Referrer-Policy:'),1);self.assertIn(b'Referrer-Policy: same-origin',raw);self.assertNotIn(b'X-Astra-Preview:',raw);self.assertIn(b'Connection: close',raw);self.assertTrue(x.close_connection)
 def test_actual_post_adapter_bounds_socket_read_and_restores_timeout(self):
  m=self.mod;c,s,v,clock,a=Tests().fixture();nonce=Tests().form(c);body=urlencode({'nonce':nonce,'password':'SYNTHETIC_PASSWORD'}).encode();values=[]
  x=self.handler(method='POST',raw=body,h=headers(**{'Content-Type':'application/x-www-form-urlencoded','Content-Length':str(len(body))}));x.connection=types.SimpleNamespace(gettimeout=lambda:9,settimeout=values.append)
  with patch.object(m,'_browser_login',c):self.assertTrue(m._serve_browser_login(x))
  self.assertTrue(0<values[0]<=3);self.assertEqual(values[-1],9);self.assertIn(b'303 See Other',x.wfile.getvalue());self.assertNotIn(b'SYNTHETIC_PASSWORD',x.wfile.getvalue())
 def test_login_query_logs_suppressed_and_unrelated_fake_handler_requires_no_new_method(self):
  m=self.mod;x=types.SimpleNamespace(path=login.PATH+'?password=SYNTHETIC_PASSWORD')
  self.assertIsNone(m.Handler.log_message(x,'%s','POST '+x.path));self.assertFalse(m._serve_browser_login(types.SimpleNamespace(path='/ordinary')))
 def test_slow_partial_body_uses_decreasing_absolute_socket_budget_and_never_authenticates(self):
  m=self.mod;c,s,v,clock,a=Tests().fixture();nonce=Tests().form(c);body=urlencode({'nonce':nonce,'password':'SYNTHETIC_PASSWORD'}).encode();values=[];reads=[]
  class Slow:
   def read1(self,n):reads.append(n);clock[0]+=1.1;return b'x'
  x=self.handler(method='POST',h=headers(**{'Content-Type':'application/x-www-form-urlencoded','Content-Length':str(len(body))}));x.rfile=Slow();x.connection=types.SimpleNamespace(gettimeout=lambda:9,settimeout=values.append)
  with patch.object(m,'_browser_login',c),patch.object(m.time,'monotonic',side_effect=lambda:clock[0]):self.assertTrue(m._serve_browser_login(x))
  self.assertEqual(len(reads),3);self.assertEqual(values[-1],9);self.assertGreater(values[0],values[1]);self.assertGreater(values[1],values[2]);self.assertEqual(v.calls,[]);self.assertIn(b'401 Unauthorized',x.wfile.getvalue())

if __name__=='__main__':unittest.main(verbosity=2)
