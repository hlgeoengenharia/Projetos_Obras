// src/layerFilter.js
// FILTRO PROFISSIONAL DE FEIÇÕES: combina várias condições de campo com E dentro de cada grupo, e OU entre grupos —
// por exemplo (Recuou = Sim E Fase = Arquivado) OU (Situação = Irregular). Usado pelo painel "Filtrar Registros"
// do mapa e pelo construtor do Relatório Geral (mesmo filtro, mesma contagem de resultados nos dois lugares).
//
// Funções puras (sem DOM): testáveis em Node. Roda também no navegador (index.html e settings.html).

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./fieldFormatter.js'));
    } else {
        root.LayerFilter = factory(root.FieldFormatter);
    }
})(typeof self !== 'undefined' ? self : this, function (FF) {
    'use strict';

    const MAX_GRUPOS = 10;
    const MAX_CONDICOES = 10;

    /** Tipo do campo para escolher os operadores certos e como comparar o valor. */
    function tipoDoCampo(field) {
        if (!field) return 'texto';
        const t = FF ? FF.canonicalType(field) : String((field && field.type) || 'text').toLowerCase();
        if (['number', 'integer', 'currency', 'area_m2', 'length_m', 'volume_m3'].includes(t)) return 'numero';
        if (['date', 'current_date'].includes(t)) return 'data';
        if (['select', 'radio', 'checkbox', 'boolean'].includes(t)) return 'lista';
        return 'texto';
    }

    /** Operadores válidos para cada tipo de campo, na ordem em que aparecem no seletor. */
    const OPERADORES_POR_TIPO = {
        texto: ['igual', 'contem', 'comeca_com', 'diferente', 'vazio', 'preenchido'],
        numero: ['igual', 'diferente', 'maior', 'menor', 'entre', 'vazio', 'preenchido'],
        data: ['igual', 'diferente', 'maior', 'menor', 'entre', 'vazio', 'preenchido'],
        lista: ['igual', 'diferente', 'vazio', 'preenchido']
    };

    const ROTULO_OPERADOR = {
        igual: 'é igual a', contem: 'contém', comeca_com: 'começa com', diferente: 'é diferente de',
        maior: 'maior que', menor: 'menor que', entre: 'entre', vazio: 'está vazio', preenchido: 'está preenchido'
    };

    function operadoresValidos(tipo) {
        return OPERADORES_POR_TIPO[tipo] || OPERADORES_POR_TIPO.texto;
    }

    function normalizeTexto(s) {
        return String(s === undefined || s === null ? '' : s)
            .normalize('NFKD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().trim();
    }

    function paraNumero(v) {
        if (v === undefined || v === null || v === '') return NaN;
        if (typeof v === 'number') return v;
        return FF ? FF.parseLocalNumber(v) : parseFloat(String(v).replace(',', '.'));
    }

    /** Data em epoch (ms); aceita 'AAAA-MM-DD', ISO completo ou objeto Date. NaN se não der para entender. */
    function paraData(v) {
        if (v === undefined || v === null || v === '') return NaN;
        if (v instanceof Date) return v.getTime();
        const s = String(v).trim();
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
        if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const t = Date.parse(s);
        return isFinite(t) ? t : NaN;
    }

    function vazio(v) {
        if (FF) return FF.isEmptyValue(v);
        return v === undefined || v === null || v === '';
    }

    /**
     * Uma condição normalizada: { field, op, value, value2 }.
     * value2 só é usado por "entre" (valor final da faixa).
     */
    function normalizeCondicao(c) {
        c = c || {};
        const field = String(c.field || c.campo || '').trim();
        const op = String(c.op || c.operador || 'contem').trim();
        return { field: field, op: op, value: c.value === undefined ? (c.valor === undefined ? '' : c.valor) : c.value, value2: c.value2 === undefined ? (c.valor2 === undefined ? '' : c.valor2) : c.value2 };
    }

    /** Um grupo normalizado: condições (até MAX_CONDICOES) unidas por E. Condições sem campo são descartadas. */
    function normalizeGrupo(g) {
        const condicoes = (Array.isArray(g && g.condicoes) ? g.condicoes : Array.isArray(g) ? g : [])
            .map(normalizeCondicao)
            .filter(c => c.field)
            .slice(0, MAX_CONDICOES);
        return { condicoes: condicoes };
    }

    /**
     * Filtro normalizado: grupos (até MAX_GRUPOS) unidos por OU; cada grupo, suas condições unidas por E.
     * Grupos sem nenhuma condição válida são descartados. Aceita `{ grupos: [...] }` ou uma lista solta de condições
     * (vira um único grupo, para compatibilidade com o filtro simples que já existe no painel do mapa).
     */
    function normalizeFiltro(f) {
        if (!f || typeof f !== 'object') return { grupos: [] };
        const bruto = Array.isArray(f.grupos) ? f.grupos : (Array.isArray(f) ? [{ condicoes: f }] : (Array.isArray(f.condicoes) ? [f] : []));
        const grupos = bruto.map(normalizeGrupo).filter(g => g.condicoes.length > 0).slice(0, MAX_GRUPOS);
        return { grupos: grupos };
    }

    /** Sem nenhum grupo (ou nenhuma condição em nenhum grupo): filtro "vazio", que não restringe nada. */
    function filtroVazio(filtro) {
        return !filtro || !Array.isArray(filtro.grupos) || filtro.grupos.length === 0;
    }

    /**
     * Avalia uma condição contra o valor bruto de um campo.
     * fieldDef (opcional): definição do campo (para o tipo certo e comparação numérica/data correta).
     */
    function avaliarCondicao(valorBruto, condicao, fieldDef) {
        const tipo = tipoDoCampo(fieldDef);
        const op = condicao.op;
        if (op === 'vazio') return vazio(valorBruto);
        if (op === 'preenchido') return !vazio(valorBruto);

        if (tipo === 'numero') {
            const a = paraNumero(valorBruto), b = paraNumero(condicao.value);
            if (!isFinite(a)) return false;
            if (op === 'igual') return isFinite(b) && a === b;
            if (op === 'diferente') return !isFinite(b) || a !== b;
            if (op === 'maior') return isFinite(b) && a > b;
            if (op === 'menor') return isFinite(b) && a < b;
            if (op === 'entre') { const c = paraNumero(condicao.value2); return isFinite(b) && isFinite(c) && a >= Math.min(b, c) && a <= Math.max(b, c); }
            return false;
        }
        if (tipo === 'data') {
            const a = paraData(valorBruto), b = paraData(condicao.value);
            if (!isFinite(a)) return false;
            if (op === 'igual') return isFinite(b) && a === b;
            if (op === 'diferente') return !isFinite(b) || a !== b;
            if (op === 'maior') return isFinite(b) && a > b;
            if (op === 'menor') return isFinite(b) && a < b;
            if (op === 'entre') { const c = paraData(condicao.value2); return isFinite(b) && isFinite(c) && a >= Math.min(b, c) && a <= Math.max(b, c); }
            return false;
        }
        // texto e lista: compara o texto normalizado (sem acento, minúsculo)
        const a = normalizeTexto(vazio(valorBruto) ? '' : valorBruto);
        const b = normalizeTexto(condicao.value);
        if (op === 'igual') return a === b;
        if (op === 'diferente') return a !== b;
        if (op === 'contem') return b !== '' && a.includes(b);
        if (op === 'comeca_com') return b !== '' && a.startsWith(b);
        return false;
    }

    /**
     * Avalia uma feição (objeto de propriedades) contra o filtro inteiro: E dentro do grupo, OU entre grupos.
     * fieldIndex (opcional): { [fieldId]: fieldDef } para tipo/comparação correta de cada campo.
     */
    function avaliarFeature(props, filtro, fieldIndex) {
        if (filtroVazio(filtro)) return true;
        props = props || {};
        fieldIndex = fieldIndex || {};
        return filtro.grupos.some(g => g.condicoes.every(c => avaliarCondicao(props[c.field], c, fieldIndex[c.field])));
    }

    /** Filtra a lista de feições (cada uma com .properties, como no GeoJSON). Devolve as que casam com o filtro. */
    function filtrarFeatures(features, filtro, fieldIndex) {
        return (Array.isArray(features) ? features : []).filter(f => avaliarFeature(f && f.properties, filtro, fieldIndex));
    }

    /** Valores distintos (texto de exibição, já formatado pelo tipo do campo) de um campo entre as feições dadas. */
    function valoresDistintos(features, fieldId, fieldDef, limite) {
        const vistos = new Set();
        (Array.isArray(features) ? features : []).forEach(f => {
            const v = f && f.properties ? f.properties[fieldId] : undefined;
            if (vazio(v)) return;
            const texto = FF && fieldDef ? FF.toText(v, fieldDef) : String(v);
            if (texto && texto !== (FF ? FF.EMPTY : '—')) vistos.add(texto);
        });
        return Array.from(vistos).sort((a, b) => a.localeCompare(b, 'pt-BR')).slice(0, limite || 500);
    }

    /** Texto do rótulo de um operador, para exibir na tela ou no resumo do filtro. */
    function rotuloOperador(op) { return ROTULO_OPERADOR[op] || op; }

    /** Descrição em texto do filtro inteiro, para mostrar no relatório (o que foi filtrado). fieldIndex: { id: fieldDef }. */
    function descreverFiltro(filtro, fieldIndex) {
        if (filtroVazio(filtro)) return '';
        fieldIndex = fieldIndex || {};
        const rotuloCampo = (id) => (fieldIndex[id] && (fieldIndex[id].label || fieldIndex[id].name)) || id;
        const condTexto = (c) => {
            const nome = rotuloCampo(c.field);
            if (c.op === 'vazio' || c.op === 'preenchido') return `${nome} ${rotuloOperador(c.op)}`;
            if (c.op === 'entre') return `${nome} ${rotuloOperador(c.op)} ${c.value} e ${c.value2}`;
            return `${nome} ${rotuloOperador(c.op)} ${c.value}`;
        };
        return filtro.grupos.map(g => {
            const texto = g.condicoes.map(condTexto).join(' E ');
            return g.condicoes.length > 1 ? `(${texto})` : texto;
        }).join(' OU ');
    }

    return {
        MAX_GRUPOS, MAX_CONDICOES,
        tipoDoCampo, operadoresValidos, rotuloOperador,
        normalizeCondicao, normalizeGrupo, normalizeFiltro, filtroVazio,
        avaliarCondicao, avaliarFeature, filtrarFeatures,
        valoresDistintos, descreverFiltro
    };
});
