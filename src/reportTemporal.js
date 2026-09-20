// src/reportTemporal.js
// ANÁLISE TEMPORAL DO RELATÓRIO INDIVIDUAL: um mapa por ortofoto (por data) sobre a área da feição.
// Recebe o Leaflet (L), a lista de ortofotos (MapTools.buildOrtofotoList) e a configuração; monta os quadros,
// testa se cada ortofoto tem imagem no local, e mantém os mapas vivos quando a página é repaginada.
// Não conhece a página: usa `doc` só para achar/trocar os elementos dos quadros. Testável com Leaflet simulado.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReportTemporal = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function escapeHtml(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * opts: { L, MapTools, doc?, geometry, ortofotos, config (temporal, já normalizada), corContorno?,
     *         probe?(ortofoto) => Promise<true|false|null>, onStructureChange?(), onChange?() }
     * Estados de cobertura: 'ok' (bbox conhecido ou imagem encontrada), 'verificando', 'sem-cobertura'.
     */
    function create(opts) {
        const L = opts.L;
        const MT = opts.MapTools;
        const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
        const geometry = opts.geometry || null;
        const todas = Array.isArray(opts.ortofotos) ? opts.ortofotos : [];
        let cfg = JSON.parse(JSON.stringify(opts.config));
        const corContorno = opts.corContorno || '#10b981';
        const bbox = MT.geometryBBox(geometry);
        const status = {};
        const inst = {}; // id -> { map, wrap }
        let syncing = false;

        todas.forEach(o => { status[o.id] = o.coberturaConhecida ? 'ok' : 'verificando'; });

        function el(id) { return doc && doc.getElementById ? doc.getElementById(id) : null; }
        function structure() { if (opts.onStructureChange) opts.onStructureChange(); }
        function changed() { if (opts.onChange) opts.onChange(); }

        const candidatas = () => MT.sortOrtofotos(todas, cfg.ordem);
        const isExcluded = (id) => cfg.excluidas.indexOf(String(id)) >= 0;
        /** Quadros que entram no relatório: incluídos pelo usuário e sem "sem cobertura". */
        const frames = () => candidatas().filter(o => !isExcluded(o.id) && status[o.id] !== 'sem-cobertura');

        // ------------------------------------------------------------ verificação de cobertura
        /** Testa as ortofotos em tiles (sem bbox): se não há imagem no local, o quadro sai. */
        function start() {
            const pend = todas.filter(o => status[o.id] === 'verificando');
            if (!pend.length) return Promise.resolve();
            const probe = opts.probe || (() => Promise.resolve(null));
            return Promise.all(pend.map(o => Promise.resolve(probe(o)).then(r => {
                status[o.id] = r === false ? 'sem-cobertura' : 'ok'; // dúvida (null) = mantém e deixa aparecer
                changed();
            }, () => { status[o.id] = 'ok'; changed(); }))).then(() => { structure(); });
        }

        // ------------------------------------------------------------ HTML dos quadros
        function frameHtml(o) {
            const h = Math.round(cfg.alturaMm * 3.78);
            return '<div class="report-tframe">' +
                '<div class="report-tframe-title"><span>' + escapeHtml(o.nome) + '</span><span>' + escapeHtml(o.dataTxt) + '</span></div>' +
                '<div id="tmap-wrap-' + escapeHtml(o.id) + '" class="report-tframe-wrap" style="height:' + h + 'px">' +
                '<div id="tmap-' + escapeHtml(o.id) + '" style="height:' + h + 'px;width:100%"></div></div></div>';
        }

        /** Linhas do bloco (uma por fileira de quadros), prontas para a paginação por linhas. */
        function rowsHtml() {
            const fr = frames();
            const cols = cfg.colunas;
            const rows = [];
            for (let i = 0; i < fr.length; i += cols) {
                const grupo = fr.slice(i, i + cols);
                let cells = grupo.map(frameHtml).join('');
                for (let k = grupo.length; k < cols; k++) cells += '<div></div>';
                rows.push('<div data-split-row class="report-trow" style="display:grid;grid-template-columns:repeat(' + cols + ',minmax(0,1fr));gap:10px;margin-bottom:10px;page-break-inside:avoid;">' + cells + '</div>');
            }
            return rows;
        }

        function blockMeta() {
            const n = frames().length;
            return n + ' imagem(ns) • ' + (cfg.ordem === 'desc' ? 'da mais recente para a mais antiga' : 'da mais antiga para a mais recente');
        }

        /** Bloco divisível ({ split }) ou '' quando a análise está desligada ou sem quadros. */
        function block() {
            if (!cfg.ativo) return '';
            const rows = rowsHtml();
            if (!rows.length) return '';
            const meta = blockMeta();
            const chunkHtml = (r, isFirst) => '<div class="mb-4">' +
                '<div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between gap-3">' +
                '<span>Análise Multitemporal de Ortofotos' + (isFirst ? '' : ' (continuação)') + '</span>' +
                '<span class="text-[9.5px] font-mono text-slate-500 normal-case text-right">' + escapeHtml(meta) + '</span></div>' +
                r.join('') + '</div>';
            return { split: { rowsHtml: rows, chunkHtml: chunkHtml } };
        }

        // ------------------------------------------------------------ mapas vivos
        function createMap(o) {
            const container = el('tmap-' + o.id);
            if (!container) return null;
            const map = L.map(container, { zoomControl: false, attributionControl: true, zoomSnap: 0.25 });
            if (map.attributionControl && map.attributionControl.setPrefix) map.attributionControl.setPrefix(false);
            let layer;
            if (o.tipo === 'xyz_tiles' || String(o.url).indexOf('{z}') >= 0) {
                layer = L.tileLayer(o.url, { minZoom: 1, minNativeZoom: o.zoomMin, maxNativeZoom: o.zoomMax, maxZoom: 24, opacity: o.opacidade, attribution: 'Ortofoto: ' + o.nome, crossOrigin: true });
            } else if (o.bbox) {
                layer = L.imageOverlay(o.url, o.bbox, { opacity: o.opacidade, crossOrigin: true, attribution: 'Ortofoto: ' + o.nome });
            }
            if (layer) layer.addTo(map);
            const w = { map: map, wrap: el('tmap-wrap-' + o.id), contorno: null, scale: null, o: o };
            if (bbox) map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [30, 30], maxZoom: 20 });
            map.on('moveend', () => {
                if (!cfg.sincronizar || syncing) return;
                syncing = true;
                const c = map.getCenter(), z = map.getZoom();
                Object.keys(inst).forEach(id => { if (inst[id].map !== map) inst[id].map.setView([c.lat, c.lng], z, { animate: false }); });
                syncing = false;
            });
            return w;
        }

        function styleFrame(w) {
            if (w.contorno) { w.map.removeLayer(w.contorno); w.contorno = null; }
            if (cfg.contorno && geometry) {
                w.contorno = L.geoJSON(geometry, {
                    style: () => ({ color: corContorno, weight: 2.5, fill: false, opacity: 1 }),
                    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 6, color: corContorno, weight: 2.5, fill: false })
                });
                w.contorno.addTo(w.map);
            }
            if (w.scale) { w.map.removeControl(w.scale); w.scale = null; }
            if (L.control && L.control.scale) { w.scale = L.control.scale({ imperial: false, metric: true, position: 'bottomleft', maxWidth: 90 }); w.scale.addTo(w.map); }
        }

        /** Depois de (re)desenhar a página: cria os mapas que faltam, devolve os vivos ao lugar e descarta os que saíram. */
        function attach() {
            const ativos = {};
            frames().forEach(o => { ativos[o.id] = o; });
            Object.keys(inst).forEach(id => {
                if (!ativos[id] || !cfg.ativo) { inst[id].map.remove(); delete inst[id]; }
            });
            if (!cfg.ativo) return;
            Object.keys(ativos).forEach(id => {
                const fresh = el('tmap-wrap-' + id);
                if (!fresh) return;
                if (inst[id]) {
                    if (inst[id].wrap && inst[id].wrap !== fresh) fresh.replaceWith(inst[id].wrap);
                    if (inst[id].map.invalidateSize) inst[id].map.invalidateSize();
                } else {
                    const w = createMap(ativos[id]);
                    if (w) { inst[id] = w; styleFrame(w); }
                }
            });
        }

        function refreshFrames() { Object.keys(inst).forEach(id => styleFrame(inst[id])); }

        // ------------------------------------------------------------ interface para o painel
        const api = {
            frames: frames,
            attach: attach,
            block: block,
            start: start,
            getConfig: () => JSON.parse(JSON.stringify(cfg)),
            snapshot: () => JSON.parse(JSON.stringify(cfg)),
            /** Ortofotos candidatas, com o estado, para a lista do painel. */
            list() {
                return candidatas().map(o => ({ id: o.id, nome: o.nome, dataTxt: o.dataTxt, semData: !o.dataISO, status: status[o.id], incluida: !isExcluded(o.id) }));
            },
            count: todas.length,
            /** Muda opções. ativo/ordem/colunas/altura mudam o layout (repagina); contorno/sincronia não. */
            setConfig(patch) {
                const before = JSON.stringify(cfg);
                const next = MT.normalizeMapConfig({ mapa: { temporal: Object.assign({}, cfg, patch || {}) } }).temporal;
                const layoutMudou = ['ativo', 'ordem', 'colunas', 'alturaMm'].some(k => next[k] !== cfg[k]) || JSON.stringify(next.excluidas) !== JSON.stringify(cfg.excluidas);
                cfg = next;
                if (JSON.stringify(cfg) === before) return;
                if (layoutMudou) structure(); else { refreshFrames(); changed(); }
                if (patch && patch.ativo) start();
            },
            /** Inclui/retira uma ortofoto do relatório. */
            toggle(id, on) {
                const set = new Set(cfg.excluidas);
                if (on) set.delete(String(id)); else set.add(String(id));
                cfg = MT.normalizeMapConfig({ mapa: { temporal: Object.assign({}, cfg, { excluidas: Array.from(set) }) } }).temporal;
                structure();
            },
            invalidate() { Object.keys(inst).forEach(id => { if (inst[id].map.invalidateSize) inst[id].map.invalidateSize(); }); },
            destroy() { Object.keys(inst).forEach(id => { inst[id].map.remove(); delete inst[id]; }); },
            escapeHtml,
            _inst: inst
        };
        return api;
    }

    return { create };
});
