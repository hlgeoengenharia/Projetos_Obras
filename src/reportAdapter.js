// src/reportAdapter.js
// CAMADA DE CONSUMO DESACOPLADA (ADAPTER PATTERN) & PERSISTÊNCIA DE TEMPLATES
// Diretriz de Segurança: Consumo 100% Read-Only de formulários, gráficos, feições e ortofotos existentes.

(function() {
    'use strict';

    const STORAGE_KEY_TEMPLATES = 'constructive_report_templates';
    const STORAGE_KEY_REMOTE_AVAILABLE = 'constructive_remote_templates_available';

    // Recupera do LocalStorage se já foi constatado que a tabela remota relatorios_templates não existe no Supabase
    let isRemoteTemplatesTableAvailable = (function() {
        try {
            const val = localStorage.getItem(STORAGE_KEY_REMOTE_AVAILABLE);
            if (val === 'false') return false;
            if (val === 'true') return true;
        } catch(e) {}
        return null;
    })();

    /**
     * Retorna os campos disponíveis em um formulário para uso em relatórios.
     * @param {string} formId ID do formulário
     * @returns {Array<{id: string, name: string, label: string, type: string, tabTitle: string, tabId: string, isMultiple: boolean}>}
     */
    function getFormFields(formId) {
        if (!formId) return [];
        const formsList = (typeof forms !== 'undefined' && Array.isArray(forms)) ? forms :
            ((typeof allForms !== 'undefined' && Array.isArray(allForms)) ? allForms :
            (typeof window !== 'undefined' && Array.isArray(window.allForms) ? window.allForms :
            (typeof window !== 'undefined' && Array.isArray(window.forms) ? window.forms : [])));
        let targetForm = formsList.find(f => f.id === formId || (typeof isOrcamentoForm === 'function' && isOrcamentoForm(formId) && isOrcamentoForm(f)));
        if (!targetForm && typeof localStorage !== 'undefined') {
            try {
                const storedForms = JSON.parse(localStorage.getItem('constructive_forms') || '[]');
                targetForm = storedForms.find(f => f.id === formId || (typeof isOrcamentoForm === 'function' && isOrcamentoForm(formId) && isOrcamentoForm(f)));
            } catch(e) {}
        }
        
        let tabs = [];
        if (typeof currentFormId !== 'undefined' && currentFormId === formId && typeof builderTabs !== 'undefined' && Array.isArray(builderTabs) && builderTabs.length > 0) {
            tabs = builderTabs;
        } else if (typeof window !== 'undefined' && window.currentFormId === formId && Array.isArray(window.builderTabs) && window.builderTabs.length > 0) {
            tabs = window.builderTabs;
        } else if (targetForm && Array.isArray(targetForm.tabs)) {
            tabs = targetForm.tabs;
        } else if (targetForm && targetForm.schema && Array.isArray(targetForm.schema.tabs)) {
            tabs = targetForm.schema.tabs;
        }

        const fields = [];
        tabs.forEach(tab => {
            (tab.fields || []).forEach(f => {
                if (f && f.id) {
                    fields.push({
                        id: f.id,
                        name: f.name || f.id,
                        label: f.label || f.name || f.id,
                        type: (f.type || 'text').toLowerCase(),
                        tabId: tab.id,
                        tabTitle: tab.title || 'Aba Geral',
                        isMultiple: !!tab.isMultiple,
                        options: f.options || '',
                        condition: f.condition || null,
                        condValue: f.condValue || null,
                        conditionOperator: f.conditionOperator || null,
                        required: !!f.required
                    });
                }
            });
        });
        return fields;
    }

    /**
     * Retorna as abas existentes no formulário para configuração de atalhos e contextos.
     * @param {string} formId ID do formulário
     * @returns {Array<{id: string, title: string, isMultiple: boolean, tabType: string}>}
     */
    function getFormTabs(formId, opts) {
        const includeReportsTab = !!(opts && opts.includeReportsTab);
        if (!formId) return [];
        const formsList = (typeof forms !== 'undefined' && Array.isArray(forms)) ? forms :
            ((typeof allForms !== 'undefined' && Array.isArray(allForms)) ? allForms :
            (typeof window !== 'undefined' && Array.isArray(window.allForms) ? window.allForms :
            (typeof window !== 'undefined' && Array.isArray(window.forms) ? window.forms : [])));
        let targetForm = formsList.find(f => f.id === formId || (typeof isOrcamentoForm === 'function' && isOrcamentoForm(formId) && isOrcamentoForm(f)));
        if (!targetForm && typeof localStorage !== 'undefined') {
            try {
                const storedForms = JSON.parse(localStorage.getItem('constructive_forms') || '[]');
                targetForm = storedForms.find(f => f.id === formId || (typeof isOrcamentoForm === 'function' && isOrcamentoForm(formId) && isOrcamentoForm(f)));
            } catch(e) {}
        }
        
        let tabs = [];
        if (typeof currentFormId !== 'undefined' && currentFormId === formId && typeof builderTabs !== 'undefined' && Array.isArray(builderTabs) && builderTabs.length > 0) {
            tabs = builderTabs;
        } else if (typeof window !== 'undefined' && window.currentFormId === formId && Array.isArray(window.builderTabs) && window.builderTabs.length > 0) {
            tabs = window.builderTabs;
        } else if (targetForm && Array.isArray(targetForm.tabs)) {
            tabs = targetForm.tabs;
        } else if (targetForm && targetForm.schema && Array.isArray(targetForm.schema.tabs)) {
            tabs = targetForm.schema.tabs;
        } else {
            try {
                const storedForms = JSON.parse(localStorage.getItem('constructive_forms') || '[]');
                const found = storedForms.find(f => f.id === formId);
                if (found) {
                    if (Array.isArray(found.tabs)) tabs = found.tabs;
                    else if (found.schema && Array.isArray(found.schema.tabs)) tabs = found.schema.tabs;
                }
            } catch(e) {}
        }

        // a aba de Relatórios (A4) só guarda botões: nunca é fonte de dados de relatório
        return tabs.filter(t => includeReportsTab || !(t && (t.tabType === 'reports' || t.isReportsTab))).map(t => {
            const isConsolidated = t.tabType === 'consolidated' || t.tabType === 'cross_tabs' || !!t.isConsolidated || 
                                   (t.title && (t.title.toUpperCase().includes('HISTÓRICO') || t.title.toUpperCase().includes('HISTORICO')));
            const isMulti = !!t.isMultiple || (t.title && (t.title.toUpperCase().includes('VISTORIA') || t.title.toUpperCase().includes('FOTO') || t.title.toUpperCase().includes('ANEXO')));
            return {
                id: t.id,
                title: t.title || 'Aba Geral',
                isMultiple: isMulti,
                isConsolidated: isConsolidated,
                isReportsTab: t.tabType === 'reports' || !!t.isReportsTab,
                tabType: t.tabType || (isConsolidated ? 'consolidated' : (isMulti ? 'multiple' : 'regular')),
                fields: Array.isArray(t.fields) ? t.fields.map(f => ({
                    id: f.id || f.name,
                    name: f.name || f.id,
                    label: f.label || f.name || f.id,
                    type: f.type || 'text',
                    options: f.options || []
                })) : []
            };
        });
    }

    /**
     * Retorna as abas 1:N e Consolidadas (múltiplos registros/vistorias).
     * @param {string} formId ID do formulário
     * @returns {Array}
     */
    function getMultipleTabs(formId) {
        const allTabs = getFormTabs(formId);
        const multi = allTabs.filter(t => t.isMultiple || t.isConsolidated);
        return multi.length > 0 ? multi : allTabs;
    }

    /**
     * Retorna os gráficos estatísticos já criados no módulo de dashboard do formulário.
     * @param {string} formId ID do formulário
     * @returns {Array<{id: string, title: string, type: string, fieldId: string, fieldLabel: string, colorMap: Object}>}
     */
    function getExistingCharts(formId) {
        if (!formId) return [];
        let rawConfig = [];

        if (typeof currentFormId !== 'undefined' && currentFormId === formId && typeof window._currentFormStatsConfig !== 'undefined' && Array.isArray(window._currentFormStatsConfig)) {
            rawConfig = window._currentFormStatsConfig;
        } else {
            // mesma cadeia de fallback do getFormFields: builder (settings.html) -> app principal (index.html) -> janela
            const formsList = (typeof forms !== 'undefined' && Array.isArray(forms)) ? forms :
                ((typeof allForms !== 'undefined' && Array.isArray(allForms)) ? allForms :
                (typeof window !== 'undefined' && Array.isArray(window.allForms) ? window.allForms :
                (typeof window !== 'undefined' && Array.isArray(window.forms) ? window.forms : [])));
            let targetForm = formsList.find(f => f.id === formId);
            if (!targetForm && typeof localStorage !== 'undefined') {
                try {
                    const storedForms = JSON.parse(localStorage.getItem('constructive_forms') || '[]');
                    targetForm = storedForms.find(f => f.id === formId);
                } catch (e) {}
            }
            if (targetForm && Array.isArray(targetForm.statsConfig)) {
                rawConfig = targetForm.statsConfig;
            }
        }

        const fields = getFormFields(formId);

        return rawConfig.map((item, idx) => {
            const field = fields.find(f => f.id === item.fieldId);
            return {
                id: item.id || `chart_${idx}_${item.fieldId || 'stat'}`,
                title: item.title || (field ? `Distribuição por ${field.label}` : `Gráfico #${idx + 1}`),
                type: item.type || 'pie', // 'pie', 'donut', 'bar', 'indicator'
                fieldId: item.fieldId || '',
                fieldLabel: field ? field.label : (item.fieldId || ''),
                calcMode: item.calcMode || 'all',
                colorMap: item.colorMap || null,
                rawConfig: JSON.parse(JSON.stringify(item))
            };
        });
    }

    /**
     * Consulta registros da camada vinculada ao formulário em modo somente-leitura.
     * @param {string} formId 
     * @param {Object} filters 
     * @returns {Promise<Array<Object>>}
     */
    async function getLayerRecords(formId, filters = {}) {
        if (!formId) return [];

        // 1. Tenta obter feições da camada ativa no mapa principal
        if (window.parent && window.parent.loadedGeojsonLayers && window.parent.loadedGeojsonLayers[formId]) {
            const layer = window.parent.loadedGeojsonLayers[formId];
            if (layer.toGeoJSON) {
                const geo = layer.toGeoJSON();
                if (geo && geo.features) return geo.features.map(f => f.properties || {});
            }
        }

        // 2. Tenta obter da camada ativa em escopo local
        if (typeof loadedGeojsonLayers !== 'undefined' && loadedGeojsonLayers[formId]) {
            const layer = loadedGeojsonLayers[formId];
            if (layer.toGeoJSON) {
                const geo = layer.toGeoJSON();
                if (geo && geo.features) return geo.features.map(f => f.properties || {});
            }
        }

        // 3. Consulta em LocalStorage
        const localDataKey = 'layer_records_' + formId;
        const saved = localStorage.getItem(localDataKey);
        if (saved) {
            try { return JSON.parse(saved); } catch(e) {}
        }

        return [];
    }

    /**
     * Busca ortofotos históricas disponíveis para o município e sobrepostas à feição.
     * @param {string} municipioId 
     * @param {Object} featureGeometry GeoJSON geometry
     * @returns {Promise<Array<Object>>}
     */
    async function getHistoricalOrthophotos(municipioId, featureGeometry = null) {
        let rasters = [];

        // 1. Tenta buscar no Supabase
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                let query = supabaseClient
                    .from('imagens_raster')
                    .select('id, nome, url_imagem, tipo, zoom_min, zoom_max, bbox, created_at, opacidade')
                    .order('created_at', { ascending: false });

                if (municipioId) {
                    query = query.eq('municipio_id', municipioId);
                }

                const { data, error } = await query;
                if (!error && Array.isArray(data)) {
                    rasters = data;
                }
            } catch(e) {
                console.warn('[reportAdapter] Falha na consulta de ortofotos no Supabase:', e);
            }
        }

        // 2. Se vazio, consulta cache local
        if (rasters.length === 0) {
            try {
                const cached = localStorage.getItem('cached_imagens_raster');
                if (cached) rasters = JSON.parse(cached);
            } catch(e) {}
        }

        // Formata datas e metadados
        return rasters.map(r => {
            const dateObj = r.created_at ? new Date(r.created_at) : new Date();
            const ano = dateObj.getFullYear();
            const dataFmt = dateObj.toLocaleDateString('pt-BR');
            return {
                id: r.id,
                nome: r.nome || `Ortofoto ${ano}`,
                ano: ano,
                dataStr: dataFmt,
                url: r.url_imagem,
                tipo: r.tipo || 'xyz_tiles',
                zoomMin: r.zoom_min || 12,
                zoomMax: r.zoom_max || 22,
                bbox: r.bbox || []
            };
        });
    }

    /**
     * Calcula cotas perimetrais (comprimento de cada lado) e área usando Turf.js.
     * @param {Object} geometry GeoJSON Polygon ou MultiPolygon
     * @returns {{areaM2: number, perimetroM: number, segmentos: Array<{id: number, rotulo: string, comprimento: number}>, centroide: {lat: number, lng: number}}}
     */
    function calculateFeatureDimensions(geometry) {
        if (!geometry || !geometry.coordinates) {
            return {
                areaM2: 0,
                perimetroM: 0,
                segmentos: [],
                centroide: { lat: 0, lng: 0 }
            };
        }

        if (typeof turf === 'undefined') {
            return {
                areaM2: 0,
                perimetroM: 0,
                segmentos: [],
                centroide: { lat: 0, lng: 0 }
            };
        }

        try {
            const feature = { type: 'Feature', geometry: geometry, properties: {} };
            const area = turf.area(feature);
            const perimetro = turf.length(feature, { units: 'meters' });
            const centroid = turf.centroid(feature);
            const lat = centroid.geometry.coordinates[1];
            const lng = centroid.geometry.coordinates[0];

            const segmentos = [];
            // Extrai anel exterior do polígono
            const coords = (geometry.type === 'Polygon') 
                ? geometry.coordinates[0] 
                : (geometry.type === 'MultiPolygon' ? geometry.coordinates[0][0] : []);

            if (Array.isArray(coords) && coords.length > 2) {
                for (let i = 0; i < coords.length - 1; i++) {
                    const p1 = coords[i];
                    const p2 = coords[i + 1];
                    const line = turf.lineString([p1, p2]);
                    const dist = turf.length(line, { units: 'meters' });
                    segmentos.push({
                        id: i + 1,
                        rotulo: `L${i + 1}`,
                        comprimento: Number(dist.toFixed(2))
                    });
                }
            }

            return {
                areaM2: Number(area.toFixed(2)),
                perimetroM: Number(perimetro.toFixed(2)),
                segmentos: segmentos,
                centroide: { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }
            };
        } catch(e) {
            console.warn('[reportAdapter] Erro ao calcular dimensões da feição:', e);
            return {
                areaM2: 0,
                perimetroM: 0,
                segmentos: [],
                centroide: { lat: 0, lng: 0 }
            };
        }
    }

    /**
     * Salva um modelo de relatório (ReportTemplate) de forma desacoplada.
     * @param {Object} template 
     */
    async function saveReportTemplate(template) {
        if (!template || !template.form_id) {
            throw new Error('Template inválido: form_id é obrigatório.');
        }

        if (!template.id) {
            template.id = (typeof crypto !== 'undefined' && crypto.randomUUID) 
                ? crypto.randomUUID() 
                : 'rpt_' + Math.random().toString(36).substr(2, 9);
        }
        template.updatedAt = new Date().toISOString();

        // 1. Salva em LocalStorage
        let allTemplates = [];
        try {
            const stored = localStorage.getItem(STORAGE_KEY_TEMPLATES);
            if (stored) allTemplates = JSON.parse(stored);
        } catch(e) {}

        const idx = allTemplates.findIndex(t => t.id === template.id);
        if (idx >= 0) {
            allTemplates[idx] = template;
        } else {
            allTemplates.push(template);
        }
        localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(allTemplates));

        // 2. Persistência remota no Supabase (se disponível e tabela existir)
        if (isRemoteTemplatesTableAvailable !== false && typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { error } = await supabaseClient.from('relatorios_templates').upsert({
                    id: template.id,
                    form_id: template.form_id,
                    nome: template.nome,
                    tipo: template.tipo,
                    disponibilizar_no_mapa: !!template.disponibilizar_no_mapa,
                    config_pagina: packTemplate(template),
                    blocos: template.blocos,
                    updated_at: template.updatedAt
                });

                if (error) {
                    if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST204' || error.code === 'PGRST200' || error.status === 404 || (error.message && error.message.toLowerCase().includes('not found'))) {
                        isRemoteTemplatesTableAvailable = false;
                        try { localStorage.setItem(STORAGE_KEY_REMOTE_AVAILABLE, 'false'); } catch(e) {}
                        console.info('[reportAdapter] Tabela remota "relatorios_templates" não encontrada no Supabase (HTTP 404). Circuito fechado: requisições POST suprimidas e persistência mantida em LocalStorage e forms.schema.');
                    } else {
                        console.warn('[reportAdapter] Aviso ao sincronizar template com Supabase:', error);
                    }
                } else {
                    isRemoteTemplatesTableAvailable = true;
                    try { localStorage.setItem(STORAGE_KEY_REMOTE_AVAILABLE, 'true'); } catch(e) {}
                }
            } catch(remoteErr) {
                isRemoteTemplatesTableAvailable = false;
                try { localStorage.setItem(STORAGE_KEY_REMOTE_AVAILABLE, 'false'); } catch(e) {}
                console.info('[reportAdapter] Tabela remota "relatorios_templates" indisponível. Persistência mantida em LocalStorage.');
            }
        }

        // 3. Fallback inteligente em nuvem: persiste também dentro do forms.schema do Supabase
        saveToFormsTableFallback(template);

        return template;
    }

    // A tabela relatorios_templates só tem colunas para id, form_id, nome, tipo, disponibilizar_no_mapa, config_pagina e blocos.
    // O resto do modelo (ex.: atalho_aba, que diz em qual aba o botão aparece) vai junto, dentro de config_pagina._extras.
    const COLUNAS_MODELO = ['id', 'form_id', 'nome', 'tipo', 'disponibilizar_no_mapa', 'config_pagina', 'blocos', 'updatedAt', 'updated_at', 'created_at'];
    function packTemplate(t) {
        const extras = {};
        Object.keys(t).forEach(k => { if (COLUNAS_MODELO.indexOf(k) < 0) extras[k] = t[k]; });
        return Object.assign({}, t.config_pagina || {}, { _extras: extras });
    }
    function unpackRow(r) {
        const cfg = Object.assign({}, r.config_pagina || {});
        const extras = cfg._extras || {};
        delete cfg._extras;
        return Object.assign({}, extras, { id: r.id, form_id: r.form_id, nome: r.nome, tipo: r.tipo, disponibilizar_no_mapa: !!r.disponibilizar_no_mapa, config_pagina: cfg, blocos: r.blocos || [], updatedAt: r.updated_at });
    }
    const quando = (v) => { const n = Date.parse(v || ''); return isFinite(n) ? n : 0; };

    /**
     * Sincroniza os modelos de relatório com a tabela relatorios_templates (uma vez por carregamento da página).
     * Os modelos moram no navegador de quem os criou; sem isto, outro navegador/aparelho (ou o site publicado) não os enxerga.
     *  - baixa do servidor o que falta aqui ou é mais novo lá;
     *  - envia ao servidor o que só existe aqui ou é mais novo aqui;
     *  - se a tabela foi criada depois de uma tentativa que falhou, o "circuito fechado" é reaberto.
     * Devolve { ok, baixados, enviados } ou { ok: false, motivo }.
     */
    let syncPromise = null;
    async function syncTemplates(opts) {
        if (syncPromise && !(opts && opts.force)) return syncPromise;
        const p = (async () => {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) return { ok: false, motivo: 'sem-cliente' };
            let sessao = null;
            try { sessao = ((await supabaseClient.auth.getSession()) || {}).data; sessao = sessao && sessao.session; } catch (e) { sessao = null; }
            if (!sessao) return { ok: false, motivo: 'sem-sessao' };
            let remoto;
            try {
                const r = await supabaseClient.from('relatorios_templates').select('*');
                if (r.error) {
                    if (isMissingTableError(r.error)) {
                        isRemoteTemplatesTableAvailable = false;
                        try { localStorage.setItem(STORAGE_KEY_REMOTE_AVAILABLE, 'false'); } catch (e) {}
                        return { ok: false, motivo: 'sem-tabela' };
                    }
                    return { ok: false, motivo: 'erro' };
                }
                remoto = r.data || [];
            } catch (e) { return { ok: false, motivo: 'erro' }; }
            isRemoteTemplatesTableAvailable = true;
            try { localStorage.setItem(STORAGE_KEY_REMOTE_AVAILABLE, 'true'); } catch (e) {}

            let locais = [];
            try { locais = JSON.parse(localStorage.getItem(STORAGE_KEY_TEMPLATES) || '[]'); } catch (e) { locais = []; }
            let baixados = 0, enviados = 0;
            const idsRemotos = new Set();
            remoto.forEach(row => {
                idsRemotos.add(row.id);
                const tpl = unpackRow(row);
                const i = locais.findIndex(t => t.id === tpl.id);
                if (i < 0) { locais.push(tpl); baixados++; }
                else if (quando(tpl.updatedAt) > quando(locais[i].updatedAt)) { locais[i] = tpl; baixados++; }
            });
            const remotoPorId = {};
            remoto.forEach(r => { remotoPorId[r.id] = r; });
            for (const t of locais) {
                if (!t || !t.id || !t.form_id) continue;
                const r = remotoPorId[t.id];
                if (r && quando(t.updatedAt) <= quando(r.updated_at)) continue;
                try {
                    const { error } = await supabaseClient.from('relatorios_templates').upsert({
                        id: t.id, form_id: t.form_id, nome: t.nome || 'Relatório', tipo: t.tipo || 'individual', disponibilizar_no_mapa: !!t.disponibilizar_no_mapa,
                        config_pagina: packTemplate(t), blocos: t.blocos || [], updated_at: t.updatedAt || new Date().toISOString()
                    });
                    if (!error) enviados++;
                } catch (e) { /* segue com os outros */ }
            }
            if (baixados) {
                try { localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(locais)); } catch (e) {}
                try { if (typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('report-templates-synced', { detail: { baixados: baixados, enviados: enviados } })); } catch (e) {}
            }
            return { ok: true, baixados: baixados, enviados: enviados };
        })();
        syncPromise = p;
        // sem sessão ou sem cliente ainda: permite tentar de novo depois
        p.then(r => { if (!r.ok && r.motivo !== 'sem-tabela' && syncPromise === p) syncPromise = null; }).catch(() => { if (syncPromise === p) syncPromise = null; });
        return p;
    }

    // tenta ao abrir a página, esperando o login terminar (até ~1 minuto)
    function agendarSync(tentativa) {
        if (typeof setTimeout !== 'function') return;
        const t = setTimeout(async () => {
            let r = { ok: false, motivo: 'erro' };
            try { r = await syncTemplates(); } catch (e) {}
            if (!r.ok && (r.motivo === 'sem-sessao' || r.motivo === 'sem-cliente') && tentativa < 15) agendarSync(tentativa + 1);
        }, tentativa === 0 ? 1500 : 4000);
        if (t && typeof t.unref === 'function') t.unref();
    }

    function saveToFormsTableFallback(template) {
        try {
            if (typeof forms !== 'undefined' && Array.isArray(forms)) {
                const frm = forms.find(f => f.id === template.form_id);
                if (frm) {
                    if (!frm.reportTemplates) frm.reportTemplates = [];
                    const rIdx = frm.reportTemplates.findIndex(rt => rt.id === template.id);
                    if (rIdx >= 0) frm.reportTemplates[rIdx] = template;
                    else frm.reportTemplates.push(template);
                    if (typeof saveFormsToStorage === 'function') {
                        saveFormsToStorage();
                    }
                }
            }
        } catch(eForms) {}
    }

    function resetRemoteTableCheck() {
        isRemoteTemplatesTableAvailable = null;
        try { localStorage.removeItem(STORAGE_KEY_REMOTE_AVAILABLE); } catch(e) {}
        console.info('[reportAdapter] Verificação de relatorios_templates resetada.');
    }

    /**
     * Retorna todos os templates de relatório associados a um formulário.
     * @param {string} formId 
     * @returns {Array<Object>}
     */
    function getReportTemplates(formId) {
        if (!formId) return [];
        let allTemplates = [];
        try {
            const stored = localStorage.getItem(STORAGE_KEY_TEMPLATES);
            if (stored) allTemplates = JSON.parse(stored);
        } catch(e) {}

        return allTemplates.filter(t => t.form_id === formId);
    }

    /**
     * Remove um modelo de relatório.
     * @param {string} templateId 
     */
    async function deleteReportTemplate(templateId) {
        if (!templateId) return;
        let allTemplates = [];
        try {
            const stored = localStorage.getItem(STORAGE_KEY_TEMPLATES);
            if (stored) allTemplates = JSON.parse(stored);
        } catch(e) {}

        allTemplates = allTemplates.filter(t => t.id !== templateId);
        localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(allTemplates));

        if (isRemoteTemplatesTableAvailable !== false && typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                await supabaseClient.from('relatorios_templates').delete().eq('id', templateId);
            } catch(e) {}
        }
    }

    /**
     * Gera um template padrão inicial caso o formulário não tenha nenhum.
     * @param {string} formId 
     * @param {'individual'|'geral'} tipo 
     * @param {string} formName 
     */
    function createDefaultTemplate(formId, tipo = 'individual', formName = 'Formulário') {
        const fields = getFormFields(formId);
        const charts = getExistingCharts(formId);

        if (tipo === 'individual') {
            return {
                id: 'rpt_' + Math.random().toString(36).substr(2, 9),
                nome: `Ficha Individual - ${formName}`,
                tipo: 'individual',
                form_id: formId,
                disponibilizar_no_mapa: true,
                config_pagina: {
                    tamanho: 'A4',
                    orientacao: 'portrait',
                    margem_tipo: 'padrao', // 'padrao', 'estreita', 'personalizada'
                    margens: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
                    margens_mm: { top: 15, bottom: 15, left: 15, right: 15 }
                },
                blocos: [
                    {
                        id: 'blk_header_' + Date.now(),
                        tipo: 'cabecalho',
                        titulo: `FICHA CADASTRAL INDIVIDUAL DO IMÓVEL`,
                        subtitulo: `Prefeitura Municipal • Cadastro & Tributação Territorial`,
                        logo: true,
                        exibirDataHora: true
                    },
                    {
                        id: 'blk_map_' + Date.now(),
                        tipo: 'mapa_estatico',
                        titulo: 'Identificação Cartográfica e Delimitação Geográfica',
                        // padrão do mini-mapa (o usuário ajusta no relatório e salva); ver src/mapTools.js
                        mapa: {
                            destaque: { ativo: true, cor: '#10b981', espessura: 3, preenchimento: 0.35, esmaecerEntorno: false },
                            baseMap: 'osm',
                            camadasVizinhas: true,
                            norte: true,
                            escala: true,
                            projecao: true,
                            alturaMm: 90
                        },
                        notaTecnica: 'Delimitação perimetral georreferenciada em conformidade com a base cartográfica cadastral municipal.'
                    },
                    {
                        id: 'blk_grid_' + Date.now(),
                        tipo: 'grade_campos',
                        titulo: 'Dados Cadastrais Principais',
                        colunasLayout: 2, // 2 ou 3
                        campos_selecionados: fields.slice(0, 8).map(f => f.id)
                    },
                    {
                        id: 'blk_photos_' + Date.now(),
                        tipo: 'galeria_fotos',
                        titulo: 'Vistoria Fotográfica & Anexos',
                        disposicao: '2_cols', // '1_col', '2_cols', 'grid_4'
                        exibirLegenda: true,
                        exibirDataHora: true,
                        exibirCoordenadas: true,
                        limiteFotos: 4
                    },
                    {
                        id: 'blk_footer_' + Date.now(),
                        tipo: 'rodape',
                        numeracao: true,
                        data_emissao: true,
                        texto: 'Documento oficial gerado pelo Sistema GeoGestor de Gestão Territorial.'
                    }
                ]
            };
        } else {
            return {
                id: 'rpt_' + Math.random().toString(36).substr(2, 9),
                nome: `Relatório Geral - ${formName}`,
                tipo: 'geral',
                form_id: formId,
                disponibilizar_no_mapa: false,
                config_pagina: {
                    tamanho: 'A4',
                    orientacao: 'portrait',
                    margem_tipo: 'padrao',
                    margens: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
                    margens_mm: { top: 15, bottom: 15, left: 15, right: 15 }
                },
                blocos: [
                    {
                        id: 'blk_header_' + Date.now(),
                        tipo: 'cabecalho',
                        titulo: `RELATÓRIO CONSOLIDADO E DIAGNÓSTICO TERRITORIAL`,
                        subtitulo: `Secretaria Municipal de Planejamento e Obras • GeoGestão`,
                        logo: true,
                        exibirDataHora: true
                    },
                    {
                        id: 'blk_chart_' + Date.now(),
                        tipo: 'grafico_existente',
                        titulo: charts.length > 0 ? charts[0].title : 'Distribuição Estatística',
                        chart_id: charts.length > 0 ? charts[0].id : '',
                        layout: 'lado_a_lado'
                    },
                    {
                        id: 'blk_footer_' + Date.now(),
                        tipo: 'rodape',
                        numeracao: true,
                        data_emissao: true,
                        texto: 'Diagnóstico territorial consolidado. Integridade assegurada via barramento seguro.'
                    }
                ]
            };
        }
    }

    // =====================================================================================
    // AJUSTES DO USUÁRIO NO RELATÓRIO GERADO (por modelo + feição)
    // Guardados no Supabase (tabela relatorios_ajustes, só o próprio usuário enxerga) e, sempre, no navegador.
    // =====================================================================================
    const STORAGE_KEY_AJUSTES = 'constructive_report_ajustes';
    const STORAGE_KEY_AJUSTES_REMOTE = 'constructive_report_ajustes_remote';
    let isRemoteAjustesTableAvailable = (function() {
        try { if (localStorage.getItem(STORAGE_KEY_AJUSTES_REMOTE) === 'false') return false; } catch(e) {}
        return null;
    })();

    function ajusteId(templateId, featureKey) { return String(templateId) + '|' + String(featureKey); }

    function readLocalAjustes() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY_AJUSTES) || '{}') || {}; } catch(e) { return {}; }
    }

    function isMissingTableError(error) {
        return !!error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST204' || error.code === 'PGRST200' ||
            error.status === 404 || (error.message && error.message.toLowerCase().includes('not found')));
    }

    function remoteAjustesEnabled() {
        return isRemoteAjustesTableAvailable !== false && typeof supabaseClient !== 'undefined' && !!supabaseClient;
    }

    /** Ajustes salvos para este modelo + feição (servidor primeiro; se indisponível, o navegador). */
    async function getAjustes(templateId, featureKey) {
        if (!templateId || !featureKey) return null;
        const local = readLocalAjustes()[ajusteId(templateId, featureKey)] || null;
        if (!remoteAjustesEnabled()) return local;
        try {
            const { data, error } = await supabaseClient.from('relatorios_ajustes').select('ajustes')
                .eq('template_id', String(templateId)).eq('feature_key', String(featureKey)).maybeSingle();
            if (error) {
                if (isMissingTableError(error)) {
                    isRemoteAjustesTableAvailable = false;
                    try { localStorage.setItem(STORAGE_KEY_AJUSTES_REMOTE, 'false'); } catch(e) {}
                }
                return local;
            }
            return (data && data.ajustes) ? data.ajustes : local;
        } catch(e) {
            return local;
        }
    }

    /** Salva os ajustes. Devolve { ok, remoto }: remoto=false quando ficou só neste navegador. */
    async function saveAjustes(templateId, featureKey, formId, ajustes) {
        if (!templateId || !featureKey) return { ok: false, remoto: false };
        try {
            const all = readLocalAjustes();
            all[ajusteId(templateId, featureKey)] = ajustes;
            localStorage.setItem(STORAGE_KEY_AJUSTES, JSON.stringify(all));
        } catch(e) { /* navegador sem armazenamento: segue para o servidor */ }
        if (!remoteAjustesEnabled()) return { ok: true, remoto: false };
        try {
            const { error } = await supabaseClient.from('relatorios_ajustes').upsert({
                template_id: String(templateId),
                feature_key: String(featureKey),
                form_id: formId ? String(formId) : null,
                ajustes: ajustes,
                updated_at: new Date().toISOString()
            }, { onConflict: 'template_id,feature_key,user_id' });
            if (error) {
                if (isMissingTableError(error)) {
                    isRemoteAjustesTableAvailable = false;
                    try { localStorage.setItem(STORAGE_KEY_AJUSTES_REMOTE, 'false'); } catch(e) {}
                } else {
                    console.warn('[reportAdapter] Aviso ao salvar ajustes do relatório:', error);
                }
                return { ok: true, remoto: false };
            }
            return { ok: true, remoto: true };
        } catch(e) {
            return { ok: true, remoto: false };
        }
    }

    // =====================================================================================
    // EMISSÕES: cada vez que o usuário imprime ou exporta, fica registrado protocolo + SHA-256 do conteúdo
    // (tabela relatorios_emissoes no Supabase, com reserva no navegador).
    // =====================================================================================
    const STORAGE_KEY_EMISSOES = 'constructive_report_emissoes';
    const STORAGE_KEY_EMISSOES_REMOTE = 'constructive_report_emissoes_remote';
    let isRemoteEmissoesTableAvailable = (function() {
        try { if (localStorage.getItem(STORAGE_KEY_EMISSOES_REMOTE) === 'false') return false; } catch(e) {}
        return null;
    })();

    /** Registra a emissão. Devolve { ok, remoto }. Emitir de novo o mesmo conteúdo no mesmo dia não duplica. */
    async function registrarEmissao(emissao) {
        if (!emissao || !emissao.protocolo || !emissao.hash) return { ok: false, remoto: false };
        const registro = {
            protocolo: String(emissao.protocolo), hash: String(emissao.hash), template_id: emissao.templateId ? String(emissao.templateId) : null,
            feature_key: emissao.featureKey ? String(emissao.featureKey) : null, form_id: emissao.formId ? String(emissao.formId) : null,
            formato: emissao.formato ? String(emissao.formato) : null
        };
        try {
            const lista = JSON.parse(localStorage.getItem(STORAGE_KEY_EMISSOES) || '[]');
            if (!lista.some(r => r.protocolo === registro.protocolo && r.formato === registro.formato)) {
                lista.push(Object.assign({ emitido_em: new Date().toISOString() }, registro));
                localStorage.setItem(STORAGE_KEY_EMISSOES, JSON.stringify(lista.slice(-200)));
            }
        } catch(e) { /* sem armazenamento local: segue para o servidor */ }
        if (isRemoteEmissoesTableAvailable === false || typeof supabaseClient === 'undefined' || !supabaseClient) return { ok: true, remoto: false };
        try {
            const { error } = await supabaseClient.from('relatorios_emissoes').upsert(registro, { onConflict: 'protocolo,formato,user_id', ignoreDuplicates: true });
            if (error) {
                if (isMissingTableError(error)) {
                    isRemoteEmissoesTableAvailable = false;
                    try { localStorage.setItem(STORAGE_KEY_EMISSOES_REMOTE, 'false'); } catch(e) {}
                }
                return { ok: true, remoto: false };
            }
            return { ok: true, remoto: true };
        } catch(e) {
            return { ok: true, remoto: false };
        }
    }

    // Exportação global desacoplada
    window.ReportAdapter = {
        registrarEmissao,
        getAjustes,
        saveAjustes,
        getFormFields,
        getFormTabs,
        getMultipleTabs,
        getExistingCharts,
        getLayerRecords,
        getHistoricalOrthophotos,
        calculateFeatureDimensions,
        saveReportTemplate,
        getReportTemplates,
        deleteReportTemplate,
        createDefaultTemplate,
        resetRemoteTableCheck,
        syncTemplates
    };
    agendarSync(0);

})();
