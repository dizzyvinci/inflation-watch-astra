const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),css=fs.readFileSync(path.join(root,'web/category-reference-preview.css'),'utf8'),js=fs.readFileSync(path.join(root,'web/category-reference-preview.js'),'utf8');
const expected=[['frozen','Official frozen reference week'],['previous7','Previous 7-day average · preview'],['previous3','Previous 3-day average · preview'],['previous-day','Prior complete source day · preview']];
for(const saved of ['frozen','previous7']){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<!doctype html><style></style><section id="category-section"><div id="category-cards"></div><div class="category-gauge-legend">Original reference</div></section>',{url:'https://inflation.gg/',runScripts:'outside-only',virtualConsole:vc});
 try{
  const w=dom.window,d=w.document;let requests=0;
  w.fetch=()=>{requests++;throw Error('No HTTP');};w.XMLHttpRequest=function(){requests++;throw Error('No XHR');};
  w.localStorage.setItem('astra-category-reference-v1',saved);w.renderCategoryCards=()=>{};d.querySelector('style').textContent=css;w.eval(js);
  const select=d.getElementById('category-reference-select'),label=select.closest('label');
  assert.equal(select.value,saved);assert.equal(select.closest('#category-reference-preview').dataset.previewControls,'true');
  assert.deepEqual([...select.options].map(o=>[o.value,o.textContent]),expected,'no shortened/hidden/removed options');
  assert(label.textContent.startsWith('Compare category prices with'));assert(select.getAttribute('aria-describedby').split(' ').every(id=>d.getElementById(id)));
  const allRules=[...d.styleSheets[0].cssRules],media=allRules.filter(r=>r.conditionText?.replace(/\s/g,'')==='(max-width:360px)');assert.equal(media.length,1);
  const rules=[...media[0].cssRules];assert.equal(rules.length,2);
  const [grid,control]=rules;assert.equal(grid.selectorText,'.category-reference-preview label');assert(label.matches(grid.selectorText));
  assert.equal(control.selectorText,'#category-reference-select');assert(select.matches(control.selectorText));
  const declared=rule=>Object.fromEntries(Array.from({length:rule.style.length},(_,i)=>[rule.style[i],rule.style.getPropertyValue(rule.style[i])]));
  assert.deepEqual(declared(grid),{'width':'100%','min-width':'0px','grid-template-columns':'minmax(0,1fr)'});
  assert.deepEqual(declared(control),{'width':'100%','min-width':'0px'});
  assert(![...rules].some(r=>/font|display|visibility|overflow/.test(r.style.cssText)),'no font reduction, hidden control or overflow mask');
  for(const width of [320,360,375,700,768,1024,1265,1280,1500,1870])assert.equal(width<=360,[320,360].includes(width),'narrow breakpoint only');
  const mobile=allRules.find(r=>r.conditionText?.replace(/\s/g,'')==='(max-width:700px)');
  const mobileSelect=[...mobile.cssRules].find(r=>r.selectorText==='.category-reference-preview select');assert.equal(mobileSelect.style.getPropertyValue('font-size'),'16px','original mobile font unchanged');
  select.focus();assert.equal(d.activeElement,select);
  for(const [value]of expected){select.value=value;select.dispatchEvent(new w.Event('change'));assert.equal(select.value,value);assert.equal(w.localStorage.getItem('astra-category-reference-v1'),value);}
  assert.equal(requests,0);assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
}
console.log('PASS: real category control preserves all options, labels, descriptions, focus, saved choices and 16px mobile font; <=360px grid/select sizing only; CSSOM/DOM not native geometry');
