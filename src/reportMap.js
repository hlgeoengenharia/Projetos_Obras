// src/reportMap.js
// CONTROLADOR DO MINI-MAPA DO RELATÓRIO INDIVIDUAL (Leaflet).
// Recebe o Leaflet (L), o contêiner e a configuração; devolve um controlador com o estado do mapa.
// Não conhece a página: os elementos de sobreposição (norte, escala/projeção, legenda) são achados pelos ids
// abaixo, dentro de `doc`. Assim dá para testar com um Leaflet e um DOM simulados.
//
// Ids de sobreposição (opcionais): map-north, map-info-bar, map-legend

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReportMap = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TILES = {
        osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors', maxZoom: 19 },
        satelite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagens © Esri, Maxar, Earthstar Geographics', maxZoom: 19 }
    };

    function escapeHtml(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * opts: { L, MapTools, container, doc?, geometry, camadas: [{id,name,color,kind,features,truncated}],
     *         config (já normalizada), onChange?(config) }
     */
    function create(opts) {
        const L = opts.L;
        const MT = opts.MapTools;
        const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
        const camadas = Array.isArray(opts.camadas) ? opts.camadas : [];
        const geometry = opts.geometry || null;
        let cfg = JSON.parse(JSON.stringify(opts.config));

        const map = L.map(opts.container, { zoomControl: true, attributionControl: true, zoomSnap: 0.25 });
        if (map.attributionControl && map.attributionControl.setPrefix) map.attributionControl.setPrefix(false);

        const state = { base: null, feature: null, mask: null, neighbors: {}, scaleControl: null };
        const tileLayers = {};
        Object.keys(TILES).forEach(k => {
            tileLayers[k] = L.tileLayer(TILES[k].url, { maxZoom: TILES[k].maxZoom, attribution: TILES[k].attribution, crossOrigin: true });
        });

        const bbox = MT.geometryBBox(geometry);
        const center = bbox ? MT.bboxCenter(bbox) : null; // [lng, lat]
        const proj = MT.projectionInfo(center ? center[1] : -7, center ? center[0] : -34.8);
        const kind = MT.geomKind(geometry);

        function el(id) { return doc && doc.getElementById ? doc.getElementById(id) : null; }
        function show(e, on) { if (e && e.style) e.style.display = on ? '' : 'none'; }

        // ------------------------------------------------------------ camadas do mapa
        function applyBase() {
            if (state.base) { map.removeLayer(state.base); state.base = null; }
            if (cfg.baseMap !== 'nenhum' && tileLayers[cfg.baseMap]) {
                state.base = tileLayers[cfg.baseMap];
                state.base.addTo(map);
            }
        }

        function applyNeighbors() {
            Object.keys(state.neighbors).forEach(id => { map.removeLayer(state.neighbors[id]); delete state.neighbors[id]; });
            if (!cfg.camadasVizinhas) return;
            const on = new Set(cfg.camadasLigadas.map(String));
            camadas.forEach(c => {
                if (!on.has(String(c.id))) return;
                const st = { color: c.color, weight: 1.5, fillColor: c.color, fillOpacity: 0.08, opacity: 0.9 };
                const layer = L.geoJSON({ type: 'FeatureCollection', features: c.features }, {
                    style: () => st,
                    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 4, color: c.color, weight: 1, fillColor: c.color, fillOpacity: 0.8 }),
                    interactive: false
                });
                layer.addTo(map);
                state.neighbors[String(c.id)] = layer;
            });
        }

        function applyMask() {
            if (state.mask) { map.removeLayer(state.mask); state.mask = null; }
            if (!cfg.destaque.ativo || !cfg.destaque.esmaecerEntorno) return;
            const rings = MT.polygonOuterRings(geometry);
            if (!rings.length) return; // só polígonos têm "entorno" a esmaecer
            const world = [[-90, -540], [-90, 540], [90, 540], [90, -540]];
            const holes = rings.map(r => r.map(p => [p[1], p[0]]));
            state.mask = L.polygon([world].concat(holes), { stroke: false, fillColor: '#ffffff', fillOpacity: 0.6, interactive: false });
            state.mask.addTo(map);
        }

        function applyFeature() {
            if (state.feature) { map.removeLayer(state.feature); state.feature = null; }
            if (!geometry || !cfg.destaque.ativo) return;
            const d = cfg.destaque;
            state.feature = L.geoJSON(geometry, {
                style: () => ({ color: d.cor, weight: d.espessura, fillColor: d.cor, fillOpacity: d.preenchimento }),
                pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 7, color: d.cor, weight: d.espessura, fillColor: d.cor, fillOpacity: 0.85 })
            });
            state.feature.addTo(map);
            if (state.feature.bringToFront) state.feature.bringToFront();
        }

        // ------------------------------------------------------------ sobreposições (norte, escala, projeção, legenda)
        function scaleText() {
            const lat = map.getCenter ? map.getCenter().lat : (center ? center[1] : -7);
            return 'Escala aprox. ' + MT.formatScale(MT.approxScale(MT.scaleDenominator(map.getZoom(), lat)));
        }

        function applyOverlays() {
            show(el('map-north'), !!cfg.norte);

            if (state.scaleControl) { map.removeControl(state.scaleControl); state.scaleControl = null; }
            if (cfg.escala && L.control && L.control.scale) {
                state.scaleControl = L.control.scale({ imperial: false, metric: true, position: 'bottomleft', maxWidth: 140 });
                state.scaleControl.addTo(map);
            }

            const bar = el('map-info-bar');
            if (bar) {
                const parts = [];
                if (cfg.escala) parts.push(escapeHtml(scaleText()));
                if (cfg.projecao) parts.push(escapeHtml(proj.label));
                bar.innerHTML = parts.map(p => '<span>' + p + '</span>').join('<span>•</span>');
                show(bar, parts.length > 0);
            }

            const legend = el('map-legend');
            if (legend) {
                const on = new Set(cfg.camadasLigadas.map(String));
                const items = cfg.camadasVizinhas ? camadas.filter(c => on.has(String(c.id))) : [];
                const feat = cfg.destaque.ativo ? '<div><i style="background:' + escapeHtml(cfg.destaque.cor) + '"></i>Feição do relatório</div>' : '';
                legend.innerHTML = feat + items.map(c => '<div><i style="background:' + escapeHtml(c.color) + '"></i>' + escapeHtml(c.name) + (c.truncated ? ' *' : '') + '</div>').join('');
                show(legend, !!(feat || items.length));
            }
            if (map.getContainer && map.getContainer() && map.getContainer().style) {
                map.getContainer().style.background = cfg.baseMap === 'nenhum' ? '#ffffff' : '#e2e8f0';
            }
        }

        function apply() {
            applyBase();
            applyNeighbors();
            applyMask();
            applyFeature();
            applyOverlays();
            if (opts.onChange) opts.onChange(JSON.parse(JSON.stringify(cfg)));
        }

        // ------------------------------------------------------------ enquadramento
        function frame() {
            if (cfg.vista) { map.setView([cfg.vista.lat, cfg.vista.lng], cfg.vista.zoom); return; }
            if (bbox) {
                map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [30, 30], maxZoom: 19 });
            } else {
                map.setView([-7.115, -34.863], 15);
            }
        }

        function currentView() {
            const c = map.getCenter();
            return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
        }

        map.on('zoomend', applyOverlays);
        map.on('moveend', applyOverlays);

        frame();
        apply();

        return {
            map,
            projection: proj,
            kind,
            getConfig: () => JSON.parse(JSON.stringify(cfg)),
            /** Muda partes da configuração e redesenha. `patch.destaque` é mesclado. */
            setConfig(patch) {
                const next = Object.assign({}, cfg, patch || {});
                next.destaque = Object.assign({}, cfg.destaque, (patch && patch.destaque) || {});
                cfg = MT.normalizeMapConfig({ mapa: next });
                apply();
            },
            /** Liga/desliga uma camada vizinha pelo id. */
            toggleLayer(id, on) {
                const set = new Set(cfg.camadasLigadas.map(String));
                if (on) set.add(String(id)); else set.delete(String(id));
                cfg = Object.assign({}, cfg, { camadasLigadas: Array.from(set) });
                apply();
            },
            /** Configuração completa para salvar (inclui a vista atual). */
            snapshot() {
                return Object.assign({}, cfg, { camadasLigadas: cfg.camadasLigadas.slice(), destaque: Object.assign({}, cfg.destaque), vista: currentView() });
            },
            /** Volta ao que o modelo definiu e enquadra a feição de novo. */
            reset(baseConfig) {
                cfg = JSON.parse(JSON.stringify(baseConfig));
                cfg.vista = null;
                frame();
                apply();
            },
            invalidate() { if (map.invalidateSize) map.invalidateSize(); },
            escapeHtml
        };
    }

    return { create, TILES };
});
