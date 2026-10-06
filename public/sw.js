const CACHE='littlepay-shell-__ASSET_VERSION__';
const FILES=['/','/index.html','/app.js','/core.js','/features.js','/pending.js','/local.js','/access.js','/styles.css','/icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('littlepay-shell-')&&key!==CACHE).map(key=>caches.delete(key)));
  // Migrate a private link opened under the old Google-login shell once.
  for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})) {
    if(new URLSearchParams(new URL(client.url).hash.slice(1)).has('access')) await client.navigate(client.url);
  }
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Never cache API responses, Google login, or financial data in the service worker.
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!FILES.includes(url.pathname))return;
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(event.request)));
});
