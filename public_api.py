"""Server-only transport for the provider's documented public API.

No browser cookies, session tokens, or challenge tokens are used. A provider key
must be supplied in the process environment after the provider approves it.
"""
import datetime as dt
import contextlib
import email.utils
import hashlib
import json
import os
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ALLOWED_PATHS={'/api/prices','/api/status'}
USER_AGENT='InflationWatch/0.3 (+https://inflation.gg/; https://github.com/dizzyvinci/inflation-watch-astra)'
COOLDOWN_SECONDS=600  # Documented default; proposed limits are not granted limits.
REFRESH_LOCK=threading.Lock()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,request,fp,code,msg,headers,newurl):
        # Do not forward a provider Bearer key to any redirected location.
        return None


def open_request(request,timeout):
    return urllib.request.build_opener(NoRedirect()).open(request,timeout=timeout)


@contextlib.contextmanager
def collector_lock(path):
    """Nonblocking cross-process lock, held across cache check/request/write."""
    path.parent.mkdir(parents=True,exist_ok=True)
    handle=path.open('a+b');locked=False
    try:
        if os.name=='nt':
            import msvcrt
            if path.stat().st_size==0:handle.write(b'0');handle.flush()
            handle.seek(0)
            try:msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1);locked=True
            except OSError:pass
        else:
            import fcntl
            try:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB);locked=True
            except BlockingIOError:pass
        yield locked
    finally:
        if locked:
            if os.name=='nt':
                handle.seek(0);msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1)
            else:fcntl.flock(handle,fcntl.LOCK_UN)
        handle.close()


class PublicMarketClient:
    def __init__(self,key=None):
        self.key=key if key is not None else os.environ.get('MAPLESTORY_MARKET_API_KEY')
        self.next_allowed_at=0
        self.denied=False
        self.lock=threading.Lock()

    def get(self,path):
        if path not in ALLOWED_PATHS:raise ValueError('Only the reviewed public aggregate routes are allowed')
        if not self.key:return {'status':'requires_api_key','detail':'Public API requires an admin-approved key; no request made.'}
        with self.lock:
            if self.denied:return {'status':'authentication_denied','detail':'Waiting for a valid key; automatic retries stopped.'}
            if time.time()<self.next_allowed_at:return {'status':'backoff','retryAt':self.next_allowed_at}
            request=urllib.request.Request('https://maplestory.market'+path,headers={'User-Agent':USER_AGENT,'Authorization':'Bearer '+self.key,'Accept':'application/json'})
            try:
                with open_request(request,timeout=20) as response:
                    body=response.read(5_000_001)
                    if len(body)>5_000_000:raise ValueError('Oversized public API response')
                    payload=json.loads(body)
                    if not isinstance(payload,(dict,list)):raise ValueError('Invalid public API response')
                    # Default budget is six requests/hour. Alternate the two
                    # aggregate routes rather than assume a higher allowance.
                    self.next_allowed_at=time.time()+600
                    return {'status':'received','path':path,'capturedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),'payload':payload}
            except urllib.error.HTTPError as error:
                if error.code in (401,403):
                    self.denied=True
                    return {'status':'authentication_denied','httpStatus':error.code,'detail':'Key missing/rejected or scope unavailable; automatic retries stopped.'}
                if error.code==429:
                    retry=(error.headers or {}).get('Retry-After','600')
                    try:wait=max(600,int(retry))
                    except ValueError:
                        try:wait=max(600,email.utils.parsedate_to_datetime(retry).timestamp()-time.time())
                        except Exception:wait=600
                    self.next_allowed_at=time.time()+wait
                    return {'status':'rate_limited','httpStatus':429,'retryAt':self.next_allowed_at}
                self.next_allowed_at=time.time()+600
                return {'status':'unavailable','httpStatus':error.code}
            except Exception as error:
                self.next_allowed_at=time.time()+600
                return {'status':'unavailable','detail':type(error).__name__}


CLIENT=PublicMarketClient()


def refresh(root):
    # A busy caller does not rewrite status, payload or another caller's lease.
    if not REFRESH_LOCK.acquire(blocking=False):return {'status':'collector_busy','detail':'Another local API refresh is already in progress.'}
    try:
        with collector_lock(Path(root)/'incoming'/'provider-api.lock') as acquired:
            if not acquired:return {'status':'collector_busy','detail':'Another process owns the local API collector.'}
            return _refresh_locked(root)
    finally:REFRESH_LOCK.release()


def _refresh_locked(root):
    from engine import atomic,read
    root=Path(root)
    previous=read(root/'cache'/'public-api-status.json',{})
    # This control file is private, never report payload or public export.
    control_path=root/'cache'/'provider-api-control.json'
    control=read(control_path,{})
    key_id=hashlib.sha256(CLIENT.key.encode()).hexdigest() if CLIENT.key else None
    if key_id and control.get('authenticationDeniedKeyId')==key_id:
        return {**previous,'status':'authentication_denied','detail':'This key was rejected; automatic retries remain stopped across restarts. Supply a different approved key and restart.'}
    next_allowed=max(previous.get('nextAllowedAt',0),control.get('nextAllowedAt',0))
    if time.time()<next_allowed:
        return {**previous,'status':'backoff','nextAllowedAt':next_allowed}
    last_path=previous.get('lastSuccessfulPath')
    path='/api/status' if last_path=='/api/prices' else '/api/prices'
    if CLIENT.key:
        # Reserve the default-budget slot before I/O, including a process crash.
        control['nextAllowedAt']=time.time()+COOLDOWN_SECONDS
        atomic(control_path,control)
    result=CLIENT.get(path)
    if result['status']=='received':
        # Keep raw aggregate payload out of dist until its actual provider
        # schema is verified. A successful HTTP call alone cannot alter CPI.
        atomic(root/'cache'/('provider-prices.json' if path=='/api/prices' else 'provider-status.json'),result)
        status={k:v for k,v in result.items() if k!='payload'}
        status['lastSuccessfulPath']=path
        status['detail']='Transport connected. Provider schema must be verified before this payload enters any chart.'
    else:status={**result,'path':path,'lastSuccessfulPath':last_path,'checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')}
    status['nextAllowedAt']=max(CLIENT.next_allowed_at,time.time()+600 if result['status']=='authentication_denied' else 0)
    if CLIENT.key:
        control['nextAllowedAt']=max(control.get('nextAllowedAt',0),status['nextAllowedAt'])
        if result['status']=='authentication_denied':control['authenticationDeniedKeyId']=key_id
        elif result['status']=='received':control.pop('authenticationDeniedKeyId',None)
        atomic(control_path,control)
    atomic(root/'cache'/'public-api-status.json',status)
    return status
