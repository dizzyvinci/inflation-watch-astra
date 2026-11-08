import copy
import datetime as dt
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import engine


def expected_complete_source_window(feed):
    # Independent test oracle from the original source publication, not engine
    # output, wall-clock today, UI formatting, or the current 3-day reference.
    published = dt.datetime.fromisoformat(feed['updatedAt'].replace('Z', '+00:00'))
    if published.tzinfo is None:
        raise ValueError('Source publication must have an explicit timezone')
    end = published.astimezone(dt.timezone.utc).date()
    start = end - dt.timedelta(days=7)
    return start, end, [(start + dt.timedelta(days=i)).isoformat() for i in range(7)]


class BasketV2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.project = engine.ROOT
        cls.cfg = engine.read(cls.project / 'config.json')
        cls.real_feed = engine.read(cls.project / 'cache' / 'market.json')

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.root_patch = patch.object(engine, 'ROOT', self.root)
        self.root_patch.start()
        engine.atomic(self.root / 'config.json', self.cfg)

    def tearDown(self):
        self.root_patch.stop()
        self.temp.cleanup()

    def feed(self):
        items = []
        for number in range(51):
            history = [[f'2026-10-{day}', 100 + number, 50 if day <= 25 else 5] for day in range(21, 28)]
            history.append(['2026-11-03', 200, 1000000 if number == 0 else 50])
            items.append({'s': f'item-{number:02}', 'n': f'Item {number}', 'k': 'Use', 'h': history})
        return {'updatedAt': '2026-11-04T08:30:00Z', 'items': items}

    def test_selects_by_reference_meso_turnover_not_recent_count(self):
        basket = engine.create_basket(self.feed(), self.cfg)
        self.assertEqual(basket['version'], 2)
        self.assertEqual(len(basket['rows']), 50)
        self.assertEqual(basket['rows'][0]['slug'], 'item-50')
        self.assertNotIn('item-00', {row['slug'] for row in basket['rows']})
        self.assertEqual(basket['selectionStart'], '2026-10-21')
        self.assertEqual(basket['selectionEndExclusive'], '2026-10-28')

    def test_liquidity_screen_does_not_discard_valid_lower_volume_base_days(self):
        row = engine.create_basket(self.feed(), self.cfg)['rows'][0]
        self.assertEqual(row['liquidityDays'], 5)
        self.assertEqual(row['baseObservationDays'], 7)
        self.assertEqual(row['baseQuantity'], 260)
        self.assertEqual(row['baseExpenditure'], 150 * 260)

    def test_ineligible_expensive_and_cash_items_cannot_enter(self):
        feed = self.feed()
        for slug, category, quantities in [('thin', 'Use', [50] * 4 + [49] * 3), ('cash', 'Cash Shop', [1000] * 7)]:
            feed['items'].append({'s': slug, 'n': slug, 'k': category,
                                  'h': [[f'2026-10-{21 + i}', 1e9, quantity] for i, quantity in enumerate(quantities)]})
        slugs = {row['slug'] for row in engine.create_basket(feed, self.cfg)['rows']}
        self.assertNotIn('thin', slugs)
        self.assertNotIn('cash', slugs)

    def test_ties_use_slug_and_weights_are_capped(self):
        feed = self.feed()
        for item in feed['items']:
            for point in item['h']:
                point[1] = 100
        feed['items'].reverse()
        basket = engine.create_basket(feed, self.cfg)
        self.assertEqual([row['slug'] for row in basket['rows']], [f'item-{i:02}' for i in range(50)])
        self.assertAlmostEqual(sum(row['weight'] for row in basket['rows']), 1)
        self.assertLessEqual(max(row['weight'] for row in basket['rows']), .08)

    def test_existing_v1_and_public_history_are_preserved_and_sanitized(self):
        old_basket = {'version': 1, 'rows': [{'slug': 'old', 'weight': 1}]}
        engine.atomic(self.root / 'cache' / 'basket-v1.json', old_basket)
        engine.atomic(self.root / 'dist' / 'data.json', {
            'basketVersion': 1, 'sourceUpdatedAt': 'old source', 'privateThing': 'must not copy',
            'rows': [{'slug': 'old', 'weight': 1, 'privateThing': 'hidden'}],
            'history': [{'day': '2026-11-03', 'cpi': 125.393, 'partial': False, 'nxRate': 10, 'privateThing': 'hidden'}]})
        old_bytes = (self.root / 'cache' / 'basket-v1.json').read_bytes()
        engine.create_basket(self.feed(), self.cfg)
        self.assertEqual((self.root / 'cache' / 'basket-v1.json').read_bytes(), old_bytes)
        archive_path = self.root / 'history' / 'cpi-v1.json'
        archive = engine.read(archive_path)
        self.assertEqual(archive['history'], [{'day': '2026-11-03', 'cpi': 125.393, 'partial': False}])
        self.assertNotIn('privateThing', archive_path.read_text())
        self.assertNotIn('nxRate', archive_path.read_text())
        archived = archive_path.read_bytes()
        engine.atomic(self.root / 'dist' / 'data.json', {'basketVersion': 1, 'history': []})
        engine.create_basket(self.feed(), self.cfg)
        self.assertEqual(archive_path.read_bytes(), archived)

    def test_hashes_are_deterministic_and_full_source_is_frozen(self):
        feed = self.feed()
        first = engine.create_basket(feed, self.cfg)
        self.assertEqual(first['sourceSnapshotHash'], engine.canonical_hash(feed))
        self.assertEqual(engine.read(self.root / 'cache' / 'basket-v2-source.json'), feed)
        with tempfile.TemporaryDirectory() as other:
            with patch.object(engine, 'ROOT', Path(other)):
                second = engine.create_basket(copy.deepcopy(feed), self.cfg)
        for field in ('basketHash', 'sourceSnapshotHash', 'specificationHash'):
            self.assertEqual(first[field], second[field])
        self.assertEqual(engine.canonical_hash({'b': 2, 'a': 1}), engine.canonical_hash({'a': 1, 'b': 2}))

    def test_source_updates_do_not_reselect_and_config_changes_require_version(self):
        feed = self.feed()
        before = engine.create_basket(feed, self.cfg)
        changed = copy.deepcopy(feed)
        changed['items'][0]['h'][0][1] = 1e12
        changed['updatedAt'] = '2026-11-05T00:00:00Z'
        self.assertEqual(before, engine.create_basket(changed, self.cfg))
        changed_cfg = dict(self.cfg, weight_cap=.05)
        with self.assertRaisesRegex(ValueError, 'explicit new version'):
            engine.create_basket(changed, changed_cfg)

    def test_frozen_source_and_weight_tampering_are_detected(self):
        feed = self.feed()
        basket = engine.create_basket(feed, self.cfg)
        basket['rows'][0]['weight'] = .9
        engine.atomic(self.root / 'cache' / 'basket-v2.json', basket)
        with self.assertRaisesRegex(ValueError, 'integrity'):
            engine.create_basket(feed, self.cfg)

    def test_frozen_full_source_cannot_change_after_selection(self):
        feed = self.feed()
        engine.create_basket(feed, self.cfg)
        damaged = copy.deepcopy(feed)
        damaged['items'][0]['n'] = 'changed source metadata'
        engine.atomic(self.root / 'cache' / 'basket-v2-source.json', damaged)
        with self.assertRaisesRegex(ValueError, 'source snapshot'):
            engine.create_basket(feed, self.cfg)

    def test_wolbi_context_never_enters_index_and_rolls_activity(self):
        report = engine.compute(copy.deepcopy(self.real_feed), {'status': 'cached'})
        self.assertEqual(len(report['rows']), 50)
        context = next(row for row in report['contextItems'] if row['slug'] == 'wolbi-throwing-stars')
        self.assertTrue(context['notIndexed'])
        self.assertEqual(context['weight'], 0)
        self.assertNotIn(context['slug'], {row['slug'] for row in report['rows']})
        self.assertAlmostEqual(report['latest']['cpi'], sum(row['indexContribution'] for row in report['rows']))
        self.assertAlmostEqual(sum(row['changeContribution'] for row in report['rows']), report['latest']['cpi'] - 100)
        self.assertEqual(context['history'], next(item['h'] for item in self.real_feed['items'] if item['s'] == context['slug']))
        self.assertEqual(report['historyKind'], 'reconstructed')
        start, end, complete_days = expected_complete_source_window(self.real_feed)
        self.assertEqual(report['recentStart'], start.isoformat())
        self.assertEqual(report['recentEndExclusive'], end.isoformat())
        self.assertEqual((end - start).days, 7)
        self.assertEqual(len(complete_days), 7)
        self.assertEqual(complete_days[0], report['recentStart'])
        self.assertEqual(complete_days[-1], (end - dt.timedelta(days=1)).isoformat())
        self.assertNotIn(report['recentEndExclusive'], complete_days)
        complete_quantity = sum(quantity for item in self.real_feed['items']
                                for day, price, quantity in item['h']
                                if day in complete_days)
        partial_quantity = sum(quantity for item in self.real_feed['items']
                               for day, price, quantity in item['h']
                               if day == end.isoformat())
        self.assertEqual(report['allRecentQuantity'], complete_quantity)
        if partial_quantity > 0:
            self.assertNotEqual(report['allRecentQuantity'], complete_quantity + partial_quantity)

    def test_original_frozen_public_source_retains_historical_cpi_golden(self):
        fixtures = Path(__file__).parent / 'fixtures'
        raw = (fixtures / 'basket-v2-public-source-20261104.json').read_bytes()
        plan_raw = (fixtures / 'basket-v2-public-plan-20261104.json').read_bytes()
        self.assertEqual(len(raw), 898617)
        self.assertEqual(hashlib.sha256(raw).hexdigest(), '0aa5f6abdd337f7c7448d4ef0ca93859f8e12e5705fb6642fc9ef4efcb125ce6')
        self.assertEqual(hashlib.sha256(plan_raw).hexdigest(), 'efc9dba67121521d430d9fc0576c88f87bbb907a2c0f0ff37ea17fb2a3f3d26a')
        frozen, plan = json.loads(raw), json.loads(plan_raw)
        canonical = json.dumps(frozen, sort_keys=True, ensure_ascii=False,
                               separators=(',', ':'), allow_nan=False).encode('utf-8')
        self.assertEqual(hashlib.sha256(canonical).hexdigest(), '4c8b9d962f8d9801f7d73a55a4b7800711fe4ea277d84f028f017fcb205a65c9')
        self.assertEqual(plan['sourceSnapshotHash'], hashlib.sha256(canonical).hexdigest())
        self.assertEqual(plan['specificationHash'], '7bce8989052777865b0aba8c2c11dee2ed432c1f248330a4f47e56d3ddf74bf6')
        self.assertEqual(frozen['updatedAt'], '2026-11-04T08:30:56+00:00')
        self.assertFalse((self.root / 'cache' / 'basket-v2.json').exists())
        report = engine.compute(copy.deepcopy(frozen), {'status': 'cached'})
        self.assertEqual(report['sourceSnapshotHash'], plan['sourceSnapshotHash'])
        self.assertEqual(report['specificationHash'], plan['specificationHash'])
        self.assertAlmostEqual(next(point['cpi'] for point in report['history'] if point['day'] == '2026-11-03'), 135.26395762542154)

    def test_site_only_copies_allowlisted_public_history(self):
        report = engine.compute(copy.deepcopy(self.real_feed), {'status': 'cached'})
        engine.atomic(self.root / 'history' / 'cpi-v1.json', {'history': [{'cpi': 125}]})
        engine.atomic(self.root / 'history' / 'private-source.json', {'secret': 'private'})
        web = self.root / 'web'
        web.mkdir()
        for filename in ('nx-stamp-finder.js', 'nx-stamp-finder.css', 'inventory-preview.js', 'inventory-preview.css', 'nx-history-browser.js', 'nx-history-browser.css', 'upcoming-announcements.js', 'upcoming-announcements.css', 'item-api-preview.js', 'api-calculations.js', 'api-item-panel.css', 'item-api-preview.css', 'overview-window-activity.css', 'index.html', 'app.js', 'style.css', 'community.js', 'community.css', 'layout-preview.js', 'layout-preview.css', 'chart-interaction.js', 'chart-interaction.css', 'privacy-controls.js', 'privacy-controls.css', 'analytics-config.json', 'preview-runtime.js', 'preview-runtime.css', 'full-market-client.js', 'api-nx-protocol.js', 'api-nx-client.js', 'api-nx-ui.js', 'api-nx-ui.css', 'api-cash-protocol.js', 'api-cash-client.js', 'api-cash-ui.js', 'api-cash-ui.css', 'cash-activity-ranking.js', 'review-section-covers.js', 'review-section-covers.css', 'author-portrait.js', 'author-portrait.css', 'market-highlights.js', 'market-highlights.css', 'brand-preview.js', 'brand-preview.css', 'banner-art.js', 'banner-art.css', 'theme-preview.js', 'theme-preview.css', 'preview-controls.css', 'cash-catalog.js', 'cash-catalog.css', 'nx-benchmark.js', 'nx-benchmark.css', 'cash-client-catalog.js', 'cash-client-catalog.css', 'rate-arrival.js', 'rate-arrival.css', 'panel-size-preview.js', 'panel-size-preview.css', 'price-check.js', 'price-check.css', 'cash-highlights.js', 'cash-highlights.css', 'basket-history-layout.js', 'basket-history-layout.css', 'rate-clock.js', 'rate-clock.css', 'overview-basket.js', 'overview-basket.css', 'nav-preview.js', 'nav-preview.css', 'site-music.js', 'site-music.css', 'viewer-preview.js', 'viewer-preview.css', 'rate-title-preview.js', 'category-link-preview.js', 'category-link-preview.css', 'date-presentation.js', 'mystery-boxes.js', 'mystery-boxes.css', 'speculation.js', 'speculation.css', 'popular-fashion.js', 'popular-fashion.css', 'volatility-preview.js', 'volatility-preview.css', 'fm-backdrop-preview.js', 'fm-backdrop-preview.css', 'category-reference-preview.js', 'category-reference-preview.css', 'rolling-benchmark-preview.js', 'rolling-benchmark-preview.css', 'fee-preview.js', 'fee-preview.css', 'short-window-preview.js', 'short-window-preview.css', 'ellinia-backdrop-preview.js', 'ellinia-backdrop-preview.css', 'local-preview-refresh.js', '_headers', 'sw.js'):
            (web / filename).write_text('fixture', encoding='utf-8')
        # This file-copy test uses intentionally non-executable dummy HTML/JS.
        # The separate bundle/footer-lock suites exercise opt-ins using actual UI sources.
        engine.atomic(self.root / 'config.json', {**self.cfg, 'bundle_assets': False, 'footer_privacy_lock': False})
        with patch('icons.write_icons'):
            engine.write_site(report)
        self.assertTrue((self.root / 'dist' / 'history' / 'cpi-v1.json').exists())
        self.assertFalse((self.root / 'dist' / 'history' / 'private-source.json').exists())
        self.assertFalse((self.root / 'dist' / 'cache').exists())
        for filename in ('community.js', 'community.css', 'layout-preview.js', 'layout-preview.css', 'chart-interaction.js', 'chart-interaction.css'):
            self.assertEqual((self.root / 'dist' / filename).read_text(encoding='utf-8'), 'fixture')


if __name__ == '__main__':
    unittest.main()
