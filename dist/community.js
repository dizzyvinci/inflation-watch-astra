(() => {
  'use strict';
  const content = document.getElementById('content');
  const footer = document.querySelector('footer');
  if (!content || !footer || document.getElementById('view-privacy')) return;

  const footerStyles = ['clear', 'personal', 'emphasis'];
  const footerStyleKey = 'inflation-footer-style';
  footer.classList.add('community-footer');
  const styleControls = document.createElement('div');
  styleControls.className = 'community-footer-styles';
  styleControls.setAttribute('role', 'group');
  styleControls.setAttribute('aria-label', 'Footer text style');
  const styleLabel = document.createElement('span');
  styleLabel.textContent = 'Footer text';
  styleControls.append(styleLabel);
  const descriptions = { clear: 'Clear: larger system text', personal: 'Personal: larger serif text with an italic introduction', emphasis: 'Emphasis: larger semibold text' };
  const applyFooterStyle = value => {
    footer.dataset.footerStyle = footerStyles.includes(value) ? value : 'clear';
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
  try { savedFooterStyle = localStorage.getItem(footerStyleKey); } catch { /* Use Clear without persistent storage. */ }
  applyFooterStyle(savedFooterStyle);

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
})();
