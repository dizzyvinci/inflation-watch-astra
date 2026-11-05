const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'web/privacy-controls.js'), 'utf8');
const community = fs.readFileSync(path.join(root, 'web/community.js'), 'utf8');
const preferenceKey = 'inflation-optional-analytics-consent-v1';
const token = '0123456789abcdef0123456789abcdef';
const validConfig = { mode: 'manual', provider: 'cloudflare-web-analytics', automaticInjection: false,
  scriptUrl: 'https://static.cloudflareinsights.com/beacon.min.js', beaconToken: token };
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ preferences = new Map(), blocked = false, readonly = false,
  config = validConfig, responseOk = true, responseStatus = 200, contentType = 'application/json', pending = false, url = 'https://inflation.gg/?existing=kept#nx-calculator',
  injected = false, latePrivacy = false } = {}) {
  const navigation = [], errors = [], console = new VirtualConsole();
  console.on('jsdomError', error => {
    if (error.message.includes('navigation')) navigation.push(error.message);
    else errors.push(error.message);
  });
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'web/index.html'), 'utf8'), {
    url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console,
  });
  const w = dom.window, doc = w.document;
  const calls = { fetch: [], beacon: 0, xhr: 0, writes: [] };
  const storage = { blocked, readonly };
  Object.defineProperty(w, 'localStorage', { value: {
    getItem(key) { if (storage.blocked) throw new Error('Storage blocked'); return preferences.get(key) ?? null; },
    setItem(key, value) {
      calls.writes.push([key, value]);
      if (storage.blocked || storage.readonly) throw new Error('Storage blocked');
      preferences.set(key, value);
    },
  } });
  let complete;
  const response = () => ({ ok: responseOk, status: responseStatus, headers: { get: () => contentType }, json: async () => config });
  w.fetch = (request, options) => {
    calls.fetch.push({ request, options });
    if (pending) return new Promise(resolve => { complete = () => resolve(response()); });
    return Promise.resolve(response());
  };
  w.XMLHttpRequest = function () { calls.xhr++; throw new Error('Unexpected direct provider request'); };
  w.navigator.sendBeacon = () => { calls.beacon++; throw new Error('Unexpected direct beacon'); };
  if (injected) {
    const script = doc.createElement('script'); script.src = validConfig.scriptUrl + '/hosting-version'; doc.head.append(script);
  }
  const storyBefore = doc.querySelector('.footer-story').outerHTML;
  const footerLinksBefore = doc.querySelector('.footer-links').innerHTML;
  if (!latePrivacy) w.eval(community);
  const style = doc.createElement('style'); style.textContent = fs.readFileSync(path.join(root, 'web/privacy-controls.css'), 'utf8'); doc.head.append(style);
  w.eval(source);
  return { dom, w, doc, calls, preferences, navigation, errors, storage, storyBefore, footerLinksBefore,
    resolve: () => complete?.(), close: () => dom.window.close() };
}

const scripts = f => [...f.doc.querySelectorAll('#optional-cloudflare-analytics')];
const click = (f, value, privacy = false) => {
  const parent = f.doc.getElementById(privacy ? 'privacy-analytics-controls' : 'privacy-controls');
  const button = parent.querySelector(`button[data-analytics-choice="${value}"]`); assert(button); button.click();
};
const assertOff = f => {
  assert([...f.doc.querySelectorAll('button[data-analytics-choice="off"]')].every(button => button.getAttribute('aria-pressed') === 'true'));
  assert([...f.doc.querySelectorAll('button[data-analytics-choice="on"]')].every(button => button.getAttribute('aria-pressed') === 'false'));
  assert([...f.doc.querySelectorAll('.privacy-choice-state')].every(node => node.textContent === 'Optional browser analytics off'));
};

(async () => {
  const preferences = new Map([['astra-scenery', 'on'], ['astra-hero-layout', 'dials-first']]);
  const f = fixture({ preferences });
  assertOff(f); assert.equal(f.calls.fetch.length, 0); assert.equal(scripts(f).length, 0);
  assert.equal(f.calls.beacon, 0); assert.equal(f.calls.xhr, 0);
  assert.equal(f.doc.querySelectorAll('.privacy-controls-panel').length, 2);
  assert(!f.doc.getElementById('view-privacy').textContent.includes('no visitor accounts, ads or client analytics beacons'));
  assert(f.doc.getElementById('view-privacy').textContent.includes('visited/referring URLs'));
  assert(f.doc.getElementById('privacy-controls').textContent.includes('cannot remove them'));
  assert.equal(f.w.getComputedStyle(f.doc.querySelector('.privacy-choice-button')).fontSize, '14px');
  f.w.eval(source); assert.equal(f.doc.querySelectorAll('.privacy-controls-panel').length, 2);
  click(f, 'on'); await flush();
  assert.equal(f.calls.fetch.length, 1); assert.equal(f.calls.fetch[0].request, '/analytics-config.json');
  assert.equal(f.calls.fetch[0].options.credentials, 'omit'); assert.equal(f.calls.fetch[0].options.redirect, 'error');
  assert.equal(preferences.get(preferenceKey), 'on'); assert.equal(scripts(f).length, 1);
  const script = scripts(f)[0]; assert.equal(script.type, 'module'); assert.equal(script.src, validConfig.scriptUrl);
  assert.deepEqual(JSON.parse(script.dataset.cfBeacon), { token, spa: false });
  script.dispatchEvent(new f.w.Event('load'));
  assert([...f.doc.querySelectorAll('.privacy-choice-state')].every(node => node.textContent === 'Optional Cloudflare performance metrics on'));
  click(f, 'on', true); await flush(); assert.equal(f.calls.fetch.length, 1); assert.equal(scripts(f).length, 1);
  click(f, 'off', true); assertOff(f); assert.equal(scripts(f).length, 0); assert.equal(preferences.get(preferenceKey), 'off');
  assert.equal(f.navigation.length, 1, 'withdrawal reloads the page rather than merely removing a tag');
  assert.equal(f.w.location.hash, '#nx-calculator'); assert.equal(preferences.get('astra-scenery'), 'on');
  assert.equal(preferences.get('astra-hero-layout'), 'dials-first');
  assert.equal(f.doc.querySelector('.footer-story').outerHTML, f.storyBefore);
  assert(f.doc.querySelector('.footer-links').innerHTML.startsWith(f.footerLinksBefore));
  assert.equal(f.calls.beacon, 0); assert.equal(f.calls.xhr, 0); assert.equal(f.errors.length, 0);
  f.close();

  const withdrawn = fixture({ preferences }); await flush(); assertOff(withdrawn);
  assert.equal(withdrawn.calls.fetch.length, 0); assert.equal(scripts(withdrawn).length, 0); withdrawn.close();
  const restored = fixture({ preferences: new Map([[preferenceKey, 'on']]) }); await flush();
  assert.equal(restored.calls.fetch.length, 1); assert.equal(scripts(restored).length, 1); restored.close();
  const configured = fixture({ config: JSON.parse(fs.readFileSync(path.join(root, 'web/analytics-config.json'), 'utf8')) });
  click(configured, 'on'); await flush(); assert.equal(scripts(configured).length, 1);
  assert.equal(JSON.parse(scripts(configured)[0].dataset.cfBeacon).token.length, 32); configured.close();

  for (const options of [
    { preferences: new Map([[preferenceKey, 'invalid']]) },
    { preferences: new Map([['inflation-optional-analytics-consent-v0', 'on']]) },
    { preferences: new Map([[preferenceKey, 'on']]), blocked: true },
    { preferences: new Map([[preferenceKey, 'on']]), readonly: true },
  ]) {
    const safe = fixture(options); await flush(); assertOff(safe); assert.equal(safe.calls.fetch.length, 0);
    if (options.blocked || options.readonly) { click(safe, 'on'); await flush(); assertOff(safe); assert.equal(safe.calls.fetch.length, 0); }
    assert.equal(scripts(safe).length, 0); safe.close();
  }

  for (const config of [
    { ...validConfig, scriptUrl: 'https://example.com/beacon.js' },
    { ...validConfig, scriptUrl: validConfig.scriptUrl + '?alternate=1' },
    { ...validConfig, automaticInjection: true },
    { ...validConfig, mode: 'automatic' },
    { ...validConfig, provider: 'another-provider' },
    { ...validConfig, beaconToken: 'not-a-public-32-hex-token' },
    { ...validConfig, integrity: 'invalid-integrity' },
    null,
  ]) {
    const invalid = fixture({ config }); click(invalid, 'on'); await flush();
    assertOff(invalid); assert.equal(scripts(invalid).length, 0); assert.equal(invalid.calls.fetch.length, 1);
    assert.equal(invalid.preferences.get(preferenceKey), 'off'); invalid.close();
  }
  const unavailable = fixture({ responseOk: false }); click(unavailable, 'on'); await flush();
  assertOff(unavailable); assert.equal(scripts(unavailable).length, 0); unavailable.close();
  for (const options of [{ contentType: 'text/html' }, { responseStatus: 401, responseOk: false }, { responseStatus: 403, responseOk: false }]) {
    const locked = fixture(options); click(locked, 'on'); await flush(); assertOff(locked);
    assert.equal(scripts(locked).length, 0); assert(locked.doc.querySelector('.privacy-choice-feedback').textContent.toLowerCase().includes('unlock')); locked.close();
  }

  const race = fixture({ pending: true }); click(race, 'on'); click(race, 'on', true);
  assert.equal(race.calls.fetch.length, 1); assert.equal(scripts(race).length, 0);
  click(race, 'off'); assert.equal(race.calls.fetch[0].options.signal.aborted, true);
  race.resolve(); await flush(); assertOff(race); assert.equal(scripts(race).length, 0); assert.equal(race.navigation.length, 1); race.close();

  const storageLoss = fixture({ preferences: new Map([[preferenceKey, 'on']]) }); await flush();
  storageLoss.storage.readonly = true; click(storageLoss, 'off'); assert.equal(scripts(storageLoss).length, 0);
  assert.equal(new URL(storageLoss.w.location.href).searchParams.get('optional-analytics'), 'off');
  assert.equal(storageLoss.w.location.hash, '#nx-calculator'); assert.equal(storageLoss.navigation.length, 1);
  const forcedUrl = storageLoss.w.location.href, oldPreference = storageLoss.preferences; storageLoss.close();
  const forced = fixture({ preferences: oldPreference, url: forcedUrl }); await flush();
  assertOff(forced); assert.equal(forced.calls.fetch.length, 0); click(forced, 'on'); await flush();
  assert.equal(new URL(forced.w.location.href).searchParams.has('optional-analytics'), false); assert.equal(scripts(forced).length, 1); forced.close();

  const outside = fixture({ injected: true }); assertOff(outside);
  assert(outside.doc.querySelector('.privacy-choice-feedback').textContent.includes('outside this control'));
  click(outside, 'on'); await flush(); assertOff(outside); assert.equal(outside.calls.fetch.length, 0); assert.equal(scripts(outside).length, 0); outside.close();

  const denied = fixture(); click(denied, 'on'); await flush(); scripts(denied)[0].dispatchEvent(new denied.w.Event('error'));
  assert(denied.doc.querySelector('.privacy-choice-feedback').textContent.includes('could not load')); click(denied, 'off'); assert.equal(denied.navigation.length, 1); denied.close();
  const otherTab = fixture({ preferences: new Map([[preferenceKey, 'on']]) }); await flush();
  otherTab.w.dispatchEvent(new otherTab.w.StorageEvent('storage', { key: preferenceKey, newValue: 'off' }));
  assertOff(otherTab); assert.equal(scripts(otherTab).length, 0); assert.equal(otherTab.navigation.length, 1); otherTab.close();
  const restoredPage = fixture({ preferences: new Map([[preferenceKey, 'on']]) }); await flush();
  restoredPage.preferences.set(preferenceKey, 'off'); const pageShow = new restoredPage.w.Event('pageshow');
  Object.defineProperty(pageShow, 'persisted', { value: true }); restoredPage.w.dispatchEvent(pageShow);
  assertOff(restoredPage); assert.equal(scripts(restoredPage).length, 0); assert.equal(restoredPage.navigation.length, 1); restoredPage.close();

  const late = fixture({ latePrivacy: true }); assert.equal(late.doc.querySelectorAll('.privacy-controls-panel').length, 1);
  late.w.eval(community); await flush(); assert.equal(late.doc.querySelectorAll('.privacy-controls-panel').length, 2);
  assert.equal(late.doc.querySelector('.footer-story').outerHTML, late.storyBefore); assert.equal(late.calls.fetch.length, 0); late.close();

  console.log('PASS: default-OFF/no network, explicit and saved consent, strict manual config, one approved script, withdrawal reload/race safety, blocked storage, synced disclosures and unchanged personal story');
})().catch(error => { console.error(error); process.exitCode = 1; });
