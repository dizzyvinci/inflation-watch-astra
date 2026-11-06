(() => {
  'use strict';
  const options = document.getElementById('display-options');
  if (!options || document.getElementById('fm-backdrop-options')) return;
  const key = 'astra-fm-backdrop-v1';
  const modes = new Map([['original', 'Original'], ['wide', 'Wide scene'], ['soft', 'Soft gradient'], ['glow', 'Stronger glow'], ['daylight', 'Sunlit market'], ['portal-night', 'Portal blue'], ['golden-hour', 'Golden hour'], ['forest-room', 'Mushroom room · FM 1'], ['stone-room', 'Stone room · FM 7']]);
  let storageAvailable = true, selected = 'original';
  try { const saved = localStorage.getItem(key); if (modes.has(saved)) selected = saved; } catch { storageAvailable = false; }
  const group = document.createElement('fieldset'); group.id = 'fm-backdrop-options'; group.className = 'fm-backdrop-options'; group.dataset.previewControls = 'fm-backdrop';
  const legend = document.createElement('legend'); legend.textContent = 'Scenery · Free Market backdrop';
  const buttons = document.createElement('div'); buttons.className = 'fm-backdrop-buttons'; buttons.setAttribute('role', 'group'); buttons.setAttribute('aria-label', 'Free Market backdrop coverage and gradient');
  const note = document.createElement('p'); note.className = 'fm-backdrop-note'; note.id = 'fm-backdrop-note'; group.setAttribute('aria-describedby', note.id);
  function context() {
    const isFM = ['classic', 'banner'].includes(document.body.dataset.sceneryMode);
    const applies = document.body.classList.contains('scenery-on') && isFM;
    group.dataset.applies = String(applies);
    const source = selected === 'forest-room' ? 'Original MCW Free Market <1> room, map 80002001.' : selected === 'stone-room' ? 'Original MCW Free Market <7> room, map 80002007.' : 'The original 2311 × 1137 entrance map is reused.';
    const text = applies ? 'Applies to the Free Market page backdrop. ' + source + ' The banner is unchanged.'
      : 'Choose Current pairing or Different banner with Scenery on to see this backdrop choice. Other scenery and banner artwork are unchanged.';
    const value = text + (storageAvailable ? ' Saved in this browser only.' : ' Storage is blocked; this choice still works in this tab.');
    if (note.textContent !== value) note.textContent = value;
  }
  function apply(mode) {
    selected = modes.has(mode) ? mode : 'original';
    if (selected === 'original') delete document.body.dataset.fmBackdrop;
    else if (document.body.dataset.fmBackdrop !== selected) document.body.dataset.fmBackdrop = selected;
    for (const button of buttons.children) button.setAttribute('aria-pressed', String(button.dataset.fmBackdropChoice === selected));
    context();
  }
  for (const [mode, label] of modes) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.fmBackdropChoice = mode; button.textContent = label;
    button.addEventListener('click', () => {
      try { localStorage.setItem(key, mode); } catch { storageAvailable = false; }
      apply(mode);
    });
    buttons.append(button);
  }
  group.append(legend, buttons, note); options.append(group); apply(selected);
  const observer = new MutationObserver(context); observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-scenery-mode'] });
  window.addEventListener('storage', event => { if (event.key === key && event.storageArea !== null) apply(event.newValue); });
})();
