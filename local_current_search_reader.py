"""Explicit loopback forward-only identity-v2/ordered-FAST parity.

No second data cache/order engine: the accepted browser clients own atomic
collection, retained evidence and tombstones. No provider, raw receipt or disk
payload cache. Only the existing RAM OwnSiteSession may attach transport.
"""
from dataclasses import dataclass
import base64,hashlib,json,math,os,re,subprocess,threading,time
from pathlib import Path
from urllib.parse import urlsplit
from local_own_site_session import AuthenticationUnavailable,local_request_allowed,reader_response
PREFIX='/api-search-identities/v2/'
REQUEST='X-Astra-Request-Item-Protocol'
FAST='fast-current-v1'
FORWARD_HEADERS={'etag','content-type','x-astra-preview'}|{'x-astra-api-item-'+x for x in ['protocol','epoch','publication','binding','mode','captured-at','generation']}|{'x-astra-search-identity-'+x for x in ['protocol','epoch','revision','index','binding','mode','object']}
BASE={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'}
class Invalid(ValueError):pass
def need(v):
 if not v:raise Invalid('invalid_local_current_search')
def unique(pairs):
 out={}
 for k,v in pairs:need(k not in out);out[k]=v
 return out
def configuration(text):
 if text is None:return None
 try:
  need(type(text)is str and len(text.encode('utf8'))<=1024)
  v=json.loads(text,object_pairs_hook=unique,parse_constant=lambda _:need(False))
  if type(v)is dict and v=={'enabled':False} and type(v.get('enabled'))is bool:return None
  need(type(v)is dict and set(v)=={'schemaVersion','enabled','profile','identityEpoch','fastEpoch'})
  need(type(v['schemaVersion'])is int and v['schemaVersion']==2 and v['enabled']is True and v['profile']=='price_free_owned_membership_v2')
  for k in ['identityEpoch','fastEpoch']:need(type(v[k])is str and re.fullmatch('[a-z][a-z0-9-]{0,63}',v[k])is not None)
  return v
 except(ValueError,TypeError,OverflowError):return None
def route(path):
 need(type(path)is str and 0<len(path)<=250 and '%'not in path and '\\'not in path)
 u=urlsplit(path);need(not u.scheme and not u.netloc and not u.fragment)
 if path==PREFIX+'manifest.json':return{'kind':'manifest','path':path,'limit':65536}
 m=re.fullmatch(r'/api-search-identities/v2/([a-f0-9]{64})\.json',path)
 if m:return{'kind':'page','path':path,'pageHash':m[1],'limit':131072}
 m=re.fullmatch(r'/api-item-prices/([1-9][0-9]{0,8})\.json(?:\?generation=([a-f0-9]{64}))?',path)
 need(m is not None);return{'kind':'fast','path':path,'itemId':int(m[1]),'wanted':m[2],'limit':300000}
def headers(value):
 need(callable(getattr(value,'items',None)))
 pairs=list(value.raw_items()if callable(getattr(value,'raw_items',None))else value.items());need(len(pairs)<=100)
 out={};total=0
 for k,v in pairs:
  need(type(k)is str and type(v)is str and len(k)<=128 and len(v)<=8192 and '\r'not in k+v and '\n'not in k+v)
  total+=len(k.encode('utf8'))+len(v.encode('utf8'));need(total<=65536 and k.lower()not in out);out[k.lower()]=v
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
def validate(raw,context,*,root,timeout):
 need(type(raw)is bytes and len(raw)<=300000)
 packet=json.dumps({**context,'raw':base64.b64encode(raw).decode('ascii'),'rawBytes':len(raw)},separators=(',',':')).encode();need(len(packet)<=1048576)
 try:
  result=subprocess.run(['node',str(Path(__file__).with_name('local-current-search-validate.mjs')),str(Path(root).resolve())],input=packet,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,env={k:os.environ[k]for k in ['PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP']if k in os.environ},creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)if os.name=='nt'else 0)
  need(result.returncode==0 and 0<len(result.stdout)<=64);value=json.loads(result.stdout,object_pairs_hook=unique,parse_constant=lambda _:need(False));need(type(value)is dict and set(value)=={'valid'}and value['valid']is True);return True
 except(OSError,subprocess.TimeoutExpired,ValueError):raise Invalid('invalid_local_current_search')from None
def inject_local_availability(raw,cfg):
 need(type(raw)is bytes and len(raw)<=2000000)
 if cfg is not None:
  need(type(cfg)is dict and set(cfg)=={'schemaVersion','enabled','profile','identityEpoch','fastEpoch'} and type(cfg['schemaVersion'])is int and cfg['schemaVersion']==2 and cfg['enabled']is True and cfg['profile']=='price_free_owned_membership_v2')
  for key in ['identityEpoch','fastEpoch']:need(type(cfg[key])is str and re.fullmatch('[a-z][a-z0-9-]{0,63}',cfg[key])is not None)
 if cfg is None and not any(x in raw for x in [b'data-search-identity-',b'data-fast-item-epoch']):return raw
 matches=list(re.finditer(rb'<body\b[^>]*>',raw,re.I));need(len(matches)==1);m=matches[0];tag=m.group()
 added=bool(re.search(rb'\sdata-search-identity-added-availability="true"',tag,re.I))
 for name in ['search-identity-profile','search-identity-enabled','search-identity-epoch','fast-item-epoch','search-identity-added-availability']:
  tag=re.sub(rb'\sdata-'+name.encode()+rb'\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+)',b'',tag,flags=re.I)
 if added:tag=re.sub(rb'\sdata-item-api-preview\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+)',b'',tag,flags=re.I)
 if cfg is not None:
  # Availability UX only. Existing control/status/session authority is untouched.
  existing=list(re.finditer(rb'\sdata-item-api-preview\s*=\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\s>]+))',tag,re.I));need(len(existing)<=1)
  if existing:need(next(v for v in existing[0].groups()if v is not None)==b'available')
  extra=''if existing else' data-item-api-preview="available" data-search-identity-added-availability="true"'
  tag=tag[:-1]+(extra+' data-search-identity-profile="price_free_owned_membership_v2" data-search-identity-enabled="true" data-search-identity-epoch="'+cfg['identityEpoch']+'" data-fast-item-epoch="'+cfg['fastEpoch']+'">').encode()
 return raw[:m.start()]+tag+raw[m.end():]
class LocalCurrentSearchReader:
 def __init__(self,root=None,*,config=lambda:None,transport=unavailable_transport,validator=None,monotonic=time.monotonic,wall=time.time,max_flights=4,max_waiters=32):
  need(callable(config)and callable(transport)and type(max_flights)is int and 1<=max_flights<=4 and type(max_waiters)is int and 1<=max_waiters<=32)
  self.root=Path(root or Path(__file__).parent);self.config=config;self.transport=transport;self.validator=validator or(lambda raw,ctx,timeout:validate(raw,ctx,root=self.root,timeout=timeout));self.clock=monotonic;self.wall=wall;self.authority=lambda:(False,0);self.cv=threading.Condition();self.flights={};self.waiters=0;self.epoch=0;self.profile_signature=None;self.max_flights=max_flights;self.max_waiters=max_waiters
 def profile(self):
  try:value=configuration(self.config())
  except Exception:value=None
  signature=json.dumps(value,sort_keys=True,separators=(',',':'))if value is not None else None
  with self.cv:
   if signature!=self.profile_signature:self.epoch+=1;self.profile_signature=signature
  return value
 def _auth(self):
  try:
   state=self.authority();need(type(state)is tuple and len(state)==2 and type(state[0])is bool and type(state[1])is int and 0<=state[1]<=2**53-1);return state
  except Exception:return(False,-1)
 def available(self):
  try:return self.profile()if self._auth()[0]is True else None
  except Exception:return None
 def _context(self):
  cfg=self.profile();return(cfg,self._auth(),self.epoch)
 def _response(self,status,code):
  raw=json.dumps({'error':code,'sourceObservedAt':None},separators=(',',':')).encode();return LocalResponse(status,{**BASE,'Content-Length':str(len(raw))},raw)
 def _read(self,r,condition,cfg):
  context=self._context()
  if context[0]!=cfg:return self._response(503,'local_profile_changed')
  if context[1][0]is not True:return self._response(401,'own_site_access_unavailable')
  start=self.clock()
  if type(start)not in(int,float)or not math.isfinite(start):return self._response(503,'local_deadline_unavailable')
  key=(r['path'],condition,cfg['identityEpoch'],cfg['fastEpoch'],context[1],context[2]);deadline=start+6
  with self.cv:
   if any(j['epoch']!=context[2]for j in self.flights.values()):return self._response(503,'prior_local_epoch_pending')
   job=self.flights.get(key)
   if job is not None:
    if self.waiters>=self.max_waiters:return self._response(503,'local_reader_capacity')
    self.waiters+=1
    try:self.cv.wait_for(lambda:job['done']or self._context()!=context,timeout=4)
    finally:self.waiters-=1
    return job['value']if job['done']and self._context()==context else self._response(503,'local_reader_pending')
   if len(self.flights)>=self.max_flights:return self._response(503,'local_reader_capacity')
   job={'done':False,'value':None,'epoch':context[2]};self.flights[key]=job
  value=self._response(503,'local_current_reference_unavailable');declared_withdrawal=False
  try:
   conditions={'If-None-Match':condition}if condition is not None else{}
   if r['kind']=='fast':conditions[REQUEST]=FAST
   need(self._context()==context and self.clock()<deadline)
   source=self.transport(r['path'],conditions,3);status=source.status;need(type(status)is int);h=headers(source.headers)
   if status not in(401,403):need(self._context()==context and self.clock()<deadline)
   if status==404 and r['kind']=='fast' and h.get('x-astra-api-item-protocol')==FAST and h.get('x-astra-api-item-epoch')==cfg['fastEpoch']:declared_withdrawal=True
   if status in(401,403):value=self._response(401,'own_site_access_unavailable')
   elif status in(200,304)or r['kind']=='fast'and status in(404,409):
    need(h.get('x-astra-preview')=='password')
    need(type(source.body)is bytes and len(source.body)<=(4096 if status in(404,409)else r['limit']))
    need(h.get('content-encoding','identity').lower()=='identity')
    if status!=304:need(h.get('content-type','').split(';')[0].strip().lower()=='application/json')
    length=h.get('content-length');need(length is None or length.isdigit()and(status==304 or int(length)==len(source.body)))
    if status==304:need(condition is not None and source.body==b'')
    left=deadline-self.clock();need(left>0)
    need(self.validator(source.body,{'status':status,'route':r,'headers':h,'condition':condition,'identityEpoch':cfg['identityEpoch'],'fastEpoch':cfg['fastEpoch'],'wallNow':math.floor(self.wall()*1000)},min(3,left))is True)
    need(self._context()==context and self.clock()<deadline)
    kept={k:v for k,v in h.items()if k in FORWARD_HEADERS}
    if status in(404,409)and kept.get('x-astra-api-item-mode')not in('validated_cache','retained'):kept.pop('x-astra-api-item-mode',None)
    kept.update({k.lower():v for k,v in BASE.items()});kept['X-Local-Current-Reference-State']='typed_forward_only'
    if status!=304:kept['Content-Length']=str(len(source.body))
    value=LocalResponse(status,kept,source.body)
   elif status==404:value=self._response(404,'not_published')
  except AuthenticationUnavailable as e:value=self._response(401 if e.status in(401,403)else 503,'own_site_access_unavailable')
  except Exception:
   value=self._response(404 if declared_withdrawal else 503,'local_current_reference_unavailable')
   if declared_withdrawal:value.headers.update({'X-Astra-API-Item-Protocol':FAST,'X-Astra-API-Item-Epoch':cfg['fastEpoch'],'X-Local-Current-Reference-State':'declared_withdrawal_body_unavailable'})
  finally:
   with self.cv:
    if self._context()!=context:value=self._response(401 if value.status in(401,403)or self._auth()!=context[1]else 503,'local_reader_revoked')
    job['value']=value;job['done']=True
    if self.flights.get(key)is job:del self.flights[key]
    self.cv.notify_all()
  return value
 def handle(self,method,path,request_headers,*,bind_host='127.0.0.1',client_host='127.0.0.1',port=8765):
  try:u=urlsplit(path)
  except(ValueError,TypeError):return None
  preference=request_headers.get(REQUEST)
  if not u.path.startswith(PREFIX)and not(u.path.startswith('/api-item-prices/')and preference is not None):return None
  def response(status,code):return self._response(status,code)
  if not local_request_allowed(request_headers,bind_host,client_host,port,origin_proof=False):result=response(403,'local_only')
  elif method not in('GET','HEAD'):result=response(405,'method_not_allowed');result.headers['Allow']='GET, HEAD'
  else:
   try:
    if callable(getattr(request_headers,'get_all',None)):
     for key in [REQUEST,'If-None-Match']:need(len(request_headers.get_all(key,[]))<=1)
    r=route(path);need(r['kind']!='fast'or preference==FAST);condition=request_headers.get('If-None-Match');need(condition is None or type(condition)is str and len(condition)<=160 and '\r'not in condition and '\n'not in condition)
    cfg=self.profile()
    if cfg is None:result=response(404,'not_published')
    elif self._auth()[0]is not True:result=response(401,'own_site_access_unavailable')
    else:result=self._read(r,condition,cfg)
   except Exception:result=response(400,'invalid_local_path')
  return LocalResponse(result.status,result.headers,b''if method=='HEAD'or result.status==304 else result.body)
def attach_current_search_reader(session,reader):
 need(isinstance(reader,LocalCurrentSearchReader))
 if not session.enabled:return False
 def transport(path,conditions,timeout):
  response=reader_response(session,path,conditions,timeout,TransportResponse)
  if response.status in(200,304,404,409)and response.headers.get('x-astra-preview')!='password':raise AuthenticationUnavailable(401)
  return response
 reader.transport=transport;reader.authority=lambda:(session.enabled,session.epoch);return True
