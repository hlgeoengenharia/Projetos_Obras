// src/spatialAnalytics.js
// MOTOR DE GEOESTATÍSTICA ESPACIAL CRUZADA (INTERSEÇÃO, CONFRONTAÇÃO, BUFFER)

(function() {
    class SpatialAnalyticsManager {
        constructor() {
            this.rules = [];
            this.activeRuleId = null;
            this.highlightLayer = null;
            this.referenceHighlightLayer = null;
            this.originalLayerStyles = new Map();
            this.isMenuOpen = false;
        }

        init() {
            this.loadRules();
            this.renderFloatingMenu();
            console.log('✅ SpatialAnalyticsManager inicializado.');
        }

        async loadRules() {
            const munId = sessionStorage.getItem('municipio_ativo') || 'default';
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
                    <button onclick="window.spatialAnalyticsEngine.closeMenu()" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                        <span class="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>
                <div id="spatial-menu-items" class="p-3 max-h-[60vh] overflow-y-auto flex flex-col gap-2">
                    <!-- Javascript irá preencher os itens -->
                </div>
            `;

            document.body.appendChild(menu);
        }

        renderMenuList() {
            const container = document.getElementById('spatial-menu-items');
            if (!container) return;

            if (this.rules.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-6 text-slate-400">
                        <span class="material-symbols-outlined text-3xl mb-1 opacity-50">hub</span>
                        <p class="text-xs">Nenhuma regra de estatística cadastrada.</p>
                        <a href="settings.html?tab=estatistica" class="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline">
                            <span class="material-symbols-outlined text-[14px]">settings</span> Configurar no Painel
                        </a>
                    </div>
                `;
                return;
            }

            const opIcons = {
                'intersects': 'content_cut',
                'touches': 'handshake',
                'buffer': 'radar',
                'within': 'all_inbox'
            };

            let html = '';
            this.rules.forEach(rule => {
                const isActive = (this.activeRuleId === rule.id);
                const icon = opIcons[rule.opType] || 'hub';

                html += `
                    <button type="button" onclick="window.spatialAnalyticsEngine.toggleRule('${rule.id}')" class="w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${isActive ? 'bg-cyan-500/10 dark:bg-cyan-950/40 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'}">
                        <div class="flex items-center gap-2.5 overflow-hidden">
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
                        <div class="shrink-0 flex items-center">
                            <span class="material-symbols-outlined text-[20px] ${isActive ? 'text-cyan-500' : 'text-slate-400 opacity-60'}">
                                ${isActive ? 'radio_button_checked' : 'radio_button_unchecked'}
                            </span>
                        </div>
                    </button>
                `;
            });

            container.innerHTML = html;
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

            this.clearActiveAnalysis(false); // Limpa anterior sem fechar painel
            this.activeRuleId = ruleId;

            // Busca as feições no estado global do Leaflet / window.themes
            const allThemes = window.themes || [];
            
            // Localiza a camada alvo e a de referência
            let targetFeatures = [];
            let refFeatures = [];

            allThemes.forEach(t => {
                if (t.id === rule.targetLayer || t.name === rule.targetLayer || t.name === rule.targetLayerName) {
                    if (t.geojson && t.geojson.features) targetFeatures = t.geojson.features;
                }
                if (t.id === rule.refLayer || t.name === rule.refLayer || t.name === rule.refLayerName) {
                    if (t.geojson && t.geojson.features) refFeatures = t.geojson.features;
                }
            });

            // Se não encontrou no window.themes, tenta buscar nas camadas carregadas do mapa
            if (targetFeatures.length === 0 && window.map) {
                window.map.eachLayer(l => {
                    if (l.feature && !targetFeatures.includes(l.feature)) {
                        targetFeatures.push(l.feature);
                    }
                });
            }

            if (targetFeatures.length === 0 || refFeatures.length === 0) {
                // Se faltar alguma camada, avisa amigavelmente
                this.showResultCard(rule, 0, 0, 'Certifique-se de que ambas as camadas estão ativadas no mapa para a análise.');
                return;
            }

            // Execução da análise topológica via Turf.js
            let matchingFeatures = [];
            let totalOverlayAreaM2 = 0;

            // Prepara a geometria unificada de referência para alta performance
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

            // Se for buffer, gera o buffer da referência
            let bufferGeom = null;
            if (rule.opType === 'buffer' && combinedRef) {
                try {
                    const distKm = (rule.bufferDist || 30) / 1000;
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
                                if (rule.calcArea && (tFeat.geometry.type === 'Polygon' || tFeat.geometry.type === 'MultiPolygon') && (rFeat.geometry.type === 'Polygon' || rFeat.geometry.type === 'MultiPolygon')) {
                                    try {
                                        const intersection = turf.intersect(tFeat, rFeat);
                                        if (intersection) {
                                            totalOverlayAreaM2 += turf.area(intersection);
                                        }
                                    } catch(eArea) {}
                                }
                                break;
                            }
                        }
                    } else if (rule.opType === 'touches') {
                        for (const rFeat of refFeatures) {
                            if (turf.booleanTouches(tFeat, rFeat) || turf.booleanIntersects(tFeat, rFeat)) {
                                isMatch = true;
                                break;
                            }
                        }
                    } else if (rule.opType === 'buffer' && bufferGeom) {
                        if (turf.booleanIntersects(tFeat, bufferGeom)) {
                            isMatch = true;
                        }
                    } else if (rule.opType === 'within') {
                        for (const rFeat of refFeatures) {
                            if (turf.booleanWithin(tFeat, rFeat) || turf.booleanPointInPolygon(tFeat, rFeat)) {
                                isMatch = true;
                                break;
                            }
                        }
                    }
                } catch(eEval) {
                    console.warn('Erro ao avaliar feição espacial:', eEval);
                }

                if (isMatch) {
                    matchingFeatures.push(tFeat);
                }
            });

            // Aplica highlight vibrante no mapa Leaflet
            this.applyMapHighlight(rule, matchingFeatures, bufferGeom);
            this.showResultCard(rule, matchingFeatures.length, totalOverlayAreaM2);
        }

        applyMapHighlight(rule, matchingFeatures, bufferGeom = null) {
            if (!window.map) return;

            // Remove layers anteriores
            if (this.highlightLayer) {
                window.map.removeLayer(this.highlightLayer);
                this.highlightLayer = null;
            }
            if (this.referenceHighlightLayer) {
                window.map.removeLayer(this.referenceHighlightLayer);
                this.referenceHighlightLayer = null;
            }

            const color = rule.highlightColor || '#06b6d4';

            // Se houver buffer, desenha a área de influência com estilo translúcido
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

            if (matchingFeatures.length > 0) {
                this.highlightLayer = L.geoJSON(matchingFeatures, {
                    style: (feature) => {
                        return {
                            color: color,
                            weight: 4,
                            fillColor: color,
                            fillOpacity: 0.6,
                            className: 'animate-pulse'
                        };
                    },
                    pointToLayer: (feature, latlng) => {
                        return L.circleMarker(latlng, {
                            radius: 9,
                            fillColor: color,
                            color: '#ffffff',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.9,
                            className: 'animate-pulse'
                        });
                    },
                    onEachFeature: (feature, layer) => {
                        if (typeof window.onFeatureClick === 'function') {
                            layer.on('click', () => window.onFeatureClick(feature));
                        }
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

        showResultCard(rule, count, areaM2 = 0, warning = null) {
            let card = document.getElementById('spatial-result-card');
            if (!card) {
                card = document.createElement('div');
                card.id = 'spatial-result-card';
                card.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex flex-col gap-2.5 w-[90%] max-w-md bg-white/95 dark:bg-[#070b14]/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-slate-200/50 dark:border-white/10 p-4 transition-all duration-300 transform';
                document.body.appendChild(card);
            }

            const areaHtml = (rule.calcArea && areaM2 > 0) ? `
                <div class="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-500 font-medium">Área Total Sobreposta:</span>
                    <span class="font-bold text-cyan-600 dark:text-cyan-400 font-mono">${areaM2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</span>
                </div>
            ` : '';

            card.innerHTML = `
                <div class="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div>
                        <span class="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">hub</span> Análise Ativa no Mapa
                        </span>
                        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">${rule.name}</h3>
                    </div>
                    <button onclick="window.spatialAnalyticsEngine.clearActiveAnalysis()" class="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors" title="Desativar">
                        <span class="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                ${warning ? `<p class="text-xs text-amber-500 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200 dark:border-amber-800">${warning}</p>` : ''}

                <div class="flex items-center justify-between px-2">
                    <div class="flex flex-col">
                        <span class="text-[10px] uppercase font-bold text-slate-400">Total Detectado</span>
                        <span class="text-2xl font-black text-slate-900 dark:text-white">${count.toLocaleString('pt-BR')} <span class="text-xs font-normal text-slate-400">feições</span></span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="window.spatialAnalyticsEngine.clearActiveAnalysis()" class="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all">
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
    }

    window.spatialAnalyticsEngine = new SpatialAnalyticsManager();
    document.addEventListener('DOMContentLoaded', () => {
        window.spatialAnalyticsEngine.init();
    });
})();
