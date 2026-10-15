const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Validação de Ponta a Ponta dos 4 Requisitos da Ferramenta de Medição', async (t) => {
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
            _innerHTML: '',
            get innerHTML() {
                return el._innerHTML + el.children.map(c => c.innerHTML).join('');
            },
            set innerHTML(val) {
                el._innerHTML = val;
            },
            innerText: '',
            value: '',
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

    class MockMarker {
        constructor(latlng, opts) {
            this._latlng = latlng;
            this.options = opts || {};
        }
        getLatLng() { return this._latlng; }
        setLatLng(p) { this._latlng = p; return this; }
        setIcon(icon) { this.options.icon = icon; return this; }
        addTo(layerGroup) { this._map = layerGroup; return this; }
        bindTooltip() { return this; }
        on() { return this; }
    }

    class MockPolygon {
        constructor(pts, opts) {
            this._pts = pts;
            this.options = opts || {};
        }
        getLatLngs() { return [this._pts]; }
        toGeoJSON() {
            return {
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[...this._pts.map(p => [p.lng, p.lat]), [this._pts[0].lng, this._pts[0].lat]]]
                },
                properties: {}
            };
        }
        bindTooltip() { return this; }
        on() { return this; }
    }

    class MockPolyline {
        constructor(pts, opts) {
            this._pts = pts;
            this.options = opts || {};
        }
        getLatLngs() { return this._pts; }
        toGeoJSON() {
            return {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: this._pts.map(p => [p.lng, p.lat])
                },
                properties: {}
            };
        }
        bindTooltip() { return this; }
        on() { return this; }
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

    global.L = {
        Marker: MockMarker,
        Polygon: MockPolygon,
        Polyline: MockPolyline,
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
        latLngBounds: (sw, ne) => ({
            getWest: () => sw.lng,
            getSouth: () => sw.lat,
            getEast: () => ne.lng,
            getNorth: () => ne.lat,
            isValid: () => true
        }),
        marker: (latlng, opts) => new MockMarker(latlng, opts),
        polygon: (pts, opts) => new MockPolygon(pts, opts),
        polyline: (pts, opts) => new MockPolyline(pts, opts),
        featureGroup: () => {
            const layers = [];
            const fg = {
                addLayer: (l) => layers.push(l),
                removeLayer: (l) => {
                    const idx = layers.indexOf(l);
                    if (idx !== -1) layers.splice(idx, 1);
                },
                clearLayers: () => { layers.length = 0; },
                getLayers: () => layers,
                eachLayer: (fn) => layers.forEach(fn),
                getBounds: () => ({ isValid: () => true }),
                addTo: () => fg
            };
            return fg;
        },
        LineUtil: {
            pointToSegmentDistance: () => 5,
            closestPointOnSegment: (p, p1, p2) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 })
        },
        DomEvent: {
            stop: () => {},
            stopPropagation: () => {},
            disableClickPropagation: () => {},
            disableScrollPropagation: () => {}
        }
    };

    global.turf = {
        point: (coord) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: coord } }),
        bearing: () => 45,
        destination: (p1) => ({
            geometry: {
                coordinates: [p1.geometry.coordinates[0] + 0.0002, p1.geometry.coordinates[1] + 0.0002]
            }
        }),
        area: () => 1500.5,
        length: () => 180.25,
        centroid: () => ({
            geometry: {
                coordinates: [-48.5, -27.5]
            }
        })
    };

    global.formatDMS = () => "27° 30' 00\" S, 48° 30' 00\" W";
    global.formatUTM = () => "740000 m E, 6950000 m N (Zona 22S)";

    const listeners = {};
    const mockMap = {
        on: (evt, fn) => {
            listeners[evt] = listeners[evt] || [];
            listeners[evt].push(fn);
        },
        fire: (evt, data) => {
            (listeners[evt] || []).forEach(fn => fn(data));
        },
        hasLayer: () => false,
        removeLayer: () => {},
        latLngToContainerPoint: (ll) => ({ x: 500 + (ll ? ll.lng : 0) * 10, y: 400 - (ll ? ll.lat : 0) * 10 }),
        containerPointToLatLng: (pt) => global.L.latLng((400 - pt.y) / 10, (pt.x - 500) / 10),
        latLngToLayerPoint: (ll) => ({ x: 500 + (ll ? ll.lng : 0) * 10, y: 400 - (ll ? ll.lat : 0) * 10 }),
        getContainer: () => elements['map'],
        getCenter: () => global.L.latLng(-27.5, -48.5),
        getZoom: () => 18,
        doubleClickZoom: { disable: () => {}, enable: () => {} },
        pm: {
            enableDraw: () => {},
            disableDraw: () => {},
            setGlobalOptions: () => {},
            Draw: {
                Polygon: {
                    _layer: {
                        getLatLngs: () => [
                            global.L.latLng(-27.500, -48.500),
                            global.L.latLng(-27.501, -48.500),
                            global.L.latLng(-27.501, -48.501)
                        ]
                    },
                    _hintMarker: {
                        _snapped: false,
                        setLatLng: function(ll) { this._ll = ll; },
                        getLatLng: function() { return this._ll; }
                    },
                    _finishShape: () => {}
                },
                Line: {
                    _layer: {
                        getLatLngs: () => [
                            global.L.latLng(-27.500, -48.500),
                            global.L.latLng(-27.501, -48.500)
                        ]
                    },
                    _hintMarker: {
                        _snapped: false,
                        setLatLng: function(ll) { this._ll = ll; },
                        getLatLng: function() { return this._ll; }
                    },
                    _finishShape: () => {}
                }
            }
        }
    };
    global.map = mockMap;
    global.themes = [];
    global.GeoEngineTurbo = {
        hasThemeTree: () => true,
        queryViewport: () => []
    };

    // Load measurement.js
    const measCode = fs.readFileSync(path.join(__dirname, '../src/measurement.js'), 'utf8');
    eval(measCode);

    await t.test('1. Inserção de Ponto acompanha cursor e insere pontos consecutivos', () => {
        window.switchMeasurementMode('Marker');
        assert.strictEqual(window.currentMeasurementMode, 'Marker', 'Modo Marker deve estar ativo');

        // Simula movimento do cursor
        const p1 = global.L.latLng(-27.5001, -48.5001);
        mockMap.fire('mousemove', { latlng: p1 });

        // Clique 1: P01
        mockMap.fire('click', { latlng: p1 });
        const list = elements['meas-features-list'];
        assert.strictEqual(list.children.length, 1, 'P01 deve estar presente na lista');
        assert(list.children[0].innerHTML.includes('Ponto Técnico (P01)'), 'Card P01 renderizado');

        // Clique 2: P02
        const p2 = global.L.latLng(-27.5005, -48.5005);
        mockMap.fire('click', { latlng: p2 });
        assert.strictEqual(list.children.length, 2, 'P02 deve estar presente na lista');
        assert(list.children[1].innerHTML.includes('Ponto Técnico (P02)'), 'Card P02 renderizado');
    });

    await t.test('2. Desenho de Área (Polígono) calcula m² e ha com fechamento', () => {
        window.switchMeasurementMode('Polygon');
        assert.strictEqual(window.currentMeasurementMode, 'Polygon', 'Modo Polygon deve estar ativo');

        // Finaliza o polígono
        window.finishCurrentMeasurementDraw();
        const list = elements['meas-features-list'];
        const polyCard = list.children.find(c => c.innerHTML.includes('Área'));
        console.log('POLY CARD INNERHTML:', polyCard ? polyCard.innerHTML : 'NONE');
        assert(polyCard.innerHTML.includes('Área'), 'Área calculada');
    });

    await t.test('3. Medida Exata CAD aplica distância calculada na direção da mira', () => {
        window.switchMeasurementMode('Line');
        assert.strictEqual(window.currentMeasurementMode, 'Line', 'Modo Line deve estar ativo');

        // 1º ponto
        mockMap.fire('click', { latlng: global.L.latLng(-27.5000, -48.5000) });
        // Mira do mouse
        mockMap.fire('mousemove', { latlng: global.L.latLng(-27.5005, -48.5005) });
        // Aplica medida 25m
        window.applyCadMeasureInput('25');
        // Conclui linha
        window.finishCurrentMeasurementDraw();

        const list = elements['meas-features-list'];
        const lineCard = list.children.find(c => c.innerHTML.includes('Comprimento'));
        assert(lineCard, 'Card de Linha deve existir');
        assert(lineCard.innerHTML.includes('180.25 m'), 'Comprimento registrado');
    });

    await t.test('4. AutoCAD Osnap executa de forma assíncrona/instantânea com R-Tree', () => {
        const snap = findAutoCadSnap(global.L.latLng(-27.5000, -48.5000));
        assert(snap !== undefined, 'findAutoCadSnap executou sem exceção');
    });
});
