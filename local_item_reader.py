"""Fixed own-site public item/discovery parity for loopback preview only.

No provider, key, arbitrary proxy, public activation, persistent raw mirror or
visitor identity. Successful bodies pass the current pure JS contracts locally.
"""
from collections import OrderedDict
from dataclasses import dataclass
import datetime as dt
from email.utils import parsedate_to_datetime
import hashlib
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import socket
import subprocess
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, parse_qsl
from urllib.request import Request, HTTPRedirectHandler, ProxyHandler, build_opener

TTL=60; TIMEOUT=3; MANIFEST='/api-item-identities.json'
BASE={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform',
      'CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'}
SHA=re.compile(r'[a-f0-9]{64}')
class Invalid(ValueError): pass
def need(ok):
    if not ok: raise Invalid('invalid_local_item_reference')
def header(headers,key):
    return next((str(v) for k,v in headers.items() if k.lower()==key.lower()),None)
def iso(t): return dt.datetime.fromtimestamp(t,dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def route(path):
    need(type(path) is str and len(path)<=300 and '%' not in path and '\\' not in path)
    p=urlsplit(path);need(not p.scheme and not p.netloc and not p.fragment)
    args=parse_qsl(p.query,keep_blank_values=True)
    need(not p.query or len(args)==1 and args[0][0]=='generation' and SHA.fullmatch(args[0][1]) and p.query=='generation='+args[0][1])
    wanted=args[0][1] if args else None
    if p.path==MANIFEST:return {'kind':'manifest','limit':65536,'path':p.path,'wanted':wanted,'key':p.path+('?' + p.query if p.query else '')}
    m=re.fullmatch(r'/api-item-prices/([1-9][0-9]{0,8})\.json',p.path)
    if m:return {'kind':'item','itemId':int(m[1]),'limit':300000,'path':p.path,'wanted':wanted,'key':p.path+('?' + p.query if p.query else '')}
    m=re.fullmatch(r'/api-item-identities/([a-f0-9]{64})\.json',p.path)
    need(m is not None)
    return {'kind':'page','pageHash':m[1],'limit':131072,'path':p.path,'wanted':wanted,'key':p.path+('?' + p.query if p.query else '')}

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
    need(type(conditions) is dict and set(conditions)<= {'If-None-Match'})
    need(all(type(v) is str and len(v)<=160 and '\r' not in v and '\n' not in v for v in conditions.values()))
    need(type(timeout) in (float,int) and math.isfinite(timeout) and 0<timeout<=TIMEOUT)
    request=Request('https://inflation.gg'+r['key'],method='GET',headers={'Accept':'application/json','Accept-Encoding':'identity',
        'User-Agent':'InflationWatch-LocalPreview/1.0 (+https://inflation.gg/)',**conditions})
    try:response=build_opener(ProxyHandler({}),NoRedirect()).open(request,timeout=timeout)
    except HTTPError as e:
        with e:return TransportResponse(e.code,dict(e.headers),b'')
    with response:
        if response.status!=200:return TransportResponse(response.status,dict(response.headers),b'')
        length=response.headers.get('Content-Length')
        need(length is None or length.isdigit() and int(length)<=r['limit'])
        parts=[];size=0;deadline=time.monotonic()+timeout
        while True:
            if time.monotonic()>deadline:raise TimeoutError()
            part=response.read1(min(16384,r['limit']+1-size))
            if not part:break
            parts.append(part);size+=len(part);need(size<=r['limit'])
        return TransportResponse(200,dict(response.headers),b''.join(parts))

def validate(raw,context,*,protocol_root=None):
    """Fixed local subprocess, no shell; schema/stat semantics reused exactly."""
    import base64
    root=Path(protocol_root or Path(__file__).parent).resolve()
    packet={**context,'raw':base64.b64encode(raw).decode('ascii')}
    try:
        p=subprocess.run(['node',str(Path(__file__).with_name('local-item-validate.mjs')),str(root)],
             input=json.dumps(packet,separators=(',',':')).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,
             timeout=3,env={k:os.environ[k] for k in ('PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP') if k in os.environ},
             creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0) if os.name=='nt' else 0)
        need(p.returncode==0 and len(p.stdout)<=350000)
        return json.loads(p.stdout)
    except (OSError,subprocess.TimeoutExpired,ValueError):raise Invalid('invalid_local_item_reference') from None

class LocalItemReader:
    def __init__(self,root=None,*,transport=own_site_transport,validator=None,monotonic=time.monotonic,wall=time.time,
                 wait_seconds=4,max_entries=48,max_bytes=4194304,max_flights=4):
        need(type(wait_seconds) in (int,float) and 0<wait_seconds<=5)
        need(type(max_entries) is int and 4<=max_entries<=64 and type(max_bytes) is int and 300000<=max_bytes<=8388608)
        need(type(max_flights) is int and 1<=max_flights<=4)
        self.transport=transport;self.validator=validator or (lambda raw,c:validate(raw,c,protocol_root=root))
        self.monotonic=monotonic;self.wall=wall;self.wait_seconds=wait_seconds
        self.max_entries=max_entries;self.max_bytes=max_bytes;self.max_flights=max_flights
        self.cv=threading.Condition();self.entries=OrderedDict();self.flights=set();self.manifest=None
    def _entry(self,key):
        e=self.entries.get(key)
        if e is None:
            e={'raw':None,'dto':None,'etag':None,'generation':None,'mode':None,'due':0,'failures':0,'error':None,'status':503,'checked':None}
            self.entries[key]=e
        self.entries.move_to_end(key)
        self._trim()
        return e
    def _trim(self):
        while len(self.entries)>self.max_entries or sum(len(e['raw'] or b'') for e in self.entries.values())>self.max_bytes:
            key=next((k for k in self.entries if k not in self.flights),None)
            if key is None:break
            del self.entries[key]
    def _get(self,r):
        key=r['key']
        with self.cv:
            e=self._entry(key)
            if r['kind']=='page' and self.manifest is not None and e['generation']!=self.manifest['indexHash']:
                e['due']=0
            if key in self.flights:
                if e['raw'] is None:self.cv.wait_for(lambda:key not in self.flights,timeout=self.wait_seconds)
                return dict(e)
            if self.monotonic()<e['due']:return dict(e)
            if len(self.flights)>=self.max_flights:return dict(e)
            self.flights.add(key);conditions={'If-None-Match':e['etag']} if e['raw'] and not (r['kind']=='page' and self.manifest and e['generation']!=self.manifest['indexHash']) else {}
            old=dict(e);manifest=self.manifest
        error=None;status=503;retry=None;fresh=None
        try:
            response=self.transport(key,conditions,TIMEOUT);status=response.status;h=response.headers
            prefix='X-Astra-API-Item-' if r['kind']=='item' else 'X-Astra-API-Identity-'
            mode=header(h,prefix+'Mode');generation=header(h,prefix+'Generation');etag=header(h,'ETag')
            if status==304:
                need(old['raw'] is not None and conditions and etag==old['etag'] and generation==old['generation'] and mode in ('validated_cache','retained'))
                if r['kind']=='item':need(header(h,prefix+'Captured-At')==old['dto']['sourceCapturedAt'])
                fresh={**old,'mode':mode}
            elif status==200:
                need(type(response.body) is bytes and 0<len(response.body)<=r['limit'])
                need((header(h,'Content-Type') or '').split(';')[0].strip().lower()=='application/json')
                need((header(h,'Content-Encoding') or 'identity').lower()=='identity')
                need(SHA.fullmatch(generation or '') is not None and mode in ('validated_cache','retained'))
                if r['wanted']:need(r['wanted']==generation)
                digest=hashlib.sha256(response.body).hexdigest()
                need(etag=='"'+('api-item-' if r['kind']=='item' else 'api-identities-')+digest+'"')
                context={**r,'mode':mode,'generation':generation,'etag':etag,'capturedAt':header(h,prefix+'Captured-At'),'wallNow':self.wall()*1000,'previous':old['dto']}
                if r['kind']=='page':
                    need(manifest is not None and manifest['indexHash']==generation)
                    context['manifest']=manifest
                dto=self.validator(response.body,context)
                if r['kind']=='item':
                    # Every retained generation of this item shares one original-clock floor.
                    with self.cv:
                        clocks=[x['dto']['sourceCapturedAt'] for k,x in self.entries.items() if k.split('?')[0]==r['path'] and x['dto']]
                    need(not clocks or dto['sourceCapturedAt']>=max(clocks))
                if r['kind']=='manifest' and self.manifest:
                    for previous in self.manifest['sources']:
                        n=next((s for s in dto['sources'] if s['operation']==previous['operation']),None)
                        need(n is not None and n['retrievedAt']>=previous['retrievedAt'])
                fresh={'raw':response.body,'dto':dto,'etag':etag,'generation':generation,'mode':mode}
            else:
                error='own_site_unavailable'
                if status==429:
                    v=header(h,'Retry-After')
                    try:retry=float(v) if v and v.isdigit() else parsedate_to_datetime(v).timestamp()-self.wall() if v else None
                    except (ValueError,TypeError,OverflowError):pass
        except (TimeoutError,socket.timeout):error='own_site_timeout'
        except Invalid:error='own_site_invalid_reference'
        except (OSError,URLError):error='own_site_unavailable'
        except Exception:error='own_site_reader_error'
        finally:
            with self.cv:
                if fresh:
                    if r['kind']=='page' and (self.manifest is None or self.manifest['indexHash']!=fresh['generation']):
                        error='identity_generation_changed';fresh=None;status=409
                    elif r['kind']=='item' and any(x['dto'] and x['dto']['sourceCapturedAt']>fresh['dto']['sourceCapturedAt'] for k,x in self.entries.items() if k.split('?')[0]==r['path']):
                        error='source_clock_regression';fresh=None
                    elif r['kind']=='manifest' and self.manifest and any(not any(n['operation']==s['operation'] and n['retrievedAt']>=s['retrievedAt'] for n in fresh['dto']['sources']) for s in self.manifest['sources']):
                        error='source_clock_regression';fresh=None
                    if fresh:
                        e.update(fresh)
                        if r['kind']=='manifest':self.manifest=e['dto']
                e['checked']=iso(self.wall());e['error']=error;e['status']=status
                if error:
                    e['failures']=min(8,e['failures']+1);delay=min(300,30*2**min(e['failures']-1,4))
                    if retry is not None and math.isfinite(retry):delay=max(delay,min(3600,max(0,retry)))
                else:e['failures']=0;delay=TTL
                e['due']=self.monotonic()+delay;self.flights.discard(key);self._trim();self.cv.notify_all()
        return dict(e)
    def handle(self,method,path,headers,*,bind_host='127.0.0.1',client_host='127.0.0.1'):
        # Unrelated preview handlers remain untouched.
        try:p=urlsplit(path)
        except ValueError:p=None
        if p is not None and not (p.path==MANIFEST or p.path.startswith(('/api-item-identities/','/api-item-prices/'))):return None
        common=dict(BASE)
        def respond(status,body=b''):
            return LocalResponse(status,{**common,'Content-Length':str(len(body))},b'' if method=='HEAD' or status==304 else body)
        try:
            host=header(headers,'Host');allowed=ipaddress.ip_address(bind_host).is_loopback and ipaddress.ip_address(client_host).is_loopback
            if host is not None:allowed=allowed and urlsplit('//'+host).hostname in ('localhost','127.0.0.1','::1') and '\r' not in host and '\n' not in host
            need(allowed)
        except (ValueError,TypeError):return respond(403,b'{"error":"local_only"}')
        if method not in ('GET','HEAD'):
            common['Allow']='GET, HEAD';return respond(405,b'{"error":"method_not_allowed"}')
        try:r=route(path)
        except (Invalid,ValueError,TypeError):return respond(400,b'{"error":"invalid_local_path"}')
        if r['kind']=='page':
            self._get(route(MANIFEST))
            with self.cv:manifest=self.manifest
            if manifest is None:return respond(503,b'{"error":"identity_reference_unavailable"}')
            if r['wanted'] and r['wanted']!=manifest['indexHash']:return respond(409,b'{"error":"generation_changed"}')
            if not any(d['sha256']==r['pageHash'] for d in manifest['pages']):return respond(404,b'{"error":"page_not_in_current_index"}')
        e=self._get(r)
        if e['status']==409:return respond(409,b'{"error":"generation_changed"}')
        if e['raw'] is None:
            common['Retry-After']=str(max(1,math.ceil(e['due']-self.monotonic())))
            return respond(404 if e['status']==404 else 503,b'{"error":"local_item_reference_unavailable","sourceObservedAt":null}')
        if r['kind']=='page':
            with self.cv:current=self.manifest
            if current is None or current['indexHash']!=e['generation']:return respond(503,b'{"error":"identity_reference_unavailable"}')
        if r['wanted'] and r['wanted']!=e['generation']:return respond(409,b'{"error":"generation_changed"}')
        prefix='X-Astra-API-Item-' if r['kind']=='item' else 'X-Astra-API-Identity-'
        with self.cv:refreshing=r['key'] in self.flights
        common.update({'ETag':e['etag'],prefix+'Mode':'retained' if e['error'] or refreshing or e['mode']=='retained' else 'validated_cache',prefix+'Generation':e['generation'],
                       'X-Local-Item-State':'retained_last_good' if e['error'] or refreshing else 'cached_verified'})
        if r['kind']=='item':common[prefix+'Captured-At']=e['dto']['sourceCapturedAt']
        if e['checked']:common['X-Local-Item-Checked-At']=e['checked']
        if header(headers,'If-None-Match')==e['etag']:return respond(304)
        return respond(200,e['raw'])
