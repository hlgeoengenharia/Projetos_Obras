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
        baseAtiva: localStorage.getItem('sinapi_active_base') || 'PB_2026_07',
        basesDisponiveis: [],
        orcamentoAtual: null,
        activeFeature: null,
        activeTab: 'planilha'
    };

    // Inicialização ao carregar
    async function initOrcamento() {
        try {
            let bases = [];
            const resp = await fetch('data/sinapi/bases_disponiveis.json');
            if (resp.ok) {
                bases = await resp.json();
            }
            // Mescla com bases personalizadas importadas pelo usuário em home.html
            try {
                const customBases = JSON.parse(localStorage.getItem('sinapi_custom_bases') || '[]');
                customBases.forEach(cb => {
                    if (!bases.some(b => b.chave_referencia === cb.chave_referencia)) {
                        bases.push(cb);
                    }
                });
            } catch(e) {}
            window.GeoOrcamento.basesDisponiveis = bases;
            const savedActive = localStorage.getItem('sinapi_active_base');
            if (savedActive) window.GeoOrcamento.baseAtiva = savedActive;
        } catch (e) {
            console.warn('[GeoOrcamento] Erro ao carregar bases disponíveis:', e);
        }
    }
    initOrcamento();

    // Carregar catálogo de preços do SINAPI com suporte à UF da obra (Multi-Estado Nacional)
    window.carregarCatalogoSinapi = async function(param = null) {
        let uf = (window.GeoOrcamento.orcamentoAtual && window.GeoOrcamento.orcamentoAtual.uf) ? window.GeoOrcamento.orcamentoAtual.uf.toUpperCase() : 'PB';
        let mes = '2026_07';

        if (typeof param === 'string' && param.length === 2) {
            uf = param.toUpperCase();
        } else if (typeof param === 'string' && param.includes('_')) {
            const parts = param.split('_');
            if (parts[0].length === 2) uf = parts[0].toUpperCase();
        }

        const baseKey = `${uf}_${mes}`;

        if (window.GeoOrcamento.catalogoCarregado && window.GeoOrcamento.baseAtiva === baseKey && window.GeoOrcamento.catalogoSinapi.length > 0) {
            return window.GeoOrcamento.catalogoSinapi;
        }

        const loader = document.getElementById('orcamento-loading-indicator');
        if (loader) loader.classList.remove('hidden');

        try {
            let jsonFile = `data/sinapi/catalogo_${uf.toLowerCase()}_${mes}.json`;
            const resp = await fetch(jsonFile);
            if (resp.ok) {
                window.GeoOrcamento.catalogoSinapi = await resp.json();
                window.GeoOrcamento.catalogoCarregado = true;
                window.GeoOrcamento.baseAtiva = baseKey;
                console.log(`[GeoOrcamento] ${window.GeoOrcamento.catalogoSinapi.length} itens do SINAPI carregados para ${uf} (${mes}).`);
            } else {
                console.warn(`[GeoOrcamento] Catálogo para ${uf} não encontrado em ${jsonFile}. Usando base PB como referência.`);
                const fallbackResp = await fetch('data/sinapi/catalogo_pb_2026_07.json');
                if (fallbackResp.ok) {
                    window.GeoOrcamento.catalogoSinapi = await fallbackResp.json();
                    window.GeoOrcamento.catalogoCarregado = true;
                    window.GeoOrcamento.baseAtiva = 'PB_2026_07';
                }
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

        let ufDetectada = (props['UF'] || props['Estado'] || '').toUpperCase().trim();
        if (!ufDetectada || ufDetectada.length !== 2) {
            const localStr = (props['Local'] || props['Localização'] || props['Endereco'] || props['Endereço'] || '').toUpperCase();
            const ufsList = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
            for (const u of ufsList) {
                if (localStr.includes(`- ${u}`) || localStr.includes(`/${u}`) || localStr.endsWith(` ${u}`)) {
                    ufDetectada = u;
                    break;
                }
            }
        }
        if (!ufDetectada) ufDetectada = 'PB';

        return {
            id: 'orc_' + Date.now(),
            featureId: props.id_banco || props.id || ('feat_' + Date.now()),
            nomeObra: props['Nome da Obra'] || props['Nome'] || props['Descricao'] || props['Descrição'] || 'Nova Obra Pública',
            local: props['Local'] || props['Localização'] || props['Endereco'] || props['Endereço'] || 'Cabedelo - PB',
            responsavelTecnico: props['Responsável'] || 'Engenharia Municipal',
            artNumero: '',
            dataBaseSinapi: '07/2026',
            uf: ufDetectada,
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
            },
            cpus: obterBancoCpusLocal()
        };
    }

    // Abertura do Modal de Orçamento
    // Sincroniza o valor total com BDI e os metadados do orçamento com o card da feição no mapa
    function sincronizarCardOrcamento(orc) {
        if (!orc) return;
        const valFormatado = (orc.valorTotalComBdi || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const bdiStr = ((orc.bdiPercentual || 0) * 100).toFixed(2).replace('.', ',');

        const cardValorEl = document.getElementById('card-orcamento-valor-total');
        if (cardValorEl) {
            cardValorEl.textContent = `R$ ${valFormatado}`;
        }

        const cardBdiEl = document.getElementById('card-orcamento-bdi-tag');
        if (cardBdiEl) {
            cardBdiEl.textContent = `Total com BDI (${bdiStr}%)`;
        }

        const activeFeat = window.GeoOrcamento.activeFeature || 
            (typeof activeFeatureLayer !== 'undefined' ? activeFeatureLayer : 
            (typeof window.activeFeatureLayer !== 'undefined' ? window.activeFeatureLayer : null));
        
        if (activeFeat && activeFeat.feature) {
            const props = activeFeat.feature.properties = activeFeat.feature.properties || {};
            props.orcamento_dados = JSON.stringify(orc);
            props['Valor Total da Obra (R$)'] = valFormatado;
            props['valor_total_obra'] = valFormatado;
            props['BDI (%)'] = bdiStr + '%';
            props['Data Base SINAPI'] = orc.dataBaseSinapi || '07/2026';
        }

        if (window.activeFeatureData && typeof window.activeFeatureData === 'object') {
            window.activeFeatureData.orcamento_dados = JSON.stringify(orc);
            window.activeFeatureData['Valor Total da Obra (R$)'] = valFormatado;
            window.activeFeatureData['valor_total_obra'] = valFormatado;
            window.activeFeatureData['BDI (%)'] = bdiStr + '%';
        }
        if (window.currentFormFeatureData && typeof window.currentFormFeatureData === 'object') {
            window.currentFormFeatureData.orcamento_dados = JSON.stringify(orc);
            window.currentFormFeatureData['Valor Total da Obra (R$)'] = valFormatado;
            window.currentFormFeatureData['valor_total_obra'] = valFormatado;
            window.currentFormFeatureData['BDI (%)'] = bdiStr + '%';
        }
    }
    window.sincronizarCardOrcamento = sincronizarCardOrcamento;

    // Abertura do Modal de Orçamento
    window.openOrcamentoModal = async function(featureLayer) {
        const feat = featureLayer || (typeof activeFeatureLayer !== 'undefined' ? activeFeatureLayer : (typeof window.activeFeatureLayer !== 'undefined' ? window.activeFeatureLayer : null));
        if (!feat || !feat.feature) {
            alert('Selecione uma feição de obra no mapa para abrir o orçamento.');
            return;
        }

        window.GeoOrcamento.activeFeature = feat;
        const props = feat.feature.properties || {};
        
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
            const savedDef = localStorage.getItem('geogestor_orcamento_default');
            if (savedDef) {
                try { orc = JSON.parse(savedDef); } catch(e){}
            }
        }

        if (!orc) {
            orc = criarNovoOrcamento(feat);
        }

        if (!orc.cpus || orc.cpus.length === 0) {
            orc.cpus = obterBancoCpusLocal();
        }

        window.GeoOrcamento.orcamentoAtual = orc;
        window.GeoOrcamento.activeTab = 'planilha'; // Abre direto na planilha de custos

        // Recalcular totais e sincronizar imediatamente com o card da feição
        calcularTotais(orc);
        sincronizarCardOrcamento(orc);

        // Abre o modal
        const modal = document.getElementById('orcamento-modal');
        if (modal) modal.classList.remove('hidden');

        // Pré-carrega o catálogo do SINAPI em background
        window.carregarCatalogoSinapi();

        // Renderiza a interface
        renderOrcamentoModal();
    };

    window.closeOrcamentoModal = function() {
        salvarOrcamentoLocalmente();
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
        if (!orc) return orc;
        const bdi = orc.bdiPercentual || 0;
        let totalSemBdi = 0;
        let totalComBdi = 0;

        (orc.etapas || []).forEach(etp => {
            let etpSemBdi = 0;
            let etpComBdi = 0;

            (etp.itens || []).forEach(it => {
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
        (orc.etapas || []).forEach(etp => {
            (etp.itens || []).forEach(it => {
                it.percentualObra = totalComBdi > 0 ? ((it.precoTotal / totalComBdi) * 100) : 0;
            });
        });

        sincronizarCardOrcamento(orc);
        return orc;
    }
    window.calcularTotaisOrcamento = calcularTotais;

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
        if (subtitleEl) subtitleEl.textContent = `${orc.local} • UF da Obra: ${orc.uf || 'PB'} • Data-Base SINAPI: ${orc.dataBaseSinapi} • Regime: ${orc.regimeDesoneracao === 'DESONERADO' ? 'Com Desoneração' : 'Sem Desoneração'}`;
        if (badgeTotalEl) {
            badgeTotalEl.innerHTML = `
                <span class="text-xs uppercase font-semibold text-slate-400">Total com BDI (${(orc.bdiPercentual * 100).toFixed(2)}%):</span>
                <span class="text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400">R$ ${orc.valorTotalComBdi.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            `;
        }

        // Atualiza botões das abas
        ['resumo', 'planilha', 'cronograma', 'curva_abc', 'cpus'].forEach(tab => {
            const btn = document.getElementById(`orc-tab-btn-${tab}`);
            if (btn) {
                if (window.GeoOrcamento.activeTab === tab) {
                    btn.className = 'px-4 py-2.5 text-xs font-bold border-b-2 border-primary text-primary dark:text-sky-400 flex items-center gap-1.5 transition-all';
                } else {
                    btn.className = 'px-4 py-2.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1.5 transition-all';
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
            case 'cpus':
                container.innerHTML = renderAbaCpus(orc);
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
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 md:col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div>
                            <label class="text-[11px] font-bold text-slate-500 uppercase">Estado da Obra (UF Referencial)</label>
                            <select onchange="atualizarParametroObra('uf', this.value)" class="w-full mt-1 text-xs px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-emerald-600 dark:text-emerald-400">
                                ${['PB','SP','RJ','MG','PE','CE','BA','RN','AL','SE','MA','PI','PR','SC','RS','GO','MT','MS','DF','ES','PA','AM','RO','AC','RR','AP','TO'].map(u => `<option value="${u}" ${(orc.uf || 'PB') === u ? 'selected' : ''}>${u} - ${getNomeUf(u)}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="text-[11px] font-bold text-slate-500 uppercase">Tabela SINAPI (Mês/Ano)</label>
                            <select onchange="atualizarParametroObra('dataBaseSinapi', this.value)" class="w-full mt-1 text-xs px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                <option value="07/2026" ${orc.dataBaseSinapi === '07/2026' ? 'selected' : ''}>07/2026 - Oficial Caixa (Nacional)</option>
                                <option value="06/2026" ${orc.dataBaseSinapi === '06/2026' ? 'selected' : ''}>06/2026 - Oficial Caixa</option>
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
    window.GeoOrcamento._itensPlanilhaExpandidos = new Set();
    window.GeoOrcamento._analiticoSinapiCache = null;

    // Carregamento sob demanda do acervo analítico detalhado do SINAPI
    window.obterAnaliticoSinapi = async function(codigo = null) {
        if (!window.GeoOrcamento._analiticoSinapiCache) {
            try {
                const resp = await fetch('data/sinapi/analitico_2026_07.json');
                if (resp.ok) {
                    window.GeoOrcamento._analiticoSinapiCache = await resp.json();
                    console.log('[SINAPI Analítico] Base analítica com composições e insumos carregada.');
                }
            } catch(e) {
                console.warn('[SINAPI Analítico] Não foi possível carregar arquivo analítico:', e);
                window.GeoOrcamento._analiticoSinapiCache = {};
            }
        }
        if (!codigo) return window.GeoOrcamento._analiticoSinapiCache || {};
        const cache = window.GeoOrcamento._analiticoSinapiCache || {};
        return cache[String(codigo)] || null;
    };

    window.toggleExpandirItemPlanilha = async function(itemId) {
        if (!window.GeoOrcamento._itensPlanilhaExpandidos) {
            window.GeoOrcamento._itensPlanilhaExpandidos = new Set();
        }
        if (window.GeoOrcamento._itensPlanilhaExpandidos.has(itemId)) {
            window.GeoOrcamento._itensPlanilhaExpandidos.delete(itemId);
        } else {
            window.GeoOrcamento._itensPlanilhaExpandidos.add(itemId);
            // Garante o carregamento do analítico caso necessário
            if (!window.GeoOrcamento._analiticoSinapiCache) {
                await window.obterAnaliticoSinapi();
            }
        }
        renderOrcamentoModal();
    };

    window.obterInsumosDoItemPlanilha = function(it) {
        if (it.itensCpu && Array.isArray(it.itensCpu) && it.itensCpu.length > 0) {
            return it.itensCpu;
        }
        const orc = window.GeoOrcamento.orcamentoAtual;
        const cpus = orc ? (orc.cpus || obterBancoCpusLocal()) : obterBancoCpusLocal();
        const cpu = cpus.find(c => c.id === it.cpuId || c.codigo === it.codigo);
        if (cpu && Array.isArray(cpu.itens) && cpu.itens.length > 0) {
            it.itensCpu = cpu.itens;
            return cpu.itens;
        }

        // Tenta buscar no cache analítico do SINAPI
        const analiticoMap = window.GeoOrcamento._analiticoSinapiCache;
        if (analiticoMap && analiticoMap[String(it.codigo)]) {
            const catalogo = window.GeoOrcamento.catalogoSinapi || [];
            const isDeson = (orc && orc.regimeDesoneracao === 'DESONERADO');
            const insumosConvertidos = analiticoMap[String(it.codigo)].map(sub => {
                const cat = catalogo.find(c => String(c.codigo) === String(sub.codigo));
                let p = 0;
                if (cat) {
                    p = isDeson 
                        ? (cat.preco_desonerado ?? cat.preco_nao_desonerado ?? 0)
                        : (cat.preco_nao_desonerado ?? cat.preco_desonerado ?? 0);
                }
                return {
                    tipo: sub.tipo === 'COMPOSICAO' ? 'COMP' : (sub.unidade === 'H' ? 'MO' : (sub.unidade === 'CHP' || sub.unidade === 'CHI' ? 'EQ' : 'MAT')),
                    codigo: sub.codigo,
                    descricao: sub.descricao,
                    unidade: sub.unidade || 'UN',
                    coeficiente: sub.coeficiente || 1.0,
                    precoUnitario: p,
                    custoTotal: (sub.coeficiente || 1.0) * p,
                    origem: 'SINAPI',
                    ativo: true
                };
            });
            it.itensCpu = insumosConvertidos;
            return insumosConvertidos;
        }
        return [];
    };

    window.editarComposicaoDaPlanilha = async function(etapaId, itemId) {
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!orc) return;
        const etp = orc.etapas.find(e => e.id === etapaId);
        if (!etp) return;
        const it = etp.itens.find(x => x.id === itemId);
        if (!it) return;

        const cpus = orc.cpus || obterBancoCpusLocal();

        // 1. Se o item já tiver vínculo com uma CPU existente
        let cpuAlvo = cpus.find(c => c.id === it.cpuId || c.codigo === it.codigo);

        // 2. Se for uma composição que ainda não tem CPU própria no banco, criamos derivada
        if (!cpuAlvo) {
            if (!window.GeoOrcamento._analiticoSinapiCache) {
                await window.obterAnaliticoSinapi();
            }
            const insumosBase = window.obterInsumosDoItemPlanilha(it);

            const proximoNumero = (cpus.length + 1).toString().padStart(2, '0');
            const novoCodigo = String(it.codigo).startsWith('CPU') ? it.codigo : `CPU-${proximoNumero}`;

            let custoMo = 0, custoMat = 0, custoEq = 0;
            insumosBase.forEach(s => {
                const c = (s.coeficiente || 0) * (s.precoUnitario || 0);
                if (s.tipo === 'MO') custoMo += c;
                else if (s.tipo === 'EQ' || s.tipo === 'COMP') custoEq += c;
                else custoMat += c;
            });
            const custoTotalDireto = (custoMo + custoMat + custoEq) > 0 ? (custoMo + custoMat + custoEq) : (it.precoUnitarioSemBdi || 0);

            cpuAlvo = {
                id: 'cpu_custom_' + Date.now(),
                codigo: novoCodigo,
                descricao: it.descricao,
                unidade: it.unidade || 'UN',
                categoria: 'COMPOSIÇÃO CUSTOMIZADA',
                origem: it.fonte || 'SINAPI',
                itens: insumosBase.length > 0 ? insumosBase : [
                    { tipo: 'MAT', codigo: it.codigo, descricao: it.descricao, unidade: it.unidade || 'UN', coeficiente: 1.0, precoUnitario: it.precoUnitarioSemBdi || 0, custoTotal: it.precoUnitarioSemBdi || 0, origem: 'SINAPI', ativo: true }
                ],
                custoMaoDeObra: custoMo,
                custoMaterial: custoMat,
                custoEquipamento: custoEq,
                custoUnitarioDireto: custoTotalDireto
            };

            cpus.push(cpuAlvo);
            salvarBancoCpusLocal(cpus);
            it.cpuId = cpuAlvo.id;
            it.fonte = 'CPU';
            it.codigo = cpuAlvo.codigo;
            salvarOrcamentoLocalmente();
        }

        // Abre o Construtor de CPU com a composição selecionada e expandida
        abrirEditorCpu(cpuAlvo.id, etapaId);
    };

    window.GeoOrcamento._filtroTipoSinapi = window.GeoOrcamento._filtroTipoSinapi || {};
    window.setFiltroTipoSinapi = function(etapaId, tipo) {
        if (!window.GeoOrcamento._filtroTipoSinapi) {
            window.GeoOrcamento._filtroTipoSinapi = {};
        }
        window.GeoOrcamento._filtroTipoSinapi[etapaId] = tipo;
        renderOrcamentoModal();
        const inp = document.getElementById(`input-search-sinapi-${etapaId}`);
        if (inp) {
            inp.focus();
            if (inp.value && inp.value.trim().length >= 2) {
                buscarSinapiAutocomplete(etapaId, inp.value);
            }
        }
    };

    window.toggleCongelarInsumoPlanilha = async function(etapaId, itemId, subIdx) {
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!orc) return;
        const etp = orc.etapas.find(e => e.id === etapaId);
        if (!etp) return;
        const it = etp.itens.find(x => x.id === itemId);
        if (!it) return;

        // Garante que it.itensCpu esteja populado
        if (!it.itensCpu || it.itensCpu.length === 0) {
            if (!window.GeoOrcamento._analiticoSinapiCache) {
                await window.obterAnaliticoSinapi();
            }
            it.itensCpu = JSON.parse(JSON.stringify(window.obterInsumosDoItemPlanilha(it)));
        }

        const cpus = orc.cpus || obterBancoCpusLocal();
        // Se ainda não for CPU própria registrada, cria vínculo de CPU própria customizada da obra
        if (it.fonte !== 'CPU') {
            const proximoNumero = (cpus.length + 1).toString().padStart(2, '0');
            const cpuId = 'cpu_custom_' + Date.now();
            const cpuObj = {
                id: cpuId,
                codigo: `CPU-${proximoNumero}`,
                descricao: it.descricao,
                unidade: it.unidade || 'UN',
                categoria: 'COMPOSIÇÃO CUSTOMIZADA',
                origem: 'SINAPI ADAPTADO',
                itens: it.itensCpu,
                custoUnitarioDireto: it.precoUnitarioSemBdi || 0
            };
            cpus.push(cpuObj);
            salvarBancoCpusLocal(cpus);
            it.cpuId = cpuId;
            it.fonte = 'CPU';
            it.codigo = cpuObj.codigo;
        }

        if (it.itensCpu && it.itensCpu[subIdx]) {
            it.itensCpu[subIdx].ativo = (it.itensCpu[subIdx].ativo === false ? true : false);
        }

        // Sincroniza com o banco de CPUs
        if (it.cpuId) {
            const cpuRef = cpus.find(c => c.id === it.cpuId);
            if (cpuRef) {
                cpuRef.itens = it.itensCpu;
                salvarBancoCpusLocal(cpus);
            }
        }

        // Recalcula custo unitário somando apenas os insumos ativos
        let novoPrecoSemBdi = 0;
        (it.itensCpu || []).forEach(sub => {
            if (sub.ativo !== false) {
                novoPrecoSemBdi += (sub.coeficiente || 0) * (sub.precoUnitario || 0);
            }
        });
        it.precoUnitarioSemBdi = novoPrecoSemBdi;

        salvarOrcamentoLocalmente();
        renderOrcamentoModal();
    };

    window.removerInsumoPlanilha = async function(etapaId, itemId, subIdx) {
        if (!confirm('Deseja realmente remover este insumo da composição?')) return;
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!orc) return;
        const etp = orc.etapas.find(e => e.id === etapaId);
        if (!etp) return;
        const it = etp.itens.find(x => x.id === itemId);
        if (!it) return;

        if (!it.itensCpu || it.itensCpu.length === 0) {
            if (!window.GeoOrcamento._analiticoSinapiCache) {
                await window.obterAnaliticoSinapi();
            }
            it.itensCpu = JSON.parse(JSON.stringify(window.obterInsumosDoItemPlanilha(it)));
        }

        const cpus = orc.cpus || obterBancoCpusLocal();
        if (it.fonte !== 'CPU') {
            const proximoNumero = (cpus.length + 1).toString().padStart(2, '0');
            const cpuId = 'cpu_custom_' + Date.now();
            const cpuObj = {
                id: cpuId,
                codigo: `CPU-${proximoNumero}`,
                descricao: it.descricao,
                unidade: it.unidade || 'UN',
                categoria: 'COMPOSIÇÃO CUSTOMIZADA',
                origem: 'SINAPI ADAPTADO',
                itens: it.itensCpu,
                custoUnitarioDireto: it.precoUnitarioSemBdi || 0
            };
            cpus.push(cpuObj);
            salvarBancoCpusLocal(cpus);
            it.cpuId = cpuId;
            it.fonte = 'CPU';
            it.codigo = cpuObj.codigo;
        }

        if (it.itensCpu && it.itensCpu[subIdx]) {
            it.itensCpu.splice(subIdx, 1);
        }

        if (it.cpuId) {
            const cpuRef = cpus.find(c => c.id === it.cpuId);
            if (cpuRef) {
                cpuRef.itens = it.itensCpu;
                salvarBancoCpusLocal(cpus);
            }
        }

        let novoPrecoSemBdi = 0;
        (it.itensCpu || []).forEach(sub => {
            if (sub.ativo !== false) {
                novoPrecoSemBdi += (sub.coeficiente || 0) * (sub.precoUnitario || 0);
            }
        });
        it.precoUnitarioSemBdi = novoPrecoSemBdi;

        salvarOrcamentoLocalmente();
        renderOrcamentoModal();
    };

    function renderAbaPlanilha(orc) {
        let etapasHtml = '';

        orc.etapas.forEach((etp, etpIdx) => {
            let itensHtml = '';
            
            if (etp.itens && etp.itens.length > 0) {
                etp.itens.forEach((it, itIdx) => {
                    const isComposicao = (it.fonte === 'CPU' || it.fonte === 'PRÓPRIO' || it.tipo === 'COMPOSICAO' || (it.codigo && (String(it.codigo).startsWith('CPU') || String(it.codigo).length >= 5)));
                    const isExpandido = window.GeoOrcamento._itensPlanilhaExpandidos && window.GeoOrcamento._itensPlanilhaExpandidos.has(it.id);
                    const insumos = isComposicao ? window.obterInsumosDoItemPlanilha(it) : [];

                    itensHtml += `
                    <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 text-xs transition-colors ${isExpandido ? 'bg-sky-50/30 dark:bg-sky-950/20' : ''}">
                        <td class="py-2.5 px-3 font-semibold text-slate-500 w-14 text-center">
                            <div class="flex items-center justify-center gap-1">
                                ${isComposicao ? `
                                    <button onclick="toggleExpandirItemPlanilha('${it.id}')" class="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer transition-colors" title="${isExpandido ? 'Recolher insumos' : 'Expandir insumos da composição'}">
                                        <span class="material-symbols-outlined text-[16px]">${isExpandido ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}</span>
                                    </button>
                                ` : ''}
                                <span>${it.itemNum || (etp.codigo + '.' + (itIdx + 1))}</span>
                            </div>
                        </td>
                        <td class="py-2.5 px-3 text-slate-400 font-mono w-28">
                            <span onclick="${it.fonte === 'PRÓPRIO' || it.fonte === 'CPU' ? `abrirFichaTecnicaCpu('${it.cpuId || it.codigo}')` : (isComposicao ? `toggleExpandirItemPlanilha('${it.id}')` : '')}" class="px-1.5 py-0.5 rounded text-[10px] ${it.fonte === 'PRÓPRIO' || it.fonte === 'CPU' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 hover:ring-1 hover:ring-amber-500 cursor-pointer' : (isComposicao ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 hover:ring-1 hover:ring-purple-400 cursor-pointer' : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300')} font-bold inline-flex items-center gap-1" title="${it.fonte === 'PRÓPRIO' || it.fonte === 'CPU' ? 'Clique para auditar a Ficha Analítica desta CPU' : (isComposicao ? 'Clique para expandir insumos' : 'Item oficial SINAPI')}">
                                ${it.fonte === 'CPU' || it.fonte === 'PRÓPRIO' ? '<span class="material-symbols-outlined text-[12px]">build</span>' : (isComposicao ? '<span class="material-symbols-outlined text-[12px]">account_tree</span>' : '')}
                                ${it.codigo || 'SINAPI'}
                            </span>
                        </td>
                        <td class="py-2.5 px-3 text-slate-800 dark:text-slate-200 min-w-[280px]">
                            <div class="font-medium flex items-center gap-1.5 flex-wrap">
                                <span class="${isComposicao ? 'cursor-pointer hover:text-sky-600 dark:hover:text-sky-400' : ''}" onclick="${isComposicao ? `toggleExpandirItemPlanilha('${it.id}')` : ''}">${it.descricao}</span>
                                ${isComposicao ? `
                                    <span class="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                        ${insumos.length} insumos ${insumos.filter(x => x.ativo === false).length > 0 ? `(${insumos.filter(x => x.ativo === false).length} congelados)` : ''}
                                    </span>
                                ` : ''}
                            </div>
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
                        <td class="py-2.5 px-2 text-center w-20">
                            <div class="flex items-center justify-center gap-1">
                                ${isComposicao ? `
                                    <button onclick="editarComposicaoDaPlanilha('${etp.id}', '${it.id}')" class="p-1 hover:text-sky-500 text-slate-400 dark:text-slate-500 hover:dark:text-sky-400 transition-colors cursor-pointer" title="Editar Composição / Insumos no Construtor de CPU">
                                        <span class="material-symbols-outlined text-[17px]">edit</span>
                                    </button>
                                ` : ''}
                                <button onclick="removerItemEtapa('${etp.id}', '${it.id}')" class="p-1 hover:text-rose-500 text-slate-300 dark:text-slate-600 hover:dark:text-rose-400 transition-colors cursor-pointer" title="Excluir Item">
                                    <span class="material-symbols-outlined text-[17px]">delete</span>
                                </button>
                            </div>
                        </td>
                    </tr>
                    ${isExpandido ? `
                    <tr class="bg-slate-50/70 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 animate-in fade-in duration-150">
                        <td colspan="9" class="p-3 pl-8 sm:pl-14">
                            <div class="rounded-xl border border-sky-200 dark:border-sky-900/60 bg-white dark:bg-slate-900/90 p-3 shadow-2xs space-y-2.5">
                                <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                    <div class="flex items-center gap-2">
                                        <span class="material-symbols-outlined text-sky-500 text-[18px]">account_tree</span>
                                        <span class="text-xs font-extrabold text-slate-800 dark:text-slate-100">Insumos Componentes da Composição</span>
                                        <span class="text-[10px] text-slate-400">(${insumos.length} itens cadastrados)</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <button onclick="editarComposicaoDaPlanilha('${etp.id}', '${it.id}')" class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800 hover:bg-sky-100 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs" title="Abrir construtor para incluir insumos ou cotações de mercado">
                                            <span class="material-symbols-outlined text-[14px]">edit</span>
                                            Editar / Personalizar (CPU)
                                        </button>
                                    </div>
                                </div>
                                ${insumos.length > 0 ? `
                                <div class="overflow-x-auto">
                                    <table class="w-full text-left text-[11px] border-collapse">
                                        <thead>
                                            <tr class="text-[9.5px] uppercase font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                                                <th class="py-1.5 px-2 text-center w-16">Tipo</th>
                                                <th class="py-1.5 px-2 w-20">Código</th>
                                                <th class="py-1.5 px-2">Descrição do Insumo</th>
                                                <th class="py-1.5 px-2 text-center w-12">Und</th>
                                                <th class="py-1.5 px-2 text-right w-20">Coeficiente</th>
                                                <th class="py-1.5 px-2 text-right w-24">Preço Unit.</th>
                                                <th class="py-1.5 px-2 text-right w-24">Custo Total</th>
                                                <th class="py-1.5 px-2 text-center w-24">Status</th>
                                                <th class="py-1.5 px-2 text-center w-20">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${insumos.map((sub, sIdx) => {
                                                const isCongelado = (sub.ativo === false);
                                                const totalSub = isCongelado ? 0 : ((sub.coeficiente || 0) * (sub.precoUnitario || 0));
                                                let badgeCor = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                                                if (sub.tipo === 'MO') badgeCor = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
                                                else if (sub.tipo === 'MAT') badgeCor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
                                                else if (sub.tipo === 'EQ') badgeCor = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
                                                else if (sub.tipo === 'COMP') badgeCor = 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300';

                                                return `
                                                <tr class="border-b border-slate-100/60 dark:border-slate-800/40 ${isCongelado ? 'opacity-40 line-through bg-slate-100/40 dark:bg-slate-800/30' : 'hover:bg-slate-50/40 dark:hover:bg-slate-800/20'}">
                                                    <td class="py-1.5 px-2 text-center">
                                                        <span class="px-1.5 py-0.5 rounded text-[8.5px] font-extrabold ${badgeCor}">${sub.tipo || 'MAT'}</span>
                                                    </td>
                                                    <td class="py-1.5 px-2 font-mono text-slate-400 text-[10.5px]">${sub.codigo}</td>
                                                    <td class="py-1.5 px-2 font-medium text-slate-700 dark:text-slate-300">
                                                        <div class="flex items-center gap-1.5">
                                                            <span>${sub.descricao}</span>
                                                            ${isCongelado ? '<span class="text-[9px] font-bold text-rose-500 no-underline">(Fora do cálculo)</span>' : ''}
                                                        </div>
                                                    </td>
                                                    <td class="py-1.5 px-2 text-center uppercase font-bold text-slate-400 text-[10px]">${sub.unidade}</td>
                                                    <td class="py-1.5 px-2 text-right font-mono font-semibold">${(sub.coeficiente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                                                    <td class="py-1.5 px-2 text-right font-mono text-slate-500">R$ ${(sub.precoUnitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td class="py-1.5 px-2 text-right font-mono font-bold ${isCongelado ? 'text-slate-400' : 'text-slate-800 dark:text-slate-200'}">R$ ${totalSub.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td class="py-1.5 px-2 text-center">
                                                        ${isCongelado ? `
                                                            <span class="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 inline-flex items-center gap-0.5">
                                                                <span class="material-symbols-outlined text-[11px]">ac_unit</span> Congelado
                                                            </span>
                                                        ` : `
                                                            <span class="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 inline-flex items-center gap-0.5">
                                                                <span class="material-symbols-outlined text-[11px]">check_circle</span> Ativo
                                                            </span>
                                                        `}
                                                    </td>
                                                    <td class="py-1.5 px-2 text-center">
                                                        <div class="flex items-center justify-center gap-1">
                                                            ${isCongelado ? `
                                                                <button type="button" onclick="toggleCongelarInsumoPlanilha('${etp.id}', '${it.id}', ${sIdx})" class="p-1 rounded hover:bg-emerald-100 text-emerald-600 dark:hover:bg-emerald-950 cursor-pointer transition-colors" title="Descongelar insumo (reintegrar ao custo)">
                                                                    <span class="material-symbols-outlined text-[16px]">add_circle</span>
                                                                </button>
                                                            ` : `
                                                                <button type="button" onclick="toggleCongelarInsumoPlanilha('${etp.id}', '${it.id}', ${sIdx})" class="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-500 dark:hover:bg-rose-950 cursor-pointer transition-colors" title="Congelar insumo (retirar do custo)">
                                                                    <span class="material-symbols-outlined text-[16px]">ac_unit</span>
                                                                </button>
                                                            `}
                                                            <button type="button" onclick="removerInsumoPlanilha('${etp.id}', '${it.id}', ${sIdx})" class="p-1 rounded hover:bg-rose-100 text-slate-300 hover:text-rose-600 dark:hover:bg-rose-950 cursor-pointer transition-colors" title="Excluir permanentemente da composição">
                                                                <span class="material-symbols-outlined text-[16px]">delete</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                `;
                                            }).join('')}
                                        </tbody>
                                    </table>
                                </div>
                                <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                                    <div class="text-[10px] text-slate-400 flex items-center gap-1.5">
                                        <span class="material-symbols-outlined text-[14px] text-sky-500">sync_alt</span>
                                        <span>Ao congelar ou excluir itens, a composição converte-se em <strong>CPU Customizada</strong> e recalcula os custos imediatamente.</span>
                                    </div>
                                    <button type="button" onclick="editarComposicaoDaPlanilha('${etp.id}', '${it.id}')" class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-sky-500 text-white hover:bg-sky-600 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs">
                                        <span class="material-symbols-outlined text-[14px]">add</span>
                                        + Incluir Novo Insumo ou Cotação
                                    </button>
                                </div>
                                ` : `
                                <div class="p-4 text-center text-xs text-slate-400 italic space-y-2">
                                    <div>Nenhum insumo componente vinculado a esta composição ainda.</div>
                                    <button type="button" onclick="editarComposicaoDaPlanilha('${etp.id}', '${it.id}')" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-primary text-white hover:bg-primary/90 inline-flex items-center gap-1 cursor-pointer">
                                        <span class="material-symbols-outlined text-[15px]">add</span>
                                        Abrir Construtor e Adicionar Insumos
                                    </button>
                                </div>
                                `}
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    `;
                });
            } else {
                itensHtml = `
                <tr>
                    <td colspan="9" class="py-4 text-center text-xs text-slate-400 italic">Nenhum serviço adicionado nesta etapa ainda. Use a busca abaixo para incluir itens do SINAPI.</td>
                </tr>
                `;
            }

            const filtroTipo = (window.GeoOrcamento._filtroTipoSinapi && window.GeoOrcamento._filtroTipoSinapi[etp.id]) || 'TODOS';
            let placeholderBusca = "Buscar serviço ou insumo SINAPI (código ou nome, ex: 104658, podotatil, eucalipto, tubo)...";
            if (filtroTipo === 'COMPOSICAO') {
                placeholderBusca = "Buscar COMPOSIÇÕES DE SERVIÇOS SINAPI (ex: alvenaria, piso, pintura, escavação)...";
            } else if (filtroTipo === 'INSUMO') {
                placeholderBusca = "Buscar INSUMOS BÁSICOS SINAPI (ex: cimento, pedreiro, betoneira, areia)...";
            }

            etapasHtml += `
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs mb-5">
                <!-- Cabeçalho da Etapa -->
                <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 px-4 py-3 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 rounded-t-2xl">
                    <div class="flex items-start gap-3 flex-1 min-w-0 mr-2 sm:mr-4">
                        <span class="w-7 h-7 rounded-lg bg-primary text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">${etp.codigo}</span>
                        <textarea rows="1" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'" onchange="atualizarNomeEtapa('${etp.id}', this.value)" class="w-full flex-1 bg-transparent font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-primary focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-primary rounded-lg px-2 py-1 resize-none leading-snug transition-all outline-none overflow-hidden" placeholder="Título da macroetapa...">${etp.nome}</textarea>
                    </div>
                    <div class="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <span class="text-xs text-slate-500 font-semibold whitespace-nowrap">Subtotal Etapa:</span>
                        <span class="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-200 font-mono whitespace-nowrap">
                            R$ ${(etp.totalComBdi || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <button onclick="removerEtapa('${etp.id}')" class="text-slate-400 hover:text-rose-500 p-1 transition-colors cursor-pointer shrink-0" title="Excluir Etapa Completa">
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

                <!-- Rodapé de Inserção Rápida de Serviços SINAPI com Filtro Pré-Busca -->
                <div class="p-3 bg-slate-50/40 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/80 rounded-b-2xl flex flex-col gap-2.5 relative z-30">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <!-- Pílulas de Filtro Rápido: Todos, Composições, Insumos -->
                        <div class="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-[11px] font-bold">
                            <button type="button" onclick="setFiltroTipoSinapi('${etp.id}', 'TODOS')" class="px-3 py-1 rounded-lg transition-all cursor-pointer ${filtroTipo === 'TODOS' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}">
                                Todos
                            </button>
                            <button type="button" onclick="setFiltroTipoSinapi('${etp.id}', 'COMPOSICAO')" class="px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${filtroTipo === 'COMPOSICAO' ? 'bg-purple-600 text-white shadow-2xs font-extrabold' : 'text-slate-500 hover:text-purple-600 dark:hover:text-purple-400'}">
                                <span class="material-symbols-outlined text-[13px]">account_tree</span>
                                Composições (Serviços)
                            </button>
                            <button type="button" onclick="setFiltroTipoSinapi('${etp.id}', 'INSUMO')" class="px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${filtroTipo === 'INSUMO' ? 'bg-emerald-600 text-white shadow-2xs font-extrabold' : 'text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400'}">
                                <span class="material-symbols-outlined text-[13px]">inventory_2</span>
                                Insumos (MAT / MO / EQ)
                            </button>
                        </div>

                        <button onclick="abrirModalSelecaoCpu('${etp.id}')" class="px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-xs">
                            <span class="material-symbols-outlined text-[16px]">add_circle</span>
                            + Composição Própria (CPU)
                        </button>
                    </div>

                    <div class="relative flex-1">
                        <span class="absolute left-3 top-2.5 text-slate-400 material-symbols-outlined text-[16px]">search</span>
                        <input type="text" id="input-search-sinapi-${etp.id}" placeholder="${placeholderBusca}" oninput="buscarSinapiAutocomplete('${etp.id}', this.value)" onfocus="if(this.value && this.value.trim().length >= 2) buscarSinapiAutocomplete('${etp.id}', this.value)" class="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-primary shadow-xs">
                        <!-- Dropdown Autocomplete flutuante sem corte de overflow -->
                        <div id="autocomplete-results-${etp.id}" class="hidden absolute left-0 top-full mt-1.5 w-full max-h-72 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 divide-y divide-slate-100 dark:divide-slate-800"></div>
                    </div>
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
                    <button onclick="abrirModalExportarPdf()" class="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm">
                        <span class="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                        Exportar PDF
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

        (orc.etapas || []).forEach(etp => {
            const percList = (orc.cronograma && orc.cronograma.distribuicao && orc.cronograma.distribuicao[etp.id]) || new Array(meses).fill(0);
            
            let cellsFisico = '';
            let somaPerc = 0;

            for (let m = 0; m < meses; m++) {
                const rawPerc = percList[m];
                const parsedVal = typeof rawPerc === 'string' ? parseFloat(rawPerc.replace(',', '.')) : parseFloat(rawPerc);
                const valPerc = isNaN(parsedVal) ? 0 : Math.round(parsedVal * 100) / 100;
                somaPerc += valPerc;
                
                const valorMes = Math.round(((etp.totalComBdi * valPerc) / 100) * 100) / 100;
                totaisMes[m] += valorMes;

                cellsFisico += `
                <td class="py-2 px-2 text-center border-l border-slate-100 dark:border-slate-800">
                    <div class="flex items-center justify-center gap-1">
                        <input type="number" step="0.01" min="0" max="100" value="${valPerc > 0 ? Number(valPerc.toFixed(2)) : 0}" onchange="atualizarPercentualCronograma('${etp.id}', ${m}, this.value)" class="w-18 text-center text-xs font-bold py-1 border rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:border-primary focus:ring-1 focus:ring-primary outline-hidden">
                        <span class="text-[10px] text-slate-400">%</span>
                    </div>
                    <div class="text-[10px] font-mono font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                        R$ ${valorMes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </td>
                `;
            }

            somaPerc = Math.round(somaPerc * 100) / 100;
            const alertColor = Math.abs(somaPerc - 100) < 0.009 ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' : 'text-rose-500 font-bold';

            linhasEtapas += `
            <tr class="border-b border-slate-100 dark:border-slate-800 text-xs hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                <td class="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                    ${etp.codigo} ${etp.nome}
                    <div class="text-[11px] text-slate-400 font-mono">R$ ${etp.totalComBdi.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </td>
                <td class="py-3 px-2 text-center ${alertColor}">
                    ${somaPerc.toFixed(2)}%
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
            const v = Math.round(totaisMes[m] * 100) / 100;
            acum += v;
            acum = Math.round(acum * 100) / 100;
            const pMes = totalGeral > 0 ? (v / totalGeral) * 100 : 0;
            const pAcum = totalGeral > 0 ? (acum / totalGeral) * 100 : 0;

            cellsFinanceiro += `
            <td class="py-2.5 px-2 text-center border-l border-slate-200 dark:border-slate-800 font-mono">
                <div class="font-bold text-xs text-slate-800 dark:text-slate-100">R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div class="text-[10px] text-slate-400 font-semibold">${pMes.toFixed(2)}%</div>
            </td>
            `;

            cellsAcumulado += `
            <td class="py-2.5 px-2 text-center border-l border-slate-200 dark:border-slate-800 font-mono">
                <div class="font-extrabold text-xs text-emerald-600 dark:text-emerald-400">R$ ${acum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div class="text-[10px] font-bold text-slate-500">${pAcum.toFixed(2)}%</div>
            </td>
            `;
        }

        const somaTotalFinanceiro = Math.round(totaisMes.reduce((a, b) => a + b, 0) * 100) / 100;
        const percTotalFinanceiro = totalGeral > 0 ? (somaTotalFinanceiro / totalGeral) * 100 : 0;
        const alertTotalGeral = Math.abs(percTotalFinanceiro - 100) < 0.009 ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' : 'text-rose-500 font-bold';

        return `
        <div class="space-y-4">
            <div class="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div>
                    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">Cronograma de Execução Físico-Financeira</h3>
                    <p class="text-xs text-slate-400">Distribua os percentuais de avanço físico de cada etapa ao longo dos meses com precisão decimal.</p>
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
                            <td class="py-3 px-2 text-center ${alertTotalGeral}">${percTotalFinanceiro.toFixed(2)}%</td>
                            ${cellsFinanceiro}
                        </tr>
                        <!-- Acumulado -->
                        <tr class="bg-slate-100/60 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 text-xs font-bold">
                            <td class="py-3 px-3 text-emerald-700 dark:text-emerald-400 uppercase">Desembolso Acumulado</td>
                            <td class="py-3 px-2 text-center text-slate-400 font-mono text-[11px]">${Math.min(100, percTotalFinanceiro).toFixed(2)}%</td>
                            ${cellsAcumulado}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        `;
    }
    window.renderAbaCronograma = renderAbaCronograma;

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

    // Mapeamento de nomes de estados brasileiros (27 UFs)
    function getNomeUf(u) {
        const nomes = {
            'AC': 'Acre', 'AL': 'Alagoas', 'AP': 'Amapá', 'AM': 'Amazonas', 'BA': 'Bahia', 'CE': 'Ceará',
            'DF': 'Distrito Federal', 'ES': 'Espírito Santo', 'GO': 'Goiás', 'MA': 'Maranhão', 'MT': 'Mato Grosso',
            'MS': 'Mato Grosso do Sul', 'MG': 'Minas Gerais', 'PA': 'Pará', 'PB': 'Paraíba', 'PR': 'Paraná',
            'PE': 'Pernambuco', 'PI': 'Piauí', 'RJ': 'Rio de Janeiro', 'RN': 'Rio Grande do Norte', 'RS': 'Rio Grande do Sul',
            'RO': 'Rondônia', 'RR': 'Roraima', 'SC': 'Santa Catarina', 'SP': 'São Paulo', 'SE': 'Sergipe', 'TO': 'Tocantins'
        };
        return nomes[u] || u;
    }

    // ==========================================
    // INTERAÇÕES & EVENT HANDLERS
    // ==========================================

    window.atualizarParametroObra = async function(chave, valor) {
        if (!window.GeoOrcamento.orcamentoAtual) return;
        window.GeoOrcamento.orcamentoAtual[chave] = valor;

        // Ao alterar a UF ou o Regime da Obra, recarrega o catálogo daquele estado e atualiza os custos unitários
        if (chave === 'uf' || chave === 'regimeDesoneracao') {
            const targetUf = window.GeoOrcamento.orcamentoAtual.uf || 'PB';
            await window.carregarCatalogoSinapi(targetUf);
            const catalogo = window.GeoOrcamento.catalogoSinapi || [];
            const isDeson = (window.GeoOrcamento.orcamentoAtual.regimeDesoneracao === 'DESONERADO');

            window.GeoOrcamento.orcamentoAtual.etapas.forEach(etp => {
                etp.itens.forEach(it => {
                    if (it.fonte === 'SINAPI') {
                        const ref = catalogo.find(c => String(c.codigo) === String(it.codigo));
                        if (ref) {
                            it.precoUnitarioSemBdi = isDeson ? (ref.preco_desonerado ?? 0) : (ref.preco_nao_desonerado ?? 0);
                        }
                    }
                });
            });
            renderOrcamentoModal();
        }

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

    // ==========================================
    // MÓDULO DE COMPOSIÇÕES PRÓPRIAS DE PREÇO (CPU)
    // ==========================================
    window.GeoOrcamento._editorCpuAtual = null;
    window.GeoOrcamento._etapaCpuOrigemId = null;

    function obterBancoCpusLocal() {
        try {
            const salvo = localStorage.getItem('geogestor_banco_cpus');
            if (salvo) {
                const arr = JSON.parse(salvo);
                if (Array.isArray(arr) && arr.length > 0) return arr;
            }
        } catch(e) {}

        const cpusExemplo = [
            {
                id: 'cpu_exemplo_placa_obra',
                codigo: 'CPU-01',
                descricao: 'PLACA DE IDENTIFICAÇÃO DE OBRA EM CHAPA DE AÇO GALVANIZADO N 26, ESTRUTURA EM MADEIRA NÃO APARELHADA (2,00 X 1,20 M)',
                unidade: 'M²',
                categoria: 'SERVIÇOS PRELIMINARES',
                origem: 'MUNICIPAL',
                itens: [
                    { tipo: 'MO', codigo: '88261', descricao: 'CARPINTEIRO DE FORMAS COM ENCARGOS COMPLEMENTARES', unidade: 'H', coeficiente: 0.8, precoUnitario: 26.50, custoTotal: 21.20, origem: 'SINAPI' },
                    { tipo: 'MO', codigo: '88316', descricao: 'SERVENTE COM ENCARGOS COMPLEMENTARES', unidade: 'H', coeficiente: 1.0, precoUnitario: 20.80, custoTotal: 20.80, origem: 'SINAPI' },
                    { tipo: 'MAT', codigo: '4813', descricao: 'PLACA DE OBRA EM CHAPA DE ACO GALVANIZADO N 26', unidade: 'M2', coeficiente: 1.0, precoUnitario: 85.00, custoTotal: 85.00, origem: 'SINAPI' },
                    { tipo: 'MAT', codigo: '5075', descricao: 'PONTALETE DE MADEIRA NAO APARELHADA 7,5 X 7,5 CM', unidade: 'M', coeficiente: 2.5, precoUnitario: 12.50, custoTotal: 31.25, origem: 'SINAPI' },
                    { tipo: 'MAT', codigo: '4491', descricao: 'SARRAFO DE MADEIRA NAO APARELHADA 2,5 X 5,0 CM', unidade: 'M', coeficiente: 1.8, precoUnitario: 4.20, custoTotal: 7.56, origem: 'SINAPI' }
                ],
                custoMaoDeObra: 42.00,
                custoMaterial: 123.81,
                custoEquipamento: 0.00,
                custoUnitarioDireto: 165.81
            },
            {
                id: 'cpu_exemplo_luminaria_solar',
                codigo: 'CPU-02',
                descricao: 'FORNECIMENTO E INSTALAÇÃO DE LUMINÁRIA SOLAR LED 60W INTEGRADA (ALL-IN-ONE) COM POSTE CÔNICO DE 6M EM AÇO GALVANIZADO',
                unidade: 'UN',
                categoria: 'ILUMINAÇÃO PÚBLICA',
                origem: 'MUNICIPAL',
                itens: [
                    { tipo: 'MAT', codigo: 'COT-01', descricao: 'LUMINÁRIA SOLAR LED ALL-IN-ONE 60W C/ PAINEL FOTOVOLTAICO E BATERIA DE LÍTIO', unidade: 'UN', coeficiente: 1.0, precoUnitario: 680.00, custoTotal: 680.00, origem: 'COTAÇÃO' },
                    { tipo: 'MAT', codigo: 'COT-02', descricao: 'POSTE CÔNICO CONTÍNUO RETO EM AÇO GALVANIZADO 6,00 M COM BASE', unidade: 'UN', coeficiente: 1.0, precoUnitario: 450.00, custoTotal: 450.00, origem: 'COTAÇÃO' },
                    { tipo: 'MO', codigo: '88264', descricao: 'ELETRICISTA COM ENCARGOS COMPLEMENTARES', unidade: 'H', coeficiente: 2.0, precoUnitario: 27.50, custoTotal: 55.00, origem: 'SINAPI' },
                    { tipo: 'MO', codigo: '88316', descricao: 'SERVENTE COM ENCARGOS COMPLEMENTARES', unidade: 'H', coeficiente: 2.5, precoUnitario: 20.80, custoTotal: 52.00, origem: 'SINAPI' },
                    { tipo: 'EQ', codigo: '5934', descricao: 'CAMINHÃO COM GUINDAUTO (MUNCK) CAPACIDADE 4 T (CHP)', unidade: 'H', coeficiente: 0.5, precoUnitario: 140.00, custoTotal: 70.00, origem: 'SINAPI' }
                ],
                custoMaoDeObra: 107.00,
                custoMaterial: 1130.00,
                custoEquipamento: 70.00,
                custoUnitarioDireto: 1307.00
            }
        ];
        salvarBancoCpusLocal(cpusExemplo);
        return cpusExemplo;
    }

    function salvarBancoCpusLocal(cpus) {
        try {
            localStorage.setItem('geogestor_banco_cpus', JSON.stringify(cpus));
            if (window.GeoOrcamento.orcamentoAtual) {
                window.GeoOrcamento.orcamentoAtual.cpus = cpus;
            }
        } catch(e) {
            console.error('[CPU] Erro ao salvar banco de CPUs:', e);
        }
    }

    // Redirecionamento amigável do botão antigo
    window.adicionarItemProprio = function(etapaId) {
        window.abrirModalSelecaoCpu(etapaId);
    };

    // ABA DEDICADA DE COMPOSIÇÕES PRÓPRIAS (CPU)
    function renderAbaCpus(orc) {
        const cpus = orc.cpus || obterBancoCpusLocal();
        const bdi = orc.bdiPercentual || 0.248;

        let totalCustos = 0;
        let totalInsumos = 0;
        cpus.forEach(c => {
            totalCustos += (c.custoUnitarioDireto || 0);
            totalInsumos += (c.itens ? c.itens.length : 0);
        });

        let rowsHtml = '';
        if (cpus.length > 0) {
            rowsHtml = cpus.map((c, idx) => {
                const precoComBdi = (c.custoUnitarioDireto || 0) * (1 + bdi);
                const qtdMo = (c.itens || []).filter(i => i.tipo === 'MO').length;
                const qtdMat = (c.itens || []).filter(i => i.tipo === 'MAT').length;
                const qtdEq = (c.itens || []).filter(i => i.tipo === 'EQ' || i.tipo === 'COMP').length;

                return `
                <tr class="border-b border-slate-100 dark:border-slate-800 text-xs hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td class="py-3 px-3 text-center">
                        <span class="px-2 py-0.5 rounded-md font-mono text-[11px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">${c.codigo}</span>
                    </td>
                    <td class="py-3 px-3">
                        <div class="font-bold text-slate-800 dark:text-slate-100">${c.descricao}</div>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[10px] uppercase font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">${c.categoria || 'Geral'}</span>
                            <span class="text-[10px] text-slate-400">• ${(c.itens || []).length} insumos: <span class="text-blue-500 font-semibold">${qtdMo} MO</span> | <span class="text-emerald-500 font-semibold">${qtdMat} MAT</span> | <span class="text-amber-500 font-semibold">${qtdEq} EQ</span></span>
                        </div>
                    </td>
                    <td class="py-3 px-3 text-center font-bold text-slate-600 dark:text-slate-300 uppercase">${c.unidade}</td>
                    <td class="py-3 px-3 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                        R$ ${(c.custoUnitarioDireto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td class="py-3 px-3 text-right font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                        R$ ${precoComBdi.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td class="py-3 px-3 text-right">
                        <div class="flex items-center justify-end gap-1.5">
                            <button onclick="abrirFichaTecnicaCpu('${c.id}')" class="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer" title="Ver Memória Analítica">
                                <span class="material-symbols-outlined text-[16px]">visibility</span>
                            </button>
                            <button onclick="abrirEditorCpu('${c.id}')" class="p-1.5 rounded-lg border border-sky-200 dark:border-sky-800/60 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 cursor-pointer" title="Editar Composição">
                                <span class="material-symbols-outlined text-[16px]">edit</span>
                            </button>
                            <button onclick="excluirCpu('${c.id}')" class="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 text-rose-600 dark:text-rose-400 cursor-pointer" title="Excluir Composição">
                                <span class="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
                `;
            }).join('');
        } else {
            rowsHtml = `
            <tr>
                <td colspan="6" class="py-8 text-center text-xs text-slate-400 italic">
                    Nenhuma Composição Própria cadastrada ainda. Clique no botão acima para criar sua primeira CPU!
                </td>
            </tr>
            `;
        }

        return `
        <div class="space-y-5">
            <!-- Barra de Ações & Estatísticas da Aba CPU -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div>
                    <h3 class="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <span class="material-symbols-outlined text-amber-500 text-[20px]">build_circle</span>
                        Banco Municipal de Composições de Preço Unitário (CPU)
                    </h3>
                    <p class="text-xs text-slate-400 mt-0.5">
                        Serviços orçamentários específicos calculados com índices de consumo oficiais e insumos do SINAPI / Cotações
                    </p>
                </div>
                <button onclick="abrirEditorCpu()" class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all shrink-0">
                    <span class="material-symbols-outlined text-[18px]">add_circle</span>
                    + Nova Composição Própria (CPU)
                </button>
            </div>

            <!-- Cards Informativos -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-4">
                    <span class="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300 block mb-1">Total de CPUs Cadastradas</span>
                    <span class="text-xl font-black text-amber-900 dark:text-amber-200 font-mono">${cpus.length}</span>
                    <span class="text-[11px] text-slate-400 block mt-0.5">Composições prontas para uso em qualquer etapa</span>
                </div>
                <div class="bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/50 rounded-2xl p-4">
                    <span class="text-[10px] font-bold uppercase text-sky-700 dark:text-sky-300 block mb-1">Insumos Mapeados</span>
                    <span class="text-xl font-black text-sky-900 dark:text-sky-200 font-mono">${totalInsumos}</span>
                    <span class="text-[11px] text-sky-600/80 dark:text-sky-400/80 block mt-0.5">Mão de obra, materiais e equipamentos vinculados</span>
                </div>
                <div class="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-2xl p-4">
                    <span class="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block mb-1">BDI Oficial Aplicado</span>
                    <span class="text-xl font-black text-emerald-700 dark:text-emerald-300 font-mono">${(bdi * 100).toFixed(2)}%</span>
                    <span class="text-[11px] text-slate-400 block mt-0.5">Parâmetro de Bonificação e Despesas Indiretas da Obra</span>
                </div>
            </div>

            <!-- Tabela de CPUs -->
            <div class="overflow-x-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase bg-slate-50/80 dark:bg-slate-800/40">
                            <th class="py-3 px-3 text-center w-24">Código</th>
                            <th class="py-3 px-3">Descrição do Serviço Composto</th>
                            <th class="py-3 px-3 text-center w-20">Und</th>
                            <th class="py-3 px-3 text-right w-36">Custo Direto (s/ BDI)</th>
                            <th class="py-3 px-3 text-right w-36">Preço c/ BDI (${(bdi * 100).toFixed(1)}%)</th>
                            <th class="py-3 px-3 text-right w-32">Ações</th>
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
    // MODAL DE SELEÇÃO / INSERÇÃO DE CPU NA ETAPA
    // ==========================================
    window.abrirModalSelecaoCpu = function(etapaId) {
        window.GeoOrcamento._etapaCpuOrigemId = etapaId;
        const modal = document.getElementById('modal-selecao-cpu');
        if (!modal) return;

        const orc = window.GeoOrcamento.orcamentoAtual;
        const etp = orc ? orc.etapas.find(e => e.id === etapaId) : null;
        const sub = document.getElementById('modal-selecao-cpu-subtitulo');
        if (sub && etp) {
            sub.textContent = `Inserir na macroetapa: [${etp.codigo} - ${etp.nome}]`;
        }

        renderListaSelecaoCpu();
        modal.classList.remove('hidden');
    };

    window.fecharModalSelecaoCpu = function() {
        const modal = document.getElementById('modal-selecao-cpu');
        if (modal) modal.classList.add('hidden');
    };

    window.filtrarListaSelecaoCpu = function(q) {
        renderListaSelecaoCpu(q);
    };

    window.GeoOrcamento._cpusExpandidasSelecao = new Set();

    window.toggleExpandirCpuSelecao = function(cpuId) {
        if (!window.GeoOrcamento._cpusExpandidasSelecao) {
            window.GeoOrcamento._cpusExpandidasSelecao = new Set();
        }
        if (window.GeoOrcamento._cpusExpandidasSelecao.has(cpuId)) {
            window.GeoOrcamento._cpusExpandidasSelecao.delete(cpuId);
        } else {
            window.GeoOrcamento._cpusExpandidasSelecao.add(cpuId);
        }
        renderListaSelecaoCpu();
    };

    window.toggleCongelarInsumoSelecao = function(cpuId, insumoIdx) {
        const orc = window.GeoOrcamento.orcamentoAtual;
        const cpus = orc ? (orc.cpus || obterBancoCpusLocal()) : obterBancoCpusLocal();
        const cpu = cpus.find(c => c.id === cpuId);
        if (!cpu || !cpu.itens || !cpu.itens[insumoIdx]) return;

        // Alterna entre ativo e congelado
        cpu.itens[insumoIdx].ativo = (cpu.itens[insumoIdx].ativo === false ? true : false);

        // Recalcula o custo da CPU considerando apenas insumos ativos
        let mo = 0, mat = 0, eq = 0;
        cpu.itens.forEach(it => {
            if (it.ativo === false) return;
            const sub = (it.coeficiente || 0) * (it.precoUnitario || 0);
            if (it.tipo === 'MO') mo += sub;
            else if (it.tipo === 'EQ' || it.tipo === 'COMP') eq += sub;
            else mat += sub;
        });
        cpu.custoMaoDeObra = mo;
        cpu.custoMaterial = mat;
        cpu.custoEquipamento = eq;
        cpu.custoUnitarioDireto = mo + mat + eq;

        salvarBancoCpusLocal(cpus);
        renderListaSelecaoCpu();
    };

    function renderListaSelecaoCpu(filtro = '') {
        const listaEl = document.getElementById('modal-selecao-cpu-lista');
        const contEl = document.getElementById('modal-selecao-cpu-contador');
        if (!listaEl) return;

        const orc = window.GeoOrcamento.orcamentoAtual;
        const cpus = orc ? (orc.cpus || obterBancoCpusLocal()) : obterBancoCpusLocal();
        const bdi = orc ? (orc.bdiPercentual || 0.248) : 0.248;

        const fClean = (filtro || '').toLowerCase().trim();
        const filtradas = cpus.filter(c => {
            if (!fClean) return true;
            return (c.codigo || '').toLowerCase().includes(fClean) ||
                   (c.descricao || '').toLowerCase().includes(fClean) ||
                   (c.categoria || '').toLowerCase().includes(fClean);
        });

        if (contEl) contEl.textContent = `${filtradas.length} composições disponíveis`;

        if (filtradas.length === 0) {
            listaEl.innerHTML = `
            <div class="py-8 text-center space-y-3">
                <span class="material-symbols-outlined text-4xl text-slate-300">search_off</span>
                <p class="text-xs text-slate-400">Nenhuma CPU encontrada para o filtro informado.</p>
                <button onclick="abrirEditorCpu(null, window.GeoOrcamento._etapaCpuOrigemId)" class="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer">
                    <span class="material-symbols-outlined text-[16px]">add</span>
                    Criar Esta Composição Agora
                </button>
            </div>`;
            return;
        }

        listaEl.innerHTML = filtradas.map(c => {
            const precoComBdi = (c.custoUnitarioDireto || 0) * (1 + bdi);
            const isExpandida = window.GeoOrcamento._cpusExpandidasSelecao && window.GeoOrcamento._cpusExpandidasSelecao.has(c.id);
            const insumos = c.itens || [];
            const insumosCongeladosQtd = insumos.filter(x => x.ativo === false).length;

            return `
            <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs transition-all hover:border-amber-300 dark:hover:border-amber-700/60 mb-3">
                <div onclick="toggleExpandirCpuSelecao('${c.id}')" class="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <div class="flex items-start gap-2.5 flex-1 min-w-0">
                        <span class="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-amber-500 shrink-0 mt-0.5">
                            <span class="material-symbols-outlined text-[18px]">${isExpandida ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}</span>
                        </span>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="px-1.5 py-0.5 rounded font-mono text-[10.5px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">${c.codigo}</span>
                                <span class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${c.descricao}</span>
                                <span class="text-[10px] text-slate-400 font-semibold">• ${insumos.length} insumos ${insumosCongeladosQtd > 0 ? `<span class="text-amber-500">(${insumosCongeladosQtd} congelados)</span>` : ''}</span>
                            </div>
                            <div class="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                                <span>Unidade: <strong class="text-slate-600 dark:text-slate-300 uppercase">${c.unidade}</strong></span>
                                <span>• Custo s/ BDI: <strong class="text-slate-800 dark:text-slate-200 font-mono">R$ ${(c.custoUnitarioDireto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                <span>• Preço c/ BDI: <strong class="text-emerald-600 dark:text-emerald-400 font-mono">R$ ${precoComBdi.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0" onclick="event.stopPropagation()">
                        <div class="flex items-center gap-1">
                            <span class="text-[11px] text-slate-400 font-bold">Qtd:</span>
                            <input type="number" id="input-qtd-cpu-${c.id}" min="0.01" step="any" value="1.00" class="w-16 px-1.5 py-1 text-center font-bold text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
                        </div>
                        <button onclick="inserirCpuNaEtapa('${c.id}', window.GeoOrcamento._etapaCpuOrigemId)" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-xs">
                            <span class="material-symbols-outlined text-[16px]">add</span>
                            Inserir na Etapa
                        </button>
                    </div>
                </div>
                ${isExpandida ? `
                <div class="p-3 bg-slate-50/70 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800 animate-in fade-in duration-150 space-y-2">
                    <div class="flex items-center justify-between text-[11px] text-slate-400 font-semibold px-1">
                        <span class="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-bold">
                            <span class="material-symbols-outlined text-[15px] text-amber-500">list_alt</span>
                            Insumos vinculados a esta composição:
                        </span>
                        <span class="text-[10px] text-slate-400">Clique em Congelar para desativar ou Inserir para reativar o insumo na CPU</span>
                    </div>
                    <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="text-[9.5px] uppercase font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                                    <th class="py-2 px-2.5 text-center w-16">Tipo</th>
                                    <th class="py-2 px-2.5 w-20">Código</th>
                                    <th class="py-2 px-2.5">Descrição do Insumo</th>
                                    <th class="py-2 px-2 text-center w-12">Und</th>
                                    <th class="py-2 px-2 text-right w-20">Coeficiente</th>
                                    <th class="py-2 px-2 text-right w-24">Preço Unit.</th>
                                    <th class="py-2 px-2 text-right w-24">Custo Total</th>
                                    <th class="py-2 px-2 text-center w-28">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${insumos.map((ins, iIdx) => {
                                    const isCongelado = (ins.ativo === false);
                                    const totalInsumo = isCongelado ? 0 : ((ins.coeficiente || 0) * (ins.precoUnitario || 0));
                                    let badgeCor = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                                    if (ins.tipo === 'MO') badgeCor = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
                                    else if (ins.tipo === 'MAT') badgeCor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
                                    else if (ins.tipo === 'EQ') badgeCor = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
                                    else if (ins.tipo === 'COMP') badgeCor = 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300';

                                    return `
                                    <tr class="border-b border-slate-100/60 dark:border-slate-800/40 transition-colors ${isCongelado ? 'opacity-40 line-through bg-slate-100/50 dark:bg-slate-800/30 text-slate-400 select-none' : 'hover:bg-slate-50/40 dark:hover:bg-slate-800/20'}">
                                        <td class="py-2 px-2.5 text-center">
                                            <span class="px-1.5 py-0.5 rounded text-[8.5px] font-extrabold ${badgeCor}">${ins.tipo || 'MAT'}</span>
                                        </td>
                                        <td class="py-2 px-2.5 font-mono text-slate-400 text-[10.5px]">${ins.codigo}</td>
                                        <td class="py-2 px-2.5 font-medium text-slate-700 dark:text-slate-300">${ins.descricao}</td>
                                        <td class="py-2 px-2 text-center uppercase font-bold text-slate-400 text-[10px]">${ins.unidade}</td>
                                        <td class="py-2 px-2 text-right font-mono font-semibold">${(ins.coeficiente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                                        <td class="py-2 px-2 text-right font-mono text-slate-500">R$ ${(ins.precoUnitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td class="py-2 px-2 text-right font-mono font-bold ${isCongelado ? 'text-slate-400' : 'text-slate-800 dark:text-slate-200'}">R$ ${totalInsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td class="py-2 px-2 text-center" onclick="event.stopPropagation()">
                                            ${isCongelado ? `
                                                <button type="button" onclick="toggleCongelarInsumoSelecao('${c.id}', ${iIdx})" class="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs" title="Inserir / Descongelar este insumo na composição">
                                                    <span class="material-symbols-outlined text-[13px]">add_circle</span> Inserir
                                                </button>
                                            ` : `
                                                <button type="button" onclick="toggleCongelarInsumoSelecao('${c.id}', ${iIdx})" class="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 hover:bg-rose-100 font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs" title="Excluir / Congelar este insumo na composição">
                                                    <span class="material-symbols-outlined text-[13px]">ac_unit</span> Congelar
                                                </button>
                                            `}
                                        </td>
                                    </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                ` : ''}
            </div>`;
        }).join('');
    }

    window.inserirCpuNaEtapa = function(cpuId, etapaId) {
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!orc) return;

        const cpus = orc.cpus || obterBancoCpusLocal();
        const cpu = cpus.find(c => c.id === cpuId);
        if (!cpu) {
            alert('Composição não encontrada!');
            return;
        }

        const etp = orc.etapas.find(e => e.id === etapaId) || orc.etapas[0];
        if (!etp) return;

        const qtdInput = document.getElementById(`input-qtd-cpu-${cpuId}`);
        const qtd = qtdInput ? (parseFloat(qtdInput.value) || 1) : 1;

        etp.itens.push({
            id: 'it_cpu_' + Date.now(),
            itemNum: `${etp.codigo}.${etp.itens.length + 1}`,
            fonte: 'CPU',
            codigo: cpu.codigo,
            descricao: cpu.descricao,
            unidade: (cpu.unidade || 'UN').toUpperCase(),
            quantidade: qtd,
            precoUnitarioSemBdi: cpu.custoUnitarioDireto || 0,
            cpuId: cpu.id,
            itensCpu: JSON.parse(JSON.stringify(cpu.itens || []))
        });

        fecharModalSelecaoCpu();
        salvarOrcamentoLocalmente();
        renderOrcamentoModal();
    };

    // ==========================================
    // EDITOR / CONSTRUTOR DE CPU
    // ==========================================
    window.abrirEditorCpu = function(cpuId = null, etapaOrigemId = null) {
        if (etapaOrigemId) window.GeoOrcamento._etapaCpuOrigemId = etapaOrigemId;
        const modal = document.getElementById('modal-editor-cpu');
        if (!modal) return;

        const orc = window.GeoOrcamento.orcamentoAtual;
        const cpus = orc ? (orc.cpus || obterBancoCpusLocal()) : obterBancoCpusLocal();

        let cpu = null;
        if (cpuId) {
            cpu = JSON.parse(JSON.stringify(cpus.find(c => c.id === cpuId) || null));
        }

        if (!cpu) {
            const nextNum = (cpus.length + 1).toString().padStart(2, '0');
            cpu = {
                id: 'cpu_' + Date.now(),
                codigo: `CPU-${nextNum}`,
                descricao: '',
                unidade: 'M²',
                categoria: 'SERVIÇOS GERAIS',
                origem: 'MUNICIPAL',
                itens: []
            };
        }

        window.GeoOrcamento._editorCpuAtual = cpu;

        // Preencher formulário
        const tit = document.getElementById('modal-editor-cpu-titulo');
        if (tit) tit.textContent = cpuId ? `Editar Composição [${cpu.codigo}]` : 'Criar Nova Composição Própria (CPU)';

        const codInp = document.getElementById('cpu-form-codigo');
        if (codInp) codInp.value = cpu.codigo;

        const undSel = document.getElementById('cpu-form-unidade');
        if (undSel) undSel.value = cpu.unidade;

        const catInp = document.getElementById('cpu-form-categoria');
        if (catInp) catInp.value = cpu.categoria || '';

        const descInp = document.getElementById('cpu-form-descricao');
        if (descInp) descInp.value = cpu.descricao;

        const bdiLabel = document.getElementById('cpu-bdi-taxa-label');
        const bdi = orc ? (orc.bdiPercentual || 0.248) : 0.248;
        if (bdiLabel) bdiLabel.textContent = `${(bdi * 100).toFixed(2)}%`;

        renderTabelaEditorCpu();
        recalcularTotaisEditorCpu();

        modal.classList.remove('hidden');
    };

    window.fecharEditorCpu = function() {
        const modal = document.getElementById('modal-editor-cpu');
        if (modal) modal.classList.add('hidden');
        window.GeoOrcamento._editorCpuAtual = null;
    };

    function renderTabelaEditorCpu() {
        const tbody = document.getElementById('tabela-insumos-editor-cpu-body');
        if (!tbody) return;

        const cpu = window.GeoOrcamento._editorCpuAtual;
        if (!cpu || !cpu.itens || cpu.itens.length === 0) {
            tbody.innerHTML = `
            <tr>
                <td colspan="8" class="py-6 text-center text-xs text-slate-400 italic">
                    Nenhum insumo adicionado nesta CPU ainda. Busque um insumo no SINAPI acima ou adicione uma cotação!
                </td>
            </tr>`;
            return;
        }

        tbody.innerHTML = cpu.itens.map((it, idx) => {
            const isCongelado = (it.ativo === false);
            const custoTotal = isCongelado ? 0 : ((it.coeficiente || 0) * (it.precoUnitario || 0));
            it.custoTotal = custoTotal;

            let badgeTipoClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
            let labelTipo = it.tipo || 'MAT';
            if (it.tipo === 'MO') {
                badgeTipoClass = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
                labelTipo = 'MÃO DE OBRA';
            } else if (it.tipo === 'MAT') {
                badgeTipoClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
                labelTipo = 'MATERIAL';
            } else if (it.tipo === 'EQ') {
                badgeTipoClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
                labelTipo = 'EQUIPAMENTO';
            } else if (it.tipo === 'COMP') {
                badgeTipoClass = 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300';
                labelTipo = 'SERVIÇO AUX.';
            }

            return `
            <tr class="border-b border-slate-100 dark:border-slate-800 text-xs transition-colors ${isCongelado ? 'opacity-40 line-through bg-slate-100/50 dark:bg-slate-800/40 text-slate-400 select-none' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'}">
                <td class="py-2.5 px-2.5 text-center">
                    <span class="px-1.5 py-0.5 rounded text-[9.5px] font-extrabold ${badgeTipoClass}">${labelTipo}</span>
                </td>
                <td class="py-2.5 px-2.5 font-mono text-slate-400 text-[11px]">${it.codigo}</td>
                <td class="py-2.5 px-3">
                    <div class="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap">
                        <span>${it.descricao}</span>
                        ${isCongelado ? `
                            <span class="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 inline-flex items-center gap-0.5 no-underline">
                                <span class="material-symbols-outlined text-[11px]">ac_unit</span> Congelado (Saiu da CPU)
                            </span>
                        ` : ''}
                        ${it.origem === 'COTAÇÃO' ? `
                            <button type="button" onclick="abrirModalCotacaoInsumo(${idx})" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 hover:bg-amber-200 cursor-pointer transition-colors shadow-2xs" title="Clique para editar cotações, visualizar empresas, fotos e arquivos">
                                <span class="material-symbols-outlined text-[13px]">attach_file</span>
                                ${(it.cotacao_dados && it.cotacao_dados.fornecedores) ? it.cotacao_dados.fornecedores.filter(f => f.preco > 0).length : 1} Cotações (Ver Dossiê/Fotos)
                            </button>
                        ` : ''}
                    </div>
                    <div class="text-[10px] text-slate-400 mt-0.5">
                        ${it.origem === 'COTAÇÃO' ? (it.cotacao_dados && it.cotacao_dados.marca ? `Ref: ${it.cotacao_dados.marca} • Método: ${it.cotacao_dados.metodoCalculo || 'MEDIANA'}` : 'Cotação de Mercado Local (Lei 14.133/2021)') : 'Tabela Oficial SINAPI'}
                    </div>
                </td>
                <td class="py-2.5 px-2 text-center uppercase font-bold text-slate-500">${it.unidade}</td>
                <td class="py-2.5 px-2.5 text-right">
                    <input type="number" min="0" step="any" value="${it.coeficiente}" onchange="atualizarItemEditorCpu(${idx}, 'coeficiente', this.value)" class="w-20 px-1.5 py-1 text-right text-xs font-mono font-bold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-primary ${isCongelado ? 'opacity-50' : ''}">
                </td>
                <td class="py-2.5 px-2.5 text-right">
                    <input type="number" min="0" step="any" value="${it.precoUnitario}" onchange="atualizarItemEditorCpu(${idx}, 'precoUnitario', this.value)" class="w-24 px-1.5 py-1 text-right text-xs font-mono font-bold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-primary ${isCongelado ? 'opacity-50' : ''}">
                </td>
                <td class="py-2.5 px-2.5 text-right font-mono font-extrabold ${isCongelado ? 'text-slate-400' : 'text-slate-800 dark:text-slate-100'}">
                    R$ ${custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td class="py-2.5 px-2 text-center">
                    <div class="flex items-center justify-center gap-1">
                        ${isCongelado ? `
                            <button type="button" onclick="toggleCongelarInsumoEditorCpu(${idx})" class="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 cursor-pointer transition-colors" title="Descongelar insumo (reintegrar ao cálculo da CPU)">
                                <span class="material-symbols-outlined text-[17px]">add_circle</span>
                            </button>
                        ` : `
                            <button type="button" onclick="toggleCongelarInsumoEditorCpu(${idx})" class="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-500 cursor-pointer transition-colors" title="Congelar insumo (remover do custo da CPU sem excluir)">
                                <span class="material-symbols-outlined text-[17px]">ac_unit</span>
                            </button>
                        `}
                        <button type="button" onclick="removerInsumoEditorCpu(${idx})" class="p-1 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-600 cursor-pointer transition-colors" title="Excluir insumo permanentemente">
                            <span class="material-symbols-outlined text-[17px]">delete</span>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    window.toggleCongelarInsumoEditorCpu = function(idx) {
        const cpu = window.GeoOrcamento._editorCpuAtual;
        if (!cpu || !cpu.itens || !cpu.itens[idx]) return;

        cpu.itens[idx].ativo = (cpu.itens[idx].ativo === false ? true : false);
        renderTabelaEditorCpu();
        recalcularTotaisEditorCpu();
    };

    window.atualizarItemEditorCpu = function(idx, campo, val) {
        const cpu = window.GeoOrcamento._editorCpuAtual;
        if (!cpu || !cpu.itens || !cpu.itens[idx]) return;

        cpu.itens[idx][campo] = parseFloat(val) || 0;
        renderTabelaEditorCpu();
        recalcularTotaisEditorCpu();
    };

    window.removerInsumoEditorCpu = function(idx) {
        const cpu = window.GeoOrcamento._editorCpuAtual;
        if (!cpu || !cpu.itens) return;

        cpu.itens.splice(idx, 1);
        renderTabelaEditorCpu();
        recalcularTotaisEditorCpu();
    };

    // Redirecionamento para a nova janela de Cotação de Mercado
    window.adicionarInsumoManualEditorCpu = function() {
        window.abrirModalCotacaoInsumo(null);
    };

    // ==========================================
    // MÓDULO DE PESQUISA DE PREÇOS / COTAÇÃO DE MERCADO (LEI 14.133/2021)
    // ==========================================
    window.GeoOrcamento._cotacaoInsumoAtual = null;
    window.GeoOrcamento._cotacaoEditandoItemIndex = null;

    function criarEstruturaNovaCotacao(codigo, descricao, unidade, tipo, precoInicial = 0, coef = 1.0) {
        const hoje = new Date().toISOString().split('T')[0];
        return {
            codigo: codigo || 'COT-01',
            descricao: descricao || '',
            unidade: unidade || 'UN',
            tipo: tipo || 'MAT',
            coeficiente: coef || 1.0,
            marca: '',
            metodoCalculo: 'MEDIANA',
            precoReferencia: precoInicial || 0,
            fornecedores: [
                {
                    id: 'forn_' + Date.now() + '_1',
                    empresa: '',
                    cnpj: '',
                    endereco: '',
                    cidadeUf: '',
                    telefone: '',
                    email: '',
                    contato: '',
                    preco: precoInicial || 0,
                    dataCotacao: hoje,
                    validadeDias: 30,
                    frete: 'CIF',
                    linkSite: '',
                    arquivoNome: '',
                    arquivoTipo: '',
                    arquivoTamanho: '',
                    arquivoDataUrl: ''
                },
                {
                    id: 'forn_' + Date.now() + '_2',
                    empresa: '',
                    cnpj: '',
                    endereco: '',
                    cidadeUf: '',
                    telefone: '',
                    email: '',
                    contato: '',
                    preco: 0,
                    dataCotacao: hoje,
                    validadeDias: 30,
                    frete: 'CIF',
                    linkSite: '',
                    arquivoNome: '',
                    arquivoTipo: '',
                    arquivoTamanho: '',
                    arquivoDataUrl: ''
                },
                {
                    id: 'forn_' + Date.now() + '_3',
                    empresa: '',
                    cnpj: '',
                    endereco: '',
                    cidadeUf: '',
                    telefone: '',
                    email: '',
                    contato: '',
                    preco: 0,
                    dataCotacao: hoje,
                    validadeDias: 30,
                    frete: 'CIF',
                    linkSite: '',
                    arquivoNome: '',
                    arquivoTipo: '',
                    arquivoTamanho: '',
                    arquivoDataUrl: ''
                }
            ]
        };
    }

    window.abrirModalCotacaoInsumo = function(itemIndex = null) {
        window.GeoOrcamento._cotacaoEditandoItemIndex = itemIndex;
        const modal = document.getElementById('modal-cotacao-insumo');
        if (!modal) return;

        const cpu = window.GeoOrcamento._editorCpuAtual;
        let cotacao = null;

        if (itemIndex !== null && cpu && Array.isArray(cpu.itens) && cpu.itens[itemIndex] && cpu.itens[itemIndex].cotacao_dados) {
            cotacao = JSON.parse(JSON.stringify(cpu.itens[itemIndex].cotacao_dados));
        } else if (itemIndex !== null && cpu && Array.isArray(cpu.itens) && cpu.itens[itemIndex]) {
            const it = cpu.itens[itemIndex];
            cotacao = criarEstruturaNovaCotacao(it.codigo, it.descricao, it.unidade, it.tipo, it.precoUnitario, it.coeficiente);
        } else {
            const proximoNumero = ((cpu && Array.isArray(cpu.itens) ? cpu.itens.filter(i => i && i.origem === 'COTAÇÃO').length : 0) + 1).toString().padStart(2, '0');
            cotacao = criarEstruturaNovaCotacao(`COT-${proximoNumero}`, '', 'UN', 'MAT', 0, 1.0);
        }

        window.GeoOrcamento._cotacaoInsumoAtual = cotacao;

        const codInp = document.getElementById('cot-insumo-codigo');
        const tipoSel = document.getElementById('cot-insumo-tipo');
        const undInp = document.getElementById('cot-insumo-unidade');
        const coefInp = document.getElementById('cot-insumo-coeficiente');
        const marcaInp = document.getElementById('cot-insumo-marca');
        const descInp = document.getElementById('cot-insumo-descricao');
        const metSel = document.getElementById('cot-metodo-calculo');

        if (codInp) codInp.value = cotacao.codigo || 'COT-01';
        if (tipoSel) tipoSel.value = cotacao.tipo || 'MAT';
        if (undInp) undInp.value = cotacao.unidade || 'UN';
        if (coefInp) coefInp.value = cotacao.coeficiente || 1.0;
        if (marcaInp) marcaInp.value = cotacao.marca || '';
        if (descInp) descInp.value = cotacao.descricao || '';
        if (metSel) metSel.value = cotacao.metodoCalculo || 'MEDIANA';

        renderCardsCotacoesFornecedores();
        recalcularPrecoReferenciaCotacao();

        modal.classList.remove('hidden');
    };

    window.fecharModalCotacaoInsumo = function() {
        const modal = document.getElementById('modal-cotacao-insumo');
        if (modal) modal.classList.add('hidden');
        window.GeoOrcamento._cotacaoInsumoAtual = null;
        window.GeoOrcamento._cotacaoEditandoItemIndex = null;
    };

    window.adicionarNovaCotacaoFornecedor = function() {
        const cot = window.GeoOrcamento._cotacaoInsumoAtual;
        if (!cot) return;

        cot.fornecedores.push({
            id: 'forn_' + Date.now(),
            empresa: '',
            cnpj: '',
            endereco: '',
            cidadeUf: '',
            telefone: '',
            email: '',
            contato: '',
            preco: 0,
            dataCotacao: new Date().toISOString().split('T')[0],
            validadeDias: 30,
            frete: 'CIF',
            linkSite: '',
            arquivoNome: '',
            arquivoTipo: '',
            arquivoTamanho: '',
            arquivoDataUrl: ''
        });

        renderCardsCotacoesFornecedores();
        recalcularPrecoReferenciaCotacao();
    };

    window.removerCotacaoFornecedor = function(idx) {
        const cot = window.GeoOrcamento._cotacaoInsumoAtual;
        if (!cot || !cot.fornecedores) return;

        if (cot.fornecedores.length <= 1) {
            alert('É necessário manter ao menos 1 fornecedor no formulário.');
            return;
        }

        cot.fornecedores.splice(idx, 1);
        renderCardsCotacoesFornecedores();
        recalcularPrecoReferenciaCotacao();
    };

    window.atualizarCotacaoFornecedor = function(idx, campo, val) {
        const cot = window.GeoOrcamento._cotacaoInsumoAtual;
        if (!cot || !cot.fornecedores || !cot.fornecedores[idx]) return;

        if (campo === 'preco') {
            cot.fornecedores[idx][campo] = parseFloat(val) || 0;
            recalcularPrecoReferenciaCotacao();
        } else if (campo === 'validadeDias') {
            cot.fornecedores[idx][campo] = parseInt(val) || 30;
        } else {
            cot.fornecedores[idx][campo] = val;
        }
    };

    window.handleUploadArquivoCotacao = function(idx, inputEl) {
        const file = inputEl.files && inputEl.files[0];
        if (!file) return;

        if (file.size > 8 * 1024 * 1024) {
            alert('O arquivo selecionado excede o limite máximo de 8 MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const cot = window.GeoOrcamento._cotacaoInsumoAtual;
            if (cot && cot.fornecedores && cot.fornecedores[idx]) {
                const f = cot.fornecedores[idx];
                f.arquivoNome = file.name;
                f.arquivoTipo = file.type;
                f.arquivoTamanho = (file.size / 1024).toFixed(1) + ' KB';
                f.arquivoDataUrl = e.target.result;
                renderCardsCotacoesFornecedores();
            }
        };
        reader.readAsDataURL(file);
    };

    window.removerArquivoCotacao = function(idx) {
        const cot = window.GeoOrcamento._cotacaoInsumoAtual;
        if (cot && cot.fornecedores && cot.fornecedores[idx]) {
            const f = cot.fornecedores[idx];
            f.arquivoNome = '';
            f.arquivoTipo = '';
            f.arquivoTamanho = '';
            f.arquivoDataUrl = '';
            renderCardsCotacoesFornecedores();
        }
    };

    window.visualizarAnexoCotacao = function(idx) {
        const cot = window.GeoOrcamento._cotacaoInsumoAtual;
        if (!cot || !cot.fornecedores || !cot.fornecedores[idx]) return;
        const f = cot.fornecedores[idx];
        if (!f.arquivoDataUrl) {
            alert('Nenhum arquivo ou foto anexado para este fornecedor.');
            return;
        }

        const w = window.open('');
        if (f.arquivoTipo.includes('image')) {
            w.document.write(`
                <html>
                <head><title>${f.arquivoNome} - Cotação ${f.empresa || 'Empresa'}</title></head>
                <body style="margin:0; background:#111; display:flex; align-items:center; justify-content:center; min-height:100vh;">
                    <img src="${f.arquivoDataUrl}" style="max-width:98%; max-height:98vh; object-fit:contain; box-shadow:0 0 30px rgba(0,0,0,0.8); border-radius:8px;">
                </body>
                </html>
            `);
        } else {
            w.document.write(`
                <html>
                <head><title>${f.arquivoNome}</title></head>
                <body style="margin:0; height:100vh;">
                    <iframe src="${f.arquivoDataUrl}" frameborder="0" style="width:100%; height:100%;"></iframe>
                </body>
                </html>
            `);
        }
    };

    function renderCardsCotacoesFornecedores() {
        const container = document.getElementById('container-cotacoes-fornecedores');
        if (!container) return;

        const cot = window.GeoOrcamento._cotacaoInsumoAtual;
        if (!cot || !cot.fornecedores) return;

        container.innerHTML = cot.fornecedores.map((f, idx) => {
            const num = idx + 1;
            const temAnexo = !!f.arquivoDataUrl;
            const isImagem = f.arquivoTipo && f.arquivoTipo.includes('image');

            return `
            <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 space-y-3 relative group transition-all hover:border-amber-300 dark:hover:border-amber-700/60 shadow-xs">
                <!-- Cabeçalho do Card da Empresa -->
                <div class="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-2.5">
                    <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold text-xs flex items-center justify-center font-mono">
                            #${num}
                        </span>
                        <span class="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                            ${f.empresa ? f.empresa : `Fornecedor / Proposta ${num}`}
                        </span>
                        ${f.preco > 0 ? '<span class="px-2 py-0.5 rounded-full text-[9.5px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Válido</span>' : '<span class="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400">Pendente de Preço</span>'}
                    </div>
                    <div class="flex items-center gap-2">
                        ${cot.fornecedores.length > 1 ? `
                            <button type="button" onclick="removerCotacaoFornecedor(${idx})" class="p-1 text-slate-400 hover:text-rose-500 transition-colors" title="Excluir este fornecedor">
                                <span class="material-symbols-outlined text-[17px]">delete</span>
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Dados Cadastrais da Empresa -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Razão Social / Nome Fantasia *</label>
                        <input type="text" value="${f.empresa || ''}" onchange="atualizarCotacaoFornecedor(${idx}, 'empresa', this.value)" placeholder="Ex: Comercial Elétrica Silva Ltda" class="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-amber-500">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">CNPJ do Fornecedor</label>
                        <input type="text" value="${f.cnpj || ''}" onchange="atualizarCotacaoFornecedor(${idx}, 'cnpj', this.value)" placeholder="00.000.000/0001-00" class="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-amber-500">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Cidade / UF</label>
                        <input type="text" value="${f.cidadeUf || ''}" onchange="atualizarCotacaoFornecedor(${idx}, 'cidadeUf', this.value)" placeholder="Ex: João Pessoa / PB" class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-amber-500">
                    </div>
                    <div class="sm:col-span-2">
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Endereço Completo</label>
                        <input type="text" value="${f.endereco || ''}" onchange="atualizarCotacaoFornecedor(${idx}, 'endereco', this.value)" placeholder="Rua, número, bairro..." class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-amber-500">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Telefone / WhatsApp</label>
                        <input type="text" value="${f.telefone || ''}" onchange="atualizarCotacaoFornecedor(${idx}, 'telefone', this.value)" placeholder="(83) 98888-0000" class="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-amber-500">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">E-mail Comercial</label>
                        <input type="email" value="${f.email || ''}" onchange="atualizarCotacaoFornecedor(${idx}, 'email', this.value)" placeholder="vendas@empresa.com.br" class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-amber-500">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Responsável / Vendedor</label>
                        <input type="text" value="${f.contato || ''}" onchange="atualizarCotacaoFornecedor(${idx}, 'contato', this.value)" placeholder="Nome de quem atendeu" class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-amber-500">
                    </div>
                    <div>
                        <label class="block text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 mb-1">Preço Unitário Cotado (R$) *</label>
                        <input type="number" min="0" step="any" value="${f.preco || ''}" onchange="atualizarCotacaoFornecedor(${idx}, 'preco', this.value)" placeholder="0.00" class="w-full px-2.5 py-1.5 text-sm font-black font-mono text-emerald-700 dark:text-emerald-300 rounded-lg border-2 border-emerald-400 dark:border-emerald-600 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-emerald-500">
                    </div>
                </div>

                <!-- Condições Comerciais e Prazos -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Data da Cotação</label>
                        <input type="date" value="${f.dataCotacao || ''}" onchange="atualizarCotacaoFornecedor(${idx}, 'dataCotacao', this.value)" class="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Validade da Proposta (Dias)</label>
                        <input type="number" min="1" value="${f.validadeDias || 30}" onchange="atualizarCotacaoFornecedor(${idx}, 'validadeDias', this.value)" class="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Condição do Frete</label>
                        <select onchange="atualizarCotacaoFornecedor(${idx}, 'frete', this.value)" class="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
                            <option value="CIF" ${f.frete === 'CIF' ? 'selected' : ''}>CIF (Entregue no local da obra)</option>
                            <option value="FOB" ${f.frete === 'FOB' ? 'selected' : ''}>FOB (Frete por conta do comprador)</option>
                        </select>
                    </div>
                </div>

                <!-- Links e Evidências Digitais -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Link / Site Visitado (URL do Produto ou Loja)</label>
                        <div class="flex items-center gap-1.5">
                            <input type="url" value="${f.linkSite || ''}" onchange="atualizarCotacaoFornecedor(${idx}, 'linkSite', this.value)" placeholder="https://loja.com.br/produto..." class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-primary">
                            ${f.linkSite ? `
                                <a href="${f.linkSite}" target="_blank" rel="noopener noreferrer" class="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300 hover:bg-sky-100 flex items-center justify-center shrink-0" title="Abrir link em nova aba">
                                    <span class="material-symbols-outlined text-[16px]">open_in_new</span>
                                </a>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Upload de Arquivo / Foto Comprobatória -->
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Arquivo da Proposta / Foto Comprobatória</label>
                        ${temAnexo ? `
                            <div class="flex items-center justify-between p-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 text-xs">
                                <div class="flex items-center gap-2 min-w-0">
                                    <span class="material-symbols-outlined text-emerald-600 text-[18px]">
                                        ${isImagem ? 'image' : 'picture_as_pdf'}
                                    </span>
                                    <div class="truncate">
                                        <div class="font-bold text-slate-800 dark:text-slate-100 truncate">${f.arquivoNome}</div>
                                        <div class="text-[10px] text-slate-400">${f.arquivoTamanho}</div>
                                    </div>
                                </div>
                                <div class="flex items-center gap-1 shrink-0">
                                    <button type="button" onclick="visualizarAnexoCotacao(${idx})" class="p-1 text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 cursor-pointer" title="Visualizar documento">
                                        <span class="material-symbols-outlined text-[17px]">visibility</span>
                                    </button>
                                    <button type="button" onclick="removerArquivoCotacao(${idx})" class="p-1 text-slate-400 hover:text-rose-500 cursor-pointer" title="Remover anexo">
                                        <span class="material-symbols-outlined text-[17px]">close</span>
                                    </button>
                                </div>
                            </div>
                        ` : `
                            <label class="flex items-center justify-center gap-1.5 p-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-400 bg-white dark:bg-slate-900 cursor-pointer text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
                                <span class="material-symbols-outlined text-[16px]">upload_file</span>
                                <span>Anexar Proposta (PDF ou Imagem)</span>
                                <input type="file" accept=".pdf,image/*" onchange="handleUploadArquivoCotacao(${idx}, this)" class="hidden">
                            </label>
                        `}
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    window.recalcularPrecoReferenciaCotacao = function() {
        const cot = window.GeoOrcamento._cotacaoInsumoAtual;
        if (!cot || !cot.fornecedores) return;

        const metSel = document.getElementById('cot-metodo-calculo');
        const metodo = metSel ? metSel.value : (cot.metodoCalculo || 'MEDIANA');
        cot.metodoCalculo = metodo;

        const precosValidos = cot.fornecedores.map(f => parseFloat(f.preco) || 0).filter(p => p > 0);
        const qtdValidos = precosValidos.length;

        let precoFinal = 0;
        let precoMin = 0;
        let precoMax = 0;

        if (qtdValidos > 0) {
            precoMin = Math.min(...precosValidos);
            precoMax = Math.max(...precosValidos);

            if (metodo === 'MENOR') {
                precoFinal = precoMin;
            } else if (metodo === 'MEDIA') {
                const soma = precosValidos.reduce((a, b) => a + b, 0);
                precoFinal = Math.round((soma / qtdValidos) * 100) / 100;
            } else {
                // MEDIANA (Padrão TCU)
                const ordenados = [...precosValidos].sort((a, b) => a - b);
                const meio = Math.floor(ordenados.length / 2);
                if (ordenados.length % 2 !== 0) {
                    precoFinal = ordenados[meio];
                } else {
                    precoFinal = Math.round(((ordenados[meio - 1] + ordenados[meio]) / 2) * 100) / 100;
                }
            }
        }

        cot.precoReferencia = precoFinal;

        const qtdEl = document.getElementById('cot-resumo-qtd');
        const minEl = document.getElementById('cot-resumo-min');
        const maxEl = document.getElementById('cot-resumo-max');
        const finalEl = document.getElementById('cot-resumo-preco-final');
        const avisoEl = document.getElementById('cot-resumo-aviso-lei');

        if (qtdEl) qtdEl.textContent = `${qtdValidos} / ${cot.fornecedores.length}`;
        if (minEl) minEl.textContent = `R$ ${precoMin.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (maxEl) maxEl.textContent = `R$ ${precoMax.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (finalEl) finalEl.textContent = `R$ ${precoFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (avisoEl) {
            if (qtdValidos >= 3) {
                avisoEl.textContent = '✓ Em conformidade com a Lei 14.133/2021 (3+ fontes)';
                avisoEl.className = 'text-[9.5px] text-emerald-600 font-bold block mt-0.5';
            } else {
                avisoEl.textContent = `Atenção: Apenas ${qtdValidos} cotações (mínimo legal: 3 fontes)`;
                avisoEl.className = 'text-[9.5px] text-amber-600 font-semibold block mt-0.5';
            }
        }
    };

    window.salvarCotacaoInsumoParaCpu = function() {
        const cot = window.GeoOrcamento._cotacaoInsumoAtual;
        const cpu = window.GeoOrcamento._editorCpuAtual;
        if (!cot || !cpu) return;

        const codInp = document.getElementById('cot-insumo-codigo');
        const tipoSel = document.getElementById('cot-insumo-tipo');
        const undInp = document.getElementById('cot-insumo-unidade');
        const coefInp = document.getElementById('cot-insumo-coeficiente');
        const marcaInp = document.getElementById('cot-insumo-marca');
        const descInp = document.getElementById('cot-insumo-descricao');

        if (!descInp || !descInp.value.trim()) {
            alert('Por favor, informe a descrição técnica do insumo/serviço cotado.');
            if (descInp) descInp.focus();
            return;
        }

        recalcularPrecoReferenciaCotacao();

        if (cot.precoReferencia <= 0) {
            alert('Por favor, preencha o preço ofertado em ao menos uma das empresas cotadas.');
            return;
        }

        const precosValidos = cot.fornecedores.filter(f => f.preco > 0).length;
        if (precosValidos < 3) {
            const prosseguir = confirm(`Atenção: Você preencheu apenas ${precosValidos} cotação(ões).\nO Art. 23 da Lei 14.133/2021 recomenda no mínimo 3 cotações de fornecedores.\n\nDeseja salvar mesmo assim?`);
            if (!prosseguir) return;
        }

        cot.codigo = (codInp ? codInp.value.trim() : 'COT-01') || 'COT-01';
        cot.tipo = (tipoSel ? tipoSel.value : 'MAT') || 'MAT';
        cot.unidade = (undInp ? undInp.value.trim().toUpperCase() : 'UN') || 'UN';
        cot.coeficiente = (coefInp ? parseFloat(coefInp.value) : 1.0) || 1.0;
        cot.marca = (marcaInp ? marcaInp.value.trim() : '') || '';
        cot.descricao = descInp.value.trim().toUpperCase();

        const novoItemCpu = {
            tipo: cot.tipo,
            codigo: cot.codigo,
            descricao: cot.descricao,
            unidade: cot.unidade,
            coeficiente: cot.coeficiente,
            precoUnitario: cot.precoReferencia,
            custoTotal: cot.coeficiente * cot.precoReferencia,
            origem: 'COTAÇÃO',
            cotacao_dados: JSON.parse(JSON.stringify(cot))
        };

        const editIndex = window.GeoOrcamento._cotacaoEditandoItemIndex;
        if (editIndex !== null && cpu.itens && cpu.itens[editIndex]) {
            cpu.itens[editIndex] = novoItemCpu;
        } else {
            cpu.itens.push(novoItemCpu);
        }

        fecharModalCotacaoInsumo();
        renderTabelaEditorCpu();
        recalcularTotaisEditorCpu();

        alert(`Insumo de Cotação "${cot.codigo}" inserido com sucesso na CPU!\nPreço de Referência Adotado: R$ ${cot.precoReferencia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`);
    };

    // Autocomplete SINAPI para inserção de insumo na CPU
    let cpuSinapiDebounce = null;
    window.buscarInsumoSinapiCpuAutocomplete = function(query) {
        clearTimeout(cpuSinapiDebounce);
        const dropdown = document.getElementById('autocomplete-results-insumo-cpu');
        if (!dropdown) return;

        const qClean = (query || '').trim();
        if (qClean.length < 2) {
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
            return;
        }

        cpuSinapiDebounce = setTimeout(async () => {
            const catalogo = await window.carregarCatalogoSinapi();
            if (!catalogo || catalogo.length === 0) return;

            // Pré-carrega o analítico se ainda não estiver carregado
            if (!window.GeoOrcamento._analiticoSinapiCache) {
                window.obterAnaliticoSinapi().catch(() => {});
            }
            const analiticoMap = window.GeoOrcamento._analiticoSinapiCache || {};

            const orc = window.GeoOrcamento.orcamentoAtual;
            const isDeson = (orc && orc.regimeDesoneracao === 'DESONERADO');

            const qLower = qClean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const tokens = qLower.split(/\s+/).filter(t => t.length > 0);

            const filtered = [];
            for (let i = 0; i < catalogo.length; i++) {
                const item = catalogo[i];
                const cod = (item.codigo || '').toString().toLowerCase();
                const desc = (item.descricao || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const matches = tokens.every(tok => cod.includes(tok) || desc.includes(tok));
                if (matches) {
                    filtered.push(item);
                    if (filtered.length >= 60) break;
                }
            }

            if (filtered.length === 0) {
                dropdown.innerHTML = '<div class="p-3 text-xs text-slate-400 italic text-center">Nenhum item SINAPI encontrado.</div>';
                dropdown.classList.remove('hidden');
                return;
            }

            // Ordena colocando primeiro os itens com preço oficial válido (> 0)
            filtered.sort((a, b) => {
                const pA = isDeson ? (a.preco_desonerado ?? a.preco_nao_desonerado ?? 0) : (a.preco_nao_desonerado ?? a.preco_desonerado ?? 0);
                const pB = isDeson ? (b.preco_desonerado ?? b.preco_nao_desonerado ?? 0) : (b.preco_nao_desonerado ?? b.preco_desonerado ?? 0);
                if (pA > 0 && pB === 0) return -1;
                if (pA === 0 && pB > 0) return 1;
                return 0;
            });

            dropdown.innerHTML = filtered.slice(0, 30).map(item => {
                const precoReal = isDeson 
                    ? (item.preco_desonerado ?? item.preco_nao_desonerado ?? 0)
                    : (item.preco_nao_desonerado ?? item.preco_desonerado ?? 0);

                const precoFormatado = precoReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const isComposicao = (item.tipo === 'COMPOSICAO' || (item.codigo && String(item.codigo).length >= 5));
                const temAnalitico = Boolean(analiticoMap[String(item.codigo)] && analiticoMap[String(item.codigo)].length > 0);
                const itemEscaped = encodeURIComponent(JSON.stringify(item));

                return `
                <div onclick="selecionarInsumoSinapiParaCpu('${itemEscaped}')" class="p-2.5 hover:bg-sky-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between gap-3 text-xs transition-colors group">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${isComposicao ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'}">${item.codigo}</span>
                        <div class="min-w-0">
                            <div class="truncate font-medium text-slate-700 dark:text-slate-200">${item.descricao}</div>
                            ${temAnalitico ? `<div class="text-[9.5px] text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">account_tree</span> Composição Analítica (${analiticoMap[String(item.codigo)].length} insumos da Caixa)</div>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="text-[10px] font-bold text-slate-400 uppercase">${item.unidade || 'UN'}</span>
                        <span class="font-bold ${precoReal > 0 ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'} font-mono">R$ ${precoFormatado}</span>
                    </div>
                </div>`;
            }).join('');

            dropdown.classList.remove('hidden');
        }, 150);
    };

    window.selecionarInsumoSinapiParaCpu = async function(itemEscaped) {
        try {
            const item = JSON.parse(decodeURIComponent(itemEscaped));
            const cpu = window.GeoOrcamento._editorCpuAtual;
            if (!cpu) return;

            const orc = window.GeoOrcamento.orcamentoAtual;
            const isDeson = (orc && orc.regimeDesoneracao === 'DESONERADO');
            const precoReal = isDeson 
                ? (item.preco_desonerado ?? item.preco_nao_desonerado ?? 0)
                : (item.preco_nao_desonerado ?? item.preco_desonerado ?? 0);

            // Carrega analítico do SINAPI para verificar se este item possui insumos detalhados
            if (!window.GeoOrcamento._analiticoSinapiCache) {
                await window.obterAnaliticoSinapi();
            }
            const analiticoMap = window.GeoOrcamento._analiticoSinapiCache || {};
            const analiticoItens = analiticoMap[String(item.codigo)];

            // Se for uma composição com insumos analíticos cadastrados no SINAPI
            if (analiticoItens && Array.isArray(analiticoItens) && analiticoItens.length > 0) {
                const catalogo = window.GeoOrcamento.catalogoSinapi || [];

                // Se a CPU atual estiver sem descrição ou for recém-aberta, herda os metadados da composição selecionada
                const descInp = document.getElementById('cpu-form-descricao');
                const undSel = document.getElementById('cpu-form-unidade');
                const catInp = document.getElementById('cpu-form-categoria');

                if (!cpu.descricao || cpu.descricao === '' || (descInp && !descInp.value.trim())) {
                    cpu.descricao = item.descricao;
                    cpu.unidade = (item.unidade || 'UN').toUpperCase();
                    cpu.categoria = 'COMPOSIÇÃO BASE SINAPI';
                    if (descInp) descInp.value = cpu.descricao;
                    if (undSel) undSel.value = cpu.unidade;
                    if (catInp) catInp.value = cpu.categoria;
                }

                // Importa todos os insumos analíticos da composição para que o usuário selecione quais ficam e quais saem (congelando/descongelando)
                const insumosAdicionados = analiticoItens.map(sub => {
                    const cat = catalogo.find(c => String(c.codigo) === String(sub.codigo));
                    let p = 0;
                    if (cat) {
                        p = isDeson 
                            ? (cat.preco_desonerado ?? cat.preco_nao_desonerado ?? 0)
                            : (cat.preco_nao_desonerado ?? cat.preco_desonerado ?? 0);
                    }
                    const coef = parseFloat(sub.coeficiente) || 1.0;
                    return {
                        tipo: sub.tipo === 'COMPOSICAO' ? 'COMP' : (sub.unidade === 'H' ? 'MO' : (sub.unidade === 'CHP' || sub.unidade === 'CHI' ? 'EQ' : 'MAT')),
                        codigo: sub.codigo,
                        descricao: sub.descricao,
                        unidade: sub.unidade || 'UN',
                        coeficiente: coef,
                        precoUnitario: p,
                        custoTotal: coef * p,
                        origem: 'SINAPI',
                        ativo: true
                    };
                });

                cpu.itens = (cpu.itens || []).concat(insumosAdicionados);
            } else {
                // Insumo individual simples (Mão de Obra, Material, Equipamento)
                let tipoDetectado = 'MAT';
                const descUpper = (item.descricao || '').toUpperCase();
                if (descUpper.includes('HORISTA') || descUpper.includes('ENCARGOS COMPLEMENTARES') || descUpper.includes('PEDREIRO') || descUpper.includes('SERVENTE') || descUpper.includes('ELETRICISTA') || descUpper.includes('PINTOR') || descUpper.includes('CARPINTEIRO') || item.unidade === 'H') {
                    tipoDetectado = 'MO';
                } else if (descUpper.includes('CAMINHAO') || descUpper.includes('BETONEIRA') || descUpper.includes('RETROESCAVADEIRA') || descUpper.includes('COMPACTADOR') || item.unidade === 'CHP' || item.unidade === 'CHI') {
                    tipoDetectado = 'EQ';
                } else if (item.tipo === 'COMPOSICAO') {
                    tipoDetectado = 'COMP';
                }

                cpu.itens.push({
                    tipo: tipoDetectado,
                    codigo: item.codigo,
                    descricao: item.descricao,
                    unidade: item.unidade || 'UN',
                    coeficiente: 1.0,
                    precoUnitario: precoReal,
                    custoTotal: precoReal,
                    origem: 'SINAPI',
                    ativo: true
                });
            }

            const searchInp = document.getElementById('input-search-insumo-cpu');
            const dropdown = document.getElementById('autocomplete-results-insumo-cpu');
            if (searchInp) searchInp.value = '';
            if (dropdown) dropdown.classList.add('hidden');

            renderTabelaEditorCpu();
            recalcularTotaisEditorCpu();
        } catch(e) {
            console.error('[CPU] Erro ao selecionar insumo:', e);
        }
    };

    function recalcularTotaisEditorCpu() {
        const cpu = window.GeoOrcamento._editorCpuAtual;
        if (!cpu) return;

        let mo = 0, mat = 0, eq = 0;
        (cpu.itens || []).forEach(it => {
            if (it.ativo === false) return; // Insumos congelados (desmarcados) não somam no custo
            const c = (it.coeficiente || 0) * (it.precoUnitario || 0);
            if (it.tipo === 'MO') mo += c;
            else if (it.tipo === 'EQ' || it.tipo === 'COMP') eq += c;
            else mat += c;
        });

        const totalDireto = mo + mat + eq;
        cpu.custoMaoDeObra = mo;
        cpu.custoMaterial = mat;
        cpu.custoEquipamento = eq;
        cpu.custoUnitarioDireto = totalDireto;

        const orc = window.GeoOrcamento.orcamentoAtual;
        const bdi = orc ? (orc.bdiPercentual || 0.248) : 0.248;
        const precoComBdi = totalDireto * (1 + bdi);

        const moEl = document.getElementById('cpu-total-mo');
        const matEl = document.getElementById('cpu-total-mat');
        const eqEl = document.getElementById('cpu-total-eq');
        const dirEl = document.getElementById('cpu-total-direto');
        const bdiEl = document.getElementById('cpu-preco-com-bdi-label');

        if (moEl) moEl.textContent = `R$ ${mo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (matEl) matEl.textContent = `R$ ${mat.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (eqEl) eqEl.textContent = `R$ ${eq.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (dirEl) dirEl.textContent = `R$ ${totalDireto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (bdiEl) bdiEl.textContent = `R$ ${precoComBdi.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    window.salvarEditorCpu = function() {
        const cpu = window.GeoOrcamento._editorCpuAtual;
        if (!cpu) return;

        const codInp = document.getElementById('cpu-form-codigo');
        const undSel = document.getElementById('cpu-form-unidade');
        const catInp = document.getElementById('cpu-form-categoria');
        const descInp = document.getElementById('cpu-form-descricao');

        if (!descInp || !descInp.value.trim()) {
            alert('Por favor, informe a descrição do serviço para a CPU.');
            if (descInp) descInp.focus();
            return;
        }

        cpu.codigo = (codInp ? codInp.value.trim() : 'CPU-01') || 'CPU-01';
        cpu.unidade = (undSel ? undSel.value : 'M²') || 'M²';
        cpu.categoria = (catInp ? catInp.value.trim() : 'GERAL') || 'GERAL';
        cpu.descricao = descInp.value.trim().toUpperCase();

        recalcularTotaisEditorCpu();

        const orc = window.GeoOrcamento.orcamentoAtual;
        const cpus = orc ? (orc.cpus || obterBancoCpusLocal()) : obterBancoCpusLocal();

        const idx = cpus.findIndex(c => c.id === cpu.id);
        if (idx >= 0) {
            cpus[idx] = cpu;
        } else {
            cpus.push(cpu);
        }

        salvarBancoCpusLocal(cpus);
        if (orc) salvarOrcamentoLocalmente();

        const etapaDestino = window.GeoOrcamento._etapaCpuOrigemId;
        fecharEditorCpu();

        if (etapaDestino) {
            window.abrirModalSelecaoCpu(etapaDestino);
        } else {
            renderOrcamentoModal();
        }

        alert(`Composição Própria "${cpu.codigo}" salva com sucesso!`);
    };

    window.excluirCpu = function(cpuId) {
        if (!confirm('Deseja realmente excluir esta Composição Própria (CPU)?')) return;

        const orc = window.GeoOrcamento.orcamentoAtual;
        let cpus = orc ? (orc.cpus || obterBancoCpusLocal()) : obterBancoCpusLocal();

        cpus = cpus.filter(c => c.id !== cpuId);
        salvarBancoCpusLocal(cpus);
        if (orc) salvarOrcamentoLocalmente();

        renderOrcamentoModal();
    };

    // ==========================================
    // FICHA TÉCNICA ANALÍTICA DA CPU (MEMÓRIA DE CÁLCULO)
    // ==========================================
    window.abrirFichaTecnicaCpu = function(cpuId) {
        const modal = document.getElementById('modal-ficha-cpu');
        const corpo = document.getElementById('modal-ficha-cpu-corpo');
        const tit = document.getElementById('modal-ficha-cpu-titulo');
        if (!modal || !corpo) return;

        const orc = window.GeoOrcamento.orcamentoAtual;
        const cpus = orc ? (orc.cpus || obterBancoCpusLocal()) : obterBancoCpusLocal();
        const cpu = cpus.find(c => c.id === cpuId || c.codigo === cpuId);

        if (!cpu) {
            alert('Ficha analítica não encontrada para esta composição.');
            return;
        }

        const bdi = orc ? (orc.bdiPercentual || 0.248) : 0.248;
        const precoComBdi = (cpu.custoUnitarioDireto || 0) * (1 + bdi);

        if (tit) tit.textContent = `Ficha Técnica Analítica: [${cpu.codigo}] ${cpu.descricao}`;

        let rowsHtml = (cpu.itens || []).map((it, idx) => {
            const total = (it.coeficiente || 0) * (it.precoUnitario || 0);
            return `
            <tr class="border-b border-slate-100 dark:border-slate-800 text-xs">
                <td class="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">${idx + 1}</td>
                <td class="py-2.5 px-3">
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${it.tipo === 'MO' ? 'bg-blue-100 text-blue-800' : (it.tipo === 'EQ' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}">${it.tipo || 'MAT'}</span>
                </td>
                <td class="py-2.5 px-3 font-mono text-slate-500">${it.codigo}</td>
                <td class="py-2.5 px-3">
                    <div class="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap">
                        <span>${it.descricao}</span>
                        ${it.origem === 'COTAÇÃO' ? `
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                                ${(it.cotacao_dados && it.cotacao_dados.fornecedores) ? it.cotacao_dados.fornecedores.filter(f => f.preco > 0).length : 1} Cotações (${it.cotacao_dados ? (it.cotacao_dados.metodoCalculo || 'Mediana') : 'Mediana'})
                            </span>
                        ` : ''}
                    </div>
                </td>
                <td class="py-2.5 px-3 text-center font-bold uppercase text-slate-500">${it.unidade}</td>
                <td class="py-2.5 px-3 text-right font-mono font-bold">${parseFloat(it.coeficiente || 0).toFixed(4)}</td>
                <td class="py-2.5 px-3 text-right font-mono">R$ ${(it.precoUnitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td class="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900 dark:text-slate-100">R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            </tr>`;
        }).join('');

        corpo.innerHTML = `
        <div class="space-y-4">
            <!-- Cabeçalho da Ficha -->
            <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                        <span class="text-slate-400 block text-[10px] uppercase font-bold">Código</span>
                        <strong class="font-mono text-slate-800 dark:text-slate-100 text-sm">${cpu.codigo}</strong>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px] uppercase font-bold">Unidade de Medida</span>
                        <strong class="uppercase text-slate-800 dark:text-slate-100 text-sm">${cpu.unidade}</strong>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px] uppercase font-bold">Custo Direto (s/ BDI)</span>
                        <strong class="font-mono text-slate-800 dark:text-slate-100 text-sm">R$ ${(cpu.custoUnitarioDireto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div>
                        <span class="text-emerald-600 dark:text-emerald-400 block text-[10px] uppercase font-bold">Preço de Venda c/ BDI (${(bdi * 100).toFixed(2)}%)</span>
                        <strong class="font-mono text-emerald-600 dark:text-emerald-400 text-sm">R$ ${precoComBdi.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                    </div>
                </div>
            </div>

            <!-- Tabela Analítica de Insumos -->
            <div class="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase bg-slate-50/80 dark:bg-slate-800/40">
                            <th class="py-2.5 px-3 text-center">Item</th>
                            <th class="py-2.5 px-3">Tipo</th>
                            <th class="py-2.5 px-3">Código</th>
                            <th class="py-2.5 px-3">Descrição do Insumo</th>
                            <th class="py-2.5 px-3 text-center">Und</th>
                            <th class="py-2.5 px-3 text-right">Coeficiente</th>
                            <th class="py-2.5 px-3 text-right">Preço Unit.</th>
                            <th class="py-2.5 px-3 text-right">Custo Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- Resumo por Categoria de Custo -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div class="p-3 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl">
                    <span class="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300 block">Total Mão de Obra</span>
                    <strong class="font-mono text-blue-900 dark:text-blue-200 text-sm">R$ ${(cpu.custoMaoDeObra || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                </div>
                <div class="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl">
                    <span class="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block">Total Materiais</span>
                    <strong class="font-mono text-emerald-900 dark:text-emerald-200 text-sm">R$ ${(cpu.custoMaterial || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                </div>
                <div class="p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl">
                    <span class="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300 block">Total Equipamentos</span>
                    <strong class="font-mono text-amber-900 dark:text-amber-200 text-sm">R$ ${(cpu.custoEquipamento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                </div>
            </div>
        </div>`;

        modal.classList.remove('hidden');
    };

    window.fecharFichaTecnicaCpu = function() {
        const modal = document.getElementById('modal-ficha-cpu');
        if (modal) modal.classList.add('hidden');
    };

    // Autocomplete SINAPI em tempo real com busca multi-termos, debounce e feedback visual
    let sinapiSearchDebounceTimer = null;
    window.buscarSinapiAutocomplete = function(etapaId, query) {
        clearTimeout(sinapiSearchDebounceTimer);
        const dropdown = document.getElementById(`autocomplete-results-${etapaId}`);
        if (!dropdown) return;

        const qClean = (query || '').trim();
        if (qClean.length < 2) {
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
            return;
        }

        // Feedback imediato caso o catálogo ainda esteja sendo baixado
        if (!window.GeoOrcamento.catalogoCarregado || !window.GeoOrcamento.catalogoSinapi || window.GeoOrcamento.catalogoSinapi.length === 0) {
            dropdown.innerHTML = `
                <div class="p-3.5 flex items-center gap-2.5 text-xs text-sky-600 dark:text-sky-400 font-medium">
                    <span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    <span>Carregando acervo oficial do SINAPI (15.420 itens)...</span>
                </div>
            `;
            dropdown.classList.remove('hidden');
        }

        sinapiSearchDebounceTimer = setTimeout(async () => {
            const catalogo = await window.carregarCatalogoSinapi();
            if (!catalogo || catalogo.length === 0) {
                dropdown.innerHTML = `
                    <div class="p-3.5 text-xs text-rose-500 font-medium flex items-center gap-2">
                        <span class="material-symbols-outlined text-[16px]">error</span>
                        <span>Não foi possível carregar a tabela SINAPI. Verifique sua conexão local.</span>
                    </div>`;
                dropdown.classList.remove('hidden');
                return;
            }

            const tokens = qClean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(Boolean);
            const isDeson = (window.GeoOrcamento.orcamentoAtual && window.GeoOrcamento.orcamentoAtual.regimeDesoneracao === 'DESONERADO');
            const filtroTipo = (window.GeoOrcamento._filtroTipoSinapi && window.GeoOrcamento._filtroTipoSinapi[etapaId]) || 'TODOS';
            const allMatches = [];

            for (let i = 0; i < catalogo.length; i++) {
                const item = catalogo[i];
                if (filtroTipo === 'COMPOSICAO' && item.tipo !== 'COMPOSICAO') continue;
                if (filtroTipo === 'INSUMO' && item.tipo === 'COMPOSICAO') continue;

                const cod = String(item.codigo || '');
                const descNorm = (item.descricao || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                // Verifica se todos os termos digitados estão presentes no código ou na descrição
                const matchAll = tokens.every(tok => cod.includes(tok) || descNorm.includes(tok));
                if (matchAll) {
                    allMatches.push(item);
                }
            }

            if (allMatches.length === 0) {
                const msgFiltro = filtroTipo === 'COMPOSICAO' ? ' entre as Composições' : (filtroTipo === 'INSUMO' ? ' entre os Insumos' : '');
                dropdown.innerHTML = `
                    <div class="p-4 text-xs text-slate-400 italic text-center">
                        Nenhum item SINAPI encontrado para "<span class="font-bold text-slate-600 dark:text-slate-300">${qClean}</span>"${msgFiltro}.
                    </div>`;
                dropdown.classList.remove('hidden');
                return;
            }

            // Ordena colocando PRIMEIRO os itens com preço oficial válido (> 0) e depois por relevância de código/nome
            allMatches.sort((a, b) => {
                const pA = isDeson ? (a.preco_desonerado ?? 0) : (a.preco_nao_desonerado ?? 0);
                const pB = isDeson ? (b.preco_desonerado ?? 0) : (b.preco_nao_desonerado ?? 0);
                if (pA > 0 && pB === 0) return -1;
                if (pA === 0 && pB > 0) return 1;
                return 0;
            });

            const matches = allMatches.slice(0, 30);
            let labelFiltroBadge = 'Todos os Itens';
            if (filtroTipo === 'COMPOSICAO') labelFiltroBadge = 'Apenas Composições (Serviços)';
            else if (filtroTipo === 'INSUMO') labelFiltroBadge = 'Apenas Insumos (MAT / MO / EQ)';

            let html = `
                <div class="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                    <span>${allMatches.length > 30 ? `Exibindo 30 de ${allMatches.length} itens encontrados` : `${matches.length} itens encontrados`} • <span class="text-sky-600 dark:text-sky-400 font-extrabold">${labelFiltroBadge}</span></span>
                    <span class="font-mono text-sky-600 dark:text-sky-400 font-semibold">${window.GeoOrcamento.baseAtiva || 'SINAPI PB'}</span>
                </div>
            `;

            matches.forEach(m => {
                const p = isDeson ? (m.preco_desonerado ?? 0) : (m.preco_nao_desonerado ?? 0);
                const isComp = (m.tipo === 'COMPOSICAO');
                const tipoBadge = isComp 
                    ? '<span class="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">COMPOSIÇÃO</span>'
                    : '<span class="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">INSUMO</span>';

                const precoHtml = p > 0 
                    ? `<span class="font-mono font-black text-slate-900 dark:text-slate-100 text-xs">R$ ${p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
                    : `<span class="text-[9.5px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">Sem preço IBGE (Requer CPU)</span>`;

                html += `
                <div onclick="selecionarItemSinapi('${etapaId}', '${m.codigo}')" class="p-3 hover:bg-sky-50/70 dark:hover:bg-slate-800/80 cursor-pointer flex items-start justify-between gap-3 text-xs transition-colors group">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="font-mono font-black text-sky-600 dark:text-sky-400 text-xs">${m.codigo}</span>
                            ${tipoBadge}
                            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">${m.unidade || 'UN'}</span>
                        </div>
                        <div class="text-slate-800 dark:text-slate-200 font-medium text-[11.5px] leading-snug group-hover:text-sky-700 dark:group-hover:text-sky-300 line-clamp-2">${m.descricao}</div>
                    </div>
                    <div class="text-right shrink-0 flex flex-col items-end justify-center">
                        ${precoHtml}
                        <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 mt-0.5">
                            <span class="material-symbols-outlined text-[13px]">add</span> Adicionar
                        </span>
                    </div>
                </div>
                `;
            });

            dropdown.innerHTML = html;
            dropdown.classList.remove('hidden');
        }, 150);
    };

    window.selecionarItemSinapi = async function(etapaId, codigo) {
        const catalogo = window.GeoOrcamento.catalogoSinapi || [];
        const item = catalogo.find(x => String(x.codigo) === String(codigo));
        if (!item) return;

        const orc = window.GeoOrcamento.orcamentoAtual;
        const etp = orc.etapas.find(e => e.id === etapaId);
        if (!etp) return;

        const isDeson = (orc.regimeDesoneracao === 'DESONERADO');
        const precoUnit = isDeson ? item.preco_desonerado : item.preco_nao_desonerado;

        // Pré-carrega o analítico se for composição
        if (item.tipo === 'COMPOSICAO' && !window.GeoOrcamento._analiticoSinapiCache) {
            await window.obterAnaliticoSinapi();
        }

        const novoItem = {
            id: 'it_' + Date.now(),
            itemNum: `${etp.codigo}.${etp.itens.length + 1}`,
            fonte: 'SINAPI',
            tipo: item.tipo || 'COMPOSICAO',
            codigo: item.codigo,
            descricao: item.descricao,
            unidade: item.unidade,
            quantidade: 1,
            precoUnitarioSemBdi: precoUnit || 0
        };

        const analiticoMap = window.GeoOrcamento._analiticoSinapiCache;
        if (analiticoMap && analiticoMap[String(item.codigo)]) {
            novoItem.itensCpu = analiticoMap[String(item.codigo)].map(sub => {
                const cat = catalogo.find(c => String(c.codigo) === String(sub.codigo));
                let p = 0;
                if (cat) {
                    p = isDeson 
                        ? (cat.preco_desonerado ?? cat.preco_nao_desonerado ?? 0)
                        : (cat.preco_nao_desonerado ?? cat.preco_desonerado ?? 0);
                }
                const coef = parseFloat(sub.coeficiente) || 1.0;
                return {
                    tipo: sub.tipo === 'COMPOSICAO' ? 'COMP' : (sub.unidade === 'H' ? 'MO' : (sub.unidade === 'CHP' || sub.unidade === 'CHI' ? 'EQ' : 'MAT')),
                    codigo: sub.codigo,
                    descricao: sub.descricao,
                    unidade: sub.unidade || 'UN',
                    coeficiente: coef,
                    precoUnitario: p,
                    custoTotal: coef * p,
                    origem: 'SINAPI',
                    ativo: true
                };
            });
        }

        etp.itens.push(novoItem);

        // Limpa e oculta dropdown e input
        const dropdown = document.getElementById(`autocomplete-results-${etapaId}`);
        if (dropdown) {
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
        }
        const inputSearch = document.getElementById(`input-search-sinapi-${etapaId}`);
        if (inputSearch) {
            inputSearch.value = '';
        }

        salvarOrcamentoLocalmente();
        renderOrcamentoModal();
    };
    window.atualizarPercentualCronograma = function(etapaId, mesIdx, val) {
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!orc) return;
        if (!orc.cronograma) orc.cronograma = { meses: orc.prazoMeses || 6, distribuicao: {} };
        if (!orc.cronograma.distribuicao) orc.cronograma.distribuicao = {};
        if (!orc.cronograma.distribuicao[etapaId]) {
            orc.cronograma.distribuicao[etapaId] = new Array(orc.prazoMeses || 6).fill(0);
        }

        let parsed = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : parseFloat(val);
        if (isNaN(parsed) || parsed < 0) parsed = 0;
        if (parsed > 100) parsed = 100;
        const numVal = Math.round(parsed * 100) / 100;

        orc.cronograma.distribuicao[etapaId][mesIdx] = numVal;
        salvarOrcamentoLocalmente();
        renderOrcamentoModal();
    };

    window.atualizarPrazoCronograma = function(meses) {
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!orc) return;
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
        const featId = orc.featureId || (window.GeoOrcamento.activeFeature && window.GeoOrcamento.activeFeature.feature && (window.GeoOrcamento.activeFeature.feature.properties.id_banco || window.GeoOrcamento.activeFeature.feature.properties.id)) || 'default';
        const key = 'geogestor_orcamento_' + featId;
        localStorage.setItem(key, JSON.stringify(orc));
        localStorage.setItem('geogestor_orcamento_default', JSON.stringify(orc));

        if (window.GeoOrcamento.activeFeature && window.GeoOrcamento.activeFeature.feature && window.GeoOrcamento.activeFeature.feature.properties) {
            const pId = window.GeoOrcamento.activeFeature.feature.properties.id_banco || window.GeoOrcamento.activeFeature.feature.properties.id;
            if (pId && pId !== featId) {
                localStorage.setItem('geogestor_orcamento_' + pId, JSON.stringify(orc));
            }
        }

        sincronizarCardOrcamento(orc);

        // Se a função de salvar feição existir no main.js, dispara
        const activeFeat = window.GeoOrcamento.activeFeature || 
            (typeof activeFeatureLayer !== 'undefined' ? activeFeatureLayer : 
            (typeof window.activeFeatureLayer !== 'undefined' ? window.activeFeatureLayer : null));
        if (activeFeat && typeof window.saveFeatureToDatabase === 'function') {
            window.saveFeatureToDatabase(activeFeat).catch(console.warn);
        }
    }
    window.salvarOrcamentoLocalmente = salvarOrcamentoLocalmente;

    // Fechar dropdown de autocomplete ao clicar fora
    document.addEventListener('click', function(evt) {
        if (!evt.target.closest('[id^="autocomplete-results-"]') && !evt.target.closest('[id^="input-search-sinapi-"]')) {
            document.querySelectorAll('[id^="autocomplete-results-"]').forEach(el => {
                el.classList.add('hidden');
            });
        }
    });

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

    // ==========================================
    // EXPORTAÇÃO E GERAÇÃO OFICIAL DE PDF
    // ==========================================
    window.abrirModalExportarPdf = function() {
        const modal = document.getElementById('modal-exportar-pdf');
        if (!modal) return;

        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!orc) return;

        const enteInp = document.getElementById('pdf-ente-nome');
        const secInp = document.getElementById('pdf-secretaria-nome');
        const respInp = document.getElementById('pdf-resp-tecnico');
        const regInp = document.getElementById('pdf-registro-prof');
        const logoImg = document.getElementById('pdf-logo-preview');

        // Carrega valores salvos ou padrões
        if (enteInp) enteInp.value = orc.enteNome || 'PREFEITURA MUNICIPAL DE CABEDELO';
        if (secInp) secInp.value = orc.secretariaNome || 'SECRETARIA MUNICIPAL DE INFRAESTRUTURA E OBRAS PÚBLICAS';
        if (respInp) respInp.value = orc.responsavelTecnico || '';
        if (regInp) regInp.value = orc.registroProfissional || 'CREA-PB / CAU';

        // Tenta buscar logo salva ou logo do avatar do sistema
        let logoUrl = orc.logoEnte || localStorage.getItem('geogestor_logo_ente_custom');
        if (!logoUrl) {
            const avatar = document.querySelector('.profile-avatar-img, #btn-header-profile img');
            if (avatar && avatar.src && !avatar.src.includes('undefined')) {
                logoUrl = avatar.src;
            }
        }
        if (logoImg) logoImg.src = logoUrl || 'assets/logo.png';

        // Garante a seleção inicial do modelo Sintética ou o que estiver marcado
        const tipoAtual = document.querySelector('input[name="pdf-tipo-relatorio"]:checked')?.value || 'SINTETICA';
        if (typeof window.selecionarTipoRelatorioPdf === 'function') {
            window.selecionarTipoRelatorioPdf(tipoAtual);
        }

        modal.classList.remove('hidden');
    };

    window.selecionarTipoRelatorioPdf = function(tipo) {
        const radioSintetica = document.getElementById('radio-pdf-sintetica') || document.querySelector('input[name="pdf-tipo-relatorio"][value="SINTETICA"]');
        const radioCompleto = document.getElementById('radio-pdf-completo') || document.querySelector('input[name="pdf-tipo-relatorio"][value="COMPLETO"]');
        const cardSintetica = document.getElementById('card-pdf-sintetica');
        const cardCompleto = document.getElementById('card-pdf-completo');
        const boxSintetica = document.getElementById('check-box-pdf-sintetica');
        const boxCompleto = document.getElementById('check-box-pdf-completo');

        if (tipo === 'COMPLETO') {
            if (radioCompleto) radioCompleto.checked = true;
            if (radioSintetica) radioSintetica.checked = false;

            if (cardCompleto) {
                cardCompleto.className = "relative flex flex-col p-3.5 rounded-xl border-2 border-primary bg-primary/10 shadow-sm cursor-pointer transition-all select-none";
            }
            if (cardSintetica) {
                cardSintetica.className = "relative flex flex-col p-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer transition-all hover:border-slate-300 dark:hover:border-slate-600 select-none";
            }
            if (boxCompleto) {
                boxCompleto.className = "w-4 h-4 rounded border flex items-center justify-center bg-primary border-primary text-white transition-all shadow-xs shrink-0";
                const ic = boxCompleto.querySelector('.material-symbols-outlined');
                if (ic) ic.classList.remove('opacity-0');
            }
            if (boxSintetica) {
                boxSintetica.className = "w-4 h-4 rounded border flex items-center justify-center border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800 text-transparent transition-all shadow-xs shrink-0";
                const ic = boxSintetica.querySelector('.material-symbols-outlined');
                if (ic) ic.classList.add('opacity-0');
            }
        } else {
            if (radioSintetica) radioSintetica.checked = true;
            if (radioCompleto) radioCompleto.checked = false;

            if (cardSintetica) {
                cardSintetica.className = "relative flex flex-col p-3.5 rounded-xl border-2 border-primary bg-primary/10 shadow-sm cursor-pointer transition-all select-none";
            }
            if (cardCompleto) {
                cardCompleto.className = "relative flex flex-col p-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer transition-all hover:border-slate-300 dark:hover:border-slate-600 select-none";
            }
            if (boxSintetica) {
                boxSintetica.className = "w-4 h-4 rounded border flex items-center justify-center bg-primary border-primary text-white transition-all shadow-xs shrink-0";
                const ic = boxSintetica.querySelector('.material-symbols-outlined');
                if (ic) ic.classList.remove('opacity-0');
            }
            if (boxCompleto) {
                boxCompleto.className = "w-4 h-4 rounded border flex items-center justify-center border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800 text-transparent transition-all shadow-xs shrink-0";
                const ic = boxCompleto.querySelector('.material-symbols-outlined');
                if (ic) ic.classList.add('opacity-0');
            }
        }
    };

    window.fecharModalExportarPdf = function() {
        const modal = document.getElementById('modal-exportar-pdf');
        if (modal) modal.classList.add('hidden');
    };

    window.carregarLogoEntePdf = function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            const b64 = e.target.result;
            const logoImg = document.getElementById('pdf-logo-preview');
            if (logoImg) logoImg.src = b64;
            const orc = window.GeoOrcamento.orcamentoAtual;
            if (orc) {
                orc.logoEnte = b64;
                salvarOrcamentoLocalmente();
            }
            try { localStorage.setItem('geogestor_logo_ente_custom', b64); } catch(err){}
        };
        reader.readAsDataURL(file);
    };

    window.removerLogoEntePdf = function() {
        const logoImg = document.getElementById('pdf-logo-preview');
        if (logoImg) logoImg.src = 'assets/logo.png';
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (orc) {
            orc.logoEnte = null;
            salvarOrcamentoLocalmente();
        }
        try { localStorage.removeItem('geogestor_logo_ente_custom'); } catch(err){}
    };

    window.executarExportacaoPdf = async function() {
        const orc = window.GeoOrcamento.orcamentoAtual;
        if (!orc) return;

        const enteNome = (document.getElementById('pdf-ente-nome')?.value || '').trim() || 'PREFEITURA MUNICIPAL DE CABEDELO';
        const secretariaNome = (document.getElementById('pdf-secretaria-nome')?.value || '').trim() || 'SECRETARIA DE OBRAS E INFRAESTRUTURA';
        const respTecnico = (document.getElementById('pdf-resp-tecnico')?.value || '').trim() || (orc.responsavelTecnico || '');
        const registroProf = (document.getElementById('pdf-registro-prof')?.value || '').trim() || 'CREA / CAU';
        const logoSrc = document.getElementById('pdf-logo-preview')?.src || 'assets/logo.png';
        const tipoRelatorio = document.querySelector('input[name="pdf-tipo-relatorio"]:checked')?.value || 'SINTETICA';
        const incluirAssinaturas = document.getElementById('pdf-opt-assinaturas')?.checked ?? true;
        const orientacao = document.getElementById('pdf-opt-orientacao')?.value || 'portrait';

        // Salvar preferências no orçamento
        orc.enteNome = enteNome;
        orc.secretariaNome = secretariaNome;
        orc.responsavelTecnico = respTecnico;
        orc.registroProfissional = registroProf;
        orc.logoEnte = logoSrc;
        salvarOrcamentoLocalmente();
        fecharModalExportarPdf();

        // Se for relatório completo, assegura que o acervo analítico está carregado
        if (tipoRelatorio === 'COMPLETO' && !window.GeoOrcamento._analiticoSinapiCache) {
            await window.obterAnaliticoSinapi();
        }

        const bdiPercentual = (orc.bdiPercentual || 0.248);
        const bdiFormatado = (bdiPercentual * 100).toFixed(2);
        const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        // Montagem do Relatório Sintético (Tabela Principal)
        let tabelaItensHtml = '';
        orc.etapas.forEach(etp => {
            tabelaItensHtml += `
            <tr style="background-color: #f1f5f9; font-weight: bold; border-top: 1.5px solid #cbd5e1; border-bottom: 1.5px solid #cbd5e1;">
                <td style="padding: 6px 8px; text-align: center; font-size: 11px;">${etp.codigo}</td>
                <td style="padding: 6px 8px; font-size: 11px;" colspan="6">${etp.nome}</td>
                <td style="padding: 6px 8px; text-align: right; font-size: 11px; font-family: monospace;">R$ ${(etp.totalComBdi || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="padding: 6px 8px; text-align: right; font-size: 11px;">${orc.valorTotalComBdi > 0 ? (((etp.totalComBdi || 0) / orc.valorTotalComBdi) * 100).toFixed(2) : '0,00'}%</td>
            </tr>
            `;

            (etp.itens || []).forEach((it, idx) => {
                const fundoZebra = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
                tabelaItensHtml += `
                <tr style="background-color: ${fundoZebra}; border-bottom: 1px solid #e2e8f0; font-size: 10px;">
                    <td style="padding: 5px 6px; text-align: center; color: #64748b;">${it.itemNum || (etp.codigo + '.' + (idx + 1))}</td>
                    <td style="padding: 5px 6px; font-family: monospace; font-weight: bold; color: #0284c7;">${it.codigo}</td>
                    <td style="padding: 5px 8px; color: #1e293b; text-align: left; line-height: 1.3;">${it.descricao}</td>
                    <td style="padding: 5px 6px; text-align: center; text-transform: uppercase; font-weight: bold; color: #475569;">${it.unidade || 'UN'}</td>
                    <td style="padding: 5px 6px; text-align: right; font-family: monospace;">${(parseFloat(it.quantidade) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                    <td style="padding: 5px 6px; text-align: right; font-family: monospace; color: #475569;">R$ ${(it.precoUnitarioSemBdi || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="padding: 5px 6px; text-align: right; font-family: monospace; font-weight: 600; color: #0f172a;">R$ ${(it.precoUnitarioComBdi || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="padding: 5px 6px; text-align: right; font-family: monospace; font-weight: bold; color: #0f172a;">R$ ${(it.precoTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="padding: 5px 6px; text-align: right; color: #64748b;">${(it.percentualObra || 0).toFixed(2)}%</td>
                </tr>
                `;
            });
        });

        // Seção Analítica de BDI (se COMPLETO)
        let secaoBdiHtml = '';
        if (tipoRelatorio === 'COMPLETO') {
            const b = orc.bdiConfig || getDefaultBdiConfig();
            secaoBdiHtml = `
            <div style="page-break-before: always; margin-top: 25px;">
                <h3 style="font-size: 13px; text-transform: uppercase; font-weight: 800; color: #0f172a; border-bottom: 2px solid #0284c7; padding-bottom: 4px; margin-bottom: 12px;">
                    2. Memória de Cálculo Analítica do BDI (Acórdão TCU nº 2.622/2013)
                </h3>
                <p style="font-size: 10px; color: #475569; margin-bottom: 10px;">
                    Fórmula oficial: <code>BDI = { [ (1 + AC + S + R + G) * (1 + DF) * (1 + L) ] / (1 - I) } - 1</code>
                </p>
                <table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #cbd5e1; margin-bottom: 15px;">
                    <thead>
                        <tr style="background-color: #f1f5f9; text-transform: uppercase; font-size: 9.5px; border-bottom: 1.5px solid #cbd5e1;">
                            <th style="padding: 6px 8px; text-align: left;">Componente do BDI</th>
                            <th style="padding: 6px 8px; text-align: center;">Sigla</th>
                            <th style="padding: 6px 8px; text-align: right;">Taxa Aplicada (%)</th>
                            <th style="padding: 6px 8px; text-align: left;">Fundamentação / Parâmetro TCU</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 5px 8px;">Administração Central</td><td style="text-align: center; font-weight: bold;">AC</td><td style="text-align: right; font-family: monospace;">${(b.ac || 0).toFixed(2)}%</td><td style="color: #64748b;">Faixa TCU: 3,00% a 5,50%</td></tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 5px 8px;">Seguro da Obra</td><td style="text-align: center; font-weight: bold;">S</td><td style="text-align: right; font-family: monospace;">${(b.s || 0).toFixed(2)}%</td><td style="color: #64748b;">Faixa TCU: 0,80% a 1,00%</td></tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 5px 8px;">Garantia Contratual</td><td style="text-align: center; font-weight: bold;">G</td><td style="text-align: right; font-family: monospace;">${(b.g || 0).toFixed(2)}%</td><td style="color: #64748b;">Faixa TCU: 0,80% a 1,00%</td></tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 5px 8px;">Risco e Contingências</td><td style="text-align: center; font-weight: bold;">R</td><td style="text-align: right; font-family: monospace;">${(b.r || 0).toFixed(2)}%</td><td style="color: #64748b;">Faixa TCU: 0,97% a 1,27%</td></tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 5px 8px;">Despesas Financeiras</td><td style="text-align: center; font-weight: bold;">DF</td><td style="text-align: right; font-family: monospace;">${(b.df || 0).toFixed(2)}%</td><td style="color: #64748b;">Faixa TCU: 0,59% a 1,39%</td></tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 5px 8px;">Lucro / Remuneração da Empresa</td><td style="text-align: center; font-weight: bold;">L</td><td style="text-align: right; font-family: monospace;">${(b.l || 0).toFixed(2)}%</td><td style="color: #64748b;">Faixa TCU: 6,16% a 8,96%</td></tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 5px 8px;">PIS</td><td style="text-align: center; font-weight: bold;">PIS</td><td style="text-align: right; font-family: monospace;">${(b.pis || 0).toFixed(2)}%</td><td style="color: #64748b;">Tributo Federal (0,65%)</td></tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 5px 8px;">COFINS</td><td style="text-align: center; font-weight: bold;">COF</td><td style="text-align: right; font-family: monospace;">${(b.cofins || 0).toFixed(2)}%</td><td style="color: #64748b;">Tributo Federal (3,00%)</td></tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 5px 8px;">ISS (Imposto Sobre Serviços)</td><td style="text-align: center; font-weight: bold;">ISS</td><td style="text-align: right; font-family: monospace;">${(b.iss || 0).toFixed(2)}%</td><td style="color: #64748b;">Legislação Tributária Municipal</td></tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 5px 8px;">CPRB (Desoneração da Folha)</td><td style="text-align: center; font-weight: bold;">CPRB</td><td style="text-align: right; font-family: monospace;">${(b.cprb || 0).toFixed(2)}%</td><td style="color: #64748b;">Lei 12.844/2013 (se aplicável)</td></tr>
                        <tr style="background-color: #f8fafc; font-weight: bold; border-top: 1.5px solid #0284c7;">
                            <td colspan="2" style="padding: 7px 8px; font-size: 11px; text-transform: uppercase;">Taxa Geral de BDI Calculada</td>
                            <td style="padding: 7px 8px; text-align: right; font-size: 12px; font-family: monospace; color: #0284c7;">${bdiFormatado}%</td>
                            <td style="padding: 7px 8px; color: #059669;">Conforme Limites do Acórdão 2.622/2013 TCU - Plenário</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            `;
        }

        // Seção do Cronograma (se COMPLETO)
        let secaoCronogramaHtml = '';
        if (tipoRelatorio === 'COMPLETO') {
            const meses = orc.prazoMeses || 6;
            let thMesesHtml = '';
            for (let m = 1; m <= meses; m++) {
                thMesesHtml += `<th style="padding: 6px 4px; text-align: center; border-left: 1px solid #cbd5e1;">Mês ${m}</th>`;
            }

            let linhasCronogramaHtml = '';
            orc.etapas.forEach(etp => {
                const percList = (orc.cronograma && orc.cronograma.distribuicao && orc.cronograma.distribuicao[etp.id]) || new Array(meses).fill(0);
                let cellsHtml = '';
                for (let m = 0; m < meses; m++) {
                    const rawPerc = percList[m];
                    const parsed = typeof rawPerc === 'string' ? parseFloat(rawPerc.replace(',', '.')) : parseFloat(rawPerc);
                    const perc = isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
                    const val = Math.round(((etp.totalComBdi * perc) / 100) * 100) / 100;
                    cellsHtml += `
                    <td style="padding: 4px; text-align: center; border-left: 1px solid #e2e8f0; font-family: monospace; font-size: 9px;">
                        <div style="font-weight: bold;">${perc.toFixed(2)}%</div>
                        <div style="color: #475569; font-size: 8.5px;">R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </td>`;
                }

                linhasCronogramaHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px;">
                    <td style="padding: 5px 6px; font-weight: bold; text-align: left;">${etp.codigo} ${etp.nome}</td>
                    <td style="padding: 5px 6px; font-family: monospace; text-align: right; color: #0f172a;">R$ ${(etp.totalComBdi || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    ${cellsHtml}
                </tr>`;
            });

            secaoCronogramaHtml = `
            <div style="margin-top: 25px;">
                <h3 style="font-size: 13px; text-transform: uppercase; font-weight: 800; color: #0f172a; border-bottom: 2px solid #0284c7; padding-bottom: 4px; margin-bottom: 12px;">
                    3. Cronograma Físico-Financeiro de Desembolso
                </h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; border: 1px solid #cbd5e1; margin-bottom: 15px;">
                    <thead>
                        <tr style="background-color: #f1f5f9; text-transform: uppercase; border-bottom: 1.5px solid #cbd5e1;">
                            <th style="padding: 6px 8px; text-align: left;">Macroetapa</th>
                            <th style="padding: 6px 8px; text-align: right; width: 100px;">Total (R$)</th>
                            ${thMesesHtml}
                        </tr>
                    </thead>
                    <tbody>
                        ${linhasCronogramaHtml}
                    </tbody>
                </table>
            </div>
            `;
        }

        // Seção Analítica de Insumos / CPUs (se COMPLETO)
        let secaoComposicoesAnaliticasHtml = '';
        if (tipoRelatorio === 'COMPLETO') {
            let composicoesHtml = '';
            orc.etapas.forEach(etp => {
                (etp.itens || []).forEach(it => {
                    const isComp = (it.fonte === 'CPU' || it.fonte === 'PRÓPRIO' || it.tipo === 'COMPOSICAO' || (it.codigo && String(it.codigo).length >= 5));
                    if (!isComp) return;

                    const insumos = window.obterInsumosDoItemPlanilha(it) || [];
                    if (insumos.length === 0) return;

                    let linhasInsumos = '';
                    let moTotal = 0, matTotal = 0, eqTotal = 0;

                    insumos.forEach(sub => {
                        const isAtivo = (sub.ativo !== false);
                        const custo = isAtivo ? ((sub.coeficiente || 0) * (sub.precoUnitario || 0)) : 0;
                        if (isAtivo) {
                            if (sub.tipo === 'MO') moTotal += custo;
                            else if (sub.tipo === 'EQ' || sub.tipo === 'COMP') eqTotal += custo;
                            else matTotal += custo;
                        }

                        linhasInsumos += `
                        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 9px; ${!isAtivo ? 'opacity: 0.45; text-decoration: line-through; background-color: #f8fafc;' : ''}">
                            <td style="padding: 3px 5px; text-align: center; font-weight: bold; color: #475569;">${sub.tipo || 'MAT'}</td>
                            <td style="padding: 3px 5px; font-family: monospace;">${sub.codigo}</td>
                            <td style="padding: 3px 6px; text-align: left;">${sub.descricao}</td>
                            <td style="padding: 3px 5px; text-align: center; text-transform: uppercase;">${sub.unidade || 'UN'}</td>
                            <td style="padding: 3px 5px; text-align: right; font-family: monospace;">${(sub.coeficiente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                            <td style="padding: 3px 5px; text-align: right; font-family: monospace;">R$ ${(sub.precoUnitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td style="padding: 3px 5px; text-align: right; font-family: monospace; font-weight: bold;">R$ ${custo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td style="padding: 3px 5px; text-align: center; font-size: 8px;">${isAtivo ? 'ATIVO' : 'CONGELADO'}</td>
                        </tr>
                        `;
                    });

                    const custoDiretoCalc = moTotal + matTotal + eqTotal;
                    const precoVendaCalc = custoDiretoCalc * (1 + bdiPercentual);

                    composicoesHtml += `
                    <div style="border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 16px; page-break-inside: avoid; background-color: #ffffff;">
                        <div style="background-color: #f8fafc; padding: 6px 10px; border-bottom: 1px solid #cbd5e1; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span style="background-color: #0284c7; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-family: monospace; font-weight: bold;">${it.codigo}</span>
                                <strong style="font-size: 10.5px; color: #0f172a; margin-left: 6px;">${it.descricao}</strong>
                                <span style="font-size: 9px; color: #64748b; margin-left: 6px;">(Unidade: ${it.unidade || 'UN'})</span>
                            </div>
                            <div style="font-size: 10px; text-align: right;">
                                <span style="color: #64748b;">Custo Direto: </span><strong>R$ ${custoDiretoCalc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> |
                                <span style="color: #0284c7;">Preço c/ BDI: </span><strong style="color: #0284c7;">R$ ${precoVendaCalc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                            </div>
                        </div>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background-color: #f1f5f9; text-transform: uppercase; font-size: 8.5px; color: #475569; border-bottom: 1px solid #cbd5e1;">
                                    <th style="padding: 4px; text-align: center; width: 45px;">Tipo</th>
                                    <th style="padding: 4px; text-align: left; width: 65px;">Código</th>
                                    <th style="padding: 4px; text-align: left;">Descrição do Insumo</th>
                                    <th style="padding: 4px; text-align: center; width: 40px;">Und</th>
                                    <th style="padding: 4px; text-align: right; width: 70px;">Coeficiente</th>
                                    <th style="padding: 4px; text-align: right; width: 75px;">Preço Unit.</th>
                                    <th style="padding: 4px; text-align: right; width: 75px;">Custo Total</th>
                                    <th style="padding: 4px; text-align: center; width: 55px;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${linhasInsumos}
                            </tbody>
                        </table>
                        <div style="background-color: #fafafa; padding: 4px 10px; font-size: 8.5px; color: #64748b; display: flex; justify-content: flex-end; gap: 15px; border-top: 1px solid #e2e8f0;">
                            <span>Mão de Obra: <strong>R$ ${moTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                            <span>Materiais: <strong>R$ ${matTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                            <span>Equipamentos: <strong>R$ ${eqTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                        </div>
                    </div>
                    `;
                });
            });

            if (composicoesHtml) {
                secaoComposicoesAnaliticasHtml = `
                <div style="page-break-before: always; margin-top: 25px;">
                    <h3 style="font-size: 13px; text-transform: uppercase; font-weight: 800; color: #0f172a; border-bottom: 2px solid #0284c7; padding-bottom: 4px; margin-bottom: 12px;">
                        4. Composições de Custos Unitários Analíticas (Insumos SINAPI / CPUs)
                    </h3>
                    <p style="font-size: 10px; color: #64748b; margin-bottom: 12px;">
                        Detalhamento 1:N de todos os insumos de mão de obra, materiais, equipamentos e cotações de mercado para auditoria oficial e prestação de contas.
                    </p>
                    ${composicoesHtml}
                </div>
                `;
            }
        }

        // Quadro de Assinaturas
        let quadroAssinaturasHtml = '';
        if (incluirAssinaturas) {
            quadroAssinaturasHtml = `
            <div style="margin-top: 35px; page-break-inside: avoid; border-top: 1px solid #cbd5e1; padding-top: 25px;">
                <div style="display: flex; justify-content: space-around; text-align: center; font-size: 10.5px; color: #1e293b;">
                    <div style="width: 42%;">
                        <div style="border-bottom: 1px solid #0f172a; height: 35px; margin-bottom: 6px;"></div>
                        <strong>${respTecnico || 'ENGENHEIRO / ARQUITETO ORÇAMENTISTA'}</strong>
                        <div style="color: #64748b; font-size: 9.5px;">Responsável Técnico • ${registroProf || 'CREA / CAU'}</div>
                    </div>
                    <div style="width: 42%;">
                        <div style="border-bottom: 1px solid #0f172a; height: 35px; margin-bottom: 6px;"></div>
                        <strong>${enteNome}</strong>
                        <div style="color: #64748b; font-size: 9.5px;">Autoridade Competente / Ordenador de Despesas</div>
                    </div>
                </div>
            </div>
            `;
        }

        // Montagem do Documento HTML Completo para Impressão
        const docHtml = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>ORCAMENTO_${orc.nomeObra.replace(/\\s+/g, '_')}</title>
            <style>
                @page {
                    size: ${orientacao === 'landscape' ? 'A4 landscape' : 'A4 portrait'};
                    margin: 10mm 10mm 12mm 10mm;
                }
                * { box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                    color: #0f172a;
                    background-color: #ffffff;
                    margin: 0;
                    padding: 0;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                .barra-topo-impressao {
                    position: sticky;
                    top: 0;
                    left: 0;
                    right: 0;
                    background-color: #0f172a;
                    color: white;
                    padding: 10px 20px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    z-index: 9999;
                    font-size: 13px;
                }
                .btn-imprimir {
                    background-color: #e11d48;
                    color: white;
                    font-weight: bold;
                    padding: 7px 18px;
                    border-radius: 8px;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                }
                .btn-imprimir:hover { background-color: #be123c; }
                .btn-fechar {
                    background-color: #334155;
                    color: white;
                    font-weight: bold;
                    padding: 7px 14px;
                    border-radius: 8px;
                    border: none;
                    cursor: pointer;
                    font-size: 12px;
                }
                .btn-fechar:hover { background-color: #475569; }
                @media print {
                    .no-print { display: none !important; }
                    body { padding: 0 !important; }
                }
                .documento-container {
                    max-width: ${orientacao === 'landscape' ? '280mm' : '200mm'};
                    margin: 0 auto;
                    padding: 15px 10px;
                }
            </style>
        </head>
        <body>
            <!-- Barra de Ações (Apenas na Tela) -->
            <div class="barra-topo-impressao no-print">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-weight: 800; color: #f43f5e;">GeoGestor • Orçamento de Obras Públicas</span>
                    <span style="color: #94a3b8;">| Pré-visualização do Relatório Oficial</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: #cbd5e1; font-size: 11px; margin-right: 8px;">💡 Dica: na janela de impressão, escolha a impressora <strong>"Salvar como PDF"</strong>.</span>
                    <button class="btn-imprimir" onclick="window.print()">
                        🖨️ Imprimir / Salvar como PDF
                    </button>
                    <button class="btn-fechar" onclick="window.close()">
                        Fechar
                    </button>
                </div>
            </div>

            <div class="documento-container">
                <!-- CABEÇALHO INSTITUCIONAL COM LOGO -->
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0284c7; padding-bottom: 10px; margin-bottom: 12px;">
                    <div style="width: 80px; height: 75px; display: flex; align-items: center; justify-content: center; overflow: hidden; shrink: 0;">
                        <img src="${logoSrc}" alt="Brasão/Logo" style="max-width: 100%; max-height: 100%; object-fit: contain;">
                    </div>
                    <div style="flex: 1; text-align: center; padding: 0 15px;">
                        <div style="font-size: 13.5px; font-weight: 900; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px;">${enteNome}</div>
                        <div style="font-size: 11px; font-weight: 700; color: #334155; text-transform: uppercase; margin-top: 1px;">${secretariaNome}</div>
                        <div style="font-size: 13px; font-weight: 900; color: #0284c7; text-transform: uppercase; margin-top: 5px;">
                            ${tipoRelatorio === 'COMPLETO' ? 'CADERNO ORÇAMENTÁRIO COMPLETO & MEMÓRIA ANALÍTICA DE PREÇOS' : 'PLANILHA ORÇAMENTÁRIA DE OBRAS E SERVIÇOS DE ENGENHARIA'}
                        </div>
                    </div>
                    <div style="width: 80px; text-align: right; font-size: 8.5px; color: #64748b;">
                        <div>SINAPI OFICIAL</div>
                        <div style="font-weight: bold; color: #0f172a;">CAIXA / IBGE</div>
                    </div>
                </div>

                <!-- QUADRO DE METADADOS DA OBRA -->
                <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; font-size: 9.5px;">
                    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 6px; margin-bottom: 4px;">
                        <div><span style="color: #64748b; font-weight: bold;">OBRA: </span><strong style="font-size: 10.5px; color: #0f172a;">${orc.nomeObra}</strong></div>
                        <div><span style="color: #64748b; font-weight: bold;">LOCALIDADE: </span><strong>${orc.local} (${orc.uf || 'PB'})</strong></div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; border-top: 1px solid #e2e8f0; padding-top: 4px;">
                        <div><span style="color: #64748b;">DATA-BASE: </span><strong>${orc.dataBaseSinapi}</strong></div>
                        <div><span style="color: #64748b;">REGIME: </span><strong>${orc.regimeDesoneracao === 'DESONERADO' ? 'Com Desoneração (CPRB)' : 'Sem Desoneração'}</strong></div>
                        <div><span style="color: #64748b;">BDI APLICADO: </span><strong style="color: #0284c7;">${bdiFormatado}%</strong></div>
                        <div><span style="color: #64748b;">DATA DE EMISSÃO: </span><strong>${dataEmissao}</strong></div>
                    </div>
                </div>

                <!-- 1. PLANILHA SINTÉTICA -->
                <h3 style="font-size: 12px; text-transform: uppercase; font-weight: 800; color: #0f172a; border-bottom: 1.5px solid #0284c7; padding-bottom: 3px; margin: 0 0 8px 0;">
                    1. Planilha Orçamentária Sintética
                </h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; border: 1px solid #cbd5e1;">
                    <thead>
                        <tr style="background-color: #0f172a; color: white; text-transform: uppercase; font-size: 9px; letter-spacing: 0.3px;">
                            <th style="padding: 6px 4px; text-align: center; width: 35px;">Item</th>
                            <th style="padding: 6px 5px; text-align: center; width: 60px;">Código</th>
                            <th style="padding: 6px 8px; text-align: left;">Descrição dos Serviços</th>
                            <th style="padding: 6px 4px; text-align: center; width: 35px;">Und</th>
                            <th style="padding: 6px 5px; text-align: right; width: 55px;">Quant.</th>
                            <th style="padding: 6px 5px; text-align: right; width: 75px;">Unit. s/ BDI</th>
                            <th style="padding: 6px 5px; text-align: right; width: 75px;">Unit. c/ BDI</th>
                            <th style="padding: 6px 6px; text-align: right; width: 85px;">Total (R$)</th>
                            <th style="padding: 6px 4px; text-align: right; width: 45px;">%</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tabelaItensHtml}
                        <!-- TOTAL GERAL -->
                        <tr style="background-color: #0f172a; color: white; font-weight: 900; font-size: 11px;">
                            <td colspan="5" style="padding: 8px 10px; text-transform: uppercase;">VALOR TOTAL GERAL DA OBRA</td>
                            <td style="padding: 8px 6px; text-align: right; font-family: monospace; font-size: 10px; color: #94a3b8;">R$ ${orc.valorTotalSemBdi.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td style="padding: 8px 6px; text-align: right; font-size: 10px; color: #38bdf8;">BDI ${bdiFormatado}%</td>
                            <td style="padding: 8px 8px; text-align: right; font-family: monospace; font-size: 12px; color: #34d399;">R$ ${orc.valorTotalComBdi.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td style="padding: 8px 4px; text-align: right; color: #38bdf8;">100%</td>
                        </tr>
                    </tbody>
                </table>

                <!-- SEÇÕES EXTRAS SE FOR CADERNO COMPLETO -->
                ${secaoBdiHtml}
                ${secaoCronogramaHtml}
                ${secaoComposicoesAnaliticasHtml}

                <!-- QUADRO DE ASSINATURAS -->
                ${quadroAssinaturasHtml}

                <!-- RODAPÉ LEGAL -->
                <div style="margin-top: 20px; font-size: 8px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 6px;">
                    Orçamento elaborado com base nos custos referenciais oficiais do SINAPI (Caixa Econômica Federal) • GeoGestor Obras Públicas • Lei Federal nº 14.133/2021
                </div>
            </div>
        </body>
        </html>
        `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.open();
            printWindow.document.write(docHtml);
            printWindow.document.close();
        } else {
            alert('Por favor, permita pop-ups no navegador para visualizar e imprimir o PDF do orçamento.');
        }
    };

})();
