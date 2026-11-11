const BASE=new URL('./',self.location.href);
const PREFIX=`steadystudy-${encodeURIComponent(BASE.pathname)}-`;
const CACHE=PREFIX+'v0-2-4';
const FILES=['./','./index.html','./styles.css','./app.js','./engine.js','./store.js','./manifest.webmanifest','./assets/icon.svg','./assets/favicon-48.png','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(f=>new URL(f,BASE).href))));
  // Updates wait until all old tabs close, so an active session never mixes versions.
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
  // Versioned cache first: all application files belong to the same release.
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const hit=await cache.match(event.request,{ignoreSearch:true});
    if(hit)return hit;
    try{return await fetch(event.request);}catch(error){
      if(event.request.mode==='navigate')return cache.match(new URL('./index.html',BASE).href);
      throw error;
    }
  }));
});
