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
        vista: null              // { lat, lng, zoom } salvo pelo usuário; sem ele o mapa enquadra a feição
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
            vista: normalizeVista(src.vista)
        };
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
            destaque: Object.assign({}, config.destaque, ajustes.destaque || {})
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
        projectionInfo, scaleDenominator, niceScale, approxScale, formatScale, polygonOuterRings, normalizeVista,
        featureKey, collectNearbyLayers
    };
});
