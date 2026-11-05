"""Offline supplemental cash-item rolling receipts; separate from the frozen79 plan.

No HTTP, sessions, daily prices, fixed NX costs or live/headline qualification.
"""
import argparse
from contextlib import closing
import datetime as dt
import json
from pathlib import Path
import sqlite3
from rolling_history import SOURCE, _hash, _json, _stamp, normalize_capture

LEDGER = 'incoming/cash-reference-captures.sqlite3'
PROJECTION = 'cache/cash-price-references.json'
KIND = 'supplemental_cash_rolling_references'


def atomic_json(path, value):
    data = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    if path.exists() and path.read_text(encoding='utf-8') == data:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(data, encoding='utf-8')
    temporary.replace(path)
    return True


def validate_plan(plan):
    if not isinstance(plan,dict):
        raise ValueError('A plan object is required')
    if plan.get('kind') != 'supplemental_cash_rolling_capture_plan' or plan.get('sourceUrl') != SOURCE:
        raise ValueError('Unsupported supplemental plan')
    body = {k: v for k, v in plan.items() if k not in ('planHash', 'createdAt')}
    if _hash(body) != plan.get('planHash'):
        raise ValueError('Plan hash mismatch')
    targets = plan.get('requests')
    if not isinstance(targets, list) or not targets or len(targets) != plan.get('expectedItemCount') or plan.get('unresolved'):
        raise ValueError('A fully resolved exact-identity plan is required')
    by_id = {}
    for row in targets:
        item_id, name = row.get('expectedItemId'), row.get('expectedItemName')
        if type(item_id) is not int or item_id <= 0 or not isinstance(name, str) or not name.strip() or item_id in by_id:
            raise ValueError('Invalid or duplicate planned identity')
        by_id[item_id] = name
    if len({v.casefold() for v in by_id.values()}) != len(by_id):
        raise ValueError('Ambiguous planned name')
    return by_id


def normalize(payload, plan):
    if not isinstance(payload,dict):
        raise ValueError('A returned capture object is required')
    targets = validate_plan(plan)
    # A single actual receipt is a valid partial batch; its supplied per-item clock remains exact.
    if 'result' in payload and 'items' not in payload:
        payload = {'sourceUrl': payload.get('sourceUrl'), 'capturedAt': payload.get('capturedAt'),
                   'items': [payload], 'planHash': plan['planHash']}
    if payload.get('planHash') != plan['planHash'] or not isinstance(payload.get('items'), list):
        raise ValueError('The accepted frozen planHash and receipt array are required')
    if not payload['items']:
        raise ValueError('No returned receipts supplied')
    for entry in payload['items']:
        if not isinstance(entry,dict):
            raise ValueError('A returned receipt object is required')
        item_id, name = entry.get('expectedItemId'), entry.get('expectedItemName')
        if type(item_id) is not int or item_id not in targets or not isinstance(name, str) or name.casefold() != targets[item_id].casefold():
            raise ValueError('Receipt identity is outside the exact frozen plan')
    result = normalize_capture(payload, allow_empty=True)
    if any(not r.get('completedAttempt') for r in result['rejectedItems']):
        raise ValueError('Only eligible sales or verified zero-sale returns are accepted; asking prices are not sales')
    result.update({'kind': KIND, 'schemaVersion': 1, 'editionId': plan['editionId'],
                   'scope': plan['scope'], 'planHash': plan['planHash'], 'plannedItemCount': len(targets)})
    for row in result['items']:
        row.update({'supplemental': True, 'availabilityConfirmed': False,
                    'dailyHistoryEligible': False, 'fixedNxCostKnown': False, 'headlineEligible': False})
        if not row['statRollKnown']:
            row['statRollStatus'] = 'not_reported'
            row['variantKey'] = _hash({'source': SOURCE, 'id': row['id'], 'rollStatus': 'not_reported', 'statRoll': None})
            row['seriesKey'] = _hash({'variantKey': row['variantKey'], 'windowDays': row['windowDays'], 'priceBasis': row['priceBasis']})
    return result, targets


def _project(db, plan, targets):
    items = []
    for item_id in targets:
        row = db.execute('SELECT payload FROM observations WHERE item_id=? ORDER BY captured_epoch DESC,receipt_hash DESC LIMIT 1', (item_id,)).fetchone()
        if row:
            items.append(json.loads(row[0]))
    latest = json.loads(db.execute('SELECT payload FROM captures ORDER BY captured_epoch DESC,capture_hash DESC LIMIT 1').fetchone()[0])
    attempted = {r['id'] for r in latest['items'] + latest['rejectedItems']}
    clocks = [r['capturedAt'] for r in items]
    result = {'schemaVersion': 1, 'status': 'ok', 'kind': KIND, 'sourceUrl': SOURCE, 'scope': plan['scope'],
              'editionId': plan['editionId'], 'planHash': plan['planHash'],
              'officialAnnouncementUrl': plan['officialAnnouncement']['pageUrl'],
              'probabilitySourceUrl': plan['probabilitySource']['pageUrl'],
              'plannedItemCount': len(targets), 'capturedItemCount': len(items),
              'captureCount': db.execute('SELECT COUNT(*) FROM captures').fetchone()[0],
              'qualityConstant': False, 'observationTimestampKnown': bool(items) and all(r['observationTimestampKnown'] for r in items),
              'knownSourceTimeCount': sum(r['observationTimestampKnown'] for r in items),
              'mixedCaptureTimes': len(set(clocks)) > 1, 'items': sorted(items, key=lambda r: r['id']),
              'latestBatch': {'capturedAt': latest['capturedAt'], 'captureStartedAt': latest.get('captureStartedAt'),
                              'captureCompletedAt': latest.get('captureCompletedAt'),
                              'scannerFreshnessText': latest.get('scannerFreshnessText', 'Unknown'),
                              'completedAttemptCount': len(attempted), 'acceptedSaleCount': len(latest['items']),
                              'noEligibleSalesCount': len(latest['rejectedItems']), 'completePlan': len(attempted) == len(targets),
                              'missingItemIds': sorted(set(targets) - attempted), 'noSaleReturns': latest['rejectedItems']},
              'note': 'Supplemental rolling sale medians with individual receipt times; mixed captures are explicit. Not daily history, fixed NX purchase costs, live ticks or quality-constant equipment histories. Listings were observed at capture and current availability is unconfirmed.'}
    result['contentHash'] = _hash(result)
    return result


def import_capture(payload, plan, root):
    normalized, targets = normalize(payload, plan)  # Reject identity errors before creating a database.
    root = Path(root)
    path = root / LEDGER
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as db:
        db.execute('PRAGMA foreign_keys=ON')
        with db:
            db.executescript('CREATE TABLE IF NOT EXISTS captures(capture_hash TEXT PRIMARY KEY,plan_hash TEXT NOT NULL,captured_epoch REAL NOT NULL,payload TEXT NOT NULL);'
                             'CREATE TABLE IF NOT EXISTS observations(receipt_hash TEXT PRIMARY KEY,capture_hash TEXT NOT NULL REFERENCES captures(capture_hash),item_id INTEGER NOT NULL,captured_epoch REAL NOT NULL,variant_key TEXT NOT NULL,series_key TEXT NOT NULL,payload TEXT NOT NULL);'
                             'CREATE INDEX IF NOT EXISTS latest_cash_receipt ON observations(item_id,captured_epoch DESC,receipt_hash DESC);')
            existing = db.execute('SELECT DISTINCT plan_hash FROM captures').fetchall()
            if any(row[0] != plan['planHash'] for row in existing):
                raise ValueError('Supplemental branch plan changed; explicit new version/ledger required')
            capture_hash = _hash(normalized)
            db.execute('INSERT OR IGNORE INTO captures VALUES(?,?,?,?)', (capture_hash, plan['planHash'], _stamp(normalized['capturedAt']).timestamp(), _json(normalized)))
            for row in normalized['items']:
                db.execute('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?,?,?)', (_hash(row), capture_hash, row['id'], _stamp(row['capturedAt']).timestamp(), row['variantKey'], row['seriesKey'], _json(row)))
        projected = _project(db, plan, targets)
    changed = atomic_json(root / PROJECTION, projected)
    return {'projectionChanged': changed, 'capturedItemCount': projected['capturedItemCount'],
            'plannedItemCount': projected['plannedItemCount'], 'completePlan': projected['latestBatch']['completePlan'],
            'contentHash': projected['contentHash'], 'projection': projected}


def load_projection(root):
    path = Path(root) / PROJECTION
    if not path.exists():
        return None
    result = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(result,dict):
        raise ValueError('A supplemental projection object is required')
    if result.get('schemaVersion') != 1 or result.get('kind') != KIND or result.get('sourceUrl') != SOURCE:
        raise ValueError('Unsupported supplemental cash reference projection')
    if result.get('contentHash') != _hash({k: v for k, v in result.items() if k != 'contentHash'}):
        raise ValueError('Supplemental cash projection integrity mismatch')
    items=result.get('items')
    if not isinstance(items,list) or any(not isinstance(r,dict) for r in items) or type(result.get('capturedItemCount')) is not int or result.get('capturedItemCount')!=len(items) or type(result.get('plannedItemCount')) is not int or not 0<=len(items)<=result['plannedItemCount'] or len({r.get('id') for r in items})!=len(items):
        raise ValueError('Invalid supplemental reference coverage')
    for row in items:
        if type(row.get('id')) is not int or row['id']<=0 or row.get('expectedItemId')!=row['id'] or not isinstance(row.get('name'),str) or not isinstance(row.get('expectedItemName'),str) or row['name'].casefold()!=row['expectedItemName'].casefold() or row.get('priceBasis')!='median of sales' or type(row.get('salesCounted')) is not int or row['salesCounted']<1 or type(row.get('price')) not in (int,float) or not row['price']>0 or type(row.get('windowDays')) not in (int,float) or not 1<=row['windowDays']<=90:
            raise ValueError('Invalid supplemental sale observation')
        if row.get('headlineEligible') is not False or row.get('dailyHistoryEligible') is not False or row.get('availabilityConfirmed') is not False or row.get('qualityConstant') is not False:
            raise ValueError('Supplemental reference was incorrectly promoted')
        _stamp(row.get('capturedAt'))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--plan', required=True, type=Path)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    result = import_capture(json.loads(args.input.read_text(encoding='utf-8')), json.loads(args.plan.read_text(encoding='utf-8')), args.root)
    print(json.dumps({k: v for k, v in result.items() if k != 'projection'}, indent=2))


if __name__ == '__main__':
    main()
