(() => {
  'use strict';
  const content = document.getElementById('content');
  const footer = document.querySelector('footer');
  if (!content || !footer || document.getElementById('view-privacy')) return;

  const privacy = document.createElement('section');
  privacy.id = 'view-privacy';
  privacy.className = 'view community-privacy';
  privacy.hidden = true;
  privacy.setAttribute('aria-labelledby', 'privacy-title');
  privacy.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">YOUR VISIT / YOUR CHOICE</p><h1 id="privacy-title">Privacy</h1><p>Draft privacy note · Updated November 4, 2026</p></div></div>
    <article class="panel community-prose">
      <p>This note describes the current inflation.gg build, maintained by DishWasher. There are no visitor accounts, ads or client analytics beacons in this build, and the site sets no visitor-tracking cookies of its own.</p>
      <h2>Hosting and security</h2>
      <p>Cloudflare delivers and protects the site. Normal request metadata can include your IP address, browser information, requested URL and request time. Cloudflare may process that information and use security cookies to operate its services and prevent abuse. See <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare’s privacy policy</a> and <a href="https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/" target="_blank" rel="noopener noreferrer">cookie documentation</a>.</p>
      <p>We may review aggregate hosting counts to understand capacity and reliability. A request count is not a count of distinct visitors or people: one visit can request several files, and automated traffic can make requests too.</p>
      <h2>What stays in your browser</h2>
      <p>Your display-timezone and scenery choices are saved in localStorage on this browser. The browser and service worker can cache public snapshots, the fallback page, JavaScript, CSS and other public assets so the site can load efficiently. You can remove these preferences and cached files through your browser’s site-data settings.</p>
      <h2>Contact and external links</h2>
      <p>The Contact box keeps an optional message in this tab; it does not submit or save that text to a server. Copy buttons write only what you choose to your clipboard. Opening Discord does not send a message or friend request. If you choose to contact me there, Discord handles that interaction under <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer">its own privacy policy</a>. Other outbound sites have their own policies too.</p>
      <h2>Market data is separate</h2>
      <p>Published market observations, item prices and source attribution describe the game economy. They are separate from website visitor information; this note does not replace the original market sources’ terms or policies.</p>
      <p>For questions about this note, <button type="button" class="community-inline-link" data-open-contact>contact Dish</button>. This is a description of the current build and hosting, not a guarantee that no data is processed.</p>
      <a class="community-back" href="#index">← Back to the dashboard</a>
    </article>`;
  content.append(privacy);

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
