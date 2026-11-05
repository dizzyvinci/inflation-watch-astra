'use strict';

;
/* Astra source: community.js */
try {
(() => {
  'use strict';
  const content = document.getElementById('content');
  const footer = document.querySelector('footer');
  if (!content || !footer || document.getElementById('view-privacy')) return;

  const footerLocked = footer.dataset.footerPrivacyLock === 'on';
  const footerStyles = ['clear', 'personal', 'emphasis'];
  const defaultFooterStyle = 'emphasis';
  const footerStyleKey = 'inflation-footer-style';
  footer.classList.add('community-footer');
  const footerStory = footer.querySelector('.footer-story');
  const footerSignature = footer.querySelector('.footer-signature');
  if (footerStory && footerSignature && !footer.querySelector('.footer-content')) {
    const responsibility = [...footerStory.children].find(node => node.tagName === 'P' && ['A shared responsibility to look out for one another can make this community stronger.', 'A shared responsibility to look out for one another.'].includes(node.textContent.trim()));
    if (responsibility) responsibility.textContent = 'A shared responsibility to look out for one another.';
    const reuse = [...footerStory.children].find(node => node.tagName === 'P' && node.querySelector('a[href="#privacy"]'));
    if (reuse) { reuse.classList.add('footer-reuse'); if (responsibility) responsibility.after(reuse); }
    const credits = [...footerStory.children].find(node => node.tagName === 'P' && (node.classList.contains('footer-credits') || node.textContent.startsWith('Estimates can be delayed or incomplete.')));
    const columns = document.createElement('div'); columns.className = 'footer-content';
    const author = document.createElement('aside'); author.className = 'footer-author';
    author.setAttribute('aria-label', 'About the author');
    footerStory.before(columns); columns.append(footerStory, author); author.append(footerSignature);
    if (credits) { credits.classList.add('footer-credits'); columns.after(credits); }
  }
  const footerBrand = footer.querySelector('.footer-brand');
  if (footerBrand) {
    const suffix = document.createElement('span'); suffix.className = 'footer-brand-suffix';
    const brandLogo=document.createElement('span');brandLogo.className='footer-brand-logo';brandLogo.setAttribute('aria-hidden','true');
    const brandWords=document.createElement('span');brandWords.className='footer-brand-words';brandWords.append(document.createTextNode('About inflation '),suffix);footerBrand.replaceChildren(brandLogo,brandWords);
    const syncFooterBrand = (detail = {}) => {
      const header = document.querySelector('header.masthead');
      const selected = (name, attribute, allowed, fallback) => [detail?.[name], document.body.dataset[attribute], header?.dataset[attribute]].find(value => allowed.includes(value)) ?? fallback;
      const typeface = selected('typeface', 'brandTypeface', ['sans', 'display', 'arcade', 'arcade-bold', 'pixel'], 'sans');
      const placement = selected('placement', 'brandPlacement', ['left', 'center'], 'left');
      const casing = selected('case', 'brandCase', ['lower', 'upper'], 'lower');
      for (const [key, value] of [['footerBrandTypeface', typeface], ['footerBrandPlacement', placement], ['footerBrandCase', casing]]) {
        if (footer.dataset[key] !== value) footer.dataset[key] = value;
      }
      const logo=selected('logo','brandLogo',['lemon-stack','lemon','pouch','leaf','scroll','none'],'lemon-stack');
      if(brandLogo.dataset.logo!==logo){brandLogo.dataset.logo=logo;brandLogo.replaceChildren();brandLogo.hidden=logo==='none';if(logo==='leaf'){const leaf=header?.querySelector('.brand-logo-maple');if(leaf){const copy=leaf.cloneNode(true);copy.removeAttribute('hidden');brandLogo.append(copy);}}else if(logo!=='none'){const image=document.createElement('img');image.alt='';image.src=logo==='lemon-stack'||logo==='lemon'?'assets/lemon-original-v1.png':logo==='scroll'?'assets/ap-reset-scroll.png':'assets/meso-pouch.png';image.width=52;image.height=52;brandLogo.append(image);if(logo==='lemon-stack'){const badge=document.createElement('span');badge.className='footer-brand-logo-badge';badge.textContent='999';brandLogo.append(badge);}}}
      const text = casing === 'upper' ? '. GG' : '. gg'; if (suffix.textContent !== text) suffix.textContent = text;
    };
    const brandChanged = event => syncFooterBrand(event.detail);
    document.addEventListener('astrabrandchange', brandChanged);
    window.addEventListener('astrabrandchange', brandChanged);
    syncFooterBrand();
  }
  if (!footerLocked) {
  const styleControls = document.createElement('div');
  styleControls.className = 'community-footer-styles';
  styleControls.setAttribute('role', 'group');
  styleControls.setAttribute('aria-label', 'Footer text style');
  const styleLabel = document.createElement('span');
  styleLabel.textContent = 'Footer text';
  styleControls.append(styleLabel);
  const descriptions = { clear: 'Clear: larger system text', personal: 'Personal: larger serif text with an italic introduction', emphasis: 'Emphasis: larger semibold text' };
  const applyFooterStyle = value => {
    footer.dataset.footerStyle = footerStyles.includes(value) ? value : defaultFooterStyle;
    for (const button of styleControls.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.footerStyleChoice === footer.dataset.footerStyle));
    }
  };
  for (const value of footerStyles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.footerStyleChoice = value;
    button.textContent = value[0].toUpperCase() + value.slice(1);
    button.setAttribute('aria-label', descriptions[value]);
    button.title = descriptions[value];
    button.addEventListener('click', () => {
      applyFooterStyle(value);
      try { localStorage.setItem(footerStyleKey, value); } catch { /* Display choices still work when storage is blocked. */ }
    });
    styleControls.append(button);
  }
  footer.append(styleControls);
  let savedFooterStyle;
  try { savedFooterStyle = localStorage.getItem(footerStyleKey); } catch { /* Use Emphasis without persistent storage. */ }
  applyFooterStyle(savedFooterStyle);
  }

  const invitation = [...(footerStory?.children || [])].find(node => node.tagName === 'P' && node.textContent.startsWith('Suggestions are welcome.'));
  const manipulation = footer.querySelector('.footer-manipulation');
  if (invitation || manipulation) {
    const copyOptions = document.createElement('div'); copyOptions.className = 'footer-copy-options';
    copyOptions.dataset.previewControls = 'true'; copyOptions.setAttribute('role','group'); copyOptions.setAttribute('aria-label','Footer wording');
    const copyKey = 'inflation-footer-invitation', warningKey = 'inflation-footer-manipulation';
    const invitationText = {
      full: 'Suggestions are welcome. You’re welcome to build on what’s useful to you from this site, share what you learn, and help fellow Maplers make informed decisions.',
      short: 'Suggestions are welcome. Share what you learn, build on what’s useful, and help fellow Maplers make informed decisions.',
    };
    let wording='full', warning=true;
    try { wording=localStorage.getItem(copyKey)==='short'?'short':'full'; warning=localStorage.getItem(warningKey)!=='off'; } catch {}
    const full = document.createElement('button'), short = document.createElement('button'), risk = document.createElement('button');
    for (const button of [full,short,risk]) button.type='button';
    full.textContent='Full invitation'; short.textContent='Short invitation';
    const update = () => {
      if(invitation) invitation.textContent=invitationText[wording];
      full.setAttribute('aria-pressed',String(wording==='full'));short.setAttribute('aria-pressed',String(wording==='short'));
      if(manipulation) manipulation.hidden=!warning;
      risk.textContent='Manipulation note: '+(warning?'On':'Off');risk.setAttribute('aria-pressed',String(warning));
    };
    for (const [button,choice] of [[full,'full'],[short,'short']]) button.addEventListener('click',()=>{wording=choice;try{localStorage.setItem(copyKey,choice)}catch{}update()});
    risk.addEventListener('click',()=>{warning=!warning;try{localStorage.setItem(warningKey,warning?'on':'off')}catch{}update()});
    if(invitation) copyOptions.append(full,short);if(manipulation) copyOptions.append(risk);
    footer.append(copyOptions);update();
  }

  const intro=footer.querySelector('.footer-intro');
  if(intro){const key='astra-footer-intro-underline-v1';let enabled=true;try{enabled=localStorage.getItem(key)!=='off'}catch{}const button=document.createElement('button');button.type='button';button.dataset.footerIntroUnderline='true';const apply=()=>{footer.dataset.introUnderline=enabled?'on':'off';button.textContent='Introduction underline: '+(enabled?'On':'Off');button.setAttribute('aria-pressed',String(enabled))};button.addEventListener('click',()=>{enabled=!enabled;try{localStorage.setItem(key,enabled?'on':'off')}catch{}apply()});footer.querySelector('.footer-copy-options')?.append(button);apply()}
  const arbitrage=footer.querySelector('.footer-arbitrage');
  if(arbitrage){const key='astra-footer-arbitrage-v1';let visible=false;try{visible=localStorage.getItem(key)==='on'}catch{}const group=footer.querySelector('.footer-copy-options');const button=document.createElement('button');button.type='button';button.dataset.footerArbitrage='true';const apply=()=>{arbitrage.hidden=!visible;button.textContent='Arbitrage note: '+(visible?'On':'Off');button.setAttribute('aria-pressed',String(visible))};button.addEventListener('click',()=>{visible=!visible;try{localStorage.setItem(key,visible?'on':'off')}catch{}apply()});group?.append(button);apply()}

  // These copy choices change only the explicitly approved phrase/thanks line.
  // Keep the original personal paragraph and signature nodes intact.
  const introduction = footerStory?.querySelector(':scope > p');
  let maplerNode = null;
  if (introduction) {
    const walker = document.createTreeWalker(introduction, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (/\b(?:a|one) Mapler\b/.test(node.nodeValue)) { maplerNode = node; break; }
    }
  }
  if (maplerNode || footerSignature) {
    let copyOptions = footer.querySelector('.footer-copy-options');
    if (!copyOptions) {
      copyOptions = document.createElement('div'); copyOptions.className = 'footer-copy-options';
      copyOptions.dataset.previewControls = 'true'; copyOptions.setAttribute('role', 'group'); copyOptions.setAttribute('aria-label', 'Footer wording'); footer.append(copyOptions);
    }
    if (maplerNode) {
      const wordKey = 'astra-footer-mapler-word-v1'; let word = 'one';
      try { if (localStorage.getItem(wordKey) === 'a') word = 'a'; } catch { /* Requested default remains one Mapler. */ }
      const group = document.createElement('span'); group.className = 'footer-mapler-options'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Personal introduction wording');
      const label = document.createElement('span'); label.textContent = 'Introduction'; group.append(label);
      const buttons = [];
      const update = () => {
        maplerNode.nodeValue = maplerNode.nodeValue.replace(/\b(?:a|one) Mapler\b/, word + ' Mapler');
        for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.footerMapler === word));
      };
      for (const value of ['one', 'a']) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.footerMapler = value; button.textContent = value + ' Mapler';
        button.addEventListener('click', () => { word = value; update(); try { localStorage.setItem(wordKey, word); } catch { /* Tab choice remains usable. */ } });
        buttons.push(button); group.append(button);
      }
      copyOptions.append(group); update();
    }
    if (footerSignature) {
      const walker = document.createTreeWalker(footerSignature, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) node.nodeValue = node.nodeValue.replace(/([—–-])\s*(DishWasher)/, '$1 $2');
      const thanks = document.createElement('span'); thanks.className = 'footer-thanks'; thanks.id = 'footer-special-thanks';
      thanks.textContent = 'A special thanks to my fellow Henehos that helped finalize this site, and to the broader Maple community as a whole for making the game so enjoyable in 2026';
      footerSignature.prepend(thanks, document.createTextNode('\n'));
      const thanksKey = 'astra-footer-thanks-v1'; let showThanks = true;
      try { showThanks = localStorage.getItem(thanksKey) !== 'off'; } catch { /* Requested preview default remains On. */ }
      const button = document.createElement('button'); button.type = 'button'; button.dataset.footerThanks = 'true'; button.setAttribute('aria-controls', thanks.id);
      const update = () => { thanks.hidden = !showThanks; button.textContent = 'Special thanks: ' + (showThanks ? 'On' : 'Off'); button.setAttribute('aria-pressed', String(showThanks)); };
      button.addEventListener('click', () => { showThanks = !showThanks; update(); try { localStorage.setItem(thanksKey, showThanks ? 'on' : 'off'); } catch { /* Tab choice remains usable. */ } });
      copyOptions.append(button); update();
    }
  }

  const reliability = footer.querySelector('.footer-reliability');
  if (reliability) {
    const note = document.createElement('p'); note.className = 'footer-basket-revisions'; note.id = 'footer-basket-revisions';
    note.textContent = 'As Maplers level up, reach new maps and find better drops, the economy’s representative items can change. Future basket revisions will document those changes, while preserving earlier basket definitions and histories.';
    reliability.append(note);
    const key = 'astra-footer-basket-revisions-v1'; let visible = true;
    try { visible = localStorage.getItem(key) !== 'off'; } catch { /* The note remains available without storage. */ }
    let options = footer.querySelector('.footer-copy-options');
    if (!options) { options = document.createElement('div'); options.className = 'footer-copy-options'; options.dataset.previewControls = 'true'; options.setAttribute('role', 'group'); options.setAttribute('aria-label', 'Footer wording'); footer.append(options); }
    const button = document.createElement('button'); button.type = 'button'; button.dataset.footerBasketRevisions = 'true'; button.setAttribute('aria-controls', note.id);
    const apply = () => { note.hidden = !visible; button.textContent = 'Basket revision note: ' + (visible ? 'On' : 'Off'); button.setAttribute('aria-pressed', String(visible)); };
    button.addEventListener('click', () => { visible = !visible; apply(); try { localStorage.setItem(key, visible ? 'on' : 'off'); } catch { /* Tab choice remains usable. */ } });
    options.append(button); apply();
  }

  if (introduction && maplerNode) {
    const match=/\b(?:a|one) Mapler\b/.exec(maplerNode.nodeValue);
    let tail = match && maplerNode.nodeValue.length>match.index+match[0].length ? maplerNode.splitText(match.index+match[0].length) : null;
    if (!tail) { const walker=document.createTreeWalker(introduction,NodeFilter.SHOW_TEXT);let after=false;for(let node=walker.nextNode();node;node=walker.nextNode()){if(node===maplerNode){after=true;continue;}if(after&&/^\s+that is also\b/.test(node.nodeValue)){tail=node;break;}} }
    if (tail && /^\s+that is also\b/.test(tail.nodeValue)) {
      const original=tail.nodeValue,br=document.createElement('br');br.className='footer-intro-break';
      const key='astra-footer-intro-layout-v1';let split=true;try{split=localStorage.getItem(key)!=='inline';}catch{}
      let options=footer.querySelector('.footer-copy-options');if(!options){options=document.createElement('div');options.className='footer-copy-options';options.dataset.previewControls='true';options.setAttribute('role','group');options.setAttribute('aria-label','Footer wording');footer.append(options);}
      const button=document.createElement('button');button.type='button';button.dataset.footerIntroLayout='true';
      const apply=()=>{if(split){tail.before(br);tail.nodeValue=original.replace(/^(\s*)that\b/,'$1That');}else{br.remove();tail.nodeValue=original;}button.textContent='Introduction: '+(split?'Split lines':'Inline');button.setAttribute('aria-pressed',String(split));};
      button.addEventListener('click',()=>{split=!split;apply();try{localStorage.setItem(key,split?'split':'inline')}catch{}});options.append(button);apply();
    }
  }

  const privacy = document.createElement('section');
  privacy.id = 'view-privacy';
  privacy.className = 'view community-privacy';
  privacy.hidden = true;
  privacy.setAttribute('aria-labelledby', 'privacy-title');
  privacy.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">YOUR VISIT / YOUR CHOICE</p><h1 id="privacy-title">Privacy</h1><p>Draft privacy note · Updated November 5, 2026</p></div></div>
    <article class="panel community-prose">
      <p>This note describes inflation.gg, maintained by DishWasher. There are no visitor accounts or ads. Optional Cloudflare browser performance metrics are On by default in this password-protected preview unless you saved Off. You can change that choice below.</p>
      <h2>Hosting and security</h2>
      <p>Cloudflare delivers and protects the site. Normal request metadata can include your IP address, browser information, requested URL and request time. Cloudflare may process that information and use security cookies to operate its services and prevent abuse. See <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare’s privacy policy</a> and <a href="https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/" target="_blank" rel="noopener noreferrer">cookie documentation</a>.</p>
      <p>Unlocking this private preview sets a Secure, HttpOnly, SameSite=Strict access cookie for up to eight hours. It authorizes this browser session; it is separate from the optional performance choice.</p>
      <p>I may review aggregate hosting counts to understand capacity and reliability. A request count is not a count of distinct visitors or people: one visit can request several files, and automated traffic can make requests too.</p>
      <h2>What stays in your browser</h2>
      <p>Your timezone, scenery, layout, portrait and footer text-style choices are saved in localStorage on this browser, along with an optional performance choice when you select one. Preview responses are marked private and no-store, and the former offline snapshot worker is retired. Previously downloaded files may remain in your browser. You can remove preferences and cached files through your browser’s site-data settings.</p>
      <h2>Contact and external links</h2>
      <p>The Contact box keeps an optional message in this tab; it does not submit or save that text to a server. Copy buttons write only what you choose to your clipboard. Opening Discord does not send a message or friend request. If you choose to contact me there, Discord handles that interaction under <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer">its own privacy policy</a>. Other outbound sites have their own policies too.</p>
      <h2>Market data is separate</h2>
      <p>Published market observations, item prices and source attribution describe the game economy. They are separate from website visitor information; this note does not replace the original market sources’ terms or policies.</p>
      <p>For questions about this note, <button type="button" class="community-inline-link" data-open-contact>contact Dish</button>. This is a description of the current build and hosting, not a guarantee that no data is processed.</p>
      <a class="community-back" href="#index">← Back to the dashboard</a>
    </article>`;
  if (footerLocked) {
    const paragraphs = privacy.querySelectorAll('.community-prose > p');
    if (paragraphs[0]) paragraphs[0].textContent = paragraphs[0].textContent.replace(', maintained by DishWasher', '');
    const contactNote = privacy.querySelector('[data-open-contact]')?.closest('p');
    if (contactNote) contactNote.textContent = 'Author contact details are temporarily hidden during API review. This note describes the current build and hosting; it is not a guarantee that no data is processed.';
    const contactHeading = [...privacy.querySelectorAll('h2')].find(n => n.textContent === 'Contact and external links');
    if (contactHeading) { contactHeading.textContent = 'External links'; if (contactHeading.nextElementSibling) contactHeading.nextElementSibling.textContent = 'External sources have their own privacy policies. No contact form operates in this review build.'; }
  }
  content.append(privacy);

  const comparison = document.createElement('section');
  comparison.id = 'view-market-comparison';
  comparison.className = 'view market-comparison';
  comparison.hidden = true;
  comparison.setAttribute('aria-labelledby', 'market-comparison-title');
  comparison.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">ONE VIEW / DIFFERENT QUESTIONS</p><h1 id="market-comparison-title">Goods, cash, and NX together.</h1><p>Compare scope, recorded activity and limitations without treating different units as one index.</p></div></div>
    <p class="notice" id="market-comparison-clock"></p><div class="market-comparison-cards" id="market-comparison-cards"></div>
    <article class="panel"><h2>The same activity window.</h2><p id="market-comparison-window"></p><div class="table-wrap" id="market-comparison-table" data-search-label="market comparison measures"></div><p id="market-comparison-activity"></p><p class="small muted">Recorded counts include all available daily rows in the stated window, including thin days; a daily price needs at least five recorded sales to qualify. Missing rows are not filled. Estimated turnover is Σ(daily median × recorded count), not exact trade values or meso supply.</p></article>
    <article class="panel market-comparison-method"><h2>What each measure does well—and misses.</h2><p><strong>Goods MPI:</strong> fixed reference expenditure weights make selected ordinary-item price changes comparable over time. The limited basket misses excluded goods, substitution and changes in gear quality.</p><p><strong>Cash Basket:</strong> the same price-index approach holds a known-price cash cohort fixed. Missing baseline items, monetized supply and cosmetic/upgrade mixtures limit its scope. Its normalized index is not an absolute NX quote.</p><p><strong>NX sale estimate:</strong> mesos divided by each item’s fixed NX cost gives an absolute conversion proxy. Daily recorded-volume weights reflect the observed trading mix, so composition changes can move it. Only same-day qualifying prices enter that day’s estimate; this is separate from the explorer’s chosen lookback.</p><h2>Is there enough data?</h2><p>The counts and observed-weight coverage above support dated, descriptive comparisons. Larger volume does not prove accuracy, independent traders or representative coverage of the entire game. The indices may carry earlier qualifying prices; the NX estimate requires at least three qualifying same-day cash items. None is a guaranteed executable quote or a confidence interval.</p><h2>Keep evidence types distinct.</h2><p>All three measures here use the same daily Free Market provider’s scanner-derived sale medians and recorded counts. These are source-inferred sales, not independently verified individual transactions; they are overlapping views, not three independent confirmations. Dated rolling item medians use different windows and roll labels. Smegas are seller asks and buyer bids with poster counts; NiaDB values are incomplete player-reported indicators. Those cross-checks remain separate from these calculations.</p><h2>Why no single pooled number?</h2><p>The goods and cash indices share a reference week of 100, but their basket weights differ. An NX ratio has different units. Averaging these numbers would have no defined market meaning. A combined goods/cash index would require a new explicit joint cohort and common base-expenditure weights, coverage rules and archived definition. The NX cohort already includes the cash-index members, so adding their counts would double-count those items.</p><p><a href="#basket">Goods definition and items →</a> · <a href="#cash-basket">Cash definition and fixed-mix equivalent →</a> · <a href="#nx">NX daily/rolling windows and other evidence →</a></p></article>`;
  content.append(comparison);
  const comparisonNav = document.createElement('a');
  comparisonNav.href = '#market-comparison'; comparisonNav.className = 'nav-link';
  comparisonNav.textContent = 'Compare';
  const nav = document.querySelector('nav');
  if (nav) nav.insertBefore(comparisonNav, nav.querySelector('.fallback-link'));
  for (const id of ['view-cash-basket', 'view-nx']) {
    const view = document.getElementById(id);
    if (!view) continue;
    const link = document.createElement('a');
    link.href = '#market-comparison'; link.className = 'market-comparison-link';
    link.textContent = 'Compare goods, cash, and NX together →';
    (view.querySelector('.page-heading') || view).append(link);
  }

  if (!footerLocked) {
  const dialog = document.createElement('dialog');
  dialog.id = 'contact-dialog';
  dialog.className = 'community-contact';
  dialog.setAttribute('aria-labelledby', 'contact-title');
  dialog.setAttribute('aria-describedby', 'contact-guidance');
  dialog.innerHTML = `
    <button type="button" class="dialog-close" id="close-contact" aria-label="Close contact">×</button>
    <p class="eyebrow gold">A NOTE TO DISH</p>
    <h2 id="contact-title">Hey, it’s Dish 👨‍🍳. What’s on your mind?</h2>
    <p class="small muted">Your Mapler: <strong>DishWasher</strong></p>
    <p id="contact-guidance">Copy my username, then add me in Discord. Your optional message stays in this tab unless you copy it.</p>
    <div class="community-username"><strong id="contact-username">@dizzyvinci</strong><button type="button" class="secondary" id="copy-contact-username">Copy username</button></div>
    <label for="contact-message">Your message <span class="muted">(optional)</span></label>
    <textarea id="contact-message" rows="5" maxlength="2000" autocomplete="off" placeholder="A question, an idea, or something you noticed…"></textarea>
    <div class="community-actions"><button type="button" class="secondary" id="copy-contact-message" disabled>Copy optional message</button><a class="secondary community-discord" href="https://discord.com/channels/@me" target="_blank" rel="noopener noreferrer">Open Discord ↗</a></div>
    <p class="small muted">In Discord, open Friends → Add Friend and enter <strong>dizzyvinci</strong>. You choose whether to send a request or message. <a href="https://support.discord.com/hc/en-us/articles/218344397-How-do-I-add-friends-on-Discord" target="_blank" rel="noopener noreferrer">Discord’s instructions ↗</a></p>
    <p id="contact-feedback" class="community-feedback" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);

  const contact = document.createElement('button');
  contact.type = 'button';
  contact.id = 'open-contact';
  contact.className = 'community-footer-button';
  contact.textContent = 'Contact';
  (footer.querySelector('.footer-links') || footer).append(contact);

  const message = document.getElementById('contact-message');
  const copyMessage = document.getElementById('copy-contact-message');
  const feedback = document.getElementById('contact-feedback');
  let opener = null;
  const openContact = trigger => {
    opener = trigger;
    feedback.textContent = '';
    if (!dialog.open) dialog.showModal();
  };
  contact.addEventListener('click', () => openContact(contact));
  privacy.querySelector('[data-open-contact]').addEventListener('click', event => openContact(event.currentTarget));
  document.getElementById('close-contact').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => opener?.focus());
  message.addEventListener('input', () => {
    copyMessage.disabled = !message.value.trim();
    feedback.textContent = '';
  });
  const copy = async (value, success) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      feedback.textContent = success;
    } catch {
      feedback.textContent = 'Couldn’t copy automatically. Select and copy @dizzyvinci or your message here, then paste it in Discord.';
    }
  };
  document.getElementById('copy-contact-username').addEventListener('click', () => {
    // Discord expects the exact username; @ is a display convention only.
    void copy('dizzyvinci', 'Username copied: dizzyvinci. Add me in Discord when you’re ready.');
  });
  copyMessage.addEventListener('click', () => {
    if (message.value.trim()) void copy(message.value, 'Message copied. Paste it in Discord when you’re ready.');
  });
  }
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "community.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: preview-runtime.js */
try {
(() => {
  'use strict';
  if (window.astraPreviewSession) return;
  const footer = document.querySelector('footer');
  const root = new URL('./', location.href);
  const workerUrl = new URL('sw.js', root).href;
  let form;
  function showLock() {
    if (!footer || form) return;
    form = document.createElement('form');
    form.className = 'preview-session';
    form.method = 'post';
    form.action = new URL('__preview_logout', root).href;
    const label = document.createElement('span');
    label.textContent = 'Password-protected preview';
    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Lock preview';
    form.append(label, button);
    footer.append(form);
  }
  function lockDocument() {
    document.documentElement.dataset.previewLocked = 'true';
    document.body.hidden = true;
    location.reload();
  }
  window.astraPreviewSession = {
    onResponse(response) {
      if (response?.headers?.get?.('X-Astra-Preview') !== 'password') return true;
      if (response.status === 401) { lockDocument(); return false; }
      if (response.ok) showLock();
      return true;
    },
  };
  const retire = async () => {
    if (navigator.serviceWorker?.getRegistrations) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(registrations.filter(registration =>
        registration.scope === root.href && ['active', 'waiting', 'installing'].some(state =>
          registration[state]?.scriptURL === workerUrl)).map(registration => registration.unregister()));
    }
  };
  // Keep display preferences and cookies; remove only this project's old offline shell.
  retire().catch(() => {});
  if (window.caches?.keys) window.caches.keys().then(names => Promise.allSettled(
    names.filter(name => name.startsWith('inflation-watch-shell-')).map(name => window.caches.delete(name)))).catch(() => {});
  window.addEventListener('pageshow', event => {
    if (event.persisted && form) lockDocument();
  });
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "preview-runtime.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: privacy-controls.js */
try {
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
    if (intro) intro.textContent = (footer.dataset.footerPrivacyLock === 'on' ? 'This note describes inflation.gg.' : 'This note describes inflation.gg, maintained by DishWasher.') + ' There are no visitor accounts or ads. Optional Cloudflare browser metrics are On by default in this password-protected preview unless you saved Off. The controls below explain the data and let you turn them Off or On.';
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

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "privacy-controls.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: author-portrait.js */
try {
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
  options.append(feedback);
  panel.append(figure, signature, options);
  let saved;
  try { saved = localStorage.getItem(preferenceKey); } catch { /* The display remains usable without storage. */ }
  select(saved);
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "author-portrait.js", status: "initialization_failed"}})); } catch {}
}
