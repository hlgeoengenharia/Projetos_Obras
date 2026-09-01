// src/auditLogger.js - Módulo de Auditoria, Rastreamento de Logs e Presença Online

(function() {
    let heartbeatTimer = null;
    let currentUserProfile = null;

    const AuditLogger = {
        // Inicializa o heartbeat e perfil do usuário ativo
        init: async function() {
            try {
                if (typeof supabaseClient === 'undefined' || !supabaseClient) return;

                const { data: { user } } = await supabaseClient.auth.getUser();
                if (user) {
                    // Busca perfil com select('*') para compatibilidade total com a estrutura da tabela
                    const { data: profile } = await supabaseClient
                        .from('profiles')
                        .select('*')
                        .eq('id', user.id)
                        .maybeSingle();
                    
                    currentUserProfile = profile || { id: user.id, email: user.email, nome: user.email.split('@')[0] };
                    
                    // Inicia o heartbeat de presença online
                    this.startHeartbeat();
                }
            } catch(e) {
                console.warn('[AuditLogger] Falha ao inicializar perfil:', e);
            }
        },

        // Envia pulso de presença online a cada 45 segundos
        startHeartbeat: function() {
            if (heartbeatTimer) clearInterval(heartbeatTimer);

            const sendPulse = async () => {
                try {
                    if (typeof supabaseClient !== 'undefined' && supabaseClient && currentUserProfile?.id) {
                        // Tenta atualizar last_seen_at silenciosamente
                        try {
                            await supabaseClient
                                .from('profiles')
                                .update({ last_seen_at: new Date().toISOString() })
                                .eq('id', currentUserProfile.id);
                        } catch(eUpd) {}
                    }
                } catch(e) {}
            };

            // Pulso inicial imediato
            sendPulse();
            heartbeatTimer = setInterval(sendPulse, 45000);
        },

        // Registra uma atividade no sistema
        log: async function(tipo_acao, alvo = '', detalhes = {}) {
            try {
                if (typeof supabaseClient === 'undefined' || !supabaseClient) return;

                // Garante perfil
                if (!currentUserProfile) {
                    const { data: { user } } = await supabaseClient.auth.getUser();
                    if (user) {
                        currentUserProfile = { id: user.id, email: user.email, nome: user.user_metadata?.nome || user.email.split('@')[0] };
                    }
                }

                if (!currentUserProfile?.id) return;

                const activeMunicipio = typeof activeMunicipioId !== 'undefined' ? activeMunicipioId : (sessionStorage.getItem('municipio_ativo') || localStorage.getItem('activeMunicipioId') || null);
                const activeEntidade = currentUserProfile.entidade_id || (sessionStorage.getItem('activeEntidadeId') || localStorage.getItem('activeEntidadeId') || null);

                const payload = {
                    user_id: currentUserProfile.id,
                    user_nome: currentUserProfile.nome || 'Usuário',
                    user_email: currentUserProfile.email || '',
                    entidade_id: activeEntidade,
                    municipio_id: activeMunicipio,
                    tipo_acao: String(tipo_acao).toUpperCase(),
                    alvo: String(alvo),
                    detalhes: detalhes || {},
                    user_agent: navigator.userAgent ? navigator.userAgent.substring(0, 200) : ''
                };

                // Inserção assíncrona não bloqueante
                supabaseClient.from('auditoria_logs').insert([payload]).then(({ error }) => {
                    if (error) console.warn('[AuditLogger] Erro ao gravar log:', error.message);
                }).catch(() => {});

            } catch(err) {
                console.warn('[AuditLogger] Falha ao registrar log:', err);
            }
        },

        // Busca usuários online em tempo real (últimos 90 segundos de atividade)
        getOnlineUsers: async function(entidadeId = null) {
            try {
                if (typeof supabaseClient === 'undefined' || !supabaseClient) return [];

                try {
                    const { data, error } = await supabaseClient.rpc('get_usuarios_online', { p_entidade_id: entidadeId });
                    if (!error && data) return data;
                } catch(eRpc) {}

                // Fallback: consulta direta na tabela profiles (últimos 90 segundos)
                const ninetySecondsAgo = new Date(Date.now() - 90 * 1000).toISOString();
                let query = supabaseClient
                    .from('profiles')
                    .select('id, nome, email, papel, last_seen_at')
                    .gte('last_seen_at', ninetySecondsAgo)
                    .order('last_seen_at', { ascending: false });

                const { data } = await query;
                return data || [];

            } catch(err) {
                console.warn('[AuditLogger] Erro ao buscar usuários online:', err);
                return [];
            }
        },

        // Busca logs com filtros
        fetchLogs: async function(filters = {}) {
            try {
                if (typeof supabaseClient === 'undefined' || !supabaseClient) return [];

                let query = supabaseClient
                    .from('auditoria_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(filters.limit || 200);

                if (filters.userId) query = query.eq('user_id', filters.userId);
                if (filters.tipoAcao && filters.tipoAcao !== 'TODAS') query = query.eq('tipo_acao', filters.tipoAcao);
                if (filters.entidadeId) query = query.eq('entidade_id', filters.entidadeId);
                if (filters.municipioId) query = query.eq('municipio_id', filters.municipioId);

                // Filtro de data
                if (filters.startDate) query = query.gte('created_at', filters.startDate);
                if (filters.endDate) query = query.lte('created_at', filters.endDate);

                const { data, error } = await query;
                if (error) throw error;
                return data || [];

            } catch(err) {
                console.warn('[AuditLogger] Erro ao carregar logs:', err);
                return [];
            }
        }
    };

    window.auditLogger = AuditLogger;

    // Inicialização automática ao carregar a página
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => AuditLogger.init());
    } else {
        AuditLogger.init();
    }
})();
