(() => {
  'use strict';
  const options = document.getElementById('display-options');
  if (!options || !document.querySelector('.hero-art') || document.getElementById('banner-art-options')) return;
  const key = 'astra-banner-art';
  const modes = new Map([['paired', 'Follow scenery pairing'], ['free-market', 'Free Market'], ['henesys', 'Henesys'], ['zakum', 'Zakum'], ['zakum-set', 'Zakum · Helmet effect'], ['lantern', 'Lantern Market']]);
  const group = document.createElement('div');
  group.id = 'banner-art-options'; group.className = 'banner-art-options';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Banner artwork');
  const title = document.createElement('span'); title.textContent = 'Banner artwork'; group.append(title);
  const choose = value => {
    const selected = modes.has(value) ? value : 'zakum-set';
    document.body.dataset.bannerArt = selected;
    for (const button of group.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.bannerArtChoice === selected));
  };
  for (const [mode, label] of modes) {
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.bannerArtChoice = mode; button.textContent = label;
    button.setAttribute('aria-controls', 'rate-section');
    button.addEventListener('click', () => {
      choose(mode);
      try { localStorage.setItem(key, mode); } catch { /* Usable in this tab without storage. */ }
    });
    group.append(button);
  }
  const note = document.createElement('small');
  note.textContent = 'Independent of the page backdrop. Zakum and Lantern Market are decorative fan illustrations; the cyan/purple motif references the original Zakum Helmet equipment effect.';
  group.append(note); options.append(group);
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Use the approved helmet-effect banner. */ }
  choose(saved);
})();
