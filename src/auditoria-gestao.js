// src/auditoria-gestao.js - Interface da Aba de Auditoria, Métricas e Inspeção de Logs

(function() {
    let currentLogs = [];
    let currentFilters = {
        userId: '',
        tipoAcao: 'TODAS',
        periodo: 'hoje',
        searchTerm: ''
    };

    const actionBadgeStyles = {
        'LOGIN': 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
        'LOGOUT': 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600',
        
        // Feições Espaciais (Ponto, Linha, Polígono)
        'CRIAR_FEICAO': 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700',
        'EDITAR_FEICAO': 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700',
        'EXCLUIR_FEICAO': 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700',
        
        // Dados Tabulares / Atributos
        'CRIAR_DADOS': 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-700',
        'EDITAR_DADOS': 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700',
        'EXCLUIR_DADOS': 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700',

        // Camadas
        'IMPORTAR_CAMADA': 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700',
        'EDITAR_CAMADA': 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
        'EXCLUIR_CAMADA': 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700',
        'RECONECTAR_ATRIBUTOS': 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700',
        
        // Formulários Personalizados
        'CRIAR_FORMULARIO': 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700',
        'EDITAR_FORMULARIO': 'bg-lime-100 dark:bg-lime-900/40 text-lime-800 dark:text-lime-300 border-lime-300 dark:border-lime-700',
        'EXCLUIR_FORMULARIO': 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700',
        
        // Ferramentas Geoestatísticas
        'CRIAR_ESTATISTICA': 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700',
        'EDITAR_ESTATISTICA': 'bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-300 dark:border-fuchsia-700',
        'EXCLUIR_ESTATISTICA': 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 border-pink-300 dark:border-pink-700',

        // Usuários
        'ALTERAR_PERMISSOES': 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
    };

    const actionLabels = {
        'LOGIN': 'Login no Sistema',
        'LOGOUT': 'Logout',
        'CRIAR_FEICAO': 'Criação de Feição (Ponto/Linha/Polígono)',
        'EDITAR_FEICAO': 'Edição de Feição',
        'EXCLUIR_FEICAO': 'Exclusão de Feição',
        'CRIAR_DADOS': 'Criação de Dados / Histórico',
        'EDITAR_DADOS': 'Edição de Dados / Atributos',
        'EXCLUIR_DADOS': 'Exclusão de Dados',
        'IMPORTAR_CAMADA': 'Importação de Camada (GeoJSON/Shape)',
        'EDITAR_CAMADA': 'Edição de Camada',
        'EXCLUIR_CAMADA': 'Exclusão de Camada',
        'RECONECTAR_ATRIBUTOS': 'Reconexão de Atributos',
        'CRIAR_FORMULARIO': 'Criação de Formulário',
        'EDITAR_FORMULARIO': 'Edição de Formulário',
        'EXCLUIR_FORMULARIO': 'Exclusão de Formulário',
        'CRIAR_ESTATISTICA': 'Criação de Análise Estatística',
        'EDITAR_ESTATISTICA': 'Edição de Análise Estatística',
        'EXCLUIR_ESTATISTICA': 'Exclusão de Análise Estatística',
        'ALTERAR_PERMISSOES': 'Alteração de Permissões de Usuário'
    };

    window.initAuditoriaTab = async function() {
        // Checa permissão
        const isAuthAdmin = await checkAuditoriaAccess();
        const tabBtn = document.getElementById('tab-btn-auditoria');
        if (tabBtn) {
            tabBtn.style.display = isAuthAdmin ? 'flex' : 'none';
        }
        if (!isAuthAdmin) return;

        // 1. Inicializa o Seletor de Usuários
        await populateUserFilterSelect();

        // 2. Busca e Renderiza Usuários Online em tempo real
        const onlineUsers = await window.auditLogger.getOnlineUsers();
        const onlineCountEl = document.getElementById('metric-online-count');
        if (onlineCountEl) onlineCountEl.textContent = onlineUsers.length;

        const onlineAvatarsEl = document.getElementById('metric-online-avatars');
        if (onlineAvatarsEl) {
            if (onlineUsers.length === 0) {
                onlineAvatarsEl.innerHTML = '<span class="text-[11px] text-slate-400 italic">Nenhum outro usuário ativo</span>';
            } else {
                onlineAvatarsEl.innerHTML = onlineUsers.slice(0, 4).map(u => `
                    <div class="relative group cursor-pointer" title="${u.nome} (${u.email}) - Ativo há ${u.minutos_inativo} min">
                        <div class="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold text-[10px] flex items-center justify-center border-2 border-white dark:border-slate-800 shadow-xs">
                            ${(u.nome || u.email || 'U').substring(0, 2).toUpperCase()}
                        </div>
                        <span class="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-white dark:border-slate-900"></span>
                    </div>
                `).join('');
            }
        }

        // 3. Estado Inicial da Tabela: Aguardando clique em Buscar
        renderInitialEmptyState();
    };

    function renderInitialEmptyState() {
        const tbody = document.getElementById('auditoria-table-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-14 px-4 text-xs text-slate-400">
                        <div class="flex flex-col items-center justify-center gap-2.5 max-w-md mx-auto">
                            <div class="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-950/50 text-sky-500 flex items-center justify-center border border-sky-200 dark:border-sky-800 shadow-sm">
                                <span class="material-symbols-outlined text-[26px]">manage_search</span>
                            </div>
                            <h4 class="font-bold text-sm text-slate-700 dark:text-slate-200">Pronto para Pesquisar Atividades</h4>
                            <p class="text-[11px] text-slate-400 leading-relaxed">
                                Selecione os filtros desejados acima (Usuário, Tipo de Ação ou Período) e clique no botão <strong class="text-sky-500 font-bold">Buscar</strong> para carregar a Linha do Tempo.
                            </p>
                        </div>
                    </td>
                </tr>
            `;
        }

        const countBadge = document.getElementById('audit-logs-total-count');
        if (countBadge) countBadge.textContent = 'Aguardando busca';
    }

    async function checkAuditoriaAccess() {
        try {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) return true;
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return false;

            const { data: profile } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();

            if (profile?.super_admin || profile?.is_superadmin || profile?.papel === 'superadmin' || profile?.papel === 'admin') {
                return true;
            }

            // Checa também se é admin em municipio_membros
            const { data: membro } = await supabaseClient
                .from('municipio_membros')
                .select('papel, status')
                .eq('user_id', user.id)
                .eq('status', 'aprovado')
                .eq('papel', 'admin')
                .limit(1);

            return (membro && membro.length > 0);
        } catch(e) {
            return false;
        }
    }

    async function loadAuditoriaData() {
        const container = document.getElementById('auditoria-table-body');
        if (container) {
            container.innerHTML = `<tr><td colspan="5" class="text-center py-12 text-xs text-slate-400"><div class="flex flex-col items-center justify-center gap-2"><span class="material-symbols-outlined animate-spin text-[26px] text-sky-500">refresh</span><span class="font-semibold">Consultando registros no servidor...</span></div></td></tr>`;
        }

        const countBadge = document.getElementById('audit-logs-total-count');
        if (countBadge) countBadge.textContent = 'Buscando...';

        // 1. Calcula datas do filtro de período
        let startDate = null;
        let endDate = null;
        const now = new Date();

        if (currentFilters.periodo === 'hoje') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        } else if (currentFilters.periodo === '7dias') {
            startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (currentFilters.periodo === 'mes') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        } else if (currentFilters.periodo === 'data_especifica') {
            const rawDate = document.getElementById('audit-filter-custom-date')?.value;
            if (rawDate) {
                const [year, month, day] = rawDate.split('-').map(Number);
                startDate = new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
                endDate = new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
            }
        }

        // 2. Busca Usuários Online
        const onlineUsers = await window.auditLogger.getOnlineUsers();

        // 3. Busca Logs filtrados no Supabase
        currentLogs = await window.auditLogger.fetchLogs({
            userId: currentFilters.userId,
            tipoAcao: currentFilters.tipoAcao,
            startDate: startDate,
            endDate: endDate,
            limit: 300
        });

        // 4. Renderiza Métricas
        renderAuditoriaMetrics(currentLogs, onlineUsers);

        // 5. Renderiza Tabela de Logs
        renderAuditoriaTable();
    }

    function renderAuditoriaMetrics(logs, onlineUsers) {
        // Usuários Online
        const onlineCountEl = document.getElementById('metric-online-count');
        if (onlineCountEl) onlineCountEl.textContent = onlineUsers.length;

        const onlineAvatarsEl = document.getElementById('metric-online-avatars');
        if (onlineAvatarsEl) {
            if (onlineUsers.length === 0) {
                onlineAvatarsEl.innerHTML = '<span class="text-[11px] text-slate-400 italic">Nenhum outro usuário ativo</span>';
            } else {
                onlineAvatarsEl.innerHTML = onlineUsers.slice(0, 4).map(u => `
                    <div class="relative group cursor-pointer" title="${u.nome} (${u.email}) - Ativo há ${u.minutos_inativo} min">
                        <div class="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold text-[10px] flex items-center justify-center border-2 border-white dark:border-slate-800 shadow-xs">
                            ${(u.nome || u.email || 'U').substring(0, 2).toUpperCase()}
                        </div>
                        <span class="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-white dark:border-slate-900"></span>
                    </div>
                `).join('');
            }
        }

        // Ações Hoje
        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);
        const todayLogs = logs.filter(l => new Date(l.created_at) >= todayStart);

        const actionsTodayEl = document.getElementById('metric-today-actions');
        if (actionsTodayEl) actionsTodayEl.textContent = todayLogs.length;

        // Criações
        const createsCount = logs.filter(l => l.tipo_acao.startsWith('CRIAR') || l.tipo_acao.startsWith('IMPORTAR')).length;
        const createsEl = document.getElementById('metric-creates-count');
        if (createsEl) createsEl.textContent = createsCount;

        // Edições
        const editsCount = logs.filter(l => l.tipo_acao.startsWith('EDITAR') || l.tipo_acao === 'RECONECTAR_ATRIBUTOS').length;
        const editsEl = document.getElementById('metric-edits-count');
        if (editsEl) editsEl.textContent = editsCount;

        // Exclusões
        const deletesCount = logs.filter(l => l.tipo_acao.startsWith('EXCLUIR')).length;
        const deletesEl = document.getElementById('metric-deletes-count');
        if (deletesEl) deletesEl.textContent = deletesCount;
    }

    async function populateUserFilterSelect() {
        const select = document.getElementById('audit-filter-user');
        if (!select) return;

        try {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                const { data: users } = await supabaseClient.from('profiles').select('id, nome, email').order('nome');
                if (users) {
                    let html = '<option value="">-- Todos os Usuários --</option>';
                    users.forEach(u => {
                        const isSel = (u.id === currentFilters.userId);
                        html += `<option value="${u.id}" ${isSel ? 'selected' : ''}>${u.nome || u.email} (${u.email})</option>`;
                    });
                    select.innerHTML = html;
                }
            }
        } catch(e) {}
    }

    function renderAuditoriaTable() {
        const tbody = document.getElementById('auditoria-table-body');
        if (!tbody) return;

        let filtered = currentLogs;

        // Filtro de Busca Livre
        if (currentFilters.searchTerm) {
            const term = currentFilters.searchTerm.toLowerCase().trim();
            filtered = filtered.filter(l => 
                (l.user_nome && l.user_nome.toLowerCase().includes(term)) ||
                (l.user_email && l.user_email.toLowerCase().includes(term)) ||
                (l.alvo && l.alvo.toLowerCase().includes(term)) ||
                (l.tipo_acao && l.tipo_acao.toLowerCase().includes(term))
            );
        }

        const countBadge = document.getElementById('audit-logs-total-count');
        if (countBadge) countBadge.textContent = `${filtered.length} registro(s) encontrado(s)`;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-10 text-xs text-slate-400">
                        <span class="material-symbols-outlined text-[32px] text-slate-300 dark:text-slate-600 mb-1">manage_search</span>
                        <p class="font-semibold text-slate-600 dark:text-slate-400">Nenhum registro de auditoria encontrado</p>
                        <p class="text-[11px] text-slate-400">Tente ajustar os filtros de data, tipo de ação ou usuário.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(log => {
            const date = new Date(log.created_at);
            const dateFormatted = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeFormatted = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            const badgeClass = actionBadgeStyles[log.tipo_acao] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300';
            const actionLabel = actionLabels[log.tipo_acao] || log.tipo_acao;

            const hasDetails = log.detalhes && Object.keys(log.detalhes).length > 0;

            return `
                <tr class="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors text-xs">
                    <!-- Data / Hora -->
                    <td class="py-3 px-4 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        <div class="font-bold text-slate-900 dark:text-slate-200">${dateFormatted}</div>
                        <div class="text-[10px] text-slate-400 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[12px]">schedule</span> ${timeFormatted}
                        </div>
                    </td>

                    <!-- Usuário -->
                    <td class="py-3 px-4">
                        <div class="flex items-center gap-2.5">
                            <div class="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-sky-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 shadow-2xs">
                                ${(log.user_nome || log.user_email || 'U').substring(0, 2).toUpperCase()}
                            </div>
                            <div class="min-w-0">
                                <div class="font-bold text-slate-900 dark:text-white truncate">${log.user_nome || 'Usuário'}</div>
                                <div class="text-[10px] text-slate-400 truncate">${log.user_email || ''}</div>
                            </div>
                        </div>
                    </td>

                    <!-- Ação -->
                    <td class="py-3 px-4 whitespace-nowrap">
                        <span class="px-2.5 py-1 rounded-full font-bold text-[10px] border shadow-2xs inline-flex items-center gap-1 ${badgeClass}">
                            ${actionLabel}
                        </span>
                    </td>

                    <!-- Objeto / Alvo -->
                    <td class="py-3 px-4 text-slate-800 dark:text-slate-200 font-medium">
                        ${log.alvo || '<span class="text-slate-400 italic">Geral</span>'}
                    </td>

                    <!-- Ações -->
                    <td class="py-3 px-4 text-right whitespace-nowrap">
                        ${hasDetails ? `
                            <button onclick="window.viewAuditLogDetails('${log.id}')" class="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 text-sky-600 dark:text-sky-400 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 ml-auto shadow-2xs" title="Inspecionar dados gravados">
                                <span class="material-symbols-outlined text-[14px]">visibility</span> Detalhes
                            </button>
                        ` : `
                            <span class="text-[11px] text-slate-400 italic">Sem payload</span>
                        `}
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Modal de Detalhes do Log
    window.viewAuditLogDetails = function(logId) {
        const log = currentLogs.find(l => l.id === logId);
        if (!log) return;

        const modal = document.getElementById('audit-details-modal');
        if (!modal) return;

        document.getElementById('audit-modal-user').textContent = `${log.user_nome} (${log.user_email})`;
        document.getElementById('audit-modal-action').textContent = actionLabels[log.tipo_acao] || log.tipo_acao;
        document.getElementById('audit-modal-target').textContent = log.alvo || 'Nenhum';
        document.getElementById('audit-modal-date').textContent = new Date(log.created_at).toLocaleString('pt-BR');

        const jsonEl = document.getElementById('audit-modal-json');
        if (jsonEl) {
            jsonEl.textContent = JSON.stringify(log.detalhes || {}, null, 2);
        }

        modal.classList.remove('hidden');
    };

    window.closeAuditDetailsModal = function() {
        const modal = document.getElementById('audit-details-modal');
        if (modal) modal.classList.add('hidden');
    };

    // Execução da Busca de Auditoria (Disparada EXCLUSIVAMENTE pelo botão "Buscar" ou tecla Enter)
    window.executeAuditSearch = function() {
        currentFilters.userId = document.getElementById('audit-filter-user')?.value || '';
        currentFilters.tipoAcao = document.getElementById('audit-filter-action')?.value || 'TODAS';
        currentFilters.periodo = document.getElementById('audit-filter-period')?.value || 'hoje';
        currentFilters.searchTerm = document.getElementById('audit-filter-search')?.value || '';

        loadAuditoriaData();
    };

    // Mantém compatibilidade com chamadas existentes
    window.onAuditFilterChanged = window.executeAuditSearch;

    // Controle do seletor dinâmico de Data Específica
    window.toggleAuditCustomDate = function(periodoVal) {
        const dateInput = document.getElementById('audit-filter-custom-date');
        if (!dateInput) return;
        if (periodoVal === 'data_especifica') {
            dateInput.classList.remove('hidden');
            if (!dateInput.value) {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                dateInput.value = `${yyyy}-${mm}-${dd}`;
            }
        } else {
            dateInput.classList.add('hidden');
        }
    };

    window.clearAuditFilters = function() {
        currentFilters = {
            userId: '',
            tipoAcao: 'TODAS',
            periodo: 'hoje',
            searchTerm: ''
        };

        const userSelect = document.getElementById('audit-filter-user');
        if (userSelect) userSelect.value = '';

        const actionSelect = document.getElementById('audit-filter-action');
        if (actionSelect) actionSelect.value = 'TODAS';

        const periodSelect = document.getElementById('audit-filter-period');
        if (periodSelect) periodSelect.value = 'hoje';

        const customDateInput = document.getElementById('audit-filter-custom-date');
        if (customDateInput) {
            customDateInput.value = '';
            customDateInput.classList.add('hidden');
        }

        const searchInput = document.getElementById('audit-filter-search');
        if (searchInput) searchInput.value = '';

        renderInitialEmptyState();
    };

    // Atalho direto da aba USUÁRIOS para selecionar um usuário específico
    window.inspectUserLogs = function(userId) {
        if (!userId) return;

        // Alterna para a aba de auditoria
        const tabBtn = document.getElementById('tab-btn-auditoria');
        if (typeof switchTab === 'function' && tabBtn) {
            switchTab('auditoria', tabBtn);
        }

        currentFilters.userId = userId;
        currentFilters.periodo = '7dias';
        currentFilters.tipoAcao = 'TODAS';

        const userSelect = document.getElementById('audit-filter-user');
        if (userSelect) userSelect.value = userId;

        const periodSelect = document.getElementById('audit-filter-period');
        if (periodSelect) periodSelect.value = '7dias';

        // Apenas prepara o filtro e deixa aguardando o clique em "Buscar"
        renderInitialEmptyState();
    };
})();
