/**
 * Módulo de Comparador Temporal de Camadas / Cortina (Swipe Side-by-Side)
 * Permite comparar duas ortofotos em tempo real com linha divisora interativa arrastável.
 */

(function() {
    let _active = false;
    let _leftLayer = null;
    let _rightLayer = null;
    let _leftRasterObj = null;
    let _rightRasterObj = null;
    let _dividerX = 0.5; // Posição normalizada (0.0 a 1.0)
    let _isDragging = false;

    // Elementos do DOM do divisor
    let _containerEl = null;
    let _dividerLineEl = null;
    let _dividerHandleEl = null;
    let _labelLeftEl = null;
    let _labelRightEl = null;
    let _closeBtnEl = null;

    function initSwipeUI() {
        if (_containerEl) return;

        _containerEl = document.createElement('div');
        _containerEl.id = 'swipe-comparator-overlay';
        _containerEl.className = 'pointer-events-none absolute inset-0 z-[400] hidden overflow-hidden select-none';

        _containerEl.innerHTML = `
            <!-- Linha Divisora Vertical -->
            <div id="swipe-divider-line" class="absolute top-0 bottom-0 w-[3px] bg-white shadow-[0_0_12px_rgba(0,0,0,0.8)] pointer-events-auto cursor-ew-resize transition-none flex items-center justify-center" style="left: 50%;">
                <!-- Puxador Central Circular -->
                <div id="swipe-divider-handle" class="w-10 h-10 -ml-[1px] bg-slate-900/90 text-white rounded-full border-2 border-white shadow-2xl flex items-center justify-center cursor-ew-resize hover:scale-110 active:scale-95 transition-transform backdrop-blur-md">
                    <span class="material-symbols-outlined text-[20px] text-sky-400">compare_arrows</span>
                </div>
            </div>

            <!-- Etiquetas Flutuantes das Camadas -->
            <div class="absolute top-16 md:top-20 left-4 pointer-events-none z-10">
                <div id="swipe-label-left" class="px-3.5 py-1.5 bg-slate-900/80 text-white text-xs font-bold rounded-xl shadow-lg border border-white/20 backdrop-blur-md flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                    <span class="text-name">Ortofoto Esquerda</span>
                </div>
            </div>

            <div class="absolute top-16 md:top-20 right-4 pointer-events-none z-10">
                <div id="swipe-label-right" class="px-3.5 py-1.5 bg-slate-900/80 text-white text-xs font-bold rounded-xl shadow-lg border border-white/20 backdrop-blur-md flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
                    <span class="text-name">Ortofoto Direita</span>
                </div>
            </div>

            <!-- Botão Flutuante de Fechar Comparador -->
            <div class="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto z-10">
                <button onclick="window.SwipeComparator.stop()" class="px-5 py-2.5 bg-slate-900/90 hover:bg-rose-600 text-white text-xs font-extrabold rounded-full shadow-2xl border border-white/20 backdrop-blur-md transition-all flex items-center gap-2 hover:scale-105 active:scale-95">
                    <span class="material-symbols-outlined text-[18px]">close</span>
                    Fechar Comparador (Cortina)
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
        _dividerHandleEl = document.getElementById('swipe-divider-handle');
        _labelLeftEl = document.getElementById('swipe-label-left');
        _labelRightEl = document.getElementById('swipe-label-right');

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
            x = Math.max(0.02, Math.min(0.98, x)); // Limites de 2% a 98%
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

        const mapEl = document.getElementById('map');
        if (!mapEl) return;

        const width = mapEl.offsetWidth;
        const clipX = width * _dividerX;

        // Atualiza posição do divisor visual
        if (_dividerLineEl) {
            _dividerLineEl.style.left = `${_dividerX * 100}%`;
        }

        // Aplica clip-path na camada da esquerda (visível de 0 até clipX)
        const leftContainer = _leftLayer.getContainer ? _leftLayer.getContainer() : (_leftLayer._image || null);
        if (leftContainer) {
            leftContainer.style.clipPath = `polygon(0 0, ${clipX}px 0, ${clipX}px 100%, 0 100%)`;
            leftContainer.style.webkitClipPath = `polygon(0 0, ${clipX}px 0, ${clipX}px 100%, 0 100%)`;
        }

        // Aplica clip-path na camada da direita (visível de clipX até 100%)
        const rightContainer = _rightLayer.getContainer ? _rightLayer.getContainer() : (_rightLayer._image || null);
        if (rightContainer) {
            rightContainer.style.clipPath = `polygon(${clipX}px 0, 100% 0, 100% 100%, ${clipX}px 100%)`;
            rightContainer.style.webkitClipPath = `polygon(${clipX}px 0, 100% 0, 100% 100%, ${clipX}px 100%)`;
        }
    }

    function createLeafletRasterLayer(raster) {
        const isXYZ = (raster.tipo === 'xyz_tiles') || (raster.url_imagem && raster.url_imagem.includes('{z}'));
        if (isXYZ) {
            const nativeMax = raster.zoom_max || 22;
            return L.tileLayer(raster.url_imagem, {
                minZoom: 1,
                minNativeZoom: raster.zoom_min || 14,
                maxNativeZoom: nativeMax,
                maxZoom: 24,
                keepBuffer: 16,
                opacity: 1.0,
                attribution: raster.nome || 'Ortofoto'
            });
        } else if (raster.bbox && Array.isArray(raster.bbox) && raster.bbox.length === 2) {
            return L.imageOverlay(raster.url_imagem, raster.bbox, {
                opacity: 1.0,
                interactive: false
            });
        }
        return null;
    }

    // Abre o Modal de Seleção de Ortofotos
    async function openModal() {
        const modal = document.getElementById('swipe-modal');
        const selectLeft = document.getElementById('swipe-left-select');
        const selectRight = document.getElementById('swipe-right-select');
        const formContainer = document.getElementById('swipe-modal-form');
        const emptyContainer = document.getElementById('swipe-modal-empty');
        if (!modal) return;

        modal.classList.remove('hidden');

        let rasters = window.rasterLayers || [];

        // Busca dados mais recentes no Supabase para garantir sincronia
        if (typeof supabaseClient !== 'undefined' && supabaseClient && window.activeMunicipioId) {
            try {
                const { data } = await supabaseClient
                    .from('imagens_raster')
                    .select('*')
                    .eq('municipio_id', window.activeMunicipioId)
                    .order('created_at', { ascending: false });

                if (data && data.length > 0) {
                    rasters = data;
                    window.rasterLayers = data;
                }
            } catch (e) {
                console.warn('Erro ao atualizar rasters para swipe:', e);
            }
        }

        if (rasters.length < 2) {
            if (formContainer) formContainer.classList.add('hidden');
            if (emptyContainer) {
                emptyContainer.classList.remove('hidden');
                const countSpan = document.getElementById('swipe-rasters-count');
                if (countSpan) countSpan.textContent = rasters.length;
            }
            return;
        }

        if (emptyContainer) emptyContainer.classList.add('hidden');
        if (formContainer) formContainer.classList.remove('hidden');

        // Ordena da mais antiga para a mais recente para a linha do tempo
        const sortedChronological = [...rasters].sort((a, b) => {
            const dateA = a.data_imagem || (a.nome && a.nome.match(/(\d{4})/)?.[1] + '-01-01') || '1970-01-01';
            const dateB = b.data_imagem || (b.nome && b.nome.match(/(\d{4})/)?.[1] + '-01-01') || '1970-01-01';
            return dateA.localeCompare(dateB);
        });

        function formatRasterLabel(r) {
            let d = '';
            if (r.data_imagem) {
                d = r.data_imagem.split('-').reverse().join('/');
            } else if (r.nome) {
                const matchDate = r.nome.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
                const matchYear = r.nome.match(/(20\d{2})/);
                if (matchDate) d = `${matchDate[1]}/${matchDate[2]}/${matchDate[3]}`;
                else if (matchYear) d = matchYear[1];
            }
            return d ? `${r.nome} (📅 ${d})` : r.nome;
        }

        if (selectLeft && selectRight) {
            selectLeft.innerHTML = '';
            selectRight.innerHTML = '';

            sortedChronological.forEach((r) => {
                const label = formatRasterLabel(r);

                const optL = document.createElement('option');
                optL.value = r.id;
                optL.textContent = label;
                selectLeft.appendChild(optL);

                const optR = document.createElement('option');
                optR.value = r.id;
                optR.textContent = label;
                selectRight.appendChild(optR);
            });

            // Lado Esquerdo = Mais antiga (primeira) / Lado Direito = Mais recente (última)
            selectLeft.selectedIndex = 0;
            selectRight.selectedIndex = sortedChronological.length - 1;
        }
    }

    function closeModal() {
        const modal = document.getElementById('swipe-modal');
        if (modal) modal.classList.add('hidden');
    }

    // Inicia o Swipe entre duas ortofotos
    function start(leftId, rightId) {
        if (!window.map) return;
        closeModal();
        initSwipeUI();

        const rasters = window.rasterLayers || [];
        _leftRasterObj = rasters.find(r => r.id === leftId);
        _rightRasterObj = rasters.find(r => r.id === rightId);

        if (!_leftRasterObj || !_rightRasterObj) {
            alert('Selecione duas ortofotos válidas para comparar.');
            return;
        }

        // Desativa quaisquer overlays anteriores do mapa
        if (window.leafletRasterOverlays) {
            Object.values(window.leafletRasterOverlays).forEach(ov => {
                if (window.map) window.map.removeLayer(ov);
            });
        }

        // Cria as duas instâncias Leaflet
        _leftLayer = createLeafletRasterLayer(_leftRasterObj);
        _rightLayer = createLeafletRasterLayer(_rightRasterObj);

        if (!_leftLayer || !_rightLayer) {
            alert('Não foi possível carregar as camadas selecionadas.');
            return;
        }

        _leftLayer.addTo(window.map);
        _rightLayer.addTo(window.map);

        _active = true;
        _dividerX = 0.5;

        function getDateLabel(r) {
            if (r.data_imagem) return r.data_imagem.split('-').reverse().join('/');
            const matchDate = r.nome.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
            const matchYear = r.nome.match(/(20\d{2})/);
            if (matchDate) return `${matchDate[1]}/${matchDate[2]}/${matchDate[3]}`;
            if (matchYear) return matchYear[1];
            return '';
        }

        // Atualiza textos das etiquetas com Nome + Data
        if (_labelLeftEl) {
            const span = _labelLeftEl.querySelector('.text-name');
            const dL = getDateLabel(_leftRasterObj);
            if (span) span.textContent = dL ? `${_leftRasterObj.nome} (${dL})` : _leftRasterObj.nome;
        }
        if (_labelRightEl) {
            const span = _labelRightEl.querySelector('.text-name');
            const dR = getDateLabel(_rightRasterObj);
            if (span) span.textContent = dR ? `${_rightRasterObj.nome} (${dR})` : _rightRasterObj.nome;
        }

        if (_containerEl) _containerEl.classList.remove('hidden');

        // Adiciona listeners ao mapa para re-aplicar o clip no pan/zoom
        window.map.on('move', updateClip);
        window.map.on('zoom', updateClip);
        window.map.on('resize', updateClip);

        setTimeout(updateClip, 100);
        setTimeout(updateClip, 400);

        if (typeof showStorageToast === 'function') {
            showStorageToast(`Comparador ativado: Arraste a linha central para comparar.`);
        }
    }

    // Encerra o Swipe
    function stop() {
        if (!_active) return;
        _active = false;

        if (window.map) {
            if (_leftLayer) window.map.removeLayer(_leftLayer);
            if (_rightLayer) window.map.removeLayer(_rightLayer);
            window.map.off('move', updateClip);
            window.map.off('zoom', updateClip);
            window.map.off('resize', updateClip);
        }

        _leftLayer = null;
        _rightLayer = null;
        _leftRasterObj = null;
        _rightRasterObj = null;

        if (_containerEl) _containerEl.classList.add('hidden');

        // Restaura a camada que estava ligada anteriormente, se houver
        if (typeof loadRasterLayers === 'function') {
            loadRasterLayers();
        }
    }

    window.SwipeComparator = {
        openModal,
        closeModal,
        start,
        stop,
        isActive: () => _active
    };

    window.openSwipeComparatorModal = openModal;
})();
