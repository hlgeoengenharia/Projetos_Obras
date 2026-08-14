let measurementLayerGroup = null;
let currentMeasurementMode = null;

function toggleMeasurementPanel() {
    const panel = document.getElementById('measurement-panel');
    if (panel.classList.contains('hidden')) {
        // Open
        panel.classList.remove('hidden');
        if (!measurementLayerGroup) {
            measurementLayerGroup = L.featureGroup().addTo(map);
        }
    } else {
        // Close
        closeMeasurementPanel();
    }
}

function closeMeasurementPanel() {
    document.getElementById('measurement-panel').classList.add('hidden');
    stopMeasurementDraw();
    if (measurementLayerGroup) {
        measurementLayerGroup.clearLayers();
    }
    resetMeasurementResults();
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
        snappable: true,
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
        html2canvas(document.body, {
            useCORS: true,
            allowTaint: true
        }).then(canvas => {
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            
            const { jsPDF } = window.jspdf;
            
            // Determine orientation based on canvas dimensions
            const orientation = canvas.width > canvas.height ? 'l' : 'p';
            const pdf = new jsPDF(orientation, 'mm', 'a4');
            
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            // Scale image to fit PDF page
            const ratio = Math.min(pdfWidth / canvas.width, pdfHeight / canvas.height);
            const imgX = (pdfWidth - canvas.width * ratio) / 2;
            const imgY = 0; // Top align
            
            pdf.addImage(imgData, 'JPEG', imgX, imgY, canvas.width * ratio, canvas.height * ratio);
            
            const dateStr = new Date().toISOString().slice(0, 10);
            pdf.save(`Medicao_${dateStr}.pdf`);
            
            btn.innerHTML = originalText;
        }).catch(err => {
            console.error("Erro ao gerar PDF", err);
            btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">error</span> Erro';
            setTimeout(() => { btn.innerHTML = originalText; }, 2000);
        });
    }, 100);
}
