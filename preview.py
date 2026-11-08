"""Local preview and one ten-minute collector. No Git pushes or deployment."""
import argparse
import hashlib
import http.server
import json
import math
import os
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit
from catalog_local import LocalCatalog
from local_cash_reader import LocalCashReader
from local_nx_reader import LocalNxReader
from local_item_reader import LocalItemReader
from local_nx_history_reader import LocalNxHistoryReader
from local_item_hour_reader import LocalItemHourReader
from local_calculations_reader import LocalCalculationsReader, inject_local_availability
from local_stamp_reference_reader import LocalStampReferenceReader, inject_local_availability as inject_stamp_availability
from local_current_search_reader import LocalCurrentSearchReader, attach_current_search_reader, inject_local_availability as inject_current_search_availability
from local_basic_item_reader import LocalBasicItemReader, attach_basic_item_reader
from local_overview_activity_reader import LocalOverviewActivityReader, attach_overview_activity_reader, inject_overview_availability
from local_login import LocalBrowserLogin, PATH as LOCAL_LOGIN_PATH, is_login_target as is_local_login_target
from local_own_site_session import (OwnSiteSession, AuthenticationUnavailable, attach_readers, control_response,
                                   local_request_allowed, read_password)

ROOT = Path(__file__).resolve().parent
BUILD_TIMEOUT_SECONDS = 120
_build_guard = threading.Lock()
_catalog = LocalCatalog(ROOT)
_cash = LocalCashReader(ROOT)
_nx = LocalNxReader()
_items = LocalItemReader(ROOT)
_nx_history = LocalNxHistoryReader(ROOT)
_item_hours = LocalItemHourReader(ROOT)
_calculations = LocalCalculationsReader(ROOT, enabled=lambda: os.environ.get("LOCAL_API_CALCULATIONS") == "1")
_stamps = LocalStampReferenceReader(ROOT, enabled=lambda: os.environ.get("LOCAL_STAMP_REFERENCES") == "1")
_own_session = OwnSiteSession()
_basic_items = LocalBasicItemReader(config=lambda: os.environ.get("LOCAL_BASIC_ITEM_PRICES_JSON"))
_current_search = LocalCurrentSearchReader(ROOT, config=lambda: os.environ.get("LOCAL_CURRENT_SEARCH_JSON"))
_overview_activity = LocalOverviewActivityReader(ROOT, config=lambda: os.environ.get("LOCAL_OVERVIEW_WINDOW_ACTIVITY_JSON"))

def enable_private_own_site(password):
    _own_session.configure(password)
    _attach_private_readers()

def _attach_private_readers():
    attach_readers(_own_session, cash=_cash, nx=_nx, items=_items, nx_history=_nx_history,
                   item_hours=_item_hours, calculations=_calculations, stamp_references=_stamps)
    attach_current_search_reader(_own_session, _current_search)
    attach_basic_item_reader(_own_session, _basic_items)
    attach_overview_activity_reader(_own_session, _overview_activity)



_browser_login = LocalBrowserLogin(_own_session, _attach_private_readers)

def _serve_browser_login(handler):
    if not is_local_login_target(handler.path):return False
    def read_body(size, timeout):
        previous = handler.connection.gettimeout()
        deadline = time.monotonic() + timeout
        parts = [];remaining = size
        try:
            while remaining:
                left = deadline - time.monotonic()
                if left <= 0:raise TimeoutError('local_login_body_timeout')
                handler.connection.settimeout(left)
                chunk = handler.rfile.read1(remaining)
                if not chunk:break
                parts.append(chunk);remaining -= len(chunk)
            return b''.join(parts)
        finally:handler.connection.settimeout(previous)
    result = _browser_login.handle(handler.command, handler.path, handler.headers,
                                  bind_host=handler.server.server_address[0], client_host=handler.client_address[0],
                                  port=handler.server.server_address[1], read_body=read_body)
    handler._catalog_response = True
    handler._local_login_response = True
    handler.close_connection = True
    handler.send_response(result.status)
    for name, value in result.headers.items():handler.send_header(name, value)
    handler.end_headers()
    if handler.command != 'HEAD':handler.wfile.write(result.body)
    return True


def _serve_overview_activity(handler):
    if type(handler.path)is not str or not handler.path.startswith('/api-overview-window-activity/'):return False
    response = _overview_activity.handle(handler.command,handler.path,handler.headers,bind_host=handler.server.server_address[0],client_host=handler.client_address[0],port=handler.server.server_address[1])
    if response is None:return False
    handler._catalog_response=True
    handler.send_response(response.status)
    for name,value in response.headers.items():handler.send_header(name,value)
    handler.end_headers()
    if response.body and handler.command!='HEAD':handler.wfile.write(response.body)
    return True


class PreviewBuildError(RuntimeError):
    """A fixed error code; child output/credentials never enter local logs."""


def _read_json(path, limit=5_000_000):
    with Path(path).open('rb') as source:
        value = source.read(limit + 1)
    if len(value) > limit:
        raise ValueError('Output exceeds bound')
    return json.loads(value), value


def verified_output(root, expected=None):
    """Read one fully committed named report, never a subprocess's cached object."""
    root = Path(root)
    pointer, before = _read_json(root / 'dist/version.json', 65536)
    if not isinstance(pointer,dict):
        raise ValueError('Invalid generated pointer')
    version = pointer.get('version')
    if not isinstance(version, str) or not re.fullmatch(r'[a-f0-9]{16}', version) or pointer.get('data') != 'data-' + version + '.json':
        raise ValueError('Invalid generated pointer')
    report, raw = _read_json(root / 'dist' / pointer['data'])
    if hashlib.sha256(raw).hexdigest()[:16] != version:
        raise ValueError('Generated report digest mismatch')
    alias, _ = _read_json(root / 'dist/data.json')
    marker, _ = _read_json(root / 'dist/ui-version.json', 1024)
    if not isinstance(report,dict) or not isinstance(marker,dict) or alias != report or marker.get('schemaVersion') != 1 or marker.get('kind') != 'local_preview_ui' or not re.fullmatch(r'[a-f0-9]{64}', marker.get('version', '')):
        raise ValueError('Incomplete generated output')
    if not isinstance(report.get('sourceUpdatedAt'), str) or not isinstance(report.get('sourceStatus'), dict) or not isinstance(report['sourceStatus'].get('status'), str) or pointer.get('sourceUpdatedAt') != report['sourceUpdatedAt'] or pointer.get('builtAt') != report.get('builtAt') or pointer.get('marketCatalog') != report.get('marketCatalog'):
        raise ValueError('Generated output binding mismatch')
    if expected is not None and (expected.get('version') != version or expected.get('sourceUpdatedAt') != report['sourceUpdatedAt']):
        raise ValueError('Build summary does not match generated output')
    if (root / 'dist/version.json').read_bytes() != before:
        raise ValueError('Another build changed the generated output')
    return report, version


def build_fresh(offline=False, *, root=None, timeout=BUILD_TIMEOUT_SECONDS):
    """One fresh interpreter per tick, no shared/reloaded engine module globals.

    The engine's existing exclusive checkout lock remains authoritative. We do
    not roll back files over another builder or delete immutable named history.
    """
    root = Path(root or ROOT).resolve()
    if isinstance(timeout,bool) or not isinstance(timeout,(int,float)) or not math.isfinite(timeout) or not 0 < timeout <= BUILD_TIMEOUT_SECONDS:
        raise PreviewBuildError('invalid_build_timeout')
    if not _build_guard.acquire(blocking=False):
        raise PreviewBuildError('build_already_running')
    process = None
    try:
        if (root / '.collector.lock').exists():
            raise PreviewBuildError('checkout_collector_busy')
        marker_path=root / 'dist/ui-version.json'
        def marker_stamp():
            try:
                value=marker_path.stat()
                return value.st_ino,value.st_size,value.st_mtime_ns
            except FileNotFoundError:return None
        before_marker=marker_stamp()
        command = [sys.executable, '-B', str(root / 'engine.py')]
        if offline:
            command.append('--offline')
        try:
            process = subprocess.Popen(command, cwd=str(root), stdin=subprocess.DEVNULL,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0) if os.name == 'nt' else 0)
            try:
                output, errors = process.communicate(timeout=timeout)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate()
                raise PreviewBuildError('child_build_timeout') from None
            if process.returncode != 0:
                raise PreviewBuildError('child_build_failed')
            if len(output) > 65536 or len(errors) > 65536:
                raise PreviewBuildError('child_output_exceeds_bound')
            summary = json.loads(output.decode('utf-8').strip().splitlines()[-1])
            if marker_stamp() == before_marker:
                raise PreviewBuildError('child_output_unverified')
            return verified_output(root, expected=summary)
        except PreviewBuildError:
            raise
        except Exception:
            raise PreviewBuildError('child_output_unverified') from None
    finally:
        # A killed child cannot run engine.finally. Never remove a lock owned
        # by a different PID, and never restart/retry the child within this tick.
        if process is not None and process.poll() is not None:
            lock = root / '.collector.lock'
            try:
                if lock.read_text(encoding='utf-8').strip() == str(process.pid):
                    lock.unlink()
            except OSError:
                pass
        _build_guard.release()


def poll_seconds(root):
    try:
        config, _ = _read_json(Path(root) / 'config.json', 1048576)
        value = config['poll_seconds']
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 1:
            raise ValueError('Invalid interval')
        return value
    except (OSError, ValueError, TypeError, KeyError):
        return 600


def build(offline=False):
    """Keep the preview build hook, backed exclusively by a fresh child."""
    return build_fresh(offline)

def ui_version(root):
    """Read only the last completed UI build, never live half-copied files."""
    root = Path(root)
    if (root / '.collector.lock').exists():
        return 503, {'status': 'building'}
    try:
        path = root / 'dist' / 'ui-version.json'
        if path.stat().st_size > 1024:
            raise ValueError('UI marker too large')
        value = json.loads(path.read_text(encoding='utf-8'))
        if value.get('schemaVersion') != 1 or value.get('kind') != 'local_preview_ui' or not isinstance(value.get('version'), str) or not re.fullmatch(r'[a-f0-9]{64}', value['version']):
            raise ValueError('Invalid UI marker')
        if (root / '.collector.lock').exists():
            return 503, {'status': 'building'}
        return 200, {'schemaVersion': 1, 'kind': 'local_preview_ui', 'version': value['version']}
    except (OSError, ValueError, TypeError, AttributeError):
        return 503, {'status': 'not_ready'}

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT/'dist'),**kwargs)
    def do_GET(self):
        if _serve_browser_login(self):return
        if self._serve_private_control():return
        if self._serve_catalog():return
        if self._serve_calculation_index():return
        if urlsplit(self.path).path == '/__ui_version':
            status, value = ui_version(ROOT)
            body = json.dumps(value, separators=(',', ':')).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            if status == 503:self.send_header('Retry-After', '2')
            self.end_headers()
            self.wfile.write(body)
            return
        path=Path(self.translate_path(self.path))
        try:
            resolved=path.resolve()
            resolved.relative_to((ROOT/'dist').resolve())
        except ValueError:
            self.send_error(403)
            return
        if path.is_file():
            tag='"'+hashlib.sha256(path.read_bytes()).hexdigest()[:20]+'"'
            if self.headers.get('If-None-Match')==tag:
                self.send_response(304);self.send_header('ETag',tag);self.send_header('Cache-Control','no-cache');self.end_headers();return
            self._etag=tag
        super().do_GET()
    def do_HEAD(self):
        if _serve_browser_login(self):return
        if self._serve_private_control():return
        if self._serve_catalog():return
        if self._serve_calculation_index():return
        if urlsplit(self.path).path == '/__ui_version':
            self.send_response(405);self.send_header('Allow','GET');self.send_header('Content-Length','0');self.end_headers();return
        super().do_HEAD()
    def _serve_private_control(self):
        response = control_response(_own_session, self.command, self.path, self.headers,
                                    bind_host=self.server.server_address[0], client_host=self.client_address[0],
                                    port=self.server.server_address[1])
        if response is None:return False
        self._catalog_response = True
        self.send_response(response.status)
        for name, value in response.headers.items():self.send_header(name, value)
        self.end_headers()
        if response.body and self.command != 'HEAD':self.wfile.write(response.body)
        return True
    def _serve_calculation_index(self):
        # Only add the explicit local availability gate; preserve other HTML,
        # controls password/review footer and completed-build inputs unchanged.
        if urlsplit(self.path).path not in ('/', '/index.html'):return False
        try:
            path = ROOT / 'dist' / 'index.html'
            if path.stat().st_size > 2_000_000:return False
            raw = path.read_bytes()
            body = inject_overview_availability(inject_current_search_availability(inject_stamp_availability(inject_local_availability(raw, _calculations.active()), _stamps.active()), _current_search.available()), _overview_activity.available())
        except (OSError, ValueError):return False
        if body == raw:return False
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':self.wfile.write(body)
        return True
    def _serve_basic_items(self):
        response = _basic_items.handle(self.command, self.path, self.headers,
                                      bind_host=self.server.server_address[0], client_host=self.client_address[0],
                                      port=self.server.server_address[1])
        if response is None:return False
        self._catalog_response = True
        self.send_response(response.status)
        for name, value in response.headers.items():self.send_header(name, value)
        self.end_headers()
        if response.body and self.command != "HEAD":self.wfile.write(response.body)
        return True
    def _serve_catalog(self):
        if _serve_overview_activity(self):return True
        if self._serve_basic_items():return True
        self._catalog_response = False
        response = _current_search.handle(self.command, self.path, self.headers,
                               bind_host=self.server.server_address[0],client_host=self.client_address[0],port=self.server.server_address[1])
        if response is None:response = _calculations.handle(self.command, self.path, self.headers,
                                        bind_host=self.server.server_address[0],client_host=self.client_address[0])
        if response is None:response = _stamps.handle(self.command, self.path, self.headers,
                               bind_host=self.server.server_address[0],client_host=self.client_address[0],port=self.server.server_address[1])
        if response is None:response = _cash.handle(self.command, self.path, self.headers,
                               bind_host=self.server.server_address[0],client_host=self.client_address[0])
        if response is None:response = _nx.handle(self.command, self.path, self.headers,
                                                bind_host=self.server.server_address[0],client_host=self.client_address[0])
        if response is None:response = _nx_history.handle(self.command, self.path, self.headers,
                                                        bind_host=self.server.server_address[0],client_host=self.client_address[0])
        if response is None:response = _item_hours.handle(self.command, self.path, self.headers,
                                                        bind_host=self.server.server_address[0],client_host=self.client_address[0])
        if response is None:response = _items.handle(self.command, self.path, self.headers,
                                                   bind_host=self.server.server_address[0],client_host=self.client_address[0])
        if response is None:response = _catalog.handle(self.command, self.path, self.headers)
        if response is None:return False
        self._catalog_response = True
        self.send_response(response.status)
        for name, value in response.headers.items():self.send_header(name, value)
        self.end_headers()
        if response.body:self.wfile.write(response.body)
        return True
    def _catalog_or_unsupported(self):
        if _serve_browser_login(self):return
        if self._serve_private_control():return
        if not self._serve_catalog():self.send_error(501, 'Unsupported method')
    do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = _catalog_or_unsupported
    def send_response(self, code, message=None):
        self._private_response_status = code
        super().send_response(code, message)
    def _private_json_eligible(self):
        if not _own_session.enabled or self.command != 'GET' or getattr(self, '_private_response_status', None) != 200:return False
        path = self.path
        if not (path in ('/version.json', '/data.json') or re.fullmatch(r'/data-[a-f0-9]{16}\.json', path)):return False
        if not local_request_allowed(self.headers, self.server.server_address[0], self.client_address[0], self.server.server_address[1], origin_proof=False):return False
        return True
    def _private_json_candidate(self):
        if not self._private_json_eligible():return False
        try:return _own_session.verified_profile()['unlocked'] is True
        except AuthenticationUnavailable:return False
    def end_headers(self):
        if getattr(self, '_local_login_response', False):
            super().end_headers();return
        if getattr(self,'_etag',None):self.send_header('ETag',self._etag);self._etag=None
        if not getattr(self, '_catalog_response', False):
            private_candidate = self._private_json_candidate()
            if private_candidate:
                self.send_header('X-Astra-Preview', 'password')
                self.send_header('Cache-Control', 'private, no-store, no-transform')
                self.send_header('CDN-Cache-Control', 'no-store')
                self.send_header('Cloudflare-CDN-Cache-Control', 'no-store')
            else:
                if self._private_json_eligible() and _own_session.observed_review():self.send_header('X-Astra-Preview', 'review')
                self.send_header('Cache-Control','no-store' if urlsplit(self.path).path == '/__ui_version' else 'no-cache' if not self.path.startswith('/data-') else 'public, max-age=31536000, immutable')
            self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','strict-origin-when-cross-origin')
        super().end_headers()
    def log_message(self,fmt,*args):
        if is_local_login_target(getattr(self, 'path', '')):return
        if args and str(args[0]).startswith(('GET /version.json', 'GET /__ui_version')):return
        super().log_message(fmt,*args)

def collector():
    while True:
        time.sleep(poll_seconds(ROOT))
        try:
            report,version=build()
            print(json.dumps({'refresh':version,'source':report['sourceUpdatedAt'],'status':report['sourceStatus']['status']}),flush=True)
        except PreviewBuildError as error:
            print(json.dumps({'refresh':'failed','reason':str(error),'retainedNamedSnapshots':True}),flush=True)

def parse_arguments(argv=None):
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765);parser.add_argument('--offline',action='store_true');parser.add_argument('--no-collector',action='store_true');parser.add_argument('--private-own-site',action='store_true');parser.add_argument('--private-password-stdin',action='store_true')
    parser.add_argument('--private-own-site-browser-login',action='store_true')
    parser.add_argument('--existing-build',action='store_true')
    args=parser.parse_args(argv)
    if args.private_password_stdin and not args.private_own_site:raise SystemExit('Private password input requires explicit private own-site mode')
    if args.private_own_site_browser_login and (args.private_own_site or args.private_password_stdin or args.port != 8765):raise SystemExit('Browser sign-in requires its own explicit local8765 mode')
    if args.existing_build and (not args.no_collector or args.offline):raise SystemExit('Existing build requires no collector and no build request')
    return args


if __name__=='__main__':
    args=parse_arguments()
    if args.private_own_site:
        try:enable_private_own_site(read_password(stdin=sys.stdin.buffer if args.private_password_stdin else None))
        except Exception:raise SystemExit('Private own-site credentials unavailable') from None
    if args.private_own_site_browser_login:_browser_login.enable()
    if args.existing_build:
        try:report,version=verified_output(ROOT)
        except (OSError,ValueError,TypeError,KeyError):raise SystemExit('Existing preview build unavailable') from None
    else:
        try:
            report,version=build(args.offline)
        except PreviewBuildError as error:
            # A startup failure can still serve a verified previous completed build;
            # no immediate retry or second provider call is made.
            try:report,version=verified_output(ROOT)
            except (OSError,ValueError,TypeError,KeyError):raise SystemExit('Preview build unavailable: '+str(error)) from None
            print(json.dumps({'initialBuild':'failed','reason':str(error),'retaining':version}),flush=True)
    if not args.no_collector:threading.Thread(target=collector,daemon=True).start()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Local: http://127.0.0.1:{args.port}',flush=True)
    print(f'Data source time: {report["sourceUpdatedAt"]}; no deployment enabled.',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:server.server_close()
