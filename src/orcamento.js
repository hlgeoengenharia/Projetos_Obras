// src/orcamento.js
// MÓDULO DE ENGENHARIA DE CUSTOS E ORÇAMENTO DE OBRAS PÚBLICAS ("GeoOrçamento")
// Integrado com SINAPI (Caixa Econômica Federal) & Padrão SICO / SEMOB

(function() {
    'use strict';

    // Estado Global do Módulo
    window.GeoOrcamento = {
        catalogoSinapi: [],
        analiticoSinapi: null,
        catalogoCarregado: false,
        baseAtiva: 'PB_2026_07',
        basesDisponiveis: [],
        orcamentoAtual: null,
        activeFeature: null,
        activeTab: 'resumo'
    };

    // Inicialização ao carregar
    async function initOrcamento() {
        try {
            const resp = await fetch('data/sinapi/bases_disponiveis.json');
            if (resp.ok) {
                window.GeoOrcamento.basesDisponiveis = await resp.json();
            }
        } catch (e) {
            console.warn('[GeoOrcamento] Erro ao carregar bases disponíveis:', e);
        }
    }
    initOrcamento();

    // Carregar catálogo de preços do SINAPI
    window.carregarCatalogoSinapi = async function(baseKey = 'PB_2026_07') {
        if (window.GeoOrcamento.catalogoCarregado && window.GeoOrcamento.baseAtiva === baseKey) {
            return window.GeoOrcamento.catalogoSinapi;
        }

        const loader = document.getElementById('orcamento-loading-indicator');
        if (loader) loader.classList.remove('hidden');

        try {
            const resp = await fetch('data/sinapi/catalogo_pb_2026_07.json');
            if (resp.ok) {
                window.GeoOrcamento.catalogoSinapi = await resp.json();
                window.GeoOrcamento.catalogoCarregado = true;
                window.GeoOrcamento.baseAtiva = baseKey;
                console.log(`[GeoOrcamento] ${window.GeoOrcamento.catalogoSinapi.length} itens do SINAPI carregados na memória.`);
            }
        } catch (err) {
            console.error('[GeoOrcamento] Erro ao carregar catálogo SINAPI:', err);
        } finally {
            if (loader) loader.classList.add('hidden');
        }
        return window.GeoOrcamento.catalogoSinapi;
    };

    // FÓRMULA OFICIAL DE BDI DO TCU (Acórdão 2.622/2013)
    // BDI = [ ( (1 + AC + S + R + G) * (1 + DF) * (1 + L) ) / (1 - I) ] - 1
    window.calcularBdiTcu = function(config) {
        const AC = (parseFloat(config.ac) || 0) / 100;
        const S  = (parseFloat(config.s)  || 0) / 100;
        const R  = (parseFloat(config.r)  || 0) / 100;
        const G  = (parseFloat(config.g)  || 0) / 100;
        const DF = (parseFloat(config.df) || 0) / 100;
        const L  = (parseFloat(config.l)  || 0) / 100;
        
        // Impostos
        const pis = (parseFloat(config.pis) || 0) / 100;
        const cofins = (parseFloat(config.cofins) || 0) / 100;
        const iss = (parseFloat(config.iss) || 0) / 100;
        const cprb = (parseFloat(config.cprb) || 0) / 100;
        const I = pis + cofins + iss + cprb;

        if (I >= 1) return 0;

        const numerador = (1 + AC + S + R + G) * (1 + DF) * (1 + L);
        const denominador = 1 - I;
        const bdi = (numerador / denominador) - 1;
        return Math.max(0, bdi);
    };

    // Configuração Padrão do BDI (Modelo SEMOB Cabedelo / TCU)
    function getDefaultBdiConfig() {
        return {
            tipoObra: 'Edificação',
            ac: 3.00,       // Administração Central
            s: 0.40,        // Seguro
            g: 0.40,        // Garantia (S+G = 0.80)
            r: 0.97,        // Risco
            df: 0.59,       // Despesas Financeiras
            l: 6.16,        // Lucro
            pis: 0.65,      // PIS
            cofins: 3.00,   // COFINS
            iss: 4.00,      // ISS Municipal
            cprb: 2.70      // CPRB (Desoneração gradual Lei 14.973/2024)
        };
    }

    // Criar Novo Orçamento Vazio vinculado à Feição
    function criarNovoOrcamento(featureLayer) {
        const props = (featureLayer && featureLayer.feature && featureLayer.feature.properties) || {};
        const bdiConfig = getDefaultBdiConfig();
        const bdiPercentual = window.calcularBdiTcu(bdiConfig);

        return {
            id: 'orc_' + Date.now(),
            featureId: props.id_banco || props.id || ('feat_' + Date.now()),
            nomeObra: props['Nome da Obra'] || props['Nome'] || props['Descricao'] || props['Descrição'] || 'Nova Obra Pública',
            local: props['Local'] || props['Localização'] || props['Endereco'] || props['Endereço'] || 'Cabedelo - PB',
            responsavelTecnico: props['Responsável'] || 'Engenharia Municipal',
            artNumero: '',
            dataBaseSinapi: '07/2026',
            uf: 'PB',
            regimeDesoneracao: 'DESONERADO', // 'DESONERADO' ou 'NAO_DESONERADO'
            bdiConfig: bdiConfig,
            bdiPercentual: bdiPercentual, // decimal ex: 0.248
            prazoMeses: 6,
            etapas: [
                {
                    id: 'etp_1',
                    codigo: '1.0',
                    nome: 'SERVIÇOS PRELIMINARES',
                    itens: []
                },
                {
                    id: 'etp_2',
                    codigo: '2.0',
                    nome: 'ESTRUTURAS E FUNDAÇÕES',
                    itens: []
                },
                {
                    id: 'etp_3',
                    codigo: '3.0',
                    nome: 'PAVIMENTAÇÃO E ACABAMENTOS',
                    itens: []
                }
            ],
            cronograma: {
                meses: 6,
                distribuicao: {} // { 'etp_1': [0.5, 0.2, 0.1, 0.1, 0.1, 0.0], ... }
            }
        };
    }

    // Abertura do Modal de Orçamento
    window.openOrcamentoModal = async function(featureLayer) {
        if (!featureLayer || !featureLayer.feature) {
            alert('Selecione uma feição de obra no mapa para abrir o orçamento.');
            return;
        }

        window.GeoOrcamento.activeFeature = featureLayer;
        const props = featureLayer.feature.properties || {};
        
        // Tentar carregar orçamento existente salvo na feição ou no storage local
        let orc = null;
        if (props.orcamento_dados) {
            try {
                orc = typeof props.orcamento_dados === 'string' ? JSON.parse(props.orcamento_dados) : props.orcamento_dados;
            } catch (e) {
                console.warn('Erro ao restaurar orcamento_dados:', e);
            }
        }
        
        if (!orc) {
            const key = 'geogestor_orcamento_' + (props.id_banco || props.id || 'default');
            const saved = localStorage.getItem(key);
            if (saved) {
                try { orc = JSON.parse(saved); } catch(e){}
            }
        }

        if (!orc) {
            orc = criarNovoOrcamento(featureLayer);
        }

        window.GeoOrcamento.orcamentoAtual = orc;
        window.GeoOrcamento.activeTab = 'planilha'; // Abre direto na planilha de custos

        // Abre o modal
        const modal = document.getElementById('orcamento-modal');
        if (modal) modal.classList.remove('hidden');

        // Pré-carrega o catálogo do SINAPI em background
        window.carregarCatalogoSinapi();

        // Renderiza a interface
        renderOrcamentoModal();
    };

    window.closeOrcamentoModal = function() {
        const modal = document.getElementById('orcamento-modal');
        if (modal) modal.classList.add('hidden');
    };

    // Alternador de Abas do Orçamento
    window.setOrcamentoTab = function(tabName) {
        window.GeoOrcamento.activeTab = tabName;
        renderOrcamentoModal();
    };

    // Recalcular totais da planilha
    function calcularTotais(orc) {
        const bdi = orc.bdiPercentual || 0;
        let totalSemBdi = 0;
        let totalComBdi = 0;

        orc.etapas.forEach(etp => {
            let etpSemBdi = 0;
            let etpComBdi = 0;

            etp.itens.forEach(it => {
                const q = parseFloat(it.quantidade) || 0;
                const pSem = parseFloat(it.precoUnitarioSemBdi) || 0;
                const pCom = pSem * (1 + bdi);
                const tot = q * pCom;

                it.precoUnitarioComBdi = Math.round(pCom * 100) / 100;
                it.precoTotal = Math.round(tot * 100) / 100;

                etpSemBdi += q * pSem;
                etpComBdi += tot;
            });

            etp.totalSemBdi = Math.round(etpSemBdi * 100) / 100;
            etp.totalComBdi = Math.round(etpComBdi * 100) / 100;

            totalSemBdi += etpSemBdi;
            totalComBdi += etpComBdi;
        });

        orc.valorTotalSemBdi = Math.round(totalSemBdi * 100) / 100;
        orc.valorTotalComBdi = Math.round(totalComBdi * 100) / 100;

        // Calcular percentual de cada item
        orc.etapas.forEach(etp => {
            etp.itens.forEach(it => {
                it.percentualObra = totalComBdi > 0 ? ((it.precoTotal / totalComBdi) * 100) : 0;
            });
        });

        return orc;
    }

    // RENDERIZAÇÃO COMPLETA DO MODAL
    function renderOrcamentoModal() {
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!orc) return;

        calcularTotais(orc);

        const titleEl = document.getElementById('orcamento-modal-title');
        const subtitleEl = document.getElementById('orcamento-modal-subtitle');
        const badgeTotalEl = document.getElementById('orcamento-modal-total-badge');
        const container = document.getElementById('orcamento-modal-body');

        if (titleEl) titleEl.textContent = orc.nomeObra || 'Orçamento de Obra';
        if (subtitleEl) subtitleEl.textContent = `${orc.local} • Data-Base SINAPI: ${orc.dataBaseSinapi} • Regime: ${orc.regimeDesoneracao === 'DESONERADO' ? 'Com Desoneração' : 'Sem Desoneração'}`;
        if (badgeTotalEl) {
            badgeTotalEl.innerHTML = `
                <span class="text-xs uppercase font-semibold text-slate-400">Total com BDI (${(orc.bdiPercentual * 100).toFixed(2)}%):</span>
                <span class="text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400">R$ ${orc.valorTotalComBdi.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            `;
        }

        // Atualiza botões das abas
        ['resumo', 'planilha', 'cronograma', 'curva_abc'].forEach(tab => {
            const btn = document.getElementById(`orc-tab-btn-${tab}`);
            if (btn) {
                if (window.GeoOrcamento.activeTab === tab) {
                    btn.className = 'px-4 py-2 text-xs font-bold border-b-2 border-primary text-primary dark:text-sky-400 flex items-center gap-1.5 transition-all';
                } else {
                    btn.className = 'px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1.5 transition-all';
                }
            }
        });

        if (!container) return;

        switch (window.GeoOrcamento.activeTab) {
            case 'resumo':
                container.innerHTML = renderAbaResumo(orc);
                break;
            case 'planilha':
                container.innerHTML = renderAbaPlanilha(orc);
                break;
            case 'cronograma':
                container.innerHTML = renderAbaCronograma(orc);
                break;
            case 'curva_abc':
                container.innerHTML = renderAbaCurvaAbc(orc);
                break;
            default:
                container.innerHTML = renderAbaPlanilha(orc);
        }
    }

    // ==========================================
    // ABA 1: RESUMO & MEMÓRIA DE CÁLCULO DO BDI
    // ==========================================
    function renderAbaResumo(orc) {
        const b = orc.bdiConfig || getDefaultBdiConfig();
        const bdiCalc = window.calcularBdiTcu(b);

        return `
        <div class="space-y-6 max-w-5xl mx-auto py-2">
            <!-- Dados da Obra -->
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary text-[18px]">info</span>
                    Identificação da Obra & Parâmetros Orçamentários
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="text-[11px] font-bold text-slate-500 uppercase">Nome da Obra</label>
                        <input type="text" id="orc-input-nome" value="${orc.nomeObra}" onchange="atualizarParametroObra('nomeObra', this.value)" class="w-full mt-1 text-xs px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    </div>
                    <div>
                        <label class="text-[11px] font-bold text-slate-500 uppercase">Local da Obra</label>
                        <input type="text" id="orc-input-local" value="${orc.local}" onchange="atualizarParametroObra('local', this.value)" class="w-full mt-1 text-xs px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    </div>
                    <div>
                        <label class="text-[11px] font-bold text-slate-500 uppercase">Responsável Técnico (Engenheiro/Arquiteto)</label>
                        <input type="text" id="orc-input-resp" value="${orc.responsavelTecnico || ''}" onchange="atualizarParametroObra('responsavelTecnico', this.value)" placeholder="Nome do Responsável / CREA" class="w-full mt-1 text-xs px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-[11px] font-bold text-slate-500 uppercase">Tabela SINAPI (Mês/Ano)</label>
                            <select onchange="atualizarParametroObra('dataBaseSinapi', this.value)" class="w-full mt-1 text-xs px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                <option value="07/2026" ${orc.dataBaseSinapi === '07/2026' ? 'selected' : ''}>07/2026 - PB (Oficial Caixa)</option>
                                <option value="06/2026" ${orc.dataBaseSinapi === '06/2026' ? 'selected' : ''}>06/2026 - PB</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-[11px] font-bold text-slate-500 uppercase">Regime de Encargos</label>
                            <select onchange="atualizarParametroObra('regimeDesoneracao', this.value)" class="w-full mt-1 text-xs px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold">
                                <option value="DESONERADO" ${orc.regimeDesoneracao === 'DESONERADO' ? 'selected' : ''}>Com Desoneração (CPRB)</option>
                                <option value="NAO_DESONERADO" ${orc.regimeDesoneracao === 'NAO_DESONERADO' ? 'selected' : ''}>Sem Desoneração</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Calculadora Analítica de BDI (TCU) -->
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
                            <span class="material-symbols-outlined text-amber-500 text-[18px]">calculate</span>
                            Memória de Cálculo do BDI (Acórdão TCU nº 2.622/2013)
                        </h3>
                        <p class="text-[11px] text-slate-400">Parâmetros aplicados sobre os custos diretos para formação do preço de venda</p>
                    </div>
                    <div class="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-4 py-1.5 rounded-xl flex items-center gap-2">
                        <span class="text-xs text-amber-800 dark:text-amber-300 font-bold uppercase">BDI Calculado:</span>
                        <span id="bdi-result-badge" class="text-base font-extrabold text-amber-600 dark:text-amber-400">${(bdiCalc * 100).toFixed(2)}%</span>
                    </div>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    <div class="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                        <label class="text-[10px] font-bold text-slate-400 uppercase block truncate">Adm. Central (AC)</label>
                        <div class="flex items-center gap-1 mt-1">
                            <input type="number" step="0.01" value="${b.ac}" onchange="atualizarBdiItem('ac', this.value)" class="w-full text-xs font-bold bg-white dark:bg-slate-900 px-2 py-1.5 border rounded-lg">
                            <span class="text-xs text-slate-400">%</span>
                        </div>
                    </div>
                    <div class="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                        <label class="text-[10px] font-bold text-slate-400 uppercase block truncate">Seguro (S)</label>
                        <div class="flex items-center gap-1 mt-1">
                            <input type="number" step="0.01" value="${b.s}" onchange="atualizarBdiItem('s', this.value)" class="w-full text-xs font-bold bg-white dark:bg-slate-900 px-2 py-1.5 border rounded-lg">
                            <span class="text-xs text-slate-400">%</span>
                        </div>
                    </div>
                    <div class="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                        <label class="text-[10px] font-bold text-slate-400 uppercase block truncate">Garantia (G)</label>
                        <div class="flex items-center gap-1 mt-1">
                            <input type="number" step="0.01" value="${b.g}" onchange="atualizarBdiItem('g', this.value)" class="w-full text-xs font-bold bg-white dark:bg-slate-900 px-2 py-1.5 border rounded-lg">
                            <span class="text-xs text-slate-400">%</span>
                        </div>
                    </div>
                    <div class="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                        <label class="text-[10px] font-bold text-slate-400 uppercase block truncate">Risco (R)</label>
                        <div class="flex items-center gap-1 mt-1">
                            <input type="number" step="0.01" value="${b.r}" onchange="atualizarBdiItem('r', this.value)" class="w-full text-xs font-bold bg-white dark:bg-slate-900 px-2 py-1.5 border rounded-lg">
                            <span class="text-xs text-slate-400">%</span>
                        </div>
                    </div>
                    <div class="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                        <label class="text-[10px] font-bold text-slate-400 uppercase block truncate">Desp. Financ. (DF)</label>
                        <div class="flex items-center gap-1 mt-1">
                            <input type="number" step="0.01" value="${b.df}" onchange="atualizarBdiItem('df', this.value)" class="w-full text-xs font-bold bg-white dark:bg-slate-900 px-2 py-1.5 border rounded-lg">
                            <span class="text-xs text-slate-400">%</span>
                        </div>
                    </div>
                    <div class="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                        <label class="text-[10px] font-bold text-slate-400 uppercase block truncate">Lucro (L)</label>
                        <div class="flex items-center gap-1 mt-1">
                            <input type="number" step="0.01" value="${b.l}" onchange="atualizarBdiItem('l', this.value)" class="w-full text-xs font-bold bg-white dark:bg-slate-900 px-2 py-1.5 border rounded-lg">
                            <span class="text-xs text-slate-400">%</span>
                        </div>
                    </div>
                </div>

                <!-- Tributos -->
                <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <h4 class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Tributos Incidentes (I)</h4>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg">
                            <span class="text-xs text-slate-600 dark:text-slate-300">PIS:</span>
                            <div class="flex items-center gap-1 w-20">
                                <input type="number" step="0.01" value="${b.pis}" onchange="atualizarBdiItem('pis', this.value)" class="w-full text-xs font-bold bg-white dark:bg-slate-900 px-1.5 py-1 border rounded">
                                <span class="text-xs text-slate-400">%</span>
                            </div>
                        </div>
                        <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg">
                            <span class="text-xs text-slate-600 dark:text-slate-300">COFINS:</span>
                            <div class="flex items-center gap-1 w-20">
                                <input type="number" step="0.01" value="${b.cofins}" onchange="atualizarBdiItem('cofins', this.value)" class="w-full text-xs font-bold bg-white dark:bg-slate-900 px-1.5 py-1 border rounded">
                                <span class="text-xs text-slate-400">%</span>
                            </div>
                        </div>
                        <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg">
                            <span class="text-xs text-slate-600 dark:text-slate-300">ISS Cabedelo:</span>
                            <div class="flex items-center gap-1 w-20">
                                <input type="number" step="0.01" value="${b.iss}" onchange="atualizarBdiItem('iss', this.value)" class="w-full text-xs font-bold bg-white dark:bg-slate-900 px-1.5 py-1 border rounded">
                                <span class="text-xs text-slate-400">%</span>
                            </div>
                        </div>
                        <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg">
                            <span class="text-xs text-slate-600 dark:text-slate-300">CPRB:</span>
                            <div class="flex items-center gap-1 w-20">
                                <input type="number" step="0.01" value="${b.cprb}" onchange="atualizarBdiItem('cprb', this.value)" class="w-full text-xs font-bold bg-white dark:bg-slate-900 px-1.5 py-1 border rounded">
                                <span class="text-xs text-slate-400">%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    // ==========================================
    // ABA 2: PLANILHA ORÇAMENTÁRIA (PADRÃO SICO)
    // ==========================================
    function renderAbaPlanilha(orc) {
        let etapasHtml = '';

        orc.etapas.forEach((etp, etpIdx) => {
            let itensHtml = '';
            
            if (etp.itens && etp.itens.length > 0) {
                etp.itens.forEach((it, itIdx) => {
                    itensHtml += `
                    <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 text-xs transition-colors">
                        <td class="py-2.5 px-3 font-semibold text-slate-500 w-12 text-center">${it.itemNum || (etp.codigo + '.' + (itIdx + 1))}</td>
                        <td class="py-2.5 px-3 text-slate-400 font-mono w-24">
                            <span class="px-1.5 py-0.5 rounded text-[10px] ${it.fonte === 'PRÓPRIO' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'} font-bold">
                                ${it.codigo || 'SINAPI'}
                            </span>
                        </td>
                        <td class="py-2.5 px-3 text-slate-800 dark:text-slate-200 min-w-[280px]">
                            <div class="font-medium">${it.descricao}</div>
                        </td>
                        <td class="py-2.5 px-3 text-center text-slate-500 font-bold uppercase w-16">${it.unidade || 'UN'}</td>
                        <td class="py-2.5 px-3 w-28 text-right">
                            <input type="number" step="any" min="0" value="${it.quantidade}" onchange="atualizarItemQuantidade('${etp.id}', '${it.id}', this.value)" class="w-full text-right font-bold text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-primary">
                        </td>
                        <td class="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400 font-mono w-28">
                            R$ ${(it.precoUnitarioSemBdi || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td class="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200 font-mono font-semibold w-28">
                            R$ ${(it.precoUnitarioComBdi || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td class="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-slate-100 font-mono w-32">
                            R$ ${(it.precoTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td class="py-2.5 px-2 text-center w-12">
                            <button onclick="removerItemEtapa('${etp.id}', '${it.id}')" class="p-1 hover:text-rose-500 text-slate-300 transition-colors" title="Excluir Item">
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        </td>
                    </tr>
                    `;
                });
            } else {
                itensHtml = `
                <tr>
                    <td colspan="9" class="py-4 text-center text-xs text-slate-400 italic">Nenhum serviço adicionado nesta etapa ainda. Use a busca abaixo para incluir itens do SINAPI.</td>
                </tr>
                `;
            }

            etapasHtml += `
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs mb-5">
                <!-- Cabeçalho da Etapa -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                    <div class="flex items-center gap-3">
                        <span class="w-7 h-7 rounded-lg bg-primary text-white font-bold text-xs flex items-center justify-center shrink-0">${etp.codigo}</span>
                        <input type="text" value="${etp.nome}" onchange="atualizarNomeEtapa('${etp.id}', this.value)" class="bg-transparent font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100 border-none focus:ring-1 focus:ring-primary rounded px-2 py-0.5">
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-xs text-slate-500 font-semibold">Subtotal Etapa:</span>
                        <span class="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-200 font-mono">
                            R$ ${(etp.totalComBdi || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <button onclick="removerEtapa('${etp.id}')" class="text-slate-400 hover:text-rose-500 p-1 transition-colors" title="Excluir Etapa Completa">
                            <span class="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                    </div>
                </div>

                <!-- Tabela de Itens -->
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/40 dark:bg-slate-900/40">
                                <th class="py-2 px-3 text-center">Item</th>
                                <th class="py-2 px-3">Código</th>
                                <th class="py-2 px-3">Descrição dos Serviços</th>
                                <th class="py-2 px-3 text-center">Und</th>
                                <th class="py-2 px-3 text-right">Quant.</th>
                                <th class="py-2 px-3 text-right">Unit. s/ BDI</th>
                                <th class="py-2 px-3 text-right">Unit. c/ BDI</th>
                                <th class="py-2 px-3 text-right">Total (R$)</th>
                                <th class="py-2 px-2 text-center"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itensHtml}
                        </tbody>
                    </table>
                </div>

                <!-- Rodapé de Inserção Rápida de Serviços SINAPI -->
                <div class="p-3 bg-slate-50/40 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-2">
                    <div class="relative flex-1 min-w-[260px]">
                        <span class="absolute left-3 top-2.5 text-slate-400 material-symbols-outlined text-[16px]">search</span>
                        <input type="text" id="input-search-sinapi-${etp.id}" placeholder="Buscar serviço ou insumo SINAPI (código ou nome, ex: 104658, podotatil, eucalipto, tubo)..." oninput="buscarSinapiAutocomplete('${etp.id}', this.value)" class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-primary">
                        <!-- Dropdown Autocomplete flutuante -->
                        <div id="autocomplete-results-${etp.id}" class="hidden absolute left-0 top-full mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 divide-y divide-slate-100 dark:divide-slate-800"></div>
                    </div>
                    <button onclick="adicionarItemProprio('${etp.id}')" class="px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all">
                        <span class="material-symbols-outlined text-[16px]">add_circle</span>
                        + Composição Própria (CPU)
                    </button>
                </div>
            </div>
            `;
        });

        return `
        <div class="space-y-4">
            <!-- Barra Superior de Ações da Planilha -->
            <div class="flex flex-wrap items-center justify-between gap-3 pb-2">
                <div class="flex items-center gap-2">
                    <button onclick="adicionarNovaEtapa()" class="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer transition-all">
                        <span class="material-symbols-outlined text-[18px]">add_box</span>
                        Adicionar Nova Macroetapa
                    </button>
                    <button onclick="exportarPlanilhaExcel()" class="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all">
                        <span class="material-symbols-outlined text-emerald-600 text-[18px]">table_view</span>
                        Exportar Excel (.XLSX)
                    </button>
                </div>

                <div class="text-right">
                    <span class="text-xs text-slate-400">Total Direto s/ BDI: </span>
                    <span class="text-xs font-bold font-mono text-slate-700 dark:text-slate-300 mr-3">R$ ${orc.valorTotalSemBdi.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span class="text-xs text-slate-400">Total c/ BDI: </span>
                    <span class="text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400">R$ ${orc.valorTotalComBdi.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
            </div>

            <!-- Lista de Etapas e Itens -->
            ${etapasHtml}
        </div>
        `;
    }

    // ==========================================
    // ABA 3: CRONOGRAMA FÍSICO-FINANCEIRO
    // ==========================================
    function renderAbaCronograma(orc) {
        const meses = orc.prazoMeses || 6;
        let thMeses = '';
        for (let m = 1; m <= meses; m++) {
            thMeses += `<th class="py-2.5 px-3 text-center border-l border-slate-200 dark:border-slate-800 w-28">Mês ${m}</th>`;
        }

        let linhasEtapas = '';
        const totaisMes = new Array(meses).fill(0);

        orc.etapas.forEach(etp => {
            const percList = (orc.cronograma && orc.cronograma.distribuicao && orc.cronograma.distribuicao[etp.id]) || new Array(meses).fill(0);
            
            let cellsFisico = '';
            let somaPerc = 0;

            for (let m = 0; m < meses; m++) {
                const valPerc = (percList[m] || 0);
                somaPerc += valPerc;
                const valorMes = (etp.totalComBdi * valPerc) / 100;
                totaisMes[m] += valorMes;

                cellsFisico += `
                <td class="py-2 px-2 text-center border-l border-slate-100 dark:border-slate-800">
                    <div class="flex items-center justify-center gap-1">
                        <input type="number" step="1" min="0" max="100" value="${valPerc}" onchange="atualizarPercentualCronograma('${etp.id}', ${m}, this.value)" class="w-16 text-center text-xs font-bold py-1 border rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                        <span class="text-[10px] text-slate-400">%</span>
                    </div>
                    <div class="text-[10px] font-mono text-slate-400 mt-0.5">
                        R$ ${valorMes.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                </td>
                `;
            }

            const alertColor = Math.abs(somaPerc - 100) < 0.01 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 font-bold';

            linhasEtapas += `
            <tr class="border-b border-slate-100 dark:border-slate-800 text-xs">
                <td class="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                    ${etp.codigo} ${etp.nome}
                    <div class="text-[11px] text-slate-400 font-mono">R$ ${etp.totalComBdi.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                </td>
                <td class="py-3 px-2 text-center font-bold ${alertColor}">
                    ${somaPerc.toFixed(1)}%
                </td>
                ${cellsFisico}
            </tr>
            `;
        });

        // Linha de Desembolso Financeiro Mensal e Acumulado
        let cellsFinanceiro = '';
        let cellsAcumulado = '';
        let acum = 0;
        const totalGeral = orc.valorTotalComBdi || 1;

        for (let m = 0; m < meses; m++) {
            const v = totaisMes[m];
            acum += v;
            const pMes = (v / totalGeral) * 100;
            const pAcum = (acum / totalGeral) * 100;

            cellsFinanceiro += `
            <td class="py-2.5 px-2 text-center border-l border-slate-200 dark:border-slate-800 font-mono">
                <div class="font-bold text-xs text-slate-800 dark:text-slate-100">R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                <div class="text-[10px] text-slate-400">${pMes.toFixed(1)}%</div>
            </td>
            `;

            cellsAcumulado += `
            <td class="py-2.5 px-2 text-center border-l border-slate-200 dark:border-slate-800 font-mono">
                <div class="font-extrabold text-xs text-emerald-600 dark:text-emerald-400">R$ ${acum.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                <div class="text-[10px] font-bold text-slate-500">${pAcum.toFixed(1)}%</div>
            </td>
            `;
        }

        return `
        <div class="space-y-4">
            <div class="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div>
                    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">Cronograma de Execução Físico-Financeira</h3>
                    <p class="text-xs text-slate-400">Distribua os percentuais de avanço físico de cada etapa ao longo dos meses.</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold text-slate-500">Prazo Previsto:</span>
                    <select onchange="atualizarPrazoCronograma(this.value)" class="text-xs font-bold border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-1.5">
                        <option value="3" ${meses === 3 ? 'selected' : ''}>3 Meses (90 Dias)</option>
                        <option value="6" ${meses === 6 ? 'selected' : ''}>6 Meses (180 Dias)</option>
                        <option value="12" ${meses === 12 ? 'selected' : ''}>12 Meses (360 Dias)</option>
                    </select>
                </div>
            </div>

            <div class="overflow-x-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/40">
                            <th class="py-3 px-3 min-w-[200px]">Discriminação das Etapas</th>
                            <th class="py-3 px-2 text-center w-20">Total %</th>
                            ${thMeses}
                        </tr>
                    </thead>
                    <tbody>
                        ${linhasEtapas}
                        <!-- Total Parcial Mês -->
                        <tr class="bg-slate-50/80 dark:bg-slate-800/40 border-t-2 border-slate-200 dark:border-slate-700 text-xs font-bold">
                            <td class="py-3 px-3 text-slate-700 dark:text-slate-300 uppercase">Desembolso Mensal</td>
                            <td class="py-3 px-2 text-center font-extrabold text-primary">100%</td>
                            ${cellsFinanceiro}
                        </tr>
                        <!-- Acumulado -->
                        <tr class="bg-slate-100/60 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 text-xs font-bold">
                            <td class="py-3 px-3 text-emerald-700 dark:text-emerald-400 uppercase">Desembolso Acumulado</td>
                            <td class="py-3 px-2 text-center text-slate-400">-</td>
                            ${cellsAcumulado}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        `;
    }

    // ==========================================
    // ABA 4: CURVA ABC DE SERVIÇOS
    // ==========================================
    function renderAbaCurvaAbc(orc) {
        // Coletar todos os itens e ordenar por precoTotal decrescente
        let todosItens = [];
        orc.etapas.forEach(etp => {
            etp.itens.forEach(it => {
                todosItens.push({
                    codigo: it.codigo,
                    descricao: it.descricao,
                    unidade: it.unidade,
                    quantidade: it.quantidade,
                    precoUnitarioComBdi: it.precoUnitarioComBdi,
                    precoTotal: it.precoTotal || 0,
                    etapa: etp.codigo
                });
            });
        });

        todosItens.sort((a, b) => b.precoTotal - a.precoTotal);

        const totalGeral = orc.valorTotalComBdi || 1;
        let acumulado = 0;
        let totalA = 0, totalB = 0, totalC = 0;
        let countA = 0, countB = 0, countC = 0;

        let rowsHtml = '';
        todosItens.forEach((it, idx) => {
            acumulado += it.precoTotal;
            const percIndividual = (it.precoTotal / totalGeral) * 100;
            const percAcumulado = (acumulado / totalGeral) * 100;

            let classe = 'C';
            let badgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

            if (percAcumulado <= 80 || (idx === 0 && percAcumulado > 80)) {
                classe = 'A';
                badgeClass = 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300';
                totalA += it.precoTotal;
                countA++;
            } else if (percAcumulado <= 95) {
                classe = 'B';
                badgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300';
                totalB += it.precoTotal;
                countB++;
            } else {
                classe = 'C';
                badgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300';
                totalC += it.precoTotal;
                countC++;
            }

            rowsHtml += `
            <tr class="border-b border-slate-100 dark:border-slate-800 text-xs hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                <td class="py-2.5 px-3 text-center font-bold">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${badgeClass}">${classe}</span>
                </td>
                <td class="py-2.5 px-3 text-center text-slate-400 font-mono">${idx + 1}</td>
                <td class="py-2.5 px-3 font-mono text-slate-500">${it.codigo}</td>
                <td class="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-medium">${it.descricao}</td>
                <td class="py-2.5 px-3 text-center font-bold text-slate-500 uppercase">${it.unidade}</td>
                <td class="py-2.5 px-3 text-right font-mono">${parseFloat(it.quantidade || 0).toLocaleString('pt-BR')}</td>
                <td class="py-2.5 px-3 text-right font-mono">R$ ${(it.precoUnitarioComBdi || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">R$ ${it.precoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td class="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">${percIndividual.toFixed(2)}%</td>
                <td class="py-2.5 px-3 text-right font-mono font-extrabold text-primary dark:text-sky-400">${percAcumulado.toFixed(2)}%</td>
            </tr>
            `;
        });

        if (todosItens.length === 0) {
            rowsHtml = `<tr><td colspan="10" class="py-6 text-center text-xs text-slate-400 italic">Insira serviços na planilha orçamentária para gerar a Curva ABC.</td></tr>`;
        }

        return `
        <div class="space-y-4">
            <!-- Cards de Resumo ABC -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl p-4">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-bold uppercase text-rose-700 dark:text-rose-300">Faixa A (Crítica - 80%)</span>
                        <span class="w-6 h-6 rounded-full bg-rose-600 text-white font-extrabold text-xs flex items-center justify-center">A</span>
                    </div>
                    <div class="text-lg font-black text-rose-800 dark:text-rose-200 font-mono">R$ ${totalA.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <div class="text-[11px] text-slate-500 mt-1">${countA} serviços (${((totalA / totalGeral) * 100).toFixed(1)}% do orçamento)</div>
                </div>

                <div class="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-4">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-bold uppercase text-amber-700 dark:text-amber-300">Faixa B (Intermediária - 15%)</span>
                        <span class="w-6 h-6 rounded-full bg-amber-500 text-white font-extrabold text-xs flex items-center justify-center">B</span>
                    </div>
                    <div class="text-lg font-black text-amber-800 dark:text-amber-200 font-mono">R$ ${totalB.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <div class="text-[11px] text-slate-500 mt-1">${countB} serviços (${((totalB / totalGeral) * 100).toFixed(1)}% do orçamento)</div>
                </div>

                <div class="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-2xl p-4">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">Faixa C (Complementar - 5%)</span>
                        <span class="w-6 h-6 rounded-full bg-emerald-600 text-white font-extrabold text-xs flex items-center justify-center">C</span>
                    </div>
                    <div class="text-lg font-black text-emerald-800 dark:text-emerald-200 font-mono">R$ ${totalC.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <div class="text-[11px] text-slate-500 mt-1">${countC} serviços (${((totalC / totalGeral) * 100).toFixed(1)}% do orçamento)</div>
                </div>
            </div>

            <!-- Tabela Curva ABC -->
            <div class="overflow-x-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/40">
                            <th class="py-3 px-3 text-center">Faixa</th>
                            <th class="py-3 px-3 text-center">Pos.</th>
                            <th class="py-3 px-3">Código</th>
                            <th class="py-3 px-3">Descrição do Serviço</th>
                            <th class="py-3 px-3 text-center">Und</th>
                            <th class="py-3 px-3 text-right">Quant.</th>
                            <th class="py-3 px-3 text-right">Unit. c/ BDI</th>
                            <th class="py-3 px-3 text-right">Preço Total (R$)</th>
                            <th class="py-3 px-3 text-right">% Indiv.</th>
                            <th class="py-3 px-3 text-right">% Acum.</th>
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

    // ==========================================
    // INTERAÇÕES & EVENT HANDLERS
    // ==========================================

    window.atualizarParametroObra = function(chave, valor) {
        if (!window.GeoOrcamento.orcamentoAtual) return;
        window.GeoOrcamento.orcamentoAtual[chave] = valor;
        salvarOrcamentoLocalmente();
    };

    window.atualizarBdiItem = function(chave, valor) {
        if (!window.GeoOrcamento.orcamentoAtual) return;
        window.GeoOrcamento.orcamentoAtual.bdiConfig[chave] = parseFloat(valor) || 0;
        window.GeoOrcamento.orcamentoAtual.bdiPercentual = window.calcularBdiTcu(window.GeoOrcamento.orcamentoAtual.bdiConfig);
        
        salvarOrcamentoLocalmente();
        renderOrcamentoModal();
    };

    window.adicionarNovaEtapa = function() {
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!orc) return;
        const num = orc.etapas.length + 1;
        orc.etapas.push({
            id: 'etp_' + Date.now(),
            codigo: `${num}.0`,
            nome: `NOVA MACROETAPA ${num}`,
            itens: []
        });
        salvarOrcamentoLocalmente();
        renderOrcamentoModal();
    };

    window.atualizarNomeEtapa = function(etapaId, nome) {
        const orc = window.GeoOrcamento.orcamentoAtual;
        const etp = orc.etapas.find(e => e.id === etapaId);
        if (etp) {
            etp.nome = nome.toUpperCase();
            salvarOrcamentoLocalmente();
        }
    };

    window.removerEtapa = function(etapaId) {
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!confirm('Deseja realmente remover esta macroetapa e todos os seus itens?')) return;
        orc.etapas = orc.etapas.filter(e => e.id !== etapaId);
        salvarOrcamentoLocalmente();
        renderOrcamentoModal();
    };

    window.atualizarItemQuantidade = function(etapaId, itemId, quant) {
        const orc = window.GeoOrcamento.orcamentoAtual;
        const etp = orc.etapas.find(e => e.id === etapaId);
        if (etp) {
            const it = etp.itens.find(i => i.id === itemId);
            if (it) {
                it.quantidade = parseFloat(quant) || 0;
                salvarOrcamentoLocalmente();
                renderOrcamentoModal();
            }
        }
    };

    window.removerItemEtapa = function(etapaId, itemId) {
        const orc = window.GeoOrcamento.orcamentoAtual;
        const etp = orc.etapas.find(e => e.id === etapaId);
        if (etp) {
            etp.itens = etp.itens.filter(i => i.id !== itemId);
            salvarOrcamentoLocalmente();
            renderOrcamentoModal();
        }
    };

    window.adicionarItemProprio = function(etapaId) {
        const desc = prompt('Descrição da Composição Própria do Município (CPU):', 'SERVIÇO ESPECÍFICO LOCAL');
        if (!desc) return;
        const und = prompt('Unidade de Medida (m², m³, un, m, kg):', 'UN') || 'UN';
        const preco = prompt('Preço Unitário Estimado s/ BDI (R$):', '100.00');

        const orc = window.GeoOrcamento.orcamentoAtual;
        const etp = orc.etapas.find(e => e.id === etapaId);
        if (etp) {
            etp.itens.push({
                id: 'it_' + Date.now(),
                itemNum: `${etp.codigo}.${etp.itens.length + 1}`,
                fonte: 'PRÓPRIO',
                codigo: 'CPU.' + (etp.itens.length + 1),
                descricao: desc.toUpperCase(),
                unidade: und.toUpperCase(),
                quantidade: 1,
                precoUnitarioSemBdi: parseFloat(preco) || 0
            });
            salvarOrcamentoLocalmente();
            renderOrcamentoModal();
        }
    };

    // Autocomplete SINAPI em tempo real
    window.buscarSinapiAutocomplete = async function(etapaId, query) {
        const dropdown = document.getElementById(`autocomplete-results-${etapaId}`);
        if (!dropdown) return;

        if (!query || query.trim().length < 2) {
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
            return;
        }

        const catalogo = await window.carregarCatalogoSinapi();
        if (!catalogo || catalogo.length === 0) return;

        const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const matches = [];

        for (let i = 0; i < catalogo.length; i++) {
            const item = catalogo[i];
            const descNorm = (item.descricao || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const cod = (item.codigo || '');

            if (cod.startsWith(q) || descNorm.includes(q)) {
                matches.push(item);
                if (matches.length >= 15) break; // Mostra até 15 resultados rápidos
            }
        }

        if (matches.length === 0) {
            dropdown.innerHTML = '<div class="p-3 text-xs text-slate-400 italic">Nenhum item SINAPI encontrado.</div>';
            dropdown.classList.remove('hidden');
            return;
        }

        const isDeson = (window.GeoOrcamento.orcamentoAtual.regimeDesoneracao === 'DESONERADO');

        let html = '';
        matches.forEach(m => {
            const p = isDeson ? m.preco_desonerado : m.preco_nao_desonerado;
            html += `
            <div onclick="selecionarItemSinapi('${etapaId}', '${m.codigo}')" class="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-start justify-between gap-3 text-xs transition-colors">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5">
                        <span class="font-mono font-bold text-sky-600 dark:text-sky-400">${m.codigo}</span>
                        <span class="text-[10px] font-bold px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase">${m.tipo}</span>
                        <span class="text-[10px] font-semibold text-slate-400 uppercase">${m.unidade}</span>
                    </div>
                    <div class="text-slate-700 dark:text-slate-300 font-medium truncate">${m.descricao}</div>
                </div>
                <div class="text-right shrink-0">
                    <span class="font-mono font-bold text-slate-900 dark:text-slate-100">R$ ${(p || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
            </div>
            `;
        });

        dropdown.innerHTML = html;
        dropdown.classList.remove('hidden');
    };

    window.selecionarItemSinapi = function(etapaId, codigo) {
        const catalogo = window.GeoOrcamento.catalogoSinapi || [];
        const item = catalogo.find(x => String(x.codigo) === String(codigo));
        if (!item) return;

        const orc = window.GeoOrcamento.orcamentoAtual;
        const etp = orc.etapas.find(e => e.id === etapaId);
        if (!etp) return;

        const isDeson = (orc.regimeDesoneracao === 'DESONERADO');
        const precoUnit = isDeson ? item.preco_desonerado : item.preco_nao_desonerado;

        etp.itens.push({
            id: 'it_' + Date.now(),
            itemNum: `${etp.codigo}.${etp.itens.length + 1}`,
            fonte: 'SINAPI',
            codigo: item.codigo,
            descricao: item.descricao,
            unidade: item.unidade,
            quantidade: 1,
            precoUnitarioSemBdi: precoUnit || 0
        });

        salvarOrcamentoLocalmente();
        renderOrcamentoModal();
    };

    window.atualizarPercentualCronograma = function(etapaId, mesIdx, val) {
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!orc.cronograma) orc.cronograma = { meses: orc.prazoMeses || 6, distribuicao: {} };
        if (!orc.cronograma.distribuicao) orc.cronograma.distribuicao = {};
        if (!orc.cronograma.distribuicao[etapaId]) {
            orc.cronograma.distribuicao[etapaId] = new Array(orc.prazoMeses || 6).fill(0);
        }

        orc.cronograma.distribuicao[etapaId][mesIdx] = parseFloat(val) || 0;
        salvarOrcamentoLocalmente();
        renderOrcamentoModal();
    };

    window.atualizarPrazoCronograma = function(meses) {
        const orc = window.GeoOrcamento.orcamentoAtual;
        orc.prazoMeses = parseInt(meses, 10);
        salvarOrcamentoLocalmente();
        renderOrcamentoModal();
    };

    // Salvar no storage local e associar à feição ativa no mapa
    function salvarOrcamentoLocalmente() {
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!orc) return;

        calcularTotais(orc);

        // Salvar no storage com chave vinculada
        const key = 'geogestor_orcamento_' + orc.featureId;
        localStorage.setItem(key, JSON.stringify(orc));

        // Atualizar propriedades da feição se existir
        if (window.GeoOrcamento.activeFeature && window.GeoOrcamento.activeFeature.feature) {
            const props = window.GeoOrcamento.activeFeature.feature.properties || {};
            props.orcamento_dados = JSON.stringify(orc);
            props['Valor Total da Obra (R$)'] = orc.valorTotalComBdi.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            props['BDI (%)'] = (orc.bdiPercentual * 100).toFixed(2) + '%';
            props['Data Base SINAPI'] = orc.dataBaseSinapi;

            // Se a função de salvar feição existir no main.js, dispara
            if (typeof window.saveFeatureToDatabase === 'function') {
                window.saveFeatureToDatabase(window.GeoOrcamento.activeFeature).catch(console.warn);
            }
        }
    }
    window.salvarOrcamentoLocalmente = salvarOrcamentoLocalmente;

    // Exportação para Excel (CSV compatível / HTML Table)
    window.exportarPlanilhaExcel = function() {
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!orc) return;

        let csv = '\uFEFF'; // BOM para abrir com acentuação perfeita no Excel
        csv += `PREFEITURA MUNICIPAL DE CABEDELO - PLANILHA ORÇAMENTÁRIA OFICIAL\n`;
        csv += `OBRA:;${orc.nomeObra}\n`;
        csv += `LOCAL:;${orc.local}\n`;
        csv += `DATA-BASE:;${orc.dataBaseSinapi};REGIME:;${orc.regimeDesoneracao};BDI (%):;${(orc.bdiPercentual * 100).toFixed(2)}%\n\n`;
        csv += `ITEM;CÓDIGO;DESCRIÇÃO DOS SERVIÇOS;UND;QUANT.;PREÇO UNIT. S/ BDI;PREÇO UNIT. C/ BDI;PREÇO TOTAL (R$);% TOTAL\n`;

        orc.etapas.forEach(etp => {
            csv += `"${etp.codigo}";"";"${etp.nome}";"";"";"";"";"${etp.totalComBdi.toFixed(2).replace('.', ',')}";""\n`;
            etp.itens.forEach(it => {
                csv += `"${it.itemNum}";"${it.codigo}";"${it.descricao.replace(/"/g, '""')}";"${it.unidade}";"${String(it.quantidade).replace('.', ',')}";"${it.precoUnitarioSemBdi.toFixed(2).replace('.', ',')}";"${it.precoUnitarioComBdi.toFixed(2).replace('.', ',')}";"${it.precoTotal.toFixed(2).replace('.', ',')}";"${it.percentualObra.toFixed(2).replace('.', ',')}%\n`;
            });
        });

        csv += `\n;;TOTAL GERAL DA OBRA (R$);;;;;"${orc.valorTotalComBdi.toFixed(2).replace('.', ',')}";"100%"\n`;

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `ORCAMENTO_${orc.nomeObra.replace(/\s+/g, '_')}_${orc.dataBaseSinapi.replace('/', '_')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

})();
