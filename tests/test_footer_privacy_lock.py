"""Temporary real-site builds only; never rebuild canonical dist or fetch data."""
import ast
import hashlib
import inspect
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import asset_bundles
import engine
import icons


class FooterPrivacyLockTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.dist = self.root / 'dist'
        self.dist.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def test_disabled_is_no_io_and_invalid_attribution_is_fail_closed(self):
        self.assertFalse(engine.apply_footer_privacy_lock(self.root / 'absent'))
        for page in ('<main>No footer</main>', '<footer>No required credits</footer>',
                     '<footer><p class="footer-credits">Source</p></footer><footer>Extra</footer>'):
            (self.dist / 'index.html').write_bytes(page.encode())
            with self.assertRaises(ValueError):
                engine.apply_footer_privacy_lock(self.dist, enabled=True)
            self.assertEqual((self.dist / 'index.html').read_bytes(), page.encode())

    def test_static_lock_preserves_explicit_analytics_default_and_credits(self):
        for default in ('on', 'off'):
            page = f'<body class="original" data-viewer-preview="off"><header>Original</header><footer data-preview-analytics-default="{default}"><p>Private author paragraph</p><p class="footer-credits">Original attribution <a href="https://example.org/source">Source</a></p></footer><main>Unchanged</main></body>'
            (self.dist / 'index.html').write_bytes(page.encode())
            self.assertTrue(engine.apply_footer_privacy_lock(self.dist, enabled=True))
            output = (self.dist / 'index.html').read_text(encoding='utf-8')
            self.assertIn(f'data-preview-analytics-default="{default}"', output)
            self.assertIn(default.title() + ' by default', output)
            self.assertIn('data-footer-privacy-lock="on"', output)
            self.assertIn('<body class="original" data-viewer-preview="on">', output)
            self.assertEqual(output.count('data-viewer-preview='), 1)
            self.assertNotIn('Private author paragraph', output)
            self.assertIn('Original attribution <a href="https://example.org/source">Source</a>', output)
            self.assertIn('<header>Original</header>', output)
            self.assertIn('<main>Unchanged</main>', output)
            self.assertFalse((self.dist / 'index.html.tmp').exists())

    def test_real_write_site_locks_no_js_html_before_bundling_and_unlock_restores_original(self):
        canonical = Path(engine.__file__).parent
        source = (canonical / 'web' / 'index.html').read_bytes()
        source_text = source.decode('utf-8')
        signature = re.search(r'<p class="footer-signature">(.*?)</p>', source_text).group(1)
        credits = re.search(r'<p class="footer-credits">.*?</p>', source_text, re.S).group(0)
        tree = ast.parse(inspect.getsource(engine.write_site))
        names = next(ast.literal_eval(n.iter) for n in ast.walk(tree) if isinstance(n, ast.For) and isinstance(n.iter, ast.Tuple))
        web = self.root / 'web'
        web.mkdir()
        for name in names:
            shutil.copyfile(canonical / 'web' / name, web / name)
        source_hashes = {name: hashlib.sha256((web / name).read_bytes()).hexdigest() for name in names}
        report = {'live': None, 'latest': {'nxRate': 10, 'cpi': 100}, 'sourceUpdatedAt': '2026-11-04T08:30:56Z',
                  'builtAt': '2026-11-05T16:00:00Z', 'sourceStatus': {'checkedAt': '2026-11-05T16:00:00Z'}}
        with patch.object(engine, 'ROOT', self.root), patch.object(icons, 'write_icons', side_effect=lambda _, target: target.mkdir(exist_ok=True)):
            for bundled in (False, True):
                engine.atomic(self.root / 'config.json', {'bundle_assets': bundled, 'footer_privacy_lock': True})
                engine.write_site(report)
                output = (self.dist / 'index.html').read_text(encoding='utf-8')
                for private in ('surgery', 'cancer treatment', 'grad job', signature, 'footer-signature', 'footer-story', 'footer-intro'):
                    self.assertNotIn(private, output, 'Locked HTML must exclude the original personal footer even without JavaScript')
                self.assertIn('Author note and full credits will appear here after review.', output)
                self.assertIn(credits.replace('\r\n', '\n'), output)
                self.assertIn('href="#privacy"', output)
                self.assertIn('href="#method"', output)
                self.assertIn('data-footer-privacy-lock="on"', output)
                self.assertRegex(output, r'<body\b[^>]*data-viewer-preview="on"')
                self.assertNotRegex(output, r'<details\b[^>]*id="display-options"[^>]*\bhidden\b')
                self.assertIn('data-preview-analytics-default="on"', output)
                if bundled:
                    self.assertEqual(len(asset_bundles.current_bundle_files(self.dist)), 5)
                locked_marker = json.loads((self.dist / 'ui-version.json').read_bytes())['version']
                self.assertEqual(json.loads((self.dist / 'data.json').read_bytes()), report)
                engine.atomic(self.root / 'config.json', {'bundle_assets': bundled, 'footer_privacy_lock': False})
                engine.write_site(report)
                restored = (self.dist / 'index.html').read_text(encoding='utf-8')
                self.assertIn(signature, restored)
                self.assertIn('surgery for cancer treatment', restored)
                self.assertNotIn('data-footer-privacy-lock="on"', restored)
                self.assertNotRegex(restored, r'<body\b[^>]*data-viewer-preview=')
                self.assertNotEqual(locked_marker, json.loads((self.dist / 'ui-version.json').read_bytes())['version'])
            for name, digest in source_hashes.items():
                self.assertEqual(hashlib.sha256((web / name).read_bytes()).hexdigest(), digest)
        self.assertEqual((canonical / 'web' / 'index.html').read_bytes(), source)


if __name__ == '__main__':
    unittest.main()
