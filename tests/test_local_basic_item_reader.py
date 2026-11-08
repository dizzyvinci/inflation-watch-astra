"""No sockets/provider/auth operation: pure validator, fake opener, RAM threads."""
from pathlib import Path
import base64
import copy
import hashlib
import importlib
import importlib.util
import io
import inspect
import json
import sys
import threading
import time
import types
import unittest
from contextlib import ExitStack
from email.message import Message
from unittest.mock import patch

SITE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SITE)); sys.path.insert(0, str(SITE / 'tests'))
import local_basic_item_reader as basic
import local_own_site_session as auth
from test_local_own_site_session import Server, Response

FIXTURE_RAW = (SITE / 'tests/fixtures/local-basic-http.json').read_bytes()
assert hashlib.sha256(FIXTURE_RAW).hexdigest() == '76d87892fe2710c0e4d810e613001d0f668041153e0d5d390a47381590c49a67'
FIXTURE = json.loads(FIXTURE_RAW)
ITEM = basic.PREFIX + '2040801.json'
WALL = basic.stamp(FIXTURE['originalCapture']) / 1000 + 3600


def message(path=ITEM, **extra):
    value = Message(); value['Host'] = 'localhost:8765'
    if path != basic.PROFILE: value[basic.REQUEST] = basic.PROTOCOL
    for key, val in extra.items(): value[key] = val
    return value


def packet(name):
    value = FIXTURE['packets'][name]
    return basic.TransportResponse(value['status'], dict(value['headers']), base64.b64decode(value['body']))


def wire(*, item_id=2040801, generation=None, capture=None, change=None, mode='current'):
    """Typed-wire-only variants, not fabricated producer/SQL membership proof."""
    value = json.loads(packet('present').body)
    value['itemId'] = item_id
    if generation is not None: value['generation'] = generation
    if capture is not None: value['capturedAt'] = capture
    if change is not None: change(value)
    raw = json.dumps(value, separators=(',', ':')).encode()
    h = dict(packet('present').headers); body_sha = basic.digest(raw)
    h.update({'x-astra-basic-generation': value['generation'], 'x-astra-basic-captured-at': value['capturedAt'],
              'x-astra-basic-mode': mode, 'x-astra-basic-body-sha256': body_sha,
              'x-astra-basic-revision': basic.token(FIXTURE['profile']['publicEpoch'], value['generation']),
              'etag': '"basic-item-' + basic.token(FIXTURE['profile']['publicEpoch'], body_sha) + '"',
              'content-length': str(len(raw))})
    return basic.TransportResponse(200, h, raw)


class Backend(Server):
    def __init__(self):
        super().__init__(); self.reply = 'present'; self.bad_length = False
        self.basic_hold = None; self.basic_entered = threading.Event()
    def open(self, request, timeout):
        path = request.full_url.removeprefix(auth.HOST)
        if not path.startswith(basic.PREFIX): return super().open(request, timeout)
        self.calls.append((path, request))
        label = 'profile' if path == basic.PROFILE else self.reply
        if '?generation=' in path: label = 'conflict'
        p = packet(label); h = dict(p.headers)
        if self.bad_length: h['Content-Length'] = '10000'; h.pop('content-length', None)
        if self.basic_hold is not None:
            owner = self
            class HeldResponse(Response):
                def read1(self, n):
                    owner.basic_entered.set(); owner.basic_hold.wait(2)
                    return super().read1(n)
            return HeldResponse(request.full_url, p.status, p.body, h)
        return Response(request.full_url, p.status, p.body, h)


class Tests(unittest.TestCase):
    def reader(self, transport=None, **bounds):
        config = [json.dumps(FIXTURE['profile'])]; authority = [(True, 1, 1)]; clock = [0.0]; calls = []
        if transport is None:
            def transport(path, conditions, timeout):
                calls.append((path, dict(conditions), timeout))
                if path == basic.PROFILE: return packet('profile')
                if '?generation=' in path: return packet('conflict')
                if '999999999' in path: return packet('absent')
                return packet('notModified' if 'If-None-Match' in conditions else 'present')
        reader = basic.LocalBasicItemReader(config=lambda: config[0], transport=transport,
                    monotonic=lambda: clock[0], wall=lambda: WALL, **bounds)
        reader.authority = lambda: authority[0]
        return reader, config, authority, clock, calls
    def get(self, reader, path=ITEM, method='GET', headers=None, **kw):
        return reader.handle(method, path, message(path) if headers is None else headers, **kw)
    def settle(self, reader):
        with reader.cv: self.assertTrue(reader.cv.wait_for(lambda: not reader.flights, timeout=2))

    def test_fixture_genuine_source_scope_and_original_decimal_lexemes(self):
        self.assertEqual(FIXTURE['fixtureKind'], 'synthetic_actual1500_basic_public_http_v1')
        value = basic.dto(packet('present').body, 2040801, WALL * 1000)
        self.assertEqual(value['sold']['medianUnitPrice'], '34567.89')
        self.assertEqual(value['asking']['medianUnitPrice'], '25000.04999999999999999')
        self.assertEqual(value['capturedAt'], FIXTURE['originalCapture'])
        self.assertFalse(value['qualityMatched']); self.assertFalse(value['fullVariantFreshness'])

    def test_default_off_and_malformed_config_make_zero_transport_or_authority_calls(self):
        def forbidden(*_): raise AssertionError('off_called_external')
        for cfg in [None, '{"enabled":false}', '{"enabled":0}', '{"enabled":false,"extra":1}', '{"schemaVersion":1}']:
            reader = basic.LocalBasicItemReader(config=lambda: cfg, transport=forbidden)
            reader.authority = forbidden
            self.assertEqual(self.get(reader).status, 404)
            self.assertEqual(reader.state()['pendingTasks'], 0)

    def test_unrelated_routes_not_claimed_and_no_new_transport(self):
        r, _, _, _, calls = self.reader()
        for path in ['/api-item-prices/2040801.json', '/api-search-identities/v2/manifest.json', '/api-cash-items.json', '/']:
            self.assertIsNone(self.get(r, path))
        self.assertEqual(calls, [])

    def test_loopback_host_origin_duplicate_headers_and_methods_before_io(self):
        r, _, _, _, calls = self.reader()
        for h, kw in [(message(Origin='https://evil.invalid'), {}), (message(**{'Sec-Fetch-Site': 'cross-site'}), {}),
                      (message(), {'client_host': '192.0.2.1'}), (message(), {'bind_host': '0.0.0.0'})]:
            self.assertEqual(self.get(r, headers=h, **kw).status, 403)
        h = message(); h['Host'] = 'localhost:8765'; self.assertEqual(self.get(r, headers=h).status, 403)
        h = message(); h[basic.REQUEST] = basic.PROTOCOL; self.assertEqual(self.get(r, headers=h).status, 400)
        h = message(); h['If-None-Match'] = '"basic-item-' + 'a' * 64 + '"'; h['If-None-Match'] = h['If-None-Match']
        self.assertEqual(self.get(r, headers=h).status, 400)
        self.assertEqual(self.get(r, method='POST').status, 405); self.assertEqual(calls, [])

    def test_closed_paths_profile_query_and_wrong_protocol_never_transport(self):
        r, _, _, _, calls = self.reader()
        for path in [basic.PROFILE + '?', basic.PROFILE + '#x', ITEM + '?generation=' + 'a' * 64 + '&x=1',
                     basic.PREFIX + '01.json', basic.PREFIX + '%32.json', basic.PREFIX + '../private.json']:
            self.assertEqual(self.get(r, path).status, 400)
        self.assertEqual(self.get(r, headers=message(**{basic.REQUEST: 'fast-current-v1'})).status, 400)
        self.assertEqual(calls, [])

    def test_profile_exact6_and_get_head_preserve_body_length_without_new_fetch(self):
        r, _, _, _, calls = self.reader(); a = self.get(r, basic.PROFILE)
        self.assertEqual(a.status, 200); self.assertEqual(a.body, packet('profile').body)
        self.assertEqual(len(json.loads(a.body)), 6); self.assertLessEqual(len(a.body), 512)
        b = self.get(r, basic.PROFILE, 'HEAD'); self.assertEqual(b.status, 200); self.assertEqual(b.body, b'')
        self.assertEqual(b.headers['Content-Length'], str(len(a.body))); self.assertEqual(len(calls), 1)

    def test_present_and_head_exact_body_headers_and_current_conditional_cache(self):
        r, _, _, _, calls = self.reader(); a = self.get(r)
        self.assertEqual(a.status, 200); self.assertEqual(a.body, packet('present').body)
        self.assertEqual(a.headers['X-Astra-Preview'], 'password')
        b = self.get(r, method='HEAD'); self.assertEqual(b.body, b''); self.assertEqual(b.headers['Content-Length'], str(len(a.body)))
        c = self.get(r, headers=message(**{'If-None-Match': a.headers['etag']}))
        self.assertEqual(c.status, 304); self.assertEqual(c.body, b''); self.assertNotIn('Content-Length', c.headers)
        self.assertEqual(calls[0][1], {basic.REQUEST: basic.PROTOCOL}); self.assertEqual(len(calls), 1)

    def test_expired_cache_validates_known304_using_original_representation(self):
        r, _, _, clock, calls = self.reader(); a = self.get(r); clock[0] = 16
        b = self.get(r, headers=message(**{'If-None-Match': a.headers['etag']}))
        self.assertEqual(b.status, 304); self.assertEqual(b.body, b''); self.assertEqual(len(calls), 2)
        self.assertEqual(calls[-1][1]['If-None-Match'], a.headers['etag'])
        self.assertEqual(json.loads(self.get(r).body)['capturedAt'], FIXTURE['originalCapture'])

    def test_unsolicited304_or_corrupt_epoch_cannot_create_prices(self):
        for name in ['notModified', 'present']:
            p = packet(name)
            if name == 'present': p.headers['x-astra-basic-epoch'] = 'foreign-public-epoch'
            r, *_ = self.reader(transport=lambda *_: p)
            self.assertEqual(self.get(r).status, 503); self.assertEqual(r.state()['cacheEntries'], 1)
            self.assertNotIn(b'34567', self.get(r).body)

    def test_unknown_local_conditional_gets_owned_body_before_making304(self):
        r, _, _, _, calls = self.reader()
        a = self.get(r, headers=message(**{'If-None-Match': packet('present').headers['etag']}))
        self.assertEqual(a.status, 304); self.assertEqual(a.body, b'')
        self.assertNotIn('If-None-Match', calls[0][1]); self.assertEqual(len(calls), 1)
        self.assertEqual(self.get(r).body, packet('present').body)

    def test_source_retained_mode_never_receives_local_current304(self):
        r, *_ = self.reader(transport=lambda *_: packet('retained'))
        a = self.get(r); b = self.get(r, headers=message(**{'If-None-Match': a.headers['etag']}))
        self.assertEqual(b.status, 200); self.assertEqual(b.headers['x-astra-basic-mode'], 'retained')
        self.assertEqual(b.body, packet('retained').body)

    def test_profile_and_error_frames_drop_unbound_even_normally_known_headers(self):
        for name, path in [('profile', basic.PROFILE), ('conflict', ITEM + '?generation=' + FIXTURE['wanted'])]:
            p = packet(name); p.headers['etag'] = 'PRIVATE_UNBOUND_HEADER'; p.headers['last-modified'] = 'PRIVATE_UNBOUND_HEADER'
            p.headers['x-astra-basic-mode'] = 'PRIVATE_UNBOUND_HEADER'
            r, *_ = self.reader(transport=lambda *_: p); a = self.get(r, path)
            self.assertEqual(a.status, p.status); self.assertNotIn('PRIVATE_UNBOUND_HEADER', str(a.headers))

    def test_typed_absence_is_exact_generation_scoped_not_zero_or_stock(self):
        r, *_ = self.reader(); a = self.get(r, basic.PREFIX + '999999999.json')
        self.assertEqual(a.status, 404); self.assertEqual(a.body, packet('absent').body)
        value = json.loads(a.body); self.assertEqual(value['state'], 'absent_in_generation')
        self.assertIsNone(value['sold']); self.assertFalse(value['availabilityKnown'])

    def test_bound409_forwards_without_automatic_retry_or_new_generation_invention(self):
        r, _, _, _, calls = self.reader(); path = ITEM + '?generation=' + FIXTURE['wanted']
        a = self.get(r, path); self.assertEqual(a.status, 409); self.assertEqual(a.body, packet('conflict').body)
        self.assertEqual(len(calls), 1); self.assertEqual(json.loads(a.body)['capturedAt'], FIXTURE['originalCapture'])

    def test_frame_hash_revision_definition_modes_and_quality_claims_reject(self):
        for key in ['x-astra-basic-body-sha256', 'x-astra-basic-revision', 'x-astra-basic-definition', 'etag']:
            p = packet('present'); p.headers[key] = '0' * 64
            r, *_ = self.reader(transport=lambda *_: p); self.assertEqual(self.get(r).status, 503)
        for change in [lambda v: v.update(actor='PRIVATE_MARKER'), lambda v: v.update(qualityMatched=True),
                       lambda v: v.update(sourceObservedAt=v['capturedAt']), lambda v: v['sold'].update(reportedSalesCount=-1)]:
            p = wire(change=change); r, *_ = self.reader(transport=lambda *_: p)
            a = self.get(r); self.assertEqual(a.status, 503); self.assertNotIn(b'PRIVATE_MARKER', a.body)

    def test_future_capture_unknown_units_and_oversize_body_do_not_become_zero_prices(self):
        for p in [wire(capture='2099-01-01T00:00:00.000Z'), wire(change=lambda v: v['sold'].update(medianUnitPrice='1k')),
                  basic.TransportResponse(200, packet('present').headers, b'x' * 8193)]:
            r, *_ = self.reader(transport=lambda *_: p); a = self.get(r)
            self.assertEqual(a.status, 503); self.assertNotIn(b'medianUnitPrice', a.body)

    def test_bare_or_malformed404_withdraws_previous_same_item_immediately(self):
        for p in [basic.TransportResponse(404, {'x-astra-preview': 'password'}, b''), basic.TransportResponse(404, packet('present').headers, b'{"actor":"PRIVATE_MARKER"}')]:
            changed = [False]
            r, _, _, clock, _ = self.reader(transport=lambda *_: p if changed[0] else packet('present'))
            self.assertEqual(self.get(r).status, 200); changed[0] = True; clock[0] = 16
            a = self.get(r); self.assertEqual(a.status, 404); self.assertNotIn(b'PRIVATE_MARKER', a.body)
            self.assertNotIn(b'34567', self.get(r).body)

    def test_auth_or_review_withdraw_all_cache_and_never_return_retained_prices(self):
        for p in [basic.TransportResponse(401, {}, b''), basic.TransportResponse(200, {**packet('present').headers, 'x-astra-preview': 'review'}, packet('present').body)]:
            changed = [False]
            r, _, _, clock, _ = self.reader(transport=lambda *_: p if changed[0] else packet('present'))
            self.assertEqual(self.get(r).status, 200); changed[0] = True; clock[0] = 16
            a = self.get(r); self.assertEqual(a.status, 401); self.assertNotIn(b'34567', a.body)
            self.assertEqual(self.get(r).status, 401)

    def test_transient_failure_retains_only_original_capture_and_no304_and_backoff(self):
        changed = [False]; calls = []
        def transport(*args):
            calls.append(args)
            if changed[0]: raise OSError('PRIVATE_ERROR_SENTINEL')
            return packet('present')
        r, _, _, clock, _ = self.reader(transport=transport); a = self.get(r); changed[0] = True; clock[0] = 16
        b = self.get(r); self.assertEqual(b.status, 200); self.assertEqual(b.headers['x-astra-basic-mode'], 'retained')
        self.assertEqual(b.body, a.body); self.assertNotIn('PRIVATE_ERROR', str(b))
        c = self.get(r, headers=message(**{'If-None-Match': a.headers['etag']})); self.assertEqual(c.status, 200)
        self.assertEqual(len(calls), 2)

    def test_late_auth_configuration_and_deadline_cannot_commit_current_cache(self):
        for phase in ['auth', 'config', 'deadline']:
            r, cfg, a, clock, _ = self.reader()
            def transport(*_):
                if phase == 'auth': a[0] = (True, 2, 2)
                if phase == 'config': cfg[0] = '{"enabled":false}'
                if phase == 'deadline': clock[0] = 3
                return packet('present')
            r.transport = transport; self.assertIn(self.get(r).status, [401, 503])
            self.assertEqual(r.state()['cacheEntries'], 0)

    def test_final_cache_commit_latency_rolls_back_only_same_context_admission(self):
        r, _, _, clock, _ = self.reader(); original = r._put
        def delayed(*args): original(*args); clock[0] = 3
        r._put = delayed
        self.assertEqual(self.get(r).status, 503); self.assertEqual(r.state()['cacheEntries'], 0)

    def test_closing_auth_callback_time_is_charged_to_cache_ttl_and_original_deadline(self):
        for expired in ['ttl', 'deadline']:
            r, _, a, clock, _ = self.reader(ttl_seconds=.01 if expired == 'ttl' else 15)
            first = self.get(r); armed = [False]
            def authority():
                if armed[0] and any(f.function == '_deliver' for f in inspect.stack()): clock[0] = .02 if expired == 'ttl' else 3
                return a[0]
            r.authority = authority; armed[0] = True
            value = self.get(r)
            if expired == 'ttl':
                self.assertEqual(value.status, 200); self.assertEqual(value.headers['x-astra-basic-mode'], 'retained')
                self.assertEqual(value.body, first.body)
            else: self.assertEqual(value.status, 503)

    def test_known_later404_cannot_be_resurrected_by_older_held200(self):
        entered = threading.Event(); release = threading.Event(); calls = []; out = []
        def transport(*args):
            calls.append(args)
            if len(calls) == 1: entered.set(); release.wait(2); return packet('present')
            return basic.TransportResponse(404, {'x-astra-preview': 'password'}, b'')
        r, *_ = self.reader(transport=transport, wait_seconds=1)
        first = threading.Thread(target=lambda: out.append(self.get(r)))
        try:
            first.start(); self.assertTrue(entered.wait(1))
            later = self.get(r, headers=message(**{'If-None-Match': '"basic-item-' + 'b' * 64 + '"'}))
            self.assertEqual(later.status, 404); self.assertEqual(r.state()['pendingTasks'], 1)
        finally: release.set(); first.join(2); self.settle(r)
        self.assertEqual(out[0].status, 503); self.assertEqual(self.get(r).status, 404); self.assertEqual(len(calls), 2)

    def test_auth_denial_withdraws_other_held_current_candidate_without_freeing_it(self):
        entered = threading.Event(); release = threading.Event(); calls = []; out = []
        def transport(*args):
            calls.append(args)
            if len(calls) == 1: entered.set(); release.wait(2); return packet('present')
            return basic.TransportResponse(401, {}, b'')
        r, *_ = self.reader(transport=transport, wait_seconds=1)
        first = threading.Thread(target=lambda: out.append(self.get(r)))
        try:
            first.start(); self.assertTrue(entered.wait(1))
            later = self.get(r, headers=message(**{'If-None-Match': '"basic-item-' + 'c' * 64 + '"'}))
            self.assertEqual(later.status, 401); self.assertEqual(r.state()['pendingTasks'], 1)
        finally: release.set(); first.join(2); self.settle(r)
        self.assertEqual(out[0].status, 401); self.assertEqual(len(calls), 2)

    def test_headers_are_owned_and_overflow_metadata_never_allocates_unbounded_forwarding(self):
        r, *_ = self.reader(); first = self.get(r); original = first.headers['etag']; first.headers['etag'] = 'caller_changed'
        self.assertEqual(self.get(r).headers['etag'], original)
        p = packet('present'); p.headers.update({('unknown-' + str(i)): 'x' for i in range(65)})
        bad, *_ = self.reader(transport=lambda *_: p); self.assertEqual(self.get(bad).status, 503)

    def test_duplicate_json_huge_integer_and_unknown_private_headers_are_bounded(self):
        for raw in [b'{"schemaVersion":1,"schemaVersion":1}', b'{"x":' + b'1' * 5000 + b'}', b'{"x":NaN}']:
            with self.assertRaises(basic.Invalid): basic.dto(raw, 2040801, WALL * 1000)
        p = packet('present'); p.headers.update({'authorization': 'PRIVATE_HEADER', 'set-cookie': 'PRIVATE_HEADER', 'x-astra-basic-actor': 'PRIVATE_HEADER'})
        r, *_ = self.reader(transport=lambda *_: p); a = self.get(r)
        self.assertEqual(a.status, 200); self.assertNotIn('PRIVATE_HEADER', str(a.headers))

    def test_clock_calendar_exactness_matches_js_canonical_representations(self):
        self.assertEqual(basic.stamp('1970-01-01T00:00:00.000Z'), 0)
        self.assertEqual(basic.stamp('1969-12-31T23:59:59.999Z'), -1)
        self.assertEqual(basic.stamp('+275760-09-13T00:00:00.000Z'), 8640000000000000)
        self.assertEqual(basic.stamp('-271821-04-20T00:00:00.000Z'), -8640000000000000)
        for bad in ['2025-02-29T00:00:00.000Z', '2024-01-01T00:00:00Z', '+001970-01-01T00:00:00.000Z', '-000000-01-01T00:00:00.000Z']:
            with self.assertRaises(basic.Invalid): basic.stamp(bad)

    def test_typed_parser_matches_utf8_bom_and_numeric_integer_semantics(self):
        self.assertEqual(basic.dto(b'\xef\xbb\xbf' + packet('present').body, 2040801, WALL * 1000)['itemId'], 2040801)
        self.assertTrue(basic.integer(1.0)); self.assertFalse(basic.integer(True)); self.assertFalse(basic.integer(10 ** 5000))

    def test_cache_cardinality_is_bounded_and_source_modes_do_not_poll(self):
        calls = []
        def transport(path, *_): calls.append(path); return wire(item_id=int(path.split('/')[-1].split('.')[0]))
        r, *_ = self.reader(transport=transport, max_entries=2)
        for i in [2040801, 2040802, 2040803]: self.assertEqual(self.get(r, basic.PREFIX + str(i) + '.json').status, 200)
        self.assertEqual(r.state()['cacheEntries'], 2); self.assertEqual(len(calls), 3)

    def test_singleflight_synchronous_callers_share_one_task_and_exact_body(self):
        entered = threading.Event(); release = threading.Event(); calls = []
        def transport(*args): calls.append(args); entered.set(); release.wait(2); return packet('present')
        r, *_ = self.reader(transport=transport, wait_seconds=1); out = []
        threads = [threading.Thread(target=lambda: out.append(self.get(r))) for _ in range(4)]
        try:
            for thread in threads: thread.start()
            self.assertTrue(entered.wait(1)); time.sleep(.02); self.assertEqual(len(calls), 1)
        finally:
            release.set()
            for thread in threads: thread.join(2)
        self.assertEqual([x.status for x in out], [200] * 4); self.assertTrue(all(x.body == packet('present').body for x in out))

    def test_timeout_off_pause_and_new_config_keep_held_task_until_actual_return(self):
        entered = threading.Event(); release = threading.Event(); calls = []
        def transport(*args): calls.append(args); entered.set(); release.wait(2); return packet('present')
        r, cfg, _, _, _ = self.reader(transport=transport, wait_seconds=.03, max_flights=1)
        try:
            self.assertEqual(self.get(r).status, 503); self.assertTrue(entered.is_set()); self.assertEqual(r.state()['pendingTasks'], 1)
            cfg[0] = '{"enabled":false}'; self.assertEqual(self.get(r).status, 404)
            cfg[0] = json.dumps(FIXTURE['profile']); r.pause(); r.resume()
            self.assertEqual(self.get(r).status, 503); self.assertEqual(len(calls), 1)
        finally: release.set(); self.settle(r)
        self.assertEqual(r.state()['cacheEntries'], 0)

    def test_newer_capture_downgrades_known_older_cache_and_late_replay_refuses(self):
        r, *_ = self.reader(transport=lambda path, *_: wire(item_id=int(path.split('/')[-1].split('.')[0]),
                         capture='2026-11-06T12:02:00.000Z' if '2040802' in path else FIXTURE['originalCapture'],
                         generation='b' * 64 if '2040802' in path else 'a' * 64))
        self.assertEqual(self.get(r).status, 200); self.assertEqual(self.get(r, basic.PREFIX + '2040802.json').status, 200)
        a = self.get(r); self.assertEqual(a.headers['x-astra-basic-mode'], 'retained')
        self.assertEqual(json.loads(a.body)['capturedAt'], FIXTURE['originalCapture'])

    def test_session_fixed_https_newpaths_and_conditions_reuse_existing_fake_ram_session(self):
        server = Backend(); session = auth.OwnSiteSession(opener_factory=server); session.configure('SYNTHETIC_PASSWORD')
        session.get('/api-cash-items.json', {}, 1, auth.RawResponse)
        r, *_ = self.reader(); self.assertTrue(basic.attach_basic_item_reader(session, r))
        a = self.get(r); self.assertEqual(a.status, 200); self.assertEqual(a.body, packet('present').body)
        self.assertEqual(server.logins, 1)
        req = next(request for path, request in server.calls if path == ITEM)
        self.assertEqual(req.full_url, auth.HOST + ITEM); self.assertEqual(req.get_header('X-astra-request-basic-protocol'), basic.PROTOCOL)
        self.assertNotIn('set-cookie', {k.lower(): v for k, v in a.headers.items()})

    def test_session_new_allowlist_never_accepts_arbitrary_proxy_or_protocol_on_oldroute(self):
        server = Backend(); session = auth.OwnSiteSession(opener_factory=server); session.configure('SYNTHETIC_PASSWORD')
        for path in ['https://elsewhere.invalid/' + ITEM, ITEM + '?x=1', basic.PROFILE + '?x=1']:
            with self.assertRaises(auth.AuthenticationUnavailable): session.get(path, {}, .1, auth.RawResponse)
        with self.assertRaises(auth.AuthenticationUnavailable): session.get('/api-cash-items.json', {basic.REQUEST: basic.PROTOCOL}, .1, auth.RawResponse)
        self.assertEqual(server.calls, [])
        self.assertEqual(auth.route_limit(basic.PROFILE), 512); self.assertEqual(auth.route_limit(ITEM), 8192)

    def test_session_typed409_and_negative_body_truncation_preserve_conservative_withdrawal(self):
        server = Backend(); session = auth.OwnSiteSession(opener_factory=server); session.configure('SYNTHETIC_PASSWORD')
        r, _, _, clock, _ = self.reader(); basic.attach_basic_item_reader(session, r)
        self.assertEqual(self.get(r).status, 200)
        self.assertEqual(self.get(r, ITEM + '?generation=' + FIXTURE['wanted']).status, 409)
        clock[0] = 16; server.reply = 'absent'; server.bad_length = True
        self.assertEqual(self.get(r).status, 404); self.assertEqual(server.logins, 1)

    def test_shared_session_inner_physical_read_stays_owned_after_reader_logical_timeout(self):
        server = Backend(); session = auth.OwnSiteSession(opener_factory=server); session.configure('SYNTHETIC_PASSWORD')
        session._ensure_login(1); server.basic_hold = threading.Event()
        r, *_ = self.reader(wait_seconds=.03); basic.attach_basic_item_reader(session, r)
        try:
            self.assertEqual(self.get(r).status, 503); self.assertTrue(server.basic_entered.is_set())
            self.settle(r)
            with session.cv: self.assertEqual(len(session.flights), 1)
            self.assertTrue(all(e.get('dto') is None for e in r.entries.values()))
        finally:
            server.basic_hold.set()
            with session.cv: self.assertTrue(session.cv.wait_for(lambda: not session.flights, timeout=2))
        self.assertTrue(all(e.get('dto') is None for e in r.entries.values()))
        self.assertEqual(sum(path == ITEM for path, _ in server.calls), 1)

    def test_r2_same_native_session_mutations_in_last_clock_deny_without_extra_http(self):
        for action in ['disable', 'reconfigure', 'review', 'revision']:
            server = Backend(); session = auth.OwnSiteSession(opener_factory=server); session.configure('SYNTHETIC_PASSWORD')
            r, *_ = self.reader(); basic.attach_basic_item_reader(session, r)
            self.assertEqual(self.get(r).status, 200); before = len(server.calls); armed = [False]
            def clock():
                if armed[0] and any(f.function == '_deliver' for f in inspect.stack()):
                    armed[0] = False
                    if action == 'disable': session.disable()
                    elif action == 'reconfigure': session.configure('SYNTHETIC_PASSWORD')
                    elif action == 'review': session._review(session.epoch)
                    else:
                        with session.cv: session.access_revision += 1
                return 0.0
            r.clock = clock; armed[0] = True; value = self.get(r)
            self.assertEqual(value.status, 401); self.assertNotIn(b'medianUnitPrice', value.body)
            self.assertEqual(len(server.calls), before); self.assertEqual(r.state()['cacheEntries'], 0)

    def test_r2_disable_cannot_free_existing_session_native_read_or_commit_late_dto(self):
        server = Backend(); session = auth.OwnSiteSession(opener_factory=server); session.configure('SYNTHETIC_PASSWORD')
        session._ensure_login(1); server.basic_hold = threading.Event()
        r, *_ = self.reader(wait_seconds=1); basic.attach_basic_item_reader(session, r); out = []
        thread = threading.Thread(target=lambda: out.append(self.get(r)))
        try:
            thread.start(); self.assertTrue(server.basic_entered.wait(1)); session.disable(); thread.join(1)
            self.assertFalse(thread.is_alive()); self.assertEqual(out[0].status, 401)
            with session.cv: self.assertEqual(len(session.flights), 1)
            self.assertEqual(r.state()['cacheEntries'], 0)
        finally:
            server.basic_hold.set(); thread.join(2)
            with session.cv: self.assertTrue(session.cv.wait_for(lambda: not session.flights, timeout=2))
        self.assertEqual(r.state()['cacheEntries'], 0)

    def test_preview_new_helper_uses_existing_handler_without_touching_old_constructor_assets(self):
        # Isolated-copy harness stubs only unrelated legacy constructors whose
        # production bindings/assets are intentionally excluded from this packet.
        names = [('local_cash_reader', 'LocalCashReader'), ('local_nx_reader', 'LocalNxReader'),
                 ('local_item_reader', 'LocalItemReader'), ('local_nx_history_reader', 'LocalNxHistoryReader'),
                 ('local_item_hour_reader', 'LocalItemHourReader'), ('local_calculations_reader', 'LocalCalculationsReader'),
                 ('local_stamp_reference_reader', 'LocalStampReferenceReader')]
        with ExitStack() as stack:
            for module, name in names: stack.enter_context(patch.object(importlib.import_module(module), name, return_value=types.SimpleNamespace()))
            spec = importlib.util.spec_from_file_location('_basic_preview_parity_test', SITE / 'preview.py')
            module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        self.assertFalse(module._own_session.enabled)
        r, *_ = self.reader(); module._basic_items = r; seen = []; output = io.BytesIO()
        h = types.SimpleNamespace(command='GET', path=ITEM, headers=message(), server=types.SimpleNamespace(server_address=('127.0.0.1', 8765)),
             client_address=('127.0.0.1', 12345), wfile=output, send_response=lambda status: seen.append(status), send_header=lambda *_: None, end_headers=lambda: None)
        self.assertTrue(module.Handler._serve_basic_items(h)); self.assertEqual(seen, [200]); self.assertEqual(output.getvalue(), packet('present').body)
        h.path = '/api-item-prices/2040801.json'; self.assertFalse(module.Handler._serve_basic_items(h))


if __name__ == '__main__': unittest.main()
