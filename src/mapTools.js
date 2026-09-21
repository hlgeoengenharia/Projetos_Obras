// src/mapTools.js
// FERRAMENTAS DO MINI-MAPA DO RELATÓRIO INDIVIDUAL — funções puras (sem DOM), usadas pela página do mapa
// (que monta os dados enviados ao relatório), pelo visualizador e pelos testes em Node.
//
// Configuração do bloco 'mapa_estatico':  bloco.mapa = { ...MAP_DEFAULTS }  (definida no Construtor)
// Ajustes do usuário no relatório gerado: { ...chaves permitidas de MAP_DEFAULTS }  (salvos por relatório + feição)

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MapTools = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const M_PER_DEG_LAT = 111320;
    const CSS_MM_PER_PX = 0.0254 / 96; // metros de 1 px CSS (1/96 pol)

    // ------------------------------------------------------------------ configuração do mapa
    const MAP_DEFAULTS = {
        destaque: { ativo: true, cor: '#10b981', espessura: 3, preenchimento: 0.35, esmaecerEntorno: false, opacidadeEntorno: 0.6 },
        baseMap: 'osm',          // 'osm' | 'satelite' | 'nenhum' | 'ortofoto:<id>' (ortofoto ativa no projeto)
        camadasVizinhas: true,   // permite ao usuário ligar as camadas ativas do mapa
        camadasLigadas: [],      // ids das camadas vizinhas ligadas
        norte: true,
        escala: true,
        projecao: true,
        alturaMm: 90,            // altura do mapa na folha
        vista: null,             // { lat, lng, zoom } salvo pelo usuário; sem ele o mapa enquadra a feição
        medidas: { ativo: true, lados: true, total: true, perimetro: false, estilo: { lados: { n: true, i: false, s: false }, total: { n: true, i: false, s: false }, perimetro: { n: true, i: false, s: false } } }, // o que aparece sobre o mapa e o estilo do texto (negrito, itálico, sublinhado)
        rotacoes: {},            // { idDoTexto: graus } (texto girado pelo usuário; sem ele vale o alinhamento automático)
        edicoes: {},             // { idDaMedida: 'texto que o usuário digitou' }
        posicoes: {},            // { idDaMedida: { lat, lng } } (rótulo arrastado)
        pontos: { ativo: false, sistema: 'utm', tabela: true, memorial: false, ordem: [], titulos: {}, estilo: { n: true, i: false, s: false }, textos: {}, colConf: { ativo: false, camadas: [], tolM: 3, distLogM: 30 }, colunas: {} }, // pontos nos vértices; textos = células e título da tabela editados pelo usuário; colConf = coluna "Confrontantes" da tabela de pontos (camadas e campos escolhidos); colunas = largura (% da tabela) das colunas Distância (dist) e Confrontantes (cf) ajustada pelo usuário
        temporal: { ativo: false, ordem: 'asc', colunas: 2, alturaMm: 70, sincronizar: true, contorno: true, excluidas: [] }, // série de ortofotos por data
        rotulos: { ativo: false, campo: 'rotulo', estilo: { n: true, i: false, s: false }, itens: {} }, // texto sobre as feições vizinhas ('rotulo' = Quadra/Lote; 'titulo' = nome principal); itens = posição/giro ajustados pelo usuário, por 'camada:índice'
        confrontantes: { ativo: false, camada: '', tolM: 3, nomes: false, ordem: [], textos: {} },  // quem faz divisa com cada lado; ordem das linhas e textos (LADO / CONFRONTANTE) editados
        referencia: { ativo: false, camada: '', medidas: [] },                // distância e sobreposição com uma camada de referência (ex.: LPM); medidas = distâncias tiradas pelo usuário { id:'dist:N', a:[lat,lng], b:[lat,lng] }
        comparacaoArea: { ativo: false, campo: '' },                          // área cadastral x área calculada
        situacao: { ativo: false },                                           // mapa de situação (localização) no canto
        quadriculado: { ativo: false, espacamento: 0 },                       // grade de coordenadas UTM (0 = automático)
        anotacoes: [],                                                        // textos livres no mapa: { id, lat, lng, texto }
        elementos: {},                                                        // posição dos elementos sobre o mapa (norte, escala, escalaTexto, projecao, legenda): deslocamento { dx, dy } em fração do tamanho do mapa
        legenda: { nomes: {}, ocultos: [] }                                   // legenda editável: nomes trocados e itens ocultos, por chave ('feicao' | 'c:<camada>')
    };
    const BASE_MAPS = ['osm', 'satelite', 'nenhum'];

    function clamp(n, min, max, fallback) {
        n = Number(n);
        if (!isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    function isHexColor(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c); }

    /** Junta o padrão, o modelo legado (exibirNorte/exibirEscala) e bloco.mapa, sempre com valores válidos. */
    function normalizeMapConfig(bloco) {
        bloco = bloco || {};
        const src = bloco.mapa || {};
        const d = MAP_DEFAULTS;
        const sd = src.destaque || {};
        const legadoNorte = bloco.exibirNorte;
        const legadoEscala = bloco.exibirEscala;
        return {
            destaque: {
                ativo: sd.ativo === undefined ? d.destaque.ativo : !!sd.ativo,
                cor: isHexColor(sd.cor) ? sd.cor : d.destaque.cor,
                espessura: clamp(sd.espessura, 1, 8, d.destaque.espessura),
                preenchimento: clamp(sd.preenchimento, 0, 0.9, d.destaque.preenchimento),
                esmaecerEntorno: !!sd.esmaecerEntorno,
                opacidadeEntorno: clamp(sd.opacidadeEntorno, 0.1, 0.95, d.destaque.opacidadeEntorno)
            },
            baseMap: (BASE_MAPS.includes(src.baseMap) || /^ortofoto:[A-Za-z0-9_.:-]{1,64}$/.test(String(src.baseMap || ''))) ? src.baseMap : d.baseMap,
            camadasVizinhas: src.camadasVizinhas === undefined ? d.camadasVizinhas : !!src.camadasVizinhas,
            camadasLigadas: Array.isArray(src.camadasLigadas) ? src.camadasLigadas.map(String) : [],
            norte: src.norte !== undefined ? !!src.norte : (legadoNorte !== undefined ? !!legadoNorte : d.norte),
            escala: src.escala !== undefined ? !!src.escala : (legadoEscala !== undefined ? !!legadoEscala : d.escala),
            projecao: src.projecao === undefined ? d.projecao : !!src.projecao,
            alturaMm: clamp(src.alturaMm, 40, 400, d.alturaMm), // o limite real de cada folha é aplicado pelo visualizador
            vista: normalizeVista(src.vista),
            medidas: normalizeMedidas(src.medidas),
            edicoes: normalizeEdicoes(src.edicoes),
            posicoes: normalizePosicoes(src.posicoes),
            rotacoes: normalizeRotacoes(src.rotacoes),
            pontos: normalizePontos(src.pontos),
            temporal: normalizeTemporal(src.temporal),
            rotulos: normalizeRotulos(src.rotulos),
            confrontantes: normalizeConfrontantes(src.confrontantes),
            referencia: normalizeReferencia(src.referencia),
            comparacaoArea: normalizeComparacaoArea(src.comparacaoArea),
            situacao: { ativo: !!(src.situacao && src.situacao.ativo) },
            quadriculado: normalizeQuadriculado(src.quadriculado),
            elementos: normalizeElementos(src.elementos),
            legenda: normalizeLegenda(src.legenda),
            anotacoes: normalizeAnotacoes(src.anotacoes)
        };
    }

    const ID_REF = /^[A-Za-z0-9_.:-]{1,64}$/;
    function bool(v, d) { return v === undefined ? d : !!v; }

    const MAX_ITENS_ROTULO = 300;
    function normalizeRotulos(x) {
        x = x || {};
        const itens = {};
        if (x.itens && typeof x.itens === 'object') {
            Object.keys(x.itens).slice(0, MAX_ITENS_ROTULO).forEach(k => {
                const v = x.itens[k];
                if (!/^[A-Za-z0-9_.-]{1,64}:[0-9]{1,5}$/.test(k) || !v || typeof v !== 'object') return;
                const item = {};
                const lat = Number(v.lat), lng = Number(v.lng);
                if (v.lat !== undefined && isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) { item.lat = lat; item.lng = lng; }
                const rot = normalizeRotacoes({ a: v.rot }).a;
                if (v.rot !== undefined && rot !== undefined) item.rot = rot;
                if (item.lat !== undefined || item.rot !== undefined) itens[k] = item;
            });
        }
        return { ativo: bool(x.ativo, false), campo: x.campo === 'titulo' ? 'titulo' : 'rotulo', estilo: normalizeEstilo(x.estilo, MAP_DEFAULTS.rotulos.estilo), itens };
    }
    function normalizeConfrontantes(x) {
        x = x || {};
        const vistos = new Set();
        const ordem = [];
        (Array.isArray(x.ordem) ? x.ordem : []).forEach(id => { if (typeof id === 'string' && /^lado:[0-9]{1,4}$/.test(id) && !vistos.has(id) && ordem.length < 200) { vistos.add(id); ordem.push(id); } });
        const textos = {};
        if (x.textos && typeof x.textos === 'object') {
            Object.keys(x.textos).forEach(k => {
                if (!/^lado:[0-9]{1,4}:(lado|conf)$/.test(k) || typeof x.textos[k] !== 'string') return;
                const txt = x.textos[k].replace(/[\r\n]+/g, ' ').trim().slice(0, 160);
                if (txt) textos[k] = txt;
            });
        }
        return { ativo: bool(x.ativo, false), camada: ID_REF.test(String(x.camada || '')) ? String(x.camada) : '', tolM: clamp(x.tolM, 0.5, 20, 3), nomes: bool(x.nomes, false), ordem, textos };
    }

    /** Aplica a ordem das linhas e os textos editados (LADO / CONFRONTANTE) às linhas calculadas de confrontantes(). */
    function applyConfrontantes(rows, conf) {
        conf = conf || {};
        const ordem = conf.ordem || [];
        const tx = conf.textos || {};
        return rows.map((r, i) => ({ r, i, pos: ordem.indexOf(r.id) }))
            .sort((a, b) => ((a.pos < 0 ? 1e6 : a.pos) - (b.pos < 0 ? 1e6 : b.pos)) || (a.i - b.i))
            .map(x => Object.assign({}, x.r, { lado: tx[x.r.id + ':lado'] || x.r.rotuloLado, confTexto: tx[x.r.id + ':conf'] || '', editados: ['lado', 'conf'].filter(k => tx[x.r.id + ':' + k]) }));
    }
    const ELEMENTOS_MOVEIS = ['norte', 'escala', 'escalaTexto', 'projecao', 'legenda'];
    function normalizeElementos(e) {
        const out = {};
        if (!e || typeof e !== 'object') return out;
        ELEMENTOS_MOVEIS.forEach(k => {
            const v = e[k];
            if (!v || typeof v !== 'object') return;
            const dx = Number(v.dx), dy = Number(v.dy);
            if (!isFinite(dx) || !isFinite(dy) || v.dx === null || v.dy === null) return;
            const a = Math.round(Math.max(-1, Math.min(1, dx)) * 10000) / 10000, b = Math.round(Math.max(-1, Math.min(1, dy)) * 10000) / 10000;
            if (a !== 0 || b !== 0) out[k] = { dx: a, dy: b };
        });
        return out;
    }

    const LEG_KEY = /^(feicao|c:[A-Za-z0-9_.-]{1,64})$/;
    function normalizeLegenda(x) {
        x = x || {};
        const nomes = {};
        if (x.nomes && typeof x.nomes === 'object') {
            Object.keys(x.nomes).slice(0, 60).forEach(k => {
                if (!LEG_KEY.test(k) || typeof x.nomes[k] !== 'string') return;
                const txt = x.nomes[k].replace(/[\r\n]+/g, ' ').trim().slice(0, 60);
                if (txt) nomes[k] = txt;
            });
        }
        const ocultos = [];
        (Array.isArray(x.ocultos) ? x.ocultos : []).forEach(k => { if (typeof k === 'string' && LEG_KEY.test(k) && ocultos.indexOf(k) < 0 && ocultos.length < 60) ocultos.push(k); });
        return { nomes, ocultos };
    }

    const okLatLng = (p) => Array.isArray(p) && p.length === 2 && isFinite(Number(p[0])) && isFinite(Number(p[1])) && Math.abs(Number(p[0])) <= 90 && Math.abs(Number(p[1])) <= 180;
    function normalizeReferencia(x) {
        x = x || {};
        const vistos = new Set();
        const medidas = [];
        (Array.isArray(x.medidas) ? x.medidas : []).forEach(m => {
            if (!m || typeof m.id !== 'string' || !/^dist:[0-9]{1,3}$/.test(m.id) || vistos.has(m.id) || medidas.length >= 20 || !okLatLng(m.a) || !okLatLng(m.b)) return;
            vistos.add(m.id);
            medidas.push({ id: m.id, a: [Number(m.a[0]), Number(m.a[1])], b: [Number(m.b[0]), Number(m.b[1])] });
        });
        return { ativo: bool(x.ativo, false), camada: ID_REF.test(String(x.camada || '')) ? String(x.camada) : '', medidas };
    }
    function normalizeComparacaoArea(x) {
        x = x || {};
        return { ativo: bool(x.ativo, false), campo: ID_REF.test(String(x.campo || '')) ? String(x.campo) : '' };
    }
    function normalizeQuadriculado(x) {
        x = x || {};
        const e = Number(x.espacamento);
        return { ativo: bool(x.ativo, false), espacamento: [10, 20, 50, 100, 200, 500, 1000].indexOf(e) >= 0 ? e : 0 };
    }
    function normalizeAnotacoes(a) {
        const out = [];
        (Array.isArray(a) ? a : []).forEach(x => {
            if (!x || out.length >= 30) return;
            const lat = Number(x.lat), lng = Number(x.lng);
            const texto = String(x.texto === undefined ? '' : x.texto).replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
            if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !texto) return;
            const id = /^a[0-9]{1,4}$/.test(String(x.id)) ? String(x.id) : 'a' + (out.length + 1);
            if (out.some(o => o.id === id)) return;
            const item = { id: id, lat: lat, lng: lng, texto: texto, estilo: normalizeEstilo(x.estilo, MAP_DEFAULTS.rotulos.estilo) };
            const rot = normalizeRotacoes({ a: x.rot }).a;
            if (x.rot !== undefined && rot !== undefined && rot !== 0) item.rot = rot;
            out.push(item);
        });
        return out;
    }

    function normalizeTemporal(x) {
        const d = MAP_DEFAULTS.temporal;
        x = x || {};
        const seen = new Set();
        const excluidas = [];
        (Array.isArray(x.excluidas) ? x.excluidas : []).forEach(v => {
            const s = String(v);
            if (/^[A-Za-z0-9_-]{1,64}$/.test(s) && !seen.has(s) && excluidas.length < 200) { seen.add(s); excluidas.push(s); }
        });
        return {
            ativo: x.ativo === undefined ? d.ativo : !!x.ativo,
            ordem: x.ordem === 'desc' ? 'desc' : 'asc',
            colunas: [1, 2, 3, 4].includes(Number(x.colunas)) ? Number(x.colunas) : d.colunas,
            alturaMm: clamp(x.alturaMm, 40, 160, d.alturaMm),
            sincronizar: x.sincronizar === undefined ? d.sincronizar : !!x.sincronizar,
            contorno: x.contorno === undefined ? d.contorno : !!x.contorno,
            excluidas
        };
    }

    const COORD_SYSTEMS = [
        { id: 'utm', label: 'SIRGAS 2000 / UTM' },
        { id: 'geo_dec', label: 'SIRGAS 2000 geográfica (graus decimais)' },
        { id: 'geo_gms', label: 'SIRGAS 2000 geográfica (graus, minutos e segundos)' },
        { id: 'wgs84_dec', label: 'WGS 84 (graus decimais)' }
    ];
    const MAX_PONTOS = 500;
    const MAX_TITULO = 40;

    function normalizePontos(p) {
        const d = MAP_DEFAULTS.pontos;
        p = p || {};
        const ids = new Set();
        const ordem = [];
        (Array.isArray(p.ordem) ? p.ordem : []).forEach(v => {
            if (typeof v === 'string' && /^v:[0-9]+$/.test(v) && !ids.has(v) && ordem.length < MAX_PONTOS) { ids.add(v); ordem.push(v); }
        });
        const titulos = {};
        if (p.titulos && typeof p.titulos === 'object') {
            Object.keys(p.titulos).forEach(k => {
                if (!/^v:[0-9]+$/.test(k) || typeof p.titulos[k] !== 'string') return;
                const txt = p.titulos[k].replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_TITULO);
                if (txt) titulos[k] = txt;
            });
        }
        // textos da tabela escritos pelo usuário: 'titulo' (cabeçalho da tabela) ou 'v:N:c0..c9 | az | dist' (célula do ponto)
        const textos = {};
        if (p.textos && typeof p.textos === 'object') {
            Object.keys(p.textos).forEach(k => {
                if (!/^(titulo|v:[0-9]+:(c[0-9]|az|dist|or|cf))$/.test(k) || typeof p.textos[k] !== 'string') return;
                // orientação, distância e confrontantes aceitam quebra de linha dentro da célula
                const txt = /:(dist|cf|or)$/.test(k)
                    ? p.textos[k].replace(/\r/g, '').split('\n').map(s => s.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 160)
                    : p.textos[k].replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
                if (txt) textos[k] = txt;
            });
        }
        return {
            ativo: p.ativo === undefined ? d.ativo : !!p.ativo,
            sistema: COORD_SYSTEMS.some(s => s.id === p.sistema) ? p.sistema : d.sistema,
            tabela: p.tabela === undefined ? d.tabela : !!p.tabela,
            memorial: p.memorial === undefined ? d.memorial : !!p.memorial,
            ordem, titulos,
            estilo: normalizeEstilo(p.estilo, d.estilo),
            textos,
            colConf: normalizeColConf(p.colConf),
            colunas: normalizeColunas(p.colunas)
        };
    }

    /** Estilo do texto no mapa: negrito, itálico e sublinhado (o que não vier usa o padrão). */
    function normalizeEstilo(x, def) {
        x = x || {};
        def = def || { n: true, i: false, s: false };
        return { n: x.n === undefined ? !!def.n : !!x.n, i: x.i === undefined ? !!def.i : !!x.i, s: x.s === undefined ? !!def.s : !!x.s };
    }

    /** Largura das colunas ajustáveis da tabela de pontos, em % da tabela (8 a 60). */
    function normalizeColunas(x) {
        const out = {};
        if (!x || typeof x !== 'object') return out;
        ['dist', 'cf'].forEach(k => {
            const v = Number(x[k]);
            if (x[k] !== undefined && x[k] !== null && isFinite(v) && v > 0) out[k] = Math.round(Math.min(60, Math.max(8, v)) * 10) / 10;
        });
        return out;
    }

    /** Coluna "Confrontantes" da tabela de pontos: camadas escolhidas, campos de cada uma e se a camada é de logradouros (ruas à frente). */
    function normalizeColConf(x) {
        x = x || {};
        const vistos = new Set();
        const camadas = [];
        (Array.isArray(x.camadas) ? x.camadas : []).forEach(c => {
            if (!c || typeof c.id !== 'string' || !ID_REF.test(c.id) || vistos.has(c.id) || camadas.length >= 6) return;
            vistos.add(c.id);
            const campos = [];
            (Array.isArray(c.campos) ? c.campos : []).forEach(k => { if (typeof k === 'string' && k.trim() && k.length <= 60 && campos.indexOf(k) < 0 && campos.length < 6) campos.push(k); });
            camadas.push({ id: c.id, campos: campos, logradouro: !!c.logradouro });
        });
        return { ativo: !!x.ativo, camadas, tolM: clamp(x.tolM, 0.5, 20, 3), distLogM: clamp(x.distLogM, 5, 100, 30) };
    }

    function normalizeMedidas(m) {
        const d = MAP_DEFAULTS.medidas;
        m = m || {};
        const est = m.estilo || {};
        return {
            ativo: m.ativo === undefined ? d.ativo : !!m.ativo,
            lados: m.lados === undefined ? d.lados : !!m.lados,
            total: m.total === undefined ? d.total : !!m.total,
            perimetro: m.perimetro === undefined ? d.perimetro : !!m.perimetro,
            estilo: { lados: normalizeEstilo(est.lados, d.estilo.lados), total: normalizeEstilo(est.total, d.estilo.total), perimetro: normalizeEstilo(est.perimetro, d.estilo.perimetro) }
        };
    }

    /** Giro dos textos: graus no intervalo (-180, 180], uma casa decimal. */
    function normalizeRotacoes(p) {
        const out = {};
        if (!p || typeof p !== 'object') return out;
        Object.keys(p).forEach(k => {
            if (!validId(k)) return;
            let g = Number(p[k]);
            if (!isFinite(g)) return;
            g = ((g % 360) + 360) % 360;
            if (g > 180) g -= 360;
            out[k] = Math.round(g * 10) / 10;
        });
        return out;
    }

    const MAX_EDIT_LEN = 60;
    function validId(k) { return typeof k === 'string' && /^[a-z]+(:[0-9]+)?$/.test(k); }

    function normalizeEdicoes(e) {
        const out = {};
        if (!e || typeof e !== 'object') return out;
        Object.keys(e).forEach(k => {
            if (!validId(k) || typeof e[k] !== 'string') return;
            const txt = e[k].replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_EDIT_LEN);
            if (txt) out[k] = txt;
        });
        return out;
    }

    function normalizePosicoes(p) {
        const out = {};
        if (!p || typeof p !== 'object') return out;
        Object.keys(p).forEach(k => {
            if (!validId(k) || !p[k]) return;
            const lat = Number(p[k].lat), lng = Number(p[k].lng);
            if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) out[k] = { lat, lng };
        });
        return out;
    }

    function normalizeVista(v) {
        if (!v || typeof v !== 'object') return null;
        const lat = Number(v.lat), lng = Number(v.lng), zoom = Number(v.zoom);
        if (!isFinite(lat) || !isFinite(lng) || !isFinite(zoom)) return null;
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || zoom < 0 || zoom > 24) return null;
        return { lat, lng, zoom };
    }

    /** Aplica os ajustes salvos pelo usuário sobre a configuração do modelo (só as chaves conhecidas). */
    function mergeAjustes(config, ajustes) {
        if (!ajustes || typeof ajustes !== 'object') return config;
        return normalizeMapConfig({ mapa: Object.assign({}, config, ajustes, {
            destaque: Object.assign({}, config.destaque, ajustes.destaque || {}),
            medidas: Object.assign({}, config.medidas, ajustes.medidas || {}),
            pontos: Object.assign({}, config.pontos, ajustes.pontos || {}),
            temporal: Object.assign({}, config.temporal, ajustes.temporal || {}),
            rotulos: Object.assign({}, config.rotulos, ajustes.rotulos || {}),
            confrontantes: Object.assign({}, config.confrontantes, ajustes.confrontantes || {}),
            referencia: Object.assign({}, config.referencia, ajustes.referencia || {}),
            comparacaoArea: Object.assign({}, config.comparacaoArea, ajustes.comparacaoArea || {}),
            situacao: Object.assign({}, config.situacao, ajustes.situacao || {}),
            quadriculado: Object.assign({}, config.quadriculado, ajustes.quadriculado || {})
        }) });
    }

    // ------------------------------------------------------------------ geometria
    function eachCoord(geom, fn) {
        if (!geom) return;
        if (geom.type === 'Feature') return eachCoord(geom.geometry, fn);
        if (geom.type === 'FeatureCollection') return (geom.features || []).forEach(f => eachCoord(f, fn));
        if (geom.type === 'GeometryCollection') return (geom.geometries || []).forEach(g => eachCoord(g, fn));
        (function walk(c) {
            if (!Array.isArray(c)) return;
            if (typeof c[0] === 'number') { fn(c[0], c[1]); return; }
            c.forEach(walk);
        })(geom.coordinates);
    }

    /** [minLng, minLat, maxLng, maxLat] ou null. */
    function geometryBBox(geom) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        eachCoord(geom, (x, y) => {
            if (!isFinite(x) || !isFinite(y)) return;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        });
        return isFinite(minX) ? [minX, minY, maxX, maxY] : null;
    }

    function bboxCenter(b) { return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null; }

    function expandBBoxMeters(b, meters) {
        const lat = (b[1] + b[3]) / 2;
        const dLat = meters / M_PER_DEG_LAT;
        const dLng = meters / (M_PER_DEG_LAT * Math.max(0.05, Math.cos(lat * Math.PI / 180)));
        return [b[0] - dLng, b[1] - dLat, b[2] + dLng, b[3] + dLat];
    }

    function bboxIntersects(a, b) {
        return !!a && !!b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
    }

    function roundCoords(c, decimals) {
        if (!Array.isArray(c)) return c;
        if (typeof c[0] === 'number') {
            const k = Math.pow(10, decimals);
            return [Math.round(c[0] * k) / k, Math.round(c[1] * k) / k];
        }
        return c.map(x => roundCoords(x, decimals));
    }

    /** Anéis externos de Polygon/MultiPolygon, em [lng, lat] (para "esmaecer o entorno"). */
    function polygonOuterRings(geom) {
        const g = geom && geom.type === 'Feature' ? geom.geometry : geom;
        if (!g) return [];
        if (g.type === 'Polygon') return g.coordinates && g.coordinates[0] ? [g.coordinates[0]] : [];
        if (g.type === 'MultiPolygon') return (g.coordinates || []).map(p => p[0]).filter(Boolean);
        if (g.type === 'GeometryCollection') return (g.geometries || []).reduce((acc, x) => acc.concat(polygonOuterRings(x)), []);
        return [];
    }

    function geomKind(geom) {
        const t = geom && (geom.type === 'Feature' ? geom.geometry && geom.geometry.type : geom.type);
        if (/Polygon/.test(t || '')) return 'polygon';
        if (/LineString/.test(t || '')) return 'line';
        if (/Point/.test(t || '')) return 'point';
        return 'other';
    }

    // ------------------------------------------------------------------ medidas da feição
    const EARTH_R = 6371008.8; // mesmo raio do Turf.js: as medidas batem com as do restante do sistema
    const rad = (d) => d * Math.PI / 180;

    /** Distância em metros entre dois pontos [lng, lat] (haversine). */
    function distanceM(a, b) {
        const dLat = rad(b[1] - a[1]);
        const dLng = rad(b[0] - a[0]);
        const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    }

    function ringAreaM2(coords) {
        const n = coords.length;
        if (n < 3) return 0;
        let total = 0;
        for (let i = 0; i < n; i++) {
            let lo, mid, up;
            if (i === n - 2) { lo = n - 2; mid = n - 1; up = 0; }
            else if (i === n - 1) { lo = n - 1; mid = 0; up = 1; }
            else { lo = i; mid = i + 1; up = i + 2; }
            total += (rad(coords[up][0]) - rad(coords[lo][0])) * Math.sin(rad(coords[mid][1]));
        }
        return Math.abs(total * EARTH_R * EARTH_R / 2);
    }

    /** Área (m²) de um polígono GeoJSON: anel externo menos os furos. */
    function polygonAreaM2(rings) {
        if (!rings || !rings.length) return 0;
        let a = ringAreaM2(rings[0]);
        for (let i = 1; i < rings.length; i++) a -= ringAreaM2(rings[i]);
        return Math.max(0, a);
    }

    function lineLengthM(coords) {
        let s = 0;
        for (let i = 0; i < coords.length - 1; i++) s += distanceM(coords[i], coords[i + 1]);
        return s;
    }

    /** Número no padrão brasileiro: 1.012,40 */
    function fmtNumber(n, casas) {
        const fixed = Math.abs(n).toFixed(casas);
        const parts = fixed.split('.');
        const inteiro = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return (n < 0 && Number(fixed) !== 0 ? '-' : '') + inteiro + (parts[1] ? ',' + parts[1] : '');
    }

    function centroidLngLat(ring) {
        let a = 0, cx = 0, cy = 0;
        for (let i = 0; i < ring.length - 1; i++) {
            const cross = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
            a += cross;
            cx += (ring[i][0] + ring[i + 1][0]) * cross;
            cy += (ring[i][1] + ring[i + 1][1]) * cross;
        }
        if (Math.abs(a) < 1e-18) return bboxCenter(geometryBBox({ type: 'LineString', coordinates: ring }));
        return [cx / (3 * a), cy / (3 * a)];
    }

    function midLatLng(a, b) { return [(a[1] + b[1]) / 2, (a[0] + b[0]) / 2]; }

    /** Ponto (lat, lng) no meio do comprimento de uma linha. */
    function halfwayLatLng(coords) {
        const half = lineLengthM(coords) / 2;
        let acc = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            const seg = distanceM(coords[i], coords[i + 1]);
            if (acc + seg >= half && seg > 0) {
                const k = (half - acc) / seg;
                return [coords[i][1] + (coords[i + 1][1] - coords[i][1]) * k, coords[i][0] + (coords[i + 1][0] - coords[i][0]) * k];
            }
            acc += seg;
        }
        const last = coords[coords.length - 1];
        return [last[1], last[0]];
    }

    /** Giro (graus, sentido horário, texto sempre de cabeça para cima: -90 a 90) que alinha o texto à aresta a→b, em [lng, lat]. */
    function edgeAngleCss(a, b) {
        const dx = b[0] - a[0];
        const dy = (b[1] - a[1]) / Math.cos(rad((a[1] + b[1]) / 2)); // no mapa (Mercator) 1° de latitude pesa 1/cos(lat) a mais na tela
        let ang = -Math.atan2(dy, dx) * 180 / Math.PI;
        if (ang > 90) ang -= 180; else if (ang <= -90) ang += 180;
        return Math.round(ang * 10) / 10;
    }

    /** Afastamento (px de tela) perpendicular à aresta a→b. lado: +1 = para a direita de quem percorre a aresta (fora de um anel anti-horário). */
    function edgeOffsetPx(a, b, lado, px) {
        const dx = b[0] - a[0];
        const dy = (b[1] - a[1]) / Math.cos(rad((a[1] + b[1]) / 2));
        const len = Math.hypot(dx, dy) || 1;
        const nx = dy / len * lado, ny = dx / len * lado; // normal à direita, em coordenadas de tela (y para baixo)
        return [Math.round(nx * px * 10) / 10, Math.round(ny * px * 10) / 10];
    }

    /** Afastamento (px) para o lado de cima da aresta a→b (texto sobre linhas e sobre medidas soltas). */
    function edgeOffsetAbove(a, b, px) {
        return edgeOffsetPx(a, b, edgeOffsetPx(a, b, 1, 1)[1] > 0 ? -1 : 1, px);
    }

    /** Sentido do anel: +1 anti-horário, -1 horário (em lng/lat). */
    function ringSign(ring) {
        let s = 0;
        for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
        return s >= 0 ? 1 : -1;
    }

    const MAX_LADOS = 80; // acima disso os rótulos dos lados viram poluição visual: ficam de fora

    /**
     * Medidas da feição, prontas para virar rótulos no mapa.
     * Devolve { itens, ladosOmitidos }. Cada item:
     *   { id, grupo: 'lados'|'total'|'perimetro', tipo, valor, texto, resumo, pos:[lat,lng], dy, ang?, off? }
     * (lados e trechos trazem ang = giro que alinha o texto à aresta e off = afastamento em px para fora da feição)
     * ids: lado:0.., trecho:0.., area, perimetro, comprimento, coordenada[:k]
     */
    function computeMeasures(geometry) {
        const g = geometry && geometry.type === 'Feature' ? geometry.geometry : geometry;
        const out = { itens: [], ladosOmitidos: false };
        if (!g) return out;
        const polys = g.type === 'Polygon' ? [g.coordinates] : (g.type === 'MultiPolygon' ? g.coordinates : []);
        const lines = g.type === 'LineString' ? [g.coordinates] : (g.type === 'MultiLineString' ? g.coordinates : []);
        const pts = g.type === 'Point' ? [g.coordinates] : (g.type === 'MultiPoint' ? g.coordinates : []);

        if (polys.length) {
            let area = 0, perim = 0, nLados = 0;
            const lados = [];
            polys.forEach(rings => {
                const outer = rings[0] || [];
                const sinal = ringSign(outer); // o texto do lado fica do lado de fora da feição
                area += polygonAreaM2(rings);
                for (let i = 0; i < outer.length - 1; i++) {
                    const d = distanceM(outer[i], outer[i + 1]);
                    perim += d;
                    lados.push({ id: 'lado:' + nLados, grupo: 'lados', tipo: 'lado', valor: d, texto: fmtNumber(d, 2) + ' m', resumo: 'L' + (nLados + 1) + ': ' + fmtNumber(d, 2) + ' m', pos: midLatLng(outer[i], outer[i + 1]), dy: 0, ang: edgeAngleCss(outer[i], outer[i + 1]), off: edgeOffsetPx(outer[i], outer[i + 1], sinal, 9) });
                    nLados++;
                }
            });
            if (lados.length > MAX_LADOS) out.ladosOmitidos = true; else out.itens.push.apply(out.itens, lados);
            const c = centroidLngLat(polys[0][0] || []) || [0, 0];
            out.itens.push({ id: 'area', grupo: 'total', tipo: 'area', valor: area, texto: 'Área ' + fmtNumber(area, 2) + ' m²', resumo: 'Área: ' + fmtNumber(area, 2) + ' m² (' + fmtNumber(area / 10000, 4) + ' ha)', pos: [c[1], c[0]], dy: 0 });
            out.itens.push({ id: 'perimetro', grupo: 'perimetro', tipo: 'perimetro', valor: perim, texto: 'Perím. ' + fmtNumber(perim, 2) + ' m', resumo: 'Perímetro: ' + fmtNumber(perim, 2) + ' m', pos: [c[1], c[0]], dy: 16 });
        } else if (lines.length) {
            let total = 0, nTrechos = 0;
            const trechos = [];
            lines.forEach(coords => {
                total += lineLengthM(coords);
                for (let i = 0; i < coords.length - 1; i++) {
                    const d = distanceM(coords[i], coords[i + 1]);
                    trechos.push({ id: 'trecho:' + nTrechos, grupo: 'lados', tipo: 'trecho', valor: d, texto: fmtNumber(d, 2) + ' m', resumo: 'T' + (nTrechos + 1) + ': ' + fmtNumber(d, 2) + ' m', pos: midLatLng(coords[i], coords[i + 1]), dy: 0, ang: edgeAngleCss(coords[i], coords[i + 1]), off: edgeOffsetAbove(coords[i], coords[i + 1], 9) });
                    nTrechos++;
                }
            });
            if (trechos.length > MAX_LADOS) out.ladosOmitidos = true; else out.itens.push.apply(out.itens, trechos);
            const mid = halfwayLatLng(lines[0]);
            out.itens.push({ id: 'comprimento', grupo: 'total', tipo: 'comprimento', valor: total, texto: 'Comp. ' + fmtNumber(total, 2) + ' m', resumo: 'Comprimento: ' + fmtNumber(total, 2) + ' m', pos: mid, dy: -16 });
        } else if (pts.length) {
            pts.forEach((p, k) => {
                const txt = p[1].toFixed(6) + ', ' + p[0].toFixed(6);
                out.itens.push({ id: pts.length > 1 ? 'coordenada:' + k : 'coordenada', grupo: 'total', tipo: 'coordenada', valor: null, texto: txt, resumo: 'Coordenada: ' + txt, pos: [p[1], p[0]], dy: -16 });
            });
        }
        return out;
    }

    /** Aplica as edições do usuário: cada item ganha { texto, resumo } finais e { editado, padrao }. */
    function applyEdits(itens, edicoes) {
        edicoes = edicoes || {};
        return itens.map(it => {
            const e = edicoes[it.id];
            return Object.assign({}, it, e ? { texto: e, resumo: e, editado: true, padrao: it.texto } : { editado: false, padrao: it.texto });
        });
    }

    // ------------------------------------------------------------------ coordenadas (UTM, graus decimais, GMS)
    const GRS80_A = 6378137;
    const GRS80_F = 1 / 298.257222101;
    const UTM_K0 = 0.9996;

    function utmCentralMeridian(zone) { return (zone - 1) * 6 - 180 + 3; }

    /** lat/lng (graus) → UTM (E, N em metros; SIRGAS 2000/GRS80). Zona automática se não informada. */
    function latLngToUtm(lat, lng, zone) {
        zone = zone || projectionInfo(lat, lng).zone;
        const south = lat < 0;
        const n = GRS80_F / (2 - GRS80_F);
        const A = GRS80_A / (1 + n) * (1 + n * n / 4 + Math.pow(n, 4) / 64);
        const a1 = n / 2 - 2 * n * n / 3 + 5 * Math.pow(n, 3) / 16;
        const a2 = 13 * n * n / 48 - 3 * Math.pow(n, 3) / 5;
        const a3 = 61 * Math.pow(n, 3) / 240;
        const phi = rad(lat);
        const dl = rad(lng - utmCentralMeridian(zone));
        const q = 2 * Math.sqrt(n) / (1 + n);
        const tt = Math.sinh(Math.atanh(Math.sin(phi)) - q * Math.atanh(q * Math.sin(phi)));
        const xi0 = Math.atan2(tt, Math.cos(dl));
        const eta0 = Math.atanh(Math.sin(dl) / Math.sqrt(1 + tt * tt));
        const al = [a1, a2, a3];
        let xi = xi0, eta = eta0;
        al.forEach((a, i) => {
            const j = i + 1;
            xi += a * Math.sin(2 * j * xi0) * Math.cosh(2 * j * eta0);
            eta += a * Math.cos(2 * j * xi0) * Math.sinh(2 * j * eta0);
        });
        return { zone, hemisphere: south ? 'S' : 'N', e: 500000 + UTM_K0 * A * eta, n: UTM_K0 * A * xi + (south ? 10000000 : 0) };
    }

    /** UTM → lat/lng (graus). */
    function utmToLatLng(e, nn, zone, south) {
        const n = GRS80_F / (2 - GRS80_F);
        const A = GRS80_A / (1 + n) * (1 + n * n / 4 + Math.pow(n, 4) / 64);
        const b = [n / 2 - 2 * n * n / 3 + 37 * Math.pow(n, 3) / 96, n * n / 48 + Math.pow(n, 3) / 15, 17 * Math.pow(n, 3) / 480];
        const d = [2 * n - 2 * n * n / 3 - 2 * Math.pow(n, 3), 7 * n * n / 3 - 8 * Math.pow(n, 3) / 5, 56 * Math.pow(n, 3) / 15];
        const xi = (nn - (south ? 10000000 : 0)) / (UTM_K0 * A);
        const eta = (e - 500000) / (UTM_K0 * A);
        let xi1 = xi, eta1 = eta;
        b.forEach((bj, i) => {
            const j = i + 1;
            xi1 -= bj * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
            eta1 -= bj * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
        });
        const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
        let phi = chi;
        d.forEach((dj, i) => { phi += dj * Math.sin(2 * (i + 1) * chi); });
        const lam = rad(utmCentralMeridian(zone)) + Math.atan2(Math.sinh(eta1), Math.cos(xi1));
        return { lat: phi * 180 / Math.PI, lng: lam * 180 / Math.PI };
    }

    function pad2(n) { return n < 10 ? '0' + n : String(n); }

    /** Graus, minutos e segundos: 7° 01' 08,22" S */
    function fmtGms(value, posChar, negChar, casasSeg) {
        casasSeg = casasSeg === undefined ? 2 : casasSeg;
        const abs = Math.abs(value);
        let d = Math.floor(abs);
        let m = Math.floor((abs - d) * 60);
        let s = ((abs - d) * 60 - m) * 60;
        s = Number(s.toFixed(casasSeg));
        if (s >= 60) { s = 0; m += 1; }
        if (m >= 60) { m = 0; d += 1; }
        const sTxt = (s < 10 ? '0' : '') + s.toFixed(casasSeg).replace('.', ',').replace(/^0(\d)/, '0$1');
        return d + '° ' + pad2(m) + "' " + sTxt + '" ' + (value < 0 ? negChar : posChar);
    }

    /** Cabeçalhos das colunas de coordenada para o sistema escolhido. */
    function coordHeaders(sistema, proj) {
        if (sistema === 'utm') return ['E (m)', 'N (m)'];
        return ['Latitude', 'Longitude'];
    }

    /** Células de coordenada (texto) para lat/lng no sistema escolhido. */
    function coordCells(lat, lng, sistema) {
        if (sistema === 'utm') {
            const u = latLngToUtm(lat, lng);
            return [fmtNumber(u.e, 2), fmtNumber(u.n, 2)];
        }
        if (sistema === 'geo_gms') return [fmtGms(lat, 'N', 'S'), fmtGms(lng, 'L', 'O')];
        return [fmtNumber(lat, 6), fmtNumber(lng, 6)]; // geo_dec e wgs84_dec (SIRGAS 2000 e WGS 84 diferem em centímetros)
    }

    function coordSystemLabel(sistema, proj) {
        if (sistema === 'utm') return (proj ? proj.datum + ' / UTM zona ' + proj.zone + proj.hemisphere : 'SIRGAS 2000 / UTM') + (proj && proj.epsg ? ' (EPSG:' + proj.epsg + ')' : '');
        const s = COORD_SYSTEMS.find(x => x.id === sistema);
        return s ? s.label : sistema;
    }

    /** Azimute (graus, 0–360, a partir do Norte no sentido horário) de a para b, ambos [lng, lat]. */
    function azimuthDeg(a, b) {
        const p1 = rad(a[1]), p2 = rad(b[1]), dl = rad(b[0] - a[0]);
        const y = Math.sin(dl) * Math.cos(p2);
        const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function fmtAzimuth(deg) {
        let d = Math.floor(deg);
        let m = Math.floor((deg - d) * 60);
        let s = Math.round(((deg - d) * 60 - m) * 60);
        if (s >= 60) { s = 0; m += 1; }
        if (m >= 60) { m = 0; d += 1; }
        if (d >= 360) d = 0;
        return d + '° ' + pad2(m) + "' " + pad2(s) + '"';
    }

    const MAX_VERTICES = 400; // acima disso os marcadores de vértice ficam de fora (poluição e lentidão)

    /**
     * Vértices da feição: { itens: [{ id:'v:0', lat, lng }], omitidos }. Polígonos: anéis externos sem repetir o ponto de fechamento.
     */
    function vertices(geometry) {
        const all = allVertexList(geometry);
        return all.length > MAX_VERTICES ? { itens: [], omitidos: true, total: all.length } : { itens: all, omitidos: false, total: all.length };
    }

    function defaultPointTitle(i) { return 'P' + (i + 1); }

    /**
     * Linhas da tabela de pontos, na ordem escolhida pelo usuário.
     * Com memorial: azimute e distância até o ponto seguinte (polígono fecha voltando ao primeiro).
     */
    function pointRows(geometry, pontos, opts) {
        opts = opts || {};
        const lista = allVertexList(geometry);
        const byId = {};
        const byPos = {};
        const tamanho = {};
        // com muitos vértices os marcadores ficam de fora, mas os pontos já escolhidos continuam valendo
        lista.forEach(v => { byId[v.id] = v; byPos[v.ring + ':' + v.pos] = v; tamanho[v.ring] = (tamanho[v.ring] || 0) + 1; });
        const bbox = geometryBBox(geometry);
        const c = bbox ? bboxCenter(bbox) : [-34.8, -7];
        const proj = projectionInfo(c[1], c[0]);
        const ordem = (pontos.ordem || []).filter(id => byId[id]);
        const g = geometry && geometry.type === 'Feature' ? geometry.geometry : geometry;
        const fecha = !!g && /Polygon/.test(g.type) && ordem.length >= 3;
        const tx = pontos.textos || {};
        const cc = pontos.colConf || { ativo: false, camadas: [] };
        const colConf = !!(pontos.memorial && cc.ativo);

        // sentido em que a sequência percorre o anel (+1 ou -1); 0 = decidir par a par pelo caminho mais curto
        let sentido = 0;
        if (ordem.length >= 2 && ordem.every(id => byId[id].ring === byId[ordem[0]].ring) && byId[ordem[0]].closed) {
            const n = tamanho[byId[ordem[0]].ring];
            const pares = ordem.map((id, i) => [byId[id], byId[ordem[i + 1] || (fecha ? ordem[0] : id)]]).filter(p => p[0] !== p[1]);
            const frente = pares.reduce((s, p) => s + ((p[1].pos - p[0].pos + n) % n), 0);
            const tras = pares.reduce((s, p) => s + ((p[0].pos - p[1].pos + n) % n), 0);
            if (fecha && frente === n) sentido = 1; else if (fecha && tras === n) sentido = -1;
        }
        // vértices do caminho entre dois pontos escolhidos (inclui os que ficaram de fora)
        const caminho = (a, b) => {
            if (a.ring !== b.ring) return [a, b];
            const n = tamanho[a.ring];
            let dir;
            if (!a.closed) dir = b.pos >= a.pos ? 1 : -1;
            else if (sentido) dir = sentido;
            else dir = ((b.pos - a.pos + n) % n) <= ((a.pos - b.pos + n) % n) ? 1 : -1;
            const out = [a];
            let p = a.pos, guarda = 0;
            while (p !== b.pos && guarda++ <= n) {
                p = a.closed ? (p + dir + n) % n : p + dir;
                const v = byPos[a.ring + ':' + p];
                if (!v) break;
                out.push(v);
            }
            return out;
        };
        const sinalDoAnel = (ringId) => {
            const vs = lista.filter(v => v.ring === ringId);
            let s = 0;
            for (let i = 0; i < vs.length; i++) { const a = vs[i], b = vs[(i + 1) % vs.length]; s += a.lng * b.lat - b.lng * a.lat; }
            return s >= 0 ? 1 : -1;
        };

        const rows = ordem.map((id, i) => {
            const v = byId[id];
            const titulo = (pontos.titulos && pontos.titulos[id]) || defaultPointTitle(i);
            const row = { vid: id, titulo: titulo, lat: v.lat, lng: v.lng, cells: coordCells(v.lat, v.lng, pontos.sistema).map((cel, k) => tx[id + ':c' + k] || cel), editados: [] };
            Object.keys(tx).forEach(k => { if (k.indexOf(id + ':') === 0) row.editados.push(k.slice(id.length + 1)); });
            if (pontos.memorial) {
                const nextId = i < ordem.length - 1 ? ordem[i + 1] : (fecha ? ordem[0] : null);
                const next = nextId ? byId[nextId] : null;
                if (next) {
                    const nextTitulo = (pontos.titulos && pontos.titulos[nextId]) || defaultPointTitle(ordem.indexOf(nextId));
                    const trecho = caminho(v, next);
                    const partes = [];
                    for (let k = 0; k < trecho.length - 1; k++) partes.push(distanceM([trecho[k].lng, trecho[k].lat], [trecho[k + 1].lng, trecho[k + 1].lat]));
                    const total = partes.reduce((s, x) => s + x, 0);
                    row.orientacao = titulo + ' até ' + nextTitulo;
                    row.azimute = fmtAzimuth(azimuthDeg([v.lng, v.lat], [next.lng, next.lat]));
                    row.distPartes = partes;
                    row.distTotal = total;
                    row.intermediarios = trecho.length - 2;
                    // com vértices não escolhidos no meio: cada lado somado, e o total
                    row.distancia = partes.length > 1 && partes.length <= 12
                        ? partes.map(x => fmtNumber(x, 2) + ' m').join(' + ') + ', totalizando ' + fmtNumber(total, 2) + ' m'
                        : fmtNumber(total, 2);
                    row.trecho = trecho.map(t => [t.lng, t.lat]);
                    if (colConf) row.confrontantes = opts.camadas ? confrontantesDoTrecho(row.trecho, opts.camadas, cc, v.closed ? sinalDoAnel(v.ring) : 0) : '';
                } else { row.orientacao = '—'; row.azimute = '—'; row.distancia = '—'; row.confrontantes = ''; }
                if (tx[id + ':or']) row.orientacao = tx[id + ':or'];
                if (tx[id + ':az']) row.azimute = tx[id + ':az'];
                if (tx[id + ':dist']) row.distancia = tx[id + ':dist'];
                if (tx[id + ':cf']) row.confrontantes = tx[id + ':cf'];
            }
            return row;
        });
        return { tituloTabela: (pontos.textos && pontos.textos.titulo) || '', sistema: pontos.sistema, sistemaLabel: coordSystemLabel(pontos.sistema, proj), headers: coordHeaders(pontos.sistema, proj), memorial: !!pontos.memorial, colOrientacao: !!pontos.memorial, colConfrontantes: colConf, fecha: fecha, rows: rows, proj: proj };
    }

    /** n pontos igualmente espaçados ao longo de uma poligonal (coordenadas planas). */
    function sampleAlong(P, n) {
        const lens = [];
        let total = 0;
        for (let i = 0; i < P.length - 1; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); lens.push(l); total += l; }
        if (!(total > 0)) return [P[0]];
        const out = [];
        for (let s = 0; s <= n; s++) {
            let alvo = total * s / n, i = 0;
            while (i < lens.length - 1 && alvo > lens[i]) { alvo -= lens[i]; i++; }
            const k = lens[i] > 0 ? Math.min(1, alvo / lens[i]) : 0;
            out.push([P[i][0] + (P[i + 1][0] - P[i][0]) * k, P[i][1] + (P[i + 1][1] - P[i][1]) * k]);
        }
        return out;
    }

    function nearestPlanar(parts, p) {
        let best = { d: Infinity, q: null };
        const seg = (a, b) => {
            const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
            let k = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
            k = Math.max(0, Math.min(1, k));
            const q = [a[0] + k * dx, a[1] + k * dy];
            const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
            if (d < best.d) best = { d: d, q: q };
        };
        parts.segs.forEach(s => seg(s[0], s[1]));
        parts.pts.forEach(q => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < best.d) best = { d: d, q: q }; });
        return best;
    }

    /** Texto de um confrontante: os campos escolhidos (juntos por " — "); sem campos escolhidos, Quadra/Lote e nome principal. */
    function textoConfrontante(f, campos) {
        const props = (f && f.properties) || {};
        if (campos && campos.length) return campos.map(k => (props.f && props.f[k]) || '').filter(Boolean).join(' — ');
        return [props.r, props.t].filter(Boolean).join(' — ');
    }

    /**
     * Quem confronta um trecho (poligonal entre dois pontos escolhidos, com os vértices do meio).
     * Camadas comuns: feição que fica a até tolM do trecho em, no mínimo, 20% dele. Camadas de logradouros:
     * a feição mais próxima, até distLogM, do lado de fora do trecho (mesmo sem tocar). Sem ninguém: ''.
     * cc = { camadas: [{ id, campos, logradouro }], tolM, distLogM }; sinal = sentido do anel (+1 anti-horário), 0 = sem teste de lado.
     */
    function confrontantesDoTrecho(path, camadas, cc, sinal) {
        if (!path || path.length < 2) return '';
        const proj = localProjector(path[0][1], path[0][0]);
        const P = path.map(proj);
        let comp = 0;
        for (let i = 0; i < P.length - 1; i++) comp += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
        const amostras = sampleAlong(P, Math.max(3, Math.min(60, Math.ceil(comp))));
        const corda = [P[P.length - 1][0] - P[0][0], P[P.length - 1][1] - P[0][1]];
        const tol = cc.tolM === undefined ? 3 : cc.tolM;
        const distLog = cc.distLogM === undefined ? 30 : cc.distLogM;
        const caixa = geometryBBox({ type: 'LineString', coordinates: path });
        const textos = [];
        (cc.camadas || []).forEach(sel => {
            const cam = (camadas || []).find(x => String(x.id) === String(sel.id));
            if (!cam || !Array.isArray(cam.features)) return;
            const raio = sel.logradouro ? distLog : tol;
            const area = expandBBoxMeters(caixa, raio + 1);
            const achados = [];
            cam.features.forEach(f => {
                if (!f || !f.geometry) return;
                const bb = geometryBBox(f.geometry);
                if (!bb || !bboxIntersects(bb, area)) return;
                const parts = planarParts(f.geometry, proj);
                if (!sel.logradouro) {
                    const perto = amostras.filter(p => pointToPartsDist(p, parts) <= tol).length;
                    const fr = perto / amostras.length;
                    if (fr >= 0.2) achados.push({ f: f, chave: fr });
                } else {
                    let melhor = null;
                    amostras.forEach(p => { const n = nearestPlanar(parts, p); if (!melhor || n.d < melhor.d) melhor = { d: n.d, q: n.q }; });
                    if (!melhor || !(melhor.d <= distLog)) return;
                    // rua que só encosta na divisa conta; a que está afastada precisa estar EM FRENTE ao trecho (não além das pontas)
                    // e do lado de fora dele (à direita num anel anti-horário)
                    if (melhor.d > tol) {
                        const c2 = corda[0] * corda[0] + corda[1] * corda[1];
                        const t = c2 > 0 ? ((melhor.q[0] - P[0][0]) * corda[0] + (melhor.q[1] - P[0][1]) * corda[1]) / c2 : 0;
                        if (t < -0.05 || t > 1.05) return;
                        if (sinal) {
                            const lateral = (corda[0] * (melhor.q[1] - P[0][1]) - corda[1] * (melhor.q[0] - P[0][0])) / (Math.sqrt(c2) || 1); // metros; negativo = à direita
                            if (sinal > 0 ? lateral > -0.3 : lateral < 0.3) return;
                        }
                    }
                    achados.push({ f: f, chave: -melhor.d });
                }
            });
            achados.sort((a, b) => b.chave - a.chave);
            let usados = 0;
            achados.forEach(a => {
                const t = textoConfrontante(a.f, sel.campos);
                if (!t || textos.indexOf(t) >= 0 || usados >= (sel.logradouro ? 2 : 4)) return;
                textos.push(t);
                usados++;
            });
        });
        return textos.join('; ');
    }

    function allVertexList(geometry) {
        // mesma numeração de vertices(), sem o limite
        const g = geometry && geometry.type === 'Feature' ? geometry.geometry : geometry;
        const out = [];
        if (!g) return out;
        // ring/pos/closed: em que anel (ou linha) o vértice está, a posição nele e se ele fecha (polígono)
        let rid = -1;
        const push = (c, closed, pos) => out.push({ id: 'v:' + out.length, lat: c[1], lng: c[0], ring: rid, pos: pos, closed: !!closed });
        const ring = (r) => { rid++; const n = r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.length - 1 : r.length; for (let i = 0; i < n; i++) push(r[i], true, i); };
        const line = (l) => { rid++; l.forEach((c, i) => push(c, false, i)); };
        if (g.type === 'Polygon') ring(g.coordinates[0] || []);
        else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => ring(p[0] || []));
        else if (g.type === 'LineString') line(g.coordinates);
        else if (g.type === 'MultiLineString') g.coordinates.forEach(line);
        else if (g.type === 'Point') { rid++; push(g.coordinates, false, 0); }
        else if (g.type === 'MultiPoint') g.coordinates.forEach(c => { rid++; push(c, false, 0); });
        return out;
    }

    // ------------------------------------------------------------------ ortofotos (análise temporal)
    /**
     * Data efetiva de uma ortofoto e a precisão dela — mesma regra do mapa principal (getRasterISODate):
     * data_imagem (ou a guardada no navegador) > data completa no nome > só o ano no nome.
     * Devolve { iso, precisao: 'dia' | 'ano' | null }.
     */
    function rasterDateInfo(r, stored) {
        r = r || {};
        const eff = r.data_imagem || stored;
        if (eff) {
            if (/^\d{4}-\d{2}-\d{2}/.test(String(eff))) return { iso: String(eff).slice(0, 10), precisao: 'dia' };
            const dmy = String(eff).match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
            if (dmy) return { iso: dmy[3] + '-' + dmy[2] + '-' + dmy[1], precisao: 'dia' };
        }
        if (r.nome) {
            const full = String(r.nome).match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
            if (full) return { iso: full[3] + '-' + full[2] + '-' + full[1], precisao: 'dia' };
            const year = String(r.nome).match(/(20\d{2})/);
            if (year) return { iso: year[1] + '-01-01', precisao: 'ano' };
        }
        return { iso: null, precisao: null };
    }

    function fmtRasterDate(info) {
        if (!info || !info.iso) return 'Data não informada';
        if (info.precisao === 'ano') return info.iso.slice(0, 4);
        return info.iso.slice(8, 10) + '/' + info.iso.slice(5, 7) + '/' + info.iso.slice(0, 4);
    }

    /** Coluna e linha do tile (esquema XYZ / Web Mercator) que contém o ponto. */
    function tileXY(lat, lng, z) {
        const n = Math.pow(2, z);
        const x = Math.floor((lng + 180) / 360 * n);
        const latRad = rad(lat);
        const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
    }

    function tileUrl(template, x, y, z) {
        return String(template).replace('{s}', 'a').replace('{z}', z).replace('{x}', x).replace('{y}', y);
    }

    /** Zoom em que se testa se existe imagem: perto do nível mais útil, dentro dos limites da ortofoto. */
    function probeZoom(r) {
        const zmin = Number(r && r.zoomMin) || 12;
        const zmax = Number(r && r.zoomMax) || 22;
        return Math.min(zmax, Math.max(zmin, 17));
    }

    function rasterBBox(bbox) {
        if (!Array.isArray(bbox) || bbox.length !== 2 || !Array.isArray(bbox[0]) || !Array.isArray(bbox[1])) return null;
        const a = Number(bbox[0][0]), b = Number(bbox[0][1]), c = Number(bbox[1][0]), d = Number(bbox[1][1]);
        if (![a, b, c, d].every(isFinite)) return null;
        return [Math.min(b, d), Math.min(a, c), Math.max(b, d), Math.max(a, c)]; // [minLng, minLat, maxLng, maxLat]
    }

    /**
     * Ortofotos que podem cobrir a feição, já com data e precisão. Recebe os registros de imagens_raster
     * (só os que o usuário pode ver). Com bbox conhecido, descarta as que não cruzam a feição; ortofotos em
     * tiles (bbox vazio) ficam com cobertura desconhecida — o relatório testa se há imagem no local.
     * opts: { storedDate(id) => string|null }
     */
    function buildOrtofotoList(rasters, geometry, opts) {
        opts = opts || {};
        const fb = geometryBBox(geometry);
        if (!fb) return [];
        const out = [];
        (rasters || []).forEach(r => {
            if (!r || !r.url_imagem) return;
            const rb = rasterBBox(r.bbox);
            if (rb && !bboxIntersects(rb, fb)) return;
            const info = rasterDateInfo(r, typeof opts.storedDate === 'function' ? opts.storedDate(r.id) : null);
            out.push({
                id: String(r.id), nome: r.nome || 'Ortofoto', dataISO: info.iso, precisao: info.precisao, dataTxt: fmtRasterDate(info),
                url: r.url_imagem, tipo: r.tipo || ((String(r.url_imagem).indexOf('{z}') >= 0) ? 'xyz_tiles' : 'imagem'),
                zoomMin: r.zoom_min || 12, zoomMax: r.zoom_max || 22, bbox: rb ? r.bbox : null,
                opacidade: r.opacidade === undefined || r.opacidade === null ? 1 : Math.min(1, Math.max(0.1, Number(r.opacidade) || 1)),
                coberturaConhecida: !!rb
            });
        });
        return out;
    }

    /** Ordena por data ('asc' = mais antiga primeiro). Sem data vai sempre para o fim. */
    function sortOrtofotos(lista, ordem) {
        const dir = ordem === 'desc' ? -1 : 1;
        return lista.slice().sort((a, b) => {
            if (!a.dataISO && !b.dataISO) return String(a.nome).localeCompare(String(b.nome));
            if (!a.dataISO) return 1;
            if (!b.dataISO) return -1;
            const c = a.dataISO.localeCompare(b.dataISO);
            return c !== 0 ? c * dir : String(a.nome).localeCompare(String(b.nome));
        });
    }

    // ------------------------------------------------------------------ análises espaciais (plano local em metros: vale para distâncias de centenas de metros)
    function localProjector(lat0, lng0) {
        const kx = M_PER_DEG_LAT * Math.cos(rad(lat0));
        return (c) => [(c[0] - lng0) * kx, (c[1] - lat0) * M_PER_DEG_LAT];
    }

    function ptSegDist(p, a, b) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const l2 = dx * dx + dy * dy;
        let k = l2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
        k = Math.max(0, Math.min(1, k));
        return Math.hypot(p[0] - (a[0] + k * dx), p[1] - (a[1] + k * dy));
    }

    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    function segIntersect(a, b, c, d) {
        const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
        return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
    }
    function segSegDist(a, b, c, d) {
        if (segIntersect(a, b, c, d)) return 0;
        return Math.min(ptSegDist(a, c, d), ptSegDist(b, c, d), ptSegDist(c, a, b), ptSegDist(d, a, b));
    }

    function pointInRing(p, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
            if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
    }

    /** Geometria em partes planas: { rings: [anéis externos], segs: [[p,q]...] (contornos e linhas), pts } */
    function planarParts(geometry, proj) {
        const g = geometry && geometry.type === 'Feature' ? geometry.geometry : geometry;
        const out = { rings: [], segs: [], pts: [] };
        if (!g) return out;
        const line = (c) => { const p = c.map(proj); for (let i = 0; i < p.length - 1; i++) out.segs.push([p[i], p[i + 1]]); return p; };
        if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
            (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(poly => poly.forEach((r, i) => { const p = line(r); if (i === 0) out.rings.push(p); }));
        } else if (g.type === 'LineString') line(g.coordinates);
        else if (g.type === 'MultiLineString') g.coordinates.forEach(line);
        else if (g.type === 'Point') out.pts.push(proj(g.coordinates));
        else if (g.type === 'MultiPoint') g.coordinates.forEach(c => out.pts.push(proj(c)));
        return out;
    }

    function insideAny(p, parts) { return parts.rings.some(r => pointInRing(p, r)); }

    /** Distância mínima (m) entre dois conjuntos planares; 0 se se tocam, cruzam ou um contém o outro. */
    function partsDistance(A, B) {
        const pa = A.pts.concat(A.segs.map(s => s[0]));
        const pb = B.pts.concat(B.segs.map(s => s[0]));
        if (pa.some(p => insideAny(p, B)) || pb.some(p => insideAny(p, A))) return 0;
        let best = Infinity;
        A.segs.forEach(s => {
            B.segs.forEach(u => { const d = segSegDist(s[0], s[1], u[0], u[1]); if (d < best) best = d; });
            B.pts.forEach(p => { const d = ptSegDist(p, s[0], s[1]); if (d < best) best = d; });
        });
        A.pts.forEach(p => {
            B.segs.forEach(u => { const d = ptSegDist(p, u[0], u[1]); if (d < best) best = d; });
            B.pts.forEach(q => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < best) best = d; });
        });
        return best;
    }

    /** Distância de um ponto planar até uma geometria (0 se dentro de um polígono). */
    function pointToPartsDist(p, parts) {
        if (insideAny(p, parts)) return 0;
        let best = Infinity;
        parts.segs.forEach(s => { const d = ptSegDist(p, s[0], s[1]); if (d < best) best = d; });
        parts.pts.forEach(q => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < best) best = d; });
        return best;
    }

    function centerProj(geometry) {
        const bb = geometryBBox(geometry) || [0, 0, 0, 0];
        const c = bboxCenter(bb);
        return localProjector(c[1], c[0]);
    }

    /**
     * Quem faz divisa com cada lado do polígono (mesma numeração lado:0, lado:1... das medidas).
     * camada: { features: [{ geometry, properties: { r, t } }] }. Um vizinho conta como confrontante do lado
     * quando pelo menos minFracao do lado está a até tolM metros dele.
     */
    function confrontantes(geometry, camada, opts) {
        opts = opts || {};
        const tol = opts.tolM === undefined ? 3 : opts.tolM;
        const minFr = opts.minFracao === undefined ? 0.2 : opts.minFracao;
        const g = geometry && geometry.type === 'Feature' ? geometry.geometry : geometry;
        const polys = g && g.type === 'Polygon' ? [g.coordinates] : (g && g.type === 'MultiPolygon' ? g.coordinates : []);
        if (!polys.length || !camada || !Array.isArray(camada.features)) return [];
        const proj = centerProj(geometry);
        const viz = camada.features.map(f => ({ f: f, parts: planarParts(f.geometry, proj), bb: geometryBBox(f.geometry) }));
        const rows = [];
        let k = 0;
        polys.forEach(rings => {
            const ring = rings[0] || [];
            for (let i = 0; i < ring.length - 1; i++, k++) {
                const a = ring[i], b = ring[i + 1];
                const len = distanceM(a, b);
                const n = Math.max(2, Math.min(40, Math.ceil(len)));
                const samples = [];
                for (let s = 0; s <= n; s++) samples.push(proj([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]));
                const ex = expandBBoxMeters(geometryBBox({ type: 'LineString', coordinates: [a, b] }), tol + 1);
                const achados = [];
                viz.forEach(v => {
                    if (!bboxIntersects(v.bb, ex)) return;
                    const perto = samples.filter(p => pointToPartsDist(p, v.parts) <= tol).length;
                    const fr = perto / samples.length;
                    if (fr >= minFr) achados.push({ r: (v.f.properties && v.f.properties.r) || '', t: (v.f.properties && v.f.properties.t) || '', fracao: Math.round(fr * 100) / 100 });
                });
                achados.sort((x, y) => y.fracao - x.fracao);
                rows.push({ id: 'lado:' + k, rotuloLado: 'L' + (k + 1), comprimento: len, azimute: azimuthDeg(a, b), confrontantes: achados.slice(0, 4) });
            }
        });
        return rows;
    }

    /**
     * Ponto mais próximo de (lat, lng) sobre o traçado da geometria (contorno do polígono, linha ou o próprio ponto).
     * Devolve { lat, lng, d } (d em metros, plano local) ou null.
     */
    function nearestOnGeometry(geometry, lat, lng) {
        const g = geometry && geometry.type === 'Feature' ? geometry.geometry : geometry;
        if (!g) return null;
        const proj = localProjector(lat, lng);
        let best = null;
        const cand = (a, b) => {
            const pa = proj(a), pb = proj(b);
            const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
            const l2 = dx * dx + dy * dy;
            let k = l2 === 0 ? 0 : -(pa[0] * dx + pa[1] * dy) / l2;
            k = Math.max(0, Math.min(1, k));
            const d = Math.hypot(pa[0] + k * dx, pa[1] + k * dy);
            if (best === null || d < best.d) best = { d: d, lng: a[0] + k * (b[0] - a[0]), lat: a[1] + k * (b[1] - a[1]) };
        };
        const path = (c) => { for (let i = 0; i < c.length - 1; i++) cand(c[i], c[i + 1]); if (c.length === 1) cand(c[0], c[0]); };
        const walk = (geo) => {
            if (!geo) return;
            if (geo.type === 'Polygon') geo.coordinates.forEach(path);
            else if (geo.type === 'MultiPolygon') geo.coordinates.forEach(p => p.forEach(path));
            else if (geo.type === 'LineString') path(geo.coordinates);
            else if (geo.type === 'MultiLineString') geo.coordinates.forEach(path);
            else if (geo.type === 'Point') cand(geo.coordinates, geo.coordinates);
            else if (geo.type === 'MultiPoint') geo.coordinates.forEach(c => cand(c, c));
            else if (geo.type === 'GeometryCollection') (geo.geometries || []).forEach(walk);
        };
        walk(g);
        return best;
    }

    /** Ponto mais próximo de (lat, lng) sobre qualquer feição da camada. */
    function nearestOnCamada(camada, lat, lng) {
        if (!camada || !Array.isArray(camada.features)) return null;
        let best = null;
        camada.features.forEach(f => {
            const p = nearestOnGeometry(f.geometry, lat, lng);
            if (p && (best === null || p.d < best.d)) best = p;
        });
        return best;
    }

    /** Menor distância da feição a qualquer feição da camada de referência (alcance = limite do recorte enviado). */
    function distanciaCamada(geometry, camada) {
        if (!camada || !Array.isArray(camada.features) || !camada.features.length) return null;
        const proj = centerProj(geometry);
        const A = planarParts(geometry, proj);
        let best = null;
        camada.features.forEach(f => {
            const d = partsDistance(A, planarParts(f.geometry, proj));
            if (best === null || d < best.metros) best = { metros: d, r: (f.properties && f.properties.r) || '', t: (f.properties && f.properties.t) || '' };
        });
        return { metros: best.metros, intersecta: best.metros === 0, r: best.r, t: best.t };
    }

    /**
     * Área (m²) da feição que se sobrepõe à camada de referência, e o percentual da feição.
     * Usa o Turf (turf.intersect/turf.area), injetado porque roda no navegador.
     */
    function sobreposicaoCamada(geometry, camada, turf) {
        if (!turf || !camada || !Array.isArray(camada.features)) return null;
        const g = geometry && geometry.type === 'Feature' ? geometry.geometry : geometry;
        if (!g || !/Polygon/.test(g.type)) return null;
        const total = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).reduce((s, r) => s + polygonAreaM2(r), 0);
        let soma = 0;
        camada.features.forEach(f => {
            if (!f.geometry || !/Polygon/.test(f.geometry.type)) return;
            try {
                const inter = turf.intersect({ type: 'Feature', properties: {}, geometry: g }, { type: 'Feature', properties: {}, geometry: f.geometry });
                if (inter) soma += turf.area(inter);
            } catch (e) { /* geometria inválida: ignora */ }
        });
        return { areaM2: soma, pct: total > 0 ? soma / total * 100 : 0, totalM2: total };
    }

    /** Número digitado no formato brasileiro ou cru ('1.234,56' | '720.62' | 550,26). */
    function parseNumeroBR(v) {
        if (typeof v === 'number') return isFinite(v) ? v : null;
        let s = String(v === undefined || v === null ? '' : v).trim().replace(/[^0-9,.\-]/g, '');
        if (!s) return null;
        if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
        const n = parseFloat(s);
        return isFinite(n) ? n : null;
    }

    /** Área cadastral x calculada. alerta = diferença acima da tolerância (%). */
    function compararAreas(cadastroRaw, calculadaM2, tolPct) {
        const cad = parseNumeroBR(cadastroRaw);
        if (cad === null || !(calculadaM2 >= 0)) return null;
        const dif = calculadaM2 - cad;
        const pct = cad > 0 ? dif / cad * 100 : null;
        return { cadastro: cad, calculada: calculadaM2, diferenca: dif, pct: pct, alerta: pct === null ? false : Math.abs(pct) > (tolPct === undefined ? 1 : tolPct) };
    }

    // ------------------------------------------------------------------ quadriculado UTM
    function autoGridSpacing(extentM) {
        const alvo = extentM / 5;
        const opcoes = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
        let best = opcoes[0];
        opcoes.forEach(o => { if (Math.abs(o - alvo) < Math.abs(best - alvo)) best = o; });
        return best;
    }

    /**
     * Linhas do quadriculado UTM sobre o retângulo [minLng,minLat,maxLng,maxLat].
     * Devolve { espacamento, zona, linhas: [{ tipo:'e'|'n', valor, pts:[[lat,lng]...] }] }
     */
    function gradeUTM(bbox, espacamento) {
        const c = bboxCenter(bbox);
        const pj = projectionInfo(c[1], c[0]);
        const south = c[1] < 0;
        const cantos = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]].map(p => latLngToUtm(p[1], p[0], pj.zone));
        const es = cantos.map(u => u.e), ns = cantos.map(u => u.n);
        const eMin = Math.min.apply(null, es), eMax = Math.max.apply(null, es), nMin = Math.min.apply(null, ns), nMax = Math.max.apply(null, ns);
        const esp = espacamento || autoGridSpacing(Math.max(eMax - eMin, nMax - nMin));
        const linhas = [];
        const passos = 6;
        for (let e = Math.ceil(eMin / esp) * esp; e <= eMax && linhas.length < 80; e += esp) {
            const pts = [];
            for (let i = 0; i <= passos; i++) { const ll = utmToLatLng(e, nMin + (nMax - nMin) * i / passos, pj.zone, south); pts.push([ll.lat, ll.lng]); }
            linhas.push({ tipo: 'e', valor: e, pts: pts });
        }
        for (let n = Math.ceil(nMin / esp) * esp; n <= nMax && linhas.length < 160; n += esp) {
            const pts = [];
            for (let i = 0; i <= passos; i++) { const ll = utmToLatLng(eMin + (eMax - eMin) * i / passos, n, pj.zone, south); pts.push([ll.lat, ll.lng]); }
            linhas.push({ tipo: 'n', valor: n, pts: pts });
        }
        return { espacamento: esp, zona: pj.zone, linhas: linhas };
    }

    // ------------------------------------------------------------------ projeção e escala
    /** Zona UTM e identificação do sistema (SIRGAS 2000 no Brasil). */
    function projectionInfo(lat, lng) {
        const zone = Math.min(60, Math.max(1, Math.floor((lng + 180) / 6) + 1));
        const south = lat < 0;
        const hem = south ? 'S' : 'N';
        const emBrasil = lng >= -74 && lng <= -32 && lat >= -34 && lat <= 6;
        let epsg = null;
        if (emBrasil) {
            if (south && zone >= 17 && zone <= 25) epsg = 31960 + zone;
            else if (!south && zone >= 11 && zone <= 22) epsg = 31954 + zone;
        }
        const datum = emBrasil ? 'SIRGAS 2000' : 'WGS 84';
        return {
            zone, hemisphere: hem, epsg, datum,
            label: datum + ' / UTM zona ' + zone + hem,
            short: datum + ' UTM ' + zone + hem
        };
    }

    /** Denominador da escala (1:N) para um zoom Web Mercator na latitude dada, a 96 dpi. */
    function scaleDenominator(zoom, lat) {
        const mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
        return mpp / CSS_MM_PER_PX; // (m no terreno por px) ÷ (m de um px na tela)
    }

    /** Arredonda para uma escala "redonda" (1, 2, 2,5, 5 × 10^n). */
    function niceScale(n) {
        if (!(n > 0)) return 1;
        const p = Math.pow(10, Math.floor(Math.log10(n)));
        const m = n / p;
        const steps = [1, 2, 2.5, 5, 10];
        let best = steps[0];
        steps.forEach(s => { if (Math.abs(s - m) < Math.abs(best - m)) best = s; });
        return Math.round(best * p);
    }

    /** Escala aproximada com 2 algarismos significativos (o mapa na tela não tem escala exata). */
    function approxScale(n) {
        if (!(n > 0)) return 1;
        const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
        return Math.round(n / p) * p;
    }

    function formatScale(n) {
        return '1:' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    // ------------------------------------------------------------------ camadas ativas do mapa → relatório
    function featureKey(props) {
        props = props || {};
        const k = props.id_banco !== undefined && props.id_banco !== null ? props.id_banco : props._tempId;
        return k === undefined || k === null ? '' : String(k);
    }

    /**
     * Camadas ATIVAS no mapa (theme.visible !== false) e que o usuário pode ver, recortadas ao redor da feição.
     * Só geometria vai para o relatório (sem atributos), com coordenadas arredondadas, para caber no envio.
     * opts: { bufferM=400, maxPerLayer=1500, canSee(themeId)=>bool, excludeKey }
     */
    function collectNearbyLayers(themes, geometry, opts) {
        opts = opts || {};
        const bbox = geometryBBox(geometry);
        if (!bbox) return [];
        const area = expandBBoxMeters(bbox, opts.bufferM === undefined ? 400 : opts.bufferM);
        const max = opts.maxPerLayer || 1500;
        const out = [];
        (themes || []).forEach(theme => {
            if (!theme || theme.visible === false) return;
            if (typeof opts.canSee === 'function' && !opts.canSee(theme.id)) return;
            const feats = [];
            let total = 0;
            // campos disponíveis para a coluna Confrontantes e seus valores (só perto da feição e só se a página do mapa liberou)
            const campos = typeof opts.fieldsFn === 'function' ? (opts.fieldsFn(theme) || []).slice(0, 40) : [];
            const areaDados = expandBBoxMeters(bbox, opts.dataBufferM === undefined ? 80 : opts.dataBufferM);
            (theme.features || []).forEach(f => {
                if (!f || !f.geometry) return;
                if (opts.excludeKey && featureKey(f.properties) === opts.excludeKey) return;
                const fb = geometryBBox(f.geometry);
                if (!bboxIntersects(fb, area)) return;
                total++;
                if (feats.length < max) {
                    // rótulos (r = Quadra/Lote, t = nome principal) só vêm se a página do mapa os liberou para este usuário
                    const props = {};
                    if (typeof opts.labelFn === 'function') {
                        const l = opts.labelFn(theme, f) || {};
                        if (l.r) props.r = String(l.r).slice(0, 40);
                        if (l.t) props.t = String(l.t).slice(0, 60);
                    }
                    if (campos.length && typeof opts.valuesFn === 'function' && bboxIntersects(fb, areaDados)) {
                        const vals = opts.valuesFn(theme, f, campos) || {};
                        const enxuto = {};
                        Object.keys(vals).forEach(k => { const s = String(vals[k] === undefined || vals[k] === null ? '' : vals[k]).replace(/\s+/g, ' ').trim(); if (s) enxuto[k] = s.slice(0, 80); });
                        if (Object.keys(enxuto).length) props.f = enxuto;
                    }
                    feats.push({ type: 'Feature', properties: props, geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates, 6) } });
                }
            });
            if (feats.length) {
                out.push({
                    id: String(theme.id), name: theme.name || 'Camada', color: isHexColor(theme.color) ? theme.color : '#0284c7',
                    kind: geomKind(feats[0].geometry), features: feats, truncated: total > feats.length,
                    campos: campos
                });
            }
        });
        return out;
    }

    return {
        MAP_DEFAULTS, BASE_MAPS,
        normalizeMapConfig, mergeAjustes, normalizeColConf, confrontantesDoTrecho, normalizeElementos, normalizeLegenda, applyConfrontantes, nearestOnGeometry, nearestOnCamada, edgeOffsetAbove, normalizeEstilo, normalizeRotacoes, edgeAngleCss, edgeOffsetPx,
        geometryBBox, bboxCenter, expandBBoxMeters, bboxIntersects, roundCoords, geomKind,
        normalizeTemporal, rasterDateInfo, fmtRasterDate, tileXY, tileUrl, probeZoom, rasterBBox, buildOrtofotoList, sortOrtofotos,
        COORD_SYSTEMS, normalizePontos, latLngToUtm, utmToLatLng, fmtGms, coordHeaders, coordCells, coordSystemLabel, azimuthDeg, fmtAzimuth, vertices, defaultPointTitle, pointRows,
        localProjector, confrontantes, distanciaCamada, sobreposicaoCamada, parseNumeroBR, compararAreas, autoGridSpacing, gradeUTM, normalizeAnotacoes, normalizeRotulos, normalizeConfrontantes, normalizeReferencia, normalizeComparacaoArea, normalizeQuadriculado,
        distanceM, ringAreaM2, polygonAreaM2, lineLengthM, fmtNumber, computeMeasures, applyEdits, normalizeMedidas, normalizeEdicoes, normalizePosicoes,
        projectionInfo, scaleDenominator, niceScale, approxScale, formatScale, polygonOuterRings, normalizeVista,
        featureKey, collectNearbyLayers
    };
});
