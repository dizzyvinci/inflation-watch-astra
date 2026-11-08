"""Explicit local form -> the same native own-site session; no server or I/O at import."""
from dataclasses import dataclass
import math
import re
import secrets
import threading
from urllib.parse import parse_qsl, urlsplit
from local_own_site_session import OwnSiteSession, AuthenticationUnavailable, MAX_TIMEOUT

PATH = '/__local_login'
MAX_BODY = 4096
MAX_ATTEMPTS = 3
ATTEMPT_WINDOW = 60
NONCE_SECONDS = 300
REQUEST_SECONDS = MAX_TIMEOUT
HEADERS = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store, no-transform',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; script-src 'none'; style-src 'none'; connect-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Connection': 'close',
}


@dataclass(frozen=True)
class LoginResponse:
    status: int
    headers: dict
    body: bytes


def response(status, message='Local sign-in unavailable.', *, nonce=None, redirect=False):
    # All text is fixed; only our alphabet-restricted random nonce is inserted.
    form = '' if nonce is None else (
        '<form method="post" action="/__local_login" autocomplete="off">'
        '<input type="hidden" name="nonce" value="' + nonce + '">'
        '<label>Existing hosted preview password '
        '<input type="password" name="password" value="" autocomplete="off" maxlength="256" required></label>'
        '<button type="submit">Sign in</button></form>')
    body = ('<!doctype html><html lang="en"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Local private workspace sign-in</title><h1>Local private workspace</h1><p>'
            + message + '</p>' + form + '</html>').encode('utf-8')
    headers = dict(HEADERS)
    if redirect:
        headers['Location'] = '/'
        body = b''
    headers['Content-Length'] = str(len(body))
    return LoginResponse(status, headers, body)


def _header(headers, key):
    if callable(getattr(headers, 'get_all', None)):
        values = headers.get_all(key, [])
    else:
        values = [headers[k] for k in headers if type(k) is str and k.lower() == key.lower()]
    if len(values) > 1:
        raise ValueError('headers')
    value = values[0] if values else None
    if value is not None and (type(value) is not str or len(value) > 4096 or '\r' in value or '\n' in value):
        raise ValueError('headers')
    return value


def is_login_target(path):
    if type(path) is not str:
        return False
    try:
        return urlsplit(path).path == PATH
    except (ValueError, UnicodeError):
        return False


def native_control_snapshot(session):
    """No password, jar, cookie or native body values; never clear reservations."""
    with session.cv:
        return (session.enabled, session.epoch, session.access_revision, session.access_mode,
                len(session.flights), session.retry_at, session.profile_retry)


class LocalBrowserLogin:
    def __init__(self, session, on_success, *, enabled=False, monotonic=None, wall=None, nonce_factory=None):
        if type(session) is not OwnSiteSession or not callable(on_success):
            raise TypeError('local_login_session')
        self.session = session
        self.on_success = on_success
        self.clock = monotonic or session.clock
        self.wall = wall or session.wall
        self.nonce_factory = nonce_factory or (lambda: secrets.token_urlsafe(32))
        self.enabled = enabled is True
        self.lock = threading.Lock()
        self.nonce = None
        self.nonce_at = 0
        self.attempts = []
        self.busy = False

    def enable(self):
        with self.lock:
            self.enabled = True

    def _time(self):
        value = self.clock()
        if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
            raise ValueError('clock')
        return value

    def handle(self, method, path, headers, *, bind_host, client_host, port, read_body=None):
        if not is_login_target(path):
            return None
        if not self.enabled:
            return response(404)
        try:
            if path != PATH or port != 8765 or bind_host != '127.0.0.1' or client_host != '127.0.0.1':
                raise ValueError('origin')
            host = _header(headers, 'Host')
            if host not in {'127.0.0.1:8765', 'localhost:8765'}:
                raise ValueError('origin')
            origin = _header(headers, 'Origin')
            site = _header(headers, 'Sec-Fetch-Site')
            if origin is not None and origin != 'http://' + host or site not in (None, 'same-origin', 'none'):
                raise ValueError('origin')
            if method == 'POST' and origin != 'http://' + host:
                raise ValueError('origin')
            if method not in ('GET', 'POST'):
                out = response(405);out.headers['Allow'] = 'GET, POST';return out
            if _header(headers, 'Transfer-Encoding') is not None:
                raise ValueError('framing')
            if method == 'GET':
                if _header(headers, 'Content-Length') not in (None, '0'):
                    raise ValueError('framing')
                return self._form()
            length = _header(headers, 'Content-Length')
            if (not re.fullmatch(r'[1-9][0-9]{0,3}', length or '') or int(length) > MAX_BODY
                    or _header(headers, 'Content-Type') != 'application/x-www-form-urlencoded' or not callable(read_body)):
                raise ValueError('framing')
            return self._submit(int(length), read_body)
        except Exception:
            # Never include exception/body/header/credential values in responses or logs.
            return response(400)

    def _form(self):
        with self.lock:
            if self.busy:
                return response(423, 'A sign-in is still settling. No second attempt was started.')
            state = native_control_snapshot(self.session)
            at = self._time()
            self.attempts = [value for value in self.attempts if at - value < ATTEMPT_WINDOW]
            if len(self.attempts) >= MAX_ATTEMPTS:
                return response(429, 'The manual attempt limit is three per minute. No automatic retry is scheduled.')
            if state[4]:
                return response(423, 'Native own-site work is still settling. No second attempt was started.')
            if at < max(state[5], state[6]):
                return response(429, 'The existing session backoff remains in effect.')
            nonce = self.nonce_factory()
            if type(nonce) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{32,64}', nonce):
                raise ValueError('nonce')
            self.nonce, self.nonce_at = nonce, at
            return response(200, 'Use the existing hosted preview password. It stays in this process RAM; no password is saved.', nonce=nonce)

    def _submit(self, length, read_body):
        start = self._time();deadline = start + REQUEST_SECONDS
        with self.lock:
            if self.busy:
                return response(423, 'A sign-in is still settling. No second attempt was started.')
            self.attempts = [value for value in self.attempts if start - value < ATTEMPT_WINDOW]
            if len(self.attempts) >= MAX_ATTEMPTS:
                return response(429)
            state = native_control_snapshot(self.session)
            if state[4]:
                return response(423)
            if start < max(state[5], state[6]):
                return response(429)
            self.busy = True
        owned_epoch = None
        password = None
        raw = None
        try:
            left = deadline - self._time()
            if left <= 0:
                raise ValueError('deadline')
            raw = read_body(length, left)
            if type(raw) is not bytes or len(raw) != length or self._time() >= deadline:
                raise ValueError('body')
            encoded = raw.decode('ascii')
            if re.search(r'%(?![0-9a-fA-F]{2})', encoded):
                raise ValueError('form')
            pairs = parse_qsl(encoded, keep_blank_values=True, strict_parsing=True, encoding='utf-8', errors='strict', max_num_fields=2)
            if len(pairs) != 2 or {k for k,v in pairs} != {'nonce', 'password'}:
                raise ValueError('form')
            fields = dict(pairs);password = fields['password'];nonce = fields['nonce']
            if (not 0 < len(password) <= 256 or len(password.encode('utf-8')) > 1024
                    or any(ord(c) < 32 or ord(c) == 127 for c in password)):
                raise ValueError('password')
            with self.lock:
                at = self._time()
                if (self.nonce is None or not secrets.compare_digest(nonce, self.nonce)
                        or not self.nonce_at <= at < self.nonce_at + NONCE_SECONDS or at >= deadline):
                    raise ValueError('nonce')
                self.nonce = None
                with self.session.cv:
                    # Re-admit immediately before configure; no pending native task is reset.
                    at = self._time()
                    if at >= deadline or at >= self.nonce_at + NONCE_SECONDS:
                        raise ValueError('deadline')
                    if self.session.flights or at < max(self.session.retry_at, self.session.profile_retry):
                        return response(423)
                    self.attempts.append(at)
                    self.session.configure(password)
                    owned_epoch = self.session.epoch
            remaining = deadline - self._time()
            if remaining <= 0:
                raise ValueError('deadline')
            profile = self.session.verified_profile(timeout=min(MAX_TIMEOUT, remaining))
            # Existing verified_profile owns fixed inflation.gg login/profile, cookie/expiry validation.
            if (type(profile) is not dict or set(profile) != {'unlocked', 'mode', 'expiresAt'}
                    or profile['unlocked'] is not True or profile['mode'] != 'private_workspace'
                    or type(profile['expiresAt']) is not int):
                raise ValueError('profile')
            self.on_success()
            with self.session.cv:
                wall = self.wall()
                at = self._time()
                if (type(wall) not in (int,float) or not math.isfinite(wall) or at >= deadline
                        or not wall * 1000 < profile['expiresAt'] <= wall * 1000 + 28805000
                        or self.session.epoch != owned_epoch or self.session.enabled is not True
                        or self.session.access_mode != 'password' or self.session.profile != profile):
                    raise ValueError('profile')
                return response(303, redirect=True)
        except Exception:
            if owned_epoch is not None:
                with self.session.cv:
                    if self.session.epoch == owned_epoch:
                        self.session.disable()  # logical withdrawal only; native flights/backoff remain
            return response(401, 'Private sign-in was not verified. No automatic retry was started.')
        finally:
            password = raw = None  # Python cannot promise memory zeroization; no persistence/echo.
            with self.lock:
                self.busy = False
