"""Opt-in memory-only fixed own-site calculation reader for loopback previews.

No provider, API key, cookies, proxy env, redirects, visitor IDs or disk cache.
The exact production-validated body and two original retrieval clocks are kept.
"""
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
import base64
import datetime as dt
import hashlib
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import subprocess
import threading
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, HTTPRedirectHandler, ProxyHandler, build_opener

PATH='/api-market-calculations.json'
URL='https://inflation.gg'+PATH
DEFINITION_HASH='865944dc992219e01b2aad45a6191174d112f3f1902e4ac86c79a6d23a481e17'
PREFIX='X-Astra-Calculations-'
MAX_BYTES=600000
TTL=60
TIMEOUT=3
BASE={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform',
      'CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'}
class Invalid(ValueError):pass
def need(v):
    if not v:raise Invalid('invalid_local_calculations')
def header(h,k):return next((str(v) for n,v in h.items() if n.lower()==k.lower()),None)
def source_headers(value,status):
    if status not in (200,304):
        # Withdrawal/access denial wins over irrelevant malformed metadata.
        try:return dict(value.items())
        except Exception:return {}
    need(value is not None and callable(getattr(value,'items',None)))
    pairs=list(value.raw_items() if callable(getattr(value,'raw_items',None)) else value.items())
    need(all(type(k) is str and type(v) is str for k,v in pairs))
    for name in ('ETag','Content-Type','Content-Encoding','Content-Length',PREFIX+'Mode',PREFIX+'Prices-Captured-At',PREFIX+'Overview-Captured-At',PREFIX+'Definition-Hash'):
        need(sum(k.lower()==name.lower() for k,_ in pairs)<=1)
        if callable(getattr(value,'get_all',None)):
            values=value.get_all(name);need(values is None or len(values)<=1)
    need(all('\r' not in k+v and '\n' not in k+v for k,v in pairs))
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
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*a,**k):return None
def own_site_transport(conditions,timeout):
    need(type(conditions) is dict and set(conditions)<= {'If-None-Match'} and all(type(v) is str and len(v)<=160 and '\r' not in v and '\n' not in v for v in conditions.values()))
    need(type(timeout) in (int,float) and math.isfinite(timeout) and 0<timeout<=TIMEOUT)
    request=Request(URL,method='GET',headers={'Accept':'application/json','Accept-Encoding':'identity',
        'User-Agent':'InflationWatch-LocalPreview/1.0 (+https://inflation.gg/)',**conditions})
    try:response=build_opener(ProxyHandler({}),NoRedirect()).open(request,timeout=timeout)
    except HTTPError as error:
        with error:return TransportResponse(error.code,source_headers(error.headers,error.code),b'')
    with response:
        h=source_headers(response.headers,response.status)
        if response.status!=200:return TransportResponse(response.status,h,b'')
        length=header(h,'Content-Length');need(length is None or length.isdigit() and int(length)<=MAX_BYTES)
        parts=[];total=0;deadline=time.monotonic()+timeout
        while True:
            if time.monotonic()>deadline:raise TimeoutError()
            part=response.read1(min(16384,MAX_BYTES+1-total))
            if not part:break
            parts.append(part);total+=len(part);need(total<=MAX_BYTES)
        return TransportResponse(200,h,b''.join(parts))
def validate(raw,context):
    """Fixed bounded local Node helper reuses the actual production protocol."""
    need(type(raw) is bytes and 0<len(raw)<=MAX_BYTES)
    try:
        packet=json.dumps({**context,'raw':base64.b64encode(raw).decode()},separators=(',',':')).encode()
        need(len(packet)<=900000)
        p=subprocess.run(['node',str(Path(__file__).with_name('local-calculations-validate.mjs'))],input=packet,
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=3,
            env={k:os.environ[k] for k in ('PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP') if k in os.environ},
            creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0) if os.name=='nt' else 0)
        need(p.returncode==0 and 0<len(p.stdout)<=2048)
        out=json.loads(p.stdout);need(type(out) is dict and set(out)=={'snapshotHash','definitionHash','pricesCapturedAt','overviewCapturedAt'})
        return out
    except (OSError,subprocess.TimeoutExpired,ValueError):raise Invalid('invalid_local_calculations') from None
def stamp(value):
    if value=='none':return None
    need(type(value) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)',value) is not None)
    return dt.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
def inject_local_availability(raw,enabled):
    need(type(raw) is bytes and len(raw)<=2000000 and type(enabled) is bool)
    matches=list(re.finditer(rb'<body\b[^>]*>',raw,re.I));need(len(matches)==1)
    match=matches[0];tag=re.sub(rb'\sdata-api-calculations-available\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+)',b'',match.group(),flags=re.I)
    if enabled:tag=tag[:-1]+b' data-api-calculations-available="true">'
    return raw[:match.start()]+tag+raw[match.end():]

class LocalCalculationsReader:
    def __init__(self,root=None,*,enabled=False,transport=own_site_transport,validator=validate,
                 monotonic=time.monotonic,wall=time.time,wait_seconds=4,max_waiters=32):
        need(type(enabled) is bool or callable(enabled));need(type(wait_seconds) in (int,float) and math.isfinite(wait_seconds) and 0<wait_seconds<=5)
        need(type(max_waiters) is int and 1<=max_waiters<=32)
        self.enabled=enabled;self.transport=transport;self.validator=validator;self.clock=monotonic;self.wall=wall;self.wait=wait_seconds;self.max_waiters=max_waiters
        self.cv=threading.Condition();self.inflight=False;self.waiters=0;self.epoch=0;self.raw=None;self.dto=None;self.tag=None;self.mode=None;self.due=0;self.failures=0;self.error=None;self.status=503
    def active(self):
        try:return (self.enabled() if callable(self.enabled) else self.enabled) is True
        except Exception:return False
    def _clear(self,status=404):
        self.epoch+=1;self.raw=None;self.dto=None;self.tag=None;self.mode=None;self.status=status;self.error='own_site_unavailable';self.due=self.clock()+30
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
            self.inflight=True;epoch=self.epoch;old={'raw':self.raw,'dto':self.dto,'tag':self.tag,'mode':self.mode}
            conditions={'If-None-Match':self.tag} if self.raw is not None else {}
        fresh=None;error=None;status=503;retry=None;clear=False
        try:
            response=self.transport(conditions,TIMEOUT);status=response.status;h=source_headers(response.headers,status)
            if status in (200,304):
                mode=header(h,PREFIX+'Mode');prices=header(h,PREFIX+'Prices-Captured-At');overview=header(h,PREFIX+'Overview-Captured-At');definition=header(h,PREFIX+'Definition-Hash');tag=header(h,'ETag')
                need(mode in ('accepted_cache','retained_last_good') and definition==DEFINITION_HASH);stamp(prices);stamp(overview)
                need((header(h,'Content-Encoding') or 'identity').lower()=='identity')
                content_type=header(h,'Content-Type');need((status==304 and content_type is None) or (content_type or '').split(';')[0].strip().lower()=='application/json')
                if status==304:
                    need(bool(conditions) and old['raw'] is not None and tag==old['tag'] and prices==old['dto']['pricesCapturedAt'] and overview==old['dto']['overviewCapturedAt'])
                    fresh={**old,'mode':mode}
                else:
                    need(type(response.body) is bytes and 0<len(response.body)<=MAX_BYTES)
                    length=header(h,'Content-Length');need(length is None or length.isdigit() and int(length)==len(response.body))
                    need(tag=='"api-calculations-'+hashlib.sha256(response.body).hexdigest()+'"')
                    dto=self.validator(response.body,{'etag':tag,'pricesCapturedAt':prices,'overviewCapturedAt':overview,'definitionHash':definition,'wallNow':self.wall()*1000})
                    need(dto['definitionHash']==DEFINITION_HASH and dto['pricesCapturedAt']==prices and dto['overviewCapturedAt']==overview)
                    if old['dto']:
                        for k in ('pricesCapturedAt','overviewCapturedAt'):
                            before=stamp(old['dto'][k]);after=stamp(dto[k]);need(before is None or after is not None and after>=before)
                    fresh={'raw':response.body,'dto':dto,'tag':tag,'mode':mode}
            else:
                error='own_site_unavailable';clear=status in (401,403,404)
                if status==429:
                    value=header(h,'Retry-After')
                    try:retry=float(value) if value and value.isdigit() else parsedate_to_datetime(value).timestamp()-self.wall() if value else None
                    except (ValueError,TypeError,OverflowError):pass
        except (OSError,TimeoutError):error='own_site_unavailable'
        except Exception:error='own_site_invalid_calculations'
        finally:
            with self.cv:
                if clear and epoch==self.epoch:self._clear(status)
                if not self.active():self._clear();fresh=None;status=404;error='own_site_unavailable'
                if fresh and epoch==self.epoch:self.raw=fresh['raw'];self.dto=fresh['dto'];self.tag=fresh['tag'];self.mode=fresh['mode']
                elif fresh:fresh=None;error='own_site_unavailable';status=self.status
                if epoch==self.epoch or not self.active():
                    self.error=error;self.status=status
                    if error:
                        self.failures=min(8,self.failures+1);delay=min(300,30*2**min(self.failures-1,4))
                        if retry is not None and math.isfinite(retry):delay=max(delay,min(3600,max(0,retry)))
                    else:self.failures=0;delay=TTL
                    self.due=self.clock()+delay
                self.inflight=False;self.cv.notify_all()
    def handle(self,method,path,headers,*,bind_host='127.0.0.1',client_host='127.0.0.1'):
        try:p=urlsplit(path)
        except (ValueError,TypeError):return None
        if p.path!=PATH:return None
        common=dict(BASE)
        def respond(status,code=None,body=None):
            raw=body if body is not None else json.dumps({'error':code,'sourceObservedAt':None},separators=(',',':')).encode();h={**common,'Content-Length':str(len(raw))}
            return LocalResponse(status,h,b'' if method=='HEAD' or status==304 else raw)
        try:
            pairs=list(headers.raw_items() if callable(getattr(headers,'raw_items',None)) else headers.items());hosts=[v for k,v in pairs if k.lower()=='host'];need(len(hosts)==1)
            host=hosts[0];need(type(host) is str and '\r' not in host and '\n' not in host);h=urlsplit('//'+host)
            need(ipaddress.ip_address(bind_host).is_loopback and ipaddress.ip_address(client_host).is_loopback and h.hostname in ('127.0.0.1','localhost','::1') and h.username is None and h.password is None and not h.path and not h.query and not h.fragment and (h.port is None or 0<h.port<=65535))
        except (ValueError,TypeError):return respond(403,'local_only')
        if method not in ('GET','HEAD'):common['Allow']='GET, HEAD';return respond(405,'method_not_allowed')
        if p.scheme or p.netloc or p.query or p.fragment or '%' in path or '\\' in path:return respond(400,'invalid_query')
        if not self.active():
            with self.cv:self._clear()
            return respond(404,'not_published')
        self._refresh()
        with self.cv:
            if not self.active():self._clear();return respond(404,'not_published')
            if self.raw is None:
                common['Retry-After']=str(max(1,math.ceil(self.due-self.clock())))
                return respond(self.status if self.status in (401,403,404) else 503,'not_published' if self.status==404 else 'calculations_unavailable')
            retained=bool(self.error or self.inflight or self.clock()>=self.due or self.mode=='retained_last_good')
            common.update({'ETag':self.tag,PREFIX+'Mode':'retained_last_good' if retained else 'accepted_cache',PREFIX+'Prices-Captured-At':self.dto['pricesCapturedAt'],PREFIX+'Overview-Captured-At':self.dto['overviewCapturedAt'],PREFIX+'Definition-Hash':DEFINITION_HASH})
            if header(headers,'If-None-Match')==self.tag:return respond(304,body=b'')
            return respond(200,body=self.raw)
