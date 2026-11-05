"""Offline bundle generation/commit tests. Never write canonical dist."""
import ast
import hashlib
import inspect
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import asset_bundles as bundles
import engine
import icons


class AssetBundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.dist = self.root / 'dist'
        self.dist.mkdir()
        self.html = ('<!doctype html><link rel="icon" href="assets/leaf.svg">\n'
                     '<link rel="stylesheet" href="base.css">\n<!-- order matters -->\n'
                     '<link rel="stylesheet" href="theme.css">\n'
                     '<script src="first.js" defer></script>\n'
                     '<script src="app.js" defer></script>\n'
                     '<script src="second.js" defer></script><main>Original page</main>')
        self.files = {'index.html': self.html,
                      'base.css': '.a{background:url("assets/scene.png");color:red}\n',
                      'theme.css': '@font-face{font-family:test;src:url(assets/type.woff2)}\n.a{color:blue}',
                      'first.js': "(() => { 'use strict'; window.order=['first']; // trailing comment\n})();",
                      'app.js': "'use strict'; window.order.push('app');",
                      'second.js': "(() => { 'use strict'; window.order.push('second'); })();"}
        for name, text in self.files.items():
            (self.dist / name).write_text(text, encoding='utf-8')

    def tearDown(self):
        self.temp.cleanup()

    def test_disabled_is_default_and_performs_no_io(self):
        self.assertIsNone(bundles.bundle_site(self.root / 'does-not-exist'))
        self.assertIsNone(bundles.bundle_site(self.root / 'does-not-exist', enabled='true'))
        self.assertEqual((self.dist / 'index.html').read_text(), self.html)
        self.assertFalse((self.dist / bundles.MANIFEST).exists())

    def test_deleted_tag_lines_and_generated_css_eof_are_clean_without_source_rewrites(self):
        html = self.html.replace('<link rel="stylesheet"', '  <link rel="stylesheet"').replace('<script src=', '\t<script src=')
        html += '<pre>keep\n  \nspacing</pre><textarea>\n \n</textarea>'
        (self.dist / 'index.html').write_bytes(html.encode('utf-8'))
        original_css = (self.files['theme.css'] + '\n\n  \n').encode('utf-8')
        (self.dist / 'theme.css').write_bytes(original_css)
        record = bundles.bundle_site(self.dist, enabled=True)
        output = (self.dist / 'index.html').read_text(encoding='utf-8')
        self.assertNotIn('\n  \n<!-- order matters -->', output)
        self.assertNotIn('\n\t\n', output)
        self.assertNotRegex(output.split('<pre>')[0], r'(?m)^[ \t]+$')
        self.assertIn('<pre>keep\n  \nspacing</pre>', output)
        self.assertIn('<textarea>\n \n</textarea>', output)
        css = (self.dist / record['css']['file']).read_bytes()
        self.assertTrue(css.endswith(b'\n'))
        self.assertFalse(css.endswith(b'\n\n'))
        self.assertFalse(css.startswith(b'\n'))
        self.assertEqual((self.dist / 'theme.css').read_bytes(), original_css)
        self.assertEqual(record['css']['inputs'][-1]['sha256'], hashlib.sha256(original_css).hexdigest())
        self.assertEqual(len(bundles.current_bundle_files(self.dist)), 5)

    def test_crlf_and_lf_inputs_have_identical_bundles_manifests_and_copy_hashes(self):
        roots = [self.root / 'lf', self.root / 'crlf']
        opaque = b'opaque-font-or-art\r\n\x00\xff\n'
        reports = []
        for root, ending in zip(roots, [b'\n', b'\r\n']):
            root.mkdir()
            for name, text in self.files.items():
                (root / name).write_bytes(text.encode('utf-8').replace(b'\n', ending))
            (root / 'assets').mkdir()
            (root / 'assets' / 'type.woff2').write_bytes(opaque)
            (root / 'data.json').write_bytes(b'{"opaque":"immutable"}\r\n')
            reports.append(bundles.bundle_site(root, enabled=True))
            for name, text in self.files.items():
                if name != 'index.html':
                    self.assertEqual((root / name).read_bytes(), text.encode('utf-8'))
            self.assertNotIn(b'\r', (root / 'index.html').read_bytes())
            self.assertEqual((root / 'assets' / 'type.woff2').read_bytes(), opaque)
            self.assertEqual((root / 'data.json').read_bytes(), b'{"opaque":"immutable"}\r\n')
            self.assertEqual(len(bundles.current_bundle_files(root)), 5)
        self.assertEqual(reports[0], reports[1])
        for filename in bundles.current_bundle_files(roots[0]):
            self.assertEqual((roots[0] / filename).read_bytes(), (roots[1] / filename).read_bytes())

    def test_hashes_order_separators_originals_relative_urls_and_atomic_index_switch(self):
        writes = []
        original = bundles.atomic_bytes
        def write(path, body):
            writes.append(path.name)
            if path.name == 'index.html':
                manifest = json.loads((self.dist / bundles.MANIFEST).read_bytes())
                for entry in manifest['js'] + [manifest['css']]:
                    self.assertTrue((self.dist / entry['file']).exists())
            return original(path, body)
        with patch.object(bundles, 'atomic_bytes', side_effect=write):
            record = bundles.bundle_site(self.dist, enabled=True)
        self.assertEqual(writes[-1], 'index.html')
        rewritten = (self.dist / 'index.html').read_text(encoding='utf-8')
        self.assertEqual(rewritten.count('<script '), 3)
        self.assertEqual(rewritten.count('rel="stylesheet"'), 1)
        self.assertIn(' defer></script>', rewritten)
        self.assertIn('<main>Original page</main>', rewritten)
        self.assertIn('rel="icon" href="assets/leaf.svg"', rewritten)
        self.assertEqual(record['htmlSha256'], hashlib.sha256((self.dist / 'index.html').read_bytes()).hexdigest())
        for entry, names in [(record['js'][0], ['first.js']), (record['js'][1], ['second.js']), (record['css'], ['base.css', 'theme.css'])]:
            body = (self.dist / entry['file']).read_bytes()
            self.assertEqual(entry['sha256'], hashlib.sha256(body).hexdigest())
            self.assertTrue(bundles.GENERATED.fullmatch(entry['file']))
            self.assertEqual(entry['bytes'], len(body))
            self.assertEqual([i['file'] for i in entry['inputs']], names)
            for name in names:
                self.assertEqual((self.dist / name).read_text(encoding='utf-8'), self.files[name])
            if len(names) > 1:
                self.assertLess(body.index(names[0].encode()), body.index(names[1].encode()))
        javascript = (self.dist / record['js'][0]['file']).read_text(encoding='utf-8')
        self.assertTrue(javascript.startswith("'use strict';"))
        self.assertIn('astrauimoduleerror', javascript)
        self.assertIn('\n;\n} catch {', javascript)
        self.assertEqual(record['scriptOrder'], [record['js'][0]['file'], record['preservedScripts'][0]['file'], record['js'][1]['file']])
        self.assertEqual((self.dist / 'app.js').read_text(encoding='utf-8'), self.files['app.js'])
        preserved = record['preservedScripts'][0]
        self.assertEqual(preserved['source'], 'app.js')
        self.assertTrue(bundles.PRESERVED_GENERATED.fullmatch(preserved['file']))
        self.assertEqual((self.dist / preserved['file']).read_bytes(), (self.dist / 'app.js').read_bytes())
        css = (self.dist / record['css']['file']).read_text(encoding='utf-8')
        self.assertIn('url("assets/scene.png")', css)
        self.assertIn('url(assets/type.woff2)', css)
        (self.dist / 'index.html').write_text(self.html, encoding='utf-8')
        self.assertEqual(bundles.bundle_site(self.dist, enabled=True), record)
        (self.dist / 'index.html').write_text(self.html, encoding='utf-8')
        (self.dist / 'second.js').write_text("(() => { 'use strict'; window.order.push('changed'); })();", encoding='utf-8')
        changed = bundles.bundle_site(self.dist, enabled=True)
        self.assertNotEqual(changed['js'][1]['file'], record['js'][1]['file'])
        self.assertEqual(changed['css']['file'], record['css']['file'])
        self.assertTrue((self.dist / record['js'][0]['file']).exists(), 'Previous immutable bundles are retained')


    def test_app_url_changes_with_app_content_and_previous_hashed_copy_survives(self):
        old = bundles.bundle_site(self.dist, enabled=True)
        old_app = old['preservedScripts'][0]
        old_content = (self.dist / old_app['file']).read_bytes()
        (self.dist / 'index.html').write_text(self.html, encoding='utf-8')
        (self.dist / 'app.js').write_bytes(old_content + b'\n// reviewed next release\n')
        new = bundles.bundle_site(self.dist, enabled=True)
        self.assertNotEqual(old_app['file'], new['preservedScripts'][0]['file'])
        self.assertEqual(old['js'], new['js'])
        self.assertEqual(old['css'], new['css'])
        self.assertEqual((self.dist / old_app['file']).read_bytes(), old_content)
        self.assertNotIn('src="app.js"', (self.dist / 'index.html').read_text(encoding='utf-8'))
        self.assertEqual(len(bundles.current_bundle_files(self.dist)), 5)

    def test_unsupported_semantics_fail_before_any_publication(self):
        variants = [self.html.replace('first.js', '../private.js'),
                    self.html.replace('first.js', 'https://example.test/first.js'),
                    self.html.replace('src="first.js" defer', 'src="first.js" async'),
                    self.html.replace('src="first.js" defer', 'src="first.js" defer type="module"'),
                    self.html.replace('href="base.css"', 'href="base.css" media="print"'),
                    self.html.replace('<!-- order matters -->', '<style>.a{color:pink}</style>'),
                    self.html.replace('</script>\n', '</script><script>window.inline=true</script>\n', 1),
                    self.html.replace('second.js', 'first.js'),
                    self.html.replace('app.js', 'missing-app.js')]
        for html in variants:
            with self.subTest(html=html):
                (self.dist / 'index.html').write_text(html, encoding='utf-8')
                with self.assertRaises(ValueError):
                    bundles.bundle_site(self.dist, enabled=True)
                self.assertEqual((self.dist / 'index.html').read_text(encoding='utf-8'), html)
                self.assertFalse((self.dist / bundles.MANIFEST).exists())
                self.assertEqual(list(self.dist.glob('astra-ui-*')), [])
        (self.dist / 'index.html').write_text(self.html, encoding='utf-8')
        for name, text in [('first.js', 'window.sloppy=true'), ('first.js', "'use strict'; window.unscoped=true"),
                           ('first.js', "'use strict'; document.currentScript.src"), ('app.js', 'window.sloppyApp=true'),
                           ('base.css', '@import url("https://example.test/a.css");'), ('base.css', '@charset "utf-8";')]:
            (self.dist / name).write_text(text, encoding='utf-8')
            with self.assertRaises(ValueError):
                bundles.bundle_site(self.dist, enabled=True)
            self.assertFalse((self.dist / bundles.MANIFEST).exists())
            (self.dist / name).write_text(self.files[name], encoding='utf-8')

    def test_write_failure_never_switches_html_to_missing_assets(self):
        original = bundles.atomic_bytes
        def fail(path, body):
            if path.suffix == '.css':
                raise OSError('Synthetic output failure')
            return original(path, body)
        with patch.object(bundles, 'atomic_bytes', side_effect=fail):
            with self.assertRaises(OSError):
                bundles.bundle_site(self.dist, enabled=True)
        self.assertEqual((self.dist / 'index.html').read_text(), self.html)
        self.assertFalse((self.dist / bundles.MANIFEST).exists())

    def test_export_helper_accepts_only_verified_current_bundles(self):
        self.assertEqual(bundles.current_bundle_files(self.dist), ())
        manifest = bundles.bundle_site(self.dist, enabled=True)
        self.assertEqual(bundles.current_bundle_files(self.dist), (bundles.MANIFEST, manifest['js'][0]['file'], manifest['js'][1]['file'], manifest['css']['file'], manifest['preservedScripts'][0]['file']))
        js = self.dist / manifest['js'][0]['file']
        original = js.read_bytes()
        js.write_bytes(original + b'\n// corrupt')
        with self.assertRaises(ValueError):
            bundles.current_bundle_files(self.dist)
        js.write_bytes(original)
        (self.dist / 'first.js').write_text("'use strict'; window.drift=true", encoding='utf-8')
        with self.assertRaises(ValueError):
            bundles.current_bundle_files(self.dist)
        (self.dist / 'first.js').write_bytes(self.files['first.js'].encode('utf-8'))
        self.assertEqual(len(bundles.current_bundle_files(self.dist)), 5)
        (self.dist / 'app.js').write_text("'use strict'; window.appDrift=true", encoding='utf-8')
        with self.assertRaises(ValueError):
            bundles.current_bundle_files(self.dist)
        (self.dist / 'app.js').write_bytes(self.files['app.js'].encode('utf-8'))
        (self.dist / 'index.html').write_text(self.html, encoding='utf-8')
        self.assertEqual(bundles.current_bundle_files(self.dist), (), 'Ignore retained manifest after explicit opt-out/rebuild')

    def test_real_copy_pipeline_is_opt_in_and_ui_marker_tracks_original_inputs(self):
        canonical = Path(engine.__file__).parent
        (self.root / 'config.json').write_text('{"bundle_assets":true}', encoding='utf-8')
        web = self.root / 'web'
        web.mkdir()
        tree = ast.parse(inspect.getsource(engine.write_site))
        names = next(ast.literal_eval(n.iter) for n in ast.walk(tree) if isinstance(n, ast.For) and isinstance(n.iter, ast.Tuple))
        for name in names:
            shutil.copyfile(canonical / 'web' / name, web / name)
        original_app_bytes = (web / 'app.js').read_bytes()
        report = {'live': None, 'latest': {'nxRate': 10, 'cpi': 100}, 'sourceUpdatedAt': '2026-11-04T08:30:56Z',
                  'builtAt': '2026-11-05T15:00:00Z', 'sourceStatus': {'checkedAt': '2026-11-05T15:00:00Z'}}
        with patch.object(engine, 'ROOT', self.root), patch.object(icons, 'write_icons', side_effect=lambda _, p: p.mkdir(exist_ok=True)):
            engine.write_site(report)
            first = json.loads((self.dist / 'ui-version.json').read_bytes())
            manifest = json.loads((self.dist / bundles.MANIFEST).read_bytes())
            self.assertEqual(manifest['htmlSha256'], hashlib.sha256((self.dist / 'index.html').read_bytes()).hexdigest())
            self.assertGreater(sum(len(entry['inputs']) for entry in manifest['js']), 30)
            self.assertEqual((self.dist / 'app.js').read_bytes(), bundles.normalized_ui(original_app_bytes))
            self.assertEqual((web / 'app.js').read_bytes(), original_app_bytes)
            app = web / 'app.js'
            app.write_text(app.read_text(encoding='utf-8') + '\n// synthetic UI change\n', encoding='utf-8')
            engine.write_site(report)
            self.assertNotEqual(first['version'], json.loads((self.dist / 'ui-version.json').read_bytes())['version'])
            (self.root / 'config.json').write_text('{"bundle_assets":false}', encoding='utf-8')
            engine.write_site(report)
            self.assertEqual((self.dist / 'index.html').read_bytes(), (web / 'index.html').read_bytes())


if __name__ == '__main__':
    unittest.main()
