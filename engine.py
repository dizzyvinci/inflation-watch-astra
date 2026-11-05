"""Reproducible, attributed market statistics. No visitor-triggered upstream calls."""
import argparse
import datetime as dt
import hashlib
import html
import json
import math
import os
from pathlib import Path
import re
import shutil
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
UTC = dt.timezone.utc


def now():
    return dt.datetime.now(UTC).isoformat(timespec='seconds')


def read(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except FileNotFoundError:
        return default


def atomic(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    os.replace(temp, path)


def positive(x):
    return isinstance(x, (float, int)) and not isinstance(x, bool) and math.isfinite(x) and x > 0


def source_summary(item, source_updated_at):
    """Keep independently dated source summaries separate from daily history prices."""
    def finite_number(value):
        try:
            return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
        except OverflowError:
            return False

    result = {'sourceUpdatedAt': source_updated_at, 'window': 'unspecified_source_summary',
              'kind': 'source_published_summary'}
    for source, output in [('p', 'medianSale'), ('p25', 'p25'), ('p75', 'p75'),
                           ('lo', 'lowSale'), ('hi', 'highSale'), ('ask', 'medianSellerAsk')]:
        value = item.get(source)
        result[output] = value if finite_number(value) and value > 0 else None
    for source, output in [('asks', 'listings'), ('sellers', 'sellers')]:
        value = item.get(source)
        valid = finite_number(value) and 0 <= value <= 9007199254740991 and int(value) == value
        result[output] = int(value) if valid else None
    value = item.get('st')
    result['sellThrough'] = value if finite_number(value) and 0 <= value <= 1 else None
    value = item.get('last')
    valid = isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})', value)
    if valid:
        try:
            valid = (value.endswith('Z') or (int(value[-5:-3]) <= 23 and int(value[-2:]) <= 59))
            # Validate calendar/time independently of fractional precision;
            # Python 3.10 and the Worker accept different fromisoformat widths.
            valid = valid and dt.datetime.fromisoformat(value[:19]) is not None
        except ValueError:
            valid = False
    result['reportedLastSaleAt'] = value if valid else None
    return result


def capped_weights(values, cap=.08):
    if not values or len(values) * cap < 1 - 1e-10 or not all(positive(x) for x in values):
        raise ValueError('Invalid or infeasible basket weights')
    result = [0.] * len(values)
    pending = set(range(len(values)))
    remaining = 1.
    while pending:
        total = sum(values[i] for i in pending)
        over = {i for i in pending if remaining * values[i] / total > cap + 1e-12}
        if not over:
            for i in pending:
                result[i] = remaining * values[i] / total
            break
        for i in over:
            result[i] = cap
        remaining -= cap * len(over)
        pending -= over
    return result


def validate_feed(feed):
    if not isinstance(feed, dict) or not isinstance(feed.get('items'), list) or len(feed['items']) < 50:
        raise ValueError('Feed has no usable item list')
    stamp = dt.datetime.fromisoformat(feed['updatedAt'].replace('Z', '+00:00'))
    if stamp.tzinfo is None or stamp > dt.datetime.now(UTC) + dt.timedelta(minutes=10):
        raise ValueError('Invalid feed timestamp')
    seen = set()
    for item in feed['items']:
        if not all(k in item for k in ('n', 's', 'k', 'h')) or item['s'] in seen:
            raise ValueError('Malformed or duplicate feed item')
        seen.add(item['s'])
        previous = ''
        for day, price, qty in item['h']:
            dt.date.fromisoformat(day)
            if day <= previous or not positive(price) or not isinstance(qty, int) or isinstance(qty, bool) or qty < 0:
                raise ValueError('Invalid historical observation')
            previous = day
    return feed


def fetch_feed(offline=False):
    cache = ROOT / 'cache' / 'market.json'
    meta_path = ROOT / 'cache' / 'fetch.json'
    previous = read(meta_path, {})
    if offline:
        return validate_feed(read(cache)), {'status': 'cached', 'checkedAt': previous.get('checkedAt'), 'detail': 'Offline verification; retained source timestamp.'}
    cfg = read(ROOT / 'config.json')
    headers = {'User-Agent': 'inflation.gg/preview (local market-index research; https://inflation.gg/)', 'Accept': 'application/json'}
    if previous.get('etag'):
        headers['If-None-Match'] = previous['etag']
    if previous.get('lastModified'):
        headers['If-Modified-Since'] = previous['lastModified']
    checked = now()
    try:
        with urllib.request.urlopen(urllib.request.Request(cfg['feed_url'], headers=headers), timeout=25) as response:
            body = response.read(5_000_001)
            if len(body) > 5_000_000:
                raise ValueError('Oversized feed')
            feed = validate_feed(json.loads(body))
            old = read(cache)
            if old and feed['updatedAt'] < old['updatedAt']:
                raise ValueError('Source timestamp moved backwards')
            atomic(cache, feed)
            meta = {'status': 'ok', 'checkedAt': checked, 'etag': response.headers.get('ETag'), 'lastModified': response.headers.get('Last-Modified'), 'detail': 'Public developer feed; source publishes daily aggregates.'}
            atomic(meta_path, meta)
            return feed, meta
    except urllib.error.HTTPError as error:
        if error.code == 304 and cache.exists():
            meta = {**previous, 'status': 'unchanged', 'checkedAt': checked}
            atomic(meta_path, meta)
            return validate_feed(read(cache)), meta
        message = f'HTTP {error.code}'
    except Exception as error:
        message = type(error).__name__ + ': ' + str(error)[:160]
    if not cache.exists():
        raise RuntimeError('No good source cache; refusing to manufacture data: ' + message)
    return validate_feed(read(cache)), {**previous, 'status': 'degraded', 'checkedAt': checked, 'detail': 'Source unavailable; using last good data. ' + message}


def canonical_hash(value):
    """Hash a complete JSON value independently of object key insertion order."""
    body = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    return hashlib.sha256(body.encode('utf-8')).hexdigest()


def basket_specification(cfg):
    return {
        'methodVersion': 2, 'name': 'Capped base-expenditure price index',
        'sourceUrl': cfg['feed_url'], 'baseStart': cfg['base_start'], 'baseEnd': cfg['base_end'],
        'basketSize': cfg['basket_size'], 'weightCap': cfg['weight_cap'],
        'minimumBaseDailyVolume': cfg.get('minimum_base_daily_volume', 5),
        'liquidityDailyVolume': cfg.get('basket_liquidity_daily_volume', 50),
        'minimumLiquidityDays': cfg.get('basket_minimum_liquidity_days', 5),
        'excludedSourceCategories': ['Cash Shop'], 'selectionMetric': 'sum(daily median price * recorded sold volume)',
        'tieBreak': 'slug ascending', 'basePrice': 'base expenditure proxy / base recorded sold volume',
        'formula': '100 * sum(fixed capped base expenditure weight * current daily median / fixed base price)',
        'historyKind': 'reconstructed', 'missingPricePolicy': 'last source daily median with volume >= 5; observed coverage reported separately',
        'quantityCaveat': 'Source recorded sold volume; transaction, lot and stack-unit semantics are not independently verified.',
        'turnoverCaveat': 'Daily median times recorded volume is an estimated turnover proxy, not summed trade expenditure.'}


def archive_v1_publication():
    """Preserve only the already-published CPI definition and series, never private inputs."""
    target = ROOT / 'history' / 'cpi-v1.json'
    if target.exists():
        return
    published = read(ROOT / 'dist' / 'data.json')
    if not published or published.get('basketVersion') != 1:
        return
    fields = ('at', 'day', 'cpi', 'coverage', 'partial')
    row_fields = ('slug', 'name', 'basePrice', 'baseQuantity', 'baseExpenditure', 'selectionQuantity', 'weight')
    legacy = read(ROOT / 'cache' / 'basket-v1.json', {})
    atomic(target, {
        'methodVersion': 1, 'basketVersion': 1, 'archivedAt': now(),
        'sourceBuiltAt': published.get('builtAt'), 'sourceUpdatedAt': published.get('sourceUpdatedAt'),
        'feedUrl': published.get('feedUrl'), 'baseStart': published.get('baseStart'), 'baseEnd': published.get('baseEnd'),
        'selectionStart': published.get('selectionStart'), 'selectionEndExclusive': published.get('selectionEndExclusive'),
        'indexDefinition': {'selectionMetric': 'prior seven-day recorded sold volume',
                            'weightMetric': 'fixed capped base expenditure proxy', 'weightCap': .08,
                            'rows': [{k: row[k] for k in row_fields if k in row} for row in published.get('rows', legacy.get('rows', []))]},
        'history': [{k: point[k] for k in fields if k in point} for point in published.get('history', [])]})


def create_basket(feed, cfg):
    """Persist one versioned definition; changing inputs never silently reselects it."""
    version = cfg.get('basket_version', 1)
    if version == 1:
        return create_legacy_basket(feed, cfg)
    if version != 2:
        raise ValueError('Unsupported basket version; an explicit implementation is required')
    archive_v1_publication()
    spec = basket_specification(cfg)
    path = ROOT / 'cache' / 'basket-v2.json'
    existing = read(path)
    if existing:
        if existing.get('version') != 2 or existing.get('indexSpecification') != spec:
            raise ValueError('Frozen basket specification changed; use an explicit new version')
        if existing.get('specificationHash') != canonical_hash(spec):
            raise ValueError('Frozen basket specification hash mismatch')
        payload = {k: existing[k] for k in ('version', 'indexSpecification', 'sourceSnapshotHash', 'rows')}
        if existing.get('basketHash') != canonical_hash(payload):
            raise ValueError('Frozen basket integrity hash mismatch')
        source = read(ROOT / 'cache' / 'basket-v2-source.json')
        if source is None or canonical_hash(source) != existing['sourceSnapshotHash']:
            raise ValueError('Frozen basket source snapshot is missing or changed')
        return existing
    if feed['updatedAt'][:10] <= cfg['base_end']:
        raise ValueError('Reference period is not complete; refusing to freeze the basket')
    eligible, total_expenditure = [], 0.
    for item in feed['items']:
        if item['k'] == 'Cash Shop':
            continue
        base = [(p, q) for d, p, q in item['h'] if cfg['base_start'] <= d <= cfg['base_end'] and q >= spec['minimumBaseDailyVolume']]
        expenditure = sum(p * q for p, q in base)
        total_expenditure += expenditure
        liquidity_days = sum(q >= spec['liquidityDailyVolume'] for p, q in base)
        if liquidity_days < spec['minimumLiquidityDays']:
            continue
        quantity = sum(q for p, q in base)
        eligible.append({'slug': item['s'], 'basePrice': expenditure / quantity, 'baseQuantity': quantity,
                         'baseExpenditure': expenditure, 'selectionQuantity': quantity,
                         'baseObservationDays': len(base), 'liquidityDays': liquidity_days})
    eligible.sort(key=lambda row: (-row['baseExpenditure'], row['slug']))
    rows = eligible[:cfg['basket_size']]
    if len(rows) != cfg['basket_size']:
        raise ValueError('Insufficient base-period liquidity for the fixed basket')
    for row, weight in zip(rows, capped_weights([r['baseExpenditure'] for r in rows], cfg['weight_cap'])):
        row['weight'] = weight
    source_hash = canonical_hash(feed)
    snapshot_path = ROOT / 'cache' / 'basket-v2-source.json'
    prior_snapshot = read(snapshot_path)
    if prior_snapshot is not None and canonical_hash(prior_snapshot) != source_hash:
        raise ValueError('An unpaired frozen source snapshot exists; review it before creating the basket')
    atomic(snapshot_path, feed)
    result = {'version': 2, 'selectedAt': now(), 'selectionStart': cfg['base_start'],
              'selectionEndExclusive': (dt.date.fromisoformat(cfg['base_end']) + dt.timedelta(days=1)).isoformat(),
              'baseStart': cfg['base_start'], 'baseEnd': cfg['base_end'], 'rows': rows,
              'indexSpecification': spec, 'specificationHash': canonical_hash(spec), 'sourceSnapshotHash': source_hash,
              'sourceUpdatedAt': feed['updatedAt'], 'historyKind': 'reconstructed',
              'baseTurnoverCoverageProxy': sum(r['baseExpenditure'] for r in rows) / total_expenditure,
              'eligibleBaseTurnoverCoverageProxy': sum(r['baseExpenditure'] for r in eligible) / total_expenditure}
    result['basketHash'] = canonical_hash({k: result[k] for k in ('version', 'indexSpecification', 'sourceSnapshotHash', 'rows')})
    atomic(path, result)
    return result


def create_legacy_basket(feed, cfg):
    """Freeze membership and base expenditure weights once, not at every poll."""
    path = ROOT / 'cache' / 'basket-v1.json'
    existing = read(path)
    if existing:
        return existing
    cutoff = dt.date.fromisoformat(feed['updatedAt'][:10])
    start = (cutoff - dt.timedelta(days=7)).isoformat()
    eligible = []
    for item in feed['items']:
        base = [(p, q) for d, p, q in item['h'] if cfg['base_start'] <= d <= cfg['base_end'] and q >= 5]
        if item['k'] == 'Cash Shop' or len(base) < 5:
            continue
        base_qty = sum(q for p, q in base)
        base_price = sum(p * q for p, q in base) / base_qty
        recent = sum(q for d, p, q in item['h'] if start <= d < cutoff.isoformat())
        eligible.append({'slug': item['s'], 'basePrice': base_price, 'baseQuantity': base_qty, 'baseExpenditure': base_price * base_qty, 'selectionQuantity': recent})
    eligible.sort(key=lambda row: (-row['selectionQuantity'], row['slug']))
    rows = eligible[:cfg['basket_size']]
    if len(rows) != cfg['basket_size']:
        raise ValueError('Insufficient base-period coverage for a 50-item basket')
    for row, weight in zip(rows, capped_weights([r['baseExpenditure'] for r in rows], cfg['weight_cap'])):
        row['weight'] = weight
    result = {'version': 1, 'selectedAt': now(), 'selectionStart': start, 'selectionEndExclusive': cutoff.isoformat(), 'baseStart': cfg['base_start'], 'baseEnd': cfg['base_end'], 'rows': rows}
    atomic(path, result)
    return result


def category(item):
    return {'Etc': 'Materials', 'Use': 'Consumables', 'Scrolls': 'Scrolls', 'Stars': 'Weapons', 'Weapons': 'Weapons', 'Equips': 'Equipment', 'Cash Shop': 'Cash Shop'}[item['k']]


def nx_rate(rows):
    valid = [(p / nx, q) for p, nx, q in rows if positive(p) and positive(nx) and positive(q)]
    return sum(r * q for r, q in valid) / sum(q for r, q in valid) if valid else None


def volume_history(feed, basket_slugs):
    """Sum recorded daily median × volume; missing observations are not imputed."""
    days = {}
    source_day = feed['updatedAt'][:10]
    for item in feed['items']:
        for day, price, quantity in item['h']:
            point = days.setdefault(day, {'day': day, 'at': day+'T12:00:00Z',
                'allMesos': 0, 'basketMesos': 0, 'allSoldVolume': 0,
                'basketSoldVolume': 0, 'allItemsObserved': 0, 'basketItemsObserved': 0,
                'partial': day == source_day})
            point['allMesos'] += price * quantity
            point['allSoldVolume'] += quantity
            point['allItemsObserved'] += 1
            if item['s'] in basket_slugs:
                point['basketMesos'] += price * quantity
                point['basketSoldVolume'] += quantity
                point['basketItemsObserved'] += 1
    return [days[day] for day in sorted(days)]


def load_live(cfg, basket, by_slug, cash):
    """Optional contracted/private feed, normalized to explicit source provenance."""
    payload = read(ROOT / 'incoming' / 'observations.json')
    if not payload:
        return None, 'Awaiting a usable intraday feed. Daily feed remains dated; no synthetic live ticks.'
    stamp = dt.datetime.fromisoformat(payload['observedAt'].replace('Z', '+00:00'))
    if stamp.tzinfo is None or stamp > dt.datetime.now(UTC) + dt.timedelta(minutes=5):
        raise ValueError('Invalid intraday source time')
    if (dt.datetime.now(UTC) - stamp).total_seconds() > 2400:
        return None, 'Intraday input is older than 40 minutes; retained as historical, excluded from the live headline.'
    if payload.get('kind') != 'scanner_sales' or not str(payload.get('sourceUrl', '')).startswith('https://'):
        raise ValueError('Intraday input must identify a scanner-sales source URL')
    observations = payload['items']
    if not isinstance(observations, list) or len({r['slug'] for r in observations}) != len(observations):
        raise ValueError('Duplicate/malformed intraday records')
    valid = {}
    for row in observations:
        if positive(row.get('price')) and positive(row.get('quantity')) and row.get('evidence') == 'sold' and row['slug'] in by_slug:
            valid[row['slug']] = row
    coverage = sum(r['weight'] for r in basket['rows'] if r['slug'] in valid)
    nx_rows = [r for r in cash if r['slug'] in valid]
    nx_total = sum(r['recentQuantity'] for r in cash)
    nx_coverage = sum(r['recentQuantity'] for r in nx_rows) / nx_total if nx_total else 0
    cpi = sum(r['weight'] * valid[r['slug']]['price'] / r['basePrice'] for r in basket['rows'] if r['slug'] in valid) / coverage * 100 if coverage >= cfg['minimum_live_coverage'] else None
    nx = nx_rate([(valid[r['slug']]['price'], r['nx'], valid[r['slug']]['quantity']) for r in nx_rows]) if len(nx_rows) >= cfg['minimum_nx_live_items'] and nx_coverage >= cfg['minimum_nx_live_coverage'] else None
    return {'observedAt': payload['observedAt'], 'sourceUrl': payload['sourceUrl'], 'coverage': coverage, 'nxCoverage': nx_coverage, 'cpi': cpi, 'nxRate': nx, 'items': list(valid.values())}, 'Scanner input accepted; headline gates require 80% CPI weight and 60% NX volume across at least three cash items.'


def compute(feed, status):
    cfg = read(ROOT / 'config.json')
    basket = create_basket(feed, cfg)
    by_slug = {i['s']: i for i in feed['items']}
    source_day = feed['updatedAt'][:10]
    last_complete = (dt.date.fromisoformat(source_day) - dt.timedelta(days=1)).isoformat()
    recent_start = (dt.date.fromisoformat(source_day) - dt.timedelta(days=7)).isoformat()
    missing = [r['slug'] for r in basket['rows'] if r['slug'] not in by_slug]
    if missing:
        raise ValueError('Basket members disappeared; retain last good output instead of rebasing: ' + ', '.join(missing))
    rows = []
    for base in basket['rows']:
        item = by_slug[base['slug']]
        hist = [x for x in item['h'] if x[2] >= 5]
        day, price, qty = hist[-1]
        previous = hist[-2][1] if len(hist) > 1 else price
        recent = [x for x in item['h'] if recent_start <= x[0] < source_day]
        rows.append({**base, 'name': item['n'], 'category': category(item), 'price': price, 'priceDay': day, 'quantity': qty, 'recentQuantity': sum(x[2] for x in recent), 'recentTurnoverProxy': sum(x[1] * x[2] for x in recent), 'unit': item.get('u', 'unit'), 'changeBase': (price / base['basePrice'] - 1) * 100, 'changeDay': (price / previous - 1) * 100, 'history': item['h'], 'sourceUrl': 'https://maplestory-classic.com/market/' + item['s']})
    for row in rows:
        row['sourceSummary'] = source_summary(by_slug[row['slug']], feed['updatedAt'])
        row['indexContribution'] = 100 * row['weight'] * row['price'] / row['basePrice']
        row['changeContribution'] = 100 * row['weight'] * (row['price'] / row['basePrice'] - 1)
        row['notIndexed'] = False
    context_items = []
    selected_slugs = {row['slug'] for row in rows}
    frozen_source = read(ROOT / 'cache' / 'basket-v2-source.json', feed) if basket['version'] == 2 else feed
    frozen_by_slug = {item['s']: item for item in frozen_source['items']}
    for slug in ('wolbi-throwing-stars',):
        item = by_slug.get(slug)
        if item is None or slug in selected_slugs:
            continue
        hist = [point for point in item['h'] if point[2] >= 5]
        base_hist = [point for point in frozen_by_slug.get(slug, item)['h'] if cfg['base_start'] <= point[0] <= cfg['base_end'] and point[2] >= 5]
        if not hist or not base_hist:
            continue
        base_quantity = sum(q for d, p, q in base_hist)
        base_price = sum(p * q for d, p, q in base_hist) / base_quantity
        day, price, quantity = hist[-1]
        recent = [point for point in item['h'] if recent_start <= point[0] < source_day]
        context_items.append({'slug': slug, 'name': item['n'], 'category': category(item),
                              'price': price, 'priceDay': day, 'quantity': quantity, 'basePrice': base_price,
                              'changeBase': (price / base_price - 1) * 100,
                              'changeDay': (price / hist[-2][1] - 1) * 100 if len(hist) > 1 else 0,
                              'recentQuantity': sum(q for d, p, q in recent),
                              'recentTurnoverProxy': sum(p * q for d, p, q in recent),
                              'unit': item.get('u', 'unit'), 'history': item['h'], 'weight': 0.,
                              'notIndexed': True, 'indexContribution': 0., 'changeContribution': 0.,
                              'sourceUrl': 'https://maplestory-classic.com/market/' + slug})
        context_items[-1]['sourceSummary'] = source_summary(item, feed['updatedAt'])
    cash = []
    for name, nx in cfg['nx_prices'].items():
        item = next((i for i in feed['items'] if i['n'] == name and i['k'] == 'Cash Shop'), None)
        if not item:
            continue
        hist = [x for x in item['h'] if x[2] >= 5]
        if not hist:
            continue
        day, price, qty = hist[-1]
        cash.append({'name': name, 'slug': item['s'], 'nx': nx, 'price': price, 'priceDay': day, 'quantity': qty, 'rate': price / nx, 'recentQuantity': sum(q for d,p,q in item['h'] if recent_start <= d < source_day), 'history': item['h']})
        cash[-1]['sourceSummary'] = source_summary(item, feed['updatedAt'])
    dates = sorted({d for i in feed['items'] for d,p,q in i['h']})
    history = []
    for day in dates:
        points, covered, observed = [], 0., 0.
        for row in rows:
            past = [x for x in row['history'] if x[0] <= day and x[2] >= 5]
            if past:
                points.append(row['weight'] * past[-1][1] / row['basePrice'])
                covered += row['weight']
                if past[-1][0] == day:
                    observed += row['weight']
        cash_points = []
        for row in cash:
            obs = next((x for x in row['history'] if x[0] == day and x[2] >= 5), None)
            if obs:
                cash_points.append((obs[1], row['nx'], obs[2]))
        history.append({'at': day + 'T23:59:59Z' if day != source_day else feed['updatedAt'], 'day': day, 'cpi': sum(points) * 100 if covered > .999999 else None, 'coverage': observed, 'nxRate': nx_rate(cash_points) if len(cash_points) >= 3 else None, 'cashItems': len(cash_points), 'partial': day == source_day})
    latest = history[-1]
    base_nx_points = [(p,r['nx'],q) for r in cash for d,p,q in r['history'] if cfg['base_start'] <= d <= cfg['base_end'] and q >= 5]
    nx_base_path = ROOT/'cache'/'nx-base-v1.json'
    nx_base = read(nx_base_path)
    if nx_base:
        if nx_base['baseStart'] != cfg['base_start'] or nx_base['baseEnd'] != cfg['base_end'] or not positive(nx_base.get('rate')):
            raise ValueError('NX base changed or is invalid; explicit versioning required')
        base_nx = nx_base['rate']
    else:
        base_nx = nx_rate(base_nx_points)
        if not positive(base_nx):
            raise ValueError('No NX base observations; retain the last good output')
        atomic(nx_base_path, {'rate':base_nx, 'baseStart':cfg['base_start'], 'baseEnd':cfg['base_end'], 'sourceUpdatedAt':feed['updatedAt']})
    categories = []
    for cat in ['Scrolls', 'Equipment', 'Weapons', 'Materials', 'Consumables']:
        subset = [r for r in rows if r['category'] == cat]
        weight = sum(r['weight'] for r in subset)
        if weight:
            categories.append({'name': cat, 'count': len(subset), 'weight': weight, 'index': sum(r['weight'] * r['price'] / r['basePrice'] for r in subset) / weight * 100})
    live, live_note = load_live(cfg, basket, by_slug, cash)
    ledger_path = ROOT / 'cache' / 'intraday-ledger.json'
    ledger = read(ledger_path, [])
    if live and (live['cpi'] is not None or live['nxRate'] is not None):
        key = (live['sourceUrl'], live['observedAt'])
        if not any((p['sourceUrl'], p['observedAt']) == key for p in ledger):
            ledger.append({k:v for k,v in live.items() if k != 'items'})
            ledger.sort(key=lambda p:p['observedAt'])
            atomic(ledger_path, ledger[-10000:])
    total_qty = sum(q for i in feed['items'] for d,p,q in i['h'] if recent_start <= d < source_day)
    total_turnover = sum(p*q for i in feed['items'] for d,p,q in i['h'] if recent_start <= d < source_day)
    report = {'schemaVersion': 1, 'builtAt': now(), 'sourceUpdatedAt': feed['updatedAt'], 'sourceStatus': status, 'pollSeconds': cfg['poll_seconds'], 'feedUrl': cfg['feed_url'], 'lastCompleteDay': last_complete, 'basketVersion': basket['version'], 'baseStart': cfg['base_start'], 'baseEnd': cfg['base_end'], 'selectionStart': basket['selectionStart'], 'selectionEndExclusive': basket['selectionEndExclusive'], 'itemsAvailable': len(feed['items']), 'salesSinceLaunch': sum(i.get('sold',0) for i in feed['items']), 'allRecentQuantity': total_qty, 'basketRecentQuantity': sum(r['recentQuantity'] for r in rows), 'quantityCoverage': sum(r['recentQuantity'] for r in rows)/total_qty, 'turnoverCoverageProxy': sum(r['recentTurnoverProxy'] for r in rows)/total_turnover, 'latest': latest, 'baseNxRate': base_nx, 'rows': rows, 'cash': cash, 'categories': categories, 'history': history, 'live': live, 'liveNote': live_note, 'intraday': ledger, 'comparisons': read(ROOT/'comparison-observations.json', []), 'smega': read(ROOT/'cache'/'smega-series.json', []), 'wolbi': {'eventStart': '2026-10-25', 'eventEnd': '2026-10-26', 'certainty': 'Market supply shift inferred from daily prices, not a verified first-unlock date.', 'text': 'Wolbi became available through the Kerning citizenship shop as players reached the required rank. The feed median fell from 19,999 on Oct 24 to 7,999 on Oct 25 and 3,648 on Oct 26. This supply change can resemble deflation. Rank 3 / Helpful Stranger is reported; max citizenship is not required. The exact first eligible date remains unverified.', 'sourceUrl': 'https://meowdb.com/msclassic/npcs/428'}}
    from adapters import rolling_reference
    rolling, rolling_history = rolling_reference(rows, cash, ROOT)
    report['rollingReference'] = rolling
    report['rollingReferenceHistory'] = rolling_history
    report['smega'] += read(ROOT/'cache'/'published-smega-series.json', [])
    report['smegaSource'] = read(ROOT/'cache'/'published-smega-summary.json')
    report['spriteMap'] = read(ROOT/'assets'/'sprites.json', {})
    report['publicApiStatus'] = read(ROOT/'cache'/'public-api-status.json', {'status':'requires_api_key'})
    report['volumeHistory'] = volume_history(feed, {row['slug'] for row in rows})
    report['recentStart'] = recent_start
    report['recentEndExclusive'] = source_day
    report['contextItems'] = context_items
    report['methodVersion'] = basket['version']
    report['indexSpecification'] = basket.get('indexSpecification')
    report['specificationHash'] = basket.get('specificationHash')
    report['basketHash'] = basket.get('basketHash')
    report['sourceSnapshotHash'] = basket.get('sourceSnapshotHash')
    report['historyKind'] = basket.get('historyKind', 'reconstructed')
    report['historyNote'] = 'Historical values are reconstructed using this fixed basket and its dated source medians; they are not contemporaneously published observations.'
    report['baseTurnoverCoverageProxy'] = basket.get('baseTurnoverCoverageProxy')
    report['eligibleBaseTurnoverCoverageProxy'] = basket.get('eligibleBaseTurnoverCoverageProxy')
    report['legacyCpiHistoryUrl'] = '/history/cpi-v1.json' if (ROOT / 'history' / 'cpi-v1.json').exists() else None
    report['reportedNxHistory'] = read(ROOT / 'history' / 'niadb-reported-nx-history.json', {})
    from cash_basket import compute_cash_basket
    report['cashBasket'] = compute_cash_basket(feed, cfg, ROOT)
    return report


def write_site(report):
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    from icons import write_icons
    write_icons(report, dist / 'assets')
    if (ROOT/'assets').exists():
        shutil.copytree(ROOT/'assets', dist/'assets', dirs_exist_ok=True)
    legacy_history = ROOT / 'history' / 'cpi-v1.json'
    if legacy_history.exists():
        (dist / 'history').mkdir(exist_ok=True)
        shutil.copyfile(legacy_history, dist / 'history' / 'cpi-v1.json')
    for name in ('index.html', 'app.js', 'style.css', 'community.js', 'community.css', 'layout-preview.js', 'layout-preview.css', 'chart-interaction.js', 'chart-interaction.css', 'privacy-controls.js', 'privacy-controls.css', 'analytics-config.json', 'preview-runtime.js', 'preview-runtime.css', 'author-portrait.js', 'author-portrait.css', '_headers', 'sw.js'):
        shutil.copyfile(ROOT / 'web' / name, dist / name)
    data_text = json.dumps(report, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    digest = hashlib.sha256(data_text.encode()).hexdigest()[:16]
    # Immutable data payload first; version.json is the atomic final pointer.
    atomic(dist / ('data-' + digest + '.json'), report)
    atomic(dist / 'data.json', report)
    rate = report['live']['nxRate'] if report['live'] and report['live']['nxRate'] is not None else report['latest']['nxRate']
    cpi = report['live']['cpi'] if report['live'] and report['live']['cpi'] is not None else report['latest']['cpi']
    fallback = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="120"><title>inflation.gg · Last known data</title><style>body{{background:#101c26;color:#e9e5d9;font:17px system-ui;max-width:660px;margin:10vh auto;padding:28px}}h1{{color:#edc471}}a{{color:#9dd3cd}}strong{{font-size:34px}}dt{{color:#a0b3b8;margin-top:20px}}</style><h1>inflation.gg</h1><p>Last known snapshot · treat these figures as historical.</p><p><strong>1:{rate:.1f}</strong> NX : mesos</p><p>{rate*1000:,.0f} mesos per 1,000 NX · MPI {cpi:.1f}</p><dl><dt>Market source updated</dt><dd>{html.escape(report['sourceUpdatedAt'])}</dd><dt>Page generated</dt><dd>{html.escape(report['builtAt'])}</dd><dt>Source checked</dt><dd>{html.escape(str(report['sourceStatus'].get('checkedAt') or 'unknown'))}</dd></dl><p>A source or connection may be unavailable. A fresh build does not imply fresh market data. This lightweight page retries every two minutes.</p><a href="/">Try full dashboard</a> · <a href="https://maplestory-classic.com/market">Data source</a></html>'''
    (dist / 'fallback.html').write_text(fallback, encoding='utf-8')
    (dist / '404.html').write_text(fallback, encoding='utf-8')
    atomic(dist / 'version.json', {'version': digest, 'data': 'data-' + digest + '.json', 'builtAt': report['builtAt'], 'sourceUpdatedAt': report['sourceUpdatedAt']})
    return digest


def build(offline=False):
    lock = ROOT / '.collector.lock'
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise RuntimeError('Another collector owns this checkout; skipped overlapping refresh')
    try:
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        feed, status = fetch_feed(offline)
        if not offline:
            from public_api import refresh
            refresh(ROOT)
        report = compute(feed, status)
        digest = write_site(report)
        return report, digest
    finally:
        lock.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    report, digest = build(args.offline)
    print(json.dumps({'version':digest,'sourceUpdatedAt':report['sourceUpdatedAt'],'cpi':report['latest']['cpi'],'nxRate':report['latest']['nxRate'],'basketItems':len(report['rows']),'cashItems':len(report['cash'])}))
