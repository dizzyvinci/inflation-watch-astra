import ast
import io
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
HERE=Path(__file__).resolve().parents[1]
CAN=HERE
sys.path.insert(0,str(CAN));sys.path.insert(0,str(HERE))

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod=types.ModuleType('calculation_preview_proposal_test');cls.mod.__file__=str(CAN/'preview.py')
        sys.modules[cls.mod.__name__]=cls.mod
        # Execute proposal source while retaining canonical ROOT dependencies;
        # no process/server/build is started. Every source transport stays off.
        with patch.dict(os.environ,{'LOCAL_API_CALCULATIONS':'0'}):exec(compile((HERE/'preview.py').read_text(encoding='utf-8'),str(HERE/'preview.py'),'exec'),cls.mod.__dict__)
    def test_exact_env_optin_no_truthy_other_spellings(self):
        for value in ('','0','true','false','yes'):
            with patch.dict(os.environ,{'LOCAL_API_CALCULATIONS':value}):self.assertFalse(self.mod._calculations.active())
        with patch.dict(os.environ,{'LOCAL_API_CALCULATIONS':'1'}):self.assertTrue(self.mod._calculations.active())
    def fixture(self,path='/',command='GET'):
        calls=[]
        h=types.SimpleNamespace(path=path,command=command,wfile=io.BytesIO(),send_response=lambda s:calls.append(('status',s)),send_header=lambda k,v:calls.append((k,v)),end_headers=lambda:None)
        return h,calls
    def test_narrow_html_gate_preserves_footer_control_locks_clocks_and_head(self):
        raw=b'<!doctype html><html><body class="review" data-viewer-mode="true"><main>Original clocks</main><footer id="review-footer"><button>Unlock controls</button></footer></body></html>'
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'dist').mkdir();(root/'dist/index.html').write_bytes(raw)
            with patch.object(self.mod,'ROOT',root),patch.dict(os.environ,{'LOCAL_API_CALCULATIONS':'1'}):
                h,calls=self.fixture();self.assertTrue(self.mod.Handler._serve_calculation_index(h));body=h.wfile.getvalue();self.assertIn(b'data-api-calculations-available="true"',body);self.assertIn(b'<main>Original clocks</main><footer id="review-footer"><button>Unlock controls</button></footer>',body)
                head,_=self.fixture(command='HEAD');self.assertTrue(self.mod.Handler._serve_calculation_index(head));self.assertEqual(head.wfile.getvalue(),b'')
            with patch.object(self.mod,'ROOT',root),patch.dict(os.environ,{'LOCAL_API_CALCULATIONS':'0'}):
                h,_=self.fixture();self.assertFalse(self.mod.Handler._serve_calculation_index(h))
                (root/'dist/index.html').write_bytes(body);h,_=self.fixture();self.assertTrue(self.mod.Handler._serve_calculation_index(h));self.assertEqual(h.wfile.getvalue(),raw)
    def test_no_index_file_or_other_route_does_not_build_read_or_fetch(self):
        h,_=self.fixture(path='/__ui_version');self.assertFalse(self.mod.Handler._serve_calculation_index(h))
        with tempfile.TemporaryDirectory() as tmp,patch.object(self.mod,'ROOT',Path(tmp)):
            h,_=self.fixture();self.assertFalse(self.mod.Handler._serve_calculation_index(h))
    def test_catalog_handler_consumes_off_route_before_static_or_other_reader(self):
        h,calls=self.fixture(path='/api-market-calculations.json');h.headers={'Host':'localhost:8765'};h.server=types.SimpleNamespace(server_address=('127.0.0.1',8765));h.client_address=('127.0.0.1',12345)
        h._serve_basic_items=types.MethodType(self.mod.Handler._serve_basic_items,h)
        with patch.dict(os.environ,{'LOCAL_API_CALCULATIONS':'0'}),patch.object(self.mod._cash,'handle',side_effect=AssertionError('oldreader should not run')):
            self.assertTrue(self.mod.Handler._serve_catalog(h))
        self.assertIn(('status',404),calls);self.assertTrue(h._catalog_response)
        self.assertNotIn('Prices-Captured-At',str(calls))
if __name__=='__main__':unittest.main(verbosity=2)
