"""Default-Off, fixed own-site shared Stamp reference reader for loopback only.

No market-provider calls, keys, browser cookies, visitor state or disk cache.
The own-site session transport is injected by the existing preview process.
"""
from dataclasses import dataclass
import base64, datetime as dt, hashlib, ipaddress, json, math, os, re, subprocess, threading, time
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit
from local_own_site_session import AuthenticationUnavailable

PATH='/api-stamp-references.json'
REGISTRY_HASH='9544096e01cef5fc19300dc554875ffd6e703acb97736e1a018f914f0a4ef421'
MAX_BYTES=131072
TTL=60
TIMEOUT=3
PREFIX='X-Astra-Stamp-'
BASE={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform',
      'CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'}
class Invalid(ValueError):pass
def need(value):
    if not value:raise Invalid('invalid_local_stamp_reference')
def header(headers,name):return next((v for k,v in headers.items() if k.lower()==name.lower()),None)
def stamp(value):
    need(type(value)is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z',value))
    parsed=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
    need(parsed.isoformat(timespec='milliseconds').replace('+00:00','Z')==value)
    return parsed.timestamp()
def ordinal(value):
    need(type(value)is str and re.fullmatch(r'[1-9][0-9]{0,15}',value))
    number=int(value);need(number<=2**53-1);return number
def source_headers(value,status):
    if status not in (200,304):
        try:return dict(value.items())
        except Exception:return {}
    need(value is not None and callable(getattr(value,'items',None)))
    pairs=list(value.raw_items() if callable(getattr(value,'raw_items',None)) else value.items())
    need(all(type(k)is str and type(v)is str and '\r' not in k+v and '\n' not in k+v for k,v in pairs))
    for name in ['ETag','Content-Type','Content-Encoding','Content-Length',PREFIX+'Mode',PREFIX+'Captured-At',PREFIX+'Registry-Hash',PREFIX+'Publication-Ordinal']:
        need(sum(k.lower()==name.lower() for k,_ in pairs)<=1)
        if callable(getattr(value,'get_all',None)):need(len(value.get_all(name,[]))<=1)
    return dict(pairs)
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
def unavailable_transport(_conditions,_timeout):
    # Only the existing authenticated own-site session may attach transport.
    raise OSError('own_site_session_required')
def validate(raw,context):
    need(type(raw)is bytes and 0<len(raw)<=MAX_BYTES)
    packet=json.dumps({**context,'raw':base64.b64encode(raw).decode()},separators=(',',':')).encode()
    need(len(packet)<=200000)
    try:
        result=subprocess.run(['node',str(Path(__file__).with_name('local-stamp-validate.mjs'))],input=packet,
             stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=3,
             env={k:os.environ[k]for k in ['PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP']if k in os.environ},
             creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0) if os.name=='nt' else 0)
        need(result.returncode==0 and 0<len(result.stdout)<=2048)
        value=json.loads(result.stdout)
        need(type(value)is dict and set(value)=={'bodySha256','registryHash','capturedAt','publicationOrdinal'})
        return value
    except (OSError,subprocess.TimeoutExpired,ValueError):raise Invalid('invalid_local_stamp_reference') from None
def inject_local_availability(raw,enabled):
    need(type(raw)is bytes and len(raw)<=2000000 and type(enabled)is bool)
    matches=list(re.finditer(rb'<body\b[^>]*>',raw,re.I));need(len(matches)==1)
    match=matches[0];tag=re.sub(rb'\sdata-stamp-references\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+)',b'',match.group(),flags=re.I)
    if enabled:tag=tag[:-1]+b' data-stamp-references="available">'
    return raw[:match.start()]+tag+raw[match.end():]
class LocalStampReferenceReader:
    def __init__(self,root=None,*,enabled=False,transport=unavailable_transport,validator=validate,
                 monotonic=time.monotonic,wall=time.time,wait_seconds=4,max_waiters=32):
        need(type(enabled)is bool or callable(enabled))
        need(type(wait_seconds)in(int,float)and math.isfinite(wait_seconds)and 0<wait_seconds<=5)
        need(type(max_waiters)is int and 1<=max_waiters<=32)
        self.enabled=enabled;self.transport=transport;self.validator=validator;self.clock=monotonic;self.wall=wall
        self.wait=wait_seconds;self.max_waiters=max_waiters;self.cv=threading.Condition()
        self.inflight=False;self.waiters=0;self.epoch=0;self.raw=None;self.dto=None;self.tag=None;self.mode=None
        self.due=0;self.failures=0;self.error=None;self.status=503
    def active(self):
        try:return(self.enabled()if callable(self.enabled)else self.enabled)is True
        except Exception:return False
    def _clear(self,status=404):
        self.epoch+=1;self.raw=None;self.dto=None;self.tag=None;self.mode=None
        self.status=status;self.error='own_site_unavailable';self.due=self.clock()+30
    def _refresh(self):
        with self.cv:
            if not self.active():self._clear();return
            if self.inflight:
                if self.raw is None and self.waiters<self.max_waiters:
                    self.waiters+=1
                    try:self.cv.wait_for(lambda:not self.inflight,timeout=self.wait)
                    finally:self.waiters-=1
                return
            if self.clock()<self.due:return
            self.inflight=True;epoch=self.epoch
            old={'raw':self.raw,'dto':self.dto,'tag':self.tag,'mode':self.mode}
            conditions={'If-None-Match':self.tag}if self.raw is not None else {}
        fresh=None;error=None;status=503;retry=None;clear=False
        try:
            response=self.transport(conditions,TIMEOUT);status=response.status;headers=source_headers(response.headers,status)
            if status in(200,304):
                mode=header(headers,PREFIX+'Mode');captured=header(headers,PREFIX+'Captured-At')
                registry=header(headers,PREFIX+'Registry-Hash');publication=ordinal(header(headers,PREFIX+'Publication-Ordinal'))
                tag=header(headers,'ETag');need(mode in('validated_cache','retained')and registry==REGISTRY_HASH)
                need(stamp(captured)<=self.wall()+60)
                need((header(headers,'Content-Encoding')or'identity').lower()=='identity')
                content=header(headers,'Content-Type')
                need(status==304 and content is None or(content or'').split(';')[0].strip().lower()=='application/json')
                if status==304:
                    need(bool(conditions)and old['raw']is not None and tag==old['tag'])
                    need(captured==old['dto']['capturedAt']and publication>=old['dto']['publicationOrdinal']and registry==old['dto']['registryHash'])
                    fresh={**old,'dto':{**old['dto'],'publicationOrdinal':publication},'mode':mode}
                else:
                    need(type(response.body)is bytes and 0<len(response.body)<=MAX_BYTES)
                    length=header(headers,'Content-Length');need(length is None or length.isdigit()and int(length)==len(response.body))
                    digest=hashlib.sha256(response.body).hexdigest();need(tag=='"stamp-references-'+digest+'"')
                    dto=self.validator(response.body,{'etag':tag,'capturedAt':captured,'registryHash':registry,'publicationOrdinal':publication,'wallNow':math.floor(self.wall()*1000)})
                    need(dto=={'bodySha256':digest,'registryHash':REGISTRY_HASH,'capturedAt':captured,'publicationOrdinal':publication})
                    if old['dto']:
                        before=old['dto'];need(stamp(captured)>=stamp(before['capturedAt'])and publication>=before['publicationOrdinal'])
                        need(publication!=before['publicationOrdinal']or digest==before['bodySha256'])
                    fresh={'raw':response.body,'dto':dto,'tag':tag,'mode':mode}
            else:
                error='own_site_unavailable';clear=status in(401,403,404)
                if status==429:
                    value=header(headers,'Retry-After')
                    try:retry=float(value)if value and value.isdigit()else parsedate_to_datetime(value).timestamp()-self.wall()if value else None
                    except(ValueError,TypeError,OverflowError):pass
        except AuthenticationUnavailable as exc:
            status=exc.status;error='own_site_unavailable';clear=status in(401,403,404)
        except(OSError,TimeoutError):error='own_site_unavailable'
        except Exception:error='own_site_invalid_stamp_reference'
        finally:
            with self.cv:
                if clear and epoch==self.epoch:self._clear(status)
                if not self.active():self._clear();fresh=None;status=404;error='own_site_unavailable'
                if fresh and epoch==self.epoch:
                    self.raw=fresh['raw'];self.dto=fresh['dto'];self.tag=fresh['tag'];self.mode=fresh['mode']
                elif fresh:fresh=None;error='own_site_unavailable';status=self.status
                if epoch==self.epoch or not self.active():
                    self.error=error;self.status=status
                    if error:
                        self.failures=min(8,self.failures+1);delay=min(300,30*2**min(self.failures-1,4))
                        if retry is not None and math.isfinite(retry):delay=max(delay,min(3600,max(0,retry)))
                    else:self.failures=0;delay=TTL
                    self.due=self.clock()+delay
                self.inflight=False;self.cv.notify_all()
    def handle(self,method,path,headers,*,bind_host='127.0.0.1',client_host='127.0.0.1',port=8765):
        try:url=urlsplit(path)
        except(ValueError,TypeError):return None
        if url.path!=PATH:return None
        common=dict(BASE)
        def respond(status,code=None,body=None):
            raw=body if body is not None else json.dumps({'error':code,'sourceObservedAt':None},separators=(',',':')).encode()
            return LocalResponse(status,{**common,'Content-Length':str(len(raw))},b''if method=='HEAD'or status==304 else raw)
        from local_own_site_session import local_request_allowed
        if not local_request_allowed(headers,bind_host,client_host,port,origin_proof=False):return respond(403,'local_only')
        if method not in('GET','HEAD'):common['Allow']='GET, HEAD';return respond(405,'method_not_allowed')
        if url.scheme or url.netloc or url.query or url.fragment or '%'in path or '\\'in path:return respond(400,'invalid_query')
        if not self.active():
            with self.cv:self._clear()
            return respond(404,'not_published')
        self._refresh()
        with self.cv:
            if not self.active():self._clear();return respond(404,'not_published')
            if self.raw is None:
                common['Retry-After']=str(max(1,math.ceil(self.due-self.clock())))
                return respond(self.status if self.status in(401,403,404)else 503,'not_published'if self.status==404 else'stamp_references_unavailable')
            retained=bool(self.error or self.inflight or self.clock()>=self.due or self.mode=='retained')
            common.update({'ETag':self.tag,PREFIX+'Mode':'retained'if retained else'validated_cache',
                PREFIX+'Captured-At':self.dto['capturedAt'],PREFIX+'Registry-Hash':REGISTRY_HASH,
                PREFIX+'Publication-Ordinal':str(self.dto['publicationOrdinal'])})
            if header(headers,'If-None-Match')==self.tag:return respond(304,body=b'')
            return respond(200,body=self.raw)
