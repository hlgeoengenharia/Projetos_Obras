/**
 * Módulo de Comparador Temporal de Camadas / Cortina com Carrossel 3D (Cover Flow)
 * Ativação direta, seleção interativa de ortofotos em carrossel 3D e botão discreto de fechar.
 */

(function() {
    let _active = false;
    let _leftLayer = null;
    let _rightLayer = null;
    let _leftRasterObj = null;
    let _rightRasterObj = null;
    let _availableRasters = [];
    let _dividerX = 0.5; // 0.0 a 1.0
    let _isDragging = false;
    let _carouselIndex = 0;

    // Elementos DOM
    let _containerEl = null;
    let _dividerLineEl = null;
    let _carouselEl = null;

    function getMap() {
        return window.map || (typeof map !== 'undefined' ? map : null);
    }

    function getDateFormatted(r) {
        if (!r) return '';
        const effDate = r.data_imagem || localStorage.getItem(`raster_date_${r.id}`);
        if (effDate) return effDate.split('-').reverse().join('/');
        const matchDate = r.nome?.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
        const matchYear = r.nome?.match(/(20\d{2})/);
        if (matchDate) return `${matchDate[1]}/${matchDate[2]}/${matchDate[3]}`;
        if (matchYear) return matchYear[1] || '';
        return '';
    }

    function initSwipeUI() {
        if (_containerEl) return;

        _containerEl = document.createElement('div');
        _containerEl.id = 'swipe-comparator-overlay';
        _containerEl.className = 'pointer-events-none absolute inset-0 z-[400] hidden overflow-hidden select-none';

        _containerEl.innerHTML = `
            <style>
                .swipe-3d-perspective {
                    perspective: 1200px;
                    perspective-origin: 50% 50%;
                }
                .swipe-card-3d {
                    transition: transform 0.35s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease, box-shadow 0.3s ease;
                    transform-style: preserve-3d;
                }
                .swipe-card-left-active {
                    border-color: #10b981 !important;
                    box-shadow: 0 0 20px rgba(16, 185, 129, 0.45) !important;
                    transform: scale(1.04) translateZ(20px) !important;
                }
                .swipe-card-right-active {
                    border-color: #0ea5e9 !important;
                    box-shadow: 0 0 20px rgba(14, 165, 233, 0.45) !important;
                    transform: scale(1.04) translateZ(20px) !important;
                }
                .swipe-card-both-active {
                    border-color: #a855f7 !important;
                    box-shadow: 0 0 20px rgba(168, 85, 247, 0.45) !important;
                    transform: scale(1.06) translateZ(30px) !important;
                }
            </style>

            <!-- Linha Divisora Vertical -->
            <div id="swipe-divider-line" class="absolute top-0 bottom-0 w-[3px] bg-white shadow-[0_0_15px_rgba(0,0,0,0.9)] pointer-events-auto cursor-ew-resize transition-none flex items-center justify-center" style="left: 50%;">
                <div id="swipe-divider-handle" class="w-9 h-9 -ml-[1px] bg-slate-900/95 text-white rounded-full border-2 border-white shadow-2xl flex items-center justify-center cursor-ew-resize hover:scale-110 active:scale-95 transition-transform backdrop-blur-md">
                    <span class="material-symbols-outlined text-[18px] text-sky-400">compare_arrows</span>
                </div>
            </div>

            <!-- Carrossel 3D Flutuante no Topo com Botão Discreto de Fechar -->
            <div class="absolute top-16 md:top-20 left-1/2 -translate-x-1/2 pointer-events-auto z-20 max-w-[94vw] md:max-w-2xl w-full px-2">
                <div class="relative bg-slate-900/85 backdrop-blur-xl border border-white/20 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.6)] p-3 flex flex-col gap-2">
                    
                    <!-- Botão Fechar Discreto (Apenas o X) no Canto do Carrossel -->
                    <button onclick="window.SwipeComparator.stop()" title="Fechar Comparador" class="absolute -top-2.5 -right-2.5 w-7 h-7 bg-slate-800 hover:bg-rose-600 text-white rounded-full border border-white/30 shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-90 cursor-pointer">
                        <span class="material-symbols-outlined text-[16px]">close</span>
                    </button>

                    <!-- Header do Carrossel: Indicadores Lado Esquerdo / Direito -->
                    <div class="flex items-center justify-between px-1 text-[11px] font-bold text-slate-300">
                        <div class="flex items-center gap-1.5 text-emerald-400">
                            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                            <span>ESQUERDA:</span>
                            <span id="swipe-current-left-name" class="text-white font-extrabold truncate max-w-[120px] md:max-w-[180px]">—</span>
                        </div>
                        <div class="text-[10px] text-slate-400 uppercase tracking-widest hidden sm:block">
                            Linha do Tempo 3D
                        </div>
                        <div class="flex items-center gap-1.5 text-sky-400">
                            <span>DIREITA:</span>
                            <span id="swipe-current-right-name" class="text-white font-extrabold truncate max-w-[120px] md:max-w-[180px]">—</span>
                            <span class="w-2.5 h-2.5 rounded-full bg-sky-500 shadow-[0_0_8px_#0ea5e9]"></span>
                        </div>
                    </div>

                    <!-- Container do Carrossel 3D -->
                    <div class="relative w-full overflow-hidden py-2 swipe-3d-perspective">
                        <!-- Botão Anterior -->
                        <button onclick="window.SwipeComparator.prevCard()" class="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-black/60 hover:bg-black/90 text-white rounded-full flex items-center justify-center backdrop-blur-md border border-white/20 transition-all hover:scale-110 active:scale-90">
                            <span class="material-symbols-outlined text-[18px]">chevron_left</span>
                        </button>

                        <!-- Cards 3D Container -->
                        <div id="swipe-carousel-track" class="flex items-center justify-center gap-3 md:gap-4 px-8 overflow-x-auto no-scrollbar scroll-smooth">
                            <!-- Injetado dinamicamente via renderCarousel() -->
                        </div>

                        <!-- Botão Próximo -->
                        <button onclick="window.SwipeComparator.nextCard()" class="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-black/60 hover:bg-black/90 text-white rounded-full flex items-center justify-center backdrop-blur-md border border-white/20 transition-all hover:scale-110 active:scale-90">
                            <span class="material-symbols-outlined text-[18px]">chevron_right</span>
                        </button>
                    </div>

                    <!-- Dica rápida -->
                    <div class="text-[10px] text-center text-slate-400 flex items-center justify-center gap-2">
                        <span>💡 Clique em um card para alternar entre <b>Lado Esquerdo</b> ou <b>Lado Direito</b></span>
                    </div>
                </div>
            </div>
        `;

        const mapContainer = document.getElementById('map');
        if (mapContainer && mapContainer.parentElement) {
            mapContainer.parentElement.appendChild(_containerEl);
        } else {
            document.body.appendChild(_containerEl);
        }

        _dividerLineEl = document.getElementById('swipe-divider-line');
        _carouselEl = document.getElementById('swipe-carousel-track');

        setupDragEvents();
    }

    function setupDragEvents() {
        if (!_dividerLineEl) return;

        function startDrag(e) {
            _isDragging = true;
            e.preventDefault();
            document.body.style.cursor = 'ew-resize';
        }

        function onMove(e) {
            if (!_isDragging || !_active) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const mapEl = document.getElementById('map');
            if (!mapEl) return;

            const rect = mapEl.getBoundingClientRect();
            let x = (clientX - rect.left) / rect.width;
            x = Math.max(0.02, Math.min(0.98, x));
            _dividerX = x;
            updateClip();
        }

        function endDrag() {
            if (_isDragging) {
                _isDragging = false;
                document.body.style.cursor = '';
            }
        }

        _dividerLineEl.addEventListener('mousedown', startDrag);
        _dividerLineEl.addEventListener('touchstart', startDrag, { passive: false });

        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });

        window.addEventListener('mouseup', endDrag);
        window.addEventListener('touchend', endDrag);
    }

    function updateClip() {
        if (!_active || !_leftLayer || !_rightLayer) return;
        const mapInstance = getMap();
        if (!mapInstance) return;

        const mapSize = mapInstance.getSize();
        if (!mapSize || mapSize.x === 0 || mapSize.y === 0) return;

        const clipPixelX = mapSize.x * _dividerX;

        // Atualiza posição do divisor visual
        if (_dividerLineEl) {
            _dividerLineEl.style.left = `${_dividerX * 100}%`;
        }

        // Converte os pontos da tela para o sistema de coordenadas do contêiner de camadas do Leaflet
        const nw = mapInstance.containerPointToLayerPoint([0, 0]);
        const se = mapInstance.containerPointToLayerPoint(mapSize);
        const clipPoint = mapInstance.containerPointToLayerPoint([clipPixelX, 0]);

        const leftContainer = _leftLayer.getContainer ? _leftLayer.getContainer() : (_leftLayer._image || null);
        const rightContainer = _rightLayer.getContainer ? _rightLayer.getContainer() : (_rightLayer._image || null);

        if (leftContainer) {
            leftContainer.style.clip = `rect(${nw.y}px, ${clipPoint.x}px, ${se.y}px, ${nw.x}px)`;
            leftContainer.style.clipPath = `polygon(${nw.x}px ${nw.y}px, ${clipPoint.x}px ${nw.y}px, ${clipPoint.x}px ${se.y}px, ${nw.x}px ${se.y}px)`;
            leftContainer.style.webkitClipPath = `polygon(${nw.x}px ${nw.y}px, ${clipPoint.x}px ${nw.y}px, ${clipPoint.x}px ${se.y}px, ${nw.x}px ${se.y}px)`;
        }

        if (rightContainer) {
            rightContainer.style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${clipPoint.x}px)`;
            rightContainer.style.clipPath = `polygon(${clipPoint.x}px ${nw.y}px, ${se.x}px ${nw.y}px, ${se.x}px ${se.y}px, ${clipPoint.x}px ${se.y}px)`;
            rightContainer.style.webkitClipPath = `polygon(${clipPoint.x}px ${nw.y}px, ${se.x}px ${nw.y}px, ${se.x}px ${se.y}px, ${clipPoint.x}px ${se.y}px)`;
        }
    }

    function createLeafletRasterLayer(raster) {
        const isXYZ = (raster.tipo === 'xyz_tiles') || (raster.url_imagem && raster.url_imagem.includes('{z}'));
        if (isXYZ) {
            const nativeMax = raster.zoom_max || 22;
            const lyr = L.tileLayer(raster.url_imagem, {
                minZoom: 1,
                minNativeZoom: raster.zoom_min || 14,
                maxNativeZoom: nativeMax,
                maxZoom: 24,
                keepBuffer: 16,
                opacity: 1.0,
                zIndex: 300,
                attribution: raster.nome || 'Ortofoto'
            });
            lyr.on('tileload', updateClip);
            lyr.on('load', updateClip);
            return lyr;
        } else if (raster.bbox && Array.isArray(raster.bbox) && raster.bbox.length === 2) {
            const lyr = L.imageOverlay(raster.url_imagem, raster.bbox, {
                opacity: 1.0,
                zIndex: 300,
                interactive: false
            });
            lyr.on('load', updateClip);
            return lyr;
        }
        return null;
    }

    // Renderiza os Cards 3D no Carrossel
    function renderCarousel() {
        if (!_carouselEl || _availableRasters.length === 0) return;

        const leftNameEl = document.getElementById('swipe-current-left-name');
        const rightNameEl = document.getElementById('swipe-current-right-name');

        if (leftNameEl && _leftRasterObj) {
            const dL = getDateFormatted(_leftRasterObj);
            leftNameEl.textContent = dL ? `${_leftRasterObj.nome} (${dL})` : _leftRasterObj.nome;
        }
        if (rightNameEl && _rightRasterObj) {
            const dR = getDateFormatted(_rightRasterObj);
            rightNameEl.textContent = dR ? `${_rightRasterObj.nome} (${dR})` : _rightRasterObj.nome;
        }

        _carouselEl.innerHTML = _availableRasters.map((r, idx) => {
            const isLeft = (_leftRasterObj && _leftRasterObj.id === r.id);
            const isRight = (_rightRasterObj && _rightRasterObj.id === r.id);
            const dateStr = getDateFormatted(r);

            let statusClass = 'border-white/10 opacity-75 hover:opacity-100 hover:scale-100 scale-95';
            let badgeHtml = '';

            if (isLeft && isRight) {
                statusClass = 'swipe-card-both-active opacity-100';
                badgeHtml = `<span class="px-2 py-0.5 rounded-md bg-purple-500 text-white font-extrabold text-[9px] shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[11px]">compare</span> AMBOS</span>`;
            } else if (isLeft) {
                statusClass = 'swipe-card-left-active opacity-100';
                badgeHtml = `<span class="px-2 py-0.5 rounded-md bg-emerald-500 text-white font-extrabold text-[9px] shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[11px]">arrow_back</span> ESQUERDA</span>`;
            } else if (isRight) {
                statusClass = 'swipe-card-right-active opacity-100';
                badgeHtml = `<span class="px-2 py-0.5 rounded-md bg-sky-500 text-white font-extrabold text-[9px] shadow-sm flex items-center gap-1">DIREITA <span class="material-symbols-outlined text-[11px]">arrow_forward</span></span>`;
            } else {
                badgeHtml = `<span class="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-400 font-bold text-[9px] border border-white/10">CLIQUE P/ ATIVAR</span>`;
            }

            return `
                <div onclick="window.SwipeComparator.selectCard('${r.id}')"
                     class="swipe-card-3d shrink-0 w-44 md:w-52 p-2.5 rounded-xl bg-gradient-to-b from-slate-800/90 to-slate-950/95 border backdrop-blur-md cursor-pointer transition-all shadow-xl select-none ${statusClass}">
                    
                    <div class="flex items-center justify-between gap-1 mb-1.5">
                        <div class="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-[15px]">satellite_alt</span>
                        </div>
                        ${badgeHtml}
                    </div>

                    <div class="font-black text-white text-xs truncate" title="${r.nome}">
                        ${r.nome}
                    </div>

                    <div class="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                        <span class="flex items-center gap-1 text-slate-300 font-mono">
                            <span class="material-symbols-outlined text-[12px] text-indigo-400">calendar_today</span>
                            ${dateStr || 'S/ Data'}
                        </span>
                        <span class="text-[9px] font-bold text-slate-500 uppercase">XYZ</span>
                    </div>

                    <!-- Botões de Troca Rápida de Lado -->
                    <div class="flex gap-1.5 mt-2 pt-1.5 border-t border-white/10" onclick="event.stopPropagation()">
                        <button onclick="window.SwipeComparator.setLayerSide('${r.id}', 'left')" class="flex-1 py-1 px-1 rounded-md text-[9px] font-bold transition-all flex items-center justify-center gap-0.5 ${isLeft ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-800 hover:bg-emerald-600/30 text-slate-300 hover:text-white'}">
                            ⬅️ Esquerda
                        </button>
                        <button onclick="window.SwipeComparator.setLayerSide('${r.id}', 'right')" class="flex-1 py-1 px-1 rounded-md text-[9px] font-bold transition-all flex items-center justify-center gap-0.5 ${isRight ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-800 hover:bg-sky-600/30 text-slate-300 hover:text-white'}">
                            Direita ➡️
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function prevCard() {
        if (_carouselEl) _carouselEl.scrollBy({ left: -220, behavior: 'smooth' });
    }

    function nextCard() {
        if (_carouselEl) _carouselEl.scrollBy({ left: 220, behavior: 'smooth' });
    }

    // Alterna o card ao clicar nele: se já for o esquerdo, vira o direito; se for nenhum, substitui o direito
    function selectCard(rasterId) {
        if (!_leftRasterObj || !_rightRasterObj) return;

        if (_leftRasterObj.id === rasterId) {
            // Já é o esquerdo, não faz nada
            return;
        } else if (_rightRasterObj.id === rasterId) {
            // Já é o direito, não faz nada
            return;
        } else {
            // Substitui o direito
            setLayerSide(rasterId, 'right');
        }
    }

    // Define explicitamente se o raster vai para a esquerda ou direita
    function setLayerSide(rasterId, side) {
        const targetObj = _availableRasters.find(r => r.id === rasterId);
        if (!targetObj) return;

        const mapInstance = getMap();
        if (!mapInstance) return;

        if (side === 'left') {
            if (_leftRasterObj && _leftRasterObj.id === rasterId) return;
            if (_leftLayer) mapInstance.removeLayer(_leftLayer);
            _leftRasterObj = targetObj;
            _leftLayer = createLeafletRasterLayer(_leftRasterObj);
            if (_leftLayer) _leftLayer.addTo(mapInstance);
        } else {
            if (_rightRasterObj && _rightRasterObj.id === rasterId) return;
            if (_rightLayer) mapInstance.removeLayer(_rightLayer);
            _rightRasterObj = targetObj;
            _rightLayer = createLeafletRasterLayer(_rightRasterObj);
            if (_rightLayer) _rightLayer.addTo(mapInstance);
        }

        renderCarousel();
        updateClip();
    }

    // Inicia diretamente a ferramenta de comparação temporal
    async function startDirect() {
        const mapInstance = getMap();
        if (!mapInstance) {
            alert('Aguarde o carregamento do mapa.');
            return;
        }

        const activeMunId = window.activeMunicipioId || 
                            sessionStorage.getItem('municipio_ativo') || 
                            (typeof activeMunicipioId !== 'undefined' ? activeMunicipioId : null);

        let rasters = (window.rasterLayers && window.rasterLayers.length > 0) ? window.rasterLayers : [];

        // Busca ortofotos mais recentes
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                let query = supabaseClient.from('imagens_raster').select('*').order('created_at', { ascending: false });
                if (activeMunId) query = query.eq('municipio_id', activeMunId);
                const { data } = await query;
                if (data && data.length > 0) {
                    rasters = data;
                    window.rasterLayers = data;
                }
            } catch(e) {
                console.warn('Erro ao atualizar rasters:', e);
            }
        }

        // Filtra apenas as marcadas para swipe
        _availableRasters = rasters.filter(r => {
            const cachedSwipe = localStorage.getItem(`raster_swipe_${r.id}`);
            return cachedSwipe !== null ? (cachedSwipe === 'true') : (r.usar_no_swipe !== false);
        });

        if (_availableRasters.length < 2) {
            if (typeof showStorageToast === 'function') {
                showStorageToast('São necessárias pelo menos 2 ortofotos cadastradas para comparar.');
            } else {
                alert('São necessárias pelo menos 2 ortofotos cadastradas neste município para usar a comparação temporal.');
            }
            return;
        }

        function getEffectiveDate(r) {
            return r.data_imagem || localStorage.getItem(`raster_date_${r.id}`) || (r.nome && r.nome.match(/(\d{4})/)?.[1] + '-01-01') || '1970-01-01';
        }

        // Ordena cronologicamente: 1ª = mais antiga (esquerda), última = mais recente (direita)
        _availableRasters.sort((a, b) => getEffectiveDate(a).localeCompare(getEffectiveDate(b)));

        _leftRasterObj = _availableRasters[0];
        _rightRasterObj = _availableRasters[_availableRasters.length - 1];

        // Desativa overlays normais do mapa para não sobrepor
        if (window.leafletRasterOverlays) {
            Object.values(window.leafletRasterOverlays).forEach(ov => {
                if (mapInstance) mapInstance.removeLayer(ov);
            });
        }

        initSwipeUI();

        // Cria as duas camadas
        if (_leftLayer) mapInstance.removeLayer(_leftLayer);
        if (_rightLayer) mapInstance.removeLayer(_rightLayer);

        _leftLayer = createLeafletRasterLayer(_leftRasterObj);
        _rightLayer = createLeafletRasterLayer(_rightRasterObj);

        if (!_leftLayer || !_rightLayer) {
            alert('Não foi possível carregar as imagens para comparação.');
            return;
        }

        _leftLayer.addTo(mapInstance);
        _rightLayer.addTo(mapInstance);

        _active = true;
        _dividerX = 0.5;

        if (_containerEl) _containerEl.classList.remove('hidden');

        mapInstance.off('move zoom moveend zoomend', updateClip);
        mapInstance.on('move zoom moveend zoomend', updateClip);

        renderCarousel();

        setTimeout(() => {
            updateClip();
        }, 50);

        if (typeof showStorageToast === 'function') {
            showStorageToast(`Comparador 3D ativado. Arraste a linha central para comparar.`);
        }
    }

    // Encerra o comparador temporal e remove a cortina
    function stop() {
        _active = false;
        const mapInstance = getMap();

        if (_leftLayer && mapInstance) {
            mapInstance.removeLayer(_leftLayer);
            _leftLayer = null;
        }
        if (_rightLayer && mapInstance) {
            mapInstance.removeLayer(_rightLayer);
            _rightLayer = null;
        }
        if (mapInstance) {
            mapInstance.off('move zoom moveend zoomend', updateClip);
        }

        _leftRasterObj = null;
        _rightRasterObj = null;

        if (_containerEl) {
            _containerEl.classList.add('hidden');
        }

        // Restaura camadas normais
        if (typeof loadRasterLayers === 'function') {
            loadRasterLayers();
        }
    }

    function toggle() {
        if (_active) {
            stop();
        } else {
            startDirect();
        }
    }

    window.SwipeComparator = {
        start: startDirect,
        stop: stop,
        toggle: toggle,
        prevCard: prevCard,
        nextCard: nextCard,
        selectCard: selectCard,
        setLayerSide: setLayerSide,
        isActive: () => _active
    };

    window.openSwipeComparatorModal = toggle;
})();
