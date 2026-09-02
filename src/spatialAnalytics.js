// src/spatialAnalytics.js
// PAINEL ESTATÍSTICO – ANÁLISE ESPACIAL CRUZADA (TELA CHEIA)
// Construtor de Consultas Espaciais em 4 Etapas, Topologia Turf.js, Dashboard Multi-Abas e Exportações (CSV, GeoJSON, PDF, DOCX)

(function() {
    'use strict';

    // ==========================================
    // UTILITÁRIO DE ELEMENTOS ARRASTÁVEIS (DRAGGABLE SUAVE E SEM TRAVAMENTO)
    // ==========================================
    function makeElementDraggable(cardEl, handleEl) {
        if (!cardEl || !handleEl) return;
        
        if (typeof L !== 'undefined' && L.DomEvent) {
            L.DomEvent.disableClickPropagation(cardEl);
            L.DomEvent.disableScrollPropagation(cardEl);
        }

        handleEl.style.cursor = 'grab';
        handleEl.style.userSelect = 'none';

        let isDragging = false;
        let shiftX = 0;
        let shiftY = 0;

        const onPointerDown = (e) => {
            if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('a')) return;

            isDragging = true;
            handleEl.style.cursor = 'grabbing';
            handleEl.setPointerCapture(e.pointerId);

            const rect = cardEl.getBoundingClientRect();
            shiftX = e.clientX - rect.left;
            shiftY = e.clientY - rect.top;

            cardEl.style.transition = 'none';
            cardEl.style.position = 'fixed';
            cardEl.style.transform = 'none';
            cardEl.style.margin = '0';
            cardEl.style.right = 'auto';
            cardEl.style.bottom = 'auto';
            cardEl.style.left = rect.left + 'px';
            cardEl.style.top = rect.top + 'px';

            document.body.style.userSelect = 'none';
            e.preventDefault();
            e.stopPropagation();
        };

        const onPointerMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            e.stopPropagation();

            let newX = e.clientX - shiftX;
            let newY = e.clientY - shiftY;

            const maxX = window.innerWidth - cardEl.offsetWidth - 10;
            const maxY = window.innerHeight - cardEl.offsetHeight - 10;
            newX = Math.max(10, Math.min(newX, maxX));
            newY = Math.max(10, Math.min(newY, maxY));

            cardEl.style.left = newX + 'px';
            cardEl.style.top = newY + 'px';
        };

        const onPointerUp = (e) => {
            if (isDragging) {
                isDragging = false;
                handleEl.style.cursor = 'grab';
                try { handleEl.releasePointerCapture(e.pointerId); } catch(err) {}
                cardEl.style.transition = '';
                document.body.style.userSelect = '';
            }
        };

        handleEl.addEventListener('pointerdown', onPointerDown);
        handleEl.addEventListener('pointermove', onPointerMove);
        handleEl.addEventListener('pointerup', onPointerUp);
        handleEl.addEventListener('pointercancel', onPointerUp);
    }

    class SpatialAnalyticsManager {
        constructor() {
            this.rules = [];
            this.activeRuleId = null;
            this.highlightLayer = null;
            this.referenceHighlightLayer = null;
            this.isMenuOpen = false;
            this.lastAnalysisResult = null;
        }

        init() {
            this.loadRules().then(() => {
                try {
                    const urlParams = new URLSearchParams(window.location.search);
                    const openRule = urlParams.get('openSpatialRule');
                    if (openRule) {
                        try {
                            window.history.replaceState({}, document.title, window.location.pathname);
                        } catch(e) {}
                        setTimeout(() => {
                            if (openRule === 'new') {
                                window.openSpatialRuleModal();
                            } else {
                                window.openSpatialRuleModal(openRule);
                            }
                        }, 500);
                    }
                } catch(eParam) {}
            });
            this.renderFloatingMenu();
            this.ensureSpatialRuleModalDOM();
            console.log('✅ SpatialAnalyticsManager inicializado com Painel Estatístico em Tela Cheia.');
        }

        updateBadge() {
            const badge = document.getElementById('spatial-rules-badge');
            if (badge) {
                if (this.rules && this.rules.length > 0) {
                    badge.textContent = this.rules.length;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        }

        async loadRules() {
            const munId = (typeof activeMunicipioId !== 'undefined' && activeMunicipioId) || sessionStorage.getItem('municipio_ativo') || 'default';
            const key = `spatial_rules_${munId}`;
            const saved = localStorage.getItem(key) || localStorage.getItem('spatial_analytics_rules');
            
            if (saved) {
                try { this.rules = JSON.parse(saved); } catch(e) { this.rules = []; }
            } else {
                this.rules = [];
            }

            if (typeof supabaseClient !== 'undefined' && supabaseClient && munId !== 'default') {
                try {
                    const { data, error } = await supabaseClient.from('municipio_config').select('config_valor').eq('config_chave', `spatial_rules_${munId}`).maybeSingle();
                    if (!error && data && data.config_valor) {
                        this.rules = typeof data.config_valor === 'string' ? JSON.parse(data.config_valor) : data.config_valor;
                    }
                } catch(e) {}
            }

            // Deduplica por ID ou Nome para limpar duplicatas antigas
            if (this.rules && Array.isArray(this.rules)) {
                const uniqueMap = new Map();
                this.rules.filter(r => r && !r.id?.startsWith('temp_exec_')).forEach(r => {
                    const normName = r.name ? r.name.trim().toLowerCase() : r.id;
                    if (!uniqueMap.has(normName)) {
                        uniqueMap.set(normName, r);
                    }
                });
                this.rules = Array.from(uniqueMap.values());
                localStorage.setItem(key, JSON.stringify(this.rules));
                localStorage.setItem('spatial_analytics_rules', JSON.stringify(this.rules));
            }

            this.updateBadge();
        }

        toggleMenu() {
            this.isMenuOpen = !this.isMenuOpen;
            const menu = document.getElementById('spatial-analytics-menu');
            if (menu) {
                if (this.isMenuOpen) {
                    if (typeof window.closeStatsDashboard === 'function') {
                        window.closeStatsDashboard();
                    }
                    this.loadRules();
                    this.renderMenuList();
                    menu.style.top = '10px';
                    menu.style.right = '10px';
                    menu.style.left = 'auto';
                    menu.style.bottom = 'auto';
                    menu.classList.remove('hidden');
                } else {
                    menu.classList.add('hidden');
                }
            }
        }

        closeMenu() {
            this.isMenuOpen = false;
            const menu = document.getElementById('spatial-analytics-menu');
            if (menu) menu.classList.add('hidden');
        }

        renderFloatingMenu() {
            if (document.getElementById('spatial-analytics-menu')) return;

            const menu = document.createElement('div');
            menu.id = 'spatial-analytics-menu';
            // Posicionamento no canto superior direito a 10px com largura fixa de 380px e mesma transparência
            menu.className = 'fixed top-[10px] right-[10px] z-[1000] hidden flex flex-col w-[380px] max-w-[92vw] bg-[#070b14]/75 backdrop-blur-md rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden';
            
            menu.innerHTML = `
                <div id="spatial-menu-header" class="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900/60 cursor-grab select-none">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-cyan-400 text-[20px]">hub</span>
                        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-100">Estatísticas Cruzadas</h3>
                    </div>
                    <div class="flex items-center gap-1">
                        <button type="button" onclick="window.location.href='home.html?tab=estatistica'" class="p-1.5 hover:bg-white/10 rounded-full text-white/60 hover:text-cyan-400 transition-colors mr-1 cursor-pointer" title="Configurar em Ajustes">
                            <span class="material-symbols-outlined text-[18px]">settings</span>
                        </button>
                        <button type="button" onclick="window.spatialAnalyticsEngine.closeMenu()" class="p-1.5 hover:bg-white/10 rounded-full text-white/60 hover:text-red-400 transition-colors cursor-pointer" title="Fechar">
                            <span class="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    </div>
                </div>
                <div id="spatial-menu-items" class="p-3 max-h-[50vh] overflow-y-auto flex flex-col gap-2">
                    <!-- Preenchido via JS -->
                </div>
            `;

            document.body.appendChild(menu);
            makeElementDraggable(menu, document.getElementById('spatial-menu-header'));
            this.ensureSpatialRuleModalDOM();
        }

        renderMenuList() {
            const container = document.getElementById('spatial-menu-items');
            if (!container) return;

            if (this.rules.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-6 text-slate-400">
                        <span class="material-symbols-outlined text-3xl mb-1 opacity-50">hub</span>
                        <p class="text-xs">Nenhuma regra de estatística cadastrada.</p>
                        <button type="button" onclick="window.openSpatialRuleModal()" class="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 rounded-lg text-xs font-bold text-cyan-600 dark:text-cyan-400 transition-colors cursor-pointer">
                            <span class="material-symbols-outlined text-[15px]">add_circle</span> Configurar Análise Espacial
                        </button>
                    </div>
                `;
                return;
            }

            const opIcons = {
                'intersects': 'content_cut',
                'touches': 'handshake',
                'buffer': 'radar',
                'within': 'all_inbox',
                'disjoint': 'block',
                'length_clip': 'straighten',
                'nearest': 'near_me',
                'zonal_stats': 'analytics',
                'density': 'grain'
            };

            let html = '';
            this.rules.forEach(rule => {
                const isActive = (this.activeRuleId === rule.id);
                const icon = opIcons[rule.opType] || 'hub';

                html += `
                    <div class="w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${isActive ? 'bg-cyan-500/10 dark:bg-cyan-950/40 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'}">
                        <div class="flex items-center gap-2.5 overflow-hidden flex-1 cursor-pointer" onclick="window.spatialAnalyticsEngine.toggleRule('${rule.id}')">
                            <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="background-color: ${rule.highlightColor || '#06b6d4'}20; color: ${rule.highlightColor || '#06b6d4'};">
                                <span class="material-symbols-outlined text-[18px]">${icon}</span>
                            </div>
                            <div class="truncate">
                                <h4 class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${rule.name}</h4>
                                <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                    ${rule.targetLayerName || 'Alvo'} ➔ ${rule.refLayerName || 'Ref.'}
                                </p>
                            </div>
                        </div>
                        <div class="shrink-0 flex items-center gap-1.5">
                            <button type="button" onclick="window.openSpatialRuleModal('${rule.id}')" class="p-1 text-slate-400 hover:text-cyan-400 transition-colors tooltip" title="Editar Análise">
                                <span class="material-symbols-outlined text-[16px]">edit</span>
                            </button>
                            <button type="button" onclick="window.spatialAnalyticsEngine.toggleRule('${rule.id}')" class="text-slate-400 hover:text-cyan-500 transition-colors">
                                <span class="material-symbols-outlined text-[20px] ${isActive ? 'text-cyan-500' : 'opacity-60'}">
                                    ${isActive ? 'radio_button_checked' : 'radio_button_unchecked'}
                                </span>
                            </button>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
        }

        async getFeaturesForTheme(themeIdentifier) {
            if (!themeIdentifier) return [];

            const themesList = window.themes || (typeof themes !== 'undefined' ? themes : []) || [];
            let theme = themesList.find(t => t.id === themeIdentifier || t.name === themeIdentifier || t.name?.toLowerCase() === themeIdentifier?.toLowerCase());
            
            if (theme && theme.features && theme.features.length > 0) {
                return theme.features;
            }

            if (window.GeoTurboDB && typeof window.GeoTurboDB.getThemeData === 'function') {
                try {
                    const targetId = theme ? theme.id : themeIdentifier;
                    const cached = await window.GeoTurboDB.getThemeData(targetId);
                    if (cached && cached.features && cached.features.length > 0) {
                        if (theme) {
                            theme.features = cached.features;
                            theme._propertiesFullyLoaded = true;
                        }
                        return cached.features;
                    }
                } catch(e) {}
            }

            if (theme && typeof window.loadThemeProperties === 'function' && !theme._propertiesFullyLoaded) {
                try {
                    await window.loadThemeProperties(theme.id);
                    if (theme.features && theme.features.length > 0) return theme.features;
                } catch(e) {}
            }

            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                try {
                    const targetId = theme ? theme.id : themeIdentifier;
                    const { data } = await supabaseClient.from('feicoes').select('propriedades, geometria').eq('theme_id', targetId);
                    if (data && data.length > 0) {
                        const feats = data.map(row => ({
                            type: 'Feature',
                            geometry: row.geometria,
                            properties: row.propriedades || {}
                        }));
                        if (theme) {
                            theme.features = feats;
                            theme._propertiesFullyLoaded = true;
                        }
                        return feats;
                    }
                } catch(e) {}
            }

            const leafletFeatures = [];
            if (window.map) {
                window.map.eachLayer(l => {
                    if (l.feature && l.feature.properties) {
                        const p = l.feature.properties;
                        if (p.themeId === themeIdentifier || p._themeId === themeIdentifier || (theme && (p.themeId === theme.id || p._themeId === theme.id))) {
                            leafletFeatures.push(l.feature);
                        }
                    }
                });
            }
            return leafletFeatures;
        }

        applyFeatureFilter(features, attrField, attrValue) {
            if (!features || !features.length) return [];
            let filtered = features;

            if (attrField && attrValue) {
                filtered = filtered.filter(f => {
                    const val = f.properties ? f.properties[attrField] : undefined;
                    return String(val).toLowerCase() === String(attrValue).toLowerCase();
                });
            }

            return filtered;
        }

        toggleRule(ruleId) {
            if (this.activeRuleId === ruleId) {
                this.clearActiveAnalysis();
            } else {
                this.runAnalysis(ruleId);
            }
            this.renderMenuList();
        }

        async runAnalysis(ruleId) {
            const rule = this.rules.find(r => r.id === ruleId);
            if (!rule) return;

            this.clearActiveAnalysis(false);
            this.activeRuleId = ruleId;

            let targetFeatures = await this.getFeaturesForTheme(rule.targetLayer);
            let refFeatures = await this.getFeaturesForTheme(rule.refLayer);

            targetFeatures = this.applyFeatureFilter(targetFeatures, rule.targetAttrField, rule.targetAttrValue);
            refFeatures = this.applyFeatureFilter(refFeatures, rule.refAttrField, rule.refAttrValue);

            if (targetFeatures.length === 0 || refFeatures.length === 0) {
                this.showResultCard(rule, 0, 0, 'As camadas ou filtros selecionados não retornaram feições para o cruzamento.');
                return;
            }

            let matchingFeatures = [];
            let combinedRef = null;

            try {
                if (refFeatures.length === 1) {
                    combinedRef = refFeatures[0];
                } else if (refFeatures.length > 1) {
                    combinedRef = turf.featureCollection(refFeatures);
                }
            } catch(e) {
                combinedRef = refFeatures[0];
            }

            let bufferGeom = null;
            const toleranceMeters = rule.toleranceMeters || (rule.opType === 'touches' ? 1.0 : (rule.bufferDist || 30));

            if (rule.opType === 'buffer' || rule.opType === 'touches') {
                try {
                    const distKm = toleranceMeters / 1000;
                    bufferGeom = turf.buffer(combinedRef, distKm, { units: 'kilometers' });
                } catch(e) {
                    console.warn('Erro ao gerar buffer:', e);
                }
            }

            // Função de Particionamento Vetorial Exato de Polígono por Linha Inclinada de Limite
            const splitPolygonByLine = (polyFeat, lineFeat) => {
                try {
                    if (!polyFeat || !polyFeat.geometry) return null;
                    const geomType = polyFeat.geometry.type;
                    const coords = geomType === 'Polygon' ? polyFeat.geometry.coordinates[0] : (geomType === 'MultiPolygon' ? polyFeat.geometry.coordinates[0][0] : null);
                    if (!coords || coords.length < 4) return null;

                    let pt1 = null;
                    let pt2 = null;

                    if (lineFeat && lineFeat.geometry) {
                        try {
                            const pts = turf.lineIntersect(polyFeat, lineFeat);
                            if (pts && pts.features && pts.features.length >= 2) {
                                pt1 = pts.features[0].geometry.coordinates;
                                pt2 = pts.features[pts.features.length - 1].geometry.coordinates;
                            } else if (pts && pts.features && pts.features.length === 1) {
                                pt1 = pts.features[0].geometry.coordinates;
                                // Direção norte-sul da linha
                                pt2 = [pt1[0], pt1[1] + 0.001];
                            }
                        } catch(eCut) {}
                    }

                    if (!pt1 || !pt2 || (pt1[0] === pt2[0] && pt1[1] === pt2[1])) {
                        const polyBbox = turf.bbox(polyFeat);
                        const [minX, minY, maxX, maxY] = polyBbox;
                        const cutX = minX + (maxX - minX) * 0.70;
                        pt1 = [cutX, minY];
                        pt2 = [cutX, maxY];
                    }

                    // Equação da reta orientada: (px - x1)*dy - (py - y1)*dx
                    const x1 = pt1[0], y1 = pt1[1];
                    const x2 = pt2[0], y2 = pt2[1];
                    const dx = x2 - x1;
                    const dy = y2 - y1;

                    const sideOf = (p) => (p[0] - x1) * dy - (p[1] - y1) * dx;

                    const leftCoords = [];
                    const rightCoords = [];

                    for (let i = 0; i < coords.length - 1; i++) {
                        const p1 = coords[i];
                        const p2 = coords[i + 1];
                        const side1 = sideOf(p1);
                        const side2 = sideOf(p2);

                        if (side1 >= 0) leftCoords.push(p1);
                        else rightCoords.push(p1);

                        if ((side1 >= 0) !== (side2 >= 0)) {
                            const denom = (side1 - side2);
                            if (denom !== 0) {
                                const t = side1 / denom;
                                const interPt = [
                                    p1[0] + t * (p2[0] - p1[0]),
                                    p1[1] + t * (p2[1] - p1[1])
                                ];
                                leftCoords.push(interPt);
                                rightCoords.push(interPt);
                            }
                        }
                    }

                    if (leftCoords.length >= 3 && rightCoords.length >= 3) {
                        if (leftCoords[0][0] !== leftCoords[leftCoords.length - 1][0] || leftCoords[0][1] !== leftCoords[leftCoords.length - 1][1]) {
                            leftCoords.push([...leftCoords[0]]);
                        }
                        if (rightCoords[0][0] !== rightCoords[rightCoords.length - 1][0] || rightCoords[0][1] !== rightCoords[rightCoords.length - 1][1]) {
                            rightCoords.push([...rightCoords[0]]);
                        }

                        const polyA = turf.polygon([leftCoords]);
                        const polyB = turf.polygon([rightCoords]);

                        const centA = turf.centroid(polyA).geometry.coordinates;
                        const centB = turf.centroid(polyB).geometry.coordinates;

                        // A parte com centróide mais a oeste (menor X) é a Regular, a mais a leste é o Avanço
                        const isAWest = centA[0] < centB[0];
                        return {
                            regular: isAWest ? polyA : polyB,
                            avanco: isAWest ? polyB : polyA
                        };
                    }
                } catch(e) {}
                return null;
            };

            let totalOverlayAreaM2 = 0;
            let totalRegularAreaM2 = 0;
            let totalAdvancedAreaM2 = 0;
            let totalLinearLengthMeters = 0;
            let zonalStatsMap = {};
            let splitVisualFeatures = [];

            targetFeatures.forEach(tFeat => {
                if (!tFeat.geometry) return;
                let isMatch = false;
                let featExtraData = {};

                try {
                    if (rule.opType === 'intersects') {
                        // Encontra feição de referência individual que intersecta o lote
                        let matchingRef = null;
                        for (const r of refFeatures) {
                            if (turf.booleanIntersects(tFeat, r)) {
                                matchingRef = r;
                                break;
                            }
                        }
                        if (matchingRef) {
                            isMatch = true;
                            if (rule.calcArea && (tFeat.geometry.type.includes('Polygon'))) {
                                const featTotalArea = turf.area(tFeat);
                                let splitDone = false;

                                if (matchingRef.geometry.type.includes('Polygon')) {
                                    try {
                                        const intersection = turf.intersect(tFeat, matchingRef);
                                        const difference = turf.difference(tFeat, matchingRef);

                                        if (intersection && difference) {
                                            const regArea = turf.area(intersection);
                                            const advArea = turf.area(difference);

                                            if (regArea > 0.05 && advArea > 0.05) {
                                                totalOverlayAreaM2 += regArea;
                                                totalRegularAreaM2 += regArea;
                                                totalAdvancedAreaM2 += advArea;

                                                featExtraData.areaTotal = featTotalArea;
                                                featExtraData.areaRegular = regArea;
                                                featExtraData.areaAvancada = advArea;

                                                splitVisualFeatures.push({
                                                    type: 'Feature',
                                                    geometry: intersection.geometry,
                                                    properties: { ...tFeat.properties, _partType: 'regular', _partAreaM2: regArea, _label: 'Área Regular' }
                                                });
                                                splitVisualFeatures.push({
                                                    type: 'Feature',
                                                    geometry: difference.geometry,
                                                    properties: { ...tFeat.properties, _partType: 'avanco', _partAreaM2: advArea, _label: 'Área de Avanço' }
                                                });
                                                splitDone = true;
                                            }
                                        }
                                    } catch(ePoly) {}
                                }

                                if (!splitDone) {
                                    try {
                                        let refLine = matchingRef;
                                        if (matchingRef.geometry.type.includes('Polygon')) {
                                            try { refLine = turf.polygonToLine(matchingRef); } catch(eL) {}
                                        }

                                        const splitRes = splitPolygonByLine(tFeat, refLine);
                                        if (splitRes && splitRes.regular && splitRes.avanco) {
                                            const regArea = turf.area(splitRes.regular);
                                            const advArea = turf.area(splitRes.avanco);

                                            totalOverlayAreaM2 += regArea;
                                            totalRegularAreaM2 += regArea;
                                            totalAdvancedAreaM2 += advArea;

                                            featExtraData.areaTotal = featTotalArea;
                                            featExtraData.areaRegular = regArea;
                                            featExtraData.areaAvancada = advArea;

                                            splitVisualFeatures.push({
                                                type: 'Feature',
                                                geometry: splitRes.regular.geometry,
                                                properties: { ...tFeat.properties, _partType: 'regular', _partAreaM2: regArea, _label: 'Área Regular' }
                                            });
                                            splitVisualFeatures.push({
                                                type: 'Feature',
                                                geometry: splitRes.avanco.geometry,
                                                properties: { ...tFeat.properties, _partType: 'avanco', _partAreaM2: advArea, _label: 'Área de Avanço' }
                                            });
                                            splitDone = true;
                                        }
                                    } catch(eLine) {}
                                }

                                if (!splitDone) {
                                    splitVisualFeatures.push({
                                        type: 'Feature',
                                        geometry: tFeat.geometry,
                                        properties: { ...tFeat.properties, _partType: 'regular', _partAreaM2: featTotalArea, _label: 'Área Regular' }
                                    });
                                    totalOverlayAreaM2 += featTotalArea;
                                    totalRegularAreaM2 += featTotalArea;
                                }
                            }
                        }
                    } else if (rule.opType === 'touches') {
                        for (const rFeat of refFeatures) {
                            if (turf.booleanTouches(tFeat, rFeat) || turf.booleanIntersects(tFeat, rFeat) || (bufferGeom && turf.booleanIntersects(tFeat, bufferGeom))) {
                                isMatch = true;
                                if (rule.calcArea && tFeat.geometry.type.includes('Polygon')) {
                                    const featTotalArea = turf.area(tFeat);
                                    featExtraData.areaTotal = featTotalArea;
                                    featExtraData.areaRegular = featTotalArea;
                                    totalRegularAreaM2 += featTotalArea;
                                }
                                break;
                            }
                        }
                    } else if (rule.opType === 'buffer' && bufferGeom) {
                        if (turf.booleanIntersects(tFeat, bufferGeom)) isMatch = true;
                    } else if (rule.opType === 'within') {
                        for (const rFeat of refFeatures) {
                            if (turf.booleanWithin(tFeat, rFeat) || turf.booleanPointInPolygon(tFeat, rFeat)) {
                                isMatch = true;
                                if (rule.calcArea && tFeat.geometry.type.includes('Polygon')) {
                                    const featTotalArea = turf.area(tFeat);
                                    featExtraData.areaTotal = featTotalArea;
                                    featExtraData.areaRegular = featTotalArea;
                                    totalRegularAreaM2 += featTotalArea;
                                }
                                break;
                            }
                        }
                    } else if (rule.opType === 'disjoint') {
                        let hasContact = false;
                        for (const rFeat of refFeatures) {
                            if (turf.booleanIntersects(tFeat, rFeat) || turf.booleanTouches(tFeat, rFeat)) {
                                hasContact = true;
                                break;
                            }
                        }
                        if (!hasContact) {
                            isMatch = true;
                            if (rule.calcArea && tFeat.geometry.type.includes('Polygon')) {
                                const featTotalArea = turf.area(tFeat);
                                featExtraData.areaTotal = featTotalArea;
                                featExtraData.areaRegular = featTotalArea;
                                totalRegularAreaM2 += featTotalArea;
                            }
                        }
                    } else if (rule.opType === 'length_clip') {
                        for (const rFeat of refFeatures) {
                            if (turf.booleanIntersects(tFeat, rFeat)) {
                                isMatch = true;
                                try {
                                    const intersection = turf.lineSplit(tFeat, rFeat);
                                    let lenMeters = 0;
                                    if (intersection && intersection.features) {
                                        intersection.features.forEach(seg => {
                                            if (turf.booleanWithin(seg, rFeat) || turf.booleanIntersects(seg, rFeat)) {
                                                lenMeters += turf.length(seg, { units: 'meters' });
                                            }
                                        });
                                    } else {
                                        lenMeters = turf.length(tFeat, { units: 'meters' });
                                    }
                                    totalLinearLengthMeters += lenMeters;
                                    featExtraData.linearLength = lenMeters;
                                } catch(eLen) {
                                    const fullLen = turf.length(tFeat, { units: 'meters' });
                                    totalLinearLengthMeters += fullLen;
                                    featExtraData.linearLength = fullLen;
                                }
                                break;
                            }
                        }
                    } else if (rule.opType === 'nearest') {
                        let minDist = Infinity;
                        let closestRef = null;
                        for (const rFeat of refFeatures) {
                            try {
                                const dist = turf.distance(turf.centroid(tFeat), turf.centroid(rFeat), { units: 'meters' });
                                if (dist < minDist) {
                                    minDist = dist;
                                    closestRef = rFeat;
                                }
                            } catch(eN) {}
                        }
                        if (closestRef) {
                            isMatch = true;
                            featExtraData.nearestDistMeters = minDist;
                            featExtraData.closestRefName = closestRef?.properties?.nome || closestRef?.properties?.Name || 'Referência';
                        }
                    } else if (rule.opType === 'zonal_stats' || rule.opType === 'density') {
                        for (const rFeat of refFeatures) {
                            if (turf.booleanIntersects(tFeat, rFeat) || turf.booleanPointInPolygon(tFeat, rFeat) || turf.booleanWithin(tFeat, rFeat)) {
                                isMatch = true;
                                const zoneKey = rFeat.properties?.nome || rFeat.properties?.bairro || rFeat.properties?.id || 'Zona';
                                if (!zonalStatsMap[zoneKey]) {
                                    let zoneAreaKm2 = 0;
                                    try { zoneAreaKm2 = turf.area(rFeat) / 1000000; } catch(eZ) {}
                                    zonalStatsMap[zoneKey] = { count: 0, areaKm2: zoneAreaKm2 };
                                }
                                zonalStatsMap[zoneKey].count++;
                                break;
                            }
                        }
                    }
                } catch(eEval) {
                    console.warn('Erro ao avaliar topologia:', eEval);
                }

                if (isMatch) {
                    tFeat._extraAnalysisData = featExtraData;
                    matchingFeatures.push(tFeat);
                }
            });

            this.lastAnalysisResult = {
                rule,
                totalTarget: targetFeatures.length,
                totalMatching: matchingFeatures.length,
                matchingFeatures,
                totalOverlayAreaM2,
                totalRegularAreaM2,
                totalAdvancedAreaM2,
                totalLinearLengthMeters,
                zonalStatsMap,
                splitVisualFeatures,
                bufferGeom,
                date: new Date().toLocaleString('pt-BR')
            };

            // Desativa qualquer painel estatístico de camadas anterior
            if (typeof window.closeStatsDashboard === 'function') {
                window.closeStatsDashboard();
            }

            this.applyMapHighlight(rule, matchingFeatures, bufferGeom, splitVisualFeatures, refFeatures);
            this.showResultCard(rule, matchingFeatures.length, totalOverlayAreaM2);
        }

        applyMapHighlight(rule, matchingFeatures, bufferGeom = null, splitVisualFeatures = [], refFeatures = []) {
            if (!window.map) return;

            if (this.highlightLayer) {
                window.map.removeLayer(this.highlightLayer);
                this.highlightLayer = null;
            }
            if (this.referenceHighlightLayer) {
                window.map.removeLayer(this.referenceHighlightLayer);
                this.referenceHighlightLayer = null;
            }
            if (this.labelsLayer) {
                window.map.removeLayer(this.labelsLayer);
                this.labelsLayer = null;
            }

            this.labelsLayer = L.featureGroup().addTo(window.map);
            const allBounds = L.latLngBounds([]);

            // 1. Desenha a Camada de Referência (Linha de Limite em Roxo com Destaque)
            if (refFeatures && refFeatures.length > 0) {
                this.referenceHighlightLayer = L.geoJSON(refFeatures, {
                    style: {
                        color: '#a855f7',
                        weight: 4.5,
                        opacity: 0.95,
                        dashArray: ''
                    }
                }).addTo(window.map);
                try {
                    const b = this.referenceHighlightLayer.getBounds();
                    if (b.isValid()) allBounds.extend(b);
                } catch(e) {}
            }

            if (bufferGeom) {
                const bufLayer = L.geoJSON(bufferGeom, {
                    style: {
                        color: '#06b6d4',
                        weight: 2,
                        dashArray: '5, 5',
                        fillColor: '#06b6d4',
                        fillOpacity: 0.15
                    }
                }).addTo(window.map);
                try {
                    const b = bufLayer.getBounds();
                    if (b.isValid()) allBounds.extend(b);
                } catch(e) {}
            }

            // 2. Desenha os Lotes / Feições com Bordas Pretas Definidas e Cores Diferenciadas (Regular vs Avanço)
            const featuresToDraw = (splitVisualFeatures && splitVisualFeatures.length > 0) ? splitVisualFeatures : matchingFeatures;

            if (featuresToDraw && featuresToDraw.length > 0) {
                this.highlightLayer = L.geoJSON(featuresToDraw, {
                    style: (feature) => {
                        const isAvanco = feature?.properties?._partType === 'avanco';
                        const fillColor = isAvanco ? '#ef4444' : '#06b6d4';
                        return {
                            color: '#000000',
                            weight: 2.2,
                            opacity: 1,
                            fillColor: fillColor,
                            fillOpacity: isAvanco ? 0.8 : 0.65
                        };
                    },
                    pointToLayer: (feature, latlng) => {
                        const isAvanco = feature?.properties?._partType === 'avanco';
                        const color = isAvanco ? '#ef4444' : '#06b6d4';
                        return L.circleMarker(latlng, {
                            radius: 8,
                            fillColor: color,
                            color: '#000000',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.9
                        });
                    },
                    onEachFeature: (feature, layer) => {
                        const p = feature.properties || {};
                        const partType = p._partType === 'avanco' ? '<span class="px-2 py-0.5 bg-rose-500/20 text-rose-400 font-bold rounded">Área de Avanço</span>' : '<span class="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 font-bold rounded">Área Regular</span>';
                        let popupHtml = `
                            <div class="p-1 text-xs space-y-1">
                                <div class="font-bold text-slate-100 mb-1 flex items-center justify-between gap-2">
                                    <span>${p.nome || p.Name || 'Lote/Imóvel'}</span>
                                    ${p._partType ? partType : ''}
                                </div>
                                ${p._partAreaM2 ? `<div><strong>Área:</strong> ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(p._partAreaM2)} m²</div>` : ''}
                                ${p.loteamento ? `<div><strong>Loteamento:</strong> ${p.loteamento}</div>` : ''}
                            </div>
                        `;
                        layer.bindPopup(popupHtml);

                        // Rótulo interno com a metragem quadrada do polígono
                        if (p._partAreaM2 && feature.geometry) {
                            try {
                                const c = turf.centroid(feature);
                                const lat = c.geometry.coordinates[1];
                                const lng = c.geometry.coordinates[0];
                                const areaStr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(p._partAreaM2);
                                
                                const labelIcon = L.divIcon({
                                    className: 'custom-area-label-wrapper',
                                    html: `<div style="background: rgba(0,0,0,0.85); color: #ffffff; padding: 2px 5px; border-radius: 4px; font-size: 10px; font-weight: 700; border: 1px solid rgba(255,255,255,0.3); box-shadow: 0 2px 6px rgba(0,0,0,0.5); transform: translate(-50%, -50%); pointer-events: none; white-space: nowrap;">${areaStr} m²</div>`,
                                    iconSize: [0, 0]
                                });
                                L.marker([lat, lng], { icon: labelIcon }).addTo(this.labelsLayer);
                            } catch(eLbl) {}
                        }
                    }
                }).addTo(window.map);

                try {
                    const b = this.highlightLayer.getBounds();
                    if (b.isValid()) allBounds.extend(b);
                } catch(e) {}
            }

            if (allBounds.isValid()) {
                window.map.fitBounds(allBounds, { padding: [60, 60], maxZoom: 18 });
            }
        }

        showResultCard(rule, matchCount, areaM2 = 0, warningMsg = '') {
            let card = document.getElementById('spatial-result-card');
            if (!card) {
                card = document.createElement('div');
                card.id = 'spatial-result-card';
                card.className = 'fixed z-[1000] flex flex-col bg-[#070b14]/75 backdrop-blur-md border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] rounded-2xl p-4 w-[380px] max-w-[92vw] text-white animate-in fade-in slide-in-from-top-4 duration-300';
                document.body.appendChild(card);
            }

            // Alinhamento dinâmico: canto superior direito a 10px, logo abaixo do menu de estatísticas se aberto
            const menu = document.getElementById('spatial-analytics-menu');
            let topPos = 10;
            if (menu && !menu.classList.contains('hidden')) {
                const rect = menu.getBoundingClientRect();
                topPos = Math.max(10, rect.bottom + 10);
            }
            card.style.top = `${topPos}px`;
            card.style.right = '10px';
            card.style.left = 'auto';
            card.style.bottom = 'auto';

            const lastRes = this.lastAnalysisResult;
            const hasAreas = (lastRes && (lastRes.totalRegularAreaM2 > 0 || lastRes.totalAdvancedAreaM2 > 0));

            let alertHtml = '';
            if (warningMsg) {
                alertHtml = `
                    <div class="p-2 mb-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[15px] shrink-0">info</span>
                        <span>${warningMsg}</span>
                    </div>
                `;
            }

            card.innerHTML = `
                <div id="spatial-result-card-header" class="flex items-center justify-between pb-2 mb-2 border-b border-white/10 cursor-grab select-none">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-cyan-400 text-[18px]">query_stats</span>
                        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-100 truncate max-w-[240px]" title="${rule.name}">
                            ${rule.name}
                        </h4>
                    </div>
                    <button type="button" onclick="window.spatialAnalyticsEngine.clearActiveAnalysis()" class="p-1 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors cursor-pointer" title="Fechar">
                        <span class="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                ${alertHtml}

                <div class="flex items-baseline justify-between mb-2 px-1">
                    <span class="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Feições Detectadas</span>
                    <span class="text-lg font-bold text-cyan-400">${matchCount} <span class="text-xs font-normal text-slate-300">registros</span></span>
                </div>

                <div class="relative w-full h-44 flex items-center justify-center bg-slate-950/40 rounded-xl p-2 border border-white/5">
                    <canvas id="mini-spatial-result-chart" class="w-full h-full"></canvas>
                </div>
            `;

            card.classList.remove('hidden');

            // Torna o card arrastável
            makeElementDraggable(card, document.getElementById('spatial-result-card-header'));

            // Renderiza o gráfico no padrão idêntico aos cards de estatísticas das camadas
            setTimeout(() => {
                const miniCanvas = document.getElementById('mini-spatial-result-chart');
                if (miniCanvas && window.Chart) {
                    if (window._miniSpatialChartInstance) {
                        window._miniSpatialChartInstance.destroy();
                    }
                    const mCtx = miniCanvas.getContext('2d');
                    
                    let chartLabels = [];
                    let chartData = [];
                    let chartColors = [];

                    if (hasAreas) {
                        const totalArea = (lastRes.totalRegularAreaM2 + lastRes.totalAdvancedAreaM2) || 1;
                        const regPct = ((lastRes.totalRegularAreaM2 / totalArea) * 100).toFixed(1);
                        const advPct = ((lastRes.totalAdvancedAreaM2 / totalArea) * 100).toFixed(1);
                        const regM2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(lastRes.totalRegularAreaM2);
                        const advM2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(lastRes.totalAdvancedAreaM2);

                        chartLabels = [
                            `Regular (${regM2}m² - ${regPct}%)`,
                            `Avanço (${advM2}m² - ${advPct}%)`
                        ];
                        chartData = [lastRes.totalRegularAreaM2, lastRes.totalAdvancedAreaM2];
                        chartColors = ['#06b6d4', '#ef4444'];
                    } else {
                        const totalT = lastRes?.totalTarget || matchCount;
                        const rest = Math.max(0, totalT - matchCount);
                        const matchPct = totalT > 0 ? ((matchCount / totalT) * 100).toFixed(1) : 100;
                        const restPct = totalT > 0 ? ((rest / totalT) * 100).toFixed(1) : 0;

                        chartLabels = [
                            `Relacionadas (${matchCount} - ${matchPct}%)`,
                            `Restante (${rest} - ${restPct}%)`
                        ];
                        chartData = [matchCount, rest];
                        chartColors = ['#06b6d4', '#475569'];
                    }

                    window._miniSpatialChartInstance = new Chart(mCtx, {
                        type: 'doughnut',
                        data: {
                            labels: chartLabels,
                            datasets: [{
                                data: chartData,
                                backgroundColor: chartColors,
                                hoverBackgroundColor: chartColors,
                                borderWidth: 0,
                                cutout: '65%'
                            }]
                        },
                        options: {
                            animation: {
                                duration: 1000,
                                easing: 'easeOutQuart'
                            },
                            responsive: true,
                            maintainAspectRatio: false,
                            layout: { padding: 0 },
                            plugins: {
                                legend: {
                                    display: true,
                                    position: 'right',
                                    labels: {
                                        color: '#cbd5e1',
                                        font: { size: 10, family: 'Inter' },
                                        usePointStyle: true,
                                        boxWidth: 6,
                                        padding: 8
                                    }
                                },
                                tooltip: {
                                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                                    titleColor: '#fff',
                                    bodyColor: '#cbd5e1',
                                    borderColor: 'rgba(6, 182, 212, 0.5)',
                                    borderWidth: 1,
                                    padding: 8,
                                    cornerRadius: 8
                                }
                            }
                        }
                    });
                }
            }, 60);
        }

        clearActiveAnalysis(closeCard = true) {
            this.activeRuleId = null;

            if (this.highlightLayer && window.map) {
                window.map.removeLayer(this.highlightLayer);
                this.highlightLayer = null;
            }
            if (this.referenceHighlightLayer && window.map) {
                window.map.removeLayer(this.referenceHighlightLayer);
                this.referenceHighlightLayer = null;
            }
            if (this.labelsLayer && window.map) {
                this.labelsLayer.clearLayers();
                window.map.removeLayer(this.labelsLayer);
                this.labelsLayer = null;
            }

            // Limpeza de seguranca de quaisquer rotulos residuais no Leaflet
            if (window.map) {
                window.map.eachLayer(layer => {
                    if (layer.options && layer.options.icon && layer.options.icon.options && layer.options.icon.options.className === 'custom-area-label-wrapper') {
                        window.map.removeLayer(layer);
                    }
                });
            }

            if (closeCard) {
                const card = document.getElementById('spatial-result-card');
                if (card) card.classList.add('hidden');
            }

            this.renderMenuList();
        }

        getThemeFormFields(themeId) {
            const themesList = window.themes || (typeof themes !== 'undefined' ? themes : []) || [];
            const theme = themesList.find(t => t.id === themeId || t.name === themeId);
            const fieldsMap = new Map();

            // 1. Campos do Formulário Vinculado à Camada
            const allFormsList = window.allForms || (typeof allForms !== 'undefined' ? allForms : []) || [];
            if (theme && (theme.formId || theme.cadastroType)) {
                const formId = theme.formId || theme.cadastroType;
                const form = allFormsList.find(f => f.id === formId);
                if (form && (form.schema || form.tabs)) {
                    const tabs = form.schema || form.tabs;
                    tabs.forEach(tab => {
                        if (tab.fields && Array.isArray(tab.fields)) {
                            tab.fields.forEach(f => {
                                if (f && f.id && !['photo', 'attachment', 'drawing_layer'].includes(f.type)) {
                                    const label = f.label || f.name || f.id;
                                    fieldsMap.set(f.id, {
                                        id: f.id,
                                        label: label,
                                        type: f.type,
                                        options: f.options || [],
                                        tabTitle: tab.title || tab.name || 'Geral'
                                    });
                                }
                            });
                        }
                    });
                }
            }

            // 2. Se o tema tiver feições com propriedades adicionais, adiciona também
            if (theme && theme.features && theme.features.length > 0) {
                theme.features.forEach(f => {
                    if (f.properties) {
                        Object.keys(f.properties).forEach(k => {
                            if (!k.startsWith('_') && k !== 'themeId' && k !== 'id_banco' && typeof f.properties[k] !== 'object') {
                                if (!fieldsMap.has(k)) {
                                    fieldsMap.set(k, {
                                        id: k,
                                        label: k,
                                        type: 'text',
                                        options: [],
                                        tabTitle: 'Atributos GeoJSON'
                                    });
                                }
                            }
                        });
                    }
                });
            }

            return Array.from(fieldsMap.values());
        }

        applyFeatureFilter(features, attrField, attrValue) {
            if (!features || !features.length) return [];
            let filtered = features;

            if (attrField && attrValue) {
                const searchVal = String(attrValue).trim().toLowerCase();
                filtered = filtered.filter(f => {
                    if (!f.properties) return false;
                    
                    // Busca direta por ID do campo
                    let val = f.properties[attrField];
                    
                    // Busca por label ou case-insensitive
                    if (val === undefined || val === null || val === '') {
                        for (const [k, v] of Object.entries(f.properties)) {
                            if (k.toLowerCase() === attrField.toLowerCase()) {
                                val = v;
                                break;
                            }
                        }
                    }
                    
                    if (val === undefined || val === null) return false;
                    return String(val).trim().toLowerCase() === searchVal;
                });
            }

            return filtered;
        }

        // ==========================================
        // PAINEL ESTATÍSTICO EM TELA CHEIA (CONSTRUTOR)
        // ==========================================
        ensureSpatialRuleModalDOM() {
            if (document.getElementById('spatial-rule-modal')) return;

            const modal = document.createElement('div');
            modal.id = 'spatial-rule-modal';
            modal.className = 'fixed inset-0 bg-[#070b14]/98 z-[1200] hidden flex flex-col p-4 md:p-6 backdrop-blur-2xl overflow-y-auto text-slate-100 font-sans animate-in fade-in duration-200';
            modal.innerHTML = `
              <style>
                #spatial-rule-modal select, 
                #spatial-rule-modal input:not([type="checkbox"]), 
                #spatial-rule-modal textarea {
                  background-color: #0b1329 !important;
                  color: #ffffff !important;
                  border: 1px solid #334155 !important;
                }
                #spatial-rule-modal select option {
                  background-color: #0b1329 !important;
                  color: #ffffff !important;
                  padding: 6px !important;
                }
                #spatial-rule-modal select:focus, 
                #spatial-rule-modal input:focus, 
                #spatial-rule-modal textarea:focus {
                  border-color: #06b6d4 !important;
                  box-shadow: 0 0 0 2px rgba(6,182,212,0.25) !important;
                  outline: none !important;
                }
                #spatial-rule-modal input[type="checkbox"] {
                  appearance: none !important;
                  -webkit-appearance: none !important;
                  width: 20px !important;
                  height: 20px !important;
                  border-radius: 6px !important;
                  border: 1.5px solid #334155 !important;
                  background-color: #0b1329 !important;
                  cursor: pointer !important;
                  display: inline-flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  position: relative !important;
                  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                }
                #spatial-rule-modal input[type="checkbox"]:hover {
                  border-color: #10b981 !important;
                }
                #spatial-rule-modal input[type="checkbox"]:checked {
                  background-color: #022c22 !important;
                  border-color: #10b981 !important;
                  box-shadow: 0 0 10px rgba(16, 185, 129, 0.35) !important;
                }
                #spatial-rule-modal input[type="checkbox"]:checked::after {
                  content: "✔" !important;
                  font-size: 13px !important;
                  font-weight: 900 !important;
                  color: #10b981 !important;
                  position: absolute !important;
                  top: 50% !important;
                  left: 50% !important;
                  transform: translate(-50%, -55%) !important;
                }
                .dark-tiles-layer {
                  filter: brightness(0.6) invert(1) contrast(2.5) hue-rotate(200deg) saturate(0.25) brightness(0.7) !important;
                }
              </style>

              <!-- Header Superior com Indicador de Progresso -->
              <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between pb-4 border-b border-slate-800 gap-4 shrink-0">
                <div>
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                      <span class="material-symbols-outlined text-[20px]">hub</span>
                    </div>
                    <h2 class="text-lg md:text-xl font-bold text-white tracking-wide" id="spatial-modal-title">
                      Painel Estatístico – Análise Espacial Cruzada
                    </h2>
                  </div>
                  <p class="text-xs text-slate-400 mt-0.5">Consultas cruzadas entre camadas vetoriais de forma simples, rápida e poderosa.</p>
                </div>

                <!-- Stepper Progress Tracker -->
                <div class="flex items-center gap-2 sm:gap-3 overflow-x-auto w-full lg:w-auto py-1">
                  <div id="step-btn-1" onclick="window.setSpatialStep(1)" class="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all border-cyan-500 bg-cyan-500/15 text-cyan-300">
                    <span class="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center text-[10px]">1</span>
                    <span>Selecionar Camadas</span>
                  </div>
                  <span class="text-slate-600">➔</span>
                  <div id="step-btn-2" onclick="window.setSpatialStep(2)" class="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/5 text-slate-400 text-xs font-bold cursor-pointer transition-all hover:bg-slate-800/50">
                    <span class="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px]">2</span>
                    <span>Definir Operação</span>
                  </div>
                  <span class="text-slate-600">➔</span>
                  <div id="step-btn-3" onclick="window.setSpatialStep(3)" class="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/5 text-slate-400 text-xs font-bold cursor-pointer transition-all hover:bg-slate-800/50">
                    <span class="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px]">3</span>
                    <span>Configurar Análise</span>
                  </div>
                  <span class="text-slate-600">➔</span>
                  <div id="step-btn-4" onclick="window.setSpatialStep(4)" class="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/5 text-slate-400 text-xs font-bold cursor-pointer transition-all hover:bg-slate-800/50">
                    <span class="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px]">4</span>
                    <span>Resultados</span>
                  </div>

                  <button type="button" onclick="window.closeSpatialRuleModal()" class="ml-auto lg:ml-4 p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer" title="Fechar Painel">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
              </div>

              <input type="hidden" id="spatial-rule-id" value="">

              <!-- Container Principal em Grid 3 Colunas Estendido -->
              <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-5 flex-1 min-h-[calc(100vh-210px)] items-stretch">

                <!-- COLUNA ESQUERDA: ETAPA 1 - SELECIONAR CAMADAS -->
                <div class="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-xl backdrop-blur-md">
                  <div class="flex flex-col gap-4">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-800">
                      <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">1</span>
                        <h3 class="text-sm font-bold text-white">Selecionar Camadas</h3>
                      </div>
                      <span class="text-[10px] text-slate-400">Escolha as camadas que serão cruzadas</span>
                    </div>

                    <!-- Camada Alvo -->
                    <div>
                      <label class="block text-xs font-bold text-slate-200 mb-1">Camada Alvo (feições analisadas)</label>
                      <select id="spatial-target-layer" onchange="window.onSpatialLayerChange('target')" class="w-full px-3 py-2.5 rounded-xl text-xs font-medium outline-none">
                      </select>
                    </div>

                    <!-- Restrição Camada Alvo -->
                    <div class="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                      <div class="text-[11px] font-bold text-cyan-400 flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">filter_alt</span> Restringir a feições específicas (opcional)
                      </div>
                      <div class="grid grid-cols-2 gap-2">
                        <div>
                          <label class="block text-[10px] text-slate-400 mb-1">Campo</label>
                          <select id="spatial-target-attr-field" onchange="window.onSpatialAttrFieldChange('target')" class="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none">
                            <option value="">Todos os campos</option>
                          </select>
                        </div>
                        <div>
                          <label class="block text-[10px] text-slate-400 mb-1">Valor</label>
                          <select id="spatial-target-attr-val" onchange="window.updateSpatialQuerySummary()" class="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none">
                            <option value="">Todos os valores</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <!-- Camada de Referência -->
                    <div>
                      <label class="block text-xs font-bold text-slate-200 mb-1">Camada de Referência (cruzada)</label>
                      <select id="spatial-ref-layer" onchange="window.onSpatialLayerChange('ref')" class="w-full px-3 py-2.5 rounded-xl text-xs font-medium outline-none">
                      </select>
                    </div>

                    <!-- Restrição Camada de Referência -->
                    <div class="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                      <div class="text-[11px] font-bold text-purple-400 flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">filter_alt</span> Restringir a feições específicas (opcional)
                      </div>
                      <div class="grid grid-cols-2 gap-2">
                        <div>
                          <label class="block text-[10px] text-slate-400 mb-1">Campo</label>
                          <select id="spatial-ref-attr-field" onchange="window.onSpatialAttrFieldChange('ref')" class="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none">
                            <option value="">Todos os campos</option>
                          </select>
                        </div>
                        <div>
                          <label class="block text-[10px] text-slate-400 mb-1">Valor</label>
                          <select id="spatial-ref-attr-val" onchange="window.updateSpatialQuerySummary()" class="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none">
                            <option value="">Todos os valores</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-col gap-3 mt-auto">
                    <!-- Mini-mapa de Pré-visualização -->
                    <div class="rounded-xl overflow-hidden border border-slate-800 relative h-40 bg-slate-950">
                      <div id="spatial-preview-map" class="w-full h-full"></div>
                      <div class="absolute bottom-2 left-2 z-[400] flex items-center gap-2 text-[10px] bg-slate-900/90 px-2 py-1 rounded-lg border border-slate-700 backdrop-blur-sm">
                        <span class="flex items-center gap-1 text-cyan-400 font-bold"><span class="w-2 h-2 rounded-full bg-cyan-400"></span> Alvo</span>
                        <span class="flex items-center gap-1 text-purple-400 font-bold"><span class="w-2 h-2 rounded-full bg-purple-400"></span> Referência</span>
                      </div>
                    </div>

                    <div class="p-2.5 bg-slate-950/40 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                      <span class="material-symbols-outlined text-[16px] text-cyan-400 shrink-0 mt-0.5">info</span>
                      <span>Se nenhum filtro for selecionado, a análise processará todas as feições das camadas escolhidas.</span>
                    </div>
                  </div>
                </div>

                <!-- COLUNA CENTRAL: ETAPA 2 (OPERAÇÃO) & ETAPA 3 (CONFIGURAÇÃO) -->
                <div class="lg:col-span-4 flex flex-col justify-between gap-5">
                  <!-- ETAPA 2: DEFINIR OPERAÇÃO -->
                  <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3 shadow-xl backdrop-blur-md">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-800">
                      <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">2</span>
                        <h3 class="text-sm font-bold text-white">Definir Operação</h3>
                      </div>
                      <span class="text-[10px] text-slate-400">Escolha a relação topológica</span>
                    </div>

                    <!-- Cards de Operações Espaciais e Geoestatísticas (Grade 9 Operações com Checkboxes Internos) -->
                    <div class="grid grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                      <!-- 1. Interseção -->
                      <div id="op-card-intersects" onclick="window.selectSpatialOp('intersects')" class="p-2.5 rounded-xl border border-cyan-500 bg-cyan-500/15 cursor-pointer transition-all flex flex-col justify-between gap-1.5 select-none hover:border-cyan-400">
                        <div>
                          <div class="flex items-center gap-1.5 text-cyan-400 font-bold text-[11px]">
                            <span class="material-symbols-outlined text-[15px]">content_cut</span> Interseção
                          </div>
                          <p class="text-[9px] text-slate-300 leading-tight mt-0.5">Ocupam a mesma área ou cruzam.</p>
                        </div>
                        <div class="pt-1.5 border-t border-cyan-500/20 flex flex-col gap-1 text-[9px] text-slate-300" onclick="event.stopPropagation()">
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-intersects-area" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Sobreposição de Área</span>
                          </label>
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-intersects-line" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Cruzamento de Linhas</span>
                          </label>
                        </div>
                      </div>

                      <!-- 2. Confrontação -->
                      <div id="op-card-touches" onclick="window.selectSpatialOp('touches')" class="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer transition-all flex flex-col justify-between gap-1.5 select-none hover:border-cyan-400">
                        <div>
                          <div class="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                            <span class="material-symbols-outlined text-[15px]">handshake</span> Confrontação
                          </div>
                          <p class="text-[9px] text-slate-300 leading-tight mt-0.5">Lotes vizinhos / tocam bordas.</p>
                        </div>
                        <div class="pt-1.5 border-t border-white/5 flex flex-col gap-1 text-[9px] text-slate-300" onclick="event.stopPropagation()">
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-touches-border" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Tocar Divisas/Bordas</span>
                          </label>
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-touches-front" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Testada com Logradouro</span>
                          </label>
                        </div>
                      </div>

                      <!-- 3. Buffer / Proximidade -->
                      <div id="op-card-buffer" onclick="window.selectSpatialOp('buffer')" class="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer transition-all flex flex-col justify-between gap-1.5 select-none hover:border-cyan-400">
                        <div>
                          <div class="flex items-center gap-1.5 text-purple-400 font-bold text-[11px]">
                            <span class="material-symbols-outlined text-[15px]">radar</span> Proximidade
                          </div>
                          <p class="text-[9px] text-slate-300 leading-tight mt-0.5">Raio de distância em metros.</p>
                        </div>
                        <div class="pt-1.5 border-t border-white/5 flex flex-col gap-1 text-[9px] text-slate-300" onclick="event.stopPropagation()">
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-buffer-radius" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Raio Fixo (Buffer)</span>
                          </label>
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-buffer-internal" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Incluir Área Interna</span>
                          </label>
                        </div>
                      </div>

                      <!-- 4. Contido em -->
                      <div id="op-card-within" onclick="window.selectSpatialOp('within')" class="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer transition-all flex flex-col justify-between gap-1.5 select-none hover:border-cyan-400">
                        <div>
                          <div class="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                            <span class="material-symbols-outlined text-[15px]">all_inbox</span> Contido em
                          </div>
                          <p class="text-[9px] text-slate-300 leading-tight mt-0.5">Ponto ou linha 100% dentro.</p>
                        </div>
                        <div class="pt-1.5 border-t border-white/5 flex flex-col gap-1 text-[9px] text-slate-300" onclick="event.stopPropagation()">
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-within-total" checked onchange="window.updateSpatialQuerySummary()">
                            <span>100% Inserido</span>
                          </label>
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-within-centroid" onchange="window.updateSpatialQuerySummary()">
                            <span>Centroide Interno</span>
                          </label>
                        </div>
                      </div>

                      <!-- 5. Disjunção / Isolamento -->
                      <div id="op-card-disjoint" onclick="window.selectSpatialOp('disjoint')" class="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer transition-all flex flex-col justify-between gap-1.5 select-none hover:border-cyan-400">
                        <div>
                          <div class="flex items-center gap-1.5 text-rose-400 font-bold text-[11px]">
                            <span class="material-symbols-outlined text-[15px]">do_not_disturb_on</span> Disjunção
                          </div>
                          <p class="text-[9px] text-slate-300 leading-tight mt-0.5">Elementos fora / sem contato.</p>
                        </div>
                        <div class="pt-1.5 border-t border-white/5 flex flex-col gap-1 text-[9px] text-slate-300" onclick="event.stopPropagation()">
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-disjoint-touch" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Sem Confrontação</span>
                          </label>
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-disjoint-intersect" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Sem Interseção</span>
                          </label>
                        </div>
                      </div>

                      <!-- 6. Comprimento Linear -->
                      <div id="op-card-length_clip" onclick="window.selectSpatialOp('length_clip')" class="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer transition-all flex flex-col justify-between gap-1.5 select-none hover:border-cyan-400">
                        <div>
                          <div class="flex items-center gap-1.5 text-blue-400 font-bold text-[11px]">
                            <span class="material-symbols-outlined text-[15px]">straighten</span> Comprimento
                          </div>
                          <p class="text-[9px] text-slate-300 leading-tight mt-0.5">Metragem linear dentro de zona.</p>
                        </div>
                        <div class="pt-1.5 border-t border-white/5 flex flex-col gap-1 text-[9px] text-slate-300" onclick="event.stopPropagation()">
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-length-meters" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Metragem Interna (m)</span>
                          </label>
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-length-count" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Contar Segmentos</span>
                          </label>
                        </div>
                      </div>

                      <!-- 7. Ponto Mais Próximo -->
                      <div id="op-card-nearest" onclick="window.selectSpatialOp('nearest')" class="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer transition-all flex flex-col justify-between gap-1.5 select-none hover:border-cyan-400">
                        <div>
                          <div class="flex items-center gap-1.5 text-yellow-400 font-bold text-[11px]">
                            <span class="material-symbols-outlined text-[15px]">near_me</span> Mais Próximo
                          </div>
                          <p class="text-[9px] text-slate-300 leading-tight mt-0.5">Menor distância ao equipamento.</p>
                        </div>
                        <div class="pt-1.5 border-t border-white/5 flex flex-col gap-1 text-[9px] text-slate-300" onclick="event.stopPropagation()">
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-nearest-dist" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Calcular Menor Distância</span>
                          </label>
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-nearest-line" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Linha de Conexão</span>
                          </label>
                        </div>
                      </div>

                      <!-- 8. Estatística Zonal -->
                      <div id="op-card-zonal_stats" onclick="window.selectSpatialOp('zonal_stats')" class="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer transition-all flex flex-col justify-between gap-1.5 select-none hover:border-cyan-400">
                        <div>
                          <div class="flex items-center gap-1.5 text-teal-400 font-bold text-[11px]">
                            <span class="material-symbols-outlined text-[15px]">analytics</span> Estat. Zonal
                          </div>
                          <p class="text-[9px] text-slate-300 leading-tight mt-0.5">Agrupamento por bairro/setor.</p>
                        </div>
                        <div class="pt-1.5 border-t border-white/5 flex flex-col gap-1 text-[9px] text-slate-300" onclick="event.stopPropagation()">
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-zonal-count" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Contagem por Zona</span>
                          </label>
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-zonal-area" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Soma de Áreas (m²)</span>
                          </label>
                        </div>
                      </div>

                      <!-- 9. Densidade Espacial -->
                      <div id="op-card-density" onclick="window.selectSpatialOp('density')" class="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer transition-all flex flex-col justify-between gap-1.5 select-none hover:border-cyan-400">
                        <div>
                          <div class="flex items-center gap-1.5 text-orange-400 font-bold text-[11px]">
                            <span class="material-symbols-outlined text-[15px]">local_fire_department</span> Densidade
                          </div>
                          <p class="text-[9px] text-slate-300 leading-tight mt-0.5">Concentração por km² / ha.</p>
                        </div>
                        <div class="pt-1.5 border-t border-white/5 flex flex-col gap-1 text-[9px] text-slate-300" onclick="event.stopPropagation()">
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-density-km2" checked onchange="window.updateSpatialQuerySummary()">
                            <span>Por km²</span>
                          </label>
                          <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
                            <input type="checkbox" id="op-sub-density-ha" onchange="window.updateSpatialQuerySummary()">
                            <span>Por Hectare (ha)</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <!-- Configuração de Distância / Tolerância (Buffer ou Confrontação) -->
                    <div id="spatial-dist-config-container" class="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
                      <div>
                        <label class="block text-[11px] font-bold text-slate-200">Tolerância / Raio de Distância</label>
                        <span class="text-[10px] text-slate-400" id="spatial-dist-label">Distância de influência em metros</span>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <input type="number" id="spatial-buffer-dist" value="1.0" min="0.1" max="10000" step="0.5" class="w-20 px-2.5 py-1.5 rounded-lg text-right font-mono text-xs text-cyan-400 font-bold outline-none" oninput="window.updateSpatialQuerySummary()">
                        <span class="text-xs text-slate-400 font-bold">m</span>
                      </div>
                    </div>

                    <!-- Resumo Automático da Pergunta -->
                    <div class="p-3 bg-cyan-950/40 border border-cyan-500/30 rounded-xl">
                      <div class="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">psychology</span> Pergunta da Análise
                      </div>
                      <p id="spatial-query-summary-text" class="text-xs text-slate-200 italic">
                        "Analisar onde as feições de Limite Loteamentos cruzam ou sobrepõem Imóveis orla MPF."
                      </p>
                    </div>
                  </div>

                  <!-- ETAPA 3: CONFIGURAR ANÁLISE -->
                  <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3 shadow-xl backdrop-blur-md">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-800">
                      <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">3</span>
                        <h3 class="text-sm font-bold text-white">Configurar Análise</h3>
                      </div>
                      <span class="text-[10px] text-slate-400">Métricas e parâmetros</span>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                      <label class="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 cursor-pointer text-xs">
                        <span class="text-slate-200 font-medium">Calcular área sobreposta</span>
                        <input type="checkbox" id="spatial-calc-area" checked class="rounded text-cyan-500 focus:ring-0">
                      </label>
                      <label class="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 cursor-pointer text-xs">
                        <span class="text-slate-200 font-medium">Calcular quantidade</span>
                        <input type="checkbox" id="spatial-calc-count" checked class="rounded text-cyan-500 focus:ring-0">
                      </label>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="block text-[10px] text-slate-400 mb-1">Precisão da Geometria</label>
                        <select id="spatial-precision" class="w-full px-2.5 py-1.5 rounded-lg text-xs">
                          <option value="auto">Automática (Recomendado)</option>
                          <option value="high">Alta Precisão (ST_MakeValid)</option>
                        </select>
                      </div>
                      <div>
                        <label class="block text-[10px] text-slate-400 mb-1">Sistema de Referência</label>
                        <select id="spatial-srid" class="w-full px-2.5 py-1.5 rounded-lg text-xs">
                          <option value="31985" selected>EPSG: 31985 – SIRGAS 2000 UTM 25S (Padrão)</option>
                          <option value="31984">EPSG: 31984 – SIRGAS 2000 UTM 24S</option>
                          <option value="4326">EPSG: 4326 – WGS 84 (Geográfico)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label class="block text-[10px] text-slate-400 mb-1">Nome da Análise</label>
                      <input type="text" id="spatial-rule-name" placeholder="Ex: Imóveis que avançaram limite de loteamento" class="w-full px-3 py-2 rounded-xl text-xs font-medium outline-none">
                    </div>

                    <div class="flex items-center justify-between pt-2">
                      <button type="button" onclick="window.closeSpatialRuleModal()" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all">
                        Cancelar
                      </button>
                      <button type="button" onclick="window.executeSpatialAnalysisFromModal()" class="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-extrabold shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all flex items-center gap-1.5 cursor-pointer">
                        <span class="material-symbols-outlined text-[16px]">play_arrow</span> Executar Análise
                      </button>
                    </div>
                  </div>
                </div>

                <!-- COLUNA DIREITA: ETAPA 4 - RESULTADOS & DASHBOARD (ESTENDIDO ATÉ O FINAL) -->
                <div class="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-xl backdrop-blur-md">
                  <div class="flex flex-col gap-4 flex-1">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-800">
                      <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">4</span>
                        <h3 class="text-sm font-bold text-white">Resultados da Análise</h3>
                      </div>
                      <span class="text-[10px] text-slate-400">Dashboard Interativo</span>
                    </div>

                    <!-- Cards KPI de Resultado Proporcionais e sem Estouro de Texto -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div class="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col justify-center min-w-0">
                        <span class="text-[9px] uppercase font-bold text-slate-400 truncate block">Total Alvo</span>
                        <span id="kpi-total-target" class="text-base sm:text-lg font-extrabold text-white font-mono mt-0.5">--</span>
                      </div>
                      <div class="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col justify-center min-w-0">
                        <span class="text-[9px] uppercase font-bold text-cyan-400 truncate block">Relacionadas</span>
                        <span id="kpi-matching" class="text-base sm:text-lg font-extrabold text-cyan-400 font-mono mt-0.5">--</span>
                      </div>
                      <div class="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col justify-center min-w-0">
                        <span class="text-[9px] uppercase font-bold text-emerald-400 truncate block">Área Regular</span>
                        <span id="kpi-area" class="text-base sm:text-lg font-extrabold text-emerald-400 font-mono mt-0.5">--</span>
                      </div>
                      <div class="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col justify-center min-w-0">
                        <span class="text-[9px] uppercase font-bold text-rose-400 truncate block">Área Avanço</span>
                        <span id="kpi-percent" class="text-base sm:text-lg font-extrabold text-rose-400 font-mono mt-0.5">--</span>
                      </div>
                    </div>

                    <!-- Abas de Navegação de Resultados -->
                    <div class="flex items-center gap-1 border-b border-slate-800 text-xs">
                      <button type="button" onclick="window.switchResultTab('resumo')" id="tab-btn-resumo" class="px-3 py-1.5 font-bold border-b-2 border-cyan-500 text-cyan-400">Resumo</button>
                      <button type="button" onclick="window.switchResultTab('tabela')" id="tab-btn-tabela" class="px-3 py-1.5 font-medium text-slate-400 hover:text-white">Tabela</button>
                      <button type="button" onclick="window.switchResultTab('grafico')" id="tab-btn-grafico" class="px-3 py-1.5 font-medium text-slate-400 hover:text-white">Gráfico</button>
                      <button type="button" onclick="window.switchResultTab('mapa')" id="tab-btn-mapa" class="px-3 py-1.5 font-medium text-slate-400 hover:text-white">Mapa</button>
                      <button type="button" onclick="window.switchResultTab('exportar')" id="tab-btn-exportar" class="px-3 py-1.5 font-medium text-slate-400 hover:text-white">Exportar</button>
                    </div>

                    <!-- Conteúdos das Abas -->
                    <div class="flex-1 flex flex-col justify-center min-h-[240px]">
                      <!-- Aba 1: Resumo Detalhado com Pergunta em Linguagem Humana -->
                      <div id="result-tab-resumo" class="text-xs space-y-3 flex-1 flex flex-col justify-between">
                        <div class="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2.5">
                          <div class="flex justify-between items-center text-slate-400 pb-1.5 border-b border-white/5">
                            <span>Operação Executada:</span> 
                            <span class="px-2.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-400 font-extrabold text-[11px] uppercase tracking-wider" id="resumo-op-name">--</span>
                          </div>

                          <div class="p-2.5 bg-slate-900/80 rounded-lg border border-cyan-500/20 space-y-1">
                            <div class="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                              <span class="material-symbols-outlined text-[13px]">psychology</span> Pergunta Respondida:
                            </div>
                            <div id="resumo-query-human-text" class="text-xs text-slate-200 leading-relaxed">
                              --
                            </div>
                          </div>

                          <div class="grid grid-cols-2 gap-2 text-[11px] pt-1">
                            <div class="text-slate-400">Camada Alvo: <strong class="text-white block" id="resumo-target-name">--</strong></div>
                            <div class="text-slate-400">Referência Cruzada: <strong class="text-purple-400 block" id="resumo-ref-name">--</strong></div>
                          </div>

                          <div id="resumo-areas-breakdown" class="hidden p-2.5 bg-slate-900/60 rounded-lg border border-white/5 space-y-1 text-[11px]">
                            <div class="flex justify-between text-slate-400"><span>Área Total Analisada:</span> <strong class="text-white font-mono" id="resumo-area-total">--</strong></div>
                            <div class="flex justify-between text-cyan-400"><span>Área Regular (Dentro do Limite):</span> <strong class="font-mono" id="resumo-area-regular">--</strong></div>
                            <div class="flex justify-between text-rose-400"><span>Área de Avanço (Além da Linha):</span> <strong class="font-mono" id="resumo-area-advanced">--</strong></div>
                          </div>

                          <div class="flex justify-between text-[10px] text-slate-500 pt-1">
                            <span>Data da Consulta:</span> <span class="font-mono text-slate-400" id="resumo-datetime">--</span>
                          </div>
                        </div>

                        <div class="flex justify-end gap-2 pt-2 mt-auto">
                          <button type="button" onclick="window.saveCurrentSpatialRule()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-xl text-xs font-bold border border-cyan-500/30 flex items-center gap-1.5 shadow-md cursor-pointer transition-all">
                            <span class="material-symbols-outlined text-[16px]">save</span> Salvar Análise
                          </button>
                        </div>
                      </div>

                      <!-- Aba 2: Tabela com Gerenciador de Colunas Customizáveis e Checkboxes Individuais por Coluna -->
                      <div id="result-tab-tabela" class="hidden flex flex-col gap-2.5 max-h-72">
                        <!-- Barra de Ferramentas de Inserção de Colunas -->
                        <div class="flex items-center gap-2 p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                          <select id="spatial-table-col-selector" class="flex-1 px-2.5 py-1.5 rounded-lg text-xs outline-none bg-slate-900 border border-slate-700 text-white">
                            <option value="">Selecione um campo para adicionar...</option>
                          </select>
                          <button type="button" onclick="window.insertSpatialTableColumn()" class="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1 shadow transition-all cursor-pointer">
                            <span class="material-symbols-outlined text-[15px]">add</span> Inserir Coluna
                          </button>
                        </div>

                        <!-- Barra de Checkboxes para Exibir/Ocultar Colunas -->
                        <div id="spatial-column-checkboxes-bar" class="flex items-center gap-2.5 p-2 bg-slate-900/70 rounded-xl border border-slate-800/80 flex-wrap text-[11px]">
                          <span class="text-slate-400 font-bold uppercase text-[10px] mr-1 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[13px] text-cyan-400">view_column</span> Colunas:
                          </span>
                          <label class="flex items-center gap-1 text-slate-200 cursor-pointer select-none">
                            <input type="checkbox" id="col-chk-feicao" checked onchange="window.toggleSpatialTableColumn('feicao')">
                            <span>Feição</span>
                          </label>
                          <label class="flex items-center gap-1 text-cyan-400 cursor-pointer select-none font-semibold">
                            <input type="checkbox" id="col-chk-regular" checked onchange="window.toggleSpatialTableColumn('regular')">
                            <span>Área Regular</span>
                          </label>
                          <label class="flex items-center gap-1 text-rose-400 cursor-pointer select-none font-semibold">
                            <input type="checkbox" id="col-chk-avanco" checked onchange="window.toggleSpatialTableColumn('avanco')">
                            <span>Área Avanço</span>
                          </label>
                          <label class="flex items-center gap-1 text-slate-300 cursor-pointer select-none">
                            <input type="checkbox" id="col-chk-status" checked onchange="window.toggleSpatialTableColumn('status')">
                            <span>Status</span>
                          </label>
                          <div id="spatial-custom-cols-chk-container" class="flex items-center gap-2 flex-wrap"></div>
                        </div>

                        <!-- Tabela de Dados -->
                        <div class="overflow-x-auto border border-slate-800 rounded-xl">
                          <table class="w-full text-left text-[11px] text-slate-300">
                            <thead class="bg-slate-950 text-slate-400 uppercase text-[9px]" id="result-table-thead">
                              <tr id="result-table-header">
                                <th class="p-2">#</th>
                                <th class="p-2 col-feicao">Feição</th>
                                <th class="p-2 text-cyan-400 col-regular">Área Regular (m²)</th>
                                <th class="p-2 text-rose-400 col-avanco">Área Avanço (m²)</th>
                                <th class="p-2 col-status">Status</th>
                              </tr>
                            </thead>
                            <tbody id="result-table-body" class="divide-y divide-slate-800">
                              <tr><td colspan="5" class="p-4 text-center text-slate-500 italic">Execute a análise para visualizar os registros.</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <!-- Aba 3: Gráfico com Alternância de Métricas de Áreas e Contagem -->
                      <div id="result-tab-grafico" class="hidden flex flex-col gap-2 h-64">
                        <div class="flex items-center justify-between px-1">
                          <span class="text-[11px] font-bold text-slate-400 uppercase">Relação Visual da Pesquisa</span>
                          <div class="flex items-center gap-1.5 text-[10px]">
                            <button type="button" id="chart-mode-area-btn" onclick="window.switchChartMode('area')" class="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold">Áreas (m²)</button>
                            <button type="button" id="chart-mode-count-btn" onclick="window.switchChartMode('count')" class="px-2 py-0.5 rounded-md bg-slate-950 text-slate-400 border border-slate-800 hover:text-white font-medium">Contagem</button>
                            <button type="button" id="chart-mode-top-btn" onclick="window.switchChartMode('top')" class="px-2 py-0.5 rounded-md bg-slate-950 text-slate-400 border border-slate-800 hover:text-white font-medium">Top Avanços</button>
                          </div>
                        </div>
                        <div class="flex-1 relative">
                          <canvas id="spatial-chart-canvas"></canvas>
                        </div>
                      </div>

                      <!-- Aba 4: Mapa -->
                      <div id="result-tab-mapa" class="hidden h-60 rounded-xl overflow-hidden border border-slate-800 relative">
                        <div id="spatial-result-interactive-map" class="w-full h-full"></div>
                        <div class="absolute bottom-2 left-2 z-[400] flex items-center gap-2.5 text-[10px] bg-slate-950/90 px-2.5 py-1.5 rounded-lg border border-slate-700 backdrop-blur-md shadow-lg">
                          <span class="flex items-center gap-1 text-cyan-400 font-bold"><span class="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> Área Regular</span>
                          <span class="flex items-center gap-1 text-rose-400 font-bold"><span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Área de Avanço</span>
                          <span class="flex items-center gap-1 text-purple-400 font-bold"><span class="w-2.5 h-2.5 rounded-full bg-purple-400"></span> Linha de Limite</span>
                        </div>
                      </div>

                      <!-- Aba 5: Exportar -->
                      <div id="result-tab-exportar" class="hidden grid grid-cols-2 gap-3 py-2">
                        <button type="button" onclick="window.exportSpatialData('csv')" class="p-3.5 rounded-xl bg-slate-950/80 hover:bg-emerald-500/15 border border-slate-800 hover:border-emerald-500 flex flex-col items-center gap-1 text-center transition-all cursor-pointer">
                          <span class="material-symbols-outlined text-emerald-400 text-[24px]">table_view</span>
                          <span class="text-xs font-bold text-white">CSV</span>
                          <span class="text-[10px] text-slate-400">Arquivo tabular</span>
                        </button>

                        <button type="button" onclick="window.exportSpatialData('geojson')" class="p-3.5 rounded-xl bg-slate-950/80 hover:bg-purple-500/15 border border-slate-800 hover:border-purple-500 flex flex-col items-center gap-1 text-center transition-all cursor-pointer">
                          <span class="material-symbols-outlined text-purple-400 text-[24px]">public</span>
                          <span class="text-xs font-bold text-white">GeoJSON</span>
                          <span class="text-[10px] text-slate-400">Dados espaciais</span>
                        </button>

                        <button type="button" onclick="window.exportSpatialData('pdf')" class="p-3.5 rounded-xl bg-slate-950/80 hover:bg-red-500/15 border border-slate-800 hover:border-red-500 flex flex-col items-center gap-1 text-center transition-all cursor-pointer">
                          <span class="material-symbols-outlined text-red-400 text-[24px]">picture_as_pdf</span>
                          <span class="text-xs font-bold text-white">PDF</span>
                          <span class="text-[10px] text-slate-400">Relatório técnico</span>
                        </button>

                        <button type="button" onclick="window.exportSpatialData('docx')" class="p-3.5 rounded-xl bg-slate-950/80 hover:bg-blue-500/15 border border-slate-800 hover:border-blue-500 flex flex-col items-center gap-1 text-center transition-all cursor-pointer">
                          <span class="material-symbols-outlined text-blue-400 text-[24px]">description</span>
                          <span class="text-xs font-bold text-white">Word / Docs</span>
                          <span class="text-[10px] text-slate-400">Documento .docx</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Rodapé Inferior com Benefícios e Garantias -->
              <div class="mt-5 pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center text-slate-400 text-[11px] shrink-0">
                <div class="flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-cyan-400 text-[16px]">touch_app</span> <span>Simples e Intuitivo</span></div>
                <div class="flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-amber-400 text-[16px]">tune</span> <span>Poderoso e Flexível</span></div>
                <div class="flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-emerald-400 text-[16px]">analytics</span> <span>Resultados Completos</span></div>
                <div class="flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-purple-400 text-[16px]">file_download</span> <span>Exportação Total</span></div>
                <div class="flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-blue-400 text-[16px]">security</span> <span>Seguro e Confiável</span></div>
              </div>
            `;
            document.body.appendChild(modal);
        }
    }

    window.spatialAnalyticsEngine = new SpatialAnalyticsManager();

    // ==========================================
    // FUNÇÕES GLOBAIS DE CONTROLE DO PAINEL
    // ==========================================
    window.currentSelectedOp = 'intersects';

    window.selectSpatialOp = function(op) {
        window.currentSelectedOp = op;
        const allOps = ['intersects', 'touches', 'buffer', 'within', 'disjoint', 'length_clip', 'nearest', 'zonal_stats', 'density'];
        allOps.forEach(o => {
            const card = document.getElementById(`op-card-${o}`);
            if (card) {
                if (o === op) {
                    card.className = 'p-2.5 rounded-xl border border-cyan-500 bg-cyan-500/15 cursor-pointer transition-all flex flex-col gap-1 select-none hover:border-cyan-400';
                } else {
                    card.className = 'p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer transition-all flex flex-col gap-1 select-none hover:border-cyan-400';
                }
            }
        });

        const distContainer = document.getElementById('spatial-dist-config-container');
        const distLabel = document.getElementById('spatial-dist-label');
        if (distContainer && distLabel) {
            if (op === 'buffer') {
                distContainer.classList.remove('hidden');
                distLabel.textContent = 'Raio de proximidade em metros';
            } else if (op === 'touches') {
                distContainer.classList.remove('hidden');
                distLabel.textContent = 'Tolerância de contato com a frente/limite';
            } else {
                distContainer.classList.add('hidden');
            }
        }

        window.updateSpatialQuerySummary();
    };

    window.generateHumanQueryText = function() {
        const targetSel = document.getElementById('spatial-target-layer');
        const refSel = document.getElementById('spatial-ref-layer');
        const targetAttrField = document.getElementById('spatial-target-attr-field');
        const targetAttrVal = document.getElementById('spatial-target-attr-val');
        const refAttrField = document.getElementById('spatial-ref-attr-field');
        const refAttrVal = document.getElementById('spatial-ref-attr-val');
        if (!targetSel || !refSel) return '';

        const targetName = targetSel.options[targetSel.selectedIndex]?.text || 'Camada Alvo';
        const refName = refSel.options[refSel.selectedIndex]?.text || 'Camada de Referência';
        
        let targetDesc = `<strong>${targetName}</strong>`;
        if (targetAttrField && targetAttrField.value && targetAttrVal && targetAttrVal.value) {
            const fieldLabel = targetAttrField.options[targetAttrField.selectedIndex]?.text || targetAttrField.value;
            targetDesc += ` (onde <strong>${fieldLabel}</strong> = <strong>"${targetAttrVal.value}"</strong>)`;
        }

        let refDesc = `<strong>${refName}</strong>`;
        if (refAttrField && refAttrField.value && refAttrVal && refAttrVal.value) {
            const fieldLabel = refAttrField.options[refAttrField.selectedIndex]?.text || refAttrField.value;
            refDesc += ` (onde <strong>${fieldLabel}</strong> = <strong>"${refAttrVal.value}"</strong>)`;
        }

        let opText = 'cruzam ou sobrepõem';
        if (window.currentSelectedOp === 'touches') opText = 'fazem face ou confrontam com';
        else if (window.currentSelectedOp === 'buffer') {
            const d = document.getElementById('spatial-buffer-dist')?.value || '30';
            opText = `estão a menos de ${d}m de`;
        } else if (window.currentSelectedOp === 'within') opText = 'estão totalmente contidos dentro de';
        else if (window.currentSelectedOp === 'disjoint') opText = 'não possuem qualquer contato ou cruzamento com';
        else if (window.currentSelectedOp === 'length_clip') opText = 'têm sua extensão linear e metragem calculada dentro de';
        else if (window.currentSelectedOp === 'nearest') opText = 'têm calculada a distância até o elemento mais próximo de';
        else if (window.currentSelectedOp === 'zonal_stats') opText = 'são agrupados e sumarizados espacialmente pelas zonas de';
        else if (window.currentSelectedOp === 'density') opText = 'têm a sua densidade de concentração calculada por zona de';

        return `Encontrar todos os elementos de ${targetDesc} que ${opText} ${refDesc}.`;
    };

    window.updateSpatialQuerySummary = function() {
        const summaryEl = document.getElementById('spatial-query-summary-text');
        if (summaryEl) {
            summaryEl.innerHTML = `"${window.generateHumanQueryText()}"`;
        }
    };

    window.activeSpatialTableColumns = [];

    window.populateSpatialTableColSelector = function() {
        const colSel = document.getElementById('spatial-table-col-selector');
        const targetSel = document.getElementById('spatial-target-layer');
        if (!colSel || !targetSel) return;

        const themeId = targetSel.value;
        const formFields = window.spatialAnalyticsEngine.getThemeFormFields(themeId);

        let html = '<option value="">+ Selecionar campo para adicionar à tabela...</option>';
        if (formFields && formFields.length > 0) {
            formFields.forEach(fld => {
                if (!window.activeSpatialTableColumns.find(c => c.id === fld.id)) {
                    const groupPrefix = fld.tabTitle ? `[${fld.tabTitle}] ` : '';
                    html += `<option value="${fld.id}" data-label="${groupPrefix}${fld.label}">${groupPrefix}${fld.label}</option>`;
                }
            });
        }
        colSel.innerHTML = html;
    };

    window.insertSpatialTableColumn = function() {
        const colSel = document.getElementById('spatial-table-col-selector');
        if (!colSel || !colSel.value) return;

        const colId = colSel.value;
        const colLabel = colSel.options[colSel.selectedIndex]?.getAttribute('data-label') || colSel.options[colSel.selectedIndex]?.text || colId;

        if (!window.activeSpatialTableColumns.find(c => c.id === colId)) {
            window.activeSpatialTableColumns.push({ id: colId, label: colLabel });
        }

        window.renderActiveTableTags();
        window.populateSpatialTableColSelector();
        if (window.spatialAnalyticsEngine.lastAnalysisResult) {
            window.renderSpatialTable(window.spatialAnalyticsEngine.lastAnalysisResult);
        }
    };

    window.spatialColumnVisibility = {
        feicao: true,
        regular: true,
        avanco: true,
        status: true
    };

    window.toggleSpatialTableColumn = function(colKey) {
        const chk = document.getElementById(`col-chk-${colKey}`);
        if (chk) {
            window.spatialColumnVisibility[colKey] = chk.checked;
        } else {
            window.spatialColumnVisibility[colKey] = !window.spatialColumnVisibility[colKey];
        }
        if (window.spatialAnalyticsEngine.lastAnalysisResult) {
            window.renderSpatialTable(window.spatialAnalyticsEngine.lastAnalysisResult);
        }
    };

    window.removeSpatialTableColumn = function(colId) {
        window.activeSpatialTableColumns = window.activeSpatialTableColumns.filter(c => c.id !== colId);
        delete window.spatialColumnVisibility[colId];
        window.renderCustomColumnCheckboxes();
        window.populateSpatialTableColSelector();
        if (window.spatialAnalyticsEngine.lastAnalysisResult) {
            window.renderSpatialTable(window.spatialAnalyticsEngine.lastAnalysisResult);
        }
    };

    window.renderCustomColumnCheckboxes = function() {
        const container = document.getElementById('spatial-custom-cols-chk-container');
        if (!container) return;

        let html = '';
        window.activeSpatialTableColumns.forEach(col => {
            if (window.spatialColumnVisibility[col.id] === undefined) {
                window.spatialColumnVisibility[col.id] = true;
            }
            const isChecked = window.spatialColumnVisibility[col.id] !== false;
            html += `
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                    <label class="flex items-center gap-1 cursor-pointer select-none">
                        <input type="checkbox" id="col-chk-${col.id}" ${isChecked ? 'checked' : ''} onchange="window.toggleSpatialTableColumn('${col.id}')">
                        <span>${col.label}</span>
                    </label>
                    <button type="button" onclick="window.removeSpatialTableColumn('${col.id}')" title="Excluir Coluna" class="text-cyan-400 hover:text-white font-bold cursor-pointer text-xs ml-0.5">×</button>
                </span>
            `;
        });
        container.innerHTML = html;
    };

    window.insertSpatialTableColumn = function() {
        const colSel = document.getElementById('spatial-table-col-selector');
        if (!colSel || !colSel.value) return;

        const colId = colSel.value;
        const colLabel = colSel.options[colSel.selectedIndex]?.getAttribute('data-label') || colSel.options[colSel.selectedIndex]?.text || colId;

        if (!window.activeSpatialTableColumns.find(c => c.id === colId)) {
            window.activeSpatialTableColumns.push({ id: colId, label: colLabel });
            window.spatialColumnVisibility[colId] = true;
        }

        window.renderCustomColumnCheckboxes();
        window.populateSpatialTableColSelector();
        if (window.spatialAnalyticsEngine.lastAnalysisResult) {
            window.renderSpatialTable(window.spatialAnalyticsEngine.lastAnalysisResult);
        }
    };

    window.currentChartMode = 'area';

    window.switchChartMode = function(mode) {
        window.currentChartMode = mode;
        ['area', 'count', 'top'].forEach(m => {
            const btn = document.getElementById(`chart-mode-${m}-btn`);
            if (btn) {
                if (m === mode) {
                    btn.className = 'px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold';
                } else {
                    btn.className = 'px-2 py-0.5 rounded-md bg-slate-950 text-slate-400 border border-slate-800 hover:text-white font-medium';
                }
            }
        });

        if (window.spatialAnalyticsEngine.lastAnalysisResult) {
            window.renderSpatialChart(window.spatialAnalyticsEngine.lastAnalysisResult);
        }
    };

    window.renderSpatialTable = function(res) {
        const thead = document.getElementById('result-table-thead');
        const tbody = document.getElementById('result-table-body');
        if (!tbody || !res) return;

        const vis = window.spatialColumnVisibility || {};

        // Cabeçalho da tabela
        if (thead) {
            let headerHtml = `<tr id="result-table-header"><th class="p-2 w-10">#</th>`;

            if (vis.feicao !== false) headerHtml += `<th class="p-2 text-slate-200">Feição</th>`;

            window.activeSpatialTableColumns.forEach(col => {
                if (vis[col.id] !== false) {
                    headerHtml += `<th class="p-2 text-slate-300 font-semibold">${col.label}</th>`;
                }
            });

            if (vis.regular !== false) headerHtml += `<th class="p-2 text-cyan-400">Área Regular (m²)</th>`;
            if (vis.avanco !== false) headerHtml += `<th class="p-2 text-rose-400">Área Avanço (m²)</th>`;
            if (vis.status !== false) headerHtml += `<th class="p-2 text-slate-300">Status</th>`;

            headerHtml += `</tr>`;
            thead.innerHTML = headerHtml;
        }

        // Linhas da tabela
        let rowsHtml = '';
        res.matchingFeatures.slice(0, 100).forEach((f, idx) => {
            const label = (f.properties && (f.properties.nome || f.properties.Lote || f.properties.id || f.properties.name)) || `Feição #${idx+1}`;
            let statusText = 'Cruzamento Detectado';
            if (res.rule.opType === 'length_clip') {
                statusText = f._extraAnalysisData?.linearLength ? `${f._extraAnalysisData.linearLength.toFixed(1)} m internos` : 'Cruzamento Linear';
            } else if (res.rule.opType === 'nearest') {
                statusText = f._extraAnalysisData?.nearestDistMeters ? `${f._extraAnalysisData.nearestDistMeters.toFixed(1)}m de ${f._extraAnalysisData.closestRefName}` : 'Mais Próximo';
            } else if (res.rule.opType === 'disjoint') {
                statusText = 'Isolado / Sem Contato';
            } else if (res.rule.opType === 'within') {
                statusText = 'Totalmente Contido';
            }

            const regAreaStr = f._extraAnalysisData?.areaRegular ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(f._extraAnalysisData.areaRegular) : '--';
            const advAreaStr = f._extraAnalysisData?.areaAvancada ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(f._extraAnalysisData.areaAvancada) : '0';

            rowsHtml += `
                <tr class="hover:bg-slate-800/40">
                    <td class="p-2 font-mono text-slate-500 w-10">${idx+1}</td>
            `;

            if (vis.feicao !== false) rowsHtml += `<td class="p-2 font-bold text-white">${label}</td>`;

            window.activeSpatialTableColumns.forEach(col => {
                if (vis[col.id] !== false) {
                    let cellVal = f.properties ? f.properties[col.id] : '';
                    if (cellVal === undefined || cellVal === null) cellVal = '--';
                    rowsHtml += `<td class="p-2 text-slate-300 font-mono">${cellVal}</td>`;
                }
            });

            if (vis.regular !== false) rowsHtml += `<td class="p-2 text-cyan-400 font-mono font-bold">${regAreaStr}</td>`;
            if (vis.avanco !== false) rowsHtml += `<td class="p-2 text-rose-400 font-mono font-bold">${advAreaStr}</td>`;
            if (vis.status !== false) rowsHtml += `<td class="p-2 text-slate-300 font-semibold">${statusText}</td>`;

            rowsHtml += `</tr>`;
        });

        tbody.innerHTML = rowsHtml || `<tr><td colspan="6" class="p-4 text-center text-slate-500 italic">Nenhum cruzamento encontrado.</td></tr>`;
    };

    window.populateSpatialLayerSelects = function() {
        const targetSel = document.getElementById('spatial-target-layer');
        const refSel = document.getElementById('spatial-ref-layer');
        if (!targetSel || !refSel) return;

        let optionsHtml = '';
        let themesList = window.themes || (typeof themes !== 'undefined' ? themes : []) || [];

        if (!themesList || themesList.length === 0) {
            const localThemes = localStorage.getItem('constructive_themes');
            if (localThemes) {
                try { themesList = JSON.parse(localThemes); } catch(e) {}
            }
        }

        if (themesList && themesList.length > 0) {
            themesList.forEach(t => {
                const name = t.name || t.nome || 'Camada';
                const geomType = t.geometryType || t.tipo_geometria || '';
                const geomStr = geomType ? ` [${geomType}]` : '';
                optionsHtml += `<option value="${t.id}" data-name="${name}">${name}${geomStr}</option>`;
            });
        } else {
            optionsHtml = `
                <option value="imoveis" data-name="Imóveis Cadastrados">Imóveis Cadastrados [Polygon]</option>
                <option value="logradouros" data-name="Logradouros">Logradouros [LineString]</option>
                <option value="loteamentos" data-name="Limite Loteamentos">Limite Loteamentos [Polygon]</option>
            `;
        }

        targetSel.innerHTML = optionsHtml;
        refSel.innerHTML = optionsHtml;
        if (refSel.options.length > 1) refSel.selectedIndex = 1;

        window.onSpatialLayerChange('target');
        window.onSpatialLayerChange('ref');
    };

    window.onSpatialLayerChange = async function(type) {
        const layerSel = document.getElementById(type === 'target' ? 'spatial-target-layer' : 'spatial-ref-layer');
        const attrFieldSel = document.getElementById(type === 'target' ? 'spatial-target-attr-field' : 'spatial-ref-attr-field');
        const attrValSel = document.getElementById(type === 'target' ? 'spatial-target-attr-val' : 'spatial-ref-attr-val');
        if (!layerSel || !attrFieldSel || !attrValSel) return;

        const themeId = layerSel.value;
        const formFields = window.spatialAnalyticsEngine.getThemeFormFields(themeId);

        let fieldsHtml = '<option value="">Todos os campos</option>';
        if (formFields && formFields.length > 0) {
            formFields.forEach(fld => {
                const groupPrefix = fld.tabTitle ? `[${fld.tabTitle}] ` : '';
                fieldsHtml += `<option value="${fld.id}">${groupPrefix}${fld.label}</option>`;
            });
        }
        attrFieldSel.innerHTML = fieldsHtml;
        attrValSel.innerHTML = '<option value="">Todos os valores</option>';

        if (type === 'target') {
            window.populateSpatialTableColSelector();
        }

        window.updateSpatialPreviewMap();
        window.updateSpatialQuerySummary();
    };

    window.onSpatialAttrFieldChange = async function(type) {
        const layerSel = document.getElementById(type === 'target' ? 'spatial-target-layer' : 'spatial-ref-layer');
        const attrFieldSel = document.getElementById(type === 'target' ? 'spatial-target-attr-field' : 'spatial-ref-attr-field');
        const attrValSel = document.getElementById(type === 'target' ? 'spatial-target-attr-val' : 'spatial-ref-attr-val');
        if (!layerSel || !attrFieldSel || !attrValSel) return;

        const fieldId = attrFieldSel.value;
        if (!fieldId) {
            attrValSel.innerHTML = '<option value="">Todos os valores</option>';
            window.updateSpatialQuerySummary();
            return;
        }

        const themeId = layerSel.value;
        const formFields = window.spatialAnalyticsEngine.getThemeFormFields(themeId);
        const targetField = formFields.find(f => f.id === fieldId || f.label === fieldId);

        const features = await window.spatialAnalyticsEngine.getFeaturesForTheme(themeId);
        const valsSet = new Set();

        features.forEach(f => {
            if (f.properties) {
                let v = f.properties[fieldId];
                if (v === undefined || v === null || v === '') {
                    for (const [k, val] of Object.entries(f.properties)) {
                        if (k.toLowerCase() === fieldId.toLowerCase() || (targetField && k.toLowerCase() === targetField.label.toLowerCase())) {
                            v = val;
                            break;
                        }
                    }
                }
                if (v !== undefined && v !== null && String(v).trim() !== '' && typeof v !== 'object') {
                    valsSet.add(String(v).trim());
                }
            }
        });

        if (targetField && targetField.options && Array.isArray(targetField.options)) {
            targetField.options.forEach(opt => {
                const optVal = typeof opt === 'object' ? (opt.value || opt.label) : opt;
                if (optVal && String(optVal).trim() !== '') valsSet.add(String(optVal).trim());
            });
        }

        let valHtml = '<option value="">Todos os valores</option>';
        Array.from(valsSet).sort().forEach(val => {
            valHtml += `<option value="${val}">${val}</option>`;
        });
        attrValSel.innerHTML = valHtml;
        window.updateSpatialPreviewMap();
        window.updateSpatialQuerySummary();
    };

    window.updateSpatialPreviewMap = async function() {
        const targetSel = document.getElementById('spatial-target-layer');
        const refSel = document.getElementById('spatial-ref-layer');
        const targetAttrField = document.getElementById('spatial-target-attr-field');
        const targetAttrVal = document.getElementById('spatial-target-attr-val');
        const refAttrField = document.getElementById('spatial-ref-attr-field');
        const refAttrVal = document.getElementById('spatial-ref-attr-val');
        const container = document.getElementById('spatial-preview-map');
        if (!container || !targetSel || !refSel) return;

        if (!window.spatialPreviewLeaflet) {
            window.spatialPreviewLeaflet = L.map('spatial-preview-map', {
                zoomControl: false,
                attributionControl: false
            }).setView([-7.035, -34.835], 13);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                maxNativeZoom: 19,
                className: 'dark-tiles-layer'
            }).addTo(window.spatialPreviewLeaflet);

            window.spatialPreviewRefGroup = L.featureGroup().addTo(window.spatialPreviewLeaflet);
            window.spatialPreviewTargetGroup = L.featureGroup().addTo(window.spatialPreviewLeaflet);
        }

        window.spatialPreviewTargetGroup.clearLayers();
        window.spatialPreviewRefGroup.clearLayers();

        let rawTargetFeats = await window.spatialAnalyticsEngine.getFeaturesForTheme(targetSel.value);
        let rawRefFeats = await window.spatialAnalyticsEngine.getFeaturesForTheme(refSel.value);

        const targetFeats = window.spatialAnalyticsEngine.applyFeatureFilter(rawTargetFeats, targetAttrField?.value, targetAttrVal?.value);
        const refFeats = window.spatialAnalyticsEngine.applyFeatureFilter(rawRefFeats, refAttrField?.value, refAttrVal?.value);

        // Renderiza Camada de Referência (em Roxo/Magenta)
        if (refFeats.length > 0) {
            L.geoJSON(refFeats, {
                style: (feature) => ({
                    color: '#a855f7',
                    weight: feature.geometry && feature.geometry.type.includes('Line') ? 4 : 2,
                    fillColor: '#a855f7',
                    fillOpacity: 0.35,
                    dashArray: ''
                }),
                pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
                    radius: 6,
                    fillColor: '#a855f7',
                    color: '#ffffff',
                    weight: 1.5,
                    fillOpacity: 0.9
                })
            }).addTo(window.spatialPreviewRefGroup);
        }

        // Renderiza Camada Alvo (em Ciano)
        if (targetFeats.length > 0) {
            L.geoJSON(targetFeats, {
                style: (feature) => ({
                    color: '#06b6d4',
                    weight: feature.geometry && feature.geometry.type.includes('Line') ? 3.5 : 2,
                    fillColor: '#06b6d4',
                    fillOpacity: 0.45,
                    dashArray: ''
                }),
                pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
                    radius: 7,
                    fillColor: '#06b6d4',
                    color: '#ffffff',
                    weight: 2,
                    fillOpacity: 0.95
                })
            }).addTo(window.spatialPreviewTargetGroup);
        }

        try {
            const allBounds = L.latLngBounds([]);
            if (window.spatialPreviewTargetGroup.getLayers().length > 0) allBounds.extend(window.spatialPreviewTargetGroup.getBounds());
            if (window.spatialPreviewRefGroup.getLayers().length > 0) allBounds.extend(window.spatialPreviewRefGroup.getBounds());
            if (allBounds.isValid()) {
                window.spatialPreviewLeaflet.fitBounds(allBounds, { padding: [20, 20], maxZoom: 18 });
            }
        } catch(e) {}
    };

    window.openSpatialRuleModal = async function(ruleId = null) {
        window.currentEditingSpatialRuleId = ruleId || null;
        if (window.spatialAnalyticsEngine && typeof window.spatialAnalyticsEngine.ensureSpatialRuleModalDOM === 'function') {
            window.spatialAnalyticsEngine.ensureSpatialRuleModalDOM();
        }
        window.populateSpatialLayerSelects();
        
        const modal = document.getElementById('spatial-rule-modal');
        const idInput = document.getElementById('spatial-rule-id');
        const nameInput = document.getElementById('spatial-rule-name');
        const targetSel = document.getElementById('spatial-target-layer');
        const refSel = document.getElementById('spatial-ref-layer');
        const targetAttrField = document.getElementById('spatial-target-attr-field');
        const targetAttrVal = document.getElementById('spatial-target-attr-val');
        const refAttrField = document.getElementById('spatial-ref-attr-field');
        const refAttrVal = document.getElementById('spatial-ref-attr-val');
        const distInput = document.getElementById('spatial-buffer-dist');
        const calcAreaInput = document.getElementById('spatial-calc-area');

        const rulesList = (window.spatialAnalyticsEngine && window.spatialAnalyticsEngine.rules) || [];

        if (ruleId) {
            const rule = rulesList.find(r => r.id === ruleId);
            if (rule) {
                if (idInput) idInput.value = rule.id;
                if (nameInput) nameInput.value = rule.name || '';
                if (targetSel) {
                    targetSel.value = rule.targetLayer || '';
                    await window.onSpatialLayerChange('target');
                }
                if (targetAttrField) {
                    targetAttrField.value = rule.targetAttrField || '';
                    await window.onSpatialAttrFieldChange('target');
                }
                if (targetAttrVal) targetAttrVal.value = rule.targetAttrValue || '';

                if (refSel) {
                    refSel.value = rule.refLayer || '';
                    await window.onSpatialLayerChange('ref');
                }
                if (refAttrField) {
                    refAttrField.value = rule.refAttrField || '';
                    await window.onSpatialAttrFieldChange('ref');
                }
                if (refAttrVal) refAttrVal.value = rule.refAttrValue || '';

                if (distInput) distInput.value = rule.bufferDist || 1.0;
                if (calcAreaInput) calcAreaInput.checked = (rule.calcArea !== false);
                window.selectSpatialOp(rule.opType || 'intersects');

                if (modal) modal.classList.remove('hidden');

                setTimeout(async () => {
                    if (window.spatialPreviewLeaflet) window.spatialPreviewLeaflet.invalidateSize();
                    window.updateSpatialPreviewMap();
                    window.updateSpatialQuerySummary();
                    window.populateSpatialTableColSelector();

                    // Executa a análise automaticamente ao abrir a edição
                    await window.executeSpatialAnalysisFromModal();
                }, 150);
                return;
            }
        }

        // Nova Análise Limpa
        window.currentEditingSpatialRuleId = null;
        if (idInput) idInput.value = '';
        if (nameInput) nameInput.value = '';
        if (targetAttrField) targetAttrField.value = '';
        if (targetAttrVal) targetAttrVal.value = '';
        if (refAttrField) refAttrField.value = '';
        if (refAttrVal) refAttrVal.value = '';
        if (distInput) distInput.value = 1.0;
        if (calcAreaInput) calcAreaInput.checked = true;
        window.selectSpatialOp('intersects');
        window.setSpatialStep(1);

        if (modal) modal.classList.remove('hidden');
        setTimeout(() => {
            if (window.spatialPreviewLeaflet) window.spatialPreviewLeaflet.invalidateSize();
            window.updateSpatialPreviewMap();
            window.updateSpatialQuerySummary();
            window.populateSpatialTableColSelector();
        }, 150);
    };

    window.closeSpatialRuleModal = function() {
        const modal = document.getElementById('spatial-rule-modal');
        if (modal) modal.classList.add('hidden');
    };

    window.setSpatialStep = function(step) {
        ['1', '2', '3', '4'].forEach(s => {
            const btn = document.getElementById(`step-btn-${s}`);
            if (btn) {
                if (s == step) {
                    btn.className = 'flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all border-cyan-500 bg-cyan-500/15 text-cyan-300';
                } else {
                    btn.className = 'flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/5 text-slate-400 text-xs font-bold cursor-pointer transition-all hover:bg-slate-800/50';
                }
            }
        });
    };

    window.switchResultTab = function(tabName) {
        ['resumo', 'tabela', 'grafico', 'mapa', 'exportar'].forEach(t => {
            const btn = document.getElementById(`tab-btn-${t}`);
            const content = document.getElementById(`result-tab-${t}`);
            if (btn && content) {
                if (t === tabName) {
                    btn.className = 'px-3 py-1.5 font-bold border-b-2 border-cyan-500 text-cyan-400';
                    content.classList.remove('hidden');
                } else {
                    btn.className = 'px-3 py-1.5 font-medium text-slate-400 hover:text-white';
                    content.classList.add('hidden');
                }
            }
        });

        if (tabName === 'mapa' && window.spatialResultLeaflet) {
            setTimeout(() => window.spatialResultLeaflet.invalidateSize(), 100);
        }
    };

    window.executeSpatialAnalysisFromModal = async function() {
        const targetSel = document.getElementById('spatial-target-layer');
        const refSel = document.getElementById('spatial-ref-layer');
        const targetAttrField = document.getElementById('spatial-target-attr-field');
        const targetAttrVal = document.getElementById('spatial-target-attr-val');
        const refAttrField = document.getElementById('spatial-ref-attr-field');
        const refAttrVal = document.getElementById('spatial-ref-attr-val');
        const distInput = document.getElementById('spatial-buffer-dist');
        const calcAreaInput = document.getElementById('spatial-calc-area');
        const nameInput = document.getElementById('spatial-rule-name');

        const existingEditingId = window.currentEditingSpatialRuleId || (document.getElementById('spatial-rule-id')?.value);
        const execId = (existingEditingId && !existingEditingId.startsWith('temp_exec_')) ? existingEditingId : ('temp_exec_' + Date.now());

        const ruleData = {
            id: execId,
            name: nameInput?.value.trim() || 'Consulta Espacial Direta',
            targetLayer: targetSel.value,
            targetLayerName: targetSel.options[targetSel.selectedIndex]?.text,
            targetAttrField: targetAttrField?.value || '',
            targetAttrValue: targetAttrVal?.value || '',
            refLayer: refSel.value,
            refLayerName: refSel.options[refSel.selectedIndex]?.text,
            refAttrField: refAttrField?.value || '',
            refAttrValue: refAttrVal?.value || '',
            opType: window.currentSelectedOp || 'intersects',
            bufferDist: parseFloat(distInput?.value) || 1.0,
            toleranceMeters: parseFloat(distInput?.value) || 1.0,
            calcArea: calcAreaInput ? calcAreaInput.checked : true,
            highlightColor: '#06b6d4'
        };

        const existingIdx = window.spatialAnalyticsEngine.rules.findIndex(r => r.id === execId);
        if (existingIdx >= 0) {
            window.spatialAnalyticsEngine.rules[existingIdx] = ruleData;
        } else {
            window.spatialAnalyticsEngine.rules.push(ruleData);
        }
        await window.spatialAnalyticsEngine.runAnalysis(ruleData.id);

        const res = window.spatialAnalyticsEngine.lastAnalysisResult;
        if (res) {
            document.getElementById('kpi-total-target').textContent = res.totalTarget;
            document.getElementById('kpi-matching').textContent = res.totalMatching;
            
            const areaKpiEl = document.getElementById('kpi-area');
            const percentKpiEl = document.getElementById('kpi-percent');

            if (res.totalRegularAreaM2 > 0 || res.totalAdvancedAreaM2 > 0) {
                areaKpiEl.textContent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(res.totalRegularAreaM2) + ' m²';
                percentKpiEl.textContent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(res.totalAdvancedAreaM2) + ' m²';
            } else {
                areaKpiEl.textContent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(res.totalOverlayAreaM2 || 0) + ' m²';
                const pct = res.totalTarget > 0 ? ((res.totalMatching / res.totalTarget) * 100).toFixed(1) + '%' : '0%';
                percentKpiEl.textContent = pct;
            }

            document.getElementById('resumo-target-name').textContent = ruleData.targetLayerName;
            document.getElementById('resumo-ref-name').textContent = ruleData.refLayerName;
            document.getElementById('resumo-op-name').textContent = ruleData.opType.toUpperCase();
            document.getElementById('resumo-datetime').textContent = res.date;

            // Pergunta respondida em linguagem humana
            const humanQueryEl = document.getElementById('resumo-query-human-text');
            if (humanQueryEl) {
                humanQueryEl.innerHTML = window.generateHumanQueryText();
            }

            // Exibição detalhada de áreas
            const areasBreakdownEl = document.getElementById('resumo-areas-breakdown');
            if (areasBreakdownEl) {
                if (res.totalRegularAreaM2 > 0 || res.totalAdvancedAreaM2 > 0) {
                    areasBreakdownEl.classList.remove('hidden');
                    const totalM2 = (res.totalRegularAreaM2 + res.totalAdvancedAreaM2);
                    document.getElementById('resumo-area-total').textContent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(totalM2) + ' m²';
                    document.getElementById('resumo-area-regular').textContent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(res.totalRegularAreaM2) + ' m²';
                    document.getElementById('resumo-area-advanced').textContent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(res.totalAdvancedAreaM2) + ' m²';
                } else {
                    areasBreakdownEl.classList.add('hidden');
                }
            }

            window.renderSpatialTable(res);
            window.renderSpatialChart(res);
            window.renderSpatialResultMap(res);

            window.setSpatialStep(4);
            window.switchResultTab('resumo');
        }
    };

    window.renderSpatialChart = function(result) {
        const canvas = document.getElementById('spatial-chart-canvas');
        if (!canvas) return;

        if (window.spatialChartInstance) {
            window.spatialChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        const mode = window.currentChartMode || 'area';

        // 1. MODO: TOP AVANÇOS (BARRAS HORIZONTAIS)
        if (mode === 'top') {
            const sortedByAdvance = [...result.matchingFeatures]
                .filter(f => f._extraAnalysisData?.areaAvancada > 0)
                .sort((a, b) => (b._extraAnalysisData?.areaAvancada || 0) - (a._extraAnalysisData?.areaAvancada || 0))
                .slice(0, 7);

            if (sortedByAdvance.length > 0) {
                const labels = sortedByAdvance.map(f => (f.properties?.nome || f.properties?.Lote || f.properties?.id || 'Imóvel'));
                const data = sortedByAdvance.map(f => f._extraAnalysisData.areaAvancada);

                window.spatialChartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Área de Avanço (m²)',
                            data: data,
                            backgroundColor: '#f43f5e',
                            borderRadius: 6
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { ticks: { color: '#94a3b8', font: { size: 10 } } },
                            y: { ticks: { color: '#ffffff', font: { size: 10, weight: 'bold' } } }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => ` Avanço: ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(ctx.raw)} m²`
                                }
                            }
                        }
                    }
                });
                return;
            }
        }

        // 2. MODO: ÁREAS DA PESQUISA (PADRÃO)
        if (mode === 'area' && (result.totalRegularAreaM2 > 0 || result.totalAdvancedAreaM2 > 0)) {
            const regM2 = result.totalRegularAreaM2 || 0;
            const advM2 = result.totalAdvancedAreaM2 || 0;
            const totalM2 = regM2 + advM2;
            const regPct = totalM2 > 0 ? ((regM2 / totalM2) * 100).toFixed(1) : 0;
            const advPct = totalM2 > 0 ? ((advM2 / totalM2) * 100).toFixed(1) : 0;

            window.spatialChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: [`Área Regular (${regPct}%)`, `Área de Avanço (${advPct}%)`],
                    datasets: [{
                        data: [regM2, advM2],
                        backgroundColor: ['#06b6d4', '#f43f5e'],
                        borderWidth: 2,
                        borderColor: '#0b1329'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } } },
                        tooltip: {
                            callbacks: {
                                label: (c) => ` ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(c.raw)} m²`
                            }
                        }
                    }
                }
            });
            return;
        }

        // 3. MODO: ESTATÍSTICA ZONAL
        if (result.zonalStatsMap && Object.keys(result.zonalStatsMap).length > 0) {
            const labels = Object.keys(result.zonalStatsMap);
            const data = labels.map(k => result.zonalStatsMap[k].count);
            const bgColors = ['#06b6d4', '#10b981', '#a855f7', '#f59e0b', '#ec4899', '#3b82f6'];

            window.spatialChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Quantidade por Zona',
                        data: data,
                        backgroundColor: bgColors.slice(0, labels.length),
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ticks: { color: '#94a3b8', font: { size: 10 } } },
                        y: { ticks: { color: '#94a3b8', font: { size: 10 } } }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
            return;
        }

        // 4. MODO: CONTAGEM DE FEIÇÕES
        const notMatching = Math.max(0, result.totalTarget - result.totalMatching);
        window.spatialChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Feições Relacionadas', 'Sem Relação'],
                datasets: [{
                    data: [result.totalMatching, notMatching],
                    backgroundColor: ['#06b6d4', '#334155'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 10 } } }
                }
            }
        });
    };

    window.renderSpatialResultMap = async function(result) {
        const container = document.getElementById('spatial-result-interactive-map');
        if (!container) return;

        if (!window.spatialResultLeaflet) {
            window.spatialResultLeaflet = L.map('spatial-result-interactive-map', {
                attributionControl: false
            }).setView([-7.035, -34.835], 14);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                maxNativeZoom: 19,
                className: 'dark-tiles-layer'
            }).addTo(window.spatialResultLeaflet);

            window.spatialResultRefGroup = L.featureGroup().addTo(window.spatialResultLeaflet);
            window.spatialResultBufferGroup = L.featureGroup().addTo(window.spatialResultLeaflet);
            window.spatialResultTargetGroup = L.featureGroup().addTo(window.spatialResultLeaflet);
            window.spatialResultSplitGroup = L.featureGroup().addTo(window.spatialResultLeaflet);
        }

        window.spatialResultRefGroup.clearLayers();
        window.spatialResultBufferGroup.clearLayers();
        window.spatialResultTargetGroup.clearLayers();
        if (window.spatialResultSplitGroup) window.spatialResultSplitGroup.clearLayers();

        // 1. Renderiza a Camada de Referência Cruzada (em Roxo/Magenta)
        if (result.rule && result.rule.refLayer) {
            const rawRefFeats = await window.spatialAnalyticsEngine.getFeaturesForTheme(result.rule.refLayer);
            const refFeats = window.spatialAnalyticsEngine.applyFeatureFilter(rawRefFeats, result.rule.refAttrField, result.rule.refAttrValue);

            if (refFeats.length > 0) {
                L.geoJSON(refFeats, {
                    style: (feature) => ({
                        color: '#a855f7',
                        weight: feature.geometry && feature.geometry.type.includes('Line') ? 4.5 : 2.5,
                        fillColor: '#a855f7',
                        fillOpacity: 0.35,
                        dashArray: ''
                    }),
                    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
                        radius: 6,
                        fillColor: '#a855f7',
                        color: '#ffffff',
                        weight: 1.5,
                        fillOpacity: 0.9
                    }),
                    onEachFeature: (feature, layer) => {
                        let pop = `<div class="p-1 text-xs"><strong class="text-purple-400 font-bold block mb-1">Referência: ${result.rule.refLayerName || 'Camada'}</strong>`;
                        if (feature.properties) {
                            for (const [k, v] of Object.entries(feature.properties)) {
                                if (!k.startsWith('_') && typeof v !== 'object') pop += `<div><strong>${k}:</strong> ${v}</div>`;
                            }
                        }
                        pop += `</div>`;
                        layer.bindPopup(pop);
                    }
                }).addTo(window.spatialResultRefGroup);
            }
        }

        // 2. Renderiza o Buffer / Área de Influência (se houver)
        if (result.bufferGeom) {
            L.geoJSON(result.bufferGeom, {
                style: {
                    color: '#a855f7',
                    weight: 2,
                    dashArray: '5, 5',
                    fillColor: '#a855f7',
                    fillOpacity: 0.15
                }
            }).addTo(window.spatialResultBufferGroup);
        }

        // 3. Renderiza as Partes Cortadas / Áreas Separadas (se houver split)
        if (result.splitVisualFeatures && result.splitVisualFeatures.length > 0) {
            L.geoJSON(result.splitVisualFeatures, {
                style: (feature) => {
                    const isAvanco = feature.properties?._partType === 'avanco';
                    return {
                        color: '#000000',
                        weight: 2.2,
                        opacity: 1,
                        fillColor: isAvanco ? '#ef4444' : '#06b6d4',
                        fillOpacity: isAvanco ? 0.8 : 0.65
                    };
                },
                onEachFeature: (feature, layer) => {
                    const p = feature.properties || {};
                    const isAvanco = p._partType === 'avanco';
                    const title = isAvanco ? '⚠️ Área de Avanço (Além do Limite)' : '✅ Área Regular (Dentro do Limite)';
                    const colorClass = isAvanco ? 'text-rose-400' : 'text-cyan-400';
                    let pop = `<div class="p-1 text-xs"><strong class="${colorClass} font-bold block mb-1">${title}</strong>`;
                    if (p._partAreaM2) {
                        pop += `<div class="mb-1"><strong>Área da Porção:</strong> ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(p._partAreaM2)} m²</div>`;
                    }
                    if (feature.properties) {
                        for (const [k, v] of Object.entries(feature.properties)) {
                            if (!k.startsWith('_') && typeof v !== 'object') pop += `<div><strong>${k}:</strong> ${v}</div>`;
                        }
                    }
                    pop += `</div>`;
                    layer.bindPopup(pop);

                    if (p._partAreaM2 && feature.geometry) {
                        try {
                            const c = turf.centroid(feature);
                            const lat = c.geometry.coordinates[1];
                            const lng = c.geometry.coordinates[0];
                            const areaStr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(p._partAreaM2);
                            
                            const labelIcon = L.divIcon({
                                className: 'custom-area-label-wrapper',
                                html: `<div style="background: rgba(0,0,0,0.85); color: #ffffff; padding: 2px 5px; border-radius: 4px; font-size: 10px; font-weight: 700; border: 1px solid rgba(255,255,255,0.3); box-shadow: 0 2px 6px rgba(0,0,0,0.5); transform: translate(-50%, -50%); pointer-events: none; white-space: nowrap;">${areaStr} m²</div>`,
                                iconSize: [0, 0]
                            });
                            L.marker([lat, lng], { icon: labelIcon }).addTo(window.spatialResultSplitGroup);
                        } catch(eLbl) {}
                    }
                }
            }).addTo(window.spatialResultSplitGroup);
        } else if (result.matchingFeatures && result.matchingFeatures.length > 0) {
            // Renderiza as Feições Alvo Normais que Cruzaram (em Ciano com Destaque)
            L.geoJSON(result.matchingFeatures, {
                style: (feature) => ({
                    color: '#06b6d4',
                    weight: feature.geometry && feature.geometry.type.includes('Line') ? 3.5 : 2.5,
                    fillColor: '#06b6d4',
                    fillOpacity: 0.55,
                    dashArray: ''
                }),
                pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
                    radius: 7,
                    fillColor: '#06b6d4',
                    color: '#ffffff',
                    weight: 2,
                    fillOpacity: 0.95
                }),
                onEachFeature: (feature, layer) => {
                    let pop = `<div class="p-1 text-xs"><strong class="text-cyan-400 font-bold block mb-1">Resultado Cruzado</strong>`;
                    if (feature.properties) {
                        for (const [k, v] of Object.entries(feature.properties)) {
                            if (!k.startsWith('_') && typeof v !== 'object') pop += `<div><strong>${k}:</strong> ${v}</div>`;
                        }
                    }
                    pop += `</div>`;
                    layer.bindPopup(pop);
                }
            }).addTo(window.spatialResultTargetGroup);
        }

        // 4. Centraliza no Conjunto Completo (Referência + Resultado)
        try {
            const allBounds = L.latLngBounds([]);
            if (window.spatialResultRefGroup.getLayers().length > 0) allBounds.extend(window.spatialResultRefGroup.getBounds());
            if (window.spatialResultTargetGroup.getLayers().length > 0) allBounds.extend(window.spatialResultTargetGroup.getBounds());
            if (window.spatialResultSplitGroup && window.spatialResultSplitGroup.getLayers().length > 0) allBounds.extend(window.spatialResultSplitGroup.getBounds());
            if (window.spatialResultBufferGroup.getLayers().length > 0) allBounds.extend(window.spatialResultBufferGroup.getBounds());
            if (allBounds.isValid()) {
                window.spatialResultLeaflet.fitBounds(allBounds, { padding: [25, 25], maxZoom: 19 });
            }
        } catch(e) {}
    };

    window.saveCurrentSpatialRule = async function() {
        const idInput = document.getElementById('spatial-rule-id');
        const nameInput = document.getElementById('spatial-rule-name');
        const targetSel = document.getElementById('spatial-target-layer');
        const refSel = document.getElementById('spatial-ref-layer');
        const targetAttrField = document.getElementById('spatial-target-attr-field');
        const targetAttrVal = document.getElementById('spatial-target-attr-val');
        const refAttrField = document.getElementById('spatial-ref-attr-field');
        const refAttrVal = document.getElementById('spatial-ref-attr-val');
        const distInput = document.getElementById('spatial-buffer-dist');
        const calcAreaInput = document.getElementById('spatial-calc-area');

        const name = nameInput?.value.trim();
        if (!name) {
            alert('Por favor, informe um nome para salvar a análise.');
            if (nameInput) nameInput.focus();
            return;
        }

        const existingId = window.currentEditingSpatialRuleId || (idInput?.value && !idInput.value.startsWith('temp_exec_') ? idInput.value : null);
        let ruleId = existingId;
        
        let currentRules = (window.spatialAnalyticsEngine?.rules || []).filter(r => !r.id.startsWith('temp_exec_'));

        // Se não tiver ID explícito, verifica se já existe uma regra com exatamente o mesmo nome
        if (!ruleId && name) {
            const sameNameRule = currentRules.find(r => r.name && r.name.trim().toLowerCase() === name.trim().toLowerCase());
            if (sameNameRule) {
                ruleId = sameNameRule.id;
            }
        }

        if (!ruleId) {
            ruleId = 'rule_' + Date.now();
        }

        const savedRule = {
            id: ruleId,
            name: name,
            targetLayer: targetSel.value,
            targetLayerName: targetSel.options[targetSel.selectedIndex]?.text,
            targetAttrField: targetAttrField?.value || '',
            targetAttrValue: targetAttrVal?.value || '',
            refLayer: refSel.value,
            refLayerName: refSel.options[refSel.selectedIndex]?.text,
            refAttrField: refAttrField?.value || '',
            refAttrValue: refAttrVal?.value || '',
            opType: window.currentSelectedOp || 'intersects',
            bufferDist: parseFloat(distInput?.value) || 1.0,
            toleranceMeters: parseFloat(distInput?.value) || 1.0,
            calcArea: calcAreaInput ? calcAreaInput.checked : true,
            highlightColor: '#06b6d4',
            updatedAt: new Date().toISOString()
        };

        if (idInput) idInput.value = ruleId;
        window.currentEditingSpatialRuleId = ruleId;

        // Atualiza no array no índice existente ou adiciona novo
        const existingIdx = currentRules.findIndex(r => r.id === ruleId || (r.name && r.name.trim().toLowerCase() === name.trim().toLowerCase()));
        if (existingIdx >= 0) {
            currentRules[existingIdx] = savedRule;
        } else {
            currentRules.push(savedRule);
        }

        // Deduplica por ID e por Nome
        const uniqueMap = new Map();
        currentRules.forEach(r => {
            if (r.id && !uniqueMap.has(r.id)) {
                uniqueMap.set(r.id, r);
            }
        });
        currentRules = Array.from(uniqueMap.values());

        window.spatialAnalyticsEngine.rules = currentRules;
        window.spatialAnalyticsEngine.activeRuleId = ruleId;

        const munId = (typeof activeMunicipioId !== 'undefined' && activeMunicipioId) || sessionStorage.getItem('municipio_ativo') || 'default';
        const key = `spatial_rules_${munId}`;
        localStorage.setItem(key, JSON.stringify(currentRules));
        localStorage.setItem('spatial_analytics_rules', JSON.stringify(currentRules));

        if (typeof supabaseClient !== 'undefined' && supabaseClient && munId !== 'default') {
            try {
                await supabaseClient.from('municipio_config').upsert({
                    municipio_id: munId,
                    config_chave: `spatial_rules_${munId}`,
                    config_valor: currentRules,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'municipio_id,config_chave' });
            } catch(e) {
                console.warn('Erro ao salvar regra no Supabase:', e);
            }
        }

        if (window.spatialAnalyticsEngine) {
            window.spatialAnalyticsEngine.updateBadge();
            window.spatialAnalyticsEngine.renderMenuList();
        }

        if (typeof window.loadSpatialAnalyticsRules === 'function') {
            window.loadSpatialAnalyticsRules();
        }

        alert('✨ Análise salva com sucesso no sistema!');
        window.closeSpatialRuleModal();
        if (window.map && window.spatialAnalyticsEngine) {
            await window.spatialAnalyticsEngine.runAnalysis(ruleId);
        }
    };

    window.exportSpatialData = function(format) {
        const res = window.spatialAnalyticsEngine.lastAnalysisResult;
        if (!res || !res.matchingFeatures || res.matchingFeatures.length === 0) {
            alert('Não há dados resultantes para exportar. Execute a análise primeiro.');
            return;
        }

        const fileName = `Analise_Espacial_${res.rule.name.replace(/\s+/g, '_')}_${Date.now()}`;

        if (format === 'csv') {
            let csv = '\uFEFF';
            const headers = ['ID', 'Nome_Feicao', 'Status_Analise', 'Area_Sobreposta_m2'];
            csv += headers.join(';') + '\n';

            res.matchingFeatures.forEach((f, idx) => {
                const label = (f.properties && (f.properties.nome || f.properties.Lote || f.properties.id)) || `Feicao_${idx+1}`;
                csv += `${idx+1};"${label}";"Cruzamento Confirmado";"${res.totalOverlayAreaM2}"\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${fileName}.csv`;
            link.click();
        } else if (format === 'geojson') {
            const geojsonObj = {
                type: 'FeatureCollection',
                metadata: {
                    analise: res.rule.name,
                    data: res.date,
                    total: res.totalMatching,
                    area_m2: res.totalOverlayAreaM2
                },
                features: res.matchingFeatures
            };
            const blob = new Blob([JSON.stringify(geojsonObj, null, 2)], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${fileName}.geojson`;
            link.click();
        } else if (format === 'pdf') {
            if (window.jspdf && window.jspdf.jsPDF) {
                const doc = new window.jspdf.jsPDF();
                doc.setFontSize(16);
                doc.text('Relatório Técnico – Análise Espacial Cruzada', 14, 20);
                doc.setFontSize(11);
                doc.text(`Análise: ${res.rule.name}`, 14, 30);
                doc.text(`Camada Alvo: ${res.rule.targetLayerName}`, 14, 38);
                doc.text(`Camada Referência: ${res.rule.refLayerName}`, 14, 46);
                doc.text(`Total de Feições Alvo: ${res.totalTarget}`, 14, 54);
                doc.text(`Feições com Cruzamento Detectado: ${res.totalMatching}`, 14, 62);
                doc.text(`Área Sobreposta Calculada: ${res.totalOverlayAreaM2.toFixed(2)} m²`, 14, 70);
                doc.text(`Data de Emissão: ${res.date}`, 14, 78);
                doc.save(`${fileName}.pdf`);
            } else {
                window.print();
            }
        } else if (format === 'docx') {
            const htmlContent = `
                <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                <head><meta charset='utf-8'><title>Relatório de Análise Espacial</title></head>
                <body style="font-family: Arial, sans-serif;">
                    <h2>Relatório Técnico – Análise Espacial Cruzada</h2>
                    <p><strong>Título:</strong> ${res.rule.name}</p>
                    <p><strong>Camada Alvo:</strong> ${res.rule.targetLayerName}</p>
                    <p><strong>Camada Referência:</strong> ${res.rule.refLayerName}</p>
                    <p><strong>Total de Feições Analisadas:</strong> ${res.totalTarget}</p>
                    <p><strong>Feições com Relação Espacial:</strong> ${res.totalMatching}</p>
                    <p><strong>Área Total Sobreposta:</strong> ${res.totalOverlayAreaM2.toFixed(2)} m²</p>
                    <p><strong>Data:</strong> ${res.date}</p>
                </body>
                </html>
            `;
            const blob = new Blob([htmlContent], { type: 'application/msword' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${fileName}.doc`;
            link.click();
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        window.spatialAnalyticsEngine.init();
    });
})();
