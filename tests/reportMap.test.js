// tests/reportMap.test.js
// Controlador do mini-mapa do relatório, com um Leaflet e um DOM simulados.
// Rodar com: node tests/reportMap.test.js

const MT = require('../src/mapTools.js');
const RM = require('../src/reportMap.js');

let total = 0;
let failed = 0;
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

// ---------------------------------------------------------------- Leaflet simulado
function makeEl(tag) {
    return {
        tag, children: [], textContent: '', style: {}, listeners: {}, value: '', focused: false,
        appendChild(c) { this.children.push(c); },
        addEventListener(n, fn) { this.listeners[n] = fn; },
        focus() { this.focused = true; }, select() {}
    };
}

function makeL() {
    class Layer {
        constructor(kind, args) { this.kind = kind; this.args = args; this.handlers = {}; }
        addTo(m) { m.layers.add(this); this.map = m; return this; }
        on(ev, fn) { this.handlers[ev] = fn; return this; }
        bringToFront() { this.front = true; }
    }
    class Marker extends Layer {
        constructor(pos, o) {
            super('marker', { pos, o });
            this.handlers = {};
            this.latlng = { lat: pos[0], lng: pos[1] };
            this.draggingOff = false;
            this.dragging = { disable: () => { this.draggingOff = true; } };
            this.root = makeEl('div');
            this.span = makeEl('span');
            this.root.querySelector = () => this.span;
        }
        on(ev, fn) { this.handlers[ev] = fn; return this; }
        getLatLng() { return this.latlng; }
        getElement() { return this.root; }
    }
    class Control {
        constructor(kind, o) { this.kind = kind; this.o = o; }
        addTo(m) { m.controls.add(this); return this; }
    }
    class FakeMap {
        constructor(container, options) {
            this.container = container; this.options = options;
            this.layers = new Set(); this.controls = new Set(); this.handlers = {};
            this.zoom = 18; this.center = { lat: -7.015, lng: -34.835 };
            this.attributionControl = { setPrefix: (v) => { this.prefix = v; } };
            this.cont = { style: {} };
        }
        removeLayer(l) { this.layers.delete(l); }
        removeControl(c) { this.controls.delete(c); }
        on(ev, fn) { this.handlers[ev] = fn; }
        fitBounds(b, o) { this.fitted = { b, o }; }
        setView(c, z) { this.center = { lat: c[0], lng: c[1] }; this.zoom = z; this.viewSet = { c, z }; }
        getCenter() { return this.center; }
        getZoom() { return this.zoom; }
        getContainer() { return this.cont; }
        getBounds() { const c = this.center; return { getWest: () => c.lng - 0.0012, getSouth: () => c.lat - 0.001, getEast: () => c.lng + 0.0012, getNorth: () => c.lat + 0.001 }; }
    }
    const created = [];
    const L = {
        __maps: created,
        polyline: (p, o) => new Layer('polyline', { p, o }),
        rectangle: (b, o) => new Layer('rectangle', { b, o }),
        map: (c, o) => { const m = new FakeMap(c, o); created.push(m); return m; },
        tileLayer: (u, o) => new Layer('tile', { u, o }),
        geoJSON: (d, o) => new Layer('geojson', { d, o }),
        polygon: (p, o) => new Layer('polygon', { p, o }),
        circleMarker: (ll, o) => new Layer('circle', { ll, o }),
        divIcon: (o) => Object.assign({ divIcon: true }, o),
        marker: (p, o) => new Marker(p, o),
        control: { scale: (o) => new Control('scale', o) }
    };
    return L;
}

function makeDoc(ids) {
    const els = {};
    ids.forEach(id => { els[id] = { style: {}, innerHTML: '', textContent: '' }; });
    return { els, getElementById: (id) => els[id] || null, createElement: (tag) => makeEl(tag) };
}

const poly = { type: 'Polygon', coordinates: [[[-34.84, -7.02], [-34.83, -7.02], [-34.83, -7.01], [-34.84, -7.01], [-34.84, -7.02]]] };
const camadas = [
    { id: '1', name: 'Lotes <vizinhos>', color: '#ff0000', kind: 'polygon', features: [{ type: 'Feature', properties: {}, geometry: poly }], truncated: false },
    { id: '4', name: 'Linhas', color: '#00ff00', kind: 'line', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-34.84, -7.02], [-34.83, -7.01]] } }], truncated: true }
];
const ids = ['map-north', 'map-info-wrap', 'map-escala-txt', 'map-proj-txt', 'map-legend', 'map-sides-text', 'map-area-text', 'map-locator'];

function build(config, geometry, extra) {
    const L = makeL();
    const doc = makeDoc(ids);
    const changes = [];
    const ctl = RM.create(Object.assign({
        L, MapTools: MT, container: 'mapa', doc, geometry: geometry === undefined ? poly : geometry, camadas,
        config: MT.normalizeMapConfig(config || {}), onChange: (c) => changes.push(c)
    }, extra || {}));
    const layersOf = (kind) => Array.from(ctl.map.layers).filter(l => l.kind === kind);
    return { L, doc, ctl, changes, layersOf, map: ctl.map };
}

// ---------------------------------------------------------------- estado inicial
let t = build({});
ok('mapa base OSM ligado (com crédito visível)', t.layersOf('tile').length === 1 && /openstreetmap/.test(t.layersOf('tile')[0].args.u) && /OpenStreetMap/.test(t.layersOf('tile')[0].args.o.attribution));
ok('atribuição do mapa fica visível (prefixo do Leaflet removido)', t.map.options.attributionControl === true && t.map.prefix === false);
ok('tiles pedem CORS (permite exportar o mapa como imagem)', t.layersOf('tile')[0].args.o.crossOrigin === true);
ok('feição destacada por cima', t.layersOf('geojson').length === 1 && t.layersOf('geojson')[0].front === true);
eq('estilo do destaque', (() => { const s = t.layersOf('geojson')[0].args.o.style(); return [s.color, s.weight, s.fillOpacity]; })(), ['#10b981', 3, 0.35]);
ok('enquadra a feição (fitBounds com margem)', !!t.map.fitted && t.map.fitted.b[0][0] === -7.02 && t.map.fitted.b[1][1] === -34.83);
ok('sem esmaecer por padrão', t.layersOf('polygon').length === 0);
ok('nenhuma camada vizinha ligada por padrão', t.layersOf('geojson').length === 1);
ok('escala gráfica (metros) ligada', Array.from(t.map.controls).some(c => c.kind === 'scale' && c.o.metric === true && c.o.imperial === false));
ok('norte visível', t.doc.els['map-north'].style.display === '');
ok('escala aproximada e projeção SIRGAS 2000 UTM 25S, cada uma no seu quadro', /Escala aprox\. 1:/.test(t.doc.els['map-escala-txt'].textContent) && /SIRGAS 2000 \/ UTM zona 25S/.test(t.doc.els['map-proj-txt'].textContent) && t.doc.els['map-info-wrap'].style.display === '');
ok('legenda mostra a feição do relatório', /Feição do relatório/.test(t.doc.els['map-legend'].innerHTML));
eq('projeção do controlador', t.ctl.projection.label, 'SIRGAS 2000 / UTM zona 25S');
ok('notifica a mudança inicial', t.changes.length === 1);

// ---------------------------------------------------------------- destaque
t.ctl.setConfig({ destaque: { ativo: false } });
ok('destaque desligado: feição sai do mapa', t.layersOf('geojson').length === 0);
ok('destaque desligado: legenda sem a feição', !/Feição do relatório/.test(t.doc.els['map-legend'].innerHTML));
t.ctl.setConfig({ destaque: { ativo: true, cor: '#ff00ff', espessura: 5, preenchimento: 0.6 } });
eq('destaque com nova cor/espessura', (() => { const s = t.layersOf('geojson')[0].args.o.style(); return [s.color, s.weight, s.fillOpacity]; })(), ['#ff00ff', 5, 0.6]);
t.ctl.setConfig({ destaque: { cor: 'invalida' } });
eq('cor inválida é ignorada', t.layersOf('geojson')[0].args.o.style().color, '#10b981');

t.ctl.setConfig({ destaque: { esmaecerEntorno: true } });
ok('esmaecer entorno: máscara com o polígono como buraco', t.layersOf('polygon').length === 1 && t.layersOf('polygon')[0].args.p.length === 2);
ok('máscara fica abaixo do destaque (adicionada antes)', Array.from(t.map.layers).findIndex(l => l.kind === 'polygon') < Array.from(t.map.layers).findIndex(l => l.kind === 'geojson'));
eq('esmaecer: intensidade padrão 0,6', t.layersOf('polygon')[0].args.o.fillOpacity, 0.6);
t.ctl.setConfig({ destaque: { opacidadeEntorno: 0.85 } });
eq('esmaecer: o regulador muda a intensidade da máscara', [t.layersOf('polygon').length, t.layersOf('polygon')[0].args.o.fillOpacity], [1, 0.85]);
t.ctl.setConfig({ destaque: { ativo: false } });
ok('sem destaque não há máscara', t.layersOf('polygon').length === 0);

// ---------------------------------------------------------------- mapa base
t.ctl.setConfig({ baseMap: 'satelite' });
ok('satélite: troca o mapa base e mostra o crédito Esri', t.layersOf('tile').length === 1 && /arcgisonline/.test(t.layersOf('tile')[0].args.u) && /Esri/.test(t.layersOf('tile')[0].args.o.attribution));
t.ctl.setConfig({ baseMap: 'nenhum' });
ok('sem mapa base: nenhum tile e fundo branco', t.layersOf('tile').length === 0 && t.map.cont.style.background === '#ffffff');
t.ctl.setConfig({ baseMap: 'osm' });
ok('volta ao OSM', t.layersOf('tile').length === 1);
{
    const orto = { id: 'r9', nome: 'Ortofoto 2026', url: 'https://s/{z}/{x}/{y}.png', tipo: 'xyz_tiles', zoomMin: 14, zoomMax: 22, bbox: null, opacidade: 1 };
    const b = build({ mapa: { baseMap: 'ortofoto:r9' } }, undefined, { ortofotos: [orto] });
    ok('ortofoto como mapa base: satélite por baixo e a ortofoto por cima, com crédito', b.layersOf('tile').length === 2 && /arcgisonline/.test(b.layersOf('tile')[0].args.u) && b.layersOf('tile')[1].args.u === orto.url && /Ortofoto 2026/.test(b.layersOf('tile')[1].args.o.attribution));
    b.ctl.setConfig({ baseMap: 'osm' });
    ok('trocar para ruas tira a ortofoto', b.layersOf('tile').length === 1 && /openstreetmap/.test(b.layersOf('tile')[0].args.u));
    b.ctl.setConfig({ baseMap: 'ortofoto:r9' });
    b.ctl.setConfig({ baseMap: 'nenhum' });
    ok('sem mapa base tira também a ortofoto', b.layersOf('tile').length === 0);
    const sem = build({ mapa: { baseMap: 'ortofoto:r9' } }, undefined, { ortofotos: [] });
    ok('ortofoto que não está mais ativa: cai no mapa de ruas', sem.layersOf('tile').length === 1 && /openstreetmap/.test(sem.layersOf('tile')[0].args.u));
}

// ---------------------------------------------------------------- camadas vizinhas
t = build({});
t.ctl.toggleLayer('1', true);
ok('liga a camada 1', t.layersOf('geojson').length === 2);
ok('legenda lista a camada (com nome escapado)', /Lotes &lt;vizinhos&gt;/.test(t.doc.els['map-legend'].innerHTML) && !/<vizinhos>/.test(t.doc.els['map-legend'].innerHTML));
ok('camada vizinha não é interativa e usa a cor dela', (() => { const n = t.layersOf('geojson').find(l => l.args.o.interactive === false); return !!n && n.args.o.style().color === '#ff0000'; })());
ok('destaque continua por cima', (() => { const arr = Array.from(t.map.layers).filter(l => l.kind === 'geojson'); return arr[arr.length - 1].front === true; })());
t.ctl.toggleLayer('4', true);
ok('legenda marca camada truncada com *', /Linhas \*/.test(t.doc.els['map-legend'].innerHTML));
t.ctl.toggleLayer('1', false);
ok('desliga a camada 1', t.layersOf('geojson').length === 2 && !/Lotes/.test(t.doc.els['map-legend'].innerHTML));
eq('configuração guarda as ligadas', t.ctl.getConfig().camadasLigadas, ['4']);
t.ctl.toggleLayer('999', true);
ok('id que não existe não quebra', t.layersOf('geojson').length === 2);
t.ctl.setConfig({ camadasVizinhas: false });
ok('com "camadas vizinhas" desativadas no modelo nada é desenhado', t.layersOf('geojson').length === 1);

// ---------------------------------------------------------------- norte, escala, projeção
t.ctl.setConfig({ norte: false, escala: false, projecao: false });
ok('norte oculto', t.doc.els['map-north'].style.display === 'none');
ok('sem escala: sem controle de escala', !Array.from(t.map.controls).some(c => c.kind === 'scale'));
ok('sem escala e sem projeção: os dois quadros e o conjunto ficam ocultos', ['map-escala-txt', 'map-proj-txt', 'map-info-wrap'].every(i => t.doc.els[i].style.display === 'none'));
t.ctl.setConfig({ projecao: true });
ok('só projeção: aparece a projeção e não a escala', t.doc.els['map-proj-txt'].style.display === '' && t.doc.els['map-escala-txt'].style.display === 'none' && /SIRGAS/.test(t.doc.els['map-proj-txt'].textContent));
t.map.zoom = 17; t.map.handlers.zoomend();
t.ctl.setConfig({ escala: true });
ok('escala acompanha o zoom (zoom 17 ≈ 2 vezes a do 18)', (() => {
    const m = /1:([\d.]+)/.exec(t.doc.els['map-escala-txt'].textContent);
    const n17 = parseInt(m[1].replace(/\./g, ''), 10);
    t.map.zoom = 18; t.map.handlers.zoomend();
    const m2 = /1:([\d.]+)/.exec(t.doc.els['map-escala-txt'].textContent);
    const n18 = parseInt(m2[1].replace(/\./g, ''), 10);
    return n17 > n18 * 1.8 && n17 < n18 * 2.2;
})());

// ---------------------------------------------------------------- vista salva, snapshot e restauração
t = build({});
t.map.center = { lat: -7.0123, lng: -34.8321 }; t.map.zoom = 19;
const snap = t.ctl.snapshot();
eq('snapshot guarda a vista atual', snap.vista, { lat: -7.0123, lng: -34.8321, zoom: 19 });
const t2 = build({ mapa: { vista: snap.vista } });
ok('com vista salva usa setView e não o enquadramento', !!t2.map.viewSet && !t2.map.fitted && t2.map.viewSet.z === 19);
t2.ctl.reset(MT.normalizeMapConfig({}));
ok('restaurar padrão enquadra a feição de novo e limpa a vista', !!t2.map.fitted && t2.ctl.getConfig().vista === null);

// ---------------------------------------------------------------- outros tipos de geometria
const linha = { type: 'LineString', coordinates: [[-34.84, -7.02], [-34.83, -7.01]] };
t = build({ mapa: { destaque: { esmaecerEntorno: true } } }, linha);
ok('linha: destaque desenhado e sem máscara (só polígono tem entorno)', t.layersOf('geojson').length === 1 && t.layersOf('polygon').length === 0 && t.ctl.kind === 'line');
const ponto = { type: 'Point', coordinates: [-34.835, -7.015] };
t = build({}, ponto);
ok('ponto: destaque vira círculo', typeof t.layersOf('geojson')[0].args.o.pointToLayer === 'function' && t.layersOf('geojson')[0].args.o.pointToLayer({}, [0, 0]).kind === 'circle');
t = build({}, null);
ok('sem geometria: mapa abre num ponto padrão e nada é destacado', !!t.map.viewSet && t.layersOf('geojson').length === 0);

// ---------------------------------------------------------------- medidas: rótulos, edição, arraste
const marcadores = (tt) => tt.layersOf('marker');
const label = (mk) => mk.args.o.icon.html.replace(/<span class="report-rot[^>]*>[^<]*<\/span>/, ''); // sem o ícone de girar
t = build({});
eq('por padrão: 4 lados + área (perímetro desligado)', marcadores(t).map(m => label(m).replace(/<[^>]+>/g, '').replace(/[\d.]+,\d{2}/, 'N')), ['N m', 'N m', 'N m', 'N m', 'Área N m²']);
ok('rótulo traz dica de duplo clique e arraste', /Duplo clique para editar/.test(label(marcadores(t)[0])));
ok('rótulo é arrastável, sem teclado e acima das camadas', marcadores(t)[0].args.o.draggable === true && marcadores(t)[0].args.o.zIndexOffset === 1000);
ok('resumo sob o mapa: lados L1..L4', /^L1: .* L4: /.test(t.doc.els['map-sides-text'].textContent));
ok('resumo sob o mapa: área e perímetro', /Área: .* m² \(.* ha\)/.test(t.doc.els['map-area-text'].textContent) && /Perímetro: /.test(t.doc.els['map-area-text'].textContent));

t.ctl.setConfig({ medidas: { ativo: false } });
ok('medidas desligadas: sem rótulos no mapa, resumo continua', marcadores(t).length === 0 && /Área:/.test(t.doc.els['map-area-text'].textContent));
t.ctl.setConfig({ medidas: { ativo: true, lados: false } });
eq('só total: apenas a área', marcadores(t).length, 1);
t.ctl.setConfig({ medidas: { lados: true, total: false } });
eq('só lados: 4 rótulos', marcadores(t).length, 4);
t.ctl.setConfig({ medidas: { total: true, perimetro: true } });
ok('perímetro ligado: rótulo abaixo da área', marcadores(t).length === 6 && /top:16px/.test(label(marcadores(t)[5])) && /Perím\./.test(label(marcadores(t)[5])));

// ---- editar com duplo clique
t = build({});
const mk0 = marcadores(t)[0];
const textoOriginal = mk0.span.textContent || label(mk0).replace(/<[^>]+>/g, '');
mk0.handlers.dblclick({});
const campo = mk0.span.children[0];
ok('duplo clique abre um campo de texto no lugar do rótulo', !!campo && campo.tag === 'input' && campo.focused === true && campo.value === textoOriginal && campo.maxLength === 60);
ok('enquanto edita não arrasta', mk0.draggingOff === true);
campo.value = '110,00 m (campo)';
const mudancas = t.changes.length;
campo.listeners.keydown({ key: 'Enter' });
ok('Enter grava a edição', t.ctl.getConfig().edicoes['lado:0'] === '110,00 m (campo)' && t.changes.length > mudancas);
ok('rótulo editado aparece marcado e com o valor calculado na dica', (() => { const h = label(marcadores(t)[0]); return /edited/.test(h) && /110,00 m \(campo\)/.test(h) && /calculado: /.test(h); })());
ok('resumo sob o mapa acompanha a edição', /^110,00 m \(campo\)/.test(t.doc.els['map-sides-text'].textContent));

// cancelar, restaurar e sair do campo
marcadores(t)[0].handlers.dblclick({});
let c2 = marcadores(t)[0].span.children[0];
c2.value = 'outra coisa';
c2.listeners.keydown({ key: 'Escape' });
eq('Esc cancela e mantém a edição anterior', t.ctl.getConfig().edicoes['lado:0'], '110,00 m (campo)');
marcadores(t)[0].handlers.dblclick({});
c2 = marcadores(t)[0].span.children[0];
c2.value = '   ';
c2.listeners.keydown({ key: 'Enter' });
ok('texto vazio restaura o valor calculado', t.ctl.getConfig().edicoes['lado:0'] === undefined && !/edited/.test(label(marcadores(t)[0])));
marcadores(t)[1].handlers.dblclick({});
c2 = marcadores(t)[1].span.children[0];
c2.value = '99 m';
c2.listeners.blur();
eq('sair do campo grava', t.ctl.getConfig().edicoes['lado:1'], '99 m');
c2.listeners.blur();
eq('gravar duas vezes não duplica nem quebra', Object.keys(t.ctl.getConfig().edicoes), ['lado:1']);
marcadores(t)[4].handlers.dblclick({});
c2 = marcadores(t)[4].span.children[0];
c2.value = marcadores(t)[4].span.textContent || c2.value;
const areaPadrao = t.ctl.measures().find(m => m.id === 'area').texto;
c2.value = areaPadrao;
c2.listeners.keydown({ key: 'Enter' });
ok('digitar o mesmo texto calculado não cria edição', t.ctl.getConfig().edicoes.area === undefined);
marcadores(t)[4].handlers.dblclick({});
c2 = marcadores(t)[4].span.children[0];
c2.value = '<img src=x onerror=alert(1)> 1.000 m²';
c2.listeners.keydown({ key: 'Enter' });
ok('texto digitado é escapado no rótulo', !/<img/.test(label(marcadores(t)[4])) && /&lt;img/.test(label(marcadores(t)[4])));
ok('edição de área vai para o resumo', /1\.000 m²/.test(t.doc.els['map-area-text'].textContent));
c2 = null;

// ---- arrastar o rótulo
t = build({});
const mk1 = marcadores(t)[1];
mk1.latlng = { lat: -7.0131, lng: -34.8322 };
mk1.handlers.dragend();
eq('arrastar guarda a nova posição', t.ctl.getConfig().posicoes['lado:1'], { lat: -7.0131, lng: -34.8322 });
eq('snapshot leva edições, posições e medidas', (() => { const s = t.ctl.snapshot(); return [Object.keys(s.posicoes), s.medidas.ativo, typeof s.edicoes]; })(), [['lado:1'], true, 'object']);
const t3 = build({ mapa: { posicoes: { 'lado:1': { lat: -7.0131, lng: -34.8322 } }, edicoes: { area: '900 m²' } } });
ok('posição e edição salvas voltam ao abrir', marcadores(t3)[1].args.pos[0] === -7.0131 && /900 m²/.test(label(marcadores(t3)[4])));
t3.ctl.resetMeasures();
ok('restaurar medidas apaga edições e posições', Object.keys(t3.ctl.getConfig().edicoes).length === 0 && Object.keys(t3.ctl.getConfig().posicoes).length === 0 && !/900/.test(label(marcadores(t3)[4])));
const t4 = build({ mapa: { edicoes: { area: '900 m²' } } });
t4.ctl.reset(MT.normalizeMapConfig({}));
ok('restaurar padrão do modelo também limpa as medidas editadas', Object.keys(t4.ctl.getConfig().edicoes).length === 0);

// ---- outros tipos de geometria
t = build({}, { type: 'LineString', coordinates: [[-34.84, -7.02], [-34.84, -7.019], [-34.839, -7.019]] });
ok('linha: trechos + comprimento', marcadores(t).length === 3 && /Comp\./.test(label(marcadores(t)[2])) && /^T1: /.test(t.doc.els['map-sides-text'].textContent) && /Comprimento:/.test(t.doc.els['map-area-text'].textContent));
t = build({}, { type: 'Point', coordinates: [-34.835, -7.015] });
ok('ponto: coordenada e nada de lados', marcadores(t).length === 1 && /-7\.015000, -34\.835000/.test(label(marcadores(t)[0])) && t.doc.els['map-sides-text'].textContent === 'Ponto');
t = build({}, { type: 'Polygon', coordinates: [Array.from({ length: 101 }, (_, i) => { const a = i / 100 * 2 * Math.PI; return i === 100 ? [-34.839, -7.02] : [-34.84 + 0.001 * Math.cos(a), -7.02 + 0.001 * Math.sin(a)]; })] });
ok('mais de 80 lados: só a área no mapa e aviso no resumo', marcadores(t).length === 1 && t.ctl.ladosOmitidos === true && /omitidos/.test(t.doc.els['map-sides-text'].textContent));
t = build({}, null);
ok('sem geometria: nenhuma medida e aviso no resumo', marcadores(t).length === 0 && t.doc.els['map-sides-text'].textContent === 'Feição sem geometria associada');

// ---------------------------------------------------------------- medidas: giro, alinhamento e estilo do texto
{
    const w = build({});
    const mk = marcadores(w)[0];
    const html = mk.args.o.icon.html;
    ok('rótulo de lado já sai girado (alinhado à aresta) e afastado da linha, sem o card antigo', /transform:translate\(-50%,-50%\) rotate\(-?[\d.]+deg\)/.test(html) && /left:-?[\d.]+px;top:-?[\d.]+px/.test(html) && !/border|background/.test(html));
    ok('rótulo traz o ícone de girar (fora da imagem exportada: no-print)', /class="report-rot no-print"/.test(html));
    ok('padrão: negrito, sem itálico nem sublinhado', /font-weight:700;font-style:normal;text-decoration:none/.test(html));
    w.ctl.setConfig({ medidas: { estilo: { lados: { n: false, i: true, s: true }, total: { n: true, i: false, s: false }, perimetro: { n: true, i: false, s: false } } } });
    ok('estilo dos lados: sem negrito, itálico e sublinhado', /font-weight:400;font-style:italic;text-decoration:underline/.test(marcadores(w)[0].args.o.icon.html));
    ok('estilo é por grupo: a área continua em negrito', /font-weight:700;font-style:normal;text-decoration:none/.test(marcadores(w).find(m => /Área/.test(m.args.o.icon.html)).args.o.icon.html));
    w.ctl.setConfig({ rotacoes: { 'lado:0': 33 } });
    ok('giro salvo vale no lugar do automático', /rotate\(33deg\)/.test(marcadores(w)[0].args.o.icon.html) && !/rotate\(33deg\)/.test(marcadores(w)[1].args.o.icon.html));
    w.ctl.resetMeasures();
    ok('restaurar medidas também tira os giros', Object.keys(w.ctl.getConfig().rotacoes).length === 0 && !/rotate\(33deg\)/.test(marcadores(w)[0].args.o.icon.html));
    w.ctl.setConfig({ medidas: { lados: false, total: false } });
    ok('desligar o grupo tira os textos', marcadores(w).length === 0);
}
{
    // arrastar o ícone de girar: o ângulo vem da posição do ponteiro em relação ao centro do texto
    const eventos = {};
    const docE = makeDoc(ids);
    docE.addEventListener = (n, fn) => { eventos[n] = fn; };
    docE.removeEventListener = (n) => { delete eventos[n]; };
    const w = build({}, undefined, { doc: docE });
    const mk = marcadores(w)[0];
    mk.span.getBoundingClientRect = () => ({ left: 100, top: 100, width: 20, height: 10 });
    mk.span.style = {};
    const sem = { stopPropagation() {}, preventDefault() {} };
    ok('o ícone de girar impede o arraste do texto e o duplo clique de edição', typeof mk.span.listeners.pointerdown === 'function' && typeof mk.span.listeners.mousedown === 'function' && typeof mk.span.listeners.dblclick === 'function');
    mk.span.listeners.pointerdown(sem);
    ok('durante o giro o arraste do marcador fica desligado', mk.draggingOff === true);
    eventos.pointermove({ clientX: 110, clientY: 155 }); // 50 px abaixo do centro (110, 105): 90°
    eq('ao girar, o texto acompanha o ponteiro', mk.span.style.transform, 'translate(-50%,-50%) rotate(90deg)');
    eventos.pointermove({ clientX: 125, clientY: 95, shiftKey: true }); // ~ -34° → passo de 15° = -30°
    eq('Shift trava o giro em passos de 15°', mk.span.style.transform, 'translate(-50%,-50%) rotate(-30deg)');
    eventos.pointerup({});
    eq('ao soltar, o giro é guardado e a configuração notificada', [w.ctl.getConfig().rotacoes['lado:0'], w.changes.length > 1, Object.keys(eventos).filter(n => n !== 'keydown')], [-30, true, []]);
    ok('o texto é redesenhado com o giro guardado', /rotate\(-30deg\)/.test(marcadores(w)[0].args.o.icon.html));
    const mk2 = marcadores(w)[0];
    mk2.span.listeners.dblclick(sem);
    ok('dois cliques no ícone voltam ao alinhamento automático', w.ctl.getConfig().rotacoes['lado:0'] === undefined && !/rotate\(-30deg\)/.test(marcadores(w)[0].args.o.icon.html));
}

// ---------------------------------------------------------------- pontos nos vértices
const handles = (tt) => tt.layersOf('circle');
const pontosMk = (tt) => tt.layersOf('marker').filter(m => m.args.o.icon.className === 'report-point' && /report-point-label/.test(m.args.o.icon.html)); // só os nomes (a bolinha é outro marcador)
const nomeDoPonto = (mk) => mk.args.o.icon.html.replace(/<span class="report-rot[^>]*>[^<]*<\/span>/, '').replace(/<[^>]+>/g, '');
t = build({});
ok('pontos desligados: nenhum vértice clicável', handles(t).length === 0 && pontosMk(t).length === 0);
t.ctl.setConfig({ pontos: { ativo: true } });
eq('pontos ligados: um marcador clicável por vértice (4)', handles(t).length, 4);
ok('marcador de vértice é clicável e não repassa o clique ao mapa', handles(t)[0].args.o.interactive === true && handles(t)[0].args.o.bubblingMouseEvents === false);

handles(t)[2].handlers.click();
eq('clicar no vértice marca o ponto', t.ctl.getConfig().pontos.ordem, ['v:2']);
ok('vértice marcado deixa de ser marcador livre e vira ponto nomeado P1', handles(t).length === 3 && pontosMk(t).length === 1 && nomeDoPonto(pontosMk(t)[0]) === 'P1');
ok('ponto fica na posição do vértice', pontosMk(t)[0].args.pos[0] === -7.01 && pontosMk(t)[0].args.pos[1] === -34.83);
handles(t)[0].handlers.click();
eq('a sequência segue a ordem dos cliques', [t.ctl.getConfig().pontos.ordem, pontosMk(t).map(nomeDoPonto)], [['v:2', 'v:0'], ['P1', 'P2']]);
t.ctl.addPoint('v:2');
eq('marcar de novo o mesmo vértice não duplica', t.ctl.getConfig().pontos.ordem, ['v:2', 'v:0']);

// nome do ponto: separado da bolinha, sem card, arrastável, com giro e estilo
{
    const b = build({ mapa: { pontos: { ativo: true, ordem: ['v:0', 'v:1'] } } });
    const rotulos = b.layersOf('marker').filter(m => /report-point-label/.test(m.args.o.icon.html));
    const bolinhas = b.layersOf('marker').filter(m => /report-point-dot/.test(m.args.o.icon.html));
    eq('cada ponto tem a bolinha (no vértice, sem interação) e o nome (arrastável) como marcadores separados', [rotulos.length, bolinhas.length, bolinhas[0].args.o.interactive, rotulos[0].args.o.draggable], [2, 2, false, true]);
    const h = rotulos[0].args.o.icon.html;
    ok('nome sem card, com estilo, giro e ícone de girar; nasce ao lado do vértice', !/border|background/.test(h) && /font-weight:700;font-style:normal;text-decoration:none/.test(h) && /rotate\(0deg\)/.test(h) && /left:16px;top:-13px/.test(h) && /report-rot no-print/.test(h) && rotulos[0].args.pos[0] === bolinhas[0].args.pos[0]);
    // arrastar o nome
    rotulos[0].latlng = { lat: -7.0123, lng: -34.8321 };
    rotulos[0].handlers.dragend();
    eq('arrastar o nome guarda a posição (chave do vértice)', b.ctl.getConfig().posicoes['v:0'], { lat: -7.0123, lng: -34.8321 });
    b.ctl.setConfig({ pontos: { estilo: { n: false, i: true, s: true } } });
    const depois = b.layersOf('marker').filter(m => /report-point-label/.test(m.args.o.icon.html))[0];
    ok('depois de arrastado o nome fica onde foi solto, sem o afastamento padrão', depois.args.pos[0] === -7.0123 && /left:0px;top:0px/.test(depois.args.o.icon.html));
    ok('estilo do nome do ponto (itálico e sublinhado, sem negrito)', /font-weight:400;font-style:italic;text-decoration:underline/.test(b.layersOf('marker').filter(m => /report-point-label/.test(m.args.o.icon.html))[0].args.o.icon.html));
    b.ctl.setConfig({ rotacoes: { 'v:1': 45 } });
    ok('giro do nome do ponto guardado', /rotate\(45deg\)/.test(b.layersOf('marker').filter(m => /report-point-label/.test(m.args.o.icon.html))[1].args.o.icon.html));
    b.ctl.resetMeasures();
    eq('restaurar medidas não mexe na posição e no giro dos pontos', [b.ctl.getConfig().posicoes['v:0'] !== undefined, b.ctl.getConfig().rotacoes['v:1']], [true, 45]);
    b.ctl.removePoint('v:0');
    b.ctl.removePoint('v:1');
    eq('tirar o ponto apaga posição e giro dele', [b.ctl.getConfig().posicoes['v:0'], b.ctl.getConfig().rotacoes['v:1']], [undefined, undefined]);
}
// textos editados da tabela
{
    const b = build({ mapa: { pontos: { ativo: true, ordem: ['v:0', 'v:1', 'v:2'], memorial: true } } });
    b.ctl.setTabelaTexto('v:0:az', '  45° 00\' 00"  ');
    b.ctl.setTabelaTexto('v:1:c0', '123');
    b.ctl.setTabelaTexto('titulo', 'Descrição dos limites');
    eq('texto da tabela editado (limpo) e guardado', [b.ctl.pointRows().rows[0].azimute, b.ctl.pointRows().rows[1].cells[0], b.ctl.pointRows().tituloTabela], ['45° 00\' 00"', '123', 'Descrição dos limites']);
    b.ctl.setTabelaTexto('titulo', '');
    eq('vazio restaura o calculado', [b.ctl.getConfig().pontos.textos.titulo, b.ctl.pointRows().tituloTabela], [undefined, '']);
    b.ctl.movePoint('v:2', -1);
    eq('mudar a sequência descarta só as edições de azimute/distância (recalculados); coordenadas ficam', [b.ctl.getConfig().pontos.textos['v:0:az'], b.ctl.getConfig().pontos.textos['v:1:c0']], [undefined, '123']);
    b.ctl.setTabelaTexto('v:0:dist', '10,00');
    b.ctl.setConfig({ pontos: { sistema: 'geo_dec' } });
    eq('trocar o sistema de coordenadas descarta as edições das colunas de coordenadas', [b.ctl.getConfig().pontos.textos['v:1:c0'], b.ctl.getConfig().pontos.textos['v:0:dist']], [undefined, '10,00']);
    b.ctl.clearPoints();
    eq('limpar pontos apaga também os textos editados', b.ctl.getConfig().pontos.textos, {});
}

// linhas da tabela
eq('tabela reflete os pontos e a ordem', t.ctl.pointRows().rows.map(r => [r.vid, r.titulo]), [['v:2', 'P1'], ['v:0', 'P2']]);
ok('tabela traz as coordenadas UTM do vértice', t.ctl.pointRows().rows[1].cells.join('|') === MT.coordCells(-7.02, -34.84, 'utm').join('|'));

// renomear com duplo clique
pontosMk(t)[0].handlers.dblclick({});
const campoP = pontosMk(t)[0].span.children[0];
ok('duplo clique no ponto abre o campo com o nome atual', !!campoP && campoP.value === 'P1' && campoP.focused === true);
campoP.value = 'Marco M-01';
campoP.listeners.keydown({ key: 'Enter' });
eq('Enter grava o nome do ponto', [t.ctl.getConfig().pontos.titulos['v:2'], nomeDoPonto(pontosMk(t)[0]), t.ctl.pointRows().rows[0].titulo], ['Marco M-01', 'Marco M-01', 'Marco M-01']);
ok('o outro ponto continua com o nome padrão', nomeDoPonto(pontosMk(t)[1]) === 'P2');
pontosMk(t)[0].handlers.dblclick({});
pontosMk(t)[0].span.children[0].value = 'a<b>c';
pontosMk(t)[0].span.children[0].listeners.keydown({ key: 'Enter' });
ok('nome digitado é escapado no rótulo do ponto', /a&lt;b&gt;c/.test(pontosMk(t)[0].args.o.icon.html) && !/<b>/.test(pontosMk(t)[0].args.o.icon.html));
pontosMk(t)[0].handlers.dblclick({});
pontosMk(t)[0].span.children[0].value = 'P1';
pontosMk(t)[0].span.children[0].listeners.keydown({ key: 'Enter' });
eq('nome igual ao padrão volta ao padrão', t.ctl.getConfig().pontos.titulos['v:2'], undefined);
pontosMk(t)[0].handlers.dblclick({});
pontosMk(t)[0].span.children[0].value = 'qualquer';
pontosMk(t)[0].span.children[0].listeners.keydown({ key: 'Escape' });
eq('Esc cancela a renomeação', t.ctl.getConfig().pontos.titulos['v:2'], undefined);

// reordenar e remover
t.ctl.movePoint('v:0', -1);
eq('subir um ponto muda a sequência e os nomes padrão acompanham', [t.ctl.getConfig().pontos.ordem, t.ctl.pointRows().rows.map(r => r.titulo)], [['v:0', 'v:2'], ['P1', 'P2']]);
t.ctl.movePoint('v:0', -1);
eq('subir o primeiro não faz nada', t.ctl.getConfig().pontos.ordem, ['v:0', 'v:2']);
t.ctl.movePoint('v:0', 1);
eq('descer', t.ctl.getConfig().pontos.ordem, ['v:2', 'v:0']);
t.ctl.renamePoint('v:0', 'Marco final');
t.ctl.removePoint('v:2');
eq('remover ponto o devolve aos vértices livres e renumera', [t.ctl.getConfig().pontos.ordem, handles(t).length, t.ctl.pointRows().rows[0].titulo], [['v:0'], 3, 'Marco final']);
t.ctl.removePoint('v:0');
eq('remover o ponto apaga também o nome dele', t.ctl.getConfig().pontos.titulos, {});
t.ctl.markAllPoints();
eq('marcar todos os vértices', [t.ctl.getConfig().pontos.ordem, handles(t).length, pontosMk(t).length], [['v:0', 'v:1', 'v:2', 'v:3'], 0, 4]);
t.ctl.clearPoints();
eq('limpar pontos', [t.ctl.getConfig().pontos.ordem, handles(t).length], [[], 4]);

// sistema de coordenadas, memorial e persistência
t.ctl.addPoint('v:0'); t.ctl.addPoint('v:1'); t.ctl.addPoint('v:2');
t.ctl.setConfig({ pontos: { sistema: 'geo_gms', memorial: true } });
const linhasM = t.ctl.pointRows();
ok('memorial no sistema GMS: coordenadas, azimute e distância', /°/.test(linhasM.rows[0].cells[0]) && /°/.test(linhasM.rows[0].azimute) && /\d,\d{2}$/.test(linhasM.rows[0].distancia) && linhasM.memorial === true);
const snapP = t.ctl.snapshot();
eq('snapshot guarda pontos, sistema e memorial', [snapP.pontos.ordem, snapP.pontos.sistema, snapP.pontos.memorial, snapP.pontos.ativo], [['v:0', 'v:1', 'v:2'], 'geo_gms', true, true]);
const tP = build({ mapa: { pontos: snapP.pontos } });
ok('pontos salvos voltam ao abrir', pontosMk(tP).length === 3 && handles(tP).length === 1);
tP.ctl.reset(MT.normalizeMapConfig({}));
eq('restaurar padrão do modelo limpa os pontos do usuário', tP.ctl.getConfig().pontos.ordem, []);

// pontos e o tipo de geometria
t = build({ mapa: { pontos: { ativo: true } } }, { type: 'LineString', coordinates: [[-34.84, -7.02], [-34.84, -7.019], [-34.839, -7.019]] });
eq('linha: vértices são os pontos do traçado', handles(t).length, 3);
t = build({ mapa: { pontos: { ativo: true } } }, { type: 'Point', coordinates: [-34.835, -7.015] });
eq('ponto: um vértice', handles(t).length, 1);
const muitosVert = { type: 'LineString', coordinates: Array.from({ length: 401 }, (_, i) => [-34.84 + i * 1e-5, -7.02]) };
t = build({ mapa: { pontos: { ativo: true, ordem: ['v:400'] } } }, muitosVert);
ok('mais de 400 vértices: sem marcadores livres, "marcar todos" não faz nada, ponto salvo continua', handles(t).length === 0 && t.ctl.verticesOmitidos === true && (t.ctl.markAllPoints(), t.ctl.getConfig().pontos.ordem.length === 1) && t.ctl.pointRows().rows.length === 1);
t = build({ mapa: { pontos: { ativo: true } } }, null);
ok('sem geometria: sem vértices', handles(t).length === 0 && t.ctl.pointRows().rows.length === 0);

// ---------------------------------------------------------------- modo de saída (impressão / imagem)
t = build({ mapa: { pontos: { ativo: true, ordem: ['v:1'] } } });
eq('vetores em canvas (a captura de imagem copia canvas sem deslocamento)', t.map.options.preferCanvas, true);
eq('antes da saída: 3 vértices livres + 1 ponto', [handles(t).length, pontosMk(t).length], [3, 1]);
t.ctl.setExportMode(true);
eq('na saída: nenhum vértice livre, o ponto marcado continua', [handles(t).length, pontosMk(t).length], [0, 1]);
t.ctl.addPoint('v:3');
eq('na saída, marcar ponto não traz os vértices livres de volta', [handles(t).length, pontosMk(t).length], [0, 2]);
t.ctl.setExportMode(false);
eq('depois da saída: vértices livres voltam', [handles(t).length, pontosMk(t).length], [2, 2]);
const nAntes = t.changes.length;
t.ctl.setExportMode(false);
eq('repetir o mesmo modo não redesenha', t.changes.length, nAntes);

// ---------------------------------------------------------------- rótulos das feições vizinhas
const camadasRot = [
    { id: '1', name: 'Lotes', color: '#ff0000', kind: 'polygon', features: [{ type: 'Feature', properties: { r: 'Quadra E • Lote 02', t: 'Beltrano <b>' }, geometry: poly }, { type: 'Feature', properties: {}, geometry: poly }], truncated: false }
];
const nlabels = (tt) => tt.layersOf('marker').filter(m => m.args.o.icon.className === 'report-nlabel');
const semIcone = (h) => h.replace(/<span class="report-rot[^>]*>[^<]*<\/span>/, '');
t = build({ mapa: { camadasLigadas: ['1'], rotulos: { ativo: true } } }, undefined, { camadas: camadasRot });
eq('rótulo (Quadra/Lote) no centro de cada feição que tem rótulo', [nlabels(t).length, semIcone(nlabels(t)[0].args.o.icon.html).replace(/<[^>]+>/g, '')], [1, 'Quadra E • Lote 02']);
ok('rótulo fica no centro da feição e pode ser arrastado', nlabels(t)[0].args.pos[0] === -7.015 && nlabels(t)[0].args.pos[1] === -34.835 && nlabels(t)[0].args.o.draggable === true);
t.ctl.setConfig({ rotulos: { campo: 'titulo' } });
ok('campo "nome principal" com o texto escapado', nlabels(t).length === 1 && /Beltrano &lt;b&gt;/.test(nlabels(t)[0].args.o.icon.html) && !/<b>/.test(nlabels(t)[0].args.o.icon.html));
t.ctl.setConfig({ rotulos: { ativo: false } });
eq('rótulos desligados', nlabels(t).length, 0);
t.ctl.setConfig({ rotulos: { ativo: true, campo: 'rotulo' } });
t.ctl.toggleLayer('1', false);
eq('camada desligada: sem rótulos', nlabels(t).length, 0);
const enorme = [{ id: '9', name: 'Enorme', color: '#00f', kind: 'polygon', features: Array.from({ length: 300 }, () => ({ type: 'Feature', properties: { r: 'x' }, geometry: poly })), truncated: false }];
t = build({ mapa: { camadasLigadas: ['9'], rotulos: { ativo: true } } }, undefined, { camadas: enorme });
eq('camada com mais de 250 rótulos: ficam de fora (poluição)', nlabels(t).length, 0);
t = build({ mapa: { camadasLigadas: ['1'], rotulos: { ativo: true } } }, undefined, { camadas: camadasRot });

// rótulos das vizinhas: mover, girar, estilo
{
    const b = build({ mapa: { camadasLigadas: ['1'], rotulos: { ativo: true } } }, undefined, { camadas: camadasRot });
    const h = nlabels(b)[0].args.o.icon.html;
    ok('rótulo sem card, com estilo, giro e ícone de girar', !/border|background/.test(h) && /font-weight:700;font-style:normal;text-decoration:none/.test(h) && /rotate\(0deg\)/.test(h) && /report-rot no-print/.test(h) && /report-nlabel-l/.test(h));
    nlabels(b)[0].latlng = { lat: -7.0111, lng: -34.8333 };
    nlabels(b)[0].handlers.dragend();
    eq('arrastar guarda a posição por "camada:índice" e redesenha o rótulo no novo lugar', [b.ctl.getConfig().rotulos.itens['1:0'], nlabels(b).length, nlabels(b)[0].args.pos], [{ lat: -7.0111, lng: -34.8333 }, 1, [-7.0111, -34.8333]]);
    b.ctl.setConfig({ rotulos: { estilo: { n: false, i: true, s: true } } });
    ok('estilo dos rótulos (itálico e sublinhado, sem negrito)', /font-weight:400;font-style:italic;text-decoration:underline/.test(nlabels(b)[0].args.o.icon.html));
    // giro pelo ícone
    const eventos = {};
    const docE = makeDoc(ids);
    docE.addEventListener = (n, fn) => { eventos[n] = fn; };
    docE.removeEventListener = (n) => { delete eventos[n]; };
    const g = build({ mapa: { camadasLigadas: ['1'], rotulos: { ativo: true } } }, undefined, { camadas: camadasRot, doc: docE });
    const mk = nlabels(g)[0];
    mk.span.getBoundingClientRect = () => ({ left: 100, top: 100, width: 20, height: 10 });
    mk.span.style = {};
    mk.span.listeners.pointerdown({ stopPropagation() {}, preventDefault() {} });
    eventos.pointermove({ clientX: 110, clientY: 155 });
    eventos.pointerup({});
    eq('girar o rótulo guarda o giro sem perder a posição', [g.ctl.getConfig().rotulos.itens['1:0'], /rotate\(90deg\)/.test(nlabels(g)[0].args.o.icon.html)], [{ rot: 90 }, true]);
    nlabels(g)[0].span.listeners.dblclick({ stopPropagation() {} });
    eq('dois cliques no ícone tiram o giro (e o ajuste some se não sobra nada)', g.ctl.getConfig().rotulos.itens, {});
    g.ctl.setConfig({ rotulos: { itens: { '1:0': { lat: -7.0, lng: -34.9, rot: 15 } } } });
    g.ctl.resetRotulos();
    eq('restaurar posição dos rótulos', [g.ctl.getConfig().rotulos.itens, nlabels(g)[0].args.pos], [{}, [-7.015, -34.835]]);
    const s = g.ctl.snapshot();
    ok('o que se salva leva o estilo e os ajustes dos rótulos', s.rotulos.estilo && typeof s.rotulos.itens === 'object');
}

// ---------------------------------------------------------------- tabela de confrontantes: ordem e textos
{
    const viz = { id: 'V', name: 'Vizinhos', color: '#f00', kind: 'polygon', truncated: false, features: [{ type: 'Feature', properties: { r: 'Lote 02', t: 'Fulano' }, geometry: { type: 'Polygon', coordinates: [[[-34.83, -7.02], [-34.82, -7.02], [-34.82, -7.01], [-34.83, -7.01], [-34.83, -7.02]]] } }] };
    const b = build({ mapa: { confrontantes: { ativo: true, camada: 'V' } } }, undefined, { camadas: [viz] });
    const rows = () => b.ctl.confrontanteRows();
    eq('quatro lados, na ordem natural, com o nome calculado', [rows().map(r => r.id), rows().map(r => r.lado)], [['lado:0', 'lado:1', 'lado:2', 'lado:3'], ['L1', 'L2', 'L3', 'L4']]);
    ok('o lado leste (L2) tem o vizinho identificado', rows()[1].confrontantes.length === 1 && rows()[1].confrontantes[0].r === 'Lote 02');
    b.ctl.moveConfrontante('lado:1', -1);
    eq('subir uma linha muda a ordem e a guarda', [rows().map(r => r.id), b.ctl.getConfig().confrontantes.ordem], [['lado:1', 'lado:0', 'lado:2', 'lado:3'], ['lado:1', 'lado:0', 'lado:2', 'lado:3']]);
    b.ctl.moveConfrontante('lado:1', -1);
    b.ctl.moveConfrontante('lado:3', 1);
    eq('subir a primeira ou descer a última não faz nada', rows().map(r => r.id), ['lado:1', 'lado:0', 'lado:2', 'lado:3']);
    b.ctl.setConfrontanteTexto('lado:1:lado', '  Frente  ');
    b.ctl.setConfrontanteTexto('lado:1:conf', 'Rua das Flores');
    eq('textos de LADO e CONFRONTANTE(S) do usuário', [rows()[0].lado, rows()[0].confTexto, rows()[1].lado, rows()[1].confTexto], ['Frente', 'Rua das Flores', 'L1', '']);
    b.ctl.setConfrontanteTexto('lado:1:conf', '');
    eq('vazio restaura o calculado', [rows()[0].confTexto, b.ctl.getConfig().confrontantes.textos], ['', { 'lado:1:lado': 'Frente' }]);
    b.ctl.setConfrontanteTexto('lado:1:conf', 'Rua das Flores');
    b.ctl.setConfig({ confrontantes: { nomes: true } });
    eq('mudar outra opção da tabela mantém a ordem e os textos', [rows()[0].lado, rows()[0].confTexto], ['Frente', 'Rua das Flores']);
    b.ctl.setConfig({ confrontantes: { camada: '' } });
    eq('trocar a camada descarta só os nomes dos vizinhos (CONFRONTANTE); LADO e ordem ficam', [b.ctl.getConfig().confrontantes.textos, b.ctl.getConfig().confrontantes.ordem.length], [{ 'lado:1:lado': 'Frente' }, 4]);
    eq('sem camada: sem linhas', rows(), []);
    b.ctl.setConfig({ confrontantes: { camada: 'V' } });
    b.ctl.resetConfrontantes();
    eq('restaurar nomes e ordem', [rows().map(r => r.lado), b.ctl.getConfig().confrontantes.ordem, b.ctl.getConfig().confrontantes.textos], [['L1', 'L2', 'L3', 'L4'], [], {}]);
    const desl = build({ mapa: {} }, undefined, { camadas: [viz] });
    eq('desligada: sem linhas', desl.ctl.confrontanteRows(), []);
}

// ---------------------------------------------------------------- distância até a camada de referência (dois cliques)
{
    const ref = { id: 'R', name: 'LPM', color: '#00f', kind: 'line', truncated: false, features: [{ type: 'Feature', properties: { r: 'Linha' }, geometry: { type: 'LineString', coordinates: [[-34.82, -7.03], [-34.82, -7.0]] } }] };
    const eventos = {};
    const docE = makeDoc(ids);
    docE.addEventListener = (n, fn) => { eventos[n] = fn; };
    const mk = (extraCfg) => build({ mapa: Object.assign({ referencia: { ativo: true, camada: 'R' } }, extraCfg || {}) }, undefined, { camadas: [ref], doc: docE });
    const b = mk();
    const click = (lat, lng) => b.map.handlers.click({ latlng: { lat: lat, lng: lng } });
    eq('parado: measureState 0; clique no mapa não faz nada', [b.ctl.measureState(), (click(-7.015, -34.8302), b.ctl.getConfig().referencia.medidas.length)], [0, 0]);
    ok('começar a medir: estado 1 e cursor de mira', b.ctl.startDistMeasure() === true && b.ctl.measureState() === 1 && b.map.cont.style.cursor === 'crosshair');
    click(-7.015, -34.8302);
    eq('primeiro clique (feição): estado 2 e ponto provisório desenhado', [b.ctl.measureState(), b.layersOf('circle').filter(c => c.args.o.fillColor === '#fca5a5').length], [2, 1]);
    click(-7.012, -34.8195);
    const m = b.ctl.getConfig().referencia.medidas;
    eq('segundo clique (camada): distância guardada entre os dois pontos colados nos traçados', [m.length, m[0].id, Math.abs(m[0].a[0] + 7.015) < 1e-6, m[0].a[1], Math.abs(m[0].b[0] + 7.012) < 1e-6, m[0].b[1]], [1, 'dist:1', true, -34.83, true, -34.82]);
    eq('depois de medir: parado e cursor normal', [b.ctl.measureState(), b.map.cont.style.cursor], [0, '']);
    const esperado = MT.fmtNumber(MT.distanceM([m[0].a[1], m[0].a[0]], [m[0].b[1], m[0].b[0]]), 2) + ' m';
    const linha = b.layersOf('polyline').filter(l => l.args.o.dashArray === '6 4');
    ok('linha tracejada entre os dois pontos e uma bolinha em cada ponta', linha.length === 1 && linha[0].args.p[0][0] === m[0].a[0] && b.layersOf('circle').filter(c => c.args.o.fillColor === '#ffffff' && c.args.o.radius === 3.5).length === 2);
    const rot = () => b.layersOf('marker').find(x => /report-measure-label/.test(x.args.o.icon.html) && !/Á/.test(x.args.o.icon.html) && x.args.o.icon.html.indexOf(esperado) >= 0);
    ok('texto da distância no meio da linha, alinhado à linha, com o estilo do grupo', !!rot() && /rotate\(-?[\d.]+deg\)/.test(rot().args.o.icon.html) && /font-weight:700/.test(rot().args.o.icon.html));
    eq('linhas da distância (painel e relatório)', b.ctl.distanceRows().map(r => [r.id, r.texto, r.editado]), [['dist:1', esperado, false]]);
    // editar o texto
    rot().handlers.dblclick({});
    const campo = rot().span.children[0];
    campo.value = '1,15 km';
    campo.listeners.keydown({ key: 'Enter' });
    eq('duplo clique edita o texto da distância (vazio restaura)', [b.ctl.distanceRows()[0].texto, b.ctl.distanceRows()[0].editado, b.ctl.getConfig().edicoes['dist:1']], ['1,15 km', true, '1,15 km']);
    b.ctl.resetMeasures();
    eq('restaurar medidas da feição não apaga a distância tirada pelo usuário', [b.ctl.getConfig().referencia.medidas.length, b.ctl.distanceRows()[0].texto], [1, '1,15 km']);
    // segunda distância e remoção
    b.ctl.startDistMeasure(); click(-7.0125, -34.835); click(-7.02, -34.8195);
    eq('segunda distância recebe outro número', b.ctl.getConfig().referencia.medidas.map(x => x.id), ['dist:1', 'dist:2']);
    b.ctl.removeDistance('dist:1');
    eq('remover apaga a medida e o texto editado dela', [b.ctl.getConfig().referencia.medidas.map(x => x.id), b.ctl.getConfig().edicoes['dist:1']], [['dist:2'], undefined]);
    // desligar / trocar camada / cancelar
    b.ctl.startDistMeasure();
    eventos.keydown({ key: 'Escape' });
    eq('Esc cancela a medição em andamento', [b.ctl.measureState(), b.map.cont.style.cursor], [0, '']);
    b.ctl.setConfig({ referencia: { ativo: false } });
    eq('referência desligada: distâncias somem do mapa e não são medidas', [b.layersOf('polyline').filter(l => l.args.o.dashArray === '6 4').length, b.ctl.distanceRows().length, b.ctl.startDistMeasure()], [0, 0, false]);
    b.ctl.setConfig({ referencia: { ativo: true } });
    eq('religar traz as medidas de volta', b.ctl.distanceRows().length, 1);
    b.ctl.setConfig({ referencia: { camada: '1' } });
    eq('trocar a camada de referência descarta as distâncias (eram até a camada anterior)', b.ctl.getConfig().referencia.medidas, []);
    const sem = mk({ referencia: { ativo: true, camada: '' } });
    eq('sem camada escolhida não dá para medir', sem.ctl.startDistMeasure(), false);
    // durante a medição, clicar num vértice livre conta como clique no mapa
    const v = mk({ pontos: { ativo: true } });
    v.ctl.startDistMeasure();
    v.layersOf('circle').filter(c => c.args.o.className === 'report-vertex-handle')[0].handlers.click({ latlng: { lat: -7.02, lng: -34.84 } });
    eq('clique num vértice durante a medição vale como o primeiro ponto (e não marca o ponto)', [v.ctl.measureState(), v.ctl.getConfig().pontos.ordem], [2, []]);
}

// ---------------------------------------------------------------- elementos móveis e legenda editável
{
    const eventos = {};
    const docE = makeDoc(ids);
    docE.addEventListener = (n, fn) => { eventos[n] = fn; };
    docE.removeEventListener = (n) => { delete eventos[n]; };
    // elementos com cara de DOM: guardam os ouvintes e têm retângulo
    ['map-north', 'map-escala-txt', 'map-proj-txt', 'map-legend'].forEach((i, k) => { const e = docE.els[i]; e.listeners = {}; e.addEventListener = (n, fn) => { e.listeners[n] = fn; }; e.getBoundingClientRect = () => ({ left: 500, top: 20, right: 560, bottom: 60, width: 60, height: 40 }); });
    const b = build({ mapa: { camadasLigadas: ['1'] } }, undefined, { doc: docE });
    b.map.cont.clientWidth = 600; b.map.cont.clientHeight = 300;
    b.map.cont.getBoundingClientRect = () => ({ left: 100, top: 0, right: 700, bottom: 300, width: 600, height: 300 });
    b.ctl.setConfig({});
    const norte = docE.els['map-north'];
    ok('os elementos passam a aceitar arrasto (norte, texto da escala, projeção e legenda)', ['map-north', 'map-escala-txt', 'map-proj-txt', 'map-legend'].every(i => typeof docE.els[i].listeners.pointerdown === 'function'));
    // arrastar o norte 50 px para a esquerda e 30 para baixo
    norte.listeners.pointerdown({ clientX: 520, clientY: 30, stopPropagation() {}, preventDefault() {}, target: {} });
    eventos.pointermove({ clientX: 470, clientY: 60 });
    eq('durante o arrasto o elemento acompanha o ponteiro', norte.style.transform, 'translate(-50px,30px)');
    eventos.pointerup({});
    eq('ao soltar, o deslocamento é guardado em fração do mapa (600 × 300)', [b.ctl.getConfig().elementos.norte, Object.keys(eventos).filter(n => n !== 'keydown')], [{ dx: -0.0833, dy: 0.1 }, []]);
    eq('posição aplicada em px a partir da fração', norte.style.transform, 'translate(-50px,30px)');
    // não sai do mapa
    norte.listeners.pointerdown({ clientX: 520, clientY: 30, stopPropagation() {}, preventDefault() {}, target: {} });
    eventos.pointermove({ clientX: 5000, clientY: -5000 });
    eventos.pointerup({});
    eq('arrastar para fora do mapa trava na borda (o quadro de 500-560 x 20-60 só anda 140 px à direita e 20 px acima do que já tinha)', norte.style.transform, 'translate(90px,10px)');
    // reaplica ao redesenhar e liga/desliga sem perder a posição
    b.ctl.setConfig({ norte: false });
    b.ctl.setConfig({ norte: true });
    ok('desligar e ligar de novo mantém a posição', /translate\(/.test(norte.style.transform));
    b.ctl.setElemento('projecao', 0.1, -0.05);
    eq('posição do texto da projeção', docE.els['map-proj-txt'].style.transform, 'translate(60px,-15px)');
    b.ctl.setElemento('projecao', 0, 0);
    eq('voltar a (0, 0) tira a posição guardada', [b.ctl.getConfig().elementos.projecao, docE.els['map-proj-txt'].style.transform], [undefined, '']);
    b.ctl.setElemento('lixo', 0.5, 0.5);
    ok('elemento desconhecido é ignorado', b.ctl.getConfig().elementos.lixo === undefined);
    b.ctl.resetElementos();
    eq('restaurar posições', [b.ctl.getConfig().elementos, norte.style.transform], [{}, '']);
    ok('as posições vão junto no que se salva', typeof b.ctl.snapshot().elementos === 'object');

    // legenda
    const legend = docE.els['map-legend'];
    ok('legenda: itens com chave (feição e camada ligada), identificados por data-leg', /data-leg="feicao"/.test(legend.innerHTML) && /data-leg="c:1"/.test(legend.innerHTML));
    eq('itens da legenda para o painel', b.ctl.legendItems().map(i => [i.key, i.nome, i.oculto]), [['feicao', 'Feição do relatório', false], ['c:1', 'Lotes <vizinhos>', false]]);
    b.ctl.renameLegend('c:1', '  Lotes da quadra  ');
    ok('renomear um item da legenda (nome limpo e escapado no HTML)', /Lotes da quadra/.test(legend.innerHTML) && !/Lotes &lt;vizinhos&gt;/.test(legend.innerHTML));
    b.ctl.renameLegend('c:1', '<b>x</b>');
    ok('nome digitado é escapado', /&lt;b&gt;x&lt;\/b&gt;/.test(legend.innerHTML) && !/<b>x/.test(legend.innerHTML));
    b.ctl.renameLegend('c:1', 'Lotes <vizinhos>');
    eq('nome igual ao original volta ao original (nada guardado)', b.ctl.getConfig().legenda.nomes, {});
    b.ctl.toggleLegend('feicao', false);
    ok('ocultar um item tira só ele da legenda', !/data-leg="feicao"/.test(legend.innerHTML) && /data-leg="c:1"/.test(legend.innerHTML) && b.ctl.legendItems()[0].oculto === true);
    b.ctl.toggleLegend('c:1', false);
    eq('todos ocultos: legenda some', legend.style.display, 'none');
    b.ctl.resetLegenda();
    ok('restaurar legenda', legend.style.display === '' && /data-leg="feicao"/.test(legend.innerHTML) && b.ctl.getConfig().legenda.ocultos.length === 0);
    eq('chave desconhecida é ignorada', (b.ctl.renameLegend('c:zzz', 'x'), b.ctl.getConfig().legenda.nomes), {});
    // dois cliques no item: campo de texto no lugar do nome
    const span = { textContent: 'Feição do relatório', children: [], appendChild(c) { this.children.push(c); } };
    const row = { getAttribute: () => 'feicao', querySelector: () => span };
    legend.listeners.dblclick({ target: { closest: () => row } });
    const campo = span.children[0];
    ok('dois cliques abrem o campo de texto com o nome atual', !!campo && campo.tag === 'input' && campo.value === 'Feição do relatório' && campo.focused === true);
    campo.value = 'Imóvel objeto';
    campo.listeners.keydown({ key: 'Enter', stopPropagation() {} });
    ok('Enter grava o nome direto na legenda', b.ctl.getConfig().legenda.nomes.feicao === 'Imóvel objeto' && /Imóvel objeto/.test(legend.innerHTML));
}

// ---------------------------------------------------------------- anotações: card branco (CSS), estilo, giro
{
    const eventos = {};
    const docE = makeDoc(ids);
    docE.addEventListener = (n, fn) => { eventos[n] = fn; };
    docE.removeEventListener = (n) => { delete eventos[n]; };
    const b = build({ mapa: { anotacoes: [{ id: 'a1', lat: -7.015, lng: -34.835, texto: 'Muro <alto>' }] } }, undefined, { doc: docE });
    const notas = () => b.layersOf('marker').filter(m => m.args.o.icon.className === 'report-note');
    const h = () => notas()[0].args.o.icon.html;
    ok('anotação: texto escapado, giro, estilo (negrito por padrão) e ícone de girar', /Muro &lt;alto&gt;/.test(h()) && /rotate\(0deg\)/.test(h()) && /font-weight:700;font-style:normal;text-decoration:none/.test(h()) && /report-rot no-print/.test(h()));
    b.ctl.styleNote('a1', 'n'); b.ctl.styleNote('a1', 'i'); b.ctl.styleNote('a1', 's');
    ok('N / I / S da anotação: sem negrito, itálico e sublinhado', /font-weight:400;font-style:italic;text-decoration:underline/.test(h()));
    eq('estilo guardado na anotação', b.ctl.getConfig().anotacoes[0].estilo, { n: false, i: true, s: true });
    b.ctl.styleNote('a1', 'x');
    eq('opção de estilo inválida é ignorada', b.ctl.getConfig().anotacoes[0].estilo, { n: false, i: true, s: true });
    const mk = notas()[0];
    mk.span.getBoundingClientRect = () => ({ left: 100, top: 100, width: 20, height: 10 });
    mk.span.style = {};
    mk.span.classList = { added: [], add(c) { this.added.push(c); } };
    mk.span.listeners.pointerdown({ stopPropagation() {}, preventDefault() {} });
    eq('durante o giro o ícone fica visível (classe "rotating")', mk.span.classList.added, ['rotating']);
    eventos.pointermove({ clientX: 110, clientY: 155 });
    eventos.pointerup({});
    eq('girar a anotação guarda o giro e mantém texto e estilo', [b.ctl.getConfig().anotacoes[0].rot, /rotate\(90deg\)/.test(h()), /italic/.test(h()), b.ctl.getConfig().anotacoes[0].texto], [90, true, true, 'Muro <alto>']);
    b.ctl.renameNote('a1', 'Muro novo');
    eq('renomear preserva estilo e giro', [b.ctl.getConfig().anotacoes[0].estilo.i, b.ctl.getConfig().anotacoes[0].rot, /Muro novo/.test(h())], [true, 90, true]);
    notas()[0].span.listeners.dblclick({ stopPropagation() {} });
    eq('dois cliques no ícone tiram o giro da anotação', [b.ctl.getConfig().anotacoes[0].rot, /rotate\(0deg\)/.test(h())], [undefined, true]);
}

// ---------------------------------------------------------------- coluna Confrontantes (controlador)
{
    const viz = { id: 'V', name: 'Vizinhos', color: '#f00', kind: 'polygon', truncated: false, campos: [{ k: 'nome', l: 'Nome' }], features: [{ type: 'Feature', properties: { r: 'Lote 02', f: { nome: 'Fulano' } }, geometry: { type: 'Polygon', coordinates: [[[-34.83, -7.02], [-34.82, -7.02], [-34.82, -7.01], [-34.83, -7.01], [-34.83, -7.02]]] } }] };
    const b = build({ mapa: { pontos: { ativo: true, memorial: true, ordem: ['v:0', 'v:1', 'v:2', 'v:3'] } } }, undefined, { camadas: [viz] });
    eq('sem a coluna ligada: sem texto de confrontante', b.ctl.pointRows().rows.map(r => r.confrontantes), [undefined, undefined, undefined, undefined]);
    b.ctl.setColConf({ ativo: true, camadas: [{ id: 'V', campos: ['nome'], logradouro: false }], tolM: 3, distLogM: 30 });
    eq('coluna ligada: o lado leste (P2 até P3) tem o vizinho pelo campo escolhido', [b.ctl.pointRows().colConfrontantes, b.ctl.pointRows().rows.map(r => r.confrontantes)], [true, ['', 'Fulano', '', '']]);
    b.ctl.setTabelaTexto('v:0:cf', 'Rua A');
    b.ctl.setTabelaTexto('v:1:or', 'Trecho leste');
    eq('texto do usuário na célula (confrontantes e orientação)', [b.ctl.pointRows().rows[0].confrontantes, b.ctl.pointRows().rows[1].orientacao], ['Rua A', 'Trecho leste']);
    b.ctl.setColConf({ ativo: true, camadas: [{ id: 'V', campos: [], logradouro: false }], tolM: 3, distLogM: 30 });
    eq('mudar as camadas/campos descarta o texto escrito nas células de confrontantes; a orientação fica', [b.ctl.getConfig().pontos.textos['v:0:cf'], b.ctl.getConfig().pontos.textos['v:1:or']], [undefined, 'Trecho leste']);
    b.ctl.movePoint('v:3', -1);
    eq('mudar a sequência dos pontos descarta também a orientação escrita (recalculada)', b.ctl.getConfig().pontos.textos['v:1:or'], undefined);
    b.ctl.setConfig({ pontos: { colConf: { ativo: false } } });
    eq('desligar a coluna (pelo setConfig) também funciona', b.ctl.pointRows().colConfrontantes, false);
}

// ---------------------------------------------------------------- altura do mapa
{
    const b = build({});
    eq('altura padrão do modelo: 90 mm', b.ctl.getConfig().alturaMm, 90);
    const n0 = b.changes.length;
    b.ctl.setAltura(150.4);
    eq('setAltura arredonda, guarda e avisa a mudança', [b.ctl.getConfig().alturaMm, b.changes.length, b.changes[b.changes.length - 1].alturaMm], [150, n0 + 1, 150]);
    b.ctl.setAltura(5); eq('mínimo 40 mm', b.ctl.getConfig().alturaMm, 40);
    b.ctl.setAltura(9999); eq('máximo 400 mm (a folha limita antes)', b.ctl.getConfig().alturaMm, 400);
    b.ctl.setAltura('x'); eq('valor inválido é ignorado', b.ctl.getConfig().alturaMm, 400);
    b.ctl.setAltura(120);
    eq('o que se salva leva a altura', b.ctl.snapshot().alturaMm, 120);
}

// ---------------------------------------------------------------- quadriculado
t = build({});
eq('quadriculado desligado: nada desenhado', t.layersOf('polyline').length, 0);
t.ctl.setConfig({ quadriculado: { ativo: true, espacamento: 50 } });
const linhasG = t.layersOf('polyline');
ok('quadriculado ligado: linhas tracejadas, sem clique', linhasG.length > 4 && linhasG.every(l => l.args.o.dashArray && l.args.o.interactive === false));
const glabels = (tt) => tt.layersOf('marker').filter(m => m.args.o.icon.className === 'report-glabel');
ok('cada linha traz o valor da coordenada (E/N) no padrão brasileiro', glabels(t).length === linhasG.length && glabels(t).every(m => /^(E|N) [\d.]+$/.test(m.args.o.icon.html.replace(/<[^>]+>/g, ''))));
const n0 = linhasG.length;
t.map.center = { lat: -7.0, lng: -34.9 };
t.map.handlers.moveend();
ok('mover o mapa redesenha a grade (e não acumula linhas antigas)', t.layersOf('polyline').length > 0 && t.layersOf('polyline').length < n0 * 3);
t.ctl.setConfig({ quadriculado: { ativo: false } });
eq('desligar remove linhas e valores', [t.layersOf('polyline').length, glabels(t).length], [0, 0]);

// ---------------------------------------------------------------- mapa de situação
t = build({});
ok('situação desligada: caixa escondida e nenhum mapa extra', t.doc.els['map-locator'].style.display === 'none' && t.L.__maps.length === 1);
t.ctl.setConfig({ situacao: { ativo: true } });
const loc = t.L.__maps[1];
ok('situação ligada: mapa pequeno criado na caixa, sem interação e sem controles', t.doc.els['map-locator'].style.display === 'block' && !!loc && loc.options.zoomControl === false && loc.options.dragging === false && loc.options.attributionControl === false);
ok('situação: fundo de ruas, ponto da feição e retângulo do que o mapa principal mostra', Array.from(loc.layers).some(l => l.kind === 'tile') && Array.from(loc.layers).some(l => l.kind === 'circle') && Array.from(loc.layers).some(l => l.kind === 'rectangle'));
eq('situação: 6 níveis de zoom abaixo do mapa principal, centrada na feição', [loc.zoom, loc.center.lat, loc.center.lng], [12, -7.015, -34.835]);
t.map.zoom = 19; t.map.handlers.zoomend();
eq('situação acompanha o zoom do mapa principal', loc.zoom, 13);
eq('a caixa não cria um segundo mapa a cada movimento', t.L.__maps.length, 2);
ok('só um retângulo (o antigo é removido)', Array.from(loc.layers).filter(l => l.kind === 'rectangle').length === 1);
t.ctl.setConfig({ situacao: { ativo: false } });
eq('situação desligada de novo: caixa escondida', t.doc.els['map-locator'].style.display, 'none');

// ---------------------------------------------------------------- anotações de texto
const notas = (tt) => tt.layersOf('marker').filter(m => m.args.o.icon.className === 'report-note');
t = build({});
const id1 = t.ctl.addNote('Muro de arrimo');
eq('nova anotação no centro do mapa', [id1, notas(t).length, notas(t)[0].args.pos], ['a1', 1, [-7.015, -34.835]]);
ok('anotação arrastável e com dica', notas(t)[0].args.o.draggable === true && /Duplo clique/.test(notas(t)[0].args.o.icon.html));
const id2 = t.ctl.addNote('');
eq('sem texto vira "Anotação"; segundo id', [id2, t.ctl.getConfig().anotacoes[1].texto], ['a2', 'Anotação']);
notas(t)[0].latlng = { lat: -7.0141, lng: -34.8341 };
notas(t)[0].handlers.dragend();
eq('arrastar guarda a nova posição', [t.ctl.getConfig().anotacoes[0].lat, t.ctl.getConfig().anotacoes[0].lng], [-7.0141, -34.8341]);
notas(t)[0].handlers.dblclick({});
const cN = notas(t)[0].span.children[0];
ok('duplo clique abre o campo com o texto', !!cN && cN.value === 'Muro de arrimo' && notas(t)[0].draggingOff === true);
cN.value = 'Muro <i>novo</i>';
cN.listeners.keydown({ key: 'Enter' });
ok('Enter grava e o texto é escapado', t.ctl.getConfig().anotacoes[0].texto === 'Muro <i>novo</i>' && /Muro &lt;i&gt;novo&lt;\/i&gt;/.test(notas(t)[0].args.o.icon.html) && !/<i>/.test(notas(t)[0].args.o.icon.html));
notas(t)[0].handlers.dblclick({});
notas(t)[0].span.children[0].value = '   ';
notas(t)[0].span.children[0].listeners.keydown({ key: 'Enter' });
eq('texto vazio apaga a anotação', [t.ctl.getConfig().anotacoes.map(a => a.id), notas(t).length], [['a2'], 1]);
notas(t)[0].handlers.dblclick({});
notas(t)[0].span.children[0].listeners.keydown({ key: 'Escape' });
eq('Esc cancela', t.ctl.getConfig().anotacoes[0].texto, 'Anotação');
t.ctl.removeNote('a2');
eq('remover', [t.ctl.getConfig().anotacoes.length, notas(t).length], [0, 0]);
t.ctl.addNote('x');
const idNovo = t.ctl.addNote('y');
eq('ids não se repetem depois de remover', idNovo, 'a2');
const tN = build({ mapa: { anotacoes: [{ id: 'a1', lat: -7.01, lng: -34.83, texto: 'Salva' }] } });
ok('anotações salvas voltam ao abrir e entram no snapshot', notas(tN).length === 1 && tN.ctl.snapshot().anotacoes[0].texto === 'Salva');
tN.ctl.reset(MT.normalizeMapConfig({}));
eq('restaurar padrão do modelo limpa as anotações', notas(tN).length, 0);
const lotado = build({ mapa: { anotacoes: Array.from({ length: 30 }, (_, i) => ({ lat: -7, lng: -34, texto: 't' + i })) } });
eq('limite de 30 anotações', lotado.ctl.addNote('mais uma'), null);

console.log(`reportMap: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
