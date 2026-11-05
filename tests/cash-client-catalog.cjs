const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{webcrypto,createHash}=require('node:crypto');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),script=fs.readFileSync(path.join(root,'web/cash-client-catalog.js'),'utf8'),css=fs.readFileSync(path.join(root,'web/cash-client-catalog.css'),'utf8');
const capture='2026-11-05T11:48:27.840134+00:00';
function bundle(records){
 const styles=records.filter(r=>r.metadataKind==='appearance_style').length,stats={appearanceStyles:styles,equipmentItems:records.length-styles};
 const payload={schemaVersion:1,kind:'client_cash_metadata_catalog',provider:'maplestory.io',region:'MCW',clientVersion:'1',sourceUrl:'https://maplestory.io/api/MCW/1/item/list?cashFilter=true&count=10000',capturedAt:capture,timestampKind:'http_response_completed_at',sourceObservedAt:null,sourcePublishedAt:null,releaseStatus:'unknown',marketAvailability:null,directNxCost:null,recordCount:records.length,stats,records};
 const text=JSON.stringify(payload)+'\n',sha256=createHash('sha256').update(text).digest('hex');
 return {text,payload,manifest:{schemaVersion:1,kind:'client_cash_metadata_manifest',data:'assets/cash-client-catalog-'+sha256.slice(0,16)+'.json',sha256,bytes:Buffer.byteLength(text),recordCount:records.length,stats,capturedAt:capture,timestampKind:'http_response_completed_at',sourceObservedAt:null,sourcePublishedAt:null}};
}
const records=Array.from({length:61},(_,i)=>({itemId:1000000+i,name:'Client item '+String(i).padStart(2,'0'),isCash:true,overallCategory:'Equip',category:i<20?'Character':'Armor',subCategory:i<20?'Hair':'Hat',metadataKind:i<20?'appearance_style':'equipment_item'}));records[60].name='<img src=x onerror=alert(1)> Unknown hat';
function fixture(archive=bundle(records),{manifest=archive.manifest,text=archive.text,status=200,missingHost=false}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<main id="content"><section id="view-cash-catalog"><h1>Existing market catalog</h1><p id="existing">229 observed market rows remain separate</p></section></main>',{url:'https://inflation.gg/#cash-catalog',runScripts:'outside-only',virtualConsole:vc}),w=dom.window,doc=w.document,calls=[];
 w.TextEncoder=TextEncoder;Object.defineProperty(w.crypto,'subtle',{value:webcrypto.subtle});Object.defineProperty(w,'localStorage',{get(){throw Error('No preference storage needed');}});
 w.fetch=async(url,options)=>{calls.push({url,options});assert.equal(new URL(url).origin,'https://inflation.gg');return {ok:status===200,status,text:async()=>url.endsWith('/assets/cash-client-catalog.json')?typeof manifest==='string'?manifest:JSON.stringify(manifest):text};};
 w.XMLHttpRequest=function(){throw Error('No XHR');};w.navigator.sendBeacon=()=>{throw Error('No beacon');};
 if(missingHost)doc.getElementById('view-cash-catalog').remove();
 w.eval(script);return {w,doc,calls,errors,close:()=>w.close(),click:s=>doc.querySelector(s).click()};
}
async function settled(f){const end=Date.now()+2000;while(f.doc.querySelector('.cash-client-status')?.textContent.startsWith('Loading')&&Date.now()<end)await new Promise(r=>setTimeout(r,5));assert(!f.doc.querySelector('.cash-client-status')?.textContent.startsWith('Loading'));}
const displayed=f=>[...f.doc.querySelectorAll('.cash-client-table tbody tr[data-client-item-id]')];
(async()=>{
 let f=fixture();try{
  assert.equal(f.calls.length,0);assert(f.doc.getElementById('cash-client-body').hidden);assert.equal(f.doc.querySelector('.cash-client-toggle').getAttribute('aria-expanded'),'false');assert.equal(f.doc.getElementById('view-cash-catalog').lastElementChild.id,'cash-client-catalog-panel');
  const before=f.doc.getElementById('existing').outerHTML;f.click('.cash-client-toggle');await settled(f);assert.equal(f.calls.length,2);assert.equal(f.calls[0].url,'https://inflation.gg/assets/cash-client-catalog.json');assert(f.calls.every(call=>call.options.credentials==='same-origin'));assert.equal(displayed(f).length,25);assert(f.doc.querySelector('.cash-client-status').textContent.includes('61 cash-flagged client records'));assert(f.doc.querySelector('.cash-client-status').textContent.includes('20 hair/face styles'));assert(f.doc.querySelector('.cash-client-evidence').textContent.includes(capture));assert(f.doc.querySelector('.cash-client-limitation').textContent.includes('not an unattended connection'));assert.equal(f.doc.querySelectorAll('img').length,0);assert.equal(f.doc.querySelectorAll('.cash-client-table th button').length,4);
  f.click('[data-client-sort="itemId"]');assert.equal(displayed(f)[0].dataset.clientItemId,'1000000');f.click('[data-client-sort="itemId"]');assert.equal(displayed(f)[0].dataset.clientItemId,'1000060');assert.equal(f.doc.activeElement.dataset.clientSort,'itemId');
  const input=f.doc.querySelector('.cash-client-controls input'),filter=f.doc.querySelector('.cash-client-controls select');filter.value='appearance_style';filter.dispatchEvent(new f.w.Event('change'));assert.equal(displayed(f).length,20);assert(displayed(f).every(row=>row.textContent.includes('Hair / face style')));filter.value='equipment_item';filter.dispatchEvent(new f.w.Event('change'));assert.equal(displayed(f).length,25);assert(f.doc.querySelector('#cash-client-results').textContent.includes('of 41'));assert(displayed(f).every(row=>row.textContent.includes('Equipment item')));
  f.click('.cash-client-paging button:last-child');assert.equal(displayed(f).length,16);assert(f.doc.querySelector('.cash-client-paging button:last-child').disabled);input.value='no matching client';input.dispatchEvent(new f.w.Event('input'));assert.equal(displayed(f).length,0);assert(f.doc.querySelector('.cash-client-table').textContent.includes('No client records match'));input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(input.value,'');assert.equal(f.doc.activeElement,input);assert.equal(displayed(f).length,25);
  input.value='1000060';input.dispatchEvent(new f.w.Event('input'));assert.equal(displayed(f).length,1);assert(displayed(f)[0].textContent.includes('<img src=x'));assert.equal(f.doc.querySelectorAll('img').length,0);assert.equal(f.doc.getElementById('existing').outerHTML,before);
  f.click('.cash-client-toggle');assert(f.doc.getElementById('cash-client-body').hidden);f.click('.cash-client-toggle');await settled(f);assert.equal(f.calls.length,2,'Reopening must reuse the validated owned archive');f.w.eval(script);assert.equal(f.doc.querySelectorAll('#cash-client-catalog-panel').length,1);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
 const good=bundle(records);
 for(const bad of [{...good.manifest,data:'https://evil.example/archive.json'},{...good.manifest,data:'assets/../private.json'},{...good.manifest,recordCount:10001},{...good.manifest,sha256:'a'.repeat(64)},{...good.manifest,sourceObservedAt:capture}]){
  f=fixture(good,{manifest:bad});try{f.click('.cash-client-toggle');await settled(f);assert.equal(f.calls.length,1);assert.equal(displayed(f).length,0);assert(f.doc.querySelector('.cash-client-status').textContent.includes('could not be loaded or validated'));}finally{f.close();}
 }
 for(const mutate of [rows=>{rows[0].isCash=false;},rows=>{rows[0].itemId=rows[1].itemId;},rows=>{rows[0].name='';},rows=>{rows[0].knownNxCost=3500;},rows=>{rows[0].metadataKind='released';}]){
  const rows=JSON.parse(JSON.stringify(records));mutate(rows);f=fixture(bundle(rows));try{f.click('.cash-client-toggle');await settled(f);assert.equal(f.calls.length,2);assert.equal(displayed(f).length,0);assert(f.doc.querySelector('.cash-client-status').textContent.includes('could not be loaded or validated'));}finally{f.close();}
 }
 for(const options of [{status:401},{manifest:'<!doctype html><title>Unlock preview</title>'},{text:good.text+'tampered'}]){
  f=fixture(good,options);try{f.click('.cash-client-toggle');await settled(f);assert.equal(displayed(f).length,0);assert(f.doc.querySelector('.cash-client-status').textContent.includes('could not be loaded or validated'));assert.equal(f.doc.getElementById('existing').textContent,'229 observed market rows remain separate');}finally{f.close();}
 }
 f=fixture(good,{missingHost:true});assert.equal(f.calls.length,0);assert.equal(f.doc.querySelector('#cash-client-catalog-panel'),null);f.close();
 // Exercise the real public archive and prove allowlisted source-only output.
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/cash-client-catalog.json'),'utf8')),text=fs.readFileSync(path.join(root,manifest.data),'utf8'),real=JSON.parse(text);
 assert.equal(real.recordCount,4706);assert.equal(real.stats.equipmentItems,2755);assert.equal(real.stats.appearanceStyles,1951);assert.equal(createHash('sha256').update(text).digest('hex'),manifest.sha256);assert.equal(Buffer.byteLength(text),manifest.bytes);assert(manifest.bytes<1024*1024);assert(!/AppData|[A-Z]:\\|"(?:rawPath|beaconToken|cookie|authorization)"\s*:/i.test(text),'No private metadata keys or local paths');
 f=fixture({manifest,text});try{assert.equal(f.calls.length,0);f.click('.cash-client-toggle');await settled(f);assert.equal(displayed(f).length,25);assert(f.doc.querySelector('.cash-client-status').textContent.includes('4,706'));assert.equal(f.calls.length,2);}finally{f.close();}
 assert.doesNotMatch(css,/@import|https?:\/\/|url\(/);assert(css.includes(':focus-visible'));
 console.log('PASS: lazy same-origin client archive, strict manifest/hash/schema/cash validation, 4706 safe records, 25-row paging/search/type/sort, gated failures and no upstream/source/model changes');
})().catch(error=>{console.error(error);process.exitCode=1;});
