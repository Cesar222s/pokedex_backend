const CACHE_STATIC_NAME = 'pokedex-static-v2';
const CACHE_DYNAMIC_NAME = 'pokedex-dynamic-v2';
const CACHE_API_NAME = 'pokedex-api-v2';
const CACHE_IMAGES_NAME = 'pokedex-images-v2';

// Rutas fijas de la aplicación (App Shell)
const APP_SHELL = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Página offline fallback
const OFFLINE_PAGE = new Response(
  `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pokédex - Offline</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        h1 { color: #333; }
        p { color: #666; }
        .icon { font-size: 48px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="icon">📡</div>
    <h1>Sin conexión a internet</h1>
    <p>Pero puedes ver los datos que ya has cargado.</p>
    <p>Los cambios se sincronizarán cuando regreses a estar en línea.</p>
</body>
</html>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
);

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
  console.log('[SW] Installing Service Worker v2 - caching APP SHELL...');
  
  const cacheStatic = caches.open(CACHE_STATIC_NAME)
    .then(cache => {
      console.log('[SW] ✅ Caching APP SHELL resources...');
      return cache.addAll(APP_SHELL);
    })
    .catch(err => {
      console.error('[SW] ❌ Error caching APP SHELL:', err);
    });

  e.waitUntil(cacheStatic);
  
  // 4. Activar nuevo SW automáticamente
  self.skipWaiting();
  console.log('[SW] ✅ Skipping wait - ready to activate immediately');
});

self.addEventListener('activate', e => {
  console.log('[SW] Activating Service Worker v2...');
  
  // 3. Eliminar cache vieja de versiones anteriores
  const clearCache = caches.keys().then(keys => {
    console.log('[SW] Found caches:', keys);
    return Promise.all(
      keys.map(key => {
        const isOldVersion = 
          !key.includes('v2') && 
          (key.includes('pokedex-static') || 
           key.includes('pokedex-dynamic') || 
           key.includes('pokedex-api') || 
           key.includes('pokedex-images'));
        
        if (isOldVersion) {
          console.log('[SW] 🗑️  Eliminando cache antigua:', key);
          return caches.delete(key);
        }
      })
    );
  });

  e.waitUntil(clearCache);
  
  // Activar inmediatamente este SW para los clientes abiertos
  self.clients.claim();
  console.log('[SW] ✅ Activated and claimed all clients');
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Ignorar peticiones no-HTTP y recursos de desarrollo
  if (!url.protocol.startsWith('http')) return;
  if (url.pathname.includes('/@vite/') || 
      url.pathname.includes('/@vue/') || 
      url.pathname.includes('hot-update')) return;

  console.log(`[SW] Fetch: ${request.method} ${url.pathname}`);

  // ========================
  // 1. PETICIONES DE ESCRITURA (POST, PUT, DELETE)
  // ========================
  if (request.method !== 'GET') {
    e.respondWith(
      fetch(request.clone()).catch(async (err) => {
        console.warn('[SW] ❌ Falla de conexión en petición de escritura. Guardando en IndexedDB...', err);
        
        const bodyText = await request.clone().text();
        const headersObj = {};
        request.headers.forEach((val, key) => headersObj[key] = val);
        
        await saveOfflineRequest({
          url: request.url,
          method: request.method,
          headers: headersObj,
          body: bodyText
        });

        // 2. Generar tarea asíncrona (Background Sync)
        if ('sync' in self.registration) {
          try {
            await self.registration.sync.register('sync-offline-requests');
            console.log('[SW] ✅ Sync registrado para peticiones offline');
          } catch (syncErr) {
            console.error('[SW] ❌ No se pudo registrar sync:', syncErr);
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

  // ========================
  // 2. PETICIONES GET
  // ========================

  // API Requests - Network First (intentar red primero, si falla usar cache)
  if (url.pathname.includes('/api/') || url.hostname.includes('railway')) {
    e.respondWith(networkFirstStrategy(request));
    return;
  }

  // Assets (CSS, JS, Fonts) - Cache First (usar cache primero, actualizar en background)
  if (url.pathname.endsWith('.css') || 
      url.pathname.endsWith('.js') || 
      url.pathname.includes('/fonts/') ||
      url.hostname.includes('fonts.googleapis') ||
      url.hostname.includes('cdnjs.cloudflare')) {
    e.respondWith(cacheFirstStrategy(request, CACHE_STATIC_NAME));
    return;
  }

  // Images - Cache First con media type detection
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp)$/i) ||
      url.pathname.includes('/assets/') ||
      url.pathname.includes('/img/')) {
    e.respondWith(cacheFirstStrategy(request, CACHE_IMAGES_NAME));
    return;
  }

  // Default para otras peticiones GET - Network First
  e.respondWith(networkFirstStrategy(request));
});

// ========================
// ESTRATEGIA: Network First (obtener de red, si falla uso cache)
// ========================
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request.clone());
    
    if (networkResponse.ok) {
      // Guardar en cache dinámico para próxima vez
      const cacheName = request.url.includes('/api/') ? CACHE_API_NAME : CACHE_DYNAMIC_NAME;
      caches.open(cacheName).then(cache => {
        cache.put(request, networkResponse.clone());
      });
    }
    
    return networkResponse;
  } catch (err) {
    console.log('[SW] 📡 Network failed, trying cache...');
    
    // Intentar obtener del cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] ✅ Devolviendo desde cache (Network First)');
      return cachedResponse;
    }

    // Si no hay cache, devolver página offline
    if (request.headers.get('accept').includes('text/html')) {
      console.log('[SW] 📄 Devolviendo página offline');
      return OFFLINE_PAGE;
    }

    // Para API requests sin cache, devolver error JSON
    return new Response(JSON.stringify({ 
      offline: true, 
      message: 'Sin conexión a internet y no hay datos en cache' 
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 503
    });
  }
}

// ========================
// ESTRATEGIA: Cache First (usar cache primero, actualizar en background)
// ========================
async function cacheFirstStrategy(request, cacheName) {
  // 5. Carga desde cache las peticiones offline
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    console.log('[SW] ✅ Devolviendo desde cache (Cache First)');
    
    // Actualizar cache en background (sin bloquear respuesta)
    fetch(request.clone()).then(networkResponse => {
      if (networkResponse.ok) {
        caches.open(cacheName).then(cache => {
          cache.put(request, networkResponse.clone());
          console.log('[SW] 🔄 Cache actualizado en background');
        });
      }
    }).catch(() => {
      // Silenciosamente falla en background
    });

    return cachedResponse;
  }

  // Si no está en cache, intentar red
  try {
    const networkResponse = await fetch(request.clone());
    
    if (networkResponse.ok) {
      caches.open(cacheName).then(cache => {
        cache.put(request, networkResponse.clone());
      });
    }
    
    return networkResponse;
  } catch (err) {
    console.log('[SW] ❌ No cache y network falló');
    
    // Fallback para imágenes
    if (request.headers.get('accept').includes('image')) {
      return new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#f0f0f0" width="100" height="100"/></svg>',
        { headers: { 'Content-Type': 'image/svg+xml' } }
      );
    }

    // Fallback genérico
    return new Response('Recurso no disponible offline', { status: 503 });
  }
}

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
  console.log('\n🔔 ========== PUSH EVENT RECEIVED ==========');
  console.log('[SW] Push event triggered');
  
  let data = { 
    title: 'Notificación de Pokédex', 
    body: 'Tienes una nueva alerta.', 
    icon: '/favicon.svg' 
  };
  
  if (e.data) {
    try {
      data = e.data.json();
      console.log('[SW] Parsed JSON data:', JSON.stringify(data));
    } catch(err) {
      data.body = e.data.text();
      console.log('[SW] Parsed text data:', data.body);
    }
  } else {
    console.warn('[SW] No data in push event');
  }

  console.log('[SW] Title:', data.title);
  console.log('[SW] Body:', data.body);
  console.log('[SW] Icon:', data.icon);

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [100, 50, 100],
    data: { url: data.data?.url || '/' },
    tag: 'pokedex-notification',
    requireInteraction: true
  };

  console.log('[SW] Attempting to show notification...');
  e.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => {
        console.log('✅ Notification displayed successfully!');
        console.log('🔔 ======================================\n');
      })
      .catch(err => {
        console.error('❌ Error showing notification:', err.message);
        console.error('   Error type:', err.name);
        console.error('🔔 ======================================\n');
      })
  );
});

// Listener cuando el usuario hace clic en la notificación
self.addEventListener('notificationclick', e => {
  console.log('[SW] Notification clicked:', e.notification.tag);
  console.log('[SW] Opening URL:', e.notification.data.url);
  e.notification.close();
  
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Buscar si ya hay una ventana abierta
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' && 'focus' in client) {
          console.log('[SW] Found existing client, focusing and navigating...');
          client.focus();
          client.navigate(e.notification.data.url);
          return;
        }
      }
      // Si no hay ventana, abrir una nueva
      if (clients.openWindow) {
        console.log('[SW] Opening new window with URL:', e.notification.data.url);
        return clients.openWindow(e.notification.data.url);
      }
    })
  );
});
