import base64,datetime as dt,hashlib,io,json,os,subprocess,sys,threading,time,unittest
from email.message import Message
from pathlib import Path
HERE=Path(__file__).resolve().parent
SITE=HERE.parent if (HERE.parent/'ops/stamp-reference-contract.mjs').is_file() else HERE.parent/'site'
CANONICAL=SITE if (SITE/'local_cash_reader.py').is_file() else HERE.parents[2]/'outputs/inflation-watch'
sys.path.insert(0,str(CANONICAL));sys.path.insert(0,str(SITE))
import local_stamp_reference_reader as s
import local_own_site_session as session
WALL=dt.datetime(2026,11,7,tzinfo=dt.timezone.utc).timestamp()
def body(at='2026-11-06T10:00:00.000Z'):
 return subprocess.run(['node',str(HERE/'local-stamp-reference-fixture.mjs'),at],check=True,capture_output=True).stdout
def message(**extra):
 result=Message();result['Host']='127.0.0.1:8765'
 for k,v in extra.items():result[k]=v
 return result
def response(raw,status=200,ordinal=1,mode='validated_cache',**updates):
 captured=json.loads(raw)['source']['capturedAt'];headers={'Content-Type':'application/json','Content-Length':str(len(raw)),
  'ETag':'"stamp-references-'+hashlib.sha256(raw).hexdigest()+'"',s.PREFIX+'Mode':mode,s.PREFIX+'Captured-At':captured,
  s.PREFIX+'Registry-Hash':s.REGISTRY_HASH,s.PREFIX+'Publication-Ordinal':str(ordinal)}
 headers.update(updates);return s.TransportResponse(status,headers,raw if status==200 else b'')
class Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.raw=body();cls.other=body('2026-11-06T10:01:00.000Z')
 def reader(self,replies,**options):
  calls=[];clock=[0]
  def transport(conditions,timeout):calls.append((conditions,timeout));return replies.pop(0)
  r=s.LocalStampReferenceReader(enabled=True,transport=transport,monotonic=lambda:clock[0],wall=lambda:WALL,**options)
  return r,calls,clock
 def get(self,r,method='GET',path=s.PATH,headers=None,**args):return r.handle(method,path,headers or message(),**args)
 def test_off_is_zero_io_and_explicit_session_transport_required(self):
  def forbidden(*_):self.fail('Off performed IO')
  r=s.LocalStampReferenceReader(transport=forbidden)
  self.assertEqual(self.get(r).status,404);self.assertEqual(s.LocalStampReferenceReader(enabled=True).handle('GET',s.PATH,message()).status,503)
 def test_real_contract_validated_200_head_and_conditional_304_keep_bytes_clocks(self):
  r,calls,_=self.reader([response(self.raw)]);first=self.get(r)
  self.assertEqual(first.status,200);self.assertEqual(first.body,self.raw)
  self.assertEqual(self.get(r,'HEAD').body,b'');tag=first.headers['ETag']
  self.assertEqual(self.get(r,headers=message(**{'If-None-Match':tag})).status,304)
  self.assertEqual(len(calls),1);self.assertIn('no-store',first.headers['Cache-Control'])
 def test_304_allows_monotonic_new_pointer_ordinal_without_renewing_capture(self):
  r,calls,clock=self.reader([response(self.raw),response(self.raw,status=304,ordinal=3)])
  first=self.get(r);clock[0]=61;second=self.get(r)
  self.assertEqual(second.status,200);self.assertEqual(second.body,first.body)
  self.assertEqual(second.headers[s.PREFIX+'Publication-Ordinal'],'3')
  self.assertEqual(second.headers[s.PREFIX+'Captured-At'],first.headers[s.PREFIX+'Captured-At'])
  self.assertEqual(calls[1][0],{'If-None-Match':first.headers['ETag']})
 def test_wrong_304_tuple_cannot_renew_lastgood(self):
  r,_,clock=self.reader([response(self.raw),response(self.other,status=304,ordinal=2)])
  first=self.get(r);clock[0]=61;second=self.get(r)
  self.assertEqual(second.body,first.body);self.assertEqual(second.headers[s.PREFIX+'Mode'],'retained')
  self.assertEqual(second.headers[s.PREFIX+'Publication-Ordinal'],'1')
 def test_publication_and_clock_rollback_fail_closed_but_newer_source_commits(self):
  for bad in [response(self.other,ordinal=1),response(self.raw,ordinal=1)]:
   r,_,clock=self.reader([response(self.raw,ordinal=2),bad,response(self.other,ordinal=3)])
   first=self.get(r);clock[0]=61;retained=self.get(r)
   self.assertEqual(retained.body,first.body);self.assertEqual(retained.headers[s.PREFIX+'Mode'],'retained')
   clock[0]=100;new=self.get(r);self.assertEqual(new.body,self.other);self.assertEqual(new.headers[s.PREFIX+'Publication-Ordinal'],'3')
 def test_duplicate_headers_invalid_hash_and_unknown_body_never_replace_good(self):
  duplicate=Message()
  for k,v in response(self.raw).headers.items():duplicate[k]=v
  duplicate['ETag']=response(self.raw).headers['ETag']
  unknown=json.loads(self.other);unknown['playerName']='synthetic-forbidden';unknown=json.dumps(unknown).encode()
  for bad in [s.TransportResponse(200,duplicate,self.raw),response(self.other,ETag='"wrong"'),response(unknown)]:
   r,_,clock=self.reader([response(self.raw),bad]);first=self.get(r);clock[0]=61;second=self.get(r)
   self.assertEqual(second.body,first.body);self.assertEqual(second.headers[s.PREFIX+'Mode'],'retained')
 def test_401_403_404_withdraw_even_when_lastgood_exists(self):
  for status in [401,403,404]:
   r,_,clock=self.reader([response(self.raw),s.TransportResponse(status,{},b'')]);self.get(r);clock[0]=61
   value=self.get(r);self.assertEqual(value.status,status);self.assertIsNone(r.raw)
 def test_actual_session_raised_authorization_withdraws_warm_and_cold(self):
  for status in [401,403]:
   for warm in [False,True]:
    r,_,clock=self.reader([response(self.raw)])
    if warm:self.assertEqual(self.get(r).status,200);clock[0]=61
    owner=session.OwnSiteSession();owner.enabled=True;owner._ensure_login=lambda _:None
    def denied(*_args,**_kwargs):raise session.AuthenticationUnavailable(status)
    owner._run=denied
    r.transport=lambda conditions,timeout:owner.get(s.PATH,conditions,timeout,s.TransportResponse)
    result=self.get(r)
    self.assertEqual(result.status,status);self.assertIsNone(r.raw)
    self.assertNotIn('ETag',result.headers)
    self.assertNotEqual(self.get(r,'HEAD').status,200)
 def test_actual_session_raised_503_retains_original_warm_reference(self):
  r,_,clock=self.reader([response(self.raw)]);first=self.get(r);clock[0]=61
  owner=session.OwnSiteSession();owner.enabled=True;owner._ensure_login=lambda _:None
  def transient(*_args,**_kwargs):raise session.AuthenticationUnavailable(503)
  owner._run=transient
  r.transport=lambda conditions,timeout:owner.get(s.PATH,conditions,timeout,s.TransportResponse)
  result=self.get(r)
  self.assertEqual(result.status,200);self.assertEqual(result.body,first.body)
  self.assertEqual(result.headers[s.PREFIX+'Mode'],'retained')
  self.assertEqual(result.headers[s.PREFIX+'Captured-At'],first.headers[s.PREFIX+'Captured-At'])
 def test_actual_attach_hook_uses_shared_authorization_translation(self):
  import local_cash_reader as c,local_nx_reader as n,local_item_reader as i
  import local_nx_history_reader as h,local_item_hour_reader as j,local_calculations_reader as a
  r,_,clock=self.reader([response(self.raw)]);self.assertEqual(self.get(r).status,200);clock[0]=61
  owner=session.OwnSiteSession();owner.enabled=True;owner._ensure_login=lambda _:None
  def denied(*_args,**_kwargs):raise session.AuthenticationUnavailable(401)
  owner._run=denied;root=CANONICAL
  self.assertTrue(session.attach_readers(owner,cash=c.LocalCashReader(root),nx=n.LocalNxReader(),
    items=i.LocalItemReader(root),nx_history=h.LocalNxHistoryReader(root),item_hours=j.LocalItemHourReader(root),
    calculations=a.LocalCalculationsReader(root),stamp_references=r))
  self.assertEqual(self.get(r).status,401);self.assertIsNone(r.raw)
 def test_429_retryafter_backoff_retains_original_body(self):
  r,calls,clock=self.reader([response(self.raw),s.TransportResponse(429,{'Retry-After':'120'},b''),response(self.other,ordinal=2)])
  self.get(r);clock[0]=61;self.assertEqual(self.get(r).headers[s.PREFIX+'Mode'],'retained')
  clock[0]=180;self.get(r);self.assertEqual(len(calls),2)
  clock[0]=182;self.assertEqual(self.get(r).body,self.other)
 def test_new_capture_same_numbers_is_not_discarded(self):
  r,_,clock=self.reader([response(self.raw),response(self.other,ordinal=2)])
  first=self.get(r);clock[0]=61;new=self.get(r)
  self.assertNotEqual(first.body,new.body);self.assertEqual(json.loads(first.body)['rows'],json.loads(new.body)['rows'])
 def test_future_capture_encoding_size_and_media_guards(self):
  future=body('2026-11-07T00:01:00.001Z')
  for bad in [response(future),response(self.raw,**{'Content-Encoding':'gzip'}),response(self.raw,**{'Content-Length':'1'}),response(self.raw,**{'Content-Type':'text/html'})]:
   r,_,_=self.reader([bad]);self.assertEqual(self.get(r).status,503);self.assertIsNone(r.raw)
 def test_local_origin_host_method_query_guards_precede_network(self):
  r,calls,_=self.reader([])
  for headers,args in [(message(Origin='https://example.invalid'),{}),(message(**{'Sec-Fetch-Site':'cross-site'}),{}),(message(),{'client_host':'192.0.2.3'}),(message(),{'bind_host':'0.0.0.0'})]:self.assertEqual(self.get(r,headers=headers,**args).status,403)
  self.assertEqual(self.get(r,'POST').status,405);self.assertEqual(self.get(r,path=s.PATH+'?raw=1').status,400)
  self.assertEqual(self.get(r,path='https://example.invalid'+s.PATH).status,400)
  self.assertIsNone(self.get(r,path='/unrelated.json'));self.assertEqual(calls,[])
 def test_actual_concurrent_requests_coalesce_without_new_timers_or_source_reads(self):
  started=threading.Event();release=threading.Event();calls=[]
  def transport(*args):calls.append(args);started.set();self.assertTrue(release.wait(3));return response(self.raw)
  r=s.LocalStampReferenceReader(enabled=True,transport=transport,wall=lambda:WALL)
  values=[];threads=[threading.Thread(target=lambda:values.append(self.get(r)))for _ in range(8)]
  for t in threads:t.start()
  self.assertTrue(started.wait(2));release.set()
  for t in threads:t.join(5);self.assertFalse(t.is_alive())
  self.assertEqual(len(calls),1);self.assertEqual(len(values),8);self.assertTrue(all(v.status==200 for v in values))
 def test_off_during_held_io_cannot_restore_cached_reference(self):
  started=threading.Event();release=threading.Event();enabled=[True]
  def transport(*_):started.set();self.assertTrue(release.wait(3));return response(self.raw)
  r=s.LocalStampReferenceReader(enabled=lambda:enabled[0],transport=transport,wall=lambda:WALL);values=[]
  thread=threading.Thread(target=lambda:values.append(self.get(r)));thread.start();self.assertTrue(started.wait(2))
  enabled[0]=False;self.assertEqual(self.get(r).status,404);enabled[0]=True;release.set();thread.join(5)
  self.assertFalse(thread.is_alive());self.assertIsNone(r.raw);self.assertNotEqual(values[0].status,200)
 def test_html_gate_is_reversible_and_preserves_other_body_attributes(self):
  raw=b'<html><body data-private-workspace="verified" data-api-calculations-available="true">Untouched</body></html>'
  on=s.inject_local_availability(raw,True);self.assertIn(b'data-stamp-references="available"',on)
  self.assertEqual(s.inject_local_availability(on,False),raw)
  self.assertEqual(s.inject_local_availability(on,True),on)
 def test_session_route_allowlist_adds_one_fixed_131072_path_only(self):
  self.assertEqual(session.route_limit(s.PATH),131072)
  for path in [s.PATH+'?key=anything','/api-stamp-references/123.json','https://inflation.gg'+s.PATH]:
   with self.assertRaises(session.AuthenticationUnavailable):session.route_limit(path)
if __name__=='__main__':unittest.main()
