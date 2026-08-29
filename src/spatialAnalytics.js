// src/spatialAnalytics.js
// PAINEL ESTATÍSTICO – ANÁLISE ESPACIAL CRUZADA (TELA CHEIA)
// Construtor de Consultas Espaciais em 4 Etapas, Topologia Turf.js, Dashboard Multi-Abas e Exportações (CSV, GeoJSON, PDF, DOCX)

(function() {
    'use strict';

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
            this.loadRules();
            this.renderFloatingMenu();
            this.ensureSpatialRuleModalDOM();
            console.log('✅ SpatialAnalyticsManager inicializado com Painel Estatístico em Tela Cheia.');
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
                        localStorage.setItem(key, JSON.stringify(this.rules));
                    }
                } catch(e) {}
            }

            this.updateMenuBadge();
        }

        updateMenuBadge() {
            const btn = document.getElementById('btn-spatial-analytics');
            if (btn) {
                const count = this.rules.length;
                let badge = btn.querySelector('.spatial-badge');
                if (!badge && count > 0) {
                    badge = document.createElement('span');
                    badge.className = 'spatial-badge ml-1 px-1.5 py-0.2 bg-cyan-500 text-white rounded-full text-[10px] font-bold shadow-sm';
                    btn.appendChild(badge);
                }
                if (badge) {
                    badge.textContent = count;
                    badge.style.display = count > 0 ? 'inline-block' : 'none';
                }
            }
        }

        toggleMenu() {
            this.isMenuOpen = !this.isMenuOpen;
            const menu = document.getElementById('spatial-analytics-menu');
            if (menu) {
                if (this.isMenuOpen) {
                    this.loadRules();
                    this.renderMenuList();
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
            menu.className = 'fixed top-16 right-4 md:right-16 z-[1000] hidden flex flex-col w-80 sm:w-96 bg-white/95 dark:bg-[#070b14]/95 backdrop-blur-xl rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.5)] border border-slate-200/50 dark:border-white/10 overflow-hidden transition-all duration-300';
            
            menu.innerHTML = `
                <div class="px-4 py-3 border-b border-slate-200/50 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/60">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-cyan-500 text-[20px]">hub</span>
                        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">Estatísticas Cruzadas</h3>
                    </div>
                    <div class="flex items-center gap-1">
                        <button type="button" onclick="window.openSpatialRuleModal()" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-cyan-500 transition-colors mr-2 cursor-pointer tooltip" title="Nova Análise / Configurar">
                            <span class="material-symbols-outlined text-[18px]">settings</span>
                        </button>
                        <button type="button" onclick="window.spatialAnalyticsEngine.closeMenu()" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-red-400 transition-colors cursor-pointer tooltip" title="Fechar">
                            <span class="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    </div>
                </div>
                <div id="spatial-menu-items" class="p-3 max-h-[60vh] overflow-y-auto flex flex-col gap-2">
                    <!-- Preenchido via JS -->
                </div>
            `;

            document.body.appendChild(menu);
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
                'disjoint': 'block'
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
            let totalOverlayAreaM2 = 0;
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

            targetFeatures.forEach(tFeat => {
                if (!tFeat.geometry) return;
                let isMatch = false;

                try {
                    if (rule.opType === 'intersects') {
                        for (const rFeat of refFeatures) {
                            if (turf.booleanIntersects(tFeat, rFeat)) {
                                isMatch = true;
                                if (rule.calcArea && (tFeat.geometry.type.includes('Polygon')) && (rFeat.geometry.type.includes('Polygon'))) {
                                    try {
                                        const intersection = turf.intersect(tFeat, rFeat);
                                        if (intersection) totalOverlayAreaM2 += turf.area(intersection);
                                    } catch(eArea) {}
                                }
                                break;
                            }
                        }
                    } else if (rule.opType === 'touches') {
                        for (const rFeat of refFeatures) {
                            if (turf.booleanTouches(tFeat, rFeat) || turf.booleanIntersects(tFeat, rFeat) || (bufferGeom && turf.booleanIntersects(tFeat, bufferGeom))) {
                                isMatch = true;
                                break;
                            }
                        }
                    } else if (rule.opType === 'buffer' && bufferGeom) {
                        if (turf.booleanIntersects(tFeat, bufferGeom)) isMatch = true;
                    } else if (rule.opType === 'within') {
                        for (const rFeat of refFeatures) {
                            if (turf.booleanWithin(tFeat, rFeat) || turf.booleanPointInPolygon(tFeat, rFeat)) {
                                isMatch = true;
                                break;
                            }
                        }
                    } else if (rule.opType === 'disjoint') {
                        let hasRelation = false;
                        for (const rFeat of refFeatures) {
                            if (turf.booleanIntersects(tFeat, rFeat) || turf.booleanTouches(tFeat, rFeat)) {
                                hasRelation = true;
                                break;
                            }
                        }
                        if (!hasRelation) isMatch = true;
                    }
                } catch(eEval) {
                    console.warn('Erro ao avaliar topologia:', eEval);
                }

                if (isMatch) matchingFeatures.push(tFeat);
            });

            this.lastAnalysisResult = {
                rule,
                totalTarget: targetFeatures.length,
                totalMatching: matchingFeatures.length,
                matchingFeatures,
                totalOverlayAreaM2,
                bufferGeom,
                date: new Date().toLocaleString('pt-BR')
            };

            this.applyMapHighlight(rule, matchingFeatures, bufferGeom);
            this.showResultCard(rule, matchingFeatures.length, totalOverlayAreaM2);
        }

        applyMapHighlight(rule, matchingFeatures, bufferGeom = null) {
            if (!window.map) return;

            if (this.highlightLayer) {
                window.map.removeLayer(this.highlightLayer);
                this.highlightLayer = null;
            }
            if (this.referenceHighlightLayer) {
                window.map.removeLayer(this.referenceHighlightLayer);
                this.referenceHighlightLayer = null;
            }

            const color = rule.highlightColor || '#06b6d4';

            if (bufferGeom) {
                this.referenceHighlightLayer = L.geoJSON(bufferGeom, {
                    style: {
                        color: color,
                        weight: 2,
                        dashArray: '5, 5',
                        fillColor: color,
                        fillOpacity: 0.15
                    }
                }).addTo(window.map);
            }

            if (matchingFeatures && matchingFeatures.length > 0) {
                this.highlightLayer = L.geoJSON(matchingFeatures, {
                    style: {
                        color: color,
                        weight: 3.5,
                        fillColor: color,
                        fillOpacity: 0.45,
                        dashArray: ''
                    },
                    pointToLayer: (feature, latlng) => {
                        return L.circleMarker(latlng, {
                            radius: 8,
                            fillColor: color,
                            color: '#ffffff',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.9
                        });
                    },
                    onEachFeature: (feature, layer) => {
                        let popupHtml = `<div class="p-1 text-xs">`;
                        popupHtml += `<strong class="text-cyan-500 font-bold block mb-1">Resultado da Análise Espacial</strong>`;
                        if (feature.properties) {
                            for (const [k, v] of Object.entries(feature.properties)) {
                                if (!k.startsWith('_') && typeof v !== 'object') {
                                    popupHtml += `<div><strong>${k}:</strong> ${v}</div>`;
                                }
                            }
                        }
                        popupHtml += `</div>`;
                        layer.bindPopup(popupHtml);
                    }
                }).addTo(window.map);

                try {
                    const bounds = this.highlightLayer.getBounds();
                    if (bounds.isValid()) {
                        window.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
                    }
                } catch(e) {}
            }
        }

        showResultCard(rule, matchCount, areaM2 = 0, warningMsg = '') {
            let card = document.getElementById('spatial-result-card');
            if (!card) {
                card = document.createElement('div');
                card.id = 'spatial-result-card';
                card.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex flex-col bg-slate-900/95 backdrop-blur-xl border border-cyan-500/50 shadow-[0_15px_40px_rgba(6,182,212,0.3)] rounded-2xl p-4 w-[92%] sm:w-[480px] text-white animate-in fade-in slide-in-from-bottom-6 duration-300';
                document.body.appendChild(card);
            }

            let areaHtml = '';
            if (rule.calcArea && areaM2 > 0) {
                const areaFormatted = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(areaM2);
                areaHtml = `
                    <div class="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                        <span class="text-slate-400">Área de Sobreposição Estimada:</span>
                        <span class="font-bold text-emerald-400 text-sm font-mono">${areaFormatted} m²</span>
                    </div>
                `;
            }

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
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-cyan-400 text-[18px]">query_stats</span>
                        <span class="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">Análise Ativa no Mapa</span>
                    </div>
                    <button onclick="window.spatialAnalyticsEngine.clearActiveAnalysis()" class="text-slate-400 hover:text-white transition-colors">
                        <span class="material-symbols-outlined text-[16px]">close</span>
                    </button>
                </div>

                <h4 class="text-sm font-bold text-white mb-2">${rule.name}</h4>
                ${alertHtml}

                <div class="flex items-center justify-between bg-slate-800/80 rounded-xl p-2.5 border border-white/5">
                    <div>
                        <div class="text-[10px] text-slate-400 font-bold uppercase">Total Detectado</div>
                        <div class="text-xl font-extrabold text-cyan-400">${matchCount} <span class="text-xs font-normal text-slate-300">feições</span></div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="window.openSpatialRuleModal('${rule.id}')" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">tune</span> Configurar
                        </button>
                        <button onclick="window.spatialAnalyticsEngine.clearActiveAnalysis()" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-bold transition-all">
                            Limpar
                        </button>
                    </div>
                </div>

                ${areaHtml}
            `;

            card.classList.remove('hidden');
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

            if (closeCard) {
                const card = document.getElementById('spatial-result-card');
                if (card) card.classList.add('hidden');
            }

            this.renderMenuList();
        }

        // ==========================================
        // PAINEL ESTATÍSTICO EM TELA CHEIA (CONSTRUTOR)
        // ==========================================
        ensureSpatialRuleModalDOM() {
            if (document.getElementById('spatial-rule-modal')) return;

            const modal = document.createElement('div');
            modal.id = 'spatial-rule-modal';
            modal.className = 'fixed inset-0 bg-[#070b14]/95 z-[1200] hidden flex flex-col p-4 md:p-6 backdrop-blur-2xl overflow-y-auto text-slate-100 font-sans animate-in fade-in duration-200';
            modal.innerHTML = `
              <!-- Header Superior com Indicador de Progresso -->
              <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between pb-4 border-b border-slate-800 gap-4">
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
                <div class="flex items-center gap-2 sm:gap-4 overflow-x-auto w-full lg:w-auto py-1">
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

              <!-- Container Principal em Grid 3 Colunas -->
              <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-5 flex-1 items-start">

                <!-- COLUNA ESQUERDA: ETAPA 1 - SELECIONAR CAMADAS -->
                <div class="lg:col-span-4 bg-slate-900/70 border border-white/10 rounded-2xl p-4 flex flex-col gap-4 shadow-lg backdrop-blur-md">
                  <div class="flex items-center justify-between pb-2 border-b border-white/5">
                    <div class="flex items-center gap-2">
                      <span class="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">1</span>
                      <h3 class="text-sm font-bold text-white">Selecionar Camadas</h3>
                    </div>
                    <span class="text-[10px] text-slate-400">Escolha as camadas que serão cruzadas</span>
                  </div>

                  <!-- Camada Alvo -->
                  <div>
                    <label class="block text-xs font-bold text-slate-300 mb-1">Camada Alvo (feições analisadas)</label>
                    <select id="spatial-target-layer" onchange="window.onSpatialLayerChange('target')" class="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs outline-none focus:border-cyan-500">
                    </select>
                  </div>

                  <!-- Restrição Camada Alvo -->
                  <div class="p-3 bg-slate-800/40 rounded-xl border border-white/5 space-y-2">
                    <div class="text-[11px] font-bold text-cyan-400 flex items-center gap-1">
                      <span class="material-symbols-outlined text-[14px]">filter_alt</span> Restringir a feições específicas (opcional)
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="block text-[10px] text-slate-400 mb-1">Campo</label>
                        <select id="spatial-target-attr-field" onchange="window.onSpatialAttrFieldChange('target')" class="w-full px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 text-xs outline-none">
                          <option value="">Todos os campos</option>
                        </select>
                      </div>
                      <div>
                        <label class="block text-[10px] text-slate-400 mb-1">Valor</label>
                        <select id="spatial-target-attr-val" onchange="window.updateSpatialQuerySummary()" class="w-full px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 text-xs outline-none">
                          <option value="">Todos os valores</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <!-- Camada de Referência -->
                  <div>
                    <label class="block text-xs font-bold text-slate-300 mb-1">Camada de Referência (cruzada)</label>
                    <select id="spatial-ref-layer" onchange="window.onSpatialLayerChange('ref')" class="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs outline-none focus:border-cyan-500">
                    </select>
                  </div>

                  <!-- Restrição Camada de Referência -->
                  <div class="p-3 bg-slate-800/40 rounded-xl border border-white/5 space-y-2">
                    <div class="text-[11px] font-bold text-purple-400 flex items-center gap-1">
                      <span class="material-symbols-outlined text-[14px]">filter_alt</span> Restringir a feições específicas (opcional)
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="block text-[10px] text-slate-400 mb-1">Campo</label>
                        <select id="spatial-ref-attr-field" onchange="window.onSpatialAttrFieldChange('ref')" class="w-full px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 text-xs outline-none">
                          <option value="">Todos os campos</option>
                        </select>
                      </div>
                      <div>
                        <label class="block text-[10px] text-slate-400 mb-1">Valor</label>
                        <select id="spatial-ref-attr-val" onchange="window.updateSpatialQuerySummary()" class="w-full px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 text-xs outline-none">
                          <option value="">Todos os valores</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <!-- Mini-mapa de Pré-visualização -->
                  <div class="rounded-xl overflow-hidden border border-white/10 relative h-40 bg-slate-950">
                    <div id="spatial-preview-map" class="w-full h-full"></div>
                    <div class="absolute bottom-2 left-2 z-[400] flex items-center gap-2 text-[10px] bg-slate-900/90 px-2 py-1 rounded-lg border border-white/10 backdrop-blur-sm">
                      <span class="flex items-center gap-1 text-cyan-400"><span class="w-2 h-2 rounded-full bg-cyan-400"></span> Alvo</span>
                      <span class="flex items-center gap-1 text-purple-400"><span class="w-2 h-2 rounded-full bg-purple-400"></span> Referência</span>
                    </div>
                  </div>

                  <div class="p-2.5 bg-slate-800/30 rounded-xl border border-white/5 text-[11px] text-slate-400 flex items-start gap-2">
                    <span class="material-symbols-outlined text-[16px] text-cyan-400 shrink-0 mt-0.5">info</span>
                    <span>Se nenhum filtro for selecionado, a análise processará todas as feições das camadas escolhidas.</span>
                  </div>
                </div>

                <!-- COLUNA CENTRAL: ETAPA 2 (OPERAÇÃO) & ETAPA 3 (CONFIGURAÇÃO) -->
                <div class="lg:col-span-4 flex flex-col gap-5">
                  <!-- ETAPA 2: DEFINIR OPERAÇÃO -->
                  <div class="bg-slate-900/70 border border-white/10 rounded-2xl p-4 flex flex-col gap-3 shadow-lg backdrop-blur-md">
                    <div class="flex items-center justify-between pb-2 border-b border-white/5">
                      <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">2</span>
                        <h3 class="text-sm font-bold text-white">Definir Operação</h3>
                      </div>
                      <span class="text-[10px] text-slate-400">Escolha a relação topológica</span>
                    </div>

                    <!-- Cards de Operações Espaciais -->
                    <div class="grid grid-cols-2 gap-2.5">
                      <!-- Interseção -->
                      <div id="op-card-intersects" onclick="window.selectSpatialOp('intersects')" class="p-3 rounded-xl border border-cyan-500 bg-cyan-500/15 cursor-pointer transition-all flex flex-col gap-1.5 select-none hover:border-cyan-400">
                        <div class="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
                          <span class="material-symbols-outlined text-[16px]">content_cut</span> Interseção
                        </div>
                        <p class="text-[10px] text-slate-300 leading-tight">Calcula onde as duas camadas ocupam a mesma área.</p>
                      </div>

                      <!-- Confrontação -->
                      <div id="op-card-touches" onclick="window.selectSpatialOp('touches')" class="p-3 rounded-xl border border-white/10 bg-slate-800/40 cursor-pointer transition-all flex flex-col gap-1.5 select-none hover:border-cyan-400">
                        <div class="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                          <span class="material-symbols-outlined text-[16px]">handshake</span> Confrontação
                        </div>
                        <p class="text-[10px] text-slate-300 leading-tight">Faz face ou compartilha bordas (lotes vizinhos/ruas).</p>
                      </div>

                      <!-- Buffer -->
                      <div id="op-card-buffer" onclick="window.selectSpatialOp('buffer')" class="p-3 rounded-xl border border-white/10 bg-slate-800/40 cursor-pointer transition-all flex flex-col gap-1.5 select-none hover:border-cyan-400">
                        <div class="flex items-center gap-1.5 text-purple-400 font-bold text-xs">
                          <span class="material-symbols-outlined text-[16px]">radar</span> Proximidade
                        </div>
                        <p class="text-[10px] text-slate-300 leading-tight">Encontra elementos dentro de um raio de distância.</p>
                      </div>

                      <!-- Contido em -->
                      <div id="op-card-within" onclick="window.selectSpatialOp('within')" class="p-3 rounded-xl border border-white/10 bg-slate-800/40 cursor-pointer transition-all flex flex-col gap-1.5 select-none hover:border-cyan-400">
                        <div class="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                          <span class="material-symbols-outlined text-[16px]">all_inbox</span> Contido em
                        </div>
                        <p class="text-[10px] text-slate-300 leading-tight">Mostra feições que estão totalmente dentro de polígono.</p>
                      </div>
                    </div>

                    <!-- Configuração de Distância / Tolerância (Buffer ou Confrontação) -->
                    <div id="spatial-dist-config-container" class="p-3 bg-slate-800/50 rounded-xl border border-white/5 flex items-center justify-between">
                      <div>
                        <label class="block text-[11px] font-bold text-slate-200">Tolerância / Raio de Distância</label>
                        <span class="text-[10px] text-slate-400" id="spatial-dist-label">Distância de influência em metros</span>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <input type="number" id="spatial-buffer-dist" value="1.0" min="0.1" max="10000" step="0.5" class="w-20 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-right font-mono text-xs text-cyan-400 outline-none" oninput="window.updateSpatialQuerySummary()">
                        <span class="text-xs text-slate-400 font-bold">m</span>
                      </div>
                    </div>

                    <!-- Resumo Automático da Pergunta -->
                    <div class="p-3 bg-cyan-950/30 border border-cyan-500/30 rounded-xl">
                      <div class="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">psychology</span> Pergunta da Análise
                      </div>
                      <p id="spatial-query-summary-text" class="text-xs text-slate-200 italic">
                        "Analisar onde as feições de Limite Loteamentos cruzam ou sobrepõem Imóveis orla MPF."
                      </p>
                    </div>
                  </div>

                  <!-- ETAPA 3: CONFIGURAR ANÁLISE -->
                  <div class="bg-slate-900/70 border border-white/10 rounded-2xl p-4 flex flex-col gap-3 shadow-lg backdrop-blur-md">
                    <div class="flex items-center justify-between pb-2 border-b border-white/5">
                      <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">3</span>
                        <h3 class="text-sm font-bold text-white">Configurar Análise</h3>
                      </div>
                      <span class="text-[10px] text-slate-400">Métricas e parâmetros</span>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                      <label class="flex items-center justify-between p-2.5 bg-slate-800/40 rounded-xl border border-white/5 cursor-pointer text-xs">
                        <span>Calcular área sobreposta</span>
                        <input type="checkbox" id="spatial-calc-area" checked class="rounded text-cyan-500 focus:ring-0">
                      </label>
                      <label class="flex items-center justify-between p-2.5 bg-slate-800/40 rounded-xl border border-white/5 cursor-pointer text-xs">
                        <span>Calcular quantidade</span>
                        <input type="checkbox" id="spatial-calc-count" checked class="rounded text-cyan-500 focus:ring-0">
                      </label>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="block text-[10px] text-slate-400 mb-1">Precisão da Geometria</label>
                        <select id="spatial-precision" class="w-full px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-200">
                          <option value="auto">Automática (Recomendado)</option>
                          <option value="high">Alta Precisão (ST_MakeValid)</option>
                        </select>
                      </div>
                      <div>
                        <label class="block text-[10px] text-slate-400 mb-1">Sistema de Referência</label>
                        <select id="spatial-srid" class="w-full px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-200">
                          <option value="31984">EPSG: 31984 – SIRGAS 2000 UTM 24S</option>
                          <option value="31985">EPSG: 31985 – SIRGAS 2000 UTM 25S</option>
                          <option value="4326">EPSG: 4326 – WGS 84 (Geográfico)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label class="block text-[10px] text-slate-400 mb-1">Nome da Análise</label>
                      <input type="text" id="spatial-rule-name" placeholder="Ex: Imóveis que avançaram limite de loteamento" class="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs outline-none focus:border-cyan-500">
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

                <!-- COLUNA DIREITA: ETAPA 4 - RESULTADOS & DASHBOARD -->
                <div class="lg:col-span-4 bg-slate-900/70 border border-white/10 rounded-2xl p-4 flex flex-col gap-4 shadow-lg backdrop-blur-md">
                  <div class="flex items-center justify-between pb-2 border-b border-white/5">
                    <div class="flex items-center gap-2">
                      <span class="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">4</span>
                      <h3 class="text-sm font-bold text-white">Resultados da Análise</h3>
                    </div>
                    <span class="text-[10px] text-slate-400">Dashboard Interativo</span>
                  </div>

                  <!-- Cards KPI de Resultado -->
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div class="p-2.5 bg-slate-800/50 rounded-xl border border-white/5 flex flex-col">
                      <span class="text-[9px] uppercase font-bold text-slate-400">Total Alvo</span>
                      <span id="kpi-total-target" class="text-base font-extrabold text-white">--</span>
                    </div>
                    <div class="p-2.5 bg-slate-800/50 rounded-xl border border-white/5 flex flex-col">
                      <span class="text-[9px] uppercase font-bold text-cyan-400">Relacionadas</span>
                      <span id="kpi-matching" class="text-base font-extrabold text-cyan-400">--</span>
                    </div>
                    <div class="p-2.5 bg-slate-800/50 rounded-xl border border-white/5 flex flex-col">
                      <span class="text-[9px] uppercase font-bold text-emerald-400">Área (m²)</span>
                      <span id="kpi-area" class="text-base font-extrabold text-emerald-400">--</span>
                    </div>
                    <div class="p-2.5 bg-slate-800/50 rounded-xl border border-white/5 flex flex-col">
                      <span class="text-[9px] uppercase font-bold text-purple-400">% Sobreposição</span>
                      <span id="kpi-percent" class="text-base font-extrabold text-purple-400">--</span>
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
                  <div class="min-h-[220px] flex flex-col justify-center">
                    <!-- Aba 1: Resumo -->
                    <div id="result-tab-resumo" class="text-xs space-y-2">
                      <div class="p-3 bg-slate-800/40 rounded-xl border border-white/5 space-y-1.5">
                        <div class="flex justify-between text-slate-400"><span>Camada Alvo:</span> <strong class="text-white" id="resumo-target-name">--</strong></div>
                        <div class="flex justify-between text-slate-400"><span>Camada Referência:</span> <strong class="text-white" id="resumo-ref-name">--</strong></div>
                        <div class="flex justify-between text-slate-400"><span>Operação:</span> <strong class="text-cyan-400" id="resumo-op-name">--</strong></div>
                        <div class="flex justify-between text-slate-400"><span>Data/Hora:</span> <span class="text-slate-300" id="resumo-datetime">--</span></div>
                      </div>
                      <div class="flex justify-end gap-2 pt-1">
                        <button type="button" onclick="window.saveCurrentSpatialRule()" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg text-xs font-bold border border-cyan-500/30 flex items-center gap-1 cursor-pointer">
                          <span class="material-symbols-outlined text-[14px]">save</span> Salvar Análise
                        </button>
                      </div>
                    </div>

                    <!-- Aba 2: Tabela -->
                    <div id="result-tab-tabela" class="hidden overflow-x-auto max-h-56">
                      <table class="w-full text-left text-[11px] text-slate-300">
                        <thead class="bg-slate-800 text-slate-400 uppercase text-[9px]">
                          <tr id="result-table-header">
                            <th class="p-2">#</th>
                            <th class="p-2">Feição</th>
                            <th class="p-2">Status</th>
                          </tr>
                        </thead>
                        <tbody id="result-table-body" class="divide-y divide-white/5">
                          <tr><td colspan="3" class="p-4 text-center text-slate-500 italic">Execute a análise para visualizar os registros.</td></tr>
                        </tbody>
                      </table>
                    </div>

                    <!-- Aba 3: Gráfico -->
                    <div id="result-tab-grafico" class="hidden h-52 relative">
                      <canvas id="spatial-chart-canvas"></canvas>
                    </div>

                    <!-- Aba 4: Mapa -->
                    <div id="result-tab-mapa" class="hidden h-52 rounded-xl overflow-hidden border border-white/10 relative">
                      <div id="spatial-result-interactive-map" class="w-full h-full"></div>
                    </div>

                    <!-- Aba 5: Exportar -->
                    <div id="result-tab-exportar" class="hidden grid grid-cols-2 gap-2">
                      <button type="button" onclick="window.exportSpatialData('csv')" class="p-3 rounded-xl bg-slate-800/80 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500 flex flex-col items-center gap-1 text-center transition-all cursor-pointer">
                        <span class="material-symbols-outlined text-emerald-400 text-[22px]">table_view</span>
                        <span class="text-xs font-bold text-white">CSV</span>
                        <span class="text-[9px] text-slate-400">Arquivo tabular</span>
                      </button>

                      <button type="button" onclick="window.exportSpatialData('geojson')" class="p-3 rounded-xl bg-slate-800/80 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500 flex flex-col items-center gap-1 text-center transition-all cursor-pointer">
                        <span class="material-symbols-outlined text-purple-400 text-[22px]">public</span>
                        <span class="text-xs font-bold text-white">GeoJSON</span>
                        <span class="text-[9px] text-slate-400">Dados espaciais</span>
                      </button>

                      <button type="button" onclick="window.exportSpatialData('pdf')" class="p-3 rounded-xl bg-slate-800/80 hover:bg-red-500/20 border border-white/10 hover:border-red-500 flex flex-col items-center gap-1 text-center transition-all cursor-pointer">
                        <span class="material-symbols-outlined text-red-400 text-[22px]">picture_as_pdf</span>
                        <span class="text-xs font-bold text-white">PDF</span>
                        <span class="text-[9px] text-slate-400">Relatório técnico</span>
                      </button>

                      <button type="button" onclick="window.exportSpatialData('docx')" class="p-3 rounded-xl bg-slate-800/80 hover:bg-blue-500/20 border border-white/10 hover:border-blue-500 flex flex-col items-center gap-1 text-center transition-all cursor-pointer">
                        <span class="material-symbols-outlined text-blue-400 text-[22px]">description</span>
                        <span class="text-xs font-bold text-white">Word / Docs</span>
                        <span class="text-[9px] text-slate-400">Documento .docx</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Rodapé Inferior com Benefícios e Garantias -->
              <div class="mt-5 pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center text-slate-400 text-[11px]">
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
        ['intersects', 'touches', 'buffer', 'within'].forEach(o => {
            const card = document.getElementById(`op-card-${o}`);
            if (card) {
                if (o === op) {
                    card.className = 'p-3 rounded-xl border border-cyan-500 bg-cyan-500/15 cursor-pointer transition-all flex flex-col gap-1.5 select-none hover:border-cyan-400';
                } else {
                    card.className = 'p-3 rounded-xl border border-white/10 bg-slate-800/40 cursor-pointer transition-all flex flex-col gap-1.5 select-none hover:border-cyan-400';
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

    window.updateSpatialQuerySummary = function() {
        const targetSel = document.getElementById('spatial-target-layer');
        const refSel = document.getElementById('spatial-ref-layer');
        const targetAttrField = document.getElementById('spatial-target-attr-field');
        const targetAttrVal = document.getElementById('spatial-target-attr-val');
        const refAttrField = document.getElementById('spatial-ref-attr-field');
        const refAttrVal = document.getElementById('spatial-ref-attr-val');
        const summaryEl = document.getElementById('spatial-query-summary-text');
        if (!summaryEl || !targetSel || !refSel) return;

        const targetName = targetSel.options[targetSel.selectedIndex]?.text || 'Camada Alvo';
        const refName = refSel.options[refSel.selectedIndex]?.text || 'Camada de Referência';
        
        let targetDesc = targetName;
        if (targetAttrField && targetAttrField.value && targetAttrVal && targetAttrVal.value) {
            targetDesc += ` (onde ${targetAttrField.value} = "${targetAttrVal.value}")`;
        }

        let refDesc = refName;
        if (refAttrField && refAttrField.value && refAttrVal && refAttrVal.value) {
            refDesc += ` (onde ${refAttrField.value} = "${refAttrVal.value}")`;
        }

        let opText = 'cruzam ou sobrepõem';
        if (window.currentSelectedOp === 'touches') opText = 'fazem face / confrontam';
        else if (window.currentSelectedOp === 'buffer') {
            const d = document.getElementById('spatial-buffer-dist')?.value || '30';
            opText = `estão a menos de ${d}m de`;
        } else if (window.currentSelectedOp === 'within') opText = 'estão totalmente contidos em';

        summaryEl.textContent = `"Encontrar todos os elementos de ${targetDesc} que ${opText} ${refDesc}."`;
    };

    window.populateSpatialLayerSelects = function() {
        const targetSel = document.getElementById('spatial-target-layer');
        const refSel = document.getElementById('spatial-ref-layer');
        if (!targetSel || !refSel) return;

        let optionsHtml = '';
        const themesList = window.themes || (typeof themes !== 'undefined' ? themes : []) || [];

        if (themesList.length > 0) {
            themesList.forEach(t => {
                optionsHtml += `<option value="${t.id}" data-name="${t.name}">${t.name} ${t.geometryType ? `[${t.geometryType}]` : ''}</option>`;
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
        const features = await window.spatialAnalyticsEngine.getFeaturesForTheme(themeId);

        let fieldsSet = new Set();
        features.forEach(f => {
            if (f.properties) {
                Object.keys(f.properties).forEach(k => {
                    if (!k.startsWith('_') && typeof f.properties[k] !== 'object') fieldsSet.add(k);
                });
            }
        });

        let fieldsHtml = '<option value="">Todos os campos</option>';
        fieldsSet.forEach(fld => {
            fieldsHtml += `<option value="${fld}">${fld}</option>`;
        });
        attrFieldSel.innerHTML = fieldsHtml;
        attrValSel.innerHTML = '<option value="">Todos os valores</option>';

        window.updateSpatialPreviewMap();
        window.updateSpatialQuerySummary();
    };

    window.onSpatialAttrFieldChange = async function(type) {
        const layerSel = document.getElementById(type === 'target' ? 'spatial-target-layer' : 'spatial-ref-layer');
        const attrFieldSel = document.getElementById(type === 'target' ? 'spatial-target-attr-field' : 'spatial-ref-attr-field');
        const attrValSel = document.getElementById(type === 'target' ? 'spatial-target-attr-val' : 'spatial-ref-attr-val');
        if (!layerSel || !attrFieldSel || !attrValSel) return;

        const field = attrFieldSel.value;
        if (!field) {
            attrValSel.innerHTML = '<option value="">Todos os valores</option>';
            window.updateSpatialQuerySummary();
            return;
        }

        const themeId = layerSel.value;
        const features = await window.spatialAnalyticsEngine.getFeaturesForTheme(themeId);

        let valsSet = new Set();
        features.forEach(f => {
            if (f.properties && f.properties[field] !== undefined && f.properties[field] !== null && f.properties[field] !== '') {
                valsSet.add(String(f.properties[field]));
            }
        });

        let valHtml = '<option value="">Todos os valores</option>';
        Array.from(valsSet).sort().forEach(val => {
            valHtml += `<option value="${val}">${val}</option>`;
        });
        attrValSel.innerHTML = valHtml;
        window.updateSpatialQuerySummary();
    };

    window.updateSpatialPreviewMap = async function() {
        const targetSel = document.getElementById('spatial-target-layer');
        const refSel = document.getElementById('spatial-ref-layer');
        const container = document.getElementById('spatial-preview-map');
        if (!container || !targetSel || !refSel) return;

        if (!window.spatialPreviewLeaflet) {
            window.spatialPreviewLeaflet = L.map('spatial-preview-map', {
                zoomControl: false,
                attributionControl: false
            }).setView([-7.035, -34.835], 13);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19
            }).addTo(window.spatialPreviewLeaflet);

            window.spatialPreviewTargetGroup = L.featureGroup().addTo(window.spatialPreviewLeaflet);
            window.spatialPreviewRefGroup = L.featureGroup().addTo(window.spatialPreviewLeaflet);
        }

        window.spatialPreviewTargetGroup.clearLayers();
        window.spatialPreviewRefGroup.clearLayers();

        const targetFeats = await window.spatialAnalyticsEngine.getFeaturesForTheme(targetSel.value);
        const refFeats = await window.spatialAnalyticsEngine.getFeaturesForTheme(refSel.value);

        if (targetFeats.length > 0) {
            L.geoJSON(targetFeats.slice(0, 100), {
                style: { color: '#06b6d4', weight: 2, fillColor: '#06b6d4', fillOpacity: 0.3 }
            }).addTo(window.spatialPreviewTargetGroup);
        }

        if (refFeats.length > 0) {
            L.geoJSON(refFeats.slice(0, 100), {
                style: { color: '#a855f7', weight: 2, fillColor: '#a855f7', fillOpacity: 0.3 }
            }).addTo(window.spatialPreviewRefGroup);
        }

        try {
            const allBounds = L.latLngBounds([]);
            if (window.spatialPreviewTargetGroup.getLayers().length > 0) allBounds.extend(window.spatialPreviewTargetGroup.getBounds());
            if (window.spatialPreviewRefGroup.getLayers().length > 0) allBounds.extend(window.spatialPreviewRefGroup.getBounds());
            if (allBounds.isValid()) {
                window.spatialPreviewLeaflet.fitBounds(allBounds, { padding: [15, 15] });
            }
        } catch(e) {}
    };

    window.openSpatialRuleModal = function(ruleId = null) {
        if (window.spatialAnalyticsEngine && typeof window.spatialAnalyticsEngine.ensureSpatialRuleModalDOM === 'function') {
            window.spatialAnalyticsEngine.ensureSpatialRuleModalDOM();
        }
        window.populateSpatialLayerSelects();
        
        const modal = document.getElementById('spatial-rule-modal');
        const idInput = document.getElementById('spatial-rule-id');
        const nameInput = document.getElementById('spatial-rule-name');
        const targetSel = document.getElementById('spatial-target-layer');
        const refSel = document.getElementById('spatial-ref-layer');
        const distInput = document.getElementById('spatial-buffer-dist');
        const calcAreaInput = document.getElementById('spatial-calc-area');

        const rulesList = (window.spatialAnalyticsEngine && window.spatialAnalyticsEngine.rules) || [];

        if (ruleId) {
            const rule = rulesList.find(r => r.id === ruleId);
            if (rule) {
                if (idInput) idInput.value = rule.id;
                if (nameInput) nameInput.value = rule.name || '';
                if (targetSel) targetSel.value = rule.targetLayer || '';
                if (refSel) refSel.value = rule.refLayer || '';
                if (distInput) distInput.value = rule.bufferDist || 1.0;
                if (calcAreaInput) calcAreaInput.checked = (rule.calcArea !== false);
                window.selectSpatialOp(rule.opType || 'intersects');
            }
        } else {
            if (idInput) idInput.value = '';
            if (nameInput) nameInput.value = '';
            if (distInput) distInput.value = 1.0;
            if (calcAreaInput) calcAreaInput.checked = true;
            window.selectSpatialOp('intersects');
        }

        if (modal) modal.classList.remove('hidden');
        setTimeout(() => {
            if (window.spatialPreviewLeaflet) window.spatialPreviewLeaflet.invalidateSize();
            window.updateSpatialPreviewMap();
            window.updateSpatialQuerySummary();
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

        const ruleData = {
            id: 'temp_exec_' + Date.now(),
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

        window.spatialAnalyticsEngine.rules.push(ruleData);
        await window.spatialAnalyticsEngine.runAnalysis(ruleData.id);

        const res = window.spatialAnalyticsEngine.lastAnalysisResult;
        if (res) {
            document.getElementById('kpi-total-target').textContent = res.totalTarget;
            document.getElementById('kpi-matching').textContent = res.totalMatching;
            document.getElementById('kpi-area').textContent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(res.totalOverlayAreaM2);
            
            const pct = res.totalTarget > 0 ? ((res.totalMatching / res.totalTarget) * 100).toFixed(1) + '%' : '0%';
            document.getElementById('kpi-percent').textContent = pct;

            document.getElementById('resumo-target-name').textContent = ruleData.targetLayerName;
            document.getElementById('resumo-ref-name').textContent = ruleData.refLayerName;
            document.getElementById('resumo-op-name').textContent = ruleData.opType.toUpperCase();
            document.getElementById('resumo-datetime').textContent = res.date;

            const tbody = document.getElementById('result-table-body');
            if (tbody) {
                let rowsHtml = '';
                res.matchingFeatures.slice(0, 50).forEach((f, idx) => {
                    const label = (f.properties && (f.properties.nome || f.properties.Lote || f.properties.id || f.properties.name)) || `Feição #${idx+1}`;
                    rowsHtml += `
                        <tr class="hover:bg-slate-800/40">
                            <td class="p-2 font-mono text-slate-500">${idx+1}</td>
                            <td class="p-2 font-bold text-white">${label}</td>
                            <td class="p-2 text-cyan-400 font-semibold">Cruzamento Detectado</td>
                        </tr>
                    `;
                });
                tbody.innerHTML = rowsHtml || `<tr><td colspan="3" class="p-4 text-center text-slate-500 italic">Nenhum cruzamento encontrado.</td></tr>`;
            }

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

    window.renderSpatialResultMap = function(result) {
        const container = document.getElementById('spatial-result-interactive-map');
        if (!container) return;

        if (!window.spatialResultLeaflet) {
            window.spatialResultLeaflet = L.map('spatial-result-interactive-map', {
                attributionControl: false
            }).setView([-7.035, -34.835], 14);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(window.spatialResultLeaflet);
            window.spatialResultGroup = L.featureGroup().addTo(window.spatialResultLeaflet);
        }

        window.spatialResultGroup.clearLayers();
        if (result.matchingFeatures && result.matchingFeatures.length > 0) {
            L.geoJSON(result.matchingFeatures, {
                style: { color: '#06b6d4', weight: 3, fillColor: '#06b6d4', fillOpacity: 0.4 }
            }).addTo(window.spatialResultGroup);

            try {
                const b = window.spatialResultGroup.getBounds();
                if (b.isValid()) window.spatialResultLeaflet.fitBounds(b, { padding: [20, 20] });
            } catch(e) {}
        }
    };

    window.saveCurrentSpatialRule = async function() {
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

        const newRule = {
            id: 'rule_' + Date.now(),
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
            createdAt: new Date().toISOString()
        };

        let currentRules = window.spatialAnalyticsEngine.rules.filter(r => !r.id.startsWith('temp_exec_'));
        currentRules.push(newRule);
        window.spatialAnalyticsEngine.rules = currentRules;

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

        window.spatialAnalyticsEngine.updateMenuBadge();
        window.spatialAnalyticsEngine.renderMenuList();
        alert('✨ Análise salva com sucesso no sistema!');
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
