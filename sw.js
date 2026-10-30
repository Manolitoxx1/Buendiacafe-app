const CACHE_NAME = 'buendia-pos-v16';
const ASSETS = [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './icon.svg',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    // Cada recurso por separado: si uno falla no se pierde todo el precache
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => Promise.all(
            ASSETS.map(url => cache.add(url).catch(() => null))
        ))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    // Solo GET del mismo origen; Firebase y CDNs van directo a la red
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

    // Network first: actualiza la caché y cae a ella sin conexión.
    // ignoreSearch para que app.js?v=12 encuentre ./app.js
    event.respondWith(
        fetch(req).then(res => {
            if (res && res.ok) {
                const copy = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
            }
            return res;
        }).catch(() => caches.match(req, { ignoreSearch: true }).then(r =>
            r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
    );
});
