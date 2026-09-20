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
        destaque: { ativo: true, cor: '#10b981', espessura: 3, preenchimento: 0.35, esmaecerEntorno: false },
        baseMap: 'osm',          // 'osm' | 'satelite' | 'nenhum'
        camadasVizinhas: true,   // permite ao usuário ligar as camadas ativas do mapa
        camadasLigadas: [],      // ids das camadas vizinhas ligadas
        norte: true,
        escala: true,
        projecao: true,
        alturaMm: 90,            // altura do mapa na folha
        vista: null,             // { lat, lng, zoom } salvo pelo usuário; sem ele o mapa enquadra a feição
        medidas: { ativo: true, lados: true, total: true, perimetro: false }, // o que aparece sobre o mapa
        edicoes: {},             // { idDaMedida: 'texto que o usuário digitou' }
        posicoes: {}             // { idDaMedida: { lat, lng } } (rótulo arrastado)
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
                esmaecerEntorno: !!sd.esmaecerEntorno
            },
            baseMap: BASE_MAPS.includes(src.baseMap) ? src.baseMap : d.baseMap,
            camadasVizinhas: src.camadasVizinhas === undefined ? d.camadasVizinhas : !!src.camadasVizinhas,
            camadasLigadas: Array.isArray(src.camadasLigadas) ? src.camadasLigadas.map(String) : [],
            norte: src.norte !== undefined ? !!src.norte : (legadoNorte !== undefined ? !!legadoNorte : d.norte),
            escala: src.escala !== undefined ? !!src.escala : (legadoEscala !== undefined ? !!legadoEscala : d.escala),
            projecao: src.projecao === undefined ? d.projecao : !!src.projecao,
            alturaMm: clamp(src.alturaMm, 40, 220, d.alturaMm),
            vista: normalizeVista(src.vista),
            medidas: normalizeMedidas(src.medidas),
            edicoes: normalizeEdicoes(src.edicoes),
            posicoes: normalizePosicoes(src.posicoes)
        };
    }

    function normalizeMedidas(m) {
        const d = MAP_DEFAULTS.medidas;
        m = m || {};
        return {
            ativo: m.ativo === undefined ? d.ativo : !!m.ativo,
            lados: m.lados === undefined ? d.lados : !!m.lados,
            total: m.total === undefined ? d.total : !!m.total,
            perimetro: m.perimetro === undefined ? d.perimetro : !!m.perimetro
        };
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
            medidas: Object.assign({}, config.medidas, ajustes.medidas || {})
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

    const MAX_LADOS = 80; // acima disso os rótulos dos lados viram poluição visual: ficam de fora

    /**
     * Medidas da feição, prontas para virar rótulos no mapa.
     * Devolve { itens, ladosOmitidos }. Cada item:
     *   { id, grupo: 'lados'|'total'|'perimetro', tipo, valor, texto, resumo, pos:[lat,lng], dy }
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
                area += polygonAreaM2(rings);
                for (let i = 0; i < outer.length - 1; i++) {
                    const d = distanceM(outer[i], outer[i + 1]);
                    perim += d;
                    lados.push({ id: 'lado:' + nLados, grupo: 'lados', tipo: 'lado', valor: d, texto: fmtNumber(d, 2) + ' m', resumo: 'L' + (nLados + 1) + ': ' + fmtNumber(d, 2) + ' m', pos: midLatLng(outer[i], outer[i + 1]), dy: 0 });
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
                    trechos.push({ id: 'trecho:' + nTrechos, grupo: 'lados', tipo: 'trecho', valor: d, texto: fmtNumber(d, 2) + ' m', resumo: 'T' + (nTrechos + 1) + ': ' + fmtNumber(d, 2) + ' m', pos: midLatLng(coords[i], coords[i + 1]), dy: 0 });
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
            (theme.features || []).forEach(f => {
                if (!f || !f.geometry) return;
                if (opts.excludeKey && featureKey(f.properties) === opts.excludeKey) return;
                const fb = geometryBBox(f.geometry);
                if (!bboxIntersects(fb, area)) return;
                total++;
                if (feats.length < max) {
                    feats.push({ type: 'Feature', properties: {}, geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates, 6) } });
                }
            });
            if (feats.length) {
                out.push({
                    id: String(theme.id), name: theme.name || 'Camada', color: isHexColor(theme.color) ? theme.color : '#0284c7',
                    kind: geomKind(feats[0].geometry), features: feats, truncated: total > feats.length
                });
            }
        });
        return out;
    }

    return {
        MAP_DEFAULTS, BASE_MAPS,
        normalizeMapConfig, mergeAjustes,
        geometryBBox, bboxCenter, expandBBoxMeters, bboxIntersects, roundCoords, geomKind,
        distanceM, ringAreaM2, polygonAreaM2, lineLengthM, fmtNumber, computeMeasures, applyEdits, normalizeMedidas, normalizeEdicoes, normalizePosicoes,
        projectionInfo, scaleDenominator, niceScale, approxScale, formatScale, polygonOuterRings, normalizeVista,
        featureKey, collectNearbyLayers
    };
});
