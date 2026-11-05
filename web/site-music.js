(() => {
  'use strict';
  const footer = document.querySelector('footer');
  if (!footer || document.getElementById('site-music')) return;
  // The old automatic village-music choice is preserved in storage as history.
  // It does not opt visitors into this revised, explicitly optional preview.
  const keys = { enabled: 'astra-site-music-v2', volume: 'astra-site-music-volume-v1' };
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Tab-only controls still work. */ } };
  const stored = read(keys.enabled), storedVolume = read(keys.volume);
  let enabled = stored === 'on';
  let volume = storedVolume !== null && storedVolume.trim() !== '' && Number.isFinite(Number(storedVolume)) && Number(storedVolume) >= 0 && Number(storedVolume) <= 1 ? Number(storedVolume) : .18;
  let state = enabled ? 'pending' : 'off', attempt = 0;
  const audio = document.createElement('audio');
  audio.id = 'site-music-audio'; audio.preload = 'none'; audio.loop = true; audio.volume = volume;
  audio.hidden = true;
  const panel = document.createElement('section'); panel.id = 'site-music'; panel.className = 'site-music-panel shell';
  panel.setAttribute('aria-labelledby', 'site-music-title');
  const heading = document.createElement('h2'); heading.id = 'site-music-title'; heading.textContent = 'Optional preview music';
  const status = document.createElement('p'); status.className = 'site-music-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const controls = document.createElement('div'); controls.className = 'site-music-controls';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.id = 'site-music-toggle';
  const playback = document.createElement('button'); playback.type = 'button'; playback.id = 'site-music-play';
  const volumeLabel = document.createElement('label'); volumeLabel.htmlFor = 'site-music-volume'; volumeLabel.textContent = 'Volume';
  const slider = document.createElement('input'); slider.id = 'site-music-volume'; slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1'; slider.value = String(Math.round(volume * 100));
  const volumeValue = document.createElement('output'); volumeValue.htmlFor = slider.id;
  volumeLabel.append(slider, volumeValue); controls.append(toggle, playback, volumeLabel);
  const credit = document.createElement('p'); credit.className = 'site-music-credit';
  const source = document.createElement('a'); source.href = 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700007'; source.textContent = '“Village Consort” — Kevin MacLeod'; source.rel = 'noopener noreferrer'; source.target = '_blank';
  const license = document.createElement('a'); license.href = 'https://creativecommons.org/licenses/by/4.0/'; license.textContent = 'CC BY 4.0'; license.rel = 'noopener noreferrer'; license.target = '_blank';
  const details = document.createElement('a'); details.href = 'assets/site-music-attribution.txt'; details.textContent = 'Music credits & changes';
  const privacy = document.createElement('a'); privacy.href = '#privacy'; privacy.textContent = 'Privacy';
  credit.append(source, ' · ', license, ' · ', details, ' · ', privacy);
  const note = document.createElement('p'); note.className = 'site-music-note'; note.textContent = 'Off by default. An official MapleStory recording with a verified copyright-free playback license has not been selected. This archived, manually enabled preview track is licensed original village music, not official MapleStory music. Audio is served by this site; no third-party player. Your choice and volume are saved in this browser.';
  panel.append(heading, status, controls, credit, note, audio); footer.before(panel);
  const quick = document.createElement('button'); quick.type='button'; quick.className='site-music-quick';
  quick.setAttribute('aria-controls','site-music-audio'); document.body.append(quick);
  function render() {
    panel.dataset.musicState = state;
    toggle.textContent = enabled ? 'Music on' : 'Music off'; toggle.setAttribute('aria-pressed', String(enabled)); toggle.setAttribute('aria-label', enabled ? 'Turn village music off' : 'Turn village music on');
    playback.hidden = !enabled; playback.disabled = state === 'pending';
    playback.textContent = state === 'playing' ? 'Pause' : state === 'blocked' ? 'Tap to play' : state === 'error' ? 'Retry music' : 'Play';
    playback.setAttribute('aria-label', state === 'playing' ? 'Pause village music' : 'Play village music');
    status.textContent = ({ off: 'Music off.', pending: 'Trying to start music…', playing: 'Playing Village Consort.', paused: 'Music paused.', blocked: 'Your browser paused autoplay. Tap to play.', error: 'Music could not load. You can retry or leave it off.' })[state];
    volumeValue.textContent = `${Math.round(volume * 100)}%`; slider.setAttribute('aria-valuetext', `${Math.round(volume * 100)} percent`);
    quick.textContent=state==='playing'?'♫ Music off':state==='pending'?'♫ Stop':'♫ Play';
    quick.setAttribute('aria-label',state==='playing'||state==='pending'?'Turn village music off':'Play village music');
  }
  function stop() {
    ++attempt; state = 'off'; audio.pause();
    try { audio.currentTime = 0; } catch { /* Metadata may not have loaded. */ }
    audio.removeAttribute('src'); audio.load(); render();
  }
  async function play() {
    if (!enabled) return;
    const token = ++attempt; state = 'pending'; render();
    if (!audio.getAttribute('src')) audio.setAttribute('src', 'assets/village-consort-kevin-macleod-62a6f215a35b1041.mp3');
    try {
      await audio.play();
      if (!enabled || token !== attempt) { if (!enabled) audio.pause(); return; }
      state = 'playing'; render();
    } catch (error) {
      if (!enabled || token !== attempt) return;
      state = error?.name === 'NotAllowedError' ? 'blocked' : 'error'; render();
    }
  }
  toggle.addEventListener('click', () => { enabled = !enabled; save(keys.enabled, enabled ? 'on' : 'off'); if (enabled) play(); else stop(); });
  quick.addEventListener('click',()=>{if(state==='playing'||state==='pending'){enabled=false;save(keys.enabled,'off');stop()}else{enabled=true;save(keys.enabled,'on');play()}});
  playback.addEventListener('click', () => {
    if (state === 'playing') { ++attempt; state = 'paused'; audio.pause(); render(); }
    else play();
  });
  slider.addEventListener('input', () => { const value = Number(slider.value); if (!Number.isFinite(value)) return; volume = Math.max(0, Math.min(1, value / 100)); audio.volume = volume; save(keys.volume, String(volume)); render(); });
  audio.addEventListener('playing', () => { if (enabled && state !== 'off' && state !== 'paused') { state = 'playing'; render(); } else if (!enabled) audio.pause(); });
  audio.addEventListener('pause', () => { if (enabled && state === 'playing') { state = 'paused'; render(); } });
  audio.addEventListener('error', () => { if (enabled) { ++attempt; state = 'error'; render(); } });
  render();
  // A rejected attempt is retried only by these explicit music controls, never a global gesture hook.
  if (enabled) play();
})();
