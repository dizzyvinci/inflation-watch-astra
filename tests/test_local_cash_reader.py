"""Synthetic tests only; no network/provider/key or retained API rows."""
import copy
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import http.server
import json
from pathlib import Path
import sys
import threading
import time
import unittest
from unittest.mock import patch
from urllib.request import Request,urlopen
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from portable_hash import portable_hash
from local_cash_reader import *

TARGETS=[{'itemId':9000000+i,'name':'Synthetic Item '+str(i),'slug':'synthetic-'+str(i),'fixedNxCost':1000+i} for i in range(29)]
STAMP='2026-11-05T23:00:00.000Z'
def body(stamp=STAMP,mutate=None):
 rows=[{'itemId':t['itemId'],'name':t['name'],'slug':t['slug'],'fixedNxCost':t['fixedNxCost'],'available':True,'saleMedianMesos':t['fixedNxCost']*10,'recordedSalesCount':5,'mesosPerNx':10.0,'sourceCreditUrl':f"https://maplestory.market/items/{t['itemId']}?ref=v6kkdvp6"} for t in TARGETS]
 d={'schemaVersion':1,'kind':'fixed_nx_item_api_display_subset','sourceUrl':'https://maplestory.market/api/prices','privateProjectionHash':'a'*64,'requestStartedAt':'2026-11-05T20:00:00.000Z','capturedAt':stamp,'captureTimeKind':'http_response_completed','sourceObservedAt':None,'window':dict(WINDOW),'coverage':{'expected':29,'available':29,'missingOrInvalid':0},'records':rows,'methodology':dict(METHOD),'attribution':dict(ATTRIBUTION),'isExecutableQuote':False,'changesGoodsIndex':False,'changesHeadlineBenchmark':False}
 if mutate:mutate(d)
 d['subsetHash']=portable_hash(d)
 return json.dumps(d,separators=(',',':')).encode()

def good(raw=None,*,mode='accepted_cache',extra=None):
 raw=body() if raw is None else raw
 try:capture=json.loads(raw)['capturedAt']
 except (ValueError,KeyError,TypeError):capture=STAMP
 headers={'Content-Type':'application/json','ETag':'"'+hashlib.sha256(raw).hexdigest()+'"','X-Astra-Cash-Phase':'published_subset','X-Astra-Cash-Mode':mode,'X-Astra-Cash-Captured-At':capture}
 if extra:headers.update(extra)
 return TransportResponse(200,headers,raw)

class Fixture:
 def __init__(self,responses=None,**kwargs):
  self.now=1000.;self.wall=dt.datetime.fromisoformat('2026-11-05T23:05:00+00:00').timestamp();self.calls=[];self.responses=responses or [good()]
  def transport(headers,timeout):
   self.calls.append((dict(headers),timeout))
   result=self.responses.pop(0)
   if isinstance(result,Exception):raise result
   return result
  self.reader=LocalCashReader(targets=TARGETS,transport=transport,monotonic=lambda:self.now,wall=lambda:self.wall,**kwargs)
 def get(self,method='GET',path=PATH,headers=None,**kwargs):return self.reader.handle(method,path,headers or {'Host':'127.0.0.1:8765'},**kwargs)
 def advance(self,seconds=61):self.now+=seconds;self.wall+=seconds

class ReaderTests(unittest.TestCase):
 def test_ttl_and_original_body_clock_no_headers_forwarded(self):
  f=Fixture();r=f.get(headers={'Host':'localhost:8765','Authorization':'SYNTHETIC_NOT_FORWARD','Cookie':'SYNTHETIC_NOT_FORWARD'})
  self.assertEqual(r.status,200);self.assertEqual(r.body,body());self.assertEqual(f.calls,[({},3)]);self.assertEqual(r.headers['ETag'],'"'+hashlib.sha256(r.body).hexdigest()+'"');self.assertRegex(r.headers['ETag'],r'^"[a-f0-9]{64}"$');self.assertEqual(r.headers['X-Astra-Cash-Phase'],'published_subset');self.assertEqual(r.headers['X-Astra-Cash-Mode'],'accepted_cache');self.assertEqual(r.headers['X-Astra-Cash-Captured-At'],STAMP)
  self.assertEqual(r.headers['X-Local-Cash-Source-Captured-At'],STAMP);self.assertNotEqual(r.headers['X-Local-Cash-Checked-At'],STAMP)
  for _ in range(20):self.assertEqual(f.get().status,200)
  self.assertEqual(len(f.calls),1);self.assertIn('no-store',r.headers['Cache-Control'])
 def test_concurrent_cold_one_fetch(self):
  f=Fixture();entered=threading.Event();release=threading.Event();count=[]
  def fetch(headers,timeout):count.append(1);entered.set();release.wait(2);return good()
  f.reader.transport=fetch
  with ThreadPoolExecutor(max_workers=25) as pool:
   futures=[pool.submit(f.get) for _ in range(25)];self.assertTrue(entered.wait(1));release.set();results=[r.result() for r in futures]
  self.assertEqual(len(count),1);self.assertTrue(all(r.status==200 and r.body==body() for r in results))
 def test_head_get_conditional_and_body_independence(self):
  f=Fixture();a=f.get();b=f.get('HEAD');self.assertEqual(b.status,200);self.assertEqual(b.body,b'');self.assertEqual(int(b.headers['Content-Length']),len(a.body))
  c=f.get(headers={'Host':'localhost','If-None-Match':'"other", W/'+a.headers['ETag']});self.assertEqual(c.status,304);self.assertEqual(c.body,b'');self.assertEqual(c.headers['X-Local-Cash-Source-Captured-At'],STAMP)
  self.assertEqual(f.get().body,a.body);self.assertEqual(len(f.calls),1)
 def test_remote_304_conditional_preserves_clock_and_body(self):
  f=Fixture([good(),TransportResponse(304,good().headers,b'')]);a=f.get();f.advance();b=f.get()
  self.assertEqual(f.calls[1][0],{'If-None-Match':good().headers['ETag']});self.assertEqual(b.body,a.body);self.assertEqual(b.headers['X-Local-Cash-Last-200-At'],a.headers['X-Local-Cash-Last-200-At']);self.assertNotEqual(b.headers['X-Local-Cash-Checked-At'],a.headers['X-Local-Cash-Checked-At'])
 def test_missing_strong_etag_and_unexpected304_rejected(self):
  f=Fixture([good(extra={'ETag':'"not-body-hash"'})]);self.assertEqual(f.get().status,503)
  f=Fixture([TransportResponse(304,good().headers,b'')]);self.assertEqual(f.get().status,503);self.assertEqual(f.get().status,503);self.assertEqual(len(f.calls),1)
 def test_required_phase_mode_capture_and_304_header_binding(self):
  for change in [{'X-Astra-Cash-Phase':'wrong'},{'X-Astra-Cash-Mode':'wrong'},{'X-Astra-Cash-Captured-At':'2030-01-01T00:00:00.000Z'},{'ETag':'"'+'0'*64+'"'}]:
   f=Fixture([good(extra=change)]);self.assertEqual(f.get().status,503)
   f=Fixture([good(),TransportResponse(304,{**good().headers,**change},b'')]);a=f.get();f.advance();b=f.get();self.assertEqual(b.body,a.body);self.assertEqual(b.headers['X-Astra-Cash-Mode'],'retained_last_good')
  f=Fixture([good(mode='retained_last_good')]);r=f.get();self.assertEqual(r.headers['X-Astra-Cash-Mode'],'retained_last_good');self.assertEqual(r.headers['X-Local-Cash-State'],'retained_upstream')
 def test_timeout_retains_lastgood_and_backoff(self):
  f=Fixture([good(),TimeoutError()]);a=f.get();f.advance();b=f.get()
  self.assertEqual(b.status,200);self.assertEqual(b.body,a.body);self.assertEqual(b.headers['X-Local-Cash-State'],'stale_last_good');self.assertEqual(b.headers['X-Local-Cash-Error'],'own_site_timeout')
  self.assertEqual(b.headers['X-Local-Cash-Last-200-At'],a.headers['X-Local-Cash-Last-200-At']);f.get();self.assertEqual(len(f.calls),2)
 def test_429_retry_after_honored_and_no_retry_loop(self):
  f=Fixture([TransportResponse(429,{'Retry-After':'180'},b'')]);r=f.get();self.assertEqual(r.status,503);self.assertEqual(r.headers['Retry-After'],'180');f.advance(179);self.assertEqual(f.get().status,503);self.assertEqual(len(f.calls),1)
 def test_regressed_future_and_changed_same_capture_blocked(self):
  for candidate in [body('2026-11-05T22:59:00.000Z'),body('2030-01-01T00:00:00.000Z'),body(mutate=lambda d:d.update(privateProjectionHash='b'*64))]:
   f=Fixture([good(),good(candidate)]);a=f.get();f.advance();b=f.get();self.assertEqual(b.body,a.body);self.assertEqual(b.headers['X-Local-Cash-State'],'stale_last_good')
 def test_schema_hash_duplicates_no_raw_fields(self):
  for raw in [body().replace(b'"subsetHash":"',b'"subsetHash":"0'),b'{"a":1,"a":2}',body(mutate=lambda d:d.update(owner_name='SYNTHETIC_ACTOR')),body(mutate=lambda d:d['records'][0].update(recordedSalesCount=True)),body(mutate=lambda d:d['window'].update(boundsKnown=0))]:
   f=Fixture([good(raw)]);r=f.get();self.assertEqual(r.status,503);self.assertNotIn(b'SYNTHETIC_ACTOR',r.body)
 def test_local_bind_client_host_path_method_restrictions(self):
  f=Fixture()
  for kwargs in [{'bind_host':'0.0.0.0'},{'client_host':'192.0.2.5'},{'headers':{'Host':'evil.example'}},{'headers':{'Host':'localhost.evil.example'}},{'headers':{'Host':'localhost\r\nX: bad'}}]:self.assertEqual(f.get(**kwargs).status,403)
  for path in [PATH+'?url=https://evil.example',PATH+'#x','https://evil.example'+PATH]:self.assertEqual(f.get(path=path).status,400)
  self.assertEqual(f.get('POST').status,405);self.assertIsNone(f.get(path='/other.json'));self.assertEqual(f.calls,[])
 def test_mime_encoding_redirect_size_no_follow(self):
  for response in [TransportResponse(302,{'Location':'https://evil.example'},b''),TransportResponse(200,{'Content-Type':'text/html'},b'<html>'),TransportResponse(200,{'Content-Type':'application/json','Content-Encoding':'gzip'},body()),TransportResponse(200,{'Content-Type':'application/json'},b'x'*(MAX_BYTES+1))]:
   f=Fixture([response]);self.assertEqual(f.get().status,503);self.assertEqual(len(f.calls),1)
 def test_waiter_timeout_does_not_start_second_fetch(self):
  f=Fixture(wait_seconds=.02);entered=threading.Event();release=threading.Event();count=[]
  def fetch(headers,timeout):count.append(1);entered.set();release.wait(1);return good()
  f.reader.transport=fetch
  with ThreadPoolExecutor(max_workers=2) as pool:
   first=pool.submit(f.get);self.assertTrue(entered.wait(.5));second=pool.submit(f.get);self.assertEqual(second.result().status,503);release.set();self.assertEqual(first.result().status,200)
  self.assertEqual(len(count),1)
 def test_warm_refresh_coalesces_and_serves_previous_while_refreshing(self):
  f=Fixture();old=f.get();f.advance();entered=threading.Event();release=threading.Event();count=[]
  def fetch(headers,timeout):count.append(1);entered.set();release.wait(1);return good(body('2026-11-05T23:01:00.000Z'))
  f.reader.transport=fetch
  with ThreadPoolExecutor(max_workers=2) as pool:
   first=pool.submit(f.get);self.assertTrue(entered.wait(.5));stale=f.get();self.assertEqual(stale.body,old.body);self.assertEqual(stale.headers['X-Local-Cash-State'],'refreshing_last_good');release.set();self.assertNotEqual(first.result().body,old.body)
  self.assertEqual(len(count),1)
 def test_real_own_transport_uses_literal_url_no_cookies_auth_or_redirect_handler(self):
  class Response:
   status=200;headers={'Content-Type':'application/json','Content-Length':'2'}
   def __init__(self):self.parts=[b'{}',b'']
   def __enter__(self):return self
   def __exit__(self,*args):pass
   def read1(self,n):return self.parts.pop(0)
  class Opener:
   def open(self,request,timeout):
    self.request=request;self.timeout=timeout;return Response()
  op=Opener()
  with patch('local_cash_reader.build_opener',return_value=op) as mocked:
   result=own_site_transport({'If-None-Match':'"safe"'},3)
  self.assertEqual(op.request.full_url,URL);self.assertEqual(op.request.method,'GET');self.assertEqual(op.timeout,3);self.assertEqual(result.body,b'{}');self.assertNotIn('Cookie',op.request.headers);self.assertNotIn('Authorization',op.request.headers)
  self.assertIsNone(mocked.call_args.args[1].redirect_request(None,None,302,'',{},'https://evil.example'))
  for headers in [{'Authorization':'SYNTHETIC'}, {'Cookie':'SYNTHETIC'}, {'If-None-Match':'"ok"\r\nX:bad'}]:
   with self.assertRaises(Invalid):own_site_transport(headers,3)
  with self.assertRaises(Invalid):own_site_transport({},60)

if __name__=='__main__':unittest.main()
