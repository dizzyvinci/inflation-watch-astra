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
    from rolling_history import normalize_capture
    return normalize_capture(payload)


def import_prices(path):
    from rolling_history import import_capture
    return import_capture(ROOT,read(path))


def rolling_reference(rows,cash,root=None):
    root=root or ROOT
    basket_version=read(root/'config.json',{}).get('basket_version',1)
    payload=read(root/'cache'/'public-browser-prices.json')
    if not payload:return None,[]
    from rolling_history import comparable_inputs,legacy_capture
    if payload.get('schemaVersion')!=2:payload=legacy_capture(payload)
    goods,cash_items,comparison=comparable_inputs(rows,cash,payload)
    coverage=comparison['comparableBasketCoverage']
    cpi=sum(r['weight']*goods[r['name']]['price']/r['basePrice'] for r in rows if r['name'] in goods)/coverage*100 if coverage>=.8 else None
    rate_rows=[(cash_items[r['name']]['price']/r['nx'],cash_items[r['name']]['salesPerHourProxy']) for r in cash if r['name'] in cash_items]
    nx=sum(p*q for p,q in rate_rows)/sum(q for p,q in rate_rows) if len(rate_rows)>=3 else None
    result={**payload,'basketVersion':basket_version,'cpiReference':cpi,'nxRateReference':nx,'coverage':coverage,'cashItems':len(rate_rows),'comparison':comparison,'aggregateHistoryNote':'Older aggregate points may lack roll identity; variant histories remain separate in the private capture ledger. No quality-constant history is claimed.','windowMinDays':min(r['windowDays'] for r in payload['items']),'windowMaxDays':max(r['windowDays'] for r in payload['items'])}
    measurement=[{key:item.get(key) for key in ('name','id','price','salesCounted','windowDays','statRollStatus','statRoll','sourceObservedAt','sourceWindowStartAt','sourceWindowEndAt')} for item in payload['items']]
    content=json.dumps({'comparisonMethodVersion':3,'items':measurement},sort_keys=True,separators=(',',':'))
    digest=hashlib.sha256(content.encode()).hexdigest()[:16]
    path=root/'cache'/('rolling-reference-history.json' if basket_version==1 else f'rolling-reference-history-v{basket_version}.json')
    history=read(path,[])
    if not history or (history[-1]['contentHash']!=digest and check_stamp(history[-1]['at'])!=check_stamp(payload['capturedAt'])):
        history.append({'at':payload['capturedAt'],'cpi':cpi,'nxRate':nx,'contentHash':digest,'sourceUrl':payload['sourceUrl'],'timestampKind':'captured_at','observationTimestampKnown':False,'comparisonMethodVersion':3,'comparableCoverage':coverage,'capturedCoverage':comparison['capturedBasketCoverage'],'qualityConstant':False})
        atomic(path,history[-10000:])
    return result,history


CELL=re.compile(r'^1:([\d.]+)\s*\(([\d.]+)[–-]([\d.]+)\)\s*·\s*(\d+)$')


def smega_row_offsets(payload):
    rows=payload.get('rows')
    if not isinstance(rows,list) or any(not isinstance(row,list) or len(row)!=3 or not all(isinstance(cell,str) for cell in row) for row in rows):
        raise ValueError('Published table requires three-column string rows')
    def valid(value):return isinstance(value,int) and not isinstance(value,bool) and -840<=value<=840
    if 'utcOffsetMinutes' in payload and not valid(payload['utcOffsetMinutes']):raise ValueError('Invalid explicit UTC offset')
    if 'rowUtcOffsetMinutes' in payload:
        offsets=payload['rowUtcOffsetMinutes']
        if not isinstance(offsets,list) or len(offsets)!=len(rows) or not all(valid(value) for value in offsets):
            raise ValueError('Per-row UTC offsets must match row count and be integers within ±840 minutes')
        return offsets
    if 'utcOffsetMinutes' not in payload:raise ValueError('An explicit UTC offset is required')
    return [payload['utcOffsetMinutes']]*len(rows)


def normalize_smega_table(payload):
    check_stamp(payload.get('capturedAt'))
    if payload.get('sourceUrl')!='https://maplestory.market/ads?tab=services':raise ValueError('Unknown smega source')
    # Offset is explicit because the source table prints local dates without zone.
    # Callers must split a capture at DST transitions or provide per-row offsets.
    offsets=smega_row_offsets(payload)
    year=payload.get('year')
    if not isinstance(year,int) or isinstance(year,bool) or not 1<=year<=9999:raise ValueError('An explicit source year is required')
    output=[];seen=set()
    for row,minutes in zip(payload['rows'],offsets):
        local=dt.datetime.strptime(str(year)+' '+row[0],'%Y %b %d, %I:%M %p')
        if 'rowUtcOffsetMinutes' not in payload and payload.get('displayTimeZone'):
            from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
            try:zone=ZoneInfo(payload['displayTimeZone'])
            except (ZoneInfoNotFoundError,ValueError) as error:raise ValueError('IANA zone unavailable; declare per-row offsets explicitly') from error
            if local.replace(tzinfo=zone,fold=0).utcoffset()!=local.replace(tzinfo=zone,fold=1).utcoffset():
                raise ValueError('Ambiguous local hour requires explicit per-row UTC offsets')
        offset=dt.timezone(dt.timedelta(minutes=minutes))
        stamp=local.replace(tzinfo=offset).astimezone(UTC).isoformat()
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
    if args.kind=='prices':
        status=result['intakeStatus'];print(json.dumps({'storedSaleReceipts':status['eligibleSaleCount'],'projectionStatus':status['status'],'projectionReason':status['reason'],'projectionItemCount':status['projectionItemCount'],'missingTargets':status['missingTargetCount']}))
    else:print(json.dumps({'imported':len(result)}))
