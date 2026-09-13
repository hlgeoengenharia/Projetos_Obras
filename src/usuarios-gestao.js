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
        const raw = String(name).trim();
        const lower = raw.toLowerCase();
        if (lower === '' || lower === 'geral' || lower === 'pública' || lower === 'publica' || lower === 'público' || lower === 'publico') return 'Município';
        if (lower.includes('mpf') || lower.includes('ministério público') || lower.includes('ministerio publico')) return 'MPF';
        if (lower.includes('polícia federal') || lower.includes('policia federal') || lower === 'pf') return 'PF';
        if (lower.includes('spu') || lower.includes('patrimônio da união') || lower.includes('patrimonio da uniao') || lower.includes('união') || lower.includes('uniao')) return 'SPU';
        if (lower.includes('prefeitura') || lower.includes('municipal') || lower.includes('município') || lower.includes('municipio') || lower === 'pmc' || lower === 'pmr') return 'Município';
        
        if (Array.isArray(_allEntidadesPadrao)) {
            const found = _allEntidadesPadrao.find(e => (e.nome && e.nome.toLowerCase() === lower) || (e.sigla && e.sigla.toLowerCase() === lower));
            if (found && found.sigla) {
                const s = found.sigla.trim();
                const sl = s.toLowerCase();
                if (sl === 'municipal' || sl.includes('municip') || sl.includes('prefeit')) return 'Município';
                return s;
            }
        }
        return raw;
    }

    function getThemeEntity(t) {
        if (!t) return 'Prefeitura Municipal';
        if (t.metadata && t.metadata.entidade) return t.metadata.entidade.trim();
        let localMeta = {};
        try {
            localMeta = JSON.parse(localStorage.getItem('constructive_themes_meta') || '{}');
        } catch(e) {}
        if (localMeta[t.id] && localMeta[t.id].entidade) return localMeta[t.id].entidade.trim();
        if (t.entidade) return t.entidade.trim();
        return 'Prefeitura Municipal';
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
    let _allEntidadesPadrao = [];
    let _selectedEntidadeFiltro = null;
    let _currentMainTab = 'minhas-camadas'; // 'minhas-camadas' | 'compartilhados-comigo' | 'usuarios-compartilhamento'
    let _selectedCompartilhadoFiltro = 'todos'; // 'todos' ou sigla do órgão concedente
    let _containerIdAtual = null;
    let _searchInputIdAtual = null;
    let _currentUserProfile = null;
    let _currentUserMembros = [];
    let _entidadesTipos = {}; // nome_entidade -> 'municipal' | 'externo' | 'outro'
    let _targetMunicipioId = null; // Se preenchido, prioriza o município ativo
    let _editingUserIds = new Set(); // IDs dos usuários em modo edição
    let _userSelectedMunMap = {}; // userId -> munId selecionado para visualizar/editar permissões
    let _selectedSetorFiltro = 'todos'; // 'todos' ou nome do setor filtrado na unidade

    async function initUsuariosManager({ containerId, searchInputId, municipioId = null, currentUserProfile }) {
        const container = document.getElementById(containerId);
        if (!container || typeof supabaseClient === 'undefined' || !supabaseClient) return;

        _containerIdAtual = containerId;
        _searchInputIdAtual = searchInputId;

        container.innerHTML = `
            <div class="p-8 flex flex-col items-center justify-center gap-3 text-slate-400">
                <div class="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                <span class="text-xs font-medium">Carregando usuários e permissões...</span>
            </div>
        `;

        _targetMunicipioId = municipioId || sessionStorage.getItem('municipio_ativo');
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
                    .select('id, user_id, municipio_id, papel, status, entidade, cargo, solicitado_em, profiles!user_id(id, nome, email, super_admin, ponto_focal, entidade, unidade, setor, unidade_admin, pode_criar_camadas, pode_subir_ortofotos), municipios(id, nome, uf)')
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

            if (membrosRes.error) {
                console.warn('Fallback na consulta de municipio_membros:', membrosRes.error);
                const fallbackRes = await supabaseClient
                    .from('municipio_membros')
                    .select('id, user_id, municipio_id, papel, status, entidade, cargo, solicitado_em, profiles!user_id(id, nome, email, super_admin, ponto_focal, entidade), municipios(id, nome, uf)')
                    .order('solicitado_em', { ascending: false });
                if (fallbackRes.error) throw fallbackRes.error;
                _allMembros = fallbackRes.data || [];
            } else {
                _allMembros = membrosRes.data || [];
            }
            _allTemas = temasRes.data || [];
            _currentUserMembros = minhasRes.data || [];
            _allMunicipios = munRes.data || [];
            _allEntidadesPadrao = entidadesRes.data || [];
            _allRasters = rastersRes.data || [];

            const isSuperAdmin = !!(_currentUserProfile && (_currentUserProfile.super_admin || _currentUserProfile.is_superadmin));
            const minhaEntidade = (_currentUserProfile?.entidade || (_currentUserMembros && _currentUserMembros[0]?.entidade) || 'Prefeitura Municipal').trim();
            const minhaSigla = getEntitySigla(minhaEntidade);

            // Isolamento por ente: carrega membros da própria entidade e pontos focais de órgãos parceiros
            if (!isSuperAdmin) {
                _allMembros = _allMembros.filter(m => {
                    const uEnt = (m.entidade || m.profiles?.entidade || '').trim();
                    const uSigla = getEntitySigla(uEnt);
                    const isMyEnt = uSigla === minhaSigla || (uEnt && minhaEntidade && uEnt.toLowerCase() === minhaEntidade.toLowerCase());
                    const isPontoFocal = !!(m.ponto_focal || m.profiles?.ponto_focal);
                    return isMyEnt || isPontoFocal;
                });
            }

            if (!isCurrentUserAdmin()) {
                _currentMainTab = 'compartilhados-comigo';
            } else if (!_currentMainTab) {
                _currentMainTab = 'minhas-camadas';
            }

            if (!_selectedEntidadeFiltro) {
                _selectedEntidadeFiltro = minhaSigla;
            }

            // Mapeia e sanitiza permissões de raster
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

            // Renderiza as abas principais e alternador de parceiros
            renderMainTabs();
            renderEntidadesToggle();

            if (searchInputId) {
                const searchInput = document.getElementById(searchInputId);
                if (searchInput) {
                    searchInput.oninput = () => onSearch(searchInput.value);
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

    // Identifica se o usuário logado é Administrador ou SuperAdmin
    function isCurrentUserAdmin() {
        if (!_currentUserProfile) return false;
        if (_currentUserProfile.super_admin || _currentUserProfile.is_superadmin || _currentUserProfile.papel === 'superadmin') return true;
        if (_currentUserProfile.papel === 'admin') return true;
        return _currentUserMembros.some(m => m.papel === 'admin' && m.status === 'aprovado');
    }

    // Identifica se o usuário logado pode gerenciar o usuário alvo
    function canManageUser(userObj) {
        if (!_currentUserProfile) return false;
        if (_currentUserProfile.super_admin) return true;

        if (!isCurrentUserAdmin()) return false;

        const minhaEntidade = (_currentUserProfile.entidade || (_currentUserMembros && _currentUserMembros[0]?.entidade) || 'Prefeitura Municipal').trim();
        const minhaSigla = getEntitySigla(minhaEntidade);
        const userEntidade = (userObj.entidade || userObj.profile?.entidade || '').trim();
        const userSigla = getEntitySigla(userEntidade);

        const mesmaEntidade = (minhaSigla === userSigla) || (minhaSigla === 'Município' && (!userSigla || userSigla === 'Município'));
        if (!mesmaEntidade) return false;

        // Hierarquia de Unidade:
        // Cada Admin administra uma Unidade específica (que pode ter 1 ou vários setores).
        // Se o Admin logado possui uma Unidade atribuída, ele só visualiza e gerencia os membros da sua Unidade.
        const minhaUnidade = (_currentUserProfile.unidade_admin || _currentUserProfile.unidade || '').trim().toLowerCase();
        if (minhaUnidade) {
            if (userObj.user_id === _currentUserProfile.id) return true;
            const userUnidade = (userObj.profile?.unidade || userObj.unidade || '').trim().toLowerCase();
            return userUnidade === minhaUnidade;
        }

        return true;
    }

    function getAdminCeiling(themeId, formId, tabId) {
        if (!_currentUserProfile) {
            return { podeVer: false, podeEditar: false, podeExcluir: false };
        }
        // 1. SuperAdmin Geral tem controle sobre todas as camadas e abas de todos os órgãos
        if (_currentUserProfile.super_admin) {
            return { podeVer: true, podeEditar: true, podeExcluir: true };
        }

        const minhaEntidade = (_currentUserProfile.entidade || (_currentUserMembros && _currentUserMembros[0]?.entidade) || 'Prefeitura Municipal').trim();
        const minhaSigla = getEntitySigla(minhaEntidade);

        // Identifica a entidade proprietária desta camada
        const tema = _allTemas.find(t => t.id === themeId);
        const tEntRaw = tema ? getThemeEntity(tema) : '';
        const tSigla = getEntitySigla(tEntRaw);

        // 2. Administrador de um Ente tem soberania TOTAL sobre as camadas da sua própria entidade!
        if (tSigla === minhaSigla) {
            return { podeVer: true, podeEditar: true, podeExcluir: true };
        }

        // 3. Administrador de um ente NÃO pode conceder camadas de OUTROS entes parceiros
        return { podeVer: false, podeEditar: false, podeExcluir: false };
    }

    // Obtém a lista dos parceiros institucionais externos (filtrando rigorosamente 'Outros' e a própria entidade)
    function getParceirosList() {
        const minhaEntidade = (_currentUserProfile?.entidade || (_currentUserMembros && _currentUserMembros[0]?.entidade) || 'Prefeitura Municipal').trim();
        const minhaSigla = getEntitySigla(minhaEntidade);
        const parceirosMap = new Map();

        const munAtivoObj = _allMunicipios.find(m => m.id === _targetMunicipioId);
        const munNomeLabel = munAtivoObj ? (munAtivoObj.nome || 'Município') : (sessionStorage.getItem('municipio_ativo_nome') || 'Município');

        if (minhaSigla !== 'Município') {
            parceirosMap.set('Município', {
                sigla: 'Município',
                label: munNomeLabel,
                nome: munAtivoObj ? `Prefeitura Municipal de ${munAtivoObj.nome}` : 'Prefeitura Municipal',
                icone: 'location_city'
            });
        }

        // 1. Entidades cadastradas em entidades_padrao (excluindo 'Outros' e a própria entidade)
        _allEntidadesPadrao.forEach(e => {
            const s = getEntitySigla(e.sigla || e.nome);
            if (!s || s.toLowerCase() === 'outros' || s.toLowerCase() === 'outro') return;
            if (s !== minhaSigla) {
                if (s === 'Município') {
                    if (minhaSigla !== 'Município' && !parceirosMap.has('Município')) {
                        parceirosMap.set('Município', { sigla: 'Município', label: munNomeLabel, nome: 'Prefeitura Municipal', icone: 'location_city' });
                    }
                } else if (!parceirosMap.has(s)) {
                    parceirosMap.set(s, { sigla: s, label: s, nome: e.nome, icone: s === 'MPF' ? 'gavel' : (s === 'PF' ? 'security' : (s === 'SPU' ? 'account_balance' : 'handshake')) });
                }
            }
        });

        // 2. Entidades presentes em membros (excluindo 'Outros' e a própria entidade)
        _allMembros.forEach(m => {
            const prof = m.profiles || {};
            const ent = (prof.entidade || m.entidade || '').trim();
            if (ent) {
                const s = getEntitySigla(ent);
                if (!s || s.toLowerCase() === 'outros' || s.toLowerCase() === 'outro') return;
                if (s !== minhaSigla) {
                    if (s === 'Município') {
                        if (minhaSigla !== 'Município' && !parceirosMap.has('Município')) {
                            parceirosMap.set('Município', { sigla: 'Município', label: munNomeLabel, nome: 'Prefeitura Municipal', icone: 'location_city' });
                        }
                    } else if (!parceirosMap.has(s)) {
                        parceirosMap.set(s, { sigla: s, label: s, nome: ent, icone: s === 'MPF' ? 'gavel' : (s === 'PF' ? 'security' : (s === 'SPU' ? 'account_balance' : 'handshake')) });
                    }
                }
            }
        });

        if (parceirosMap.size === 0) {
            if (minhaSigla !== 'Município') {
                parceirosMap.set('Município', { sigla: 'Município', label: munNomeLabel, nome: 'Prefeitura Municipal', icone: 'location_city' });
            } else {
                parceirosMap.set('MPF', { sigla: 'MPF', label: 'MPF', nome: 'Ministério Público Federal', icone: 'gavel' });
            }
        }

        return Array.from(parceirosMap.values());
    }

    // Renderiza o alternador de parceiros (Pílulas estilo Mapa/Lista)
    function renderEntidadesToggle() {
        const container = document.getElementById('usuarios-entidades-toggle');
        const containerBox = document.getElementById('usuarios-entidades-toggle-container');
        if (!container) return;

        if (_currentMainTab !== 'usuarios-compartilhamento') {
            if (containerBox) containerBox.classList.add('hidden');
            return;
        }

        if (containerBox) containerBox.classList.remove('hidden');

        const parceiros = getParceirosList();
        if (parceiros.length === 0) {
            container.innerHTML = '<span class="text-xs text-slate-400 italic">Nenhum parceiro cadastrado.</span>';
            return;
        }

        const minhaEntidade = (_currentUserProfile?.entidade || (_currentUserMembros && _currentUserMembros[0]?.entidade) || 'Prefeitura Municipal').trim();
        const minhaSigla = getEntitySigla(minhaEntidade);

        if (!_selectedEntidadeFiltro || _selectedEntidadeFiltro === minhaSigla || !parceiros.some(p => p.sigla === _selectedEntidadeFiltro)) {
            _selectedEntidadeFiltro = parceiros[0].sigla;
        }

        container.innerHTML = parceiros.map(item => {
            const isActive = (_selectedEntidadeFiltro === item.sigla);
            
            const activeClass = "bg-primary text-white shadow-md shadow-primary/25 ring-2 ring-primary/40 font-extrabold";
            const inactiveClass = "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold";

            const uniquePfIds = new Set();
            _allMembros.forEach(m => {
                const prof = m.profiles || {};
                const s = getEntitySigla((prof.entidade || m.entidade || '').trim());
                if (s === item.sigla && (prof.ponto_focal || m.ponto_focal)) {
                    if (item.sigla === 'Município' && _targetMunicipioId) {
                        if (m.municipio_id === _targetMunicipioId) uniquePfIds.add(m.user_id);
                    } else {
                        uniquePfIds.add(m.user_id);
                    }
                }
            });
            const pfCount = uniquePfIds.size;
            const badgeCount = `<span class="ml-1 px-1.5 py-0.2 text-[9px] font-extrabold rounded-full ${isActive ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}">${pfCount}</span>`;
            const labelText = item.label || item.sigla;

            return `
                <button type="button" 
                    onclick="window.UsuariosManager.selectEntidadeFiltro('${item.sigla}')" 
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs ${isActive ? activeClass : inactiveClass}" 
                    title="Pontos Focais de ${item.nome}">
                    <span class="material-symbols-outlined text-[16px]">${item.icone}</span>
                    <span>${labelText}</span>
                    ${badgeCount}
                </button>
            `;
        }).join('');
    }

    function selectEntidadeFiltro(sigla) {
        _selectedEntidadeFiltro = sigla;
        renderEntidadesToggle();
        const container = document.getElementById(_containerIdAtual || 'users-list') || document.getElementById('usuarios-list');
        if (container) {
            const searchInput = document.getElementById(_searchInputIdAtual || 'users-search') || document.getElementById('usuarios-search');
            renderUsersList(container.id, searchInput ? searchInput.value : '');
        }
    }

    // Renderiza as 3 Abas Principais (para Administradores) ou gerencia a visão direta (para Usuários comuns)
    function renderMainTabs() {
        const tabsContainer = document.getElementById('usuarios-main-tabs');
        const adminInfoBox = document.getElementById('usuarios-admin-info-box');
        const partnerToggleCont = document.getElementById('usuarios-entidades-toggle-container');
        const headerTitle = document.getElementById('usuarios-header-title');
        const headerSubtitle = document.getElementById('usuarios-header-subtitle');

        const isAdmin = isCurrentUserAdmin();
        const minhaEntidade = (_currentUserProfile?.entidade || (_currentUserMembros && _currentUserMembros[0]?.entidade) || 'Prefeitura Municipal').trim();
        const minhaSigla = getEntitySigla(minhaEntidade);

        if (!isAdmin) {
            if (tabsContainer) {
                tabsContainer.innerHTML = '';
                tabsContainer.classList.add('hidden');
            }
            if (adminInfoBox) adminInfoBox.classList.add('hidden');
            if (partnerToggleCont) partnerToggleCont.classList.add('hidden');
            if (headerTitle) headerTitle.textContent = 'Camadas Compartilhadas Comigo';
            if (headerSubtitle) headerSubtitle.textContent = 'Consulte as camadas e ortofotos disponibilizadas nominalmente para o seu acesso.';
            _currentMainTab = 'compartilhados-comigo';
            return;
        }

        if (tabsContainer) {
            tabsContainer.classList.remove('hidden');
        }

        if (adminInfoBox) {
            if (_currentMainTab === 'minhas-camadas') {
                adminInfoBox.classList.remove('hidden');
            } else {
                adminInfoBox.classList.add('hidden');
            }
        }

        if (partnerToggleCont) {
            if (_currentMainTab === 'usuarios-compartilhamento') {
                partnerToggleCont.classList.remove('hidden');
            } else {
                partnerToggleCont.classList.add('hidden');
            }
        }

        if (headerTitle) headerTitle.textContent = 'Central de Usuários e Compartilhamento';
        if (headerSubtitle) headerSubtitle.textContent = 'Gerencie as permissões da sua equipe, libere camadas para órgãos parceiros e veja o que compartilharam com você.';

        if (!tabsContainer) return;

        // Cálculos dos badges
        const uniqueInternalUsers = new Set();
        _allMembros.forEach(m => {
            const s = getEntitySigla(m.entidade || m.profiles?.entidade);
            if (s === minhaSigla && m.status !== 'rejeitado') {
                uniqueInternalUsers.add(m.user_id);
            }
        });
        const minhaEquipeCount = uniqueInternalUsers.size;

        const sharedItems = getSharedItemsForCurrentUser();
        const sharedCount = sharedItems.length;

        const uniquePartnerPf = new Set();
        _allMembros.forEach(m => {
            const s = getEntitySigla(m.entidade || m.profiles?.entidade);
            if (s !== minhaSigla && (m.profiles?.ponto_focal || m.ponto_focal)) {
                uniquePartnerPf.add(m.user_id);
            }
        });
        const partnerPfCount = uniquePartnerPf.size;

        const tabsConfig = [
            {
                key: 'minhas-camadas',
                label: 'MINHAS CAMADAS CRIADAS',
                icon: 'folder_shared',
                badge: `${minhaEquipeCount} servidor${minhaEquipeCount === 1 ? '' : 'es'}`
            },
            {
                key: 'compartilhados-comigo',
                label: 'COMPARTILHADOS COMIGO',
                icon: 'inbox',
                badge: sharedCount > 0 ? `${sharedCount} camada${sharedCount === 1 ? '' : 's'}` : '0'
            },
            {
                key: 'usuarios-compartilhamento',
                label: 'USUÁRIOS EM COMPARTILHAMENTO',
                icon: 'handshake',
                badge: `${partnerPfCount} parceiro${partnerPfCount === 1 ? '' : 's'}`
            }
        ];

        tabsContainer.innerHTML = tabsConfig.map(t => {
            const isActive = (_currentMainTab === t.key);
            const activeClasses = 'border-b-2 border-primary text-primary font-extrabold bg-primary/5 dark:bg-primary/10 shadow-xs';
            const inactiveClasses = 'border-b-2 border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-bold hover:bg-slate-100/70 dark:hover:bg-slate-800/50';

            return `
                <button type="button" 
                    id="tab-btn-${t.key}"
                    onclick="window.UsuariosManager.switchMainTab('${t.key}')" 
                    class="flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer ${isActive ? activeClasses : inactiveClasses}">
                    <span class="material-symbols-outlined text-[18px]">${t.icon}</span>
                    <span>${t.label}</span>
                    <span class="ml-1 px-2 py-0.5 text-[10px] font-extrabold rounded-full ${isActive ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}">${t.badge}</span>
                </button>
            `;
        }).join('');
    }

    function switchMainTab(tabKey) {
        _currentMainTab = tabKey;
        const minhaEntidade = (_currentUserProfile?.entidade || (_currentUserMembros && _currentUserMembros[0]?.entidade) || 'Prefeitura Municipal').trim();
        const minhaSigla = getEntitySigla(minhaEntidade);

        if (tabKey === 'minhas-camadas') {
            _selectedEntidadeFiltro = minhaSigla;
        } else if (tabKey === 'usuarios-compartilhamento') {
            const parceiros = getParceirosList();
            if (parceiros.length > 0 && (_selectedEntidadeFiltro === minhaSigla || !parceiros.some(p => p.sigla === _selectedEntidadeFiltro))) {
                _selectedEntidadeFiltro = parceiros[0].sigla;
            }
        } else if (tabKey === 'compartilhados-comigo') {
            _selectedCompartilhadoFiltro = 'todos';
        }

        renderMainTabs();
        renderEntidadesToggle();

        const searchInput = document.getElementById(_searchInputIdAtual || 'users-search') || document.getElementById('usuarios-search');
        if (searchInput) searchInput.value = '';

        const containerId = _containerIdAtual || 'users-list';
        renderUsersList(containerId, '');
    }

    // Retorna as camadas e rasters liberados para o usuário logado
    function getSharedItemsForCurrentUser() {
        const currentUserId = _currentUserProfile ? _currentUserProfile.id : null;
        if (!currentUserId) return [];

        const isSuperAdmin = !!(_currentUserProfile && (_currentUserProfile.super_admin || _currentUserProfile.is_superadmin || _currentUserProfile.papel === 'superadmin'));
        const isAdmin = isCurrentUserAdmin();
        const minhaEntidade = (_currentUserProfile?.entidade || (_currentUserMembros && _currentUserMembros[0]?.entidade) || 'Prefeitura Municipal').trim();
        const minhaSigla = getEntitySigla(minhaEntidade);

        const items = [];

        // 1. Camadas vetoriais (_allTemas)
        _allTemas.forEach(tema => {
            const tEntRaw = getThemeEntity(tema);
            const tSigla = getEntitySigla(tEntRaw);
            const isFromOther = (tSigla !== minhaSigla);

            const perm = _allCamadaPerms[`${currentUserId}:${tema.id}`];
            const hasExplicitPerm = perm && perm.pode_ver === true;

            let isShared = false;
            if (isSuperAdmin) {
                isShared = true;
            } else if (isAdmin) {
                // Para o Admin ver em "Compartilhados Comigo", tem que ser de OUTRO órgão e ter sido liberada para ele
                isShared = isFromOther && hasExplicitPerm;
            } else {
                // Para o Usuário comum, camadas externas liberadas para ele OU camadas da própria entidade liberadas pelo seu Admin
                isShared = hasExplicitPerm;
            }

            if (isShared) {
                items.push({
                    id: tema.id,
                    tipo: 'tema',
                    nome: tema.nome,
                    descricao: tema.descricao || '',
                    cor: tema.cor || '#0ea5e9',
                    icone: 'layers',
                    entidadeRaw: tEntRaw,
                    sigla: tSigla,
                    isFromOther: isFromOther,
                    pode_editar: !!(perm && perm.pode_editar),
                    pode_excluir: !!(perm && perm.pode_excluir),
                    municipio_id: tema.municipio_id,
                    tipo_geometria: tema.tipo_geometria || 'vetor'
                });
            }
        });

        // 2. Ortofotos / Imagens Raster (_allRasters)
        _allRasters.forEach(raster => {
            const rEntRaw = (raster.entidade || 'Prefeitura Municipal').trim();
            const rSigla = getEntitySigla(rEntRaw);
            const isFromOther = (rSigla !== minhaSigla);

            const perm = _allRasterPerms[`${currentUserId}:${raster.id}`];
            const hasExplicitPerm = perm && perm.pode_ver === true;

            let isShared = false;
            if (isSuperAdmin) {
                isShared = true;
            } else if (isAdmin) {
                isShared = isFromOther && hasExplicitPerm;
            } else {
                isShared = hasExplicitPerm;
            }

            if (isShared) {
                let dateStr = '';
                if (raster.data_imagem) {
                    dateStr = raster.data_imagem.split('-').reverse().join('/');
                } else if (raster.nome) {
                    const m = raster.nome.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
                    if (m) dateStr = `${m[1]}/${m[2]}/${m[3]}`;
                }

                items.push({
                    id: raster.id,
                    tipo: 'raster',
                    nome: raster.nome,
                    descricao: raster.tipo === 'xyz_tiles' ? 'Ortofoto em alta resolução (XYZ Tiles)' : 'Imagem GeoTIFF georreferenciada',
                    cor: '#10b981',
                    icone: 'satellite',
                    entidadeRaw: rEntRaw,
                    sigla: rSigla,
                    isFromOther: isFromOther,
                    pode_editar: false,
                    pode_excluir: false,
                    municipio_id: raster.municipio_id,
                    data_imagem: dateStr
                });
            }
        });

        return items;
    }

    function selectCompartilhadoFiltro(sigla) {
        _selectedCompartilhadoFiltro = sigla;
        const container = document.getElementById(_containerIdAtual || 'users-list') || document.getElementById('usuarios-list');
        if (container) {
            const searchInput = document.getElementById(_searchInputIdAtual || 'users-search') || document.getElementById('usuarios-search');
            renderCompartilhadosComigo(container.id, searchInput ? searchInput.value : '');
        }
    }

    // Renderiza a visualização "Compartilhados Comigo"
    function renderCompartilhadosComigo(containerId, searchQuery = '') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const query = searchQuery.trim().toLowerCase();
        let items = getSharedItemsForCurrentUser();

        // Geração dos filtros por órgão concedente
        const entidadesDisponiveis = new Set();
        items.forEach(it => {
            entidadesDisponiveis.add(it.sigla);
        });

        const totalItemsCount = items.length;

        // Filtragem por órgão selecionado
        if (_selectedCompartilhadoFiltro && _selectedCompartilhadoFiltro !== 'todos') {
            items = items.filter(it => it.sigla === _selectedCompartilhadoFiltro);
        }

        // Filtragem por busca
        if (query) {
            items = items.filter(it => {
                const nome = (it.nome || '').toLowerCase();
                const desc = (it.descricao || '').toLowerCase();
                const ent = (it.entidadeRaw || '').toLowerCase();
                const sigla = (it.sigla || '').toLowerCase();
                return nome.includes(query) || desc.includes(query) || ent.includes(query) || sigla.includes(query);
            });
        }

        // Ordenação alfabética
        items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

        // Barra de Sub-Filtros por Órgão
        let filterPillsHtml = '';
        if (entidadesDisponiveis.size > 0) {
            filterPillsHtml = `
                <div class="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
                    <button type="button" 
                        onclick="window.UsuariosManager.selectCompartilhadoFiltro('todos')"
                        class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${(_selectedCompartilhadoFiltro === 'todos') ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
                        Todas as Camadas (${totalItemsCount})
                    </button>
                    ${Array.from(entidadesDisponiveis).map(sigla => {
                        const countForSigla = getSharedItemsForCurrentUser().filter(it => it.sigla === sigla).length;
                        const isCurActive = (_selectedCompartilhadoFiltro === sigla);
                        return `
                            <button type="button" 
                                onclick="window.UsuariosManager.selectCompartilhadoFiltro('${sigla}')"
                                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${isCurActive ? 'bg-primary text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
                                <span>${sigla}</span>
                                <span class="px-1.5 py-0.2 text-[9px] font-extrabold rounded-full ${isCurActive ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}">${countForSigla}</span>
                            </button>
                        `;
                    }).join('')}
                </div>
            `;
        }

        if (items.length === 0) {
            container.innerHTML = `
                ${filterPillsHtml}
                <div class="p-10 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 shadow-xs">
                    <div class="w-14 h-14 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center mx-auto mb-3 border border-sky-500/20">
                        <span class="material-symbols-outlined text-[30px]">${query ? 'search_off' : 'share'}</span>
                    </div>
                    <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">${query ? 'Nenhuma camada encontrada para esta busca' : 'Nenhuma camada compartilhada com você até o momento'}</h3>
                    <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                        ${query ? 'Tente buscar com outro termo ou limpe o filtro.' : 'Assim que os órgãos parceiros (ou o Administrador da sua entidade) liberarem o acesso nominal a camadas institucionais, elas aparecerão listadas aqui para você visualizar.'}
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            ${filterPillsHtml}
            <div class="flex flex-col gap-3">
                ${items.map(item => {
                    const munObj = _allMunicipios.find(m => m.id === item.municipio_id);
                    const munNome = munObj ? munObj.nome : '';

                    return `
                        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border-2 border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4" style="border-left-width: 6px; border-left-color: ${item.cor}">
                            <div class="flex items-start gap-3.5 min-w-0 flex-1">
                                <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-xs" style="background-color: ${item.cor}15; color: ${item.cor}; border-color: ${item.cor}30">
                                    <span class="material-symbols-outlined text-[22px]">${item.icone}</span>
                                </div>
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-2 flex-wrap mb-1">
                                        <h4 class="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">${item.nome}</h4>
                                        <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                                            <span class="material-symbols-outlined text-[12px]">${item.tipo === 'raster' ? 'satellite' : 'hub'}</span>
                                            ${item.sigla}
                                        </span>
                                        <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full ${item.pode_editar ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30'}">
                                            <span class="material-symbols-outlined text-[12px]">${item.pode_editar ? 'edit_note' : 'visibility'}</span>
                                            ${item.pode_editar ? 'Visualização e Edição' : 'Somente Leitura'}
                                        </span>
                                    </div>
                                    <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">${item.descricao || (item.tipo === 'raster' ? 'Ortofoto institucional' : 'Camada vetorial institucional')}</p>
                                    <div class="text-[11px] text-slate-400 mt-1.5 flex items-center gap-2 flex-wrap font-medium">
                                        <span><b>Proprietário:</b> ${item.entidadeRaw}</span>
                                        ${munNome ? `<span>•</span><span><b>Município:</b> ${munNome}</span>` : ''}
                                        ${item.data_imagem ? `<span>•</span><span><b>Data da Imagem:</b> ${item.data_imagem}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function abrirNoMapa(id, tipo, municipioId) {
        const mun = municipioId || _targetMunicipioId || sessionStorage.getItem('municipio_ativo') || '';
        let url = 'index.html';
        const params = [];
        if (mun) params.push(`municipio=${encodeURIComponent(mun)}`);
        if (tipo === 'raster') {
            params.push(`raster=${encodeURIComponent(id)}`);
        } else {
            params.push(`theme=${encodeURIComponent(id)}`);
        }
        if (params.length > 0) url += '?' + params.join('&');
        window.location.href = url;
    }

    function onSearch(query) {
        const container = document.getElementById(_containerIdAtual || 'users-list') || document.getElementById('usuarios-list');
        if (container) {
            renderUsersList(container.id, query);
        }
    }

    function renderUsersList(containerId, searchQuery = '') {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Se a aba ativa for Compartilhados Comigo, renderiza o catálogo de compartilhados
        if (_currentMainTab === 'compartilhados-comigo') {
            renderCompartilhadosComigo(containerId, searchQuery);
            return;
        }

        const isSuperAdmin = !!(_currentUserProfile && (_currentUserProfile.super_admin || _currentUserProfile.is_superadmin || _currentUserProfile.papel === 'superadmin'));
        const query = searchQuery.trim().toLowerCase();

        const minhaEntidade = (_currentUserProfile?.entidade || (_currentUserMembros && _currentUserMembros[0]?.entidade) || 'Prefeitura Municipal').trim();
        const minhaSigla = getEntitySigla(minhaEntidade);
        const isModoParceiros = (_currentMainTab === 'usuarios-compartilhamento');

        // 1. Agrupa os membros por pessoa única (user_id)
        const userMap = new Map();
        _allMembros.forEach(m => {
            const uid = m.user_id;
            const prof = m.profiles || {};
            const userEntidade = (prof.entidade || m.entidade || 'Prefeitura Municipal').trim();
            const userCargo = (prof.cargo || m.cargo || '').trim();

            if (!userMap.has(uid)) {
                userMap.set(uid, {
                    user_id: uid,
                    profile: prof,
                    ponto_focal: !!prof.ponto_focal,
                    entidade: userEntidade,
                    cargo: userCargo,
                    unidade: (prof.unidade || '').trim(),
                    setor: (prof.setor || '').trim(),
                    pode_criar_camadas: !!prof.pode_criar_camadas,
                    pode_subir_ortofotos: !!prof.pode_subir_ortofotos,
                    papel: m.papel,
                    status: m.status,
                    membros: []
                });
            }
            const userObj = userMap.get(uid);
            userObj.membros.push(m);
            if (prof.ponto_focal) userObj.ponto_focal = true;
            if (prof.entidade) userObj.entidade = prof.entidade.trim();
            if (prof.cargo) userObj.cargo = prof.cargo.trim();
            if (prof.unidade) userObj.unidade = prof.unidade.trim();
            if (prof.setor) userObj.setor = prof.setor.trim();
            if (prof.pode_criar_camadas) userObj.pode_criar_camadas = true;
            if (prof.pode_subir_ortofotos) userObj.pode_subir_ortofotos = true;
            if (Object.keys(prof).length > 0) userObj.profile = prof;
            if (m.status === 'aprovado') userObj.status = 'aprovado';
            if (m.papel === 'admin') userObj.papel = 'admin';
        });

        let uniqueUsers = Array.from(userMap.values());

        if (isModoParceiros) {
            // MODO USUÁRIOS EM COMPARTILHAMENTO:
            // Exibe APENAS os Pontos Focais do parceiro selecionado em _selectedEntidadeFiltro
            const searchInput = document.getElementById(_searchInputIdAtual || 'users-search') || document.getElementById('usuarios-search');
            if (searchInput) searchInput.placeholder = `Buscar pontos focais de ${_selectedEntidadeFiltro || 'parceiros'} por nome ou e-mail...`;

            uniqueUsers = uniqueUsers.filter(u => {
                const uSigla = getEntitySigla(u.entidade);
                if (uSigla !== _selectedEntidadeFiltro) return false;
                if (!u.ponto_focal && !u.profile?.ponto_focal) return false;

                if (query) {
                    const nome = (u.profile?.nome || '').toLowerCase();
                    const email = (u.profile?.email || '').toLowerCase();
                    const entidade = (u.entidade || '').toLowerCase();
                    const cargo = (u.cargo || '').toLowerCase();
                    return nome.includes(query) || email.includes(query) || entidade.includes(query) || cargo.includes(query);
                }
                return true;
            });

            if (uniqueUsers.length === 0) {
                container.innerHTML = `
                    <div class="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 shadow-xs">
                        <div class="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center mx-auto mb-3 border border-cyan-500/20">
                            <span class="material-symbols-outlined text-[26px]">lock_person</span>
                        </div>
                        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">Nenhum Ponto Focal de ${_selectedEntidadeFiltro}</h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                            ${query ? 'Nenhum resultado corresponde à sua pesquisa.' : 'Para compartilhar camadas e ortofotos criadas pela sua entidade com servidores deste órgão parceiro, o servidor deve estar cadastrado e marcado como <b>Ponto Focal</b>.'}
                        </p>
                    </div>
                `;
                return;
            }

            uniqueUsers.sort((a, b) => (a.profile?.nome || '').localeCompare((b.profile?.nome || ''), 'pt-BR', { sensitivity: 'base' }));
            container.innerHTML = uniqueUsers.map(u => renderUserCard(u)).join('');
            return;
        }

        // MODO MINHAS CAMADAS CRIADAS (Minha Equipe):
        _selectedEntidadeFiltro = minhaSigla;
        const searchInput = document.getElementById(_searchInputIdAtual || 'users-search') || document.getElementById('usuarios-search');
        if (searchInput) searchInput.placeholder = 'Buscar servidores da minha equipe por nome, e-mail ou cargo...';

        uniqueUsers = uniqueUsers.filter(u => {
            const uSigla = getEntitySigla(u.entidade);

            if (!isSuperAdmin) {
                if (uSigla !== minhaSigla) return false;
                const temVinculoValido = u.membros.some(mb => mb.status !== 'rejeitado' && (!_targetMunicipioId || mb.municipio_id === _targetMunicipioId));
                if (!temVinculoValido) return false;
                if (!canManageUser(u)) return false;
            }

            if (_targetMunicipioId && !isSuperAdmin) {
                const temNoMunAtivo = u.membros.some(mb => mb.municipio_id === _targetMunicipioId && mb.status !== 'rejeitado');
                if (!temNoMunAtivo) return false;
            }

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

        // Banner informativo da equipe e das camadas criadas pela entidade
        const numCamadas = _allTemas.filter(t => getEntitySigla(getThemeEntity(t)) === minhaSigla).length;
        const numRasters = _allRasters.filter(r => getEntitySigla(r.entidade) === minhaSigla).length;
        const numServidores = uniqueUsers.length;
        const minhaUnidadeExibida = (_currentUserProfile?.unidade_admin || _currentUserProfile?.unidade || '').trim();

        const bannerHtml = `
            <div class="mb-4 p-4 rounded-2xl bg-gradient-to-r from-sky-500/10 via-indigo-500/5 to-transparent border border-sky-200 dark:border-sky-900 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-md shadow-sky-600/30 shrink-0">
                        <span class="material-symbols-outlined text-[22px]">domain</span>
                    </div>
                    <div>
                        <h3 class="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                            ${minhaEntidade}
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800">${minhaSigla}</span>
                            ${minhaUnidadeExibida ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">apartment</span>Unidade: ${minhaUnidadeExibida}</span>` : ''}
                        </h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400">Servidores vinculados ao seu órgão e camadas geradas internamente.</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                    <div class="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 shadow-xs flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[16px] text-sky-600">layers</span>
                        <span><b>${numCamadas}</b> camadas</span>
                    </div>
                    ${numRasters > 0 ? `
                    <div class="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 shadow-xs flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[16px] text-emerald-600">satellite</span>
                        <span><b>${numRasters}</b> ortofotos</span>
                    </div>` : ''}
                    <div class="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 shadow-xs flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[16px] text-indigo-600">group</span>
                        <span><b>${numServidores}</b> na equipe</span>
                    </div>
                </div>
            </div>
        `;

        // Coleta setores disponíveis para filtro rápido da equipe
        const availableSetores = new Set();
        uniqueUsers.forEach(u => {
            const s = (u.profile?.setor || u.setor || '').trim();
            if (s) availableSetores.add(s);
        });

        let setorFilterHtml = '';
        if (availableSetores.size > 0) {
            const setoresArr = Array.from(availableSetores).sort((a, b) => a.localeCompare(b, 'pt-BR'));
            const totalCount = uniqueUsers.length;
            const semSetorCount = uniqueUsers.filter(u => !(u.profile?.setor || u.setor || '').trim()).length;

            setorFilterHtml = `
                <div class="mb-3.5 flex items-center gap-1.5 flex-wrap select-none bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                    <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
                        <span class="material-symbols-outlined text-[15px]">workspaces</span> Setor:
                    </span>
                    <button type="button" onclick="window.UsuariosManager.setSetorFiltro('todos')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${_selectedSetorFiltro === 'todos' ? 'bg-sky-600 text-white shadow-xs' : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}">
                        Todos (${totalCount})
                    </button>
                    ${setoresArr.map(st => {
                        const count = uniqueUsers.filter(u => (u.profile?.setor || u.setor || '').trim().toLowerCase() === st.toLowerCase()).length;
                        const isSelected = _selectedSetorFiltro.toLowerCase() === st.toLowerCase();
                        return `
                            <button type="button" onclick="window.UsuariosManager.setSetorFiltro('${st.replace(/'/g, "\\'")}')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${isSelected ? 'bg-purple-600 text-white shadow-xs' : 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 hover:bg-purple-500/20'}">
                                ${st} (${count})
                            </button>
                        `;
                    }).join('')}
                    ${semSetorCount > 0 ? `
                        <button type="button" onclick="window.UsuariosManager.setSetorFiltro('__sem_setor__')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${_selectedSetorFiltro === '__sem_setor__' ? 'bg-slate-600 text-white shadow-xs' : 'bg-slate-200/50 dark:bg-slate-800/80 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}">
                            Sem Setor (${semSetorCount})
                        </button>
                    ` : ''}
                </div>
            `;

            // Aplica filtro por setor selecionado
            if (_selectedSetorFiltro === '__sem_setor__') {
                uniqueUsers = uniqueUsers.filter(u => !(u.profile?.setor || u.setor || '').trim());
            } else if (_selectedSetorFiltro !== 'todos') {
                uniqueUsers = uniqueUsers.filter(u => (u.profile?.setor || u.setor || '').trim().toLowerCase() === _selectedSetorFiltro.toLowerCase());
            }
        }

        if (uniqueUsers.length === 0) {
            container.innerHTML = `
                ${bannerHtml}
                ${setorFilterHtml}
                <div class="p-8 text-center text-slate-400 text-sm italic bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-xs">
                    ${query ? 'Nenhum membro da sua equipe corresponde a esta pesquisa.' : 'Nenhum usuário cadastrado neste filtro.'}
                </div>
            `;
            return;
        }

        uniqueUsers.sort((a, b) => (a.profile?.nome || '').localeCompare((b.profile?.nome || ''), 'pt-BR', { sensitivity: 'base' }));
        container.innerHTML = bannerHtml + setorFilterHtml + uniqueUsers.map(u => renderUserCard(u)).join('');
    }

    function renderUserCard(userObj) {
        const userId = userObj.user_id;
        const perfil = userObj.profile || {};
        const entidadeNome = (userObj.entidade || 'Não informada').trim();
        const tipoEntidade = _entidadesTipos[entidadeNome] || (entidadeNome.toLowerCase().includes('prefeitura') || entidadeNome.toLowerCase().includes('municipal') ? 'municipal' : 'externo');
        const isMunicipal = (tipoEntidade === 'municipal');
        const isEditing = _editingUserIds.has(userId);

        const userUnidade = (perfil.unidade || userObj.unidade || '').trim();
        const userSetor = (perfil.setor || userObj.setor || '').trim();
        const podeCriarCamadas = !!(perfil.pode_criar_camadas || userObj.pode_criar_camadas);
        const podeSubirOrtofotos = !!(perfil.pode_subir_ortofotos || userObj.pode_subir_ortofotos);

        // Determina a entidade do usuário deste card
        const userEntidadeRaw = (userObj.entidade || userObj.profile?.entidade || (userObj.membros && userObj.membros[0]?.entidade) || 'Prefeitura Municipal').trim();
        const userSigla = getEntitySigla(userEntidadeRaw);

        const minhaEntidade = (_currentUserProfile?.entidade || (_currentUserMembros && _currentUserMembros[0]?.entidade) || 'Prefeitura Municipal').trim();
        const minhaSigla = getEntitySigla(minhaEntidade);
        const isPartnerPontoFocal = (userSigla !== minhaSigla && (userObj.ponto_focal || userObj.profile?.ponto_focal));

        const munIdsAprovados = new Set(userObj.membros.filter(mb => mb.status === 'aprovado').map(mb => mb.municipio_id));
        const todosMunIdsDoUser = new Set(userObj.membros.map(mb => mb.municipio_id));

        // Define o município selecionado para este usuário no card
        if (isPartnerPontoFocal) {
            // Para Ponto Focal Parceiro, o município relevante é estritamente o município acessado nesta sessão
            if (_targetMunicipioId) {
                _userSelectedMunMap[userId] = _targetMunicipioId;
            } else if (!_userSelectedMunMap[userId] && _allMunicipios.length > 0) {
                _userSelectedMunMap[userId] = _allMunicipios[0].id;
            }
        } else if (isMunicipal) {
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

        // Renderiza camadas do município selecionado
        // FILTRO DE SEGURANÇA E ISOLAMENTO INSTITUCIONAL:
        // Se for um Ponto Focal de outro ente, exibe as camadas do ente do ADMIN para concessão de compartilhamento!
        // Se for usuário interno, exibe as camadas da entidade dele.
        const temasDoMunicipio = _allTemas.filter(t => {
            if (t.municipio_id && t.municipio_id !== selectedMunId) return false;
            
            const tEntRaw = getThemeEntity(t);
            const tSigla = getEntitySigla(tEntRaw);

            if (_currentUserProfile?.super_admin) return true;

            if (isPartnerPontoFocal) {
                // Camadas da entidade do Administrador disponíveis para compartilhar com este Ponto Focal
                return tSigla === minhaSigla;
            }

            // A camada pertence à entidade do usuário deste card
            if (tSigla === userSigla) return true;

            // Se for camada compartilhada de outro ente, só aparece se o usuário tiver autorização pontual
            const userHasPerm = _allCamadaPerms[`${userId}:${t.id}`]?.pode_ver;
            if (userHasPerm) return true;
            
            return false;
        });

        const camadasHtml = temasDoMunicipio.map(tema => {
            const formVinculado = (tema.tipo_cadastro && tema.tipo_cadastro !== 'padrao') ? _allForms[tema.tipo_cadastro] : null;
            const numAbas = (formVinculado && formVinculado.tabs) ? formVinculado.tabs.length : 0;

            const userCamadaPerm = _allCamadaPerms[`${userId}:${tema.id}`] || { pode_ver: false, pode_editar: false, pode_excluir: false };
            const adminCeiling = getAdminCeiling(tema.id);

            // AUTO-HEAL DE HIERARQUIA:
            // Se o usuário possui qualquer sub-aba liberada no banco, a camada pai obrigatoriamente
            // deve ser tratada como liberada para visualização!
            let hasAnySubAbaVer = false;
            if (numAbas > 0) {
                hasAnySubAbaVer = formVinculado.tabs.some(tab => {
                    const ap = _allAbaPerms[`${userId}:${formVinculado.id}:${tab.id}`];
                    return !!(ap && (ap.pode_ver || ap.pode_editar));
                });
            }

            const podeVerCamada = !!userCamadaPerm.pode_ver || hasAnySubAbaVer;
            const podeExcluirCamada = !!userCamadaPerm.pode_excluir;

            const tEntRaw = getThemeEntity(tema);
            const tSigla = getEntitySigla(tEntRaw);
            const isFromOtherEntity = tSigla !== userSigla;

            let abasHtml = '';
            if (numAbas > 0) {
                abasHtml = `
                    <div id="camada-sub-abas-${userId}-${tema.id}" class="camada-sub-abas hidden ml-3 pl-3 border-l-2 border-slate-300 dark:border-slate-600 mt-2 space-y-2 sub-abas-container transition-all" data-theme-id="${tema.id}" style="opacity: ${podeVerCamada ? '1' : '0.4'}; pointer-events: ${podeVerCamada ? 'auto' : 'none'};">
                        <div class="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">article</span> Abas do Formulário: ${formVinculado.title || ''}
                        </div>
                        ${formVinculado.tabs.map(tab => {
                            const userAbaPerm = _allAbaPerms[`${userId}:${formVinculado.id}:${tab.id}`] || { pode_ver: false, pode_editar: false };
                            const abaCeiling = getAdminCeiling(tema.id, formVinculado.id, tab.id);

                            // Respeito estrito à hierarquia: se a camada pai estiver desmarcada, a aba fica desmarcada
                            const isAbaVerChecked = podeVerCamada && !!userAbaPerm.pode_ver;
                            const isAbaEditarChecked = podeVerCamada && !!userAbaPerm.pode_editar;

                            const verDisabled = (!isEditing || !abaCeiling.podeVer || !podeVerCamada) ? 'disabled' : '';
                            const editDisabled = (!isEditing || !abaCeiling.podeEditar || !podeVerCamada) ? 'disabled' : '';

                            return `
                                <div class="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600/80 rounded-lg px-3 py-2 text-xs shadow-sm hover:border-slate-400 dark:hover:border-slate-500 transition-colors" data-form-id="${formVinculado.id}" data-tab-id="${tab.id}">
                                    <span class="text-slate-900 dark:text-slate-100 font-semibold truncate">${tab.title}</span>
                                    <div class="flex items-center gap-4 shrink-0">
                                        <label class="flex items-center gap-1.5 ${isEditing ? 'cursor-pointer' : 'cursor-default'} text-xs font-medium text-slate-700 dark:text-slate-300">
                                            <input type="checkbox" class="aba-ver-check rounded border-slate-400 dark:border-slate-500 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5" ${isAbaVerChecked ? 'checked' : ''} ${verDisabled} onchange="window.UsuariosManager.onSubAbaChange(this, '${userId}', '${tema.id}', 'ver')"> Ver
                                        </label>
                                        <label class="flex items-center gap-1.5 ${isEditing ? 'cursor-pointer' : 'cursor-default'} text-xs font-medium text-slate-700 dark:text-slate-300">
                                            <input type="checkbox" class="aba-editar-check rounded border-slate-400 dark:border-slate-500 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5" ${isAbaEditarChecked ? 'checked' : ''} ${editDisabled} onchange="window.UsuariosManager.onSubAbaChange(this, '${userId}', '${tema.id}', 'editar')"> Editar
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

        // Ortofotos do município selecionado
        const rastersDoMunicipio = (_allRasters || []).filter(r => {
            if (r.municipio_id && r.municipio_id !== selectedMunId) return false;
            const rEntRaw = (r.entidade || 'Prefeitura Municipal').trim();
            const rSigla = getEntitySigla(rEntRaw);

            if (_currentUserProfile?.super_admin) return true;

            if (isPartnerPontoFocal) {
                // Ortofotos da entidade do Administrador disponíveis para conceder acesso a este parceiro
                return rSigla === minhaSigla;
            }

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

            const canManageRaster = _currentUserProfile?.super_admin || (rSigla === minhaSigla);
            const rasterDisabled = (!isEditing || !canManageRaster) ? 'disabled' : '';

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
                        <label class="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 ${isEditing && canManageRaster ? 'cursor-pointer' : 'cursor-default'}">
                            <input type="checkbox" class="raster-ver-check rounded border-slate-400 dark:border-slate-500 text-emerald-600 focus:ring-emerald-500 w-4 h-4" ${podeVerRaster ? 'checked' : ''} ${rasterDisabled}>
                            Ver Ortofoto
                        </label>
                    </div>
                </div>
            `;
        }).join('');

        // Seletor de Municípios Atribuídos
        let atribuicaoMunicipiosHtml = '';
        if (isPartnerPontoFocal) {
            // Ponto Focal de Órgão Parceiro: Exibe exclusivamente o município acessado nesta sessão
            atribuicaoMunicipiosHtml = `
                <div class="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-800">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[17px] text-cyan-600 dark:text-cyan-400">home_work</span>
                            Município de Compartilhamento
                        </span>
                    </div>
                    <div class="flex items-center justify-between p-2.5 px-3.5 rounded-xl border border-cyan-400/50 bg-cyan-50/50 dark:bg-cyan-950/25 text-slate-800 dark:text-slate-200 text-xs shadow-xs">
                        <div class="flex items-center gap-2.5 font-bold text-cyan-700 dark:text-cyan-300">
                            <span class="material-symbols-outlined text-[20px] text-cyan-600 dark:text-cyan-400">domain</span>
                            <span class="text-sm font-extrabold">${selectedMunObj.nome}${selectedMunObj.uf ? ' - ' + selectedMunObj.uf : ''}</span>
                        </div>
                        <span class="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Município acessado</span>
                    </div>
                </div>
            `;
        } else if (!isMunicipal) {
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
                                ? 'border-sky-500 dark:border-sky-400 bg-sky-50 dark:bg-sky-950/40 ring-2 ring-sky-400/40' 
                                : (isChecked ? 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50' : 'border-slate-200 dark:border-slate-800 opacity-60 bg-transparent');

                            return `
                                <div class="flex items-center justify-between p-2.5 rounded-xl border ${activeBorder} transition-all select-none cursor-pointer group" onclick="window.UsuariosManager.selectUserMun('${userId}', '${mun.id}')">
                                    <div class="flex items-center gap-2 min-w-0 pr-1">
                                        <input type="checkbox" class="user-mun-check rounded border-slate-400 dark:border-slate-500 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5 shrink-0 ${munDisabled}" value="${mun.id}" data-mun-id="${mun.id}" ${isChecked ? 'checked' : ''} ${munDisabled} onclick="event.stopPropagation()">
                                        <span class="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-sky-600 transition-colors">${mun.nome}${mun.uf ? ' - ' + mun.uf : ''}</span>
                                    </div>
                                    ${isSelectedMun ? `
                                        <span class="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-sky-500 text-white shrink-0 shadow-xs">Ativo</span>
                                    ` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        } else if (isMunicipal) {
            atribuicaoMunicipiosHtml = `
                <div class="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-800">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[17px] text-sky-600 dark:text-sky-400">home_work</span>
                            Município de Atuação
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

        // Nome do município a exibir no cabeçalho (prioriza o município acessado nesta sessão)
        const munAtivoObjCard = _allMunicipios.find(m => m.id === _targetMunicipioId);
        const nomesMunicipiosDoUser = munAtivoObjCard 
            ? (munAtivoObjCard.nome + (munAtivoObjCard.uf ? ' - ' + munAtivoObjCard.uf : ''))
            : (_allMunicipios
                .filter(mun => todosMunIdsDoUser.has(mun.id))
                .map(mun => mun.nome + (mun.uf ? ' - ' + mun.uf : ''))
                .join(', ') || 'Nenhum município vinculado');

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
                    <span class="material-symbols-outlined text-[16px] ${isPartnerPontoFocal ? 'text-cyan-600 dark:text-cyan-400' : 'text-sky-600 dark:text-sky-400'}">${isPartnerPontoFocal ? 'lock_open' : 'edit'}</span> ${isPartnerPontoFocal ? 'Gerenciar Acessos' : 'Editar'}
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
                                ${userUnidade ? `
                                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center gap-1" title="Unidade: ${userUnidade}">
                                        <span class="material-symbols-outlined text-[12px]">apartment</span>${userUnidade}
                                    </span>
                                ` : ''}
                                ${userSetor ? `
                                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center gap-1" title="Setor: ${userSetor}">
                                        <span class="material-symbols-outlined text-[12px]">workspaces</span>${userSetor}
                                    </span>
                                ` : ''}
                                ${podeCriarCamadas ? `
                                    <span class="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5" title="Autorizado pelo Admin a criar e importar camadas">
                                        <span class="material-symbols-outlined text-[11px]">add_circle</span>+ Cria Camadas
                                    </span>
                                ` : ''}
                                ${podeSubirOrtofotos ? `
                                    <span class="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30 flex items-center gap-0.5" title="Autorizado pelo Admin a carregar ortofotos">
                                        <span class="material-symbols-outlined text-[11px]">cloud_upload</span>+ Sobe Ortofotos
                                    </span>
                                ` : ''}
                                ${isPartnerPontoFocal ? `
                                    <span class="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
                                        <span class="material-symbols-outlined text-[12px]">handshake</span> Ponto Focal ${userSigla}
                                    </span>
                                ` : (userObj.ponto_focal ? `<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">share_location</span>Ponto Focal</span>` : '')}
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
                    
                    ${isPartnerPontoFocal ? `
                    <!-- Banner de Ponto Focal Interinstitucional -->
                    <div class="mb-4 p-3.5 bg-gradient-to-r from-cyan-500/10 to-sky-500/10 dark:from-cyan-950/30 dark:to-sky-950/30 border border-cyan-500/30 rounded-xl flex items-start gap-3 shadow-xs">
                        <div class="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/30 mt-0.5">
                            <span class="material-symbols-outlined text-[20px]">share</span>
                        </div>
                        <div class="min-w-0 flex-1">
                            <h4 class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                Compartilhamento Interinstitucional com ${userSigla}
                                <span class="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">Ponto Focal</span>
                            </h4>
                            <p class="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                                Marque abaixo quais camadas e ortofotos da <b>sua entidade (${minhaSigla})</b> este servidor poderá acessar em <b>${selectedMunObj.nome}</b>. Ao salvar, as camadas marcadas aparecerão automaticamente na aba <b>COMPARTILHADO</b> para ele no catálogo.
                            </p>
                        </div>
                    </div>
                    ` : `
                    <!-- Entidade e Cargo do Usuário -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div>
                            <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px] text-cyan-500">hub</span> Entidade / Órgão
                            </label>
                            <input type="text" class="user-entidade-input w-full text-xs font-semibold bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 ${!isEditing ? 'opacity-70 pointer-events-none' : ''}" value="${entidadeNome}" ${!isEditing ? 'disabled' : ''} placeholder="Ex: Prefeitura Municipal, MPF...">
                        </div>
                        <div>
                            <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px] text-indigo-500">badge</span> Cargo / Função
                            </label>
                            <input type="text" class="user-cargo-input w-full text-xs font-semibold bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 ${!isEditing ? 'opacity-70 pointer-events-none' : ''}" value="${userObj.cargo || ''}" ${!isEditing ? 'disabled' : ''} placeholder="Ex: Analista, Diretor...">
                        </div>
                    </div>

                    <!-- Unidade e Setor do Usuário -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div>
                            <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px] text-blue-500">apartment</span> Unidade
                            </label>
                            <input type="text" class="user-unidade-input w-full text-xs font-semibold bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 ${!isEditing ? 'opacity-70 pointer-events-none' : ''}" value="${userUnidade}" ${!isEditing ? 'disabled' : ''} placeholder="Ex: Sede, Regional, Obras...">
                        </div>
                        <div>
                            <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px] text-purple-500">workspaces</span> Setor
                            </label>
                            <input type="text" class="user-setor-input w-full text-xs font-semibold bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 ${!isEditing ? 'opacity-70 pointer-events-none' : ''}" value="${userSetor}" ${!isEditing ? 'disabled' : ''} placeholder="Ex: Cadastro, Fiscalização, Projetos...">
                        </div>
                    </div>

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

                    <!-- Delegação de Permissões Especiais (Criar Camadas e Subir Ortofotos) -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div class="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/30 flex items-center justify-between gap-3 shadow-xs">
                            <div class="flex items-center gap-2.5 min-w-0 pr-2">
                                <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                                    <span class="material-symbols-outlined text-[18px]">add_circle</span>
                                </div>
                                <div class="flex flex-col min-w-0">
                                    <span class="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                        Criar / Importar Camadas
                                        ${podeCriarCamadas ? '<span class="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">Autorizado</span>' : ''}
                                    </span>
                                    <span class="text-[10px] text-slate-500 dark:text-slate-400">Autoriza este usuário a criar e importar camadas</span>
                                </div>
                            </div>
                            <label class="relative inline-flex items-center ${isEditing ? 'cursor-pointer' : 'cursor-default'} shrink-0" title="Delegar autorização para criar/importar camadas">
                                <input type="checkbox" class="user-pode-criar-camadas-check sr-only peer" ${podeCriarCamadas ? 'checked' : ''} ${!isEditing ? 'disabled' : ''}>
                                <div class="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>

                        <div class="p-3 rounded-xl border border-teal-200 dark:border-teal-800/80 bg-teal-50/70 dark:bg-teal-950/30 flex items-center justify-between gap-3 shadow-xs">
                            <div class="flex items-center gap-2.5 min-w-0 pr-2">
                                <div class="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/30">
                                    <span class="material-symbols-outlined text-[18px]">cloud_upload</span>
                                </div>
                                <div class="flex flex-col min-w-0">
                                    <span class="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                        Carregar Ortofotos
                                        ${podeSubirOrtofotos ? '<span class="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/30">Autorizado</span>' : ''}
                                    </span>
                                    <span class="text-[10px] text-slate-500 dark:text-slate-400">Autoriza este usuário a enviar imagens e ortofotos</span>
                                </div>
                            </div>
                            <label class="relative inline-flex items-center ${isEditing ? 'cursor-pointer' : 'cursor-default'} shrink-0" title="Delegar autorização para carregar ortofotos">
                                <input type="checkbox" class="user-pode-subir-ortofotos-check sr-only peer" ${podeSubirOrtofotos ? 'checked' : ''} ${!isEditing ? 'disabled' : ''}>
                                <div class="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-500"></div>
                            </label>
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
                        <label class="relative inline-flex items-center ${isEditing ? 'cursor-pointer' : 'cursor-default'} shrink-0" title="Ativar/desativar este servidor como ponto focal interinstitucional">
                            <input type="checkbox" class="user-ponto-focal-check sr-only peer" ${userObj.ponto_focal ? 'checked' : ''} ${!isEditing ? 'disabled' : ''}>
                            <div class="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-500"></div>
                        </label>
                    </div>
                    `}

                    ${atribuicaoMunicipiosHtml}

                    <!-- Gestão Granular de Camadas e Abas do Município Ativo -->
                    <div class="mt-4">
                        <div class="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-1">
                            <span class="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                <span class="material-symbols-outlined text-[18px] text-sky-600 dark:text-sky-400">layers</span>
                                ${isPartnerPontoFocal ? `Camadas da sua Entidade (${minhaSigla}) para Compartilhar` : `Permissões de Camadas e Abas`} — <span class="text-sky-600 dark:text-sky-400">${selectedMunObj.nome}${selectedMunObj.uf ? ' - ' + selectedMunObj.uf : ''}</span>
                            </span>
                            <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Clique na camada para expandir as abas</span>
                        </div>

                        <div class="space-y-3">
                            ${camadasHtml || `<div class="text-xs text-slate-400 italic py-4 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">${isPartnerPontoFocal ? `Nenhuma camada da sua entidade (${minhaSigla}) cadastrada em ${selectedMunObj.nome} para compartilhar.` : `Nenhuma camada da entidade ${userSigla} cadastrada em ${selectedMunObj.nome}.`}</div>`}
                        </div>
                    </div>

                    <!-- Gestão Granular de Ortofotos do Município Ativo -->
                    <div class="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800">
                        <div class="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-1">
                            <span class="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                <span class="material-symbols-outlined text-[18px] text-emerald-600 dark:text-emerald-400">satellite_alt</span>
                                ${isPartnerPontoFocal ? `Ortofotos da sua Entidade (${minhaSigla}) para Compartilhar` : `Permissões de Ortofotos`} — <span class="text-emerald-600 dark:text-emerald-400">${selectedMunObj.nome}${selectedMunObj.uf ? ' - ' + selectedMunObj.uf : ''}</span>
                            </span>
                            <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Imagens aéreas e ortofotos liberadas</span>
                        </div>

                        <div class="space-y-2">
                            ${ortofotosHtml || `<div class="text-xs text-slate-400 italic py-3 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">${isPartnerPontoFocal ? `Nenhuma ortofoto da sua entidade (${minhaSigla}) cadastrada em ${selectedMunObj.nome} para compartilhar.` : `Nenhuma ortofoto da entidade ${userSigla} cadastrada em ${selectedMunObj.nome}.`}</div>`}
                        </div>
                    </div>

                    ${(isEditing && !isPartnerPontoFocal) ? `
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
            if (isChecked) {
                // Ao habilitar a camada, reabilita os inputs e garante que 'Ver' venha checado por padrão se nada estiver checado
                subContainer.querySelectorAll('.aba-ver-check, .aba-editar-check').forEach(cb => {
                    cb.disabled = false;
                });
                const anyVerChecked = Array.from(subContainer.querySelectorAll('.aba-ver-check')).some(cb => cb.checked);
                if (!anyVerChecked) {
                    subContainer.querySelectorAll('.aba-ver-check').forEach(cb => {
                        cb.checked = true;
                    });
                }
            } else {
                // Ao desabilitar a camada, desmarca e desabilita todas as sub-abas imediatamente
                subContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    cb.checked = false;
                    cb.disabled = true;
                });
            }
        }
    }

    function onSubAbaChange(abaCheckbox, userId, themeId, actionType) {
        const subContainer = document.getElementById(`camada-sub-abas-${userId}-${themeId}`);
        const card = document.querySelector(`[data-user-card="${userId}"]`);
        const camadaCard = card ? card.querySelector(`[data-camada-id="${themeId}"]`) : null;
        const camadaCheckbox = camadaCard ? camadaCard.querySelector('.camada-ver-check') : null;

        // Se uma aba foi marcada (Ver ou Editar), garante que a camada pai fique marcada!
        if (abaCheckbox.checked && camadaCheckbox && !camadaCheckbox.checked) {
            camadaCheckbox.checked = true;
            if (subContainer) {
                subContainer.style.opacity = '1';
                subContainer.style.pointerEvents = 'auto';
                subContainer.querySelectorAll('.aba-ver-check, .aba-editar-check').forEach(cb => {
                    cb.disabled = false;
                });
            }
        }

        // Se marcou 'Editar', obrigatoriamente precisa ter 'Ver' marcado
        if (actionType === 'editar' && abaCheckbox.checked) {
            const row = abaCheckbox.closest('[data-form-id][data-tab-id]');
            if (row) {
                const verCb = row.querySelector('.aba-ver-check');
                if (verCb) verCb.checked = true;
            }
        }

        // Se desmarcou 'Ver', obrigatoriamente desmarca 'Editar'
        if (actionType === 'ver' && !abaCheckbox.checked) {
            const row = abaCheckbox.closest('[data-form-id][data-tab-id]');
            if (row) {
                const editCb = row.querySelector('.aba-editar-check');
                if (editCb) editCb.checked = false;
            }
        }
    }

    async function salvarUsuario(userId) {
        const card = document.querySelector(`[data-user-card="${userId}"]`);
        if (!card) return;

        const papel = card.querySelector('.user-papel-select')?.value || 'visualizador';
        const status = card.querySelector('.user-status-select')?.value || 'aprovado';

        const saveBtn = card.querySelector('button[onclick*="salvarUsuario"]');
        const originalText = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) {
            saveBtn.innerHTML = '<span class="material-symbols-outlined text-[15px] animate-spin">refresh</span> Salvando...';
            saveBtn.disabled = true;
        }

        try {
            const minhaEntidade = (_currentUserProfile?.entidade || (_currentUserMembros && _currentUserMembros[0]?.entidade) || 'Prefeitura Municipal').trim();
            const minhaSigla = getEntitySigla(minhaEntidade);
            const userObj = _allMembros.find(m => m.user_id === userId);
            const userEntidadeRaw = (userObj?.entidade || userObj?.profiles?.entidade || '').trim();
            const userSigla = getEntitySigla(userEntidadeRaw);
            const isPartnerPontoFocal = (userSigla !== minhaSigla && (userObj?.ponto_focal || userObj?.profiles?.ponto_focal));

            // 1. Atualiza município_membros APENAS para usuários locais (não sobrescreve o cadastro corporativo de parceiros)
            if (!isPartnerPontoFocal) {
                const { error: membroErr } = await supabaseClient
                    .from('municipio_membros')
                    .update({ papel, status })
                    .eq('user_id', userId);

                if (membroErr) throw membroErr;

                if (status === 'rejeitado') {
                    await Promise.allSettled([
                        supabaseClient.from('permissoes_camada').delete().eq('user_id', userId),
                        supabaseClient.from('permissoes_raster').delete().eq('user_id', userId),
                        supabaseClient.from('permissoes_aba').delete().eq('user_id', userId)
                    ]);
                }
            }

            // 2. Coleta permissões de camadas do município selecionado
            const camadaCards = card.querySelectorAll('[data-camada-id]');
            const camadaRows = [];
            const abaRows = [];

            camadaCards.forEach(cCard => {
                const themeId = cCard.getAttribute('data-camada-id');
                let podeVer = !!cCard.querySelector('.camada-ver-check')?.checked;
                const podeExcluir = !!cCard.querySelector('.camada-excluir-check')?.checked;

                const abaEls = cCard.querySelectorAll('[data-form-id][data-tab-id]');
                let podeEditarCamada = false;

                abaEls.forEach(aEl => {
                    const formId = aEl.getAttribute('data-form-id');
                    const tabId = aEl.getAttribute('data-tab-id');
                    const podeVerAba = !!aEl.querySelector('.aba-ver-check')?.checked;
                    const podeEditarAba = !!aEl.querySelector('.aba-editar-check')?.checked;

                    // Se qualquer aba estiver marcada, a camada pai obrigatoriamente deve ser verdadeira
                    if (podeVerAba || podeEditarAba) {
                        podeVer = true;
                    }
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
                if (cErr) {
                    console.error('Erro ao atualizar permissoes_camada:', cErr);
                    throw new Error('Falha ao salvar permissões de camada: ' + (cErr.message || 'Violação de política RLS no banco de dados.'));
                }
                // Atualiza cache em memória imediatamente
                camadaRows.forEach(row => {
                    _allCamadaPerms[`${row.user_id}:${row.theme_id}`] = row;
                });
            }

            // 4. Salva permissoes_aba
            if (abaRows.length > 0) {
                const { error: aErr } = await supabaseClient
                    .from('permissoes_aba')
                    .upsert(abaRows, { onConflict: 'user_id,form_id,tab_id' });
                if (aErr) {
                    console.error('Erro ao atualizar permissoes_aba:', aErr);
                    throw new Error('Falha ao salvar permissões de aba: ' + (aErr.message || 'Violação de política RLS no banco de dados.'));
                }
                // Atualiza cache em memória imediatamente
                abaRows.forEach(row => {
                    _allAbaPerms[`${row.user_id}:${row.form_id}:${row.tab_id}`] = row;
                });
            }

            // 4.1 Salva ponto_focal, entidade, cargo, unidade, setor e delegações em profiles e municipio_membros APENAS se for usuário local
            if (!isPartnerPontoFocal) {
                const isPontoFocal = !!card.querySelector('.user-ponto-focal-check')?.checked;
                let inputEntidade = card.querySelector('.user-entidade-input')?.value?.trim();
                const inputCargo = card.querySelector('.user-cargo-input')?.value?.trim();
                const inputUnidade = card.querySelector('.user-unidade-input')?.value?.trim();
                const inputSetor = card.querySelector('.user-setor-input')?.value?.trim();
                const podeCriarCamadas = !!card.querySelector('.user-pode-criar-camadas-check')?.checked;
                const podeSubirOrtofotos = !!card.querySelector('.user-pode-subir-ortofotos-check')?.checked;

                // Normaliza entidade para garantir consistência institucional
                if (inputEntidade) {
                    const s = getEntitySigla(inputEntidade);
                    if (s === 'Município' && (inputEntidade.toLowerCase() === 'municipal' || inputEntidade.toLowerCase() === 'municipio')) {
                        inputEntidade = 'Prefeitura Municipal';
                    }
                }

                const profileUpdatePayload = { 
                    ponto_focal: isPontoFocal,
                    pode_criar_camadas: podeCriarCamadas,
                    pode_subir_ortofotos: podeSubirOrtofotos
                };
                if (inputEntidade) profileUpdatePayload.entidade = inputEntidade;
                if (inputCargo !== undefined) profileUpdatePayload.cargo = inputCargo;
                if (inputUnidade !== undefined) profileUpdatePayload.unidade = inputUnidade || null;
                if (inputSetor !== undefined) profileUpdatePayload.setor = inputSetor || null;
                if (papel === 'admin' && inputUnidade) {
                    profileUpdatePayload.unidade_admin = inputUnidade;
                }

                try {
                    await supabaseClient.from('profiles').update(profileUpdatePayload).eq('id', userId);
                    if (inputEntidade) {
                        await supabaseClient.from('municipio_membros').update({
                            entidade: inputEntidade,
                            cargo: inputCargo || null
                        }).eq('user_id', userId);
                    }
                } catch(e) {
                    console.warn('Erro ao atualizar profiles e municipio_membros:', e);
                }

                // Atualiza em memória imediatamente para que os dados e filtros reflitam sem recarregar a página
                _allMembros.filter(m => m.user_id === userId).forEach(m => {
                    if (!m.profiles) m.profiles = {};
                    m.profiles.ponto_focal = isPontoFocal;
                    m.profiles.pode_criar_camadas = podeCriarCamadas;
                    m.profiles.pode_subir_ortofotos = podeSubirOrtofotos;
                    if (inputEntidade) {
                        m.profiles.entidade = inputEntidade;
                        m.entidade = inputEntidade;
                    }
                    if (inputCargo !== undefined) {
                        m.profiles.cargo = inputCargo;
                        m.cargo = inputCargo;
                    }
                    if (inputUnidade !== undefined) {
                        m.profiles.unidade = inputUnidade;
                    }
                    if (inputSetor !== undefined) {
                        m.profiles.setor = inputSetor;
                    }
                    if (papel === 'admin' && inputUnidade) {
                        m.profiles.unidade_admin = inputUnidade;
                    }
                });
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
                const { error: rErr } = await supabaseClient
                    .from('permissoes_raster')
                    .upsert(rasterRows, { onConflict: 'user_id,raster_id' });
                if (rErr) {
                    console.error('Erro ao atualizar permissoes_raster:', rErr);
                    throw new Error('Falha ao salvar permissões de ortofoto: ' + (rErr.message || 'Violação de política RLS no banco de dados.'));
                }
                // Atualiza em memória imediatamente para manter a interface consistente
                rasterRows.forEach(row => {
                    _allRasterPerms[`${row.user_id}:${row.raster_id}`] = row;
                });
            }

            // 5. Sincroniza Municípios Atribuídos APENAS para usuários locais
            if (!isPartnerPontoFocal) {
                const munChecks = card.querySelectorAll('.user-mun-check');
                const userMembrosList = _allMembros.filter(m => m.user_id === userId);
                const userPrimeiroMembro = userMembrosList[0] || {};
                const userEntidade = (userPrimeiroMembro.entidade || '').trim();
                const userTipo = _entidadesTipos[userEntidade] || (userEntidade.toLowerCase().includes('prefeitura') || userEntidade.toLowerCase().includes('municipal') ? 'municipal' : 'externo');

                if (userTipo === 'municipal') {
                    if (userMembrosList.length > 1) {
                        const munOrigemId = userPrimeiroMembro.municipio_id;
                        const strayMembros = userMembrosList.filter(mb => mb.municipio_id !== munOrigemId);
                        for (const stray of strayMembros) {
                            await supabaseClient.from('municipio_membros').delete().eq('id', stray.id);
                            _allMembros = _allMembros.filter(mb => mb.id !== stray.id);
                        }
                    }
                } else if (munChecks.length > 0) {
                    const getMunIdFromCb = (cb) => {
                        const val = cb.value;
                        if (val && val !== 'on' && val !== 'true') return val;
                        return cb.dataset.munId || cb.getAttribute('data-mun-id');
                    };

                    const selectedMunIds = Array.from(munChecks).filter(cb => cb.checked).map(getMunIdFromCb).filter(Boolean);
                    const unselectedMunIds = Array.from(munChecks).filter(cb => !cb.checked).map(getMunIdFromCb).filter(Boolean);

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
                            }).select('id, user_id, municipio_id, papel, status, entidade, cargo, solicitado_em, profiles!user_id(id, nome, email, super_admin, ponto_focal, entidade), municipios(id, nome, uf)').single();

                            if (insErr) {
                                console.error('Erro ao vincular membro ao município:', insErr);
                            } else if (newMb) {
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
            }

            camadaRows.forEach(cr => {
                _allCamadaPerms[`${cr.user_id}:${cr.theme_id}`] = cr;
            });
            abaRows.forEach(ar => {
                _allAbaPerms[`${ar.user_id}:${ar.form_id}:${ar.tab_id}`] = ar;
            });
            rasterRows.forEach(rr => {
                _allRasterPerms[`${rr.user_id}:${rr.raster_id}`] = rr;
            });

            _editingUserIds.delete(userId);

            renderMainTabs();

            const container = card.parentElement;
            if (container) {
                const searchInput = document.getElementById('usuarios-search') || document.getElementById('users-search');
                renderUsersList(container.id, searchInput ? searchInput.value : '');
            }

            if (isPartnerPontoFocal) {
                alert('✓ Permissões de compartilhamento salvas com sucesso!\nAs camadas e ortofotos marcadas já estão disponíveis na aba COMPARTILHADO para este Ponto Focal.');
            } else {
                alert('✓ Permissões e dados do usuário atualizados com sucesso!');
            }

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
            renderMainTabs();
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
            renderMainTabs();
            renderUsersList(container.id, searchInput ? searchInput.value : '');
        }
    }

    function setSetorFiltro(setor) {
        _selectedSetorFiltro = setor;
        const container = document.getElementById('usuarios-list') || document.getElementById('users-container') || document.getElementById(_containerIdAtual);
        if (container) {
            const searchInput = document.getElementById(_searchInputIdAtual || 'users-search') || document.getElementById('usuarios-search');
            renderUsersList(container.id, searchInput ? searchInput.value : '');
        }
    }

    window.UsuariosManager = {
        init: initUsuariosManager,
        setMunicipio,
        setSetorFiltro,
        selectUserMun,
        toggleUserCard,
        toggleCamadaAccordion,
        iniciarEdicao,
        cancelarEdicao,
        salvarUsuario,
        removerAcesso,
        toggleCamadaSubAbas,
        onSubAbaChange,
        selectEntidadeFiltro,
        switchMainTab,
        selectCompartilhadoFiltro,
        abrirNoMapa,
        onSearch
    };

    window.filterUsersList = onSearch;

})(window);
