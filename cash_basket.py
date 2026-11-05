"""Experimental fixed cash-price basket, separate from the daily NX ratio.

Only the versioned definition is persisted here. Polling never reselects its
cohort, base prices or expenditure weights, even after source history rolls off.
"""
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path


def _positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def _hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def specification(cfg):
    return {'methodVersion': 1, 'name': 'Experimental capped base-expenditure cash-price index',
            'sourceUrl': cfg['feed_url'], 'baseStart': cfg['base_start'], 'baseEnd': cfg['base_end'],
            'weightCap': .08, 'minimumBaseDailyVolume': 5, 'minimumBaseObservationDays': 1,
            'configuredCashSchedule': [{'name': name, 'nx': nx} for name, nx in sorted(cfg['nx_prices'].items())],
            'selectionMetric': 'all configured cash items with at least one qualifying base-period day',
            'basePrice': 'sum(daily median * recorded volume) / sum(recorded volume)',
            'formula': '100 * sum(fixed capped base expenditure weight * current daily median / fixed base price)',
            'missingPricePolicy': 'carry qualified price only after observed; index unavailable until all members priced',
            'quantityCaveat': 'Recorded source volume; daily median times volume is estimated expenditure, not exact trade value.'}


def _qualified(item):
    result = []
    for point in item.get('h', []):
        if not isinstance(point, (list, tuple)) or len(point) != 3:
            continue
        day, price, quantity = point
        try:
            if dt.date.fromisoformat(day).isoformat() != day:
                continue
        except (ValueError, TypeError):
            continue
        if _positive(price) and _positive(quantity) and quantity >= 5:
            result.append([day, price, quantity])
    return sorted(result)


def _weights(values):
    if not values or len(values) * .08 < 1 - 1e-10:
        raise ValueError('Insufficient qualifying cash baseline for a feasible 8% cap (at least 13 items required)')
    result, pending, remaining = [0.] * len(values), set(range(len(values))), 1.
    while pending:
        total = sum(values[i] for i in pending)
        over = {i for i in pending if remaining * values[i] / total > .08 + 1e-12}
        if not over:
            for i in pending:
                result[i] = remaining * values[i] / total
            break
        for i in over:
            result[i] = .08
        remaining -= .08 * len(over)
        pending -= over
    return result


def _payload(definition):
    return {key: definition[key] for key in ('version', 'indexSpecification', 'sourceSnapshotHash', 'rows')}


def make_definition(feed, cfg):
    spec = specification(cfg)
    if feed['updatedAt'][:10] <= spec['baseEnd']:
        raise ValueError('Cash reference period is not complete; baseline not frozen')
    rows, absent = [], []
    for entry in spec['configuredCashSchedule']:
        item = next((item for item in feed['items'] if item['n'] == entry['name'] and item['k'] == 'Cash Shop'), None)
        base = [p for p in _qualified(item or {}) if spec['baseStart'] <= p[0] <= spec['baseEnd']]
        if not base:
            absent.append(entry['name'])
            continue
        quantity, expenditure = sum(p[2] for p in base), sum(p[1] * p[2] for p in base)
        if not _positive(expenditure):
            raise ValueError('Non-finite cash baseline expenditure')
        rows.append({'slug': item['s'], 'name': entry['name'], 'nx': entry['nx'],
                     'basePrice': expenditure / quantity, 'baseQuantity': quantity,
                     'baseExpenditure': expenditure, 'baseObservationDays': len(base)})
    for row, weight in zip(rows, _weights([row['baseExpenditure'] for row in rows])):
        row['weight'] = weight
    result = {'version': 1, 'kind': 'cash_price_index', 'experimental': True,
              'indexSpecification': spec, 'specificationHash': _hash(spec),
              'sourceSnapshotHash': _hash(feed), 'selectionSourceUpdatedAt': feed['updatedAt'],
              'selectedAt': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
              'missingBaselineNames': absent, 'rows': rows}
    result['basketHash'] = _hash(_payload(result))
    return result


def validate_definition(definition, cfg):
    if definition.get('version') != 1 or definition.get('kind') != 'cash_price_index':
        raise ValueError('Unsupported frozen cash basket version')
    spec = specification(cfg)
    if definition.get('indexSpecification') != spec or cfg.get('weight_cap', .08) != .08:
        raise ValueError('Frozen cash basket configuration changed; explicit new version required')
    if definition.get('specificationHash') != _hash(spec) or definition.get('basketHash') != _hash(_payload(definition)):
        raise ValueError('Frozen cash basket integrity hash mismatch')
    rows = definition['rows']
    names = {row['name'] for row in rows}
    schedule = {entry['name']: entry['nx'] for entry in spec['configuredCashSchedule']}
    if len(rows) < 13 or len(names) != len(rows) or len({row['slug'] for row in rows}) != len(rows):
        raise ValueError('Invalid frozen cash cohort')
    for row in rows:
        if (schedule.get(row['name']) != row['nx'] or not all(_positive(row.get(k)) for k in ('basePrice', 'baseQuantity', 'baseExpenditure', 'weight'))
                or row['weight'] > .08 + 1e-10):
            raise ValueError('Invalid frozen cash baseline row')
    if abs(sum(row['weight'] for row in rows) - 1) > 1e-9:
        raise ValueError('Frozen cash weights do not sum to one')


def unavailable(feed, cfg, reason):
    return {'status': 'unavailable', 'reason': str(reason), 'kind': 'cash_price_index', 'experimental': True,
            'version': 1, 'methodVersion': 1, 'baseStart': cfg.get('base_start'), 'baseEnd': cfg.get('base_end'),
            'baseIndex': 100, 'configuredItemCount': len(cfg.get('nx_prices', {})), 'missingBaselineCount': None,
            'missingBaselineNames': [], 'itemCount': 0, 'sourceUpdatedAt': feed.get('updatedAt'),
            'rows': [], 'history': [], 'latest': None, 'historyKind': 'reconstructed'}


def compute_from_definition(feed, definition, cfg):
    validate_definition(definition, cfg)
    source_day = feed['updatedAt'][:10]
    dt.date.fromisoformat(source_day)
    spec, rows = definition['indexSpecification'], []
    by_slug = {item['s']: item for item in feed['items']}
    for base in definition['rows']:
        item = by_slug.get(base['slug'])
        valid = item is not None and item['k'] == 'Cash Shop' and item['n'] == base['name']
        history = [p for p in _qualified(item or {}) if p[0] <= source_day] if valid else []
        last = history[-1] if history else None
        price = last[1] if last else None
        rows.append({**base, 'history': history, 'price': price, 'priceDay': last[0] if last else None,
                     'quantity': last[2] if last else None, 'sourceUpdatedAt': feed['updatedAt'],
                     'missingSource': not valid,
                     'changeBase': (price / base['basePrice'] - 1) * 100 if last else None,
                     'indexContribution': 100 * base['weight'] * price / base['basePrice'] if last else None,
                     'changeContribution': 100 * base['weight'] * (price / base['basePrice'] - 1) if last else None})
    dates = sorted({source_day} | {p[0] for item in feed['items'] for p in _qualified(item) if p[0] <= source_day})
    history = []
    for day in dates:
        points, priced, observed = [], 0., 0.
        for row in rows:
            past = [p for p in row['history'] if p[0] <= day]
            if past:
                points.append(row['weight'] * past[-1][1] / row['basePrice'])
                priced += row['weight']
                if past[-1][0] == day:
                    observed += row['weight']
        history.append({'at': feed['updatedAt'] if day == source_day else day + 'T23:59:59Z', 'day': day,
                        'cpi': 100 * sum(points) if priced > .999999 else None,
                        'coverage': observed, 'pricedCoverage': priced, 'partial': day == source_day})
    return {'status': 'ok', 'reason': None, 'kind': 'cash_price_index', 'experimental': True,
            'version': 1, 'methodVersion': 1, 'baseStart': spec['baseStart'], 'baseEnd': spec['baseEnd'],
            'baseIndex': 100, 'configuredItemCount': len(spec['configuredCashSchedule']),
            'missingBaselineCount': len(definition['missingBaselineNames']),
            'missingBaselineNames': definition['missingBaselineNames'], 'itemCount': len(rows),
            **{key: definition[key] for key in ('indexSpecification', 'specificationHash', 'basketHash',
               'sourceSnapshotHash', 'selectionSourceUpdatedAt', 'selectedAt')},
            'baseExpenditure': sum(row['baseExpenditure'] for row in rows),
            'baseQuantity': sum(row['baseQuantity'] for row in rows),
            'sourceUpdatedAt': feed['updatedAt'], 'historyKind': 'reconstructed',
            'rows': rows, 'history': history, 'latest': history[-1]}


def compute_cash_basket(feed, cfg, root):
    """Cash baseline failure never blocks the independently defined goods CPI."""
    try:
        path = Path(root) / 'cache' / 'cash-basket-v1.json'
        if path.exists():
            definition = json.loads(path.read_text(encoding='utf-8'))
        else:
            definition = make_definition(feed, cfg)
            validate_definition(definition, cfg)
            path.parent.mkdir(parents=True, exist_ok=True)
            temp = path.with_suffix('.json.tmp')
            temp.write_text(json.dumps(definition, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
            os.replace(temp, path)
        return compute_from_definition(feed, definition, cfg)
    except (KeyError, TypeError, ValueError, ArithmeticError, OSError) as error:
        return unavailable(feed, cfg, error)
