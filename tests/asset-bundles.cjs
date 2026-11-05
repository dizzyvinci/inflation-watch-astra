// Exercise actual external defer loading, not eval of a subset of modules.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {JSDOM,requestInterceptor,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'astra-ui-bundle-test-'));
const source=fs.readFileSync(path.join(root,'web/index.html'),'utf8'),report=JSON.parse(fs.readFileSync(path.join(root,'dist/data.json'),'utf8')),unchanged=JSON.stringify(report);
let fullIndex;
const scripts=[...source.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(m=>m[1]);
const styles=[...source.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m=>m[1]);
for(const name of ['index.html',...scripts,...styles])fs.copyFileSync(path.join(root,'web',name),path.join(temporary,name));
const run=spawnSync(process.env.PYTHON||'python',[path.join(root,'asset_bundles.py'),'--dist',temporary,'--enable'],{encoding:'utf8'});
assert.equal(run.status,0,run.stderr);const manifest=JSON.parse(fs.readFileSync(path.join(temporary,'ui-bundles.json'),'utf8')),bundled=fs.readFileSync(path.join(temporary,'index.html'),'utf8');
assert.equal(manifest.htmlSha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(temporary,'index.html'))).digest('hex'));
assert.deepEqual([...manifest.js[0].inputs.map(i=>i.file),'app.js',...manifest.js[1].inputs.map(i=>i.file)],scripts);assert.deepEqual(manifest.scriptOrder,[manifest.js[0].file,manifest.preservedScripts[0].file,manifest.js[1].file]);assert.equal(manifest.preservedScripts[0].sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(temporary,'app.js'))).digest('hex'));assert.deepEqual(manifest.css.inputs.map(i=>i.file),styles);
assert.equal([...bundled.matchAll(/<script /g)].length,3);assert.equal([...bundled.matchAll(/rel="stylesheet"/g)].length,1);
for(const filename of manifest.scriptOrder){const syntax=spawnSync(process.execPath,['--check',path.join(temporary,filename)],{encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr);}
const hash=body=>crypto.createHash('sha256').update(body).digest('hex');
assert.equal(manifest.preservedScripts[0].source,'app.js');assert.deepEqual(fs.readFileSync(path.join(temporary,manifest.preservedScripts[0].file)),fs.readFileSync(path.join(temporary,'app.js')));for(const record of [...manifest.js,manifest.css,...manifest.preservedScripts])assert.equal(hash(fs.readFileSync(path.join(temporary,record.file))),record.sha256);
const css=fs.readFileSync(path.join(temporary,manifest.css.file),'utf8');
for(const name of styles){const original=fs.readFileSync(path.join(root,'web',name),'utf8');for(const match of original.matchAll(/url\([^)]*\)/g))assert(css.includes(match[0]),'Relative asset/font URL stays unchanged: '+match[0]);}

async function open(html,{immediate=false,activeManifest=manifest,appFailure=false,optionalFailure=false}={}){
 const calls={resources:[],fetch:[],provider:0,xhr:0,beacon:0,moduleFailures:[]},errors=[],vc=new VirtualConsole();
 vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',(...args)=>errors.push(args.join(' ')));
 const resources={interceptors:[requestInterceptor(request=>{const u=new URL(request.url);assert.equal(u.origin,'https://inflation.gg');assert(!u.search&&!u.hash);const name=u.pathname.slice(1);assert(scripts.includes(name)||styles.includes(name)||[...activeManifest.js.map(entry=>entry.file),activeManifest.css.file,...activeManifest.preservedScripts.map(entry=>entry.file)].includes(name),'Unapproved resource: '+name);calls.resources.push(name);return new Response(fs.readFileSync(path.join(temporary,name)),{headers:{'Content-Type':name.endsWith('.css')?'text/css':'application/javascript'}});})],dispatcher:{dispatch(){throw Error('No real network transport');}}};
 const dom=new JSDOM(html,{url:'https://inflation.gg/',runScripts:'dangerously',resources,pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.localStorage.setItem('inflation-optional-analytics-consent-v1','off');w.document.addEventListener('astrauimoduleerror',event=>calls.moduleFailures.push(event.detail));
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  w.AbortSignal.timeout=()=>undefined;
  w.fetch=async relative=>{const url=new URL(relative,w.location.href);if(url.origin!=='https://inflation.gg'){calls.provider++;throw Error('No source-provider calls');}calls.fetch.push(url.pathname);assert(['/version.json','/data-0123456789abcdef.json','/market-index.json'].includes(url.pathname),'Unexpected fetch: '+url.pathname);if(!immediate)await new Promise(resolve=>setTimeout(resolve,0));return{ok:true,status:200,headers:{get:name=>name.toLowerCase()==='content-type'?'application/json':null},text:async()=>JSON.stringify(fullIndex),json:async()=>url.pathname==='/version.json'?{version:'fixture',data:'data-0123456789abcdef.json'}:JSON.parse(unchanged)};};
  w.XMLHttpRequest=function(){calls.xhr++;throw Error('No XHR');};w.navigator.sendBeacon=()=>{calls.beacon++;throw Error('No tracking');};
 }});
 const w=dom.window,doc=w.document;
 const until=async check=>{const deadline=Date.now()+6000;while(!check()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert(check(),'Bundled flow did not settle; '+errors.join('; '));};
 try{
  await until(()=>doc.readyState==='complete'&&w.AstraRollingBenchmark&&doc.getElementById('viewer-preview-enter')&&(appFailure||w.AstraGoodsNxBenchmark&&doc.querySelector('#category-cards .category-card')&&doc.getElementById('price-check-header-query')));
  await new Promise(resolve=>setTimeout(resolve,50));
  const click=selector=>{const node=doc.querySelector(selector);assert(node,selector);node.click();return node;};
  if(appFailure){assert(w.AstraDatePresentation,'Last after-app module initialized despite app failure');assert.equal(errors.length,1,'Only the deliberately unguarded app reports an exception');assert.equal(calls.fetch.length,0);assert.equal(calls.provider+calls.xhr+calls.beacon,0);assert.deepEqual(calls.moduleFailures,[]);return{appFailureIsolated:true,resources:calls.resources.length,scripts:calls.resources.filter(n=>n.endsWith('.js')).length,styles:calls.resources.filter(n=>n.endsWith('.css')).length};}
  const model=w.AstraRollingBenchmark.calculate(report);assert(model.available,model.reason);assert.equal(doc.getElementById('main-rate').textContent,model.rate.toFixed(2));
  assert.equal(doc.querySelectorAll('#category-cards .category-card').length,report.categories.length);
  assert(doc.querySelector('#category-cards .category-main img').getAttribute('src').startsWith('assets/'));
  assert.equal(doc.querySelectorAll('#basket-table tbody tr').length,50);assert.equal(doc.querySelectorAll('#cash-table tbody tr').length,29);
  assert.equal(doc.getElementById('smega-offer-chart').closest('#smega-section')?.id,'smega-section');
  // All controls execute inside the actual combined scope and retain listeners.
  w.AstraRollingBenchmark.setWindowDays(3);assert.equal(doc.getElementById('main-rate').textContent,w.AstraRollingBenchmark.calculate(report).rate.toFixed(2));
  w.AstraRollingBenchmark.setMode('fixed');assert.equal(doc.getElementById('main-rate').textContent,w.AstraRollingBenchmark.frozenPoint(report).rate.toFixed(2));
  w.AstraRollingBenchmark.setWindowDays(7);w.AstraRollingBenchmark.setMode('rolling');
  click('button[data-scenery-mode="classic"]');assert.equal(doc.body.dataset.sceneryMode,'classic');click('button[data-scenery-mode="banner"]');assert.equal(doc.body.dataset.sceneryMode,'banner');
  const viewer=doc.querySelector('#viewer-preview-enter, [data-viewer-preview-enter]')||[...doc.querySelectorAll('button')].find(b=>b.textContent==='Viewer preview');assert(viewer);viewer.focus();viewer.click();assert.equal(doc.body.dataset.viewerPreview,'on');doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(doc.body.dataset.viewerPreview,undefined);assert.equal(doc.activeElement,viewer);
  const item=report.rows[0],query=doc.getElementById('price-check-header-query');query.focus();query.value=item.name;query.dispatchEvent(new w.Event('input',{bubbles:true}));assert(doc.querySelector('.price-check-suggestions [role="option"] img'));query.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));query.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await until(()=>w.location.hash==='#item/'+item.slug);assert.equal(doc.getElementById('view-item').hidden,false);assert(doc.getElementById('item-page-detail').textContent.includes(item.name));
  w.location.hash='#method-basket-size';w.dispatchEvent(new w.Event('hashchange'));await until(()=>!doc.getElementById('view-method').hidden);assert(doc.getElementById('method-basket-size'));
  w.location.hash='#privacy';w.dispatchEvent(new w.Event('hashchange'));await until(()=>!doc.getElementById('view-privacy').hidden);assert(doc.querySelector('#view-privacy .privacy-choice-options'));assert.equal(doc.querySelectorAll('script[src^="https://static.cloudflareinsights.com/"]').length,0);
  const ids=[...doc.querySelectorAll('[id]')].map(n=>n.id);assert.equal(new Set(ids).size,ids.length,'No duplicated IDs after bundled module initialization');
  assert.deepEqual(calls.fetch,['/version.json','/data-0123456789abcdef.json','/market-index.json']);assert.equal(calls.provider+calls.xhr+calls.beacon,0);assert.equal(JSON.stringify(report),unchanged);
  assert.deepEqual(errors,[]);assert.equal(calls.moduleFailures.length,optionalFailure?1:0);if(optionalFailure){assert.equal(JSON.stringify(calls.moduleFailures),JSON.stringify([{module:'author-portrait.js',status:'initialization_failed'}]));assert(!JSON.stringify(calls.moduleFailures).includes('synthetic-private-diagnostic'));}
  return{resources:calls.resources.length,scripts:calls.resources.filter(n=>n.endsWith('.js')).length,styles:calls.resources.filter(n=>n.endsWith('.css')).length,rate:doc.getElementById('main-rate').textContent,categories:doc.querySelectorAll('#category-cards .category-card').length,optionalFailureIsolated:optionalFailure};
 }finally{w.close();}
}
(async()=>{try{
 fullIndex=await(await import('../ops/market-catalog.mjs')).buildIndex(JSON.parse(fs.readFileSync(path.join(root,'cache/market.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(root,'catalog-identities-v1.json'),'utf8')));
 const original=await open(source),combined=await open(bundled),immediate=await open(bundled,{immediate:true});
 assert.equal(original.scripts,scripts.length);assert.equal(original.styles,styles.length);assert.equal(combined.scripts,3);assert.equal(combined.styles,1);assert.equal(combined.rate,original.rate);assert.equal(immediate.rate,original.rate);
 function generate(){fs.writeFileSync(path.join(temporary,'index.html'),source);const result=spawnSync(process.env.PYTHON||'python',[path.join(root,'asset_bundles.py'),'--dist',temporary,'--enable'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return{html:fs.readFileSync(path.join(temporary,'index.html'),'utf8'),activeManifest:JSON.parse(fs.readFileSync(path.join(temporary,'ui-bundles.json'),'utf8'))};}
 fs.appendFileSync(path.join(temporary,'app.js'),'\n// next reviewed app version\n');let nextRelease=generate();assert.notEqual(nextRelease.activeManifest.preservedScripts[0].file,manifest.preservedScripts[0].file);const cachedOldHtml=await open(bundled);assert.equal(cachedOldHtml.rate,original.rate);fs.copyFileSync(path.join(root,'web/app.js'),path.join(temporary,'app.js'));
 fs.writeFileSync(path.join(temporary,'author-portrait.js'),"(() => { 'use strict'; throw new Error('synthetic-private-diagnostic'); })();");
 let generated=generate();const optionalFailure=await open(generated.html,{activeManifest:generated.activeManifest,optionalFailure:true});assert.equal(optionalFailure.rate,original.rate);
 fs.copyFileSync(path.join(root,'web/author-portrait.js'),path.join(temporary,'author-portrait.js'));
 fs.writeFileSync(path.join(temporary,'app.js'),"'use strict'; throw new Error('synthetic-app-failure');");
 generated=generate();const appFailure=await open(generated.html,{activeManifest:generated.activeManifest,appFailure:true});assert.equal(appFailure.scripts,3);
 console.log(JSON.stringify({result:'PASS',original,bundled:combined,immediateSnapshot:immediate,cachedOldHtml,optionalFailure,appFailure,sourceCalls:0,originalFilesRetained:true,flows:'ordered guarded IIFE bundles + standalone app, actual CSS/font/image URLs, rolling/fixed/3d, scenery, viewer/Escape, sprite autocomplete/item route, Why50/privacy routes, unique IDs/no optional tracking'}));
 }finally{assert.equal(path.dirname(path.resolve(temporary)),path.resolve(os.tmpdir()));assert(path.basename(temporary).startsWith('astra-ui-bundle-test-'));fs.rmSync(temporary,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
