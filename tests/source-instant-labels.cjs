const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.env.ASTRA_PRESENTATION_TEST_ROOT||path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('web/app.js'),start=app.indexOf('let instantLabelZone,'),end=app.indexOf('const zones=',start);assert(start>=0&&end>start);
function pure(){const c={};vm.createContext(c);vm.runInContext("let displayTimeZone='UTC';"+app.slice(start,end)+";this.label=(v,z)=>instantLabel(v,z);this.raw=v=>utc(v);this.zone=z=>displayTimeZone=z;",c);return c;}
test('shared production instant helper disambiguates years/month/day/year rollover without UTC day conversion',()=>{
 const c=pure();assert.equal(c.label('2026-11-07T16:13:00Z','UTC'),'(11-07-2026 16:13 UTC)');assert.equal(c.label('2027-11-07T16:13:00Z','UTC'),'(11-07-2027 16:13 UTC)');
 assert.equal(c.label('2026-12-31T23:59:00Z','UTC'),'(12-31-2026 23:59 UTC)');assert.equal(c.label('2027-01-01T00:00:00Z','UTC'),'(01-01-2027 00:00 UTC)');
 assert.equal(c.label('2027-01-01T00:30:00Z','America/Chicago'),'(12-31-2026 18:30 America/Chicago GMT-6)');assert.equal(c.label('2026-11-07','America/Chicago'),'(11-07-2026)');assert.equal(c.label('2026-11-07','Asia/Tokyo'),'(11-07-2026)');
 assert.equal(c.label('2026-02-30','UTC'),'Not available');assert.equal(c.label('bad','UTC'),'Not available');assert.equal(c.label(null,'UTC'),'Not available');assert.equal(c.label('2026-11-07T16:13:00Z','invalid/zone'),'(11-07-2026 16:13 UTC)');
});
test('real selected timezone and repeated Chicago hour retain separate UTC-offset evidence',()=>{
 const c=pure();c.zone('America/Chicago');assert.equal(c.raw('2026-11-01T06:30:00Z'),'(11-01-2026 01:30 America/Chicago GMT-5)');assert.equal(c.raw('2026-11-01T07:30:00Z'),'(11-01-2026 01:30 America/Chicago GMT-6)');c.zone('UTC');assert.equal(c.raw('2026-11-01T06:30:00Z'),'(11-01-2026 06:30 UTC)');
});
test('actual app handlers render year-bearing source clocks and preserve date-tone toggles/raw evidence',async()=>{
 const{JSDOM,VirtualConsole}=require('jsdom'),errors=[],requests=[],report=JSON.parse(read('dist/data.json'));report.sourceUpdatedAt='2026-11-07T16:13:00Z';const original=JSON.stringify(report),vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(read('web/index.html'),{url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.AbortSignal.timeout=()=>undefined;
 w.fetch=async url=>{requests.push(url);assert(['version.json','data-0123456789abcdef.json'].includes(url));return{ok:true,json:async()=>url==='version.json'?{version:'fixture',data:'data-0123456789abcdef.json'}:report};};
 try{
  w.eval(app+';window.__clockLabel=utc;window.__clockRaw=()=>snapshot.sourceUpdatedAt;');const until=async p=>{const end=Date.now()+1500;while(!p()&&Date.now()<end)await new Promise(r=>setTimeout(r,5));assert(p(),'Actual app did not settle');};await until(()=>d.getElementById('header-freshness').textContent.includes('2026'));
  assert.match(d.getElementById('header-freshness').textContent,/11-07-2026 16:13 UTC/);assert(d.getElementById('sources-cards').textContent.includes('11-07-2026'));w.eval(read('web/date-presentation.js'));assert.equal(d.body.dataset.dateTone,'plain');const tone=[...d.querySelectorAll('button')].find(n=>n.textContent==='Date details: Match explanation');assert(tone);tone.click();assert.equal(d.body.dataset.dateTone,'bold');
  const select=d.getElementById('display-timezone');select.value='America/Chicago';select.dispatchEvent(new w.Event('change'));assert.match(d.getElementById('header-freshness').textContent,/11-07-2026 10:13 America\/Chicago GMT-6/);assert.equal(w.__clockRaw(),report.sourceUpdatedAt);assert.equal(JSON.stringify(report),original);assert.equal(requests.length,2);assert.deepEqual(errors,[]);
  const node=d.createElement('time');node.dateTime=report.sourceUpdatedAt;node.dataset.sortValue=report.sourceUpdatedAt;node.textContent=w.__clockLabel(report.sourceUpdatedAt);d.body.append(node);await new Promise(r=>setTimeout(r,40));assert.equal(node.textContent,'(11-07-2026 10:13 America/Chicago GMT-6)');assert.equal(node.dateTime,report.sourceUpdatedAt);assert.equal(node.dataset.sortValue,report.sourceUpdatedAt);
 }finally{w.close();}
});
