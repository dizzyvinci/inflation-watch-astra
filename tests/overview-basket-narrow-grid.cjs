const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),css=fs.readFileSync(path.join(root,'web/overview-basket.css'),'utf8');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM('<!doctype html><style></style><section id="overview-basket"><div class="tiles"><button class="item-tile">Original large text</button><button class="item-tile">Original second tile</button></div></section><div id="method-tiles" class="tiles">Original Method grid</div>',{virtualConsole:vc});
try{
  const doc=dom.window.document;doc.querySelector('style').textContent=css;
  const media=[...doc.styleSheets[0].cssRules].filter(rule=>rule.conditionText?.replace(/\s/g,'')==='(max-width:360px)');
  assert.equal(media.length,1,'one narrow basket override');
  const rules=[...media[0].cssRules];assert.equal(rules.length,1);
  const rule=rules[0];assert.equal(rule.selectorText,'#overview-basket .tiles');
  assert.equal(rule.style.length,1,'no font, sprite, overflow clipping or other presentation overrides');
  assert.equal(rule.style[0],'grid-template-columns');assert.equal(rule.style.getPropertyValue('grid-template-columns'),'minmax(0,1fr)');
  assert.equal(rule.style.getPropertyPriority('grid-template-columns'),'','no important override');
  assert.equal(doc.querySelectorAll(rule.selectorText).length,1);assert(!doc.getElementById('method-tiles').matches(rule.selectorText),'Method and other tile grids remain out of scope');
  // A breakpoint/declaration test, not browser layout: JSDOM does not measure grid tracks.
  const limit=Number(/max-width:\s*(\d+)px/.exec(media[0].conditionText)[1]);
  for(const width of [320,360,375,700,768,1024,1265,1280,1500,1501,1870])assert.equal(width<=limit,[320,360].includes(width),`narrow-only condition at ${width}`);
  const minContent=139.8,gap=10,available=244;
  assert(minContent*2+gap>available,'two automatic content minimums can exceed this narrow section interior');
  assert(available>minContent,'one full-width track admits the observed tile minimum without reducing font size');
  assert.deepEqual(errors,[]);assert.doesNotMatch(css,/@import|https?:\/\/|url\(/);
  console.log('PASS: one <=360px Overview-only minmax(0,1fr) track; other tile grids/fonts/sprites/controls untouched; CSSOM/breakpoint only, native geometry unverified');
}finally{dom.window.close();}
