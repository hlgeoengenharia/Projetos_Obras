// src/reportData.js
// CAMADA DE DADOS DOS RELATÓRIOS — guiada pelo SCHEMA do formulário (abas e campos reais).
//
//  • Abas visíveis: aplica a permissão de aba e a condição da aba (mesma regra do card do mapa).
//  • Registros: aba 1:N → cada item do array; aba 1:1 → um registro com os campos da aba.
//  • Colunas de tabela: os CAMPOS que o usuário escolheu (por id). Nenhuma regra de ente/órgão
//    ("MPF", "PF", "SPU"...) no código: a origem de cada linha é o TÍTULO da aba.
//
// Roda no navegador (página do mapa e visualizador) e no Node (testes).

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./fieldFormatter.js'));
    } else {
        root.ReportData = factory(root.FieldFormatter);
    }
})(typeof self !== 'undefined' ? self : this, function (FF) {
    'use strict';

    const EMPTY = '—';

    const isEmpty = (v) => (FF ? FF.isEmptyValue(v) : (v === undefined || v === null || v === ''));

    /** Texto sem acento, minúsculo, só letras/números separados por espaço (para comparação exata). */
    function norm(s) {
        return String(s === undefined || s === null ? '' : s)
            .normalize('NFKD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    // ------------------------------------------------------------------ abas
    function isNativeTab(tab) {
        return !!(tab && (tab.isNative || tab.tabType === 'orcamento_nativo' || tab.id === 'orcamento_obra'));
    }

    function isConsolidatedTab(tab) {
        return !!(tab && (tab.tabType === 'consolidated' || tab.isConsolidated));
    }

    /**
     * Condição da aba — mesma regra do card (formRenderer.js): { enabled, fieldId, operator, value }.
     * 'equals' compara com o valor esperado; 'not_equals' exige valor preenchido e diferente.
     * Operador desconhecido esconde a aba (como o card faz).
     */
    function evaluateTabCondition(tab, data) {
        const c = tab && tab.condition;
        if (!c || !c.enabled || !c.fieldId) return true;
        const raw = data ? data[c.fieldId] : undefined;
        const val = String(raw === undefined || raw === null ? '' : raw).toLowerCase().trim();
        const expected = String(c.value || '').toLowerCase();
        const op = c.operator || 'equals';
        if (op === 'equals') return val === expected;
        if (op === 'not_equals') return val !== expected && val !== '';
        return false;
    }

    /**
     * Abas que o usuário pode ver e cuja condição está satisfeita.
     * opts.canSeeTab(tab) → boolean (na página do mapa: window.canSeeFormTab).
     */
    function visibleTabs(tabs, data, opts) {
        opts = opts || {};
        return (Array.isArray(tabs) ? tabs : []).filter(tab => {
            if (!tab || isNativeTab(tab)) return false;
            if (typeof opts.canSeeTab === 'function' && !opts.canSeeTab(tab)) return false;
            return evaluateTabCondition(tab, data);
        });
    }

    /** Cópia dos dados SEM as chaves das abas ocultas (id da aba 1:N e ids dos campos da aba). */
    function filterData(data, allTabs, shownTabs) {
        const out = Object.assign({}, data || {});
        const shown = new Set((shownTabs || []).map(t => t.id));
        (allTabs || []).forEach(tab => {
            if (!tab || shown.has(tab.id)) return;
            delete out[tab.id];
            (tab.fields || []).forEach(f => { if (f && f.id) delete out[f.id]; });
        });
        return out;
    }

    /** id do campo → { field, tab } */
    function buildFieldIndex(tabs) {
        const index = {};
        (tabs || []).forEach(tab => {
            (tab.fields || []).forEach(f => { if (f && f.id) index[f.id] = { field: f, tab }; });
        });
        return index;
    }

    // ------------------------------------------------------------------ registros
    function parseRecords(val) {
        let v = val;
        if (typeof v === 'string') {
            try { v = JSON.parse(v); } catch (e) { v = []; }
        }
        return Array.isArray(v) ? v.filter(r => r && typeof r === 'object') : [];
    }

    function toTimestamp(v) {
        if (isEmpty(v)) return -Infinity;
        const s = String(v).trim();
        const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
        if (br) return new Date(+br[3], +br[2] - 1, +br[1], +(br[4] || 0), +(br[5] || 0)).getTime();
        const t = Date.parse(s);
        return isNaN(t) ? -Infinity : t;
    }

    function formatDateText(v) {
        if (isEmpty(v)) return EMPTY;
        return FF ? FF.formatDate(v) : String(v);
    }

    function makeRecord(tab, values, index, single) {
        const dateField = (tab.fields || []).find(f => String(f.type || '').toLowerCase() === 'date');
        const rawDate = dateField && !isEmpty(values[dateField.id]) ? values[dateField.id] : values._created_at;
        return {
            tabId: tab.id,
            tabTitle: String(tab.title || tab.name || tab.id),
            tab,
            values,
            single: !!single,
            index,
            timestamp: toTimestamp(rawDate),
            dateText: formatDateText(rawDate)
        };
    }

    /**
     * Registros das abas.
     *  • opts.tabIds vazio/ausente → todas as abas 1:N.
     *  • opts.tabIds com ids     → exatamente essas abas (1:N ou 1:1).
     * Abas 1:1 geram UM registro (com os campos da aba) se houver algum valor.
     * Abas consolidadas e a aba nativa de orçamento não são fontes.
     */
    function buildRecords(tabs, data, opts) {
        opts = opts || {};
        data = data || {};
        const selected = Array.isArray(opts.tabIds) && opts.tabIds.length
            ? new Set(opts.tabIds.map(String)) : null;
        const out = [];
        (tabs || []).forEach(tab => {
            if (!tab || isNativeTab(tab) || isConsolidatedTab(tab)) return;
            if (selected && !selected.has(String(tab.id))) return;
            if (!selected && !tab.isMultiple) return;
            if (tab.isMultiple) {
                parseRecords(data[tab.id]).forEach((rec, i) => out.push(makeRecord(tab, rec, i, false)));
            } else {
                const rec = {};
                let hasValue = false;
                (tab.fields || []).forEach(f => {
                    if (!f || !f.id) return;
                    if (data[f.id] !== undefined) rec[f.id] = data[f.id];
                    if (!isEmpty(data[f.id])) hasValue = true;
                });
                if (hasValue) out.push(makeRecord(tab, rec, 0, true));
            }
        });
        return out;
    }

    /** Ordena por data (order 'asc'|'desc'); com groupByTab agrupa pela ordem das abas (tabOrder ou do schema). */
    function sortRecords(records, order, groupByTab, tabOrder) {
        const dir = order === 'asc' ? 1 : -1;
        const list = records.slice();
        const byDate = (a, b) => {
            const d = (a.timestamp === b.timestamp) ? 0 : (a.timestamp < b.timestamp ? -1 : 1);
            return d !== 0 ? d * dir : (a.index - b.index);
        };
        if (!groupByTab) return list.sort(byDate);
        const order2 = (Array.isArray(tabOrder) && tabOrder.length)
            ? tabOrder.map(String)
            : Array.from(new Set(records.map(r => String(r.tabId))));
        const rank = (r) => { const i = order2.indexOf(String(r.tabId)); return i < 0 ? order2.length : i; };
        return list.sort((a, b) => (rank(a) - rank(b)) || byDate(a, b));
    }

    // ------------------------------------------------------------------ colunas
    const BUILTIN = {
        aba:  { label: 'Aba / Ente' },
        org:  { label: 'Órgão / Entidade' },
        data: { label: 'Data', labels: ['data', 'data da vistoria', 'data da visita', 'data do registro'] },
        situacao_ocupacao: { label: 'Situação da Ocupação', labels: ['situacao da ocupacao', 'ocupacao'] },
        situacao_recuo:    { label: 'Situação do Recuo', labels: ['situacao do recuo', 'recuo'] },
        area_invadida:     { label: 'Área Invadida', labels: ['area invadida', 'area invadida m2'] },
        conclusao:         { label: 'Conclusão', labels: ['conclusao', 'conclusao da vistoria', 'parecer', 'parecer tecnico', 'observacoes', 'observacao', 'relato'] },
        links:             { label: 'Processos / Links', labels: ['processos oficiais hiperlinks', 'links', 'processos'] },
        qtd_fotos:         { label: 'Fotos / Anexos' }
    };

    const colId = (col) => (col && typeof col === 'object') ? col.id : col;

    function columnLabel(col, fieldIndex) {
        if (col && typeof col === 'object' && col.label) return col.label;
        const id = colId(col);
        if (BUILTIN[id]) return BUILTIN[id].label;
        const ref = fieldIndex && fieldIndex[id];
        return ref ? (ref.field.label || ref.field.name || id) : String(id);
    }

    /** Campo do registro (na aba dele) que corresponde à coluna. Só compara dentro da própria aba. */
    function fieldForColumn(col, record, fieldIndex) {
        const id = colId(col);
        const candidates = (col && typeof col === 'object' && Array.isArray(col.fieldIds) && col.fieldIds.length)
            ? col.fieldIds : [id];
        for (const fid of candidates) {
            const ref = fieldIndex[fid];
            if (ref && String(ref.tab.id) === String(record.tabId)) return ref.field;
        }
        // Colunas legadas: procura, DENTRO DA ABA DO REGISTRO, um campo cujo rótulo seja exatamente um dos nomes
        const legacy = BUILTIN[id];
        if (legacy && legacy.labels) {
            const wanted = new Set(legacy.labels);
            return (record.tab.fields || []).find(f => wanted.has(norm(f.label || f.name))) || null;
        }
        return null;
    }

    function countFiles(record, types) {
        let n = 0;
        (record.tab.fields || []).forEach(f => {
            if (types.includes(String(f.type || '').toLowerCase()) && FF) {
                n += FF.parseFiles(record.values[f.id]).length;
            }
        });
        return n;
    }

    /**
     * Célula de tabela para (coluna, registro): { text, html }.
     * ctx: { fieldIndex, geometryCenter }
     */
    function cellFor(col, record, ctx) {
        const id = colId(col);
        const dash = { text: EMPTY, html: EMPTY };
        if (id === 'aba' || id === 'org') {
            return { text: record.tabTitle, html: FF ? FF.escapeHtml(record.tabTitle) : record.tabTitle };
        }
        if (id === 'qtd_fotos') {
            const fotos = countFiles(record, ['photo']);
            const anexos = countFiles(record, ['attachment']);
            const parts = [];
            if (fotos) parts.push(`${fotos} foto(s)`);
            if (anexos) parts.push(`${anexos} anexo(s)`);
            const t = parts.length ? parts.join(' + ') : EMPTY;
            return { text: t, html: t };
        }
        const field = fieldForColumn(col, record, ctx.fieldIndex || {});
        if (!field) {
            if (id === 'data' && record.dateText !== EMPTY) return { text: record.dateText, html: record.dateText };
            return dash;
        }
        const value = record.values[field.id];
        if (!FF) return { text: isEmpty(value) ? EMPTY : String(value), html: isEmpty(value) ? EMPTY : String(value) };
        const opts = { geometryCenter: ctx.geometryCenter };
        return { text: FF.toText(value, field, opts), html: FF.toHtml(value, field, opts) };
    }

    // ------------------------------------------------------------------ campos e fotos de um registro
    /** Campos da aba do registro, na ordem do schema. Com `onlyIds`, restringe aos ids escolhidos. */
    function recordFields(record, onlyIds) {
        const fields = record.tab.fields || [];
        if (!Array.isArray(onlyIds) || !onlyIds.length) return fields;
        const wanted = new Set(onlyIds.map(String));
        return fields.filter(f => wanted.has(String(f.id)));
    }

    /** Fotos do registro (campos do tipo 'photo'), sem as excluídas. */
    function recordPhotos(record) {
        const out = [];
        (record.tab.fields || []).forEach(f => {
            if (String(f.type || '').toLowerCase() !== 'photo' || !FF) return;
            FF.parseFiles(record.values[f.id]).forEach(file => {
                out.push({
                    url: file.url,
                    title: file.title || file.name || '',
                    date: file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString('pt-BR') : '',
                    author: file.uploadedBy || '',
                    field: f.label || f.name || ''
                });
            });
        });
        return out;
    }

    return {
        EMPTY,
        norm,
        isNativeTab,
        isConsolidatedTab,
        evaluateTabCondition,
        visibleTabs,
        filterData,
        buildFieldIndex,
        parseRecords,
        buildRecords,
        sortRecords,
        columnLabel,
        fieldForColumn,
        cellFor,
        recordFields,
        recordPhotos
    };
});
