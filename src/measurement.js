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
if (typeof map !== 'undefined' && map) {
    setupMeasurementEvents();
} else {
    // If map isn't ready yet, wait for DOMContentLoaded or map init
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(setupMeasurementEvents, 500); // Small delay to ensure map is initialized
    });
}

function setupMeasurementEvents() {
    if (!map) return;
    
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
    const btn = document.getElementById('btn-save-measurement');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">refresh</span> Gerando...';
    
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

            // Load Layout Settings
            const savedSettings = localStorage.getItem('layout_settings');
            let settings = {
                marginTop: 20, marginBottom: 20, marginLeft: 20, marginRight: 20,
                texts: []
            };
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
            
            // Margins px
            const mt = (settings.marginTop || 20) * 11.81;
            const mb = (settings.marginBottom || 20) * 11.81;
            const ml = (settings.marginLeft || 20) * 11.81;
            const mr = (settings.marginRight || 20) * 11.81;

            // Map Image Area
            const mapArea = document.createElement('div');
            mapArea.style.position = 'absolute';
            mapArea.style.top = mt + 'px';
            mapArea.style.bottom = mb + 'px';
            mapArea.style.left = ml + 'px';
            mapArea.style.right = mr + 'px';
            mapArea.style.border = '2px solid #ccc';
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
                // Source is wider, crop sides
                sWidth = mapCanvas.height * dstAspect;
                sx = (mapCanvas.width - sWidth) / 2;
            } else {
                // Source is taller, crop top/bottom
                sHeight = mapCanvas.width / dstAspect;
                sy = (mapCanvas.height - sHeight) / 2;
            }

            // Draw image exactly scaled to the destination without distortion
            ctx.drawImage(mapCanvas, sx, sy, sWidth, sHeight, 0, 0, mapAreaWidth, mapAreaHeight);

            const croppedImgData = cropCanvas.toDataURL('image/jpeg', 1.0);
            
            const finalMapImg = document.createElement('img');
            finalMapImg.src = croppedImgData;
            finalMapImg.style.width = '100%';
            finalMapImg.style.height = '100%';
            finalMapImg.style.objectFit = 'fill'; // Already cropped manually
            mapArea.appendChild(finalMapImg);
            
            a4.appendChild(mapArea);

            // Measurement Panel overlay at bottom right of the Map Area
            // We clone the measurement panel HTML to render it
            const panelHtml = document.getElementById('measurement-panel').outerHTML;
            const panelContainer = document.createElement('div');
            panelContainer.innerHTML = panelHtml;
            const clonedPanel = panelContainer.firstElementChild;
            
            // Remove absolute positioning, adjust for print scale (make it larger so it's readable on A4)
            clonedPanel.style.position = 'absolute';
            clonedPanel.style.left = '';
            clonedPanel.style.top = '';
            clonedPanel.style.bottom = '20px';
            clonedPanel.style.right = '20px';
            clonedPanel.style.transform = 'scale(3)'; // Scale up the UI since A4 is huge
            clonedPanel.style.transformOrigin = 'bottom right';
            clonedPanel.classList.remove('hidden', 'md:block', 'top-20', 'right-4');
            
            // Hide the 'Sair' and 'Gerando...' buttons inside the clone
            const buttonsArea = clonedPanel.querySelector('.flex.gap-2.mt-4');
            if (buttonsArea) buttonsArea.style.display = 'none';

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
                scale: 1, // 1:1 scale for 2480x3508
                windowWidth: 2480,
                windowHeight: 3508
            }).then(finalCanvas => {
                const finalImgData = finalCanvas.toDataURL('image/jpeg', 0.9);
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');
                pdf.addImage(finalImgData, 'JPEG', 0, 0, 210, 297);
                
                const dateStr = new Date().toISOString().slice(0, 10);
                pdf.save(`Medicao_${dateStr}.pdf`);
                
                // Cleanup
                document.body.removeChild(a4);
                btn.innerHTML = originalText;
                
            }).catch(err => {
                console.error("Erro ao gerar PDF final", err);
                document.body.removeChild(a4);
                btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">error</span> Erro';
                setTimeout(() => { btn.innerHTML = originalText; }, 2000);
            });

        }).catch(err => {
            console.error("Erro ao capturar mapa", err);
            btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">error</span> Erro';
            setTimeout(() => { btn.innerHTML = originalText; }, 2000);
        });
    }, 500);
}
