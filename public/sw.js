// Service Worker con soporte para notificaciones push y offline

const CACHE_NAME = 'pokedex-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Instalar Service Worker
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache abierto');
        return cache.addAll(urlsToCache).catch(err => {
          console.warn('[SW] Algunos archivos no pudieron cachearse:', err);
        });
      })
  );
  self.skipWaiting();
});

// Activar Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] Activando Service Worker...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Eliminando cache antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Manejar peticiones
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // No cachear cambios de host
  if (url.origin !== location.origin) {
    return;
  }

  // Estrategia: intentar network primero, si falla usar cache
  event.respondWith(
    fetch(request)
      .then(response => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        
        // Clonar y guardar en cache
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, responseToCache);
        });
        
        return response;
      })
      .catch(() => {
        return caches.match(request)
          .then(response => {
            return response || new Response('Offline - No se encontró en cache', {
              status: 503,
              statusText: 'Unavailable'
            });
          });
      })
  );
});

// Escuchar notificaciones push
self.addEventListener('push', event => {
  console.log('🔔 PUSH EVENT RECIBIDO');
  
  let notificationData = {
    title: 'Notificación Pokédex',
    body: 'Tienes una nueva notificación',
    icon: '/favicon.svg'
  };

  if (event.data) {
    try {
      notificationData = event.data.json();
      console.log('📨 Datos JSON parseados:', notificationData);
    } catch (e) {
      notificationData.body = event.data.text();
      console.log('📨 Datos de texto parseados:', notificationData.body);
    }
  }

  console.log('📌 Mostrando notificación:', notificationData.title, '-', notificationData.body);

  const options = {
    body: notificationData.body,
    icon: notificationData.icon || '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [100, 50, 100],
    data: {
      url: notificationData.data?.url || '/amigos'
    },
    tag: 'pokedex-notification',
    requireInteraction: true
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
      .then(() => {
        console.log('✅ Notificación mostrada exitosamente');
      })
      .catch(error => {
        console.error('❌ Error mostrando notificación:', error);
      })
  );
});

// Manejar clic en notificación
self.addEventListener('notificationclick', event => {
  console.log('👆 Notificación clickeada');
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Buscar ventana existente
        for (let client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            console.log('🔍 Ventana encontrada, navegando a:', event.notification.data.url);
            client.focus();
            return client.navigate(event.notification.data.url);
          }
        }
        // Si no hay ventana, abrir una nueva
        if (clients.openWindow) {
          console.log('🔓 Abriendo nueva ventana a:', event.notification.data.url);
          return clients.openWindow(event.notification.data.url);
        }
      })
  );
});
