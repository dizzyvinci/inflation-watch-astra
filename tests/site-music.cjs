const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..'),script=fs.readFileSync(path.join(root,'web/site-music.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({prefs=new Map(),blockedStorage=false,result='ok',html='<main>Snapshot</main><footer><p>Protected personal words.</p></footer>'}={}){
 const errors=[],calls={play:0,pause:0,load:0,network:0},vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://inflation.gg/#nx',runScripts:'outside-only',virtualConsole:vc}),w=dom.window;
 w.fetch=()=>{calls.network++;throw Error('No fetch allowed');};w.XMLHttpRequest=function(){calls.network++;throw Error('No XHR allowed');};w.navigator.sendBeacon=()=>{calls.network++;throw Error('No beacon allowed');};
 Object.defineProperty(w,'localStorage',{value:{getItem(k){if(blockedStorage)throw Error('Blocked');return prefs.get(k)??null;},setItem(k,v){if(blockedStorage)throw Error('Blocked');prefs.set(k,v);}}});
 let deferred;
 w.HTMLMediaElement.prototype.play=function(){calls.play++;if(result==='blocked')return Promise.reject(Object.assign(Error('Autoplay blocked'),{name:'NotAllowedError'}));if(result==='error')return Promise.reject(Error('Failed'));if(result==='deferred')return new Promise(resolve=>{deferred=resolve;});return Promise.resolve();};
 w.HTMLMediaElement.prototype.pause=function(){calls.pause++;};w.HTMLMediaElement.prototype.load=function(){calls.load++;};
 w.eval(script);return{dom,w,doc:w.document,calls,prefs,errors,setResult(x){result=x;},resolve(){deferred();}};
}
(async()=>{
 const f=fixture({prefs:new Map([['astra-site-music-v2','on']])});await tick();
 try{
  const audio=f.doc.querySelector('audio'),panel=f.doc.querySelector('#site-music'),toggle=f.doc.querySelector('#site-music-toggle'),play=f.doc.querySelector('#site-music-play'),footer=f.doc.querySelector('footer');
  assert.equal(f.calls.play,1);assert.equal(panel.dataset.musicState,'playing');assert.match(f.doc.querySelector('[role=status]').textContent,/Playing Village Consort/);assert.equal(audio.volume,.18);assert.equal(audio.loop,true);assert.equal(audio.preload,'none');assert(!audio.hasAttribute('autoplay'));assert.equal(toggle.getAttribute('aria-pressed'),'true');assert.equal(play.textContent,'Pause');
  assert.equal(footer.textContent,'Protected personal words.');assert.equal(panel.nextElementSibling,footer);assert.equal(f.w.location.hash,'#nx');assert.equal(f.calls.network,0);assert.equal(new URL(audio.src).origin,'https://inflation.gg');assert.match(audio.getAttribute('src'),/^assets\/village-consort-kevin-macleod-[a-f0-9]{16}\.mp3$/);
  play.click();assert.equal(panel.dataset.musicState,'paused');assert.equal(play.textContent,'Play');play.click();await tick();assert.equal(f.calls.play,2);assert.equal(panel.dataset.musicState,'playing');
  const slider=f.doc.querySelector('#site-music-volume');slider.value='27';slider.dispatchEvent(new f.w.Event('input'));assert.equal(audio.volume,.27);assert.equal(f.prefs.get('astra-site-music-volume-v1'),'0.27');assert.equal(slider.getAttribute('aria-valuetext'),'27 percent');
  toggle.click();assert.equal(panel.dataset.musicState,'off');assert.equal(f.prefs.get('astra-site-music-v2'),'off');assert.equal(audio.getAttribute('src'),null);assert(play.hidden);assert.equal(f.calls.load,1);
  toggle.click();await tick();assert.equal(f.prefs.get('astra-site-music-v2'),'on');assert.equal(panel.dataset.musicState,'playing');
  f.w.eval(script);assert.equal(f.doc.querySelectorAll('#site-music').length,1);assert.equal(f.doc.querySelectorAll('audio').length,1);assert.equal(f.calls.play,3);assert.deepEqual(f.errors,[]);
  const credits=f.doc.querySelector('.site-music-credit');assert.match(credits.textContent,/Kevin MacLeod/);assert.match(credits.textContent,/CC BY 4.0/);assert.equal(credits.querySelector('a').href,'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700007');assert.match(f.doc.querySelector('.site-music-note').textContent,/not official MapleStory/);
 }finally{f.dom.window.close();}
 for(const prefs of [new Map(),new Map([['astra-site-music-v1','on']])]){const fresh=fixture({prefs});await tick();try{assert.equal(fresh.calls.play,0,'Fresh and legacy-on sessions do not automatically play archived village music');assert.equal(fresh.doc.querySelector('audio').getAttribute('src'),null);assert.equal(fresh.doc.querySelector('#site-music').dataset.musicState,'off');assert.match(fresh.doc.querySelector('.site-music-note').textContent,/Off by default/);}finally{fresh.dom.window.close();}}
 const off=fixture({prefs:new Map([['astra-site-music-v2','off']])});await tick();try{assert.equal(off.calls.play,0);assert.equal(off.doc.querySelector('audio').getAttribute('src'),null);assert.equal(off.doc.querySelector('#site-music').dataset.musicState,'off');assert.equal(off.calls.network,0);}finally{off.dom.window.close();}
 const blocked=fixture({result:'blocked',prefs:new Map([['astra-site-music-v2','on']])});await tick();try{
  assert.equal(blocked.doc.querySelector('#site-music').dataset.musicState,'blocked');assert.equal(blocked.doc.querySelector('#site-music-play').textContent,'Tap to play');assert.doesNotMatch(blocked.doc.querySelector('[role=status]').textContent,/^Playing/);
  blocked.doc.body.click();blocked.doc.dispatchEvent(new blocked.w.Event('keydown'));await tick();assert.equal(blocked.calls.play,1,'Unrelated gestures never retry blocked music');
  blocked.setResult('ok');blocked.doc.querySelector('#site-music-play').click();await tick();assert.equal(blocked.calls.play,2);assert.equal(blocked.doc.querySelector('#site-music').dataset.musicState,'playing');
 }finally{blocked.dom.window.close();}
 const failure=fixture({result:'error',prefs:new Map([['astra-site-music-v2','on']])});await tick();try{assert.equal(failure.doc.querySelector('#site-music').dataset.musicState,'error');assert.equal(failure.doc.querySelector('#site-music-play').textContent,'Retry music');failure.setResult('ok');failure.doc.querySelector('#site-music-play').click();await tick();assert.equal(failure.doc.querySelector('#site-music').dataset.musicState,'playing');}finally{failure.dom.window.close();}
 const race=fixture({result:'deferred',prefs:new Map([['astra-site-music-v2','on']])});try{assert.equal(race.doc.querySelector('#site-music').dataset.musicState,'pending');race.doc.querySelector('#site-music-toggle').click();race.resolve();await tick();assert.equal(race.doc.querySelector('#site-music').dataset.musicState,'off');assert.equal(race.doc.querySelector('audio').getAttribute('src'),null);}finally{race.dom.window.close();}
 for(const blockedStorage of [false,true]){
  const invalid=fixture({blockedStorage,prefs:new Map([['astra-site-music-v2','https://bad.example'],['astra-site-music-volume-v1','NaN']])});await tick();try{assert.equal(invalid.doc.querySelector('#site-music').dataset.musicState,'off');assert.equal(invalid.calls.play,0);invalid.doc.querySelector('#site-music-toggle').click();await tick();assert.equal(invalid.doc.querySelector('#site-music').dataset.musicState,'playing');assert.equal(invalid.doc.querySelector('audio').volume,.18);invalid.doc.querySelector('#site-music-toggle').click();assert.equal(invalid.doc.querySelector('#site-music').dataset.musicState,'off');assert.equal(invalid.calls.network,0);assert.deepEqual(invalid.errors,[]);}finally{invalid.dom.window.close();}
 }
 const silent=fixture({prefs:new Map([['astra-site-music-volume-v1','0']])});await tick();try{assert.equal(silent.doc.querySelector('audio').volume,0);assert.equal(silent.doc.querySelector('output').textContent,'0%');}finally{silent.dom.window.close();}
 const absent=fixture({html:'<main>No footer</main>'});await tick();try{assert.equal(absent.calls.play,0);assert.equal(absent.doc.querySelector('#site-music'),null);}finally{absent.dom.window.close();}
 const proof=JSON.parse(fs.readFileSync(path.join(root,'assets/site-music-attribution.json'),'utf8')),bytes=fs.readFileSync(path.join(root,'assets',proof.asset));
 assert.equal(proof.license,'CC BY 4.0');assert.equal(proof.recordingIsrc,'USUAN1700007');assert.equal(bytes.length,proof.bytes);assert(bytes.length<3*1024*1024);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),proof.sha256);assert.equal(bytes.subarray(0,3).toString(),'ID3');assert(script.includes(proof.asset));assert.match(proof.changes,/96 kbps/);
 console.log('Site music: licensed asset/hash, fresh/legacy defaultOff, explicit/blocked playback, explicit retry, volume, races, credits and zero provider requests passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
