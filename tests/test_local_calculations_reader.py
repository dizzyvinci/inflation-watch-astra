import copy
from concurrent.futures import ThreadPoolExecutor
from email.message import Message
import hashlib
import io
import json
from pathlib import Path
import sys
import threading
import types
import subprocess
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

HERE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(HERE))
import local_calculations_reader as m
WALL=1793970000 # tests override below from actual ISO, not source evidence
import datetime
WALL=datetime.datetime.fromisoformat('2026-11-06T13:00:00+00:00').timestamp()
RAW=(HERE/'tests/api-calculations-local-snapshot.json').read_bytes()
DTO=json.loads(RAW)
def headers(raw=RAW,dto=DTO):return {'Content-Type':'application/json; charset=utf-8','ETag':'"api-calculations-'+hashlib.sha256(raw).hexdigest()+'"',m.PREFIX+'Mode':'accepted_cache',m.PREFIX+'Prices-Captured-At':dto['sources']['prices']['capturedAt'] if dto['sources']['prices'] else 'none',m.PREFIX+'Overview-Captured-At':dto['sources']['overview']['capturedAt'] if dto['sources']['overview'] else 'none',m.PREFIX+'Definition-Hash':m.DEFINITION_HASH}
def message(h):
    out=Message()
    for k,v in h.items():out[k]=v
    return out
def cheap_validator(raw,ctx):
    dto=json.loads(raw)
    return {'snapshotHash':dto['snapshotHash'],'definitionHash':dto['definitionHash'],'pricesCapturedAt':dto['sources']['prices']['capturedAt'] if dto['sources']['prices'] else 'none','overviewCapturedAt':dto['sources']['overview']['capturedAt'] if dto['sources']['overview'] else 'none'}
class Tests(unittest.TestCase):
    def setUp(self):
        self.now=[0];self.calls=[];self.reply=m.TransportResponse(200,headers(),RAW);self.failure=None;self.flag=[True]
        self.reader=m.LocalCalculationsReader(enabled=lambda:self.flag[0],transport=self.transport,validator=cheap_validator,monotonic=lambda:self.now[0],wall=lambda:WALL)
    def transport(self,conditions,timeout):
        self.calls.append((conditions,timeout))
        if self.failure:raise self.failure
        return self.reply
    def get(self,method='GET',path=m.PATH,h=None,**kw):return self.reader.handle(method,path,{'Host':'localhost:8765',**(h or {})},**kw)
    def test_exact_production_body_hash_clock_and_header_protocol(self):
        self.reader.validator=m.validate
        r=self.get();self.assertEqual(r.status,200);self.assertEqual(r.body,RAW)
        self.assertEqual(r.headers[m.PREFIX+'Prices-Captured-At'],DTO['sources']['prices']['capturedAt'])
        self.assertEqual(r.headers[m.PREFIX+'Definition-Hash'],m.DEFINITION_HASH)
        self.assertEqual(r.headers['Cache-Control'],'private, no-store, no-transform')
        self.assertEqual(r.headers['Cloudflare-CDN-Cache-Control'],'no-store')
    def test_defaultoff_is404_zero_transport_and_explicit_htmlgate(self):
        self.reader=m.LocalCalculationsReader(transport=lambda*a:(_ for _ in()).throw(AssertionError('network')))
        self.assertEqual(self.get().status,404)
        raw=b'<html><body class="review"><footer>Control lock</footer></body></html>'
        self.assertEqual(m.inject_local_availability(raw,False),raw)
        active=m.inject_local_availability(raw,True);self.assertIn(b'data-api-calculations-available="true"',active)
        self.assertEqual(m.inject_local_availability(active,False),raw)
        self.assertEqual(m.inject_local_availability(raw.replace(b'class="review"',b'class="review" data-api-calculations-available=true'),False),raw)
    def test_gethead304_ttl_one_read_originalbytes(self):
        first=self.get();head=self.get('HEAD');notmod=self.get(h={'If-None-Match':first.headers['ETag']})
        self.assertEqual((first.status,head.status,notmod.status),(200,200,304));self.assertEqual(head.body,b'');self.assertEqual(notmod.body,b'')
        self.assertEqual(int(head.headers['Content-Length']),len(RAW));self.assertEqual(len(self.calls),1)
        self.assertEqual(head.headers[m.PREFIX+'Prices-Captured-At'],first.headers[m.PREFIX+'Prices-Captured-At'])
    def test_upstream304_same_body_and_splitclocks_required(self):
        first=self.get();self.now[0]=61;self.reply=m.TransportResponse(304,headers(),b'')
        self.assertEqual(self.get().body,RAW);self.assertEqual(self.calls[-1][0],{'If-None-Match':first.headers['ETag']})
        for key in ('Prices-Captured-At','Overview-Captured-At'):
            self.now[0]+=61;h=headers();h[m.PREFIX+key]='2026-11-06T12:01:00Z';self.reply=m.TransportResponse(304,h,b'')
            r=self.get();self.assertEqual(r.body,RAW);self.assertEqual(r.headers[m.PREFIX+'Mode'],'retained_last_good')
    def test_upstreamretained_mode_is_not_relabelledfresh(self):
        h=headers();h[m.PREFIX+'Mode']='retained_last_good';self.reply=m.TransportResponse(200,h,RAW)
        self.assertEqual(self.get().headers[m.PREFIX+'Mode'],'retained_last_good')
    def test_timeout_and_httpfailure_keep_old_body_both_clocks_and_backoff(self):
        old=self.get();self.now[0]=61;self.failure=TimeoutError()
        r=self.get();self.assertEqual(r.body,old.body);self.assertEqual(r.headers[m.PREFIX+'Mode'],'retained_last_good')
        self.assertEqual(r.headers[m.PREFIX+'Prices-Captured-At'],old.headers[m.PREFIX+'Prices-Captured-At']);self.assertEqual(r.headers[m.PREFIX+'Overview-Captured-At'],old.headers[m.PREFIX+'Overview-Captured-At'])
        count=len(self.calls);self.get();self.assertEqual(len(self.calls),count)
    def test_cold404_vs503_and_withdrawals_clear_warm_only_this_reader(self):
        for status in (401,403,404):
            self.reader=m.LocalCalculationsReader(enabled=True,transport=self.transport,validator=cheap_validator,monotonic=lambda:self.now[0],wall=lambda:WALL)
            self.reply=m.TransportResponse(200,headers(),RAW);self.get();self.now[0]+=61
            h=message(headers());h['ETag']='contradiction';self.reply=m.TransportResponse(status,h,b'')
            r=self.get();self.assertEqual(r.status,status);self.assertIsNone(self.reader.raw);self.assertNotIn(m.PREFIX+'Prices-Captured-At',r.headers)
        self.now[0]+=31;self.reply=m.TransportResponse(503,{},b'');self.assertEqual(self.get().status,503)
    def test_bad_source_headers_bytehash_and_size_failclosed(self):
        for key,value in [('ETag','"bad"'),('Content-Type','text/html'),('Content-Encoding','gzip'),(m.PREFIX+'Mode','current'),(m.PREFIX+'Definition-Hash','0'*64),(m.PREFIX+'Prices-Captured-At','bad-clock'),('Content-Length','1')]:
            with self.subTest(key=key):
                h=headers();h[key]=value;self.reply=m.TransportResponse(200,h,RAW);self.reader=m.LocalCalculationsReader(enabled=True,transport=self.transport,validator=cheap_validator)
                self.assertEqual(self.get().status,503)
        self.reader=m.LocalCalculationsReader(enabled=True,transport=lambda*a:m.TransportResponse(200,headers(),b'x'*600001),validator=cheap_validator)
        self.assertEqual(self.get().status,503)
    def test_duplicate_actual_httpmessage_everycritical_header_200_and304(self):
        for status in (200,304):
            for key in ('ETag','Content-Type','Content-Encoding','Content-Length',m.PREFIX+'Mode',m.PREFIX+'Prices-Captured-At',m.PREFIX+'Overview-Captured-At',m.PREFIX+'Definition-Hash'):
                with self.subTest(status=status,key=key):
                    self.reader=m.LocalCalculationsReader(enabled=True,transport=self.transport,validator=cheap_validator,monotonic=lambda:self.now[0],wall=lambda:WALL)
                    self.reply=m.TransportResponse(200,headers(),RAW)
                    if status==304:self.get();self.now[0]+=61
                    h=message(headers());h[key]='one';h[key]='two';self.reply=m.TransportResponse(status,h,b'' if status==304 else RAW)
                    r=self.get();self.assertEqual(r.status,200 if status==304 else 503)
                    if status==304:self.assertEqual(r.headers[m.PREFIX+'Mode'],'retained_last_good')
    def test_older_prices_cannot_hide_behind_newer_overview(self):
        self.get();self.now[0]=61;d=copy.deepcopy(DTO);d['sources']['prices']['capturedAt']='2026-11-06T11:59:00Z';d['sources']['overview']['capturedAt']='2026-11-06T12:01:00Z'
        raw=json.dumps(d).encode();self.reply=m.TransportResponse(200,headers(raw,d),raw)
        r=self.get();self.assertEqual(r.body,RAW);self.assertEqual(r.headers[m.PREFIX+'Mode'],'retained_last_good')
    def test_missing_source_none_clock_is_not_fabricated(self):
        d=copy.deepcopy(DTO);d['sources']['overview']=None;raw=json.dumps(d).encode();self.reply=m.TransportResponse(200,headers(raw,d),raw)
        r=self.get();self.assertEqual(r.headers[m.PREFIX+'Overview-Captured-At'],'none')
    def test_429_retryafter_applies_without_request_loop(self):
        self.reply=m.TransportResponse(429,{'Retry-After':'900'},b'');self.get();self.assertEqual(self.reader.due,900)
        self.now[0]=899;self.get();self.assertEqual(len(self.calls),1)
    def test_32cold_callers_singleflight_and_bounded_waiters(self):
        entered=threading.Event();release=threading.Event();original=self.transport
        def slow(*a):entered.set();release.wait(3);return original(*a)
        self.reader.transport=slow
        with ThreadPoolExecutor(max_workers=32) as pool:
            futures=[pool.submit(self.get) for _ in range(32)];self.assertTrue(entered.wait(2));release.set();results=[f.result(5) for f in futures]
        self.assertTrue(all(r.status==200 for r in results));self.assertEqual(len(self.calls),1);self.assertEqual(self.reader.waiters,0)
    def test_warm_inflight_is_retained_immediately_and_off_cancels_late(self):
        self.get();self.now[0]=61;entered=threading.Event();release=threading.Event();original=self.transport
        def slow(*a):entered.set();release.wait(3);return original(*a)
        self.reader.transport=slow
        with ThreadPoolExecutor(max_workers=1) as pool:
            f=pool.submit(self.get);self.assertTrue(entered.wait(2));warm=self.get();self.assertEqual(warm.headers[m.PREFIX+'Mode'],'retained_last_good')
            self.flag[0]=False;self.assertEqual(self.get().status,404);self.flag[0]=True;release.set();self.assertEqual(f.result(5).status,404)
        self.assertIsNone(self.reader.raw)
    def test_localhost_host_client_bind_path_method_allowlist(self):
        for kw in ({'bind_host':'0.0.0.0'},{'client_host':'192.0.2.1'}):self.assertEqual(self.get(**kw).status,403)
        for h in ({'Host':'example.com'},{'Host':'user@localhost:8765'},{'Host':'localhost:8765/path'}):
            self.assertEqual(self.reader.handle('GET',m.PATH,h).status,403)
        self.assertEqual(self.get(path=m.PATH+'?query=secret').status,400);self.assertEqual(self.get('POST').status,405);self.assertIsNone(self.get(path='/unrelated'))
        self.assertEqual(len(self.calls),0)
    def test_production_node_rejects_json_duplicates_semantic_hash_and_clock_mismatch(self):
        h=headers();ctx={'etag':h['ETag'],'pricesCapturedAt':h[m.PREFIX+'Prices-Captured-At'],'overviewCapturedAt':h[m.PREFIX+'Overview-Captured-At'],'definitionHash':m.DEFINITION_HASH,'wallNow':WALL*1000}
        self.assertEqual(m.validate(RAW,ctx)['definitionHash'],m.DEFINITION_HASH)
        for raw in (RAW.replace(b'{',b'{"schemaVersion":1,',1),RAW.replace(b'"snapshotHash":',b'"extra":1,"snapshotHash":')):
            c={**ctx,'etag':'"api-calculations-'+hashlib.sha256(raw).hexdigest()+'"'}
            with self.assertRaises(m.Invalid):m.validate(raw,c)
        with self.assertRaises(m.Invalid):m.validate(RAW,{**ctx,'pricesCapturedAt':'none'})
    def test_real_production_none_clock_snapshot_is_valid_unavailable_evidence(self):
        p=subprocess.run(['node',str(HERE/'tests/make-local-calculation-fixtures.mjs')],capture_output=True,timeout=10)
        self.assertEqual(p.returncode,0,p.stderr.decode());raw=json.loads(p.stdout)['none'].encode();d=json.loads(raw);h=headers(raw,d)
        self.reader.validator=m.validate;self.reply=m.TransportResponse(200,h,raw)
        r=self.get();self.assertEqual(r.status,200);self.assertEqual(r.headers[m.PREFIX+'Prices-Captured-At'],'none');self.assertEqual(r.headers[m.PREFIX+'Overview-Captured-At'],'none');self.assertIsNone(json.loads(r.body)['current']['index'])

class TransportTests(unittest.TestCase):
    def response(self,h,status=200,raw=RAW):
        class Reply:
            headers=h
            def __init__(self):self.status=status;self.stream=io.BytesIO(raw);self.reads=0
            def __enter__(self):return self
            def __exit__(self,*a):pass
            def read1(self,n):self.reads+=1;return self.stream.read(n)
        return Reply()
    def test_actual_transport_fixed_url_no_proxy_redirect_cookie_auth_and_raw_headers(self):
        reply=self.response(message(headers()));seen=[]
        class Opener:
            def open(self,request,timeout):seen.append((request,timeout));return reply
        with patch.object(m,'build_opener',return_value=Opener()) as opener:
            result=m.own_site_transport({},3)
        self.assertEqual(result.body,RAW);self.assertEqual(seen[0][0].full_url,m.URL)
        self.assertEqual(opener.call_args.args[0].proxies,{});self.assertIsInstance(opener.call_args.args[1],m.NoRedirect)
        self.assertNotIn('Authorization',dict(seen[0][0].header_items()));self.assertNotIn('Cookie',dict(seen[0][0].header_items()))
        self.assertIsNone(m.NoRedirect().redirect_request(None,None,302,'',{},'https://example.com'))
    def test_actual_transport_rejects_duplicate_before_bodyread_and_http304_duplicates(self):
        h=message(headers());h['ETag']='contradiction';reply=self.response(h)
        class Opener:
            def open(self,*a,**k):return reply
        with patch.object(m,'build_opener',return_value=Opener()):
            with self.assertRaises(m.Invalid):m.own_site_transport({},3)
        self.assertEqual(reply.reads,0)
        class Bad304:
            def open(self,*a,**k):raise HTTPError(m.URL,304,'',h,io.BytesIO())
        with patch.object(m,'build_opener',return_value=Bad304()):
            with self.assertRaises(m.Invalid):m.own_site_transport({'If-None-Match':'"x"'},3)
    def test_actual_transport_withdrawal_ignores_malformed_headers_and_rejects_arbitrary_conditions(self):
        h=message(headers());h['ETag']='contradiction'
        class Off:
            def open(self,*a,**k):raise HTTPError(m.URL,404,'',h,io.BytesIO())
        with patch.object(m,'build_opener',return_value=Off()):self.assertEqual(m.own_site_transport({},3).status,404)
        for args in (({'Authorization':'secret'},3),({'If-None-Match':'x\r\ny'},3),({},99)):
            with self.assertRaises(m.Invalid):m.own_site_transport(*args)
    def test_node_environment_is_minimal_and_errors_fixed_no_echo(self):
        fake=types.SimpleNamespace(returncode=2,stdout=b'',stderr=b'private-provider-secret')
        with patch.dict(m.os.environ,{'API_KEY':'DO-NOT-READ','CLOUDFLARE_API_TOKEN':'DO-NOT-READ'}),patch.object(m.subprocess,'run',return_value=fake) as run:
            with self.assertRaisesRegex(m.Invalid,'^invalid_local_calculations$'):m.validate(RAW,{})
        self.assertNotIn('API_KEY',run.call_args.kwargs['env']);self.assertNotIn('CLOUDFLARE_API_TOKEN',run.call_args.kwargs['env'])
        self.assertEqual(run.call_args.args[0][0],'node');self.assertEqual(run.call_args.kwargs['timeout'],3)

if __name__=='__main__':unittest.main(verbosity=2)
