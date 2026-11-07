import ast,hashlib,io,json,sys,types,unittest
from pathlib import Path
from unittest.mock import patch
H=Path(__file__).resolve().parents[1];S=H;sys.path.insert(0,str(S))
from test_local_own_site_session import Server,Response
import local_own_site_session as auth
import local_calculations_reader as calc
def preview():
 m=types.ModuleType('private_local_preview_synthetic');m.__file__=str(S/'preview.py');exec(compile((S/'preview.py').read_text(encoding='utf-8'),str(S/'preview.py'),'exec'),m.__dict__);return m
class Tests(unittest.TestCase):
 def test_off_keeps_all_six_transport_functions_and_every_existing_cache_object(self):
  m=preview();readers=[m._cash,m._nx,m._items,m._nx_history,m._item_hours,m._calculations];before=[dict(vars(r)) for r in readers]
  self.assertFalse(auth.attach_readers(m._own_session,cash=m._cash,nx=m._nx,items=m._items,nx_history=m._nx_history,item_hours=m._item_hours,calculations=m._calculations))
  for r,b in zip(readers,before):self.assertEqual(vars(r),b)
 def test_on_changes_only_transport_not_due_cache_clocks_flags_or_validator(self):
  m=preview();v=Server();m._own_session.opener_factory=v;readers=[m._cash,m._nx,m._items,m._nx_history,m._item_hours,m._calculations];before=[dict(vars(r)) for r in readers];m.enable_private_own_site('SYNTHETIC_PASSWORD')
  for r,b in zip(readers,before):self.assertIsNot(r.transport,b['transport']);self.assertEqual({k:v for k,v in vars(r).items() if k!='transport'},{k:v for k,v in b.items() if k!='transport'})
  for r,args in [(m._cash,({},1)),(m._nx,({},1)),(m._items,('/api-item-prices/2040801.json',{},1)),(m._nx_history,('/api-nx-history.json',{},1)),(m._item_hours,('/api-item-history/1082002/manifest.json',{},1)),(m._calculations,({},1))]:self.assertEqual(r.transport(*args).status,200)
  self.assertEqual(v.logins,1)
 def test_no_HTML_change_and_candidate_only_successful_fixed_JSON_GET_after_verified_profile(self):
  m=preview();v=Server();m._own_session.opener_factory=v;m.enable_private_own_site('SYNTHETIC_PASSWORD')
  h=types.SimpleNamespace(path='/version.json',command='GET',_private_response_status=200,headers={'Host':'localhost:8765'},server=types.SimpleNamespace(server_address=('127.0.0.1',8765)),client_address=('127.0.0.1',123))
  h._private_json_eligible=types.MethodType(m.Handler._private_json_eligible,h)
  self.assertTrue(m.Handler._private_json_candidate(h));self.assertEqual(v.logins,1);self.assertEqual(sum(p=='/__preview_controls'for p,_ in v.calls),1)
  for path,method,status in [('/', 'GET',200),('/version.json?x=1','GET',200),('/__ui_version','GET',200),('/version.json','HEAD',200),('/version.json','GET',304)]:
   h.path=path;h.command=method;h._private_response_status=status;self.assertFalse(m.Handler._private_json_candidate(h))
  new=(S/'preview.py').read_text(encoding='utf-8')
  def method(text):
   tree=ast.parse(text);cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='Handler');node=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='_serve_calculation_index');return ast.get_source_segment(text,node)
  self.assertNotIn('_own_session',method(new));self.assertNotIn('data-private-workspace-status',new)
 def test_actual_unchanged_calculation_validator_withdraws_raw_on_typed_auth401(self):
  raw=(S/'tests/api-calculations-local-snapshot.json').read_bytes();dto=json.loads(raw);now=[0]
  class Backend(Server):
   def open(self,request,timeout):
    if request.full_url==auth.HOST+'/api-market-calculations.json' and self.fail_data==0:
     self.calls.append(('/api-market-calculations.json',request));return Response(request.full_url,200,raw,{'Content-Type':'application/json','X-Astra-Preview':'password','ETag':'"api-calculations-'+hashlib.sha256(raw).hexdigest()+'"','X-Astra-Calculations-Definition-Hash':dto['definitionHash'],'X-Astra-Calculations-Prices-Captured-At':dto['sources']['prices']['capturedAt'],'X-Astra-Calculations-Overview-Captured-At':dto['sources']['overview']['capturedAt'],'X-Astra-Calculations-Mode':'accepted_cache'})
    return super().open(request,timeout)
  backend=Backend();s=auth.OwnSiteSession(opener_factory=backend);s.configure('SYNTHETIC_PASSWORD')
  reader=calc.LocalCalculationsReader(enabled=True,transport=lambda c,t:auth.reader_response(s,calc.PATH,c,t,calc.TransportResponse),monotonic=lambda:now[0])
  get=lambda:reader.handle('GET',calc.PATH,{'Host':'localhost:8765'})
  a=get();self.assertEqual(a.status,200);self.assertEqual(a.body,raw);capture=a.headers[calc.PREFIX+'Prices-Captured-At'];now[0]=61;backend.fail_data=10;b=get();self.assertEqual(b.status,401);self.assertNotEqual(b.body,raw);self.assertNotIn('ETag',b.headers);self.assertNotIn(calc.PREFIX+'Prices-Captured-At',b.headers);self.assertIsNone(reader.raw);self.assertIsNotNone(reader.error);self.assertEqual(capture,dto['sources']['prices']['capturedAt'])
 def test_status_success_is_closed_and_auth_errors_are_never_data_or_cookie_egress(self):
  s=auth.OwnSiteSession(opener_factory=Server());s.configure('SYNTHETIC_PASSWORD');headers={'Host':'localhost:8765','Origin':'http://localhost:8765','Accept':'application/json','X-Astra-Controls-Status':'1'}
  r=auth.control_response(s,'GET',auth.STATUS,headers,bind_host='127.0.0.1',client_host='127.0.0.1',port=8765);self.assertEqual(r.status,200);self.assertEqual(set(json.loads(r.body)),{'unlocked','mode','expiresAt'});self.assertNotIn('Set-Cookie',r.headers);self.assertNotIn('SYNTHETIC',r.body.decode())
  s.disable();self.assertIsNone(auth.control_response(s,'GET',auth.STATUS,headers,bind_host='127.0.0.1',client_host='127.0.0.1',port=8765))
 def test_review_auth_transport_continues_data_but_never_claims_private_workspace(self):
  server=Server();server.mode='review';s=auth.OwnSiteSession(opener_factory=server);s.configure('SYNTHETIC_PASSWORD');self.assertEqual(s.get('/api-cash-items.json',{},1,auth.RawResponse).status,200)
  with self.assertRaises(auth.AuthenticationUnavailable):s.verified_profile(1)
  self.assertIsNone(s.profile)
if __name__=='__main__':unittest.main()
