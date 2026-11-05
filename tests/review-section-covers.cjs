const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'../web/review-section-covers.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../web/review-section-covers.css'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(review=true){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<body data-viewer-preview="on" data-preview-controls-locked="true"><section id="view-method"><h1 id="method-title">Methodology</h1><div id="method-weights">Preserved formula</div></section><footer'+(review?' data-footer-privacy-lock="on"':'')+'></footer></body>',{url:'https://inflation.gg/#method',runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window,d=w.document;let network=0,storage=0;
 w.fetch=()=>{network++;throw Error('No network')};Object.defineProperty(w,'localStorage',{value:{getItem(){storage++;throw Error('No preference reads')},setItem(){storage++;throw Error('No preference writes')}}});
 const style=d.createElement('style');style.textContent=css;d.head.append(style);
 w.eval(script);return{dom,w,d,errors,counts:()=>({network,storage})};
}
(async()=>{
 const f=fixture();try{
  const view=f.d.getElementById('view-method'),formula=f.d.getElementById('method-weights'),cover=view.querySelector('.review-section-cover'),button=cover.querySelector('button');
  assert.equal(cover.querySelector('h2').textContent,'[ Being written up ]');assert(view.classList.contains('review-section-covered'));assert.equal(f.w.getComputedStyle(formula).display,'none');assert.equal(f.w.getComputedStyle(cover.querySelector('.review-cover-controls')).display,'none');
  button.click();assert(view.classList.contains('review-section-covered'),'locked synthetic clicks cannot reveal the draft');
  delete f.d.body.dataset.previewControlsLocked;delete f.d.body.dataset.viewerPreview;button.click();assert(!view.classList.contains('review-section-covered'));assert.equal(f.d.getElementById('method-weights'),formula,'the actual formula node is preserved');assert.equal(button.getAttribute('aria-pressed'),'true');
  f.d.body.dataset.viewerPreview='on';button.click();assert.equal(button.getAttribute('aria-pressed'),'true','hidden design controls ignore synthetic viewer-mode clicks');
  f.d.body.dataset.previewControlsLocked='true';await tick();assert(view.classList.contains('review-section-covered'));assert.equal(button.getAttribute('aria-pressed'),'false');
  const compare=f.d.createElement('section');compare.id='view-market-comparison';compare.innerHTML='<h1 id="market-comparison-title">Compare</h1><table><tbody><tr><td>Preserved comparison</td></tr></tbody></table>';f.d.body.append(compare);const table=compare.querySelector('table');await tick();assert(compare.classList.contains('review-section-covered'),'late-created Compare gets the same review cover');assert.equal(compare.querySelector('table'),table);assert.equal(f.w.getComputedStyle(table).display,'none');
  f.w.eval(script);await tick();assert.equal(f.d.querySelectorAll('.review-section-cover').length,2,'rerun cannot duplicate covers');assert.deepEqual(f.counts(),{network:0,storage:0});assert.deepEqual(f.errors,[]);
 }finally{f.dom.window.close()}
 const normal=fixture(false);try{assert.equal(normal.d.querySelector('.review-section-cover'),null);assert.equal(normal.d.querySelector('#method-weights').textContent,'Preserved formula');assert.deepEqual(normal.counts(),{network:0,storage:0})}finally{normal.dom.window.close()}
 console.log('PASS review covers: Methodology and late Compare placeholders, original nodes/anchors retained, password-owner reveal, viewer/lock behavior, idempotence and zero data/storage requests.');
})().catch(error=>{console.error(error);process.exitCode=1});
