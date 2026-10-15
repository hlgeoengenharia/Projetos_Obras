let measurementLayerGroup = null;
let currentMeasurementMode = null;
let pointCounter = 1;
window.isMeasurementActive = false;
window.isMeasurementSnappingEnabled = true;
window._isHoveringMeasMarker = false;
window._isDraggingMeasMarker = false;

// Injeta CSS do marcador Uber e previne bordas/fundos indesejados
if (typeof document !== 'undefined') {
    const styleId = 'uber-point-marker-style';
    let style = document.getElementById(styleId);
    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }
    style.innerHTML = `
        .custom-uber-point-marker {
            background: transparent !important;
            border: none !important;
            cursor: grab;
        }
        .custom-uber-point-marker.meas-marker-dragging {
            cursor: grabbing !important;
            filter: drop-shadow(0 14px 22px rgba(0,0,0,0.75)) brightness(1.2) !important;
            z-index: 100000 !important;
        }
        .custom-uber-point-marker.meas-marker-dragging > div {
            transform: scale(1.15) !important;
            transition: transform 0.15s ease-out;
        }
        .leaflet-pm-hintMarker.custom-uber-point-marker,
        .meas-live-dist-icon,
        .meas-live-dist-icon *,
        .custom-uber-live-cursor,
        .custom-uber-live-cursor *,
        .autocad-snap-container,
        .autocad-snap-container * {
            pointer-events: none !important;
        }
    `;
}

function getTechPointIcon(label) {
    const num = label !== undefined ? String(label).padStart(2, '0') : String(pointCounter).padStart(2, '0');
    return L.divIcon({
        className: 'custom-uber-point-marker',
        html: `
            <div style="position: relative; width: 28px; height: 38px; pointer-events: none; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.55)); transform: translate3d(0,0,0);">
                <svg width="28" height="38" viewBox="0 0 28 38" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block;">
                    <path d="M14 38C14 38 27 23 27 14C27 6.8203 21.1797 1 14 1C6.8203 1 1 6.8203 1 14C1 23 14 38 14 38Z" fill="#2563eb" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
                    <circle cx="14" cy="14" r="5.5" fill="#ffffff"/>
                    <circle cx="14" cy="14" r="3" fill="#1d4ed8"/>
                </svg>
                <div style="position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #38bdf8; font-family: monospace; font-size: 10px; font-weight: 900; padding: 1px 5px; border-radius: 4px; border: 1.5px solid #38bdf8; box-shadow: 0 2px 5px rgba(0,0,0,0.6); white-space: nowrap; pointer-events: none; letter-spacing: 0.5px;">
                    P${num}
                </div>
            </div>
        `,
        iconSize: [28, 38],
        iconAnchor: [14, 38],
        popupAnchor: [0, -38]
    });
}

window.toggleMeasurementSnapping = function() {
    window.isMeasurementSnappingEnabled = !window.isMeasurementSnappingEnabled;
    const btn = document.getElementById('btn-measure-snap');
    if (btn) {
        if (window.isMeasurementSnappingEnabled) {
            btn.classList.add('text-emerald-600', 'dark:text-emerald-400');
            btn.classList.remove('text-slate-600', 'dark:text-slate-300');
            btn.title = "Aderência Ativada";
        } else {
            btn.classList.remove('text-emerald-600', 'dark:text-emerald-400');
            btn.classList.add('text-slate-600', 'dark:text-slate-300');
            btn.title = "Aderência Desativada";
        }
    }
    if (!window.isMeasurementSnappingEnabled && typeof hideAutoCadSnap === 'function') {
        hideAutoCadSnap();
    }
    
    if (map && map.pm) {
        const snapOpt = { 
            snappable: window.isMeasurementSnappingEnabled,
            snapDistance: 15
        };
        if (measurementLayerGroup) snapOpt.snapLayers = [measurementLayerGroup];
        map.pm.setGlobalOptions(snapOpt);
    }
};

window.toggleMeasurementMenu = function(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('measurement-menu-dropdown');
    if (!menu) return;
    const isHidden = menu.classList.contains('hidden');
    document.querySelectorAll('.app-dropdown-menu').forEach(m => m.classList.add('hidden'));
    if (isHidden) {
        menu.classList.remove('hidden');
    } else {
        menu.classList.add('hidden');
    }
};

window.selectMeasurementOption = function(type) {
    if (!type || typeof type !== 'string') return;
    const menu = document.getElementById('measurement-menu-dropdown');
    if (menu) menu.classList.add('hidden');

    if (type === '3D') {
        if (typeof openCesiumModal === 'function') {
            openCesiumModal();
        }
        return;
    }

    const panel = document.getElementById('measurement-panel');
    if (panel && panel.classList.contains('hidden')) {
        toggleMeasurementPanel();
    }

    if (typeof window.switchMeasurementMode === 'function') {
        window.switchMeasurementMode(type);
    } else if (typeof startMeasurementDraw === 'function') {
        startMeasurementDraw(type);
    }
};

document.addEventListener('click', (e) => {
    const menu = document.getElementById('measurement-menu-dropdown');
    const btn = document.getElementById('btn-measurement-menu');
    if (menu && !menu.classList.contains('hidden')) {
        if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
            menu.classList.add('hidden');
        }
    }
});

function toggleMeasurementPanel() {
    const panel = document.getElementById('measurement-panel');
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
        // Open
        panel.classList.remove('hidden');
        if (!measurementLayerGroup) {
            measurementLayerGroup = L.featureGroup().addTo(map);
        }
        window.measurementLayerGroup = measurementLayerGroup;
        window.isMeasurementActive = true;
        
        // Re-enable editing on existing measurement layers (scoped only to measurementLayerGroup for snapping!)
        const snapLayersList = (measurementLayerGroup && measurementLayerGroup.getLayers().length > 0) ? [measurementLayerGroup] : [];
        measurementLayerGroup.eachLayer(l => {
            if (l.pm && typeof l.pm.enable === 'function') {
                l.pm.enable({
                    allowSelfIntersection: true,
                    preventMarkerRemoval: false,
                    snappable: window.isMeasurementSnappingEnabled,
                    snapLayers: snapLayersList,
                    draggable: true
                });
            }
            if (l.dragging && typeof l.dragging.enable === 'function') {
                l.dragging.enable();
            }
        });
        
        // Initialize drag if not done yet
        if (!window.isMeasurementDragInitialized) {
            initMeasurementPanelDrag();
            window.isMeasurementDragInitialized = true;
        }

        // Previne vazamento de cliques e rolagem do painel para o mapa Leaflet
        if (window.L && L.DomEvent) {
            const drawer = document.getElementById('meas-drawer-container');
            if (drawer) {
                L.DomEvent.disableClickPropagation(drawer);
                L.DomEvent.disableScrollPropagation(drawer);
            }
            const interactiveElements = panel.querySelectorAll('.pointer-events-auto');
            interactiveElements.forEach(el => {
                L.DomEvent.disableClickPropagation(el);
                L.DomEvent.disableScrollPropagation(el);
            });
        }
    } else {
        // Close
        closeMeasurementPanel();
    }
}

window.togglePrintViewfinder = function() {
    const viewfinder = document.getElementById('print-viewfinder');
    const btn = document.getElementById('btn-toggle-viewfinder');
    if (!viewfinder) return;
    
    if (viewfinder.classList.contains('hidden')) {
        viewfinder.classList.remove('hidden');
        viewfinder.classList.add('flex');
        setTimeout(() => viewfinder.classList.remove('opacity-0'), 10);
        if (btn) {
            btn.classList.add('bg-primary/20', 'text-primary');
            btn.classList.remove('text-slate-600', 'dark:text-slate-300');
        }
    } else {
        viewfinder.classList.add('opacity-0');
        setTimeout(() => {
            viewfinder.classList.add('hidden');
            viewfinder.classList.remove('flex');
        }, 300);
        if (btn) {
            btn.classList.remove('bg-primary/20', 'text-primary');
            btn.classList.add('text-slate-600', 'dark:text-slate-300');
        }
    }
}

// CAD Exact Measure Input & AutoCAD Osnap State
let lastDrawnVertex = null;
let currentMouseLatLng = null;
let cadActiveShape = null;
let autocadSnapMarker = null;
let currentSnapResult = null;
let uberLiveCursorMarker = null;
let cadTargetDirectionLatLng = null;
let isCadDirectionLocked = false;

// GIS Measurement State Machine (Reference: Leaflet.PolylineMeasure & leaflet-measure)
let activeMeasurePoints = [];
let activeMeasurePreviewGroup = null;
let committedSegmentsLine = null;
let rubberbandLine = null;
let rubberbandPolygon = null;
let activeAnchorMarkers = [];
let lockedVertexPreviewMarker = null;
let lastClickTimestamp = 0;
let lastClickLatLng = null;

let measSvgRenderer = null;
function getMeasSvgRenderer() {
    if (!measSvgRenderer && typeof L !== 'undefined' && typeof L.svg === 'function') {
        try {
            measSvgRenderer = L.svg();
        } catch(e) {}
    }
    return measSvgRenderer;
}

let liveDistanceMarker = null;

function updateLiveDistanceTooltip(latlng, segmentDist, totalDist, isLocked = false) {
    if (!map || !latlng) {
        hideLiveDistanceTooltip();
        return;
    }
    const distText = isLocked 
        ? `🔒 ${segmentDist.toFixed(2)} m` 
        : `${segmentDist.toFixed(2)} m`;
    
    const extraText = (totalDist && totalDist > segmentDist)
        ? ` <span style="opacity:0.65;font-size:9.5px;">(Total: ${totalDist.toFixed(2)} m)</span>`
        : '';

    const html = `
        <div style="background: rgba(15, 23, 42, 0.90); backdrop-filter: blur(8px); color: #10b981; font-family: monospace; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px; border: 1.5px solid rgba(16, 185, 129, 0.5); box-shadow: 0 4px 14px rgba(0,0,0,0.5); white-space: nowrap; pointer-events: none; letter-spacing: 0.3px; transform: translate3d(12px, -12px, 0);">
            📏 ${distText}${extraText}
        </div>
    `;

    if (!liveDistanceMarker) {
        liveDistanceMarker = L.marker(latlng, {
            icon: L.divIcon({
                className: 'meas-live-dist-icon',
                html: html,
                iconSize: [0, 0],
                iconAnchor: [0, 0]
            }),
            interactive: false
        });
        if (activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.addLayer === 'function') {
            activeMeasurePreviewGroup.addLayer(liveDistanceMarker);
        }
    } else {
        if (activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.hasLayer === 'function' && !activeMeasurePreviewGroup.hasLayer(liveDistanceMarker)) {
            activeMeasurePreviewGroup.addLayer(liveDistanceMarker);
        }
        if (typeof liveDistanceMarker.setLatLng === 'function') {
            liveDistanceMarker.setLatLng(latlng);
        }
        if (liveDistanceMarker._icon) {
            liveDistanceMarker._icon.innerHTML = html;
        } else if (typeof liveDistanceMarker.setIcon === 'function') {
            liveDistanceMarker.setIcon(L.divIcon({
                className: 'meas-live-dist-icon',
                html: html,
                iconSize: [0, 0],
                iconAnchor: [0, 0]
            }));
        }
    }
    const el = (liveDistanceMarker && liveDistanceMarker.getElement) ? liveDistanceMarker.getElement() : (liveDistanceMarker ? liveDistanceMarker._icon : null);
    if (el) {
        el.style.pointerEvents = 'none';
    }
}

function hideLiveDistanceTooltip() {
    if (liveDistanceMarker && activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.hasLayer === 'function' && activeMeasurePreviewGroup.hasLayer(liveDistanceMarker)) {
        activeMeasurePreviewGroup.removeLayer(liveDistanceMarker);
    }
}

function initMeasurePreviewGroup() {
    if (!map) return;
    if (!activeMeasurePreviewGroup) {
        activeMeasurePreviewGroup = L.featureGroup().addTo(map);
    } else if (!map.hasLayer(activeMeasurePreviewGroup)) {
        activeMeasurePreviewGroup.addTo(map);
    }
}

function clearActiveMeasurePreview() {
    activeMeasurePoints = [];
    hideLiveDistanceTooltip();
    if (activeMeasurePreviewGroup) {
        activeMeasurePreviewGroup.clearLayers();
    }
    committedSegmentsLine = null;
    rubberbandLine = null;
    rubberbandPolygon = null;
    lockedVertexPreviewMarker = null;
    activeAnchorMarkers = [];
}

function hideRubberband() {
    hideLiveDistanceTooltip();
    if (rubberbandLine && activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.hasLayer === 'function' && activeMeasurePreviewGroup.hasLayer(rubberbandLine)) {
        activeMeasurePreviewGroup.removeLayer(rubberbandLine);
    }
    if (rubberbandPolygon && activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.hasLayer === 'function' && activeMeasurePreviewGroup.hasLayer(rubberbandPolygon)) {
        activeMeasurePreviewGroup.removeLayer(rubberbandPolygon);
    }
    if (lockedVertexPreviewMarker && activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.hasLayer === 'function' && activeMeasurePreviewGroup.hasLayer(lockedVertexPreviewMarker)) {
        activeMeasurePreviewGroup.removeLayer(lockedVertexPreviewMarker);
    }
}

function addActiveAnchorMarker(latlng) {
    if (!map || !latlng) return;
    initMeasurePreviewGroup();
    if (typeof L.circleMarker === 'function') {
        const anchor = L.circleMarker(latlng, {
            radius: 5,
            color: '#10b981',
            weight: 2,
            fillColor: '#ffffff',
            fillOpacity: 1,
            renderer: getMeasSvgRenderer(),
            interactive: false
        });
        if (typeof anchor.addTo === 'function') {
            anchor.addTo(activeMeasurePreviewGroup);
        } else if (activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.addLayer === 'function') {
            activeMeasurePreviewGroup.addLayer(anchor);
        }
        activeAnchorMarkers.push(anchor);
    }
}

function getLockedCadMeasure() {
    const inp = document.getElementById('cad-measure-input');
    if (!inp) return null;
    const raw = String(inp.value).trim().replace(',', '.');
    const val = parseFloat(raw);
    return (!isNaN(val) && val > 0) ? val : null;
}

function updateRubberband(effectiveLatLng) {
    if (!map || !effectiveLatLng || activeMeasurePoints.length === 0) {
        hideRubberband();
        return;
    }
    initMeasurePreviewGroup();

    // Se houver uma medida digitada no card Medida Exata, trava o comprimento da aresta
    let finalTargetLatLng = effectiveLatLng;
    const lockedMeters = getLockedCadMeasure();
    const lastOrigin = activeMeasurePoints[activeMeasurePoints.length - 1];
    if (lockedMeters && lastOrigin) {
        const dest = getDestinationLatLng(lastOrigin, effectiveLatLng, lockedMeters);
        if (dest) {
            finalTargetLatLng = dest;
        }
    }

    // Indicador visual na ponta da aresta com medida travada
    if (lockedMeters && lastOrigin && finalTargetLatLng) {
        if (!lockedVertexPreviewMarker) {
            lockedVertexPreviewMarker = L.circleMarker(finalTargetLatLng, {
                radius: 6,
                color: '#059669',
                weight: 2,
                fillColor: '#34d399',
                fillOpacity: 0.9,
                renderer: getMeasSvgRenderer(),
                interactive: false
            });
            if (activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.addLayer === 'function') {
                activeMeasurePreviewGroup.addLayer(lockedVertexPreviewMarker);
            }
        } else {
            if (activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.hasLayer === 'function' && !activeMeasurePreviewGroup.hasLayer(lockedVertexPreviewMarker)) {
                activeMeasurePreviewGroup.addLayer(lockedVertexPreviewMarker);
            }
            if (typeof lockedVertexPreviewMarker.setLatLng === 'function') {
                lockedVertexPreviewMarker.setLatLng(finalTargetLatLng);
            }
        }
    } else if (lockedVertexPreviewMarker && activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.hasLayer === 'function' && activeMeasurePreviewGroup.hasLayer(lockedVertexPreviewMarker)) {
        activeMeasurePreviewGroup.removeLayer(lockedVertexPreviewMarker);
    }

    // 1. Renderiza segmentos já confirmados com linha sólida
    if (activeMeasurePoints.length > 1) {
        if (!committedSegmentsLine) {
            committedSegmentsLine = L.polyline(activeMeasurePoints, {
                color: '#10b981',
                weight: 2.5,
                renderer: getMeasSvgRenderer(),
                interactive: false
            });
            if (typeof committedSegmentsLine.addTo === 'function') {
                committedSegmentsLine.addTo(activeMeasurePreviewGroup);
            } else if (activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.addLayer === 'function') {
                activeMeasurePreviewGroup.addLayer(committedSegmentsLine);
            }
        } else {
            if (activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.hasLayer === 'function' && !activeMeasurePreviewGroup.hasLayer(committedSegmentsLine)) {
                if (typeof committedSegmentsLine.addTo === 'function') {
                    committedSegmentsLine.addTo(activeMeasurePreviewGroup);
                } else if (typeof activeMeasurePreviewGroup.addLayer === 'function') {
                    activeMeasurePreviewGroup.addLayer(committedSegmentsLine);
                }
            }
            if (typeof committedSegmentsLine.setLatLngs === 'function') {
                committedSegmentsLine.setLatLngs(activeMeasurePoints);
            }
        }
    }

    // 2. Renderiza apenas a aresta dinâmica/elástica do último vértice até o cursor (tracejada)
    if (currentMeasurementMode === 'Line') {
        const rubberPts = [lastOrigin, finalTargetLatLng];
        if (!rubberbandLine) {
            rubberbandLine = L.polyline(rubberPts, {
                color: '#10b981',
                weight: 2.5,
                dashArray: '6, 6',
                renderer: getMeasSvgRenderer(),
                interactive: false
            });
            if (typeof rubberbandLine.addTo === 'function') {
                rubberbandLine.addTo(activeMeasurePreviewGroup);
            } else if (activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.addLayer === 'function') {
                activeMeasurePreviewGroup.addLayer(rubberbandLine);
            }
        } else {
            if (activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.hasLayer === 'function' && !activeMeasurePreviewGroup.hasLayer(rubberbandLine)) {
                if (typeof rubberbandLine.addTo === 'function') {
                    rubberbandLine.addTo(activeMeasurePreviewGroup);
                } else if (typeof activeMeasurePreviewGroup.addLayer === 'function') {
                    activeMeasurePreviewGroup.addLayer(rubberbandLine);
                }
            }
            if (typeof rubberbandLine.setLatLngs === 'function') {
                rubberbandLine.setLatLngs(rubberPts);
            } else {
                rubberbandLine._pts = rubberPts;
            }
        }
        if (typeof rubberbandLine.bringToFront === 'function') {
            rubberbandLine.bringToFront();
        }
        if (rubberbandPolygon && activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.hasLayer === 'function' && activeMeasurePreviewGroup.hasLayer(rubberbandPolygon)) {
            activeMeasurePreviewGroup.removeLayer(rubberbandPolygon);
        }
    } else if (currentMeasurementMode === 'Polygon') {
        const pts = [...activeMeasurePoints, finalTargetLatLng];
        if (!rubberbandPolygon) {
            rubberbandPolygon = L.polygon(pts, {
                color: '#10b981',
                fillColor: '#10b981',
                fillOpacity: 0.2,
                weight: 2,
                dashArray: '5, 5',
                renderer: getMeasSvgRenderer(),
                interactive: false
            });
            if (typeof rubberbandPolygon.addTo === 'function') {
                rubberbandPolygon.addTo(activeMeasurePreviewGroup);
            } else if (activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.addLayer === 'function') {
                activeMeasurePreviewGroup.addLayer(rubberbandPolygon);
            }
        } else {
            if (activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.hasLayer === 'function' && !activeMeasurePreviewGroup.hasLayer(rubberbandPolygon)) {
                if (typeof rubberbandPolygon.addTo === 'function') {
                    rubberbandPolygon.addTo(activeMeasurePreviewGroup);
                } else if (typeof activeMeasurePreviewGroup.addLayer === 'function') {
                    activeMeasurePreviewGroup.addLayer(rubberbandPolygon);
                }
            }
            if (typeof rubberbandPolygon.setLatLngs === 'function') {
                rubberbandPolygon.setLatLngs(pts);
            } else {
                rubberbandPolygon._pts = pts;
            }
        }
        if (typeof rubberbandPolygon.bringToFront === 'function') {
            rubberbandPolygon.bringToFront();
        }
        if (rubberbandLine && activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.hasLayer === 'function' && activeMeasurePreviewGroup.hasLayer(rubberbandLine)) {
            activeMeasurePreviewGroup.removeLayer(rubberbandLine);
        }
    }

    // 3. Atualiza tooltip flutuante de distância dinâmica em tempo real
    const liveDist = lastOrigin.distanceTo(finalTargetLatLng);
    let totalDist = liveDist;
    if (activeMeasurePoints.length > 1) {
        let acc = 0;
        for (let k = 0; k < activeMeasurePoints.length - 1; k++) {
            acc += activeMeasurePoints[k].distanceTo(activeMeasurePoints[k + 1]);
        }
        totalDist = acc + liveDist;
    }
    updateLiveDistanceTooltip(finalTargetLatLng, liveDist, totalDist, !!lockedMeters);

    // Sincroniza HUD inferior com a distância dinâmica em tempo real
    updateCadMeasureHudLive(finalTargetLatLng);

    if (activeMeasurePreviewGroup && typeof activeMeasurePreviewGroup.bringToFront === 'function') {
        activeMeasurePreviewGroup.bringToFront();
    }
}

function initAutoCadSnapMarker() {
    if (autocadSnapMarker || !map) return;
    const snapIcon = L.divIcon({
        className: 'autocad-snap-container',
        html: `
            <div id="autocad-snap-glyph" class="autocad-snap-vertex"></div>
            <div id="autocad-snap-badge" class="autocad-snap-badge">Vértice</div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
    });
    autocadSnapMarker = L.marker([0, 0], {
        icon: snapIcon,
        interactive: false,
        zIndexOffset: 100000
    });
}

function showAutoCadSnap(latlng, type, label) {
    if (!map || !latlng) return;
    initAutoCadSnapMarker();
    if (!map.hasLayer(autocadSnapMarker)) {
        autocadSnapMarker.addTo(map);
    }
    autocadSnapMarker.setLatLng(latlng);
    const el = autocadSnapMarker.getElement ? autocadSnapMarker.getElement() : null;
    if (el) {
        el.style.pointerEvents = 'none';
        el.style.display = '';
    }

    const glyph = document.getElementById('autocad-snap-glyph');
    const badge = document.getElementById('autocad-snap-badge');
    if (glyph && badge) {
        if (type === 'vertex' || type === 'close-polygon') {
            glyph.className = 'autocad-snap-vertex';
            badge.className = 'autocad-snap-badge';
            badge.innerText = label || (type === 'close-polygon' ? 'Fechar Polígono' : 'Vértice');
        } else if (type === 'midpoint') {
            glyph.className = 'autocad-snap-midpoint';
            badge.className = 'autocad-snap-badge midpoint';
            badge.innerText = label || 'Ponto Médio';
        } else {
            glyph.className = 'autocad-snap-edge';
            badge.className = 'autocad-snap-badge edge';
            badge.innerText = label || 'Aresta';
        }
    }
}

function hideAutoCadSnap() {
    if (autocadSnapMarker) {
        const el = autocadSnapMarker.getElement ? autocadSnapMarker.getElement() : null;
        if (el) el.style.display = 'none';
        else if (map && map.hasLayer(autocadSnapMarker)) {
            map.removeLayer(autocadSnapMarker);
        }
    }
    currentSnapResult = null;
}

function findAutoCadSnap(mouseLatLng, vertexTolerancePx = 14, edgeTolerancePx = 8, midpointTolerancePx = 12) {
    if (!window.isMeasurementSnappingEnabled || !map || !mouseLatLng) return null;
    if (window._isAdjustingMeasPointWithReticle) return null;

    const mousePt = map.latLngToContainerPoint(mouseLatLng);
    let bestVertexSnap = null;
    let minVertexDist = vertexTolerancePx;
    let bestMidpointSnap = null;
    let minMidpointDist = midpointTolerancePx;
    let bestEdgeSnap = null;
    let minEdgeDist = edgeTolerancePx;

    // 1. Vértices da forma geométrica atualmente em desenho (Linha ou Polígono)
    if (currentMeasurementMode === 'Polygon' || currentMeasurementMode === 'Line') {
        const drawMode = currentMeasurementMode;
        const pts = (activeMeasurePoints && activeMeasurePoints.length > 0)
            ? activeMeasurePoints
            : (() => {
                const drawInstance = map.pm && map.pm.Draw && map.pm.Draw[drawMode];
                if (drawInstance && drawInstance._layer) {
                    const rawPts = drawInstance._layer.getLatLngs();
                    return Array.isArray(rawPts[0]) ? rawPts[0] : rawPts;
                }
                return [];
            })();

        if (pts && pts.length > 0) {
            // Fechamento de polígono se >= 3 pontos
            if (drawMode === 'Polygon' && pts.length >= 3) {
                const firstPt = pts[0];
                const screenPt = map.latLngToContainerPoint(firstPt);
                const dist = Math.hypot(mousePt.x - screenPt.x, mousePt.y - screenPt.y);
                if (dist <= 24) {
                    return {
                        latlng: firstPt,
                        type: 'close-polygon',
                        label: 'Fechar Polígono'
                    };
                }
            }
            // Não faz snap no próprio vértice de onde a aresta está saindo (pts[pts.length - 1])
            const checkLimit = pts.length > 1 ? pts.length - 1 : 0;
            for (let i = 0; i < checkLimit; i++) {
                const p = pts[i];
                if (!p) continue;
                const screenPt = map.latLngToContainerPoint(p);
                const dist = Math.hypot(mousePt.x - screenPt.x, mousePt.y - screenPt.y);
                if (dist < minVertexDist) {
                    minVertexDist = dist;
                    bestVertexSnap = {
                        latlng: p,
                        type: 'vertex',
                        label: i === 0 && drawMode === 'Polygon' ? '1º Vértice' : `Vértice ${i + 1}`
                    };
                }
            }
        }
    }

    // 2. Camadas do grupo de medição (measurementLayerGroup)
    if (measurementLayerGroup) {
        measurementLayerGroup.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                // Se estamos inserindo Pontos (Marker), NUNCA faz snap com outros marcadores de medição,
                // eliminando o empilhamento/travamento de pontos na mesma coordenada.
                if (currentMeasurementMode === 'Marker') return;

                const p = layer.getLatLng();
                const screenPt = map.latLngToContainerPoint(p);
                const dist = Math.hypot(mousePt.x - screenPt.x, mousePt.y - screenPt.y);
                if (dist < minVertexDist) {
                    minVertexDist = dist;
                    bestVertexSnap = {
                        latlng: p,
                        type: 'vertex',
                        label: layer.measurementData ? layer.measurementData.id || 'Ponto' : 'Ponto'
                    };
                }
            } else if (typeof layer.getLatLngs === 'function') {
                const raw = layer.getLatLngs();
                const rings = Array.isArray(raw[0]) ? (Array.isArray(raw[0][0]) ? raw[0] : raw) : [raw];
                rings.forEach(ring => {
                    if (!Array.isArray(ring)) return;
                    for (let i = 0; i < ring.length; i++) {
                        const p = ring[i];
                        if (!p || typeof p.lat !== 'number') continue;
                        const screenPt = map.latLngToContainerPoint(p);
                        const dist = Math.hypot(mousePt.x - screenPt.x, mousePt.y - screenPt.y);
                        if (dist < minVertexDist) {
                            minVertexDist = dist;
                            bestVertexSnap = { latlng: p, type: 'vertex', label: 'Vértice' };
                        }
                    }
                    const isClosed = layer instanceof L.Polygon;
                    const segCount = isClosed ? ring.length : ring.length - 1;
                    for (let i = 0; i < segCount; i++) {
                        const p1 = ring[i];
                        const p2 = ring[(i + 1) % ring.length];
                        if (!p1 || !p2) continue;

                        // Ponto Médio
                        const midLatLng = L.latLng((p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2);
                        const midPt = map.latLngToContainerPoint(midLatLng);
                        const distMid = Math.hypot(mousePt.x - midPt.x, mousePt.y - midPt.y);
                        if (distMid < minMidpointDist) {
                            minMidpointDist = distMid;
                            bestMidpointSnap = {
                                latlng: midLatLng,
                                type: 'midpoint',
                                label: 'Ponto Médio'
                            };
                        }

                        // Aresta
                        if (L.LineUtil && typeof L.LineUtil.pointToSegmentDistance === 'function') {
                            const pt1 = map.latLngToContainerPoint(p1);
                            const pt2 = map.latLngToContainerPoint(p2);
                            const distEdge = L.LineUtil.pointToSegmentDistance(mousePt, pt1, pt2);
                            if (distEdge < minEdgeDist) {
                                minEdgeDist = distEdge;
                                const closestPt = L.LineUtil.closestPointOnSegment(mousePt, pt1, pt2);
                                bestEdgeSnap = {
                                    latlng: map.containerPointToLatLng(closestPt),
                                    type: 'edge',
                                    label: 'Aresta'
                                };
                            }
                        }
                    }
                });
            }
        });
    }

    // 3. Camadas GeoJSON vetoriais do mapa (CTM, Obras, Loteamentos, Logradouros, etc.)
    const activeThemes = (typeof themes !== 'undefined' && Array.isArray(themes)) ? themes : (window.themes || []);
    if (map && activeThemes.length > 0) {
        const queryPx = Math.max(vertexTolerancePx, midpointTolerancePx, edgeTolerancePx) + 8;
        const swLatLng = map.containerPointToLatLng(L.point(mousePt.x - queryPx, mousePt.y + queryPx));
        const neLatLng = map.containerPointToLatLng(L.point(mousePt.x + queryPx, mousePt.y - queryPx));
        const queryBounds = L.latLngBounds(swLatLng, neLatLng);
        const west = queryBounds.getWest(), east = queryBounds.getEast();
        const south = queryBounds.getSouth(), north = queryBounds.getNorth();

        const checkSnapGeometry = (geom) => {
            if (!geom || !geom.coordinates) return;
            const type = geom.type;
            const coords = geom.coordinates;
            let rings = [];

            if (type === 'Point') {
                const p = L.latLng(coords[1], coords[0]);
                const screenPt = map.latLngToContainerPoint(p);
                const dist = Math.hypot(mousePt.x - screenPt.x, mousePt.y - screenPt.y);
                if (dist < minVertexDist) {
                    minVertexDist = dist;
                    bestVertexSnap = { latlng: p, type: 'vertex', label: 'Ponto' };
                }
                return;
            } else if (type === 'LineString') {
                rings = [coords];
            } else if (type === 'MultiLineString' || type === 'Polygon') {
                rings = coords;
            } else if (type === 'MultiPolygon') {
                for (let r = 0; r < coords.length; r++) {
                    if (Array.isArray(coords[r])) {
                        rings.push(...coords[r]);
                    }
                }
            }

            for (let r = 0; r < rings.length; r++) {
                const ring = rings[r];
                if (!Array.isArray(ring)) continue;

                // Vértices do anel/linha
                for (let i = 0; i < ring.length; i++) {
                    const c = ring[i];
                    if (!c || c.length < 2) continue;
                    // Pre-filtro instantâneo em O(1): elimina projeções desnecessárias fora da mira
                    if (c[0] < west || c[0] > east || c[1] < south || c[1] > north) continue;

                    const p = L.latLng(c[1], c[0]);
                    const screenPt = map.latLngToContainerPoint(p);
                    const dist = Math.hypot(mousePt.x - screenPt.x, mousePt.y - screenPt.y);
                    if (dist < minVertexDist) {
                        minVertexDist = dist;
                        bestVertexSnap = { latlng: p, type: 'vertex', label: 'Vértice' };
                    }
                }

                // Segmentos: Ponto Médio e Caminhamento pelas Arestas (apenas se nenhum vértice foi capturado na mira)
                if (minVertexDist > vertexTolerancePx) {
                    const isPoly = (type === 'Polygon' || type === 'MultiPolygon');
                    const len = ring.length;
                    const isFirstLastSame = len > 1 && ring[0][0] === ring[len - 1][0] && ring[0][1] === ring[len - 1][1];
                    const segCount = (isPoly && !isFirstLastSame) ? len : len - 1;

                    for (let i = 0; i < segCount; i++) {
                        const c1 = ring[i];
                        const c2 = ring[(i + 1) % len];
                        if (!c1 || !c2 || c1.length < 2 || c2.length < 2) continue;

                        // Pre-filtro instantâneo do segmento: ignora se o segmento inteiro estiver fora da mira
                        const sMinX = Math.min(c1[0], c2[0]);
                        const sMaxX = Math.max(c1[0], c2[0]);
                        const sMinY = Math.min(c1[1], c2[1]);
                        const sMaxY = Math.max(c1[1], c2[1]);
                        if (sMaxX < west || sMinX > east || sMaxY < south || sMinY > north) continue;

                        const p1 = L.latLng(c1[1], c1[0]);
                        const p2 = L.latLng(c2[1], c2[0]);

                        // Ponto Médio (Centro da linha)
                        const midLatLng = L.latLng((c1[1] + c2[1]) / 2, (c1[0] + c2[0]) / 2);
                        const midPt = map.latLngToContainerPoint(midLatLng);
                        const distMid = Math.hypot(mousePt.x - midPt.x, mousePt.y - midPt.y);
                        if (distMid < minMidpointDist) {
                            minMidpointDist = distMid;
                            bestMidpointSnap = {
                                latlng: midLatLng,
                                type: 'midpoint',
                                label: 'Ponto Médio'
                            };
                        }

                        // Aresta (Caminhamento sobre a linha)
                        if (L.LineUtil && typeof L.LineUtil.pointToSegmentDistance === 'function') {
                            const pt1 = map.latLngToContainerPoint(p1);
                            const pt2 = map.latLngToContainerPoint(p2);
                            const distEdge = L.LineUtil.pointToSegmentDistance(mousePt, pt1, pt2);
                            if (distEdge < minEdgeDist) {
                                minEdgeDist = distEdge;
                                const closestPt = L.LineUtil.closestPointOnSegment(mousePt, pt1, pt2);
                                bestEdgeSnap = {
                                    latlng: map.containerPointToLatLng(closestPt),
                                    type: 'edge',
                                    label: 'Aresta'
                                };
                            }
                        }
                    }
                }
            }
        };

        for (let t = 0; t < activeThemes.length; t++) {
            const theme = activeThemes[t];
            if (!theme || theme.visible === false) continue;

            let hits = null;
            const hasSpatialTree = window.GeoEngineTurbo && typeof window.GeoEngineTurbo.hasThemeTree === 'function' && 
                (window.GeoEngineTurbo.hasThemeTree(theme.id) || window.GeoEngineTurbo.hasThemeTree(String(theme.id)) || (typeof theme.id === 'string' && !isNaN(theme.id) && window.GeoEngineTurbo.hasThemeTree(Number(theme.id))));

            if (hasSpatialTree && typeof window.GeoEngineTurbo.queryViewport === 'function') {
                hits = window.GeoEngineTurbo.queryViewport(theme.id, queryBounds) ||
                       window.GeoEngineTurbo.queryViewport(String(theme.id), queryBounds) ||
                       (typeof theme.id === 'string' && !isNaN(theme.id) ? window.GeoEngineTurbo.queryViewport(Number(theme.id), queryBounds) : null);
            }

            // Fallback APENAS se o tema não possuir árvore espacial (hits === null)
            if (hits === null && theme.features && Array.isArray(theme.features)) {
                let themeBbox = theme._bbox;
                if (!themeBbox && theme.features.length > 0 && typeof computeGeoJSONBbox === 'function') {
                    for (let f of theme.features) {
                        if (f && f.geometry) {
                            const b = f.properties?._bbox || computeGeoJSONBbox(f.geometry);
                            if (b) {
                                if (!themeBbox) themeBbox = [...b];
                                else {
                                    themeBbox[0] = Math.min(themeBbox[0], b[0]);
                                    themeBbox[1] = Math.min(themeBbox[1], b[1]);
                                    themeBbox[2] = Math.max(themeBbox[2], b[2]);
                                    themeBbox[3] = Math.max(themeBbox[3], b[3]);
                                }
                            }
                        }
                    }
                    if (themeBbox) theme._bbox = themeBbox;
                }
                if (themeBbox && (themeBbox[2] < west || themeBbox[0] > east || themeBbox[3] < south || themeBbox[1] > north)) {
                    continue; // Pula o tema inteiro instantaneamente em 0.0001ms se fora da mira
                }

                hits = theme.features.filter(f => {
                    if (!f || !f.geometry) return false;
                    let bbox = f.properties && f.properties._bbox;
                    if (!bbox && typeof computeGeoJSONBbox === 'function') {
                        bbox = computeGeoJSONBbox(f.geometry);
                        if (f.properties) f.properties._bbox = bbox;
                    }
                    if (bbox) {
                        return bbox[2] >= west && bbox[0] <= east && bbox[3] >= south && bbox[1] <= north;
                    }
                    if (f.geometry.type === 'Point' && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2) {
                        const cLng = f.geometry.coordinates[0], cLat = f.geometry.coordinates[1];
                        return cLng >= west && cLng <= east && cLat >= south && cLat <= north;
                    }
                    return true;
                });
            }

            if (hits && hits.length > 0) {
                for (let h = 0; h < hits.length; h++) {
                    if (hits[h] && hits[h].geometry) {
                        checkSnapGeometry(hits[h].geometry);
                        if (minVertexDist <= 4) break;
                    }
                }
            }
            if (minVertexDist <= 4) break;
        }
    }

    // Hierarquia de aderência AutoCAD: Vértice > Ponto Médio > Aresta > Livre
    if (bestVertexSnap && minVertexDist <= vertexTolerancePx) {
        return bestVertexSnap;
    }
    if (bestMidpointSnap && minMidpointDist <= midpointTolerancePx) {
        return bestMidpointSnap;
    }
    if (bestEdgeSnap && minEdgeDist <= edgeTolerancePx) {
        return bestEdgeSnap;
    }

    return null;
}

function updateUberLiveCursor(targetLatLng) {
    if (!map || currentMeasurementMode !== 'Marker' || !targetLatLng) {
        hideUberLiveCursor();
        return;
    }
    const pointLabel = String(pointCounter).padStart(2, '0');
    if (!uberLiveCursorMarker) {
        const pointIcon = getTechPointIcon(pointLabel);
        uberLiveCursorMarker = L.marker(targetLatLng, {
            icon: pointIcon,
            interactive: false,
            zIndexOffset: 99999
        }).addTo(map);
        uberLiveCursorMarker._currentLabel = pointLabel;
    } else {
        if (!map.hasLayer(uberLiveCursorMarker)) {
            uberLiveCursorMarker.addTo(map);
        }
        const el = uberLiveCursorMarker.getElement ? uberLiveCursorMarker.getElement() : null;
        if (el && el.style.display === 'none') {
            el.style.display = '';
        }
        if (uberLiveCursorMarker._currentLabel !== pointLabel) {
            uberLiveCursorMarker._currentLabel = pointLabel;
            const pointIcon = getTechPointIcon(pointLabel);
            if (typeof uberLiveCursorMarker.setIcon === 'function') {
                uberLiveCursorMarker.setIcon(pointIcon);
            }
        }
        uberLiveCursorMarker.setLatLng(targetLatLng);
    }
    const el = uberLiveCursorMarker.getElement ? uberLiveCursorMarker.getElement() : null;
    if (el) {
        el.style.pointerEvents = 'none';
    }
}

function hideUberLiveCursor() {
    if (uberLiveCursorMarker) {
        const el = uberLiveCursorMarker.getElement ? uberLiveCursorMarker.getElement() : null;
        if (el) {
            el.style.display = 'none';
        } else if (map && map.hasLayer(uberLiveCursorMarker)) {
            map.removeLayer(uberLiveCursorMarker);
        }
    }
}

function createTechnicalPoint(latlng) {
    if (!map || !latlng) return;
    const pointLabel = String(pointCounter).padStart(2, '0');
    const techIcon = getTechPointIcon(pointLabel);
    const marker = L.marker(latlng, {
        icon: techIcon,
        draggable: true
    });
    // Dispara criação universal no Leaflet/Geoman
    map.fire('pm:create', { shape: 'Marker', layer: marker });
}

function getDestinationLatLng(fromLatLng, toLatLng, distanceMeters) {
    if (!fromLatLng || !toLatLng || !distanceMeters || distanceMeters <= 0) return null;

    if (typeof turf !== 'undefined' && turf.bearing && turf.destination && turf.point) {
        try {
            const p1 = turf.point([fromLatLng.lng, fromLatLng.lat]);
            const p2 = turf.point([toLatLng.lng, toLatLng.lat]);
            const bearing = turf.bearing(p1, p2);
            const dest = turf.destination(p1, distanceMeters / 1000, bearing, { units: 'kilometers' });
            return L.latLng(dest.geometry.coordinates[1], dest.geometry.coordinates[0]);
        } catch (e) {
            console.warn('[CAD Measure] Turf destination fallback to geodesic:', e);
        }
    }

    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const phi1 = fromLatLng.lat * toRad;
    const lambda1 = fromLatLng.lng * toRad;
    const phi2 = toLatLng.lat * toRad;
    const lambda2 = toLatLng.lng * toRad;

    const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
    const bearing = Math.atan2(y, x);

    const R = 6378137; // Earth radius in meters
    const delta = distanceMeters / R;

    const phi3 = Math.asin(
        Math.sin(phi1) * Math.cos(delta) +
        Math.cos(phi1) * Math.sin(delta) * Math.cos(bearing)
    );
    const lambda3 = lambda1 + Math.atan2(
        Math.sin(bearing) * Math.sin(delta) * Math.cos(phi1),
        Math.cos(delta) - Math.sin(phi1) * Math.sin(phi3)
    );

    return L.latLng(phi3 * toDeg, lambda3 * toDeg);
}

function updateCadMeasureHudLive(mouseLatLng) {
    const origin = (activeMeasurePoints && activeMeasurePoints.length > 0)
        ? activeMeasurePoints[activeMeasurePoints.length - 1]
        : lastDrawnVertex;

    if (!origin || !mouseLatLng) {
        const instLive = document.getElementById('meas-cad-dist-live');
        if (instLive) instLive.innerText = '0.00 m';
        return;
    }
    const dist = origin.distanceTo(mouseLatLng);
    if (dist >= 0.2 && !isCadDirectionLocked) {
        cadTargetDirectionLatLng = mouseLatLng;
    }
    const lockedVal = getLockedCadMeasure();
    const hintEl = document.getElementById('cad-hud-hint');
    const instLive = document.getElementById('meas-cad-dist-live');

    let totalDist = dist;
    if (activeMeasurePoints && activeMeasurePoints.length > 1) {
        let acc = 0;
        for (let k = 0; k < activeMeasurePoints.length - 1; k++) {
            acc += activeMeasurePoints[k].distanceTo(activeMeasurePoints[k + 1]);
        }
        totalDist = acc + dist;
    }

    if (lockedVal > 0) {
        if (hintEl) {
            hintEl.innerHTML = `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[8.5px]">Medida Travada: ${lockedVal.toFixed(2)} m</span> Mova o mouse na direção e clique no mapa para fixar`;
        }
        if (instLive) {
            instLive.innerHTML = `<span class="text-emerald-500 font-bold">🔒 ${lockedVal.toFixed(2)} m</span>`;
        }
    } else {
        if (hintEl) {
            const totalMsg = (activeMeasurePoints && activeMeasurePoints.length > 1) ? ` | Total: ${totalDist.toFixed(2)} m` : '';
            hintEl.innerHTML = `<span class="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold text-[8.5px]">Passo 2</span> Aponte a direção <span class="font-mono text-emerald-500 font-bold">(${dist.toFixed(2)} m${totalMsg})</span> ou digite a medida`;
        }
        if (instLive) {
            instLive.innerText = `${dist.toFixed(2)} m`;
        }
    }
}

function showCadMeasureHud(mode) {
    const hud = document.getElementById('cad-measure-hud');
    if (hud) {
        hud.classList.remove('hidden');
        hud.classList.add('flex');
    }
    const modeTag = document.getElementById('cad-hud-mode-tag');
    if (modeTag) {
        modeTag.innerText = mode === 'Polygon' ? 'Área' : 'Linha';
    }
    const hintEl = document.getElementById('cad-hud-hint');
    const inp = document.getElementById('cad-measure-input');
    const applyBtn = document.getElementById('cad-measure-apply-btn');
    const instLive = document.getElementById('meas-cad-dist-live');

    const origin = (activeMeasurePoints && activeMeasurePoints.length > 0)
        ? activeMeasurePoints[activeMeasurePoints.length - 1]
        : lastDrawnVertex;

    if (!origin) {
        if (hintEl) {
            hintEl.innerHTML = `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-bold text-[8.5px]">Passo 1</span> Clique no mapa para marcar o ponto inicial`;
        }
        if (inp) {
            inp.placeholder = 'Aguardando 1º ponto...';
            inp.value = '';
        }
        if (instLive) {
            instLive.innerText = '0.00 m';
        }
        if (applyBtn) {
            applyBtn.title = 'Clique no mapa para marcar o ponto inicial';
        }
    } else {
        const lockedVal = getLockedCadMeasure();
        if (lockedVal > 0) {
            if (hintEl) {
                hintEl.innerHTML = `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[8.5px]">Medida Travada: ${lockedVal.toFixed(2)} m</span> Aponte a direção e clique no mapa para fixar`;
            }
            if (instLive) {
                instLive.innerHTML = `<span class="text-emerald-500 font-bold">🔒 ${lockedVal.toFixed(2)} m</span>`;
            }
        } else {
            if (hintEl) {
                hintEl.innerHTML = `<span class="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold text-[8.5px]">Passo 2</span> Aponte a direção e digite a medida`;
            }
            if (inp && !inp.value) {
                inp.placeholder = 'Ex: 25.00';
            }
            if (instLive && currentMouseLatLng) {
                const dist = origin.distanceTo(currentMouseLatLng);
                instLive.innerText = `${dist.toFixed(2)} m`;
            }
        }
        if (applyBtn) {
            applyBtn.title = 'Inserir segmento na direção do cursor (Enter)';
        }
    }

    bindCadMeasureInputEvents();
}

function bindCadMeasureInputEvents() {
    const inp = document.getElementById('cad-measure-input');
    if (!inp || inp._hasCadInputListener) return;
    inp._hasCadInputListener = true;

    inp.addEventListener('input', () => {
        if (!lastDrawnVertex || activeMeasurePoints.length === 0) return;
        const aim = cadTargetDirectionLatLng || currentMouseLatLng;
        if (aim) {
            updateRubberband(aim);
            updateCadMeasureHudLive(aim);
        }
    });
}

function hideCadMeasureHud() {
    const hud = document.getElementById('cad-measure-hud');
    if (hud) {
        hud.classList.add('hidden');
        hud.classList.remove('flex');
    }
    const inp = document.getElementById('cad-measure-input');
    if (inp) inp.value = '';
    isCadDirectionLocked = false;
    cadTargetDirectionLatLng = null;
}

window.applyCadMeasureInput = function(customVal) {
    if (!lastDrawnVertex) {
        const hintEl = document.getElementById('cad-hud-hint');
        if (hintEl) {
            hintEl.innerHTML = `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-bold text-[8.5px]">Passo 1</span> Clique no mapa primeiro para marcar o ponto inicial!`;
        }
        if (typeof showToast === 'function') {
            showToast("Passo 1: Clique no mapa para marcar o ponto inicial antes de inserir a medida.", "warning");
        }
        return;
    }

    let aimLatLng = cadTargetDirectionLatLng || currentMouseLatLng;
    if (!aimLatLng || (lastDrawnVertex && aimLatLng.distanceTo(lastDrawnVertex) < 0.2)) {
        const hintEl = document.getElementById('cad-hud-hint');
        if (hintEl) {
            hintEl.innerHTML = `<span class="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold text-[8.5px]">Passo 2</span> Aponte o cursor no mapa na direção desejada antes de inserir`;
        }
        if (typeof showToast === 'function') {
            showToast("Passo 2: Aponte o cursor no mapa na direção desejada antes de inserir a medida.", "info");
        }
        return;
    }

    const input = document.getElementById('cad-measure-input');
    const rawVal = customVal !== undefined ? customVal : (input ? input.value : '');
    const cleanStr = String(rawVal).trim().replace(',', '.');
    const distMeters = parseFloat(cleanStr);

    if (isNaN(distMeters) || distMeters <= 0) {
        if (input) {
            input.classList.add('ring-2', 'ring-rose-500');
            setTimeout(() => input.classList.remove('ring-2', 'ring-rose-500'), 1000);
            input.focus();
        }
        if (typeof showToast === 'function') {
            showToast("Digite uma distância válida em metros (ex: 25 ou 35.5).", "warning");
        }
        return;
    }

    const targetLatLng = getDestinationLatLng(lastDrawnVertex, aimLatLng, distMeters);
    if (!targetLatLng) return;

    activeMeasurePoints.push(targetLatLng);
    addActiveAnchorMarker(targetLatLng);
    lastDrawnVertex = targetLatLng;
    isCadDirectionLocked = false;
    cadTargetDirectionLatLng = null;

    if (typeof showToast === 'function') {
        showToast(`Segmento de ${distMeters.toFixed(2)} m inserido com sucesso!`, "success");
    }

    const hintEl = document.getElementById('cad-hud-hint');
    if (hintEl) {
        hintEl.innerHTML = `<span class="text-emerald-500 font-bold">✓ ${distMeters.toFixed(2)} m inseridos!</span> Aponte a próxima direção ou Concluir.`;
    }

    if (activeMeasurePoints.length > 1) {
        if (!committedSegmentsLine) {
            committedSegmentsLine = L.polyline(activeMeasurePoints, {
                color: '#10b981',
                weight: 2.5,
                renderer: getMeasSvgRenderer(),
                interactive: false
            });
            if (activeMeasurePreviewGroup) activeMeasurePreviewGroup.addLayer(committedSegmentsLine);
        } else {
            if (activeMeasurePreviewGroup && !activeMeasurePreviewGroup.hasLayer(committedSegmentsLine)) {
                activeMeasurePreviewGroup.addLayer(committedSegmentsLine);
            }
            committedSegmentsLine.setLatLngs(activeMeasurePoints);
        }
    }

    hideRubberband();

    const instLive = document.getElementById('meas-cad-dist-live');
    if (instLive) {
        instLive.innerText = '0.00 m';
    }

    if (input) {
        input.value = '';
        input.placeholder = 'Próxima medida (m)...';
        input.focus();
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const inp = document.getElementById('cad-measure-input');
        if (inp && inp.value.trim() !== '') {
            e.preventDefault();
            window.applyCadMeasureInput();
            return;
        }
        if (window.isMeasurementActive && (currentMeasurementMode === 'Line' || currentMeasurementMode === 'Polygon')) {
            e.preventDefault();
            window.finishCurrentMeasurementDraw();
            return;
        }
    }
    if (e.key === 'Escape') {
        if (window.isMeasurementActive) {
            stopMeasurementDraw();
            return;
        }
    }
    if (window.isMeasurementActive && (currentMeasurementMode === 'Line' || currentMeasurementMode === 'Polygon') && lastDrawnVertex) {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        const isInputFocused = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
        if (!isInputFocused && ((e.key >= '0' && e.key <= '9') || e.key === '.' || e.key === ',')) {
            isCadDirectionLocked = true;
            const inp = document.getElementById('cad-measure-input');
            if (inp) {
                inp.value = e.key;
                inp.focus();
                e.preventDefault();
            }
        }
    }
});

if (typeof document !== 'undefined') {
    const bindHudHover = () => {
        const hud = document.getElementById('cad-measure-hud');
        if (hud && !hud._hasDirectionLockListener) {
            hud._hasDirectionLockListener = true;
            hud.addEventListener('mouseenter', () => {
                isCadDirectionLocked = true;
            });
            hud.addEventListener('mouseleave', () => {
                const inp = document.getElementById('cad-measure-input');
                if (!inp || (document.activeElement !== inp && !inp.value.trim())) {
                    isCadDirectionLocked = false;
                }
            });
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindHudHover);
    } else {
        bindHudHover();
    }
}

function closeMeasurementPanel() {
    if (typeof window.cancelUberMeasurementPointAdjustment === 'function') {
        window.cancelUberMeasurementPointAdjustment();
    }
    // Ao clicar no ícone "x", limpa todas as medições e encerra a ferramenta
    if (typeof window.clearAllMeasurements === 'function') {
        window.clearAllMeasurements();
    }
    hideCadMeasureHud();
    lastDrawnVertex = null;
    currentMouseLatLng = null;

    if (map && map.doubleClickZoom && typeof map.doubleClickZoom.enable === 'function') {
        map.doubleClickZoom.enable();
    }

    const panel = document.getElementById('measurement-panel');
    if (panel) panel.classList.add('hidden');
    stopMeasurementDraw();
    window.isMeasurementActive = false;
    window.currentMeasurementMode = null;
    currentMeasurementMode = null;



    // Disable pm vertex editing on existing layers while panel is closed
    if (measurementLayerGroup && typeof measurementLayerGroup.eachLayer === 'function') {
        measurementLayerGroup.eachLayer(l => {
            if (l.pm && typeof l.pm.disable === 'function') {
                try { l.pm.disable(); } catch(e) {}
            }
            if (l.dragging && typeof l.dragging.disable === 'function') {
                try { l.dragging.disable(); } catch(e) {}
            }
        });
    }

    // Reativa a interatividade das camadas do tema selecionado
    if (typeof updateThemeInteractivity === 'function') {
        updateThemeInteractivity();
    } else if (typeof window.updateThemeInteractivity === 'function') {
        window.updateThemeInteractivity();
    }

    // Hide drawers and reset button states
    const geoTab = document.getElementById('meas-tab-geometry');
    const coordTab = document.getElementById('meas-tab-coord-query');
    if (geoTab) { geoTab.classList.add('hidden'); geoTab.classList.remove('flex'); }
    if (coordTab) { coordTab.classList.add('hidden'); coordTab.classList.remove('flex'); }
    ['Marker', 'Line', 'Polygon', 'CoordinateQuery'].forEach(m => {
        const btn = document.getElementById('meas-btn-' + m);
        if (btn) {
            btn.classList.remove(
                'bg-emerald-50', 'dark:bg-emerald-900/30', 'text-emerald-600', 'dark:text-emerald-400', 'border-emerald-300/60', 'dark:border-emerald-600/40',
                'bg-blue-50', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400', 'border-blue-300/60', 'dark:border-blue-600/40'
            );
            btn.classList.add('border-transparent');
        }
    });
    
    // Hide Print Viewfinder overlay safely
    const viewfinder = document.getElementById('print-viewfinder');
    if (viewfinder && !viewfinder.classList.contains('hidden') && typeof window.togglePrintViewfinder === 'function') {
        window.togglePrintViewfinder();
    }
}

function resetMeasurementResults() {
    let btn = document.getElementById('btn-save-measurement');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.classList.remove('hover:bg-emerald-600');
    }
}

window.clearAllMeasurements = function() {
    if (typeof window.cancelUberMeasurementPointAdjustment === 'function') {
        window.cancelUberMeasurementPointAdjustment();
    }
    pointCounter = 1; // Reset counter
    window._isHoveringMeasMarker = false;
    window._isDraggingMeasMarker = false;
    window._isAdjustingMeasPointWithReticle = false;
    clearActiveMeasurePreview();

    // 1. Interrompe e cancela imediatamente qualquer desenho ativo no Geoman / Leaflet
    if (map && map.pm) {
        try {
            map.pm.disableDraw();
        } catch(e) {}
    }
    stopMeasurementDraw();

    // 2. Limpa todas as camadas salvas no grupo de medição
    if (measurementLayerGroup && typeof measurementLayerGroup.eachLayer === 'function') {
        measurementLayerGroup.eachLayer(l => {
            if (l.pm && typeof l.pm.disable === 'function') {
                try { l.pm.disable(); } catch(e) {}
            }
            if (l.dragging && typeof l.dragging.disable === 'function') {
                try { l.dragging.disable(); } catch(e) {}
            }
        });
        measurementLayerGroup.clearLayers();
    }

    // 3. Remove marcador de busca de coordenada se existir
    if (typeof coordinateQueryMarker !== 'undefined' && coordinateQueryMarker && map) {
        try { map.removeLayer(coordinateQueryMarker); } catch(e) {}
        coordinateQueryMarker = null;
    }

    // 4. Limpa estados de vértices, mouse e HUDs
    lastDrawnVertex = null;
    currentMouseLatLng = null;
    hideCadMeasureHud();

    // 5. Limpa a lista de feições no painel e reseta instrução
    const list = document.getElementById('meas-features-list');
    if (list) list.innerHTML = '';
    const inst = document.getElementById('meas-instruction');
    if (inst) {
        inst.innerHTML = 'Selecione uma ferramenta para iniciar a medição.';
        inst.classList.remove('hidden');
    }
    resetMeasurementResults();

    // 6. Desmarca os botões da barra vertical para indicar que o desenho parou
    ['Marker', 'Line', 'Polygon', 'CoordinateQuery'].forEach(m => {
        const btn = document.getElementById('meas-btn-' + m);
        if (btn) {
            btn.classList.remove(
                'bg-emerald-50', 'dark:bg-emerald-900/30', 'text-emerald-600', 'dark:text-emerald-400', 'border-emerald-300/60', 'dark:border-emerald-600/40',
                'bg-blue-50', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400', 'border-blue-300/60', 'dark:border-blue-600/40',
                'bg-emerald-100', 'dark:bg-emerald-900/50', 'text-emerald-700', 'bg-blue-100', 'text-blue-700'
            );
            btn.classList.add('border-transparent');
        }
    });
};

window.fitMapToMeasurements = function() {
    if (!measurementLayerGroup || measurementLayerGroup.getLayers().length === 0) {
        if (lastDrawnVertex && map) {
            map.setView(lastDrawnVertex, Math.max(map.getZoom(), 17));
            return;
        }
        if (typeof showToast === 'function') {
            showToast('Nenhuma medição realizada para enquadrar no mapa.', 'info');
        }
        return;
    }
    try {
        const bounds = measurementLayerGroup.getBounds();
        if (bounds && bounds.isValid() && map) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 19 });
        }
    } catch(e) {
        console.warn('Erro ao ajustar mapa às medições:', e);
    }
};

window.finishCurrentMeasurementDraw = function() {
    const drawMode = currentMeasurementMode || cadActiveShape || 'Polygon';
    let pts = (activeMeasurePoints && activeMeasurePoints.length > 0) ? [...activeMeasurePoints] : null;
    const drawInstance = map && map.pm && map.pm.Draw && map.pm.Draw[drawMode];

    if (!pts && drawInstance && drawInstance._layer) {
        const rawPts = drawInstance._layer.getLatLngs();
        pts = Array.isArray(rawPts[0]) ? rawPts[0] : rawPts;
    }

    if (drawMode === 'Polygon') {
        if (pts && pts.length >= 3) {
            const poly = L.polygon(pts, {
                color: '#10b981',
                fillColor: '#10b981',
                fillOpacity: 0.25,
                weight: 2.5
            });
            clearActiveMeasurePreview();
            if (map && map.pm) {
                try { map.pm.disableDraw(); } catch(e) {}
            }
            map.fire('pm:create', { shape: 'Polygon', layer: poly });
        } else {
            if (typeof showToast === 'function') {
                showToast('Adicione pelo menos 3 pontos para formar uma área.', 'warning');
            } else if (typeof alert === 'function') {
                alert('Adicione pelo menos 3 pontos para formar uma área.');
            }
        }
    } else if (drawMode === 'Line') {
        if (pts && pts.length >= 2) {
            const line = L.polyline(pts, {
                color: '#10b981',
                weight: 2.5
            });
            clearActiveMeasurePreview();
            if (map && map.pm) {
                try { map.pm.disableDraw(); } catch(e) {}
            }
            map.fire('pm:create', { shape: 'Line', layer: line });
        } else {
            if (typeof showToast === 'function') {
                showToast('Adicione pelo menos 2 pontos para formar uma linha.', 'warning');
            } else if (typeof alert === 'function') {
                alert('Adicione pelo menos 2 pontos para formar uma linha.');
            }
        }
    } else if (drawInstance && typeof drawInstance._finishShape === 'function') {
        drawInstance._finishShape();
    } else if (map && map.pm) {
        map.pm.disableDraw();
    }
};

window.cancelUberMeasurementPointAdjustment = function() {
    if (typeof window._activePointFinishAdjust === 'function') {
        const fn = window._activePointFinishAdjust;
        window._activePointFinishAdjust = null;
        try { fn(false); } catch(e) {}
    }
    window._isAdjustingMeasPointWithReticle = false;
    window._isDraggingMeasMarker = false;
    window._isHoveringMeasMarker = false;
    const reticleOverlay = document.getElementById('point-adjust-center-reticle');
    if (reticleOverlay) {
        reticleOverlay.classList.add('hidden');
        reticleOverlay.classList.remove('flex');
    }
    const banner = document.getElementById('meas-point-adjust-banner');
    if (banner) banner.classList.add('hidden');
};

function stopMeasurementDraw() {
    if (typeof window.cancelUberMeasurementPointAdjustment === 'function') {
        window.cancelUberMeasurementPointAdjustment();
    }
    window._isHoveringMeasMarker = false;
    window._isDraggingMeasMarker = false;
    window._isAdjustingMeasPointWithReticle = false;
    hideAutoCadSnap();
    hideUberLiveCursor();
    hideCadMeasureHud();
    clearActiveMeasurePreview();
    lastDrawnVertex = null;
    currentMouseLatLng = null;
    cadTargetDirectionLatLng = null;
    isCadDirectionLocked = false;
    currentMeasurementMode = null;
    window.currentMeasurementMode = null;
    window.isMeasurementActive = false;

    if (map && map.pm) {
        try {
            map.pm.disableDraw();
        } catch(e) {}
        if (map.pm.Draw) {
            const shapes = ['Marker', 'CircleMarker', 'Line', 'Polygon', 'Rectangle', 'Circle', 'Cut'];
            shapes.forEach(s => {
                const inst = map.pm.Draw[s];
                if (inst && typeof inst.disable === 'function' && inst.enabled && inst.enabled()) {
                    try { inst.disable(); } catch(e) {}
                }
            });
        }
    }
    if (map && map.doubleClickZoom && typeof map.doubleClickZoom.enable === 'function') {
        map.doubleClickZoom.enable();
    }
    
    // Enable other map interactions
    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.style.cursor = '';

    ['Marker', 'Line', 'Polygon'].forEach(m => {
        const btn = document.getElementById('meas-btn-' + m);
        if (btn) {
            btn.classList.remove(
                'bg-emerald-50', 'dark:bg-emerald-900/30', 'text-emerald-600', 'dark:text-emerald-400', 'border-emerald-300/60', 'dark:border-emerald-600/40'
            );
            btn.classList.add('border-transparent');
        }
    });
}

// --- DRAG LOGIC FOR MEASUREMENT PANEL ---
let isDraggingMeasurement = false;
let dragStartX, dragStartY;
let panelStartLeft, panelStartTop;

function initMeasurementPanelDrag() {
    const header = document.getElementById('measurement-panel-header');
    const panel = document.getElementById('measurement-panel');
    if (!header || !panel) return;

    header.addEventListener('mousedown', (e) => {
        if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
        
        isDraggingMeasurement = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
        // Convert panel positioning to absolute fixed pixels based on current screen position
        const rect = panel.getBoundingClientRect();
        
        // Remove Tailwind centering classes
        panel.classList.remove('bottom-6', 'bottom-8', 'right-4', 'right-6', 'sm:right-6', 'left-1/2', '-translate-x-1/2');
        
        // Apply exact pixel coordinates
        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        
        panelStartLeft = rect.left;
        panelStartTop = rect.top;
        
        // Disable transitions for smooth dragging
        panel.style.transition = 'none';
        
        header.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingMeasurement) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        panel.style.left = (panelStartLeft + dx) + 'px';
        panel.style.top = (panelStartTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDraggingMeasurement) {
            isDraggingMeasurement = false;
            header.style.cursor = 'move';
            // Restore transitions
            panel.style.transition = '';
        }
    });
}

function formatArea(sqMeters) {
    return (sqMeters / 10000).toFixed(4) + ' ha';
}

function startMeasurementDraw(shape) {
    if (typeof window.cancelUberMeasurementPointAdjustment === 'function') {
        window.cancelUberMeasurementPointAdjustment();
    }
    if (!map || !map.pm) return;
    
    const validShapes = ['Marker', 'CircleMarker', 'Line', 'Polygon', 'Rectangle', 'Circle', 'Cut', 'Text'];
    if (!shape || typeof shape !== 'string' || !validShapes.includes(shape)) {
        stopMeasurementDraw();
        currentMeasurementMode = null;
        return;
    }
    
    stopMeasurementDraw();
    currentMeasurementMode = shape;
    window.currentMeasurementMode = shape;
    window.isMeasurementActive = true;
    cadActiveShape = shape;
    lastDrawnVertex = null;
    currentMouseLatLng = null;
    hideCadMeasureHud();
    clearActiveMeasurePreview();

    // Disable pm vertex editing & dragging on existing layers while drawing new shape
    if (measurementLayerGroup && typeof measurementLayerGroup.eachLayer === 'function') {
        measurementLayerGroup.eachLayer(l => {
            if (l.pm && typeof l.pm.disable === 'function') {
                try { l.pm.disable(); } catch(e) {}
            }
            if (l.dragging && typeof l.dragging.disable === 'function') {
                try { l.dragging.disable(); } catch(e) {}
            }
        });
    }

    // Disable doubleClickZoom so double clicking finishes line/polygon without zooming
    if (map.doubleClickZoom && typeof map.doubleClickZoom.disable === 'function') {
        map.doubleClickZoom.disable();
    }

    // Keep active button highlighted
    ['Marker', 'Line', 'Polygon', 'CoordinateQuery'].forEach(m => {
        const btn = document.getElementById('meas-btn-' + m);
        if (btn) {
            if (m === shape) {
                btn.classList.remove('border-transparent');
                btn.classList.add('bg-emerald-50', 'dark:bg-emerald-900/30', 'text-emerald-600', 'dark:text-emerald-400', 'border-emerald-300/60', 'dark:border-emerald-600/40');
            } else {
                btn.classList.remove(
                    'bg-emerald-50', 'dark:bg-emerald-900/30', 'text-emerald-600', 'dark:text-emerald-400', 'border-emerald-300/60', 'dark:border-emerald-600/40',
                    'bg-blue-50', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400', 'border-blue-300/60', 'dark:border-blue-600/40'
                );
                btn.classList.add('border-transparent');
            }
        }
    });
    
    let inst = document.getElementById('meas-instruction');
    if(inst) {
        if (shape === 'Marker') {
            inst.innerHTML = '<span class="text-slate-600 dark:text-slate-300 font-medium">Clique no mapa para inserir pontos consecutivos.<br><span class="text-[9px] text-slate-400">Arraste para mover | Botão direito para excluir.</span></span>';
        } else if (shape === 'Line') {
            inst.innerHTML = '<span class="text-slate-600 dark:text-slate-300 font-medium">Clique no mapa para traçar a linha (clique duplo finaliza).<br><span class="text-[9px] text-slate-400">Aponte o cursor na direção e digite a medida exata (Enter para inserir).<br>Arraste vértices para ajustar | Botão direito no vértice para excluir.</span></span>';
        } else if (shape === 'Polygon') {
            inst.innerHTML = '<span class="text-slate-600 dark:text-slate-300 font-medium">Clique no mapa para traçar a área (clique no 1º ponto ou clique duplo para fechar).<br><span class="text-[9px] text-slate-400">Aponte o cursor na direção e digite a medida exata (Enter para inserir).<br>Arraste vértices para ajustar | Botão direito no vértice para excluir.</span></span>';
        } else {
            inst.innerHTML = '<span class="text-slate-600 dark:text-slate-300 font-medium">Clique no mapa para medir...</span>';
        }
        inst.classList.remove('hidden');
    }

    const snapLayersList = (measurementLayerGroup && measurementLayerGroup.getLayers().length > 0) ? [measurementLayerGroup] : [];

    const drawOptions = {
        snappable: window.isMeasurementSnappingEnabled,
        snapDistance: 15,
        snapLayers: snapLayersList,
        cursorMarker: true,
        allowSelfIntersection: true,
        hintlineStyle: { color: '#10b981', dashArray: '5,5', weight: 2 },
        templineStyle: { color: '#10b981', weight: 2.5 },
        pathOptions: {
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.25,
            weight: 2.5
        }
    };

    if (shape === 'Line' || shape === 'Polygon') {
        drawOptions.finishOn = 'dblclick';
    }

    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.style.cursor = 'crosshair';

    if (shape === 'Marker') {
        drawOptions.continueDrawing = false;
        const pointLabel = String(pointCounter).padStart(2, '0');
        const pointIcon = getTechPointIcon(pointLabel);
        drawOptions.markerStyle = {
            icon: pointIcon
        };
        if (map.pm) {
            try { map.pm.disableDraw(); } catch(e) {}
        }
        if (currentMouseLatLng) {
            updateUberLiveCursor(currentMouseLatLng);
        } else {
            hideUberLiveCursor();
        }
        return;
    }

    hideUberLiveCursor();
    if (map.pm) {
        try { map.pm.disableDraw(); } catch(e) {}
    }

    if (shape === 'Line' || shape === 'Polygon') {
        initMeasurePreviewGroup();
        clearActiveMeasurePreview();
        activeMeasurePoints = [];
        lastDrawnVertex = null;
        cadActiveShape = shape;
        showCadMeasureHud(shape);
    } else {
        hideCadMeasureHud();
    }
}

// Listen for draw events
if (typeof map !== 'undefined' && map && typeof map.on === 'function') {
    setupMeasurementEvents();
} else {
    // If map isn't ready yet, wait for DOMContentLoaded or map init
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(setupMeasurementEvents, 500); // Small delay to ensure map is initialized
    });
}

function handleMapClickCoordinateQuery(latlng) {
    if (!latlng) return;
    const lat = latlng.lat;
    const lng = latlng.lng;

    // Preenche campos DEC
    const decLatInput = document.getElementById('input-coord-dec-lat');
    const decLngInput = document.getElementById('input-coord-dec-lng');
    if (decLatInput) decLatInput.value = lat.toFixed(6);
    if (decLngInput) decLngInput.value = lng.toFixed(6);

    // Preenche campos GMS
    const latAbs = Math.abs(lat);
    const latDeg = Math.floor(latAbs);
    const latMin = Math.floor((latAbs - latDeg) * 60);
    const latSec = ((latAbs - latDeg - latMin / 60) * 3600).toFixed(2);
    const latDir = lat >= 0 ? 'N' : 'S';

    const lngAbs = Math.abs(lng);
    const lngDeg = Math.floor(lngAbs);
    const lngMin = Math.floor((lngAbs - lngDeg) * 60);
    const lngSec = ((lngAbs - lngDeg - lngMin / 60) * 3600).toFixed(2);
    const lngDir = lng >= 0 ? 'E' : 'W';

    if (document.getElementById('input-coord-gms-lat-deg')) document.getElementById('input-coord-gms-lat-deg').value = latDeg;
    if (document.getElementById('input-coord-gms-lat-min')) document.getElementById('input-coord-gms-lat-min').value = latMin;
    if (document.getElementById('input-coord-gms-lat-sec')) document.getElementById('input-coord-gms-lat-sec').value = latSec;
    if (document.getElementById('input-coord-gms-lat-dir')) document.getElementById('input-coord-gms-lat-dir').value = latDir;

    if (document.getElementById('input-coord-gms-lng-deg')) document.getElementById('input-coord-gms-lng-deg').value = lngDeg;
    if (document.getElementById('input-coord-gms-lng-min')) document.getElementById('input-coord-gms-lng-min').value = lngMin;
    if (document.getElementById('input-coord-gms-lng-sec')) document.getElementById('input-coord-gms-lng-sec').value = lngSec;
    if (document.getElementById('input-coord-gms-lng-dir')) document.getElementById('input-coord-gms-lng-dir').value = lngDir;

    // Preenche campos UTM se proj4 disponível
    if (typeof proj4 !== 'undefined') {
        const zone = Math.floor((lng + 180) / 6) + 1;
        const isNorth = lat >= 0;
        const projStr = `+proj=utm +zone=${zone} ${isNorth ? '+north' : '+south'} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
        try {
            const coords = proj4('EPSG:4326', projStr, [lng, lat]);
            if (coords && coords.length >= 2) {
                if (document.getElementById('input-coord-utm-x')) document.getElementById('input-coord-utm-x').value = coords[0].toFixed(2);
                if (document.getElementById('input-coord-utm-y')) document.getElementById('input-coord-utm-y').value = coords[1].toFixed(2);
                if (document.getElementById('input-coord-utm-zone')) document.getElementById('input-coord-utm-zone').value = String(zone);
            }
        } catch(e) {}
    }

    // Executa a localização para exibir o pin e o card de resultado
    if (typeof window.locateCoordinatesOnMap === 'function') {
        window.locateCoordinatesOnMap();
    }
}

function setupMeasurementEvents() {
    if (typeof map === 'undefined' || !map || typeof map.on !== 'function') {
        setTimeout(setupMeasurementEvents, 300);
        return;
    }
    if (window._isMeasurementEventsSetup) return;
    window._isMeasurementEventsSetup = true;

    map.on('pm:drawstart', (e) => {
        if (currentMeasurementMode === 'Line' || currentMeasurementMode === 'Polygon') {
            lastDrawnVertex = null;
            currentMouseLatLng = null;
            cadActiveShape = currentMeasurementMode;
            hideCadMeasureHud();
        }
    });

    map.on('pm:drawend', () => {
        hideCadMeasureHud();
        lastDrawnVertex = null;
    });

    map.on('pm:vertexadded', (e) => {
        if (currentMeasurementMode === 'Line' || currentMeasurementMode === 'Polygon') {
            lastDrawnVertex = e.latlng;
            cadActiveShape = currentMeasurementMode;
            showCadMeasureHud(currentMeasurementMode);
        }
    });

    let measMouseMoveRaf = null;

    map.on('mousemove', (e) => {
        if (!e || !e.latlng) return;
        currentMouseLatLng = e.latlng;

        // Auto-limpeza de guarda de hover caso o mouse não esteja sobre um marcador existente
        if (window._isHoveringMeasMarker && measurementLayerGroup) {
            let isNearMarker = false;
            const mouseScreenPt = (typeof map.latLngToContainerPoint === 'function') ? map.latLngToContainerPoint(e.latlng) : null;
            if (mouseScreenPt) {
                measurementLayerGroup.eachLayer(l => {
                    if (l instanceof L.Marker && typeof l.getLatLng === 'function') {
                        const mPt = map.latLngToContainerPoint(l.getLatLng());
                        if (Math.hypot(mouseScreenPt.x - mPt.x, mouseScreenPt.y - mPt.y) <= 22) {
                            isNearMarker = true;
                        }
                    }
                });
            }
            if (!isNearMarker) {
                window._isHoveringMeasMarker = false;
            }
        }

        if (window._isAdjustingMeasPointWithReticle) {
            hideAutoCadSnap();
            hideUberLiveCursor();
            return;
        }

        if (window.isMeasurementActive && currentMeasurementMode) {
            const processMouseMove = (targetCoord) => {
                const snap = findAutoCadSnap(targetCoord);
                currentSnapResult = snap;
                const effectiveLatLng = snap ? snap.latlng : targetCoord;

                if (snap) {
                    showAutoCadSnap(snap.latlng, snap.type, snap.label);
                } else {
                    hideAutoCadSnap();
                }

                if (currentMeasurementMode === 'Marker') {
                    updateUberLiveCursor(effectiveLatLng);
                }

                if (currentMeasurementMode === 'Line' || currentMeasurementMode === 'Polygon') {
                    if (!isCadDirectionLocked) {
                        cadTargetDirectionLatLng = effectiveLatLng;
                    }

                    // Renderiza rubberband dinâmico a partir dos pontos fixados até o cursor
                    if (activeMeasurePoints.length > 0) {
                        updateRubberband(effectiveLatLng);
                    }

                    if (lastDrawnVertex || activeMeasurePoints.length > 0) {
                        updateCadMeasureHudLive(effectiveLatLng);
                    }
                }
            };

            // No ambiente de teste roda sincrono; no browser usa rAF para fluidez 60fps
            if (typeof requestAnimationFrame !== 'function') {
                processMouseMove(e.latlng);
            } else {
                if (measMouseMoveRaf) return;
                measMouseMoveRaf = requestAnimationFrame(() => {
                    measMouseMoveRaf = null;
                    if (!map || !currentMouseLatLng) return;
                    processMouseMove(currentMouseLatLng);
                });
            }
        } else {
            hideAutoCadSnap();
            hideUberLiveCursor();
        }
    });

    const mapContainer = (map && typeof map.getContainer === 'function') ? map.getContainer() : null;
    if (mapContainer && !mapContainer._hasMeasMouseLeaveListener) {
        mapContainer._hasMeasMouseLeaveListener = true;
        mapContainer.addEventListener('mouseleave', () => {
            hideAutoCadSnap();
            hideUberLiveCursor();
        });
        mapContainer.addEventListener('mouseenter', () => {
            if (window.isMeasurementActive && currentMeasurementMode === 'Marker' && currentMouseLatLng) {
                updateUberLiveCursor(currentMouseLatLng);
            }
        });
    }

    map.on('dblclick', (e) => {
        if (currentMeasurementMode === 'Polygon' || currentMeasurementMode === 'Line') {
            if (e && e.originalEvent) {
                L.DomEvent.stop(e.originalEvent);
            }
            finishCurrentMeasurementDraw();
        }
    });

    map.on('click', (e) => {
        if (!e || !e.latlng) return;

        // Auto-limpeza de guarda de hover se o clique ocorreu fora da área do marcador
        if (window._isHoveringMeasMarker && measurementLayerGroup) {
            let isNearMarker = false;
            const mouseScreenPt = (typeof map.latLngToContainerPoint === 'function') ? map.latLngToContainerPoint(e.latlng) : null;
            if (mouseScreenPt) {
                measurementLayerGroup.eachLayer(l => {
                    if (l instanceof L.Marker && typeof l.getLatLng === 'function') {
                        const mPt = map.latLngToContainerPoint(l.getLatLng());
                        if (Math.hypot(mouseScreenPt.x - mPt.x, mouseScreenPt.y - mPt.y) <= 22) {
                            isNearMarker = true;
                        }
                    }
                });
            }
            if (!isNearMarker) {
                window._isHoveringMeasMarker = false;
            }
        }

        if (window._isHoveringMeasMarker || window._isDraggingMeasMarker) return;
        if (window._isAdjustingMeasPointWithReticle) return;

        // Debounce de cliques duplicados (evita duplo disparo em canvas _fireEvent / DOM bubbling)
        const now = Date.now();
        if (lastClickLatLng && (now - lastClickTimestamp < 120)) {
            const dLat = Math.abs(e.latlng.lat - lastClickLatLng.lat);
            const dLng = Math.abs(e.latlng.lng - lastClickLatLng.lng);
            if (dLat < 0.00001 && dLng < 0.00001) {
                return;
            }
        }
        lastClickTimestamp = now;
        lastClickLatLng = e.latlng;

        // Calcula snap exatamente na coordenada do clique para nunca usar resultado desatualizado
        const snap = findAutoCadSnap(e.latlng);
        currentSnapResult = snap;
        const targetLatLng = snap ? snap.latlng : e.latlng;

        if (snap) {
            e.latlng = targetLatLng;
            if (typeof map.latLngToLayerPoint === 'function') {
                e.layerPoint = map.latLngToLayerPoint(targetLatLng);
            }
            if (typeof map.latLngToContainerPoint === 'function') {
                e.containerPoint = map.latLngToContainerPoint(targetLatLng);
            }
        }

        // Modo Consulta de Coordenadas ("Busca")
        if (currentMeasurementMode === 'CoordinateQuery') {
            handleMapClickCoordinateQuery(targetLatLng);
            return;
        }

        // Modo Ponto ("Marker") - inserção imediata e acompanhamento contínuo
        if (currentMeasurementMode === 'Marker') {
            createTechnicalPoint(targetLatLng);
            hideAutoCadSnap();
            currentSnapResult = null;
            return;
        }

        // Modo Área ("Polygon") ou Linha ("Line"):
        if (currentMeasurementMode === 'Polygon' || currentMeasurementMode === 'Line') {
            // Se for polígono e o usuário clicou no primeiro vértice para fechar:
            if (currentMeasurementMode === 'Polygon' && activeMeasurePoints.length >= 3) {
                const firstPt = activeMeasurePoints[0];
                let isClosing = false;
                if (snap && snap.type === 'close-polygon') {
                    isClosing = true;
                } else if (map && typeof map.latLngToContainerPoint === 'function') {
                    const screenPt = map.latLngToContainerPoint(firstPt);
                    const clickPt = map.latLngToContainerPoint(e.latlng);
                    const distToFirst = Math.hypot(clickPt.x - screenPt.x, clickPt.y - screenPt.y);
                    if (distToFirst <= 26) {
                        isClosing = true;
                    }
                }
                if (isClosing) {
                    finishCurrentMeasurementDraw();
                    return;
                }
            }

            // Verifica se há uma medida digitada travando o comprimento da aresta
            let vertexToCommit = targetLatLng;
            const lockedMeters = getLockedCadMeasure();
            if (lockedMeters && lastDrawnVertex) {
                const lockedDest = getDestinationLatLng(lastDrawnVertex, targetLatLng, lockedMeters);
                if (lockedDest) {
                    vertexToCommit = lockedDest;
                }
                const inp = document.getElementById('cad-measure-input');
                if (inp) {
                    inp.value = '';
                    inp.placeholder = 'Próxima medida (m)...';
                }
                if (typeof showToast === 'function') {
                    showToast(`Aresta de ${lockedMeters.toFixed(2)} m fixada!`, 'success');
                }
            }

            // Adiciona vértice à lista de pontos da geometria
            activeMeasurePoints.push(vertexToCommit);
            addActiveAnchorMarker(vertexToCommit);
            lastDrawnVertex = vertexToCommit;

            // Atualiza linha de segmentos confirmados
            if (activeMeasurePoints.length > 1) {
                if (!committedSegmentsLine) {
                    committedSegmentsLine = L.polyline(activeMeasurePoints, {
                        color: '#10b981',
                        weight: 2.5,
                        renderer: getMeasSvgRenderer(),
                        interactive: false
                    });
                    if (activeMeasurePreviewGroup) activeMeasurePreviewGroup.addLayer(committedSegmentsLine);
                } else {
                    if (activeMeasurePreviewGroup && !activeMeasurePreviewGroup.hasLayer(committedSegmentsLine)) {
                        activeMeasurePreviewGroup.addLayer(committedSegmentsLine);
                    }
                    committedSegmentsLine.setLatLngs(activeMeasurePoints);
                }
            }

            // Oculta rubberband imediatamente para a linha terminar exatamente no vértice fixado
            hideRubberband();

            showCadMeasureHud(currentMeasurementMode);
            const hintEl = document.getElementById('cad-hud-hint');
            if (hintEl) {
                hintEl.innerHTML = `<span class="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold text-[8.5px]">Passo 2</span> Aponte o cursor na direção da próxima aresta ou clique duplo para concluir`;
            }
            const instLive = document.getElementById('meas-cad-dist-live');
            if (instLive) {
                instLive.innerText = '0.00 m';
            }
            return;
        }
    });
    
    map.on('pm:create', (e) => {
        // Se a medição NÃO estiver ativa, ou se estivermos desenhando feição de camada, NÃO interceptar!
        if (!window.isMeasurementActive || !currentMeasurementMode) {
            return;
        }
        if ((typeof editingThemeId !== 'undefined' && editingThemeId) || window.editingThemeId) {
            return;
        }

        hideCadMeasureHud();
        lastDrawnVertex = null;
        const currentShape = currentMeasurementMode || cadActiveShape || e.shape || 'Polygon';
        if (!e.layer) return;
        
        const layer = e.layer;
        
        if (!measurementLayerGroup) {
            measurementLayerGroup = L.featureGroup().addTo(map);
        }
        window.measurementLayerGroup = measurementLayerGroup;
        measurementLayerGroup.addLayer(layer);
        
        const list = document.getElementById('meas-features-list');
        const item = document.createElement('div');
        item.className = 'bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative group text-left';

        // Function to delete this specific layer and its card
        const deleteFeature = () => {
            window._isHoveringMeasMarker = false;
            window._isDraggingMeasMarker = false;
            if (layer.pm && typeof layer.pm.disable === 'function') {
                layer.pm.disable();
            }
            if (measurementLayerGroup) {
                measurementLayerGroup.removeLayer(layer);
            }
            item.remove();
            if (list && list.children.length === 0) {
                resetMeasurementResults();
                const inst = document.getElementById('meas-instruction');
                if (inst) inst.classList.remove('hidden');
            }
        };

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'absolute top-1.5 right-1.5 text-slate-400 hover:text-rose-500 opacity-60 group-hover:opacity-100 transition-opacity p-0.5 rounded cursor-pointer';
        delBtn.innerHTML = '<span class="material-symbols-outlined text-[15px]">close</span>';
        delBtn.title = 'Excluir medição';
        delBtn.onclick = deleteFeature;

        const contentBox = document.createElement('div');
        item.appendChild(contentBox);
        item.appendChild(delBtn);

        try {
            if (currentShape === 'Polygon') {
                const snapLayersList = (measurementLayerGroup && measurementLayerGroup.getLayers().length > 0) ? [measurementLayerGroup] : [];
                // Enable Geoman vertex editing & vertex deletion & whole shape dragging
                if (layer.pm) {
                    layer.pm.enable({
                        allowSelfIntersection: true,
                        preventMarkerRemoval: false,
                        snappable: window.isMeasurementSnappingEnabled,
                        snapLayers: snapLayersList,
                        draggable: true
                    });
                }

                layer.on('click', (ev) => {
                    if (window.isMeasurementActive && (currentMeasurementMode === 'Line' || currentMeasurementMode === 'Polygon' || currentMeasurementMode === 'Marker')) {
                        return;
                    }
                    if (ev) L.DomEvent.stopPropagation(ev);
                    if (layer.pm && !layer.pm.enabled()) {
                        layer.pm.enable({
                            allowSelfIntersection: true,
                            preventMarkerRemoval: false,
                            snappable: window.isMeasurementSnappingEnabled,
                            snapLayers: snapLayersList,
                            draggable: true
                        });
                    }
                });

                layer.bindTooltip('Polígono <span style="font-size:9px;opacity:0.75;">(Arraste vértices / Botão direito no vértice p/ excluir)</span>', { sticky: true });

                const renderPolygon = () => {
                    const geojson = layer.toGeoJSON();
                    const coords = geojson.geometry && geojson.geometry.coordinates && geojson.geometry.coordinates[0];
                    if (!coords || coords.length < 4) {
                        deleteFeature();
                        return;
                    }
                    const area = turf.area(geojson);
                    const perimeter = turf.length(geojson, { units: 'meters' });
                    const centroid = turf.centroid(geojson);
                    const lat = centroid.geometry.coordinates[1];
                    const lng = centroid.geometry.coordinates[0];
                    const decStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                    const dmsStr = typeof formatDMS === 'function' ? formatDMS(lat, lng) : 'N/A';
                    const utmStr = typeof formatUTM === 'function' ? formatUTM(lat, lng) : 'N/A';

                    layer.measurementData = {
                        type: 'Polygon',
                        area: area,
                        perimeter: perimeter,
                        centroid: { lat, lng, dec: decStr, dms: dmsStr, utm: utmStr }
                    };

                    contentBox.innerHTML = `
                        <div class="grid grid-cols-2 gap-x-3 gap-y-2 w-full text-left mt-0.5">
                            <div class="flex flex-col"><span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Área</span><span class="font-mono text-slate-700 dark:text-slate-200 text-xs font-semibold">${area.toFixed(2)} m²</span></div>
                            <div class="flex flex-col"><span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Perímetro</span><span class="font-mono text-slate-700 dark:text-slate-200 text-xs font-semibold">${perimeter.toFixed(2)} m</span></div>
                            <div class="col-span-2 flex flex-col border-t border-slate-100 dark:border-slate-800 pt-1.5 mt-0.5">
                                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Centroide</span>
                                <div class="flex flex-col gap-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                                    <div class="flex items-center gap-1.5"><span class="text-[8px] font-bold text-slate-400 w-6">DEC</span><span>${decStr}</span></div>
                                    <div class="flex items-center gap-1.5"><span class="text-[8px] font-bold text-slate-400 w-6">GMS</span><span>${dmsStr}</span></div>
                                    <div class="flex items-center gap-1.5"><span class="text-[8px] font-bold text-slate-400 w-6">UTM</span><span>${utmStr}</span></div>
                                </div>
                            </div>
                        </div>
                    `;
                };

                renderPolygon();
                layer.on('pm:edit', renderPolygon);
                layer.on('pm:vertexremoved', renderPolygon);
                layer.on('pm:markerdrag', renderPolygon);
                layer.on('pm:markerdragend', renderPolygon);
                layer.on('pm:drag', renderPolygon);
                layer.on('pm:dragend', renderPolygon);

            } else if (currentShape === 'Line') {
                const snapLayersList = (measurementLayerGroup && measurementLayerGroup.getLayers().length > 0) ? [measurementLayerGroup] : [];
                // Enable Geoman vertex editing & vertex deletion & whole shape dragging
                if (layer.pm) {
                    layer.pm.enable({
                        allowSelfIntersection: true,
                        preventMarkerRemoval: false,
                        snappable: window.isMeasurementSnappingEnabled,
                        snapLayers: snapLayersList,
                        draggable: true
                    });
                }

                layer.on('click', (ev) => {
                    if (window.isMeasurementActive && (currentMeasurementMode === 'Line' || currentMeasurementMode === 'Polygon' || currentMeasurementMode === 'Marker')) {
                        return;
                    }
                    if (ev) L.DomEvent.stopPropagation(ev);
                    if (layer.pm && !layer.pm.enabled()) {
                        layer.pm.enable({
                            allowSelfIntersection: true,
                            preventMarkerRemoval: false,
                            snappable: window.isMeasurementSnappingEnabled,
                            snapLayers: snapLayersList,
                            draggable: true
                        });
                    }
                });

                layer.bindTooltip('Linha <span style="font-size:9px;opacity:0.75;">(Arraste vértices / Botão direito no vértice p/ excluir)</span>', { sticky: true });

                const renderLine = () => {
                    const geojson = layer.toGeoJSON();
                    const coords = geojson.geometry && geojson.geometry.coordinates;
                    if (!coords || coords.length < 2) {
                        deleteFeature();
                        return;
                    }
                    const length = turf.length(geojson, { units: 'meters' });
                    const centroid = turf.centroid(geojson);
                    const lat = centroid.geometry.coordinates[1];
                    const lng = centroid.geometry.coordinates[0];
                    const decStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                    const dmsStr = typeof formatDMS === 'function' ? formatDMS(lat, lng) : 'N/A';
                    const utmStr = typeof formatUTM === 'function' ? formatUTM(lat, lng) : 'N/A';

                    layer.measurementData = {
                        type: 'Line',
                        length: length,
                        centroid: { lat, lng, dec: decStr, dms: dmsStr, utm: utmStr }
                    };

                    contentBox.innerHTML = `
                        <div class="grid grid-cols-1 gap-y-2 w-full text-left mt-0.5">
                            <div class="flex flex-col"><span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Comprimento</span><span class="font-mono text-slate-700 dark:text-slate-200 text-sm font-semibold">${length.toFixed(2)} m</span></div>
                            <div class="flex flex-col border-t border-slate-100 dark:border-slate-800 pt-1.5 mt-0.5">
                                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Centroide</span>
                                <div class="flex flex-col gap-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                                    <div class="flex items-center gap-1.5"><span class="text-[8px] font-bold text-slate-400 w-6">DEC</span><span>${decStr}</span></div>
                                    <div class="flex items-center gap-1.5"><span class="text-[8px] font-bold text-slate-400 w-6">GMS</span><span>${dmsStr}</span></div>
                                    <div class="flex items-center gap-1.5"><span class="text-[8px] font-bold text-slate-400 w-6">UTM</span><span>${utmStr}</span></div>
                                </div>
                            </div>
                        </div>
                    `;
                };

                renderLine();
                layer.on('pm:edit', renderLine);
                layer.on('pm:vertexremoved', renderLine);
                layer.on('pm:markerdrag', renderLine);
                layer.on('pm:markerdragend', renderLine);
                layer.on('pm:drag', renderLine);
                layer.on('pm:dragend', renderLine);

            } else if (currentShape === 'Marker') {
                const pointLabel = String(pointCounter).padStart(2, '0');
                pointCounter++;

                const techIcon = getTechPointIcon(pointLabel);
                layer.setIcon(techIcon);

                const snapLayersList = (measurementLayerGroup && measurementLayerGroup.getLayers().length > 0) ? [measurementLayerGroup] : [];

                if (layer.pm && typeof layer.pm.disable === 'function') {
                    layer.pm.disable();
                }

                // Handlers for clean hover and drag WITHOUT popup or ghost live cursor
                layer.on('mouseover', () => {
                    if (currentMeasurementMode === 'Marker') {
                        window._isHoveringMeasMarker = true;
                        hideUberLiveCursor();
                        hideAutoCadSnap();
                        if (layer._icon) {
                            layer._icon.style.cursor = 'grab';
                        }
                    }
                });

                layer.on('mouseout', () => {
                    window._isHoveringMeasMarker = false;
                    if (window.isMeasurementActive && currentMeasurementMode === 'Marker' && !window._isDraggingMeasMarker && currentMouseLatLng) {
                        updateUberLiveCursor(currentMouseLatLng);
                    }
                });

                // Right-click on marker deletes it directly
                layer.on('contextmenu', (ev) => {
                    if (ev) L.DomEvent.stop(ev);
                    deleteFeature();
                });

                const pos = layer.getLatLng();
                const initLat = pos.lat;
                const initLng = pos.lng;
                const initDec = `${initLat.toFixed(6)}, ${initLng.toFixed(6)}`;
                const initDms = typeof formatDMS === 'function' ? formatDMS(initLat, initLng) : 'N/A';
                const initUtm = typeof formatUTM === 'function' ? formatUTM(initLat, initLng) : 'N/A';

                layer.measurementData = {
                    type: 'Point',
                    id: `P${pointLabel}`,
                    label: `P${pointLabel}`,
                    lat: initLat,
                    lng: initLng,
                    utm: initUtm
                };

                const renderMarker = () => {
                    const curPos = layer.getLatLng();
                    const curLat = curPos.lat;
                    const curLng = curPos.lng;
                    const curDec = `${curLat.toFixed(6)}, ${curLng.toFixed(6)}`;
                    const curDms = typeof formatDMS === 'function' ? formatDMS(curLat, curLng) : 'N/A';
                    const curUtm = typeof formatUTM === 'function' ? formatUTM(curLat, curLng) : 'N/A';

                    layer.measurementData.lat = curLat;
                    layer.measurementData.lng = curLng;
                    layer.measurementData.dec = curDec;
                    layer.measurementData.dms = curDms;
                    layer.measurementData.utm = curUtm;

                    contentBox.innerHTML = `
                        <div class="flex flex-col w-full text-left mt-0.5">
                            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ponto Técnico (P${pointLabel})</span>
                            <div class="flex flex-col gap-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                                <div class="flex items-center gap-1.5"><span class="text-[8px] font-bold text-slate-400 w-6">DEC</span><span>${curDec}</span></div>
                                <div class="flex items-center gap-1.5"><span class="text-[8px] font-bold text-slate-400 w-6">GMS</span><span>${curDms}</span></div>
                                <div class="flex items-center gap-1.5"><span class="text-[8px] font-bold text-slate-400 w-6">UTM</span><span>${curUtm}</span></div>
                            </div>
                        </div>
                    `;
                };

                // Native Leaflet drag handling
                if (layer.dragging && typeof layer.dragging.enable === 'function') {
                    layer.dragging.enable();
                }

                layer.on('dragstart', () => {
                    window._isDraggingMeasMarker = true;
                    hideUberLiveCursor();
                    hideAutoCadSnap();
                    if (layer._icon) {
                        layer._icon.style.cursor = 'grabbing';
                        layer._icon.classList.add('meas-marker-dragging');
                    }
                });

                layer.on('drag', () => {
                    hideUberLiveCursor();
                    renderMarker();
                });

                layer.on('dragend', () => {
                    window._isDraggingMeasMarker = false;
                    window._isHoveringMeasMarker = false;
                    if (layer._icon) {
                        layer._icon.style.cursor = 'grab';
                        layer._icon.classList.remove('meas-marker-dragging');
                    }
                    renderMarker();
                });

                layer.on('pm:dragend', renderMarker);

                // Evita que o clique sobre marcador existente dispare novo ponto no mapa
                layer.on('mousedown', () => {
                    if (currentMeasurementMode === 'Marker') {
                        hideUberLiveCursor();
                    }
                });

                layer.on('click', (ev) => {
                    if (currentMeasurementMode === 'Marker') {
                        if (ev) L.DomEvent.stopPropagation(ev);
                        hideUberLiveCursor();
                    }
                });

                renderMarker();
            }

            if (list) {
                list.appendChild(item);
                list.scrollTop = list.scrollHeight;
            }

            const saveBtn = document.getElementById('btn-save-measurement');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                saveBtn.classList.add('hover:bg-emerald-600');
            }

        } catch (err) {
            console.error("Erro ao calcular medição", err);
        }

        // CONTINUOUS DRAWING FOR MARKER VS STOP FOR LINE/POLYGON
        if (currentMeasurementMode === 'Marker') {
            // Suporte a inserção contínua de pontos técnicos (P01, P02...) via startMeasurementDraw('Marker')
            if (currentMouseLatLng) {
                updateUberLiveCursor(currentMouseLatLng);
            }
        } else {
            // For Line and Polygon, stop draw mode after completing so user can immediately adjust vertices
            stopMeasurementDraw();
        }
    });
}

let reportMapInstance = null;

function saveMeasurementPDF() {
    if (!measurementLayerGroup || measurementLayerGroup.getLayers().length === 0) {
        alert("Nenhuma medição para gerar relatório.");
        return;
    }

    const btn = document.getElementById('btn-save-measurement');
    const originalText = btn ? btn.innerHTML : 'Relatório';
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">refresh</span> Gerando...';
    
    // Obter usuário e foto
    let userName = 'Usuário Logado';
    let userPhoto = 'assets/logo.png';
    const profileNameEl = document.getElementById('header-user-display-name');
    if (profileNameEl && profileNameEl.innerText.trim() !== '') {
        userName = profileNameEl.innerText;
    }
    
    const profileImgEl = document.querySelector('.profile-avatar-img');
    if (profileImgEl && profileImgEl.src) {
        userPhoto = profileImgEl.src;
    }

    // Processar geometrias e Tabela
    let totalArea = 0;
    let totalPerim = 0;
    let totalDist = 0;
    let pointCount = 1;
    let features = [];

    // Obter nome da entidade do usuário logado (ex: MPF, Prefeitura Municipal, etc.)
    let userEnte = '';
    const headerEntEl = document.getElementById('header-user-display-entidade');
    if (headerEntEl && headerEntEl.textContent.trim()) {
        userEnte = headerEntEl.textContent.trim();
    } else if (window.currentUserEntidade) {
        userEnte = window.currentUserEntidade;
    } else if (window.currentUserProfile && (window.currentUserProfile.entidade || window.currentUserProfile.entidade_nome)) {
        userEnte = window.currentUserProfile.entidade || window.currentUserProfile.entidade_nome;
    } else {
        const entEl = document.getElementById('profile-user-entidade');
        if (entEl && entEl.textContent.trim()) {
            userEnte = entEl.textContent.trim();
        }
    }
    const entidadeName = userEnte || 'Prefeitura Municipal';

    measurementLayerGroup.eachLayer(layer => {
        const geojson = layer.toGeoJSON();
        if (layer.measurementData) {
            geojson.properties = {
                ...(geojson.properties || {}),
                ...layer.measurementData
            };
        }
        features.push(geojson);
    });

    // Coleta camadas vetoriais EXCLUSIVAMENTE do PROJETO ATIVO exibidas no menu lateral
    let activeThemes = [];
    const themesContainer = document.getElementById('themes-container');
    if (themesContainer) {
        const renderedCards = themesContainer.querySelectorAll('.theme-card');
        if (renderedCards && renderedCards.length > 0) {
            const renderedIds = Array.from(renderedCards).map(c => String(c.dataset.id || c.id.replace('theme-card-', '')));
            activeThemes = (window.themes || []).filter(t => renderedIds.includes(String(t.id)));
        }
    }
    if (activeThemes.length === 0) {
        if (typeof window.isThemeInWorkspace === 'function' || (Array.isArray(window.activeWorkspaceThemes) && window.activeWorkspaceThemes.length > 0)) {
            activeThemes = (window.themes || []).filter(t => {
                if (typeof userCanOnTheme === 'function' && !userCanOnTheme(t.id, 'ver')) return false;
                return typeof window.isThemeInWorkspace === 'function' 
                    ? window.isThemeInWorkspace(t.id) 
                    : (window.activeWorkspaceThemes || []).some(x => String(x) === String(t.id));
            });
        }
    }
    if (activeThemes.length === 0) {
        activeThemes = window.themes || [];
    }

    const camadasVetoriais = activeThemes.map(t => {
        let featList = [];
        if (Array.isArray(t.features) && t.features.length > 0) {
            featList = t.features;
        } else if (t.layer && typeof t.layer.toGeoJSON === 'function') {
            try {
                const gj = t.layer.toGeoJSON();
                featList = gj.features || (gj.type === 'Feature' ? [gj] : []);
            } catch (e) {}
        }
        return {
            id: t.id,
            nome: t.name || t.nome || 'Camada Vetorial',
            cor: t.color || t.cor || '#3b82f6',
            visivel: t.visible !== false,
            features: featList
        };
    });

    const reportData = {
        userName: userName,
        userPhoto: userPhoto,
        entidadeName: entidadeName,
        features: features,
        camadasVetoriais: camadasVetoriais,
        ortofotos: (window.rasterLayers || []).map(r => ({ 
            id: r.id, 
            nome: r.nome, 
            url: r.url_imagem,
            tipo: r.tipo,
            bbox: r.bbox,
            zoom_min: r.zoom_min,
            zoom_max: r.zoom_max,
            visivel: !!r.visivel
        }))
    };

    // Compartilha objeto completo diretamente na memória (sem limite de 5MB do localStorage)
    window._measurementReportData = reportData;

    // Salva versão leve no localStorage (apenas medições e metadados básicos das camadas)
    try {
        const lightweightData = {
            ...reportData,
            camadasVetoriais: (reportData.camadasVetoriais || []).map(cv => ({
                id: cv.id,
                nome: cv.nome,
                cor: cv.cor,
                visivel: cv.visivel,
                features: []
            }))
        };
        localStorage.setItem('measurement_report_data', JSON.stringify(lightweightData));
    } catch(eQuota) {
        // Fallback silencioso: relatorio.html carregará diretamente de window.opener._measurementReportData
        try {
            const minData = {
                userName: reportData.userName,
                entidadeName: reportData.entidadeName,
                features: reportData.features || []
            };
            localStorage.setItem('measurement_report_data', JSON.stringify(minData));
        } catch(eFatal) {}
    }
    
    if (btn) btn.innerHTML = originalText;
    
    // Fechar o modal de visualização (se existir)
    const modal = document.getElementById('measurement-report-modal');
    if (modal) modal.classList.add('hidden');
    
    // Abrir a nova página independente
    window.open('relatorio.html', '_blank');
}

// =========================================================================
// === CONSULTA E LOCALIZAÇÃO DE COORDENADAS (DEC, GMS, UTM) ================
// =========================================================================

let coordinateQueryMarker = null;
let coordinateQueryActiveTab = 'DEC';
let isCoordQueryDragInitialized = false;

window.openCoordinateQueryPanel = function() {
    const measPanel = document.getElementById('measurement-panel');
    if (measPanel && measPanel.classList.contains('hidden')) {
        measPanel.classList.remove('hidden');
    }

    if (typeof window.switchMeasurementMode === 'function') {
        const coordTab = document.getElementById('meas-tab-coord-query');
        if (!coordTab || coordTab.classList.contains('hidden')) {
            window.switchMeasurementMode('CoordinateQuery');
        }
    } else {
        const coordTab = document.getElementById('meas-tab-coord-query');
        if (coordTab) {
            coordTab.classList.remove('hidden');
            coordTab.classList.add('flex');
        }
    }

    const panel = document.getElementById('coordinate-query-panel');
    if (panel) panel.classList.remove('hidden');
    
    if (!isCoordQueryDragInitialized) {
        initCoordinateQueryPanelDrag();
        isCoordQueryDragInitialized = true;
    }

    // Foca no primeiro campo do formulário ativo
    setTimeout(() => {
        const firstInput = document.getElementById('input-coord-dec-lat');
        if (firstInput) firstInput.focus();
    }, 100);
};

window.closeCoordinateQueryPanel = function() {
    // 1. Remove marcador do mapa
    if (coordinateQueryMarker && typeof map !== 'undefined' && map) {
        map.removeLayer(coordinateQueryMarker);
        coordinateQueryMarker = null;
    }

    // 2. Limpa dados em memória e campos digitados
    if (typeof window.clearQueriedCoordinates === 'function') {
        window.clearQueriedCoordinates();
    }

    // 3. Oculta enquadramento A4 se estiver visível
    const viewfinder = document.getElementById('print-viewfinder');
    if (viewfinder && !viewfinder.classList.contains('hidden')) {
        if (typeof window.togglePrintViewfinder === 'function') {
            window.togglePrintViewfinder();
        }
    }

    // 4. Oculta o painel e a aba de busca
    const panel = document.getElementById('coordinate-query-panel');
    if (panel) panel.classList.add('hidden');
    const coordTab = document.getElementById('meas-tab-coord-query');
    if (coordTab) {
        coordTab.classList.add('hidden');
        coordTab.classList.remove('flex');
    }
    const btn = document.getElementById('meas-btn-CoordinateQuery');
    if (btn) {
        btn.classList.remove(
            'bg-blue-50', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400', 'border-blue-300/60', 'dark:border-blue-600/40',
            'bg-blue-100', 'text-blue-700'
        );
        btn.classList.add('border-transparent');
    }
};

window.switchCoordinateQueryTab = function(tab) {
    coordinateQueryActiveTab = tab;
    
    const tabs = ['dec', 'gms', 'utm'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-coord-${t}`);
        const form = document.getElementById(`form-coord-${t}`);
        const isSelected = t.toUpperCase() === tab;
        
        if (btn) {
            if (isSelected) {
                btn.className = "flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs";
            } else {
                btn.className = "flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all flex items-center justify-center gap-1 cursor-pointer";
            }
        }
        
        if (form) {
            if (isSelected) {
                form.classList.remove('hidden');
            } else {
                form.classList.add('hidden');
            }
        }
    });

    const errBox = document.getElementById('coord-query-error');
    if (errBox) errBox.classList.add('hidden');
};

// Detecção inteligente ao colar "Lat, Lng" ou "Lat Lng" no campo Decimal
window.handleDecInputAutoSplit = function(e) {
    const val = (e.target.value || '').trim();
    if (!val) return;

    // Detecta se contém separador de coordenadas (vírgula, ponto e vírgula, barra ou espaço amplo)
    const parts = val.split(/[,;\/\s]+/).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
        const latCandidate = parseFloat(parts[0].replace(',', '.'));
        const lngCandidate = parseFloat(parts[1].replace(',', '.'));
        if (!isNaN(latCandidate) && !isNaN(lngCandidate)) {
            const latInput = document.getElementById('input-coord-dec-lat');
            const lngInput = document.getElementById('input-coord-dec-lng');
            if (latInput) latInput.value = parts[0];
            if (lngInput) lngInput.value = parts[1];
        }
    }
};

// Parser inteligente para GMS ao colar texto completo (ex: 7° 1' 10" S, 34° 49' 57" W)
window.handleGmsPasteAutoFill = function(e) {
    const raw = (e.target.value || '').trim();
    if (!raw) return;

    // Regex para extrair números e hemisférios
    // Ex: 7° 1' 10.5" S, 34° 49' 57.2" W  ou  07 01 10 S 34 49 57 W
    const matches = raw.match(/(\d+(?:[.,]\d+)?)[^\dNSWEOL]*(\d+(?:[.,]\d+)?)[^\dNSWEOL]*(\d+(?:[.,]\d+)?)[^\dNSWEOL]*([NSWEOLnsweol])/g);
    
    if (matches && matches.length >= 2) {
        const parseDmsPart = (str) => {
            const numMatches = str.match(/\d+(?:[.,]\d+)?/g);
            const dirMatch = str.match(/[NSWEOLnsweol]/i);
            return {
                deg: numMatches && numMatches[0] ? numMatches[0] : '',
                min: numMatches && numMatches[1] ? numMatches[1] : '0',
                sec: numMatches && numMatches[2] ? numMatches[2].replace(',', '.') : '0',
                dir: dirMatch ? dirMatch[0].toUpperCase().replace('O', 'W').replace('L', 'E') : 'S'
            };
        };

        const pLat = parseDmsPart(matches[0]);
        const pLng = parseDmsPart(matches[1]);

        // Preenche os campos estruturados de Latitude
        const latDeg = document.getElementById('input-coord-gms-lat-deg');
        const latMin = document.getElementById('input-coord-gms-lat-min');
        const latSec = document.getElementById('input-coord-gms-lat-sec');
        const latDir = document.getElementById('input-coord-gms-lat-dir');

        if (latDeg) latDeg.value = pLat.deg;
        if (latMin) latMin.value = pLat.min;
        if (latSec) latSec.value = pLat.sec;
        if (latDir) latDir.value = pLat.dir === 'N' ? 'N' : 'S';

        // Preenche os campos estruturados de Longitude
        const lngDeg = document.getElementById('input-coord-gms-lng-deg');
        const lngMin = document.getElementById('input-coord-gms-lng-min');
        const lngSec = document.getElementById('input-coord-gms-lng-sec');
        const lngDir = document.getElementById('input-coord-gms-lng-dir');

        if (lngDeg) lngDeg.value = pLng.deg;
        if (lngMin) lngMin.value = pLng.min;
        if (lngSec) lngSec.value = pLng.sec;
        if (lngDir) lngDir.value = pLng.dir === 'E' ? 'E' : 'W';
    }
};

// Conversão precisa de UTM para WGS84 (Lat, Lng)
function convertUtmToLatLng(x, y, zone, isSouth = true) {
    if (typeof proj4 !== 'undefined') {
        const hem = isSouth ? '+south' : '+north';
        const projStr = `+proj=utm +zone=${zone} ${hem} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
        try {
            const coords = proj4(projStr, 'EPSG:4326', [x, y]);
            const lng = coords[0];
            const lat = coords[1];
            if (isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return { lat, lng };
            }
        } catch (err) {
            console.warn("Aviso ao converter com Proj4:", err);
        }
    }

    // Fallback padrão geodésico Transverse Mercator (WGS84)
    const a = 6378137.0; // semi-eixo maior WGS84
    const f = 1 / 298.257223563; // achatamento
    const b = a * (1 - f);
    const e = Math.sqrt(1 - (b * b) / (a * a));
    const ePrimeSquared = (e * e) / (1 - (e * e));
    const k0 = 0.9996;

    const utmX = x - 500000.0;
    const utmY = isSouth ? y - 10000000.0 : y;

    const m = utmY / k0;
    const mu = m / (a * (1 - (e * e) / 4 - 3 * (e * e * e * e) / 64 - 5 * (e * e * e * e * e * e) / 256));

    const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
    const j1 = 3 * e1 / 2 - 27 * (e1 * e1 * e1) / 32;
    const j2 = 21 * (e1 * e1) / 16 - 55 * (e1 * e1 * e1 * e1) / 32;
    const j3 = 151 * (e1 * e1 * e1) / 96;

    const fp = mu + j1 * Math.sin(2 * mu) + j2 * Math.sin(4 * mu) + j3 * Math.sin(6 * mu);

    const c1 = ePrimeSquared * Math.cos(fp) * Math.cos(fp);
    const t1 = Math.tan(fp) * Math.tan(fp);
    const r1 = a * (1 - e * e) / Math.pow(1 - e * e * Math.sin(fp) * Math.sin(fp), 1.5);
    const n1 = a / Math.sqrt(1 - e * e * Math.sin(fp) * Math.sin(fp));
    const d = utmX / (n1 * k0);

    const latRad = fp - (n1 * Math.tan(fp) / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ePrimeSquared) * Math.pow(d, 4) / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ePrimeSquared - 3 * c1 * c1) * Math.pow(d, 6) / 720);
    const centralMeridian = (zone - 1) * 6 - 180 + 3;
    const lngRad = (d - (1 + 2 * t1 + c1) * Math.pow(d, 3) / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ePrimeSquared + 24 * t1 * t1) * Math.pow(d, 5) / 120) / Math.cos(fp);

    return {
        lat: latRad * (180 / Math.PI),
        lng: centralMeridian + lngRad * (180 / Math.PI)
    };
}

// Localizar coordenadas informadas no mapa
window.locateCoordinatesOnMap = function() {
    const errBox = document.getElementById('coord-query-error');
    const resultBox = document.getElementById('coord-query-result-box');
    
    if (errBox) {
        errBox.classList.add('hidden');
        errBox.textContent = '';
    }

    const showError = (msg) => {
        if (errBox) {
            errBox.textContent = msg;
            errBox.classList.remove('hidden');
        }
        if (resultBox) resultBox.classList.add('hidden');
    };

    let lat = null;
    let lng = null;

    if (coordinateQueryActiveTab === 'DEC') {
        const rawLat = (document.getElementById('input-coord-dec-lat')?.value || '').trim().replace(',', '.');
        const rawLng = (document.getElementById('input-coord-dec-lng')?.value || '').trim().replace(',', '.');

        if (!rawLat || !rawLng) {
            return showError("Por favor, preencha Latitude e Longitude.");
        }

        lat = parseFloat(rawLat);
        lng = parseFloat(rawLng);

        if (isNaN(lat) || isNaN(lng)) {
            return showError("Valores numéricos inválidos em Latitude ou Longitude.");
        }
    } else if (coordinateQueryActiveTab === 'GMS') {
        const latDeg = parseFloat(document.getElementById('input-coord-gms-lat-deg')?.value || '');
        const latMin = parseFloat(document.getElementById('input-coord-gms-lat-min')?.value || '0');
        const latSec = parseFloat(String(document.getElementById('input-coord-gms-lat-sec')?.value || '0').replace(',', '.'));
        const latDir = (document.getElementById('input-coord-gms-lat-dir')?.value || 'S').toUpperCase();

        const lngDeg = parseFloat(document.getElementById('input-coord-gms-lng-deg')?.value || '');
        const lngMin = parseFloat(document.getElementById('input-coord-gms-lng-min')?.value || '0');
        const lngSec = parseFloat(String(document.getElementById('input-coord-gms-lng-sec')?.value || '0').replace(',', '.'));
        const lngDir = (document.getElementById('input-coord-gms-lng-dir')?.value || 'W').toUpperCase();

        if (isNaN(latDeg) || isNaN(lngDeg)) {
            return showError("Preencha ao menos os Graus (°) da Latitude e Longitude.");
        }

        lat = latDeg + (latMin / 60) + (latSec / 3600);
        if (latDir === 'S') lat = -lat;

        lng = lngDeg + (lngMin / 60) + (lngSec / 3600);
        if (lngDir === 'W' || lngDir === 'O') lng = -lng;

    } else if (coordinateQueryActiveTab === 'UTM') {
        const rawX = (document.getElementById('input-coord-utm-x')?.value || '').trim().replace(',', '.');
        const rawY = (document.getElementById('input-coord-utm-y')?.value || '').trim().replace(',', '.');
        const zone = parseInt(document.getElementById('input-coord-utm-zone')?.value || '25', 10);

        if (!rawX || !rawY) {
            return showError("Por favor, preencha as Coordenadas X (Este) e Y (Norte).");
        }

        const x = parseFloat(rawX);
        const y = parseFloat(rawY);

        if (isNaN(x) || isNaN(y)) {
            return showError("Valores numéricos inválidos para UTM X ou Y.");
        }

        const converted = convertUtmToLatLng(x, y, zone, true);
        lat = converted.lat;
        lng = converted.lng;
    }

    if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return showError("Coordenadas fora dos limites geográficos válidos do planeta.");
    }

    // Calcula strings representativas nos 3 formatos
    const decStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    const dmsStr = typeof formatDMS === 'function' ? formatDMS(lat, lng) : (window.formatDMS ? window.formatDMS(lat, lng) : 'N/A');
    const utmStr = typeof formatUTM === 'function' ? formatUTM(lat, lng) : (window.formatUTM ? window.formatUTM(lat, lng) : 'N/A');

    // Salva em cache global para cópia
    window.lastQueriedCoords = {
        lat, lng, decStr, dmsStr, utmStr
    };

    // Atualiza o card de resultado no painel
    const decEl = document.getElementById('res-coord-dec');
    const gmsEl = document.getElementById('res-coord-gms');
    const utmEl = document.getElementById('res-coord-utm');

    if (decEl) decEl.textContent = decStr;
    if (gmsEl) gmsEl.textContent = dmsStr;
    if (utmEl) utmEl.textContent = utmStr;

    if (resultBox) resultBox.classList.remove('hidden');

    // Adiciona ou reposiciona o marcador no mapa
    if (typeof map !== 'undefined' && map) {
        if (coordinateQueryMarker) {
            map.removeLayer(coordinateQueryMarker);
            coordinateQueryMarker = null;
        }

        const queryMarkerIcon = L.divIcon({
            className: 'custom-query-coord-marker',
            html: `
                <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
                    <div style="position: absolute; width: 38px; height: 38px; border-radius: 50%; background: rgba(16, 185, 129, 0.4); animation: coord-pulse-ring 1.6s infinite ease-out;"></div>
                    <div style="width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: 3px solid #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; color: white;">
                        <span class="material-symbols-outlined" style="font-size: 19px; font-weight: bold; line-height: 1;">pin_drop</span>
                    </div>
                </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -20]
        });

        coordinateQueryMarker = L.marker([lat, lng], { icon: queryMarkerIcon }).addTo(map);
        window.coordinateQueryMarker = coordinateQueryMarker;

        // Navega suavemente até o ponto com zoom aproximado
        map.flyTo([lat, lng], 18, { duration: 1.2 });
    }
};

// Limpar campos e marcador do mapa
window.clearQueriedCoordinates = function() {
    // Limpa inputs DEC
    const decLat = document.getElementById('input-coord-dec-lat');
    const decLng = document.getElementById('input-coord-dec-lng');
    if (decLat) decLat.value = '';
    if (decLng) decLng.value = '';

    // Limpa inputs GMS
    const gmsPaste = document.getElementById('input-coord-gms-paste');
    const gmsLatDeg = document.getElementById('input-coord-gms-lat-deg');
    const gmsLatMin = document.getElementById('input-coord-gms-lat-min');
    const gmsLatSec = document.getElementById('input-coord-gms-lat-sec');
    const gmsLngDeg = document.getElementById('input-coord-gms-lng-deg');
    const gmsLngMin = document.getElementById('input-coord-gms-lng-min');
    const gmsLngSec = document.getElementById('input-coord-gms-lng-sec');

    if (gmsPaste) gmsPaste.value = '';
    if (gmsLatDeg) gmsLatDeg.value = '';
    if (gmsLatMin) gmsLatMin.value = '';
    if (gmsLatSec) gmsLatSec.value = '';
    if (gmsLngDeg) gmsLngDeg.value = '';
    if (gmsLngMin) gmsLngMin.value = '';
    if (gmsLngSec) gmsLngSec.value = '';

    // Limpa inputs UTM
    const utmX = document.getElementById('input-coord-utm-x');
    const utmY = document.getElementById('input-coord-utm-y');
    if (utmX) utmX.value = '';
    if (utmY) utmY.value = '';

    // Remove marcador
    if (coordinateQueryMarker && typeof map !== 'undefined' && map) {
        map.removeLayer(coordinateQueryMarker);
        coordinateQueryMarker = null;
    }

    // Oculta resultado e erro
    const errBox = document.getElementById('coord-query-error');
    const resultBox = document.getElementById('coord-query-result-box');
    if (errBox) errBox.classList.add('hidden');
    if (resultBox) resultBox.classList.add('hidden');

    window.lastQueriedCoords = null;
};

// Copiar coordenadas para a área de transferência
window.copyQueriedCoordinates = function() {
    if (!window.lastQueriedCoords) return;
    const { decStr, dmsStr, utmStr } = window.lastQueriedCoords;
    const textToCopy = `DEC: ${decStr}\nGMS: ${dmsStr}\nUTM: ${utmStr}`;

    navigator.clipboard.writeText(textToCopy).then(() => {
        if (typeof showSuccessToast === 'function') {
            showSuccessToast("Coordenadas copiadas para a área de transferência!");
        } else {
            alert("Coordenadas copiadas com sucesso!");
        }
    }).catch(e => {
        console.error("Erro ao copiar coordenadas:", e);
    });
};

// Arraste do painel de consulta de coordenadas
function initCoordinateQueryPanelDrag() {
    const header = document.getElementById('coordinate-query-panel-header');
    const panel = document.getElementById('coordinate-query-panel');
    if (!header || !panel) return;

    let isDragging = false;
    let dragStartX, dragStartY;
    let panelStartLeft, panelStartTop;

    header.addEventListener('mousedown', (e) => {
        if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;

        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;

        const rect = panel.getBoundingClientRect();
        panel.classList.remove('bottom-6', 'left-1/2', '-translate-x-1/2');

        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';

        panelStartLeft = rect.left;
        panelStartTop = rect.top;
        panel.style.transition = 'none';
        header.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        panel.style.left = (panelStartLeft + dx) + 'px';
        panel.style.top = (panelStartTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            header.style.cursor = 'move';
            panel.style.transition = '';
        }
    });
}




window.toggleGeometryDrawer = function() {
    const geoTab = document.getElementById('meas-tab-geometry');
    if (!geoTab) return;
    if (geoTab.classList.contains('hidden')) {
        geoTab.classList.remove('hidden');
        geoTab.classList.add('flex');
    } else {
        window.collapseMeasurementDrawer();
    }
};

window.collapseMeasurementDrawer = function() {
    if (typeof window.cancelUberMeasurementPointAdjustment === 'function') {
        window.cancelUberMeasurementPointAdjustment();
    }
    if (typeof window.clearAllMeasurements === 'function') {
        window.clearAllMeasurements();
    }
    const geoTab = document.getElementById('meas-tab-geometry');
    const coordTab = document.getElementById('meas-tab-coord-query');
    if (geoTab) {
        geoTab.classList.add('hidden');
        geoTab.classList.remove('flex');
    }
    if (coordTab) {
        coordTab.classList.add('hidden');
        coordTab.classList.remove('flex');
    }
    ['Marker', 'Line', 'Polygon', 'CoordinateQuery'].forEach(m => {
        const btn = document.getElementById('meas-btn-' + m);
        if (btn) {
            btn.classList.remove(
                'bg-emerald-50', 'dark:bg-emerald-900/30', 'text-emerald-600', 'dark:text-emerald-400', 'border-emerald-300/60', 'dark:border-emerald-600/40',
                'bg-blue-50', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400', 'border-blue-300/60', 'dark:border-blue-600/40',
                'bg-emerald-100', 'dark:bg-emerald-900/50', 'text-emerald-700', 'bg-blue-100', 'text-blue-700'
            );
            btn.classList.add('border-transparent');
        }
    });
    if (typeof stopMeasurementDraw === 'function') {
        stopMeasurementDraw();
    }
    currentMeasurementMode = null;
    window.currentMeasurementMode = null;
    window.isMeasurementActive = false;
};

window.switchMeasurementMode = function(mode) {
    if (typeof window.cancelUberMeasurementPointAdjustment === 'function') {
        window.cancelUberMeasurementPointAdjustment();
    }
    if (!mode || mode === 'null' || mode === 'undefined') {
        window.collapseMeasurementDrawer();
        return;
    }

    const geoTab = document.getElementById('meas-tab-geometry');
    const coordTab = document.getElementById('meas-tab-coord-query');
    
    // Check if the clicked button is already active -> toggle collapse
    const clickedBtn = document.getElementById('meas-btn-' + mode);
    const wasActive = clickedBtn && (
        clickedBtn.classList.contains('bg-emerald-50') || 
        clickedBtn.classList.contains('bg-blue-50') ||
        clickedBtn.classList.contains('dark:bg-emerald-900/30') ||
        clickedBtn.classList.contains('dark:bg-blue-900/30')
    );

    // Hide both drawers
    if (geoTab) {
        geoTab.classList.add('hidden');
        geoTab.classList.remove('flex');
    }
    if (coordTab) {
        coordTab.classList.add('hidden');
        coordTab.classList.remove('flex');
    }

    // Reset all toolbar buttons to inactive state
    ['Marker', 'Line', 'Polygon', 'CoordinateQuery'].forEach(m => {
        const btn = document.getElementById('meas-btn-' + m);
        if (btn) {
            btn.classList.remove(
                'bg-emerald-50', 'dark:bg-emerald-900/30', 'text-emerald-600', 'dark:text-emerald-400', 'border-emerald-300/60', 'dark:border-emerald-600/40',
                'bg-blue-50', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400', 'border-blue-300/60', 'dark:border-blue-600/40',
                'bg-emerald-100', 'dark:bg-emerald-900/50', 'text-emerald-700', 'bg-blue-100', 'text-blue-700'
            );
            btn.classList.add('border-transparent');
        }
    });

    if (wasActive) {
        if (typeof stopMeasurementDraw === 'function') {
            stopMeasurementDraw();
        }
        currentMeasurementMode = null;
        window.currentMeasurementMode = null;
        return;
    }

    if (typeof stopMeasurementDraw === 'function') {
        stopMeasurementDraw();
    }

    currentMeasurementMode = mode;
    window.currentMeasurementMode = mode;
    window.isMeasurementActive = true;
    window._isHoveringMeasMarker = false;
    window._isDraggingMeasMarker = false;

    // Desativa edição e arraste de todas as camadas existentes para não interferir na nova ferramenta
    if (measurementLayerGroup && typeof measurementLayerGroup.eachLayer === 'function') {
        measurementLayerGroup.eachLayer(l => {
            if (l.pm && typeof l.pm.disable === 'function') {
                try { l.pm.disable(); } catch(e) {}
            }
            if (l.dragging && typeof l.dragging.disable === 'function') {
                try { l.dragging.disable(); } catch(e) {}
            }
        });
    }

    // Se o modo selecionado for Marker, habilita o arraste dos marcadores técnicos existentes
    if (mode === 'Marker' && measurementLayerGroup && typeof measurementLayerGroup.eachLayer === 'function') {
        measurementLayerGroup.eachLayer(l => {
            if (l instanceof L.Marker && l.dragging && typeof l.dragging.enable === 'function') {
                try { l.dragging.enable(); } catch(e) {}
            }
        });
    }

    if (mode === 'CoordinateQuery') {
        if (geoTab) {
            geoTab.classList.add('hidden');
            geoTab.classList.remove('flex');
        }
        if (coordTab) {
            coordTab.classList.remove('hidden');
            coordTab.classList.add('flex');
        }
        const btn = document.getElementById('meas-btn-CoordinateQuery');
        if (btn) {
            btn.classList.remove('border-transparent');
            btn.classList.add('bg-blue-50', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400', 'border-blue-300/60', 'dark:border-blue-600/40');
        }
        setTimeout(() => {
            const firstInput = document.getElementById('input-coord-dec-lat');
            if (firstInput) firstInput.focus();
        }, 100);
    } else {
        if (coordTab) {
            coordTab.classList.add('hidden');
            coordTab.classList.remove('flex');
        }
        if (geoTab) {
            geoTab.classList.remove('hidden');
            geoTab.classList.add('flex');
        }
        const btn = document.getElementById('meas-btn-' + mode);
        if (btn) {
            btn.classList.remove('border-transparent');
            btn.classList.add('bg-emerald-50', 'dark:bg-emerald-900/30', 'text-emerald-600', 'dark:text-emerald-400', 'border-emerald-300/60', 'dark:border-emerald-600/40');
        }
        if (typeof startMeasurementDraw === 'function') {
            startMeasurementDraw(mode);
        }
    }
};
