import copy
import hashlib
import json
from pathlib import Path
import subprocess
import threading
import unittest
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import local_nx_reader as nx

STAMP='2026-11-05T12:00:00.000Z'
def dto():
    stats=lambda rate:{'low':rate,'p25':rate,'median':rate,'p75':rate,'high':rate,'reportedPosterCount':2,'statisticsComplete':True}
    rows=[dict(at='2026-11-05T10:00:00Z',side=side,capturedAt=STAMP,sourceObservedAt=None,**stats(rate)) for side,rate in [('buy',15),('sell',20)]]
    return dict(schemaVersion=1,kind='nx_offer_display_subset',methodVersion=1,sourceIdentity='maplestory_market_nx_offers',unit='mesos_per_NX',basis='advertised_NX_offer_rates_not_completed_sales',capturedAt=STAMP,sourceObservedAt=None,qualifiedIndividualTrades=0,publicationEligible=False,changesGoodsIndex=False,changesHeadlineBenchmark=False,attribution={'label':'NX offers from maplestory.market','url':'https://maplestory.market/?ref=v6kkdvp6'},nativeSummary=dict(sourceUrl=nx.SUMMARY,capturedAt=STAMP,reportedWindowHours=8,actualWindowStart=None,actualWindowEnd=None,sourceLastHeardAt='2026-11-05T10:59:00Z',sourceLimited=False,buy={'low':15,'median':15,'high':15,'mode':15,'reportedPosterCount':2,'statisticsComplete':True},sell=None),hourlyHistory=dict(sourceUrl=nx.HISTORY,bucketCompletionKnown=False,maxSelectedHours=744,totalRetainedSourceHourSideRows=2,omittedRetainedSourceHourSideRows=0,rows=rows),derived24=dict(kind='derived_published_hourly_histogram_pool',hours=24,anchorSourceHourLabel='2026-11-05T10:00:00Z',firstSelectedSourceHourLabel='2026-11-04T11:00:00Z',sides={side:dict(p25=rate,median=rate,p75=rate,posterHourObservations=2,availableHourBuckets=1,missingHourBuckets=23) for side,rate in [('buy',15),('sell',20)]},quantileMethod='linear_interpolation_ordered_frequency_bins',counts='poster_hour_observations_not_unique_people_or_trades',bucketCompletionKnown=False))
def body(value=None):return json.dumps(dto() if value is None else value,separators=(',',':')).encode()
def response(raw=None,status=200,mode='accepted_cache'):
    raw=body() if raw is None else raw
    return nx.TransportResponse(status,{'Content-Type':'application/json','ETag':'"'+hashlib.sha256(raw).hexdigest()+'"','X-Astra-NX-Phase':'published_offer_subset','X-Astra-NX-Mode':mode,'X-Astra-NX-Captured-At':json.loads(raw)['capturedAt']},raw if status==200 else b'')
class Fixture:
    def __init__(self):
        self.now=1000;self.calls=[];self.next=response()
        def transport(headers,timeout):
            self.calls.append((dict(headers),timeout))
            if isinstance(self.next,Exception):raise self.next
            return self.next
        self.reader=nx.LocalNxReader(transport=transport,monotonic=lambda:self.now,wall=lambda:1793880000+self.now)
    def get(self,method='GET',path=nx.PATH,headers=None,**kwargs):return self.reader.handle(method,path,{'Host':'127.0.0.1:8765',**(headers or {})},**kwargs)
    def advance(self,n=61):self.now+=n

class ReaderTests(unittest.TestCase):
    def test_get_head304_originalclock_and60s_cache(self):
        f=Fixture();a=f.get();self.assertEqual(a.status,200);self.assertEqual(a.body,body());self.assertEqual(a.headers['X-Astra-NX-Captured-At'],STAMP)
        self.assertEqual(f.get('HEAD').body,b'');self.assertEqual(int(f.get('HEAD').headers['Content-Length']),len(body()));self.assertEqual(f.get(headers={'If-None-Match':a.headers['ETag']}).status,304);self.assertEqual(len(f.calls),1)
        f.advance();f.next=response(status=304,mode='retained_last_good');b=f.get();self.assertEqual(b.body,a.body);self.assertEqual(b.headers['X-Astra-NX-Mode'],'retained_last_good');self.assertEqual(f.calls[-1][0],{'If-None-Match':a.headers['ETag']})
    def test_cold404_vs503_and_auth404_clear_nx_only(self):
        for status in (401,403,404):
            f=Fixture();f.get();f.advance();f.next=nx.TransportResponse(status,{},b'');r=f.get();self.assertEqual(r.status,status);self.assertNotIn('ETag',r.headers);self.assertNotIn('X-Astra-NX-Captured-At',r.headers);self.assertIsNone(f.reader.raw)
        f=Fixture();f.next=nx.TransportResponse(404,{},b'');self.assertEqual(f.get().status,404)
        f=Fixture();f.next=nx.TransportResponse(503,{},b'');self.assertEqual(f.get().status,503)
    def test_failure_retains_body_and_clock_with_backoff_and_no_old_refresh(self):
        f=Fixture();a=f.get();f.advance();f.next=TimeoutError();b=f.get();self.assertEqual(b.status,200);self.assertEqual(b.body,a.body);self.assertEqual(b.headers['ETag'],a.headers['ETag']);self.assertEqual(b.headers['X-Astra-NX-Captured-At'],STAMP);self.assertEqual(b.headers['X-Astra-NX-Mode'],'retained_last_good');self.assertEqual(f.reader.next_due,f.now+30);f.get();self.assertEqual(len(f.calls),2)
    def test_same_capture_correction_allowed_but_older_capture_rejected(self):
        f=Fixture();a=f.get();f.advance();v=dto();v['nativeSummary']['sourceLimited']=True;f.next=response(body(v));b=f.get();self.assertNotEqual(b.headers['ETag'],a.headers['ETag']);self.assertEqual(b.headers['X-Astra-NX-Captured-At'],STAMP)
        f.advance();v['capturedAt']='2026-11-05T11:59:00.000Z';v['nativeSummary']['capturedAt']=v['capturedAt'];v['hourlyHistory']['rows'][0]['capturedAt']=v['capturedAt'];v['hourlyHistory']['rows'][1]['capturedAt']=v['capturedAt'];f.next=response(body(v));self.assertEqual(f.get().body,b.body)
    def test_mime_etag_phase_capture_and_unknown_fields_fail_closed(self):
        for k,v in [('Content-Type','text/html'),('ETag','"wrong"'),('X-Astra-NX-Phase','live'),('X-Astra-NX-Captured-At','2026-11-06T12:00:00.000Z')]:
            f=Fixture();r=response();r.headers[k]=v;f.next=r;self.assertEqual(f.get().status,503)
        f=Fixture();v=dto();v['owner']='forbidden';f.next=response(body(v));self.assertEqual(f.get().status,503)
    def test_query_host_methods_loopback_are_checked_before_transport(self):
        f=Fixture()
        for host in ['evil.example','localhost@127.0.0.1','localhost/evil','localhost?x','127.0.0.1:bad','localhost\r\nX: y']:
            self.assertEqual(f.get(headers={'Host':host}).status,403)
        self.assertEqual(f.get(path=nx.PATH+'?url=https://elsewhere').status,400);self.assertEqual(f.get('POST').status,405);self.assertEqual(f.get(client_host='8.8.8.8').status,403);self.assertEqual(f.get(bind_host='0.0.0.0').status,403);self.assertEqual(f.calls,[])
    def test_retry_after_and_redirect_never_forward_credentials(self):
        f=Fixture();f.next=nx.TransportResponse(429,{'Retry-After':'120'},b'');self.assertEqual(f.get().status,503);self.assertEqual(f.reader.next_due,f.now+120)
        f=Fixture();f.next=nx.TransportResponse(302,{'Location':'https://provider/private'},b'');self.assertEqual(f.get().status,503);self.assertEqual(f.calls,[({},3)])
    def test_singleflight_cold_and_warm(self):
        enter=threading.Event();release=threading.Event();calls=[]
        def transport(headers,timeout):calls.append(headers);enter.set();release.wait(2);return response()
        r=nx.LocalNxReader(transport=transport,wait_seconds=2);out=[];a=threading.Thread(target=lambda:out.append(r.handle('GET',nx.PATH,{'Host':'localhost'})));b=threading.Thread(target=lambda:out.append(r.handle('HEAD',nx.PATH,{'Host':'localhost'})));a.start();enter.wait(1);b.start();release.set();a.join(3);b.join(3);self.assertEqual(len(calls),1);self.assertEqual([x.status for x in out],[200,200])
    def test_warm_refresh_returns_retained_without_wait_or_second_request(self):
        f=Fixture();old=f.get();f.advance();entered=threading.Event();release=threading.Event();calls=[]
        def slow(headers,timeout):calls.append(headers);entered.set();release.wait(2);return response()
        f.reader.transport=slow;thread=threading.Thread(target=f.get);thread.start();entered.wait(1)
        kept=f.get();self.assertEqual(kept.body,old.body);self.assertEqual(kept.headers['X-Astra-NX-Mode'],'retained_last_good');self.assertEqual(kept.headers['X-Astra-NX-Captured-At'],STAMP);self.assertEqual(len(calls),1);release.set();thread.join(3)
    def test_transport_is_literal_no_proxy_no_redirect_and_bounded(self):
        class Fake:
            status=200
            headers={'Content-Length':'600001'}
            def __enter__(self):return self
            def __exit__(self,*args):pass
        class Opener:
            def open(self,request,timeout):
                self.request=request;self.timeout=timeout;return Fake()
        opener=Opener()
        with patch.object(nx,'build_opener',return_value=opener) as build:
            with self.assertRaises(nx.Invalid):nx.own_site_transport({},3)
            self.assertEqual(opener.request.full_url,'https://inflation.gg/api-nx-offers.json');self.assertEqual(opener.request.get_method(),'GET');self.assertEqual(build.call_args.args[0].proxies,{});self.assertIsInstance(build.call_args.args[1],nx._NoRedirect);self.assertIsNone(nx._NoRedirect().redirect_request(None,None,None,None,None,None))
        with self.assertRaises(nx.Invalid):nx.own_site_transport({'Authorization':'no'},3)
        with self.assertRaises(nx.Invalid):nx.own_site_transport({},4)
    def test_wrong304_capture_or_etag_cannot_refresh_old_clock(self):
        f=Fixture();old=f.get();f.advance();r=response(status=304);r.headers['X-Astra-NX-Captured-At']='2026-11-06T12:00:00.000Z';f.next=r;kept=f.get();self.assertEqual(kept.body,old.body);self.assertEqual(kept.headers['X-Astra-NX-Captured-At'],STAMP);self.assertEqual(kept.headers['X-Astra-NX-Mode'],'retained_last_good')
    def test_actual_stream_limit_even_when_content_length_is_false(self):
        class Fake:
            status=200
            headers={'Content-Length':'1'}
            remaining=600001
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read1(self,n):
                part=b'x'*min(n,self.remaining);self.remaining-=len(part);return part
        class Opener:
            def open(self,*a,**k):return Fake()
        with patch.object(nx,'build_opener',return_value=Opener()):
            with self.assertRaises(nx.Invalid):nx.own_site_transport({},3)
    def test_transport_total_deadline_checked_before_body_read(self):
        class Fake:
            status=200
            headers={}
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read1(self,n):raise AssertionError('expired deadline read body')
        class Opener:
            def open(self,*a,**k):return Fake()
        with patch.object(nx,'build_opener',return_value=Opener()),patch.object(nx.time,'monotonic',side_effect=[0,4]):
            with self.assertRaises(TimeoutError):nx.own_site_transport({},3)

class ParityTests(unittest.TestCase):
    def test_exact_browser_protocol_acceptance_parity(self):
        cases=[body().decode()]
        for field,bad in [('schemaVersion',True),('sourceObservedAt',STAMP),('qualifiedIndividualTrades',1),('publicationEligible',True),('attribution',{})]:
            v=dto();v[field]=bad;cases.append(body(v).decode())
        v=dto();v['schemaVersion']=1.0;cases.append(body(v).decode())
        for change in ('bool_count','order','duplicate_hour','float_count','bad_complete','wrong_bounds','unsafe','null_native','empty','year_zero'):
            v=dto()
            if change=='bool_count':v['hourlyHistory']['rows'][0]['reportedPosterCount']=True
            elif change=='order':v['hourlyHistory']['rows'].reverse()
            elif change=='duplicate_hour':v['hourlyHistory']['rows'][1]=copy.deepcopy(v['hourlyHistory']['rows'][0])
            elif change=='float_count':v['hourlyHistory']['rows'][0]['reportedPosterCount']=2.0
            elif change=='bad_complete':v['hourlyHistory']['rows'][0]['statisticsComplete']=False
            elif change=='wrong_bounds':v['nativeSummary']['actualWindowStart']=STAMP
            elif change=='unsafe':v['hourlyHistory']['rows'][0]['reportedPosterCount']=2**53
            elif change=='null_native':v['nativeSummary']=None
            elif change=='empty':
                v['nativeSummary']=None;v['hourlyHistory']['rows']=[];v['hourlyHistory']['totalRetainedSourceHourSideRows']=0;v['derived24']['anchorSourceHourLabel']=None;v['derived24']['firstSelectedSourceHourLabel']=None
                for side in v['derived24']['sides'].values():side.update(p25=None,median=None,p75=None,posterHourObservations=None,availableHourBuckets=0,missingHourBuckets=24)
            elif change=='year_zero':
                for r in v['hourlyHistory']['rows']:r['at']='0000-01-01T00:00:00Z'
                v['derived24']['anchorSourceHourLabel']='0000-01-01T00:00:00Z';v['derived24']['firstSelectedSourceHourLabel']='-000001-12-31T01:00:00Z'
            cases.append(body(v).decode())
        cases.extend([cases[0].replace('"schemaVersion":1','"schemaVersion":1,"schemaVersion":1'),cases[0]+' trailing',cases[0].replace('"median":15','"median":NaN',1)])
        process=subprocess.run(['node',str(Path(__file__).with_name('local-nx-protocol-parity.cjs'))],input=json.dumps(cases),text=True,capture_output=True,check=True,timeout=10)
        js=json.loads(process.stdout);py=[]
        for case in cases:
            try:nx.validate(case.encode());py.append(True)
            except nx.Invalid:py.append(False)
        self.assertEqual(py,js);self.assertGreater(sum(py),3);self.assertGreater(len(py)-sum(py),8)

if __name__=='__main__':unittest.main()
