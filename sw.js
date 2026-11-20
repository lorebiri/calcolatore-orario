// Service worker: l'app funziona anche offline. Nessuna richiesta verso altri siti.
// Strategia: risposta dalla cache se c'è, intanto si scarica la versione nuova per la prossima apertura.
const CACHE = 'calcolatore-orario-v2.2.0';
const FILE = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/calc.js',
  'js/tema.js',
  'js/epas-lettore.js',
  'js/bookmarklet.js',
  'js/istruzioni-epas.js',
  'epas.html',
  'fonts/inter-latin-wght.woff2',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k.startsWith('calcolatore-orario-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const inCache = await cache.match(req, { ignoreSearch: true });
      const rete = fetch(req).then((r) => {
        if (r.ok) cache.put(req, r.clone());
        return r;
      }).catch(() => null);
      if (inCache) {
        e.waitUntil(rete);
        return inCache;
      }
      const r = await rete;
      if (r) return r;
      if (req.mode === 'navigate') return cache.match('index.html');
      return Response.error();
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((finestre) => {
      for (const f of finestre) if ('focus' in f) return f.focus();
      return self.clients.openWindow('./');
    }),
  );
});
