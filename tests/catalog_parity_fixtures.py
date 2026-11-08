"""Generate temporary offline reference outputs from the canonical pure Python projector."""
import copy
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from market_catalog import MarketCatalog
from portable_hash import canonical_bytes,portable_hash,HASH_METHOD

root=Path(__file__).resolve().parents[1]
if len(sys.argv)!=2:raise SystemExit('Pass a temporary fixture output directory')
out=Path(sys.argv[1]);out.mkdir(exist_ok=True)
feed=json.loads((root/'tests/fixtures/worker-historical-market-20261104.json').read_text(encoding='utf-8'))
identities=json.loads((root/'catalog-identities-v1.json').read_text(encoding='utf-8'))
catalog=MarketCatalog(feed,identities)
actual={'feed':feed,'identities':identities,'index':catalog.build_index(),'items':{r['s']:catalog.resolve_item(r['s']) for r in feed['items']}}
actual['metadata']={'schemaVersion':1,'hashMethod':HASH_METHOD,'catalogHash':catalog.catalog_hash,'sourceProjectionHash':catalog.source_projection_hash,
                    'sourceUpdatedAt':catalog.source_updated_at,'itemCount':len(feed['items']),
                    'identityVersion':portable_hash({'hashMethod':HASH_METHOD,'identityMap':identities})}
(out/'actual.json').write_text(json.dumps(actual,ensure_ascii=True,separators=(',',':'),allow_nan=False),encoding='utf-8')

base={'updatedAt':'2026-11-05T00:30:00+02:00','items':[
 {'s':'2','n':'Orb \U0001f30d e\u0301','k':'Etc','p':1.0,'p25':1e-7,'p75':1e-4,'lo':5e-324,'hi':9007199254740991,'ask':2.3,'asks':-0.0,'sellers':1.0,'sold':5.0,'st':-0.0,'ld':True,'last':'2026-11-04T20:12:34.123456789+05:45','h':[['2026-11-01',1.0,-0.0],['2026-11-03',1e-7,4.0],['2026-11-04',1.2e-4,5.0]]},
 {'s':'10','n':'\ufeff','k':'Cash Shop','p':None,'h':[]} ]}
identity={'slug':'2','name':base['items'][0]['n'],'id':1.0,'planHash':'a'*64}
cases=[]
def add(name,change=None,ids=None,custom=None):
    source=copy.deepcopy(base if custom is None else custom)
    if change:change(source)
    entry={'name':name,'feed':source,'identities':copy.deepcopy([identity] if ids is None else ids)}
    try:
        c=MarketCatalog(source,entry['identities']);entry['expected']={'index':c.build_index(),'items':{r['s']:c.resolve_item(r['s']) for r in source['items']}}
    except Exception as error:entry['error']=type(error).__name__
    cases.append(entry)
add('whole-float-counts-exponents-unicode-offset')
add('identity-conflict',ids=[identity,{**identity,'id':2}])
add('same-id-two-slugs',ids=[identity,{**identity,'slug':'10','name':'\ufeff'}])
add('case-name-not-identity',ids=[{**identity,'name':identity['name'].lower()}])
add('source-order-independent',lambda f:f['items'].reverse())
add('unicode-200-codepoints',lambda f:f['items'][1].update(n='\U0001f30d'*200))
add('unicode-201-codepoints',lambda f:f['items'][1].update(n='\U0001f30d'*201))
add('unicode-whitespace-only',lambda f:f['items'][1].update(n='\u0085\u2003'))
add('malformed-offset-source',lambda f:f.update(updatedAt='2026-11-04T00:00:00+00:99'))
add('malformed-offset-summary',lambda f:f['items'][0].update(last='2026-11-04T00:00:00+00:99'))
add('invalid-calendar-day',lambda f:f['items'][0].update(h=[['2026-02-30',1,5]]))
add('future-day',lambda f:f['items'][0].update(h=[['2026-11-05',1,5]]))
add('duplicate-day',lambda f:f['items'][0].update(h=[['2026-11-04',1,5],['2026-11-04',1,5]]))
add('boolean-history-count',lambda f:f['items'][0].update(h=[['2026-11-04',1,True]]))
add('fractional-count',lambda f:f['items'][0].update(h=[['2026-11-04',1,5.5]]))
add('unsafe-price',lambda f:f['items'][0].update(h=[['2026-11-04',9007199254740992,5]]))
add('private-unknown-fields',lambda f:f['items'][0].update(password='SECRET',player='SECRET',stats={'ATT':99},nx=123))
add('leap-year',custom={'updatedAt':'2024-02-29T23:59:59Z','items':[{'s':'leap','n':'Leap','k':'Etc','h':[['2024-02-29',1,5]]}]},ids=[])
add('year-one',custom={'updatedAt':'0001-01-02T00:00:00Z','items':[{'s':'early','n':'Early','k':'Etc','h':[['0001-01-01',1,5]]}]},ids=[])
add('old-offset-year-overflow',custom={'updatedAt':'0001-01-01T00:00:00+23:59','items':[]},ids=[])
add('nan-summary',lambda f:f['items'][0].update(p=None,p25='bad',p75=True,st=2,asks=1.5,sellers=-1,last='bad'))
add('duplicate-slug',lambda f:f['items'].append(copy.deepcopy(f['items'][0])))
(out/'adversarial.json').write_text(json.dumps(cases,ensure_ascii=True,separators=(',',':'),allow_nan=False),encoding='utf-8')
values=[None,True,False,0,-0.0,1,1.0,1e-7,1e-4,1e15,5e-324,9007199254740991,'','a:b','\U0001f30d e\u0301','\u2028\u2029',[],{},[None,1,'1'],{'2':1,'10':2,'\ue000':3,'\U00010000':4}]
vectors=[{'value':v,'bytesHex':canonical_bytes(v).hex(),'hash':portable_hash(v)} for v in values]
(out/'hash-vectors.json').write_text(json.dumps({'hashMethod':HASH_METHOD,'vectors':vectors},ensure_ascii=True,separators=(',',':')),encoding='utf-8')
print(json.dumps({'items':len(feed['items']),'identities':len(identities),'points':sum(len(r['h']) for r in feed['items']),'cases':len(cases),'hashVectors':len(vectors),'sourceProjectionHash':actual['index']['sourceProjectionHash'],'catalogHash':actual['index']['catalogHash']}))
