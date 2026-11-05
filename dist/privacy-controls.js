(() => {
  'use strict';
  const footer = document.querySelector('footer');
  if (!footer || document.documentElement.dataset.privacyControlsLoaded) return;
  document.documentElement.dataset.privacyControlsLoaded = 'true';

  // A new purpose/version must use a new key rather than inherit old consent.
  const preferenceKey = 'inflation-optional-analytics-consent-v1';
  const scriptId = 'optional-cloudflare-analytics';
  const approvedSource = 'https://static.cloudflareinsights.com/beacon.min.js';
  const forcedOffParameter = 'optional-analytics';
  // Preview-only default. A server-confirmed preview response is required
  // before loading the external script; saved Off always wins.
  const previewDefaultOn = footer.dataset.previewAnalyticsDefault === 'on';
  const panels = [];
  let choice = 'off';
  let previewDefaultActive = false;
  let generation = 0;
  let controller;
  let loading;
  let scriptAdded = false;
  let message = '';

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const save = value => {
    try { localStorage.setItem(preferenceKey, value); return true; }
    catch { return false; }
  };
  const hasForcedOff = () => {
    try { return new URL(window.location.href).searchParams.get(forcedOffParameter) === 'off'; }
    catch { return false; }
  };
  const unexpectedBeacon = () => [...document.querySelectorAll('script[src]')].some(script => {
    if (script.id === scriptId) return false;
    try {
      const url = new URL(script.src, window.location.href);
      return url.origin === 'https://static.cloudflareinsights.com' && /^\/beacon\.min\.js(?:\/|$)/.test(url.pathname);
    } catch { return false; }
  });

  function update() {
    for (const panel of panels) {
      panel.state.textContent = choice === 'on'
        ? 'Optional Cloudflare performance metrics on' : 'Optional browser analytics off';
      panel.feedback.textContent = message;
      for (const button of panel.buttons) button.setAttribute('aria-pressed', String(button.dataset.analyticsChoice === choice));
    }
  }

  function clearOwnedScript() {
    document.getElementById(scriptId)?.remove();
  }

  function useOff() {
    const reloadNeeded = choice === 'on' || scriptAdded;
    choice = 'off';
    previewDefaultActive = false;
    generation++;
    controller?.abort();
    controller = undefined;
    loading = undefined;
    clearOwnedScript();
    const saved = save('off');
    message = reloadNeeded
      ? 'Reloading this page with optional analytics off. Removing a script alone cannot stop code already loaded.'
      : 'No optional analytics script is loaded by this control.';
    if (unexpectedBeacon()) message += ' A separate hosting-injected script is present; its server configuration must also be corrected.';
    if (!saved) message += ' Browser storage is unavailable; the choice cannot be saved normally.';
    update();
    if (reloadNeeded) {
      // If withdrawal cannot be saved, keep an explicit OFF override through reload.
      // Preserve the existing route/hash and unrelated display preferences.
      if (!saved) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set(forcedOffParameter, 'off');
          window.history.replaceState(window.history.state, '', url);
        } catch { /* A blocked store is also treated as OFF at startup. */ }
      }
      window.location.reload();
    }
  }

  function validateConfig(config) {
    if (!config || config.mode !== 'manual' || config.provider !== 'cloudflare-web-analytics' || config.automaticInjection !== false
      || config.scriptUrl !== approvedSource || typeof config.beaconToken !== 'string'
      || !/^[a-f0-9]{32}$/i.test(config.beaconToken)) throw new Error('Optional analytics is not configured for manual loading.');
    if (config.integrity !== undefined && (typeof config.integrity !== 'string'
      || !/^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}(?:\s+sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2})*$/.test(config.integrity))) {
      throw new Error('Optional analytics integrity configuration is invalid.');
    }
    return config;
  }

  async function enable(savedConsent = false, fromPreviewDefault = false) {
    if (choice === 'on' && (loading || document.getElementById(scriptId))) {
      if (!savedConsent && !fromPreviewDefault) {
        previewDefaultActive = false;
        message = save('on') ? 'Your On choice is saved. Optional Cloudflare metrics remain enabled.' : 'Metrics are on in this page, but the choice could not be saved. Off can still reload without the script.';
        update();
      }
      return;
    }
    if (unexpectedBeacon()) {
      choice = 'off'; save('off');
      message = 'An analytics script added outside this control is present. Hosting configuration must be corrected; this switch cannot undo previously loaded code.';
      update(); return;
    }
    if (!fromPreviewDefault && !save('on')) {
      choice = 'off';
      message = 'Browser storage is unavailable. Optional analytics stays off.';
      update(); return;
    }
    if (!savedConsent && hasForcedOff()) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete(forcedOffParameter);
        window.history.replaceState(window.history.state, '', url);
      } catch { /* This explicit click still authorizes this document only. */ }
    }
    choice = 'on';
    previewDefaultActive = fromPreviewDefault;
    const current = ++generation;
    controller = new AbortController();
    message = fromPreviewDefault ? 'This password-protected preview defaults to On. Loading the disclosed Cloudflare metrics; choose Off to disable them.'
      : savedConsent ? 'Restoring your saved On choice. Loading optional Cloudflare metrics.' : 'Your choice is on. Loading optional Cloudflare metrics.';
    update();
    loading = (async () => {
      try {
        // Saved/forced Off never reaches this request. A default is not stored
        // as if the visitor explicitly selected On.
        const response = await window.fetch('/analytics-config.json', {
          cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) throw new Error('Unlock this site again before enabling optional metrics.');
        if (!response.ok) throw new Error('Optional analytics configuration is unavailable.');
        if (fromPreviewDefault && response.headers?.get?.('x-astra-preview') !== 'password') {
          throw new Error('The On default applies only to the password-protected preview.');
        }
        const contentType = response.headers?.get?.('content-type');
        if (contentType && !/\bapplication\/(?:[a-z0-9.+-]*\+)?json\b/i.test(contentType)) {
          throw new Error('Configuration is not JSON; unlock this site again if your session expired.');
        }
        const config = validateConfig(await response.json());
        if (choice !== 'on' || current !== generation) return;
        if (document.getElementById(scriptId)) return;
        const script = document.createElement('script');
        script.id = scriptId;
        script.type = 'module';
        script.src = approvedSource;
        // Cloudflare documents spa:false for its manual embedding approach:
        // https://developers.cloudflare.com/web-analytics/get-started/web-analytics-spa/
        script.dataset.cfBeacon = JSON.stringify({ token: config.beaconToken, spa: false });
        if (config.integrity) { script.integrity = config.integrity; script.crossOrigin = 'anonymous'; }
        script.addEventListener('load', () => {
          if (choice !== 'on' || current !== generation) return;
          message = 'The optional Cloudflare script is enabled. Metrics may now be processed; delivery is not guaranteed.';
          update();
        });
        script.addEventListener('error', () => {
          if (choice !== 'on' || current !== generation) return;
          message = 'Your choice is on, but the optional script could not load. Prices and features still work. Turn it off to reload without the script.';
          update();
        });
        scriptAdded = true;
        document.head.append(script);
      } catch (error) {
        if (choice !== 'on' || current !== generation) return;
        choice = 'off'; previewDefaultActive = false;
        if (!fromPreviewDefault) save('off');
        message = 'Optional analytics stays off: ' + (error instanceof Error ? error.message : 'configuration could not be loaded.');
        update();
      } finally {
        if (current === generation) loading = undefined;
      }
    })();
    await loading;
  }

  function addPanel(parent, id, headingText) {
    const panel = make('section', 'privacy-controls-panel'); panel.id = id;
    panel.setAttribute('aria-labelledby', id + '-title');
    const heading = make('h2', '', headingText); heading.id = id + '-title';
    const state = make('p', 'privacy-choice-state');
    const explanation = make('p', 'privacy-choice-description', 'With On, Cloudflare may process page views, visited/referring URLs, device and browser information, and performance measurements. This password-protected preview defaults to On unless you saved Off. Prices, market feeds and features work in either mode.');
    explanation.id = id + '-description';
    const options = make('div', 'privacy-choice-options');
    options.setAttribute('role', 'group'); options.setAttribute('aria-label', 'Optional Cloudflare browser metrics');
    const buttons = ['off', 'on'].map(value => {
      const button = make('button', 'privacy-choice-button', value === 'off' ? 'Off' : 'On (preview default)');
      button.type = 'button'; button.dataset.analyticsChoice = value;
      button.setAttribute('aria-describedby', explanation.id);
      button.addEventListener('click', () => { if (value === 'on') enable(); else useOff(); });
      options.append(button); return button;
    });
    const limitation = make('p', 'privacy-choice-limits', 'Turning this off reloads the current page to stop the optional script. Hosting security logs and aggregate request counts can still exist in both modes; this browser switch cannot remove them.');
    const feedback = make('p', 'privacy-choice-feedback');
    feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    panel.append(heading, state, explanation, options, limitation, feedback);
    parent.append(panel); panels.push({ panel, state, buttons, feedback });
    return panel;
  }

  addPanel(footer, 'privacy-controls', 'Your privacy choice');
  function addPrivacyDisclosure() {
    const privacy = document.getElementById('view-privacy');
    const prose = privacy?.querySelector('.community-prose');
    if (!prose || document.getElementById('privacy-analytics-controls')) return !!prose;
    const intro = prose.querySelector('p');
    if (intro) intro.textContent = 'This note describes inflation.gg, maintained by DishWasher. There are no visitor accounts or ads. Optional Cloudflare browser metrics are On by default in this password-protected preview unless you saved Off. The controls below explain the data and let you turn them Off or On.';
    const panel = addPanel(prose, 'privacy-analytics-controls', 'Optional performance metrics');
    if (intro) intro.after(panel);
    const sources = make('p', 'privacy-choice-sources');
    for (const [label, href] of [
      ['Cloudflare data collection', 'https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/'],
      ['Metric dimensions', 'https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/'],
    ]) {
      if (sources.childNodes.length) sources.append(document.createTextNode(' · '));
      const link = make('a', '', label); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; sources.append(link);
    }
    panel.append(sources);
    update(); return true;
  }
  if (!addPrivacyDisclosure()) {
    const observer = new MutationObserver(() => { if (addPrivacyDisclosure()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (unexpectedBeacon()) message = 'An analytics script added outside this control is present. Hosting configuration must be corrected; the Off setting cannot undo code already loaded.';
  else message = 'No optional analytics script is loaded by this control.';
  update();
  let saved, storageReadable = true;
  try { saved = localStorage.getItem(preferenceKey); } catch { storageReadable = false; }
  if (hasForcedOff()) save('off');
  else if (saved === 'on') enable(true);
  else if (saved === null && storageReadable && previewDefaultOn) enable(false, true);

  // A withdrawal in another tab or restored page must not revive a loaded beacon.
  window.addEventListener('storage', event => { if (event.key === preferenceKey && event.newValue !== 'on' && choice === 'on') useOff(); });
  window.addEventListener('pageshow', event => {
    if (!event.persisted || choice !== 'on') return;
    try {
      const saved = localStorage.getItem(preferenceKey);
      if (saved !== 'on' && !(previewDefaultActive && saved === null && !hasForcedOff())) useOff();
    }
    catch { useOff(); }
  });
})();
