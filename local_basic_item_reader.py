"""Default-Off loopback Basic cache. Only the existing RAM OwnSiteSession transports.

No public/provider transport, credentials, disk payload cache, subprocess or poller.
Local HEAD validates the same bounded GET representation and then omits its body.
"""
from collections import OrderedDict
from dataclasses import dataclass
import hashlib
import json
import math
import re
import threading
import time

from local_own_site_session import OwnSiteSession, AuthenticationUnavailable, local_request_allowed, reader_response

PREFIX = '/api-basic-item-prices/'
PROFILE = PREFIX + 'profile.json'
REQUEST = 'X-Astra-Request-Basic-Protocol'
PROTOCOL = 'basic-aggregate-v1'
DEFINITION = '3d7f8257dda8568ab99e743a4e6adee8ca911786528b5e56919d65675a724705'
MAX_SAFE = 9007199254740991
BASE = {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store, no-transform',
        'CDN-Cache-Control': 'no-store', 'Cloudflare-CDN-Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive'}
FORWARD = {'etag'} | {'x-astra-basic-' + x for x in
    ['protocol', 'definition', 'epoch', 'revision', 'generation', 'captured-at', 'body-sha256',
     'mode', 'verification', 'body-verification']}
HASH = re.compile(r'[a-f0-9]{64}')
PUBLIC_EPOCH = re.compile(r'[a-z0-9][a-z0-9-]{7,95}')


class Invalid(ValueError):
    def __init__(self): super().__init__('invalid_local_basic_reference')


def need(value):
    if not value: raise Invalid()


def integer(value, low=0, high=MAX_SAFE):
    if type(value) is int: return low <= value <= high
    return type(value) is float and math.isfinite(value) and low <= value <= high and value.is_integer()


def unique(pairs):
    out = {}
    for key, value in pairs:
        need(key not in out)
        out[key] = value
    return out


def decoded(raw, limit):
    need(type(raw) is bytes and 0 < len(raw) <= limit)
    try:
        return json.loads(raw.decode('utf-8-sig', errors='strict'), object_pairs_hook=unique,
                          parse_constant=lambda _: need(False))
    except (ValueError, UnicodeError, RecursionError, OverflowError):
        raise Invalid() from None


def exact(value, fields):
    need(type(value) is dict and set(value) == set(fields))


def stamp(value):
    """Canonical ECMAScript ISO milliseconds, including year0/extended years."""
    need(type(value) is str)
    m = re.fullmatch(r'([0-9]{4}|[+-][0-9]{6})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.([0-9]{3})Z', value)
    need(m is not None)
    year, month, day, hour, minute, second, milli = map(int, m.groups())
    if len(m[1]) != 4: need(year < 0 or year > 9999)
    need(1 <= month <= 12 and 0 <= hour < 24 and 0 <= minute < 60 and 0 <= second < 60)
    leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    need(1 <= day <= [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    y = year - (month <= 2); era = y // 400; yo = y - era * 400
    mp = month - 3 if month > 2 else month + 9
    days = era * 146097 + yo * 365 + yo // 4 - yo // 100 + (153 * mp + 2) // 5 + day - 1 - 719468
    ms = days * 86400000 + hour * 3600000 + minute * 60000 + second * 1000 + milli
    need(abs(ms) <= 8640000000000000)
    return ms


def configuration(text):
    if text is None: return None
    try:
        need(type(text) is str and len(text.encode('utf-8')) <= 1024)
        v = decoded(text.encode('utf-8'), 1024)
        if type(v) is dict and v == {'enabled': False} and type(v.get('enabled')) is bool: return None
        exact(v, ['schemaVersion', 'enabled', 'profile', 'publicEpoch'])
        need(integer(v['schemaVersion'], 1, 1) and v['enabled'] is True and v['profile'] == 'basic_aggregate_v1')
        need(type(v['publicEpoch']) is str and PUBLIC_EPOCH.fullmatch(v['publicEpoch']) is not None)
        return v
    except (Invalid, TypeError, ValueError, OverflowError): return None


def route(path):
    need(type(path) is str and len(path) <= 250 and '%' not in path and '\\' not in path)
    if path == PROFILE: return {'path': path, 'kind': 'profile', 'limit': 512, 'itemId': None, 'wanted': None}
    m = re.fullmatch(r'/api-basic-item-prices/([1-9][0-9]{0,8})\.json(?:\?generation=([a-f0-9]{64}))?', path)
    need(m is not None)
    return {'path': path, 'kind': 'item', 'limit': 8192, 'itemId': int(m[1]), 'wanted': m[2]}


def headers(value):
    need(callable(getattr(value, 'items', None)))
    pairs = value.raw_items() if callable(getattr(value, 'raw_items', None)) else value.items()
    out = {}; total = 0
    for index, (key, val) in enumerate(pairs):
        need(index < 64 and type(key) is str and type(val) is str and len(key) <= 128 and len(val) <= 8192)
        need('\r' not in key + val and '\n' not in key + val and key.lower() not in out)
        total += len(key.encode('utf-8')) + len(val.encode('utf-8')); need(total <= 16384)
        out[key.lower()] = val
    return out


def money(value):
    return value is None or type(value) is str and len(value) <= 160 and re.fullmatch(r'[0-9]+(?:\.[0-9]+)?', value) is not None


def dto(raw, item_id, wall_ms):
    v = decoded(raw, 8192)
    exact(v, ['schemaVersion', 'kind', 'profile', 'definitionHash', 'itemId', 'generation', 'sourceBodySha256',
              'capturedAt', 'sourceObservedAt', 'captureTimeKind', 'reportedWindowDays', 'exactStartAt', 'exactEndAt',
              'state', 'sold', 'asking', 'upstreamLatestInspected', 'fullVariantFreshness', 'availabilityKnown',
              'lowestListingKnown', 'qualityMatched', 'verifiedIndividualTrades'])
    need(integer(v['schemaVersion'], 1, 1) and v['kind'] == 'basic_current_item_reference' and v['profile'] == 'basic_aggregate_v1')
    need(v['definitionHash'] == DEFINITION and integer(v['itemId'], 1, 999999999) and v['itemId'] == item_id)
    need(type(v['generation']) is str and HASH.fullmatch(v['generation']) and type(v['sourceBodySha256']) is str and HASH.fullmatch(v['sourceBodySha256']))
    need(stamp(v['capturedAt']) <= wall_ms and v['sourceObservedAt'] is None and v['captureTimeKind'] == 'http_response_completed')
    need(integer(v['reportedWindowDays'], 3, 3) and v['exactStartAt'] is None and v['exactEndAt'] is None)
    for key in ['upstreamLatestInspected', 'fullVariantFreshness', 'availabilityKnown', 'lowestListingKnown', 'qualityMatched', 'verifiedIndividualTrades']:
        need(v[key] is False)
    need(v['state'] in ['present_in_generation', 'absent_in_generation'])
    if v['state'] == 'absent_in_generation': need(v['sold'] is None and v['asking'] is None)
    if v['sold'] is not None:
        exact(v['sold'], ['medianUnitPrice', 'averageUnitPrice', 'reportedSalesCount', 'reportedUnitCount', 'reportedDaySalesCount', 'reportedDayUnitCount'])
        need(money(v['sold']['medianUnitPrice']) and money(v['sold']['averageUnitPrice']))
        for key in ['reportedSalesCount', 'reportedUnitCount', 'reportedDaySalesCount', 'reportedDayUnitCount']: need(integer(v['sold'][key]))
    if v['asking'] is not None:
        exact(v['asking'], ['medianUnitPrice', 'reportedListingCount', 'reportedSellerCount'])
        need(money(v['asking']['medianUnitPrice']) and integer(v['asking']['reportedListingCount']) and integer(v['asking']['reportedSellerCount']))
    return v


def digest(value): return hashlib.sha256(value).hexdigest()


def token(*parts): return digest(json.dumps(list(parts), separators=(',', ':'), ensure_ascii=False).encode('utf-8'))


def frame(h, value, raw, public_epoch, mode):
    need(h.get('x-astra-basic-protocol') == PROTOCOL and h.get('x-astra-basic-definition') == DEFINITION)
    need(h.get('x-astra-basic-epoch') == public_epoch and h.get('x-astra-basic-mode') == mode)
    need(h.get('x-astra-basic-verification') == 'committed-sql-and-selected-page')
    need(h.get('x-astra-basic-body-verification') == 'producer-sql-attested-not-recomputed')
    need(h.get('x-astra-basic-generation') == value['generation'] and h.get('x-astra-basic-captured-at') == value['capturedAt'])
    body_sha = digest(raw)
    need(h.get('x-astra-basic-body-sha256') == body_sha and h.get('x-astra-basic-revision') == token(public_epoch, value['generation']))
    need(h.get('etag') == '"basic-item-' + token(public_epoch, body_sha) + '"')


@dataclass(frozen=True)
class TransportResponse:
    status: int
    headers: dict
    body: bytes


@dataclass(frozen=True)
class LocalResponse:
    status: int
    headers: dict
    body: bytes


def unavailable_transport(*_): raise AuthenticationUnavailable()


class LocalBasicItemReader:
    def __init__(self, *, config=lambda: None, transport=unavailable_transport, monotonic=time.monotonic,
                 wall=time.time, wait_seconds=3, ttl_seconds=15, max_entries=32, max_flights=4, max_waiters=32):
        need(callable(config) and callable(transport) and callable(monotonic) and callable(wall))
        need(type(wait_seconds) in (int, float) and math.isfinite(wait_seconds) and 0 < wait_seconds <= 4)
        need(type(ttl_seconds) in (int, float) and math.isfinite(ttl_seconds) and 0 <= ttl_seconds <= 30)
        need(type(max_entries) is int and 1 <= max_entries <= 32 and type(max_flights) is int and 1 <= max_flights <= 4)
        need(type(max_waiters) is int and 1 <= max_waiters <= 32)
        self.config = config; self.transport = transport; self.clock = monotonic; self.wall = wall
        self.wait_seconds = wait_seconds; self.ttl = ttl_seconds; self.max_entries = max_entries; self.max_flights = max_flights; self.max_waiters = max_waiters
        self.authority = lambda: (False, 0, 0)
        self._attached_session = None
        self.cv = threading.Condition(); self.entries = OrderedDict(); self.flights = {}; self.waiters = 0
        self.epoch = 0; self.signature = None; self.auth_signature = None; self.paused = False; self.sequence = 0; self.floor = None

    def profile(self):
        try: cfg = configuration(self.config())
        except Exception: cfg = None
        signature = cfg['publicEpoch'] if cfg else None
        with self.cv:
            if signature != self.signature:
                self.signature = signature; self.epoch += 1; self.entries.clear(); self.floor = None
        return cfg

    def _auth(self):
        try:
            a = self.authority()
            need(type(a) is tuple and len(a) == 3 and type(a[0]) is bool and all(type(x) is int and 0 <= x <= MAX_SAFE for x in a[1:]))
            return a
        except Exception: return (False, -1, -1)

    def _context(self):
        cfg = self.profile(); a = self._auth()
        with self.cv:
            if a != self.auth_signature:
                self.auth_signature = a; self.epoch += 1; self.entries.clear(); self.floor = None
            return (cfg['publicEpoch'] if cfg else None, a, self.epoch, self.paused)

    def _time(self):
        value = self.clock(); need(type(value) in (int, float) and math.isfinite(value)); return value

    def _fence(self, context, deadline):
        current = self._context(); at = self._time()
        need(current == context and current[0] is not None and current[1][0] and not current[3] and at < deadline)

    def _error(self, status, code):
        raw = json.dumps({'schemaVersion': 1, 'kind': 'basic_item_reference_error', 'error': code, 'sourceObservedAt': None}, separators=(',', ':')).encode()
        return LocalResponse(status, {**BASE, 'Content-Length': str(len(raw))}, raw)

    def _owned(self, value, method='GET'):
        return LocalResponse(value.status, dict(value.headers), b'' if method == 'HEAD' or value.status == 304 else value.body)

    def _put(self, key, value):
        self.entries.pop(key, None); self.entries[key] = value
        while len(self.entries) > self.max_entries: self.entries.popitem(last=False)

    def _withdraw(self, item_id, sequence=None, authentication=False):
        for key in list(self.entries):
            if item_id is None or self.entries[key].get('itemId') == item_id: self.entries.pop(key, None)
        # Only existing bounded tasks need a withdrawal reference. There is no
        # unbounded per-ID history or inferred source/publication ordinal.
        for pending in self.flights.values():
            if (item_id is None or pending['itemId'] == item_id) and (sequence is None or pending['sequence'] < sequence):
                pending['withdrawn'] = True
                if authentication: pending['authRevoked'] = True

    def _retained(self, entry):
        value = entry['response']; h = dict(value.headers)
        if entry.get('dto') is None: return self._error(503, 'local_basic_unavailable')
        h['x-astra-basic-mode'] = 'retained_absent' if entry['dto']['state'] == 'absent_in_generation' else 'retained'
        h['X-Local-Basic-Reference-State'] = 'retained_original_capture'
        return LocalResponse(value.status, h, value.body)

    def _order(self, value, sequence):
        next_value = (stamp(value['capturedAt']), value['generation'], sequence)
        if self.floor:
            need(next_value[0] >= self.floor[0])
            if next_value[0] == self.floor[0] and next_value[1] != self.floor[1]: need(sequence > self.floor[2])
        if not self.floor or next_value[0] > self.floor[0] or sequence > self.floor[2]: self.floor = next_value
        for key, old in list(self.entries.items()):
            d = old.get('dto')
            if d and (stamp(d['capturedAt']) < next_value[0] or d['capturedAt'] == value['capturedAt'] and d['generation'] != value['generation']):
                old = dict(old); old['response'] = self._retained(old); old['expires'] = 0; self.entries[key] = old

    def _perform(self, r, condition, context, deadline, sequence, old, note):
        self._fence(context, deadline)
        conditions = {REQUEST: PROTOCOL} if r['kind'] == 'item' else {}
        if condition is not None and old and old.get('dto') is not None and old['response'].headers.get('etag') == condition:
            conditions['If-None-Match'] = condition
        left = deadline - self._time(); need(left > 0)
        source = self.transport(r['path'], conditions, min(3, left)); status = source.status; need(type(status) is int)
        h = headers(source.headers)
        if status in (401, 403): raise AuthenticationUnavailable(401)
        if status == 404:
            note['negative'] = True
            with self.cv: self._withdraw(r['itemId'], sequence)
        if h.get('x-astra-preview') != 'password': raise AuthenticationUnavailable(401)
        self._fence(context, deadline)
        need(type(source.body) is bytes and len(source.body) <= r['limit'])
        need(h.get('content-encoding', 'identity').lower() == 'identity')
        length = h.get('content-length')
        need(length is None or re.fullmatch(r'[0-9]{1,9}', length) and (status == 304 or int(length) == len(source.body)))
        if status != 304: need(h.get('content-type', '').split(';')[0].strip().lower() == 'application/json')
        wall = self.wall(); need(type(wall) in (int, float) and math.isfinite(wall)); wall_ms = wall * 1000
        self._fence(context, deadline)
        value = None
        if r['kind'] == 'profile':
            if status == 404: return self._error(404, 'not_published'), None
            need(status == 200)
            value = decoded(source.body, 512); exact(value, ['schemaVersion', 'kind', 'protocol', 'definitionHash', 'publicEpoch', 'available'])
            need(integer(value['schemaVersion'], 1, 1) and value['kind'] == 'basic_item_public_profile' and value['protocol'] == PROTOCOL)
            need(value['definitionHash'] == DEFINITION and value['publicEpoch'] == context[0] and value['available'] is True)
            need(h.get('x-astra-basic-protocol') == PROTOCOL and h.get('x-astra-basic-definition') == DEFINITION)
        elif status == 304:
            need(source.body == b'' and 'If-None-Match' in conditions and old and old.get('dto') is not None)
            value = old['dto']; need(value['state'] == 'present_in_generation')
            frame(h, value, old['response'].body, context[0], 'current')
        elif status == 409:
            error = decoded(source.body, 4096); exact(error, ['schemaVersion', 'kind', 'error', 'sourceObservedAt', 'itemId', 'generation', 'capturedAt'])
            need(integer(error['schemaVersion'], 1, 1) and error['kind'] == 'basic_item_reference_error' and error['error'] == 'generation_changed')
            need(error['sourceObservedAt'] is None and error['itemId'] == r['itemId'] and integer(error['itemId'], 1, 999999999))
            need(type(error['generation']) is str and HASH.fullmatch(error['generation']) and r['wanted'] is not None and error['generation'] != r['wanted'])
            need(stamp(error['capturedAt']) <= wall_ms and h.get('x-astra-basic-protocol') == PROTOCOL and h.get('x-astra-basic-definition') == DEFINITION)
            need(h.get('x-astra-basic-epoch') == context[0] and h.get('x-astra-basic-generation') == error['generation'])
            need(h.get('x-astra-basic-captured-at') == error['capturedAt'] and h.get('x-astra-basic-revision') == token(context[0], error['generation']))
            with self.cv: self._withdraw(r['itemId'], sequence)
        else:
            need(status in (200, 404))
            value = dto(source.body, r['itemId'], wall_ms); mode = h.get('x-astra-basic-mode')
            need(mode in ('current', 'retained', 'absent', 'retained_absent'))
            absent = value['state'] == 'absent_in_generation'
            need(absent == (status == 404) and absent == (mode in ('absent', 'retained_absent')))
            frame(h, value, source.body, context[0], mode)
        self._fence(context, deadline)
        allowed = FORWARD
        if r['kind'] == 'profile': allowed = {'x-astra-basic-protocol', 'x-astra-basic-definition'}
        elif status == 409: allowed = {'x-astra-basic-' + x for x in ['protocol', 'definition', 'epoch', 'generation', 'revision', 'captured-at']}
        kept = {key: val for key, val in h.items() if key in allowed}; kept.update(BASE)
        kept['X-Astra-Preview'] = 'password'
        kept['X-Local-Basic-Reference-State'] = 'typed_own_session_cache'
        body = old['response'].body if status == 304 else source.body
        if status != 304: kept['Content-Length'] = str(len(body))
        response = LocalResponse(status, kept, b'' if status == 304 else body)
        if status == 304:
            # Retain the validated representation for subsequent known conditional reads.
            kept = dict(kept); kept['Content-Length'] = str(len(body)); response = LocalResponse(200, kept, body)
        return response, value if r['kind'] == 'item' and status in (200, 304, 404) else None

    def _read(self, r, condition, context, deadline):
        path = r['path']
        with self.cv:
            old = self.entries.get(path)
            if old and self._time() < old['expires']:
                self._fence(context, deadline)
                return self._conditional(old['response'], old.get('dto'), condition)
            if old and self._time() < old['retry']:
                self._fence(context, deadline)
                return self._retained(old) if old.get('dto') else self._owned(old['response'])
            key = (path, condition, context)
            if any(job['context'] != context for job in self.flights.values()): return self._error(503, 'prior_local_basic_pending')
            job = self.flights.get(key)
            created = job is None
            if self.waiters >= self.max_waiters: return self._error(503, 'local_basic_waiter_capacity')
            if job is None:
                if len(self.flights) >= self.max_flights: return self._error(503, 'local_basic_capacity')
                self.sequence += 1; sequence = self.sequence
                job = {'done': False, 'cancelled': False, 'withdrawn': False, 'context': context, 'value': None,
                       'deadline': deadline, 'itemId': r['itemId'], 'sequence': sequence}; self.flights[key] = job
                def work():
                    value = self._error(503, 'local_basic_unavailable'); parsed = None; positive = False; auth_error = False; note = {}
                    try:
                        value, parsed = self._perform(r, condition, context, deadline, sequence, old, note)
                        positive = value.status in (200, 404) and (parsed is not None or r['kind'] == 'profile' and value.status == 200)
                    except AuthenticationUnavailable as error:
                        auth_error = error.status in (401, 403); value = self._error(401 if auth_error else 503, 'own_site_access_unavailable')
                    except Exception: value = self._error(404 if note.get('negative') else 503, 'local_basic_unavailable')
                    with self.cv:
                        before_entries = self.entries.copy(); before_floor = self.floor
                        try:
                            self._fence(context, deadline); need(not job['cancelled'] and not job['withdrawn'])
                            if auth_error:
                                self._withdraw(None, authentication=True); self.floor = None
                                self._put(path, {'response': value, 'dto': None, 'itemId': r['itemId'], 'expires': 0, 'retry': self._time() + 30})
                            elif positive:
                                if parsed and value.headers.get('x-astra-basic-mode') in ('current', 'absent'): self._order(parsed, sequence)
                                admitted_at = self._time()
                                self._put(path, {'response': self._owned(value), 'dto': parsed, 'itemId': r['itemId'], 'admittedAt': admitted_at, 'expires': admitted_at + self.ttl, 'retry': 0})
                            elif value.status == 409: pass
                            else:
                                # A declared HTTP404 never revives the prior same-ID quote.
                                still_owned = old is not None and self.entries.get(path) is old
                                if still_owned and old.get('dto') is not None:
                                    value = self._retained(old)
                                    self._put(path, {**old, 'response': value, 'expires': 0, 'retry': self._time() + 30})
                                else:
                                    self._put(path, {'response': self._owned(value), 'dto': None, 'itemId': r['itemId'], 'expires': 0, 'retry': self._time() + 30})
                            self._fence(context, deadline)
                        except Exception:
                            # Undo a late positive authority commit only within the same
                            # context. A changed auth/config context has already revoked
                            # the cache and must never have its old contents restored.
                            same_context = self._context() == context
                            if same_context and positive:
                                self.entries = before_entries; self.floor = before_floor
                            prior = before_entries.get(path)
                            if same_context and positive and prior and prior.get('dto') and not note.get('negative') and not job['withdrawn']:
                                value = self._retained(prior)
                            else:
                                value = self._error(401 if job.get('authRevoked') or self._auth() != context[1] else 503, 'local_basic_revoked')
                        job['value'] = value; job['done'] = True
                        if self.flights.get(key) is job: del self.flights[key]
                        self.cv.notify_all()
                threading.Thread(target=work, daemon=True, name='local-basic-own-cache').start()
            self.waiters += 1
            try:
                left = max(0, min(deadline, job['deadline']) - self._time())
                done = self.cv.wait_for(lambda: job['done'] or self._context() != context, timeout=left)
            finally: self.waiters -= 1
            if not done or not job['done']:
                if created: job['cancelled'] = True
                return self._error(503, 'local_basic_pending')
            try:
                value = self._owned(job['value']); self._fence(context, deadline)
                entry = self.entries.get(path)
                if entry and value.status in (200, 404) and entry.get('dto'):
                    return self._conditional(value, entry['dto'], condition)
                return value
            except Exception: return self._error(401 if self._auth() != context[1] else 503, 'local_basic_revoked')

    def _conditional(self, response, value, condition):
        if value and response.status == 200 and value['state'] == 'present_in_generation' and response.headers.get('x-astra-basic-mode') == 'current' and condition == response.headers.get('etag'):
            h = dict(response.headers); h.pop('Content-Length', None); h.pop('content-length', None)
            return LocalResponse(304, h, b'')
        return self._owned(response)

    def _deliver(self, value, path, context, deadline, method):
        # Prepare all owned views before callbacks. The last clock includes
        # config/auth callback time; subsequent checks touch owned plain data.
        with self.cv:
            entry = self.entries.get(path)
            prepared = self._owned(value, method)
            denied = self._owned(self._error(503, 'local_basic_revoked'), method)
            auth_denied = self._owned(self._error(401, 'own_site_access_unavailable'), method)
            retained = self._owned(self._retained(entry), method) if entry and entry.get('dto') else denied
            native = self._attached_session
            # OwnSiteSession owns this existing reentrant lock. Acquire it before
            # the last clock, then read only native non-secret control fields
            # AFTER that callback; never invoke an authority callback afterward.
            with native.cv if native is not None else self.cv:
                current = self._context(); at = self._time()
                if native is not None:
                    final_auth = (native.enabled is True and native.access_mode != 'review', native.epoch, native.access_revision)
                    if final_auth != context[1] or final_auth[0] is not True:
                        self._withdraw(None, authentication=True)
                        self.auth_signature = final_auth; self.epoch += 1
                        return auth_denied
                if current != context or context[2] != self.epoch or not current[1][0] or self.paused:
                    return auth_denied if current[1] != context[1] else denied
                if at >= deadline: return denied
                if entry is not None and self.entries.get(path) is not entry: return denied
                if entry and at < entry.get('admittedAt', at): return denied
                if value.headers.get('x-astra-basic-mode') in ('current', 'absent', 'retained', 'retained_absent'):
                    if not entry or not entry.get('dto'): return denied
                    if any(value.headers.get(key) != entry['response'].headers.get(key) for key in ['etag', 'x-astra-basic-generation', 'x-astra-basic-body-sha256']): return denied
                elif path == PROFILE and value.status == 200 and entry is None: return denied
                if value.status in (200, 304, 404) and entry:
                    source_mode = value.headers.get('x-astra-basic-mode')
                    if entry.get('dto') and source_mode in ('current', 'absent'):
                        if entry['response'].headers.get('x-astra-basic-mode') not in ('current', 'absent') or self.ttl != 0 and at >= entry['expires']:
                            return retained
                    elif entry.get('itemId') is None and value.status == 200 and self.ttl != 0 and at >= entry['expires']:
                        return denied
                return prepared

    def cancel(self):
        with self.cv:
            self.epoch += 1; self.entries.clear(); self.floor = None
            for job in self.flights.values(): job['cancelled'] = True
            self.cv.notify_all()

    def pause(self):
        with self.cv: self.paused = True; self.cancel()

    def resume(self):
        with self.cv: self.paused = False

    def state(self):
        with self.cv: return {'pendingTasks': len(self.flights), 'waiters': self.waiters, 'cacheEntries': len(self.entries), 'paused': self.paused}

    def handle(self, method, path, request_headers, *, bind_host='127.0.0.1', client_host='127.0.0.1', port=8765):
        if type(path) is not str or not path.startswith(PREFIX): return None
        try: deadline = self._time() + self.wait_seconds
        except Exception: return self._owned(self._error(503, 'local_basic_unavailable'), method)
        if not local_request_allowed(request_headers, bind_host, client_host, port, origin_proof=False): return self._owned(self._error(403, 'local_only'), method)
        if method not in ('GET', 'HEAD'):
            value = self._error(405, 'method_not_allowed'); value.headers['Allow'] = 'GET, HEAD'; return value
        try:
            r = route(path)
            if callable(getattr(request_headers, 'get_all', None)):
                for key in [REQUEST, 'If-None-Match']: need(len(request_headers.get_all(key, [])) <= 1)
            condition = request_headers.get('If-None-Match')
            need(condition is None or type(condition) is str and re.fullmatch(r'"basic-item-[a-f0-9]{64}"', condition))
            need(r['kind'] != 'profile' or condition is None)
            if r['kind'] == 'item': need(request_headers.get(REQUEST) == PROTOCOL)
        except Exception: return self._owned(self._error(400, 'invalid_local_basic_path'), method)
        if self.profile() is None: return self._owned(self._error(404, 'not_published'), method)
        context = self._context()
        if not context[1][0]: return self._owned(self._error(401, 'own_site_access_unavailable'), method)
        if context[3]: return self._owned(self._error(503, 'local_basic_paused'), method)
        try: value = self._read(r, condition, context, deadline)
        except Exception: value = self._error(503, 'local_basic_unavailable')
        try: return self._deliver(value, path, context, deadline, method)
        except Exception: return self._owned(self._error(503, 'local_basic_revoked'), method)


def attach_basic_item_reader(session, reader):
    need(isinstance(session, OwnSiteSession) and isinstance(reader, LocalBasicItemReader))
    if not session.enabled: return False
    reader.transport = lambda path, conditions, timeout: reader_response(session, path, conditions, timeout, TransportResponse)
    def authority():
        with session.cv: return (session.enabled and session.access_mode != 'review', session.epoch, session.access_revision)
    reader.authority = authority
    reader._attached_session = session
    return True
