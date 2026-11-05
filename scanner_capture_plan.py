"""Offline request targets for the current frozen50 goods +29 fixed-NX items.

Creates a plan only. No browser, provider API, capture, engine or network call.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parent
INPUTS = ('cache/basket-v2.json', 'cache/basket-v2-source.json', 'cache/market.json',
          'config.json', 'assets/sprite-provenance.json', 'cache/browser-capture-input.json')


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()


def positive_id(value):
    return type(value) is int and value > 0


def same_name(a, b):
    return isinstance(a, str) and isinstance(b, str) and a.casefold() == b.casefold()


def unpack(value):
    if isinstance(value, str):
        value = json.loads(value)
    if isinstance(value, dict) and 'content' in value:
        blocks = [block['text'] for block in value['content'] if block.get('type') == 'text']
        if len(blocks) != 1:
            raise ValueError('Malformed prior scanner response')
        return unpack(blocks[0])
    if not isinstance(value, dict):
        raise ValueError('Prior scanner evidence must be a returned object')
    return value


def build_plan(basket, frozen_source, feed, config, art, prior):
    if basket.get('version') != 2 or len(basket.get('rows', [])) != 50 or len(config.get('nx_prices', {})) != 29:
        raise ValueError('This planner requires the current frozen50 +29 schedule')
    if basket.get('specificationHash') != digest(basket['indexSpecification']):
        raise ValueError('Frozen specification hash mismatch')
    if basket.get('basketHash') != digest({key: basket[key] for key in ('version', 'indexSpecification', 'sourceSnapshotHash', 'rows')}):
        raise ValueError('Frozen basket hash mismatch')
    if basket.get('sourceSnapshotHash') != digest(frozen_source):
        raise ValueError('Frozen source snapshot hash mismatch')
    by_slug, by_name = {}, {}
    for item in feed['items']:
        if item['s'] in by_slug or item['n'].casefold() in by_name:
            raise ValueError('Ambiguous accepted item names/slugs')
        by_slug[item['s']] = item; by_name[item['n'].casefold()] = item
    if prior.get('sourceUrl') != 'https://mesos.watch/':
        raise ValueError('Prior scanner evidence has an unsupported source')
    prior_by_name = {}
    for entry in prior['items']:
        value = unpack(entry.get('result', entry)); name = value.get('item')
        if not isinstance(name, str) or not positive_id(value.get('id')):
            raise ValueError('Prior scanner evidence lacks an item ID/name')
        existing = prior_by_name.get(name.casefold())
        if existing and existing['id'] != value['id']:
            raise ValueError('Conflicting prior scanner item IDs')
        prior_by_name[name.casefold()] = value
    targets = []
    for row in basket['rows']:
        item = by_slug.get(row['slug'])
        if not item:
            raise ValueError('Frozen member missing from accepted catalog: ' + row['slug'])
        targets.append((item, 'goods', {'basketWeight': row['weight']}))
    for name, nx in sorted(config['nx_prices'].items()):
        item = by_name.get(name.casefold())
        if not item or type(nx) not in (int, float) or nx <= 0:
            raise ValueError('Fixed-NX schedule item is missing or invalid: ' + name)
        targets.append((item, 'cash', {'fixedNxCost': nx}))
    requests, seen_ids, seen_slugs = [], set(), set()
    for item, cohort, extra in targets:
        name, slug = item['n'], item['s']; provenance = []
        previous = prior_by_name.get(name.casefold())
        candidate = art.get(slug)
        if previous:
            provenance.append({'kind': 'prior_actual_scanner_response_id', 'itemId': previous['id'],
                               'reportedName': previous['item'], 'sourceUrl': prior['sourceUrl'],
                               'captureArtifact': 'cache/browser-capture-input.json', 'capturedAt': prior['capturedAt']})
        if candidate:
            if not positive_id(candidate.get('itemId')) or not same_name(candidate.get('name'), name) or candidate.get('region') != 'MCW' or str(candidate.get('version')) != '1':
                raise ValueError('Art candidate is not MCW/1 name-verified: ' + slug)
            provenance.append({'kind': 'mcw_name_verified_art_candidate', 'itemId': candidate['itemId'],
                               'reportedName': candidate['name'], 'region': 'MCW', 'version': '1',
                               'sourceUrl': candidate.get('url'), 'retrievedAt': candidate.get('retrievedAt'),
                               'artifact': 'assets/sprite-provenance.json'})
        if not provenance:
            raise ValueError('No offline ID evidence for ' + name)
        if len({entry['itemId'] for entry in provenance}) != 1:
            raise ValueError('Conflicting art/scanner IDs for ' + name)
        item_id = provenance[0]['itemId']
        if item_id in seen_ids or slug in seen_slugs:
            raise ValueError('Duplicate or overlapping planned target identity')
        seen_ids.add(item_id); seen_slugs.add(slug)
        requests.append({'sequence': len(requests) + 1, 'cohort': cohort, 'slug': slug,
                         'expectedItemId': item_id, 'expectedItemName': name,
                         'tool': 'get_item_price', 'arguments': {'item': str(item_id)},
                         'scannerIdPreviouslyObserved': bool(previous), 'idProvenance': provenance, **extra})
    plan = {'schemaVersion': 1, 'kind': 'offline_scanner_capture_request_plan', 'isCapture': False,
            'sourceUrl': 'https://mesos.watch/', 'requestCount': len(requests), 'goodsCount': 50, 'cashCount': 29,
            'basketVersion': 2, 'basketHash': basket['basketHash'], 'specificationHash': basket['specificationHash'],
            'frozenSourceSnapshotHash': basket['sourceSnapshotHash'], 'cashScheduleHash': digest(config['nx_prices']),
            'acceptedCatalogHash': digest(feed), 'acceptedCatalogSourceUpdatedAt': feed['updatedAt'],
            'priorScannerCapturedAt': prior['capturedAt'], 'requests': requests,
            'limitations': ['Art IDs are candidates until the actual tool ID/name matches.',
                            'Every receipt must carry expectedItemId/expectedItemName and an actual per-item return time.',
                            'This plan does not establish observations, fresh prices, comparable coverage or an allowed repeat cadence.',
                            'Reported gear rolls still need the separate daily-baseline comparability guard.']}
    plan['planHash'] = digest(plan)
    return plan


def _write_atomic(path, encoded):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('wb', dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name); stream.write(encoded)
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def prepare(root=ROOT):
    root = Path(root)
    raw = {name: (root / name).read_bytes() for name in INPUTS}
    plan = build_plan(*(json.loads(raw[name]) for name in INPUTS))
    plan['inputArtifactSha256'] = {name: hashlib.sha256(value).hexdigest() for name, value in raw.items()}
    # Bind provenance file contents as well as the semantic target specification.
    plan['planHash'] = digest({key: value for key, value in plan.items() if key != 'planHash'})
    target = root / 'incoming' / 'scanner-capture-plan.json'
    if target.exists():
        previous_bytes = target.read_bytes(); previous = json.loads(previous_bytes)
        if previous.get('planHash') != digest({key: value for key, value in previous.items() if key not in ('planHash', 'preparedAt')}):
            raise ValueError('Existing plan integrity mismatch; refusing to overwrite')
        if previous.get('planHash') == plan['planHash']:
            return previous
        previous_hash = previous.get('planHash')
        if not isinstance(previous_hash, str) or len(previous_hash) != 64 or any(c not in '0123456789abcdef' for c in previous_hash):
            raise ValueError('Existing plan lacks a valid identity; refusing to overwrite')
        archive = target.parent / 'scanner-capture-plan-history' / (previous_hash + '.json')
        if archive.exists() and archive.read_bytes() != previous_bytes:
            raise ValueError('Frozen prior-plan archive conflict')
        if not archive.exists():
            _write_atomic(archive, previous_bytes)
    plan['preparedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    encoded = (json.dumps(plan, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')
    _write_atomic(target, encoded)
    return plan


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT, help='Accepted local project folder; output stays inside its ignored incoming directory')
    args = parser.parse_args(); result = prepare(args.root)
    print(json.dumps({'planHash': result['planHash'], 'requests': result['requestCount'],
                      'priorScannerIds': sum(row['scannerIdPreviouslyObserved'] for row in result['requests']),
                      'artOnlyCandidates': sum(not row['scannerIdPreviouslyObserved'] for row in result['requests']),
                      'isCapture': False, 'output': str(args.root / 'incoming/scanner-capture-plan.json')}))
