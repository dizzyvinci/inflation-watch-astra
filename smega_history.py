"""Append-only aggregate offer captures with a revisable, dated materialized view.

This ledger contains published hourly aggregates, never sender/message records.
Capture time records when a table was captured; ``at`` remains its source hour.
"""
import copy
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re

from engine import UTC, atomic, read

SOURCE = 'https://maplestory.market/ads?tab=services'
LEDGER = 'published-smega-ledger.json'
SERIES = 'published-smega-series.json'
SUMMARY = 'published-smega-summary.json'


def _stamp(value):
    if not isinstance(value, str):
        raise ValueError('A verified, timezone-aware capturedAt is required')
    try:
        stamp = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise ValueError('Invalid source/capture timestamp') from error
    if stamp.tzinfo is None or stamp > dt.datetime.now(UTC) + dt.timedelta(minutes=5):
        raise ValueError('A verified, nonfuture timezone-aware timestamp is required')
    return stamp.astimezone(UTC)


def _hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()


def _source(value):
    if not isinstance(value, str) or not value.startswith('https://'):
        raise ValueError('A source URL is required')
    return value


def _positive(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def _point(point, source, captured_at):
    if point.get('sourceUrl') != source or _stamp(point.get('capturedAt')) != _stamp(captured_at):
        raise ValueError('Point source/capture does not match its capture')
    side = point.get('side')
    expected_kind = {'sell': 'smega_ask', 'buy': 'smega_bid'}.get(side)
    if not expected_kind or point.get('kind') != expected_kind or point.get('aggregation') != 'source_published_hourly':
        raise ValueError('Only explicitly sided published hourly aggregates belong in this ledger')
    if not all(_positive(point.get(key)) for key in ('rate', 'p25', 'p75')):
        raise ValueError('Invalid published aggregate prices')
    count = point.get('sampleCount')
    if not isinstance(count, int) or isinstance(count, bool) or count < 1:
        raise ValueError('Invalid published sample count')
    if not point['p25'] <= point['rate'] <= point['p75']:
        raise ValueError('Invalid published aggregate quantiles')
    return {'at': _stamp(point.get('at')).isoformat(), 'rate': point['rate'],
            'p25': point['p25'], 'p75': point['p75'], 'sampleCount': count,
            'side': side, 'kind': expected_kind, 'sourceUrl': source,
            'aggregation': 'source_published_hourly', 'capturedAt': captured_at}


def _raw_capture(payload):
    """Allowlist only table/summary aggregates; never retain arbitrary identities."""
    result = {'sourceUrl': _source(payload.get('sourceUrl')), 'capturedAt': payload['capturedAt']}
    _stamp(result['capturedAt'])
    for key in ('year', 'utcOffsetMinutes'):
        value = payload.get(key)
        if isinstance(value, int) and not isinstance(value, bool):
            result[key] = value
    if isinstance(payload.get('displayTimeZone'), str) and re.fullmatch(r'[A-Za-z_+\-/]+', payload['displayTimeZone']):
        result['displayTimeZone'] = payload['displayTimeZone']
    if 'rows' in payload:
        rows = payload['rows']
        if not isinstance(rows, list) or any(not isinstance(row, list) or len(row) != 3
                                             or not all(isinstance(cell, str) for cell in row) for row in rows):
            raise ValueError('Raw capture must contain only the three-column published table')
        for day, sell, buy in rows:
            if not re.fullmatch(r'[A-Za-z]{3} \d{1,2}, \d{1,2}:\d{2} [AP]M', day):
                raise ValueError('Invalid raw table hour label')
            for cell in (sell, buy):
                if cell != '—' and not re.fullmatch(r'1:[\d.]+\s*\([\d.]+[–-][\d.]+\)\s*·\s*\d+', cell):
                    raise ValueError('Raw table must contain aggregate rate cells, not messages or identities')
        result['rows'] = copy.deepcopy(rows)
    if isinstance(payload.get('summary'), dict):
        summary = {}
        for key in ('sellerRate', 'buyerRate', 'windowHours'):
            if _positive(payload['summary'].get(key)):
                summary[key] = payload['summary'][key]
        for key in ('sellerPosters', 'buyerPosters'):
            value = payload['summary'].get(key)
            if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
                summary[key] = value
        if summary:
            result['summary'] = summary
    if payload.get('summaryCapturedAt') is not None:
        _stamp(payload['summaryCapturedAt'])
        result['summaryCapturedAt'] = payload['summaryCapturedAt']
    return result


def empty_ledger():
    return {'schemaVersion': 1, 'kind': 'published_hourly_offer_capture_ledger', 'captures': [], 'buckets': []}


def add_capture(ledger, payload, points, provenance=None, raw=True):
    """Pure merge. A source+side+hour can have multiple explicitly dated revisions."""
    if ledger.get('schemaVersion') != 1 or not isinstance(ledger.get('captures'), list) or not isinstance(ledger.get('buckets'), list):
        raise ValueError('Unsupported or malformed smega ledger; refusing to reset history')
    source = _source(payload.get('sourceUrl'))
    captured_at = payload.get('capturedAt')
    capture_time = _stamp(captured_at).isoformat()
    capture_id = _hash({'sourceUrl': source, 'captureTime': capture_time})
    result = copy.deepcopy(ledger)
    capture = next((entry for entry in result['captures'] if entry['id'] == capture_id), None)
    if capture is None:
        capture = {'id': capture_id, 'sourceUrl': source, 'capturedAt': captured_at,
                   'captureTime': capture_time, 'rawCaptures': [], 'provenance': []}
        result['captures'].append(capture)
    # Keep the first literal timestamp for an instant; retain all raw literals below.
    literal_time = capture['capturedAt']
    cleaned = [_point(point, source, literal_time) for point in points]
    seen = set()
    for point in cleaned:
        key = (source, point['side'], point['at'])
        if key in seen:
            raise ValueError('Duplicate source/side/hour within a capture')
        seen.add(key)
        bucket = next((entry for entry in result['buckets'] if
                       (entry['sourceUrl'], entry['side'], entry['at']) == key), None)
        if bucket is None:
            bucket = {'sourceUrl': source, 'side': point['side'], 'at': point['at'], 'revisions': []}
            result['buckets'].append(bucket)
        revision = {'captureId': capture_id, **point}
        previous = next((entry for entry in bucket['revisions'] if entry['captureId'] == capture_id), None)
        if previous is not None and previous != revision:
            raise ValueError('Conflicting values share the same source bucket and actual capture time')
        if previous is None:
            bucket['revisions'].append(revision)
    if raw:
        original = _raw_capture(payload)
        if original not in capture['rawCaptures']:
            capture['rawCaptures'].append(original)
            capture['rawCaptures'].sort(key=_hash)
    if provenance is not None:
        # Provenance identifies a local aggregate artifact, never a sender.
        safe = {key: provenance[key] for key in ('kind', 'path') if isinstance(provenance.get(key), str)}
        if safe and safe not in capture['provenance']:
            capture['provenance'].append(safe)
            capture['provenance'].sort(key=_hash)
    result['captures'].sort(key=lambda entry: (entry['captureTime'], entry['id']))
    for bucket in result['buckets']:
        bucket['revisions'].sort(key=lambda entry: (_stamp(entry['capturedAt']), entry['captureId']))
    result['buckets'].sort(key=lambda entry: (entry['at'], entry['sourceUrl'], entry['side']))
    return result


def materialize(ledger):
    """The newest actual capture wins per source+side+hour; no gaps are filled."""
    points = []
    for bucket in ledger['buckets']:
        revisions = bucket['revisions']
        if not revisions:
            raise ValueError('A stored smega bucket has no revisions')
        latest = max(revisions, key=lambda entry: (_stamp(entry['capturedAt']), entry['captureId']))
        points.append({key: value for key, value in latest.items() if key != 'captureId'})
    return sorted(points, key=lambda point: (point['at'], point['sourceUrl'], point['side']))


def latest_summary(ledger, source=SOURCE):
    captures = [entry for entry in ledger['captures'] if entry['sourceUrl'] == source]
    if not captures:
        return None
    latest = max(captures, key=lambda entry: entry['captureTime'])
    raw = latest['rawCaptures']
    if not raw:
        return {'sourceUrl': source, 'capturedAt': latest['capturedAt']}
    payload = max(raw, key=lambda entry: ('summary' in entry,
                  _stamp(entry.get('summaryCapturedAt', entry['capturedAt'])), _hash(entry)))
    return {key: value for key, value in payload.items() if key != 'rows'}


def recover_legacy(root, ledger=None, normalize_raw=None, raw_paths=None):
    """Read only verified point captures from canonical snapshots / explicit raw tables.

    A snapshot's build time is never used as a substitute for missing capturedAt.
    Other source kinds (including individual sender records) are not ingested.
    """
    root = Path(root).resolve()
    result = copy.deepcopy(ledger if ledger is not None else empty_ledger())
    stats = {'snapshotsRead': 0, 'rawTablesRead': 0, 'unverifiablePointsSkipped': 0}
    for path in sorted((root / 'dist').glob('data-*.json')):
        published = read(path)
        if not isinstance(published, dict):
            continue
        stats['snapshotsRead'] += 1
        groups = {}
        for point in published.get('smega', []):
            if not isinstance(point, dict) or point.get('sourceUrl') != SOURCE or point.get('aggregation') != 'source_published_hourly':
                continue
            try:
                stamp = _stamp(point.get('capturedAt')).isoformat()
                clean = _point(point, SOURCE, point['capturedAt'])
            except (ValueError, KeyError, TypeError):
                stats['unverifiablePointsSkipped'] += 1
                continue
            groups.setdefault(stamp, []).append(clean)
        for points in groups.values():
            payload = {'sourceUrl': SOURCE, 'capturedAt': points[0]['capturedAt']}
            metadata = published.get('smegaSource')
            if isinstance(metadata, dict) and metadata.get('sourceUrl') == SOURCE:
                try:
                    if _stamp(metadata.get('capturedAt')) == _stamp(payload['capturedAt']):
                        payload = _raw_capture(metadata)
                except ValueError:
                    pass
            result = add_capture(result, payload, points,
                                 {'kind': 'canonical_public_snapshot', 'path': 'dist/' + path.name}, raw=True)
    if raw_paths is None:
        workspace = root.parent.parent
        raw_paths = [workspace / 'work' / 'smega-public-table.json', workspace / 'work' / 'refreshed-offer-table.json']
    if normalize_raw is not None:
        for path in raw_paths:
            path = Path(path)
            if not path.is_file():
                continue
            payload = read(path)
            points = normalize_raw(payload)
            result = add_capture(result, payload, points, {'kind': 'verified_raw_table', 'path': str(path)})
            stats['rawTablesRead'] += 1
    return result, stats


def _read_ledger(root):
    ledger = read(root / 'cache' / LEDGER)
    if ledger is not None:
        if ledger.get('schemaVersion') != 1 or ledger.get('kind') != 'published_hourly_offer_capture_ledger':
            raise ValueError('Unsupported smega ledger; refusing to discard history')
        # Validate stored aggregate rows and their capture references before append.
        captures = {entry['id']: entry for entry in ledger['captures']}
        if len(captures) != len(ledger['captures']):
            raise ValueError('Duplicate stored captures')
        for entry in captures.values():
            capture_time = _stamp(entry['capturedAt']).isoformat()
            expected_id = _hash({'sourceUrl': _source(entry['sourceUrl']), 'captureTime': capture_time})
            if entry['captureTime'] != capture_time or entry['id'] != expected_id:
                raise ValueError('Stored capture identity does not match its actual timestamp/source')
        for bucket in ledger['buckets']:
            for revision in bucket['revisions']:
                capture = captures[revision['captureId']]
                clean = _point(revision, capture['sourceUrl'], capture['capturedAt'])
                if (clean['sourceUrl'], clean['side'], clean['at']) != (bucket['sourceUrl'], bucket['side'], bucket['at']):
                    raise ValueError('Stored revision does not match its bucket')
    return ledger


def _save(root, ledger):
    # Ledger first: replay can repair a materialized file after a publication failure.
    atomic(root / 'cache' / LEDGER, ledger)
    points = materialize(ledger)
    atomic(root / 'cache' / SERIES, points)
    summary = latest_summary(ledger)
    if summary is not None:
        atomic(root / 'cache' / SUMMARY, summary)
    return points


def _locked(root, action):
    lock = root / 'cache' / '.smega-history.lock'
    lock.parent.mkdir(parents=True, exist_ok=True)
    try:
        handle = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as error:
        raise RuntimeError('Another smega history import owns the ledger') from error
    try:
        os.close(handle)
        return action()
    finally:
        lock.unlink(missing_ok=True)


def import_capture(root, payload, points, normalize_raw=None, raw_paths=None):
    """Append incoming data, recovering legacy artifacts only on first initialization."""
    root = Path(root).resolve()
    def run():
        ledger = _read_ledger(root)
        if ledger is None:
            ledger, _ = recover_legacy(root, normalize_raw=normalize_raw, raw_paths=raw_paths)
        ledger = add_capture(ledger, payload, points, {'kind': 'adapter_import'})
        return _save(root, ledger)
    return _locked(root, run)


def migrate_history(root, normalize_raw=None, raw_paths=None, dry_run=True):
    """Explicit owner-invoked migration. Dry-run never changes caches or dist."""
    root = Path(root).resolve()
    def run():
        ledger, stats = recover_legacy(root, _read_ledger(root), normalize_raw, raw_paths)
        stats.update(captures=len(ledger['captures']), buckets=len(ledger['buckets']),
                     revisions=sum(len(bucket['revisions']) for bucket in ledger['buckets']))
        if not dry_run:
            _save(root, ledger)
        return ledger, stats
    return run() if dry_run else _locked(root, run)
