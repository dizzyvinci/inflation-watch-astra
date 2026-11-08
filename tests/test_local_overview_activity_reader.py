"""Synthetic owned-session/HTTP fixtures only; no listener or real auth/network."""
from pathlib import Path
from email.message import Message
from unittest.mock import patch
import base64,contextlib,hashlib,importlib.util,io,json,sys,tempfile,threading,time,types,unittest
SITE=Path(__file__).resolve().parents[1];sys.path[:0]=[str(SITE),str(SITE/'tests')]
import local_overview_activity_reader as overview
import local_own_site_session as native
from test_local_own_site_session import Server,Response
RAW=(SITE/'tests/fixtures/overview-route-wire.json').read_bytes()
assert hashlib.sha256(RAW).hexdigest()=='1de0904cc064237f755412ba6f6462d73c88bcab0bf23299d5aef026e07ac71a'
WIRE=json.loads(RAW);RETAINED=json.loads((SITE/'tests/fixtures/overview-retained-wire.json').read_bytes());CFG={'schemaVersion':1,'enabled':True,'profile':'overview_window_aggregate_v1','publicEpoch':'activity-public-v1'}
def message(path=overview.CURRENT,**extra):
    h=Message();h['Host']='localhost:8765'
    if path==overview.CURRENT:h[overview.REQUEST]=overview.PROTOCOL
    for k,v in extra.items():h[k]=v
    return h
def packet(name='current'):
    p=WIRE[name];return overview.TransportResponse(p['status'],{**p['headers'],'x-astra-preview':'password'},p['body'].encode())
def schema(raw,ctx,timeout):
    """Only already-byte-pinned positive fixture shapes; real JS negatives separate."""
    assert 0<timeout<=3
    if ctx['path']==overview.PROFILE:return raw==packet('profile').body and ctx['status']==200 and ctx['publicEpoch']==CFG['publicEpoch']
    if ctx['status']==304:return raw==b''and ctx['priorBody']==packet().body and ctx['condition']==packet().headers['etag']
    return raw==(packet().body if ctx['status']==200 else RETAINED['body'].encode()if ctx['status']==409 else b'')

class Backend(Server):
    def __init__(self):super().__init__();self.hold=None;self.entered=threading.Event();self.reply_mode='current'
    def open(self,request,timeout):
        path=request.full_url.removeprefix(native.HOST)
        if not path.startswith(overview.PREFIX):return super().open(request,timeout)
        self.calls.append((path,request));name='profile'if path==overview.PROFILE else 'notModified'if request.get_header('If-none-match')else self.reply_mode
        p=packet(name);owner=self
        if self.hold and path==overview.CURRENT:
            class Held(Response):
                def read1(self,n):owner.entered.set();owner.hold.wait(2);return super().read1(n)
            return Held(request.full_url,p.status,p.body,p.headers)
        return Response(request.full_url,p.status,p.body,p.headers)

class Tests(unittest.TestCase):
    def fixture(self,transport=None,validator=schema,**kw):
        cfg=[json.dumps(CFG)];clock=[0.0];authority=[(True,1,1)];calls=[]
        if transport is None:
            def transport(path,conditions,timeout):
                calls.append((path,dict(conditions),timeout));return packet('profile'if path==overview.PROFILE else'notModified'if'If-None-Match'in conditions else'current')
        r=overview.LocalOverviewActivityReader(SITE,config=lambda:cfg[0],transport=transport,validator=validator,monotonic=lambda:clock[0],**kw);r.authority=lambda:authority[0]
        return r,cfg,clock,authority,calls
    def get(self,r,path=overview.CURRENT,method='GET',h=None,**kw):return r.handle(method,path,message(path)if h is None else h,**kw)
    def settle(self,r):
        with r.cv:self.assertTrue(r.cv.wait_for(lambda:r.job is None,timeout=2))
    def native(self,**kw):
        backend=Backend();session=native.OwnSiteSession(opener_factory=backend);session.configure('SYNTHETIC_PASSWORD');session.verified_profile()
        r=overview.LocalOverviewActivityReader(SITE,config=lambda:json.dumps(CFG),validator=schema,**kw);self.assertTrue(overview.attach_overview_activity_reader(session,r));return r,session,backend
    def test_default_off_invalid_config_has_no_authority_transport_or_validator(self):
        def forbidden(*a):raise AssertionError('off callback')
        for cfg in[None,'{"enabled":false}','{"enabled":0}','{"enabled":false,"extra":1}','{"schemaVersion":1}']:
            r=overview.LocalOverviewActivityReader(config=lambda:cfg,transport=forbidden,validator=forbidden);r.authority=forbidden
            self.assertEqual(self.get(r).status,404);self.assertEqual(r.state()['pendingTasks'],0)
    def test_unrelated_routes_are_unclaimed(self):
        r,_,_,_,calls=self.fixture()
        for path in['/','/api-basic-item-prices/profile.json','/api-item-prices/2040801.json']:self.assertIsNone(self.get(r,path))
        self.assertEqual(calls,[])
    def test_host_origin_fixedport_methods_duplicates_and_query_before_io(self):
        r,_,_,_,calls=self.fixture()
        for h,kw in[(message(Origin='https://foreign.invalid'),{}),(message(**{'Sec-Fetch-Site':'cross-site'}),{}),(message(),{'port':8766}),(message(),{'client_host':'192.0.2.1'})]:self.assertEqual(self.get(r,h=h,**kw).status,403)
        h=message();h[overview.REQUEST]=overview.PROTOCOL;self.assertEqual(self.get(r,h=h).status,400)
        for p in[overview.CURRENT+'?x=1',overview.PROFILE+'#x',overview.PREFIX+'1.json']:self.assertEqual(self.get(r,p).status,400)
        self.assertEqual(self.get(r,method='POST').status,405);self.assertEqual(calls,[])
    def test_samebytes_cold_get_head_cached304_and_clocks(self):
        r,_,_,_,calls=self.fixture();v=self.get(r);self.assertEqual(v.status,200);self.assertEqual(v.body,packet().body);self.assertEqual(hashlib.sha256(v.body).hexdigest(),v.headers['x-astra-overview-activity-body-sha256'])
        head=self.get(r,method='HEAD');self.assertEqual(head.body,b'');self.assertEqual(head.headers['Content-Length'],str(len(v.body)))
        h=message(**{'If-None-Match':v.headers['etag']});self.assertEqual(self.get(r,h=h).status,304);self.assertEqual(len(calls),1)
        self.assertEqual(json.loads(v.body)['reference']['source']['capturedAt'],WIRE['sourceDeclaration']['capturedAt'])
    def test_expired_remote304_needs_owned_body_and_retains_original_bytes(self):
        r,_,clock,_,calls=self.fixture();first=self.get(r);clock[0]=16;v=self.get(r,h=message(**{'If-None-Match':first.headers['etag']}));self.assertEqual(v.status,304);self.assertEqual(v.body,b'');self.assertEqual(calls[-1][1]['If-None-Match'],first.headers['etag']);self.assertEqual(r.entries[overview.CURRENT]['response'].body,first.body)
    def test_unknown_conditional_is_not_forwarded(self):
        r,_,_,_,calls=self.fixture();self.assertEqual(self.get(r,h=message(**{'If-None-Match':'"overview-activity-'+'0'*64+'"'})).status,200);self.assertNotIn('If-None-Match',calls[0][1])
    def test_upstream409_is_raw_and_never_local304(self):
        v=overview.TransportResponse(409,{**RETAINED['headers'],'x-astra-preview':'password'},RETAINED['body'].encode())
        r,_,_,_,_=self.fixture(lambda*a:v);out=self.get(r);self.assertEqual(out.status,409);self.assertEqual(out.body,v.body);self.assertEqual(self.get(r,h=message(**{'If-None-Match':v.headers['etag']})).status,409)
    def test_transient_failure_never_rewrites_old_current_as_retained_source_body(self):
        mode=[False]
        def transport(*a):return overview.TransportResponse(503,{'x-astra-preview':'password'},b'PRIVATE_ERROR')if mode[0]else packet()
        r,_,clock,_,_=self.fixture(transport);v=self.get(r);clock[0]=16;mode[0]=True;out=self.get(r);self.assertEqual(out.status,503);self.assertNotIn(b'PRIVATE_ERROR',out.body);self.assertNotEqual(out.body,v.body);self.assertEqual(r.entries[overview.CURRENT]['response'].body,v.body)
    def test_declared404_clears_all_previous_admitted_cache(self):
        off=[False];r,_,clock,_,_=self.fixture(lambda*a:overview.TransportResponse(404,{'x-astra-preview':'password'},b'')if off[0]else packet());self.get(r);clock[0]=16;off[0]=True;self.assertEqual(self.get(r).status,404);self.assertEqual(r.state()['cacheEntries'],0)
    def test_auth_denial_clears_old_cache_and_returns401(self):
        denied=[False];r,_,clock,_,_=self.fixture(lambda*a:overview.TransportResponse(401,{},b'PRIVATE')if denied[0]else packet());self.get(r);clock[0]=16;denied[0]=True;v=self.get(r);self.assertEqual(v.status,401);self.assertNotIn(b'PRIVATE',v.body);self.assertEqual(r.state()['cacheEntries'],0)
    def test_config_off_on_during_held_work_never_releases_or_acknowledges_early(self):
        entered=threading.Event();release=threading.Event();calls=[]
        def held(*a):calls.append(a);entered.set();release.wait(2);return packet()
        r,cfg,_,_,_=self.fixture(held,wait_seconds=.04);v=self.get(r);self.assertTrue(entered.is_set());self.assertEqual(v.status,503);self.assertEqual(r.state()['pendingTasks'],1)
        cfg[0]=None;self.assertEqual(self.get(r).status,404);cfg[0]=json.dumps(CFG);self.assertEqual(self.get(r).status,503);self.assertEqual(len(calls),1);release.set();self.settle(r);self.assertEqual(r.state()['cacheEntries'],0)
    def test_global_singleflight_and_capacity_no_second_different_path(self):
        release=threading.Event();entered=threading.Event();calls=[]
        def held(*a):calls.append(a);entered.set();release.wait(2);return packet()
        r,_,_,_,_=self.fixture(held,wait_seconds=.04);self.get(r);self.assertTrue(entered.is_set());self.assertEqual(self.get(r,overview.PROFILE).status,503);self.assertEqual(len(calls),1);release.set();self.settle(r)
    def test_deadline_across_transport_validation_and_final_cache_admission(self):
        r,_,clock,_,_=self.fixture(validator=lambda raw,ctx,timeout:(clock.__setitem__(0,4)or True));self.assertEqual(self.get(r).status,503);self.assertEqual(r.state()['cacheEntries'],0)
    def test_pause_resume_does_not_fetch_or_renew_original_context(self):
        r,_,_,_,calls=self.fixture();self.get(r);r.pause();self.assertEqual(self.get(r).status,503);self.assertEqual(r.state()['cacheEntries'],0);r.resume();self.assertEqual(len(calls),1)
    def test_same_native_session_shared_cookie_transport_and_no_extra_login(self):
        r,s,b=self.native();self.assertEqual(self.get(r,overview.PROFILE).status,200);v=self.get(r);self.assertEqual(v.status,200);self.assertEqual(v.body,packet().body);self.assertEqual(b.logins,1);self.assertEqual(len(s.flights),0);self.assertTrue(r.native is s)
    def test_native_held_body_keeps_native_reservation_after_timeout_and_off(self):
        r,s,b=self.native(wait_seconds=.04);b.hold=threading.Event();v=self.get(r);self.assertEqual(v.status,503);self.assertTrue(b.entered.wait(1));self.settle(r);self.assertTrue(r.state()['nativeOverviewPending']);before=len(b.calls);r.pause();r.resume();self.assertEqual(self.get(r,overview.PROFILE).status,503);self.assertEqual(len(b.calls),before);b.hold.set()
        with s.cv:self.assertTrue(s.cv.wait_for(lambda:not s.flights,timeout=1))
        self.assertEqual(r.state()['cacheEntries'],0)
    def test_final_clock_disable_same_native_session_never_delivers_current(self):
        r,s,b=self.native();clock=r.clock;armed=[False];deliver=r._deliver
        def at():
            if armed[0]:armed[0]=False;s.disable()
            return clock()
        def final(*a):armed[0]=True;return deliver(*a)
        r.clock=at;r._deliver=final;v=self.get(r);self.assertEqual(v.status,401);self.assertFalse(s.enabled);self.assertNotEqual(v.body,packet().body)
    def test_last_access_revision_and_review_state_are_rechecked(self):
        for mutate in[lambda s:setattr(s,'access_revision',s.access_revision+1),lambda s:s._review(s.epoch)]:
            r,s,b=self.native();original=r._deliver
            def final(*a):
                old=r.clock
                def at():r.clock=old;mutate(s);return old()
                r.clock=at;return original(*a)
            r._deliver=final;self.assertEqual(self.get(r).status,401)
    def test_public_header_selection_never_copies_unknown_cookie_or_private_values(self):
        class Secret:
            def __str__(self):raise AssertionError('secret inspected')
        h=overview.public_headers({'set-cookie':Secret(),'authorization':Secret(),'etag':'"overview-activity-'+'a'*64+'"'});self.assertEqual(set(h),{'etag'})
    def test_validator_bridge_has_bounded_packet_output_and_fixed_args_no_credentials(self):
        seen=[]
        def runner(argv,**kw):seen.append((argv,kw));return types.SimpleNamespace(returncode=0,stdout=b'{"valid":true}',stderr=b'')
        p=packet();ctx={'path':overview.CURRENT,'status':200,'headers':overview.public_headers(p.headers),'condition':None,'publicEpoch':CFG['publicEpoch'],'priorBody':b''}
        self.assertTrue(overview.validate(p.body,ctx,timeout=1,root=SITE,runner=runner));self.assertIn('priorBody',ctx);args,kw=seen[0];self.assertEqual(args[-1],'--validate');self.assertLessEqual(len(kw['input']),32768);self.assertEqual(kw['timeout'],1);self.assertTrue(set(kw['env'])<={'PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP'})
    def test_html_availability_is_strict_ux_only_and_off_raw_exact(self):
        raw=b'<html><body data-existing="yes">Original</body></html>';self.assertEqual(overview.inject_overview_availability(raw,None),raw);on=overview.inject_overview_availability(raw,CFG);self.assertIn(b'data-overview-activity-epoch="activity-public-v1"',on);self.assertEqual(overview.inject_overview_availability(on,None),raw);self.assertNotIn(b'password',on)
    def test_session_new_namespace_allowlist_does_not_accept_queries_or_protocol_on_old_routes(self):
        self.assertEqual(native.route_limit(overview.PROFILE),512);self.assertEqual(native.route_limit(overview.CURRENT),8192)
        for p in[overview.CURRENT+'?x=1',overview.PREFIX+'1.json']:
            with self.assertRaises(native.AuthenticationUnavailable):native.route_limit(p)
        with self.assertRaises(native.AuthenticationUnavailable):native.valid_conditions('/api-cash-items.json',{overview.REQUEST:overview.PROTOCOL})
        with self.assertRaises(native.AuthenticationUnavailable):native.valid_conditions(overview.CURRENT,{})
        native.valid_conditions(overview.CURRENT,{overview.REQUEST:overview.PROTOCOL})
    def test_real_finite_node_entry_with_fake_native_transport_roundtrip(self):
        r,s,b=self.native(ttl_seconds=0);r.validator=lambda raw,ctx,timeout:overview.validate(raw,ctx,timeout=timeout,root=SITE)
        self.assertEqual(self.get(r,overview.PROFILE).body,packet('profile').body);v=self.get(r);self.assertEqual(v.status,200);self.assertEqual(v.body,packet().body)
        modified=self.get(r,h=message(**{'If-None-Match':v.headers['etag']}));self.assertEqual(modified.status,304);self.assertEqual(modified.body,b'');self.assertEqual(b.logins,1);self.assertEqual(r.state()['pendingTasks'],0)
    def test_profile_does_not_copy_unvalidated_frame_or_credential_headers(self):
        p=packet('profile');r,_,_,_,_=self.fixture(lambda*a:overview.TransportResponse(200,{**p.headers,'etag':'PRIVATE_CANARY','x-astra-overview-activity-state':'PRIVATE_CANARY','set-cookie':'PRIVATE_CANARY'},p.body));out=self.get(r,overview.PROFILE);self.assertEqual(out.status,200);self.assertNotIn('PRIVATE_CANARY',json.dumps(out.headers));self.assertEqual(out.body,p.body)
    def test_matching_callers_share_one_physical_job_and_owned_responses(self):
        entered=threading.Event();release=threading.Event();calls=[];out=[]
        def held(*a):calls.append(a);entered.set();release.wait(2);return packet()
        r,_,_,_,_=self.fixture(held,wait_seconds=1)
        a=threading.Thread(target=lambda:out.append(self.get(r)));b=threading.Thread(target=lambda:out.append(self.get(r)))
        try:
            a.start();self.assertTrue(entered.wait(1));b.start()
            with r.cv:self.assertTrue(r.cv.wait_for(lambda:r.waiters==2,timeout=.1)or r.waiters==2)
            release.set();a.join(1);b.join(1);self.assertFalse(a.is_alive()or b.is_alive());self.assertEqual(len(calls),1);self.assertEqual([v.status for v in out],[200,200]);self.assertIsNot(out[0].headers,out[1].headers)
        finally:release.set();a.join(1);b.join(1)
    def test_waiter_capacity_refuses_before_creating_a_speculative_job(self):
        r,_,_,_,calls=self.fixture();r.waiters=r.max_waiters
        try:self.assertEqual(self.get(r).status,503);self.assertEqual(calls,[]);self.assertEqual(r.state()['pendingTasks'],0)
        finally:r.waiters=0
    def test_oversized_raw_body_never_reaches_validation_or_echo(self):
        called=[];r,_,_,_,_=self.fixture(lambda*a:overview.TransportResponse(200,packet().headers,b'x'*8193),validator=lambda*a:called.append(a)or True);v=self.get(r);self.assertEqual(v.status,503);self.assertEqual(called,[]);self.assertNotIn(b'xxxxx',v.body)

class PreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec=importlib.util.spec_from_file_location('overview_preview_test',SITE/'preview.py');cls.m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=cls.m;spec.loader.exec_module(cls.m)
    def handler(self,path=overview.CURRENT,method='GET',h=None):
        m=self.m;x=object.__new__(m.Handler);x.path=path;x.command=method;x.headers=h or message(path);x.server=types.SimpleNamespace(server_address=('127.0.0.1',8765));x.client_address=('127.0.0.1',1);x.wfile=io.BytesIO();x.rfile=io.BytesIO();x.request_version='HTTP/1.1';x.requestline=method+' '+path+' HTTP/1.1';return x
    def test_actual_handler_get_head_same_typed_body_and_unrelated_old_fake_requires_no_method(self):
        r,_,_,_,calls=Tests().fixture();m=self.m
        for method in['GET','HEAD']:
            h=self.handler(method=method)
            with patch.object(m,'_overview_activity',r),contextlib.redirect_stderr(io.StringIO()):self.assertTrue(m._serve_overview_activity(h))
            head,body=h.wfile.getvalue().split(b'\r\n\r\n',1);self.assertIn(b'200 OK',head);self.assertEqual(body,packet().body if method=='GET'else b'');self.assertIn(b'X-Astra-Preview: password',head)
        self.assertEqual(len(calls),1);self.assertFalse(m._serve_overview_activity(types.SimpleNamespace(path='/ordinary')))
    def test_actual_html_dispatch_injects_only_explicit_local_availability_and_off_removes_it(self):
        m=self.m;root=tempfile.TemporaryDirectory();self.addCleanup(root.cleanup);base=Path(root.name);(base/'dist').mkdir();raw=b'<html><body data-original="yes">Original</body></html>';(base/'dist/index.html').write_bytes(raw)
        for cfg in[CFG,None]:
            x=self.handler(path='/')
            with patch.object(m,'ROOT',base),patch.object(m,'_overview_activity',types.SimpleNamespace(available=lambda:cfg)),patch.object(m._current_search,'available',return_value=None),patch.object(m._calculations,'active',return_value=False),patch.object(m._stamps,'active',return_value=False),contextlib.redirect_stderr(io.StringIO()):matched=m.Handler._serve_calculation_index(x)
            if cfg:self.assertTrue(matched);self.assertIn(b'data-overview-activity-epoch="activity-public-v1"',x.wfile.getvalue())
            else:self.assertFalse(matched)
    def test_actual_attach_helper_uses_same_existing_session_and_old_mode_parser_unchanged(self):
        m=self.m;r,s,b=Tests().native();other=overview.LocalOverviewActivityReader(SITE,config=lambda:json.dumps(CFG),validator=schema)
        with patch.object(m,'_own_session',s),patch.object(m,'_overview_activity',other),patch.object(m,'attach_readers'),patch.object(m,'attach_current_search_reader'),patch.object(m,'attach_basic_item_reader'):m._attach_private_readers()
        self.assertTrue(other.native is s);self.assertEqual(Tests().get(other).status,200);a=m.parse_arguments(['--offline','--private-own-site-browser-login']);self.assertTrue(a.offline);self.assertFalse(a.no_collector);self.assertFalse(a.existing_build)

if __name__=='__main__':unittest.main(verbosity=2)
