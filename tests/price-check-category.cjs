// Real accepted collection + simulated own-host index. No provider requests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const staged=read('web/price-check.js');
const css=read('web/price-check.css');
const clone=value=>JSON.parse(JSON.stringify(value));
const until=async predicate=>{for(let i=0;i<200&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,5));assert(predicate(),'Mock own-site catalog did not settle');};

(async()=>{
  const {createMarketCatalog}=await import('../ops/market-catalog.mjs');
  const {portableHash,HASH_METHOD}=await import('../ops/portable-hash.mjs');
  const feed=JSON.parse(read('cache/market.json'));
  const selected=/import catalogIdentities from '\.\.\/([^']+)'/.exec(read('ops/worker.mjs'))[1];
  const identities=JSON.parse(read(selected)),prepared=await createMarketCatalog(feed,identities),index=prepared.buildIndex();
  const saved=JSON.parse(read('dist/data.json')),report=clone(saved);
  // Test fixture uses the current pure projection when a pending local build
  // still has the prior identity revision. No source/price values are changed.
  report.marketCatalog={schemaVersion:1,hashMethod:HASH_METHOD,catalogHash:index.catalogHash,sourceProjectionHash:index.sourceProjectionHash,
    sourceUpdatedAt:index.sourceUpdatedAt,itemCount:index.itemCount,identityVersion:await portableHash({hashMethod:HASH_METHOD,identityMap:identities})};
  const original=JSON.stringify(report),errors=[],calls=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<!doctype html><header class="masthead"><a class="brand" href="#index">unchanged brand</a><div class="header-status">unchanged clock</div></header><div class="nav-wrap"><nav><a href="#index">Overview</a></nav></div><main id="content"></main><footer>Unchanged footer</footer>',{url:'https://inflation.gg/#price-check',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window,d=w.document;
  w.Response=Response;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.AbortSignal=AbortSignal;
  w.HTMLElement.prototype.scrollIntoView=function(){};
  Object.defineProperty(w,'localStorage',{get(){throw Error('No storage for filters');}});
  w.fetch=async url=>{calls.push(String(url));assert.equal(String(url),'/market-index.json','Only the existing own-site index request is permitted');return new Response(JSON.stringify(index),{headers:{'Content-Type':'application/json'}});};
  w.XMLHttpRequest=function(){throw Error('No source requests');};w.navigator.sendBeacon=()=>{throw Error('No analytics');};
  d.addEventListener('astramarkethighlightsready',()=>d.dispatchEvent(new w.CustomEvent('astramarketsnapshot',{detail:report})));
  w.eval(read('web/full-market-client.js'));w.eval(staged);
  try{
    await until(()=>d.querySelector('.price-check-coverage').textContent.includes(index.itemCount+' provider items'));
    const field=d.getElementById('price-check-category'),input=d.getElementById('price-check-query');
    assert(field);assert.equal(field.value,'all');assert.equal(field.getAttribute('aria-describedby'),'price-check-category-note');
    assert.equal(d.querySelectorAll('#price-check-category').length,1);
    const counts=new Map();for(const row of index.rows)counts.set(row.category,(counts.get(row.category)||0)+1);
    assert.equal(counts.size,7);for(const [category,count]of counts)assert([...field.options].some(option=>option.value==='category:'+category&&option.textContent===category+' · '+count));
    const change=value=>{field.value=value;field.dispatchEvent(new w.Event('change',{bubbles:true}));};
    const rows=()=>[...d.querySelectorAll('.price-check-table tr[data-price-key]')];
    const result=()=>d.getElementById('price-check-results').textContent;
    const requestsBefore=calls.length;
    change('category:Equips');assert(result().includes('of '+counts.get('Equips')+' matches'));assert.equal(rows().length,25);assert(rows().every(row=>row.dataset.priceCategory==='Equips'));
    d.querySelector('[data-price-page="next"]').click();assert(result().startsWith('26–50'));
    change('category:Stars');assert(result().startsWith('1–'+counts.get('Stars')+' of '+counts.get('Stars')));assert.equal(rows().length,counts.get('Stars'));assert(rows().every(row=>row.dataset.priceCategory==='Stars'));assert(d.querySelector('[data-price-page="next"]').disabled);
    input.value='Teddy';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(rows().length,0,'Query intersects selected category, it does not override it');
    assert.equal(field.value,'category:Stars');d.querySelector('[data-price-clear]').click();assert.equal(field.value,'all');assert.equal(input.value,'');
    change('unknown');assert(rows().length>0);assert(rows().every(row=>row.dataset.priceCategory==='unknown'));assert(result().includes('50 matches'),'Supplemental-only collection records retain unknown provider category');
    assert(!d.querySelector('[data-price-clear]').disabled,'Clear resets a category filter even with an empty query');
    change('category:Equips');const header=d.getElementById('price-check-header-query');header.focus();header.value='Teddy';header.dispatchEvent(new w.Event('input',{bubbles:true}));
    assert([...d.querySelectorAll('.price-check-suggestion')].some(option=>option.textContent.includes('Teddy')),'Header autocomplete still searches all source kinds');
    d.querySelector('[data-price-clear]').click();change('category:Scrolls');
    d.querySelector('[data-price-sort="price"]').click();let prices=rows().map(row=>row.cells[1].textContent).filter(value=>value!=='Unknown').map(value=>Number(value.replaceAll(',','')));assert(prices.every((value,i)=>!i||prices[i-1]>=value));
    d.querySelector('[data-price-sort="price"]').click();assert.equal(field.value,'category:Scrolls');
    // Updates retain the current selection and intersect it with new evidence;
    // the temporary base-only state never silently resets user selection.
    d.dispatchEvent(new w.CustomEvent('astramarketsnapshot',{detail:report}));assert.equal(field.value,'category:Scrolls');
    await until(()=>result().includes('of '+counts.get('Scrolls')+' matches'));assert(rows().every(row=>row.dataset.priceCategory==='Scrolls'));
    assert.equal(calls.length,requestsBefore,'Category/query/sort/pagination/clear/snapshot actions add no network calls beyond the cached initial own-site index');
    assert.equal(JSON.stringify(report),original);assert.equal(d.querySelector('.brand').textContent,'unchanged brand');assert.equal(d.querySelector('.header-status').textContent,'unchanged clock');assert.equal(d.querySelector('footer').textContent,'Unchanged footer');
    assert(d.getElementById('price-check-category-note').textContent.includes('separately reported rolls do not make daily prices variant-specific'));
    assert.equal(d.querySelectorAll('select').length,1,'No phantom ATT/Crit/slots selector is exposed');assert.deepEqual(errors,[]);
    assert(!/@import|https?:\/\/|url\(/.test(css));assert(css.includes('.price-check-controls select:focus-visible'));
    console.log(JSON.stringify({status:'PASS category filter',providerItems:index.itemCount,sourceCategories:counts.size,categoryCounts:Object.fromEntries(counts),actualIndexRequestMocks:calls.length,extraRequestsFromFiltering:0,checks:'exact category/unknown; all-source autocomplete; query intersection; pagination reset; numeric sorting; clear; update retention; source immutability; no stat-slot inference'}));
  }finally{dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
