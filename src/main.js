window.changeTheme = function(theme) {
    localStorage.setItem('constructive_theme', theme);
    document.documentElement.classList.remove('light', 'dark', 'neon');
    if (theme === 'Azul neon') {
        document.documentElement.classList.add('neon', 'dark');
    } else if (theme === 'Escuro' || (theme === 'Automático' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.add('light');
    }
};

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if(localStorage.getItem('constructive_theme') === 'Automático') {
        window.changeTheme('Automático');
    }
});

let allForms = [];
async function fetchDynamicForm() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            let formsQuery = supabaseClient.from('forms').select('*').order('created_at', { ascending: false });
            if (activeMunicipioId) formsQuery = formsQuery.eq('municipio_id', activeMunicipioId);
            const { data, error } = await formsQuery;
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
                window.allForms = allForms;
                populateFormSelects();
                if (typeof renderThemes === 'function') renderThemes();
                if (typeof loadAllFeaturesToMap === 'function') loadAllFeaturesToMap();
            }
        } catch(e) { console.error(e); }
    } else {
        const saved = localStorage.getItem('constructive_forms');
        if (saved) {
            allForms = JSON.parse(saved);
            window.allForms = allForms;
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
// Chamada mais abaixo, dentro do DOMContentLoaded após ensureAuthenticated()
// — precisa do município ativo (sessionStorage) pra filtrar os formulários
// certos, e isso só existe depois do login confirmado.

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
let isLoadingThemes = false; // Evita recarregamentos simultâneos
const themesFeaturesLoaded = new Set(); // Controle de lazy loading por camada

async function loadThemes() {
  if (isLoadingThemes) {
      console.log("loadThemes: Já está carregando, ignorando chamada duplicada.");
      return;
  }
  isLoadingThemes = true;
  try {
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
          let temasQuery = supabaseClient.from('temas').select('*');
          if (activeMunicipioId) temasQuery = temasQuery.eq('municipio_id', activeMunicipioId);
          const { data: dbTemas, error: errTemas } = await temasQuery;
          if (errTemas) console.error("Erro ao carregar temas:", errTemas);

          // Geometria e propriedades NÃO são mais buscadas aqui — cada tema
          // carrega tudo de uma vez (ver loadThemeProperties), sob demanda,
          // só quando fica visível. Evita baixar temas desligados à toa.

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
                          tipo_cadastro: t.formId || 'padrao',
                          municipio_id: activeMunicipioId
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
                      // Por padrão TODAS as camadas começam DESLIGADAS — o usuário ativa no switch sob demanda
                      visible: false,
                      _geometryLoaded: false,
                      features: []
                  };
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
  window.themes = themes;
  window.loadThemeProperties = loadThemeProperties;
  } finally {
      isLoadingThemes = false;
  }
}

// Acima disso, a própria criação dos objetos Leaflet trava a aba do
// navegador — o mapa só renderiza até esse tanto de feições por tema de
// uma vez; passando disso, pede pra aproximar o zoom (ver loadAllFeaturesToMap).
const MAX_FEATURES_PER_VIEW = 1500;

// Roda uma lista de funções que retornam Promise em lotes (não tudo de uma
// vez) — o pooler de conexão do plano gratuito do Supabase rejeita com 500
// quando chegam muitas requisições simultâneas do mesmo cliente. Páginas
// "profundas" (offset alto) também são mais sujeitas a timeout no Postgres
// (OFFSET grande custa mais), então cada tarefa tenta de novo antes de desistir.
const PAGE_FETCH_CONCURRENCY = 4;
async function runWithRetry(fn, maxRetries) {
    let last;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        last = await fn();
        if (!last.error) return last;
        if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
        }
    }
    return last; // esgotou as tentativas — devolve o erro da última pra quem chamou decidir
}
async function runWithConcurrencyLimit(taskFns, concurrency, maxRetries = 2) {
    const results = [];
    for (let i = 0; i < taskFns.length; i += concurrency) {
        const batch = taskFns.slice(i, i + concurrency).map(fn => runWithRetry(fn, maxRetries));
        results.push(...await Promise.all(batch));
    }
    return results;
}

// Calcula o bounding box [minLng, minLat, maxLng, maxLat] de uma geometria
// GeoJSON — usado para decidir, localmente e sem rede, o que está dentro da
// área visível do mapa ao navegar (ver loadAllFeaturesToMap).
function computeGeoJSONBbox(geometry) {
    if (!geometry || !geometry.coordinates) return null;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    (function walk(coords) {
        if (typeof coords[0] === 'number') {
            const lng = coords[0], lat = coords[1];
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        } else {
            coords.forEach(walk);
        }
    })(geometry.coordinates);
    if (!isFinite(minLng)) return null;
    return [minLng, minLat, maxLng, maxLat];
}

function saveThemes() {
  // Salva APENAS metadados dos temas — feições vivem no Supabase, nunca no localStorage
  // Isso evita o erro de quota (60MB tentando ser salvo no limite de 5MB)
  const meta = {};
  const themeMeta = themes.map(t => {
      meta[t.id] = {
          opacity: t.opacity,
          weight: t.weight,
          dashed: t.dashed,
          disp1: t.disp1,
          disp2: t.disp2,
          mainTitle: t.mainTitle,
          disp1Active: t.disp1Active,
          disp2Active: t.disp2Active,
          customIcon: t.customIcon,
          visible: t.visible
      };
      return {
          id: t.id,
          name: t.name,
          color: t.color,
          icon: t.icon,
          geometryType: t.geometryType,
          cadastroType: t.cadastroType,
          formId: t.formId,
          visible: t.visible,
          features: [] // Nunca salva feicões no localStorage
      };
  });

  try {
      localStorage.setItem('constructive_themes_meta', JSON.stringify(meta));
      localStorage.setItem('constructive_themes', JSON.stringify(themeMeta));
  } catch(e) {
      // Mesmo sem feicões pode falhar se houver muitos temas — silencia
      console.warn('[saveThemes] Não foi possível salvar metadados:', e.message);
  }
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
  }).setView(cabedeloCenter, 16);
  window.map = map;

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
      let color = theme ? theme.color : '#333333';
      let opacity = theme && theme.opacity !== undefined ? theme.opacity : 0.4;
      let weight = theme && theme.weight !== undefined ? theme.weight : 2;
      let dashArray = theme && theme.dashed ? '5, 5' : '';

      // Preservar classificação temática ativa se o gráfico/dashboard estiver aberto
      if (theme && theme._activeClassification) {
        const { fieldId, colorsMap } = theme._activeClassification;
        const val = getFeaturePropertyValue(theme, feature, fieldId);
        const valStr = (val === undefined || val === null || val === '') ? "N/I" : String(val);
        
        let classColor = null;
        if (colorsMap[valStr]) {
            classColor = colorsMap[valStr];
        } else {
            const matchKey = Object.keys(colorsMap).find(k => k.trim().toLowerCase() === valStr.trim().toLowerCase());
            if (matchKey) classColor = colorsMap[matchKey];
        }
        if (!classColor && (valStr === 'N/I' || valStr === 'Não Informado' || valStr === '')) {
            classColor = colorsMap['N/I'] || colorsMap['Não Informado'];
        }
        if (classColor && classColor !== 'none') {
            color = classColor;
            opacity = 0.8;
            weight = 2;
        }
      }

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
      let color = theme ? theme.color : '#0284c7';
      
      // Preservar cor de classificação se ativa
      if (theme && theme._activeClassification) {
          const { fieldId, colorsMap } = theme._activeClassification;
          const val = getFeaturePropertyValue(theme, feature, fieldId);
          const valStr = (val === undefined || val === null || val === '') ? "N/I" : String(val);
          if (colorsMap[valStr]) color = colorsMap[valStr];
          else {
              const matchKey = Object.keys(colorsMap).find(k => k.trim().toLowerCase() === valStr.trim().toLowerCase());
              if (matchKey) color = colorsMap[matchKey];
          }
      }

      const iconName = theme && theme.icon ? theme.icon : 'location_on';
      const customIconData = theme && theme.customIcon ? theme.customIcon : null;
      
      const iconHtml = customIconData 
        ? `<img src="${customIconData}" style="width:14px; height:14px; object-fit:contain; border-radius:50%;">`
        : `<span class="material-symbols-outlined" style="color: ${color}; font-size: 15px; font-weight: bold;">${iconName === 'circle' ? 'circle' : iconName}</span>`;

      const safeId = String(themeId).replace(/[^a-zA-Z0-9]/g, '_');

      const pinHtml = `
        <div class="map-pin-3d-marker" style="position: relative; width: 30px; height: 38px; cursor: pointer; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.35)); transition: transform 0.15s ease-out;">
          <svg viewBox="0 0 30 38" width="30" height="38" style="display: block; overflow: visible;">
            <defs>
              <linearGradient id="grad_pin_${safeId}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="${color}" />
                <stop offset="100%" stop-color="#0f172a" stop-opacity="0.85" />
              </linearGradient>
            </defs>
            <!-- Sombra de projeção no solo -->
            <ellipse cx="15" cy="37" rx="5.5" ry="1.8" fill="rgba(0,0,0,0.25)" />
            <!-- Pino 3D com formato de gota e ponta para baixo -->
            <path d="M15,1 C7.268,1 1,7.268 1,15 C1,23.8 15,36.5 15,36.5 C15,36.5 29,23.8 29,15 C29,7.268 22.732,1 15,1 Z" 
                  fill="${color}" 
                  stroke="#ffffff" 
                  stroke-width="1.8" 
                  stroke-linejoin="round" />
            <!-- Círculo interior branco com relevo para acomodar o ícone -->
            <circle cx="15" cy="14" r="8" fill="#ffffff" />
          </svg>
          <!-- Ícone da camada perfeitamente centralizado -->
          <div style="position: absolute; top: 5px; left: 6px; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
            ${iconHtml}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: `custom-div-icon theme-feature theme-${themeId}`,
        html: pinHtml,
        iconSize: [30, 38],
        iconAnchor: [15, 37],
        tooltipAnchor: [0, -36]
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
      
      layer.on('click', async function(e) {
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

        // Lazy load: busca propriedades completas se ainda não foram carregadas
        if (!feature.properties._propertiesLoaded && feature.properties.id_banco) {
            await fetchFeaturePropertiesIfNeeded(layer);
        }

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
  map.on('pm:create', async function(e) {
    if (!editingThemeId) return;
    
    const feature = e.layer.toGeoJSON();
    if (!feature.properties) feature.properties = {};
    feature.properties.themeId = editingThemeId;
    if (!feature.properties._tempId) feature.properties._tempId = 'feat_' + Math.random().toString(36).substr(2, 9);
    
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

    // 1. Salvar no Supabase com ID único
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { data: insData, error: insErr } = await supabaseClient.from('feicoes').insert({
                theme_id: editingThemeId,
                propriedades: feature.properties,
                geometria: feature.geometry
            }).select();

            if (!insErr && insData && insData.length > 0) {
                feature.properties.id_banco = insData[0].id;
            }
        } catch(eDb) {
            console.error("Erro ao salvar nova feição no Supabase:", eDb);
        }
    }

    // 2. Adiciona ao tema em memória e no cache turbo
    const theme = themes.find(t => t.id === editingThemeId);
    if (theme) {
        if (!theme.features) theme.features = [];
        theme.features.push(feature);
        if (window.GeoEngineTurbo && typeof window.GeoEngineTurbo.indexTheme === 'function') {
            window.GeoEngineTurbo.indexTheme(editingThemeId, theme.features);
        }
        if (window.GeoTurboDB && typeof window.GeoTurboDB.saveThemeData === 'function') {
            window.GeoTurboDB.saveThemeData(editingThemeId, theme.features, theme.features.length);
        }
    }

    // 3. Adiciona a camada ao mapa
    geojsonLayer.addData(feature);

    // 4. Atualiza os cards das camadas
    renderThemes();

    // 5. Finaliza o modo de desenho
    stopDrawingMode();

    // 6. Localiza a layer criada e abre imediatamente o card do formulário
    let createdLayer = null;
    geojsonLayer.eachLayer(l => {
        if (l.feature && l.feature.properties) {
            const p = l.feature.properties;
            if ((feature.properties.id_banco && p.id_banco === feature.properties.id_banco) ||
                (feature.properties._tempId && p._tempId === feature.properties._tempId)) {
                createdLayer = l;
            }
        }
    });

    if (createdLayer) {
        showFeatureInfoModal(createdLayer);
    }
  });

  map.on('zoomend', function() {
    updateLabelsVisibility();
  });

  // Re-renderiza com busca espacial rápida (R-Tree) e debounce conforme o usuário navega.
  // Mantém 60 FPS sem congelamentos na UI.
  let moveEndTimer = null;
  map.on('moveend', function() {
      const drawingToolbar = document.getElementById('drawing-toolbar');
      const editToolbar = document.getElementById('geometry-edit-toolbar');
      const isDrawing = drawingToolbar && !drawingToolbar.classList.contains('hidden');
      const isEditingGeom = editToolbar && !editToolbar.classList.contains('hidden');
      if (isDrawing || isEditingGeom) return;
      
      clearTimeout(moveEndTimer);
      moveEndTimer = setTimeout(() => {
          loadAllFeaturesToMap();
      }, 70);
  });

  // Garante que o mapa cubra 100% da tela dinamicamente em celulares e redimensionamentos
  window.addEventListener('resize', () => {
      if (map) map.invalidateSize();
  });
  window.addEventListener('orientationchange', () => {
      setTimeout(() => { if (map) map.invalidateSize(); }, 200);
  });

  loadThemes().then(async () => {
    renderThemes(); // mostra os cards já — a contagem preenche conforme carrega
    
    const totalThemes = themes.length;
    let loadedCount = 0;
    
    for (const t of themes) {
        if (typeof userCanOnTheme === 'function' && !userCanOnTheme(t.id, 'ver')) continue;
        if (typeof updateSplashProgress === 'function') {
            const pct = 50 + Math.round((loadedCount / Math.max(1, totalThemes)) * 40);
            updateSplashProgress(`🗺️ Carregando camada "${t.name}"...`, pct);
        }
        await loadThemeProperties(t.id);
        loadedCount++;
    }
    
    if (typeof updateSplashProgress === 'function') {
        updateSplashProgress('🛰️ Carregando ortofotos e imagens...', 92);
    }
    
    if (typeof loadRasterLayers === 'function') {
        try { await loadRasterLayers(); } catch(eRaster) {}
    }
    
    loadAllFeaturesToMap();
    
    if (typeof hideSplashScreen === 'function') {
        hideSplashScreen();
    }
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

    // Esconde o rótulo se ele não couber dentro do polígono na tela — mede o
    // tamanho real do elemento (DOM), não uma estimativa por caractere, e
    // compara largura E altura (antes só checava largura).
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
        const pxHeight = Math.abs(se.y - nw.y);

        // offsetWidth/Height só reflete o tamanho real com o elemento visível
        tooltipEl.style.opacity = '1';
        const labelWidth = tooltipEl.offsetWidth;
        const labelHeight = tooltipEl.offsetHeight;

        const margin = 4;
        const fits = (labelWidth + margin) <= pxWidth && (labelHeight + margin) <= pxHeight;
        tooltipEl.style.opacity = fits ? '1' : '0';
    });
}

// Call initMap and setupIconDropdowns on window load since we no longer have a Google Maps callback
// This is now done at the bottom of the file


function loadAllFeaturesToMap() {
  if (!geojsonLayer) return;

  const activeTempId = activeFeatureLayer && activeFeatureLayer.feature && activeFeatureLayer.feature.properties && activeFeatureLayer.feature.properties._tempId;
  const activeDbId = activeFeatureLayer && activeFeatureLayer.feature && activeFeatureLayer.feature.properties && activeFeatureLayer.feature.properties.id_banco;

  const bounds = map ? map.getBounds() : null;
  const allFeatures = [];

  themes.slice().reverse().forEach(theme => {
    if (typeof userCanOnTheme === 'function' && !userCanOnTheme(theme.id, 'ver')) return;
    if (theme.visible !== false) {
      const withGeom = (theme.features || []).filter(f => f.geometry);
      let toRender = withGeom;

      if (theme._activeFilterFids) {
          toRender = withGeom.filter(f => theme._activeFilterFids.has(f.properties._tempId));
          if (toRender.length > MAX_FEATURES_PER_VIEW) {
              const alreadyWarned = theme._tooManyFeaturesInView;
              theme._tooManyFeaturesInView = toRender.length;
              if (!alreadyWarned && typeof showWarningToast === 'function') {
                  showWarningToast(`"${theme.name}": ${toRender.length} resultados — refine o filtro para ver todos no mapa.`);
              }
              toRender = toRender.slice(0, MAX_FEATURES_PER_VIEW);
          } else {
              theme._tooManyFeaturesInView = null;
          }
      } else if (withGeom.length > MAX_FEATURES_PER_VIEW && bounds) {
          // Busca espacial ultrarrápida O(log N) usando R-Tree se disponível
          let hits = null;
          if (window.GeoEngineTurbo && typeof window.GeoEngineTurbo.queryViewport === 'function') {
              hits = window.GeoEngineTurbo.queryViewport(theme.id, bounds);
          }

          if (hits) {
              toRender = hits;
          } else {
              const west = bounds.getWest(), east = bounds.getEast();
              const south = bounds.getSouth(), north = bounds.getNorth();
              toRender = withGeom.filter(f => {
                  let bbox = f.properties._bbox;
                  if (!bbox) {
                      bbox = computeGeoJSONBbox(f.geometry);
                      f.properties._bbox = bbox;
                  }
                  return bbox && bbox[2] >= west && bbox[0] <= east && bbox[3] >= south && bbox[1] <= north;
              });
          }

          if (toRender.length > MAX_FEATURES_PER_VIEW) {
              const alreadyWarned = theme._tooManyFeaturesInView;
              theme._tooManyFeaturesInView = toRender.length;
              if (!alreadyWarned && typeof showWarningToast === 'function') {
                  showWarningToast(`"${theme.name}": ${toRender.length} feições nesta área — aproxime o zoom para visualizá-las.`);
              }
              toRender = [];
          } else {
              theme._tooManyFeaturesInView = null;
          }
      } else {
          theme._tooManyFeaturesInView = null;
      }

      allFeatures.push(...toRender);
    }
  });

  const onRenderFinished = () => {
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
              highlightFeature(activeFeatureLayer.feature.properties._tempId, true);
          }
      }
      if (typeof updateLabelsVisibility === 'function') updateLabelsVisibility();
  };

  if (window.GeoEngineTurbo && typeof window.GeoEngineTurbo.renderFeaturesProgressive === 'function') {
      window.GeoEngineTurbo.renderFeaturesProgressive(geojsonLayer, allFeatures, onRenderFinished);
  } else {
      geojsonLayer.clearLayers();
      if (allFeatures.length > 0) {
          geojsonLayer.addData(allFeatures);
      }
      onRenderFinished();
  }
}

async function syncMapDataToThemes() {
  // Com o limite de renderização por densidade (MAX_FEATURES_PER_VIEW), um
  // tema pode ter milhares de feições carregadas em memória sem estarem
  // desenhadas no mapa neste momento (fora da área capada). Isso NÃO
  // significa que foram excluídas — exclusão é tratada explicitamente em
  // deleteActiveFeature(). Por isso: só atualiza/insere o que está de fato
  // renderizado agora, preservando o resto tal como estava.
  const layers = geojsonLayer.getLayers();

  const renderedKeys = new Set();
  layers.forEach(layer => {
      if (!layer.feature) return;
      const p = layer.feature.properties || {};
      if (p.id_banco) renderedKeys.add('id:' + p.id_banco);
      else if (p._tempId) renderedKeys.add('temp:' + p._tempId);
  });

  themes.forEach(t => {
      t.features = (t.features || []).filter(f => {
          const p = f.properties || {};
          const key = p.id_banco ? ('id:' + p.id_banco) : (p._tempId ? ('temp:' + p._tempId) : null);
          return !key || !renderedKeys.has(key);
      });
  });

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
          } else {
              payload.id = crypto.randomUUID();
          }
          return { layer, payload };
      }).filter(item => item !== null);
      
      if (dbPayloads.length > 0) {
          try {
              const chunkSize = 200;
              let allData = [];
              
              const newPayloads = dbPayloads.filter(item => !item.payload.id);
              const existingPayloads = dbPayloads.filter(item => item.payload.id);
              
              // Process new features using insert
              for (let i = 0; i < newPayloads.length; i += chunkSize) {
                  const dbPayloadsChunk = newPayloads.slice(i, i + chunkSize);
                  const payloadsChunk = dbPayloadsChunk.map(item => item.payload);
                  
                  const { data, error } = await supabaseClient.from('feicoes').insert(payloadsChunk).select();
                  if (error) {
                      console.error(`Erro ao inserir novas feições em lote (chunk ${Math.floor(i/chunkSize) + 1}):`, error);
                  } else if (data && data.length > 0) {
                      allData.push(...data);
                  }
              }
              
              // Process existing features using upsert
              for (let i = 0; i < existingPayloads.length; i += chunkSize) {
                  const dbPayloadsChunk = existingPayloads.slice(i, i + chunkSize);
                  const payloadsChunk = dbPayloadsChunk.map(item => item.payload);
                  
                  const { data, error } = await supabaseClient.from('feicoes').upsert(payloadsChunk).select();
                  if (error) {
                      console.error(`Erro ao atualizar feições em lote (chunk ${Math.floor(i/chunkSize) + 1}):`, error);
                  }
              }
              
              if (allData.length > 0) {
                  allData.forEach(dbRow => {
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

        // Lazy load: carrega propriedades completas em background ao abrir a lista
        // para que o filtro avançado funcione com todos os campos
        loadThemeProperties(themeId);
    } else {
        // Closing this layer
        listEl.classList.add('hidden');
        toggleSelectionTheme(themeId, false);
    }
}

function renderThemes() {
  const container = document.getElementById('themes-container');
  container.innerHTML = '';

  const isSuperAdmin = !!(typeof currentUserProfile !== 'undefined' && currentUserProfile && currentUserProfile.super_admin);
  const isAdmin = isSuperAdmin || (typeof currentMunicipioPapel !== 'undefined' && currentMunicipioPapel === 'admin');

  let draggedThemeIndex = null;

  themes.forEach((theme, index) => {
    // Filtro de Permissão: oculta completamente camadas que o usuário não tem permissão para ver
    if (typeof userCanOnTheme === 'function' && !userCanOnTheme(theme.id, 'ver')) {
        return;
    }

    const featureCount = theme.features ? theme.features.length : 0;
    const isVisible = theme.visible !== false;
    const isActiveSelection = window.activeSelectionThemeId === String(theme.id);
    
    const card = document.createElement('div');
    card.id = `theme-card-${theme.id}`;
    card.className = `theme-card relative overflow-hidden cursor-move transition-all duration-300 mx-3 mb-3 rounded-2xl border ${isActiveSelection ? 'scale-[1.02] z-10' : ''}`;
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
    
    if (isActiveSelection) {
        card.classList.add('ring-2', 'ring-offset-2', 'ring-offset-slate-900');
        card.style.setProperty('--tw-ring-color', theme.color);
        card.style.boxShadow = `0 0 25px ${theme.color}70, inset 0 0 15px ${theme.color}40`;
        card.style.borderColor = theme.color;
    } else {
        card.style.borderColor = isVisible ? `${theme.color}45` : 'rgba(255, 255, 255, 0.08)';
        card.style.boxShadow = isVisible ? `0 8px 24px rgba(0,0,0,0.35), 0 0 15px ${theme.color}25` : '0 4px 16px rgba(0,0,0,0.25)';
    }
    card.style.background = isVisible 
        ? `linear-gradient(135deg, ${theme.color}22 0%, rgba(15,23,42,0.75) 100%)` 
        : `rgba(15,23,42,0.55)`;
    
    let statsListHtml = '';
    const form = typeof allForms !== 'undefined' ? allForms.find(f => f.id === theme.formId) : null;
    if (form && form.statsConfig && form.statsConfig.length > 0) {
        statsListHtml = `<div id="stats-list-${theme.id}" class="hidden flex-col gap-2 mt-3 pt-3 border-t border-white/10 w-full transition-all">`;
        form.statsConfig.forEach((widget, idx) => {
            let iconHtml = widget.type === 'indicator' ? '123' : (widget.type === 'pie' ? 'pie_chart' : 'bar_chart');
            if (widget.type === 'indicator') {
                statsListHtml += `
                    <div class="flex items-center justify-between bg-slate-800/40 hover:bg-slate-700/60 rounded-lg p-2.5 cursor-pointer transition-all select-none group" onclick="openStatsDashboard('${theme.id}', ${idx})" title="Ver Indicador">
                        <div class="flex items-center gap-2 text-slate-300 group-hover:text-white transition-colors">
                            <span class="material-symbols-outlined text-[18px] text-cyan-400">${iconHtml}</span>
                            <span class="text-xs font-semibold">${widget.title || 'Indicador'}</span>
                        </div>
                        <span class="material-symbols-outlined text-[16px] text-slate-500 group-hover:text-cyan-400 transition-colors">open_in_new</span>
                    </div>
                `;
            } else {
                statsListHtml += `
                    <label class="flex items-center justify-between bg-slate-800/40 hover:bg-slate-700/60 rounded-lg p-2.5 cursor-pointer transition-all select-none group" title="Clique para ativar/desativar no mapa">
                        <div class="flex items-center gap-2 text-slate-300 group-hover:text-white transition-colors">
                            <span class="material-symbols-outlined text-[18px] text-cyan-400">${iconHtml}</span>
                            <span class="text-xs font-semibold">${widget.title || 'Gráfico'}</span>
                        </div>
                        <div class="relative inline-flex items-center pointer-events-none">
                            <input type="checkbox" name="layer-stat-toggle" class="sr-only peer layer-stat-toggle-${theme.id}" onchange="handleStatToggle('${theme.id}', ${idx}, this)">
                            <div class="w-8 h-4 bg-slate-700/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-500 shadow-inner"></div>
                        </div>
                    </label>
                `;
            }
        });
        statsListHtml += `</div>`;
    }

    card.innerHTML = `
      <div class="px-4 pt-4 pb-3 flex flex-col">
        
        <!-- Header: Icon, Title, and Toggle -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3 cursor-pointer group" onclick="toggleThemeListAndSelection('${theme.id}')" title="Clique para expandir e isolar seleção no mapa">
            <div class="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-110 border border-white/20" style="background-color: ${theme.color}; box-shadow: 0 4px 20px ${theme.color}80;">
               <span class="material-symbols-outlined text-[24px]">${theme.icon || 'layers'}</span>
            </div>
            <div class="flex flex-col">
              <h3 class="text-base font-black text-white tracking-widest uppercase drop-shadow-md ${!isVisible ? 'opacity-50' : ''}">${theme.name}</h3>
              <div class="text-[12px] font-bold text-slate-200 mt-0.5">
                <span id="theme-count-${theme.id}">${featureCount}</span> <span class="text-[10px] text-slate-300 font-normal uppercase tracking-wider">Registros</span>
              </div>
            </div>
          </div>
          
          <!-- iOS-style Neon Toggle -->
          <label class="relative inline-flex items-center cursor-pointer" title="${isVisible ? 'Ocultar' : 'Mostrar'} Camada">
            <input type="checkbox" id="theme-toggle-${theme.id}" class="sr-only peer" ${isVisible ? 'checked' : ''} onchange="toggleThemeVisibility('${theme.id}', this)">
            <div id="theme-toggle-bg-${theme.id}" class="w-11 h-6 bg-slate-700/60 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all" style="${isVisible ? `background-color: ${theme.color}; box-shadow: 0 0 12px ${theme.color}90;` : ''}"></div>
          </label>
        </div>
        
        <!-- Footer: Actions (Distribuídos em grid uniforme ocupando 100% do espaço) -->
        <div class="grid grid-flow-col auto-cols-fr gap-1.5 items-center border-t border-white/20 dark:border-white/10 pt-3 w-full">
            <button onclick="toggleThemeStatsList('${theme.id}')" class="flex items-center justify-center py-2 px-1 bg-white/10 hover:bg-white/25 active:scale-95 rounded-xl tooltip text-slate-200 transition-all border border-white/10 shadow-xs" title="Painel de Estatísticas">
              <span class="material-symbols-outlined text-[18px]">pie_chart</span>
            </button>
            <button onclick="startEditingTheme('${theme.id}', '${theme.name}', '${theme.color}', '${theme.geomType || ''}')" class="flex items-center justify-center py-2 px-1 bg-white/10 hover:bg-white/25 active:scale-95 rounded-xl tooltip text-slate-200 transition-all border border-white/10 shadow-xs" title="Adicionar Feição">
              <span class="material-symbols-outlined text-[18px]">add</span>
            </button>
            <button onclick="openEditThemeModal('${theme.id}')" class="flex items-center justify-center py-2 px-1 bg-white/10 hover:bg-white/25 active:scale-95 rounded-xl tooltip text-slate-200 transition-all border border-white/10 shadow-xs" title="Editar Camada">
              <span class="material-symbols-outlined text-[18px]">settings</span>
            </button>
            ${isSuperAdmin ? `
            <button onclick="triggerUpload('${theme.id}')" class="flex items-center justify-center py-2 px-1 bg-white/10 hover:bg-white/25 active:scale-95 rounded-xl tooltip text-slate-200 transition-all border border-white/10 shadow-xs" title="Importar GeoJSON">
              <span class="material-symbols-outlined text-[18px]">upload</span>
            </button>
            <button onclick="downloadGeoJSON('${theme.id}')" class="flex items-center justify-center py-2 px-1 bg-white/10 hover:bg-white/25 active:scale-95 rounded-xl tooltip text-slate-200 transition-all border border-white/10 shadow-xs" title="Exportar">
              <span class="material-symbols-outlined text-[18px]">download</span>
            </button>
            <button onclick="deleteTheme('${theme.id}')" class="flex items-center justify-center py-2 px-1 bg-red-500/15 hover:bg-red-500/30 active:scale-95 rounded-xl tooltip text-red-400 hover:text-red-300 transition-all border border-red-500/20 shadow-xs" title="Excluir">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>` : ''}
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

function toggleThemeVisibility(themeId, inputEl) {
  const theme = themes.find(t => t.id === themeId);
  if (!theme) return;

  const isChecked = inputEl ? inputEl.checked : (theme.visible === false);
  theme.visible = isChecked;
  saveThemes();

  // Resposta visual imediata no background do switch (muda de cor na hora para a cor do tema)
  const bgEl = document.getElementById('theme-toggle-bg-' + themeId);
  if (bgEl) {
      if (isChecked) {
          bgEl.style.backgroundColor = theme.color;
          bgEl.style.boxShadow = `0 0 12px ${theme.color}90`;
      } else {
          bgEl.style.backgroundColor = '';
          bgEl.style.boxShadow = '';
      }
  }

  const listEl = document.getElementById('feature-list-' + themeId);
  if (listEl) {
      if (isChecked) listEl.classList.remove('opacity-50');
      else listEl.classList.add('opacity-50');
  }

  // Atualização em background (não bloqueia a thread de cliques)
  setTimeout(async () => {
      if (isChecked && !theme._propertiesFullyLoaded) {
          await loadThemeProperties(theme.id);
      } else {
          loadAllFeaturesToMap();
      }
  }, 0);
}

// Carrega propriedades completas de todas as feições de uma camada
async function loadThemeProperties(themeId) {
    const theme = themes.find(t => t.id === themeId);
    if (!theme || theme._propertiesFullyLoaded) return;

    let cached = null;

    // 1. TENTA RECUPERAR DO CACHE PERSISTENTE INDEXED DB
    if (window.GeoTurboDB && typeof window.GeoTurboDB.getThemeData === 'function') {
        try {
            cached = await window.GeoTurboDB.getThemeData(themeId);
        } catch(eCache) {
            console.warn('[GeoEngineTurbo] Falha na leitura do cache IndexedDB:', eCache);
        }
    }

    // 2. CHECAGEM ULTRA-LEVE DE INTEGRIDADE NO SUPABASE (head: true gasta 0 bytes de geometria)
    let shouldInvalidateCache = false;
    if (typeof supabaseClient !== 'undefined' && supabaseClient && cached && cached.features && cached.features.length > 0) {
        try {
            const { count: realDbCount, error: countErr } = await supabaseClient
                .from('feicoes')
                .select('id', { count: 'exact', head: true })
                .eq('theme_id', themeId);
            
            if (!countErr && typeof realDbCount === 'number' && realDbCount !== cached.features.length) {
                console.log(`[GeoEngineTurbo] Sincronização detectou alteração no tema "${theme.name}": banco=${realDbCount} vs cache=${cached.features.length}. Atualizando base...`);
                shouldInvalidateCache = true;
            }
        } catch(eCount) {}
    }

    // Se o cache é válido e a contagem de registros bate com o Supabase
    if (cached && cached.features && cached.features.length > 0 && !shouldInvalidateCache) {
        console.log(`[GeoEngineTurbo] Tema "${theme.name}" recuperado do cache local validado: ${cached.features.length} feições`);
        
        // Atribui o array limpo para evitar duplicações acumuladas (ex: 20709 * 2)
        theme.features = cached.features.map(f => ({
            ...f,
            properties: { ...(f.properties || {}), themeId, _propertiesLoaded: true }
        }));

        theme._propertiesFullyLoaded = true;
        theme._geometryLoaded = true;

        // Indexa na R-Tree para consultas espaciais instantâneas
        if (window.GeoEngineTurbo && typeof window.GeoEngineTurbo.indexThemeFeatures === 'function') {
            window.GeoEngineTurbo.indexThemeFeatures(theme.id, theme.features);
        }

        loadAllFeaturesToMap();

        const countEl = document.getElementById('theme-count-' + themeId);
        if (countEl) countEl.textContent = theme.features.length;

        const listEl = document.getElementById('list-' + themeId);
        if (listEl && !listEl.classList.contains('hidden')) {
            const featureListEl = document.getElementById('feature-list-' + themeId);
            if (featureListEl) featureListEl.innerHTML = renderFeatureListItems(theme);
            if (!isRefreshingDropdowns) {
                isRefreshingDropdowns = true;
                try { refreshFilterDropdownOptions(themeId); }
                finally { isRefreshingDropdowns = false; }
            }
        }
        return; // Cache 100% válido e sincronizado!
    }

    // Se o cache estava desatualizado (feições foram excluídas/criadas por outro usuário), limpa os dados antigos
    if (shouldInvalidateCache) {
        theme.features = [];
    }

    if (!supabaseClient) return;

    try {
        // Carga completa do tema (geometria + propriedades) pela rede:
        const fetchStep = 1000;
        const first = await runWithRetry(() => supabaseClient
            .from('feicoes')
            .select('id, propriedades, geometria', { count: 'exact' })
            .eq('theme_id', themeId)
            .range(0, fetchStep - 1), 2);

        let hadPageError = !!first.error;
        if (first.error) console.error(`Erro ao buscar 1ª página de feições de "${themeId}":`, first.error);
        const allRows = first.error ? [] : (first.data || []);
        const count = first.count;

        if (!first.error && count && count > fetchStep) {
            const remainingPages = Math.ceil((count - fetchStep) / fetchStep);
            const taskFns = [];
            for (let p = 1; p <= remainingPages; p++) {
                const from = p * fetchStep;
                taskFns.push(() => supabaseClient
                    .from('feicoes')
                    .select('id, propriedades, geometria')
                    .eq('theme_id', themeId)
                    .range(from, from + fetchStep - 1));
            }
            const results = await runWithConcurrencyLimit(taskFns, PAGE_FETCH_CONCURRENCY);
            results.forEach(r => {
                if (r.error) {
                    hadPageError = true;
                    console.error(`Erro ao buscar página de feições de "${themeId}":`, r.error);
                } else if (r.data) {
                    allRows.push(...r.data);
                }
            });
        }

        const existingByBankId = new Map();
        theme.features.forEach(f => {
            if (f.properties && f.properties.id_banco) existingByBankId.set(f.properties.id_banco, f);
        });

        allRows.forEach(row => {
            const idBanco = row.id;
            const props = row.propriedades || {};
            const existing = existingByBankId.get(idBanco);
            if (existing) {
                existing.properties = { ...props, themeId, id_banco: idBanco, _propertiesLoaded: true };
                if (!existing.geometry) existing.geometry = row.geometria;
            } else {
                theme.features.push({
                    type: "Feature",
                    properties: { ...props, themeId, id_banco: idBanco, _propertiesLoaded: true },
                    geometry: row.geometria
                });
            }
        });

        if (hadPageError) {
            if (typeof showWarningToast === 'function') {
                showWarningToast(`"${theme.name}": algumas feições não carregaram (${allRows.length} de ${count || '?'}). Desligue e ligue a camada de novo pra tentar completar.`);
            }
            console.warn(`[LazyLoad] Tema "${theme.name}" carregado PARCIALMENTE: ${allRows.length} de ${count} feições`);
        } else {
            theme._propertiesFullyLoaded = true;
            theme._geometryLoaded = true;
            console.log(`[LazyLoad] Tema "${theme.name}" carregado por completo: ${allRows.length} feições`);

            // Grava no cache persistente IndexedDB para próximos acessos instantâneos
            if (window.GeoTurboDB && typeof window.GeoTurboDB.saveThemeData === 'function') {
                window.GeoTurboDB.saveThemeData(themeId, theme.features, theme.features.length);
            }
        }

        // Indexa na R-Tree
        if (window.GeoEngineTurbo && typeof window.GeoEngineTurbo.indexThemeFeatures === 'function') {
            window.GeoEngineTurbo.indexThemeFeatures(theme.id, theme.features);
        }

        // Desenha no mapa
        loadAllFeaturesToMap();

        const countEl = document.getElementById('theme-count-' + themeId);
        if (countEl) countEl.textContent = theme.features.length;

        const listEl = document.getElementById('list-' + themeId);
        if (listEl && !listEl.classList.contains('hidden')) {
            const featureListEl = document.getElementById('feature-list-' + themeId);
            if (featureListEl) {
                featureListEl.innerHTML = renderFeatureListItems(theme);
            }
            if (!isRefreshingDropdowns) {
                isRefreshingDropdowns = true;
                try { refreshFilterDropdownOptions(themeId); }
                finally { isRefreshingDropdowns = false; }
            }
        }
    } catch(e) {
        console.error('[LazyLoad] Erro ao carregar propriedades:', e);
    }
}


// Busca propriedades de UMA feição específica ao clicar (fallback se não carregadas ainda)
window.fetchFeaturePropertiesIfNeeded = async function(layer) {
    const props = layer?.feature?.properties;
    if (!props || props._propertiesLoaded || !props.id_banco) return;
    if (!supabaseClient) return;

    try {
        const { data, error } = await supabaseClient
            .from('feicoes')
            .select('propriedades')
            .eq('id', props.id_banco)
            .single();

        if (error || !data) return;
        Object.assign(layer.feature.properties, data.propriedades, { _propertiesLoaded: true });

        // Atualiza também no array de features do tema
        const theme = themes.find(t => t.id === props.themeId);
        if (theme) {
            const feat = theme.features.find(f => f.properties.id_banco === props.id_banco);
            if (feat) feat.properties = layer.feature.properties;
        }
    } catch(e) {
        console.error('[LazyLoad] Erro ao buscar propriedades da feição:', e);
    }
};

// Gera o HTML de um único item da lista de feições
function _buildFeatureItemHtml(theme, f) {
  var disp1 = theme.disp1 || 'Lote';
  var disp2 = theme.disp2 || 'Quadra';
  var searchData = Object.values(f.properties || {}).join(' ').toLowerCase();
  if (!f.properties._tempId) f.properties._tempId = 'feat_' + Math.random().toString(36).substr(2, 9);
  var fid = f.properties._tempId;
  var titleField = theme.mainTitle ? theme.mainTitle : 'Proprietário';
  var titleLabel = getThemeFieldLabel(theme, titleField);
  var disp1Label = getThemeFieldLabel(theme, disp1);
  var disp2Label = getThemeFieldLabel(theme, disp2);
  var propName = getFeaturePropertyValue(theme, f, titleField) || getFeaturePropertyValue(theme, f, 'Nome do Proprietário/Possuidor') || (theme.mainTitle ? ('Sem dado para ' + titleLabel) : 'Proprietário não informado');
  var val1 = getFeaturePropertyValue(theme, f, disp1) || '-';
  var val2 = getFeaturePropertyValue(theme, f, disp2) || '-';
  var showDisp1 = theme.disp1Active !== false;
  var showDisp2 = theme.disp2Active !== false;
  var subHtml = '';
  if (showDisp1 && showDisp2) {
    subHtml = '<span class="font-medium">' + disp1Label + ':</span> ' + val1 + ' <span class="mx-1 opacity-50">&bull;</span> <span class="font-medium">' + disp2Label + ':</span> ' + val2;
  } else if (showDisp1) {
    subHtml = '<span class="font-medium">' + disp1Label + ':</span> ' + val1;
  } else if (showDisp2) {
    subHtml = '<span class="font-medium">' + disp2Label + ':</span> ' + val2;
  }
  return '<div id="sidebar-item-' + fid + '" class="feature-list-item px-4 py-2 border-b border-white/5 hover:bg-white/10 cursor-pointer transition-all duration-300 border-l-4 border-l-transparent" data-search="' + searchData + '" onclick="zoomToFeature(\'' + fid + '\')">'
    + '<div class="text-xs font-semibold text-slate-100 break-words" title="' + propName + '">' + propName + '</div>'
    + (subHtml ? '<div class="text-[10px] text-slate-300 break-words mt-0.5">' + subHtml + '</div>' : '')
    + '</div>';
}

// Carrega mais itens na lista de feições da sidebar (paginação progressiva)
window.loadMoreFeatureItems = function(themeId, startIdx) {
  var theme = themes.find(function(t) { return t.id === themeId; });
  if (!theme) return;
  var container = document.getElementById('feature-list-' + themeId);
  if (!container) return;
  var btn = document.getElementById('load-more-btn-' + themeId);
  if (btn) btn.remove();
  var PAGE = 100;
  var endIdx = Math.min(startIdx + PAGE, theme.features.length);
  var html = '';
  for (var i = startIdx; i < endIdx; i++) {
    html += _buildFeatureItemHtml(theme, theme.features[i]);
  }
  var tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  while (tempDiv.firstChild) container.appendChild(tempDiv.firstChild);
  if (endIdx < theme.features.length) {
    var remaining = theme.features.length - endIdx;
    var newBtn = document.createElement('button');
    newBtn.id = 'load-more-btn-' + themeId;
    newBtn.className = 'w-full py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors flex items-center justify-center gap-1 border-t border-white/5';
    newBtn.innerHTML = '<span class="material-symbols-outlined text-[14px]">expand_more</span> Mostrar mais ' + Math.min(PAGE, remaining) + ' de ' + remaining + ' restantes';
    newBtn.onclick = (function(tid, eidx) { return function() { window.loadMoreFeatureItems(tid, eidx); }; })(themeId, endIdx);
    container.appendChild(newBtn);
  }
};

function renderFeatureListItems(theme) {
  if (!theme.features || theme.features.length === 0) {
    return '<div class="px-4 py-3 text-xs text-slate-400 italic">Nenhuma feição adicionada.</div>';
  }
  var PAGE = 100;
  var total = theme.features.length;
  var html = '';
  for (var i = 0; i < Math.min(PAGE, total); i++) {
    html += _buildFeatureItemHtml(theme, theme.features[i]);
  }
  if (total > PAGE) {
    var remaining = total - PAGE;
    html += '<button id="load-more-btn-' + theme.id + '" class="w-full py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors flex items-center justify-center gap-1 border-t border-white/5" onclick="loadMoreFeatureItems(\'' + theme.id + '\', ' + PAGE + ')">'
      + '<span class="material-symbols-outlined text-[14px]">expand_more</span>'
      + ' Mostrar mais ' + Math.min(PAGE, remaining) + ' de ' + remaining + ' restantes'
      + '</button>';
  }
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
        
        // Campo de texto com autocomplete (datalist) em vez de <select>: com
        // milhares de valores possíveis, rolar uma lista fixa é inviável —
        // digitar e ver só os que combinam é bem mais rápido.
        const datalistId = `filter-values-${theme.id}-${fieldId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        const optionsHtml = Array.from(uniqueValues).sort().map(v => `<option value="${String(v).replace(/"/g, '&quot;')}"></option>`).join('');

        valueContainer.innerHTML = `<input type="text" list="${datalistId}" class="filter-value w-full text-[10px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-700 dark:text-slate-300" placeholder="Digite ou selecione..." onkeyup="executeSearch('${theme.id}')" onchange="executeSearch('${theme.id}')">
            <datalist id="${datalistId}">${optionsHtml}</datalist>` + btnHtml;
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

async function zoomToFeature(fid) {
  if (!geojsonLayer) return;

  // Acha a feição em memória, não a camada Leaflet — ela pode não estar
  // desenhada no momento (tema desligado, ou área "capada" por densidade
  // por estar zoom afastado). O zoom não depende de já estar renderizada.
  let ownerTheme = null, targetFeature = null;
  for (const theme of themes) {
    const found = (theme.features || []).find(f => f.properties && f.properties._tempId === fid);
    if (found) { ownerTheme = theme; targetFeature = found; break; }
  }
  if (!targetFeature || !ownerTheme) return;

  // Feição ainda é um "stub" (geometria não carregada) — busca sob demanda.
  if (!targetFeature.geometry && targetFeature.properties.id_banco && supabaseClient) {
    try {
      const { data } = await supabaseClient.from('feicoes').select('geometria').eq('id', targetFeature.properties.id_banco).single();
      if (data && data.geometria) targetFeature.geometry = data.geometria;
    } catch (e) {
      console.error('Erro ao buscar geometria da feição:', e);
    }
  }
  if (!targetFeature.geometry) return;

  // Liga o tema se estiver desligado (padrão do sistema) — sem
  // renderThemes(), que fecharia o painel/lista de onde partiu o clique.
  if (ownerTheme.visible === false) {
    ownerTheme.visible = true;
    saveThemes();
  }

  // Calcula os limites direto da geometria (GeoJSON), sem precisar que ela
  // já exista como camada Leaflet desenhada.
  const targetBounds = L.geoJSON(targetFeature).getBounds();
  if (targetBounds.isValid()) {
    map.fitBounds(targetBounds, { padding: [50, 50], maxZoom: 21 });
  }

  // Dá um instante pro mapa assentar no novo zoom/posição (bem mais próximo
  // = bem menos feições na área = sai do limite de densidade sozinho) antes
  // de redesenhar e aplicar o destaque visual na camada de verdade.
  setTimeout(() => {
    loadAllFeaturesToMap();
    highlightFeature(fid, true);
  }, 300);

  // Fechar menu lateral em telas menores
  if (window.innerWidth < 768) {
    document.getElementById('side-drawer').classList.add('-translate-x-[120%]');
    document.getElementById('drawer-overlay').classList.add('hidden');
  }
}

// Debounce para o executeSearch (evita rodar a cada tecla com 20k itens)
const _searchDebounce = {};

function executeSearch(themeId) {
  clearTimeout(_searchDebounce[themeId]);
  _searchDebounce[themeId] = setTimeout(() => _executeSearchNow(themeId), 150);
}

async function _executeSearchNow(themeId) {
  var filterContainer = document.getElementById('filters-container-' + themeId);
  if (!filterContainer) return;

  var rules = [];
  filterContainer.querySelectorAll('.filter-row').forEach(function(row) {
      var field = row.querySelector('.filter-field').value;
      var value = row.querySelector('.filter-value').value.toLowerCase().trim();
      if (value !== '') rules.push({ field: field, value: value });
  });

  var theme = themes.find(function(t) { return t.id === themeId; });
  if (!theme) return;

  var listContainer = document.getElementById('feature-list-' + themeId);
  if (!listContainer) return;

  var hasAnyFilter = rules.length > 0;
  var visibleFids = new Set();

  // Buscar implica em querer ver o resultado no mapa — liga a camada se
  // estiver desligada (padrão do sistema), em vez de filtrar "no vazio".
  // Não chama renderThemes() aqui de propósito: isso re-renderiza a sidebar
  // inteira e fecharia o próprio painel de filtro que o usuário está usando
  // (ele volta a ficar visualmente sincronizado no próximo render natural).
  if (hasAnyFilter && theme.visible === false) {
    theme.visible = true;
    saveThemes();
  }

  if (!hasAnyFilter) {
    // Sem filtro: restaura a lista paginada normal e volta pra renderização
    // normal por viewport (some com a exceção de "sempre mostra os resultados")
    theme._activeFilterFids = null;
    listContainer.innerHTML = renderFeatureListItems(theme);
    loadAllFeaturesToMap();
    return;
  }

  // Com filtro: garante _tempId em todas as feições
  (theme.features || []).forEach(function(f) {
    if (!f.properties._tempId) f.properties._tempId = 'feat_' + Math.random().toString(36).substr(2, 9);
  });

  // Filtra em TODOS os theme.features (não apenas os 100 no DOM)
  var matchedFeatures = (theme.features || []).filter(function(f) {
    for (var ri = 0; ri < rules.length; ri++) {
      var rule = rules[ri];
      if (rule.field === 'ALL') {
        var searchData = Object.values(f.properties || {}).join(' ').toLowerCase();
        if (!searchData.includes(rule.value)) return false;
      } else {
        var val = getFeaturePropertyValue(theme, f, rule.field) || '';
        val = formatFilterValue(theme, rule.field, val);
        if (!val.toLowerCase().includes(rule.value)) return false;
      }
    }
    return true;
  });

  matchedFeatures.forEach(function(f) { visibleFids.add(f.properties._tempId); });

  // Busca (filtro) tem prioridade sobre o limite de densidade de renderização
  // — ver loadAllFeaturesToMap(). Isso garante que o resultado sempre apareça
  // no mapa, mesmo que a camada esteja "capada" por excesso de feições na
  // área visível atual.
  theme._activeFilterFids = visibleFids;
  loadAllFeaturesToMap();

  // Re-renderiza a lista com apenas os resultados filtrados
  var PAGE = 100;
  var html = '';
  for (var i = 0; i < Math.min(PAGE, matchedFeatures.length); i++) {
    html += _buildFeatureItemHtml(theme, matchedFeatures[i]);
  }
  if (matchedFeatures.length === 0) {
    html = '<div class="px-4 py-3 text-xs text-slate-400 italic">Nenhum resultado encontrado.</div>';
  } else if (matchedFeatures.length > PAGE) {
    html += '<div class="px-3 py-2 text-[10px] text-slate-500 border-t border-white/5">'
      + matchedFeatures.length + ' resultados — exibindo os primeiros ' + PAGE + '. Refine o filtro para ver mais.'
      + '</div>';
  }
  listContainer.innerHTML = html;

  // loadAllFeaturesToMap() já desenhou exatamente os resultados casados
  // (via theme._activeFilterFids) — só falta calcular os limites pra dar
  // fitBounds, de forma diferida pra não bloquear a UI.
  setTimeout(function() {
    var bounds = L.latLngBounds();
    var hasVisibleFeatures = false;

    if (geojsonLayer) {
      geojsonLayer.eachLayer(function(layer) {
        if (layer.feature && layer.feature.properties.themeId === themeId) {
          if (layer.getBounds) bounds.extend(layer.getBounds());
          else if (layer.getLatLng) bounds.extend(layer.getLatLng());
          hasVisibleFeatures = true;
        }
      });

      if (hasVisibleFeatures && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 21 });
      }
    }

    // Atualizar dinamicamente os valores de outros dropdowns de filtro (cascata)
    if (!isRefreshingDropdowns) {
      isRefreshingDropdowns = true;
      try { refreshFilterDropdownOptions(themeId); }
      finally { isRefreshingDropdowns = false; }
    }
  }, 0);
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
        const valueInput = currentRow.querySelector('.filter-value');
        if (!fieldSelect || !valueInput) return;

        const currentFieldId = fieldSelect.value;
        if (currentFieldId === 'ALL') return; // "Qualquer Campo" não tem lista de valores fixa

        // Campo de texto com datalist (autocomplete) — atualiza as sugestões
        const datalistId = valueInput.getAttribute('list');
        const datalistEl = datalistId ? document.getElementById(datalistId) : null;
        if (!datalistEl) return;

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
        datalistEl.innerHTML = sortedValues.map(v => `<option value="${String(v).replace(/"/g, '&quot;')}"></option>`).join('');
        // Texto livre: não força reset do que o usuário digitou — só atualiza
        // as sugestões disponíveis dado o estado atual dos outros filtros.
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
  const drawer = document.getElementById('side-drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (drawer) drawer.classList.add('-translate-x-[120%]');
  if (overlay) overlay.classList.add('hidden');

  const modal = document.getElementById('new-theme-modal');
  if (modal) modal.classList.remove('hidden');
  const nameInput = document.getElementById('theme-name-input');
  if (nameInput) {
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 50);
  }
}

function closeNewThemeModal() {
  const modal = document.getElementById('new-theme-modal');
  if (modal) modal.classList.add('hidden');
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
              tipo_cadastro: formId || 'padrao',
              municipio_id: activeMunicipioId
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

window.openRemapAttributesModal = function(specificThemeId = null) {
    const themeId = specificThemeId || themeBeingEdited;
    const theme = themes.find(t => t.id === themeId);
    if (!theme) {
        alert("Camada não encontrada.");
        return;
    }

    // 1. Preenche dados do tema
    const nameInput = document.getElementById('remap-theme-name');
    if (nameInput) nameInput.value = theme.name || '';

    const geomBadge = document.getElementById('remap-geom-type');
    if (geomBadge) {
        const geomType = theme.features?.[0]?.geometry?.type || theme.geometryType || 'Polygon';
        const typeLabels = { 'Point': 'Ponto', 'LineString': 'Linha', 'Polygon': 'Polígono', 'MultiPolygon': 'Polígono', 'MultiLineString': 'Linha', 'MultiPoint': 'Ponto' };
        geomBadge.textContent = `Tipo Detectado: ${typeLabels[geomType] || geomType}`;
    }

    // 2. Preenche o select de Template (Cadastro)
    const cadastroSelect = document.getElementById('remap-cadastro-type');
    if (cadastroSelect && typeof allForms !== 'undefined') {
        let options = `<option value="">Padrão Genérico</option>`;
        allForms.forEach(f => {
            const isSel = (f.id === (theme.formId || theme.cadastroType));
            options += `<option value="${f.id}" ${isSel ? 'selected' : ''}>${f.title || f.name || f.id}</option>`;
        });
        cadastroSelect.innerHTML = options;
    }

    // 3. Renderiza a lista de campos com o mesmo estilo do Importar GeoJSON
    window.renderRemapFieldMapping(theme);
    document.getElementById('remap-attributes-modal').classList.remove('hidden');
};

window.onRemapTemplateChanged = function() {
    const themeId = themeBeingEdited;
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;
    window.renderRemapFieldMapping(theme);
};

window.renderRemapFieldMapping = function(theme) {
    const container = document.getElementById('remap-fields-container');
    if (!container) return;
    container.innerHTML = '';

    const selectedFormId = document.getElementById('remap-cadastro-type')?.value;
    const features = theme.features || [];
    const availablePropKeys = new Set();
    const sampleValuesMap = {};

    features.forEach(f => {
        if (f.properties) {
            Object.entries(f.properties).forEach(([k, v]) => {
                if (k && !k.startsWith('_') && typeof v !== 'object') {
                    availablePropKeys.add(k);
                    if (v !== undefined && v !== null && String(v).trim() !== '' && !sampleValuesMap[k]) {
                        sampleValuesMap[k] = String(v).trim();
                    }
                }
            });
        }
    });

    const sortedPropKeys = Array.from(availablePropKeys).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

    const countEl = document.getElementById('remap-features-count');
    if (countEl) {
        countEl.textContent = `${features.length.toLocaleString('pt-BR')} feições encontradas nesta camada.`;
    }

    let formSchema = null;
    if (selectedFormId && typeof allForms !== 'undefined') {
        const form = allForms.find(f => f.id === selectedFormId);
        if (form) formSchema = form.schema || form.tabs;
    }

    const savedMappings = theme.attributeMappings || {};
    let htmlContent = '';

    if (formSchema && Array.isArray(formSchema)) {
        formSchema.forEach(tab => {
            if (tab.fields && Array.isArray(tab.fields) && tab.fields.length > 0) {
                // Título da Aba centralizado estilo Importar GeoJSON
                htmlContent += `<div class="font-bold text-center text-xs text-slate-700 dark:text-slate-300 mt-4 mb-2 uppercase tracking-wider bg-slate-100 dark:bg-slate-800/80 py-2 rounded-lg border border-slate-200 dark:border-slate-700/80 shadow-2xs">${tab.title || 'Aba'}</div>`;

                tab.fields.forEach(field => {
                    if (['photo', 'attachment', 'drawing_layer'].includes(field.type)) return;

                    const fieldLabelNorm = (field.label || field.id).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const fieldIdNorm = field.id.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

                    let matchedKey = savedMappings[field.id] || savedMappings[field.label] || '';
                    if (!matchedKey || !availablePropKeys.has(matchedKey)) {
                        for (const pKey of sortedPropKeys) {
                            const pNorm = pKey.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                            if (pNorm === fieldLabelNorm || pNorm === fieldIdNorm) {
                                matchedKey = pKey;
                                break;
                            }
                        }
                        if (!matchedKey) {
                            for (const pKey of sortedPropKeys) {
                                const pNorm = pKey.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                                if (pNorm.includes(fieldLabelNorm) || fieldLabelNorm.includes(pNorm) || pNorm.includes(fieldIdNorm)) {
                                    matchedKey = pKey;
                                    break;
                                }
                            }
                        }
                    }

                    const currentSample = sampleValuesMap[field.id] || sampleValuesMap[field.label] || sampleValuesMap[field.label?.toUpperCase()] || '';
                    const isCurrentlyEmpty = (!currentSample || currentSample === '---');
                    const shouldBeCheckedInitially = isCurrentlyEmpty && !!matchedKey;

                    let options = `<option value="">-- Não mapeado --</option>`;
                    sortedPropKeys.forEach(prop => {
                        const isSelected = (matchedKey === prop) ? 'selected' : '';
                        const sampleVal = sampleValuesMap[prop] ? ` (ex: "${sampleValuesMap[prop].substring(0, 20)}")` : '';
                        options += `<option value="${prop}" ${isSelected}>${prop}${sampleVal}</option>`;
                    });

                    htmlContent += `
                        <div class="flex items-center gap-2 mb-2 p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors" data-remap-field-id="${field.id}" data-remap-field-label="${field.label}">
                            <input type="checkbox" class="remap-active-check shrink-0 cursor-pointer" ${shouldBeCheckedInitially ? 'checked' : ''} onchange="window.updateRemapSelectedCount()">
                            <span class="w-1/3 text-xs text-slate-700 dark:text-slate-300 font-semibold truncate" title="${field.label}">${field.label}</span>
                            <span class="material-symbols-outlined text-slate-400 text-sm shrink-0">arrow_forward</span>
                            <select onchange="this.parentElement.querySelector('.remap-active-check').checked = (this.value !== '')" class="remap-source-select flex-1 px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary dark:text-white truncate">
                                ${options}
                            </select>
                        </div>
                    `;
                });
            }
        });
    }

    if (!htmlContent) {
        htmlContent = `<div class="p-4 text-center text-xs text-slate-400 italic">Nenhum campo disponível neste formulário.</div>`;
    }

    container.innerHTML = htmlContent;
    window.updateRemapSelectedCount();
};

window.selectAllRemapRows = function(check) {
    const container = document.getElementById('remap-fields-container');
    if (!container) return;
    const checks = container.querySelectorAll('.remap-active-check');
    checks.forEach(cb => cb.checked = check);
    window.updateRemapSelectedCount();
};

window.updateRemapSelectedCount = function() {};

window.closeRemapAttributesModal = function() {
    const modal = document.getElementById('remap-attributes-modal');
    if (modal) modal.classList.add('hidden');
};

window.applyRemapAttributes = async function() {
    const themeId = themeBeingEdited;
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;

    const newName = document.getElementById('remap-theme-name')?.value?.trim();
    if (newName) theme.name = newName;

    const newFormId = document.getElementById('remap-cadastro-type')?.value;
    if (newFormId !== undefined) {
        theme.formId = newFormId;
        theme.cadastroType = newFormId;
    }

    const container = document.getElementById('remap-fields-container');
    if (!container) return;

    const rowEls = container.querySelectorAll('[data-remap-field-id]');
    const mappings = [];

    if (!theme.attributeMappings) theme.attributeMappings = {};

    rowEls.forEach(el => {
        const isActive = el.querySelector('.remap-active-check')?.checked;
        const fieldId = el.getAttribute('data-remap-field-id');
        const fieldLabel = el.getAttribute('data-remap-field-label');
        const sourceProp = el.querySelector('.remap-source-select')?.value;

        // Se o checkbox estiver ativo OU o usuário escolheu uma coluna válida
        if ((isActive || sourceProp) && sourceProp && sourceProp !== "") {
            mappings.push({ fieldId, fieldLabel, sourceProp });
            theme.attributeMappings[fieldId] = sourceProp;
            theme.attributeMappings[fieldLabel] = sourceProp;
        }
    });

    if (mappings.length === 0) {
        alert("Nenhuma coluna de origem foi selecionada para atualizar. Selecione a coluna correspondente no seletor.");
        return;
    }

    const btnApply = document.getElementById('btn-apply-remap');
    const originalText = btnApply ? btnApply.innerHTML : '';
    if (btnApply) {
        btnApply.innerHTML = '<span class="material-symbols-outlined text-[15px] animate-spin">refresh</span> Atualizando atributos...';
        btnApply.disabled = true;
    }

    try {
        const features = theme.features || [];
        let updatedCount = 0;
        const updatedDbPayloads = [];

        features.forEach(f => {
            if (!f.properties) f.properties = {};
            let changed = false;

            mappings.forEach(m => {
                const rawVal = f.properties[m.sourceProp];
                if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
                    // Grava em todas as formas de chave para garantia 100% de leitura no formulário
                    f.properties[m.fieldId] = rawVal;
                    if (m.fieldLabel) {
                        f.properties[m.fieldLabel] = rawVal;
                        f.properties[m.fieldLabel.toUpperCase()] = rawVal;
                        f.properties[m.fieldLabel.toLowerCase()] = rawVal;
                        const normKey = m.fieldLabel.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                        f.properties[normKey] = rawVal;
                    }
                    changed = true;
                }
            });

            if (changed) {
                updatedCount++;
                if (f.properties.id_banco) {
                    updatedDbPayloads.push({
                        id: f.properties.id_banco,
                        theme_id: theme.id,
                        propriedades: f.properties
                    });
                }
            }
        });

        // Atualização do Tema no Supabase (se mudou nome ou tipo de cadastro)
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                await supabaseClient.from('temas').update({
                    nome: theme.name,
                    tipo_cadastro: theme.formId || 'padrao'
                }).eq('id', theme.id);
            } catch(eTheme) {
                console.warn("Erro ao atualizar tema:", eTheme);
            }
        }

        // Atualização em lotes no Supabase resiliente com chunkSize reduzido e retry adaptativo
        if (typeof supabaseClient !== 'undefined' && supabaseClient && updatedDbPayloads.length > 0) {
            const chunkSize = 100;
            const totalChunks = Math.ceil(updatedDbPayloads.length / chunkSize);

            async function upsertBatchWithRetry(items, maxRetries = 3) {
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        const { error: upErr } = await supabaseClient.from('feicoes').upsert(items, { onConflict: 'id' });
                        if (!upErr) return true;
                        
                        console.warn(`Tentativa ${attempt} falhou no lote (${items.length} itens):`, upErr);
                        if (attempt === maxRetries || items.length <= 10) {
                            if (items.length > 10) {
                                const mid = Math.floor(items.length / 2);
                                await upsertBatchWithRetry(items.slice(0, mid));
                                await upsertBatchWithRetry(items.slice(mid));
                                return true;
                            }
                            throw upErr;
                        }
                    } catch(e) {
                        if (attempt === maxRetries && items.length <= 10) throw e;
                    }
                    await new Promise(r => setTimeout(r, 150 * attempt));
                }
            }

            for (let i = 0; i < updatedDbPayloads.length; i += chunkSize) {
                const currentChunkIndex = Math.floor(i / chunkSize) + 1;
                if (btnApply) {
                    btnApply.innerHTML = `<span class="material-symbols-outlined text-[15px] animate-spin">refresh</span> Salvando no banco (${currentChunkIndex}/${totalChunks})...`;
                }
                const chunk = updatedDbPayloads.slice(i, i + chunkSize);
                try {
                    await upsertBatchWithRetry(chunk);
                } catch(errChunk) {
                    console.warn(`Lote ${currentChunkIndex} teve erro parcial:`, errChunk);
                }
                await new Promise(r => setTimeout(r, 30));
            }
        }

        // Atualiza no cache IndexedDB
        if (typeof GeoEngineTurbo !== 'undefined' && GeoEngineTurbo.saveFeatures) {
            try {
                await GeoEngineTurbo.saveFeatures(theme.id, features);
            } catch(eCache) {}
        }

        saveThemes();
        renderThemes();
        
        // Se houver feição ativa selecionada no mapa, atualiza suas propriedades em tempo real
        if (activeFeatureLayer && activeFeatureLayer.feature && activeFeatureLayer.feature.properties) {
            const activeId = activeFeatureLayer.feature.properties.id_banco || activeFeatureLayer.feature.properties.id;
            const updatedFeat = features.find(f => (f.properties?.id_banco && f.properties.id_banco === activeId) || f.properties?.id === activeId);
            if (updatedFeat && updatedFeat.properties) {
                Object.assign(activeFeatureLayer.feature.properties, updatedFeat.properties);
            }
            renderFeatureInfo();
        }

        // Registra log de auditoria da reconexão
        if (window.auditLogger && typeof window.auditLogger.log === 'function') {
            window.auditLogger.log('RECONECTAR_ATRIBUTOS', `Camada: ${theme.name}`, {
                totalFeicoes: updatedCount,
                mapeamentosSalvos: mappings.map(m => `${m.fieldLabel || m.fieldId} ➔ ${m.sourceProp}`)
            });
        }

        alert(`✓ Sucesso! Atributos reconectados e atualizados em ${updatedCount.toLocaleString('pt-BR')} feições!`);
        closeRemapAttributesModal();

    } catch(err) {
        console.error("Erro ao aplicar remapeamento de atributos:", err);
        alert("Erro ao aplicar remapeamento: " + (err.message || err));
    } finally {
        if (btnApply) {
            btnApply.innerHTML = originalText;
            btnApply.disabled = false;
        }
    }
};

function showLoadingOverlay(message) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  const text = document.getElementById('loading-overlay-text');
  if (text) text.textContent = message || 'Processando...';
  overlay.classList.remove('hidden');
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}

async function deleteTheme(themeId) {
  if (!confirm("Tem certeza que deseja excluir esta camada e todos os seus dados?")) return;

  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      showLoadingOverlay('Excluindo camada...');
      try {
          // Exclui em lotes DENTRO do banco (RPC) — enviar uma lista de
          // milhares de IDs pelo .in() vira uma URL enorme e estoura o
          // limite de tamanho de requisição do servidor. Com a função,
          // o navegador só manda theme_id + tamanho do lote, sempre curto.
          let deletedInBatch = 0;
          let totalDeleted = 0;
          do {
              const { data, error: delErr } = await supabaseClient.rpc('delete_feicoes_batch', {
                  p_theme_id: themeId,
                  p_batch_size: 2000
              });

              if (delErr) {
                  alert('Erro ao excluir feições da camada: ' + delErr.message);
                  console.error("Erro ao excluir lote de feições:", delErr);
                  return;
              }
              deletedInBatch = data || 0;
              totalDeleted += deletedInBatch;
              if (deletedInBatch > 0) {
                  showLoadingOverlay(`Excluindo camada... (${totalDeleted} feições removidas)`);
              }
          } while (deletedInBatch > 0);

          // Delete theme
          const { error } = await supabaseClient.from('temas').delete().eq('id', themeId);
          if (error) {
              alert('As feições foram excluídas, mas não foi possível excluir a camada em si: ' + error.message);
              console.error("Erro ao deletar tema no Supabase:", error);
              return;
          }
      } catch(e) {
          alert('Erro ao excluir a camada: ' + e.message);
          console.error("Erro ao deletar tema no Supabase:", e);
          return;
      } finally {
          hideLoadingOverlay();
      }
  }

  // Só mexe no estado local depois de confirmar que a exclusão no banco deu certo
  // — antes, o card sumia da tela mesmo quando a exclusão falhava, e voltava
  // ao atualizar a página.
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
let pending1nCsvData = {}; // { [tabId]: { tab, csvRows, csvCols, joinKeyGeoJSON, joinKeyCSV, colMapping } }

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
  pending1nCsvData = {};
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
    const selectElements = document.querySelectorAll('.property-rename-select-inverse');
    selectElements.forEach(select => {
        const targetFieldId = select.getAttribute('data-target-field-id');
        const originalProp = select.value;
        if (!originalProp) return;
        
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
                    
                    let mappingOptionsHtml = `<option value="${val}" ${!bestMatchOption ? 'selected' : ''}>-- Manter original (${val}) --</option>`;
                    mappingOptionsHtml += `<option value="">-- Deixar em branco --</option>`;
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
  
  let formSchema = null;
  if (selectedFormId && typeof allForms !== 'undefined') {
    const form = allForms.find(f => f.id === selectedFormId);
    if (form) {
       formSchema = form.schema || form.tabs;
       if (formSchema) {
           formSchema.forEach(tab => {
               if (tab.fields) {
                   formFields.push(...tab.fields);
               }
           });
       }
    }
  }

  const normalizeStr = (s) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "") : "";

  let htmlContent = '';
  const mappedProperties = new Set();
  const unmappedRows = [];



  // 1. Mapeamento guiado pelo Formulário (Template)
  if (formSchema && formFields.length > 0) {
      formSchema.forEach(tab => {
          if (tab.fields && tab.fields.length > 0) {

              // ----- ABA 1:N: mostra CSV upload inline -----
              if (tab.isMultiple) {
                  const geoPropsOpts = detectedProperties.map(p => `<option value="${p}">${p}</option>`).join('');
                  htmlContent += `
                  <div class="mt-4 mb-2 rounded-lg border border-blue-200 dark:border-blue-800 overflow-hidden">
                    <div class="flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-900/20">
                      <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-[16px] text-blue-500">table_view</span>
                        <span class="font-bold text-sm text-blue-700 dark:text-blue-300 uppercase tracking-wide">${tab.title || 'Aba'}</span>
                        <span class="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold">1:N</span>
                      </div>
                      <label class="flex items-center gap-1 cursor-pointer px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs font-semibold transition-colors">
                        <span class="material-symbols-outlined text-[14px]">upload_file</span>
                        Carregar CSV
                        <input type="file" accept=".csv" class="hidden" onchange="handle1nCsvUpload('${tab.id}', this.files[0])">
                      </label>
                    </div>
                    <div id="1n-config-${tab.id}" class="hidden px-3 py-3 space-y-3 bg-white dark:bg-slate-900">
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Chave no GeoJSON</label>
                          <select id="geokey-${tab.id}" onchange="update1nPreview('${tab.id}')" class="w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-primary dark:text-white">
                            <option value="">-- Selecione --</option>
                            ${geoPropsOpts}
                          </select>
                        </div>
                        <div>
                          <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Coluna no CSV</label>
                          <select id="csvkey-${tab.id}" onchange="update1nPreview('${tab.id}')" class="w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-primary dark:text-white">
                            <option value="">-- Selecione --</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Campos da Aba → Coluna do CSV</div>
                        <div id="1n-col-mapping-${tab.id}" class="flex flex-col gap-1.5"></div>
                      </div>
                      <div id="1n-preview-${tab.id}" class="hidden text-xs font-medium px-3 py-2 rounded-md"></div>
                    </div>
                  </div>`;
                  return; // Não renderiza dropdowns de GeoJSON para abas 1:N
              }

              // ----- ABA 1:1 normal -----
              htmlContent += `<div class="font-bold text-center text-sm text-slate-700 dark:text-slate-300 mt-4 mb-2 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/50 py-1.5 rounded border border-slate-100 dark:border-slate-800">${tab.title || 'Aba'}</div>`;
              
              tab.fields.forEach(f => {
                  const subFields = [];
                  if (f.type === 'cep') {
                      subFields.push({ idSuffix: '__cep', labelSuffix: ' (CEP)', matchKey: 'cep' });
                      subFields.push({ idSuffix: '__logradouro', labelSuffix: ' (Logradouro)', matchKey: 'logradouro' });
                      subFields.push({ idSuffix: '__numero', labelSuffix: ' (Número)', matchKey: 'numero' });
                      subFields.push({ idSuffix: '__complemento', labelSuffix: ' (Complemento)', matchKey: 'complemento' });
                      subFields.push({ idSuffix: '__bairro', labelSuffix: ' (Bairro)', matchKey: 'bairro' });
                      subFields.push({ idSuffix: '__cidade', labelSuffix: ' (Cidade)', matchKey: 'cidade' });
                      subFields.push({ idSuffix: '__uf', labelSuffix: ' (UF)', matchKey: 'uf' });
                  } else {
                      subFields.push({ idSuffix: '', labelSuffix: '', matchKey: normalizeStr(f.label) });
                  }
                  
                  subFields.forEach(sub => {
                      const fullId = f.id + sub.idSuffix;
                      const fullLabel = f.label + sub.labelSuffix;
                      const normName = normalizeStr(f.name);
                      
                      let matchedProp = null;
                      
                      // Auto-match
                      for (let i = 0; i < detectedProperties.length; i++) {
                          const prop = detectedProperties[i];
                          if (mappedProperties.has(prop)) continue;
                          
                          const normProp = normalizeStr(prop);
                          if (sub.matchKey === normProp || (sub.idSuffix === '' && normName === normProp) || (normProp.length > 3 && (sub.matchKey.includes(normProp) || normProp.includes(sub.matchKey)))) {
                              matchedProp = prop;
                              mappedProperties.add(prop);
                              break;
                          }
                      }
                      
                      let options = `<option value="">-- Não mapeado --</option>`;
                      detectedProperties.forEach(prop => {
                          const isSelected = (matchedProp === prop) ? 'selected' : '';
                          options += `<option value="${prop}" ${isSelected}>${prop}</option>`;
                      });
                      
                      const mappingControl = `<select data-target-field-id="${fullId}" onchange="updateValueMappings()" class="flex-1 px-2 py-1 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-primary dark:text-white property-rename-select-inverse">${options}</select>`;
                      
                      let indent = sub.idSuffix ? 'ml-4 border-l-2 border-slate-200 dark:border-slate-700 pl-2' : '';
                      
                      htmlContent += `
                        <div class="flex items-center gap-2 mb-2 ${indent}">
                          <span class="w-1/3 text-sm text-slate-600 dark:text-slate-400 font-medium truncate" title="${fullLabel}">${fullLabel}</span>
                          <span class="material-symbols-outlined text-slate-400 text-sm">arrow_forward</span>
                          ${mappingControl}
                        </div>
                      `;
                  });
              });
          }
      });
  }

  // 2. Campos Adicionais (Não mapeados)
  detectedProperties.forEach(prop => {
      if (!mappedProperties.has(prop)) {
          let mappingControl;
          if (formFields.length > 0) {
              mappingControl = `<span class="flex-1 text-sm text-slate-500 italic">-- Manter Original --</span><input type="hidden" class="property-rename-input" data-original="${prop}" value="${prop}">`;
          } else {
              mappingControl = `<input type="text" list="standard-fields-list" data-original="${prop}" value="${prop}" class="flex-1 px-2 py-1 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-primary dark:text-white property-rename-input">`;
          }
          
          unmappedRows.push(`
            <div class="flex items-center gap-2 mb-2">
              <input type="checkbox" checked class="property-import-checkbox w-4 h-4 text-primary rounded border-slate-300 dark:border-slate-700 focus:ring-primary" data-original="${prop}">
              <span class="w-1/3 text-sm text-slate-600 dark:text-slate-400 font-mono truncate" title="${prop}">${prop}</span>
              <span class="material-symbols-outlined text-slate-400 text-sm">arrow_forward</span>
              ${mappingControl}
            </div>
          `);
      }
  });

  if (unmappedRows.length > 0) {
      htmlContent += `<div class="font-bold text-center text-sm text-slate-700 dark:text-slate-300 mt-4 mb-2 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/50 py-1.5 rounded border border-slate-100 dark:border-slate-800">Campos Adicionais / Não Mapeados</div>`;
      htmlContent += unmappedRows.join('');
  }
  
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

  // Oculta a seção 1:N separada (agora está inline)
  const section1nContainer = document.getElementById('import-1n-section');
  if (section1nContainer) section1nContainer.classList.add('hidden');
}

// --- FUNÇÕES AUXILIARES 1:N IMPORT ---

window.handle1nCsvUpload = function(tabId, file) {
    if (!file) return;

    // Mostra feedback imediato antes do processamento pesado
    const configEl = document.getElementById(`1n-config-${tabId}`);
    const previewEl = document.getElementById(`1n-preview-${tabId}`);
    if (configEl) configEl.classList.remove('hidden');
    if (previewEl) {
        previewEl.className = 'text-xs font-medium px-3 py-2 rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
        previewEl.textContent = '\u23f3 Lendo arquivo...';
        previewEl.classList.remove('hidden');
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;

        // Adia o processamento pesado para n\u00e3o bloquear a UI
        setTimeout(() => {
            // Auto-detecta separador (v\u00edrgula ou ponto-e-v\u00edrgula)
            const firstLine = text.substring(0, text.indexOf('\n') || 500);
            const sep = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
            const lines = text.split('\n').filter(l => l.trim());
            if (lines.length < 2) { alert('CSV vazio ou sem dados.'); return; }

            const cols = lines[0].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
            const rows = lines.slice(1).map(line => {
                const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
                const obj = {};
                cols.forEach((col, i) => { obj[col] = vals[i] || ''; });
                return obj;
            });

            pending1nCsvData[tabId] = { csvRows: rows, csvCols: cols, joinKeyCSV: '', joinKeyGeoJSON: '', colMapping: {} };

            // Atualiza o select de chave do CSV com as colunas encontradas
            const csvKeySelect = document.getElementById(`csvkey-${tabId}`);
            if (csvKeySelect) {
                csvKeySelect.innerHTML = '<option value="">-- Selecione --</option>' + cols.map(c => `<option value="${c}">${c}</option>`).join('');

                // Tenta auto-selecionar a chave geo tamb\u00e9m
                const geoKeySelect = document.getElementById(`geokey-${tabId}`);
                const normCols = cols.map(c => c.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''));
                if (geoKeySelect) {
                    const geoProps = Array.from(geoKeySelect.options).slice(1).map(o => o.value);
                    for (const gp of geoProps) {
                        const normGp = gp.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
                        const matchIdx = normCols.findIndex(nc => nc === normGp || nc.includes(normGp) || normGp.includes(nc));
                        if (matchIdx >= 0) {
                            geoKeySelect.value = gp;
                            csvKeySelect.value = cols[matchIdx];
                            break;
                        }
                    }
                }
            }

            // Renderiza mapeamento de colunas e dispara preview (j\u00e1 com debounce)
            render1nColumnMapping(tabId, cols);
            update1nPreview(tabId);
        }, 0);
    };
    reader.readAsText(file);
};

function render1nColumnMapping(tabId, csvCols) {
    const form = allForms && document.getElementById('global-import-cadastro-type')
        ? allForms.find(f => f.id === document.getElementById('global-import-cadastro-type').value)
        : null;
    if (!form) return;
    const schema = form.schema || form.tabs;
    if (!schema) return;
    const tab = schema.find(t => t.id === tabId);
    if (!tab || !tab.fields) return;

    const container = document.getElementById(`1n-col-mapping-${tabId}`);
    if (!container) return;

    const normStr = s => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'') : '';

    container.innerHTML = tab.fields.map(field => {
        // Tenta auto-match
        let bestMatch = '';
        for (const col of csvCols) {
            const nc = normStr(col);
            const nl = normStr(field.label);
            const ni = normStr(field.id);
            if (nc === nl || nc === ni || (nc.length > 3 && (nc.includes(nl) || nl.includes(nc)))) {
                bestMatch = col;
                break;
            }
        }

        const opts = `<option value="">-- Não mapear --</option>` +
            csvCols.map(c => `<option value="${c}" ${c === bestMatch ? 'selected' : ''}>${c}</option>`).join('');

        return `
        <div class="flex items-center gap-2">
          <span class="w-2/5 text-xs text-slate-600 dark:text-slate-400 font-medium truncate" title="${field.label}">${field.label}</span>
          <span class="material-symbols-outlined text-slate-400 text-[14px]">arrow_forward</span>
          <select data-field-id="${field.id}" data-tab-id="${tabId}"
            class="flex-1 px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-primary dark:text-white import-1n-col-map">
            ${opts}
          </select>
        </div>`;
    }).join('');
}

// Debounce timer para o preview 1:N
const _preview1nTimers = {};

window.update1nPreview = function(tabId) {
    const data = pending1nCsvData[tabId];
    if (!data || !data.csvRows.length) return;

    // Salva as chaves imediatamente (sem delay)
    const geoKey = document.getElementById(`geokey-${tabId}`)?.value || '';
    const csvKey = document.getElementById(`csvkey-${tabId}`)?.value || '';
    data.joinKeyGeoJSON = geoKey;
    data.joinKeyCSV = csvKey;

    const previewEl = document.getElementById(`1n-preview-${tabId}`);
    if (!previewEl) return;

    if (!geoKey || !csvKey) {
        previewEl.className = 'text-xs font-medium px-3 py-2 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400';
        previewEl.textContent = '⚠ Selecione as chaves de junção para ver o preview.';
        previewEl.classList.remove('hidden');
        return;
    }

    // Mostra "calculando..." imediatamente, sem travar a UI
    previewEl.className = 'text-xs font-medium px-3 py-2 rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
    previewEl.textContent = '⏳ Calculando cobertura...';
    previewEl.classList.remove('hidden');

    // Debounce: cancela timer anterior e agenda novo após 400ms
    clearTimeout(_preview1nTimers[tabId]);
    _preview1nTimers[tabId] = setTimeout(() => {
        // Executa fora da thread principal via setTimeout 0 para não bloquear cliques
        setTimeout(() => {
            const features = pendingGlobalGeoJSON ? pendingGlobalGeoJSON.features : [];
            const totalFeatures = features.length;
            const totalRows = data.csvRows.length;

            // Pre-build Set com os valores do CSV: O(m) uma vez, lookup O(1) por feição
            const csvKeySet = new Set(
                data.csvRows.map(row => String(row[csvKey] || '').trim()).filter(Boolean)
            );

            let coveredFeatures = 0;
            for (let i = 0; i < features.length; i++) {
                const fKey = String((features[i].properties || {})[geoKey] || '').trim();
                if (fKey && csvKeySet.has(fKey)) coveredFeatures++;
            }

            if (coveredFeatures === 0) {
                previewEl.className = 'text-xs font-medium px-3 py-2 rounded-md bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400';
                previewEl.innerHTML = `❌ Nenhuma correspondência encontrada. Verifique as chaves selecionadas.`;
            } else {
                previewEl.className = 'text-xs font-medium px-3 py-2 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400';
                previewEl.innerHTML = `✅ ${totalRows} linhas no CSV · ${coveredFeatures} de ${totalFeatures} feições serão preenchidas`;
            }
        }, 0);
    }, 400);
};

// --- Loading overlay para importação ---
function showImportProgress(msg) {
    let overlay = document.getElementById('import-progress-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'import-progress-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.65);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;backdrop-filter:blur(4px)';
        overlay.innerHTML = `
          <div style="width:52px;height:52px;border:4px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite"></div>
          <div id="import-progress-msg" style="color:#fff;font-size:15px;font-weight:600;text-align:center;max-width:280px;line-height:1.5"></div>
          <div style="color:rgba(255,255,255,0.6);font-size:12px">Aguarde, não feche a página...</div>
          <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
        document.body.appendChild(overlay);
    }
    document.getElementById('import-progress-msg').textContent = msg || 'Importando...';
    overlay.style.display = 'flex';
}

function hideImportProgress() {
    const overlay = document.getElementById('import-progress-overlay');
    if (overlay) overlay.style.display = 'none';
}

function updateImportProgress(msg) {
    const el = document.getElementById('import-progress-msg');
    if (el) el.textContent = msg;
}

async function confirmGlobalImport() {
  if (!pendingGlobalGeoJSON) return;

  // Feedback imediato — aparece antes de qualquer processamento pesado
  showImportProgress('Preparando importação...');
  // Deixa o browser renderizar o overlay antes de bloquear a thread
  await new Promise(r => setTimeout(r, 30));

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
              tipo_cadastro: formId || 'padrao',
              municipio_id: activeMunicipioId
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

  document.querySelectorAll('.property-rename-select-inverse').forEach(select => {
    const targetFieldId = select.getAttribute('data-target-field-id');
    const geojsonProp = select.value;
    if (geojsonProp) {
        mapping[geojsonProp] = targetFieldId;
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

    // --- Processar dados 1:N de CSVs vinculados ---
    Object.keys(pending1nCsvData).forEach(tabId => {
        const csvData = pending1nCsvData[tabId];
        if (!csvData || !csvData.csvRows.length || !csvData.joinKeyGeoJSON || !csvData.joinKeyCSV) return;

        const featureKey = String(newProps[csvData.joinKeyGeoJSON] || f.properties[csvData.joinKeyGeoJSON] || '').trim();
        if (!featureKey) return;

        // Lê o mapeamento manual de colunas dos selects no DOM
        const colMapping = {};
        document.querySelectorAll(`.import-1n-col-map[data-tab-id="${tabId}"]`).forEach(sel => {
            if (sel.value) colMapping[sel.getAttribute('data-field-id')] = sel.value;
        });

        // Filtra as linhas do CSV que correspondem a esta feição
        const matchingRows = csvData.csvRows.filter(row =>
            String(row[csvData.joinKeyCSV] || '').trim() === featureKey
        );

        if (matchingRows.length > 0) {
            const records = matchingRows.map(row => {
                const record = { _created_at: new Date().toISOString() };
                // Aplica o mapeamento manual/automático de colunas
                Object.entries(colMapping).forEach(([fieldId, csvCol]) => {
                    if (row[csvCol] !== undefined) {
                        record[fieldId] = row[csvCol];
                    }
                });
                return record;
            });
            // Armazena no formato que renderMultipleTab() já entende
            newProps[tabId] = JSON.stringify(records);
        }
    });
    
    f.properties = newProps;
  });
  
  if (!themeName) themeName = "Tema Importado";
  themes.push({ id: themeId, name: themeName, color: themeColor, formId: formId, cadastroType: formId, disp1Active: false, disp2Active: false, features: [] });

  updateImportProgress(`Renderizando ${pendingGlobalGeoJSON.features.length.toLocaleString('pt-BR')} feições no mapa...`);
  await new Promise(r => setTimeout(r, 20));
  
  const newLayer = L.geoJSON(pendingGlobalGeoJSON);
  geojsonLayer.addData(pendingGlobalGeoJSON);
  
  closeGlobalImportModal();
  document.getElementById('side-drawer').classList.add('-translate-x-[120%]');
  document.getElementById('drawer-overlay').classList.add('hidden');
  
  const bounds = newLayer.getBounds();
  if (bounds.isValid()) {
      map.fitBounds(bounds);
  }

  updateImportProgress('Sincronizando com o banco de dados...');
  await syncMapDataToThemes();
  hideImportProgress();
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

  // Esconde editar/excluir se o usuário não tem permissão nesta camada
  // (o RLS/gatilho no banco já recusaria — isto é só pra não oferecer um
  // botão que vai falhar).
  const themeId = layer.feature && layer.feature.properties && layer.feature.properties.themeId;
  const deleteBtn = document.getElementById('btn-delete-feature');
  if (deleteBtn) {
      const canDelete = typeof userCanOnTheme !== 'function' || userCanOnTheme(themeId, 'excluir');
      deleteBtn.style.display = canDelete ? '' : 'none';
  }
  const editBtn = document.getElementById('btn-edit-feature-geometry');
  if (editBtn) {
      const canEdit = typeof userCanOnTheme !== 'function' || userCanOnTheme(themeId, 'editar');
      editBtn.style.display = canEdit ? '' : 'none';
  }
  
  // Força o card a receber cliques (bypass de cache do HTML/Tailwind)
  const card = document.getElementById('feature-info-card');
  if (card) {
      card.style.pointerEvents = 'auto';
  }

  // Fecha e desativa o toolbar de ajuste de geometria se estiver visível
  const geomEditToolbar = document.getElementById('geometry-edit-toolbar');
  if (geomEditToolbar) {
      geomEditToolbar.classList.add('hidden');
      geomEditToolbar.classList.remove('flex');
  }
  // Sincronização em tempo real com o banco (se outro usuário editou a feição)
  const bankId = layer.feature && layer.feature.properties && layer.feature.properties.id_banco;
  if (bankId && typeof supabaseClient !== 'undefined' && supabaseClient) {
      supabaseClient
          .from('feicoes')
          .select('propriedades, geometria')
          .eq('id', bankId)
          .maybeSingle()
          .then(({ data: freshRow, error }) => {
              if (!error && freshRow && freshRow.propriedades) {
                  const currentProps = layer.feature.properties || {};
                  layer.feature.properties = { ...currentProps, ...freshRow.propriedades, id_banco: bankId, themeId: themeId || currentProps.themeId };
                  if (freshRow.geometria) layer.feature.geometry = freshRow.geometria;
                  
                  if (themeId) {
                      const theme = themes.find(t => t.id === themeId);
                      if (theme && theme.features) {
                          const idx = theme.features.findIndex(f => f.properties && f.properties.id_banco === bankId);
                          if (idx !== -1) {
                              theme.features[idx].properties = { ...layer.feature.properties };
                              if (freshRow.geometria) theme.features[idx].geometry = freshRow.geometria;
                          }
                      }
                  }

                  if (activeFeatureLayer === layer) {
                      renderFeatureInfo();
                  }
              }
          }).catch(console.warn);
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
          window.renderDynamicForm(dynamicFormSchema, properties, isFeatureEditMode, 'feature-info-content', { activeTabId: window.currentActiveTabId, editTabId: window.activeFeatureEditTabId || null, formId: theme.formId });
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

  if (!activeFeatureLayer || !activeFeatureLayer.feature) {
      alert('Nenhuma feição ativa selecionada para salvar.');
      return;
  }

  if (!activeFeatureLayer.feature.properties) {
      activeFeatureLayer.feature.properties = {};
  }

  inputs.forEach(input => {
    const key = input.getAttribute('data-key');
    if (key) {
        activeFeatureLayer.feature.properties[key] = input.value;
    }
  });
  
  const photoInput = document.getElementById('feature-photos-upload');
  if (photoInput && photoInput.files.length > 0) {
      if (!activeFeatureLayer.feature.properties.photos) activeFeatureLayer.feature.properties.photos = [];
      for(let i=0; i<photoInput.files.length; i++) {
          const base64 = await toBase64(photoInput.files[i]);
          activeFeatureLayer.feature.properties.photos.push(base64);
      }
  }

  const currentProps = activeFeatureLayer.feature.properties || {};
  let idBanco = currentProps.id_banco;
  const tempId = currentProps._tempId;
  const themeId = currentProps.themeId;

  // 1. Validação de Conexão e Sessão Ativa: Redireciona para o login se a sessão tiver expirado
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
          const { data: sessCheck } = await supabaseClient.auth.getSession();
          if (!sessCheck || !sessCheck.session) {
              alert('Sua sessão expirou por inatividade ou perda de conexão.\n\nVocê será redirecionado para a tela de login para reconectar com segurança.');
              sessionStorage.removeItem('municipio_ativo');
              window.location.href = 'login.html';
              return;
          }
      } catch(eAuth) {
          window.location.href = 'login.html';
          return;
      }

      try {
          if (idBanco) {
              const { error: updErr } = await supabaseClient
                  .from('feicoes')
                  .update({
                      propriedades: currentProps,
                      geometria: activeFeatureLayer.feature.geometry
                  })
                  .eq('id', idBanco);

              if (updErr) {
                  console.error('Erro ao salvar feição no Supabase:', updErr);
                  if (updErr.message && updErr.message.includes('Sem permissão para editar')) {
                      alert('Aviso de Permissão: Seu usuário não possui autorização de edição para esta camada.\n\nPeça ao Administrador do município para liberar a permissão de edição na aba: Configurações > Usuários.');
                      return;
                  } else {
                      alert('Aviso ao salvar no servidor: ' + updErr.message);
                      return;
                  }
              } else {
                  console.log(`[Supabase] Feição "${idBanco}" salva com sucesso!`);
                  if (window.auditLogger && typeof window.auditLogger.log === 'function') {
                      window.auditLogger.log('EDITAR_FEICAO', `Imóvel/Feição #${idBanco}`, {
                          tema: theme?.name || themeId,
                          inscricao: currentProps['INSC. IMOBILIÁRIA'] || currentProps['Inscrição Imobiliária'] || currentProps['SEQUENCIAL'] || currentProps['Sequencial'] || ''
                      });
                  }
              }
          } else {
              const { data: insData, error: insErr } = await supabaseClient
                  .from('feicoes')
                  .insert({
                      theme_id: themeId,
                      propriedades: currentProps,
                      geometria: activeFeatureLayer.feature.geometry
                  })
                  .select();

              if (insErr) {
                  console.error('Erro ao inserir nova feição no Supabase:', insErr);
                  alert('Aviso ao registrar nova feição no servidor: ' + insErr.message);
                  return;
              } else if (insData && insData.length > 0) {
                  idBanco = insData[0].id;
                  activeFeatureLayer.feature.properties.id_banco = idBanco;
                  console.log(`[Supabase] Nova feição criada com ID "${idBanco}"!`);
                  if (window.auditLogger && typeof window.auditLogger.log === 'function') {
                      window.auditLogger.log('CRIAR_FEICAO', `Novo Imóvel/Feição #${idBanco}`, {
                          tema: theme?.name || themeId
                      });
                  }
              }
          }
      } catch (eDb) {
          console.error('Erro de conexão ao salvar feição:', eDb);
      }
  }

  // 2. Atualiza a feição correspondente no tema em memória
  if (themeId) {
      const theme = themes.find(t => t.id === themeId);
      if (theme && theme.features) {
          const idx = theme.features.findIndex(f => {
              if (!f) return false;
              const p = f.properties || {};
              if (idBanco && p.id_banco === idBanco) return true;
              if (tempId && p._tempId === tempId) return true;
              if (f === activeFeatureLayer.feature) return true;
              return false;
          });

          if (idx !== -1) {
              theme.features[idx].properties = { ...activeFeatureLayer.feature.properties };
              theme.features[idx].geometry = activeFeatureLayer.feature.geometry;
          } else {
              theme.features.push(activeFeatureLayer.feature);
          }

          // 3. Atualiza o índice espacial R-Tree
          if (window.GeoEngineTurbo && typeof window.GeoEngineTurbo.indexTheme === 'function') {
              window.GeoEngineTurbo.indexTheme(themeId, theme.features);
          }

          // 4. Atualiza o cache persistente do IndexedDB (GeoTurboDB) para o F5 vir 100% atualizado
          if (window.GeoTurboDB && typeof window.GeoTurboDB.saveThemeData === 'function') {
              try {
                  await window.GeoTurboDB.saveThemeData(themeId, theme.features, theme.features.length);
                  console.log(`[GeoEngineTurbo] Cache IndexedDB atualizado para o tema "${themeId}"`);
              } catch(eCache) {
                  console.warn('Falha ao atualizar cache IndexedDB:', eCache);
              }
          }

          // 5. Atualiza a lista lateral de feições se estiver visível
          const featureListEl = document.getElementById('feature-list-' + themeId);
          if (featureListEl && typeof renderFeatureListItems === 'function') {
              featureListEl.innerHTML = renderFeatureListItems(theme);
          }
      }
  }

  isFeatureEditMode = false;
  window.activeFeatureEditTabId = null;
  renderFeatureInfo();
  document.getElementById('feature-actions-container').classList.remove('hidden');

  if (typeof showWarningToast === 'function') {
      showWarningToast('✅ Dados salvos com sucesso no banco de dados!');
  }
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
      if (toolbar) {
          toolbar.classList.remove('hidden');
          toolbar.classList.add('flex');
      }

      // Para feição do tipo PONTO: ao soltar após arrastar, encerra a edição vetorial, fecha o pop-up AJUSTANDO e volta ao formulário
      const geomType = layerToEdit.feature && layerToEdit.feature.geometry && layerToEdit.feature.geometry.type;
      if (geomType === 'Point' || geomType === 'MultiPoint') {
          const onPointDragEnd = () => {
              layerToEdit.off('pm:dragend', onPointDragEnd);
              layerToEdit.off('dragend', onPointDragEnd);
              setTimeout(() => {
                  stopGeometryEditing();
              }, 50);
          };
          layerToEdit.once('pm:dragend', onPointDragEnd);
          layerToEdit.once('dragend', onPointDragEnd);
      }
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
    } else if (geomType === 'Point' || geomType === 'MultiPoint') {
        if (typeof activeFeatureLayer.getLatLng === 'function') {
            const latlng = activeFeatureLayer.getLatLng();
            activeFeatureLayer.feature.properties['Coordenadas Geográficas WGS 84'] = `Latitude: ${latlng.lat.toFixed(6)} e Longitude: ${latlng.lng.toFixed(6)}`;
        }
    }
    
    // Salva a geometria atualizada no Supabase e no IndexedDB
    const props = activeFeatureLayer.feature.properties || {};
    const idBanco = props.id_banco;
    const tempId = props._tempId;
    const themeId = props.themeId;

    if (idBanco && typeof supabaseClient !== 'undefined' && supabaseClient) {
        supabaseClient.from('feicoes').update({
            geometria: activeFeatureLayer.feature.geometry,
            propriedades: props
        }).eq('id', idBanco).then(() => {
            console.log(`[Supabase] Geometria da feição "${idBanco}" atualizada.`);
        });
    }

    if (themeId) {
        const theme = themes.find(t => t.id === themeId);
        if (theme && theme.features) {
            const featIdx = theme.features.findIndex(f => {
                const p = f.properties || {};
                if (idBanco && p.id_banco === idBanco) return true;
                if (tempId && p._tempId === tempId) return true;
                if (f === activeFeatureLayer.feature) return true;
                return false;
            });
            if (featIdx !== -1) {
                theme.features[featIdx].geometry = activeFeatureLayer.feature.geometry;
                theme.features[featIdx].properties = { ...theme.features[featIdx].properties, ...props };
            } else {
                theme.features.push(activeFeatureLayer.feature);
            }
            if (window.GeoEngineTurbo && typeof window.GeoEngineTurbo.indexTheme === 'function') {
                window.GeoEngineTurbo.indexTheme(themeId, theme.features);
            }
            if (window.GeoTurboDB && typeof window.GeoTurboDB.saveThemeData === 'function') {
                window.GeoTurboDB.saveThemeData(themeId, theme.features, theme.features.length);
            }
        }
    }
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
  if (toolbar) {
      toolbar.classList.add('hidden');
      toolbar.classList.remove('flex');
  }

  // Reabre imediatamente o card da tabela/formulário vinculado à feição editada
  if (activeFeatureLayer) {
      showFeatureInfoModal(activeFeatureLayer);
  }
}

async function deleteActiveFeature() {
  if (!activeFeatureLayer) return;

  const targetLayer = activeFeatureLayer;
  const targetFeature = targetLayer.feature || {};
  const props = targetFeature.properties || {};
  const idBanco = props.id_banco;
  const tempId = props._tempId;
  const tId = props.themeId;

  if (!confirm("Tem certeza que deseja excluir esta feição permanentemente?")) return;

  if (typeof supabaseClient !== 'undefined' && supabaseClient && idBanco) {
      try {
          // Tenta hard delete direto
          let { error: delErr } = await supabaseClient.from('feicoes').delete().eq('id', idBanco);
          if (delErr) {
              // Se houver trigger ou soft delete configurado
              const { error: updErr } = await supabaseClient.from('feicoes').update({ deletado_em: new Date().toISOString() }).eq('id', idBanco);
              if (updErr) {
                  console.error("Erro ao excluir feição:", delErr || updErr);
                  alert('Não foi possível excluir no banco de dados: ' + (delErr.message || updErr.message));
                  return;
              }
          }
      } catch(e) {
          console.error("Erro ao excluir feição no Supabase:", e);
      }
  }

  const theme = themes.find(t => t.id === tId);
  if (theme && theme.features) {
      theme.features = theme.features.filter(f => {
          if (!f) return false;
          const p = f.properties || {};
          if (idBanco && p.id_banco === idBanco) return false;
          if (tempId && p._tempId === tempId) return false;
          if (f === targetFeature) return false;
          return true;
      });

      if (window.GeoEngineTurbo && typeof window.GeoEngineTurbo.indexTheme === 'function') {
          window.GeoEngineTurbo.indexTheme(tId, theme.features);
      }

      if (window.GeoTurboDB && typeof window.GeoTurboDB.saveThemeData === 'function') {
          await window.GeoTurboDB.saveThemeData(tId, theme.features, theme.features.length);
      }
  }

  if (geojsonLayer && targetLayer) {
      try {
          geojsonLayer.removeLayer(targetLayer);
      } catch(e){}
  }
  
  if (typeof clearHighlight === 'function') {
      clearHighlight();
  }

  closeFeatureInfoModal();
  renderThemes();
}

// --- ICON DROPDOWNS ---
const availableIcons = [
  { val: 'circle', label: 'Círculo Básico' },
  { val: 'light', label: 'Poste / Iluminação Pública' },
  { val: 'bolt', label: 'Rede Elétrica / Energia' },
  { val: 'cell_tower', label: 'Torre / Telecomunicações' },
  { val: 'construction', label: 'Obras / Construção Civil' },
  { val: 'account_balance', label: 'Obras Públicas / Institucional' },
  { val: 'engineering', label: 'Engenharia / Infraestrutura' },
  { val: 'domain', label: 'Prédio / Governo' },
  { val: 'location_on', label: 'Pino (Localização)' },
  { val: 'home', label: 'Casa' },
  { val: 'business', label: 'Empresa / Comércio' },
  { val: 'park', label: 'Árvore / Meio Ambiente' },
  { val: 'directions_car', label: 'Trânsito / Veículos' },
  { val: 'build', label: 'Manutenção / Reparos' },
  { val: 'warning', label: 'Alerta / Risco' },
  { val: 'flag', label: 'Ponto de Controle / Marco' },
  { val: 'train', label: 'Linha Férrea' },
  { val: 'route', label: 'Vias / Pavimentação' },
  { val: 'water_drop', label: 'Drenagem / Recursos Hídricos' },
  { val: 'local_hospital', label: 'Saúde / Hospital' },
  { val: 'local_gas_station', label: 'Posto de Combustível' },
  { val: 'school', label: 'Educação / Escola' },
  { val: 'restaurant', label: 'Restaurante / Alimentação' },
  { val: 'factory', label: 'Indústria / Polo Industrial' }
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

// --- AUTENTICAÇÃO ---
// A segurança de verdade é imposta pelo RLS no banco (supabase_auth_setup.sql,
// Parte 2) — este bloqueio no cliente é só pra não desperdiçar tempo montando
// o mapa quando não há sessão, e pra guardar o perfil do usuário logado.
let currentUserProfile = null;
let activeMunicipioId = null;

async function ensureAuthenticated() {
    if (!supabaseClient) return true; // sem Supabase configurado, segue o fluxo antigo (dev local)

    const { data } = await supabaseClient.auth.getSession();
    if (!data || !data.session) {
        window.location.href = 'login.html';
        return false;
    }

    // O mapa é sempre de UM município por vez — quem escolhe é a home.html.
    // Sem essa escolha na sessão, não tem o que carregar aqui.
    activeMunicipioId = sessionStorage.getItem('municipio_ativo');
    if (!activeMunicipioId) {
        window.location.href = 'home.html';
        return false;
    }

    try {
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', data.session.user.id)
            .single();
        currentUserProfile = profile || { id: data.session.user.id, nome: data.session.user.email, super_admin: false };
    } catch (e) {
        currentUserProfile = { id: data.session.user.id, nome: data.session.user.email, super_admin: false };
    }

    // Papel do usuário NO MUNICÍPIO ATIVO (não é mais global) — se o vínculo
    // não existir ou não estiver aprovado (ex: acesso revogado depois que
    // este município ficou salvo na sessão), volta pra home.html.
    currentMunicipioPapel = null;
    if (!currentUserProfile.super_admin) {
        try {
            const { data: membro } = await supabaseClient
                .from('municipio_membros')
                .select('papel, status')
                .eq('user_id', data.session.user.id)
                .eq('municipio_id', activeMunicipioId)
                .eq('status', 'aprovado')
                .maybeSingle();
            if (!membro) {
                sessionStorage.removeItem('municipio_ativo');
                window.location.href = 'home.html';
                return false;
            }
            currentMunicipioPapel = membro.papel;
        } catch (e) {
            window.location.href = 'home.html';
            return false;
        }
    }

    // Mapa local de permissões por tema — só pra não mostrar botões que o
    // RLS/gatilho no banco vai recusar de qualquer forma (UX, não segurança).
    currentUserPermissions = {};
    try {
        const { data: perms } = await supabaseClient.from('permissoes_camada').select('*').eq('user_id', data.session.user.id);
        (perms || []).forEach(p => { currentUserPermissions[p.theme_id] = p; });
    } catch (e) {}

    // Permissão por aba de formulário (ver/editar dentro do card de uma
    // camada) — usado pelo formRenderer.js pra esconder abas inteiras.
    window.currentUserAbaPermissions = {};
    try {
        const { data: abaPerms } = await supabaseClient.from('permissoes_aba').select('*').eq('user_id', data.session.user.id);
        (abaPerms || []).forEach(p => { window.currentUserAbaPermissions[p.form_id + ':' + p.tab_id] = p; });
    } catch (e) {}

    if (typeof applyCurrentUserToProfileModal === 'function') applyCurrentUserToProfileModal();
    applyPermissionUIGating();
    return true;
}

// Esconde ações globais (não é por tema — é "Ajustes", "Importar", "Nova
// Camada" no menu lateral) de acordo com o papel do usuário no município
// ativo. Só UX (esconder o que o RLS já recusaria); a segurança de verdade
// continua sendo o RLS/gatilhos no banco.
function applyPermissionUIGating() {
    const isSuperAdmin = !!(currentUserProfile && currentUserProfile.super_admin);
    const isAdmin = isSuperAdmin || currentMunicipioPapel === 'admin';

    // style.display em vez da classe "hidden" do Tailwind: esses botões já
    // têm "flex" nas classes base, e a ordem entre utilities equivalentes no
    // CSS gerado pelo Tailwind CDN não é garantida — display inline sempre
    // vence, sem depender de qual regra o Tailwind emitiu por último.
    const ajustesEl = document.getElementById('drawer-btn-ajustes');
    if (ajustesEl) ajustesEl.style.display = isAdmin ? '' : 'none';

    // Importar/Nova mexem na base de dados da camada inteira (não é edição
    // de feição) — só o SuperAdmin vê, nem admin de município.
    const importarEl = document.getElementById('drawer-btn-importar');
    if (importarEl) importarEl.style.display = isSuperAdmin ? '' : 'none';

    const novaEl = document.getElementById('drawer-btn-nova');
    if (novaEl) novaEl.style.display = isSuperAdmin ? '' : 'none';

    if (typeof renderThemes === 'function') renderThemes();
}

let currentUserPermissions = {};
let currentMunicipioPapel = null; // papel do usuário NO MUNICÍPIO ATIVO (não é mais global)

// Só reflete o que o RLS/gatilho no banco decide de verdade — usado pra
// esconder/desabilitar botões, não como a barreira de segurança em si.
function userCanOnTheme(themeId, acao) {
    if (currentUserProfile && currentUserProfile.super_admin) return true;
    
    // Se há permissão explícita configurada em permissoes_camada, ela é soberana!
    const pc = currentUserPermissions ? currentUserPermissions[themeId] : null;
    if (pc) {
        if (acao === 'ver') return pc.pode_ver !== false;
        if (acao === 'editar') return !!pc.pode_editar;
        if (acao === 'excluir') return !!pc.pode_excluir;
        return false;
    }

    // Se o usuário tem entidade externa associada (ex: Ministério Público Federal) ou papel 'externo',
    // ele só pode ver o que foi explicitamente concedido (default: false se não listado).
    const isEntidadeExterna = !!(currentUserProfile && currentUserProfile.entidade_id);
    if (isEntidadeExterna || currentMunicipioPapel === 'externo') {
        return false;
    }

    if (currentMunicipioPapel === 'admin') return true;
    return acao === 'ver';
}

// Abas de formulário (dentro de uma camada): super_admin e admin do
// município sempre veem/editam tudo. Pra qualquer outro papel, negado por
// padrão — só aparece o que tiver uma linha explícita em permissoes_aba
// com pode_ver/pode_editar. Isso é de propósito: uma aba nova criada depois
// (ou um formulário novo associado a uma camada nova) não deve aparecer pra
// ninguém até alguém autorizar de novo, mesmo que a pessoa já tivesse
// acesso a outras abas daquele mesmo formulário.
function canSeeFormTab(formId, tabId) {
    if (currentUserProfile && currentUserProfile.super_admin) return true;
    if (currentMunicipioPapel === 'admin') return true;
    if (!formId || !window.currentUserAbaPermissions) return false;
    const perm = window.currentUserAbaPermissions[formId + ':' + tabId];
    return !!(perm && perm.pode_ver);
}
window.canSeeFormTab = canSeeFormTab;

function canEditFormTab(formId, tabId) {
    if (currentUserProfile && currentUserProfile.super_admin) return true;
    if (currentMunicipioPapel === 'admin') return true;
    if (!formId || !window.currentUserAbaPermissions) return false;
    const perm = window.currentUserAbaPermissions[formId + ':' + tabId];
    return !!(perm && perm.pode_editar);
}
window.canEditFormTab = canEditFormTab;

// Editor e Visualizador sempre se comportaram igual (userCanOnTheme não
// distingue os dois) — simplificado pra 3 níveis reais na interface.
// 'editor' mapeado só por compatibilidade com linhas antigas.
const PAPEL_LABELS = { admin: 'Administrador', editor: 'Usuário', visualizador: 'Usuário', externo: 'Acesso Externo' };

function applyCurrentUserToProfileModal() {
    if (!currentUserProfile) return;
    const nameEl = document.getElementById('profile-user-name');
    const roleEl = document.getElementById('profile-user-role');
    const munEl = document.getElementById('profile-user-municipio');
    if (munEl) munEl.textContent = sessionStorage.getItem('municipio_ativo_nome') || '';
    if (nameEl) nameEl.textContent = currentUserProfile.nome || 'Usuário';
    const papelExibido = currentUserProfile.super_admin ? 'Administrador Geral' : (PAPEL_LABELS[currentMunicipioPapel] || currentMunicipioPapel || '—');
    if (roleEl) roleEl.textContent = papelExibido;
}

window.handleLogout = async function() {
    if (supabaseClient) {
        try { await supabaseClient.auth.signOut(); } catch (e) {}
    }
    window.location.href = 'login.html';
};

// --- CONTROLE DE SPLASH SCREEN DE CARREGAMENTO ---
function updateSplashProgress(text, percent) {
    const textEl = document.getElementById('splash-status-text');
    const barEl = document.getElementById('splash-progress-bar');
    const pctEl = document.getElementById('splash-percentage');
    const subEl = document.getElementById('splash-subtitle');
    
    if (textEl && text) textEl.textContent = text;
    if (barEl && typeof percent === 'number') barEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (pctEl && typeof percent === 'number') pctEl.textContent = `${Math.round(percent)}%`;

    const munNome = sessionStorage.getItem('municipio_ativo_nome');
    if (subEl && munNome) {
        subEl.textContent = `Carregando município: ${munNome}`;
    }
}

function hideSplashScreen() {
    const splash = document.getElementById('app-splash-screen');
    if (!splash) return;
    updateSplashProgress('✨ Tudo pronto! Bem-vindo.', 100);
    
    setTimeout(() => {
        splash.style.opacity = '0';
        splash.style.pointerEvents = 'none';
        splash.style.transform = 'scale(1.02)';
        setTimeout(() => {
            splash.remove();
        }, 500);
    }, 450);
}

window.updateSplashProgress = updateSplashProgress;
window.hideSplashScreen = hideSplashScreen;

window.addEventListener('DOMContentLoaded', async () => {
  updateSplashProgress('🔐 Validando credenciais de acesso...', 15);
  const authOk = await ensureAuthenticated();
  if (!authOk) return;

  updateSplashProgress('⚙️ Carregando formulários dinâmicos...', 35);
  try { await fetchDynamicForm(); } catch(eForm) {}

  updateSplashProgress('🗺️ Inicializando motor cartográfico...', 50);
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
window.openFeatureInfoModal = showFeatureInfoModal;
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
    
    if (!activeFeatureLayer.feature.properties.visits) {
        activeFeatureLayer.feature.properties.visits = [];
    }
    activeFeatureLayer.feature.properties.visits.push({
        date, tech, reason, situation, notes, photos, coords: currentVisitCoords
    });
    
    await saveFeatureData();
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
            <div class="header-logo">GeoGestor</div>
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

    // Fecha o menu de Estatísticas Cruzadas e limpa qualquer análise espacial ativa
    if (window.spatialAnalyticsEngine) {
        if (typeof window.spatialAnalyticsEngine.closeMenu === 'function') {
            window.spatialAnalyticsEngine.closeMenu();
        }
        if (typeof window.spatialAnalyticsEngine.clearActiveAnalysis === 'function') {
            window.spatialAnalyticsEngine.clearActiveAnalysis(true);
        }
    }
    const resCard = document.getElementById('spatial-result-card');
    if (resCard) resCard.classList.add('hidden');
    const spatialMenu = document.getElementById('spatial-analytics-menu');
    if (spatialMenu) spatialMenu.classList.add('hidden');

    if (checkbox.checked) {
        // Open specific chart dashboard
        openStatsDashboard(themeId, chartIndex);
    } else {
        // Close dashboard and reset
        closeStatsDashboard();
    }
};

async function openStatsDashboard(themeId, specificIndex) {
    // Desativa e fecha qualquer estatística cruzada ativa no mapa
    if (window.spatialAnalyticsEngine) {
        if (typeof window.spatialAnalyticsEngine.closeMenu === 'function') {
            window.spatialAnalyticsEngine.closeMenu();
        }
        if (typeof window.spatialAnalyticsEngine.clearActiveAnalysis === 'function') {
            window.spatialAnalyticsEngine.clearActiveAnalysis(true);
            window.spatialAnalyticsEngine.renderMenuList();
        }
    }
    const resCard = document.getElementById('spatial-result-card');
    if (resCard) resCard.classList.add('hidden');
    const spatialMenu = document.getElementById('spatial-analytics-menu');
    if (spatialMenu) spatialMenu.classList.add('hidden');

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
    modal.style.zIndex = ''; // Restaurar o z-index original do Tailwind (removendo o -1)
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
            const calcMode = widget.calcMode || (widget.fieldId ? 'condition' : 'all');
            
            if (calcMode === 'condition') {
                const cField = widget.conditionField || widget.fieldId;
                const cOp = widget.conditionOp || 'equals';
                const cVal = widget.conditionValue || '';
                
                count = features.filter(f => {
                    const raw = getFeaturePropertyValue(theme, f, cField);
                    const valStr = (raw !== undefined && raw !== null) ? String(raw).trim() : '';
                    const expStr = String(cVal).trim();
                    
                    if (cOp === 'is_filled') return valStr !== '' && valStr !== '[]' && valStr !== '{}';
                    if (cOp === 'is_empty') return valStr === '' || valStr === '[]' || valStr === '{}';
                    if (cOp === 'equals') return valStr.toLowerCase() === expStr.toLowerCase();
                    if (cOp === 'not_equals') return valStr.toLowerCase() !== expStr.toLowerCase();
                    if (cOp === 'contains') return valStr.toLowerCase().includes(expStr.toLowerCase());
                    
                    const numVal = parseFloat(valStr.replace(/[^\d.-]/g, ''));
                    const numExp = parseFloat(expStr.replace(/[^\d.-]/g, ''));
                    if (!isNaN(numVal) && !isNaN(numExp)) {
                        if (cOp === 'gt') return numVal > numExp;
                        if (cOp === 'lt') return numVal < numExp;
                        if (cOp === 'gte') return numVal >= numExp;
                        if (cOp === 'lte') return numVal <= numExp;
                    }
                    return false;
                }).length;
            } else if (calcMode === 'sum' || calcMode === 'avg') {
                const numField = widget.numericField || widget.fieldId;
                let totalSum = 0;
                let validCount = 0;
                features.forEach(f => {
                    const raw = getFeaturePropertyValue(theme, f, numField);
                    if (raw !== undefined && raw !== null) {
                        const num = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
                        if (!isNaN(num)) {
                            totalSum += num;
                            validCount++;
                        }
                    }
                });
                count = calcMode === 'avg' ? (validCount > 0 ? (totalSum / validCount) : 0) : totalSum;
            } else {
                count = features.length;
            }

            const isFloat = (calcMode === 'sum' || calcMode === 'avg') && count % 1 !== 0;
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
                    const curVal = isFloat ? (easeProgress * count).toFixed(2) : Math.floor(easeProgress * count);
                    countEl.textContent = Number(curVal).toLocaleString('pt-BR');
                    if (progress < 1) window.requestAnimationFrame(step);
                    else countEl.textContent = isFloat ? count.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : count.toLocaleString('pt-BR');
                };
                window.requestAnimationFrame(step);
            }, 300);
        } else if (widget.type === 'pie' || widget.type === 'donut' || widget.type === 'bar') {
            const fieldId = widget.fieldId;
            if (!fieldId) return;

            const counts = {};
            features.forEach(f => {
                let val = getFeaturePropertyValue(theme, f, fieldId);
                if (val === undefined || val === null || val === '') {
                    val = "N/I";
                }
                counts[val] = (counts[val] || 0) + 1;
            });

            const rawLabels = Object.keys(counts);
            const data = Object.values(counts);
            
            // Helper seguro para converter qualquer cor para RGBA válido no Chart.js
            function safeChartColor(colorStr, alpha = 0.85) {
                if (!colorStr || colorStr === 'none') {
                    return `rgba(148, 163, 184, ${alpha})`;
                }
                colorStr = String(colorStr).trim();
                if (/^#([0-9a-f]{3})$/i.test(colorStr)) {
                    const r = parseInt(colorStr[1] + colorStr[1], 16);
                    const g = parseInt(colorStr[2] + colorStr[2], 16);
                    const b = parseInt(colorStr[3] + colorStr[3], 16);
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                }
                if (/^#([0-9a-f]{6})$/i.test(colorStr)) {
                    const r = parseInt(colorStr.slice(1, 3), 16);
                    const g = parseInt(colorStr.slice(3, 5), 16);
                    const b = parseInt(colorStr.slice(5, 7), 16);
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                }
                if (/^#([0-9a-f]{8})$/i.test(colorStr)) {
                    const r = parseInt(colorStr.slice(1, 3), 16);
                    const g = parseInt(colorStr.slice(3, 5), 16);
                    const b = parseInt(colorStr.slice(5, 7), 16);
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                }
                return colorStr;
            }

            // Gerar mapa de cores para cada label com matching resiliente
            const defaultColors = ['#06b6d4', '#3b82f6', '#8b5cf6', '#14b8a6', '#6366f1', '#475569', '#10b981', '#ef4444', '#f59e0b'];
            const colorsMap = {};
            
            rawLabels.forEach((label, i) => {
                let resolvedColor = null;
                if (widget.colorMap) {
                    if (widget.colorMap[label]) {
                        resolvedColor = widget.colorMap[label];
                    } else {
                        const matchKey = Object.keys(widget.colorMap).find(k => k.trim().toLowerCase() === label.trim().toLowerCase());
                        if (matchKey) resolvedColor = widget.colorMap[matchKey];
                    }
                    if (!resolvedColor && (label === 'N/I' || label === 'Não Informado' || label === '')) {
                        resolvedColor = widget.colorMap['N/I'] || widget.colorMap['Não Informado'];
                    }
                }
                colorsMap[label] = resolvedColor || defaultColors[i % defaultColors.length];
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
                    type: (widget.type === 'pie' || widget.type === 'donut') ? 'doughnut' : 'bar',
                    data: {
                        labels: chartLabels,
                        datasets: [{
                            data: data,
                            backgroundColor: rawLabels.map(label => {
                                const col = colorsMap[label];
                                return safeChartColor(col, 0.85);
                            }),
                            hoverBackgroundColor: rawLabels.map(label => {
                                const col = colorsMap[label];
                                return safeChartColor(col, 1.0);
                            }),
                            borderWidth: 0,
                            borderRadius: widget.type === 'bar' ? 4 : 0,
                            barPercentage: 0.6,
                            cutout: widget.type === 'donut' ? '70%' : (widget.type === 'pie' ? '0%' : undefined)
                        }]
                    },
                    options: {
                        animation: {
                            duration: 1500,
                            easing: 'easeOutQuart'
                        },
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: 0 },
                        plugins: {
                            legend: {
                                display: (widget.type === 'pie' || widget.type === 'donut'),
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
            }, 300);
            
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
    
    // Limpa quaisquer rótulos ou destaques de análise espacial do mapa
    if (window.spatialAnalyticsEngine && typeof window.spatialAnalyticsEngine.clearActiveAnalysis === 'function') {
        window.spatialAnalyticsEngine.clearActiveAnalysis(true);
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
        // Persistir a classificação ativa no tema para que qualquer re-render espacial mantenha as cores
        theme._activeClassification = { fieldId, colorsMap };
        
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
            
            let newColor = null;
            if (colorsMap[valStr]) {
                newColor = colorsMap[valStr];
            } else {
                const matchKey = Object.keys(colorsMap).find(k => k.trim().toLowerCase() === valStr.trim().toLowerCase());
                if (matchKey) newColor = colorsMap[matchKey];
            }
            if (!newColor && (valStr === 'N/I' || valStr === 'Não Informado' || valStr === '')) {
                newColor = colorsMap['N/I'] || colorsMap['Não Informado'];
            }
            if (!newColor) newColor = theme.color || '#3388ff';

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

        // Limpar classificação ativa
        delete theme._activeClassification;

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
              activeMunicipioId
                ? { event: '*', schema: 'public', table: 'temas', filter: `municipio_id=eq.${activeMunicipioId}` }
                : { event: '*', schema: 'public', table: 'temas' },
              async (payload) => {
                  console.log("Realtime: temas table changed!", payload);
                  // Para temas, é seguro recarregar (são poucos registros)
                  let temasQuery = supabaseClient.from('temas').select('*');
                  if (activeMunicipioId) temasQuery = temasQuery.eq('municipio_id', activeMunicipioId);
                  const { data: dbTemas } = await temasQuery;
                  if (dbTemas) {
                      // Reconstroi somente os temas, preservando features já carregadas
                      dbTemas.forEach(t => {
                          const existing = themes.find(th => String(th.id) === String(t.id));
                          if (!existing) {
                              themes.push({ id: t.id, name: t.nome, color: t.cor, features: [] });
                          }
                      });
                      themes = themes.filter(th => dbTemas.some(t => String(t.id) === String(th.id)));
                  }
                  renderThemes();
              }
          )
          .subscribe();

      // 2. Listen for changes in the 'feicoes' table — atualização CIRÚRGICA (sem recarregar tudo)
      supabaseClient
          .channel('feicoes-realtime')
          .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'feicoes' },
              async (payload) => {
                  const isEditingGeom = document.getElementById('geometry-edit-toolbar') && !document.getElementById('geometry-edit-toolbar').classList.contains('hidden');
                  if (isEditingGeom || (typeof isFeatureEditMode !== 'undefined' && isFeatureEditMode)) {
                      return; // Não interfere durante edição
                  }

                  const eventType = payload.eventType;
                  
                  if (eventType === 'DELETE') {
                      // Remove a feição excluída do mapa E de theme.features —
                      // sem isso a contagem/filtro ficam com um registro fantasma
                      // quando outro usuário exclui algo.
                      const deletedId = payload.old && payload.old.id;
                      if (deletedId) {
                          if (activeFeatureLayer) {
                              const activeId = activeFeatureLayer.feature && activeFeatureLayer.feature.properties && activeFeatureLayer.feature.properties.id_banco;
                              if (activeId && String(deletedId) === String(activeId)) {
                                  map.removeLayer(activeFeatureLayer);
                                  closeFeatureInfoModal();
                                  showWarningToast("A feição que você estava visualizando foi excluída.");
                              }
                          }
                          geojsonLayer.eachLayer(l => {
                              if (l.feature && String(l.feature.properties.id_banco) === String(deletedId)) {
                                  geojsonLayer.removeLayer(l);
                              }
                          });
                          themes.forEach(t => {
                              const idx = (t.features || []).findIndex(f => f.properties && String(f.properties.id_banco) === String(deletedId));
                              if (idx >= 0) {
                                  t.features.splice(idx, 1);
                                  const countEl = document.getElementById(`theme-count-${t.id}`);
                                  if (countEl) countEl.textContent = t.features.length;
                              }
                          });
                      }
                      return;
                  }

                  if (eventType === 'INSERT' || eventType === 'UPDATE') {
                      clearTimeout(feicoesRealtimeTimeout);
                      feicoesRealtimeTimeout = setTimeout(async () => {
                          const record = payload.new;
                          if (!record) return;

                          const theme = themes.find(t => String(t.id) === String(record.theme_id));
                          if (!theme) return;

                          const newFeature = {
                              type: 'Feature',
                              geometry: record.geometria,
                              properties: { ...record.propriedades, themeId: record.theme_id, id_banco: record.id, _propertiesLoaded: true }
                          };

                          // Atualiza theme.features (fonte de verdade da contagem
                          // e do filtro) — não só o mapa. Sem isso, edições de
                          // outros usuários deixam a contagem/lista desatualizadas.
                          const idx = (theme.features || []).findIndex(f => f.properties && String(f.properties.id_banco) === String(record.id));
                          if (idx >= 0) theme.features[idx] = newFeature;
                          else theme.features.push(newFeature);

                          // Redesenha respeitando visibilidade e o limite de
                          // densidade (evita furar o cap com inserções em tempo real)
                          loadAllFeaturesToMap();

                          const countEl = document.getElementById(`theme-count-${theme.id}`);
                          if (countEl) countEl.textContent = theme.features.length;
                      }, 500); // Debounce 500ms para lotes de importação
                      return;
                  }
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
        ["EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs"],
        ["EPSG:31981", "+proj=utm +zone=21 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"],
        ["EPSG:31982", "+proj=utm +zone=22 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"],
        ["EPSG:31983", "+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"],
        ["EPSG:31984", "+proj=utm +zone=24 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"],
        ["EPSG:31985", "+proj=utm +zone=25 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"],
        ["EPSG:29191", "+proj=utm +zone=21 +south +ellps=aust_SA +towgs84=-67.35,3.88,-38.22,0,0,0,0 +units=m +no_defs"],
        ["EPSG:29192", "+proj=utm +zone=22 +south +ellps=aust_SA +towgs84=-67.35,3.88,-38.22,0,0,0,0 +units=m +no_defs"],
        ["EPSG:29193", "+proj=utm +zone=23 +south +ellps=aust_SA +towgs84=-67.35,3.88,-38.22,0,0,0,0 +units=m +no_defs"],
        ["EPSG:29194", "+proj=utm +zone=24 +south +ellps=aust_SA +towgs84=-67.35,3.88,-38.22,0,0,0,0 +units=m +no_defs"],
        ["EPSG:29195", "+proj=utm +zone=25 +south +ellps=aust_SA +towgs84=-67.35,3.88,-38.22,0,0,0,0 +units=m +no_defs"],
        ["EPSG:32721", "+proj=utm +zone=21 +south +datum=WGS84 +units=m +no_defs"],
        ["EPSG:32722", "+proj=utm +zone=22 +south +datum=WGS84 +units=m +no_defs"],
        ["EPSG:32723", "+proj=utm +zone=23 +south +datum=WGS84 +units=m +no_defs"],
        ["EPSG:32724", "+proj=utm +zone=24 +south +datum=WGS84 +units=m +no_defs"],
        ["EPSG:32725", "+proj=utm +zone=25 +south +datum=WGS84 +units=m +no_defs"]
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
            if (!activeMunicipioId) return;
            const { data, error } = await supabaseClient.from('imagens_raster').select('*').eq('municipio_id', activeMunicipioId).order('created_at', { ascending: true });
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
            // Por padrão as ortofotos iniciam DESLIGADAS — o usuário ativa no switch quando quiser ver
            rasterLayers = (data || []).map(r => ({ ...r, visivel: false }));
            window.rasterLayers = rasterLayers;
            window.activeMunicipioId = activeMunicipioId;
            
            // Adicionar novos overlays (suporte a XYZ Tiles e ImageOverlay)
            rasterLayers.forEach(raster => {
                if (raster.visivel && map) {
                    const isXYZ = (raster.tipo === 'xyz_tiles') || (raster.url_imagem && raster.url_imagem.includes('{z}'));
                    let overlay = null;

                    if (isXYZ) {
                        const nativeMax = raster.zoom_max || 22;
                        overlay = L.tileLayer(raster.url_imagem, {
                            minZoom: 1,
                            minNativeZoom: raster.zoom_min || 14,
                            maxNativeZoom: nativeMax,
                            maxZoom: 24,
                            keepBuffer: 16,
                            opacity: raster.opacidade !== undefined ? raster.opacidade : 0.9,
                            attribution: raster.nome || 'Ortofoto'
                        });
                    } else if (raster.bbox && Array.isArray(raster.bbox) && raster.bbox.length === 2 && raster.bbox[0] && raster.bbox[0].length === 2) {
                        overlay = L.imageOverlay(raster.url_imagem, raster.bbox, {
                            opacity: raster.opacidade !== undefined ? raster.opacidade : 0.8,
                            interactive: false
                        });
                    }

                    if (overlay) {
                        overlay.addTo(map);
                        leafletRasterOverlays[raster.id] = overlay;
                    }
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

    // Editar/excluir imagem de fundo é ação de admin (mesma régua do resto
    // do app) — quem só tem acesso de leitura ainda vê/liga a camada, só
    // não mexe nela.
    const isAdmin = !!((typeof currentUserProfile !== 'undefined' && currentUserProfile && currentUserProfile.super_admin) || (typeof currentMunicipioPapel !== 'undefined' && currentMunicipioPapel === 'admin'));

    container.innerHTML = '';
    // Ordena da data mais recente para a mais antiga
    const sortedRasters = [...rasterLayers].sort((a, b) => {
        const dateA = a.data_imagem || (a.nome && a.nome.match(/(\d{4})/)?.[1] + '-01-01') || '1970-01-01';
        const dateB = b.data_imagem || (b.nome && b.nome.match(/(\d{4})/)?.[1] + '-01-01') || '1970-01-01';
        return dateB.localeCompare(dateA);
    });

    sortedRasters.forEach(raster => {
        const item = document.createElement('div');
        item.className = 'flex flex-col rounded-2xl overflow-hidden shadow-md border border-emerald-500/30 transition-all duration-300';
        item.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(15,23,42,0.75) 100%)';
        
        let dateFormatted = '';
        const effDate = raster.data_imagem || localStorage.getItem(`raster_date_${raster.id}`);
        if (effDate) {
            dateFormatted = effDate.split('-').reverse().join('/');
        } else if (raster.nome) {
            const matchDate = raster.nome.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
            const matchYear = raster.nome.match(/(20\d{2})/);
            if (matchDate) dateFormatted = `${matchDate[1]}/${matchDate[2]}/${matchDate[3]}`;
            else if (matchYear) dateFormatted = matchYear[1];
        }

        item.innerHTML = `
            <div class="p-3.5 flex flex-col">
                <!-- Header: Icon, Title, and Toggle -->
                <div class="flex items-center justify-between mb-2.5">
                    <div class="flex items-center gap-2.5 overflow-hidden">
                        <div class="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-[18px] text-emerald-400">satellite</span>
                        </div>
                        <div class="flex flex-col overflow-hidden">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-xs font-bold text-white truncate max-w-[150px]" title="${raster.nome}">${raster.nome}</span>
                                ${dateFormatted ? `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 flex items-center gap-0.5"><span class="material-symbols-outlined text-[10px]">calendar_today</span>${dateFormatted}</span>` : ''}
                            </div>
                            <span class="text-[9px] text-slate-400 font-normal uppercase tracking-wider mt-0.5">${raster.tipo === 'xyz_tiles' ? 'Ortofoto • XYZ Tiles' : 'GeoTIFF • Imagem'}</span>
                        </div>
                    </div>
                    
                    <!-- iOS-style Toggle -->
                    <label class="relative inline-flex items-center cursor-pointer shrink-0" title="${raster.visivel ? 'Ocultar' : 'Mostrar'} Imagem">
                        <input type="checkbox" class="sr-only peer" ${raster.visivel ? 'checked' : ''} onchange="toggleRasterVisibility('${raster.id}', this)">
                        <div class="w-9 h-5 bg-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                </div>
                
                ${isAdmin ? `
                <!-- Footer: Actions -->
                <div class="flex justify-start items-center border-t border-white/20 dark:border-white/10 pt-3 gap-2 w-full">
                    <button onclick="openEditRasterModal('${raster.id}')" class="p-1.5 hover:bg-white/30 rounded-lg tooltip text-slate-200 transition-colors" title="Configurações da Imagem">
                        <span class="material-symbols-outlined text-[18px]">settings</span>
                    </button>
                    <button onclick="deleteRasterLayer('${raster.id}')" class="p-1.5 hover:bg-red-500/30 rounded-lg tooltip text-red-500 transition-colors" title="Excluir Imagem">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>` : ''}
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

// Alternar visibilidade do raster (suporta ImageOverlay e TileLayer XYZ com exclusividade de ativação)
window.toggleRasterVisibility = async function(rasterId, checkbox) {
    const isVisible = checkbox.checked;
    const raster = rasterLayers.find(r => r.id === rasterId);
    if (!raster) return;

    if (isVisible) {
        // 1. Desativa todas as outras ortofotos que estiverem ligadas
        rasterLayers.forEach(otherRaster => {
            if (otherRaster.id !== rasterId && otherRaster.visivel) {
                otherRaster.visivel = false;
                const otherOverlay = leafletRasterOverlays[otherRaster.id];
                if (otherOverlay && map) {
                    map.removeLayer(otherOverlay);
                }
            }
        });

        // 2. Desmarca visualmente os switches das outras ortofotos na interface
        document.querySelectorAll('input[onchange*="toggleRasterVisibility"]').forEach(input => {
            if (input !== checkbox) {
                input.checked = false;
            }
        });
    }

    raster.visivel = isVisible;
    const overlay = leafletRasterOverlays[rasterId];
    
    if (isVisible) {
        if (overlay && map) {
            overlay.addTo(map);
        } else if (map) {
            const isXYZ = (raster.tipo === 'xyz_tiles') || (raster.url_imagem && raster.url_imagem.includes('{z}'));
            let newOverlay;
            if (isXYZ) {
                const nativeMax = raster.zoom_max || 22;
                newOverlay = L.tileLayer(raster.url_imagem, {
                    minZoom: 1,
                    minNativeZoom: raster.zoom_min || 14,
                    maxNativeZoom: nativeMax,
                    maxZoom: 24,
                    keepBuffer: 16,
                    opacity: raster.opacidade !== undefined ? raster.opacidade : 0.9,
                    attribution: raster.nome || 'Ortofoto'
                });
            } else {
                const bounds = raster.bbox;
                newOverlay = L.imageOverlay(raster.url_imagem, bounds, {
                    opacity: raster.opacidade !== undefined ? raster.opacidade : 0.8,
                    interactive: false
                });
            }
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
};

// --- MODAIS E HANDLERS DE ORTOFOTO XYZ TILES TURBO ---
window.openSelectRasterModal = async function() {
    closeImportOptionsModal();
    const modal = document.getElementById('select-raster-modal');
    const container = document.getElementById('available-rasters-list');
    if (!modal || !container) return;

    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('scale-95'), 10);

    container.innerHTML = `
        <div class="p-8 text-center text-slate-400 text-xs italic">
            <span class="material-symbols-outlined text-[32px] block mb-2 opacity-40 animate-spin">refresh</span>
            Carregando ortofotos do município...
        </div>
    `;

    try {
        let rasters = [];
        if (typeof supabaseClient !== 'undefined' && supabaseClient && activeMunicipioId) {
            const { data, error } = await supabaseClient
                .from('imagens_raster')
                .select('*')
                .eq('municipio_id', activeMunicipioId)
                .order('created_at', { ascending: false });

            if (!error && data) {
                rasters = data;
            }
        }

        // Se não encontrou no banco, usa as em memória
        if (rasters.length === 0) {
            rasters = rasterLayers || [];
        }

        if (rasters.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center gap-2">
                    <span class="material-symbols-outlined text-[40px] text-slate-400 opacity-40">satellite</span>
                    <p class="text-xs text-slate-500 dark:text-slate-400 font-medium">Nenhuma ortofoto enviada ainda para este município.</p>
                    <button onclick="window.location.href='settings.html#storage'" class="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow">
                        <span class="material-symbols-outlined text-[16px]">cloud_upload</span> Abrir Gerenciador de Arquivos
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        rasters.forEach(r => {
            const isAlreadyActive = rasterLayers.some(active => active.id === r.id);
            const card = document.createElement('div');
            card.className = 'flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-xl transition-all';
            
            card.innerHTML = `
                <div class="flex items-center gap-3 overflow-hidden">
                    <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-[22px]">satellite</span>
                    </div>
                    <div class="flex flex-col overflow-hidden">
                        <span class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title="${r.nome}">${r.nome}</span>
                        <span class="text-[10px] text-slate-400 mt-0.5">${r.tipo === 'xyz_tiles' ? 'Ortofoto Fatiada (XYZ Tiles)' : 'Imagem GeoTIFF'}</span>
                    </div>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                    ${isAlreadyActive ? `
                        <span class="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-lg flex items-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">check_circle</span> No Mapa
                        </span>
                    ` : `
                        <button onclick="activateRasterFromModal('${r.id}')" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">add</span> Ativar
                        </button>
                    `}
                </div>
            `;
            container.appendChild(card);
        });

    } catch (e) {
        console.error('Erro ao listar ortofotos:', e);
        container.innerHTML = `<div class="p-6 text-center text-red-500 text-xs">Erro ao carregar: ${e.message}</div>`;
    }
};

window.closeSelectRasterModal = function() {
    const modal = document.getElementById('select-raster-modal');
    if (modal) {
        modal.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 150);
    }
};

window.activateRasterFromModal = async function(rasterId) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;

    try {
        const { data: raster, error } = await supabaseClient
            .from('imagens_raster')
            .select('*')
            .eq('id', rasterId)
            .single();

        if (error || !raster) throw (error || new Error('Ortofoto não encontrada'));

        if (!rasterLayers.some(r => r.id === raster.id)) {
            raster.visivel = true;
            rasterLayers.push(raster);

            // Adiciona ao mapa
            if (map) {
                const isXYZ = (raster.tipo === 'xyz_tiles') || (raster.url_imagem && raster.url_imagem.includes('{z}'));
                let tileLayer;
                if (isXYZ) {
                    const nativeMax = raster.zoom_max || 22;
                    tileLayer = L.tileLayer(raster.url_imagem, {
                        minZoom: 1,
                        minNativeZoom: raster.zoom_min || 14,
                        maxNativeZoom: nativeMax,
                        maxZoom: 24,
                        keepBuffer: 16,
                        opacity: raster.opacidade !== undefined ? raster.opacidade : 0.9,
                        attribution: raster.nome
                    });
                } else {
                    tileLayer = L.imageOverlay(raster.url_imagem, raster.bbox, {
                        opacity: raster.opacidade !== undefined ? raster.opacidade : 0.8,
                        interactive: false
                    });
                }
                tileLayer.addTo(map);
                leafletRasterOverlays[raster.id] = tileLayer;
            }

            renderRasterLayersList();
            if (typeof showWarningToast === 'function') {
                showWarningToast(`Ortofoto "${raster.nome}" ativada no mapa!`);
            }
        }

        closeSelectRasterModal();
    } catch (e) {
        alert('Erro ao ativar ortofoto: ' + e.message);
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
                // O caminho real no bucket inclui a pasta do município
                // (municipio_id/arquivo.webp) — pegar só o último trecho da
                // URL perderia essa pasta e o remove() não acharia o objeto.
                const marker = '/rasters/';
                const idx = raster.url_imagem.indexOf(marker);
                const filePath = idx !== -1 ? raster.url_imagem.slice(idx + marker.length) : raster.url_imagem.split('/').pop();
                await supabaseClient.storage.from('rasters').remove([filePath]);
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
            if (!activeMunicipioId) {
                hideLoadingOverlay();
                alert("Nenhum município ativo — volte pra home.html e escolha um município antes de importar.");
                return;
            }

            const fileExt = 'webp';
            const cleanFileName = fileName.replace(/\.[^/.]+$/, "");
            // Prefixado pelo município: evita colisão de nome entre
            // municípios diferentes no mesmo bucket, e deixa o Storage já
            // organizado por pasta caso precise inspecionar manualmente.
            const uniqueFileName = `${activeMunicipioId}/${cleanFileName}_${Date.now()}.${fileExt}`;

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
                    municipio_id: activeMunicipioId,
                    nome: cleanFileName,
                    url_imagem: imageUrl,
                    bbox: latLngBounds,
                    opacidade: 0.8,
                    visivel: true,
                    created_by: (typeof currentUserProfile !== 'undefined' && currentUserProfile) ? currentUserProfile.id : null
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
