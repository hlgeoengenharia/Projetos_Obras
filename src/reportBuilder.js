// src/reportBuilder.js
// CONSTRUTOR VISUAL DE RELATÓRIOS GERENCIAIS A4 (DRAG-AND-DROP & ACORDEÃO ESTILO WORD/CANVA)
// Padrão: Processador de Texto Cartográfico com Rigor SIG (Cartographic Precision)
// Consumo 100% Read-Only desacoplado via window.ReportAdapter

(function() {
    'use strict';

    let currentTemplate = null;
    let sortableInstance = null;
    let activeAccordionId = 'acc-layout'; // Card 0 aberto por padrão
    let selectedSyntheticCols = [];
    let selectedAnalyticalCols = [];
    window._customUploadedLogoUrl = null;

    /**
     * Inicializa o construtor de relatórios para o formulário selecionado.
     */
    function initReportBuilderTab(formId, formName = 'Formulário') {
        if (!formId) return;

        const container = document.getElementById('report-builder-container');
        if (!container) return;

        const templates = window.ReportAdapter ? window.ReportAdapter.getReportTemplates(formId) : [];

        if (templates.length > 0) {
            currentTemplate = JSON.parse(JSON.stringify(templates[0]));
        } else {
            currentTemplate = window.ReportAdapter.createDefaultTemplate(formId, 'individual', formName);
        }

        // Garante configurações padrão completas
        ensureTemplateDefaults();

        // Inicializa colunas padrão para os cards de tabela
        const fields = window.ReportAdapter ? window.ReportAdapter.getFormFields(formId) : [];
        selectedSyntheticCols = fields.slice(0, 5).map(f => f.id);
        selectedAnalyticalCols = fields.slice(0, 7).map(f => f.id);

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

        const templates = window.ReportAdapter.getReportTemplates(formId);
        const isIndividual = currentTemplate.tipo === 'individual';
        const formTabs = window.ReportAdapter.getFormTabs ? window.ReportAdapter.getFormTabs(formId) : [];

        container.innerHTML = `
            <div class="flex flex-col gap-6 w-full font-sans">
                <!-- 1. BARRA SUPERIOR DE AÇÕES E VÍNCULO COM O MAPA -->
                <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div class="flex flex-wrap items-center gap-3 flex-1">
                        <!-- Seletor de Modelo -->
                        <div class="flex flex-col min-w-[180px]">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Modelo de Relatório</label>
                            <select id="rpt-select-template" onchange="ReportBuilder.onTemplateChange(this.value)" class="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold dark:text-white focus:ring-2 focus:ring-primary/40 focus:outline-none">
                                ${templates.map(t => `<option value="${t.id}" ${t.id === currentTemplate.id ? 'selected' : ''}>${t.nome} (${t.tipo === 'individual' ? 'Ficha Individual' : 'Consolidado Lote'})</option>`).join('')}
                                <option value="__new__">+ Criar Novo Modelo de Relatório...</option>
                            </select>
                        </div>

                        <!-- Nome do Relatório -->
                        <div class="flex flex-col flex-1 min-w-[200px]">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Nome do Documento</label>
                            <input type="text" id="rpt-template-name" value="${escapeHtml(currentTemplate.nome)}" oninput="ReportBuilder.updateTemplateName(this.value)" class="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold dark:text-white focus:ring-2 focus:ring-primary/40 focus:outline-none" placeholder="Ex: Ficha Cadastral Oficial..." />
                        </div>

                        <!-- Escopo: Individual vs Lote -->
                        <div class="flex flex-col">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Escopo</label>
                            <div class="inline-flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                                <button type="button" onclick="ReportBuilder.switchType('individual')" class="px-3 py-1 rounded-lg text-xs font-bold transition-all ${isIndividual ? 'bg-primary text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-primary'}">
                                    Individual
                                </button>
                                <button type="button" onclick="ReportBuilder.switchType('geral')" class="px-3 py-1 rounded-lg text-xs font-bold transition-all ${!isIndividual ? 'bg-primary text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-primary'}">
                                    Geral
                                </button>
                            </div>
                        </div>

                        <!-- VÍNCULO COM O POPUP DO MAPA: EM QUAL ABA EXIBIR O ATALHO -->
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
                    </div>

                    <!-- Botões de Ação -->
                    <div class="flex items-center gap-2 self-end xl:self-center shrink-0">
                        <button type="button" onclick="ReportBuilder.printReport()" class="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer" title="Visualizar ou Imprimir em A4">
                            <span class="material-symbols-outlined text-[18px] text-primary dark:text-sky-400">print</span>
                            <span>Imprimir A4 / PDF</span>
                        </button>
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
                                <span class="font-bold">Folha A4 Interativa:</span>
                                <span class="text-slate-400 text-[11px]">Dê duplo-clique em qualquer texto da folha para editar</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-[11px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md" id="a4-dimension-indicator">210 × 297 mm</span>
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

                            <!-- PAPEL A4 BRANCO PURO -->
                            <div id="a4-sheet-stage" class="bg-white text-slate-900 relative transition-all duration-200 shadow-[0_10px_30px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)] border border-slate-200/80">
                                <!-- Linha-Guia Visual de Margem de Impressão (Não sai na impressão) -->
                                <div id="a4-margin-guide" class="pointer-events-none absolute border border-dashed border-sky-400/40 print:hidden z-0"></div>

                                <!-- Container dos Blocos Reais da Folha -->
                                <div id="a4-blocks-list" class="flex flex-col gap-5 w-full relative z-10">
                                    <!-- Injetado via renderA4Blocks() -->
                                </div>
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
        if (!stage || !currentTemplate || !currentTemplate.config_pagina) return;

        const orient = currentTemplate.config_pagina.orientacao || 'portrait';
        const mm = currentTemplate.config_pagina.margens_mm || { top: 15, bottom: 15, left: 15, right: 15 };

        // 1mm = aprox 3.78px a 96 DPI
        const scaleFactor = 3.78;
        let widthMm = (orient === 'landscape') ? 297 : 210;
        let heightMm = (orient === 'landscape') ? 210 : 297;
        let nominalWidthPx = Math.round(widthMm * scaleFactor); // 794px em retrato, 1123px em paisagem
        let nominalHeightPx = Math.round(heightMm * scaleFactor); // 1123px em retrato, 794px em paisagem

        // Folha sempre 100% visível, responsiva e sem cortes laterais:
        stage.style.width = '100%';
        stage.style.maxWidth = (orient === 'landscape') ? `${nominalWidthPx}px` : '794px';
        stage.style.boxSizing = 'border-box';
        stage.style.minHeight = (orient === 'landscape') ? `${nominalHeightPx}px` : '1050px';

        const padTop = Math.round(mm.top * scaleFactor);
        const padBot = Math.round(mm.bottom * scaleFactor);
        const padLeft = Math.round(mm.left * scaleFactor);
        const padRight = Math.round(mm.right * scaleFactor);

        stage.style.padding = `${padTop}px ${padRight}px ${padBot}px ${padLeft}px`;

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
            ruler.style.maxWidth = (orient === 'landscape') ? `${nominalWidthPx}px` : '794px';
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
            breakInd.style.maxWidth = (orient === 'landscape') ? `${nominalWidthPx}px` : '794px';
        }

        const indicator = document.getElementById('a4-dimension-indicator');
        if (indicator) {
            indicator.textContent = orient === 'landscape' ? '297 × 210 mm (Paisagem)' : '210 × 297 mm (Retrato)';
        }
    }

    /**
     * Renderiza o Painel de Acordeão com os 10 Cards de configuração prévia.
     */
    function renderAccordionPanel(formId) {
        const fields = window.ReportAdapter.getFormFields(formId);
        const charts = window.ReportAdapter.getExistingCharts(formId);
        const multipleTabs = (window.ReportAdapter && window.ReportAdapter.getMultipleTabs) ? window.ReportAdapter.getMultipleTabs(formId) : [];
        const cfg = currentTemplate.config_pagina;
        const mm = cfg.margens_mm || { top: 15, bottom: 15, left: 15, right: 15 };

        // Agrupamento ordenado de campos por Aba
        const tabGroupsMap = new Map();
        fields.forEach(f => {
            const tId = f.tabId || 'geral';
            const tTitle = f.tabTitle || 'Aba Geral';
            if (!tabGroupsMap.has(tId)) {
                tabGroupsMap.set(tId, {
                    id: tId,
                    title: tTitle,
                    fields: []
                });
            }
            tabGroupsMap.get(tId).fields.push(f);
        });
        const tabGroups = Array.from(tabGroupsMap.values());

        return `
            <!-- CARD 0: CONFIGURAÇÃO DA FOLHA (LAYOUT DA PÁGINA) -->
            ${renderAccordionCard({
                id: 'acc-layout',
                title: 'Configuração da Folha (Layout A4)',
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
                                    <span>Retrato (210×297)</span>
                                </button>
                                <button type="button" onclick="ReportBuilder.updateOrientation('landscape')" class="flex items-center justify-center gap-1.5 p-2 rounded-xl border text-xs font-bold transition-all ${cfg.orientacao === 'landscape' ? 'bg-primary text-white border-primary shadow-xs' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}">
                                    <span class="material-symbols-outlined text-[16px]">crop_landscape</span>
                                    <span>Paisagem (297×210)</span>
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
            ${renderAccordionCard({
                id: 'acc-header',
                title: 'Cabeçalho Institucional',
                icon: 'account_balance',
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
                            <input type="text" id="cfg-hdr-subtitle" value="Prefeitura Municipal • Secretaria de Planejamento e Obras" class="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-medium" placeholder="Ex: Prefeitura Municipal..." />
                        </div>
                        <div>
                            <label class="text-[10px] font-bold uppercase text-slate-500 block mb-1">Título Principal do Relatório</label>
                            <input type="text" id="cfg-hdr-title" value="FICHA CADASTRAL INDIVIDUAL DO IMÓVEL" class="w-full px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl" placeholder="Ex: FICHA TÉCNICA CADASTRAL..." />
                        </div>

                        <div class="space-y-1.5 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                            <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input type="checkbox" id="cfg-hdr-logo" checked class="rounded text-primary focus:ring-0" />
                                <span>Exibir Brasão / Logomarca Oficial</span>
                            </label>
                            <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input type="checkbox" id="cfg-hdr-date" checked class="rounded text-primary focus:ring-0" />
                                <span>Data e Hora Automática da Emissão</span>
                            </label>
                            <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input type="checkbox" id="cfg-hdr-protocol" checked class="rounded text-primary focus:ring-0" />
                                <span>Número de Protocolo e Autenticação</span>
                            </label>
                        </div>

                        <button type="button" onclick="ReportBuilder.insertHeaderBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">add_circle</span> Inserir Cabeçalho na Folha
                        </button>
                    </div>
                `
            })}

            <!-- CARD 2: GRADE DE ATRIBUTOS / CAMPOS (AGRUPADOS POR ABA) -->
            ${renderAccordionCard({
                id: 'acc-grid',
                title: 'Grade de Atributos / Campos',
                icon: 'table_rows',
                badge: `${fields.length} campos • ${tabGroups.length} abas`,
                content: `
                    <div class="flex flex-col gap-3">
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

                        <!-- Lista de Abas com seus respectivos campos -->
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
                                            <label class="cfg-grid-field-item flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 text-xs text-slate-700 dark:text-slate-300 cursor-pointer transition-colors" data-field-label="${escapeHtml(f.label.toLowerCase())}" data-tab-id="${escapeHtml(tg.id)}">
                                                <input type="checkbox" name="cfg-grid-field" data-tab-id="${escapeHtml(tg.id)}" data-tab-title="${escapeHtml(tg.title)}" value="${escapeHtml(f.id)}" ${tgIdx === 0 && i < 6 ? 'checked' : ''} class="rounded text-primary focus:ring-0" />
                                                <div class="flex flex-col min-w-0 flex-1">
                                                    <div class="flex items-center gap-1.5">
                                                        <span class="truncate font-medium text-slate-800 dark:text-slate-200" title="${escapeHtml(f.label)}">${escapeHtml(f.label)}</span>
                                                        ${f.condition ? `
                                                            <span class="text-[9px] text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/60 px-1 py-0.2 rounded font-mono shrink-0" title="Condicionado a: ${escapeHtml(f.condition)} = ${escapeHtml(f.condValue || '')}">Condicional</span>
                                                        ` : ''}
                                                    </div>
                                                </div>
                                                <span class="text-[9px] font-mono text-slate-400 uppercase shrink-0">${escapeHtml(f.type || 'text')}</span>
                                            </label>
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

                        <button type="button" onclick="ReportBuilder.insertGridBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">add_circle</span> Inserir Grade na Folha
                        </button>
                    </div>
                `
            })}

            <!-- CARD 3: MINI-MAPA CARTOGRÁFICO (RECURSOS AVANÇADOS) -->
            ${renderAccordionCard({
                id: 'acc-map',
                title: 'Mini-Mapa Cartográfico (SIG)',
                icon: 'map',
                badge: 'Precisão Cartográfica',
                content: `
                    <div class="flex flex-col gap-3">
                        <!-- Seletor de Modo: Atual vs Temporal Ortofotos -->
                        <div class="flex flex-col gap-1.5">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Modo de Visualização Cartográfica</label>
                            <div class="grid grid-cols-2 gap-2">
                                <button type="button" id="btn-map-mode-current" onclick="ReportBuilder.selectMapMode('atual')" class="p-2 rounded-xl border text-xs font-bold text-center transition-all bg-primary text-white border-primary shadow-xs cursor-pointer">
                                    Mapa Estático Atual
                                </button>
                                <button type="button" id="btn-map-mode-temporal" onclick="ReportBuilder.selectMapMode('temporal')" class="p-2 rounded-xl border text-xs font-bold text-center transition-all bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    Série Multitemporal
                                </button>
                            </div>
                        </div>

                        <!-- Opções Específicas do Modo Temporal -->
                        <div id="cfg-map-temporal-options" class="hidden p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl flex flex-col gap-2">
                            <div class="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                                <span class="material-symbols-outlined text-[16px]">history_toggle_subpath</span>
                                <span>Sequência Cronológica Decrescente</span>
                            </div>
                            <p class="text-[11px] text-amber-800/80 dark:text-amber-300/80">Identifica ortofotos sobrepostas com datas distintas e gera quadros comparativos do mais recente para o mais antigo, com o vetor destacado em cada um.</p>
                            <label class="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                                <input type="checkbox" id="cfg-map-temporal-highlight" checked class="rounded text-primary focus:ring-0" />
                                <span>Destacar polígono vetorizado com cota em cada voo</span>
                            </label>
                        </div>

                        <!-- Elementos de Medição e Cartografia -->
                        <div class="flex flex-col gap-1.5 pt-1">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Elementos Cartográficos e Medições</label>
                            <div class="space-y-1.5 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-map-cotas" checked class="rounded text-primary focus:ring-0" />
                                    <span class="font-semibold text-emerald-700 dark:text-emerald-400">Cotas perimetrais (comprimento dos lados em metros)</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-map-area" checked class="rounded text-primary focus:ring-0" />
                                    <span>Cálculo automático de Área Total (m² e hectares)</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-map-norte" checked class="rounded text-primary focus:ring-0" />
                                    <span>Rosa dos Ventos (Seta de Norte Verdadeiro)</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-map-escala" checked class="rounded text-primary focus:ring-0" />
                                    <span>Barra de Escala Gráfica e Datum SIRGAS 2000 UTM</span>
                                </label>
                            </div>
                        </div>

                        <div>
                            <label class="text-[10px] font-bold uppercase text-slate-500 block mb-1">Anotações Técnicas / Nota Cartográfica</label>
                            <input type="text" id="cfg-map-note" value="Delimitação cadastral georreferenciada em conformidade com o sistema cartográfico municipal e SIRGAS 2000." class="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl" />
                        </div>

                        <button type="button" onclick="ReportBuilder.insertMapBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">add_circle</span> Inserir Mini-Mapa na Folha
                        </button>
                    </div>
                `
            })}

            <!-- CARD 4: GRÁFICOS DO DASHBOARD -->
            ${renderAccordionCard({
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

            <!-- CARD 5: PAINEL DE KPIS / MÉDIAS ESTATÍSTICAS -->
            ${renderAccordionCard({
                id: 'acc-kpis',
                title: 'Painel de KPIs / Médias Estatísticas',
                icon: 'speed',
                content: `
                    <div class="flex flex-col gap-3">
                        <p class="text-[11px] text-slate-500">Selecione os campos do cadastro e as métricas estatísticas que comporão os cartões de indicadores:</p>
                        <div class="space-y-2 text-xs">
                            <div class="p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="cfg-kpi-count" checked class="rounded text-primary focus:ring-0" />
                                    <div>
                                        <div class="font-bold text-slate-800 dark:text-slate-200">Total de Imóveis / Feições</div>
                                        <div class="text-[10px] text-slate-400">Contagem de registros na camada</div>
                                    </div>
                                </label>
                                <span class="font-mono text-[10px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">COUNT</span>
                            </div>
                            <div class="p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="cfg-kpi-area" checked class="rounded text-primary focus:ring-0" />
                                    <div>
                                        <div class="font-bold text-slate-800 dark:text-slate-200">Média de Área Territorial (m²)</div>
                                        <div class="text-[10px] text-slate-400">Média aritmética da dimensão territorial</div>
                                    </div>
                                </label>
                                <span class="font-mono text-[10px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">AVG</span>
                            </div>
                            <div class="p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="cfg-kpi-sum" checked class="rounded text-primary focus:ring-0" />
                                    <div>
                                        <div class="font-bold text-slate-800 dark:text-slate-200">Soma Total Territorial / Financeira</div>
                                        <div class="text-[10px] text-slate-400">Somatório agregado dos lotes cadastrados</div>
                                    </div>
                                </label>
                                <span class="font-mono text-[10px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">SUM</span>
                            </div>
                            <div class="p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="cfg-kpi-pct" checked class="rounded text-primary focus:ring-0" />
                                    <div>
                                        <div class="font-bold text-slate-800 dark:text-slate-200">Índice de Regularidade / Situação</div>
                                        <div class="text-[10px] text-slate-400">Percentual proporcional de situação regular</div>
                                    </div>
                                </label>
                                <span class="font-mono text-[10px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">PERCENT</span>
                            </div>
                        </div>
                        <button type="button" onclick="ReportBuilder.insertKpiBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">add_circle</span> Inserir Painel de KPIs na Folha
                        </button>
                    </div>
                `
            })}

            <!-- CARD 6: VISTORIA FOTOGRÁFICA & ANEXOS 1:N (REFORMULADO) -->
            ${renderAccordionCard({
                id: 'acc-photos',
                title: 'Vistoria Fotográfica & Anexos (1:N)',
                icon: 'photo_library',
                badge: multipleTabs.length > 0 ? `${multipleTabs.length} Abas 1:N` : '1:N Multianexos',
                content: `
                    <div class="flex flex-col gap-3.5">
                        <!-- 1. SELEÇÃO DA ABA 1:N (FONTE DOS DADOS) -->
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Fonte dos Dados 1:N (Aba de Vistorias)</label>
                            <select id="cfg-1n-source-tab" onchange="ReportBuilder.on1nSourceTabChange(this.value)" class="w-full px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-1 focus:ring-primary focus:outline-none dark:text-white">
                                <option value="consolidado">🌐 Todas as Vistorias (Histórico Consolidado 1:N)</option>
                                ${multipleTabs.map(t => `
                                    <option value="${escapeHtml(t.id)}">📋 Aba: ${escapeHtml(t.title)}</option>
                                `).join('')}
                            </select>
                            <p class="text-[10px] text-slate-400 mt-1">Selecione uma aba 1:N específica ou o histórico consolidado de todas as vistorias.</p>
                        </div>

                        <!-- SEÇÃO A: TABELA SINTÉTICA (QUADRO CRONOLÓGICO 1:N) -->
                        <div class="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                            <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
                                <span class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-[16px] text-sky-600">table_rows</span>
                                    1. Tabela Sintética (Cronológica)
                                </span>
                                <span class="text-[9px] font-mono bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 px-1.5 py-0.5 rounded font-bold">1:N Resumo</span>
                            </div>
                            
                            <label class="text-[10px] font-bold uppercase text-slate-500 block">Colunas da Tabela Sintética:</label>
                            <div class="grid grid-cols-2 gap-1.5 text-xs text-slate-700 dark:text-slate-300" id="cfg-1n-syn-cols-container">
                                <label class="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" name="cfg-1n-syn-col" value="data" checked class="rounded text-primary focus:ring-0" />
                                    <span>Data da Vistoria</span>
                                </label>
                                <label class="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" name="cfg-1n-syn-col" value="org" checked class="rounded text-primary focus:ring-0" />
                                    <span>Órgão / Entidade</span>
                                </label>
                                <label class="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" name="cfg-1n-syn-col" value="situacao_ocupacao" checked class="rounded text-primary focus:ring-0" />
                                    <span>Situação Ocupação</span>
                                </label>
                                <label class="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" name="cfg-1n-syn-col" value="situacao_recuo" checked class="rounded text-primary focus:ring-0" />
                                    <span>Situação Recuo</span>
                                </label>
                                <label class="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" name="cfg-1n-syn-col" value="area_invadida" checked class="rounded text-primary focus:ring-0" />
                                    <span>Área Invadida (m²)</span>
                                </label>
                                <label class="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" name="cfg-1n-syn-col" value="qtd_fotos" checked class="rounded text-primary focus:ring-0" />
                                    <span>Qtd de Fotos</span>
                                </label>
                            </div>

                            <button type="button" onclick="ReportBuilder.insertSynthetic1nBlock()" class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                                <span class="material-symbols-outlined text-[16px]">add_circle</span> Inserir Tabela Sintética na Folha
                            </button>
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
                                    <button type="button" id="btn-1n-scope-all" onclick="ReportBuilder.select1nScope('todas')" class="py-1.5 px-2 rounded-lg border text-xs font-bold text-center bg-primary/10 text-primary border-primary cursor-pointer">Todas as Vistorias</button>
                                    <button type="button" id="btn-1n-scope-last" onclick="ReportBuilder.select1nScope('ultima')" class="py-1.5 px-2 rounded-lg border text-xs font-semibold text-center bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer">Apenas Última Vistoria</button>
                                </div>
                            </div>

                            <!-- Disposição Visual das Fotos -->
                            <div>
                                <label class="text-[10px] font-bold uppercase text-slate-500 block mb-1">Disposição Visual das Fotos:</label>
                                <div class="grid grid-cols-3 gap-1.5">
                                    <button type="button" id="btn-photo-layout-1" onclick="ReportBuilder.selectPhotoLayout('1_col')" class="py-1.5 px-2 rounded-lg border text-xs font-semibold text-center bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer">1 por Linha</button>
                                    <button type="button" id="btn-photo-layout-2" onclick="ReportBuilder.selectPhotoLayout('2_cols')" class="py-1.5 px-2 rounded-lg border text-xs font-bold text-center bg-primary/10 text-primary border-primary cursor-pointer">2 por Linha</button>
                                    <button type="button" id="btn-photo-layout-4" onclick="ReportBuilder.selectPhotoLayout('grid_4')" class="py-1.5 px-2 rounded-lg border text-xs font-semibold text-center bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer">Grade 2x2</button>
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
                                    <span>Incluir Relato Técnico / Observação na Íntegra</span>
                                </label>
                                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" id="cfg-photo-links" checked class="rounded text-primary focus:ring-0" />
                                    <span>Incluir Processos Oficiais & Hiperlinks</span>
                                </label>
                            </div>

                            <button type="button" onclick="ReportBuilder.insertAnalyticalPhotos1nBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                                <span class="material-symbols-outlined text-[16px]">photo_library</span> Inserir Laudo Analítico & Fotos na Folha
                            </button>
                        </div>
                    </div>
                `
            })}

            <!-- CARD 7: TABELA SINTÉTICA / LOTE (COM REORDENAÇÃO DE COLUNAS) -->
            ${renderAccordionCard({
                id: 'acc-table-syn',
                title: 'Tabela Sintética / Lote',
                icon: 'table_chart',
                badge: 'Reordenação de Colunas',
                content: `
                    <div class="flex flex-col gap-3">
                        <p class="text-[11px] text-slate-500">Listagem tabular compacta de múltiplos imóveis. Selecione e reordene as colunas exatamente como deseja na tabela:</p>
                        
                        <!-- Lista de seleção de colunas -->
                        <div class="max-h-40 overflow-y-auto space-y-1 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 custom-scrollbar text-xs">
                            ${fields.map(f => {
                                const isChecked = selectedSyntheticCols.includes(f.id);
                                return `
                                    <label class="flex items-center gap-2 p-1 rounded hover:bg-white dark:hover:bg-slate-800 cursor-pointer">
                                        <input type="checkbox" onchange="ReportBuilder.toggleSyntheticCol('${f.id}', this.checked)" ${isChecked ? 'checked' : ''} class="rounded text-primary focus:ring-0" />
                                        <span class="truncate flex-1">${f.label}</span>
                                    </label>
                                `;
                            }).join('')}
                        </div>

                        <!-- Ordem Atual das Colunas (com botões de subir/descer) -->
                        <div>
                            <span class="text-[10px] font-bold uppercase text-slate-500 block mb-1">Sequência das Colunas Selecionadas:</span>
                            <div id="syn-columns-order-list" class="flex flex-col gap-1 max-h-36 overflow-y-auto custom-scrollbar p-1.5 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                                ${renderSyntheticColumnsOrderList(fields)}
                            </div>
                        </div>

                        <button type="button" onclick="ReportBuilder.insertTableBlock('sintetica')" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">add_circle</span> Inserir Tabela Sintética na Folha
                        </button>
                    </div>
                `
            })}

            <!-- CARD 8: TABELA ANALÍTICA APROFUNDADA (NOVO CARD) -->
            ${renderAccordionCard({
                id: 'acc-table-ana',
                title: 'Tabela Analítica Aprofundada',
                icon: 'view_list',
                badge: 'Relatório Completo',
                content: `
                    <div class="flex flex-col gap-3">
                        <p class="text-[11px] text-slate-500">Quadro detalhado para auditoria fiscal e laudos territoriais, com quebras hierárquicas e descrições longas:</p>
                        
                        <div>
                            <label class="text-[10px] font-bold uppercase text-slate-500 block mb-1">Agrupamento Principal (Quebra de Seção)</label>
                            <select id="cfg-ana-group" class="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium">
                                <option value="Bairro">Agrupar por Bairro</option>
                                <option value="Setor">Agrupar por Setor Cadastral</option>
                                <option value="Logradouro">Agrupar por Logradouro / Rua</option>
                                <option value="Situação">Agrupar por Situação Cadastral</option>
                                <option value="nenhum">Sem Agrupamento (Corrido)</option>
                            </select>
                        </div>

                        <div class="space-y-1.5 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                            <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input type="checkbox" id="cfg-ana-subtotals" checked class="rounded text-primary focus:ring-0" />
                                <span>Calcular Subtotais por Grupo (Área e Imóveis)</span>
                            </label>
                            <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input type="checkbox" id="cfg-ana-desc" checked class="rounded text-primary focus:ring-0" />
                                <span>Incluir Descrição Textual Longa / Histórico</span>
                            </label>
                        </div>

                        <button type="button" onclick="ReportBuilder.insertAnalyticalTableBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">add_circle</span> Inserir Tabela Analítica na Folha
                        </button>
                    </div>
                `
            })}

            <!-- CARD: CAIXA DE TEXTO LIVRE COM FORMATAÇÃO E MENÇÕES @ -->
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

            <!-- CARD 9: PARECER TÉCNICO & RODAPÉ OFICIAL -->
            ${renderAccordionCard({
                id: 'acc-text-footer',
                title: 'Parecer Técnico & Rodapé Oficial',
                icon: 'verified',
                content: `
                    <div class="flex flex-col gap-3">
                        <div>
                            <label class="text-[10px] font-bold uppercase text-slate-500 block mb-1">Fundamentação Técnica / Parecer Jurídico</label>
                            <textarea id="cfg-text-notes" rows="3" class="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl" placeholder="Observações legais, normas da ABNT, legislação municipal e laudo do fiscal..."></textarea>
                        </div>
                        <button type="button" onclick="ReportBuilder.insertTextBlock()" class="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">subject</span> Inserir Parecer na Folha
                        </button>

                        <div class="space-y-1.5 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs mt-2">
                            <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input type="checkbox" id="cfg-ftr-pages" checked class="rounded text-primary focus:ring-0" />
                                <span>Numeração Oficial de Páginas (Página X de Y)</span>
                            </label>
                            <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input type="checkbox" id="cfg-ftr-hash" checked class="rounded text-primary focus:ring-0" />
                                <span>Código de Validação e Autenticidade (SHA-256)</span>
                            </label>
                            <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input type="checkbox" id="cfg-ftr-date" checked class="rounded text-primary focus:ring-0" />
                                <span>Carimbo Temporal com Data e Hora</span>
                            </label>
                        </div>

                        <button type="button" onclick="ReportBuilder.insertFooterBlock()" class="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 mt-1 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">vertical_align_bottom</span> Inserir Rodapé Oficial na Folha
                        </button>
                    </div>
                `
            })}
        `;
    }

    function renderSyntheticColumnsOrderList(fields) {
        if (!selectedSyntheticCols || selectedSyntheticCols.length === 0) {
            return '<div class="text-[11px] text-slate-400 p-2 text-center">Nenhuma coluna selecionada</div>';
        }
        return selectedSyntheticCols.map((colId, idx) => {
            const f = fields.find(item => item.id === colId);
            const label = f ? f.label : colId;
            return `
                <div class="flex items-center justify-between gap-1 p-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
                    <span class="font-bold truncate text-[11px] text-slate-700 dark:text-slate-200">${idx + 1}. ${label}</span>
                    <div class="flex items-center gap-0.5 shrink-0">
                        <button type="button" onclick="ReportBuilder.moveColumnOrder(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} class="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30 cursor-pointer" title="Subir">
                            <span class="material-symbols-outlined text-[14px]">arrow_upward</span>
                        </button>
                        <button type="button" onclick="ReportBuilder.moveColumnOrder(${idx}, 1)" ${idx === selectedSyntheticCols.length - 1 ? 'disabled' : ''} class="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30 cursor-pointer" title="Descer">
                            <span class="material-symbols-outlined text-[14px]">arrow_downward</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
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

        let html = '';
        currentTemplate.blocos.forEach((bloco, index) => {
            html += `
                <div class="report-block-item group relative transition-all print:border-none print:p-0 print:bg-transparent page-break-avoid" data-block-id="${bloco.id || index}">
                    <!-- Barra de Controle Flutuante no Hover (Oculta na Impressão Oficial) -->
                    <div class="absolute -top-3.5 right-2 hidden group-hover:flex items-center gap-1 bg-slate-900/90 text-white rounded-lg shadow-md px-1.5 py-0.5 z-30 select-none print:hidden backdrop-blur-xs">
                        <div class="flex items-center gap-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-white px-1 drag-handle" title="Arrastar Bloco">
                            <span class="material-symbols-outlined text-[15px]">drag_indicator</span>
                            <span class="text-[9px] font-mono uppercase">${getBlockTypeName(bloco.tipo)}</span>
                        </div>
                        <div class="h-3 w-px bg-slate-700 mx-0.5"></div>
                        <button type="button" onclick="ReportBuilder.moveBlock(${index}, -1)" class="p-0.5 hover:text-sky-300 cursor-pointer" title="Mover para cima">
                            <span class="material-symbols-outlined text-[15px]">arrow_upward</span>
                        </button>
                        <button type="button" onclick="ReportBuilder.moveBlock(${index}, 1)" class="p-0.5 hover:text-sky-300 cursor-pointer" title="Mover para baixo">
                            <span class="material-symbols-outlined text-[15px]">arrow_downward</span>
                        </button>
                        <button type="button" onclick="ReportBuilder.removeBlock(${index})" class="p-0.5 hover:text-red-400 cursor-pointer ml-1" title="Remover Bloco da Folha">
                            <span class="material-symbols-outlined text-[15px]">close</span>
                        </button>
                    </div>

                    <!-- Borda sutil de foco ao passar o mouse (apenas no editor, invisível no print) -->
                    <div class="absolute inset-0 border border-transparent group-hover:border-sky-400/40 rounded-lg pointer-events-none transition-colors print:hidden"></div>

                    <!-- Conteúdo Tipográfico Real do Bloco (Estilo Processador de Texto Word) -->
                    <div class="w-full relative z-10">
                        ${renderBlockContent(bloco, index, fields, charts)}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * Renderiza o conteúdo do bloco com suporte a Duplo-Clique Inline em todos os textos.
     */
    function renderBlockContent(bloco, index, fields, charts) {
        switch (bloco.tipo) {
            case 'cabecalho':
                return `
                    <div class="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-2">
                        <div class="flex items-center gap-4">
                            ${bloco.logo ? `
                                <div class="w-14 h-14 flex items-center justify-center shrink-0">
                                    ${bloco.logo_url && bloco.logo_url.startsWith('data:image') ? `
                                        <img src="${bloco.logo_url}" class="w-full h-full object-contain" />
                                    ` : `
                                        <span class="material-symbols-outlined text-slate-800 text-[42px]">account_balance</span>
                                    `}
                                </div>
                            ` : ''}
                            <div>
                                <div class="text-[11px] uppercase font-bold text-slate-600 tracking-wider cursor-text hover:bg-sky-50 px-1 py-0.5 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'subtitulo')" title="Duplo clique para editar">
                                    ${escapeHtml(bloco.subtitulo || 'Prefeitura Municipal')}
                                </div>
                                <div class="text-lg font-black uppercase text-slate-900 tracking-tight cursor-text hover:bg-sky-50 px-1 py-0.5 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')" title="Duplo clique para editar">
                                    ${escapeHtml(bloco.titulo || 'FICHA CADASTRAL DO IMÓVEL')}
                                </div>
                            </div>
                        </div>
                        <div class="text-right font-mono text-[10px] text-slate-500 shrink-0">
                            ${bloco.exibirDataHora ? `<div>Data: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</div>` : ''}
                            ${bloco.exibirProtocolo ? `<div class="font-bold text-slate-700">Protocolo: #${(bloco.id || '2026').slice(-6).toUpperCase()}</div>` : ''}
                        </div>
                    </div>
                `;

            case 'grade_campos': {
                const colCount = bloco.colunasLayout || 2;
                const sel = new Set(bloco.campos_selecionados || []);
                const flds = fields.filter(f => sel.has(f.id));

                if (colCount === 1) {
                    // Lista Corrida (Chave-Valor)
                    return `
                        <div class="mb-4">
                            <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2.5 flex items-center justify-between">
                                <span class="cursor-text hover:bg-sky-50 px-1 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${escapeHtml(bloco.titulo || 'Atributos Cadastrais')}</span>
                                <span class="text-[10px] font-mono text-slate-400 font-normal">Lista Corrida</span>
                            </div>
                            <div class="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                                ${flds.map(f => `
                                    <div class="flex items-center justify-between px-3 py-1.5 text-xs bg-white odd:bg-slate-50/50">
                                        <span class="font-bold text-slate-600">${f.label}:</span>
                                        <span class="font-semibold text-slate-900">[${f.label}]</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }

                return `
                    <div class="mb-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2.5 flex items-center justify-between">
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${escapeHtml(bloco.titulo || 'Atributos Cadastrais')}</span>
                            <span class="text-[10px] font-mono text-slate-400 font-normal">${colCount} Colunas</span>
                        </div>
                        <div class="grid ${colCount === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-2.5">
                            ${flds.map(f => `
                                <div class="p-2 border border-slate-200 rounded-lg bg-slate-50/50">
                                    <div class="text-[10px] uppercase font-bold text-slate-500">${f.label}</div>
                                    <div class="text-xs font-bold text-slate-800 mt-0.5 truncate">[Valor de ${f.label}]</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            case 'mapa_estatico':
                if (bloco.modo === 'temporal') {
                    // SÉRIE MULTITEMPORAL DE ORTOFOTOS HISTÓRICAS
                    return `
                        <div class="mb-4">
                            <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between">
                                <span class="cursor-text hover:bg-sky-50 px-1 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${escapeHtml(bloco.titulo || 'Análise Multitemporal de Ortofotos')}</span>
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
                                <div class="cursor-text hover:bg-sky-50 px-1 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'notaTecnica')">${escapeHtml(bloco.notaTecnica || 'Vetorização e cotas georreferenciadas')}</div>
                            </div>
                        </div>
                    `;
                }

                // MODO MAPA ESTÁTICO ATUAL
                return `
                    <div class="mb-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between">
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${escapeHtml(bloco.titulo || 'Delimitação Cartográfica do Imóvel')}</span>
                            <span class="text-[10px] font-mono text-slate-400">Escala ${bloco.escala || '1:2.500'}</span>
                        </div>
                        <div class="h-56 bg-slate-950 border border-slate-300 rounded-lg relative flex items-center justify-center overflow-hidden">
                            <!-- Polígono no mapa com cotas dos lados -->
                            <div class="w-36 h-28 border-2 border-emerald-400 bg-emerald-500/25 rounded relative flex items-center justify-center text-center shadow-lg">
                                <span class="text-xs font-bold text-white drop-shadow">
                                    Feição Georreferenciada<br>
                                    <span class="text-[10px] font-mono text-emerald-300">Área: 1.012,40 m²</span>
                                </span>
                                ${bloco.exibirCotas ? `
                                    <span class="absolute -top-3.5 text-[9px] font-mono text-emerald-300 bg-black/60 px-1 rounded">25.40 m</span>
                                    <span class="absolute -bottom-3.5 text-[9px] font-mono text-emerald-300 bg-black/60 px-1 rounded">25.10 m</span>
                                    <span class="absolute -left-6 top-1/2 -translate-y-1/2 text-[9px] font-mono text-emerald-300 bg-black/60 px-1 rounded">40.20 m</span>
                                    <span class="absolute -right-6 top-1/2 -translate-y-1/2 text-[9px] font-mono text-emerald-300 bg-black/60 px-1 rounded">39.80 m</span>
                                ` : ''}
                            </div>

                            <!-- Rosa dos Ventos (Norte) -->
                            ${bloco.exibirNorte ? `
                                <div class="absolute top-2.5 right-2.5 bg-black/60 p-1.5 rounded-lg flex flex-col items-center text-white text-[9px] font-bold">
                                    <span class="material-symbols-outlined text-[20px] text-amber-400">navigation</span>
                                    <span>N</span>
                                </div>
                            ` : ''}

                            <!-- Barra de Escala Gráfica e Datum -->
                            ${bloco.exibirEscala ? `
                                <div class="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-white text-[9px] font-mono flex items-center gap-2">
                                    <div class="w-16 h-1 bg-white border border-black"></div>
                                    <span>50 m</span>
                                    <span class="text-slate-400">|</span>
                                    <span>SIRGAS 2000 UTM Zone 25S</span>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Nota Técnica Editável -->
                        <div class="mt-1.5 text-[10px] text-slate-500 font-mono flex items-center justify-between px-1">
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'notaTecnica')">${escapeHtml(bloco.notaTecnica || 'Delimitação cadastral georreferenciada.')}</span>
                            <span>Precisão SIG</span>
                        </div>
                    </div>
                `;

            case 'grafico_existente': {
                const isSide = bloco.layout === 'lado_a_lado';
                return `
                    <div class="mb-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2.5 flex items-center justify-between">
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${escapeHtml(bloco.titulo || 'Estatísticas do Dashboard')}</span>
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
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${escapeHtml(bloco.titulo || 'Indicadores Territoriais (KPIs)')}</span>
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

            case 'tabela_sintetica_1n': {
                const cols = bloco.colunas || ['data', 'org', 'situacao_ocupacao', 'situacao_recuo', 'area_invadida', 'qtd_fotos'];
                const colLabelMap = {
                    'data': 'Data Vistoria',
                    'org': 'Órgão / Entidade',
                    'situacao_ocupacao': 'Situação Ocupação',
                    'situacao_recuo': 'Situação Recuo',
                    'area_invadida': 'Área Invadida',
                    'qtd_fotos': 'Fotos / Anexos'
                };
                return `
                    <div class="mb-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2.5 flex items-center justify-between">
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${escapeHtml(bloco.titulo || 'Quadro Sintético de Vistorias (1:N)')}</span>
                            <span class="text-[10px] font-mono text-slate-400">Histórico 1:N • ${cols.length} Colunas</span>
                        </div>
                        <div class="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                            <table class="w-full text-left text-[11px] border-collapse">
                                <thead>
                                    <tr class="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-700 uppercase">
                                        <th class="p-2 border-r border-slate-200 w-8 text-center">#</th>
                                        ${cols.map(c => `<th class="p-2 border-r last:border-r-0 border-slate-200">${colLabelMap[c] || c}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 bg-white">
                                    <tr class="hover:bg-slate-50">
                                        <td class="p-2 text-center text-slate-400 font-mono border-r border-slate-100">1</td>
                                        ${cols.map(c => {
                                            if (c === 'data') return `<td class="p-2 border-r last:border-r-0 border-slate-100 font-medium text-slate-900 font-mono">15/08/2026</td>`;
                                            if (c === 'org') return `<td class="p-2 border-r last:border-r-0 border-slate-100"><span class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[9px]">POLÍCIA FEDERAL</span></td>`;
                                            if (c === 'situacao_ocupacao') return `<td class="p-2 border-r last:border-r-0 border-slate-100"><span class="px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[9px]">Irregular</span></td>`;
                                            if (c === 'situacao_recuo') return `<td class="p-2 border-r last:border-r-0 border-slate-100"><span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[9px]">Não Recuou</span></td>`;
                                            if (c === 'area_invadida') return `<td class="p-2 border-r last:border-r-0 border-slate-100 font-mono font-bold text-right text-slate-800">120,50 m²</td>`;
                                            if (c === 'qtd_fotos') return `<td class="p-2 border-r last:border-r-0 border-slate-100 text-sky-600 font-semibold">📷 4 Fotos</td>`;
                                            return `<td class="p-2 border-r last:border-r-0 border-slate-100 text-slate-700">[${colLabelMap[c] || c}]</td>`;
                                        }).join('')}
                                    </tr>
                                    <tr class="hover:bg-slate-50 bg-slate-50/50">
                                        <td class="p-2 text-center text-slate-400 font-mono border-r border-slate-100">2</td>
                                        ${cols.map(c => {
                                            if (c === 'data') return `<td class="p-2 border-r last:border-r-0 border-slate-100 font-medium text-slate-900 font-mono">10/04/2026</td>`;
                                            if (c === 'org') return `<td class="p-2 border-r last:border-r-0 border-slate-100"><span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[9px]">SPU / PATRIMÔNIO</span></td>`;
                                            if (c === 'situacao_ocupacao') return `<td class="p-2 border-r last:border-r-0 border-slate-100"><span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[9px]">Pendente</span></td>`;
                                            if (c === 'situacao_recuo') return `<td class="p-2 border-r last:border-r-0 border-slate-100"><span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[9px]">Recuo Parcial</span></td>`;
                                            if (c === 'area_invadida') return `<td class="p-2 border-r last:border-r-0 border-slate-100 font-mono font-bold text-right text-slate-800">85,20 m²</td>`;
                                            if (c === 'qtd_fotos') return `<td class="p-2 border-r last:border-r-0 border-slate-100 text-sky-600 font-semibold">📷 2 Fotos</td>`;
                                            return `<td class="p-2 border-r last:border-r-0 border-slate-100 text-slate-700">[${colLabelMap[c] || c}]</td>`;
                                        }).join('')}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }

            case 'laudo_vistoria_fotos':
            case 'galeria_fotos': {
                const layout = bloco.layoutFotos || '2_cols';
                let gridClass = 'grid-cols-2';
                if (layout === '1_col') gridClass = 'grid-cols-1';
                if (layout === 'grid_4') gridClass = 'grid-cols-2 sm:grid-cols-4';
                const isSingleVistoria = bloco.escopo === 'ultima';

                return `
                    <div class="mb-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2.5 flex items-center justify-between">
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${escapeHtml(bloco.titulo || 'Vistoria Fotográfica & Anexos (1:N)')}</span>
                            <span class="text-[10px] font-mono text-slate-400">${isSingleVistoria ? 'Última Vistoria' : 'Todas as Vistorias'} • ${layout}</span>
                        </div>

                        <!-- Bloco Ilustrativo da Vistoria na Folha -->
                        <div class="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
                            <div class="flex items-center justify-between border-b border-slate-200 pb-1 text-xs">
                                <span class="font-bold text-slate-800 flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-[15px] text-primary">event_available</span>
                                    Vistoria Técnica • 15/08/2026 (Polícia Federal)
                                </span>
                                <span class="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">Irregular</span>
                            </div>

                            ${bloco.exibirObs ? `
                                <div class="text-[11px] text-slate-600 bg-white p-2 rounded border border-slate-200">
                                    <strong>Relato Técnico:</strong> Constatada intervenção irregular na faixa perimetral de marinha.
                                </div>
                            ` : ''}

                            ${bloco.exibirLinks ? `
                                <div class="flex items-center gap-2 text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-1 rounded border border-sky-200">
                                    <span class="material-symbols-outlined text-[13px]">attachment</span>
                                    <span>Processo IPL nº 0800653-88.2024.4.05.8200</span>
                                </div>
                            ` : ''}

                            <div class="grid ${gridClass} gap-2.5 pt-1">
                                ${[1, 2].map(num => `
                                    <div class="border border-slate-200 rounded-lg overflow-hidden bg-white flex flex-col shadow-2xs">
                                        <div class="h-28 bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-bold relative">
                                            <span class="material-symbols-outlined text-[28px] text-slate-300">photo_camera</span>
                                            <span class="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] font-mono px-1 rounded">Foto #${num}</span>
                                        </div>
                                        <div class="p-2 text-[10px] space-y-0.5 text-slate-600">
                                            ${bloco.exibirLegenda ? `<div class="font-bold text-slate-800 truncate">Fachada Principal / Acesso Lote #${num}</div>` : ''}
                                            ${bloco.exibirData ? `<div>Data: 15/08/2026 10:45</div>` : ''}
                                            ${bloco.exibirCoords ? `<div class="font-mono text-[9px] text-slate-500">GPS: -7.023450, -34.845120</div>` : ''}
                                            ${bloco.exibirResp ? `<div>Fiscal: Agente Federal</div>` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
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
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${escapeHtml(bloco.titulo || 'Quadro Sintético de Imóveis')}</span>
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
                            <span class="cursor-text hover:bg-sky-50 px-1 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${escapeHtml(bloco.titulo || 'Quadro Analítico Aprofundado')}</span>
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
                    <div class="mb-4 caixa-texto-livre-block page-break-avoid" data-block-index="${index}">
                        ${bloco.titulo ? `
                            <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-1.5 flex items-center justify-between">
                                <span class="cursor-text hover:bg-sky-50 px-1 rounded" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${escapeHtml(bloco.titulo)}</span>
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
                return `
                    <div class="border-t border-slate-300 pt-2 mt-4 text-[10px] text-slate-500 flex items-center justify-between font-mono">
                        <div>
                            ${bloco.exibirDataHora ? `Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}` : ''}
                            ${bloco.exibirHash ? `<span class="ml-2 font-bold text-slate-600">SHA-256: 7f83b1657ff1...</span>` : ''}
                        </div>
                        <div class="font-bold text-slate-700">
                            ${bloco.numeracao ? 'Página 1 de 1' : ''}
                        </div>
                    </div>
                `;

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
        element.classList.add('ring-2', 'ring-primary', 'ring-offset-1', 'rounded-xs', 'bg-primary/5');

        function onBlur() {
            element.contentEditable = "false";
            element.classList.remove('ring-2', 'ring-primary', 'ring-offset-1', 'rounded-xs', 'bg-primary/5');
            const newValue = element.innerText.trim();
            updateBlockProperty(blockIndex, propertyPath, newValue);
            element.removeEventListener('blur', onBlur);
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

    // --- MANIPULADORES DO CARD 0: FOLHA A4 ---
    function updateOrientation(orient) {
        if (!currentTemplate || !currentTemplate.config_pagina) return;
        currentTemplate.config_pagina.orientacao = orient;
        applyA4StageDimensions();
        const formId = currentTemplate.form_id;
        const panel = document.getElementById('accordion-blocks-panel');
        if (panel && formId) panel.innerHTML = renderAccordionPanel(formId);
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

        currentTemplate.blocos.unshift({
            id: 'blk_hdr_' + Date.now(),
            tipo: 'cabecalho',
            titulo: titulo,
            subtitulo: subtitulo,
            logo: logo,
            logo_url: window._customUploadedLogoUrl || null,
            exibirDataHora: dataHora,
            exibirProtocolo: protocolo
        });

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
            colunasLayout: selectedGridCols
        });

        renderA4Blocks();
    }

    // --- MANIPULADORES DO CARD 3: MINI-MAPA ---
    let currentMapMode = 'atual';
    function selectMapMode(mode) {
        currentMapMode = mode;
        const btnCurrent = document.getElementById('btn-map-mode-current');
        const btnTemp = document.getElementById('btn-map-mode-temporal');
        const optTemp = document.getElementById('cfg-map-temporal-options');

        if (mode === 'temporal') {
            if (btnTemp) btnTemp.className = 'p-2 rounded-xl border text-xs font-bold text-center transition-all bg-primary text-white border-primary shadow-xs cursor-pointer';
            if (btnCurrent) btnCurrent.className = 'p-2 rounded-xl border text-xs font-bold text-center transition-all bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer';
            if (optTemp) optTemp.classList.remove('hidden');
        } else {
            if (btnCurrent) btnCurrent.className = 'p-2 rounded-xl border text-xs font-bold text-center transition-all bg-primary text-white border-primary shadow-xs cursor-pointer';
            if (btnTemp) btnTemp.className = 'p-2 rounded-xl border text-xs font-bold text-center transition-all bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer';
            if (optTemp) optTemp.classList.add('hidden');
        }
    }

    function insertMapBlock() {
        const cotas = document.getElementById('cfg-map-cotas')?.checked ?? true;
        const area = document.getElementById('cfg-map-area')?.checked ?? true;
        const norte = document.getElementById('cfg-map-norte')?.checked ?? true;
        const escala = document.getElementById('cfg-map-escala')?.checked ?? true;
        const nota = document.getElementById('cfg-map-note')?.value || 'Delimitação cadastral georreferenciada.';

        currentTemplate.blocos.push({
            id: 'blk_map_' + Date.now(),
            tipo: 'mapa_estatico',
            titulo: currentMapMode === 'temporal' ? 'Análise Multitemporal de Ortofotos' : 'Delimitação Cartográfica do Imóvel',
            modo: currentMapMode,
            exibirCotas: cotas,
            exibirArea: area,
            exibirNorte: norte,
            exibirEscala: escala,
            notaTecnica: nota,
            escala: '1:2.500'
        });

        renderA4Blocks();
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
    function insertKpiBlock() {
        currentTemplate.blocos.push({
            id: 'blk_kpi_' + Date.now(),
            tipo: 'kpis',
            titulo: 'Indicadores Territoriais (KPIs)',
            metricas: ['count', 'area_avg', 'area_sum', 'regularidade']
        });
        renderA4Blocks();
    }

    // --- MANIPULADORES DO CARD 6: VISTORIA FOTOGRÁFICA & ANEXOS 1:N ---
    let selectedPhotoLayout = '2_cols';
    let selected1nScope = 'todas';
    let selected1nSourceTab = 'consolidado';

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

    function insertSynthetic1nBlock() {
        const sourceTabId = document.getElementById('cfg-1n-source-tab')?.value || selected1nSourceTab || 'consolidado';
        const checkedCols = Array.from(document.querySelectorAll("input[name='cfg-1n-syn-col']:checked")).map(cb => cb.value);

        currentTemplate.blocos.push({
            id: 'blk_syn1n_' + Date.now(),
            tipo: 'tabela_sintetica_1n',
            titulo: 'Quadro Sintético de Vistorias (Histórico 1:N)',
            sourceTabId: sourceTabId,
            colunas: checkedCols.length > 0 ? checkedCols : ['data', 'org', 'situacao_ocupacao', 'situacao_recuo', 'area_invadida', 'qtd_fotos']
        });

        renderA4Blocks();
    }

    function insertAnalyticalPhotos1nBlock() {
        const sourceTabId = document.getElementById('cfg-1n-source-tab')?.value || selected1nSourceTab || 'consolidado';
        const legenda = document.getElementById('cfg-photo-legend')?.checked ?? true;
        const data = document.getElementById('cfg-photo-date')?.checked ?? true;
        const coords = document.getElementById('cfg-photo-coords')?.checked ?? true;
        const resp = document.getElementById('cfg-photo-resp')?.checked ?? true;
        const obs = document.getElementById('cfg-photo-obs')?.checked ?? true;
        const links = document.getElementById('cfg-photo-links')?.checked ?? true;

        currentTemplate.blocos.push({
            id: 'blk_ana1n_' + Date.now(),
            tipo: 'galeria_fotos',
            titulo: 'Vistoria Fotográfica & Anexos (1:N)',
            sourceTabId: sourceTabId,
            escopo: selected1nScope || 'todas',
            layoutFotos: selectedPhotoLayout,
            exibirLegenda: legenda,
            exibirData: data,
            exibirCoords: coords,
            exibirResp: resp,
            exibirObs: obs,
            exibirLinks: links
        });

        renderA4Blocks();
    }

    // Alias para compatibilidade
    const insertPhotoBlock = insertAnalyticalPhotos1nBlock;

    // --- MANIPULADORES DO CARD 7: TABELA SINTÉTICA COM REORDENAÇÃO ---
    function toggleSyntheticCol(colId, checked) {
        if (checked) {
            if (!selectedSyntheticCols.includes(colId)) selectedSyntheticCols.push(colId);
        } else {
            selectedSyntheticCols = selectedSyntheticCols.filter(c => c !== colId);
        }
        const fields = window.ReportAdapter.getFormFields(currentTemplate.form_id);
        const orderList = document.getElementById('syn-columns-order-list');
        if (orderList) orderList.innerHTML = renderSyntheticColumnsOrderList(fields);
    }

    function moveColumnOrder(index, direction) {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= selectedSyntheticCols.length) return;
        const item = selectedSyntheticCols.splice(index, 1)[0];
        selectedSyntheticCols.splice(targetIndex, 0, item);
        const fields = window.ReportAdapter.getFormFields(currentTemplate.form_id);
        const orderList = document.getElementById('syn-columns-order-list');
        if (orderList) orderList.innerHTML = renderSyntheticColumnsOrderList(fields);
    }

    function insertTableBlock(tipo = 'sintetica') {
        const fields = window.ReportAdapter.getFormFields(currentTemplate.form_id);
        const cols = (selectedSyntheticCols && selectedSyntheticCols.length > 0) ? selectedSyntheticCols : fields.slice(0, 5).map(f => f.id);

        currentTemplate.blocos.push({
            id: 'blk_tbl_' + Date.now(),
            tipo: 'tabela_sintetica',
            titulo: 'Quadro Sintético de Imóveis',
            colunas: cols
        });

        renderA4Blocks();
    }

    // --- MANIPULADORES DO CARD 8: TABELA ANALÍTICA APROFUNDADA ---
    function insertAnalyticalTableBlock() {
        const grupo = document.getElementById('cfg-ana-group')?.value || 'Bairro';
        const subtotais = document.getElementById('cfg-ana-subtotals')?.checked ?? true;
        const desc = document.getElementById('cfg-ana-desc')?.checked ?? true;

        currentTemplate.blocos.push({
            id: 'blk_ana_' + Date.now(),
            tipo: 'tabela_analitica',
            titulo: 'Quadro Analítico Aprofundado',
            grupo: grupo,
            exibirSubtotais: subtotais,
            exibirDescricaoLonga: desc
        });

        renderA4Blocks();
    }

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
        document.execCommand(command, false, value);
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
        if (dropdown) dropdown.classList.add('hidden');
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

        // Insere o token formatado com a indicação visual da aba
        const displayTag = tabTitle ? `@${fieldLabel} (${tabTitle})` : `@${fieldLabel}`;
        const tokenHtml = `<span class="mention-tag inline-block bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200 px-1.5 py-0.5 rounded font-mono text-[11px] font-bold select-all align-middle" data-field-id="${fieldId}" data-field-name="${fieldName}" data-tab-title="${tabTitle}" contenteditable="false" title="Campo: ${fieldLabel} • Aba: ${tabTitle}">${displayTag}</span>&nbsp;`;
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
        const date = document.getElementById('cfg-ftr-date')?.checked ?? true;

        currentTemplate.blocos.push({
            id: 'blk_ftr_' + Date.now(),
            tipo: 'rodape',
            numeracao: pages,
            exibirHash: hash,
            exibirDataHora: date
        });

        renderA4Blocks();
    }

    // --- CONTROLE GERAL DO TEMPLATE ---
    function removeBlock(index) {
        if (!currentTemplate || !currentTemplate.blocos) return;
        currentTemplate.blocos.splice(index, 1);
        renderA4Blocks();
    }

    function moveBlock(index, direction) {
        if (!currentTemplate || !currentTemplate.blocos) return;
        const target = index + direction;
        if (target < 0 || target >= currentTemplate.blocos.length) return;
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

    function switchType(tipo) {
        if (!currentTemplate) return;
        currentTemplate.tipo = tipo;
        renderBuilderInterface(currentTemplate.form_id, currentTemplate.nome);
    }

    function onTemplateChange(selectedVal) {
        const formId = currentTemplate ? currentTemplate.form_id : null;
        if (!formId) return;

        if (selectedVal === '__new__') {
            currentTemplate = window.ReportAdapter.createDefaultTemplate(formId, 'individual', 'Novo Modelo');
        } else {
            const templates = window.ReportAdapter.getReportTemplates(formId);
            const found = templates.find(t => t.id === selectedVal);
            if (found) currentTemplate = JSON.parse(JSON.stringify(found));
        }
        ensureTemplateDefaults();
        renderBuilderInterface(formId, currentTemplate.nome);
    }

    function saveCurrentTemplate(showAlert = true) {
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
        initReportBuilderTab(currentTemplate.form_id);
    }

    /**
     * Imprime ou Gera PDF da folha atual.
     */
    function printReport() {
        const stage = document.getElementById('a4-sheet-stage');
        if (!stage) return;

        const orient = (currentTemplate && currentTemplate.config_pagina) ? currentTemplate.config_pagina.orientacao : 'portrait';
        const mm = (currentTemplate && currentTemplate.config_pagina && currentTemplate.config_pagina.margens_mm) || { top: 15, bottom: 15, left: 15, right: 15 };

        const printWin = window.open('', '_blank', 'width=950,height=1000');
        if (!printWin) {
            alert('Permita popups no navegador para visualizar a impressão A4.');
            return;
        }

        const styles = `
            <style>
                @page { size: A4 ${orient}; margin: ${mm.top}mm ${mm.right}mm ${mm.bottom}mm ${mm.left}mm; }
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
                    <title>${escapeHtml(currentTemplate.nome)}</title>
                    ${styles}
                </head>
                <body>
                    <div style="width: 100%; max-width: ${orient === 'landscape' ? '1050px' : '794px'}; margin: 0 auto;">
                        ${stage.innerHTML}
                    </div>
                    <script>setTimeout(() => { window.print(); }, 600);</script>
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
                const sel = new Set(b.campos_selecionados || []);
                const flds = fields.filter(f => sel.has(f.id));
                bodyHtml += `
                    <div style="margin-bottom:16px; border:1px solid #cbd5e1; border-radius:8px; padding:12px;">
                        <div style="font-size:12px; font-weight:bold; text-transform:uppercase; margin-bottom:10px; color:#0f2942;">${escapeHtml(b.titulo || 'Dados Cadastrais')}</div>
                        <div style="display:grid; grid-template-columns:${b.colunasLayout === 3 ? 'repeat(3, 1fr)' : (b.colunasLayout === 1 ? '1fr' : 'repeat(2, 1fr)')}; gap:8px;">
                            ${flds.map(f => {
                                const val = featureData[f.name] || featureData[f.id] || featureData[f.label] || '—';
                                return `
                                    <div style="padding:6px 8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px;">
                                        <div style="font-size:10px; font-weight:bold; color:#64748b; text-transform:uppercase;">${f.label}</div>
                                        <div style="font-size:12px; font-weight:bold; color:#1e293b; margin-top:2px;">${val}</div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
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
        const payload = {
            templateId: templateId,
            formId: currentTemplate ? currentTemplate.form_id : (featureData ? (featureData.formId || featureData.themeId) : null),
            featureData: featureData || {},
            featureGeometry: featureGeometry || null,
            timestamp: Date.now()
        };
        try {
            sessionStorage.setItem('constructive_active_report_payload', JSON.stringify(payload));
            localStorage.setItem('constructive_active_report_payload', JSON.stringify(payload));
        } catch(e) {
            console.error('[ReportBuilder] Erro ao salvar payload do relatório:', e);
        }
        window.open(`relatorio_view.html?templateId=${encodeURIComponent(templateId)}`, '_blank');
    }
    window.openFeatureReportPage = openFeatureReportPage;

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Exportação Global
    window.ReportBuilder = {
        initReportBuilderTab,
        toggleAccordion,
        updateOrientation,
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
        toggleSyntheticCol,
        moveColumnOrder,
        handleLogoUpload,
        insertHeaderBlock,
        insertGridBlock,
        insertMapBlock,
        insertChartBlock,
        insertKpiBlock,
        selectPhotoLayout,
        select1nScope,
        on1nSourceTabChange,
        insertPhotoBlock,
        insertSynthetic1nBlock,
        insertAnalyticalPhotos1nBlock,
        insertTableBlock,
        insertAnalyticalTableBlock,
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
        enableInlineEdit,
        updateBlockProperty,
        removeBlock,
        moveBlock,
        toggleDisponibilizarMapa,
        updateTemplateName,
        switchType,
        onTemplateChange,
        saveCurrentTemplate,
        deleteCurrentTemplate,
        printReport,
        generateIndividualReport,
        openFeatureReportPage
    };

})();
