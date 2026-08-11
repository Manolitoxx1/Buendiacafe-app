// Service Worker dedicado para la Tarjeta de Fidelidad del Cliente
// Completamente independiente del SW del sistema de caja (sw.js)

const CACHE_NAME = 'tarjeta-buendia-v1';
const ASSETS = [
    './tarjeta.html',
    './manifest-tarjeta.json',
    './icon.svg',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // Cachear assets propios; los externos (Firebase) siempre network-first
            return cache.addAll(ASSETS).catch(() => {
                // Si falla alguno externo, continuar igual
            });
        })
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
    const url = event.request.url;

    // Firebase siempre va a la red (datos en tiempo real)
    if (url.includes('firebaseio.com') || url.includes('firebasejs') || url.includes('googleapis.com/identitytoolkit')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Network First para la propia tarjeta.html (siempre fresca)
    if (url.includes('tarjeta.html')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache First para el resto de assets estáticos
    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request).then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});
