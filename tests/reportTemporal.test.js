// tests/reportTemporal.test.js
// Análise temporal (uma ortofoto por quadro), com Leaflet e DOM simulados.
// Rodar com: node tests/reportTemporal.test.js

const MT = require('../src/mapTools.js');
const RT = require('../src/reportTemporal.js');

let total = 0;
let failed = 0;
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

// ---------------------------------------------------------------- Leaflet e DOM simulados
function makeL() {
    class Layer {
        constructor(kind, args) { this.kind = kind; this.args = args; }
        addTo(m) { m.layers.add(this); return this; }
    }
    class Control {
        constructor(o) { this.kind = 'scale'; this.o = o; }
        addTo(m) { m.controls.add(this); return this; }
    }
    class FakeMap {
        constructor(container, options) {
            this.container = container; this.options = options;
            this.layers = new Set(); this.controls = new Set(); this.handlers = {};
            this.center = { lat: -7.015, lng: -34.835 }; this.zoom = 18; this.removed = false; this.views = [];
            this.attributionControl = { setPrefix: () => {} };
        }
        removeLayer(l) { this.layers.delete(l); }
        removeControl(c) { this.controls.delete(c); }
        on(ev, fn) { this.handlers[ev] = fn; }
        fitBounds(b, o) { this.fitted = { b, o }; }
        setView(c, z, o) { this.center = { lat: c[0], lng: c[1] }; this.zoom = z; this.views.push({ c, z, o }); }
        getCenter() { return this.center; }
        getZoom() { return this.zoom; }
        invalidateSize() { this.invalidated = (this.invalidated || 0) + 1; }
        remove() { this.removed = true; }
    }
    return {
        map: (c, o) => new FakeMap(c, o),
        tileLayer: (u, o) => new Layer('tile', { u, o }),
        imageOverlay: (u, b, o) => new Layer('image', { u, b, o }),
        geoJSON: (d, o) => new Layer('geojson', { d, o }),
        circleMarker: (ll, o) => new Layer('circle', { ll, o }),
        control: { scale: (o) => new Control(o) }
    };
}

// DOM: "renderiza" o HTML dos quadros criando um elemento por id encontrado
function makeDoc() {
    const els = {};
    return {
        els,
        render(html) {
            Object.keys(els).forEach(k => delete els[k]);
            const re = /id="([^"]+)"/g; let m;
            while ((m = re.exec(html))) {
                const id = m[1];
                els[id] = { id, replacedBy: null, replaceWith(other) { this.replacedBy = other; els[id] = other; } };
            }
        },
        getElementById: (id) => els[id] || null
    };
}

const quad = { type: 'Polygon', coordinates: [[[-34.84, -7.02], [-34.839, -7.02], [-34.839, -7.019], [-34.84, -7.019], [-34.84, -7.02]]] };
const rasters = [
    { id: 'r1', nome: 'Ortofoto_10-02-2026', url_imagem: 'https://s/{z}/{x}/{y}.png', tipo: 'xyz_tiles', bbox: [], zoom_min: 14, zoom_max: 22, opacidade: 0.9 },
    { id: 'r2', nome: 'Base Cabedelo 2021', url_imagem: 'https://s2/{z}/{x}/{y}.png', tipo: 'xyz_tiles', bbox: [] },
    { id: 'r4', nome: 'Voo cobre', url_imagem: 'https://img/cobre.webp', bbox: [[-7.03, -34.85], [-7.0, -34.82]], data_imagem: '2023-07-01' },
    { id: 'r5', nome: 'Sem data', url_imagem: 'https://s5/{z}/{x}/{y}.png' }
];
const lista = MT.buildOrtofotoList(rasters, quad, {});

function build(temporal, extra) {
    const L = makeL();
    const doc = makeDoc();
    const ev = { structure: 0, change: 0 };
    const ctl = RT.create(Object.assign({
        L, MapTools: MT, doc, geometry: quad, ortofotos: lista, corContorno: '#ff8800',
        config: MT.normalizeMapConfig({ mapa: { temporal: Object.assign({ ativo: true }, temporal || {}) } }).temporal,
        onStructureChange: () => { ev.structure++; }, onChange: () => { ev.change++; }
    }, extra || {}));
    return { L, doc, ctl, ev };
}
const maps = (t) => Object.keys(t.ctl._inst).map(id => t.ctl._inst[id]);

(async () => {
    // ---------------------------------------------------------------- quadros e ordem
    let t = build({});
    eq('todas as candidatas entram enquanto a cobertura não foi verificada', t.ctl.frames().map(o => o.id), ['r2', 'r4', 'r1', 'r5']);
    ok('ortofoto com bbox conhecido já nasce como coberta', t.ctl.list().find(x => x.id === 'r4').status === 'ok' && t.ctl.list().find(x => x.id === 'r1').status === 'verificando');
    t = build({ ordem: 'desc' });
    eq('ordem mais recente primeiro (sem data no fim)', t.ctl.frames().map(o => o.id), ['r1', 'r4', 'r2', 'r5']);

    // ---------------------------------------------------------------- verificação de cobertura
    const probes = [];
    t = build({}, { probe: (o) => { probes.push(o.id); return Promise.resolve(o.id === 'r2' ? false : (o.id === 'r5' ? null : true)); } });
    await t.ctl.start();
    eq('só as ortofotos sem bbox são testadas', probes.sort(), ['r1', 'r2', 'r5']);
    eq('sem imagem no local: quadro sai; dúvida (null): fica', t.ctl.frames().map(o => o.id), ['r4', 'r1', 'r5']);
    ok('a lista do painel mostra o estado de cada uma', (() => { const l = t.ctl.list(); return l.find(x => x.id === 'r2').status === 'sem-cobertura' && l.find(x => x.id === 'r1').status === 'ok'; })());
    ok('ao terminar a verificação a página é avisada uma vez para repaginar', t.ev.structure === 1 && t.ev.change >= 3);
    t = build({}, { probe: () => Promise.reject(new Error('rede')) });
    await t.ctl.start();
    eq('falha ao testar não derruba nem esconde a ortofoto', t.ctl.frames().length, 4);
    t = build({});
    await t.ctl.start();
    eq('sem função de teste: nada some', t.ctl.frames().length, 4);

    // ---------------------------------------------------------------- bloco (linhas por colunas)
    t = build({ colunas: 2 });
    let b = t.ctl.block();
    ok('bloco divisível entre folhas', !!b.split && Array.isArray(b.split.rowsHtml) && typeof b.split.chunkHtml === 'function');
    eq('4 quadros em 2 colunas = 2 linhas', b.split.rowsHtml.length, 2);
    ok('cada linha é medível e não parte entre folhas', b.split.rowsHtml.every(r => /data-split-row/.test(r) && /page-break-inside:avoid/.test(r)));
    ok('grade com o número de colunas', /grid-template-columns:repeat\(2,/.test(b.split.rowsHtml[0]));
    const chunk = b.split.chunkHtml(b.split.rowsHtml, true);
    ok('título, quantidade e ordem', /Análise Multitemporal de Ortofotos/.test(chunk) && /4 imagem\(ns\)/.test(chunk) && /da mais antiga para a mais recente/.test(chunk));
    ok('cada quadro traz nome e data', /Base Cabedelo 2021/.test(chunk) && /<span>2021<\/span>/.test(chunk) && /10\/02\/2026/.test(chunk) && /Data não informada/.test(chunk));
    ok('primeira parte sem "continuação"; as seguintes com', !/continuação/.test(chunk) && /continuação/.test(b.split.chunkHtml([b.split.rowsHtml[1]], false)));
    t = build({ colunas: 3 });
    b = t.ctl.block();
    ok('3 colunas: linha incompleta é preenchida para manter o tamanho dos quadros', b.split.rowsHtml.length === 2 && (b.split.rowsHtml[1].match(/<div><\/div>/g) || []).length === 2);
    ok('altura do quadro vem da configuração (70 mm ≈ 265 px)', /height:265px/.test(b.split.rowsHtml[0]));
    t = build({ ativo: false });
    eq('análise desligada: bloco vazio (não ocupa folha)', t.ctl.block(), '');
    t = build({ ativo: true }, { ortofotos: [] });
    eq('sem ortofotos: bloco vazio', t.ctl.block(), '');
    const nome = build({}, { ortofotos: [Object.assign({}, lista[0], { nome: 'A<b>x</b>' })] });
    ok('nome da ortofoto é escapado', !/<b>x/.test(nome.ctl.block().split.rowsHtml[0]) && /A&lt;b&gt;x/.test(nome.ctl.block().split.rowsHtml[0]));

    // ---------------------------------------------------------------- mapas vivos
    t = build({ ordem: 'asc', colunas: 2 });
    t.doc.render(t.ctl.block().split.rowsHtml.join(''));
    t.ctl.attach();
    eq('um mapa por quadro', maps(t).length, 4);
    const mp = t.ctl._inst['r1'];
    ok('ortofoto em tiles vira camada de tiles com os limites e a opacidade dela', (() => { const l = Array.from(mp.map.layers).find(x => x.kind === 'tile'); return !!l && l.args.u === 'https://s/{z}/{x}/{y}.png' && l.args.o.minNativeZoom === 14 && l.args.o.maxNativeZoom === 22 && l.args.o.opacity === 0.9 && /Ortofoto: Ortofoto_10-02-2026/.test(l.args.o.attribution) && l.args.o.crossOrigin === true; })());
    ok('ortofoto em imagem vira sobreposição no bbox dela', (() => { const l = Array.from(t.ctl._inst['r4'].map.layers).find(x => x.kind === 'image'); return !!l && l.args.u === 'https://img/cobre.webp' && l.args.b[0][0] === -7.03; })());
    ok('todos os quadros enquadram a feição do mesmo jeito', maps(t).every(m => m.map.fitted && m.map.fitted.b[0][0] === -7.02 && m.map.fitted.b[1][1] === -34.839));
    ok('contorno da feição na cor do destaque, sem preenchimento (não cobre a imagem)', (() => { const g = Array.from(mp.map.layers).find(x => x.kind === 'geojson'); const s = g.args.o.style(); return s.color === '#ff8800' && s.fill === false; })());
    ok('escala em metros em cada quadro', Array.from(mp.map.controls).some(c => c.kind === 'scale' && c.o.metric === true && c.o.imperial === false));
    ok('quadros sem controle de zoom e com crédito da ortofoto visível', mp.map.options.zoomControl === false && mp.map.options.attributionControl === true);

    // sincronia
    const [ma, mb] = [t.ctl._inst['r2'].map, t.ctl._inst['r4'].map];
    ma.center = { lat: -7.0121, lng: -34.8312 }; ma.zoom = 19;
    ma.handlers.moveend();
    ok('mover um quadro move todos os outros (sem repetir no que moveu)', mb.views.length === 1 && mb.views[0].z === 19 && mb.views[0].c[0] === -7.0121 && mb.views[0].o.animate === false && ma.views.length === 0);
    t.ctl.setConfig({ sincronizar: false });
    ma.handlers.moveend();
    ok('sincronia desligada: os outros ficam parados', mb.views.length === 1);

    // contorno
    t.ctl.setConfig({ contorno: false });
    ok('contorno desligado some de todos os quadros, sem repaginar', maps(t).every(m => !Array.from(m.map.layers).some(x => x.kind === 'geojson')) && t.ev.structure === 0);
    t.ctl.setConfig({ contorno: true });
    ok('contorno ligado volta', maps(t).every(m => Array.from(m.map.layers).some(x => x.kind === 'geojson')));

    // repaginação: os mapas vivos voltam para o lugar novo
    const antes = t.ctl._inst['r4'];
    const wrapVivo = antes.wrap;
    t.doc.render(t.ctl.block().split.rowsHtml.join(''));
    const novoWrap = t.doc.els['tmap-wrap-r4'];
    t.ctl.attach();
    ok('repaginar reaproveita o mapa vivo (mesmo objeto) e o devolve ao novo lugar', t.ctl._inst['r4'] === antes && novoWrap.replacedBy === wrapVivo && antes.map.invalidated >= 1 && antes.map.removed === false);

    // ---------------------------------------------------------------- mudanças que refazem o layout
    const s0 = t.ev.structure;
    t.ctl.setConfig({ colunas: 3 });
    t.ctl.setConfig({ ordem: 'desc' });
    t.ctl.setConfig({ alturaMm: 100 });
    eq('colunas, ordem e altura pedem repaginação', t.ev.structure - s0, 3);
    t.ctl.setConfig({ colunas: 3 });
    eq('repetir o mesmo valor não faz nada', t.ev.structure - s0, 3);
    t.ctl.toggle('r2', false);
    eq('retirar uma ortofoto tira o quadro e repagina', [t.ctl.frames().map(o => o.id).includes('r2'), t.ev.structure - s0, t.ctl.getConfig().excluidas], [false, 4, ['r2']]);
    ok('a lista do painel mostra a ortofoto retirada como não incluída', t.ctl.list().find(x => x.id === 'r2').incluida === false);
    t.doc.render(t.ctl.block().split.rowsHtml.join(''));
    t.ctl.attach();
    ok('o mapa do quadro retirado é destruído (sem vazar memória)', !t.ctl._inst['r2'] && ma.removed === true);
    t.ctl.toggle('r2', true);
    ok('incluir de novo traz o quadro de volta', t.ctl.frames().map(o => o.id).includes('r2') && t.ctl.getConfig().excluidas.length === 0);
    t.ctl.setConfig({ ativo: false });
    t.doc.render('');
    t.ctl.attach();
    ok('análise desligada: todos os mapas são destruídos', Object.keys(t.ctl._inst).length === 0);
    eq('snapshot devolve a configuração para salvar', (() => { const s = t.ctl.snapshot(); return [s.ativo, s.colunas, s.ordem, s.alturaMm]; })(), [false, 3, 'desc', 100]);
    t.ctl.destroy();

    // ligar depois de aberto dispara a verificação
    let testadas = 0;
    t = build({ ativo: false }, { probe: () => { testadas++; return Promise.resolve(true); } });
    t.ctl.setConfig({ ativo: true });
    await new Promise(r => setTimeout(r, 5));
    ok('ao ligar a análise, as ortofotos em tiles são verificadas', testadas === 3 && t.ev.structure >= 2);

    console.log(`reportTemporal: ${total - failed}/${total} verificações passaram`);
    if (failed > 0) {
        console.error(`${failed} falha(s)`);
        process.exit(1);
    }
})();
