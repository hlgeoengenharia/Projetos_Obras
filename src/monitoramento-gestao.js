// src/monitoramento-gestao.js - Painel de Controle, Mapa Tático e Métricas de Fiscalização de Campo
// Sistema de Gestão Territorial e Monitoramento de Vistorias em Tempo Real

(function() {
    'use strict';

    let mapMonitoramento = null;
    let markersLayer = null;
    let trilhasLayer = null;
    let vistoriasLayer = null;
    let currentAdminProfile = null;
    let allFiscaisStatus = [];
    let allMetricasConfig = [];
    let selectedFiscalId = null;
    let activeDataFiltro = 'hoje';
    let activeUnidadeFiltro = '';
    let activeSetorFiltro = '';

    function getL() {
        if (typeof L !== 'undefined') return L;
        if (typeof window !== 'undefined' && window.L) return window.L;
        if (typeof window !== 'undefined' && window.parent && window.parent.L) return window.parent.L;
        if (typeof window !== 'undefined' && window.top && window.top.L) return window.top.L;
        return null;
    }

    const MonitoramentoManager = {
        init: async function() {
            try {
                if (typeof supabaseClient === 'undefined' || !supabaseClient) return;

                // 1. Checa autenticação e perfil
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (!user) return;

                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle();

                currentAdminProfile = profile || { id: user.id, email: user.email };
                const isAdmin = currentAdminProfile.papel === 'admin' || 
                                !!currentAdminProfile.super_admin || 
                                !!currentAdminProfile.is_superadmin || 
                                !!currentAdminProfile.unidade_admin;

                // Controla visibilidade do botão da aba
                const tabBtn = document.getElementById('tab-btn-monitoramento');
                if (tabBtn) {
                    tabBtn.style.display = isAdmin ? 'flex' : 'none';
                }

                if (!isAdmin) return;

                function extrairStringSegura(val) {
                    if (!val) return '';
                    if (typeof val === 'string') return val.trim();
                    if (Array.isArray(val) && val.length > 0) return String(val[0]).trim();
                    return '';
                }

                // Inicializa filtros de unidade e setor padrão
                activeUnidadeFiltro = extrairStringSegura(currentAdminProfile.unidade);
                activeSetorFiltro = extrairStringSegura(currentAdminProfile.setor);

                // 2. Carrega métricas, fiscais e inicializa mapa
                await this.carregarMetricasConfig();
                await this.carregarFiscais();
                this.initMapa();
                this.renderMetricasCards();
                this.renderListaFiscais();

            } catch (err) {
                console.warn('[MonitoramentoManager] Erro na inicialização:', err);
            }
        },

        invalidarMapa: function() {
            if (mapMonitoramento) {
                mapMonitoramento.invalidateSize();
            }
        },

        // Inicializa o mapa Leaflet
        initMapa: function() {
            const mapContainer = document.getElementById('mapa-monitoramento-fiscais');
            if (!mapContainer || mapMonitoramento) return;

            const Leaflet = getL();
            if (!Leaflet) {
                setTimeout(() => this.initMapa(), 200);
                return;
            }

            if (mapContainer._leaflet_id && mapMonitoramento) {
                mapMonitoramento.invalidateSize();
                return;
            }

            // Coordenadas padrão do município ativo ou Paraíba
            let defaultLat = -7.115;
            let defaultLng = -34.863;
            let defaultZoom = 13;

            try {
                const savedCoords = sessionStorage.getItem('municipio_ativo_coords');
                if (savedCoords) {
                    const parsed = JSON.parse(savedCoords);
                    if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
                        defaultLat = parsed.lat;
                        defaultLng = parsed.lng;
                        defaultZoom = parsed.zoom || 14;
                    }
                } else {
                    const munNome = sessionStorage.getItem('municipio_ativo_nome');
                    if (munNome && typeof munNome === 'string') {
                        const clean = munNome.toLowerCase();
                        if (clean.includes('cabedelo')) {
                            defaultLat = -6.981;
                            defaultLng = -34.833;
                            defaultZoom = 14;
                        } else if (clean.includes('joao pessoa') || clean.includes('joão pessoa')) {
                            defaultLat = -7.115;
                            defaultLng = -34.863;
                            defaultZoom = 13;
                        } else if (clean.includes('campina grande')) {
                            defaultLat = -7.225;
                            defaultLng = -35.885;
                            defaultZoom = 13;
                        }
                    }
                }
            } catch(e) {}

            mapMonitoramento = Leaflet.map(mapContainer, {
                zoomControl: true,
                attributionControl: false
            }).setView([defaultLat, defaultLng], defaultZoom);

            // Camadas Base idênticas ao index.html
            const layerMapa = Leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxNativeZoom: 19,
                maxZoom: 24
            });

            const layerGoogleSatelite = Leaflet.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                subdomains: ['0', '1', '2', '3'],
                maxNativeZoom: 21,
                maxZoom: 24,
                keepBuffer: 8,
                updateWhenIdle: false,
                attribution: '&copy; Google Maps'
            });

            const layerEsriSatelite = Leaflet.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri',
                maxNativeZoom: 19,
                maxZoom: 24
            });

            const baseLayers = {
                'Mapa': layerMapa,
                'Satélite (Google)': layerGoogleSatelite,
                'Satélite (Esri)': layerEsriSatelite
            };

            // Adiciona camada base padrão (Mapa)
            layerMapa.addTo(mapMonitoramento);

            // Controle para alternar Mapa e Satélite no canto superior direito
            Leaflet.control.layers(baseLayers, null, { position: 'topright' }).addTo(mapMonitoramento);

            markersLayer = Leaflet.featureGroup().addTo(mapMonitoramento);
            trilhasLayer = Leaflet.featureGroup().addTo(mapMonitoramento);
            vistoriasLayer = Leaflet.featureGroup().addTo(mapMonitoramento);

            // Invalida tamanho após renderização para evitar cinza no Leaflet
            setTimeout(() => {
                if (mapMonitoramento) mapMonitoramento.invalidateSize();
            }, 300);
        },

        // Carrega configurações de métricas salvas pelo Admin
        carregarMetricasConfig: async function() {
            try {
                if (typeof supabaseClient === 'undefined' || !supabaseClient) return;

                let query = supabaseClient
                    .from('fiscal_metricas_config')
                    .select('*')
                    .eq('ativo', true);

                if (!currentAdminProfile?.super_admin && activeUnidadeFiltro) {
                    query = query.or(`unidade.eq."${activeUnidadeFiltro}",unidade.is.null`);
                }

                const { data, error } = await query;
                if (!error && data) {
                    allMetricasConfig = data;
                }
            } catch (e) {
                console.warn('[MonitoramentoManager] Tabela de métricas ainda não configurada:', e.message);
                allMetricasConfig = [];
            }
        },

        // Carrega fiscais ativos e status consolidado (profiles com fiscal_campo = true cruzados com telemetria GPS)
        carregarFiscais: async function() {
            try {
                if (typeof supabaseClient === 'undefined' || !supabaseClient) return;

                // 1. Busca usuários da Unidade marcados com fiscal_campo = true
                let queryProfiles = supabaseClient
                    .from('profiles')
                    .select('id, nome, email, unidade, setor, cargo, fiscal_campo, entidade, papel, super_admin, unidade_admin');

                if (!currentAdminProfile?.super_admin && activeUnidadeFiltro) {
                    queryProfiles = queryProfiles.eq('unidade', activeUnidadeFiltro);
                }

                const { data: profilesData } = await queryProfiles;

                // 2. Busca telemetria em tempo real
                let queryStatus = supabaseClient
                    .from('fiscal_status_atual')
                    .select('*')
                    .order('ultima_atualizacao', { ascending: false });

                if (!currentAdminProfile?.super_admin && activeUnidadeFiltro) {
                    queryStatus = queryStatus.eq('unidade', activeUnidadeFiltro);
                }
                if (activeSetorFiltro) {
                    queryStatus = queryStatus.eq('setor', activeSetorFiltro);
                }

                const { data: statusData } = await queryStatus;
                const statusMap = {};
                if (statusData && Array.isArray(statusData)) {
                    statusData.forEach(s => { statusMap[s.user_id] = s; });
                }

                // 3. Cruza os usuários que possuem fiscal_campo === true
                let listaFiscais = [];
                if (profilesData && Array.isArray(profilesData)) {
                    listaFiscais = profilesData
                        .filter(p => !!p.fiscal_campo)
                        .map(p => {
                            const st = statusMap[p.id] || {};
                            return {
                                user_id: p.id,
                                user_nome: p.nome || (p.email ? p.email.split('@')[0] : 'Fiscal'),
                                unidade: p.unidade || activeUnidadeFiltro || '',
                                setor: p.setor || '',
                                cargo: p.cargo || 'Fiscal de Campo',
                                fiscal_campo: true,
                                em_jornada: !!st.em_jornada,
                                status_atividade: st.status_atividade || 'offline',
                                latitude: st.latitude || null,
                                longitude: st.longitude || null,
                                km_percorridos_hoje: st.km_percorridos_hoje || 0,
                                total_vistorias_hoje: st.total_vistorias_hoje || 0,
                                bateria_nivel: st.bateria_nivel || 100,
                                ultima_atualizacao: st.ultima_atualizacao || null
                            };
                        });
                }

                // Fallback seguro caso não haja perfis marcados ainda
                if (listaFiscais.length === 0 && statusData && statusData.length > 0) {
                    listaFiscais = statusData;
                }

                allFiscaisStatus = listaFiscais;
            } catch (e) {
                console.warn('[MonitoramentoManager] Status de fiscais vazio ou pendente de migração:', e.message);
                allFiscaisStatus = [];
            }
        },

        // Computa registros e breakdown das opções para cada métrica dinâmica
        computarRegistrosMetrica: async function(m) {
            if (m._computado) return m;

            m._breakdown = {};
            m._registros = [];
            m._total = 0;

            try {
                if (typeof supabaseClient === 'undefined' || !supabaseClient || !m.camada_id) return m;

                const { data: feicoes, error } = await supabaseClient
                    .from('feicoes')
                    .select('id, theme_id, propriedades, created_at, updated_at')
                    .eq('theme_id', m.camada_id)
                    .limit(1000);

                if (!error && feicoes && Array.isArray(feicoes)) {
                    feicoes.forEach(feat => {
                        const props = feat.propriedades || {};
                        const targetField = m.campo_nome;

                        // Função auxiliar para extrair todas as opções marcadas
                        const extrairOpcoes = (v) => {
                            if (v === undefined || v === null || v === '') return [];
                            if (Array.isArray(v)) {
                                return v.flatMap(item => extrairOpcoes(item));
                            }
                            if (typeof v === 'object') {
                                const marcados = [];
                                Object.entries(v).forEach(([k, isMarked]) => {
                                    if (isMarked === true || isMarked === 'true' || isMarked === 1 || isMarked === '1') {
                                        marcados.push(k);
                                    }
                                });
                                return marcados;
                            }
                            if (typeof v === 'boolean') {
                                return v ? ['Marcado (Sim)'] : [];
                            }
                            const str = String(v).trim();
                            if (!str || str === 'false') return [];
                            if (str === 'true') return ['Marcado (Sim)'];
                            if (str.startsWith('[') && str.endsWith(']')) {
                                try {
                                    const parsed = JSON.parse(str);
                                    if (Array.isArray(parsed)) return extrairOpcoes(parsed);
                                } catch(e) {}
                            }
                            return [str];
                        };

                        // Função auxiliar para registrar valores e opções
                        const processarValor = (val, itemContext = null) => {
                            const opcoes = extrairOpcoes(val);
                            if (opcoes.length === 0) return;

                            opcoes.forEach(rotulo => {
                                m._breakdown[rotulo] = (m._breakdown[rotulo] || 0) + 1;
                                m._total++;

                                m._registros.push({
                                    feicao_id: feat.id,
                                    camada_id: m.camada_id,
                                    campo: targetField,
                                    opcao: rotulo,
                                    fiscal: (itemContext && (itemContext.fiscal_nome || itemContext.fiscal || itemContext.usuario || itemContext.fiscal_responsavel || itemContext.criado_por_nome)) || props._fiscal_nome || props.fiscal || props.usuario || 'Fiscal Responsável',
                                    data: (itemContext && (itemContext.data_vistoria || itemContext.data || itemContext.created_at || itemContext.data_hora)) || feat.updated_at || feat.created_at || new Date().toISOString(),
                                    resumo_feicao: props['NOME'] || props['Nome'] || props['INSC. IMOBILIÁRIA'] || props['Inscrição Imobiliária'] || props['ENDEREÇO'] || props['Endereço'] || `Feição #${String(feat.id).substring(0, 8)}`
                                });
                            });
                        };

                        // 1. Checa campo na aba principal (1:1)
                        if (targetField && props[targetField] !== undefined) {
                            processarValor(props[targetField]);
                        }

                        // 2. Checa em todas as sub-abas 1:N que a feição tiver
                        Object.keys(props).forEach(k => {
                            let valObj = props[k];
                            if (typeof valObj === 'string' && valObj.startsWith('[') && valObj.endsWith(']')) {
                                try { valObj = JSON.parse(valObj); } catch(e) {}
                            }
                            if (Array.isArray(valObj)) {
                                valObj.forEach(subItem => {
                                    if (subItem && typeof subItem === 'object') {
                                        if (targetField && subItem[targetField] !== undefined) {
                                            processarValor(subItem[targetField], subItem);
                                        } else if (!targetField) {
                                            // Se nenhum campo foi especificado, conta cada registro de vistoria 1:N
                                            processarValor('Vistoria Registrada', subItem);
                                        }
                                    }
                                });
                            }
                        });

                        // Se nenhum campo foi configurado, cada feição conta como 1 registro geral
                        if (!targetField && m._registros.every(r => r.feicao_id !== feat.id)) {
                            processarValor('Registro Geral');
                        }
                    });
                }
            } catch(e) {
                console.warn('[MonitoramentoManager] Erro ao computar métrica:', e.message);
            }

            m._computado = true;
            return m;
        },

        // Renderiza os Cards de Métricas Superiores
        renderMetricasCards: async function() {
            const container = document.getElementById('monitoramento-metricas-cards');
            if (!container) return;

            const ativosCount = allFiscaisStatus.filter(f => f.em_jornada && f.status_atividade !== 'offline').length;
            const kmTotalEquipe = allFiscaisStatus.reduce((acc, f) => acc + (f.km_percorridos_hoje || 0), 0);
            const vistoriasTotalEquipe = allFiscaisStatus.reduce((acc, f) => acc + (f.total_vistorias_hoje || 0), 0);

            // Cards nativos de telemetria
            let cardsHtml = `
                <!-- Card 1: Fiscais em Campo -->
                <div class="builder-card rounded-lg p-3 flex flex-col justify-between shadow-xs">
                    <div class="flex items-center justify-between">
                        <span class="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Fiscais em Campo</span>
                        <span class="relative flex h-2.5 w-2.5">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                    </div>
                    <div class="my-1.5 flex items-baseline gap-1.5">
                        <span class="text-2xl font-black text-emerald-700 dark:text-emerald-400">${ativosCount}</span>
                        <span class="text-xs text-slate-500 dark:text-slate-400 font-semibold">ativos agora</span>
                    </div>
                    <span class="text-[10px] text-slate-400">Total monitorado: ${allFiscaisStatus.length}</span>
                </div>

                <!-- Card 2: Vistorias do Dia -->
                <div class="builder-card rounded-lg p-3 flex flex-col justify-between shadow-xs">
                    <div class="flex items-center justify-between">
                        <span class="text-[11px] font-bold text-sky-800 dark:text-sky-300 uppercase tracking-wider">Vistorias Concluídas</span>
                        <span class="material-symbols-outlined text-sky-600 dark:text-sky-400 text-[18px]">verified</span>
                    </div>
                    <div class="my-1.5 flex items-baseline gap-1.5">
                        <span class="text-2xl font-black text-sky-700 dark:text-sky-400">${vistoriasTotalEquipe}</span>
                        <span class="text-xs text-slate-500 dark:text-slate-400 font-semibold">hoje</span>
                    </div>
                    <span class="text-[10px] text-slate-400">Registros georreferenciados</span>
                </div>

                <!-- Card 3: Quilometragem da Equipe -->
                <div class="builder-card rounded-lg p-3 flex flex-col justify-between shadow-xs">
                    <div class="flex items-center justify-between">
                        <span class="text-[11px] font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider">Km Percorridos</span>
                        <span class="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-[18px]">route</span>
                    </div>
                    <div class="my-1.5 flex items-baseline gap-1.5">
                        <span class="text-2xl font-black text-indigo-700 dark:text-indigo-400">${kmTotalEquipe.toFixed(1)}</span>
                        <span class="text-xs text-slate-500 dark:text-slate-400 font-semibold">km</span>
                    </div>
                    <span class="text-[10px] text-slate-400">Soma da rota dos fiscais</span>
                </div>
            `;

            // Computa cada métrica dinâmica com separação automática por opção
            for (const m of allMetricasConfig) {
                await this.computarRegistrosMetrica(m);

                const corMap = {
                    sky: 'text-sky-700 dark:text-sky-400',
                    emerald: 'text-emerald-700 dark:text-emerald-400',
                    amber: 'text-amber-700 dark:text-amber-400',
                    rose: 'text-rose-700 dark:text-rose-400',
                    purple: 'text-purple-700 dark:text-purple-400'
                };
                const corClass = corMap[m.cor] || 'text-sky-700 dark:text-sky-400';

                // Pílulas das opções do breakdown automático
                const breakdownEntries = Object.entries(m._breakdown || {});
                let breakdownPillsHtml = '';
                if (breakdownEntries.length > 0) {
                    breakdownPillsHtml = `
                        <div class="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5 flex-wrap">
                            ${breakdownEntries.slice(0, 4).map(([opcao, qtd]) => `
                                <span class="inline-flex items-center gap-1 text-[9.5px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                    <span class="truncate max-w-[85px]" title="${opcao}">${opcao}:</span>
                                    <strong class="text-primary font-black">${qtd}</strong>
                                </span>
                            `).join('')}
                            ${breakdownEntries.length > 4 ? `<span class="text-[9px] text-slate-400">+${breakdownEntries.length - 4} mais</span>` : ''}
                        </div>
                    `;
                }

                cardsHtml += `
                    <div class="builder-card rounded-lg p-3 flex flex-col justify-between shadow-xs relative group cursor-pointer hover:border-primary/50 transition-all" onclick="window.MonitoramentoManager.abrirDetalheMetrica('${m.id}')" title="Clique para ver vistorias e abrir a Ficha Cadastral">
                        <div class="flex items-center justify-between">
                            <span class="text-[11px] font-bold ${corClass} uppercase tracking-wider truncate" title="${m.nome}">${m.nome}</span>
                            <span class="material-symbols-outlined ${corClass} text-[18px]">${m.icone || 'insights'}</span>
                        </div>
                        <div class="my-1.5 flex items-baseline gap-1.5">
                            <span class="text-2xl font-black ${corClass}">${m._total || 0}</span>
                            <span class="text-xs text-slate-500 dark:text-slate-400 font-semibold">registros</span>
                        </div>
                        ${breakdownPillsHtml}
                        <div class="flex items-center justify-between text-[10px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                            <span class="truncate max-w-[130px] font-medium" title="Campo: ${m.campo_nome || 'Todas as vistorias'}">Campo: ${m.campo_nome || 'Todas as vistorias'}</span>
                            <button onclick="event.stopPropagation(); window.MonitoramentoManager.excluirMetrica('${m.id}')" class="opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-700 transition-opacity p-0.5" title="Remover Indicador">
                                <span class="material-symbols-outlined text-[14px]">delete</span>
                            </button>
                        </div>
                    </div>
                `;
            }

            container.innerHTML = cardsHtml;
        },

        // Renderiza a lista de fiscais à direita do mapa
        renderListaFiscais: function() {
            const listEl = document.getElementById('monitoramento-fiscais-lista');
            if (!listEl) return;

            if (allFiscaisStatus.length === 0) {
                listEl.innerHTML = `
                    <div class="p-8 text-center text-slate-400 text-xs italic">
                        <span class="material-symbols-outlined text-[32px] block mb-2 opacity-30">person_search</span>
                        Nenhum fiscal em campo registrado nesta unidade no momento.
                    </div>
                `;
                return;
            }

            listEl.innerHTML = allFiscaisStatus.map(f => {
                const isOnline = f.em_jornada && f.status_atividade !== 'offline';
                const statusBadge = isOnline 
                    ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Ativo</span>`
                    : `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">Offline</span>`;

                return `
                    <div class="builder-card rounded-lg p-2.5 transition-all hover:border-primary/50 cursor-pointer shadow-xs" onclick="window.MonitoramentoManager.focarFiscal('${f.user_id}')">
                        <div class="flex items-center justify-between mb-1.5">
                            <div class="flex items-center gap-2 min-w-0">
                                <div class="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                                    ${(f.user_nome || 'F').substring(0, 2).toUpperCase()}
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">${f.user_nome || 'Fiscal'}</h4>
                                    <span class="text-[10px] text-slate-500 dark:text-slate-400 truncate block">${f.setor || f.unidade || 'Fiscal de Campo'}</span>
                                </div>
                            </div>
                            ${statusBadge}
                        </div>

                        <div class="grid grid-cols-3 gap-1 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-600 dark:text-slate-300">
                            <div>
                                <span class="text-slate-400 block text-[9px]">Vistorias</span>
                                <strong class="font-bold text-sky-600">${f.total_vistorias_hoje || 0}</strong>
                            </div>
                            <div>
                                <span class="text-slate-400 block text-[9px]">Distância</span>
                                <strong class="font-bold text-indigo-600">${(f.km_percorridos_hoje || 0).toFixed(1)} km</strong>
                            </div>
                            <div>
                                <span class="text-slate-400 block text-[9px]">Bateria</span>
                                <strong class="font-bold ${f.bateria_nivel < 20 ? 'text-rose-600' : 'text-emerald-600'}">${Math.round(f.bateria_nivel || 100)}%</strong>
                            </div>
                        </div>

                        <div class="mt-2 flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                            <button type="button" onclick="event.stopPropagation(); window.MonitoramentoManager.focarFiscal('${f.user_id}')" class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-600 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 transition-colors flex items-center gap-1">
                                <span class="material-symbols-outlined text-[13px]">my_location</span> Focar
                            </button>
                            <button type="button" onclick="event.stopPropagation(); window.MonitoramentoManager.abrirTimelineFiscal('${f.user_id}')" class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors flex items-center gap-1">
                                <span class="material-symbols-outlined text-[13px]">timeline</span> Vistorias
                            </button>
                            <button type="button" onclick="event.stopPropagation(); window.MonitoramentoManager.irParaUsuario('${f.user_id}')" class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-sky-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-sky-600 border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1" title="Ver ou editar permissões deste usuário em Usuários">
                                <span class="material-symbols-outlined text-[13px]">person_edit</span> Perfil
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            // Atualiza os marcadores no mapa
            this.atualizarMarcadoresMapa();
        },

        // Atualiza os marcadores de fiscais no mapa tático
        atualizarMarcadoresMapa: function() {
            const Leaflet = getL();
            if (!mapMonitoramento || !markersLayer || !Leaflet) return;
            markersLayer.clearLayers();

            const bounds = [];

            allFiscaisStatus.forEach(f => {
                if (!f.latitude || !f.longitude) return;

                const latLng = [f.latitude, f.longitude];
                bounds.push(latLng);

                const isOnline = f.em_jornada && f.status_atividade !== 'offline';
                const pulseClass = isOnline ? 'animate-pulse' : '';
                const corPonto = isOnline ? '#10b981' : '#94a3b8';

                // Marcador HTML customizado
                const customIcon = Leaflet.divIcon({
                    className: 'fiscal-marker-icon',
                    html: `
                        <div class="relative flex items-center justify-center w-8 h-8 rounded-full shadow-md border-2 border-white dark:border-slate-800" style="background-color: ${corPonto};">
                            <span class="material-symbols-outlined text-white text-[18px]">person_pin</span>
                            ${isOnline ? `<span class="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border border-white ${pulseClass}"></span>` : ''}
                        </div>
                    `,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                });

                const marker = Leaflet.marker(latLng, { icon: customIcon });
                marker.bindPopup(`
                    <div class="p-2 text-xs">
                        <strong class="font-bold text-slate-800 block">${f.user_nome || 'Fiscal'}</strong>
                        <span class="text-slate-500 text-[11px] block">${f.setor || f.unidade || 'Campo'}</span>
                        <div class="mt-1.5 text-[10px] text-slate-600">
                            <div>Vistorias Hoje: <strong>${f.total_vistorias_hoje || 0}</strong></div>
                            <div>Km Percorridos: <strong>${(f.km_percorridos_hoje || 0).toFixed(1)} km</strong></div>
                            <div>Bateria: <strong>${Math.round(f.bateria_nivel || 100)}%</strong></div>
                        </div>
                        <button onclick="window.MonitoramentoManager.abrirTimelineFiscal('${f.user_id}')" class="mt-2 w-full py-1 text-center bg-primary text-white text-[10px] font-bold rounded">Ver Vistorias</button>
                    </div>
                `);

                markersLayer.addLayer(marker);
            });

            if (bounds.length > 0 && !selectedFiscalId) {
                mapMonitoramento.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
            }
        },

        // Centraliza o mapa em um fiscal específico e desenha sua trilha
        focarFiscal: async function(userId) {
            selectedFiscalId = userId;
            const fiscal = allFiscaisStatus.find(f => f.user_id === userId);
            if (!fiscal || !fiscal.latitude || !fiscal.longitude || !mapMonitoramento) return;

            mapMonitoramento.setView([fiscal.latitude, fiscal.longitude], 16, { animate: true });

            // Carrega e desenha a trilha do dia deste fiscal
            await this.desenharTrilhaFiscal(userId);
        },

        // Desenha a linha de rota do fiscal no mapa
        desenharTrilhaFiscal: async function(userId) {
            const Leaflet = getL();
            if (!trilhasLayer || !vistoriasLayer || !Leaflet || typeof supabaseClient === 'undefined') return;
            trilhasLayer.clearLayers();
            vistoriasLayer.clearLayers();

            try {
                const { data, error } = await supabaseClient
                    .from('fiscal_posicoes')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: true })
                    .limit(500);

                if (!error && data && data.length > 1) {
                    const latLngs = data.map(p => [p.latitude, p.longitude]);
                    const polyline = Leaflet.polyline(latLngs, {
                        color: '#0284c7',
                        weight: 4,
                        opacity: 0.8,
                        dashArray: '6, 6'
                    });
                    trilhasLayer.addLayer(polyline);

                    // Adiciona pinos numerados nas vistorias
                    let countVistoria = 0;
                    data.forEach(p => {
                        if (p.status_atividade === 'vistoria' || p.vistoria_id) {
                            countVistoria++;
                            const vistoriaIcon = Leaflet.divIcon({
                                className: 'vistoria-marker-icon',
                                html: `
                                    <div class="w-6 h-6 rounded-full bg-amber-500 text-white font-black text-[11px] flex items-center justify-center border-2 border-white shadow-md">
                                        ${countVistoria}
                                    </div>
                                `,
                                iconSize: [24, 24],
                                iconAnchor: [12, 12]
                            });
                            const vMarker = Leaflet.marker([p.latitude, p.longitude], { icon: vistoriaIcon });
                            vMarker.bindPopup(`
                                <div class="p-1 text-xs">
                                    <strong>Vistoria #${countVistoria}</strong><br>
                                    <span class="text-[10px] text-slate-500">${new Date(p.created_at).toLocaleTimeString('pt-BR')}</span>
                                </div>
                            `);
                            vistoriasLayer.addLayer(vMarker);
                        }
                    });
                }
            } catch(e) {}
        },

        // Modal para criar nova métrica dinâmica (Opção 2 - Inteligência de Permissões e Campos)
        abrirModalNovaMetrica: async function() {
            const modal = document.getElementById('modal-metrica-fiscal');
            if (modal) modal.classList.remove('hidden');

            const selectCamada = document.getElementById('metrica-camada-select');
            if (!selectCamada) return;

            selectCamada.innerHTML = '<option value="">Carregando camadas municipais...</option>';

            let temas = [];
            try {
                if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                    const munAtivo = sessionStorage.getItem('municipio_ativo') || (typeof activeMunicipioId !== 'undefined' ? activeMunicipioId : null);
                    let q = supabaseClient.from('temas').select('id, nome, tipo_cadastro, municipio_id, entidade').order('nome', { ascending: true });
                    if (munAtivo) q = q.eq('municipio_id', munAtivo);
                    const { data, error } = await q;
                    if (!error && data && data.length > 0) temas = data;
                }
            } catch(e) {}

            if (temas.length === 0 && window._allTemas && Array.isArray(window._allTemas)) {
                temas = window._allTemas;
            }
            if (temas.length === 0 && typeof forms !== 'undefined' && Array.isArray(forms)) {
                temas = forms.map(f => ({ id: f.id, nome: f.name || f.title || 'Formulário', tipo_cadastro: f.id }));
            }

            if (temas.length > 0) {
                selectCamada.innerHTML = '<option value="">-- Selecione a Camada --</option>' +
                    temas.map(t => `<option value="${t.id}" data-tipo="${t.tipo_cadastro || ''}">${t.nome}</option>`).join('');
                
                // Seleciona a primeira camada por padrão para agilizar a experiência
                const primeiro = temas[0];
                selectCamada.value = primeiro.id;
                await this.onCamadaChange(primeiro.id);
            } else {
                selectCamada.innerHTML = '<option value="">Nenhuma camada encontrada</option>';
            }
        },

        fecharModalNovaMetrica: function() {
            const modal = document.getElementById('modal-metrica-fiscal');
            if (modal) modal.classList.add('hidden');
        },

        onCamadaChange: async function(camadaId) {
            if (!camadaId) {
                const selectCampo = document.getElementById('metrica-campo-select');
                if (selectCampo) selectCampo.innerHTML = '<option value="">-- Selecione a camada primeiro --</option>';
                const containerFiscais = document.getElementById('metrica-fiscais-lista');
                if (containerFiscais) containerFiscais.innerHTML = '<div class="text-[11px] text-slate-400 italic py-2 text-center">Selecione uma camada acima.</div>';
                return;
            }

            // 1. Carrega campos da camada/formulário
            await this.carregarCamposDoFormulario(camadaId);

            // 2. Carrega e valida os fiscais da unidade para esta camada (Opção 2)
            await this.carregarFiscaisPermissaoCamada(camadaId);
        },

        carregarCamposDoFormulario: async function(camadaId) {
            const selectCampo = document.getElementById('metrica-campo-select');
            const inputCampo = document.getElementById('metrica-campo-input');
            const selectValor = document.getElementById('metrica-valor-select');
            if (!selectCampo) return;

            selectCampo.innerHTML = '<option value="">Carregando campos do formulário...</option>';

            let fieldsEncontrados = [];

            // A. Tenta achar em forms (global ou supabase)
            let formVinculado = null;
            if (typeof forms !== 'undefined' && Array.isArray(forms)) {
                const selectCamada = document.getElementById('metrica-camada-select');
                const optSelected = selectCamada?.options[selectCamada.selectedIndex];
                const tipoCadastro = optSelected?.getAttribute('data-tipo');
                formVinculado = forms.find(f => f.id === camadaId || f.id === tipoCadastro);
            }

            if (!formVinculado && typeof supabaseClient !== 'undefined' && supabaseClient) {
                try {
                    const { data: tema } = await supabaseClient.from('temas').select('tipo_cadastro').eq('id', camadaId).maybeSingle();
                    const formId = tema?.tipo_cadastro || camadaId;
                    const { data: fData } = await supabaseClient.from('forms').select('*').eq('id', formId).maybeSingle();
                    if (fData) {
                        let tabs = fData.schema;
                        if (fData.schema && !Array.isArray(fData.schema) && fData.schema.tabs) tabs = fData.schema.tabs;
                        formVinculado = { id: fData.id, tabs };
                    }
                } catch(e) {}
            }

            if (formVinculado) {
                if (Array.isArray(formVinculado.tabs)) {
                    formVinculado.tabs.forEach(tab => {
                        const tabTitle = tab.title || 'Geral';
                        if (Array.isArray(tab.fields)) {
                            tab.fields.forEach(fld => {
                                if (fld.id && fld.type !== 'tab' && fld.type !== 'html' && fld.type !== 'section') {
                                    fieldsEncontrados.push({
                                        id: fld.id,
                                        label: `${fld.label || fld.id} (${tabTitle})`,
                                        type: fld.type,
                                        options: fld.options || []
                                    });
                                }
                            });
                        }
                    });
                } else if (Array.isArray(formVinculado.fields)) {
                    formVinculado.fields.forEach(fld => {
                        if (fld.id) {
                            fieldsEncontrados.push({
                                id: fld.id,
                                label: fld.label || fld.id,
                                type: fld.type,
                                options: fld.options || []
                            });
                        }
                    });
                }
            }

            this._camposDisponiveis = fieldsEncontrados;

            if (fieldsEncontrados.length > 0) {
                selectCampo.innerHTML = '<option value="">-- Qualquer registro / Todos os campos --</option>' +
                    fieldsEncontrados.map(f => `<option value="${f.id}">${f.label}</option>`).join('');
                if (inputCampo) inputCampo.value = '';
            } else {
                selectCampo.innerHTML = '<option value="">-- Qualquer registro nesta camada --</option>';
            }
        },

        onCampoChange: function(campoId) {
            const inputCampo = document.getElementById('metrica-campo-input');
            const selectValor = document.getElementById('metrica-valor-select');
            if (inputCampo) inputCampo.value = campoId || '';

            if (!campoId || !this._camposDisponiveis) {
                if (selectValor) selectValor.classList.add('hidden');
                return;
            }

            const fld = this._camposDisponiveis.find(f => f.id === campoId);
            if (fld && Array.isArray(fld.options) && fld.options.length > 0) {
                selectValor.innerHTML = '<option value="">-- Selecione uma opção padrão --</option>' +
                    fld.options.map(opt => {
                        const val = typeof opt === 'object' ? (opt.value || opt.label) : opt;
                        const lbl = typeof opt === 'object' ? (opt.label || opt.value) : opt;
                        return `<option value="${val}">${lbl}</option>`;
                    }).join('');
                selectValor.classList.remove('hidden');
            } else {
                if (selectValor) selectValor.classList.add('hidden');
            }
        },

        carregarFiscaisPermissaoCamada: async function(camadaId) {
            const container = document.getElementById('metrica-fiscais-lista');
            const badgeCount = document.getElementById('metrica-fiscais-count-badge');
            if (!container) return;

            container.innerHTML = '<div class="text-[11px] text-slate-400 italic py-2 text-center">Verificando permissões dos fiscais...</div>';

            try {
                // 1. Busca todos os fiscais de campo da Unidade
                let qProf = supabaseClient
                    .from('profiles')
                    .select('id, nome, email, unidade, setor, cargo, fiscal_campo, entidade, papel, super_admin, unidade_admin');

                if (!currentAdminProfile?.super_admin && activeUnidadeFiltro) {
                    qProf = qProf.eq('unidade', activeUnidadeFiltro);
                }

                const { data: profs } = await qProf;
                const fiscais = (profs || []).filter(p => !!p.fiscal_campo);

                if (badgeCount) {
                    badgeCount.textContent = `${fiscais.length} fiscal(is)`;
                }

                if (fiscais.length === 0) {
                    container.innerHTML = `
                        <div class="p-3 text-center text-slate-500 dark:text-slate-400 text-xs bg-amber-500/10 rounded-lg border border-amber-500/20">
                            Nenhum usuário marcado como <b>Fiscal de Campo</b> nesta unidade. Ative a chave "Fiscal de Campo" no perfil do usuário na aba Usuários.
                        </div>
                    `;
                    return;
                }

                // 2. Busca permissões da camada
                const { data: permsCamada } = await supabaseClient
                    .from('permissoes')
                    .select('*')
                    .eq('camada_id', camadaId);

                const permMap = {};
                (permsCamada || []).forEach(p => { permMap[p.user_id] = p; });

                // Renderiza cada fiscal com status e botão de atalho
                container.innerHTML = fiscais.map(f => {
                    const isSuper = !!(f.super_admin || f.unidade_admin || f.papel === 'admin');
                    const hasEditPerm = isSuper || !!(permMap[f.id] && (permMap[f.id].pode_editar || permMap[f.id].pode_criar));

                    const statusTag = hasEditPerm
                        ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800"><span class="material-symbols-outlined text-[13px]">check_circle</span> Liberado</span>`
                        : `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800"><span class="material-symbols-outlined text-[13px]">warning</span> Sem Permissão</span>`;

                    return `
                        <div class="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                            <div class="flex items-center gap-2 min-w-0 pr-2">
                                <div class="w-6 h-6 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                                    ${(f.nome || 'F').substring(0, 2).toUpperCase()}
                                </div>
                                <div class="min-w-0">
                                    <h5 class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${f.nome || f.email}</h5>
                                    <span class="text-[10px] text-slate-500 dark:text-slate-400 truncate block">${f.cargo || f.setor || 'Fiscal de Campo'}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                ${statusTag}
                                <button type="button" onclick="window.MonitoramentoManager.irParaUsuario('${f.id}')" class="px-2 py-1 rounded bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800 text-[10px] font-bold flex items-center gap-1 transition-colors" title="Abrir usuário na aba Usuários para gerenciar permissões">
                                    <span class="material-symbols-outlined text-[13px]">open_in_new</span>
                                    <span>Alterar</span>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');

            } catch (err) {
                container.innerHTML = `<div class="text-rose-500 text-xs p-2 text-center">Erro ao checar permissões: ${err.message}</div>`;
            }
        },

        irParaUsuario: function(userId) {
            this.fecharModalNovaMetrica();
            if (window.UsuariosManager && typeof window.UsuariosManager.abrirPerfilUsuario === 'function') {
                window.UsuariosManager.abrirPerfilUsuario(userId);
            } else if (typeof window.abrirPerfilUsuario === 'function') {
                window.abrirPerfilUsuario(userId);
            }
        },

        // Salva nova métrica no Supabase (com Inteligência de Agrupamento Automático)
        salvarNovaMetrica: async function() {
            const nome = document.getElementById('metrica-nome-input')?.value.trim();
            const camadaId = document.getElementById('metrica-camada-select')?.value.trim();
            const campoNome = document.getElementById('metrica-campo-select')?.value.trim() || document.getElementById('metrica-campo-input')?.value.trim() || null;
            const icone = document.getElementById('metrica-icone-select')?.value || 'assignment_turned_in';
            const cor = document.getElementById('metrica-cor-select')?.value || 'sky';

            if (!nome || !camadaId) {
                alert('Informe ao menos o Nome do Indicador e a Camada a ser monitorada.');
                return;
            }

            try {
                const payload = {
                    nome,
                    camada_id: camadaId,
                    campo_nome: campoNome,
                    condicao_operador: 'agrupado_automatico',
                    valor_comparacao: null,
                    tipo_calculo: 'agrupado',
                    icone,
                    cor,
                    unidade: activeUnidadeFiltro || null,
                    setor: activeSetorFiltro || null,
                    criado_por: currentAdminProfile?.id || null
                };

                await supabaseClient.from('fiscal_metricas_config').insert([payload]);
                this.fecharModalNovaMetrica();
                await this.carregarMetricasConfig();
                await this.renderMetricasCards();
            } catch (err) {
                alert('Erro ao salvar indicador: ' + err.message);
            }
        },

        // Abre modal de detalhamento do indicador (Breakdown por Opção + Lista de Vistorias)
        abrirDetalheMetrica: function(metricaId) {
            const m = allMetricasConfig.find(item => item.id === metricaId);
            if (!m) return;

            this._activeMetricaDetalhe = m;
            this._filtroOpcaoDetalhe = null;

            const modal = document.getElementById('modal-detalhe-metrica');
            const titulo = document.getElementById('detalhe-metrica-titulo');
            const subtitulo = document.getElementById('detalhe-metrica-subtitulo');

            if (!modal) return;
            modal.classList.remove('hidden');

            if (titulo) titulo.textContent = m.nome;
            if (subtitulo) subtitulo.textContent = `Camada: ${m.camada_id} • Campo: ${m.campo_nome || 'Todas as Ações'} • Total: ${m._total || 0} registros`;

            this.renderDetalheMetricaConteudo();
        },

        filtrarDetalhePorOpcao: function(opcao) {
            if (this._filtroOpcaoDetalhe === opcao || !opcao) {
                this._filtroOpcaoDetalhe = null;
            } else {
                this._filtroOpcaoDetalhe = opcao;
            }
            this.renderDetalheMetricaConteudo();
        },

        renderDetalheMetricaConteudo: function() {
            const m = this._activeMetricaDetalhe;
            if (!m) return;

            const breakdownBar = document.getElementById('detalhe-metrica-breakdown-bar');
            const lista = document.getElementById('detalhe-metrica-lista');

            // Preenche as pílulas do breakdown com cliques para filtrar
            const entries = Object.entries(m._breakdown || {});
            if (breakdownBar) {
                if (entries.length > 0) {
                    const isFiltrado = !!this._filtroOpcaoDetalhe;
                    breakdownBar.innerHTML = `
                        <div class="flex items-center gap-2 flex-wrap w-full">
                            <span class="font-bold text-slate-700 dark:text-slate-300 shrink-0 text-xs">Opções Identificadas:</span>
                            <button type="button" onclick="window.MonitoramentoManager.filtrarDetalhePorOpcao(null)" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${!isFiltrado ? 'bg-primary text-white shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:border-primary'}">
                                <span>Todas</span>
                                <strong class="bg-black/10 dark:bg-white/15 px-1.5 py-0.2 rounded font-black text-[11px]">${m._total || 0}</strong>
                            </button>
                            ${entries.map(([opc, qtd]) => {
                                const activeClass = (this._filtroOpcaoDetalhe === opc)
                                    ? 'bg-primary text-white border-primary shadow-xs ring-2 ring-primary/30'
                                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 hover:border-primary';
                                const badgeClass = (this._filtroOpcaoDetalhe === opc)
                                    ? 'bg-white/20 text-white'
                                    : 'bg-primary/10 text-primary dark:text-sky-400';
                                return `
                                    <button type="button" onclick="window.MonitoramentoManager.filtrarDetalhePorOpcao('${opc.replace(/'/g, "\\'")}')" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all ${activeClass}">
                                        <span>${opc}</span>
                                        <strong class="${badgeClass} px-1.5 py-0.2 rounded font-black text-[11px]">${qtd}</strong>
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    `;
                } else {
                    breakdownBar.innerHTML = '<span class="text-slate-400 italic text-xs">Nenhum registro classificado neste campo ainda.</span>';
                }
            }

            // Lista de vistorias / registros (filtrada se houver opção selecionada)
            if (lista) {
                let regs = m._registros || [];
                if (this._filtroOpcaoDetalhe) {
                    regs = regs.filter(r => r.opcao === this._filtroOpcaoDetalhe);
                }

                if (regs.length === 0) {
                    lista.innerHTML = `
                        <div class="p-8 text-center text-slate-400 text-xs italic">
                            <span class="material-symbols-outlined text-[32px] block mb-2 opacity-30">inventory_2</span>
                            Nenhum registro de vistoria encontrado ${this._filtroOpcaoDetalhe ? `com a opção "${this._filtroOpcaoDetalhe}"` : 'para esta camada/campo'}.
                        </div>
                    `;
                    return;
                }

                lista.innerHTML = regs.map((r, idx) => {
                    const dataStr = r.data ? new Date(r.data).toLocaleString('pt-BR') : 'Data não informada';
                    return `
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs hover:border-primary/40 transition-all">
                            <div class="flex items-start gap-2.5 min-w-0">
                                <div class="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-black text-xs shrink-0 border border-sky-500/20 mt-0.5">
                                    #${idx + 1}
                                </div>
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                                            ${r.opcao}
                                        </span>
                                        <strong class="font-bold text-slate-800 dark:text-slate-200 truncate">${r.resumo_feicao}</strong>
                                    </div>
                                    <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                                        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">person</span> ${r.fiscal}</span>
                                        <span>•</span>
                                        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">schedule</span> ${dataStr}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="shrink-0 self-end sm:self-center">
                                <button type="button" onclick="window.MonitoramentoManager.abrirFichaFeicao('${r.feicao_id}', '${r.camada_id}')" class="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 active:scale-95 cursor-pointer" title="Ver ficha cadastral completa com abas 1:1 e histórico 1:N">
                                    <span class="material-symbols-outlined text-[15px]">assignment</span>
                                    <span>Ficha Cadastral</span>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        },

        fecharDetalheMetrica: function() {
            const modal = document.getElementById('modal-detalhe-metrica');
            if (modal) modal.classList.add('hidden');
        },

        // Abre a Ficha Cadastral completa da Feição com abas 1:1 e 1:N
        abrirFichaFeicao: async function(feicaoId, camadaId) {
            const modal = document.getElementById('modal-ficha-feicao-vistoria');
            const content = document.getElementById('ficha-feicao-content');
            const titulo = document.getElementById('ficha-feicao-titulo');
            const subtitulo = document.getElementById('ficha-feicao-subtitulo');

            if (!modal || !content) return;
            modal.classList.remove('hidden');

            content.innerHTML = '<div class="p-8 text-center text-slate-400 text-xs italic">Carregando ficha cadastral completa da feição...</div>';

            try {
                // 1. Busca os dados da feição
                let feicaoData = null;
                if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                    const { data: featRow } = await supabaseClient.from('feicoes').select('*').eq('id', feicaoId).maybeSingle();
                    if (featRow) feicaoData = featRow;
                }

                // 2. Busca o formulário vinculado à camada
                let formSchema = null;
                let temaNome = 'Camada';
                if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                    const { data: tema } = await supabaseClient.from('temas').select('id, nome, tipo_cadastro').eq('id', camadaId).maybeSingle();
                    if (tema) {
                        temaNome = tema.nome || 'Camada';
                        const formId = tema.tipo_cadastro || camadaId;
                        const { data: fData } = await supabaseClient.from('forms').select('*').eq('id', formId).maybeSingle();
                        if (fData) {
                            let tabs = fData.schema;
                            if (fData.schema && !Array.isArray(fData.schema) && fData.schema.tabs) tabs = fData.schema.tabs;
                            formSchema = tabs;
                        }
                    }
                }

                if (!formSchema && typeof forms !== 'undefined' && Array.isArray(forms)) {
                    const f = forms.find(item => item.id === camadaId);
                    if (f && f.tabs) formSchema = f.tabs;
                }

                const props = feicaoData?.propriedades || {};
                const ident = props['NOME'] || props['Nome'] || props['INSC. IMOBILIÁRIA'] || props['Inscrição Imobiliária'] || props['ENDEREÇO'] || props['Endereço'] || `Feição #${String(feicaoId).substring(0, 8)}`;

                if (titulo) titulo.textContent = `${temaNome} — ${ident}`;
                if (subtitulo) subtitulo.textContent = `ID do Banco: ${feicaoId} • Camada: ${camadaId}`;

                if (typeof window.renderDynamicForm === 'function' && formSchema && formSchema.length > 0) {
                    window.renderDynamicForm(formSchema, props, false, 'ficha-feicao-content', { isPreview: false, formId: camadaId, themeId: camadaId });
                } else {
                    // Fallback visual com todos os atributos da feição formatados
                    content.innerHTML = `
                        <div class="space-y-3">
                            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                ${Object.entries(props).map(([k, v]) => {
                                    if (typeof v === 'object') return '';
                                    return `
                                        <div class="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                            <span class="text-[10px] text-slate-400 uppercase font-bold block">${k}</span>
                                            <strong class="text-xs text-slate-800 dark:text-slate-100 block truncate">${String(v)}</strong>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }

            } catch (err) {
                content.innerHTML = `<div class="p-4 text-center text-rose-500 text-xs">Erro ao carregar ficha cadastral: ${err.message}</div>`;
            }
        },

        fecharFichaFeicao: function() {
            const modal = document.getElementById('modal-ficha-feicao-vistoria');
            if (modal) modal.classList.add('hidden');
        },

        // Exclui métrica
        excluirMetrica: async function(metricaId) {
            if (!confirm('Deseja realmente remover este indicador de produtividade?')) return;
            try {
                await supabaseClient.from('fiscal_metricas_config').delete().eq('id', metricaId);
                await this.carregarMetricasConfig();
                await this.renderMetricasCards();
            } catch(e) {}
        },

        // Abre linha do tempo do fiscal
        abrirTimelineFiscal: async function(userId) {
            const fiscal = allFiscaisStatus.find(f => f.user_id === userId);
            const modal = document.getElementById('modal-timeline-fiscal');
            const content = document.getElementById('timeline-fiscal-content');
            const title = document.getElementById('timeline-fiscal-nome');

            if (!modal || !content) return;
            modal.classList.remove('hidden');

            if (title) title.textContent = fiscal ? `${fiscal.user_nome} (${fiscal.setor || fiscal.unidade || 'Fiscal'})` : 'Fiscal';
            content.innerHTML = '<div class="p-6 text-center text-slate-400 text-xs italic">Carregando vistorias do fiscal...</div>';

            try {
                const { data, error } = await supabaseClient
                    .from('fiscal_posicoes')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (!error && data && data.length > 0) {
                    content.innerHTML = data.map(p => `
                        <div class="flex items-start gap-2.5 p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs">
                            <span class="material-symbols-outlined text-[18px] ${p.status_atividade === 'vistoria' ? 'text-amber-500' : 'text-sky-500'} shrink-0 mt-0.5">
                                ${p.status_atividade === 'vistoria' ? 'task_alt' : 'location_on'}
                            </span>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between">
                                    <strong class="font-bold text-slate-800 dark:text-slate-200">${p.status_atividade === 'vistoria' ? 'Vistoria Concluída' : 'Posicionamento GPS'}</strong>
                                    <span class="text-[10px] text-slate-400">${new Date(p.created_at).toLocaleTimeString('pt-BR')}</span>
                                </div>
                                <span class="text-[11px] text-slate-500 block truncate">Coords: ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)} (±${Math.round(p.precisao_metros)}m)</span>
                                ${p.camada_id ? `<span class="text-[10px] text-primary font-bold block mt-0.5">Camada: ${p.camada_id}</span>` : ''}
                            </div>
                        </div>
                    `).join('');
                } else {
                    content.innerHTML = '<div class="p-6 text-center text-slate-400 text-xs italic">Nenhum registro de posição ou vistoria encontrado hoje para este fiscal.</div>';
                }
            } catch(e) {
                content.innerHTML = '<div class="p-4 text-center text-rose-500 text-xs">Erro ao carregar linha do tempo.</div>';
            }
        },

        fecharTimelineFiscal: function() {
            const modal = document.getElementById('modal-timeline-fiscal');
            if (modal) modal.classList.add('hidden');
        }
    };

    window.MonitoramentoManager = MonitoramentoManager;
    window.MonitoramentoGestao = MonitoramentoManager;
})();
