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
  const maintainedLocalPreview = root.protocol === 'http:' && root.port === '8765' && ['127.0.0.1', 'localhost'].includes(root.hostname);
  const workerUrl = new URL('sw.js', root).href;
  let form,workspaceCandidate=false,localPasswordSession=false;
  const notifyWorkspaceCandidate=()=>document.dispatchEvent(new document.defaultView.CustomEvent('astraprivateworkspacecandidate'));
  function ownedWorkspaceResponse(response) {
    if(response?.status!==200||response.ok!==true||response.redirected===true||typeof response.url!=='string'||!/^application\/json(?:;|$)/i.test(response.headers?.get?.('Content-Type')||''))return false;
    try{const url=new URL(response.url);if(url.origin!==root.origin||url.search||url.hash||!url.pathname.startsWith(root.pathname))return false;const file=url.pathname.slice(root.pathname.length);return file==='version.json'||file==='data.json'||/^data-[a-f0-9]{16}\.json$/.test(file);}catch{return false;}
  }
  function showLock() {
    if (!footer || form) return;
    if (maintainedLocalPreview) { localPasswordSession=true; return; }
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
    workspaceCandidate=false;notifyWorkspaceCandidate();
    document.documentElement.dataset.previewLocked = 'true';
    document.body.hidden = true;
    location.reload();
  }
  window.astraPreviewSession = {
    privateWorkspaceCandidate:()=>workspaceCandidate,
    onResponse(response) {
      const accessMode=response?.headers?.get?.('X-Astra-Preview');
      if (accessMode !== 'password') {
        if(workspaceCandidate&&accessMode==='review'&&ownedWorkspaceResponse(response)){
          workspaceCandidate=false;form?.remove();form=undefined;localPasswordSession=false;notifyWorkspaceCandidate();
        }
        return true;
      }
      if (response.status === 401) { lockDocument(); return false; }
      if (response.ok) showLock();
      // Candidate only: the controls status endpoint remains the authority.
      if(!workspaceCandidate&&ownedWorkspaceResponse(response)){workspaceCandidate=true;notifyWorkspaceCandidate();}
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
    if (event.persisted && (form || localPasswordSession)) lockDocument();
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
/* Astra source: cash-activity-ranking.js */
try {
(()=>{'use strict';if(window.AstraCashActivity)return;
const finite=v=>typeof v==='number'&&Number.isFinite(v),count=v=>Number.isSafeInteger(v)&&v>0;
const state={mode:'value',minimumCount:0},controls=new Set();
const getState=()=>Object.freeze({...state});
const tie=(a,b)=>String(a.name||'').localeCompare(String(b.name||''))||String(a.slug||'').localeCompare(String(b.slug||''));
function cohort(model){
 if(model?.referenceOnly)return{available:false,kind:'fixed_basket',label:'Reference-week inflation dials keep their frozen item selection and weights; activity ranking does not apply'};
 if(model?.api===true)return{available:model.days===3,kind:'api_3day',label:'API reported 3-day count window (exact bounds unknown)'};
 if(!model||!Array.isArray(model.rows))return{available:false,kind:'unknown',label:'Count window unavailable'};
 if(!model.rolling)return{available:Number.isSafeInteger(model.days)&&model.days>0,kind:'daily',days:model.days,label:`Selected ${model.days}-source-day window · only complete qualifying-day coverage`};
 const candidates=model.rows.filter(r=>r&&!r.missing&&!r.referenceExclusion&&finite(r.referenceWeight)&&r.referenceWeight>0&&finite(r.rate)&&r.rate>0);
 const windows=new Set(candidates.map(r=>r.windowDays));
 const available=windows.size===1&&finite([...windows][0])&&[...windows][0]>0;
 return{available,kind:'rolling',days:available?[...windows][0]:null,label:available?`Common ${[...windows][0]}-day scanner count window`:'Activity unavailable: rolling item count windows differ or are unknown'};
}
function rank(input,{side='sell',rateKey='rate',model,selection=getState()}={}){
 const rows=Array.isArray(input)?input:[],scope=cohort(model),minimum=Number.isSafeInteger(selection.minimumCount)&&selection.minimumCount>=0?selection.minimumCount:0,active=selection.mode==='activity';
 if(!active&&minimum===0)return{rows:rows.slice(),scope,active:false,orderingApplied:false,excluded:0,status:'value',note:''};
 if(!scope.available)return{rows:[],scope,active,orderingApplied:true,excluded:rows.length,status:'unavailable',note:scope.label+'; choose Value ranking to see the dated raw ordering.'};
 const eligible=rows.filter(r=>r&&!r.missing&&!r.referenceExclusion&&finite(r.referenceWeight)&&r.referenceWeight>0&&count(r.quantity)&&r.quantity>=minimum&&(scope.kind!=='daily'||r.windowDays===scope.days));
 const result=active?eligible.filter(r=>finite(r[rateKey])&&r[rateKey]>0).map(r=>{
  const factor=r.quantity/(r.quantity+20),raw=side==='buy'?factor/r[rateKey]:r[rateKey]*factor;
  return{...r,activityFactor:factor,activityRawScore:finite(raw)&&raw>0?raw:null};
 }).filter(r=>r.activityRawScore!==null):eligible.filter(r=>finite(r[rateKey])).sort((a,b)=>(side==='buy'?a[rateKey]-b[rateKey]:b[rateKey]-a[rateKey])||tie(a,b));
 if(active){const max=Math.max(0,...result.map(r=>r.activityRawScore));for(const r of result)r.activityScore=100*(r.activityRawScore/max);result.sort((a,b)=>b.activityRawScore-a.activityRawScore||tie(a,b));}
 return{rows:result,scope,active,orderingApplied:true,excluded:rows.length-result.length,status:active?'activity':'minimum_count',note:active?'Activity-adjusted ordering; actual displayed rates and reference are unchanged.':'Reported-count filter; raw value order remains.'};
}
function explain(scope){return`Optional heuristic for ${scope?.label||'this single count window'}. Factor = n / (n + 20), where n is reported source sales count. Sell score = selected mesos/NX rate × factor; buy score = factor ÷ selected positive rate. Scores are rescaled to 0–100 within this cohort only. This trades some raw value for more recorded activity; 20 is an arbitrary transparent tuning choice, not statistical confidence. Counts are not physical units, verified trades, current stock or a liquidity guarantee. Captures are never summed. Missing counts and nonpositive fee-adjusted rates are excluded, not treated as zero. Scores across different windows/sources are not comparable.`;}
function setState(next){if(!next||!['value','activity'].includes(next.mode)||!Number.isSafeInteger(next.minimumCount)||next.minimumCount<0||next.minimumCount>Number.MAX_SAFE_INTEGER)return false;state.mode=next.mode;state.minimumCount=next.minimumCount;for(const c of controls){c.mode.value=state.mode;c.minimum.value=String(state.minimumCount);}document.dispatchEvent(new CustomEvent('astracashactivitychange',{detail:getState()}));return true;}
function configure(host,model){const box=host?.querySelector(':scope > .cash-activity-controls');if(!box)return;const scope=cohort(model);box.querySelector('[data-cash-activity-mode] option[value=activity]').disabled=!scope.available;box.querySelector('.cash-activity-window').textContent=scope.label+(scope.available?' · same-source counts only.':' · Activity option unavailable here.');box.querySelector('details p').textContent=explain(scope);}
function mount(host,model){if(!host)return;if(host.querySelector(':scope > .cash-activity-controls')){if(model)configure(host,model);return;}
 const box=document.createElement('section');box.className='cash-activity-controls';box.setAttribute('aria-label','Optional reported-activity ranking');
 const title=document.createElement('h3');title.textContent='Value and reported activity';box.append(title);
 const ml=document.createElement('label');ml.textContent='Ranking ';const mode=document.createElement('select');mode.dataset.cashActivityMode='true';for(const [value,label]of[['value','Value · original order'],['activity','Activity-adjusted value · optional']]){const o=document.createElement('option');o.value=value;o.textContent=label;mode.append(o);}ml.append(mode);box.append(ml);
 const cl=document.createElement('label');cl.textContent='Minimum reported sales count ';const minimum=document.createElement('input');minimum.type='number';minimum.min='0';minimum.step='1';minimum.value='0';minimum.dataset.cashActivityMinimum='true';cl.append(minimum);box.append(cl);
 const status=document.createElement('p');status.className='cash-activity-window';status.setAttribute('role','status');box.append(status);
 const details=document.createElement('details'),summary=document.createElement('summary'),p=document.createElement('p');summary.textContent='Activity score method and limitations';p.textContent=explain();details.append(summary,p);box.append(details);
 const update=()=>{const text=minimum.value.trim(),n=/^(0|[1-9][0-9]*)$/.test(text)?Number(text):NaN;if(!setState({mode:mode.value,minimumCount:n})){minimum.setCustomValidity('Use a safe nonnegative whole reported count.');minimum.reportValidity();}else minimum.setCustomValidity('');};mode.addEventListener('change',update);minimum.addEventListener('change',update);mode.value=state.mode;minimum.value=String(state.minimumCount);controls.add({mode,minimum});host.append(box);if(model)configure(host,model);
}
window.AstraCashActivity=Object.freeze({getState,setState,cohort,rank,explain,mount,configure});
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "cash-activity-ranking.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: upcoming-announcements.js */
try {
(() => {
'use strict';
// ui-src/upcoming-announcements/feed.json
var feed_default = {
  schemaVersion: 1,
  kind: "reviewed_classic_world_announcements",
  scope: {
    game: "MapleStory Classic World",
    region: "Global",
    targetWorld: "Windia",
    worldNameExplicitInReviewedPosts: false
  },
  reviewedAt: "2026-11-06T18:25:36.820292+00:00",
  coverage: {
    mode: "bounded_reviewed_primary_posts_not_exhaustive",
    automaticMonitoring: false,
    publicDiscordMessageContentsVerified: false,
    sourceIds: [
      "launch-46506",
      "cash-47031",
      "faq-45385"
    ]
  },
  sources: [
    {
      sourceId: "launch-46506",
      publisher: "Nexon",
      title: "Grand Launch Release Notes",
      url: "https://www.nexon.com/maplestory/news/general/46506/grand-launch-release-notes",
      cmsUrl: "https://g.nexonstatic.com/maplestory/cms/v1/news/46506",
      isMSCW: true,
      publishedAt: "2026-10-20T17:50:48Z",
      capturedAt: "2026-11-06T18:25:36.168774+00:00",
      bodySha256: "ba9a94b58f56515a7276339425bb5861f8f4ac3513c4f09020f5e7a71cb9798c"
    },
    {
      sourceId: "cash-47031",
      publisher: "Nexon",
      title: "Classic World Cash Shop Update: Nov. 4",
      url: "https://www.nexon.com/maplestory/news/general/47031/classic-world-cash-shop-update-nov-4",
      cmsUrl: "https://g.nexonstatic.com/maplestory/cms/v1/news/47031",
      isMSCW: true,
      publishedAt: "2026-11-03T16:00:00Z",
      capturedAt: "2026-11-06T18:25:35.765849+00:00",
      bodySha256: "027f2ced10bca9eae520cfc078cd7023314730b44c5ae89e4d3b9f012acaabe1"
    },
    {
      sourceId: "faq-45385",
      publisher: "Nexon",
      title: "MapleStory Classic World FAQ",
      url: "https://www.nexon.com/maplestory/news/general/45385/global-maple-story-classic-world-faq",
      cmsUrl: "https://g.nexonstatic.com/maplestory/cms/v1/news/45385",
      isMSCW: true,
      publishedAt: "2026-09-29T17:00:00Z",
      capturedAt: "2026-11-06T18:25:36.511094+00:00",
      bodySha256: "5ccc820a3c4bf3a9b675508ec853b4ce0b9d6b7875aa211cd55547abaf8dd3a2"
    }
  ],
  records: [
    {
      announcementId: "forgotten-hollow-november-2026",
      title: "Forgotten Hollow",
      kind: "world_update",
      status: "announced",
      date: {
        precision: "month",
        value: "2026-11",
        timeZone: null
      },
      summary: "The Grand Launch notes say this Classic World area is planned to open in November. The reviewed written notice gives no exact day, time or upcoming item lineup.",
      sourceIds: [
        "launch-46506"
      ],
      verifiedItems: [],
      nxPrice: null,
      rewardProbabilities: null,
      availabilityVerified: false,
      notes: "November 2026 follows the dated October 2026 notice. Exact roadmap days from community recaps are not independently verified primary evidence here."
    }
  ],
  referenceNotes: [
    {
      sourceId: "cash-47031",
      text: "The Nov. 4 cash-shop notice describes its scheduled sale window, not the next fashion lineup. A listed end at the start of Nov. 18 maintenance does not announce its replacement. Live shop availability was not checked."
    }
  ],
  limitations: [
    "No upcoming fashion or item reward lineup verified within this bounded primary review. This does not establish that no announcement exists.",
    "Windia is the user target; these Classic World articles do not separately name the world. No GMS/KMS or unrelated Worlds content is admitted.",
    "Unknown IDs, prices, probabilities and release times remain unknown. No future price, EV, stats or current-index effect is inferred."
  ]
};

// ui-src/upcoming-announcements/contract.mjs
var SHA = /^[a-f0-9]{64}$/;
var need = (v, c) => {
  if (!v) throw Error("upcoming_" + c);
};
var keys = (v, a) => need(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === [...a].sort().join(","), "fields");
var text = (v, max = 400) => need(typeof v === "string" && v.length > 0 && v.length <= max, "text");
var stamp = (v) => {
  text(v, 40);
  need(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 19) === v.slice(0, 19), "clock");
};
var official = (v) => {
  const u = new URL(v);
  need(u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && u.hostname === "www.nexon.com" && /^\/maplestory\/news\/general\/[1-9]\d*\/[a-z0-9-]+$/.test(u.pathname), "official_source");
};
function freeze(v) {
  if (v && typeof v === "object") {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function validateAnnouncements(input) {
  const f = structuredClone(input);
  keys(f, ["schemaVersion", "kind", "scope", "reviewedAt", "coverage", "sources", "records", "referenceNotes", "limitations"]);
  need(f.schemaVersion === 1 && f.kind === "reviewed_classic_world_announcements", "profile");
  keys(f.scope, ["game", "region", "targetWorld", "worldNameExplicitInReviewedPosts"]);
  need(f.scope.game === "MapleStory Classic World" && f.scope.region === "Global" && f.scope.targetWorld === "Windia" && typeof f.scope.worldNameExplicitInReviewedPosts === "boolean", "edition");
  stamp(f.reviewedAt);
  keys(f.coverage, ["mode", "automaticMonitoring", "publicDiscordMessageContentsVerified", "sourceIds"]);
  need(f.coverage.mode === "bounded_reviewed_primary_posts_not_exhaustive" && f.coverage.automaticMonitoring === false && f.coverage.publicDiscordMessageContentsVerified === false, "coverage");
  need(Array.isArray(f.sources) && f.sources.length > 0 && f.sources.length <= 32 && Array.isArray(f.records) && f.records.length <= 128, "bound");
  const sourceIds = /* @__PURE__ */ new Set();
  for (const s of f.sources) {
    keys(s, ["sourceId", "publisher", "title", "url", "cmsUrl", "isMSCW", "publishedAt", "capturedAt", "bodySha256"]);
    text(s.sourceId, 80);
    need(!sourceIds.has(s.sourceId), "source_duplicate");
    sourceIds.add(s.sourceId);
    need(s.publisher === "Nexon" && s.isMSCW === true && typeof s.bodySha256 === "string" && SHA.test(s.bodySha256), "source");
    official(s.url);
    need(/^https:\/\/g\.nexonstatic\.com\/maplestory\/cms\/v1\/news\/[1-9]\d*$/.test(s.cmsUrl), "cms_source");
    need(new URL(s.url).pathname.split("/")[4] === s.cmsUrl.split("/").at(-1), "article_binding");
    stamp(s.publishedAt);
    stamp(s.capturedAt);
    need(Date.parse(s.publishedAt) <= Date.parse(s.capturedAt) && Date.parse(s.capturedAt) <= Date.parse(f.reviewedAt), "clock_order");
    text(s.title, 200);
  }
  const refs = (a) => need(Array.isArray(a) && a.length > 0 && new Set(a).size === a.length && a.every((id) => sourceIds.has(id)), "source_reference");
  refs(f.coverage.sourceIds);
  const ids = /* @__PURE__ */ new Set();
  for (const r of f.records) {
    keys(r, ["announcementId", "title", "kind", "status", "date", "summary", "sourceIds", "verifiedItems", "nxPrice", "rewardProbabilities", "availabilityVerified", "notes"]);
    text(r.announcementId, 100);
    need(!ids.has(r.announcementId), "record_duplicate");
    ids.add(r.announcementId);
    text(r.title, 200);
    text(r.summary, 600);
    text(r.notes, 500);
    need(["world_update", "fashion", "item"].includes(r.kind) && ["announced", "scheduled", "released", "cancelled"].includes(r.status), "state");
    refs(r.sourceIds);
    keys(r.date, ["precision", "value", "timeZone"]);
    need(["unknown", "month", "day", "instant"].includes(r.date.precision), "date_precision");
    if (r.date.precision !== "unknown") need(typeof r.date.value === "string", "date_value");
    if (r.date.precision === "unknown") need(r.date.value === null && r.date.timeZone === null, "unknown_date");
    if (r.date.precision === "month") need(/^\d{4}-(?:0[1-9]|1[0-2])$/.test(r.date.value) && r.date.timeZone === null, "month");
    if (r.date.precision === "day") need(/^\d{4}-\d\d-\d\d$/.test(r.date.value) && (/* @__PURE__ */ new Date(r.date.value + "T00:00:00Z")).toISOString().slice(0, 10) === r.date.value && r.date.timeZone === "UTC", "day");
    if (r.date.precision === "instant") {
      stamp(r.date.value);
      need(r.date.timeZone === "UTC", "zone");
    }
    need(r.status !== "scheduled" || ["day", "instant"].includes(r.date.precision), "scheduled_precision");
    need(Array.isArray(r.verifiedItems) && r.verifiedItems.length === 0 && r.nxPrice === null && r.rewardProbabilities === null && r.availabilityVerified === false, "unverified_economics");
  }
  need(Array.isArray(f.referenceNotes) && f.referenceNotes.length <= 16 && Array.isArray(f.limitations) && f.limitations.length > 0 && f.limitations.length <= 16, "notes");
  for (const n of f.referenceNotes) {
    keys(n, ["sourceId", "text"]);
    need(sourceIds.has(n.sourceId), "note_source");
    text(n.text, 600);
  }
  for (const n of f.limitations) text(n, 600);
  return freeze(f);
}
function dateLabel(date, instant) {
  if (date.precision === "unknown") return "Unknown";
  if (date.precision === "month") return "(" + date.value.slice(5) + "-" + date.value.slice(0, 4) + ") \xB7 month only; day/time unknown";
  if (date.precision === "day") return "(" + date.value.slice(5, 7) + "-" + date.value.slice(8) + "-" + date.value.slice(0, 4) + ") \xB7 UTC calendar day; time unknown";
  return instant(date.value);
}

// ui-src/upcoming-announcements/entry.mjs
var feed = validateAnnouncements(feed_default);
if (!window.AstraUpcomingAnnouncements) {
  let enabled = false, query = "", kind = "all", status = "all", sort = "title", ascending = true;
  const make = (tag, text2, cls) => {
    const n = document.createElement(tag);
    if (text2 !== void 0) n.textContent = text2;
    if (cls) n.className = cls;
    return n;
  };
  const options = document.getElementById("display-options"), content = document.getElementById("content"), nav = document.querySelector(".nav-wrap nav");
  const state = () => Object.freeze({ enabled, sourceReviewAt: feed.reviewedAt, verifiedUpcomingItemLineups: feed.records.filter((r) => r.kind !== "world_update" && ["announced", "scheduled"].includes(r.status)).length, automaticMonitoring: false });
  window.AstraUpcomingAnnouncements = Object.freeze({ getState: state });
  if (options && content && nav && !document.getElementById("view-upcoming-announcements")) {
    let instant = function(value) {
      let z = zone();
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: z });
      } catch {
        z = "UTC";
      }
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date(value)).filter((p2) => p2.type !== "literal").map((p2) => [p2.type, p2.value]));
      return "(" + p.month + "-" + p.day + "-" + p.year + " " + p.hour + ":" + p.minute + ":" + p.second + " " + p.timeZoneName + ")";
    }, sourceLink = function(s) {
      const a = make("a", s.title + " \u2197");
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      return a;
    }, draw = function() {
      link.hidden = !enabled;
      toggle.textContent = "Upcoming items page: " + (enabled ? "On" : "Off");
      toggle.setAttribute("aria-pressed", String(enabled));
      clocks.textContent = "Reviewed " + instant(feed.reviewedAt) + ".";
      const rows = feed.records.filter((r) => r.kind !== "world_update" && (kind === "all" || r.kind === kind) && (status === "all" || r.status === status) && (r.title + " " + r.kind + " " + r.status + " " + r.summary).toLowerCase().includes(query));
      const sortValue = (r) => sort === "date" ? r.date.value : r[sort];
      rows.sort((a, b) => {
        const av = sortValue(a), bv = sortValue(b);
        if (av === null) return bv === null ? a.title.localeCompare(b.title) : 1;
        if (bv === null) return -1;
        return (ascending ? 1 : -1) * String(av).localeCompare(String(bv)) || a.title.localeCompare(b.title);
      });
      result.textContent = rows.length + " matching fashion/item announcements in this review.";
      host.replaceChildren();
      const table = make("table"), head = make("thead"), tr = make("tr");
      for (const [key, label] of [["title", "Announcement"], ["status", "Status"], ["date", "Stated timing"], ["source", "Official source"]]) {
        const th = make("th");
        th.scope = "col";
        th.setAttribute("aria-sort", sort === key ? ascending ? "ascending" : "descending" : "none");
        if (["title", "kind", "status", "date"].includes(key)) {
          const b = make("button", label + (sort === key ? ascending ? " \u2191" : " \u2193" : ""));
          b.type = "button";
          b.dataset.upcomingSort = key;
          th.append(b);
        } else th.textContent = label;
        tr.append(th);
      }
      head.append(tr);
      table.append(head);
      const body = make("tbody");
      for (const r of rows) {
        const row = make("tr");
        row.dataset.announcementId = r.announcementId;
        const title = make("td");
        title.append(make("strong", r.title), make("p", r.summary));
        row.append(title);
        const statusCell = make("td"), dot = make("span", "\u25CF", "announcement-dot " + r.status);
        dot.setAttribute("aria-hidden", "true");
        statusCell.append(dot, document.createTextNode(" " + r.status[0].toUpperCase() + r.status.slice(1)));
        row.append(statusCell);
        const date = make("td", dateLabel(r.date, instant));
        date.dataset.sourceDatePrecision = r.date.precision;
        row.append(date);
        const source = make("td");
        for (const id of r.sourceIds) {
          const s = feed.sources.find((s2) => s2.sourceId === id), part = make("p");
          part.append(sourceLink(s));
          const published = make("time", instant(s.publishedAt));
          published.dateTime = s.publishedAt;
          const captured = make("time", instant(s.capturedAt));
          captured.dateTime = s.capturedAt;
          part.append(make("br"), document.createTextNode("Published "), published, make("br"), document.createTextNode("Retrieved "), captured);
          source.append(part);
        }
        row.append(source);
        body.append(row);
      }
      if (!rows.length) {
        const empty = make("tr"), cell = make("td", "No matching verified fashion or item announcement in this review.");
        cell.colSpan = 4;
        empty.append(cell);
        body.append(empty);
      }
      table.append(body);
      host.append(table);
      world.replaceChildren();
      const worldRows = feed.records.filter((r) => r.kind === "world_update");
      if (worldRows.length) {
        world.append(make("h2", "Separate world-update context"));
        for (const r of worldRows) {
          const card = make("p");
          card.dataset.worldAnnouncement = r.announcementId;
          const when = make("span", dateLabel(r.date, instant));
          when.dataset.sourceDatePrecision = r.date.precision;
          card.append(make("strong", r.title + " \xB7 " + r.status + " "), when, document.createTextNode(". " + r.summary + " "), sourceLink(feed.sources.find((s) => s.sourceId === r.sourceIds[0])));
          world.append(card);
        }
      }
      refs.replaceChildren(make("summary", "Official sources and review details"));
      refs.append(make("p", "This is a dated, bounded manual review, not an automatic announcement feed. Publication/retrieval clocks are separate from release timing and market/trade clocks. Unknown item IDs, NX prices and probabilities are not zero, and no EV or index impact is calculated. Announced/Scheduled are not release confirmations; Released is a source claim, not current shop stock. Calendar passage never changes a record\u2019s status."));
      for (const s of feed.sources) {
        const para = make("p");
        para.append(sourceLink(s));
        const published = make("time", instant(s.publishedAt));
        published.dateTime = s.publishedAt;
        const captured = make("time", instant(s.capturedAt));
        captured.dateTime = s.capturedAt;
        para.append(make("br"), document.createTextNode("Published "), published, document.createTextNode(" \xB7 retrieved "), captured);
        refs.append(para);
      }
      for (const n of feed.referenceNotes) {
        const para = make("p", n.text + " ");
        para.append(sourceLink(feed.sources.find((s) => s.sourceId === n.sourceId)));
        refs.append(para);
      }
      for (const n of feed.limitations) refs.append(make("p", n));
    }, route = function() {
      if (location.hash === "#upcoming-announcements") {
        if (!enabled) {
          view.hidden = true;
          location.hash = "#index";
          return;
        }
        document.querySelectorAll(".view").forEach((s) => s.hidden = s !== view);
        link.setAttribute("aria-current", "page");
      } else {
        view.hidden = true;
        link.setAttribute("aria-current", "false");
      }
    };
    const zone = () => document.getElementById("display-timezone")?.value || "UTC";
    const controls = make("div", void 0, "upcoming-options");
    controls.dataset.previewControls = "upcoming-announcements";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Upcoming announcements visibility");
    const toggle = make("button");
    toggle.type = "button";
    toggle.className = "upcoming-toggle";
    toggle.setAttribute("aria-controls", "view-upcoming-announcements upcoming-announcements-nav");
    controls.append(toggle, make("small", "Optional dated official-news review. Off by default in each tab; no announcement polling or model changes."));
    options.append(controls);
    const link = make("a", "Upcoming items", "nav-link");
    link.id = "upcoming-announcements-nav";
    link.href = "#upcoming-announcements";
    link.hidden = true;
    nav.querySelector(".fallback-link")?.before(link);
    if (!link.isConnected) nav.append(link);
    const view = make("section", void 0, "view upcoming-page");
    view.id = "view-upcoming-announcements";
    view.hidden = true;
    view.setAttribute("aria-labelledby", "upcoming-announcements-title");
    const h = make("h1", "Upcoming fashion & items");
    h.id = "upcoming-announcements-title";
    view.append(
      make("p", "Classic World / official announcements", "eyebrow"),
      h,
      make("p", "No upcoming fashion or item lineup is verified in the reviewed official posts.", "upcoming-scope")
    );
    const clocks = make("p", void 0, "upcoming-clocks");
    view.append(clocks);
    const searchLabel = make("label", "Search reviewed announcements "), search = make("input");
    search.type = "search";
    search.id = "upcoming-announcements-search";
    search.placeholder = "Title, category or status";
    searchLabel.append(search);
    const filterLabel = make("label", "Category "), filter = make("select");
    filter.id = "upcoming-announcements-kind";
    for (const [value, label] of [["all", "Fashion and items"], ["fashion", "Fashion"], ["item", "Items"]]) {
      const o = make("option", label);
      o.value = value;
      filter.append(o);
    }
    filterLabel.append(filter);
    const statusLabel = make("label", "Status "), statusFilter = make("select");
    statusFilter.id = "upcoming-announcements-status";
    for (const value of ["all", "announced", "scheduled", "released", "cancelled"]) {
      const o = make("option", value[0].toUpperCase() + value.slice(1));
      o.value = value;
      statusFilter.append(o);
    }
    statusLabel.append(statusFilter);
    const form = make("div", void 0, "upcoming-filters");
    form.append(searchLabel, filterLabel, statusLabel);
    view.append(form);
    const result = make("p", void 0, "upcoming-results");
    result.setAttribute("role", "status");
    view.append(result);
    const host = make("div", void 0, "table-wrap upcoming-table");
    host.setAttribute("role", "region");
    host.setAttribute("aria-label", "Scrollable reviewed announcements");
    host.tabIndex = 0;
    view.append(host);
    const legend = make("p", "Status: yellow Announced / Scheduled \xB7 green Released \xB7 red Cancelled.", "upcoming-legend");
    view.append(legend);
    const world = make("section", void 0, "upcoming-world-context");
    world.setAttribute("aria-label", "Separate world-update context");
    view.append(world);
    const refs = make("details", void 0, "upcoming-sources");
    view.append(refs);
    toggle.addEventListener("click", () => {
      enabled = !enabled;
      draw();
      route();
    });
    search.addEventListener("input", () => {
      query = search.value.trim().toLowerCase();
      draw();
    });
    filter.addEventListener("change", () => {
      kind = filter.value;
      draw();
    });
    statusFilter.addEventListener("change", () => {
      status = statusFilter.value;
      draw();
    });
    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-upcoming-sort]");
      if (!b) return;
      ascending = sort === b.dataset.upcomingSort ? !ascending : true;
      sort = b.dataset.upcomingSort;
      draw();
      host.querySelector('[data-upcoming-sort="' + sort + '"]')?.focus();
    });
    document.getElementById("display-timezone")?.addEventListener("change", draw);
    content.append(view);
    window.addEventListener("hashchange", route);
    draw();
    route();
  }
}

})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "upcoming-announcements.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: item-api-preview.js */
try {
(() => {
'use strict';
// ui-src/item-api/search-price-relation.mjs
function qualifySearchPriceStatus(indicator, relation) {
  return relation?.pending && indicator.phase === "recent" ? { ...indicator, tone: "amber", phase: "publication_pending", label: "FAST price publication is separately dated" } : indicator;
}
function describeSearchPriceRelation(identity2, itemId, capturedAt) {
  if (identity2?.schemaVersion !== 2) return null;
  const source = identity2.sourceSnapshots.find((s) => s.operation === "prices"), row = identity2.rows.find((r) => r.itemId === itemId);
  if (!capturedAt) return { pending: false, label: "Identity membership is not a price; a current FAST price has not been verified for this selection." };
  if (!source || !row) return { pending: true, label: "No matching admitted identity membership is connected; the FAST reference remains separately dated." };
  if (Date.parse(source.capturedAt) < Date.parse(capturedAt)) return { pending: false, label: "The FAST price capture is newer than this identity membership snapshot; they remain independently versioned." };
  if (!row.memberships.some((m) => m.operation === "prices")) return { pending: true, label: "This known ID is absent from the latest published normalized prices membership. The FAST reference remains separately dated; membership does not verify stock or a current sale." };
  if (Date.parse(source.capturedAt) > Date.parse(capturedAt)) return { pending: true, label: "A newer normalized prices membership has been accepted. The displayed FAST reference keeps its older original retrieval until price publication catches up." };
  return { pending: false, label: source.capturedAt === capturedAt ? "Identity membership and FAST prices are independently versioned; equal capture clocks do not establish the same receipt." : "FAST prices and identity membership keep their separate original retrievals and publication versions." };
}

// ui-src/item-api/reference-status.mjs
var known = /* @__PURE__ */ new Set(["current", "ready", "shown", "validated", "accepted_cache", "validated_cache"]);
function describeReferenceStatus({ capturedAt = null, status = "idle", hasData = false, available: available2 = true, retained = false, partial = false, visible = true, online = true, bandMinutes = 20, now = Date.now() } = {}) {
  const stamp = typeof capturedAt === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(capturedAt) ? Date.parse(capturedAt) : NaN;
  const age = Number.isFinite(stamp) && Number.isFinite(now) ? now - stamp : null;
  let phase, tone = "amber", label;
  if (status === "site_access" || status === "access_denied") {
    phase = "access_blocked";
    tone = "red";
    label = "Site access unavailable";
  } else if (status === "off" || status === "disabled" || status === "hidden") {
    phase = "off";
    label = "Reference display inactive";
  } else if (!visible || !online || status === "paused") {
    phase = "paused";
    label = hasData ? "Checks paused; original retrieval retained" : "Checks paused; no validated reference yet";
  } else if (status === "loading") {
    phase = "loading";
    label = hasData ? "Checking cache; displayed reference keeps its original retrieval" : "Awaiting a validated cache response";
  } else if (!hasData) {
    phase = status === "not_published" || status === "not_found" ? "not_published" : ["unavailable", "failure", "failed", "error"].includes(status) ? "unavailable" : "unverified";
    tone = phase === "unavailable" ? "red" : "amber";
    label = phase === "not_published" ? "Reference not published here" : phase === "unavailable" ? "No validated reference available" : "Reference not yet verified";
  } else if (retained || status === "retained" || ["unavailable", "failure", "failed", "error"].includes(status)) {
    phase = "retained";
    label = "Retained reference; original retrieval unchanged";
  } else if (age === null) {
    phase = "clock_unknown";
    label = "Retrieval clock unavailable; age unknown";
  } else if (age < 0) {
    phase = "clock_uncertain";
    label = "Capture clock ahead; retrieval age uncertain";
  } else if (!available2) {
    phase = "unavailable";
    label = "Selected reference unavailable; missing values are not zero";
  } else if (partial && age <= bandMinutes * 6e4) {
    phase = "partial";
    label = "Partial item evidence; original retrieval retained";
  } else if (!known.has(status)) {
    phase = "unverified";
    label = "Reference state not yet verified";
  } else if (!Number.isFinite(bandMinutes) || bandMinutes <= 0) {
    phase = "clock_unknown";
    label = "Retrieval display band unavailable";
  } else if (age <= bandMinutes * 6e4) {
    phase = "recent";
    tone = "green";
    label = `Retrieved within ${bandMinutes}-minute display band; not verified fresh trades`;
  } else {
    phase = "aged";
    label = `Retrieval older than ${bandMinutes}-minute display band${partial ? "; partial item evidence remains incomplete" : ""}`;
  }
  return Object.freeze({ tone, phase, label, capturedAt: Number.isFinite(stamp) ? capturedAt : null, ageMs: age, bandMinutes });
}
function decorateReferenceStatus(node, state, text = node.textContent) {
  const icon = node.ownerDocument.createElement("i");
  icon.className = "source-status-dot status-" + state.tone;
  icon.setAttribute("aria-hidden", "true");
  const copy = node.ownerDocument.createElement("span");
  copy.textContent = text;
  node.replaceChildren(icon, copy);
  node.dataset.statusTone = state.tone;
  node.dataset.retrievalState = state.phase;
  node.title = state.label + "; retrieval is not individual sale or scan time.";
  if (state.capturedAt) node.dataset.rawCapturedAt = state.capturedAt;
  else delete node.dataset.rawCapturedAt;
}

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
  const parts2 = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)/.exec(v), d = new Date(v);
  if (d.toISOString().slice(0, 10) !== parts2[1] || Number(parts2[2]) > 23 || Number(parts2[3]) > 59 || Number(parts2[4]) > 59) fail("invalid_clock");
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

// ops/api-fast-item-public-protocol.mjs
var enc2 = new TextEncoder();
var H = /^[a-f0-9]{64}$/;
var FAST_ITEM_PROTOCOL = "fast-current-v1";
var FAST_ITEM_HEADERS = Object.freeze({ protocol: "X-Astra-API-Item-Protocol", epoch: "X-Astra-API-Item-Epoch", revision: "X-Astra-API-Item-Publication", binding: "X-Astra-API-Item-Binding" });
var need = (v) => {
  if (!v) throw TypeError("Invalid FAST item ordering");
};
var validPublicEpoch = (v) => typeof v === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(v);
var iso2 = (v) => typeof v === "string" && v.length === 24 && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function fields(v, now) {
  need(v && validPublicEpoch(v.epoch) && Number.isSafeInteger(v.revision) && v.revision > 0 && H.test(v.generation) && iso2(v.capturedAt) && Date.parse(v.capturedAt) <= now && H.test(v.bodySha256));
}
var tuple = (v) => enc2.encode(JSON.stringify([FAST_ITEM_PROTOCOL, v.epoch, String(v.revision), v.generation, v.capturedAt, v.bodySha256]));
function hasFastItemHeaders(headers) {
  return Object.values(FAST_ITEM_HEADERS).some((k) => headers.has(k));
}
async function validateFastItemHeaders(headers, { generation, capturedAt, bodySha256, now = Date.now() } = {}) {
  need(headers.get(FAST_ITEM_HEADERS.protocol) === FAST_ITEM_PROTOCOL);
  const raw = headers.get(FAST_ITEM_HEADERS.revision);
  need(typeof raw === "string" && /^[1-9][0-9]{0,15}$/.test(raw));
  const v = { epoch: headers.get(FAST_ITEM_HEADERS.epoch), revision: Number(raw), generation, capturedAt, bodySha256 };
  fields(v, now);
  need(String(v.revision) === raw && headers.get(FAST_ITEM_HEADERS.binding) === await sha256(tuple(v)));
  return Object.freeze(v);
}
function parseFastItemError(raw, { kind, itemId, generation, capturedAt }) {
  need(raw instanceof Uint8Array && raw.length > 0 && raw.length <= 4096);
  const v = parseStrictJson(raw);
  need(v && Object.keys(v).sort().join("|") === "generation|itemId|kind|schemaVersion|sourceCapturedAt|sourceObservedAt" && v.schemaVersion === 1 && v.kind === "fast_item_" + kind && v.itemId === itemId && v.generation === generation && v.sourceCapturedAt === capturedAt && v.sourceObservedAt === null);
  return v;
}

// ui-src/item-api/item-loader.mjs
var sha = async (bytes4) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes4))].map((n) => n.toString(16).padStart(2, "0")).join("");
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
var failure = (code) => Object.assign(Error(code), { code });
function createItemReferenceClient({ fetcher, enabled: enabled2 = false, isEnabled = () => true, now = Date.now, ttlMs = 3e4, timeoutMs = 1e4, maxItems = 32, maxBytes = 2097152, maxFlights = 4 } = {}) {
  if (!Number.isInteger(ttlMs) || ttlMs < 0 || ttlMs > 6e4 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12e3 || !Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > 64 || !Number.isSafeInteger(maxBytes) || maxBytes < 3e5 || maxBytes > 8388608 || !Number.isSafeInteger(maxFlights) || maxFlights < 1 || maxFlights > 8) throw Error("Bounded client settings required");
  let bytes4 = 0, blocked = false, fastSeen = false, fastEpoch = null, high = null, saturatedAt = 0;
  const cache = /* @__PURE__ */ new Map(), flights = /* @__PURE__ */ new Map(), controllers = /* @__PURE__ */ new Map(), failures = /* @__PURE__ */ new Map(), tombstones = /* @__PURE__ */ new Map();
  const active = () => enabled2 === true && isEnabled() === true;
  const touch = (id2, value) => {
    if (cache.has(id2)) bytes4 -= cache.get(id2).bytes;
    cache.delete(id2);
    cache.set(id2, value);
    bytes4 += value.bytes;
    while (cache.size > maxItems || bytes4 > maxBytes) {
      const first = cache.keys().next().value;
      bytes4 -= cache.get(first).bytes;
      cache.delete(first);
    }
  };
  const drop = (id2) => {
    const old = cache.get(id2);
    if (old) bytes4 -= old.bytes;
    cache.delete(id2);
  };
  function recognize(response) {
    const marked = hasFastItemHeaders(response.headers);
    if (marked && !fastSeen) {
      fastSeen = true;
      for (const [id2, v] of [...cache]) if (!v.fast) drop(id2);
    }
    return marked;
  }
  function missing(id2, frame) {
    if (!frame) return;
    const old = tombstones.get(id2);
    if (old && old.revision > frame.revision) return;
    if (!old && tombstones.size >= 64) {
      saturatedAt = Math.max(saturatedAt, frame.revision);
      return;
    }
    tombstones.set(id2, frame);
  }
  function admit(frame, id2, negative = false, prior = null) {
    if (fastEpoch !== null && frame.epoch !== fastEpoch) throw failure("invalid");
    if (high && (frame.revision < high.revision || Date.parse(frame.capturedAt) < Date.parse(high.capturedAt) || frame.revision === high.revision && (frame.generation !== high.generation || frame.capturedAt !== high.capturedAt))) throw failure("invalid");
    const absent = tombstones.get(id2);
    if (!negative && (frame.revision <= saturatedAt || absent && frame.revision <= absent.revision)) throw failure("invalid");
    if (!negative && prior?.fast && frame.revision === prior.fast.revision && (frame.bodySha256 !== prior.fast.bodySha256 || frame.generation !== prior.fast.generation || frame.capturedAt !== prior.fast.capturedAt)) throw failure("invalid");
    if (!high || frame.revision > high.revision) {
      for (const [k, v] of tombstones) if (v.revision < frame.revision) tombstones.delete(k);
      if (saturatedAt < frame.revision) saturatedAt = 0;
      for (const [k, v] of [...cache]) if (v.fast && v.fast.revision < frame.revision) touch(k, { ...v, mode: "retained", expires: 0 });
    }
    high = { epoch: frame.epoch, revision: frame.revision, generation: frame.generation, capturedAt: frame.capturedAt };
    fastEpoch = frame.epoch;
    if (negative) missing(id2, frame);
    else tombstones.delete(id2);
  }
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
    const prior = cache.get(id2), control = { controller: new AbortController(), cancelled: false, timedOut: false, fastDeadline: performance.now() + timeoutMs };
    let captureFloor = prior?.data.sourceCapturedAt ?? failures.get(id2)?.capturedAtFloor ?? null, negativeSeen = false;
    controllers.set(id2, control);
    let timer;
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => {
        control.timedOut = true;
        control.controller.abort();
        reject(failure("timeout"));
      }, timeoutMs);
    });
    const deadline = (p) => Promise.race([p, expired]);
    const fence = () => {
      if (control.cancelled || !active()) throw abort();
      if (control.timedOut || performance.now() >= control.fastDeadline) {
        control.timedOut = true;
        control.controller.abort();
        throw failure("timeout");
      }
      if (blocked) throw failure("access_denied");
    };
    function commit(action) {
      const old = { bytes: bytes4, fastEpoch, high, saturatedAt, cache: new Map(cache), tombstones: new Map(tombstones), failures: new Map(failures) };
      fence();
      try {
        action();
        fence();
      } catch (error) {
        bytes4 = old.bytes;
        fastEpoch = old.fastEpoch;
        high = old.high;
        saturatedAt = old.saturatedAt;
        for (const [target, saved] of [[cache, old.cache], [tombstones, old.tombstones], [failures, old.failures]]) {
          target.clear();
          for (const [k, v] of saved) target.set(k, v);
        }
        throw error;
      }
    }
    async function headerFrame(response, values) {
      try {
        const frame = await deadline(validateFastItemHeaders(response.headers, { ...values, now: now() }));
        fence();
        return frame;
      } catch {
        fence();
        throw failure("invalid");
      }
    }
    async function errorFrame(response, kind) {
      const capturedAt = response.headers.get("X-Astra-API-Item-Captured-At"), generation = response.headers.get("X-Astra-API-Item-Generation"), etag = response.headers.get("ETag");
      if (!/^application\/json(?:;|$)/i.test(response.headers.get("Content-Type") ?? "") || !/^"api-item-[a-f0-9]{64}"$/.test(etag ?? "")) throw failure("invalid");
      const raw = await deadline(boundedBytes(response, 4096));
      fence();
      const bodySha256 = await deadline(sha(raw));
      fence();
      if (etag !== '"api-item-' + bodySha256 + '"') throw failure("invalid");
      try {
        parseFastItemError(raw, { kind, itemId: id2, generation, capturedAt });
      } catch {
        throw failure("invalid");
      }
      return headerFrame(response, { generation, capturedAt, bodySha256 });
    }
    try {
      let response;
      for (let attempt = 0; attempt < 2; attempt++) {
        const generation2 = attempt === 0 ? prior?.data.projectionGeneration : null, url = "/api-item-prices/" + id2 + ".json" + (generation2 ? "?generation=" + generation2 : "");
        response = await deadline(fetcher(url, { method: "GET", credentials: "same-origin", cache: "no-cache", redirect: "error", signal: control.controller.signal, headers: prior ? { "If-None-Match": prior.etag } : {} }));
        fence();
        if (response.status === 401 || response.status === 403) throw failure("access_denied");
        const marked = recognize(response);
        fence();
        if (response.status === 404) {
          negativeSeen = true;
          drop(id2);
          missing(id2, prior?.fast);
          if (fastSeen) {
            if (!marked) throw failure("invalid");
            const frame = await errorFrame(response, "membership_absent");
            commit(() => admit(frame, id2, true));
            if (captureFloor === null || Date.parse(frame.capturedAt) > Date.parse(captureFloor)) captureFloor = frame.capturedAt;
          }
          throw failure("not_found");
        }
        if (response.status !== 409) break;
        if (fastSeen) {
          if (!marked) throw failure("invalid");
          const frame = await errorFrame(response, "generation_changed");
          commit(() => admit(frame, id2));
        }
        if (attempt === 1) throw failure("generation_changed");
      }
      const mode = response.headers.get("X-Astra-API-Item-Mode"), captured = response.headers.get("X-Astra-API-Item-Captured-At"), generation = response.headers.get("X-Astra-API-Item-Generation"), etag = response.headers.get("ETag");
      if (response.status !== 200 && response.status !== 304) throw failure("unavailable");
      if (!["validated_cache", "retained"].includes(mode) || !/^"api-item-[a-f0-9]{64}"$/.test(etag ?? "")) throw failure("invalid");
      if (response.status === 304) {
        if (!prior || prior.etag !== etag || prior.data.sourceCapturedAt !== captured || prior.data.projectionGeneration !== generation) throw failure("invalid");
        let fast2 = null;
        if (fastSeen) {
          if (!hasFastItemHeaders(response.headers)) throw failure("invalid");
          fast2 = await headerFrame(response, { generation, capturedAt: captured, bodySha256: etag.slice(10, -1) });
          fence();
        }
        const value2 = { ...prior, mode, fast: fast2, expires: now() + ttlMs };
        commit(() => {
          if (fast2) admit(fast2, id2, false, prior);
          touch(id2, value2);
          failures.delete(id2);
        });
        return value2;
      }
      if (!/^application\/json(?:;|$)/i.test(response.headers.get("Content-Type") ?? "")) throw failure("invalid");
      const body = await deadline(boundedBytes(response, 3e5));
      fence();
      if ('"api-item-' + await deadline(sha(body)) + '"' !== etag) throw failure("invalid");
      fence();
      let data;
      try {
        data = await deadline(validatePublicItemReference(parseStrictJson(body)));
      } catch {
        throw failure("invalid");
      }
      fence();
      if (data.itemId !== id2 || data.sourceCapturedAt !== captured || data.projectionGeneration !== generation || captureFloor !== null && Date.parse(data.sourceCapturedAt) < Date.parse(captureFloor)) throw failure("invalid");
      let fast = null;
      if (fastSeen) {
        if (!hasFastItemHeaders(response.headers)) throw failure("invalid");
        fast = await headerFrame(response, { generation, capturedAt: captured, bodySha256: etag.slice(10, -1) });
        fence();
      }
      const value = { data, mode, etag, fast, bytes: body.length, expires: now() + ttlMs };
      commit(() => {
        if (fast) admit(fast, id2, false, prior);
        touch(id2, value);
        failures.delete(id2);
      });
      return value;
    } catch (error) {
      if (control.cancelled || !active() || error?.name === "AbortError" && !control.timedOut) throw abort();
      const reason = control.timedOut ? "timeout" : ["timeout", "access_denied", "not_found", "generation_changed", "invalid", "unavailable"].includes(error?.code) ? error.code : "unavailable", old = failures.get(id2)?.count ?? 0;
      failures.set(id2, { count: old + 1, reason, checkedAt: now(), retryAt: now() + Math.min(3e5, 3e4 * 2 ** Math.min(old, 4)), capturedAtFloor: captureFloor });
      while (failures.size > 64) failures.delete(failures.keys().next().value);
      if (reason === "access_denied") {
        blocked = true;
        throw failure(reason);
      }
      if (negativeSeen || reason === "not_found") {
        drop(id2);
        throw failure("not_found");
      }
      if (prior && active() && (!fastSeen || prior.fast)) {
        const value = { ...prior, mode: "retained", expires: prior.fast && high && prior.fast.revision < high.revision ? 0 : prior.expires };
        touch(id2, value);
        return value;
      }
      throw failure(reason);
    } finally {
      clearTimeout(timer);
      if (controllers.get(id2) === control) controllers.delete(id2);
    }
  }
  return Object.freeze({
    async loadItem({ itemId, signal } = {}) {
      if (!Number.isSafeInteger(itemId) || itemId < 1 || itemId > 999999999) throw Error("Exact numeric ID required");
      if (!active() || typeof fetcher !== "function") throw failure("disabled");
      if (blocked) throw failure("access_denied");
      let value = cache.get(itemId);
      if (value && now() < value.expires) return { data: structuredClone(value.data), mode: value.mode };
      if ((failures.get(itemId)?.retryAt ?? 0) > now()) {
        if (value) return { data: structuredClone(value.data), mode: "retained" };
        throw failure(failures.get(itemId).reason);
      }
      if (!flights.has(itemId)) {
        if (flights.size >= maxFlights) throw failure("read_capacity");
        const task = read(itemId);
        flights.set(itemId, task);
        task.finally(() => {
          if (flights.get(itemId) === task) flights.delete(itemId);
        }).catch(() => {
        });
      }
      value = await wait(flights.get(itemId), signal);
      return { data: structuredClone(value.data), mode: value.mode };
    },
    peekCachedReferences() {
      return !active() || blocked ? { status: blocked ? "access_denied" : "disabled", references: [] } : { status: "cache_only", references: [...cache.values()].map((v) => ({ data: structuredClone(v.data), mode: now() < v.expires ? v.mode : "retained" })) };
    },
    state(id2) {
      const value = cache.get(id2);
      return value ? { mode: value.mode, capturedAt: value.data.sourceCapturedAt, generation: value.data.projectionGeneration } : null;
    },
    diagnostic(id2) {
      const f = failures.get(id2), value = cache.get(id2);
      return { blocked, reason: blocked ? "access_denied" : f?.reason ?? null, retryAt: f?.retryAt ?? 0, partial: !!value && (value.data.item.aggregate.sold === null || value.data.item.aggregate.asking === null || value.data.item.aggregate.reference === null) };
    },
    ordering() {
      return Object.freeze({ protocolSeen: fastSeen, epoch: fastEpoch, revision: high?.revision ?? null, tombstones: tombstones.size, saturatedAt });
    },
    cancelItem(id2) {
      const c = controllers.get(id2);
      if (c) {
        c.cancelled = true;
        c.controller.abort();
      }
      return (flights.get(id2) ?? Promise.resolve()).catch(() => {
      });
    },
    resetAccess() {
      if (blocked) {
        for (const [id2, value] of [...cache]) touch(id2, { ...value, expires: 0 });
        failures.clear();
      }
      blocked = false;
    },
    clear() {
      for (const c of controllers.values()) {
        c.cancelled = true;
        c.controller.abort();
      }
      cache.clear();
      failures.clear();
      bytes4 = 0;
      blocked = false;
    }
  });
}

// ops/api-discovery-membership.mjs
var NUMBER_PROTO = Object.getPrototypeOf(parseStrictJson("0.5"));
var enc3 = new TextEncoder();
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
var hash = async (value) => sha256(typeof value === "string" ? enc3.encode(value) : value);

// ops/api-item-discovery-contract.mjs
var HASH3 = /^[a-f0-9]{64}$/;
async function validateManifest(m, p = null) {
  shape2(m, ["schemaVersion", "kind", "scope", "sourceCreditUrl", "priceProjectionGeneration", "identityMetadata", "spriteBindingsSha256", "providerBindingsSha256", "sources", "itemCount", "pages", "indexHash"]);
  check2(m.schemaVersion === 1 && m.kind === "api_item_identity_manifest" && m.scope === "accepted_api_identity_union_with_retained_api_memberships" && m.sourceCreditUrl === "https://maplestory.market/?ref=v6kkdvp6" && HASH3.test(m.priceProjectionGeneration) && HASH3.test(m.spriteBindingsSha256) && HASH3.test(m.providerBindingsSha256) && HASH3.test(m.indexHash) && Array.isArray(m.identityMetadata) && m.identityMetadata.length >= 1 && m.identityMetadata.length <= 4 && Array.isArray(m.sources) && m.sources.length >= 1 && m.sources.length <= 3 && Array.isArray(m.pages) && m.pages.length > 0 && m.pages.length <= 128);
  int(m.itemCount, 1, 1e4);
  let count2 = 0, last = 0, totalBytes = 0;
  for (const [page, d] of m.pages.entries()) {
    shape2(d, ["page", "firstItemId", "lastItemId", "itemCount", "sha256", "bytes", "url"]);
    check2(d.page === page && HASH3.test(d.sha256) && d.url === "/api-item-identities/" + d.sha256 + ".json");
    int(d.firstItemId, last + 1, 999999999);
    int(d.lastItemId, d.firstItemId, 999999999);
    int(d.itemCount, 1, 128);
    int(d.bytes, 1, 131072);
    count2 += d.itemCount;
    last = d.lastItemId;
    totalBytes += d.bytes;
  }
  check2(count2 === m.itemCount && totalBytes <= 8388608);
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

// ops/api-search-identity-definition.mjs
var SEARCH_IDENTITY_DEFINITION = Object.freeze({
  metadata: Object.freeze([
    Object.freeze({ expectedSha256: "e66a5fb71974f55bad03130d2c3c8926f57ac8a5db949d58a369c4835ca6537f", sourceUrl: "https://maplestory.io/api/MCW/1/item/list?cashFilter=true&count=10000", format: "cash_client_catalog" }),
    Object.freeze({ expectedSha256: "60166ef0713a547a73b81473fbfa43d5d63f5182c978f5194b16411cd5e88a92", sourceUrl: "https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000", format: "noncash_list" })
  ]),
  spriteBindingsSha256: "356280fac3d0b4719ce31aa9e263b5de5a2797e191600f178c3fa4e53d1711de"
});
function matchesSearchIdentityDefinition(manifest, definition = SEARCH_IDENTITY_DEFINITION) {
  const sort = (rows2) => [...rows2].sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl));
  return manifest.spriteBindingsSha256 === definition.spriteBindingsSha256 && JSON.stringify(sort(manifest.identityMetadata)) === JSON.stringify(sort(definition.metadata));
}

// ops/api-search-identity-contract.mjs
var SEARCH_IDENTITY_PROFILE = "price_free_owned_membership_v2";
var SEARCH_IDENTITY_ROUTE = "/api-search-identities/v2/";
var SEARCH_IDENTITY_LIMITS = Object.freeze({ items: 1e4, pageRows: 128, pageBytes: 131072, rowBytes: 2048, pages: 128, collectionBytes: 8388608, manifestBytes: 65536 });
var SEARCH_SOURCE_URLS = Object.freeze({ prices: "https://maplestory.market/api/prices", catalogue: "https://maplestory.market/api/items", overview: "https://maplestory.market/api/market/overview" });
var SEARCH_OPERATIONS = Object.freeze(["prices", "catalogue", "overview"]);
var HASH4 = /^[a-f0-9]{64}$/;
var EPOCH = /^[a-z][a-z0-9-]{0,63}$/;
var LOCAL = /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/;
var enc4 = new TextEncoder();
var U8 = Uint8Array;
var typed = Object.getPrototypeOf(Uint8Array.prototype);
var typedBytes = Object.getOwnPropertyDescriptor(typed, "byteLength").get;
var typedOffset = Object.getOwnPropertyDescriptor(typed, "byteOffset").get;
var typedBuffer = Object.getOwnPropertyDescriptor(typed, "buffer").get;
var typedKind = Object.getOwnPropertyDescriptor(typed, Symbol.toStringTag).get;
var arrayBytes = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
var setBytes = Uint8Array.prototype.set;
var SearchIdentityError = class extends Error {
  constructor(code) {
    super(code);
    this.name = "SearchIdentityError";
  }
};
function need2(ok, code = "identity_shape") {
  if (!ok) throw new SearchIdentityError(code);
}
function closed(v, keys) {
  need2(v !== null && typeof v === "object" && !Array.isArray(v));
  need2(Object.keys(v).sort().join("|") === [...keys].sort().join("|"));
  return v;
}
function integer2(v, min, max) {
  need2(Number.isSafeInteger(v) && v >= min && v <= max, "identity_integer");
  return v;
}
function identityHash(v) {
  need2(typeof v === "string" && HASH4.test(v), "identity_hash");
  return v;
}
function identityClock(v) {
  need2(typeof v === "string" && Number.isFinite(Date.parse(v)) && Date.parse(v) >= 0 && new Date(v).toISOString() === v, "identity_clock");
  return v;
}
function publicEpoch(v) {
  need2(typeof v === "string" && EPOCH.test(v), "identity_epoch");
  return v;
}
function identityByteLength(raw) {
  try {
    need2(typedKind.call(raw) === "Uint8Array", "identity_bytes");
    const buffer = typedBuffer.call(raw);
    arrayBytes.call(buffer);
    return typedBytes.call(raw);
  } catch {
    throw new SearchIdentityError("identity_bytes");
  }
}
function ownIdentityBytes(raw, max) {
  const n = identityByteLength(raw);
  need2(n > 0 && n <= max, "identity_bytes_bound");
  const result = new U8(n), view = new U8(typedBuffer.call(raw), typedOffset.call(raw), n);
  setBytes.call(result, view);
  return result;
}
var jsonBytes = (v) => enc4.encode(JSON.stringify(v));
function validateIdentityRow(r) {
  closed(r, ["itemId", "name", "nameStatus", "sprite", "spriteStatus", "currentMemberships"]);
  integer2(r.itemId, 1, 999999999);
  need2(["unique_client_id", "unknown_client_id", "conflicting_client_id"].includes(r.nameStatus), "identity_name_status");
  need2(r.nameStatus === "unique_client_id" ? typeof r.name === "string" && r.name.trim().length > 0 && r.name.length <= 300 : r.name === null, "identity_name");
  need2(r.sprite === null ? r.spriteStatus === "unavailable" : r.spriteStatus === "reviewed_local" && typeof r.sprite === "string" && LOCAL.test(r.sprite), "identity_sprite");
  need2(Array.isArray(r.currentMemberships) && r.currentMemberships.length <= 3, "identity_memberships");
  let prior = -1;
  for (const op of r.currentMemberships) {
    const at = SEARCH_OPERATIONS.indexOf(op);
    need2(at > prior, "identity_membership_order");
    prior = at;
  }
  need2(jsonBytes(r).length <= SEARCH_IDENTITY_LIMITS.rowBytes, "identity_row_bound");
  return r;
}
function validateIdentitySources(sources, itemCount) {
  need2(Array.isArray(sources) && sources.length >= 1 && sources.length <= 3, "identity_sources");
  let prior = -1;
  for (const s of sources) {
    closed(s, ["operation", "sourceUrl", "capturedAt", "sourceObservedAt", "setSha256", "itemCount"]);
    const at = SEARCH_OPERATIONS.indexOf(s.operation);
    need2(at > prior, "identity_source_order");
    prior = at;
    need2(s.sourceUrl === SEARCH_SOURCE_URLS[s.operation] && s.sourceObservedAt === null, "identity_source");
    identityClock(s.capturedAt);
    identityHash(s.setSha256);
    integer2(s.itemCount, 0, itemCount);
  }
  need2(sources[0].operation === "prices", "identity_prices_required");
  return sources;
}
function metadata(items) {
  need2(Array.isArray(items) && items.length >= 1 && items.length <= 4, "identity_metadata");
  const seen = /* @__PURE__ */ new Set();
  for (const d of items) {
    closed(d, ["expectedSha256", "sourceUrl", "format"]);
    identityHash(d.expectedSha256);
    need2(["cash_client_catalog", "noncash_list"].includes(d.format) && d.sourceUrl === `https://maplestory.io/api/MCW/1/item/list?cashFilter=${d.format === "cash_client_catalog" ? "true" : "false"}&count=10000` && !seen.has(d.sourceUrl), "identity_metadata");
    seen.add(d.sourceUrl);
  }
  return items;
}
async function parseIdentityManifest(raw) {
  raw = ownIdentityBytes(raw, SEARCH_IDENTITY_LIMITS.manifestBytes);
  const m = parseStrictJson(raw);
  closed(m, ["schemaVersion", "kind", "profile", "publicationEpoch", "publicationRevision", "sourceCreditUrl", "identityMetadata", "spriteBindingsSha256", "sources", "admittedItemLimit", "itemCount", "pages", "indexHash"]);
  need2(m.schemaVersion === 2 && m.kind === "api_search_identity_manifest" && m.profile === SEARCH_IDENTITY_PROFILE && m.sourceCreditUrl === "https://maplestory.market/?ref=v6kkdvp6" && m.admittedItemLimit === 1e4, "identity_profile");
  publicEpoch(m.publicationEpoch);
  integer2(m.publicationRevision, 1, Number.MAX_SAFE_INTEGER);
  integer2(m.itemCount, 1, 1e4);
  metadata(m.identityMetadata);
  identityHash(m.spriteBindingsSha256);
  validateIdentitySources(m.sources, m.itemCount);
  identityHash(m.indexHash);
  need2(Array.isArray(m.pages) && m.pages.length >= 1 && m.pages.length <= 128, "identity_pages");
  let count2 = 0, last = 0, total = 0;
  for (const [i, d] of m.pages.entries()) {
    closed(d, ["page", "firstItemId", "lastItemId", "itemCount", "sha256", "bytes", "url"]);
    need2(d.page === i, "identity_page_order");
    integer2(d.firstItemId, last + 1, 999999999);
    integer2(d.lastItemId, d.firstItemId, 999999999);
    integer2(d.itemCount, 1, 128);
    integer2(d.bytes, 1, 131072);
    identityHash(d.sha256);
    need2(d.url === SEARCH_IDENTITY_ROUTE + d.sha256 + ".json", "identity_page_url");
    last = d.lastItemId;
    count2 += d.itemCount;
    total += d.bytes;
  }
  need2(count2 === m.itemCount && total <= 8388608, "identity_collection_bound");
  const { indexHash, ...unsigned } = m;
  need2(await sha256(jsonBytes(unsigned)) === indexHash, "identity_index_hash");
  return m;
}
async function parseIdentityPage(raw, d, m) {
  raw = ownIdentityBytes(raw, 131072);
  need2(raw.length === d.bytes && await sha256(raw) === d.sha256, "identity_page_hash");
  const p = parseStrictJson(raw);
  closed(p, ["schemaVersion", "kind", "rows"]);
  need2(p.schemaVersion === 2 && p.kind === "api_search_identity_page" && Array.isArray(p.rows) && p.rows.length === d.itemCount, "identity_page");
  let prior = d.firstItemId - 1;
  for (const r of p.rows) {
    validateIdentityRow(r);
    need2(r.itemId > prior && r.itemId <= d.lastItemId, "identity_row_order");
    prior = r.itemId;
    for (const op of r.currentMemberships) need2(m.sources.some((s) => s.operation === op), "identity_unknown_source");
  }
  need2(p.rows[0].itemId === d.firstItemId && p.rows.at(-1).itemId === d.lastItemId, "identity_page_range");
  return p;
}
function validateCompleteIdentityRows(m, rows2) {
  need2(Array.isArray(rows2) && rows2.length === m.itemCount, "identity_rows");
  let prior = 0;
  const counts = { prices: 0, catalogue: 0, overview: 0 };
  for (const r of rows2) {
    validateIdentityRow(r);
    need2(r.itemId > prior, "identity_duplicate_id");
    prior = r.itemId;
    for (const op of r.currentMemberships) counts[op]++;
  }
  for (const s of m.sources) need2(counts[s.operation] === s.itemCount, "identity_membership_count");
  return rows2;
}

// ops/api-search-identity-protocol.mjs
var SEARCH_IDENTITY_PROTOCOL = "search-identities-v2";
var SEARCH_IDENTITY_PAGE_HEADER = "X-Astra-Search-Identity-Object";
var SEARCH_IDENTITY_HEADERS = Object.freeze({ protocol: "X-Astra-Search-Identity-Protocol", epoch: "X-Astra-Search-Identity-Epoch", revision: "X-Astra-Search-Identity-Revision", index: "X-Astra-Search-Identity-Index", binding: "X-Astra-Search-Identity-Binding", mode: "X-Astra-Search-Identity-Mode" });
var searchIdentityEtag = (sha2) => '"search-identities-v2-' + identityHash(sha2) + '"';
function validateSearchIdentityPageHeaders(headers, { bodySha256 }) {
  need2(headers?.get && headers.get(SEARCH_IDENTITY_PAGE_HEADER) === "page-v2" && headers.get("ETag") === searchIdentityEtag(bodySha256), "identity_http_page_protocol");
  need2(Object.values(SEARCH_IDENTITY_HEADERS).every((k) => !headers.has(k)), "identity_page_not_current_revision");
  return { objectProtocol: "page-v2" };
}
async function makeSearchIdentityHeaders({ publicationEpoch, publicationRevision, indexHash, bodySha256, mode = "validated_cache" }) {
  publicEpoch(publicationEpoch);
  integer2(publicationRevision, 1, Number.MAX_SAFE_INTEGER);
  identityHash(indexHash);
  identityHash(bodySha256);
  need2(["validated_cache", "retained"].includes(mode), "identity_mode");
  return { [SEARCH_IDENTITY_HEADERS.protocol]: SEARCH_IDENTITY_PROTOCOL, [SEARCH_IDENTITY_HEADERS.epoch]: publicationEpoch, [SEARCH_IDENTITY_HEADERS.revision]: String(publicationRevision), [SEARCH_IDENTITY_HEADERS.index]: indexHash, [SEARCH_IDENTITY_HEADERS.binding]: await sha256(jsonBytes([SEARCH_IDENTITY_PROTOCOL, publicationEpoch, String(publicationRevision), indexHash, bodySha256])), [SEARCH_IDENTITY_HEADERS.mode]: mode, ETag: searchIdentityEtag(bodySha256) };
}
async function validateSearchIdentityHeaders(headers, { expectedEpoch, bodySha256 }) {
  need2(headers?.get && headers.get(SEARCH_IDENTITY_HEADERS.protocol) === SEARCH_IDENTITY_PROTOCOL, "identity_http_protocol");
  const epoch = headers.get(SEARCH_IDENTITY_HEADERS.epoch), revision = headers.get(SEARCH_IDENTITY_HEADERS.revision), indexHash = headers.get(SEARCH_IDENTITY_HEADERS.index), mode = headers.get(SEARCH_IDENTITY_HEADERS.mode);
  publicEpoch(epoch);
  need2(epoch === expectedEpoch && /^[1-9][0-9]{0,15}$/.test(revision ?? ""), "identity_http_epoch_revision");
  const n = integer2(Number(revision), 1, Number.MAX_SAFE_INTEGER);
  need2(String(n) === revision, "identity_http_revision");
  const expected = await makeSearchIdentityHeaders({ publicationEpoch: epoch, publicationRevision: n, indexHash, bodySha256, mode });
  for (const [k, v] of Object.entries(expected)) need2(headers.get(k) === v, "identity_http_binding");
  return { publicationEpoch: epoch, publicationRevision: n, indexHash, mode };
}

// ui-src/item-api/search-identity-client.mjs
var clone = (v) => structuredClone(v);
var abort3 = () => Object.assign(Error("identity_aborted"), { name: "AbortError" });
function createSearchIdentityClient({ enabled: enabled2 = false, isEnabled = () => true, fetcher, expectedEpoch, expectedDefinition = SEARCH_IDENTITY_DEFINITION, now = Date.now, monotonic = () => performance.now(), ttlMs = 3e4, timeoutMs = 3e4, readTimeoutMs = 1e4 } = {}) {
  if (enabled2 === true) publicEpoch(expectedEpoch);
  for (const [n, v, max] of [["ttl", ttlMs, 6e4], ["deadline", timeoutMs, 3e4], ["read", readTimeoutMs, 1e4]]) if (!Number.isSafeInteger(v) || v < 1 || v > max) throw TypeError("identity_" + n + "_bound");
  expectedDefinition = structuredClone(expectedDefinition);
  let good = null, flight = null, epoch = 0, floor = 0, floorIndex = null, expires = 0, retryAt = 0, failures = 0, blocked = false, lastFailure = null;
  const active = () => {
    try {
      return enabled2 === true && isEnabled() === true && !blocked;
    } catch {
      return false;
    }
  };
  const view = (mode = good?.mode) => good ? clone({ manifest: good.manifest, rows: good.rows, mode }) : null;
  function cancelTask() {
    if (flight) {
      flight.cancelled = true;
      for (const c of flight.controllers) c.abort();
    }
  }
  function revoke() {
    epoch++;
    good = null;
    expires = 0;
    cancelTask();
  }
  function failure2(latch, reason) {
    if (latch.reported) return;
    latch.reported = true;
    lastFailure = reason;
    expires = 0;
    retryAt = now() + Math.min(3e5, 3e4 * 2 ** Math.min(failures++, 4));
  }
  function fence(latch, readEnd = Infinity) {
    need2(active() && latch.epoch === epoch && !latch.cancelled, "identity_revoked");
    need2(monotonic() < latch.end && monotonic() < readEnd, "identity_deadline");
  }
  async function read(latch, path, limit, previous = null) {
    fence(latch);
    need2(path === SEARCH_IDENTITY_ROUTE + "manifest.json" || new RegExp("^" + SEARCH_IDENTITY_ROUTE + "[a-f0-9]{64}\\.json$").test(path), "identity_fixed_path");
    const controller = new AbortController(), end = Math.min(latch.end, monotonic() + readTimeoutMs);
    latch.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), Math.max(1, end - monotonic()));
    let response, reader = null, finished = false;
    try {
      response = await fetcher(path, { method: "GET", credentials: "same-origin", redirect: "error", cache: "no-cache", signal: controller.signal, headers: previous ? { "If-None-Match": previous.etag } : {} });
      fence(latch, end);
      if (response.status === 401) {
        blocked = true;
        revoke();
        throw Error("identity_authentication_withdrawn");
      }
      need2(response.status === 200 || response.status === 304, "identity_http_unavailable");
      const etag = response.headers.get("ETag");
      need2(/^"search-identities-v2-[a-f0-9]{64}"$/.test(etag ?? ""), "identity_http_etag");
      if (response.status === 304) {
        need2(previous && previous.etag === etag, "identity_http_304");
        const context2 = await validateSearchIdentityHeaders(response.headers, { expectedEpoch, bodySha256: previous.sha });
        fence(latch, end);
        finished = true;
        return { ...previous, ...context2, unchanged: true };
      }
      need2(/^application\/json(?:;|$)/i.test(response.headers.get("Content-Type") ?? ""), "identity_http_type");
      const declared = response.headers.get("Content-Length");
      need2(declared === null || /^[1-9][0-9]*$/.test(declared) && Number(declared) <= limit, "identity_http_length");
      need2(response.body && typeof response.body.getReader === "function", "identity_http_body");
      reader = response.body.getReader();
      const chunks = [];
      let n = 0, chunksRead = 0;
      for (; ; ) {
        const p = await reader.read();
        fence(latch, end);
        if (p.done) break;
        need2(++chunksRead <= 1024, "identity_http_chunks");
        if (identityByteLength(p.value) === 0) continue;
        const owned = ownIdentityBytes(p.value, limit - n);
        n += owned.byteLength;
        chunks.push(owned);
      }
      need2(n > 0 && (declared === null || n === Number(declared)), "identity_http_length");
      const raw = new Uint8Array(n);
      let at = 0;
      for (const p of chunks) {
        raw.set(p, at);
        at += p.length;
      }
      const sha2 = await sha256(raw);
      fence(latch, end);
      need2(etag === searchIdentityEtag(sha2), "identity_http_body_hash");
      const context = path.endsWith("/manifest.json") ? await validateSearchIdentityHeaders(response.headers, { expectedEpoch, bodySha256: sha2 }) : validateSearchIdentityPageHeaders(response.headers, { bodySha256: sha2 });
      fence(latch, end);
      finished = true;
      return { raw, sha: sha2, etag, ...context, unchanged: false };
    } finally {
      clearTimeout(timer);
      latch.controllers.delete(controller);
      try {
        if (!finished) {
          if (reader) await reader.cancel();
          else if (response?.body && !response.body.locked) await response.body.cancel();
        }
      } finally {
        reader?.releaseLock();
      }
    }
  }
  async function collect(latch) {
    const record = await read(latch, SEARCH_IDENTITY_ROUTE + "manifest.json", 65536, good?.record), manifest = await parseIdentityManifest(record.raw);
    fence(latch);
    need2(matchesSearchIdentityDefinition(manifest, expectedDefinition), "identity_reviewed_metadata_definition");
    need2(manifest.publicationEpoch === record.publicationEpoch && manifest.publicationRevision === record.publicationRevision && manifest.indexHash === record.indexHash, "identity_manifest_context");
    need2(manifest.publicationRevision >= floor && (manifest.publicationRevision !== floor || floorIndex === null || manifest.indexHash === floorIndex), "identity_revision_regression");
    if (good) for (const s of good.manifest.sources) {
      const next = manifest.sources.find((v) => v.operation === s.operation);
      need2(next && Date.parse(next.capturedAt) >= Date.parse(s.capturedAt), "identity_source_clock_regression");
    }
    floor = manifest.publicationRevision;
    floorIndex = manifest.indexHash;
    if (record.unchanged) {
      need2(good?.manifest.indexHash === manifest.indexHash, "identity_304_collection");
      fence(latch);
      const value2 = { ...good, record, mode: record.mode };
      good = value2;
      expires = now() + ttlMs;
      failures = 0;
      retryAt = 0;
      lastFailure = null;
      return value2;
    }
    const prior = good?.pages ?? /* @__PURE__ */ new Map(), pages = /* @__PURE__ */ new Map(), parts2 = new Array(manifest.pages.length);
    let cursor = 0, failed = false, retained = record.mode === "retained";
    const workers = Array.from({ length: Math.min(4, manifest.pages.length) }, async () => {
      try {
        while (!failed) {
          fence(latch);
          const i = cursor++;
          if (i >= manifest.pages.length) return;
          const d = manifest.pages[i];
          let page = prior.get(d.sha256);
          if (page) {
            need2(page.bytes === d.bytes && page.firstItemId === d.firstItemId && page.lastItemId === d.lastItemId && page.rows.length === d.itemCount, "identity_cached_page");
          } else {
            const r = await read(latch, d.url, 131072);
            need2(r.sha === d.sha256 && r.raw.length === d.bytes, "identity_page_context");
            const p = await parseIdentityPage(r.raw, d, manifest);
            fence(latch);
            page = { rows: p.rows, bytes: d.bytes, firstItemId: d.firstItemId, lastItemId: d.lastItemId };
          }
          for (const row of page.rows) for (const op of row.currentMemberships) need2(manifest.sources.some((s) => s.operation === op), "identity_page_source");
          pages.set(d.sha256, page);
          parts2[i] = page.rows;
        }
      } catch (error2) {
        failed = true;
        for (const c of latch.controllers) c.abort();
        throw error2;
      }
    });
    const results = await Promise.allSettled(workers), error = results.find((r) => r.status === "rejected");
    if (error) throw error.reason;
    const rows2 = validateCompleteIdentityRows(manifest, parts2.flat());
    fence(latch);
    need2(manifest.publicationRevision === floor && manifest.indexHash === floorIndex, "identity_late_revision");
    const value = { manifest, rows: rows2, mode: retained ? "retained" : "validated_cache", record, pages };
    good = value;
    expires = now() + ttlMs;
    retryAt = 0;
    failures = 0;
    lastFailure = null;
    return value;
  }
  async function wait(latch, signal) {
    if (signal?.aborted) throw abort3();
    let timer, cancel;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => {
        latch.cancelled = true;
        for (const c of latch.controllers) c.abort();
        resolve({ error: Error("identity_deadline") });
      }, Math.max(1, latch.end - monotonic()));
    }), stop = new Promise((_, reject) => {
      cancel = () => reject(abort3());
      signal?.addEventListener("abort", cancel, { once: true });
    });
    try {
      return await Promise.race([latch.promise, deadline, stop]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
  return Object.freeze({
    async load({ signal } = {}) {
      if (!active() || typeof fetcher !== "function") throw Error("identity_not_connected");
      if (good && now() < expires && good.manifest.publicationRevision === floor) return view();
      if (now() < retryAt) {
        if (good) return view("retained");
        throw Error("identity_read_backoff");
      }
      if (!flight) {
        const latch2 = { epoch, end: monotonic() + timeoutMs, controllers: /* @__PURE__ */ new Set(), cancelled: false, reported: false, promise: null };
        flight = latch2;
        latch2.promise = collect(latch2).then((value) => ({ value }), (error) => ({ error })).finally(() => {
          if (flight === latch2) flight = null;
        });
      }
      const latch = flight, result = await wait(latch, signal);
      if (result.error) {
        failure2(latch, result.error.message);
        if (good && active()) return view("retained");
        throw result.error;
      }
      need2(active() && latch.epoch === epoch && !latch.cancelled, "identity_revoked");
      return view(result.value.mode);
    },
    clear() {
      revoke();
      lastFailure = "identity_disabled";
      retryAt = 0;
    },
    resetAccess() {
      revoke();
      blocked = false;
      retryAt = 0;
      lastFailure = null;
    },
    state() {
      return { mode: blocked ? "authentication_unavailable" : good ? lastFailure || good.manifest.publicationRevision < floor ? "retained" : good.mode : "unavailable", itemCount: good?.manifest.itemCount ?? 0, indexHash: good?.manifest.indexHash ?? null, sourceSnapshots: clone(good?.manifest.sources ?? []), latestObservedRevision: floor, retainedRevision: good?.manifest.publicationRevision ?? null, physicalFlight: flight !== null, retryAt, blocked, lastFailure, priceAuthority: false };
    }
  });
}

// ui-src/item-api/search-identity-bridge.mjs
function searchIdentityV2View({ manifest, rows: rows2, mode }) {
  return { schemaVersion: 2, profile: manifest.profile, itemCount: manifest.itemCount, pricesMembershipCount: manifest.sources.find((s) => s.operation === "prices").itemCount, indexHash: manifest.indexHash, publicationEpoch: manifest.publicationEpoch, publicationRevision: manifest.publicationRevision, mode, sourceSnapshots: manifest.sources.map((s) => ({ ...s })), priceProjectionGeneration: null, priceProjectionMeaning: "not_part_of_price_free_identity_profile", rows: rows2.map((r) => ({ ...r, profile: manifest.profile, name: r.name ?? `Item ${r.itemId} (name unavailable)`, providerBindings: [], memberships: r.currentMemberships.map((operation) => ({ operation, presentInSnapshot: true, capturedAt: manifest.sources.find((s) => s.operation === operation).capturedAt, sourceObservedAt: null })), knownSourceId: true, retainedKnownId: r.currentMemberships.length === 0, collectionRetained: mode === "retained", priceState: "not_prefetched_by_search", hasCurrentAcceptedPriceSnapshot: false, hasRetainedPriceSnapshot: false, retainedPriceCapturedAt: null })) };
}
function createPriceFreeIdentityBridge(options = {}) {
  let client2;
  try {
    client2 = createSearchIdentityClient(options);
  } catch {
    client2 = null;
  }
  return Object.freeze({ async load(args) {
    if (!client2) throw Error("identity_profile_configuration");
    return searchIdentityV2View(await client2.load(args));
  }, state: () => client2?.state() ?? { mode: "invalid_profile", blocked: false }, clear: () => client2?.clear(), resetAccess: () => client2?.resetAccess() });
}

// ui-src/item-api/search-selected-price.mjs
var FAST_SELECTION_REQUEST_HEADER = "X-Astra-Request-Item-Protocol";
function createSearchSelectedPriceFetcher(fetcher, { expectedEpoch, isEnabled = () => true } = {}) {
  return async (...args) => {
    if (!validPublicEpoch(expectedEpoch) || isEnabled() !== true) throw Error("fast_selection_not_configured");
    const options = { ...args[1] ?? {}, headers: new Headers(args[1]?.headers) };
    options.headers.set(FAST_SELECTION_REQUEST_HEADER, FAST_ITEM_PROTOCOL);
    const response = await fetcher(args[0], options);
    if (isEnabled() !== true) {
      if (response.body && !response.body.locked) await response.body.cancel();
      throw Error("fast_selection_revoked");
    }
    if ([200, 304, 404, 409].includes(response.status) && (response.headers.get(FAST_ITEM_HEADERS.protocol) !== FAST_ITEM_PROTOCOL || response.headers.get(FAST_ITEM_HEADERS.epoch) !== expectedEpoch)) {
      if (response.body && !response.body.locked) await response.body.cancel();
      throw Error("ordered_fast_selection_required");
    }
    return response;
  };
}

// ui-src/item-api/lifecycle.mjs
function createItemPanelLifecycle({ container, mountPanel, loader, getTimezone = () => "UTC", spriteMap = {}, onStatus = () => {
} } = {}) {
  if (!container?.ownerDocument || typeof mountPanel !== "function") throw TypeError("Explicit item panel dependencies required");
  let epoch = 0, controller = null, handle = null, currentId = null, timezone = null, lastCapture = null, lastDtoSha = null, flight = null;
  const clear = () => {
    handle?.destroy();
    handle = null;
  };
  function load(itemId, preserveState) {
    if (!Number.isSafeInteger(itemId) || itemId < 1 || itemId > 999999999) throw TypeError("Exact numeric item ID required");
    if (flight?.itemId === itemId) return flight.promise;
    const token = ++epoch;
    controller?.abort();
    controller = new AbortController();
    const ownController = controller;
    if (currentId !== itemId) {
      clear();
      lastCapture = null;
      lastDtoSha = null;
    }
    currentId = itemId;
    if (typeof loader !== "function") {
      onStatus("not_connected");
      return Promise.resolve({ status: "not_connected" });
    }
    onStatus("loading", { hasData: !!handle });
    const task = { itemId };
    task.promise = (async () => {
      try {
        const reply = await loader({ itemId, signal: ownController.signal });
        if (token !== epoch || ownController.signal.aborted) return { status: "stale" };
        const value = await validatePublicItemReference(reply);
        if (token !== epoch || ownController.signal.aborted) return { status: "stale" };
        if (value.itemId !== itemId || lastCapture !== null && Date.parse(value.sourceCapturedAt) < Date.parse(lastCapture)) throw Object.assign(TypeError("Wrong or older item reference"), { code: "invalid" });
        const options = { timezone: timezone ?? getTimezone(), spriteMap };
        if (handle) {
          if (value.dtoSha256 !== lastDtoSha) handle.updateDto(value.item, { preserveState });
          handle.updateTimezone(options.timezone);
        } else handle = mountPanel(container, value.item, options);
        lastCapture = value.sourceCapturedAt;
        lastDtoSha = value.dtoSha256;
        onStatus("shown", { hasData: true });
        return { status: "shown", itemId, sourceCapturedAt: value.sourceCapturedAt, generation: value.projectionGeneration };
      } catch (error) {
        if (token !== epoch || ownController.signal.aborted) return { status: "stale" };
        if (error?.code === "access_denied") {
          clear();
          onStatus("access_denied", { hasData: false, reason: "access_denied" });
          return { status: "access_denied" };
        }
        if (error?.code === "not_found") {
          clear();
          onStatus("unavailable", { hasData: false, reason: "not_found" });
          return { status: "unavailable", reason: "not_found" };
        }
        const status = handle ? "retained" : "unavailable";
        onStatus(status, { hasData: !!handle, reason: error?.code ?? "unavailable" });
        return { status };
      } finally {
        if (flight === task) flight = null;
      }
    })();
    flight = task;
    return task.promise;
  }
  return Object.freeze({
    show: (itemId) => load(itemId, false),
    refresh() {
      return currentId === null ? Promise.resolve({ status: "not_connected" }) : load(currentId, true);
    },
    pause() {
      epoch++;
      controller?.abort();
      controller = null;
      flight = null;
      onStatus("paused", { hasData: !!handle });
    },
    timezoneChanged(value) {
      timezone = value;
      handle?.updateTimezone(value);
    },
    hide() {
      epoch++;
      controller?.abort();
      controller = null;
      flight = null;
      currentId = null;
      lastCapture = null;
      lastDtoSha = null;
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
  if (typeof value !== "string" || value.length > 160 || !/^\d+(?:\.\d+)?$/.test(value)) return "Unknown";
  const [whole, fraction = ""] = value.split(".");
  let tenths = BigInt(whole) * 10n + BigInt(fraction[0] || "0");
  if ((fraction[1] || "0") >= "5") tenths++;
  return (tenths / 10n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + (tenths % 10n).toString();
}
function displayInteger(value) {
  return Number.isSafeInteger(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "Unknown";
}
function retrievalClock(iso3, zone2 = "UTC") {
  if (!Number.isFinite(Date.parse(iso3))) return "Unknown";
  try {
    const parts2 = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone2, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso3)).map((p) => [p.type, p.value]));
    return `${parts2.month}-${parts2.day}-${parts2.year} ${parts2.hour}:${parts2.minute}:${parts2.second} ${zone2}`;
  } catch {
    return retrievalClock(iso3, "UTC");
  }
}
var spritePath = (value) => typeof value === "string" && /^\/?assets\/[A-Za-z0-9._/-]+\.png$/.test(value) && !value.split("/").includes("..") ? value : null;
var signature = (row, formatted = false) => Object.entries(labels).filter(([code]) => own2(row.reportedStats, code)).map(([code, label]) => `${label} ${formatted ? displayInteger(row.reportedStats[code]) : row.reportedStats[code]}`).join(" \xB7 ") || "No stats reported";
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
  const clock3 = el("p", void 0, "api-item-clock");
  clock3.dataset.rawDate = "true";
  section.append(clock3);
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
    clock3.textContent = "Retrieved: " + retrievalClock(dto.source.retrievedAt, zone2) + " \xB7 underlying observation time unknown";
    credit.href = `https://maplestory.market/items/${dto.itemId}?ref=v6kkdvp6`;
    summary.replaceChildren();
    const card = (heading2, lines) => {
      const box = el("div", void 0, "api-item-summary-card");
      box.append(el("h3", heading2));
      for (const line of lines) box.append(el("p", line));
      summary.append(box);
    };
    const s = dto.aggregate.sold, a = dto.aggregate.asking, r = dto.aggregate.reference;
    card("Source-labelled sales", [`Median: ${exactMoney(s?.medianUnitPrice ?? null)} mesos`, `Average (AVG): ${exactMoney(s?.averageUnitPrice ?? null)} mesos`, s ? `${displayInteger(s.reportedSalesCount)} reported sales \xB7 ${displayInteger(s.reportedUnitCount)} reported units` : "Sales counts unknown", s ? `Source day counters: ${displayInteger(s.reportedDaySalesCount)} sales \xB7 ${displayInteger(s.reportedDayUnitCount)} units (bounds unknown)` : ""]);
    card("Asking prices", [`Median ask: ${exactMoney(a?.medianUnitPrice ?? null)} mesos`, `P25: ${exactMoney(a?.p25UnitPrice ?? null)} \xB7 P75: ${exactMoney(a?.p75UnitPrice ?? null)} mesos`, a ? `${displayInteger(a.reportedListingCount)} reported listings \xB7 ${displayInteger(a.reportedSellerCount)} reported sellers` : "Listing and seller counts unknown"]);
    card("Publisher reference", [r ? `${r.aggregation === "average" ? "Average of source-labelled sales" : "Median asking price"}: ${exactMoney(r.unitPrice)} mesos` : "Reference unavailable", r ? `${displayInteger(r.reportedSamples)} reported reference samples` : "", "The reference is kept separate from the sale median."]);
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
  function buildFilters(extraStats = []) {
    const options = structuredClone(filterOptions(dto));
    for (const code of extraStats) if (!options.stats.some((v) => v.code === code)) options.stats.push({ code, label: labels[code] || code });
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
    feedback.textContent = `${displayInteger(total)} matching groups. ${near.checked && pool !== "reported_stats" ? "Nearby fallbacks included." : "Nearby fallbacks off."} Prices are mesos per item.`;
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
      const r = row.reference, deal = row.dealReference, nearText = deal ? deal.isNearFallback && !near.checked ? "Off" : `${exactMoney(deal.unitPrice)} mesos \xB7 ${deal.basis === "sold" ? "source sold" : "asking"} \xB7 ${displayInteger(deal.reportedSamples)} samples${deal.isNearFallback ? " \xB7 nearby, qualities may differ" : ""}` : "Unavailable";
      const common = [r ? exactMoney(r.unitPrice) : "Unknown", r ? `${r.basis === "sold" ? "Source sold" : "Asking"} \xB7 ${displayInteger(r.reportedSamples)} samples${r.isNearFallback ? " \xB7 nearby" : ""}` : "Unknown", nearText];
      const values = pool === "attack_pool" ? [displayInteger(row.reportedAttack), `${exactMoney(row.sold?.medianUnitPrice ?? null)} / ${exactMoney(row.sold?.averageUnitPrice ?? null)}`, row.sold ? `${displayInteger(row.sold.reportedSalesCount)} / ${displayInteger(row.sold.reportedUnitCount)}` : "Unknown", row.asking ? `${exactMoney(row.asking.medianUnitPrice)} / ${displayInteger(row.asking.reportedListingCount)}` : "Unknown", ...common] : [pool === "reported_stats" ? signature(row, true) : "Scroll-state pool", displayInteger(row.slotsLeft), displayInteger(row.successfulUpgrades), ...common];
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
    pageText.textContent = `Page ${displayInteger(page + 1)} of ${displayInteger(pages)}`;
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
  function preserveControls() {
    const fields2 = [...controls.querySelectorAll("[data-filter],[data-stat]")].map((n) => ({ key: n.dataset.filter || null, stat: n.dataset.stat || null, bound: n.dataset.bound || null, value: n.value, checked: n.checked, focused: doc2.activeElement === n, start: n.selectionStart, end: n.selectionEnd }));
    return { fields: fields2, page, scrollLeft: tableWrap.scrollLeft, scrollTop: tableWrap.scrollTop };
  }
  function restoreControls(saved) {
    for (const f of saved.fields) {
      const n = f.key ? controls.querySelector(`[data-filter="${f.key}"]`) : controls.querySelector(`[data-stat="${f.stat}"][data-bound="${f.bound}"]`);
      if (!n) continue;
      if (n.tagName === "SELECT" && f.value !== "" && ![...n.options].some((o) => o.value === f.value)) {
        const o = el("option", f.value + " (not reported in this update)");
        o.value = f.value;
        n.append(o);
      }
      n.value = f.value;
      if (n.type === "checkbox") n.checked = f.checked;
      if (f.focused) {
        n.focus({ preventScroll: true });
        if (f.start !== null && f.start !== void 0) try {
          n.setSelectionRange(f.start, f.end);
        } catch {
        }
      }
    }
    page = saved.page;
  }
  return Object.freeze({ element: section, updateTimezone(value) {
    zone2 = value;
    fillSummary();
  }, updateDto(value, { preserveState = false } = {}) {
    assertSafeItemDto(value);
    const saved = preserveState ? preserveControls() : null;
    dto = structuredClone(value);
    if (!saved) {
      page = 0;
      controls.reset();
    }
    fillSummary();
    buildFilters(saved ? saved.fields.filter((f) => f.stat && f.value !== "").map((f) => f.stat) : []);
    if (saved) restoreControls(saved);
    renderRows();
    if (saved) {
      tableWrap.scrollLeft = saved.scrollLeft;
      tableWrap.scrollTop = saved.scrollTop;
    }
  }, destroy() {
    destroyed = true;
    section.remove();
  } });
}

// ops/portable-hash.mjs
var encoder = new TextEncoder();

// ops/api-cash-projection.mjs
var MAX = Number.MAX_SAFE_INTEGER;

// ops/api-raw-prices-decoder.mjs
var MAX2 = BigInt(Number.MAX_SAFE_INTEGER);
var fail2 = (ok, message) => {
  if (!ok) throw new TypeError(message);
};
var own3 = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
var JsonNumber = class {
  constructor(token) {
    this.token = token;
    Object.freeze(this);
  }
};
function isOriginalJsonNumber(value) {
  return value instanceof JsonNumber;
}
function parseStrictJson2(text) {
  fail2(typeof text === "string" && text.length <= 5e6, "Bounded UTF8 JSON text required");
  let i = 0, nodes = 0;
  const white = () => {
    while (i < text.length && [" ", "\n", "\r", "	"].includes(text[i])) i++;
  };
  function string() {
    const start = i++;
    while (i < text.length) {
      const char = text[i++];
      if (char === '"') {
        const value2 = JSON.parse(text.slice(start, i));
        fail2(value2.length <= 4096, "JSON string too long");
        return value2;
      }
      if (char === "\\") i++;
    }
    throw new TypeError("Unterminated JSON string");
  }
  function numeric() {
    const start = i;
    if (text[i] === "-") i++;
    if (text[i] === "0") i++;
    else {
      fail2(text[i] >= "1" && text[i] <= "9", "Invalid JSON number");
      while (text[i] >= "0" && text[i] <= "9") i++;
    }
    if (text[i] === ".") {
      i++;
      const digits = i;
      while (text[i] >= "0" && text[i] <= "9") i++;
      fail2(i > digits, "Missing fractional digits");
    }
    if (text[i] === "e" || text[i] === "E") {
      i++;
      if (text[i] === "+" || text[i] === "-") i++;
      const digits = i;
      while (text[i] >= "0" && text[i] <= "9") i++;
      fail2(i > digits, "Missing exponent digits");
    }
    fail2(i - start <= 4096, "JSON number token too long");
    return new JsonNumber(text.slice(start, i));
  }
  function value(depth) {
    fail2(++nodes <= 1e6 && depth <= 64, "JSON complexity bound");
    white();
    const char = text[i];
    if (char === '"') return string();
    if (char === "-" || char >= "0" && char <= "9") return numeric();
    for (const [token, literal] of [["true", true], ["false", false], ["null", null]]) if (text.startsWith(token, i)) {
      i += token.length;
      return literal;
    }
    if (char === "[") {
      i++;
      white();
      const out = [];
      if (text[i] === "]") {
        i++;
        return Object.freeze(out);
      }
      while (true) {
        fail2(out.length < 1e4, "JSON array bound");
        out.push(value(depth + 1));
        white();
        if (text[i] === "]") {
          i++;
          return Object.freeze(out);
        }
        fail2(text[i++] === ",", "Expected array comma");
      }
    }
    if (char === "{") {
      i++;
      white();
      const out = /* @__PURE__ */ Object.create(null);
      let count2 = 0;
      if (text[i] === "}") {
        i++;
        return Object.freeze(out);
      }
      while (true) {
        white();
        fail2(text[i] === '"', "Expected object key");
        const key = string();
        fail2(!own3(out, key), "Duplicate JSON key");
        fail2(++count2 <= 64, "JSON object bound");
        white();
        fail2(text[i++] === ":", "Expected object colon");
        out[key] = value(depth + 1);
        white();
        if (text[i] === "}") {
          i++;
          return Object.freeze(out);
        }
        fail2(text[i++] === ",", "Expected object comma");
      }
    }
    throw new TypeError("Invalid JSON token");
  }
  const result = value(0);
  white();
  fail2(i === text.length, "Trailing JSON data");
  return result;
}

// ops/api-item-hour-history-profile.mjs
var ItemHistoryContractError = class extends TypeError {
};
var check3 = (v, why) => {
  if (!v) throw new ItemHistoryContractError(why);
};
var MAX3 = BigInt(Number.MAX_SAFE_INTEGER);
var enc5 = new TextEncoder();
var exact = (v, keys) => check3(v && typeof v === "object" && !Array.isArray(v) && !isOriginalJsonNumber(v) && Object.keys(v).sort().join("|") === keys.split(" ").sort().join("|"), "history_fields");
function decimal(v, positive) {
  check3(isOriginalJsonNumber(v) && v.token.length <= 256, "history_price_token");
  const token = v.token, m = /^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
  check3(m, "history_decimal");
  const digits = (m[2] + (m[3] || "")).replace(/^0+/, ""), exponent = Number(m[4] || 0) - (m[3] || "").length;
  check3(!(m[1] && digits) && Number.isSafeInteger(exponent) && Math.abs(exponent) <= 1e3 && (!positive || digits.length > 0), "history_nonnegative_price");
  return { token, digits, power: exponent };
}
function compare(a, b) {
  if (!a.digits) return b.digits ? -1 : 0;
  if (!b.digits) return 1;
  const x = a.digits.length + a.power, y = b.digits.length + b.power;
  if (x !== y) return x < y ? -1 : 1;
  const n = Math.max(a.digits.length, b.digits.length), left = a.digits.padEnd(n, "0"), right = b.digits.padEnd(n, "0");
  return left === right ? 0 : left < right ? -1 : 1;
}
async function historyByteHash(bytes4) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes4))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function validateProjectedHour(row) {
  exact(row, "providerBucketEpochSeconds providerBucketTimestampUtc seen sold sourceObservedAt bucketCompletionKnown exactBucketStartAt exactBucketEndAt qualityConstant variantIdentity");
  const at = row.providerBucketEpochSeconds;
  check3(Number.isSafeInteger(at) && at >= 946684800 && at < 4102444800 && at % 3600 === 0 && row.providerBucketTimestampUtc === new Date(at * 1e3).toISOString().replace(".000Z", "Z") && row.sourceObservedAt === null && row.bucketCompletionKnown === false && row.exactBucketStartAt === null && row.exactBucketEndAt === null && row.qualityConstant === false && row.variantIdentity === null, "history_saved_bucket");
  const price = (v, positive) => {
    check3(typeof v === "string", "history_saved_decimal");
    return decimal(parseStrictJson2(v), positive);
  };
  for (const [kind, value] of [["seen", row.seen], ["sold", row.sold]]) {
    if (value === null) continue;
    const fields2 = kind === "seen" ? "reportedListingCount min_unit_price median_unit_price max_unit_price basis currentAvailabilityVerified" : "reportedBundles reportedUnits min_unit_price p25_unit_price median_unit_price p75_unit_price max_unit_price avg_unit_price basis bundlesEquivalentToSalesVerified";
    exact(value, fields2);
    const keys = kind === "seen" ? ["min_unit_price", "median_unit_price", "max_unit_price"] : ["min_unit_price", "p25_unit_price", "median_unit_price", "p75_unit_price", "max_unit_price"], prices = keys.map((k) => price(value[k], true));
    check3(prices.every((p, i) => !i || compare(prices[i - 1], p) <= 0), "history_saved_quantiles");
    const counts = kind === "seen" ? [value.reportedListingCount] : [value.reportedBundles, value.reportedUnits];
    check3(counts.every((v) => Number.isSafeInteger(v) && v >= 0), "history_saved_counts");
    if (kind === "seen") check3(value.basis === "source_seen_asking_prices" && value.currentAvailabilityVerified === false, "history_saved_asking_basis");
    else {
      price(value.avg_unit_price, false);
      check3(value.basis === "source_labeled_sold_hourly_aggregate_not_individual_trades" && value.bundlesEquivalentToSalesVerified === false, "history_saved_sold_basis");
    }
  }
  return row;
}

// ops/item-hour-public-contract.mjs
var METHOD = "retained-whole-item-hour-public-v1";
var LIMITS = Object.freeze({ pages: 128, rowsPerPage: 128, manifestBytes: 131072, pageBytes: 262144, totalBytes: 8388608, rows: 16384 });
var HASH5 = /^[a-f0-9]{64}$/;
var need3 = (v, c = "invalid_history_contract") => {
  if (!v) throw Error(c);
};
var shape3 = (v, keys) => need3(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join("|") === keys.split(" ").sort().join("|"), "history_closed_fields");
var int2 = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => need3(Number.isSafeInteger(v) && v >= min && v <= max, "history_integer");
var clock2 = (v) => {
  need3(typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v, "history_original_clock");
  return v;
};
var freeze2 = (v) => {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) freeze2(x);
    Object.freeze(v);
  }
  return v;
};
var bytes3 = (v) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));
var hash2 = async (v) => historyByteHash(v instanceof Uint8Array ? v : bytes3(v));
var sourceUrl = (id2) => `https://maplestory.market/api/items/${id2}/history`;
var creditUrl = (id2) => `https://maplestory.market/items/${id2}?ref=v6kkdvp6`;
var manifestPath = (id2) => `/api-item-history/${id2}/manifest.json`;
var weekStart = (epoch) => {
  int2(epoch, 946684800, 4102444799);
  const d = new Date(epoch * 1e3);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (d.getUTCDay() + 6) % 7)).toISOString().slice(0, 10);
};
var seenKeys = "reportedListingCount min_unit_price median_unit_price max_unit_price basis currentAvailabilityVerified".split(" ");
var soldKeys = "reportedBundles reportedUnits min_unit_price p25_unit_price median_unit_price p75_unit_price max_unit_price avg_unit_price basis bundlesEquivalentToSalesVerified".split(" ");
function canonicalHour(input) {
  validateProjectedHour(input);
  const row = Object.fromEntries("providerBucketEpochSeconds providerBucketTimestampUtc seen sold sourceObservedAt bucketCompletionKnown exactBucketStartAt exactBucketEndAt qualityConstant variantIdentity".split(" ").map((k) => [k, input[k]]));
  for (const [name, keys] of [["seen", seenKeys], ["sold", soldKeys]]) if (row[name] !== null) row[name] = Object.fromEntries(keys.map((k) => [k, row[name][k]]));
  return row;
}
function validateRevision(r) {
  shape3(r, "hour originalRetrievedAt revisionOrder latest");
  canonicalHour(r.hour);
  clock2(r.originalRetrievedAt);
  int2(r.revisionOrder, 1, LIMITS.rows);
  need3(typeof r.latest === "boolean");
  return r;
}
async function validateManifest2(input, id2) {
  const m = structuredClone(input);
  shape3(m, "schemaVersion kind methodVersion itemId identityScope source priceRepresentation priceUnitMeaning sourceObservedAt individualTradesQualified qualityConstant variantIdentity bucketCompletionKnown completeTradeHistory missingBucketMeansZero nullSoldMeansVerifiedZero firstHourUtc lastHourUtc oldestOriginalRetrievedAt latestOriginalRetrievedAt retainedHours retainedRevisionRows pages generation");
  need3(m.schemaVersion === 1 && m.kind === "retained_item_hour_manifest" && m.methodVersion === METHOD && m.itemId === id2 && m.identityScope === "whole_item_unknown_roll_identity");
  int2(id2, 1, 999999999);
  shape3(m.source, "provider sourceUrl creditUrl");
  need3(m.source.provider === "maplestory.market" && m.source.sourceUrl === sourceUrl(id2) && m.source.creditUrl === creditUrl(id2));
  need3(m.priceRepresentation === "original_JSON_decimal_lexeme_not_binary64_price" && m.priceUnitMeaning === "source_unit_price_fields_physical_stack_conversion_unverified" && m.sourceObservedAt === null && m.individualTradesQualified === 0 && m.qualityConstant === false && m.variantIdentity === null && m.bucketCompletionKnown === false && m.completeTradeHistory === false && m.missingBucketMeansZero === false && m.nullSoldMeansVerifiedZero === false);
  int2(m.retainedHours, 0, LIMITS.rows);
  int2(m.retainedRevisionRows, m.retainedHours, LIMITS.rows);
  need3(Array.isArray(m.pages) && m.pages.length <= LIMITS.pages);
  if (!m.retainedHours) {
    need3(!m.pages.length && m.retainedRevisionRows === 0 && m.firstHourUtc === null && m.lastHourUtc === null && m.oldestOriginalRetrievedAt === null && m.latestOriginalRetrievedAt === null);
  } else {
    for (const k of ["oldestOriginalRetrievedAt", "latestOriginalRetrievedAt"]) clock2(m[k]);
    need3(m.oldestOriginalRetrievedAt <= m.latestOriginalRetrievedAt);
    for (const k of ["firstHourUtc", "lastHourUtc"]) need3(typeof m[k] === "string" && /^\d{4}-\d\d-\d\dT\d\d:00:00Z$/.test(m[k]) && Number.isFinite(Date.parse(m[k])) && new Date(m[k]).toISOString().replace(".000Z", "Z") === m[k]);
    need3(m.firstHourUtc <= m.lastHourUtc && m.pages.length > 0);
  }
  let total = 0, rows2 = 0, last = "", part = 0;
  const paths = /* @__PURE__ */ new Set();
  for (const d of m.pages) {
    shape3(d, "weekStart part path sha256 bytes revisionRows firstEpoch lastEpoch");
    need3(typeof d.weekStart === "string" && /^\d{4}-\d\d-\d\d$/.test(d.weekStart) && Number.isFinite(Date.parse(d.weekStart)) && weekStart(Date.parse(d.weekStart) / 1e3) === d.weekStart && HASH5.test(d.sha256));
    int2(d.part, 0, LIMITS.pages - 1);
    need3(d.weekStart >= last && d.part === (d.weekStart === last ? part + 1 : 0));
    last = d.weekStart;
    part = d.part;
    need3(d.path === `/api-item-history/${id2}/week/${d.weekStart}-${d.part}-${d.sha256}.json` && !paths.has(d.path));
    paths.add(d.path);
    int2(d.bytes, 1, LIMITS.pageBytes);
    int2(d.revisionRows, 1, LIMITS.rowsPerPage);
    int2(d.firstEpoch, 946684800, 4102444799);
    int2(d.lastEpoch, d.firstEpoch, 4102444799);
    need3(weekStart(d.firstEpoch) === d.weekStart && weekStart(d.lastEpoch) === d.weekStart && d.firstEpoch % 3600 === 0 && d.lastEpoch % 3600 === 0);
    total += d.bytes;
    rows2 += d.revisionRows;
  }
  need3(total <= LIMITS.totalBytes && rows2 === m.retainedRevisionRows);
  const { generation, ...unsigned } = m;
  need3(HASH5.test(generation) && await hash2(unsigned) === generation, "history_generation_hash");
  return freeze2(m);
}
function validatePage2(input, d, m) {
  const p = structuredClone(input);
  shape3(p, "schemaVersion kind methodVersion itemId weekStart part rows");
  need3(p.schemaVersion === 1 && p.kind === "retained_item_hour_revisions" && p.methodVersion === METHOD && p.itemId === m.itemId && p.weekStart === d.weekStart && p.part === d.part && Array.isArray(p.rows) && p.rows.length === d.revisionRows);
  let at = -1, order = 0;
  for (const r of p.rows) {
    validateRevision(r);
    const epoch = r.hour.providerBucketEpochSeconds;
    need3(weekStart(epoch) === d.weekStart && (epoch > at || epoch === at && r.revisionOrder === order + 1));
    if (epoch > at) order = r.revisionOrder;
    else order++;
    at = epoch;
    need3(r.originalRetrievedAt >= m.oldestOriginalRetrievedAt && r.originalRetrievedAt <= m.latestOriginalRetrievedAt);
  }
  need3(p.rows[0].hour.providerBucketEpochSeconds === d.firstEpoch && p.rows.at(-1).hour.providerBucketEpochSeconds === d.lastEpoch);
  return freeze2(p);
}
function parseBody(raw, max) {
  need3(raw instanceof Uint8Array && raw.length > 0 && raw.length <= max, "history_bytes");
  return parseStrictJson(raw);
}
function validateSelection(pages, m, { fromEpoch = 0, toEpoch = 4102444800 } = {}) {
  int2(fromEpoch, 0, 4102444800);
  int2(toEpoch, fromEpoch, 4102444800);
  const records = pages.flatMap((p) => p.rows), hours = /* @__PURE__ */ new Map();
  for (const r of records) {
    const epoch = r.hour.providerBucketEpochSeconds;
    if (epoch < fromEpoch || epoch >= toEpoch) continue;
    const list = hours.get(epoch) ?? [];
    list.push(r);
    hours.set(epoch, list);
  }
  for (const list of hours.values()) {
    list.sort((a, b) => a.revisionOrder - b.revisionOrder);
    need3(list.every((r, i) => r.revisionOrder === i + 1) && list.filter((r) => r.latest).length === 1 && list.at(-1).latest, "history_revision_selection");
    need3(list.every((r, i) => !i || r.originalRetrievedAt >= list[i - 1].originalRetrievedAt), "history_revision_capture_order");
  }
  if (fromEpoch === 0 && toEpoch === 4102444800) {
    need3(pages.length === m.pages.length && hours.size === m.retainedHours && records.length === m.retainedRevisionRows, "history_full_selection_coverage");
    if (records.length) need3(records[0].hour.providerBucketTimestampUtc === m.firstHourUtc && records.at(-1).hour.providerBucketTimestampUtc === m.lastHourUtc, "history_full_selection_bounds");
  }
  return freeze2({ itemId: m.itemId, generation: m.generation, source: m.source, sourceObservedAt: null, identityScope: m.identityScope, latestOriginalRetrievedAt: m.latestOriginalRetrievedAt, rows: [...hours.values()].map((list) => list.at(-1)), revisions: records.filter((r) => r.hour.providerBucketEpochSeconds >= fromEpoch && r.hour.providerBucketEpochSeconds < toEpoch), individualTradesQualified: 0, qualityConstant: false, variantIdentity: null, bucketCompletionKnown: false, completeTradeHistory: false });
}

// ops/item-hour-client.mjs
function createItemHourClient({ origin = globalThis.location?.origin, fetcher = globalThis.fetch, enabled: enabled2 = false, onChange = () => {
}, maxSelections = 8 } = {}) {
  const own4 = new URL(origin);
  need3(own4.origin === origin && ["https:", "http:"].includes(own4.protocol) && (!globalThis.location || globalThis.location.origin === origin), "history_own_origin");
  need3(Number.isInteger(maxSelections) && maxSelections >= 1 && maxSelections <= 16);
  let active = enabled2 === true, epoch = 0, controller = null, model = freeze2({ status: active ? "idle" : "off", data: null }), flightCount = 0;
  const lastgood = /* @__PURE__ */ new Map();
  const emit = (value) => {
    model = freeze2(value);
    onChange(model);
    return model;
  };
  async function get(path, signal, max) {
    need3(path.startsWith("/api-item-history/") && !path.startsWith("//") && new URL(path, origin).origin === origin, "history_own_path");
    flightCount++;
    try {
      const response = await fetcher(path, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal, headers: { Accept: "application/json" } });
      if (response.status === 409) throw Object.assign(Error("generation_changed"), { generationChanged: true });
      need3(response.status === 200, "history_response_status");
      need3(response.headers.get("content-type")?.toLowerCase().startsWith("application/json"), "history_response_mime");
      const length = response.headers.get("content-length");
      if (length !== null) need3(/^[1-9][0-9]*$/.test(length) && Number(length) <= max, "history_response_length");
      const raw = new Uint8Array(await response.arrayBuffer());
      need3(raw.length <= max && raw.length > 0, "history_response_bound");
      const sha2 = await hash2(raw);
      need3(response.headers.get("etag") === `"item-hour-${sha2}"` && ["current", "retained"].includes(response.headers.get("X-Astra-History-Mode")), "history_response_hash");
      return { raw, generation: response.headers.get("X-Astra-History-Generation"), mode: response.headers.get("X-Astra-History-Mode"), retrieved: response.headers.get("X-Astra-History-Source-Retrieved") };
    } finally {
      flightCount--;
    }
  }
  async function transaction(id2, range, signal) {
    const local = new AbortController(), abort4 = () => local.abort();
    signal.addEventListener("abort", abort4, { once: true });
    if (signal.aborted) local.abort();
    try {
      const result = await get(manifestPath(id2), local.signal, LIMITS.manifestBytes), m = await validateManifest2(parseBody(result.raw, LIMITS.manifestBytes), id2);
      need3(result.generation === m.generation && result.retrieved === (m.latestOriginalRetrievedAt ?? "none"), "history_response_clock_binding");
      const descriptors = m.pages.filter((d) => d.lastEpoch >= range.fromEpoch && d.firstEpoch < range.toEpoch), loaded = new Array(descriptors.length);
      let cursor = 0, total = 0, retained = result.mode === "retained", failure2 = null;
      async function worker() {
        try {
          for (; ; ) {
            need3(!local.signal.aborted, "history_selection_aborted");
            const n = cursor++;
            if (n >= descriptors.length) return;
            const d = descriptors[n], p = await get(`${d.path}?generation=${m.generation}`, local.signal, LIMITS.pageBytes);
            need3(p.generation === m.generation && p.retrieved === (m.latestOriginalRetrievedAt ?? "none") && p.raw.length === d.bytes && await hash2(p.raw) === d.sha256, "history_page_binding");
            total += p.raw.length;
            need3(total <= LIMITS.totalBytes);
            loaded[n] = validatePage2(parseBody(p.raw, LIMITS.pageBytes), d, m);
            retained ||= p.mode === "retained";
          }
        } catch (error) {
          failure2 ??= error;
          local.abort();
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, descriptors.length) }, worker));
      if (failure2) throw failure2;
      const data = validateSelection(loaded, m, range);
      return { data, retained };
    } finally {
      signal.removeEventListener("abort", abort4);
      local.abort();
    }
  }
  return { get model() {
    return model;
  }, setEnabled(value) {
    active = value === true;
    epoch++;
    controller?.abort();
    controller = null;
    return emit({ status: active ? "idle" : "off", data: null });
  }, async select(id2, { fromEpoch = 0, toEpoch = 4102444800 } = {}) {
    int2(id2, 1, 999999999);
    int2(fromEpoch, 0, 4102444800);
    int2(toEpoch, fromEpoch, 4102444800);
    const mine = ++epoch;
    controller?.abort();
    controller = new AbortController();
    const current2 = controller, signal = current2.signal, key = `${id2}:${fromEpoch}:${toEpoch}`, previous = lastgood.get(key) ?? null;
    if (!active) return emit({ status: "off", data: null });
    emit({ status: "loading", data: previous });
    const timer = setTimeout(() => current2.abort(), 15e3);
    try {
      let value;
      for (let retry = 0; retry < 2; retry++) {
        try {
          value = await transaction(id2, { fromEpoch, toEpoch }, signal);
          break;
        } catch (error) {
          if (!error.generationChanged || retry || signal.aborted) throw error;
        }
      }
      if (mine !== epoch || !active || signal.aborted) return model;
      lastgood.delete(key);
      lastgood.set(key, value.data);
      while (lastgood.size > maxSelections) lastgood.delete(lastgood.keys().next().value);
      return emit({ status: value.retained ? "retained" : "ready", data: value.data });
    } catch {
      current2.abort();
      if (mine !== epoch || !active) return model;
      return emit({ status: previous ? "retained" : "unavailable", data: previous });
    } finally {
      clearTimeout(timer);
      if (controller === current2) controller = null;
    }
  }, stats() {
    return { cachedSelections: lastgood.size, inFlightRequests: flightCount, providerRequests: 0 };
  } };
}

// ui-src/item-api/history.mjs
var FINITE_HISTORY_ITEM_ID = 1082002;
var NAME = "Steel Fingerless Gloves";
var NS = "http://www.w3.org/2000/svg";
function historyMoney(value) {
  if (typeof value !== "string" || value.length > 256) return "Unknown";
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!m) return "Unknown";
  const digits = (m[2] + (m[3] || "")).replace(/^0+/, "") || "0", power = Number(m[4] || 0) - (m[3] || "").length + 1;
  if (!Number.isSafeInteger(power) || Math.abs(power) > 1260 || m[1] && digits !== "0") return "Unknown";
  let n = BigInt(digits);
  if (power >= 0) n *= 10n ** BigInt(power);
  else {
    const d = 10n ** BigInt(-power), r = n % d;
    n = n / d + (r * 2n >= d ? 1n : 0n);
  }
  return (n / 10n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + n % 10n;
}
var count = (n) => Number.isSafeInteger(n) && n >= 0 ? n.toLocaleString("en-US") : "Unknown";
function safeZone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return value;
  } catch {
    return "UTC";
  }
}
function parts(iso3, zone2) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: safeZone(zone2), month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso3)).map((p) => [p.type, p.value]));
}
function historyClock(iso3, zone2 = "UTC") {
  if (!Number.isFinite(Date.parse(iso3))) return "Unknown";
  const p = parts(iso3, zone2);
  return `${p.month} ${p.day} ${p.hour}:${p.minute}:${p.second} ${safeZone(zone2)} (${p.year})`;
}
var quote = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
function historyCsv(data, revisions = false) {
  const headings = ["provider_hour_utc", "original_retrieved_at", "revision_order", "latest_version", "source_sold_median_unit_price_raw", "source_sold_average_unit_price_raw", "reported_bundles", "reported_units", "source_seen_median_unit_price_raw", "reported_listings", "quality_constant", "individual_trades_qualified"];
  const records = revisions ? data.revisions : data.rows;
  return [headings, ...records.map((r) => [r.hour.providerBucketTimestampUtc, r.originalRetrievedAt, r.revisionOrder, r.latest, r.hour.sold?.median_unit_price, r.hour.sold?.avg_unit_price, r.hour.sold?.reportedBundles, r.hour.sold?.reportedUnits, r.hour.seen?.median_unit_price, r.hour.seen?.reportedListingCount, false, 0])].map((r) => r.map(quote).join(",")).join("\r\n") + "\r\n";
}
function historyPlotModel(data) {
  const series = [{ key: "sold", label: "Source-labelled sold median", color: "var(--mint,#b5e5d1)" }, { key: "seen", label: "Seen asking median", color: "var(--gold,#e4c573)" }];
  let omitted = 0;
  const lines = series.map((s) => ({ ...s, points: data.rows.map((r) => {
    const raw = r.hour[s.key]?.median_unit_price ?? null, value = raw === null ? null : Number(raw), drawable = value !== null && Number.isFinite(value) && value > 0;
    if (raw !== null && !drawable) omitted++;
    return { epoch: r.hour.providerBucketEpochSeconds, raw, value: drawable ? value : null, retrievedAt: r.originalRetrievedAt };
  }) }));
  return { series: lines, omitted, first: data.rows[0]?.hour.providerBucketEpochSeconds ?? null, last: data.rows.at(-1)?.hour.providerBucketEpochSeconds ?? null, max: Math.max(0, ...lines.flatMap((s) => s.points.map((p) => p.value ?? 0))) };
}
function mountItemHistoryPreview(container, { itemId, fetcher = globalThis.fetch, timezone = "UTC", parentActive = () => true, isCurrent = () => true, download = null } = {}) {
  if (!container?.ownerDocument || !Number.isSafeInteger(itemId) || itemId < 1 || itemId > 999999999) throw TypeError("Exact item history context required");
  const doc2 = container.ownerDocument, win = doc2.defaultView, el = (tag, text, cls) => {
    const n = doc2.createElement(tag);
    if (text !== void 0) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  let destroyed = false, selected = false, zone2 = safeZone(timezone), model = { status: "off", data: null }, page = 0, allRevisions = false, transportEpoch = 0;
  const section = el("section", void 0, "item-hour-preview"), body = el("div", void 0, "item-hour-body"), options = el("div", void 0, "item-hour-options");
  body.hidden = true;
  options.dataset.previewControls = "true";
  options.setAttribute("role", "group");
  options.setAttribute("aria-label", "Finite whole-item history preview");
  const toggle = el("button", "Hourly whole-item history: Off");
  toggle.type = "button";
  toggle.setAttribute("aria-pressed", "false");
  toggle.dataset.itemHourToggle = "true";
  options.append(toggle, el("p", "Off by default. Only the independently retained 1082002 Steel Fingerless Gloves snapshot is available; other item IDs remain unavailable."));
  section.append(body, options);
  container.append(section);
  const live = () => !destroyed && parentActive() === true && isCurrent() === true;
  let client2;
  function makeClient() {
    let own4;
    own4 = createItemHourClient({ origin: win.location.origin, enabled: false, fetcher: async (...args) => {
      if (!live() || !selected || itemId !== FINITE_HISTORY_ITEM_ID) throw Error("Inactive finite history");
      const epoch = transportEpoch, response = await fetcher(...args);
      if (response.status === 404 && own4 === client2 && epoch === transportEpoch && live() && selected) {
        transportEpoch++;
        own4.setEnabled(false);
        client2 = makeClient();
        model = { status: "unavailable", data: null };
        render();
      }
      return response;
    }, onChange: (value) => {
      if (own4 !== client2) return;
      model = value;
      if (live() && selected) render();
    } });
    return own4;
  }
  client2 = makeClient();
  function svgNode(tag, attributes, text) {
    const n = doc2.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attributes || {})) n.setAttribute(k, String(v));
    if (text !== void 0) n.textContent = text;
    return n;
  }
  function chart(data) {
    const chart2 = el("div", void 0, "item-hour-chart"), help = el("p", "Hover a point, or focus the chart and use Left/Right arrows. Points use the latest retained version of each source bucket once; gaps and null fields are not zero.", "item-hour-chart-help"), tip = el("p", "No point selected.", "item-hour-tooltip");
    tip.setAttribute("role", "status");
    tip.setAttribute("aria-live", "polite");
    const p = historyPlotModel(data);
    if (!data.rows.length || p.max === 0) {
      chart2.append(el("p", "No plottable source medians in this retained selection. Missing fields are not zero; any exact values remain in the table and CSV.", "item-hour-context"));
      return chart2;
    }
    const W = Math.max(320, Math.min(960, Math.round(container.clientWidth || 760))), H2 = 360, L = 85, R = 22, T = 48, B = 105, plotW = W - L - R, plotH = H2 - T - B, center = (L + W - R) / 2;
    const svg = svgNode("svg", { viewBox: `0 0 ${W} ${H2}`, role: "img", tabindex: 0, "aria-label": "Whole-item hourly medians: source-labelled sold and seen asking; no quality-matched history" });
    chart2.append(svg, help, tip);
    svg.append(svgNode("title", {}, "Retained whole-item hourly aggregate medians"), svgNode("text", { x: center, y: 20, "text-anchor": "middle", class: "item-hour-axis-title" }, "Price (mesos / source unit)"));
    const first = p.first ?? 0, last = p.last ?? first, span = last - first || 3600, x = (epoch) => L + (last === first ? 0.5 : (epoch - first) / span) * plotW, y = (value) => T + plotH * (1 - value / (p.max || 1));
    for (let i = 0; i <= 4; i++) {
      const at = T + plotH * i / 4, n = p.max * (1 - i / 4);
      svg.append(svgNode("line", { x1: L, x2: W - R, y1: at, y2: at, class: "item-hour-grid" }), svgNode("text", { x: L - 9, y: at + 5, "text-anchor": "end", class: "item-hour-tick" }, new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)));
    }
    const ticks = first === last ? 1 : W < 480 ? 2 : 4;
    for (let i = 0; i < ticks; i++) {
      const epoch = ticks === 1 ? first : first + Math.round((last - first) * i / (ticks - 1)), at = x(epoch), date = parts(new Date(epoch * 1e3).toISOString(), zone2), anchor = ticks === 1 ? "middle" : i === 0 ? "start" : i === ticks - 1 ? "end" : "middle";
      svg.append(svgNode("line", { x1: at, x2: at, y1: T, y2: H2 - B, class: "item-hour-grid item-hour-grid-vertical" }), svgNode("line", { x1: at, x2: at, y1: H2 - B, y2: H2 - B + 6, class: "item-hour-tick-line" }), svgNode("text", { x: at, y: H2 - B + 25, "text-anchor": anchor, class: "item-hour-tick" }, `${date.month} ${date.day}`), svgNode("text", { x: at, y: H2 - B + 45, "text-anchor": anchor, class: "item-hour-tick" }, `${date.hour}:${date.minute}`));
    }
    svg.append(svgNode("text", { x: center, y: H2 - B + 76, "text-anchor": "middle", class: "item-hour-axis-title" }, "Source hour (" + zone2 + ")"));
    const targets = [];
    for (const s of p.series) {
      let previous = null;
      for (const point of s.points) {
        if (point.value === null) {
          previous = null;
          continue;
        }
        if (previous && point.epoch - previous.epoch === 3600) svg.append(svgNode("line", { x1: x(previous.epoch), y1: y(previous.value), x2: x(point.epoch), y2: y(point.value), stroke: s.color, "stroke-width": 2, class: "item-hour-series-line" }));
        const circle = svgNode("circle", { cx: x(point.epoch), cy: y(point.value), r: 4, fill: s.color, "data-history-series": s.key, "data-history-epoch": point.epoch, "data-history-raw": point.raw }), text = `${s.label}: ${historyMoney(point.raw)} mesos. Source bucket: ${historyClock(new Date(point.epoch * 1e3).toISOString(), zone2)}. Original retrieval: ${historyClock(point.retrievedAt, zone2)}. Exact source price: ${point.raw}.`, show = () => {
          for (const t of targets) t.node.classList.remove("is-inspected");
          circle.classList.add("is-inspected");
          tip.textContent = text;
        };
        circle.append(svgNode("title", {}, text));
        circle.addEventListener("mouseenter", show);
        circle.addEventListener("click", show);
        svg.append(circle);
        targets.push({ node: circle, show });
        previous = point;
      }
    }
    let chosen = -1;
    svg.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key) || !targets.length) return;
      event.preventDefault();
      chosen = (chosen + (event.key === "ArrowRight" ? 1 : -1) + targets.length) % targets.length;
      targets[chosen].show();
    });
    const legend = el("div", void 0, "item-hour-legend");
    for (const s of p.series) {
      const n = el("span", s.label);
      n.style.color = s.color;
      legend.append(n);
    }
    chart2.append(legend, el("p", "Plotted coordinates use approximate numeric scale; hover shows one decimal and the exact source string. " + (p.omitted ? `${count(p.omitted)} values outside the chart numeric range remain in the table and CSV.` : ""), "item-hour-context"));
    return chart2;
  }
  function table(data) {
    const details = el("details", void 0, "item-hour-inspection");
    details.open = false;
    details.append(el("summary", "Inspect source rows and retained revisions"));
    const modes = el("div", void 0, "item-hour-table-modes");
    for (const [value, label] of [[false, "Latest version per hour"], [true, "All retained revisions"]]) {
      const b = el("button", label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(allRevisions === value));
      b.addEventListener("click", () => {
        allRevisions = value;
        page = 0;
        renderTable();
      });
      modes.append(b);
    }
    details.append(modes);
    const feedback = el("p", void 0, "item-hour-table-feedback"), wrap = el("div", void 0, "item-hour-table-wrap");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "Hourly source rows, horizontally scrollable");
    const pager = el("div", void 0, "item-hour-pager"), prev = el("button", "Previous 25"), next = el("button", "Next 25"), pageText = el("span"), csv = el("button", "Download exact CSV");
    for (const b of [prev, next, csv]) b.type = "button";
    prev.addEventListener("click", () => {
      page--;
      renderTable();
    });
    next.addEventListener("click", () => {
      page++;
      renderTable();
    });
    csv.addEventListener("click", () => {
      const text = historyCsv(data, allRevisions), filename = `item-1082002-whole-hour-${allRevisions ? "revisions" : "latest"}.csv`;
      if (download) {
        download(text, filename);
        return;
      }
      const url = win.URL.createObjectURL(new win.Blob([text], { type: "text/csv;charset=utf-8" })), a = el("a");
      a.href = url;
      a.download = filename;
      a.click();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 0);
    });
    pager.append(prev, pageText, next, csv);
    details.append(feedback, wrap, pager);
    function renderTable() {
      const records = allRevisions ? data.revisions : data.rows, pages = Math.max(1, Math.ceil(records.length / 25));
      page = Math.max(0, Math.min(page, pages - 1));
      for (const b of modes.children) b.setAttribute("aria-pressed", String(b.textContent === "All retained revisions" === allRevisions));
      feedback.textContent = allRevisions ? "Each retained version is shown separately. Revisions overlap; their bundle/unit/listing counts must not be added." : "One latest retained version per source hour. Missing hours are not zero.";
      const t = el("table"), head = el("thead"), tr = el("tr"), tbody = el("tbody");
      t.append(el("caption", allRevisions ? "Retained revisions \u2014 overlapping observations" : "Latest whole-item source buckets"), head, tbody);
      head.append(tr);
      for (const name of ["Source bucket hour", "Source-labelled sold median / AVG", "Reported bundles / units", "Seen asking median / listings", "Original retrieval", "Revision"]) {
        const th = el("th", name);
        th.scope = "col";
        tr.append(th);
      }
      for (const r of records.slice(page * 25, page * 25 + 25)) {
        const row = el("tr");
        row.dataset.revisionOrder = String(r.revisionOrder);
        for (const text of [historyClock(r.hour.providerBucketTimestampUtc, zone2), `${historyMoney(r.hour.sold?.median_unit_price)} / ${historyMoney(r.hour.sold?.avg_unit_price)}`, r.hour.sold ? `${count(r.hour.sold.reportedBundles)} / ${count(r.hour.sold.reportedUnits)}` : "Unknown", `${historyMoney(r.hour.seen?.median_unit_price)} / ${r.hour.seen ? count(r.hour.seen.reportedListingCount) : "Unknown"}`, historyClock(r.originalRetrievedAt, zone2), `${r.revisionOrder} \xB7 ${r.latest ? "latest" : "superseded"}`]) row.append(el("td", text));
        row.title = "Exact source values remain in CSV; bucket " + r.hour.providerBucketTimestampUtc + "; original retrieval " + r.originalRetrievedAt;
        tbody.append(row);
      }
      if (!records.length) {
        const row = el("tr"), td = el("td", "No retained source buckets in this snapshot.");
        td.colSpan = 6;
        row.append(td);
        tbody.append(row);
      }
      wrap.replaceChildren(t);
      pageText.textContent = `Page ${count(page + 1)} of ${count(pages)}`;
      prev.disabled = page === 0;
      next.disabled = page + 1 === pages;
    }
    renderTable();
    return details;
  }
  function render() {
    if (!live() || !selected) return;
    body.hidden = false;
    body.replaceChildren();
    if (itemId !== FINITE_HISTORY_ITEM_ID) {
      body.append(el("p", "Hourly history unavailable for this item. The finite preview covers only 1082002 Steel Fingerless Gloves.", "item-hour-status"));
      return;
    }
    const title = el("h2", "Hourly whole-item price history"), identity2 = el("h3", NAME + " \xB7 1082002"), status = el("p", model.status === "loading" ? "Checking this site\u2019s retained hourly snapshot\u2026" : model.status === "ready" ? "Validated finite snapshot; retrieval is not trade time." : model.data ? "Retained snapshot; original retrieval is unchanged." : "No validated hourly snapshot is published for this item. Other price evidence remains separate.", "item-hour-status");
    status.setAttribute("role", "status");
    status.dataset.mode = model.status;
    body.append(title, identity2, status);
    body.append(el("p", "Whole-item aggregates with unknown roll identity. Current ATT, stat, slot and upgrade filters above do not apply. No matched-quality history or individual transactions are inferred.", "item-hour-context"));
    const data = model.data;
    if (!data) return;
    const clock3 = el("p", "Original included retrieval: " + historyClock(data.latestOriginalRetrievedAt, zone2) + " \xB7 underlying observation and individual sale times unknown.", "item-hour-original-clock");
    clock3.dataset.rawDate = "true";
    clock3.title = data.latestOriginalRetrievedAt ?? "Unknown";
    body.append(clock3, el("p", `${count(data.rows.length)} retained source hours \xB7 ${count(data.revisions.length)} separately retained versions \xB7 0 qualified individual trades. Bucket completion and physical stack conversion are unverified.`, "item-hour-context"), chart(data), table(data));
    const credit = el("a", "Hourly aggregate source: MapleStory Market \u2197");
    credit.href = data.source.creditUrl;
    credit.rel = "noopener noreferrer";
    credit.target = "_blank";
    body.append(credit);
  }
  async function setEnabled(value) {
    if (destroyed) return;
    if (value === true && (!live() || doc2.body.dataset.previewControlsLocked === "true")) return;
    transportEpoch++;
    selected = value === true;
    toggle.textContent = "Hourly whole-item history: " + (selected ? "On" : "Off");
    toggle.setAttribute("aria-pressed", String(selected));
    client2.setEnabled(selected && itemId === FINITE_HISTORY_ITEM_ID);
    if (!selected) {
      body.replaceChildren();
      body.hidden = true;
      return;
    }
    page = 0;
    allRevisions = false;
    render();
    if (itemId === FINITE_HISTORY_ITEM_ID) await client2.select(itemId);
  }
  toggle.addEventListener("click", () => void setEnabled(!selected));
  const resize = () => {
    if (live() && selected && model.data) render();
  };
  win.addEventListener("resize", resize);
  return Object.freeze({ element: section, get enabled() {
    return selected;
  }, setEnabled, updateTimezone(value) {
    zone2 = safeZone(value);
    if (live() && selected) render();
  }, destroy() {
    destroyed = true;
    client2.setEnabled(false);
    win.removeEventListener("resize", resize);
    section.remove();
  }, stats: () => client2.stats() });
}

// ui-src/item-api/entry.mjs
if (!window.AstraReferenceStatus) Object.defineProperty(window, "AstraReferenceStatus", { value: Object.freeze({ describe: describeReferenceStatus, decorate: decorateReferenceStatus }), writable: false, configurable: false });
var doc = document;
var available = doc.body.dataset.itemApiPreview === "available";
var scope = doc.getElementById("display-options");
var enabled = false;
var identityStatusRefresh = null;
var identity = null;
var identityFlight = null;
var host = null;
var life = null;
var hourHistory = null;
var lastId = null;
var latest = null;
var identityEpoch = 0;
var refreshTimer = null;
var refreshFlight = null;
var refreshEpoch = 0;
var started = false;
var pausedRead = null;
var zone = () => doc.getElementById("display-timezone")?.value || "UTC";
var make = (tag, text) => {
  const n = doc.createElement(tag);
  if (text !== void 0) n.textContent = text;
  return n;
};
var validId = (id2) => Number.isSafeInteger(id2) && id2 > 0 && id2 <= 999999999;
var priceFreeIdentities = doc.body.dataset.searchIdentityProfile === "price_free_owned_membership_v2";
var itemFetcher = priceFreeIdentities ? createSearchSelectedPriceFetcher((...args) => fetch(...args), { expectedEpoch: doc.body.dataset.fastItemEpoch, isEnabled: () => enabled }) : (...args) => fetch(...args);
var client = createItemReferenceClient({ fetcher: itemFetcher, enabled: available, isEnabled: () => enabled });
var discovery = priceFreeIdentities ? createPriceFreeIdentityBridge({ fetcher: (...args) => fetch(...args), enabled: available, isEnabled: () => enabled, expectedEpoch: doc.body.dataset.searchIdentityEpoch }) : createSearchIdentityBridge({ fetcher: (...args) => fetch(...args), enabled: available, isEnabled: () => enabled });
var visibleOnline = () => !doc.hidden && navigator.onLine !== false;
function sameItemRoute() {
  try {
    return location.hash.startsWith("#item/") && decodeURIComponent(location.hash.slice(6).split(/[?&]/)[0]) === latest?.slug;
  } catch {
    return false;
  }
}
var current = () => available && enabled && host && life && validId(lastId) && sameItemRoute();
function clearRefreshTimer() {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
}
function scheduleRefresh() {
  if (!current() || !visibleOnline() || client.diagnostic(lastId).blocked) {
    clearRefreshTimer();
    return;
  }
  if (refreshTimer !== null) return;
  const delay = Math.max(6e4, client.diagnostic(lastId).retryAt - Date.now());
  const epoch = refreshEpoch, id2 = lastId, ownLife = life;
  const timer = setTimeout(() => {
    if (refreshTimer !== timer || epoch !== refreshEpoch || life !== ownLife || lastId !== id2) return;
    refreshTimer = null;
    void refreshCurrentItem();
  }, delay);
  refreshTimer = timer;
}
function pauseRefresh() {
  clearRefreshTimer();
  refreshEpoch++;
  refreshFlight = null;
  life?.pause();
  if (validId(lastId)) pausedRead = { id: lastId, promise: client.cancelItem(lastId) };
}
function refreshCurrentItem() {
  if (!current()) return Promise.resolve();
  if (!visibleOnline()) {
    pauseRefresh();
    return Promise.resolve();
  }
  if (client.diagnostic(lastId).blocked) return Promise.resolve();
  if (refreshFlight) return refreshFlight.promise;
  const ownLife = life, id2 = lastId, epoch = refreshEpoch, task = {};
  task.promise = (async () => {
    try {
      if (pausedRead?.id === id2) await pausedRead.promise;
      if (epoch !== refreshEpoch || life !== ownLife || lastId !== id2 || !current() || !visibleOnline()) return;
      if (!started) {
        started = true;
        await ownLife.show(id2);
      } else await ownLife.refresh();
    } finally {
      if (refreshFlight === task) refreshFlight = null;
      if (epoch === refreshEpoch && life === ownLife) scheduleRefresh();
    }
  })();
  refreshFlight = task;
  return task.promise;
}
var rows = () => identity?.rows ?? [];
var byId = (id2) => rows().find((r) => r.itemId === id2) || null;
function resolveId(record, slug) {
  const direct = /^id-([1-9][0-9]{0,8})$/.exec(slug ?? "");
  if (direct) return Number(direct[1]);
  if (validId(record?.canonicalId)) return record.canonicalId;
  if (priceFreeIdentities && validId(record?.id) && byId(record.id)) return record.id;
  const matched = rows().filter((r) => r.providerBindings.some((b) => b.slug === record?.slug && b.name === record?.name));
  return matched.length === 1 ? matched[0].itemId : null;
}
function hide() {
  pauseRefresh();
  started = false;
  hourHistory?.destroy();
  hourHistory = null;
  life?.hide();
  host?.remove();
  life = null;
  host = null;
  lastId = null;
  identityStatusRefresh = null;
}
function identityShell(record, container) {
  const row = byId(record.canonicalId);
  container.replaceChildren();
  const title = make("h2", record.name), p = make("p", row?.knownSourceId ? "Known source identity. Price is checked separately on selection; no daily history, fixed NX cost or current price is inferred from membership." : "Retained API identity. No daily history, fixed NX cost or current price is inferred from this entry.");
  container.append(title, p);
  if (row?.sprite) {
    const image = make("img");
    image.src = row.sprite;
    image.alt = record.name + " original game icon";
    image.width = 48;
    image.height = 48;
    title.prepend(image);
  }
  container.append(make("p", (row?.knownSourceId ? (row.collectionRetained ? "Retained complete identity collection; " : "") + (row.retainedKnownId ? "Known retained ID, absent from the latest published source sets. " : "Latest published source membership: ") : "Identity presence was retained from ") + row.memberships.map((m) => m.operation + (m.presentInSnapshot ? " accepted snapshot \xB7 " : " retained membership \xB7 ") + retrievalClock(m.capturedAt, zone())).join(" \xB7 ") + ". Underlying source observation times are unknown."));
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
    if (priceFreeIdentities) identityStatusRefresh?.();
    if (changed) doc.dispatchEvent(new CustomEvent("astrapiitemidentities"));
    return value;
  })().catch((error) => {
    if (priceFreeIdentities && discovery.state()?.blocked) {
      identity = null;
      doc.dispatchEvent(new CustomEvent("astrapiitemidentities"));
    }
    throw error;
  }).finally(() => {
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
    hourHistory?.updateTimezone(zone());
    scheduleRefresh();
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
    try {
      const value = await client.loadItem(query);
      status.dataset.mode = value.mode;
      return value.data;
    } finally {
      doc.dispatchEvent(new Event("astrapiitemcache"));
    }
  }, getTimezone: zone, spriteMap: { ...args.spriteMap, ...Object.fromEntries(rows().filter((r) => r.sprite).map((r) => [r.itemId, r.sprite])) }, onStatus: (value, meta = {}) => {
    identityStatusRefresh = () => {
      const state = client.state(id2), d = client.diagnostic(id2), reason = meta.reason || d.reason, retained = value === "retained" || value === "shown" && state?.mode === "retained";
      status.dataset.status = value;
      status.dataset.reason = reason || "";
      if (value === "access_denied" || value === "unavailable") status.dataset.mode = value;
      else if (retained) status.dataset.mode = "retained";
      const reasons = { not_found: "This item is not in the currently published collection.", generation_changed: "The item generation changed during the bounded check.", invalid: "The new item response failed validation.", timeout: "The own-site check timed out.", unavailable: "The own-site check failed.", read_capacity: "The bounded item reader is busy." };
      let text = value === "access_denied" ? "Item access unavailable; prior panel withdrawn. After access is restored, turn Item API details Off and On to retry." : value === "paused" ? meta.hasData ? "Item checks paused while hidden or offline; original retrieval is unchanged." : "Item checks paused while hidden or offline; no validated item reference yet." : value === "loading" ? meta.hasData ? "Checking this site\u2019s cached item reference; displayed values keep their original retrieval\u2026" : "Reading this site\u2019s cached item reference\u2026" : retained ? "Retained item reference; original retrieval preserved. " + (reasons[reason] || "The latest check did not supply a replacement.") : value === "shown" ? d.partial ? "Separate item reference; some source fields are unavailable. Retrieval is not trade time." : "Separate item reference; retrieval is not trade time." : value === "unavailable" ? "No validated item reference is connected. " + (reasons[reason] || "") + " Daily and other-source evidence remain separate." : "";
      let indicator = describeReferenceStatus({ capturedAt: meta.hasData === true ? state?.capturedAt : null, status: value, hasData: meta.hasData === true, retained, partial: d.partial, visible: !doc.hidden, online: navigator.onLine !== false, bandMinutes: 20 });
      const relation = priceFreeIdentities ? describeSearchPriceRelation(identity, id2, meta.hasData === true ? state?.capturedAt : null) : null;
      if (relation) {
        text += " " + relation.label;
        indicator = qualifySearchPriceStatus(indicator, relation);
      }
      if (["recent", "aged", "clock_uncertain", "clock_unknown", "partial"].includes(indicator.phase)) text += " " + indicator.label + ".";
      decorateReferenceStatus(status, indicator, (doc.body.dataset.itemApiSynthetic === "true" ? "SYNTHETIC OWN-SITE FIXTURE \xB7 " : "") + text);
    };
    identityStatusRefresh();
  } });
  void refreshCurrentItem();
  const ownHost = host;
  hourHistory = mountItemHistoryPreview(host, { itemId: id2, timezone: zone(), parentActive: () => available && enabled, isCurrent: () => {
    try {
      return host === ownHost && lastId === id2 && decodeURIComponent(location.hash.slice(6).split(/[?&]/)[0]) === latest?.slug && resolveId(latest?.record, latest?.slug) === id2;
    } catch {
      return false;
    }
  } });
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
    out.push({ key: "api-identity-" + item.itemId, slug: "id-" + item.itemId, id: item.itemId, name: item.name, type: item.knownSourceId ? "Known source ID \xB7 price checked on selection" : "Retained API identity \xB7 no daily price inferred", price: null, priceDay: null, publisherMedian: null, knownNxCost: null, dailyRate: null, catalog: true, catalogKey: "api-identity-" + item.itemId, metadata: true, apiIdentityOnly: true, apiIdentity: item, sprite: item.sprite });
  }
  return out;
}
var api = { available, peekCachedReferences: () => client.peekCachedReferences(), get enabled() {
  return enabled;
}, async setEnabled(value) {
  if (!available) return;
  const next = value === true;
  if (next !== enabled) identityEpoch++;
  if (next && !enabled) {
    client.resetAccess();
    if (priceFreeIdentities) discovery.resetAccess();
  }
  enabled = next;
  if (button) {
    button.textContent = "Item API details: " + (enabled ? "On" : "Off");
    button.setAttribute("aria-pressed", String(enabled));
  }
  if (!enabled) {
    if (priceFreeIdentities) discovery.clear();
    hide();
    doc.dispatchEvent(new CustomEvent("astrapiitemidentities"));
    doc.dispatchEvent(new Event("astrapiitemcache"));
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
  if (identity?.schemaVersion === 2) return `${identity.mode === "retained" ? "Retained complete collection: " : ""}${identity.itemCount} known source IDs; ${identity.pricesMembershipCount} belong to the published normalized prices membership. Prices are not prefetched by search and are checked separately on selection; membership is not a current price, sale, stock or fresh observation.`;
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
doc.getElementById("display-timezone")?.addEventListener("change", () => {
  life?.timezoneChanged(zone());
  hourHistory?.updateTimezone(zone());
});
window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith("#item/") || host && !sameItemRoute()) hide();
});
function resumeRefresh() {
  if (current() && visibleOnline()) void refreshCurrentItem();
}
doc.addEventListener("visibilitychange", () => {
  if (visibleOnline()) resumeRefresh();
  else pauseRefresh();
});
window.addEventListener("online", resumeRefresh);
window.addEventListener("offline", pauseRefresh);
doc.getElementById("refresh")?.addEventListener("click", resumeRefresh);
doc.addEventListener("astramarketsnapshot", () => {
  if (enabled) void loadIdentities().catch(() => {
  });
});
doc.addEventListener("astracalculationcheck", () => {
  if (priceFreeIdentities && enabled && visibleOnline()) void loadIdentities().catch(() => {
  });
});
window.addEventListener("online", () => {
  if (priceFreeIdentities && enabled) void loadIdentities().catch(() => {
  });
});
doc.addEventListener("visibilitychange", () => {
  if (priceFreeIdentities && enabled && visibleOnline()) void loadIdentities().catch(() => {
  });
});
if (priceFreeIdentities && available && doc.body.dataset.searchIdentityEnabled === "true") void api.setEnabled(true);

})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "item-api-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: api-calculations.js */
try {
(() => {
'use strict';
// ops/portable-hash.mjs
var HASH_METHOD = "mcat-typed-utf8-f64-v1";
var encoder = new TextEncoder();
function utf8(text) {
  for (const char of text) {
    const point = char.codePointAt(0);
    if (point >= 55296 && point <= 57343) throw Error("Unpaired surrogate is not valid UTF-8");
  }
  return encoder.encode(text);
}
function codepointCompare(a, b) {
  const left = Array.from(a), right = Array.from(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const difference = left[i].codePointAt(0) - right[i].codePointAt(0);
    if (difference) return difference;
  }
  return left.length - right.length;
}
function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}
function canonicalBytes(value) {
  if (value === null) return utf8("z");
  if (typeof value === "boolean") return utf8(value ? "t" : "f");
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw Error("Unsupported canonical number");
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value === 0 ? 0 : value, false);
    return utf8("n" + [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
  }
  if (typeof value === "string") {
    const bytes = utf8(value);
    return concat([utf8("s" + bytes.byteLength + ":"), bytes]);
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw Error("Sparse arrays are not canonical");
    return concat([utf8("a" + value.length + ":"), ...value.map(canonicalBytes)]);
  }
  if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const keys = Object.keys(value).sort(codepointCompare);
    return concat([utf8("o" + keys.length + ":"), ...keys.flatMap((key) => [canonicalBytes(key), canonicalBytes(value[key])])]);
  }
  throw Error("Unsupported canonical value");
}
async function portableHash(value) {
  const bytes = concat([utf8(HASH_METHOD + "\n"), canonicalBytes(value)]);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ops/api-index-public-contract.mjs
var MAX_PUBLIC_BYTES = 6e5;
var ITEM_HISTORY_COLUMNS = Object.freeze(["day", "medianUnitPriceLexeme", "recordedSalesCount", "reportedUnitCount", "qualified", "partialCalendarDay", "sourceContextId", "linkedPrice"]);
var HASH = /^[a-f0-9]{64}$/;
var METHOD = "api-v2-chainlink-20261104-v1";
var fail = (code) => {
  throw Error("api_index_" + code);
};
var near = (a, b) => {
  if (Math.abs(a - b) > Math.max(1e-9, Math.abs(b) * 1e-12)) fail("formula");
};
function shape(v, keys, optional = []) {
  if (!v || typeof v !== "object" || Array.isArray(v) || keys.some((k) => !Object.hasOwn(v, k)) || Object.keys(v).some((k) => !keys.includes(k) && !optional.includes(k))) fail("fields");
}
function hash(v) {
  if (typeof v !== "string" || !HASH.test(v)) fail("hash");
}
function n(v, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) fail("number");
}
function count(v, max = Number.MAX_SAFE_INTEGER) {
  n(v, 0, max);
  if (!Number.isSafeInteger(v)) fail("count");
}
function nullableNumber(v, min = 0) {
  if (v !== null) n(v, min);
}
function str(v, max = 300) {
  if (typeof v !== "string" || !v.trim() || v.length > max) fail("text");
}
function price(v) {
  if (v !== null && (typeof v !== "string" || v.length > 160 || !/^\d+(?:\.\d+)?$/.test(v) || !Number.isFinite(Number(v)) || Number(v) > Number.MAX_SAFE_INTEGER)) fail("price_lexeme");
}
function clock(v) {
  str(v, 40);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v.slice(0, 10)) fail("clock");
}
function day(v) {
  str(v, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(v) || (/* @__PURE__ */ new Date(v + "T00:00:00Z")).toISOString().slice(0, 10) !== v) fail("day");
}
function status(v) {
  if (!["available", "unavailable"].includes(v.status) || v.available !== (v.status === "available")) fail("status");
}
function source(v, op) {
  if (v === null) return;
  shape(v, ["operation", "sourceUrl", "rawBodySha256", "capturedAt", "sourceObservedAt", "captureTimeKind"], op === "prices" ? ["reportedDays", "exactStartAt", "exactEndAt", "captureHash"] : ["sourceGeneratedAt"]);
  if (v.operation !== op || v.sourceUrl !== (op === "prices" ? "https://maplestory.market/api/prices" : "https://maplestory.market/api/market/overview") || v.sourceObservedAt !== null || v.captureTimeKind !== "http_response_completed") fail("source");
  hash(v.rawBodySha256);
  clock(v.capturedAt);
  if (op === "prices") {
    if (v.reportedDays !== 3 || v.exactStartAt !== null || v.exactEndAt !== null) fail("window");
    hash(v.captureHash);
  } else {
    clock(v.sourceGeneratedAt);
    if (Date.parse(v.sourceGeneratedAt) > Date.parse(v.capturedAt)) fail("future_generated");
  }
}
function benchmark(v, kind) {
  if (kind === "fixed") {
    shape(v, ["status", "available", "rateMesosPerNx"], ["reason", "basis", "baseRate"]);
    status(v);
    nullableNumber(v.rateMesosPerNx);
    if (v.available) {
      if (v.basis !== "frozen_legacy_nx_base_x_current_3day_index") fail("fixed_basis");
      n(v.baseRate, Number.MIN_VALUE);
    } else if (typeof v.reason !== "string") fail("reason");
    return;
  }
  shape(v, ["status", "available", "rateMesosPerNx", "reason", "cashAnchorRate", "meanLinkedDailyMpi", "windowStart", "windowEndExclusive", "dayCount", "missingDays", "basis", "currentCapturedAt"]);
  status(v);
  for (const k of ["rateMesosPerNx", "cashAnchorRate", "meanLinkedDailyMpi"]) nullableNumber(v[k]);
  if (v.basis !== "cash_daily_anchor_x_current_3day_index_over_daily_mean" || v.dayCount !== kind) fail("rolling_basis");
  if (v.windowStart !== null) day(v.windowStart);
  if (v.windowEndExclusive !== null) day(v.windowEndExclusive);
  if (v.currentCapturedAt !== null) clock(v.currentCapturedAt);
  if (!Array.isArray(v.missingDays) || v.missingDays.length > kind) fail("missing_days");
  v.missingDays.forEach(day);
  if (v.available && (v.reason !== null || v.missingDays.length || v.rateMesosPerNx === null || v.cashAnchorRate === null || v.meanLinkedDailyMpi === null)) fail("available_benchmark");
}
function validateApiIndexSnapshot(v, { expectedDefinitionHash, expectedRows, expectedCashRows } = {}) {
  shape(v, ["schemaVersion", "kind", "methodVersion", "definitionHash", "calibration", "sources", "current", "daily", "benchmarks", "maxInputCapturedAt", "publicationEligible", "sourceObservedAt", "qualifiedIndividualTrades", "limitations", "dailyInputHash", "snapshotHash"]);
  if (v.schemaVersion !== 1 || v.kind !== "api_linked_market_calculations" || v.methodVersion !== METHOD || v.publicationEligible !== false || v.sourceObservedAt !== null || v.qualifiedIndividualTrades !== 0) fail("profile");
  hash(v.definitionHash);
  hash(v.dailyInputHash);
  hash(v.snapshotHash);
  if (expectedDefinitionHash !== void 0 && v.definitionHash !== expectedDefinitionHash) fail("definition");
  const c = v.calibration;
  shape(c, ["linkDay", "basketHash", "legacySourceUpdatedAt", "legacyReportSha256", "anchorOverviewRawSha256", "anchorOverviewCapturedAt", "qualityConstant", "retrospectiveLink"]);
  if (c.linkDay !== "2026-11-04" || c.qualityConstant !== false || c.retrospectiveLink !== true) fail("calibration");
  for (const k of ["basketHash", "legacyReportSha256", "anchorOverviewRawSha256"]) hash(c[k]);
  clock(c.legacySourceUpdatedAt);
  clock(c.anchorOverviewCapturedAt);
  shape(v.sources, ["prices", "overview"]);
  source(v.sources.prices, "prices");
  source(v.sources.overview, "overview");
  const clocks = [v.sources.prices?.capturedAt, v.sources.overview?.capturedAt].filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b));
  if (v.maxInputCapturedAt !== (clocks.at(-1) ?? null)) fail("input_clock");
  const x = v.current;
  shape(x, ["basis", "status", "available", "index", "expectedItems", "availableItems", "observedWeight", "rows", "categories", "reason"]);
  status(x);
  if (x.basis !== "api_reported_3day_sale_median_reference" || x.expectedItems !== 50 || !Array.isArray(x.rows) || x.rows.length !== 50 || !Array.isArray(x.categories) || x.categories.length > 10) fail("current");
  count(x.availableItems, 50);
  n(x.observedWeight, 0, 1.00000000001);
  nullableNumber(x.index);
  if (x.available !== (x.availableItems === 50) || x.available !== (x.index !== null) || x.available && v.sources.prices === null) fail("current_coverage");
  const ids = /* @__PURE__ */ new Set(), slugs = /* @__PURE__ */ new Set();
  let weight = 0, available2 = 0, index = 0, observedWeight = 0;
  for (const r of x.rows) {
    shape(r, ["itemId", "slug", "name", "category", "weight", "basePrice", "legacyLinkPrice", "APIlinkPrice", "currentSaleMedianLexeme", "currentLinkedPrice", "indexContribution", "changeContribution", "changeBase", "recordedSalesCount"]);
    count(r.itemId, 999999999);
    if (r.itemId === 0 || ids.has(r.itemId) || slugs.has(r.slug)) fail("identity");
    ids.add(r.itemId);
    slugs.add(r.slug);
    str(r.slug, 200);
    str(r.name);
    str(r.category, 80);
    n(r.weight, Number.MIN_VALUE, 0.080000000001);
    weight += r.weight;
    n(r.basePrice, Number.MIN_VALUE);
    n(r.legacyLinkPrice, Number.MIN_VALUE);
    price(r.APIlinkPrice);
    if (r.APIlinkPrice === null || Number(r.APIlinkPrice) <= 0) fail("link_price");
    price(r.currentSaleMedianLexeme);
    if (r.recordedSalesCount !== null) count(r.recordedSalesCount);
    nullableNumber(r.currentLinkedPrice);
    for (const k of ["indexContribution", "changeContribution", "changeBase"]) if (r[k] !== null) n(r[k]);
    if (r.currentLinkedPrice !== null) {
      available2++;
      observedWeight += r.weight;
      if (r.currentSaleMedianLexeme === null || Number(r.currentSaleMedianLexeme) <= 0 || r.recordedSalesCount < 5) fail("thin_current");
      near(r.currentLinkedPrice, r.legacyLinkPrice * Number(r.currentSaleMedianLexeme) / Number(r.APIlinkPrice));
      near(r.indexContribution, 100 * r.weight * r.currentLinkedPrice / r.basePrice);
      near(r.changeBase, 100 * (r.currentLinkedPrice / r.basePrice - 1));
      near(r.changeContribution, r.weight * r.changeBase);
      index += r.indexContribution;
    } else if (r.indexContribution !== null || r.changeContribution !== null || r.changeBase !== null) fail("missing_contribution");
  }
  if (Math.abs(weight - 1) > 1e-12 || available2 !== x.availableItems || x.available && Math.abs(index - x.index) > 1e-9) fail("current_totals");
  near(x.observedWeight, observedWeight);
  if (expectedRows !== void 0) {
    if (!Array.isArray(expectedRows) || expectedRows.length !== 50) fail("expected_rows");
    for (const r of x.rows) {
      const e = expectedRows.find((e2) => e2.itemId === r.itemId);
      if (!e || ["slug", "name", "category", "weight", "basePrice", "legacyLinkPrice", "APIlinkPrice"].some((k) => r[k] !== e[k])) fail("static_row_binding");
    }
  }
  const seenCategories = /* @__PURE__ */ new Set();
  for (const r of x.categories) {
    shape(r, ["category", "index", "changeBase", "weight", "observedWeight", "expectedItems", "availableItems"]);
    str(r.category, 80);
    if (seenCategories.has(r.category)) fail("category_duplicate");
    seenCategories.add(r.category);
    nullableNumber(r.index);
    if (r.changeBase !== null) n(r.changeBase);
    n(r.weight, Number.MIN_VALUE, 1.00000000001);
    n(r.observedWeight, 0, 1.00000000001);
    count(r.expectedItems, 50);
    count(r.availableItems, r.expectedItems);
    const rr = x.rows.filter((x2) => x2.category === r.category), aa = rr.filter((x2) => x2.currentLinkedPrice !== null);
    if (r.expectedItems !== rr.length || r.availableItems !== aa.length || r.index !== null !== (aa.length === rr.length)) fail("category_coverage");
    near(r.weight, rr.reduce((n2, r2) => n2 + r2.weight, 0));
    near(r.observedWeight, aa.reduce((n2, r2) => n2 + r2.weight, 0));
    if (r.index !== null) {
      near(r.index, rr.reduce((n2, r2) => n2 + r2.indexContribution, 0) / r.weight);
      near(r.changeBase, r.index - 100);
    }
  }
  if (seenCategories.size !== new Set(x.rows.map((r) => r.category)).size) fail("category_missing");
  shape(v.daily, ["basis", "activeWindowDays", "availableDayCount", "latestDay", "history", "itemHistory"]);
  count(v.daily.activeWindowDays, 400);
  if (v.daily.activeWindowDays < 3 || v.daily.basis !== "api_overview_daily_linked_v2" || !Array.isArray(v.daily.history) || v.daily.history.length > v.daily.activeWindowDays || v.daily.availableDayCount !== v.daily.history.length) fail("daily");
  let prior = "";
  for (const r of v.daily.history) {
    shape(r, ["day", "index", "status", "observedWeight", "carriedWeight", "partialCalendarDay", "backcast", "nxRate", "cashItems", "cashRecordedSalesCount"]);
    day(r.day);
    if (r.day <= prior) fail("daily_order");
    prior = r.day;
    nullableNumber(r.index);
    if (!["available", "unavailable"].includes(r.status)) fail("daily_status");
    n(r.observedWeight, 0, 1.00000000001);
    n(r.carriedWeight, 0, 1.00000000001);
    if (typeof r.partialCalendarDay !== "boolean" || r.backcast !== r.day < c.linkDay) fail("daily_semantics");
    nullableNumber(r.nxRate);
    count(r.cashItems, 29);
    count(r.cashRecordedSalesCount);
  }
  if (v.daily.history.length && Date.parse(v.daily.history.at(-1).day + "T00:00:00Z") - Date.parse(v.daily.history[0].day + "T00:00:00Z") > (v.daily.activeWindowDays - 1) * 864e5) fail("daily_calendar_window");
  const cashDaily = validateItemHistory(v.daily.itemHistory, v, expectedCashRows);
  for (const h of v.daily.history) {
    if (h.day < v.daily.itemHistory.startDayInclusive || h.day > v.daily.itemHistory.endDayInclusive) continue;
    const cash = cashDaily.get(h.day) ?? { items: 0, count: 0, total: 0 };
    if (h.cashItems !== cash.items || h.cashRecordedSalesCount !== cash.count) fail("daily_cash_evidence");
    if (cash.items >= 3) {
      if (h.nxRate === null) fail("daily_cash_evidence");
      near(h.nxRate, cash.total / cash.count);
    } else if (h.nxRate !== null) fail("daily_cash_evidence");
  }
  if (v.daily.latestDay !== (v.daily.history.at(-1)?.day ?? null)) fail("daily_latest");
  shape(v.benchmarks, ["fixed", "rolling7", "rolling3"]);
  benchmark(v.benchmarks.fixed, "fixed");
  benchmark(v.benchmarks.rolling7, 7);
  benchmark(v.benchmarks.rolling3, 3);
  if (v.benchmarks.fixed.available) {
    if (!x.available) fail("benchmark_current");
    near(v.benchmarks.fixed.rateMesosPerNx, v.benchmarks.fixed.baseRate * x.index / 100);
  }
  for (const key of ["rolling7", "rolling3"]) {
    const b = v.benchmarks[key];
    if (b.currentCapturedAt !== (v.sources.prices?.capturedAt ?? null) || b.windowEndExclusive !== (v.sources.overview?.sourceGeneratedAt.slice(0, 10) ?? null)) fail("benchmark_clock");
    if (b.available) {
      if (!x.available || b.meanLinkedDailyMpi <= 0) fail("benchmark_current");
      near(b.rateMesosPerNx, b.cashAnchorRate * x.index / b.meanLinkedDailyMpi);
      if (Date.parse(b.windowEndExclusive + "T00:00:00Z") - Date.parse(b.windowStart + "T00:00:00Z") !== b.dayCount * 864e5) fail("benchmark_days");
      let sumMpi = 0, cashTotal = 0, cashCount = 0;
      for (let i = 0; i < b.dayCount; i++) {
        const targetDay = new Date(Date.parse(b.windowStart + "T00:00:00Z") + i * 864e5).toISOString().slice(0, 10), h = v.daily.history.find((r) => r.day === targetDay);
        if (!h || h.status !== "available" || h.index === null || h.index <= 0 || h.observedWeight < 0.8 || h.partialCalendarDay || h.cashItems < 3 || h.nxRate === null || h.nxRate <= 0 || h.cashRecordedSalesCount < 15) fail("anchor_day_evidence");
        sumMpi += h.index;
        cashTotal += h.nxRate * h.cashRecordedSalesCount;
        cashCount += h.cashRecordedSalesCount;
        if (!Number.isSafeInteger(cashCount) || !Number.isFinite(cashTotal) || cashTotal > Number.MAX_SAFE_INTEGER) fail("anchor_count_bound");
      }
      near(b.meanLinkedDailyMpi, sumMpi / b.dayCount);
      near(b.cashAnchorRate, cashTotal / cashCount);
    }
  }
  shape(v.limitations, ["qualityConstant", "countsAreVerifiedTradeUnits", "exactWindowBoundsKnown", "sourceCashFlagIsEconomicClassification", "linkedHistoryReplacesLegacyHistory"]);
  if (Object.values(v.limitations).some((x2) => x2 !== false)) fail("limitations");
  return v;
}
function validateItemHistory(h, v, expectedCashRows) {
  shape(h, ["schemaVersion", "basis", "windowDays", "startDayInclusive", "endDayInclusive", "columns", "contexts", "rows"]);
  if (h.schemaVersion !== 1 || h.basis !== "actual_api_overview_daily_medians_not_3day_snapshots" || h.windowDays !== 31 || JSON.stringify(h.columns) !== JSON.stringify(ITEM_HISTORY_COLUMNS) || !Array.isArray(h.contexts) || h.contexts.length > 2449 || !Array.isArray(h.rows) || h.rows.length !== 79) fail("item_history");
  if (h.endDayInclusive !== v.daily.latestDay) fail("item_history_end");
  if (h.startDayInclusive === null || h.endDayInclusive === null) {
    if (h.startDayInclusive !== null || h.endDayInclusive !== null || h.contexts.length) fail("empty_history_window");
  } else {
    day(h.startDayInclusive);
    day(h.endDayInclusive);
    if (Date.parse(h.endDayInclusive + "T00:00:00Z") - Date.parse(h.startDayInclusive + "T00:00:00Z") !== 30 * 864e5) fail("item_history_window");
  }
  const contexts = /* @__PURE__ */ new Map();
  for (const r of h.contexts) {
    shape(r, ["contextId", "captureHash", "operation", "sourceUrl", "rawBodySha256", "capturedAt", "sourceObservedAt", "captureTimeKind", "sourceGeneratedAt"]);
    if (typeof r.contextId !== "string" || !/^c\d{1,4}$/.test(r.contextId) || contexts.has(r.contextId)) fail("history_context_id");
    hash(r.captureHash);
    const { contextId, captureHash, ...s } = r;
    source(s, "overview");
    contexts.set(contextId, r);
  }
  const ids = /* @__PURE__ */ new Set(), used = /* @__PURE__ */ new Set(), cashDaily = /* @__PURE__ */ new Map();
  let points = 0, goods = 0, cash = 0;
  for (const r of h.rows) {
    shape(r, ["itemId", "slug", "name", "role", "fixedNxCost", "points"]);
    count(r.itemId, 999999999);
    if (!r.itemId || ids.has(r.itemId)) fail("history_identity");
    ids.add(r.itemId);
    str(r.slug, 200);
    str(r.name);
    if (r.role === "goods") {
      goods++;
      if (r.fixedNxCost !== null || !v.current.rows.some((x) => x.itemId === r.itemId && x.slug === r.slug && x.name === r.name)) fail("goods_history_binding");
    } else if (r.role === "cash") {
      cash++;
      n(r.fixedNxCost, Number.MIN_VALUE);
      if (expectedCashRows !== void 0) {
        if (!Array.isArray(expectedCashRows) || expectedCashRows.length !== 29) fail("expected_cash_rows");
        const target = expectedCashRows.find((x) => x.itemId === r.itemId);
        if (!target || ["slug", "name", "fixedNxCost"].some((k) => target[k] !== r[k])) fail("static_cash_binding");
      }
    } else fail("history_role");
    if (!Array.isArray(r.points) || r.points.length > 31) fail("history_point_bound");
    let prior = "";
    for (const p of r.points) {
      if (!Array.isArray(p) || p.length !== 8) fail("history_tuple");
      day(p[0]);
      if (p[0] <= prior || p[0] < h.startDayInclusive || p[0] > h.endDayInclusive) fail("history_point_day");
      prior = p[0];
      price(p[1]);
      count(p[2]);
      count(p[3]);
      if (p[4] !== Boolean(p[1] !== null && Number(p[1]) > 0 && p[2] >= 5) || typeof p[5] !== "boolean") fail("history_qualification");
      const ctx = contexts.get(p[6]);
      if (!ctx || p[5] !== p[0] >= ctx.sourceGeneratedAt.slice(0, 10)) fail("history_context");
      used.add(p[6]);
      nullableNumber(p[7]);
      if (r.role === "cash" && p[7] !== null || r.role === "goods" && p[4] !== (p[7] !== null)) fail("history_linked");
      if (r.role === "goods" && p[7] !== null) {
        const target = v.current.rows.find((x) => x.itemId === r.itemId);
        near(p[7], target.legacyLinkPrice * Number(p[1]) / Number(target.APIlinkPrice));
      }
      if (r.role === "cash" && p[4] && !p[5]) {
        const c = cashDaily.get(p[0]) ?? { items: 0, count: 0, total: 0 };
        c.items++;
        c.count += p[2];
        c.total += Number(p[1]) / r.fixedNxCost * p[2];
        if (!Number.isSafeInteger(c.count) || !Number.isFinite(c.total) || c.total > Number.MAX_SAFE_INTEGER) fail("cash_count_bound");
        cashDaily.set(p[0], c);
      }
      points++;
    }
  }
  if (goods !== 50 || cash !== 29 || points > 2449 || used.size !== contexts.size) fail("item_history_coverage");
  return cashDaily;
}
function unpackApiDailyItemHistory(snapshot) {
  validateApiIndexSnapshot(snapshot);
  const h = snapshot.daily.itemHistory, contexts = new Map(h.contexts.map((c) => [c.contextId, c]));
  return h.rows.map((r) => ({ ...r, points: r.points.map((p) => ({ ...Object.fromEntries(ITEM_HISTORY_COLUMNS.map((k, i) => [k, p[i]])), source: contexts.get(p[6]) })) }));
}
function parsePublicJson(raw) {
  if (typeof raw === "string") raw = new TextEncoder().encode(raw);
  if (!(raw instanceof Uint8Array) || raw.length < 1 || raw.length > MAX_PUBLIC_BYTES) fail("body_bound");
  let s;
  try {
    s = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    fail("utf8");
  }
  let p = 0, tokens = 0;
  const ws = () => {
    while (/[\x20\t\r\n]/.test(s[p] ?? "x")) p++;
  };
  function value(depth) {
    if (depth > 32 || ++tokens > 1e5) fail("complexity");
    ws();
    if (s[p] === '"') {
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
            fail("string");
          }
        }
      }
      fail("string");
    }
    if (s[p] === "{") {
      p++;
      ws();
      const o = /* @__PURE__ */ Object.create(null);
      if (s[p] === "}") {
        p++;
        return o;
      }
      while (true) {
        ws();
        if (s[p] !== '"') fail("key");
        const k = value(depth + 1);
        if (Object.hasOwn(o, k)) fail("duplicate_key");
        ws();
        if (s[p++] !== ":") fail("colon");
        o[k] = value(depth + 1);
        ws();
        if (s[p] === "}") {
          p++;
          return o;
        }
        if (s[p++] !== ",") fail("separator");
      }
    }
    if (s[p] === "[") {
      p++;
      ws();
      const out = [];
      if (s[p] === "]") {
        p++;
        return out;
      }
      while (true) {
        out.push(value(depth + 1));
        ws();
        if (s[p] === "]") {
          p++;
          return out;
        }
        if (s[p++] !== ",") fail("separator");
      }
    }
    for (const [word, v] of [["true", true], ["false", false], ["null", null]]) if (s.startsWith(word, p)) {
      p += word.length;
      return v;
    }
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(p));
    if (!m) fail("value");
    p += m[0].length;
    const n2 = Number(m[0]);
    if (!Number.isFinite(n2) || Math.abs(n2) > Number.MAX_SAFE_INTEGER) fail("numeric_bound");
    return n2;
  }
  const result = value(0);
  ws();
  if (p !== s.length) fail("trailing");
  return result;
}
async function parseApiIndexSnapshot(raw, options = {}) {
  const v = parsePublicJson(raw);
  validateApiIndexSnapshot(v, options);
  const { snapshotHash, ...body } = v;
  if (await portableHash(body) !== snapshotHash) fail("snapshot_hash");
  return v;
}

// ops/api-index-definition-data-v1.json
var api_index_definition_data_v1_default = {
  schemaVersion: 1,
  methodVersion: "api-v2-chainlink-20261104-v1",
  linkDay: "2026-11-04",
  basketHash: "46c0c5fd9add028b0d24c9f61b8e41d8d3ed78ae76ab8ff14ebeecd7c46f4d19",
  legacySourceUpdatedAt: "2026-11-04T08:30:56+00:00",
  legacyReportSha256: "61846f6176e268f66dea918a7436b8de187eb946928293e0a5f0716cb6f8c10e",
  anchorOverviewRawSha256: "40c33a982482a860fb1a941f5fe9d6cb4f4cd44faf1deaadb09f730a4451fbff",
  anchorOverviewCapturedAt: "2026-11-05T21:43:47.968Z",
  anchorOverviewGeneratedAt: "2026-11-05T21:32:16+00:00",
  fixedNxBaseRate: 12.370116697783677,
  goods: [
    {
      slug: "gloves-attack-scroll-intermediate",
      name: "Gloves Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.08,
      basePrice: 793345.2130977131,
      itemId: 2040801,
      legacyLinkPrice: 1999999,
      APIlinkPrice: "1999999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 87,
      APIlinkReportedUnitCount: 94
    },
    {
      slug: "gloves-magic-attack-scroll-intermediate",
      name: "Gloves Magic Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.06691572540929447,
      basePrice: 209027.93516042782,
      itemId: 2040805,
      legacyLinkPrice: 274999.5,
      APIlinkPrice: "450000.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 135,
      APIlinkReportedUnitCount: 164
    },
    {
      slug: "kumbi-throwing-stars",
      name: "Kumbi Throwing Stars",
      category: "Weapons",
      weight: 0.054820882383706054,
      basePrice: 359305.79803646565,
      itemId: 2070003,
      legacyLinkPrice: 699999,
      APIlinkPrice: "749999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "set",
      APIlinkRecordedSalesCount: 100,
      APIlinkReportedUnitCount: 100
    },
    {
      slug: "claw-attack-scroll-intermediate",
      name: "Claw Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.05198004146055375,
      basePrice: 197166.7362012987,
      itemId: 2044701,
      legacyLinkPrice: 499999,
      APIlinkPrice: "517499.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 130,
      APIlinkReportedUnitCount: 173
    },
    {
      slug: "earring-luk-scroll-intermediate",
      name: "Earring LUK Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.03968634942455667,
      basePrice: 82942.49329159212,
      itemId: 2040313,
      legacyLinkPrice: 149999,
      APIlinkPrice: "159000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 218,
      APIlinkReportedUnitCount: 343
    },
    {
      slug: "dagger-attack-scroll-intermediate",
      name: "Dagger Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.03651684217793313,
      basePrice: 180962.7783669141,
      itemId: 2043301,
      legacyLinkPrice: 398944,
      APIlinkPrice: "424999.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 98,
      APIlinkReportedUnitCount: 122
    },
    {
      slug: "earring-int-scroll-intermediate",
      name: "Earring INT Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.03192979380414028,
      basePrice: 68258.02058554438,
      itemId: 2040309,
      legacyLinkPrice: 109999,
      APIlinkPrice: "120000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 247,
      APIlinkReportedUnitCount: 346
    },
    {
      slug: "earring-str-scroll-intermediate",
      name: "Earring STR Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.031452213539328006,
      basePrice: 64211.550458715596,
      itemId: 2040301,
      legacyLinkPrice: 94999,
      APIlinkPrice: "100000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 226,
      APIlinkReportedUnitCount: 347
    },
    {
      slug: "earring-dex-scroll-intermediate",
      name: "Earring DEX Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.028372106571338162,
      basePrice: 67888.63440860216,
      itemId: 2040305,
      legacyLinkPrice: 99999,
      APIlinkPrice: "109999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 191,
      APIlinkReportedUnitCount: 289
    },
    {
      slug: "pan-lid",
      name: "Pan Lid",
      category: "Equipment",
      weight: 0.028153419245381568,
      basePrice: 65782.2745,
      itemId: 1092002,
      legacyLinkPrice: 84999,
      APIlinkPrice: "89999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 257,
      APIlinkReportedUnitCount: 257
    },
    {
      slug: "pet-equip-speed-scroll-intermediate",
      name: "Pet Equip Speed Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.02535094576615993,
      basePrice: 68756.95298897273,
      itemId: 2048001,
      legacyLinkPrice: 105e3,
      APIlinkPrice: "119999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 183,
      APIlinkReportedUnitCount: 246
    },
    {
      slug: "wand-magic-attack-scroll-intermediate",
      name: "Wand Magic Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.024380796562818854,
      basePrice: 164883.64399421128,
      itemId: 2043701,
      legacyLinkPrice: 194999,
      APIlinkPrice: "350000.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 43,
      APIlinkReportedUnitCount: 53
    },
    {
      slug: "mokbi-throwing-stars",
      name: "Mokbi Throwing Stars",
      category: "Weapons",
      weight: 0.023837763573419157,
      basePrice: 139246.16875,
      itemId: 2070002,
      legacyLinkPrice: 199999,
      APIlinkPrice: "220000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "set",
      APIlinkRecordedSalesCount: 159,
      APIlinkReportedUnitCount: 159
    },
    {
      slug: "fairy-wand",
      name: "Fairy Wand",
      category: "Weapons",
      weight: 0.02314954669195535,
      basePrice: 130969.50242130751,
      itemId: 1372006,
      legacyLinkPrice: 99999,
      APIlinkPrice: "99999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 207,
      APIlinkReportedUnitCount: 207
    },
    {
      slug: "hat-accuracy-scroll-intermediate",
      name: "Hat Accuracy Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.02304957276895981,
      basePrice: 26955.35985985986,
      itemId: 2040001,
      legacyLinkPrice: 42250,
      APIlinkPrice: "49999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 249,
      APIlinkReportedUnitCount: 381
    },
    {
      slug: "bow-attack-scroll-intermediate",
      name: "Bow Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.021997086435197048,
      basePrice: 122667.31980906922,
      itemId: 2044501,
      legacyLinkPrice: 219900,
      APIlinkPrice: "249999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 79,
      APIlinkReportedUnitCount: 96
    },
    {
      slug: "emerald-earrings",
      name: "Emerald Earrings",
      category: "Equipment",
      weight: 0.020160185781952222,
      basePrice: 17682.27120870871,
      itemId: 1032007,
      legacyLinkPrice: 19999,
      APIlinkPrice: "21000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 922,
      APIlinkReportedUnitCount: 922
    },
    {
      slug: "mystery-palette-exchange-coupon",
      name: "Mystery Palette Exchange Coupon",
      category: "Consumables",
      weight: 0.020057961546398818,
      basePrice: 94968.01823708207,
      itemId: 2430045,
      legacyLinkPrice: 124999,
      APIlinkPrice: "145555.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 215,
      APIlinkReportedUnitCount: 215
    },
    {
      slug: "wooden-top",
      name: "Wooden Top",
      category: "Weapons",
      weight: 0.019739007559943917,
      basePrice: 139762.00151515153,
      itemId: 2070009,
      legacyLinkPrice: 2e5,
      APIlinkPrice: "222222.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "set",
      APIlinkRecordedSalesCount: 89,
      APIlinkReportedUnitCount: 89
    },
    {
      slug: "arwens-glass-shoe",
      name: "Arwen's Glass Shoe",
      category: "Materials",
      weight: 0.01676352450466836,
      basePrice: 63124.984689766316,
      itemId: 4001e3,
      legacyLinkPrice: 55e3,
      APIlinkPrice: "59999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 192,
      APIlinkReportedUnitCount: 281
    },
    {
      slug: "spear-attack-scroll-intermediate",
      name: "Spear Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.016682375015431166,
      basePrice: 79226.5081300813,
      itemId: 2044301,
      legacyLinkPrice: 15e4,
      APIlinkPrice: "175000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 98,
      APIlinkReportedUnitCount: 138
    },
    {
      slug: "steel-avarice",
      name: "Steel Avarice",
      category: "Weapons",
      weight: 0.01609047925786032,
      basePrice: 81289.59891891891,
      itemId: 1472014,
      legacyLinkPrice: 74999,
      APIlinkPrice: "75000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 258,
      APIlinkReportedUnitCount: 258
    },
    {
      slug: "polearm-attack-scroll-intermediate",
      name: "Polearm Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.01543925793426703,
      basePrice: 105791.25806451614,
      itemId: 2044401,
      legacyLinkPrice: 199999,
      APIlinkPrice: "221110.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 56,
      APIlinkReportedUnitCount: 73
    },
    {
      slug: "korean-fan",
      name: "Korean Fan",
      category: "Weapons",
      weight: 0.0154342409527228,
      basePrice: 87214.2599758162,
      itemId: 1332013,
      legacyLinkPrice: 73499,
      APIlinkPrice: "80000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 181,
      APIlinkReportedUnitCount: 181
    },
    {
      slug: "crossbow-attack-scroll-intermediate",
      name: "Crossbow Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.014799732629452285,
      basePrice: 77361.35794183445,
      itemId: 2044601,
      legacyLinkPrice: 111111,
      APIlinkPrice: "129000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 103,
      APIlinkReportedUnitCount: 120
    },
    {
      slug: "two-handed-sword-attack-scroll-intermediate",
      name: "Two-handed Sword Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.014682157222134326,
      basePrice: 73538.70203644158,
      itemId: 2044001,
      legacyLinkPrice: 66666,
      APIlinkPrice: "119999.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 92,
      APIlinkReportedUnitCount: 123
    },
    {
      slug: "overall-armor-luk-scroll-greater",
      name: "Overall Armor LUK Scroll: Greater",
      category: "Scrolls",
      weight: 0.01385317040801408,
      basePrice: 16224.97418546366,
      itemId: 2040518,
      legacyLinkPrice: 16699,
      APIlinkPrice: "28000.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 447,
      APIlinkReportedUnitCount: 840
    },
    {
      slug: "gloves-crit-rate-scroll-chaos",
      name: "Gloves Crit. Rate Scroll: Chaos",
      category: "Scrolls",
      weight: 0.013508384262844106,
      basePrice: 67950.93326157158,
      itemId: 2040815,
      legacyLinkPrice: 99999,
      APIlinkPrice: "109943.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 146,
      APIlinkReportedUnitCount: 171
    },
    {
      slug: "blue-sauna-robe",
      name: "Blue Sauna Robe",
      category: "Equipment",
      weight: 0.01316618546354111,
      basePrice: 22537.46446886447,
      itemId: 1050010,
      legacyLinkPrice: 35e3,
      APIlinkPrice: "40000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 514,
      APIlinkReportedUnitCount: 514
    },
    {
      slug: "dark-pilfer",
      name: "Dark Pilfer",
      category: "Equipment",
      weight: 0.012438030455931476,
      basePrice: 44988.01547987616,
      itemId: 1002156,
      legacyLinkPrice: 45e3,
      APIlinkPrice: "48994.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 234,
      APIlinkReportedUnitCount: 234
    },
    {
      slug: "overall-armor-int-scroll-greater",
      name: "Overall Armor INT Scroll: Greater",
      category: "Scrolls",
      weight: 0.012355824501013586,
      basePrice: 15434.471264367816,
      itemId: 2040514,
      legacyLinkPrice: 15749,
      APIlinkPrice: "25999.5",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 396,
      APIlinkReportedUnitCount: 795
    },
    {
      slug: "silver-guardian",
      name: "Silver Guardian",
      category: "Weapons",
      weight: 0.012173298388246729,
      basePrice: 60777.125,
      itemId: 1472012,
      legacyLinkPrice: 64999,
      APIlinkPrice: "65000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 98,
      APIlinkReportedUnitCount: 98
    },
    {
      slug: "black-napoleon",
      name: "Black Napoleon",
      category: "Equipment",
      weight: 0.011660237824523835,
      basePrice: 86905.5677830941,
      itemId: 1102008,
      legacyLinkPrice: 8e4,
      APIlinkPrice: "99999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 134,
      APIlinkReportedUnitCount: 134
    },
    {
      slug: "dark-shadow-pants",
      name: "Dark Shadow Pants",
      category: "Equipment",
      weight: 0.011212101645553316,
      basePrice: 75606.91630591631,
      itemId: 1060059,
      legacyLinkPrice: 94999,
      APIlinkPrice: "99999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 106,
      APIlinkReportedUnitCount: 106
    },
    {
      slug: "pet-equip-speed-scroll-lesser",
      name: "Pet Equip Speed Scroll: Lesser",
      category: "Scrolls",
      weight: 0.010979267908168876,
      basePrice: 20984.675255623722,
      itemId: 2048e3,
      legacyLinkPrice: 39999.5,
      APIlinkPrice: "48999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 174,
      APIlinkReportedUnitCount: 304
    },
    {
      slug: "two-handed-axe-attack-scroll-intermediate",
      name: "Two-handed Axe Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.010956393938955509,
      basePrice: 59054.94579008074,
      itemId: 2044101,
      legacyLinkPrice: 66e3,
      APIlinkPrice: "99999.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 72,
      APIlinkReportedUnitCount: 101
    },
    {
      slug: "overall-armor-str-scroll-greater",
      name: "Overall Armor STR Scroll: Greater",
      category: "Scrolls",
      weight: 0.010793196418979549,
      basePrice: 14760.899912203688,
      itemId: 2040506,
      legacyLinkPrice: 12999,
      APIlinkPrice: "19999.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 430,
      APIlinkReportedUnitCount: 778
    },
    {
      slug: "staff-magic-attack-scroll-intermediate",
      name: "Staff Magic Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.010499296953750627,
      basePrice: 67211.73287671233,
      itemId: 2043801,
      legacyLinkPrice: 12e4,
      APIlinkPrice: "148998.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 77,
      APIlinkReportedUnitCount: 101
    },
    {
      slug: "fairy-wing",
      name: "Fairy Wing",
      category: "Materials",
      weight: 0.009877438400026098,
      basePrice: 78234.81355932204,
      itemId: 4003005,
      legacyLinkPrice: 59999,
      APIlinkPrice: "63000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 57,
      APIlinkReportedUnitCount: 94
    },
    {
      slug: "shoes-speed-scroll-intermediate",
      name: "Shoes Speed Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.00969660344550808,
      basePrice: 69499.19478527608,
      itemId: 2040705,
      legacyLinkPrice: 133e3,
      APIlinkPrice: "140000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 75,
      APIlinkReportedUnitCount: 87
    },
    {
      slug: "blue-starlight",
      name: "Blue Starlight",
      category: "Equipment",
      weight: 0.00925136532501713,
      basePrice: 45128.20459290188,
      itemId: 1050025,
      legacyLinkPrice: 43333,
      APIlinkPrice: "45000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 236,
      APIlinkReportedUnitCount: 236
    },
    {
      slug: "overall-armor-dex-scroll-greater",
      name: "Overall Armor DEX Scroll: Greater",
      category: "Scrolls",
      weight: 0.009070538930075218,
      basePrice: 13920.458128078817,
      itemId: 2040510,
      legacyLinkPrice: 12260.5,
      APIlinkPrice: "20000.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 457,
      APIlinkReportedUnitCount: 1093
    },
    {
      slug: "dark-cleave",
      name: "Dark Cleave",
      category: "Equipment",
      weight: 0.008840051800479818,
      basePrice: 58513.737960339946,
      itemId: 1082063,
      legacyLinkPrice: 44e3,
      APIlinkPrice: "44000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 253,
      APIlinkReportedUnitCount: 253
    },
    {
      slug: "dark-crusader-chainmail",
      name: "Dark Crusader Chainmail",
      category: "Equipment",
      weight: 0.008129637584293702,
      basePrice: 60494.97133757962,
      itemId: 1050017,
      legacyLinkPrice: 44444,
      APIlinkPrice: "43499.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 134,
      APIlinkReportedUnitCount: 134
    },
    {
      slug: "squishy-shoes",
      name: "Squishy Shoes",
      category: "Equipment",
      weight: 0.007045269397414632,
      basePrice: 8936.875678610206,
      itemId: 1072128,
      legacyLinkPrice: 15e3,
      APIlinkPrice: "19999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 285,
      APIlinkReportedUnitCount: 285
    },
    {
      slug: "two-handed-blunt-weapon-attack-scroll-intermediate",
      name: "Two-handed Blunt Weapon Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.006921985822782007,
      basePrice: 34157.68743400211,
      itemId: 2044201,
      legacyLinkPrice: 3e4,
      APIlinkPrice: "58444.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 92,
      APIlinkReportedUnitCount: 120
    },
    {
      slug: "cape-str-scroll-lesser",
      name: "Cape STR Scroll: Lesser",
      category: "Scrolls",
      weight: 0.006801201430382483,
      basePrice: 29239.08831646734,
      itemId: 2041008,
      legacyLinkPrice: 69999,
      APIlinkPrice: "79500.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 92,
      APIlinkReportedUnitCount: 154
    },
    {
      slug: "hat-accuracy-scroll-lesser",
      name: "Hat Accuracy Scroll: Lesser",
      category: "Scrolls",
      weight: 0.006782054086615597,
      basePrice: 8635.806811989101,
      itemId: 204e4,
      legacyLinkPrice: 14499,
      APIlinkPrice: "15000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 224,
      APIlinkReportedUnitCount: 517
    },
    {
      slug: "pet-equip-jump-scroll-intermediate",
      name: "Pet Equip Jump Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.006279787790328642,
      basePrice: 17572.60838323353,
      itemId: 2048005,
      legacyLinkPrice: 17e3,
      APIlinkPrice: "19999.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 230,
      APIlinkReportedUnitCount: 313
    },
    {
      slug: "wizard-wand",
      name: "Wizard Wand",
      category: "Weapons",
      weight: 0.0062666695979803405,
      basePrice: 20280.43836565097,
      itemId: 1372005,
      legacyLinkPrice: 24555,
      APIlinkPrice: "24471.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 340,
      APIlinkReportedUnitCount: 340
    }
  ],
  cash: [
    {
      itemId: 1802e3,
      name: "Red Ribbon",
      slug: "red-ribbon",
      fixedNxCost: 3200,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 1802001,
      name: "Yellow Hat",
      slug: "yellow-hat",
      fixedNxCost: 3200,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 1802002,
      name: "Red Hat",
      slug: "red-hat",
      fixedNxCost: 3200,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 1802003,
      name: "Black Hat",
      slug: "black-hat",
      fixedNxCost: 3200,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 1802007,
      name: "Red Top Hat",
      slug: "red-top-hat",
      fixedNxCost: 3200,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5e6,
      name: "Brown Kitty",
      slug: "brown-kitty",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5000001,
      name: "Brown Puppy",
      slug: "brown-puppy",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5000002,
      name: "Pink Bunny",
      slug: "pink-bunny",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5000004,
      name: "Black Kitty",
      slug: "black-kitty",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5000005,
      name: "White Bunny",
      slug: "white-bunny",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5000007,
      name: "Black Pig",
      slug: "black-pig",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5050100,
      name: "AP Reset Scroll",
      slug: "ap-reset-scroll",
      fixedNxCost: 7e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5051001,
      name: "SP Reset Scroll",
      slug: "sp-reset-scroll",
      fixedNxCost: 7e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 515e4,
      name: "Mystery Hair Coupon",
      slug: "mystery-hair-coupon",
      fixedNxCost: 5500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5150100,
      name: "Signature Hair Coupon",
      slug: "signature-hair-coupon",
      fixedNxCost: 7500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5151e3,
      name: "Mystery Hair Color Coupon",
      slug: "mystery-hair-color-coupon",
      fixedNxCost: 1700,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5151100,
      name: "Signature Hair Color Coupon",
      slug: "signature-hair-color-coupon",
      fixedNxCost: 4500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5152e3,
      name: "Mystery Face Coupon",
      slug: "mystery-face-coupon",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5152100,
      name: "Signature Eye Color Coupon",
      slug: "signature-eye-color-coupon",
      fixedNxCost: 2500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5152200,
      name: "Signature Face Coupon",
      slug: "signature-face-coupon",
      fixedNxCost: 5500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5153e3,
      name: "Signature Skin Color Coupon",
      slug: "signature-skin-color-coupon",
      fixedNxCost: 2e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 517e4,
      name: "Pet Name Tag",
      slug: "pet-name-tag",
      fixedNxCost: 1800,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 518e4,
      name: "Water of Life",
      slug: "water-of-life",
      fixedNxCost: 2e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 519e4,
      name: "Auto HP Potion Skill",
      slug: "auto-hp-potion-skill",
      fixedNxCost: 2500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5190001,
      name: "Auto MP Potion Skill",
      slug: "auto-mp-potion-skill",
      fixedNxCost: 2500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5190002,
      name: "Auto Move Skill",
      slug: "auto-move-skill",
      fixedNxCost: 3e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5190003,
      name: "Expanded Auto Move Skill",
      slug: "expanded-auto-move-skill",
      fixedNxCost: 3e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 568e4,
      name: "Storage Room 5-slot Coupon",
      slug: "storage-room-5-slot-coupon",
      fixedNxCost: 5e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5680001,
      name: "Selective 5-slot Coupon",
      slug: "selective-5-slot-coupon",
      fixedNxCost: 5e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    }
  ]
};

// ui-src/api-calculations/view-model.mjs
var positive = (n2) => typeof n2 === "number" && Number.isFinite(n2) && n2 > 0;
var hash2 = (s) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
var clock2 = (s) => typeof s === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) && new Date(s).toISOString() === s;
var need = (v) => {
  if (!v) throw Error("invalid_calculation_view_binding");
};
var freeze = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
var DEPENDENCIES = Object.freeze(["headline", "calculator", "mpi", "category-dials", "basket-prices", "index-contributions", "methodology", "comparison", "source-clocks"]);
function calculationHeadline(snapshot, { mode = "rolling", windowDays = 7 } = {}) {
  need(snapshot?.kind === "api_linked_market_calculations" && hash2(snapshot.snapshotHash) && hash2(snapshot.definitionHash));
  need(["rolling", "fixed", "compare"].includes(mode) && [3, 7].includes(windowDays));
  const current = snapshot.current, fixedHeadline = mode !== "rolling", model = fixedHeadline ? snapshot.benchmarks.fixed : snapshot.benchmarks["rolling" + windowDays];
  need(model && typeof model.available === "boolean" && ["available", "unavailable"].includes(model.status) && model.available === (model.status === "available"));
  const available2 = current.available === true && model.available && positive(current.index) && positive(model.rateMesosPerNx);
  const change = available2 ? fixedHeadline ? current.index - 100 : positive(model.meanLinkedDailyMpi) ? 100 * (current.index / model.meanLinkedDailyMpi - 1) : null : null;
  return freeze({
    available: available2,
    rate: available2 ? model.rateMesosPerNx : null,
    currentMpi: current.available ? current.index : null,
    at: snapshot.sources.prices?.capturedAt ?? null,
    sourceObservedAt: null,
    observed: false,
    qualityConstant: false,
    mode,
    requestedMode: mode,
    windowDays: mode === "fixed" ? null : windowDays,
    sourceKind: "api_reported_3day_sale_median_reference",
    cashAnchor: model.cashAnchorRate ?? null,
    meanMpi: model.meanLinkedDailyMpi ?? null,
    startDay: model.windowStart ?? null,
    endExclusive: model.windowEndExclusive ?? null,
    missingDays: [...model.missingDays || []],
    changePercent: change,
    label: fixedHeadline ? "Fixed-anchor goods NX model \xB7 API 3-day reference" : `Latest 3-day sale-median reference \xB7 ${windowDays}-day anchor`,
    changeLabel: fixedHeadline ? "vs frozen reference period" : `vs previous ${windowDays} source-calendar days`,
    reason: available2 ? null : current.available !== true ? "Current aggregate unavailable; all 50 same-capture item prices are required." : `The requested ${fixedHeadline ? "fixed" : windowDays + "-day"} anchor is unavailable.`,
    snapshotHash: snapshot.snapshotHash,
    definitionHash: snapshot.definitionHash
  });
}
function calculationView(legacy, snapshot, selection = {}) {
  need(legacy && Array.isArray(legacy.rows) && legacy.rows.length === 50);
  need(snapshot?.schemaVersion === 1 && snapshot.kind === "api_linked_market_calculations" && hash2(snapshot.definitionHash) && hash2(snapshot.snapshotHash));
  need(hash2(legacy.basketHash) && legacy.basketHash === snapshot.calibration.basketHash);
  need((snapshot.current.available !== true || clock2(snapshot.sources?.prices?.capturedAt) && snapshot.sources.prices.reportedDays === 3) && snapshot.sourceObservedAt === null);
  need(snapshot.current && Array.isArray(snapshot.current.rows) && Array.isArray(snapshot.current.categories));
  const original = new Map(legacy.rows.map((row) => [row.slug, row]));
  need(original.size === 50);
  const supplied = /* @__PURE__ */ new Map();
  for (const row of snapshot.current.rows) {
    need(original.has(row.slug) && !supplied.has(row.slug));
    const base = original.get(row.slug);
    need(row.category === base.category && row.weight === base.weight && row.basePrice === base.basePrice);
    supplied.set(row.slug, row);
  }
  if (snapshot.current.available) need(supplied.size === 50 && positive(snapshot.current.index));
  const rows = legacy.rows.map((base) => {
    const item = supplied.get(base.slug), rawPrice = item && typeof item.currentSaleMedianLexeme === "string" ? Number(item.currentSaleMedianLexeme) : null;
    return {
      ...structuredClone(base),
      price: positive(rawPrice) ? rawPrice : null,
      priceDay: null,
      priceTimeKind: "reported_3day_window_with_unknown_bounds",
      sourceUrl: item ? `https://maplestory.market/items/${item.itemId}?ref=v6kkdvp6` : null,
      currentApiReference: item ? { ...structuredClone(item), capturedAt: snapshot.sources.prices?.capturedAt ?? null, reportedDays: 3, sourceObservedAt: null } : null,
      changeBase: item?.changeBase ?? null,
      indexContribution: item?.indexContribution ?? null,
      changeContribution: item?.changeContribution ?? null,
      legacyEvidence: { price: base.price, priceDay: base.priceDay, sourceUrl: base.sourceUrl },
      history: base.history.map((point) => [...point])
    };
  });
  const headline = calculationHeadline(snapshot, selection);
  const categories = snapshot.current.categories.map((row) => ({
    name: row.category,
    index: row.index,
    weight: row.weight,
    count: row.expectedItems,
    availableItems: row.availableItems,
    observedWeight: row.observedWeight,
    changeBase: row.changeBase,
    capturedAt: snapshot.sources.prices?.capturedAt ?? null
  }));
  const latestDaily = snapshot.daily.history.at(-1) ?? null;
  return freeze({
    kind: "api_calculation_view",
    snapshotHash: snapshot.snapshotHash,
    definitionHash: snapshot.definitionHash,
    headline,
    index: snapshot.current.available ? snapshot.current.index : null,
    rows,
    categories,
    currentReference: {
      capturedAt: snapshot.sources.prices?.capturedAt ?? null,
      reportedDays: 3,
      exactStartAt: null,
      exactEndAt: null,
      sourceObservedAt: null,
      available: snapshot.current.available,
      availableItems: snapshot.current.availableItems,
      expectedItems: 50
    },
    daily: { ...structuredClone(snapshot.daily), latestDay: latestDaily?.day ?? null },
    clocks: {
      currentPrices: snapshot.sources.prices?.capturedAt ?? null,
      dailyCapture: snapshot.sources.overview?.capturedAt ?? null,
      dailyPublisher: snapshot.sources.overview?.sourceGeneratedAt ?? null,
      legacyDaily: legacy.sourceUpdatedAt,
      sourceObservedAt: null
    },
    legacyDailyHistory: structuredClone(legacy.history),
    calibration: structuredClone(snapshot.calibration),
    dependencies: [...DEPENDENCIES]
  });
}
function calculationItemEvidenceView(legacy, snapshot, { definitions, dailyItems, status: status2 = "current", reason = null } = {}) {
  need(definitions && Array.isArray(definitions.goods) && definitions.goods.length === 50 && Array.isArray(definitions.cash) && definitions.cash.length === 29);
  const bound = calculationView(legacy, snapshot), base = new Map(legacy.rows.map((r) => [r.slug, r])), targets = new Map([...definitions.goods.map((r) => ({ ...r, role: "goods" })), ...definitions.cash.map((r) => ({ ...r, role: "cash" }))].map((r) => [r.itemId, r]));
  need(targets.size === 79 && snapshot.current.rows.length === 50 && Array.isArray(dailyItems) && dailyItems.length === 79 && new Set(dailyItems.map((r) => r.itemId)).size === 79);
  for (const expected of definitions.goods) {
    const row = snapshot.current.rows.find((r) => r.itemId === expected.itemId), old = base.get(expected.slug);
    need(row && old && row.slug === expected.slug && row.name === expected.name && old.name === expected.name && (old.canonicalId === void 0 || old.canonicalId === null || old.canonicalId === expected.itemId));
  }
  for (const row of dailyItems) {
    const expected = targets.get(row.itemId);
    need(expected && row.slug === expected.slug && row.name === expected.name && row.role === expected.role && (row.role !== "cash" || row.fixedNxCost === expected.fixedNxCost));
  }
  need(["current", "retained"].includes(status2));
  return freeze({
    kind: "api_item_evidence_view",
    snapshotHash: snapshot.snapshotHash,
    definitionHash: snapshot.definitionHash,
    basketHash: snapshot.calibration.basketHash,
    status: status2,
    reason,
    rows: bound.rows.map((row) => ({ ...row, indexContribution: null, changeContribution: null })),
    dailyItems: structuredClone(dailyItems),
    clocks: structuredClone(bound.clocks),
    currentReference: { ...bound.currentReference },
    sourceObservedAt: null,
    qualifiedIndividualTrades: 0,
    aggregateSelectionSeparate: true
  });
}
function createCalculationSelection() {
  let good = null, evidence = null, latestCheck = null, status2 = "unavailable", evidenceStatus = "unavailable", evidenceReason = null;
  return Object.freeze({
    accept(validatedSnapshot, { checkedAt, readerMode = "accepted_cache" } = {}) {
      need(clock2(checkedAt) && ["accepted_cache", "retained_last_good"].includes(readerMode));
      latestCheck = checkedAt;
      if (good) need(validatedSnapshot.definitionHash === good.definitionHash);
      if (evidence) need(validatedSnapshot.definitionHash === evidence.definitionHash);
      if (evidence && ["prices", "overview"].some((k) => evidence.sources[k] && (!validatedSnapshot.sources[k] || validatedSnapshot.sources[k].capturedAt < evidence.sources[k].capturedAt))) {
        status2 = good ? "retained" : "unavailable";
        evidenceStatus = "retained";
        evidenceReason = "source_pair_rollback";
        return false;
      }
      if (evidence?.snapshotHash !== validatedSnapshot.snapshotHash) evidence = freeze(structuredClone(validatedSnapshot));
      evidenceStatus = readerMode === "retained_last_good" ? "retained" : "current";
      evidenceReason = readerMode === "retained_last_good" ? "route_retained_last_good" : null;
      if (validatedSnapshot.current.available !== true) {
        status2 = good ? "retained" : "unavailable";
        return false;
      }
      if (good) {
        const before = good.sources, after = validatedSnapshot.sources;
        if (after.prices.capturedAt < before.prices.capturedAt || before.overview?.capturedAt && (after.overview?.capturedAt ?? "") < before.overview.capturedAt) {
          status2 = "retained";
          return false;
        }
      }
      if (good?.snapshotHash === validatedSnapshot.snapshotHash) {
        status2 = "current";
        return false;
      }
      good = freeze(structuredClone(validatedSnapshot));
      status2 = "current";
      return true;
    },
    failed({ checkedAt, reason = "own_reader_failed" } = {}) {
      need(clock2(checkedAt));
      latestCheck = checkedAt;
      status2 = good ? "retained" : "unavailable";
      evidenceStatus = evidence ? "retained" : "unavailable";
      evidenceReason = reason;
    },
    state() {
      return { snapshot: good, evidenceSnapshot: evidence, checkedAt: latestCheck, status: status2, evidenceStatus, evidenceReason, marketSourceAt: good?.sources.prices.capturedAt ?? null };
    }
  });
}

// ui-src/api-calculations/client.mjs
var ROUTE = "/api-market-calculations.json";
var MAX_BYTES = 6e5;
var allowed = /* @__PURE__ */ new Set(["https://inflation.gg", "https://inflation-watch-astra.dizzyvinci.workers.dev", "http://127.0.0.1:8765"]);
var sha = async (raw) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].map((x) => x.toString(16).padStart(2, "0")).join("");
var need2 = (v, c) => {
  if (!v) throw Error(c);
};
var iso = (t) => new Date(t).toISOString();
function createApiCalculationClient({ origin, parse, expectedDefinitionHash, fetcher = fetch, now = () => Date.now(), timeoutMs = 8e3, onChange = () => {
}, onAccessDenied = () => {
} }) {
  need2(allowed.has(origin) && typeof parse === "function" && /^[a-f0-9]{64}$/.test(expectedDefinitionHash), "invalid_own_reader_configuration");
  need2(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 8e3, "invalid_own_reader_deadline");
  const selection = createCalculationSelection();
  let flight = null, etag = null, nextCheck = 0, failures = 0, blocked = false, readerMode = null, evidenceReaderMode = null, reason = null;
  const state = () => ({ ...selection.state(), readerMode, evidenceReaderMode, reason, blocked, nextCheckAt: nextCheck });
  function context(response, snapshot) {
    need2(response.headers.get("X-Astra-Calculations-Definition-Hash") === expectedDefinitionHash && snapshot.definitionHash === expectedDefinitionHash, "definition_changed");
    need2(response.headers.get("X-Astra-Calculations-Prices-Captured-At") === (snapshot.sources.prices?.capturedAt ?? "none") && response.headers.get("X-Astra-Calculations-Overview-Captured-At") === (snapshot.sources.overview?.capturedAt ?? "none"), "source_clock_binding");
    const mode = response.headers.get("X-Astra-Calculations-Mode");
    need2(["accepted_cache", "retained_last_good"].includes(mode), "invalid_reader_mode");
    return mode;
  }
  async function read() {
    const controller = new AbortController();
    let deadline;
    const guard = new Promise((_, reject) => {
      deadline = setTimeout(() => {
        controller.abort();
        reject(Error("own_reader_timeout"));
      }, timeoutMs);
    });
    const wait = (p) => Promise.race([p, guard]);
    try {
      const response = await wait(fetcher(origin + ROUTE, {
        method: "GET",
        credentials: "same-origin",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json", ...etag ? { "If-None-Match": etag } : {} }
      }));
      if ([401, 403].includes(response.status)) {
        blocked = true;
        onAccessDenied(response.status);
        throw Error("access_denied");
      }
      need2(response.status === 200 || response.status === 304, response.status === 404 ? "not_published" : "own_reader_unavailable");
      need2(/(?:^|,)\s*private\s*(?:,|$)/i.test(response.headers.get("Cache-Control") || "") && /(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get("Cache-Control") || ""), "private_policy");
      if (response.status === 304) {
        const snapshot2 = selection.state().evidenceSnapshot;
        need2(snapshot2 && response.headers.get("ETag") === etag, "invalid_not_modified");
        evidenceReaderMode = context(response, snapshot2);
        selection.accept(snapshot2, { checkedAt: iso(now()), readerMode: evidenceReaderMode });
        readerMode = selection.state().status === "retained" ? "retained_last_good" : evidenceReaderMode;
        reason = selection.state().status === "retained" ? "current_aggregate_unavailable_or_older" : null;
        failures = 0;
        nextCheck = now() + 6e4;
        onChange(state());
        return state();
      }
      need2((response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase() === "application/json", "not_json");
      const length = response.headers.get("Content-Length");
      if (length !== null) need2(/^\d+$/.test(length) && Number(length) > 0 && Number(length) <= MAX_BYTES, "body_bound");
      const reader = response.body?.getReader();
      need2(reader, "missing_body");
      let size = 0;
      const chunks = [];
      try {
        for (; ; ) {
          const chunk = await wait(reader.read());
          if (chunk.done) break;
          need2(chunk.value instanceof Uint8Array, "body_chunk");
          size += chunk.value.length;
          need2(size <= MAX_BYTES, "body_bound");
          chunks.push(chunk.value);
        }
      } catch (error) {
        reader.cancel().catch(() => {
        });
        throw error;
      } finally {
        reader.releaseLock();
      }
      need2(size > 0 && (length === null || Number(length) === size), "body_bound");
      const raw = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) {
        raw.set(chunk, at);
        at += chunk.length;
      }
      const digest = await wait(sha(raw)), nextEtag = '"api-calculations-' + digest + '"';
      need2(response.headers.get("ETag") === nextEtag, "body_hash");
      const snapshot = await wait(parse(raw, { expectedDefinitionHash })), previousEvidenceHash = selection.state().evidenceSnapshot?.snapshotHash;
      const routeMode = context(response, snapshot);
      const accepted = selection.accept(snapshot, { checkedAt: iso(now()), readerMode: routeMode }), evidenceAccepted = selection.state().evidenceSnapshot?.snapshotHash === snapshot.snapshotHash;
      if (evidenceAccepted) etag = nextEtag;
      evidenceReaderMode = evidenceAccepted ? routeMode : "retained_last_good";
      readerMode = selection.state().status === "retained" ? "retained_last_good" : routeMode;
      reason = !evidenceAccepted ? "source_pair_rollback" : selection.state().status === "retained" ? "current_aggregate_unavailable_or_older" : null;
      failures = 0;
      nextCheck = now() + 6e4;
      onChange({ ...state(), changed: accepted, evidenceChanged: selection.state().evidenceSnapshot?.snapshotHash !== previousEvidenceHash });
      return state();
    } catch (error) {
      failures++;
      selection.failed({ checkedAt: iso(now()), reason: error.message === "access_denied" ? "access_denied" : error.message === "not_published" ? "not_published" : "own_reader_failed" });
      reason = ["access_denied", "not_published"].includes(error.message) ? error.message : "own_reader_failed";
      readerMode = selection.state().snapshot ? "retained_last_good" : null;
      evidenceReaderMode = selection.state().evidenceSnapshot ? "retained_last_good" : null;
      nextCheck = blocked ? Infinity : now() + Math.min(6e5, 6e4 * 2 ** Math.min(failures - 1, 4));
      onChange(state());
      return state();
    } finally {
      clearTimeout(deadline);
    }
  }
  return Object.freeze({ state, refresh() {
    if (blocked || now() < nextCheck) return Promise.resolve(state());
    if (flight) return flight;
    flight = read();
    return flight.finally(() => {
      flight = null;
    });
  } });
}

// ui-src/api-calculations/runtime.mjs
function createCalculationRuntime({ origin, available: available2, parse, definitionHash, unpackDaily, itemDefinitions = null, fetcher = fetch, now = () => Date.now(), selection = () => ({ mode: "rolling", windowDays: 7 }), notify = () => {
} }) {
  let legacy = null, view = null, cacheKey = null, bindingError = null, notificationKey = null, itemView = null, itemKey = null, itemBindingError = null;
  const captured = [];
  const definitions = available2 === true && itemDefinitions ? structuredClone(itemDefinitions) : null;
  const client = available2 === true ? createApiCalculationClient({ origin, parse, expectedDefinitionHash: definitionHash, fetcher, now, onChange: (state) => {
    const key = [state.snapshot?.snapshotHash ?? null, state.status, state.readerMode, state.reason, state.evidenceSnapshot?.snapshotHash ?? null, state.evidenceStatus, state.evidenceReaderMode, state.evidenceReason];
    const changed = !notificationKey || key.some((value, i) => value !== notificationKey[i]);
    if (changed) {
      cacheKey = null;
      view = null;
      itemKey = null;
      itemView = null;
      notificationKey = key;
    }
    if (state.changed && state.snapshot) {
      const dto = state.snapshot;
      captured.push({ snapshotHash: dto.snapshotHash, at: dto.maxInputCapturedAt ?? dto.sources.prices.capturedAt, pricesCapturedAt: dto.sources.prices.capturedAt, overviewCapturedAt: dto.sources.overview?.capturedAt ?? null, currentIndex: dto.current.index, fixed: dto.benchmarks.fixed.rateMesosPerNx, rolling7: dto.benchmarks.rolling7.rateMesosPerNx, rolling3: dto.benchmarks.rolling3.rateMesosPerNx });
      if (captured.length > 128) captured.shift();
    }
    if (changed) notify(state);
  } }) : Object.freeze({ state: () => ({ snapshot: null, status: "off", readerMode: null, reason: null, blocked: false, nextCheckAt: Infinity }) });
  function getView() {
    const state = client.state();
    if (!legacy || !state.snapshot) return null;
    const chosen = selection(), key = [state.snapshot.snapshotHash, chosen.mode, chosen.windowDays];
    if (!cacheKey || key.some((v, i) => v !== cacheKey[i])) {
      try {
        view = calculationView(legacy, state.snapshot, chosen);
        bindingError = null;
      } catch {
        view = null;
        bindingError = "legacy_calculation_definition_mismatch";
      }
      cacheKey = key;
    }
    return view;
  }
  function getItemEvidence() {
    const state = client.state();
    if (!legacy || !state.evidenceSnapshot || !definitions) return null;
    const key = [state.evidenceSnapshot.snapshotHash, state.evidenceStatus, state.evidenceReason];
    if (!itemKey || key.some((v, i) => v !== itemKey[i])) {
      try {
        itemView = calculationItemEvidenceView(legacy, state.evidenceSnapshot, { definitions, dailyItems: unpackDaily(state.evidenceSnapshot), status: state.evidenceStatus, reason: state.evidenceReason });
        itemBindingError = null;
      } catch {
        itemView = null;
        itemBindingError = "legacy_item_evidence_definition_mismatch";
      }
      itemKey = key;
    }
    return itemView;
  }
  const api = {
    available: available2 === true,
    setLegacy(report) {
      if (!report || !Array.isArray(report.rows) || report.rows.length !== 50) return false;
      if (legacy !== report) {
        legacy = report;
        cacheKey = null;
        view = null;
        itemKey = null;
        itemView = null;
      }
      return true;
    },
    getView,
    getItemEvidence,
    headline() {
      return getView()?.headline ?? null;
    },
    state() {
      return { ...client.state(), available: available2 === true, hasBoundLegacy: !!legacy, bindingError, itemBindingError };
    },
    async refresh() {
      if (available2 !== true) return api.state();
      await client.refresh();
      return api.state();
    },
    dailyItems() {
      const dto = client.state().snapshot;
      return dto ? unpackDaily(dto) : [];
    },
    overlayReport(report) {
      const current = getView(), items = getItemEvidence(), base = current ? { ...report, rows: current.rows, categories: current.categories, apiCalculationView: current, apiDailyItems: api.dailyItems() } : report;
      if (items) return { ...base, apiItemEvidence: items };
      if (Object.hasOwn(base, "apiItemEvidence")) {
        const { apiItemEvidence: _old, ...without } = base;
        return without;
      }
      return base;
    },
    capturePoints() {
      return captured.map((point) => ({ ...point }));
    },
    sourceSeries(metric) {
      const dto = client.state().snapshot;
      if (!dto || !getView()) return [];
      const chosen = selection();
      if (metric === "observed-nx" || metric === "cpi") {
        const observed = metric === "observed-nx";
        const points = dto.daily.history.filter((p) => Number.isFinite(observed ? p.nxRate : p.index) && (!observed || p.cashItems >= 3)).map((p) => ({ at: p.day + "T12:00:00Z", day: p.day, value: observed ? p.nxRate : p.index, kind: observed ? "api_overview_daily_cash_reference" : "api_linked_daily_mpi", datePrecision: "day", partial: p.partialCalendarDay, backcast: p.backcast, referenceNote: observed ? "API source-day cash-item sale-median reference; not individual trades." : "Retrospectively linked API daily price index; not a live trade observation." }));
        return [{ id: observed ? "api-observed-nx" : "api-linked-mpi", name: observed ? "API daily cash-sale reference" : "API-linked daily MPI", color: observed ? "#edc471" : "#87bdcf", fill: false, dash: true, maxGapMs: 1296e5, points }];
      }
      const modes = chosen.mode === "compare" ? ["fixed", "rolling" + chosen.windowDays] : [chosen.mode === "fixed" ? "fixed" : "rolling" + chosen.windowDays];
      return modes.map((mode) => ({ id: "api-" + mode, name: mode === "fixed" ? "API 3-day reference \xB7 fixed anchor" : `API 3-day reference \xB7 ${chosen.windowDays}-day anchor`, color: mode === "fixed" ? "#edc471" : "#87bdcf", fill: false, maxGapMs: 9e5, points: captured.filter((p) => Number.isFinite(p[mode]) && p[mode] > 0).map((p) => ({ at: p.at, value: p[mode], kind: "api_captured_3day_goods_nx_model", datePrecision: "capture", snapshotHash: p.snapshotHash, referenceNote: `Latest input HTTP capture; prices captured ${p.pricesCapturedAt}, daily source captured ${p.overviewCapturedAt ?? "unknown"}. Underlying trades and exact three-day bounds are unknown. Browser capture points are session-only; the owner retains its separate durable calculation archive.` })) }));
    }
  };
  return Object.freeze(api);
}

// ui-src/api-calculations/entry.mjs
var doc = document;
var available = doc.body.dataset.apiCalculationsAvailable === "true";
var EXPECTED = "865944dc992219e01b2aad45a6191174d112f3f1902e4ac86c79a6d23a481e17";
var timer = null;
var running = false;
var runtime = createCalculationRuntime({
  origin: location.origin,
  available,
  definitionHash: EXPECTED,
  parse: (bytes) => parseApiIndexSnapshot(bytes, { expectedDefinitionHash: EXPECTED, expectedRows: api_index_definition_data_v1_default.goods, expectedCashRows: api_index_definition_data_v1_default.cash }),
  unpackDaily: unpackApiDailyItemHistory,
  itemDefinitions: api_index_definition_data_v1_default,
  selection: () => {
    const s = window.AstraRollingBenchmark?.getState();
    return { mode: s?.mode || "rolling", windowDays: s?.windowDays || 7 };
  },
  notify: (state) => doc.dispatchEvent(new CustomEvent("astracalculationchange", { detail: { status: state.status, readerMode: state.readerMode, snapshotHash: state.snapshot?.snapshotHash ?? null, evidenceSnapshotHash: state.evidenceSnapshot?.snapshotHash ?? null } }))
});
window.AstraApiCalculations = runtime;
var visible = () => !doc.hidden && navigator.onLine !== false;
async function poll() {
  if (!available || running || !visible()) return;
  running = true;
  try {
    await runtime.refresh();
  } finally {
    running = false;
    doc.dispatchEvent(new Event("astracalculationcheck"));
    clearTimeout(timer);
    if (!runtime.state().blocked && visible()) timer = setTimeout(poll, Math.max(1e3, runtime.state().nextCheckAt - Date.now()));
  }
}
doc.addEventListener("visibilitychange", () => {
  if (!visible()) clearTimeout(timer);
  else void poll();
});
window.addEventListener("online", () => void poll());
window.addEventListener("offline", () => clearTimeout(timer));
doc.addEventListener("input", (event) => {
  if (event.target?.matches?.("#price-check-header-query,#price-check-query")) void poll();
});
doc.getElementById("refresh")?.addEventListener("click", () => void poll());
if (available) void poll();

})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "api-calculations.js", status: "initialization_failed"}})); } catch {}
}
