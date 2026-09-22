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
html.replace(/<script[^>]*\bsrc="(src\/[^"?]+)(?:\?[^"]*)?"/g, (m, src) => { localScripts.push(src); return m; });

const quad = { type: 'Polygon', coordinates: [[[-34.84, -7.02], [-34.839, -7.02], [-34.839, -7.019], [-34.84, -7.019], [-34.84, -7.02]]] };
const camadaA = { id: 'A', name: 'Lotes', color: '#ff0000', kind: 'polygon', features: [{ type: 'Feature', properties: {}, geometry: quad }], truncated: false };
const orto1 = { id: 'r1', nome: 'Ortofoto_10-02-2026', dataISO: '2026-02-10', precisao: 'dia', dataTxt: '10/02/2026', url: 'https://s/{z}/{x}/{y}.png', tipo: 'xyz_tiles', zoomMin: 14, zoomMax: 22, bbox: null, opacidade: 1, coberturaConhecida: false };

function tplWith(mapa, extraBlocks) {
    return {
        id: 'rpt_smoke', nome: 'Ficha Individual', tipo: 'individual', form_id: 'f1',
        config_pagina: { tamanho: 'A4', orientacao: 'portrait', margens_mm: { top: 15, bottom: 15, left: 15, right: 15 } },
        blocos: [
            { id: 'h', tipo: 'cabecalho', titulo: 'FICHA CADASTRAL', subtitulo: 'Prefeitura', exibirProtocolo: true, exibirDataHora: true },
            { id: 'm', tipo: 'mapa_estatico', titulo: 'Delimitação Cartográfica', mapa: mapa, notaTecnica: 'Nota técnica X' },
            { id: 'g', tipo: 'grade_campos', titulo: 'Dados', colunasLayout: 2, campos_selecionados: [] }
        ].concat(extraBlocks || [], [{ id: 'f', tipo: 'rodape', numeracao: true }])
    };
}

// HTML → árvore de nós (o suficiente para o conversor do Word: tags, atributos, texto)
function parseHtmlTree(html) {
    const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link']);
    const mk = (tag) => ({ nodeType: 1, tagName: tag.toUpperCase(), id: '', className: '', attrs: {}, childNodes: [], _style: {}, getAttribute(n) { return this.attrs[n]; }, get src() { return this.attrs.src; }, getBoundingClientRect() { return { left: 0, top: 0, right: 300, bottom: 40, width: 300, height: 40 }; } });
    const root = mk('div');
    const stack = [root];
    const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*?)?)\s*(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(html))) {
        if (m[5] !== undefined) { stack[stack.length - 1].childNodes.push({ nodeType: 3, nodeValue: m[5].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') }); continue; }
        if (m[2] === undefined) continue; // comentário
        const tag = m[2].toLowerCase();
        if (m[1]) { for (let i = stack.length - 1; i > 0; i--) if (stack[i].tagName.toLowerCase() === tag) { stack.length = i; break; } continue; }
        const el = mk(tag);
        String(m[3] || '').replace(/([a-zA-Z_:-]+)(?:="([^"]*)")?/g, (mm, k, v) => { el.attrs[k] = v === undefined ? '' : v; return mm; });
        el.id = el.attrs.id || '';
        el.className = el.attrs.class || '';
        String(el.attrs.style || '').split(';').forEach(d => { const i = d.indexOf(':'); if (i > 0) el._style[d.slice(0, i).trim().replace(/-([a-z])/g, (x, c) => c.toUpperCase())] = d.slice(i + 1).trim(); });
        stack[stack.length - 1].childNodes.push(el);
        if (!VOID.has(tag) && !m[4]) stack.push(el);
    }
    return root.childNodes;
}
const BASE_CS = { display: 'block', visibility: 'visible', position: 'static', fontFamily: 'Inter', fontSize: '12px', fontWeight: '400', fontStyle: 'normal', color: 'rgb(0, 0, 0)', backgroundColor: 'rgba(0, 0, 0, 0)', textAlign: 'start', lineHeight: 'normal', whiteSpace: 'normal', textTransform: 'none', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px', paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px', marginTop: '0px', marginBottom: '0px', flexDirection: 'row', alignItems: 'normal' };

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
            cloneNode() { const c = makeEl(tag); c._html = this._html; return c; },
            querySelector: () => null, querySelectorAll: () => [],
            getBoundingClientRect: () => ({ height: 120, width: 700 }),
            get offsetHeight() { return 120; },
            get firstElementChild() { return { offsetHeight: 120 }; },
            focus() {}, select() {}, click() {},
            set innerHTML(v) { this._html = String(v); indexIds(this._html); },
            get innerHTML() { return this._html; },
            get childNodes() { return this.id === 'a4-document-container' ? parseHtmlTree(this._html) : []; }
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
        body: makeEl('body'), documentElement: { style: { setProperty() {} }, classList: { add(c) { (documentStub.classes = documentStub.classes || []).push(c); }, remove() {} } }, head: makeEl('head'), title: '',
        getElementById: (id) => registry[id] || null, createElement: (tag) => makeEl(tag),
        querySelector: () => null, addEventListener() {},
        querySelectorAll: (sel) => {
            if (String(sel).includes('report-tframe-wrap')) return Object.values(registry).filter(e => e.id && e.id.startsWith('tmap-wrap-'));
            if (sel === '[data-chart-canvas]') {
                const html = (registry['a4-document-container'] && registry['a4-document-container']._html) || '';
                const out = [];
                const re = /<canvas([^>]*data-chart-canvas[^>]*)>/g;
                let m;
                while ((m = re.exec(html))) {
                    const tag = m[1];
                    const attr = (name) => { const mm = new RegExp(name + '="([^"]*)"').exec(tag); return mm ? mm[1] : ''; };
                    const id = attr('id');
                    const el = registry[id] || makeEl('canvas', id);
                    el.getAttribute = (n) => attr(n);
                    el.getContext = () => ({});
                    registry[id] = el;
                    out.push(el);
                }
                return out;
            }
            if (sel === '[data-mapa-feicoes]') {
                const html = (registry['a4-document-container'] && registry['a4-document-container']._html) || '';
                const out = [];
                const re = /<div([^>]*data-mapa-feicoes[^>]*)>/g;
                let m;
                while ((m = re.exec(html))) {
                    const tag = m[1];
                    const attr = (name) => { const mm = new RegExp(name + '="([^"]*)"').exec(tag); return mm ? mm[1] : ''; };
                    const id = attr('id');
                    const el = registry[id] || makeEl('div', id);
                    el.getAttribute = (n) => attr(n);
                    registry[id] = el;
                    out.push(el);
                }
                return out;
            }
            if (sel === '.geral-bloco-arrastavel') {
                const html = (registry['a4-document-container'] && registry['a4-document-container']._html) || '';
                const out = [];
                const re = /<div class="geral-bloco-arrastavel" data-bloco-id="([^"]*)">/g;
                let m;
                while ((m = re.exec(html))) {
                    const blocoId = m[1];
                    out.push({ getAttribute: (n) => (n === 'data-bloco-id' ? blocoId : null) });
                }
                return out;
            }
            return [];
        }
    };

    const mapsCreated = [];
    const layer = (kind) => { const l = { kind, addTo(m) { (m.layers = m.layers || []).push(l); return l; }, on() { return l; }, bringToFront() {}, getBounds: () => ({}), setStyle() {} }; return l; };
    const Lstub = {
        map: (c, o) => { const m = { container: c, options: o, layers: [], attributionControl: { setPrefix() {} }, removeLayer() {}, removeControl() {}, on() {}, fitBounds() {}, setView() {}, getCenter: () => ({ lat: -7.015, lng: -34.835 }), getZoom: () => 18, getContainer: () => ({ style: {} }), invalidateSize() {}, remove() {} }; mapsCreated.push(m); return m; },
        tileLayer: () => layer('tile'), imageOverlay: () => layer('image'), geoJSON: () => layer('geojson'), polygon: () => layer('polygon'), polyline: () => layer('polyline'),
        circleMarker: () => layer('circle'), divIcon: (o) => o, marker: () => { const l = layer('marker'); l.dragging = { disable() {} }; l.getElement = () => null; l.getLatLng = () => ({ lat: 0, lng: 0 }); return l; },
        control: { scale: () => ({ addTo() {} }) }, DomEvent: { stopPropagation() {} }
    };

    const store = {};
    const storage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    if (!cfg.edicao) storage.setItem('constructive_active_report_payload', JSON.stringify(cfg.payload));
    const timers = [];
    const listeners = {};
    // janela de origem (a página do mapa) com o adaptador de ajustes, como no uso real
    const captured = { blobs: [], alerts: [], registros: [], prints: 0, downloads: [], qrData: '', mensagens: [], reloads: 0, charts: [], templatesSalvos: [] };
    const opener = cfg.opener ? { closed: false, themes: cfg.themes, ReportAdapter: { getAjustes: async () => cfg.ajustes || null, saveAjustes: async () => ({ ok: true, remoto: false }), registrarEmissao: async (e) => { captured.registros.push(e); return { ok: true, remoto: false }; }, saveReportTemplate: async (t) => { captured.templatesSalvos.push(JSON.parse(JSON.stringify(t))); return true; } } } : null;
    const windowStub = {
        addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
        location: { search: cfg.search || '?templateId=rpt_smoke', origin: 'http://localhost:8080', reload() { captured.reloads++; }, href: 'http://localhost:8080/relatorio_view.html?templateId=rpt_smoke' }, parent: cfg.edicao ? { postMessage: (m) => captured.mensagens.push(m) } : undefined, localStorage: storage, sessionStorage: storage, opener,
        getComputedStyle: (el) => Object.assign({}, BASE_CS, el._style || {}),
        innerWidth: cfg.width || 1900, scrollY: 0, scrollTo() {}, print() { captured.prints++; }, getSelection: () => ({ removeAllRanges() {}, addRange() {} })
    };
    const sandbox = {
        window: windowStub, document: documentStub, localStorage: storage, sessionStorage: storage, L: Lstub, navigator: {},
        getComputedStyle: (el) => Object.assign({}, BASE_CS, el._style || {}),
        console: { log() {}, info() {}, warn() {}, error: (...a) => { errors.push(a.map(String).join(' ')); } },
        setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
        Image: function () { Object.defineProperty(this, 'src', { set: () => {} }); },
        alert: (m) => captured.alerts.push(String(m)), confirm: () => true,
        URL: Object.assign(class extends URL {}, { createObjectURL: (b) => { captured.downloads.push(b); return 'blob:x'; }, revokeObjectURL() {} }),
        Blob: function (parts, opts) { this.parts = parts; this.type = opts && opts.type; captured.blobs.push(this); },
        crypto: require('crypto').webcrypto, TextEncoder, btoa, atob,
        qrcode: () => ({ addData(t) { captured.qrData = t; }, make() {}, createDataURL() { return 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; } }),
        html2canvas: cfg.semHtml2canvas ? undefined : async () => { if (cfg.capturaFalha) throw new Error('CORS'); return { getContext: () => new Proxy({}, { get: (t, k) => (k === 'canvas' ? null : () => {}), set: () => true }), toDataURL: () => 'data:image/png;base64,QUJD' }; },
        Chart: function (ctx, config) { this.ctx = ctx; this.config = config; this.destroy = () => { this.destroyed = true; }; captured.charts.push(this); }
    };
    sandbox.self = sandbox.window;
    vm.createContext(sandbox);
    localScripts.forEach(src => { try { vm.runInContext(read(src), sandbox, { filename: src }); } catch (e) { errors.push('script ' + src + ': ' + e.message); } });
    ['PageSize', 'MapTools', 'ReportMap', 'ReportTemporal', 'ReportExport', 'ReportBlocks', 'ReportEditor', 'ReportFreeText', 'ReportWord', 'ReportDocx', 'MapSnapshot', 'VerificarEmissao', 'FieldFormatter', 'ReportData', 'LayerFilter'].forEach(n => { if (windowStub[n]) sandbox[n] = windowStub[n]; });
    sandbox.unhandled = [];
    try { vm.runInContext(pageScript, sandbox, { filename: 'relatorio_view.html(inline)' }); } catch (e) { errors.push('script da página: ' + e.stack); }
    (listeners.DOMContentLoaded || []).forEach(fn => { try { fn(); } catch (e) { errors.push('DOMContentLoaded: ' + e.stack); } });

    const onRej = (e) => errors.push('promessa rejeitada: ' + (e && e.stack || e));
    async function settle(n) {
        process.on('unhandledRejection', onRej);
        for (let i = 0; i < (n || 14); i++) {
            const fila = timers.splice(0, timers.length);
            fila.forEach(tm => { if (tm.fn) { try { tm.fn(); } catch (e) { errors.push('timer: ' + e.stack); } } });
            await new Promise(r => setImmediate(r));
            await new Promise(r => setTimeout(r, 4)); // o SHA-256 (WebCrypto) termina em outra thread
        }
        process.removeListener('unhandledRejection', onRej);
    }
    await settle(14);
    return { sandbox, registry, errors, mapsCreated, captured, listeners, documentStub, storage, settle, doc: registry['a4-document-container']._html, panel: registry['map-tools-panel'] ? registry['map-tools-panel']._html : '' };
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
        ok(`[${n}] painel "Mapa" existe e traz as seções`, /Configurações do Mapa/.test(r.panel) && !/Mapa do relatório/.test(r.panel) && ['Feição em destaque', 'Camadas ativas no mapa', 'Elementos do mapa', 'Mapa base', 'Medição da feição', 'Pontos nos vértices', 'Medições no mapa', 'Análise temporal', 'Exportar'].every(s => r.panel.includes(s)));
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

    // ---- painel em sanfona: uma seção aberta por vez; clicar na aberta recolhe; a escolha resiste ao redesenho do painel
    {
        const r = await runScenario({ width: 1900, opener: true, payload: cenarios[3].payload });
        const abertas = () => (r.panel_() .match(/data-sec="([a-z]+)" class="sec-body" style="display:block"/g) || []).map(s => /data-sec="([a-z]+)"/.exec(s)[1]);
        r.panel_ = () => r.registry['map-tools-panel']._html;
        const cabecalhos = (r.panel_().match(/data-sec-h="[a-z]+"/g) || []).length;
        eq('sanfona: dez títulos', cabecalhos, 10);
        eq('ordem fixa dos cards no painel (e, portanto, dos blocos na folha)', (r.panel_().match(/data-sec-h="([a-z]+)"/g) || []).map(s => /"([a-z]+)"/.exec(s)[1]), ['destaque', 'camadas', 'elementos', 'base', 'localizacao', 'medidas', 'pontos', 'extras', 'temporal', 'exportar']);
        eq('sanfona: ao abrir só "Feição em destaque" está aberta', abertas(), ['destaque']);
        r.sandbox.mapPanelSecao('medidas');
        r.sandbox.renderMapToolsPanel();
        eq('sanfona: abrir outra recolhe a anterior (e vale após redesenhar)', abertas(), ['medidas']);
        r.sandbox.mapPanelSecao('medidas');
        r.sandbox.renderMapToolsPanel();
        eq('sanfona: clicar na seção aberta a recolhe', abertas(), []);
        r.sandbox.mapPanelSecao('base');
        r.sandbox.renderMapToolsPanel();
        ok('mapa base lista as ortofotos ativas do projeto', abertas()[0] === 'base' && /<optgroup label="Ortofotos ativas no projeto">/.test(r.panel_()) && /value="ortofoto:r1"/.test(r.panel_()) && /Ortofoto_10-02-2026/.test(r.panel_()));
        r.sandbox.mapPanelSet('baseMap', 'ortofoto:r1');
        r.sandbox.renderMapToolsPanel();
        ok('escolher a ortofoto como base mantém a escolha no painel', /value="ortofoto:r1" selected/.test(r.panel_()));
        r.sandbox.mapPanelSecao('destaque');
        r.sandbox.mapPanelDestaque('esmaecerEntorno', true);
        r.sandbox.renderMapToolsPanel();
        ok('esmaecer ligado mostra o regulador de intensidade (padrão 60)', /id="mp-esmaecer-int"[^>]*value="60"/.test(r.panel_()));
        eq('sem erro de execução na sanfona', r.errors, []);
    }

    // ---- mapa de situação visível; medição de distância e aba do campo de área no painel
    {
        const campos = [{ id: 'f_area1', label: 'Área', type: 'area_m2', tabId: 't1', tabTitle: 'Dados Gerais' }, { id: 'f_area2', label: 'Área', type: 'area_m2', tabId: 't2', tabTitle: 'Regularização' }];
        const r = await runScenario({ width: 1900, opener: true, payload: { templateId: 'rpt_smoke', template: tplWith({ situacao: { ativo: true }, referencia: { ativo: true, camada: 'A' }, comparacaoArea: { ativo: true } }), formId: 'f1', formFields: campos, formTabs: [], featureData: { id_banco: 10 }, featureGeometry: quad, featureKey: '10', camadasMapa: [camadaA] } });
        const painel = r.registry['map-tools-panel']._html;
        const vm0 = require('vm');
        eq('mapa de situação ligado: a caixa fica visível (display explícito; o CSS dela é "none")', r.registry['map-locator'].style.display, 'block');
        ok('"Distância e sobreposição (camada de referência)" foi retirada do painel (mesmo com modelo antigo que a tinha ligada)', !/Distância e sobreposição/.test(painel) && !/Medir distância no mapa/.test(painel) && !/mapPanelMedirDist/.test(painel) && vm0.runInContext('mapController.getConfig().referencia.ativo', r.sandbox) === false && !/Análises com a camada/.test(painel));
        ok('painel: campos de área com o nome da aba ao lado (mesmo título em abas diferentes)', /Área — Aba: Dados Gerais/.test(painel) && /Área — Aba: Regularização/.test(painel));

        eq('sem erro de execução', r.errors, []);
        const desl = await runScenario({ width: 1900, opener: true, payload: { templateId: 'rpt_smoke', template: tplWith({}), formId: 'f1', formFields: [], formTabs: [], featureData: { id_banco: 10 }, featureGeometry: quad, featureKey: '10' } });
        eq('situação desligada: caixa escondida', desl.registry['map-locator'].style.display, 'none');
    }

    // ---- elementos do mapa: escala e projeção em quadros separados, legenda editável e posições
    {
        const r = await runScenario({ width: 1900, opener: true, payload: Object.assign({}, cenarios[3].payload, { template: tplWith({ camadasLigadas: ['A'] }) }) });
        const painel = () => r.registry['map-tools-panel']._html;
        const cfg = () => require('vm').runInContext('mapController.getConfig()', r.sandbox);
        ok('a folha traz os quadros separados de escala e projeção', /id="map-info-wrap"/.test(r.doc) && /id="map-escala-txt"/.test(r.doc) && /id="map-proj-txt"/.test(r.doc));
        ok('escala e projeção escritas cada uma no seu quadro', /Escala aprox/.test(r.registry['map-escala-txt'].textContent) && /SIRGAS/.test(r.registry['map-proj-txt'].textContent));
        ok('painel: legenda com os itens (mostrar/ocultar e nome editável) e a dica de arrastar', /Arraste, no mapa, o norte, a escala/.test(painel()) && /mapPanelLegendaVer\('feicao'/.test(painel()) && /mapPanelLegendaNome\('feicao'/.test(painel()) && /mapPanelLegendaVer\('c:A'/.test(painel()));
        r.sandbox.mapPanelLegendaNome('feicao', 'Meu imóvel');
        r.sandbox.mapPanelLegendaVer('c:A', false);
        eq('renomear e ocultar pela legenda do painel', [cfg().legenda.nomes.feicao, cfg().legenda.ocultos, /Meu imóvel/.test(r.registry['map-legend'].innerHTML), /data-leg="c:A"/.test(r.registry['map-legend'].innerHTML)], ['Meu imóvel', ['c:A'], true, false]);
        ok('com legenda alterada aparece o botão de restaurar', /mapPanelLegendaReset\(\)/.test(painel()));
        r.sandbox.mapPanelLegendaReset();
        eq('restaurar legenda', [cfg().legenda.nomes, cfg().legenda.ocultos], [{}, []]);
        r.sandbox.mapPanelElementosReset();
        eq('sem erro de execução', r.errors, []);
    }

    // ---- coluna Confrontantes: painel, camadas, campos e distâncias
    {
        const camV = { id: 'V', name: 'Vizinhos', color: '#f00', kind: 'polygon', truncated: false, campos: [{ k: 'nome', l: 'Nome do proprietário' }, { k: 'obs', l: 'Observação' }], features: [{ type: 'Feature', properties: { r: 'Lote 02', f: { nome: 'Fulano' } }, geometry: { type: 'Polygon', coordinates: [[[-34.839, -7.02], [-34.8385, -7.02], [-34.8385, -7.019], [-34.839, -7.019], [-34.839, -7.02]]] } }] };
        const r = await runScenario({ width: 1900, opener: true, payload: { templateId: 'rpt_smoke', template: tplWith({ pontos: { ativo: true, memorial: true, ordem: ['v:0', 'v:1', 'v:2', 'v:3'] } }), formId: 'f1', formFields: [], formTabs: [], featureData: { id_banco: 10 }, featureGeometry: quad, featureKey: '10', camadasMapa: [camV] } });
        const painel = () => r.registry['map-tools-panel']._html;
        const cfg = () => require('vm').runInContext('mapController.getConfig().pontos.colConf', r.sandbox);
        ok('painel: opção da coluna Confrontantes dentro de "Pontos nos vértices"', /Coluna &quot;Confrontantes&quot; na tabela de pontos|Coluna "Confrontantes" na tabela de pontos/.test(painel()));
        r.sandbox.mapPanelColConf('ativo', true);
        ok('ligada: lista as camadas para escolher', /mapPanelColConfCamada\('V', this.checked\)/.test(painel()) && /Divisa até \(m\)/.test(painel()) && /Rua até \(m\)/.test(painel()));
        r.sandbox.mapPanelColConfCamada('V', true);
        ok('camada escolhida: mostra logradouro e os campos dela para marcar mais de um', /mapPanelColConfLog\('V'/.test(painel()) && /Nome do proprietário/.test(painel()) && /mapPanelColConfCampo\('V', 1, this.checked\)/.test(painel()));
        r.sandbox.mapPanelColConfCampo('V', 0, true);
        r.sandbox.mapPanelColConfCampo('V', 1, true);
        r.sandbox.mapPanelColConfLog('V', true);
        eq('camada, campos e logradouro guardados', cfg().camadas, [{ id: 'V', campos: ['nome', 'obs'], logradouro: true }]);
        r.sandbox.mapPanelColConfCampo('V', 1, false);
        r.sandbox.mapPanelColConfLog('V', false);
        r.sandbox.mapPanelColConf('tolM', 5);
        r.sandbox.mapPanelColConf('distLogM', 50);
        eq('campo desmarcado, logradouro desligado e distâncias', [cfg().camadas[0].campos, cfg().camadas[0].logradouro, cfg().tolM, cfg().distLogM], [['nome'], false, 5, 50]);
        await r.settle(6);
        const folha = () => r.registry['a4-document-container']._html;
        ok('a folha traz a tabela de pontos com as colunas Orientação e Confrontantes', /Orientação/.test(folha()) && /Confrontantes/.test(folha()) && /P1 até P2/.test(folha()));
        ok('o confrontante do lado leste aparece na tabela (campo escolhido)', /Fulano/.test(folha()));
        r.sandbox.mapPanelColConfCamada('V', false);
        eq('camada tirada', cfg().camadas, []);
        eq('sem erro de execução', r.errors, []);
    }

    // ---- altura do mapa ajustável na folha
    {
        const r = await runScenario({ width: 1900, opener: true, payload: cenarios[3].payload });
        const painel = () => r.registry['map-tools-panel']._html;
        const cfg = () => require('vm').runInContext('mapController.getConfig()', r.sandbox);
        const vm = require('vm');
        ok('a folha traz a alça de altura na borda de baixo do mapa (não sai na impressão)', /id="map-resize"[^>]*class="no-print"|class="no-print"[^>]*id="map-resize"/.test(r.doc));
        ok('painel: altura em mm, "Preencher a folha" e dica de arrastar', /id="mp-altura"/.test(painel()) && /mapPanelAltura\(this.value\)/.test(painel()) && /Preencher a folha/.test(painel()) && /Ou arraste a borda de baixo do mapa/.test(painel()));
        const max = vm.runInContext('mapaAlturaMaxMm()', r.sandbox);
        ok('altura máxima do mapa pela folha A4 retrato (cabeçalho, rodapé, margens e dimensões descontados)', max > 150 && max < 230);
        eq('limite: 40 mm no mínimo e o máximo da folha', [vm.runInContext('mapaAlturaLimitada(5)', r.sandbox), vm.runInContext('mapaAlturaLimitada(9999)', r.sandbox), vm.runInContext('mapaAlturaLimitada(120)', r.sandbox)], [40, max, 120]);
        eq('preencher: soma o espaço livre (px) à altura, sem passar do máximo nem ficar abaixo de 40', [vm.runInContext('mapaAlturaPreenchida(90, 378, 200)', r.sandbox), vm.runInContext('mapaAlturaPreenchida(90, 5000, 200)', r.sandbox), vm.runInContext('mapaAlturaPreenchida(90, -3000, 200)', r.sandbox)], [187, 200, 40]);
        r.sandbox.mapPanelAltura('150');
        await r.settle(6);
        eq('digitar a altura muda a configuração e o mapa na folha', [cfg().alturaMm, /id="map-wrap"[^>]*height: 567px/.test(r.registry['a4-document-container']._html) || /height: 567px/.test(r.registry['a4-document-container']._html)], [150, true]);
        ok('a altura aparece no painel', /id="mp-altura"[^>]*value="150"/.test(painel()));
        r.sandbox.mapPanelAltura('9999');
        eq('valor acima da folha é limitado', cfg().alturaMm, max);
        r.sandbox.mapPanelReset();
        await r.settle(6);
        eq('restaurar volta à altura do modelo (90 mm)', cfg().alturaMm, 90);
        eq('sem erro de execução', r.errors, []);
        // altura salva pelo usuário vale ao abrir
        const salvo = await runScenario({ width: 1900, opener: true, ajustes: { alturaMm: 140 }, payload: cenarios[3].payload });
        await salvo.settle(6);
        eq('ajuste salvo: o mapa abre com a altura do usuário', [vm.runInContext('mapController.getConfig().alturaMm', salvo.sandbox), /height: 529px/.test(salvo.registry['a4-document-container']._html)], [140, true]);
    }

    // ---- ferramentas de medição no card "Medições no mapa"
    {
        const r = await runScenario({ width: 1900, opener: true, payload: cenarios[3].payload });
        const painel = () => r.registry['map-tools-panel']._html;
        const vm = require('vm');
        const cfg = () => vm.runInContext('mapController.getConfig()', r.sandbox);
        const secExtras = () => { const m = /data-sec-h="extras"[\s\S]*?(?=data-sec-h="temporal")/.exec(painel()); return m ? m[0] : ''; };
        ok('card "Medições no mapa": as 4 ferramentas do mapa principal (sem o Analisador de Gabarito 3D)', ['Coordenadas do Ponto', 'Distância (m)', 'Área (m²)', 'Consultar Coordenadas'].every(t => secExtras().includes(t)) && !/Gabarito/.test(painel()));
        ok('card: aderência e a comparação de área continuam; sem seletor de sistema (o mapa só mostra o nome do ponto) e sem distância/sobreposição', /Aderência \(gruda nos contornos\)/.test(secExtras()) && !/Pontos em/.test(secExtras()) && !/Distância e sobreposição/.test(secExtras()) && /Área cadastral × área calculada/.test(secExtras()));
        r.sandbox.mapPanelFerramenta('linha');
        ok('ferramenta ligada: o painel diz como desenhar e mostra Concluir e Cancelar', /Clique para adicionar pontos/.test(secExtras()) && /mapPanelConcluirMedicao\(\)/.test(secExtras()));
        r.sandbox.mapPanelFerramenta('linha');
        ok('clicar na mesma ferramenta cancela', !/Clique para adicionar pontos/.test(secExtras()));
        // medir de verdade pelo controlador e ver o painel e a folha
        vm.runInContext("mapController.addMedicao('linha', [[-7.0195, -34.8395], [-7.0195, -34.8385]]); mapController.addMedicao('area', [[-7.0195, -34.8395], [-7.0195, -34.8385], [-7.0185, -34.8385]]); mapController.addMedicao('ponto', [[-7.019, -34.839]]);", r.sandbox);
        r.sandbox.renderMapToolsPanel();
        await r.settle(8);
        ok('painel: cada medição com seus números e as coordenadas DEC, GMS e UTM (com copiar e remover)', /Distância 1/.test(secExtras()) && /Comprimento total: <b>/.test(secExtras()) && /Área 2/.test(secExtras()) && /Perímetro: <b>/.test(secExtras()) && /Coordenadas do ponto 3/.test(secExtras()) && /DEC -7\./.test(secExtras()) && /GMS 7° /.test(secExtras()) && /UTM E /.test(secExtras()) && /mapPanelMedCopiar\('med:1'\)/.test(secExtras()) && /mapPanelMedRemover\('med:3'\)/.test(secExtras()) && /mapPanelMedLimpar\(\)/.test(secExtras()));
        ok('painel: ponto mostra o nome no mapa (P03); área tem campo para o tipo; linha de 2 vértices sem lista de trechos', /Nome no mapa: <b>P03<\/b>/.test(secExtras()) && /placeholder="Tipo da área/.test(secExtras()) && !/Vértice 1 → 2/.test(secExtras()));
        const folha = r.registry['a4-document-container']._html;
        ok('folha: as medições entram nas "Análises da Feição" (comprimento, área, perímetro; ponto pelo nome)', /Distância medida \(1\)/.test(folha) && /Área medida \(2\)/.test(folha) && /Coordenadas do ponto \(P03\)/.test(folha));
        ok('folha: coordenadas DEC, GMS e UTM cada uma na sua linha (uma abaixo da outra)', /<div>DEC -7\.[^<]*<\/div><div>GMS 7° [^<]*<\/div><div>UTM E [^<]*<\/div>/.test(folha) && !/DEC [^<]* • GMS/.test(folha));
        // linha com vários vértices: medida de cada trecho na análise; tipo da área pelo pop-up
        vm.runInContext("mapController.addMedicao('linha', [[-7.0195, -34.8395], [-7.0195, -34.8390], [-7.0190, -34.8390]]);", r.sandbox);
        let janela = null;
        const bodyReal = r.sandbox.document.body;
        if (bodyReal) bodyReal.appendChild = (el) => { janela = el; };
        r.sandbox.abrirModalTipoArea('med:2');
        ok('pop-up do tipo de área aberto: pergunta, campo, sugestões (galpão, pérgola, caiçara...) e Confirmar/Pular', !!janela && janela.id === 'modal-tipo-area' && /Que tipo de área é\?/.test(janela.innerHTML) && /id="tipo-area-input"/.test(janela.innerHTML) && />Galpão</.test(janela.innerHTML) && />Pérgola</.test(janela.innerHTML) && />Caiçara</.test(janela.innerHTML) && />Pavilhão em madeira</.test(janela.innerHTML) && />Confirmar</.test(janela.innerHTML) && />Pular</.test(janela.innerHTML) && /position:fixed/.test(janela.style.cssText) && janela.className === 'no-print');
        r.sandbox.confirmarTipoArea('Pavilhão em madeira');
        await r.settle(8);
        const folha2 = r.registry['a4-document-container']._html;
        eq('tipo da área guardado', vm.runInContext('mapController.getConfig().medicoes.itens[1].nome', r.sandbox), 'Pavilhão em madeira');
        ok('folha: área com o tipo no título e linha com a medida de cada trecho entre os vértices', /Área medida \(2\) — Pavilhão em madeira/.test(folha2) && /Distância medida \(4\)/.test(folha2) && /Vértice 1 → 2: <b>[\d.,]+ m<\/b>/.test(folha2) && /Vértice 2 → 3: <b>[\d.,]+ m<\/b>/.test(folha2));
        r.sandbox.abrirModalTipoArea('med:2');
        r.sandbox.fecharModalTipoArea();
        r.sandbox.confirmarTipoArea('não deve valer');
        eq('Pular/fechar não muda o tipo (nada pendente depois)', vm.runInContext('mapController.getConfig().medicoes.itens[1].nome', r.sandbox), 'Pavilhão em madeira');
        ok('o mapa avisa a página ao concluir uma área (pop-up)', /onMedicaoCriada: \(id\) => abrirModalTipoArea\(id\)/.test(html));
        // consultar coordenadas
        r.sandbox.mapPanelConsulta();
        ok('Consultar Coordenadas: formulário com abas DEC, GMS e UTM (DEC aberta)', /mapPanelConsultaAba\('gms'\)/.test(secExtras()) && /Pode colar &quot;lat, lng&quot;|Pode colar "lat, lng"/.test(secExtras()) && /mapPanelConsultaMarcar\(\)/.test(secExtras()));
        r.sandbox.mapPanelConsultaMarcar();
        ok('campos vazios: mensagem de erro no painel', /Preencha a latitude e a longitude\./.test(secExtras()));
        r.sandbox.mapPanelConsultaCampo('lat', '-7,0192');
        r.sandbox.mapPanelConsultaCampo('lng', '-34.8388');
        r.sandbox.mapPanelConsultaMarcar();
        eq('coordenadas digitadas viram um ponto no mapa', [cfg().medicoes.itens.length, cfg().medicoes.itens[4].pts[0]], [5, [-7.0192, -34.8388]]);
        r.sandbox.mapPanelConsultaAba('utm');
        ok('aba UTM: X, Y e zona', /placeholder="X \(Este\)"/.test(secExtras()) && /placeholder="Zona"/.test(secExtras()));
        r.sandbox.mapPanelConsultaAba('gms');
        ok('aba GMS: campo para colar e graus, minutos, segundos e direção', /placeholder="Colar GMS/.test(secExtras()) && /S \(Sul\)/.test(secExtras()) && /W \(Oeste\)/.test(secExtras()));
        r.sandbox.mapPanelMedicoes('sistema', 'geo_dec');
        eq('pontos em graus decimais', cfg().medicoes.sistema, 'geo_dec');
        r.sandbox.mapPanelMedRemover('med:1');
        eq('remover uma medição pelo painel', cfg().medicoes.itens.map(m => m.id), ['med:2', 'med:3', 'med:4', 'med:5']);
        r.sandbox.mapPanelMedLimpar();
        eq('limpar tudo', cfg().medicoes.itens, []);
        eq('sem erro de execução', r.errors, []);
    }

    // ---- edição com quebra de linha e ajuste de largura das colunas da tabela de pontos
    {
        const r = await runScenario({ width: 1900, opener: true, payload: Object.assign({}, cenarios[3].payload, { template: tplWith({ pontos: { ativo: true, memorial: true, ordem: ['v:0', 'v:1', 'v:2', 'v:3'], colConf: { ativo: true } } }) }) });
        const vm = require('vm');
        const cfg = () => vm.runInContext('mapController.getConfig().pontos', r.sandbox);
        const criados = [];
        r.sandbox.document.createElement = (tag) => { const e = { tag: tag, style: {}, listeners: {}, value: '', addEventListener(n, fn) { this.listeners[n] = fn; }, focus() {}, select() {} }; criados.push(e); return e; };
        const celula = (chave, texto) => ({ textContent: texto, filhos: [], querySelector: () => null, getAttribute: (n) => (n === 'data-pt-edit' ? chave : null), appendChild(c) { this.filhos.push(c); } });
        // colunas com quebra de linha: campo de várias linhas; Enter grava; Shift+Enter não grava
        const td = celula('v:0:cf', 'Lote 03\nQuadra E');
        r.sandbox.editarTextoTabelaPontos(td);
        const ta = td.filhos[0];
        ok('confrontantes: a edição abre um campo de várias linhas (textarea) com o texto atual', ta.tag === 'textarea' && ta.value === 'Lote 03\nQuadra E' && ta.rows === 2 && ta.maxLength === 160);
        ta.value = 'Lote 03\nQuadra E\nRua A';
        let prevenido = 0;
        ta.listeners.keydown({ key: 'Enter', shiftKey: true, preventDefault() { prevenido++; } });
        eq('Shift+Enter quebra a linha e não grava', [cfg().textos['v:0:cf'], prevenido], [undefined, 0]);
        ta.listeners.keydown({ key: 'Enter', shiftKey: false, preventDefault() { prevenido++; } });
        eq('Enter grava o texto com as quebras de linha', [cfg().textos['v:0:cf'], prevenido], ['Lote 03\nQuadra E\nRua A', 1]);
        // coluna de uma linha só continua com campo de uma linha
        const td2 = celula('v:0:az', '2° 59\' 25"');
        r.sandbox.editarTextoTabelaPontos(td2);
        ok('azimute: campo de uma linha só', td2.filhos[0].tag === 'input' && td2.filhos[0].maxLength === 80);
        // largura das colunas
        vm.runInContext("mapController.setColunaPontos('dist', 24)", r.sandbox);
        eq('largura da coluna Distância guardada pelo controlador (e a tabela é refeita)', cfg().colunas, { dist: 24 });
        const css = html.slice(html.indexOf('<style'), html.indexOf('</style>'));
        ok('divisória das colunas: cursor de redimensionar e realce ao passar/arrastar', /\.col-resize \{[^}]*cursor: col-resize/.test(css) && /\.col-resize:hover, \.col-resize\.ativo/.test(css));
        eq('sem erro de execução', r.errors, []);
    }

    // ---- cores dos textos e desenhos no painel; ferramenta ativa sem interferência (CSS)
    {
        const r = await runScenario({ width: 1900, opener: true, payload: Object.assign({}, cenarios[3].payload, { template: tplWith({ camadasLigadas: ['A'], rotulos: { ativo: true }, referencia: { ativo: true, camada: 'A' } }) }) });
        const vm = require('vm');
        const painel = () => r.registry['map-tools-panel']._html;
        const cfg = () => vm.runInContext('mapController.getConfig()', r.sandbox);
        ok('painel: seletor de cor nos textos das medidas, nos pontos e nas medições (a distância até a camada saiu)', /mapPanelCor\('medidas', this.value\)/.test(painel()) && /mapPanelCor\('pontos', this.value\)/.test(painel()) && /mapPanelCor\('medicoes', this.value\)/.test(painel()) && !/mapPanelCor\('referencia'/.test(painel()) && /Cor das medições \(linhas, áreas, pontos e textos\)/.test(painel()));
        r.sandbox.mapPanelCor('medidas', '#ffff00');
        r.sandbox.mapPanelCor('pontos', '#00ff00');
        r.sandbox.mapPanelCor('medicoes', '#ff0000');
        r.sandbox.mapPanelCor('referencia', '#0000ff'); // grupo retirado: ignorado
        eq('escolher a cor muda a configuração de cada grupo; a da distância até a camada (retirada) não muda', [cfg().medidas.cor, cfg().pontos.cor, cfg().medicoes.cor, cfg().referencia.cor], ['#ffff00', '#00ff00', '#ff0000', '#b91c1c']);
        ok('a cor escolhida aparece no seletor do painel', /value="#ffff00"/.test(painel()) && /value="#ff0000"/.test(painel()));
        r.sandbox.mapPanelCor('rotulos', '#123456');
        eq('rótulos das vizinhas também têm cor (quando ativos)', cfg().rotulos.cor, '#123456');
        r.sandbox.mapPanelCor('inexistente', '#000000');
        eq('grupo desconhecido é ignorado; sem erro de execução', r.errors, []);
        const css = html.slice(html.indexOf('<style'), html.indexOf('</style>'));
        ok('ferramenta ativa: cursor em mira em todo o mapa e nada reage ao mouse (feição, textos, camadas, escala)', /\.report-drawing, \.report-drawing \* \{ cursor: crosshair !important; \}/.test(css) && /\.report-drawing \.leaflet-interactive, \.report-drawing \.leaflet-marker-icon, \.report-drawing \.leaflet-control-scale \{ pointer-events: none !important; \}/.test(css));
    }

    // ---- cards de "Análises da Feição" com largura ajustável
    {
        const campos = [{ id: 'f_area', label: 'Área do terreno (m²)', type: 'area_m2' }];
        const r = await runScenario({ width: 1900, opener: true, payload: { templateId: 'rpt_smoke', template: tplWith({ comparacaoArea: { ativo: true, campo: 'f_area' } }), formId: 'f1', formFields: campos, formTabs: [], featureData: { id_banco: 10, f_area: '1.331,69' }, featureGeometry: quad, featureKey: '10' } });
        const vm = require('vm');
        const painel = () => r.registry['map-tools-panel']._html;
        const folha = () => r.registry['a4-document-container']._html;
        const cfg = () => vm.runInContext('mapController.getConfig().analises', r.sandbox);
        vm.runInContext("mapController.addMedicao('ponto', [[-7.019, -34.839]]); mapController.addMedicao('area', [[-7.0195, -34.8395], [-7.0195, -34.8385], [-7.0185, -34.8385]]);", r.sandbox);
        r.sandbox.renderMapToolsPanel();
        await r.settle(8);
        ok('folha: cada card das análises tem id e uma borda para arrastar; largura padrão 100%', /data-analise-id="comp"/.test(folha()) && /data-analise-id="med:1"/.test(folha()) && /data-analise-id="med:2"/.test(folha()) && /data-card-resize="med:2"/.test(folha()) && /class="col-resize no-print" data-card-resize/.test(folha()) && ['comp', 'med:1', 'med:2'].every(id => new RegExp('data-analise-id="' + id + '"[^>]*style="width: 100%').test(folha())));
        ok('cards em linha que quebra (flex-wrap), com o mesmo espaçamento', /class="flex flex-wrap items-stretch" style="gap: 4px 6px;"/.test(folha()));
        ok('painel: "Por linha" 1, 2 e 3 (só aparece com mais de um card)', /Cards das análises na folha/.test(painel()) && /mapPanelAnalisesPorLinha\(2\)/.test(painel()) && /Ou arraste a borda direita de um card/.test(painel()));
        r.sandbox.mapPanelAnalisesPorLinha(2);
        await r.settle(8);
        eq('2 por linha: cada card com 50%', cfg().largura, { comp: 50, 'med:1': 50, 'med:2': 50 });
        ok('a folha refaz os cards com a nova largura (50% menos a parte do espaçamento)', /data-analise-id="comp"[^>]*style="width: calc\(50% - 3\.0px\)/.test(folha()) && /data-analise-id="med:2"[^>]*style="width: calc\(50% - 3\.0px\)/.test(folha()));
        r.sandbox.mapPanelAnalisesPorLinha(3);
        eq('3 por linha: 33,3%', cfg().largura['med:1'], 33.3);
        vm.runInContext("mapController.setAnaliseLargura('med:1', 71.26)", r.sandbox);
        eq('largura de um card só (arrastando a borda)', [cfg().largura['med:1'], cfg().largura['comp']], [71.3, 33.3]);
        vm.runInContext("mapController.setAnaliseLargura('med:1', undefined)", r.sandbox);
        eq('largura total de novo (dois cliques na borda)', cfg().largura['med:1'], undefined);
        r.sandbox.mapPanelAnalisesPorLinha(1);
        eq('1 por linha: tudo volta a 100% (nada guardado)', cfg().largura, {});
        vm.runInContext("mapController.setAnalisesLargura({ comp: 5, 'med:2': 500, x: 40 })", r.sandbox);
        eq('limites: 20% a 100%; id desconhecido é ignorado', cfg().largura, { comp: 20 });
        eq('encaixe ao arrastar: perto de 25, 33, 50, 67, 75 e 100% cola neles', [vm.runInContext('encaixeCard(49)', r.sandbox), vm.runInContext('encaixeCard(34.5)', r.sandbox), vm.runInContext('encaixeCard(97.6)', r.sandbox), vm.runInContext('encaixeCard(41)', r.sandbox)], [50, 33.3, 100, 41]);
        eq('sem erro de execução', r.errors, []);
        const css = html.slice(html.indexOf('<style'), html.indexOf('</style>'));
        ok('a borda do card usa a mesma alça das colunas (aparece ao passar o mouse e não sai na impressão)', /\.col-resize \{[^}]*cursor: col-resize/.test(css));
    }

    // ---- prévia com a feição de teste (aberta pelo construtor): avisa e não salva nem registra
    {
        const RP = require('../src/reportPreview.js');
        const vm = require('vm');
        const tabs = [{ id: 'aba1', title: 'Dados do Imóvel', fields: [{ id: 'f_nome', label: 'Proprietário', type: 'text' }] }];
        const tpl = tplWith({});
        const payload = RP.buildPreviewPayload({ template: tpl, formId: 'f1', formTabs: tabs });
        const r = await runScenario({ width: 1900, opener: true, ajustes: { alturaMm: 150 }, payload: payload });
        const corpo = () => r.registry['a4-document-container']._html;
        eq('prévia: sem erro de execução', r.errors, []);
        ok('prévia: a folha traz o mapa com a feição de teste e o modelo em edição', /id="interactive-report-map"/.test(corpo()) && /FICHA CADASTRAL/.test(corpo()) && vm.runInContext('reportPayload.featureKey', r.sandbox) === 'exemplo-previa');
        eq('prévia: ignora os ajustes salvos (abre no padrão do modelo: 90 mm)', vm.runInContext('mapController.getConfig().alturaMm', r.sandbox), 90);
        r.sandbox.mapPanelAltura('120');
        await r.sandbox.mapPanelSave();
        const status = r.registry['map-panel-status'] ? r.registry['map-panel-status'].textContent : '';
        ok('prévia: "Salvar ajustes" só avisa que não salva', /Prévia com dados de exemplo: os ajustes não são salvos/.test(status));
        await r.sandbox.emitirEregistrar('impressao');
        eq('prévia: impressão/Word não registram emissão (o protocolo não existiria no servidor)', r.captured.registros, []);
        ok('prévia: camadas de exemplo listadas no painel do mapa', /Lotes \(exemplo\)/.test(r.registry['map-tools-panel']._html) && /Logradouros \(exemplo\)/.test(r.registry['map-tools-panel']._html));
        ok('prévia: o aviso fixo (só na tela) existe no código', /id = 'aviso-previa'/.test(html) && /PRÉVIA<\/b> — feição e dados de exemplo/.test(html));
        // relatório normal (sem a marca): continua registrando
        const normal = await runScenario({ width: 1900, opener: true, payload: cenarios[3].payload });
        await normal.sandbox.emitirEregistrar('impressao');
        ok('relatório normal continua registrando a emissão', normal.captured.registros.length === 1);
    }

    // ---- ícone de girar e cards (CSS): área de clique que encosta no texto, visível ao passar o mouse e durante o giro
    {
        const css = html.slice(html.indexOf('<style'), html.indexOf('</style>'));
        const rot = /\.report-rot \{[^}]*\}/.exec(css);
        ok('ícone de girar: sem folga entre o texto e o ícone (a área de clique é maior que o desenho e vai até o texto)', !!rot && /left: 100%/.test(rot[0]) && !/margin-left/.test(rot[0]) && /padding: 6px 6px 6px 10px/.test(rot[0]) && /cursor: grab/.test(rot[0]));
        ok('ícone de girar aparece ao passar o mouse em todo tipo de texto e durante o giro', ['report-measure-label', 'report-point-label', 'report-nlabel-l', 'report-note-label'].every(c => css.includes('.' + c + ':hover .report-rot')) && /\.rotating \.report-rot/.test(css));
        ok('alça de altura do mapa: cursor de redimensionar, aparece ao passar o mouse e durante o arrasto', /#map-resize \{[^}]*cursor: ns-resize/.test(css) && /#map-wrap:hover #map-resize, #map-resize\.ativo \{ opacity: 1/.test(css));
        ok('anotação no mapa: fundo branco e borda preta', /\.report-note-label \{[^}]*background: #ffffff[^}]*border: 1px solid #000000/.test(css));
        ok('cards do painel: título com fundo próprio (um tom só) e corpo com moldura', /#map-tools-panel h4(, #pesquisa-tools-panel h4)? \{[^}]*background: #e2e8f0[^}]*border: 1px solid #cbd5e1/.test(css) && /#map-tools-panel \.sec-body(, #pesquisa-tools-panel \.sec-body)? \{[^}]*border: 1px solid #cbd5e1[^}]*background: #f8fafc/.test(css) && /#map-tools-panel h4\.open(, #pesquisa-tools-panel h4\.open)? \{[^}]*background: #cbd5e1/.test(css));
    }

    // ---- medidas: negrito / itálico / sublinhado pelo painel
    {
        const r = await runScenario({ width: 1900, opener: true, payload: cenarios[3].payload });
        const cfg = () => require('vm').runInContext('mapController.getConfig()', r.sandbox);
        const painel = () => r.registry['map-tools-panel']._html;
        ok('painel: cada linha de medida tem os botões N, I e S', (painel().match(/class="nis"/g) || []).length >= 4 && /mapPanelEstilo\('medidas', 'lados', 'i'\)/.test(painel()) && /mapPanelEstilo\('medidas', 'todos', 'n'\)/.test(painel()));
        r.sandbox.mapPanelEstilo('medidas', 'lados', 'i');
        eq('botão I dos lados liga o itálico só nos lados', [cfg().medidas.estilo.lados.i, cfg().medidas.estilo.total.i], [true, false]);
        ok('o botão aparece marcado depois de clicar', /class="on" onclick="mapPanelEstilo\('medidas', 'lados', 'i'\)"/.test(painel()));
        r.sandbox.mapPanelEstilo('medidas', 'todos', 's');
        eq('botão do "Mostrar medidas no mapa" vale para os três grupos', ['lados', 'total', 'perimetro'].map(g => cfg().medidas.estilo[g].s), [true, true, true]);
        r.sandbox.mapPanelEstilo('medidas', 'todos', 's');
        eq('clicar de novo desliga em todos', ['lados', 'total', 'perimetro'].map(g => cfg().medidas.estilo[g].s), [false, false, false]);
        eq('sem erro de execução', r.errors, []);
    }

    // ---- emissão (protocolo + SHA-256) e exportação (PNG/Word/impressão)
    {
        const hoje = new Date();
        const pad = (n) => (n < 10 ? '0' : '') + n;
        const ymd = '' + hoje.getFullYear() + pad(hoje.getMonth() + 1) + pad(hoje.getDate());
        const cen = { opener: true, payload: { templateId: 'rpt_smoke', template: tplWith({ temporal: { ativo: true } }), formId: 'f1', formFields: [], formTabs: [], featureData: { id_banco: 10, nome: 'Fulano' }, featureGeometry: quad, featureKey: '10', camadasMapa: [camadaA], ortofotos: [orto1] } };
        const r = await runScenario(cen);
        const est = () => r.sandbox.eval ? null : require('vm').runInContext('emissao', r.sandbox);
        let em = est();
        ok('SHA-256 real calculado ao abrir (64 caracteres hexadecimais)', /^[0-9a-f]{64}$/.test(em.hash));
        ok('protocolo no formato AAAAMMDD-XXXXXXXX com a data de hoje e o começo do hash', new RegExp('^' + ymd + '-[0-9A-F]{8}$').test(em.protocolo) && em.protocolo.slice(9) === em.hash.slice(0, 8).toUpperCase());
        ok('cabeçalho e rodapé usam o protocolo e o hash calculados', r.doc.includes('data-emissao="protocolo"') && r.doc.includes('data-emissao="hash"') && !/8a4f91e/.test(r.doc));

        // o hash acompanha o conteúdo
        const h0 = em.hash;
        r.sandbox.mapPanelSet('norte', false);
        await r.settle(4);
        ok('mudar uma opção do mapa muda o hash', est().hash !== h0 && /^[0-9a-f]{64}$/.test(est().hash));
        r.sandbox.mapPanelSet('norte', true);
        await r.settle(4);
        eq('voltando ao estado anterior, o hash volta a ser o mesmo (determinístico)', est().hash, h0);

        // QR code de verificação no rodapé: aponta para verificar.html com o protocolo
        ok('QR code: endereço de verificação com o protocolo desta emissão', r.captured.qrData === 'http://localhost:8080/verificar.html?p=' + est().protocolo);
        await r.sandbox.repaginateKeepingMap();
        ok('rodapé traz o QR (imagem GIF embutida) depois que o protocolo existe', /data-emissao="qr"[^>]*src="data:image\/gif;base64,/.test(r.registry['a4-document-container']._html));

        // impressão
        await r.sandbox.imprimirRelatorio();
        eq('imprimir: chama a impressão uma vez', r.captured.prints, 1);
        eq('imprimir: registra a emissão com protocolo, hash, modelo e feição', r.captured.registros.map(x => [x.formato, x.protocolo === est().protocolo, x.hash === est().hash, x.templateId, x.featureKey]), [['impressao', true, true, 'rpt_smoke', '10']]);
        r.listeners.beforeprint.forEach(fn => fn());
        r.listeners.afterprint.forEach(fn => fn());

        // Word: .docx (ZIP) com o corpo em MHTML (altChunk) e o rodapé em OOXML
        const lerDocx = (blobX) => {
            const zipBytes = blobX.parts[0];
            const arquivos = require('../src/reportDocx.js').unzip(zipBytes);
            const txt = (n) => Buffer.from(arquivos[n] || []).toString('utf8');
            return { arquivos, txt };
        };
        await r.sandbox.gerarWord();
        const blob = r.captured.blobs[r.captured.blobs.length - 1];
        const docx = lerDocx(blob);
        const arquivo = docx.txt('word/afchunk.mht');
        eq('Word: .docx com o tipo certo e a emissão registrada como "word"', [blob.type, r.captured.registros.map(x => x.formato)], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['impressao', 'word']]);
        ok('Word: pacote com documento, corpo em HTML (altChunk), rodapé e QR', ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/afchunk.mht', 'word/footer1.xml', 'word/media/qr.gif'].every(n => docx.arquivos[n]));
        ok('Word: o corpo é MHTML (multipart/related) com HTML e imagens', /MIME-Version: 1.0/.test(arquivo) && /multipart\/related/.test(arquivo) && /Content-Type: image\/png/.test(arquivo));
        ok('Word: o mapa e o quadro da ortofoto viraram duas imagens (o QR fica no rodapé, fora do corpo)', /imagem1\.png/.test(arquivo) && /imagem2\.png/.test(arquivo) && !/imagem3\.png/.test(arquivo));
        const htmlDoMhtml = (s) => Buffer.from(s.split('\r\n\r\n')[2].replace(/\s+/g, ''), 'base64').toString('utf8');
        const htmlWord = htmlDoMhtml(arquivo);
        ok('Word: sem o mapa interativo dentro do HTML', !/id="map-wrap"|interactive-report-map|tmap-wrap-r1/.test(htmlWord));
        ok('Word: o protocolo da emissão vai no documento', htmlWord.includes(est().protocolo));
        ok('Word: quadros da análise temporal em tabela (sem grade CSS)', /<table[^>]*>[\s\S]*imagem|<td/.test(htmlWord) && !/display:grid/.test(htmlWord));
        ok('Word: cabeçalho uma vez no topo e estilos escritos em cada elemento (sem depender de CSS)', (htmlWord.match(/FICHA CADASTRAL/g) || []).length === 1 && /font-size:[0-9]/.test(htmlWord) && !/class="[^"]*(flex|text-slate|bg-white)/.test(htmlWord.split('<body>')[1] || ''));
        ok('Word: o corpo NÃO leva rodapé em HTML (era ele que se repetia no fim do texto)', !/mso-element:footer|mso-footer:/.test(htmlWord) && !/Emitido em/.test(htmlWord));
        const rodape = docx.txt('word/footer1.xml');
        ok('Word: rodapé de verdade em OOXML, com data, SHA-256 e "Página X de Y" por campos PAGE e NUMPAGES', /Emitido em/.test(rodape) && new RegExp('SHA-256: ').test(rodape) && rodape.includes(est().hash.slice(0, 16)) && /w:instr=" PAGE "/.test(rodape) && /w:instr=" NUMPAGES "/.test(rodape));
        ok('Word: o QR code é imagem do rodapé (relação e arquivo GIF)', /r:embed="rIdQr"/.test(rodape) && /media\/qr\.gif/.test(docx.txt('word/_rels/footer1.xml.rels')) && docx.arquivos['word/media/qr.gif'].length > 5);
        ok('Word: papel A4 e margens do modelo no documento', /w:w="11906" w:h="16838"/.test(docx.txt('word/document.xml')) && /w:top="850"/.test(docx.txt('word/document.xml')) && /<w:footerReference w:type="default" r:id="rIdFooter"\/>/.test(docx.txt('word/document.xml')));
        eq('Word: sem avisos quando todas as capturas funcionam', r.captured.alerts, []);
        eq('exportar/imprimir não geram erro de execução', r.errors, []);

        // captura que falha (ex.: tiles sem CORS): o Word sai, com aviso no lugar do mapa
        const f = await runScenario(Object.assign({}, cen, { capturaFalha: true }));
        await f.sandbox.gerarWord();
        const htmlF = htmlDoMhtml(lerDocx(f.captured.blobs[f.captured.blobs.length - 1]).txt('word/afchunk.mht'));
        ok('captura falhou: o Word sai mesmo assim, com aviso no lugar dos mapas e um alerta ao usuário', /não foi possível gerar a imagem/.test(htmlF) && !/id="map-wrap"/.test(htmlF) && f.captured.alerts.length === 1 && /2 mapa/.test(f.captured.alerts[0]));
        const sem = await runScenario(Object.assign({}, cen, { semHtml2canvas: true }));
        await sem.sandbox.gerarWord();
        ok('sem a biblioteca de captura (sem internet): o Word sai com aviso', sem.captured.alerts.length === 1 && sem.captured.blobs.length >= 1);

        // PNG do mapa
        const antes = r.captured.downloads.length;
        await r.sandbox.exportarMapaPng();
        eq('PNG do mapa: baixa um arquivo image/png', [r.captured.downloads.length - antes, r.captured.blobs[r.captured.blobs.length - 1].type], [1, 'image/png']);
    }

    // ---- extras do mapa ligados: confrontantes, análises, rótulos, situação, quadriculado e anotações
    {
        const dLat = 20 / 111195, dLng = 30 / (111195 * Math.cos(7.02 * Math.PI / 180));
        const lote = { type: 'Polygon', coordinates: [[[-34.84, -7.02], [-34.84 + dLng, -7.02], [-34.84 + dLng, -7.02 + dLat], [-34.84, -7.02 + dLat], [-34.84, -7.02]]] };
        const vizinho = { type: 'Polygon', coordinates: [[[-34.84 + dLng + 1e-7, -7.02], [-34.84 + 2 * dLng, -7.02], [-34.84 + 2 * dLng, -7.02 + dLat], [-34.84 + dLng + 1e-7, -7.02 + dLat], [-34.84 + dLng + 1e-7, -7.02]]] };
        const camLotes = { id: 'L1', name: 'Lotes', color: '#f00', kind: 'polygon', truncated: false, features: [{ type: 'Feature', properties: { r: 'Quadra E • Lote 02', t: 'Beltrano' }, geometry: vizinho }] };
        const mapa = {
            rotulos: { ativo: true }, confrontantes: { ativo: true, camada: 'L1' }, referencia: { ativo: true, camada: 'L1' },
            comparacaoArea: { ativo: true, campo: 'f_area' }, situacao: { ativo: true }, quadriculado: { ativo: true, espacamento: 50 },
            anotacoes: [{ id: 'a1', lat: -7.0195, lng: -34.8395, texto: 'Muro' }], camadasLigadas: ['L1']
        };
        const r = await runScenario({ opener: true, payload: { templateId: 'rpt_smoke', template: tplWith(mapa), formId: 'f1', formFields: [{ id: 'f_area', label: 'Área do terreno', type: 'area_m2' }], formTabs: [], featureData: { id_banco: 10, f_area: '560,00' }, featureGeometry: lote, featureKey: '10', camadasMapa: [camLotes] } });
        eq('extras ligados: nenhum erro de execução', r.errors, []);
        ok('extras: tabela de confrontantes e análises entram na folha', /Confrontantes/.test(r.doc) && /Quadra E • Lote 02/.test(r.doc) && /Análises da Feição/.test(r.doc));
        ok('extras: o mapa de situação foi criado na caixa própria', r.mapsCreated.some(m => m.container && m.container.id === 'map-locator'));
        ok('extras: painel traz as opções nos cards certos', /Medições no mapa/.test(r.panel) && !/Extras do mapa/.test(r.panel) && /Rótulos nas feições vizinhas/.test(r.panel) && /Tabela de confrontantes/.test(r.panel) && /Área do terreno/.test(r.panel) && /Muro/.test(r.panel));
        {
            // conteúdo de cada card, na ordem em que aparecem
            const secs = {};
            const re = /data-sec-h="([a-z]+)"[\s\S]*?(?=data-sec-h=|map-panel-status)/g;
            let mm;
            while ((mm = re.exec(r.panel))) secs[mm[1]] = mm[0];
            eq('cards do painel na ordem definida (fixa)', Object.keys(secs), ['destaque', 'camadas', 'elementos', 'base', 'localizacao', 'medidas', 'pontos', 'extras', 'temporal', 'exportar']);
            ok('"Rótulos nas feições vizinhas" está em "Camadas ativas no mapa"', /Rótulos nas feições vizinhas/.test(secs.camadas) && !/Rótulos nas feições vizinhas/.test(secs.extras));
            ok('"Quadriculado UTM" está em "Mapa base"; "Mostrar o mapa de localização" tem card próprio, logo abaixo', /Quadriculado UTM/.test(secs.base) && !/Mapa de situação|Mostrar o mapa de localização/.test(secs.base) && /Mostrar o mapa de localização/.test(secs.localizacao) && !/Quadriculado UTM/.test(secs.extras));
            ok('"+ Anotação de texto" e as anotações (com N/I/S) estão em "Elementos do mapa"', /\+ Anotação de texto no centro do mapa/.test(secs.elementos) && /mapPanelNotaEstilo\('a1', 'n'\)/.test(secs.elementos) && !/Anotação de texto/.test(secs.extras));
            const iMem = secs.pontos.indexOf('Memorial (azimute e distância)'), iCol = secs.pontos.search(/Coluna (&quot;|")Confrontantes/), iTab = secs.pontos.indexOf('Tabela de confrontantes');
            ok('em "Pontos nos vértices": Memorial, depois a coluna "Confrontantes" (logo abaixo) e depois a tabela de confrontantes', iMem > 0 && iCol > iMem && iTab > iCol && !/Tabela de confrontantes/.test(secs.extras));
            ok('"Medições no mapa" fica com as ferramentas e a área cadastral × calculada (sem distância e sobreposição)', /Área cadastral × área calculada/.test(secs.extras) && !/Distância e sobreposição/.test(secs.extras));
        }
        ok('extras: caixa do mapa de situação existe no bloco do mapa', /id="map-locator"/.test(r.doc));
        // mudar a camada de confrontantes repagina e mantém tudo funcionando
        r.sandbox.mapPanelExtra('confrontantes', 'nomes', true);
        await r.settle(6);
        ok('extras: incluir o nome do vizinho atualiza a tabela', /Beltrano/.test(r.registry['a4-document-container']._html));
        r.sandbox.mapPanelNotaAdd();
        await r.settle(4);
        ok('extras: anotação nova aparece no painel', (r.registry['map-tools-panel']._html.match(/Anotação/g) || []).length >= 1);
        eq('extras: nenhum erro depois das mudanças', r.errors, []);
    }

    // ---- MODO EDIÇÃO (?modo=edicao): a Folha A4 Interativa do construtor é esta página, alimentada por mensagens
    {
        const payload = { templateId: 'rpt_smoke', template: tplWith({}), formId: 'f1', formFields: [], formTabs: [], featureData: { id_banco: 10 }, featureGeometry: quad, featureKey: '10', preview: true };
        const r = await runScenario({ edicao: true, search: '?modo=edicao', payload });
        const enviar = (p) => (r.listeners.message || []).forEach(fn => fn({ origin: 'http://localhost:8080', source: r.sandbox.window.parent, data: { tipo: 'construtor:dados', payload: p } }));
        eq('edição: sem erros ao iniciar e sem desenhar nada antes de receber os dados', [r.errors, /a4-page/.test(r.registry['a4-document-container']._html)], [[], false]);
        ok('edição: a página marca o modo e avisa o construtor que está pronta', (r.documentStub.classes || []).includes('modo-edicao') && r.captured.mensagens.some(m => m.tipo === 'construtor:pronto'));
        ok('edição: ignora mensagem de outra origem ou de outra janela', (() => { (r.listeners.message || []).forEach(fn => fn({ origin: 'http://outro.site', source: r.sandbox.window.parent, data: { tipo: 'construtor:dados', payload } })); (r.listeners.message || []).forEach(fn => fn({ origin: 'http://localhost:8080', source: {}, data: { tipo: 'construtor:dados', payload } })); return !/a4-page/.test(r.registry['a4-document-container']._html); })());
        enviar(payload);
        await r.settle(14);
        const doc = r.registry['a4-document-container']._html;
        eq('edição: sem erros depois de receber o modelo', r.errors, []);
        ok('edição: a folha é desenhada com o modelo recebido, sem aviso de prévia', /a4-page/.test(doc) && /FICHA CADASTRAL/.test(doc) && !r.registry['aviso-previa']);
        ok('edição: cada bloco do corpo tem moldura (índice do modelo, nome, subir, descer, remover)', /class="edit-bloco"[^>]*data-bloco-index="1"/.test(doc) && /class="edit-bloco"[^>]*data-bloco-index="2"/.test(doc) && /Mini-mapa cartográfico/.test(doc) && /acaoEdicao\('moveBlock', \[2, -1\], event\)/.test(doc) && /acaoEdicao\('removeBlock', \[2\], event\)/.test(doc));
        ok('edição: cabeçalho e rodapé têm moldura só com remover (sem mover)', /data-bloco-index="0"/.test(doc) && /data-bloco-index="3"/.test(doc) && !/acaoEdicao\('moveBlock', \[0,/.test(doc) && /acaoEdicao\('removeBlock', \[3\], event\)/.test(doc));
        ok('edição: as tabelas do mapa (sem índice no modelo) não ganham moldura', (doc.match(/class="edit-bloco/g) || []).length >= 4 && !/data-bloco-index="-1"/.test(doc));
        ok('edição: o mapa é criado uma vez', r.mapsCreated.filter(m => m.container === 'interactive-report-map').length === 1);
        // botões da moldura → mensagem para o construtor
        r.sandbox.acaoEdicao('moveBlock', [2, -1], { stopPropagation() {}, preventDefault() {} });
        ok('edição: botão da moldura avisa o construtor da ação e dos argumentos', r.captured.mensagens.some(m => m.tipo === 'construtor:acao' && m.nome === 'moveBlock' && JSON.stringify(m.args) === '[2,-1]'));
        // controles de edição (mesmo módulo do construtor) desenhados na página, e a ponte "ReportBuilder" → mensagens
        {
            const pc = JSON.parse(JSON.stringify(payload));
            pc.formFields = [{ id: 'a', label: 'Nome', type: 'text' }];
            pc.formTabs = [{ id: 't1', title: 'Dados', fields: pc.formFields }];
            pc.featureData = { id_banco: 10, a: 'Maria' };
            pc.template.blocos[0].titulo = 'FICHA <X>';
            pc.template.blocos[2].campos_selecionados = ['a'];
            enviar(pc);
            await r.settle(6);
            const d = r.registry['a4-document-container']._html;
            ok('edição: grade com título editável, alça de arrastar, largura e remover (o valor vem da feição de teste)', [d.includes("ReportBuilder.enableInlineEdit(this, 2, 'titulo')"), d.includes('field-drag-handle'), d.includes("ReportBuilder.changeFieldWidthStep(2, 'a', 1, event)"), d.includes("ReportBuilder.removeFieldFromGrid(2, 'a', event)"), d.includes('Maria'), d.includes('a4-grid-fields-container" data-block-index="2"')].every(Boolean));
            ok('edição: cabeçalho com título e subtítulo editáveis (título escapado) e selo de repetição', [d.includes("enableInlineEdit(this, 0, 'titulo')"), d.includes("enableInlineEdit(this, 0, 'subtitulo')"), d.includes('FICHA &lt;X&gt;'), d.includes('Apenas 1ª Folha')].every(Boolean));
            const RB = r.sandbox.window.ReportBuilder;
            const ev = { stopPropagation() { this.parou = true; }, preventDefault() {} };
            RB.changeFieldWidthStep(2, 'a', 1, ev);
            ok('ponte: ReportBuilder.<ação>(...) vira mensagem, com o evento cortado (e parado na página)', ev.parou === true && r.captured.mensagens.some(m => m.tipo === 'construtor:acao' && m.nome === 'changeFieldWidthStep' && JSON.stringify(m.args) === '[2,"a",1,null]'));
            // duplo clique: edição local e gravação ao sair
            const ouvintes = {};
            const el = { style: {}, innerText: '  Novo título' + String.fromCharCode(10), focus() {}, addEventListener: (t, fn) => { ouvintes[t] = fn; }, removeEventListener() {} };
            RB.enableInlineEdit(el, 2, 'titulo');
            ok('edição inline: o elemento vira editável na própria página', el.contentEditable === 'true');
            ouvintes.blur();
            ok('edição inline: ao sair grava a propriedade (texto aparado) por mensagem', el.contentEditable === 'false' && r.captured.mensagens.some(m => m.nome === 'atualizarPropriedade' && JSON.stringify(m.args) === '[2,"titulo","Novo título"]'));
            // largura exata: menu local
            RB.toggleFieldWidthPopover(2, 'a', { stopPropagation() {}, preventDefault() {}, currentTarget: { getBoundingClientRect: () => ({ bottom: 100, left: 200 }) } });
            const pop = r.registry['popover-largura'];
            ok('largura exata: abre o menu de proporções na própria página', !!pop && pop.innerHTML.includes("definirLarguraExata(2, 'a', 50") && pop.innerHTML.includes("definirLarguraExata(2, 'a', 100"));
            r.sandbox.definirLarguraExata(2, 'a', 50, { stopPropagation() {}, preventDefault() {} });
            ok('largura exata: escolher uma proporção avisa o construtor e fecha o menu', r.captured.mensagens.some(m => m.nome === 'setFieldWidthExact' && JSON.stringify(m.args) === '[2,"a",50]') && !r.registry['popover-largura']);
        }
        // texto livre: o editor do construtor (texto bruto com as menções, barra de formatação), com a gravação por mensagem
        {
            const pt = JSON.parse(JSON.stringify(payload));
            pt.formFields = [{ id: 'a', label: 'Nome', type: 'text', tabTitle: 'Dados' }];
            pt.template.blocos.splice(3, 0, { id: 'tx', tipo: 'caixa_texto_livre', titulo: 'Parecer <Y>', conteudo: 'Texto com <b>negrito</b> e @Nome', espacamento: '1.4', alinhamento: 'justify' });
            enviar(pt);
            await r.settle(6);
            const d = r.registry['a4-document-container']._html;
            ok('texto livre (edição): editor com barra de formatação, texto bruto com as menções e lista do @ (moldura do bloco 3)', [d.includes('rich-text-toolbar'), d.includes('id="free-text-editor-3"'), d.includes('Texto com <b>negrito</b> e @Nome'), d.includes('id="mention-dropdown-3"'), d.includes('Parecer &lt;Y&gt;'), d.includes('data-bloco-index="3"')].every(Boolean));
            const RB = r.sandbox.window.ReportBuilder;
            RB.saveFreeTextContent(3, '<b>novo</b>');
            RB.changeLineHeight(3, '2.0');
            ok('texto livre (edição): salvar o texto e mudar o espaçamento avisam o construtor', r.captured.mensagens.some(m => m.nome === 'saveFreeTextContent' && JSON.stringify(m.args) === '[3,"<b>novo</b>"]') && r.captured.mensagens.some(m => m.nome === 'changeLineHeight' && JSON.stringify(m.args) === '[3,"2.0"]'));
        }
        // quadros expansíveis na página de edição: sintético (todo) e laudo (por aba); o relatório emitido não muda
        {
            const pq = JSON.parse(JSON.stringify(payload));
            pq.formTabs = [{ id: 't_pf', title: 'PF', isMultiple: true, fields: [{ id: 'pf_data', label: 'Data', type: 'date' }, { id: 'pf_obs', label: 'Observações', type: 'text' }] }];
            pq.formFields = pq.formTabs[0].fields;
            pq.featureData = { id_banco: 10, t_pf: [{ pf_data: '2026-03-15', pf_obs: 'Obs-unica-X', _created_at: '2026-03-15' }, { pf_data: '2026-02-10', pf_obs: 'Obs-unica-Y', _created_at: '2026-02-10' }] };
            pq.template.blocos.splice(3, 0, { id: 's1', tipo: 'tabela_sintetica_1n', colunas: ['aba', 'pf_data'] }, { id: 'l1', tipo: 'laudo_vistoria_fotos', abas_selecionadas: ['t_pf'], campos_selecionados: ['pf_obs'] });
            enviar(pq);
            await r.settle(6);
            let d = r.registry['a4-document-container']._html;
            ok('quadros: setas de expandir/recolher no quadro sintético (bloco 3) e na aba do laudo (bloco 4), tudo expandido de início', d.includes("alternarQuadro('sint:3')") && d.includes("alternarQuadro('laudo:4:t_pf')") && d.includes('15/03/2026') && d.includes('Obs-unica-X') && d.includes('expand_more'));
            const RB = r.sandbox.window.ReportBuilder;
            RB.alternarQuadro('sint:3');
            d = r.registry['a4-document-container']._html;
            ok('quadro sintético recolhido: ficam o título e o resumo (seta para a direita); as linhas somem; o laudo não é afetado', !d.includes('15/03/2026') && d.includes('chevron_right') && d.includes('2 registro(s)') && d.includes('Obs-unica-X'));
            RB.alternarQuadro('laudo:4:t_pf');
            d = r.registry['a4-document-container']._html;
            ok('aba do laudo recolhida: fica só o cabeçalho da aba (com a contagem de registros); os cartões somem', !d.includes('Obs-unica-X') && !d.includes('Obs-unica-Y') && d.includes('Aba / Ente: PF') && d.includes('2 registro(s)'));
            RB.alternarQuadro('sint:3'); RB.alternarQuadro('laudo:4:t_pf');
            d = r.registry['a4-document-container']._html;
            ok('expandir de novo traz tudo de volta', d.includes('15/03/2026') && d.includes('Obs-unica-X') && d.includes('Obs-unica-Y'));
        }
        // cada bloco tem a cor do card correspondente no painel do construtor
        {
            const d0 = r.registry['a4-document-container']._html;
            const corDe = (i) => (new RegExp('--cor-bloco:(#[0-9a-f]+)"[^>]*data-bloco-index="' + i + '"')).exec(d0);
            eq('cores dos blocos: cabeçalho índigo, mapa verde, grade azul', [corDe(0) && corDe(0)[1], corDe(1) && corDe(1)[1], corDe(2) && corDe(2)[1]], ['#6366f1', '#10b981', '#0ea5e9']);
        }
        // regular a largura do cartão arrastando (percentual do contêiner, entre 15 e 100)
        {
            const L = r.sandbox.larguraPorArrasto;
            eq('arrastar a alça: 300px de 600 (+0) = 50%; +150px = 75%; muito além = 100%; muito aquém = 15%', [L(300, 0, 600), L(300, 150, 600), L(300, 900, 600), L(300, -290, 600), L(300, 0, 0)], [50, 75, 100, 15, 100]);
        }
        // alteração que não mexe no mapa: redesenha sem recarregar
        const p2 = JSON.parse(JSON.stringify(payload)); p2.template.blocos[2].titulo = 'Outro título';
        enviar(p2);
        await r.settle(6);
        ok('edição: alteração fora do mapa redesenha sem recarregar a página', /Outro título/.test(r.registry['a4-document-container']._html) && r.captured.reloads === 0);
        // alteração no bloco do mapa: recarrega (o Leaflet não é refeito no lugar)
        const p3 = JSON.parse(JSON.stringify(payload)); p3.template.blocos[1].notaTecnica = 'Nota nova';
        enviar(p3);
        ok('edição: alteração no bloco do mapa recarrega a página (que pede os dados de novo)', r.captured.reloads === 1);
    }

    // ---- RELATÓRIO GERAL: bloco "Gráficos do Dashboard" com Chart.js de verdade, a partir da lista de exemplo (prévia)
    {
        const tplGeral = {
            id: 'rpt_geral', nome: 'Relatório Geral', tipo: 'geral', form_id: 'f1',
            config_pagina: { tamanho: 'A4', orientacao: 'portrait', margens_mm: { top: 15, bottom: 15, left: 15, right: 15 } },
            blocos: [
                { id: 'h', tipo: 'cabecalho', titulo: 'RELATÓRIO GERAL' },
                { id: 'g', tipo: 'grafico_existente', titulo: 'Estatísticas', chart_ids: ['c1', 'c2'], layout: 'lado_a_lado' },
                { id: 'f', tipo: 'rodape', numeracao: true }
            ]
        };
        const charts = [{ id: 'c1', title: 'Situação', type: 'pie', fieldId: 'sit', fieldLabel: 'Situação' }, { id: 'c2', title: 'Área média', type: 'bar', fieldId: 'area', fieldLabel: 'Área' }];
        const formFields = [{ id: 'sit', label: 'Situação', type: 'select' }, { id: 'area', label: 'Área', type: 'area_m2' }];
        const featureList = [
            { sit: 'Regular', area: 500 }, { sit: 'Irregular', area: 300 }, { sit: 'Regular', area: 700 }, { sit: '', area: 400 }
        ];
        const payload = { templateId: 'rpt_geral', template: tplGeral, formId: 'f1', formFields, formTabs: [], charts, featureList, featureData: {}, featureGeometry: null, preview: true };
        const r = await runScenario({ payload });
        eq('geral: nenhum erro de execução', r.errors, []);
        const doc = r.registry['a4-document-container']._html;
        ok('geral: dois canvases (lado a lado), um por gráfico escolhido, com o título de cada um', doc.includes('grid-cols-2') && (doc.match(/data-chart-canvas/g) || []).length === 2 && doc.includes('>Situação<') && doc.includes('>Área média<'));
        eq('geral: um gráfico Chart.js criado por canvas (doughnut para pie, bar para bar)', r.captured.charts.map(c => c.config.type).sort(), ['bar', 'doughnut']);
        const pizza = r.captured.charts.find(c => c.config.type === 'doughnut');
        eq('geral: contagem por valor formatado do campo "sit" (2 Regular, 1 Irregular, 1 Não informado)', [pizza.config.data.labels.sort(), pizza.config.data.datasets[0].data.length], [['Irregular', 'Não informado', 'Regular'], 3]);
        const barra = r.captured.charts.find(c => c.config.type === 'bar');
        eq('geral: campo numérico agrupa por valor formatado (m²), um por área diferente', barra.config.data.labels.length, 4);
        ok('geral: doughnut mostra legenda; bar mostra o eixo Y começando do zero', pizza.config.options.plugins.legend.display === true && barra.config.options.plugins.legend.display === false && barra.config.options.scales.y.beginAtZero === true);

        // repaginar (mesma prévia, só o título mudou) destrói os gráficos antigos e cria os novos, sem acumular
        const antigos = r.captured.charts.slice();
        const p2 = JSON.parse(JSON.stringify(payload)); p2.template.blocos[0].titulo = 'Outro título';
        r.storage.setItem('constructive_active_report_payload', JSON.stringify(p2));
        r.sandbox.initReportViewer();
        await r.settle(6);
        ok('repaginação: os gráficos antigos são destruídos e não sobra nenhum vivo além dos novos 2', antigos.every(c => c.destroyed) && r.captured.charts.length === 4);

        // sem gráfico selecionado: aviso, sem canvas nem erro
        const p3 = JSON.parse(JSON.stringify(payload)); p3.template.blocos[1].chart_ids = [];
        r.storage.setItem('constructive_active_report_payload', JSON.stringify(p3));
        r.sandbox.initReportViewer();
        await r.settle(6);
        ok('sem gráfico selecionado: aviso no lugar do canvas, sem erro', r.registry['a4-document-container']._html.includes('Nenhum gráfico selecionado') && !r.registry['a4-document-container']._html.includes('data-chart-canvas'));
        eq('sem erros em nenhuma das repaginações', r.errors, []);

        // modelo padrão antigo (chart_id no singular, sem chart_ids): não quebra e mostra o gráfico dele
        const p4 = JSON.parse(JSON.stringify(payload)); delete p4.template.blocos[1].chart_ids; p4.template.blocos[1].chart_id = 'c1';
        r.storage.setItem('constructive_active_report_payload', JSON.stringify(p4));
        r.sandbox.initReportViewer();
        await r.settle(6);
        ok('compatibilidade com o modelo padrão antigo ("chart_id" no singular): mostra o gráfico dele', (r.registry['a4-document-container']._html.match(/data-chart-canvas/g) || []).length === 1 && r.errors.length === 0);
    }

    // ---- RELATÓRIO GERAL — "Tabela de Feições": uma linha por feição filtrada, com as colunas escolhidas
    {
        const tplTabela = {
            id: 'rpt_tabela', nome: 'Relatório Geral', tipo: 'geral', form_id: 'f1',
            config_pagina: { tamanho: 'A4', orientacao: 'portrait', margens_mm: { top: 15, bottom: 15, left: 15, right: 15 } },
            blocos: [{ id: 'h', tipo: 'cabecalho' }, { id: 't', tipo: 'tabela_feicoes', titulo: 'Feições <X>', colunas: ['nome', 'sit'] }, { id: 'f', tipo: 'rodape' }]
        };
        const formFields = [{ id: 'nome', label: 'Proprietário', type: 'text' }, { id: 'sit', label: 'Situação', type: 'select' }];
        const featureList = [{ nome: 'Maria', sit: 'Regular' }, { nome: 'João <B>', sit: 'Irregular' }];
        const payload = { templateId: 'rpt_tabela', template: tplTabela, formId: 'f1', formFields, formTabs: [], charts: [], featureData: {}, featureGeometry: null, featureList, preview: true };
        const r = await runScenario({ payload });
        eq('tabela: nenhum erro de execução', r.errors, []);
        const doc = r.registry['a4-document-container']._html;
        ok('tabela: título escapado, cabeçalho das colunas e uma linha por feição (com o valor escapado)', doc.includes('Feições &lt;X&gt;') && doc.includes('>Proprietário<') && doc.includes('>Situação<') && doc.includes('>Maria<') && doc.includes('João &lt;B&gt;') && doc.includes('2 feições'));
        ok('tabela: cada linha é uma unidade que pode quebrar de folha (data-split-row)', (doc.match(/data-split-row/g) || []).length === 2);

        // sem coluna escolhida: aviso, sem tabela
        const p2 = JSON.parse(JSON.stringify(payload)); p2.template.blocos[1].colunas = [];
        const r2 = await runScenario({ payload: p2 });
        ok('sem coluna escolhida: aviso, sem erro', r2.registry['a4-document-container']._html.includes('Nenhuma coluna escolhida') && r2.errors.length === 0);

        // filtro do modelo, na emissão real (dados da camada, via themeId + janela de origem): só a feição que casa entra na tabela
        const temaTabela = { id: 'tema-tabela', features: featureList.map(p => ({ properties: p })) };
        const p3 = { templateId: 'rpt_tabela', template: JSON.parse(JSON.stringify(tplTabela)), formId: 'f1', themeId: 'tema-tabela', formFields, formTabs: [], charts: [], featureData: {}, featureGeometry: null, featureList: null, preview: false };
        p3.template.filtro = { grupos: [{ condicoes: [{ field: 'sit', op: 'igual', value: 'irregular' }] }] };
        const r3 = await runScenario({ opener: true, themes: [temaTabela], payload: p3 });
        eq('emissão real com filtro: nenhum erro', r3.errors, []);
        const doc3 = r3.registry['a4-document-container']._html;
        ok('com filtro: só a feição Irregular entra na tabela', !doc3.includes('>Maria<') && doc3.includes('João &lt;B&gt;') && doc3.includes('1 feição<'));

        // sem nenhuma feição (filtro não bate com ninguém): aviso
        const p4 = JSON.parse(JSON.stringify(p3));
        p4.filtro = undefined; // (evita confundir com template.filtro, mantido abaixo)
        p4.template.filtro = { grupos: [{ condicoes: [{ field: 'sit', op: 'igual', value: 'inexistente' }] }] };
        const r4 = await runScenario({ opener: true, themes: [temaTabela], payload: p4 });
        ok('nenhuma feição casa com o filtro: aviso, sem erro', r4.registry['a4-document-container']._html.includes('Nenhuma feição casa com o filtro') && r4.errors.length === 0);
    }

    // ---- RELATÓRIO GERAL — "Mapa das Feições": um Leaflet por grupo de proximidade, só com dados de verdade (por themeId)
    {
        const tplMapa = {
            id: 'rpt_mapageral', nome: 'Relatório Geral', tipo: 'geral', form_id: 'f1',
            config_pagina: { tamanho: 'A4', orientacao: 'portrait', margens_mm: { top: 15, bottom: 15, left: 15, right: 15 } },
            blocos: [{ id: 'h', tipo: 'cabecalho' }, { id: 'm', tipo: 'mapa_feicoes', titulo: 'Mapa <X>' }, { id: 'f', tipo: 'rodape' }]
        };
        const ponto = (lng, lat) => ({ type: 'Point', coordinates: [lng, lat] });
        // 50 feições em dois blocos bem separados (25 a oeste, 25 a leste): com o alvo de 40 por mapa, viram 2 grupos
        const feats = [];
        for (let i = 0; i < 25; i++) feats.push({ properties: {}, geometry: ponto(-34.90 + i * 0.0005, -7.00 + i * 0.0005) });
        for (let i = 0; i < 25; i++) feats.push({ properties: {}, geometry: ponto(-34.70 + i * 0.0005, -7.00 + i * 0.0005) });
        const temaMapa = { id: 'tema-mapa', features: feats };
        const payload = { templateId: 'rpt_mapageral', template: tplMapa, formId: 'f1', themeId: 'tema-mapa', formFields: [], formTabs: [], charts: [], featureData: {}, featureGeometry: null, featureList: null, preview: false };
        const r = await runScenario({ opener: true, themes: [temaMapa], payload });
        eq('mapa das feições: nenhum erro de execução', r.errors, []);
        const doc = r.registry['a4-document-container']._html;
        ok('mapa: título escapado e 2 caixas de mapa (uma por grupo), com a contagem certa', doc.includes('Mapa &lt;X&gt;') && (doc.match(/data-mapa-feicoes/g) || []).length === 2 && doc.includes('50 feições em 2 grupo(s)'));
        ok('mapa: cada grupo tem 25 feições (os dois blocos não se misturam)', doc.includes('25 feições') && !doc.includes('26 feições'));
        eq('mapa: um Leaflet real criado por grupo', r.mapsCreated.filter(m => m.container && String(m.container.id || '').startsWith('rpt-mapafeicoes-')).length, 2);

        // sem geometria (prévia com dados de exemplo): aviso específico, sem tentar montar mapa
        const rPreview = await runScenario({ payload: Object.assign({}, payload, { themeId: undefined, featureList: [{}], preview: true }) });
        ok('prévia (sem coordenadas): aviso explicando, sem erro', rPreview.registry['a4-document-container']._html.includes('não tem coordenadas para desenhar o mapa') && rPreview.errors.length === 0);

        // acima do limite de 200: pede para refinar o filtro em vez de montar dezenas de mapas
        const muitas = { id: 'tema-muitas', features: Array.from({ length: 201 }, (_, i) => ({ properties: {}, geometry: ponto(-34.8 + i * 0.001, -7.0) })) };
        const rMuitas = await runScenario({ opener: true, themes: [muitas], payload: Object.assign({}, payload, { themeId: 'tema-muitas' }) });
        ok('acima de 200 feições: aviso para refinar o filtro, sem tentar montar os mapas', rMuitas.registry['a4-document-container']._html.includes('acima do limite de 200') && (rMuitas.registry['a4-document-container']._html.match(/data-mapa-feicoes/g) || []).length === 0 && rMuitas.errors.length === 0);

        // filtro do modelo também vale para o mapa (mesma fonte de dados que a tabela e os gráficos): ninguém casa
        const tplComFiltro = JSON.parse(JSON.stringify(tplMapa));
        tplComFiltro.filtro = { grupos: [{ condicoes: [{ field: 'inexistente', op: 'preenchido' }] }] };
        const rFiltro = await runScenario({ opener: true, themes: [temaMapa], payload: Object.assign({}, payload, { template: tplComFiltro }) });
        ok('filtro que não bate com ninguém: aviso certo (filtro, não "sem geometria"), sem erro', rFiltro.registry['a4-document-container']._html.includes('Nenhuma feição passou pelo filtro escolhido') && rFiltro.errors.length === 0);
    }

    // ---- RELATÓRIO GERAL — EMISSÃO DE VERDADE: sem featureList no payload; os dados vêm da camada, na janela de origem (por themeId)
    {
        const tplGeral = {
            id: 'rpt_geral2', nome: 'Relatório Geral', tipo: 'geral', form_id: 'f1',
            config_pagina: { tamanho: 'A4', orientacao: 'portrait', margens_mm: { top: 15, bottom: 15, left: 15, right: 15 } },
            blocos: [{ id: 'h', tipo: 'cabecalho', titulo: 'RELATÓRIO GERAL' }, { id: 'g', tipo: 'grafico_existente', chart_ids: ['c1'], layout: 'largura_total' }, { id: 'f', tipo: 'rodape' }]
        };
        const charts = [{ id: 'c1', title: 'Situação', type: 'pie', fieldId: 'sit', fieldLabel: 'Situação' }];
        const formFields = [{ id: 'sit', label: 'Situação', type: 'select' }];
        const temaCamada = { id: 'tema-1', features: [{ properties: { sit: 'Regular' } }, { properties: { sit: 'Regular' } }, { properties: { sit: 'Irregular' } }] };
        const payload = { templateId: 'rpt_geral2', template: tplGeral, formId: 'f1', themeId: 'tema-1', formFields, formTabs: [], charts, featureData: {}, featureGeometry: null, featureList: null, preview: false };
        const r = await runScenario({ opener: true, themes: [temaCamada], payload });
        eq('emissão real: nenhum erro de execução', r.errors, []);
        eq('emissão real: os dados do gráfico vêm das feições de verdade da camada (2 Regular, 1 Irregular)', r.captured.charts[0].config.data.labels.sort(), ['Irregular', 'Regular']);
        ok('emissão real: mostra o total de feições da camada (3)', r.registry['a4-document-container']._html.includes('3 feições'));
        ok('emissão real: sem preview, não mostra o aviso de prévia', !r.registry['aviso-previa']);

        // camada não encontrada na janela de origem (ou sem opener): gráfico sem dados, sem erro
        const semTema = await runScenario({ opener: true, themes: [], payload });
        eq('camada não encontrada na janela de origem: sem erro, gráfico com zero feições', [semTema.errors, semTema.captured.charts[0].config.data.labels], [[], []]);
        const semOpener = await runScenario({ opener: false, payload });
        eq('sem janela de origem: sem erro, gráfico com zero feições', [semOpener.errors, semOpener.captured.charts[0].config.data.labels], [[], []]);

        // filtro do modelo (Relatório Geral): só as feições que casam entram no gráfico e na contagem
        const tplComFiltro = JSON.parse(JSON.stringify(tplGeral));
        tplComFiltro.filtro = { grupos: [{ condicoes: [{ field: 'sit', op: 'igual', value: 'irregular' }] }] };
        const rf = await runScenario({ opener: true, themes: [temaCamada], payload: Object.assign({}, payload, { template: tplComFiltro }) });
        eq('com filtro no modelo: nenhum erro', rf.errors, []);
        eq('com filtro: só a feição Irregular entra no gráfico', rf.captured.charts[0].config.data.labels, ['Irregular']);
        ok('com filtro: mostra o total já filtrado (1 feição), não o total da camada', rf.registry['a4-document-container']._html.includes('1 feição') && !rf.registry['a4-document-container']._html.includes('3 feições'));

        // filtro vazio (rascunho sem nenhum grupo válido) não restringe nada
        const tplFiltroVazio = JSON.parse(JSON.stringify(tplGeral));
        tplFiltroVazio.filtro = { grupos: [] };
        const rv = await runScenario({ opener: true, themes: [temaCamada], payload: Object.assign({}, payload, { template: tplFiltroVazio }) });
        eq('filtro vazio: continua mostrando as 3 feições da camada', rv.captured.charts[0].config.data.labels.sort(), ['Irregular', 'Regular']);
    }

    // ---- PAINEL "CONFIGURAÇÕES DA PESQUISA" (Relatório Geral): só 2 seções (Filtro de Feições, Gráficos do
    // Dashboard); dentro do Filtro, passo a passo com resultado imediato: Aplicar filtro → Incluir campos na
    // tabela → Gerar mapa → Limpar filtro. "Salvar ajustes"/"Restaurar" continuam no rodapé do painel.
    {
        // não aparece no Relatório Individual
        const rInd = await runScenario({ payload: { templateId: 'rpt_smoke', template: tplWith(null), formId: 'f1', featureData: {}, featureGeometry: null, preview: true } });
        eq('individual: painel não aparece', rInd.errors, []);
        ok('individual: painel de pesquisa não é criado', !rInd.registry['pesquisa-tools-panel'] && !rInd.registry['pesquisa-tools-toggle']);

        const tplPesquisa = {
            id: 'rpt_pesquisa', nome: 'Relatório Geral', tipo: 'geral', form_id: 'f1',
            config_pagina: { tamanho: 'A4', orientacao: 'portrait', margens_mm: { top: 15, bottom: 15, left: 15, right: 15 } },
            blocos: [{ id: 'h', tipo: 'cabecalho' }, { id: 'g', tipo: 'grafico_existente', titulo: 'Estatísticas', chart_ids: ['c1'], layout: 'largura_total' }, { id: 'f', tipo: 'rodape' }],
            filtro: { grupos: [{ condicoes: [{ field: 'sit', op: 'igual', value: 'regular' }] }] }
        };
        const charts = [{ id: 'c1', title: 'Situação', type: 'pie', fieldId: 'sit', fieldLabel: 'Situação' }, { id: 'c2', title: 'Área', type: 'bar', fieldId: 'area', fieldLabel: 'Área' }];
        const formFields = [{ id: 'sit', label: 'Situação', type: 'select', tabTitle: 'Cadastro' }, { id: 'area', label: 'Área', type: 'area_m2', tabTitle: 'Medidas' }];
        const featureListAll = [{ sit: 'Regular', area: 100 }, { sit: 'Irregular', area: 200 }, { sit: 'Regular', area: 150 }];
        const payload = {
            templateId: 'rpt_pesquisa', template: tplPesquisa, formId: 'f1', formFields, formTabs: [], charts,
            featureListAll, featureList: featureListAll.filter(p => p.sit === 'Regular'), featureData: {}, featureGeometry: null, preview: true
        };
        const r = await runScenario({ payload, opener: true });
        eq('painel: nenhum erro de execução ao abrir', r.errors, []);
        const painel = () => r.registry['pesquisa-tools-panel'].innerHTML;
        ok('geral: painel "Configurações da Pesquisa" criado, com só 2 seções (Filtro e Gráficos)', painel().includes('Configurações da Pesquisa') && painel().includes('Filtro de feições') && painel().includes('Gráficos do dashboard') && !painel().includes('Tabela das feições') && !painel().includes('Mapa das feições'));
        ok('painel: mostra a condição existente (campo "sit" já selecionado)', painel().includes('value="sit" selected'));
        ok('painel: campo do filtro sugere os valores já existentes na camada (Regular e Irregular) numa datalist', /<datalist id="pp-vals-0-0">[\s\S]*?<option value="Irregular">[\s\S]*?<option value="Regular">[\s\S]*?<\/datalist>/.test(painel()) || /<datalist id="pp-vals-0-0">[\s\S]*?<option value="Regular">[\s\S]*?<option value="Irregular">[\s\S]*?<\/datalist>/.test(painel()));
        ok('painel: selects/input do filtro preenchem toda a largura do card', /updateFiltroCondicaoGeral\(0,0,'field'[^>]*style="width:100%"/.test(painel()));
        ok('painel: mostra ao vivo quantas feições casam com o filtro (2 de 3, só Regular) mesmo sem aplicar', painel().includes('2 feições casam com o filtro atual'));
        ok('painel: sem tabela ainda, "Incluir campos"/"Gerar mapa" não aparecem (só depois de Aplicar filtro)', !painel().includes('Incluir campos na tabela') && !painel().includes('Gerar mapa'));
        ok('painel: gráfico "c1" (já escolhido) vem marcado; "c2" (não escolhido) vem desmarcado', painel().includes('checked onchange="toggleGraficoEscolhidoGeral(\'c1\'') && !painel().includes('checked onchange="toggleGraficoEscolhidoGeral(\'c2\''));
        ok('relatório: com o filtro atual (só Regular), o gráfico conta 2 feições', r.captured.charts[0].config.data.labels.sort().join(',') === 'Regular' && r.registry['a4-document-container']._html.includes('2 feições'));

        // "Aplicar filtro": cria a 1ª tabela (ainda sem colunas) e mostra o resultado na folha na hora
        r.sandbox.aplicarFiltroGeral();
        ok('aplicar filtro: a folha já mostra a tabela (sem colunas escolhidas ainda)', r.registry['a4-document-container']._html.includes('Nenhuma coluna escolhida'));
        ok('painel: com a tabela criada, aparecem os passos seguintes ("Incluir campos" e "Gerar mapa")', painel().includes('Incluir campos na tabela') && painel().includes('Gerar mapa'));

        // edita mais o filtro (2º grupo, OU com "Irregular"): a folha só reage quando aplicar de novo
        r.sandbox.addFiltroGrupoGeral();
        r.sandbox.updateFiltroCondicaoGeral(1, 0, 'field', 'sit');
        r.sandbox.updateFiltroCondicaoGeral(1, 0, 'op', 'igual');
        r.sandbox.updateFiltroCondicaoGeral(1, 0, 'value', 'irregular');
        ok('painel: a contagem ao vivo já reflete o 2º grupo (3 de 3) antes mesmo de aplicar', painel().includes('3 feições casam com o filtro atual'));
        ok('a folha ainda mostra o resultado anterior (só Regular) até aplicar de novo', r.registry['a4-document-container']._html.includes('2 feições'));
        r.sandbox.aplicarFiltroGeral();
        ok('depois de aplicar de novo: a folha já mostra as 3 feições (2º grupo valendo)', r.registry['a4-document-container']._html.includes('3 feições'));
        ok('botão de aplicar agora avisa "atualizar" (já existe tabela na folha)', painel().includes('Aplicar filtro (atualizar tabela)'));

        // "Incluir campos na tabela": expande a lista (com a aba de cada campo) e marcar já atualiza a folha na hora
        r.sandbox.toggleColunasPesquisaGeral();
        ok('painel: campos mostram a aba de cada um (desambiguação)', painel().includes('>Situação<') && painel().includes('>Cadastro<') && painel().includes('>Área<') && painel().includes('>Medidas<'));
        r.sandbox.toggleColunaTabelaGeral('area', true);
        ok('marcar uma coluna já atualiza a tabela na folha, sem precisar de outro clique', r.registry['a4-document-container']._html.includes('>Área<'));

        // "Gerar mapa": liga na hora, com cor padrão e ajustes visíveis (título, cor, contagem)
        r.sandbox.toggleMapaFeicoesGeral(true);
        ok('painel: mapa ligado ("Remover mapa"), com ajustes de título/cor/contagem', painel().includes('Remover mapa') && painel().includes("value=\"#0ea5e9\"") && painel().includes('Mostrar contagem de feições'));
        r.sandbox.updateMapaFeicoesConfigGeral('cor', '#dc2626');
        ok('mudar a cor do mapa também aplica na hora', painel().includes("value=\"#dc2626\""));

        // liga o 2º gráfico: reflete na hora, sem precisar salvar
        r.sandbox.toggleGraficoEscolhidoGeral('c2', true);
        ok('painel: 2º gráfico marcado', painel().includes('checked onchange="toggleGraficoEscolhidoGeral(\'c2\''));
        eq('a folha já mostra os 2 gráficos escolhidos (Situação e Área), sem precisar salvar', r.captured.charts.slice(-2).map(c => c.config.type).sort(), ['bar', 'doughnut']);

        // só ao clicar em "Salvar ajustes" é que persiste de verdade
        await r.sandbox.salvarPesquisaGeral();
        await r.settle(6);
        eq('salvar: nenhum erro', r.errors, []);
        const salvosLocal = JSON.parse(r.storage.getItem('constructive_report_templates') || '[]');
        const tplSalvoLocal = salvosLocal.find(t => t.id === 'rpt_pesquisa');
        ok('salvar: gravado no localStorage com os 2 grupos, os 2 gráficos, a coluna extra e o mapa (cor certa)', !!tplSalvoLocal && tplSalvoLocal.filtro.grupos.length === 2
            && tplSalvoLocal.blocos.find(b => b.tipo === 'grafico_existente').chart_ids.length === 2
            && tplSalvoLocal.blocos.find(b => b.tipo === 'tabela_feicoes').colunas.includes('area')
            && tplSalvoLocal.blocos.find(b => b.tipo === 'mapa_feicoes').cor === '#dc2626');
        const tplSalvoOpener = r.captured.templatesSalvos[r.captured.templatesSalvos.length - 1];
        ok('salvar: também gravado pela janela de origem (ReportAdapter.saveReportTemplate)', !!tplSalvoOpener && tplSalvoOpener.id === 'rpt_pesquisa' && tplSalvoOpener.filtro.grupos.length === 2);

        // "Restaurar" descarta edições feitas depois do último salvamento, sem precisar salvar de novo
        r.sandbox.limparFiltroGeral();
        r.sandbox.aplicarFiltroGeral();
        r.sandbox.toggleMapaFeicoesGeral(false);
        ok('antes de restaurar: mapa desligado', !painel().includes('Remover mapa'));
        r.sandbox.restaurarPesquisaGeral();
        await r.settle(6);
        eq('restaurar: nenhum erro', r.errors, []);
        ok('restaurar: volta ao último salvo (filtro OU com 2 grupos, 3 feições) e o mapa continua ligado', r.registry['a4-document-container']._html.includes('3 feições') && painel().includes('Remover mapa'));

        // limpar filtro de verdade + aplicar + salvar: volta a não restringir nada
        r.sandbox.limparFiltroGeral();
        r.sandbox.aplicarFiltroGeral();
        await r.sandbox.salvarPesquisaGeral();
        await r.settle(6);
        ok('limpar filtro + aplicar + salvar: sem filtro, as 3 feições continuam aparecendo', r.registry['a4-document-container']._html.includes('3 feições'));
    }

    // ---- REORDENAR BLOCOS DO RELATÓRIO GERAL: arrastar direto na folha (Caixa de Texto, Tabela, Mapa, Gráficos)
    {
        const tpl = {
            id: 'rpt_ordem', nome: 'Relatório Geral', tipo: 'geral', form_id: 'f1',
            config_pagina: { tamanho: 'A4', orientacao: 'portrait', margens_mm: { top: 15, bottom: 15, left: 15, right: 15 } },
            blocos: [
                { id: 'h', tipo: 'cabecalho' },
                { id: 'g1', tipo: 'grafico_existente', titulo: 'Estatísticas', chart_ids: ['c1'], layout: 'largura_total' },
                { id: 't1', tipo: 'caixa_texto_livre', conteudo: 'Texto livre de teste' },
                { id: 'f', tipo: 'rodape' }
            ]
        };
        const charts = [{ id: 'c1', title: 'Situação', type: 'pie', fieldId: 'sit', fieldLabel: 'Situação' }];
        const formFields = [{ id: 'sit', label: 'Situação', type: 'select' }];
        const payload = { templateId: 'rpt_ordem', template: tpl, formId: 'f1', formFields, formTabs: [], charts, featureListAll: [{ sit: 'Regular' }], featureData: {}, featureGeometry: null, preview: true };
        const r = await runScenario({ payload, opener: true });
        eq('reordenar: nenhum erro de execução', r.errors, []);
        const doc = () => r.registry['a4-document-container']._html;
        ok('reordenar: os 2 blocos móveis vêm com a alça de arrastar, na ordem do modelo (gráfico antes do texto)', doc().indexOf('data-bloco-id="g1"') >= 0 && doc().indexOf('data-bloco-id="g1"') < doc().indexOf('data-bloco-id="t1"'));
        ok('reordenar: o cabeçalho não ganha alça (não é bloco móvel)', !doc().includes('data-bloco-id="h"'));

        // simula o fim de um arrasto: a tela passou a mostrar "t1" antes de "g1"
        const original = r.sandbox.document.querySelectorAll;
        r.sandbox.document.querySelectorAll = (sel) => (sel === '.geral-bloco-arrastavel'
            ? [{ getAttribute: () => 't1' }, { getAttribute: () => 'g1' }]
            : original(sel));
        r.sandbox.reordenarBlocosGeraisPelaTela();
        r.sandbox.document.querySelectorAll = original;

        // só ao salvar (que redesenha a folha) a nova ordem aparece de fato no HTML
        await r.sandbox.salvarPesquisaGeral();
        await r.settle(6);
        eq('reordenar + salvar: nenhum erro', r.errors, []);
        ok('reordenar + salvar: a folha agora mostra o texto antes do gráfico (ordem trocada)', doc().indexOf('data-bloco-id="t1"') >= 0 && doc().indexOf('data-bloco-id="t1"') < doc().indexOf('data-bloco-id="g1"'));
        const salvos = JSON.parse(r.storage.getItem('constructive_report_templates') || '[]');
        const tplSalvo = salvos.find(t => t.id === 'rpt_ordem');
        eq('reordenar + salvar: a nova ordem foi persistida no modelo (blocos: cabeçalho, texto, gráfico, rodapé)', tplSalvo.blocos.map(b => b.id), ['h', 't1', 'g1', 'f']);
    }

    console.log(`viewerSmoke: ${total - failed}/${total} verificações passaram`);
    if (failed > 0) {
        console.error(`${failed} falha(s)`);
        process.exit(1);
    }
})();
