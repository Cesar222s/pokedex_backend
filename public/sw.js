const CACHE_STATIC_NAME = 'pokedex-static-v1';
const CACHE_DYNAMIC_NAME = 'pokedex-dynamic-v1';

// Rutas fijas de la aplicación (App Shell)
const APP_SHELL = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/manifest.json', // (Opcional si decides agregarlo después)
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Mini IndexedDB Wrapper para Backend Sync
const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open('PokedexOfflineDB', 1);
  request.onupgradeneeded = e => {
    const db = e.target.result;
    db.createObjectStore('sync-requests', { keyPath: 'id', autoIncrement: true });
  };
  request.onsuccess = e => resolve(e.target.result);
  request.onerror = e => reject(e.target.error);
});

async function saveOfflineRequest(requestData) {
  const db = await dbPromise;
  const tx = db.transaction('sync-requests', 'readwrite');
  tx.objectStore('sync-requests').add(requestData);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getOfflineRequests() {
  const db = await dbPromise;
  const tx = db.transaction('sync-requests', 'readonly');
  const req = tx.objectStore('sync-requests').getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteOfflineRequest(id) {
  const db = await dbPromise;
  const tx = db.transaction('sync-requests', 'readwrite');
  tx.objectStore('sync-requests').delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener('install', e => {
  // 1. Instala cache de APP SHELL (rutas fijas)
  const cacheStatic = caches.open(CACHE_STATIC_NAME)
    .then(cache => cache.addAll(APP_SHELL));

  e.waitUntil(cacheStatic);
  // 4. Activar nuevo SW automaticamente
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // 3. Eliminar cache vieja
  const clearCache = caches.keys().then(keys => {
    return Promise.all(
      keys.map(key => {
        if (key !== CACHE_STATIC_NAME && key !== CACHE_DYNAMIC_NAME) {
          console.log('[Service Worker] Eliminando cache antigua:', key);
          return caches.delete(key);
        }
      })
    );
  });

  e.waitUntil(clearCache);
  // Activar inmediatamente este SW para los clientes abiertos
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith('http')) return;
  if (e.request.url.includes('/@vite/') || e.request.url.includes('/@vue/') || e.request.url.includes('hot-update')) return;

  // 1. Si es POST, PUT, o DELETE, intentamos ejecutar y si falla, guardamos en IndexedDB
  if (e.request.method !== 'GET') {
    e.respondWith(
      fetch(e.request.clone()).catch(async (err) => {
        console.warn('[SW] Falla de conexión en petición de escritura. Guardando en IndexedDB...', err);
        
        const bodyText = await e.request.clone().text();
        const headersObj = {};
        e.request.headers.forEach((val, key) => headersObj[key] = val);
        
        await saveOfflineRequest({
          url: e.request.url,
          method: e.request.method,
          headers: headersObj,
          body: bodyText
        });

        // 2. Generar tarea asíncrona (Background Sync)
        if ('sync' in self.registration) {
          try {
            await self.registration.sync.register('sync-offline-requests');
          } catch (syncErr) {
            console.error('[SW] No se pudo registrar sync:', syncErr);
          }
        }

        return new Response(JSON.stringify({ 
          offline: true, 
          message: 'Sin internet. La petición se sincronizará cuando regreses a estar en línea.' 
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 202
        });
      })
    );
    return;
  }

  // Estrategia: Cache First con Network Fallback para GETs
  const respuesta = caches.match(e.request).then(res => {
    if (res) {
      // Retorna desde cache
      return res;
    }

    // 2. Carga cache dinámico (las rutas que no estén en el APP SHELL se agregan al cache dinámico)
    // 5. Soporte offline interceptando y manejando la petición a la red
    return fetch(e.request).then(newRes => {
      // Guardar en cache dinámico para próxima vez
      return caches.open(CACHE_DYNAMIC_NAME).then(cache => {
        cache.put(e.request, newRes.clone());
        return newRes;
      });
    }).catch(err => {
      console.warn('[Service Worker] Error de red / Offline detectado:', err);
      // Si falla la red y no está en caché dinámico ni estático, retorna error o página fallback.
    });
  });

  e.respondWith(respuesta);
});

// Listener SYNC para ejecutar las peticiones guardadas
self.addEventListener('sync', e => {
  console.log('[SW] Evento Sync detectado:', e.tag);
  if (e.tag === 'sync-offline-requests') {
    e.waitUntil(
      getOfflineRequests().then(requests => {
        return Promise.all(requests.map(async reqData => {
          try {
            console.log('[SW] Sincronizando petición a:', reqData.url);
            const fetchRes = await fetch(reqData.url, {
              method: reqData.method,
              headers: reqData.headers,
              body: reqData.body
            });
            // Si funciona o el servidor responde que la petición era mala (400, etc), se completó el intento
            if (fetchRes.ok || fetchRes.status >= 400) {
              console.log('[SW] Petición sincronizada, eliminando de IndexedDB (ID:', reqData.id, ')');
              await deleteOfflineRequest(reqData.id);
            }
          } catch(err) {
            console.error('[SW] Falló la sincronización de la petición en background, se intentará luego:', err);
          }
        }));
      })
    );
  }
});

// Listener para Push Notifications enviadas desde el backend
self.addEventListener('push', e => {
  console.log('[SW] Push recibido');
  let data = { title: 'Notificación de Pokédex', body: 'Tienes una nueva alerta.', icon: '/favicon.svg' };
  
  if (e.data) {
    try {
      data = e.data.json();
    } catch(err) {
      data.body = e.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [100, 50, 100],
    data: { url: '/' }
  };

  e.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Listener cuando el usuario hace clic en la notificación
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.openWindow(e.notification.data.url)
  );
});
