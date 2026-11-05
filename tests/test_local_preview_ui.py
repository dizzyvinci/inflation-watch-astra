"""Local-only UI commit-marker/server checks; no provider requests or real build."""
import ast
import http.client
import http.server
import inspect
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import engine
import icons
import preview


class UiVersionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.dist = self.root / 'dist'
        self.dist.mkdir()
        for name in ('index.html', 'app.js', 'style.css'):
            (self.dist / name).write_text('original ' + name, encoding='utf-8')
        self.names = ['index.html', 'app.js', 'style.css']

    def tearDown(self):
        self.temp.cleanup()

    def test_hash_tracks_served_ui_bytes_not_market_or_build_clocks(self):
        first = engine.write_ui_version(self.dist, self.names)
        self.assertRegex(first['version'], r'^[a-f0-9]{64}$')
        for name in ('data.json', 'version.json', 'fallback.html', '404.html', 'analytics-config.json'):
            (self.dist / name).write_text('new source/build clock and prices', encoding='utf-8')
        self.assertEqual(engine.write_ui_version(self.dist, list(reversed(self.names)) + ['analytics-config.json']), first)
        (self.dist / 'app.js').write_text('changed actual UI code', encoding='utf-8')
        second = engine.write_ui_version(self.dist, self.names)
        self.assertNotEqual(first['version'], second['version'])
        self.assertEqual(json.loads((self.dist / 'ui-version.json').read_text(encoding='utf-8')), second)
        self.assertFalse((self.dist / 'ui-version.json.tmp').exists())

    def test_failed_read_and_unsafe_path_do_not_replace_last_good_marker(self):
        first = engine.write_ui_version(self.dist, self.names)
        with self.assertRaises(ValueError):
            engine.write_ui_version(self.dist, ['../private.js'])
        (self.dist / 'app.js').unlink()
        with self.assertRaises(FileNotFoundError):
            engine.write_ui_version(self.dist, self.names)
        self.assertEqual(json.loads((self.dist / 'ui-version.json').read_text(encoding='utf-8')), first)

    def test_upload_ignore_preserves_other_rules_and_final_marker_exclusion(self):
        ignore = self.dist / '.assetsignore'
        ignore.write_text('/operator-only.json\n!*.json\n', encoding='utf-8')
        engine.write_ui_version(self.dist, self.names)
        once = ignore.read_text(encoding='utf-8')
        self.assertTrue(once.startswith('/operator-only.json\n!*.json\n'))
        self.assertTrue(once.endswith('/ui-version.json\n/ui-version.json.tmp\n'))
        engine.write_ui_version(self.dist, self.names)
        self.assertEqual(ignore.read_text(encoding='utf-8'), once)

    def test_local_helper_is_last_deferred_script_and_in_copy_allowlist(self):
        root = Path(engine.__file__).resolve().parent
        page = (root / 'web' / 'index.html').read_text(encoding='utf-8')
        import re
        scripts = re.findall(r'<script src="([^"]+)" defer></script>', page)
        self.assertEqual(scripts[-1], 'local-preview-refresh.js')
        self.assertEqual(scripts.count('local-preview-refresh.js'), 1)
        self.assertIn("'local-preview-refresh.js'", inspect.getsource(engine.write_site))
        package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
        self.assertIn('node --check web/local-preview-refresh.js', package['scripts']['check'])
        self.assertIn('node tests/local-preview-refresh.cjs', package['scripts']['test:dom'])

    def test_route_reads_only_curated_committed_marker_and_blocks_active_build(self):
        self.assertEqual(preview.ui_version(self.root), (503, {'status': 'not_ready'}))
        marker = engine.write_ui_version(self.dist, self.names)
        engine.atomic(self.dist / 'ui-version.json', {**marker, 'ignoredPrivatePath': 'not returned'})
        self.assertEqual(preview.ui_version(self.root), (200, marker))
        (self.root / '.collector.lock').write_text('synthetic test lock')
        self.assertEqual(preview.ui_version(self.root), (503, {'status': 'building'}))
        (self.root / '.collector.lock').unlink()
        for value in ({'schemaVersion': 1, 'kind': 'local_preview_ui', 'version': '../bad'}, [], 'not a marker'):
            engine.atomic(self.dist / 'ui-version.json', value)
            self.assertEqual(preview.ui_version(self.root), (503, {'status': 'not_ready'}))

    def test_local_get_is_no_store_head_is_method_not_allowed_no_provider_call(self):
        marker = engine.write_ui_version(self.dist, self.names)
        with patch.object(preview, 'ROOT', self.root), patch.object(preview, 'build', side_effect=AssertionError('No collection')) as build:
            server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), preview.Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=3)
                connection.request('GET', '/__ui_version?local=1')
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertEqual(response.getheader('Cache-Control'), 'no-store')
                self.assertIsNone(response.getheader('Access-Control-Allow-Origin'))
                self.assertEqual(json.loads(response.read()), marker)
                connection.request('HEAD', '/__ui_version')
                response = connection.getresponse()
                self.assertEqual(response.status, 405)
                self.assertEqual(response.getheader('Allow'), 'GET')
                self.assertEqual(response.read(), b'')
                connection.close()
                build.assert_not_called()
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

    def test_full_temp_site_writes_ui_marker_last_and_failed_copy_keeps_old_marker(self):
        # Use the existing copy allowlist, including future added modules, to
        # exercise actual publication order without touching canonical dist.
        tree = ast.parse(inspect.getsource(engine.write_site))
        names = next(ast.literal_eval(node.iter) for node in ast.walk(tree) if isinstance(node, ast.For) and isinstance(node.iter, ast.Tuple))
        web = self.root / 'web'
        web.mkdir()
        for name in names:
            (web / name).write_text('fixture UI ' + name, encoding='utf-8')
        report = {'live': None, 'latest': {'nxRate': 10, 'cpi': 100}, 'sourceUpdatedAt': '2026-11-04T08:30:56Z',
                  'builtAt': '2026-11-05T14:00:00Z', 'sourceStatus': {'checkedAt': '2026-11-05T14:00:00Z'}}
        writes = []
        original_atomic = engine.atomic
        def checked_atomic(target, value):
            writes.append(Path(target).name)
            if Path(target).name == 'ui-version.json':
                for name in ('index.html', 'app.js', 'version.json', 'data.json', 'fallback.html', '404.html'):
                    self.assertTrue((self.dist / name).is_file(), name)
            return original_atomic(target, value)
        with patch.object(engine, 'ROOT', self.root), patch.object(icons, 'write_icons', side_effect=lambda report, target: target.mkdir(exist_ok=True)), patch.object(engine, 'atomic', side_effect=checked_atomic):
            engine.write_site(report)
            self.assertEqual(writes[-1], 'ui-version.json')
            original_marker = (self.dist / 'ui-version.json').read_bytes()
            (web / 'app.js').write_text('new code after a later build', encoding='utf-8')
            original_copy = engine.shutil.copyfile
            def interrupted(source, target):
                if Path(source).name == 'style.css':
                    raise OSError('Synthetic interrupted build')
                return original_copy(source, target)
            with patch.object(engine.shutil, 'copyfile', side_effect=interrupted):
                with self.assertRaises(OSError):
                    engine.write_site(report)
            self.assertEqual((self.dist / 'ui-version.json').read_bytes(), original_marker)
            engine.write_site(report)
            self.assertNotEqual((self.dist / 'ui-version.json').read_bytes(), original_marker)


if __name__ == '__main__':
    unittest.main()
