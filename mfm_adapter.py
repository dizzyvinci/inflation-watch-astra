"""Optional importer for an explicitly authorized OWN Free Market Tracker server.

Independent interface implementation; no upstream GPL implementation is included.
Interface: https://github.com/jayee88/mfm-tracker/blob/main/server/README.md
Upstream software is GPL-3.0; this adapter does not install or distribute it.

No networking, account discovery, screen capture or authentication is performed.
An operator supplies local JSON, with the documented sightings/purges and these
explicit attestations: authorized=true, recordModel='mfm-tracker-sightings-v1',
priceUnit='mesos_per_unit', sourceUrl='https://YOUR-SERVER'. Every sighting needs
its stable uid, row seq, ts, last_seen, item, integer price/qty, sold (0/1), and
evidence ('sold' or 'ask'); sold rows also need sold_ts. Confirm unit-price
semantics before setting priceUnit. CSV exports omit qty/uid and cannot be used.
Retractions are an operator-export extension: retractions=[{uid,seq}]. Do not
invent them from disappearance in a paginated response. Purges use the documented
id, ts, what, field ('first'/'seen'), start, end; times are UTC ISO strings.

Usage: python mfm_adapter.py authorized-delta.json
Defaults: cache/mfm-own-data.sqlite, cache/market.json, incoming/observations.json.
This prepares own-data ingestion, not a continuous scanner or coverage guarantee.
"""
import argparse
import datetime as dt
import itertools
import json
import os
from pathlib import Path
import sqlite3
import tempfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
UTC = dt.timezone.utc
MODEL = 'mfm-tracker-sightings-v1'
ADAPTER = 'mfm-own-data-v1'
WINDOW_SECONDS = 2400


def integer(value, label, minimum=1):
    if type(value) is not int or not minimum <= value <= 9_000_000_000_000_000:
        raise ValueError('Invalid integer ' + label)
    return value


def stamp(value, now):
    if not isinstance(value, str):
        raise ValueError('Explicit UTC timestamp required')
    try:
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        raise ValueError('Invalid UTC timestamp') from None
    if parsed.utcoffset() != dt.timedelta(0) or parsed > now:
        raise ValueError('Timestamp must be UTC and nonfuture')
    return parsed.timestamp()


def iso(epoch):
    return dt.datetime.fromtimestamp(epoch, UTC).isoformat().replace('+00:00', 'Z')


def text(value, label):
    if not isinstance(value, str) or not value.strip() or len(value) > 500:
        raise ValueError('Missing/invalid ' + label)
    return value


def source_url(value):
    text(value, 'sourceUrl')
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Use an explicit HTTPS source URL without credentials/query/fragment')
    return value.rstrip('/')


def connect(path):
    con = sqlite3.connect(path)
    con.executescript('''
      CREATE TABLE IF NOT EXISTS sightings (
        source TEXT NOT NULL, uid TEXT NOT NULL, seq INTEGER NOT NULL,
        item TEXT, price INTEGER, qty INTEGER, first_time REAL, last_time REAL,
        sold INTEGER, sold_time REAL, active INTEGER NOT NULL,
        PRIMARY KEY(source, uid));
      CREATE INDEX IF NOT EXISTS recent_sales
        ON sightings(source, active, sold, sold_time, item, price);
      CREATE INDEX IF NOT EXISTS first_seen ON sightings(source,active,first_time);
      CREATE INDEX IF NOT EXISTS last_seen ON sightings(source,active,last_time);
      CREATE INDEX IF NOT EXISTS sold_seen ON sightings(source,active,sold_time);
      CREATE TABLE IF NOT EXISTS purges (
        source TEXT NOT NULL, id INTEGER NOT NULL, body TEXT NOT NULL,
        field TEXT NOT NULL, start REAL NOT NULL, end REAL NOT NULL,
        PRIMARY KEY(source,id));
      CREATE TABLE IF NOT EXISTS state (source TEXT PRIMARY KEY, seq INTEGER NOT NULL);
    ''')
    return con


def validate(payload, now):
    if not isinstance(payload, dict):
        raise ValueError('Expected a JSON delta object, not CSV or a bare row list')
    if payload.get('authorized') is not True or payload.get('recordModel') != MODEL or payload.get('priceUnit') != 'mesos_per_unit':
        raise ValueError('Explicit authorization, record model and unit-price evidence required')
    source = source_url(payload.get('sourceUrl'))
    high = integer(payload.get('seq'), 'delta seq', 0)
    for key in ('sightings', 'retractions', 'purges'):
        entries = payload.get(key, [])
        if not isinstance(entries, list) or len(entries) > 10000 or any(not isinstance(r, dict) for r in entries):
            raise ValueError('Use paginated arrays of at most 10000 records')
    rows = []
    for row in payload.get('sightings', []):
        uid = text(row.get('uid'), 'uid')
        seq = integer(row.get('seq'), 'row seq')
        if seq > high:
            raise ValueError('Row sequence exceeds delta sequence')
        first, last = stamp(row.get('ts'), now), stamp(row.get('last_seen'), now)
        sold = row.get('sold')
        if type(sold) is not int or sold not in (0, 1) or row.get('evidence') != ('sold' if sold else 'ask'):
            raise ValueError('Explicit matching ask/sold evidence required')
        sale = stamp(row.get('sold_ts'), now) if sold else None
        if last < first or (sale is not None and sale < first) or (not sold and row.get('sold_ts') is not None):
            raise ValueError('Contradictory observation times')
        rows.append((source, uid, seq, text(row.get('item'), 'item'),
                     integer(row.get('price'), 'unit price'), integer(row.get('qty'), 'qty'),
                     first, last, sold, sale, 1))
    retractions = []
    for row in payload.get('retractions', []):
        seq = integer(row.get('seq'), 'retraction seq')
        if seq > high:
            raise ValueError('Retraction exceeds delta sequence')
        retractions.append((text(row.get('uid'), 'uid'), seq))
    purges = []
    for row in payload.get('purges', []):
        purge_id = integer(row.get('id'), 'purge id')
        stamp(row.get('ts'), now)
        what = text(row.get('what'), 'purge what')
        kinds = set(what.split(','))
        if not kinds <= {'all', 'prices', 'megaphones', 'aliases', 'ocr'}:
            raise ValueError('Unknown purge kind')
        field = row.get('field')
        start, end = stamp(row.get('start'), now), stamp(row.get('end'), now)
        if field not in ('first', 'seen') or start >= end:
            raise ValueError('Invalid purge range')
        if kinds & {'all', 'prices'}:
            body = json.dumps({k: row[k] for k in ('id', 'ts', 'what', 'field', 'start', 'end')}, sort_keys=True)
            purges.append((source, purge_id, body, field, start, end))
    return source, high, rows, retractions, purges


def apply_delta(con, payload, now=None):
    """Validate first; atomically apply revisions, retractions and durable purges."""
    now = now or dt.datetime.now(UTC)
    source, high, rows, retractions, purges = validate(payload, now)
    with con:
        for row in rows:
            old = con.execute('SELECT * FROM sightings WHERE source=? AND uid=?', row[:2]).fetchone()
            # A purge changes active, not the original row revision/evidence.
            if old and old[2] == row[2] and old[:-1] != row[:-1]:
                raise ValueError('Conflicting data for an unchanged UID/sequence')
            first, seen = row[6], max(row[7], row[9] or row[7])
            purged = con.execute('''SELECT 1 FROM purges WHERE source=? AND
              CASE field WHEN 'first' THEN ? ELSE ? END >= start AND
              CASE field WHEN 'first' THEN ? ELSE ? END < end LIMIT 1''',
              (source, first, seen, first, seen)).fetchone()
            if purged:
                row = (*row[:-1], 0)
            con.execute('''INSERT INTO sightings VALUES (?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(source,uid) DO UPDATE SET seq=excluded.seq,item=excluded.item,
              price=excluded.price,qty=excluded.qty,first_time=excluded.first_time,
              last_time=excluded.last_time,sold=excluded.sold,sold_time=excluded.sold_time,active=excluded.active
              WHERE excluded.seq > sightings.seq''', row)
        for uid, seq in retractions:
            old = con.execute('SELECT seq,active FROM sightings WHERE source=? AND uid=?', (source, uid)).fetchone()
            if old and old == (seq, 1):
                raise ValueError('Retraction must have a newer sequence')
            con.execute('''INSERT INTO sightings(source,uid,seq,active) VALUES (?,?,?,0)
              ON CONFLICT(source,uid) DO UPDATE SET seq=excluded.seq,active=0
              WHERE excluded.seq > sightings.seq''', (source, uid, seq))
        for purge in purges:
            old = con.execute('SELECT body FROM purges WHERE source=? AND id=?', purge[:2]).fetchone()
            if old and old[0] != purge[2]:
                raise ValueError('Conflicting purge ID')
            con.execute('INSERT OR IGNORE INTO purges VALUES (?,?,?,?,?,?)', purge)
            if not old:
                # Range indexes restrict purges too; ordinary imports do not scan
                # all historical sightings. Retained ranges prevent old replay.
                _, _, _, field, start, end = purge
                if field == 'first':
                    con.execute('''UPDATE sightings SET active=0 WHERE source=? AND active=1
                      AND first_time>=? AND first_time<?''', (source,start,end))
                else:
                    con.execute('''UPDATE sightings SET active=0 WHERE source=? AND active=1
                      AND last_time>=? AND last_time<? AND (sold_time IS NULL OR sold_time<?)''',
                      (source,start,end,end))
                    con.execute('''UPDATE sightings SET active=0 WHERE source=? AND active=1
                      AND sold_time>=? AND sold_time<? AND last_time<?''',
                      (source,start,end,end))
        con.execute('''INSERT INTO state VALUES (?,?) ON CONFLICT(source)
          DO UPDATE SET seq=MAX(state.seq,excluded.seq)''', (source, high))
    return source


def build_observations(con, source, seed, now=None):
    """Read only the indexed recent window; never load retained history into RAM."""
    now = now or dt.datetime.now(UTC)
    end = now.timestamp()
    start = end - WINDOW_SECONDS
    catalog = {}
    ambiguous = set()
    for item in seed['items']:
        name, slug = text(item.get('n'), 'seed name'), text(item.get('s'), 'seed slug')
        if name in catalog and catalog[name] != slug:
            ambiguous.add(name)
        catalog[name] = slug
    con.execute('CREATE TEMP TABLE IF NOT EXISTS catalog (name TEXT PRIMARY KEY,slug TEXT NOT NULL)')
    con.execute('DELETE FROM catalog')
    con.executemany('INSERT INTO catalog VALUES (?,?)', ((n,s) for n,s in catalog.items() if n not in ambiguous))
    scope = '''FROM sightings s JOIN catalog c ON c.name=s.item
      WHERE source=? AND active=1 AND sold=1 AND sold_time>=? AND sold_time<=?'''
    args = (source, start, end)
    summaries = {slug: (qty, count, first, last) for slug,qty,count,first,last in con.execute(
        'SELECT c.slug,SUM(qty),COUNT(*),MIN(sold_time),MAX(sold_time) ' + scope + ' GROUP BY c.slug', args)}
    cursor = con.execute('SELECT c.slug,price,SUM(qty) ' + scope + ' GROUP BY c.slug,price ORDER BY c.slug,price', args)
    items = []
    for slug, prices in itertools.groupby(cursor, key=lambda row: row[0]):
        qty, count, first, last = summaries[slug]
        lower_target, upper_target = (qty + 1)//2, qty//2 + 1
        cumulative = 0
        lower = upper = None
        for _, price, weight in prices:
            cumulative += weight
            if lower is None and cumulative >= lower_target:
                lower = price
            if upper is None and cumulative >= upper_target:
                upper = price
        items.append({'slug': slug, 'price': (lower + upper)/2, 'quantity': qty,
                      'evidence': 'sold', 'saleRecords': count,
                      'observedAt': iso(first), 'lastSaleAt': iso(last)})
    if not items:
        return None
    return {'kind': 'scanner_sales', 'adapter': ADAPTER, 'sourceUrl': source,
            'observedAt': iso(min(summary[2] for summary in summaries.values())),
            'windowStart': iso(start), 'windowEnd': iso(end),
            'timestampBasis': 'earliest included actual sold_ts; never import time',
            'priceBasis': 'quantity-weighted median unit price; explicit sold records only',
            'items': items}


def publish(path, payload, source):
    """Atomic JSON publication, refusing to replace another adapter's input."""
    path = Path(path)
    if path.exists():
        existing = json.loads(path.read_text(encoding='utf-8'))
        if existing.get('adapter') != ADAPTER or existing.get('sourceUrl') != source:
            raise ValueError('Output belongs to another source/adapter; choose another --output')
    if payload is None:
        if path.exists():
            path.unlink()
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        json.dump(payload, stream, ensure_ascii=False, allow_nan=False)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('delta', type=Path)
    parser.add_argument('--database', type=Path, default=ROOT/'cache'/'mfm-own-data.sqlite')
    parser.add_argument('--seed', type=Path, default=ROOT/'cache'/'market.json')
    parser.add_argument('--output', type=Path, default=ROOT/'incoming'/'observations.json')
    args = parser.parse_args()
    if args.delta.stat().st_size > 32_000_000:
        parser.error('Use paginated JSON delta exports smaller than 32 MB')
    payload = json.loads(args.delta.read_text(encoding='utf-8'))
    seed = json.loads(args.seed.read_text(encoding='utf-8'))
    args.database.parent.mkdir(parents=True, exist_ok=True)
    con = connect(args.database)
    try:
        now = dt.datetime.now(UTC)
        source = apply_delta(con, payload, now)
        result = build_observations(con, source, seed, now)
        publish(args.output, result, source)
        print(json.dumps({'status': 'written' if result else 'no_recent_matched_sales',
                          'items': len(result['items']) if result else 0}))
    finally:
        con.close()


if __name__ == '__main__':
    main()
