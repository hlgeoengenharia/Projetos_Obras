let measurementLayerGroup = null;
let currentMeasurementMode = null;
let pointCounter = 1;
window.isMeasurementActive = false;
window.isMeasurementSnappingEnabled = true;

window.toggleMeasurementSnapping = function() {
    window.isMeasurementSnappingEnabled = !window.isMeasurementSnappingEnabled;
    const btn = document.getElementById('btn-measure-snap');
    if (window.isMeasurementSnappingEnabled) {
        btn.classList.add('text-emerald-600', 'dark:text-emerald-400');
        btn.classList.remove('text-slate-600', 'dark:text-slate-300');
        btn.title = "Aderência Ativada";
    } else {
        btn.classList.remove('text-emerald-600', 'dark:text-emerald-400');
        btn.classList.add('text-slate-600', 'dark:text-slate-300');
        btn.title = "Aderência Desativada";
    }
    
    if (currentMeasurementMode && map && map.pm) {
        map.pm.setGlobalOptions({ snappable: window.isMeasurementSnappingEnabled });
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

    if (type === 'CoordinateQuery') {
        const panel = document.getElementById('measurement-panel');
        if (panel && panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
        }
        if (typeof openCoordinateQueryPanel === 'function') {
            openCoordinateQueryPanel();
        }
        return;
    }

    // Se o painel de consulta de coordenadas estiver aberto, fecha-o
    closeCoordinateQueryPanel();

    const panel = document.getElementById('measurement-panel');
    if (panel && panel.classList.contains('hidden')) {
        toggleMeasurementPanel();
    }

    if (typeof startMeasurementDraw === 'function') {
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
    if (panel.classList.contains('hidden')) {
        // Open
        panel.classList.remove('hidden');
        if (!measurementLayerGroup) {
            measurementLayerGroup = L.featureGroup().addTo(map);
        }
        window.isMeasurementActive = true;
        
        // Re-enable editing on existing measurement layers
        measurementLayerGroup.eachLayer(l => {
            if (l.pm && typeof l.pm.enable === 'function') {
                l.pm.enable({
                    allowSelfIntersection: true,
                    preventMarkerRemoval: false,
                    snappable: window.isMeasurementSnappingEnabled
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

// CAD Exact Measure Input State
let lastDrawnVertex = null;
let currentMouseLatLng = null;
let cadActiveShape = null;

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
    if (!lastDrawnVertex || !mouseLatLng) return;
    const dist = lastDrawnVertex.distanceTo(mouseLatLng);
    const hintEl = document.getElementById('cad-hud-hint');
    if (hintEl) {
        hintEl.innerHTML = `Direcione com o mouse <span class="font-mono text-emerald-600 dark:text-emerald-400 font-bold">(cursor: ${dist.toFixed(2)} m)</span>`;
    }
    const instLive = document.getElementById('meas-cad-dist-live');
    if (instLive) {
        instLive.innerText = `${dist.toFixed(2)} m`;
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
    const inp = document.getElementById('cad-measure-input');
    if (inp) {
        inp.value = '';
        setTimeout(() => inp.focus(), 60);
    }
    const inst = document.getElementById('meas-instruction');
    if (inst && (mode === 'Line' || mode === 'Polygon')) {
        inst.innerHTML = `
            <div class="flex flex-col gap-1.5">
                <span class="text-slate-600 dark:text-slate-300 font-medium">Aponte o cursor na direção desejada:</span>
                <div class="flex items-center gap-1.5">
                    <div class="relative flex-1">
                        <input type="text" id="meas-drawer-cad-input" placeholder="Ex: 35.00" class="w-full px-2 py-1 text-xs font-mono font-bold rounded bg-white dark:bg-slate-900 border border-emerald-400 text-slate-800 dark:text-slate-100 pr-5" onkeydown="if(event.key==='Enter') applyCadMeasureInput(this.value)">
                        <span class="absolute right-1.5 top-1 text-[10px] font-bold text-slate-400 pointer-events-none">m</span>
                    </div>
                    <button type="button" onclick="applyCadMeasureInput(document.getElementById('meas-drawer-cad-input').value)" class="px-2 py-1 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer">Inserir</button>
                </div>
                <span class="text-[9px] text-slate-400">Cursor: <span id="meas-cad-dist-live" class="font-mono text-emerald-500">0.00 m</span> | Ou clique no mapa.</span>
            </div>
        `;
    }
}

function hideCadMeasureHud() {
    const hud = document.getElementById('cad-measure-hud');
    if (hud) {
        hud.classList.add('hidden');
        hud.classList.remove('flex');
    }
    const inp = document.getElementById('cad-measure-input');
    if (inp) inp.value = '';
}

window.applyCadMeasureInput = function(customVal) {
    if (!lastDrawnVertex) {
        alert("Clique no mapa para marcar o primeiro ponto antes de inserir a medida.");
        return;
    }
    if (!currentMouseLatLng) {
        alert("Mova o cursor do mouse na direção desejada para aplicar a medida.");
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
        return;
    }

    const targetLatLng = getDestinationLatLng(lastDrawnVertex, currentMouseLatLng, distMeters);
    if (!targetLatLng) return;

    const drawMode = currentMeasurementMode || cadActiveShape || 'Line';
    const drawInstance = map && map.pm && map.pm.Draw && map.pm.Draw[drawMode];

    const fakeEvent = {
        latlng: targetLatLng,
        layerPoint: map.latLngToLayerPoint(targetLatLng),
        containerPoint: map.latLngToContainerPoint(targetLatLng),
        originalEvent: {}
    };

    if (drawInstance && typeof drawInstance._createVertex === 'function') {
        drawInstance._createVertex(fakeEvent);
    } else if (map) {
        map.fire('click', fakeEvent);
    }

    lastDrawnVertex = targetLatLng;

    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 50);
    }
    const drawerInp = document.getElementById('meas-drawer-cad-input');
    if (drawerInp) {
        drawerInp.value = '';
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const inp = document.getElementById('cad-measure-input');
        if (inp && (document.activeElement === inp || inp.value.trim() !== '')) {
            e.preventDefault();
            window.applyCadMeasureInput();
            return;
        }
    }
    if (window.isMeasurementActive && (currentMeasurementMode === 'Line' || currentMeasurementMode === 'Polygon') && lastDrawnVertex) {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        const isInputFocused = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
        if (!isInputFocused && ((e.key >= '0' && e.key <= '9') || e.key === '.' || e.key === ',')) {
            const inp = document.getElementById('cad-measure-input');
            if (inp) {
                inp.focus();
            }
        }
    }
});

function closeMeasurementPanel() {
    // Ao clicar no ícone "x", limpa todas as medições e encerra a ferramenta
    if (typeof window.clearAllMeasurements === 'function') {
        window.clearAllMeasurements();
    }
    hideCadMeasureHud();
    lastDrawnVertex = null;
    currentMouseLatLng = null;

    const panel = document.getElementById('measurement-panel');
    if (panel) panel.classList.add('hidden');
    stopMeasurementDraw();
    window.isMeasurementActive = false;
    currentMeasurementMode = null;

    // Disable pm vertex editing on existing layers while panel is closed
    if (measurementLayerGroup) {
        measurementLayerGroup.eachLayer(l => {
            if (l.pm && typeof l.pm.disable === 'function') {
                l.pm.disable();
            }
            if (l.dragging && typeof l.dragging.disable === 'function') {
                l.dragging.disable();
            }
        });
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
    pointCounter = 1; // Reset counter

    // 1. Interrompe e cancela imediatamente qualquer desenho ativo no Geoman / Leaflet
    if (map && map.pm) {
        try {
            map.pm.disableDraw();
        } catch(e) {}
    }
    stopMeasurementDraw();

    // 2. Limpa todas as camadas salvas no grupo de medição
    if (measurementLayerGroup) {
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

function stopMeasurementDraw() {
    if (map && map.pm) {
        map.pm.disableDraw();
    }
    hideCadMeasureHud();
    lastDrawnVertex = null;
    currentMeasurementMode = null;
    
    // Enable other map interactions
    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.style.cursor = '';
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
    if (!map || !map.pm) return;
    
    const validShapes = ['Marker', 'CircleMarker', 'Line', 'Polygon', 'Rectangle', 'Circle', 'Cut', 'Text'];
    if (!shape || typeof shape !== 'string' || !validShapes.includes(shape)) {
        stopMeasurementDraw();
        currentMeasurementMode = null;
        return;
    }
    
    stopMeasurementDraw();
    currentMeasurementMode = shape;
    cadActiveShape = shape;
    lastDrawnVertex = null;
    currentMouseLatLng = null;
    hideCadMeasureHud();
    
    let inst = document.getElementById('meas-instruction');
    if(inst) {
        if (shape === 'Marker') {
            inst.innerHTML = '<span class="text-slate-600 dark:text-slate-300 font-medium">Clique no mapa para inserir pontos consecutivos.<br><span class="text-[9px] text-slate-400">Arraste para mover | Botão direito para excluir.</span></span>';
        } else if (shape === 'Line') {
            inst.innerHTML = '<span class="text-slate-600 dark:text-slate-300 font-medium">Clique no 1º ponto para iniciar a linha.<br><span class="text-[9px] text-slate-400">Aponte o cursor na direção e digite a medida exata (Enter para inserir).</span></span>';
        } else if (shape === 'Polygon') {
            inst.innerHTML = '<span class="text-slate-600 dark:text-slate-300 font-medium">Clique no 1º ponto para iniciar a área.<br><span class="text-[9px] text-slate-400">Aponte o cursor na direção e digite a medida exata (Enter para inserir).</span></span>';
        } else {
            inst.innerHTML = '<span class="text-slate-600 dark:text-slate-300 font-medium">Clique no mapa para medir...</span>';
        }
        inst.classList.remove('hidden');
    }
    
    map.pm.enableDraw(shape, {
        snappable: window.isMeasurementSnappingEnabled,
        snapDistance: 20,
        hintlineStyle: { color: '#10b981', dashArray: '5,5' },
        templineStyle: { color: '#10b981' },
        pathOptions: {
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.3
        }
    });
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

function setupMeasurementEvents() {
    if (typeof map === 'undefined' || !map || typeof map.on !== 'function') {
        setTimeout(setupMeasurementEvents, 500);
        return;
    }

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

    map.on('mousemove', (e) => {
        currentMouseLatLng = e.latlng;
        if (lastDrawnVertex && (currentMeasurementMode === 'Line' || currentMeasurementMode === 'Polygon')) {
            updateCadMeasureHudLive(e.latlng);
        }
    });

    map.on('click', (e) => {
        if (currentMeasurementMode === 'Line' || currentMeasurementMode === 'Polygon') {
            setTimeout(() => {
                const drawInstance = map && map.pm && map.pm.Draw && map.pm.Draw[currentMeasurementMode];
                if (drawInstance && drawInstance._layer) {
                    const latlngs = drawInstance._layer.getLatLngs();
                    const pts = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
                    if (pts && pts.length > 0) {
                        lastDrawnVertex = pts[pts.length - 1];
                        showCadMeasureHud(currentMeasurementMode);
                    }
                } else if (!lastDrawnVertex && e.latlng) {
                    lastDrawnVertex = e.latlng;
                    showCadMeasureHud(currentMeasurementMode);
                }
            }, 60);
        }
    });
    
    map.on('pm:create', (e) => {
        hideCadMeasureHud();
        lastDrawnVertex = null;
        if (!currentMeasurementMode) return;
        
        const layer = e.layer;
        const currentShape = e.shape || currentMeasurementMode;
        
        if (!measurementLayerGroup) {
            measurementLayerGroup = L.featureGroup().addTo(map);
        }
        measurementLayerGroup.addLayer(layer);
        
        const list = document.getElementById('meas-features-list');
        const item = document.createElement('div');
        item.className = 'bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative group text-left';

        // Function to delete this specific layer and its card
        const deleteFeature = () => {
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
                // Enable Geoman vertex editing & vertex deletion
                if (layer.pm) {
                    layer.pm.enable({
                        allowSelfIntersection: true,
                        preventMarkerRemoval: false,
                        snappable: window.isMeasurementSnappingEnabled
                    });
                }

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
                layer.on('pm:markerdragend', renderPolygon);

            } else if (currentShape === 'Line') {
                // Enable Geoman vertex editing & vertex deletion
                if (layer.pm) {
                    layer.pm.enable({
                        allowSelfIntersection: true,
                        preventMarkerRemoval: false,
                        snappable: window.isMeasurementSnappingEnabled
                    });
                }

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
                layer.on('pm:markerdragend', renderLine);

            } else if (currentShape === 'Marker') {
                const pointLabel = String(pointCounter).padStart(2, '0');
                pointCounter++;

                const techIcon = L.divIcon({
                    className: 'custom-tech-point',
                    html: `<div style="width: 14px; height: 14px; border: 2px solid black; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: transparent; position: relative;">
                               <div style="width: 4px; height: 4px; background: black; border-radius: 50%;"></div>
                               <span style="position: absolute; top: -16px; left: 10px; font-weight: 900; font-family: monospace; font-size: 13px; color: black; text-shadow: 1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff;">P${pointLabel}</span>
                           </div>`,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                });
                layer.setIcon(techIcon);

                // Enable dragging for Point adjustment
                if (layer.dragging) {
                    layer.dragging.enable();
                }
                if (layer.pm) {
                    layer.pm.enable({
                        snappable: window.isMeasurementSnappingEnabled
                    });
                }

                // Prevent click propagation on mousedown so dragging existing marker doesn't spawn new marker
                layer.on('mousedown', (ev) => {
                    if (ev) L.DomEvent.stopPropagation(ev);
                });

                // Right-click on marker deletes it directly
                layer.on('contextmenu', (ev) => {
                    if (ev) L.DomEvent.stop(ev);
                    deleteFeature();
                });

                layer.bindTooltip(`P${pointLabel} <span style="font-size:9px;opacity:0.75;">(Arraste p/ mover | Botão direito p/ excluir)</span>`, {
                    direction: 'top',
                    offset: [0, -10]
                });

                const renderMarker = () => {
                    const pos = layer.getLatLng();
                    const lat = pos.lat;
                    const lng = pos.lng;
                    const decStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                    const dmsStr = typeof formatDMS === 'function' ? formatDMS(lat, lng) : 'N/A';
                    const utmStr = typeof formatUTM === 'function' ? formatUTM(lat, lng) : 'N/A';

                    contentBox.innerHTML = `
                        <div class="flex flex-col w-full text-left mt-0.5">
                            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ponto Técnico (P${pointLabel})</span>
                            <div class="flex flex-col gap-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                                <div class="flex items-center gap-1.5"><span class="text-[8px] font-bold text-slate-400 w-6">DEC</span><span>${decStr}</span></div>
                                <div class="flex items-center gap-1.5"><span class="text-[8px] font-bold text-slate-400 w-6">GMS</span><span>${dmsStr}</span></div>
                                <div class="flex items-center gap-1.5"><span class="text-[8px] font-bold text-slate-400 w-6">UTM</span><span>${utmStr}</span></div>
                            </div>
                        </div>
                    `;
                };

                renderMarker();
                layer.on('drag', renderMarker);
                layer.on('dragend', renderMarker);
                layer.on('pm:dragend', renderMarker);
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
            setTimeout(() => {
                if (currentMeasurementMode === 'Marker' && map && map.pm) {
                    map.pm.enableDraw('Marker', {
                        snappable: window.isMeasurementSnappingEnabled,
                        snapDistance: 20
                    });
                }
            }, 60);
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

    // Salva versão leve no localStorage com tratamento seguro contra QuotaExceededError
    try {
        const lightweightData = {
            ...reportData,
            camadasVetoriais: reportData.camadasVetoriais.map(cv => ({
                id: cv.id,
                nome: cv.nome,
                cor: cv.cor,
                visivel: cv.visivel,
                // Mantém apenas uma amostra segura de feições no localStorage para não estourar a cota
                features: (cv.features || []).slice(0, 100)
            }))
        };
        localStorage.setItem('measurement_report_data', JSON.stringify(lightweightData));
    } catch(eQuota) {
        console.warn('[saveMeasurementPDF] localStorage com cota cheia. Salvando apenas metadados:', eQuota);
        try {
            const metaOnlyData = {
                ...reportData,
                camadasVetoriais: reportData.camadasVetoriais.map(cv => ({
                    id: cv.id,
                    nome: cv.nome,
                    cor: cv.cor,
                    visivel: cv.visivel,
                    features: []
                }))
            };
            localStorage.setItem('measurement_report_data', JSON.stringify(metaOnlyData));
        } catch(eFatal) {
            console.warn('[saveMeasurementPDF] Não foi possível persistir no localStorage; relatório usará window.opener:', eFatal);
        }
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
};

window.switchMeasurementMode = function(mode) {
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
        return;
    }

    currentMeasurementMode = mode;

    if (mode === 'CoordinateQuery') {
        if (typeof stopMeasurementDraw === 'function') {
            stopMeasurementDraw();
        }
        // Show search drawer
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
        // Show geometry results drawer
        if (geoTab) {
            geoTab.classList.remove('hidden');
            geoTab.classList.add('flex');
        }
        const btn = document.getElementById('meas-btn-' + mode);
        if (btn) {
            btn.classList.remove('border-transparent');
            btn.classList.add('bg-emerald-50', 'dark:bg-emerald-900/30', 'text-emerald-600', 'dark:text-emerald-400', 'border-emerald-300/60', 'dark:border-emerald-600/40');
        }
        // Trigger the drawing engine
        if (typeof window.selectMeasurementOption === 'function') {
            window.selectMeasurementOption(mode);
        }
    }
};
