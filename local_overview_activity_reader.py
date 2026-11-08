"""Default-Off fixed overview cache through the existing exact OwnSiteSession.

No credential/actor inspection, provider transport, disk payload store or poller.
Current bytes are never rewritten into retained evidence: expiry/error is503;
the accepted browser retains its own prior evidence. Upstream409 stays byteexact.
"""
from dataclasses import dataclass
from pathlib import Path
import base64,hashlib,json,math,os,re,subprocess,threading,time
from local_own_site_session import OwnSiteSession,AuthenticationUnavailable,local_request_allowed,reader_response

PREFIX='/api-overview-window-activity/'
PROFILE=PREFIX+'profile.json';CURRENT=PREFIX+'current.json'
REQUEST='X-Astra-Request-Overview-Activity-Protocol';PROTOCOL='overview-window-activity-v1'
BASE={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'}
FRAME={'etag'}|{'x-astra-overview-activity-'+k for k in ['body-sha256','epoch','state','captured-at','generated-at']}
SELECTED=FRAME|{'x-astra-preview','content-type','content-length','content-encoding','cache-control','cdn-cache-control','cloudflare-cdn-cache-control'}
class Invalid(ValueError):
    def __init__(self):super().__init__('local_overview_unavailable')
def need(v):
    if not v:raise Invalid()
def unique(rows):
    out={}
    for k,v in rows:need(k not in out);out[k]=v
    return out
def configuration(text):
    if text is None:return None
    try:
        need(type(text)is str and len(text.encode('utf8'))<=1024)
        v=json.loads(text,object_pairs_hook=unique,parse_constant=lambda _:need(False))
        if type(v)is dict and v=={'enabled':False}and type(v.get('enabled'))is bool:return None
        need(type(v)is dict and set(v)=={'schemaVersion','enabled','profile','publicEpoch'}and type(v['schemaVersion'])is int and v['schemaVersion']==1 and v['enabled']is True and v['profile']=='overview_window_aggregate_v1')
        need(type(v['publicEpoch'])is str and re.fullmatch(r'[a-z][a-z0-9-]{0,63}',v['publicEpoch']))
        return v
    except(ValueError,TypeError,UnicodeError,OverflowError,RecursionError):return None
def public_headers(source,include_frame=True):
    need(type(source)is dict);out={};size=0
    for i,(k,v)in enumerate(source.items()):
        need(i<64 and type(k)is str and len(k)<=128 and not re.search(r'[\r\n]',k))
        key=k.lower()
        if key not in SELECTED or not include_frame and key in FRAME:continue  # Never copy cookie/token/unknown header values.
        need(type(v)is str and len(v)<=1024 and not re.search(r'[\r\n]',v)and key not in out)
        size+=len((key+v).encode('utf8'));need(size<=16384);out[key]=v
    return out
@dataclass(frozen=True)
class TransportResponse:
    status:int
    headers:dict
    body:bytes
@dataclass(frozen=True)
class LocalResponse:
    status:int
    headers:dict
    body:bytes
def unavailable_transport(*_):raise AuthenticationUnavailable()
def validate(raw,ctx,*,timeout,root,runner=subprocess.run):
    need(type(raw)is bytes and len(raw)<=8192 and type(timeout)in(int,float)and math.isfinite(timeout)and 0<timeout<=3)
    ctx=dict(ctx);prior=ctx.pop('priorBody',b'');need(type(prior)is bytes and len(prior)<=8192)
    packet=json.dumps({**ctx,'schemaVersion':1,'raw':base64.b64encode(raw).decode('ascii'),'rawBytes':len(raw),'prior':base64.b64encode(prior).decode('ascii'),'priorBytes':len(prior)},separators=(',',':'),ensure_ascii=False).encode('utf8');need(len(packet)<=32768)
    try:
        result=runner(['node',str(Path(root)/'local-overview-activity-validate.mjs'),'--validate'],input=packet,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,env={k:os.environ[k]for k in ['PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP']if k in os.environ},creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)if os.name=='nt' else 0)
        need(result.returncode==0 and 0<len(result.stdout)<=32 and len(result.stderr)<=64)
        answer=json.loads(result.stdout,object_pairs_hook=unique,parse_constant=lambda _:need(False));need(type(answer)is dict and set(answer)=={'valid'}and answer['valid']is True)
        return True
    except(OSError,ValueError,TypeError,subprocess.TimeoutExpired,OverflowError):raise Invalid()from None

class LocalOverviewActivityReader:
    def __init__(self,root=None,*,config=lambda:None,transport=unavailable_transport,validator=None,monotonic=time.monotonic,wait_seconds=3,ttl_seconds=15,max_waiters=16):
        need(callable(config)and callable(transport)and callable(monotonic))
        need(type(wait_seconds)in(int,float)and math.isfinite(wait_seconds)and 0<wait_seconds<=3 and type(ttl_seconds)in(int,float)and math.isfinite(ttl_seconds)and 0<=ttl_seconds<=15 and type(max_waiters)is int and 1<=max_waiters<=16)
        self.root=Path(root or Path(__file__).parent);self.config=config;self.transport=transport;self.clock=monotonic;self.wait_seconds=wait_seconds;self.ttl=ttl_seconds;self.max_waiters=max_waiters
        self.validator=validator or(lambda raw,ctx,timeout:validate(raw,ctx,timeout=timeout,root=self.root))
        self.authority=lambda:(False,0,0);self.native=None;self.cv=threading.Condition();self.entries={};self.job=None;self.waiters=0;self.epoch=0;self.signature=None;self.auth_signature=None;self.paused=False
    def _time(self):
        at=self.clock();need(type(at)in(int,float)and math.isfinite(at)and at>=0);return at
    def _withdraw(self):
        self.epoch+=1;self.entries.clear()
        if self.job:self.job['cancelled']=True
        self.cv.notify_all()
    def profile(self):
        try:cfg=configuration(self.config())
        except Exception:cfg=None
        signature=cfg['publicEpoch']if cfg else None
        with self.cv:
            if signature!=self.signature:self.signature=signature;self._withdraw()
        return cfg
    def _auth(self):
        try:
            a=self.authority();need(type(a)is tuple and len(a)==3 and type(a[0])is bool and all(type(n)is int and 0<=n<=9007199254740991 for n in a[1:]));return a
        except Exception:return(False,-1,-1)
    def available(self):
        cfg=self.profile();return cfg if cfg and self._auth()[0]else None
    def _context(self):
        cfg=self.profile();a=self._auth()
        with self.cv:
            if a!=self.auth_signature:self.auth_signature=a;self._withdraw()
            return(cfg['publicEpoch']if cfg else None,a,self.epoch,self.paused)
    def _fence(self,context,deadline):
        current=self._context();at=self._time();need(current==context and current[0]and current[1][0]and not current[3]and at<deadline)
    def _native_pending(self):
        native=self.native
        if native is None:return False
        with native.cv:
            return any(key==('login',)or type(key)is tuple and len(key)>=2 and key[0]=='data'and key[1]in(PROFILE,CURRENT)for key in native.flights)
    def _error(self,status):
        raw=b'{"error":"local_overview_unavailable","sourceObservedAt":null}'
        return LocalResponse(status,{**BASE,'Content-Length':str(len(raw))},raw)
    def _owned(self,r,method='GET'):
        return LocalResponse(r.status,dict(r.headers),b''if method=='HEAD'or r.status==304 else r.body)
    def _conditional(self,entry,condition):
        r=entry['response']
        if r.status==200 and entry['path']==CURRENT and r.headers.get('x-astra-overview-activity-state')=='current'and condition==r.headers.get('etag'):
            return LocalResponse(304,dict(r.headers),b'')
        return self._owned(r)
    def _perform(self,path,condition,context,deadline,old):
        self._fence(context,deadline);conditions={REQUEST:PROTOCOL}
        prior=b''
        if path==CURRENT and condition and old and old['response'].status==200 and old['response'].headers.get('x-astra-overview-activity-state')=='current'and old['response'].headers.get('etag')==condition:
            conditions['If-None-Match']=condition;prior=old['response'].body
        left=deadline-self._time();need(left>0)
        source=self.transport(path,conditions,min(3,left));need(type(source)is TransportResponse and type(source.status)is int and type(source.body)is bytes)
        status=source.status;raw=source.body;h=public_headers(source.headers,path==CURRENT)
        if status in(401,403)or h.get('x-astra-preview')!='password':raise AuthenticationUnavailable(401)
        self._fence(context,deadline)
        if status in(404,503):return self._error(status)
        need(status in(200,304,409)and(path==CURRENT or status==200)and len(raw)<=(512 if path==PROFILE else 8192))
        left=deadline-self._time();need(left>0)
        ctx={'path':path,'status':status,'headers':h,'condition':conditions.get('If-None-Match'),'publicEpoch':context[0],'priorBody':prior if status==304 else b''}
        need(self.validator(raw,ctx,min(3,left))is True);self._fence(context,deadline)
        kept={k:v for k,v in h.items()if path==CURRENT and k in FRAME};kept.update(BASE);kept['X-Astra-Preview']='password';kept['X-Local-Overview-State']='typed_own_session_cache'
        if status==304:need(prior);raw=prior;status=200
        kept['Content-Length']=str(len(raw));return LocalResponse(status,kept,raw)
    def _read(self,path,condition,context,deadline):
        with self.cv:
            old=self.entries.get(path);at=self._time()
            if old and at<old['expires']:self._fence(context,deadline);return self._conditional(old,condition)
            if old and at<old['retry']:return self._error(503)
            if self.job is None and self._native_pending():return self._error(503)
            if self.waiters>=self.max_waiters:return self._error(503)
            if self.job:
                j=self.job
                if j['key']!=(path,condition,context)or self.waiters>=self.max_waiters:return self._error(503)
            else:
                j={'key':(path,condition,context),'done':False,'value':None,'cancelled':False,'deadline':deadline};self.job=j
                def work():
                    value=self._error(503)
                    try:value=self._perform(path,condition,context,deadline,old)
                    except AuthenticationUnavailable as error:value=self._error(401 if error.status in(401,403) else 503)
                    except Exception:pass
                    with self.cv:
                        before=self.entries.copy()
                        try:
                            if value.status==401:self._withdraw()
                            elif value.status==404:self.entries.clear()
                            else:
                                self._fence(context,deadline);need(not j['cancelled'])
                                if value.status in(200,409):
                                    at=self._time();self.entries[path]={'path':path,'response':self._owned(value),'admittedAt':at,'expires':at+self.ttl,'retry':0}
                                elif old:self.entries[path]={**old,'expires':0,'retry':self._time()+30}
                                else:self.entries[path]={'path':path,'response':self._error(503),'admittedAt':0,'expires':0,'retry':self._time()+30}
                                self._fence(context,deadline)
                        except Exception:
                            if self._context()==context:self.entries=before
                            value=self._error(401 if self._auth()!=context[1] else 503)
                        j['value']=value;j['done']=True
                        if self.job is j:self.job=None
                        self.cv.notify_all()
                threading.Thread(target=work,daemon=True,name='local-overview-own-cache').start()
            self.waiters+=1
            try:done=self.cv.wait_for(lambda:j['done']or self._context()!=context,timeout=max(0,min(deadline,j['deadline'])-self._time()))
            finally:self.waiters-=1
            if not done or not j['done']:j['cancelled']=True;return self._error(503)
            entry=self.entries.get(path)
            return self._conditional(entry,condition)if entry and j['value'].status in(200,409)else self._owned(j['value'])
    def _deliver(self,value,path,context,deadline,method):
        with self.cv:
            prepared=self._owned(value,method);denied=self._owned(self._error(503),method);auth_denied=self._owned(self._error(401),method);entry=self.entries.get(path);native=self.native
            with native.cv if native is not None else self.cv:
                current=self._context();at=self._time()
                if native is not None:
                    final=(native.enabled is True and native.access_mode!='review',native.epoch,native.access_revision)
                    if final!=context[1]or not final[0]:self._withdraw();self.auth_signature=final;return auth_denied
                if value.status==401:return auth_denied
                if current!=context or context[2]!=self.epoch or self.paused or at>=deadline:return auth_denied if current[1]!=context[1]else denied
                if value.status in(200,304,409):
                    if not entry or self.entries.get(path)is not entry or at<entry['admittedAt']or self.ttl!=0 and at>=entry['expires']:return denied
                    if value.status!=304 and value.body!=entry['response'].body:return denied
                    if value.headers.get('etag')!=entry['response'].headers.get('etag'):return denied
                return prepared
    def cancel(self):
        with self.cv:self._withdraw()
    def pause(self):
        with self.cv:self.paused=True;self._withdraw()
    def resume(self):
        with self.cv:self.paused=False
    def state(self):
        with self.cv:return{'pendingTasks':int(self.job is not None),'nativeOverviewPending':self._native_pending(),'waiters':self.waiters,'cacheEntries':len(self.entries),'paused':self.paused}
    def handle(self,method,path,request_headers,*,bind_host='127.0.0.1',client_host='127.0.0.1',port=8765):
        if type(path)is not str or not path.startswith(PREFIX):return None
        try:
            deadline=self._time()+self.wait_seconds
            need(bind_host=='127.0.0.1'and client_host=='127.0.0.1'and port==8765 and local_request_allowed(request_headers,bind_host,client_host,port,origin_proof=False))
        except Exception:return self._owned(self._error(403),method)
        if method not in('GET','HEAD'):
            r=self._error(405);r.headers['Allow']='GET, HEAD';return r
        try:
            need(path in(PROFILE,CURRENT));condition=request_headers.get('If-None-Match');protocol=request_headers.get(REQUEST)
            if callable(getattr(request_headers,'get_all',None)):
                for key in[REQUEST,'If-None-Match']:need(len(request_headers.get_all(key,[]))<=1)
            need(protocol in(None,PROTOCOL)and(path==PROFILE or protocol==PROTOCOL))
            need(condition is None or path==CURRENT and type(condition)is str and re.fullmatch(r'"overview-activity-[a-f0-9]{64}"',condition))
        except Exception:return self._owned(self._error(400),method)
        if self.profile()is None:return self._owned(self._error(404),method)
        context=self._context()
        if not context[1][0]:return self._owned(self._error(401),method)
        if context[3]:return self._owned(self._error(503),method)
        try:value=self._read(path,condition,context,deadline);return self._deliver(value,path,context,deadline,method)
        except Exception:return self._owned(self._error(503),method)

def attach_overview_activity_reader(session,reader):
    need(type(session)is OwnSiteSession and type(reader)is LocalOverviewActivityReader)
    if not session.enabled:return False
    reader.transport=lambda path,conditions,timeout:reader_response(session,path,conditions,timeout,TransportResponse)
    def authority():
        with session.cv:return(session.enabled and session.access_mode!='review',session.epoch,session.access_revision)
    reader.authority=authority;reader.native=session;return True

def inject_overview_availability(raw,cfg):
    need(type(raw)is bytes and len(raw)<=2000000)
    if cfg is not None:need(configuration(json.dumps(cfg))==cfg)
    names=['overview-activity-profile','overview-activity-enabled','overview-activity-epoch']
    if cfg is None and not any(('data-'+n).encode()in raw for n in names):return raw
    tags=list(re.finditer(rb'<body\b[^>]*>',raw,re.I));need(len(tags)==1);m=tags[0];tag=m.group()
    for n in names:tag=re.sub(rb'\sdata-'+n.encode()+rb'\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+)',b'',tag,flags=re.I)
    if cfg is not None:tag=tag[:-1]+(' data-overview-activity-profile="overview_window_aggregate_v1" data-overview-activity-enabled="true" data-overview-activity-epoch="'+cfg['publicEpoch']+'">').encode()
    return raw[:m.start()]+tag+raw[m.end():]
