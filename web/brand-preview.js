(() => {
  'use strict';
  if (document.getElementById('brand-preview-options')) return;
  const masthead = document.querySelector('header.masthead');
  const brand = masthead?.querySelector('a.brand');
  const suffix = brand?.querySelector('.brand-watch');
  const copy = suffix?.parentElement;
  const options = document.getElementById('display-options');
  if (!masthead || !brand || !suffix || !copy || !options) return;

  const choices = {
    typeface: [['sans', 'Bold sans'], ['display', 'Upright display'], ['arcade', 'Arcade mono'], ['arcade-bold', 'Arcade mono · Bold'], ['pixel', 'Pixel font']],
    placement: [['left', 'Left'], ['center', 'Center']],
    case: [['lower', '.gg'], ['upper', '.GG']],
    logo: [['lemon-stack', 'Lemon · 999 quickslot'], ['lemon', 'Lemon'], ['pouch', 'Pouch'], ['leaf', 'Maple leaf'], ['scroll', 'Scroll'], ['none', 'Wordmark only']],
    tagline: [['harnessed', 'Harnessed'], ['checked', 'Kept in check'], ['measured', 'Measured'], ['count', 'Every meso'], ['number', 'Put a number on it']],
  };
  const defaults = { typeface: 'arcade', placement: 'center', case: 'lower', logo: 'lemon-stack', tagline: 'harnessed' };
  const labels = { typeface: 'Wordmark typography', placement: 'Wordmark placement', case: 'Wordmark suffix', logo: 'Wordmark logo', tagline: 'Wordmark tagline' };
  const state = { ...defaults };
  const controls = document.createElement('fieldset');
  controls.id = 'brand-preview-options';
  controls.className = 'brand-preview-controls';
  const legend = document.createElement('legend');
  legend.textContent = 'Wordmark';
  controls.append(legend);
  masthead.classList.add('brand-preview-masthead');
  copy.classList.add('brand-wordmark-copy');
  const logo = brand.querySelector('.brand-leaf'), logoImage = logo?.querySelector('img');
  const stackBadge=document.createElement('span');stackBadge.className='brand-stack-count';stackBadge.textContent='999';stackBadge.setAttribute('aria-hidden','true');logo?.append(stackBadge);
  // Reuse the site's original leaf drawing without its favicon background box.
  const mapleLeaf = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mapleLeaf.setAttribute('viewBox', '0 0 32 32'); mapleLeaf.setAttribute('aria-hidden', 'true'); mapleLeaf.setAttribute('focusable', 'false'); mapleLeaf.classList.add('brand-logo-maple');
  const leafPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); leafPath.setAttribute('d', 'm16 4 3 8 7-2-3 7 5 4-10 3-2 5-1-6-10-3 5-5-2-7 6 4Z'); leafPath.setAttribute('fill', 'currentColor'); mapleLeaf.append(leafPath); logo?.append(mapleLeaf);


  const apply = () => {
    document.body.dataset.brandTypeface = state.typeface;
    document.body.dataset.brandPlacement = state.placement;
    document.body.dataset.brandCase = state.case;
    masthead.dataset.brandTypeface = state.typeface;
    masthead.dataset.brandPlacement = state.placement;
    masthead.dataset.brandCase = state.case;
    masthead.dataset.brandLogo = state.logo;
    const tagline = copy.querySelector('small'); if (tagline) tagline.textContent = { harnessed: 'The Maple Classic World economy, harnessed.', checked: 'The Maple Classic World economy, kept in check.', measured: 'The Maple Classic World economy, measured.', count: 'Make every meso count.', number: 'Put a number on your mesos.' }[state.tagline];
    if (tagline) {
      const text=tagline.textContent,accent={harnessed:'harnessed',checked:'kept in check',measured:'measured',count:'count',number:'number'}[state.tagline];
      const at=text.lastIndexOf(accent);if(at>=0){const strong=document.createElement('strong');strong.className='brand-tagline-accent';strong.textContent=accent;tagline.replaceChildren(document.createTextNode(text.slice(0,at)),strong,document.createTextNode(text.slice(at+accent.length)));}
    }
    masthead.dataset.brandTagline = state.tagline;
    if (logo && logoImage) {
      logo.hidden = state.logo === 'none';
      logoImage.hidden = state.logo === 'leaf'; mapleLeaf.toggleAttribute('hidden', state.logo !== 'leaf');
      stackBadge.hidden=state.logo!=='lemon-stack';
      if (['lemon-stack','lemon','pouch','scroll'].includes(state.logo)) {
        const src = state.logo.startsWith('lemon') ? 'assets/lemon-original-v1.png' : state.logo === 'scroll' ? 'assets/ap-reset-scroll.png' : 'assets/meso-pouch.png';
        if (logoImage.getAttribute('src') !== src) logoImage.src = src;
      }
      // The adjacent wordmark supplies the accessible brand name; art is decorative.
      logoImage.alt = '';
    }

    suffix.textContent = state.case === 'upper' ? '. GG' : '. gg';
    for (const button of controls.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(state[button.dataset.brandSetting] === button.dataset.brandChoice));
    }
    document.dispatchEvent(new CustomEvent('astrabrandchange', { detail: { ...state } }));
  };
  for (const [setting, values] of Object.entries(choices)) {
    try {
      const saved = localStorage.getItem('astra-brand-' + setting);
      if (values.some(([value]) => value === saved)) state[setting] = saved;
    } catch { /* A blocked preference store must not disable the display choices. */ }
    const group = document.createElement('div');
    group.className = 'brand-preview-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', labels[setting]);
    const label = document.createElement('span');
    label.textContent = labels[setting].replace('Wordmark ', '');
    group.append(label);
    for (const [value, title] of values) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.brandSetting = setting;
      button.dataset.brandChoice = value;
      button.textContent = title;
      button.setAttribute('aria-label', labels[setting] + ': ' + title);
      button.addEventListener('click', () => {
        state[setting] = value;
        apply();
        try { localStorage.setItem('astra-brand-' + setting, value); } catch { /* The current tab remains usable. */ }
      });
      group.append(button);
    }
    controls.append(group);
  }
  const note = document.createElement('small');
  note.textContent = 'Wordmark and preview controls · saved in this browser. The self-hosted pixel font loads only when selected. Other choices use system fonts. ';
  const fontLicense = document.createElement('a'); fontLicense.href = 'assets/PixelifySans-OFL.txt'; fontLicense.textContent = 'Pixel font license'; note.append(fontLicense);
  controls.append(note);
  options.append(controls);
  apply();
})();
