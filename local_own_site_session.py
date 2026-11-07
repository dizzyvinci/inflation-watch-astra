"""Explicit local-only own-host session. No provider, browser cookies or disk state."""
from dataclasses import dataclass
from http.cookiejar import CookieJar, DefaultCookiePolicy
from urllib.request import Request, HTTPRedirectHandler, ProxyHandler, build_opener
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
import ipaddress,json,math,re,threading,time

HOST='https://inflation.gg';COOKIE='__Host-astra-preview';STATUS='/__preview_controls'
MAX_TIMEOUT=3;PROFILE_TTL=60;MAX_FLIGHTS=8
BASE={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'}
class AuthenticationUnavailable(OSError):
    def __init__(self,status=503,access_mode='unknown'):self.status=status;self.access_mode=access_mode;super().__init__('own_site_authentication_unavailable')
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*a,**k):return None
class OwnCookiePolicy(DefaultCookiePolicy):
    def set_ok(self,cookie,request):
        return cookie.name==COOKIE and cookie.domain=='inflation.gg' and not cookie.domain_specified and cookie.path=='/' and cookie.path_specified and cookie.secure and 'HttpOnly' in cookie._rest and cookie._rest.get('SameSite')=='Strict' and request.full_url==HOST+'/__preview_login' and cookie.expires is not None
def need(v):
    if not v:raise AuthenticationUnavailable()
def unique(pairs):
    out={}
    for k,v in pairs:
        need(k not in out);out[k]=v
    return out
def metadata(h,status):
    pairs=list(h.raw_items() if callable(getattr(h,'raw_items',None)) else h.items());need(len(pairs)<=100)
    out={}
    for k,v in pairs:
        need(type(k) is str and type(v) is str and '\r' not in k+v and '\n' not in k+v and len(k)+len(v)<=8192)
        key=k.lower();need(key not in out);out[key]=v
    return out
def route_limit(path):
    need(type(path) is str and len(path)<=250 and '%' not in path and '\\' not in path)
    if path in {'/api-cash-items.json','/api-nx-offers.json','/api-market-calculations.json'}:return 100000 if path=='/api-cash-items.json' else 600000
    if path in {'/api-nx-history.json','/api-item-history/1082002/manifest.json','/api-stamp-references.json'}:return 131072
    if path=='/api-search-identities/v2/manifest.json':return 65536
    if re.fullmatch(r'/api-search-identities/v2/[a-f0-9]{64}\.json',path):return 131072
    suffix=r'(?:\?generation=[a-f0-9]{64})?'
    if re.fullmatch(r'/api-item-identities\.json'+suffix,path):return 65536
    if re.fullmatch(r'/api-item-prices/[1-9][0-9]{0,8}\.json'+suffix,path):return 300000
    if re.fullmatch(r'/api-item-identities/[a-f0-9]{64}\.json'+suffix,path):return 131072
    if re.fullmatch(r'/api-nx-history/[a-f0-9]{64}\.json\?generation=[a-f0-9]{64}',path):return 196608
    if re.fullmatch(r'/api-item-history/1082002/week/[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{1,3}-[a-f0-9]{64}\.json\?generation=[a-f0-9]{64}',path):return 262144
    raise AuthenticationUnavailable()
def valid_conditions(path,conditions):
    need(type(conditions)is dict and set(conditions)<={'If-None-Match','X-Astra-Request-Item-Protocol'})
    need(all(type(v)is str and len(v)<=160 and '\r'not in v and '\n'not in v for v in conditions.values()))
    if 'X-Astra-Request-Item-Protocol'in conditions:need(conditions['X-Astra-Request-Item-Protocol']=='fast-current-v1' and re.fullmatch(r'/api-item-prices/[1-9][0-9]{0,8}\.json(?:\?generation=[a-f0-9]{64})?',path)is not None)

@dataclass(frozen=True)
class RawResponse:
    status:int
    headers:dict
    body:bytes
@dataclass(frozen=True)
class LocalControlResponse:
    status:int
    headers:dict
    body:bytes

class OwnSiteSession:
    def __init__(self,*,opener_factory=None,monotonic=time.monotonic,wall=time.time):
        self.cv=threading.Condition();self.clock=monotonic;self.wall=wall;self.opener_factory=opener_factory or (lambda:build_opener(ProxyHandler({}),NoRedirect()))
        self.enabled=False;self._password=None;self._jar=CookieJar(OwnCookiePolicy());self.epoch=0;self.flights={};self.waiters=0;self.retry_at=0;self.failures=0;self.last_auth_status=503;self.profile=None;self.profile_at=0;self.profile_retry=0;self.profile_error_status=503;self.access_mode='unknown';self.access_revision=0
    def configure(self,password):
        need(type(password) is str and 0<len(password)<=256 and len(password.encode('utf-8'))<=1024 and '\r' not in password and '\n' not in password)
        with self.cv:
            self.epoch+=1;self.enabled=True;self._password=password;self._jar=CookieJar(OwnCookiePolicy());self.profile=None;self.retry_at=0;self.profile_retry=0;self.failures=0;self.last_auth_status=401;self.profile_error_status=503;self.access_mode='unknown';self.access_revision+=1
    def disable(self):
        with self.cv:self.epoch+=1;self.enabled=False;self._password=None;self._jar.clear();self.profile=None;self.access_mode='unknown';self.access_revision+=1;self.cv.notify_all()
    def _review(self,epoch):
        if self.enabled and self.epoch==epoch:self.access_revision+=1;self.access_mode='review';self.profile=None;self.profile_retry=self.clock()+PROFILE_TTL;self.profile_error_status=401
    def observed_review(self):
        with self.cv:return self.enabled and self.access_mode=='review'
    def _cookie(self):
        cookies=list(self._jar);return cookies[0] if len(cookies)==1 and cookies[0].expires>self.wall()+1 else None
    def _failure(self,epoch,status=503):
        if epoch==self.epoch and self.enabled:
            self.failures=min(8,self.failures+1);self.retry_at=self.clock()+min(300,30*2**min(self.failures-1,4));self.profile=None;self.last_auth_status=status
    def _run(self,key,fn,timeout,epoch,commit=None):
        need(type(timeout) in (int,float) and math.isfinite(timeout) and 0<timeout<=MAX_TIMEOUT)
        with self.cv:
            need(self.enabled and epoch==self.epoch and self.waiters<16)
            # Recheck cache atomically with admission: another caller may have
            # completed login/status after the caller's first cache check.
            if key==('login',) and self._cookie() is not None:return self._jar
            if key==('profile',) and self.profile and self._cookie() and self.clock()-self.profile_at<PROFILE_TTL and self.profile['expiresAt']>self.wall()*1000:return dict(self.profile)
            job=self.flights.get(key);created=job is None
            if created:
                need(len(self.flights)<MAX_FLIGHTS)
                job={'done':False,'expired':False,'value':None,'error':None,'deadline':self.clock()+timeout};self.flights[key]=job
                def work():
                    value=None;error=None
                    try:
                        with self.cv:need(self.enabled and epoch==self.epoch and not job['expired'])
                        value=fn()
                    except AuthenticationUnavailable as e:error=e
                    except Exception:error=AuthenticationUnavailable()
                    with self.cv:
                        live=self.enabled and epoch==self.epoch and not job['expired'] and self.clock()<=job['deadline']
                        if live and error is None:
                            try:
                                if commit:commit(value)
                                job['value']=value
                            except AuthenticationUnavailable as e:error=e
                            except Exception:error=AuthenticationUnavailable()
                        if not live:error=AuthenticationUnavailable()
                        if error is not None and key==('login',):self._failure(epoch,error.status)
                        job['error']=error;job['done']=True
                        if self.flights.get(key) is job:del self.flights[key]
                        self.cv.notify_all()
                threading.Thread(target=work,daemon=True,name='own-site-bounded-io').start()
            self.waiters+=1
            try:settled=self.cv.wait_for(lambda:job['done'] or not self.enabled or epoch!=self.epoch,timeout=timeout)
            finally:self.waiters-=1
            if not settled:
                if created:job['expired']=True
                raise AuthenticationUnavailable()
            need(self.enabled and epoch==self.epoch and job['done'])
            if job['error'] is not None:raise job['error']
            return job['value']
    def _request(self,path,*,timeout,limit,login_password=None,conditions=None,on_fast_withdrawal=None):
        valid_conditions(path,conditions if conditions is not None else {})
        if login_password is not None:need(path=='/__preview_login' and not conditions and limit==0)
        else:need((path==STATUS and limit==4096 and not conditions) or (path!=STATUS and route_limit(path)==limit))
        deadline=self.clock()+timeout;headers={'Accept':'application/json','Accept-Encoding':'identity','User-Agent':'InflationWatch-LocalPreview/1.0 (+https://inflation.gg/)'}
        headers.update(conditions or {})
        if login_password is not None:
            need(path=='/__preview_login');body=urlencode({'password':login_password,'returnTo':'/'}).encode();need(len(body)<=4096);headers.update({'Origin':HOST,'Content-Type':'application/x-www-form-urlencoded'});request=Request(HOST+path,data=body,headers=headers,method='POST')
        else:
            if path==STATUS:headers.update({'Origin':HOST,'X-Astra-Controls-Status':'1'})
            request=Request(HOST+path,headers=headers,method='GET')
            with self.cv:self._jar.add_cookie_header(request)
        try:response=self.opener_factory().open(request,timeout=timeout)
        except HTTPError as e:response=e
        with response:
            need(response.geturl()==HOST+path);status=response.code if isinstance(response,HTTPError) else response.status
            # Do not read an auth error/login HTML as a market payload.
            if status in (401,403):raise AuthenticationUnavailable(401)
            h=metadata(response.headers,status)
            if login_password is not None:
                need(status==303 and h.get('location')=='/' and h.get('x-astra-preview') in {'review','password'})
                need('set-cookie' in h);jar=CookieJar(OwnCookiePolicy());jar.extract_cookies(response,request);cookies=list(jar);need(len(cookies)==1)
                c=cookies[0];need(re.fullmatch(r'[0-9]{10}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}',c.value) is not None and self.wall()<c.expires<=self.wall()+28805)
                return jar
            need('set-cookie' not in h)
            fast_negative=(conditions or {}).get('X-Astra-Request-Item-Protocol')=='fast-current-v1' and status in (404,409)
            if status!=200 and not fast_negative:return RawResponse(status,h,b'')
            if fast_negative:limit=4096
            if status==404 and fast_negative and h.get('x-astra-api-item-protocol')=='fast-current-v1' and re.fullmatch(r'[a-z][a-z0-9-]{0,63}',h.get('x-astra-api-item-epoch','')) and on_fast_withdrawal is not None:on_fast_withdrawal(dict(h))
            need(h.get('content-encoding','identity')=='identity');length=h.get('content-length');need(length is None or length.isdigit() and int(length)<=limit)
            parts=[];size=0
            while True:
                need(self.clock()<=deadline);part=response.read1(min(16384,limit+1-size))
                if not part:break
                size+=len(part);need(size<=limit);parts.append(part)
            need(length is None or int(length)==size)
            return RawResponse(status,h,b''.join(parts))
    def _ensure_login(self,timeout):
        with self.cv:
            need(self.enabled)
            if self._cookie() is not None:return
            if self.clock()<self.retry_at:raise AuthenticationUnavailable(self.last_auth_status)
            epoch=self.epoch;password=self._password
        def commit(jar):self._jar=jar;self.profile=None;self.retry_at=0;self.profile_retry=0;self.failures=0;self.last_auth_status=200
        self._run(('login',),lambda:self._request('/__preview_login',timeout=timeout,limit=0,login_password=password),timeout,epoch,commit)
        with self.cv:need(self._cookie() is not None)
    def _invalidate(self,epoch):
        with self.cv:
            if self.epoch==epoch:self.epoch+=1;self._jar.clear();self.profile=None;self.access_mode='unknown';self.access_revision+=1
    def get(self,path,conditions,timeout,response_type):
        need(type(timeout) in (int,float) and math.isfinite(timeout) and 0<timeout<=MAX_TIMEOUT);deadline=self.clock()+timeout
        limit=route_limit(path);valid_conditions(path,conditions)
        # Exact reader ETag is forwarded separately; credentials remain only jar-owned.
        for attempt in range(2):
            left=deadline-self.clock();need(left>0);self._ensure_login(left)
            with self.cv:epoch=self.epoch
            observed_withdrawal={}
            def observe(h):
                with self.cv:
                    if self.enabled and self.epoch==epoch:
                        observed_withdrawal['headers']=dict(h)
                        if h.get('x-astra-preview')=='review':self._review(epoch)
            def read():
                # Private request helper owns all headers, with only a bounded ETag condition.
                if conditions.get('X-Astra-Request-Item-Protocol')=='fast-current-v1':return self._request(path,conditions=conditions,timeout=timeout,limit=limit,on_fast_withdrawal=observe)
                return self._request(path,conditions=conditions,timeout=timeout,limit=limit)
            left=deadline-self.clock();need(left>0)
            key=('data',path,conditions.get('If-None-Match'))
            if 'X-Astra-Request-Item-Protocol'in conditions:key+=('fast-current-v1',)
            try:r=self._run(key,read,left,epoch)
            except AuthenticationUnavailable as e:
                with self.cv:
                    if e.status!=401 and self.enabled and self.epoch==epoch and observed_withdrawal:return response_type(404,observed_withdrawal['headers'],b'')
                if e.status!=401:raise
                self._invalidate(epoch)
                if attempt==0:continue
                with self.cv:self._failure(self.epoch,401)
                raise
            if r.status in (301,302,303,307,308):
                location=r.headers.get('location')
                if location in {'/__preview_login',HOST+'/__preview_login'}:
                    self._invalidate(epoch)
                    if attempt==0:continue
                    with self.cv:self._failure(self.epoch,401)
                    raise AuthenticationUnavailable(401)
                raise AuthenticationUnavailable()
            if r.status in (200,304) or conditions.get('X-Astra-Request-Item-Protocol')=='fast-current-v1' and r.status in (404,409):
                need(r.headers.get('x-astra-preview') in {'review','password'})
                if r.status!=304:need(r.headers.get('content-type','').split(';')[0].strip().lower()=='application/json')
                if r.headers.get('x-astra-preview')!='password':
                    with self.cv:self._review(epoch)
            return response_type(r.status,r.headers,r.body)
        raise AuthenticationUnavailable(401)
    def verified_profile(self,timeout=MAX_TIMEOUT):
        need(type(timeout) in (int,float) and math.isfinite(timeout) and 0<timeout<=MAX_TIMEOUT);deadline=self.clock()+timeout
        with self.cv:
            need(self.enabled)
            if self.profile and self._cookie() and self.clock()-self.profile_at<PROFILE_TTL and self.profile['expiresAt']>self.wall()*1000:return dict(self.profile)
            if self.clock()<self.profile_retry:raise AuthenticationUnavailable(self.profile_error_status)
        self._ensure_login(timeout)
        with self.cv:epoch=self.epoch;revision=self.access_revision
        def read():
            r=self._request(STATUS,timeout=timeout,limit=4096);h=r.headers
            if h.get('x-astra-preview')=='review':raise AuthenticationUnavailable(401,'review')
            if r.status!=200:raise AuthenticationUnavailable(401 if r.status in (401,403,405) else 503)
            need(h.get('x-astra-preview')=='password' and h.get('x-astra-workspace')=='private_workspace' and h.get('content-type','').split(';')[0].strip()=='application/json')
            need(set(h.get('cache-control','').replace(' ','').split(','))=={'private','no-store','no-transform'} and h.get('cdn-cache-control')=='no-store' and h.get('cloudflare-cdn-cache-control')=='no-store')
            value=json.loads(r.body,object_pairs_hook=unique,parse_constant=lambda _:need(False));need(type(value) is dict and set(value)=={'unlocked','mode','expiresAt'} and value['unlocked'] is True and value['mode']=='private_workspace' and type(value['expiresAt']) is int)
            with self.cv:c=self._cookie();need(c is not None and value['expiresAt']==int(c.value.split('.')[0])*1000 and self.wall()*1000<value['expiresAt']<=self.wall()*1000+28805000)
            return value
        def commit(value):
            if self.access_revision!=revision:raise AuthenticationUnavailable(401,'review' if self.access_mode=='review' else'unknown')
            self.profile=dict(value);self.profile_at=self.clock();self.profile_retry=0;self.access_mode='password'
        left=deadline-self.clock();need(left>0)
        try:return self._run(('profile',),read,left,epoch,commit)
        except AuthenticationUnavailable as e:
            with self.cv:
                if self.epoch==epoch:self.profile=None;self.profile_retry=self.clock()+30;self.profile_error_status=e.status
                if e.access_mode=='review':self._review(epoch)
            raise

def reader_response(session,path,conditions,timeout,response_type):
    """Preserve typed authorization withdrawal, not an unavailable market payload."""
    try:return session.get(path,conditions,timeout,response_type)
    except AuthenticationUnavailable as error:
        if type(error.status) is int and error.status in (401,403,404):
            return response_type(error.status,{},b'')
        raise

def attach_readers(session,*,cash,nx,items,nx_history,item_hours,calculations,stamp_references=None):
    """Same existing cache objects and source validators; change only explicit transport."""
    if not session.enabled:return False
    import local_cash_reader as c,local_nx_reader as n,local_item_reader as i,local_nx_history_reader as h,local_item_hour_reader as j,local_calculations_reader as a
    for reader,module,path in [(cash,c,'/api-cash-items.json'),(nx,n,'/api-nx-offers.json'),(calculations,a,'/api-market-calculations.json')]:
        need(isinstance(reader,{'/api-cash-items.json':c.LocalCashReader,'/api-nx-offers.json':n.LocalNxReader,'/api-market-calculations.json':a.LocalCalculationsReader}[path]))
        reader.transport=lambda conditions,timeout,m=module,p=path:reader_response(session,p,conditions,timeout,m.TransportResponse)
    for reader,module,cls in [(items,i,i.LocalItemReader),(nx_history,h,h.LocalNxHistoryReader),(item_hours,j,j.LocalItemHourReader)]:
        need(isinstance(reader,cls))
        def routed(path,conditions,timeout,m=module):
            r=m.route(path);return reader_response(session,r['key'],conditions,timeout,m.TransportResponse)
        reader.transport=routed
    if stamp_references is not None:
        import local_stamp_reference_reader as s
        need(isinstance(stamp_references,s.LocalStampReferenceReader))
        stamp_references.transport=lambda conditions,timeout:reader_response(session,s.PATH,conditions,timeout,s.TransportResponse)
    return True

def local_request_allowed(headers,bind_host,client_host,port,*,origin_proof):
    try:
        need(ipaddress.ip_address(bind_host).is_loopback and ipaddress.ip_address(client_host).is_loopback)
        if callable(getattr(headers,'get_all',None)):
            need(len(headers.get_all('Host',[]))==1)
            for key in ['Origin','Accept','Sec-Fetch-Site','X-Astra-Controls-Status']:need(len(headers.get_all(key,[]))<=1)
        host=headers.get('Host');need(type(host) is str and '\r' not in host and '\n' not in host)
        u=urlsplit('//'+host);need(u.hostname in {'localhost','127.0.0.1','::1'} and u.port==port and u.username is None and u.password is None and not u.path and not u.query and not u.fragment)
        origin=headers.get('Origin')
        if origin is not None:need(origin=='http://'+host)
        if origin_proof:need(origin=='http://'+host or origin is None and headers.get('Sec-Fetch-Site')=='same-origin')
        else:need(headers.get('Sec-Fetch-Site') not in {'cross-site','same-site'})
        return True
    except (ValueError,OSError):return False

def control_response(session,method,path,headers,*,bind_host,client_host,port):
    if not session.enabled or urlsplit(path).path!=STATUS:return None
    base=dict(BASE)
    def response(status,value):
        raw=json.dumps(value,separators=(',',':')).encode();return LocalControlResponse(status,{**base,'Content-Length':str(len(raw))},raw if method!='HEAD' else b'')
    if not local_request_allowed(headers,bind_host,client_host,port,origin_proof=True):return response(403,{'unlocked':False})
    if path!=STATUS:return response(400,{'unlocked':False})
    if method!='GET':base['Allow']='GET';return response(405,{'unlocked':False})
    if headers.get('Accept')!='application/json' or headers.get('X-Astra-Controls-Status')!='1':return response(400,{'unlocked':False})
    try:value=session.verified_profile()
    except AuthenticationUnavailable as e:return response(401 if e.status==401 else 503,{'unlocked':False})
    base.update({'X-Astra-Preview':'password','X-Astra-Workspace':'private_workspace'})
    return response(200,value)

def read_password(*,stdin=None,prompt=None):
    if stdin is not None:
        raw=stdin.readline(1025);need(type(raw) is bytes and 0<len(raw)<=1024)
        try:value=raw.decode('utf-8').removesuffix('\n').removesuffix('\r')
        except UnicodeError:raise AuthenticationUnavailable() from None
    else:
        import getpass,warnings
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('error',getpass.GetPassWarning);value=(prompt or getpass.getpass)('Own-site preview password: ')
        except Exception:raise AuthenticationUnavailable() from None
    need(type(value) is str and 0<len(value)<=256 and '\r' not in value and '\n' not in value)
    return value
