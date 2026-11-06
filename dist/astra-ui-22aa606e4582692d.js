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
      <p data-privacy-browser-storage>Your timezone, scenery, layout, portrait and footer text-style choices are saved in localStorage on this browser, along with an optional performance choice when you select one. Preview responses are marked private and no-store, and the former offline snapshot worker is retired. Previously downloaded files may remain in your browser. You can remove preferences and cached files through your browser’s site-data settings.</p>
      <h2>Contact and external links</h2>
      <p>The Contact box keeps an optional message in this tab; it does not submit or save that text to a server. Copy buttons write only what you choose to your clipboard. Opening Discord does not send a message or friend request. If you choose to contact me there, Discord handles that interaction under <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer">its own privacy policy</a>. Other outbound sites have their own policies too.</p>
      <h2>Market data is separate</h2>
      <p>Published market observations, item prices and source attribution describe the game economy. They are separate from website visitor information; this note does not replace the original market sources’ terms or policies.</p>
      <p>For questions about this note, <button type="button" class="community-inline-link" data-open-contact>contact Dish</button>. This is a description of the current build and hosting, not a guarantee that no data is processed.</p>
      <a class="community-back" href="#index">← Back to the dashboard</a>
    </article>`;
  if (footerLocked) {
    const paragraphs = privacy.querySelectorAll('.community-prose > p');
    if (paragraphs[0]) paragraphs[0].textContent = 'This note describes inflation.gg. There are no visitor accounts or ads. Optional Cloudflare browser performance metrics are On by default in this review preview unless you saved Off. You can change that choice below.';
    const unlockNote=[...paragraphs].find(p=>p.textContent.startsWith('Unlocking this private preview'));
    if(unlockNote)unlockNote.textContent='Design controls require a password confirmation and unlock only for the current tab. This page does not store the password or an unlock flag in browser storage; refreshing or relocking hides the controls again.';
    const storageNote = privacy.querySelector('[data-privacy-browser-storage]');
    if (storageNote) storageNote.textContent = 'Your saved display and optional performance choices stay in this browser’s localStorage. Versioned public interface and market files may also remain in the browser’s private HTTP cache to reduce repeat downloads. Pages, mutable status responses and password-control responses remain private and no-store. This caching does not create a visitor account or change your optional performance choice. The former offline snapshot worker is retired. Previously downloaded files may remain; you can remove preferences and cached files through your browser’s site-data settings.';
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
  const reviewMarkup=footer.dataset.footerPrivacyLock==='on',previewLabel=reviewMarkup?'review preview':'password-protected preview';
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
    message = fromPreviewDefault ? 'This '+previewLabel+' defaults to On. Loading the disclosed Cloudflare metrics; choose Off to disable them.'
      : savedConsent ? 'Restoring your saved On choice. Loading optional Cloudflare metrics.' : 'Your choice is on. Loading optional Cloudflare metrics.';
    update();
    loading = (async () => {
      try {
        // Saved/forced Off never reaches this request. A default is not stored
        // as if the visitor explicitly selected On.
        const response = await window.fetch('/analytics-config.json', {
          cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) throw new Error(reviewMarkup?'Review analytics configuration is unavailable; optional metrics remain Off.':'Unlock this site again before enabling optional metrics.');
        if (!response.ok) throw new Error('Optional analytics configuration is unavailable.');
        const serverPreview=response.headers?.get?.('x-astra-preview');
        if (fromPreviewDefault && !(serverPreview==='password'||reviewMarkup&&serverPreview==='review')) {
          throw new Error('The On default requires a server-confirmed review or password preview.');
        }
        const contentType = response.headers?.get?.('content-type');
        if (contentType && !/\bapplication\/(?:[a-z0-9.+-]*\+)?json\b/i.test(contentType)) {
          throw new Error(reviewMarkup?'Configuration is not JSON; optional metrics remain Off.':'Configuration is not JSON; unlock this site again if your session expired.');
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
    const explanation = make('p', 'privacy-choice-description', 'With On, Cloudflare may process page views, visited/referring URLs, device and browser information, and performance measurements. This '+previewLabel+' defaults to On unless you saved Off. Prices, market feeds and features work in either mode.');
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
    if (intro) intro.textContent = (reviewMarkup ? 'This note describes inflation.gg.' : 'This note describes inflation.gg, maintained by DishWasher.') + ' There are no visitor accounts or ads. Optional Cloudflare browser metrics are On by default in this '+previewLabel+' unless you saved Off. The controls below explain the data and let you turn them Off or On.';
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

;
/* Astra source: full-market-client.js */
try {
(()=>{
'use strict';
// Lazy own-site catalog client; source projections remain version-bound.
// No DOM, provider access, search-query transmission or storage.
const SOURCE = 'https://maplestory-classic.com/market.json';
const SCOPE = 'public_daily_developer_feed_collection';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
const HASH_METHOD='mcat-typed-utf8-f64-v1';
const positive = n => Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER;
const count = n => Number.isSafeInteger(n) && n >= 0;
const id = n => Number.isSafeInteger(n) && n > 0;
const day = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d+'T00:00:00Z')) && new Date(d+'T00:00:00Z').toISOString().slice(0,10) === d;
const stamp = d => typeof d === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(d) && Number.isFinite(Date.parse(d));
const text = (s,n) => typeof s === 'string' && s.trim().length > 0 && s.length <= n && !/[\u0000-\u001f]/.test(s);
const slug = s => typeof s === 'string' && s.length <= 200 && SLUG.test(s);
const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; };
class CatalogError extends Error { constructor(code,message) { super(message); this.code=code; } }
const require = (valid,message,code='INVALID_CATALOG') => { if (!valid) throw new CatalogError(code,message); };
function context(raw,kind) {
  require(raw?.schemaVersion===1 && raw.kind===kind && raw.sourceScope===SCOPE && raw.sourceUrl===SOURCE && raw.minimumDailyCount===5,'Wrong source, schema, grain or qualification contract');
  require(stamp(raw.sourceUpdatedAt) && day(raw.sourceUtcDay) && new Date(raw.sourceUpdatedAt).toISOString().slice(0,10)===raw.sourceUtcDay && raw.hashMethod===HASH_METHOD && HASH.test(raw.sourceProjectionHash) && HASH.test(raw.catalogHash),'Invalid source clock, hash method or catalog hashes');
}
function brief(raw,sourceDay) {
  require(slug(raw?.slug) && text(raw.name,200) && text(raw.category,120) && (raw.canonicalId===null || id(raw.canonicalId)),'Invalid exact identity');
  for (const key of ['historyDays','qualifyingDays','thinDays','zeroCountDays']) require(count(raw[key]),'Invalid history coverage');
  require(raw.historyDays===raw.qualifyingDays+raw.thinDays+raw.zeroCountDays,'History coverage does not add up');
  const qualified=raw.price!==null;
  require(qualified ? positive(raw.price) && day(raw.priceDay) && raw.priceDay<=sourceDay && count(raw.quantity) && raw.quantity>=5 && raw.qualifyingDays>0 : raw.priceDay===null && raw.quantity===null && raw.qualifyingDays===0,'Qualified daily price cannot be replaced by a summary or thin observation');
  require(raw.publisherMedian===null || positive(raw.publisherMedian),'Invalid separately published summary median');
  require(raw.carried===(qualified && raw.priceDay<sourceDay) && raw.partial===(qualified && raw.priceDay===sourceDay),'Incorrect carried/partial flags');
  return Object.fromEntries(['slug','name','category','canonicalId','price','priceDay','quantity','publisherMedian','historyDays','qualifyingDays','thinDays','zeroCountDays','carried','partial'].map(k=>[k,raw[k]]));
}
function validateIndex(raw) {
  context(raw,'daily_market_search_index');
  require(Array.isArray(raw.rows) && raw.rows.length<=10000 && raw.itemCount===raw.rows.length,'Invalid item count');
  require(raw.priceKinds?.price==='latest_qualified_daily_median' && raw.priceKinds?.publisherMedian==='unspecified_window_source_summary','Mixed price bases');
  const rows=raw.rows.map(row=>brief(row,raw.sourceUtcDay)),slugs=new Set(),ids=new Set();
  for (const row of rows) { require(!slugs.has(row.slug),'Duplicate source slug'); slugs.add(row.slug); if(row.canonicalId!==null){require(!ids.has(row.canonicalId),'Ambiguous reviewed item ID');ids.add(row.canonicalId);} }
  require(raw.coverage?.withQualifiedDailyPrice===rows.filter(r=>r.price!==null).length && raw.coverage?.withoutQualifiedDailyPrice===rows.filter(r=>r.price===null).length,'Incorrect qualification totals');
  return freeze({schemaVersion:1,kind:raw.kind,sourceScope:SCOPE,sourceUrl:SOURCE,sourceUpdatedAt:raw.sourceUpdatedAt,sourceUtcDay:raw.sourceUtcDay,hashMethod:HASH_METHOD,sourceProjectionHash:raw.sourceProjectionHash,catalogHash:raw.catalogHash,minimumDailyCount:5,itemCount:rows.length,coverage:{...raw.coverage},rows});
}
function validateDetail(raw,index,expectedSlug) {
  context(raw,'daily_market_item_detail');
  require(raw.hashMethod===index.hashMethod && raw.catalogHash===index.catalogHash && raw.sourceProjectionHash===index.sourceProjectionHash && raw.sourceUpdatedAt===index.sourceUpdatedAt,'Index/detail versions differ','VERSION_MISMATCH');
  const row=index.rows.find(r=>r.slug===expectedSlug); require(row,'Unknown exact provider slug','NOT_FOUND');
  const identity=brief(raw,index.sourceUtcDay);require(identity.slug===row.slug && identity.name===row.name && identity.canonicalId===row.canonicalId && identity.category===row.category,'Detail identity differs from the selected record');
  for(const key of ['price','priceDay','quantity','publisherMedian','historyDays','qualifyingDays','thinDays','zeroCountDays','carried','partial'])require(identity[key]===row[key],'Index/detail price or coverage differs');
  require(raw.historyDatePrecision==='UTC_calendar_day' && Array.isArray(raw.history) && raw.history.length===row.historyDays && raw.history.length<=10000,'Invalid daily-history contract');
  let previous='';const history=raw.history.map(p=>{require(day(p.day)&&p.day>previous&&p.day<=index.sourceUtcDay&&positive(p.median)&&count(p.recordedCount),'Invalid/duplicate/future source day');previous=p.day;require(p.qualified===(p.recordedCount>=5)&&p.quality===(p.recordedCount>=5?'qualified':p.recordedCount>0?'thin':'zero_count')&&p.partial===(p.day===index.sourceUtcDay),'Thin/zero-count record mislabeled as qualified');return {day:p.day,median:p.median,recordedCount:p.recordedCount,qualified:p.qualified,quality:p.quality,partial:p.partial};});
  const qualified=history.filter(p=>p.qualified),latest=qualified.at(-1);
  require(qualified.length===row.qualifyingDays && history.filter(p=>p.recordedCount>0&&p.recordedCount<5).length===row.thinDays && history.filter(p=>p.recordedCount===0).length===row.zeroCountDays && (latest?latest.median===row.price&&latest.day===row.priceDay&&latest.recordedCount===row.quantity:row.price===null),'Qualified price does not match its actual retained source day');
  require(raw.sourceSummary?.kind==='source_published_summary' && raw.sourceSummary.window==='unspecified_source_summary' && raw.sourceSummary.sourceUpdatedAt===index.sourceUpdatedAt,'Missing separate source-summary basis');
  const summary={kind:'source_published_summary',window:'unspecified_source_summary',sourceUpdatedAt:index.sourceUpdatedAt};
  for(const key of ['medianSale','p25','p75','lowSale','highSale','medianSellerAsk'])summary[key]=positive(raw.sourceSummary[key])?raw.sourceSummary[key]:null;
  for(const key of ['listings','sellers'])summary[key]=count(raw.sourceSummary[key])?raw.sourceSummary[key]:null;
  summary.sellThrough=Number.isFinite(raw.sourceSummary.sellThrough)&&raw.sourceSummary.sellThrough>=0&&raw.sourceSummary.sellThrough<=1?raw.sourceSummary.sellThrough:null;
  summary.reportedLastSaleAt=stamp(raw.sourceSummary.reportedLastSaleAt)?raw.sourceSummary.reportedLastSaleAt:null;
  return freeze({...identity,kind:raw.kind,hashMethod:HASH_METHOD,catalogHash:index.catalogHash,sourceProjectionHash:index.sourceProjectionHash,sourceUpdatedAt:index.sourceUpdatedAt,sourceUtcDay:index.sourceUtcDay,historyDatePrecision:'UTC_calendar_day',history,sourceSummary:summary,itemSourceUrl:'https://maplestory-classic.com/market/'+identity.slug,sourceReportedSales:count(raw.sourceReportedSales)?raw.sourceReportedSales:null,identityProvenance:raw.identityProvenance??null});
}
function createMarketCatalogClient({fetchImpl=globalThis.fetch,onResponse=()=>true,maxCachedItems=32}={}) {
  require(typeof fetchImpl==='function' && Number.isInteger(maxCachedItems) && maxCachedItems>0 && maxCachedItems<=100,'Invalid client configuration');
  let index=null,indexPending=null;const cached=new Map(),pending=new Map();
  async function read(url,{cache='no-cache',limit=650000}={}) {
    // Only these constructed relative URLs ever reach fetch. No source URL,
    // entered search query, authentication token or external path is accepted.
    const response=await fetchImpl(url,{credentials:'same-origin',cache,redirect:'error',headers:{Accept:'application/json'},signal:typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(12000):undefined});
    if(onResponse(response)===false || response.status===401)throw new CatalogError('AUTH_REQUIRED','Preview session expired; unlock the site to continue');
    if(response.status===409 || response.status===412)throw new CatalogError('VERSION_MISMATCH','Catalog changed during item lookup');
    if(response.status===404)throw new CatalogError('NOT_FOUND','No record for that exact provider slug');
    require(response.ok,'Own-site catalog temporarily unavailable','HTTP_ERROR');
    require(/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''),'Expected JSON; login HTML or a different document is not market data');
    const body=await response.text();require(body.length<=limit,'Own-site catalog exceeds the agreed size bound');
    try{return JSON.parse(body);}catch{throw new CatalogError('INVALID_CATALOG','Malformed own-site catalog JSON');}
  }
  async function loadIndex({force=false}={}) {
    if(indexPending)return indexPending;if(index&&!force)return index;
    indexPending=(async()=>{const next=validateIndex(await read('/market-index.json'));if(index?.catalogHash!==next.catalogHash)cached.clear();index=next;return index;})().finally(()=>{indexPending=null;});return indexPending;
  }
  function oneItem(current,key) {
    const cacheKey=current.catalogHash+':'+key;
    if(cached.has(cacheKey)){const result=cached.get(cacheKey);cached.delete(cacheKey);cached.set(cacheKey,result);return Promise.resolve(result);}
    if(pending.has(cacheKey))return pending.get(cacheKey);
    const task=(async()=>{const raw=await read('/market-item/'+encodeURIComponent(key)+'.json?catalog='+current.catalogHash,{cache:'force-cache',limit:300000}),result=validateDetail(raw,current,key);require(index.catalogHash===current.catalogHash,'Index changed while loading item','VERSION_MISMATCH');cached.set(cacheKey,result);while(cached.size>maxCachedItems)cached.delete(cached.keys().next().value);return result;})().finally(()=>{pending.delete(cacheKey);});pending.set(cacheKey,task);return task;
  }
  async function getItem(key) {
    require(slug(key),'Use an exact provider slug, never a name, alias, ID or path','INVALID_SLUG');
    for(let attempt=0;attempt<2;attempt++){const current=await loadIndex();require(current.rows.some(r=>r.slug===key),'Unknown exact provider slug','NOT_FOUND');try{return await oneItem(current,key);}catch(error){if(error.code!=='VERSION_MISMATCH'||attempt===1)throw error;await loadIndex({force:true});}}
  }
  function bindSearch({inputs=[],routeTarget,readHash=()=>'',onReady=()=>{},onError=()=>{}}={}) {
    const demand=()=>{void loadIndex().then(onReady,onError);};
    for(const input of inputs)input.addEventListener('focus',demand);
    const route=()=>{if(readHash()==='#price-check')demand();};routeTarget?.addEventListener('hashchange',route);route();
    return()=>{for(const input of inputs)input.removeEventListener('focus',demand);routeTarget?.removeEventListener('hashchange',route);};
  }
  return Object.freeze({loadIndex,getItem,bindSearch,peek:()=>index,cacheSize:()=>cached.size});
}
// Merge into the existing price-check records/table, never a parallel table.
// Existing fields keep independent rolling/metadata evidence and verified NX costs.
function mergeSearchRecords(existing,index) {
  const consumed=new Set(),result=[];
  for(const row of index.rows){
    const exact=existing.map((record,i)=>({record,i})).filter(({record})=>(record.sourceSlug||record.slug)===row.slug);
    const verified=exact.length?[]:row.canonicalId===null?[]:existing.map((record,i)=>({record,i})).filter(({record})=>record.id===row.canonicalId&&record.name===row.name&&!record.slug);
    const matches=exact.length?exact:verified;require(matches.length<=1,'Ambiguous existing source identity');const previous=matches[0]?.record??{};if(matches.length)consumed.add(matches[0].i);
    if(matches.length)require(previous.name===row.name,'Same slug with a conflicting name cannot silently merge');
    const evidenceDate=(row.priceDay?'Qualified daily price · '+row.priceDay+(row.carried?' · carried':''):'No qualifying daily price · '+row.thinDays+' thin / '+row.zeroCountDays+' zero-count source days')+(previous.rollingReference?' · separate rolling median captured '+previous.rollingReference.capturedAt:'')+(previous.metadataDate?' · metadata receipt '+previous.metadataDate:'');
    result.push({...previous,key:row.slug,slug:row.slug,sourceSlug:row.slug,id:row.canonicalId??previous.id??null,name:row.name,sourceCategory:row.category,price:row.price,priceDay:row.priceDay,quantity:row.quantity,publisherMedian:row.publisherMedian,historyDays:row.historyDays,qualifyingDays:row.qualifyingDays,thinDays:row.thinDays,zeroCountDays:row.zeroCountDays,carried:row.carried,partial:row.partial,metadata:false,hasMetadata:previous.metadata===true||previous.hasMetadata===true,knownNxCost:previous.knownNxCost??null,dailyRate:positive(previous.knownNxCost)&&row.price!==null?row.price/previous.knownNxCost:null,lazyDetail:true,type:'Provider daily · '+row.category+(row.price===null?' · no qualifying price':' · qualified price'),catalog:previous.catalog??false,catalogHash:index.catalogHash,sourceUpdatedAt:index.sourceUpdatedAt,evidenceDate});
  }
  for(let i=0;i<existing.length;i++)if(!consumed.has(i))result.push({...existing[i]});return result;
}
// Input for the existing generic item renderer. Qualified graph points stay
// separate from all retained thin/zero rows, which must remain available in its table.
function toItemModel(detail) {
  return {catalogDetail:true,lazyDailyDetail:true,slug:detail.slug,canonicalId:detail.canonicalId,name:detail.name,sourceUpdatedAt:detail.sourceUpdatedAt,source:{slug:detail.slug,name:detail.name,category:detail.category,sourceUpdatedAt:detail.sourceUpdatedAt,sourceSummary:detail.sourceSummary,knownNxCost:null,partial:detail.partial,priceDay:detail.priceDay},history:detail.history.filter(p=>p.qualified).map(p=>[p.day,p.median,p.recordedCount]),reportedHistory:detail.history,summaryBasis:'unspecified_source_summary',metadata:null,supplemental:null,notIndexed:true,hashMethod:detail.hashMethod,catalogHash:detail.catalogHash,sourceProjectionHash:detail.sourceProjectionHash};
}

  const client=createMarketCatalogClient({fetchImpl:(...args)=>window.fetch(...args),onResponse:response=>window.astraPreviewSession?.onResponse(response)!==false});
  const models=new Map();
  function hasVersionedReport(report){const meta=report?.marketCatalog;return meta?.schemaVersion===1&&meta.hashMethod===HASH_METHOD&&HASH.test(meta.catalogHash)&&HASH.test(meta.sourceProjectionHash)&&HASH.test(meta.identityVersion)&&count(meta.itemCount)&&meta.sourceUpdatedAt===report.sourceUpdatedAt&&stamp(meta.sourceUpdatedAt);}
  function matchesReport(report,value){const meta=report?.marketCatalog;return hasVersionedReport(report)&&value?.hashMethod===meta.hashMethod&&value.catalogHash===meta.catalogHash&&value.sourceProjectionHash===meta.sourceProjectionHash&&value.sourceUpdatedAt===meta.sourceUpdatedAt&&(value.itemCount===undefined||value.itemCount===meta.itemCount);}
  function peekItem(route){const current=client.peek();if(!current)return null;const direct=models.get(route);if(direct?.catalogHash===current.catalogHash)return direct;const match=/^id-([1-9]\d*)$/.exec(route||'');if(!match)return null;const candidates=[...models.values()].filter(m=>m.catalogHash===current.catalogHash&&m.canonicalId===Number(match[1]));return candidates.length===1?candidates[0]:null;}
  async function loadItem(route,report){require(hasVersionedReport(report),'Awaiting the versioned full catalog','REPORT_PENDING');let index=client.peek();index=await client.loadIndex({force:!!index&&!matchesReport(report,index)});require(matchesReport(report,index),'Catalog and report versions differ','VERSION_MISMATCH');let exact=index.rows.find(row=>row.slug===route);if(!exact){const match=/^id-([1-9]\d*)$/.exec(route||'');const ids=match?index.rows.filter(row=>row.canonicalId===Number(match[1])):[];if(ids.length===1)exact=ids[0];}if(!exact)throw new CatalogError('NOT_FOUND','No collected exact provider record');const detail=await client.getItem(exact.slug);require(matchesReport(report,detail),'Catalog and report versions differ','VERSION_MISMATCH');const model=toItemModel(detail);for(const [key,old]of models)if(old.catalogHash!==detail.catalogHash)models.delete(key);models.delete(model.slug);models.set(model.slug,model);while(models.size>32)models.delete(models.keys().next().value);return model;}
  window.AstraFullMarket=Object.freeze({client,mergeSearchRecords,toItemModel,peekItem,loadItem,hasVersionedReport,matchesReport});

})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "full-market-client.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: api-cash-protocol.js */
try {
(()=>{'use strict';
// Pure public29 browser schema, generated from reviewed project protocol; no source transport.
if(window.AstraApiCashProtocol)return;
const metadata={"targets":[{"itemId":1802000,"name":"Red Ribbon","slug":"red-ribbon","fixedNxCost":3200},{"itemId":1802001,"name":"Yellow Hat","slug":"yellow-hat","fixedNxCost":3200},{"itemId":1802002,"name":"Red Hat","slug":"red-hat","fixedNxCost":3200},{"itemId":1802003,"name":"Black Hat","slug":"black-hat","fixedNxCost":3200},{"itemId":1802007,"name":"Red Top Hat","slug":"red-top-hat","fixedNxCost":3200},{"itemId":5000000,"name":"Brown Kitty","slug":"brown-kitty","fixedNxCost":3500},{"itemId":5000001,"name":"Brown Puppy","slug":"brown-puppy","fixedNxCost":3500},{"itemId":5000002,"name":"Pink Bunny","slug":"pink-bunny","fixedNxCost":3500},{"itemId":5000004,"name":"Black Kitty","slug":"black-kitty","fixedNxCost":3500},{"itemId":5000005,"name":"White Bunny","slug":"white-bunny","fixedNxCost":3500},{"itemId":5000007,"name":"Black Pig","slug":"black-pig","fixedNxCost":3500},{"itemId":5050100,"name":"AP Reset Scroll","slug":"ap-reset-scroll","fixedNxCost":7000},{"itemId":5051001,"name":"SP Reset Scroll","slug":"sp-reset-scroll","fixedNxCost":7000},{"itemId":5150000,"name":"Mystery Hair Coupon","slug":"mystery-hair-coupon","fixedNxCost":5500},{"itemId":5150100,"name":"Signature Hair Coupon","slug":"signature-hair-coupon","fixedNxCost":7500},{"itemId":5151000,"name":"Mystery Hair Color Coupon","slug":"mystery-hair-color-coupon","fixedNxCost":1700},{"itemId":5151100,"name":"Signature Hair Color Coupon","slug":"signature-hair-color-coupon","fixedNxCost":4500},{"itemId":5152000,"name":"Mystery Face Coupon","slug":"mystery-face-coupon","fixedNxCost":3500},{"itemId":5152100,"name":"Signature Eye Color Coupon","slug":"signature-eye-color-coupon","fixedNxCost":2500},{"itemId":5152200,"name":"Signature Face Coupon","slug":"signature-face-coupon","fixedNxCost":5500},{"itemId":5153000,"name":"Signature Skin Color Coupon","slug":"signature-skin-color-coupon","fixedNxCost":2000},{"itemId":5170000,"name":"Pet Name Tag","slug":"pet-name-tag","fixedNxCost":1800},{"itemId":5180000,"name":"Water of Life","slug":"water-of-life","fixedNxCost":2000},{"itemId":5190000,"name":"Auto HP Potion Skill","slug":"auto-hp-potion-skill","fixedNxCost":2500},{"itemId":5190001,"name":"Auto MP Potion Skill","slug":"auto-mp-potion-skill","fixedNxCost":2500},{"itemId":5190002,"name":"Auto Move Skill","slug":"auto-move-skill","fixedNxCost":3000},{"itemId":5190003,"name":"Expanded Auto Move Skill","slug":"expanded-auto-move-skill","fixedNxCost":3000},{"itemId":5680000,"name":"Storage Room 5-slot Coupon","slug":"storage-room-5-slot-coupon","fixedNxCost":5000},{"itemId":5680001,"name":"Selective 5-slot Coupon","slug":"selective-5-slot-coupon","fixedNxCost":5000}]};
// Typed, length-prefixed UTF-8 + IEEE754 binary64. No number printing involved.
const HASH_METHOD='mcat-typed-utf8-f64-v1';
const encoder=new TextEncoder();
function utf8(text){
  for(const char of text){const point=char.codePointAt(0);if(point>=0xd800&&point<=0xdfff)throw Error('Unpaired surrogate is not valid UTF-8');}
  return encoder.encode(text);
}
function codepointCompare(a,b){
  const left=Array.from(a),right=Array.from(b);
  for(let i=0;i<Math.min(left.length,right.length);i++){const difference=left[i].codePointAt(0)-right[i].codePointAt(0);if(difference)return difference;}
  return left.length-right.length;
}
function concat(parts){const out=new Uint8Array(parts.reduce((sum,part)=>sum+part.byteLength,0));let offset=0;for(const part of parts){out.set(part,offset);offset+=part.byteLength;}return out;}
function canonicalBytes(value){
  if(value===null)return utf8('z');
  if(typeof value==='boolean')return utf8(value?'t':'f');
  if(typeof value==='number'){
    if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)throw Error('Unsupported canonical number');
    const buffer=new ArrayBuffer(8);new DataView(buffer).setFloat64(0,value===0?0:value,false);
    return utf8('n'+[...new Uint8Array(buffer)].map(byte=>byte.toString(16).padStart(2,'0')).join(''));
  }
  if(typeof value==='string'){const bytes=utf8(value);return concat([utf8('s'+bytes.byteLength+':'),bytes]);}
  if(Array.isArray(value)){
    if(Object.keys(value).length!==value.length)throw Error('Sparse arrays are not canonical');
    return concat([utf8('a'+value.length+':'),...value.map(canonicalBytes)]);
  }
  if(value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))){
    const keys=Object.keys(value).sort(codepointCompare);return concat([utf8('o'+keys.length+':'),...keys.flatMap(key=>[canonicalBytes(key),canonicalBytes(value[key])])]);
  }
  throw Error('Unsupported canonical value');
}
async function portableHash(value){
  const bytes=concat([utf8(HASH_METHOD+'\n'),canonicalBytes(value)]);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

const targets=new Map(structuredClone(metadata.targets).map(row=>[row.itemId,Object.freeze(row)]));
const HEX=/^[a-f0-9]{64}$/;
const check=(ok,message)=>{if(!ok)throw new TypeError(message);};
const samePointer=(a,b)=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);
const bytes=text=>new TextEncoder().encode(text).length;
const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const clock=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const exact=(v,names)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===names.split(' ').sort().join('|'),'Unexpected display fields');
const equal=(a,b)=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>a[k]===b[k]);
const METHOD={price:'Source-reported item sale median',count:'Reported sale count; not physical units',
 quality:'Item-level aggregates can mix equipment qualities',identity:'Bound game item IDs; provider item-name echo not verified',
 use:'Compare fixed-NX items; not an executable exchange quote or the goods-inflation headline',
 clocks:'Retrieval time is known; individual sale timestamps and exact window bounds are not supplied'};
const WINDOW={reportedLookbackDays:3,start:null,end:null,boundsKnown:false};
const ATTRIBUTION={label:'Prices from maplestory.market',url:'https://maplestory.market/?ref=v6kkdvp6'};


async function validatePublicBody(dto){
  exact(dto,'schemaVersion kind sourceUrl privateProjectionHash requestStartedAt capturedAt captureTimeKind sourceObservedAt window coverage records methodology attribution isExecutableQuote changesGoodsIndex changesHeadlineBenchmark subsetHash');
  check(dto.schemaVersion===1&&dto.kind==='fixed_nx_item_api_display_subset'&&dto.sourceUrl==='https://maplestory.market/api/prices'&&HEX.test(dto.privateProjectionHash)&&HEX.test(dto.subsetHash),'Wrong display contract');
  check(clock(dto.requestStartedAt)&&clock(dto.capturedAt)&&dto.requestStartedAt<=dto.capturedAt&&dto.captureTimeKind==='http_response_completed'&&dto.sourceObservedAt===null,'Wrong display clock');
  check(equal(dto.window,WINDOW)&&equal(dto.methodology,METHOD)&&equal(dto.attribution,ATTRIBUTION)&&dto.isExecutableQuote===false&&dto.changesGoodsIndex===false&&dto.changesHeadlineBenchmark===false,'Changed public methodology');
  exact(dto.coverage,'expected available missingOrInvalid');check(Array.isArray(dto.records)&&dto.records.length===29,'Wrong displayed scope');
  const ids=new Set();let available=0;
  for(const row of dto.records){
    exact(row,'itemId name slug fixedNxCost available saleMedianMesos recordedSalesCount mesosPerNx sourceCreditUrl');
    const target=targets.get(row.itemId);check(target&&!ids.has(row.itemId)&&row.name===target.name&&row.slug===target.slug&&row.fixedNxCost===target.fixedNxCost,'Wrong displayed identity');ids.add(row.itemId);
    check(row.sourceCreditUrl===`https://maplestory.market/items/${row.itemId}?ref=v6kkdvp6`,'Wrong display credit');
    if(row.available===true){check(typeof row.saleMedianMesos==='number'&&Number.isFinite(row.saleMedianMesos)&&row.saleMedianMesos>0&&row.saleMedianMesos<=Number.MAX_SAFE_INTEGER&&integer(row.recordedSalesCount,5)&&row.mesosPerNx===row.saleMedianMesos/row.fixedNxCost,'Invalid displayed values');available++;}
    else check(row.available===false&&row.saleMedianMesos===null&&row.recordedSalesCount===null&&row.mesosPerNx===null,'Unknown values became numbers');
  }
  check(dto.coverage.expected===29&&dto.coverage.available===available&&dto.coverage.missingOrInvalid===29-available,'Wrong displayed coverage');
  const {subsetHash,...body}=dto;check(await portableHash(body)===subsetHash,'Display semantic hash mismatch');return dto;
}

const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
function parse(text){
 check(typeof text==='string'&&text.length<=100000,'Bounded JSON required');let i=0,nodes=0;
 const space=()=>{while(/[ \r\n\t]/.test(text[i]||'')&&i<text.length)i++;};
 function string(){const at=i++;while(i<text.length){const c=text[i++];if(c==='"'){const s=JSON.parse(text.slice(at,i));check(s.length<=4096,'String bound');return s;}if(c==='\\')i++;}throw Error('Unterminated string');}
 function value(depth){check(++nodes<=10000&&depth<=16,'JSON complexity');space();const c=text[i];
  if(c==='"')return string();
  if(c==='['){i++;space();const a=[];if(text[i]===']'){i++;return a;}while(true){check(a.length<1000,'Array bound');a.push(value(depth+1));space();if(text[i]===']'){i++;return a;}check(text[i++]===',','Array separator');}}
  if(c==='{'){i++;space();const o=Object.create(null);if(text[i]==='}'){i++;return o;}while(true){space();check(text[i]==='"','Object key');const k=string();check(!Object.hasOwn(o,k),'Duplicate JSON key');check(Object.keys(o).length<64,'Object bound');space();check(text[i++]===':','Object separator');o[k]=value(depth+1);space();if(text[i]==='}'){i++;return o;}check(text[i++]===',','Object separator');}}
  for(const [literal,v]of[['true',true],['false',false],['null',null]])if(text.startsWith(literal,i)){i+=literal.length;return v;}
  const number=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));check(number,'JSON value');i+=number[0].length;const n=Number(number[0]);check(Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER,'Numeric bound');return n;
 }
 const result=value(0);space();check(i===text.length,'Trailing JSON data');return result;
}
async function validate(input){const owned=JSON.parse(JSON.stringify(input));await validatePublicBody(owned);return freeze(owned);}
window.AstraApiCashProtocol=Object.freeze({validate,parse,hash:portableHash,targets:freeze(structuredClone(metadata.targets))});
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "api-cash-protocol.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: api-cash-client.js */
try {
(()=>{'use strict';if(window.AstraApiCash)return;
const protocol=window.AstraApiCashProtocol;if(!protocol)throw Error('Public cash protocol missing');
const PATH='/api-cash-items.json',CHOICES=['auto','api','legacy'],KEY='astra-api-cash-evidence-v1';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const sha=async raw=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(n=>n.toString(16).padStart(2,'0')).join('');
async function readBody(response){
 const size=response.headers.get('Content-Length');if(size!==null&&(!/^\d+$/.test(size)||Number(size)>100000))throw Error('invalid');
 if(response.body?.getReader){const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>100000)throw Error('invalid');parts.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const raw=new Uint8Array(size);let at=0;for(const part of parts){raw.set(part,at);at+=part.byteLength;}
  return{raw,text:new TextDecoder('utf-8',{fatal:true}).decode(raw)};
 }
 const text=await response.text(),raw=new TextEncoder().encode(text);if(raw.length>100000)throw Error('invalid');return{raw,text};
}
function createClient({fetcher=(...args)=>window.fetch(...args),now=Date.now,setTimer=(...args)=>setTimeout(...args),clearTimer=id=>clearTimeout(id),
 visible=()=>document.visibilityState!=='hidden',online=()=>navigator.onLine!==false,random=Math.random,onState=()=>{}}={}){
 let state=freeze({status:'idle',data:null,serverMode:null,error:null,checkedAt:null,nextAttemptAt:null}),timer=null,controller=null,flight=null,
  epoch=0,started=false,closed=false,lastStart=-Infinity,failures=0,etag=null;
 const emit=next=>{state=freeze({...state,...next});onState(state);return state;};
 const cancelTimer=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 function schedule(at){cancelTimer();if(!started||closed||!visible()||!online())return;timer=setTimer(()=>{timer=null;void refresh();},Math.max(1,at-now()));}
 async function load(signal){
  const response=await fetcher(PATH,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal,
   headers:{Accept:'application/json',...(etag?{'If-None-Match':etag}:{})}});
  if(signal.aborted)throw Error('cancelled');
  if(response.url){const url=new URL(response.url,location.href);if(url.origin!==location.origin||url.pathname!==PATH||url.search)throw Error('invalid');}
  if(response.status===401||response.status===403){try{window.astraPreviewSession?.onResponse(response);}catch{}throw Error('site_access');}
  if(response.status===404)throw Error('not_published');
  if(response.status===503)throw Error('unavailable');
  const mode=response.headers.get('X-Astra-Cash-Mode'),capture=response.headers.get('X-Astra-Cash-Captured-At');
  if(response.headers.get('X-Astra-Cash-Phase')!=='published_subset'||!['accepted_cache','retained_last_good'].includes(mode))throw Error('invalid');
  if(response.status===304){if(!state.data||capture!==state.data.capturedAt||response.headers.get('ETag')!==etag)throw Error('invalid');return{data:state.data,etag,mode};}
  if(response.status!==200||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type')||''))throw Error('invalid');
  const body=await readBody(response),receivedEtag=response.headers.get('ETag');
  if(!/^"[a-f0-9]{64}"$/.test(receivedEtag||'')||'"'+await sha(body.raw)+'"'!==receivedEtag)throw Error('invalid');
  const data=await protocol.validate(protocol.parse(body.text));if(capture!==data.capturedAt)throw Error('invalid');
  return{data,etag:receivedEtag,mode};
 }
 function refresh(){
  if(closed||!visible()||!online())return Promise.resolve(state);if(flight)return flight;
  const due=Math.max(lastStart+30000,state.error?state.nextAttemptAt||0:0);if(now()<due){schedule(due);return Promise.resolve(state);}
  lastStart=now();const mine=++epoch,requestController=new AbortController();controller=requestController;let timeout;
  emit({status:'loading',error:null,nextAttemptAt:null});
  const fail=new Promise((_,reject)=>{timeout=setTimer(()=>{requestController.abort();reject(Error('timeout'));},12000);});
  const pending=Promise.race([load(requestController.signal),fail]).then(value=>{
   if(mine!==epoch||closed)return state;etag=value.etag;failures=0;
   return emit({data:value.data,status:value.mode==='retained_last_good'?'retained':'ready',serverMode:value.mode,error:null,checkedAt:now(),nextAttemptAt:lastStart+60000});
  }).catch(error=>{
   if(mine!==epoch||closed)return state;
   const reason=['site_access','not_published','unavailable','timeout'].includes(error?.message)?error.message:'invalid';
   const discard=reason==='site_access'||reason==='not_published';if(discard)etag=null;
   failures++;const delay=Math.min(900000,60000*2**Math.min(failures-1,4))*(1+Math.max(0,Math.min(1,random()))*.1);
   return emit({status:discard?reason:state.data?'retained':'unavailable',data:discard?null:state.data,error:reason,
    checkedAt:now(),nextAttemptAt:now()+delay});
  }).finally(()=>{clearTimer(timeout);if(mine===epoch){flight=null;controller=null;schedule(state.nextAttemptAt??now()+60000);}});
  flight=pending;return pending;
 }
 function visibilityChanged(){
  cancelTimer();if(!visible()||!online()){++epoch;controller?.abort();controller=null;flight=null;emit({status:state.data?'retained':'paused'});return;}
  if(started)void refresh();
 }
 return Object.freeze({getState:()=>state,refresh,start(){if(closed)return;if(!started){started=true;void refresh();}},visibilityChanged,
  close(){closed=true;++epoch;cancelTimer();controller?.abort();controller=null;flight=null;},freshness(){
   if(!state.data)return'unavailable';const age=now()-Date.parse(state.data.capturedAt);return age<0?'clock_uncertain':age<=600000?'recent_retrieval':'aged_retrieval';}});
}
let choice='auto';try{const saved=localStorage.getItem(KEY);if(CHOICES.includes(saved))choice=saved;}catch{}
const client=createClient({onState:state=>document.dispatchEvent(new CustomEvent('astraapicashchange',{detail:state}))});
function model(){const s=client.getState(),data=s.data;
 const records=data?.records||protocol.targets.map(t=>({itemId:t.itemId,name:t.name,slug:t.slug,fixedNxCost:t.fixedNxCost,available:false,saleMedianMesos:null,recordedSalesCount:null,mesosPerNx:null}));
 const rows=records.map(r=>({id:r.itemId,name:r.name,slug:r.slug,nx:r.fixedNxCost,price:r.saleMedianMesos,rate:r.mesosPerNx,
  quantity:r.recordedSalesCount,referenceWeight:r.available?r.recordedSalesCount:0,windowDays:3,missing:!r.available,
  lowRate:null,highRate:null,referenceExclusion:r.available?null:'API median or minimum reported count unavailable',sourceCreditUrl:r.sourceCreditUrl||`https://maplestory.market/items/${r.itemId}?ref=v6kkdvp6`}));
 const eligible=rows.filter(r=>r.referenceWeight>0),total=eligible.reduce((sum,r)=>sum+r.referenceWeight,0),complete=eligible.length===29;
 const reference=complete&&Number.isSafeInteger(total)?eligible.reduce((sum,r)=>sum+r.rate*r.referenceWeight,0)/total:null;
 for(const row of rows){row.deltaPct=reference>0&&row.referenceWeight>0?(row.rate/reference-1)*100:null;row.verdict='unknown';}
 return{api:true,rows,reference,days:3,rolling:false,start:null,end:null,partial:!complete,eligibleCount:eligible.length,
  capturedAt:data?.capturedAt||null,requestStartedAt:data?.requestStartedAt||null,sourceUpdatedAt:null,
  retained:['retained','loading'].includes(s.status)||s.serverMode==='retained_last_good',sourceObservedAt:null,status:s.status,
  coverage:data?.coverage||{expected:29,available:0,missingOrInvalid:29},sourceKind:'api_item_sale_medians'};
}
function pricing(_report,{side='sell'}={}){const m=model();if(choice==='legacy'||choice==='auto'&&m.eligibleCount===0)return null;
 for(const row of m.rows)if(row.deltaPct!==null){const advantage=row.deltaPct*(side==='buy'?-1:1);row.verdict=Math.abs(advantage)<1e-9?'neutral':advantage>0?'favorable':'less-favorable';}return m;
}
function fallbackReason(){if(choice==='legacy')return'Other dated source selected';if(client.getState().data?.coverage.available===0)return'No qualifying API medians; other dated source shown';return'API reference unavailable; other dated source shown';}
function setChoice(value){if(!CHOICES.includes(value))return;choice=value;try{localStorage.setItem(KEY,value);}catch{}
 document.dispatchEvent(new CustomEvent('astraapicashchoice',{detail:{choice}}));}
window.AstraApiCash=Object.freeze({client,createClient,getState:client.getState,refresh:client.refresh,model,pricing,fallbackReason,getChoice:()=>choice,setChoice,
 rowFor(item){const row=client.getState().data?.records.find(r=>r.slug===item?.slug&&r.name===item?.name);if(!row)return null;
  const id=item.canonicalId??item.id,cost=item.knownNxCost??item.nx;return id!==null&&id!==undefined&&id!==row.itemId||cost!==null&&cost!==undefined&&cost!==row.fixedNxCost?null:row;}});
document.addEventListener('visibilitychange',()=>client.visibilityChanged());window.addEventListener('online',()=>client.visibilityChanged());window.addEventListener('offline',()=>client.visibilityChanged());
document.getElementById('refresh')?.addEventListener('click',()=>void client.refresh());client.start();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "api-cash-client.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: api-nx-protocol.js */
try {
(()=>{'use strict';if(window.AstraApiNxProtocol)return;
const PUBLIC_NX_PATH='/api-nx-offers.json',MAX_PUBLIC_NX_BYTES=600000;
const CANONICAL_OFFER_SOURCE='https://maplestory.market/ads?tab=services';
const API_HISTORY_SOURCE='https://maplestory.market/api/nx-rate/history?range=7d&step=hour';
const API_SUMMARY_SOURCE='https://maplestory.market/api/nx-rate';
const ATTRIBUTION=Object.freeze({label:'NX offers from maplestory.market',url:'https://maplestory.market/?ref=v6kkdvp6'});
const BASIS='advertised_NX_offer_rates_not_completed_sales';
const check=(ok,code)=>{if(!ok)throw new TypeError(code);};
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const clock=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const hour=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:00:00Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v;
const sourceClock=v=>v===null||typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v;
const exact=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.split(' ').sort().join('|'),'unexpected_public_nx_fields');
const positive=v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=Number.MAX_SAFE_INTEGER;
function publicStats(s,native){
 if(s===null){check(native,'missing_hourly_stats');return;}
 exact(s,`low median high ${native?'mode':'p25 p75'} reportedPosterCount statisticsComplete`);
 const fields=native?['low','median','high','mode']:['low','p25','median','p75','high'];check(integer(s.reportedPosterCount)&&fields.every(k=>positive(s[k]))&&typeof s.statisticsComplete==='boolean','public_nx_stats');
 const ordered=(native?['low','median','high']:['low','p25','median','p75','high']).map(k=>s[k]).filter(v=>v!==null);check(ordered.every((v,i)=>!i||v>=ordered[i-1]),'public_nx_stat_order');
 check(s.statisticsComplete===fields.every(k=>s[k]!==null),'public_nx_completeness');if(s.reportedPosterCount===0)check(fields.every(k=>s[k]===null),'public_nx_zero');
}
function validatePublicNx(dto){
 exact(dto,'schemaVersion kind methodVersion sourceIdentity unit basis capturedAt sourceObservedAt qualifiedIndividualTrades publicationEligible changesGoodsIndex changesHeadlineBenchmark attribution nativeSummary hourlyHistory derived24');
 check(dto.schemaVersion===1&&dto.kind==='nx_offer_display_subset'&&dto.methodVersion===1&&dto.sourceIdentity==='maplestory_market_nx_offers'&&dto.unit==='mesos_per_NX'&&dto.basis===BASIS&&clock(dto.capturedAt)&&dto.sourceObservedAt===null&&dto.qualifiedIndividualTrades===0&&dto.publicationEligible===false&&dto.changesGoodsIndex===false&&dto.changesHeadlineBenchmark===false,'public_nx_contract');
 exact(dto.attribution,'label url');check(dto.attribution.label===ATTRIBUTION.label&&dto.attribution.url===ATTRIBUTION.url,'public_nx_attribution');
 const n=dto.nativeSummary;if(n!==null){exact(n,'sourceUrl capturedAt reportedWindowHours actualWindowStart actualWindowEnd sourceLastHeardAt sourceLimited buy sell');check(n.sourceUrl===API_SUMMARY_SOURCE&&clock(n.capturedAt)&&n.capturedAt<=dto.capturedAt&&Number.isSafeInteger(n.reportedWindowHours)&&n.reportedWindowHours>0&&n.reportedWindowHours<=8784&&n.actualWindowStart===null&&n.actualWindowEnd===null&&sourceClock(n.sourceLastHeardAt)&&typeof n.sourceLimited==='boolean','public_nx_native');publicStats(n.buy,true);publicStats(n.sell,true);}
 const h=dto.hourlyHistory;exact(h,'sourceUrl bucketCompletionKnown maxSelectedHours totalRetainedSourceHourSideRows omittedRetainedSourceHourSideRows rows');check(h.sourceUrl===API_HISTORY_SOURCE&&h.bucketCompletionKnown===false&&h.maxSelectedHours===744&&integer(h.totalRetainedSourceHourSideRows)&&integer(h.omittedRetainedSourceHourSideRows)&&Array.isArray(h.rows)&&h.rows.length<=1488&&h.totalRetainedSourceHourSideRows===h.rows.length+h.omittedRetainedSourceHourSideRows,'public_nx_history');
 let previous='';for(const r of h.rows){exact(r,'at side capturedAt sourceObservedAt low median high p25 p75 reportedPosterCount statisticsComplete');check(hour(r.at)&&['buy','sell'].includes(r.side)&&clock(r.capturedAt)&&r.capturedAt<=dto.capturedAt&&r.sourceObservedAt===null,'public_nx_hour_context');const key=r.at+'|'+r.side;check(key>previous,'public_nx_hour_order');previous=key;const {at,side,capturedAt,sourceObservedAt,...stats}=r;publicStats(stats,false);}
 const d=dto.derived24;exact(d,'kind hours anchorSourceHourLabel firstSelectedSourceHourLabel sides quantileMethod counts bucketCompletionKnown');check(d.kind==='derived_published_hourly_histogram_pool'&&d.hours===24&&d.quantileMethod==='linear_interpolation_ordered_frequency_bins'&&d.counts==='poster_hour_observations_not_unique_people_or_trades'&&d.bucketCompletionKnown===false,'public_nx_derived');const anchor=h.rows.length?h.rows.at(-1).at:null;check(d.anchorSourceHourLabel===anchor&&d.firstSelectedSourceHourLabel===(anchor?new Date(Date.parse(anchor)-23*3600000).toISOString().replace('.000Z','Z'):null),'public_nx_derived_window');exact(d.sides,'buy sell');
 for(const side of ['buy','sell']){const s=d.sides[side];exact(s,'p25 median p75 posterHourObservations availableHourBuckets missingHourBuckets');check(['p25','median','p75'].every(k=>positive(s[k])),'public_nx_derived_rates');const v=[s.p25,s.median,s.p75].filter(x=>x!==null);check(v.every((n,i)=>!i||n>=v[i-1]),'public_nx_derived_order');const rows=anchor?h.rows.filter(r=>r.side===side&&r.at>=d.firstSelectedSourceHourLabel):[],count=rows.reduce((n,r)=>n+r.reportedPosterCount,0);check(integer(count)&&s.availableHourBuckets===rows.length&&s.missingHourBuckets===24-rows.length&&s.posterHourObservations===(rows.length?count:null),'public_nx_derived_counts');if(!count)check(s.p25===null&&s.median===null&&s.p75===null,'public_nx_empty_pool');}
 return dto;
}
const bytes=text=>new TextEncoder().encode(text).length;
function parse(text){
 check(typeof text==='string'&&bytes(text)<=MAX_PUBLIC_NX_BYTES,'Bounded JSON required');let i=0,nodes=0;
 const space=()=>{while(/[ \r\n\t]/.test(text[i]||'')&&i<text.length)i++;};
 function string(){const at=i++;while(i<text.length){const c=text[i++];if(c==='"'){const s=JSON.parse(text.slice(at,i));check(s.length<=4096,'String bound');return s;}if(c==='\\')i++;}throw Error('Unterminated string');}
 function value(depth){check(++nodes<=60000&&depth<=16,'JSON complexity');space();const c=text[i];
  if(c==='"')return string();
  if(c==='['){i++;space();const a=[];if(text[i]===']'){i++;return a;}while(true){check(a.length<1500,'Array bound');a.push(value(depth+1));space();if(text[i]===']'){i++;return a;}check(text[i++]===',','Array separator');}}
  if(c==='{'){i++;space();const o=Object.create(null);if(text[i]==='}'){i++;return o;}while(true){space();check(text[i]==='"','Object key');const k=string();check(!Object.hasOwn(o,k),'Duplicate JSON key');check(Object.keys(o).length<64,'Object bound');space();check(text[i++]===':','Object separator');o[k]=value(depth+1);space();if(text[i]==='}'){i++;return o;}check(text[i++]===',','Object separator');}}
  for(const [literal,v]of[['true',true],['false',false],['null',null]])if(text.startsWith(literal,i)){i+=literal.length;return v;}
  const number=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));check(number,'JSON value');i+=number[0].length;const n=Number(number[0]);check(Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER,'Numeric bound');return n;
 }
 const result=value(0);space();check(i===text.length,'Trailing JSON data');return result;
}
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
function validate(input){const v=JSON.parse(JSON.stringify(input));validatePublicNx(v);return freeze(v);}
window.AstraApiNxProtocol=Object.freeze({validate,parse,path:PUBLIC_NX_PATH,maxBytes:MAX_PUBLIC_NX_BYTES,canonicalSource:CANONICAL_OFFER_SOURCE,historySource:API_HISTORY_SOURCE,summarySource:API_SUMMARY_SOURCE});
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "api-nx-protocol.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: api-nx-client.js */
try {
(()=>{'use strict';if(window.AstraApiNxOffers)return;
const protocol=window.AstraApiNxProtocol;if(!protocol)throw Error('Public NX protocol missing');
const PATH='/api-nx-offers.json';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const sha=async raw=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(n=>n.toString(16).padStart(2,'0')).join('');
async function readBody(response){
 const size=response.headers.get('Content-Length');if(size!==null&&(!/^\d+$/.test(size)||Number(size)>600000))throw Error('invalid');
 if(response.body?.getReader){const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>600000)throw Error('invalid');parts.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const raw=new Uint8Array(size);let at=0;for(const part of parts){raw.set(part,at);at+=part.byteLength;}
  return{raw,text:new TextDecoder('utf-8',{fatal:true}).decode(raw)};
 }
 const text=await response.text(),raw=new TextEncoder().encode(text);if(raw.length>600000)throw Error('invalid');return{raw,text};
}
function createClient({fetcher=(...args)=>window.fetch(...args),now=Date.now,setTimer=(...args)=>setTimeout(...args),clearTimer=id=>clearTimeout(id),
 visible=()=>document.visibilityState!=='hidden',online=()=>navigator.onLine!==false,random=Math.random,onState=()=>{}}={}){
 let state=freeze({status:'idle',data:null,serverMode:null,error:null,checkedAt:null,nextAttemptAt:null}),timer=null,controller=null,flight=null,
  epoch=0,started=false,closed=false,lastStart=-Infinity,failures=0,etag=null;
 const emit=next=>{state=freeze({...state,...next});onState(state);return state;};
 const cancelTimer=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 function schedule(at){cancelTimer();if(!started||closed||!visible()||!online())return;timer=setTimer(()=>{timer=null;void refresh();},Math.max(1,at-now()));}
 async function load(signal){
  const response=await fetcher(PATH,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal,
   headers:{Accept:'application/json',...(etag?{'If-None-Match':etag}:{})}});
  if(signal.aborted)throw Error('cancelled');
  if(response.url){const url=new URL(response.url,location.href);if(url.origin!==location.origin||url.pathname!==PATH||url.search)throw Error('invalid');}
  if(response.status===401||response.status===403){try{window.astraPreviewSession?.onResponse(response);}catch{}throw Error('site_access');}
  if(response.status===404)throw Error('not_published');
  if(response.status===503)throw Error('unavailable');
  const mode=response.headers.get('X-Astra-NX-Mode'),capture=response.headers.get('X-Astra-NX-Captured-At');
  if(response.headers.get('X-Astra-NX-Phase')!=='published_offer_subset'||!['accepted_cache','retained_last_good'].includes(mode))throw Error('invalid');
  if(response.status===304){if(!state.data||capture!==state.data.capturedAt||response.headers.get('ETag')!==etag)throw Error('invalid');return{data:state.data,etag,mode};}
  if(response.status!==200||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type')||''))throw Error('invalid');
  const body=await readBody(response),receivedEtag=response.headers.get('ETag');
  if(!/^"[a-f0-9]{64}"$/.test(receivedEtag||'')||'"'+await sha(body.raw)+'"'!==receivedEtag)throw Error('invalid');
  const data=await protocol.validate(protocol.parse(body.text));if(capture!==data.capturedAt)throw Error('invalid');
  if(state.data&&data.capturedAt<state.data.capturedAt)throw Error('invalid');
  return{data,etag:receivedEtag,mode};
 }
 function refresh(){
  if(closed||!visible()||!online())return Promise.resolve(state);if(flight)return flight;
  const due=Math.max(lastStart+30000,state.error?state.nextAttemptAt||0:0);if(now()<due){schedule(due);return Promise.resolve(state);}
  lastStart=now();const mine=++epoch,requestController=new AbortController();controller=requestController;let timeout;
  emit({status:'loading',error:null,nextAttemptAt:null});
  const fail=new Promise((_,reject)=>{timeout=setTimer(()=>{requestController.abort();reject(Error('timeout'));},12000);});
  const pending=Promise.race([load(requestController.signal),fail]).then(value=>{
   if(mine!==epoch||closed)return state;etag=value.etag;failures=0;
   return emit({data:value.data,status:value.mode==='retained_last_good'?'retained':'ready',serverMode:value.mode,error:null,checkedAt:now(),nextAttemptAt:lastStart+60000});
  }).catch(error=>{
   if(mine!==epoch||closed)return state;
   const reason=['site_access','not_published','unavailable','timeout'].includes(error?.message)?error.message:'invalid';
   const discard=reason==='site_access'||reason==='not_published';if(discard)etag=null;
   failures++;const delay=Math.min(900000,60000*2**Math.min(failures-1,4))*(1+Math.max(0,Math.min(1,random()))*.1);
   return emit({status:discard?reason:state.data?'retained':'unavailable',data:discard?null:state.data,error:reason,
    checkedAt:now(),nextAttemptAt:now()+delay});
  }).finally(()=>{clearTimer(timeout);if(mine===epoch){flight=null;controller=null;schedule(state.nextAttemptAt??now()+60000);}});
  flight=pending;return pending;
 }
 function visibilityChanged(){
  cancelTimer();if(!visible()||!online()){++epoch;controller?.abort();controller=null;flight=null;emit({status:state.data?'retained':'paused'});return;}
  if(started)void refresh();
 }
 return Object.freeze({getState:()=>state,refresh,start(){if(closed)return;if(!started){started=true;void refresh();}},visibilityChanged,
  close(){closed=true;++epoch;cancelTimer();controller?.abort();controller=null;flight=null;},freshness(){
   if(!state.data)return'unavailable';const age=now()-Date.parse(state.data.capturedAt);return age<0?'clock_uncertain':age<=600000?'recent_retrieval':'aged_retrieval';}});
}
const CANONICAL=protocol.canonicalSource,ALIASES=new Set([CANONICAL,protocol.historySource]);
const instant=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
function merge(report,api){
 if(!report||!Array.isArray(report.smega)||report.smega.length>20000)throw Error('bounded_legacy_offers');
 const records=new Map(),others=[],conflicts=[];
 const value=(p,origin)=>{
  const at=instant(p.at),capturedAt=instant(p.capturedAt),count=p.sampleCount??p.distinctSenders??null;
  if(!at||Date.parse(at)%3600000||!['buy','sell'].includes(p.side)||!(p.rate===null||typeof p.rate==='number'&&Number.isFinite(p.rate)&&p.rate>0)||!(count===null||Number.isSafeInteger(count)&&count>=0))return null;
  if(capturedAt&&Date.parse(capturedAt)<Date.parse(at))return null;
  if(![p.p25??null,p.p75??null].every(v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>0))return null;
  return{at,side:p.side,rate:p.rate,p25:p.p25??null,p75:p.p75??null,sampleCount:count,kind:p.side==='sell'?'smega_ask':'smega_bid',aggregation:'source_published_hourly',sourceUrl:CANONICAL,capturedAt,partial:p.partial===true?true:origin==='approved_api_subset'?null:p.partial??null,bucketCompletionKnown:origin==='approved_api_subset'?false:typeof p.partial==='boolean',originalSourceUrl:p.sourceUrl,provenance:[{sourceUrl:p.sourceUrl,capturedAt,transport:origin}],sourceObservedAt:null};
 };
 const add=p=>{
  const key=p.at+'|'+p.side,prior=records.get(key);if(!prior){records.set(key,p);return;}
  const newer=p.capturedAt!==null&&(prior.capturedAt===null||p.capturedAt>prior.capturedAt),older=prior.capturedAt!==null&&(p.capturedAt===null||p.capturedAt<prior.capturedAt);
  if(newer){records.set(key,p);return;}if(older)return;
  const same=['rate','p25','p75','sampleCount'].every(k=>p[k]===prior[k]);
  if(same){prior.provenance.push(...p.provenance);prior.bucketCompletionKnown=prior.bucketCompletionKnown&&p.bucketCompletionKnown;prior.partial=prior.partial===true||p.partial===true?true:prior.bucketCompletionKnown?prior.partial:null;return;}
  conflicts.push(key);records.set(key,{...prior,rate:null,p25:null,p75:null,sampleCount:null,provenance:[...prior.provenance,...p.provenance],conflict:true});
 };
 for(const p of report.smega){if(!ALIASES.has(p.sourceUrl)||p.aggregation!=='source_published_hourly'){others.push({...p});continue;}const r=value(p,'legacy_browser_capture');if(r)add(r);}
 if(api){protocol.validate(api);for(const p of api.hourlyHistory.rows){const r=value({at:p.at,side:p.side,rate:p.median,p25:p.p25,p75:p.p75,sampleCount:p.reportedPosterCount,capturedAt:p.capturedAt,sourceUrl:protocol.historySource},'approved_api_subset');if(r)add(r);}}
 const rows=[...records.values()].sort((a,b)=>a.at.localeCompare(b.at)||a.side.localeCompare(b.side));
 const legacySource=report.smegaSource||{},legacySummaryClock=ALIASES.has(legacySource.sourceUrl)?instant(legacySource.summaryCapturedAt||legacySource.capturedAt):null,n=api?.nativeSummary;
 let summary=legacySummaryClock&&legacySource.summary?{...legacySource.summary}:null,summaryCapturedAt=legacySummaryClock,summaryOrigin='legacy_browser_capture',summaryConflict=false;
 if(n){const next={sellerRate:n.sell?.median??null,buyerRate:n.buy?.median??null,windowHours:n.reportedWindowHours,sellerPosters:n.sell?.reportedPosterCount??null,buyerPosters:n.buy?.reportedPosterCount??null};
  if(!summaryCapturedAt||n.capturedAt>summaryCapturedAt){summary=next;summaryCapturedAt=n.capturedAt;summaryOrigin='approved_api_subset';}
  else if(n.capturedAt===summaryCapturedAt&&summary&&Object.keys(next).some(k=>summary[k]!==next[k])){summary=null;summaryConflict=true;}
 }
 const known=rows.map(p=>p.capturedAt).filter(Boolean).sort(),historyCapturedAt=known.at(-1)||instant(legacySource.capturedAt);
 return{smega:[...others,...rows],smegaSource:{...legacySource,sourceUrl:CANONICAL,capturedAt:historyCapturedAt,summary,summaryCapturedAt,summaryOrigin,summaryConflict,continuousApiConnected:!!api&&api.hourlyHistory.rows.length>0,apiOfferCacheVerified:!!api,historyCaptureMeaning:'original_receipt_capture_not_trade_time'},offerEvidence:{api:api||null,conflictingHourSideKeys:[...records].filter(([,p])=>p.conflict).map(([key])=>key),unknownBucketCompletion:rows.some(p=>p.bucketCompletionKnown===false),legacyOriginalCount:report.smega.length,mergedSourceHourSideRows:rows.length,historyCapturedAt,nativeSummaryCapturedAt:summaryCapturedAt}};
}
const client=createClient({onState:state=>document.dispatchEvent(new CustomEvent('astraapinxchange',{detail:state}))});
let lastRows=null,lastSource=null,lastData=null,lastMerge=null;
function view(report){const data=client.getState().data;if(lastRows!==report.smega||lastSource!==report.smegaSource||lastData!==data){lastMerge=merge(report,data);lastRows=report.smega;lastSource=report.smegaSource;lastData=data;}return{...report,...lastMerge};}
function sourceDescriptor(){const s=client.getState(),data=s.data,age=data?Date.now()-Date.parse(data.capturedAt):null,retained=s.status==='retained';return{connected:!!data,status:s.status,tone:!data?(s.error&&s.status!=='not_published'&&s.status!=='paused'?'red':'amber'):retained||age<0||age>600000?'amber':'green',state:!data?(s.error&&s.status!=='not_published'&&s.status!=='paused'?'API read failed; no accepted offer cache':'Dated browser history retained'):retained?'Own-site read failed; accepted offers retained':age<0?'Accepted API cache verified; receipt clock needs review':'Accepted API offer cache verified'+(age>600000?' · dated receipt':''),capturedAt:data?.capturedAt||null,detail:data?'Source-native summary and hourly poster aggregates; original receipt clocks retained. These are offers, not completed trades.':'The last dated browser capture remains available. A missing API subset does not erase its history.'};}
window.AstraApiNxOffers=Object.freeze({client,createClient,merge,view,sourceDescriptor,getState:client.getState,refresh:client.refresh});
document.addEventListener('visibilitychange',()=>client.visibilityChanged());window.addEventListener('online',()=>client.visibilityChanged());window.addEventListener('offline',()=>client.visibilityChanged());document.getElementById('refresh')?.addEventListener('click',()=>void client.refresh());client.start();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "api-nx-client.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: item-api-preview.js */
try {
(() => {
'use strict';
// ops/api-price-item-dto.mjs
var MAX_BYTES = 5e6;
var HASH = /^[0-9a-f]{64}$/;
var own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
var STAT_NAMES = Object.freeze({ "0": "STR", "1": "DEX", "2": "INT", "3": "LUK", "4": "Max HP", "5": "Max MP", "6": "Speed", "7": "Jump", "9": "Magic ATT", "10": "Weapon DEF", "11": "Magic DEF", "12": "Accuracy", "13": "Avoidability", "14": "Crit rate", "15": "Crit damage", "16": "Weapon ATT" });
var PROFILE = Object.freeze({ version: 1, kind: "market_api_price_item", sourceUrl: "https://maplestory.market/api/prices", statMapSourceUrl: "https://maplestory.market/assets/VDivider-1_mhy5kl.js", statMapSha256: "1d08886333ef15b7615efc9330c5cf673946256265caf19e672621e32a856cf7" });
var InvalidProfile = class extends Error {
  constructor(code) {
    super(code);
    this.name = "InvalidProfile";
  }
};
var fail = (code) => {
  throw new InvalidProfile(code);
};
var DecimalToken = class {
  constructor(lexeme) {
    this.lexeme = lexeme;
    Object.freeze(this);
  }
};
function bytes(value) {
  if (typeof value === "string") {
    if (value.length > MAX_BYTES) fail("body_bound");
    value = new TextEncoder().encode(value);
  }
  if (!(value instanceof Uint8Array) || !value.length || value.byteLength > MAX_BYTES) fail("body_bound");
  return value;
}
async function sha256(raw) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function parseStrictJson(raw) {
  let s;
  try {
    s = new TextDecoder("utf-8", { fatal: true }).decode(bytes(raw));
  } catch (e) {
    if (e instanceof InvalidProfile) throw e;
    fail("invalid_utf8");
  }
  let p = 0, tokens = 0;
  const ws = () => {
    while (/[\x20\t\r\n]/.test(s[p] ?? "x")) p++;
  };
  function value(depth) {
    if (depth > 64 || ++tokens > 5e5) fail("json_complexity");
    ws();
    const c = s[p];
    if (c === '"') {
      const start = p++;
      while (p < s.length) {
        if (s[p] === "\\") {
          p += 2;
          continue;
        }
        if (s[p++] === '"') {
          try {
            return JSON.parse(s.slice(start, p));
          } catch {
            fail("invalid_string");
          }
        }
      }
      fail("invalid_string");
    }
    if (c === "{") {
      p++;
      ws();
      const o = /* @__PURE__ */ Object.create(null);
      if (s[p] === "}") {
        p++;
        return o;
      }
      while (true) {
        ws();
        if (s[p] !== '"') fail("object_key");
        const k = value(depth + 1);
        if (own(o, k)) fail("duplicate_json_key");
        ws();
        if (s[p++] !== ":") fail("object_colon");
        o[k] = value(depth + 1);
        ws();
        if (s[p] === "}") {
          p++;
          return o;
        }
        if (s[p++] !== ",") fail("object_separator");
      }
    }
    if (c === "[") {
      p++;
      ws();
      const a = [];
      if (s[p] === "]") {
        p++;
        return a;
      }
      while (true) {
        a.push(value(depth + 1));
        ws();
        if (s[p] === "]") {
          p++;
          return a;
        }
        if (s[p++] !== ",") fail("array_separator");
      }
    }
    for (const [word, v] of [["true", true], ["false", false], ["null", null]]) if (s.startsWith(word, p)) {
      p += word.length;
      return v;
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(s.slice(p));
    if (!number) fail("invalid_json_value");
    p += number[0].length;
    if (number[0].length > 256) fail("number_bound");
    if (!/[.eE]/.test(number[0]) && Number.isSafeInteger(Number(number[0]))) return Number(number[0]);
    return new DecimalToken(number[0]);
  }
  const result = value(0);
  ws();
  if (p !== s.length) fail("json_trailing");
  return result;
}
var object = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof DecimalToken);
function shape(v, required, optional = []) {
  if (!object(v) || required.some((k) => !own(v, k)) || Object.keys(v).some((k) => !required.includes(k) && !optional.includes(k))) fail("unexpected_fields");
}
function integer(v, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail("invalid_integer");
  return v;
}
function id(v) {
  return integer(v, 1, 999999999);
}
function freeze(v) {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
function iso(v) {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v) || !Number.isFinite(Date.parse(v))) fail("invalid_clock");
  const parts = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)/.exec(v), d = new Date(v);
  if (d.toISOString().slice(0, 10) !== parts[1] || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59) fail("invalid_clock");
  return v;
}
var META_URLS = /* @__PURE__ */ new Set(["https://maplestory.io/api/MCW/1/item/list?cashFilter=true&count=10000", "https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000"]);
function assertSafeItemDto(dto) {
  shape(dto, ["schemaVersion", "kind", "itemId", "identity", "source", "aggregate", "variants", "semantics"], ["sourceTypicalAttack"]);
  if (dto.schemaVersion !== 1 || dto.kind !== PROFILE.kind) fail("dto_profile");
  id(dto.itemId);
  shape(dto.identity, ["name", "status", "region", "clientVersion", "meaning", "evidence"]);
  if (dto.identity.name !== null && (typeof dto.identity.name !== "string" || !dto.identity.name.trim() || dto.identity.name.length > 300)) fail("dto_identity");
  if (!["unique_client_id", "conflicting_client_id", "unknown_client_id"].includes(dto.identity.status) || dto.identity.region !== "MCW" || dto.identity.clientVersion !== "1" || dto.identity.meaning !== "client_presence_not_market_availability_or_release" || !Array.isArray(dto.identity.evidence) || dto.identity.evidence.length > 4) fail("dto_identity");
  if (dto.identity.status === "unique_client_id" !== (dto.identity.name !== null) || dto.identity.name !== null && dto.identity.evidence.length === 0) fail("dto_identity_binding");
  for (const v of dto.identity.evidence) {
    shape(v, ["sourceUrl", "retainedMetadataSha256"]);
    if (!META_URLS.has(v.sourceUrl) || !HASH.test(v.retainedMetadataSha256)) fail("dto_identity_evidence");
  }
  shape(dto.source, ["provider", "operation", "sourceUrl", "rawBodySha256", "retrievedAt", "retrievalTimeKind", "sourceObservedAt", "window", "sourceWindowSemantics"]);
  if (dto.source.provider !== "maplestory.market" || dto.source.operation !== "prices" || dto.source.sourceUrl !== PROFILE.sourceUrl || !HASH.test(dto.source.rawBodySha256) || dto.source.sourceObservedAt !== null || dto.source.retrievalTimeKind !== "http_response_completed" || dto.source.sourceWindowSemantics !== "primary_client_reported_window_not_exact_observation_bounds") fail("dto_source");
  iso(dto.source.retrievedAt);
  shape(dto.source.window, ["reportedDays", "exactStartAt", "exactEndAt"]);
  if (dto.source.window.reportedDays !== 3 || dto.source.window.exactStartAt !== null || dto.source.window.exactEndAt !== null) fail("dto_window");
  function money(v, nullable = true) {
    if (v === null && nullable) return;
    if (typeof v !== "string" || v.length > 160 || !/^\d+(?:\.\d+)?$/.test(v)) fail("dto_price");
  }
  function s(v) {
    if (v === null) return;
    shape(v, ["reportedSalesCount", "reportedUnitCount", "reportedDaySalesCount", "reportedDayUnitCount", "averageUnitPrice", "medianUnitPrice", "basis", "dayCounterBoundsKnown"]);
    for (const k of ["reportedSalesCount", "reportedUnitCount", "reportedDaySalesCount", "reportedDayUnitCount"]) integer(v[k]);
    money(v.averageUnitPrice);
    money(v.medianUnitPrice);
    if (v.basis !== "source_labelled_sold_not_independently_confirmed_transactions" || v.dayCounterBoundsKnown !== false) fail("dto_sold");
  }
  function a(v) {
    if (v === null) return;
    shape(v, ["reportedListingCount", "reportedSellerCount", "medianUnitPrice", "p25UnitPrice", "p75UnitPrice", "basis", "currentAvailabilityVerified"]);
    integer(v.reportedListingCount);
    integer(v.reportedSellerCount);
    for (const k of ["medianUnitPrice", "p25UnitPrice", "p75UnitPrice"]) money(v[k]);
    if (v.basis !== "source_seen_asking_prices" || v.currentAvailabilityVerified !== false) fail("dto_asking");
  }
  function r(v, scopes, isItem = false) {
    if (v === null) return;
    shape(v, ["unitPrice", "basis", "reportedSamples", "scope", "aggregation", "exactVariantValue", "isNearFallback"]);
    money(v.unitPrice, false);
    integer(v.reportedSamples);
    if (!["sold", "listed"].includes(v.basis) || !scopes.includes(v.scope) || v.aggregation !== (isItem ? v.basis === "sold" ? "average" : "median" : "unknown") || v.exactVariantValue !== false || v.isNearFallback !== (v.scope === "near")) fail("dto_reference");
  }
  shape(dto.aggregate, ["sold", "asking", "reference"], ["dealReference"]);
  s(dto.aggregate.sold);
  a(dto.aggregate.asking);
  r(dto.aggregate.reference, ["item"], true);
  if (own(dto.aggregate, "dealReference")) r(dto.aggregate.dealReference, ["item"], true);
  shape(dto.variants, ["reportedStats", "successfulScrolls", "attackPools", "presence"]);
  shape(dto.variants.presence, ["reportedStats", "successfulScrolls", "attackPools"]);
  for (const value of Object.values(dto.variants.presence)) if (typeof value !== "boolean") fail("dto_presence");
  for (const [key, scopes] of [["reportedStats", ["stats"]], ["successfulScrolls", ["scrolls", "near"]], ["attackPools", ["attack", "near"]]]) {
    if (!Array.isArray(dto.variants[key]) || dto.variants[key].length > 2e4 || !dto.variants.presence[key] && dto.variants[key].length) fail("dto_groups");
    const seen = /* @__PURE__ */ new Set();
    for (const v of dto.variants[key]) {
      const stats = key === "reportedStats", attack = key === "attackPools";
      shape(v, attack ? ["groupKey", "reportedAttack", "sold", "asking", "reference", "qualityConstant", "matchSemantics"] : ["successfulUpgrades", "slotsLeft", "reference", "qualityConstant", "groupKey", "matchSemantics", ...stats ? ["reportedStats", "unreportedStats", "sourceComparisonMayIgnoreStats"] : []], stats ? [] : ["dealReference"]);
      let expectedKey;
      if (attack) {
        integer(v.reportedAttack);
        s(v.sold);
        a(v.asking);
        expectedKey = `attack:${dto.itemId}:${v.reportedAttack}`;
        if (v.matchSemantics !== "attack_only_pool_other_stats_not_constant") fail("dto_match");
      } else {
        integer(v.successfulUpgrades, 0, 100);
        integer(v.slotsLeft, 0, 100);
        expectedKey = `${stats ? "stats" : "scrolls"}:${dto.itemId}:u${v.successfulUpgrades}:s${v.slotsLeft}`;
        if (stats) {
          if (!object(v.reportedStats) || Object.keys(v.reportedStats).some((k) => !own(STAT_NAMES, k))) fail("dto_stats");
          for (const n of Object.values(v.reportedStats)) integer(n, -1e6, 1e6);
          expectedKey += ":" + Object.entries(v.reportedStats).sort((a2, b) => Number(a2[0]) - Number(b[0])).map(([k, n]) => `${k}=${n}`).join(",");
          if (v.unreportedStats !== "unknown_not_zero" || JSON.stringify(v.sourceComparisonMayIgnoreStats) !== '["10","11"]' || v.matchSemantics !== "reported_signature_not_certified_complete_roll") fail("dto_match");
        } else if (v.matchSemantics !== "successful_upgrades_and_slots_pool_all_stats") fail("dto_match");
      }
      if (v.groupKey !== expectedKey || seen.has(v.groupKey) || v.qualityConstant !== false) fail("dto_group_binding");
      seen.add(v.groupKey);
      r(v.reference, scopes);
      if (own(v, "dealReference")) r(v.dealReference, scopes);
    }
  }
  shape(dto.semantics, ["moneyUnit", "counts", "sampleThresholdApplied", "exactVariantHistoryAvailable", "cleanStateInferred", "feesApplied", "publicationAuthorized", "statMapSha256"]);
  if (dto.semantics.moneyUnit !== "source_unit_price_in_mesos" || dto.semantics.counts !== "source_reported_counts_not_independently_verified_trades" || dto.semantics.sampleThresholdApplied !== null || dto.semantics.statMapSha256 !== PROFILE.statMapSha256 || ["exactVariantHistoryAvailable", "cleanStateInferred", "feesApplied", "publicationAuthorized"].some((k) => dto.semantics[k] !== false)) fail("dto_semantics");
  if (own(dto, "sourceTypicalAttack")) integer(dto.sourceTypicalAttack);
  return true;
}
function filterReportedStats(dto, { stats = [], slotsLeft = null, successfulUpgrades = null } = {}) {
  assertSafeItemDto(dto);
  if (!Array.isArray(stats) || stats.length > 16) fail("filter_bound");
  const codes = /* @__PURE__ */ new Set();
  for (const q of stats) {
    shape(q, ["code"], ["minimum", "maximum"]);
    if (!own(STAT_NAMES, q.code) || codes.has(q.code)) fail("filter_stat");
    codes.add(q.code);
    if (own(q, "minimum")) integer(q.minimum, -1e6, 1e6);
    if (own(q, "maximum")) integer(q.maximum, -1e6, 1e6);
    if (own(q, "minimum") && own(q, "maximum") && q.minimum > q.maximum) fail("filter_range");
  }
  if (slotsLeft !== null) integer(slotsLeft, 0, 100);
  if (successfulUpgrades !== null) integer(successfulUpgrades, 0, 100);
  return dto.variants.reportedStats.filter((row) => (slotsLeft === null || row.slotsLeft === slotsLeft) && (successfulUpgrades === null || row.successfulUpgrades === successfulUpgrades) && stats.every((q) => own(row.reportedStats, q.code) && (!own(q, "minimum") || row.reportedStats[q.code] >= q.minimum) && (!own(q, "maximum") || row.reportedStats[q.code] <= q.maximum)));
}
function filterOptions(dto) {
  assertSafeItemDto(dto);
  const rows2 = dto.variants.reportedStats;
  return freeze({ stats: [...new Set(rows2.flatMap((v) => Object.keys(v.reportedStats)))].sort((a, b) => Number(a) - Number(b)).map((code) => ({ code, label: STAT_NAMES[code] })), slotsLeft: [...new Set(rows2.map((v) => v.slotsLeft))].sort((a, b) => a - b), successfulUpgrades: [...new Set(rows2.map((v) => v.successfulUpgrades))].sort((a, b) => a - b), unknownStatsMatch: false, attackPoolsAreSeparate: true });
}
function compareMoney(a, b) {
  const [ai, af = ""] = a.split("."), [bi, bf = ""] = b.split(".");
  if (ai.length !== bi.length) return ai.length < bi.length ? -1 : 1;
  if (ai !== bi) return ai < bi ? -1 : 1;
  const width = Math.max(af.length, bf.length), ap = af.padEnd(width, "0"), bp = bf.padEnd(width, "0");
  return ap === bp ? 0 : ap < bp ? -1 : 1;
}
function filterEvidenceGroups(dto, query) {
  assertSafeItemDto(dto);
  shape(query, ["kind"], ["stats", "slotsLeft", "successfulUpgrades", "minimumAttack", "maximumAttack", "minimumReferenceSamples", "basis", "includeNearFallback", "sortReference"]);
  if (!["reported_stats", "scroll_state", "attack_pool"].includes(query.kind)) fail("filter_kind");
  if (own(query, "basis") && !["sold", "listed"].includes(query.basis)) fail("filter_basis");
  if (own(query, "minimumReferenceSamples")) integer(query.minimumReferenceSamples);
  if (own(query, "includeNearFallback") && typeof query.includeNearFallback !== "boolean") fail("filter_near");
  if (own(query, "sortReference") && !["ascending", "descending"].includes(query.sortReference)) fail("filter_sort");
  let rows2;
  if (query.kind === "reported_stats") {
    if (own(query, "minimumAttack") || own(query, "maximumAttack")) fail("incompatible_filter_pool");
    rows2 = filterReportedStats(dto, { stats: query.stats ?? [], slotsLeft: query.slotsLeft ?? null, successfulUpgrades: query.successfulUpgrades ?? null });
  } else if (query.kind === "scroll_state") {
    if (own(query, "stats") || own(query, "minimumAttack") || own(query, "maximumAttack")) fail("incompatible_filter_pool");
    if (own(query, "slotsLeft")) integer(query.slotsLeft, 0, 100);
    if (own(query, "successfulUpgrades")) integer(query.successfulUpgrades, 0, 100);
    rows2 = dto.variants.successfulScrolls.filter((v) => (!own(query, "slotsLeft") || v.slotsLeft === query.slotsLeft) && (!own(query, "successfulUpgrades") || v.successfulUpgrades === query.successfulUpgrades));
  } else {
    if (own(query, "stats") || own(query, "slotsLeft") || own(query, "successfulUpgrades")) fail("incompatible_filter_pool");
    if (own(query, "minimumAttack")) integer(query.minimumAttack);
    if (own(query, "maximumAttack")) integer(query.maximumAttack);
    if (own(query, "minimumAttack") && own(query, "maximumAttack") && query.minimumAttack > query.maximumAttack) fail("filter_range");
    rows2 = dto.variants.attackPools.filter((v) => (!own(query, "minimumAttack") || v.reportedAttack >= query.minimumAttack) && (!own(query, "maximumAttack") || v.reportedAttack <= query.maximumAttack));
  }
  const matchedBeforeReferenceFilters = rows2.length;
  rows2 = rows2.filter((v) => (query.includeNearFallback === true || !v.reference?.isNearFallback) && (!own(query, "basis") || v.reference?.basis === query.basis) && (!own(query, "minimumReferenceSamples") || v.reference !== null && v.reference.reportedSamples >= query.minimumReferenceSamples));
  if (query.sortReference) rows2 = [...rows2].sort((a, b) => {
    if (a.reference === null || b.reference === null) return a.reference === b.reference ? 0 : a.reference === null ? 1 : -1;
    const n = compareMoney(a.reference.unitPrice, b.reference.unitPrice);
    return (query.sortReference === "descending" ? -n : n) || a.groupKey.localeCompare(b.groupKey, "en");
  });
  return freeze({
    kind: query.kind,
    rows: rows2,
    matchedBeforeReferenceFilters,
    nearFallbacksIncluded: query.includeNearFallback === true,
    sampleMeaning: "source_reference_samples_not_quantity_or_verified_fills",
    qualityConstant: false,
    temporalHistoryAvailable: false,
    source: dto.source
  });
}

// ops/api-item-reference-protocol.mjs
var HASH2 = /^[a-f0-9]{64}$/;
var enc = new TextEncoder();
var check = (v) => {
  if (!v) throw TypeError("Invalid item reference");
};
async function validatePublicItemReference(v) {
  v = structuredClone(v);
  check(enc.encode(JSON.stringify(v)).length <= 3e5);
  const keys = ["schemaVersion", "kind", "itemId", "projectionGeneration", "dtoSha256", "sourceCapturedAt", "sourceObservedAt", "reportedWindowDays", "exactWindowBoundsKnown", "qualifiedIndividualTrades", "sourceCreditUrl", "item"];
  check(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === keys.sort().join(","));
  assertSafeItemDto(v.item);
  check(v.schemaVersion === 1 && v.kind === "api_item_price_reference" && v.itemId === v.item.itemId && HASH2.test(v.projectionGeneration) && HASH2.test(v.dtoSha256) && v.sourceCapturedAt === v.item.source.retrievedAt && v.sourceObservedAt === null && v.reportedWindowDays === 3 && v.exactWindowBoundsKnown === false && v.qualifiedIndividualTrades === 0 && v.sourceCreditUrl === `https://maplestory.market/items/${v.itemId}?ref=v6kkdvp6`);
  check(await sha256(enc.encode(JSON.stringify(v.item))) === v.dtoSha256);
  return v;
}

// ui-src/item-api/item-loader.mjs
var sha = async (bytes3) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes3))].map((n) => n.toString(16).padStart(2, "0")).join("");
var abort = () => Object.assign(Error("Aborted"), { name: "AbortError" });
async function boundedBytes(response, limit) {
  const size = Number(response.headers.get("content-length"));
  if (Number.isFinite(size) && size > limit) throw Error("Body bound");
  if (response.body?.getReader) {
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    try {
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) {
          await reader.cancel();
          throw Error("Body bound");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const out = new Uint8Array(length);
    let at = 0;
    for (const b2 of chunks) {
      out.set(b2, at);
      at += b2.length;
    }
    return out;
  }
  const b = new Uint8Array(await response.arrayBuffer());
  if (b.length > limit) throw Error("Body bound");
  return b;
}
function createItemReferenceClient({ fetcher, enabled: enabled2 = false, isEnabled = () => true, now = Date.now, ttlMs = 3e4, timeoutMs = 1e4, maxItems = 32, maxBytes = 2097152, maxFlights = 4 } = {}) {
  if (!Number.isInteger(ttlMs) || ttlMs < 0 || ttlMs > 6e4 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12e3 || !Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > 64 || !Number.isSafeInteger(maxBytes) || maxBytes < 3e5 || maxBytes > 8388608 || !Number.isSafeInteger(maxFlights) || maxFlights < 1 || maxFlights > 8) throw Error("Bounded client settings required");
  let bytes3 = 0;
  const cache = /* @__PURE__ */ new Map(), flights = /* @__PURE__ */ new Map(), failures = /* @__PURE__ */ new Map();
  const active = () => enabled2 === true && isEnabled() === true;
  const touch = (id2, value) => {
    if (cache.has(id2)) bytes3 -= cache.get(id2).bytes;
    cache.delete(id2);
    cache.set(id2, value);
    bytes3 += value.bytes;
    while (cache.size > maxItems || bytes3 > maxBytes) {
      const first = cache.keys().next().value;
      bytes3 -= cache.get(first).bytes;
      cache.delete(first);
    }
  };
  const wait = (promise, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abort());
    const onAbort = () => {
      cleanup();
      reject(abort());
    }, cleanup = () => signal?.removeEventListener("abort", onAbort);
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then((v) => {
      cleanup();
      signal?.aborted ? reject(abort()) : resolve(v);
    }, (e) => {
      cleanup();
      reject(e);
    });
  });
  async function read(id2) {
    const prior = cache.get(id2), controller = new AbortController();
    let timer;
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Error("Read deadline"));
      }, timeoutMs);
    });
    const deadline = (p) => Promise.race([p, expired]);
    try {
      let response;
      for (let attempt = 0; attempt < 2; attempt++) {
        const generation2 = attempt === 0 ? prior?.data.projectionGeneration : null, url = "/api-item-prices/" + id2 + ".json" + (generation2 ? "?generation=" + generation2 : "");
        response = await deadline(fetcher(url, { method: "GET", credentials: "same-origin", cache: "no-cache", redirect: "error", signal: controller.signal, headers: prior ? { "If-None-Match": prior.etag } : {} }));
        if (response.status !== 409) break;
        if (attempt === 1) throw Error("Generation retry bound");
      }
      if (!active()) throw Error("Disabled");
      const mode = response.headers.get("X-Astra-API-Item-Mode"), captured = response.headers.get("X-Astra-API-Item-Captured-At"), generation = response.headers.get("X-Astra-API-Item-Generation"), etag = response.headers.get("ETag");
      if (!["validated_cache", "retained"].includes(mode) || !/^"api-item-[a-f0-9]{64}"$/.test(etag ?? "")) throw Error("Missing item context");
      if (response.status === 304) {
        if (!prior || prior.etag !== etag || prior.data.sourceCapturedAt !== captured || prior.data.projectionGeneration !== generation) throw Error("Mismatched304");
        const value2 = { ...prior, mode, expires: now() + ttlMs };
        touch(id2, value2);
        failures.delete(id2);
        return value2;
      }
      if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get("Content-Type") ?? "")) throw Error("Item unavailable");
      const body = await deadline(boundedBytes(response, 3e5));
      if ('"api-item-' + await sha(body) + '"' !== etag) throw Error("Body hash mismatch");
      const data = await validatePublicItemReference(parseStrictJson(body));
      if (data.itemId !== id2 || data.sourceCapturedAt !== captured || data.projectionGeneration !== generation || prior && Date.parse(data.sourceCapturedAt) < Date.parse(prior.data.sourceCapturedAt)) throw Error("Wrong/older item context");
      if (!active()) throw Error("Disabled");
      const value = { data, mode, etag, bytes: body.length, expires: now() + ttlMs };
      touch(id2, value);
      failures.delete(id2);
      return value;
    } catch (error) {
      const old = failures.get(id2)?.count ?? 0;
      failures.set(id2, { count: old + 1, retryAt: now() + Math.min(3e5, 3e4 * 2 ** Math.min(old, 4)) });
      while (failures.size > 64) failures.delete(failures.keys().next().value);
      if (prior && active()) {
        const value = { ...prior, mode: "retained" };
        touch(id2, value);
        return value;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  return Object.freeze({ async loadItem({ itemId, signal } = {}) {
    if (!Number.isSafeInteger(itemId) || itemId < 1 || itemId > 999999999) throw Error("Exact numeric ID required");
    if (!active() || typeof fetcher !== "function") throw Error("Not connected");
    let value = cache.get(itemId);
    if (value && now() < value.expires) return { data: structuredClone(value.data), mode: value.mode };
    if ((failures.get(itemId)?.retryAt ?? 0) > now()) {
      if (value) return { data: structuredClone(value.data), mode: "retained" };
      throw Error("Read backoff");
    }
    if (!flights.has(itemId)) {
      if (flights.size >= maxFlights) throw Error("Read capacity");
      const p = read(itemId);
      flights.set(itemId, p);
      p.finally(() => flights.delete(itemId)).catch(() => {
      });
    }
    value = await wait(flights.get(itemId), signal);
    return { data: structuredClone(value.data), mode: value.mode };
  }, state(id2) {
    const value = cache.get(id2);
    return value ? { mode: value.mode, capturedAt: value.data.sourceCapturedAt, generation: value.data.projectionGeneration } : null;
  }, clear() {
    cache.clear();
    failures.clear();
    bytes3 = 0;
  } });
}

// ops/api-discovery-membership.mjs
var NUMBER_PROTO = Object.getPrototypeOf(parseStrictJson("0.5"));
var enc2 = new TextEncoder();
var MembershipProfileError = class extends Error {
};
var check2 = (ok, code = "membership_profile") => {
  if (!ok) throw new MembershipProfileError(code);
};
var int = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  check2(Number.isSafeInteger(v) && v >= min && v <= max);
  return v;
};
var shape2 = (v, keys) => check2(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === [...keys].sort().join(","));
var clock = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
var hash = async (value) => sha256(typeof value === "string" ? enc2.encode(value) : value);

// ops/api-item-discovery-contract.mjs
var HASH3 = /^[a-f0-9]{64}$/;
async function validateManifest(m, p = null) {
  shape2(m, ["schemaVersion", "kind", "scope", "sourceCreditUrl", "priceProjectionGeneration", "identityMetadata", "spriteBindingsSha256", "providerBindingsSha256", "sources", "itemCount", "pages", "indexHash"]);
  check2(m.schemaVersion === 1 && m.kind === "api_item_identity_manifest" && m.scope === "accepted_api_identity_union_with_retained_api_memberships" && m.sourceCreditUrl === "https://maplestory.market/?ref=v6kkdvp6" && HASH3.test(m.priceProjectionGeneration) && HASH3.test(m.spriteBindingsSha256) && HASH3.test(m.providerBindingsSha256) && HASH3.test(m.indexHash) && Array.isArray(m.identityMetadata) && m.identityMetadata.length >= 1 && m.identityMetadata.length <= 4 && Array.isArray(m.sources) && m.sources.length >= 1 && m.sources.length <= 3 && Array.isArray(m.pages) && m.pages.length > 0 && m.pages.length <= 128);
  int(m.itemCount, 1, 1e4);
  let count = 0, last = 0, totalBytes = 0;
  for (const [page, d] of m.pages.entries()) {
    shape2(d, ["page", "firstItemId", "lastItemId", "itemCount", "sha256", "bytes", "url"]);
    check2(d.page === page && HASH3.test(d.sha256) && d.url === "/api-item-identities/" + d.sha256 + ".json");
    int(d.firstItemId, last + 1, 999999999);
    int(d.lastItemId, d.firstItemId, 999999999);
    int(d.itemCount, 1, 128);
    int(d.bytes, 1, 131072);
    count += d.itemCount;
    last = d.lastItemId;
    totalBytes += d.bytes;
  }
  check2(count === m.itemCount && totalBytes <= 8388608);
  const ops = /* @__PURE__ */ new Set();
  for (const s of m.sources) {
    shape2(s, ["operation", "sourceUrl", "retrievedAt", "sourceObservedAt", "sourceGeneratedAt", "sourceGeneratedAtKind", "itemCount"]);
    check2(["prices", "catalogue", "overview"].includes(s.operation) && !ops.has(s.operation) && s.sourceUrl === { prices: "https://maplestory.market/api/prices", catalogue: "https://maplestory.market/api/items", overview: "https://maplestory.market/api/market/overview" }[s.operation] && clock(s.retrievedAt) && s.sourceObservedAt === null);
    ops.add(s.operation);
    int(s.itemCount, 0, m.itemCount);
    check2(s.sourceGeneratedAt === null ? s.sourceGeneratedAtKind === null : clock(s.sourceGeneratedAt) && s.sourceGeneratedAtKind === "publisher_generation_not_individual_sale_time" && Date.parse(s.sourceGeneratedAt) <= Date.parse(s.retrievedAt));
  }
  check2(ops.has("prices"));
  for (const d of m.identityMetadata) {
    shape2(d, ["expectedSha256", "sourceUrl", "format"]);
    check2(HASH3.test(d.expectedSha256) && ["cash_client_catalog", "noncash_list"].includes(d.format) && d.sourceUrl === `https://maplestory.io/api/MCW/1/item/list?cashFilter=${d.format === "cash_client_catalog" ? "true" : "false"}&count=10000`);
  }
  const { indexHash, ...unsigned } = m;
  check2(await hash(JSON.stringify(unsigned)) === indexHash && (!p || p.indexHash === indexHash), "manifest_semantic_hash");
  return m;
}
function validatePage(page, descriptor, manifest) {
  shape2(page, ["schemaVersion", "kind", "rows"]);
  check2(page.schemaVersion === 1 && page.kind === "api_item_identity_page" && Array.isArray(page.rows) && page.rows.length === descriptor.itemCount);
  let last = descriptor.firstItemId - 1;
  for (const r of page.rows) {
    shape2(r, ["itemId", "name", "nameStatus", "sprite", "spriteStatus", "providerBindings", "memberships", "priceMembership"]);
    int(r.itemId, last + 1, descriptor.lastItemId);
    last = r.itemId;
    check2(["unique_client_id", "unknown_client_id", "conflicting_client_id"].includes(r.nameStatus) && (r.nameStatus === "unique_client_id" ? typeof r.name === "string" && r.name.trim() && r.name.length <= 300 : r.name === null));
    check2(r.sprite === null ? r.spriteStatus === "unavailable" : r.spriteStatus === "reviewed_local" && typeof r.sprite === "string" && /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(r.sprite));
    check2(Array.isArray(r.providerBindings) && r.providerBindings.length <= 4 && Array.isArray(r.memberships) && r.memberships.length > 0 && r.memberships.length <= 3 && ["in_committed_price_snapshot", "retained_price_identity_only", "no_accepted_price_membership"].includes(r.priceMembership));
    for (const b of r.providerBindings) {
      shape2(b, ["slug", "name", "planHash"]);
      check2(typeof b.slug === "string" && /^[a-z0-9][a-z0-9-]*$/.test(b.slug) && typeof b.name === "string" && b.name.length <= 300 && HASH3.test(b.planHash));
    }
    const ops = /* @__PURE__ */ new Set();
    for (const m of r.memberships) {
      shape2(m, ["operation", "presentInSnapshot", "lastSeenRetrievedAt", "latestSnapshotRetrievedAt", "sourceObservedAt"]);
      const s = manifest.sources.find((s2) => s2.operation === m.operation);
      check2(s && !ops.has(m.operation) && typeof m.presentInSnapshot === "boolean" && clock(m.lastSeenRetrievedAt) && m.latestSnapshotRetrievedAt === s.retrievedAt && Date.parse(m.lastSeenRetrievedAt) <= Date.parse(s.retrievedAt) && m.sourceObservedAt === null && (!m.presentInSnapshot || m.lastSeenRetrievedAt === m.latestSnapshotRetrievedAt));
      ops.add(m.operation);
    }
    const priced = r.memberships.find((m) => m.operation === "prices");
    check2(r.priceMembership === (priced?.presentInSnapshot ? "in_committed_price_snapshot" : priced ? "retained_price_identity_only" : "no_accepted_price_membership"));
  }
  check2(page.rows[0].itemId === descriptor.firstItemId && page.rows.at(-1).itemId === descriptor.lastItemId);
  return page;
}

// ui-src/item-api/discovery-client.mjs
var bytes2 = new TextEncoder();
var abort2 = () => Object.assign(Error("aborted"), { name: "AbortError" });
function createIdentityDiscoveryClient({ enabled: enabled2 = false, isEnabled = () => true, fetcher, now = Date.now, ttlMs = 3e4, timeoutMs = 1e4 } = {}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 0 || ttlMs > 6e4 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12e3) throw TypeError("Bounded client settings required");
  let good = null, flight = null, expires = 0, retryAt = 0, failures = 0;
  const pages = /* @__PURE__ */ new Map();
  let cacheBytes = 0;
  const active = () => {
    try {
      return enabled2 === true && isEnabled() === true;
    } catch {
      return false;
    }
  };
  const wait = (p, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abort2());
    const clear = () => signal?.removeEventListener("abort", cancel), cancel = () => {
      clear();
      reject(abort2());
    };
    signal?.addEventListener("abort", cancel, { once: true });
    p.then((v) => {
      clear();
      signal?.aborted ? reject(abort2()) : resolve(v);
    }, (e) => {
      clear();
      reject(e);
    });
  });
  async function get(url, limit, previous = null) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Error("read_deadline"));
      }, timeoutMs);
    });
    const deadline = (p) => Promise.race([p, timeout]);
    try {
      const response = await deadline(fetcher(url, { method: "GET", credentials: "same-origin", cache: "no-cache", redirect: "error", signal: controller.signal, headers: previous ? { "If-None-Match": previous.etag } : {} }));
      if (response.status === 409) throw Object.assign(Error("generation_changed"), { generationChanged: true });
      const mode = response.headers.get("X-Astra-API-Identity-Mode"), generation = response.headers.get("X-Astra-API-Identity-Generation"), etag = response.headers.get("ETag");
      if (!["validated_cache", "retained"].includes(mode) || !/^"api-identities-[a-f0-9]{64}"$/.test(etag ?? "")) throw Error("response_context");
      if (response.status === 304) {
        if (!previous || etag !== previous.etag || generation !== previous.generation) throw Error("invalid304");
        return { ...previous, mode };
      }
      if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get("Content-Type") ?? "")) throw Error("unavailable");
      const chunks = [], reader = response.body.getReader();
      let size = 0;
      try {
        for (; ; ) {
          const { done, value } = await deadline(reader.read());
          if (done) break;
          size += value.byteLength;
          if (size > limit) {
            await reader.cancel();
            throw Error("body_bound");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const raw = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        raw.set(c, offset);
        offset += c.length;
      }
      const sha2 = await hash(raw);
      if (etag !== '"api-identities-' + sha2 + '"') throw Error("body_hash");
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(raw), document: parseStrictJson(raw), etag, generation, mode, sha: sha2, bytes: size };
    } finally {
      clearTimeout(timer);
    }
  }
  const remember = (key, value) => {
    if (pages.has(key)) cacheBytes -= pages.get(key).bytes;
    pages.delete(key);
    pages.set(key, value);
    cacheBytes += value.bytes;
    while (pages.size > 8 || cacheBytes > 1048576) {
      const first = pages.keys().next().value;
      cacheBytes -= pages.get(first).bytes;
      pages.delete(first);
    }
  };
  async function collect() {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const manifestRecord = await get("/api-item-identities.json", 65536, good?.manifestRecord), manifest = await validateManifest(manifestRecord.document);
        if (manifestRecord.generation !== manifest.indexHash) throw Error("manifest_context");
        if (good) for (const old of good.manifest.sources) {
          const next = manifest.sources.find((s) => s.operation === old.operation);
          if (!next || Date.parse(next.retrievedAt) < Date.parse(old.retrievedAt)) throw Error("source_clock_regression");
        }
        const output = new Array(manifest.pages.length);
        let cursor = 0, retained = manifestRecord.mode === "retained";
        let cancelled = false;
        const workers = Array.from({ length: Math.min(4, manifest.pages.length) }, async () => {
          try {
            for (; ; ) {
              if (cancelled) return;
              if (!active()) throw Error("disabled");
              const i = cursor++;
              if (i >= manifest.pages.length) return;
              const d = manifest.pages[i];
              let record = pages.get(d.sha256);
              if (!record) {
                record = await get(d.url + "?generation=" + manifest.indexHash, 131072);
                if (record.generation !== manifest.indexHash || record.sha !== d.sha256 || record.bytes !== d.bytes) throw Error("page_context");
              }
              validatePage(record.document, d, manifest);
              if (record.mode === "retained") retained = true;
              remember(d.sha256, record);
              output[i] = record.document.rows;
            }
          } catch (error) {
            cancelled = true;
            throw error;
          }
        });
        const settled = await Promise.allSettled(workers), failed = settled.find((r) => r.status === "rejected");
        if (failed) throw failed.reason;
        const rows2 = output.flat();
        if (rows2.length !== manifest.itemCount) throw Error("row_count");
        for (const source of manifest.sources) if (rows2.filter((r) => r.memberships.some((m) => m.operation === source.operation && m.presentInSnapshot)).length !== source.itemCount) throw Error("membership_count");
        if (!active()) throw Error("disabled");
        const value = { manifest, rows: rows2, mode: retained ? "retained" : "validated_cache", manifestRecord };
        good = value;
        failures = 0;
        retryAt = 0;
        expires = now() + ttlMs;
        return value;
      } catch (error) {
        if (error.generationChanged && attempt === 0) continue;
        throw error;
      }
    }
    throw Error("generation_retry_bound");
  }
  return Object.freeze({ async load({ signal } = {}) {
    if (!active() || typeof fetcher !== "function") throw Error("not_connected");
    if (good && (now() < expires || now() < retryAt)) return structuredClone({ manifest: good.manifest, rows: good.rows, mode: now() < retryAt ? "retained" : good.mode });
    if (now() < retryAt) throw Error("read_backoff");
    if (!flight) {
      flight = collect().catch((error) => {
        retryAt = now() + Math.min(3e5, 3e4 * 2 ** Math.min(failures++, 4));
        if (good && active()) return { ...good, mode: "retained" };
        throw error;
      }).finally(() => flight = null);
    }
    const value = await wait(flight, signal);
    return structuredClone({ manifest: value.manifest, rows: value.rows, mode: value.mode });
  }, state() {
    return good ? { mode: now() < retryAt ? "retained" : good.mode, indexHash: good.manifest.indexHash, sources: structuredClone(good.manifest.sources) } : null;
  } });
}

// ui-src/item-api/discovery-bridge.mjs
function searchIdentityView(value) {
  const { manifest, rows: rows2, mode } = value;
  return {
    itemCount: manifest.itemCount,
    pricedItemCount: manifest.sources.find((s) => s.operation === "prices").itemCount,
    indexHash: manifest.indexHash,
    priceProjectionGeneration: manifest.priceProjectionGeneration,
    mode,
    sourceSnapshots: manifest.sources.map((s) => ({ ...s, capturedAt: s.retrievedAt })),
    rows: rows2.map((r) => ({
      ...r,
      name: r.name ?? `Item ${r.itemId} (name unavailable)`,
      memberships: r.memberships.map((m) => ({ ...m, capturedAt: m.lastSeenRetrievedAt })),
      hasRetainedPriceSnapshot: r.memberships.some((m) => m.operation === "prices"),
      hasCurrentAcceptedPriceSnapshot: r.priceMembership === "in_committed_price_snapshot",
      retainedPriceCapturedAt: r.memberships.find((m) => m.operation === "prices")?.lastSeenRetrievedAt ?? null
    }))
  };
}
function createSearchIdentityBridge(options = {}) {
  const client2 = createIdentityDiscoveryClient(options);
  return Object.freeze({
    async load({ signal } = {}) {
      return searchIdentityView(await client2.load({ signal }));
    },
    state: () => client2.state()
  });
}

// ui-src/item-api/lifecycle.mjs
function createItemPanelLifecycle({ container, mountPanel, loader, getTimezone = () => "UTC", spriteMap = {}, onStatus = () => {
} } = {}) {
  if (!container?.ownerDocument || typeof mountPanel !== "function") throw TypeError("Explicit item panel dependencies required");
  let epoch = 0, controller = null, handle = null, currentId = null, timezone = null, lastCapture = null;
  const clear = () => {
    handle?.destroy();
    handle = null;
  };
  return Object.freeze({
    async show(itemId) {
      if (!Number.isSafeInteger(itemId) || itemId < 1 || itemId > 999999999) throw TypeError("Exact numeric item ID required");
      const token = ++epoch;
      controller?.abort();
      controller = new AbortController();
      const ownController = controller;
      if (currentId !== itemId) {
        clear();
        lastCapture = null;
      }
      currentId = itemId;
      if (typeof loader !== "function") {
        onStatus("not_connected");
        return { status: "not_connected" };
      }
      onStatus("loading");
      try {
        const reply = await loader({ itemId, signal: ownController.signal });
        if (token !== epoch || ownController.signal.aborted) return { status: "stale" };
        const value = await validatePublicItemReference(reply);
        if (token !== epoch || ownController.signal.aborted) return { status: "stale" };
        if (value.itemId !== itemId || lastCapture !== null && Date.parse(value.sourceCapturedAt) < Date.parse(lastCapture)) throw TypeError("Wrong or older item reference");
        const options = { timezone: timezone ?? getTimezone(), spriteMap };
        if (handle) {
          handle.updateDto(value.item);
          handle.updateTimezone(options.timezone);
        } else handle = mountPanel(container, value.item, options);
        lastCapture = value.sourceCapturedAt;
        onStatus("shown");
        return { status: "shown", itemId, sourceCapturedAt: value.sourceCapturedAt, generation: value.projectionGeneration };
      } catch {
        if (token !== epoch || ownController.signal.aborted) return { status: "stale" };
        onStatus(handle ? "retained" : "unavailable");
        return { status: handle ? "retained" : "unavailable" };
      }
    },
    timezoneChanged(value) {
      timezone = value;
      handle?.updateTimezone(value);
    },
    hide() {
      epoch++;
      controller?.abort();
      controller = null;
      currentId = null;
      lastCapture = null;
      clear();
      onStatus("hidden");
    }
  });
}

// ui-src/item-api/panel.mjs
var instance = 0;
var pools = { reported_stats: "Reported stats", scroll_state: "Scroll state", attack_pool: "ATT pools" };
var labels = { "0": "STR", "1": "DEX", "2": "INT", "3": "LUK", "4": "Max HP", "5": "Max MP", "6": "Speed", "7": "Jump", "9": "Magic ATT", "10": "Weapon DEF", "11": "Magic DEF", "12": "Accuracy", "13": "Avoidability", "14": "Crit rate", "15": "Crit damage", "16": "Weapon ATT" };
var own2 = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function exactMoney(value) {
  if (value === null) return "Unknown";
  const [whole, decimal] = value.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (decimal === void 0 ? "" : "." + decimal);
}
function retrievalClock(iso2, zone2 = "UTC") {
  if (!Number.isFinite(Date.parse(iso2))) return "Unknown";
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone2, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso2)).map((p) => [p.type, p.value]));
    return `${parts.month}-${parts.day}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${zone2}`;
  } catch {
    return retrievalClock(iso2, "UTC");
  }
}
var spritePath = (value) => typeof value === "string" && /^\/?assets\/[A-Za-z0-9._/-]+\.png$/.test(value) && !value.split("/").includes("..") ? value : null;
var signature = (row) => Object.entries(labels).filter(([code]) => own2(row.reportedStats, code)).map(([code, label]) => `${label} ${row.reportedStats[code]}`).join(" \xB7 ") || "No stats reported";
function itemPanelModel(dto, query = { kind: "reported_stats" }, search = "") {
  assertSafeItemDto(dto);
  const result = filterEvidenceGroups(dto, query), needle = String(search).trim().toLowerCase();
  const rows2 = result.rows.filter((row) => !needle || [query.kind === "reported_stats" ? signature(row) : query.kind === "attack_pool" ? `Weapon ATT ${row.reportedAttack}` : `${row.successfulUpgrades} successful upgrades ${row.slotsLeft} slots`, row.reference?.basis ?? "unknown", row.reference?.unitPrice ?? ""].join(" ").toLowerCase().includes(needle));
  return { result, rows: rows2, options: filterOptions(dto) };
}
function mountItemPricingPanel(container, input, { timezone = "UTC", spriteMap = {} } = {}) {
  if (!container?.ownerDocument) throw new TypeError("A DOM container is required");
  assertSafeItemDto(input);
  let dto = structuredClone(input), zone2 = timezone, destroyed = false, page = 0;
  const doc2 = container.ownerDocument, id2 = `item-api-panel-${++instance}`, el = (tag, text, cls) => {
    const n = doc2.createElement(tag);
    if (text !== void 0) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const section = el("section", void 0, "api-item-panel");
  section.setAttribute("aria-labelledby", id2 + "-title");
  const title = el("h2", "Item prices & reported rolls");
  title.id = id2 + "-title";
  section.append(title);
  const identity2 = el("div", void 0, "api-item-identity"), name = el("h3"), image = el("img");
  image.width = 48;
  image.height = 48;
  identity2.append(name);
  section.append(identity2);
  const clock2 = el("p", void 0, "api-item-clock");
  clock2.dataset.rawDate = "true";
  section.append(clock2);
  section.append(el("p", "Reported 3-day lookback; exact start/end and individual sale times are unknown. Retrieval time does not establish when a trade occurred. Asking prices are separate evidence, not verified available offers.", "api-item-context"));
  const summary = el("div", void 0, "api-item-summary");
  section.append(summary);
  const credit = el("a", "Item prices from MapleStory Market \u2197");
  credit.target = "_blank";
  credit.rel = "noopener noreferrer";
  section.append(credit);
  const heading = el("h3", "Explore the reported price groups");
  section.append(heading);
  const tabs = el("div", void 0, "api-item-pools");
  tabs.setAttribute("role", "group");
  tabs.setAttribute("aria-label", "Price group");
  let pool = "reported_stats";
  for (const [key, label] of Object.entries(pools)) {
    const b = el("button", label);
    b.type = "button";
    b.dataset.pool = key;
    b.addEventListener("click", () => {
      pool = key;
      page = 0;
      sortColumn = "reference";
      sort = "ascending";
      renderRows();
    });
    tabs.append(b);
  }
  section.append(tabs);
  const explanation = el("p", void 0, "api-item-context");
  section.append(explanation);
  const controls = el("form", void 0, "api-item-filters");
  controls.addEventListener("submit", (event) => event.preventDefault());
  section.append(controls);
  const select = (key, label, choices) => {
    const wrapper = el("label", label), n = el("select");
    n.dataset.filter = key;
    for (const [value, text] of choices) {
      const option = el("option", text);
      option.value = value;
      n.append(option);
    }
    wrapper.append(n);
    controls.append(wrapper);
    return n;
  };
  const searchLabel = el("label", "Search these groups"), search = el("input");
  search.type = "search";
  search.maxLength = 200;
  search.dataset.filter = "search";
  searchLabel.append(search);
  controls.append(searchLabel);
  const slots = select("slots", "Slots remaining", [["", "Any"]]), upgrades = select("upgrades", "Successful upgrades", [["", "Any"]]), basis = select("basis", "Reference basis", [["", "Any"], ["sold", "Source sold"], ["listed", "Asking"]]);
  const samplesLabel = el("label", "Minimum reference samples"), samples = el("input");
  samples.type = "number";
  samples.min = "0";
  samples.step = "1";
  samples.value = "0";
  samples.dataset.filter = "samples";
  samplesLabel.append(samples);
  controls.append(samplesLabel);
  const attackBox = el("div", void 0, "api-item-stat-pair"), attackInputs = {};
  for (const [key, label] of [["minimumAttack", "ATT at least"], ["maximumAttack", "ATT at most"]]) {
    const l = el("label", label), n = el("input");
    n.type = "number";
    n.step = "1";
    n.min = "0";
    n.dataset.filter = key;
    attackInputs[key] = n;
    l.append(n);
    attackBox.append(l);
  }
  controls.append(attackBox);
  const statBox = el("fieldset"), legend = el("legend", "Reported stats \u2014 all entered limits must match");
  statBox.append(legend);
  controls.append(statBox);
  let statInputs = [];
  const nearLabel = el("label", void 0, "api-item-near"), near = el("input");
  near.type = "checkbox";
  near.dataset.filter = "near";
  nearLabel.append(near, doc2.createTextNode(" Include nearby fallback references (other qualities may differ)"));
  controls.append(nearLabel);
  const reset = el("button", "Reset filters");
  reset.type = "button";
  reset.dataset.reset = "true";
  reset.addEventListener("click", () => {
    controls.reset();
    samples.value = "0";
    page = 0;
    sort = "ascending";
    sortColumn = "reference";
    renderRows();
  });
  controls.append(reset);
  const feedback = el("p", void 0, "api-item-feedback");
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  section.append(feedback);
  const tableWrap = el("div", void 0, "api-item-table-wrap");
  tableWrap.tabIndex = 0;
  tableWrap.setAttribute("role", "region");
  tableWrap.setAttribute("aria-label", "Reported price groups, horizontally scrollable");
  section.append(tableWrap);
  const pager = el("div", void 0, "api-item-pager"), previous = el("button", "Previous 25"), next = el("button", "Next 25"), pageText = el("span");
  for (const b of [previous, next]) b.type = "button";
  previous.addEventListener("click", () => {
    page--;
    renderRows();
  });
  next.addEventListener("click", () => {
    page++;
    renderRows();
  });
  pager.append(previous, pageText, next);
  section.append(pager);
  section.append(el("p", "Unknown stats are not zero or proof of a clean item. Reported signatures may omit stats; DEF can be ignored by the source comparison. Scroll-state and ATT pools can mix other rolls. Group reference aggregation is unspecified. No per-roll price history, individual transactions, verified availability or fee adjustment is inferred.", "api-item-context"));
  let sort = "ascending", sortColumn = "reference";
  const fieldInt = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    if (n.value.trim() === "") return null;
    const value = Number(n.value);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw Error("Use whole numbers within the stated limits.");
    return value;
  };
  function query() {
    const q = { kind: pool, sortReference: sort, includeNearFallback: pool !== "reported_stats" && near.checked }, minimumSamples = fieldInt(samples);
    if (minimumSamples !== null && minimumSamples > 0) q.minimumReferenceSamples = minimumSamples;
    if (basis.value) q.basis = basis.value;
    if (pool === "attack_pool") {
      for (const [key, n] of Object.entries(attackInputs)) {
        const v = fieldInt(n);
        if (v !== null) q[key] = v;
      }
    } else {
      const s = fieldInt(slots, 0, 100), u = fieldInt(upgrades, 0, 100);
      if (s !== null) q.slotsLeft = s;
      if (u !== null) q.successfulUpgrades = u;
      if (pool === "reported_stats") q.stats = statInputs.flatMap(({ code, min, max }) => {
        const a = fieldInt(min, -1e6, 1e6), b = fieldInt(max, -1e6, 1e6);
        return a === null && b === null ? [] : [{ code, ...a === null ? {} : { minimum: a }, ...b === null ? {} : { maximum: b } }];
      });
    }
    return q;
  }
  function fillSummary() {
    name.textContent = dto.identity.name ?? `Item ${dto.itemId} \u2014 name unverified`;
    const path = spritePath(spriteMap[String(dto.itemId)]);
    image.remove();
    if (path && dto.identity.status === "unique_client_id") {
      image.src = path;
      image.alt = dto.identity.name + " game icon";
      identity2.prepend(image);
    }
    clock2.textContent = "Retrieved: " + retrievalClock(dto.source.retrievedAt, zone2) + " \xB7 underlying observation time unknown";
    credit.href = `https://maplestory.market/items/${dto.itemId}?ref=v6kkdvp6`;
    summary.replaceChildren();
    const card = (heading2, lines) => {
      const box = el("div", void 0, "api-item-summary-card");
      box.append(el("h3", heading2));
      for (const line of lines) box.append(el("p", line));
      summary.append(box);
    };
    const s = dto.aggregate.sold, a = dto.aggregate.asking, r = dto.aggregate.reference;
    card("Source-labelled sales", [`Median: ${exactMoney(s?.medianUnitPrice ?? null)} mesos`, `Average (AVG): ${exactMoney(s?.averageUnitPrice ?? null)} mesos`, s ? `${s.reportedSalesCount} reported sales \xB7 ${s.reportedUnitCount} reported units` : "Sales counts unknown", s ? `Source day counters: ${s.reportedDaySalesCount} sales \xB7 ${s.reportedDayUnitCount} units (bounds unknown)` : ""]);
    card("Asking prices", [`Median ask: ${exactMoney(a?.medianUnitPrice ?? null)} mesos`, `P25: ${exactMoney(a?.p25UnitPrice ?? null)} \xB7 P75: ${exactMoney(a?.p75UnitPrice ?? null)} mesos`, a ? `${a.reportedListingCount} reported listings \xB7 ${a.reportedSellerCount} reported sellers` : "Listing and seller counts unknown"]);
    card("Publisher reference", [r ? `${r.aggregation === "average" ? "Average of source-labelled sales" : "Median asking price"}: ${exactMoney(r.unitPrice)} mesos` : "Reference unavailable", r ? `${r.reportedSamples} reported reference samples` : "", "The reference is kept separate from the sale median."]);
  }
  let selectedPool = "";
  function fillPoolOptions() {
    const rows2 = pool === "scroll_state" ? dto.variants.successfulScrolls : dto.variants.reportedStats;
    for (const [select2, key] of [[slots, "slotsLeft"], [upgrades, "successfulUpgrades"]]) {
      select2.replaceChildren();
      for (const value of ["", ...[...new Set(rows2.map((row) => row[key]))].sort((a, b) => a - b)]) {
        const option = el("option", value === "" ? "Any" : String(value));
        option.value = String(value);
        select2.append(option);
      }
    }
    selectedPool = pool;
  }
  function buildFilters() {
    const options = filterOptions(dto);
    statInputs = [];
    fillPoolOptions();
    statBox.replaceChildren(legend);
    for (const { code, label } of options.stats) {
      const pair = el("div", void 0, "api-item-stat-pair"), entry = { code };
      for (const [key, suffix] of [["min", "at least"], ["max", "at most"]]) {
        const l = el("label", label + " " + suffix), n = el("input");
        n.type = "number";
        n.step = "1";
        n.min = "-1000000";
        n.max = "1000000";
        n.dataset.stat = code;
        n.dataset.bound = key;
        l.append(n);
        pair.append(l);
        entry[key] = n;
      }
      statInputs.push(entry);
      statBox.append(pair);
    }
  }
  function renderRows() {
    if (destroyed) return;
    if (selectedPool !== pool) fillPoolOptions();
    for (const b of tabs.children) b.setAttribute("aria-pressed", String(b.dataset.pool === pool));
    statBox.hidden = pool !== "reported_stats";
    attackBox.hidden = pool !== "attack_pool";
    slots.parentElement.hidden = upgrades.parentElement.hidden = pool === "attack_pool";
    nearLabel.hidden = pool === "reported_stats";
    explanation.textContent = pool === "reported_stats" ? "Filter the reported signature, slots and successful upgrades together. Unreported fields never match a numeric limit." : pool === "scroll_state" ? "This pool matches successful upgrades and remaining slots; other stats are not held constant." : "This pool matches only Weapon ATT; other stats, slots and upgrades are not held constant.";
    let model;
    try {
      model = itemPanelModel(dto, query(), search.value);
    } catch {
      feedback.textContent = "Check filter limits: use whole numbers, and a minimum no greater than its maximum.";
      tableWrap.replaceChildren();
      previous.disabled = next.disabled = true;
      pageText.textContent = "";
      return;
    }
    if (sortColumn !== "reference") {
      const value = (row) => sortColumn === "samples" ? row.reference?.reportedSamples ?? null : row[sortColumn] ?? null;
      model.rows.sort((a, b) => {
        const x = value(a), y = value(b);
        if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
        return (sort === "descending" ? -1 : 1) * (x - y) || a.groupKey.localeCompare(b.groupKey, "en");
      });
    }
    const total = model.rows.length, pages = Math.max(1, Math.ceil(total / 25));
    page = Math.max(0, Math.min(page, pages - 1));
    feedback.textContent = `${total} matching groups. ${near.checked && pool !== "reported_stats" ? "Nearby fallbacks included." : "Nearby fallbacks off."} Prices are mesos per item.`;
    const table = el("table"), caption = el("caption", pools[pool] + " \xB7 reported 3-day lookback"), thead = el("thead"), head = el("tr"), tbody = el("tbody");
    table.append(caption, thead, tbody);
    thead.append(head);
    const headings = pool === "attack_pool" ? ["Weapon ATT", "Sale median / average", "Sales / units", "Asking median / listings", "Reference price", "Basis / samples", "Nearby fallback"] : ["Reported signature / pool", "Slots left", "Successful upgrades", "Reference price", "Basis / samples", "Nearby fallback"];
    const sortable = { "Reference price": "reference", "Slots left": "slotsLeft", "Successful upgrades": "successfulUpgrades", "Weapon ATT": "reportedAttack", "Basis / samples": "samples" };
    for (const label of headings) {
      const th = el("th");
      th.scope = "col";
      if (sortable[label]) {
        const key = sortable[label], active = key === sortColumn;
        th.setAttribute("aria-sort", active ? sort : "none");
        const b = el("button", label + (active ? sort === "ascending" ? " \u2191" : " \u2193" : ""));
        b.type = "button";
        b.dataset.sort = key;
        b.addEventListener("click", () => {
          sort = key === sortColumn ? sort === "ascending" ? "descending" : "ascending" : "ascending";
          sortColumn = key;
          page = 0;
          renderRows();
        });
        th.append(b);
      } else th.textContent = label;
      head.append(th);
    }
    for (const row of model.rows.slice(page * 25, page * 25 + 25)) {
      const tr = el("tr");
      tr.dataset.groupKey = row.groupKey;
      const r = row.reference, deal = row.dealReference, nearText = deal ? deal.isNearFallback && !near.checked ? "Off" : `${exactMoney(deal.unitPrice)} mesos \xB7 ${deal.basis === "sold" ? "source sold" : "asking"} \xB7 ${deal.reportedSamples} samples${deal.isNearFallback ? " \xB7 nearby, qualities may differ" : ""}` : "Unavailable";
      const common = [r ? exactMoney(r.unitPrice) : "Unknown", r ? `${r.basis === "sold" ? "Source sold" : "Asking"} \xB7 ${r.reportedSamples} samples${r.isNearFallback ? " \xB7 nearby" : ""}` : "Unknown", nearText];
      const values = pool === "attack_pool" ? [row.reportedAttack, `${exactMoney(row.sold?.medianUnitPrice ?? null)} / ${exactMoney(row.sold?.averageUnitPrice ?? null)}`, row.sold ? `${row.sold.reportedSalesCount} / ${row.sold.reportedUnitCount}` : "Unknown", row.asking ? `${exactMoney(row.asking.medianUnitPrice)} / ${row.asking.reportedListingCount}` : "Unknown", ...common] : [pool === "reported_stats" ? signature(row) : "Scroll-state pool", row.slotsLeft, row.successfulUpgrades, ...common];
      for (const value of values) tr.append(el("td", String(value)));
      tbody.append(tr);
    }
    if (!total) {
      const tr = el("tr"), td = el("td", "No matching reported groups. Broader pools are available separately; they do not fill this result.");
      td.colSpan = headings.length;
      tr.append(td);
      tbody.append(tr);
    }
    tableWrap.replaceChildren(table);
    pageText.textContent = `Page ${page + 1} of ${pages}`;
    previous.disabled = page === 0;
    next.disabled = page + 1 === pages;
  }
  controls.addEventListener("input", () => {
    page = 0;
    renderRows();
  });
  controls.addEventListener("change", () => {
    page = 0;
    renderRows();
  });
  container.append(section);
  fillSummary();
  buildFilters();
  renderRows();
  return Object.freeze({ element: section, updateTimezone(value) {
    zone2 = value;
    fillSummary();
  }, updateDto(value) {
    assertSafeItemDto(value);
    dto = structuredClone(value);
    page = 0;
    controls.reset();
    fillSummary();
    buildFilters();
    renderRows();
  }, destroy() {
    destroyed = true;
    section.remove();
  } });
}

// ui-src/item-api/entry.mjs
var doc = document;
var available = doc.body.dataset.itemApiPreview === "available";
var scope = doc.getElementById("display-options");
var enabled = false;
var identity = null;
var identityFlight = null;
var host = null;
var life = null;
var lastId = null;
var latest = null;
var identityEpoch = 0;
var zone = () => doc.getElementById("display-timezone")?.value || "UTC";
var make = (tag, text) => {
  const n = doc.createElement(tag);
  if (text !== void 0) n.textContent = text;
  return n;
};
var validId = (id2) => Number.isSafeInteger(id2) && id2 > 0 && id2 <= 999999999;
var client = createItemReferenceClient({ fetcher: (...args) => fetch(...args), enabled: available, isEnabled: () => enabled });
var discovery = createSearchIdentityBridge({ fetcher: (...args) => fetch(...args), enabled: available, isEnabled: () => enabled });
var rows = () => identity?.rows ?? [];
var byId = (id2) => rows().find((r) => r.itemId === id2) || null;
function resolveId(record, slug) {
  const direct = /^id-([1-9][0-9]{0,8})$/.exec(slug ?? "");
  if (direct) return Number(direct[1]);
  if (validId(record?.canonicalId)) return record.canonicalId;
  const matched = rows().filter((r) => r.providerBindings.some((b) => b.slug === record?.slug && b.name === record?.name));
  return matched.length === 1 ? matched[0].itemId : null;
}
function hide() {
  life?.hide();
  host?.remove();
  life = null;
  host = null;
  lastId = null;
}
function identityShell(record, container) {
  const row = byId(record.canonicalId);
  container.replaceChildren();
  const title = make("h2", record.name), p = make("p", "Retained API identity. No daily history, fixed NX cost or current price is inferred from this entry.");
  container.append(title, p);
  if (row?.sprite) {
    const image = make("img");
    image.src = row.sprite;
    image.alt = record.name + " original game icon";
    image.width = 48;
    image.height = 48;
    title.prepend(image);
  }
  container.append(make("p", "Identity presence was retained from " + row.memberships.map((m) => m.operation + (m.presentInSnapshot ? " accepted snapshot \xB7 " : " retained membership \xB7 ") + retrievalClock(m.capturedAt, zone())).join(" \xB7 ") + ". Underlying source observation times are unknown."));
}
async function loadIdentities() {
  if (!available || !enabled) return null;
  const epoch = identityEpoch;
  if (identityFlight?.epoch === epoch) return identityFlight.promise;
  const task = { epoch };
  task.promise = (async () => {
    const value = await discovery.load();
    if (!enabled || epoch !== identityEpoch) return null;
    const changed = !identity || identity.indexHash !== value.indexHash || identity.mode !== value.mode;
    identity = value;
    if (changed) doc.dispatchEvent(new CustomEvent("astrapiitemidentities"));
    return value;
  })().finally(() => {
    if (identityFlight === task) identityFlight = null;
  });
  identityFlight = task;
  return task.promise;
}
function showItem(args) {
  latest = args;
  if (!available || !enabled) return;
  const id2 = resolveId(args.record, args.slug);
  if (!validId(id2)) {
    hide();
    return;
  }
  if (host && lastId === id2) {
    args.container.append(host);
    life.timezoneChanged(zone());
    return;
  }
  hide();
  lastId = id2;
  host = make("section");
  host.className = "api-item-preview-host";
  const status = make("p", "Loading separate item reference\u2026");
  status.className = "api-item-preview-status";
  status.setAttribute("role", "status");
  const body = make("div");
  host.append(status, body);
  args.container.append(host);
  life = createItemPanelLifecycle({ container: body, mountPanel: mountItemPricingPanel, loader: async (query) => {
    const value = await client.loadItem(query);
    status.dataset.mode = value.mode;
    return value.data;
  }, getTimezone: zone, spriteMap: { ...args.spriteMap, ...Object.fromEntries(rows().filter((r) => r.sprite).map((r) => [r.itemId, r.sprite])) }, onStatus: (value) => {
    const state = client.state(id2);
    status.textContent = (doc.body.dataset.itemApiSynthetic === "true" ? "SYNTHETIC OWN-SITE FIXTURE \xB7 " : "") + (value === "shown" ? state?.mode === "retained" ? "Retained item reference; original retrieval preserved." : "Separate item reference; retrieval is not trade time." : value === "retained" ? "Retained item reference; the new check failed." : value === "loading" ? "Reading this site\u2019s cached item reference\u2026" : value === "unavailable" ? "No validated item reference is connected. Daily and other-source evidence remain separate." : "");
  } });
  void life.show(id2);
}
function mergeSearchRecords(input) {
  const out = input.filter((r) => !r.apiIdentityOnly).map((r) => {
    const base = r.apiOriginal || { id: r.id, sprite: r.sprite, aliasNames: r.aliasNames };
    const copy = { ...r, ...base };
    delete copy.apiIdentity;
    delete copy.apiOriginal;
    return copy;
  });
  if (!enabled || !identity) return out;
  const originalFields = new Map(out.map((r) => [r, { id: r.id, sprite: r.sprite, aliasNames: r.aliasNames }]));
  const existing = /* @__PURE__ */ new Map();
  for (const r of out) {
    if (!validId(r.id)) {
      const id2 = resolveId({ slug: r.sourceSlug || r.slug, name: r.name });
      if (id2) r.id = id2;
    }
    if (validId(r.id)) {
      if (!existing.has(r.id)) existing.set(r.id, []);
      existing.get(r.id).push(r);
    }
  }
  for (const item of rows()) {
    const matches = existing.get(item.itemId) || [];
    if (matches.length) {
      for (const r of matches) {
        r.apiOriginal = originalFields.get(r);
        r.apiIdentity = item;
        r.aliasNames = [...r.aliasNames || [], item.name];
        r.sprite = r.sprite || item.sprite;
      }
      continue;
    }
    out.push({ key: "api-identity-" + item.itemId, slug: "id-" + item.itemId, id: item.itemId, name: item.name, type: "Retained API identity \xB7 no daily price inferred", price: null, priceDay: null, publisherMedian: null, knownNxCost: null, dailyRate: null, catalog: true, catalogKey: "api-identity-" + item.itemId, metadata: true, apiIdentityOnly: true, apiIdentity: item, sprite: item.sprite });
  }
  return out;
}
var api = { available, get enabled() {
  return enabled;
}, async setEnabled(value) {
  if (!available) return;
  const next = value === true;
  if (next !== enabled) identityEpoch++;
  enabled = next;
  if (button) {
    button.textContent = "Item API details: " + (enabled ? "On" : "Off");
    button.setAttribute("aria-pressed", String(enabled));
  }
  if (!enabled) {
    hide();
    doc.dispatchEvent(new CustomEvent("astrapiitemidentities"));
    if (location.hash.startsWith("#item/")) window.dispatchEvent(new Event("hashchange"));
    return;
  }
  try {
    const loaded = await loadIdentities();
    if (loaded && enabled && location.hash.startsWith("#item/")) window.dispatchEvent(new Event("hashchange"));
  } catch {
    if (note) note.textContent = "API identity collection unavailable; prior-source search remains available.";
  }
}, loadIdentities, resolveId, disabledIdentity(slug) {
  const match = /^id-([1-9][0-9]{0,8})$/.exec(slug ?? "");
  return available && !enabled && !!(match && byId(Number(match[1])));
}, findIdentity(slug) {
  const m = /^id-([1-9][0-9]{0,8})$/.exec(slug ?? ""), row = m && byId(Number(m[1]));
  return enabled && row ? { apiIdentityOnly: true, canonicalId: row.itemId, slug: "id-" + row.itemId, name: row.name } : null;
}, existingBinding(id2) {
  const row = byId(id2);
  return enabled && row?.providerBindings.length === 1 ? row.providerBindings[0] : null;
}, identityShell, showItem, beforeItemRender() {
  host?.remove();
}, hide, mergeSearchRecords, coverage() {
  return identity ? `${identity.mode === "retained" ? "Retained complete collection: " : ""}${identity.itemCount} accepted/retained API identity IDs; ${identity.pricedItemCount} appear in the accepted prices snapshot. Other entries may be retained or have no accepted price membership. Identity presence is not a price, sale, release or fresh observation.` : "";
}, peekIdentities: () => identity };
window.AstraItemApiPreview = Object.freeze(api);
var button = null;
var note = null;
if (available && scope) {
  const group = make("div");
  group.className = "api-item-preview-options";
  group.dataset.previewControls = "true";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Separate item API preview");
  button = make("button", "Item API details: Off");
  button.type = "button";
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => void api.setEnabled(!enabled));
  note = make("p", "Off by default. On adds a separate dated item panel and retained API identity search; it changes no headline, daily history or fee setting.");
  group.append(button, note);
  scope.append(group);
}
doc.getElementById("display-timezone")?.addEventListener("change", () => life?.timezoneChanged(zone()));
window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith("#item/")) hide();
});
doc.addEventListener("astramarketsnapshot", () => {
  if (enabled) void loadIdentities().catch(() => {
  });
});

})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "item-api-preview.js", status: "initialization_failed"}})); } catch {}
}
