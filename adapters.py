"""Normalize public browser-tool prices and published smega tables.

Capture time is never substituted for the source's unknown trade/scan time.
"""
import argparse
import datetime as dt
import hashlib
import json
import re
from pathlib import Path
from engine import ROOT, UTC, atomic, read, positive


def unpack_tool_result(result):
    if isinstance(result,str):result=json.loads(result)
    if 'content' in result:
        text=next(c['text'] for c in result['content'] if c.get('type')=='text')
        return json.loads(text)
    return result


def check_stamp(stamp):
    if not isinstance(stamp,str):raise ValueError('Capture needs an actual capturedAt timestamp')
    try:parsed=dt.datetime.fromisoformat(stamp.replace('Z','+00:00'))
    except ValueError as error:raise ValueError('Invalid capture timestamp') from error
    if parsed.tzinfo is None or parsed>dt.datetime.now(UTC)+dt.timedelta(minutes=5):
        raise ValueError('Capture needs a timezone-aware, nonfuture timestamp')
    return parsed


def normalize_prices(payload):
    check_stamp(payload['capturedAt'])
    if payload.get('sourceUrl')!='https://mesos.watch/':raise ValueError('Unknown price source')
    items=[];seen=set()
    for entry in payload['items']:
        raw=unpack_tool_result(entry.get('result',entry))
        name=raw.get('item') or entry.get('requested')
        if name in seen:raise ValueError('Duplicate item capture')
        seen.add(name)
        if raw.get('price_basis')!='median of sales':continue
        if not all(positive(raw.get(k)) for k in ['typical_sale_price','sales_counted','window_days']):continue
        if not 1<=raw['window_days']<=90:raise ValueError('Invalid sale window')
        items.append({'name':name,'id':raw.get('id'),'price':raw['typical_sale_price'],'salesCounted':raw['sales_counted'],'windowDays':raw['window_days'],'salesPerHourProxy':raw['sales_counted']/(24*raw['window_days'])})
    if not items:raise ValueError('No usable scanner sale medians')
    return {'sourceUrl':payload['sourceUrl'],'capturedAt':payload['capturedAt'],'scannerFreshnessText':payload.get('scannerFreshnessText','Unknown'), 'observationTimestampKnown':False,'kind':'rolling_scanner_reference','items':items}


def import_prices(path):
    normalized=normalize_prices(read(path))
    atomic(ROOT/'cache'/'public-browser-prices.json',normalized)
    return normalized


def rolling_reference(rows,cash,root=None):
    root=root or ROOT
    basket_version=read(root/'config.json',{}).get('basket_version',1)
    payload=read(root/'cache'/'public-browser-prices.json')
    if not payload:return None,[]
    by_name={i['name']:i for i in payload['items']}
    coverage=sum(r['weight'] for r in rows if r['name'] in by_name)
    cpi=sum(r['weight']*by_name[r['name']]['price']/r['basePrice'] for r in rows if r['name'] in by_name)/coverage*100 if coverage>=.8 else None
    rate_rows=[(by_name[r['name']]['price']/r['nx'],by_name[r['name']]['salesPerHourProxy']) for r in cash if r['name'] in by_name]
    nx=sum(p*q for p,q in rate_rows)/sum(q for p,q in rate_rows) if len(rate_rows)>=3 else None
    result={**payload,'basketVersion':basket_version,'cpiReference':cpi,'nxRateReference':nx,'coverage':coverage,'cashItems':len(rate_rows),'windowMinDays':min(r['windowDays'] for r in payload['items']),'windowMaxDays':max(r['windowDays'] for r in payload['items'])}
    content=json.dumps(payload['items'],sort_keys=True,separators=(',',':'))
    digest=hashlib.sha256(content.encode()).hexdigest()[:16]
    path=root/'cache'/('rolling-reference-history.json' if basket_version==1 else f'rolling-reference-history-v{basket_version}.json')
    history=read(path,[])
    if not history or history[-1]['contentHash']!=digest:
        history.append({'at':payload['capturedAt'],'cpi':cpi,'nxRate':nx,'contentHash':digest,'sourceUrl':payload['sourceUrl'],'timestampKind':'captured_at','observationTimestampKnown':False})
        atomic(path,history[-10000:])
    return result,history


CELL=re.compile(r'^1:([\d.]+)\s*\(([\d.]+)[–-]([\d.]+)\)\s*·\s*(\d+)$')


def normalize_smega_table(payload):
    check_stamp(payload.get('capturedAt'))
    if payload.get('sourceUrl')!='https://maplestory.market/ads?tab=services':raise ValueError('Unknown smega source')
    # Offset is explicit because the source table prints local dates without zone.
    # Callers must split a capture at DST transitions or provide per-row offsets.
    offset=dt.timezone(dt.timedelta(minutes=payload['utcOffsetMinutes']))
    output=[];seen=set()
    for row in payload['rows']:
        stamp=dt.datetime.strptime(str(payload['year'])+' '+row[0],'%Y %b %d, %I:%M %p').replace(tzinfo=offset).astimezone(UTC).isoformat()
        if stamp in seen:raise ValueError('Ambiguous/duplicate local hour; provide separate offsets at DST transition')
        seen.add(stamp)
        for side,text in zip(['sell','buy'],row[1:]):
            if text=='—':continue
            match=CELL.match(text)
            if not match:raise ValueError('Malformed published rate cell')
            rate,low,high,count=match.groups();rate=float(rate);low=float(low);high=float(high);count=int(count)
            if not 0<low<=rate<=high or count<1:raise ValueError('Invalid source quantiles/count')
            output.append({'at':stamp,'rate':rate,'p25':low,'p75':high,'sampleCount':count,'side':side,'kind':'smega_ask' if side=='sell' else 'smega_bid','sourceUrl':payload['sourceUrl'],'aggregation':'source_published_hourly','capturedAt':payload['capturedAt']})
    output.sort(key=lambda row:(row['at'],row['side']))
    return output


def import_smega_table(path):
    payload=read(path);points=normalize_smega_table(payload)
    from smega_history import import_capture
    return import_capture(ROOT,payload,points,normalize_raw=normalize_smega_table)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('kind',choices=['prices','smega-table']);parser.add_argument('path',type=Path);args=parser.parse_args()
    result=import_prices(args.path) if args.kind=='prices' else import_smega_table(args.path)
    print(json.dumps({'imported':len(result['items']) if args.kind=='prices' else len(result)}))
