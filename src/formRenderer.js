// src/formRenderer.js
// MOTOR DE RENDERIZAÇÃO UNIFICADO (100% FIDELIDADE)

/**
 * Renderiza o formulário dinâmico mantendo 100% de fidelidade com o Form Builder.
 * @param {Array} formConfig - Array de abas e campos do schema JSON.
 * @param {Object} featureData - Objeto com as propriedades (properties) da feição atual.
 * @param {Boolean} isEditMode - true se for modo de edição, false para visualização.
 * @param {String} containerId - O ID da div onde o HTML será injetado.
 * @param {Object} options - { isPreview: false, formName: '' }
 */
window.renderDynamicForm = function(formConfig, featureData, isEditMode, containerId, options = {}) {
    if (!formConfig || formConfig.length === 0) return;
    
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!featureData) featureData = {};
    
    // Store current state globally for 1:N handlers
    window.currentFormFeatures = formConfig;
    window.currentFormContainerId = containerId;
    window.currentFormFeatureData = featureData;
    window.currentFormIsEditMode = isEditMode;
    window.currentFormIsPreview = options.isPreview || false;
    window.currentFormEditTabId = options.editTabId || null;

    // Permissão por aba (permissoes_aba): só se aplica a dados reais (não
    // ao preview do form builder em settings.html) e só restringe quando
    // existe mesmo uma linha pra essa aba — quem nunca recebeu restrição
    // continua vendo tudo, como sempre viu.
    const formId = options.formId || null;
    const visibleTabs = (options.isPreview || typeof window.canSeeFormTab !== 'function')
        ? formConfig
        : formConfig.filter(tab => window.canSeeFormTab(formId, tab.id));

    if (visibleTabs.length === 0) {
        container.innerHTML = '<div class="p-4 text-xs text-slate-400 italic text-center">Você não tem permissão para ver nenhuma aba deste formulário.</div>';
        return;
    }

    let html = '<div class="flex flex-col border-t border-slate-200 dark:border-slate-700">';

    let primaryTabId = options.activeTabId || visibleTabs.find(t => t.isPrimary)?.id;
    if (!primaryTabId && visibleTabs.length > 0) primaryTabId = visibleTabs[0].id;

    visibleTabs.forEach((tab) => {
        let isPrimary = tab.id === primaryTabId;
        
        let recordCountHtml = '';
        if (tab.isMultiple) {
            let records = [];
            try {
                records = typeof featureData[tab.id] === 'string' ? JSON.parse(featureData[tab.id]) : (featureData[tab.id] || []);
            } catch(e) { records = []; }
            if (!Array.isArray(records)) records = [];
            
            if (records.length > 0) {
                recordCountHtml = `<span class="ml-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm group-hover:bg-white group-hover:text-emerald-600 transition-colors">${records.length}</span>`;
            }
        }
        
        html += `
            <div class="border-b last:border-b-0 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all accordion-section ${isPrimary ? 'border-l-4 border-l-sky-500 shadow-inner' : ''}" id="acc-section-${tab.id}" ${(tab.condition && tab.condition.enabled && tab.condition.fieldId) ? `data-condition-field="${tab.condition.fieldId}" data-condition-operator="${tab.condition.operator}" data-condition-value="${(tab.condition.value || '').toLowerCase()}"` : ''}>
                <button type="button" onclick="switchDynamicTab('${tab.id}')" class="group w-full px-3 py-3 sm:px-4 sm:py-3.5 flex items-center justify-center ${isPrimary ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold' : 'bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300'} hover:bg-blue-600 dark:hover:bg-blue-600 active:bg-blue-700 dark:active:bg-blue-700 active:scale-95 hover:shadow-[0_0_25px_rgba(59,130,246,0.6)] hover:z-10 relative transition-all duration-300 ease-out overflow-hidden">
                    <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out"></div>
                    <h3 class="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-center transition-all duration-300 group-hover:scale-105 group-hover:tracking-widest relative z-10">
                        ${isPrimary ? '<span class="material-symbols-outlined text-amber-500 group-hover:text-yellow-300 group-hover:drop-shadow-[0_0_8px_rgba(253,224,71,0.8)] transition-all text-[18px]">star</span>' : ''}
                        ${tab.title}
                        ${recordCountHtml}
                    </h3>
                </button>
                
                <div id="acc-content-${tab.id}" class="accordion-content transition-all duration-300 ${isPrimary ? 'block p-4 sm:p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950' : 'hidden'}">
        `;
        
        const canEditThisTab = (options.isPreview || typeof window.canEditFormTab !== 'function') || window.canEditFormTab(formId, tab.id);

        let isTabEditMode = false;
        if (isEditMode) {
            if (window.currentFormEditTabId) {
                isTabEditMode = (tab.id === window.currentFormEditTabId) && canEditThisTab;
            } else {
                isTabEditMode = canEditThisTab;
            }
        }

        const isConsolidated = tab.tabType === 'consolidated' || tab.tabType === 'cross_tabs' || tab.isConsolidated || 
                               tab.title.toUpperCase().includes('HISTÓRICO DE OCUPAÇÃO') || 
                               tab.title.toUpperCase().includes('HISTORICO DE OCUPACAO') || 
                               tab.title.toUpperCase().includes('HISTÓRICO CONSOLIDADO') ||
                               tab.title.toUpperCase().includes('HISTORICO CONSOLIDADO');

        // Render Edit button inside the tab if we are NOT in edit mode (não renderizar em abas de Histórico Consolidado)
        if (!isEditMode && canEditThisTab && !isConsolidated) {
            html += `
            <div class="flex justify-center mb-4">
                <button type="button" onclick="toggleFeatureEditMode('${tab.id}')" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm flex items-center justify-center gap-2 w-full sm:w-auto text-sm">
                    <span class="material-symbols-outlined text-[18px]">edit</span>
                    Editar esta aba
                </button>
            </div>`;
        }

        if (isConsolidated) {
            html += renderConsolidatedHistoryTab(tab, featureData, visibleTabs, isTabEditMode);
        } else if (tab.isMultiple) {
            html += renderMultipleTab(tab, featureData, isTabEditMode);
        } else {
            html += `<div class="flex flex-col gap-2">`;
            if (tab.fields && tab.fields.length > 0) {
                tab.fields.forEach(f => {
                    let value = featureData[f.id];
                    if (value === undefined || value === null || value === '') {
                        if (f.label && featureData[f.label] !== undefined && featureData[f.label] !== null && featureData[f.label] !== '') {
                            value = featureData[f.label];
                        } else if (f.label && featureData[f.label.toUpperCase()] !== undefined && featureData[f.label.toUpperCase()] !== null && featureData[f.label.toUpperCase()] !== '') {
                            value = featureData[f.label.toUpperCase()];
                        } else if (f.label && featureData[f.label.toLowerCase()] !== undefined && featureData[f.label.toLowerCase()] !== null && featureData[f.label.toLowerCase()] !== '') {
                            value = featureData[f.label.toLowerCase()];
                        } else if (f.name && featureData[f.name] !== undefined && featureData[f.name] !== null && featureData[f.name] !== '') {
                            value = featureData[f.name];
                        } else if (f.label) {
                            const normLabel = f.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                            for (const [k, v] of Object.entries(featureData)) {
                                if (v !== undefined && v !== null && v !== '' && typeof v !== 'object') {
                                    const normK = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                                    if (normK === normLabel) {
                                        value = v;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if (value === undefined || value === null) value = '';

                    if (isTabEditMode) {
                        html += `<div>
                            <label class="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">${f.label}</label>
                            ${window.generateFeatureInputHtml ? window.generateFeatureInputHtml(f, value, true) : ''}
                        </div>`;
                    } else {
                        html += `
                        <div class="flex flex-col gap-0.5">
                            <div class="bg-blue-50/50 dark:bg-slate-800/50 border-l-[2px] border-cyan-500 rounded-md px-1.5 py-0.5 w-fit shadow-sm">
                                <span class="text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">${f.label}</span>
                            </div>
                            <div class="border border-dashed border-slate-300/50 dark:border-slate-600/50 rounded-md px-2 py-1 bg-slate-50/30 dark:bg-slate-900/10 min-h-[24px] flex flex-col justify-center">
                                ${window.generateFeatureInputHtml ? window.generateFeatureInputHtml(f, value, false) : ''}
                            </div>
                        </div>`;
                    }
                });
            }
            html += `</div>`;
        }
        
        if (isTabEditMode) {
            html += `
            <div class="mt-6 pt-4 border-t border-slate-200/50 dark:border-slate-700/50 flex flex-col-reverse sm:flex-row justify-end gap-3">
                <button type="button" onclick="cancelFeatureEdit()" class="px-5 py-2.5 bg-slate-100/50 dark:bg-slate-800/50 border border-slate-300/50 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors shadow-sm w-full sm:w-auto text-sm">
                    Cancelar
                </button>
                <button type="button" onclick="saveFeatureData()" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm flex items-center justify-center gap-2 w-full sm:w-auto text-sm">
                    <span class="material-symbols-outlined text-[18px]">save</span> Salvar
                </button>
            </div>`;
        }
        
        html += `
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    // Inject Tab Logic Engine for conditions
    html += `
    <script>
        function evaluateTabConditions() {
            const accordions = document.querySelectorAll('.accordion-section[data-condition-field]');
            accordions.forEach(acc => {
                const triggerFieldId = acc.getAttribute('data-condition-field');
                const operator = acc.getAttribute('data-condition-operator') || 'equals';
                const expectedValue = acc.getAttribute('data-condition-value');
                
                const triggerInput = document.querySelector(\`[data-key="\${triggerFieldId}"]\`) || document.querySelector(\`[id$="\${triggerFieldId}"]\`);
                
                let isMatch = false;
                if (triggerInput) {
                    const val = (triggerInput.value || '').toLowerCase().trim();
                    if (operator === 'equals') {
                        isMatch = (val === expectedValue);
                    } else if (operator === 'not_equals') {
                        isMatch = (val !== expectedValue && val !== '');
                    }
                }
                
                if (isMatch) {
                    acc.style.display = 'block';
                } else {
                    acc.style.display = 'none';
                }
            });
        }
        
        setTimeout(() => {
            const allInputs = document.querySelectorAll('.accordion-content input, .accordion-content select, .accordion-content textarea');
            allInputs.forEach(inp => {
                inp.addEventListener('input', evaluateTabConditions);
                inp.addEventListener('change', evaluateTabConditions);
            });
            evaluateTabConditions();
        }, 100);
    </script>
    `;
    
    container.innerHTML = html;
    
    if (typeof window.evaluateFormCalculations === 'function') {
        window.evaluateFormCalculations(container);
    }
};

// --- DASHBOARD DE HISTÓRICO CONSOLIDADO (SINTÉTICO + ANALÍTICO) ---
window.toggleConsolidatedDetailRow = function(detailId) {
    const el = document.getElementById(detailId);
    const icon = document.getElementById('icon_' + detailId);
    if (!el) return;
    
    if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        if (icon) {
            icon.textContent = 'expand_less';
            icon.classList.add('text-blue-600', 'rotate-180');
        }
    } else {
        el.classList.add('hidden');
        if (icon) {
            icon.textContent = 'expand_more';
            icon.classList.remove('text-blue-600', 'rotate-180');
        }
    }
};

function extractConsolidatedHistoryRecords(tab, featureData, allTabs) {
    const fData = featureData || window.currentFormFeatureData || {};
    const tabsList = allTabs || window.currentFormFeatures || [];
    
    let targetTabs = [];
    if (tab.targetTabIds && Array.isArray(tab.targetTabIds) && tab.targetTabIds.length > 0) {
        targetTabs = tabsList.filter(t => tab.targetTabIds.includes(t.id));
    } else {
        targetTabs = tabsList.filter(t => t.isMultiple && t.id !== tab.id);
    }

    const compiledRecords = [];

    targetTabs.forEach(sourceTab => {
        let records = [];
        if (fData[sourceTab.id]) {
            try {
                records = typeof fData[sourceTab.id] === 'string' ? JSON.parse(fData[sourceTab.id]) : fData[sourceTab.id];
            } catch(e) { records = []; }
        }
        if (!Array.isArray(records)) records = [];

        records.forEach((rec) => {
            if (!rec || typeof rec !== 'object') return;

            let rawDate = '';
            for (const f of (sourceTab.fields || [])) {
                if (f.type === 'date' || f.id.includes('data') || f.label.toLowerCase().includes('data')) {
                    if (rec[f.id]) { rawDate = rec[f.id]; break; }
                }
            }
            if (!rawDate) {
                for (const k of Object.keys(rec)) {
                    if (k.toLowerCase().includes('data') || k.toLowerCase().includes('date')) {
                        rawDate = rec[k]; break;
                    }
                }
            }

            let formattedDate = rawDate || '---';
            let timestamp = -Infinity;
            if (rawDate) {
                if (typeof window.parseDateToTimestamp === 'function') {
                    timestamp = window.parseDateToTimestamp(rawDate);
                } else {
                    timestamp = Date.parse(rawDate) || 0;
                }
                if (rawDate.includes('-')) {
                    const p = rawDate.split('-');
                    if (p.length === 3) formattedDate = `${p[2]}/${p[1]}/${p[0]}`;
                }
            }

            let situacaoOcupacao = '---';
            for (const f of (sourceTab.fields || [])) {
                if (f.label.toLowerCase().includes('situação da ocupação') || f.label.toLowerCase().includes('situacao da ocupacao') || f.label.toLowerCase().includes('ocupação') || f.label.toLowerCase().includes('ocupacao')) {
                    if (rec[f.id] !== undefined && String(rec[f.id]).trim() !== '') {
                        situacaoOcupacao = String(rec[f.id]).trim();
                        break;
                    }
                }
            }

            let situacaoRecuo = '---';
            for (const f of (sourceTab.fields || [])) {
                if (f.label.toLowerCase().includes('recuo')) {
                    if (rec[f.id] !== undefined && String(rec[f.id]).trim() !== '') {
                        situacaoRecuo = String(rec[f.id]).trim();
                        break;
                    }
                }
            }

            let areaInvadida = 0;
            let hasArea = false;
            for (const f of (sourceTab.fields || [])) {
                if (f.label.toLowerCase().includes('área invadida') || f.label.toLowerCase().includes('area invadida') || (f.label.toLowerCase().includes('área') && f.type === 'area_m2')) {
                    if (rec[f.id] !== undefined && rec[f.id] !== '') {
                        areaInvadida = typeof window.getNumericValue === 'function' ? window.getNumericValue(rec[f.id]) : parseFloat(rec[f.id]) || 0;
                        hasArea = true;
                        break;
                    }
                }
            }

            let observacao = '';
            for (const f of (sourceTab.fields || [])) {
                if (f.type === 'textarea' || f.label.toLowerCase().includes('observa') || f.label.toLowerCase().includes('parecer') || f.label.toLowerCase().includes('relato')) {
                    if (rec[f.id]) { observacao = String(rec[f.id]); break; }
                }
            }

            let links = [];
            for (const f of (sourceTab.fields || [])) {
                if (f.type === 'hiperlink' || f.type === 'hiperlink_1n' || f.label.toLowerCase().includes('link')) {
                    const rawL = rec[f.id];
                    if (rawL) {
                        if (Array.isArray(rawL)) {
                            links.push(...rawL);
                        } else if (typeof rawL === 'string' && rawL.startsWith('[')) {
                            try { links.push(...JSON.parse(rawL)); } catch(e) {}
                        } else if (typeof rawL === 'string' && rawL.startsWith('{')) {
                            try { links.push(JSON.parse(rawL)); } catch(e) {}
                        } else if (typeof rawL === 'object') {
                            links.push(rawL);
                        } else if (typeof rawL === 'string' && rawL.trim() !== '') {
                            links.push({ title: f.label, number: '', url: rawL });
                        }
                    }
                }
            }

            compiledRecords.push({
                org: sourceTab.title,
                orgTabId: sourceTab.id,
                rawDate: rawDate,
                formattedDate: formattedDate,
                timestamp: timestamp,
                situacaoOcupacao: situacaoOcupacao,
                situacaoRecuo: situacaoRecuo,
                areaInvadida: areaInvadida,
                hasArea: hasArea,
                observacao: observacao,
                links: links,
                rawRecord: rec
            });
        });
    });

    compiledRecords.sort((a, b) => b.timestamp - a.timestamp);
    return compiledRecords;
}

function getOrgBadgeHtml(org) {
    const o = String(org || '').toUpperCase();
    if (o.includes('PF') || o.includes('POLÍCIA') || o.includes('POLICIA')) {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-300 dark:border-blue-700 shadow-sm"><span class="material-symbols-outlined text-[13px]">local_police</span> ${org}</span>`;
    }
    if (o.includes('SPU') || o.includes('PATRIMÔNIO') || o.includes('PATRIMONIO') || o.includes('FEDERAL')) {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 shadow-sm"><span class="material-symbols-outlined text-[13px]">account_balance</span> ${org}</span>`;
    }
    if (o.includes('MUNIC') || o.includes('PREFEITURA')) {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-sm"><span class="material-symbols-outlined text-[13px]">domain</span> ${org}</span>`;
    }
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-300 dark:border-purple-700 shadow-sm"><span class="material-symbols-outlined text-[13px]">corporate_fare</span> ${org}</span>`;
}

function getStatusBadgeHtml(status) {
    const s = String(status || '').toLowerCase().trim();
    if (!s || s === '---') return '<span class="text-slate-400 opacity-60">---</span>';
    if (s.includes('irregular') || s.includes('invasão') || s.includes('invadido') || s.includes('não conforme')) {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800/60"><span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> ${status}</span>`;
    }
    if (s.includes('regular') || s.includes('conforme') || s.includes('legal')) {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> ${status}</span>`;
    }
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${status}</span>`;
}

function getRecuoBadgeHtml(recuo) {
    const r = String(recuo || '').toLowerCase().trim();
    if (!r || r === '---') return '<span class="text-slate-400 opacity-60">---</span>';
    if (r.includes('já recuou') || r.includes('ja recuou') || r.includes('recuado') || r.includes('sim')) {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"><span class="material-symbols-outlined text-[12px]">check_circle</span> ${recuo}</span>`;
    }
    if (r.includes('não') || r.includes('nao') || r.includes('pendente')) {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"><span class="material-symbols-outlined text-[12px]">warning</span> ${recuo}</span>`;
    }
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">${recuo}</span>`;
}

function renderConsolidatedHistoryTab(tab, featureData, allTabs, isEditMode) {
    const records = extractConsolidatedHistoryRecords(tab, featureData, allTabs);
    const tpl = tab.reportTemplate || {
        title: 'RELATÓRIO CONSOLIDADO DE VISTORIAS & OCUPAÇÃO',
        systemName: 'Sistema de Gestão Territorial',
        showSec1: true,
        sec1Title: '1. Visão Sintética (Quadro Cronológico)',
        sec1Columns: [
            { label: 'Data', fieldKey: 'data' },
            { label: 'Entidade / Órgão', fieldKey: 'org' },
            { label: 'Situação da Ocupação', fieldKey: 'situacao_ocupacao' },
            { label: 'Situação do Recuo', fieldKey: 'situacao_recuo' },
            { label: 'Área Invadida (m²)', fieldKey: 'area_invadida' }
        ],
        showSec2: true,
        sec2Title: '2. Visão Analítica (Linha do Tempo com Observações & Hiperlinks)',
        sec2Fields: ['situacao_ocupacao', 'situacao_recuo', 'area_invadida', 'observacao', 'links'],
        footerText: 'Documento gerado automaticamente pelo Sistema de Gestão e Fiscalização de Obras e Imóveis.'
    };

    const sec1Cols = (tpl.sec1Columns && tpl.sec1Columns.length > 0) ? tpl.sec1Columns : [
        { label: 'Data', fieldKey: 'data' },
        { label: 'Entidade / Órgão', fieldKey: 'org' },
        { label: 'Situação da Ocupação', fieldKey: 'situacao_ocupacao' },
        { label: 'Situação do Recuo', fieldKey: 'situacao_recuo' },
        { label: 'Área Invadida (m²)', fieldKey: 'area_invadida' }
    ];
    const sec2Fields = tpl.sec2Fields || ['situacao_ocupacao', 'situacao_recuo', 'area_invadida', 'observacao', 'links'];

    let html = `
        <div class="flex flex-col gap-6 py-2">
    `;

    if (records.length === 0) {
        html += `
            <div class="text-center py-10 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6">
                <span class="material-symbols-outlined text-slate-400 text-[48px] mb-2 block">folder_off</span>
                <p class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Nenhum Registro Cadastrado</p>
                <p class="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">Cadastre vistorias nas abas (PF, SPU, Município) para que o histórico seja compilado automaticamente aqui.</p>
            </div>
        </div>`;
        return html;
    }

    // 1. VISÃO SINTÉTICA (Tabela Cronológica Expansível com Detalhes Analíticos)
    if (tpl.showSec1 !== false) {
        let thsHtml = '';
        sec1Cols.forEach((col, cIdx) => {
            const align = col.fieldKey === 'area_invadida' ? 'text-right' : 'text-left';
            thsHtml += `<th class="py-2 px-2 text-[10px] sm:text-[11px] font-bold leading-tight break-words ${align}">${col.label || 'Coluna'}</th>`;
        });
        // Coluna extra para o indicador chevron de expansão
        thsHtml += `<th class="w-6 py-2 px-1 text-center"></th>`;

        let rowsHtml = '';
        records.forEach((r, idx) => {
            const areaFmt = r.areaInvadida > 0 ? `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.areaInvadida)} m²` : (r.hasArea ? '0,00 m²' : '---');
            const detailRowId = `cons_detail_${tab.id}_${idx}`;
            
            // Linha Sintética Principal (Clicável para expandir)
            rowsHtml += `
                <tr onclick="toggleConsolidatedDetailRow('${detailRowId}')" class="cursor-pointer hover:bg-blue-50/80 dark:hover:bg-slate-800/80 transition-colors select-none group border-b border-slate-100 dark:border-slate-800">
            `;
            sec1Cols.forEach(col => {
                if (col.fieldKey === 'data') {
                    rowsHtml += `<td class="py-2 px-2 font-semibold text-slate-900 dark:text-white text-[10px] sm:text-[11px] leading-tight break-words"><span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-slate-400 text-[13px]">calendar_month</span> ${r.formattedDate}</span></td>`;
                } else if (col.fieldKey === 'org') {
                    rowsHtml += `<td class="py-2 px-2 text-[10px] sm:text-[11px] leading-tight">${getOrgBadgeHtml(r.org)}</td>`;
                } else if (col.fieldKey === 'situacao_ocupacao') {
                    rowsHtml += `<td class="py-2 px-2 text-[10px] sm:text-[11px] leading-tight">${getStatusBadgeHtml(r.situacaoOcupacao)}</td>`;
                } else if (col.fieldKey === 'situacao_recuo') {
                    rowsHtml += `<td class="py-2 px-2 text-[10px] sm:text-[11px] leading-tight">${getRecuoBadgeHtml(r.situacaoRecuo)}</td>`;
                } else if (col.fieldKey === 'area_invadida') {
                    rowsHtml += `<td class="py-2 px-2 text-right font-mono font-bold text-slate-800 dark:text-slate-200 text-[10px] sm:text-[11px] leading-tight whitespace-nowrap">${areaFmt}</td>`;
                } else {
                    const customVal = (r.rawRecord && r.rawRecord[col.fieldKey] !== undefined) ? r.rawRecord[col.fieldKey] : '---';
                    rowsHtml += `<td class="py-2 px-2 text-slate-700 dark:text-slate-300 text-[10px] sm:text-[11px] leading-tight break-words">${customVal}</td>`;
                }
            });
            rowsHtml += `
                <td class="py-2 px-1 text-center">
                    <span id="icon_${detailRowId}" class="material-symbols-outlined text-[16px] text-slate-400 group-hover:text-blue-600 transition-transform duration-200">expand_more</span>
                </td>
            </tr>`;

            // Linha Expansível com o Detalhamento Analítico Completo
            let linksHtml = '';
            if (sec2Fields.includes('links') && r.links && r.links.length > 0) {
                let linkItemsHtml = '';
                r.links.forEach(link => {
                    const lTitle = link.title || link.name || 'Documento';
                    const lNum = link.number ? link.number : '';
                    const lUrl = link.url || '#';
                    linkItemsHtml += `
                        <div class="p-2 rounded-lg bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200/80 dark:border-sky-800/60 text-xs space-y-0.5 min-w-[200px]">
                            <div class="font-bold text-sky-800 dark:text-sky-200 flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-[13px] text-sky-600">article</span>
                                <span>${lTitle}</span>
                            </div>
                            ${lNum ? `<div class="text-[11px] font-bold text-slate-700 dark:text-slate-300 ml-5">nº ${lNum}</div>` : ''}
                            ${lUrl && lUrl !== '#' ? `
                                <div class="ml-5">
                                    <a href="${lUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 hover:underline font-bold">
                                        <span class="material-symbols-outlined text-[12px]">open_in_new</span> hiperlink
                                    </a>
                                </div>
                            ` : ''}
                        </div>
                    `;
                });

                linksHtml += `
                    <div class="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                        <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[13px]">attachment</span> Documentos & Hiperlinks:
                        </span>
                        <div class="flex flex-col gap-2">
                            ${linkItemsHtml}
                        </div>
                    </div>
                `;
            }

            rowsHtml += `
                <tr id="${detailRowId}" class="hidden bg-slate-50/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-700">
                    <td colspan="${sec1Cols.length + 1}" class="p-3">
                        <div class="bg-white dark:bg-slate-800/90 rounded-lg p-3 border border-slate-200 dark:border-slate-700 shadow-inner space-y-2">
                            <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-1.5">
                                <span class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-indigo-500 text-[15px]">timeline</span> Detalhes da Vistoria (${r.formattedDate} - ${r.org})
                                </span>
                                <span class="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">Área: ${areaFmt}</span>
                            </div>
                            
                            ${sec2Fields.includes('observacao') ? `
                            <div class="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line bg-slate-50 dark:bg-slate-900/40 p-2 rounded border border-slate-100 dark:border-slate-800">
                                <strong class="text-slate-900 dark:text-white block mb-0.5">Relato Técnico / Observações:</strong>
                                ${r.observacao ? r.observacao : '<span class="italic text-slate-400">Nenhuma observação técnica registrada nesta vistoria.</span>'}
                            </div>` : ''}

                            ${linksHtml}
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `
            <div>
                <div class="flex items-center justify-between mb-2 px-1">
                    <div class="flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-sky-600 dark:text-sky-400 text-[18px]">table_rows</span>
                        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">${tpl.sec1Title || '1. Visão Sintética (Quadro Cronológico)'}</h4>
                    </div>
                    <span class="text-[10px] text-slate-400 italic">💡 Clique em uma linha para ver os detalhes</span>
                </div>
                
                <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                    <table class="w-full text-left border-collapse table-auto">
                        <thead class="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                ${thsHtml}
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    html += `
        <!-- Botão Gerar Relatório ao Final -->
        <div class="pt-2 flex justify-center pb-2">
            <button type="button" onclick="exportFeatureHistoryToWord('${tab.id}')" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-2.5 w-full sm:w-auto">
                <span class="material-symbols-outlined text-[20px]">description</span>
                Gerar Relatório
            </button>
        </div>
    </div>`;

    return html;
}

// EXPORTAÇÃO PARA MICROSOFT WORD / GOOGLE DOCS (.DOC / .DOCX FORMATADO)
window.exportFeatureHistoryToWord = function(tabId) {
    const tab = (window.currentFormFeatures || []).find(t => t.id === tabId) || { title: 'Histórico de Ocupação' };
    const featureData = window.currentFormFeatureData || {};
    const records = extractConsolidatedHistoryRecords(tab, featureData, window.currentFormFeatures || []);
    const tpl = tab.reportTemplate || {
        title: 'Relatório Consolidado de Vistorias & Ocupação',
        systemName: 'SISTEMA DE GESTÃO TERRITORIAL',
        showSec1: true,
        sec1Title: '1. QUADRO SINTÉTICO (HISTÓRICO DE OCORRÊNCIAS)',
        sec1Columns: [
            { label: 'DATA', fieldKey: 'data' },
            { label: 'ENTIDADE / ÓRGÃO', fieldKey: 'org' },
            { label: 'SITUAÇÃO OCUPAÇÃO', fieldKey: 'situacao_ocupacao' },
            { label: 'SITUAÇÃO RECUO', fieldKey: 'situacao_recuo' },
            { label: 'ÁREA INVADIDA', fieldKey: 'area_invadida' }
        ],
        showSec2: true,
        sec2Title: '2. RELATÓRIO ANALÍTICO DETALHADO',
        sec2Fields: ['situacao_ocupacao', 'situacao_recuo', 'area_invadida', 'observacao', 'links'],
        footerText: 'Documento gerado automaticamente pelo Sistema de Gestão e Fiscalização de Obras e Imóveis'
    };

    const sec1Cols = (tpl.sec1Columns && tpl.sec1Columns.length > 0) ? tpl.sec1Columns : [
        { label: 'DATA', fieldKey: 'data' },
        { label: 'ENTIDADE / ÓRGÃO', fieldKey: 'org' },
        { label: 'SITUAÇÃO OCUPAÇÃO', fieldKey: 'situacao_ocupacao' },
        { label: 'SITUAÇÃO RECUO', fieldKey: 'situacao_recuo' },
        { label: 'ÁREA INVADIDA', fieldKey: 'area_invadida' }
    ];
    const sec2Fields = tpl.sec2Fields || ['situacao_ocupacao', 'situacao_recuo', 'area_invadida', 'observacao', 'links'];

    // Formatador universal de valores para o relatório
    function formatAnyFieldValueForReport(val) {
        if (val === undefined || val === null) return 'Não informado';
        if (typeof val === 'object') {
            if (val.logradouro || val.cep || val.bairro || val.cidade) {
                let parts = [];
                let log = val.logradouro || '';
                if (val.numero && String(val.numero).toLowerCase() !== 'null' && String(val.numero).trim() !== '') log += ', nº ' + val.numero;
                if (val.complemento && String(val.complemento).toLowerCase() !== 'null' && String(val.complemento).trim() !== '') log += ' (' + val.complemento + ')';
                if (log) parts.push(log);
                if (val.bairro && String(val.bairro).toLowerCase() !== 'null' && String(val.bairro).trim() !== '') parts.push(val.bairro);
                if (val.cidade && String(val.cidade).toLowerCase() !== 'null' && String(val.cidade).trim() !== '') parts.push(val.cidade);
                if (parts.length > 0) return parts.join(' - ');
            }
            return JSON.stringify(val);
        }
        
        let strVal = String(val).trim();
        if (strVal === '' || strVal === 'null' || strVal === 'undefined' || strVal === '---') return 'Não informado';
        
        // Decodificar JSON de Endereço/CEP se for string serializada
        if (strVal.startsWith('{') && strVal.endsWith('}')) {
            try {
                const parsed = JSON.parse(strVal);
                if (parsed.logradouro || parsed.cep || parsed.bairro || parsed.cidade) {
                    let parts = [];
                    let log = parsed.logradouro || '';
                    if (parsed.numero && String(parsed.numero).toLowerCase() !== 'null' && String(parsed.numero).trim() !== '') log += ', nº ' + parsed.numero;
                    if (parsed.complemento && String(parsed.complemento).toLowerCase() !== 'null' && String(parsed.complemento).trim() !== '') log += ' (' + parsed.complemento + ')';
                    if (log) parts.push(log);
                    if (parsed.bairro && String(parsed.bairro).toLowerCase() !== 'null' && String(parsed.bairro).trim() !== '') parts.push(parsed.bairro);
                    if (parsed.cidade && String(parsed.cidade).toLowerCase() !== 'null' && String(parsed.cidade).trim() !== '') parts.push(parsed.cidade);
                    if (parts.length > 0) return parts.join(' - ');
                }
            } catch(e) {}
        }
        
        let cleanDigits = strVal.replace(/\D/g, '');
        if (cleanDigits.length === 20) {
            return cleanDigits.replace(/(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})/, "$1-$2.$3.$4.$5.$6");
        }
        
        return strVal;
    }

    // Extrator inteligente e profundo de valores do imóvel
    function getCleanFeatureVal(fieldId, label) {
        if (fieldId && featureData[fieldId] !== undefined && String(featureData[fieldId]).trim() !== '' && String(featureData[fieldId]) !== 'null') {
            return formatAnyFieldValueForReport(featureData[fieldId]);
        }
        
        if (fieldId) {
            for (const [k, v] of Object.entries(featureData)) {
                if (v && (k.toLowerCase() === fieldId.toLowerCase() || k.replace(/\W/g,'').toLowerCase() === fieldId.replace(/\W/g,'').toLowerCase())) {
                    return formatAnyFieldValueForReport(v);
                }
            }
        }

        const keyLower = String(label || '').toLowerCase();
        
        if (keyLower.includes('ipl') || keyLower.includes('ipf') || keyLower.includes('inscri') || keyLower.includes('identifica')) {
            for (const [k, v] of Object.entries(featureData)) {
                if (!v) continue;
                const kL = k.toLowerCase();
                if ((kL.includes('ipl') || kL.includes('ipf') || kL.includes('inscri') || kL.includes('codigo') || kL.includes('identifica')) && String(v).trim() !== '') {
                    return formatAnyFieldValueForReport(v);
                }
            }
            for (const tab of (window.currentFormFeatures || [])) {
                for (const f of (tab.fields || [])) {
                    if (f.type === 'ipl' || f.type === 'ipf' || f.id.toLowerCase().includes('ipl') || f.label.toLowerCase().includes('ipl')) {
                        if (featureData[f.id]) return formatAnyFieldValueForReport(featureData[f.id]);
                    }
                }
            }
        }
        
        if (keyLower.includes('endereço') || keyLower.includes('endereco') || keyLower.includes('logradouro') || keyLower.includes('rua') || keyLower.includes('localiza')) {
            for (const [k, v] of Object.entries(featureData)) {
                if (!v) continue;
                const kL = k.toLowerCase();
                if (kL.includes('endereco') || kL.includes('endereço') || kL.includes('cep') || kL.includes('logradouro') || kL.includes('localizacao')) {
                    const formatted = formatAnyFieldValueForReport(v);
                    if (formatted !== 'Não informado') return formatted;
                }
            }
        }
        
        if (keyLower.includes('propriet') || keyLower.includes('possuidor') || keyLower.includes('respons') || keyLower.includes('nome')) {
            for (const [k, v] of Object.entries(featureData)) {
                if (!v) continue;
                const kL = k.toLowerCase();
                if ((kL.includes('propriet') || kL.includes('possuidor') || kL.includes('respons') || kL.includes('titular') || kL.includes('nome')) && !kL.includes('arquivo') && !kL.includes('sistema')) {
                    return formatAnyFieldValueForReport(v);
                }
            }
        }

        if (keyLower.includes('bairro') || keyLower.includes('municip') || keyLower.includes('cidade')) {
            const b = featureData.bairro || '';
            const m = featureData.municipio || featureData.cidade || '';
            if (b && m) return `${b}, ${m}`;
            return b || m || 'Não informado';
        }

        const cleanLabel = keyLower.replace(/[^a-z0-9]/g, '');
        for (const [k, v] of Object.entries(featureData)) {
            if (!v) continue;
            const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanK && (cleanLabel.includes(cleanK) || cleanK.includes(cleanLabel))) {
                return formatAnyFieldValueForReport(v);
            }
        }

        return 'Não informado';
    }

    // Badges coloridos idênticos ao PDF
    function getDocBadge(val, type) {
        if (!val || val === 'Não informado' || val === '---') return '<span style="color:#64748b; font-size:9pt;">Não informado</span>';
        const str = String(val).trim();
        const strL = str.toLowerCase();
        
        if (type === 'org') {
            if (strL.includes('spu')) return `<span style="background-color:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:8.5pt;">${str}</span>`;
            if (strL.includes('pf')) return `<span style="background-color:#e0f2fe; color:#0284c7; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:8.5pt;">${str}</span>`;
            return `<span style="background-color:#f1f5f9; color:#334155; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:8.5pt;">${str}</span>`;
        }
        
        if (type === 'ocupacao') {
            if (strL.includes('irregular')) return `<span style="background-color:#fee2e2; color:#b91c1c; padding:2px 8px; border-radius:4px; font-weight:500; font-size:8.5pt;">${str}</span>`;
            if (strL.includes('regular')) return `<span style="background-color:#dcfce7; color:#15803d; padding:2px 8px; border-radius:4px; font-weight:500; font-size:8.5pt;">${str}</span>`;
            return `<span style="background-color:#f1f5f9; color:#475569; padding:2px 8px; border-radius:4px; font-size:8.5pt;">${str}</span>`;
        }
        
        if (type === 'recuo') {
            if (strL.includes('não') || strL.includes('nao')) return `<span style="background-color:#fef3c7; color:#b45309; padding:2px 8px; border-radius:4px; font-weight:500; font-size:8.5pt;">${str}</span>`;
            if (strL.includes('já') || strL.includes('ja') || strL.includes('recuou')) return `<span style="background-color:#dcfce7; color:#15803d; padding:2px 8px; border-radius:4px; font-weight:500; font-size:8.5pt;">${str}</span>`;
            return `<span style="background-color:#f1f5f9; color:#475569; padding:2px 8px; border-radius:4px; font-size:8.5pt;">${str}</span>`;
        }
        
        return str;
    }

    // Montar o bloco de identificação do imóvel (Caixa com rótulo em negrito e valor ao lado)
    const mappings = tpl.fieldMappings && tpl.fieldMappings.length > 0 ? tpl.fieldMappings : [
        { label: 'Identificação do Imóvel (IPL):', fieldId: 'ipl' },
        { label: 'Endereço:', fieldId: 'logradouro' },
        { label: 'Proprietário / Responsável:', fieldId: 'proprietario' }
    ];

    let metaBoxHtml = '';
    mappings.forEach((m, mIdx) => {
        const val = getCleanFeatureVal(m.fieldId, m.label);
        const isLast = mIdx === mappings.length - 1;
        let labelFmt = String(m.label || '').trim();
        if (!labelFmt.endsWith(':')) labelFmt += ':';
        metaBoxHtml += `<p style="margin: 0 0 ${isLast ? '0' : '5px'} 0; font-size: 10pt; color: #0f172a;"><strong>${labelFmt}</strong> ${val}</p>`;
    });

    const dataEmissao = new Date().toLocaleDateString('pt-BR');

    // Seção 1 (Word - Tabela Sintética idêntica ao PDF)
    let secao1DocHtml = '';
    if (tpl.showSec1 !== false) {
        let thsHtml = '';
        sec1Cols.forEach(col => {
            const align = col.fieldKey === 'area_invadida' ? 'text-align: right;' : 'text-align: left;';
            const colLabel = String(col.label || '').toUpperCase();
            thsHtml += `<th style="padding: 7px 10px; background-color: #0b1120; color: #ffffff; font-weight: bold; font-size: 8pt; letter-spacing: 0.5px; border: 1px solid #0b1120; ${align}">${colLabel}</th>`;
        });

        let rowsSintetica = '';
        records.forEach((r, idx) => {
            const areaFmt = r.areaInvadida > 0 ? `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.areaInvadida)} m²` : (r.hasArea ? '0,00 m²' : '---');
            const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
            rowsSintetica += `<tr style="background-color: ${rowBg};">`;
            sec1Cols.forEach(col => {
                if (col.fieldKey === 'data') {
                    rowsSintetica += `<td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 9pt; font-weight: bold; color: #0f172a;">${r.formattedDate}</td>`;
                } else if (col.fieldKey === 'org') {
                    rowsSintetica += `<td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">${getDocBadge(r.org, 'org')}</td>`;
                } else if (col.fieldKey === 'situacao_ocupacao') {
                    rowsSintetica += `<td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">${getDocBadge(r.situacaoOcupacao, 'ocupacao')}</td>`;
                } else if (col.fieldKey === 'situacao_recuo') {
                    rowsSintetica += `<td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">${getDocBadge(r.situacaoRecuo, 'recuo')}</td>`;
                } else if (col.fieldKey === 'area_invadida') {
                    rowsSintetica += `<td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; font-size: 9pt; color: #0f172a;">${areaFmt}</td>`;
                } else {
                    const customVal = (r.rawRecord && r.rawRecord[col.fieldKey] !== undefined) ? r.rawRecord[col.fieldKey] : '---';
                    rowsSintetica += `<td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 9pt; color: #0f172a;">${customVal}</td>`;
                }
            });
            rowsSintetica += `</tr>`;
        });

        secao1DocHtml = `
            <h2 style="font-size: 10pt; font-weight: bold; color: #0f172a; margin: 20px 0 8px 0; text-transform: uppercase; letter-spacing: 0.3px;">
                ${tpl.sec1Title || '1. QUADRO SINTÉTICO (HISTÓRICO DE OCORRÊNCIAS)'}
            </h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px;">
                <thead>
                    <tr>
                        ${thsHtml}
                    </tr>
                </thead>
                <tbody>
                    ${rowsSintetica}
                </tbody>
            </table>
        `;
    }

    // Seção 2 (Word - Relatório Analítico idêntico ao PDF)
    let secao2DocHtml = '';
    if (tpl.showSec2 !== false) {
        let relatorioAnalitico = '';
        records.forEach((r, idx) => {
            const areaFmt = r.areaInvadida > 0 ? `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.areaInvadida)} m²` : (r.hasArea ? '0,00 m²' : '---');
            
            let linksList = '';
            if (sec2Fields.includes('links') && r.links && r.links.length > 0) {
                let linkRowsHtml = '';
                r.links.forEach(l => {
                    const lTitle = l.title || l.name || 'Documento';
                    const lNum = l.number ? ` &mdash; ${l.number.toLowerCase().includes('nº') || l.number.toLowerCase().includes('no') ? l.number : 'nº ' + l.number}` : '';
                    const lUrl = l.url || '#';
                    linkRowsHtml += `
                        <table style="width: 100%; border-collapse: collapse; margin-top: 4px;">
                            <tr>
                                <td style="font-size: 9pt; color: #334155; vertical-align: middle;">
                                    &bull; <strong>${lTitle}</strong>${lNum ? ` <span style="color:#0f172a; font-weight:bold;">${lNum}</span>` : ''}
                                </td>
                                <td style="text-align: right; vertical-align: middle; white-space: nowrap;">
                                    ${lUrl && lUrl !== '#' ? `
                                        <a href="${lUrl}" target="_blank" style="display: inline-block; background-color: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd; padding: 2px 8px; border-radius: 4px; font-size: 8pt; font-weight: bold; text-decoration: none;">
                                            Acessar Link &#8599;
                                        </a>
                                    ` : ''}
                                </td>
                            </tr>
                        </table>
                    `;
                });

                linksList = `
                    <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #f1f5f9;">
                        <span style="font-size: 7.5pt; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">
                            DOCUMENTOS & HIPERLINKS ANEXADOS
                        </span>
                        ${linkRowsHtml}
                    </div>
                `;
            }

            relatorioAnalitico += `
                <div style="margin-bottom: 16px; border: 1px solid #e2e8f0; border-top: 3px solid #0284c7; border-radius: 4px; background-color: #ffffff; padding: 12px 14px;">
                    <!-- Cabeçalho do Card (Data + Órgão à esquerda | Área Invadida à direita) -->
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
                        <tr>
                            <td style="vertical-align: middle;">
                                <span style="font-size: 10pt; font-weight: bold; color: #0f172a; margin-right: 8px;">${r.formattedDate}</span>
                                <span style="background-color: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 8.5pt;">
                                    Órgão: ${r.org}
                                </span>
                            </td>
                            <td style="text-align: right; vertical-align: middle; font-size: 9pt; color: #64748b;">
                                Área Invadida: <strong style="color: #0f172a; font-size: 9.5pt;">${areaFmt}</strong>
                            </td>
                        </tr>
                    </table>

                    <!-- Status e Recuo com Badges -->
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
                        <tr>
                            <td style="width: 50%; font-size: 9pt; color: #475569;">
                                Situação da Ocupação: &nbsp;${getDocBadge(r.situacaoOcupacao, 'ocupacao')}
                            </td>
                            <td style="width: 50%; font-size: 9pt; color: #475569;">
                                Situação do Recuo: &nbsp;${getDocBadge(r.situacaoRecuo, 'recuo')}
                            </td>
                        </tr>
                    </table>

                    <!-- Observações / Relato Técnico -->
                    ${sec2Fields.includes('observacao') ? `
                    <div style="margin-top: 8px; margin-bottom: 6px;">
                        <span style="font-size: 7.5pt; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">
                            OBSERVAÇÕES / RELATO TÉCNICO
                        </span>
                        <p style="margin: 0; font-size: 9pt; color: #334155; line-height: 1.4;">
                            ${r.observacao ? r.observacao.replace(/\n/g, '<br>') : '<span style="color:#94a3b8; font-style:italic;">Nenhuma observação técnica registrada.</span>'}
                        </p>
                    </div>` : ''}

                    <!-- Documentos & Hiperlinks -->
                    ${linksList}
                </div>
            `;
        });

        secao2DocHtml = `
            <h2 style="font-size: 10pt; font-weight: bold; color: #0f172a; margin: 22px 0 10px 0; text-transform: uppercase; letter-spacing: 0.3px;">
                ${tpl.sec2Title || '2. RELATÓRIO ANALÍTICO DETALHADO'}
            </h2>
            ${relatorioAnalitico}
        `;
    }

    const docContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset="utf-8">
            <title>${tpl.title || 'Relatório Consolidado de Vistorias & Ocupação'}</title>
            <style>
                @page {
                    size: A4;
                    margin: 15mm 15mm 15mm 15mm;
                }
                body {
                    font-family: 'Segoe UI', 'Arial', sans-serif;
                    font-size: 9.5pt;
                    color: #0f172a;
                    line-height: 1.35;
                    background-color: #ffffff;
                }
                h1 {
                    font-size: 15pt;
                    font-weight: bold;
                    color: #0b1c3d;
                    text-align: center;
                    margin: 12px 0 4px 0;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    line-height: 1.25;
                }
                h2 {
                    font-size: 10pt;
                    font-weight: bold;
                    color: #0f172a;
                    text-transform: uppercase;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                a {
                    color: #0284c7;
                    text-decoration: none;
                }
            </style>
        </head>
        <body>
            <!-- Subtítulo Superior Topo Direito -->
            <div style="text-align: right; font-size: 9pt; color: #64748b; font-style: italic; margin-bottom: 8px;">
                ${tpl.systemName || 'Sistema de Gestão Territorial'}
            </div>

            <!-- Título Principal Centralizado -->
            <h1>${tpl.title || 'RELATÓRIO CONSOLIDADO DE VISTORIAS &<br>OCUPAÇÃO'}</h1>
            <p style="text-align: center; font-size: 9.5pt; color: #334155; margin: 0 0 16px 0;">
                Emissão: ${dataEmissao} &nbsp;|&nbsp; ${tpl.systemName || 'Sistema de Gestão Territorial'}
            </p>

            <!-- Quadro de Identificação do Imóvel -->
            <div style="border: 1px solid #cbd5e1; background-color: #ffffff; padding: 10px 14px; margin-bottom: 20px; font-size: 10pt; line-height: 1.5;">
                ${metaBoxHtml}
            </div>

            ${secao1DocHtml}
            ${secao2DocHtml}

            <!-- Rodapé Oficial Discreto -->
            <div style="text-align: center; font-size: 8pt; color: #94a3b8; margin-top: 25px; border-top: 1px solid #f1f5f9; padding-top: 6px;">
                ${tpl.footerText || 'Documento gerado automaticamente pelo Sistema de Gestão e Fiscalização de Obras e Imóveis'} &bull; Página 1 de 1
            </div>
        </body>
        </html>
    `;

    const blob = new Blob(['\ufeff', docContent], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const docTitleClean = String(tpl.title || 'Relatorio_Consolidado').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 35);
    link.download = `${docTitleClean}_${new Date().toISOString().slice(0,10)}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// Abaixo vamos colocar funções auxiliares de 1:N que a interface precisa
function renderMultipleTab(tab, featureData, isEditMode) {
    let records = [];
    try {
        records = typeof featureData[tab.id] === 'string' ? JSON.parse(featureData[tab.id]) : (featureData[tab.id] || []);
    } catch(e) { records = []; }
    if (!Array.isArray(records)) records = [];
    
    // Identifica os campos que devem aparecer no resumo da tabela
    let summaryFields = (tab.fields || []).filter(f => f.showInSummary);
    if (summaryFields.length === 0 && tab.fields && tab.fields.length > 0) {
        summaryFields = tab.fields.slice(0, 2);
    }
    
    const totalCols = summaryFields.length + (isEditMode ? 1 : 0);

    // Formata o valor exibido na célula da tabela de resumo
    function formatSummaryCellValue(field, rawVal) {
        if (rawVal === undefined || rawVal === null || rawVal === '') return '<span class="text-slate-400 opacity-60">---</span>';
        
        try {
            if (field.type === 'photo' || field.type === 'attachment') {
                const arr = Array.isArray(rawVal) ? rawVal : (typeof rawVal === 'string' && rawVal.startsWith('[') ? JSON.parse(rawVal) : (rawVal ? [rawVal] : []));
                if (arr.length === 0) return '<span class="text-slate-400 opacity-60">0 anexos</span>';
                return `<span class="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium"><span class="material-symbols-outlined text-[14px]">${field.type === 'photo' ? 'photo_camera' : 'attach_file'}</span> ${arr.length} ${arr.length === 1 ? 'item' : 'itens'}</span>`;
            }
            if (field.type === 'hiperlink' || field.type === 'hiperlink_1n') {
                let linkObj = typeof rawVal === 'string' && rawVal.startsWith('{') ? JSON.parse(rawVal) : { title: rawVal };
                return linkObj.title || linkObj.number || String(rawVal);
            }
            if (field.type === 'date' && typeof rawVal === 'string' && rawVal.includes('-')) {
                const parts = rawVal.split('-');
                if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            if (typeof rawVal === 'string' && (rawVal.startsWith('[') || rawVal.startsWith('{'))) {
                let parsed = JSON.parse(rawVal);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].title || parsed[0].name || 'Anexo';
                if (parsed.title || parsed.name) return parsed.title || parsed.name;
            }
        } catch(e) {}

        let str = String(rawVal);
        if (str.length > 40) str = str.substring(0, 40) + '...';
        return str;
    }

    let html = `
        <!-- 1:N Table View -->
        <div id="multiple-table-view-${tab.id}">
            <div class="flex justify-between items-center mb-4">
                <h4 class="text-sm font-bold text-slate-700 dark:text-slate-300">${isEditMode ? 'Gerenciar Registros' : 'Histórico de Registros'}</h4>
                ${isEditMode ? `
                <button type="button" onclick="toggleMultipleForm('${tab.id}', true)" class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm font-medium shadow-sm">
                    <span class="material-symbols-outlined text-[18px]">add</span> Novo Registro
                </button>` : ''}
            </div>
            
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm overflow-x-auto">
                <table class="w-full text-left text-xs sm:text-sm">
                    <thead class="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                        <tr>
                            ${summaryFields.map(f => `<th class="px-4 py-3">${f.label || f.name || 'Campo'}</th>`).join('')}
                            ${isEditMode ? '<th class="px-4 py-3 text-right">Ações</th>' : ''}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200 dark:divide-slate-700" id="multiple-table-body-${tab.id}">
    `;
    
    if (records.length === 0) {
        html += `<tr id="empty-row-${tab.id}"><td colspan="${totalCols}" class="px-4 py-6 text-center text-slate-500 italic">Nenhum registro encontrado.</td></tr>`;
    } else {
        records.forEach((rec, idx) => {
            html += `
                <tr class="bg-white even:bg-slate-50/50 dark:bg-slate-900 dark:even:bg-slate-800/40 hover:!bg-blue-50/80 dark:hover:!bg-blue-900/30 active:!bg-blue-100 dark:active:!bg-blue-900/50 transition-all duration-200 cursor-pointer" onclick="viewMultipleRecord('${tab.id}', ${idx})">
                    ${summaryFields.map((f, fIdx) => {
                        const cellVal = formatSummaryCellValue(f, rec[f.id] !== undefined ? rec[f.id] : rec[f.name]);
                        const isFirst = (fIdx === 0);
                        return `<td class="px-4 py-3 ${isFirst ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-700 dark:text-slate-300'}">${cellVal}</td>`;
                    }).join('')}
                    ${isEditMode ? `
                    <td class="px-4 py-3 text-right whitespace-nowrap" onclick="event.stopPropagation()">
                        <div class="flex items-center justify-end gap-1">
                            <button type="button" onclick="editMultipleRecord('${tab.id}', ${idx})" class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/20 rounded transition-colors" title="Editar"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                            <button type="button" onclick="deleteMultipleRecord('${tab.id}', ${idx})" class="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Excluir"><span class="material-symbols-outlined text-[18px]">delete</span></button>
                        </div>
                    </td>
                    ` : ''}
                </tr>
            `;
        });
    }
    
    html += `
                    </tbody>
                </table>
            </div>
            <input type="hidden" data-key="${tab.id}" id="multiple-data-${tab.id}" class="feature-data-input" value="${JSON.stringify(records).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">
        </div>
        
        <!-- 1:N Inline Form View -->
        <div id="multiple-form-view-${tab.id}" class="hidden">
            <div class="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
                <button type="button" onclick="toggleMultipleForm('${tab.id}', false)" class="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <span class="material-symbols-outlined">arrow_back</span>
                </button>
                <h4 class="text-base font-bold text-slate-800 dark:text-slate-100">Criar Novo Registro</h4>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-5" id="multiple-form-inputs-${tab.id}">
    `;
    
    if (tab.fields && tab.fields.length > 0) {
        tab.fields.forEach(f => {
            html += `<div class="${['textarea', 'attachment', 'photo', 'geolocation', 'cep', 'hiperlink', 'hiperlink_1n', 'table_join'].includes(f.type) ? 'md:col-span-2' : ''}">
                <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">${f.label}</label>
                ${window.generateFeatureInputHtml ? window.generateFeatureInputHtml(f, '', true, true) : ''}
            </div>`;
        });
    }
    
    html += `
            </div>
            <div class="mt-6 flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-700 mobile-sticky-bottom">
                <button type="button" onclick="toggleMultipleForm('${tab.id}', false)" class="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-md font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm shadow-sm">Cancelar</button>
                <button type="button" onclick="saveMultipleRecord('${tab.id}')" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors text-sm shadow-sm flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">save</span> Salvar Registro</button>
            </div>
        </div>
    `;
    
    return html;
}

window.switchDynamicTab = function(tabId) {
    const content = document.getElementById('acc-content-' + tabId);
    const isAlreadyOpen = content && !content.classList.contains('hidden');

    document.querySelectorAll('.accordion-content').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('block', 'p-4', 'sm:p-5', 'border-t', 'border-slate-200', 'dark:border-slate-700', 'bg-slate-100', 'dark:bg-slate-950');
    });
    
    document.querySelectorAll('.accordion-section').forEach(el => {
        el.classList.remove('border-l-4', 'border-l-sky-500', 'shadow-inner');
        const btn = el.querySelector('button');
        if (btn) {
            btn.classList.remove('bg-white', 'dark:bg-slate-800', 'text-blue-600', 'dark:text-blue-400', 'font-bold');
            btn.classList.add('bg-slate-50', 'dark:bg-slate-900/40', 'text-slate-700', 'dark:text-slate-300');
        }
    });
    
    if (content && !isAlreadyOpen) {
        window.currentActiveTabId = tabId;
        content.classList.remove('hidden');
        content.classList.add('block', 'p-4', 'sm:p-5', 'border-t', 'border-slate-200', 'dark:border-slate-700', 'bg-slate-100', 'dark:bg-slate-950');
        
        const section = document.getElementById('acc-section-' + tabId);
        if (section) {
            section.classList.add('border-l-4', 'border-l-sky-500', 'shadow-inner');
            const btn = section.querySelector('button');
            if (btn) {
                btn.classList.remove('bg-slate-50', 'dark:bg-slate-900/40', 'text-slate-700', 'dark:text-slate-300');
                btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-blue-600', 'dark:text-blue-400', 'font-bold');
            }
            setTimeout(() => {
                section.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    } else {
        window.currentActiveTabId = null;
    }
};

window.toggleMultipleForm = function(tabId, showForm) {
    const tableView = document.getElementById('multiple-table-view-' + tabId);
    const formView = document.getElementById('multiple-form-view-' + tabId);
    
    if (showForm) {
        tableView.classList.add('hidden');
        formView.classList.remove('hidden');
        
        // Reset subform
        const tab = window.currentFormFeatures ? window.currentFormFeatures.find(f => f.id === tabId) : null;
        if (tab && tab.fields) {
            const subformContainer = formView.querySelector('#multiple-form-inputs-' + tabId);
            if (subformContainer) {
                subformContainer.innerHTML = tab.fields.map(f => {
                    return `<div class="${['textarea', 'attachment', 'photo', 'geolocation', 'cep', 'hiperlink', 'hiperlink_1n', 'table_join'].includes(f.type) ? 'md:col-span-2' : ''}">
                        <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">${f.label}</label>
                        ${typeof generateFeatureInputHtml !== 'undefined' ? generateFeatureInputHtml(f, '', true, true) : ''}
                    </div>`;
                }).join('');
            }
        }
        
        formView.removeAttribute('data-edit-index');
        const titleEl = formView.querySelector('h4');
        if (titleEl && tab) titleEl.innerText = 'Novo Registro em ' + tab.title;
        
        const saveBtn = formView.querySelector('button[onclick^="saveMultipleRecord"]');
        if (saveBtn) saveBtn.style.display = 'inline-flex';
    } else {
        formView.classList.add('hidden');
        tableView.classList.remove('hidden');
    }
};

window.editMultipleRecord = function(tabId, idx, readonly = false) {
    const hiddenDataInput = document.getElementById('multiple-data-' + tabId);
    let records = [];
    try { records = JSON.parse(hiddenDataInput.value); } catch(e){}
    
    const record = records[idx];
    if (!record) return;
    
    const tableView = document.getElementById('multiple-table-view-' + tabId);
    const formView = document.getElementById('multiple-form-view-' + tabId);
    
    tableView.classList.add('hidden');
    formView.classList.remove('hidden');
    
    const tab = window.currentFormFeatures ? window.currentFormFeatures.find(f => f.id === tabId) : null;
    if (tab && tab.fields) {
        const subformContainer = formView.querySelector('#multiple-form-inputs-' + tabId);
        if (subformContainer) {
            subformContainer.innerHTML = tab.fields.map(f => {
                return `<div class="${['textarea', 'attachment', 'photo', 'geolocation', 'cep', 'hiperlink', 'hiperlink_1n', 'table_join'].includes(f.type) ? 'md:col-span-2' : ''}">
                    <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">${f.label}</label>
                    ${typeof generateFeatureInputHtml !== 'undefined' ? generateFeatureInputHtml(f, record[f.id] || '', !readonly, true) : ''}
                </div>`;
            }).join('');
        }
        
        const titleEl = formView.querySelector('h4');
        if (titleEl) {
            titleEl.innerText = readonly ? 'Visualizar Registro: ' + tab.title : 'Editar Registro: ' + tab.title;
        }
    }
    
    const actionButtonsContainer = formView.querySelector('.mobile-sticky-bottom');
    if (readonly) {
        formView.removeAttribute('data-edit-index'); // don't save view
        if (actionButtonsContainer) actionButtonsContainer.style.display = 'none';
    } else {
        formView.setAttribute('data-edit-index', idx);
        if (actionButtonsContainer) actionButtonsContainer.style.display = 'flex';
    }
};

window.viewMultipleRecord = function(tabId, idx) {
    window.editMultipleRecord(tabId, idx, true);
};

window.saveMultipleRecord = function(tabId) {
    const formView = document.getElementById('multiple-form-view-' + tabId);
    // Find all inputs in the subform
    const inputs = formView.querySelectorAll('.feature-data-input-subform, .feature-data-input'); 
    
    let newRecord = { _created_at: new Date().toISOString() };
    inputs.forEach(inp => {
        const key = inp.getAttribute('data-key');
        if(key && key !== tabId) newRecord[key] = inp.value;
    });
    
    const hiddenDataInput = document.getElementById('multiple-data-' + tabId);
    let records = [];
    try { records = JSON.parse(hiddenDataInput.value); } catch(e){}
    
    const editIndex = formView.getAttribute('data-edit-index');
    if (editIndex !== null && editIndex !== '') {
        const idx = parseInt(editIndex, 10);
        if (!isNaN(idx) && records[idx]) {
            newRecord._created_at = records[idx]._created_at || newRecord._created_at;
            records[idx] = newRecord;
        } else {
            records.push(newRecord);
        }
    } else {
        records.push(newRecord);
    }
    
    hiddenDataInput.value = JSON.stringify(records);
    
    if (window.currentFormFeatureData) {
        window.currentFormFeatureData[tabId] = JSON.stringify(records);
    }
    
    // Instead of appending a row, just re-render the whole dynamic form to keep it simple and clean
    if (typeof window.renderDynamicForm === 'function' && window.currentFormContainerId) {
        window.renderDynamicForm(window.currentFormFeatures, window.currentFormFeatureData, window.currentFormIsEditMode, window.currentFormContainerId, { isPreview: window.currentFormIsPreview, activeTabId: tabId });
    } else {
        toggleMultipleForm(tabId, false);
    }
};

window.deleteMultipleRecord = function(tabId, idx) {
    if(!confirm("Deseja realmente remover este registro?")) return;
    
    const hiddenDataInput = document.getElementById('multiple-data-' + tabId);
    let records = [];
    try { records = JSON.parse(hiddenDataInput.value); } catch(e){}
    
    records.splice(idx, 1);
    hiddenDataInput.value = JSON.stringify(records);
    
    if(window.currentFormFeatureData) {
        window.currentFormFeatureData[tabId] = JSON.stringify(records);
    }
    
    if (typeof window.renderDynamicForm === 'function' && window.currentFormContainerId) {
        window.renderDynamicForm(window.currentFormFeatures, window.currentFormFeatureData, window.currentFormIsEditMode, window.currentFormContainerId, { isPreview: window.currentFormIsPreview, activeTabId: tabId });
    } else {
        const tbody = document.getElementById('multiple-table-body-' + tabId);
        if (tbody && tbody.children[idx]) {
            tbody.children[idx].style.display = 'none';
        }
        if (typeof window.evaluateFormCalculations === 'function') {
            const container = document.getElementById(window.currentFormContainerId) || document.body;
            window.evaluateFormCalculations(container);
        }
    }
};
