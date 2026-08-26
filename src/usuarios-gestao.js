/**
 * GeoGestor — Gestão Unificada de Usuários, Entidades e Permissões Hierárquicas
 * Compartilhado entre home.html e settings.html (Espelho Total)
 * 
 * Recursos:
 * - Cards de Usuários expansíveis (Accordion).
 * - Camadas expansíveis (Accordion de Camada com lista de abas).
 * - Modo Visualização vs Modo Edição (Botão "Editar" alterna para "Salvar" e "Cancelar").
 * - Regra de Ouro: "Quem pode mais, pode menos; quem pode menos, não pode mais."
 */

(function(window) {
    'use strict';

    const PAPEL_LABELS = {
        admin: 'Administrador',
        visualizador: 'Usuário',
        editor: 'Usuário',
        externo: 'Acesso Externo'
    };

    const STATUS_LABELS = {
        pendente: 'Pendente',
        aprovado: 'Aprovado',
        rejeitado: 'Rejeitado'
    };

    // Estado interno do painel
    let _allMembros = [];
    let _allTemas = [];
    let _allForms = {};
    let _allCamadaPerms = {};
    let _allAbaPerms = {};
    let _currentUserProfile = null;
    let _currentUserMembros = [];
    let _entidadesTipos = {}; // nome_entidade -> 'municipal' | 'externo' | 'outro'
    let _targetMunicipioId = null; // Se preenchido (ex: settings.html), filtra pelo município
    let _editingCardIds = new Set(); // IDs dos cards em modo edição

    async function initUsuariosManager({ containerId, searchInputId, municipioId = null, currentUserProfile }) {
        const container = document.getElementById(containerId);
        if (!container || typeof supabaseClient === 'undefined' || !supabaseClient) return;

        container.innerHTML = `
            <div class="p-8 flex flex-col items-center justify-center gap-3 text-slate-400">
                <div class="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                <span class="text-xs font-medium">Carregando usuários e permissões...</span>
            </div>
        `;

        _targetMunicipioId = municipioId;
        _currentUserProfile = currentUserProfile;

        try {
            // 1. Carrega dados básicos em paralelo
            const [membrosRes, temasRes, formsRes, permsCamadaRes, permsAbaRes, entidadesRes, minhasRes] = await Promise.all([
                supabaseClient
                    .from('municipio_membros')
                    .select('id, user_id, municipio_id, papel, status, entidade, cargo, solicitado_em, profiles!user_id(id, nome, email, super_admin), municipios(id, nome, uf)')
                    .order('solicitado_em', { ascending: false }),
                supabaseClient.from('temas').select('id, nome, municipio_id, tipo_cadastro, cor, icone'),
                supabaseClient.from('forms').select('id, title, schema'),
                supabaseClient.from('permissoes_camada').select('*'),
                supabaseClient.from('permissoes_aba').select('*'),
                supabaseClient.from('entidades_padrao').select('nome, tipo'),
                supabaseClient.from('municipio_membros').select('*').eq('user_id', currentUserProfile ? currentUserProfile.id : '')
            ]);

            if (membrosRes.error) throw membrosRes.error;

            _allMembros = membrosRes.data || [];
            _allTemas = temasRes.data || [];
            _currentUserMembros = minhasRes.data || [];

            // Mapeia tipos de entidades
            _entidadesTipos = {};
            (entidadesRes.data || []).forEach(e => {
                _entidadesTipos[e.nome.trim()] = e.tipo;
            });

            // Mapeia formulários e suas abas
            _allForms = {};
            (formsRes.data || []).forEach(f => {
                let tabs = f.schema;
                if (f.schema && !Array.isArray(f.schema) && f.schema.tabs) tabs = f.schema.tabs;
                _allForms[f.id] = { id: f.id, title: f.title, tabs: Array.isArray(tabs) ? tabs : [] };
            });

            // Mapeia permissões por camada (user_id:theme_id -> record)
            _allCamadaPerms = {};
            (permsCamadaRes.data || []).forEach(p => {
                _allCamadaPerms[`${p.user_id}:${p.theme_id}`] = p;
            });

            // Mapeia permissões por aba (user_id:form_id:tab_id -> record)
            _allAbaPerms = {};
            (permsAbaRes.data || []).forEach(p => {
                _allAbaPerms[`${p.user_id}:${p.form_id}:${p.tab_id}`] = p;
            });

            // Configura o ouvinte de busca se houver campo de busca
            if (searchInputId) {
                const searchInput = document.getElementById(searchInputId);
                if (searchInput) {
                    searchInput.oninput = () => renderUsersList(containerId, searchInput.value);
                }
            }

            renderUsersList(containerId);

        } catch (err) {
            console.error('[UsuariosManager] Erro ao carregar:', err);
            container.innerHTML = `
                <div class="p-6 text-center text-red-500 text-sm bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800">
                    Erro ao carregar lista de usuários: ${err.message || err}
                </div>
            `;
        }
    }

    // Identifica se o usuário logado pode gerenciar o membro
    function canManageMembro(membro) {
        if (!_currentUserProfile) return false;
        if (_currentUserProfile.super_admin) return true;

        // Admin de Entidade: verifica se o usuário logado é admin no mesmo município e mesma entidade
        const meuVinculo = _currentUserMembros.find(m => 
            m.municipio_id === membro.municipio_id && 
            m.status === 'aprovado' && 
            m.papel === 'admin'
        );

        if (!meuVinculo) return false;

        // Regra de Isolamento de Entidade: Admin só gerencia membros da sua própria entidade
        const minhaEntidade = (meuVinculo.entidade || '').trim().toLowerCase();
        const membroEntidade = (membro.entidade || '').trim().toLowerCase();

        return (minhaEntidade && membroEntidade && minhaEntidade === membroEntidade);
    }

    // Identifica o teto de permissão do Admin logado ("Quem pode mais, pode menos...")
    function getAdminCeiling(themeId, formId, tabId) {
        if (!_currentUserProfile || _currentUserProfile.super_admin) {
            return { podeVer: true, podeEditar: true, podeExcluir: true };
        }

        const userId = _currentUserProfile.id;
        const camadaPerm = _allCamadaPerms[`${userId}:${themeId}`] || { pode_ver: false, pode_editar: false, pode_excluir: false };
        
        let podeVerAba = camadaPerm.pode_ver;
        let podeEditarAba = camadaPerm.pode_editar;

        if (formId && tabId) {
            const abaPerm = _allAbaPerms[`${userId}:${formId}:${tabId}`];
            if (abaPerm) {
                podeVerAba = !!abaPerm.pode_ver;
                podeEditarAba = !!abaPerm.pode_editar;
            }
        }

        return {
            podeVer: podeVerAba,
            podeEditar: podeEditarAba,
            podeExcluir: !!camadaPerm.pode_excluir
        };
    }

    function renderUsersList(containerId, searchQuery = '') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const isSuperAdmin = !!(_currentUserProfile && _currentUserProfile.super_admin);
        const query = searchQuery.trim().toLowerCase();

        // 1. Filtragem por município ativo (se aplicável) e isolamento por entidade
        let filtered = _allMembros.filter(m => {
            if (_targetMunicipioId && m.municipio_id !== _targetMunicipioId) return false;

            // Se não for SuperAdmin, só pode ver membros que ele tem permissão de gerenciar
            if (!isSuperAdmin && !canManageMembro(m)) return false;

            // Filtro de texto da busca
            if (query) {
                const nome = (m.profiles?.nome || '').toLowerCase();
                const email = (m.profiles?.email || '').toLowerCase();
                const entidade = (m.entidade || '').toLowerCase();
                const cargo = (m.cargo || '').toLowerCase();
                const mun = (m.municipios?.nome || '').toLowerCase();

                return nome.includes(query) || email.includes(query) || entidade.includes(query) || cargo.includes(query) || mun.includes(query);
            }
            return true;
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-slate-400 text-sm italic bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                    ${query ? 'Nenhum usuário encontrado para esta busca.' : 'Nenhum usuário disponível para gerenciamento.'}
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(m => renderUserCard(m)).join('');
    }

    function renderUserCard(m) {
        const perfil = m.profiles || {};
        const municipio = m.municipios || {};
        const entidadeNome = (m.entidade || 'Não informada').trim();
        const tipoEntidade = _entidadesTipos[entidadeNome] || (entidadeNome.toLowerCase().includes('prefeitura') ? 'municipal' : 'externo');
        const isMunicipal = (tipoEntidade === 'municipal');
        const isEditing = _editingCardIds.has(m.id);

        const temasDoMunicipio = _allTemas.filter(t => t.municipio_id === m.municipio_id);

        // Níveis de acesso permitidos de acordo com a entidade
        let papelOptionsHtml = '';
        if (isMunicipal) {
            papelOptionsHtml = `
                <option value="admin" ${m.papel === 'admin' ? 'selected' : ''}>Administrador (Municipal)</option>
                <option value="visualizador" ${m.papel === 'visualizador' || m.papel === 'editor' ? 'selected' : ''}>Usuário (Municipal)</option>
            `;
        } else {
            papelOptionsHtml = `
                <option value="admin" ${m.papel === 'admin' ? 'selected' : ''}>Administrador (${entidadeNome || 'Entidade'})</option>
                <option value="externo" ${m.papel === 'externo' || m.papel === 'visualizador' || m.papel === 'editor' ? 'selected' : ''}>Acesso Externo</option>
            `;
        }

        const statusOptionsHtml = ['pendente', 'aprovado', 'rejeitado'].map(s => 
            `<option value="${s}" ${m.status === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`
        ).join('');

        const statusBadgeColor = m.status === 'aprovado' 
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
            : (m.status === 'pendente' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20');

        // Renderiza a Árvore de Permissões (Camadas ➔ Abas Expansíveis)
        const camadasHtml = temasDoMunicipio.map(tema => {
            const userCamadaPerm = _allCamadaPerms[`${m.user_id}:${tema.id}`] || { pode_ver: false, pode_editar: false, pode_excluir: false };
            const adminCeiling = getAdminCeiling(tema.id);

            const podeVerCamada = !!userCamadaPerm.pode_ver;
            const podeExcluirCamada = !!userCamadaPerm.pode_excluir;

            const formVinculado = (tema.tipo_cadastro && tema.tipo_cadastro !== 'padrao') ? _allForms[tema.tipo_cadastro] : null;
            const numAbas = (formVinculado && formVinculado.tabs) ? formVinculado.tabs.length : 0;

            // Renderiza abas expansíveis se houver formulário
            let abasHtml = '';
            if (numAbas > 0) {
                abasHtml = `
                    <div id="camada-sub-abas-${m.id}-${tema.id}" class="camada-sub-abas hidden ml-4 pl-3 border-l-2 border-slate-200 dark:border-slate-700/60 mt-2 space-y-1.5 sub-abas-container transition-all" data-theme-id="${tema.id}">
                        <div class="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Abas do Formulário: ${formVinculado.title || ''}</div>
                        ${formVinculado.tabs.map(tab => {
                            const userAbaPerm = _allAbaPerms[`${m.user_id}:${formVinculado.id}:${tab.id}`] || { pode_ver: podeVerCamada, pode_editar: userCamadaPerm.pode_editar };
                            const abaCeiling = getAdminCeiling(tema.id, formVinculado.id, tab.id);

                            const verDisabled = (!isEditing || !abaCeiling.podeVer) ? 'disabled' : '';
                            const editDisabled = (!isEditing || !abaCeiling.podeEditar) ? 'disabled' : '';

                            return `
                                <div class="flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-800/40 rounded-lg px-3 py-1.5 text-xs" data-form-id="${formVinculado.id}" data-tab-id="${tab.id}">
                                    <span class="text-slate-700 dark:text-slate-300 font-medium truncate">${tab.title}</span>
                                    <div class="flex items-center gap-3 shrink-0">
                                        <label class="flex items-center gap-1.5 ${isEditing ? 'cursor-pointer' : 'cursor-default'} text-[11px] text-slate-600 dark:text-slate-400">
                                            <input type="checkbox" class="aba-ver-check rounded border-slate-300 dark:border-slate-600 text-sky-500 focus:ring-sky-400" ${userAbaPerm.pode_ver ? 'checked' : ''} ${verDisabled}> Ver
                                        </label>
                                        <label class="flex items-center gap-1.5 ${isEditing ? 'cursor-pointer' : 'cursor-default'} text-[11px] text-slate-600 dark:text-slate-400">
                                            <input type="checkbox" class="aba-editar-check rounded border-slate-300 dark:border-slate-600 text-sky-500 focus:ring-sky-400" ${userAbaPerm.pode_editar ? 'checked' : ''} ${editDisabled}> Editar
                                        </label>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            const camadaVerDisabled = (!isEditing || !adminCeiling.podeVer) ? 'disabled' : '';
            const camadaExcluirDisabled = (!isEditing || !adminCeiling.podeExcluir) ? 'disabled' : '';

            return `
                <div class="p-3 bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm transition-all" data-camada-id="${tema.id}">
                    <div class="flex items-center justify-between gap-2 flex-wrap">
                        <!-- Título e Gatilho do Accordion da Camada -->
                        <div class="flex items-center gap-2 min-w-0 cursor-pointer select-none" onclick="window.UsuariosManager.toggleCamadaAccordion('${m.id}', '${tema.id}')">
                            <span class="w-3 h-3 rounded-full shrink-0 shadow-sm" style="background-color: ${tema.cor || '#0ea5e9'}"></span>
                            <span class="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate hover:text-sky-600 transition-colors">${tema.nome}</span>
                            ${numAbas > 0 ? `
                                <span class="text-[10px] text-slate-400 flex items-center gap-0.5">
                                    (${numAbas} abas)
                                    <span id="camada-chevron-${m.id}-${tema.id}" class="material-symbols-outlined text-[16px] transition-transform duration-200">expand_more</span>
                                </span>
                            ` : ''}
                        </div>

                        <!-- Checkboxes da Camada -->
                        <div class="flex items-center gap-4 shrink-0">
                            <label class="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 ${isEditing ? 'cursor-pointer' : 'cursor-default'}">
                                <input type="checkbox" class="camada-ver-check rounded border-slate-300 dark:border-slate-600 text-sky-500 focus:ring-sky-400" ${podeVerCamada ? 'checked' : ''} ${camadaVerDisabled} onchange="window.UsuariosManager.toggleCamadaSubAbas(this, '${m.id}', '${tema.id}')">
                                Ver Camada
                            </label>
                            <label class="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 ${isEditing ? 'cursor-pointer' : 'cursor-default'}">
                                <input type="checkbox" class="camada-excluir-check rounded border-slate-300 dark:border-slate-600 text-rose-500 focus:ring-rose-400" ${podeExcluirCamada ? 'checked' : ''} ${camadaExcluirDisabled}>
                                Pode Excluir
                            </label>
                        </div>
                    </div>
                    ${abasHtml}
                </div>
            `;
        }).join('');

        // Botões de Ação no topo: Editar vs (Salvar + Cancelar)
        const botoesAcaoHtml = isEditing ? `
            <div class="flex items-center gap-2">
                <button type="button" onclick="window.UsuariosManager.cancelarEdicao('${m.id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1">
                    <span class="material-symbols-outlined text-[15px]">close</span> Cancelar
                </button>
                <button type="button" onclick="window.UsuariosManager.salvarUsuario('${m.id}')" class="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[15px]">save</span> Salvar
                </button>
            </div>
        ` : `
            <button type="button" onclick="window.UsuariosManager.iniciarEdicao('${m.id}')" class="px-3.5 py-1.5 bg-slate-100 hover:bg-sky-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 hover:text-sky-600 dark:text-slate-200 dark:hover:text-sky-400 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[15px]">edit</span> Editar
            </button>
        `;

        return `
            <div class="card rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 mb-4 transition-all" data-user-card="${m.id}" data-user-id="${m.user_id}" data-municipio-id="${m.municipio_id}">
                <!-- Cabeçalho do Card (Expansível ao Clicar) -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
                    <div class="flex items-center gap-2 cursor-pointer min-w-0 flex-1" onclick="window.UsuariosManager.toggleUserCard('${m.id}')">
                        <span id="user-chevron-${m.id}" class="material-symbols-outlined text-[22px] text-slate-400 transition-transform duration-200 shrink-0 ${isEditing ? 'rotate-180' : ''}">expand_more</span>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h4 class="font-bold text-sm text-slate-900 dark:text-white hover:text-sky-600 transition-colors truncate">${perfil.nome || '(Sem nome)'}</h4>
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadgeColor} uppercase tracking-wider">${STATUS_LABELS[m.status] || m.status}</span>
                                <span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${PAPEL_LABELS[m.papel] || m.papel}</span>
                            </div>
                            <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                                <span>${perfil.email || ''}</span>
                                <span>•</span>
                                <span class="font-medium text-slate-700 dark:text-slate-300">${entidadeNome}</span>
                                ${m.cargo ? `<span>(${m.cargo})</span>` : ''}
                                <span>•</span>
                                <span class="text-sky-600 dark:text-sky-400 font-semibold">${municipio.nome || 'Município'}${municipio.uf ? ' - ' + municipio.uf : ''}</span>
                            </div>
                        </div>
                    </div>

                    <div class="shrink-0 self-end sm:self-auto">
                        ${botoesAcaoHtml}
                    </div>
                </div>

                <!-- Corpo Expansível do Card -->
                <div id="user-card-body-${m.id}" class="user-card-body ${isEditing ? '' : 'hidden'} mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 transition-all">
                    <!-- Controles de Nível de Acesso e Status -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div>
                            <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nível de Acesso</label>
                            <select class="user-papel-select w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-sky-500 ${!isEditing ? 'opacity-70 pointer-events-none' : ''}" ${!isEditing ? 'disabled' : ''}>
                                ${papelOptionsHtml}
                            </select>
                        </div>
                        <div>
                            <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Status da Solicitação</label>
                            <select class="user-status-select w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-sky-500 ${!isEditing ? 'opacity-70 pointer-events-none' : ''}" ${!isEditing ? 'disabled' : ''}>
                                ${statusOptionsHtml}
                            </select>
                        </div>
                    </div>

                    <!-- Gestão Granular de Camadas e Abas -->
                    <div class="mt-3">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-[16px] text-sky-500">layers</span>
                                Permissões de Camadas e Abas
                            </span>
                            <span class="text-[10px] text-slate-400">Clique na camada para expandir as abas</span>
                        </div>

                        <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
                            ${camadasHtml || '<div class="text-xs text-slate-400 italic py-2">Nenhuma camada cadastrada neste município.</div>'}
                        </div>
                    </div>

                    <!-- Botão de Excluir Vínculo (só quando em edição) -->
                    ${isEditing ? `
                    <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-end">
                        <button type="button" onclick="window.UsuariosManager.removerAcesso('${m.id}')" class="text-xs text-rose-500 hover:text-rose-700 hover:underline flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">delete</span>
                            Revogar acesso deste usuário neste município
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Alterna a expansão do card de usuário
    function toggleUserCard(membroId) {
        const body = document.getElementById(`user-card-body-${membroId}`);
        const chevron = document.getElementById(`user-chevron-${membroId}`);
        if (!body) return;

        const isHidden = body.classList.contains('hidden');
        if (isHidden) {
            body.classList.remove('hidden');
            if (chevron) chevron.classList.add('rotate-180');
        } else {
            body.classList.add('hidden');
            if (chevron) chevron.classList.remove('rotate-180');
        }
    }

    // Alterna a expansão das sub-abas de uma camada
    function toggleCamadaAccordion(membroId, temaId) {
        const subAbas = document.getElementById(`camada-sub-abas-${membroId}-${temaId}`);
        const chevron = document.getElementById(`camada-chevron-${membroId}-${temaId}`);
        if (!subAbas) return;

        const isHidden = subAbas.classList.contains('hidden');
        if (isHidden) {
            subAbas.classList.remove('hidden');
            if (chevron) chevron.classList.add('rotate-180');
        } else {
            subAbas.classList.add('hidden');
            if (chevron) chevron.classList.remove('rotate-180');
        }
    }

    // Ativa o modo de edição para o card
    function iniciarEdicao(membroId) {
        _editingCardIds.add(membroId);
        const card = document.querySelector(`[data-user-card="${membroId}"]`);
        const container = card ? card.parentElement : null;
        if (container) {
            const searchInput = document.getElementById('usuarios-search') || document.getElementById('users-search');
            renderUsersList(container.id, searchInput ? searchInput.value : '');
        }
    }

    // Cancela o modo de edição
    function cancelarEdicao(membroId) {
        _editingCardIds.delete(membroId);
        const card = document.querySelector(`[data-user-card="${membroId}"]`);
        const container = card ? card.parentElement : null;
        if (container) {
            const searchInput = document.getElementById('usuarios-search') || document.getElementById('users-search');
            renderUsersList(container.id, searchInput ? searchInput.value : '');
        }
    }

    // Alterna visualmente as sub-abas ao marcar/desmarcar a camada
    function toggleCamadaSubAbas(camadaCheckbox, membroId, themeId) {
        const isChecked = camadaCheckbox.checked;
        const subContainer = document.getElementById(`camada-sub-abas-${membroId}-${temaId}`);
        if (subContainer) {
            subContainer.style.opacity = isChecked ? '1' : '0.4';
            subContainer.style.pointerEvents = isChecked ? 'auto' : 'none';
            if (!isChecked) {
                subContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            }
        }
    }

    // Salva as permissões e dados do usuário no Supabase
    async function salvarUsuario(membroId) {
        const card = document.querySelector(`[data-user-card="${membroId}"]`);
        if (!card) return;

        const userId = card.getAttribute('data-user-id');
        const papel = card.querySelector('.user-papel-select').value;
        const status = card.querySelector('.user-status-select').value;

        const saveBtn = card.querySelector('button[onclick*="salvarUsuario"]');
        const originalText = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) {
            saveBtn.innerHTML = '<span class="material-symbols-outlined text-[15px] animate-spin">refresh</span> Salvando...';
            saveBtn.disabled = true;
        }

        try {
            // 1. Atualiza município_membros
            const { error: membroErr } = await supabaseClient
                .from('municipio_membros')
                .update({ papel, status })
                .eq('id', membroId);

            if (membroErr) throw membroErr;

            // 2. Coleta permissões de camadas
            const camadaCards = card.querySelectorAll('[data-camada-id]');
            const camadaRows = [];
            const abaRows = [];

            camadaCards.forEach(cCard => {
                const themeId = cCard.getAttribute('data-camada-id');
                const podeVer = cCard.querySelector('.camada-ver-check').checked;
                const podeExcluir = cCard.querySelector('.camada-excluir-check').checked;

                // Coleta abas vinculadas
                const abaEls = cCard.querySelectorAll('[data-form-id][data-tab-id]');
                let podeEditarCamada = false;

                abaEls.forEach(aEl => {
                    const formId = aEl.getAttribute('data-form-id');
                    const tabId = aEl.getAttribute('data-tab-id');
                    const podeVerAba = aEl.querySelector('.aba-ver-check').checked;
                    const podeEditarAba = aEl.querySelector('.aba-editar-check').checked;

                    if (podeEditarAba) podeEditarCamada = true;

                    abaRows.push({
                        user_id: userId,
                        form_id: formId,
                        tab_id: tabId,
                        pode_ver: podeVer ? podeVerAba : false,
                        pode_editar: podeVer ? podeEditarAba : false
                    });
                });

                camadaRows.push({
                    user_id: userId,
                    theme_id: themeId,
                    pode_ver: podeVer,
                    pode_editar: podeEditarCamada,
                    pode_excluir: podeExcluir
                });
            });

            // 3. Salva permissoes_camada
            if (camadaRows.length > 0) {
                const { error: cErr } = await supabaseClient
                    .from('permissoes_camada')
                    .upsert(camadaRows, { onConflict: 'user_id,theme_id' });
                if (cErr) console.warn('Erro ao atualizar permissoes_camada:', cErr);
            }

            // 4. Salva permissoes_aba
            if (abaRows.length > 0) {
                const { error: aErr } = await supabaseClient
                    .from('permissoes_aba')
                    .upsert(abaRows, { onConflict: 'user_id,form_id,tab_id' });
                if (aErr) console.warn('Erro ao atualizar permissoes_aba:', aErr);
            }

            // Atualiza cache em memória
            const membroObj = _allMembros.find(m => m.id === membroId);
            if (membroObj) {
                membroObj.papel = papel;
                membroObj.status = status;
            }
            camadaRows.forEach(cr => {
                _allCamadaPerms[`${cr.user_id}:${cr.theme_id}`] = cr;
            });
            abaRows.forEach(ar => {
                _allAbaPerms[`${ar.user_id}:${ar.form_id}:${ar.tab_id}`] = ar;
            });

            _editingCardIds.delete(membroId);

            const container = card.parentElement;
            if (container) {
                const searchInput = document.getElementById('usuarios-search') || document.getElementById('users-search');
                renderUsersList(container.id, searchInput ? searchInput.value : '');
            }

            alert('✓ Permissões e dados do usuário atualizados com sucesso!');

        } catch (err) {
            console.error('Erro ao salvar usuário:', err);
            alert('Erro ao salvar: ' + (err.message || err));
        } finally {
            if (saveBtn) {
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
            }
        }
    }

    async function removerAcesso(membroId) {
        if (!confirm('Deseja realmente revogar o acesso deste usuário neste município?')) return;

        try {
            const { error } = await supabaseClient.from('municipio_membros').delete().eq('id', membroId);
            if (error) throw error;

            alert('Acesso revogado com sucesso!');
            _editingCardIds.delete(membroId);
            _allMembros = _allMembros.filter(m => m.id !== membroId);
            const card = document.querySelector(`[data-user-card="${membroId}"]`);
            if (card) card.remove();
        } catch (err) {
            alert('Erro ao revogar acesso: ' + (err.message || err));
        }
    }

    // Expõe a API no escopo global
    window.UsuariosManager = {
        init: initUsuariosManager,
        toggleUserCard,
        toggleCamadaAccordion,
        iniciarEdicao,
        cancelarEdicao,
        salvarUsuario,
        removerAcesso,
        toggleCamadaSubAbas
    };

})(window);
