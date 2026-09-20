// tests/viewerSmoke.test.js
// FUMAÇA do visualizador inteiro: executa o script REAL de relatorio_view.html com um DOM simulado e
// confere que o relatório monta as folhas, o mini-mapa e o painel "Mapa" — sem erro de execução.
// Vários cenários (modelo padrão, análise temporal ligada/desligada, com e sem janela de origem).
// Rodar com: node tests/viewerSmoke.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let total = 0;
let failed = 0;
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

const html = read('relatorio_view.html');
const inline = [];
html.replace(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g, (m, code) => { inline.push(code); return m; });
const pageScript = inline.find(c => c.includes('function initReportViewer'));
const localScripts = [];
html.replace(/<script[^>]*\bsrc="(src\/[^"]+)"/g, (m, src) => { localScripts.push(src); return m; });

const quad = { type: 'Polygon', coordinates: [[[-34.84, -7.02], [-34.839, -7.02], [-34.839, -7.019], [-34.84, -7.019], [-34.84, -7.02]]] };
const camadaA = { id: 'A', name: 'Lotes', color: '#ff0000', kind: 'polygon', features: [{ type: 'Feature', properties: {}, geometry: quad }], truncated: false };
const orto1 = { id: 'r1', nome: 'Ortofoto_10-02-2026', dataISO: '2026-02-10', precisao: 'dia', dataTxt: '10/02/2026', url: 'https://s/{z}/{x}/{y}.png', tipo: 'xyz_tiles', zoomMin: 14, zoomMax: 22, bbox: null, opacidade: 1, coberturaConhecida: false };

function tplWith(mapa, extraBlocks) {
    return {
        id: 'rpt_smoke', nome: 'Ficha Individual', tipo: 'individual', form_id: 'f1',
        config_pagina: { tamanho: 'A4', orientacao: 'portrait', margens_mm: { top: 15, bottom: 15, left: 15, right: 15 } },
        blocos: [
            { id: 'h', tipo: 'cabecalho', titulo: 'FICHA CADASTRAL', subtitulo: 'Prefeitura' },
            { id: 'm', tipo: 'mapa_estatico', titulo: 'Delimitação Cartográfica', mapa: mapa, notaTecnica: 'Nota técnica X' },
            { id: 'g', tipo: 'grade_campos', titulo: 'Dados', colunasLayout: 2, campos_selecionados: [] }
        ].concat(extraBlocks || [], [{ id: 'f', tipo: 'rodape', numeracao: true }])
    };
}

async function runScenario(cfg) {
    const registry = {};
    const errors = [];
    function makeEl(tag, id) {
        const el = {
            tagName: tag, id: id || '', style: {}, children: [], _html: '', textContent: '', className: '', value: '',
            classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
            setAttribute() {}, removeAttribute() {}, addEventListener() {}, removeEventListener() {},
            appendChild(c) { this.children.push(c); if (c && c.id) registry[c.id] = c; return c; },
            removeChild() {}, remove() { if (this.id) delete registry[this.id]; },
            replaceWith(o) { if (this.id) registry[this.id] = o; },
            querySelector: () => null, querySelectorAll: () => [],
            getBoundingClientRect: () => ({ height: 120, width: 700 }),
            get offsetHeight() { return 120; },
            get firstElementChild() { return { offsetHeight: 120 }; },
            focus() {}, select() {}, click() {},
            set innerHTML(v) { this._html = String(v); indexIds(this._html); },
            get innerHTML() { return this._html; }
        };
        if (id) registry[id] = el;
        return el;
    }
    function indexIds(s) {
        const re = /\bid="([^"]+)"/g; let m;
        while ((m = re.exec(s))) if (!registry[m[1]] || !registry[m[1]]._real) registry[m[1]] = makeEl('div', m[1]);
    }
    ['a4-document-container', 'report-header-title'].forEach(id => { registry[id] = makeEl('div', id); registry[id]._real = true; });
    const documentStub = {
        body: makeEl('body'), documentElement: { style: { setProperty() {} } }, head: makeEl('head'), title: '',
        getElementById: (id) => registry[id] || null, createElement: (tag) => makeEl(tag),
        querySelector: () => null, querySelectorAll: () => [], addEventListener() {}
    };

    const mapsCreated = [];
    const layer = (kind) => { const l = { kind, addTo(m) { (m.layers = m.layers || []).push(l); return l; }, on() { return l; }, bringToFront() {}, getBounds: () => ({}), setStyle() {} }; return l; };
    const Lstub = {
        map: (c, o) => { const m = { container: c, options: o, layers: [], attributionControl: { setPrefix() {} }, removeLayer() {}, removeControl() {}, on() {}, fitBounds() {}, setView() {}, getCenter: () => ({ lat: -7.015, lng: -34.835 }), getZoom: () => 18, getContainer: () => ({ style: {} }), invalidateSize() {}, remove() {} }; mapsCreated.push(m); return m; },
        tileLayer: () => layer('tile'), imageOverlay: () => layer('image'), geoJSON: () => layer('geojson'), polygon: () => layer('polygon'),
        circleMarker: () => layer('circle'), divIcon: (o) => o, marker: () => { const l = layer('marker'); l.dragging = { disable() {} }; l.getElement = () => null; l.getLatLng = () => ({ lat: 0, lng: 0 }); return l; },
        control: { scale: () => ({ addTo() {} }) }, DomEvent: { stopPropagation() {} }
    };

    const store = {};
    const storage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    storage.setItem('constructive_active_report_payload', JSON.stringify(cfg.payload));
    const timers = [];
    const listeners = {};
    // janela de origem (a página do mapa) com o adaptador de ajustes, como no uso real
    const opener = cfg.opener ? { closed: false, ReportAdapter: { getAjustes: async () => cfg.ajustes || null, saveAjustes: async () => ({ ok: true, remoto: false }) } } : null;
    const windowStub = {
        addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
        location: { search: '?templateId=rpt_smoke', href: '' }, localStorage: storage, sessionStorage: storage, opener,
        innerWidth: cfg.width || 1900, scrollY: 0, scrollTo() {}, print() {}, getSelection: () => ({ removeAllRanges() {}, addRange() {} })
    };
    const sandbox = {
        window: windowStub, document: documentStub, localStorage: storage, sessionStorage: storage, L: Lstub, navigator: {},
        console: { log() {}, info() {}, warn() {}, error: (...a) => { errors.push(a.map(String).join(' ')); } },
        setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
        Image: function () { Object.defineProperty(this, 'src', { set: () => {} }); },
        alert() {}, confirm: () => true, URL, Blob: function () {}
    };
    sandbox.self = sandbox.window;
    vm.createContext(sandbox);
    localScripts.forEach(src => { try { vm.runInContext(read(src), sandbox, { filename: src }); } catch (e) { errors.push('script ' + src + ': ' + e.message); } });
    ['PageSize', 'MapTools', 'ReportMap', 'ReportTemporal', 'FieldFormatter', 'ReportData'].forEach(n => { if (windowStub[n]) sandbox[n] = windowStub[n]; });
    sandbox.unhandled = [];
    try { vm.runInContext(pageScript, sandbox, { filename: 'relatorio_view.html(inline)' }); } catch (e) { errors.push('script da página: ' + e.stack); }
    (listeners.DOMContentLoaded || []).forEach(fn => { try { fn(); } catch (e) { errors.push('DOMContentLoaded: ' + e.stack); } });

    const onRej = (e) => errors.push('promessa rejeitada: ' + (e && e.stack || e));
    process.on('unhandledRejection', onRej);
    for (let i = 0; i < 14; i++) {
        const fila = timers.splice(0, timers.length);
        fila.forEach(tm => { if (tm.fn) { try { tm.fn(); } catch (e) { errors.push('timer: ' + e.stack); } } });
        await new Promise(r => setImmediate(r));
        await new Promise(r => setImmediate(r));
    }
    process.removeListener('unhandledRejection', onRej);
    return { sandbox, registry, errors, mapsCreated, doc: registry['a4-document-container']._html, panel: registry['map-tools-panel'] ? registry['map-tools-panel']._html : '' };
}

(async () => {
    const cenarios = [
        { nome: 'modelo padrão (temporal desligada), sem ortofotos, sem janela de origem', payload: { templateId: 'rpt_smoke', template: tplWith({}), formId: 'f1', formFields: [], formTabs: [], featureData: { id_banco: 10 }, featureGeometry: quad, featureKey: '10' } },
        { nome: 'payload antigo, sem camadas nem ortofotos, com janela de origem', opener: true, payload: { templateId: 'rpt_smoke', template: tplWith({ destaque: { ativo: true } }), formId: 'f1', featureData: { id_banco: 10 }, featureGeometry: quad } },
        { nome: 'com ortofotos, temporal DESLIGADA no modelo, com janela de origem', opener: true, payload: { templateId: 'rpt_smoke', template: tplWith({}), formId: 'f1', formFields: [], formTabs: [], featureData: { id_banco: 10 }, featureGeometry: quad, featureKey: '10', camadasMapa: [camadaA], ortofotos: [orto1] } },
        { nome: 'com ortofotos, temporal LIGADA e pontos salvos no modelo', opener: true, payload: { templateId: 'rpt_smoke', template: tplWith({ temporal: { ativo: true }, pontos: { ativo: true, ordem: ['v:0', 'v:2'] } }), formId: 'f1', formFields: [], formTabs: [], featureData: { id_banco: 10 }, featureGeometry: quad, featureKey: '10', camadasMapa: [camadaA], ortofotos: [orto1] } },
        { nome: 'ajustes salvos pelo usuário (temporal, pontos, medidas editadas)', opener: true, ajustes: { temporal: { ativo: true, excluidas: [] }, pontos: { ativo: true, ordem: ['v:1'], titulos: { 'v:1': 'M-01' } }, edicoes: { area: '900 m²' } }, payload: { templateId: 'rpt_smoke', template: tplWith({}), formId: 'f1', formFields: [], formTabs: [], featureData: { id_banco: 10 }, featureGeometry: quad, featureKey: '10', camadasMapa: [camadaA], ortofotos: [orto1] } },
        { nome: 'tela estreita (painel recolhido)', width: 965, payload: { templateId: 'rpt_smoke', template: tplWith({}), formId: 'f1', featureData: { id_banco: 10 }, featureGeometry: quad, featureKey: '10', ortofotos: [orto1] } }
    ];

    for (const c of cenarios) {
        const r = await runScenario(c);
        const n = c.nome;
        eq(`[${n}] nenhum erro de execução`, r.errors, []);
        ok(`[${n}] folhas montadas`, /a4-page/.test(r.doc));
        ok(`[${n}] bloco do mini-mapa na folha`, /id="map-wrap"/.test(r.doc) && /id="interactive-report-map"/.test(r.doc));
        ok(`[${n}] Leaflet criado no contêiner do mapa`, r.mapsCreated.some(m => m.container === 'interactive-report-map'));
        ok(`[${n}] painel "Mapa" existe e traz as seções`, /Mapa do relatório/.test(r.panel) && ['Feição em destaque', 'Medidas da feição', 'Pontos nos vértices', 'Análise temporal', 'Camadas ativas no mapa'].every(s => r.panel.includes(s)));
        if (c.payload.ortofotos && c.payload.ortofotos.length) ok(`[${n}] painel lista a ortofoto`, /Ortofoto_10-02-2026/.test(r.panel));
        const temporalLigada = JSON.stringify(c.payload.template.blocos[1].mapa).includes('"temporal"') || (c.ajustes && c.ajustes.temporal && c.ajustes.temporal.ativo);
        if (temporalLigada) ok(`[${n}] quadro da análise temporal na folha e mapa criado`, /Análise Multitemporal de Ortofotos/.test(r.doc) && r.mapsCreated.some(m => m.container && m.container.id === 'tmap-r1'));
        else ok(`[${n}] temporal desligada: nenhum quadro na folha`, !/Análise Multitemporal/.test(r.doc));
        if (n.startsWith('com ortofotos, temporal LIGADA')) ok(`[${n}] pontos salvos geram a tabela`, /Tabela de Pontos/.test(r.doc));
        if (n.startsWith('ajustes salvos')) ok(`[${n}] ajustes voltam: tabela de pontos com o nome salvo`, /M-01/.test(r.doc));
    }

    // ---- visibilidade do painel "Mapa": tela larga = aberto; estreita = recolhido com o botão "Mapa" VISÍVEL
    {
        const larga = await runScenario({ width: 1900, payload: cenarios[0].payload });
        eq('tela larga: painel aberto e botão escondido', [larga.registry['map-tools-panel'].style.display, larga.registry['map-tools-toggle'].style.display], ['block', 'none']);
        const estreita = await runScenario({ width: 965, payload: cenarios[0].payload });
        eq('tela estreita: painel recolhido e botão "Mapa" visível (display explícito, não "vazio")', [estreita.registry['map-tools-panel'].style.display, estreita.registry['map-tools-toggle'].style.display], ['none', 'block']);
        estreita.registry['map-tools-toggle'].onclick();
        eq('clicar no botão abre o painel e some com o botão', [estreita.registry['map-tools-panel'].style.display, estreita.registry['map-tools-toggle'].style.display], ['block', 'none']);
        estreita.sandbox.mapPanelPontos('ativo', true);
        await new Promise(r => setImmediate(r));
        eq('mudar uma opção (o painel é redesenhado) não fecha o painel que o usuário abriu', estreita.registry['map-tools-panel'].style.display, 'block');
        estreita.sandbox.mapPanelHide();
        eq('recolher volta ao botão', [estreita.registry['map-tools-panel'].style.display, estreita.registry['map-tools-toggle'].style.display], ['none', 'block']);
    }

    console.log(`viewerSmoke: ${total - failed}/${total} verificações passaram`);
    if (failed > 0) {
        console.error(`${failed} falha(s)`);
        process.exit(1);
    }
})();
