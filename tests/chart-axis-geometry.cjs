const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8');
const start=source.indexOf('function chartHTML('),end=source.indexOf('\nfunction rangeFilter(',start);assert(start>=0&&end>start);
const dom=new JSDOM('<div class="chart" id="probe"></div>',{runScripts:'outside-only'}),w=dom.window,host=w.document.getElementById('probe');
w.eval(`let chartSerial=0,displayTimeZone='UTC',selectedLaunchPeriod='all';const LAUNCH_EVENTS=[{id:'grand-launch',day:'2026-10-21',label:'Grand Launch',detail:'Calendar-day context'}];const launchPeriodFilter=()=>true;const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');const number=(v,d=0)=>v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});const compact=v=>Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(v);const utc=v=>v+' '+displayTimeZone;${source.slice(start,end)};window.draw=chartHTML;window.zone=value=>displayTimeZone=value;`);
const points=[{at:'2026-11-04T00:00:00Z',value:13.924029,sampleCount:20},{at:'2026-11-05T10:10:10.823Z',value:17.086067,partial:true}],original=JSON.stringify(points);
const approx=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
try{
 for(const width of [320,375,700,1120])for(const timeAxis of [false,true])for(const zone of ['UTC','America/Chicago']){
  w.zone(zone);host.innerHTML=w.draw([{name:'Source rate',color:'#edc471',points}],{width,timeAxis,dateOnlyAxis:!timeAxis,yTitle:'mesos per NX'});
  const svg=host.querySelector('svg'),[,,W,H]=svg.getAttribute('viewBox').split(' ').map(Number),rect=svg.querySelector('clipPath rect'),L=Number(rect.getAttribute('x')),T=Number(rect.getAttribute('y')),plotW=Number(rect.getAttribute('width')),plotH=Number(rect.getAttribute('height')),bottom=T+plotH;
  assert.equal(W,width);assert(plotW>0&&plotH>=100);const yTitle=svg.querySelector('.chart-y-axis-label'),xTitle=svg.querySelector('.chart-x-axis-label');
  approx(Number(yTitle.getAttribute('x')),L+plotW/2);approx(Number(xTitle.getAttribute('x')),L+plotW/2);assert.equal(yTitle.getAttribute('text-anchor'),'middle');assert.equal(xTitle.getAttribute('text-anchor'),'middle');assert(Number(yTitle.getAttribute('y'))+14<=T-14,'Y title stays above plot and launch labels');
  const xFont=parseFloat(xTitle.style.fontSize),titleY=Number(xTitle.getAttribute('y'));assert(H-titleY-xFont*.25>=14,'At least14px below the x title glyphs');
  const ticks=[...svg.querySelectorAll('.chart-x-tick')],grids=[...svg.querySelectorAll('.chart-x-grid')],marks=[...svg.querySelectorAll('.chart-x-mark')];assert.equal(ticks.length,grids.length);assert.equal(ticks.length,marks.length);assert.equal(ticks[0].getAttribute('text-anchor'),'start');assert.equal(ticks.at(-1).getAttribute('text-anchor'),'end');
  const first=Date.parse(points[0].at),last=Date.parse(points.at(-1).at);
  for(const [i,tick] of ticks.entries()){
   const x=Number(tick.getAttribute('x'));approx(x,L+(Date.parse(tick.dataset.tickAt)-first)/(last-first)*plotW);approx(Number(grids[i].getAttribute('x1')),x);approx(Number(grids[i].getAttribute('x2')),x);approx(Number(grids[i].getAttribute('y1')),T);approx(Number(grids[i].getAttribute('y2')),bottom);approx(Number(marks[i].getAttribute('x1')),x);assert.equal(grids[i].getAttribute('stroke-dasharray'),'3 6');assert(Number(marks[i].getAttribute('y2'))>bottom);
   const text=tick.firstChild.textContent;if(width>=600)assert.match(text,/^\d{4}-\d{2}-\d{2}$/);else assert.match(text,/^[A-Za-z]{3} \d{1,2}$/);
   const second=tick.querySelector('tspan');if(timeAxis){assert(second);assert(Number(second.getAttribute('dy'))>=16);approx(Number(second.getAttribute('x')),x);assert.match(second.textContent,/^\d{2}:\d{2}$/);}else assert.equal(second,null);
   const lastTickBaseline=Number(tick.getAttribute('y'))+(second?Number(second.getAttribute('dy')):0);assert(titleY-xFont*.85-lastTickBaseline>=14,'X title clears all date/clock text by14px');
  }
  assert.equal(xTitle.textContent,timeAxis?'Time ('+zone+')':'Date');assert.equal(yTitle.textContent,'Rate (mesos per NX)');assert.deepEqual([...svg.querySelectorAll('circle[data-chart-value]')].map(point=>Number(point.dataset.chartValue)),points.map(point=>point.value));assert.equal(svg.querySelectorAll('circle[data-chart-value]')[1].dataset.chartDate,points[1].at);
 }
 w.zone('UTC');host.innerHTML=w.draw([{name:'Date-only reports',color:'#89c6b0',points:[{at:'2026-10-20T12:00:00Z',day:'2026-10-20',value:1e12},{at:'2026-10-22T12:00:00Z',day:'2026-10-22',value:1.2e12}]}],{width:320,dateOnlyAxis:true,yTitle:'estimated mesos',allTime:true});
 assert([...host.querySelectorAll('circle[data-chart-value]')].every(point=>point.dataset.chartDatePrecision==='day'));assert.equal(host.querySelectorAll('.chart-x-tick tspan').length,0);assert(Number(host.querySelector('clipPath rect').getAttribute('width'))>150);assert(!/NaN|Infinity/.test(host.innerHTML));assert(host.querySelector('.launch-event'));assert(Number(host.querySelector('.launch-label-background').getAttribute('y'))>Number(host.querySelector('.chart-y-axis-label').getAttribute('y'))+14);
 assert.equal(JSON.stringify(points),original);
 console.log('PASS: centered axis titles outside plot,14px bottom/title clearances,20px date-clock spacing, exact-time aligned grids/ticks/anchors, responsive320/375/700/1120 geometry, timezone/day precision, large values and unchanged raw points');
}finally{w.close();}
