const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const script=fs.readFileSync(path.join(__dirname,'../web/panel-size-preview.js'),'utf8');
for(const pref of [null,'compact','invalid']){
 const dom=new JSDOM('<article class="panel"><div id="movers"><div class="mover">Original row</div></div></article>',{url:'https://inflation.gg/',runScripts:'outside-only'}),w=dom.window;
 if(pref)w.localStorage.setItem('astra-mover-panel-size',pref);const row=w.document.querySelector('.mover');w.eval(script);
 assert.equal(w.document.querySelector('.panel').dataset.panelSize,pref==='compact'?'compact':'full');
 w.document.querySelector('[data-panel-size-choice="compact"]').click();assert.equal(w.localStorage.getItem('astra-mover-panel-size'),'compact');assert.equal(w.document.querySelector('.mover'),row);
 w.eval(script);assert.equal(w.document.querySelectorAll('#mover-size-options').length,1);dom.window.close();
}
console.log('PASS: independent compact movers panel, saved/invalid preferences and original row identity');
