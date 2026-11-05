"""Read-only local catalogue routes, bound to a fully published named report.

No engine/build import or provider transport. A visitor can only read the local
accepted source, immutable identity map, final pointer and its named report.
"""
from collections import OrderedDict
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
import threading
import time
from urllib.parse import parse_qsl, urlsplit

from market_catalog import MarketCatalog
from portable_hash import HASH_METHOD, portable_hash

_HASH = re.compile(r'^[a-f0-9]{64}$')
_VERSION = re.compile(r'^[a-f0-9]{16}$')
_ITEM = re.compile(r'^/market-item/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$')
_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store, no-transform',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
}


def _json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def _stat(path):
    value = path.stat()
    return value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns


def _read(path, limit):
    before = _stat(path)
    if before[2] > limit:
        raise ValueError('Oversized local catalogue input')
    with path.open('rb') as source:
        raw = source.read(limit + 1)
    if len(raw) > limit or before != _stat(path):
        raise ValueError('Changing local catalogue input')
    return raw, before


def _decode(raw):
    def invalid(_value):
        raise ValueError('Nonfinite JSON')
    def pairs(values):
        result = {}
        for key, value in values:
            if key in result:
                raise ValueError('Duplicate JSON key')
            result[key] = value
        return result
    return json.loads(raw.decode('utf-8'), parse_constant=invalid, object_pairs_hook=pairs)


@dataclass(frozen=True)
class CatalogResponse:
    status: int
    headers: dict
    body: bytes


class _Generation:
    def __init__(self, feed, identities):
        self.catalog = MarketCatalog(feed, identities)
        self.index = self.catalog.build_index()
        self.slugs = frozenset(row['slug'] for row in self.index['rows'])
        self.index_bytes = _json_bytes(self.index)
        self.metadata = {
            'schemaVersion': 1, 'hashMethod': HASH_METHOD,
            'catalogHash': self.catalog.catalog_hash,
            'sourceProjectionHash': self.catalog.source_projection_hash,
            'sourceUpdatedAt': self.catalog.source_updated_at,
            'itemCount': len(self.index['rows']),
            'identityVersion': portable_hash({'hashMethod': HASH_METHOD, 'identityMap': identities}),
        }
        self.details = OrderedDict()

    def detail(self, slug):
        if slug not in self.details:
            value = self.catalog.resolve_item(slug, expected_catalog_hash=self.catalog.catalog_hash)
            if value is None:
                return None
            self.details[slug] = _json_bytes(value)
            while len(self.details) > 64:
                self.details.popitem(last=False)
        self.details.move_to_end(slug)
        return self.details[slug]


class LocalCatalog:
    """Thread-safe, bounded snapshots. Failed or half builds never replace good data."""
    def __init__(self, root):
        self.root = Path(root)
        self._lock = threading.Lock()
        self._generations = OrderedDict()
        self._last_good = None
        self._signature = None
        self._failed_signature = None
        self._failed_until = 0

    @staticmethod
    def handles(target):
        try:
            path = urlsplit(target).path
        except ValueError:
            return False
        return path == '/market-index.json' or path.startswith('/market-item/')

    def _load(self):
        """Caller holds the lock through verification and lazy item resolution."""
        lock = self.root / '.collector.lock'
        if lock.exists():
            return self._last_good, 'retained_verified_local' if self._last_good else 'unavailable'
        signature = None
        try:
            pointer_path = self.root / 'dist/version.json'
            pointer_raw, pointer_stat = _read(pointer_path, 16_384)
            pointer = _decode(pointer_raw)
            version = pointer.get('version') if isinstance(pointer, dict) else None
            if not isinstance(version, str) or not _VERSION.fullmatch(version) or pointer.get('data') != 'data-' + version + '.json':
                raise ValueError('Invalid published pointer')
            report_path = self.root / 'dist' / pointer['data']
            feed_path = self.root / 'cache/market.json'
            identity_path = self.root / 'catalog-identities-v2.json'
            signature = (hashlib.sha256(pointer_raw).hexdigest(), pointer_stat,
                         _stat(report_path), _stat(feed_path), _stat(identity_path))
            if signature == self._signature and self._last_good:
                if lock.exists():
                    return self._last_good, 'retained_verified_local'
                return self._last_good, 'accepted_local'
            if signature == self._failed_signature and time.monotonic() < self._failed_until:
                return self._last_good, 'retained_verified_local' if self._last_good else 'unavailable'
            report_raw, report_stat = _read(report_path, 5_000_000)
            if hashlib.sha256(report_raw).hexdigest()[:16] != version:
                raise ValueError('Named report byte hash mismatch')
            report = _decode(report_raw)
            feed_raw, feed_stat = _read(feed_path, 5_000_000)
            identity_raw, identity_stat = _read(identity_path, 256_000)
            feed, identities = _decode(feed_raw), _decode(identity_raw)
            if not isinstance(identities, list):
                raise ValueError('Expected reviewed identity array')
            key = hashlib.sha256(feed_raw).hexdigest(), hashlib.sha256(identity_raw).hexdigest()
            generation = self._generations.get(key)
            if generation is None:
                generation = _Generation(feed, identities)
            metadata = generation.metadata
            # Typed comparison rejects boolean/number substitution and extra fields.
            if not isinstance(report, dict) or portable_hash(report.get('marketCatalog')) != portable_hash(metadata) or portable_hash(pointer.get('marketCatalog')) != portable_hash(metadata):
                raise ValueError('Published catalogue metadata mismatch')
            if report.get('sourceUpdatedAt') != metadata['sourceUpdatedAt'] or pointer.get('sourceUpdatedAt') != metadata['sourceUpdatedAt']:
                raise ValueError('Published source clock mismatch')
            if report.get('builtAt') != pointer.get('builtAt'):
                raise ValueError('Published build clock mismatch')
            if lock.exists():
                return self._last_good, 'retained_verified_local' if self._last_good else 'unavailable'
            if (pointer_stat, report_stat, feed_stat, identity_stat) != tuple(_stat(path) for path in (pointer_path, report_path, feed_path, identity_path)):
                raise ValueError('Build changed during verification')
            self._generations[key] = generation
            self._generations.move_to_end(key)
            while len(self._generations) > 2:
                self._generations.popitem(last=False)
            self._last_good, self._signature, self._failed_signature = generation, signature, None
            return generation, 'accepted_local'
        except (OSError, ValueError, TypeError, AttributeError, OverflowError):
            self._failed_signature = signature
            self._failed_until = time.monotonic() + 2
            return self._last_good, 'retained_verified_local' if self._last_good else 'unavailable'

    @staticmethod
    def _response(method, value=None, status=200, etag=None, mode=None, body=None, if_none_match=None):
        headers = dict(_HEADERS)
        if status == 405:
            headers['Allow'] = 'GET, HEAD'
        if mode:
            headers['X-Catalog-Mode'] = mode
        if etag:
            headers['ETag'] = etag
        if status == 200 and etag and any(tag.strip().removeprefix('W/') == etag for tag in (if_none_match or '').split(',')):
            return CatalogResponse(304, headers, b'')
        encoded = body if body is not None else _json_bytes(value)
        headers['Content-Length'] = str(len(encoded))
        if status == 503:
            headers['Retry-After'] = '2'
        return CatalogResponse(status, headers, b'' if method == 'HEAD' else encoded)

    def handle(self, method, target, headers=None):
        """Return a response for catalogue paths, None for unrelated static routes."""
        if not self.handles(target):
            return None
        if method not in ('GET', 'HEAD'):
            return self._response(method, {'error': 'method_not_allowed'}, 405)
        url = urlsplit(target)
        match = _ITEM.fullmatch(url.path)
        if url.path != '/market-index.json' and not match:
            return self._response(method, {'error': 'not_found'}, 404)
        try:
            pairs = parse_qsl(url.query, keep_blank_values=True, max_num_fields=8)
        except ValueError:
            return self._response(method, {'error': 'unsupported_parameters'}, 400)
        if any(key != 'catalog' for key, _ in pairs) or len(pairs) > 1:
            return self._response(method, {'error': 'unsupported_parameters'}, 400)
        expected = pairs[0][1] if pairs else None
        if match and (not expected or not _HASH.fullmatch(expected)):
            return self._response(method, {'error': 'catalog_hash_required'}, 400)
        tag = (headers or {}).get('If-None-Match')
        with self._lock:
            generation, mode = self._load()
            if generation is None:
                return self._response(method, {'error': 'catalogue_unavailable'}, 503, mode=mode)
            catalog_hash = generation.metadata['catalogHash']
            if expected and expected != catalog_hash:
                return self._response(method, {'error': 'catalog_version_changed', 'catalogHash': catalog_hash}, 409, mode=mode)
            if not match:
                return self._response(method, mode=mode, etag='"catalog-' + catalog_hash + '"', body=generation.index_bytes, if_none_match=tag)
            slug = match[1]
            if slug not in generation.slugs:
                return self._response(method, {'error': 'item_not_in_accepted_collection'}, 404, mode=mode)
            try:
                body = generation.detail(slug)
                if body is None:
                    return self._response(method, {'error': 'catalogue_unavailable'}, 503, mode=mode)
                return self._response(method, mode=mode, etag='"catalog-' + catalog_hash + ':' + slug + '"', body=body, if_none_match=tag)
            except (ValueError, TypeError, AttributeError):
                return self._response(method, {'error': 'catalogue_unavailable'}, 503, mode=mode)
