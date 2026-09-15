let measurementLayerGroup = null;
let currentMeasurementMode = null;
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
    const menu = document.getElementById('measurement-menu-dropdown');
    if (menu) menu.classList.add('hidden');

    if (type === '3D') {
        if (typeof openCesiumModal === 'function') {
            openCesiumModal();
        }
        return;
    }

    if (type === 'CoordinateQuery') {
        closeMeasurementPanel();
        openCoordinateQueryPanel();
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
    if (!viewfinder || !btn) return;
    
    if (viewfinder.classList.contains('hidden')) {
        viewfinder.classList.remove('hidden');
        viewfinder.classList.add('flex');
        setTimeout(() => viewfinder.classList.remove('opacity-0'), 10);
        btn.classList.add('bg-primary/20', 'text-primary');
        btn.classList.remove('text-slate-600', 'dark:text-slate-300');
    } else {
        viewfinder.classList.add('opacity-0');
        setTimeout(() => {
            viewfinder.classList.add('hidden');
            viewfinder.classList.remove('flex');
        }, 300);
        btn.classList.remove('bg-primary/20', 'text-primary');
        btn.classList.add('text-slate-600', 'dark:text-slate-300');
    }
}

function closeMeasurementPanel() {
    document.getElementById('measurement-panel').classList.add('hidden');
    stopMeasurementDraw();
    if (measurementLayerGroup) {
        measurementLayerGroup.clearLayers();
    }
    resetMeasurementResults();
    window.isMeasurementActive = false;
    
    // Hide Print Viewfinder overlay safely
    const viewfinder = document.getElementById('print-viewfinder');
    if (viewfinder && !viewfinder.classList.contains('hidden')) {
        window.togglePrintViewfinder();
    }
}

function resetMeasurementResults() {
    document.getElementById('measurement-results').innerHTML = 'Selecione uma ferramenta acima para iniciar a medição no mapa.';
    document.getElementById('btn-save-measurement').disabled = true;
    document.getElementById('btn-save-measurement').classList.add('opacity-50', 'cursor-not-allowed');
    document.getElementById('btn-save-measurement').classList.remove('hover:bg-emerald-600');
}

function stopMeasurementDraw() {
    if (map && map.pm) {
        map.pm.disableDraw();
    }
    currentMeasurementMode = null;
    
    // Enable other map interactions
    document.getElementById('map').style.cursor = '';
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
        panel.classList.remove('bottom-6', 'left-1/2', '-translate-x-1/2');
        
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
    if (!map) return;
    
    stopMeasurementDraw();
    
    if (measurementLayerGroup) {
        measurementLayerGroup.clearLayers();
    }
    
    resetMeasurementResults();
    currentMeasurementMode = shape;
    
    document.getElementById('measurement-results').innerHTML = '<span class="text-emerald-500 font-bold animate-pulse mt-2">Desenhe no mapa...</span>';
    
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
        // map might be a DOM element (window.map) or not yet initialized by Leaflet
        setTimeout(setupMeasurementEvents, 500);
        return;
    }
    
    map.on('pm:create', (e) => {
        // Check if we are in measurement mode
        if (!currentMeasurementMode) return;
        
        const layer = e.layer;
        
        // Add layer to our temporary measurement group
        if (!measurementLayerGroup) {
            measurementLayerGroup = L.featureGroup().addTo(map);
        }
        measurementLayerGroup.addLayer(layer);
        
        // Convert to GeoJSON to use Turf.js
        const geojson = layer.toGeoJSON();
        let resultHTML = '';
        
        try {
            if (e.shape === 'Polygon') {
                const area = turf.area(geojson);
                const perimeter = turf.length(geojson, {units: 'meters'});
                const centroid = turf.centroid(geojson);
                const lat = centroid.geometry.coordinates[1];
                const lng = centroid.geometry.coordinates[0];
                const decStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                const dmsStr = typeof formatDMS === 'function' ? formatDMS(lat, lng) : 'N/A';
                const utmStr = typeof formatUTM === 'function' ? formatUTM(lat, lng) : 'N/A';
                
                resultHTML = `
                    <div class="grid grid-cols-2 gap-x-4 gap-y-3 w-full text-left mt-1">
                        <div class="flex flex-col"><span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Área</span><span class="font-mono text-slate-700 dark:text-slate-200 text-sm">${area.toFixed(2)} m²</span></div>
                        <div class="flex flex-col"><span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Perímetro</span><span class="font-mono text-slate-700 dark:text-slate-200 text-sm">${perimeter.toFixed(2)} m</span></div>
                        
                        <div class="col-span-2 flex flex-col border-t border-slate-100 dark:border-slate-800 pt-2 mt-1">
                            <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Coordenadas do Centroide</span>
                            <div class="flex flex-col gap-1">
                                <div class="flex items-center gap-2"><span class="text-[9px] font-bold text-slate-400 w-8">DEC</span> <span class="font-mono text-slate-700 dark:text-slate-200 text-xs">${decStr}</span></div>
                                <div class="flex items-center gap-2"><span class="text-[9px] font-bold text-slate-400 w-8">GMS</span> <span class="font-mono text-slate-700 dark:text-slate-200 text-xs">${dmsStr}</span></div>
                                <div class="flex items-center gap-2"><span class="text-[9px] font-bold text-slate-400 w-8">UTM</span> <span class="font-mono text-slate-700 dark:text-slate-200 text-xs">${utmStr}</span></div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (e.shape === 'Line') {
                const length = turf.length(geojson, {units: 'meters'});
                const centroid = turf.centroid(geojson);
                const lat = centroid.geometry.coordinates[1];
                const lng = centroid.geometry.coordinates[0];
                const decStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                const dmsStr = typeof formatDMS === 'function' ? formatDMS(lat, lng) : 'N/A';
                const utmStr = typeof formatUTM === 'function' ? formatUTM(lat, lng) : 'N/A';
                
                resultHTML = `
                    <div class="grid grid-cols-1 gap-y-3 w-full text-left mt-1">
                        <div class="flex flex-col"><span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Comprimento da Linha</span><span class="font-mono text-slate-700 dark:text-slate-200 text-lg">${length.toFixed(2)} m</span></div>
                        
                        <div class="flex flex-col border-t border-slate-100 dark:border-slate-800 pt-2 mt-1">
                            <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Coordenadas do Centroide</span>
                            <div class="flex flex-col gap-1">
                                <div class="flex items-center gap-2"><span class="text-[9px] font-bold text-slate-400 w-8">DEC</span> <span class="font-mono text-slate-700 dark:text-slate-200 text-xs">${decStr}</span></div>
                                <div class="flex items-center gap-2"><span class="text-[9px] font-bold text-slate-400 w-8">GMS</span> <span class="font-mono text-slate-700 dark:text-slate-200 text-xs">${dmsStr}</span></div>
                                <div class="flex items-center gap-2"><span class="text-[9px] font-bold text-slate-400 w-8">UTM</span> <span class="font-mono text-slate-700 dark:text-slate-200 text-xs">${utmStr}</span></div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (e.shape === 'Marker') {
                const lat = geojson.geometry.coordinates[1];
                const lng = geojson.geometry.coordinates[0];
                const decStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                const dmsStr = typeof formatDMS === 'function' ? formatDMS(lat, lng) : 'N/A';
                const utmStr = typeof formatUTM === 'function' ? formatUTM(lat, lng) : 'N/A';
                
                resultHTML = `
                    <div class="flex flex-col w-full text-left mt-1">
                        <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Coordenadas Exatas</span>
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-2"><span class="text-[9px] font-bold text-slate-400 w-8">DEC</span> <span class="font-mono text-slate-700 dark:text-slate-200 text-xs">${decStr}</span></div>
                            <div class="flex items-center gap-2"><span class="text-[9px] font-bold text-slate-400 w-8">GMS</span> <span class="font-mono text-slate-700 dark:text-slate-200 text-xs">${dmsStr}</span></div>
                            <div class="flex items-center gap-2"><span class="text-[9px] font-bold text-slate-400 w-8">UTM</span> <span class="font-mono text-slate-700 dark:text-slate-200 text-xs">${utmStr}</span></div>
                        </div>
                    </div>
                `;
            }
            
            document.getElementById('measurement-results').innerHTML = resultHTML;
            
            // Enable save button
            document.getElementById('btn-save-measurement').disabled = false;
            document.getElementById('btn-save-measurement').classList.remove('opacity-50', 'cursor-not-allowed');
            document.getElementById('btn-save-measurement').classList.add('hover:bg-emerald-600');
            
        } catch(err) {
            console.error("Erro ao calcular medição", err);
            document.getElementById('measurement-results').innerHTML = '<span class="text-red-500">Erro ao realizar cálculo.</span>';
        }
        
        // Disable draw mode so user can see result without continuing to draw
        stopMeasurementDraw();
    });
}

function saveMeasurementPDF() {
    const coordPanel = document.getElementById('coordinate-query-panel');
    const isCoordActive = coordPanel && !coordPanel.classList.contains('hidden');
    const btn = isCoordActive ? document.getElementById('btn-save-coord-pdf') : document.getElementById('btn-save-measurement');
    const originalText = btn ? btn.innerHTML : 'Salvar';
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">refresh</span> Gerando...';
    
    setTimeout(() => {
        // Step 1: Capture Map Container
        const mapElement = document.getElementById('map');
        html2canvas(mapElement, {
            useCORS: true,
            allowTaint: true
        }).then(mapCanvas => {
            const mapImgData = mapCanvas.toDataURL('image/jpeg', 1.0);
            
            // Step 2: Build Virtual A4 Paper (2480x3508)
            const a4 = document.createElement('div');
            a4.style.position = 'absolute';
            a4.style.left = '-9999px';
            a4.style.top = '0';
            a4.style.width = '2480px';
            a4.style.height = '3508px';
            a4.style.backgroundColor = '#ffffff';
            a4.style.overflow = 'hidden';
            a4.style.zIndex = '-1000';
            document.body.appendChild(a4);

            let settings = {
                marginTop: 20,
                marginBottom: 20,
                marginLeft: 20,
                marginRight: 20,
                headerImg: null,
                footerImg: null,
                texts: []
            };

            const savedSettings = localStorage.getItem('measurement_print_settings');
            if (savedSettings) {
                try { settings = JSON.parse(savedSettings); } catch(e) {}
            }
            
            // Background Header
            if (settings.headerImg && settings.headerImg.startsWith('data:image')) {
                const hImg = document.createElement('img');
                hImg.src = settings.headerImg;
                hImg.style.position = 'absolute';
                hImg.style.top = '0';
                hImg.style.left = '0';
                hImg.style.width = '100%';
                a4.appendChild(hImg);
            }

            // Background Footer
            if (settings.footerImg && settings.footerImg.startsWith('data:image')) {
                const fImg = document.createElement('img');
                fImg.src = settings.footerImg;
                fImg.style.position = 'absolute';
                fImg.style.bottom = '0';
                fImg.style.left = '0';
                fImg.style.width = '100%';
                a4.appendChild(fImg);
            }
            
            // Dynamic Map Canvas Container respecting margins
            const mt = (settings.marginTop || 20) * 11.81;
            const mb = (settings.marginBottom || 20) * 11.81;
            const ml = (settings.marginLeft || 20) * 11.81;
            const mr = (settings.marginRight || 20) * 11.81;

            const mapArea = document.createElement('div');
            mapArea.style.position = 'absolute';
            mapArea.style.left = ml + 'px';
            mapArea.style.top = mt + 'px';
            mapArea.style.width = (2480 - ml - mr) + 'px';
            mapArea.style.height = (3508 - mt - mb) + 'px';
            mapArea.style.boxSizing = 'border-box';
            mapArea.style.overflow = 'hidden';
            
            // Use manual cropping to avoid html2canvas background-size/object-fit distortion bugs
            const cropCanvas = document.createElement('canvas');
            const mapAreaWidth = 2480 - ml - mr;
            const mapAreaHeight = 3508 - mt - mb;
            cropCanvas.width = mapAreaWidth;
            cropCanvas.height = mapAreaHeight;
            const ctx = cropCanvas.getContext('2d');
            
            let srcAspect = mapCanvas.width / mapCanvas.height;
            let dstAspect = mapAreaWidth / mapAreaHeight;

            let sWidth = mapCanvas.width;
            let sHeight = mapCanvas.height;
            let sx = 0;
            let sy = 0;

            if (srcAspect > dstAspect) {
                sWidth = mapCanvas.height * dstAspect;
                sx = (mapCanvas.width - sWidth) / 2;
            } else {
                sHeight = mapCanvas.width / dstAspect;
                sy = (mapCanvas.height - sHeight) / 2;
            }

            ctx.drawImage(mapCanvas, sx, sy, sWidth, sHeight, 0, 0, mapAreaWidth, mapAreaHeight);

            const croppedImgData = cropCanvas.toDataURL('image/jpeg', 1.0);
            
            const finalMapImg = document.createElement('img');
            finalMapImg.src = croppedImgData;
            finalMapImg.style.width = '100%';
            finalMapImg.style.height = '100%';
            finalMapImg.style.objectFit = 'fill';
            mapArea.appendChild(finalMapImg);
            
            a4.appendChild(mapArea);

            // Overlay at bottom right of the Map Area
            const sourcePanel = isCoordActive ? coordPanel : document.getElementById('measurement-panel');
            const panelHtml = sourcePanel.outerHTML;
            const panelContainer = document.createElement('div');
            panelContainer.innerHTML = panelHtml;
            const clonedPanel = panelContainer.firstElementChild;
            
            clonedPanel.style.position = 'absolute';
            clonedPanel.style.left = '';
            clonedPanel.style.top = '';
            clonedPanel.style.bottom = '20px';
            clonedPanel.style.right = '20px';
            clonedPanel.style.transform = isCoordActive ? 'scale(2.2)' : 'scale(3)';
            clonedPanel.style.transformOrigin = 'bottom right';
            clonedPanel.classList.remove('hidden', 'md:block', 'top-20', 'right-4');
            
            // Oculta botões de ação e ferramentas de cabeçalho no clone
            const buttonsArea1 = clonedPanel.querySelector('.flex.gap-2.mt-4');
            if (buttonsArea1) buttonsArea1.style.display = 'none';
            const buttonsArea2 = clonedPanel.querySelector('.flex.gap-2.pt-2');
            if (buttonsArea2) buttonsArea2.style.display = 'none';
            const buttonsArea3 = clonedPanel.querySelector('.flex.gap-2.pt-3');
            if (buttonsArea3) buttonsArea3.style.display = 'none';
            const headerTools = clonedPanel.querySelector('.flex.items-center.gap-1, .flex.items-center.gap-1\\.5');
            if (headerTools) headerTools.style.display = 'none';

            if (isCoordActive) {
                const origInputs = coordPanel.querySelectorAll('input, select');
                const cloneInputs = clonedPanel.querySelectorAll('input, select');
                origInputs.forEach((inp, idx) => {
                    if (cloneInputs[idx]) {
                        cloneInputs[idx].setAttribute('value', inp.value);
                    }
                });
            }

            mapArea.appendChild(clonedPanel);

            // Add Custom Texts
            if (settings.texts && Array.isArray(settings.texts)) {
                settings.texts.forEach(item => {
                    const txt = document.createElement('div');
                    txt.style.position = 'absolute';
                    txt.style.left = item.x + 'px';
                    txt.style.top = item.y + 'px';
                    txt.style.fontSize = item.fontSize + 'px';
                    txt.style.color = item.color || '#1e293b';
                    txt.style.fontWeight = 'bold';
                    txt.style.transform = 'translate(-50%, -50%)';
                    txt.style.whiteSpace = 'nowrap';
                    txt.style.zIndex = '50';
                    txt.innerText = item.text;
                    a4.appendChild(txt);
                });
            }

            // Step 3: Capture the Final A4 Layout
            html2canvas(a4, {
                useCORS: true,
                allowTaint: true,
                scale: 1,
                windowWidth: 2480,
                windowHeight: 3508
            }).then(finalCanvas => {
                const finalImgData = finalCanvas.toDataURL('image/jpeg', 0.9);
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');
                pdf.addImage(finalImgData, 'JPEG', 0, 0, 210, 297);
                
                const dateStr = new Date().toISOString().slice(0, 10);
                const fileName = isCoordActive ? `Consulta_Coordenadas_${dateStr}.pdf` : `Medicao_${dateStr}.pdf`;
                pdf.save(fileName);
                
                // Cleanup
                document.body.removeChild(a4);
                if (btn) btn.innerHTML = originalText;
                
            }).catch(err => {
                console.error("Erro ao gerar PDF final", err);
                document.body.removeChild(a4);
                if (btn) {
                    btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">error</span> Erro';
                    setTimeout(() => { btn.innerHTML = originalText; }, 2000);
                }
            });

        }).catch(err => {
            console.error("Erro ao capturar mapa", err);
            btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">error</span> Erro';
            setTimeout(() => { btn.innerHTML = originalText; }, 2000);
        });
    }, 500);
}

// =========================================================================
// === CONSULTA E LOCALIZAÇÃO DE COORDENADAS (DEC, GMS, UTM) ================
// =========================================================================

let coordinateQueryMarker = null;
let coordinateQueryActiveTab = 'DEC';
let isCoordQueryDragInitialized = false;

window.openCoordinateQueryPanel = function() {
    const panel = document.getElementById('coordinate-query-panel');
    if (!panel) return;
    
    panel.classList.remove('hidden');
    
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

    // 4. Oculta o painel
    const panel = document.getElementById('coordinate-query-panel');
    if (panel) panel.classList.add('hidden');
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

