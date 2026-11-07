const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),test=require('node:test');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'web/price-check.js'),'utf8');
const row=(slug,name,price=300,id)=>({slug,name,price,canonicalId:id,priceDay:'2026-11-04',quantity:10,sourceSummary:{medianSale:price}});
const report=rows=>({sourceUpdatedAt:'2026-11-04T08:30:56Z',rows,cash:[],contextItems:[],spriteMap:{},latest:{nxRate:17}});
function fixture(rows){
 const errors=[],calls=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<header class="masthead"><a class="brand">Brand</a></header><div class="nav-wrap"><nav></nav></div><main id="content"></main><footer>Footer</footer>',{url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
 for(const method of ['fetch','XMLHttpRequest'])w[method]=()=>{calls.push(method);throw Error('No network');};w.navigator.sendBeacon=()=>{calls.push('beacon');throw Error('No network');};
 for(const name of ['localStorage','sessionStorage'])Object.defineProperty(w,name,{get(){throw Error('No storage');}});
 let value=report(rows);const publish=next=>{value=next;d.dispatchEvent(new w.CustomEvent('astramarketsnapshot',{detail:next}));};d.addEventListener('astramarkethighlightsready',()=>publish(value));w.eval(source);
 const field=d.getElementById('price-check-header-query'),pageField=d.getElementById('price-check-query');
 const type=(text,input=field)=>{input.focus();input.value=text;input.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const key=(text,input=d.activeElement)=>input.dispatchEvent(new w.KeyboardEvent('keydown',{key:text,bubbles:true,cancelable:true}));
 const options=()=>[...d.querySelectorAll('[data-price-suggestion]')],selected=()=>options().find(el=>el.getAttribute('aria-selected')==='true');
 const select=(keyValue)=>{for(let i=0;i<8&&selected()?.dataset.priceKey!==keyValue;i++)key('ArrowDown');assert.equal(selected()?.dataset.priceKey,keyValue);};
 return {w,d,field,pageField,publish,type,key,select,selected,options,close(){assert.deepEqual(calls,[]);assert.deepEqual(errors,[]);w.close();}};
}
test('same-query price refresh preserves key, binds new price/day and Enter route',()=>{const f=fixture([row('iron-ore','Iron Ore'),row('iron-sword','Iron Sword')]);try{
 f.type('Iron');f.select('iron-ore');const old=f.selected();const next=report([row('iron-ore','Iron Ore',987),row('iron-sword','Iron Sword',888)]);next.rows[0].priceDay='2026-11-06';f.publish(next);
 assert.equal(f.selected().dataset.priceKey,'iron-ore');assert.notEqual(f.selected(),old);assert.match(f.selected().textContent,/11-06-2026/);assert.equal(f.field.getAttribute('aria-activedescendant'),f.selected().id);assert.equal(f.d.querySelector('tr[data-price-key="iron-ore"]').cells[1].textContent,'987');f.key('Enter');assert.equal(f.w.location.hash,'#item/iron-ore');assert.equal(next.rows[0].price,987);
 }finally{f.close();}});
test('new matching cohort keeps selected newest row visible inside eight-option cap',()=>{const f=fixture([row('iron-z','Iron Z',1),row('iron-y','Iron Y',2)]);try{
 f.type('Iron');f.select('iron-z');let scrolled=0;f.w.HTMLElement.prototype.scrollIntoView=function(){if(this.dataset.priceKey==='iron-z')scrolled++;};
 f.publish(report([...Array.from({length:12},(_,i)=>row('iron-a-'+i,'Iron A '+i)),row('iron-z','Iron Z',999),row('iron-y','Iron Y')]));assert.equal(f.options().length,8);assert.equal(f.selected().dataset.priceKey,'iron-z');assert.equal(f.options().at(-1),f.selected());assert(scrolled>0);assert.match(f.d.querySelector('.price-check-suggestion-status').textContent,/14 collected matches/);f.key('Enter');assert.equal(f.w.location.hash,'#item/iron-z');
 }finally{f.close();}});
test('removal, nonmatching rename and conflicting known ID clear without phantom Enter',()=>{for(const replacement of [[],[row('copper-ore','Copper Ore')],[row('iron-ore','Iron Ore',1,202)]] ){const f=fixture([row('iron-ore','Iron Ore',300,101),row('iron-sword','Iron Sword')]);try{
 f.type('Iron');f.select('iron-ore');f.publish(report(replacement));assert.equal(f.selected(),undefined,typeof action==='undefined'?'removed':action);assert.equal(f.field.getAttribute('aria-activedescendant'),null);f.key('Enter');assert.equal(f.w.location.hash,'#price-check');
 }finally{f.close();}}});
test('typing even the same query, changed query and switching input reset selection',()=>{for(const action of ['same','changed','input']){const f=fixture([row('iron-ore','Iron Ore'),row('iron-sword','Iron Sword')]);try{
 f.type('Iron');f.select('iron-ore');if(action==='input'){f.d.getElementById('view-price-check').hidden=false;f.pageField.focus();assert.equal(f.d.activeElement,f.pageField);}else f.type(action==='same'?'Iron':'Iron Sword');assert.equal(f.selected(),undefined,typeof action==='undefined'?'removed':action);assert.equal(f.d.activeElement.getAttribute('aria-activedescendant'),null);f.key('Enter');assert.equal(f.w.location.hash,'#price-check');
 }finally{f.close();}}});
test('close, clear and no initial selection never auto-select on refresh or reopen',()=>{for(const action of ['Escape','Tab','outside','clear','unselected']){const f=fixture([row('iron-ore','Iron Ore')]);try{
 f.type('Iron');if(action!=='unselected')f.select('iron-ore');if(action==='outside')f.d.body.dispatchEvent(new f.w.Event('pointerdown',{bubbles:true}));else if(action==='clear')f.d.querySelector('[data-price-clear]').click();else if(action!=='unselected')f.key(action);
 f.publish(report([row('iron-ore','Iron Ore',777)]));assert.equal(f.selected(),undefined,typeof action==='undefined'?'removed':action);f.field.focus();f.key('Enter',f.field);assert.equal(f.w.location.hash,'#price-check');
 }finally{f.close();}}});
test('identity refresh routes through newly bound row and refreshes its original evidence',()=>{const f=fixture([row('iron-ore','Iron Ore')]);try{
 f.type('Iron');f.select('iron-ore');f.w.AstraItemApiPreview={enabled:true,coverage:()=>'',mergeSearchRecords:rows=>rows.map(r=>({...r,lazyDetail:true,sourceSlug:'new-owned-iron',price:650,sourceUpdatedAt:'2026-11-07T09:12:13Z',priceDay:null,apiIdentity:{memberships:[{operation:'prices',presentInSnapshot:true,capturedAt:'2026-11-07T09:12:13Z'}]}}))};f.d.dispatchEvent(new f.w.Event('astrapiitemidentities'));
 assert.equal(f.selected().dataset.priceKey,'iron-ore');assert.match(f.selected().textContent,/09:12:13/);assert.equal(f.selected().querySelector('[data-raw-date]').dataset.rawSourcePublicationAt,'2026-11-07T09:12:13Z');f.key('Enter');assert.equal(f.w.location.hash,'#item/new-owned-iron');
 }finally{f.close();}});
test('cash refresh keeps selected key while showing newly received median and source clock',()=>{const f=fixture([row('iron-ore','Iron Ore')]);try{
 f.type('Iron');f.select('iron-ore');let state={data:{subsetHash:'new',capturedAt:'2026-11-07T10:11:12Z'}};f.w.AstraApiCash={rowFor:()=>({available:true,saleMedianMesos:4321,recordedSalesCount:12}),getState:()=>state};f.d.dispatchEvent(new f.w.Event('astraapicashchange'));
 assert.equal(f.selected().dataset.priceKey,'iron-ore');assert.match(f.selected().textContent,/4,321 mesos/);assert.match(f.selected().textContent,/10:11:12/);assert.equal(f.selected().querySelector('[data-raw-date]').dataset.rawApiCapturedAt,state.data.capturedAt);f.key('Enter');assert.equal(f.w.location.hash,'#item/iron-ore');
 }finally{f.close();}});
