'use strict';
const CACHE='inflation-watch-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['./fallback.html','./style.css','./app.js'])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data?.type==='refresh-fallback')event.waitUntil(fetch('./fallback.html',{cache:'no-cache'}).then(response=>{if(response.ok)return caches.open(CACHE).then(cache=>cache.put('./fallback.html',response));}).catch(()=>{}));
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('./fallback.html')));
});
