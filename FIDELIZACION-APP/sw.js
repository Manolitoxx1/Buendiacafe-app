// Service Worker para Buen Día Café - Club de Fidelización
const CACHE_NAME = 'buendia-fidelizacion-v2.3.0';
// Las versiones (?v=) deben coincidir con las que pide index.html
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=5',
  './app.js?v=5',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-180.png',
  './icon_yellow.png',
  './logo.png',
  './sello.png',
  './granos de cafe pros.jpg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
];

// Instalación y pre-caché
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Uno por uno: si un recurso falla, los demás igual quedan guardados
      return Promise.all(ASSETS.map((url) =>
        cache.add(url).catch((err) => {
          console.warn('No se pudo pre-cachear:', url, err);
        })
      ));
    }).then(() => self.skipWaiting())
  );
});

// Activación y limpieza de cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de red: Network First con fallback a Caché para datos dinámicos, Stale-While-Revalidate para recursos estáticos
self.addEventListener('fetch', (event) => {
  // Omitir peticiones que no sean GET o que vayan a Firebase Realtime Database
  if (event.request.method !== 'GET' || event.request.url.includes('firebaseio.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        if (cachedResponse) return cachedResponse;
        // Sin conexión: servir la copia guardada aunque cambie el ?v= o el ?id=
        if (event.request.url.startsWith(self.location.origin)) {
          return caches.match(event.request, { ignoreSearch: true })
            .then((resp) => resp || Response.error());
        }
        return Response.error();
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// Manejador de notificaciones push / locales
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data && event.notification.data.url ? event.notification.data.url : './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
