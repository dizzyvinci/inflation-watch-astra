"""Local preview and one ten-minute collector. No Git pushes or deployment."""
import argparse
import hashlib
import http.server
import json
import re
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit
from engine import ROOT, build, read
from catalog_local import LocalCatalog

_catalog = LocalCatalog(ROOT)

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
        response = _catalog.handle(self.command, self.path, self.headers)
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
        time.sleep(read(ROOT/'config.json')['poll_seconds'])
        try:
            report,version=build()
            print(json.dumps({'refresh':version,'source':report['sourceUpdatedAt'],'status':report['sourceStatus']['status']}),flush=True)
        except Exception as error:
            print('Refresh failed; retaining previous output: '+str(error),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765);parser.add_argument('--offline',action='store_true');parser.add_argument('--no-collector',action='store_true');args=parser.parse_args()
    report,version=build(args.offline)
    if not args.no_collector:threading.Thread(target=collector,daemon=True).start()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Local: http://127.0.0.1:{args.port}',flush=True)
    print(f'Data source time: {report["sourceUpdatedAt"]}; no deployment enabled.',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:server.server_close()
