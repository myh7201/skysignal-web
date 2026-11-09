const CACHE='skysignal-shell-0.52.0';
const ASSETS=['./','./index.html','./styles.css?v=0.52.0','./app.mjs?v=0.52.0','./core.mjs?v=0.52.0','./warning-policy.js?v=0.52.0','./icon.svg','./manifest.webmanifest','./vendor/leaflet.js','./vendor/leaflet.css','./map/model-grid.js?v=0.52.0','./map/model-map.js?v=0.52.0'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(new URL(url,self.registration.scope),{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('skysignal-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('./index.html',self.registration.scope))));return;}
 const allowed=ASSETS.map(p=>new URL(p,self.registration.scope).pathname);if(!allowed.includes(url.pathname))return;
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;})));
});

