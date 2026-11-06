"""Memory-only fixed own-site NX preview bridge. Never a provider/key/session proxy."""
from dataclasses import dataclass
import calendar
import datetime as dt
from email.utils import parsedate_to_datetime
import hashlib
import ipaddress
import json
import math
import re
import socket
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener, ProxyHandler

URL = 'https://inflation.gg/api-nx-offers.json'
PATH = '/api-nx-offers.json'
MAX_BYTES = 600000
TTL = 60
TIMEOUT = 3
MAX_SAFE = 2**53-1
HISTORY = 'https://maplestory.market/api/nx-rate/history?range=7d&step=hour'
SUMMARY = 'https://maplestory.market/api/nx-rate'
HEADERS = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform',
           'CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'}

class Invalid(ValueError):
    pass

def _bad(code):
    raise Invalid(code)

def _exact(v, fields):
    if type(v) is not dict or set(v) != set(fields.split()):
        _bad('unexpected_public_nx_fields')

def _number(v):
    return type(v) in (int,float) and math.isfinite(v) and abs(v) <= MAX_SAFE

def _integer(v):
    return _number(v) and v >= 0 and int(v) == v

def _eq(v,n):
    return _number(v) and v == n

def _clock(v, kind='clock'):
    pattern = r'(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)' + (r'\.\d{3}Z' if kind=='clock' else 'Z')
    m = re.fullmatch(pattern, v) if type(v) is str else None
    if not m:
        _bad('public_nx_clock')
    year,month,day,hour,minute,second = map(int,m.groups())
    if not 1 <= month <= 12 or not 1 <= day <= calendar.monthrange(year,month)[1] or hour > 23 or minute > 59 or second > 59:
        _bad('public_nx_clock')
    if kind=='hour' and (minute or second):
        _bad('public_nx_hour')
    return v

def _previous_23_hours(anchor):
    # Gregorian year0 is valid in the JS protocol; stdlib datetime cannot express
    # it. At most one calendar day is crossed, including expanded negative year.
    year,month,day,hour = map(int,re.match(r'(\d{4})-(\d\d)-(\d\d)T(\d\d)',anchor).groups())
    hour -= 23
    if hour < 0:
        hour += 24
        day -= 1
        if day == 0:
            month -= 1
            if month == 0:
                year -= 1
                month = 12
            day = calendar.monthrange(year,month)[1]
    y = f'{year:04d}' if year >= 0 else f'-{abs(year):06d}'
    return f'{y}-{month:02d}-{day:02d}T{hour:02d}:00:00Z'

def _decode(raw):
    if type(raw) is not bytes or not 0 < len(raw) <= MAX_BYTES:
        _bad('public_nx_size')
    def pairs(entries):
        value = {}
        for key,child in entries:
            if key in value:
                _bad('duplicate_public_nx_key')
            value[key] = child
        return value
    try:
        result = json.loads(raw.decode('utf-8'),object_pairs_hook=pairs,parse_constant=lambda _: _bad('public_nx_number'))
        nodes = [0]
        def visit(v,depth):
            nodes[0] += 1
            if depth > 16 or nodes[0] > 60000:
                _bad('public_nx_complexity')
            if type(v) is dict:
                if len(v)>64 or any(len(k)>4096 for k in v):
                    _bad('public_nx_object_bound')
                for child in v.values():
                    visit(child,depth+1)
            elif type(v) is list:
                if len(v)>1500:
                    _bad('public_nx_array_bound')
                for child in v:
                    visit(child,depth+1)
            elif type(v) is str:
                if len(v)>4096:
                    _bad('public_nx_string_bound')
            elif type(v) in (int,float) and not _number(v):
                _bad('public_nx_number')
        visit(result,0)
        return result
    except Invalid:
        raise
    except (ValueError,UnicodeError,RecursionError,OverflowError):
        _bad('public_nx_json')

def _positive(v):
    return v is None or _number(v) and v > 0

def _stats(s,native=False):
    if s is None:
        if native:
            return
        _bad('missing_hourly_stats')
    _exact(s,'low median high reportedPosterCount statisticsComplete '+('mode' if native else 'p25 p75'))
    fields = ['low','median','high','mode'] if native else ['low','p25','median','p75','high']
    if not _integer(s['reportedPosterCount']) or not all(_positive(s[k]) for k in fields) or type(s['statisticsComplete']) is not bool:
        _bad('public_nx_stats')
    ordered = [s[k] for k in (['low','median','high'] if native else fields) if s[k] is not None]
    if ordered != sorted(ordered) or s['statisticsComplete'] != all(s[k] is not None for k in fields):
        _bad('public_nx_stat_order')
    if s['reportedPosterCount']==0 and any(s[k] is not None for k in fields):
        _bad('public_nx_zero')

def validate(raw):
    """Parity with the fixed browser r1 parse()+validate() public NX contract."""
    d = _decode(raw)
    _exact(d,'schemaVersion kind methodVersion sourceIdentity unit basis capturedAt sourceObservedAt qualifiedIndividualTrades publicationEligible changesGoodsIndex changesHeadlineBenchmark attribution nativeSummary hourlyHistory derived24')
    if not (_eq(d['schemaVersion'],1) and d['kind']=='nx_offer_display_subset' and _eq(d['methodVersion'],1) and d['sourceIdentity']=='maplestory_market_nx_offers' and d['unit']=='mesos_per_NX' and d['basis']=='advertised_NX_offer_rates_not_completed_sales' and d['sourceObservedAt'] is None and _eq(d['qualifiedIndividualTrades'],0) and all(d[k] is False for k in ('publicationEligible','changesGoodsIndex','changesHeadlineBenchmark'))):
        _bad('public_nx_contract')
    _clock(d['capturedAt'])
    _exact(d['attribution'],'label url')
    if d['attribution']!={'label':'NX offers from maplestory.market','url':'https://maplestory.market/?ref=v6kkdvp6'}:
        _bad('public_nx_attribution')
    native = d['nativeSummary']
    if native is not None:
        _exact(native,'sourceUrl capturedAt reportedWindowHours actualWindowStart actualWindowEnd sourceLastHeardAt sourceLimited buy sell')
        _clock(native['capturedAt'])
        if native['sourceLastHeardAt'] is not None:
            _clock(native['sourceLastHeardAt'],'source')
        if native['sourceUrl']!=SUMMARY or native['capturedAt']>d['capturedAt'] or not _integer(native['reportedWindowHours']) or not 0 < native['reportedWindowHours'] <= 8784 or native['actualWindowStart'] is not None or native['actualWindowEnd'] is not None or type(native['sourceLimited']) is not bool:
            _bad('public_nx_native')
        _stats(native['buy'],True)
        _stats(native['sell'],True)
    h = d['hourlyHistory']
    _exact(h,'sourceUrl bucketCompletionKnown maxSelectedHours totalRetainedSourceHourSideRows omittedRetainedSourceHourSideRows rows')
    if h['sourceUrl']!=HISTORY or h['bucketCompletionKnown'] is not False or not _eq(h['maxSelectedHours'],744) or not _integer(h['totalRetainedSourceHourSideRows']) or not _integer(h['omittedRetainedSourceHourSideRows']) or type(h['rows']) is not list or len(h['rows'])>1488 or h['totalRetainedSourceHourSideRows']!=len(h['rows'])+h['omittedRetainedSourceHourSideRows']:
        _bad('public_nx_history')
    previous = ''
    for row in h['rows']:
        _exact(row,'at side capturedAt sourceObservedAt low median high p25 p75 reportedPosterCount statisticsComplete')
        _clock(row['at'],'hour')
        _clock(row['capturedAt'])
        if row['side'] not in ('buy','sell') or row['capturedAt']>d['capturedAt'] or row['sourceObservedAt'] is not None or row['at']+'|'+row['side']<=previous:
            _bad('public_nx_hour_context')
        previous = row['at']+'|'+row['side']
        _stats({k:v for k,v in row.items() if k not in ('at','side','capturedAt','sourceObservedAt')})
    derived = d['derived24']
    _exact(derived,'kind hours anchorSourceHourLabel firstSelectedSourceHourLabel sides quantileMethod counts bucketCompletionKnown')
    anchor = h['rows'][-1]['at'] if h['rows'] else None
    first = _previous_23_hours(anchor) if anchor else None
    if derived['kind']!='derived_published_hourly_histogram_pool' or not _eq(derived['hours'],24) or derived['quantileMethod']!='linear_interpolation_ordered_frequency_bins' or derived['counts']!='poster_hour_observations_not_unique_people_or_trades' or derived['bucketCompletionKnown'] is not False or derived['anchorSourceHourLabel']!=anchor or derived['firstSelectedSourceHourLabel']!=first:
        _bad('public_nx_derived')
    _exact(derived['sides'],'buy sell')
    for side in ('buy','sell'):
        value = derived['sides'][side]
        _exact(value,'p25 median p75 posterHourObservations availableHourBuckets missingHourBuckets')
        ordered = [value[k] for k in ('p25','median','p75') if value[k] is not None]
        if not all(_positive(value[k]) for k in ('p25','median','p75')) or ordered!=sorted(ordered):
            _bad('public_nx_derived_rates')
        rows = [r for r in h['rows'] if r['side']==side and r['at']>=first] if anchor else []
        count = sum(r['reportedPosterCount'] for r in rows)
        if not _integer(count) or not _eq(value['availableHourBuckets'],len(rows)) or not _eq(value['missingHourBuckets'],24-len(rows)) or (value['posterHourObservations'] is not None if not rows else not _eq(value['posterHourObservations'],count)):
            _bad('public_nx_derived_counts')
        if count==0 and any(value[k] is not None for k in ('p25','median','p75')):
            _bad('public_nx_empty_pool')
    return d

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
    def redirect_request(self,*args,**kwargs):
        return None

def own_site_transport(headers,timeout):
    """Literal anonymous own-site GET only: no proxy/cookie/auth/redirect/retry."""
    if type(headers) is not dict or set(headers)-{'If-None-Match'} or any(type(v) is not str or len(v)>160 or '\r' in v or '\n' in v for v in headers.values()):
        _bad('invalid_own_site_conditions')
    if type(timeout) not in (int,float) or not math.isfinite(timeout) or not 0<timeout<=TIMEOUT:
        _bad('invalid_own_site_timeout')
    opener = build_opener(ProxyHandler({}),_NoRedirect())
    request = Request(URL,headers={'Accept':'application/json','Accept-Encoding':'identity','User-Agent':'InflationWatch-LocalPreview/1.0 (+https://inflation.gg/)',**headers},method='GET')
    deadline = time.monotonic()+timeout
    try:
        response = opener.open(request,timeout=timeout)
    except HTTPError as error:
        with error:
            return TransportResponse(error.code,dict(error.headers),b'')
    with response:
        metadata = dict(response.headers)
        if response.status!=200:
            return TransportResponse(response.status,metadata,b'')
        value = response.headers.get('Content-Length')
        if value is not None and (not value.isdigit() or int(value)>MAX_BYTES):
            _bad('own_site_size_bound')
        chunks = []
        total = 0
        while True:
            if time.monotonic()>deadline:
                raise TimeoutError()
            part = response.read1(min(16384,MAX_BYTES+1-total))
            if not part:
                break
            chunks.append(part)
            total += len(part)
            if total>MAX_BYTES:
                _bad('own_site_size_bound')
        return TransportResponse(200,metadata,b''.join(chunks))

def _header(headers,name):
    return next((str(v) for k,v in headers.items() if k.lower()==name.lower()),None)

def _iso(now):
    return dt.datetime.fromtimestamp(now,dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')

class LocalNxReader:
    def __init__(self,*,transport=own_site_transport,monotonic=time.monotonic,wall=time.time,wait_seconds=4):
        if type(wait_seconds) not in (int,float) or not math.isfinite(wait_seconds) or not 0<wait_seconds<=5:
            _bad('invalid_wait_bound')
        self.transport,self.monotonic,self.wall,self.wait_seconds = transport,monotonic,wall,wait_seconds
        self.condition = threading.Condition()
        self.inflight = False
        self.raw = self.dto = self.tag = self.remote_tag = self.upstream_mode = None
        self.next_due = 0
        self.checked_at = self.error = self.absent_status = None
        self.failures = 0

    def _refresh(self):
        with self.condition:
            if self.inflight:
                if self.raw is None:
                    self.condition.wait_for(lambda:not self.inflight,timeout=self.wait_seconds)
                return
            if self.monotonic()<self.next_due:
                return
            self.inflight = True
            conditions = {'If-None-Match':self.remote_tag} if self.raw is not None and self.remote_tag else {}
        error = retry = absent = None
        try:
            response = self.transport(conditions,TIMEOUT)
            headers = dict(response.headers)
            if response.status==304:
                if self.raw is None or not conditions or _header(headers,'X-Astra-NX-Phase')!='published_offer_subset' or _header(headers,'X-Astra-NX-Mode') not in ('accepted_cache','retained_last_good') or _header(headers,'X-Astra-NX-Captured-At')!=self.dto['capturedAt'] or _header(headers,'ETag')!=self.remote_tag:
                    _bad('invalid_own_site_304')
                with self.condition:
                    self.upstream_mode = _header(headers,'X-Astra-NX-Mode')
            elif response.status==200:
                if (_header(headers,'Content-Type')or'').split(';',1)[0].strip().lower()!='application/json' or (_header(headers,'Content-Encoding')or'identity').lower()!='identity':
                    _bad('invalid_own_site_mime')
                value = validate(response.body)
                tag = '"'+hashlib.sha256(response.body).hexdigest()+'"'
                if self.dto is not None and value['capturedAt']<self.dto['capturedAt']:
                    _bad('regressed_own_site_capture')
                if _header(headers,'X-Astra-NX-Phase')!='published_offer_subset' or _header(headers,'X-Astra-NX-Mode') not in ('accepted_cache','retained_last_good') or _header(headers,'X-Astra-NX-Captured-At')!=value['capturedAt'] or _header(headers,'ETag')!=tag:
                    _bad('invalid_own_site_200')
                with self.condition:
                    self.raw,self.dto,self.tag,self.remote_tag = response.body,value,tag,tag
                    self.upstream_mode = _header(headers,'X-Astra-NX-Mode')
            else:
                error = 'own_site_http_'+str(response.status) if response.status in (301,302,303,307,308,401,403,404,429,500,502,503,504) else 'own_site_http_error'
                if response.status in (401,403,404):
                    absent = response.status
                    with self.condition:
                        self.raw = self.dto = self.tag = self.remote_tag = self.upstream_mode = None
                if response.status==429:
                    v = _header(headers,'Retry-After')
                    if v:
                        try:
                            retry = float(v) if v.isdigit() else parsedate_to_datetime(v).timestamp()-self.wall()
                        except (ValueError,TypeError,OverflowError):
                            pass
        except (TimeoutError,socket.timeout):
            error = 'own_site_timeout'
        except Invalid:
            error = 'own_site_invalid_snapshot'
        except (OSError,URLError):
            error = 'own_site_unavailable'
        except Exception:
            error = 'own_site_reader_error'
        finally:
            with self.condition:
                self.checked_at,self.error,self.absent_status = _iso(self.wall()),error,absent
                if absent is not None:
                    self.failures = 0
                    delay = TTL
                elif error:
                    self.failures = min(self.failures+1,8)
                    delay = min(300,30*2**min(self.failures-1,4))
                    if retry is not None and math.isfinite(retry):
                        delay = max(delay,min(3600,max(0,retry)))
                else:
                    self.failures = 0
                    delay = TTL
                self.next_due = self.monotonic()+delay
                self.inflight = False
                self.condition.notify_all()

    def handle(self,method,path,headers,*,bind_host='127.0.0.1',client_host='127.0.0.1'):
        try:
            parsed = urlsplit(path)
        except ValueError:
            body = b'{"status":"invalid_local_path"}'
            return LocalResponse(400,{**HEADERS,'Content-Length':str(len(body))},b'' if method=='HEAD' else body)
        if parsed.path!=PATH:
            return None
        common = dict(HEADERS)
        def respond(status,body):
            out = {**common,'Content-Length':str(len(body))}
            return LocalResponse(status,out,b'' if method=='HEAD' else body)
        host = _header(headers,'Host')
        try:
            h = urlsplit('//'+host) if host is not None and '\r' not in host and '\n' not in host else None
            allowed = ipaddress.ip_address(bind_host).is_loopback and ipaddress.ip_address(client_host).is_loopback and h is not None and h.hostname in ('127.0.0.1','localhost','::1') and h.username is None and h.password is None and not h.path and not h.query and not h.fragment and (h.port is None or 0<h.port<=65535)
        except (ValueError,TypeError):
            allowed = False
        if not allowed:
            return respond(403,b'{"status":"local_only"}')
        if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
            return respond(400,b'{"status":"invalid_local_path"}')
        if method not in ('GET','HEAD'):
            common['Allow'] = 'GET, HEAD'
            return respond(405,b'{"status":"method_not_allowed"}')
        self._refresh()
        with self.condition:
            if self.raw is None:
                status = self.absent_status or 503
                common['Retry-After'] = str(max(1,math.ceil(self.next_due-self.monotonic())))
                common['X-Local-NX-State'] = 'not_published' if status==404 else 'access_required' if status in (401,403) else 'unavailable'
                return respond(status,b'{"status":"not_published"}' if status==404 else b'{"status":"access_required"}' if status in (401,403) else b'{"status":"local_public_nx_unavailable"}')
            retained = bool(self.error or self.inflight or self.upstream_mode=='retained_last_good')
            common.update({'ETag':self.tag,'X-Local-NX-State':'retained_last_good' if retained else 'cached_verified','X-Astra-NX-Phase':'published_offer_subset','X-Astra-NX-Mode':'retained_last_good' if retained else 'accepted_cache','X-Astra-NX-Captured-At':self.dto['capturedAt'],'X-Local-NX-Source-Captured-At':self.dto['capturedAt']})
            if self.checked_at:
                common['X-Local-NX-Checked-At'] = self.checked_at
            if self.error:
                common['X-Local-NX-Error'] = self.error
            incoming = _header(headers,'If-None-Match')
            if incoming and any(v.strip()=='*' or v.strip().removeprefix('W/')==self.tag for v in incoming.split(',')):
                return LocalResponse(304,common,b'')
            return respond(200,self.raw)
