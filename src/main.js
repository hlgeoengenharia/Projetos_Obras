let allForms = [];
async function fetchDynamicForm() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('forms').select('*').order('created_at', { ascending: false });
            if (data) {
                allForms = data.map(row => {
                    let tabs = row.schema;
                    let statsConfig = row.statsConfig;
                    if (row.schema && !Array.isArray(row.schema) && row.schema.tabs) {
                        tabs = row.schema.tabs;
                        if (!statsConfig) statsConfig = row.schema.statsConfig;
                    }
                    return {
                        id: row.id,
                        title: row.title,
                        name: row.title,
                        schema: tabs,
                        tabs: tabs,
                        statsConfig: statsConfig,
                        created_at: row.created_at
                    };
                });
                console.log("All Forms loaded from Supabase:", allForms);
                populateFormSelects();
                if (typeof renderThemes === 'function') renderThemes();
                if (typeof loadAllFeaturesToMap === 'function') loadAllFeaturesToMap();
            }
        } catch(e) { console.error(e); }
    } else {
        const saved = localStorage.getItem('constructive_forms');
        if (saved) {
            allForms = JSON.parse(saved);
            populateFormSelects();
            if (typeof renderThemes === 'function') renderThemes();
            if (typeof loadAllFeaturesToMap === 'function') loadAllFeaturesToMap();
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
async function loadThemes() {
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
          const { data: dbTemas, error: errTemas } = await supabaseClient.from('temas').select('*');
          const { data: dbFeicoes, error: errFeicoes } = await supabaseClient.from('feicoes').select('*');
          
          if (errTemas) console.error("Erro ao carregar temas:", errTemas);
          if (errFeicoes) console.error("Erro ao carregar feições:", errFeicoes);

          // Automatic migration check
          const savedLocal = localStorage.getItem('constructive_themes');
          const migrationFlag = localStorage.getItem('constructive_themes_migrated_db');
          
          if (savedLocal && !migrationFlag && dbTemas && dbTemas.length === 0) {
              console.log("Iniciando migração automática para o Supabase...");
              try {
                  const localThemes = JSON.parse(savedLocal);
                  for (const t of localThemes) {
                      const { data: insertedT, error: insertTErr } = await supabaseClient.from('temas').insert({
                          nome: t.name,
                          cor: t.color || '#051125',
                          icone: t.icon || 'map',
                          tipo_geometria: t.geometryType || 'Polygon',
                          tipo_cadastro: t.formId || 'padrao'
                      }).select();
                      
                      if (insertTErr) {
                          console.error("Erro ao migrar tema:", insertTErr);
                          continue;
                      }
                      
                      if (insertedT && insertedT.length > 0 && t.features && t.features.length > 0) {
                          const newThemeId = insertedT[0].id;
                          const payloads = t.features.map(f => ({
                              theme_id: newThemeId,
                              propriedades: f.properties,
                              geometria: f.geometry
                          }));
                          const { error: insertFErr } = await supabaseClient.from('feicoes').insert(payloads);
                          if (insertFErr) console.error("Erro ao migrar feições em lote:", insertFErr);
                      }
                  }
                  localStorage.setItem('constructive_themes_migrated_db', 'true');
                  console.log("Migração concluída com sucesso!");
                  return loadThemes();
              } catch(e) {
                  console.error("Erro durante a migração automática:", e);
              }
          }

          themes = [];
          if (dbTemas) {
              const hasMetadataColumn = dbTemas.length > 0 && ('metadata' in dbTemas[0]);
              window.supabaseTemasHasMetadata = hasMetadataColumn;
              
              let localMeta = {};
              try {
                  const savedMeta = localStorage.getItem('constructive_themes_meta');
                  if (savedMeta) localMeta = JSON.parse(savedMeta);
              } catch(e) {}

              dbTemas.forEach(t => {
                  const tMeta = (hasMetadataColumn && t.metadata) ? t.metadata : (localMeta[t.id] || {});
                  
                  const theme = {
                      id: t.id,
                      name: t.nome,
                      color: t.cor,
                      icon: t.icone,
                      geometryType: t.tipo_geometria,
                      cadastroType: t.tipo_cadastro,
                      formId: t.tipo_cadastro,
                      opacity: tMeta.opacity !== undefined ? tMeta.opacity : 0.4,
                      weight: tMeta.weight !== undefined ? tMeta.weight : 2,
                      dashed: !!tMeta.dashed,
                      disp1: tMeta.disp1 || 'Lote',
                      disp2: tMeta.disp2 || 'Quadra',
                      mainTitle: tMeta.mainTitle || '',
                      disp1Active: tMeta.disp1Active !== false,
                      disp2Active: tMeta.disp2Active !== false,
                      customIcon: tMeta.customIcon || '',
                      features: []
                  };
                  if (dbFeicoes) {
                      const fcs = dbFeicoes.filter(f => f.theme_id === t.id);
                      fcs.forEach(fc => {
                          theme.features.push({
                              type: "Feature",
                              properties: { ...fc.propriedades, themeId: t.id, id_banco: fc.id },
                              geometry: fc.geometria
                          });
                      });
                  }
                  themes.push(theme);
              });
          }
          try {
              await loadRasterLayers();
          } catch(eRaster) {
              console.error("Erro ao carregar camadas raster:", eRaster);
          }
      } catch(e) {
          console.error("Erro ao carregar dados do Supabase:", e);
      }
  } else {
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
}

function saveThemes() {
  localStorage.setItem('constructive_themes', JSON.stringify(themes));
  
  const meta = {};
  themes.forEach(t => {
      meta[t.id] = {
          opacity: t.opacity,
          weight: t.weight,
          dashed: t.dashed,
          disp1: t.disp1,
          disp2: t.disp2,
          mainTitle: t.mainTitle,
          disp1Active: t.disp1Active,
          disp2Active: t.disp2Active,
          customIcon: t.customIcon
      };
  });
  localStorage.setItem('constructive_themes_meta', JSON.stringify(meta));
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
  baseLayers['Mapa'] = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
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
        if (window.isSelectingStreetViewCoordinate) {
            return; // bubble to map click
        }
        
        const themeIdStr = String(feature.properties.themeId);
        
        if (!window.activeSelectionThemeId) {
            showWarningToast("Selecione uma camada no painel lateral clicando nela para poder inspecionar suas feições.");
            return;
        } else if (window.activeSelectionThemeId !== themeIdStr) {
            showWarningToast("Esta feição pertence a outra camada. Selecione a camada correta no painel lateral primeiro.");
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
    if (window.isSelectingStreetViewCoordinate) {
        return; // ignore modal closing if selecting street view coordinate
    }
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

  loadThemes().then(() => {
    renderThemes();
    loadAllFeaturesToMap();
  });
  
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
  // Guardar o ID temporário ou ID do banco da feição selecionada no momento
  const activeTempId = activeFeatureLayer && activeFeatureLayer.feature && activeFeatureLayer.feature.properties && activeFeatureLayer.feature.properties._tempId;
  const activeDbId = activeFeatureLayer && activeFeatureLayer.feature && activeFeatureLayer.feature.properties && activeFeatureLayer.feature.properties.id_banco;

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

  // Re-estabelecer o activeFeatureLayer com o novo objeto correspondente recém-criado
  if (activeTempId || activeDbId) {
      let foundLayer = null;
      geojsonLayer.eachLayer(layer => {
          if (layer.feature && layer.feature.properties) {
              const props = layer.feature.properties;
              if ((activeTempId && props._tempId === activeTempId) || (activeDbId && props.id_banco === activeDbId)) {
                  foundLayer = layer;
              }
          }
      });
      if (foundLayer) {
          activeFeatureLayer = foundLayer;
          // Reaplica o destaque visual no mapa sem mover/puxar a câmera
          highlightFeature(activeFeatureLayer.feature.properties._tempId, true);
      }
  }
}

async function syncMapDataToThemes() {
  themes.forEach(t => t.features = []);
  
  const layers = geojsonLayer.getLayers();
  
  // Build lists of features for local themes
  layers.forEach(layer => {
    if (layer.feature) {
      const f = layer.feature;
      const tId = f.properties.themeId;
      const theme = themes.find(t => t.id === tId);
      if (theme) {
        theme.features.push(f);
      }
    }
  });

  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      const dbPayloads = layers.map(layer => {
          if (!layer.feature) return null;
          const f = layer.feature;
          const tId = f.properties.themeId;
          
          const payload = {
              theme_id: tId,
              propriedades: f.properties,
              geometria: f.geometry
          };
          if (f.properties.id_banco) {
              payload.id = f.properties.id_banco;
          }
          return { layer, payload };
      }).filter(item => item !== null);
      
      if (dbPayloads.length > 0) {
          const payloads = dbPayloads.map(item => item.payload);
          try {
              const { data, error } = await supabaseClient.from('feicoes').upsert(payloads).select();
              if (error) {
                  console.error("Erro ao sincronizar feições em lote no Supabase:", error);
              } else if (data && data.length > 0) {
                  data.forEach(dbRow => {
                      const tempId = dbRow.propriedades && dbRow.propriedades._tempId;
                      if (tempId) {
                          const match = dbPayloads.find(item => item.layer.feature.properties._tempId === tempId);
                          if (match) {
                              match.layer.feature.properties.id_banco = dbRow.id;
                          }
                      }
                  });
              }
          } catch(e) {
              console.error("Erro ao sincronizar feições em lote:", e);
          }
      }
  }

  saveThemes();
  renderThemes();
  if (typeof renderFeatureTable === 'function') renderFeatureTable();
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
              <h3 class="text-base font-black text-white tracking-widest uppercase drop-shadow-md ${!isVisible ? 'opacity-50' : ''}">${theme.name}</h3>
              <div class="text-[12px] font-bold text-slate-200 mt-0.5">
                ${featureCount} <span class="text-[10px] text-slate-300 font-normal uppercase tracking-wider">Registros</span>
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
            <button onclick="toggleThemeStatsList('${theme.id}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-200 transition-colors" title="Painel de Estatísticas">
              <span class="material-symbols-outlined text-[18px]">pie_chart</span>
            </button>
            <button onclick="startEditingTheme('${theme.id}', '${theme.name}', '${theme.color}', '${theme.geomType || ''}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-200 transition-colors" title="Adicionar Feição">
              <span class="material-symbols-outlined text-[18px]">add</span>
            </button>
            <button onclick="openEditThemeModal('${theme.id}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-200 transition-colors" title="Editar Camada">
              <span class="material-symbols-outlined text-[18px]">settings</span>
            </button>
            <button onclick="triggerUpload('${theme.id}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-200 transition-colors" title="Importar GeoJSON">
              <span class="material-symbols-outlined text-[18px]">upload</span>
            </button>
            <button onclick="triggerTableUpload('${theme.id}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-200 transition-colors" title="Vincular Tabela (CSV)">
              <span class="material-symbols-outlined text-[18px]">table_chart</span>
            </button>
            <input type="file" id="table-upload-${theme.id}" class="hidden" accept=".csv" onchange="handleTableUpload(event, '${theme.id}')">
            <button onclick="downloadGeoJSON('${theme.id}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-200 transition-colors" title="Exportar">
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
        subHtml = `<span class="font-medium">${disp1Label}:</span> ${val1} <span class="mx-1 opacity-50">&bull;</span> <span class="font-medium">${disp2Label}:</span> ${val2}`;
    } else if (showDisp1) {
        subHtml = `<span class="font-medium">${disp1Label}:</span> ${val1}`;
    } else if (showDisp2) {
        subHtml = `<span class="font-medium">${disp2Label}:</span> ${val2}`;
    }
    
    html += `
      <div id="sidebar-item-${fid}" class="feature-list-item px-4 py-2 border-b border-white/5 hover:bg-white/10 cursor-pointer transition-all duration-300 border-l-4 border-l-transparent"
           data-search="${searchData}"
           onclick="zoomToFeature('${fid}')">
         <div class="text-xs font-semibold text-slate-100 break-words" title="${propName}">${propName}</div>
         ${subHtml ? `<div class="text-[10px] text-slate-300 break-words mt-0.5">${subHtml}</div>` : ''}
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
function getThemeField(theme, key) {
    if (!key) return null;
    if (theme && theme.formId && typeof allForms !== 'undefined') {
        const form = allForms.find(f => f.id === theme.formId);
        if (form && (form.schema || form.tabs)) {
            const schema = form.schema || form.tabs;
            for (const tab of schema) {
                if (tab.fields) {
                    const field = tab.fields.find(f => f.id === key || (f.name && f.name.toLowerCase() === key.toLowerCase()) || (f.label && f.label.toLowerCase() === key.toLowerCase()));
                    if (field) return field;
                }
            }
        }
    }
    return null;
}

function formatFilterValue(theme, fieldId, value) {
    if (value === undefined || value === null || value === '') return '';
    const field = getThemeField(theme, fieldId);
    if (field && (field.type === 'ipl' || field.type === 'ipf')) {
        const cleanVal = String(value).replace(/\D/g, '');
        if (cleanVal.length >= 20) {
            const cnj = cleanVal.substring(cleanVal.length - 20);
            return cnj.replace(/(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})/, "$1-$2.$3.$4.$5.$6");
        }
    }
    return String(value).trim();
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
                let val = getFeaturePropertyValue(theme, f, fieldId);
                if (val !== undefined && val !== null && val !== '') {
                    val = formatFilterValue(theme, fieldId, val);
                    if (val) uniqueValues.add(val);
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

function highlightFeature(fid, dontPan = false) {
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
    if (!dontPan) {
        if (targetLayer.getBounds) {
          map.flyToBounds(targetLayer.getBounds(), { maxZoom: 18, duration: 0.5 });
        } else if (targetLayer.getLatLng) {
          map.flyTo(targetLayer.getLatLng(), Math.max(map.getZoom(), 18), { duration: 0.5 });
        }
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
                    let val = getFeaturePropertyValue(theme, feature, rule.field) || '';
                    val = formatFilterValue(theme, rule.field, val);
                    if (!val.toLowerCase().includes(rule.value)) { match = false; break; }
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
        
        // Comportamento removido: O menu lateral não fecha mais automaticamente no celular
        // para permitir que o usuário aplique múltiplos filtros continuamente.
    }
  }

  // Atualizar dinamicamente os valores de outros dropdowns de filtro (cascata)
  if (!isRefreshingDropdowns) {
      isRefreshingDropdowns = true;
      try {
          refreshFilterDropdownOptions(themeId);
      } finally {
          isRefreshingDropdowns = false;
      }
  }
}

let isRefreshingDropdowns = false;

function refreshFilterDropdownOptions(themeId) {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;
    
    const container = document.getElementById('filters-container-' + themeId);
    if (!container) return;
    
    const rows = Array.from(container.querySelectorAll('.filter-row'));
    let anyValueReset = false;
    
    rows.forEach((currentRow, currentIndex) => {
        const fieldSelect = currentRow.querySelector('.filter-field');
        const valueSelect = currentRow.querySelector('.filter-value');
        
        if (fieldSelect && valueSelect && valueSelect.tagName === 'SELECT') {
            const currentFieldId = fieldSelect.value;
            const currentValue = valueSelect.value;
            
            // Coletar regras dos outros filtros (excluindo a linha atual)
            const otherRules = [];
            rows.forEach((row, idx) => {
                if (idx !== currentIndex) {
                    const fSelect = row.querySelector('.filter-field');
                    const vInput = row.querySelector('.filter-value');
                    if (fSelect && vInput && fSelect.value !== 'ALL' && vInput.value !== '') {
                        otherRules.push({ field: fSelect.value, value: vInput.value.toLowerCase().trim() });
                    }
                }
            });
            
            // Filtrar as feições baseado nas outras regras
            const filteredFeatures = theme.features.filter(f => {
                for (let rule of otherRules) {
                    let val = getFeaturePropertyValue(theme, f, rule.field);
                    val = formatFilterValue(theme, rule.field, val);
                    if (val === undefined || val === null || !val.toLowerCase().includes(rule.value)) {
                        return false;
                    }
                }
                return true;
            });
            
            // Extrair valores únicos
            const uniqueValues = new Set();
            filteredFeatures.forEach(f => {
                let val = getFeaturePropertyValue(theme, f, currentFieldId);
                if (val !== undefined && val !== null && val !== '') {
                    val = formatFilterValue(theme, currentFieldId, val);
                    if (val) uniqueValues.add(val);
                }
            });
            
            const sortedValues = Array.from(uniqueValues).sort();
            
            // Se o valor selecionado não é mais válido devido a outros filtros, reseta para ""
            let newValue = '';
            if (sortedValues.includes(currentValue)) {
                newValue = currentValue;
            } else if (currentValue !== '') {
                anyValueReset = true;
            }
            
            const optionsHtml = sortedValues.map(v => `<option value="${v}" ${v === newValue ? 'selected' : ''}>${v}</option>`).join('');
            valueSelect.innerHTML = `<option value="">-- Todos --</option>${optionsHtml}`;
            valueSelect.value = newValue;
        }
    });
    
    // Se algum valor foi limpo por incompatibilidade, re-executa a busca para atualizar o mapa/painel
    if (anyValueReset) {
        executeSearch(themeId);
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

async function saveNewTheme() {
  const name = document.getElementById('theme-name-input').value;
  const color = document.getElementById('theme-color-input').value;
  const opacity = parseFloat(document.getElementById('theme-opacity-input').value);
  const geomType = document.getElementById('theme-geometry') ? document.getElementById('theme-geometry').value : null;
  const icon = document.getElementById('theme-icon-input').value;
  const customIcon = document.getElementById('theme-custom-icon-data').value;
  const formId = document.getElementById('theme-cadastro-type') ? document.getElementById('theme-cadastro-type').value : '';
  if (!name) return;

  let id = 'theme_' + Date.now();
  
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
          const insertPayload = {
              nome: name,
              cor: color,
              icone: icon || 'map',
              tipo_geometria: geomType || 'Polygon',
              tipo_cadastro: formId || 'padrao'
          };
          if (window.supabaseTemasHasMetadata) {
              insertPayload.metadata = {
                  opacity: opacity,
                  weight: 2,
                  dashed: false,
                  disp1: 'Lote',
                  disp2: 'Quadra',
                  mainTitle: '',
                  disp1Active: false,
                  disp2Active: false,
                  customIcon: customIcon
              };
          }
          const { data, error } = await supabaseClient.from('temas').insert(insertPayload).select();
          
          if (error) {
              console.error("Erro ao criar tema no Supabase:", error);
              alert("Erro ao criar tema no banco de dados: " + error.message);
              return;
          }
          if (data && data.length > 0) {
              id = data[0].id;
          }
      } catch(e) {
          console.error("Erro ao conectar ao Supabase:", e);
      }
  }

  themes.push({ 
      id: id, 
      name: name, 
      color: color, 
      opacity: opacity, 
      geomType: geomType, 
      icon: icon, 
      customIcon: customIcon, 
      formId: formId, 
      cadastroType: formId, 
      disp1Active: false, 
      disp2Active: false, 
      features: [] 
  });
  
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

async function saveEditedTheme() {
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
    theme.cadastroType = formId;
    
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const updatePayload = {
                nome: name,
                cor: color,
                icone: icon || 'map',
                tipo_cadastro: formId || 'padrao'
            };
            
            if (window.supabaseTemasHasMetadata) {
                updatePayload.metadata = {
                    opacity: opacity,
                    weight: weight,
                    dashed: dashed,
                    disp1: disp1,
                    disp2: disp2,
                    mainTitle: mainTitle,
                    disp1Active: disp1Active,
                    disp2Active: disp2Active,
                    customIcon: customIcon
                };
            }
            
            await supabaseClient.from('temas').update(updatePayload).eq('id', themeBeingEdited);
        } catch(e) {
            console.error("Erro ao atualizar tema no Supabase:", e);
        }
    }
    
    saveThemes();
    loadAllFeaturesToMap(); // Update colors on the map
    renderThemes();
  }
  closeEditThemeModal();
}

async function deleteTheme(themeId) {
  if (!confirm("Tem certeza que deseja excluir esta camada e todos os seus dados?")) return;
  
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
          // Delete associated features first to respect RLS/Foreign Key integrity
          await supabaseClient.from('feicoes').delete().eq('theme_id', themeId);
          // Delete theme
          const { error } = await supabaseClient.from('temas').delete().eq('id', themeId);
          if (error) console.error("Erro ao deletar tema no Supabase:", error);
      } catch(e) {
          console.error("Erro ao deletar tema no Supabase:", e);
      }
  }

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

function findBestSelectOption(val, options) {
  if (val === undefined || val === null) return '';
  const strVal = String(val).trim();
  if (strVal === '') return '';
  
  // 1. Try exact match
  if (options.includes(strVal)) return strVal;
  
  // 2. Try case-insensitive and accent-insensitive and trim-sensitive match
  const cleanStr = strVal.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  
  for (const opt of options) {
      const cleanOpt = opt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      if (cleanStr === cleanOpt) {
          return opt; // Returns the exact case option defined in the form list!
      }
  }
  
  // 3. Try substring/containment match (e.g. if option is "Jardim" and val is "Jardim Atlântico", or vice-versa)
  for (const opt of options) {
      const cleanOpt = opt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      if (cleanStr.includes(cleanOpt) || cleanOpt.includes(cleanStr)) {
          return opt;
      }
  }
  
  // 4. Fallback: if we still can't find a match, just return the value as is.
  return strVal;
}

function updateValueMappings() {
    const valueMappingContainer = document.getElementById('value-mapping-container');
    const valueMappingList = document.getElementById('value-mapping-list');
    if (!valueMappingContainer || !valueMappingList) return;
    
    valueMappingList.innerHTML = '';
    let hasSelectMappings = false;
    
    // Find all select fields in the selected template
    const selectedFormId = document.getElementById('global-import-cadastro-type') ? document.getElementById('global-import-cadastro-type').value : '';
    let formFields = [];
    if (selectedFormId && typeof allForms !== 'undefined') {
        const form = allForms.find(f => f.id === selectedFormId);
        if (form && (form.schema || form.tabs)) {
            (form.schema || form.tabs).forEach(tab => {
                if (tab.fields) formFields.push(...tab.fields);
            });
        }
    }
    
    // Get all current mappings
    const selectElements = document.querySelectorAll('.property-rename-select');
    selectElements.forEach(select => {
        const originalProp = select.getAttribute('data-original');
        const targetFieldId = select.value;
        
        // Find if targetFieldId is a select field
        const field = formFields.find(f => f.id === targetFieldId);
        if (field && field.type === 'select') {
            hasSelectMappings = true;
            
            // Get all options for this select field
            const opts = (typeof field.options === 'string') 
                ? field.options.split(',').map(o => o.trim()).filter(o => o)
                : (Array.isArray(field.options) ? field.options : []);
                
            // Find all unique values in the imported GeoJSON for originalProp
            const uniqueValues = new Set();
            if (pendingGlobalGeoJSON && pendingGlobalGeoJSON.features) {
                pendingGlobalGeoJSON.features.forEach(f => {
                    if (f.properties && f.properties[originalProp] !== undefined && f.properties[originalProp] !== null) {
                        const trimmedVal = String(f.properties[originalProp]).trim();
                        if (trimmedVal !== '') {
                            uniqueValues.add(trimmedVal);
                        }
                    }
                });
            }
            
            if (uniqueValues.size > 0) {
                const header = document.createElement('div');
                header.className = 'text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-3 mb-1.5 border-t border-slate-100 dark:border-slate-800/50 pt-2';
                header.textContent = `Valores de "${originalProp}" ➔ Opções de "${field.label}":`;
                valueMappingList.appendChild(header);
                
                uniqueValues.forEach(val => {
                    const row = document.createElement('div');
                    row.className = 'flex items-center gap-2 mb-1.5';
                    
                    // Label showing the original value
                    const originalLabel = document.createElement('span');
                    originalLabel.className = 'w-1/2 text-sm text-slate-600 dark:text-slate-400 font-mono truncate text-right';
                    originalLabel.title = val;
                    originalLabel.textContent = val;
                    
                    const arrow = document.createElement('span');
                    arrow.className = 'material-symbols-outlined text-slate-400 text-sm';
                    arrow.textContent = 'arrow_forward';
                    
                    // Select element containing the dropdown options
                    const selectMapping = document.createElement('select');
                    selectMapping.className = 'flex-1 px-2 py-1 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-primary dark:text-white value-mapping-select';
                    selectMapping.setAttribute('data-original-prop', originalProp);
                    selectMapping.setAttribute('data-original-value', val);
                    selectMapping.setAttribute('data-target-field-id', targetFieldId);
                    
                    // Pre-match options using case-insensitive/fuzzy logic
                    let bestMatchOption = findBestSelectOption(val, opts);
                    
                    let mappingOptionsHtml = `<option value="">-- Deixar em branco --</option>`;
                    opts.forEach(opt => {
                        const isSel = (opt === bestMatchOption) ? 'selected' : '';
                        mappingOptionsHtml += `<option value="${opt}" ${isSel}>${opt}</option>`;
                    });
                    
                    selectMapping.innerHTML = mappingOptionsHtml;
                    
                    row.appendChild(originalLabel);
                    row.appendChild(arrow);
                    row.appendChild(selectMapping);
                    valueMappingList.appendChild(row);
                });
            }
        }
    });
    
    if (hasSelectMappings) {
        valueMappingContainer.classList.remove('hidden');
    } else {
        valueMappingContainer.classList.add('hidden');
    }
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
       
       mappingControl = `<select data-original="${prop}" onchange="updateValueMappings()" class="flex-1 px-2 py-1 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-primary dark:text-white property-rename-select">${options}</select>`;
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
  
  // Update value mapping UI on load
  updateValueMappings();
}

async function confirmGlobalImport() {
  if (!pendingGlobalGeoJSON) return;
  
  let themeName = document.getElementById('global-import-theme-name').value.trim();
  const formId = document.getElementById('global-import-cadastro-type') ? document.getElementById('global-import-cadastro-type').value : '';
  
  if (formId && typeof allForms !== 'undefined') {
      const form = allForms.find(f => f.id === formId);
      if (form) {
          themeName = form.name || form.title || themeName;
      }
  }
  if (!themeName) themeName = "Tema Importado";
  
  const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
  const themeColor = colors[Math.floor(Math.random() * colors.length)];
  
  let themeId = 'theme_' + Date.now();
  
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
          const { data, error } = await supabaseClient.from('temas').insert({
              nome: themeName,
              cor: themeColor,
              icone: 'map',
              tipo_geometria: 'Polygon',
              tipo_cadastro: formId || 'padrao'
          }).select();
          
          if (error) {
              console.error("Erro ao criar tema na importação:", error);
              alert("Erro ao criar camada no banco de dados: " + error.message);
              return;
          }
          if (data && data.length > 0) {
              themeId = data[0].id;
          }
      } catch(e) {
          console.error("Erro ao conectar ao Supabase na importação:", e);
      }
  }
  
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
  // formId is already declared at the top of this function

  let formFieldsMap = {};
  let selectFieldOptionsMap = {};
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
                          if (field.type === 'select' && field.options) {
                              const opts = (typeof field.options === 'string')
                                  ? field.options.split(',').map(o => o.trim()).filter(o => o)
                                  : (Array.isArray(field.options) ? field.options : []);
                              selectFieldOptionsMap[field.id] = opts;
                          }
                      });
                  }
              });
          }
      }
  }

  // Get selected option value mappings
  const valueMappings = {};
  document.querySelectorAll('.value-mapping-select').forEach(select => {
      const targetFieldId = select.getAttribute('data-target-field-id');
      const origVal = select.getAttribute('data-original-value');
      const mappedVal = select.value;
      if (!valueMappings[targetFieldId]) {
          valueMappings[targetFieldId] = {};
      }
      valueMappings[targetFieldId][origVal] = mappedVal;
  });

  pendingGlobalGeoJSON.features.forEach(f => {
    if (!f.properties) f.properties = {};
    if (!f.properties._tempId) f.properties._tempId = 'feat_' + Math.random().toString(36).substr(2, 9);
    
    const newProps = { themeId: themeId, _tempId: f.properties._tempId };
    
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
            if ((fieldType === 'cpfcnpj' || fieldType === 'ipl' || fieldType === 'ipf' || fieldType === 'insc_imob_cabedelo') && typeof val === 'string') {
                val = val.replace(/\D/g, ''); // Extract only numbers
            } else if (fieldType === 'select') {
                const strVal = val !== undefined && val !== null ? String(val).trim() : '';
                if (valueMappings[actualKey] && valueMappings[actualKey][strVal] !== undefined) {
                    val = valueMappings[actualKey][strVal];
                } else {
                    const opts = selectFieldOptionsMap[actualKey];
                    if (opts && opts.length > 0) {
                        val = findBestSelectOption(strVal, opts);
                    }
                }
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
  themes.push({ id: themeId, name: themeName, color: themeColor, formId: formId, cadastroType: formId, disp1Active: false, disp2Active: false, features: [] });
  
  const newLayer = L.geoJSON(pendingGlobalGeoJSON);
  geojsonLayer.addData(pendingGlobalGeoJSON);
  await syncMapDataToThemes();
  
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
  
  // Força o card a receber cliques (bypass de cache do HTML/Tailwind)
  const card = document.getElementById('feature-info-card');
  if (card) {
      card.style.pointerEvents = 'auto';
  }

  // Garantia absoluta de que o stats-dashboard-modal não está bloqueando (cliques fantasmas)
  const statsModal = document.getElementById('stats-dashboard-modal');
  if (statsModal && statsModal.classList.contains('opacity-0')) {
      statsModal.style.display = 'none';
      statsModal.style.zIndex = '-1';
      statsModal.classList.add('pointer-events-none', 'hidden');
  }
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
          window.renderDynamicForm(dynamicFormSchema, properties, isFeatureEditMode, 'feature-info-content', { activeTabId: window.currentActiveTabId, editTabId: window.activeFeatureEditTabId || null });
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

window.activeFeatureEditTabId = null;

function toggleFeatureEditMode(tabId = null) {
  const container = document.getElementById('feature-info-content');
  const scrollPos = container ? container.scrollTop : 0;
  
  isFeatureEditMode = true;
  window.activeFeatureEditTabId = tabId;
  renderFeatureInfo();
  
  document.getElementById('feature-actions-container').classList.add('hidden');
  

  if (container) {
      setTimeout(() => container.scrollTop = scrollPos, 0);
  }
}

function cancelFeatureEdit() {
  const container = document.getElementById('feature-info-content');
  const scrollPos = container ? container.scrollTop : 0;

  isFeatureEditMode = false;
  window.activeFeatureEditTabId = null;
  renderFeatureInfo();
  
  document.getElementById('feature-actions-container').classList.remove('hidden');
  
  if (container) {
      setTimeout(() => container.scrollTop = scrollPos, 0);
  }
}

async function saveFeatureData() {
  if (typeof window.evaluateFormCalculations === 'function') {
      window.evaluateFormCalculations(document.body);
  }
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
  window.activeFeatureEditTabId = null;
  renderFeatureInfo();
  document.getElementById('feature-actions-container').classList.remove('hidden');
}

function closeFeatureInfoModal(keepLayer = false) {
  document.getElementById('feature-info-modal').classList.add('hidden');
  
  // Reset card positioning and fullscreen state
  const card = document.getElementById('feature-info-card');
  const icon = document.querySelector('#btn-feature-fullscreen span');
  if (card) {
      card.classList.remove('left-0', 'right-0', 'bottom-0', 'w-full', 'rounded-none');
      card.classList.add('right-4', 'md:right-6', 'bottom-4', 'rounded-2xl', 'w-[90%]', 'max-w-sm', 'sm:max-w-md', 'top-[4.5rem]', 'md:top-[5rem]');
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
      // Temporariamente suspende o bloqueio de pointer-events na seleção para permitir edição
      const styleTag = document.getElementById('dynamic-selection-style');
      if (styleTag) styleTag.innerHTML = '';

      layerToEdit.pm.enable({
        allowSelfIntersection: true,
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

  // Restaura o estilo de pointer-events se houver uma seleção ativa
  if (window.activeSelectionThemeId) {
      const styleTag = document.getElementById('dynamic-selection-style');
      if (styleTag) {
          styleTag.innerHTML = `
              .theme-feature { pointer-events: none !important; }
              .theme-${window.activeSelectionThemeId} { pointer-events: auto !important; }
          `;
      }
  }

  const toolbar = document.getElementById('geometry-edit-toolbar');
  toolbar.classList.add('hidden');
  toolbar.classList.remove('flex');
}

async function deleteActiveFeature() {
  if (!activeFeatureLayer) return;
  
  if (!confirm("Tem certeza que deseja excluir esta feição permanentemente?")) return;
  
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      const idBanco = activeFeatureLayer.feature && activeFeatureLayer.feature.properties && activeFeatureLayer.feature.properties.id_banco;
      if (idBanco) {
          try {
              await supabaseClient.from('feicoes').delete().eq('id', idBanco);
          } catch(e) {
              console.error("Erro ao deletar feição no Supabase:", e);
          }
      }
  }

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
  setupSupabaseRealtime();
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

let isStreetViewDragging = false;
let streetViewDragStartX, streetViewDragStartY;
let streetViewStartLeft, streetViewStartTop;
let isStreetViewFullscreen = false;
let streetViewPreFullscreenStyle = null;
let isStreetViewResizing = false;
let streetViewResizeStartX, streetViewResizeStartY;
let streetViewStartWidth, streetViewStartHeight;

window.isSelectingStreetViewCoordinate = false;

function openStreetView() {
  if (window.isSelectingStreetViewCoordinate) return;
  
  window.isSelectingStreetViewCoordinate = true;
  map.getContainer().style.cursor = 'crosshair';
  showWarningToast("Clique no mapa (no eixo da rua) para abrir o Street View deste ponto.");
  
  // Bind single click listener
  map.once('click', onMapStreetViewClick);
  
  // Add escape key listener to cancel
  document.addEventListener('keydown', onStreetViewCancelEsc);
}

function onMapStreetViewClick(e) {
  // Reset state
  map.getContainer().style.cursor = '';
  window.isSelectingStreetViewCoordinate = false;
  document.removeEventListener('keydown', onStreetViewCancelEsc);
  
  // Open Street View at the clicked coordinate
  openStreetViewAtCoordinate(e.latlng);
}

function onStreetViewCancelEsc(e) {
  if (e.key === 'Escape') {
      map.off('click', onMapStreetViewClick);
      map.getContainer().style.cursor = '';
      window.isSelectingStreetViewCoordinate = false;
      document.removeEventListener('keydown', onStreetViewCancelEsc);
      showWarningToast("Seleção do Street View cancelada.");
  }
}

function openStreetViewAtCoordinate(latlng) {
  if (!latlng) return;
  
  const overlay = document.getElementById('streetview-overlay');
  const card = document.getElementById('streetview-card');
  const iframe = document.getElementById('streetview-iframe');
  
  if (overlay && card && iframe) {
      // Chave embutida permanente e gratuita para o Street View
      const apiKey = 'AIzaSyCjmV_PqXvAiSw5Db-CD0v_SMnY6tkHGXw';
      const url = `https://www.google.com/maps/embed/v1/streetview?key=${apiKey}&location=${latlng.lat},${latlng.lng}`;
      iframe.src = url;
      overlay.classList.remove('hidden');
      card.classList.remove('hidden');
      
      // Reset centering styles if it hasn't been moved yet
      if (!card.style.left) {
          card.classList.add('left-1/2', 'top-1/2', '-translate-x-1/2', '-translate-y-1/2');
      }
  }
}

function closeStreetViewModal() {
    const overlay = document.getElementById('streetview-overlay');
    const card = document.getElementById('streetview-card');
    const iframe = document.getElementById('streetview-iframe');
    if (overlay && card && iframe) {
        iframe.src = '';
        overlay.classList.add('hidden');
        card.classList.add('hidden');
        
        // Reset fullscreen state if closed while in fullscreen
        if (isStreetViewFullscreen) {
            toggleStreetViewFullscreen();
        }
    }
}

function toggleStreetViewFullscreen() {
    const card = document.getElementById('streetview-card');
    const icon = document.querySelector('#btn-streetview-fullscreen span');
    if (!card) return;
    
    if (isStreetViewFullscreen) {
        // Restore
        if (streetViewPreFullscreenStyle) {
            card.style.left = streetViewPreFullscreenStyle.left;
            card.style.top = streetViewPreFullscreenStyle.top;
            card.style.width = streetViewPreFullscreenStyle.width;
            card.style.height = streetViewPreFullscreenStyle.height;
            card.style.transform = streetViewPreFullscreenStyle.transform;
            card.style.maxWidth = streetViewPreFullscreenStyle.maxWidth;
            card.className = streetViewPreFullscreenStyle.className;
        }
        if (icon) icon.textContent = 'open_in_full';
        isStreetViewFullscreen = false;
    } else {
        // Save
        streetViewPreFullscreenStyle = {
            left: card.style.left,
            top: card.style.top,
            width: card.style.width,
            height: card.style.height,
            transform: card.style.transform,
            maxWidth: card.style.maxWidth,
            className: card.className
        };
        
        // Go fullscreen
        card.classList.remove('left-1/2', 'top-1/2', '-translate-x-1/2', '-translate-y-1/2');
        card.style.left = '0px';
        card.style.top = '0px';
        card.style.width = '100vw';
        card.style.height = '100vh';
        card.style.maxWidth = 'none';
        card.style.transform = 'none';
        
        if (icon) icon.textContent = 'close_fullscreen';
        isStreetViewFullscreen = true;
    }
}

function makeStreetViewDraggable() {
    const card = document.getElementById('streetview-card');
    const header = document.getElementById('streetview-header');
    const mask = document.getElementById('streetview-iframe-mask');
    if (!card || !header) return;
    
    header.addEventListener('mousedown', (e) => {
        if (isStreetViewFullscreen) return;
        if (e.target.closest('button')) return;
        
        isStreetViewDragging = true;
        streetViewDragStartX = e.clientX;
        streetViewDragStartY = e.clientY;
        
        const rect = card.getBoundingClientRect();
        card.classList.remove('left-1/2', 'top-1/2', '-translate-x-1/2', '-translate-y-1/2');
        
        card.style.left = rect.left + 'px';
        card.style.top = rect.top + 'px';
        card.style.transform = 'none';
        
        streetViewStartLeft = rect.left;
        streetViewStartTop = rect.top;
        card.style.transition = 'none';
        header.style.cursor = 'grabbing';
        
        if (mask) mask.classList.remove('hidden');
    });

    document.addEventListener('mousemove', (e) => {
        if (!isStreetViewDragging) return;
        const dx = e.clientX - streetViewDragStartX;
        const dy = e.clientY - streetViewDragStartY;
        card.style.left = (streetViewStartLeft + dx) + 'px';
        card.style.top = (streetViewStartTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isStreetViewDragging) {
            isStreetViewDragging = false;
            header.style.cursor = 'move';
            card.style.transition = '';
            if (mask) mask.classList.add('hidden');
        }
    });
}

function makeStreetViewResizable() {
    const card = document.getElementById('streetview-card');
    const handle = document.getElementById('streetview-resize-handle');
    const mask = document.getElementById('streetview-iframe-mask');
    if (!card || !handle) return;
    
    handle.addEventListener('mousedown', (e) => {
        if (isStreetViewFullscreen) return;
        e.preventDefault();
        e.stopPropagation();
        
        isStreetViewResizing = true;
        streetViewResizeStartX = e.clientX;
        streetViewResizeStartY = e.clientY;
        
        const rect = card.getBoundingClientRect();
        streetViewStartWidth = rect.width;
        streetViewStartHeight = rect.height;
        card.style.transition = 'none';
        
        if (mask) mask.classList.remove('hidden');
    });

    document.addEventListener('mousemove', (e) => {
        if (!isStreetViewResizing) return;
        const dx = e.clientX - streetViewResizeStartX;
        const dy = e.clientY - streetViewResizeStartY;
        
        const newWidth = Math.max(350, streetViewStartWidth + dx);
        const newHeight = Math.max(250, streetViewStartHeight + dy);
        
        card.style.width = newWidth + 'px';
        card.style.height = newHeight + 'px';
        card.style.maxWidth = 'none';
    });

    document.addEventListener('mouseup', () => {
        if (isStreetViewResizing) {
            isStreetViewResizing = false;
            card.style.transition = '';
            if (mask) mask.classList.add('hidden');
        }
    });
}

window.openStreetView = openStreetView;
window.closeStreetViewModal = closeStreetViewModal;
window.toggleStreetViewFullscreen = toggleStreetViewFullscreen;
window.makeStreetViewDraggable = makeStreetViewDraggable;
window.makeStreetViewResizable = makeStreetViewResizable;

// --- Feature Info Card Dragging & Fullscreen ---
window.isFeatureInfoFullscreen = false;
let featureInfoStartLeft, featureInfoStartTop;

window.toggleFeatureInfoFullscreen = function() {
    const card = document.getElementById('feature-info-card');
    const icon = document.querySelector('#btn-feature-fullscreen span');
    if (!card) return;

    if (window.isFeatureInfoFullscreen) {
        // Restore
        card.classList.remove('left-0', 'right-0', 'bottom-0', 'top-0', 'w-full', 'rounded-none');
        card.classList.add('right-4', 'md:right-6', 'bottom-4', 'rounded-2xl', 'w-[90%]', 'max-w-sm', 'sm:max-w-md', 'top-[4.5rem]', 'md:top-[5rem]');
        card.style.left = '';
        card.style.top = '';
        card.style.right = '';
        card.style.bottom = '';
        card.style.maxHeight = '';
        if (icon) icon.textContent = 'open_in_full';
        window.isFeatureInfoFullscreen = false;
    } else {
        // Fullscreen
        card.classList.remove('right-4', 'md:right-6', 'bottom-4', 'rounded-2xl', 'w-[90%]', 'max-w-sm', 'sm:max-w-md', 'top-[4.5rem]', 'md:top-[5rem]');
        card.classList.add('left-0', 'right-0', 'bottom-0', 'top-0', 'w-full', 'rounded-none');
        card.style.left = '0px';
        card.style.top = '0px';
        card.style.right = '0px';
        card.style.bottom = '0px';
        card.style.maxHeight = '100dvh';
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
    makeStreetViewDraggable();
    makeStreetViewResizable();
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
    modal.style.display = ''; // Resetar o hard hide
    modal.classList.remove('pointer-events-none', 'hidden');
    

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
            const defaultColors = ['#06b6d4', '#3b82f6', '#8b5cf6', '#14b8a6', '#6366f1', '#475569', '#10b981', '#ef4444', '#f59e0b'];
            const colorsMap = {};
            
            rawLabels.forEach((label, i) => {
                if (widget.colorMap && widget.colorMap[label]) {
                    colorsMap[label] = widget.colorMap[label];
                } else if (widget.colorMap && widget.colorMap['N/I'] && label === 'N/I') {
                    colorsMap[label] = widget.colorMap['N/I'];
                } else {
                    colorsMap[label] = defaultColors[i % defaultColors.length];
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
                            backgroundColor: rawLabels.map(label => {
                                const col = colorsMap[label];
                                if (col === 'none') return 'rgba(148, 163, 184, 0.2)';
                                return col + (widget.type === 'bar' ? 'cc' : '');
                            }),
                            hoverBackgroundColor: rawLabels.map(label => {
                                const col = colorsMap[label];
                                if (col === 'none') return 'rgba(148, 163, 184, 0.35)';
                                return col;
                            }),
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
        modal.classList.add('pointer-events-none', 'hidden');
        modal.style.display = 'none'; // Garantia absoluta
        content.innerHTML = ''; // Destruir os cards fantasmas
        console.log("Stats dashboard fechado e limpo.");
    }, 500);
};


window.applyThemeClassification = function(themeId, fieldId, colorsJson) {
    try {
        const theme = themes.find(t => t.id === themeId);
        if (!theme) return;

        const colorsMap = JSON.parse(colorsJson);
        
        geojsonLayer.eachLayer(layer => {
            if (!layer || !layer.feature || !layer.feature.properties || layer.feature.properties.themeId !== themeId) return;
            
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

            if (newColor === 'none') {
                if (layer.options.originalStyle && layer.setStyle) {
                    layer.setStyle({
                        fillColor: layer.options.originalStyle.fillColor,
                        color: layer.options.originalStyle.color,
                        fillOpacity: layer.options.originalStyle.fillOpacity,
                        weight: layer.options.originalStyle.weight
                    });
                }
            } else {
                if (layer.setStyle) {
                    layer.setStyle({
                        fillColor: newColor,
                        color: newColor,
                        fillOpacity: 0.8,
                        weight: 2
                    });
                }
            }
        });
    } catch (e) {
        console.error("Erro em applyThemeClassification:", e);
    }
};

window.resetThemeClassification = function(themeId) {
    try {
        const theme = themes.find(t => t.id === themeId);
        if (!theme) return;

        geojsonLayer.eachLayer(layer => {
            if (!layer || !layer.feature || !layer.feature.properties || layer.feature.properties.themeId !== themeId) return;
            
            if (layer.options.originalStyle && layer.setStyle) {
                layer.setStyle({
                    fillColor: layer.options.originalStyle.fillColor,
                    color: layer.options.originalStyle.color,
                    weight: layer.options.originalStyle.weight,
                    fillOpacity: layer.options.originalStyle.fillOpacity
                });
                delete layer.options.originalStyle;
            }
            
            // Remove pulse effect if any safely
            if (layer.getElement) {
                const el = layer.getElement();
                if (el && el.classList && typeof el.classList.remove === 'function') {
                    el.classList.remove('animate-pulse', 'z-50');
                }
            }
        });
    } catch (e) {
        console.error("Erro em resetThemeClassification:", e);
    }
};

let feicoesRealtimeTimeout = null;

function setupSupabaseRealtime() {
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      // 1. Listen for changes in the 'temas' table
      supabaseClient
          .channel('temas-realtime')
          .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'temas' },
              async (payload) => {
                  console.log("Realtime: temas table changed!", payload);
                  await loadThemes();
                  renderThemes();
              }
          )
          .subscribe();

      // 2. Listen for changes in the 'feicoes' table
      supabaseClient
          .channel('feicoes-realtime')
          .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'feicoes' },
              async (payload) => {
                  console.log("Realtime: feicoes table changed!", payload);
                  
                  // Se a feição ativa que está sendo visualizada/editada foi excluída, fecha o modal imediatamente
                  if (payload.eventType === 'DELETE' && activeFeatureLayer) {
                      const deletedId = payload.old && payload.old.id;
                      const activeId = activeFeatureLayer.feature && activeFeatureLayer.feature.properties && activeFeatureLayer.feature.properties.id_banco;
                      if (deletedId && activeId && String(deletedId) === String(activeId)) {
                          map.removeLayer(activeFeatureLayer);
                          closeFeatureInfoModal();
                          showWarningToast("A feição que você estava visualizando foi excluída por outro usuário.");
                      }
                  }
                  
                  // Debouncer para recarregar o mapa e a interface evitando concorrência em upserts em lote
                  clearTimeout(feicoesRealtimeTimeout);
                  feicoesRealtimeTimeout = setTimeout(async () => {
                      const isEditingGeom = document.getElementById('geometry-edit-toolbar') && !document.getElementById('geometry-edit-toolbar').classList.contains('hidden');
                      if (isEditingGeom || (typeof isFeatureEditMode !== 'undefined' && isFeatureEditMode)) {
                          console.log("Realtime: Edição geométrica ou de atributos ativa. Ignorando recarregamento automático.");
                          return;
                      }

                      console.log("Processando atualização de feições Realtime...");
                      await loadThemes();
                      renderThemes();
                      loadAllFeaturesToMap();
                  }, 300);
              }
          )
          .subscribe();
  }
}

// --- MOTOR DE IMAGENS GEORREFERENCIADAS (GeoTIFF) ---
let rasterLayers = [];
let leafletRasterOverlays = {};

// Registrar projeções mais comuns do Brasil no Proj4
if (typeof proj4 !== 'undefined') {
    proj4.defs([
        ["EPSG:31981", "+proj=utm +zone=21 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"],
        ["EPSG:31982", "+proj=utm +zone=22 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"],
        ["EPSG:31983", "+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"],
        ["EPSG:31984", "+proj=utm +zone=24 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"],
        ["EPSG:29192", "+proj=utm +zone=22 +south +ellps=aust_SA +units=m +no_defs"],
        ["EPSG:29193", "+proj=utm +zone=23 +south +ellps=aust_SA +units=m +no_defs"],
        ["EPSG:32721", "+proj=utm +zone=21 +south +datum=WGS84 +units=m +no_defs"],
        ["EPSG:32722", "+proj=utm +zone=22 +south +datum=WGS84 +units=m +no_defs"],
        ["EPSG:32723", "+proj=utm +zone=23 +south +datum=WGS84 +units=m +no_defs"],
        ["EPSG:32724", "+proj=utm +zone=24 +south +datum=WGS84 +units=m +no_defs"]
    ]);
}

// Obter definição Proj4 via API epsg.io caso não esteja local
async function getProj4Def(epsgCode) {
    const code = `EPSG:${epsgCode}`;
    if (typeof proj4 === 'undefined') return null;
    try {
        if (proj4.defs(code)) return code;
    } catch(e) {}
    
    try {
        const res = await fetch(`https://epsg.io/${epsgCode}.proj4`);
        if (res.ok) {
            const def = await res.text();
            proj4.defs(code, def);
            return code;
        }
    } catch(e) {
        console.error("Erro ao carregar proj4 de epsg.io:", e);
    }
    return null;
}

// Carregar camadas raster salvas no Supabase
async function loadRasterLayers() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('imagens_raster').select('*').order('created_at', { ascending: true });
            if (error) {
                if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
                    return;
                }
                console.error("Erro ao carregar imagens raster:", error);
                return;
            }
            
            // Limpar overlays antigos do mapa
            Object.values(leafletRasterOverlays).forEach(overlay => {
                if (map) map.removeLayer(overlay);
            });
            leafletRasterOverlays = {};
            rasterLayers = data || [];
            
            // Adicionar novos overlays
            rasterLayers.forEach(raster => {
                if (raster.visivel && map) {
                    const bounds = raster.bbox;
                    const overlay = L.imageOverlay(raster.url_imagem, bounds, {
                        opacity: raster.opacidade !== undefined ? raster.opacidade : 0.8,
                        interactive: false
                    });
                    overlay.addTo(map);
                    leafletRasterOverlays[raster.id] = overlay;
                }
            });
            
            renderRasterLayersList();
        } catch(e) {
            console.error("Erro no loadRasterLayers:", e);
        }
    }
}

// Renderizar a lista de camadas raster na barra lateral
function renderRasterLayersList() {
    const container = document.getElementById('rasters-container');
    if (!container) return;
    
    if (rasterLayers.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-400 dark:text-slate-500 italic p-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center">Nenhuma imagem importada.</div>`;
        return;
    }
    
    container.innerHTML = '';
    rasterLayers.forEach(raster => {
        const item = document.createElement('div');
        item.className = 'flex flex-col rounded-xl overflow-hidden shadow-lg border border-white/10 transition-all duration-300';
        item.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(15,23,42,0.8) 100%)';
        
        item.innerHTML = `
            <div class="p-3 flex flex-col backdrop-blur-md">
                <!-- Header: Icon, Title, and Toggle -->
                <div class="flex items-center justify-between mb-2.5">
                    <div class="flex items-center gap-2.5 overflow-hidden">
                        <div class="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-[18px] text-emerald-400">satellite</span>
                        </div>
                        <div class="flex flex-col overflow-hidden">
                            <span class="text-xs font-bold text-white truncate w-36 sm:w-44" title="${raster.nome}">${raster.nome}</span>
                            <span class="text-[9px] text-slate-400 font-normal uppercase tracking-wider mt-0.5">GeoTIFF • Imagem</span>
                        </div>
                    </div>
                    
                    <!-- iOS-style Toggle -->
                    <label class="relative inline-flex items-center cursor-pointer shrink-0" title="${raster.visivel ? 'Ocultar' : 'Mostrar'} Imagem">
                        <input type="checkbox" class="sr-only peer" ${raster.visivel ? 'checked' : ''} onchange="toggleRasterVisibility('${raster.id}', this)">
                        <div class="w-9 h-5 bg-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                </div>
                
                <!-- Footer: Actions -->
                <div class="flex justify-start items-center border-t border-white/20 dark:border-white/10 pt-3 gap-2 w-full">
                    <button onclick="openEditRasterModal('${raster.id}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-200 transition-colors" title="Configurações da Imagem">
                        <span class="material-symbols-outlined text-[18px]">settings</span>
                    </button>
                    <button onclick="deleteRasterLayer('${raster.id}')" class="p-1.5 hover:bg-red-500/30 rounded-lg tooltip text-red-500 transition-colors" title="Excluir Imagem">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

// Alterar opacidade do raster
window.changeRasterOpacity = async function(rasterId, opacity) {
    const raster = rasterLayers.find(r => r.id === rasterId);
    if (raster) {
        raster.opacidade = parseFloat(opacity);
        const overlay = leafletRasterOverlays[rasterId];
        if (overlay) overlay.setOpacity(raster.opacidade);
        
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                await supabaseClient.from('imagens_raster').update({ opacidade: raster.opacidade }).eq('id', rasterId);
            } catch(e) {}
        }
    }
};

// Alternar visibilidade do raster
window.toggleRasterVisibility = async function(rasterId, checkbox) {
    const isVisible = checkbox.checked;
    const raster = rasterLayers.find(r => r.id === rasterId);
    if (raster) {
        raster.visivel = isVisible;
        const overlay = leafletRasterOverlays[rasterId];
        
        if (isVisible) {
            if (overlay && map) {
                overlay.addTo(map);
            } else if (map) {
                const bounds = raster.bbox;
                const newOverlay = L.imageOverlay(raster.url_imagem, bounds, {
                    opacity: raster.opacidade !== undefined ? raster.opacidade : 0.8,
                    interactive: false
                });
                newOverlay.addTo(map);
                leafletRasterOverlays[rasterId] = newOverlay;
            }
        } else {
            if (overlay && map) map.removeLayer(overlay);
        }
        
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                await supabaseClient.from('imagens_raster').update({ visivel: isVisible }).eq('id', rasterId);
            } catch(e) {}
        }
    }
};

// Excluir raster
window.deleteRasterLayer = async function(rasterId) {
    if (!confirm("Tem certeza que deseja excluir esta imagem de fundo?")) return;
    
    const overlay = leafletRasterOverlays[rasterId];
    if (overlay && map) {
        map.removeLayer(overlay);
        delete leafletRasterOverlays[rasterId];
    }
    
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const raster = rasterLayers.find(r => r.id === rasterId);
            if (raster) {
                const parts = raster.url_imagem.split('/');
                const fileName = parts[parts.length - 1];
                await supabaseClient.storage.from('rasters').remove([fileName]);
            }
            await supabaseClient.from('imagens_raster').delete().eq('id', rasterId);
        } catch(e) {
            console.error("Erro ao deletar raster:", e);
        }
    }
    
    rasterLayers = rasterLayers.filter(r => r.id !== rasterId);
    renderRasterLayersList();
};

// Event handler de importação de arquivo
// --- CENTRALIZED LOADING OVERLAY ---
window.showLoadingOverlay = function(message) {
    let overlay = document.getElementById('import-loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'import-loading-overlay';
        overlay.className = 'fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center transition-all duration-300 opacity-0';
        overlay.innerHTML = `
            <div class="bg-slate-900/90 border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 max-w-sm w-full mx-4 text-center transform scale-95 transition-transform duration-300">
                <div class="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
                <div class="flex flex-col gap-1">
                    <h3 class="text-sm font-bold text-white uppercase tracking-wider">Processando GeoTIFF</h3>
                    <p id="import-loading-message" class="text-xs text-slate-300 font-medium px-2 leading-relaxed">${message}</p>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // Trigger reflow for animations
        overlay.offsetHeight; 
        overlay.classList.remove('opacity-0');
        overlay.querySelector('div').classList.remove('scale-95');
    } else {
        const msgEl = document.getElementById('import-loading-message');
        if (msgEl) {
            msgEl.textContent = message;
        }
    }
};

window.hideLoadingOverlay = function() {
    const overlay = document.getElementById('import-loading-overlay');
    if (overlay) {
        overlay.classList.add('opacity-0');
        overlay.querySelector('div').classList.add('scale-95');
        setTimeout(() => overlay.remove(), 300);
    }
};

// Event handler de importação de arquivo
async function handleRasterImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    showLoadingOverlay("Lendo arquivo GeoTIFF...");
    
    const reader = new FileReader();
    reader.onload = async function(event) {
        try {
            await processGeoTIFF(event.target.result, file.name);
        } catch(err) {
            console.error("Erro ao processar GeoTIFF:", err);
            hideLoadingOverlay();
            alert("Erro ao processar arquivo GeoTIFF. Verifique se é uma imagem georreferenciada válida. Erro: " + err.message);
        }
    };
    reader.onerror = function() {
        hideLoadingOverlay();
        alert("Erro ao ler o arquivo local.");
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
}

// Processamento e compressão da imagem
async function processGeoTIFF(arrayBuffer, fileName) {
    if (typeof GeoTIFF === 'undefined') {
        hideLoadingOverlay();
        alert("A biblioteca GeoTIFF.js não foi carregada com sucesso.");
        return;
    }
    
    const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    
    // 1. Obter Bounding Box original
    const bbox = image.getBoundingBox(); // [xMin, yMin, xMax, yMax]
    if (!bbox || bbox.length < 4) {
        throw new Error("Arquivo não possui metadados geográficos (Bounding Box) válidos.");
    }
    
    // 2. Detectar Projeção
    const geoKeys = image.getGeoKeys();
    let epsg = 4326; // Padrão WGS 84
    if (geoKeys) {
        if (geoKeys.ProjectedCSTypeGeoKey) {
            epsg = geoKeys.ProjectedCSTypeGeoKey;
        } else if (geoKeys.GeographicTypeGeoKey) {
            epsg = geoKeys.GeographicTypeGeoKey;
        }
    }
    
    showLoadingOverlay(`Reprojetando coordenadas (EPSG:${epsg})...`);
    
    // 3. Garantir definição da projeção no proj4
    const srcProjection = await getProj4Def(epsg);
    if (!srcProjection) {
        throw new Error(`Sistema de Projeção EPSG:${epsg} não suportado ou falha ao baixar definição.`);
    }
    
    // 4. Reprojetar Bounding Box para WGS84 (EPSG:4326)
    const destProjection = 'EPSG:4326';
    let latLngBounds;
    if (epsg === 4326) {
        latLngBounds = [
            [bbox[1], bbox[0]], // [latMin, lngMin]
            [bbox[3], bbox[2]]  // [latMax, lngMax]
        ];
    } else {
        const bl = proj4(srcProjection, destProjection, [bbox[0], bbox[1]]);
        const tr = proj4(srcProjection, destProjection, [bbox[2], bbox[3]]);
        latLngBounds = [
            [bl[1], bl[0]], // [latMin, lngMin]
            [tr[1], tr[0]]  // [latMax, lngMax]
        ];
    }
    
    showLoadingOverlay("Decodificando e compactando imagem...");
    
    // 5. Redimensionar/Subamostrar para otimizar tamanho
    const width = image.getWidth();
    const height = image.getHeight();
    const maxDimension = 2048; // Limite de resolução máxima para visualização leve no cliente
    let scaleWidth = width;
    let scaleHeight = height;
    if (width > maxDimension || height > maxDimension) {
        if (width > height) {
            scaleWidth = maxDimension;
            scaleHeight = Math.round((height * maxDimension) / width);
        } else {
            scaleHeight = maxDimension;
            scaleWidth = Math.round((width * maxDimension) / height);
        }
    }
    
    // Ler os dados RGB subamostrados
    const rgbData = await image.readRGB({
        width: scaleWidth,
        height: scaleHeight
    });
    
    // Criar Canvas temporário
    const canvas = document.createElement('canvas');
    canvas.width = scaleWidth;
    canvas.height = scaleHeight;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(scaleWidth, scaleHeight);
    
    const numComponents = rgbData.length / (scaleWidth * scaleHeight);
    let srcIdx = 0;
    let destIdx = 0;
    
    // Preencher pixels no Canvas
    for (let i = 0; i < scaleWidth * scaleHeight; i++) {
        imgData.data[destIdx] = rgbData[srcIdx];       // R
        imgData.data[destIdx+1] = rgbData[srcIdx+1];   // G
        imgData.data[destIdx+2] = rgbData[srcIdx+2];   // B
        imgData.data[destIdx+3] = numComponents === 4 ? rgbData[srcIdx+3] : 255; // A
        srcIdx += numComponents;
        destIdx += 4;
    }
    ctx.putImageData(imgData, 0, 0);
    
    showLoadingOverlay("Fazendo upload da imagem...");
    
    // 6. Compactar para WebP e salvar no Supabase Storage
    canvas.toBlob(async (blob) => {
        if (!blob) {
            hideLoadingOverlay();
            alert("Erro ao compactar imagem raster no formato WebP.");
            return;
        }
        
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const fileExt = 'webp';
            const cleanFileName = fileName.replace(/\.[^/.]+$/, "");
            const uniqueFileName = `${cleanFileName}_${Date.now()}.${fileExt}`;
            
            const { data: storageData, error: storageError } = await supabaseClient.storage
                .from('rasters')
                .upload(uniqueFileName, blob, {
                    contentType: 'image/webp',
                    cacheControl: '3600',
                    upsert: false
                });
                
            if (storageError) {
                console.error("Erro ao subir arquivo para o Storage:", storageError);
                hideLoadingOverlay();
                alert("Erro ao salvar arquivo no Supabase Storage. Verifique se o bucket 'rasters' foi criado e está público. Detalhe: " + storageError.message);
                return;
            }
            
            // Obter URL pública
            const { data: urlData } = supabaseClient.storage
                .from('rasters')
                .getPublicUrl(uniqueFileName);
            const imageUrl = urlData.publicUrl;
            
            // Gravar metadados no banco
            const { data: dbData, error: dbError } = await supabaseClient
                .from('imagens_raster')
                .insert({
                    nome: cleanFileName,
                    url_imagem: imageUrl,
                    bbox: latLngBounds,
                    opacidade: 0.8,
                    visivel: true
                })
                .select();
                
            if (dbError) {
                console.error("Erro ao gravar metadados no banco:", dbError);
                hideLoadingOverlay();
                alert("Imagem salva no Storage, mas ocorreu um erro ao cadastrá-la no banco: " + dbError.message);
                return;
            }
            
            hideLoadingOverlay();
            showWarningToast("Imagem georreferenciada importada com sucesso!");
            
            // Adicionar localmente
            if (dbData && dbData.length > 0) {
                rasterLayers.push(dbData[0]);
                
                // Renderizar no mapa
                const bounds = dbData[0].bbox;
                const overlay = L.imageOverlay(dbData[0].url_imagem, bounds, {
                    opacity: 0.8,
                    interactive: false
                });
                if (map) overlay.addTo(map);
                leafletRasterOverlays[dbData[0].id] = overlay;
                
                renderRasterLayersList();
            }
        } else {
            hideLoadingOverlay();
            alert("Supabase não está configurado. A imagem compactada foi gerada no console.");
        }
    }, 'image/webp', 0.8);
}

// Configurar ouvintes e funções de UI Globais
window.openImportOptionsModal = function() {
    const modal = document.getElementById('import-options-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('scale-95'), 10);
    }
};

window.closeImportOptionsModal = function() {
    const modal = document.getElementById('import-options-modal');
    if (modal) {
        modal.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 150);
    }
};

window.triggerGeoJSONImport = function() {
    closeImportOptionsModal();
    const input = document.getElementById('global-geojson-upload');
    if (input) input.click();
};

window.triggerGeoTIFFImport = function() {
    closeImportOptionsModal();
    const input = document.getElementById('global-geotiff-upload');
    if (input) input.click();
};

// Adicionar ouvinte de alteração para upload de raster
window.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('global-geotiff-upload');
    if (input) {
        input.addEventListener('change', handleRasterImport);
    }
});

// --- EDIT RASTER MODAL HANDLERS ---
window.openEditRasterModal = function(rasterId) {
    const raster = rasterLayers.find(r => r.id === rasterId);
    if (!raster) return;
    
    document.getElementById('edit-raster-id').value = raster.id;
    document.getElementById('edit-raster-name').value = raster.nome;
    
    const opacity = raster.opacidade !== undefined ? raster.opacidade : 0.8;
    document.getElementById('edit-raster-opacity').value = opacity;
    document.getElementById('edit-raster-opacity-value').textContent = Math.round(opacity * 100) + '%';
    
    const modal = document.getElementById('edit-raster-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('scale-95'), 10);
    }
};

window.closeEditRasterModal = function() {
    const modal = document.getElementById('edit-raster-modal');
    if (modal) {
        modal.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 150);
    }
};

window.saveEditedRaster = async function() {
    const id = document.getElementById('edit-raster-id').value;
    const name = document.getElementById('edit-raster-name').value.trim();
    const opacity = parseFloat(document.getElementById('edit-raster-opacity').value);
    
    if (!name) {
        alert("O nome da imagem não pode ser vazio.");
        return;
    }
    
    const raster = rasterLayers.find(r => r.id === id);
    if (raster) {
        raster.nome = name;
        raster.opacidade = opacity;
        
        // Atualizar opacidade no Leaflet em tempo real
        const overlay = leafletRasterOverlays[id];
        if (overlay) {
            overlay.setOpacity(opacity);
        }
        
        // Atualizar no banco Supabase
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                showWarningToast("Salvando alterações...");
                const { error } = await supabaseClient
                    .from('imagens_raster')
                    .update({ nome: name, opacidade: opacity })
                    .eq('id', id);
                    
                if (error) throw error;
            } catch(e) {
                console.error("Erro ao salvar alterações da imagem:", e);
                alert("Erro ao salvar alterações no banco: " + e.message);
            }
        }
        
        renderRasterLayersList();
    }
    
    closeEditRasterModal();
};
