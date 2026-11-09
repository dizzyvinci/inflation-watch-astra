"""Normalize authorized timestamped smega exports. Advertisements never enter CPI."""
import argparse
import datetime as dt
import hashlib
import json
import re
import statistics
from pathlib import Path
from engine import ROOT, UTC, atomic, read

# Match a whole ASCII quantity: ordinary/grouped digits or a leading decimal.
# Never search inside a signed, scientific or malformed numeric token.
AMOUNT=r'(?<![\w.,+\-\u2212\u2013\u2014$\u20ac\u00a3\u00a5])((?:(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?|\.[0-9]+))\s*([km]?)(?![0-9.,])'
EXPLICIT=re.compile(AMOUNT+r'\s*nx\s*(?:for|=|:|/)\s*'+AMOUNT+r'\s*(?:mesos?|meso)\b',re.I)
REVERSE=re.compile(AMOUNT+r'\s*(?:mesos?|meso)\s*(?:for|=|:|/)\s*'+AMOUNT+r'\s*nx\b',re.I)
SELL=re.compile(r'(?:\bS\s*>|\bWTS\b|\bsell(?:ing)?\b)',re.I)
BUY=re.compile(r'(?:\bB\s*>|\bWTB\b|\bbuy(?:ing)?\b)',re.I)

def offer_side(text, declared=None):
    """An unclassified or mixed message cannot be called a seller ask."""
    sell,buy=bool(SELL.search(text)),bool(BUY.search(text))
    if sell and buy:return None
    inferred='sell' if sell else 'buy' if buy else None
    if declared is not None:
        if declared not in ('sell','buy') or (inferred and inferred!=declared):return None
        return declared
    return inferred

def amount(value,suffix):
    return float(value.replace(',',''))*{'':1,'k':1000,'m':1000000}[suffix.lower()]

def ambiguous_numeric_prefix(text,end):
    """Refuse a numeric continuation; ordinary word context is not a quantity.

    Walk only backward through the preceding lexical tail. Whitespace around a
    decimal/grouping/exponent marker never grants a new numeric-token boundary.
    This classifies ambiguity; it does not repair or parse another amount.
    """
    digits='0123456789'
    signs='+\u002d\u2212\u2013\u2014/$\u20ac\u00a3\u00a5'
    numeric_chars=digits+'.,_eEkKmM'+signs
    delimiters='()[]{}<>:;!?=\"\''
    while end:
        while end and text[end-1].isspace():end-=1
        if not end:return False
        if text[end-1] in signs:return True
        start=end
        while start and not text[start-1].isspace() and text[start-1] not in delimiters:start-=1
        if start==end:return False
        token=text[start:end]
        if token[0] in digits+'.' and all(c in numeric_chars for c in token):return True
        if all(c in numeric_chars for c in token):
            if '.' in token:return True
            end=start
            continue
        return False
    return False

def parse_rate(text):
    # Bare 1:20 is ambiguous; require explicit NX and meso units.
    match=EXPLICIT.search(text)
    if match:
        if ambiguous_numeric_prefix(text,match.start()):return None
        a,b,c,d=match.groups();nx=amount(a,b);meso=amount(c,d)
    else:
        match=REVERSE.search(text)
        if not match:return None
        if ambiguous_numeric_prefix(text,match.start()):return None
        a,b,c,d=match.groups();meso=amount(a,b);nx=amount(c,d)
    rate=meso/nx if nx else None
    return rate if rate and .01<=rate<=10000 else None

def ingest(path):
    observations=read(path)
    if not isinstance(observations,list):raise ValueError('Expected an array of timestamped messages')
    hourly={}
    seen=set()
    for obs in observations:
        text=obs.get('text','')
        rate=parse_rate(text)
        side=offer_side(text,obs.get('side'))
        if rate is None or side is None:continue
        when=dt.datetime.fromisoformat(obs['at'].replace('Z','+00:00'))
        if when.tzinfo is None or when>dt.datetime.now(UTC):raise ValueError('Messages need real, nonfuture timezone-aware timestamps')
        source=obs['sourceUrl']
        if not source.startswith('https://'):raise ValueError('Each message needs its real source URL')
        sender=obs.get('senderId')
        if not sender:continue
        bucket=when.astimezone(UTC).replace(minute=0,second=0,microsecond=0).isoformat()
        identity=hashlib.sha256((source+'|'+str(sender)).encode()).hexdigest()
        key=(bucket,identity,side)
        if key in seen:continue
        seen.add(key)
        hourly.setdefault((bucket,source,side),[]).append(rate)
    series=[]
    for (bucket,source,side),rates in sorted(hourly.items()):
        if len(rates)<3:continue
        center=statistics.median(rates);mad=statistics.median(abs(r-center) for r in rates)
        kept=[r for r in rates if abs(r-center)<=max(3*mad,center*.25)]
        if len(kept)<3:continue
        series.append({'at':bucket,'rate':statistics.median(kept),'distinctSenders':len(kept),'sourceUrl':source,'side':side,'kind':'smega_ask' if side=='sell' else 'smega_bid','aggregation':'explicit_unit_hourly_sender_median'})
    atomic(ROOT/'cache'/'smega-series.json',series)
    return series

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('input',type=Path);args=parser.parse_args();print(json.dumps({'hourlyPoints':len(ingest(args.input))}))
