/**
 * Módulo de Comparador Temporal de Ortofotos (Swipe)
 * Carrossel 3D Minimalista em Marca d'Água na parte inferior central,
 * com luminescência neon, perspectiva Coverflow e arraste com mouse/touch.
 */

(function() {
    let _active = false;
    let _leftLayer = null;
    let _rightLayer = null;
    let _leftRasterObj = null;
    let _rightRasterObj = null;
    let _availableRasters = [];
    let _dividerX = 0.5; // 0.0 a 1.0
    let _isDraggingDivider = false;

    // Arraste do carrossel 3D
    let _carouselScrollLeft = 0;
    let _isDraggingCarousel = false;
    let _carouselStartX = 0;
    let _carouselStartScroll = 0;

    // Elementos DOM
    let _containerEl = null;
    let _dividerLineEl = null;
    let _carouselTrackEl = null;

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
        return r.nome || '';
    }

    function getEffectiveDate(r) {
        return r.data_imagem || localStorage.getItem(`raster_date_${r.id}`) || (r.nome && r.nome.match(/(\d{4})/)?.[1] + '-01-01') || '1970-01-01';
    }

    function initSwipeUI() {
        if (_containerEl) return;

        _containerEl = document.createElement('div');
        _containerEl.id = 'swipe-comparator-overlay';
        _containerEl.className = 'pointer-events-none absolute inset-0 z-[400] hidden overflow-hidden select-none';

        _containerEl.innerHTML = `
            <style>
                .swipe-perspective-wrap {
                    perspective: 900px;
                    perspective-origin: 50% 50%;
                }
                .swipe-pill-3d {
                    transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
                    transform-style: preserve-3d;
                    will-change: transform, opacity;
                }
                .swipe-pill-left-active {
                    border-color: #10b981 !important;
                    background: rgba(16, 185, 129, 0.22) !important;
                    box-shadow: 0 0 16px rgba(16, 185, 129, 0.7), inset 0 0 10px rgba(16, 185, 129, 0.3) !important;
                    transform: scale(1.06) translateZ(25px) !important;
                    opacity: 1 !important;
                }
                .swipe-pill-right-active {
                    border-color: #0ea5e9 !important;
                    background: rgba(14, 165, 233, 0.22) !important;
                    box-shadow: 0 0 16px rgba(14, 165, 233, 0.7), inset 0 0 10px rgba(14, 165, 233, 0.3) !important;
                    transform: scale(1.06) translateZ(25px) !important;
                    opacity: 1 !important;
                }
                .swipe-pill-both-active {
                    border-color: #a855f7 !important;
                    background: rgba(168, 85, 247, 0.25) !important;
                    box-shadow: 0 0 18px rgba(168, 85, 247, 0.75) !important;
                    transform: scale(1.08) translateZ(30px) !important;
                    opacity: 1 !important;
                }
                .swipe-pill-hidden-left {
                    transform: scale(0.82) rotateY(-28deg) translateZ(-15px);
                    opacity: 0.45;
                }
                .swipe-pill-hidden-right {
                    transform: scale(0.82) rotateY(28deg) translateZ(-15px);
                    opacity: 0.45;
                }
            </style>

            <!-- Linha Divisora Vertical -->
            <div id="swipe-divider-line" class="absolute top-0 bottom-0 w-[2.5px] bg-white shadow-[0_0_15px_rgba(0,0,0,0.95)] pointer-events-auto cursor-ew-resize transition-none flex items-center justify-center" style="left: 50%;">
                <div id="swipe-divider-handle" class="w-8 h-8 -ml-[1px] bg-slate-950/90 text-white rounded-full border-2 border-white/90 shadow-2xl flex items-center justify-center cursor-ew-resize hover:scale-110 active:scale-95 transition-transform backdrop-blur-md">
                    <span class="material-symbols-outlined text-[16px] text-sky-400">compare_arrows</span>
                </div>
            </div>

            <!-- Carrossel 3D Minimalista em Marca d'Água na Parte Inferior Central -->
            <div class="absolute bottom-5 left-1/2 -translate-x-1/2 pointer-events-auto z-20 flex items-center gap-2 max-w-[96vw]">
                
                <!-- Trilho do Carrossel 3D -->
                <div class="swipe-perspective-wrap bg-slate-950/40 backdrop-blur-md border border-white/15 rounded-full p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex items-center overflow-hidden">
                    <div id="swipe-carousel-pills" class="flex items-center gap-2 px-1 overflow-x-auto no-scrollbar cursor-grab active:cursor-grabbing select-none" style="scroll-behavior: smooth;">
                        <!-- Pílulas de datas injetadas via renderPills() -->
                    </div>
                </div>

                <!-- Botão Discreto Fechar (Apenas o X) -->
                <button onclick="window.SwipeComparator.stop()" title="Fechar Comparador" class="w-8 h-8 rounded-full bg-slate-950/50 hover:bg-rose-600/90 text-white/80 hover:text-white border border-white/20 shadow-lg backdrop-blur-md flex items-center justify-center transition-all hover:scale-110 active:scale-90 shrink-0 cursor-pointer">
                    <span class="material-symbols-outlined text-[16px]">close</span>
                </button>
            </div>
        `;

        const mapContainer = document.getElementById('map');
        if (mapContainer && mapContainer.parentElement) {
            mapContainer.parentElement.appendChild(_containerEl);
        } else {
            document.body.appendChild(_containerEl);
        }

        _dividerLineEl = document.getElementById('swipe-divider-line');
        _carouselTrackEl = document.getElementById('swipe-carousel-pills');

        setupEvents();
    }

    function setupEvents() {
        if (!_dividerLineEl) return;

        // 1. Arraste da linha divisora
        function startDividerDrag(e) {
            _isDraggingDivider = true;
            e.preventDefault();
            document.body.style.cursor = 'ew-resize';
        }

        function onMove(e) {
            if (_isDraggingDivider && _active) {
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const mapEl = document.getElementById('map');
                if (!mapEl) return;

                const rect = mapEl.getBoundingClientRect();
                let x = (clientX - rect.left) / rect.width;
                x = Math.max(0.02, Math.min(0.98, x));
                _dividerX = x;
                updateClip();
            }

            if (_isDraggingCarousel && _carouselTrackEl) {
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const walk = (clientX - _carouselStartX) * 1.3;
                _carouselTrackEl.scrollLeft = _carouselStartScroll - walk;
            }
        }

        function endDrag() {
            if (_isDraggingDivider) {
                _isDraggingDivider = false;
                document.body.style.cursor = '';
            }
            if (_isDraggingCarousel) {
                _isDraggingCarousel = false;
            }
        }

        _dividerLineEl.addEventListener('mousedown', startDividerDrag);
        _dividerLineEl.addEventListener('touchstart', startDividerDrag, { passive: false });

        // 2. Arraste por mouse / touch no carrossel de pílulas
        if (_carouselTrackEl) {
            _carouselTrackEl.addEventListener('mousedown', (e) => {
                _isDraggingCarousel = true;
                _carouselStartX = e.clientX;
                _carouselStartScroll = _carouselTrackEl.scrollLeft;
            });
            _carouselTrackEl.addEventListener('touchstart', (e) => {
                _isDraggingCarousel = true;
                _carouselStartX = e.touches[0].clientX;
                _carouselStartScroll = _carouselTrackEl.scrollLeft;
            }, { passive: true });
        }

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

    // Renderiza os Cards/Pílulas no Carrossel 3D Minimalista
    function renderPills() {
        if (!_carouselTrackEl || _availableRasters.length === 0) return;

        const leftIdx = _availableRasters.findIndex(r => _leftRasterObj && r.id === _leftRasterObj.id);
        const rightIdx = _availableRasters.findIndex(r => _rightRasterObj && r.id === _rightRasterObj.id);

        _carouselTrackEl.innerHTML = _availableRasters.map((r, idx) => {
            const isLeft = (idx === leftIdx);
            const isRight = (idx === rightIdx);
            const dateStr = getDateFormatted(r);

            let styleClass = '';
            let luminescenciaDot = '';

            if (isLeft && isRight) {
                styleClass = 'swipe-pill-both-active';
                luminescenciaDot = '<span class="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_#c084fc]"></span>';
            } else if (isLeft) {
                styleClass = 'swipe-pill-left-active';
                luminescenciaDot = '<span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>';
            } else if (isRight) {
                styleClass = 'swipe-pill-right-active';
                luminescenciaDot = '<span class="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]"></span>';
            } else {
                // Cards não selecionados: efeito 3D se escondendo nas laterais
                const minActiveIdx = Math.min(leftIdx >= 0 ? leftIdx : 0, rightIdx >= 0 ? rightIdx : 0);
                if (idx < minActiveIdx) {
                    styleClass = 'swipe-pill-hidden-left hover:opacity-90 hover:scale-95';
                } else {
                    styleClass = 'swipe-pill-hidden-right hover:opacity-90 hover:scale-95';
                }
                luminescenciaDot = '<span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>';
            }

            return `
                <div onclick="window.SwipeComparator.handlePillClick('${r.id}')"
                     title="${r.nome} - Clique para alternar no comparador"
                     class="swipe-pill-3d shrink-0 h-9 px-3.5 rounded-full border border-white/20 backdrop-blur-md flex items-center gap-2 cursor-pointer transition-all duration-300 ${styleClass}">
                    ${luminescenciaDot}
                    <span class="text-xs font-bold text-white tracking-wide whitespace-nowrap font-mono">
                        ${dateStr}
                    </span>
                </div>
            `;
        }).join('');
    }

    // Clique na pílula: alterna entre esquerda e direita de forma fluida
    function handlePillClick(rasterId) {
        if (!_leftRasterObj || !_rightRasterObj) return;

        if (_leftRasterObj.id === rasterId) {
            // Já é o esquerdo
            return;
        } else if (_rightRasterObj.id === rasterId) {
            // Já é o direito
            return;
        }

        const mapInstance = getMap();
        if (!mapInstance) return;

        const targetObj = _availableRasters.find(r => r.id === rasterId);
        if (!targetObj) return;

        const targetDate = getEffectiveDate(targetObj);
        const leftDate = getEffectiveDate(_leftRasterObj);
        const rightDate = getEffectiveDate(_rightRasterObj);

        // Se a data for anterior à da esquerda, substitui o lado esquerdo; senão, substitui o direito
        if (targetDate < leftDate) {
            if (_leftLayer) mapInstance.removeLayer(_leftLayer);
            _leftRasterObj = targetObj;
            _leftLayer = createLeafletRasterLayer(_leftRasterObj);
            if (_leftLayer) _leftLayer.addTo(mapInstance);
        } else {
            if (_rightLayer) mapInstance.removeLayer(_rightLayer);
            _rightRasterObj = targetObj;
            _rightLayer = createLeafletRasterLayer(_rightRasterObj);
            if (_rightLayer) _rightLayer.addTo(mapInstance);
        }

        renderPills();
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

        renderPills();

        setTimeout(() => {
            updateClip();
        }, 50);
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
        handlePillClick: handlePillClick,
        isActive: () => _active
    };

    window.openSwipeComparatorModal = toggle;
})();
