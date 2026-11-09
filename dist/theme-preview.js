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

// Optional coordinated presentation. Existing preferences, art and data are kept.
(() => {
  'use strict';
  const options = document.getElementById('display-options');
  if (!options || document.getElementById('design-preset-options')) return;
  const key = 'astra-design-preset-v1', backdropKey = 'astra-design-preset-backdrop-v1';
  let selected = 'custom', backdrop = 'sky', storageAvailable = true;
  try {
    const saved = localStorage.getItem(key);
    if (['mesowatch', 'mesowatch-refine'].includes(saved)) selected = saved;
    if (localStorage.getItem(backdropKey) === 'keep') backdrop = 'keep';
  } catch { storageAvailable = false; }
  const group = document.createElement('section');
  group.id = 'design-preset-options'; group.className = 'theme-preview-options design-preset-options';
  group.dataset.previewControls = 'design-preset';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Coordinated design preset');
  const title = document.createElement('span'); title.textContent = 'Design preset';
  const choices = document.createElement('div'); choices.className = 'theme-preview-buttons';
  const backgrounds = document.createElement('div'); backgrounds.className = 'design-preset-backgrounds';
  backgrounds.setAttribute('role', 'group'); backgrounds.setAttribute('aria-label', 'Preset backdrop');
  const note = document.createElement('small'); note.className = 'theme-preview-note';
  note.id = 'design-preset-note'; note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
  group.setAttribute('aria-describedby', note.id);
  function save(name, value) { try { localStorage.setItem(name, value); } catch { storageAvailable = false; } }
  function render() {
    const active = selected === 'mesowatch' || selected === 'mesowatch-refine';
    if (active) { document.body.dataset.designPreset = 'mesowatch'; document.body.dataset.designPresetBackdrop = backdrop; }
    else { delete document.body.dataset.designPreset; delete document.body.dataset.designPresetBackdrop; }
    if (selected === 'mesowatch-refine') document.body.dataset.designPresetRefine = 'on';
    else delete document.body.dataset.designPresetRefine;
    for (const button of choices.children) button.setAttribute('aria-pressed', String(button.dataset.designPresetChoice === selected));
    for (const button of backgrounds.children) button.setAttribute('aria-pressed', String(button.dataset.designPresetBackdropChoice === backdrop));
    backgrounds.hidden = !active;
    note.textContent = (storageAvailable ? 'Saved in this browser only. ' : 'Storage is unavailable; this choice works in this tab. ') +
      (active ? (selected === 'mesowatch-refine' ? 'Refined spacing, softer panel edges and a lighter source note. ' : '') + 'Rounded type, parchment panels and orange tabs. Sky only temporarily covers scenery; Keep my scenery uses the existing art. Individual style controls return to My choices. ' : 'Your existing design and scenery choices are used. ') +
      'Prices, dates, calculation methods and saved individual choices are unchanged.';
    document.dispatchEvent(new CustomEvent('astradesignpresetchange', { detail: { preset: selected, backdrop: active ? backdrop : null } }));
  }
  function choose(value, persist = false) {
    selected = ['mesowatch', 'mesowatch-refine'].includes(value) ? value : 'custom';
    if (persist) save(key, selected);
    render();
  }
  for (const [value, label] of [['custom', 'My choices'], ['mesowatch', 'Meso.watch-inspired'], ['mesowatch-refine', 'Meso.watch refine']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.designPresetChoice = value; button.textContent = label;
    button.addEventListener('click', () => choose(value, true)); choices.append(button);
  }
  for (const [value, label] of [['sky', 'Sky only'], ['keep', 'Keep my scenery']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.designPresetBackdropChoice = value; button.textContent = label;
    button.addEventListener('click', () => { backdrop = value; save(backdropKey, value); render(); }); backgrounds.append(button);
  }
  group.append(title, choices, backgrounds, note);
  options.insertBefore(group, document.getElementById('theme-preview-options'));
  // A deliberate individual type/palette/footer choice takes precedence. Scenery,
  // layout order and every calculation control remain independent.
  document.addEventListener('click', event => {
    if (selected === 'custom' || !(event.target instanceof Element)) return;
    if (event.target.closest('#brand-preview-options button, #theme-preview-options button, .community-footer-styles button')) choose('custom', true);
  });
  window.addEventListener('storage', event => {
    if (event.storageArea !== null) { try { if (event.storageArea !== localStorage) return; } catch { return; } }
    if (event.key === null) { backdrop = 'sky'; choose('custom'); }
    else if (event.key === key) choose(event.newValue);
    else if (event.key === backdropKey) { backdrop = event.newValue === 'keep' ? 'keep' : 'sky'; render(); }
  });
  render();
})();
