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
function makeL() {
    class Layer {
        constructor(kind, args) { this.kind = kind; this.args = args; }
        addTo(m) { m.layers.add(this); this.map = m; return this; }
        bringToFront() { this.front = true; }
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
        control: { scale: (o) => new Control('scale', o) }
    };
    return L;
}

function makeDoc(ids) {
    const els = {};
    ids.forEach(id => { els[id] = { style: {}, innerHTML: '' }; });
    return { els, getElementById: (id) => els[id] || null };
}

const poly = { type: 'Polygon', coordinates: [[[-34.84, -7.02], [-34.83, -7.02], [-34.83, -7.01], [-34.84, -7.01], [-34.84, -7.02]]] };
const camadas = [
    { id: '1', name: 'Lotes <vizinhos>', color: '#ff0000', kind: 'polygon', features: [{ type: 'Feature', properties: {}, geometry: poly }], truncated: false },
    { id: '4', name: 'Linhas', color: '#00ff00', kind: 'line', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-34.84, -7.02], [-34.83, -7.01]] } }], truncated: true }
];
const ids = ['map-north', 'map-info-bar', 'map-legend'];

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

console.log(`reportMap: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
