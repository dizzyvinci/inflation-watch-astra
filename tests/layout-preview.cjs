const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const web = path.join(__dirname, '../web');
const script = fs.readFileSync(path.join(web, 'layout-preview.js'), 'utf8');
const inspector = fs.readFileSync(path.join(web, 'chart-interaction.js'), 'utf8');
const page = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
const key = 'astra-banner-layout';
const orderKey = 'astra-banner-order';
const flush = () => new Promise(resolve => setImmediate(resolve));

function verifyResponsiveStyleContract() {
  const css = ['style.css', 'layout-preview.css'].map(name => fs.readFileSync(path.join(web, name), 'utf8')).join('\n');
  const parsed = new JSDOM('<style></style>');
  parsed.window.document.querySelector('style').textContent = css;
  const rules = parsed.window.document.styleSheets[0].cssRules;
  const matching = (list, width) => [...list].map(rule => {
    if (rule.type !== 4) return rule.cssText;
    const condition = rule.conditionText;
    const min = /min-width:\s*(\d+)px/.exec(condition), max = /max-width:\s*(\d+)px/.exec(condition);
    return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1])) ? matching(rule.cssRules, width) : '';
  }).join('\n');
  const length = (value, width) => {
    const simple = token => token.trim().endsWith('vw') || token.trim().endsWith('%') ? parseFloat(token) / 100 * width : parseFloat(token);
    if (value.startsWith('min(')) return Math.min(...value.slice(4, -1).split(',').map(simple));
    if (value.startsWith('calc(')) { const [left, right] = value.slice(5, -1).split(' - '); return simple(left) - simple(right); }
    return simple(value);
  };
  const widths = [];
  for (const viewport of [375, 768, 1024, 1200, 1440, 1920, 2560, 3840]) {
    const dom = new JSDOM('<style></style><div class="shell"><article class="rate-hero"><div class="banner-preview-chart-slot"></div><div class="hero-copy"></div><div class="hero-art"><img class="hero-merchant"></div></article></div>');
    const w = dom.window, doc = w.document;
    doc.querySelector('style').textContent = matching(rules, viewport);
    doc.body.dataset.bannerLayout = 'chart';
    // JSDOM resolves vw against its fixed viewport; evaluate the matched CSS
    // declaration for these bounds. Actual rendered geometry is browser QA.
    const shellRule = [...doc.styleSheets[0].cssRules].filter(rule => rule.selectorText === '.shell' && rule.style.width).at(-1);
    const shellWidth = length(shellRule.style.width, viewport);
    assert(shellWidth <= viewport && shellWidth <= 2000, `${viewport}: bounded content width`);
    if (viewport <= 700) assert.equal(shellWidth, viewport - 32, 'mobile16px side gutters remain');
    else if (viewport <= 1000) assert.equal(shellWidth, viewport - 40, 'tablet20px side gutters remain');
    else assert(Math.abs(shellWidth - Math.min(viewport * .92, 2000)) < .01, `${viewport}: ${shellWidth} from ${shellRule.style.width}`);
    const art = w.getComputedStyle(doc.querySelector('.hero-art')), copy = w.getComputedStyle(doc.querySelector('.hero-copy'));
    const chart = w.getComputedStyle(doc.querySelector('.banner-preview-chart-slot'));
    assert.equal(art.gridColumn, copy.gridColumn, 'rate overlays artwork rather than a separate green column');
    assert.equal(art.gridRow, copy.gridRow);
    assert(Number(copy.zIndex) > Number(art.zIndex), 'readable rate is above art');
    if (viewport >= 1200) {
      assert.equal(art.gridColumn, '2 / 4'); assert.equal(chart.gridColumn, '1');
      assert.equal(chart.gridRow, art.gridRow);
      const chartWidth = shellWidth / 3, artworkWidth = shellWidth * 2 / 3;
      assert(chartWidth >= 360 && artworkWidth >= chartWidth * 1.99);
    } else {
      assert.equal(art.gridColumn, '1'); assert.equal(art.gridRow, '2'); assert.equal(chart.gridRow, '1');
    }
    const sceneBefore = art.backgroundImage;
    doc.body.dataset.bannerOrder = 'rate-first';
    const swappedCopy = w.getComputedStyle(doc.querySelector('.hero-copy'));
    const swappedArt = w.getComputedStyle(doc.querySelector('.hero-art'));
    const swappedChart = w.getComputedStyle(doc.querySelector('.banner-preview-chart-slot'));
    assert.equal(swappedArt.backgroundImage, sceneBefore, 'swap preserves artwork');
    if (viewport >= 1200) {
      assert.equal(swappedChart.gridColumn, '3');
      assert.equal(swappedCopy.gridColumn, '1 / 3');
      assert.equal(swappedArt.gridColumn, '2 / 4', 'desktop artwork stays in place');
    } else {
      assert.equal(swappedChart.gridRow, '2');
      assert.equal(swappedCopy.gridRow, '1');
      assert.equal(swappedArt.gridRow, '1', 'scenery remains behind rate when stacked');
    }
    assert.equal(w.getComputedStyle(doc.querySelector('.hero-merchant')).transform, 'none');
    doc.body.dataset.bannerLayout='offers';
    for(const order of ['chart-first','rate-first']){
      doc.body.dataset.bannerOrder=order;
      const offerPanel=w.getComputedStyle(doc.querySelector('.banner-preview-chart-slot')),offerCopy=w.getComputedStyle(doc.querySelector('.hero-copy')),offerArt=w.getComputedStyle(doc.querySelector('.hero-art'));
      if(viewport>=1200){assert.equal(offerPanel.gridColumn,order==='rate-first'?'3':'1');assert.equal(offerCopy.gridColumn,order==='rate-first'?'1 / 3':'2 / 4');assert.equal(offerArt.gridColumn,'2 / 4');}
      else{assert.equal(offerPanel.gridRow,order==='rate-first'?'2':'1');assert.equal(offerCopy.gridRow,order==='rate-first'?'1':'2');assert.equal(offerArt.gridRow,offerCopy.gridRow);}
    }
    doc.body.dataset.bannerArt='zakum';assert.equal(w.getComputedStyle(doc.querySelector('.hero-copy')).maxWidth,viewport>=1200?'58%':'100%','offers respects the narrower Zakum copy at wide widths');
    widths.push([viewport, Math.round(shellWidth * 100) / 100]);
    dom.window.close();
  }
  parsed.window.close();
  return widths;
}

function fixture({ preferences = new Map(), blocked = false, legacy = false, missing = false, missingOffers = false } = {}) {
  const dom = new JSDOM(page, { url: 'https://inflation.gg/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, doc = w.document;
  const calls = { network: 0, reads: [], writes: [], events: [] };
  w.fetch = () => { calls.network++; throw new Error('Unexpected fetch'); };
  w.XMLHttpRequest = function () { calls.network++; throw new Error('Unexpected request'); };
  w.navigator.sendBeacon = () => { calls.network++; throw new Error('Unexpected beacon'); };
  Object.defineProperty(w, 'localStorage', { value: {
    getItem(name) { calls.reads.push(name); if (blocked) throw new Error('Storage blocked'); return preferences.get(name) ?? null; },
    setItem(name, value) { calls.writes.push([name, value]); if (blocked) throw new Error('Storage blocked'); preferences.set(name, value); },
  } });
  w.addEventListener('astrabannerlayoutchange', event => calls.events.push(event.detail.layout));
  const main = doc.getElementById('main-chart');
  main.innerHTML = '<svg viewBox="0 0 100 100"><circle cx="10" cy="20" data-chart-value="17.086067136821057" data-chart-series="Source series" data-chart-date="2026-11-04" data-chart-date-precision="day" data-chart-unit="mesos per NX"><title>source label</title></circle></svg>';
  const other = doc.getElementById('cpi-detail-chart');
  other.innerHTML = '<svg viewBox="0 0 100 100"><circle cx="20" cy="30" data-chart-value="156.078952" data-chart-date="2026-11-04" data-chart-unit="index points"/></svg>';
  const offersStats=doc.getElementById('smega-stats');
  offersStats.innerHTML=[['sell','1:18.5'],['buy','1:17.2'],['gap','1.3'],['gap','7.3%']].map(([side,value])=>`<div class="stat-cell" data-offer-side="${side}"><span>Original source summary</span><strong>${value}</strong><small>Actual window metadata stays here</small></div>`).join('');
  const offersChart=doc.getElementById('smega-offer-chart');offersChart.innerHTML='<svg data-original-offer-chart="true"></svg>';
  const style=doc.createElement('style');style.textContent=fs.readFileSync(path.join(web,'layout-preview.css'),'utf8');doc.head.append(style);
  if (legacy) {
    const history = doc.getElementById('main-history-section');
    if (history) history.replaceWith(...history.childNodes);
  }
  if (missing) doc.querySelector('.hero-art').remove();
  const before = {
    hero: doc.querySelector('.rate-hero'), copy: doc.querySelector('.hero-copy'), art: doc.querySelector('.hero-art'),
    main, other, range: doc.getElementById('range-buttons'), metric: doc.getElementById('chart-metric'),
    csv: doc.getElementById('export-history'), card: main.closest('.chart-card'), story: doc.querySelector('.footer-story').outerHTML,
    offersHeading:doc.querySelector('#smega-section>.section-heading'),offersStats,offersChart,offersRange:doc.querySelector('#smega-section [data-smega-range="8"]'),
  };
  if(missingOffers)offersStats.remove();
  w.eval(script);
  return { dom, w, doc, calls, preferences, before };
}

(async () => {
  const widthBounds = verifyResponsiveStyleContract();
  const preferences = new Map([['astra-scenery', 'off'], ['astra-hero-layout', 'dials-first'], ['inflation-footer-style', 'personal']]);
  const f = fixture({ preferences });
  const { w, doc, before, calls } = f;
  const controls = doc.getElementById('banner-layout-options');
  const choose = value => controls.querySelector(`[data-banner-layout-choice="${value}"]`).click();
  const history = before.main.closest('#main-history-section, .banner-preview-history');
  const originalParent = history.parentNode, originalNext = history.nextSibling;
  assert.equal(doc.body.dataset.bannerLayout, 'original');
  assert.equal(w.getComputedStyle(before.offersStats).gridTemplateColumns,'repeat(2,minmax(0,1fr))','default original card also uses2x2 stats');
  assert.equal(w.getComputedStyle(before.offersStats.querySelector('[data-offer-side="buy"]')).gridRow,'1');
  assert.equal(w.getComputedStyle(before.offersStats.querySelector('[data-offer-side="sell"]')).gridRow,'2');
  assert.equal(before.hero.contains(before.main), false);
  assert.equal(controls.parentElement.id, 'display-options');
  assert.equal(controls.closest('#scenery-options'), null, 'control is available when scenery is off');
  assert.equal(controls.getAttribute('role'), 'group');
  assert.equal(controls.getAttribute('aria-label'), 'Banner layout');
  assert.deepEqual([...controls.querySelectorAll('button')].map(button => button.textContent), ['Art banner', 'Chart beside rate', 'Offers beside rate', 'Rate first']);
  const swap = doc.getElementById('banner-order-toggle');
  assert.equal(swap.disabled, true);
  assert([...controls.querySelectorAll('button')].every(button => button.type === 'button' && button.getAttribute('aria-controls') === 'rate-section'));
  const chartChoice = controls.querySelector('[data-banner-layout-choice="chart"]');
  assert.equal(chartChoice.tabIndex, 0, 'native buttons participate in keyboard navigation');
  chartChoice.focus();
  assert.equal(doc.activeElement, chartChoice);
  assert.equal(controls.querySelector('[data-banner-layout-choice="original"]').getAttribute('aria-pressed'), 'true');
  const changed = { range: 0, metric: 0, csv: 0 };
  before.range.addEventListener('click', () => changed.range++);
  before.metric.addEventListener('change', () => changed.metric++);
  before.csv.addEventListener('click', () => changed.csv++);
  w.eval(inspector);
  await flush();
  const mainSvg = before.main.querySelector('svg');
  const otherSvg = before.other.querySelector('svg');
  const inspectorUi = before.main.querySelector('.chart-inspector-ui');
  mainSvg.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  mainSvg.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert(before.main.classList.contains('chart-inspector-pinned'));
  choose('chart');
  await flush();
  assert.equal(before.hero.firstElementChild.className, 'banner-preview-chart-slot');
  assert.equal(before.hero.firstElementChild.firstElementChild, history);
  assert.equal(before.hero.children[1], before.copy);
  assert.equal(before.hero.children[2], before.art);
  assert.equal(doc.getElementById('main-chart'), before.main);
  assert.equal(doc.getElementById('range-buttons'), before.range);
  assert.equal(doc.getElementById('chart-metric'), before.metric);
  assert.equal(doc.getElementById('export-history'), before.csv);
  assert.equal(before.main.closest('.chart-card'), before.card);
  assert.equal(before.main.querySelector('.chart-inspector-ui'), inspectorUi);
  assert(before.main.classList.contains('chart-inspector-pinned'));
  assert.equal(before.other.querySelector('svg'), otherSvg);
  assert.equal(before.main.querySelector('[data-chart-value]').dataset.chartValue, '17.086067136821057');
  assert.equal(before.other.querySelector('[data-chart-value]').dataset.chartValue, '156.078952');
  assert(before.main.querySelector('.chart-inspector-tooltip').textContent.includes('2026-11-04 · source time unspecified'));
  const follow = before.main.querySelector('.chart-inspector-toggle');
  follow.click();
  assert.equal(follow.getAttribute('aria-pressed'), 'false');
  before.range.querySelector('button').click();
  before.metric.value = 'cpi'; before.metric.dispatchEvent(new w.Event('change', { bubbles: true }));
  before.csv.click();
  assert.deepEqual(changed, { range: 1, metric: 1, csv: 1 });
  choose('chart');
  assert.deepEqual(calls.events, ['chart'], 'reselecting active layout needs no redraw');
  choose('original');
  await flush();
  assert.equal(history.parentNode, originalParent);
  assert.equal(history.nextSibling, originalNext);
  assert.equal(doc.querySelector('.banner-preview-chart-slot'), null);
  assert.equal(doc.querySelector('.hero-copy'), before.copy);
  assert.equal(doc.querySelector('.hero-art'), before.art);
  assert.equal(doc.querySelector('.footer-story').outerHTML, before.story);
  assert.equal(before.main.querySelector('.chart-inspector-toggle'), follow);
  assert.equal(follow.getAttribute('aria-pressed'), 'false');
  mainSvg.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  assert.equal(before.main.querySelector('.chart-inspector-tooltip').hidden, false, 'keyboard inspection survives restoration with follow off');
  assert.deepEqual(calls.events, ['chart', 'original']);
  assert.equal(preferences.get('astra-scenery'), 'off');
  assert.equal(preferences.get('astra-hero-layout'), 'dials-first');
  assert.equal(preferences.get('inflation-footer-style'), 'personal');
  assert.deepEqual(calls.reads, [key, orderKey]);
  assert(calls.writes.every(([name, value]) => (name === key && ['chart', 'original', 'offers'].includes(value)) || (name === orderKey && ['chart-first', 'rate-first'].includes(value))));
  let offerWindowClicks=0,offerChartClicks=0;
  before.offersHeading.addEventListener('click',()=>offerWindowClicks++);
  before.offersChart.addEventListener('click',()=>offerChartClicks++);
  const originalOfferSvg=before.offersChart.firstElementChild,offersSection=doc.getElementById('smega-section');
  const originalOffersParent=offersSection.parentNode,originalOffersNext=offersSection.nextSibling,originalOffersLabel=offersSection.getAttribute('aria-labelledby');
  assert(offersSection.classList.contains('banner-preview-offer-card'),'one visual card groups all offer evidence from initial layout');
  assert.equal(before.offersHeading.parentElement,offersSection);assert.equal(before.offersStats.parentElement,offersSection);assert(offersSection.contains(before.offersChart));
  choose('offers');
  assert.equal(doc.body.dataset.bannerLayout,'offers');assert.equal(preferences.get(key),'offers');
  assert(before.hero.contains(before.offersHeading));assert(before.hero.contains(before.offersStats));
  assert.equal(before.hero.contains(before.main),false,'NX history restores its wide original position');
  assert.equal(history.parentNode,originalParent);assert.equal(history.nextSibling,originalNext);
  assert.equal(before.offersChart.parentElement.parentElement,offersSection,'chart remains in the same original offer card');
  assert(before.hero.contains(before.offersChart),'entire offer card moves together into banner');
  assert.equal(before.offersHeading.closest('.banner-preview-offer-card'),before.offersChart.closest('.banner-preview-offer-card'));
  assert.equal(before.offersStats.closest('.banner-preview-offer-card'),before.offersChart.closest('.banner-preview-offer-card'));
  assert.equal(before.offersChart.firstElementChild,originalOfferSvg);
  assert.equal(doc.getElementById('banner-offers-history-title'),null,'no duplicate title is generated');
  assert.equal(offersSection.getAttribute('aria-labelledby'),originalOffersLabel);
  assert.equal(w.getComputedStyle(before.offersStats).gridTemplateColumns,'repeat(2,minmax(0,1fr))','four source stats form2x2');const bid=w.getComputedStyle(before.offersStats.querySelector('[data-offer-side=buy]')),ask=w.getComputedStyle(before.offersStats.querySelector('[data-offer-side=sell]'));assert.equal(bid.gridColumn,'1');assert.equal(bid.gridRow,'1');assert.equal(ask.gridColumn,'1');assert.equal(ask.gridRow,'2','buyers bid above sellers ask');
  assert.equal(before.offersStats.children.length,4);
  assert(doc.querySelector('.banner-offers-note').textContent.includes('Offers cannot change the calculated goods-based NX benchmark'));
  before.offersRange.click();before.offersChart.click();assert.equal(offerWindowClicks,1);assert.equal(offerChartClicks,1);
  const eventCount=calls.events.length;choose('offers');assert.equal(calls.events.length,eventCount,'reselecting active offers needs no redraw');
  swap.click();assert.equal(doc.body.dataset.bannerOrder,'rate-first');assert.equal(before.hero.firstElementChild,before.copy);
  assert(before.copy.nextElementSibling.contains(before.offersHeading),'rate/evidence order applies to offers too');
  swap.click();assert.equal(doc.body.dataset.bannerOrder,'chart-first');
  before.offersStats.querySelector('strong').textContent='1:19.7';
  const savedOffers=fixture({preferences});assert.equal(savedOffers.doc.body.dataset.bannerLayout,'offers');assert(savedOffers.before.hero.contains(savedOffers.before.offersStats));savedOffers.dom.window.close();
  choose('chart');
  assert.equal(before.offersHeading.parentElement,offersSection);assert.equal(before.offersStats.parentElement,offersSection);
  assert.equal(before.offersStats.querySelector('strong').textContent,'1:19.7','new source values survive restoration');
  assert.equal(offersSection.getAttribute('aria-labelledby'),originalOffersLabel);assert.equal(doc.getElementById('banner-offers-history-title'),null);
  assert.equal(offersSection.parentNode,originalOffersParent);assert.equal(offersSection.nextSibling,originalOffersNext,'whole card restores original position');
  assert(before.hero.contains(before.main));assert.equal(before.offersChart.firstElementChild,originalOfferSvg);
  choose('original');assert.equal(doc.querySelector('.banner-offers-note'),null);
  choose('chart');
  assert.equal(swap.disabled, false);
  swap.click();
  assert.equal(doc.body.dataset.bannerOrder, 'rate-first');
  assert.equal(swap.getAttribute('aria-pressed'), 'true');
  assert.equal(before.hero.firstElementChild, before.copy, 'reading and keyboard order follows rate-first layout');
  assert.equal(before.copy.nextElementSibling.firstElementChild, history);
  assert.equal(doc.getElementById('main-chart'), before.main, 'swap retains original chart');
  assert.equal(before.main.querySelector('.chart-inspector-toggle'), follow);
  choose('original');
  assert.equal(history.parentNode, originalParent);
  assert.equal(swap.disabled, true);
  choose('chart');
  const restored = fixture({ preferences });
  assert.equal(restored.doc.body.dataset.bannerOrder, 'rate-first');
  assert.equal(restored.before.hero.firstElementChild, restored.before.copy);
  assert.equal(restored.doc.body.dataset.bannerLayout, 'chart');
  assert(restored.before.hero.contains(restored.before.main));
  restored.dom.window.close();
  w.eval(script); w.eval(inspector);
  await flush();
  assert.equal(doc.querySelectorAll('#banner-layout-options').length, 1);
  assert.equal(doc.querySelectorAll('.banner-preview-chart-slot').length, 1);
  assert.equal(before.main.querySelectorAll('.chart-inspector-ui').length, 1);
  const ids = [...doc.querySelectorAll('[id]')].map(element => element.id);
  assert.equal(new Set(ids).size, ids.length, 'moving a chart never duplicates IDs');
  assert.equal(calls.network, 0);
  f.dom.window.close();
  for (const value of ['invalid', '', '__proto__']) {
    const invalid = fixture({ preferences: new Map([[key, value]]) });
    assert.equal(invalid.doc.body.dataset.bannerLayout, 'original');
    assert.equal(invalid.before.hero.contains(invalid.before.main), false);
    invalid.dom.window.close();
  }
  const blocked = fixture({ blocked: true, legacy: true });
  blocked.doc.querySelector('[data-banner-layout-choice="chart"]').click();
  assert(blocked.before.hero.contains(blocked.before.main));
  blocked.doc.getElementById('banner-order-toggle').click();
  assert.equal(blocked.doc.body.dataset.bannerOrder, 'rate-first');
  blocked.doc.querySelector('[data-banner-layout-choice="original"]').click();
  assert.equal(blocked.before.hero.contains(blocked.before.main), false);
  blocked.doc.querySelector('[data-banner-layout-choice="offers"]').click();
  assert(blocked.before.hero.contains(blocked.before.offersHeading));assert.equal(blocked.before.hero.contains(blocked.before.main),false);
  blocked.doc.querySelector('[data-banner-layout-choice="original"]').click();assert.equal(blocked.before.offersHeading.parentElement.id,'smega-section');
  assert.equal(blocked.calls.network, 0);
  blocked.dom.window.close();
  const missing = fixture({ missing: true });
  assert.equal(missing.doc.getElementById('banner-layout-options'), null);
  assert.equal(missing.before.hero.contains(missing.before.main), false);
  missing.dom.window.close();
  const noOffers=fixture({missingOffers:true,preferences:new Map([[key,'offers']])});assert.equal(noOffers.doc.body.dataset.bannerLayout,'original');assert(noOffers.doc.querySelector('[data-banner-layout-choice="offers"]').disabled);assert.equal(noOffers.before.hero.contains(noOffers.before.main),false);noOffers.dom.window.close();
  // Real app integration: its existing layout event redraws the original chart
  // at the new width, without a new source request or a copied clock/summary.
  const liveDom=new JSDOM(page,{url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true}),lw=liveDom.window,ld=lw.document;
  try{
    const saved=JSON.parse(fs.readFileSync(path.join(web,'../dist/data.json'),'utf8')),requests=[];
    lw.scrollTo=()=>{};lw.HTMLElement.prototype.scrollIntoView=function(){};lw.HTMLDialogElement.prototype.showModal=function(){this.open=true;};lw.HTMLDialogElement.prototype.close=function(){this.open=false;};lw.AbortSignal.timeout=()=>undefined;
    lw.fetch=async url=>{requests.push(url);assert(['version.json','data-0123456789abcdef.json'].includes(url));return{ok:true,json:async()=>url==='version.json'?{version:'fixture',data:'data-0123456789abcdef.json'}:saved};};
    const sourceChart=ld.getElementById('smega-offer-chart'),sourceStats=ld.getElementById('smega-stats'),sourceHeading=ld.querySelector('#smega-section>.section-heading');
    Object.defineProperty(sourceChart,'clientWidth',{get(){return sourceChart.closest('.rate-hero')?360:1100;},configurable:true});
    lw.eval(fs.readFileSync(path.join(web,'community.js'),'utf8'));lw.eval(fs.readFileSync(path.join(web,'app.js'),'utf8'));
    const end=Date.now()+2000;while(!sourceChart.querySelector('svg')&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,5));assert(sourceChart.querySelector('svg'));
    lw.eval(script);const card=ld.getElementById('smega-section'),initialStats=sourceStats.textContent,initialClock=ld.getElementById('smega-point-note').textContent,initialWideWidth=Number(sourceChart.querySelector('svg').getAttribute('viewBox').split(' ')[2]);
    ld.querySelector('[data-banner-layout-choice="offers"]').click();
    assert(card.closest('.rate-hero'));assert.equal(ld.getElementById('smega-offer-chart'),sourceChart);assert.equal(ld.getElementById('smega-stats'),sourceStats);assert.equal(card.querySelector(':scope>.section-heading'),sourceHeading);
    assert.equal(Number(sourceChart.querySelector('svg').getAttribute('viewBox').split(' ')[2]),332,'offer graph redraws at its real banner width');
    const bannerValues=[...sourceChart.querySelectorAll('circle[data-chart-value]')].map(point=>[point.dataset.chartDate,point.dataset.chartValue]);
    assert.equal(sourceStats.textContent,initialStats);assert.equal(ld.getElementById('smega-point-note').textContent,initialClock);assert.equal(ld.querySelectorAll('#smega-title').length,1);assert.equal(ld.querySelectorAll('#smega-point-note').length,1);
    ld.getElementById('banner-order-toggle').click();assert(card.closest('.rate-hero'));assert.equal(sourceStats.textContent,initialStats);
    ld.querySelector('[data-banner-layout-choice="original"]').click();assert.equal(card.parentElement.id,'view-index');assert.equal(Number(sourceChart.querySelector('svg').getAttribute('viewBox').split(' ')[2]),initialWideWidth,'whole-card restore redraws the original wide graph');assert(initialWideWidth>332);
    assert.deepEqual([...sourceChart.querySelectorAll('circle[data-chart-value]')].map(point=>[point.dataset.chartDate,point.dataset.chartValue]),bannerValues);assert.equal(sourceStats.textContent,initialStats);assert.equal(ld.getElementById('smega-point-note').textContent,initialClock);assert.equal(requests.length,2,'layout does not fetch upstream or another snapshot');
  }finally{lw.close();}
  console.log('PASS: one original offer card keeps heading/4stats/chart/clocks together across three modes, whole-card restoration and rate/evidence swap, responsive bounds, preserved events/data/inspectors, saved/blocked preferences and no duplicates/network', JSON.stringify(widthBounds));
})().catch(error => { console.error(error); process.exitCode = 1; });
