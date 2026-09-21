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
        body: makeEl('body'), documentElement: { style: { setProperty() {} } }, head: makeEl('head'), title: '',
        getElementById: (id) => registry[id] || null, createElement: (tag) => makeEl(tag),
        querySelector: () => null, addEventListener() {},
        querySelectorAll: (sel) => (String(sel).includes('report-tframe-wrap') ? Object.values(registry).filter(e => e.id && e.id.startsWith('tmap-wrap-')) : [])
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
    const captured = { blobs: [], alerts: [], registros: [], prints: 0, downloads: [], qrData: '' };
    const opener = cfg.opener ? { closed: false, ReportAdapter: { getAjustes: async () => cfg.ajustes || null, saveAjustes: async () => ({ ok: true, remoto: false }), registrarEmissao: async (e) => { captured.registros.push(e); return { ok: true, remoto: false }; } } } : null;
    const windowStub = {
        addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
        location: { search: '?templateId=rpt_smoke', href: 'http://localhost:8080/relatorio_view.html?templateId=rpt_smoke' }, localStorage: storage, sessionStorage: storage, opener,
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
        html2canvas: cfg.semHtml2canvas ? undefined : async () => { if (cfg.capturaFalha) throw new Error('CORS'); return { getContext: () => new Proxy({}, { get: (t, k) => (k === 'canvas' ? null : () => {}), set: () => true }), toDataURL: () => 'data:image/png;base64,QUJD' }; }
    };
    sandbox.self = sandbox.window;
    vm.createContext(sandbox);
    localScripts.forEach(src => { try { vm.runInContext(read(src), sandbox, { filename: src }); } catch (e) { errors.push('script ' + src + ': ' + e.message); } });
    ['PageSize', 'MapTools', 'ReportMap', 'ReportTemporal', 'ReportExport', 'ReportWord', 'ReportDocx', 'MapSnapshot', 'VerificarEmissao', 'FieldFormatter', 'ReportData'].forEach(n => { if (windowStub[n]) sandbox[n] = windowStub[n]; });
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
    return { sandbox, registry, errors, mapsCreated, captured, listeners, settle, doc: registry['a4-document-container']._html, panel: registry['map-tools-panel'] ? registry['map-tools-panel']._html : '' };
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
        eq('sanfona: nove títulos', cabecalhos, 9);
        eq('ordem fixa dos cards no painel (e, portanto, dos blocos na folha)', (r.panel_().match(/data-sec-h="([a-z]+)"/g) || []).map(s => /"([a-z]+)"/.exec(s)[1]), ['destaque', 'camadas', 'elementos', 'base', 'medidas', 'pontos', 'extras', 'temporal', 'exportar']);
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
        eq('mapa de situação ligado: a caixa fica visível (display explícito; o CSS dela é "none")', r.registry['map-locator'].style.display, 'block');
        ok('painel: botão para medir a distância até a camada de referência', /Medir distância no mapa/.test(painel) && /mapPanelMedirDist\(\)/.test(painel));
        ok('painel: campos de área com o nome da aba ao lado (mesmo título em abas diferentes)', /Área — Aba: Dados Gerais/.test(painel) && /Área — Aba: Regularização/.test(painel));
        r.sandbox.mapPanelMedirDist();
        ok('medir: o painel avisa o que clicar', /Clique num ponto da feição/.test(r.registry['map-tools-panel']._html) && /Cancelar a medição/.test(r.registry['map-tools-panel']._html));
        r.sandbox.mapPanelMedirDist();
        ok('cancelar volta ao botão de medir', /Medir distância no mapa/.test(r.registry['map-tools-panel']._html));
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

    // ---- ícone de girar e cards (CSS): área de clique que encosta no texto, visível ao passar o mouse e durante o giro
    {
        const css = html.slice(html.indexOf('<style'), html.indexOf('</style>'));
        const rot = /\.report-rot \{[^}]*\}/.exec(css);
        ok('ícone de girar: sem folga entre o texto e o ícone (a área de clique é maior que o desenho e vai até o texto)', !!rot && /left: 100%/.test(rot[0]) && !/margin-left/.test(rot[0]) && /padding: 6px 6px 6px 10px/.test(rot[0]) && /cursor: grab/.test(rot[0]));
        ok('ícone de girar aparece ao passar o mouse em todo tipo de texto e durante o giro', ['report-measure-label', 'report-point-label', 'report-nlabel-l', 'report-note-label'].every(c => css.includes('.' + c + ':hover .report-rot')) && /\.rotating \.report-rot/.test(css));
        ok('alça de altura do mapa: cursor de redimensionar, aparece ao passar o mouse e durante o arrasto', /#map-resize \{[^}]*cursor: ns-resize/.test(css) && /#map-wrap:hover #map-resize, #map-resize\.ativo \{ opacity: 1/.test(css));
        ok('anotação no mapa: fundo branco e borda preta', /\.report-note-label \{[^}]*background: #ffffff[^}]*border: 1px solid #000000/.test(css));
        ok('cards do painel: título com fundo próprio (um tom só) e corpo com moldura', /#map-tools-panel h4 \{[^}]*background: #e2e8f0[^}]*border: 1px solid #cbd5e1/.test(css) && /#map-tools-panel \.sec-body \{[^}]*border: 1px solid #cbd5e1[^}]*background: #f8fafc/.test(css) && /#map-tools-panel h4\.open \{[^}]*background: #cbd5e1/.test(css));
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
            eq('cards do painel na ordem definida (fixa)', Object.keys(secs), ['destaque', 'camadas', 'elementos', 'base', 'medidas', 'pontos', 'extras', 'temporal', 'exportar']);
            ok('"Rótulos nas feições vizinhas" está em "Camadas ativas no mapa"', /Rótulos nas feições vizinhas/.test(secs.camadas) && !/Rótulos nas feições vizinhas/.test(secs.extras));
            ok('"Mapa de situação" e "Quadriculado UTM" estão em "Mapa base"', /Mapa de situação/.test(secs.base) && /Quadriculado UTM/.test(secs.base) && !/Mapa de situação|Quadriculado UTM/.test(secs.extras));
            ok('"+ Anotação de texto" e as anotações (com N/I/S) estão em "Elementos do mapa"', /\+ Anotação de texto no centro do mapa/.test(secs.elementos) && /mapPanelNotaEstilo\('a1', 'n'\)/.test(secs.elementos) && !/Anotação de texto/.test(secs.extras));
            const iMem = secs.pontos.indexOf('Memorial (azimute e distância)'), iCol = secs.pontos.search(/Coluna (&quot;|")Confrontantes/), iTab = secs.pontos.indexOf('Tabela de confrontantes');
            ok('em "Pontos nos vértices": Memorial, depois a coluna "Confrontantes" (logo abaixo) e depois a tabela de confrontantes', iMem > 0 && iCol > iMem && iTab > iCol && !/Tabela de confrontantes/.test(secs.extras));
            ok('"Medições no mapa" fica com distância e área cadastral × calculada', /Distância e sobreposição/.test(secs.extras) && /Área cadastral × área calculada/.test(secs.extras));
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

    console.log(`viewerSmoke: ${total - failed}/${total} verificações passaram`);
    if (failed > 0) {
        console.error(`${failed} falha(s)`);
        process.exit(1);
    }
})();
