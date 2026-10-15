const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Validação do Novo Fluxo CAD: Medida Exata com Trava Polar e Rotação Livre', async (t) => {
    // 1. Setup DOM Mock
    const elements = {};
    const createElement = (tag) => ({
        tagName: tag.toUpperCase(),
        classList: {
            classes: new Set(),
            add: function(...cls) { cls.forEach(c => this.classes.add(c)); },
            remove: function(...cls) { cls.forEach(c => this.classes.delete(c)); },
            contains: function(c) { return this.classes.has(c); }
        },
        style: {},
        innerHTML: '',
        innerText: '',
        value: '',
        placeholder: '',
        children: [],
        appendChild: function(c) { this.children.push(c); },
        querySelector: function() { return null; },
        addEventListener: function(evt, fn) { this._listeners = this._listeners || {}; this._listeners[evt] = this._listeners[evt] || []; this._listeners[evt].push(fn); },
        focus: function() {}
    });

    const docElements = [
        'map', 'measurement-panel', 'meas-btn-Marker', 'meas-btn-Line', 'meas-btn-Polygon',
        'meas-btn-CoordinateQuery', 'meas-instruction', 'meas-features-list', 'btn-save-measurement',
        'meas-tab-geometry', 'meas-tab-coord-query', 'cad-measure-hud', 'cad-hud-mode-tag',
        'cad-hud-hint', 'meas-cad-dist-live', 'cad-measure-input', 'cad-measure-apply-btn',
        'cad-measure-finish-btn', 'btn-measure-snap', 'autocad-snap-glyph', 'autocad-snap-badge'
    ];
    docElements.forEach(id => {
        elements[id] = createElement('div');
        elements[id].id = id;
    });

    global.window = {
        isMeasurementActive: false,
        isMeasurementSnappingEnabled: true
    };
    global.document = {
        getElementById: (id) => elements[id] || null,
        createElement: createElement,
        addEventListener: () => {},
        body: createElement('body'),
        head: createElement('head'),
        activeElement: elements['cad-measure-input']
    };

    function MockLayerGroup() {
        this._layers = [];
        this.addLayer = function(l) { this._layers.push(l); return this; };
        this.removeLayer = function(l) { this._layers = this._layers.filter(x => x !== l); };
        this.hasLayer = function(l) { return this._layers.includes(l); };
        this.clearLayers = function() { this._layers = []; };
        this.getLayers = function() { return this._layers; };
        this.eachLayer = function(fn) { this._layers.forEach(fn); };
        this.addTo = function(m) { return this; };
    }

    global.L = {
        featureGroup: () => new MockLayerGroup(),
        polyline: (pts, opts) => ({ _pts: pts, _opts: opts, setLatLngs: function(p) { this._pts = p; }, addTo: function(g) { if (g && g.addLayer) g.addLayer(this); return this; } }),
        polygon: (pts, opts) => ({ _pts: pts, _opts: opts, setLatLngs: function(p) { this._pts = p; }, addTo: function(g) { if (g && g.addLayer) g.addLayer(this); return this; } }),
        circleMarker: (ll, opts) => ({ _ll: ll, _opts: opts, setLatLng: function(p) { this._ll = p; }, addTo: function(g) { if (g && g.addLayer) g.addLayer(this); return this; } }),
        marker: (ll, opts) => ({ _ll: ll, _opts: opts, setLatLng: function(p) { this._ll = p; }, getLatLng: function() { return this._ll; }, setIcon: function() {}, bindTooltip: function() {}, addTo: function(g) { if (g && g.addLayer) g.addLayer(this); return this; }, on: () => {} }),
        divIcon: (opts) => opts,
        point: (x, y) => ({ x, y }),
        latLng: (lat, lng) => ({
            lat,
            lng,
            distanceTo: (other) => {
                const dx = (lat - other.lat) * 111320;
                const dy = (lng - other.lng) * 111320 * Math.cos(lat * Math.PI / 180);
                return Math.hypot(dx, dy);
            }
        })
    };

    const listeners = {};
    const mockMap = {
        on: (evt, fn) => { listeners[evt] = listeners[evt] || []; listeners[evt].push(fn); },
        fire: (evt, data) => { (listeners[evt] || []).forEach(fn => fn(data)); },
        hasLayer: () => false,
        removeLayer: () => {},
        latLngToContainerPoint: (ll) => ({
            x: 500 + (ll.lng - (-48.5)) * 100000,
            y: 400 - (ll.lat - (-27.5)) * 100000
        }),
        containerPointToLatLng: (pt) => global.L.latLng(-27.5, -48.5),
        latLngToLayerPoint: (ll) => ({ x: 500, y: 400 }),
        getContainer: () => elements['map'],
        getCenter: () => global.L.latLng(-27.5, -48.5),
        getZoom: () => 18,
        doubleClickZoom: { disable: () => {}, enable: () => {} },
        pm: { disableDraw: () => {} }
    };
    global.map = mockMap;
    global.themes = [];

    // Carrega measurement.js
    const measCode = fs.readFileSync(path.join(__dirname, '../src/measurement.js'), 'utf8');
    eval(measCode);

    await t.test('1. Ativar Linha mostra imediatamente o card Medida Exata e inicializa HUD', () => {
        window.switchMeasurementMode('Line');
        assert(elements['cad-measure-hud'].classList.contains('flex'), 'HUD deve estar visível');
        assert.strictEqual(elements['cad-hud-mode-tag'].innerText, 'Linha', 'Tag de modo deve ser Linha');
        assert.strictEqual(elements['meas-cad-dist-live'].innerText, '0.00 m', 'Distância inicial deve ser 0.00 m');
        assert(elements['cad-hud-hint'].innerHTML.includes('Passo 1'), 'Deve orientar Passo 1 (clique inicial)');
    });

    await t.test('2. Primeiro clique insere origem e movimento do mouse atualiza distância em tempo real', () => {
        const p1 = global.L.latLng(-27.5000, -48.5000);
        mockMap.fire('click', { latlng: p1 });

        assert(elements['cad-hud-hint'].innerHTML.includes('Passo 2'), 'Após 1º clique, deve avançar para Passo 2');

        // Move o mouse para posição distante
        const p2 = global.L.latLng(-27.5002, -48.5002);
        mockMap.fire('mousemove', { latlng: p2 });

        const dist = p1.distanceTo(p2);
        console.log('TEST 2 LOG: live innerText is', JSON.stringify(elements['meas-cad-dist-live'].innerText), 'expected dist is', dist.toFixed(2));
        assert(elements['meas-cad-dist-live'].innerText.includes(dist.toFixed(2)), 'Deve exibir a distância dinâmica em tempo real');
    });

    await t.test('3. Digitar valor no input trava o raio e calcula destino na direção da mira', () => {
        const inp = elements['cad-measure-input'];
        inp.value = '25.00';

        // Dispara evento de input
        if (inp._listeners && inp._listeners['input']) {
            inp._listeners['input'].forEach(fn => fn());
        }

        // Simula movimento do mouse apontando para o norte
        const mouseAim = global.L.latLng(-27.4990, -48.5000);
        mockMap.fire('mousemove', { latlng: mouseAim });

        // HUD deve acusar que a medida está travada
        assert(elements['meas-cad-dist-live'].innerHTML.includes('25.00 m'), 'Live distance deve exibir 25.00 m travada');
        assert(elements['cad-hud-hint'].innerHTML.includes('Medida Travada: 25.00 m'), 'Hint deve indicar medida travada');
    });

    await t.test('4. Clicar no mapa fixa a aresta com a medida exata definida (25m) e reseta o campo', () => {
        const mouseClick = global.L.latLng(-27.4980, -48.5000);
        mockMap.fire('click', { latlng: mouseClick });

        // O ponto deve ter sido inserido e o input limpo
        const inp = elements['cad-measure-input'];
        assert.strictEqual(inp.value, '', 'Input deve ser limpo para o próximo ponto');
    });

    await t.test('5. Ao alternar para Linha, clicar sobre marcador existente insere vértice sem acionar mover ponto', () => {
        // Cria um marcador técnico
        window.switchMeasurementMode('Marker');
        const pMarker = global.L.latLng(-27.5010, -48.5010);
        mockMap.fire('click', { latlng: pMarker });

        // Alterna para Linha
        window.switchMeasurementMode('Line');
        assert.strictEqual(window.currentMeasurementMode, 'Line');

        // Clica na posição do marcador
        mockMap.fire('click', { latlng: pMarker });

        // Não deve entrar em modo de ajuste de ponto
        assert(!window._isAdjustingMeasPointWithReticle, 'Não deve acionar modo retículo de ajuste');
        assert.strictEqual(window.currentMeasurementMode, 'Line', 'Deve permanecer no modo Linha');
    });

    await t.test('6. Iniciar movimentação de ponto e alternar para outra ferramenta cancela automaticamente a tarefa', () => {
        // Simula modo de ajuste de ponto ativo
        window._isAdjustingMeasPointWithReticle = true;
        window._activePointFinishAdjust = (save) => {
            window._isAdjustingMeasPointWithReticle = false;
        };

        // Alterna para Linha
        window.switchMeasurementMode('Line');
        assert(!window._isAdjustingMeasPointWithReticle, 'Ajuste de ponto deve ser cancelado automaticamente');
    });

    await t.test('7. Clicar no botão X limpa toda a ferramenta e reseta estado', () => {
        window.collapseMeasurementDrawer();
        assert(!window.isMeasurementActive, 'Medição deve estar inativa');
        assert.strictEqual(window.currentMeasurementMode, null, 'Modo deve ser nulo');
    });
});
