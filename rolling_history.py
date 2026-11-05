"""Local append-only rolling-price receipts; no provider requests or live claims.

Reported roll labels are identities, not independently quality-adjusted prices.
SQLite histories stay private and separate from aggregate reference-history JSON.
"""
import copy
from contextlib import closing
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import tempfile

SOURCE = 'https://mesos.watch/'
UTC = dt.timezone.utc
LEDGER = 'incoming/rolling-captures.sqlite3'
PROJECTION = 'public-browser-prices.json'
STATUS = 'incoming/rolling-intake-status.json'
ASKING_BASES = {'asking', 'asking price', 'median asking price', 'median of asking prices', 'median of asks'}


def _json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def _hash(value):
    return hashlib.sha256(_json(value).encode('utf-8')).hexdigest()


def _stamp(value):
    if not isinstance(value, str):
        raise ValueError('An actual timezone-aware capture/source timestamp is required')
    try:
        result = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise ValueError('Invalid capture/source timestamp') from error
    if result.tzinfo is None or result > dt.datetime.now(UTC) + dt.timedelta(minutes=5):
        raise ValueError('Timestamp must be timezone-aware and nonfuture')
    return result.astimezone(UTC)


def _positive(value):
    return type(value) in (int, float) and math.isfinite(value) and value > 0


def _integer(value, minimum=0):
    return type(value) is int and value >= minimum


def _unpack(value):
    if isinstance(value, str):
        value = json.loads(value)
    if isinstance(value, dict) and 'content' in value:
        blocks = [block.get('text') for block in value['content'] if block.get('type') == 'text']
        if len(blocks) != 1:
            raise ValueError('Expected one returned price-result text block')
        return _unpack(blocks[0])
    if not isinstance(value, dict):
        raise ValueError('A returned price object is required, not an error message')
    return value


def normalize_capture(payload, allow_empty=False):
    completed = _stamp(payload.get('capturedAt'))
    if payload.get('sourceUrl') != SOURCE or not isinstance(payload.get('items'), list):
        raise ValueError('A supported source and item capture array are required')
    if not isinstance(payload.get('scannerFreshnessText', 'Unknown'), str):
        raise ValueError('Scanner freshness context must be text')
    started = _stamp(payload['captureStartedAt']) if payload.get('captureStartedAt') else None
    if started and started > completed:
        raise ValueError('Capture start follows completion')
    if payload.get('captureCompletedAt') and _stamp(payload['captureCompletedAt']) != completed:
        raise ValueError('capturedAt must match the declared batch completion')
    items, rejected, seen_ids, seen_names = [], [], set(), set()
    for entry in payload['items']:
        if not isinstance(entry, dict):
            raise ValueError('An item receipt object is required')
        raw = _unpack(entry.get('result', entry))
        name, item_id = raw.get('item') or entry.get('requested'), raw.get('id')
        if not isinstance(name, str) or not name.strip() or len(name) > 256 or not _integer(item_id, 1):
            raise ValueError('A returned item name and positive item ID are required')
        if 'expectedItemId' in entry and (not _integer(entry['expectedItemId'], 1) or item_id != entry['expectedItemId']):
            raise ValueError('Returned item ID does not match the positive expectedItemId')
        if 'expectedItemName' in entry:
            expected = entry['expectedItemName']
            if not isinstance(expected, str) or not expected.strip() or len(expected) > 256 or not isinstance(raw.get('item'), str) or raw['item'].casefold() != expected.casefold():
                raise ValueError('Returned item name does not match expectedItemName (casefold)')
        if item_id in seen_ids or name.casefold() in seen_names:
            raise ValueError('Duplicate item capture')
        seen_ids.add(item_id); seen_names.add(name.casefold())
        capture = entry.get('capturedAt', payload['capturedAt'])
        capture_time = _stamp(capture)
        if capture_time > completed or started and capture_time < started:
            raise ValueError('Per-item capture falls outside the declared batch interval')
        site = raw.get('site', SOURCE)
        if raw.get('currency', 'mesos') != 'mesos' or not isinstance(site, str) or site.rstrip('/') != SOURCE.rstrip('/'):
            raise ValueError('Unexpected returned currency or source')
        basis, count = raw.get('price_basis'), raw.get('sales_counted')
        if basis != 'median of sales' or not _positive(raw.get('typical_sale_price')) or not _integer(count, 1):
            known_no_sales = type(count) is int and count == 0 and (basis in ('median of sales', 'no sales recorded in the window') or isinstance(basis, str) and basis.casefold() in ASKING_BASES)
            rejected.append({'id': item_id, 'name': name,
                             'reason': 'reported_no_eligible_sales' if known_no_sales else 'not_eligible_sale_result',
                             'completedAttempt': known_no_sales, 'reportedPriceBasis': basis if isinstance(basis, str) else None,
                             'reportedSalesCount': count if _integer(count) else None,
                             'capturedAt': capture, 'captureTimeKind': 'per_item_return' if 'capturedAt' in entry else 'batch_timestamp_only'})
            continue
        days = raw.get('window_days')
        if not _positive(days) or not 1 <= days <= 90:
            raise ValueError('Invalid sale window')
        roll_known, roll = 'stat_roll' in raw, raw.get('stat_roll')
        if roll is not None and (not isinstance(roll, str) or not roll.strip() or len(roll) > 512):
            raise ValueError('Invalid reported stat roll')
        roll_status = 'reported_label' if roll is not None else 'reported_null' if roll_known else 'unknown_legacy'
        variant = _hash({'source': SOURCE, 'id': item_id, 'rollStatus': roll_status, 'statRoll': roll})
        series = _hash({'variantKey': variant, 'windowDays': days, 'priceBasis': 'median of sales'})
        item = {'name': name, 'id': item_id, 'price': raw['typical_sale_price'],
                'salesCounted': raw['sales_counted'], 'windowDays': days,
                'salesPerHourProxy': raw['sales_counted'] / (24 * days),
                'priceBasis': 'median of sales', 'currency': 'mesos',
                'statRollKnown': roll_known, 'statRoll': roll, 'statRollStatus': roll_status,
                'variantKey': variant, 'seriesKey': series, 'qualityConstant': False,
                'capturedAt': capture,
                'captureTimeKind': 'per_item_return' if 'capturedAt' in entry else 'batch_timestamp_only',
                'sourceObservedAt': None, 'observationTimestampKnown': False}
        for key in ('expectedItemId', 'expectedItemName'):
            if key in entry:
                item[key] = entry[key]
        for key in ('sourceObservedAt', 'sourceWindowStartAt', 'sourceWindowEndAt'):
            if entry.get(key) is not None:
                if _stamp(entry[key]) > capture_time:
                    raise ValueError('A source clock cannot follow its actual capture')
                item[key] = entry[key]
        if item.get('sourceWindowStartAt') and item.get('sourceWindowEndAt') and _stamp(item['sourceWindowStartAt']) > _stamp(item['sourceWindowEndAt']):
            raise ValueError('Invalid supplied source window bounds')
        item['observationTimestampKnown'] = item['sourceObservedAt'] is not None
        if 'listings_now' in raw:
            if not _integer(raw['listings_now']):
                raise ValueError('Invalid source listing count')
            item['listingsNow'] = raw['listings_now']
        if 'cheapest_listing' in raw:
            listing = raw['cheapest_listing']
            if listing is not None:
                if not isinstance(listing, dict) or not _positive(listing.get('price_each')) or not all(_integer(listing.get(key), 1) for key in ('channel', 'room')):
                    raise ValueError('Invalid source cheapest-listing provenance')
                listing = {key: listing[key] for key in ('price_each', 'channel', 'room')}
                listing['availabilityConfirmed'] = False
            item['cheapestListing'] = listing
        if 'listings_now' in raw or 'cheapest_listing' in raw:
            item['availabilityConfirmed'] = False
        items.append(item)
    if not items and not allow_empty:
        raise ValueError('No usable scanner sale medians')
    result = {'schemaVersion': 2, 'sourceUrl': SOURCE, 'capturedAt': payload['capturedAt'],
              'scannerFreshnessText': payload.get('scannerFreshnessText', 'Unknown'),
              'observationTimestampKnown': bool(items) and all(item['observationTimestampKnown'] for item in items),
              'kind': 'rolling_scanner_reference', 'captureMethod': 'supported_browser_tool_receipt',
              'qualityConstant': False, 'items': items, 'rejectedItems': rejected}
    for key in ('captureStartedAt', 'captureCompletedAt'):
        if payload.get(key):
            result[key] = payload[key]
    return result


def legacy_capture(payload):
    """Recover only known legacy fields; never invent a missing roll or item clock."""
    if payload.get('sourceUrl') != SOURCE or payload.get('kind') != 'rolling_scanner_reference':
        raise ValueError('Unsupported legacy rolling reference')
    items = []
    for item in payload['items']:
        raw = {'item': item['name'], 'id': item['id'], 'typical_sale_price': item['price'],
               'sales_counted': item['salesCounted'], 'window_days': item['windowDays'], 'price_basis': 'median of sales'}
        if item.get('statRollKnown'):
            raw['stat_roll'] = item.get('statRoll')
        entry = {'result': raw}
        if item.get('captureTimeKind') == 'per_item_return':
            entry['capturedAt'] = item['capturedAt']
        items.append(entry)
    return normalize_capture({'sourceUrl': SOURCE, 'capturedAt': payload['capturedAt'],
                              'scannerFreshnessText': payload.get('scannerFreshnessText', 'Unknown'), 'items': items})


def comparison_reason(row, item, cash=False):
    if item is None:
        return 'item_not_captured'
    if cash:
        if not item.get('statRollKnown'):
            return 'cash_roll_metadata_unverified'
        roll = item.get('statRoll')
        if roll is None or isinstance(roll, str) and roll.casefold() == 'clean':
            return None
        return 'cash_roll_may_include_upgrade_premium'
    if item.get('statRoll') is not None:
        return 'reported_roll_has_no_matching_daily_baseline'
    if row.get('category') == 'Equipment':
        return 'daily_equipment_baseline_has_unidentified_roll_mix'
    if row.get('category') == 'Weapons':
        item_id = item.get('id')
        if not _integer(item_id, 1) or item_id < 2_000_000:
            return 'daily_weapon_baseline_has_unidentified_roll_mix'
    elif row.get('category') not in ('Materials', 'Consumables', 'Scrolls'):
        return 'daily_baseline_variant_scope_unknown'
    return None


def comparable_inputs(rows, cash, payload):
    # Intake explicitly permits case-only source naming differences. Match on
    # that same identity rule while retaining the original source spelling.
    by_name = {item['name'].casefold(): item for item in payload['items']}
    if len(by_name) != len(payload['items']):
        raise ValueError('Ambiguous casefold item names in rolling comparison')
    unavailable = {item['name'].casefold() for item in payload.get('rejectedItems', []) if item.get('completedAttempt')}
    goods, cash_items, excluded = {}, {}, []
    captured = 0
    for row in rows:
        item = by_name.get(row['name'].casefold())
        if item:
            captured += row['weight']
        reason = comparison_reason(row, item)
        if reason == 'item_not_captured' and row['name'].casefold() in unavailable:
            reason = 'captured_item_has_no_eligible_sales'
        if reason:
            excluded.append({'name': row['name'], 'weight': row['weight'], 'reason': reason, 'statRoll': item.get('statRoll') if item else None})
        else:
            goods[row['name']] = item
    cash_excluded = []
    for row in cash:
        item = by_name.get(row['name'].casefold()); reason = comparison_reason(row, item, cash=True)
        if reason == 'item_not_captured' and row['name'].casefold() in unavailable:
            reason = 'captured_item_has_no_eligible_sales'
        if reason:
            cash_excluded.append({'name': row['name'], 'reason': reason, 'statRoll': item.get('statRoll') if item else None, 'referenceWeight': 0})
        else:
            cash_items[row['name']] = item
    total_proxy = sum(item['salesPerHourProxy'] for item in cash_items.values())
    cash_reasons = {row['name']: row['reason'] for row in cash_excluded}
    weights = [{'name': row['name'], 'fixedNxCost': row['nx'], 'statRoll': by_name.get(row['name'].casefold(), {}).get('statRoll'),
                'statRollKnown': bool(by_name.get(row['name'].casefold(), {}).get('statRollKnown')),
                'eligible': row['name'] in cash_items,
                'exclusionReason': cash_reasons.get(row['name']),
                'referenceWeight': cash_items[row['name']]['salesPerHourProxy'] / total_proxy if row['name'] in cash_items and total_proxy else 0}
               for row in cash]
    return goods, cash_items, {'methodVersion': 3, 'qualityConstant': False, 'capturedBasketCoverage': captured,
                              'comparableBasketCoverage': sum(row['weight'] for row in rows if row['name'] in goods),
                              'comparableBasketItems': len(goods), 'excludedBasketItems': excluded,
                              'comparableCashItems': len(cash_items), 'excludedCashItems': cash_excluded,
                              'cashReferenceWeights': weights,
                              'cashEligibilityMethod': 'fixed_nx_purchase_cost_explicit_null_or_provider_clean_v1',
                              'cashCleanDefinitionSource': 'https://mesos.watch/app.js',
                              'cashCleanDefinitionEvidence': 'rollLabel/standardRoll: no added priced stat and full observed slots. Clean is a provider classification, not independent verification.',
                              'note': 'Goods comparisons need a compatible daily baseline. Cash compares price with fixed NX purchase cost: explicit null/Clean is eligible; unknown or other rolls are excluded. Labels/windows remain source aggregates, not quality adjustment.'}


def _connect(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.execute('PRAGMA foreign_keys=ON')
    connection.executescript('''
      CREATE TABLE IF NOT EXISTS captures(id TEXT PRIMARY KEY, capture_time REAL NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY, source TEXT NOT NULL, item_id INTEGER NOT NULL,
        capture_time REAL NOT NULL, variant_key TEXT NOT NULL, series_key TEXT NOT NULL, payload TEXT NOT NULL,
        UNIQUE(source,item_id,capture_time));
      CREATE TABLE IF NOT EXISTS capture_observations(capture_id TEXT NOT NULL REFERENCES captures(id),
        observation_id TEXT NOT NULL REFERENCES observations(id), PRIMARY KEY(capture_id,observation_id));
      CREATE INDEX IF NOT EXISTS variant_time ON observations(variant_key,capture_time);
      CREATE INDEX IF NOT EXISTS series_time ON observations(series_key,capture_time);
      CREATE INDEX IF NOT EXISTS capture_time ON captures(capture_time);
    ''')
    return connection


def add_capture(connection, normalized):
    safe = copy.deepcopy(normalized)
    capture_id = _hash(safe)
    connection.execute('INSERT OR IGNORE INTO captures VALUES(?,?,?)', (capture_id, _stamp(safe['capturedAt']).timestamp(), _json(safe)))
    for item in safe['items']:
        # Expectations are receipt provenance, not a different source observation.
        observation = {'sourceUrl': SOURCE, **{key: value for key, value in item.items() if key not in ('expectedItemId', 'expectedItemName')}}
        identity = (SOURCE, item['id'], _stamp(item['capturedAt']).timestamp())
        existing = connection.execute('SELECT id,payload FROM observations WHERE source=? AND item_id=? AND capture_time=?', identity).fetchone()
        encoded = _json(observation)
        if existing and existing[1] != encoded:
            raise ValueError('Conflicting returned values share one item and actual capture time')
        observation_id = existing[0] if existing else _hash(observation)
        connection.execute('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?,?,?)',
                           (observation_id, *identity, item['variantKey'], item['seriesKey'], encoded))
        connection.execute('INSERT OR IGNORE INTO capture_observations VALUES(?,?)', (capture_id, observation_id))
    return capture_id


def _atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = _json(value).encode('utf-8')
    if path.exists() and path.read_bytes() == encoded:
        return
    with tempfile.NamedTemporaryFile('wb', dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name); stream.write(encoded)
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _known_plan(root, payload):
    if 'planHash' not in payload:
        return None
    path = Path(root) / 'incoming/scanner-capture-plan.json'
    plan = json.loads(path.read_text(encoding='utf-8'))
    actual = _hash({key: value for key, value in plan.items() if key not in ('planHash', 'preparedAt')})
    if plan.get('kind') != 'offline_scanner_capture_request_plan' or plan.get('isCapture') is not False or plan.get('planHash') != actual or payload['planHash'] != actual:
        raise ValueError('Capture planHash does not match the known frozen plan')
    requests = plan.get('requests')
    if not isinstance(requests, list) or plan.get('requestCount') != len(requests):
        raise ValueError('Invalid frozen plan target count')
    by_id = {}
    for row in requests:
        item_id, name = row.get('expectedItemId'), row.get('expectedItemName')
        if not _integer(item_id, 1) or not isinstance(name, str) or not name.strip() or item_id in by_id:
            raise ValueError('Invalid or duplicate frozen plan identity')
        by_id[item_id] = name
    return by_id


def _review_receipts(payload, plan):
    """Keep parser/auth/timeout failures as missing attempts, never no-sale prices."""
    if not isinstance(payload.get('items'), list):
        raise ValueError('An item capture array is required')
    usable, errors, requested = [], [], {}
    for entry in payload['items']:
        if not isinstance(entry, dict):
            errors.append({'id': None, 'reason': 'missing_request_identity'}); continue
        expected_id, expected_name = entry.get('expectedItemId'), entry.get('expectedItemName')
        if plan is not None:
            if not _integer(expected_id, 1) or not isinstance(expected_name, str):
                errors.append({'id': None, 'reason': 'missing_request_identity'}); continue
            if expected_id not in plan or expected_name.casefold() != plan[expected_id].casefold():
                raise ValueError('Expected item identity does not match the frozen capture plan')
            requested[expected_id] = expected_name
        elif _integer(expected_id, 1):
            requested[expected_id] = expected_name if isinstance(expected_name, str) else ''
        try:
            raw = _unpack(entry.get('result', entry))
        except (ValueError, TypeError, KeyError, AttributeError):
            errors.append({'id': expected_id if _integer(expected_id, 1) else None, 'reason': 'unusable_tool_response'}); continue
        if not _integer(raw.get('id'), 1) or not isinstance(raw.get('item'), str) or not raw['item'].strip():
            errors.append({'id': expected_id if _integer(expected_id, 1) else None, 'reason': 'missing_returned_identity'}); continue
        # normalize_capture performs exact returned-ID/name validation. A wrong
        # returned identity is a fatal mismatch, not an unavailable-price result.
        usable.append(entry)
        requested.setdefault(raw['id'], raw['item'])
    normalized = normalize_capture({**payload, 'items': usable}, allow_empty=True)
    if plan is None and not normalized['items'] and not any(row['completedAttempt'] for row in normalized['rejectedItems']):
        raise ValueError('No usable scanner sale medians or verified no-sales receipts')
    normalized['missingResponses'] = errors
    return normalized, requested, errors


def _publication_status(payload, normalized, previous, plan, requested, errors):
    verified = {item['id'] for item in normalized['items']}
    verified.update(row['id'] for row in normalized['rejectedItems'] if row['completedAttempt'])
    expected = plan if plan is not None else {item['id']: item['name'] for item in (previous or {}).get('items', [])}
    expected = {**expected, **requested} if plan is None else expected
    missing = [{'id': item_id, 'name': name} for item_id, name in expected.items() if item_id not in verified]
    unresolved = [error for error in errors if error['id'] is None or error['id'] not in verified]
    complete = not missing and not unresolved
    reason = 'complete_verified_target_scope'
    if not complete:
        reason = 'incomplete_target_scope'
    elif not normalized['items']:
        reason = 'complete_receipt_only_no_eligible_sales'
    elif previous and _stamp(normalized['capturedAt']) < _stamp(previous['capturedAt']):
        reason = 'older_capture_retained'
    status = 'published' if complete and normalized['items'] and reason != 'older_capture_retained' else 'held'
    return {'status': status, 'reason': reason, 'incomingCapturedAt': payload['capturedAt'],
            'planHash': payload.get('planHash'), 'scopeKind': 'frozen_plan' if plan is not None else 'prior_projection_and_declared_targets',
            'expectedTargetCount': len(expected), 'verifiedAttemptCount': len(verified.intersection(expected)),
            'eligibleSaleCount': len(normalized['items']),
            'ineligibleVerifiedCount': sum(row['completedAttempt'] for row in normalized['rejectedItems']),
            'missingTargetCount': len(missing), 'missingTargets': missing, 'unresolvedResponses': unresolved,
            'completeTargetScope': complete, 'projectionCapturedAt': previous.get('capturedAt') if previous else None,
            'projectionItemCount': len(previous['items']) if previous else 0}


def import_capture(root, payload):
    try:
        plan = _known_plan(root, payload)
        normalized, requested, errors = _review_receipts(payload, plan)
    except Exception as error:
        try:
            _atomic(Path(root) / STATUS, {'status': 'rejected', 'reason': 'invalid_capture_or_plan',
                                         'projectionRetained': True, 'detail': str(error)[:180]})
        except OSError:
            pass
        raise
    if plan is not None:
        normalized['planHash'] = payload['planHash']
    cache = Path(root) / 'cache'; path = cache / PROJECTION
    cache.mkdir(parents=True, exist_ok=True)
    lock = cache / '.rolling-captures.lock'
    try:
        handle = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as error:
        raise RuntimeError('Another rolling capture import owns the ledger') from error
    try:
        os.close(handle)
        previous = json.loads(path.read_text(encoding='utf-8')) if path.exists() else None
        status = _publication_status(payload, normalized, previous, plan, requested, errors)
        normalized['captureScope'] = {key: status[key] for key in ('scopeKind', 'expectedTargetCount', 'verifiedAttemptCount', 'completeTargetScope')}
        if normalized['items'] or any(row['completedAttempt'] for row in normalized['rejectedItems']):
            with closing(_connect(Path(root) / LEDGER)) as connection:
                with connection:
                    if previous:
                        add_capture(connection, previous if previous.get('schemaVersion') == 2 else legacy_capture(previous))
                    add_capture(connection, normalized)
        # Never merge old items under a new clock. Only a fully accounted target
        # scope can replace the projection; partial/receipt-only data stays private.
        view = previous or normalized
        if status['status'] == 'published':
            try:
                _atomic(path, normalized)
            except OSError:
                status.update(status='held', reason='projection_write_failed')
                _atomic(Path(root) / STATUS, status)
                raise
            view = normalized
            status.update(projectionCapturedAt=normalized['capturedAt'], projectionItemCount=len(normalized['items']))
        _atomic(Path(root) / STATUS, status)
        return {**view, 'intakeStatus': status}
    finally:
        lock.unlink(missing_ok=True)


def variant_history(path, variant_key, series_key=None, limit=500):
    if not _integer(limit, 1) or limit > 10000:
        raise ValueError('History limit must be1–10000')
    with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)) as connection:
        query = 'SELECT payload FROM observations WHERE variant_key=?'
        args = [variant_key]
        if series_key:
            query += ' AND series_key=?'; args.append(series_key)
        query += ' ORDER BY capture_time DESC,id LIMIT ?'; args.append(limit)
        return [json.loads(row[0]) for row in connection.execute(query, args)]
