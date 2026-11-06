from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import io,json,threading,time,unittest
from unittest.mock import patch
from email.message import Message
from urllib.parse import parse_qs
from local_own_site_session import *
class Response:
 def __init__(self,url,status,body=b'',headers=None):
  self.url=url;self.status=status;self.body=io.BytesIO(body);self.headers=Message()
  for k,v in (headers or {}).items():self.headers[k]=v
 def geturl(self):return self.url
 def info(self):return self.headers
 def read1(self,n):return self.body.read(n)
 def __enter__(self):return self
 def __exit__(self,*a):self.body.close()
class Server:
 def __init__(self):self.calls=[];self.logins=0;self.lock=threading.Lock();self.login_entered=threading.Event();self.data_entered=threading.Event();self.fail_login=False;self.fail_data=0;self.hold_login=None;self.hold_data=None;self.mode='password';self.bad_profile=False;self.cookie_epoch=int(time.time())+28800
 def __call__(self):return self
 def open(self,request,timeout):
  path=request.full_url.removeprefix(HOST)
  with self.lock:self.calls.append((path,request));
  if path=='/__preview_login':
   with self.lock:self.logins+=1
   self.login_entered.set()
   if self.hold_login:self.hold_login.wait(2)
   if self.fail_login:return Response(request.full_url,401)
   if parse_qs(request.data.decode()).get('password')!=['SYNTHETIC_PASSWORD']:return Response(request.full_url,401)
   self.cookie_epoch=int(time.time())+28800
   return Response(request.full_url,303,headers={'Location':'/','X-Astra-Preview':self.mode,'Set-Cookie':f'{COOKIE}={self.cookie_epoch}.'+'a'*22+'.'+'b'*43+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800'})
  if path==STATUS:
   value={'unlocked':True,'mode':'private_workspace','expiresAt':self.cookie_epoch*1000}
   if self.bad_profile:value['extra']='no'
   return Response(request.full_url,200,json.dumps(value).encode(),{'Content-Type':'application/json','X-Astra-Preview':self.mode,'X-Astra-Workspace':'private_workspace','Cache-Control':'private, no-store, no-transform','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store'})
  self.data_entered.set()
  if self.hold_data:self.hold_data.wait(2)
  if self.fail_data:
   self.fail_data-=1;return Response(request.full_url,401)
  return Response(request.full_url,200,b'{"source":"unchanged"}',{'Content-Type':'application/json','X-Astra-Preview':self.mode,'X-Astra-Cash-Captured-At':'2026-11-06T17:00:00.000Z','ETag':'"original"'})
def session(server=None):
 server=server or Server();s=OwnSiteSession(opener_factory=server);s.configure('SYNTHETIC_PASSWORD');return s,server
class Tests(unittest.TestCase):
 def test_default_zero_io_or_credential_or_private_marker(self):
  s=OwnSiteSession(opener_factory=lambda:(_ for _ in ()).throw(AssertionError('no opener')))
  with self.assertRaises(AuthenticationUnavailable):s.get('/api-cash-items.json',{},.1,RawResponse)
  self.assertIsNone(control_response(s,'GET',STATUS,{},bind_host='127.0.0.1',client_host='127.0.0.1',port=8765))
 def test_login_normal_form_hostonly_cookie_not_forwarded_to_local_response(self):
  s,v=session();r=s.get('/api-cash-items.json',{},1,RawResponse);self.assertEqual(r.body,b'{"source":"unchanged"}');self.assertEqual(v.logins,1)
  login=v.calls[0][1];self.assertEqual(login.get_method(),'POST');self.assertEqual(login.get_header('Origin'),HOST);self.assertEqual(login.full_url,HOST+'/__preview_login');self.assertTrue(v.calls[1][1].get_header('Cookie').startswith(COOKIE+'='));self.assertNotIn('set-cookie',r.headers)
 def test_session_reused_across_all_fixed_readers_and_etag_condition_retained(self):
  s,v=session()
  for p in ['/api-cash-items.json','/api-nx-offers.json','/api-market-calculations.json','/api-item-identities.json','/api-item-prices/2040801.json','/api-nx-history.json','/api-item-history/1082002/manifest.json']:s.get(p,{'If-None-Match':'"old"'},1,RawResponse)
  self.assertEqual(v.logins,1);self.assertTrue(all(req.get_header('If-none-match')=='"old"' for p,req in v.calls if p!='/__preview_login'))
 def test_arbitrary_paths_queries_headers_timeouts_rejected_without_network(self):
  s,v=session()
  for path in ['https://elsewhere.invalid','//elsewhere','/api/prices','/api-cash-items.json?cookie=x','/api-item-history/1/manifest.json','/api-item-prices/1.json?x=1']:
   with self.assertRaises(AuthenticationUnavailable):s.get(path,{},.1,RawResponse)
  for h,t in [({'Cookie':'no'},.1),({},99),({},True)]:
   with self.assertRaises(AuthenticationUnavailable):s.get('/api-cash-items.json',h,t,RawResponse)
  self.assertEqual(v.calls,[])
 def test_shared_login_singleflight_and_no_cookie_copy_or_second_credentials(self):
  s,v=session();v.hold_login=threading.Event();out=[]
  def fetch():
   try:out.append(s.get('/api-cash-items.json',{},1,RawResponse).status)
   except AuthenticationUnavailable:out.append(503)
  threads=[threading.Thread(target=fetch) for _ in range(5)]
  for t in threads:t.start()
  self.assertTrue(v.login_entered.wait(1));self.assertEqual(v.logins,1);v.hold_login.set()
  for t in threads:t.join()
  self.assertEqual(out,[200]*5);self.assertEqual(v.logins,1)
 def test_timedout_login_keeps_physical_reservation_and_late_cookie_cannot_commit(self):
  s,v=session();v.hold_login=threading.Event()
  def forced_timeout(*a,**kw):
   s.cv.release()
   try:self.assertTrue(v.login_entered.wait(1))
   finally:s.cv.acquire()
   self.assertLessEqual(kw['timeout'],MAX_TIMEOUT);return False
  with patch.object(s.cv,'wait_for',side_effect=forced_timeout):
   for _ in range(2):
    with self.assertRaises(AuthenticationUnavailable):s.get('/api-cash-items.json',{},1,RawResponse)
  self.assertEqual(v.logins,1);v.hold_login.set()
  with s.cv:self.assertTrue(s.cv.wait_for(lambda:not s.flights,timeout=2))
  self.assertIsNone(s._cookie());self.assertEqual(v.logins,1)
 def test_held_data_timeout_keeps_one_physical_get_and_preserves_no_late_accept(self):
  s,v=session();s._ensure_login(1);v.hold_data=threading.Event()
  def forced_timeout(*a,**kw):
   s.cv.release()
   try:self.assertTrue(v.data_entered.wait(1))
   finally:s.cv.acquire()
   return False
  with patch.object(s.cv,'wait_for',side_effect=forced_timeout):
   for _ in range(2):
    with self.assertRaises(AuthenticationUnavailable):s.get('/api-cash-items.json',{},1,RawResponse)
  self.assertEqual(sum(p=='/api-cash-items.json' for p,_ in v.calls),1);v.hold_data.set()
  with s.cv:self.assertTrue(s.cv.wait_for(lambda:not s.flights,timeout=2))
  self.assertEqual(s.flights,{})
 def test_wrongpassword_backoff_no_retry_loop_or_payload_echo(self):
  s,v=session();v.fail_login=True
  for _ in range(3):
   with self.assertRaises(AuthenticationUnavailable)as e:s.get('/api-cash-items.json',{},.1,RawResponse)
   self.assertNotIn('PASSWORD',str(e.exception))
  self.assertEqual(v.logins,1)
 def test_401_not_data_one_shared_reauth_then_bounded_success(self):
  s,v=session();s._ensure_login(1);v.fail_data=1;r=s.get('/api-cash-items.json',{},1,RawResponse);self.assertEqual(r.status,200);self.assertEqual(v.logins,2);self.assertEqual(sum(p=='/api-cash-items.json' for p,_ in v.calls),2)
 def test_repeated_401_retains_auth_failure_status_never_market_body(self):
  s,v=session();v.fail_data=10
  with self.assertRaises(AuthenticationUnavailable):s.get('/api-cash-items.json',{},1,RawResponse)
  first=v.logins
  with self.assertRaises(AuthenticationUnavailable):s.get('/api-cash-items.json',{},.1,RawResponse)
  self.assertEqual(v.logins,first)
 def test_original_profile_expiry_cached_and_no_source_clock_or_cookie_leak(self):
  s,v=session();p=s.verified_profile(1);self.assertEqual(p,{'unlocked':True,'mode':'private_workspace','expiresAt':v.cookie_epoch*1000});self.assertEqual(s.verified_profile(1),p);self.assertEqual(sum(p==STATUS for p,_ in v.calls),1);self.assertNotIn('Cookie',json.dumps(p));self.assertNotIn('captured',json.dumps(p))
 def test_admission_rechecks_already_completed_login_and_profile_without_second_physical_call(self):
  s,v=session();p=s.verified_profile(1);before=len(v.calls)
  def forbidden():raise AssertionError('already completed concurrent owner result must be reused')
  self.assertIs(s._run(('login',),forbidden,1,s.epoch),s._jar);self.assertEqual(s._run(('profile',),forbidden,1,s.epoch),p);self.assertEqual(len(v.calls),before)
 def test_nonprivate_or_malformed_profile_never_promotes(self):
  for wrong in ['review','extra']:
   s,v=session();v.mode='review' if wrong=='review' else'password';v.bad_profile=wrong=='extra'
   with self.assertRaises(AuthenticationUnavailable):s.verified_profile(1)
   self.assertIsNone(s.profile)
 def test_late_private_status_cannot_restore_profile_after_observed_review_response(self):
  entered=threading.Event();release=threading.Event()
  class Racing(Server):
   hold=False
   def open(self,request,timeout):
    r=super().open(request,timeout)
    if request.full_url==HOST+STATUS and self.hold:entered.set();release.wait(2)
    return r
  v=Racing();s,_=session(v);s.verified_profile(1);s.profile_at-=61;v.hold=True;errors=[]
  def status():
   try:s.verified_profile(1)
   except AuthenticationUnavailable:errors.append(True)
  thread=threading.Thread(target=status);thread.start();self.assertTrue(entered.wait(1));v.mode='review';s.get('/api-cash-items.json',{},1,RawResponse);release.set();thread.join();self.assertEqual(errors,[True]);self.assertIsNone(s.profile);self.assertTrue(s.observed_review())
 def test_off_or_reconfiguration_fences_pending_login_and_does_not_send_old_login_again(self):
  s,v=session();v.hold_login=threading.Event();errors=[]
  t=threading.Thread(target=lambda:self._capture_error(s,errors));t.start();self.assertTrue(v.login_entered.wait(1));s.disable();v.hold_login.set();t.join();self.assertFalse(s.enabled);self.assertIsNone(s._cookie());self.assertEqual(len(errors),1)
 def _capture_error(self,s,errors):
  try:s.get('/api-cash-items.json',{},1,RawResponse)
  except AuthenticationUnavailable:errors.append(True)
 def test_local_status_requires_explicit_loopback_host_origin_and_request_marker(self):
  s,v=session();h={'Host':'127.0.0.1:8765','Origin':'http://127.0.0.1:8765','Accept':'application/json','X-Astra-Controls-Status':'1'}
  for change in [{'Host':'evil.invalid:8765'},{'Origin':'https://elsewhere.invalid'},{'Origin':'https://elsewhere.invalid','Sec-Fetch-Site':'same-origin'},{'Host':'127.0.0.1:8766'},{'X-Astra-Controls-Status':'0'}]:
   r=control_response(s,'GET',STATUS,{**h,**change},bind_host='127.0.0.1',client_host='127.0.0.1',port=8765);self.assertIn(r.status,[400,403])
  self.assertEqual(v.calls,[]);r=control_response(s,'GET',STATUS,h,bind_host='127.0.0.1',client_host='127.0.0.1',port=8765);self.assertEqual(r.status,200);self.assertEqual(r.headers['X-Astra-Preview'],'password');self.assertEqual(r.headers['X-Astra-Workspace'],'private_workspace');self.assertNotIn('Set-Cookie',r.headers)
 def test_duplicate_headers_and_false_marker_cannot_bypass(self):
  h=Message();h['Host']='127.0.0.1:8765';h['Host']='evil.invalid';self.assertFalse(local_request_allowed(h,'127.0.0.1','127.0.0.1',8765,origin_proof=False))
  self.assertFalse(local_request_allowed({'Host':'127.0.0.1:8765','Sec-Fetch-Site':'cross-site'},'127.0.0.1','127.0.0.1',8765,origin_proof=False))
 def test_password_only_stdin_or_non_echo_prompt_never_env_or_file(self):
  self.assertEqual(read_password(stdin=io.BytesIO(b'SYNTHETIC_PASSWORD\n')),'SYNTHETIC_PASSWORD');self.assertEqual(read_password(prompt=lambda _:'SYNTHETIC_PASSWORD'),'SYNTHETIC_PASSWORD')
  for raw in [b'',b'x'*1025,b'bad\rvalue\n',b'\xff\n']:
   with self.assertRaises(AuthenticationUnavailable):read_password(stdin=io.BytesIO(raw))
if __name__=='__main__':unittest.main()
