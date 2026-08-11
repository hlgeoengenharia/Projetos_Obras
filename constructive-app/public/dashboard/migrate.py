import re
import os

with open('code.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Replace config.js with Leaflet + Geoman
html = html.replace(
    '<script src="config.js"></script>',
    '''<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<link rel="stylesheet" href="https://unpkg.com/@geoman-io/leaflet-geoman-free@2.14.2/dist/leaflet-geoman.css" />
<script src="https://unpkg.com/@geoman-io/leaflet-geoman-free@2.14.2/dist/leaflet-geoman.min.js"></script>'''
)

# 2. Remove gm-style css
html = html.replace('.gm-style .gn, .gm-style .gni { display: none; }', '')

# 3. Replace the entire JS script block starting from 'const cabedeloCenter = ' to the end
js_start = html.find('const cabedeloCenter = { lat: -7.0182, lng: -34.8336 };')
js_end = html.find('</script>\n</body></html>')

if js_start != -1 and js_end != -1:
    new_js = """const cabedeloCenter = [-7.0182, -34.8336];

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

// --- LEAFLET MAP ---
function initMap() {
  map = L.map('map', {
    zoomControl: false // We use our custom zoom buttons
  }).setView(cabedeloCenter, 13);

  // Define Base Layers
  baseLayers['Mapa'] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  });
  
  baseLayers['Satélite'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri'
  });

  baseLayers['Híbrido'] = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'),
    L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner-hybrid/{z}/{x}/{y}{r}.png')
  ]);

  baseLayers['Mapa'].addTo(map);

  // Geoman Options
  map.pm.setLang('pt_br');
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

  // Layer Group for all GeoJSON features
  geojsonLayer = L.geoJSON(null, {
    style: function(feature) {
      const themeId = feature.properties.themeId;
      const theme = themes.find(t => t.id === themeId);
      const color = theme ? theme.color : '#333333';
      return {
        fillColor: color,
        fillOpacity: 0.4,
        color: color,
        weight: 2
      };
    },
    pointToLayer: function(feature, latlng) {
      const themeId = feature.properties.themeId;
      const theme = themes.find(t => t.id === themeId);
      const color = theme ? theme.color : '#333333';
      return L.circleMarker(latlng, {
        radius: 6,
        fillColor: color,
        fillOpacity: 1,
        color: '#ffffff',
        weight: 2
      });
    }
  }).addTo(map);

  // Drawing Complete Event
  map.on('pm:create', function(e) {
    if (!editingThemeId) return;
    
    // Add themeId to the drawn feature
    const feature = e.layer.toGeoJSON();
    if (!feature.properties) feature.properties = {};
    feature.properties.themeId = editingThemeId;
    
    // Remove the temporary layer from Geoman
    map.removeLayer(e.layer);
    
    // Add to our main GeoJSON layer
    geojsonLayer.addData(feature);
    syncMapDataToThemes();
  });

  loadThemes();
  renderThemes();
  loadAllFeaturesToMap();
}

// Call initMap on window load since we no longer have a Google Maps callback
window.addEventListener('DOMContentLoaded', initMap);

function loadAllFeaturesToMap() {
  geojsonLayer.clearLayers();
  
  const allFeatures = [];
  themes.forEach(theme => {
    if (theme.features && theme.features.length > 0) {
      allFeatures.push(...theme.features);
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
function renderThemes() {
  const container = document.getElementById('themes-container');
  container.innerHTML = '';

  themes.forEach(theme => {
    const featureCount = theme.features ? theme.features.length : 0;
    
    const card = document.createElement('div');
    card.className = "bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden";
    card.innerHTML = `
      <div class="px-4 py-3 flex flex-col" style="background-color: ${theme.color}20; border-left: 4px solid ${theme.color}">
        <div class="flex justify-end gap-1 mb-2">
          <button onclick="startEditingTheme('${theme.id}', '${theme.name}', '${theme.color}')" class="p-1.5 hover:bg-white/50 dark:hover:bg-black/20 rounded tooltip text-slate-700 dark:text-slate-300 transition-colors" title="Desenhar">
            <span class="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button onclick="triggerUpload('${theme.id}')" class="p-1.5 hover:bg-white/50 dark:hover:bg-black/20 rounded tooltip text-slate-700 dark:text-slate-300 transition-colors" title="Importar GeoJSON">
            <span class="material-symbols-outlined text-[18px]">upload</span>
          </button>
          <button onclick="downloadGeoJSON('${theme.id}')" class="p-1.5 hover:bg-white/50 dark:hover:bg-black/20 rounded tooltip text-slate-700 dark:text-slate-300 transition-colors" title="Exportar GeoJSON">
            <span class="material-symbols-outlined text-[18px]">download</span>
          </button>
          <button onclick="deleteTheme('${theme.id}')" class="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded tooltip text-red-600 dark:text-red-400 transition-colors" title="Excluir Camada">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
        <div class="flex items-center gap-2 cursor-pointer" onclick="document.getElementById('list-${theme.id}').classList.toggle('hidden')">
          <div class="w-4 h-4 rounded-full shrink-0" style="background-color: ${theme.color}"></div>
          <h3 class="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider line-clamp-1" title="${theme.name}">${theme.name}</h3>
        </div>
      </div>
      <div class="p-3 hidden text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700" id="list-${theme.id}">
        ${featureCount} elemento(s) mapeado(s).
      </div>
    `;
    container.appendChild(card);
  });
}

function openNewThemeModal() {
  document.getElementById('new-theme-modal').classList.remove('hidden');
  document.getElementById('theme-name-input').value = '';
}

function closeNewThemeModal() {
  document.getElementById('new-theme-modal').classList.add('hidden');
}

function saveNewTheme() {
  const name = document.getElementById('theme-name-input').value;
  const color = document.getElementById('theme-color-input').value;
  if (!name) return;

  const id = 'theme_' + Date.now();
  themes.push({ id, name, color, features: [] });
  saveThemes();
  renderThemes();
  closeNewThemeModal();
  
  startEditingTheme(id, name, color);
}

function deleteTheme(themeId) {
  if (!confirm("Tem certeza que deseja excluir esta camada e todos os seus dados?")) return;
  
  themes = themes.filter(t => t.id !== themeId);
  saveThemes();
  loadAllFeaturesToMap();
  renderThemes();
}

// --- FERRAMENTAS DE DESENHO ---
function startEditingTheme(id, name, color) {
  editingThemeId = id;
  const toolbar = document.getElementById('drawing-toolbar');
  toolbar.classList.remove('hidden');
  toolbar.classList.add('flex');
  
  const nameLabel = document.getElementById('drawing-theme-name');
  nameLabel.textContent = "Editando: " + name;
  nameLabel.style.color = color;
  
  document.getElementById('side-drawer').classList.add('-translate-x-full'); 
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
  downloadAnchorNode.setAttribute("download", theme.name.replace(/\\s+/g, '_') + ".geojson");
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
      
      let suggestedName = file.name.replace(/\\.[^/.]+$/, "");
      document.getElementById('global-import-theme-name').value = suggestedName;
      
      let detectedProperties = [];
      if (geojson.features[0] && geojson.features[0].properties) {
        detectedProperties = Object.keys(geojson.features[0].properties);
      }
      
      const fieldsContainer = document.getElementById('global-import-fields-container');
      fieldsContainer.innerHTML = '';
      
      if (detectedProperties.length === 0) {
        fieldsContainer.innerHTML = '<span class="text-sm text-slate-500">Nenhum campo de dados encontrado.</span>';
      } else {
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
        `;
        detectedProperties.forEach(prop => {
          fieldsContainer.innerHTML += `
            <div class="flex items-center gap-2">
              <input type="checkbox" checked class="property-import-checkbox w-4 h-4 text-primary rounded border-slate-300 dark:border-slate-700 focus:ring-primary" data-original="${prop}">
              <span class="w-1/3 text-sm text-slate-600 dark:text-slate-400 font-mono truncate" title="${prop}">${prop}</span>
              <span class="material-symbols-outlined text-slate-400 text-sm">arrow_forward</span>
              <input type="text" list="standard-fields-list" data-original="${prop}" value="${prop}" class="flex-1 px-2 py-1 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-primary dark:text-white property-rename-input">
            </div>
          `;
        });
      }
      
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

function confirmGlobalImport() {
  if (!pendingGlobalGeoJSON) return;
  
  const themeName = document.getElementById('global-import-theme-name').value.trim() || "Tema Importado";
  
  const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
  const themeColor = colors[Math.floor(Math.random() * colors.length)];
  
  const themeId = 'theme_' + Date.now();
  
  const mapping = {};
  const ignored = new Set();
  
  document.querySelectorAll('.property-import-checkbox').forEach(checkbox => {
    const original = checkbox.getAttribute('data-original');
    if (!checkbox.checked) {
      ignored.add(original);
    }
  });

  document.querySelectorAll('.property-rename-input').forEach(input => {
    const original = input.getAttribute('data-original');
    if (!ignored.has(original)) {
      const newName = input.value.trim() || original;
      mapping[original] = newName;
    }
  });
  
  const standardFields = ["Proprietário", "CPF/CNPJ", "Endereço", "Número do imóvel", "Bairro", "Loteamento", "Quadra", "Lote", "Município"];

  pendingGlobalGeoJSON.features.forEach(f => {
    if (!f.properties) f.properties = {};
    
    const newProps = { themeId: themeId };
    Object.keys(f.properties).forEach(key => {
      if (key !== 'themeId' && !ignored.has(key)) {
        const mappedKey = mapping[key] || key;
        newProps[mappedKey] = f.properties[key];
      }
    });
    
    standardFields.forEach(field => {
      if (!(field in newProps)) {
        newProps[field] = "";
      }
    });
    
    f.properties = newProps;
  });
  
  themes.push({ id: themeId, name: themeName, color: themeColor, features: [] });
  
  const newLayer = L.geoJSON(pendingGlobalGeoJSON);
  geojsonLayer.addData(pendingGlobalGeoJSON);
  syncMapDataToThemes();
  
  const bounds = newLayer.getBounds();
  if (bounds.isValid()) {
      map.fitBounds(bounds);
  }
  
  closeGlobalImportModal();
  document.getElementById('side-drawer').classList.add('-translate-x-full');
  document.getElementById('drawer-overlay').classList.add('hidden');
}

// --- CONTROLES DE MAPA ORIGINAIS ---
function switchLayer(name) {
  if (!map) return;
  
  Object.values(baseLayers).forEach(layer => map.removeLayer(layer));
  
  if (baseLayers[name]) {
    baseLayers[name].addTo(map);
  }
  
  currentMapType = name;
}

function zoomIn() { if (map) map.zoomIn(); }
function zoomOut() { if (map) map.zoomOut(); }
function goToMyLocation() {
  if (!map || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(function(position) {
    map.setView([position.coords.latitude, position.coords.longitude], 15);
  });
}
"""
    html = html[:js_start] + new_js + html[js_end:]

with open('code.html', 'w', encoding='utf-8') as f:
    f.write(html)
