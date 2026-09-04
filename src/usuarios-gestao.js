/**
 * GeoGestor — Gestão Unificada de Usuários Únicos, Entidades e Permissões Hierárquicas
 * Compartilhado entre home.html e settings.html
 * 
 * Recursos:
 * - 1 Único Card por Usuário (Agrupamento por user_id).
 * - Seletor interativo de Municípios: ao clicar no município, exibe o quadro de camadas e abas daquele município.
 * - Modo Visualização vs Modo Edição.
 * - Regra de Ouro: "Quem pode mais, pode menos; quem pode menos, não pode mais."
 */

(function(window) {
    'use strict';

    const PAPEL_LABELS = {
        admin: 'Administrador',
        visualizador: 'Usuário',
        editor: 'Usuário',
        externo: 'Usuário'
    };

    const STATUS_LABELS = {
        pendente: 'Pendente',
        aprovado: 'Aprovado',
        rejeitado: 'Rejeitado'
    };

    function getEntitySigla(name) {
        if (!name) return 'Município';
        const n = name.trim().toLowerCase();
        if (n.includes('mpf') || n.includes('ministério público')) return 'MPF';
        if (n.includes('polícia federal') || n.includes('policia federal') || n === 'pf') return 'PF';
        if (n.includes('spu') || n.includes('patrimônio da união')) return 'SPU';
        if (n.includes('prefeitura') || n.includes('município') || n.includes('municipio') || n === 'pmc') return 'Município';
        return name;
    }

    // Estado interno do painel
    let _allMembros = [];
    let _allTemas = [];
    let _allForms = {};
    let _allCamadaPerms = {};
    let _allAbaPerms = {};
    let _allRasters = [];
    let _allRasterPerms = {};
    let _allMunicipios = [];
    let _currentUserProfile = null;
    let _currentUserMembros = [];
    let _entidadesTipos = {}; // nome_entidade -> 'municipal' | 'externo' | 'outro'
    let _targetMunicipioId = null; // Se preenchido, prioriza o município ativo
    let _editingUserIds = new Set(); // IDs dos usuários em modo edição
    let _userSelectedMunMap = {}; // userId -> munId selecionado para visualizar/editar permissões

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
            if (!_currentUserProfile || !_currentUserProfile.id) {
                const { data: sessData } = await supabaseClient.auth.getSession();
                if (sessData && sessData.session && sessData.session.user) {
                    const sessUserId = sessData.session.user.id;
                    const { data: prof } = await supabaseClient.from('profiles').select('*').eq('id', sessUserId).maybeSingle();
                    _currentUserProfile = prof || { id: sessUserId, email: sessData.session.user.email, super_admin: false };
                }
            }

            const currentUserId = _currentUserProfile ? _currentUserProfile.id : null;

            // 1. Carrega dados básicos em paralelo
            const [membrosRes, temasRes, formsRes, permsCamadaRes, permsAbaRes, entidadesRes, minhasRes, munRes, rastersRes, permsRasterRes] = await Promise.all([
                supabaseClient
                    .from('municipio_membros')
                    .select('id, user_id, municipio_id, papel, status, entidade, cargo, solicitado_em, profiles!user_id(id, nome, email, super_admin, ponto_focal), municipios(id, nome, uf)')
                    .order('solicitado_em', { ascending: false }),
                supabaseClient.from('temas').select('*'),
                supabaseClient.from('forms').select('id, title, schema'),
                supabaseClient.from('permissoes_camada').select('*'),
                supabaseClient.from('permissoes_aba').select('*'),
                supabaseClient.from('entidades_padrao').select('nome, tipo, sigla'),
                currentUserId ? supabaseClient.from('municipio_membros').select('*').eq('user_id', currentUserId) : Promise.resolve({ data: [] }),
                supabaseClient.from('municipios').select('id, nome, uf').eq('ativo', true).order('nome'),
                supabaseClient.from('imagens_raster').select('id, nome, tipo, data_imagem, municipio_id, entidade, compartilhada'),
                supabaseClient.from('permissoes_raster').select('*')
            ]);

            if (membrosRes.error) throw membrosRes.error;

            _allMembros = membrosRes.data || [];
            _allTemas = temasRes.data || [];
            _currentUserMembros = minhasRes.data || [];
            _allMunicipios = munRes.data || [];
            _allRasters = rastersRes?.data || [];
            _allRasterPerms = {};
            (permsRasterRes?.data || []).forEach(p => {
                _allRasterPerms[`${p.user_id}:${p.raster_id}`] = p;
            });

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

    // Identifica se o usuário logado pode gerenciar o usuário alvo
    function canManageUser(userObj) {
        if (!_currentUserProfile) return false;
        if (_currentUserProfile.super_admin) return true;

        // Admin de Entidade: verifica se possui vínculo de admin no mesmo município e mesma entidade
        const minhaEntidade = (_currentUserMembros[0]?.entidade || '').trim().toLowerCase();
        const userEntidade = (userObj.entidade || '').trim().toLowerCase();

        if (minhaEntidade && userEntidade && minhaEntidade === userEntidade) {
            return _currentUserMembros.some(m => m.papel === 'admin' && m.status === 'aprovado');
        }

        return false;
    }

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

        // 1. Agrupa os membros por pessoa única (user_id)
        const userMap = new Map();
        _allMembros.forEach(m => {
            const uid = m.user_id;
            if (!userMap.has(uid)) {
                userMap.set(uid, {
                    user_id: uid,
                    profile: m.profiles || {},
                    ponto_focal: !!(m.profiles && m.profiles.ponto_focal),
                    entidade: m.entidade,
                    cargo: m.cargo,
                    papel: m.papel,
                    status: m.status,
                    membros: []
                });
            }
            const userObj = userMap.get(uid);
            userObj.membros.push(m);
            if (m.profiles?.ponto_focal) userObj.ponto_focal = true;
            // Se houver algum vínculo aprovado ou admin, prioriza na exibição
            if (m.status === 'aprovado') userObj.status = 'aprovado';
            if (m.papel === 'admin') userObj.papel = 'admin';
        });

        let uniqueUsers = Array.from(userMap.values());

        // 2. Filtra por busca e permissões
        uniqueUsers = uniqueUsers.filter(u => {
            if (_targetMunicipioId) {
                // Se estiver dentro de um município específico, verifica se o usuário tem vínculo nele
                const temNoMun = u.membros.some(mb => mb.municipio_id === _targetMunicipioId);
                if (!temNoMun && !isSuperAdmin) return false;
            }

            if (!isSuperAdmin && !canManageUser(u)) return false;

            if (query) {
                const nome = (u.profile?.nome || '').toLowerCase();
                const email = (u.profile?.email || '').toLowerCase();
                const entidade = (u.entidade || '').toLowerCase();
                const cargo = (u.cargo || '').toLowerCase();
                const munNomes = u.membros.map(mb => (mb.municipios?.nome || '').toLowerCase()).join(' ');

                return nome.includes(query) || email.includes(query) || entidade.includes(query) || cargo.includes(query) || munNomes.includes(query);
            }
            return true;
        });

        if (uniqueUsers.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-slate-400 text-sm italic bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                    ${query ? 'Nenhum usuário encontrado para esta busca.' : 'Nenhum usuário disponível para gerenciamento.'}
                </div>
            `;
            return;
        }

        // 3. Ordenação alfabética pelo nome do usuário
        uniqueUsers.sort((a, b) => {
            const nomeA = (a.profile?.nome || '').trim();
            const nomeB = (b.profile?.nome || '').trim();
            return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
        });

        container.innerHTML = uniqueUsers.map(u => renderUserCard(u)).join('');
    }

    function renderUserCard(userObj) {
        const userId = userObj.user_id;
        const perfil = userObj.profile || {};
        const entidadeNome = (userObj.entidade || 'Não informada').trim();
        const tipoEntidade = _entidadesTipos[entidadeNome] || (entidadeNome.toLowerCase().includes('prefeitura') || entidadeNome.toLowerCase().includes('municipal') ? 'municipal' : 'externo');
        const isMunicipal = (tipoEntidade === 'municipal');
        const isEditing = _editingUserIds.has(userId);

        const munIdsAprovados = new Set(userObj.membros.filter(mb => mb.status === 'aprovado').map(mb => mb.municipio_id));
        const todosMunIdsDoUser = new Set(userObj.membros.map(mb => mb.municipio_id));

        // Define o município selecionado para este usuário no card
        if (isMunicipal) {
            // Usuários municipais são 100% restritos ao seu município de cadastro
            const munOrigem = userObj.membros[0]?.municipio_id || Array.from(todosMunIdsDoUser)[0];
            if (munOrigem) {
                _userSelectedMunMap[userId] = munOrigem;
            } else if (_allMunicipios.length > 0) {
                _userSelectedMunMap[userId] = _allMunicipios[0].id;
            }
        } else if (!_userSelectedMunMap[userId]) {
            if (_targetMunicipioId && todosMunIdsDoUser.has(_targetMunicipioId)) {
                _userSelectedMunMap[userId] = _targetMunicipioId;
            } else if (munIdsAprovados.size > 0) {
                _userSelectedMunMap[userId] = Array.from(munIdsAprovados)[0];
            } else if (todosMunIdsDoUser.size > 0) {
                _userSelectedMunMap[userId] = Array.from(todosMunIdsDoUser)[0];
            } else if (_allMunicipios.length > 0) {
                _userSelectedMunMap[userId] = _allMunicipios[0].id;
            }
        }

        const selectedMunId = _userSelectedMunMap[userId];
        const selectedMunObj = _allMunicipios.find(m => m.id === selectedMunId) || { nome: 'Município' };

        // Níveis de acesso simplificados: Administrador ou Usuário
        const papelOptionsHtml = `
            <option value="visualizador" ${userObj.papel !== 'admin' ? 'selected' : ''}>Usuário</option>
            <option value="admin" ${userObj.papel === 'admin' ? 'selected' : ''}>Administrador</option>
        `;

        const statusOptionsHtml = ['pendente', 'aprovado', 'rejeitado'].map(s => 
            `<option value="${s}" ${userObj.status === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`
        ).join('');

        const statusBadgeColor = userObj.status === 'aprovado' 
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
            : (userObj.status === 'pendente' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20');

        // Determina a entidade do usuário deste card
        const userEntidadeRaw = (userObj.entidade || userObj.profile?.entidade || (userObj.membros && userObj.membros[0]?.entidade) || 'Prefeitura Municipal').trim();
        const userSigla = getEntitySigla(userEntidadeRaw);

        let localMeta = {};
        try {
            localMeta = JSON.parse(localStorage.getItem('constructive_themes_meta') || '{}');
        } catch(e) {}

        function getThemeEntity(t) {
            if (t.metadata && t.metadata.entidade) return t.metadata.entidade.trim();
            if (localMeta[t.id] && localMeta[t.id].entidade) return localMeta[t.id].entidade.trim();
            if (t.entidade) return t.entidade.trim();
            return 'Prefeitura Municipal';
        }

        // Renderiza camadas do município selecionado
        // FILTRO DE SEGURANÇA E ISOLAMENTO INSTITUCIONAL:
        // No card de cada usuário aparecem estritamente as camadas referentes à SUA entidade,
        // ou camadas de outros órgãos onde este usuário já possui autorização pontual concedida.
        const temasDoMunicipio = _allTemas.filter(t => {
            if (t.municipio_id && t.municipio_id !== selectedMunId) return false;
            
            const tEntRaw = getThemeEntity(t);
            const tSigla = getEntitySigla(tEntRaw);

            // A camada pertence à entidade do usuário deste card
            if (tSigla === userSigla) return true;

            // Se for camada compartilhada de outro ente, só aparece se o usuário tiver autorização pontual
            const userHasPerm = _allCamadaPerms[`${userId}:${t.id}`]?.pode_ver;
            if (userHasPerm) return true;
            
            return false;
        });

        const camadasHtml = temasDoMunicipio.map(tema => {
            const userCamadaPerm = _allCamadaPerms[`${userId}:${tema.id}`] || { pode_ver: false, pode_editar: false, pode_excluir: false };
            const adminCeiling = getAdminCeiling(tema.id);

            const podeVerCamada = !!userCamadaPerm.pode_ver;
            const podeExcluirCamada = !!userCamadaPerm.pode_excluir;

            const formVinculado = (tema.tipo_cadastro && tema.tipo_cadastro !== 'padrao') ? _allForms[tema.tipo_cadastro] : null;
            const numAbas = (formVinculado && formVinculado.tabs) ? formVinculado.tabs.length : 0;

            const tEntRaw = getThemeEntity(tema);
            const tSigla = getEntitySigla(tEntRaw);
            const isFromOtherEntity = tSigla !== userSigla;

            let abasHtml = '';
            if (numAbas > 0) {
                abasHtml = `
                    <div id="camada-sub-abas-${userId}-${tema.id}" class="camada-sub-abas hidden ml-3 pl-3 border-l-2 border-slate-300 dark:border-slate-600 mt-2 space-y-2 sub-abas-container transition-all" data-theme-id="${tema.id}">
                        <div class="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">article</span> Abas do Formulário: ${formVinculado.title || ''}
                        </div>
                        ${formVinculado.tabs.map(tab => {
                            const userAbaPerm = _allAbaPerms[`${userId}:${formVinculado.id}:${tab.id}`] || { pode_ver: false, pode_editar: false };
                            const abaCeiling = getAdminCeiling(tema.id, formVinculado.id, tab.id);

                            const verDisabled = (!isEditing || !abaCeiling.podeVer) ? 'disabled' : '';
                            const editDisabled = (!isEditing || !abaCeiling.podeEditar) ? 'disabled' : '';

                            return `
                                <div class="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600/80 rounded-lg px-3 py-2 text-xs shadow-sm hover:border-slate-400 dark:hover:border-slate-500 transition-colors" data-form-id="${formVinculado.id}" data-tab-id="${tab.id}">
                                    <span class="text-slate-900 dark:text-slate-100 font-semibold truncate">${tab.title}</span>
                                    <div class="flex items-center gap-4 shrink-0">
                                        <label class="flex items-center gap-1.5 ${isEditing ? 'cursor-pointer' : 'cursor-default'} text-xs font-medium text-slate-700 dark:text-slate-300">
                                            <input type="checkbox" class="aba-ver-check rounded border-slate-400 dark:border-slate-500 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5" ${userAbaPerm.pode_ver ? 'checked' : ''} ${verDisabled}> Ver
                                        </label>
                                        <label class="flex items-center gap-1.5 ${isEditing ? 'cursor-pointer' : 'cursor-default'} text-xs font-medium text-slate-700 dark:text-slate-300">
                                            <input type="checkbox" class="aba-editar-check rounded border-slate-400 dark:border-slate-500 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5" ${userAbaPerm.pode_editar ? 'checked' : ''} ${editDisabled}> Editar
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
                <div class="bg-slate-100/90 dark:bg-slate-800/90 rounded-xl border-2 border-slate-300/90 dark:border-slate-700 shadow-sm transition-all overflow-hidden mb-2.5" style="border-left-width: 6px; border-left-color: ${tema.cor || '#0ea5e9'}" data-camada-id="${tema.id}">
                    <div class="p-3.5 flex items-center justify-between gap-3 flex-wrap cursor-pointer select-none hover:bg-slate-200/70 dark:hover:bg-slate-700/60 transition-colors" onclick="window.UsuariosManager.toggleCamadaAccordion('${userId}', '${tema.id}')">
                        <div class="flex items-center gap-2.5 min-w-0 flex-1">
                            <span class="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm border border-white/40" style="background-color: ${tema.cor || '#0ea5e9'}"></span>
                            <span class="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">${tema.nome}</span>
                            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-extrabold rounded ${isFromOtherEntity ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'} shrink-0" title="Entidade: ${tEntRaw}${isFromOtherEntity ? ' (Compartilhada de outro órgão)' : ''}">
                                <span class="material-symbols-outlined text-[10px]">${isFromOtherEntity ? 'share' : 'hub'}</span>
                                ${tSigla}${isFromOtherEntity ? ' (Compartilhada)' : ''}
                            </span>
                            ${numAbas > 0 ? `
                                <span class="text-[11px] font-semibold text-sky-700 dark:text-sky-400 bg-sky-100 dark:bg-sky-950/60 px-2 py-0.5 rounded-full border border-sky-300 dark:border-sky-800 flex items-center gap-0.5">
                                    ${numAbas} ${numAbas === 1 ? 'aba' : 'abas'}
                                    <span id="camada-chevron-${userId}-${tema.id}" class="material-symbols-outlined text-[16px] transition-transform duration-200">expand_more</span>
                                </span>
                            ` : ''}
                        </div>

                        <div class="flex items-center gap-4 shrink-0 bg-white/80 dark:bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs" onclick="event.stopPropagation()">
                            <label class="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 ${isEditing ? 'cursor-pointer' : 'cursor-default'}">
                                <input type="checkbox" class="camada-ver-check rounded border-slate-400 dark:border-slate-500 text-sky-600 focus:ring-sky-500 w-4 h-4" ${podeVerCamada ? 'checked' : ''} ${camadaVerDisabled} onchange="window.UsuariosManager.toggleCamadaSubAbas(this, '${userId}', '${tema.id}')">
                                Ver Camada
                            </label>
                            <label class="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 ${isEditing ? 'cursor-pointer' : 'cursor-default'}">
                                <input type="checkbox" class="camada-excluir-check rounded border-slate-400 dark:border-slate-500 text-rose-600 focus:ring-rose-500 w-4 h-4" ${podeExcluirCamada ? 'checked' : ''} ${camadaExcluirDisabled}>
                                Pode Excluir
                            </label>
                        </div>
                    </div>
                    <div class="px-3.5 pb-3.5">
                        ${abasHtml}
                    </div>
                </div>
            `;
        }).join('');

        // Ortofotos do município selecionado (filtradas estritamente pela entidade do usuário)
        const rastersDoMunicipio = (_allRasters || []).filter(r => {
            if (r.municipio_id && r.municipio_id !== selectedMunId) return false;
            const rEntRaw = (r.entidade || 'Prefeitura Municipal').trim();
            const rSigla = getEntitySigla(rEntRaw);

            // A ortofoto pertence à entidade do usuário
            if (rSigla === userSigla) return true;

            // Ou o usuário tem autorização pontual concedida
            const userHasPerm = _allRasterPerms[`${userId}:${r.id}`]?.pode_ver;
            if (userHasPerm) return true;

            return false;
        });

        const ortofotosHtml = rastersDoMunicipio.map(r => {
            const userRasterPerm = _allRasterPerms[`${userId}:${r.id}`] || { pode_ver: false };
            const podeVerRaster = !!userRasterPerm.pode_ver;
            let dateStr = '';
            if (r.data_imagem) {
                dateStr = r.data_imagem.split('-').reverse().join('/');
            } else if (r.nome) {
                const m = r.nome.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
                if (m) dateStr = `${m[1]}/${m[2]}/${m[3]}`;
            }

            const rEntRaw = (r.entidade || 'Prefeitura Municipal').trim();
            const rSigla = getEntitySigla(rEntRaw);
            const isOtherRaster = rSigla !== userSigla;

            return `
                <div class="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-colors" data-raster-id="${r.id}">
                    <div class="flex items-center gap-3 min-w-0 pr-2">
                        <div class="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0 border border-emerald-500/20">
                            <span class="material-symbols-outlined text-[18px]">satellite</span>
                        </div>
                        <div class="flex flex-col min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title="${r.nome}">${r.nome}</span>
                                <span class="inline-flex items-center gap-1 px-1.5 py-0.2 text-[8.5px] font-extrabold rounded ${isOtherRaster ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'} shrink-0">
                                    <span class="material-symbols-outlined text-[10px]">${isOtherRaster ? 'share' : 'hub'}</span>
                                    ${rSigla}${isOtherRaster ? ' (Compartilhada)' : ''}
                                </span>
                                ${dateStr ? `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">${dateStr}</span>` : ''}
                            </div>
                            <span class="text-[10px] text-slate-400 font-medium">${r.tipo === 'xyz_tiles' ? 'Ortofoto • XYZ Tiles' : 'GeoTIFF • Imagem'}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                        <label class="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 ${isEditing ? 'cursor-pointer' : 'cursor-default'}">
                            <input type="checkbox" class="raster-ver-check rounded border-slate-400 dark:border-slate-500 text-emerald-600 focus:ring-emerald-500 w-4 h-4" ${podeVerRaster ? 'checked' : ''} ${!isEditing ? 'disabled' : ''}>
                            Ver Ortofoto
                        </label>
                    </div>
                </div>
            `;
        }).join('');

        // Seletor de Municípios Atribuídos
        let atribuicaoMunicipiosHtml = '';
        if (!isMunicipal) {
            // Entidades Externas / Fiscais (MPF, PF, SPU, etc.): Podem atuar transversalmente em múltiplos municípios
            atribuicaoMunicipiosHtml = `
                <div class="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-800">
                    <div class="flex items-center justify-between mb-2 flex-wrap gap-1">
                        <span class="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[17px] text-sky-600 dark:text-sky-400">domain_add</span>
                            Municípios Atribuídos a este Usuário Externo (${entidadeNome})
                        </span>
                        <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Clique no município para ver/editar suas camadas</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                        ${_allMunicipios.map(mun => {
                            const isChecked = todosMunIdsDoUser.has(mun.id);
                            const isSelectedMun = (mun.id === selectedMunId);
                            const munDisabled = !isEditing ? 'disabled' : '';

                            const activeBorder = isSelectedMun 
                                ? 'border-sky-500 bg-sky-500/15 shadow-[0_0_12px_rgba(14,165,233,0.3)] ring-1 ring-sky-500' 
                                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:border-slate-400 dark:hover:border-slate-600';

                            return `
                                <div class="flex items-center justify-between p-2.5 rounded-xl border ${activeBorder} transition-all select-none cursor-pointer group" onclick="window.UsuariosManager.selectUserMun('${userId}', '${mun.id}')">
                                    <div class="flex items-center gap-2 min-w-0 flex-1">
                                        <input type="checkbox" class="user-mun-check rounded border-slate-400 text-sky-600 focus:ring-sky-500 w-4 h-4 shrink-0" value="${mun.id}" ${isChecked ? 'checked' : ''} ${munDisabled} onclick="event.stopPropagation()">
                                        <span class="text-xs font-bold ${isSelectedMun ? 'text-sky-600 dark:text-sky-400' : 'text-slate-800 dark:text-slate-200'} truncate">
                                            ${mun.nome}${mun.uf ? ' - ' + mun.uf : ''}
                                        </span>
                                    </div>
                                    ${isSelectedMun ? '<span class="material-symbols-outlined text-[16px] text-sky-500 shrink-0">check_circle</span>' : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        } else {
            // Entidades Municipais (Prefeitura Municipal): Usuário estritamente vinculado ao seu município
            atribuicaoMunicipiosHtml = `
                <div class="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-800">
                    <div class="flex items-center justify-between mb-2 flex-wrap gap-1">
                        <span class="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[17px] text-sky-600 dark:text-sky-400">location_city</span>
                            Município de Atuação — Entidade Municipal (${entidadeNome})
                        </span>
                        <span class="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 shadow-xs">
                            <span class="material-symbols-outlined text-[14px]">lock</span> Acesso exclusivo ao município de origem
                        </span>
                    </div>
                    <div class="flex items-center justify-between p-2.5 px-3.5 rounded-xl border border-sky-400/50 bg-sky-50/50 dark:bg-sky-950/25 text-slate-800 dark:text-slate-200 text-xs shadow-xs">
                        <div class="flex items-center gap-2.5 font-bold text-sky-700 dark:text-sky-300">
                            <span class="material-symbols-outlined text-[20px] text-sky-600 dark:text-sky-400">domain</span>
                            <span class="text-sm font-extrabold">${selectedMunObj.nome}${selectedMunObj.uf ? ' - ' + selectedMunObj.uf : ''}</span>
                        </div>
                        <span class="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Usuários municipais não podem ser vinculados a outros municípios</span>
                    </div>
                </div>
            `;
        }

        // Nomes dos municípios atribuídos para o cabeçalho
        const nomesMunicipiosDoUser = _allMunicipios
            .filter(mun => todosMunIdsDoUser.has(mun.id))
            .map(mun => mun.nome + (mun.uf ? ' - ' + mun.uf : ''))
            .join(', ') || 'Nenhum município vinculado';

        // Botões de Ação no topo
        const botoesAcaoHtml = isEditing ? `
            <div class="flex items-center gap-2">
                <button type="button" onclick="window.UsuariosManager.cancelarEdicao('${userId}')" class="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm">
                    <span class="material-symbols-outlined text-[16px]">close</span> Cancelar
                </button>
                <button type="button" onclick="window.UsuariosManager.salvarUsuario('${userId}')" class="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-md transition-colors flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[16px]">save</span> Salvar
                </button>
            </div>
        ` : `
            <div class="flex items-center gap-2">
                <button type="button" onclick="window.inspectUserLogs('${userId}')" class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border-2 border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs" title="Inspecionar e rastrear atividades deste usuário">
                    <span class="material-symbols-outlined text-[16px] text-indigo-600 dark:text-indigo-400">manage_search</span> Inspecionar
                </button>
                <button type="button" onclick="window.UsuariosManager.iniciarEdicao('${userId}')" class="px-3.5 py-1.5 bg-white hover:bg-sky-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 hover:text-sky-600 dark:text-slate-100 dark:hover:text-sky-400 border-2 border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs">
                    <span class="material-symbols-outlined text-[16px] text-sky-600 dark:text-sky-400">edit</span> Editar
                </button>
            </div>
        `;

        return `
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border-2 border-slate-300 dark:border-slate-700/90 shadow-md hover:shadow-lg mb-5 transition-all" data-user-card="${userId}" data-user-id="${userId}" data-selected-mun="${selectedMunId}">
                <!-- Cabeçalho do Card (Expansível ao Clicar) -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none bg-slate-50/90 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                    <div class="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1" onclick="window.UsuariosManager.toggleUserCard('${userId}')">
                        <span id="user-chevron-${userId}" class="material-symbols-outlined text-[24px] text-slate-500 dark:text-slate-400 transition-transform duration-200 shrink-0 ${isEditing ? 'rotate-180' : ''}">expand_more</span>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h4 class="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white hover:text-sky-600 transition-colors truncate">${perfil.nome || '(Sem nome)'}</h4>
                                <span class="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${statusBadgeColor} uppercase tracking-wider">${STATUS_LABELS[userObj.status] || userObj.status}</span>
                                <span class="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600">${PAPEL_LABELS[userObj.papel] || userObj.papel}</span>
                                ${userObj.ponto_focal ? `<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">share_location</span>Ponto Focal</span>` : ''}
                            </div>
                            <div class="text-xs text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-2 flex-wrap font-medium">
                                <span>${perfil.email || ''}</span>
                                <span>•</span>
                                <span class="font-bold text-slate-900 dark:text-slate-100">${entidadeNome}</span>
                                ${userObj.cargo ? `<span>(${userObj.cargo})</span>` : ''}
                                <span>•</span>
                                <span class="text-sky-600 dark:text-sky-400 font-bold" title="${nomesMunicipiosDoUser}">
                                    ${nomesMunicipiosDoUser}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div class="shrink-0 self-end sm:self-auto">
                        ${botoesAcaoHtml}
                    </div>
                </div>

                <!-- Corpo Expansível do Card -->
                <div id="user-card-body-${userId}" class="user-card-body ${isEditing ? '' : 'hidden'} mt-4 pt-4 border-t-2 border-slate-200 dark:border-slate-800 transition-all">
                    <!-- Controles de Nível de Acesso e Status -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div>
                            <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nível de Acesso</label>
                            <select class="user-papel-select w-full text-xs font-semibold bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 ${!isEditing ? 'opacity-70 pointer-events-none' : ''}" ${!isEditing ? 'disabled' : ''}>
                                ${papelOptionsHtml}
                            </select>
                        </div>
                        <div>
                            <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">Status da Solicitação</label>
                            <select class="user-status-select w-full text-xs font-semibold bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 ${!isEditing ? 'opacity-70 pointer-events-none' : ''}" ${!isEditing ? 'disabled' : ''}>
                                ${statusOptionsHtml}
                            </select>
                        </div>
                    </div>

                    <!-- Ponto Focal Interinstitucional -->
                    <div class="mb-4 p-3 rounded-xl border border-sky-200 dark:border-sky-800/80 bg-sky-50/70 dark:bg-sky-950/30 flex items-center justify-between gap-3 shadow-xs">
                        <div class="flex items-center gap-2.5 min-w-0 pr-2">
                            <div class="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 border border-sky-500/30">
                                <span class="material-symbols-outlined text-[18px]">share_location</span>
                            </div>
                            <div class="flex flex-col min-w-0">
                                <span class="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                    Ponto Focal Interinstitucional
                                    ${userObj.ponto_focal ? '<span class="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30">Habilitado</span>' : ''}
                                </span>
                                <span class="text-[10px] text-slate-500 dark:text-slate-400">Autoriza este servidor a ser visualizado e receber camadas/ortofotos sigilosas compartilhadas por outros órgãos parceiros</span>
                            </div>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer shrink-0" title="Ativar/desativar este servidor como ponto focal interinstitucional">
                            <input type="checkbox" class="user-ponto-focal-check sr-only peer" ${userObj.ponto_focal ? 'checked' : ''} ${!isEditing ? 'disabled' : ''}>
                            <div class="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-500"></div>
                        </label>
                    </div>

                    ${atribuicaoMunicipiosHtml}

                    <!-- Gestão Granular de Camadas e Abas do Município Ativo -->
                    <div class="mt-4">
                        <div class="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-1">
                            <span class="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                <span class="material-symbols-outlined text-[18px] text-sky-600 dark:text-sky-400">layers</span>
                                Permissões de Camadas e Abas — <span class="text-sky-600 dark:text-sky-400">${selectedMunObj.nome}${selectedMunObj.uf ? ' - ' + selectedMunObj.uf : ''}</span>
                            </span>
                            <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Clique na camada para expandir as abas</span>
                        </div>

                        <div class="space-y-3">
                            ${camadasHtml || `<div class="text-xs text-slate-400 italic py-4 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">Nenhuma camada da entidade ${userSigla} cadastrada em ${selectedMunObj.nome}.</div>`}
                        </div>
                    </div>

                    <!-- Gestão Granular de Ortofotos do Município Ativo -->
                    <div class="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800">
                        <div class="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-1">
                            <span class="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                <span class="material-symbols-outlined text-[18px] text-emerald-600 dark:text-emerald-400">satellite_alt</span>
                                Permissões de Ortofotos — <span class="text-emerald-600 dark:text-emerald-400">${selectedMunObj.nome}${selectedMunObj.uf ? ' - ' + selectedMunObj.uf : ''}</span>
                            </span>
                            <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Imagens aéreas e ortofotos liberadas</span>
                        </div>

                        <div class="space-y-2">
                            ${ortofotosHtml || `<div class="text-xs text-slate-400 italic py-3 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">Nenhuma ortofoto da entidade ${userSigla} cadastrada em ${selectedMunObj.nome}.</div>`}
                        </div>
                    </div>

                    ${isEditing ? `
                    <div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                        <button type="button" onclick="window.UsuariosManager.removerAcesso('${userId}')" class="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:underline flex items-center gap-1">
                            <span class="material-symbols-outlined text-[15px]">delete</span>
                            Revogar todos os acessos deste usuário
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    function selectUserMun(userId, munId) {
        _userSelectedMunMap[userId] = munId;
        const card = document.querySelector(`[data-user-card="${userId}"]`);
        const container = card ? card.parentElement : null;
        if (container) {
            const searchInput = document.getElementById('usuarios-search') || document.getElementById('users-search');
            renderUsersList(container.id, searchInput ? searchInput.value : '');
            // Mantém o card aberto
            const body = document.getElementById(`user-card-body-${userId}`);
            const chevron = document.getElementById(`user-chevron-${userId}`);
            if (body) body.classList.remove('hidden');
            if (chevron) chevron.classList.add('rotate-180');
        }
    }

    function toggleUserCard(userId) {
        const body = document.getElementById(`user-card-body-${userId}`);
        const chevron = document.getElementById(`user-chevron-${userId}`);
        if (!body) return;

        const isHidden = body.classList.contains('hidden');

        document.querySelectorAll('.user-card-body').forEach(el => {
            if (el.id !== `user-card-body-${userId}`) el.classList.add('hidden');
        });
        document.querySelectorAll('[id^="user-chevron-"]').forEach(ch => {
            if (ch.id !== `user-chevron-${userId}`) ch.classList.remove('rotate-180');
        });

        if (isHidden) {
            body.classList.remove('hidden');
            if (chevron) chevron.classList.add('rotate-180');
        } else {
            body.classList.add('hidden');
            if (chevron) chevron.classList.remove('rotate-180');
        }
    }

    function toggleCamadaAccordion(userId, temaId) {
        const subAbas = document.getElementById(`camada-sub-abas-${userId}-${temaId}`);
        const chevron = document.getElementById(`camada-chevron-${userId}-${temaId}`);
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

    function iniciarEdicao(userId) {
        _editingUserIds.clear();
        _editingUserIds.add(userId);
        const card = document.querySelector(`[data-user-card="${userId}"]`);
        const container = card ? card.parentElement : null;
        if (container) {
            const searchInput = document.getElementById('usuarios-search') || document.getElementById('users-search');
            renderUsersList(container.id, searchInput ? searchInput.value : '');
            const body = document.getElementById(`user-card-body-${userId}`);
            const chevron = document.getElementById(`user-chevron-${userId}`);
            if (body) body.classList.remove('hidden');
            if (chevron) chevron.classList.add('rotate-180');
        }
    }

    function cancelarEdicao(userId) {
        _editingUserIds.delete(userId);
        const card = document.querySelector(`[data-user-card="${userId}"]`);
        const container = card ? card.parentElement : null;
        if (container) {
            const searchInput = document.getElementById('usuarios-search') || document.getElementById('users-search');
            renderUsersList(container.id, searchInput ? searchInput.value : '');
        }
    }

    function toggleCamadaSubAbas(camadaCheckbox, userId, themeId) {
        const isChecked = camadaCheckbox.checked;
        const subContainer = document.getElementById(`camada-sub-abas-${userId}-${themeId}`);
        if (subContainer) {
            subContainer.style.opacity = isChecked ? '1' : '0.4';
            subContainer.style.pointerEvents = isChecked ? 'auto' : 'none';
            if (!isChecked) {
                subContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            }
        }
    }

    async function salvarUsuario(userId) {
        const card = document.querySelector(`[data-user-card="${userId}"]`);
        if (!card) return;

        const papel = card.querySelector('.user-papel-select').value;
        const status = card.querySelector('.user-status-select').value;

        const saveBtn = card.querySelector('button[onclick*="salvarUsuario"]');
        const originalText = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) {
            saveBtn.innerHTML = '<span class="material-symbols-outlined text-[15px] animate-spin">refresh</span> Salvando...';
            saveBtn.disabled = true;
        }

        try {
            // 1. Atualiza município_membros existentes para este usuário
            const { error: membroErr } = await supabaseClient
                .from('municipio_membros')
                .update({ papel, status })
                .eq('user_id', userId);

            if (membroErr) throw membroErr;

            // 2. Coleta permissões de camadas do município selecionado
            const camadaCards = card.querySelectorAll('[data-camada-id]');
            const camadaRows = [];
            const abaRows = [];

            camadaCards.forEach(cCard => {
                const themeId = cCard.getAttribute('data-camada-id');
                const podeVer = cCard.querySelector('.camada-ver-check').checked;
                const podeExcluir = cCard.querySelector('.camada-excluir-check').checked;

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

            // 4.1 Salva ponto_focal em profiles
            const isPontoFocal = !!card.querySelector('.user-ponto-focal-check')?.checked;
            try {
                await supabaseClient.from('profiles').update({ ponto_focal: isPontoFocal }).eq('id', userId);
            } catch(e) {
                console.warn('Erro ao atualizar ponto_focal:', e);
            }

            // 4.2 Salva permissoes_raster
            const rasterCards = card.querySelectorAll('[data-raster-id]');
            const rasterRows = [];
            rasterCards.forEach(rCard => {
                const rasterId = rCard.getAttribute('data-raster-id');
                const podeVer = rCard.querySelector('.raster-ver-check')?.checked;
                rasterRows.push({
                    user_id: userId,
                    raster_id: rasterId,
                    pode_ver: !!podeVer,
                    concedido_por: _currentUserProfile?.id || null
                });
            });
            if (rasterRows.length > 0) {
                try {
                    const { error: rErr } = await supabaseClient
                        .from('permissoes_raster')
                        .upsert(rasterRows, { onConflict: 'user_id,raster_id' });
                    if (rErr) console.warn('Erro ao atualizar permissoes_raster:', rErr);
                } catch(e) {
                    console.warn('Tabela permissoes_raster ainda indisponível:', e);
                }
            }

            // 5. Sincroniza Municípios Atribuídos
            const munChecks = card.querySelectorAll('.user-mun-check');
            const userMembrosList = _allMembros.filter(m => m.user_id === userId);
            const userPrimeiroMembro = userMembrosList[0] || {};
            const userEntidade = (userPrimeiroMembro.entidade || '').trim();
            const userTipo = _entidadesTipos[userEntidade] || (userEntidade.toLowerCase().includes('prefeitura') || userEntidade.toLowerCase().includes('municipal') ? 'municipal' : 'externo');

            if (userTipo === 'municipal') {
                // Segurança Estrita: Usuário municipal NUNCA deve ter vínculos em múltiplos municípios
                if (userMembrosList.length > 1) {
                    const munOrigemId = userPrimeiroMembro.municipio_id;
                    const strayMembros = userMembrosList.filter(mb => mb.municipio_id !== munOrigemId);
                    for (const stray of strayMembros) {
                        await supabaseClient.from('municipio_membros').delete().eq('id', stray.id);
                        _allMembros = _allMembros.filter(mb => mb.id !== stray.id);
                    }
                }
            } else if (munChecks.length > 0) {
                const selectedMunIds = Array.from(munChecks).filter(cb => cb.checked).map(cb => cb.value);
                const unselectedMunIds = Array.from(munChecks).filter(cb => !cb.checked).map(cb => cb.value);

                for (const munId of selectedMunIds) {
                    const existing = _allMembros.find(mb => mb.user_id === userId && mb.municipio_id === munId);
                    if (existing) {
                        if (existing.status !== status || existing.papel !== papel) {
                            await supabaseClient.from('municipio_membros').update({ status, papel }).eq('id', existing.id);
                            existing.status = status;
                            existing.papel = papel;
                        }
                    } else {
                        const { data: newMb, error: insErr } = await supabaseClient.from('municipio_membros').insert({
                            user_id: userId,
                            municipio_id: munId,
                            papel: papel,
                            status: status,
                            entidade: userPrimeiroMembro.entidade || null,
                            cargo: userPrimeiroMembro.cargo || null
                        }).select('id, user_id, municipio_id, papel, status, entidade, cargo, solicitado_em, profiles!user_id(id, nome, email, super_admin), municipios(id, nome, uf)').single();

                        if (!insErr && newMb) {
                            _allMembros.push(newMb);
                        }
                    }
                }

                for (const unMunId of unselectedMunIds) {
                    const existing = _allMembros.find(mb => mb.user_id === userId && mb.municipio_id === unMunId);
                    if (existing) {
                        await supabaseClient.from('municipio_membros').delete().eq('id', existing.id);
                        _allMembros = _allMembros.filter(mb => mb.id !== existing.id);
                    }
                }
            }

            userMembrosList.forEach(mb => {
                mb.papel = papel;
                mb.status = status;
            });

            camadaRows.forEach(cr => {
                _allCamadaPerms[`${cr.user_id}:${cr.theme_id}`] = cr;
            });
            abaRows.forEach(ar => {
                _allAbaPerms[`${ar.user_id}:${ar.form_id}:${ar.tab_id}`] = ar;
            });

            _editingUserIds.delete(userId);

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

    async function removerAcesso(userId) {
        if (!confirm('Deseja realmente revogar todos os acessos deste usuário em todos os municípios?')) return;

        try {
            const { error } = await supabaseClient.from('municipio_membros').delete().eq('user_id', userId);
            if (error) throw error;

            alert('Acessos revogados com sucesso!');
            _editingUserIds.delete(userId);
            _allMembros = _allMembros.filter(m => m.user_id !== userId);
            const card = document.querySelector(`[data-user-card="${userId}"]`);
            if (card) card.remove();
        } catch (err) {
            alert('Erro ao revogar acessos: ' + (err.message || err));
        }
    }

    function setMunicipio(munId) {
        _targetMunicipioId = munId;
        const container = document.getElementById('usuarios-list') || document.getElementById('users-container');
        if (container && _allMembros.length > 0) {
            const searchInput = document.getElementById('usuarios-search') || document.getElementById('users-search');
            renderUsersList(container.id, searchInput ? searchInput.value : '');
        }
    }

    window.UsuariosManager = {
        init: initUsuariosManager,
        setMunicipio,
        selectUserMun,
        toggleUserCard,
        toggleCamadaAccordion,
        iniciarEdicao,
        cancelarEdicao,
        salvarUsuario,
        removerAcesso,
        toggleCamadaSubAbas
    };

})(window);
