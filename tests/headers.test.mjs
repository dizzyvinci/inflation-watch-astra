import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../web/_headers', import.meta.url), 'utf8');
const rules = [];
for (const line of text.split(/\r?\n/)) {
  if (!line.trim() || line.trimStart().startsWith('#')) continue;
  if (!/^\s/.test(line)) rules.push({ path: line.trim(), headers: {} });
  else {
    const match = line.trim().match(/^([^:]+):\s*(.*)$/);
    assert.ok(match, `Valid header: ${line}`);
    const name = match[1].toLowerCase();
    assert.ok(!Object.hasOwn(rules.at(-1).headers, name), 'No duplicate header in rule');
    rules.at(-1).headers[name] = match[2];
  }
}
const rule = path => {
  const matches = rules.filter(r => r.path === path);
  assert.equal(matches.length, 1, `Exactly one rule for ${path}`);
  return matches[0].headers;
};
const csp = new Map(rule('/*')['content-security-policy'].split(';').map(part => {
  const [directive, ...values] = part.trim().split(/\s+/);
  return [directive, values];
}));

test('manual opt-in has only the documented exact script and ingest destinations', () => {
  assert.deepEqual(csp.get('script-src'), ["'self'", 'https://static.cloudflareinsights.com/beacon.min.js']);
  assert.deepEqual(csp.get('connect-src'), ["'self'", 'https://cloudflareinsights.com/cdn-cgi/rum']);
  for (const key of ['script-src', 'connect-src']) {
    assert.ok(!csp.get(key).some(value => value.includes('*') || value.includes('unsafe-')));
  }
  assert.deepEqual(csp.get('object-src'), ["'none'"]);
  assert.deepEqual(csp.get('base-uri'), ["'self'"]);
  assert.deepEqual(csp.get('frame-ancestors'), ["'self'"]);
});

test('HTML entry aliases resist automatic injection without a global no-transform policy', () => {
  assert.equal(rule('/*')['cache-control'], undefined);
  for (const path of ['/', '/index', '/index.html', '/404', '/404.html']) {
    assert.equal(rule(path)['cache-control'], 'public, max-age=0, must-revalidate, no-transform');
  }
  for (const path of ['/fallback', '/fallback.html']) {
    assert.equal(rule(path)['cache-control'], 'public, max-age=60, stale-if-error=86400, no-transform');
  }
});

test('JSON and asset cache policies retain their TTLs and compression eligibility', () => {
  assert.equal(rule('/version.json')['cache-control'], 'public, max-age=0, must-revalidate');
  assert.equal(rule('/data-*.json')['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(rule('/assets/*')['cache-control'], 'public, max-age=86400');
  for (const path of ['/version.json', '/data-*.json', '/assets/*']) {
    assert.ok(!rule(path)['cache-control'].includes('no-transform'));
  }
});

test('HTML contains no unconditional external performance beacon', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=\s*["']https:\/\/static\.cloudflareinsights\.com/i);
  assert.doesNotMatch(html, /<link\b[^>]*(?:preload|prefetch|preconnect)[^>]*cloudflareinsights\.com/i);
});
