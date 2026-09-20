// src/reportMap.js
// CONTROLADOR DO MINI-MAPA DO RELATÓRIO INDIVIDUAL (Leaflet).
// Recebe o Leaflet (L), o contêiner e a configuração; devolve um controlador com o estado do mapa.
// Não conhece a página: os elementos de sobreposição (norte, escala/projeção, legenda) são achados pelos ids
// abaixo, dentro de `doc`. Assim dá para testar com um Leaflet e um DOM simulados.
//
// Ids de sobreposição (opcionais): map-north, map-info-bar, map-legend, map-locator (mapa de situação), map-sides-text, map-area-text (resumo sob o mapa)

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

    /** CSS do estilo do texto (negrito, itálico, sublinhado) — em linha, para a captura do mapa ler o estilo real. */
    function estiloCss(e) {
        e = e || {};
        return 'font-weight:' + (e.n ? 700 : 400) + ';font-style:' + (e.i ? 'italic' : 'normal') + ';text-decoration:' + (e.s ? 'underline' : 'none') + ';';
    }
    function labelTransform(deg) { return 'translate(-50%,-50%) rotate(' + (Number(deg) || 0) + 'deg)'; }
    const POINT_LABEL_OFFSET = [16, -13]; // px: onde o nome do ponto nasce em relação ao vértice
    const ROT_HANDLE = '<span class="report-rot no-print" title="Girar (arraste; Shift = de 15 em 15°) • dois cliques voltam ao automático">&#8635;</span>';

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
        const ortofotos = Array.isArray(opts.ortofotos) ? opts.ortofotos : []; // ortofotos ativas no projeto (opção de mapa base)
        const geometry = opts.geometry || null;
        let cfg = JSON.parse(JSON.stringify(opts.config));

        // preferCanvas: os vetores vão para um canvas, que a captura da imagem (Word/PNG) copia sem deslocamento
        const map = L.map(opts.container, { zoomControl: true, attributionControl: true, zoomSnap: 0.25, preferCanvas: true });
        if (map.attributionControl && map.attributionControl.setPrefix) map.attributionControl.setPrefix(false);

        const state = { base: null, orto: null, feature: null, mask: null, neighbors: {}, scaleControl: null, markers: {}, pts: {}, nlabels: {}, grid: [], notes: {}, locator: null, exporting: false };
        const vertData = MT.vertices(opts.geometry || null); // vértices onde o usuário pode marcar pontos
        const measureData = MT.computeMeasures(opts.geometry || null); // { itens, ladosOmitidos }
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
        // Ortofoto como mapa base: vai sobre o satélite, que preenche o que ela não cobre
        const ortoLayers = {};
        function ortofotoDoBase() {
            const m = /^ortofoto:(.+)$/.exec(String(cfg.baseMap || ''));
            return m ? ortofotos.find(o => String(o.id) === m[1]) || null : null;
        }
        function ortoLayer(o) {
            if (!ortoLayers[o.id]) {
                if (o.tipo === 'xyz_tiles' || String(o.url).indexOf('{z}') >= 0) {
                    ortoLayers[o.id] = L.tileLayer(o.url, { minZoom: 1, minNativeZoom: o.zoomMin, maxNativeZoom: o.zoomMax, maxZoom: 24, opacity: o.opacidade, attribution: 'Ortofoto: ' + o.nome, crossOrigin: true });
                } else if (o.bbox) {
                    ortoLayers[o.id] = L.imageOverlay(o.url, o.bbox, { opacity: o.opacidade, crossOrigin: true, attribution: 'Ortofoto: ' + o.nome });
                }
            }
            return ortoLayers[o.id] || null;
        }
        function applyBase() {
            if (state.base) { map.removeLayer(state.base); state.base = null; }
            if (state.orto) { map.removeLayer(state.orto); state.orto = null; }
            const o = ortofotoDoBase();
            if (o) {
                state.base = tileLayers.satelite;
                state.base.addTo(map);
                state.orto = ortoLayer(o);
                if (state.orto) state.orto.addTo(map);
            } else if (cfg.baseMap !== 'nenhum') {
                // ortofoto que não está mais disponível volta para o mapa de ruas
                state.base = tileLayers[cfg.baseMap] || tileLayers.osm;
                state.base.addTo(map);
            }
        }

        // texto sobre cada feição da camada (Quadra/Lote ou nome principal), no centro dela; camadas enormes ficam sem rótulo
        const MAX_ROTULOS = 250;
        function addNeighborLabels(c) {
            if (!cfg.rotulos.ativo) return;
            const key = cfg.rotulos.campo === 'titulo' ? 't' : 'r';
            const itens = c.features.filter(x => x.properties && x.properties[key]);
            if (!itens.length || itens.length > MAX_ROTULOS) return;
            const list = [];
            itens.forEach(x => {
                const bb = MT.geometryBBox(x.geometry);
                if (!bb) return;
                const ct = MT.bboxCenter(bb);
                const icon = L.divIcon({ className: 'report-nlabel', html: '<span>' + escapeHtml(x.properties[key]) + '</span>', iconSize: [0, 0] });
                const mk = L.marker([ct[1], ct[0]], { icon: icon, interactive: false, keyboard: false });
                mk.addTo(map);
                list.push(mk);
            });
            state.nlabels[String(c.id)] = list;
        }
        function clearNeighborLabels() {
            Object.keys(state.nlabels).forEach(id => { state.nlabels[id].forEach(m => map.removeLayer(m)); delete state.nlabels[id]; });
        }

        function applyNeighbors() {
            clearNeighborLabels();
            Object.keys(state.neighbors).forEach(id => { map.removeLayer(state.neighbors[id]); delete state.neighbors[id]; });
            if (!cfg.camadasVizinhas) return;
            const on = new Set(cfg.camadasLigadas.map(String));
            camadas.forEach(c => {
                if (!on.has(String(c.id))) return;
                addNeighborLabels(c);
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
            state.mask = L.polygon([world].concat(holes), { stroke: false, fillColor: '#ffffff', fillOpacity: cfg.destaque.opacidadeEntorno, interactive: false });
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

        // ------------------------------------------------------------ medidas (rótulos editáveis e arrastáveis)
        function notify() { if (opts.onChange) opts.onChange(JSON.parse(JSON.stringify(cfg))); }

        function visibleMeasures() {
            const m = cfg.medidas;
            if (!m.ativo) return [];
            return MT.applyEdits(measureData.itens, cfg.edicoes).filter(it =>
                (it.grupo === 'lados' && m.lados) || (it.grupo === 'total' && m.total) || (it.grupo === 'perimetro' && m.perimetro));
        }

        function clearMeasureMarkers() {
            Object.keys(state.markers).forEach(id => { map.removeLayer(state.markers[id]); delete state.markers[id]; });
        }

        /** Grava (ou remove, se vazio/igual ao calculado) a edição de uma medida e redesenha. */
        function setEdit(id, text, padrao) {
            const limpo = MT.normalizeEdicoes({ [id]: text })[id];
            const edicoes = Object.assign({}, cfg.edicoes);
            if (!limpo || limpo === padrao) delete edicoes[id]; else edicoes[id] = limpo;
            cfg.edicoes = edicoes;
            apply();
        }

        /**
         * Troca o rótulo de um marcador por um campo de texto: Enter ou sair do campo grava (onCommit(texto));
         * Esc cancela (onCancel). Serve às medidas e aos nomes dos pontos.
         */
        function editInline(mk, selector, atual, onCommit, onCancel) {
            const root = mk && mk.getElement ? mk.getElement() : null;
            const span = root && root.querySelector ? root.querySelector(selector) : null;
            if (!span || !doc) return;
            if (mk.dragging && mk.dragging.disable) mk.dragging.disable();
            const input = doc.createElement('input');
            input.type = 'text';
            input.value = atual;
            input.maxLength = 60;
            input.className = 'report-measure-input';
            span.textContent = '';
            span.appendChild(input);
            if (input.focus) input.focus();
            if (input.select) input.select();
            let done = false;
            const finish = (save) => {
                if (done) return;
                done = true;
                if (save) onCommit(input.value); else onCancel();
            };
            const stop = (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); };
            input.addEventListener('keydown', (ev) => {
                stop(ev);
                if (ev.key === 'Enter') finish(true);
                else if (ev.key === 'Escape') finish(false);
            });
            input.addEventListener('blur', () => finish(true));
            ['mousedown', 'dblclick', 'click'].forEach(name => input.addEventListener(name, stop));
        }

        /**
         * Liga o ícone de girar de um texto: arrastar gira em torno do centro do texto (Shift = passos de 15°);
         * ao soltar, commit(graus). Dois cliques no ícone chamam clear() (volta ao automático).
         */
        function wireRotate(mk, labelSel, current, commit, clear) {
            const root = mk && mk.getElement ? mk.getElement() : null;
            if (!root || !root.querySelector || !doc) return;
            const h = root.querySelector('.report-rot');
            const lab = root.querySelector(labelSel);
            if (!h || !lab || !h.addEventListener) return;
            const stop = (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); };
            ['mousedown', 'touchstart', 'click'].forEach(n => h.addEventListener(n, stop));
            h.addEventListener('dblclick', (ev) => { stop(ev); clear(); });
            h.addEventListener('pointerdown', (ev) => {
                stop(ev);
                if (ev.preventDefault) ev.preventDefault();
                if (mk.dragging && mk.dragging.disable) mk.dragging.disable();
                let deg = current();
                const move = (e) => {
                    const r = lab.getBoundingClientRect();
                    deg = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
                    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
                    lab.style.transform = labelTransform(deg);
                };
                const up = () => {
                    doc.removeEventListener('pointermove', move);
                    doc.removeEventListener('pointerup', up);
                    commit(deg);
                };
                if (doc.addEventListener) { doc.addEventListener('pointermove', move); doc.addEventListener('pointerup', up); }
            });
        }

        function setRotation(id, deg) {
            const r = MT.normalizeRotacoes({ [id]: deg });
            const rotacoes = Object.assign({}, cfg.rotacoes);
            if (r[id] === undefined) delete rotacoes[id]; else rotacoes[id] = r[id];
            cfg.rotacoes = rotacoes;
            applyMeasures();
            applyPoints();
            notify();
        }
        function clearRotation(id) {
            const rotacoes = Object.assign({}, cfg.rotacoes);
            delete rotacoes[id];
            cfg.rotacoes = rotacoes;
            applyMeasures();
            applyPoints();
            notify();
        }

        function startEdit(it) {
            editInline(state.markers[it.id], 'span', it.texto, (txt) => setEdit(it.id, txt, it.padrao), applyMeasures);
        }

        function applyMeasures() {
            clearMeasureMarkers();
            visibleMeasures().forEach(it => {
                const p = cfg.posicoes[it.id];
                const pos = p ? [p.lat, p.lng] : it.pos;
                const off = p || !it.off ? [0, 0] : it.off; // depois de arrastado, o texto fica exatamente onde foi solto
                const rot = cfg.rotacoes[it.id] !== undefined ? cfg.rotacoes[it.id] : (it.ang || 0);
                const dica = it.editado ? 'Editado (calculado: ' + it.padrao + ')' : 'Duplo clique para editar • arraste para mover';
                const html = '<span class="report-measure-label' + (it.editado ? ' edited' : '') + '" style="left:' + off[0] + 'px;top:' + (it.dy + off[1]) + 'px;transform:' + labelTransform(rot) + ';' + estiloCss(cfg.medidas.estilo[it.grupo]) + '" title="' + escapeHtml(dica) + '">' + escapeHtml(it.texto) + ROT_HANDLE + '</span>';
                const icon = L.divIcon({ className: 'report-measure', html: html, iconSize: [0, 0] });
                const mk = L.marker(pos, { icon: icon, draggable: true, keyboard: false, zIndexOffset: 1000 });
                mk.addTo(map);
                mk.on('dblclick', (e) => {
                    if (L.DomEvent && L.DomEvent.stopPropagation && e) L.DomEvent.stopPropagation(e);
                    startEdit(it);
                });
                mk.on('dragend', () => {
                    const ll = mk.getLatLng();
                    cfg.posicoes = Object.assign({}, cfg.posicoes, { [it.id]: { lat: ll.lat, lng: ll.lng } });
                    notify();
                });
                state.markers[it.id] = mk;
                wireRotate(mk, '.report-measure-label', () => rot, (deg) => setRotation(it.id, deg), () => clearRotation(it.id));
            });
            // resumo sob o mapa (sempre visível; acompanha as edições)
            const sidesEl = el('map-sides-text');
            const areaEl = el('map-area-text');
            const todas = MT.applyEdits(measureData.itens, cfg.edicoes);
            if (sidesEl) {
                const lados = todas.filter(i => i.grupo === 'lados').map(i => i.resumo);
                sidesEl.textContent = !geometry ? 'Feição sem geometria associada'
                    : (lados.length ? lados.join('  ') : (measureData.ladosOmitidos ? 'Mais de 80 lados: rótulos omitidos' : (kind === 'point' ? 'Ponto' : '')));
            }
            if (areaEl) {
                areaEl.textContent = todas.filter(i => i.grupo === 'total' || i.grupo === 'perimetro').map(i => i.resumo).join(' • ');
            }
        }

        // ------------------------------------------------------------ quadriculado UTM (acompanha o enquadramento)
        function clearGrid() { state.grid.forEach(l => map.removeLayer(l)); state.grid = []; }
        function applyGrid() {
            clearGrid();
            if (!cfg.quadriculado.ativo || !map.getBounds) return;
            const b = map.getBounds();
            const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
            const g = MT.gradeUTM(bbox, cfg.quadriculado.espacamento || 0);
            g.linhas.forEach(l => {
                const pl = L.polyline(l.pts, { color: '#1e293b', weight: 0.8, opacity: 0.65, dashArray: '4 4', interactive: false });
                pl.addTo(map);
                state.grid.push(pl);
                // valor da coordenada na ponta: E embaixo, N à esquerda
                const p = l.pts[0];
                const txt = (l.tipo === 'e' ? 'E ' : 'N ') + MT.fmtNumber(l.valor, 0);
                const icon = L.divIcon({ className: 'report-glabel', html: '<span class="' + (l.tipo === 'e' ? 'e' : 'n') + '">' + escapeHtml(txt) + '</span>', iconSize: [0, 0] });
                const mk = L.marker(p, { icon: icon, interactive: false, keyboard: false });
                mk.addTo(map);
                state.grid.push(mk);
            });
        }

        // ------------------------------------------------------------ mapa de situação (mapa pequeno com a visão geral)
        function applySituacao() {
            const box = el('map-locator');
            show(box, !!cfg.situacao.ativo && !!box);
            if (!cfg.situacao.ativo || !box) return;
            if (!state.locator) {
                const lm = L.map(box, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false, preferCanvas: true });
                L.tileLayer(TILES.osm.url, { maxZoom: 19, crossOrigin: true }).addTo(lm);
                const ct = center || [-34.8, -7];
                if (L.circleMarker) L.circleMarker([ct[1], ct[0]], { radius: 4, color: '#dc2626', weight: 2, fillColor: '#dc2626', fillOpacity: 1, interactive: false }).addTo(lm);
                state.locator = { map: lm, rect: null };
            }
            const lm = state.locator.map;
            if (lm.invalidateSize) lm.invalidateSize();
            const ct = center || [-34.8, -7];
            lm.setView([ct[1], ct[0]], Math.max(1, Math.round(map.getZoom()) - 6), { animate: false });
            if (state.locator.rect) { lm.removeLayer(state.locator.rect); state.locator.rect = null; }
            if (L.rectangle && map.getBounds) state.locator.rect = L.rectangle(map.getBounds(), { color: '#dc2626', weight: 1.5, fill: false, interactive: false }).addTo(lm);
        }

        // ------------------------------------------------------------ anotações de texto (arraste = mover; duplo clique = editar)
        function clearNotes() { Object.keys(state.notes).forEach(id => { map.removeLayer(state.notes[id]); delete state.notes[id]; }); }
        function applyNotes() {
            clearNotes();
            cfg.anotacoes.forEach(n => {
                const html = '<span class="report-note-label" title="Duplo clique para editar • arraste para mover">' + escapeHtml(n.texto) + '</span>';
                const icon = L.divIcon({ className: 'report-note', html: html, iconSize: [0, 0] });
                const mk = L.marker([n.lat, n.lng], { icon: icon, draggable: true, keyboard: false, zIndexOffset: 1600 });
                mk.addTo(map);
                mk.on('dblclick', (e) => {
                    if (L.DomEvent && L.DomEvent.stopPropagation && e) L.DomEvent.stopPropagation(e);
                    editInline(mk, '.report-note-label', n.texto, (txt) => api.renameNote(n.id, txt), applyNotes);
                });
                mk.on('dragend', () => {
                    const ll = mk.getLatLng();
                    cfg.anotacoes = cfg.anotacoes.map(x => x.id === n.id ? Object.assign({}, x, { lat: ll.lat, lng: ll.lng }) : x);
                    notify();
                });
                state.notes[n.id] = mk;
            });
        }

        // ------------------------------------------------------------ pontos nos vértices
        function clearPointLayers() {
            Object.keys(state.pts).forEach(k => { map.removeLayer(state.pts[k]); delete state.pts[k]; });
        }

        function pointRowsNow() { return MT.pointRows(geometry, cfg.pontos); }

        /**
         * Normaliza o novo estado dos pontos em relação ao anterior: trocar a sequência recalcula azimutes/distâncias e
         * trocar o sistema muda as colunas (as edições dessas células não valem mais); pontos que saíram perdem posição e giro.
         */
        function aplicarPontos(next) {
            const ant = cfg.pontos;
            const textos = Object.assign({}, next.textos || {});
            const mudouOrdem = JSON.stringify(next.ordem) !== JSON.stringify(ant.ordem);
            const mudouSistema = next.sistema !== ant.sistema;
            Object.keys(textos).forEach(k => { if ((mudouOrdem && /:(az|dist)$/.test(k)) || (mudouSistema && /:c[0-9]$/.test(k))) delete textos[k]; });
            cfg.pontos = MT.normalizePontos(Object.assign({}, next, { textos: textos }));
            const vivos = new Set(cfg.pontos.ordem);
            const solta = (m) => { const out = {}; Object.keys(m).forEach(k => { if (!/^v:/.test(k) || vivos.has(k)) out[k] = m[k]; }); return out; };
            cfg.posicoes = solta(cfg.posicoes);
            cfg.rotacoes = solta(cfg.rotacoes);
        }

        function setPontos(patch) {
            aplicarPontos(Object.assign({}, cfg.pontos, patch));
            apply();
        }

        function applyPoints() {
            clearPointLayers();
            if (!cfg.pontos.ativo) return;
            const chosen = new Set(cfg.pontos.ordem);
            // vértices ainda livres: clique marca o ponto (somem na impressão e na exportação da imagem)
            vertData.itens.forEach(v => {
                if (chosen.has(v.id) || state.exporting) return;
                const h = L.circleMarker([v.lat, v.lng], { radius: 5, color: '#334155', weight: 1.5, fillColor: '#ffffff', fillOpacity: 1, interactive: true, bubblingMouseEvents: false, className: 'report-vertex-handle' });
                h.addTo(map);
                h.on('click', () => api.addPoint(v.id));
                state.pts['h:' + v.id] = h;
            });
            // pontos marcados: a bolinha fica no vértice; o nome é um texto à parte (arrastar move, ↻ gira, dois cliques renomeiam)
            pointRowsNow().rows.forEach(r => {
                const dot = L.marker([r.lat, r.lng], { icon: L.divIcon({ className: 'report-point', html: '<span class="report-point-dot"></span>', iconSize: [0, 0] }), interactive: false, keyboard: false, zIndexOffset: 1400 });
                dot.addTo(map);
                state.pts['d:' + r.vid] = dot;
                const p = cfg.posicoes[r.vid];
                const pos = p ? [p.lat, p.lng] : [r.lat, r.lng];
                const off = p ? [0, 0] : POINT_LABEL_OFFSET; // sem posição escolhida, o nome fica ao lado do ponto
                const rot = cfg.rotacoes[r.vid] !== undefined ? cfg.rotacoes[r.vid] : 0;
                const html = '<span class="report-point-label" style="left:' + off[0] + 'px;top:' + off[1] + 'px;transform:' + labelTransform(rot) + ';' + estiloCss(cfg.pontos.estilo) + '" title="Duplo clique para renomear • arraste para mover">' + escapeHtml(r.titulo) + ROT_HANDLE + '</span>';
                const mk = L.marker(pos, { icon: L.divIcon({ className: 'report-point', html: html, iconSize: [0, 0] }), draggable: true, keyboard: false, zIndexOffset: 1500 });
                mk.addTo(map);
                mk.on('dblclick', (e) => {
                    if (L.DomEvent && L.DomEvent.stopPropagation && e) L.DomEvent.stopPropagation(e);
                    editInline(mk, '.report-point-label', r.titulo, (txt) => api.renamePoint(r.vid, txt), applyPoints);
                });
                mk.on('dragend', () => {
                    const ll = mk.getLatLng();
                    cfg.posicoes = Object.assign({}, cfg.posicoes, { [r.vid]: { lat: ll.lat, lng: ll.lng } });
                    notify();
                });
                state.pts['p:' + r.vid] = mk;
                wireRotate(mk, '.report-point-label', () => rot, (deg) => setRotation(r.vid, deg), () => clearRotation(r.vid));
            });
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
            applyMeasures();
            applyPoints();
            applyGrid();
            applyNotes();
            applyOverlays();
            applySituacao();
            notify();
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

        // ao mover/aproximar: escala, grade e a caixa do mapa de situação acompanham (sem notificar mudança de configuração)
        function onView() { applyOverlays(); applyGrid(); applySituacao(); }
        map.on('zoomend', onView);
        map.on('moveend', onView);

        const api = {
            map,
            projection: proj,
            kind,
            getConfig: () => JSON.parse(JSON.stringify(cfg)),
            /** Muda partes da configuração e redesenha. `patch.destaque` é mesclado. */
            setConfig(patch) {
                const next = Object.assign({}, cfg, patch || {});
                next.destaque = Object.assign({}, cfg.destaque, (patch && patch.destaque) || {});
                next.medidas = Object.assign({}, cfg.medidas, (patch && patch.medidas) || {});
                next.pontos = Object.assign({}, cfg.pontos, (patch && patch.pontos) || {});
                ['rotulos', 'confrontantes', 'referencia', 'comparacaoArea', 'situacao', 'quadriculado'].forEach(k => { next[k] = Object.assign({}, cfg[k], (patch && patch[k]) || {}); });
                const pontosNovos = next.pontos;
                cfg = MT.normalizeMapConfig({ mapa: Object.assign({}, next, { pontos: cfg.pontos }) }); // o resto normalizado; os pontos passam por aplicarPontos
                aplicarPontos(pontosNovos);
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
                return Object.assign({}, cfg, {
                    camadasLigadas: cfg.camadasLigadas.slice(), destaque: Object.assign({}, cfg.destaque), medidas: JSON.parse(JSON.stringify(cfg.medidas)),
                    edicoes: Object.assign({}, cfg.edicoes), posicoes: Object.assign({}, cfg.posicoes), rotacoes: Object.assign({}, cfg.rotacoes),
                    pontos: Object.assign({}, cfg.pontos, { ordem: cfg.pontos.ordem.slice(), titulos: Object.assign({}, cfg.pontos.titulos) }),
                    rotulos: Object.assign({}, cfg.rotulos), confrontantes: Object.assign({}, cfg.confrontantes), referencia: Object.assign({}, cfg.referencia),
                    comparacaoArea: Object.assign({}, cfg.comparacaoArea), situacao: Object.assign({}, cfg.situacao), quadriculado: Object.assign({}, cfg.quadriculado),
                    anotacoes: cfg.anotacoes.map(a => Object.assign({}, a)), vista: currentView()
                });
            },
            /** Volta ao que o modelo definiu e enquadra a feição de novo. */
            reset(baseConfig) {
                cfg = JSON.parse(JSON.stringify(baseConfig));
                cfg.vista = null;
                frame();
                apply();
            },
            /** Apaga as edições e as posições dos rótulos (volta ao calculado). */
            resetMeasures() {
                // só as medidas: a posição e o giro dos nomes dos pontos (v:N) ficam
                const soPontos = (m) => { const out = {}; Object.keys(m).forEach(k => { if (/^v:/.test(k)) out[k] = m[k]; }); return out; };
                cfg.edicoes = {}; cfg.posicoes = soPontos(cfg.posicoes); cfg.rotacoes = soPontos(cfg.rotacoes); apply();
            },
            /** Itens de medida atuais (com as edições), para painel/teste. */
            measures() { return MT.applyEdits(measureData.itens, cfg.edicoes); },
            ladosOmitidos: measureData.ladosOmitidos,
            invalidate() { if (map.invalidateSize) map.invalidateSize(); },
            escapeHtml,
            estiloCss,

            // ---- pontos nos vértices (tabela de coordenadas e memorial)
            vertexCount: vertData.total,
            verticesOmitidos: vertData.omitidos,
            pointRows: pointRowsNow,
            /** Marca um vértice como ponto (vai para o fim da sequência). */
            addPoint(id) {
                if (cfg.pontos.ordem.indexOf(id) >= 0) return;
                setPontos({ ordem: cfg.pontos.ordem.concat([id]) });
            },
            removePoint(id) {
                const titulos = Object.assign({}, cfg.pontos.titulos);
                delete titulos[id];
                setPontos({ ordem: cfg.pontos.ordem.filter(x => x !== id), titulos: titulos });
            },
            /** Sobe (-1) ou desce (+1) um ponto na sequência. */
            movePoint(id, dir) {
                const ordem = cfg.pontos.ordem.slice();
                const i = ordem.indexOf(id);
                const j = i + (dir < 0 ? -1 : 1);
                if (i < 0 || j < 0 || j >= ordem.length) return;
                ordem.splice(j, 0, ordem.splice(i, 1)[0]);
                setPontos({ ordem: ordem });
            },
            /** Renomeia um ponto; vazio ou igual ao nome padrão (P1, P2...) volta ao padrão. */
            renamePoint(id, text) {
                const pos = cfg.pontos.ordem.indexOf(id);
                const limpo = MT.normalizePontos({ titulos: { [id]: text }, ordem: [id] }).titulos[id];
                const titulos = Object.assign({}, cfg.pontos.titulos);
                if (!limpo || pos < 0 || limpo === MT.defaultPointTitle(pos)) delete titulos[id]; else titulos[id] = limpo;
                setPontos({ titulos: titulos });
            },
            markAllPoints() {
                if (vertData.omitidos) return;
                setPontos({ ativo: true, ordem: vertData.itens.map(v => v.id) });
            },
            clearPoints() { setPontos({ ordem: [], titulos: {}, textos: {} }); },
            /** Texto da tabela de pontos escrito pelo usuário: 'titulo' ou 'v:N:c0|az|dist'. Vazio volta ao calculado. */
            setTabelaTexto(chave, texto) {
                const textos = Object.assign({}, cfg.pontos.textos);
                const limpo = MT.normalizePontos({ textos: { [chave]: texto } }).textos[chave];
                if (limpo) textos[chave] = limpo; else delete textos[chave];
                setPontos({ textos: textos });
            },
            // ---- anotações de texto
            /** Nova anotação no centro do mapa (ou onde for pedido). Devolve o id. */
            addNote(texto, lat, lng) {
                const c = map.getCenter();
                const usados = cfg.anotacoes.map(a => Number(a.id.slice(1)));
                let n = 1; while (usados.indexOf(n) >= 0) n++;
                const nova = MT.normalizeAnotacoes([{ id: 'a' + n, lat: lat === undefined ? c.lat : lat, lng: lng === undefined ? c.lng : lng, texto: texto || 'Anotação' }]);
                if (!nova.length || cfg.anotacoes.length >= 30) return null;
                cfg.anotacoes = cfg.anotacoes.concat(nova);
                apply();
                return nova[0].id;
            },
            /** Renomeia; texto vazio apaga a anotação. */
            renameNote(id, texto) {
                const limpo = MT.normalizeAnotacoes([{ id: id, lat: 0, lng: 0, texto: texto }]);
                cfg.anotacoes = limpo.length ? cfg.anotacoes.map(a => a.id === id ? Object.assign({}, a, { texto: limpo[0].texto }) : a) : cfg.anotacoes.filter(a => a.id !== id);
                apply();
            },
            removeNote(id) { cfg.anotacoes = cfg.anotacoes.filter(a => a.id !== id); apply(); },
            /** Liga/desliga o modo de saída (impressão, PNG, Word): sem marcadores de vértice livres. */
            setExportMode(on) { if (state.exporting === !!on) return; state.exporting = !!on; applyPoints(); },
            /** Redesenha tudo (depois que a página trocou os elementos de sobreposição). */
            refresh() { apply(); }
        };

        frame();
        apply();
        return api;
    }

    return { create, TILES };
});
