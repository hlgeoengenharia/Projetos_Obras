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
    }
    const L = {
        map: (c, o) => new FakeMap(c, o),
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
const ids = ['map-north', 'map-info-bar', 'map-legend', 'map-sides-text', 'map-area-text'];

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
ok('barra de info traz escala aproximada e a projeção SIRGAS 2000 UTM 25S', /Escala aprox\. 1:/.test(t.doc.els['map-info-bar'].innerHTML) && /SIRGAS 2000 \/ UTM zona 25S/.test(t.doc.els['map-info-bar'].innerHTML));
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
t.ctl.setConfig({ destaque: { ativo: false } });
ok('sem destaque não há máscara', t.layersOf('polygon').length === 0);

// ---------------------------------------------------------------- mapa base
t.ctl.setConfig({ baseMap: 'satelite' });
ok('satélite: troca o mapa base e mostra o crédito Esri', t.layersOf('tile').length === 1 && /arcgisonline/.test(t.layersOf('tile')[0].args.u) && /Esri/.test(t.layersOf('tile')[0].args.o.attribution));
t.ctl.setConfig({ baseMap: 'nenhum' });
ok('sem mapa base: nenhum tile e fundo branco', t.layersOf('tile').length === 0 && t.map.cont.style.background === '#ffffff');
t.ctl.setConfig({ baseMap: 'osm' });
ok('volta ao OSM', t.layersOf('tile').length === 1);

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
ok('sem escala e sem projeção: barra de info oculta', t.doc.els['map-info-bar'].style.display === 'none');
t.ctl.setConfig({ projecao: true });
ok('só projeção: aparece a projeção e não a escala', /SIRGAS/.test(t.doc.els['map-info-bar'].innerHTML) && !/Escala aprox/.test(t.doc.els['map-info-bar'].innerHTML));
t.map.zoom = 17; t.map.handlers.zoomend();
t.ctl.setConfig({ escala: true });
ok('escala acompanha o zoom (zoom 17 ≈ 2 vezes a do 18)', (() => {
    const m = /1:([\d.]+)/.exec(t.doc.els['map-info-bar'].innerHTML);
    const n17 = parseInt(m[1].replace(/\./g, ''), 10);
    t.map.zoom = 18; t.map.handlers.zoomend();
    const m2 = /1:([\d.]+)/.exec(t.doc.els['map-info-bar'].innerHTML);
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
const label = (mk) => mk.args.o.icon.html;
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

// ---------------------------------------------------------------- pontos nos vértices
const handles = (tt) => tt.layersOf('circle');
const pontosMk = (tt) => tt.layersOf('marker').filter(m => m.args.o.icon.className === 'report-point');
const nomeDoPonto = (mk) => mk.args.o.icon.html.replace(/<[^>]+>/g, '');
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

console.log(`reportMap: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
