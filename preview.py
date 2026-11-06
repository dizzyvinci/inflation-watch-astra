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

ROOT = Path(__file__).resolve().parent
BUILD_TIMEOUT_SECONDS = 120
_build_guard = threading.Lock()
_catalog = LocalCatalog(ROOT)
_cash = LocalCashReader(ROOT)
_nx = LocalNxReader()
_items = LocalItemReader(ROOT)


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
        if self._serve_catalog():return
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
        if self._serve_catalog():return
        if urlsplit(self.path).path == '/__ui_version':
            self.send_response(405);self.send_header('Allow','GET');self.send_header('Content-Length','0');self.end_headers();return
        super().do_HEAD()
    def _serve_catalog(self):
        self._catalog_response = False
        response = _cash.handle(self.command, self.path, self.headers,
                               bind_host=self.server.server_address[0],client_host=self.client_address[0])
        if response is None:response = _nx.handle(self.command, self.path, self.headers,
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
        if not self._serve_catalog():self.send_error(501, 'Unsupported method')
    do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = _catalog_or_unsupported
    def end_headers(self):
        if getattr(self,'_etag',None):self.send_header('ETag',self._etag);self._etag=None
        if not getattr(self, '_catalog_response', False):
            self.send_header('Cache-Control','no-store' if urlsplit(self.path).path == '/__ui_version' else 'no-cache' if not self.path.startswith('/data-') else 'public, max-age=31536000, immutable')
            self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','strict-origin-when-cross-origin')
        super().end_headers()
    def log_message(self,fmt,*args):
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

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765);parser.add_argument('--offline',action='store_true');parser.add_argument('--no-collector',action='store_true');args=parser.parse_args()
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
