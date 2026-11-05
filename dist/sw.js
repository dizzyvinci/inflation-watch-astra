'use strict';
// Retire the former offline snapshot worker during the password-gated preview.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 try{const names=await caches.keys();await Promise.allSettled(names.filter(name=>name.startsWith('inflation-watch-shell-')).map(name=>caches.delete(name)));}catch{}
 try{await self.clients.claim();}finally{await self.registration.unregister();}
})()));
