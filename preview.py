"""Local preview and one ten-minute collector. No Git pushes or deployment."""
import argparse
import hashlib
import http.server
import json
import threading
import time
from pathlib import Path
from engine import ROOT, build, read

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT/'dist'),**kwargs)
    def do_GET(self):
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
    def end_headers(self):
        if getattr(self,'_etag',None):self.send_header('ETag',self._etag);self._etag=None
        self.send_header('Cache-Control','no-cache' if not self.path.startswith('/data-') else 'public, max-age=31536000, immutable')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','strict-origin-when-cross-origin')
        super().end_headers()
    def log_message(self,fmt,*args):
        if args and str(args[0]).startswith('GET /version.json'):return
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
