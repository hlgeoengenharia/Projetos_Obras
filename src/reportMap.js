// src/reportMap.js
// CONTROLADOR DO MINI-MAPA DO RELATÓRIO INDIVIDUAL (Leaflet).
// Recebe o Leaflet (L), o contêiner e a configuração; devolve um controlador com o estado do mapa.
// Não conhece a página: os elementos de sobreposição (norte, escala/projeção, legenda) são achados pelos ids
// abaixo, dentro de `doc`. Assim dá para testar com um Leaflet e um DOM simulados.
//
// Ids de sobreposição (opcionais): map-north, map-info-wrap (com map-escala-txt e map-proj-txt), map-legend, map-locator (mapa de situação), map-sides-text, map-area-text (resumo sob o mapa)

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
    /** Contorno do texto que contrasta com a cor escolhida: cor clara ganha contorno escuro e vice-versa (para ler sobre satélite). */
    function haloDe(cor) {
        const h = String(cor || '').replace('#', '');
        const lum = h.length === 6 ? (0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16)) / 255 : 0;
        const c = lum > 0.62 ? '#000' : '#fff';
        return '0 0 2px ' + c + ', 0 0 2px ' + c + ', 0 0 3px ' + c;
    }
    /** CSS da cor do texto (e do contorno). Com padrao, a cor padrão não escreve nada (vale o CSS da folha). */
    function corTexto(cor, padrao) {
        return cor && cor !== padrao ? 'color:' + cor + ';text-shadow:' + haloDe(cor) + ';' : '';
    }
    function labelTransform(deg) { return 'translate(-50%,-50%) rotate(' + (Number(deg) || 0) + 'deg)'; }
    const MOVEIS = ['norte', 'escala', 'escalaTexto', 'projecao', 'legenda', 'situacao'];
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

        const state = { draw: null, mlayers: [], measure: null, dlines: [], base: null, orto: null, feature: null, mask: null, neighbors: {}, scaleControl: null, markers: {}, pts: {}, nlabels: {}, grid: [], notes: {}, locator: null, exporting: false };
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
        // chave do ajuste de um rótulo: id da camada (só caracteres seguros) + posição da feição na camada
        function nlKey(c, i) { return String(c.id).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64) + ':' + i; }

        function setRotuloItem(id, patch) {
            const itens = Object.assign({}, cfg.rotulos.itens);
            const novo = Object.assign({}, itens[id] || {}, patch);
            Object.keys(novo).forEach(k => { if (novo[k] === undefined) delete novo[k]; });
            if (novo.lat === undefined && novo.rot === undefined) delete itens[id]; else itens[id] = novo;
            cfg.rotulos = MT.normalizeRotulos(Object.assign({}, cfg.rotulos, { itens: itens }));
            redrawNeighborLabels();
            notify();
        }

        function addNeighborLabels(c) {
            if (!cfg.rotulos.ativo) return;
            const key = cfg.rotulos.campo === 'titulo' ? 't' : 'r';
            const itens = [];
            c.features.forEach((x, i) => { if (x.properties && x.properties[key]) itens.push({ x: x, i: i }); });
            if (!itens.length || itens.length > MAX_ROTULOS) return;
            const list = [];
            itens.forEach(({ x, i }) => {
                const bb = MT.geometryBBox(x.geometry);
                if (!bb) return;
                const id = nlKey(c, i);
                const aj = cfg.rotulos.itens[id] || {};
                const ct = aj.lat !== undefined ? [aj.lng, aj.lat] : MT.bboxCenter(bb);
                const rot = aj.rot !== undefined ? aj.rot : 0;
                const html = '<span class="report-nlabel-l" style="transform:' + labelTransform(rot) + ';' + estiloCss(cfg.rotulos.estilo) + corTexto(cfg.rotulos.cor, MT.MAP_DEFAULTS.rotulos.cor) + '" title="Arraste para mover">' + escapeHtml(x.properties[key]) + ROT_HANDLE + '</span>';
                const icon = L.divIcon({ className: 'report-nlabel', html: html, iconSize: [0, 0] });
                const mk = L.marker([ct[1], ct[0]], { icon: icon, draggable: true, keyboard: false, zIndexOffset: 900 });
                mk.addTo(map);
                mk.on('dragend', () => { const ll = mk.getLatLng(); setRotuloItem(id, { lat: ll.lat, lng: ll.lng }); });
                list.push(mk);
                wireRotate(mk, '.report-nlabel-l', () => rot, (deg) => setRotuloItem(id, { rot: deg }), () => setRotuloItem(id, { rot: undefined }));
            });
            state.nlabels[String(c.id)] = (state.nlabels[String(c.id)] || []).concat(list);
        }
        function clearNeighborLabels() {
            Object.keys(state.nlabels).forEach(id => { state.nlabels[id].forEach(m => map.removeLayer(m)); delete state.nlabels[id]; });
        }

        function redrawNeighborLabels() {
            clearNeighborLabels();
            if (!cfg.camadasVizinhas) return;
            const on = new Set(cfg.camadasLigadas.map(String));
            camadas.forEach(c => { if (on.has(String(c.id))) addNeighborLabels(c); });
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

        /** Cor do texto de uma medida: medições livres e trechos (medicoes), distância até a camada (referencia) ou medidas da feição (medidas). */
        function corDoItem(it) {
            if (/^(med|mseg):/.test(it.id)) return corTexto(cfg.medicoes.cor, null);
            if (/^dist:/.test(it.id)) return corTexto(cfg.referencia.cor, null);
            return corTexto(cfg.medidas.cor, MT.MAP_DEFAULTS.medidas.cor);
        }

        function visibleMeasures() {
            const m = cfg.medidas;
            if (!m.ativo) return [];
            return MT.applyEdits(measureData.itens, cfg.edicoes).filter(it =>
                (it.grupo === 'lados' && m.lados) || (it.grupo === 'total' && m.total) || (it.grupo === 'perimetro' && m.perimetro));
        }

        /** Medições livres (ponto, distância e área) no formato dos itens de medida: texto editável, arrastável e girável. */
        function medItems() {
            const itens = [];
            cfg.medicoes.itens.forEach(m => {
                const info = MT.medicaoInfo(m);
                const n = Number(m.id.slice(4));
                if (m.tipo === 'linha') {
                    // a medida de cada trecho entre os vértices (texto próprio, editável, arrastável e girável)
                    m.pts.slice(1).forEach((p, k) => {
                        const A = [m.pts[k][1], m.pts[k][0]], B = [p[1], p[0]];
                        const d = info.trechos[k];
                        const texto = MT.fmtNumber(d, 2) + ' m';
                        itens.push({ id: 'mseg:' + (n * 1000 + k), grupo: 'lados', tipo: 'medicao-trecho', valor: d, texto: texto, resumo: texto, pos: [(A[1] + B[1]) / 2, (A[0] + B[0]) / 2], dy: 0, ang: MT.edgeAngleCss(A, B), off: MT.edgeOffsetAbove(A, B, 9) });
                    });
                    if (info.trechos.length === 1) { itens.pop(); } // com um trecho só, o texto do comprimento já é a medida
                    const k = Math.max(0, Math.min(m.pts.length - 2, Math.floor((m.pts.length - 1) / 2)));
                    const A = [m.pts[k][1], m.pts[k][0]], B = [m.pts[k + 1][1], m.pts[k + 1][0]];
                    const texto = MT.medicaoTexto(m, cfg.medicoes.sistema);
                    // o total fica do outro lado da linha, para não cobrir a medida do trecho
                    const acima = MT.edgeOffsetAbove(A, B, 9);
                    itens.push({ id: m.id, grupo: 'total', tipo: 'medicao', valor: info.comprimento, texto: texto, resumo: texto, pos: [info.centro.lat, info.centro.lng], dy: 0, ang: MT.edgeAngleCss(A, B), off: info.trechos.length > 1 ? [-acima[0] * 1.6, -acima[1] * 1.6] : acima });
                    return;
                }
                const texto = MT.medicaoTexto(m, cfg.medicoes.sistema);
                itens.push({ id: m.id, grupo: 'total', tipo: 'medicao', valor: info.area || 0, texto: texto, resumo: texto, pos: [info.centro.lat, info.centro.lng], dy: 0, ang: 0, off: [0, m.tipo === 'area' ? 0 : -12] });
            });
            return MT.applyEdits(itens, cfg.edicoes);
        }

        /** Distâncias tiradas pelo usuário (feição → camada de referência), no formato dos itens de medida. */
        function distItems() {
            if (!cfg.referencia.ativo) return [];
            return MT.applyEdits(cfg.referencia.medidas.map(m => {
                const A = [m.a[1], m.a[0]], B = [m.b[1], m.b[0]];
                const d = MT.distanceM(A, B);
                const texto = MT.fmtNumber(d, 2) + ' m';
                return { id: m.id, grupo: 'total', tipo: 'distancia', valor: d, texto: texto, resumo: 'Distância: ' + texto, pos: [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2], dy: 0, ang: MT.edgeAngleCss(A, B), off: MT.edgeOffsetAbove(A, B, 9) };
            }), cfg.edicoes);
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
                if (lab.classList && lab.classList.add) lab.classList.add('rotating');
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
            visibleMeasures().concat(distItems(), medItems()).forEach(it => {
                const p = cfg.posicoes[it.id];
                const pos = p ? [p.lat, p.lng] : it.pos;
                const off = p || !it.off ? [0, 0] : it.off; // depois de arrastado, o texto fica exatamente onde foi solto
                const rot = cfg.rotacoes[it.id] !== undefined ? cfg.rotacoes[it.id] : (it.ang || 0);
                const dica = it.editado ? 'Editado (calculado: ' + it.padrao + ')' : 'Duplo clique para editar • arraste para mover';
                const html = '<span class="report-measure-label' + (it.editado ? ' edited' : '') + '" style="left:' + off[0] + 'px;top:' + (it.dy + off[1]) + 'px;transform:' + labelTransform(rot) + ';' + estiloCss(cfg.medidas.estilo[it.grupo]) + corDoItem(it) + '" title="' + escapeHtml(dica) + '">' + escapeHtml(it.texto) + ROT_HANDLE + '</span>';
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

        // ------------------------------------------------------------ ferramentas de medição: ponto, distância e área
        function clearMedLayers() { state.mlayers.forEach(l => map.removeLayer(l)); state.mlayers = []; }
        function addMedLayer(l) { l.addTo(map); state.mlayers.push(l); }
        function applyMedicoes() {
            clearMedLayers();
            cfg.medicoes.itens.forEach(m => {
                if (m.tipo === 'ponto') addMedLayer(L.circleMarker(m.pts[0], { radius: 6, color: '#ffffff', weight: 2, fillColor: cfg.medicoes.cor, fillOpacity: 1, interactive: false }));
                else if (m.tipo === 'linha') {
                    addMedLayer(L.polyline(m.pts, { color: cfg.medicoes.cor, weight: 2.5, interactive: false }));
                    // número de cada vértice da linha (1, 2, 3...), ao lado de uma bolinha
                    m.pts.forEach((p, k) => {
                        const html = '<span class="report-point-dot" style="background:' + cfg.medicoes.cor + ';box-shadow:0 0 0 1px #164e63"></span><span class="report-point-label" style="left:10px;top:-10px;transform:translate(-50%,-50%);font-weight:700;color:' + cfg.medicoes.cor + ';text-shadow:' + haloDe(cfg.medicoes.cor) + '">' + (k + 1) + '</span>';
                        addMedLayer(L.marker(p, { icon: L.divIcon({ className: 'report-point', html: html, iconSize: [0, 0] }), interactive: false, keyboard: false, zIndexOffset: 1300 }));
                    });
                } else addMedLayer(L.polygon(m.pts, { color: cfg.medicoes.cor, weight: 2.5, fillColor: cfg.medicoes.cor, fillOpacity: 0.2, interactive: false }));
            });
            // desenho em andamento: linha/polígono provisório com os cliques dados e o ponto sob o mouse
            const d = state.draw;
            if (d && d.pts.length) {
                const seq = d.hover ? d.pts.concat([d.hover]) : d.pts;
                if (d.tipo === 'area' && seq.length >= 3) addMedLayer(L.polygon(seq, { color: cfg.medicoes.cor, weight: 2, dashArray: '5 4', fillColor: cfg.medicoes.cor, fillOpacity: 0.12, interactive: false }));
                else if (seq.length >= 2) addMedLayer(L.polyline(seq, { color: cfg.medicoes.cor, weight: 2, dashArray: '5 4', interactive: false }));
                d.pts.forEach(p => addMedLayer(L.circleMarker(p, { radius: 3.5, color: cfg.medicoes.cor, weight: 1.5, fillColor: '#a5f3fc', fillOpacity: 1, interactive: false })));
            }
        }
        function drawChanged() { applyMedicoes(); if (opts.onMeasureState) opts.onMeasureState(state.draw ? state.draw.pts.length : 0); }
        /** Cola o clique nos contornos da feição e das camadas ligadas (aderência), até ~14 px de distância. */
        function snapLatLng(ll) {
            if (!cfg.medicoes.aderencia) return [ll.lat, ll.lng];
            const mpp = 156543.03392 * Math.cos(ll.lat * Math.PI / 180) / Math.pow(2, map.getZoom ? map.getZoom() : 18);
            const lim = 14 * mpp;
            let best = MT.nearestOnGeometry(geometry, ll.lat, ll.lng);
            if (cfg.camadasVizinhas) {
                const on = new Set(cfg.camadasLigadas.map(String));
                camadas.forEach(c => { if (!on.has(String(c.id))) return; const p = MT.nearestOnCamada(c, ll.lat, ll.lng); if (p && (!best || p.d < best.d)) best = p; });
            }
            return best && best.d <= lim ? [best.lat, best.lng] : [ll.lat, ll.lng];
        }
        function onDrawClick(e) {
            const d = state.draw;
            if (!d || !e || !e.latlng) return;
            const p = snapLatLng(e.latlng);
            if (d.tipo === 'ponto') { api.addMedicao('ponto', [p]); state.draw = null; setMeasureCursor(false); drawChanged(); return; }
            d.pts.push(p);
            d.hover = null;
            drawChanged();
        }
        function onDrawMove(e) {
            const d = state.draw;
            if (!d || !d.pts.length || !e || !e.latlng) return;
            d.hover = [e.latlng.lat, e.latlng.lng];
            applyMedicoes();
        }
        map.on('mousemove', onDrawMove);
        map.on('dblclick', (e) => { if (state.draw && state.draw.tipo !== 'ponto') api.finishDraw(); });

        // ------------------------------------------------------------ distância até a camada de referência (dois cliques no mapa)
        function clearDistLines() { state.dlines.forEach(l => map.removeLayer(l)); state.dlines = []; }
        function applyDistLines() {
            clearDistLines();
            if (!cfg.referencia.ativo) return;
            cfg.referencia.medidas.forEach(m => {
                const cor = cfg.referencia.cor;
                const ln = L.polyline([m.a, m.b], { color: cor, weight: 2, dashArray: '6 4', interactive: false });
                ln.addTo(map);
                state.dlines.push(ln);
                [m.a, m.b].forEach(p => {
                    const c = L.circleMarker(p, { radius: 3.5, color: cor, weight: 1.5, fillColor: '#ffffff', fillOpacity: 1, interactive: false });
                    c.addTo(map);
                    state.dlines.push(c);
                });
            });
            if (state.measure && state.measure.fase === 2) {
                const c = L.circleMarker(state.measure.a, { radius: 4, color: '#b91c1c', weight: 2, fillColor: '#fca5a5', fillOpacity: 1, interactive: false });
                c.addTo(map);
                state.dlines.push(c);
            }
        }
        // Com uma ferramenta de medição ativa o mapa inteiro (feição, vértices, textos, camadas) deixa de reagir ao mouse e o cursor
        // fica em mira: dá para desenhar por cima, dentro e encostando na feição. Só volta ao normal ao concluir ou cancelar.
        function setMeasureCursor(on) {
            const c = map.getContainer ? map.getContainer() : null;
            if (!c) return;
            if (c.style) c.style.cursor = on ? 'crosshair' : '';
            if (c.classList) { if (on) c.classList.add('report-drawing'); else c.classList.remove('report-drawing'); }
        }
        function measureChanged() { applyDistLines(); if (opts.onMeasureState) opts.onMeasureState(state.measure ? state.measure.fase : 0); }
        function onMapClick(e) {
            if (state.draw) { onDrawClick(e); return; }
            if (!state.measure || !e || !e.latlng) return;
            const ll = e.latlng;
            if (state.measure.fase === 1) {
                const p = MT.nearestOnGeometry(geometry, ll.lat, ll.lng);
                if (!p) return;
                state.measure = { fase: 2, a: [p.lat, p.lng] };
                measureChanged();
                return;
            }
            const cam = camadas.find(x => String(x.id) === cfg.referencia.camada);
            const p = cam ? MT.nearestOnCamada(cam, ll.lat, ll.lng) : null;
            if (!p) return;
            api.addDistance(state.measure.a, [p.lat, p.lng]);
            state.measure = null;
            setMeasureCursor(false);
            measureChanged();
        }
        map.on('click', onMapClick);
        if (doc && doc.addEventListener) doc.addEventListener('keydown', (ev) => {
            if (!ev) return;
            if (ev.key === 'Escape') { if (state.measure) api.cancelDistMeasure(); if (state.draw) api.cancelDraw(); }
            else if (ev.key === 'Enter' && state.draw && state.draw.tipo !== 'ponto') api.finishDraw();
        });

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

        // ------------------------------------------------------------ mapa de localização (card próprio: mapa de referência, camadas e norte da própria caixa)
        function applySituacao() {
            const box = el('map-locator');
            // display explícito: o CSS da caixa é "display:none", então '' (voltar ao CSS) a deixaria invisível
            if (box && box.style) box.style.display = cfg.situacao.ativo ? 'block' : 'none';
            if (!cfg.situacao.ativo || !box) return;
            if (!state.locator) {
                const lm = L.map(box, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false, preferCanvas: true });
                const ct = center || [-34.8, -7];
                if (L.circleMarker) L.circleMarker([ct[1], ct[0]], { radius: 4, color: '#dc2626', weight: 2, fillColor: '#dc2626', fillOpacity: 1, interactive: false }).addTo(lm);
                let norteEl = null;
                if (box.appendChild && doc && doc.createElement) {
                    norteEl = doc.createElement('div');
                    norteEl.className = 'report-locator-north';
                    norteEl.innerHTML = '<span class="material-symbols-outlined">navigation</span>';
                    box.appendChild(norteEl);
                }
                state.locator = { map: lm, rect: null, base: null, baseKey: null, camadaLayers: {}, norteEl: norteEl };
            }
            const loc = state.locator;
            const lm = loc.map;

            // mapa de referência da própria caixa (independente do mapa base principal)
            const baseKey = cfg.situacao.baseMap || 'osm';
            if (loc.baseKey !== baseKey) {
                if (loc.base) { lm.removeLayer(loc.base); loc.base = null; }
                if (baseKey !== 'nenhum') {
                    const src = TILES[baseKey] || TILES.osm;
                    loc.base = L.tileLayer(src.url, { maxZoom: 19, crossOrigin: true });
                    loc.base.addTo(lm);
                }
                loc.baseKey = baseKey;
            }

            // camadas escolhidas para aparecer no mapa de localização (além do ponto vermelho da feição)
            const idsOn = new Set((cfg.situacao.camadas || []).map(String));
            Object.keys(loc.camadaLayers).forEach(id => { if (!idsOn.has(id)) { lm.removeLayer(loc.camadaLayers[id]); delete loc.camadaLayers[id]; } });
            camadas.forEach(c => {
                const id = String(c.id);
                if (!idsOn.has(id) || loc.camadaLayers[id]) return;
                loc.camadaLayers[id] = L.geoJSON({ type: 'FeatureCollection', features: c.features }, {
                    style: () => ({ color: c.color, weight: 1, fillColor: c.color, fillOpacity: 0.15 }),
                    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 3, color: c.color, weight: 1, fillColor: c.color, fillOpacity: 0.8 }),
                    interactive: false
                });
                loc.camadaLayers[id].addTo(lm);
            });

            // seta do norte da caixa (a caixa toda gira com a rotação do próprio mapa de localização, sempre 0° por ora)
            if (loc.norteEl && loc.norteEl.style) loc.norteEl.style.display = cfg.situacao.norte ? 'flex' : 'none';

            if (lm.invalidateSize) lm.invalidateSize();
            const ct = center || [-34.8, -7];
            lm.setView([ct[1], ct[0]], Math.max(1, Math.round(map.getZoom()) - 6), { animate: false });
            if (loc.rect) { lm.removeLayer(loc.rect); loc.rect = null; }
            if (L.rectangle && map.getBounds) loc.rect = L.rectangle(map.getBounds(), { color: '#dc2626', weight: 1.5, fill: false, interactive: false }).addTo(lm);
        }

        // ------------------------------------------------------------ anotações de texto (arraste = mover; duplo clique = editar)
        function clearNotes() { Object.keys(state.notes).forEach(id => { map.removeLayer(state.notes[id]); delete state.notes[id]; }); }
        function applyNotes() {
            clearNotes();
            cfg.anotacoes.forEach(n => {
                const rot = n.rot !== undefined ? n.rot : 0;
                const html = '<span class="report-note-label" style="transform:' + labelTransform(rot) + ';' + estiloCss(n.estilo) + '" title="Duplo clique para editar • arraste para mover">' + escapeHtml(n.texto) + ROT_HANDLE + '</span>';
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
                wireRotate(mk, '.report-note-label', () => rot, (deg) => setNoteRot(n.id, deg), () => setNoteRot(n.id, undefined));
            });
        }

        function setNoteRot(id, deg) {
            cfg.anotacoes = MT.normalizeAnotacoes(cfg.anotacoes.map(a => {
                if (a.id !== id) return a;
                const b = Object.assign({}, a);
                if (deg === undefined) delete b.rot; else b.rot = deg;
                return b;
            }));
            applyNotes();
            notify();
        }

        // ------------------------------------------------------------ pontos nos vértices
        function clearPointLayers() {
            Object.keys(state.pts).forEach(k => { map.removeLayer(state.pts[k]); delete state.pts[k]; });
        }

        // as linhas da tabela dependem só dos pontos e das camadas: guardadas até a configuração dos pontos mudar
        function pointRowsNow() {
            const chave = JSON.stringify(cfg.pontos);
            if (!state.prCache || state.prCache.chave !== chave) state.prCache = { chave: chave, valor: MT.pointRows(geometry, cfg.pontos, { camadas: camadas }) };
            return state.prCache.valor;
        }

        /**
         * Normaliza o novo estado dos pontos em relação ao anterior: trocar a sequência recalcula azimutes/distâncias e
         * trocar o sistema muda as colunas (as edições dessas células não valem mais); pontos que saíram perdem posição e giro.
         */
        function aplicarPontos(next) {
            const ant = cfg.pontos;
            const textos = Object.assign({}, next.textos || {});
            const mudouOrdem = JSON.stringify(next.ordem) !== JSON.stringify(ant.ordem);
            const mudouSistema = next.sistema !== ant.sistema;
            const mudouConf = JSON.stringify(next.colConf) !== JSON.stringify(ant.colConf);
            Object.keys(textos).forEach(k => { if ((mudouOrdem && /:(az|dist|or|cf)$/.test(k)) || (mudouSistema && /:c[0-9]$/.test(k)) || (mudouConf && /:cf$/.test(k))) delete textos[k]; });
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
                h.on('click', (e) => { if (state.measure || state.draw) onMapClick(e); else api.addPoint(v.id); });
                state.pts['h:' + v.id] = h;
            });
            // pontos marcados: a bolinha fica no vértice; o nome é um texto à parte (arrastar move, ↻ gira, dois cliques renomeiam)
            pointRowsNow().rows.forEach(r => {
                const dot = L.marker([r.lat, r.lng], { icon: L.divIcon({ className: 'report-point', html: '<span class="report-point-dot"' + (cfg.pontos.cor !== MT.MAP_DEFAULTS.pontos.cor ? ' style="background:' + cfg.pontos.cor + '"' : '') + '></span>', iconSize: [0, 0] }), interactive: false, keyboard: false, zIndexOffset: 1400 });
                dot.addTo(map);
                state.pts['d:' + r.vid] = dot;
                const p = cfg.posicoes[r.vid];
                const pos = p ? [p.lat, p.lng] : [r.lat, r.lng];
                const off = p ? [0, 0] : POINT_LABEL_OFFSET; // sem posição escolhida, o nome fica ao lado do ponto
                const rot = cfg.rotacoes[r.vid] !== undefined ? cfg.rotacoes[r.vid] : 0;
                const html = '<span class="report-point-label" style="left:' + off[0] + 'px;top:' + off[1] + 'px;transform:' + labelTransform(rot) + ';' + estiloCss(cfg.pontos.estilo) + corTexto(cfg.pontos.cor, MT.MAP_DEFAULTS.pontos.cor) + '" title="Duplo clique para renomear • arraste para mover">' + escapeHtml(r.titulo) + ROT_HANDLE + '</span>';
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

        // ------------------------------------------------------------ legenda editável e elementos que o usuário move
        const LEG_ID = (id) => String(id).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64);
        /** Itens da legenda: { key, cor, padrao, nome (o que aparece), oculto }. */
        function legendItems() {
            const itens = [];
            if (cfg.destaque.ativo) itens.push({ key: 'feicao', cor: cfg.destaque.cor, padrao: 'Feição do relatório' });
            if (cfg.camadasVizinhas) {
                const on = new Set(cfg.camadasLigadas.map(String));
                camadas.filter(c => on.has(String(c.id))).forEach(c => itens.push({ key: 'c:' + LEG_ID(c.id), cor: c.color, padrao: c.name + (c.truncated ? ' *' : '') }));
            }
            return itens.map(i => ({ key: i.key, cor: i.cor, padrao: i.padrao, nome: cfg.legenda.nomes[i.key] || i.padrao, oculto: cfg.legenda.ocultos.indexOf(i.key) >= 0 }));
        }

        function onLegendDbl(ev) {
            const row = ev && ev.target && ev.target.closest ? ev.target.closest('[data-leg]') : null;
            if (!row || !doc) return;
            const span = row.querySelector ? row.querySelector('span') : null;
            const key = row.getAttribute('data-leg');
            const item = legendItems().find(i => i.key === key);
            if (!span || !item) return;
            const input = doc.createElement('input');
            input.type = 'text';
            input.value = item.nome;
            input.maxLength = 60;
            input.className = 'report-measure-input';
            span.textContent = '';
            span.appendChild(input);
            if (input.focus) input.focus();
            if (input.select) input.select();
            let feito = false;
            const fim = (grava) => {
                if (feito) return;
                feito = true;
                if (grava) api.renameLegend(key, input.value); else applyOverlays();
            };
            const stop = (e) => { if (e && e.stopPropagation) e.stopPropagation(); };
            input.addEventListener('keydown', (e) => { stop(e); if (e.key === 'Enter') fim(true); else if (e.key === 'Escape') fim(false); });
            input.addEventListener('blur', () => fim(true));
            ['mousedown', 'pointerdown', 'dblclick', 'click'].forEach(n => input.addEventListener(n, stop));
        }

        // norte, escala (barra e texto), projeção e legenda: arrastar muda de lugar (deslocamento guardado em fração do mapa)
        function mapSize() {
            const c = map.getContainer ? map.getContainer() : null;
            if (!c) return { w: 0, h: 0 };
            const r = c.getBoundingClientRect ? c.getBoundingClientRect() : null;
            return { w: c.clientWidth || (r && r.width) || 0, h: c.clientHeight || (r && r.height) || 0 };
        }
        function elementoMovel(key) {
            if (key === 'norte') return el('map-north');
            if (key === 'escalaTexto') return el('map-escala-txt');
            if (key === 'projecao') return el('map-proj-txt');
            if (key === 'legenda') return el('map-legend');
            if (key === 'situacao') return el('map-locator');
            if (key === 'escala') return state.scaleControl && state.scaleControl.getContainer ? state.scaleControl.getContainer() : null;
            return null;
        }
        function wireMove(e, key) {
            if (!e || !e.addEventListener || e._reportMove || !doc || !doc.addEventListener) return;
            e._reportMove = true;
            e.addEventListener('mousedown', (ev) => { if (ev && ev.stopPropagation && !(ev.target && ev.target.tagName === 'INPUT')) ev.stopPropagation(); });
            e.addEventListener('pointerdown', (ev) => {
                if (!ev || (ev.target && ev.target.tagName === 'INPUT')) return;
                if (ev.stopPropagation) ev.stopPropagation();
                if (ev.preventDefault) ev.preventDefault();
                const c = map.getContainer ? map.getContainer() : null;
                if (!c || !c.getBoundingClientRect || !e.getBoundingClientRect) return;
                const cr = c.getBoundingClientRect(), er = e.getBoundingClientRect();
                const W = cr.width || 1, H = cr.height || 1;
                const cur = cfg.elementos[key] || { dx: 0, dy: 0 };
                let dx = cur.dx * W, dy = cur.dy * H;
                const move = (m) => {
                    // o elemento não sai da área do mapa
                    const ddx = Math.max(cr.left - er.left, Math.min(cr.right - er.right, m.clientX - ev.clientX));
                    const ddy = Math.max(cr.top - er.top, Math.min(cr.bottom - er.bottom, m.clientY - ev.clientY));
                    dx = cur.dx * W + ddx; dy = cur.dy * H + ddy;
                    e.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px)';
                };
                const up = () => {
                    doc.removeEventListener('pointermove', move);
                    doc.removeEventListener('pointerup', up);
                    api.setElemento(key, dx / W, dy / H);
                };
                doc.addEventListener('pointermove', move);
                doc.addEventListener('pointerup', up);
            });
        }
        function applyElementPositions() {
            const sz = mapSize();
            MOVEIS.forEach(key => {
                const e = elementoMovel(key);
                if (!e || !e.style) return;
                const p = cfg.elementos[key];
                e.style.transform = p && sz.w && sz.h ? 'translate(' + Math.round(p.dx * sz.w) + 'px,' + Math.round(p.dy * sz.h) + 'px)' : '';
                wireMove(e, key);
            });
        }

        function applyOverlays() {
            show(el('map-north'), !!cfg.norte);

            if (state.scaleControl) { map.removeControl(state.scaleControl); state.scaleControl = null; }
            if (cfg.escala && L.control && L.control.scale) {
                state.scaleControl = L.control.scale({ imperial: false, metric: true, position: 'bottomleft', maxWidth: 140 });
                state.scaleControl.addTo(map);
            }

            // escala aproximada e sistema de projeção: dois quadros separados, cada um com a própria posição
            const escTxt = el('map-escala-txt'), projTxt = el('map-proj-txt');
            if (escTxt) { escTxt.textContent = scaleText(); show(escTxt, !!cfg.escala); }
            if (projTxt) { projTxt.textContent = proj.label; show(projTxt, !!cfg.projecao); }
            show(el('map-info-wrap'), !!(cfg.escala || cfg.projecao));

            const legend = el('map-legend');
            if (legend) {
                const visiveis = legendItems().filter(i => !i.oculto);
                legend.innerHTML = visiveis.map(i => '<div data-leg="' + escapeHtml(i.key) + '" title="Duplo clique para renomear"><i style="background:' + escapeHtml(i.cor) + '"></i><span>' + escapeHtml(i.nome) + '</span></div>').join('');
                show(legend, visiveis.length > 0);
                if (legend.addEventListener && !legend._reportLeg) { legend._reportLeg = true; legend.addEventListener('dblclick', onLegendDbl); }
            }
            applyElementPositions();
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
            applyDistLines();
            applyMedicoes();
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
                ['rotulos', 'confrontantes', 'referencia', 'comparacaoArea', 'situacao', 'quadriculado', 'medicoes'].forEach(k => { next[k] = Object.assign({}, cfg[k], (patch && patch[k]) || {}); });
                const pontosNovos = next.pontos;
                const camadaAnt = cfg.confrontantes.camada;
                const refAnt = cfg.referencia.camada;
                cfg = MT.normalizeMapConfig({ mapa: Object.assign({}, next, { pontos: cfg.pontos }) }); // o resto normalizado; os pontos passam por aplicarPontos
                aplicarPontos(pontosNovos);
                // outra camada de confrontantes: os nomes escritos para os vizinhos da anterior não valem mais
                if (cfg.confrontantes.camada !== camadaAnt) {
                    const tx = Object.assign({}, cfg.confrontantes.textos);
                    Object.keys(tx).forEach(k => { if (/:conf$/.test(k)) delete tx[k]; });
                    cfg.confrontantes = MT.normalizeConfrontantes(Object.assign({}, cfg.confrontantes, { textos: tx }));
                }
                if (cfg.referencia.camada !== refAnt) cfg.referencia = MT.normalizeReferencia(Object.assign({}, cfg.referencia, { medidas: [] }));
                if (state.measure && (!cfg.referencia.ativo || cfg.referencia.camada !== refAnt)) { state.measure = null; setMeasureCursor(false); }
                apply();
            },
            /** Largura (% da folha) de um card de "Análises da Feição": 'comp' ou 'med:N'. 100 (ou vazio) volta ao padrão. */
            setAnaliseLargura(id, pct) {
                const largura = Object.assign({}, cfg.analises.largura);
                if (pct === undefined || pct === null || pct === '') delete largura[id]; else largura[id] = pct;
                cfg.analises = MT.normalizeAnalises({ largura: largura });
                notify();
            },
            /** Define de uma vez a largura de vários cards: { id: pct }. */
            setAnalisesLargura(mapa) {
                cfg.analises = MT.normalizeAnalises({ largura: mapa || {} });
                notify();
            },
            /** Liga/desliga uma camada vizinha pelo id. */
            toggleLayer(id, on) {
                const set = new Set(cfg.camadasLigadas.map(String));
                if (on) set.add(String(id)); else set.delete(String(id));
                cfg = Object.assign({}, cfg, { camadasLigadas: Array.from(set) });
                apply();
            },
            /** Liga/desliga uma camada pelo id no mapa de localização (card próprio, independente das camadas do mapa principal). */
            toggleLocatorLayer(id, on) {
                const set = new Set(cfg.situacao.camadas.map(String));
                if (on) set.add(String(id)); else set.delete(String(id));
                cfg.situacao = MT.normalizeSituacao(Object.assign({}, cfg.situacao, { camadas: Array.from(set) }));
                applySituacao();
                notify();
            },
            /** Configuração completa para salvar (inclui a vista atual). */
            snapshot() {
                return Object.assign({}, cfg, {
                    camadasLigadas: cfg.camadasLigadas.slice(), destaque: Object.assign({}, cfg.destaque), medidas: JSON.parse(JSON.stringify(cfg.medidas)),
                    edicoes: Object.assign({}, cfg.edicoes), posicoes: Object.assign({}, cfg.posicoes), rotacoes: Object.assign({}, cfg.rotacoes),
                    pontos: Object.assign({}, cfg.pontos, { ordem: cfg.pontos.ordem.slice(), titulos: Object.assign({}, cfg.pontos.titulos) }),
                    rotulos: JSON.parse(JSON.stringify(cfg.rotulos)), confrontantes: JSON.parse(JSON.stringify(cfg.confrontantes)), referencia: JSON.parse(JSON.stringify(cfg.referencia)), analises: JSON.parse(JSON.stringify(cfg.analises)), medicoes: JSON.parse(JSON.stringify(cfg.medicoes)), elementos: JSON.parse(JSON.stringify(cfg.elementos)), legenda: JSON.parse(JSON.stringify(cfg.legenda)),
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
            /** Altura do mapa na folha (mm): 40 a 400. Quem chama repagina a folha. */
            setAltura(mm) {
                const n = Number(mm);
                if (!isFinite(n)) return;
                cfg.alturaMm = Math.round(Math.min(400, Math.max(40, n)));
                notify();
            },
            /** Apaga as edições e as posições dos rótulos (volta ao calculado). */
            resetMeasures() {
                // só as medidas da feição: nomes dos pontos (v:N), distâncias tiradas (dist:N) e medições livres (med:N) ficam
                const soPontos = (m) => { const out = {}; Object.keys(m).forEach(k => { if (/^(v|dist|med|mseg):/.test(k)) out[k] = m[k]; }); return out; };
                cfg.edicoes = soPontos(cfg.edicoes); cfg.posicoes = soPontos(cfg.posicoes); cfg.rotacoes = soPontos(cfg.rotacoes); apply();
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
            // ---- elementos que o usuário move e legenda editável
            /** Deslocamento de um elemento (norte, escala, escalaTexto, projecao, legenda) em fração do tamanho do mapa. (0, 0) volta ao lugar padrão. */
            setElemento(key, dx, dy) {
                if (MOVEIS.indexOf(key) < 0) return;
                const elementos = Object.assign({}, cfg.elementos, { [key]: { dx: dx, dy: dy } });
                cfg.elementos = MT.normalizeElementos(elementos);
                applyOverlays();
                notify();
            },
            resetElementos() { cfg.elementos = {}; applyOverlays(); notify(); },
            legendItems: legendItems,
            /** Troca o nome de um item da legenda; vazio ou igual ao original volta ao original. */
            renameLegend(key, texto) {
                const item = legendItems().find(i => i.key === key);
                if (!item) return;
                const limpo = MT.normalizeLegenda({ nomes: { [key]: texto } }).nomes[key];
                const nomes = Object.assign({}, cfg.legenda.nomes);
                if (!limpo || limpo === item.padrao) delete nomes[key]; else nomes[key] = limpo;
                cfg.legenda = MT.normalizeLegenda({ nomes: nomes, ocultos: cfg.legenda.ocultos });
                applyOverlays();
                notify();
            },
            /** Mostra ou oculta um item da legenda. */
            toggleLegend(key, visivel) {
                const ocultos = cfg.legenda.ocultos.filter(k => k !== key);
                if (!visivel) ocultos.push(key);
                cfg.legenda = MT.normalizeLegenda({ nomes: cfg.legenda.nomes, ocultos: ocultos });
                applyOverlays();
                notify();
            },
            resetLegenda() { cfg.legenda = MT.normalizeLegenda({}); applyOverlays(); notify(); },
            // ---- ferramentas de medição (cópia da "Ferramenta de Medição" do mapa principal)
            /** Começa a desenhar: 'ponto' (um clique), 'linha' (comprimento) ou 'area' (área e perímetro). Concluir: duplo clique, Enter ou finishDraw(). */
            startDraw(tipo) {
                if (!['ponto', 'linha', 'area'].includes(tipo) || cfg.medicoes.itens.length >= 30) return false;
                state.measure = null;
                state.draw = { tipo: tipo, pts: [], hover: null };
                setMeasureCursor(true);
                if (map.doubleClickZoom && map.doubleClickZoom.disable) map.doubleClickZoom.disable();
                drawChanged();
                return true;
            },
            /** Conclui a linha/polígono em desenho (com pontos suficientes); pontos repetidos no fim (do duplo clique) são tirados. */
            finishDraw() {
                const d = state.draw;
                if (!d) return null;
                const pts = d.pts.filter((p, i) => i === 0 || MT.distanceM([p[1], p[0]], [d.pts[i - 1][1], d.pts[i - 1][0]]) > 0.05);
                state.draw = null;
                setMeasureCursor(false);
                if (map.doubleClickZoom && map.doubleClickZoom.enable) map.doubleClickZoom.enable();
                const id = pts.length >= (d.tipo === 'linha' ? 2 : 3) ? api.addMedicao(d.tipo, pts) : null;
                drawChanged();
                if (id && d.tipo === 'area' && opts.onMedicaoCriada) opts.onMedicaoCriada(id, 'area'); // a página pergunta que tipo de área é
                return id;
            },
            cancelDraw() {
                if (!state.draw) return;
                state.draw = null;
                setMeasureCursor(false);
                if (map.doubleClickZoom && map.doubleClickZoom.enable) map.doubleClickZoom.enable();
                drawChanged();
            },
            /** { tipo, pontos } do desenho em andamento, ou null. */
            drawState() { return state.draw ? { tipo: state.draw.tipo, pontos: state.draw.pts.length } : null; },
            /** Guarda uma medição pronta. Devolve o id ('med:N') ou null (limite/valores inválidos). */
            addMedicao(tipo, pts) {
                const usados = cfg.medicoes.itens.map(m => Number(m.id.slice(4)));
                let n = 1; while (usados.indexOf(n) >= 0) n++;
                const med = MT.normalizeMedicoes(Object.assign({}, cfg.medicoes, { itens: cfg.medicoes.itens.concat([{ id: 'med:' + n, tipo: tipo, pts: pts }]) }));
                if (med.itens.length === cfg.medicoes.itens.length) return null;
                cfg.medicoes = med;
                apply();
                return 'med:' + n;
            },
            /** Que tipo de área é (construção, galpão, pérgola...): aparece no texto do mapa e nas análises. Vazio tira o nome. */
            setMedicaoNome(id, nome) {
                const itens = cfg.medicoes.itens.map(m => m.id === id ? Object.assign({}, m, { nome: nome }) : m);
                cfg.medicoes = MT.normalizeMedicoes(Object.assign({}, cfg.medicoes, { itens: itens }));
                apply();
            },
            /** Marca um ponto pelas coordenadas digitadas; se ficar fora do enquadramento, o mapa passa a mostrar a feição e o ponto. */
            addMedicaoPonto(lat, lng) {
                const id = api.addMedicao('ponto', [[lat, lng]]);
                if (id && bbox && map.getBounds && map.fitBounds) {
                    const b = map.getBounds();
                    if (b && b.contains && !b.contains([lat, lng])) {
                        map.fitBounds([[Math.min(bbox[1], lat), Math.min(bbox[0], lng)], [Math.max(bbox[3], lat), Math.max(bbox[2], lng)]], { padding: [30, 30], maxZoom: 19 });
                    }
                }
                return id;
            },
            removeMedicao(id) {
                const alvo = cfg.medicoes.itens.find(m => m.id === id);
                const ids = alvo ? MT.medicaoIds(alvo) : [id];
                cfg.medicoes = MT.normalizeMedicoes(Object.assign({}, cfg.medicoes, { itens: cfg.medicoes.itens.filter(m => m.id !== id) }));
                const sem = (m) => { const out = {}; Object.keys(m).forEach(k => { if (ids.indexOf(k) < 0) out[k] = m[k]; }); return out; };
                cfg.edicoes = sem(cfg.edicoes); cfg.posicoes = sem(cfg.posicoes); cfg.rotacoes = sem(cfg.rotacoes);
                apply();
            },
            clearMedicoes() {
                const ids = [].concat.apply([], cfg.medicoes.itens.map(m => MT.medicaoIds(m)));
                cfg.medicoes = MT.normalizeMedicoes(Object.assign({}, cfg.medicoes, { itens: [] }));
                const sem = (m) => { const out = {}; Object.keys(m).forEach(k => { if (ids.indexOf(k) < 0) out[k] = m[k]; }); return out; };
                cfg.edicoes = sem(cfg.edicoes); cfg.posicoes = sem(cfg.posicoes); cfg.rotacoes = sem(cfg.rotacoes);
                apply();
            },
            /** Medições com os números e as coordenadas nos três formatos, para o painel e para o texto da folha. */
            medicaoRows() {
                return cfg.medicoes.itens.map(m => {
                    const info = MT.medicaoInfo(m);
                    return { id: m.id, tipo: m.tipo, numero: Number(m.id.slice(4)), nome: m.nome || '', info: info, coords: MT.coordTriple(info.centro.lat, info.centro.lng), texto: (medItems().find(x => x.id === m.id) || {}).texto, npts: m.pts.length };
                });
            },
            // ---- distância feição → camada de referência, medida pelo usuário com dois cliques
            /** 0 = parado; 1 = falta o ponto na feição; 2 = falta o ponto na camada. */
            measureState() { return state.measure ? state.measure.fase : 0; },
            startDistMeasure() {
                if (!cfg.referencia.ativo || !cfg.referencia.camada || cfg.referencia.medidas.length >= 20) return false;
                if (state.draw) api.cancelDraw();
                state.measure = { fase: 1, a: null };
                setMeasureCursor(true);
                measureChanged();
                return true;
            },
            cancelDistMeasure() { state.measure = null; setMeasureCursor(false); measureChanged(); },
            /** Guarda uma distância entre dois pontos [lat, lng] (o ponto na feição e o ponto na camada). Devolve o id. */
            addDistance(a, b) {
                const usados = cfg.referencia.medidas.map(m => Number(m.id.slice(5)));
                let n = 1; while (usados.indexOf(n) >= 0) n++;
                const ref = MT.normalizeReferencia(Object.assign({}, cfg.referencia, { medidas: cfg.referencia.medidas.concat([{ id: 'dist:' + n, a: a, b: b }]) }));
                if (ref.medidas.length === cfg.referencia.medidas.length) return null;
                cfg.referencia = ref;
                apply();
                return 'dist:' + n;
            },
            removeDistance(id) {
                cfg.referencia = MT.normalizeReferencia(Object.assign({}, cfg.referencia, { medidas: cfg.referencia.medidas.filter(m => m.id !== id) }));
                const sem = (m) => { const out = Object.assign({}, m); delete out[id]; return out; };
                cfg.edicoes = sem(cfg.edicoes); cfg.posicoes = sem(cfg.posicoes); cfg.rotacoes = sem(cfg.rotacoes);
                apply();
            },
            /** Distâncias tiradas, com o texto final (editado ou calculado): { id, texto, metros, editado }. */
            distanceRows() { return distItems().map(it => ({ id: it.id, texto: it.texto, metros: it.valor, editado: it.editado })); },
            // ---- tabela de confrontantes: linhas na ordem escolhida, com os textos editados
            confrontanteRows() {
                const c = cfg.confrontantes;
                if (!c.ativo || !c.camada) return [];
                const cam = camadas.find(x => String(x.id) === c.camada);
                if (!cam) return [];
                const chave = c.camada + '|' + c.tolM;
                if (!state.confCache || state.confCache.chave !== chave) state.confCache = { chave: chave, rows: MT.confrontantes(geometry, cam, { tolM: c.tolM }) };
                return MT.applyConfrontantes(state.confCache.rows, c);
            },
            /** Texto da tabela de confrontantes escrito pelo usuário: 'lado:K:lado' ou 'lado:K:conf'. Vazio volta ao calculado. */
            setConfrontanteTexto(chave, texto) {
                const textos = Object.assign({}, cfg.confrontantes.textos);
                const limpo = MT.normalizeConfrontantes({ textos: { [chave]: texto } }).textos[chave];
                if (limpo) textos[chave] = limpo; else delete textos[chave];
                cfg.confrontantes = MT.normalizeConfrontantes(Object.assign({}, cfg.confrontantes, { textos: textos }));
                notify();
            },
            /** Sobe (-1) ou desce (+1) uma linha da tabela de confrontantes. */
            moveConfrontante(id, dir) {
                const ids = api.confrontanteRows().map(r => r.id);
                const i = ids.indexOf(id), j = i + (dir < 0 ? -1 : 1);
                if (i < 0 || j < 0 || j >= ids.length) return;
                ids.splice(j, 0, ids.splice(i, 1)[0]);
                cfg.confrontantes = MT.normalizeConfrontantes(Object.assign({}, cfg.confrontantes, { ordem: ids }));
                notify();
            },
            resetConfrontantes() { cfg.confrontantes = MT.normalizeConfrontantes(Object.assign({}, cfg.confrontantes, { ordem: [], textos: {} })); notify(); },
            /** Volta os rótulos das feições vizinhas para o centro de cada feição, sem giro. */
            resetRotulos() { cfg.rotulos = MT.normalizeRotulos(Object.assign({}, cfg.rotulos, { itens: {} })); redrawNeighborLabels(); notify(); },
            clearPoints() { setPontos({ ordem: [], titulos: {}, textos: {} }); },
            /** Largura (% da tabela) de uma coluna ajustável da tabela de pontos: 'dist' ou 'cf'. Sem valor volta ao automático. */
            setColunaPontos(chave, pct) {
                if (chave !== 'dist' && chave !== 'cf') return;
                const colunas = Object.assign({}, cfg.pontos.colunas);
                if (pct === undefined || pct === null || pct === '') delete colunas[chave]; else colunas[chave] = pct;
                setPontos({ colunas: colunas });
            },
            /** Coluna "Confrontantes" da tabela de pontos: { ativo, camadas: [{ id, campos, logradouro }], tolM, distLogM }. */
            setColConf(cc) { setPontos({ colConf: cc }); },
            /** Texto da tabela de pontos escrito pelo usuário: 'titulo' ou 'v:N:c0|az|dist|or|cf'. Vazio volta ao calculado. */
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
            /** Liga/desliga negrito ('n'), itálico ('i') ou sublinhado ('s') de uma anotação. */
            styleNote(id, k) {
                if (['n', 'i', 's'].indexOf(k) < 0) return;
                cfg.anotacoes = MT.normalizeAnotacoes(cfg.anotacoes.map(a => a.id === id ? Object.assign({}, a, { estilo: Object.assign({}, a.estilo, { [k]: !(a.estilo && a.estilo[k]) }) }) : a));
                applyNotes();
                notify();
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
