"""Bounded anonymous own-site NX history bridge for loopback previews only.

No provider calls, keys, cookies, redirects, visitor identifiers or disk cache.
Original response bytes and receipt clocks survive local checks unchanged.
"""
from collections import OrderedDict
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
import base64
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

MANIFEST='/api-nx-history.json'
SHA=re.compile(r'[a-f0-9]{64}')
TTL=60; TIMEOUT=3
BASE={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform',
      'CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'}
PREFIX='X-Astra-NX-History-'
class Invalid(ValueError):pass
def need(v):
    if not v:raise Invalid('invalid_local_nx_history')
def header(h,k):return next((str(v) for n,v in h.items() if n.lower()==k.lower()),None)
def route(path):
    need(type(path) is str and len(path)<=250 and '%' not in path and '\\' not in path)
    p=urlsplit(path);need(not p.scheme and not p.netloc and not p.fragment)
    if p.path==MANIFEST:
        need(not p.query);return {'kind':'manifest','key':MANIFEST,'limit':131072,'wanted':None}
    m=re.fullmatch(r'/api-nx-history/([a-f0-9]{64})\.json',p.path)
    need(m is not None and re.fullmatch(r'generation=[a-f0-9]{64}',p.query) is not None)
    return {'kind':'page','key':path,'pageHash':m[1],'wanted':p.query[11:],'limit':196608}
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
def own_site_transport(path,conditions,timeout):
    r=route(path)
    need(type(conditions) is dict and set(conditions)<= {'If-None-Match'} and all(type(v) is str and len(v)<=160 and '\r' not in v and '\n' not in v for v in conditions.values()))
    need(type(timeout) in (int,float) and math.isfinite(timeout) and 0<timeout<=TIMEOUT)
    request=Request('https://inflation.gg'+r['key'],method='GET',headers={'Accept':'application/json','Accept-Encoding':'identity',
        'User-Agent':'InflationWatch-LocalPreview/1.0 (+https://inflation.gg/)',**conditions})
    try:response=build_opener(ProxyHandler({}),NoRedirect()).open(request,timeout=timeout)
    except HTTPError as e:
        with e:return TransportResponse(e.code,dict(e.headers),b'')
    with response:
        if response.status!=200:return TransportResponse(response.status,dict(response.headers),b'')
        size=response.headers.get('Content-Length');need(size is None or size.isdigit() and int(size)<=r['limit'])
        parts=[];total=0;deadline=time.monotonic()+timeout
        while True:
            if time.monotonic()>deadline:raise TimeoutError()
            part=response.read1(min(16384,r['limit']+1-total))
            if not part:break
            parts.append(part);total+=len(part);need(total<=r['limit'])
        return TransportResponse(200,dict(response.headers),b''.join(parts))
def validate(raw,context):
    """Short-lived fixed local Node process reuses strict production validators."""
    need(type(raw) is bytes and 0<len(raw)<=196608)
    try:
        packet=json.dumps({**context,'raw':base64.b64encode(raw).decode()},separators=(',',':')).encode()
        need(len(packet)<=700000)
        p=subprocess.run(['node',str(Path(__file__).with_name('local-nx-history-validate.mjs'))],input=packet,
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=3,
            env={k:os.environ[k] for k in ('PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP') if k in os.environ},
            creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0) if os.name=='nt' else 0)
        need(p.returncode==0 and 0<len(p.stdout)<=196608)
        return json.loads(p.stdout)
    except (OSError,subprocess.TimeoutExpired,ValueError):raise Invalid('invalid_local_nx_history') from None

class LocalNxHistoryReader:
    def __init__(self,root=None,*,transport=own_site_transport,validator=validate,monotonic=time.monotonic,wall=time.time,
                 wait_seconds=4,max_pages=8,max_bytes=2097152,max_flights=4):
        need(type(wait_seconds) in (int,float) and math.isfinite(wait_seconds) and 0<wait_seconds<=5)
        need(type(max_pages) is int and 1<=max_pages<=16 and type(max_bytes) is int and 196608<=max_bytes<=4194304)
        need(type(max_flights) is int and 1<=max_flights<=4)
        self.transport=transport;self.validator=validator;self.clock=monotonic;self.wall=wall;self.wait=wait_seconds
        self.max_pages=max_pages;self.max_bytes=max_bytes;self.max_flights=max_flights
        self.cv=threading.Condition();self.entries=OrderedDict();self.flights=set();self.current=None;self.epoch=0
    def _trim(self):
        pages=[k for k in self.entries if k!=MANIFEST]
        while len(pages)>self.max_pages or sum(len(self.entries[k]['raw'] or b'') for k in pages)>self.max_bytes:
            key=next((k for k in pages if k not in self.flights),None)
            if key is None:break
            del self.entries[key];pages.remove(key)
    def _blank(self):return {'raw':None,'dto':None,'tag':None,'generation':None,'capture':None,'mode':None,'due':0,'failures':0,'error':None,'status':503}
    def _get(self,r):
        key=r['key']
        with self.cv:
            e=self.entries.setdefault(key,self._blank());self.entries.move_to_end(key);self._trim()
            if key in self.flights:
                if e['raw'] is None:self.cv.wait_for(lambda:key not in self.flights,timeout=self.wait)
                return dict(e)
            if self.clock()<e['due'] or len(self.flights)>=self.max_flights:return dict(e)
            self.flights.add(key);old=dict(e);epoch=self.epoch;manifest=self.current
            conditions={'If-None-Match':old['tag']} if old['raw'] else {}
        error=None;fresh=None;status=503;retry=None;clear=False
        try:
            response=self.transport(key,conditions,TIMEOUT);status=response.status;h=response.headers
            generation=header(h,PREFIX+'Generation');capture=header(h,PREFIX+'Captured-At');mode=header(h,PREFIX+'Mode');tag=header(h,'ETag')
            if status in (200,304):
                need(mode in ('accepted_cache','retained_last_good') and SHA.fullmatch(generation or '') is not None)
                if r['wanted']:need(generation==r['wanted'])
                if status==304:
                    need(bool(conditions) and tag==old['tag'] and generation==old['generation'] and capture==old['capture'])
                    fresh={**old,'mode':mode}
                else:
                    need(type(response.body) is bytes and 0<len(response.body)<=r['limit'])
                    need((header(h,'Content-Type') or '').split(';')[0].strip().lower()=='application/json' and (header(h,'Content-Encoding') or 'identity').lower()=='identity')
                    need(tag=='"nx-history-'+hashlib.sha256(response.body).hexdigest()+'"')
                    context={**r,'generation':generation,'etag':tag,'capturedAt':capture,'wallNow':self.wall()*1000}
                    if r['kind']=='manifest':context['previous']=old['dto']
                    else:need(manifest is not None and manifest['indexHash']==generation);context['manifest']=manifest
                    dto=self.validator(response.body,context)
                    fresh={'raw':response.body,'dto':dto,'tag':tag,'generation':generation,'capture':capture,'mode':mode}
            else:
                error='own_site_unavailable'
                # Only known manifest/page paths reach transport. A withdrawal
                # or access denial must not leave another warm history entry visible.
                clear=status in (401,403,404)
                if status==429:
                    v=header(h,'Retry-After')
                    try:retry=float(v) if v and v.isdigit() else parsedate_to_datetime(v).timestamp()-self.wall() if v else None
                    except (ValueError,TypeError,OverflowError):pass
        except (OSError,TimeoutError):error='own_site_unavailable'
        except Exception:error='own_site_invalid_history'
        finally:
            with self.cv:
                if clear and epoch==self.epoch:
                    self.epoch+=1;self.current=None
                    for entry in self.entries.values():entry.update(self._blank())
                    if MANIFEST in self.entries:self.entries[MANIFEST].update(status=status,error='own_site_unavailable',due=self.clock()+30)
                if fresh:
                    if epoch!=self.epoch or r['kind']=='page' and (self.current is not manifest or self.current is None or self.current['indexHash']!=fresh['generation']):
                        fresh=None;error='generation_changed';status=409
                    elif r['kind']=='manifest' and self.current is not None and fresh['capture']<self.current['receiptWatermarkAt']:
                        fresh=None;error='clock_regression'
                    if fresh:
                        e.update(fresh)
                        if r['kind']=='manifest':self.current=e['dto']
                e['error']=error;e['status']=status
                if error:
                    e['failures']=min(8,e['failures']+1);delay=min(300,30*2**min(e['failures']-1,4))
                    if retry is not None and math.isfinite(retry):delay=max(delay,min(3600,max(0,retry)))
                else:e['failures']=0;delay=TTL
                e['due']=self.clock()+delay;self.flights.discard(key);self._trim();self.cv.notify_all()
        return dict(e)
    def handle(self,method,path,headers,*,bind_host='127.0.0.1',client_host='127.0.0.1'):
        try:p=urlsplit(path)
        except (ValueError,TypeError):return None
        if p.path!=MANIFEST and not p.path.startswith('/api-nx-history/'):return None
        common=dict(BASE)
        def respond(status,code=None,extra=None,body=None):
            raw=body if body is not None else json.dumps({'error':code,'sourceObservedAt':None,**(extra or {})},separators=(',',':')).encode()
            out={**common,'Content-Length':str(len(raw))}
            return LocalResponse(status,out,b'' if method=='HEAD' or status==304 else raw)
        try:
            host=header(headers,'Host');h=urlsplit('//'+host) if host and '\r' not in host and '\n' not in host else None
            need(ipaddress.ip_address(bind_host).is_loopback and ipaddress.ip_address(client_host).is_loopback and h is not None and h.hostname in ('127.0.0.1','localhost','::1') and h.username is None and h.password is None and not h.path and not h.query and not h.fragment and (h.port is None or 0<h.port<=65535))
        except (ValueError,TypeError):return respond(403,'local_only')
        if p.path!=MANIFEST and re.fullmatch(r'/api-nx-history/[a-f0-9]{64}\.json',p.path) is None:return respond(404,'not_published')
        if method not in ('GET','HEAD'):common['Allow']='GET, HEAD';return respond(405,'method_not_allowed')
        try:r=route(path)
        except (ValueError,TypeError):return respond(400,'invalid_query')
        if r['kind']=='page':
            m=self._get(route(MANIFEST))
            with self.cv:manifest=self.current
            if manifest is None:return respond(m['status'] if m['status'] in (401,403,404) else 503,'not_published' if m['status']==404 else 'nx_history_unavailable')
            if manifest['indexHash']!=r['wanted']:return respond(409,'generation_changed',{'generation':manifest['indexHash']})
            if not any(d['sha256']==r['pageHash'] for d in manifest['pages']):return respond(404,'page_not_in_current_archive',{'generation':manifest['indexHash']})
        e=self._get(r)
        with self.cv:
            current=self.current;refreshing=MANIFEST in self.flights or r['key'] in self.flights
            manifest_entry=self.entries.get(MANIFEST,{})
        if e['raw'] is None:
            common['Retry-After']=str(max(1,math.ceil(e['due']-self.clock())))
            return respond(e['status'] if e['status'] in (401,403,404) else 503,'not_published' if e['status']==404 else 'nx_history_unavailable')
        if current is None:return respond(503,'nx_history_unavailable')
        if e['generation']!=current['indexHash']:return respond(409,'generation_changed',{'generation':current['indexHash']})
        if r['kind']=='page':
            # Cached content remains authoritative only for this exact current descriptor.
            d=next((d for d in current['pages'] if d['sha256']==r['pageHash']),None)
            if d is None:return respond(404,'page_not_in_current_archive',{'generation':current['indexHash']})
            if d['bytes']!=len(e['raw']) or d['receiptWatermarkAt']!=e['capture']:return respond(503,'nx_history_page_unavailable')
        retained=bool(e['error'] or manifest_entry.get('error') or refreshing or e['mode']=='retained_last_good' or manifest_entry.get('mode')=='retained_last_good')
        common.update({'ETag':e['tag'],PREFIX+'Mode':'retained_last_good' if retained else 'accepted_cache',PREFIX+'Generation':e['generation'],PREFIX+'Captured-At':e['capture']})
        if header(headers,'If-None-Match')==e['tag']:return respond(304,body=b'')
        return respond(200,body=e['raw'])
