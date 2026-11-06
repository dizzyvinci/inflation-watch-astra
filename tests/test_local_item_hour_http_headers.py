"""Actual urllib Message/HTTPError headers, synthetic transport only."""
import copy,io,sys,types,unittest
from pathlib import Path
from email.message import Message
from unittest.mock import patch
from urllib.error import HTTPError
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import local_item_hour_reader as m
import test_local_item_hour_reader as fixtures
class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):fixtures.Tests.setUpClass();cls.reply=fixtures.Tests.fixtures['a']['replies'][m.MANIFEST]
    def response(self,extra=None,status=200,*,as_error=False):
        h=Message()
        for k,v in self.reply['headers'].items():h[k]=v
        if extra:
            if extra[0] in ('Content-Encoding','Content-Length') and h.get(extra[0]) is None:h[extra[0]]='identity' if extra[0]=='Content-Encoding' else str(len(self.reply['body'].encode()))
            h[extra[0]]=extra[1]
        raw=self.reply['body'].encode()
        if as_error:return HTTPError('https://inflation.gg'+m.MANIFEST,status,'Synthetic',h,io.BytesIO(b''))
        class Response:
            def __init__(self):self.status=status;self.headers=h;self.body=io.BytesIO(raw)
            def __enter__(self):return self
            def __exit__(self,*a):pass
            def read1(self,n):return self.body.read(n)
        return Response()
    def test_actual_unique_HTTPMessage_is_accepted_with_exact_bytes(self):
        with patch.object(m,'build_opener',return_value=types.SimpleNamespace(open=lambda *a,**kw:self.response())):
            r=m.LocalItemHourReader().handle('GET',m.MANIFEST,{'Host':'localhost:8765'})
        self.assertEqual(r.status,200);self.assertEqual(r.body,self.reply['body'].encode())
    def test_seven_same_case_context_duplicates_fail_before_body_or_cache(self):
        cases={'ETag':'"wrong"','Content-Type':'text/html','Content-Encoding':'gzip','Content-Length':'1','X-Astra-History-Generation':'0'*64,'X-Astra-History-Source-Retrieved':'2026-11-07T01:00:00.000Z','X-Astra-History-Mode':'unsupported'}
        for key,value in cases.items():
            with self.subTest(key=key):
                response=self.response((key,value));reads=[]
                def body(n):reads.append(n);return b''
                response.read1=body
                with patch.object(m,'build_opener',return_value=types.SimpleNamespace(open=lambda *a,**kw:response)):
                    reader=m.LocalItemHourReader();r=reader.handle('GET',m.MANIFEST,{'Host':'localhost:8765'})
                self.assertEqual(r.status,503);self.assertIsNone(reader.current);self.assertNotIn('ETag',r.headers);self.assertEqual(reads,[])
    def test_304_HTTPError_duplicate_clock_rejects_without_renewing_original_cache(self):
        now=[0];reader=m.LocalItemHourReader(monotonic=lambda:now[0]);host={'Host':'localhost:8765'}
        with patch.object(m,'build_opener',return_value=types.SimpleNamespace(open=lambda *a,**kw:self.response())):first=reader.handle('GET',m.MANIFEST,host)
        now[0]=61
        with patch.object(m,'build_opener',return_value=types.SimpleNamespace(open=lambda *a,**kw:(_ for _ in ()).throw(self.response(('X-Astra-History-Source-Retrieved','2026-11-07T01:00:00.000Z'),304,as_error=True)))):
            retained=reader.handle('GET',m.MANIFEST,host)
        self.assertEqual(retained.status,200);self.assertEqual(retained.body,first.body);self.assertEqual(retained.headers['ETag'],first.headers['ETag']);self.assertEqual(retained.headers['X-Astra-History-Mode'],'retained');self.assertEqual(retained.headers['X-Astra-History-Source-Retrieved'],first.headers['X-Astra-History-Source-Retrieved'])
    def test_304_unique_HTTPError_is_still_valid_and_unchanged(self):
        now=[0];reader=m.LocalItemHourReader(monotonic=lambda:now[0]);host={'Host':'localhost:8765'}
        with patch.object(m,'build_opener',return_value=types.SimpleNamespace(open=lambda *a,**kw:self.response())):first=reader.handle('GET',m.MANIFEST,host)
        now[0]=61
        with patch.object(m,'build_opener',return_value=types.SimpleNamespace(open=lambda *a,**kw:(_ for _ in ()).throw(self.response(status=304,as_error=True)))):r=reader.handle('GET',m.MANIFEST,host)
        self.assertEqual(r.status,200);self.assertEqual(r.headers['X-Astra-History-Mode'],'current');self.assertEqual(r.body,first.body)
    def test_malformed_withdrawal_headers_still_clear_all_prior_history(self):
        for status in (401,403,404):
            now=[0];reader=m.LocalItemHourReader(monotonic=lambda:now[0]);host={'Host':'localhost:8765'}
            with patch.object(m,'build_opener',return_value=types.SimpleNamespace(open=lambda *a,**kw:self.response())):reader.handle('GET',m.MANIFEST,host)
            now[0]=61
            with patch.object(m,'build_opener',return_value=types.SimpleNamespace(open=lambda *a,**kw:(_ for _ in ()).throw(self.response(('ETag','"bad"'),status,as_error=True)))):r=reader.handle('GET',m.MANIFEST,host)
            self.assertEqual(r.status,status);self.assertIsNone(reader.current);self.assertNotIn('ETag',r.headers);self.assertNotIn('X-Astra-History-Source-Retrieved',r.headers)
    def test_direct_injected_Message_and_get_all_also_preserve_occurrences(self):
        h=Message();h['ETag']='"a"';h['ETag']='"b"'
        with self.assertRaises(m.Invalid):m.source_headers(h,200)
        # get_all remains authoritative even if an adapter's items() deduplicates.
        class HeaderAdapter:
            def items(self):return [('ETag','"a"')]
            def get_all(self,k):return ['"a"','"b"'] if k=='ETag' else None
        with self.assertRaises(m.Invalid):m.source_headers(HeaderAdapter(),304)
        self.assertEqual(m.source_headers(None,403),{})
if __name__=='__main__':unittest.main()
