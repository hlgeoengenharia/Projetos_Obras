// src/reportBuilder.js
// CONSTRUTOR VISUAL DE RELATÓRIOS GERENCIAIS A4 (DRAG-AND-DROP & ACORDEÃO ESTILO WORD/CANVA)
// Padrão: Processador de Texto Cartográfico com Rigor SIG (Cartographic Precision)
// Consumo 100% Read-Only desacoplado via window.ReportAdapter

(function() {
    'use strict';

    let currentTemplate = null;
    // 'individual' = fichas da feição (Relatórios Gerenciais A4 do cadastro); 'geral' = relatório gerencial da camada inteira
    let builderScope = 'individual';
    let sortableInstance = null;
    let activeAccordionId = 'acc-layout'; // Card 0 aberto por padrão
    window._customUploadedLogoUrl = null;

    /**
     * Inicializa o construtor de relatórios para o formulário selecionado.
     */
    /** Modelos do cadastro que pertencem ao escopo em edição (individual ou geral da camada). */
    function getScopedTemplates(formId) {
        const all = window.ReportAdapter ? window.ReportAdapter.getReportTemplates(formId) : [];
        return (all || []).filter(t => builderScope === 'geral' ? t.tipo === 'geral' : t.tipo !== 'geral');
    }

    /** Dimensões da folha do modelo em edição (A4 ou A3, retrato ou paisagem). */
    function pageDims() {
        const cfg = currentTemplate && currentTemplate.config_pagina;
        if (window.PageSize) return window.PageSize.dims(cfg);
        const land = !!(cfg && cfg.orientacao === 'landscape');
        return { name: 'A4', orient: land ? 'landscape' : 'portrait', widthMm: land ? 297 : 210, heightMm: land ? 210 : 297,
                 widthPx: land ? 1123 : 794, heightPx: land ? 794 : 1123, cssPageSize: 'A4 ' + (land ? 'landscape' : 'portrait'),
                 label: land ? '297 × 210 mm (Paisagem)' : '210 × 297 mm (Retrato)' };
    }

    function initReportBuilderTab(formId, formName = 'Formulário', opts) {
        if (!formId) return;
        if (opts && opts.scope) builderScope = opts.scope === 'geral' ? 'geral' : 'individual';

        const container = document.getElementById('report-builder-container');
        if (!container) return;

        const templates = getScopedTemplates(formId);

        if (templates.length > 0) {
            currentTemplate = JSON.parse(JSON.stringify(templates[0]));
        } else {
            currentTemplate = window.ReportAdapter.createDefaultTemplate(formId, builderScope, formName);
        }

        // Garante configurações padrão completas
        ensureTemplateDefaults();

        // Inicializa colunas padrão para os cards de tabela
        const fields = window.ReportAdapter ? window.ReportAdapter.getFormFields(formId) : [];

        renderBuilderInterface(formId, formName);
    }

    function ensureTemplateDefaults() {
        if (!currentTemplate) return;
        if (!currentTemplate.config_pagina) {
            currentTemplate.config_pagina = {
                tamanho: 'A4',
                orientacao: 'portrait',
                margem_tipo: 'padrao',
                margens: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
                margens_mm: { top: 15, bottom: 15, left: 15, right: 15 }
            };
        }
        if (!currentTemplate.config_pagina.margens_mm) {
            currentTemplate.config_pagina.margens_mm = { top: 15, bottom: 15, left: 15, right: 15 };
        }
        if (typeof currentTemplate.atalho_aba === 'undefined') {
            currentTemplate.atalho_aba = (currentTemplate.tipo === 'individual' ? 'header' : 'none');
        }
        if (typeof currentTemplate.disponibilizar_no_mapa === 'undefined') {
            currentTemplate.disponibilizar_no_mapa = (currentTemplate.atalho_aba !== 'none');
        }
        if (!Array.isArray(currentTemplate.blocos)) {
            currentTemplate.blocos = [];
        }
    }

    /**
     * Renderiza toda a interface do construtor: Barra Superior, Acordeão Lateral e Canvas A4 Word.
     */
    function renderBuilderInterface(formId, formName) {
        const container = document.getElementById('report-builder-container');
        if (!container) return;

        const templates = getScopedTemplates(formId);
        const isGeral = builderScope === 'geral';
        const pd = pageDims();
        // o atalho no popup lista TODAS as abas do cadastro (inclusive a de Relatórios); as demais listas do módulo não
        const formTabs = window.ReportAdapter.getFormTabs ? window.ReportAdapter.getFormTabs(formId, { includeReportsTab: true }) : [];

        container.innerHTML = `
            <div class="flex flex-col gap-6 w-full font-sans">
                <!-- 1. BARRA SUPERIOR DE AÇÕES E VÍNCULO COM O MAPA -->
                <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div class="flex flex-wrap items-center gap-3 flex-1">
                        <!-- Seletor de Modelo -->
                        <div class="flex flex-col min-w-[180px]">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Modelo de Relatório</label>
                            <select id="rpt-select-template" onchange="ReportBuilder.onTemplateChange(this.value)" class="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold dark:text-white focus:ring-2 focus:ring-primary/40 focus:outline-none">
                                ${templates.map(t => `<option value="${t.id}" ${t.id === currentTemplate.id ? 'selected' : ''}>${t.nome} (${t.tipo === 'geral' ? 'Relatório Geral da Camada' : 'Ficha Individual'})</option>`).join('')}
                                <option value="__new__">+ Criar Novo Modelo de Relatório...</option>
                            </select>
                        </div>

                        <!-- Nome do Relatório -->
                        <div class="flex flex-col flex-1 min-w-[200px]">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Nome do Documento</label>
                            <input type="text" id="rpt-template-name" value="${escapeHtml(currentTemplate.nome)}" oninput="ReportBuilder.updateTemplateName(this.value)" class="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold dark:text-white focus:ring-2 focus:ring-primary/40 focus:outline-none" placeholder="Ex: Ficha Cadastral Oficial..." />
                        </div>

                        <!-- VÍNCULO COM O POPUP DO MAPA: EM QUAL ABA EXIBIR O ATALHO (só fichas individuais) -->
                        ${isGeral ? '' : `
                        <div class="flex flex-col min-w-[220px]">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px] text-primary dark:text-sky-400">near_me</span>
                                <span>Atalho no Popup da Feição</span>
                            </label>
                            <select id="rpt-select-atalho-aba" onchange="ReportBuilder.updateAtalhoAba(this.value)" class="px-3 py-2 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 rounded-xl text-xs font-bold text-emerald-900 dark:text-emerald-200 focus:ring-2 focus:ring-emerald-500/40 focus:outline-none">
                                <option value="header" ${currentTemplate.atalho_aba === 'header' ? 'selected' : ''}>📌 Cabeçalho do Card (Topo Geral)</option>
                                <option value="todas" ${currentTemplate.atalho_aba === 'todas' ? 'selected' : ''}>🌐 Em Todas as Abas da Feição</option>
                                ${formTabs.map(tab => `
                                    <option value="${tab.id}" ${currentTemplate.atalho_aba === tab.id ? 'selected' : ''}>📄 Na Aba: ${escapeHtml(tab.title)}</option>
                                `).join('')}
                                <option value="none" ${currentTemplate.atalho_aba === 'none' ? 'selected' : ''}>🚫 Não exibir atalho no mapa</option>
                            </select>
                        </div>
                        `}
                    </div>

                    <!-- Botões de Ação -->
                    <div class="flex items-center gap-2 self-end xl:self-center shrink-0">
                        <div class="flex flex-col">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Folha</label>
                            <div class="inline-flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700" title="Tamanho do papel do relatório">
                                <button type="button" onclick="ReportBuilder.setPageSize('A4')" class="px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${pd.name === 'A4' ? 'bg-primary text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-primary'}">A4</button>
                                <button type="button" onclick="ReportBuilder.setPageSize('A3')" class="px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${pd.name === 'A3' ? 'bg-primary text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-primary'}">A3</button>
                            </div>
                        </div>
                        ${isGeral ? '' : `
                        <button type="button" onclick="ReportBuilder.previewReal()" class="flex items-center gap-1.5 px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer" title="Abre o relatório de verdade (o mesmo da impressão, do PDF e do Word) com uma feição de teste e o modelo como está agora, sem precisar salvar">
                            <span class="material-symbols-outlined text-[18px]">visibility</span>
                            <span>Ver como sairá</span>
                        </button>`}
                        <button type="button" onclick="ReportBuilder.saveCurrentTemplate()" class="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer" title="Salvar Modelo">
                            <span class="material-symbols-outlined text-[18px]">save</span>
                            <span>Salvar Modelo</span>
                        </button>
                        ${templates.length > 1 ? `
                        <button type="button" onclick="ReportBuilder.deleteCurrentTemplate()" class="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-all cursor-pointer" title="Excluir este modelo">
                            <span class="material-symbols-outlined text-[19px]">delete</span>
                        </button>` : ''}
                    </div>
                </div>

                <!-- Grid Principal: Acordeão Lateral (largura fixa otimizada) + Folha Virtual A4 Estilo Word (expande com o espaço disponível) -->
                <div class="flex flex-col lg:flex-row gap-6 items-start w-full">
                    <!-- PAINEL ESQUERDO: ACORDEÃO DE CONFIGURAÇÃO PRÉVIA DOS BLOCOS -->
                    <div class="w-full lg:w-[380px] xl:w-[410px] shrink-0 flex flex-col gap-3" id="accordion-blocks-panel">
                        ${renderAccordionPanel(formId)}
                    </div>

                    <!-- PAINEL DIREITO: FOLHA VIRTUAL A4 (ESTILO WORD / PROCESSADOR DE TEXTO REAL) -->
                    <div class="flex-1 min-w-0 w-full flex flex-col items-center">
                        <!-- Barra de Status e Dica de Edição da Folha -->
                        <div class="w-full mb-3 flex items-center justify-between px-2 text-xs">
                            <div class="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                <span class="material-symbols-outlined text-[17px] text-amber-500">edit_note</span>
                                <span class="font-bold">Folha ${pd.name} Interativa:</span>
                                <span class="text-slate-400 text-[11px]">Dê duplo-clique em qualquer texto da folha para editar</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-[11px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md" id="a4-dimension-indicator">${pd.label}</span>
                            </div>
                        </div>

                        <!-- ESTÚDIO DE DOCUMENTO (DESKTOP CINZA COM RÉGUA E PAPEL BRANCO PURO) -->
                        <div class="w-full bg-slate-200/80 dark:bg-slate-900/90 p-3 sm:p-6 lg:p-8 rounded-2xl border border-slate-300/80 dark:border-slate-800 flex flex-col items-center overflow-x-auto shadow-inner">
                            
                            <!-- RÉGUA HORIZONTAL DE MILÍMETROS (ESTILO WORD) -->
                            <div class="w-full flex justify-center mb-1 select-none pointer-events-none no-print">
                                <div id="a4-horizontal-ruler" class="h-6 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-t-lg relative flex items-end text-[9px] font-mono text-slate-400 overflow-hidden shadow-2xs">
                                    <!-- Injetado via applyA4StageDimensions() -->
                                </div>
                            </div>

                            <!-- PAPEL A4 BRANCO PURO COM CABEÇALHO E RODAPÉ FORA DO CORPO -->
                            <div id="a4-sheet-stage" class="bg-white text-slate-900 relative transition-all duration-200 shadow-[0_10px_30px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)] border border-slate-200/80 flex flex-col">
                                <!-- Linha-Guia Visual de Margem de Impressão (Não sai na impressão) -->
                                <div id="a4-margin-guide" class="pointer-events-none absolute border border-dashed border-sky-400/40 print:hidden z-0"></div>

                                <!-- Slot do Cabeçalho Institucional (Fica fora do corpo, acima da margem superior) -->
                                <div id="a4-header-slot" class="w-full relative z-10 select-none"></div>

                                <!-- Container dos Blocos Reais da Folha (Corpo da Folha, delimitado entre as margens) -->
                                <div id="a4-blocks-list" class="flex flex-col gap-5 w-full relative z-10 flex-1" style="min-height: 100%;">
                                    <!-- Injetado via renderA4Blocks() -->
                                </div>

                                <!-- Slot do Rodapé Oficial Fixo (Fica fora do corpo, abaixo da margem inferior) -->
                                <div id="a4-footer-slot" class="w-full relative z-10 mt-auto select-none"></div>
                            </div>

                            <!-- Indicador Visual de Quebra de Página (Word Page Break) -->
                            <div id="a4-page-break-indicator" class="w-full mt-4 flex items-center justify-center gap-3 text-slate-400 select-none text-[10px] font-mono uppercase tracking-widest no-print">
                                <div class="h-px bg-slate-300 dark:bg-slate-700 flex-1"></div>
                                <span class="flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[14px]">content_cut</span>
                                    <span>Limite Virtual de Quebra de Página (A4)</span>
                                </span>
                                <div class="h-px bg-slate-300 dark:bg-slate-700 flex-1"></div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        `;

        applyA4StageDimensions();
        renderA4Blocks();
        initSortable();
    }

    /**
     * Aplica proporção, régua e margens no Canvas A4 central conforme o Card 0.
     * Sempre preserva a visibilidade total da folha (seja em Retrato ou em Paisagem).
     */
    function applyA4StageDimensions() {
        const stage = document.getElementById('a4-sheet-stage');
        const ruler = document.getElementById('a4-horizontal-ruler');
        const guide = document.getElementById('a4-margin-guide');
        const breakInd = document.getElementById('a4-page-break-indicator');
        const headerSlot = document.getElementById('a4-header-slot');
        const blocksList = document.getElementById('a4-blocks-list');
        const footerSlot = document.getElementById('a4-footer-slot');
        if (!stage || !currentTemplate || !currentTemplate.config_pagina) return;

        const pd = pageDims();
        const orient = pd.orient;
        const mm = currentTemplate.config_pagina.margens_mm || { top: 15, bottom: 15, left: 15, right: 15 };

        // 1mm = aprox 3.78px a 96 DPI
        const scaleFactor = 3.78;
        let widthMm = pd.widthMm;
        let heightMm = pd.heightMm;
        let nominalWidthPx = pd.widthPx; // A4: 794px em retrato, 1123px em paisagem (A3: 1123px / 1588px)
        let nominalHeightPx = pd.heightPx;

        // Folha sempre 100% visível, responsiva e sem cortes laterais:
        stage.style.width = '100%';
        stage.style.maxWidth = `${nominalWidthPx}px`;
        stage.style.boxSizing = 'border-box';
        stage.style.minHeight = (orient === 'landscape') ? `${nominalHeightPx}px` : `${Math.round(nominalHeightPx * 0.935)}px`;
        stage.style.padding = '0';

        const padTop = Math.round(mm.top * scaleFactor);
        const padBot = Math.round(mm.bottom * scaleFactor);
        const padLeft = Math.round(mm.left * scaleFactor);
        const padRight = Math.round(mm.right * scaleFactor);

        // Cabeçalho Institucional: posicionado acima da margem superior do corpo
        if (headerSlot) {
            headerSlot.style.padding = `10px ${padRight}px 0 ${padLeft}px`;
        }

        // Corpo da folha: delimitado pelas margens superior, inferior, esquerda e direita
        if (blocksList) {
            blocksList.style.paddingLeft = `${padLeft}px`;
            blocksList.style.paddingRight = `${padRight}px`;
            blocksList.style.paddingTop = `${Math.max(8, padTop - 12)}px`;
            blocksList.style.paddingBottom = `${Math.max(8, padBot - 12)}px`;
        }

        // Rodapé Oficial: fixo na base inferior abaixo da margem inferior do corpo
        if (footerSlot) {
            footerSlot.style.padding = `0 ${padRight}px 14px ${padLeft}px`;
        }

        // Atualiza a linha-guia de margens (visível no editor)
        if (guide) {
            guide.style.top = `${padTop}px`;
            guide.style.bottom = `${padBot}px`;
            guide.style.left = `${padLeft}px`;
            guide.style.right = `${padRight}px`;
        }

        // Atualiza a régua horizontal (com largura idêntica à folha e limites em percentual)
        if (ruler) {
            ruler.style.width = '100%';
            ruler.style.maxWidth = `${nominalWidthPx}px`;
            let rulerHtml = '';
            const stepMm = 10;
            const totalSteps = Math.floor(widthMm / stepMm);
            for (let i = 0; i <= totalSteps; i++) {
                const curMm = i * stepMm;
                const posPercent = (curMm / widthMm) * 100;
                const isMajor = (curMm % 20 === 0);
                rulerHtml += `
                    <div class="absolute bottom-0 border-l ${isMajor ? 'h-3.5 border-slate-400 dark:border-slate-500' : 'h-2 border-slate-300 dark:border-slate-600'}" style="left: ${posPercent}%;">
                        ${isMajor ? `<span class="absolute -top-3.5 -left-1 text-[8px] font-mono leading-none">${curMm}</span>` : ''}
                    </div>
                `;
            }
            ruler.innerHTML = rulerHtml;
        }

        if (breakInd) {
            breakInd.style.maxWidth = `${nominalWidthPx}px`;
        }

        const indicator = document.getElementById('a4-dimension-indicator');
        if (indicator) {
            indicator.textContent = pd.label;
        }
    }

    /**
     * Renderiza o Painel de Acordeão com os 10 Cards de configuração prévia.
     */
    function renderAccordionPanel(formId) {
        const fields = window.ReportAdapter.getFormFields(formId);
        const charts = window.ReportAdapter.getExistingCharts(formId);
        const formTabs = (window.ReportAdapter && window.ReportAdapter.getFormTabs) ? window.ReportAdapter.getFormTabs(formId) : [];
        const multipleTabs = (window.ReportAdapter && window.ReportAdapter.getMultipleTabs) ? window.ReportAdapter.getMultipleTabs(formId) : [];
        const cfg = currentTemplate.config_pagina;
        const mm = cfg.margens_mm || { top: 15, bottom: 15, left: 15, right: 15 };
        // Relatório Geral (camada inteira): só Cabeçalho, Caixa de texto livre, Gráficos do Dashboard e Rodapé (+ layout da folha)
        const isGeral = builderScope === 'geral';
        const pdPanel = pageDims();

        // Agrupamento ordenado de campos por Aba com inclusão de todas as abas
        const tabGroupsMap = new Map();
        formTabs.forEach(t => {
            tabGroupsMap.set(t.id, {
                id: t.id,
                title: t.title || 'Aba Geral',
                isMultiple: !!t.isMultiple,
                fields: Array.isArray(t.fields) ? [...t.fields] : []
            });
        });
        fields.forEach(f => {
            const tId = f.tabId || 'geral';
            const tTitle = f.tabTitle || 'Aba Geral';
            if (!tabGroupsMap.has(tId)) {
                tabGroupsMap.set(tId, {
                    id: tId,
                    title: tTitle,
                    isMultiple: !!f.isMultiple,
                    fields: []
                });
            }
            const group = tabGroupsMap.get(tId);
            if (!group.fields.some(gf => gf.id === f.id)) {
                group.fields.push(f);
            }
        });
        const tabGroups = Array.from(tabGroupsMap.values());
        const tabsFor1n = tabGroups; // Inclui todas as abas no seletor e nas árvores de campos

        // Sincroniza a sequência das abas 1:N
        if (!Array.isArray(current1nTabOrder) || current1nTabOrder.length === 0) {
            current1nTabOrder = tabsFor1n.map(t => t.id);
        } else {
            tabsFor1n.forEach(t => {
                if (!current1nTabOrder.includes(t.id)) current1nTabOrder.push(t.id);
            });
        }
        const orderedTabs = [...tabsFor1n].sort((a, b) => {
            const idxA = current1nTabOrder.indexOf(a.id);
            const idxB = current1nTabOrder.indexOf(b.id);
            return (idxA >= 0 ? idxA : 999) - (idxB >= 0 ? idxB : 999);
        });

        const existingSynthetic1nBlock = currentTemplate?.blocos?.find(b => b.tipo === 'tabela_sintetica_1n');
        const hasExistingSynthetic1n = !!existingSynthetic1nBlock;
        const activeSyntheticColCount = existingSynthetic1nBlock?.colunas?.length || 0;
        const activeDensity = existingSynthetic1nBlock?.densidade || current1nTableDensity || 'compact';
        const activeStriping = existingSynthetic1nBlock?.zebrado || current1nRowStriping || 'slate';

        const existingAnalytical1nBlock = currentTemplate?.blocos?.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');
        const hasExistingAnalytical1n = !!existingAnalytical1nBlock;
        const activeAnalyticalFieldCount = existingAnalytical1nBlock?.campos_selecionados?.length || 0;
        const activeLaudoDensity = existingAnalytical1nBlock?.densidade || current1nLaudoDensity || current1nTableDensity || 'compact';
        const activeLaudoStriping = existingAnalytical1nBlock?.zebrado || current1nLaudoRowStriping || current1nRowStriping || 'slate';

        return `
            <!-- CARD 0: CONFIGURAÇÃO DA FOLHA (LAYOUT DA PÁGINA) -->
            ${renderAccordionCard({
                id: 'acc-layout',
                title: `Configuração da Folha (Layout ${pdPanel.name})`,
                icon: 'settings_overscan',
                badge: cfg.orientacao === 'landscape' ? 'Paisagem' : 'Retrato',
                content: `
                    <div class="flex flex-col gap-4">
                        <!-- Orientação -->
                        <div class="flex flex-col gap-1.5">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Orientação do Papel</label>
                            <div class="grid grid-cols-2 gap-2">
                                <button type="button" onclick="ReportBuilder.updateOrientation('portrait')" class="flex items-center justify-center gap-1.5 p-2 rounded-xl border text-xs font-bold transition-all ${cfg.orientacao === 'portrait' ? 'bg-primary text-white border-primary shadow-xs' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}">
                                    <span class="material-symbols-outlined text-[16px]">crop_portrait</span>
                                    <span>Retrato (${pdPanel.name === 'A3' ? '297×420' : '210×297'})</span>
                                </button>
                                <button type="button" onclick="ReportBuilder.updateOrientation('landscape')" class="flex items-center justify-center gap-1.5 p-2 rounded-xl border text-xs font-bold transition-all ${cfg.orientacao === 'landscape' ? 'bg-primary text-white border-primary shadow-xs' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}">
                                    <span class="material-symbols-outlined text-[16px]">crop_landscape</span>
                                    <span>Paisagem (${pdPanel.name === 'A3' ? '420×297' : '297×210'})</span>
                                </button>
                            </div>
                        </div>

                        <!-- Margens Preset -->
                        <div class="flex flex-col gap-1.5">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Padrão de Margens</label>
                            <div class="grid grid-cols-3 gap-1.5">
                                <button type="button" onclick="ReportBuilder.setMarginPreset('padrao', 15)" class="py-1.5 px-2 rounded-lg border text-xs font-semibold text-center transition-all ${cfg.margem_tipo === 'padrao' ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600'}">Padrão (15mm)</button>
                                <button type="button" onclick="ReportBuilder.setMarginPreset('estreita', 10)" class="py-1.5 px-2 rounded-lg border text-xs font-semibold text-center transition-all ${cfg.margem_tipo === 'estreita' ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600'}">Estreita (10mm)</button>
                                <button type="button" onclick="ReportBuilder.setMarginPreset('personalizada')" class="py-1.5 px-2 rounded-lg border text-xs font-semibold text-center transition-all ${cfg.margem_tipo === 'personalizada' ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600'}">Personalizada</button>
                            </div>
                        </div>

                        <!-- Inputs de Margens em Milímetros (mm) -->
                        <div class="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-bold text-slate-800 dark:text-slate-200">Margens da Folha</span>
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">Milímetros (mm)</span>
                            </div>
                            <div class="grid grid-cols-4 gap-2 pt-1">
                                <div>
                                    <span class="text-[9px] font-bold uppercase text-slate-400 block mb-1">Superior</span>
                                    <input type="number" min="0" max="60" value="${mm.top}" onchange="ReportBuilder.updateMargin('top', this.value)" class="w-full px-2 py-1.5 text-center text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg" />
                                </div>
                                <div>
                                    <span class="text-[9px] font-bold uppercase text-slate-400 block mb-1">Inferior</span>
                                    <input type="number" min="0" max="60" value="${mm.bottom}" onchange="ReportBuilder.updateMargin('bottom', this.value)" class="w-full px-2 py-1.5 text-center text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg" />
                                </div>
                                <div>
                                    <span class="text-[9px] font-bold uppercase text-slate-400 block mb-1">Esquerda</span>
                                    <input type="number" min="0" max="60" value="${mm.left}" onchange="ReportBuilder.updateMargin('left', this.value)" class="w-full px-2 py-1.5 text-center text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg" />
                                </div>
                                <div>
                                    <span class="text-[9px] font-bold uppercase text-slate-400 block mb-1">Direita</span>
                                    <input type="number" min="0" max="60" value="${mm.right}" onchange="ReportBuilder.updateMargin('right', this.value)" class="w-full px-2 py-1.5 text-center text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg" />
                                </div>
                            </div>
                        </div>
                    </div>
                `
            })}

            <!-- CARD 1: CABEÇALHO INSTITUCIONAL -->
            ${(() => {
                const existingHdr = (currentTemplate?.blocos || []).find(b => b.tipo === 'cabecalho');
                const repeatMode = existingHdr?.repetir_todas_folhas ? 'todas' : 'primeira';

                return renderAccordionCard({
                    id: 'acc-header',
                    title: 'Cabeçalho Institucional',
                    icon: 'account_balance',
                    badge: existingHdr ? (repeatMode === 'todas' ? 'Todas as Folhas' : '1ª Folha') : null,
                    content: `
                        <div class="flex flex-col gap-3">
                            <!-- Upload ou Seleção de Brasão / Logo Oficial -->
                            <div class="flex flex-col gap-1.5">
                                <label class="text-[10px] font-bold uppercase text-slate-500">Brasão / Logomarca Oficial</label>
                                <div class="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                                    <div class="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden shrink-0">
                                        <img id="cfg-hdr-logo-preview" src="${window._customUploadedLogoUrl || ''}" class="${window._customUploadedLogoUrl ? '' : 'hidden'} w-full h-full object-contain" />
                                        <span id="cfg-hdr-logo-icon" class="material-symbols-outlined text-primary text-[24px] ${window._customUploadedLogoUrl ? 'hidden' : ''}">account_balance</span>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <input type="file" id="cfg-hdr-file-input" accept="image/*" onchange="ReportBuilder.handleLogoUpload(event)" class="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary file:text-white hover:file:bg-primary/90 cursor-pointer w-full text-slate-500" />
                                        <span class="text-[10px] text-slate-400 block mt-0.5">PNG, JPG ou SVG (fundo transparente recomendado)</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label class="text-[10px] font-bold uppercase text-slate-500 block mb-1">Órgão Emissor / Empresa</label>
                                <input type="text" id="cfg-hdr-subtitle" value="${escapeHtml(existingHdr?.subtitulo || 'Prefeitura Municipal • Secretaria de Planejamento e Obras')}" oninput="ReportBuilder.updateHeaderProperty('subtitulo', this.value)" class="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-medium" placeholder="Ex: Prefeitura Municipal..." />
                            </div>
                            <div>
                                <label class="text-[10px] font-bold uppercase text-slate-500 block mb-1">Título Principal do Relatório</label>
                                <input type="text" id="cfg-hdr-title" value="${escapeHtml(existingHdr?.titulo || 'FICHA CADASTRAL INDIVIDUAL DO IMÓVEL')}" oninput="ReportBuilder.updateHeaderProperty('titulo', this.value)" class="w-full px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl" placeholder="Ex: FICHA TÉCNICA CADASTRAL..." />
                            </div>

                            <div class="space-y-1.5 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-hdr-logo" ${(existingHdr ? existingHdr.logo !== false : true) ? 'checked' : ''} onchange="ReportBuilder.updateHeaderProperty('logo', this.checked)" class="rounded text-primary focus:ring-0 cursor-pointer" />
                                    <span>Exibir Brasão / Logomarca Oficial</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-hdr-date" ${(existingHdr ? existingHdr.exibirDataHora !== false : true) ? 'checked' : ''} onchange="ReportBuilder.updateHeaderProperty('dataHora', this.checked)" class="rounded text-primary focus:ring-0 cursor-pointer" />
                                    <span>Data e Hora Automática da Emissão</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-hdr-protocol" ${(existingHdr ? existingHdr.exibirProtocolo !== false : true) ? 'checked' : ''} onchange="ReportBuilder.updateHeaderProperty('protocolo', this.checked)" class="rounded text-primary focus:ring-0 cursor-pointer" />
                                    <span>Número de Protocolo e Autenticação</span>
                                </label>
                            </div>

                            <!-- Opção de Repetição nas Folhas -->
                            <div class="p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                                <label class="text-[10px] font-bold uppercase text-slate-500 block mb-1.5">Repetição do Cabeçalho nas Folhas</label>
                                <div class="grid grid-cols-2 gap-2" id="cfg-hdr-repeat-group">
                                    <label id="btn-hdr-repeat-first" 
                                         onclick="ReportBuilder.setHeaderRepeatMode(false)" 
                                         class="flex items-center gap-2.5 p-2.5 rounded-xl border text-left cursor-pointer transition-all select-none ${repeatMode !== 'todas' ? 'bg-primary/10 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/30' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-300'}">
                                        <input type="radio" name="cfg-hdr-repeat" id="cfg-hdr-repeat-first" value="primeira" ${repeatMode !== 'todas' ? 'checked' : ''} onchange="ReportBuilder.setHeaderRepeatMode(false)" class="w-4 h-4 text-primary focus:ring-0 cursor-pointer accent-primary" />
                                        <div class="min-w-0 flex-1">
                                            <div class="font-bold text-[11px] leading-tight flex items-center justify-between">
                                                <span>Apenas 1ª Folha</span>
                                                <span id="icon-hdr-repeat-first" class="material-symbols-outlined text-[15px] ${repeatMode !== 'todas' ? 'text-primary' : 'hidden'}">check_circle</span>
                                            </div>
                                            <div class="text-[9.5px] opacity-75 leading-tight mt-0.5">Padrão do relatório</div>
                                        </div>
                                    </label>
                                    <label id="btn-hdr-repeat-all" 
                                         onclick="ReportBuilder.setHeaderRepeatMode(true)" 
                                         class="flex items-center gap-2.5 p-2.5 rounded-xl border text-left cursor-pointer transition-all select-none ${repeatMode === 'todas' ? 'bg-primary/10 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/30' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-300'}">
                                        <input type="radio" name="cfg-hdr-repeat" id="cfg-hdr-repeat-all" value="todas" ${repeatMode === 'todas' ? 'checked' : ''} onchange="ReportBuilder.setHeaderRepeatMode(true)" class="w-4 h-4 text-primary focus:ring-0 cursor-pointer accent-primary" />
                                        <div class="min-w-0 flex-1">
                                            <div class="font-bold text-[11px] leading-tight flex items-center justify-between">
                                                <span>Todas as Folhas</span>
                                                <span id="icon-hdr-repeat-all" class="material-symbols-outlined text-[15px] ${repeatMode === 'todas' ? 'text-primary' : 'hidden'}">check_circle</span>
                                            </div>
                                            <div class="text-[9.5px] opacity-75 leading-tight mt-0.5">Repete no topo</div>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <button type="button" onclick="ReportBuilder.insertHeaderBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer">
                                <span class="material-symbols-outlined text-[16px]">add_circle</span> Inserir Cabeçalho na Folha
                            </button>
                        </div>
                    `
                });
            })()}

            <!-- CARD 2: CAIXA DE TEXTO LIVRE COM FORMATAÇÃO E MENÇÕES @ -->
            ${renderAccordionCard({
                id: 'acc-free-text',
                title: 'Caixa de texto livre',
                icon: 'format_shapes',
                badge: 'Texto Livre & @Campos',
                content: `
                    <div class="flex flex-col gap-3">
                        <p class="text-[11px] text-slate-500 dark:text-slate-400">Insira blocos de texto livre na folha com quebras de linha normais, justificação, espaçamento, negrito, itálico e menções dinâmicas a campos digitando <strong>@</strong>.</p>
                        <div>
                            <label class="text-[10px] font-bold uppercase text-slate-500 block mb-1">Título da Seção (Opcional)</label>
                            <input type="text" id="cfg-free-text-title" class="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-bold dark:text-white" placeholder="Ex: Parecer Técnico, Despacho, Laudo..." />
                        </div>
                        <div>
                            <label class="text-[10px] font-bold uppercase text-slate-500 block mb-1">Texto Inicial (Opcional)</label>
                            <textarea id="cfg-free-text-content" rows="3" class="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl" placeholder="Digite seu texto aqui ou edite diretamente na folha A4 com duplo clique e @..."></textarea>
                        </div>
                        <button type="button" onclick="ReportBuilder.insertFreeTextBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">add_circle</span> Inserir Caixa de Texto na Folha
                        </button>
                    </div>
                `
            })}

            <!-- CARD 2: GRADE DE ATRIBUTOS / CAMPOS (AGRUPADOS POR ABA) -->
            ${isGeral ? '' : (() => {
                const existingGrids = (currentTemplate?.blocos || []).filter(b => b.tipo === 'grade_campos');
                const hasExistingGrid = existingGrids.length > 0;
                const activeGridFieldCount = hasExistingGrid ? (existingGrids[0].campos_selecionados?.length || 0) : 0;

                return renderAccordionCard({
                    id: 'acc-grid',
                    title: 'Grade de Atributos / Campos',
                    icon: 'table_rows',
                    badge: hasExistingGrid ? `${activeGridFieldCount} na Folha • ${fields.length} disp.` : `${fields.length} campos • ${tabGroups.length} abas`,
                    content: `
                        <div class="flex flex-col gap-3">
                            ${hasExistingGrid ? `
                                <div class="p-2.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl flex items-center justify-between text-xs">
                                    <div class="flex items-center gap-1.5 min-w-0">
                                        <span class="material-symbols-outlined text-sky-600 text-[18px]">check_circle</span>
                                        <span class="font-bold text-sky-900 dark:text-sky-200 truncate">Grade ativa na Folha A4 (${activeGridFieldCount} campos)</span>
                                    </div>
                                    <span class="text-[10px] font-mono text-sky-700 dark:text-sky-300 font-bold bg-sky-100 dark:bg-sky-900 px-2 py-0.5 rounded">Pronta</span>
                                </div>
                            ` : ''}

                            <!-- Busca Rápida de Campo ou Aba -->
                            <div class="relative">
                                <span class="material-symbols-outlined absolute left-2.5 top-2.5 text-[16px] text-slate-400">search</span>
                                <input type="text" id="cfg-grid-search-input" oninput="ReportBuilder.filterGridFieldsInDrawer(this.value)" placeholder="Buscar campo por nome ou aba..." class="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-1 focus:ring-primary focus:outline-none dark:text-white font-medium" />
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-[10px] font-bold uppercase text-slate-500">Campos agrupados por aba:</label>
                                <div class="flex items-center gap-2">
                                    <button type="button" onclick="ReportBuilder.toggleAllFieldsInDrawer(true)" class="text-[10px] font-bold text-primary hover:underline cursor-pointer">Marcar Todos</button>
                                    <span class="text-slate-300">|</span>
                                    <button type="button" onclick="ReportBuilder.toggleAllFieldsInDrawer(false)" class="text-[10px] font-bold text-slate-400 hover:underline cursor-pointer">Desmarcar Todos</button>
                                </div>
                            </div>

                            <!-- Lista de Abas com seus respectivos campos e botão rápido + -->
                            <div class="max-h-64 overflow-y-auto space-y-2 p-1 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 custom-scrollbar" id="cfg-grid-tabs-container">
                                ${tabGroups.map((tg, tgIdx) => `
                                    <div class="cfg-grid-tab-section border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800/80 overflow-hidden shadow-2xs" data-tab-title="${escapeHtml(tg.title.toLowerCase())}">
                                        <!-- Cabeçalho da Aba -->
                                        <div class="bg-slate-100/90 dark:bg-slate-700/60 px-2.5 py-1.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                                            <div class="flex items-center gap-1.5 min-w-0">
                                                <span class="material-symbols-outlined text-[15px] text-primary dark:text-sky-400">tab</span>
                                                <span class="text-xs font-bold text-slate-800 dark:text-white uppercase truncate" title="${escapeHtml(tg.title)}">${escapeHtml(tg.title)}</span>
                                                <span class="text-[9px] font-mono text-slate-500 bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.2 rounded-full">${tg.fields.length}</span>
                                            </div>
                                            <div class="flex items-center gap-1 shrink-0">
                                                <button type="button" onclick="ReportBuilder.toggleTabFieldsInDrawer('${escapeHtml(tg.id)}', true)" class="text-[9.5px] font-bold text-primary hover:underline cursor-pointer">Todos</button>
                                                <span class="text-slate-300 text-[10px]">|</span>
                                                <button type="button" onclick="ReportBuilder.toggleTabFieldsInDrawer('${escapeHtml(tg.id)}', false)" class="text-[9.5px] font-bold text-slate-400 hover:underline cursor-pointer">Nenhum</button>
                                            </div>
                                        </div>
                                        <!-- Campos da Aba -->
                                        <div class="p-1 space-y-0.5">
                                            ${tg.fields.map((f, i) => `
                                                <div class="cfg-grid-field-item flex items-center justify-between gap-1.5 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 text-xs text-slate-700 dark:text-slate-300 transition-colors" data-field-label="${escapeHtml(f.label.toLowerCase())}" data-tab-id="${escapeHtml(tg.id)}">
                                                    <label class="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                                                        <input type="checkbox" name="cfg-grid-field" data-tab-id="${escapeHtml(tg.id)}" data-tab-title="${escapeHtml(tg.title)}" value="${escapeHtml(f.id)}" ${tgIdx === 0 && i < 6 ? 'checked' : ''} class="rounded text-primary focus:ring-0 shrink-0" />
                                                        <div class="flex flex-col min-w-0 flex-1">
                                                            <div class="flex items-center gap-1.5">
                                                                <span class="truncate font-medium text-slate-800 dark:text-slate-200" title="${escapeHtml(f.label)}">${escapeHtml(f.label)}</span>
                                                                ${f.condition ? `
                                                                    <span class="text-[9px] text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/60 px-1 py-0.2 rounded font-mono shrink-0" title="Condicionado a: ${escapeHtml(f.condition)} = ${escapeHtml(f.condValue || '')}">Condicional</span>
                                                                ` : ''}
                                                            </div>
                                                        </div>
                                                    </label>
                                                    <div class="flex items-center gap-1 shrink-0">
                                                        <span class="text-[9px] font-mono text-slate-400 uppercase">${escapeHtml(f.type || 'text')}</span>
                                                        <button type="button" 
                                                                onclick="ReportBuilder.quickAddFieldToExistingGrid('${escapeHtml(f.id)}', event)" 
                                                                class="px-1.5 py-0.5 bg-sky-100 hover:bg-sky-200 dark:bg-sky-900/60 dark:hover:bg-sky-800 text-sky-700 dark:text-sky-300 rounded text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-0.5" 
                                                                title="Inserir diretamente na Grade de Atributos da Folha A4">
                                                            <span class="material-symbols-outlined text-[12px] leading-none">add</span>
                                                            <span>Add</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>

                            <!-- Layout Colunas -->
                            <div class="flex items-center justify-between pt-1">
                                <label class="text-xs font-bold text-slate-600 dark:text-slate-400">Disposição dos Campos:</label>
                                <div class="inline-flex bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <button type="button" id="btn-col-2" onclick="ReportBuilder.selectGridColumns(2)" class="px-2.5 py-1 rounded-md text-xs font-bold bg-primary text-white shadow-xs">2 Colunas</button>
                                    <button type="button" id="btn-col-3" onclick="ReportBuilder.selectGridColumns(3)" class="px-2.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:text-primary">3 Colunas</button>
                                    <button type="button" id="btn-col-1" onclick="ReportBuilder.selectGridColumns(1)" class="px-2.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:text-primary">Lista 1 Col</button>
                                </div>
                            </div>

                            <!-- Ações: Adicionar à Grade Existente vs Criar Nova Grade -->
                            ${hasExistingGrid ? `
                                <div class="flex flex-col gap-1.5 mt-1">
                                    <button type="button" onclick="ReportBuilder.addSelectedFieldsToExistingGrid()" class="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                                        <span class="material-symbols-outlined text-[16px]">playlist_add</span> Inserir Selecionados na Grade da Folha
                                    </button>
                                    <button type="button" onclick="ReportBuilder.insertGridBlock()" class="w-full py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                                        <span class="material-symbols-outlined text-[15px]">add_circle</span> Criar Nova Grade Separada
                                    </button>
                                </div>
                            ` : `
                                <button type="button" onclick="ReportBuilder.insertGridBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer">
                                    <span class="material-symbols-outlined text-[16px]">add_circle</span> Inserir Grade na Folha
                                </button>
                            `}
                        </div>
                    `
                });
            })()}

            <!-- CARD 6: QUADRO ANALÍTICO E SINTÉTICO -->
            ${isGeral ? '' : renderAccordionCard({
                id: 'acc-photos',
                title: 'Quadro Analítico e Sintético',
                icon: 'photo_library',
                badge: tabsFor1n.length > 0 ? `${tabsFor1n.length} Abas` : 'Analítico & Sintético',
                content: `
                    <div class="flex flex-col gap-3.5">
                        <!-- 1. SELEÇÃO DA ABA FONTE (OU HISTÓRICO CONSOLIDADO) -->
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Fonte dos Dados 1:N (Aba de Vistorias)</label>
                            <select id="cfg-1n-source-tab" onchange="ReportBuilder.on1nSourceTabChange(this.value)" class="w-full px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-1 focus:ring-primary focus:outline-none dark:text-white">
                                <option value="consolidado" ${selected1nSourceTab === 'consolidado' ? 'selected' : ''}>🌐 Todas as Vistorias (Histórico Consolidado 1:N)</option>
                                ${tabsFor1n.map(t => `
                                    <option value="${escapeHtml(t.id)}" ${selected1nSourceTab === t.id ? 'selected' : ''}>📋 Aba: ${escapeHtml(t.title)}</option>
                                `).join('')}
                            </select>
                            <p class="text-[10px] text-slate-400 mt-1">Selecione uma aba 1:N específica ou o histórico consolidado de todas as vistorias.</p>
                        </div>

                        <!-- 2. CONTROLE DE ORDENAÇÃO: TEMPORAL E POR ABA -->
                        <div class="p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
                            <div class="flex items-center justify-between">
                                <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ordenação dos Registros</label>
                                <span class="text-[9px] font-mono text-primary font-bold">1:N Timeline</span>
                            </div>
                            <div class="grid grid-cols-2 gap-1.5">
                                <button type="button" id="btn-1n-sort-desc" onclick="ReportBuilder.set1nSortOrder('desc')" class="py-1.5 px-2 rounded-lg border text-xs font-bold text-center transition-all ${current1nSortOrder === 'desc' ? 'bg-primary text-white border-primary shadow-xs' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer'}">
                                    Mais Recente → Antigo
                                </button>
                                <button type="button" id="btn-1n-sort-asc" onclick="ReportBuilder.set1nSortOrder('asc')" class="py-1.5 px-2 rounded-lg border text-xs font-bold text-center transition-all ${current1nSortOrder === 'asc' ? 'bg-primary text-white border-primary shadow-xs' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer'}">
                                    Mais Antigo → Recente
                                </button>
                            </div>
                            <label class="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1 border-t border-slate-200 dark:border-slate-700">
                                <input type="checkbox" id="cfg-1n-group-by-tab" onchange="ReportBuilder.set1nGroupByTab(this.checked)" ${current1nGroupByTab ? 'checked' : ''} class="rounded text-primary focus:ring-0" />
                                <span class="font-semibold">Ordenar e Agrupar Registros por Aba</span>
                            </label>
                            ${current1nGroupByTab ? `
                                <div class="mt-1.5 p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col gap-1.5" id="cfg-1n-tab-sequence-container">
                                    <div class="flex items-center justify-between">
                                        <label class="text-[9.5px] font-bold uppercase text-slate-500">Sequência das Abas no Relatório:</label>
                                        <span class="text-[9px] text-slate-400 font-mono">Use ↑ ↓</span>
                                    </div>
                                    <div class="space-y-1" id="cfg-1n-tab-sequence-list">
                                        ${orderedTabs.map((t, idx) => `
                                            <div class="flex items-center justify-between p-1.5 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-xs">
                                                <div class="flex items-center gap-1.5 min-w-0">
                                                    <span class="w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">${idx + 1}</span>
                                                    <span class="font-semibold text-slate-800 dark:text-slate-200 truncate">${escapeHtml(t.title)}</span>
                                                </div>
                                                <div class="flex items-center gap-0.5 shrink-0">
                                                    <button type="button" onclick="ReportBuilder.move1nTabSequence(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} class="p-0.5 text-slate-500 hover:text-primary disabled:opacity-30 cursor-pointer" title="Mover para cima">
                                                        <span class="material-symbols-outlined text-[14px]">arrow_upward</span>
                                                    </button>
                                                    <button type="button" onclick="ReportBuilder.move1nTabSequence(${idx}, 1)" ${idx === orderedTabs.length - 1 ? 'disabled' : ''} class="p-0.5 text-slate-500 hover:text-primary disabled:opacity-30 cursor-pointer" title="Mover para baixo">
                                                        <span class="material-symbols-outlined text-[14px]">arrow_downward</span>
                                                    </button>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                        <!-- 1. TABELA SINTÉTICA (CRONOLÓGICA 1:N) - POSICIONADA LOGO ABAIXO DE ORDENAÇÃO DOS REGISTROS -->
                        <div class="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                            <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
                                <span class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-[16px] text-sky-600">table_rows</span>
                                    1. Tabela Sintética (Cronológica)
                                </span>
                                <span class="text-[9px] font-mono bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 px-1.5 py-0.5 rounded font-bold">1:N Resumo</span>
                            </div>

                            <!-- DENSIDADE DA TABELA -->
                            <div class="space-y-1">
                                <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Densidade & Espaçamento da Tabela:</label>
                                <div class="grid grid-cols-3 gap-1">
                                    <button type="button" id="btn-1n-density-comfortable" onclick="ReportBuilder.set1nTableDensity('comfortable')" class="py-1 px-1.5 rounded-lg border text-[10.5px] font-semibold text-center ${activeDensity === 'comfortable' ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Confortável</button>
                                    <button type="button" id="btn-1n-density-compact" onclick="ReportBuilder.set1nTableDensity('compact')" class="py-1 px-1.5 rounded-lg border text-[10.5px] font-semibold text-center ${activeDensity === 'compact' ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Compacto</button>
                                    <button type="button" id="btn-1n-density-ultracompact" onclick="ReportBuilder.set1nTableDensity('ultracompact')" class="py-1 px-1.5 rounded-lg border text-[10.5px] font-semibold text-center ${activeDensity === 'ultracompact' ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Ultra-Compacto</button>
                                </div>
                            </div>

                            <!-- CORES DAS LINHAS / ZEBRADO -->
                            <div class="space-y-1">
                                <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Cores Alternadas por Linha (Zebrado):</label>
                                <div class="grid grid-cols-2 gap-1">
                                    <button type="button" id="btn-1n-striping-slate" onclick="ReportBuilder.set1nRowStriping('slate')" class="py-1 px-1.5 rounded-lg border text-[10px] font-semibold text-center ${activeStriping === 'slate' ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Cinza Suave</button>
                                    <button type="button" id="btn-1n-striping-sky" onclick="ReportBuilder.set1nRowStriping('sky')" class="py-1 px-1.5 rounded-lg border text-[10px] font-semibold text-center ${activeStriping === 'sky' ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Azul Suave</button>
                                    <button type="button" id="btn-1n-striping-ente" onclick="ReportBuilder.set1nRowStriping('ente')" class="py-1 px-1.5 rounded-lg border text-[10px] font-semibold text-center ${activeStriping === 'ente' ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Tons por Ente/Aba</button>
                                    <button type="button" id="btn-1n-striping-white" onclick="ReportBuilder.set1nRowStriping('white')" class="py-1 px-1.5 rounded-lg border text-[10px] font-semibold text-center ${activeStriping === 'white' ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Branco Simples</button>
                                </div>
                            </div>

                            <!-- ABAS E CAMPOS DA TABELA SINTÉTICA COM SELEÇÃO E ATALHO [+ ADD] -->
                            <div class="flex flex-col gap-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                                <div class="flex items-center justify-between">
                                    <label class="text-[10px] font-bold uppercase text-sky-800 dark:text-sky-400">Abas e Campos Disponíveis:</label>
                                    <div class="flex items-center gap-1.5">
                                        <button type="button" onclick="ReportBuilder.toggleAll1nFieldsInDrawer(true)" class="text-[10px] font-bold text-sky-600 hover:underline cursor-pointer">Todos</button>
                                        <span class="text-slate-300">|</span>
                                        <button type="button" onclick="ReportBuilder.toggleAll1nFieldsInDrawer(false)" class="text-[10px] font-bold text-slate-400 hover:underline cursor-pointer">Nenhum</button>
                                    </div>
                                </div>

                                <!-- Busca Rápida de Campo 1:N -->
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-2.5 top-2.5 text-[15px] text-slate-400">search</span>
                                    <input type="text" id="cfg-1n-search-input" oninput="ReportBuilder.filter1nFieldsInDrawer(this.value)" placeholder="Buscar campo 1:N por nome..." class="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-1 focus:ring-sky-500 focus:outline-none dark:text-white" />
                                </div>

                                <!-- Lista de Abas com seus Campos -->
                                <div class="max-h-60 overflow-y-auto space-y-2 p-1 bg-white/80 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 custom-scrollbar" id="cfg-1n-tabs-container">
                                    ${(() => {
                                        const existingSynthetic1nBlock = currentTemplate?.blocos?.find(b => b.tipo === 'tabela_sintetica_1n');
                                        if (current1nSynSelectedTabs.size === 0) {
                                            if (existingSynthetic1nBlock?.abas_selecionadas && Array.isArray(existingSynthetic1nBlock.abas_selecionadas) && existingSynthetic1nBlock.abas_selecionadas.length > 0) {
                                                existingSynthetic1nBlock.abas_selecionadas.forEach(id => current1nSynSelectedTabs.add(id));
                                            } else if (tabsFor1n.length > 0) {
                                                tabsFor1n.forEach(t => current1nSynSelectedTabs.add(t.id));
                                            }
                                        }

                                        if (current1nSelectedFieldKeys.size === 0 && tabsFor1n.length > 0) {
                                            const firstTab = tabsFor1n[0];
                                            const firstTabFields = (firstTab.fields && firstTab.fields.length > 0) ? firstTab.fields : (tabGroupsMap.get(firstTab.id)?.fields || []);
                                            firstTabFields.slice(0, 6).forEach(f => {
                                                current1nSelectedFieldKeys.add(`${firstTab.id}:${f.id}`);
                                            });
                                        }
                                        return tabsFor1n.map((t, tIdx) => {
                                            const tFields = (t.fields && t.fields.length > 0) ? t.fields : (tabGroupsMap.get(t.id)?.fields || []);
                                            const isTabChecked = current1nSynSelectedTabs.has(t.id);
                                            return `
                                                <div class="cfg-1n-tab-section border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800/80 overflow-hidden shadow-2xs" data-tab-title="${escapeHtml(t.title.toLowerCase())}">
                                                    <div class="bg-slate-100/90 dark:bg-slate-700/60 px-2.5 py-1.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-200/60 transition-colors select-none" onclick="ReportBuilder.toggleAccordionTab('cfg-tab-fields-syn-${escapeHtml(t.id)}')">
                                                        <div class="flex items-center gap-1.5 min-w-0 flex-1">
                                                            <span class="material-symbols-outlined text-[16px] text-slate-500 transition-transform" id="cfg-tab-fields-syn-${escapeHtml(t.id)}-icon">${tIdx === 0 ? 'expand_more' : 'chevron_right'}</span>
                                                            <label class="flex items-center gap-1.5 cursor-pointer shrink-0" onclick="event.stopPropagation()">
                                                                <input type="checkbox" name="cfg-1n-syn-tab-select" data-tab-id="${escapeHtml(t.id)}" onchange="ReportBuilder.on1nSynTabSelectChange(this)" ${isTabChecked ? 'checked' : ''} class="rounded text-sky-600 focus:ring-0 shrink-0 cursor-pointer" title="Marcar para incluir esta aba na Tabela Sintética" />
                                                            </label>
                                                            <span class="material-symbols-outlined text-[15px] text-amber-500">folder</span>
                                                            <span class="text-xs font-bold text-slate-800 dark:text-white uppercase truncate" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
                                                            <span class="text-[9px] font-mono text-slate-500 bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.2 rounded-full">${tFields.length}</span>
                                                        </div>
                                                        <div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">
                                                            <button type="button" onclick="ReportBuilder.toggleTab1nFieldsInDrawer('${escapeHtml(t.id)}', true)" class="text-[9.5px] font-bold text-primary hover:underline cursor-pointer">Todos</button>
                                                            <span class="text-slate-300 text-[10px]">|</span>
                                                            <button type="button" onclick="ReportBuilder.toggleTab1nFieldsInDrawer('${escapeHtml(t.id)}', false)" class="text-[9.5px] font-bold text-slate-400 hover:underline cursor-pointer">Nenhum</button>
                                                        </div>
                                                    </div>
                                                    <div class="p-1 space-y-0.5 ${tIdx === 0 ? '' : 'hidden'}" id="cfg-tab-fields-syn-${escapeHtml(t.id)}">
                                                        ${tFields.map((f, fIdx) => {
                                                            const fKey = `${t.id}:${f.id}`;
                                                            const isChecked = current1nSelectedFieldKeys.has(fKey);
                                                            return `
                                                                <div class="cfg-1n-field-item flex items-center justify-between gap-1.5 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 text-xs text-slate-700 dark:text-slate-300 transition-colors" data-field-label="${escapeHtml(f.label.toLowerCase())}" data-tab-id="${escapeHtml(t.id)}">
                                                                    <label class="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                                                                        <input type="checkbox" name="cfg-1n-field" data-tab-id="${escapeHtml(t.id)}" data-tab-title="${escapeHtml(t.title)}" data-field-label="${escapeHtml(f.label)}" value="${escapeHtml(f.id)}" onchange="ReportBuilder.on1nFieldCheckboxChange(this)" ${isChecked ? 'checked' : ''} class="rounded text-primary focus:ring-0 shrink-0 cursor-pointer" />
                                                                    <span class="truncate font-medium text-slate-800 dark:text-slate-200" title="${escapeHtml(f.label)}">${escapeHtml(f.label)}</span>
                                                                </label>
                                                                <div class="flex items-center gap-1 shrink-0">
                                                                    <span class="text-[9px] font-mono text-slate-400 uppercase">${escapeHtml(f.type || 'text')}</span>
                                                                    <button type="button" 
                                                                            onclick="ReportBuilder.quickAddFieldTo1n('${escapeHtml(t.id)}', '${escapeHtml(f.id)}', 'sintetica', event)" 
                                                                            class="px-1.5 py-0.5 bg-sky-100 hover:bg-sky-200 dark:bg-sky-900/60 dark:hover:bg-sky-800 text-sky-800 dark:text-sky-200 rounded text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-0.5" 
                                                                            title="Inserir diretamente na Tabela Sintética da Folha A4">
                                                                        <span class="material-symbols-outlined text-[12px] leading-none">add</span>
                                                                        <span>Add</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        `;
                                                    }).join('')}
                                                </div>
                                            </div>
                                        `;
                                    }).join('');
                                })()}
                                </div>
                            </div>

                            <!-- Container oculto de compatibilidade QA -->
                            <div id="cfg-1n-syn-cols-container" class="hidden">
                                <input type="checkbox" name="cfg-1n-syn-col" value="data" checked />
                                <input type="checkbox" name="cfg-1n-syn-col" value="org" checked />
                                <input type="checkbox" name="cfg-1n-syn-col" value="situacao_ocupacao" checked />
                                <input type="checkbox" name="cfg-1n-syn-col" value="situacao_recuo" checked />
                                <input type="checkbox" name="cfg-1n-syn-col" value="area_invadida" checked />
                                <input type="checkbox" name="cfg-1n-syn-col" value="qtd_fotos" checked />
                            </div>

                            <p class="text-[11px] text-slate-500 dark:text-slate-400">Gera colunas baseadas estritamente nos campos selecionados das abas ativas acima.</p>

                            ${hasExistingSynthetic1n ? `
                                <div class="p-2 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-xl flex items-center justify-between text-xs">
                                    <div class="flex items-center gap-1.5 min-w-0">
                                        <span class="material-symbols-outlined text-sky-600 text-[18px]">check_circle</span>
                                        <span class="font-bold text-sky-900 dark:text-sky-200 truncate">Tabela ativa na Folha A4 (${activeSyntheticColCount} colunas)</span>
                                    </div>
                                    <span class="text-[10px] font-mono text-sky-700 dark:text-sky-300 font-bold bg-sky-100 dark:bg-sky-900 px-2 py-0.5 rounded">Pronta</span>
                                </div>
                                <div class="flex flex-col gap-1.5">
                                    <button type="button" onclick="ReportBuilder.addSelectedFieldsToExistingSynthetic1n()" class="w-full py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                                        <span class="material-symbols-outlined text-[16px]">playlist_add</span> Inserir Selecionados na Tabela da Folha
                                    </button>
                                    <button type="button" onclick="ReportBuilder.insertSynthetic1nBlock()" class="w-full py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                                        <span class="material-symbols-outlined text-[15px]">add_circle</span> Criar Nova Tabela Separada
                                    </button>
                                </div>
                            ` : `
                                <button type="button" onclick="ReportBuilder.insertSynthetic1nBlock()" class="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                                    <span class="material-symbols-outlined text-[16px]">add_circle</span> Inserir Tabela Sintética na Folha
                                </button>
                            `}
                        </div>

                        <!-- SEÇÃO B: LAUDO ANALÍTICO & CADERNO FOTOGRÁFICO 1:N -->
                        <div class="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                            <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
                                <span class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-[16px] text-amber-500">photo_library</span>
                                    2. Laudo Analítico & Fotos (1:N)
                                </span>
                                <span class="text-[9px] font-mono bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 rounded font-bold">1:N Detalhado</span>
                            </div>

                            <!-- Filtro de Vistorias (Todas vs Última) -->
                            <div>
                                <label class="text-[10px] font-bold uppercase text-slate-500 block mb-1">Escopo das Vistorias a Detalhar:</label>
                                <div class="grid grid-cols-2 gap-1.5">
                                    <button type="button" id="btn-1n-scope-all" onclick="ReportBuilder.select1nScope('todas')" class="py-1.5 px-2 rounded-lg border text-xs font-bold text-center ${selected1nScope === 'todas' ? 'bg-primary/10 text-primary border-primary' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Todas as Vistorias</button>
                                    <button type="button" id="btn-1n-scope-last" onclick="ReportBuilder.select1nScope('ultima')" class="py-1.5 px-2 rounded-lg border text-xs font-semibold text-center ${selected1nScope === 'ultima' ? 'bg-primary/10 text-primary border-primary' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Apenas Última Vistoria</button>
                                </div>
                            </div>

                            <!-- Sequência das Abas no Laudo -->
                            <div class="space-y-1">
                                <div class="flex items-center justify-between">
                                    <label class="text-[10px] font-bold uppercase text-slate-500 block">Sequência das Abas no Laudo:</label>
                                    <span class="text-[9px] text-slate-400 font-mono">Use ↑ ↓</span>
                                </div>
                                <div class="space-y-1" id="cfg-1n-laudo-tab-sequence-list">${renderLaudoTabSequenceList()}</div>
                            </div>

                            <!-- Disposição Visual das Fotos -->
                            <div>
                                <label class="text-[10px] font-bold uppercase text-slate-500 block mb-1">Disposição Visual das Fotos:</label>
                                <div class="grid grid-cols-3 gap-1.5">
                                    <button type="button" id="btn-photo-layout-1" onclick="ReportBuilder.selectPhotoLayout('1_col')" class="py-1.5 px-2 rounded-lg border text-xs font-semibold text-center ${selectedPhotoLayout === '1_col' ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">1 por Linha</button>
                                    <button type="button" id="btn-photo-layout-2" onclick="ReportBuilder.selectPhotoLayout('2_cols')" class="py-1.5 px-2 rounded-lg border text-xs text-center ${selectedPhotoLayout === '2_cols' ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">2 por Linha</button>
                                    <button type="button" id="btn-photo-layout-4" onclick="ReportBuilder.selectPhotoLayout('grid_4')" class="py-1.5 px-2 rounded-lg border text-xs font-semibold text-center ${selectedPhotoLayout === 'grid_4' ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Grade 2x2</button>
                                </div>
                            </div>

                            <!-- DENSIDADE & ESPAÇAMENTO DO LAUDO -->
                            <div class="space-y-1">
                                <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Densidade & Espaçamento do Laudo:</label>
                                <div class="grid grid-cols-3 gap-1">
                                    <button type="button" id="btn-1n-laudo-density-comfortable" onclick="ReportBuilder.set1nLaudoDensity('comfortable')" class="py-1 px-1.5 rounded-lg border text-[10.5px] font-semibold text-center ${activeLaudoDensity === 'comfortable' ? 'bg-amber-500/10 text-amber-700 border-amber-500 font-bold dark:text-amber-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Confortável</button>
                                    <button type="button" id="btn-1n-laudo-density-compact" onclick="ReportBuilder.set1nLaudoDensity('compact')" class="py-1 px-1.5 rounded-lg border text-[10.5px] font-semibold text-center ${activeLaudoDensity === 'compact' ? 'bg-amber-500/10 text-amber-700 border-amber-500 font-bold dark:text-amber-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Compacto</button>
                                    <button type="button" id="btn-1n-laudo-density-ultracompact" onclick="ReportBuilder.set1nLaudoDensity('ultracompact')" class="py-1 px-1.5 rounded-lg border text-[10.5px] font-semibold text-center ${activeLaudoDensity === 'ultracompact' ? 'bg-amber-500/10 text-amber-700 border-amber-500 font-bold dark:text-amber-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Ultra-Compacto</button>
                                </div>
                            </div>

                            <!-- CORES DOS CARTÕES / ZEBRADO DO LAUDO -->
                            <div class="space-y-1">
                                <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Cores dos Cartões de Vistoria (Zebrado):</label>
                                <div class="grid grid-cols-2 gap-1">
                                    <button type="button" id="btn-1n-laudo-striping-slate" onclick="ReportBuilder.set1nLaudoRowStriping('slate')" class="py-1 px-1.5 rounded-lg border text-[10px] font-semibold text-center ${activeLaudoStriping === 'slate' ? 'bg-amber-500/10 text-amber-700 border-amber-500 font-bold dark:text-amber-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Cinza Suave</button>
                                    <button type="button" id="btn-1n-laudo-striping-sky" onclick="ReportBuilder.set1nLaudoRowStriping('sky')" class="py-1 px-1.5 rounded-lg border text-[10px] font-semibold text-center ${activeLaudoStriping === 'sky' ? 'bg-amber-500/10 text-amber-700 border-amber-500 font-bold dark:text-amber-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Azul Suave</button>
                                    <button type="button" id="btn-1n-laudo-striping-ente" onclick="ReportBuilder.set1nLaudoRowStriping('ente')" class="py-1 px-1.5 rounded-lg border text-[10px] font-semibold text-center ${activeLaudoStriping === 'ente' ? 'bg-amber-500/10 text-amber-700 border-amber-500 font-bold dark:text-amber-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Tons por Ente/Aba</button>
                                    <button type="button" id="btn-1n-laudo-striping-white" onclick="ReportBuilder.set1nLaudoRowStriping('white')" class="py-1 px-1.5 rounded-lg border text-[10px] font-semibold text-center ${activeLaudoStriping === 'white' ? 'bg-amber-500/10 text-amber-700 border-amber-500 font-bold dark:text-amber-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer">Branco Simples</button>
                                </div>
                            </div>

                            <!-- Metadados da Vistoria e das Fotos -->
                            <div class="space-y-1.5 p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-photo-legend" checked class="rounded text-primary focus:ring-0" />
                                    <span>Legenda e Descrição de Cada Foto</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-photo-date" checked class="rounded text-primary focus:ring-0" />
                                    <span>Data e Hora Exata da Captura</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-photo-coords" checked class="rounded text-primary focus:ring-0" />
                                    <span>Coordenadas Geográficas (GPS / LatLng)</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-photo-resp" checked class="rounded text-primary focus:ring-0" />
                                    <span>Responsável Técnico / Fiscal da Vistoria</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer border-t border-slate-100 dark:border-slate-700 pt-1.5">
                                    <input type="checkbox" id="cfg-photo-obs" checked class="rounded text-primary focus:ring-0" />
                                    <span>Incluir Conclusão da Vistoria na Íntegra</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-photo-links" checked class="rounded text-primary focus:ring-0" />
                                    <span>Incluir Processos Oficiais & Hiperlinks</span>
                                </label>
                            </div>

                            <!-- ABAS E CAMPOS DO LAUDO ANALÍTICO (SELEÇÃO, INSERÇÃO E RETIRADA) -->
                            <div class="flex flex-col gap-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                                <div class="flex items-center justify-between">
                                    <label class="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">Abas e Campos do Laudo Analítico:</label>
                                    <div class="flex items-center gap-1.5">
                                        <button type="button" onclick="ReportBuilder.toggleAll1nLaudoFieldsInDrawer(true)" class="text-[10px] font-bold text-amber-600 hover:underline cursor-pointer">Todos</button>
                                        <span class="text-slate-300">|</span>
                                        <button type="button" onclick="ReportBuilder.toggleAll1nLaudoFieldsInDrawer(false)" class="text-[10px] font-bold text-slate-400 hover:underline cursor-pointer">Nenhum</button>
                                    </div>
                                </div>

                                <!-- Busca Rápida de Campo no Laudo -->
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-2.5 top-2.5 text-[15px] text-slate-400">search</span>
                                    <input type="text" id="cfg-1n-laudo-search-input" oninput="ReportBuilder.filter1nLaudoFieldsInDrawer(this.value)" placeholder="Buscar campo para o laudo..." class="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none dark:text-white" />
                                </div>

                                <!-- Lista de Abas com seus Campos para o Laudo -->
                                <div class="max-h-60 overflow-y-auto space-y-2 p-1 bg-white/80 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 custom-scrollbar" id="cfg-1n-laudo-tabs-container">
                                    ${(() => {
                                        // 1. Inicializa abas selecionadas do laudo
                                        if (current1nLaudoSelectedTabs.size === 0) {
                                            if (existingAnalytical1nBlock?.abas_selecionadas && Array.isArray(existingAnalytical1nBlock.abas_selecionadas) && existingAnalytical1nBlock.abas_selecionadas.length > 0) {
                                                existingAnalytical1nBlock.abas_selecionadas.forEach(id => current1nLaudoSelectedTabs.add(id));
                                            } else if (existingAnalytical1nBlock?.campos_selecionados && Array.isArray(existingAnalytical1nBlock.campos_selecionados) && existingAnalytical1nBlock.campos_selecionados.length > 0) {
                                                existingAnalytical1nBlock.campos_selecionados.forEach(cf => {
                                                    const tId = typeof cf === 'object' ? cf.tabId : '';
                                                    if (tId) current1nLaudoSelectedTabs.add(tId);
                                                });
                                            }
                                            if (current1nLaudoSelectedTabs.size === 0 && tabsFor1n.length > 0) {
                                                current1nLaudoSelectedTabs.add(tabsFor1n[0].id);
                                            }
                                        }

                                        // 2. Inicializa campos selecionados do laudo
                                        if (current1nLaudoSelectedFieldKeys.size === 0) {
                                            if (existingAnalytical1nBlock?.campos_selecionados && Array.isArray(existingAnalytical1nBlock.campos_selecionados) && existingAnalytical1nBlock.campos_selecionados.length > 0) {
                                                existingAnalytical1nBlock.campos_selecionados.forEach(cf => {
                                                    const cId = typeof cf === 'string' ? cf : (cf.rawId || cf.id);
                                                    const cTab = typeof cf === 'object' ? (cf.tabId || '') : '';
                                                    if (cTab && cId) {
                                                        current1nLaudoSelectedFieldKeys.add(`${cTab}:${cId}`);
                                                    }
                                                });
                                            }
                                            if (current1nLaudoSelectedFieldKeys.size === 0 && current1nLaudoSelectedTabs.size > 0) {
                                                current1nLaudoSelectedTabs.forEach(selTabId => {
                                                    const targetTab = tabsFor1n.find(t => t.id === selTabId);
                                                    const flds = (targetTab && targetTab.fields && targetTab.fields.length > 0) ? targetTab.fields : (tabGroupsMap.get(selTabId)?.fields || []);
                                                    flds.forEach(f => current1nLaudoSelectedFieldKeys.add(`${selTabId}:${f.id}`));
                                                });
                                            }
                                        }

                                        return tabsFor1n.map((t, tIdx) => {
                                            const tFields = (t.fields && t.fields.length > 0) ? t.fields : (tabGroupsMap.get(t.id)?.fields || []);
                                            const isTabChecked = current1nLaudoSelectedTabs.has(t.id);

                                            return `
                                                <div class="cfg-1n-laudo-tab-section border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800/80 overflow-hidden shadow-2xs" data-tab-title="${escapeHtml(t.title.toLowerCase())}">
                                                    <div class="bg-amber-50/70 dark:bg-slate-700/60 px-2.5 py-1.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-amber-100/60 transition-colors select-none" onclick="ReportBuilder.toggleAccordionTab('cfg-tab-fields-laudo-${escapeHtml(t.id)}')">
                                                        <div class="flex items-center gap-1.5 min-w-0 flex-1">
                                                            <span class="material-symbols-outlined text-[16px] text-slate-500 transition-transform" id="cfg-tab-fields-laudo-${escapeHtml(t.id)}-icon">${tIdx === 0 ? 'expand_more' : 'chevron_right'}</span>
                                                            <label class="flex items-center gap-1.5 cursor-pointer shrink-0" onclick="event.stopPropagation()">
                                                                <input type="checkbox" name="cfg-1n-laudo-tab-select" data-tab-id="${escapeHtml(t.id)}" onchange="ReportBuilder.on1nLaudoTabSelectChange(this)" ${isTabChecked ? 'checked' : ''} class="rounded text-amber-600 focus:ring-0 shrink-0 cursor-pointer" title="Marcar para incluir esta aba no Laudo Analítico" />
                                                            </label>
                                                            <span class="material-symbols-outlined text-[15px] text-amber-500">folder</span>
                                                            <span class="text-xs font-bold text-slate-800 dark:text-white uppercase truncate" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
                                                            <span class="text-[9px] font-mono text-slate-500 bg-white/80 dark:bg-slate-800 px-1.5 py-0.2 rounded-full">${tFields.length}</span>
                                                        </div>
                                                        <div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">
                                                            <button type="button" onclick="ReportBuilder.toggleTab1nLaudoFieldsInDrawer('${escapeHtml(t.id)}', true)" class="text-[9.5px] font-bold text-amber-600 hover:underline cursor-pointer">Todos</button>
                                                            <span class="text-slate-300 text-[10px]">|</span>
                                                            <button type="button" onclick="ReportBuilder.toggleTab1nLaudoFieldsInDrawer('${escapeHtml(t.id)}', false)" class="text-[9.5px] font-bold text-slate-400 hover:underline cursor-pointer">Nenhum</button>
                                                        </div>
                                                    </div>
                                                    <div class="p-1 space-y-0.5 ${tIdx === 0 ? '' : 'hidden'}" id="cfg-tab-fields-laudo-${escapeHtml(t.id)}">
                                                        ${tFields.map((f, fIdx) => {
                                                            const fKey = `${t.id}:${f.id}`;
                                                            const isPresentInActiveBlock = existingAnalytical1nBlock?.campos_selecionados?.some(cf => {
                                                                const cId = typeof cf === 'string' ? cf : (cf.rawId || cf.id);
                                                                const cTab = typeof cf === 'object' ? (cf.tabId || '') : '';
                                                                return (cTab === t.id || !cTab) && cId === f.id;
                                                            });
                                                            const isChecked = current1nLaudoSelectedFieldKeys.has(fKey);
                                                            return `
                                                                <div class="cfg-1n-laudo-field-item flex items-center justify-between gap-1.5 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 text-xs text-slate-700 dark:text-slate-300 transition-colors" data-field-label="${escapeHtml(f.label.toLowerCase())}" data-tab-id="${escapeHtml(t.id)}">
                                                                    <label class="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                                                                        <input type="checkbox" name="cfg-1n-laudo-field" data-tab-id="${escapeHtml(t.id)}" data-tab-title="${escapeHtml(t.title)}" data-field-label="${escapeHtml(f.label)}" value="${escapeHtml(f.id)}" onchange="ReportBuilder.on1nLaudoFieldCheckboxChange(this)" ${isChecked ? 'checked' : ''} class="rounded text-amber-600 focus:ring-0 shrink-0 cursor-pointer" />
                                                                    <span class="truncate font-medium text-slate-800 dark:text-slate-200" title="${escapeHtml(f.label)}">${escapeHtml(f.label)}</span>
                                                                </label>
                                                                <div class="flex items-center gap-1 shrink-0">
                                                                    <span class="text-[9px] font-mono text-slate-400 uppercase">${escapeHtml(f.type || 'text')}</span>
                                                                    ${isPresentInActiveBlock ? `
                                                                        <button type="button" 
                                                                                onclick="ReportBuilder.quickRemoveFieldFromAnalytical1n('${escapeHtml(t.id)}', '${escapeHtml(f.id)}', event)" 
                                                                                class="px-1.5 py-0.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 rounded text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-0.5 border border-rose-200 dark:border-rose-800" 
                                                                                title="Retirar este campo do Laudo da Folha A4">
                                                                            <span class="material-symbols-outlined text-[12px] leading-none">close</span>
                                                                            <span>Retirar</span>
                                                                        </button>
                                                                    ` : `
                                                                        <button type="button" 
                                                                                onclick="ReportBuilder.quickAddFieldToAnalytical1n('${escapeHtml(t.id)}', '${escapeHtml(f.id)}', event)" 
                                                                                class="px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-800 text-amber-800 dark:text-amber-200 rounded text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-0.5" 
                                                                                title="Inserir este campo no Laudo da Folha A4">
                                                                            <span class="material-symbols-outlined text-[12px] leading-none">add</span>
                                                                            <span>Inserir</span>
                                                                        </button>
                                                                    `}
                                                                </div>
                                                            </div>
                                                        `;
                                                    }).join('')}
                                                </div>
                                            </div>
                                        `;
                                    }).join('');
                                })()}
                                </div>
                            </div>

                            ${hasExistingAnalytical1n ? `
                                <div class="p-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between text-xs">
                                    <div class="flex items-center gap-1.5 min-w-0">
                                        <span class="material-symbols-outlined text-amber-600 text-[18px]">check_circle</span>
                                        <span class="font-bold text-amber-900 dark:text-amber-200 truncate">Laudo ativo na Folha A4 (${activeAnalyticalFieldCount} campos)</span>
                                    </div>
                                    <span class="text-[10px] font-mono text-amber-700 dark:text-amber-300 font-bold bg-amber-100 dark:bg-amber-900 px-2 py-0.5 rounded">Pronto</span>
                                </div>
                                <div class="flex flex-col gap-1.5">
                                    <div class="grid grid-cols-2 gap-1.5">
                                        <button type="button" onclick="ReportBuilder.addSelectedFieldsToExistingAnalytical1n()" class="py-2 px-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer" title="Inserir campos marcados no Laudo ativo">
                                            <span class="material-symbols-outlined text-[15px]">playlist_add</span> Inserir no Laudo
                                        </button>
                                        <button type="button" onclick="ReportBuilder.removeSelectedFieldsFromExistingAnalytical1n()" class="py-2 px-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer" title="Retirar campos marcados do Laudo ativo">
                                            <span class="material-symbols-outlined text-[15px]">remove_circle</span> Retirar do Laudo
                                        </button>
                                    </div>
                                    <button type="button" onclick="ReportBuilder.insertAnalyticalPhotos1nBlock()" class="w-full py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                                        <span class="material-symbols-outlined text-[15px]">add_circle</span> Criar Novo Laudo Separado
                                    </button>
                                </div>
                            ` : `
                                <button type="button" onclick="ReportBuilder.insertAnalyticalPhotos1nBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                                    <span class="material-symbols-outlined text-[16px]">photo_library</span> Inserir Laudo Analítico & Fotos na Folha
                                </button>
                            `}
                        </div>
                    </div>
                `
            })}

            <!-- CARD: MINI-MAPA CARTOGRÁFICO (SIG) -->
            ${isGeral ? '' : (() => {
                const existingMap = (currentTemplate?.blocos || []).find(b => b.tipo === 'mapa_estatico');
                const mcfg = window.MapTools ? window.MapTools.normalizeMapConfig(existingMap || {}) : { destaque: { ativo: true, cor: '#10b981', esmaecerEntorno: false }, baseMap: 'osm', camadasVizinhas: true, norte: true, escala: true, projecao: true, alturaMm: 90, medidas: { ativo: true, lados: true, total: true, perimetro: false }, pontos: { ativo: false, sistema: 'utm', tabela: true, memorial: false }, temporal: { ativo: false, ordem: 'asc', colunas: 2, alturaMm: 70, sincronizar: true, contorno: true, excluidas: [] }, rotulos: { ativo: false, campo: 'rotulo' }, confrontantes: { ativo: false }, referencia: { ativo: false }, comparacaoArea: { ativo: false }, situacao: { ativo: false }, quadriculado: { ativo: false } };
                const chk = (id, label, checked) => `
                    <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} class="rounded text-primary focus:ring-0" />
                        <span>${label}</span>
                    </label>`;
                return renderAccordionCard({
                    id: 'acc-map',
                    title: 'Mini-Mapa Cartográfico (SIG)',
                    icon: 'map',
                    badge: existingMap ? 'Na folha' : 'Precisão Cartográfica',
                    content: `
                    <div class="flex flex-col gap-3">
                        <p class="text-[11px] text-slate-500">O mapa é montado com a feição real quando o relatório é aberto, já com <strong>todas as opções ligadas</strong> (destaque, medidas, pontos e tabela, confrontantes, análise temporal, rótulos, quadriculado, mapa de situação e elementos). Quem gera o relatório escolhe o que mostrar e ajusta tudo no painel <em>Configurações do Mapa</em>, inclusive as escolhas que dependem dos dados (camadas dos confrontantes, campo da área e pontos dos vértices).</p>
                        <button type="button" onclick="ReportBuilder.insertMapBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">${existingMap ? 'sync' : 'add_circle'}</span> ${existingMap ? 'Restaurar o padrão completo do Mini-Mapa' : 'Inserir Mini-Mapa na Folha'}
                        </button>
                    </div>
                    `
                });
            })()}

            <!-- CARD: GRÁFICOS DO DASHBOARD -->
            ${!isGeral ? '' : renderAccordionCard({
                id: 'acc-charts',
                title: 'Gráficos do Dashboard',
                icon: 'pie_chart',
                badge: `${charts.length} disponíveis`,
                content: `
                    <div class="flex flex-col gap-3">
                        <p class="text-[11px] text-slate-500">Selecione quais gráficos do Dashboard Estatístico você deseja embutir neste relatório:</p>
                        ${charts.length === 0 ? `
                            <div class="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-400">
                                Nenhum gráfico criado na aba "Dashboard Estatístico" ainda. Crie gráficos lá para embuti-los no relatório.
                            </div>
                        ` : `
                            <div class="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                                ${charts.map((c, i) => `
                                    <label class="flex items-center gap-2.5 p-2 bg-slate-50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs cursor-pointer">
                                        <input type="checkbox" name="cfg-chart-select" value="${c.id}" ${i === 0 ? 'checked' : ''} class="rounded text-primary focus:ring-0" />
                                        <div class="flex flex-col min-w-0 flex-1">
                                            <span class="font-bold text-slate-800 dark:text-slate-200 truncate">${c.title}</span>
                                            <span class="text-[10px] text-slate-400 font-mono">Tipo: ${c.type.toUpperCase()} • Campo: ${c.fieldLabel}</span>
                                        </div>
                                    </label>
                                `).join('')}
                            </div>
                            <div class="flex items-center justify-between pt-1">
                                <label class="text-xs font-bold text-slate-600 dark:text-slate-400">Disposição na Folha:</label>
                                <div class="inline-flex bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <button type="button" id="btn-chart-layout-full" onclick="ReportBuilder.selectChartLayout('full')" class="px-3 py-1 rounded-md text-xs font-bold bg-primary text-white shadow-xs">Largura Total</button>
                                    <button type="button" id="btn-chart-layout-side" onclick="ReportBuilder.selectChartLayout('side')" class="px-3 py-1 rounded-md text-xs font-bold text-slate-500 hover:text-primary">Lado a Lado (2)</button>
                                </div>
                            </div>
                        `}
                        <button type="button" onclick="ReportBuilder.insertChartBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">add_circle</span> Inserir Gráficos na Folha
                        </button>
                    </div>
                `
            })}

            <!-- CARD: RODAPÉ OFICIAL (FIXO NO RODAPÉ) -->
            ${(() => {
                const existingFtr = (currentTemplate?.blocos || []).find(b => b.tipo === 'rodape');
                const pageStart = existingFtr?.inicio_numeracao || 'primeira';
                const hasNumbering = existingFtr ? existingFtr.numeracao !== false : true;

                return renderAccordionCard({
                    id: 'acc-text-footer',
                    title: 'Rodapé Oficial',
                    icon: 'verified',
                    badge: existingFtr ? (pageStart === 'segunda' ? 'A partir da 2ª Folha' : 'Na 1ª Folha') : 'Fixo no Rodapé',
                    content: `
                        <div class="flex flex-col gap-3">
                            <p class="text-[11px] text-slate-500 dark:text-slate-400">Configurações do rodapé oficial institucional, fixo permanentemente na base inferior da folha A4 (fora do corpo da folha, abaixo da margem inferior):</p>

                            <div class="space-y-1.5 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-ftr-pages" ${hasNumbering ? 'checked' : ''} onchange="ReportBuilder.updateFooterProperty('numeracao', this.checked)" class="rounded text-primary focus:ring-0 cursor-pointer" />
                                    <span>Numeração Oficial de Páginas (Página X de Y)</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-ftr-hash" ${(existingFtr ? existingFtr.exibirHash !== false : true) ? 'checked' : ''} onchange="ReportBuilder.updateFooterProperty('exibirHash', this.checked)" class="rounded text-primary focus:ring-0 cursor-pointer" />
                                    <span>Código de Validação e Autenticidade (SHA-256)</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-ftr-qr" ${(existingFtr ? existingFtr.exibirQr !== false : true) ? 'checked' : ''} onchange="ReportBuilder.updateFooterProperty('exibirQr', this.checked)" class="rounded text-primary focus:ring-0 cursor-pointer" />
                                    <span>QR code para verificar a autenticidade online</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-ftr-date" ${(existingFtr ? existingFtr.exibirDataHora !== false : true) ? 'checked' : ''} onchange="ReportBuilder.updateFooterProperty('exibirDataHora', this.checked)" class="rounded text-primary focus:ring-0 cursor-pointer" />
                                    <span>Carimbo Temporal com Data e Hora</span>
                                </label>
                            </div>

                            <!-- Opção de Início da Numeração (1ª folha vs a partir da 2ª folha) -->
                            <div class="p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                                <label class="text-[10px] font-bold uppercase text-slate-500 block mb-1.5">Início da Numeração das Folhas</label>
                                <div class="grid grid-cols-2 gap-2" id="cfg-ftr-page-start-group">
                                    <label id="btn-ftr-start-first" 
                                           onclick="ReportBuilder.setFooterPageStart('primeira')" 
                                           class="flex items-center gap-2 p-2 rounded-xl border text-left cursor-pointer transition-all select-none ${pageStart !== 'segunda' ? 'bg-primary/10 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/30' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-300'}">
                                        <input type="radio" name="cfg-ftr-page-start" id="cfg-ftr-page-start-first" value="primeira" ${pageStart !== 'segunda' ? 'checked' : ''} onchange="ReportBuilder.setFooterPageStart('primeira')" class="w-3.5 h-3.5 text-primary focus:ring-0 cursor-pointer accent-primary" />
                                        <div class="min-w-0 flex-1">
                                            <div class="font-bold text-[11px] leading-tight flex items-center justify-between">
                                                <span>Na 1ª Folha</span>
                                                <span class="material-symbols-outlined text-[15px] ${pageStart !== 'segunda' ? 'text-primary' : 'hidden'}">check_circle</span>
                                            </div>
                                            <div class="text-[9px] opacity-75 leading-tight mt-0.5">Ex: Página 01 de 10</div>
                                        </div>
                                    </label>
                                    <label id="btn-ftr-start-second" 
                                           onclick="ReportBuilder.setFooterPageStart('segunda')" 
                                           class="flex items-center gap-2 p-2 rounded-xl border text-left cursor-pointer transition-all select-none ${pageStart === 'segunda' ? 'bg-primary/10 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/30' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-300'}">
                                        <input type="radio" name="cfg-ftr-page-start" id="cfg-ftr-page-start-second" value="segunda" ${pageStart === 'segunda' ? 'checked' : ''} onchange="ReportBuilder.setFooterPageStart('segunda')" class="w-3.5 h-3.5 text-primary focus:ring-0 cursor-pointer accent-primary" />
                                        <div class="min-w-0 flex-1">
                                            <div class="font-bold text-[11px] leading-tight flex items-center justify-between">
                                                <span>A partir da 2ª Folha</span>
                                                <span class="material-symbols-outlined text-[15px] ${pageStart === 'segunda' ? 'text-primary' : 'hidden'}">check_circle</span>
                                            </div>
                                            <div class="text-[9px] opacity-75 leading-tight mt-0.5">Começa com: Pág. 02 de 10</div>
                                        </div>
                                    </label>
                                </div>
                                <p class="text-[9.5px] text-slate-400 mt-1.5 leading-relaxed">
                                    Ao selecionar "A partir da 2ª folha", a primeira folha não exibe número e a numeração inicia na folha 2 já contando o número 2 e o total real (ex: Página 02 de 10).
                                </p>
                            </div>

                            <button type="button" onclick="ReportBuilder.insertFooterBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer">
                                <span class="material-symbols-outlined text-[16px]">vertical_align_bottom</span> Inserir Rodapé Oficial na Folha
                            </button>
                        </div>
                    `
                });
            })()}
        `;
    }

    /**
     * Helper para gerar a estrutura de um card de acordeão.
     */
    function renderAccordionCard({ id, title, icon, badge, content }) {
        const isOpen = (activeAccordionId === id);
        return `
            <div class="bg-white dark:bg-slate-800 rounded-2xl border ${isOpen ? 'border-primary/50 shadow-sm' : 'border-slate-200 dark:border-slate-700'} overflow-hidden transition-all duration-200">
                <button type="button" onclick="ReportBuilder.toggleAccordion('${id}')" class="w-full p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors select-none cursor-pointer">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-8 h-8 rounded-xl ${isOpen ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} flex items-center justify-center shrink-0 transition-colors">
                            <span class="material-symbols-outlined text-[18px]">${icon}</span>
                        </div>
                        <div class="min-w-0">
                            <span class="font-bold text-xs sm:text-sm text-slate-800 dark:text-white block truncate">${title}</span>
                            ${badge ? `<span class="text-[9px] font-bold uppercase tracking-wider text-primary dark:text-sky-400">${badge}</span>` : ''}
                        </div>
                    </div>
                    <span class="material-symbols-outlined text-[20px] text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}">expand_more</span>
                </button>
                <div class="p-4 pt-1 border-t border-slate-100 dark:border-slate-700/60 ${isOpen ? 'block' : 'hidden'}">
                    ${content}
                </div>
            </div>
        `;
    }

    /**
     * Alterna a abertura/fechamento do acordeão.
     */
    function toggleAccordion(id) {
        activeAccordionId = (activeAccordionId === id) ? null : id;
        const formId = currentTemplate ? currentTemplate.form_id : null;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) {
            panel.innerHTML = renderAccordionPanel(formId);
        }
    }

    /**
     * Renderiza os blocos da Folha A4 com visual puro de documento Word e Duplo Clique Inline.
     */
    // =====================================================================================
    // LAUDO ANALÍTICO 1:N — pré-visualização guiada pelo formulário e sequência das abas
    // =====================================================================================

    /** Abas do formulário com seus campos (as consolidadas e a nativa de orçamento não entram no laudo). */
    function getLaudoPreviewTabs(fields) {
        const formId = currentTemplate && currentTemplate.form_id;
        const tabsMeta = (window.ReportAdapter && window.ReportAdapter.getFormTabs) ? window.ReportAdapter.getFormTabs(formId) : [];
        const groups = new Map();
        (tabsMeta || []).forEach(t => {
            if (t.tabType === 'consolidated' || t.isConsolidated || t.tabType === 'orcamento_nativo' || t.isNative || t.tabType === 'reports' || t.isReportsTab) return;
            groups.set(t.id, { id: t.id, title: t.title || 'Aba', isMultiple: !!t.isMultiple, fields: [] });
        });
        (fields || []).forEach(f => {
            const tId = f.tabId || 'geral';
            if (!groups.has(tId)) {
                if (tabsMeta && tabsMeta.some(t => t.id === tId)) return; // aba consolidada/nativa: ignorada
                groups.set(tId, { id: tId, title: f.tabTitle || 'Aba Geral', isMultiple: !!f.isMultiple, fields: [] });
            }
            const g = groups.get(tId);
            if (!g.fields.some(gf => gf.id === f.id)) g.fields.push(f);
        });
        return Array.from(groups.values());
    }

    /** Como cada TIPO de campo será exibido no relatório (marcadores, não dados reais). */


    // ---- Fotos e anexos: o usuário escolhe, por campo, "Lista" (título + nome do arquivo) ou "Imagem"
    // na íntegra (com título e metadados). Guardado em bloco.campos_exibicao = { idDoCampo: 'lista'|'imagem' }.
    function isFileField(f) {
        const t = String((f && f.type) || '').toLowerCase();
        return t === 'photo' || t === 'attachment';
    }

    /** Modo efetivo do campo: o escolhido; senão foto → imagem e anexo → lista. */
    function fileFieldMode(bloco, f) {
        const m = bloco && bloco.campos_exibicao ? bloco.campos_exibicao[f.id] : null;
        if (m === 'lista' || m === 'imagem') return m;
        return String(f.type || '').toLowerCase() === 'photo' ? 'imagem' : 'lista';
    }

    function fileModeToggleHtml(index, f, mode) {
        if (!isFileField(f)) return '';
        const fid = escapeHtml(f.id);
        const btn = (m, icon, title) => '<button type="button" class="file-mode-btn px-1 py-0.5 rounded cursor-pointer transition-colors '
            + (mode === m ? 'bg-sky-100 text-sky-700' : 'text-slate-400 hover:text-sky-600') + '"'
            + ' onclick="ReportBuilder.setFieldFileMode(' + index + ", '" + fid + "', '" + m + "', event)\" title=\"" + title + '">'
            + '<span class="material-symbols-outlined text-[13px] leading-none">' + icon + '</span></button>';
        return '<div class="inline-flex items-center bg-white border border-slate-200 rounded p-0.5 shadow-2xs" title="Como exibir os arquivos deste campo">'
            + btn('lista', 'view_list', 'Lista: título e nome do arquivo')
            + btn('imagem', 'image', 'Imagem na íntegra, com título e metadados')
            + '</div>';
    }

    function setFieldFileMode(blockIndex, fieldId, mode, evt) {
        if (evt) { evt.stopPropagation(); evt.preventDefault(); }
        if (mode !== 'lista' && mode !== 'imagem') return;
        const bloco = currentTemplate && Array.isArray(currentTemplate.blocos) ? currentTemplate.blocos[blockIndex] : null;
        if (!bloco) return;
        if (!bloco.campos_exibicao) bloco.campos_exibicao = {};
        bloco.campos_exibicao[fieldId] = mode;
        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();
    }

    /**
     * Garante que o laudo tenha campos escolhidos que existam de verdade no formulário.
     * Sem escolha válida, seleciona todos os campos (exceto fotos) das abas do laudo, para que
     * arrastar, redimensionar e remover funcionem sobre campos reais.
     */
    function ensureLaudoFieldSelection(bloco, tabs) {
        if (!tabs.length) return;
        const validIds = new Set();
        tabs.forEach(t => t.fields.forEach(f => validIds.add(f.id)));
        const current = Array.isArray(bloco.campos_selecionados) ? bloco.campos_selecionados : [];
        const hasValid = current.some(cf => validIds.has(typeof cf === 'string' ? cf : (cf.rawId || cf.id)));
        if (hasValid) return;
        const generated = [];
        tabs.forEach(t => t.fields.forEach(f => {
            if (String(f.type || '').toLowerCase() === 'photo') return;
            generated.push({ id: f.id, label: f.label || f.name || f.id, rawId: f.id, tabId: t.id, tabTitle: t.title });
        }));
        bloco.campos_selecionados = generated;
        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
    }

    /**
     * Pré-visualização do Laudo Analítico na Folha A4 interativa: uma seção por aba, NA SEQUÊNCIA
     * escolhida e já ABERTA, com os campos escolhidos da aba prontos para arrastar, redimensionar ou remover.
     */
    /** Abas do laudo: as escolhidas; senão as deduzidas dos campos escolhidos; senão todas as 1:N; na sequência definida pelo usuário. */
    function laudoTabsSelecionadas(bloco, fields) {
        const allTabs = getLaudoPreviewTabs(fields);
        let selectedIds = (Array.isArray(bloco.abas_selecionadas) ? bloco.abas_selecionadas : []).map(String)
            .filter(id => allTabs.some(t => String(t.id) === id));
        if (!selectedIds.length && Array.isArray(bloco.campos_selecionados)) {
            bloco.campos_selecionados.forEach(cf => {
                const tid = (cf && typeof cf === 'object') ? String(cf.tabId || '') : '';
                if (tid && allTabs.some(t => String(t.id) === tid) && !selectedIds.includes(tid)) selectedIds.push(tid);
            });
        }
        if (!selectedIds.length) selectedIds = allTabs.filter(t => t.isMultiple).map(t => String(t.id));

        const order = ((Array.isArray(bloco.ordem_abas) && bloco.ordem_abas.length) ? bloco.ordem_abas : current1nTabOrder).map(String);
        const rank = (t) => { const i = order.indexOf(String(t.id)); return i < 0 ? 999 : i; };
        return allTabs.filter(t => selectedIds.includes(String(t.id))).sort((a, b) => rank(a) - rank(b));
    }

    /** Lista (↑ ↓) das abas do laudo, na ordem em que aparecerão no relatório. */
    function renderLaudoTabSequenceList() {
        const formId = currentTemplate && currentTemplate.form_id;
        const allFields = (window.ReportAdapter && window.ReportAdapter.getFormFields) ? window.ReportAdapter.getFormFields(formId) : [];
        const allTabs = getLaudoPreviewTabs(allFields);
        allTabs.forEach(t => { if (!current1nTabOrder.includes(t.id)) current1nTabOrder.push(t.id); });
        const block = currentTemplate && Array.isArray(currentTemplate.blocos)
            ? currentTemplate.blocos.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos') : null;
        const selected = current1nLaudoSelectedTabs.size ? current1nLaudoSelectedTabs : new Set((block && block.abas_selecionadas) || []);
        const shown = current1nTabOrder.filter(id => selected.has(id)).map(id => allTabs.find(t => t.id === id)).filter(Boolean);
        if (!shown.length) {
            return '<div class="text-[10px] italic text-slate-400 px-1">Marque abaixo as abas do laudo para definir a sequência delas.</div>';
        }
        return shown.map((t, i) => `
            <div class="flex items-center justify-between p-1.5 bg-white rounded border border-slate-200 text-xs">
                <div class="flex items-center gap-1.5 min-w-0">
                    <span class="w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">${i + 1}</span>
                    <span class="font-semibold text-slate-800 truncate">${escapeHtml(t.title)}</span>
                    <span class="text-[8.5px] font-mono text-slate-400">${t.isMultiple ? '1:N' : '1:1'}</span>
                </div>
                <div class="flex items-center gap-0.5 shrink-0">
                    <button type="button" onclick="ReportBuilder.move1nLaudoTabSequence('${escapeHtml(String(t.id))}', -1)" ${i === 0 ? 'disabled' : ''} class="p-0.5 text-slate-500 hover:text-primary disabled:opacity-30 cursor-pointer" title="Mover para cima">
                        <span class="material-symbols-outlined text-[14px]">arrow_upward</span>
                    </button>
                    <button type="button" onclick="ReportBuilder.move1nLaudoTabSequence('${escapeHtml(String(t.id))}', 1)" ${i === shown.length - 1 ? 'disabled' : ''} class="p-0.5 text-slate-500 hover:text-primary disabled:opacity-30 cursor-pointer" title="Mover para baixo">
                        <span class="material-symbols-outlined text-[14px]">arrow_downward</span>
                    </button>
                </div>
            </div>`).join('');
    }

    function refreshLaudoTabSequenceList() {
        const el = document.getElementById('cfg-1n-laudo-tab-sequence-list');
        if (el) el.innerHTML = renderLaudoTabSequenceList();
    }

    /** Move uma aba do laudo para cima/baixo entre as abas escolhidas para o laudo. */
    function move1nLaudoTabSequence(tabId, direction) {
        sync1nSelectedFieldsFromDOM();
        const shown = current1nTabOrder.filter(id => current1nLaudoSelectedTabs.has(id));
        const i = shown.indexOf(tabId);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= shown.length) return;
        const a = current1nTabOrder.indexOf(shown[i]);
        const b = current1nTabOrder.indexOf(shown[j]);
        const tmp = current1nTabOrder[a];
        current1nTabOrder[a] = current1nTabOrder[b];
        current1nTabOrder[b] = tmp;

        if (currentTemplate && Array.isArray(currentTemplate.blocos)) {
            currentTemplate.blocos.forEach(bl => {
                if (bl.tipo === 'tabela_sintetica_1n' || bl.tipo === 'galeria_fotos' || bl.tipo === 'laudo_vistoria_fotos') {
                    bl.ordem_abas = [...current1nTabOrder];
                }
            });
            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                window.ReportAdapter.saveReportTemplate(currentTemplate);
            }
            renderA4Blocks();
        }
        refreshLaudoTabSequenceList();
    }

    function renderA4Blocks() {
        const container = document.getElementById('a4-blocks-list');
        if (!container || !currentTemplate) return;

        if (!Array.isArray(currentTemplate.blocos) || currentTemplate.blocos.length === 0) {
            container.innerHTML = `
                <div class="p-12 text-center border-2 border-dashed border-slate-300/80 rounded-2xl text-slate-400 my-10 print:hidden select-none">
                    <span class="material-symbols-outlined text-5xl mb-2 text-slate-300">description</span>
                    <p class="text-sm font-bold text-slate-600">A folha virtual A4 está em branco</p>
                    <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Abra as gavetas do painel lateral esquerdo, ajuste os parâmetros e clique em "Inserir na Folha".</p>
                </div>
            `;
            return;
        }

        const fields = window.ReportAdapter.getFormFields(currentTemplate.form_id);
        const charts = window.ReportAdapter.getExistingCharts(currentTemplate.form_id);

        const headerSlot = document.getElementById('a4-header-slot');
        const footerSlot = document.getElementById('a4-footer-slot');

        // 1. Renderiza o Cabeçalho Institucional no slot superior (FORA DO CORPO, ACIMA DA MARGEM SUPERIOR)
        const hdrIndex = currentTemplate.blocos.findIndex(b => b.tipo === 'cabecalho');
        if (headerSlot) {
            if (hdrIndex !== -1) {
                const hdrBloco = currentTemplate.blocos[hdrIndex];
                headerSlot.innerHTML = `
                    <div class="report-block-item group relative transition-all print:border-none print:p-0 print:bg-transparent page-break-avoid w-full" data-block-id="${hdrBloco.id || hdrIndex}">
                        <!-- Barra de Controle Flutuante no Hover (Posicionada à esquerda para não sobrepor metadados à direita) -->
                        <div class="absolute -top-3.5 left-2 hidden group-hover:flex items-center gap-1 bg-slate-900/90 text-white rounded-lg shadow-md px-1.5 py-0.5 z-30 select-none print:hidden backdrop-blur-xs">
                            <div class="flex items-center gap-1 text-slate-300 px-1" title="Cabeçalho Oficial Institucional (Acima da Margem Superior)">
                                <span class="material-symbols-outlined text-[15px]">account_balance</span>
                                <span class="text-[9px] font-mono uppercase">CABEÇALHO INSTITUCIONAL</span>
                            </div>
                            <div class="h-3 w-px bg-slate-700 mx-0.5"></div>
                            <button type="button" onclick="ReportBuilder.removeBlock(${hdrIndex})" class="p-0.5 hover:text-red-400 cursor-pointer ml-1" title="Remover Cabeçalho da Folha">
                                <span class="material-symbols-outlined text-[14px]">close</span>
                            </button>
                        </div>
                        <div class="absolute inset-0 border border-transparent group-hover:border-sky-400/40 rounded-lg pointer-events-none transition-colors print:hidden"></div>
                        <div class="w-full relative z-10">
                            ${renderBlockContent(hdrBloco, hdrIndex, fields, charts)}
                        </div>
                    </div>
                `;
            } else {
                headerSlot.innerHTML = '';
            }
        }

        // 2. Renderiza o Rodapé Oficial no slot inferior (FORA DO CORPO, ABAIXO DA MARGEM INFERIOR)
        const ftrIndex = currentTemplate.blocos.findIndex(b => b.tipo === 'rodape');
        if (footerSlot) {
            if (ftrIndex !== -1) {
                const ftrBloco = currentTemplate.blocos[ftrIndex];
                footerSlot.innerHTML = `
                    <div class="report-block-item group relative transition-all print:border-none print:p-0 print:bg-transparent page-break-avoid w-full mt-auto" data-block-id="${ftrBloco.id || ftrIndex}">
                        <!-- Barra de Controle Flutuante no Hover (Posicionada à esquerda para não sobrepor metadados à direita) -->
                        <div class="absolute -top-3.5 left-2 hidden group-hover:flex items-center gap-1 bg-slate-900/90 text-white rounded-lg shadow-md px-1.5 py-0.5 z-30 select-none print:hidden backdrop-blur-xs">
                            <div class="flex items-center gap-1 text-slate-300 px-1" title="Rodapé Oficial Fixo na Base da Folha (Abaixo da Margem Inferior)">
                                <span class="material-symbols-outlined text-[15px]">lock</span>
                                <span class="text-[9px] font-mono uppercase">RODAPÉ FIXO</span>
                            </div>
                            <div class="h-3 w-px bg-slate-700 mx-0.5"></div>
                            <button type="button" onclick="ReportBuilder.removeBlock(${ftrIndex})" class="p-0.5 hover:text-red-400 cursor-pointer ml-1" title="Remover Rodapé da Folha">
                                <span class="material-symbols-outlined text-[14px]">close</span>
                            </button>
                        </div>
                        <div class="absolute inset-0 border border-transparent group-hover:border-sky-400/40 rounded-lg pointer-events-none transition-colors print:hidden"></div>
                        <div class="w-full relative z-10">
                            ${renderBlockContent(ftrBloco, ftrIndex, fields, charts)}
                        </div>
                    </div>
                `;
            } else {
                footerSlot.innerHTML = '';
            }
        }

        // 3. Renderiza os blocos reais do corpo da folha (delimitados pelas margens superior e inferior)
        let html = '';
        currentTemplate.blocos.forEach((bloco, index) => {
            if (bloco.tipo === 'cabecalho' || bloco.tipo === 'rodape') return;

            let blockContentHtml = '';
            try {
                blockContentHtml = renderBlockContent(bloco, index, fields, charts);
            } catch (blockErr) {
                console.error(`[ReportBuilder] Erro ao renderizar bloco [${bloco.tipo}] (índice ${index}):`, blockErr);
                blockContentHtml = `
                    <div class="p-3 border border-dashed border-amber-300 bg-amber-50 rounded text-amber-800 text-xs">
                        <strong>Aviso de Renderização:</strong> Não foi possível pré-visualizar o bloco <em>${bloco.tipo}</em>.
                        <div class="text-[10px] text-amber-600 font-mono mt-1">${blockErr?.message || blockErr}</div>
                    </div>
                `;
            }

            html += `
                <div class="report-block-item group relative transition-all print:border-none print:p-0 print:bg-transparent page-break-avoid w-full" data-block-id="${bloco.id || index}">
                    <!-- Barra de Controle Flutuante no Hover (Posicionada à direita para não cobrir os campos que o usuário edita à esquerda) -->
                    <div class="absolute -top-3.5 right-2 hidden group-hover:flex items-center gap-1 bg-slate-900/90 text-white rounded-lg shadow-md px-1.5 py-0.5 z-30 select-none print:hidden backdrop-blur-xs">
                        <div class="flex items-center gap-1 cursor-grab active:cursor-grabbing drag-handle text-slate-300 hover:text-white px-1" title="Arrastar Bloco">
                            <span class="material-symbols-outlined text-[15px]">drag_indicator</span>
                            <span class="text-[9px] font-mono uppercase">${getBlockTypeName(bloco.tipo)}</span>
                        </div>
                        <div class="h-3 w-px bg-slate-700 mx-0.5"></div>
                        <button type="button" onclick="ReportBuilder.moveBlock(${index}, -1)" class="p-0.5 hover:text-sky-300 cursor-pointer" title="Mover para cima">
                            <span class="material-symbols-outlined text-[14px]">arrow_upward</span>
                        </button>
                        <button type="button" onclick="ReportBuilder.moveBlock(${index}, 1)" class="p-0.5 hover:text-sky-300 cursor-pointer" title="Mover para baixo">
                            <span class="material-symbols-outlined text-[14px]">arrow_downward</span>
                        </button>
                        <div class="h-3 w-px bg-slate-700 mx-0.5"></div>
                        <button type="button" onclick="ReportBuilder.removeBlock(${index})" class="p-0.5 hover:text-red-400 cursor-pointer ml-1" title="Remover Bloco da Folha">
                            <span class="material-symbols-outlined text-[14px]">close</span>
                        </button>
                    </div>

                    <!-- Borda sutil de foco ao passar o mouse (apenas no editor, invisível no print) -->
                    <div class="absolute inset-0 border border-transparent group-hover:border-sky-400/40 rounded-lg pointer-events-none transition-colors print:hidden"></div>

                    <!-- Conteúdo Tipográfico Real do Bloco (Estilo Processador de Texto Word) -->
                    <div class="w-full relative z-10">
                        ${blockContentHtml}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        initSortable();
        initGridFieldsSortable();
    }

    function getFieldWidthStyle(pct) {
        const p = Math.max(15, Math.min(100, Math.round(pct || 50)));
        if (p >= 98) return '100%';
        const gap = 10;
        const deduction = Math.round((gap * (1 - p / 100)) * 10) / 10;
        return `calc(${p}% - ${deduction}px)`;
    }

    /**
     * Renderiza o conteúdo do bloco com suporte a Duplo-Clique Inline em todos os textos.
     */
    function renderBlockContent(bloco, index, fields, charts) {
        switch (bloco.tipo) {
            case 'cabecalho':
                return renderCabecalhoReal(bloco, index, fields);

            case 'grade_campos': {
                const colCount = bloco.colunasLayout || 2;
                if (!bloco.campos_spans) bloco.campos_spans = {};
                if (!bloco.campos_larguras) bloco.campos_larguras = {};
                // Desenho REAL (o mesmo do relatório) com os dados da feição de teste; os controles de edição ficam por cima
                return renderGradeReal(bloco, index, fields, colCount);
            }

            case 'mapa_estatico':
                if (bloco.modo === 'temporal') {
                    // SÉRIE MULTITEMPORAL DE ORTOFOTOS HISTÓRICAS
                    return `
                        <div class="mb-4">
                            <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between">
                                <span class="cursor-text hover:bg-sky-50 px-1 rounded whitespace-pre-line" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${(escapeHtml(bloco.titulo || 'Análise Multitemporal de Ortofotos')).replace(/\r?\n/g, '<br>')}</span>
                                <span class="text-[10px] font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-bold border border-amber-200">Série Histórica Decrescente</span>
                            </div>
                            
                            <!-- Grid Temporal (3 voos comparativos) -->
                            <div class="grid grid-cols-3 gap-3">
                                ${['Voo Aerofotogramétrico 2026', 'Levantamento 2023', 'Ortofoto Base 2020'].map((vooNome, vIdx) => `
                                    <div class="border border-slate-300 rounded-lg overflow-hidden bg-slate-100 flex flex-col">
                                        <div class="bg-slate-800 text-white px-2 py-1 flex items-center justify-between text-[10px] font-mono">
                                            <span>${vooNome}</span>
                                            <span class="text-emerald-400 font-bold">Voo #${3 - vIdx}</span>
                                        </div>
                                        <div class="h-32 bg-slate-900 relative flex items-center justify-center overflow-hidden">
                                            <!-- Polígono vetorizado em destaque por cima da ortofoto -->
                                            <div class="w-16 h-12 border-2 border-emerald-400 bg-emerald-500/30 rounded flex items-center justify-center text-[10px] text-white font-bold shadow-lg">
                                                Lote ${vIdx + 1}
                                            </div>
                                            <div class="absolute bottom-1 right-1 bg-black/70 text-white text-[8px] font-mono px-1 rounded">
                                                GSD 8cm
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>

                            <!-- Resumo das Cotas e Dimensões -->
                            ${bloco.exibirCotas ? `
                                <div class="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between text-xs font-mono text-slate-700">
                                    <div class="flex items-center gap-2">
                                        <span class="font-bold text-emerald-700">Dimensões Perimetrais:</span>
                                        <span>L1: 25.40m • L2: 40.20m • L3: 25.10m • L4: 39.80m</span>
                                    </div>
                                    <div class="font-bold text-slate-900">Área: 1.012,40 m² (0,1012 ha)</div>
                                </div>
                            ` : ''}

                            <!-- Elementos Cartográficos Oficiais -->
                            <div class="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1.5 px-1">
                                <div>Projeção: SIRGAS 2000 UTM Fuso 25S • Escala 1:2.500</div>
                                <div class="cursor-text hover:bg-sky-50 px-1 rounded whitespace-pre-line" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'notaTecnica')">${(escapeHtml(bloco.notaTecnica || 'Vetorização e cotas georreferenciadas')).replace(/\r?\n/g, '<br>')}</div>
                            </div>
                        </div>
                    `;
                }

                // MAPA COM A FEIÇÃO REAL (pré-visualização esquemática; o mapa de verdade aparece no relatório)
                {
                    const mc = window.MapTools ? window.MapTools.normalizeMapConfig(bloco) : { destaque: { ativo: true, cor: '#10b981', esmaecerEntorno: false }, baseMap: 'osm', camadasVizinhas: true, norte: true, escala: true, projecao: true, alturaMm: 90, medidas: { ativo: true, lados: true, total: true, perimetro: false }, pontos: { ativo: false, sistema: 'utm', tabela: true, memorial: false }, temporal: { ativo: false, ordem: 'asc', colunas: 2, alturaMm: 70, sincronizar: true, contorno: true, excluidas: [] }, rotulos: { ativo: false, campo: 'rotulo' }, confrontantes: { ativo: false }, referencia: { ativo: false }, comparacaoArea: { ativo: false }, situacao: { ativo: false }, quadriculado: { ativo: false } };
                    const chip = (txt, pos) => `<span class="absolute ${pos} text-[9px] font-mono font-bold text-emerald-800 bg-white/90 border border-emerald-300 px-1 rounded">${txt}</span>`;
                    const bg = mc.baseMap === 'satelite' ? 'bg-slate-800' : (mc.baseMap === 'nenhum' ? 'bg-white' : 'bg-slate-200');
                    const px = Math.round(mc.alturaMm * 3.78);
                    return `
                    <div class="mb-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between">
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded whitespace-pre-line" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${(escapeHtml(bloco.titulo || 'Delimitação Cartográfica do Imóvel')).replace(/\r?\n/g, '<br>')}</span>
                            <span class="text-[10px] font-mono text-slate-400">Pré-visualização esquemática</span>
                        </div>
                        <div class="${bg} border border-slate-300 rounded-lg relative flex items-center justify-center overflow-hidden" style="height: ${px}px;">
                            ${mc.destaque.ativo ? `
                                <div class="relative flex items-center justify-center text-center" style="width: 34%; height: 46%; border: 3px solid ${escapeHtml(mc.destaque.cor)}; background: ${escapeHtml(mc.destaque.cor)}59; border-radius: 3px; box-shadow: ${mc.destaque.esmaecerEntorno ? '0 0 0 9999px rgba(255,255,255,0.6)' : 'none'};">
                                    <span class="text-[10px] font-bold ${mc.baseMap === 'satelite' ? 'text-white' : 'text-slate-800'}">Feição do relatório</span>
                                    ${(mc.medidas.ativo && mc.medidas.lados) ? chip('25,40 m', '-top-3') + chip('25,10 m', '-bottom-3') + chip('40,20 m', '-left-9 top-1/2') + chip('39,80 m', '-right-9 top-1/2') : ''}
                                    ${(mc.medidas.ativo && mc.medidas.total) ? chip('Área 1.012,40 m²', 'top-[58%]') : ''}
                                </div>
                            ` : '<span class="text-[10px] text-slate-500">Destaque desligado</span>'}
                            ${mc.norte ? `
                                <div class="absolute top-2 right-2 bg-black/70 p-1 rounded-lg flex flex-col items-center text-white text-[9px] font-bold">
                                    <span class="material-symbols-outlined text-[18px] text-amber-400">navigation</span><span>N</span>
                                </div>` : ''}
                            ${(mc.escala || mc.projecao) ? `
                                <div class="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-white text-[9px] font-mono flex items-center gap-2">
                                    ${mc.escala ? '<div class="w-14 h-1 bg-white border border-black"></div><span>Escala</span>' : ''}
                                    ${(mc.escala && mc.projecao) ? '<span class="text-slate-400">|</span>' : ''}
                                    ${mc.projecao ? '<span>SIRGAS 2000 / UTM (zona da feição)</span>' : ''}
                                </div>` : ''}
                            ${mc.baseMap !== 'nenhum' ? `<div class="absolute bottom-2 right-2 text-[8px] text-slate-600 bg-white/80 px-1 rounded">${mc.baseMap === 'satelite' ? 'Imagens © Esri' : '© OpenStreetMap'}</div>` : ''}
                        </div>
                        ${mc.temporal && mc.temporal.ativo ? `<div class="mt-1.5 text-[10px] text-slate-500 px-1 flex items-center gap-1"><span class="material-symbols-outlined text-[13px] text-amber-600">history_toggle_off</span>Análise temporal: um mapa por ortofoto que cubra a feição (${mc.temporal.colunas} coluna(s), ${mc.temporal.ordem === 'desc' ? 'recente → antiga' : 'antiga → recente'}) sai abaixo do mapa.</div>` : ''}
                        ${mc.pontos && mc.pontos.ativo ? `<div class="mt-1.5 text-[10px] text-slate-500 px-1 flex items-center gap-1"><span class="material-symbols-outlined text-[13px] text-rose-500">location_on</span>O usuário marca pontos nos vértices; a tabela${mc.pontos.memorial ? ' com memorial descritivo' : ''} sai abaixo do mapa (${escapeHtml((window.MapTools ? (window.MapTools.COORD_SYSTEMS.find(s => s.id === mc.pontos.sistema) || {}).label : '') || 'SIRGAS 2000 / UTM')}).</div>` : ''}
                        <div class="mt-1.5 text-[10px] text-slate-500 font-mono px-1">
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded whitespace-pre-line" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'notaTecnica')">${(escapeHtml(bloco.notaTecnica || 'Delimitação cadastral georreferenciada.')).replace(/\r?\n/g, '<br>')}</span>
                        </div>
                    </div>
                    `;
                }

            case 'grafico_existente': {
                const isSide = bloco.layout === 'lado_a_lado';
                return `
                    <div class="mb-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2.5 flex items-center justify-between">
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded whitespace-pre-line" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${(escapeHtml(bloco.titulo || 'Estatísticas do Dashboard')).replace(/\r?\n/g, '<br>')}</span>
                            <span class="text-[10px] font-mono text-slate-400">${isSide ? 'Lado a Lado' : 'Largura Total'}</span>
                        </div>
                        <div class="grid ${isSide ? 'grid-cols-2' : 'grid-cols-1'} gap-3">
                            <div class="h-44 border border-slate-200 rounded-lg p-3 bg-white flex flex-col items-center justify-center text-center">
                                <div class="w-24 h-24 rounded-full border-8 border-primary border-t-amber-400 border-r-emerald-400 mb-2 flex items-center justify-center font-bold text-xs text-slate-700">
                                    Gráfico
                                </div>
                                <div class="text-[10px] font-bold text-slate-600 uppercase">${escapeHtml(bloco.titulo || 'Distribuição')}</div>
                            </div>
                            ${isSide ? `
                                <div class="h-44 border border-slate-200 rounded-lg p-3 bg-white flex flex-col items-center justify-center text-center">
                                    <div class="flex items-end gap-2 h-20 w-32 justify-center mb-2">
                                        <div class="w-5 bg-primary h-14 rounded-t"></div>
                                        <div class="w-5 bg-emerald-500 h-20 rounded-t"></div>
                                        <div class="w-5 bg-amber-500 h-10 rounded-t"></div>
                                    </div>
                                    <div class="text-[10px] font-bold text-slate-600 uppercase">Evolução por Categoria</div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }

            case 'kpis':
                return `
                    <div class="mb-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2.5 flex items-center justify-between">
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded whitespace-pre-line" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${(escapeHtml(bloco.titulo || 'Indicadores Territoriais (KPIs)')).replace(/\r?\n/g, '<br>')}</span>
                            <span class="text-[10px] font-mono text-slate-400">Totalizadores</span>
                        </div>
                        <div class="grid grid-cols-4 gap-2.5">
                            <div class="p-2.5 border border-slate-200 rounded-lg bg-white shadow-2xs">
                                <div class="text-[9px] uppercase font-bold text-slate-400">Total Imóveis</div>
                                <div class="text-base font-black text-slate-900 mt-0.5">1.248</div>
                                <div class="text-[9px] text-emerald-600 font-semibold mt-0.5">100% Cobertura</div>
                            </div>
                            <div class="p-2.5 border border-slate-200 rounded-lg bg-white shadow-2xs">
                                <div class="text-[9px] uppercase font-bold text-slate-400">Área Média</div>
                                <div class="text-base font-black text-slate-900 mt-0.5">450,20 m²</div>
                                <div class="text-[9px] text-slate-500 font-mono mt-0.5">AVG Lotes</div>
                            </div>
                            <div class="p-2.5 border border-slate-200 rounded-lg bg-white shadow-2xs">
                                <div class="text-[9px] uppercase font-bold text-slate-400">Área Total</div>
                                <div class="text-base font-black text-slate-900 mt-0.5">56,18 ha</div>
                                <div class="text-[9px] text-primary font-semibold mt-0.5">561.849 m²</div>
                            </div>
                            <div class="p-2.5 border border-slate-200 rounded-lg bg-white shadow-2xs">
                                <div class="text-[9px] uppercase font-bold text-slate-400">Regularidade</div>
                                <div class="text-base font-black text-emerald-600 mt-0.5">92,4%</div>
                                <div class="text-[9px] text-emerald-600 font-semibold mt-0.5">Situação Regular</div>
                            </div>
                        </div>
                    </div>
                `;

            case 'tabela_sintetica_1n':
                return renderSinteticaReal(bloco, index, fields);

            case 'laudo_vistoria_fotos':
            case 'galeria_fotos': {
                return renderLaudoReal(bloco, index, fields);
            }

            case 'tabela_sintetica': {
                const colunas = (bloco.colunas && bloco.colunas.length > 0) ? bloco.colunas : fields.slice(0, 5).map(f => f.id);
                const colHeaders = colunas.map(cId => {
                    const f = fields.find(item => item.id === cId);
                    return f ? f.label : cId;
                });

                return `
                    <div class="mb-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between">
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded whitespace-pre-line" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${(escapeHtml(bloco.titulo || 'Quadro Sintético de Imóveis')).replace(/\r?\n/g, '<br>')}</span>
                            <span class="text-[10px] font-mono text-slate-400">${colHeaders.length} Colunas</span>
                        </div>
                        <div class="border border-slate-200 rounded-lg overflow-hidden">
                            <table class="w-full text-left text-[11px] border-collapse">
                                <thead>
                                    <tr class="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-700 uppercase">
                                        <th class="p-2 border-r border-slate-200 w-10 text-center">#</th>
                                        ${colHeaders.map(ch => `<th class="p-2 border-r last:border-r-0 border-slate-200">${ch}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 bg-white">
                                    ${[1, 2, 3].map(row => `
                                        <tr class="hover:bg-slate-50">
                                            <td class="p-2 text-center text-slate-400 font-mono border-r border-slate-100">${row}</td>
                                            ${colHeaders.map(ch => `<td class="p-2 border-r last:border-r-0 border-slate-100 text-slate-700">[${ch}]</td>`).join('')}
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }

            case 'tabela_analitica':
                return `
                    <div class="mb-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between">
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded whitespace-pre-line" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${(escapeHtml(bloco.titulo || 'Quadro Analítico Aprofundado')).replace(/\r?\n/g, '<br>')}</span>
                            <span class="text-[10px] font-mono text-primary font-bold">Quebra por ${escapeHtml(bloco.grupo || 'Bairro')}</span>
                        </div>
                        <div class="border border-slate-200 rounded-lg overflow-hidden text-xs">
                            <!-- Seção Agrupada 1 -->
                            <div class="bg-slate-100 px-3 py-1.5 font-bold text-slate-800 flex items-center justify-between border-b border-slate-200">
                                <span>Grupo: Setor Central / Bairro Centro</span>
                                <span class="text-[10px] font-mono text-slate-500">42 Imóveis</span>
                            </div>
                            <div class="p-2.5 bg-white space-y-2">
                                <div class="flex items-center justify-between text-[11px] pb-1 border-b border-slate-100">
                                    <div><span class="font-bold">Lote 01-A</span> • Matrícula: 14.890 • Inscrição: 01.02.003</div>
                                    <div class="font-mono text-slate-600">Área: 450,00 m²</div>
                                </div>
                                <div class="text-[10px] text-slate-500 bg-slate-50 p-1.5 rounded">
                                    Descrição Analítica: Imóvel predial regularizado, com infraestrutura de água, energia e pavimentação asfáltica.
                                </div>
                            </div>
                            <!-- Subtotal do Grupo -->
                            <div class="bg-slate-50 px-3 py-1 text-[10px] font-mono font-bold text-slate-700 flex justify-between border-t border-slate-200">
                                <span>Subtotal do Grupo:</span>
                                <span>Área Acumulada: 18.900,00 m²</span>
                            </div>
                        </div>
                    </div>
                `;

            case 'caixa_texto_livre':
            case 'texto_livre': {
                const lineHeight = bloco.espacamento || '1.6';
                const textAlign = bloco.alinhamento || 'justify';
                return `
                    <style>
                        .mention-tag { user-select: all; cursor: pointer; transition: all 0.15s ease-in-out; }
                        .mention-tag[data-format-bold="true"], .mention-tag.font-bold, .mention-tag.font-black, .mention-tag.is-bold { font-weight: 700 !important; }
                        .mention-tag[data-format-italic="true"], .mention-tag.italic { font-style: italic !important; }
                        .mention-tag[data-format-underline="true"], .mention-tag.underline { text-decoration: underline !important; text-underline-offset: 2px !important; }
                    </style>
                    <div class="mb-4 caixa-texto-livre-block page-break-avoid" data-block-index="${index}">
                        ${bloco.titulo ? `
                            <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-1.5 flex items-center justify-between">
                                <span class="cursor-text hover:bg-sky-50 px-1 rounded whitespace-pre-line" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${(escapeHtml(bloco.titulo)).replace(/\r?\n/g, '<br>')}</span>
                                <span class="text-[10px] font-mono text-slate-400 no-print">Caixa de Texto Livre</span>
                            </div>
                        ` : ''}

                        <!-- Barra de Ferramentas Rica (Negrito, Itálico, Sublinhado, Alinhamento, Espaçamento e @) -->
                        <div class="rich-text-toolbar no-print flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-t-lg select-none text-slate-700 dark:text-slate-200 text-xs">
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('bold')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded font-bold transition-colors cursor-pointer" title="Negrito (Ctrl+B)">
                                <span class="material-symbols-outlined text-[16px]">format_bold</span>
                            </button>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('italic')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded italic transition-colors cursor-pointer" title="Itálico (Ctrl+I)">
                                <span class="material-symbols-outlined text-[16px]">format_italic</span>
                            </button>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('underline')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded underline transition-colors cursor-pointer" title="Sublinhado (Ctrl+U)">
                                <span class="material-symbols-outlined text-[16px]">format_underlined</span>
                            </button>
                            <div class="h-3.5 w-px bg-slate-300 dark:bg-slate-600 mx-0.5"></div>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('justifyLeft')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded transition-colors cursor-pointer" title="Alinhar à Esquerda">
                                <span class="material-symbols-outlined text-[16px]">format_align_left</span>
                            </button>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('justifyCenter')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded transition-colors cursor-pointer" title="Centralizar">
                                <span class="material-symbols-outlined text-[16px]">format_align_center</span>
                            </button>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('justifyRight')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded transition-colors cursor-pointer" title="Alinhar à Direita">
                                <span class="material-symbols-outlined text-[16px]">format_align_right</span>
                            </button>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('justifyFull')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded transition-colors cursor-pointer" title="Justificar">
                                <span class="material-symbols-outlined text-[16px]">format_align_justify</span>
                            </button>
                            <div class="h-3.5 w-px bg-slate-300 dark:bg-slate-600 mx-0.5"></div>
                            <select onchange="ReportBuilder.changeLineHeight(${index}, this.value)" class="text-[10.5px] py-0.5 px-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded cursor-pointer" title="Espaçamento entre linhas">
                                <option value="1.2" ${lineHeight === '1.2' ? 'selected' : ''}>Linhas 1.2</option>
                                <option value="1.4" ${lineHeight === '1.4' ? 'selected' : ''}>Linhas 1.4</option>
                                <option value="1.6" ${lineHeight === '1.6' ? 'selected' : ''}>Linhas 1.6 (Padrão)</option>
                                <option value="2.0" ${lineHeight === '2.0' ? 'selected' : ''}>Linhas 2.0 (Duplo)</option>
                            </select>
                            <div class="h-3.5 w-px bg-slate-300 dark:bg-slate-600 mx-0.5"></div>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.showMentionDropdown(${index})" class="px-2 py-0.5 bg-sky-100 hover:bg-sky-200 dark:bg-sky-900/60 dark:hover:bg-sky-800 text-sky-800 dark:text-sky-200 rounded font-bold text-[10.5px] flex items-center gap-1 cursor-pointer transition-colors" title="Inserir Campo Cadastral (@)">
                                <span class="material-symbols-outlined text-[14px]">alternate_email</span>
                                <span>@ Inserir Campo</span>
                            </button>
                        </div>

                        <!-- Editor de Texto Livre com suporte a @mention e quebras normais -->
                        <div class="relative">
                            <div id="free-text-editor-${index}" 
                                 contenteditable="true" 
                                 spellcheck="true"
                                 class="free-text-editor min-h-[60px] text-xs text-slate-800 dark:text-slate-900 p-3 bg-white border border-slate-200 rounded-b-lg focus:outline-none focus:ring-1 focus:ring-sky-500/50 transition-all cursor-text print:border-none print:p-0" 
                                 style="white-space: pre-wrap; line-height: ${lineHeight}; text-align: ${textAlign};" 
                                 oninput="ReportBuilder.handleFreeTextInput(event, ${index})" 
                                 onkeydown="ReportBuilder.handleFreeTextKeyDown(event, ${index})"
                                 onblur="ReportBuilder.saveFreeTextContent(${index}, this.innerHTML)">${bloco.conteudo || 'Digite seu texto livre aqui...'}</div>
                            
                            <!-- Dropdown de Autocomplete @ (injetado via JS com identificação de Abas) -->
                            <div id="mention-dropdown-${index}" class="hidden absolute left-2 top-2 z-50 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl max-h-72 w-80 sm:w-96 overflow-y-auto p-1.5 text-xs"></div>
                        </div>
                    </div>
                `;
            }

            case 'rodape':
                return renderRodapeReal(bloco, fields);

            default:
                return `<div class="text-xs text-slate-400 italic p-2">Bloco de tipo [${bloco.tipo}]</div>`;
        }
    }

    /**
     * Habilita a edição inline por Duplo Clique estilo Word em qualquer texto livre ou título.
     */
    function enableInlineEdit(element, blockIndex, propertyPath) {
        if (!element) return;
        element.contentEditable = "true";
        element.focus();
        element.classList.add('ring-2', 'ring-primary', 'ring-offset-1', 'rounded-xs', 'bg-primary/5', 'whitespace-pre-line');

        function onKeyDown(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                element.blur();
            }
        }
        element.addEventListener('keydown', onKeyDown);

        function onBlur() {
            element.contentEditable = "false";
            element.classList.remove('ring-2', 'ring-primary', 'ring-offset-1', 'rounded-xs', 'bg-primary/5');
            element.removeEventListener('keydown', onKeyDown);
            let newValue = element.innerText || '';
            if (newValue.endsWith('\n')) newValue = newValue.slice(0, -1);
            updateBlockProperty(blockIndex, propertyPath, newValue.trim());
            element.removeEventListener('blur', onBlur);
            renderA4Blocks();
        }
        element.addEventListener('blur', onBlur);
    }

    function updateBlockProperty(blockIndex, propPath, value) {
        if (!currentTemplate || !currentTemplate.blocos || !currentTemplate.blocos[blockIndex]) return;
        currentTemplate.blocos[blockIndex][propPath] = value;
        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
    }

    function getBlockTypeName(tipo) {
        const map = {
            'cabecalho': 'Cabeçalho Oficial',
            'grade_campos': 'Grade de Atributos',
            'mapa_estatico': 'Mini-Mapa Cartográfico',
            'grafico_existente': 'Gráficos do Dashboard',
            'kpis': 'Painel de Indicadores',
            'galeria_fotos': 'Vistoria Fotográfica',
            'tabela_sintetica': 'Tabela Sintética',
            'tabela_analitica': 'Tabela Analítica',
            'texto_livre': 'Parecer Técnico',
            'rodape': 'Rodapé Oficial'
        };
        return map[tipo] || tipo;
    }

    function initSortable() {
        const container = document.getElementById('a4-blocks-list');
        if (!container || typeof Sortable === 'undefined') return;

        if (sortableInstance) {
            sortableInstance.destroy();
        }

        sortableInstance = new Sortable(container, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'opacity-40',
            onEnd: function(evt) {
                if (evt.oldIndex !== evt.newIndex && currentTemplate && currentTemplate.blocos) {
                    const movedItem = currentTemplate.blocos.splice(evt.oldIndex, 1)[0];
                    currentTemplate.blocos.splice(evt.newIndex, 0, movedItem);
                    if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                        window.ReportAdapter.saveReportTemplate(currentTemplate);
                    }
                }
            }
        });
    }

    let gridSortableInstances = [];
    function initGridFieldsSortable() {
        gridSortableInstances.forEach(inst => {
            try { inst.destroy(); } catch(e) {}
        });
        gridSortableInstances = [];

        if (typeof Sortable === 'undefined') return;

        const gridContainers = document.querySelectorAll('.a4-grid-fields-container');
        gridContainers.forEach(container => {
            const blockIndex = parseInt(container.getAttribute('data-block-index'), 10);
            if (isNaN(blockIndex) || !currentTemplate || !currentTemplate.blocos || !currentTemplate.blocos[blockIndex]) return;

            const inst = new Sortable(container, {
                handle: '.field-drag-handle',
                animation: 200,
                direction: 'horizontal',
                swapThreshold: 0.65,
                invertSwap: true,
                emptyInsertThreshold: 5,
                ghostClass: 'opacity-40',
                chosenClass: 'ring-2',
                onEnd: function(evt) {
                    const bloco = currentTemplate.blocos[blockIndex];
                    if (!bloco || !Array.isArray(bloco.campos_selecionados)) return;

                    // Reordena campos_selecionados com base na ordem real dos elementos no DOM do container
                    const newContainerOrder = Array.from(container.children)
                        .map(el => el.getAttribute('data-field-id'))
                        .filter(Boolean);

                    if (newContainerOrder.length > 0) {
                        // Mapeia posições atuais dos itens desse container dentro de bloco.campos_selecionados
                        const indicesInBloco = [];
                        bloco.campos_selecionados.forEach((cf, idx) => {
                            const cId = typeof cf === 'string' ? cf : (cf.rawId || cf.id);
                            if (newContainerOrder.includes(cId)) {
                                indicesInBloco.push(idx);
                            }
                        });

                        // Se encontrou os itens correspondentes, reorganiza as posições relativas
                        if (indicesInBloco.length === newContainerOrder.length) {
                            const itemMap = new Map();
                            indicesInBloco.forEach(idx => {
                                const cf = bloco.campos_selecionados[idx];
                                const cId = typeof cf === 'string' ? cf : (cf.rawId || cf.id);
                                itemMap.set(cId, cf);
                            });

                            indicesInBloco.forEach((slotIdx, i) => {
                                const targetFieldId = newContainerOrder[i];
                                if (itemMap.has(targetFieldId)) {
                                    bloco.campos_selecionados[slotIdx] = itemMap.get(targetFieldId);
                                }
                            });

                            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                                window.ReportAdapter.saveReportTemplate(currentTemplate);
                            }
                            renderA4Blocks();
                        }
                    }
                }
            });
            gridSortableInstances.push(inst);
        });
    }

    const FIELD_WIDTH_STEPS = [25, 33, 50, 66, 75, 100];

    function changeFieldWidthStep(blockIndex, fieldId, direction, evt) {
        if (evt) {
            evt.stopPropagation();
            evt.preventDefault();
        }
        const bloco = currentTemplate?.blocos?.[blockIndex];
        if (!bloco) return;
        if (!bloco.campos_larguras) bloco.campos_larguras = {};

        const currentPct = bloco.campos_larguras[fieldId] || 50;
        let currentIndex = -1;
        let minDiff = 999;
        for (let i = 0; i < FIELD_WIDTH_STEPS.length; i++) {
            const diff = Math.abs(FIELD_WIDTH_STEPS[i] - currentPct);
            if (diff < minDiff) {
                minDiff = diff;
                currentIndex = i;
            }
        }
        if (currentIndex === -1) currentIndex = 2; // padrão 50%

        const newIndex = Math.max(0, Math.min(FIELD_WIDTH_STEPS.length - 1, currentIndex + direction));
        const newPct = FIELD_WIDTH_STEPS[newIndex];
        bloco.campos_larguras[fieldId] = newPct;

        if (bloco.campos_spans) {
            bloco.campos_spans[fieldId] = newPct >= 95 ? (bloco.colunasLayout || 2) : 1;
        }

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();
    }

    function setFieldWidthExact(blockIndex, fieldId, pct, evt) {
        if (evt) {
            evt.stopPropagation();
            evt.preventDefault();
        }
        const bloco = currentTemplate?.blocos?.[blockIndex];
        if (!bloco) return;
        if (!bloco.campos_larguras) bloco.campos_larguras = {};

        const cleanPct = Math.max(15, Math.min(100, Math.round(pct)));
        bloco.campos_larguras[fieldId] = cleanPct;

        if (bloco.campos_spans) {
            bloco.campos_spans[fieldId] = cleanPct >= 95 ? (bloco.colunasLayout || 2) : 1;
        }

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        closeFieldWidthPopover();
        renderA4Blocks();
    }

    function toggleFieldWidthPopover(blockIndex, fieldId, evt) {
        if (evt) {
            evt.stopPropagation();
            evt.preventDefault();
        }
        const existing = document.getElementById('field-width-popover');
        if (existing) {
            const prevFieldId = existing.getAttribute('data-field-id');
            existing.remove();
            if (prevFieldId === fieldId) return;
        }

        const bloco = currentTemplate?.blocos?.[blockIndex];
        if (!bloco) return;
        const currentPct = (bloco.campos_larguras && bloco.campos_larguras[fieldId]) ? bloco.campos_larguras[fieldId] : 50;

        const targetBtn = evt.currentTarget || evt.target;
        const rect = targetBtn ? targetBtn.getBoundingClientRect() : { bottom: 200, left: 200 };

        const popover = document.createElement('div');
        popover.id = 'field-width-popover';
        popover.setAttribute('data-field-id', fieldId);
        popover.className = 'fixed z-[9999] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-3 w-64 text-slate-800 dark:text-slate-100 flex flex-col gap-2.5 animate-in fade-in duration-100 select-none';

        const top = Math.min(window.innerHeight - 220, rect.bottom + 6);
        const left = Math.max(10, Math.min(window.innerWidth - 270, rect.left - 80));
        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;

        popover.innerHTML = `
            <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
                <span class="text-xs font-bold uppercase text-slate-700 dark:text-slate-200 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[15px] text-sky-600">straighten</span>
                    Largura do Campo
                </span>
                <button type="button" onclick="ReportBuilder.closeFieldWidthPopover()" class="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 rounded cursor-pointer" title="Fechar">
                    <span class="material-symbols-outlined text-[14px]">close</span>
                </button>
            </div>
            <div>
                <span class="text-[10px] font-bold uppercase text-slate-400 block mb-1">Proporções Rápidas:</span>
                <div class="grid grid-cols-3 gap-1">
                    ${[
                        { pct: 25, label: '1/4 (25%)' },
                        { pct: 33, label: '1/3 (33%)' },
                        { pct: 50, label: '1/2 (50%)' },
                        { pct: 66, label: '2/3 (66%)' },
                        { pct: 75, label: '3/4 (75%)' },
                        { pct: 100, label: 'Total (100%)' }
                    ].map(item => `
                        <button type="button" 
                                onclick="ReportBuilder.setFieldWidthExact(${blockIndex}, '${fieldId}', ${item.pct}, event)" 
                                class="py-1 px-1.5 text-center text-[10px] font-bold rounded-lg border transition-colors cursor-pointer ${currentPct === item.pct ? 'bg-sky-600 text-white border-sky-600 shadow-2xs' : 'bg-slate-50 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'}">
                            ${item.label}
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="pt-1 border-t border-slate-200 dark:border-slate-700">
                <div class="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                    <span>Ajuste Fino Livre:</span>
                    <span id="popover-slider-val" class="font-mono text-sky-600 dark:text-sky-400 text-xs font-black">${currentPct}%</span>
                </div>
                <input type="range" min="15" max="100" step="1" value="${currentPct}" class="w-full accent-sky-600 cursor-pointer" 
                       oninput="document.getElementById('popover-slider-val').textContent = this.value + '%'" 
                       onchange="ReportBuilder.setFieldWidthExact(${blockIndex}, '${fieldId}', parseInt(this.value, 10), event)" />
            </div>
        `;
        document.body.appendChild(popover);

        setTimeout(() => {
            function onDocClick(e) {
                if (!popover.contains(e.target) && targetBtn && !targetBtn.contains(e.target)) {
                    closeFieldWidthPopover();
                    document.removeEventListener('click', onDocClick);
                }
            }
            document.addEventListener('click', onDocClick);
        }, 50);
    }

    function closeFieldWidthPopover() {
        const existing = document.getElementById('field-width-popover');
        if (existing) existing.remove();
    }

    function toggleGridFieldSpan(blockIndex, fieldId, evt) {
        changeFieldWidthStep(blockIndex, fieldId, 1, evt);
    }

    function removeFieldFromGrid(blockIndex, fieldId, evt) {
        if (evt) {
            evt.stopPropagation();
            evt.preventDefault();
        }
        const bloco = currentTemplate?.blocos?.[blockIndex];
        if (!bloco || !Array.isArray(bloco.campos_selecionados)) return;

        bloco.campos_selecionados = bloco.campos_selecionados.filter(item => {
            const id = typeof item === 'string' ? item : item.id;
            return id !== fieldId;
        });

        if (bloco.campos_larguras) {
            delete bloco.campos_larguras[fieldId];
        }
        if (bloco.campos_spans) {
            delete bloco.campos_spans[fieldId];
        }

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        // Atualiza a gaveta lateral se estiver aberta para atualizar contadores
        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function initGridFieldResizers() {
        // Obsoleto: substituído pelo sistema de botões steppers [-] [+] e menu popover de proporções
    }

    // --- MANIPULADORES DO CARD 0: FOLHA A4 ---
    function updateOrientation(orient) {
        if (!currentTemplate || !currentTemplate.config_pagina) return;
        currentTemplate.config_pagina.orientacao = orient;
        applyA4StageDimensions();
        const formId = currentTemplate.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    /** Escolhe a folha do relatório: 'A4' ou 'A3'. */
    function setPageSize(tamanho) {
        if (!currentTemplate || !currentTemplate.config_pagina) return;
        const novo = String(tamanho).toUpperCase() === 'A3' ? 'A3' : 'A4';
        if (currentTemplate.config_pagina.tamanho === novo) return;
        currentTemplate.config_pagina.tamanho = novo;
        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderBuilderInterface(currentTemplate.form_id, currentTemplate.nome);
    }

    function setMarginPreset(tipo, mmValue) {
        if (!currentTemplate || !currentTemplate.config_pagina) return;
        currentTemplate.config_pagina.margem_tipo = tipo;
        if (tipo === 'padrao' || tipo === 'estreita') {
            currentTemplate.config_pagina.margens_mm = { top: mmValue, bottom: mmValue, left: mmValue, right: mmValue };
        }
        applyA4StageDimensions();
        const formId = currentTemplate.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function updateMargin(lado, value) {
        if (!currentTemplate || !currentTemplate.config_pagina) return;
        currentTemplate.config_pagina.margem_tipo = 'personalizada';
        if (!currentTemplate.config_pagina.margens_mm) {
            currentTemplate.config_pagina.margens_mm = { top: 15, bottom: 15, left: 15, right: 15 };
        }
        currentTemplate.config_pagina.margens_mm[lado] = Math.max(0, parseInt(value, 10) || 0);
        applyA4StageDimensions();
    }

    // --- MANIPULADORES DO CARD 1: CABEÇALHO ---
    function handleLogoUpload(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            window._customUploadedLogoUrl = e.target.result;
            const preview = document.getElementById('cfg-hdr-logo-preview');
            if (preview) {
                preview.src = e.target.result;
                preview.classList.remove('hidden');
            }
            const iconPlaceholder = document.getElementById('cfg-hdr-logo-icon');
            if (iconPlaceholder) iconPlaceholder.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }

    function insertHeaderBlock() {
        const titulo = document.getElementById('cfg-hdr-title')?.value || 'FICHA CADASTRAL DO IMÓVEL';
        const subtitulo = document.getElementById('cfg-hdr-subtitle')?.value || 'Prefeitura Municipal';
        const logo = document.getElementById('cfg-hdr-logo')?.checked ?? true;
        const dataHora = document.getElementById('cfg-hdr-date')?.checked ?? true;
        const protocolo = document.getElementById('cfg-hdr-protocol')?.checked ?? true;
        const repetirTodas = document.getElementById('cfg-hdr-repeat-all')?.checked ?? false;

        // Se já houver um cabeçalho, removemos para atualizar/reinserir no topo sem duplicidade
        currentTemplate.blocos = (currentTemplate.blocos || []).filter(b => b.tipo !== 'cabecalho');

        currentTemplate.blocos.unshift({
            id: 'blk_hdr_' + Date.now(),
            tipo: 'cabecalho',
            titulo: titulo,
            subtitulo: subtitulo,
            logo: logo,
            logo_url: window._customUploadedLogoUrl || null,
            exibirDataHora: dataHora,
            exibirProtocolo: protocolo,
            repetir_todas_folhas: repetirTodas
        });

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }

        renderA4Blocks();
    }

    function updateHeaderProperty(property, value) {
        if (!currentTemplate) return;
        if (!currentTemplate.blocos) currentTemplate.blocos = [];
        let hdr = currentTemplate.blocos.find(b => b.tipo === 'cabecalho');
        if (!hdr) {
            insertHeaderBlock();
            hdr = currentTemplate.blocos.find(b => b.tipo === 'cabecalho');
        }
        if (hdr) {
            if (property === 'logo') {
                hdr.logo = !!value;
                hdr.exibir_logo = !!value;
            } else if (property === 'dataHora') {
                hdr.exibirDataHora = !!value;
            } else if (property === 'protocolo') {
                hdr.exibirProtocolo = !!value;
            } else {
                hdr[property] = value;
            }

            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                window.ReportAdapter.saveReportTemplate(currentTemplate);
            }
            renderA4Blocks();
        }
    }

    function setHeaderRepeatMode(repeatAll) {
        if (!currentTemplate) return;
        if (!currentTemplate.blocos) currentTemplate.blocos = [];
        let hdr = currentTemplate.blocos.find(b => b.tipo === 'cabecalho');
        if (!hdr) {
            insertHeaderBlock();
            hdr = currentTemplate.blocos.find(b => b.tipo === 'cabecalho');
        }
        if (hdr) {
            hdr.repetir_todas_folhas = !!repeatAll;
            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                window.ReportAdapter.saveReportTemplate(currentTemplate);
            }
        }

        // Atualiza a interface visual dos dois botões na barra lateral
        const btnFirst = document.getElementById('btn-hdr-repeat-first');
        const btnAll = document.getElementById('btn-hdr-repeat-all');
        const iconFirst = document.getElementById('icon-hdr-repeat-first');
        const iconAll = document.getElementById('icon-hdr-repeat-all');
        const rFirst = document.getElementById('cfg-hdr-repeat-first');
        const rAll = document.getElementById('cfg-hdr-repeat-all');

        if (rFirst) rFirst.checked = !repeatAll;
        if (rAll) rAll.checked = !!repeatAll;

        if (btnFirst && btnAll) {
            if (!repeatAll) {
                btnFirst.className = 'flex items-center gap-2.5 p-2.5 rounded-xl border text-left cursor-pointer transition-all select-none bg-primary/10 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/30';
                btnAll.className = 'flex items-center gap-2.5 p-2.5 rounded-xl border text-left cursor-pointer transition-all select-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-300';
                if (iconFirst) iconFirst.classList.remove('hidden');
                if (iconAll) iconAll.classList.add('hidden');
            } else {
                btnAll.className = 'flex items-center gap-2.5 p-2.5 rounded-xl border text-left cursor-pointer transition-all select-none bg-primary/10 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/30';
                btnFirst.className = 'flex items-center gap-2.5 p-2.5 rounded-xl border text-left cursor-pointer transition-all select-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-300';
                if (iconAll) iconAll.classList.remove('hidden');
                if (iconFirst) iconFirst.classList.add('hidden');
            }
        }

        // Atualiza o badge do acordeão
        const accHeader = document.getElementById('acc-header');
        if (accHeader) {
            const badgeEl = accHeader.querySelector('.bg-primary\\/10') || accHeader.querySelector('.font-bold.text-primary');
            if (badgeEl) {
                badgeEl.textContent = repeatAll ? 'Todas as Folhas' : '1ª Folha';
            }
        }

        renderA4Blocks();
    }

    // --- MANIPULADORES DO CARD 2: GRADE DE ATRIBUTOS ---
    let selectedGridCols = 2;
    function selectGridColumns(cols) {
        selectedGridCols = cols;
        ['btn-col-1', 'btn-col-2', 'btn-col-3'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.className = 'px-2.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:text-primary cursor-pointer';
        });
        const activeBtn = document.getElementById(`btn-col-${cols}`);
        if (activeBtn) activeBtn.className = 'px-2.5 py-1 rounded-md text-xs font-bold bg-primary text-white shadow-xs cursor-pointer';
    }

    function toggleAllFieldsInDrawer(check) {
        const checkboxes = document.querySelectorAll("input[name='cfg-grid-field']");
        checkboxes.forEach(cb => cb.checked = !!check);
    }

    function toggleTabFieldsInDrawer(tabId, check) {
        const checkboxes = document.querySelectorAll(`input[name='cfg-grid-field'][data-tab-id='${tabId}']`);
        checkboxes.forEach(cb => cb.checked = !!check);
    }

    function filterGridFieldsInDrawer(query) {
        const cleanQuery = (query || '').toLowerCase().trim();
        const tabSections = document.querySelectorAll('.cfg-grid-tab-section');
        tabSections.forEach(section => {
            const tabTitle = (section.getAttribute('data-tab-title') || '').toLowerCase();
            const fieldItems = section.querySelectorAll('.cfg-grid-field-item');
            let anyVisible = false;

            fieldItems.forEach(item => {
                const label = (item.getAttribute('data-field-label') || '').toLowerCase();
                const match = !cleanQuery || label.includes(cleanQuery) || tabTitle.includes(cleanQuery);
                item.style.display = match ? 'flex' : 'none';
                if (match) anyVisible = true;
            });

            section.style.display = anyVisible ? 'block' : 'none';
        });
    }

    function insertGridBlock() {
        const checked = Array.from(document.querySelectorAll("input[name='cfg-grid-field']:checked")).map(cb => cb.value);
        if (checked.length === 0) {
            alert('Selecione pelo menos um campo para inserir na grade.');
            return;
        }

        currentTemplate.blocos.push({
            id: 'blk_grid_' + Date.now(),
            tipo: 'grade_campos',
            titulo: 'Dados Cadastrais do Imóvel',
            campos_selecionados: checked,
            campos_spans: {},
            campos_larguras: {},
            colunasLayout: selectedGridCols
        });

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function addSelectedFieldsToExistingGrid(targetBlockIndex) {
        const checked = Array.from(document.querySelectorAll("input[name='cfg-grid-field']:checked")).map(cb => cb.value);
        if (checked.length === 0) {
            alert('Selecione pelo menos um campo para adicionar à grade.');
            return;
        }

        if (!currentTemplate || !Array.isArray(currentTemplate.blocos)) return;

        let gridBlock = null;
        if (typeof targetBlockIndex === 'number' && currentTemplate.blocos[targetBlockIndex]?.tipo === 'grade_campos') {
            gridBlock = currentTemplate.blocos[targetBlockIndex];
        } else {
            gridBlock = currentTemplate.blocos.find(b => b.tipo === 'grade_campos');
        }

        if (!gridBlock) {
            insertGridBlock();
            return;
        }

        if (!Array.isArray(gridBlock.campos_selecionados)) {
            gridBlock.campos_selecionados = [];
        }

        const existingSet = new Set(gridBlock.campos_selecionados.map(item => typeof item === 'string' ? item : item.id));
        let addedCount = 0;
        checked.forEach(fieldId => {
            if (!existingSet.has(fieldId)) {
                gridBlock.campos_selecionados.push(fieldId);
                existingSet.add(fieldId);
                addedCount++;
            }
        });

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function quickAddFieldToExistingGrid(fieldId, evt) {
        if (evt) {
            evt.stopPropagation();
            evt.preventDefault();
        }
        if (!currentTemplate || !Array.isArray(currentTemplate.blocos)) return;

        let gridBlock = currentTemplate.blocos.find(b => b.tipo === 'grade_campos');
        if (!gridBlock) {
            gridBlock = {
                id: 'blk_grid_' + Date.now(),
                tipo: 'grade_campos',
                titulo: 'Dados Cadastrais do Imóvel',
                campos_selecionados: [fieldId],
                campos_spans: {},
                campos_larguras: {},
                colunasLayout: selectedGridCols || 2
            };
            currentTemplate.blocos.push(gridBlock);
        } else {
            if (!Array.isArray(gridBlock.campos_selecionados)) {
                gridBlock.campos_selecionados = [];
            }
            const existingSet = new Set(gridBlock.campos_selecionados.map(item => typeof item === 'string' ? item : item.id));
            if (existingSet.has(fieldId)) {
                renderA4Blocks();
                return;
            }
            gridBlock.campos_selecionados.push(fieldId);
        }

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    // ---- desenhistas compartilhados com o relatório (src/reportBlocks.js) e feição de teste (src/reportPreview.js)
    function blocosReais(fields) {
        return window.ReportBlocks.create({
            esc: escapeHtml,
            FieldFormatter: window.FieldFormatter,
            geometryCenter: () => window.ReportPreview.CENTRO,
            formFields: () => fields || [],
            emissaoTexto: (k) => (k === 'protocolo' ? '#' + String((currentTemplate && currentTemplate.id) || 'EXEMPLO').slice(-6).toUpperCase() : '7f83b1657ff1…'),
            emissaoTitulo: () => 'Exemplo: o protocolo e o SHA-256 reais são gerados na emissão',
            emissaoProtocolo: () => '',
            qrDataUrl: () => '',
            ReportData: window.ReportData,
            formTabs: () => ((window.ReportAdapter && window.ReportAdapter.getFormTabs && currentTemplate) ? (window.ReportAdapter.getFormTabs(currentTemplate.form_id) || []) : [])
        });
    }

    /** Laudo Analítico: desenho do relatório com registros de exemplo; controles de campo (arrastar, largura, formato do arquivo, remover) no 1º registro de cada aba. */
    function renderLaudoReal(bloco, index, fields) {
        // a seleção padrão de campos do laudo é gravada como antes (abas escolhidas / deduzidas dos campos / todas as 1:N)
        const tabsLaudo = laudoTabsSelecionadas(bloco, fields);
        ensureLaudoFieldSelection(bloco, tabsLaudo);
        const b = Object.assign({}, bloco, {
            densidade: bloco.densidade || current1nLaudoDensity || 'compact',
            zebrado: bloco.zebrado || current1nLaudoRowStriping || 'slate',
            ordem_abas: (Array.isArray(bloco.ordem_abas) && bloco.ordem_abas.length) ? bloco.ordem_abas : current1nTabOrder
        });
        const edit = {
            titleClass: 'cursor-text hover:bg-sky-50 px-1 rounded',
            titleAttrs: `ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')"`,
            metaExtra: ' • <span class="text-[9px] text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded font-medium print:hidden font-sans">Arraste ⠿ para reordenar campos (vale para todos os registros da aba)</span>',
            groupAttrs: (tabId) => `class="cursor-text hover:bg-sky-50 px-1 rounded transition-colors" title="Duplo clique para editar o texto da aba" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'custom_tab_title_${escapeHtml(String(tabId))}')"`,
            containerAttrs: `data-block-index="${index}"`,
            fieldAttrs: (f) => `data-field-id="${escapeHtml(f.id)}" data-block-index="${index}"`,
            lead: () => '<span class="field-drag-handle cursor-grab active:cursor-grabbing text-slate-300 group-hover/field:text-sky-600 hover:bg-slate-200/60 p-0.5 rounded transition-colors" title="Arraste para mover de posição no laudo"><span class="material-symbols-outlined text-[14px] leading-none">drag_indicator</span></span>',
            tail: (f, pct) => fileModeToggleHtml(index, f, fileFieldMode(bloco, f)) + `<div class="inline-flex items-center bg-white border border-slate-200 rounded p-0.5 shadow-2xs"><button type="button" class="field-width-dec-btn px-1 py-0.5 text-slate-500 hover:text-sky-600 hover:bg-slate-100 rounded cursor-pointer transition-colors" onclick="ReportBuilder.changeFieldWidthStep(${index}, '${escapeHtml(f.id)}', -1, event)" title="Diminuir largura do campo (-)"><span class="material-symbols-outlined text-[12px] leading-none">remove</span></button><button type="button" class="field-width-badge-btn px-1 py-0.5 text-[9px] font-extrabold text-slate-700 hover:text-sky-600 cursor-pointer transition-colors" onclick="ReportBuilder.toggleFieldWidthPopover(${index}, '${escapeHtml(f.id)}', event)" title="Clique para escolher proporção exata">${Math.round(pct)}%</button><button type="button" class="field-width-inc-btn px-1 py-0.5 text-slate-500 hover:text-sky-600 hover:bg-slate-100 rounded cursor-pointer transition-colors" onclick="ReportBuilder.changeFieldWidthStep(${index}, '${escapeHtml(f.id)}', 1, event)" title="Aumentar largura do campo (+)"><span class="material-symbols-outlined text-[12px] leading-none">add</span></button></div><button type="button" class="field-remove-btn p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer print:hidden" onclick="ReportBuilder.removeFieldFromAnalytical1n(${index}, '${escapeHtml(f.id)}', event)" title="Remover este campo do laudo"><span class="material-symbols-outlined text-[13px] leading-none">close</span></button>`,
            photoHeader: (f) => fileModeToggleHtml(index, f, fileFieldMode(bloco, f))
        };
        const r = blocosReais(fields).renderAnalyticalLaudo(b, dadosDeExemplo(), { full: true, edit: edit });
        return typeof r === 'string' ? r : '';
    }

    /** Quadro Sintético 1:N: desenho do relatório com os registros de exemplo; colunas com mover, renomear (duplo clique) e remover. */
    function renderSinteticaReal(bloco, index, fields) {
        const b = Object.assign({}, bloco, {
            densidade: bloco.densidade || current1nTableDensity || 'compact',
            zebrado: bloco.zebrado || current1nRowStriping || 'slate'
        });
        const btn = (dir, cIdx, icone, dica) => `<button type="button" onclick="ReportBuilder.moveSynthetic1nColumn(${index}, ${cIdx}, ${dir}, event)" class="opacity-0 group-hover/th:opacity-100 p-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded cursor-pointer print:hidden shrink-0" title="${dica}"><span class="material-symbols-outlined text-[13px] leading-none">${icone}</span></button>`;
        const edit = {
            titleClass: 'cursor-text hover:bg-sky-50 px-1 rounded',
            titleAttrs: `ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')"`,
            metaExtra: ` • ${b.colunas && b.colunas.length ? b.colunas.length : 3} coluna(s) • ${b.densidade}`,
            th: (c, cIdx, cols, rotuloHtml) => `<div class="flex items-center justify-between gap-1"><div class="flex items-center gap-0.5 min-w-0">${cIdx > 0 ? btn(-1, cIdx, 'chevron_left', 'Mover coluna para a esquerda') : ''}<span class="cursor-pointer hover:bg-sky-100 px-1 py-0.5 rounded transition-colors whitespace-normal break-words leading-tight" title="Duplo clique para renomear ou abreviar título" ondblclick="ReportBuilder.editSynthetic1nColTitle(${index}, ${cIdx}, event)">${rotuloHtml}</span>${cIdx < cols.length - 1 ? btn(1, cIdx, 'chevron_right', 'Mover coluna para a direita') : ''}</div><button type="button" onclick="ReportBuilder.removeColumnFromSynthetic1n(${index}, '${escapeHtml(c.id)}', event)" class="field-remove-btn opacity-0 group-hover/th:opacity-100 p-0.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all cursor-pointer print:hidden shrink-0" title="Remover esta coluna da tabela"><span class="material-symbols-outlined text-[13px] leading-none">close</span></button></div>`
        };
        const r = blocosReais(fields).renderSyntheticTable(b, dadosDeExemplo(), { full: true, edit: edit });
        return typeof r === 'string' ? r : '';
    }

    /** Cabeçalho: desenho do relatório + títulos editáveis com duplo clique + selo de repetição. */
    function renderCabecalhoReal(bloco, index, fields) {
        const todas = !!bloco.repetir_todas_folhas;
        const badgeHtml = `<span class="self-start text-[9px] font-sans font-bold ${todas ? 'text-sky-600 bg-sky-50 border-sky-200' : 'text-slate-500 bg-slate-100 border-slate-200'} border px-1.5 py-0.5 rounded select-none print:hidden">${todas ? 'Todas as Folhas' : 'Apenas 1ª Folha'}</span>`;
        return blocosReais(fields).renderHeaderSlotHtml(bloco, currentTemplate || {}, 0, 0, {
            bare: true,
            edit: {
                textClass: 'cursor-text hover:bg-sky-50 px-1 py-0.5 rounded',
                subtituloAttrs: `ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'subtitulo')" title="Duplo clique para editar"`,
                tituloAttrs: `ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')" title="Duplo clique para editar"`,
                badgeHtml: badgeHtml
            }
        });
    }

    /** Rodapé: desenho do relatório; a numeração mostra como ficaria a partir da folha em que começa. */
    function renderRodapeReal(bloco, fields) {
        const segunda = bloco.inicio_numeracao === 'segunda';
        const qrHtml = '<span class="text-slate-500 font-normal" title="O QR code é gerado na emissão do relatório">[QR code de verificação]</span>';
        return blocosReais(fields).renderFooterSlotHtml(bloco, segunda ? 2 : 1, segunda ? 10 : 1, 0, 0, { bare: true, qrHtml: qrHtml });
    }
    function dadosDeExemplo() {
        const tabs = (window.ReportAdapter && window.ReportAdapter.getFormTabs && currentTemplate) ? (window.ReportAdapter.getFormTabs(currentTemplate.form_id) || []) : [];
        return window.ReportPreview.sampleFeatureData(tabs);
    }

    /** Grade de Atributos: desenho do relatório + alça de arrastar, largura [-] [%] [+], formato do arquivo e remover. */
    function renderGradeReal(bloco, index, fields, colCount) {
        const dica = colCount === 1
            ? '<span class="text-[9px] text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded font-medium print:hidden">Arraste ⠿ para reordenar</span>'
            : '<span class="text-[9px] text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded font-medium print:hidden">Arraste ⠿ para reordenar • Use [-] [+] ou clique no % para a largura</span>';
        const edit = {
            titleClass: 'cursor-text hover:bg-sky-50 px-1 rounded',
            titleAttrs: `ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')"`,
            headerExtra: `<div class="flex items-center gap-2"><span class="text-[10px] font-mono text-slate-400 font-normal">${colCount === 1 ? 'Lista Corrida' : colCount + ' Colunas'}</span>${dica}</div>`,
            containerAttrs: `data-block-index="${index}"`,
            fieldAttrs: (f) => `data-field-id="${f.id}" data-block-index="${index}"`,
            lead: (f, pct, modo) => `<span class="field-drag-handle cursor-grab active:cursor-grabbing text-slate-300 group-hover/field:text-sky-600 hover:bg-slate-200/60 p-0.5 rounded transition-colors" title="Arraste para mover de posição ${modo === 'linha' ? 'na lista' : 'na grade'}"><span class="material-symbols-outlined text-[15px] leading-none">drag_indicator</span></span>`,
            tail: (f, pct, modo) => {
                const arquivo = fileModeToggleHtml(index, f, fileFieldMode(currentTemplate.blocos[index] || bloco, f));
                const remover = `<button type="button" class="field-remove-btn p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer print:hidden" onclick="ReportBuilder.removeFieldFromGrid(${index}, '${f.id}', event)" title="${modo === 'linha' ? 'Remover campo da grade' : 'Remover este campo da grade'}"><span class="material-symbols-outlined text-[14px] leading-none">close</span></button>`;
                if (modo === 'linha') return arquivo + remover;
                return arquivo + `<div class="inline-flex items-center bg-white border border-slate-200 rounded-md p-0.5 shadow-2xs"><button type="button" class="field-width-dec-btn px-1 py-0.5 text-slate-500 hover:text-sky-600 hover:bg-slate-100 rounded cursor-pointer transition-colors" onclick="ReportBuilder.changeFieldWidthStep(${index}, '${f.id}', -1, event)" title="Diminuir largura do campo (-)"><span class="material-symbols-outlined text-[13px] leading-none">remove</span></button><button type="button" class="field-width-badge-btn px-1.5 py-0.5 text-[9.5px] font-extrabold text-slate-700 hover:text-sky-600 cursor-pointer transition-colors" onclick="ReportBuilder.toggleFieldWidthPopover(${index}, '${f.id}', event)" title="Clique para escolher proporção exata ou regular slider">${pct}%</button><button type="button" class="field-width-inc-btn px-1 py-0.5 text-slate-500 hover:text-sky-600 hover:bg-slate-100 rounded cursor-pointer transition-colors" onclick="ReportBuilder.changeFieldWidthStep(${index}, '${f.id}', 1, event)" title="Aumentar largura do campo (+)"><span class="material-symbols-outlined text-[13px] leading-none">add</span></button></div>` + remover;
            }
        };
        return blocosReais(fields).renderAttributeGrid(bloco, dadosDeExemplo(), fields, { edit: edit });
    }

    // --- MANIPULADORES DO CARD 3: MINI-MAPA ---
    let currentMapMode = 'atual';
    function selectMapMode(mode) {
        currentMapMode = mode === 'temporal' ? 'atual' : mode; // série multitemporal: próxima etapa
    }

    // Padrão do Mini-Mapa: TODAS as opções ligadas. As que dependem de escolha (camada dos confrontantes, campo da área,
    // pontos dos vértices) ficam ligadas e o usuário escolhe no relatório, no painel "Configurações do Mapa".
    const MAPA_PADRAO_COMPLETO = {
        destaque: { ativo: true, cor: '#10b981', esmaecerEntorno: true },
        baseMap: 'osm',
        camadasVizinhas: true,
        norte: true,
        escala: true,
        projecao: true,
        alturaMm: 90,
        medidas: { ativo: true, lados: true, total: true, perimetro: true },
        pontos: { ativo: true, sistema: 'utm', tabela: true, memorial: true, colConf: { ativo: true } },
        rotulos: { ativo: true, campo: 'rotulo' },
        confrontantes: { ativo: true },
        referencia: { ativo: false }, // opção retirada
        comparacaoArea: { ativo: true },
        situacao: { ativo: true },
        quadriculado: { ativo: true },
        temporal: { ativo: true, ordem: 'asc', colunas: 2, alturaMm: 70, sincronizar: true, contorno: true }
    };

    function insertMapBlock() {
        const config = JSON.parse(JSON.stringify(MAPA_PADRAO_COMPLETO));
        const existente = currentTemplate.blocos.find(b => b.tipo === 'mapa_estatico');
        const nota = (existente && existente.notaTecnica) || 'Delimitação cadastral georreferenciada em conformidade com o sistema cartográfico municipal e SIRGAS 2000.';
        const normalizado = window.MapTools ? window.MapTools.normalizeMapConfig({ mapa: config }) : config;
        // vista (zoom/posição), textos editados e rótulos arrastados são do usuário, não do modelo
        delete normalizado.vista;
        delete normalizado.edicoes;
        delete normalizado.posicoes;
        if (normalizado.pontos) { normalizado.pontos.ordem = []; normalizado.pontos.titulos = {}; } // os pontos marcados são do usuário
        if (normalizado.temporal) normalizado.temporal.excluidas = []; // as ortofotos retiradas também
        normalizado.anotacoes = []; // as anotações de texto são do usuário

        const existing = currentTemplate.blocos.find(b => b.tipo === 'mapa_estatico');
        if (existing) {
            existing.mapa = normalizado;
            existing.notaTecnica = nota;
            delete existing.modo;
        } else {
            currentTemplate.blocos.push({
                id: 'blk_map_' + Date.now(),
                tipo: 'mapa_estatico',
                titulo: 'Delimitação Cartográfica do Imóvel',
                mapa: normalizado,
                notaTecnica: nota
            });
        }
        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && currentTemplate.form_id) panel.innerHTML = renderAccordionPanel(currentTemplate.form_id);
    }

    // --- MANIPULADORES DO CARD 4: GRÁFICOS ---
    let selectedChartLayout = 'full';
    function selectChartLayout(layout) {
        selectedChartLayout = layout;
        const btnFull = document.getElementById('btn-chart-layout-full');
        const btnSide = document.getElementById('btn-chart-layout-side');
        if (layout === 'side') {
            if (btnSide) btnSide.className = 'px-3 py-1 rounded-md text-xs font-bold bg-primary text-white shadow-xs';
            if (btnFull) btnFull.className = 'px-3 py-1 rounded-md text-xs font-bold text-slate-500 hover:text-primary';
        } else {
            if (btnFull) btnFull.className = 'px-3 py-1 rounded-md text-xs font-bold bg-primary text-white shadow-xs';
            if (btnSide) btnSide.className = 'px-3 py-1 rounded-md text-xs font-bold text-slate-500 hover:text-primary';
        }
    }

    function insertChartBlock() {
        const checked = Array.from(document.querySelectorAll("input[name='cfg-chart-select']:checked")).map(cb => cb.value);
        currentTemplate.blocos.push({
            id: 'blk_chart_' + Date.now(),
            tipo: 'grafico_existente',
            titulo: 'Estatísticas do Dashboard',
            chart_ids: checked,
            layout: selectedChartLayout === 'side' ? 'lado_a_lado' : 'largura_total'
        });
        renderA4Blocks();
    }

    // --- MANIPULADORES DO CARD 5: KPIS ---
    // --- MANIPULADORES DO CARD 6: VISTORIA FOTOGRÁFICA & ANEXOS 1:N ---
    let selectedPhotoLayout = '2_cols';
    let selected1nScope = 'todas';
    let selected1nSourceTab = 'consolidado';
    let current1nSortOrder = 'desc'; // 'desc' ou 'asc'
    let current1nGroupByTab = false; // true ou false
    let current1nTableDensity = 'compact'; // 'comfortable' | 'compact' | 'ultracompact'
    let current1nRowStriping = 'slate'; // 'slate' | 'sky' | 'ente' | 'white'
    let current1nTabOrder = []; // Lista de IDs ou títulos das abas ordenadas
    let current1nSelectedFieldKeys = new Set(); // Conjunto de chaves "tabId:fieldId" selecionadas para tabela sintética
    let current1nSynSelectedTabs = new Set(); // Conjunto de IDs das abas selecionadas para a tabela sintética
    let current1nLaudoSelectedFieldKeys = new Set(); // Conjunto de chaves "tabId:fieldId" selecionadas para laudo analítico
    let current1nLaudoSelectedTabs = new Set(); // Conjunto de IDs das abas selecionadas para o laudo analítico

    function toggleAccordionTab(containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const isHidden = el.classList.contains('hidden');
        el.classList.toggle('hidden');
        const icon = document.getElementById(containerId + '-icon');
        if (icon) {
            icon.textContent = isHidden ? 'expand_more' : 'chevron_right';
        }
    }

    function on1nSynTabSelectChange(cb) {
        if (!cb) return;
        const tabId = cb.getAttribute('data-tab-id') || cb.value;
        if (cb.checked) {
            current1nSynSelectedTabs.add(tabId);
        } else {
            current1nSynSelectedTabs.delete(tabId);
        }

        // Marca ou desmarca todos os campos daquela aba na gaveta lateral
        const tabCbs = document.querySelectorAll(`input[name='cfg-1n-field'][data-tab-id='${tabId}']`);
        if (cb.checked) {
            tabCbs.forEach(tc => {
                tc.checked = true;
                current1nSelectedFieldKeys.add(`${tabId}:${tc.value}`);
            });
        } else {
            tabCbs.forEach(tc => {
                tc.checked = false;
                current1nSelectedFieldKeys.delete(`${tabId}:${tc.value}`);
            });
        }
        // O envio para a Folha A4 Interativa ocorre exclusivamente ao clicar em
        // "Inserir Selecionados na Tabela da Folha" (addSelectedFieldsToExistingSynthetic1n)
    }

    function on1nLaudoTabSelectChange(cb) {
        if (!cb) return;
        const tabId = cb.getAttribute('data-tab-id') || cb.value;
        if (cb.checked) {
            current1nLaudoSelectedTabs.add(tabId);
        } else {
            current1nLaudoSelectedTabs.delete(tabId);
        }

        if (currentTemplate && Array.isArray(currentTemplate.blocos)) {
            let block = currentTemplate.blocos.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');
            if (!block && cb.checked) {
                insertAnalyticalPhotos1nBlock();
                block = currentTemplate.blocos.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');
            }
            if (block) {
                block.abas_selecionadas = Array.from(current1nLaudoSelectedTabs);

                // Se o usuário marcou a aba, sincroniza seus campos para o laudo
                const tabCbs = document.querySelectorAll(`input[name='cfg-1n-laudo-field'][data-tab-id='${tabId}']`);
                if (cb.checked) {
                    tabCbs.forEach(tc => {
                        tc.checked = true;
                        current1nLaudoSelectedFieldKeys.add(`${tabId}:${tc.value}`);
                    });
                    addSelectedFieldsToExistingAnalytical1n();
                } else {
                    tabCbs.forEach(tc => {
                        tc.checked = false;
                        current1nLaudoSelectedFieldKeys.delete(`${tabId}:${tc.value}`);
                    });
                    if (Array.isArray(block.campos_selecionados)) {
                        block.campos_selecionados = block.campos_selecionados.filter(cf => {
                            const cfTab = typeof cf === 'object' ? (cf.tabId || '') : '';
                            return cfTab !== tabId;
                        });
                    }
                }

                if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                    window.ReportAdapter.saveReportTemplate(currentTemplate);
                }
                renderA4Blocks();
                refreshLaudoTabSequenceList();
            }
        }
    }

    function on1nFieldCheckboxChange(cb) {
        if (!cb) return;
        const tabId = cb.getAttribute('data-tab-id') || '';
        const key = `${tabId}:${cb.value}`;
        if (cb.checked) {
            current1nSelectedFieldKeys.add(key);
        } else {
            current1nSelectedFieldKeys.delete(key);
        }
    }

    function sync1nSelectedFieldsFromDOM() {
        const cbs = document.querySelectorAll("input[name='cfg-1n-field']");
        if (cbs.length > 0) {
            current1nSelectedFieldKeys.clear();
            cbs.forEach(cb => {
                if (cb.checked) {
                    const tabId = cb.getAttribute('data-tab-id') || '';
                    current1nSelectedFieldKeys.add(`${tabId}:${cb.value}`);
                }
            });
        }
    }

    function on1nLaudoFieldCheckboxChange(cb) {
        if (!cb) return;
        const tabId = cb.getAttribute('data-tab-id') || '';
        const fieldId = cb.value;
        const fieldLabel = cb.getAttribute('data-field-label') || fieldId;
        const tabTitle = cb.getAttribute('data-tab-title') || '';
        const key = `${tabId}:${fieldId}`;
        if (cb.checked) {
            current1nLaudoSelectedFieldKeys.add(key);
            current1nLaudoSelectedTabs.add(tabId);
        } else {
            current1nLaudoSelectedFieldKeys.delete(key);
        }

        // Se já existe um laudo na folha A4, atualiza dinamicamente a folha sem recriar o DOM do painel
        if (currentTemplate && Array.isArray(currentTemplate.blocos)) {
            let block = currentTemplate.blocos.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');
            if (!block && cb.checked) {
                insertAnalyticalPhotos1nBlock();
                block = currentTemplate.blocos.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');
            }
            if (block) {
                if (!Array.isArray(block.campos_selecionados)) block.campos_selecionados = [];

                if (cb.checked) {
                    const exists = block.campos_selecionados.some(cf => {
                        const cfTab = typeof cf === 'object' ? (cf.tabId || '') : '';
                        const cfId = typeof cf === 'string' ? cf : (cf.rawId || cf.id);
                        return (cfTab === tabId || !cfTab || !tabId) && cfId === fieldId;
                    });
                    if (!exists) {
                        block.campos_selecionados.push({ 
                            id: fieldId, 
                            label: fieldLabel, 
                            rawId: fieldId, 
                            tabId: tabId,
                            tabTitle: tabTitle
                        });
                    }
                    if (!Array.isArray(block.abas_selecionadas)) block.abas_selecionadas = [];
                    if (!block.abas_selecionadas.includes(tabId)) {
                        block.abas_selecionadas.push(tabId);
                    }
                    // Marca o checkbox da aba no cabeçalho se ainda não estiver marcado
                    const tabSelectCb = document.querySelector(`input[name='cfg-1n-laudo-tab-select'][data-tab-id='${tabId}']`);
                    if (tabSelectCb) tabSelectCb.checked = true;
                } else {
                    block.campos_selecionados = block.campos_selecionados.filter(cf => {
                        const cfTab = typeof cf === 'object' ? (cf.tabId || '') : '';
                        const cfId = typeof cf === 'string' ? cf : (cf.rawId || cf.id);
                        return !( (cfTab === tabId || !cfTab || !tabId) && cfId === fieldId );
                    });
                }

                if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                    window.ReportAdapter.saveReportTemplate(currentTemplate);
                }
                renderA4Blocks();
            }
        }
    }

    function sync1nLaudoSelectedFieldsFromDOM() {
        const cbs = document.querySelectorAll("input[name='cfg-1n-laudo-field']");
        if (cbs.length > 0) {
            current1nLaudoSelectedFieldKeys.clear();
            cbs.forEach(cb => {
                if (cb.checked) {
                    const tabId = cb.getAttribute('data-tab-id') || '';
                    current1nLaudoSelectedFieldKeys.add(`${tabId}:${cb.value}`);
                }
            });
        }
    }

    function getSelected1nLaudoFieldsFromDrawer() {
        sync1nLaudoSelectedFieldsFromDOM();
        const cbs = Array.from(document.querySelectorAll("input[name='cfg-1n-laudo-field']:checked"));
        return cbs.map(cb => ({
            id: cb.value,
            label: cb.getAttribute('data-field-label') || cb.value,
            tabId: cb.getAttribute('data-tab-id') || '',
            tabTitle: cb.getAttribute('data-tab-title') || ''
        }));
    }

    function toggleAll1nLaudoFieldsInDrawer(checked) {
        const cbs = document.querySelectorAll("input[name='cfg-1n-laudo-field']");
        cbs.forEach(cb => {
            cb.checked = !!checked;
            const tabId = cb.getAttribute('data-tab-id') || '';
            const key = `${tabId}:${cb.value}`;
            if (checked) current1nLaudoSelectedFieldKeys.add(key);
            else current1nLaudoSelectedFieldKeys.delete(key);
        });

        if (currentTemplate && Array.isArray(currentTemplate.blocos)) {
            const block = currentTemplate.blocos.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');
            if (block) {
                if (checked) {
                    addSelectedFieldsToExistingAnalytical1n();
                } else {
                    block.campos_selecionados = [];
                    if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                        window.ReportAdapter.saveReportTemplate(currentTemplate);
                    }
                    renderA4Blocks();
                }
            }
        }
    }

    function toggleTab1nLaudoFieldsInDrawer(tabId, checked) {
        const cbs = document.querySelectorAll(`input[name='cfg-1n-laudo-field'][data-tab-id='${tabId}']`);
        cbs.forEach(cb => {
            cb.checked = !!checked;
            const key = `${tabId}:${cb.value}`;
            if (checked) current1nLaudoSelectedFieldKeys.add(key);
            else current1nLaudoSelectedFieldKeys.delete(key);
        });

        // Sincroniza também o checkbox da aba no cabeçalho
        const tabSelectCb = document.querySelector(`input[name='cfg-1n-laudo-tab-select'][data-tab-id='${tabId}']`);
        if (tabSelectCb) {
            tabSelectCb.checked = !!checked;
        }
        if (checked) current1nLaudoSelectedTabs.add(tabId);
        else current1nLaudoSelectedTabs.delete(tabId);

        if (currentTemplate && Array.isArray(currentTemplate.blocos)) {
            let block = currentTemplate.blocos.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');
            if (!block && checked) {
                insertAnalyticalPhotos1nBlock();
                block = currentTemplate.blocos.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');
            }
            if (block) {
                block.abas_selecionadas = Array.from(current1nLaudoSelectedTabs);
                if (checked) {
                    addSelectedFieldsToExistingAnalytical1n();
                } else {
                    // Remove apenas os campos dessa aba
                    const fieldsOfTab = new Set(Array.from(cbs).map(cb => cb.value));
                    block.campos_selecionados = block.campos_selecionados.filter(cf => {
                        const cfId = typeof cf === 'string' ? cf : (cf.rawId || cf.id);
                        const cfTab = typeof cf === 'object' ? (cf.tabId || '') : '';
                        return cfTab !== tabId && !fieldsOfTab.has(cfId);
                    });
                    if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                        window.ReportAdapter.saveReportTemplate(currentTemplate);
                    }
                    renderA4Blocks();
                }
            }
        }
    }

    function filter1nLaudoFieldsInDrawer(query) {
        const q = (query || '').trim().toLowerCase();
        const items = document.querySelectorAll('.cfg-1n-laudo-field-item');
        items.forEach(item => {
            const label = item.getAttribute('data-field-label') || '';
            const match = !q || label.includes(q);
            item.style.display = match ? 'flex' : 'none';
        });

        const sections = document.querySelectorAll('.cfg-1n-laudo-tab-section');
        sections.forEach(sec => {
            const visibleItems = sec.querySelectorAll(".cfg-1n-laudo-field-item:not([style*='display: none'])");
            const tabTitle = sec.getAttribute('data-tab-title') || '';
            const titleMatch = !q || tabTitle.includes(q);
            sec.style.display = (visibleItems.length > 0 || titleMatch) ? 'block' : 'none';
        });
    }

    function normalizeColKey(str) {
        if (!str) return '';
        return String(str)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    function getCanonicalColId(id, label) {
        const normId = normalizeColKey(id);
        const normLabel = normalizeColKey(label);

        if (normLabel === 'aba' || normLabel.includes('ente') || normId === 'aba') return 'aba';
        if (normLabel.includes('data') || normId.includes('data')) return 'data';
        if (normLabel.includes('orgao') || normId === 'org') return 'org';
        if (normLabel.includes('ocupac') || normId.includes('ocupac')) return 'situacao_ocupacao';
        if (normLabel.includes('recuo') || normId.includes('recuo')) return 'situacao_recuo';
        if (normLabel.includes('area') || normId.includes('area')) return 'area_invadida';
        if (normLabel.includes('foto') || normId.includes('foto') || normLabel.includes('anexo') || normId.includes('anexo')) return 'qtd_fotos';
        if (normLabel.includes('conclus') || normLabel.includes('relato') || normLabel.includes('parecer') || normId.includes('conclus')) return 'conclusao';
        if (normLabel.includes('link') || normLabel.includes('hiperlink') || normLabel.includes('processo')) return 'links';
        if (normLabel.includes('epol') || normId.includes('epol')) return 'epol';
        if (normLabel.includes('rip') || normId.includes('rip')) return 'rip';

        return normLabel || normId;
    }

    function set1nSortOrder(order) {
        current1nSortOrder = order;
        const btnDesc = document.getElementById('btn-1n-sort-desc');
        const btnAsc = document.getElementById('btn-1n-sort-asc');
        if (order === 'desc') {
            if (btnDesc) btnDesc.className = 'py-1.5 px-2 rounded-lg border text-xs font-bold text-center transition-all bg-primary text-white border-primary shadow-xs';
            if (btnAsc) btnAsc.className = 'py-1.5 px-2 rounded-lg border text-xs font-bold text-center transition-all bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer';
        } else {
            if (btnAsc) btnAsc.className = 'py-1.5 px-2 rounded-lg border text-xs font-bold text-center transition-all bg-primary text-white border-primary shadow-xs';
            if (btnDesc) btnDesc.className = 'py-1.5 px-2 rounded-lg border text-xs font-bold text-center transition-all bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer';
        }

        if (currentTemplate && Array.isArray(currentTemplate.blocos)) {
            currentTemplate.blocos.forEach(b => {
                if (b.tipo === 'tabela_sintetica_1n' || b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos') {
                    b.ordem_cronologica = order;
                }
            });
            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                window.ReportAdapter.saveReportTemplate(currentTemplate);
            }
            renderA4Blocks();
        }
    }

    function set1nGroupByTab(groupByTab) {
        current1nGroupByTab = !!groupByTab;
        sync1nSelectedFieldsFromDOM();
        if (currentTemplate && Array.isArray(currentTemplate.blocos)) {
            currentTemplate.blocos.forEach(b => {
                if (b.tipo === 'tabela_sintetica_1n' || b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos') {
                    b.ordenar_por_aba = current1nGroupByTab;
                }
            });
            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                window.ReportAdapter.saveReportTemplate(currentTemplate);
            }
            renderA4Blocks();
        }
        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function set1nTableDensity(density) {
        current1nTableDensity = density;
        if (currentTemplate && Array.isArray(currentTemplate.blocos)) {
            currentTemplate.blocos.forEach(b => {
                if (b.tipo === 'tabela_sintetica_1n') {
                    b.densidade = density;
                }
            });
            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                window.ReportAdapter.saveReportTemplate(currentTemplate);
            }
            renderA4Blocks();
        }
        // Atualização cirúrgica no DOM sem re-renderizar o acordeon nem perder checkboxes
        const densityIds = ['comfortable', 'compact', 'ultracompact'];
        densityIds.forEach(d => {
            const btn = document.getElementById(`btn-1n-density-${d}`);
            if (btn) {
                btn.className = `py-1 px-1.5 rounded-lg border text-[10.5px] font-semibold text-center ${density === d ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer`;
            }
        });
    }

    function set1nRowStriping(style) {
        current1nRowStriping = style;
        if (currentTemplate && Array.isArray(currentTemplate.blocos)) {
            currentTemplate.blocos.forEach(b => {
                if (b.tipo === 'tabela_sintetica_1n') {
                    b.zebrado = style;
                }
            });
            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                window.ReportAdapter.saveReportTemplate(currentTemplate);
            }
            renderA4Blocks();
        }
        // Atualização cirúrgica no DOM sem re-renderizar o acordeon nem perder checkboxes
        const stripingIds = ['slate', 'sky', 'ente', 'white'];
        stripingIds.forEach(s => {
            const btn = document.getElementById(`btn-1n-striping-${s}`);
            if (btn) {
                btn.className = `py-1 px-1.5 rounded-lg border text-[10px] font-semibold text-center ${style === s ? 'bg-primary/10 text-primary border-primary font-bold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer`;
            }
        });
    }

    let current1nLaudoDensity = 'compact';
    let current1nLaudoRowStriping = 'slate';

    function set1nLaudoDensity(density) {
        current1nLaudoDensity = density;
        if (currentTemplate && Array.isArray(currentTemplate.blocos)) {
            currentTemplate.blocos.forEach(b => {
                if (b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos') {
                    b.densidade = density;
                }
            });
            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                window.ReportAdapter.saveReportTemplate(currentTemplate);
            }
            renderA4Blocks();
        }
        const densityIds = ['comfortable', 'compact', 'ultracompact'];
        densityIds.forEach(d => {
            const btn = document.getElementById(`btn-1n-laudo-density-${d}`);
            if (btn) {
                btn.className = `py-1 px-1.5 rounded-lg border text-[10.5px] font-semibold text-center ${density === d ? 'bg-amber-500/10 text-amber-700 border-amber-500 font-bold dark:text-amber-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer`;
            }
        });
    }

    function set1nLaudoRowStriping(style) {
        current1nLaudoRowStriping = style;
        if (currentTemplate && Array.isArray(currentTemplate.blocos)) {
            currentTemplate.blocos.forEach(b => {
                if (b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos') {
                    b.zebrado = style;
                }
            });
            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                window.ReportAdapter.saveReportTemplate(currentTemplate);
            }
            renderA4Blocks();
        }
        const stripingIds = ['slate', 'sky', 'ente', 'white'];
        stripingIds.forEach(s => {
            const btn = document.getElementById(`btn-1n-laudo-striping-${s}`);
            if (btn) {
                btn.className = `py-1 px-1.5 rounded-lg border text-[10px] font-semibold text-center ${style === s ? 'bg-amber-500/10 text-amber-700 border-amber-500 font-bold dark:text-amber-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} cursor-pointer`;
            }
        });
    }

    function move1nTabSequence(tabIndex, direction) {
        sync1nSelectedFieldsFromDOM();
        const targetIdx = tabIndex + direction;
        if (targetIdx < 0 || targetIdx >= current1nTabOrder.length) return;
        const temp = current1nTabOrder[tabIndex];
        current1nTabOrder[tabIndex] = current1nTabOrder[targetIdx];
        current1nTabOrder[targetIdx] = temp;

        if (currentTemplate && Array.isArray(currentTemplate.blocos)) {
            currentTemplate.blocos.forEach(b => {
                if (b.tipo === 'tabela_sintetica_1n' || b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos') {
                    b.ordem_abas = [...current1nTabOrder];
                }
            });
            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                window.ReportAdapter.saveReportTemplate(currentTemplate);
            }
            renderA4Blocks();
        }
        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function moveSynthetic1nColumn(blockIndex, colIndex, direction, evt) {
        if (evt) evt.stopPropagation();
        const block = currentTemplate?.blocos?.[blockIndex];
        if (!block || !Array.isArray(block.colunas)) return;

        const targetIdx = colIndex + direction;
        if (targetIdx < 0 || targetIdx >= block.colunas.length) return;

        const temp = block.colunas[colIndex];
        block.colunas[colIndex] = block.colunas[targetIdx];
        block.colunas[targetIdx] = temp;

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();
    }

    function editSynthetic1nColTitle(blockIndex, colIndex, evt) {
        if (evt) evt.stopPropagation();
        const block = currentTemplate?.blocos?.[blockIndex];
        if (!block || !Array.isArray(block.colunas) || !block.colunas[colIndex]) return;

        let col = block.colunas[colIndex];
        const currentLabel = (typeof col === 'object' && col.label) ? col.label : (typeof col === 'string' ? col : col.id);
        const newLabel = prompt('Informe o título abreviado para esta coluna:', currentLabel);
        if (newLabel !== null && newLabel.trim() !== '') {
            if (typeof col === 'string') {
                block.colunas[colIndex] = { id: col, label: newLabel.trim() };
            } else {
                col.label = newLabel.trim();
            }
            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                window.ReportAdapter.saveReportTemplate(currentTemplate);
            }
            renderA4Blocks();
        }
    }

    function selectPhotoLayout(layout) {
        selectedPhotoLayout = layout;
        ['btn-photo-layout-1', 'btn-photo-layout-2', 'btn-photo-layout-4'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.className = 'py-1.5 px-2 rounded-lg border text-xs font-semibold text-center bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer';
        });
        const activeMap = { '1_col': 'btn-photo-layout-1', '2_cols': 'btn-photo-layout-2', 'grid_4': 'btn-photo-layout-4' };
        const activeBtn = document.getElementById(activeMap[layout]);
        if (activeBtn) activeBtn.className = 'py-1.5 px-2 rounded-lg border text-xs font-bold text-center bg-primary/10 text-primary border-primary cursor-pointer';
    }

    function select1nScope(scope) {
        selected1nScope = scope;
        const btnAll = document.getElementById('btn-1n-scope-all');
        const btnLast = document.getElementById('btn-1n-scope-last');
        if (scope === 'todas') {
            if (btnAll) btnAll.className = 'py-1.5 px-2 rounded-lg border text-xs font-bold text-center bg-primary/10 text-primary border-primary cursor-pointer';
            if (btnLast) btnLast.className = 'py-1.5 px-2 rounded-lg border text-xs font-semibold text-center bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer';
        } else {
            if (btnAll) btnAll.className = 'py-1.5 px-2 rounded-lg border text-xs font-semibold text-center bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer';
            if (btnLast) btnLast.className = 'py-1.5 px-2 rounded-lg border text-xs font-bold text-center bg-primary/10 text-primary border-primary cursor-pointer';
        }
    }

    function on1nSourceTabChange(tabId) {
        selected1nSourceTab = tabId;
    }

    function toggleAll1nFieldsInDrawer(checked) {
        const cbs = document.querySelectorAll("input[name='cfg-1n-field']");
        cbs.forEach(cb => {
            cb.checked = !!checked;
            const tabId = cb.getAttribute('data-tab-id') || '';
            const key = `${tabId}:${cb.value}`;
            if (checked) current1nSelectedFieldKeys.add(key);
            else current1nSelectedFieldKeys.delete(key);
        });
    }

    function toggleTab1nFieldsInDrawer(tabId, checked) {
        const cbs = document.querySelectorAll(`input[name='cfg-1n-field'][data-tab-id='${tabId}']`);
        cbs.forEach(cb => {
            cb.checked = !!checked;
            const key = `${tabId}:${cb.value}`;
            if (checked) current1nSelectedFieldKeys.add(key);
            else current1nSelectedFieldKeys.delete(key);
        });
    }

    function filter1nFieldsInDrawer(query) {
        const q = (query || '').trim().toLowerCase();
        const items = document.querySelectorAll('.cfg-1n-field-item');
        items.forEach(item => {
            const label = item.getAttribute('data-field-label') || '';
            const match = !q || label.includes(q);
            item.style.display = match ? 'flex' : 'none';
        });

        const sections = document.querySelectorAll('.cfg-1n-tab-section');
        sections.forEach(sec => {
            const visibleItems = sec.querySelectorAll(".cfg-1n-field-item:not([style*='display: none'])");
            const tabTitle = sec.getAttribute('data-tab-title') || '';
            const titleMatch = !q || tabTitle.includes(q);
            sec.style.display = (visibleItems.length > 0 || titleMatch) ? 'block' : 'none';
        });
    }

    function getSelected1nFieldsFromDrawer() {
        sync1nSelectedFieldsFromDOM();
        const cbs = Array.from(document.querySelectorAll("input[name='cfg-1n-field']:checked"));
        return cbs.map(cb => ({
            id: cb.value,
            label: cb.getAttribute('data-field-label') || cb.value,
            tabId: cb.getAttribute('data-tab-id') || '',
            tabTitle: cb.getAttribute('data-tab-title') || ''
        }));
    }

    function insertSynthetic1nBlock() {
        if (!currentTemplate) return;
        if (!Array.isArray(currentTemplate.blocos)) currentTemplate.blocos = [];

        // Sincroniza abas selecionadas a partir dos checkboxes da gaveta
        const checkedTabCbs = document.querySelectorAll("input[name='cfg-1n-syn-tab-select']:checked");
        current1nSynSelectedTabs.clear();
        checkedTabCbs.forEach(cb => {
            const tId = cb.getAttribute('data-tab-id') || cb.value;
            if (tId) current1nSynSelectedTabs.add(tId);
        });

        const sourceTabId = document.getElementById('cfg-1n-source-tab')?.value || selected1nSourceTab || 'consolidado';
        const selFields = getSelected1nFieldsFromDrawer();

        let cols = [];
        if (selFields.length > 0) {
            const seenCanonical = new Map();
            selFields.forEach(f => {
                const canonId = getCanonicalColId(f.id, f.label);
                if (seenCanonical.has(canonId)) {
                    const existingCol = seenCanonical.get(canonId);
                    if (!existingCol.fieldIds.includes(f.id)) existingCol.fieldIds.push(f.id);
                    if (f.tabId && !existingCol.tabIds.includes(f.tabId)) existingCol.tabIds.push(f.tabId);
                } else {
                    const colObj = {
                        id: canonId,
                        label: f.label,
                        fieldIds: [f.id],
                        tabIds: f.tabId ? [f.tabId] : []
                    };
                    seenCanonical.set(canonId, colObj);
                    cols.push(colObj);
                }
            });
            if (!cols.some(c => (typeof c === 'object' ? c.id : c) === 'aba')) {
                cols.unshift({ id: 'aba', label: 'Aba / Ente', fieldIds: ['aba'], tabIds: [] });
            }
        } else {
            const fallbackCols = Array.from(document.querySelectorAll("input[name='cfg-1n-syn-col']:checked")).map(cb => cb.value);
            cols = fallbackCols.length > 0 ? fallbackCols : ['aba', 'data', 'org', 'situacao_ocupacao', 'situacao_recuo', 'area_invadida', 'qtd_fotos'];
            if (!cols.includes('aba') && !cols.some(c => (typeof c === 'object' && c.id === 'aba'))) {
                cols.unshift('aba');
            }
        }

        currentTemplate.blocos.push({
            id: 'blk_syn1n_' + Date.now(),
            tipo: 'tabela_sintetica_1n',
            titulo: 'Quadro Sintético de Vistorias (Histórico 1:N)',
            sourceTabId: sourceTabId,
            colunas: cols,
            abas_selecionadas: Array.from(current1nSynSelectedTabs),
            ordem_cronologica: current1nSortOrder || 'desc',
            ordenar_por_aba: current1nGroupByTab || false,
            densidade: current1nTableDensity || 'compact',
            zebrado: current1nRowStriping || 'slate',
            ordem_abas: [...current1nTabOrder]
        });

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function addSelectedFieldsToExistingSynthetic1n() {
        if (!currentTemplate || !Array.isArray(currentTemplate.blocos)) return;
        let block = currentTemplate.blocos.find(b => b.tipo === 'tabela_sintetica_1n');
        if (!block) {
            insertSynthetic1nBlock();
            return;
        }

        // Sincroniza abas selecionadas a partir dos checkboxes da gaveta
        const checkedTabCbs = document.querySelectorAll("input[name='cfg-1n-syn-tab-select']:checked");
        current1nSynSelectedTabs.clear();
        checkedTabCbs.forEach(cb => {
            const tId = cb.getAttribute('data-tab-id') || cb.value;
            if (tId) current1nSynSelectedTabs.add(tId);
        });
        block.abas_selecionadas = Array.from(current1nSynSelectedTabs);

        const selFields = getSelected1nFieldsFromDrawer();
        if (!Array.isArray(block.colunas)) block.colunas = [];

        if (selFields.length > 0) {
            const seenCanonical = new Map();
            const cols = [];
            selFields.forEach(f => {
                const canonId = getCanonicalColId(f.id, f.label);
                if (seenCanonical.has(canonId)) {
                    const existingCol = seenCanonical.get(canonId);
                    if (!existingCol.fieldIds.includes(f.id)) existingCol.fieldIds.push(f.id);
                    if (f.tabId && !existingCol.tabIds.includes(f.tabId)) existingCol.tabIds.push(f.tabId);
                } else {
                    const colObj = {
                        id: canonId,
                        label: f.label,
                        fieldIds: [f.id],
                        tabIds: f.tabId ? [f.tabId] : []
                    };
                    seenCanonical.set(canonId, colObj);
                    cols.push(colObj);
                }
            });
            if (!cols.some(c => (typeof c === 'object' ? c.id : c) === 'aba')) {
                cols.unshift({ id: 'aba', label: 'Aba / Ente', fieldIds: ['aba'], tabIds: [] });
            }
            block.colunas = cols;
        }

        block.ordem_cronologica = current1nSortOrder || block.ordem_cronologica || 'desc';
        block.ordenar_por_aba = current1nGroupByTab ?? block.ordenar_por_aba ?? false;
        block.densidade = current1nTableDensity || block.densidade || 'compact';
        block.zebrado = current1nRowStriping || block.zebrado || 'slate';
        if (current1nTabOrder.length > 0) block.ordem_abas = [...current1nTabOrder];

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function insertAnalyticalPhotos1nBlock() {
        if (!currentTemplate) return;
        if (!Array.isArray(currentTemplate.blocos)) currentTemplate.blocos = [];

        const sourceTabId = document.getElementById('cfg-1n-source-tab')?.value || selected1nSourceTab || 'consolidado';
        let selFields = getSelected1nLaudoFieldsFromDrawer();
        if (selFields.length === 0) {
            selFields = getSelected1nFieldsFromDrawer();
        }

        const legenda = document.getElementById('cfg-photo-legend')?.checked ?? true;
        const data = document.getElementById('cfg-photo-date')?.checked ?? true;
        const coords = document.getElementById('cfg-photo-coords')?.checked ?? true;
        const resp = document.getElementById('cfg-photo-resp')?.checked ?? true;
        const obs = document.getElementById('cfg-photo-obs')?.checked ?? true;
        const links = document.getElementById('cfg-photo-links')?.checked ?? true;

        const seenFields = new Set();
        const deduplicatedFields = [];
        selFields.forEach(f => {
            const key = `${f.tabId || ''}:${f.id}`;
            if (!seenFields.has(key)) {
                seenFields.add(key);
                deduplicatedFields.push({
                    id: f.id,
                    label: f.label,
                    rawId: f.id,
                    tabId: f.tabId || '',
                    tabTitle: f.tabTitle || ''
                });
            }
        });

        currentTemplate.blocos.push({
            id: 'blk_ana1n_' + Date.now(),
            tipo: 'galeria_fotos',
            titulo: 'Vistoria Fotográfica & Anexos (1:N)',
            sourceTabId: sourceTabId,
            escopo: selected1nScope || 'todas',
            layoutFotos: selectedPhotoLayout || '2_cols',
            ordem_cronologica: current1nSortOrder || 'desc',
            ordenar_por_aba: current1nGroupByTab || false,
            densidade: current1nLaudoDensity || 'compact',
            zebrado: current1nLaudoRowStriping || 'slate',
            ordem_abas: [...current1nTabOrder],
            abas_selecionadas: Array.from(current1nLaudoSelectedTabs || []),
            campos_selecionados: deduplicatedFields.length > 0 ? deduplicatedFields : [
                { id: 'data', label: 'Data Vistoria' },
                { id: 'situacao_ocupacao', label: 'Situação da Ocupação' },
                { id: 'situacao_recuo', label: 'Situação do Recuo' },
                { id: 'area_invadida', label: 'Área Invadida (m²)' },
                { id: 'conclusao', label: 'Conclusão da Vistoria' },
                { id: 'links', label: 'Processos Oficiais & Hiperlinks' }
            ],
            campos_larguras: {},
            exibirLegenda: legenda,
            exibirData: data,
            exibirCoords: coords,
            exibirResp: resp,
            exibirObs: obs,
            exibirLinks: links
        });

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function addSelectedFieldsToExistingAnalytical1n() {
        if (!currentTemplate || !Array.isArray(currentTemplate.blocos)) return;
        let block = currentTemplate.blocos.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');
        if (!block) {
            insertAnalyticalPhotos1nBlock();
            return;
        }

        let selFields = getSelected1nLaudoFieldsFromDrawer();
        if (selFields.length === 0) {
            selFields = getSelected1nFieldsFromDrawer();
        }

        if (!Array.isArray(block.campos_selecionados)) block.campos_selecionados = [];
        if (!block.campos_larguras) block.campos_larguras = {};

        selFields.forEach(f => {
            const fKey = `${f.tabId || ''}:${f.id}`;
            const exists = block.campos_selecionados.some(cf => {
                const cfTab = typeof cf === 'object' ? (cf.tabId || '') : '';
                const cfId = typeof cf === 'string' ? cf : (cf.rawId || cf.id);
                return (cfTab === (f.tabId || '')) && cfId === f.id;
            });
            if (!exists) {
                block.campos_selecionados.push({ 
                    id: f.id, 
                    label: f.label, 
                    rawId: f.id, 
                    tabId: f.tabId || '',
                    tabTitle: f.tabTitle || ''
                });
            }
            if (f.tabId) current1nLaudoSelectedFieldKeys.add(fKey);
        });

        // Sincroniza abas selecionadas também
        if (current1nLaudoSelectedTabs.size > 0) {
            block.abas_selecionadas = Array.from(current1nLaudoSelectedTabs);
        } else {
            const tabsInFields = new Set(selFields.map(f => f.tabId).filter(Boolean));
            if (tabsInFields.size > 0) {
                block.abas_selecionadas = Array.from(tabsInFields);
                tabsInFields.forEach(tId => current1nLaudoSelectedTabs.add(tId));
            }
        }

        block.ordem_cronologica = current1nSortOrder || block.ordem_cronologica || 'desc';
        block.ordenar_por_aba = current1nGroupByTab ?? block.ordenar_por_aba ?? false;
        block.densidade = current1nLaudoDensity || block.densidade || 'compact';
        block.zebrado = current1nLaudoRowStriping || block.zebrado || 'slate';
        if (current1nTabOrder.length > 0) block.ordem_abas = [...current1nTabOrder];

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function removeSelectedFieldsFromExistingAnalytical1n() {
        if (!currentTemplate || !Array.isArray(currentTemplate.blocos)) return;
        let block = currentTemplate.blocos.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');
        if (!block || !Array.isArray(block.campos_selecionados) || block.campos_selecionados.length === 0) {
            alert('Não há campos no laudo ativo para retirar.');
            return;
        }

        let selFields = getSelected1nLaudoFieldsFromDrawer();
        if (selFields.length === 0) {
            selFields = getSelected1nFieldsFromDrawer();
        }
        if (selFields.length === 0) {
            alert('Selecione pelos checkboxes os campos que deseja retirar do laudo.');
            return;
        }

        const removeKeys = new Set(selFields.map(f => `${f.tabId || ''}:${f.id}`));
        const removeRawIds = new Set(selFields.map(f => f.id));

        block.campos_selecionados = block.campos_selecionados.filter(cf => {
            const cId = typeof cf === 'string' ? cf : (cf.rawId || cf.id);
            const cTab = typeof cf === 'object' ? (cf.tabId || '') : '';
            return !removeKeys.has(`${cTab}:${cId}`) && !removeRawIds.has(cId);
        });

        selFields.forEach(f => {
            current1nLaudoSelectedFieldKeys.delete(`${f.tabId}:${f.id}`);
        });

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function quickAddFieldToAnalytical1n(tabId, fieldId, evt) {
        if (evt) { evt.stopPropagation(); evt.preventDefault(); }
        if (!currentTemplate) return;
        if (!Array.isArray(currentTemplate.blocos)) currentTemplate.blocos = [];

        const fields = window.ReportAdapter.getFormFields(currentTemplate.form_id);
        const targetField = fields.find(f => f.id === fieldId) || { id: fieldId, label: fieldId };
        const canonId = getCanonicalColId(fieldId, targetField.label);

        let block = currentTemplate.blocos.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');
        if (!block) {
            block = {
                id: 'blk_ana1n_' + Date.now(),
                tipo: 'galeria_fotos',
                titulo: 'Vistoria Fotográfica & Anexos (1:N)',
                sourceTabId: tabId || 'consolidado',
                campos_selecionados: [],
                campos_larguras: {},
                layoutFotos: selectedPhotoLayout || '2_cols',
                ordem_cronologica: current1nSortOrder || 'desc',
                ordenar_por_aba: current1nGroupByTab || false,
                densidade: current1nLaudoDensity || 'compact',
                zebrado: current1nLaudoRowStriping || 'slate',
                exibirLegenda: true,
                exibirData: true,
                exibirCoords: true,
                exibirResp: true,
                exibirObs: true,
                exibirLinks: true
            };
            currentTemplate.blocos.push(block);
        }
        if (!Array.isArray(block.campos_selecionados)) block.campos_selecionados = [];
        const exists = block.campos_selecionados.some(cf => {
            const cId = typeof cf === 'string' ? cf : (cf.rawId || cf.id);
            const cTab = typeof cf === 'object' ? (cf.tabId || '') : '';
            return (cTab === tabId || !cTab || !tabId) && cId === fieldId;
        });
        if (!exists) {
            block.campos_selecionados.push({ id: fieldId, label: targetField.label, rawId: fieldId, tabId: tabId });
        }

        current1nLaudoSelectedFieldKeys.add(`${tabId}:${fieldId}`);

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function quickRemoveFieldFromAnalytical1n(tabId, fieldId, evt) {
        if (evt) { evt.stopPropagation(); evt.preventDefault(); }
        if (!currentTemplate || !Array.isArray(currentTemplate.blocos)) return;
        let block = currentTemplate.blocos.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');
        if (!block || !Array.isArray(block.campos_selecionados)) return;

        const fields = window.ReportAdapter.getFormFields(currentTemplate.form_id);
        const targetField = fields.find(f => f.id === fieldId) || { id: fieldId, label: fieldId };
        const canonId = getCanonicalColId(fieldId, targetField.label);

        block.campos_selecionados = block.campos_selecionados.filter(cf => {
            const cId = typeof cf === 'string' ? cf : (cf.rawId || cf.id);
            const cTab = typeof cf === 'object' ? (cf.tabId || '') : '';
            return !((cTab === tabId || !cTab || !tabId) && cId === fieldId);
        });

        current1nLaudoSelectedFieldKeys.delete(`${tabId}:${fieldId}`);

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function quickAddFieldTo1n(tabId, fieldId, targetType, evt) {
        if (evt) { evt.stopPropagation(); evt.preventDefault(); }
        if (!currentTemplate) return;
        if (!Array.isArray(currentTemplate.blocos)) currentTemplate.blocos = [];

        const fields = window.ReportAdapter.getFormFields(currentTemplate.form_id);
        const targetField = fields.find(f => f.id === fieldId) || { id: fieldId, label: fieldId };

        const hasSyn = currentTemplate.blocos.some(b => b.tipo === 'tabela_sintetica_1n');
        const hasAna = currentTemplate.blocos.some(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');

        const useSyn = targetType === 'sintetica' || (hasSyn && !hasAna) || (!targetType && hasSyn);

        if (useSyn) {
            let block = currentTemplate.blocos.find(b => b.tipo === 'tabela_sintetica_1n');
            if (!block) {
                block = {
                    id: 'blk_syn1n_' + Date.now(),
                    tipo: 'tabela_sintetica_1n',
                    titulo: 'Quadro Sintético de Vistorias (Histórico 1:N)',
                    sourceTabId: tabId || 'consolidado',
                    colunas: [],
                    ordem_cronologica: current1nSortOrder || 'desc',
                    ordenar_por_aba: current1nGroupByTab || false
                };
                currentTemplate.blocos.push(block);
            }
            if (!Array.isArray(block.colunas)) block.colunas = [];
            const canonId = getCanonicalColId(fieldId, targetField.label);
            const existingCol = block.colunas.find(c => {
                const cId = typeof c === 'string' ? c : c.id;
                const cLabel = (typeof c === 'object' && c.label) ? c.label : cId;
                const cCanon = getCanonicalColId(cId, cLabel);
                return cId === fieldId || cId === canonId || cCanon === canonId;
            });

            if (existingCol) {
                if (typeof existingCol === 'object') {
                    existingCol.fieldIds = existingCol.fieldIds || [existingCol.id];
                    if (!existingCol.fieldIds.includes(fieldId)) existingCol.fieldIds.push(fieldId);
                    existingCol.tabIds = existingCol.tabIds || [];
                    if (tabId && !existingCol.tabIds.includes(tabId)) existingCol.tabIds.push(tabId);
                }
            } else {
                block.colunas.push({
                    id: canonId,
                    label: targetField.label,
                    fieldIds: [fieldId],
                    tabIds: tabId ? [tabId] : []
                });
            }
        } else {
            let block = currentTemplate.blocos.find(b => b.tipo === 'galeria_fotos' || b.tipo === 'laudo_vistoria_fotos');
            if (!block) {
                block = {
                    id: 'blk_ana1n_' + Date.now(),
                    tipo: 'galeria_fotos',
                    titulo: 'Vistoria Fotográfica & Anexos (1:N)',
                    sourceTabId: tabId || 'consolidado',
                    campos_selecionados: [],
                    layoutFotos: selectedPhotoLayout || '2_cols',
                    ordem_cronologica: current1nSortOrder || 'desc',
                    ordenar_por_aba: current1nGroupByTab || false,
                    exibirLegenda: true,
                    exibirData: true,
                    exibirCoords: true,
                    exibirResp: true,
                    exibirObs: true,
                    exibirLinks: true
                };
                currentTemplate.blocos.push(block);
            }
            if (!Array.isArray(block.campos_selecionados)) block.campos_selecionados = [];
            const exists = block.campos_selecionados.some(f => (typeof f === 'string' ? f : f.id) === fieldId);
            if (!exists) {
                block.campos_selecionados.push({ id: fieldId, label: targetField.label, tabId: tabId });
            }
        }

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function removeColumnFromSynthetic1n(blockIndex, colId, evt) {
        if (evt) { evt.stopPropagation(); evt.preventDefault(); }
        const bloco = currentTemplate?.blocos?.[blockIndex];
        if (!bloco || !Array.isArray(bloco.colunas)) return;

        bloco.colunas = bloco.colunas.filter(c => {
            const id = typeof c === 'string' ? c : c.id;
            return id !== colId;
        });

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    function removeFieldFromAnalytical1n(blockIndex, fieldId, evt) {
        if (evt) { evt.stopPropagation(); evt.preventDefault(); }
        const bloco = currentTemplate?.blocos?.[blockIndex];
        if (!bloco) return;

        if (Array.isArray(bloco.campos_selecionados)) {
            bloco.campos_selecionados = bloco.campos_selecionados.filter(f => {
                const id = typeof f === 'string' ? f : (f.rawId || f.id);
                return id !== fieldId;
            });
        }

        // Remove do conjunto de chaves selecionadas para manter o checkbox do drawer sincronizado
        Array.from(current1nLaudoSelectedFieldKeys).forEach(k => {
            if (k.endsWith(`:${fieldId}`) || k === fieldId) {
                current1nLaudoSelectedFieldKeys.delete(k);
            }
        });

        if (fieldId === 'obs') bloco.exibirObs = false;
        if (fieldId === 'links') bloco.exibirLinks = false;
        if (fieldId === 'legenda') bloco.exibirLegenda = false;
        if (fieldId === 'data') bloco.exibirData = false;
        if (fieldId === 'coords') bloco.exibirCoords = false;
        if (fieldId === 'resp') bloco.exibirResp = false;

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
        renderA4Blocks();

        const formId = currentTemplate?.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
    }

    // Alias para compatibilidade
    const insertPhotoBlock = insertAnalyticalPhotos1nBlock;

    // --- MANIPULADORES DO CARD 7: TABELA SINTÉTICA COM REORDENAÇÃO ---
    // --- MANIPULADORES DO CARD 8: TABELA ANALÍTICA APROFUNDADA ---
    // --- MANIPULADORES DA CAIXA DE TEXTO LIVRE & @MENTIONS ---
    function insertFreeTextBlock() {
        const titulo = document.getElementById('cfg-free-text-title')?.value || '';
        const text = document.getElementById('cfg-free-text-content')?.value || 'Digite seu texto livre aqui. Use a barra de ferramentas para negrito, itálico, alinhamento e digite @ para buscar e inserir campos cadastrais dinamicamente na sequência do texto.';
        
        currentTemplate.blocos.push({
            id: 'blk_ftext_' + Date.now(),
            tipo: 'caixa_texto_livre',
            titulo: titulo,
            conteudo: text,
            alinhamento: 'justify',
            espacamento: '1.6'
        });

        renderA4Blocks();
    }

    function execFormat(command, value = null) {
        const cmd = String(command || '').toLowerCase();
        
        // 1. Executa formatação padrão no documento para texto comum selecionado
        document.execCommand(command, false, value);

        // 2. Detecta se há tags de menção (@campo) selecionadas ou ativas
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        const tagsToFormat = new Set();

        // Verifica o container comum e os nós no range
        let container = range.commonAncestorContainer;
        if (container.nodeType === Node.TEXT_NODE) container = container.parentElement;

        if (container) {
            if (container.classList && container.classList.contains('mention-tag')) {
                tagsToFormat.add(container);
            } else if (container.querySelectorAll) {
                const candidates = container.querySelectorAll('.mention-tag');
                candidates.forEach(tag => {
                    try {
                        if (sel.containsNode(tag, true) || (range.intersectsNode && range.intersectsNode(tag))) {
                            tagsToFormat.add(tag);
                        }
                    } catch(e) {}
                });
            }
        }

        // Fallback: verifica se o cursor/âncora está dentro de uma tag
        if (sel.anchorNode) {
            let el = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
            if (el && el.closest('.mention-tag')) {
                tagsToFormat.add(el.closest('.mention-tag'));
            }
        }
        if (sel.focusNode) {
            let el = sel.focusNode.nodeType === Node.ELEMENT_NODE ? sel.focusNode : sel.focusNode.parentElement;
            if (el && el.closest('.mention-tag')) {
                tagsToFormat.add(el.closest('.mention-tag'));
            }
        }

        // 3. Aplica ou alterna o estilo de formatação (Negrito, Itálico, Sublinhado) diretamente nas tags encontradas
        if (tagsToFormat.size > 0) {
            tagsToFormat.forEach(tag => {
                if (cmd === 'bold') {
                    const isBold = tag.getAttribute('data-format-bold') === 'true';
                    if (isBold) {
                        tag.removeAttribute('data-format-bold');
                        tag.style.fontWeight = 'normal';
                        tag.classList.remove('font-bold', 'font-black', 'is-bold');
                    } else {
                        tag.setAttribute('data-format-bold', 'true');
                        tag.style.fontWeight = 'bold';
                        tag.classList.add('font-bold', 'font-black', 'is-bold');
                    }
                } else if (cmd === 'italic') {
                    const isItalic = tag.getAttribute('data-format-italic') === 'true';
                    if (isItalic) {
                        tag.removeAttribute('data-format-italic');
                        tag.style.fontStyle = 'normal';
                        tag.classList.remove('italic');
                    } else {
                        tag.setAttribute('data-format-italic', 'true');
                        tag.style.fontStyle = 'italic';
                        tag.classList.add('italic');
                    }
                } else if (cmd === 'underline') {
                    const isUnderline = tag.getAttribute('data-format-underline') === 'true';
                    if (isUnderline) {
                        tag.removeAttribute('data-format-underline');
                        tag.style.textDecoration = 'none';
                        tag.classList.remove('underline');
                    } else {
                        tag.setAttribute('data-format-underline', 'true');
                        tag.style.textDecoration = 'underline';
                        tag.classList.add('underline');
                    }
                }
            });
        }

        // Localiza o editor ativo e salva imediatamente o conteúdo com as tags formatadas
        let activeEditor = container ? container.closest('.free-text-editor') : null;
        if (!activeEditor && tagsToFormat && tagsToFormat.size > 0) {
            const firstTag = tagsToFormat.values().next().value;
            if (firstTag) activeEditor = firstTag.closest('.free-text-editor');
        }
        if (!activeEditor) {
            activeEditor = document.querySelector('.free-text-editor:focus');
        }
        if (activeEditor) {
            const blockIdxAttr = activeEditor.id ? activeEditor.id.replace('free-text-editor-', '') : null;
            const blockIdx = blockIdxAttr !== null ? parseInt(blockIdxAttr, 10) : null;
            if (blockIdx !== null && !isNaN(blockIdx)) {
                saveFreeTextContent(blockIdx, activeEditor.innerHTML);
            }
        }
    }

    function changeLineHeight(blockIndex, lineHeight) {
        const editor = document.getElementById(`free-text-editor-${blockIndex}`);
        if (editor) {
            editor.style.lineHeight = lineHeight;
        }
        if (currentTemplate && currentTemplate.blocos && currentTemplate.blocos[blockIndex]) {
            currentTemplate.blocos[blockIndex].espacamento = lineHeight;
            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                window.ReportAdapter.saveReportTemplate(currentTemplate);
            }
        }
    }

    function saveFreeTextContent(blockIndex, html) {
        if (!currentTemplate || !currentTemplate.blocos || !currentTemplate.blocos[blockIndex]) return;
        currentTemplate.blocos[blockIndex].conteudo = html;
        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }
    }

    let activeMentionState = {
        blockIndex: null,
        query: '',
        selectedIndex: 0,
        activeRange: null
    };

    function handleFreeTextInput(event, blockIndex) {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
            const textBeforeCaret = node.textContent.slice(0, range.startOffset);
            const atMatch = textBeforeCaret.match(/@([\w\u00C0-\u017F\s]*)$/);
            if (atMatch) {
                const query = atMatch[1].trim();
                activeMentionState.blockIndex = blockIndex;
                activeMentionState.query = query;
                activeMentionState.activeRange = range.cloneRange();
                renderMentionDropdown(blockIndex, query);
                return;
            }
        }
        hideMentionDropdown(blockIndex);
    }

    function handleFreeTextKeyDown(event, blockIndex) {
        // Atalhos de teclado rápidos para formatação rica (Ctrl+B, Ctrl+I, Ctrl+U)
        if (event.ctrlKey || event.metaKey) {
            const k = event.key.toLowerCase();
            if (k === 'b') {
                event.preventDefault();
                execFormat('bold');
                return;
            }
            if (k === 'i') {
                event.preventDefault();
                execFormat('italic');
                return;
            }
            if (k === 'u') {
                event.preventDefault();
                execFormat('underline');
                return;
            }
        }

        const dropdown = document.getElementById(`mention-dropdown-${blockIndex}`);
        if (!dropdown || dropdown.classList.contains('hidden')) return;

        const items = dropdown.querySelectorAll('.mention-dropdown-item');
        if (items.length === 0) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            activeMentionState.selectedIndex = (activeMentionState.selectedIndex + 1) % items.length;
            updateMentionDropdownHighlight(items);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            activeMentionState.selectedIndex = (activeMentionState.selectedIndex - 1 + items.length) % items.length;
            updateMentionDropdownHighlight(items);
        } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            const activeItem = items[activeMentionState.selectedIndex];
            if (activeItem) {
                const fId = activeItem.getAttribute('data-field-id');
                const fName = activeItem.getAttribute('data-field-name');
                const fLabel = activeItem.getAttribute('data-field-label');
                const tTitle = activeItem.getAttribute('data-tab-title') || '';
                insertMentionField(blockIndex, fId, fName, fLabel, tTitle);
            }
        } else if (event.key === 'Escape') {
            hideMentionDropdown(blockIndex);
        }
    }

    function showMentionDropdown(blockIndex) {
        activeMentionState.blockIndex = blockIndex;
        activeMentionState.query = '';
        renderMentionDropdown(blockIndex, '');
    }

    function renderMentionDropdown(blockIndex, query) {
        const dropdown = document.getElementById(`mention-dropdown-${blockIndex}`);
        if (!dropdown) return;

        const formId = currentTemplate ? currentTemplate.form_id : null;
        const allFields = window.ReportAdapter ? window.ReportAdapter.getFormFields(formId) : [];
        const cleanQuery = (query || '').toLowerCase().trim();
        const filtered = allFields.filter(f => 
            (f.label && f.label.toLowerCase().includes(cleanQuery)) || 
            (f.name && f.name.toLowerCase().includes(cleanQuery)) ||
            (f.tabTitle && f.tabTitle.toLowerCase().includes(cleanQuery))
        );

        if (filtered.length === 0) {
            dropdown.innerHTML = '<div class="p-2.5 text-[11px] text-slate-400 italic text-center">Nenhum campo encontrado com "@' + escapeHtml(query) + '"</div>';
            dropdown.classList.remove('hidden');
            elevarBlocoDaLista(dropdown, true);
            return;
        }

        activeMentionState.selectedIndex = 0;
        dropdown.innerHTML = `
            <div class="px-2.5 py-1.5 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-t-lg">
                <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[13px] text-sky-500">alternate_email</span> Campos com Origem da Aba</span>
                <span class="text-[9px] font-mono">${filtered.length} encontrados</span>
            </div>
            <div class="py-1 space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
                ${filtered.map((f, i) => `
                    <div class="mention-dropdown-item flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${i === 0 ? 'bg-sky-100 text-sky-900 dark:bg-sky-900/60 dark:text-sky-100 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}" 
                         data-field-id="${escapeHtml(f.id)}" 
                         data-field-name="${escapeHtml(f.name)}" 
                         data-field-label="${escapeHtml(f.label)}"
                         data-tab-title="${escapeHtml(f.tabTitle || 'Aba Geral')}"
                         onmousedown="event.preventDefault(); ReportBuilder.insertMentionField(${blockIndex}, '${escapeHtml(f.id)}', '${escapeHtml(f.name)}', '${escapeHtml(f.label)}', '${escapeHtml(f.tabTitle || 'Aba Geral')}')">
                        <div class="flex items-center gap-2 min-w-0 flex-1">
                            <span class="material-symbols-outlined text-[15px] text-sky-500 shrink-0">alternate_email</span>
                            <div class="flex flex-col min-w-0">
                                <span class="truncate text-xs font-bold text-slate-800 dark:text-slate-100">${escapeHtml(f.label)}</span>
                                <div class="flex items-center gap-1 text-[10.5px] text-slate-500 dark:text-slate-400">
                                    <span class="material-symbols-outlined text-[12px] text-slate-400">tab</span>
                                    <span>Aba: <strong class="text-slate-700 dark:text-slate-200 font-semibold">${escapeHtml(f.tabTitle || 'Aba Geral')}</strong></span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-1 shrink-0 ml-2">
                            ${f.condition ? `<span class="text-[8.5px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 px-1 py-0.2 rounded font-mono" title="Condicionado a: ${escapeHtml(f.condition)}">Cond.</span>` : ''}
                            <span class="text-[9px] font-mono text-slate-400 dark:text-slate-400 uppercase bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">${escapeHtml(f.type || 'text')}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        dropdown.classList.remove('hidden');
        elevarBlocoDaLista(dropdown, true);
    }

    /**
     * Cada bloco da folha cria a própria camada (z-10): sem isto, os blocos de baixo (campos, botões de largura) ficavam
     * PINTADOS POR CIMA da lista aberta, e ela parecia transparente. Enquanto a lista está aberta, o bloco dela sobe.
     */
    function elevarBlocoDaLista(dropdown, aberta) {
        const bloco = dropdown && dropdown.closest ? dropdown.closest('.report-block-item') : null;
        if (bloco && bloco.style) bloco.style.zIndex = aberta ? '60' : '';
    }

    function updateMentionDropdownHighlight(items) {
        items.forEach((item, idx) => {
            if (idx === activeMentionState.selectedIndex) {
                item.className = 'mention-dropdown-item flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors bg-sky-100 text-sky-900 dark:bg-sky-900/60 dark:text-sky-100 font-bold';
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.className = 'mention-dropdown-item flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300';
            }
        });
    }

    function hideMentionDropdown(blockIndex) {
        const dropdown = document.getElementById(`mention-dropdown-${blockIndex}`);
        if (dropdown) { dropdown.classList.add('hidden'); elevarBlocoDaLista(dropdown, false); }
    }

    function insertMentionField(blockIndex, fieldId, fieldName, fieldLabel, tabTitle = '') {
        const editor = document.getElementById(`free-text-editor-${blockIndex}`);
        if (!editor) return;

        editor.focus();
        const selection = window.getSelection();

        // Se há um @ digitado no cursor, remove o texto do @query
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const node = range.startContainer;
            if (node && node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent;
                const atIndex = text.lastIndexOf('@', range.startOffset);
                if (atIndex !== -1) {
                    node.textContent = text.slice(0, atIndex) + text.slice(range.startOffset);
                    range.setStart(node, atIndex);
                    range.collapse(true);
                }
            }
        }

        // Insere o token formatado com a indicação visual da aba (sem negrito forçado por padrão para permitir formatação rica personalizada)
        const displayTag = tabTitle ? `@${fieldLabel} (${tabTitle})` : `@${fieldLabel}`;
        const tokenHtml = `<span class="mention-tag inline-block bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200 px-1.5 py-0.5 rounded font-mono text-[11px] select-all align-middle cursor-pointer transition-all hover:ring-1 hover:ring-sky-400" data-field-id="${fieldId}" data-field-name="${fieldName}" data-tab-title="${tabTitle}" contenteditable="false" title="Clique para selecionar e aplicar Negrito, Itálico ou Sublinhado • Campo: ${fieldLabel} • Aba: ${tabTitle}">${displayTag}</span>&nbsp;`;
        document.execCommand('insertHTML', false, tokenHtml);

        hideMentionDropdown(blockIndex);
        saveFreeTextContent(blockIndex, editor.innerHTML);
    }

    // --- MANIPULADORES DO CARD 9: PARECER E RODAPÉ ---
    function insertTextBlock() {
        const text = document.getElementById('cfg-text-notes')?.value || 'Parecer e fundamentação técnica.';
        currentTemplate.blocos.push({
            id: 'blk_txt_' + Date.now(),
            tipo: 'texto_livre',
            titulo: 'Parecer Técnico & Fundamentação',
            conteudo: text
        });
        renderA4Blocks();
    }

    function insertFooterBlock() {
        const pages = document.getElementById('cfg-ftr-pages')?.checked ?? true;
        const hash = document.getElementById('cfg-ftr-hash')?.checked ?? true;
        const qr = document.getElementById('cfg-ftr-qr')?.checked ?? true;
        const date = document.getElementById('cfg-ftr-date')?.checked ?? true;
        const startSecond = document.getElementById('cfg-ftr-page-start-second')?.checked;
        const startMode = startSecond ? 'segunda' : 'primeira';

        // Garante que não haja rodapés duplicados: se já houver um, remove antes de inserir no fim
        currentTemplate.blocos = (currentTemplate.blocos || []).filter(b => b.tipo !== 'rodape');

        currentTemplate.blocos.push({
            id: 'blk_ftr_' + Date.now(),
            tipo: 'rodape',
            numeracao: pages,
            exibirHash: hash,
            exibirQr: qr,
            exibirDataHora: date,
            inicio_numeracao: startMode
        });

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }

        renderA4Blocks();
    }

    function setFooterPageStart(mode) {
        let ftr = (currentTemplate?.blocos || []).find(b => b.tipo === 'rodape');
        if (!ftr) {
            insertFooterBlock();
            ftr = (currentTemplate?.blocos || []).find(b => b.tipo === 'rodape');
        }
        if (ftr) {
            ftr.inicio_numeracao = mode;
        }

        // Sincroniza botões na barra lateral se os elementos existirem
        const rFirst = document.getElementById('cfg-ftr-page-start-first');
        const rSecond = document.getElementById('cfg-ftr-page-start-second');
        if (rFirst && rSecond) {
            rFirst.checked = (mode !== 'segunda');
            rSecond.checked = (mode === 'segunda');
        }

        const bFirst = document.getElementById('btn-ftr-start-first');
        const bSecond = document.getElementById('btn-ftr-start-second');
        if (bFirst && bSecond) {
            const activeClasses = 'bg-primary/10 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/30';
            const inactiveClasses = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-300';
            if (mode === 'segunda') {
                bFirst.className = bFirst.className.replace(activeClasses, inactiveClasses);
                bSecond.className = bSecond.className.replace(inactiveClasses, activeClasses);
            } else {
                bSecond.className = bSecond.className.replace(activeClasses, inactiveClasses);
                bFirst.className = bFirst.className.replace(inactiveClasses, activeClasses);
            }
        }

        if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
            window.ReportAdapter.saveReportTemplate(currentTemplate);
        }

        renderA4Blocks();
    }

    function updateFooterProperty(prop, value) {
        let ftr = (currentTemplate?.blocos || []).find(b => b.tipo === 'rodape');
        if (!ftr) {
            insertFooterBlock();
            ftr = (currentTemplate?.blocos || []).find(b => b.tipo === 'rodape');
        }
        if (ftr) {
            ftr[prop] = value;
            if (window.ReportAdapter && typeof window.ReportAdapter.saveReportTemplate === 'function') {
                window.ReportAdapter.saveReportTemplate(currentTemplate);
            }
            renderA4Blocks();
        }
    }

    // --- CONTROLE GERAL DO TEMPLATE ---
    function removeBlock(index) {
        if (!currentTemplate || !currentTemplate.blocos) return;
        currentTemplate.blocos.splice(index, 1);
        renderA4Blocks();
    }

    function moveBlock(index, direction) {
        if (!currentTemplate || !currentTemplate.blocos) return;
        const currentBlock = currentTemplate.blocos[index];
        if (currentBlock && currentBlock.tipo === 'rodape') return; // Rodapé fica sempre no final da folha

        const target = index + direction;
        if (target < 0 || target >= currentTemplate.blocos.length) return;
        const targetBlock = currentTemplate.blocos[target];
        if (targetBlock && targetBlock.tipo === 'rodape') return; // Não permite passar para depois do rodapé fixo

        const item = currentTemplate.blocos.splice(index, 1)[0];
        currentTemplate.blocos.splice(target, 0, item);
        renderA4Blocks();
    }

    function updateAtalhoAba(value) {
        if (!currentTemplate) return;
        currentTemplate.atalho_aba = value;
        currentTemplate.disponibilizar_no_mapa = (value !== 'none');
        saveCurrentTemplate(false);
    }

    function toggleDisponibilizarMapa(checked) {
        if (!currentTemplate) return;
        currentTemplate.disponibilizar_no_mapa = checked;
        if (!checked) currentTemplate.atalho_aba = 'none';
        else if (currentTemplate.atalho_aba === 'none') currentTemplate.atalho_aba = 'header';
        saveCurrentTemplate(false);
    }

    function updateTemplateName(name) {
        if (!currentTemplate) return;
        currentTemplate.nome = name;
    }

    function onTemplateChange(selectedVal) {
        const formId = currentTemplate ? currentTemplate.form_id : null;
        if (!formId) return;

        if (selectedVal === '__new__') {
            currentTemplate = window.ReportAdapter.createDefaultTemplate(formId, builderScope, builderScope === 'geral' ? 'Nova Camada' : 'Novo Modelo');
        } else {
            const templates = window.ReportAdapter.getReportTemplates(formId);
            const found = templates.find(t => t.id === selectedVal);
            if (found) currentTemplate = JSON.parse(JSON.stringify(found));
        }
        ensureTemplateDefaults();
        renderBuilderInterface(formId, currentTemplate.nome);
    }

    function saveCurrentTemplate(showAlert = true) {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
        if (!currentTemplate) return;
        const ok = window.ReportAdapter.saveReportTemplate(currentTemplate);
        if (showAlert) {
            if (ok) alert('Modelo de Relatório salvo com sucesso!');
            else alert('Erro ao salvar modelo.');
        }
    }

    function deleteCurrentTemplate() {
        if (!currentTemplate || !confirm(`Deseja realmente excluir o modelo "${currentTemplate.nome}"?`)) return;
        window.ReportAdapter.deleteReportTemplate(currentTemplate.id);
        initReportBuilderTab(currentTemplate.form_id, undefined, { scope: builderScope });
    }

    /**
     * Imprime ou Gera PDF da folha atual no visualizador oficial A4.
     * Abre a folha com renderização limpa, sem 'about:blank', sem alças/drag handles e sem vazamentos.
     */
    function printReport() {
        if (!currentTemplate) return;
        if (typeof saveCurrentTemplate === 'function') {
            saveCurrentTemplate();
        }
        if (typeof openFeatureReportPage === 'function') {
            openFeatureReportPage(currentTemplate.form_id, currentTemplate.id, window.activeFeatureData || {});
            return;
        }

        const stage = document.getElementById('a4-sheet-stage');
        if (!stage) return;

        const orient = pageDims().orient;
        const pageCss = pageDims().cssPageSize;

        const printWin = window.open('', '_blank', 'width=950,height=1000');
        if (!printWin) {
            alert('Permita popups no navegador para visualizar a impressão A4.');
            return;
        }

        const styles = `
            <style>
                @page { size: ${pageCss}; margin: 0 !important; }
                body { font-family: 'IBM Plex Sans', sans-serif; background: #fff; color: #111c2d; margin: 0; padding: 0; }
                .print\\:hidden, button, .drag-handle, #a4-margin-guide, .a4-margin-guide { display: none !important; }
                [contenteditable] { outline: none !important; border: none !important; }
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
                .page-break-avoid { break-inside: avoid; page-break-inside: avoid; }
            </style>
            <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600;700;900&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
            <script src="https://cdn.tailwindcss.com"></script>
        `;

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title></title>
                    ${styles}
                </head>
                <body>
                    <div style="width: 100%; max-width: ${orient === 'landscape' ? '1050px' : '794px'}; margin: 0 auto; padding: 0;">
                        ${stage.innerHTML}
                    </div>
                    <script>
                        window.addEventListener('beforeprint', () => { document.title = ''; });
                        setTimeout(() => { window.print(); }, 600);
                    </script>
                </body>
            </html>
        `);
        printWin.document.close();
    }

    /**
     * Emissão rápida da feição individual selecionada no mapa com injeção automática de dados e dimensões reais.
     */
    function generateIndividualReport(formId, featureData = {}, featureGeometry = null) {
        if (!formId) return;

        const templates = window.ReportAdapter.getReportTemplates(formId);
        let tpl = templates.find(t => t.tipo === 'individual' && t.atalho_aba !== 'none');
        if (!tpl) tpl = templates.find(t => t.tipo === 'individual');
        if (!tpl) tpl = window.ReportAdapter.createDefaultTemplate(formId, 'individual', 'Ficha Cadastral');

        if (typeof openFeatureReportPage === 'function') {
            openFeatureReportPage(formId, tpl.id, featureData, featureGeometry);
            return;
        }

        let dims = null;
        if (featureGeometry && typeof window.ReportAdapter.calculateFeatureDimensions === 'function') {
            dims = window.ReportAdapter.calculateFeatureDimensions(featureGeometry);
        }

        const orient = tpl.config_pagina ? tpl.config_pagina.orientacao : 'portrait';
        const mm = (tpl.config_pagina && tpl.config_pagina.margens_mm) || { top: 15, bottom: 15, left: 15, right: 15 };
        const fields = window.ReportAdapter.getFormFields(formId);

        const win = window.open('', '_blank', 'width=950,height=1000');
        if (!win) {
            alert('Permita popups para visualizar o relatório individual A4.');
            return;
        }

        let bodyHtml = `<div style="width: 100%; max-width: ${orient === 'landscape' ? '1050px' : '794px'}; margin: 0 auto; padding: 20px; font-family: 'IBM Plex Sans', sans-serif;">`;

        (tpl.blocos || []).forEach(b => {
            if (b.tipo === 'cabecalho') {
                bodyHtml += `
                    <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #0f2942; padding-bottom:12px; margin-bottom:16px;">
                        <div>
                            <div style="font-size:11px; text-transform:uppercase; font-weight:bold; color:#64748b;">${escapeHtml(b.subtitulo || '')}</div>
                            <div style="font-size:18px; font-weight:900; text-transform:uppercase; color:#0f2942;">${escapeHtml(b.titulo || '')}</div>
                        </div>
                        <div style="text-align:right; font-size:11px; color:#64748b; font-family:monospace;">
                            Data: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
                        </div>
                    </div>
                `;
            } else if (b.tipo === 'mapa_estatico') {
                bodyHtml += `
                    <div style="margin-bottom:16px; border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc;">
                        <div style="font-size:12px; font-weight:bold; text-transform:uppercase; margin-bottom:8px; color:#0f2942;">${escapeHtml(b.titulo || 'Delimitação Geográfica')}</div>
                        <div style="height:180px; background:#0f172a; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#fff; position:relative;">
                            <div style="border:2px solid #34d399; background:rgba(16, 185, 129, 0.25); padding:16px 24px; border-radius:4px; font-weight:bold; font-size:12px;">
                                Feição Georreferenciada • Área: ${dims ? dims.areaM2 : (featureData.area || 'N/I')} m²
                            </div>
                            <div style="position:absolute; bottom:8px; left:8px; font-size:10px; font-family:monospace; color:#cbd5e1;">
                                Escala ${b.escala || '1:2.500'} • SIRGAS 2000 UTM Zone 25S
                            </div>
                        </div>
                        ${dims && dims.segmentos && dims.segmentos.length > 0 ? `
                            <div style="margin-top:8px; font-size:11px; font-family:monospace; color:#334155; display:flex; flex-wrap:wrap; gap:8px;">
                                ${dims.segmentos.slice(0, 8).map(s => `<span style="background:#e2e8f0; padding:2px 6px; border-radius:4px;">${s.rotulo}: ${s.comprimento}m</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            } else if (b.tipo === 'grade_campos') {
                const colCount = b.colunasLayout || 2;
                const spans = b.campos_spans || {};
                const larguras = b.campos_larguras || {};
                const fieldsMap = new Map();
                fields.forEach(f => {
                    fieldsMap.set(f.id, f);
                    if (f.name) fieldsMap.set(f.name, f);
                });

                const rawSel = Array.isArray(b.campos_selecionados) ? b.campos_selecionados : [];
                let flds = rawSel
                    .map(item => typeof item === 'string' ? { id: item } : item)
                    .map(item => {
                        const baseField = fieldsMap.get(item.id) || fieldsMap.get(item.name) || {};
                        return { ...baseField, ...item };
                    })
                    .filter(f => f && (f.label || f.name));

                if (flds.length === 0 && rawSel.length > 0) {
                    const selSet = new Set(rawSel.map(s => typeof s === 'string' ? s : s.id));
                    flds = fields.filter(f => selSet.has(f.id));
                }

                if (colCount === 1) {
                    bodyHtml += `
                        <div style="margin-bottom:16px; border:1px solid #cbd5e1; border-radius:8px; padding:12px;">
                            <div style="font-size:12px; font-weight:bold; text-transform:uppercase; margin-bottom:10px; color:#0f2942;">${escapeHtml(b.titulo || 'Dados Cadastrais')}</div>
                            <div style="display:flex; flex-direction:column; gap:6px;">
                                ${flds.map(f => {
                                    const val = featureData[f.name] || featureData[f.id] || featureData[f.label] || '—';
                                    return `
                                        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; font-size:11px;">
                                            <span style="font-weight:bold; color:#475569;">${escapeHtml(f.label)}:</span>
                                            <span style="font-weight:bold; color:#0f172a; font-family:monospace;">${escapeHtml(String(val))}</span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                } else {
                    bodyHtml += `
                        <div style="margin-bottom:16px; border:1px solid #cbd5e1; border-radius:8px; padding:12px;">
                            <div style="font-size:12px; font-weight:bold; text-transform:uppercase; margin-bottom:10px; color:#0f2942;">${escapeHtml(b.titulo || 'Dados Cadastrais')}</div>
                            <div style="display:flex; flex-wrap:wrap; gap:8px;">
                                ${flds.map(f => {
                                    const val = featureData[f.name] || featureData[f.id] || featureData[f.label] || '—';
                                    let pct = larguras[f.id];
                                    if (!pct) {
                                        const span = Math.min(spans[f.id] || f.colSpan || 1, colCount);
                                        if (span >= colCount) pct = 100;
                                        else if (colCount === 3 && span === 2) pct = 66;
                                        else pct = colCount === 3 ? 33 : 50;
                                    }
                                    pct = Math.round(pct);
                                    const wStyle = getFieldWidthStyle(pct);
                                    return `
                                        <div style="padding:6px 8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; flex: 0 0 ${wStyle}; max-width: ${wStyle}; width: ${wStyle}; box-sizing: border-box;">
                                            <div style="font-size:10px; font-weight:bold; color:#64748b; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(f.label)}</div>
                                            <div style="font-size:12px; font-weight:bold; color:#1e293b; margin-top:2px; ${pct > 55 ? 'word-break:break-word;' : 'white-space:nowrap; overflow:hidden; text-overflow:ellipsis;'}">${escapeHtml(String(val))}</div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }
            } else if (b.tipo === 'galeria_fotos') {
                bodyHtml += `
                    <div style="margin-bottom:16px; border:1px solid #cbd5e1; border-radius:8px; padding:12px;">
                        <div style="font-size:12px; font-weight:bold; text-transform:uppercase; margin-bottom:10px; color:#0f2942;">${escapeHtml(b.titulo || 'Vistoria Fotográfica')}</div>
                        <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px;">
                            <div style="height:120px; background:#e2e8f0; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:11px;">Fachada Principal</div>
                            <div style="height:120px; background:#e2e8f0; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:11px;">Lateral / Vista Aérea</div>
                        </div>
                    </div>
                `;
            } else if (b.tipo === 'rodape') {
                bodyHtml += `
                    <div style="border-top:1px solid #cbd5e1; padding-top:10px; margin-top:20px; display:flex; justify-content:space-between; font-size:10px; color:#64748b;">
                        <div>Emissão Oficial • Sistema Cartográfico Integrado</div>
                        <div>Página 1 de 1</div>
                    </div>
                `;
            }
        });

        bodyHtml += `</div>`;

        openFeatureReportPage(tpl.id, featureData, featureGeometry);
    }

    function openFeatureReportPage(templateId, featureData = {}, featureGeometry = null) {
        // Se chamado acidentalmente com formato (formId, templateId, featureData)
        if (typeof featureData === 'string') {
            const realTplId = featureData;
            featureData = (featureGeometry && typeof featureGeometry === 'object') ? featureGeometry : {};
            featureGeometry = arguments[3] || null;
            templateId = realTplId;
        }

        // Fallback automático para garantir dados da feição ativa se featureData for vazio ou omitido
        if (!featureData || Object.keys(featureData).length === 0) {
            if (typeof window !== 'undefined') {
                if (window.activeFeatureData && Object.keys(window.activeFeatureData).length > 0) {
                    featureData = window.activeFeatureData;
                } else if (window.currentFormFeatureData && Object.keys(window.currentFormFeatureData).length > 0) {
                    featureData = window.currentFormFeatureData;
                } else if (window.activeFeatureLayer && window.activeFeatureLayer.feature && window.activeFeatureLayer.feature.properties) {
                    featureData = window.activeFeatureLayer.feature.properties;
                } else if (typeof activeFeatureLayer !== 'undefined' && activeFeatureLayer && activeFeatureLayer.feature && activeFeatureLayer.feature.properties) {
                    featureData = activeFeatureLayer.feature.properties;
                }
            }
        }
        if (!featureGeometry && typeof window !== 'undefined') {
            const layer = window.activeFeatureLayer || (typeof activeFeatureLayer !== 'undefined' ? activeFeatureLayer : null);
            if (layer && layer.feature && layer.feature.geometry) {
                featureGeometry = layer.feature.geometry;
            } else if (layer && typeof layer.toGeoJSON === 'function') {
                featureGeometry = layer.toGeoJSON().geometry;
            }
        }

        // Recupera template completo para repassar ao visualizador
        let tpl = null;
        if (typeof window.ReportAdapter !== 'undefined' && typeof window.ReportAdapter.getReportTemplates === 'function') {
            const allTpls = window.ReportAdapter.getReportTemplates();
            tpl = (allTpls || []).find(t => t.id === templateId || t.form_id === templateId);
        }
        if (!tpl) {
            try {
                const localTpls = JSON.parse(localStorage.getItem('constructive_report_templates') || '[]');
                tpl = (localTpls || []).find(t => t.id === templateId || t.form_id === templateId);
            } catch(e) {}
        }
        if (!tpl && currentTemplate && (currentTemplate.id === templateId || currentTemplate.form_id === templateId)) {
            tpl = currentTemplate;
        }

        const resolvedFormId = (tpl && tpl.form_id) || (currentTemplate ? currentTemplate.form_id : (featureData ? (featureData.formId || featureData.themeId) : null));

        // Obtém campos e abas para garantir renderização perfeita dos atributos e 1:N
        let formFields = [];
        let formTabs = [];

        // Prioridade 1: Schema ativo da feição renderizada no momento (garante nomes reais das abas e tipos de campos)
        if (typeof window !== 'undefined') {
            const activeSchema = window.activeFormSchema || window.currentFormFeatures || window.activeFormTabs;
            if (Array.isArray(activeSchema) && activeSchema.length > 0) {
                formTabs = JSON.parse(JSON.stringify(activeSchema));
                formTabs.forEach(t => {
                    if (Array.isArray(t.fields)) {
                        t.fields.forEach(f => {
                            formFields.push({
                                ...f,
                                tabId: t.id,
                                tabTitle: t.title || 'Aba Geral',
                                isMultiple: !!t.isMultiple
                            });
                        });
                    }
                });
            }
        }

        // Prioridade 2: ReportAdapter
        if (formTabs.length === 0 && typeof window.ReportAdapter !== 'undefined') {
            if (typeof window.ReportAdapter.getFormTabs === 'function') {
                try { formTabs = window.ReportAdapter.getFormTabs(resolvedFormId) || []; } catch(e) {}
            }
            if (typeof window.ReportAdapter.getFormFields === 'function') {
                try { formFields = window.ReportAdapter.getFormFields(resolvedFormId) || []; } catch(e) {}
            }
        }

        // Prioridade 3: LocalStorage e variáveis globais de formulários
        if (formTabs.length === 0 || formFields.length === 0) {
            try {
                const formsList = (typeof allForms !== 'undefined' && Array.isArray(allForms)) 
                    ? allForms 
                    : ((typeof forms !== 'undefined' && Array.isArray(forms)) ? forms : JSON.parse(localStorage.getItem('constructive_forms') || '[]'));
                const f = formsList.find(item => item.id === resolvedFormId) || formsList[0];
                if (f && Array.isArray(f.tabs) && f.tabs.length > 0) {
                    if (formTabs.length === 0) formTabs = f.tabs;
                    if (formFields.length === 0) {
                        f.tabs.forEach(t => {
                            if (Array.isArray(t.fields)) {
                                t.fields.forEach(fld => {
                                    formFields.push({
                                        ...fld,
                                        tabId: t.id,
                                        tabTitle: t.title || 'Aba Geral',
                                        isMultiple: !!t.isMultiple
                                    });
                                });
                            }
                        });
                    }
                }
            } catch(e) {}
        }

        // PERMISSÃO E CONDIÇÃO DE ABA (mesma regra do card do mapa). Isto roda na página do mapa, que é a
        // única que conhece as permissões do usuário: o relatório só recebe o que ele pode ver, e os dados
        // das abas ocultas nem chegam à página do relatório.
        if (window.ReportData && Array.isArray(formTabs) && formTabs.length > 0) {
            const tabOptions = window.currentFormOptions || {};
            const canSeeTab = (tab) => (typeof window.canSeeFormTab === 'function')
                ? window.canSeeFormTab(resolvedFormId, tab.id, tabOptions)
                : true;
            const shownTabs = window.ReportData.visibleTabs(formTabs, featureData || {}, { canSeeTab });
            featureData = window.ReportData.filterData(featureData || {}, formTabs, shownTabs);
            const shownIds = new Set(shownTabs.map(t => t.id));
            formFields = (formFields || []).filter(f => !f.tabId || shownIds.has(f.tabId));
            formTabs = shownTabs;
        }

        // MINI-MAPA: camadas ATIVAS no mapa (e que o usuário pode ver) ao redor da feição, só geometria.
        // O relatório é outra janela e não conhece o mapa; por isso a página do mapa entrega esses dados prontos.
        let camadasMapa = [];
        let ortofotosMapa = [];
        let featureKeyMapa = '';
        try {
            const activeProps = (window.activeFeatureLayer && window.activeFeatureLayer.feature && window.activeFeatureLayer.feature.properties) || featureData || {};
            if (window.MapTools) {
                featureKeyMapa = window.MapTools.featureKey(activeProps) || window.MapTools.featureKey(featureData);
                const temMapa = tpl && Array.isArray(tpl.blocos) && tpl.blocos.some(b => b.tipo === 'mapa_estatico');
                if (temMapa && Array.isArray(window.themes)) {
                    // Rótulo (Quadra/Lote) e nome principal de cada feição vizinha: os mesmos que a lista lateral mostra,
                    // e só de camadas cujos DADOS o usuário pode ver (a geometria sozinha não revela atributos).
                    const rotulos = (theme, f) => {
                        try {
                            if (typeof window.canUserSeeThemeData === 'function' && !window.canUserSeeThemeData(theme)) return null;
                            if (typeof window.getFeaturePropertyValue !== 'function') return null;
                            const lab = (k) => (typeof window.getThemeFieldLabel === 'function' ? window.getThemeFieldLabel(theme, k) : k);
                            const partes = [];
                            if (theme.disp2Active !== false) { const v = window.getFeaturePropertyValue(theme, f, theme.disp2 || 'Quadra'); if (v) partes.push(lab(theme.disp2 || 'Quadra') + ' ' + v); }
                            if (theme.disp1Active !== false) { const v = window.getFeaturePropertyValue(theme, f, theme.disp1 || 'Lote'); if (v) partes.push(lab(theme.disp1 || 'Lote') + ' ' + v); }
                            const titulo = window.getFeaturePropertyValue(theme, f, theme.mainTitle || 'Proprietário');
                            return { r: partes.join(' • '), t: titulo ? String(titulo) : '' };
                        } catch (e) { return null; }
                    };
                    camadasMapa = window.MapTools.collectNearbyLayers(window.themes, featureGeometry, {
                        excludeKey: featureKeyMapa,
                        canSee: (id) => (typeof window.userCanOnTheme !== 'function') || window.userCanOnTheme(id, 'ver'),
                        labelFn: rotulos,
                        // campos da camada (para a coluna Confrontantes) e valores das feições próximas: só com permissão de ver os dados
                        fieldsFn: (theme) => {
                            try {
                                if (typeof window.canUserSeeThemeData === 'function' && !window.canUserSeeThemeData(theme)) return [];
                                const vistos = new Set();
                                const lista = [];
                                const add = (k, l) => { const s = String(k || ''); if (!s || vistos.has(s.toLowerCase())) return; vistos.add(s.toLowerCase()); lista.push({ k: s, l: String(l || s).slice(0, 60) }); };
                                const forms = (typeof allForms !== 'undefined' && Array.isArray(allForms)) ? allForms : (Array.isArray(window.allForms) ? window.allForms : []);
                                const form = theme.formId ? forms.find(f => f.id === theme.formId) : null;
                                ((form && (form.schema || form.tabs)) || []).forEach(tab => (tab.fields || []).forEach(fl => add(fl.id || fl.name || fl.label, fl.label || fl.name || fl.id)));
                                (theme.features || []).slice(0, 30).forEach(ft => Object.keys((ft && ft.properties) || {}).forEach(k => { if (k.charAt(0) !== '_' && k !== 'themeId' && k !== 'id_banco') add(k, typeof window.getThemeFieldLabel === 'function' ? window.getThemeFieldLabel(theme, k) : k); }));
                                return lista;
                            } catch (e) { return []; }
                        },
                        valuesFn: (theme, f, campos) => {
                            const out = {};
                            try {
                                if (typeof window.getFeaturePropertyValue !== 'function') return out;
                                campos.forEach(c => { const v = window.getFeaturePropertyValue(theme, f, c.k); if (v !== undefined && v !== null && v !== '') out[c.k] = v; });
                            } catch (e) { /* sem valores */ }
                            return out;
                        }
                    });
                }
            }
            // ANÁLISE TEMPORAL: ortofotos que o usuário pode ver e que podem cobrir a feição (com data e precisão)
            if (window.MapTools && Array.isArray(window.rasterLayers) && tpl && Array.isArray(tpl.blocos) && tpl.blocos.some(b => b.tipo === 'mapa_estatico')) {
                ortofotosMapa = window.MapTools.buildOrtofotoList(window.rasterLayers, featureGeometry, {
                    storedDate: (id) => { try { return localStorage.getItem('raster_date_' + id); } catch (e) { return null; } }
                }).slice(0, 24);
            }
        } catch(e) { camadasMapa = []; ortofotosMapa = []; }

        const payload = {
            templateId: templateId,
            template: tpl || null,
            formId: resolvedFormId,
            formFields: formFields,
            formTabs: formTabs,
            featureData: featureData || {},
            featureGeometry: featureGeometry || null,
            featureKey: featureKeyMapa,
            camadasMapa: camadasMapa,
            ortofotos: ortofotosMapa,
            timestamp: Date.now()
        };
        const persistPayload = () => {
            try {
                const json = JSON.stringify(payload);
                sessionStorage.setItem('constructive_active_report_payload', json);
                localStorage.setItem('constructive_active_report_payload', json);
                return true;
            } catch(e) { return false; }
        };
        // Se as camadas vizinhas não couberem no armazenamento do navegador, reduz até caber (a feição e os dados vão sempre)
        if (!persistPayload()) {
            payload.camadasMapa = payload.camadasMapa.map(c => Object.assign({}, c, { features: c.features.slice(0, 200), truncated: true }));
            if (!persistPayload()) {
                payload.camadasMapa = [];
                if (!persistPayload()) console.error('[ReportBuilder] Erro ao salvar payload do relatório.');
            }
        }
        window.open(`relatorio_view.html?templateId=${encodeURIComponent(templateId)}`, '_blank');
    }
    window.openFeatureReportPage = openFeatureReportPage;

    /**
     * "Ver como sairá": abre o relatório real (relatorio_view.html) com o modelo em edição (mesmo sem salvar) e uma
     * feição FIXA DE TESTE (dados de exemplo para cada tipo de campo, geometria de 20 x 30 m, vizinhos e uma rua).
     * A janela avisa que é prévia e não salva ajustes nem registra emissões.
     */
    function previewReal() {
        if (!currentTemplate || !currentTemplate.form_id) return;
        if (!window.ReportPreview) { alert('Módulo de prévia não carregado. Recarregue a página.'); return; }
        const formTabs = (window.ReportAdapter && window.ReportAdapter.getFormTabs) ? window.ReportAdapter.getFormTabs(currentTemplate.form_id) : [];
        const payload = window.ReportPreview.buildPreviewPayload({ template: JSON.parse(JSON.stringify(currentTemplate)), formId: currentTemplate.form_id, formTabs: JSON.parse(JSON.stringify(formTabs || [])) });
        try {
            const json = JSON.stringify(payload);
            sessionStorage.setItem('constructive_active_report_payload', json);
            localStorage.setItem('constructive_active_report_payload', json);
        } catch (e) {
            alert('Não foi possível preparar a prévia (armazenamento do navegador cheio).');
            return;
        }
        window.open('relatorio_view.html?templateId=' + encodeURIComponent(currentTemplate.id || '') + '&previa=1', '_blank');
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatInlineText(str, fallback = '') {
        const val = (str !== undefined && str !== null && str !== '') ? str : fallback;
        return escapeHtml(String(val)).replace(/\r?\n/g, '<br>');
    }

    // Lista de campos do "@": fecha ao clicar em qualquer lugar fora dela (o botão "@ Inserir Campo" só a abre)
    if (typeof document !== 'undefined') {
        document.addEventListener('mousedown', function (e) {
            const alvo = e.target;
            if (alvo && alvo.closest && (alvo.closest('[id^="mention-dropdown-"]') || alvo.closest('[onmousedown*="showMentionDropdown"]'))) return;
            document.querySelectorAll('[id^="mention-dropdown-"]').forEach(function (d) {
                if (!d.classList.contains('hidden')) { d.classList.add('hidden'); elevarBlocoDaLista(d, false); }
            });
        });
    }

    // Seleção com clique simples em tags de menção (@campo) para facilitar aplicação imediata de Negrito, Itálico e Sublinhado
    if (typeof document !== 'undefined') {
        document.addEventListener('click', function (e) {
            const tag = e.target && e.target.closest ? e.target.closest('.mention-tag') : null;
            if (tag) {
                const sel = window.getSelection();
                if (sel) {
                    const range = document.createRange();
                    range.selectNode(tag);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        });
    }

    // Exportação Global
    window.ReportBuilder = {
        initReportBuilderTab,
        toggleAccordion,
        updateOrientation,
        setPageSize,
        setMarginPreset,
        updateMargin,
        updateAtalhoAba,
        toggleAllFieldsInDrawer,
        toggleTabFieldsInDrawer,
        filterGridFieldsInDrawer,
        selectGridColumns,
        selectMapMode,
        selectChartLayout,
        selectPhotoLayout,
        handleLogoUpload,
        insertHeaderBlock,
        setHeaderRepeatMode,
        updateHeaderProperty,
        insertGridBlock,
        addSelectedFieldsToExistingGrid,
        quickAddFieldToExistingGrid,
        removeFieldFromGrid,
        toggleGridFieldSpan,
        changeFieldWidthStep,
        setFieldWidthExact,
        toggleFieldWidthPopover,
        closeFieldWidthPopover,
        insertMapBlock,
        insertChartBlock,
        selectPhotoLayout,
        select1nScope,
        on1nSourceTabChange,
        insertPhotoBlock,
        insertSynthetic1nBlock,
        addSelectedFieldsToExistingSynthetic1n,
        insertAnalyticalPhotos1nBlock,
        addSelectedFieldsToExistingAnalytical1n,
        quickAddFieldTo1n,
        removeColumnFromSynthetic1n,
        removeFieldFromAnalytical1n,
        moveSynthetic1nColumn,
        editSynthetic1nColTitle,
        set1nTableDensity,
        set1nRowStriping,
        set1nLaudoDensity,
        set1nLaudoRowStriping,
        move1nTabSequence,
        move1nLaudoTabSequence,
        setFieldFileMode,
        set1nSortOrder,
        set1nGroupByTab,
        toggleAll1nFieldsInDrawer,
        toggleTab1nFieldsInDrawer,
        toggleAccordionTab,
        on1nSynTabSelectChange,
        on1nLaudoTabSelectChange,
        filter1nFieldsInDrawer,
        on1nFieldCheckboxChange,
        sync1nSelectedFieldsFromDOM,
        on1nLaudoFieldCheckboxChange,
        sync1nLaudoSelectedFieldsFromDOM,
        getSelected1nLaudoFieldsFromDrawer,
        toggleAll1nLaudoFieldsInDrawer,
        toggleTab1nLaudoFieldsInDrawer,
        filter1nLaudoFieldsInDrawer,
        quickAddFieldToAnalytical1n,
        quickRemoveFieldFromAnalytical1n,
        removeSelectedFieldsFromExistingAnalytical1n,
        insertTextBlock,
        insertFreeTextBlock,
        execFormat,
        changeLineHeight,
        saveFreeTextContent,
        handleFreeTextInput,
        handleFreeTextKeyDown,
        showMentionDropdown,
        insertMentionField,
        insertFooterBlock,
        setFooterPageStart,
        updateFooterProperty,
        enableInlineEdit,
        updateBlockProperty,
        removeBlock,
        moveBlock,
        toggleDisponibilizarMapa,
        updateTemplateName,
        onTemplateChange,
        saveCurrentTemplate,
        deleteCurrentTemplate,
        printReport,
        generateIndividualReport,
        openFeatureReportPage,
        previewReal
    };

})();
