"""No sockets/hosts/browser sessions: actual parsers and RAM session/mock opener."""
from pathlib import Path
import importlib.util,tempfile,types
import sys,base64,copy,hashlib,io,json,os,subprocess,threading,time,unittest
from email.message import Message
from unittest.mock import patch
HERE=Path(__file__).resolve().parent;SITE=HERE.parent;sys.path.insert(0,str(SITE));sys.path.insert(0,str(HERE))
import local_current_search_reader as current
import local_own_site_session as auth
from test_local_own_site_session import Server,Response
HEADERS={'Host':'localhost:8765'};PRICE='/api-item-prices/1082000.json';MANIFEST='/api-search-identities/v2/manifest.json';WALL=1794096000
def message(**extra):
 h=Message();h['Host']='localhost:8765'
 for k,v in extra.items():h[k]=v
 return h
def response(packet):return current.TransportResponse(packet['status'],dict(packet['headers']),base64.b64decode(packet['body']))
class Backend(Server):
 def __init__(self,fixtures):super().__init__();self.fixtures=fixtures;self.reply=fixtures['responses']['fastA'];self.denied=0;self.held_body=None;self.body_entered=threading.Event()
 def open(self,request,timeout):
  path=request.full_url.removeprefix(auth.HOST)
  if path.startswith(('/api-search-identities/v2/','/api-item-prices/')):
   self.calls.append((path,request));h={k.lower():v for k,v in request.header_items()}
   if self.denied:self.denied-=1;return Response(request.full_url,401)
   if path==MANIFEST:packet=self.fixtures['responses']['manifest']
   elif path in self.fixtures['responses']['pages']:packet=self.fixtures['responses']['pages'][path]
   else:packet=self.reply
   r=response(packet)
   if path.startswith('/api-item-prices/')and self.held_body is not None:
    owner=self
    class HeldResponse(Response):
     def read1(self,n):owner.body_entered.set();owner.held_body.wait(5);return super().read1(n)
    return HeldResponse(request.full_url,r.status,r.body,r.headers)
   return Response(request.full_url,r.status,r.body,r.headers)
  return super().open(request,timeout)
class Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  result=subprocess.run(['node',str(HERE/'local-current-search-fixtures.mjs')],capture_output=True,text=True,timeout=15);assert result.returncode==0,result.stderr;cls.fixtures=json.loads(result.stdout);cls.cfg=cls.fixtures['profile'];cls.page=next(iter(cls.fixtures['responses']['pages']))
 def reader(self,transport=None,validator=None):
  cfg=[json.dumps(self.cfg)];authority=[(True,1)];clock=[0];calls=[]
  if transport is None:
   def transport(path,conditions,timeout):
    calls.append((path,conditions,timeout));packet=self.fixtures['responses']['manifest']if path==MANIFEST else self.fixtures['responses']['pages'][path]if path in self.fixtures['responses']['pages']else self.fixtures['responses']['fastA'];return response(packet)
  r=current.LocalCurrentSearchReader(SITE,config=lambda:cfg[0],transport=transport,validator=validator,monotonic=lambda:clock[0],wall=lambda:WALL);r.authority=lambda:authority[0];return r,cfg,authority,clock,calls
 def get(self,r,path=PRICE,method='GET',headers=None,**kw):
  h=message(**({current.REQUEST:current.FAST}if path.startswith('/api-item-prices/')else{}))if headers is None else headers
  return r.handle(method,path,h,**kw)
 def test_actual1500_manifest_and_page_headers_body_bytes_are_preserved(self):
  r,_,_,_,calls=self.reader();a=self.get(r,MANIFEST);p=self.get(r,self.page);self.assertEqual(a.status,200);self.assertEqual(p.status,200);self.assertEqual(len(a.headers),len({k.lower()for k in a.headers}));self.assertEqual(len(p.headers),len({k.lower()for k in p.headers}));self.assertEqual(a.body,base64.b64decode(self.fixtures['responses']['manifest']['body']));self.assertEqual(json.loads(a.body)['itemCount'],1500);self.assertEqual(p.headers['x-astra-search-identity-object'],'page-v2');self.assertNotIn('x-astra-search-identity-revision',p.headers);self.assertEqual(len(calls),2)
 def test_actual_full_item_stat_dto_byte_identity_and_fixed_request_preference(self):
  r,_,_,_,calls=self.reader();a=self.get(r);self.assertEqual(a.status,200);self.assertEqual(a.body,base64.b64decode(self.fixtures['responses']['fastA']['body']));self.assertEqual(a.headers['x-astra-api-item-protocol'],current.FAST);self.assertEqual(calls[0][1],{current.REQUEST:current.FAST});self.assertEqual(json.loads(a.body)['sourceCapturedAt'],self.fixtures['originalCapture'])
 def test_no_header_legacy_route_is_not_claimed_even_when_newprofile_on(self):
  r,_,_,_,calls=self.reader();self.assertIsNone(self.get(r,headers=message()));self.assertEqual(calls,[])
 def test_absent_off_invalid_config_never_transport_or_validator(self):
  def forbidden(*_):raise AssertionError('Off accessed transport/parser')
  for cfg in [None,'{"enabled":false}','{"enabled":0}','{"enabled":false,"extra":true}','{"enabled":true}']:
   r=current.LocalCurrentSearchReader(config=lambda:cfg,transport=forbidden,validator=forbidden);self.assertEqual(self.get(r,MANIFEST).status,404);self.assertEqual(self.get(r).status,404);self.assertEqual(r.flights,{})
 def test_host_origin_methods_and_unknownpaths_are_bounded_before_io(self):
  r,_,_,_,calls=self.reader()
  for h,kw in [(message(Origin='https://evil.invalid'),{}),(message(**{'Sec-Fetch-Site':'cross-site'}),{}),(message(),{'client_host':'192.0.2.1'}),(message(),{'bind_host':'0.0.0.0'}),(message(Host='other'),{})]:self.assertEqual(self.get(r,MANIFEST,headers=h,**kw).status,403)
  for p in [MANIFEST+'?anything=1',self.page+'?generation='+'a'*64,'https://evil.invalid'+MANIFEST,'/api-search-identities/v2/../health.json','/api-search-identities/v2/%61.json']:
   self.assertEqual(self.get(r,p).status,400)
  self.assertEqual(self.get(r,MANIFEST,method='POST').status,405);self.assertIsNone(self.get(r,'/other.json'));self.assertEqual(calls,[])
 def test_duplicate_host_condition_or_protocol_rejects_before_io(self):
  r,_,_,_,calls=self.reader()
  for key,value in [('Host','localhost:8765'),('If-None-Match','"a"'),(current.REQUEST,current.FAST)]:
   h=message(**{current.REQUEST:current.FAST,'If-None-Match':'"a"'});h[key]=value;self.assertIn(self.get(r,headers=h).status,[400,403])
  self.assertEqual(calls,[])
 def test_actual_304_manifest_and_fast_keep_protocol_and_empty_bodies(self):
  for path,label in [(MANIFEST,'manifest304'),(PRICE,'fastA304')]:
   packet=self.fixtures['responses'][label];r,_,_,_,_=self.reader(transport=lambda *_:response(packet));h=message(**{'If-None-Match':packet['headers']['etag'],**({current.REQUEST:current.FAST}if path==PRICE else{})});a=self.get(r,path,headers=h);self.assertEqual(a.status,304);self.assertEqual(a.body,b'');self.assertEqual(a.headers['etag'],packet['headers']['etag']);self.assertNotIn('Content-Length',a.headers)
 def test_unsolicited_or_wrong_etag_304_rejected(self):
  r,_,_,_,_=self.reader(transport=lambda *_:response(self.fixtures['responses']['fastA304']));self.assertEqual(self.get(r).status,503);self.assertEqual(self.get(r,headers=message(**{current.REQUEST:current.FAST,'If-None-Match':'"wrong"'})).status,503)
 def test_bound_sameclock_404_and409_forward_original_ordered_frames(self):
  for label in ['fast404B','fast409B']:
   packet=self.fixtures['responses'][label];r,_,_,_,_=self.reader(transport=lambda *_:response(packet));a=self.get(r);self.assertEqual(a.status,packet['status']);self.assertEqual(a.body,base64.b64decode(packet['body']));self.assertEqual(a.headers['x-astra-api-item-publication'],'2')
 def test_malformed_declared404_redacts_body_but_preserves_conservative_withdrawal_without_floor(self):
  packet=copy.deepcopy(self.fixtures['responses']['fast404B']);packet['body']=base64.b64encode(b'{"actor":"DO_NOT_ECHO"}').decode();packet['headers'].pop('content-length',None);r,_,_,_,_=self.reader(transport=lambda *_:response(packet));a=self.get(r);self.assertEqual(a.status,404);self.assertEqual(a.headers['X-Astra-API-Item-Protocol'],current.FAST);self.assertEqual(a.headers['X-Astra-API-Item-Epoch'],self.cfg['fastEpoch']);self.assertNotIn('etag',a.headers);self.assertNotIn(b'DO_NOT_ECHO',a.body)
 def test_unlabelled_first_legacy_response_and_wrong_epoch_never_become_fast(self):
  for kind in ['missing','foreign']:
   packet=copy.deepcopy(self.fixtures['responses']['fastA'])
   if kind=='missing':packet['headers'].pop('x-astra-api-item-protocol')
   else:packet['headers']['x-astra-api-item-epoch']='foreign-epoch'
   r,_,_,_,_=self.reader(transport=lambda *_:response(packet));self.assertEqual(self.get(r).status,503)
 def test_page_with_fictitious_current_revision_rejected(self):
  packet=copy.deepcopy(self.fixtures['responses']['pages'][self.page]);packet['headers']['x-astra-search-identity-revision']='2';r,_,_,_,_=self.reader(transport=lambda *_:response(packet));self.assertEqual(self.get(r,self.page).status,503)
 def test_unknown_private_headers_not_forwarded(self):
  packet=copy.deepcopy(self.fixtures['responses']['fastA']);packet['headers'].update({'x-astra-api-item-receipt-key':'DO_NOT_ECHO','authorization':'DO_NOT_ECHO','set-cookie':'DO_NOT_ECHO'});r,_,_,_,_=self.reader(transport=lambda *_:response(packet));a=self.get(r);self.assertEqual(a.status,200);self.assertNotIn('DO_NOT_ECHO',json.dumps(a.headers))
 def test_auth401_and_typed_exception_never_return_retained_market_payload(self):
  for transport in [lambda *_:current.TransportResponse(401,{},b''),lambda *_:(_ for _ in()).throw(auth.AuthenticationUnavailable(401))]:
   r,_,_,_,_=self.reader(transport=transport);self.assertEqual(self.get(r).status,401)
 def test_late_auth_epoch_change_withdraws_instead_of_publishing(self):
  r,_,authority,_,_=self.reader();packet=response(self.fixtures['responses']['fastA'])
  def transport(*_):authority[0]=(True,2);return packet
  r.transport=transport;self.assertEqual(self.get(r).status,401)
 def test_deadline_after_transport_or_actual_validator_rejects_before_forward(self):
  for phase in ['transport','validator']:
   r,_,_,clock,_=self.reader();packet=response(self.fixtures['responses']['fastA']);validator=r.validator
   if phase=='transport':
    def transport(*_):clock[0]=6;return packet
    r.transport=transport
   else:
    def slow(raw,ctx,timeout):v=validator(raw,ctx,timeout);clock[0]=6;return v
    r.validator=slow
   self.assertEqual(self.get(r).status,503)
 def test_observed_off_on_keeps_old_physical_flight_and_cannot_resurrect(self):
  entered=threading.Event();release=threading.Event();calls=[]
  def transport(*args):calls.append(args);entered.set();release.wait(3);return response(self.fixtures['responses']['fastA'])
  r,cfg,_,_,_=self.reader(transport=transport);values=[];thread=threading.Thread(target=lambda:values.append(self.get(r)));thread.start();self.assertTrue(entered.wait(1));cfg[0]='{"enabled":false}';self.assertEqual(self.get(r).status,404);cfg[0]=json.dumps(self.cfg);self.assertEqual(self.get(r).status,503);self.assertEqual(len(calls),1);release.set();thread.join(4);self.assertFalse(thread.is_alive());self.assertEqual(values[0].status,503);self.assertEqual(r.flights,{})
 def test_true_concurrent_identical_pipeline_coalesces_through_validation(self):
  entered=threading.Event();release=threading.Event();count=[]
  def transport(*args):count.append(args);entered.set();release.wait(3);return response(self.fixtures['responses']['fastA'])
  r,_,_,_,_=self.reader(transport=transport);values=[];threads=[threading.Thread(target=lambda:values.append(self.get(r)))for _ in range(4)]
  for t in threads:t.start()
  self.assertTrue(entered.wait(1));time.sleep(.02);release.set()
  for t in threads:t.join(4);self.assertFalse(t.is_alive())
  self.assertEqual(len(count),1);self.assertEqual([v.status for v in values],[200]*4)
 def test_session_route_whitelist_and_protocol_conditions_are_fixed(self):
  self.assertEqual(auth.route_limit(MANIFEST),65536);self.assertEqual(auth.route_limit(self.page),131072)
  for p in [MANIFEST+'?x=1','https://inflation.gg'+MANIFEST,'/api-search-identities/v2/latest.json',self.page+'?generation='+'a'*64]:
   with self.assertRaises(auth.AuthenticationUnavailable):auth.route_limit(p)
  for p,c in [(MANIFEST,{current.REQUEST:current.FAST}),(PRICE,{current.REQUEST:'legacy'}),(PRICE,{'Authorization':'bad'})]:
   with self.assertRaises(auth.AuthenticationUnavailable):auth.valid_conditions(p,c)
 def test_actual_RAM_session_one_login_fixed_header_and_original_body(self):
  server=Backend(self.fixtures);session=auth.OwnSiteSession(opener_factory=server);session.configure('SYNTHETIC_PASSWORD');r,_,_,_,_=self.reader();self.assertTrue(current.attach_current_search_reader(session,r));a=self.get(r);m=self.get(r,MANIFEST);self.assertEqual(a.status,200);self.assertEqual(m.status,200);self.assertEqual(server.logins,1);data=[request for path,request in server.calls if path==PRICE];self.assertEqual(len(data),1);self.assertEqual(dict((k.lower(),v)for k,v in data[0].header_items())[current.REQUEST.lower()],current.FAST);self.assertEqual(a.body,base64.b64decode(self.fixtures['responses']['fastA']['body']))
 def test_actual_RAM_session_401_after_login_retry_is_not503_retention(self):
  server=Backend(self.fixtures);server.denied=2;session=auth.OwnSiteSession(opener_factory=server);session.configure('SYNTHETIC_PASSWORD');r,_,_,_,_=self.reader();current.attach_current_search_reader(session,r);a=self.get(r);self.assertEqual(a.status,401);self.assertEqual(server.logins,2);self.assertEqual(a.body.count(b'9.5'),0)
 def test_actual_session_declared404_bodytimeout_retains_its_physical_job_and_observes_withdrawal(self):
  server=Backend(self.fixtures);server.reply=self.fixtures['responses']['fast404B'];server.held_body=threading.Event();session=auth.OwnSiteSession(opener_factory=server);session.configure('SYNTHETIC_PASSWORD')
  result=session.get(PRICE,{current.REQUEST:current.FAST},.08,current.TransportResponse);self.assertTrue(server.body_entered.is_set());self.assertEqual(result.status,404);self.assertEqual(result.body,b'');self.assertTrue(session.flights);server.held_body.set()
  for _ in range(100):
   if not session.flights:break
   time.sleep(.005)
  self.assertFalse(session.flights)
 def test_marker_is_UX_only_reversible_and_does_not_forge_workspace_or_controls(self):
  raw=b'<html><body data-private-workspace="existing" data-stamp-references="available">Keep</body></html>';self.assertEqual(current.inject_local_availability(raw,None),raw);on=current.inject_local_availability(raw,self.cfg);self.assertIn(b'data-search-identity-profile="price_free_owned_membership_v2"',on);self.assertIn(b'data-private-workspace="existing"',on);self.assertNotIn(b'__preview_controls',on);off=current.inject_local_availability(on,None);self.assertNotIn(b'data-search-identity-',off);self.assertNotIn(b'data-fast-item-',off);self.assertEqual(off,raw);self.assertEqual(current.inject_local_availability(on,self.cfg),on)
 def test_head_has_representation_length_and_no_body(self):
  r,_,_,_,_=self.reader();a=self.get(r,method='HEAD');self.assertEqual(a.status,200);self.assertEqual(a.body,b'');self.assertEqual(int(a.headers['Content-Length']),len(base64.b64decode(self.fixtures['responses']['fastA']['body'])))
 def packet(self,value):return{'status':value.status,'headers':dict(value.headers),'body':base64.b64encode(value.body).decode()}
 def browser(self,scenario,**kwargs):
  packet={'scenario':scenario,'profile':self.cfg,'itemId':self.fixtures['itemId'],'wallNow':WALL*1000,**kwargs};result=subprocess.run(['node',str(HERE/'local-current-client-parity.mjs'),'--synthetic-stdin'],input=json.dumps(packet).encode(),capture_output=True,timeout=15);self.assertEqual(result.returncode,0,result.stderr.decode());out=json.loads(result.stdout);self.assertEqual(out['status'],'PASS');self.assertEqual(out['networkCalls'],0);return out
 def forwarded(self,label,path=PRICE,condition=None):
  r,_,_,_,_=self.reader(transport=lambda *_:response(self.fixtures['responses'][label]));h=message(**({current.REQUEST:current.FAST}if path.startswith('/api-item-prices/')else{}));
  if condition is not None:h['If-None-Match']=condition
  return self.packet(self.get(r,path,headers=h))
 def test_actual_browser_atomic1500_intake_304_and_retained_collection_through_adapter(self):
  r,_,_,_,_=self.reader();manifest=self.packet(self.get(r,MANIFEST));pages={p:self.packet(self.get(r,p))for p in self.fixtures['responses']['pages']};same=self.forwarded('manifest304',MANIFEST,self.fixtures['responses']['manifest']['headers']['etag']);out=self.browser('atomic',manifest=manifest,manifest304=same,pages=pages,failure=self.packet(r._response(503,'synthetic_unavailable')));self.assertEqual(out['itemCount'],1500);self.assertEqual(out['priceCalls'],0)
 def test_actual_browser_equal_clock_200_409_404_old200_floor_and_newcurrent_price(self):
  replies=[self.forwarded('fastA'),self.forwarded('fast409B',PRICE+'?generation='+'a'*64),self.forwarded('fast404B'),self.forwarded('fastA'),self.forwarded('fastC')];out=self.browser('order',replies=replies);self.assertEqual(out['ordering']['revision'],3);self.assertEqual(out['originalCapture'],self.fixtures['originalCapture'])
 def test_actual_browser_redacted_malformed404_withdraws_without_newfloor_claim(self):
  bad=copy.deepcopy(self.fixtures['responses']['fast404B']);bad['body']=base64.b64encode(b'NOT_A_VALID_NEGATIVE_BODY').decode();bad['headers'].pop('content-length',None);r,_,_,_,_=self.reader(transport=lambda *_:response(bad));self.browser('malformed404',replies=[self.forwarded('fastA'),self.packet(self.get(r))])
 def test_actual_browser_auth_withdrawal_and_transport_failure_keep_distinct_states(self):
  for scenario,status in [('auth',401),('retained',503)]:
   r,_,_,_,_=self.reader();self.browser(scenario,replies=[self.forwarded('fastA'),self.packet(r._response(status,'synthetic_unavailable'))])
 def test_typed_validator_child_has_namefirst_environment_no_rootpassword_or_tokens(self):
  seen=[]
  def run(command,**kwargs):seen.append((command,kwargs));return types.SimpleNamespace(returncode=0,stdout=b'{"valid":true}',stderr=b'')
  with patch.dict(os.environ,{'PREVIEW_PASSWORD':'SYNTHETIC_DO_NOT_FORWARD','CLOUDFLARE_API_TOKEN':'SYNTHETIC_DO_NOT_FORWARD'}),patch('subprocess.run',side_effect=run):
   self.assertTrue(current.validate(b'{}',{},root=SITE,timeout=1))
  self.assertEqual(len(seen),1);self.assertNotIn('PREVIEW_PASSWORD',seen[0][1]['env']);self.assertNotIn('CLOUDFLARE_API_TOKEN',seen[0][1]['env']);self.assertEqual(seen[0][1]['timeout'],1);self.assertNotIn(b'SYNTHETIC_DO_NOT_FORWARD',seen[0][1]['input'])
 def test_validator_child_boolean_shape_nonfinite_duplicate_and_exit_are_strict(self):
  for code,out in [(1,b'{"valid":true}'),(0,b'{"valid":1}'),(0,b'{"valid":true,"extra":1}'),(0,b'{"valid":true,"valid":true}'),(0,b'{"valid":NaN}')]:
   with patch('subprocess.run',return_value=types.SimpleNamespace(returncode=code,stdout=out,stderr=b'')):
    with self.assertRaises(current.Invalid):current.validate(b'{}',{},root=SITE,timeout=1)
 def test_config_epoch_change_while_validator_held_cannot_return_old_body(self):
  entered=threading.Event();release=threading.Event();r,cfg,_,_,_=self.reader();actual=r.validator
  def held(raw,ctx,timeout):entered.set();release.wait(3);return actual(raw,ctx,timeout)
  r.validator=held;values=[];t=threading.Thread(target=lambda:values.append(self.get(r)));t.start();self.assertTrue(entered.wait(1));cfg[0]=json.dumps({**self.cfg,'identityEpoch':'new-local-epoch'});self.assertEqual(self.get(r,MANIFEST).status,503);release.set();t.join(4);self.assertFalse(t.is_alive());self.assertEqual(values[0].status,503)
 def test_existing_legacy_and_newFAST_same_path_do_not_share_physical_session_key(self):
  server=Backend(self.fixtures);entered=threading.Event();release=threading.Event();open_original=server.open;data=[]
  def held(request,timeout):
   if request.full_url==auth.HOST+PRICE:
    data.append(request)
    if len(data)==2:entered.set()
    release.wait(3)
   return open_original(request,timeout)
  server.open=held;session=auth.OwnSiteSession(opener_factory=server);session.configure('SYNTHETIC_PASSWORD');out=[];threads=[threading.Thread(target=lambda c=c:out.append(session.get(PRICE,c,2,current.TransportResponse)))for c in [{},{current.REQUEST:current.FAST}]]
  for t in threads:t.start()
  self.assertTrue(entered.wait(1));self.assertEqual(len(session.flights),2);release.set()
  for t in threads:t.join(3);self.assertFalse(t.is_alive())
  self.assertEqual(len(out),2);self.assertEqual(server.logins,1);self.assertEqual(len(data),2)
 def test_review_response_cannot_promote_local_private_session(self):
  server=Backend(self.fixtures);server.reply=copy.deepcopy(self.fixtures['responses']['fast404B']);server.reply['headers']['x-astra-preview']='review';session=auth.OwnSiteSession(opener_factory=server);session.configure('SYNTHETIC_PASSWORD');r,_,_,_,_=self.reader();current.attach_current_search_reader(session,r);self.assertEqual(self.get(r).status,401);self.assertTrue(session.observed_review());self.assertIsNone(session.profile)
 def test_preview_actual_hooks_route_new_frames_and_leave_noheader_legacy_dispatch(self):
  spec=importlib.util.spec_from_file_location('synthetic_current_preview',SITE/'preview.py');preview=importlib.util.module_from_spec(spec);spec.loader.exec_module(preview);r,_,_,_,_=self.reader();preview._current_search=r;legacy=[]
  null=types.SimpleNamespace(handle=lambda *_a,**_k:None,active=lambda:False)
  for n in ['_calculations','_stamps','_cash','_nx','_nx_history','_item_hours','_catalog']:setattr(preview,n,null)
  preview._items=types.SimpleNamespace(handle=lambda *_a,**_k:(legacy.append(True)or current.LocalResponse(200,{},b'legacy_preserved')))
  def handler(path,h):
   obj=object.__new__(preview.Handler);obj.path=path;obj.command='GET';obj.headers=h;obj.server=types.SimpleNamespace(server_address=('127.0.0.1',8765));obj.client_address=('127.0.0.1',1);obj.wfile=io.BytesIO();obj.send_response=lambda status:setattr(obj,'sent_status',status);obj.send_header=lambda *_:None;obj.end_headers=lambda:None;return obj
  a=handler(MANIFEST,message());self.assertTrue(a._serve_catalog());self.assertEqual(a.sent_status,200);self.assertEqual(legacy,[]);b=handler(PRICE,message());self.assertTrue(b._serve_catalog());self.assertEqual(b.wfile.getvalue(),b'legacy_preserved');self.assertEqual(legacy,[True])
  with tempfile.TemporaryDirectory(prefix='astra-current-preview-html-')as temp:
   path=Path(temp);(path/'dist').mkdir();raw=b'<html><body data-item-api-preview="available" data-viewer-preview="on">old controls</body></html>';(path/'dist/index.html').write_bytes(raw);preview.ROOT=path;c=handler('/',message());self.assertTrue(c._serve_calculation_index());self.assertIn(b'data-search-identity-profile="price_free_owned_membership_v2"',c.wfile.getvalue());self.assertIn(b'data-viewer-preview="on"',c.wfile.getvalue());self.assertNotIn(b'data-private-workspace',c.wfile.getvalue())
 def test_body_header_limits_and_duplicate_mime_fail_without_echo(self):
  for edit in [lambda p:p['headers'].update({'content-encoding':'gzip'}),lambda p:p['headers'].update({'Content-Type':'text/html'}),lambda p:p.update(body=base64.b64encode(b'x'*300001).decode()),lambda p:p['headers'].update({'content-length':'1'})]:
   packet=copy.deepcopy(self.fixtures['responses']['fastA']);edit(packet);r,_,_,_,_=self.reader(transport=lambda *_:response(packet));a=self.get(r);self.assertEqual(a.status,503);self.assertNotIn(b'x'*100,a.body)
 def test_marker_rejects_unreviewed_epoch_text_before_HTML_injection(self):
  for cfg in [{**self.cfg,'fastEpoch':'x"><script>bad</script>'},{**self.cfg,'enabled':1},{**self.cfg,'extra':'bad'}]:
   with self.assertRaises(current.Invalid):current.inject_local_availability(b'<body>Keep</body>',cfg)
 def test_unknown_monotonic_clock_stops_before_transport(self):
  r,_,_,clock,calls=self.reader();clock[0]=float('nan');self.assertEqual(self.get(r).status,503);self.assertEqual(calls,[])
 def test_four_inflight_local_pipelines_reject_fifth_before_transport(self):
  release=threading.Event();all_started=threading.Event();calls=[];lock=threading.Lock()
  def transport(*args):
   with lock:calls.append(args);all_started.set()if len(calls)==4 else None
   release.wait(3);return response(self.fixtures['responses']['fastA'])
  r,_,_,_,_=self.reader(transport=transport);values=[];paths=[PRICE+'?generation='+c*64 for c in 'abcd'];threads=[threading.Thread(target=lambda p=p:values.append(self.get(r,p)))for p in paths]
  for t in threads:t.start()
  self.assertTrue(all_started.wait(1));self.assertEqual(self.get(r,PRICE+'?generation='+'e'*64).status,503);self.assertEqual(len(calls),4);release.set()
  for t in threads:t.join(4);self.assertFalse(t.is_alive())
  self.assertEqual(r.flights,{})
 def test_one_waiter_bound_preserves_owner_pipeline_and_no_second_source_call(self):
  release=threading.Event();entered=threading.Event();calls=[]
  def transport(*args):calls.append(args);entered.set();release.wait(3);return response(self.fixtures['responses']['fastA'])
  r,_,_,_,_=self.reader(transport=transport);r.max_waiters=1;out=[];a=threading.Thread(target=lambda:out.append(self.get(r)));a.start();self.assertTrue(entered.wait(1));b=threading.Thread(target=lambda:out.append(self.get(r)));b.start()
  for _ in range(100):
   if r.waiters==1:break
   time.sleep(.002)
  self.assertEqual(r.waiters,1);self.assertEqual(self.get(r).status,503);self.assertEqual(len(calls),1);release.set();a.join(4);b.join(4);self.assertEqual([v.status for v in out],[200,200])
if __name__=='__main__':unittest.main()

# Header case differences must not create duplicate MIME/cache metadata locally.
