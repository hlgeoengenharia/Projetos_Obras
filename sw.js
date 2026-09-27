// sw.js — Service Worker do GeoGestor (Suporte a PWA e Modo Offline)
const CACHE_NAME = 'geogestor-app-shell-v1';

const CORE_ASSETS = [
    './',
    'index.html',
    'manifest.json',
    'public/favicon.svg',
    'supabase-config.js',
    'src/main.js',
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
            console.log('[ServiceWorker] Pré-carregando App Shell no cache offline...');
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
                    if (key !== CACHE_NAME) {
                        console.log('[ServiceWorker] Removendo cache legado:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Interceptação de Requisições (Fetch)
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Requisições para APIs do Supabase ou endpoints dinâmicos: Network-first
    if (url.origin.includes('supabase.co') || request.method !== 'GET') {
        return; // Deixa o navegador resolver normalmente
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

    // Para assets estáticos: Stale-While-Revalidate / Cache-First
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
                    const TRANSPARENT_1PX_GIF = new Uint8Array([
                        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
                        0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
                        0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
                        0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b
                    ]);
                    return new Response(TRANSPARENT_1PX_GIF, {
                        status: 200,
                        headers: { 'Content-Type': 'image/gif' }
                    });
                }
                throw err;
            });
        })
    );
});
