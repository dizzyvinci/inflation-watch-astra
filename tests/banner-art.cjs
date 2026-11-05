const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'../web/banner-art.js'),'utf8');
function fixture(saved,blocked=false){
 const dom=new JSDOM('<body data-scenery-mode="backdrop"><details id="display-options"></details><section id="rate-section"><div class="hero-art"><div class="market-scene"></div></div></section></body>',{url:'https://inflation.gg/',runScripts:'outside-only'});
 const w=dom.window;let calls=0;const values=new Map([['astra-banner-art',saved]]);
 Object.defineProperty(w,'localStorage',{value:{getItem:k=>{if(blocked)throw Error();return values.get(k)},setItem:(k,v)=>{if(blocked)throw Error();values.set(k,v)}}});
 w.fetch=()=>{calls++;throw Error('unexpected network')};w.eval(script);return {dom,w,doc:w.document,values,calls:()=>calls};
}
const f=fixture();assert.equal(f.doc.body.dataset.bannerArt,'zakum-set');
const art=f.doc.querySelector('.hero-art');
for(const value of ['free-market','henesys','zakum','zakum-set','lantern','paired']){
 f.doc.querySelector(`[data-banner-art-choice="${value}"]`).click();
 assert.equal(f.doc.body.dataset.bannerArt,value);assert.equal(f.values.get('astra-banner-art'),value);
 assert.equal(f.doc.body.dataset.sceneryMode,'backdrop','banner choice never changes backdrop');
 assert.equal(f.doc.querySelector('.hero-art'),art);
 assert.equal(f.doc.querySelectorAll('#banner-art-options button[aria-pressed="true"]').length,1);
}
f.w.eval(script);assert.equal(f.doc.querySelectorAll('#banner-art-options').length,1);assert.equal(f.calls(),0);f.dom.window.close();
for(const value of ['bad','__proto__']){const x=fixture(value);assert.equal(x.doc.body.dataset.bannerArt,'zakum-set');x.dom.window.close()}
const x=fixture('zakum');assert.equal(x.doc.body.dataset.bannerArt,'zakum');x.dom.window.close();
const b=fixture('zakum',true);b.doc.querySelector('[data-banner-art-choice="zakum"]').click();assert.equal(b.doc.body.dataset.bannerArt,'zakum');b.dom.window.close();
console.log('PASS: independent banner artwork, six choices, saved/invalid/blocked preferences, original DOM and no network');
