/**
 * GeoEngine Turbo - Motor de Alta Performance para WebGIS
 * - Indexação Espacial em Memória (R-Tree / RBush) em O(log N)
 * - Cache Persistente Local em IndexedDB (Zero consumo de rede no Supabase Free Tier)
 * - Renderização em Chunks com requestAnimationFrame (Zero congelamento de UI / 60 FPS)
 * - Filtros Instantâneos de Atributos e Viewport Culling Ultrarrápido
 */

(function(window) {
    'use strict';

    // --- 1. R-TREE ESPACIAL ULTRA-LEVE E RÁPIDA (RBush) ---
    class QuickRBush {
        constructor(maxEntries = 16) {
            this.maxEntries = Math.max(4, maxEntries);
            this.minEntries = Math.max(2, Math.ceil(this.maxEntries * 0.4));
            this.clear();
        }

        clear() {
            this.data = {
                children: [],
                height: 1,
                leaf: true,
                minX: Infinity,
                minY: Infinity,
                maxX: -Infinity,
                maxY: -Infinity
            };
            return this;
        }

        all() {
            return this._all(this.data, []);
        }

        search(bbox) {
            let node = this.data;
            const result = [];
            if (!this._intersects(bbox, node)) return result;

            const nodesToSearch = [];
            while (node) {
                for (let i = 0; i < node.children.length; i++) {
                    const child = node.children[i];
                    if (this._intersects(bbox, child)) {
                        if (node.leaf) result.push(child);
                        else if (this._contains(bbox, child)) this._all(child, result);
                        else nodesToSearch.push(child);
                    }
                }
                node = nodesToSearch.pop();
            }
            return result;
        }

        load(items) {
            if (!items || !items.length) return this;
            if (items.length < this.minEntries) {
                for (let i = 0; i < items.length; i++) this.insert(items[i]);
                return this;
            }

            // Criação rápida em massa (Bulk-loading)
            let node = this._build(items.slice(), 0, items.length - 1, 0);
            if (!this.data.children.length) {
                this.data = node;
            } else if (this.data.height === node.height) {
                this._splitRoot(this.data, node);
            } else {
                if (this.data.height < node.height) {
                    const tmp = this.data;
                    this.data = node;
                    node = tmp;
                }
                this._insert(node, this.data.height - node.height, this.data);
            }
            return this;
        }

        insert(item) {
            if (item) this._insert(item, this.data.height - 1, this.data);
            return this;
        }

        _build(items, left, right, height) {
            const N = right - left + 1;
            let M = this.maxEntries;
            if (N <= M) {
                const node = {
                    children: items.slice(left, right + 1),
                    height: 1,
                    leaf: true,
                    minX: Infinity,
                    minY: Infinity,
                    maxX: -Infinity,
                    maxY: -Infinity
                };
                this._calcBBox(node);
                return node;
            }

            if (!height) {
                height = Math.ceil(Math.log(N) / Math.log(M));
                M = Math.ceil(N / Math.pow(M, height - 1));
            }

            const node = {
                children: [],
                height: height,
                leaf: false,
                minX: Infinity,
                minY: Infinity,
                maxX: -Infinity,
                maxY: -Infinity
            };

            const N2 = Math.ceil(N / M);
            const N1 = N2 * Math.ceil(Math.sqrt(M));

            this._multiSelect(items, left, right, N1, this._compareMinX);

            for (let i = left; i <= right; i += N1) {
                const right2 = Math.min(i + N1 - 1, right);
                this._multiSelect(items, i, right2, N2, this._compareMinY);
                for (let j = i; j <= right2; j += N2) {
                    const right3 = Math.min(j + N2 - 1, right2);
                    node.children.push(this._build(items, j, right3, height - 1));
                }
            }
            this._calcBBox(node);
            return node;
        }

        _insert(item, level, node) {
            const bbox = item;
            const insertPath = [];
            const childNode = this._chooseSubtree(bbox, node, level, insertPath);

            childNode.children.push(item);
            this._extend(childNode, bbox);

            while (level >= 0) {
                if (insertPath[level].children.length > this.maxEntries) {
                    this._split(insertPath, level);
                    level--;
                } else break;
            }
        }

        _chooseSubtree(bbox, node, level, path) {
            while (true) {
                path.push(node);
                if (node.leaf || path.length - 1 === level) break;

                let minArea = Infinity;
                let minEnlargement = Infinity;
                let targetNode = null;

                for (let i = 0; i < node.children.length; i++) {
                    const child = node.children[i];
                    const area = this._area(child);
                    const enlargement = this._enlargedArea(bbox, child) - area;

                    if (enlargement < minEnlargement) {
                        minEnlargement = enlargement;
                        minArea = area < minArea ? area : minArea;
                        targetNode = child;
                    } else if (enlargement === minEnlargement) {
                        if (area < minArea) {
                            minArea = area;
                            targetNode = child;
                        }
                    }
                }
                node = targetNode || node.children[0];
            }
            return node;
        }

        _split(path, level) {
            const node = path[level];
            const newNode = {
                children: [],
                height: node.height,
                leaf: node.leaf,
                minX: Infinity,
                minY: Infinity,
                maxX: -Infinity,
                maxY: -Infinity
            };

            const splitIndex = Math.floor(node.children.length / 2);
            newNode.children = node.children.splice(splitIndex);

            this._calcBBox(node);
            this._calcBBox(newNode);

            if (level) path[level - 1].children.push(newNode);
            else this._splitRoot(node, newNode);
        }

        _splitRoot(node, newNode) {
            this.data = {
                children: [node, newNode],
                height: node.height + 1,
                leaf: false,
                minX: Infinity,
                minY: Infinity,
                maxX: -Infinity,
                maxY: -Infinity
            };
            this._calcBBox(this.data);
        }

        _calcBBox(node) {
            this._distBBox(node, 0, node.children.length, node);
        }

        _distBBox(node, k, p, destNode) {
            destNode.minX = Infinity;
            destNode.minY = Infinity;
            destNode.maxX = -Infinity;
            destNode.maxY = -Infinity;
            for (let i = k; i < p; i++) {
                const child = node.children[i];
                this._extend(destNode, child);
            }
        }

        _extend(a, b) {
            a.minX = Math.min(a.minX, b.minX);
            a.minY = Math.min(a.minY, b.minY);
            a.maxX = Math.max(a.maxX, b.maxX);
            a.maxY = Math.max(a.maxY, b.maxY);
            return a;
        }

        _area(a) { return Math.max(0, a.maxX - a.minX) * Math.max(0, a.maxY - a.minY); }
        _enlargedArea(a, b) {
            return (Math.max(b.maxX, a.maxX) - Math.min(b.minX, a.minX)) *
                   (Math.max(b.maxY, a.maxY) - Math.min(b.minY, a.minY));
        }

        _intersects(a, b) {
            return b.minX <= a.maxX &&
                   b.minY <= a.maxY &&
                   b.maxX >= a.minX &&
                   b.maxY >= a.minY;
        }

        _contains(a, b) {
            return a.minX <= b.minX &&
                   a.minY <= b.minY &&
                   b.maxX >= a.maxX &&
                   b.maxY >= a.maxY;
        }

        _all(node, result) {
            const nodesToSearch = [];
            while (node) {
                if (node.leaf) result.push(...node.children);
                else nodesToSearch.push(...node.children);
                node = nodesToSearch.pop();
            }
            return result;
        }

        _compareMinX(a, b) { return a.minX - b.minX; }
        _compareMinY(a, b) { return a.minY - b.minY; }

        _multiSelect(arr, left, right, n, compare) {
            const stack = [left, right];
            while (stack.length) {
                right = stack.pop();
                left = stack.pop();
                if (right - left <= n) continue;
                const mid = left + Math.ceil((right - left) / n / 2) * n;
                this._quickSelect(arr, mid, left, right, compare);
                stack.push(left, mid, mid, right);
            }
        }

        _quickSelect(arr, k, left, right, compare) {
            while (right > left) {
                if (right - left > 600) {
                    const n = right - left + 1;
                    const m = k - left + 1;
                    const z = Math.log(n);
                    const s = 0.5 * Math.exp(2 * z / 3);
                    const sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (m - n / 2 < 0 ? -1 : 1);
                    const newLeft = Math.max(left, Math.floor(k - m * s / n + sd));
                    const newRight = Math.min(right, Math.floor(k + (n - m) * s / n + sd));
                    this._quickSelect(arr, k, newLeft, newRight, compare);
                }
                const t = arr[k];
                let i = left;
                let j = right;
                this._swap(arr, left, k);
                if (compare(arr[right], t) > 0) this._swap(arr, left, right);
                while (i < j) {
                    this._swap(arr, i, j);
                    i++;
                    j--;
                    while (compare(arr[i], t) < 0) i++;
                    while (compare(arr[j], t) > 0) j--;
                }
                if (compare(arr[left], t) === 0) this._swap(arr, left, j);
                else {
                    j++;
                    this._swap(arr, j, right);
                }
                if (j <= k) left = j + 1;
                if (k <= j) right = j - 1;
            }
        }

        _swap(arr, i, j) {
            const tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
    }


    // --- 2. INDEXED DB PERSISTENTE PARA CAMADAS PESADAS ---
    const DB_NAME = 'GeoGestor_Turbo_Cache_v1';
    const DB_VERSION = 1;
    const STORE_THEMES = 'cached_themes';
    const STORE_META = 'cache_metadata';

    let dbPromise = null;
    function getDB() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_THEMES)) {
                        db.createObjectStore(STORE_THEMES, { keyPath: 'themeId' });
                    }
                    if (!db.objectStoreNames.contains(STORE_META)) {
                        db.createObjectStore(STORE_META, { keyPath: 'key' });
                    }
                };
                request.onsuccess = (e) => resolve(e.target.result);
                request.onerror = (e) => {
                    console.warn('[GeoTurboDB] Erro ao abrir IndexedDB:', e);
                    resolve(null); // Fallback suave
                };
            });
        }
        return dbPromise;
    }

    const GeoTurboDB = {
        async saveThemeData(themeId, features, count) {
            try {
                const db = await getDB();
                if (!db) return;
                return new Promise((resolve) => {
                    const tx = db.transaction([STORE_THEMES, STORE_META], 'readwrite');
                    const themeStore = tx.objectStore(STORE_THEMES);
                    const metaStore = tx.objectStore(STORE_META);
                    
                    themeStore.put({
                        themeId: themeId,
                        features: features,
                        count: count,
                        timestamp: Date.now()
                    });

                    metaStore.put({
                        key: `theme_${themeId}_updated`,
                        timestamp: Date.now()
                    });

                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                });
            } catch (e) {
                console.warn('[GeoTurboDB] Falha ao salvar no cache:', e);
            }
        },

        async getThemeData(themeId) {
            try {
                const db = await getDB();
                if (!db) return null;
                return new Promise((resolve) => {
                    const tx = db.transaction(STORE_THEMES, 'readonly');
                    const store = tx.objectStore(STORE_THEMES);
                    const req = store.get(themeId);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => resolve(null);
                });
            } catch (e) {
                return null;
            }
        },

        async clearThemeCache(themeId) {
            try {
                const db = await getDB();
                if (!db) return;
                const tx = db.transaction([STORE_THEMES, STORE_META], 'readwrite');
                tx.objectStore(STORE_THEMES).delete(themeId);
                tx.objectStore(STORE_META).delete(`theme_${themeId}_updated`);
            } catch (e) {}
        }
    };


    // --- 3. MOTOR ESPACIAL TURBO COM R-TREE POR TEMA ---
    const themeTrees = new Map(); // themeId -> QuickRBush
    let renderTaskCancelToken = 0;

    function computeBBoxFromGeometry(geometry) {
        if (!geometry || !geometry.coordinates) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        function traverse(coords) {
            if (typeof coords[0] === 'number') {
                const x = coords[0];
                const y = coords[1];
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            } else if (Array.isArray(coords)) {
                for (let i = 0; i < coords.length; i++) {
                    traverse(coords[i]);
                }
            }
        }
        traverse(geometry.coordinates);
        if (minX === Infinity) return null;
        return [minX, minY, maxX, maxY]; // [west, south, east, north] (lng, lat)
    }

    const GeoEngineTurbo = {
        QuickRBush,
        GeoTurboDB,

        // Constrói índice espacial R-Tree para um tema em alta velocidade
        indexThemeFeatures(themeId, features) {
            const tree = new QuickRBush(16);
            const items = [];
            for (let i = 0; i < features.length; i++) {
                const f = features[i];
                if (!f || !f.geometry) continue;

                let bbox = f.properties && f.properties._bbox;
                if (!bbox) {
                    bbox = computeBBoxFromGeometry(f.geometry);
                    if (f.properties) f.properties._bbox = bbox;
                }

                if (bbox) {
                    items.push({
                        minX: bbox[0], // west
                        minY: bbox[1], // south
                        maxX: bbox[2], // east
                        maxY: bbox[3], // north
                        feature: f
                    });
                }
            }
            tree.load(items);
            themeTrees.set(themeId, tree);
            console.log(`[GeoEngineTurbo] R-Tree indexado para "${themeId}": ${items.length} feições indexadas`);
            return tree;
        },

        // Busca feições visíveis no viewport em O(log N) - Microssegundos
        queryViewport(themeId, bounds) {
            const tree = themeTrees.get(themeId);
            if (!tree || !bounds) return null;

            const bbox = {
                minX: bounds.getWest(),
                minY: bounds.getSouth(),
                maxX: bounds.getEast(),
                maxY: bounds.getNorth()
            };

            const hits = tree.search(bbox);
            const result = new Array(hits.length);
            for (let i = 0; i < hits.length; i++) {
                result[i] = hits[i].feature;
            }
            return result;
        },

        // Renderização em Chunks progressivos via requestAnimationFrame (Zero travamento de 60fps)
        renderFeaturesProgressive(geojsonLayer, features, onComplete) {
            renderTaskCancelToken++;
            const currentToken = renderTaskCancelToken;
            
            geojsonLayer.clearLayers();
            if (!features || !features.length) {
                if (onComplete) onComplete();
                return;
            }

            const CHUNK_SIZE = 350; // Quantidade de feições por frame (16ms)
            let index = 0;

            function renderChunk() {
                if (currentToken !== renderTaskCancelToken) return; // Cancelado por nova renderização

                const end = Math.min(index + CHUNK_SIZE, features.length);
                const chunk = features.slice(index, end);
                geojsonLayer.addData(chunk);
                index = end;

                if (index < features.length) {
                    requestAnimationFrame(renderChunk);
                } else {
                    if (onComplete) onComplete();
                }
            }

            // Inicia primeira fatia imediatamente
            renderChunk();
        }
    };

    window.GeoEngineTurbo = GeoEngineTurbo;
    window.GeoTurboDB = GeoTurboDB;

})(window);
