"""Local preview's fixed own-site public29 reader. No provider/key/raw API access.

Memory only; validates exact existing public subset contract before last-good use.
Only the literal own-site HTTPS endpoint is transported. No arbitrary URL option.
"""
from dataclasses import dataclass
import datetime as dt
from email.utils import parsedate_to_datetime
import hashlib
import ipaddress
import json
import math
from pathlib import Path
import re
import socket
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener, ProxyHandler
from portable_hash import portable_hash

URL='https://inflation.gg/api-cash-items.json'
PATH='/api-cash-items.json'
MAX_BYTES=100_000
TTL=60
TIMEOUT=3
HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform',
         'CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'}
METHOD={'price':'Source-reported item sale median','count':'Reported sale count; not physical units',
        'quality':'Item-level aggregates can mix equipment qualities','identity':'Bound game item IDs; provider item-name echo not verified',
        'use':'Compare fixed-NX items; not an executable exchange quote or the goods-inflation headline',
        'clocks':'Retrieval time is known; individual sale timestamps and exact window bounds are not supplied'}
WINDOW={'reportedLookbackDays':3,'start':None,'end':None,'boundsKnown':False}
ATTRIBUTION={'label':'Prices from maplestory.market','url':'https://maplestory.market/?ref=v6kkdvp6'}
class Invalid(ValueError):pass
def _bad(code):raise Invalid(code)
def _exact(value,fields):
    if type(value) is not dict or set(value)!=set(fields.split()):_bad('invalid_public_subset')
def _integer(value,minimum=0):return type(value) is int and minimum<=value<=2**53-1
def _clock(value):
    if type(value) is not str or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z',value):_bad('invalid_public_clock')
    try:result=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
    except ValueError:_bad('invalid_public_clock')
    if result.isoformat(timespec='milliseconds').replace('+00:00','Z')!=value:_bad('invalid_public_clock')
    return result.timestamp()
def _decode(raw):
    def pairs(values):
        out={}
        for key,value in values:
            if key in out:_bad('duplicate_public_field')
            out[key]=value
        return out
    if type(raw) is not bytes or not 0<len(raw)<=MAX_BYTES:_bad('public_size_bound')
    try:return json.loads(raw.decode('utf-8'),object_pairs_hook=pairs,parse_constant=lambda _:_bad('invalid_public_number'))
    except Invalid:raise
    except (ValueError,UnicodeError,RecursionError):_bad('invalid_public_json')
def validate(raw,targets,*,wall_now):
    dto=_decode(raw)
    _exact(dto,'schemaVersion kind sourceUrl privateProjectionHash requestStartedAt capturedAt captureTimeKind sourceObservedAt window coverage records methodology attribution isExecutableQuote changesGoodsIndex changesHeadlineBenchmark subsetHash')
    if type(dto['schemaVersion']) is not int or dto['schemaVersion']!=1 or dto['kind']!='fixed_nx_item_api_display_subset' or dto['sourceUrl']!='https://maplestory.market/api/prices':_bad('invalid_public_profile')
    if any(type(dto[k]) is not str or not re.fullmatch('[0-9a-f]{64}',dto[k]) for k in ('privateProjectionHash','subsetHash')):_bad('invalid_public_hash')
    capture=_clock(dto['capturedAt']);started=_clock(dto['requestStartedAt'])
    if started>capture or capture>wall_now+300 or dto['captureTimeKind']!='http_response_completed' or dto['sourceObservedAt'] is not None:_bad('invalid_public_clock')
    if dto['window']!=WINDOW or dto['methodology']!=METHOD or dto['attribution']!=ATTRIBUTION or any(dto[k] is not False for k in ('isExecutableQuote','changesGoodsIndex','changesHeadlineBenchmark')):_bad('invalid_public_method')
    # Python bool compares equal to int; validate the window's explicit numeric type.
    if type(dto['window'].get('reportedLookbackDays')) is not int or dto['window']['boundsKnown'] is not False:_bad('invalid_public_method')
    _exact(dto['coverage'],'expected available missingOrInvalid')
    if type(dto['records']) is not list or len(dto['records'])!=29 or len(targets)!=29:_bad('invalid_public_scope')
    ids=set();available=0
    for row in dto['records']:
        _exact(row,'itemId name slug fixedNxCost available saleMedianMesos recordedSalesCount mesosPerNx sourceCreditUrl')
        item=row['itemId'];target=targets.get(item) if type(item) is int else None
        if not target or item in ids or row['name']!=target['name'] or row['slug']!=target['slug'] or type(row['fixedNxCost']) is not int or row['fixedNxCost']!=target['fixedNxCost'] or row['sourceCreditUrl']!=f'https://maplestory.market/items/{item}?ref=v6kkdvp6':_bad('invalid_public_identity')
        ids.add(item)
        if row['available'] is True:
            price=row['saleMedianMesos'];ratio=row['mesosPerNx']
            if type(price) not in (int,float) or not math.isfinite(price) or not 0<price<=2**53-1 or not _integer(row['recordedSalesCount'],5) or type(ratio) not in (int,float) or not math.isfinite(ratio) or ratio!=price/target['fixedNxCost']:_bad('invalid_public_values')
            available+=1
        elif row['available'] is not False or any(row[k] is not None for k in ('saleMedianMesos','recordedSalesCount','mesosPerNx')):_bad('invalid_public_unknown')
    if any(not _integer(dto['coverage'][k]) for k in ('expected','available','missingOrInvalid')) or dto['coverage']!={'expected':29,'available':available,'missingOrInvalid':29-available}:_bad('invalid_public_coverage')
    body={key:value for key,value in dto.items() if key!='subsetHash'}
    if portable_hash(body)!=dto['subsetHash']:_bad('invalid_public_semantic_hash')
    return dto

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

class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def own_site_transport(headers,timeout):
    """No URL parameter, proxy env, cookies, credentials, redirect or retry."""
    if type(headers) is not dict or set(headers)-{'If-None-Match'} or any(type(v) is not str or len(v)>160 or '\r' in v or '\n' in v for v in headers.values()):_bad('invalid_own_site_conditions')
    if type(timeout) not in (int,float) or not math.isfinite(timeout) or not 0<timeout<=TIMEOUT:_bad('invalid_own_site_timeout')
    opener=build_opener(ProxyHandler({}),_NoRedirect())
    request=Request(URL,headers={'Accept':'application/json','User-Agent':'InflationWatch-LocalPreview/1.0 (+https://inflation.gg/)',**headers},method='GET')
    try:response=opener.open(request,timeout=timeout)
    except HTTPError as error:
        with error:return TransportResponse(error.code,dict(error.headers),b'')
    with response:
        status=response.status;metadata=dict(response.headers)
        if status!=200:return TransportResponse(status,metadata,b'')
        value=response.headers.get('Content-Length')
        if value is not None and (not value.isdigit() or int(value)>MAX_BYTES):_bad('own_site_size_bound')
        deadline=time.monotonic()+timeout;chunks=[];size=0
        while True:
            if time.monotonic()>deadline:raise TimeoutError()
            part=response.read1(min(16384,MAX_BYTES+1-size))
            if not part:break
            chunks.append(part);size+=len(part)
            if size>MAX_BYTES:_bad('own_site_size_bound')
        return TransportResponse(200,metadata,b''.join(chunks))

def _header(headers,name):
    return next((str(value) for key,value in headers.items() if key.lower()==name.lower()),None)
def _etag(value):return value if type(value) is str and re.fullmatch(r'"[a-f0-9]{64}"',value) else None
def _iso(value):return dt.datetime.fromtimestamp(value,dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')

class LocalCashReader:
    def __init__(self,root=None,*,targets=None,transport=own_site_transport,monotonic=time.monotonic,wall=time.time,wait_seconds=4):
        if targets is None:
            value=json.loads((Path(root)/'ops/api-cash-bindings-v1.json').read_text(encoding='utf-8'));targets=value['targets']
        if type(targets) is not list or len(targets)!=29:_bad('invalid_fixed_bindings')
        self.targets={row['itemId']:{k:row[k] for k in ('itemId','name','slug','fixedNxCost')} for row in targets}
        if len(self.targets)!=29 or any(not _integer(k,1) or not _integer(v['fixedNxCost'],1) or type(v['name']) is not str or type(v['slug']) is not str for k,v in self.targets.items()):_bad('invalid_fixed_bindings')
        self.transport=transport;self.monotonic=monotonic;self.wall=wall;self.wait_seconds=wait_seconds
        if type(wait_seconds) not in (int,float) or not math.isfinite(wait_seconds) or not 0<wait_seconds<=5:_bad('invalid_wait_bound')
        self.condition=threading.Condition();self.inflight=False;self.raw=None;self.dto=None;self.tag=None;self.remote_tag=None;self.upstream_mode=None
        self.next_due=0;self.checked_at=None;self.last_200_at=None;self.failures=0;self.error=None;self.absent_status=None
    def _refresh(self):
        with self.condition:
            now=self.monotonic()
            if self.inflight:
                if self.raw is not None:return
                self.condition.wait_for(lambda:not self.inflight,timeout=self.wait_seconds);return
            if now<self.next_due:return
            self.inflight=True;conditions={}
            if self.raw is not None:
                if self.remote_tag:conditions['If-None-Match']=self.remote_tag
        error=None;retry=None;absent=None
        try:
            response=self.transport(conditions,TIMEOUT)
            metadata=response.headers
            if response.status==304:
                if self.raw is None or not conditions:_bad('unexpected_own_site_304')
                if _header(metadata,'X-Astra-Cash-Phase')!='published_subset' or _header(metadata,'X-Astra-Cash-Mode') not in ('accepted_cache','retained_last_good') or _header(metadata,'X-Astra-Cash-Captured-At')!=self.dto['capturedAt'] or _header(metadata,'ETag')!=self.remote_tag:_bad('invalid_own_site_304_contract')
                with self.condition:self.upstream_mode=_header(metadata,'X-Astra-Cash-Mode')
            elif response.status==200:
                if (_header(metadata,'Content-Type')or'').split(';',1)[0].strip().lower()!='application/json' or (_header(metadata,'Content-Encoding')or'identity').lower()!='identity':_bad('invalid_own_site_mime')
                dto=validate(response.body,self.targets,wall_now=self.wall())
                if self.dto and (dto['capturedAt']<self.dto['capturedAt'] or dto['capturedAt']==self.dto['capturedAt'] and dto['subsetHash']!=self.dto['subsetHash']):_bad('regressed_own_site_snapshot')
                tag='"'+hashlib.sha256(response.body).hexdigest()+'"'
                if _header(metadata,'X-Astra-Cash-Phase')!='published_subset' or _header(metadata,'X-Astra-Cash-Mode') not in ('accepted_cache','retained_last_good') or _header(metadata,'X-Astra-Cash-Captured-At')!=dto['capturedAt'] or _etag(_header(metadata,'ETag'))!=tag:_bad('invalid_own_site_200_contract')
                with self.condition:
                    self.raw=response.body;self.dto=dto;self.tag=tag;self.remote_tag=_etag(_header(metadata,'ETag'))
                    self.upstream_mode=_header(metadata,'X-Astra-Cash-Mode')
                    self.last_200_at=_iso(self.wall())
            else:
                error='own_site_http_'+str(response.status) if response.status in (301,302,303,307,308,401,403,404,429,500,502,503,504) else 'own_site_http_error'
                if response.status in (401,403,404):
                    absent=response.status
                    with self.condition:
                        self.raw=self.dto=self.tag=self.remote_tag=self.upstream_mode=None
                if response.status==429:
                    value=_header(metadata,'Retry-After')
                    if value:
                        try:retry=float(value) if value.isdigit() else parsedate_to_datetime(value).timestamp()-self.wall()
                        except (ValueError,TypeError,OverflowError):retry=None
        except (TimeoutError,socket.timeout):error='own_site_timeout'
        except Invalid:error='own_site_invalid_snapshot'
        except (OSError,URLError):error='own_site_unavailable'
        except Exception:error='own_site_reader_error'
        finally:
            with self.condition:
                self.checked_at=_iso(self.wall());self.error=error;self.absent_status=absent
                if error:
                    self.failures=min(self.failures+1,8);delay=min(300,30*2**min(self.failures-1,4))
                    if retry is not None and math.isfinite(retry):delay=max(delay,min(3600,max(0,retry)))
                    self.next_due=self.monotonic()+delay
                else:self.failures=0;self.next_due=self.monotonic()+TTL
                self.inflight=False;self.condition.notify_all()
    def handle(self,method,path,headers,*,bind_host='127.0.0.1',client_host='127.0.0.1'):
        try:parsed=urlsplit(path)
        except ValueError:
            raw=b'{"status":"invalid_local_path"}';return LocalResponse(400,{**HEADERS,'Content-Length':str(len(raw))},b'' if method=='HEAD' else raw)
        if parsed.path!=PATH:return None
        common=dict(HEADERS)
        def respond(status,body):
            out=dict(common);out['Content-Length']=str(len(body));return LocalResponse(status,out,b'' if method=='HEAD' else body)
        host=_header(headers,'Host')
        try:
            allowed=ipaddress.ip_address(bind_host).is_loopback and ipaddress.ip_address(client_host).is_loopback
            if host is not None:
                hostname=urlsplit('//'+host).hostname
                allowed=allowed and hostname in ('127.0.0.1','localhost','::1') and '\r' not in host and '\n' not in host
        except ValueError:allowed=False
        if not allowed:return respond(403,b'{"status":"local_only"}')
        if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:return respond(400,b'{"status":"invalid_local_path"}')
        if method not in ('GET','HEAD'):
            common['Allow']='GET, HEAD';return respond(405,b'{"status":"method_not_allowed"}')
        self._refresh()
        with self.condition:
            if self.raw is None:
                common['Retry-After']=str(max(1,math.ceil(self.next_due-self.monotonic())))
                common['X-Local-Cash-State']='not_published' if self.absent_status==404 else 'access_required' if self.absent_status in (401,403) else 'unavailable';return respond(self.absent_status or 503,b'{"status":"not_published"}' if self.absent_status==404 else b'{"status":"access_required"}' if self.absent_status in (401,403) else b'{"status":"local_public_cash_unavailable"}')
            common['ETag']=self.tag;common['X-Local-Cash-State']='stale_last_good' if self.error else 'refreshing_last_good' if self.inflight else 'retained_upstream' if self.upstream_mode=='retained_last_good' else 'cached_verified'
            common['X-Astra-Cash-Phase']='published_subset'
            common['X-Astra-Cash-Mode']='retained_last_good' if self.error or self.inflight or self.upstream_mode=='retained_last_good' else 'accepted_cache'
            common['X-Astra-Cash-Captured-At']=self.dto['capturedAt']
            common['X-Local-Cash-Source-Captured-At']=self.dto['capturedAt']
            if self.checked_at:common['X-Local-Cash-Checked-At']=self.checked_at
            if self.last_200_at:common['X-Local-Cash-Last-200-At']=self.last_200_at
            if self.error:common['X-Local-Cash-Error']=self.error
            incoming=_header(headers,'If-None-Match')
            if incoming and any(v.strip()=='*' or v.strip().removeprefix('W/')==self.tag for v in incoming.split(',')):
                return LocalResponse(304,common,b'')
            return respond(200,self.raw)
