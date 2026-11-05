(() => {
  'use strict';
  const parent = document.getElementById('display-options');
  if (!parent || document.getElementById('theme-preview-options')) return;
  const key = 'astra-color-scheme-v1';
  const schemes = Object.freeze({
    ellinia: { label: 'Ellinia Green (default)', browserColor: null },
    'maple-amber': { label: 'Maple Amber', browserColor: '#211914' },
    'moonlit-ludibrium': { label: 'Moonlit Ludibrium', browserColor: '#171a2a' },
  });
  const browserTheme = document.querySelector('meta[name="theme-color"]');
  const originalBrowserColor = browserTheme?.getAttribute('content');
  const group = document.createElement('section');
  group.id = 'theme-preview-options'; group.className = 'theme-preview-options';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Color scheme');
  const label = document.createElement('span'); label.textContent = 'Color scheme';
  const choices = document.createElement('div'); choices.className = 'theme-preview-buttons';
  const note = document.createElement('small'); note.className = 'theme-preview-note';
  note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
  const buttons = [];
  const apply = (value, persist = false) => {
    const scheme = Object.hasOwn(schemes, value) ? value : 'ellinia';
    // Removing the attribute restores every original approved green rule.
    if (scheme === 'ellinia') delete document.body.dataset.colorScheme;
    else document.body.dataset.colorScheme = scheme;
    if (browserTheme) {
      const color = schemes[scheme].browserColor ?? originalBrowserColor;
      if (color === null) browserTheme.removeAttribute('content');
      else browserTheme.setAttribute('content', color);
    }
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.colorSchemeChoice === scheme));
    let saved = true;
    if (persist) {
      try { localStorage.setItem(key, scheme); } catch { saved = false; }
    }
    note.textContent = (saved ? 'Saved in this browser only. ' : 'Browser storage is unavailable; this choice works in this tab. ') +
      'Prices, calculations and buy/sell/source-status meanings stay the same.';
    document.dispatchEvent(new CustomEvent('astracolorschemechange', { detail: { scheme } }));
  };
  for (const [value, scheme] of Object.entries(schemes)) {
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.colorSchemeChoice = value; button.textContent = scheme.label;
    button.addEventListener('click', () => apply(value, true));
    buttons.push(button); choices.append(button);
  }
  group.append(label, choices, note);
  // Load after the other display modules so this cosmetic group stays last.
  parent.append(group);
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Approved green remains the default. */ }
  apply(saved);
  window.addEventListener('storage', event => { if (event.key === key) apply(event.newValue); });
})();
