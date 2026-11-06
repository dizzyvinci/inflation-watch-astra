"""Synthetic local reader responses for the real frontend client. No network."""
import json
from pathlib import Path
import test_local_cash_reader as fixture
ROOT=Path(__file__).resolve().parents[1]
fixture.TARGETS=json.loads((ROOT/'ops/api-cash-bindings-v1.json').read_text(encoding='utf-8'))['targets']
f=fixture.Fixture([fixture.good(),TimeoutError()])
first=f.get();head=f.get('HEAD');conditional=f.get(headers={'Host':'localhost','If-None-Match':first.headers['ETag']})
f.advance();stale=f.get(headers={'Host':'localhost','If-None-Match':first.headers['ETag']})
def serialize(r):return {'status':r.status,'headers':r.headers,'body':r.body.decode('utf-8')}
print(json.dumps({'synthetic':True,'externalRequests':0,'responses':[serialize(first),serialize(conditional),serialize(stale)],'head':serialize(head)}))
