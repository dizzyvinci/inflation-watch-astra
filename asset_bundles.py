"""Opt-in, deterministic offline bundling of the site's ordered flat UI files.

No minifier, downloads, dependency resolver or executable source evaluation.
Original modules/assets remain available. Only the generated dist index changes.
"""
import argparse
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re


MANIFEST = 'ui-bundles.json'
NAME = re.compile(r'[a-z0-9][a-z0-9-]*\.(?:js|css)\Z')
GENERATED = re.compile(r'astra-ui-[a-f0-9]{16}\.(?:js|css)\Z')
PRESERVED_GENERATED = re.compile(r'astra-app-[a-f0-9]{16}\.js\Z')


def sha(body):
    return hashlib.sha256(body).hexdigest()


def atomic_bytes(path, body):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_bytes(body)
    os.replace(temporary, path)


class References(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.text = text
        self.lines = [0]
        self.lines.extend(match.end() for match in re.finditer('\n', text))
        self.css = []
        self.js = []
        self.script = None
        self.feed(text)
        self.close()
        if self.script:
            raise ValueError('Unclosed script tag')

    def index_offset(self):
        line, column = self.getpos()
        return self.lines[line - 1] + column

    @staticmethod
    def attributes(values):
        names = [name for name, _ in values]
        if len(set(names)) != len(names):
            raise ValueError('Duplicate tag attributes are not bundled')
        return dict(values)

    def handle_starttag(self, tag, values):
        attrs = self.attributes(values)
        start = self.index_offset()
        end = start + len(self.get_starttag_text())
        if tag == 'link' and attrs.get('rel', '').lower() == 'stylesheet':
            if set(attrs) != {'rel', 'href'}:
                raise ValueError('Stylesheet media/integrity/other attributes need separate handling')
            self.css.append((start, end, attrs['href']))
        if tag == 'script':
            if set(attrs) != {'src', 'defer'} or attrs['defer'] not in (None, '', 'defer'):
                raise ValueError('Only ordinary external defer scripts can be bundled')
            if self.script:
                raise ValueError('Nested scripts are invalid')
            self.script = (start, end, attrs['src'])

    def handle_endtag(self, tag):
        if tag != 'script':
            return
        if not self.script:
            raise ValueError('Unexpected script end tag')
        start, content, name = self.script
        stop = self.index_offset()
        if self.text[content:stop].strip():
            raise ValueError('Inline script contents are not bundled')
        end = self.text.find('>', stop)
        if end < 0:
            raise ValueError('Unclosed script end tag')
        self.js.append((start, end + 1, name))
        self.script = None


def validate_group(text, group, extension):
    if not group:
        raise ValueError('Both stylesheets and defer scripts are required')
    names = []
    for start, end, name in group:
        if not NAME.fullmatch(name) or not name.endswith(extension) or GENERATED.fullmatch(name) or PRESERVED_GENERATED.fullmatch(name):
            raise ValueError('Bundle input must be an original flat local UI file')
        if name in names:
            raise ValueError('Duplicate references are not silently deduplicated')
        names.append(name)
    for previous, following in zip(group, group[1:]):
        gap = re.sub(r'<!--.*?-->', '', text[previous[1]:following[0]], flags=re.S)
        if gap.strip():
            raise ValueError('Interleaved styles/scripts/content require separate bundle groups')


def strict_iife(text):
    # Only known self-scoped strict arrow IIFEs enter an optional bundle.
    return bool(re.match(r"\s*\(\s*\(\s*\)\s*=>\s*\{\s*['\"]use strict['\"]\s*;", text)
                and re.search(r"\}\s*\)\s*\(\s*\)\s*;?\s*\Z", text))



def normalized_ui(body):
    return body.decode('utf-8-sig').replace('\r\n', '\n').replace('\r', '\n').encode('utf-8')


def make_asset(dist, group, kind, sources):
    chunks = [b"'use strict';\n"] if kind == 'js' else []
    inputs = []
    for _, _, name in group:
        path = dist / name
        if path.is_symlink() or path.resolve().parent != dist.resolve():
            raise ValueError('UI inputs must stay inside the asset root')
        body = sources[name]
        text = body.decode('utf-8')
        if kind == 'js':
            if not strict_iife(text):
                raise ValueError('Only strict self-scoped IIFEs may be guarded: ' + name)
            if re.search(r'\bdocument\s*\.\s*(?:currentScript|write)\b|sourceMappingURL|sourceURL', text):
                raise ValueError('Script URL/parser-dependent behavior needs separate handling: ' + name)
            chunks.append(('\n;\n/* Astra source: ' + name + ' */\ntry {\n' + text + '\n;\n} catch {\n'
                           + '  try { document.dispatchEvent(new CustomEvent(\"astrauimoduleerror\", {detail: {module: '
                           + json.dumps(name) + ', status: \"initialization_failed\"}})); } catch {}\n}\n').encode('utf-8'))
        else:
            if re.search(r'@(?:charset|import|namespace)\b', text, re.I):
                raise ValueError('CSS import/charset/namespace requires separate handling: ' + name)
            chunks.append(('\n/* Astra source: ' + name + ' */\n' + text + '\n').encode('utf-8'))
        inputs.append({'file': name, 'sha256': sha(body), 'bytes': len(body)})
    content = b''.join(chunks)
    if kind == 'css':
        # Trim only the generated container's outer whitespace; input bytes and
        # their provenance remain intact. End the stylesheet with one newline.
        content = content.lstrip(b'\n').rstrip(b' \t\r\n') + b'\n'
    digest = sha(content)
    return content, {'file': 'astra-ui-' + digest[:16] + '.' + kind,
                     'sha256': digest, 'bytes': len(content), 'inputs': inputs}


def bundle_site(dist, *, enabled=False):
    """Bundle copied assets in a dedicated dist root; opt-out does no I/O.

    The caller always copies its original index first. Old hashed files are
    retained; exporters should include only current manifest-validated bundles.
    Validation completes before writes; bundles precede the atomic HTML switch.
    """
    if enabled is not True:
        return None
    dist = Path(dist)
    text = normalized_ui((dist / 'index.html').read_bytes()).decode('utf-8')
    refs = References(text)
    validate_group(text, refs.css, '.css')
    validate_group(text, refs.js, '.js')
    app_index = next((i for i, ref in enumerate(refs.js) if ref[2] == 'app.js'), None)
    if app_index is None or app_index == 0 or app_index == len(refs.js) - 1:
        raise ValueError('One preserved app.js with optional modules before and after is required')
    originals = {}
    sources = {}
    for _, _, name in refs.css + refs.js:
        path = dist / name
        if path.is_symlink() or path.resolve().parent != dist.resolve():
            raise ValueError('UI inputs must stay inside the asset root')
        originals[name] = path.read_bytes()
        sources[name] = normalized_ui(originals[name])
    app = dist / 'app.js'
    if app.is_symlink() or app.resolve().parent != dist.resolve():
        raise ValueError('Preserved app must stay inside the asset root')
    app_body = sources['app.js']
    if not re.match(r"\s*['\"]use strict['\"]\s*;", app_body.decode('utf-8-sig')):
        raise ValueError('Preserved app must retain its original strict top-level script')
    preserved = {'source': 'app.js', 'file': 'astra-app-' + sha(app_body)[:16] + '.js',
                 'sha256': sha(app_body), 'bytes': len(app_body)}
    css, css_record = make_asset(dist, refs.css, 'css', sources)
    before, before_record = make_asset(dist, refs.js[:app_index], 'js', sources)
    after, after_record = make_asset(dist, refs.js[app_index + 1:], 'js', sources)
    replacements = [(start, end, '') for start, end, _ in refs.css + refs.js]
    replacement_by_offset = {
        refs.css[0][0]: '<link rel="stylesheet" href="' + css_record['file'] + '">',
        refs.js[0][0]: '<script src="' + before_record['file'] + '" defer></script>',
        refs.js[app_index][0]: '<script src="' + preserved['file'] + '" defer></script>',
        refs.js[app_index + 1][0]: '<script src="' + after_record['file'] + '" defer></script>',
    }
    edits = []
    for start, end, _ in replacements:
        replacement = replacement_by_offset.get(start, '')
        if not replacement:
            line_start = text.rfind('\n', 0, start) + 1
            newline = text.find('\n', end)
            line_end = len(text) if newline < 0 else newline
            if not text[line_start:start].strip() and not text[end:line_end].strip():
                # A deleted tag was the sole content of this line. Remove its
                # indentation/newline too; never strip whitespace inside other
                # HTML text, preformatted content or user-input elements.
                start = line_start
                end = line_end if newline < 0 else line_end + 1
        edits.append((start, end, replacement))
    for start, end, replacement in sorted(edits, reverse=True):
        text = text[:start] + replacement + text[end:]
    html = text.encode('utf-8')
    manifest = {'schemaVersion': 2, 'kind': 'static_ui_bundle', 'enabled': True,
                'js': [before_record, after_record], 'preservedScripts': [preserved],
                'scriptOrder': [before_record['file'], preserved['file'], after_record['file']],
                'css': css_record, 'htmlSha256': sha(html)}
    # Hash the normalized in-memory inputs, then atomically commit exactly those
    # bytes before the generated files/HTML. Only copied text inputs change;
    # web sources, opaque artwork/fonts and immutable market JSON are untouched.
    for name, body in sources.items():
        if body != originals[name]:
            atomic_bytes(dist / name, body)
    atomic_bytes(dist / preserved['file'], app_body)
    atomic_bytes(dist / before_record['file'], before)
    atomic_bytes(dist / after_record['file'], after)
    atomic_bytes(dist / css_record['file'], css)
    atomic_bytes(dist / MANIFEST, (json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode('utf-8'))
    atomic_bytes(dist / 'index.html', html)
    return manifest


def current_bundle_files(dist):
    """Return only current, fully verified generated export files (or empty)."""
    dist = Path(dist)
    html = (dist / 'index.html').read_bytes()
    refs = References(html.decode('utf-8'))
    if not any(GENERATED.fullmatch(name) or PRESERVED_GENERATED.fullmatch(name) for _, _, name in refs.css + refs.js):
        return ()
    if len(refs.css) != 1 or len(refs.js) != 3 or not PRESERVED_GENERATED.fullmatch(refs.js[1][2]):
        raise ValueError('Mixed or incomplete generated UI references')
    body = (dist / MANIFEST).read_bytes()
    if len(body) > 262_144:
        raise ValueError('Oversized UI bundle manifest')
    record = json.loads(body)
    if (not isinstance(record, dict) or record.get('schemaVersion') != 2 or record.get('kind') != 'static_ui_bundle'
            or record.get('enabled') is not True or record.get('htmlSha256') != sha(html)
            or record.get('scriptOrder') != [ref[2] for ref in refs.js]):
        raise ValueError('UI bundle manifest does not describe the current HTML/order')
    javascript = record.get('js')
    preserved = record.get('preservedScripts')
    if not isinstance(javascript, list) or len(javascript) != 2 or not isinstance(preserved, list) or len(preserved) != 1:
        raise ValueError('Missing guarded/preserved script definitions')
    app = preserved[0]
    content = (dist / 'app.js').read_bytes()
    app_name = refs.js[1][2]
    if (not isinstance(app, dict) or app.get('source') != 'app.js' or app.get('file') != app_name
            or app_name != 'astra-app-' + sha(content)[:16] + '.js'
            or app.get('sha256') != sha(content) or app.get('bytes') != len(content)
            or (dist / app_name).read_bytes() != content):
        raise ValueError('Preserved app differs from manifest')
    files = [MANIFEST]
    definitions = [('js', refs.js[0], javascript[0]), ('js', refs.js[2], javascript[1]), ('css', refs.css[0], record.get('css'))]
    all_names = set()
    for kind, reference, item in definitions:
        if not isinstance(item, dict):
            raise ValueError('Invalid current bundle record')
        name = item.get('file')
        if not isinstance(name, str) or not GENERATED.fullmatch(name) or name != reference[2] or not name.endswith('.' + kind):
            raise ValueError('Invalid current UI bundle name')
        content = (dist / name).read_bytes()
        if item.get('bytes') != len(content) or item.get('sha256') != sha(content) or name != 'astra-ui-' + sha(content)[:16] + '.' + kind:
            raise ValueError('Current UI bundle content-address mismatch')
        inputs = item.get('inputs')
        if not isinstance(inputs, list) or not inputs:
            raise ValueError('Missing UI bundle input provenance')
        for source in inputs:
            original = source.get('file') if isinstance(source, dict) else None
            if not isinstance(original, str) or not NAME.fullmatch(original) or not original.endswith('.' + kind) or original in all_names or original == 'app.js':
                raise ValueError('Invalid UI bundle input provenance')
            all_names.add(original)
            content = (dist / original).read_bytes()
            if source.get('sha256') != sha(content) or source.get('bytes') != len(content):
                raise ValueError('Copied UI source differs from bundled provenance')
        files.append(name)
    return tuple(files + [app_name])



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, required=True)
    parser.add_argument('--enable', action='store_true', help='Explicitly enable bundling in this copied dist directory')
    args = parser.parse_args()
    result = bundle_site(args.dist, enabled=args.enable)
    print(json.dumps({'enabled': result is not None, 'manifest': MANIFEST if result else None}))


if __name__ == '__main__':
    main()
