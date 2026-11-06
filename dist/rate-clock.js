(() => {
  'use strict';
  const sourceClock = document.getElementById('rate-kind');
  if (!sourceClock || document.getElementById('rate-current-clock')) return;
  const options = document.getElementById('display-options');
  const zoneSelect = document.getElementById('display-timezone');
  const preferenceKey = 'astra-rate-clock-v1', modes = new Set(['current-source', 'source']);
  let mode = 'current-source', interval;
  try { const saved = localStorage.getItem(preferenceKey); if (modes.has(saved)) mode = saved; } catch { /* Current-tab controls still work. */ }
  const clock = document.createElement('p'); clock.id = 'rate-current-clock'; clock.className = 'rate-current-clock';
  clock.dataset.clockKind = 'view'; clock.setAttribute('aria-live', 'off');
  clock.setAttribute('aria-label', 'Current viewing clock, separate from the market source time above');
  const time = document.createElement('time');
  const cadence = document.createElement('span'); cadence.textContent = ' · collector checks ~10 min';
  cadence.title = 'Approximate collector check cadence, not a promise of new market observations. The source timestamp above remains the data clock.';
  clock.append('Now: ', time, cadence); sourceClock.after(clock);
  const group = document.createElement('div'); group.className = 'hero-layout-options rate-clock-options'; group.dataset.previewControls = '';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Headline clocks');
  for (const [value, label] of [['current-source', 'Current clock + source'], ['source', 'Source only']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.rateClock = value;
    button.textContent = label; button.setAttribute('aria-controls', 'rate-current-clock');
    button.addEventListener('click', () => { mode = value; try { localStorage.setItem(preferenceKey, mode); } catch {} apply(); });
    group.append(button);
  }
  const note = document.createElement('small'); note.textContent = 'The ticking clock is your current viewing time. Market values keep their actual source timestamp.'; group.append(note); options?.append(group);
  function tick() {
    let zone = zoneSelect?.value || 'UTC', format;
    const configuration = { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };
    try { format = new Intl.DateTimeFormat('en-US', { ...configuration, timeZone: zone }); }
    catch { zone = 'UTC'; format = new Intl.DateTimeFormat('en-US', { ...configuration, timeZone: zone }); }
    const now = new Date();
    time.dateTime = now.toISOString(); time.textContent = format.format(now) + ' ' + zone.replaceAll('_', ' ');
    clock.dataset.timeZone = zone;
  }
  function syncTimer() {
    if (interval !== undefined) { clearInterval(interval); interval = undefined; }
    if (mode === 'current-source') {
      tick();
      if (!document.hidden) interval = setInterval(tick, 1000);
    }
  }
  function apply() {
    clock.hidden = mode === 'source';
    for (const button of group.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.rateClock === mode));
    syncTimer();
  }
  zoneSelect?.addEventListener('change', () => { if (mode === 'current-source') tick(); });
  document.addEventListener('visibilitychange', syncTimer);
  function renderCadence() {
    const api = document.body?.dataset.apiCalculationsAvailable === 'true';
    cadence.textContent = api ? ' · prices ~5 min · overview ~15 min · visible cache ~60 s' : ' · collector checks ~10 min';
    cadence.title = api ? 'Scheduled API retrieval targets: prices every 5 minutes and daily overview every 15 minutes. A visible tab checks only this site’s cache about every 60 seconds while healthy; failures and backoff can delay checks. Retrieval is not an individual trade time. The source timestamps remain unchanged by this viewing clock.' : 'Approximate collector check cadence, not a promise of new market observations. The source timestamp above remains the data clock.';
    cadence.dataset.cadenceKind = api ? 'api_retrieval_and_own_cache' : 'legacy_collector';
  }
  document.addEventListener('astracalculationchange', renderCadence);
  document.addEventListener('astramarketsnapshot', renderCadence);
  renderCadence();
  // No market render, value update, source-clock edit or data request occurs on a timer tick.
  apply();
})();
