// src/interinstitutional-search.js
// MÓDULO DE PESQUISA RÁPIDA INTERINSTITUCIONAL POR TIPO DE DADO
// Permite que entes (MPF, PF, SPU e SuperAdmin) pesquisem números de processos/registros
// (IPL, EPOL, RIP) em todas as bases territoriais e camadas cadastradas no sistema.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const instance = factory();
        root.InterinstitutionalSearch = instance;
        root.interinstitutionalSearch = instance;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // -------------------------------------------------------------------------
    // 1. Mapeamento de Entes e Tipos de Dados Suportados
    // -------------------------------------------------------------------------
    const ENTE_CONFIG = {
        'MPF': {
            sigla: 'MPF',
            nome: 'Ministério Público Federal',
            icone: 'balance',
            corBadge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
            corIcone: 'text-blue-600 dark:text-blue-400',
            defaultType: 'ipl',
            tiposPermitidos: ['ipl'],
            label: 'Inquérito Policial Federal (IPL)',
            badgeText: 'MPF • IPL',
            placeholder: 'Pesquisar número do IPL (ex: 0000000-00.0000.0.00.0000)...',
            tiposValidos: ['ipl', 'ipf']
        },
        'PF': {
            sigla: 'PF',
            nome: 'Polícia Federal',
            icone: 'shield',
            corBadge: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
            corIcone: 'text-cyan-600 dark:text-cyan-400',
            defaultType: 'epol',
            tiposPermitidos: ['epol'],
            label: 'Processo / Inquérito Eletrônico (EPOL)',
            badgeText: 'PF • EPOL',
            placeholder: 'Pesquisar número do EPOL (ex: 2023.1234567)...',
            tiposValidos: ['epol', 'epol_1n']
        },
        'SPU': {
            sigla: 'SPU',
            nome: 'Superintendência do Patrimônio da União',
            icone: 'account_balance',
            corBadge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
            corIcone: 'text-indigo-600 dark:text-indigo-400',
            defaultType: 'rip',
            tiposPermitidos: ['rip'],
            label: 'Registro Imobiliário Patrimonial (RIP)',
            badgeText: 'SPU • RIP',
            placeholder: 'Pesquisar número do RIP (ex: 19650001155-06)...',
            tiposValidos: ['rip', 'rip_1n']
        },
        'SUPER': {
            sigla: 'SUPER',
            nome: 'Super Administrador',
            icone: 'manage_accounts',
            corBadge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
            corIcone: 'text-emerald-600 dark:text-emerald-400',
            defaultType: 'todos',
            tiposPermitidos: ['todos', 'ipl', 'epol', 'rip'],
            label: 'Todos os Registros Interinstitucionais',
            badgeText: 'SUPERADMIN',
            placeholder: 'Pesquisar IPL, EPOL, RIP ou processo em todas as bases...',
            tiposValidos: ['ipl', 'ipf', 'epol', 'epol_1n', 'rip', 'rip_1n']
        },
        'GERAL': {
            sigla: 'GERAL',
            nome: 'Administração Geral',
            icone: 'domain',
            corBadge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
            corIcone: 'text-slate-600 dark:text-slate-400',
            defaultType: 'todos',
            tiposPermitidos: ['todos', 'ipl', 'epol', 'rip'],
            label: 'Pesquisa Interinstitucional',
            badgeText: 'REGISTRO GERAL',
            placeholder: 'Pesquisar IPL, EPOL, RIP ou número em todas as bases...',
            tiposValidos: ['ipl', 'ipf', 'epol', 'epol_1n', 'rip', 'rip_1n']
        }
    };

    /**
     * Identifica as configurações de pesquisa a partir do perfil do usuário.
     */
    function detectUserEnteConfig(userProfile) {
        if (!userProfile) return { ...ENTE_CONFIG['GERAL'] };

        if (userProfile.super_admin || userProfile.is_superadmin) {
            return { ...ENTE_CONFIG['SUPER'] };
        }

        const rawEntidade = String(userProfile.entidade || userProfile.entidade_nome || userProfile.nome_entidade || '').trim();
        const lower = rawEntidade.toLowerCase();

        if (lower.includes('mpf') || lower.includes('ministério público') || lower.includes('ministerio publico')) {
            return { ...ENTE_CONFIG['MPF'] };
        }
        if (lower.includes('polícia federal') || lower.includes('policia federal') || lower === 'pf' || lower.includes('dpf')) {
            return { ...ENTE_CONFIG['PF'] };
        }
        if (lower.includes('spu') || lower.includes('patrimônio da união') || lower.includes('patrimonio da uniao') || lower.includes('união') || lower.includes('uniao')) {
            return { ...ENTE_CONFIG['SPU'] };
        }

        return { ...ENTE_CONFIG['GERAL'] };
    }

    // -------------------------------------------------------------------------
    // 2. Máscaras e Normalização Numérica
    // -------------------------------------------------------------------------
    function digitsOf(val) {
        return String(val === null || val === undefined ? '' : val).replace(/\D/g, '');
    }

    function maskEpol(v) {
        const d = digitsOf(v).substring(0, 11);
        if (d.length === 0) return '';
        return d.length > 4 ? d.substring(0, 4) + '.' + d.substring(4) : d;
    }

    function maskRip(v) {
        const d = digitsOf(v).substring(0, 13);
        if (d.length === 0) return '';
        return d.length > 11 ? d.substring(0, 11) + '-' + d.substring(11) : d;
    }

    function maskIpl(v) {
        const d = digitsOf(v);
        if (d.length >= 20) {
            return d.substring(d.length - 20)
                .replace(/(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})/, '$1-$2.$3.$4.$5.$6');
        }
        return String(v);
    }

    function formatValueByType(value, type) {
        if (!value) return '';
        const t = String(type || '').toLowerCase();
        if (t === 'epol' || t === 'epol_1n') return maskEpol(value);
        if (t === 'rip' || t === 'rip_1n') return maskRip(value);
        if (t === 'ipl' || t === 'ipf') return maskIpl(value);
        return String(value);
    }

    // -------------------------------------------------------------------------
    // 3. Comparador Flexível de Propriedade
    // -------------------------------------------------------------------------
    function propertyMatchesTerm(val, term, rawDigits) {
        if (val === null || val === undefined) return false;

        if (typeof val === 'string' || typeof val === 'number') {
            const s = String(val).toLowerCase().trim();
            if (term && s.includes(term)) return true;

            const d = digitsOf(val);
            if (rawDigits && d) {
                if (d === rawDigits || d.includes(rawDigits) || rawDigits.includes(d)) {
                    return true;
                }
            }
            return false;
        }

        if (Array.isArray(val)) {
            return val.some(item => propertyMatchesTerm(item, term, rawDigits));
        }

        if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
            try {
                const parsed = JSON.parse(val);
                return propertyMatchesTerm(parsed, term, rawDigits);
            } catch (e) {}
        }

        if (typeof val === 'object') {
            return Object.values(val).some(item => propertyMatchesTerm(item, term, rawDigits));
        }

        return false;
    }

    function extractMatchedValue(val, term, rawDigits) {
        if (val === null || val === undefined) return '';

        if (typeof val === 'string' || typeof val === 'number') {
            return String(val);
        }

        if (Array.isArray(val)) {
            for (const item of val) {
                if (propertyMatchesTerm(item, term, rawDigits)) {
                    return extractMatchedValue(item, term, rawDigits);
                }
            }
            return '';
        }

        if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
            try {
                const parsed = JSON.parse(val);
                return extractMatchedValue(parsed, term, rawDigits);
            } catch (e) {}
        }

        if (typeof val === 'object' && val !== null) {
            for (const k in val) {
                if (propertyMatchesTerm(val[k], term, rawDigits)) {
                    return extractMatchedValue(val[k], term, rawDigits);
                }
            }
            return '';
        }

        return String(val);
    }

    function generateFeatureSummary(props) {
        if (!props || typeof props !== 'object') return 'Registro Sem Detalhes';

        const details = [];

        // 1. Nome ou Titular
        for (const k of ['nome', 'proprietario', 'nome_proprietario', 'titular', 'denominacao', 'imovel']) {
            if (props[k] && typeof props[k] === 'string' && props[k].trim()) {
                details.push(props[k].trim());
                break;
            }
        }

        // 2. Endereço ou Localização
        for (const k of ['endereco', 'logradouro', 'rua']) {
            if (props[k] && typeof props[k] === 'string' && props[k].trim()) {
                const num = props['numero'] ? `, Nº ${props['numero']}` : '';
                details.push(`${props[k].trim()}${num}`);
                break;
            }
        }

        // 3. Quadra / Lote se não tiver endereço
        if (details.length < 2) {
            const quadra = props['quadra'] || props['qd'];
            const lote = props['lote'] || props['lote'];
            if (quadra || lote) {
                details.push(`Quadra ${quadra || '—'}, Lote ${lote || '—'}`);
            }
        }

        // 4. Inscrição imobiliária
        for (const k of ['inscricao_imobiliaria', 'insc_imob', 'matricula']) {
            if (props[k] && typeof props[k] === 'string' && props[k].trim()) {
                details.push(`Insc: ${props[k].trim()}`);
                break;
            }
        }

        return details.length > 0 ? details.slice(0, 2).join(' • ') : 'Feição Cartográfica Cadastrada';
    }

    // -------------------------------------------------------------------------
    // 4. Motor de Busca Principal
    // -------------------------------------------------------------------------
    async function searchRecord(termo, options) {
        const {
            supabaseClient: passedClient,
            userProfile: passedUserProfile,
            tipoDado = 'todos',
            municipiosAprovados: passedMunicipiosAprovados,
            todosMunicipios: passedTodosMunicipios
        } = options || {};

        let supabaseClient = passedClient 
            || (typeof window !== 'undefined' && window.supabaseClient)
            || (typeof globalThis !== 'undefined' && globalThis.supabaseClient);

        if (!supabaseClient && typeof window !== 'undefined' && window.supabase) {
            try {
                if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
                    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                        auth: {
                            storage: window.sessionStorage,
                            persistSession: true,
                            autoRefreshToken: true,
                            detectSessionInUrl: true
                        }
                    });
                    window.supabaseClient = supabaseClient;
                }
            } catch(e) {}
        }

        if (!supabaseClient) throw new Error('Cliente Supabase não configurado');

        const userProfile = passedUserProfile 
            || (typeof window !== 'undefined' && (window.currentUserProfile || window.homeUserProfile))
            || null;

        let todosMunicipios = passedTodosMunicipios 
            || (typeof window !== 'undefined' && window.municipiosParaMostrarCache)
            || [];

        let municipiosAprovados = passedMunicipiosAprovados
            || (typeof window !== 'undefined' && (window.municipiosAprovadosCache || todosMunicipios))
            || todosMunicipios;

        const cleanTerm = String(termo || '').trim().toLowerCase();
        const rawDigits = digitsOf(termo);

        if (!cleanTerm && !rawDigits) {
            return { items: [], total: 0, termo: '', message: 'Digite um número para pesquisar.' };
        }

        let tiposAlvo = [];
        const tipoEscolhido = String(tipoDado || 'todos').toLowerCase();
        if (tipoEscolhido === 'ipl') {
            tiposAlvo = ['ipl', 'ipf'];
        } else if (tipoEscolhido === 'epol') {
            tiposAlvo = ['epol', 'epol_1n'];
        } else if (tipoEscolhido === 'rip') {
            tiposAlvo = ['rip', 'rip_1n'];
        } else {
            tiposAlvo = ['ipl', 'ipf', 'epol', 'epol_1n', 'rip', 'rip_1n'];
        }

        // 1. Busca Formulários cadastrados (usando select('*') para compatibilidade de schema)
        const { data: formsData, error: formsErr } = await supabaseClient
            .from('forms')
            .select('*');
        if (formsErr) console.warn('Aviso ao consultar forms:', formsErr);

        const allForms = formsData || [];
        const formFieldsTargetMap = {};
        allForms.forEach(form => {
            let schema = form.schema || form.tabs || [];
            if (form.schema && !Array.isArray(form.schema) && form.schema.tabs) {
                schema = form.schema.tabs;
            }
            if (!Array.isArray(schema)) return;

            schema.forEach(tab => {
                if (!tab.fields || !Array.isArray(tab.fields)) return;
                tab.fields.forEach(f => {
                    const fType = String(f.type || '').toLowerCase();
                    if (tiposAlvo.includes(fType)) {
                        if (!formFieldsTargetMap[form.id]) formFieldsTargetMap[form.id] = [];
                        formFieldsTargetMap[form.id].push({
                            fieldId: String(f.id || f.name),
                            fieldLabel: f.label || f.name || f.id,
                            fieldType: fType,
                            tabTitle: tab.title || tab.name || 'Geral'
                        });
                    }
                });
            });
        });

        // 2. Busca Temas cadastrados (usando select('*') para obter nome, tipo_cadastro, metadata, municipio_id)
        const { data: temasData, error: temasErr } = await supabaseClient
            .from('temas')
            .select('*');
        if (temasErr) console.warn('Aviso ao consultar temas:', temasErr);

        const allTemas = temasData || [];
        const temasMap = {};
        allTemas.forEach(t => { temasMap[t.id] = t; });

        if ((!todosMunicipios || todosMunicipios.length === 0) && supabaseClient) {
            try {
                const { data: mData } = await supabaseClient.from('municipios').select('id, nome, uf, brasao_url');
                if (mData && mData.length > 0) {
                    todosMunicipios = mData;
                    if (typeof window !== 'undefined') window.municipiosParaMostrarCache = mData;
                }
            } catch(eMun) {}
        }
        const municipiosMap = {};
        (todosMunicipios || []).forEach(m => { municipiosMap[m.id] = m; });

        // Identifica temas alvo (se tiver até 100 camadas ou se candidateThemes estiver vazio, busca em todas para não perder nenhum dado)
        const candidateThemes = allTemas.filter(t => {
            const formId = t.tipo_cadastro || t.form_id || t.formId || t.cadastroType || (t.metadata && (t.metadata.formId || t.metadata.tipo_cadastro));
            return formId && formFieldsTargetMap[formId] && formFieldsTargetMap[formId].length > 0;
        });

        let targetThemeIds = candidateThemes.map(t => t.id);
        if (targetThemeIds.length === 0 || allTemas.length <= 100) {
            targetThemeIds = allTemas.map(t => t.id);
        }

        if (targetThemeIds.length === 0) {
            return { items: [], total: 0, termo, message: 'Nenhuma camada cadastrada no sistema.' };
        }

        // 3. Consulta as Feições no Supabase
        const matchedItems = [];
        const isSuperAdmin = !!(userProfile && (userProfile.super_admin || userProfile.is_superadmin));
        const approvedMunIds = new Set((municipiosAprovados || []).map(m => m.id));

        const batchSize = 20;
        for (let i = 0; i < targetThemeIds.length; i += batchSize) {
            const batchThemes = targetThemeIds.slice(i, i + batchSize);

            const { data: feicoesData, error: feicoesErr } = await supabaseClient
                .from('feicoes')
                .select('id, theme_id, propriedades')
                .in('theme_id', batchThemes);

            if (feicoesErr) {
                console.warn('Erro ao consultar lote de feições:', feicoesErr);
                continue;
            }

            (feicoesData || []).forEach(feat => {
                const props = feat.propriedades;
                if (!props || typeof props !== 'object') return;

                const tema = temasMap[feat.theme_id];
                const formId = tema ? (tema.tipo_cadastro || tema.form_id || tema.formId || tema.cadastroType || (tema.metadata && (tema.metadata.formId || tema.metadata.tipo_cadastro))) : null;
                const targetFields = (formId && formFieldsTargetMap[formId]) ? formFieldsTargetMap[formId] : null;

                let matchEncontrado = false;
                let matchedFieldLabel = '';
                let matchedType = '';
                let matchedRawValue = '';

                // A. Tenta primeiro nos campos explicitamente mapeados pelo schema
                if (targetFields && targetFields.length > 0) {
                    for (const tf of targetFields) {
                        const val = props[tf.fieldId];
                        if (propertyMatchesTerm(val, cleanTerm, rawDigits)) {
                            matchEncontrado = true;
                            matchedFieldLabel = tf.fieldLabel;
                            matchedType = tf.fieldType;
                            matchedRawValue = extractMatchedValue(val, cleanTerm, rawDigits);
                            break;
                        }
                    }
                }

                // B. Se não encontrou pelo schema, varre todas as propriedades (inclusive sub-abas 1:N e chaves livres)
                if (!matchEncontrado) {
                    for (const propKey in props) {
                        if (propKey.startsWith('_') || propKey === 'themeId' || propKey === 'id_banco') continue;
                        const val = props[propKey];
                        if (propertyMatchesTerm(val, cleanTerm, rawDigits)) {
                            matchEncontrado = true;
                            matchedFieldLabel = propKey;
                            
                            const keyLower = propKey.toLowerCase();
                            const extractedVal = extractMatchedValue(val, cleanTerm, rawDigits);
                            const valDigits = digitsOf(extractedVal);

                            if (keyLower.includes('epol') || (valDigits.length === 11 && String(extractedVal).includes('-'))) {
                                matchedType = 'epol';
                            } else if (keyLower.includes('rip') || (valDigits.length >= 8 && (keyLower.includes('imovel') || keyLower.includes('patrimonio')))) {
                                matchedType = 'rip';
                            } else if (keyLower.includes('ipl') || keyLower.includes('inquerito') || keyLower.includes('processo') || valDigits.length === 20) {
                                matchedType = 'ipl';
                            } else {
                                matchedType = tipoEscolhido !== 'todos' ? tipoEscolhido : 'geral';
                            }

                            // Se o usuário selecionou um filtro específico (ex: IPL), só ignora se tiver certeza que é outro tipo incompatível
                            if (tipoEscolhido !== 'todos' && tipoEscolhido === 'ipl') {
                                if (valDigits.length !== 20 && !keyLower.includes('ipl') && !keyLower.includes('inquerito') && !keyLower.includes('processo') && matchedType !== 'ipl') {
                                    matchEncontrado = false;
                                    continue;
                                }
                            }

                            matchedRawValue = extractedVal;
                            break;
                        }
                    }
                }

                if (matchEncontrado) {
                    const munId = (tema && tema.municipio_id) || (feat && feat.municipio_id) || (props && props.municipio_id);
                    const mun = municipiosMap[munId];
                    const munNome = mun ? mun.nome : 'Município Não Identificado';
                    const munUf = mun ? (mun.uf || 'PB') : 'PB';
                    const temaNome = tema ? (tema.nome || tema.name || tema.title || 'Camada Sem Nome') : 'Camada Sem Nome';

                    const hasAccess = isSuperAdmin || approvedMunIds.has(munId);

                    matchedItems.push({
                        featureId: feat.id,
                        themeId: feat.theme_id,
                        themeName: temaNome,
                        municipioId: munId,
                        municipioNome: munNome,
                        municipioUf: munUf,
                        matchedFieldLabel: matchedFieldLabel,
                        matchedType: matchedType,
                        matchedRawValue: matchedRawValue,
                        matchedFormattedValue: formatValueByType(matchedRawValue, matchedType),
                        summary: generateFeatureSummary(props),
                        hasAccess: hasAccess
                    });
                }
            });
        }

        matchedItems.sort((a, b) => {
            if (a.hasAccess && !b.hasAccess) return -1;
            if (!a.hasAccess && b.hasAccess) return 1;
            return a.municipioNome.localeCompare(b.municipioNome);
        });

        return {
            items: matchedItems,
            total: matchedItems.length,
            termo: termo,
            tipoEscolhido: tipoEscolhido
        };
    }

    // -------------------------------------------------------------------------
    // 5. Interface Visual do Modal (UI / DOM)
    // -------------------------------------------------------------------------
    let _lastSearchResults = [];

    function ensureModalDom() {
        let modal = document.getElementById('modal-interinstitutional-search');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'modal-interinstitutional-search';
        modal.className = 'fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-md transition-all duration-300 opacity-0 pointer-events-none';
        modal.innerHTML = `
            <div id="interinst-search-card" class="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden transition-all transform scale-95">
                
                <!-- Cabeçalho do Modal -->
                <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white dark:from-slate-800/60 dark:to-slate-900/60 select-none">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-500 shadow-xs">
                            <span class="material-symbols-outlined text-[24px]">manage_search</span>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight">Pesquisa Interinstitucional</h3>
                                <span id="interinst-ente-badge" class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border shadow-2xs">GERAL</span>
                            </div>
                            <p class="text-xs text-slate-500 dark:text-slate-400 font-medium">Localização instantânea de processos e cadastros por tipo de dado em todas as bases</p>
                        </div>
                    </div>
                    <button type="button" onclick="window.interinstitutionalSearch.closeModal()" class="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer">
                        <span class="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <!-- Barra de Pesquisa e Filtros -->
                <div class="p-4 sm:p-5 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-col gap-3">
                    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        
                        <!-- Seletor de Tipo de Dado (Para SuperAdmin ou Geral) -->
                        <div id="interinst-type-selector-container" class="shrink-0 flex items-center">
                            <select id="interinst-type-select" class="h-11 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-cyan-500 outline-none cursor-pointer shadow-xs">
                                <option value="todos">Todos os Registros</option>
                                <option value="ipl">MPF • IPL (Inquérito Policial)</option>
                                <option value="epol">PF • EPOL (Processo Eletrônico)</option>
                                <option value="rip">SPU • RIP (Imóvel Patrimonial)</option>
                            </select>
                        </div>

                        <!-- Campo de Busca -->
                        <div class="relative flex-1">
                            <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
                            <input id="interinst-search-input" type="text" placeholder="Digite o número para pesquisar..." class="w-full h-11 pl-11 pr-10 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all shadow-xs" autocomplete="off">
                            <button id="interinst-search-clear" type="button" onclick="document.getElementById('interinst-search-input').value=''; this.classList.add('hidden');" class="hidden absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <span class="material-symbols-outlined text-[16px]">close</span>
                            </button>
                        </div>

                        <!-- Botão Pesquisar -->
                        <button id="interinst-btn-search" type="button" onclick="window.interinstitutionalSearch.executeSearch()" class="h-11 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-cyan-500/25 transition-all cursor-pointer active:scale-95 shrink-0">
                            <span id="interinst-btn-icon" class="material-symbols-outlined text-[18px]">travel_explore</span>
                            <span>Pesquisar</span>
                        </button>

                    </div>

                    <!-- Dica dinâmica de formato -->
                    <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
                        <span id="interinst-format-hint">Digite o número com ou sem pontuação. O sistema reconhecerá os dígitos automaticamente.</span>
                        <span id="interinst-results-count" class="font-bold text-cyan-600 dark:text-cyan-400 hidden">0 registros encontrados</span>
                    </div>

                </div>

                <!-- Área de Resultados / Tabela / Cards -->
                <div id="interinst-results-container" class="flex-1 overflow-y-auto p-4 sm:p-5 min-h-[300px] max-h-[58vh] flex flex-col gap-3">
                    
                    <!-- Estado Inicial -->
                    <div id="interinst-empty-initial" class="flex flex-col items-center justify-center py-16 text-center select-none">
                        <div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3 border border-slate-200 dark:border-slate-700/60">
                            <span class="material-symbols-outlined text-[32px]">manage_search</span>
                        </div>
                        <h4 class="text-sm font-bold text-slate-700 dark:text-slate-300">Pronto para Pesquisar</h4>
                        <p class="text-xs text-slate-400 max-w-md mt-1">Informe o número do processo, inquérito ou registro imobiliário para varrer todas as bases cartográficas.</p>
                    </div>

                    <!-- Estado Carregando -->
                    <div id="interinst-loading" class="hidden flex-col items-center justify-center py-16 text-center">
                        <div class="w-10 h-10 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p class="text-xs font-semibold text-slate-600 dark:text-slate-300 animate-pulse">Varrendo formulários, camadas e municípios...</p>
                    </div>

                    <!-- Lista de Resultados Renderizada Dinamicamente -->
                    <div id="interinst-results-list" class="hidden flex flex-col gap-2.5"></div>

                </div>

                <!-- Rodapé com Exportação -->
                <div class="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-xs select-none">
                    <span class="text-slate-400 text-[11px]">Sistema de Integração Territorial e Processual</span>
                    <button id="interinst-btn-export" type="button" onclick="window.interinstitutionalSearch.exportToExcel()" class="hidden items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-xs cursor-pointer active:scale-95 text-xs">
                        <span class="material-symbols-outlined text-[16px]">table_view</span>
                        <span>Exportar para Excel (.xlsx)</span>
                    </button>
                </div>

            </div>
        `;

        document.body.appendChild(modal);

        // Eventos de teclado (Enter para buscar, Esc para fechar)
        const input = document.getElementById('interinst-search-input');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    executeSearch();
                }
            });
            input.addEventListener('input', () => {
                const clearBtn = document.getElementById('interinst-search-clear');
                if (clearBtn) clearBtn.classList.toggle('hidden', !input.value);
            });
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('opacity-0')) {
                closeModal();
            }
        });

        return modal;
    }

    function openModal(defaultTerm = '') {
        const modal = ensureModalDom();
        const userProfile = window.currentUserProfile || null;
        const enteConfig = detectUserEnteConfig(userProfile);

        // Atualiza o badge do Ente no Cabeçalho
        const badgeEl = document.getElementById('interinst-ente-badge');
        if (badgeEl) {
            badgeEl.className = `px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border shadow-2xs ${enteConfig.corBadge}`;
            badgeEl.textContent = enteConfig.badgeText;
        }

        // Configura o Seletor de Tipo
        const typeContainer = document.getElementById('interinst-type-selector-container');
        const typeSelect = document.getElementById('interinst-type-select');
        const hintEl = document.getElementById('interinst-format-hint');
        const input = document.getElementById('interinst-search-input');

        if (typeSelect) {
            if (enteConfig.sigla === 'SUPER' || enteConfig.sigla === 'GERAL') {
                if (typeContainer) typeContainer.classList.remove('hidden');
                typeSelect.value = enteConfig.defaultType;
            } else {
                // Usuário de ente específico (MPF, PF, SPU): trava no seu tipo
                if (typeContainer) typeContainer.classList.add('hidden');
                typeSelect.value = enteConfig.defaultType;
            }
        }

        if (input) {
            input.placeholder = enteConfig.placeholder;
            if (defaultTerm) input.value = defaultTerm;
        }

        if (hintEl) {
            if (enteConfig.sigla === 'MPF') {
                hintEl.textContent = 'Padrão MPF / CNJ: Inquérito Policial Federal (20 dígitos). Busca automática por dígitos.';
            } else if (enteConfig.sigla === 'PF') {
                hintEl.textContent = 'Padrão Polícia Federal: Processo / Inquérito Eletrônico (EPOL).';
            } else if (enteConfig.sigla === 'SPU') {
                hintEl.textContent = 'Padrão SPU: Registro Imobiliário Patrimonial (RIP).';
            } else {
                hintEl.textContent = 'Busca ampla por processos judiciais, inquéritos e registros patrimoniais em todas as bases.';
            }
        }

        modal.classList.remove('opacity-0', 'pointer-events-none');
        const card = document.getElementById('interinst-search-card');
        if (card) {
            card.classList.remove('scale-95');
            card.classList.add('scale-100');
        }

        setTimeout(() => {
            if (input) input.focus();
        }, 150);
    }

    function closeModal() {
        const modal = document.getElementById('modal-interinstitutional-search');
        if (!modal) return;
        const card = document.getElementById('interinst-search-card');
        if (card) {
            card.classList.remove('scale-100');
            card.classList.add('scale-95');
        }
        modal.classList.add('opacity-0', 'pointer-events-none');
    }

    async function executeSearch() {
        const input = document.getElementById('interinst-search-input');
        const typeSelect = document.getElementById('interinst-type-select');
        const initialEl = document.getElementById('interinst-empty-initial');
        const loadingEl = document.getElementById('interinst-loading');
        const listEl = document.getElementById('interinst-results-list');
        const countEl = document.getElementById('interinst-results-count');
        const exportBtn = document.getElementById('interinst-btn-export');
        const btnSearch = document.getElementById('interinst-btn-search');
        const btnIcon = document.getElementById('interinst-btn-icon');

        const termo = input ? input.value.trim() : '';
        if (!termo) {
            if (input) input.focus();
            return;
        }

        const tipoDado = typeSelect ? typeSelect.value : 'todos';

        // Mostra estado de carregamento
        if (initialEl) initialEl.classList.add('hidden');
        if (listEl) { listEl.classList.add('hidden'); listEl.innerHTML = ''; }
        if (loadingEl) { loadingEl.classList.remove('hidden'); loadingEl.classList.add('flex'); }
        if (btnSearch) btnSearch.disabled = true;
        if (btnIcon) { btnIcon.textContent = 'progress_activity'; btnIcon.classList.add('animate-spin'); }

        try {
            let client = window.supabaseClient || (typeof globalThis !== 'undefined' && globalThis.supabaseClient) || null;
            if (!client && typeof window !== 'undefined' && window.supabase) {
                try {
                    if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
                        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                            auth: {
                                storage: window.sessionStorage,
                                persistSession: true,
                                autoRefreshToken: true,
                                detectSessionInUrl: true
                            }
                        });
                        window.supabaseClient = client;
                    }
                } catch(eClient) {}
            }

            const userProfile = window.currentUserProfile || window.homeUserProfile || null;
            const todosMunicipios = window.municipiosParaMostrarCache || [];
            const municipiosAprovados = (window.municipiosAprovadosCache || todosMunicipios);

            const result = await searchRecord(termo, {
                supabaseClient: client,
                userProfile: userProfile,
                tipoDado: tipoDado,
                municipiosAprovados: municipiosAprovados,
                todosMunicipios: todosMunicipios
            });

            _lastSearchResults = result.items || [];

            if (loadingEl) { loadingEl.classList.add('hidden'); loadingEl.classList.remove('flex'); }

            if (countEl) {
                countEl.textContent = `${result.total} ${result.total === 1 ? 'registro encontrado' : 'registros encontrados'}`;
                countEl.classList.remove('hidden');
            }

            if (exportBtn) {
                exportBtn.classList.toggle('hidden', result.total === 0 || !window.XLSX);
                exportBtn.classList.toggle('flex', result.total > 0 && !!window.XLSX);
            }

            if (result.total === 0) {
                if (listEl) {
                    listEl.classList.remove('hidden');
                    listEl.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-12 text-center select-none">
                            <span class="material-symbols-outlined text-amber-500 text-[36px] mb-2">search_off</span>
                            <h4 class="text-sm font-bold text-slate-700 dark:text-slate-300">Nenhum Registro Localizado</h4>
                            <p class="text-xs text-slate-400 max-w-sm mt-1">Não foi encontrada nenhuma feição correspondente ao termo "<strong>${escapeHtml(termo)}</strong>" nas bases disponíveis.</p>
                        </div>
                    `;
                }
            } else {
                renderResultsList(result.items, listEl);
            }

        } catch (err) {
            console.error('Erro na pesquisa interinstitucional:', err);
            if (loadingEl) { loadingEl.classList.add('hidden'); loadingEl.classList.remove('flex'); }
            if (listEl) {
                listEl.classList.remove('hidden');
                listEl.innerHTML = `
                    <div class="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                        Erro ao realizar busca: ${escapeHtml(err.message || 'Falha de comunicação com o servidor')}
                    </div>
                `;
            }
        } finally {
            if (btnSearch) btnSearch.disabled = false;
            if (btnIcon) { btnIcon.textContent = 'travel_explore'; btnIcon.classList.remove('animate-spin'); }
        }
    }

    function renderResultsList(items, containerEl) {
        if (!containerEl) return;
        containerEl.classList.remove('hidden');

        containerEl.innerHTML = items.map((item, idx) => {
            const hasAccess = !!item.hasAccess;
            const typeUpper = (item.matchedType || 'REG').toUpperCase();
            
            // Cores por tipo
            let typeBadgeStyle = 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30';
            if (item.matchedType.includes('ipl')) typeBadgeStyle = 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
            else if (item.matchedType.includes('epol')) typeBadgeStyle = 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30';
            else if (item.matchedType.includes('rip')) typeBadgeStyle = 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';

            const accessBadge = hasAccess
                ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Acesso Liberado</span>`
                : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Acesso Restrito</span>`;

            const actionButton = hasAccess
                ? `
                    <button type="button" onclick="window.interinstitutionalSearch.jumpToFeature(${idx})" class="h-9 px-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs hover:shadow-cyan-500/30 transition-all cursor-pointer active:scale-95 shrink-0" title="Abrir feição diretamente no mapa interativo">
                        <span class="material-symbols-outlined text-[16px]">map</span>
                        <span>Abrir no Mapa</span>
                    </button>
                `
                : `
                    <button type="button" onclick="window.interinstitutionalSearch.showAccessDeniedMessage('${escapeHtml(item.municipioNome)}')" class="h-9 px-3.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 font-bold text-xs flex items-center gap-1.5 border border-slate-300/60 dark:border-slate-700/60 cursor-not-allowed shrink-0" title="Você não possui autorização para abrir este município">
                        <span class="material-symbols-outlined text-[16px]">lock</span>
                        <span>Restrito</span>
                    </button>
                `;

            return `
                <div class="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 hover:border-cyan-500/50 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    
                    <div class="flex items-start gap-3 min-w-0 flex-1">
                        <div class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0 border border-slate-200/80 dark:border-slate-700/80">
                            <span class="material-symbols-outlined text-[20px]">layers</span>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2 flex-wrap mb-1">
                                <span class="font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100 truncate">${escapeHtml(item.municipioNome)} / ${escapeHtml(item.municipioUf)}</span>
                                <span class="text-slate-400 text-xs">•</span>
                                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">${escapeHtml(item.themeName)}</span>
                                ${accessBadge}
                            </div>
                            
                            <div class="flex items-center gap-2 flex-wrap text-xs">
                                <span class="px-2 py-0.5 rounded-md font-mono font-bold text-[11px] border ${typeBadgeStyle}">${typeUpper}</span>
                                <span class="font-bold text-slate-900 dark:text-white font-mono text-xs sm:text-sm tracking-wide bg-slate-100 dark:bg-slate-900/60 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-800">${escapeHtml(item.matchedFormattedValue || item.matchedRawValue)}</span>
                                <span class="text-slate-400 text-[11px]">(${escapeHtml(item.matchedFieldLabel)})</span>
                            </div>

                            <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                                ${escapeHtml(item.summary)}
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center justify-end sm:self-center">
                        ${actionButton}
                    </div>

                </div>
            `;
        }).join('');
    }

    function jumpToFeature(itemIndex) {
        const item = _lastSearchResults[itemIndex];
        if (!item) return;

        if (!item.hasAccess) {
            showAccessDeniedMessage(item.municipioNome);
            return;
        }

        // Armazena instrução de pulo direto para ser consumida ao inicializar o mapa
        sessionStorage.setItem('target_feature_jump', JSON.stringify({
            featureId: item.featureId,
            id_banco: item.featureId,
            themeId: item.themeId,
            municipioId: item.municipioId,
            municipioNome: item.municipioNome
        }));

        closeModal();

        // Se a função nativa de abrir município existir em home.html, executa-a
        if (typeof window.abrirMunicipio === 'function') {
            window.abrirMunicipio(item.municipioId, item.municipioNome);
        } else {
            sessionStorage.setItem('municipio_ativo', item.municipioId);
            sessionStorage.setItem('municipio_ativo_nome', item.municipioNome);
            window.location.href = 'index.html';
        }
    }

    function showAccessDeniedMessage(munNome) {
        const msg = `Acesso restrito: Você não possui autorização para acessar a base territorial de ${munNome || 'este município'}. Entre em contato com a administração do sistema para solicitar liberação.`;
        if (typeof window.showWarningToast === 'function') {
            window.showWarningToast(msg);
        } else {
            alert(msg);
        }
    }

    function exportToExcel() {
        if (!_lastSearchResults || _lastSearchResults.length === 0) return;
        if (typeof window.XLSX === 'undefined') {
            alert('Biblioteca Excel não carregada no navegador.');
            return;
        }

        const rows = _lastSearchResults.map(item => ({
            'Município': item.municipioNome,
            'UF': item.municipioUf,
            'Camada Cartográfica': item.themeName,
            'Tipo de Registro': (item.matchedType || '').toUpperCase(),
            'Campo': item.matchedFieldLabel,
            'Valor Localizado': item.matchedFormattedValue || item.matchedRawValue,
            'Resumo da Feição': item.summary,
            'Status de Acesso': item.hasAccess ? 'Liberado' : 'Restrito (Sem Permissão)'
        }));

        const worksheet = window.XLSX.utils.json_to_sheet(rows);
        const workbook = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados');

        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        window.XLSX.writeFile(workbook, `pesquisa_interinstitucional_${dateStr}.xlsx`);
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    return {
        ENTE_CONFIG,
        detectUserEnteConfig,
        digitsOf,
        maskEpol,
        maskRip,
        maskIpl,
        formatValueByType,
        propertyMatchesTerm,
        extractMatchedValue,
        generateFeatureSummary,
        searchRecord,
        openModal,
        closeModal,
        executeSearch,
        jumpToFeature,
        showAccessDeniedMessage,
        exportToExcel
    };
});
