"""Actual six validators + RAM session/mock opener. No HTTP/socket/login to a host."""
import copy,datetime,hashlib,json,subprocess,sys,threading,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent;SITE=HERE.parent;sys.path.insert(0,str(SITE));sys.path.insert(0,str(HERE))
import local_cash_reader as cash,local_nx_reader as nx,local_item_reader as item,local_nx_history_reader as nh,local_item_hour_reader as ih,local_calculations_reader as calc,local_own_site_session as auth
from test_local_cash_reader import body as cash_body,good as cash_good,TARGETS
from test_local_nx_reader import response as nx_good
from test_local_calculations_reader import RAW as CALC_RAW,headers as calc_headers
from test_local_own_site_session import Server,Response
WALL=datetime.datetime(2026,11,7,tzinfo=datetime.timezone.utc).timestamp();HEADERS={'Host':'localhost:8765'};ITEM='/api-item-prices/1082000.json';ITEM2='/api-item-prices/1082001.json'
def node(name):return json.loads(subprocess.run(['node',str(HERE/name)],capture_output=True,check=True,timeout=10).stdout)
class Backend(Server):
 def __init__(self,replies):super().__init__();self.replies=replies;self.denied={}
 def open(self,request,timeout):
  p=request.full_url.removeprefix(auth.HOST)
  if p in self.replies:
   self.calls.append((p,request));v=self.replies[p];status=self.denied.get(p,v['status'])
   return Response(request.full_url,status,v['body'] if status==200 else b'',{**v['headers'],'X-Astra-Preview':'password'})
  return super().open(request,timeout)
class Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.item=node('local-item-fixtures.mjs');cls.item2=node('local-auth-second-item-fixture.mjs');cls.nh=node('local-nx-history-fixtures.mjs');cls.ih=node('local-item-hour-fixtures.mjs')
 def setup(self):
  self.now=[0];replies={}
  def add(path,response):replies[path]={'status':response.status,'headers':dict(response.headers),'body':response.body}
  add(cash.PATH,cash_good());add(nx.PATH,nx_good());add(calc.PATH,calc.TransportResponse(200,calc_headers(),CALC_RAW))
  for path,v in [(ITEM,self.item['item']),(ITEM2,self.item2['item']),(item.MANIFEST,self.item['manifest']),(self.item['pagePath']+'?generation='+self.item['indexHash'],self.item['page'])]:replies[path]={**v,'body':v['body'].encode()}
  for graph in [self.nh['a'],self.ih['a']]:
   for path,v in graph['replies'].items():replies[path]={**v,'body':v['body'].encode()}
  b=Backend(replies);s=auth.OwnSiteSession(opener_factory=b);s.configure('SYNTHETIC_PASSWORD');kw={'monotonic':lambda:self.now[0],'wall':lambda:WALL}
  readers={'cash':cash.LocalCashReader(targets=TARGETS,**kw),'nx':nx.LocalNxReader(**kw),'items':item.LocalItemReader(SITE,**kw),'nx_history':nh.LocalNxHistoryReader(**kw),'item_hours':ih.LocalItemHourReader(**kw),'calculations':calc.LocalCalculationsReader(enabled=True,**kw)}
  self.assertTrue(auth.attach_readers(s,**readers));return s,b,readers
 def get(self,r,path,method='GET',tag=None):return r.handle(method,path,{**HEADERS,**({'If-None-Match':tag}if tag else{})})
 def paths(self):return [('cash',cash.PATH),('nx',nx.PATH),('items',ITEM),('nx_history',nh.MANIFEST),('item_hours',ih.MANIFEST),('calculations',calc.PATH)]
 def test_actual_session_mock_401_withdraws_six_genuine_validated_bodies_and_conditions(self):
  for name,path in self.paths():
   with self.subTest(reader=name):
    s,b,rs=self.setup();r=rs[name];first=self.get(r,path);self.assertEqual(first.status,200);self.now[0]=61;b.denied[path]=401
    denied=self.get(r,path,tag=first.headers['ETag']);self.assertEqual(denied.status,401);self.assertNotEqual(denied.body,first.body);self.assertNotIn('ETag',denied.headers)
    self.assertEqual(self.get(r,path,'HEAD').body,b'');self.assertEqual(self.get(r,path,'HEAD').status,401)
    self.assertEqual(sum(p==path for p,_ in b.calls),3);self.assertEqual(b.logins,2)
 def test_closed_typed_403_and_404_preserved_cold_and_warm_for_all_six(self):
  for status in [403,404]:
   for warm in [False,True]:
    for name,path in self.paths():
     with self.subTest(status=status,warm=warm,reader=name):
      s,b,rs=self.setup();r=rs[name]
      if warm:self.assertEqual(self.get(r,path).status,200);self.now[0]=61
      def denied(*a,**k):raise auth.AuthenticationUnavailable(status)
      s.get=denied;v=self.get(r,path);self.assertEqual(v.status,status);self.assertNotIn('ETag',v.headers)
 def test_typed503_and_generic_network_keep_original_body_etag_and_source_clocks_all_six(self):
  for error in [auth.AuthenticationUnavailable(503),OSError('synthetic-network')]:
   for name,path in self.paths():
    with self.subTest(error=type(error).__name__,reader=name):
     s,b,rs=self.setup();r=rs[name];first=self.get(r,path);self.assertEqual(first.status,200);self.now[0]=61
     def failed(*a,**k):raise error
     s.get=failed;v=self.get(r,path);self.assertEqual(v.status,200);self.assertEqual(v.body,first.body);self.assertEqual(v.headers['ETag'],first.headers['ETag'])
     for k,value in first.headers.items():
      if any(x in k for x in ['Captured','Retrieved','Generation','Definition']):self.assertEqual(v.headers[k],value)
     self.assertEqual(self.get(r,path,tag=first.headers['ETag']).status,304)
 def test_shim_does_not_treat_arbitrary_oserror_status_or_unknown_typed_status_as_auth(self):
  class Foreign(OSError):status=401
  for error in [Foreign(),auth.AuthenticationUnavailable(429),auth.AuthenticationUnavailable(True),auth.AuthenticationUnavailable('401')]:
   s=auth.OwnSiteSession();s.get=lambda*a,**k:(_ for _ in()).throw(error)
   with self.assertRaises(type(error)):auth.reader_response(s,cash.PATH,{},1,cash.TransportResponse)
 def test_direct_cash_item_401_403_404_withdraw_without_a_session_shim(self):
  for status in [401,403,404]:
   for name,path,module in [('cash',cash.PATH,cash),('items',ITEM,item)]:
    s,b,rs=self.setup();r=rs[name];first=self.get(r,path);self.assertEqual(first.status,200);self.now[0]=61;r.transport=lambda*a,m=module:m.TransportResponse(status,{},b'')
    v=self.get(r,path,tag=first.headers['ETag']);self.assertEqual(v.status,status);self.assertNotIn('ETag',v.headers);self.assertNotEqual(v.body,first.body)
 def test_item_auth_withdraws_manifest_pages_and_both_item_ids(self):
  s,b,rs=self.setup();r=rs['items'];page=self.item['pagePath']+'?generation='+self.item['indexHash']
  for path in [ITEM,ITEM2,item.MANIFEST,page]:self.assertEqual(self.get(r,path).status,200)
  self.now[0]=61;b.denied[ITEM]=401;self.assertEqual(self.get(r,ITEM).status,401);self.assertIsNone(r.manifest);self.assertTrue(all(e['raw']is None for e in r.entries.values()))
  self.assertEqual(self.get(r,page).status,401)
 def test_per_item404_withdraws_all_id_aliases_but_not_other_item_or_identity(self):
  s,b,rs=self.setup();r=rs['items'];alias=ITEM+'?generation='+self.item['generation'];b.replies[alias]=b.replies[ITEM]
  for path in [ITEM,alias,ITEM2,item.MANIFEST]:self.assertEqual(self.get(r,path).status,200)
  other=r.entries[ITEM2]['raw'];manifest=r.manifest;self.now[0]=61;b.denied[ITEM]=404;self.assertEqual(self.get(r,ITEM).status,404)
  self.assertTrue(all(e['raw']is None for k,e in r.entries.items()if k.split('?')[0]==ITEM));self.assertEqual(r.entries[ITEM2]['raw'],other);self.assertIs(r.manifest,manifest)
 def test_identity404_withdraws_identity_namespace_but_not_item(self):
  s,b,rs=self.setup();r=rs['items'];page=self.item['pagePath']+'?generation='+self.item['indexHash']
  for path in [ITEM,item.MANIFEST,page]:self.assertEqual(self.get(r,path).status,200)
  raw=r.entries[ITEM]['raw'];self.now[0]=61;b.denied[item.MANIFEST]=404;self.assertEqual(self.get(r,item.MANIFEST).status,404);self.assertIsNone(r.manifest);self.assertEqual(r.entries[ITEM]['raw'],raw)
  self.assertTrue(all(e['raw']is None for k,e in r.entries.items()if k.startswith('/api-item-identities')));self.assertEqual(self.get(r,page).status,404)
 def test_late_real_item200_or304_cannot_restore_namespace_after_concurrent401(self):
  for mode in [200,304]:
   s,b,rs=self.setup();r=rs['items'];self.assertEqual(self.get(r,ITEM).status,200);self.assertEqual(self.get(r,ITEM2).status,200);self.now[0]=61
   entered=threading.Event();release=threading.Event();out=[];v=b.replies[ITEM2]
   def transport(path,*_):
    if path==ITEM2:entered.set();self.assertTrue(release.wait(3));return item.TransportResponse(mode,v['headers'],v['body']if mode==200 else b'')
    return item.TransportResponse(401,{},b'')
   r.transport=transport;thread=threading.Thread(target=lambda:out.append(self.get(r,ITEM2)));thread.start();self.assertTrue(entered.wait(2));self.assertEqual(self.get(r,ITEM).status,401);release.set();thread.join(5);self.assertFalse(thread.is_alive());self.assertEqual(out[0].status,401);self.assertTrue(all(e['raw']is None for e in r.entries.values()))
 def test_late_real_identity_manifest_cannot_restore_after_item401(self):
  s,b,rs=self.setup();r=rs['items'];self.assertEqual(self.get(r,ITEM).status,200);self.assertEqual(self.get(r,item.MANIFEST).status,200);self.now[0]=61
  entered=threading.Event();release=threading.Event();out=[];v=b.replies[item.MANIFEST]
  def transport(path,*_):
   if path==item.MANIFEST:entered.set();self.assertTrue(release.wait(3));return item.TransportResponse(200,v['headers'],v['body'])
   return item.TransportResponse(401,{},b'')
  r.transport=transport;thread=threading.Thread(target=lambda:out.append(self.get(r,item.MANIFEST)));thread.start();self.assertTrue(entered.wait(2));self.assertEqual(self.get(r,ITEM).status,401);release.set();thread.join(5);self.assertFalse(thread.is_alive());self.assertEqual(out[0].status,401);self.assertIsNone(r.manifest)
 def test_attach_disabled_preserves_every_transport_and_all_state(self):
  s,b,rs=self.setup();s.disable();before={k:dict(vars(v))for k,v in rs.items()};self.assertFalse(auth.attach_readers(s,**rs))
  for k,r in rs.items():self.assertEqual(vars(r),before[k])
if __name__=='__main__':unittest.main()
