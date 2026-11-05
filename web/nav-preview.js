(() => {
  'use strict';
  const navigation = document.querySelector('.nav-wrap nav') || document.querySelector('nav');
  const options = document.getElementById('display-options');
  if (!navigation || !options || document.getElementById('nav-preview-options')) return;
  const targets = [['basket', 'The Basket', '#basket'], ['cash-basket', 'Cash Basket', '#cash-basket']]
    .map(([key, label, hash]) => ({ key, label, link: [...navigation.querySelectorAll('a.nav-link')].find(link => link.hash === hash) })).filter(target => target.link);
  if (!targets.length) return;
  const group = document.createElement('fieldset'); group.id = 'nav-preview-options'; group.className = 'nav-preview-options'; group.dataset.previewControls = 'true';
  const legend = document.createElement('legend'); legend.textContent = 'Basket navigation preview'; group.append(legend);
  for (const target of targets) {
    const key = 'astra-nav-' + target.key + '-visible-v1'; let visible = false;
    try { visible = localStorage.getItem(key) === 'on'; } catch { /* The requested preview default stays Off. */ }
    const button = document.createElement('button'); button.type = 'button'; button.dataset.previewNav = target.key;
    target.link.classList.add('nav-preview-target');
    const apply = () => { target.link.hidden = !visible; button.setAttribute('aria-pressed', String(visible)); button.textContent = target.label + ' link: ' + (visible ? 'On' : 'Off'); };
    button.addEventListener('click', () => { visible = !visible; apply(); try { localStorage.setItem(key, visible ? 'on' : 'off'); } catch { /* Tab choice still works. */ } });
    group.append(button); apply();
  }
  const note = document.createElement('small'); note.textContent = 'Navigation links only. Both pages, direct links, history and methodology stay available. Saved in this browser.'; group.append(note); options.append(group);
})();
