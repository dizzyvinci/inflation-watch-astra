from pathlib import Path
import json,re,sys,unittest
P=Path(__file__).resolve().parents[1];sys.path[:0]=[str(P),str(P/'tests')]
import local_login as login
import test_local_browser_login as old

class Tests(unittest.TestCase):
 def test_form_policy_is_same_origin_and_same_origin_post_keeps_strict_success(self):
  f=old.Tests();c,s,b,clock,attached=f.fixture();page=f.get(c,Origin=None)
  self.assertEqual(page.status,200);self.assertEqual(page.headers['Referrer-Policy'],'same-origin');self.assertNotIn(b'<script',page.body);self.assertIn(b'action="/__local_login"',page.body)
  nonce=re.search(rb'name="nonce" value="([A-Za-z0-9_-]+)"',page.body).group(1).decode();out=f.post(c,nonce)
  self.assertEqual(out.status,303);self.assertEqual(out.body,b'');self.assertEqual(out.headers['Location'],'/');self.assertEqual(attached,['attached']);self.assertEqual([p for p,r in b.calls],['/__preview_login','/__preview_controls']);self.assertNotIn('SYNTHETIC_PASSWORD',json.dumps(out.headers));self.assertNotIn('Set-Cookie',out.headers)
 def test_null_missing_foreign_and_crosssite_origins_still_refuse_before_body_or_auth(self):
  for change in[{'Origin':'null'},{'Origin':None},{'Origin':'https://foreign.invalid'},{'Origin':'http://127.0.0.1:8766'},{'Origin':'https://127.0.0.1:8765'},{'Origin':'http://localhost:8765'},{'Sec-Fetch-Site':'cross-site'}]:
   f=old.Tests();c,s,b,clock,attached=f.fixture();nonce=f.form(c);reads=[]
   out=f.post(c,nonce,read=lambda n,t:reads.append(n)or b'',**change);self.assertEqual(out.status,400);self.assertEqual(reads,[]);self.assertEqual(b.calls,[]);self.assertFalse(s.enabled);self.assertEqual(attached,[]);self.assertEqual(c.nonce,nonce)
 def test_referer_cannot_substitute_for_null_origin_or_nonce(self):
  f=old.Tests();c,s,b,clock,attached=f.fixture();nonce=f.form(c);reads=[]
  out=f.post(c,nonce,Origin='null',Referer='http://127.0.0.1:8765/__local_login',read=lambda n,t:reads.append(n)or b'');self.assertEqual(out.status,400);self.assertEqual(reads,[]);self.assertEqual(b.calls,[])
  out=f.post(c,'not-the-nonce',Referer='http://127.0.0.1:8765/__local_login');self.assertEqual(out.status,401);self.assertEqual(b.calls,[]);self.assertFalse(s.enabled)
 def test_every_form_response_keeps_csp_private_headers_without_other_policy_changes(self):
  before=login.HEADERS.copy();self.assertEqual(before.pop('Referrer-Policy'),'same-origin')
  for status in[200,400,401,423,429,503]:
   out=login.response(status,nonce='A'*32 if status==200 else None);self.assertEqual(out.headers['Referrer-Policy'],'same-origin')
   for k,v in before.items():self.assertEqual(out.headers[k],v)
   self.assertEqual(out.headers['Cache-Control'],'private, no-store, no-transform');self.assertIn("form-action 'self'",out.headers['Content-Security-Policy']);self.assertNotIn('Set-Cookie',out.headers)

if __name__=='__main__':unittest.main(verbosity=2)
