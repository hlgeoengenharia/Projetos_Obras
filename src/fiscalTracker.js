// src/fiscalTracker.js - Módulo de Telemetria, GPS e Produtividade dos Fiscais de Campo
// Sistema de Gestão Territorial e Monitoramento de Vistorias em Tempo Real

(function() {
    'use strict';

    let watchId = null;
    let heartbeatInterval = null;
    let lastPosition = null;
    let lastPulseTime = 0;
    let isTracking = false;
    let isPaused = false;
    let kmTotal = 0;
    let vistoriasHoje = 0;
    let inicioJornadaTime = null;
    let currentUser = null;

    // Fórmula de Haversine para cálculo de distância em metros entre duas coordenadas
    function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
        const R = 6371e3; // Raio da Terra em metros
        const phi1 = lat1 * Math.PI / 180;
        const phi2 = lat2 * Math.PI / 180;
        const deltaPhi = (lat2 - lat1) * Math.PI / 180;
        const deltaLambda = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // Obtém nível da bateria se a API estiver disponível
    async function getBatteryLevel() {
        try {
            if (navigator.getBattery) {
                const bat = await navigator.getBattery();
                return Math.round(bat.level * 100);
            }
        } catch (e) {}
        return 100;
    }

    const FiscalTracker = {
        // Inicializa o tracker com o perfil do usuário
        init: async function() {
            try {
                if (typeof supabaseClient === 'undefined' || !supabaseClient) return;

                const { data: { user } } = await supabaseClient.auth.getUser();
                if (!user) return;

                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle();

                currentUser = profile || { id: user.id, email: user.email, nome: user.email.split('@')[0] };

                // Restaura estado prévio salvo na sessão
                const savedState = sessionStorage.getItem('fiscal_tracker_state');
                if (savedState) {
                    try {
                        const parsed = JSON.parse(savedState);
                        if (parsed.isTracking) {
                            kmTotal = parsed.kmTotal || 0;
                            vistoriasHoje = parsed.vistoriasHoje || 0;
                            inicioJornadaTime = parsed.inicioJornadaTime ? new Date(parsed.inicioJornadaTime) : new Date();
                            this.iniciarJornada(false); // Retoma sem resetar métricas
                        }
                    } catch(e) {}
                }
            } catch (err) {
                console.warn('[FiscalTracker] Falha na inicialização:', err);
            }
        },

        // Inicia a jornada de campo com GPS ativo
        iniciarJornada: async function(resetarMetricas = true) {
            if (!navigator.geolocation) {
                alert('Seu dispositivo ou navegador não suporta geolocalização (GPS).');
                return false;
            }

            if (resetarMetricas) {
                kmTotal = 0;
                vistoriasHoje = 0;
                inicioJornadaTime = new Date();
            }

            isTracking = true;
            isPaused = false;
            this.salvarEstadoSessao();

            // Ativa watchPosition com alta precisão
            watchId = navigator.geolocation.watchPosition(
                (pos) => this.onPositionReceived(pos),
                (err) => console.warn('[FiscalTracker] Erro GPS:', err.message),
                {
                    enableHighAccuracy: true,
                    maximumAge: 10000,
                    timeout: 20000
                }
            );

            // Heartbeat periódico (a cada 2 minutos quando estacionado)
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(() => {
                if (isTracking && !isPaused && lastPosition) {
                    const agora = Date.now();
                    // Se passou mais de 90 segundos sem envio por movimento, envia pulso estacionário
                    if (agora - lastPulseTime >= 90000) {
                        this.enviarPulsoTelemetria(lastPosition, 'parado');
                    }
                }
            }, 60000);

            this.atualizarBotoesUI();
            console.log('[FiscalTracker] Jornada de campo iniciada com sucesso.');
            return true;
        },

        // Trata posição recebida pelo GPS
        onPositionReceived: async function(pos) {
            if (!isTracking || isPaused) return;

            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const precisao = pos.coords.accuracy || 0;
            const velocidade = pos.coords.speed !== null && pos.coords.speed >= 0 ? (pos.coords.speed * 3.6) : 0; // m/s para km/h

            const agora = Date.now();
            let deveEnviar = false;
            let status = velocidade > 4 ? 'deslocamento' : 'parado';

            if (!lastPosition) {
                deveEnviar = true;
            } else {
                const distMetros = calcularDistanciaMetros(lastPosition.lat, lastPosition.lng, lat, lng);
                // Se deslocou mais de 30 metros
                if (distMetros >= 30) {
                    kmTotal += (distMetros / 1000);
                    deveEnviar = true;
                } else if (agora - lastPulseTime >= 45000) {
                    // Ou se passou 45 segundos
                    deveEnviar = true;
                }
            }

            lastPosition = { lat, lng, precisao, velocidade, timestamp: agora };
            this.salvarEstadoSessao();

            if (deveEnviar) {
                lastPulseTime = agora;
                await this.enviarPulsoTelemetria(lastPosition, status);
            }
        },

        // Envia o pulso para o Supabase
        enviarPulsoTelemetria: async function(posData, statusAtividade = 'deslocamento', vistoriaId = null, camadaId = null) {
            try {
                if (typeof supabaseClient === 'undefined' || !supabaseClient || !currentUser?.id) return;

                const bateria = await getBatteryLevel();
                const activeMunicipio = typeof activeMunicipioId !== 'undefined' ? activeMunicipioId : (sessionStorage.getItem('municipio_ativo') || null);
                const activeEntidade = currentUser.entidade_id || (sessionStorage.getItem('activeEntidadeId') || null);

                // 1. Grava no Histórico de Posições (Trilha)
                const payloadPosicao = {
                    user_id: currentUser.id,
                    user_nome: currentUser.nome || currentUser.email?.split('@')[0] || 'Fiscal',
                    entidade_id: activeEntidade,
                    unidade: currentUser.unidade || currentUser.profile?.unidade || null,
                    setor: currentUser.setor || currentUser.profile?.setor || null,
                    municipio_id: activeMunicipio,
                    latitude: posData.lat,
                    longitude: posData.lng,
                    precisao_metros: posData.precisao,
                    velocidade_kmh: posData.velocidade,
                    bateria_nivel: bateria,
                    status_atividade: statusAtividade,
                    vistoria_id: vistoriaId,
                    camada_id: camadaId
                };

                await supabaseClient.from('fiscal_posicoes').insert([payloadPosicao]).select('id').maybeSingle();

                // 2. Atualiza o Status Consolidado em Tempo Real (Upsert)
                const payloadStatus = {
                    user_id: currentUser.id,
                    user_nome: currentUser.nome || currentUser.email?.split('@')[0] || 'Fiscal',
                    user_email: currentUser.email || '',
                    entidade_id: activeEntidade,
                    unidade: currentUser.unidade || currentUser.profile?.unidade || null,
                    setor: currentUser.setor || currentUser.profile?.setor || null,
                    municipio_id: activeMunicipio,
                    latitude: posData.lat,
                    longitude: posData.lng,
                    precisao_metros: posData.precisao,
                    velocidade_kmh: posData.velocidade,
                    bateria_nivel: bateria,
                    status_atividade: isPaused ? 'pausa' : statusAtividade,
                    em_jornada: isTracking && !isPaused,
                    total_vistorias_hoje: vistoriasHoje,
                    km_percorridos_hoje: parseFloat(kmTotal.toFixed(2)),
                    inicio_jornada_em: inicioJornadaTime ? inicioJornadaTime.toISOString() : new Date().toISOString(),
                    ultima_atualizacao: new Date().toISOString()
                };

                await supabaseClient.from('fiscal_status_atual').upsert(payloadStatus, { onConflict: 'user_id' });

            } catch (err) {
                // Silencioso se tabela não criada ainda no Supabase
                console.warn('[FiscalTracker] Falha no pulso de telemetria:', err.message);
            }
        },

        // Registra uma vistoria concluída no momento em que um formulário de camada for salvo
        registrarVistoria: async function(feicaoId, camadaId, atributos = {}) {
            vistoriasHoje++;
            this.salvarEstadoSessao();

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(async (pos) => {
                    const posData = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        precisao: pos.coords.accuracy || 0,
                        velocidade: 0,
                        timestamp: Date.now()
                    };
                    await this.enviarPulsoTelemetria(posData, 'vistoria', String(feicaoId), String(camadaId));
                }, async () => {
                    if (lastPosition) {
                        await this.enviarPulsoTelemetria(lastPosition, 'vistoria', String(feicaoId), String(camadaId));
                    }
                });
            }

            this.atualizarBotoesUI();
            console.log('[FiscalTracker] Vistoria registrada para o fiscal:', feicaoId, camadaId);
        },

        // Pausa temporária da jornada (ex: almoço)
        pausarJornada: async function() {
            if (!isTracking) return;
            isPaused = !isPaused;
            this.salvarEstadoSessao();

            if (lastPosition) {
                await this.enviarPulsoTelemetria(lastPosition, isPaused ? 'pausa' : 'ativo');
            }

            this.atualizarBotoesUI();
        },

        // Encerra a jornada de campo
        encerrarJornada: async function() {
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
            }
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }

            isTracking = false;
            isPaused = false;
            sessionStorage.removeItem('fiscal_tracker_state');

            if (currentUser?.id && typeof supabaseClient !== 'undefined' && supabaseClient) {
                try {
                    await supabaseClient.from('fiscal_status_atual').update({
                        em_jornada: false,
                        status_atividade: 'offline',
                        ultima_atualizacao: new Date().toISOString()
                    }).eq('user_id', currentUser.id);
                } catch(e) {}
            }

            this.atualizarBotoesUI();
            console.log('[FiscalTracker] Jornada de campo encerrada.');
        },

        // Salva estado na sessão para tolerância a recargas de página
        salvarEstadoSessao: function() {
            try {
                sessionStorage.setItem('fiscal_tracker_state', JSON.stringify({
                    isTracking,
                    isPaused,
                    kmTotal,
                    vistoriasHoje,
                    inicioJornadaTime: inicioJornadaTime ? inicioJornadaTime.toISOString() : null
                }));
            } catch(e) {}
        },

        // Estado público
        getStatus: function() {
            return {
                isTracking,
                isPaused,
                kmTotal: parseFloat(kmTotal.toFixed(2)),
                vistoriasHoje,
                inicioJornadaTime,
                lastPosition
            };
        },

        // Renderiza o botão flutuante / cabeçalho do fiscal
        renderControleUI: function(containerId = 'fiscal-tracker-btn-container') {
            const container = document.getElementById(containerId);
            if (!container) return;

            if (!isTracking) {
                container.innerHTML = `
                    <button type="button" onclick="window.fiscalTracker.iniciarJornada()" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95" title="Iniciar Vistorias de Campo com GPS ativo">
                        <span class="material-symbols-outlined text-[16px]">location_on</span>
                        <span>Iniciar Campo</span>
                    </button>
                `;
            } else if (isPaused) {
                container.innerHTML = `
                    <div class="flex items-center gap-1.5">
                        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
                            <span class="material-symbols-outlined text-[14px]">pause_circle</span> Em Pausa
                        </span>
                        <button type="button" onclick="window.fiscalTracker.pausarJornada()" class="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer" title="Retomar Atividade">
                            Retomar
                        </button>
                        <button type="button" onclick="window.fiscalTracker.encerrarJornada()" class="px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer" title="Encerrar Jornada">
                            Encerrar
                        </button>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="flex items-center gap-1.5">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400 dark:border-emerald-700">
                            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                            <span>GPS Campo Ativo (${vistoriasHoje} vist.)</span>
                        </span>
                        <button type="button" onclick="window.fiscalTracker.pausarJornada()" class="px-2 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-xs cursor-pointer" title="Pausar para Almoço/Intervalo">
                            Pausar
                        </button>
                        <button type="button" onclick="window.fiscalTracker.encerrarJornada()" class="px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer" title="Encerrar Jornada do Dia">
                            Encerrar
                        </button>
                    </div>
                `;
            }
        },

        atualizarBotoesUI: function() {
            this.renderControleUI('fiscal-tracker-btn-container');
            this.renderControleUI('fiscal-tracker-header-container');
            this.renderControleUI('fiscal-tracker-header-container-mun');
        }
    };

    window.fiscalTracker = FiscalTracker;

    // Inicialização automática após carregamento do DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => FiscalTracker.init());
    } else {
        FiscalTracker.init();
    }
})();
