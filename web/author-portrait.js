(() => {
  'use strict';
  const footer = document.querySelector('footer');
  const signature = footer?.querySelector('.footer-signature');
  if (!signature || document.getElementById('author-portrait')) return;

  const version = 'v2';
  const preferenceKey = 'inflation-author-portrait-' + version;
  const defaultMode = 'transparent-large';
  const portraits = Object.freeze({
    original: Object.freeze({ label: 'Original', src: '/assets/dishwasher-original-v2.png',
      alt: 'Original game screenshot of DishWasher’s MapleStory character, including the nameplate.' }),
    transparent: Object.freeze({ label: 'Transparent', src: '/assets/dishwasher-transparent-v2.png',
      alt: 'Transparent cutout of DishWasher’s MapleStory character.' }),
    'transparent-large': Object.freeze({ label: 'Large transparent', src: '/assets/dishwasher-transparent-v2.png',
      alt: 'Large transparent cutout of DishWasher’s MapleStory character.' }),
    pixelart: Object.freeze({ label: 'Pixelart', src: '/assets/dishwasher-pixel-v2.png',
      alt: 'Pixel-art rendering of DishWasher’s MapleStory character.' }),
  });
  const chef = /\u{1F468}\u200D\u{1F373}/gu;
  const signatureNodes = [];
  const walker = document.createTreeWalker(signature, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const original = node.nodeValue, stripped = original.replace(chef, '');
    if (stripped !== original) signatureNodes.push({ node, original, stripped });
  }
  const setChef = visible => {
    for (const mark of signatureNodes) {
      const expected = visible ? mark.stripped : mark.original;
      if (mark.node.isConnected && mark.node.nodeValue === expected) mark.node.nodeValue = visible ? mark.original : mark.stripped;
    }
  };

  const panel = document.createElement('section');
  panel.id = 'author-portrait'; panel.className = 'author-portrait'; panel.dataset.portraitVersion = version;
  panel.setAttribute('aria-label', 'Author portrait');
  const figure = document.createElement('figure'); figure.className = 'author-portrait-figure';
  const frame = document.createElement('div'); frame.className = 'author-portrait-frame'; frame.hidden = true;
  const caption = document.createElement('figcaption'); caption.textContent = 'Author portrait';
  figure.append(frame, caption);
  const options = document.createElement('div'); options.className = 'author-portrait-options';
  options.setAttribute('role', 'group'); options.setAttribute('aria-label', 'Choose author portrait version');
  const feedback = document.createElement('p'); feedback.className = 'author-portrait-feedback';
  feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  const buttons = [];
  let generation = 0;

  function select(value, persist = false) {
    const mode = Object.hasOwn(portraits, value) ? value : defaultMode, portrait = portraits[mode], current = ++generation;
    panel.dataset.portraitMode = mode;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.authorPortrait === mode));
    let saved = true;
    if (persist) {
      try { localStorage.setItem(preferenceKey, mode); }
      catch { saved = false; }
    }
    frame.hidden = true;
    setChef(true);
    feedback.textContent = 'Loading ' + portrait.label.toLowerCase() + ' portrait…';
    const image = document.createElement('img');
    image.className = 'author-portrait-image'; image.dataset.portraitMode = mode;
    image.alt = portrait.alt; image.width = 220; image.height = 220; image.decoding = 'async';
    // Exactly one chosen source is assigned. There is no preload or hidden gallery.
    image.addEventListener('load', () => {
      if (current !== generation || !image.isConnected) return;
      frame.hidden = false;
      setChef(false);
      feedback.textContent = portrait.label + ' portrait shown.' + (saved ? '' : ' This choice applies in this tab; browser storage is unavailable.');
    });
    image.addEventListener('error', () => {
      if (current !== generation || !image.isConnected) return;
      frame.hidden = true;
      setChef(true);
      feedback.textContent = portrait.label + ' portrait is unavailable. The original signature is retained.';
    });
    frame.replaceChildren(image);
    image.src = portrait.src;
  }

  for (const [value, portrait] of Object.entries(portraits)) {
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.authorPortrait = value; button.textContent = portrait.label;
    button.addEventListener('click', () => select(value, true));
    buttons.push(button); options.append(button);
  }
  const author = footer.querySelector('.footer-author');
  if (author) author.append(panel);
  else signature.before(panel);
  panel.append(figure, signature, feedback, options);
  let saved;
  try { saved = localStorage.getItem(preferenceKey); } catch { /* The display remains usable without storage. */ }
  select(saved);
})();
