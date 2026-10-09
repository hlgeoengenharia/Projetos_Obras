// sw.js — Service Worker do GeoGestor (Suporte a PWA e Modo Offline)
const CACHE_NAME = 'geogestor-app-shell-v5';

const CORE_ASSETS = [
    './',
    'index.html',
    'manifest.json',
    'public/favicon.svg',
    'supabase-config.js',
    'src/main.js',
    'src/eventsEngine.js',
    'src/offline-sync.js',
    'src/session-security.js',
    'src/geo-engine-turbo.js',
    'src/formRenderer.js',
    'src/customFields.js',
    'src/tableJoin.js',
    'src/measurement.js',
    'src/spatialAnalytics.js',
    'src/swipe-comparator.js',
    'src/auditLogger.js'
];

// Instalação: Pré-carrega o App Shell no Cache
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Pré-carregando App Shell v5 no cache offline...');
            return cache.addAll(CORE_ASSETS.map(url => new Request(url, { cache: 'reload' })))
                .catch((err) => console.warn('[ServiceWorker] Aviso ao carregar alguns assets:', err));
        }).then(() => self.skipWaiting())
    );
});

// Ativação: Limpa caches legados
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME && key !== TILE_CACHE_NAME) {
                        console.log('[ServiceWorker] Removendo cache legado:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

const TILE_CACHE_NAME = 'geogestor-tiles-v1';

const TRANSPARENT_1PX_GIF = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
    0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b
]);

// Interceptação de Requisições (Fetch)
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. Intercepta tiles de ortofotos e imagens do Storage: Cache-First resiliente
    const isTileOrRaster = url.origin.includes('supabase.co') && 
        (url.pathname.includes('/storage/v1/object/public/') || url.pathname.includes('/tiles/')) &&
        (url.pathname.endsWith('.webp') || url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.jpeg'));

    if (isTileOrRaster && request.method === 'GET') {
        event.respondWith(
            caches.open(TILE_CACHE_NAME).then((tileCache) => {
                return tileCache.match(request).then((cachedTile) => {
                    if (cachedTile) {
                        return cachedTile; // Instantâneo: 0ms do cache local sem gastar rede!
                    }
                    return fetch(request).then((networkRes) => {
                        if (networkRes && networkRes.status === 200) {
                            tileCache.put(request, networkRes.clone());
                        }
                        return networkRes;
                    }).catch(() => {
                        return new Response(TRANSPARENT_1PX_GIF, {
                            status: 200,
                            headers: { 'Content-Type': 'image/gif' }
                        });
                    });
                });
            })
        );
        return;
    }

    // Requisições para APIs do Supabase (REST/Auth/Realtime): Network-first
    if (url.origin.includes('supabase.co') || request.method !== 'GET') {
        return; // Deixa o navegador resolver normalmente
    }

    // Para scripts da aplicação (.js): Network-First com fallback para cache offline (evita scripts antigos presos)
    const isAppScript = url.origin === self.location.origin && (url.pathname.endsWith('.js') || url.pathname.includes('/src/'));
    if (isAppScript) {
        event.respondWith(
            fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                return caches.match(request, { ignoreSearch: true })
                    .then(cached => cached || caches.match(url.pathname, { ignoreSearch: true }));
            })
        );
        return;
    }

    // Para requisições de navegação (HTML): Tenta rede, fallback para cache
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => {
                return caches.match('index.html') || caches.match('./');
            })
        );
        return;
    }

    // Para outros assets estáticos: Stale-While-Revalidate / Cache-First
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                // Atualiza em background se houver internet
                fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, networkResponse.clone());
                        });
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            return fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return networkResponse;
            }).catch((err) => {
                // Se offline e não tem no cache, retorna tile transparente amigável (200) para evitar erros vermelhos no console
                if (request.destination === 'image' || url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg')) {
                    return new Response(TRANSPARENT_1PX_GIF, {
                        status: 200,
                        headers: { 'Content-Type': 'image/gif' }
                    });
                }
                // Para navegação HTML, iframes e documentos, tenta retornar do cache ou resposta controlada
                if (request.mode === 'navigate' || request.destination === 'iframe' || request.destination === 'document' || url.pathname.endsWith('.html')) {
                    const cleanPath = url.pathname.split('/').pop() || 'index.html';
                    return caches.match(url.pathname, { ignoreSearch: true })
                        .then(match => match || caches.match(cleanPath, { ignoreSearch: true }))
                        .then(match => {
                            if (match) return match;
                            return fetch(request);
                        })
                        .catch(() => {
                            return caches.match('index.html')
                                .then(cachedIndex => cachedIndex || new Response('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Modo Offline</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;padding:24px;text-align:center;background:#0b1329;color:#fff;"><h3>Conexão Instável / Modo Offline</h3><p style="font-size:13px;color:#cbd5e1;">Seus dados continuam seguros no aparelho. O sistema reconectará automaticamente assim que o sinal estabilizar.</p></body></html>', {
                                    status: 200,
                                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                                }));
                        });
                }
                return new Response('', { status: 408, statusText: 'Offline/Timeout' });
            });
        })
    );
});
