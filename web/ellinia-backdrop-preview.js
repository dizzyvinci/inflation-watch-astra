(() => {
  'use strict';
  const host = document.getElementById('scenery-options');
  if (!host || document.getElementById('ellinia-backdrop-options')) return;
  const key = 'astra-ellinia-backdrop-v1';
  const choices = [['current', 'Current map'], ['bright', 'Brighter map'], ['soft', 'Softer map'], ['framed', 'Framed original']];
  let selected = 'current';
  try { const saved = localStorage.getItem(key); if (choices.some(([value]) => value === saved)) selected = saved; } catch { /* Current map remains the default. */ }
  const group = document.createElement('fieldset'); group.id = 'ellinia-backdrop-options'; group.className = 'ellinia-backdrop-options'; group.dataset.previewControls = 'true';
  const legend = document.createElement('legend'); legend.textContent = 'Ellinia backdrop'; group.append(legend);
  const buttons = document.createElement('div'); buttons.className = 'ellinia-backdrop-buttons'; group.append(buttons);
  const note = document.createElement('small'); note.id = 'ellinia-backdrop-note'; note.textContent = 'Applies to Different backdrop only. Original Maple artwork; the banner and other scenery stay the same.'; group.setAttribute('aria-describedby', note.id);
  const apply = () => {
    document.body.dataset.elliniaBackdrop = selected;
    for (const button of buttons.children) button.setAttribute('aria-pressed', String(button.dataset.elliniaBackdropChoice === selected));
  };
  for (const [value, label] of choices) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.elliniaBackdropChoice = value; button.textContent = label;
    button.addEventListener('click', () => { selected = value; apply(); try { localStorage.setItem(key, value); } catch { /* The choice still works in this tab. */ } }); buttons.append(button);
  }
  group.append(note); host.append(group); apply();
})();
