/**
 * Módulo de Comparador Temporal de Ortofotos (Swipe / Cortina)
 * Exibição estrita de 2 datas no carrossel principal, com setas de navegação,
 * suporte a rolagem por mouse wheel e touch, ordenação cronológica automática
 * (mais antiga na esquerda, mais recente na direita) e sem popover sobreposto.
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

    // Arraste por toque no carrossel
    let _touchStartX = 0;

    // Elementos DOM
    let _containerEl = null;
    let _dividerLineEl = null;
    let _mainCarouselEl = null;
    let _btnPrevEl = null;
    let _btnNextEl = null;
    let _dateDropdownEl = null;

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

    // Atualiza o estado visual do botão "Comparador de Ortofotos" na barra superior
    function updateTopButton(active) {
        const btn = document.getElementById('btn-swipe-map');
        if (!btn) return;

        const icon = btn.querySelector('.material-symbols-outlined');

        if (active) {
            btn.classList.add('bg-rose-600', 'text-white', 'shadow-[0_0_18px_rgba(225,29,72,0.85)]', 'ring-2', 'ring-rose-400', 'ring-offset-2', 'ring-offset-slate-900', 'animate-pulse');
            btn.classList.remove('hover:bg-slate-100', 'dark:hover:bg-slate-800', 'text-indigo-600', 'dark:text-indigo-400');
            btn.title = 'Comparador Ativo — Clique aqui para Sair';
            if (icon) icon.textContent = 'close';

            let dot = btn.querySelector('.swipe-active-dot');
            if (!dot) {
                dot = document.createElement('span');
                dot.className = 'swipe-active-dot absolute -top-1 -right-1 flex h-3 w-3 pointer-events-none';
                dot.innerHTML = `<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-rose-500 border-2 border-white"></span>`;
                btn.classList.add('relative');
                btn.appendChild(dot);
            }
        } else {
            btn.classList.remove('bg-rose-600', 'text-white', 'shadow-[0_0_18px_rgba(225,29,72,0.85)]', 'ring-2', 'ring-rose-400', 'ring-offset-2', 'ring-offset-slate-900', 'animate-pulse');
            btn.classList.add('hover:bg-slate-100', 'dark:hover:bg-slate-800', 'text-indigo-600', 'dark:text-indigo-400');
            btn.title = 'Comparador de Ortofotos (Swipe / Cortina)';
            if (icon) icon.textContent = 'compare';

            const dot = btn.querySelector('.swipe-active-dot');
            if (dot) dot.remove();
        }
    }

    function initSwipeUI() {
        if (_containerEl) return;

        _containerEl = document.createElement('div');
        _containerEl.id = 'swipe-comparator-overlay';
        _containerEl.className = 'pointer-events-none absolute inset-0 z-[400] hidden overflow-hidden select-none';

        _containerEl.innerHTML = `
            <style>
                .swipe-card-compact {
                    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    user-select: none;
                    -webkit-user-select: none;
                }
                .swipe-card-compact:hover {
                    transform: translateY(-1.5px);
                }
            </style>

            <!-- Linha Divisora Vertical -->
            <div id="swipe-divider-line" class="absolute top-0 bottom-0 w-[2.5px] bg-white shadow-[0_0_15px_rgba(0,0,0,0.95)] pointer-events-auto cursor-ew-resize transition-none flex items-center justify-center" style="left: 50%;">
                
                <!-- Badge no topo da divisória -->
                <div id="swipe-divider-top-badge" class="absolute top-4 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/90 backdrop-blur-md border border-white/20 shadow-2xl pointer-events-none text-[11px] font-mono font-bold text-white whitespace-nowrap z-30">
                    <span class="flex items-center gap-1 text-emerald-400">
                        <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)] animate-pulse"></span>
                        <span id="swipe-divider-date-left">...</span>
                    </span>
                    <span class="text-white/40">|</span>
                    <span class="flex items-center gap-1 text-cyan-400">
                        <span id="swipe-divider-date-right">...</span>
                        <span class="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.9)] animate-pulse"></span>
                    </span>
                </div>

                <!-- Handle central duplo com gradiente e ícone -->
                <div id="swipe-divider-handle" class="w-9 h-9 -ml-[1px] bg-slate-950/95 text-white rounded-full border-2 border-white/90 shadow-2xl flex items-center justify-center cursor-ew-resize hover:scale-110 active:scale-95 transition-transform backdrop-blur-md relative group">
                    <div class="flex items-center justify-center gap-0.5 pointer-events-none">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)]"></span>
                        <span class="material-symbols-outlined text-[16px] text-white/90">compare_arrows</span>
                        <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.9)]"></span>
                    </div>
                </div>
            </div>

            <!-- Dock Inferior: Carrossel com exatamente 2 Datas e Setas -->
            <div class="absolute bottom-4 md:bottom-5 left-0 right-0 pointer-events-auto z-20 flex flex-col justify-center items-center px-2 md:px-4">
                
                <!-- Card Principal do Carrossel (Apenas 2 datas + setas) -->
                <div id="swipe-main-carousel"
                     class="flex items-center gap-2 px-2.5 py-1.5 rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-white/15 shadow-[0_12px_35px_rgba(0,0,0,0.7)] select-none relative">
                    
                    <!-- Seta Esquerda -->
                    <button id="swipe-arrow-prev" title="Comparação anterior (Scroll ou Seta)"
                            class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 shrink-0 cursor-pointer disabled:opacity-25 disabled:pointer-events-none">
                        <span class="material-symbols-outlined text-[20px]">chevron_left</span>
                    </button>

                    <!-- Card da Esquerda (Mais antiga) -->
                    <div id="swipe-card-left"
                         onclick="window.SwipeComparator.openDateDropdown(event, 'left')"
                         title="Clique para escolher a imagem da Esquerda"
                         class="swipe-card-compact shrink-0 h-9 px-3 rounded-xl border border-emerald-500/80 bg-gradient-to-r from-emerald-950/95 to-emerald-900/70 shadow-[0_0_15px_rgba(16,185,129,0.45)] flex items-center justify-center gap-1.5 cursor-pointer hover:border-emerald-400 active:scale-[0.98] transition-all relative">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-400 text-slate-950 tracking-tighter">ESQ</span>
                        <span class="material-symbols-outlined text-[14px] text-emerald-300">calendar_today</span>
                        <span id="swipe-date-label-left" class="text-xs font-bold text-emerald-100 font-mono whitespace-nowrap">--/--/----</span>
                        <span class="material-symbols-outlined text-[16px] text-emerald-400/80 -mr-1">arrow_drop_down</span>
                    </div>

                    <!-- Divisor sutil entre os dois cards -->
                    <div class="w-[1px] h-5 bg-white/20"></div>

                    <!-- Card da Direita (Mais recente) -->
                    <div id="swipe-card-right"
                         onclick="window.SwipeComparator.openDateDropdown(event, 'right')"
                         title="Clique para escolher a imagem da Direita"
                         class="swipe-card-compact shrink-0 h-9 px-3 rounded-xl border border-cyan-500/80 bg-gradient-to-r from-cyan-900/70 to-cyan-950/95 shadow-[0_0_15px_rgba(6,182,212,0.45)] flex items-center justify-center gap-1.5 cursor-pointer hover:border-cyan-400 active:scale-[0.98] transition-all relative">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-black bg-cyan-400 text-slate-950 tracking-tighter">DIR</span>
                        <span class="material-symbols-outlined text-[14px] text-cyan-300">calendar_today</span>
                        <span id="swipe-date-label-right" class="text-xs font-bold text-cyan-100 font-mono whitespace-nowrap">--/--/----</span>
                        <span class="material-symbols-outlined text-[16px] text-cyan-400/80 -mr-1">arrow_drop_down</span>
                    </div>

                    <!-- Seta Direita -->
                    <button id="swipe-arrow-next" title="Próxima comparação (Scroll ou Seta)"
                            class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 shrink-0 cursor-pointer disabled:opacity-25 disabled:pointer-events-none">
                        <span class="material-symbols-outlined text-[20px]">chevron_right</span>
                    </button>

                    <!-- Dropdown flutuante para seleção de data (Abre acima do card principal) -->
                    <div id="swipe-date-dropdown"
                         class="hidden absolute bottom-12 left-1/2 -translate-x-1/2 bg-slate-950/95 backdrop-blur-xl border border-white/20 py-2 px-1.5 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.8)] z-40 max-h-56 overflow-y-auto min-w-[230px]">
                        <!-- Lista de datas renderizada dinamicamente -->
                    </div>
                </div>

                <!-- Card Menor Abaixo do Carrossel (Mantido conforme solicitado) -->
                <div class="mt-1.5 flex items-center gap-2.5 text-[11px] font-medium text-slate-300/90 bg-slate-950/75 backdrop-blur-md px-3.5 py-1 rounded-full border border-white/10 shadow-lg select-none">
                    <span class="flex items-center gap-1.5 text-emerald-400 font-semibold">
                        <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                        ESQ: <strong class="text-white font-mono" id="swipe-status-left">-</strong>
                    </span>
                    <span class="text-white/30">|</span>
                    <span class="flex items-center gap-1.5 text-cyan-400 font-semibold">
                        <span class="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]"></span>
                        DIR: <strong class="text-white font-mono" id="swipe-status-right">-</strong>
                    </span>
                    <button onclick="window.SwipeComparator.swapSides()" title="Inverter lados (Esquerda ⇄ Direita)" class="ml-1 px-1.5 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all hover:scale-105 active:scale-95 flex items-center gap-1 text-[10px] cursor-pointer">
                        <span class="material-symbols-outlined text-[13px]">swap_horiz</span>
                        <span>Inverter</span>
                    </button>
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
        _mainCarouselEl = document.getElementById('swipe-main-carousel');
        _btnPrevEl = document.getElementById('swipe-arrow-prev');
        _btnNextEl = document.getElementById('swipe-arrow-next');
        _dateDropdownEl = document.getElementById('swipe-date-dropdown');

        setupEvents();
    }

    function setupEvents() {
        if (!_dividerLineEl) return;

        // 1. Arraste da linha divisora vertical
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
        }

        function endDrag() {
            if (_isDraggingDivider) {
                _isDraggingDivider = false;
                document.body.style.cursor = '';
            }
        }

        _dividerLineEl.addEventListener('mousedown', startDividerDrag);
        _dividerLineEl.addEventListener('touchstart', startDividerDrag, { passive: false });

        // 2. Rolagem do carrossel via mouse wheel (rola entre pares de datas)
        if (_mainCarouselEl) {
            _mainCarouselEl.addEventListener('wheel', (e) => {
                e.preventDefault();
                if (e.deltaY > 0 || e.deltaX > 0) {
                    stepNext();
                } else if (e.deltaY < 0 || e.deltaX < 0) {
                    stepPrev();
                }
            }, { passive: false });

            // Gesto de swipe em telas touch
            _mainCarouselEl.addEventListener('touchstart', (e) => {
                _touchStartX = e.touches[0].clientX;
            }, { passive: true });

            _mainCarouselEl.addEventListener('touchend', (e) => {
                const touchEndX = e.changedTouches[0].clientX;
                const diff = touchEndX - _touchStartX;
                if (diff < -35) {
                    stepNext();
                } else if (diff > 35) {
                    stepPrev();
                }
            }, { passive: true });
        }

        // 3. Botões de seta
        if (_btnPrevEl) {
            _btnPrevEl.addEventListener('click', (e) => {
                e.stopPropagation();
                stepPrev();
            });
        }

        if (_btnNextEl) {
            _btnNextEl.addEventListener('click', (e) => {
                e.stopPropagation();
                stepNext();
            });
        }

        // 4. Fechar dropdown ao clicar fora
        window.addEventListener('click', (e) => {
            if (_dateDropdownEl && !_dateDropdownEl.contains(e.target) && !e.target.closest('#swipe-card-left') && !e.target.closest('#swipe-card-right')) {
                closeDateDropdown();
            }
        });

        // 5. Tecla Escape para sair
        window.addEventListener('keydown', (e) => {
            if (_active && e.key === 'Escape') {
                stop();
            }
        });

        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', endDrag);
        window.addEventListener('touchend', endDrag);
    }

    // Avança para o próximo par de datas
    function stepNext() {
        if (_availableRasters.length < 2) return;
        closeDateDropdown();

        let leftIdx = _availableRasters.findIndex(r => _leftRasterObj && r.id === _leftRasterObj.id);
        let rightIdx = _availableRasters.findIndex(r => _rightRasterObj && r.id === _rightRasterObj.id);

        if (rightIdx < _availableRasters.length - 1) {
            // Avança um passo à frente
            applyPairSelection(_availableRasters[rightIdx], _availableRasters[rightIdx + 1]);
        } else if (leftIdx < _availableRasters.length - 2) {
            applyPairSelection(_availableRasters[leftIdx + 1], _availableRasters[_availableRasters.length - 1]);
        }
    }

    // Retrocede para o par de datas anterior
    function stepPrev() {
        if (_availableRasters.length < 2) return;
        closeDateDropdown();

        let leftIdx = _availableRasters.findIndex(r => _leftRasterObj && r.id === _leftRasterObj.id);

        if (leftIdx > 0) {
            // Retrocede um passo
            applyPairSelection(_availableRasters[leftIdx - 1], _availableRasters[leftIdx]);
        }
    }

    function updateArrowsState() {
        if (!_btnPrevEl || !_btnNextEl || _availableRasters.length < 2) return;

        const leftIdx = _availableRasters.findIndex(r => _leftRasterObj && r.id === _leftRasterObj.id);
        const rightIdx = _availableRasters.findIndex(r => _rightRasterObj && r.id === _rightRasterObj.id);

        const canPrev = (leftIdx > 0);
        const canNext = (rightIdx < _availableRasters.length - 1 || leftIdx < _availableRasters.length - 2);

        _btnPrevEl.disabled = !canPrev;
        _btnNextEl.disabled = !canNext;
    }

    // Atualiza os labels das datas nos cards principais e no status
    function updateLabels() {
        const dateLeft = getDateFormatted(_leftRasterObj) || '--/--/----';
        const dateRight = getDateFormatted(_rightRasterObj) || '--/--/----';

        const cardLeft = document.getElementById('swipe-date-label-left');
        const cardRight = document.getElementById('swipe-date-label-right');
        const statusLeft = document.getElementById('swipe-status-left');
        const statusRight = document.getElementById('swipe-status-right');
        const divLeft = document.getElementById('swipe-divider-date-left');
        const divRight = document.getElementById('swipe-divider-date-right');

        if (cardLeft) cardLeft.textContent = dateLeft;
        if (cardRight) cardRight.textContent = dateRight;
        if (statusLeft) statusLeft.textContent = dateLeft;
        if (statusRight) statusRight.textContent = dateRight;
        if (divLeft) divLeft.textContent = dateLeft;
        if (divRight) divRight.textContent = dateRight;

        updateArrowsState();
    }

    // Abre dropdown para o usuário escolher qualquer data
    function openDateDropdown(e, targetSlot) {
        e.stopPropagation();
        if (!_dateDropdownEl) return;

        // Se já está aberto para o mesmo slot, fecha
        if (!_dateDropdownEl.classList.contains('hidden') && _dateDropdownEl.dataset.slot === targetSlot) {
            closeDateDropdown();
            return;
        }

        _dateDropdownEl.dataset.slot = targetSlot;

        const slotTitle = targetSlot === 'left' ? 'Alterar Imagem da Esquerda' : 'Alterar Imagem da Direita';
        const activeColor = targetSlot === 'left' ? 'text-emerald-400' : 'text-cyan-400';

        let html = `
            <div class="px-2 py-1 mb-1 border-b border-white/10 flex items-center justify-between">
                <span class="text-[10px] font-bold uppercase tracking-wider ${activeColor}">${slotTitle}</span>
                <button onclick="window.SwipeComparator.closeDateDropdown()" class="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer">
                    <span class="material-symbols-outlined text-[13px]">close</span>
                </button>
            </div>
            <div class="flex flex-col gap-1">
        `;

        _availableRasters.forEach((r) => {
            const isLeft = (_leftRasterObj && _leftRasterObj.id === r.id);
            const isRight = (_rightRasterObj && _rightRasterObj.id === r.id);
            const dateStr = getDateFormatted(r);

            let badge = '';
            let bgClass = 'hover:bg-white/10 text-slate-200';

            if (isLeft) {
                badge = `<span class="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-500 text-slate-950">ESQ</span>`;
                bgClass = 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-200';
            } else if (isRight) {
                badge = `<span class="text-[9px] font-black px-1.5 py-0.2 rounded bg-cyan-500 text-slate-950">DIR</span>`;
                bgClass = 'bg-cyan-950/70 border border-cyan-500/40 text-cyan-200';
            }

            html += `
                <div onclick="window.SwipeComparator.selectDateFromDropdown('${r.id}', '${targetSlot}')"
                     class="px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-colors text-xs font-mono font-semibold ${bgClass}">
                    <div class="flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[14px] text-slate-400">calendar_today</span>
                        <span>${dateStr}</span>
                    </div>
                    ${badge}
                </div>
            `;
        });

        html += `</div>`;
        _dateDropdownEl.innerHTML = html;
        _dateDropdownEl.classList.remove('hidden');
    }

    function closeDateDropdown() {
        if (_dateDropdownEl) {
            _dateDropdownEl.classList.add('hidden');
        }
    }

    // Seleciona data no dropdown e aplica a regra automática:
    // Mais antiga SEMPRE no lado esquerdo (ESQ), mais atual no lado direito (DIR)
    function selectDateFromDropdown(rasterId, targetSlot) {
        const pickedObj = _availableRasters.find(r => r.id === rasterId);
        if (!pickedObj) return;

        closeDateDropdown();

        let newLeft = _leftRasterObj;
        let newRight = _rightRasterObj;

        if (targetSlot === 'left') {
            newLeft = pickedObj;
            if (newRight && newRight.id === pickedObj.id) {
                // Se escolheu a mesma que estava na direita, pega uma diferente
                newRight = _availableRasters.find(r => r.id !== pickedObj.id) || newRight;
            }
        } else {
            newRight = pickedObj;
            if (newLeft && newLeft.id === pickedObj.id) {
                // Se escolheu a mesma que estava na esquerda, pega uma diferente
                newLeft = _availableRasters.find(r => r.id !== pickedObj.id) || newLeft;
            }
        }

        applyPairSelection(newLeft, newRight);
    }

    // Ordena automaticamente: mais antiga = esquerda, mais atual = direita
    function applyPairSelection(objA, objB) {
        if (!objA || !objB) return;

        const dateA = getEffectiveDate(objA);
        const dateB = getEffectiveDate(objB);

        let finalLeft = objA;
        let finalRight = objB;

        // Regra de ouro: sempre do mais antigo (ESQ) para o mais atual (DIR)
        if (dateA.localeCompare(dateB) > 0) {
            finalLeft = objB;
            finalRight = objA;
        }

        const mapInstance = getMap();
        if (!mapInstance) return;

        if (_leftLayer) mapInstance.removeLayer(_leftLayer);
        if (_rightLayer) mapInstance.removeLayer(_rightLayer);

        _leftRasterObj = finalLeft;
        _rightRasterObj = finalRight;

        _leftLayer = createLeafletRasterLayer(_leftRasterObj);
        _rightLayer = createLeafletRasterLayer(_rightRasterObj);

        if (_leftLayer) _leftLayer.addTo(mapInstance);
        if (_rightLayer) _rightLayer.addTo(mapInstance);

        updateLabels();
        updateClip();
    }

    // Inverte os lados manualmente (Esquerda ⇄ Direita)
    function swapSides() {
        if (!_leftRasterObj || !_rightRasterObj) return;
        const tempObj = _leftRasterObj;
        _leftRasterObj = _rightRasterObj;
        _rightRasterObj = tempObj;

        const mapInstance = getMap();
        if (mapInstance) {
            if (_leftLayer) mapInstance.removeLayer(_leftLayer);
            if (_rightLayer) mapInstance.removeLayer(_rightLayer);

            _leftLayer = createLeafletRasterLayer(_leftRasterObj);
            _rightLayer = createLeafletRasterLayer(_rightRasterObj);

            if (_leftLayer) _leftLayer.addTo(mapInstance);
            if (_rightLayer) _rightLayer.addTo(mapInstance);
        }

        closeDateDropdown();
        updateLabels();
        updateClip();
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
        if (!raster) return null;
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

        // Se não há rasters em memória, tenta recarregar via loadRasterLayers
        if ((!window.rasterLayers || !Array.isArray(window.rasterLayers) || window.rasterLayers.length === 0) && typeof loadRasterLayers === 'function') {
            try {
                await loadRasterLayers();
            } catch(eLoad) {}
        }

        let rasters = (window.rasterLayers && Array.isArray(window.rasterLayers) && window.rasterLayers.length > 0) ? [...window.rasterLayers] : [];

        // Busca ortofotos do Supabase se ainda não houver carregadas em memória
        if (rasters.length === 0 && typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                let query = supabaseClient.from('imagens_raster').select('*').order('created_at', { ascending: false });
                if (activeMunId) query = query.eq('municipio_id', activeMunId);
                const { data } = await query;
                if (data && data.length > 0) {
                    const prof = window.currentUserProfile || (typeof currentUserProfile !== 'undefined' ? currentUserProfile : {}) || {};
                    const isSuperAdmin = !!(prof.super_admin || prof.is_superadmin || prof.papel === 'superadmin');
                    const userEntidadeRaw = (window.currentUserEntidade || prof.entidade || prof.entidade_nome || '').trim();
                    const userSigla = (typeof window.getEntitySigla === 'function') ? window.getEntitySigla(userEntidadeRaw) : 'Município';
                    
                    let currentUserId = prof.id || null;
                    if (!currentUserId && supabaseClient.auth) {
                        try {
                            const { data: sessData } = await supabaseClient.auth.getSession();
                            currentUserId = sessData?.session?.user?.id || null;
                        } catch(eSess) {}
                    }

                    let myRasterPerms = new Set();
                    let myBlockedRasters = new Set();
                    if (currentUserId && !isSuperAdmin) {
                        try {
                            const { data: prData } = await supabaseClient
                                .from('permissoes_raster')
                                .select('raster_id, pode_ver')
                                .eq('user_id', currentUserId);
                            if (prData) {
                                prData.forEach(p => {
                                    const canSee = (p.pode_ver === true || p.pode_ver === 'true' || p.pode_ver === 1);
                                    if (canSee) {
                                        myRasterPerms.add(p.raster_id);
                                    } else {
                                        myBlockedRasters.add(p.raster_id);
                                    }
                                });
                            }
                        } catch(e) {}
                    }

                    rasters = data.filter(r => {
                        if (isSuperAdmin) return true;
                        if (myBlockedRasters.has(r.id)) return false;
                        if (myRasterPerms.has(r.id)) return true;

                        const rEntRaw = (r.entidade || 'Prefeitura Municipal').trim();
                        const rSigla = (typeof window.getEntitySigla === 'function') ? window.getEntitySigla(rEntRaw) : 'Município';

                        if (rSigla === 'Público' || rSigla === 'Geral' || rEntRaw.toLowerCase() === 'geral' || rEntRaw.toLowerCase() === 'público' || rEntRaw.toLowerCase() === 'publico') return true;
                        if (userSigla && rSigla && userSigla === rSigla) return true;
                        return false;
                    });
                }
            } catch(e) {
                console.warn('Erro ao atualizar rasters:', e);
            }
        }

        // Filtra as marcadas para swipe
        let available = rasters.filter(r => {
            const cachedSwipe = localStorage.getItem(`raster_swipe_${r.id}`);
            return cachedSwipe !== null ? (cachedSwipe === 'true') : (r.usar_no_swipe !== false);
        });

        if (available.length < 2 && rasters.length >= 2) {
            available = [...rasters];
        }

        _availableRasters = available;

        if (_availableRasters.length < 2) {
            const msg = _availableRasters.length === 0 
                ? 'Você não possui ortofotos habilitadas para visualização neste município.'
                : 'Você possui apenas 1 ortofoto habilitada. São necessárias pelo menos 2 ortofotos liberadas para comparação temporal.';
            if (typeof showStorageToast === 'function') {
                showStorageToast(msg);
            } else {
                alert(msg);
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

        updateLabels();
        updateTopButton(true);

        setTimeout(() => {
            updateClip();
        }, 80);
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

        closeDateDropdown();

        if (_containerEl) {
            _containerEl.classList.add('hidden');
        }

        updateTopButton(false);

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
        stepNext: stepNext,
        stepPrev: stepPrev,
        openDateDropdown: openDateDropdown,
        closeDateDropdown: closeDateDropdown,
        selectDateFromDropdown: selectDateFromDropdown,
        swapSides: swapSides,
        isActive: () => _active
    };

    window.openSwipeComparatorModal = toggle;
})();
