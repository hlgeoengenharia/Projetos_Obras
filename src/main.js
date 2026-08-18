let allForms = [];
async function fetchDynamicForm() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('forms').select('*').order('created_at', { ascending: false });
            if (data) {
                allForms = data;
                console.log("All Forms loaded from Supabase:", allForms);
                populateFormSelects();
            }
        } catch(e) { console.error(e); }
    } else {
        const saved = localStorage.getItem('constructive_forms');
        if (saved) {
            allForms = JSON.parse(saved);
            populateFormSelects();
        }
    }
}
function populateFormSelects() {
    const selects = ['theme-cadastro-type', 'edit-theme-cadastro-type', 'global-import-cadastro-type'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            let html = '<option value="">Padrão Genérico</option>';
            allForms.forEach(f => {
                html += `<option value="${f.id}">${f.title || f.name}</option>`;
            });
            el.innerHTML = html;
        }
    });
}
fetchDynamicForm();

function getFeaturePropertyValue(theme, feature, requestedKey) {
   if (!requestedKey) return undefined;
   
   if (feature.properties[requestedKey] !== undefined && feature.properties[requestedKey] !== '') return feature.properties[requestedKey];
   
   if (theme && theme.formId && typeof allForms !== 'undefined') {
       const form = allForms.find(f => f.id === theme.formId);
       if (form && (form.schema || form.tabs)) {
           const schema = form.schema || form.tabs;
           for (const tab of schema) {
               if (tab.fields) {
                   const field = tab.fields.find(f => 
                       (f.label && f.label.toLowerCase() === requestedKey.toLowerCase()) || 
                       (f.name && f.name.toLowerCase() === requestedKey.toLowerCase()) ||
                       f.id === requestedKey
                   );
                   if (field && feature.properties[field.id] !== undefined && feature.properties[field.id] !== '') {
                       return feature.properties[field.id];
                   }
               }
           }
       }
   }
   
   const lowerKey = requestedKey.toLowerCase();
   for (const p in feature.properties) {
       if (p.toLowerCase() === lowerKey) return feature.properties[p];
   }
   
   return undefined;
}

function getThemeFieldLabel(theme, key) {
    if (!key) return '';
    if (theme && theme.formId && typeof allForms !== 'undefined') {
        const form = allForms.find(f => f.id === theme.formId);
        if (form && (form.schema || form.tabs)) {
            const schema = form.schema || form.tabs;
            for (const tab of schema) {
                if (tab.fields) {
                    const field = tab.fields.find(f => f.id === key || (f.label && f.label.toLowerCase() === key.toLowerCase()) || (f.name && f.name.toLowerCase() === key.toLowerCase()));
                    if (field) return field.label || field.name || key;
                }
            }
        }
    }
    return key;
}
const cabedeloCenter = [-7.0182, -34.8336];

let map;
let currentMapType = 'Mapa';
let themes = [];
let editingThemeId = null;
let geojsonLayer;
let baseLayers = {};

// --- DADOS E LOCALSTORAGE ---
function loadThemes() {
  const saved = localStorage.getItem('constructive_themes');
  if (saved) {
    themes = JSON.parse(saved);
  } else {
    themes = [
      { id: 'obras', name: 'Projetos / Obras', color: '#051125', features: [] }
    ];
    saveThemes();
  }
}

function saveThemes() {
  localStorage.setItem('constructive_themes', JSON.stringify(themes));
}

function showWarningToast(message) {
    const existing = document.getElementById('warning-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.id = 'warning-toast';
    toast.className = 'fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md text-white px-6 py-4 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-primary/30 z-[9999] flex items-center gap-3 transition-all duration-300 transform translate-y-10 opacity-0';
    toast.innerHTML = `
        <span class="material-symbols-outlined text-primary text-2xl">info</span>
        <span class="font-medium tracking-wide">${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    }, 10);
    
    // Remove after 3s
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- LEAFLET MAP ---
function initMap() {
  map = L.map('map', {
    zoomControl: false, // We use our custom zoom buttons
    maxZoom: 24,
    preferCanvas: true // Fixes html2canvas vector offset issues
  }).setView(cabedeloCenter, 13);

  // Define Base Layers
  baseLayers['Mapa'] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxNativeZoom: 19,
    maxZoom: 24
  });
  
  baseLayers['Satélite'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxNativeZoom: 19,
    maxZoom: 24
  });

  baseLayers['Híbrido'] = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 24 }),
    L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner-hybrid/{z}/{x}/{y}{r}.png', { maxNativeZoom: 20, maxZoom: 24 })
  ]);

  baseLayers['Mapa'].addTo(map);

  // Geoman Options
  if (map.pm) {
    try {
        map.pm.setLang('pt_br');
    } catch(e) {}
    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawPolygon: false,
      drawCircle: false,
      drawText: false,
      editMode: false,
      dragMode: false,
      cutPolygon: false,
      removalMode: false,
    });
  } else {
    console.warn("Leaflet Geoman não foi carregado corretamente.");
  }

  // Layer Group for all GeoJSON features
  geojsonLayer = L.geoJSON(null, {
    style: function(feature) {
      const themeId = feature.properties.themeId;
      const theme = themes.find(t => t.id === themeId);
      const color = theme ? theme.color : '#333333';
      const opacity = theme && theme.opacity !== undefined ? theme.opacity : 0.4;
      const weight = theme && theme.weight !== undefined ? theme.weight : 2;
      const dashArray = theme && theme.dashed ? '5, 5' : '';
      return {
        fillColor: color,
        fillOpacity: opacity,
        color: color,
        weight: weight,
        dashArray: dashArray,
        className: `theme-feature theme-${themeId}`
      };
    },
    pointToLayer: function(feature, latlng) {
      const themeId = feature.properties.themeId;
      const theme = themes.find(t => t.id === themeId);
      const color = theme ? theme.color : '#333333';
      const iconName = theme && theme.icon ? theme.icon : 'circle';
      const customIconData = theme && theme.customIcon ? theme.customIcon : null;
      
      const iconHtml = customIconData 
        ? `<img src="${customIconData}" style="width:16px; height:16px; object-fit:contain;">`
        : `<span class="material-symbols-outlined" style="color: white; font-size: 14px;">${iconName}</span>`;

      const customIcon = L.divIcon({
        className: `custom-div-icon theme-feature theme-${themeId}`,
        html: `<div style="background-color: ${customIconData ? 'white' : color}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid ${customIconData ? color : 'white'}; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                 ${iconHtml}
               </div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      return L.marker(latlng, { icon: customIcon });
    },
    onEachFeature: function(feature, layer) {
      if (!feature.properties) feature.properties = {};
      if (!feature.properties._tempId) feature.properties._tempId = 'feat_' + Math.random().toString(36).substr(2, 9);
      
      const themeId = feature.properties.themeId;
      const theme = themes.find(t => t.id === themeId);
      if (theme) {
        const disp1Key = theme.disp1 || 'Lote';
        const disp2Key = theme.disp2 || 'Quadra';
        const disp1Label = getThemeFieldLabel(theme, disp1Key);
        const disp2Label = getThemeFieldLabel(theme, disp2Key);
        const disp1Val = getFeaturePropertyValue(theme, feature, disp1Key);
        const disp2Val = getFeaturePropertyValue(theme, feature, disp2Key);
        
        let rotationStyle = '';
        if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
            try {
                let lines = feature.geometry.type === 'MultiLineString' ? layer.getLatLngs() : [layer.getLatLngs()];
                let totalLength = 0;
                let segments = [];
                lines.forEach(line => {
                    for (let i = 0; i < line.length - 1; i++) {
                        const p1 = map.project(line[i], 0);
                        const p2 = map.project(line[i+1], 0);
                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        const len = Math.sqrt(dx*dx + dy*dy);
                        totalLength += len;
                        segments.push({ len, angle: Math.atan2(dy, dx) * 180 / Math.PI });
                    }
                });
                
                let targetDist = totalLength / 2;
                let currentDist = 0;
                let bestAngle = segments.length > 0 ? segments[0].angle : 0;
                
                for (let seg of segments) {
                    currentDist += seg.len;
                    if (currentDist >= targetDist) {
                        bestAngle = seg.angle;
                        break;
                    }
                }
                
                if (segments.length > 0) {
                    let angle = bestAngle;
                    if (angle > 90 || angle < -90) {
                        angle += 180;
                    }
                    rotationStyle = `transform: rotate(${angle}deg); transform-origin: center; display: inline-block;`;
                }
            } catch(e) { console.error("Error calculating line angle:", e); }
        }

        let tooltipContent = '';
        
        const showDisp1 = theme.disp1Active !== false && disp1Val;
        const showDisp2 = theme.disp2Active !== false && disp2Val;
        
        if (showDisp1 && showDisp2) {
          tooltipContent = `<div style="${rotationStyle}" class="text-[11px] font-bold whitespace-nowrap">${disp1Label}: ${disp1Val} - ${disp2Label}: ${disp2Val}</div>`;
        } else if (showDisp1) {
          tooltipContent = `<div style="${rotationStyle}" class="text-[11px] font-bold whitespace-nowrap">${disp1Label}: ${disp1Val}</div>`;
        } else if (showDisp2) {
          tooltipContent = `<div style="${rotationStyle}" class="text-[11px] font-bold whitespace-nowrap">${disp2Label}: ${disp2Val}</div>`;
        }
        
        if (tooltipContent) {
          layer.bindTooltip(tooltipContent, {
            permanent: true,
            direction: 'center',
            className: 'leaflet-custom-label'
          });
        }
      }
      
      layer.on('click', function(e) {
        if (!window.activeSelectionThemeId) {
            showWarningToast("Selecione uma camada no painel lateral clicando nela para poder inspecionar suas feições.");
            return;
        }
        L.DomEvent.stopPropagation(e);
        const fid = feature.properties._tempId;
        highlightFeature(fid);
        showFeatureInfoModal(layer);
      });
    }
  }).addTo(map);

  // Close feature info modal when clicking on the map
  map.on('click', function(e) {
    const featureModal = document.getElementById('feature-info-modal');
    if (featureModal && !featureModal.classList.contains('hidden')) {
      // Check if we are not actively drawing or editing geometry
      const isDrawing = document.getElementById('drawing-toolbar') && !document.getElementById('drawing-toolbar').classList.contains('hidden');
      const isEditing = document.getElementById('geometry-edit-toolbar') && !document.getElementById('geometry-edit-toolbar').classList.contains('hidden');
      
      if (!isDrawing && !isEditing) {
        closeFeatureInfoModal();
      }
    }
  });

  // Drawing Complete Event
  map.on('pm:create', function(e) {
    if (!editingThemeId) return;
    
    const feature = e.layer.toGeoJSON();
    if (!feature.properties) feature.properties = {};
    feature.properties.themeId = editingThemeId;
    
    const geomType = feature.geometry.type;
    if (geomType === 'LineString' || geomType === 'MultiLineString') {
        let length = 0;
        const latlngs = e.layer.getLatLngs();
        const points = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
        for (let i = 0; i < points.length - 1; i++) {
            length += points[i].distanceTo(points[i + 1]);
        }
        feature.properties['Extensão (m)'] = length.toFixed(2);
    } else if (geomType === 'Point' || geomType === 'MultiPoint') {
        const latlng = e.layer.getLatLng();
        feature.properties['Coordenadas Geográficas WGS 84'] = `Latitude: ${latlng.lat.toFixed(6)} e Longitude: ${latlng.lng.toFixed(6)}`;
    }
    
    map.removeLayer(e.layer);
    geojsonLayer.addData(feature);
    syncMapDataToThemes();
  });

  map.on('zoomend', function() {
    updateLabelsVisibility();
  });

  loadThemes();
  renderThemes();
  loadAllFeaturesToMap();
  
  // Call it once after everything is loaded
  setTimeout(updateLabelsVisibility, 500);
}

function updateLabelsVisibility() {
    if (!geojsonLayer || !map) return;
    const currentZoom = map.getZoom();
    
    const tooltipPane = map.getPane('tooltipPane');
    if (currentZoom <= 16) {
        if (tooltipPane) tooltipPane.style.display = 'none';
        return;
    } else {
        if (tooltipPane) tooltipPane.style.display = '';
    }

    // Dynamic per-polygon logic: hide label if polygon pixel bounding box is too small
    geojsonLayer.eachLayer(layer => {
        if (!layer.getTooltip || !layer.getTooltip()) return;
        
        // Only apply to polygons
        if (!layer.getBounds) return; 
        
        const tooltipEl = layer.getTooltip()._container;
        if (!tooltipEl) return;
        
        const bounds = layer.getBounds();
        const nw = map.latLngToLayerPoint(bounds.getNorthWest());
        const se = map.latLngToLayerPoint(bounds.getSouthEast());
        
        const pxWidth = Math.abs(se.x - nw.x);
        
        // Rough estimate: ~5.5px per character + some margin
        // To be safe, we can measure the text length or just assume ~6px per char
        const text = tooltipEl.innerText || tooltipEl.textContent;
        const estimatedTextWidth = text.length * 6;
        
        if (pxWidth < estimatedTextWidth) {
            tooltipEl.style.opacity = '0';
        } else {
            tooltipEl.style.opacity = '1';
        }
    });
}

// Call initMap and setupIconDropdowns on window load since we no longer have a Google Maps callback
// This is now done at the bottom of the file


function loadAllFeaturesToMap() {
  geojsonLayer.clearLayers();
  
  const allFeatures = [];
  themes.slice().reverse().forEach(theme => {
    if (theme.visible !== false) {
      if (theme.features && theme.features.length > 0) {
        allFeatures.push(...theme.features);
      }
    }
  });
  
  if (allFeatures.length > 0) {
    geojsonLayer.addData(allFeatures);
  }
}

function syncMapDataToThemes() {
  const geojson = geojsonLayer.toGeoJSON();
  
  themes.forEach(t => t.features = []);
  
  if (geojson.features) {
    geojson.features.forEach(f => {
      const tId = f.properties.themeId;
      const theme = themes.find(t => t.id === tId);
      if (theme) {
        theme.features.push(f);
      }
    });
  }
  saveThemes();
  renderThemes();
}

// --- INTERFACE DE TEMAS ---
window.activeSelectionThemeId = null;

function toggleSelectionTheme(themeId, forceState = null) {
    const tIdStr = String(themeId);
    
    if (forceState === true) {
        window.activeSelectionThemeId = tIdStr;
    } else if (forceState === false) {
        window.activeSelectionThemeId = null;
    } else {
        if (window.activeSelectionThemeId === tIdStr) {
            window.activeSelectionThemeId = null;
        } else {
            window.activeSelectionThemeId = tIdStr;
        }
    }
    
    // Update UI styles directly without full re-render
    themes.forEach(theme => {
        const card = document.getElementById(`theme-card-${theme.id}`);
        if (!card) return;
        
        if (window.activeSelectionThemeId === String(theme.id)) {
            card.classList.add('scale-[1.02]', 'z-10', 'ring-2', 'ring-offset-2', 'ring-offset-slate-900');
            card.style.setProperty('--tw-ring-color', theme.color);
            card.style.boxShadow = `0 0 30px ${theme.color}80, inset 0 0 20px ${theme.color}60`;
            card.style.borderColor = theme.color;
        } else {
            card.classList.remove('scale-[1.02]', 'z-10', 'ring-2', 'ring-offset-2', 'ring-offset-slate-900');
            const isVisible = theme.visible !== false;
            card.style.borderRight = `1px solid ${theme.color}40`;
            card.style.borderBottom = `1px solid ${theme.color}40`;
            card.style.borderTop = '1px solid rgba(255,255,255,0.05)';
            card.style.borderLeft = '1px solid rgba(255,255,255,0.05)';
            card.style.boxShadow = isVisible ? `0 8px 32px rgba(0,0,0,0.3), 0 0 15px ${theme.color}30, inset 0 0 20px ${theme.color}10` : '0 8px 32px rgba(0,0,0,0.3)';
            card.style.removeProperty('--tw-ring-color');
        }
    });
    
    // Update map interactivity using CSS to guarantee Leaflet redraws don't override it
    let styleTag = document.getElementById('dynamic-selection-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-selection-style';
        document.head.appendChild(styleTag);
    }
    
    if (window.activeSelectionThemeId) {
        styleTag.innerHTML = `
            .theme-feature { pointer-events: none !important; }
            .theme-${window.activeSelectionThemeId} { pointer-events: auto !important; }
        `;
    } else {
        styleTag.innerHTML = '';
    }
}

function toggleThemeListAndSelection(themeId) {
    const listEl = document.getElementById('list-' + themeId);
    if (!listEl) return;
    
    const isCurrentlyHidden = listEl.classList.contains('hidden');
    
    if (isCurrentlyHidden) {
        // Accordion: Close all other lists
        themes.forEach(theme => {
            const otherList = document.getElementById('list-' + theme.id);
            if (otherList) otherList.classList.add('hidden');
        });
        
        // Open this one
        listEl.classList.remove('hidden');
        
        // Make this the active selection
        toggleSelectionTheme(themeId, true);
    } else {
        // Closing this layer
        listEl.classList.add('hidden');
        toggleSelectionTheme(themeId, false);
    }
}

function renderThemes() {
  const container = document.getElementById('themes-container');
  container.innerHTML = '';

  let draggedThemeIndex = null;

  themes.forEach((theme, index) => {
    const featureCount = theme.features ? theme.features.length : 0;
    const isVisible = theme.visible !== false;
    const isActiveSelection = window.activeSelectionThemeId === String(theme.id);
    
    const card = document.createElement('div');
    card.id = `theme-card-${theme.id}`;
    card.className = `theme-card relative overflow-hidden cursor-move transition-all duration-300 hover:bg-slate-800/30 mx-2 mb-2 rounded-xl border border-white/5 ${isActiveSelection ? 'scale-[1.02] z-10' : ''}`;
    card.draggable = true;
    card.dataset.index = index;
    card.dataset.id = theme.id;
    
    // Drag & Drop Events
    card.addEventListener('dragstart', (e) => {
      draggedThemeIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index);
      setTimeout(() => card.classList.add('opacity-40'), 0);
    });
    
    card.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (index !== draggedThemeIndex) card.classList.add('border-t-2', 'border-t-primary');
    });
    
    card.addEventListener('dragleave', (e) => {
      card.classList.remove('border-t-2', 'border-t-primary');
    });
    
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('border-t-2', 'border-t-primary');
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      if (fromIndex !== index) {
        // Reorder array
        const draggedItem = themes.splice(fromIndex, 1)[0];
        themes.splice(index, 0, draggedItem);
        saveThemes();
        renderThemes();
        loadAllFeaturesToMap(); // Sincroniza o Z-Index
      }
    });
    
    card.addEventListener('dragend', (e) => {
      card.classList.remove('opacity-40');
      document.querySelectorAll('#themes-container > div').forEach(el => el.classList.remove('border-t-2', 'border-t-primary'));
    });
    
    card.style.borderRight = `1px solid ${theme.color}40`;
    card.style.borderBottom = `1px solid ${theme.color}40`;
    if (isActiveSelection) {
        card.classList.add('ring-2', 'ring-offset-2', 'ring-offset-slate-900');
        card.style.setProperty('--tw-ring-color', theme.color);
        card.style.boxShadow = `0 0 30px ${theme.color}80, inset 0 0 20px ${theme.color}60`;
        card.style.borderColor = theme.color;
    } else {
        card.style.boxShadow = isVisible ? `0 8px 32px rgba(0,0,0,0.3), 0 0 15px ${theme.color}30, inset 0 0 20px ${theme.color}10` : '0 8px 32px rgba(0,0,0,0.3)';
    }
    card.style.background = `linear-gradient(135deg, ${theme.color}25 0%, rgba(15,23,42,0.8) 100%)`;
    
    let statsListHtml = '';
    const form = typeof allForms !== 'undefined' ? allForms.find(f => f.id === theme.formId) : null;
    if (form && form.statsConfig && form.statsConfig.length > 0) {
        statsListHtml = `<div id="stats-list-${theme.id}" class="hidden flex-col gap-2 mt-3 pt-3 border-t border-white/10 w-full transition-all">`;
        form.statsConfig.forEach((widget, idx) => {
            let iconHtml = widget.type === 'indicator' ? '123' : (widget.type === 'pie' ? 'pie_chart' : 'bar_chart');
            if (widget.type === 'indicator') {
                statsListHtml += `
                    <div class="flex items-center justify-between bg-slate-800/40 rounded-lg p-2 cursor-pointer hover:bg-slate-700/50 transition-colors" onclick="openStatsDashboard('${theme.id}', ${idx})" title="Ver Indicador">
                        <div class="flex items-center gap-2 text-slate-300">
                            <span class="material-symbols-outlined text-[16px] text-cyan-400">${iconHtml}</span>
                            <span class="text-xs font-semibold">${widget.title || 'Indicador'}</span>
                        </div>
                    </div>
                `;
            } else {
                statsListHtml += `
                    <div class="flex items-center justify-between bg-slate-800/40 rounded-lg p-2">
                        <div class="flex items-center gap-2 text-slate-300">
                            <span class="material-symbols-outlined text-[16px] text-cyan-400">${iconHtml}</span>
                            <span class="text-xs font-semibold">${widget.title || 'Gráfico'}</span>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer group" title="Ativar Análise no Mapa">
                            <input type="checkbox" name="layer-stat-toggle" class="sr-only peer layer-stat-toggle-${theme.id}" onchange="handleStatToggle('${theme.id}', ${idx}, this)">
                            <div class="w-8 h-4 bg-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-500"></div>
                        </label>
                    </div>
                `;
            }
        });
        statsListHtml += `</div>`;
    }

    card.innerHTML = `
      <div class="px-4 pt-4 pb-3 flex flex-col backdrop-blur-md">
        
        <!-- Header: Icon, Title, and Toggle -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3 cursor-pointer group" onclick="toggleThemeListAndSelection('${theme.id}')" title="Clique para expandir e isolar seleção no mapa">
            <div class="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-110 border border-white/20" style="background-color: ${theme.color}; box-shadow: 0 4px 20px ${theme.color}80;">
               <span class="material-symbols-outlined text-[24px]">${theme.icon || 'layers'}</span>
            </div>
            <div class="flex flex-col">
              <h3 class="text-base font-black text-slate-800 dark:text-white tracking-widest uppercase drop-shadow-md ${!isVisible ? 'opacity-50' : ''}">${theme.name}</h3>
              <div class="text-[12px] font-bold text-slate-800 dark:text-slate-300 mt-0.5">
                ${featureCount} <span class="text-[10px] text-slate-500 font-normal uppercase tracking-wider">Registros</span>
              </div>
            </div>
          </div>
          
          <!-- iOS-style Neon Toggle -->
          <label class="relative inline-flex items-center cursor-pointer" title="${isVisible ? 'Ocultar' : 'Mostrar'} Camada">
            <input type="checkbox" class="sr-only peer" ${isVisible ? 'checked' : ''} onchange="toggleThemeVisibility('${theme.id}')">
            <div class="w-11 h-6 bg-slate-300 dark:bg-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all" style="${isVisible ? `background-color: ${theme.color}; box-shadow: 0 0 12px ${theme.color}90; border-color: ${theme.color}` : ''}"></div>
          </label>
        </div>
        
        <!-- Footer: Actions -->
        <div class="flex justify-between items-center border-t border-white/20 dark:border-white/10 pt-3 w-full">
            <button onclick="toggleThemeStatsList('${theme.id}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-800 dark:text-slate-200 transition-colors" title="Painel de Estatísticas">
              <span class="material-symbols-outlined text-[18px]">pie_chart</span>
            </button>
            <button onclick="startEditingTheme('${theme.id}', '${theme.name}', '${theme.color}', '${theme.geomType || ''}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-800 dark:text-slate-200 transition-colors" title="Adicionar Feição">
              <span class="material-symbols-outlined text-[18px]">add</span>
            </button>
            <button onclick="openEditThemeModal('${theme.id}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-800 dark:text-slate-200 transition-colors" title="Editar Camada">
              <span class="material-symbols-outlined text-[18px]">settings</span>
            </button>
            <button onclick="triggerUpload('${theme.id}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-800 dark:text-slate-200 transition-colors" title="Importar GeoJSON">
              <span class="material-symbols-outlined text-[18px]">upload</span>
            </button>
            <button onclick="triggerTableUpload('${theme.id}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-800 dark:text-slate-200 transition-colors" title="Vincular Tabela (CSV)">
              <span class="material-symbols-outlined text-[18px]">table_chart</span>
            </button>
            <input type="file" id="table-upload-${theme.id}" class="hidden" accept=".csv" onchange="handleTableUpload(event, '${theme.id}')">
            <button onclick="downloadGeoJSON('${theme.id}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-800 dark:text-slate-200 transition-colors" title="Exportar">
              <span class="material-symbols-outlined text-[18px]">download</span>
            </button>
            <button onclick="deleteTheme('${theme.id}')" class="p-1.5 hover:bg-red-500/30 rounded-lg tooltip text-red-500 transition-colors" title="Excluir">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
        </div>
        ${statsListHtml}
      </div>
      
      <div id="list-${theme.id}" class="bg-black/20 dark:bg-black/40 border-t border-white/10 hidden backdrop-blur-md">
        <div class="p-2 border-b border-white/5 bg-slate-50 dark:bg-slate-900/50">
          <div class="flex items-center justify-between mb-2">
             <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filtro Avançado</span>
             <div class="flex items-center gap-1">
                 <button onclick="clearAllFilters('${theme.id}')" class="text-[10px] bg-white/50 dark:bg-white/10 text-slate-700 dark:text-slate-200 px-1.5 py-1 rounded hover:bg-white/80 dark:hover:bg-white/20 transition-colors flex items-center justify-center tooltip" title="Limpar Filtro">
                    <span class="material-symbols-outlined text-[14px]">close</span>
                 </button>
                 <button onclick="addFilterRow('${theme.id}')" class="text-[10px] bg-white/50 dark:bg-white/10 text-slate-700 dark:text-slate-200 px-2 py-1 rounded hover:bg-white/80 dark:hover:bg-white/20 transition-colors flex items-center gap-1">
                    <span class="material-symbols-outlined text-[12px]">add</span> Condição
                 </button>
             </div>
          </div>
          <div id="filters-container-${theme.id}" class="flex flex-col gap-1.5">
             <div class="filter-row flex gap-1">
                <select class="filter-field w-1/3 text-[10px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1 py-1 text-slate-700 dark:text-slate-300" onchange="updateFilterValueInput(this, '${theme.id}')">
                   <option value="ALL">Qualquer Campo</option>
                   ${getThemeFieldsOptions(theme)}
                </select>
                <div class="flex w-2/3 gap-1 filter-value-container">
                   <input type="text" class="filter-value w-full text-[10px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-700 dark:text-slate-300" placeholder="Contém..." onkeyup="executeSearch('${theme.id}')">
                </div>
             </div>
          </div>
        </div>
        <div class="theme-feature-list flex flex-col max-h-64 overflow-y-auto ${!isVisible ? 'opacity-50' : ''} p-2 gap-2" id="feature-list-${theme.id}">
          ${renderFeatureListItems(theme)}
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function toggleThemeVisibility(themeId) {
  const theme = themes.find(t => t.id === themeId);
  if (theme) {
    theme.visible = theme.visible === false ? true : false;
    saveThemes();
    loadAllFeaturesToMap();
    renderThemes();
  }
}

function renderFeatureListItems(theme) {
  if (!theme.features || theme.features.length === 0) {
    return `<div class="px-4 py-3 text-xs text-slate-400 italic">Nenhuma feição adicionada.</div>`;
  }
  
  const disp1 = theme.disp1 || 'Lote';
  const disp2 = theme.disp2 || 'Quadra';
  
  let html = '';
  theme.features.forEach((f, idx) => {
    // Collect all values for search filtering
    const searchData = Object.values(f.properties || {}).join(' ').toLowerCase();
    
    // We need a stable identifier. Since properties might not have an ID, we use index.
    // Better to assign a temporary ID for clicking if not exists.
    if (!f.properties._tempId) f.properties._tempId = 'feat_' + Math.random().toString(36).substr(2, 9);
    const fid = f.properties._tempId;
    const titleField = theme.mainTitle ? theme.mainTitle : 'Proprietário';
    
    const titleLabel = getThemeFieldLabel(theme, titleField);
    const disp1Label = getThemeFieldLabel(theme, disp1);
    const disp2Label = getThemeFieldLabel(theme, disp2);

    const propName = getFeaturePropertyValue(theme, f, titleField) || getFeaturePropertyValue(theme, f, 'Nome do Proprietário/Possuidor') || (theme.mainTitle ? `Sem dado para ${titleLabel}` : 'Proprietário não informado');
    const val1 = getFeaturePropertyValue(theme, f, disp1) || '-';
    const val2 = getFeaturePropertyValue(theme, f, disp2) || '-';
    
    const showDisp1 = theme.disp1Active !== false;
    const showDisp2 = theme.disp2Active !== false;
    
    let subHtml = '';
    if (showDisp1 && showDisp2) {
        subHtml = `<span class="font-medium">${disp1Label}:</span> ${val1} <span class="mx-1 text-slate-300 dark:text-slate-700">&bull;</span> <span class="font-medium">${disp2Label}:</span> ${val2}`;
    } else if (showDisp1) {
        subHtml = `<span class="font-medium">${disp1Label}:</span> ${val1}`;
    } else if (showDisp2) {
        subHtml = `<span class="font-medium">${disp2Label}:</span> ${val2}`;
    }
    
    html += `
      <div id="sidebar-item-${fid}" class="feature-list-item px-4 py-2 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-all duration-300 border-l-4 border-l-transparent"
           data-search="${searchData}"
           onclick="zoomToFeature('${fid}')">
         <div class="text-xs font-semibold text-slate-800 dark:text-slate-200 break-words" title="${propName}">${propName}</div>
         ${subHtml ? `<div class="text-[10px] text-slate-500 break-words mt-0.5">${subHtml}</div>` : ''}
      </div>
    `;
  });
  return html;
}

function getThemeFieldsOptions(theme) {
    let optionsHtml = '';
    if (theme.formId && typeof allForms !== 'undefined') {
        const form = allForms.find(f => f.id === theme.formId);
        if (form && (form.schema || form.tabs)) {
            const schema = form.schema || form.tabs;
            schema.forEach(tab => {
                if (tab.fields) {
                    tab.fields.forEach(f => {
                        optionsHtml += `<option value="${f.id}">${f.label}</option>`;
                    });
                }
            });
            return optionsHtml;
        }
    }
    // Fallback: extract properties from first feature
    if (theme.features && theme.features.length > 0) {
        const props = theme.features[0].properties;
        for (let key in props) {
            if (!key.startsWith('_') && key !== 'themeId') {
                optionsHtml += `<option value="${key}">${key}</option>`;
            }
        }
    }
    return optionsHtml;
}

function addFilterRow(themeId) {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;
    
    const container = document.getElementById('filters-container-' + themeId);
    const row = document.createElement('div');
    row.className = "filter-row flex gap-1";
    row.innerHTML = `
        <select class="filter-field w-1/3 text-[10px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1 py-1 text-slate-700 dark:text-slate-300" onchange="updateFilterValueInput(this, '${theme.id}')">
           <option value="ALL">Qualquer Campo</option>
           ${getThemeFieldsOptions(theme)}
        </select>
        <div class="flex w-2/3 gap-1 filter-value-container">
           <input type="text" class="filter-value w-full text-[10px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-700 dark:text-slate-300" placeholder="Contém..." onkeyup="executeSearch('${theme.id}')">
           <button onclick="this.parentElement.parentElement.remove(); executeSearch('${theme.id}')" class="text-red-500 hover:text-red-700 px-1"><span class="material-symbols-outlined text-[14px]">remove_circle</span></button>
        </div>
    `;
    container.appendChild(row);
}

function clearAllFilters(themeId) {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;
    const container = document.getElementById('filters-container-' + themeId);
    if (!container) return;
    
    container.innerHTML = `
         <div class="filter-row flex gap-1">
            <select class="filter-field w-1/3 text-[10px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1 py-1 text-slate-700 dark:text-slate-300" onchange="updateFilterValueInput(this, '${theme.id}')">
               <option value="ALL">Qualquer Campo</option>
               ${getThemeFieldsOptions(theme)}
            </select>
            <div class="flex w-2/3 gap-1 filter-value-container">
               <input type="text" class="filter-value w-full text-[10px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-700 dark:text-slate-300" placeholder="Contém..." onkeyup="executeSearch('${theme.id}')">
            </div>
         </div>
    `;
    executeSearch(themeId);
}

function updateFilterValueInput(selectEl, themeId) {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;
    
    const container = selectEl.closest('.filter-row');
    const valueContainer = container.querySelector('.filter-value-container');
    const fieldId = selectEl.value;
    
    const hasRemoveBtn = valueContainer.innerHTML.includes('remove_circle');
    const btnHtml = hasRemoveBtn ? `<button onclick="this.parentElement.parentElement.remove(); executeSearch('${theme.id}')" class="text-red-500 hover:text-red-700 px-1"><span class="material-symbols-outlined text-[14px]">remove_circle</span></button>` : '';
    
    if (fieldId === 'ALL') {
        valueContainer.innerHTML = `<input type="text" class="filter-value w-full text-[10px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-700 dark:text-slate-300" placeholder="Contém..." onkeyup="executeSearch('${theme.id}')">` + btnHtml;
    } else {
        const uniqueValues = new Set();
        if (theme.features) {
            theme.features.forEach(f => {
                const val = getFeaturePropertyValue(theme, f, fieldId);
                if (val !== undefined && val !== null && val !== '') {
                    uniqueValues.add(val.toString().trim());
                }
            });
        }
        
        const optionsHtml = Array.from(uniqueValues).sort().map(v => `<option value="${v}">${v}</option>`).join('');
        
        valueContainer.innerHTML = `<select class="filter-value w-full text-[10px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1 py-1 text-slate-700 dark:text-slate-300" onchange="executeSearch('${theme.id}')">
            <option value="">-- Todos --</option>
            ${optionsHtml}
        </select>` + btnHtml;
    }
    executeSearch(theme.id);
}

let currentHighlightData = null;

function clearHighlight() {
  document.querySelectorAll('.feature-list-item').forEach(el => {
      el.classList.remove('bg-amber-100', 'dark:bg-amber-900/40', 'border-l-amber-500');
      el.classList.add('border-l-transparent');
  });

  if (!currentHighlightData) return;
  if (currentHighlightData.type === 'style' && typeof geojsonLayer !== 'undefined' && geojsonLayer && map.hasLayer(currentHighlightData.layer)) {
    geojsonLayer.resetStyle(currentHighlightData.layer);
  } else if (currentHighlightData.type === 'marker' && map.hasLayer(currentHighlightData.layer)) {
    map.removeLayer(currentHighlightData.layer);
  }
  currentHighlightData = null;
}

function highlightFeature(fid) {
  if (typeof geojsonLayer === 'undefined' || !geojsonLayer) return;
  
  clearHighlight();
  
  // 1. Destaque no Mapa
  let targetLayer = null;
  geojsonLayer.eachLayer(layer => {
    if (layer.feature && layer.feature.properties._tempId === fid) {
      targetLayer = layer;
    }
  });
  
  if (targetLayer) {
    // Zoom/Center to feature
    if (targetLayer.getBounds) {
      map.flyToBounds(targetLayer.getBounds(), { maxZoom: 18, duration: 0.5 });
    } else if (targetLayer.getLatLng) {
      map.flyTo(targetLayer.getLatLng(), Math.max(map.getZoom(), 18), { duration: 0.5 });
    }

    if (targetLayer.setStyle) {
      targetLayer.setStyle({ color: '#f59e0b', weight: 6, fillOpacity: 0.8 });
      currentHighlightData = { type: 'style', layer: targetLayer };
    } else if (targetLayer.getLatLng) {
      const highlight = L.circleMarker(targetLayer.getLatLng(), {
        radius: 12, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.8, weight: 3
      }).addTo(map);
      currentHighlightData = { type: 'marker', layer: highlight };
    }
  }

  // 2. Destaque no Menu Lateral
  const sidebarItem = document.getElementById(`sidebar-item-${fid}`);
  if (sidebarItem) {
    // Garantir que a lista do tema está aberta
    const themeList = sidebarItem.closest('[id^="list-theme_"]');
    if (themeList && themeList.classList.contains('hidden')) {
      themeList.classList.remove('hidden');
    }
    
    // Rolar até o item
    sidebarItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Aplicar classes de destaque
    sidebarItem.classList.add('bg-amber-100', 'dark:bg-amber-900/40', 'border-l-amber-500');
    sidebarItem.classList.remove('border-l-transparent');
  }
}

function zoomToFeature(fid) {
  if (!geojsonLayer) return;
  
  let targetLayer = null;
  geojsonLayer.eachLayer(layer => {
    if (layer.feature && layer.feature.properties._tempId === fid) {
      targetLayer = layer;
    }
  });
  
  if (targetLayer) {
    if (targetLayer.getBounds) {
      map.fitBounds(targetLayer.getBounds(), { padding: [50, 50], maxZoom: 21 });
    } else if (targetLayer.getLatLng) {
      map.setView(targetLayer.getLatLng(), 21);
    }
    
    highlightFeature(fid);
    
    // Fechar menu lateral em telas menores
    if (window.innerWidth < 768) {
      document.getElementById('side-drawer').classList.add('-translate-x-[120%]');
      document.getElementById('drawer-overlay').classList.add('hidden');
    }
  }
}

function executeSearch(themeId) {
  const container = document.getElementById('filters-container-' + themeId);
  if (!container) return;
  
  const rules = [];
  container.querySelectorAll('.filter-row').forEach(row => {
      const field = row.querySelector('.filter-field').value;
      const value = row.querySelector('.filter-value').value.toLowerCase().trim();
      if (value !== '') {
          rules.push({ field, value });
      }
  });

  const theme = themes.find(t => t.id === themeId);
  if(!theme) return;

  const listContainer = document.getElementById('feature-list-' + themeId);
  if (!listContainer) return;
  
  const featureItems = listContainer.querySelectorAll('.feature-list-item');
  const visibleFids = new Set();
  const hasAnyFilter = rules.length > 0;
  
  featureItems.forEach(item => {
    const fid = item.id.replace('sidebar-item-', '');
    const feature = theme.features.find(f => f.properties._tempId === fid);
    
    let match = true;
    
    if (hasAnyFilter) {
        for (let rule of rules) {
            if (rule.field === 'ALL') {
                const searchData = item.getAttribute('data-search') || '';
                if (!searchData.includes(rule.value)) { match = false; break; }
            } else {
                if (feature) {
                    const val = getFeaturePropertyValue(theme, feature, rule.field) || '';
                    if (!val.toString().toLowerCase().includes(rule.value)) { match = false; break; }
                } else {
                    match = false; break;
                }
            }
        }
    }

    if (match) {
      item.style.display = 'block';
      visibleFids.add(fid);
    } else {
      item.style.display = 'none';
    }
  });

  // Filter map layer directly
  let bounds = L.latLngBounds();
  let hasVisibleFeatures = false;

  if (geojsonLayer) {
    geojsonLayer.eachLayer(layer => {
      if (layer.feature && layer.feature.properties.themeId === themeId) {
        const fid = layer.feature.properties._tempId;
        if (visibleFids.has(fid)) {
          if (!map.hasLayer(layer)) {
             map.addLayer(layer);
          }
          if (hasAnyFilter) {
            if (layer.getBounds) {
                bounds.extend(layer.getBounds());
            } else if (layer.getLatLng) {
                bounds.extend(layer.getLatLng());
            }
            hasVisibleFeatures = true;
          }
        } else {
          if (map.hasLayer(layer)) {
             map.removeLayer(layer);
          }
        }
      }
    });

    if (hasAnyFilter && hasVisibleFeatures && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 21 });
        
        // Fechar menu lateral em telas menores para visualizar melhor os resultados
        if (window.innerWidth < 768) {
            document.getElementById('side-drawer').classList.add('-translate-x-[120%]');
            const overlay = document.getElementById('drawer-overlay');
            if (overlay) overlay.classList.add('hidden');
        }
    }
  }
}

function openStatsDashboard(themeId) {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;
    
    // UI logic to open stats modal
    const modal = document.getElementById('stats-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderStats(theme);
    }
}

function getThemeFieldLabel(theme, fieldId) {
    if (!theme.formId || typeof allForms === 'undefined') return fieldId;
    const form = allForms.find(f => f.id === theme.formId);
    if (!form) return fieldId;
    
    let label = fieldId;
    const schema = form.schema || form.tabs;
    if (schema) {
        schema.forEach(tab => {
            if (tab.fields) {
                tab.fields.forEach(f => {
                    if (f.id === fieldId) label = f.label;
                });
            }
        });
    }
    return label;
}

function filterThemeFeatures(themeId) {
  const query = document.getElementById('search-' + themeId).value.toLowerCase();
  const listContainer = document.getElementById('feature-list-' + themeId);
  if (!listContainer) return;
  
  const featureItems = listContainer.querySelectorAll('.feature-list-item');
  
  featureItems.forEach(item => {
    const searchData = item.getAttribute('data-search');
    if (searchData.includes(query)) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
}

function openNewThemeModal() {
  document.getElementById('new-theme-modal').classList.remove('hidden');
  document.getElementById('theme-name-input').value = '';
}

function closeNewThemeModal() {
  document.getElementById('new-theme-modal').classList.add('hidden');
}

function handleCustomIconUpload(input, previewContainerId, dataInputId, labelId) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      const dataUrl = e.target.result;
      document.getElementById(dataInputId).value = dataUrl;
      document.getElementById(previewContainerId).innerHTML = `<img src="${dataUrl}" class="w-5 h-5 object-contain">`;
      if (labelId) document.getElementById(labelId).innerText = file.name;
    };
    reader.readAsDataURL(file);
  }
}

let themeBeingEdited = null;

function saveNewTheme() {
  const name = document.getElementById('theme-name-input').value;
  const color = document.getElementById('theme-color-input').value;
  const opacity = parseFloat(document.getElementById('theme-opacity-input').value);
  const geomType = document.getElementById('theme-geometry') ? document.getElementById('theme-geometry').value : null;
  const icon = document.getElementById('theme-icon-input').value;
  const customIcon = document.getElementById('theme-custom-icon-data').value;
  const formId = document.getElementById('theme-cadastro-type') ? document.getElementById('theme-cadastro-type').value : '';
  if (!name) return;

  const id = 'theme_' + Date.now();
  themes.push({ id, name, color, opacity, geomType, icon, customIcon, formId, disp1Active: false, disp2Active: false, features: [] });
  saveThemes();
  renderThemes();
  closeNewThemeModal();
  
  startEditingTheme(id, name, color, geomType);
}

function openEditThemeModal(themeId) {
  const theme = themes.find(t => t.id === themeId);
  if (!theme) return;
  themeBeingEdited = themeId;
  document.getElementById('edit-theme-name-input').value = theme.name;
  document.getElementById('edit-theme-color-input').value = theme.color;
  
  const opacityVal = theme.opacity !== undefined ? theme.opacity : 0.4;
  document.getElementById('edit-theme-opacity-input').value = opacityVal;
  document.getElementById('edit-theme-opacity-val').textContent = Math.round(opacityVal * 100) + '%';
  
  const customIconVal = theme.customIcon || '';
  document.getElementById('edit-theme-custom-icon-data').value = customIconVal;
  
  document.getElementById('edit-theme-weight-input').value = theme.weight !== undefined ? theme.weight : 2;
  document.getElementById('edit-theme-weight-val').textContent = theme.weight !== undefined ? theme.weight : 2;
  document.getElementById('edit-theme-dashed-input').checked = !!theme.dashed;
  
  document.getElementById('edit-theme-disp1-active').checked = theme.disp1Active !== false;
  document.getElementById('edit-theme-disp2-active').checked = theme.disp2Active !== false;
  
  const formSelect = document.getElementById('edit-theme-cadastro-type');
  if (formSelect) {
      formSelect.value = theme.formId || '';
  }
  
  updateEditThemeFields();
  
  document.getElementById('edit-theme-disp1-input').value = theme.disp1 || 'Lote';
  document.getElementById('edit-theme-disp2-input').value = theme.disp2 || 'Quadra';
  document.getElementById('edit-theme-main-title').value = theme.mainTitle || '';
  
  const iconVal = theme.icon || 'circle';
  document.getElementById('edit-theme-icon-input').value = iconVal;
  
  const option = availableIcons.find(o => o.val === iconVal) || availableIcons[0];
  if (customIconVal) {
    document.getElementById('edit-icon-preview-container').innerHTML = `<img src="${customIconVal}" class="w-5 h-5 object-contain">`;
    document.getElementById('edit-icon-label').innerText = "Ícone Personalizado";
  } else {
    document.getElementById('edit-icon-preview-container').innerHTML = `<span class="material-symbols-outlined text-[20px] text-primary" id="edit-icon-preview">${option.val}</span><span id="edit-icon-label" class="text-sm">${option.label}</span>`;
  }
  
  document.getElementById('edit-theme-modal').classList.remove('hidden');
}

function closeEditThemeModal() {
  document.getElementById('edit-theme-modal').classList.add('hidden');
  themeBeingEdited = null;
}

function updateIconDropdownSelection(prefix, val) {
  const option = availableIcons.find(o => o.val === val) || availableIcons[0];
  document.getElementById(`${prefix}-theme-icon-input`).value = option.val;
  document.getElementById(`${prefix}-preview`).innerText = option.val;
  document.getElementById(`${prefix}-label`).innerText = option.label;
}

function updateEditThemeFields() {
    const formId = document.getElementById('edit-theme-cadastro-type') ? document.getElementById('edit-theme-cadastro-type').value : '';
    const disp1Select = document.getElementById('edit-theme-disp1-input');
    const disp2Select = document.getElementById('edit-theme-disp2-input');
    const mainTitleSelect = document.getElementById('edit-theme-main-title');
    
    let optionsHtml = '<option value="">-- Automático / Padrão --</option>';
    
    if (formId && typeof allForms !== 'undefined') {
        const form = allForms.find(f => f.id === formId);
        if (form) {
            const schema = form.schema || form.tabs;
            if (schema) {
                schema.forEach(tab => {
                    if (tab.fields) {
                        tab.fields.forEach(f => {
                            optionsHtml += `<option value="${f.id}">${f.label}</option>`;
                        });
                    }
                });
            }
        }
    } else {
        let allKeys = new Set(["Proprietário", "CPF/CNPJ", "Endereço", "Número do imóvel", "Lote", "Quadra", "Bairro", "Loteamento", "Município"]);
        const theme = themes.find(t => t.id === themeBeingEdited);
        if (theme && theme.features) {
            theme.features.forEach(f => {
                if (f.properties) Object.keys(f.properties).forEach(k => {
                    if (k !== 'themeId' && k !== '_tempId') allKeys.add(k);
                });
            });
        }
        Array.from(allKeys).forEach(k => {
            optionsHtml += `<option value="${k}">${k}</option>`;
        });
    }
    
    if (disp1Select) disp1Select.innerHTML = optionsHtml;
    if (disp2Select) disp2Select.innerHTML = optionsHtml;
    if (mainTitleSelect) mainTitleSelect.innerHTML = optionsHtml;
}

function saveEditedTheme() {
  const name = document.getElementById('edit-theme-name-input').value;
  const color = document.getElementById('edit-theme-color-input').value;
  const opacity = parseFloat(document.getElementById('edit-theme-opacity-input').value);
  const weight = parseInt(document.getElementById('edit-theme-weight-input').value);
  const dashed = document.getElementById('edit-theme-dashed-input').checked;
  const icon = document.getElementById('edit-theme-icon-input').value;
  const customIcon = document.getElementById('edit-theme-custom-icon-data').value;
  const disp1 = document.getElementById('edit-theme-disp1-input').value;
  const disp2 = document.getElementById('edit-theme-disp2-input').value;
  const mainTitle = document.getElementById('edit-theme-main-title').value;
  const disp1Active = document.getElementById('edit-theme-disp1-active').checked;
  const disp2Active = document.getElementById('edit-theme-disp2-active').checked;
  const formId = document.getElementById('edit-theme-cadastro-type') ? document.getElementById('edit-theme-cadastro-type').value : '';
  
  if (!name || !themeBeingEdited) return;

  const theme = themes.find(t => t.id === themeBeingEdited);
  if (theme) {
    theme.name = name;
    theme.color = color;
    theme.opacity = opacity;
    theme.weight = weight;
    theme.dashed = dashed;
    theme.icon = icon;
    theme.customIcon = customIcon;
    theme.disp1 = disp1 || 'Lote';
    theme.disp2 = disp2 || 'Quadra';
    theme.mainTitle = mainTitle;
    theme.disp1Active = disp1Active;
    theme.disp2Active = disp2Active;
    theme.formId = formId;
    saveThemes();
    loadAllFeaturesToMap(); // Update colors on the map
    renderThemes();
  }
  closeEditThemeModal();
}

function deleteTheme(themeId) {
  if (!confirm("Tem certeza que deseja excluir esta camada e todos os seus dados?")) return;
  
  themes = themes.filter(t => t.id !== themeId);
  saveThemes();
  loadAllFeaturesToMap();
  renderThemes();
}

// --- FERRAMENTAS DE DESENHO E ADERÊNCIA ---
let isSnapping = true;
function toggleSnapping() {
  isSnapping = !isSnapping;
  map.pm.setGlobalOptions({ snappable: isSnapping });
  
  const btn = document.getElementById('snap-btn');
  if (isSnapping) {
    btn.classList.add('text-primary');
    btn.classList.remove('text-slate-400');
    btn.title = "Aderência Ativada (Vértices e Arestas)";
  } else {
    btn.classList.remove('text-primary');
    btn.classList.add('text-slate-400');
    btn.title = "Aderência Desativada";
  }
}

function startEditingTheme(id, name, color, geomType) {
  editingThemeId = id;
  
  const theme = themes.find(t => t.id === id);
  const themeOpacity = theme && theme.opacity !== undefined ? theme.opacity : 0.4;
  
  // Configuração global de aderência (Snap) e estilo do Geoman
  map.pm.setGlobalOptions({
    snappable: true,
    snapDistance: 20,
    snapMiddle: true,
    snapSegment: true,
    pathOptions: {
      color: color,
      fillColor: color,
      fillOpacity: themeOpacity,
      weight: theme && theme.weight !== undefined ? theme.weight : 2,
      dashArray: theme && theme.dashed ? '5, 5' : ''
    }
  });

  // Configurações e estilos do Geoman para desenhos
  // Se a camada já possui feições e não há geomType, deduzimos da primeira feição
  if (!geomType && theme && theme.features && theme.features.length > 0) {
    geomType = theme.features[0].geometry.type;
  }
  
  // Converter os tipos GeoJSON padronizados para os equivalentes da barra de ferramentas/Geoman
  if (geomType === 'Point' || geomType === 'MultiPoint') geomType = 'marker';
  else if (geomType === 'LineString' || geomType === 'MultiLineString') geomType = 'polyline';
  else if (geomType === 'Polygon' || geomType === 'MultiPolygon') geomType = 'polygon';
  
  const toolbar = document.getElementById('drawing-toolbar');
  toolbar.classList.remove('hidden');
  toolbar.classList.add('flex');
  
  const nameLabel = document.getElementById('drawing-theme-name');
  nameLabel.textContent = "Editando: " + name;
  nameLabel.style.color = color;
  
  // Show only the relevant button
  ['marker', 'polyline', 'polygon'].forEach(type => {
    const btn = document.getElementById('draw-btn-' + type);
    if (btn) {
      if (type === geomType || !geomType) {
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
    }
  });

  // Automatically start drawing
  if (geomType) {
    setDrawingMode(geomType);
  }
  
  document.getElementById('side-drawer').classList.add('-translate-x-[120%]'); 
  document.getElementById('drawer-overlay').classList.add('hidden');
}

function setDrawingMode(mode) {
  if (mode === 'marker') map.pm.enableDraw('Marker');
  else if (mode === 'polyline') map.pm.enableDraw('Line');
  else if (mode === 'polygon') map.pm.enableDraw('Polygon');
}

function stopDrawingMode() {
  editingThemeId = null;
  map.pm.disableDraw();
  const toolbar = document.getElementById('drawing-toolbar');
  toolbar.classList.add('hidden');
  toolbar.classList.remove('flex');
}

// --- IMPORT / EXPORT GEOJSON ---
let activeUploadThemeId = null;

function triggerUpload(themeId) {
  activeUploadThemeId = themeId;
  document.getElementById('geojson-upload-input').click();
}

document.getElementById('geojson-upload-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file || !activeUploadThemeId) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const geojson = JSON.parse(event.target.result);
      if (geojson.features) {
        geojson.features.forEach(f => {
          if (!f.properties) f.properties = {};
          f.properties.themeId = activeUploadThemeId;
        });
      }
      
      const newLayer = L.geoJSON(geojson);
      geojsonLayer.addData(geojson);
      syncMapDataToThemes();
      
      const bounds = newLayer.getBounds();
      if (bounds.isValid()) {
          map.fitBounds(bounds);
      }
    } catch(err) {
      alert("Erro ao ler GeoJSON: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

function downloadGeoJSON(themeId) {
  const theme = themes.find(t => t.id === themeId);
  if (!theme || !theme.features) return;
  
  const geojson = {
    type: "FeatureCollection",
    features: theme.features
  };
  
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geojson));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href",     dataStr);
  downloadAnchorNode.setAttribute("download", theme.name.replace(/\s+/g, '_') + ".geojson");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

// --- GLOBAL GEOJSON IMPORT ---
let pendingGlobalGeoJSON = null;

document.getElementById('global-geojson-upload').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const geojson = JSON.parse(event.target.result);
      if (!geojson.features || geojson.features.length === 0) {
        alert("Nenhuma feição (feature) encontrada no arquivo.");
        return;
      }
      
      pendingGlobalGeoJSON = geojson;
      
      let geomType = "Misto";
      if (geojson.features[0] && geojson.features[0].geometry) {
        geomType = geojson.features[0].geometry.type;
      }
      
      const geomTypeNames = {
        "Point": "Ponto",
        "LineString": "Linha",
        "Polygon": "Polígono",
        "MultiPoint": "Múltiplos Pontos",
        "MultiLineString": "Múltiplas Linhas",
        "MultiPolygon": "Múltiplos Polígonos"
      };
      
      document.getElementById('global-import-geom-type').textContent = "Tipo Detectado: " + (geomTypeNames[geomType] || geomType);
      
      let suggestedName = file.name.replace(/\.[^/.]+$/, "");
      document.getElementById('global-import-theme-name').value = suggestedName;
      
      let detectedProperties = [];
      if (geojson.features[0] && geojson.features[0].properties) {
        detectedProperties = Object.keys(geojson.features[0].properties);
      }
      
      // Auto-select template if not selected? Not strictly requested, but we could.
      renderImportFieldMapping();
      
      document.getElementById('global-import-modal').classList.remove('hidden');
      
    } catch(err) {
      alert("Erro ao ler GeoJSON: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

function closeGlobalImportModal() {
  document.getElementById('global-import-modal').classList.add('hidden');
  pendingGlobalGeoJSON = null;
}

function renderImportFieldMapping() {
  if (!pendingGlobalGeoJSON) return;
  
  let detectedProperties = [];
  if (pendingGlobalGeoJSON.features[0] && pendingGlobalGeoJSON.features[0].properties) {
    detectedProperties = Object.keys(pendingGlobalGeoJSON.features[0].properties);
  }
  
  const fieldsContainer = document.getElementById('global-import-fields-container');
  fieldsContainer.innerHTML = '';
  
  if (detectedProperties.length === 0) {
    fieldsContainer.innerHTML = '<span class="text-sm text-slate-500">Nenhum campo de dados encontrado.</span>';
    return;
  }
  
  const selectedFormId = document.getElementById('global-import-cadastro-type') ? document.getElementById('global-import-cadastro-type').value : '';
  let formFields = [];
  
  if (selectedFormId && typeof allForms !== 'undefined') {
    const form = allForms.find(f => f.id === selectedFormId);
    if (form) {
       const schema = form.schema || form.tabs;
       if (schema) {
           schema.forEach(tab => {
               if (tab.fields) {
                   formFields.push(...tab.fields);
               }
           });
       }
    }
  }

  const normalizeStr = (s) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "") : "";

  let htmlContent = '';
  detectedProperties.forEach(prop => {
    let mappingControl = '';
    
    // Auto-match
    if (formFields.length > 0) {
       const normProp = normalizeStr(prop);
       const match = formFields.find(f => {
           const normLabel = normalizeStr(f.label);
           const normName = normalizeStr(f.name);
           return normLabel === normProp || normName === normProp || (normProp.length > 3 && (normLabel.includes(normProp) || normProp.includes(normLabel)));
       });
       
       let options = `<option value="${prop}">-- Manter original (${prop}) --</option>`;
       formFields.forEach(f => {
           const isSelected = (match && match.id === f.id) ? 'selected' : '';
           options += `<option value="${f.id}" ${isSelected}>${f.label}</option>`;
           if (f.type === 'cep') {
               options += `<option value="${f.id}__cep"> ↳ ${f.label} (CEP)</option>`;
               options += `<option value="${f.id}__logradouro"> ↳ ${f.label} (Rua/Logradouro)</option>`;
               options += `<option value="${f.id}__numero"> ↳ ${f.label} (Número)</option>`;
               options += `<option value="${f.id}__complemento"> ↳ ${f.label} (Complemento)</option>`;
               options += `<option value="${f.id}__bairro"> ↳ ${f.label} (Bairro)</option>`;
               options += `<option value="${f.id}__cidade"> ↳ ${f.label} (Cidade)</option>`;
               options += `<option value="${f.id}__uf"> ↳ ${f.label} (UF)</option>`;
           }
       });
       
       mappingControl = `<select data-original="${prop}" class="flex-1 px-2 py-1 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-primary dark:text-white property-rename-select">${options}</select>`;
    } else {
        mappingControl = `<input type="text" list="standard-fields-list" data-original="${prop}" value="${prop}" class="flex-1 px-2 py-1 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-primary dark:text-white property-rename-input">`;
    }
    
    htmlContent += `
      <div class="flex items-center gap-2 mb-2">
        <input type="checkbox" checked class="property-import-checkbox w-4 h-4 text-primary rounded border-slate-300 dark:border-slate-700 focus:ring-primary" data-original="${prop}">
        <span class="w-1/3 text-sm text-slate-600 dark:text-slate-400 font-mono truncate" title="${prop}">${prop}</span>
        <span class="material-symbols-outlined text-slate-400 text-sm">arrow_forward</span>
        ${mappingControl}
      </div>
    `;
  });
  
  if (formFields.length === 0) {
      fieldsContainer.innerHTML = `
        <datalist id="standard-fields-list">
          <option value="Proprietário">
          <option value="CPF/CNPJ">
          <option value="Endereço">
          <option value="Número do imóvel">
          <option value="Bairro">
          <option value="Loteamento">
          <option value="Quadra">
          <option value="Lote">
          <option value="Município">
        </datalist>
      ` + htmlContent;
  } else {
      fieldsContainer.innerHTML = htmlContent;
  }
}

function confirmGlobalImport() {
  if (!pendingGlobalGeoJSON) return;
  
  let themeName = document.getElementById('global-import-theme-name').value.trim();
  
  const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
  const themeColor = colors[Math.floor(Math.random() * colors.length)];
  
  const themeId = 'theme_' + Date.now();
  
  const mapping = {};
  const hiddenFields = [];
  
  document.querySelectorAll('.property-import-checkbox').forEach(checkbox => {
    const original = checkbox.getAttribute('data-original');
    if (!checkbox.checked) {
      hiddenFields.push(original); // Will be stored but hidden from UI
    }
  });

  document.querySelectorAll('.property-rename-input, .property-rename-select').forEach(input => {
    const original = input.getAttribute('data-original');
    const newName = input.value.trim() || original;
    mapping[original] = newName;
    
    // If it was mapped to a new name and is hidden, update the hidden list
    if (hiddenFields.includes(original) && original !== newName) {
        hiddenFields[hiddenFields.indexOf(original)] = newName;
    }
  });
  
  const standardFields = ["Proprietário", "CPF/CNPJ", "Endereço", "Número do imóvel", "Bairro", "Loteamento", "Quadra", "Lote", "Município"];
  const formId = document.getElementById('global-import-cadastro-type') ? document.getElementById('global-import-cadastro-type').value : '';

  let formFieldsMap = {};
  if (formId && typeof allForms !== 'undefined') {
      const form = allForms.find(f => f.id === formId);
      if (form) {
          themeName = form.name || themeName;
          const schema = form.schema || form.tabs;
          if (schema) {
              schema.forEach(tab => {
                  if (tab.fields) {
                      tab.fields.forEach(field => {
                          formFieldsMap[field.id] = field.type;
                      });
                  }
              });
          }
      }
  }

  pendingGlobalGeoJSON.features.forEach(f => {
    if (!f.properties) f.properties = {};
    
    const newProps = { themeId: themeId };
    
    // Process all properties
    Object.keys(f.properties).forEach(key => {
      if (key !== 'themeId') {
        const mappedKey = mapping[key] || key;
        let val = f.properties[key];
        
        let actualKey = mappedKey;
        let subField = null;
        if (mappedKey.includes('__')) {
            const parts = mappedKey.split('__');
            actualKey = parts[0];
            subField = parts[1];
        }
        
        if (formFieldsMap[actualKey]) {
            const fieldType = formFieldsMap[actualKey];
            if (fieldType === 'cpfcnpj' && typeof val === 'string') {
                val = val.replace(/\D/g, ''); // Extract only numbers
            } else if (fieldType === 'cep') {
                let currentCep = { cep: "", logradouro: "", numero: "", bairro: "", cidade: "", uf: "", complemento: "" };
                if (newProps[actualKey] && newProps[actualKey].startsWith('{')) {
                    try { currentCep = Object.assign(currentCep, JSON.parse(newProps[actualKey])); } catch(e) {}
                }
                
                let lowerVal = String(val).trim();
                
                if (subField) {
                    if (subField === 'cep') currentCep.cep = lowerVal.replace(/\D/g, '');
                    else currentCep[subField] = lowerVal;
                } else {
                    let lowerKey = key.toLowerCase();
                    if (lowerKey.includes('cep')) currentCep.cep = lowerVal.replace(/\D/g, '');
                    else if (lowerKey === 'numero' || lowerKey === 'num' || lowerKey === 'nº' || lowerKey === 'n') currentCep.numero = lowerVal;
                    else if (lowerKey.includes('bairro')) currentCep.bairro = lowerVal;
                    else if (lowerKey.includes('cid') || lowerKey.includes('mun')) currentCep.cidade = lowerVal;
                    else if (lowerKey.includes('uf') || lowerKey === 'estado') currentCep.uf = lowerVal;
                    else if (lowerKey.includes('comp')) currentCep.complemento = lowerVal;
                    else currentCep.logradouro = currentCep.logradouro ? currentCep.logradouro + " " + lowerVal : lowerVal;
                }
                
                val = JSON.stringify(currentCep);
            }
        }
        
        newProps[actualKey] = val;
      }
    });
    
    // Ensure standard fields exist ONLY if no custom template is used to avoid bloat
    if (!formId) {
        standardFields.forEach(field => {
          if (!(field in newProps)) {
            newProps[field] = "";
          }
        });
    }
    
    // Store hidden fields in a special property
    if (hiddenFields.length > 0) {
        newProps['_hiddenFields'] = hiddenFields;
    }
    
    f.properties = newProps;
  });
  
  if (!themeName) themeName = "Tema Importado";
  themes.push({ id: themeId, name: themeName, color: themeColor, formId: formId, disp1Active: false, disp2Active: false, features: [] });
  
  const newLayer = L.geoJSON(pendingGlobalGeoJSON);
  geojsonLayer.addData(pendingGlobalGeoJSON);
  syncMapDataToThemes();
  
  const bounds = newLayer.getBounds();
  if (bounds.isValid()) {
      map.fitBounds(bounds);
  }
  
  closeGlobalImportModal();
  document.getElementById('side-drawer').classList.add('-translate-x-[120%]');
  document.getElementById('drawer-overlay').classList.add('hidden');
}

// --- FEATURE INFO ---
let activeFeatureLayer = null;
let isFeatureEditMode = false;

function showFeatureInfoModal(layer) {
  activeFeatureLayer = layer;
  isFeatureEditMode = false;
  renderFeatureInfo();
  
  document.getElementById('feature-info-modal').classList.remove('hidden');
  document.getElementById('feature-actions-container').classList.remove('hidden');
  document.getElementById('feature-save-container').classList.add('hidden');
}



function renderFeatureInfo() {
  const container = document.getElementById('feature-info-content');
  container.innerHTML = '';
  if (!activeFeatureLayer.feature.properties) {
      activeFeatureLayer.feature.properties = {};
  }
  const properties = activeFeatureLayer.feature.properties;
    const themeId = properties.themeId;
    const theme = themes.find(t => t.id === themeId);
    
    let dynamicFormSchema = null;
    if (theme && theme.formId) {
        const form = allForms.find(f => f.id === theme.formId);
        if (form) dynamicFormSchema = form.schema || form.tabs;
    }

  const geomType = activeFeatureLayer.feature.geometry.type;
  const isLine = geomType === 'LineString' || geomType === 'MultiLineString';
  
  // Set default coordinates if point
  if ((geomType === 'Point' || geomType === 'MultiPoint') && !properties['Coordenadas Geográficas WGS 84']) {
      const latlng = activeFeatureLayer.getLatLng();
      properties['Coordenadas Geográficas WGS 84'] = `Latitude: ${latlng.lat.toFixed(6)} e Longitude: ${latlng.lng.toFixed(6)}`;
  }

  if (dynamicFormSchema && dynamicFormSchema.length > 0) {
      if (typeof window.renderDynamicForm === 'function') {
          window.renderDynamicForm(dynamicFormSchema, properties, isFeatureEditMode, 'feature-info-content', { activeTabId: window.currentActiveTabId });
          return;
      }
  }
  // OLD LOGIC FALLBACK

  {
    const container = document.getElementById('feature-info-content');
    container.innerHTML = '';
    if (!activeFeatureLayer.feature.properties) {
        activeFeatureLayer.feature.properties = {};
    }
    const properties = activeFeatureLayer.feature.properties;
    const geomType = activeFeatureLayer.feature.geometry.type;
    const isLine = geomType === 'LineString' || geomType === 'MultiLineString';
    
    // Set default coordinates if point
    if ((geomType === 'Point' || geomType === 'MultiPoint') && !properties['Coordenadas Geográficas WGS 84']) {
        const latlng = activeFeatureLayer.getLatLng();
        properties['Coordenadas Geográficas WGS 84'] = `Latitude: ${latlng.lat.toFixed(6)} e Longitude: ${latlng.lng.toFixed(6)}`;
    }

    let html = '';
    
    if (isLine) {
       const fields = ["Descrição", "Extensão (m)", "Observações"];
       fields.forEach(key => {
          const value = properties[key] || '';
          if (isFeatureEditMode) {
            const readonly = key === 'Extensão (m)' ? 'readonly' : '';
            const extraClass = key === 'Extensão (m)' ? 'bg-slate-200 dark:bg-slate-800 cursor-not-allowed' : 'bg-slate-50 dark:bg-slate-900';
            html += `
              <div class="flex flex-col gap-1">
                <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">${key}</label>
                ${key === 'Observações' 
                  ? `<textarea data-key="${key}" class="feature-data-input w-full px-3 py-2 ${extraClass} border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm">${value}</textarea>`
                  : `<input type="text" data-key="${key}" value="${value}" ${readonly} class="feature-data-input w-full px-3 py-2 ${extraClass} border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm">`
                }
              </div>
            `;
          } else {
            html += `
              <div class="flex flex-col border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0">
                <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">${key}</span>
                <span class="text-sm text-slate-800 dark:text-slate-200 font-medium">${value || '<span class="text-slate-300 dark:text-slate-600 italic">Não informado</span>'}</span>
              </div>
            `;
          }
       });
    } else {
       // Point or Polygon complex form
       const fields = [
           {key: "Descrição", type: "text"},
           {key: "Situação", type: "select", options: ["Regular", "Irregular"]},
           {key: "Tipo de estrutura", type: "select", options: ["Alvenaria", "Madeira", "Palafita", "Trailer", "Container", "Barraco", "Taipa", "Não se aplica", "Outros"]},
           {key: "Estrutura Outros", type: "text", condition: "Tipo de estrutura", condValue: "Outros"},
           {key: "Uso", type: "select", options: ["Comercial", "Residencial", "Mista", "Sem uso definido"]},
           {key: "Motivo da visita", type: "text"},
           {key: "Endereço", type: "text"},
           {key: "Número do imóvel", type: "text"},
           {key: "Bairro", type: "text"},
           {key: "Município", type: "text"},
           {key: "UF", type: "text"},
           {key: "Coordenadas Geográficas WGS 84", type: "text", readonly: true},
           {key: "Ocupante", type: "select", options: ["Não", "Sim"]},
           {key: "Nome Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
           {key: "CPF Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
           {key: "RG Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
           {key: "Endereço Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
           {key: "Número Residencia Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
           {key: "Bairro Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
           {key: "Cidade Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
           {key: "UF Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
           {key: "CEP Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
           {key: "Observação", type: "textarea"}
       ];
       
       if (isFeatureEditMode) {
           fields.forEach(f => {
               const value = properties[f.key] || '';
               const display = f.condition && properties[f.condition] !== f.condValue ? 'none' : 'flex';
               const extraClass = f.readonly ? 'bg-slate-200 dark:bg-slate-800 cursor-not-allowed' : 'bg-slate-50 dark:bg-slate-900';
               
               let inputHtml = '';
               if (f.type === 'select') {
                   let opts = `<option value="">Selecione...</option>`;
                   f.options.forEach(opt => {
                       opts += `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`;
                   });
                   inputHtml = `<select data-key="${f.key}" class="feature-data-input w-full px-3 py-2 ${extraClass} border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm" onchange="handleFeatureSelectChange(this)">${opts}</select>`;
               } else if (f.type === 'textarea') {
                   inputHtml = `<textarea data-key="${f.key}" class="feature-data-input w-full px-3 py-2 ${extraClass} border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm">${value}</textarea>`;
               } else {
                   inputHtml = `<input type="text" data-key="${f.key}" value="${value}" ${f.readonly ? 'readonly' : ''} class="feature-data-input w-full px-3 py-2 ${extraClass} border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm">`;
               }
               
               html += `
                  <div class="flex-col gap-1 feature-field-container" data-field="${f.key}" data-condition="${f.condition || ''}" data-condvalue="${f.condValue || ''}" style="display: ${display}">
                    <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">${f.key}</label>
                    ${inputHtml}
                  </div>
               `;
           });
           
           // Photos field
           html += `
              <div class="flex flex-col gap-1 feature-field-container mt-2">
                 <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Fotos Adicionais da Feição</label>
                 <input type="file" id="feature-photos-upload" accept="image/*" multiple capture="environment" class="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20">
              </div>
           `;
           
           // Render any extra properties imported via GeoJSON that are not in the hardcoded list and not hidden
           const hiddenList = properties._hiddenFields || [];
           const knownKeys = fields.map(f => f.key);
           Object.keys(properties).forEach(k => {
               if (k !== 'themeId' && k !== '_tempId' && k !== '_hiddenFields' && k !== 'photos' && !knownKeys.includes(k) && !hiddenList.includes(k)) {
                   const val = properties[k] || '';
                   html += `
                      <div class="flex flex-col gap-1 mt-2">
                        <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">${k}</label>
                        <input type="text" data-key="${k}" value="${val}" class="feature-data-input w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm">
                      </div>
                   `;
               }
           });
           
       } else {
           fields.forEach(f => {
               const value = properties[f.key] || '';
               // Only display if it has value
               if (!value) return;
               if (f.condition && properties[f.condition] !== f.condValue) return;
               
               html += `
                  <div class="flex flex-col border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0 mt-2">
                    <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">${f.key}</span>
                    <span class="text-sm text-slate-800 dark:text-slate-200 font-medium">${value}</span>
                  </div>
               `;
           });
           
           // Render extra properties
           const hiddenList = properties._hiddenFields || [];
           const knownKeys = fields.map(f => f.key);
           Object.keys(properties).forEach(k => {
               if (k !== 'themeId' && k !== '_tempId' && k !== '_hiddenFields' && k !== 'photos' && !knownKeys.includes(k) && !hiddenList.includes(k)) {
                   const val = properties[k] || '';
                   if (!val) return;
                   html += `
                      <div class="flex flex-col border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0 mt-2">
                        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">${k}</span>
                        <span class="text-sm text-slate-800 dark:text-slate-200 font-medium">${val}</span>
                      </div>
                   `;
               }
           });
           
           if (properties.photos && properties.photos.length > 0) {
               let imgs = '';
               properties.photos.forEach(p => {
                   imgs += `<img src="${p}" class="w-full rounded border border-slate-200 mt-2">`;
               });
               html += `
                  <div class="flex flex-col border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0 mt-4">
                    <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fotos da Feição</span>
                    ${imgs}
                  </div>
               `;
           }
       }
    }
    container.innerHTML = html;
  }
}

function handleFeatureSelectChange(selectElem) {
    const key = selectElem.getAttribute('data-key');
    const val = selectElem.value;
    document.querySelectorAll('.feature-field-container').forEach(container => {
        if (container.getAttribute('data-condition') === key) {
            if (val === container.getAttribute('data-condvalue')) {
                container.style.display = 'flex';
            } else {
                container.style.display = 'none';
            }
        }
    });
}

function toggleFeatureEditMode() {
  const container = document.getElementById('feature-info-content');
  const scrollPos = container ? container.scrollTop : 0;
  
  isFeatureEditMode = true;
  renderFeatureInfo();
  
  document.getElementById('feature-actions-container').classList.add('hidden');
  document.getElementById('feature-save-container').classList.remove('hidden');
  
  if (container) {
      setTimeout(() => container.scrollTop = scrollPos, 0);
  }
}

function cancelFeatureEdit() {
  const container = document.getElementById('feature-info-content');
  const scrollPos = container ? container.scrollTop : 0;

  isFeatureEditMode = false;
  renderFeatureInfo();
  
  document.getElementById('feature-actions-container').classList.remove('hidden');
  document.getElementById('feature-save-container').classList.add('hidden');
  
  if (container) {
      setTimeout(() => container.scrollTop = scrollPos, 0);
  }
}

async function saveFeatureData() {
  const inputs = document.querySelectorAll('.feature-data-input');
  
  // Validação: Exigir título para todos os anexos não excluídos
  for (let input of inputs) {
      if (input.classList.contains('complex-file-input')) {
          try {
              let files = JSON.parse(input.value);
              for (let f of files) {
                  if (!f.deleted && (!f.title || f.title.trim() === '')) {
                      alert(`Por favor, digite um título obrigatório para o anexo: ${f.name}`);
                      return; // Impede o salvamento
                  }
              }
          } catch(e) {}
      }
  }

  inputs.forEach(input => {
    const key = input.getAttribute('data-key');
    activeFeatureLayer.feature.properties[key] = input.value;
  });
  
  const photoInput = document.getElementById('feature-photos-upload');
  if (photoInput && photoInput.files.length > 0) {
      if (!activeFeatureLayer.feature.properties.photos) activeFeatureLayer.feature.properties.photos = [];
      for(let i=0; i<photoInput.files.length; i++) {
          const base64 = await toBase64(photoInput.files[i]);
          activeFeatureLayer.feature.properties.photos.push(base64);
      }
  }
  
  syncMapDataToThemes(); 
  
  isFeatureEditMode = false;
  renderFeatureInfo();
  document.getElementById('feature-actions-container').classList.remove('hidden');
  document.getElementById('feature-save-container').classList.add('hidden');
}

function closeFeatureInfoModal(keepLayer = false) {
  document.getElementById('feature-info-modal').classList.add('hidden');
  
  // Reset card positioning and fullscreen state
  const card = document.getElementById('feature-info-card');
  const icon = document.querySelector('#btn-feature-fullscreen span');
  if (card) {
      card.classList.remove('left-0', 'right-0', 'bottom-0', 'w-full', 'rounded-none');
      card.classList.add('right-4', 'md:right-6', 'bottom-4', 'rounded-2xl', 'w-[90%]', 'max-w-sm', 'sm:max-w-md');
      card.style.left = '';
      card.style.top = '';
      card.style.right = '';
      card.style.bottom = '';
  }
  if (icon) icon.textContent = 'open_in_full';
  window.isFeatureInfoFullscreen = false;

  if (!keepLayer) {
    activeFeatureLayer = null;
    if (typeof clearHighlight === 'function') clearHighlight();
  }
}

function editFeatureGeometry() {
  const layerToEdit = activeFeatureLayer;
  closeFeatureInfoModal(true); // Keep activeFeatureLayer
  
  if (layerToEdit && layerToEdit.pm) {
      layerToEdit.pm.enable({
        allowSelfIntersection: false,
        preventMarkerRemoval: false,
        snappable: true,
      });
      const toolbar = document.getElementById('geometry-edit-toolbar');
      toolbar.classList.remove('hidden');
      toolbar.classList.add('flex');
  }
}

function stopGeometryEditing() {
  if (activeFeatureLayer && activeFeatureLayer.pm) {
    activeFeatureLayer.pm.disable();
    activeFeatureLayer.feature.geometry = activeFeatureLayer.toGeoJSON().geometry;
    
    const geomType = activeFeatureLayer.feature.geometry.type;
    if (geomType === 'LineString' || geomType === 'MultiLineString') {
        let length = 0;
        const latlngs = activeFeatureLayer.getLatLngs();
        const points = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
        for (let i = 0; i < points.length - 1; i++) {
            length += points[i].distanceTo(points[i + 1]);
        }
        activeFeatureLayer.feature.properties['Extensão (m)'] = length.toFixed(2);
    }
    
    syncMapDataToThemes();
  }
  const toolbar = document.getElementById('geometry-edit-toolbar');
  toolbar.classList.add('hidden');
  toolbar.classList.remove('flex');
}

function deleteActiveFeature() {
  if (!activeFeatureLayer) return;
  
  if (!confirm("Tem certeza que deseja excluir esta feição permanentemente?")) return;
  
  geojsonLayer.removeLayer(activeFeatureLayer);
  syncMapDataToThemes();
  closeFeatureInfoModal();
}

// --- ICON DROPDOWNS ---
const availableIcons = [
  { val: 'circle', label: 'Círculo Básico' },
  { val: 'location_on', label: 'Pino (Localização)' },
  { val: 'home', label: 'Casa' },
  { val: 'business', label: 'Prédio' },
  { val: 'park', label: 'Árvore / Parque' },
  { val: 'directions_car', label: 'Carro' },
  { val: 'build', label: 'Ferramenta / Obra' },
  { val: 'warning', label: 'Alerta' },
  { val: 'flag', label: 'Bandeira' },
  { val: 'train', label: 'Linha Férrea' },
  { val: 'route', label: 'Estradas' },
  { val: 'water_drop', label: 'Água / Maré' },
  { val: 'local_hospital', label: 'Hospital' },
  { val: 'local_gas_station', label: 'Posto de Combustível' },
  { val: 'school', label: 'Escola' },
  { val: 'restaurant', label: 'Restaurante' },
  { val: 'factory', label: 'Indústria' }
];

function setupIconDropdowns() {
  const buildOptions = (prefix) => {
    return availableIcons.map(opt => `
      <button type="button" onclick="selectIcon('${prefix}', '${opt.val}', '${opt.label}')" class="flex items-center gap-3 w-full px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-left transition-colors dark:text-slate-200">
        <span class="material-symbols-outlined text-[20px] text-slate-600 dark:text-slate-300">${opt.val}</span> 
        <span class="text-sm">${opt.label}</span>
      </button>
    `).join('');
  };

  document.getElementById('new-icon-options').innerHTML = buildOptions('new');
  document.getElementById('edit-icon-options').innerHTML = buildOptions('edit');

  // Close dropdowns on outside click
  document.addEventListener('click', function(e) {
    ['new', 'edit'].forEach(prefix => {
      const container = document.getElementById(`${prefix}-icon-container`);
      const dropdown = document.getElementById(`${prefix}-icon-dropdown`);
      if (container && dropdown && !container.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });
  });
}

function selectIcon(prefix, val, label) {
  const inputId = prefix === 'new' ? 'theme-icon-input' : 'edit-theme-icon-input';
  document.getElementById(inputId).value = val;
  document.getElementById(`${prefix}-icon-preview`).innerText = val;
  document.getElementById(`${prefix}-icon-label`).innerText = label;
  document.getElementById(`${prefix}-icon-dropdown`).classList.add('hidden');
}

window.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupIconDropdowns();
});

// --- CONTROLES DE MAPA ORIGINAIS ---
function switchLayer(name) {
  if (!map) return;
  
  Object.values(baseLayers).forEach(layer => map.removeLayer(layer));
  
  if (baseLayers[name]) {
    baseLayers[name].addTo(map);
  }
  
  currentMapType = name;
}

function toggleMapType() {
  if (currentMapType === 'Mapa') {
    switchLayer('Híbrido');
  } else {
    switchLayer('Mapa');
  }
}

function zoomIn() { if (map) map.zoomIn(); }
function zoomOut() { if (map) map.zoomOut(); }
let myLocationMarker = null;

function goToMyLocation() {
  if (!map || !navigator.geolocation) {
    alert("Geolocalização não suportada neste navegador.");
    return;
  }
  
  const btn = document.querySelector('button[onclick="goToMyLocation()"]');
  if (btn) btn.classList.add('animate-pulse', 'opacity-50');
  
  navigator.geolocation.getCurrentPosition(function(position) {
    if (btn) btn.classList.remove('animate-pulse', 'opacity-50');
    
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    
    map.setView([lat, lng], 18);
    
    if (myLocationMarker) {
      myLocationMarker.setLatLng([lat, lng]);
    } else {
      const locationIcon = L.divIcon({
        className: 'custom-location-icon bg-transparent border-none',
        html: `<div class="relative w-5 h-5 flex items-center justify-center">
                 <div class="absolute inset-0 bg-blue-500 rounded-full opacity-75 animate-ping"></div>
                 <div class="relative w-4 h-4 bg-blue-500 border-2 border-white rounded-full shadow-md z-10"></div>
               </div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      myLocationMarker = L.marker([lat, lng], { icon: locationIcon, zIndexOffset: 1000 }).addTo(map);
    }
  }, function(error) {
    if (btn) btn.classList.remove('animate-pulse', 'opacity-50');
    console.error("Erro na geolocalização:", error);
    alert("Não foi possível acessar sua localização. Verifique as permissões do navegador.");
  }, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  });
}

// Expose all functions to global scope for ESM
window.loadThemes = loadThemes;
window.saveThemes = saveThemes;
window.initMap = initMap;
window.loadAllFeaturesToMap = loadAllFeaturesToMap;
window.syncMapDataToThemes = syncMapDataToThemes;
window.renderThemes = renderThemes;
window.toggleThemeVisibility = toggleThemeVisibility;
window.renderFeatureListItems = renderFeatureListItems;
window.highlightFeature = highlightFeature;
window.zoomToFeature = zoomToFeature;
window.filterThemeFeatures = filterThemeFeatures;
window.openNewThemeModal = openNewThemeModal;
window.closeNewThemeModal = closeNewThemeModal;
window.saveNewTheme = saveNewTheme;
window.openEditThemeModal = openEditThemeModal;
window.closeEditThemeModal = closeEditThemeModal;
window.updateIconDropdownSelection = updateIconDropdownSelection;
window.saveEditedTheme = saveEditedTheme;
window.deleteTheme = deleteTheme;
window.toggleSnapping = toggleSnapping;
window.startEditingTheme = startEditingTheme;
window.setDrawingMode = setDrawingMode;
window.stopDrawingMode = stopDrawingMode;
window.triggerUpload = triggerUpload;
window.downloadGeoJSON = downloadGeoJSON;
window.closeGlobalImportModal = closeGlobalImportModal;
window.confirmGlobalImport = confirmGlobalImport;
window.showFeatureInfoModal = showFeatureInfoModal;
window.renderFeatureInfo = renderFeatureInfo;
window.handleFeatureSelectChange = handleFeatureSelectChange;
window.toggleFeatureEditMode = toggleFeatureEditMode;
window.cancelFeatureEdit = cancelFeatureEdit;
window.saveFeatureData = saveFeatureData;
window.closeFeatureInfoModal = closeFeatureInfoModal;
window.editFeatureGeometry = editFeatureGeometry;
window.stopGeometryEditing = stopGeometryEditing;
window.deleteActiveFeature = deleteActiveFeature;
window.setupIconDropdowns = setupIconDropdowns;
window.selectIcon = selectIcon;
window.switchLayer = switchLayer;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.goToMyLocation = goToMyLocation;
// Second script block from code.html

function openVisitsModal() {
    if(!activeFeatureLayer) return;
    document.getElementById('visits-modal').classList.remove('hidden');
    renderVisitsList();
}

function closeVisitsModal() {
    document.getElementById('visits-modal').classList.add('hidden');
}

function renderVisitsList() {
    const container = document.getElementById('visits-list-container');
    container.innerHTML = '';
    
    if(!activeFeatureLayer.feature.properties.visits) {
        activeFeatureLayer.feature.properties.visits = [];
    }
    
    const visits = activeFeatureLayer.feature.properties.visits;
    
    if(visits.length === 0) {
        container.innerHTML = '<p class="text-sm text-slate-500 text-center mt-4">Nenhuma visita registrada.</p>';
        return;
    }
    
    visits.forEach((v, index) => {
        container.innerHTML += `
            <div class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 flex flex-col gap-2 relative shadow-sm">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="text-sm font-bold text-slate-900 dark:text-white">${new Date(v.date).toLocaleString('pt-BR')}</div>
                        <div class="text-xs text-slate-500">Técnico: ${v.tech}</div>
                    </div>
                    <button onclick="printReport(${index})" class="text-primary hover:bg-primary/10 p-1.5 rounded transition-colors tooltip" title="Gerar Relatório A4">
                        <span class="material-symbols-outlined text-[20px]">print</span>
                    </button>
                </div>
                <div class="text-sm mt-2"><span class="font-semibold text-slate-700 dark:text-slate-300">Motivo:</span> ${v.reason}</div>
                <div class="text-sm"><span class="font-semibold text-slate-700 dark:text-slate-300">Situação:</span> ${v.situation}</div>
            </div>
        `;
    });
}

let currentVisitCoords = null;

function openNewVisitModal() {
    document.getElementById('new-visit-modal').classList.remove('hidden');
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('visit-date').value = now.toISOString().slice(0,16);
    document.getElementById('visit-reason').value = '';
    document.getElementById('visit-situation').value = '';
    document.getElementById('visit-notes').value = '';
    document.getElementById('visit-photos').value = '';
    
    currentVisitCoords = null;
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => { currentVisitCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
            (err) => { console.warn("Geolocalização negada ou indisponível."); },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }
}

function closeNewVisitModal() {
    document.getElementById('new-visit-modal').classList.add('hidden');
}

async function saveNewVisit() {
    const date = document.getElementById('visit-date').value;
    const tech = document.getElementById('visit-tech').value;
    const reason = document.getElementById('visit-reason').value;
    const situation = document.getElementById('visit-situation').value;
    const notes = document.getElementById('visit-notes').value;
    const fileInput = document.getElementById('visit-photos');
    
    let photos = [];
    if(fileInput.files.length > 0) {
        for(let i=0; i<fileInput.files.length; i++) {
            const base64 = await toBase64(fileInput.files[i]);
            photos.push(base64);
        }
    }
    
    if(!activeFeatureLayer.feature.properties.visits) {
        activeFeatureLayer.feature.properties.visits = [];
    }
    
    activeFeatureLayer.feature.properties.visits.push({
        date, tech, reason, situation, notes, photos, coords: currentVisitCoords
    });
    
    syncMapDataToThemes();
    closeNewVisitModal();
    renderVisitsList();
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

function printReport(visitIndex) {
    const visit = activeFeatureLayer.feature.properties.visits[visitIndex];
    const props = activeFeatureLayer.feature.properties;
    
    const printWindow = window.open('', '', 'width=800,height=900');
    
    let photosHtml = '';
    if(visit.photos && visit.photos.length > 0) {
        photosHtml = '<h3 style="color: #051125; border-bottom: 2px solid #ccc; padding-bottom: 5px; margin-top: 30px;">Anexos Fotográficos</h3><div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px;">';
        visit.photos.forEach(p => {
            photosHtml += `<img src="${p}" style="max-width: 48%; border: 1px solid #ccc; border-radius: 4px; object-fit: contain; max-height: 400px;" />`;
        });
        photosHtml += '</div>';
    }
    
    const html = `
        <html>
        <head>
            <title>Relatório de Visita Técnica</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 21cm; margin: 0 auto; padding: 40px 20px; background: white;}
                h1 { border-bottom: 3px solid #051125; color: #051125; padding-bottom: 10px; text-align: center;}
                h2 { color: #47607e; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-top: 30px; font-size: 1.2rem;}
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
                .box { border: 1px solid #eee; padding: 15px; background: #fafafa; border-radius: 6px;}
                .box strong { display: block; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;}
                .box div { font-size: 14px; font-weight: 500;}
                .header-logo { text-align: center; margin-bottom: 20px; font-weight: 900; font-size: 24px; color: #051125; }
                @media print {
                    body { max-width: 100%; margin: 0; padding: 0; }
                    .page-break { page-break-before: always; }
                }
            </style>
        </head>
        <body onload="setTimeout(() => window.print(), 500)">
            <div class="header-logo">CONSTRUCTIVE</div>
            <h1>Relatório de Visita Técnica</h1>
            
            <h2>Dados da Visita</h2>
            <div class="grid">
                <div class="box"><strong>Data e Hora</strong> <div>${new Date(visit.date).toLocaleString('pt-BR')}</div></div>
                <div class="box"><strong>Técnico Responsável</strong> <div>${visit.tech}</div></div>
                <div class="box"><strong>Motivo da Visita</strong> <div>${visit.reason || '-'}</div></div>
                <div class="box"><strong>Coordenadas (GPS Local)</strong> <div>${visit.coords ? visit.coords.lat.toFixed(6) + ', ' + visit.coords.lng.toFixed(6) : 'Não coletado'}</div></div>
            </div>
            
            <div class="box" style="margin-bottom: 20px;">
                <strong>Situação Encontrada</strong>
                <div style="font-weight: normal; margin-top: 8px;">${visit.situation || '-'}</div>
            </div>
            
            <div class="box" style="margin-bottom: 20px;">
                <strong>Observações Gerais</strong>
                <div style="font-weight: normal; margin-top: 8px;">${(visit.notes || '').replace(/\\n/g, '<br/>') || 'Nenhuma observação registrada.'}</div>
            </div>
            
            <h2>Dados do Imóvel / Elemento</h2>
            <div class="grid">
                <div class="box"><strong>Proprietário / Titular</strong> <div>${props['Proprietário'] || '-'}</div></div>
                <div class="box"><strong>Identificação (CPF/CNPJ)</strong> <div>${props['CPF/CNPJ'] || '-'}</div></div>
                <div class="box"><strong>Endereço</strong> <div>${props['Endereço'] || '-'}</div></div>
                <div class="box"><strong>Localização (Lote/Quadra)</strong> <div>Lote ${props['Lote'] || '-'} / Quadra ${props['Quadra'] || '-'}</div></div>
            </div>
            
            ${photosHtml ? '<div class="page-break"></div>' + photosHtml : ''}
            
            <div style="margin-top: 80px; text-align: center;">
                <div style="width: 300px; border-top: 1px solid #333; margin: 0 auto; padding-top: 10px;">
                    Assinatura do Técnico
                </div>
            </div>
        </body>
        </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
}

// Expose second block functions
window.loadThemes = loadThemes;
window.saveThemes = saveThemes;
window.initMap = initMap;
window.loadAllFeaturesToMap = loadAllFeaturesToMap;
window.syncMapDataToThemes = syncMapDataToThemes;
window.renderThemes = renderThemes;
window.toggleThemeVisibility = toggleThemeVisibility;
window.renderFeatureListItems = renderFeatureListItems;
window.highlightFeature = highlightFeature;
window.zoomToFeature = zoomToFeature;
window.filterThemeFeatures = filterThemeFeatures;
window.openNewThemeModal = openNewThemeModal;
window.closeNewThemeModal = closeNewThemeModal;
window.saveNewTheme = saveNewTheme;
window.openEditThemeModal = openEditThemeModal;
window.closeEditThemeModal = closeEditThemeModal;
window.updateIconDropdownSelection = updateIconDropdownSelection;
window.saveEditedTheme = saveEditedTheme;
window.deleteTheme = deleteTheme;
window.toggleSnapping = toggleSnapping;
window.startEditingTheme = startEditingTheme;
window.setDrawingMode = setDrawingMode;
window.stopDrawingMode = stopDrawingMode;
window.triggerUpload = triggerUpload;
window.downloadGeoJSON = downloadGeoJSON;
window.closeGlobalImportModal = closeGlobalImportModal;
window.confirmGlobalImport = confirmGlobalImport;
window.showFeatureInfoModal = showFeatureInfoModal;
window.renderFeatureInfo = renderFeatureInfo;
window.handleFeatureSelectChange = handleFeatureSelectChange;
window.toggleFeatureEditMode = toggleFeatureEditMode;
window.cancelFeatureEdit = cancelFeatureEdit;
window.saveFeatureData = saveFeatureData;
window.closeFeatureInfoModal = closeFeatureInfoModal;
window.editFeatureGeometry = editFeatureGeometry;
window.stopGeometryEditing = stopGeometryEditing;
window.deleteActiveFeature = deleteActiveFeature;
window.setupIconDropdowns = setupIconDropdowns;
window.selectIcon = selectIcon;
window.switchLayer = switchLayer;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.goToMyLocation = goToMyLocation;
window.openVisitsModal = openVisitsModal;

// --- Feature Info Card Dragging & Fullscreen ---
window.isFeatureInfoFullscreen = false;
let featureInfoStartLeft, featureInfoStartTop;

window.toggleFeatureInfoFullscreen = function() {
    const card = document.getElementById('feature-info-card');
    const icon = document.querySelector('#btn-feature-fullscreen span');
    if (!card) return;

    if (window.isFeatureInfoFullscreen) {
        // Restore
        card.classList.remove('left-0', 'right-0', 'bottom-0', 'w-full', 'rounded-none');
        card.classList.add('right-4', 'md:right-6', 'bottom-4', 'rounded-2xl', 'w-[90%]', 'max-w-sm', 'sm:max-w-md');
        card.style.left = '';
        card.style.top = '';
        card.style.right = '';
        card.style.bottom = '';
        if (icon) icon.textContent = 'open_in_full';
        window.isFeatureInfoFullscreen = false;
    } else {
        // Fullscreen
        card.classList.remove('right-4', 'md:right-6', 'bottom-4', 'rounded-2xl', 'w-[90%]', 'max-w-sm', 'sm:max-w-md');
        card.classList.add('left-0', 'right-0', 'bottom-0', 'w-full', 'rounded-none');
        card.style.left = '0px';
        card.style.top = ''; // Vazio para que top-[4.5rem] aja normalmente
        card.style.right = '0px';
        card.style.bottom = '0px';
        if (icon) icon.textContent = 'close_fullscreen';
        window.isFeatureInfoFullscreen = true;
    }
};

function makeFeatureInfoDraggable() {
    const card = document.getElementById('feature-info-card');
    const header = document.getElementById('feature-info-header');
    if (!card || !header) return;
    
    let isDragging = false;
    let dragStartX, dragStartY;
    
    header.addEventListener('mousedown', (e) => {
        if (window.isFeatureInfoFullscreen) return; // Don't drag if fullscreen
        if (e.target.closest('button')) return;
        
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
        const rect = card.getBoundingClientRect();
        
        // Remove fixed positioning classes that interfere with top/left
        card.classList.remove('top-[4.5rem]', 'md:top-[5rem]', 'right-4', 'md:right-6', 'bottom-4');
        
        card.style.bottom = 'auto';
        card.style.right = 'auto';
        card.style.left = rect.left + 'px';
        card.style.top = rect.top + 'px';
        
        featureInfoStartLeft = rect.left;
        featureInfoStartTop = rect.top;
        
        card.style.transition = 'none';
        header.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        card.style.left = (featureInfoStartLeft + dx) + 'px';
        card.style.top = (featureInfoStartTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            header.style.cursor = 'move';
            card.style.transition = '';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    makeFeatureInfoDraggable();
});
window.closeVisitsModal = closeVisitsModal;
window.renderVisitsList = renderVisitsList;
window.openNewVisitModal = openNewVisitModal;
window.closeNewVisitModal = closeNewVisitModal;
window.saveNewVisit = saveNewVisit;
window.printReport = printReport;

window.clearHighlight = clearHighlight;

window.toggleThemeStatsList = function(themeId) {
    const listEl = document.getElementById(`stats-list-${themeId}`);
    if (listEl) {
        listEl.classList.toggle('hidden');
        listEl.classList.toggle('flex');
    }
};

window.handleStatToggle = function(themeId, chartIndex, checkbox) {
    // Exclusivity: uncheck all other stats toggles globally
    const allToggles = document.querySelectorAll('input[name="layer-stat-toggle"]');
    allToggles.forEach(t => {
        if (t !== checkbox) t.checked = false;
    });

    if (checkbox.checked) {
        // Open specific chart dashboard
        openStatsDashboard(themeId, chartIndex);
    } else {
        // Close dashboard and reset
        closeStatsDashboard();
    }
};

async function openStatsDashboard(themeId, specificIndex) {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;

    if (!theme.formId) {
        alert("Este tema não possui um formulário (cadastro) associado. Edite a camada e vincule um formulário primeiro.");
        return;
    }

    const form = allForms.find(f => f.id === theme.formId);
    if (!form) {
        alert("Formulário associado não encontrado.");
        return;
    }

    const config = form.statsConfig;
    if (!config || !Array.isArray(config) || config.length === 0) {
        alert("Este formulário ainda não possui uma configuração de Dashboard. Vá até as Configurações > Cadastros > Editar, e configure os gráficos manualmente.");
        return;
    }

    const modal = document.getElementById('stats-dashboard-modal');
    
    // --- Função para tornar o modal arrastável ---
    function makeModalDraggable(modal) {
        const header = modal.querySelector('.cursor-move');
        if (!header) return;
        
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        header.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            if (e.target.closest('button')) return; // ignora botões
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            // Remove transitions to allow smooth dragging
            modal.style.transition = 'none';

            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            modal.style.top = (modal.offsetTop - pos2) + "px";
            modal.style.left = (modal.offsetLeft - pos1) + "px";
            modal.style.right = 'auto';
            modal.style.bottom = 'auto';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            // Restore transitions
            modal.style.transition = '';
        }
    }

    modal.dataset.themeId = theme.id;
    
    const features = theme.features || [];
    
    // Zoom para a camada
    if (features.length > 0 && typeof L !== 'undefined') {
        try {
            const bounds = L.latLngBounds();
            geojsonLayer.eachLayer(layer => {
                if (layer.feature && layer.feature.properties.themeId === theme.id) {
                    if (layer.getBounds) bounds.extend(layer.getBounds());
                    else if (layer.getLatLng) bounds.extend(layer.getLatLng());
                }
            });
            if (bounds.isValid()) {
                map.flyToBounds(bounds, { paddingRightBottom: [400, 50], paddingTopLeft: [50, 50], duration: 1.5 });
            }
        } catch(e) {}
    }

    const container = document.getElementById('stats-dashboard-content');
    container.innerHTML = '';
    
    // Animação de Abertura
    modal.classList.remove('pointer-events-none');
    

    setTimeout(() => {
        modal.classList.remove('scale-95', 'opacity-0', 'translate-y-[-20px]');
        modal.classList.add('scale-100', 'opacity-100', 'translate-y-0');
        const content = document.getElementById('stats-dashboard-content');
        if (content) {
            content.classList.remove('opacity-0');
            content.classList.add('opacity-100');
        }
    }, 10);

    let chartIndex = -1;
    
    config.forEach(widget => {
        chartIndex++;
        // If specificIndex is provided, skip other charts
        if (typeof specificIndex !== 'undefined' && chartIndex !== specificIndex) return;

        const card = document.createElement('div');
        // Novo estilo de card (dark glass container)
        card.className = "bg-[#070b14]/50 backdrop-blur-md rounded-2xl border border-white/10 p-5 flex flex-col flex-shrink-0 min-w-[250px] relative overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.5)]";
        
        const closeBtn = document.createElement('button');
        closeBtn.onclick = closeStatsDashboard;
        closeBtn.className = "absolute top-3 right-3 p-1.5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors z-20";
        closeBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">close</span>';
        card.appendChild(closeBtn);

        const headerGroup = document.createElement('div');
        headerGroup.className = "flex justify-between items-start mb-1 z-10 relative pr-6 cursor-move"; // cursor-move para indicar área de arrasto

        const titleEl = document.createElement('h4');
        titleEl.className = "text-sm font-bold text-white tracking-wide flex items-center gap-2";
        let iconHtml = widget.type === 'indicator' ? '123' : (widget.type === 'pie' ? 'pie_chart' : 'bar_chart');
        titleEl.innerHTML = `<span class="material-symbols-outlined text-cyan-400 text-[18px]">${iconHtml}</span> ${widget.title || 'Estatística'}`;
        headerGroup.appendChild(titleEl);
        
        card.appendChild(headerGroup);
        
        if (widget.description) {
            const descEl = document.createElement('p');
            descEl.className = "text-xs text-white/50 mb-4 z-10 relative";
            descEl.textContent = widget.description;
            card.appendChild(descEl);
        }

        if (widget.type === 'indicator') {
            let count = 0;
            if (widget.fieldId) {
                count = features.filter(f => {
                    const val = getFeaturePropertyValue(theme, f, widget.fieldId);
                    return val !== undefined && val !== null && val !== '';
                }).length;
            } else {
                count = features.length;
            }
            const countEl = document.createElement('div');
            countEl.className = "text-4xl font-light text-cyan-50 mt-2 z-10 relative";
            countEl.textContent = "0";
            card.appendChild(countEl);

            // Animar contagem
            setTimeout(() => {
                let startTimestamp = null;
                const duration = 1500;
                const step = (timestamp) => {
                    if (!startTimestamp) startTimestamp = timestamp;
                    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                    const easeProgress = 1 - Math.pow(1 - progress, 4); // easeOutQuart
                    countEl.textContent = Math.floor(easeProgress * count).toLocaleString();
                    if (progress < 1) window.requestAnimationFrame(step);
                    else countEl.textContent = count.toLocaleString();
                };
                window.requestAnimationFrame(step);
            }, 300);
        } else if (widget.type === 'pie' || widget.type === 'bar') {
            const fieldId = widget.fieldId;
            if (!fieldId) return;

            const counts = {};
            features.forEach(f => {
                let val = getFeaturePropertyValue(theme, f, fieldId);
                if (val === undefined || val === null || val === '') {
                    val = "N/I"; // Simplificado para caber melhor no mini-gráfico
                }
                counts[val] = (counts[val] || 0) + 1;
            });

            const rawLabels = Object.keys(counts);
            const data = Object.values(counts);
            
            // Gerar mapa de cores para cada label
            const pieColors = ['#06b6d4', '#3b82f6', '#8b5cf6', '#14b8a6', '#6366f1', '#475569'];
            const barColor = '#06b6d4';
            const colorsMap = {};
            
            rawLabels.forEach((label, i) => {
                if (widget.type === 'pie') {
                    colorsMap[label] = pieColors[i % pieColors.length];
                } else {
                    colorsMap[label] = barColor; // Barras podem ter uma cor só ou mesma lógica, vamos usar mesma lógica para colorir mapa
                    // Mas se o gráfico for barra, vamos usar as cores variadas no mapa também para diferenciar
                    colorsMap[label] = pieColors[i % pieColors.length];
                }
            });
            const colorsJson = JSON.stringify(colorsMap);

            const chartLabels = rawLabels.map((label, i) => {
                const count = data[i];
                const pct = features.length > 0 ? ((count / features.length) * 100).toFixed(1) : 0;
                return `${label} (${count} - ${pct}%)`;
            });

            const canvasContainer = document.createElement('div');
            canvasContainer.className = "relative w-full h-44 mt-auto flex items-center justify-center z-10";
            const canvas = document.createElement('canvas');
            canvas.id = `chart-${theme.id}-${chartIndex}`;
            canvasContainer.appendChild(canvas);
            card.appendChild(canvasContainer);

            setTimeout(() => {
                const ctx = canvas.getContext('2d');
                new Chart(ctx, {
                    type: widget.type === 'pie' ? 'doughnut' : 'bar',
                    data: {
                        labels: chartLabels,
                        datasets: [{
                            data: data,
                            backgroundColor: widget.type === 'pie' ? pieColors : barColor + '80',
                            hoverBackgroundColor: barColor,
                            borderWidth: 0,
                            borderRadius: widget.type === 'bar' ? 4 : 0,
                            barPercentage: 0.6
                        }]
                    },
                    options: {
                        animation: {
                            duration: 2000,
                            easing: 'easeOutQuart'
                        },
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: 0 },
                        plugins: {
                            legend: {
                                display: widget.type === 'pie',
                                position: 'right',
                                labels: { color: '#cbd5e1', font: { size: 10 }, usePointStyle: true, boxWidth: 6 }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                                titleColor: '#fff',
                                bodyColor: '#cbd5e1',
                                borderColor: 'rgba(6, 182, 212, 0.5)',
                                borderWidth: 1,
                                padding: 10,
                                cornerRadius: 8
                            }
                        },
                        scales: widget.type === 'bar' ? {
                            y: { display: false, beginAtZero: true },
                            x: { 
                                display: true, 
                                ticks: { color: '#cbd5e1', font: { size: 10 } }, 
                                grid: { display: false } 
                            }
                        } : undefined
                    }
                });
            }, 500); // Aguarda a animação de abertura
            
            // Apply map classification automatically
            const colorsJsonAuto = JSON.stringify(colorsMap);
            applyThemeClassification(theme.id, fieldId, colorsJsonAuto);
        }
        
        // Efeito visual sutil de brilho no fundo do card
        const glow = document.createElement('div');
        glow.className = "absolute -bottom-10 -right-10 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl z-0 group-hover:bg-cyan-500/20 transition-colors";
        card.appendChild(glow);
        
        container.appendChild(card);
    });

    // Configurar arrastar após gerar os cards
    makeModalDraggable(modal);
}
window.openStatsDashboard = openStatsDashboard;

window.closeStatsDashboard = function() {
    const modal = document.getElementById('stats-dashboard-modal');
    const content = document.getElementById('stats-dashboard-content');
    if (!modal || !content) return;
    
    content.classList.remove('opacity-100');
    content.classList.add('opacity-0');
    
    modal.classList.remove('scale-100', 'opacity-100', 'translate-y-0');
    modal.classList.add('scale-95', 'opacity-0', 'translate-y-[-20px]', 'pointer-events-none');
    
    // resetar posição do modal para a próxima abertura
    setTimeout(() => {
        modal.style.top = '80px';
        modal.style.right = '20px';
        modal.style.left = 'auto';
        modal.style.bottom = 'auto';
    }, 500);
    
    const themeId = modal.dataset.themeId;
    if (themeId) {
        resetThemeClassification(themeId);
    }
    
    // Uncheck all stats toggles in the layer list
    const allToggles = document.querySelectorAll('input[name="layer-stat-toggle"]');
    allToggles.forEach(t => t.checked = false);
    
    setTimeout(() => {
        modal.classList.add('pointer-events-none');
    }, 500);
};


window.applyThemeClassification = function(themeId, fieldId, colorsJson) {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;

    const colorsMap = JSON.parse(colorsJson);
    
    geojsonLayer.eachLayer(layer => {
        if (!layer.feature || layer.feature.properties.themeId !== themeId) return;
        
        // Salvar estilo original da feição
        if (!layer.options.originalStyle) {
            layer.options.originalStyle = {
                fillColor: layer.options.fillColor || theme.color || '#3388ff',
                color: layer.options.color || theme.color || '#3388ff',
                weight: layer.options.weight,
                fillOpacity: layer.options.fillOpacity
            };
        }

        const val = getFeaturePropertyValue(theme, layer.feature, fieldId);
        const valStr = (val === undefined || val === null || val === '') ? "N/I" : String(val);
        const newColor = colorsMap[valStr] || theme.color || '#3388ff';

        if (layer.setStyle) {
            layer.setStyle({
                fillColor: newColor,
                color: newColor,
                fillOpacity: 0.8,
                weight: 2
            });
        }
    });
};

window.resetThemeClassification = function(themeId) {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;

    geojsonLayer.eachLayer(layer => {
        if (!layer.feature || layer.feature.properties.themeId !== themeId) return;
        
        if (layer.options.originalStyle && layer.setStyle) {
            layer.setStyle({
                fillColor: layer.options.originalStyle.fillColor,
                color: layer.options.originalStyle.color,
                weight: layer.options.originalStyle.weight,
                fillOpacity: layer.options.originalStyle.fillOpacity
            });
            delete layer.options.originalStyle;
        }
    });
};
