(() => {
  'use strict';
  if (window.AstraRateArrival) return;
  const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  function points(report) {
    if (!report) return [];
    if(report.apiCalculationView)return (window.AstraGoodsNxBenchmark?.history(report)||[]).filter(p=>positive(p.value)&&typeof p.at==='string'&&Number.isFinite(Date.parse(p.at))).map(p=>({at:p.at,value:p.value,pricesCapturedAt:report.apiCalculationView.clocks.currentPrices,snapshotHash:p.snapshotHash,datePrecision:'capture'})).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(-3);
    const selected = window.AstraGoodsNxBenchmark?.history?.(report) ?? window.AstraRollingBenchmark?.series(report)?.[0]?.points;
    if (selected) return selected.filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.day || '') && positive(point.value)).map(point => ({ day: point.day, at: point.at, value: point.value, partial: !!point.partial })).sort((a,b) => a.day.localeCompare(b.day)).slice(-3);
    if (!positive(report?.baseNxRate)) return [];
    const days = new Map();
    for (const row of [...(report.history || []), report.latest].filter(Boolean)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day || '') || !positive(row.cpi)) continue;
      const value = report.baseNxRate * (row.cpi / 100);
      if (positive(value)) days.set(row.day, { day: row.day, at: row.at || row.day, value, partial: !!row.partial });
    }
    return [...days.values()].sort((a,b) => a.day.localeCompare(b.day)).slice(-3);
  }
  window.AstraRateArrival = Object.freeze({ points });
  const value = document.getElementById('main-rate'), copy = document.querySelector('.hero-copy');
  if (!value || !copy) return;
  const status = document.createElement('p'); status.id = 'rate-arrival-status';
  status.className = 'rate-arrival-status'; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite'); copy.append(status);
  const options = document.getElementById('display-options');
  const group = document.createElement('div'); group.className = 'hero-layout-options rate-arrival-options';
  group.setAttribute('role','group'); group.setAttribute('aria-label','Recent calculation animation');
  const toggle = document.createElement('button'); toggle.type = 'button';
  toggle.setAttribute('aria-controls','main-rate rate-arrival-status'); group.append(toggle);
  const styleChoices = document.createElement('div'); styleChoices.className = 'rate-arrival-style-choices'; styleChoices.setAttribute('role', 'group'); styleChoices.setAttribute('aria-label', 'Headline animation style');
  const note = document.createElement('small'); note.textContent = 'Actual stored calculations and source updates only; no simulated live ticks. Still keeps the latest snapshot.';
  group.append(styleChoices, note); options?.append(group);
  const key = 'astra-rate-arrival', styleKey = 'astra-rate-arrival-style-v1'; let enabled = true, style = 'ticks', report, lastKey, lastInputKey, generation = 0;
  const pending = new Set();
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* Device motion preference still applies. */ }
  try { const saved = localStorage.getItem(styleKey); if (['ticks', 'fade', 'pulse'].includes(saved)) style = saved; } catch { /* Source ticks remains the default. */ }
  for (const [choice, label] of [['ticks', 'Source ticks'], ['fade', 'Fade'], ['pulse', 'Update pulse'], ['still', 'Still']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.rateArrivalStyle = choice; button.textContent = label;
    button.setAttribute('aria-controls', 'main-rate rate-arrival-status');
    button.addEventListener('click', () => {
      enabled = choice !== 'still'; if (enabled) style = choice;
      try { localStorage.setItem(key, enabled ? 'on' : 'off'); if (enabled) localStorage.setItem(styleKey, style); } catch {}
      renderChoice(); draw(true);
    }); styleChoices.append(button);
  }
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const format = v => v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const date = day => new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  const renderChoice = () => {
    toggle.textContent = 'Recent calculation animation: '+(enabled?'On':'Off');
    toggle.setAttribute('aria-pressed',String(enabled));
    group.dataset.arrivalStyle = enabled ? style : 'still';
    for (const button of styleChoices.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.rateArrivalStyle === (enabled ? style : 'still')));
  };
  // Normalize actual timestamp-bearing source fields, never collection checks,
  // display clocks, inferred daily midnights or the time this function runs.
  const sourceTime = raw => typeof raw === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw) && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
  const hash = raw => typeof raw === 'string' && /^[a-f0-9]{64}$/i.test(raw) ? raw.toLowerCase() : null;
  function cancel() { ++generation; for (const timer of pending) clearTimeout(timer); pending.clear(); value.classList.remove('rate-source-arrived', 'rate-source-fade'); }
  function later(fn, delay) { const timer = setTimeout(() => { pending.delete(timer); fn(); }, delay); pending.add(timer); }
  function arrival() { value.classList.remove('rate-source-arrived', 'rate-source-fade'); void value.offsetWidth; value.classList.add(style === 'fade' ? 'rate-source-fade' : 'rate-source-arrived'); }
  value.addEventListener('animationend', event => { if (['rate-source-arrival', 'rate-source-fade'].includes(event.animationName)) value.classList.remove('rate-source-arrived', 'rate-source-fade'); });
  function draw(force = false) {
    cancel();
    const current = generation, series = points(report), headline = window.AstraGoodsNxBenchmark?.headline(report);
    if(report?.apiCalculationView){
      const view=report.apiCalculationView,key=JSON.stringify([view.snapshotHash,headline?.mode,headline?.windowDays,headline?.rate]),changed=key!==lastKey;lastKey=key;lastInputKey=key;
      if(!positive(headline?.rate)){value.textContent='—';status.textContent='Selected API benchmark unavailable; no legacy value is substituted.';status.dataset.phase='unavailable';return;}
      const stamp=raw=>{const zone=document.getElementById('display-timezone')?.value||'UTC';try{return new Date(raw).toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZone:zone})+' '+zone;}catch{return raw;}};
      const finish=()=>{if(current!==generation)return;value.textContent=format(headline.rate);status.textContent='Latest accepted calculation · price reference captured ('+stamp(view.clocks.currentPrices)+'). Calculation capture history is session-only; receipt times are not trade times.';status.dataset.phase='latest-api';if((changed||(force&&style!=='ticks'))&&enabled&&!motion?.matches)arrival();};
      if(!enabled||motion?.matches||style==='pulse'||series.length<2||(!force&&!changed)){finish();return;}
      status.dataset.phase='history';series.slice(0,-1).forEach((point,index)=>later(()=>{if(current!==generation)return;value.textContent=format(point.value);status.textContent='Earlier accepted calculation capture ('+stamp(point.at)+') → latest accepted calculation.';if(style==='fade')arrival();},index*650));later(finish,(series.length-1)*650);return;
    }
    const definition = { base: positive(report?.baseNxRate) ? report.baseNxRate : null, selectedMode: headline?.mode || window.AstraRollingBenchmark?.getState().mode || 'fixed', anchorWindowDays: headline?.mode==='rolling'?headline.windowDays:null, methodVersion: report?.methodVersion, basketVersion: report?.basketVersion,
      specificationHash: hash(report?.specificationHash), basketHash: hash(report?.basketHash) };
    const dailyKey = JSON.stringify({ definition, sourceAt: sourceTime(report?.sourceUpdatedAt), series });
    const liveKey = JSON.stringify({ definition, at: sourceTime(report?.live?.observedAt), cpi: positive(report?.live?.cpi) ? report.live.cpi : null });
    const inputKey = JSON.stringify([dailyKey, liveKey]);
    const live = !!headline?.live && positive(headline.rate) && sourceTime(headline.at) === sourceTime(report?.live?.observedAt) && sourceTime(headline.at) !== null;
    const fingerprint = live ? liveKey : dailyKey;
    // Both input and selected calculation must change. If a qualified point
    // merely ages out under the headline helper, wall-clock passage is not
    // treated as a new source observation or used to start an animation.
    const changed = inputKey !== lastInputKey && fingerprint !== lastKey;
    lastInputKey = inputKey; lastKey = fingerprint;
    if (headline && !positive(headline.rate)) { value.textContent='—';status.textContent='Selected benchmark unavailable; no older value is presented as current.';status.dataset.phase='unavailable';return; }
    // Qualified intraday MPI has its own real source clock; never replace it
    // with a daily animation or pretend daily points are successive live ticks.
    if (live) {
      value.textContent = format(headline.rate);
      status.textContent='Latest qualified goods calculation · see source time above.'; status.dataset.phase='live';
      if ((changed || (force && style !== 'ticks')) && enabled && !motion?.matches) arrival();
      return;
    }
    if (!series.length) { if(positive(headline?.rate))value.textContent=format(headline.rate);status.textContent=''; delete status.dataset.phase; return; }
    const latest = series.at(-1);
    const trail = series.map(p => date(p.day)+': '+format(p.value)).join(' → ');
    const finish = () => {
      if (current !== generation) return;
      value.textContent = format(latest.value);
      status.textContent = 'Latest available · '+date(latest.day)+(latest.partial?' (partial source day)':'')+'. Recent source-day calculations: '+trail+'.';
      status.dataset.phase = 'latest';
      if ((changed || (force && style !== 'ticks')) && enabled && !motion?.matches) arrival();
    };
    if (!enabled || motion?.matches || style === 'pulse' || series.length < 2 || (!force && !changed)) { finish(); return; }
    status.dataset.phase='history';
    // Show actual stored points only. No interpolated values are invented.
    series.slice(0,-1).forEach((point,index) => later(() => {
      if (current !== generation) return;
      value.textContent=format(point.value);
      if (style === 'fade') arrival();
      status.textContent='Recent source-day calculation · '+date(point.day)+' → latest '+date(latest.day)+'.';
    },index*650));
    later(finish,(series.length-1)*650);
  }
  toggle.addEventListener('click',() => {
    enabled=!enabled; try { localStorage.setItem(key,enabled?'on':'off'); } catch {}
    renderChoice(); draw(true);
  });
  motion?.addEventListener?.('change',() => draw());
  document.addEventListener('astramarketsnapshot',event => { report=event.detail; draw(); });
  document.addEventListener('astrabenchmarkmodechange',()=>{if(report)draw();});
  renderChoice(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();
