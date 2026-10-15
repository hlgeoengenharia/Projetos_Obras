const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Validação de Distância em Tempo Real, Arraste Nativo e Performance (Estilo SIG Profissional)', async (t) => {
    // 1. Mock DOM
    const elements = {};
    function createElement(tag) {
        const el = {
            tagName: tag.toUpperCase(),
            children: [],
            classList: {
                _classes: new Set(),
                add: (...cls) => cls.forEach(c => el.classList._classes.add(c)),
                remove: (...cls) => cls.forEach(c => el.classList._classes.delete(c)),
                contains: (c) => el.classList._classes.has(c)
            },
            style: {},
            innerHTML: '',
            innerText: '',
            value: '',
            placeholder: '',
            appendChild: (child) => { el.children.push(child); child.parentElement = el; return child; },
            remove: () => {
                if (el.parentElement) {
                    const idx = el.parentElement.children.indexOf(el);
                    if (idx !== -1) el.parentElement.children.splice(idx, 1);
                }
            },
            addEventListener: (evt, fn) => { el._listeners = el._listeners || {}; el._listeners[evt] = el._listeners[evt] || []; el._listeners[evt].push(fn); },
            focus: () => {}
        };
        return el;
    }

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

    class MockLayerGroup {
        constructor() {
            this._layers = [];
        }
        addLayer(l) { this._layers.push(l); return this; }
        removeLayer(l) { this._layers = this._layers.filter(x => x !== l); }
        hasLayer(l) { return this._layers.includes(l); }
        clearLayers() { this._layers = []; }
        getLayers() { return this._layers; }
        eachLayer(fn) { this._layers.forEach(fn); }
        addTo() { return this; }
        bringToFront() { return this; }
    }

    global.L = {
        featureGroup: () => new MockLayerGroup(),
        polyline: (pts, opts) => ({ _pts: pts, _opts: opts, setLatLngs: function(p) { this._pts = p; }, addTo: function(g) { if (g && g.addLayer) g.addLayer(this); return this; }, bringToFront: function() {} }),
        polygon: (pts, opts) => ({ _pts: pts, _opts: opts, setLatLngs: function(p) { this._pts = p; }, addTo: function(g) { if (g && g.addLayer) g.addLayer(this); return this; }, bringToFront: function() {} }),
        circleMarker: (ll, opts) => ({ _ll: ll, _opts: opts, setLatLng: function(p) { this._ll = p; }, addTo: function(g) { if (g && g.addLayer) g.addLayer(this); return this; } }),
        marker: (ll, opts) => {
            const m = {
                _ll: ll,
                options: opts || {},
                dragging: { enable: () => {}, disable: () => {} },
                setLatLng: function(p) { this._ll = p; return this; },
                getLatLng: function() { return this._ll; },
                setIcon: function(i) { this.options.icon = i; return this; },
                getElement: function() { return { style: {} }; },
                addTo: function(g) { if (g && g.addLayer) g.addLayer(this); return this; },
                on: function(evt, fn) { this._listeners = this._listeners || {}; this._listeners[evt] = this._listeners[evt] || []; this._listeners[evt].push(fn); return this; },
                fire: function(evt, data) { (this._listeners && this._listeners[evt] || []).forEach(fn => fn(data)); }
            };
            return m;
        },
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
        }),
        DomEvent: { stop: () => {}, stopPropagation: () => {}, disableClickPropagation: () => {}, disableScrollPropagation: () => {} }
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

    await t.test('1. Traçado de Linha multi-segmento atualiza HUD com distância em tempo real a cada vértice e mousemove', () => {
        window.switchMeasurementMode('Line');
        assert.strictEqual(elements['meas-cad-dist-live'].innerText, '0.00 m', 'Inicia com 0.00 m');

        // Vértice 1
        const p1 = global.L.latLng(-27.5000, -48.5000);
        mockMap.fire('click', { latlng: p1 });

        // Movimento do mouse após vértice 1
        const p2 = global.L.latLng(-27.5002, -48.5002);
        mockMap.fire('mousemove', { latlng: p2 });

        const d1 = p1.distanceTo(p2);
        assert(elements['meas-cad-dist-live'].innerText.includes(d1.toFixed(2)), 'Distância ao vivo após vértice 1');

        // Vértice 2 (clica em p2)
        mockMap.fire('click', { latlng: p2 });

        // Movimento do mouse para p3
        const p3 = global.L.latLng(-27.5005, -48.5005);
        mockMap.fire('mousemove', { latlng: p3 });

        const d2 = p2.distanceTo(p3);
        assert(elements['meas-cad-dist-live'].innerText.includes(d2.toFixed(2)), 'Distância do segmento atual para p3');
        assert(elements['cad-hud-hint'].innerHTML.includes('Total:'), 'Hint deve exibir distância acumulada total');
    });

    await t.test('2. Arraste de Marcador técnico com draggable: true e atualização em tempo real', () => {
        window.switchMeasurementMode('Marker');
        const pMarker = global.L.latLng(-27.5010, -48.5010);
        mockMap.fire('click', { latlng: pMarker });

        const list = elements['meas-features-list'];
        assert.strictEqual(list.children.length, 1, 'Ponto técnico criado na lista');

        // Verifica que o ponto é marcado como arrastável
        const layerGroup = global.window.measurementLayerGroup;
        let createdMarker = null;
        if (layerGroup) {
            layerGroup.eachLayer(l => { createdMarker = l; });
        }
        assert(createdMarker, 'Marcador criado no layerGroup');

        // Simula evento de drag
        if (createdMarker && createdMarker.fire) {
            createdMarker.fire('dragstart');
            assert(global.window._isDraggingMeasMarker, 'Estado de arraste ativo');

            createdMarker.setLatLng(global.L.latLng(-27.5020, -48.5020));
            createdMarker.fire('drag');
            createdMarker.fire('dragend');

            assert(!global.window._isDraggingMeasMarker, 'Estado de arraste liberado no dragend');
            assert(!global.window._isHoveringMeasMarker, 'Estado de hover liberado no dragend');
        }
    });

    await t.test('3. Alternância entre ferramentas ou encerramento desativa tarefas anteriores sem conflito', () => {
        window.switchMeasurementMode('Line');
        assert.strictEqual(global.window.currentMeasurementMode, 'Line');

        // Alterna para Polígono
        window.switchMeasurementMode('Polygon');
        assert.strictEqual(global.window.currentMeasurementMode, 'Polygon');

        // Fecha a ferramenta pelo closeMeasurementPanel
        closeMeasurementPanel();
        assert.strictEqual(global.window.isMeasurementActive, false, 'Ferramenta encerrada');
        assert.strictEqual(global.window.currentMeasurementMode, null, 'Modo limpo');
    });

    await t.test('4. CSS injetado garante que marcadores e tooltips não bloqueiam eventos do ponteiro', () => {
        assert(measCode.includes('.meas-live-dist-icon'), 'CSS de live dist icon presente');
        assert(measCode.includes('pointer-events: none !important'), 'Pointer-events none presente');
    });
});
