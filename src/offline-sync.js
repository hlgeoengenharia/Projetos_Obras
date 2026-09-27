// src/offline-sync.js
/**
 * Módulo de Coleta Offline e Sincronização em Lote (IndexedDB Outbox Engine)
 * - Fila de persistência local para novas feições, edições de atributos e exclusões
 * - Suporte a fotos e geometrias completas no IndexedDB
 * - Sincronização automática com Supabase ao restabelecer conexão 4G/Wi-Fi
 * - Indicador visual de status (Online / Modo Offline / Pendências) e botão manual de sincronização
 */

(function() {
    const DB_NAME = 'GeoGestorOfflineSyncDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'offline_sync_queue';

    let dbPromise = null;
    let isSyncing = false;

    // Inicialização segura do IndexedDB
    function getDB() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve) => {
                if (typeof indexedDB === 'undefined') {
                    console.warn('[OfflineSync] IndexedDB não suportado neste navegador.');
                    resolve(null);
                    return;
                }
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = function(e) {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                        store.createIndex('themeId', 'themeId', { unique: false });
                        store.createIndex('status', 'status', { unique: false });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                };
                request.onsuccess = function(e) {
                    resolve(e.target.result);
                };
                request.onerror = function(err) {
                    console.error('[OfflineSync] Erro ao abrir IndexedDB:', err);
                    resolve(null);
                };
            });
        }
        return dbPromise;
    }

    // Adiciona feição criada offline à fila
    async function enqueueCreate(themeId, feature) {
        const db = await getDB();
        if (!db) return null;

        const tempId = feature.properties._tempId || `offline_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        feature.properties._tempId = tempId;
        feature.properties._offlinePending = true;

        const queueItem = {
            action: 'CREATE',
            themeId: String(themeId),
            tempId: tempId,
            geometry: feature.geometry,
            properties: JSON.parse(JSON.stringify(feature.properties)),
            timestamp: Date.now(),
            status: 'pending'
        };

        return new Promise((resolve) => {
            const tx = db.transaction([STORE_NAME], 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.add(queueItem);
            req.onsuccess = function() {
                updateUIBadge();
                console.log(`[OfflineSync] Nova feição #${tempId} enfileirada para sincronização futura.`);
                resolve(queueItem);
            };
            req.onerror = function(e) {
                console.error('[OfflineSync] Falha ao enfileirar criação:', e);
                resolve(null);
            };
        });
    }

    // Adiciona atualização de feição existente à fila
    async function enqueueUpdate(themeId, featureId, properties, geometry) {
        const db = await getDB();
        if (!db) return null;

        const queueItem = {
            action: 'UPDATE',
            themeId: String(themeId),
            idBanco: typeof featureId === 'number' ? featureId : (properties.id_banco || null),
            tempId: properties._tempId || null,
            geometry: geometry,
            properties: JSON.parse(JSON.stringify(properties)),
            timestamp: Date.now(),
            status: 'pending'
        };

        return new Promise((resolve) => {
            const tx = db.transaction([STORE_NAME], 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.add(queueItem);
            req.onsuccess = function() {
                updateUIBadge();
                console.log(`[OfflineSync] Atualização da feição #${featureId} enfileirada.`);
                resolve(queueItem);
            };
            req.onerror = function(e) {
                console.error('[OfflineSync] Falha ao enfileirar atualização:', e);
                resolve(null);
            };
        });
    }

    // Adiciona exclusão de feição à fila
    async function enqueueDelete(themeId, idBanco, tempId) {
        const db = await getDB();
        if (!db) return null;

        // Se a feição foi criada offline e ainda não foi enviada para o banco, podemos remover a criação da fila diretamente
        if (!idBanco && tempId) {
            const items = await getPendingItems();
            const found = items.find(it => it.tempId === tempId && it.action === 'CREATE');
            if (found && found.id) {
                await removeQueueItem(found.id);
                updateUIBadge();
                console.log(`[OfflineSync] Criação pendente #${tempId} cancelada e removida da fila.`);
                return true;
            }
        }

        const queueItem = {
            action: 'DELETE',
            themeId: String(themeId),
            idBanco: idBanco,
            tempId: tempId,
            timestamp: Date.now(),
            status: 'pending'
        };

        return new Promise((resolve) => {
            const tx = db.transaction([STORE_NAME], 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.add(queueItem);
            req.onsuccess = function() {
                updateUIBadge();
                console.log(`[OfflineSync] Exclusão da feição #${idBanco || tempId} enfileirada.`);
                resolve(true);
            };
            req.onerror = function() {
                resolve(false);
            };
        });
    }

    // Retorna todos os itens pendentes na fila
    async function getPendingItems() {
        const db = await getDB();
        if (!db) return [];
        return new Promise((resolve) => {
            const tx = db.transaction([STORE_NAME], 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    // Retorna a contagem de itens pendentes
    async function getPendingCount() {
        const db = await getDB();
        if (!db) return 0;
        return new Promise((resolve) => {
            const tx = db.transaction([STORE_NAME], 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.count();
            req.onsuccess = () => resolve(req.result || 0);
            req.onerror = () => resolve(0);
        });
    }

    // Remove um item da fila após sincronizado
    async function removeQueueItem(id) {
        const db = await getDB();
        if (!db) return;
        return new Promise((resolve) => {
            const tx = db.transaction([STORE_NAME], 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    }

    // Converte DataURL em Blob para envio ao Supabase Storage
    function dataURLtoBlob(dataurl) {
        try {
            const arr = dataurl.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new Blob([u8arr], { type: mime });
        } catch (e) {
            console.error('[OfflineSync] Erro ao converter dataURL em Blob:', e);
            return null;
        }
    }

    // Faz upload de fotos/documentos coletados offline para o Supabase Storage
    async function uploadPendingOfflineFiles(props) {
        if (!props || !window.supabaseClient) return props;
        const mId = (typeof activeMunicipioId !== 'undefined' && activeMunicipioId) ? activeMunicipioId : 'geral';
        for (const key of Object.keys(props)) {
            const val = props[key];
            if (Array.isArray(val)) {
                for (const fileObj of val) {
                    if (fileObj && fileObj.url && fileObj.url.startsWith('data:') && (fileObj.offlinePending || (fileObj.path && fileObj.path.startsWith('offline_')))) {
                        try {
                            const fileExt = fileObj.name ? (fileObj.name.split('.').pop() || 'jpg') : 'jpg';
                            const folderPrefix = `anexos_${mId}`;
                            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                            const targetPath = `${folderPrefix}/${fileName}`;
                            
                            const blob = dataURLtoBlob(fileObj.url);
                            if (blob) {
                                const { error: upErr } = await window.supabaseClient.storage.from('obras_arquivos').upload(targetPath, blob, {
                                    cacheControl: '3600',
                                    upsert: true
                                });
                                if (!upErr) {
                                    const { data: { publicUrl } } = window.supabaseClient.storage.from('obras_arquivos').getPublicUrl(targetPath);
                                    fileObj.url = publicUrl;
                                    fileObj.path = targetPath;
                                    delete fileObj.offlinePending;
                                    console.log(`[OfflineSync] Foto offline "${fileObj.name}" enviada ao Storage com sucesso: ${publicUrl}`);
                                }
                            }
                        } catch (eUpload) {
                            console.warn('[OfflineSync] Falha ao enviar foto offline para Storage:', eUpload);
                        }
                    }
                }
            }
        }
        return props;
    }

    // Executa a sincronização completa de todos os itens com o Supabase
    async function syncAll(isAuto = false) {
        if (isSyncing) {
            console.log('[OfflineSync] Sincronização já em andamento...');
            return;
        }

        if (!navigator.onLine) {
            if (!isAuto) {
                showToast("Sem conexão com a internet. Os dados continuam salvos com segurança no aparelho.", "wifi_off", "amber");
            }
            return;
        }

        if (!window.supabaseClient) {
            console.warn('[OfflineSync] supabaseClient não inicializado.');
            return;
        }

        const items = await getPendingItems();
        if (!items || items.length === 0) {
            if (!isAuto) {
                showToast("Nenhuma coleta pendente. Todas as camadas estão 100% sincronizadas!", "check_circle", "emerald");
            }
            updateUIBadge();
            return;
        }

        isSyncing = true;
        updateUIBadge();

        let successCount = 0;
        let failCount = 0;

        for (const item of items) {
            try {
                if (item.action === 'CREATE') {
                    // Limpa marcadores internos temporários antes de enviar
                    let cleanProps = { ...item.properties };
                    delete cleanProps._offlinePending;
                    cleanProps = await uploadPendingOfflineFiles(cleanProps);

                    const { data: insData, error: insErr } = await window.supabaseClient
                        .from('feicoes')
                        .insert({
                            theme_id: item.themeId,
                            propriedades: cleanProps,
                            geometria: item.geometry
                        })
                        .select();

                    if (!insErr && insData && insData.length > 0) {
                        const newIdBanco = insData[0].id;
                        // Atualiza na memória local
                        if (typeof themes !== 'undefined') {
                            const th = themes.find(t => String(t.id) === String(item.themeId));
                            if (th && th.features) {
                                const f = th.features.find(x => x.properties?._tempId === item.tempId);
                                if (f) {
                                    f.properties = { ...f.properties, ...cleanProps, id_banco: newIdBanco };
                                    delete f.properties._offlinePending;
                                }
                                if (window.GeoTurboDB && typeof window.GeoTurboDB.saveThemeData === 'function') {
                                    window.GeoTurboDB.saveThemeData(th.id, th.features, th.features.length);
                                }
                            }
                        }
                        await removeQueueItem(item.id);
                        successCount++;
                    } else {
                        console.error('[OfflineSync] Erro ao sincronizar CREATE:', insErr);
                        failCount++;
                    }
                } else if (item.action === 'UPDATE') {
                    if (item.idBanco) {
                        let cleanProps = { ...item.properties };
                        delete cleanProps._offlinePending;
                        cleanProps = await uploadPendingOfflineFiles(cleanProps);

                        const { error: updErr } = await window.supabaseClient
                            .from('feicoes')
                            .update({
                                propriedades: cleanProps,
                                geometria: item.geometry
                            })
                            .eq('id', item.idBanco);

                        if (!updErr) {
                            if (typeof themes !== 'undefined') {
                                const th = themes.find(t => String(t.id) === String(item.themeId));
                                if (th && th.features) {
                                    const f = th.features.find(x => x.properties?.id_banco === item.idBanco);
                                    if (f) {
                                        f.properties = { ...f.properties, ...cleanProps };
                                        delete f.properties._offlinePending;
                                    }
                                    if (window.GeoTurboDB && typeof window.GeoTurboDB.saveThemeData === 'function') {
                                        window.GeoTurboDB.saveThemeData(th.id, th.features, th.features.length);
                                    }
                                }
                            }
                            await removeQueueItem(item.id);
                            successCount++;
                        } else {
                            console.error('[OfflineSync] Erro ao sincronizar UPDATE:', updErr);
                            failCount++;
                        }
                    } else {
                        // Sem ID de banco, remove item órfão
                        await removeQueueItem(item.id);
                    }
                } else if (item.action === 'DELETE') {
                    if (item.idBanco) {
                        const { error: delErr } = await window.supabaseClient
                            .from('feicoes')
                            .update({ deletado_em: new Date().toISOString() })
                            .eq('id', item.idBanco);

                        if (!delErr) {
                            await removeQueueItem(item.id);
                            successCount++;
                        } else {
                            console.error('[OfflineSync] Erro ao sincronizar DELETE:', delErr);
                            failCount++;
                        }
                    } else {
                        await removeQueueItem(item.id);
                    }
                }
            } catch(e) {
                console.error('[OfflineSync] Exceção durante item da sincronização:', e);
                failCount++;
            }
        }

        isSyncing = false;
        updateUIBadge();

        if (successCount > 0) {
            showToast(`${successCount} coleta(s) de campo sincronizada(s) com o servidor com sucesso!`, "cloud_done", "emerald");
            if (typeof loadAllFeaturesToMap === 'function') {
                loadAllFeaturesToMap();
            }
        } else if (failCount > 0) {
            showToast(`Houve erro em ${failCount} item(ns). Tentaremos novamente assim que o sinal estabilizar.`, "error", "rose");
        }
    }

    // Toast de Notificação
    function showToast(message, icon = 'info', color = 'sky') {
        const existing = document.getElementById('offline-sync-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'offline-sync-toast';
        toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-950/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.6)] border border-${color}-500/50 z-[99999] flex items-center gap-3 transition-all duration-300 transform translate-y-10 opacity-0 pointer-events-none select-none`;
        toast.innerHTML = `
            <span class="material-symbols-outlined text-${color}-400 text-xl">${icon}</span>
            <span class="font-medium text-xs tracking-wide text-slate-100">${message}</span>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.remove('translate-y-10', 'opacity-0'), 10);
        setTimeout(() => {
            toast.classList.add('translate-y-10', 'opacity-0');
            setTimeout(() => toast.remove(), 350);
        }, 4000);
    }

    // Cria e Atualiza o Badge Indicador de Conexão e Fila de Sincronização
    async function updateUIBadge() {
        const count = await getPendingCount();
        const isOnline = navigator.onLine;

        let badgeEl = document.getElementById('offline-sync-badge');
        if (!badgeEl) {
            badgeEl = document.createElement('div');
            badgeEl.id = 'offline-sync-badge';
            badgeEl.className = 'fixed top-[62px] md:top-[74px] right-3 md:right-4 z-[45] select-none transition-all duration-300';
            document.body.appendChild(badgeEl);
        }

        if (isSyncing) {
            badgeEl.innerHTML = `
                <div class="header-glass-card inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl border border-sky-500/40 text-sky-300 text-xs font-bold shadow-lg animate-pulse">
                    <span class="material-symbols-outlined text-[18px] animate-spin text-sky-400">sync</span>
                    <span>Sincronizando...</span>
                </div>
            `;
            badgeEl.classList.remove('hidden');
            return;
        }

        if (!isOnline) {
            badgeEl.innerHTML = `
                <div onclick="window.OfflineSync.showPendingModal()" class="header-glass-card inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl border border-amber-500/50 text-amber-300 text-xs font-bold shadow-lg cursor-pointer hover:bg-amber-500/10 active:scale-95 transition-all" title="Modo Offline Ativo — Clique para ver coletas salvas">
                    <span class="material-symbols-outlined text-[17px] text-amber-400">wifi_off</span>
                    <span>Modo Offline</span>
                    ${count > 0 ? `<span class="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-black text-[10px]">${count}</span>` : ''}
                </div>
            `;
            badgeEl.classList.remove('hidden');
            return;
        }

        if (count > 0) {
            badgeEl.innerHTML = `
                <button onclick="window.OfflineSync.syncAll()" class="header-glass-card inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl border border-emerald-500/60 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 text-xs font-bold shadow-lg shadow-emerald-500/10 cursor-pointer active:scale-95 transition-all" title="Clique para enviar as coletas de campo ao servidor central">
                    <span class="material-symbols-outlined text-[17px] text-emerald-400">cloud_upload</span>
                    <span>Sincronizar</span>
                    <span class="px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px]">${count}</span>
                </button>
            `;
            badgeEl.classList.remove('hidden');
            return;
        }

        // Se online e sem pendências: oculta ou mostra badge sutil quando desejado
        badgeEl.innerHTML = `
            <div class="header-glass-card hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-2xl border border-white/10 text-slate-400 dark:text-slate-300 text-[11px] font-semibold opacity-75 hover:opacity-100 transition-opacity" title="Conexão estável com o banco central">
                <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]"></span>
                <span>Online</span>
            </div>
        `;
    }

    // Modal para visualizar itens pendentes no aparelho
    async function showPendingModal() {
        const items = await getPendingItems();
        let modal = document.getElementById('offline-pending-modal');
        if (modal) modal.remove();

        const count = items.length;
        const modalDiv = document.createElement('div');
        modalDiv.id = 'offline-pending-modal';
        modalDiv.className = 'fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-[999999] select-none';
        
        let listHtml = '';
        if (count === 0) {
            listHtml = '<div class="text-center py-8 text-slate-400 text-xs">Nenhuma coleta pendente no momento.</div>';
        } else {
            listHtml = items.map((it, idx) => {
                const actionLabel = it.action === 'CREATE' ? 'Nova Feição' : (it.action === 'UPDATE' ? 'Edição' : 'Exclusão');
                const actionColor = it.action === 'CREATE' ? 'emerald' : (it.action === 'UPDATE' ? 'sky' : 'rose');
                const dateStr = new Date(it.timestamp).toLocaleTimeString();
                const geomType = it.geometry ? it.geometry.type : 'Registro';
                return `
                    <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-white/10 text-xs">
                        <div class="flex items-center gap-2.5">
                            <span class="px-2 py-0.5 rounded text-[9.5px] font-bold bg-${actionColor}-500/20 text-${actionColor}-400 border border-${actionColor}-500/30">${actionLabel}</span>
                            <span class="text-white font-medium">${geomType} (${it.themeId})</span>
                        </div>
                        <span class="text-slate-400 font-mono text-[11px]">${dateStr}</span>
                    </div>
                `;
            }).join('');
        }

        modalDiv.innerHTML = `
            <div class="bg-[#0b1329] border border-amber-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col text-white animate-bounce-short">
                <div class="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-amber-400 text-2xl">cloud_sync</span>
                        <h3 class="font-bold text-sm tracking-wide text-white">Coletas Offline Salvas no Aparelho</h3>
                    </div>
                    <button onclick="document.getElementById('offline-pending-modal').remove()" class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer">
                        <span class="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>
                <p class="text-xs text-slate-300 mb-4 leading-relaxed">
                    Total de <strong>${count} coleta(s)</strong> armazenadas no banco local do dispositivo. Elas serão transmitidas ao servidor assim que houver sinal de internet.
                </p>
                <div class="space-y-2 max-h-60 overflow-y-auto mb-5 pr-1">
                    ${listHtml}
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="document.getElementById('offline-pending-modal').remove()" class="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer">
                        Fechar
                    </button>
                    ${navigator.onLine && count > 0 ? `
                        <button onclick="document.getElementById('offline-pending-modal').remove(); window.OfflineSync.syncAll();" class="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs cursor-pointer shadow-lg shadow-emerald-500/20">
                            Sincronizar Agora
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
        document.body.appendChild(modalDiv);
    }

    // Auto-sincronização ao recuperar conexão
    window.addEventListener('online', function() {
        updateUIBadge();
        setTimeout(() => {
            syncAll(true);
        }, 1500);
    });

    window.addEventListener('offline', function() {
        updateUIBadge();
    });

    // Inicialização do badge e verificação
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(updateUIBadge, 500);
        });
    } else {
        setTimeout(updateUIBadge, 500);
    }

    // API Global
    window.OfflineSync = {
        enqueueCreate: enqueueCreate,
        enqueueUpdate: enqueueUpdate,
        enqueueDelete: enqueueDelete,
        getPendingItems: getPendingItems,
        getPendingCount: getPendingCount,
        syncAll: syncAll,
        updateUIBadge: updateUIBadge,
        showPendingModal: showPendingModal
    };
})();
