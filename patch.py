import sys

filepath = 'dashboard/code.html'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace pm:create
pm_create_old = """  map.on('pm:create', function(e) {
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
  });"""

pm_create_new = """  map.on('pm:create', function(e) {
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
  });"""

content = content.replace(pm_create_old, pm_create_new)

# Replace renderFeatureInfo
renderFeatureInfo_old = """function renderFeatureInfo() {
  const container = document.getElementById('feature-info-content');
  container.innerHTML = '';
  
  if (!activeFeatureLayer.feature.properties) {
      activeFeatureLayer.feature.properties = {};
  }
  const properties = activeFeatureLayer.feature.properties;
  
  // Standard fields priority sequence
  const standardOrder = ["Proprietário", "CPF/CNPJ", "Endereço", "Número do imóvel", "Lote", "Quadra", "Bairro", "Loteamento", "Município"];
  
  // Collect all keys, ignoring internal themeId
  const allKeys = Object.keys(properties).filter(k => k !== 'themeId');
  
  // Ensure all standard fields exist to allow filling them in edit mode
  standardOrder.forEach(key => {
     if (!allKeys.includes(key)) {
         properties[key] = '';
         allKeys.push(key);
     }
  });

  // Separate standard from others
  const orderedKeys = [];
  standardOrder.forEach(key => {
    if (allKeys.includes(key)) orderedKeys.push(key);
  });
  allKeys.forEach(key => {
    if (!standardOrder.includes(key)) orderedKeys.push(key);
  });

  // Render fields
  orderedKeys.forEach(key => {
    const value = properties[key] || '';
    
    if (isFeatureEditMode) {
      container.innerHTML += `
        <div class="flex flex-col gap-1">
          <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">${key}</label>
          <input type="text" data-key="${key}" value="${value}" class="feature-data-input w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm">
        </div>
      `;
    } else {
      container.innerHTML += `
        <div class="flex flex-col border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0">
          <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">${key}</span>
          <span class="text-sm text-slate-800 dark:text-slate-200 font-medium">${value || '<span class="text-slate-300 dark:text-slate-600 italic">Não informado</span>'}</span>
        </div>
      `;
    }
  });
}"""

renderFeatureInfo_new = """function renderFeatureInfo() {
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
     } else {
         fields.forEach(f => {
             const value = properties[f.key] || '';
             // Only display if it has value
             if (!value) return;
             if (f.condition && properties[f.condition] !== f.condValue) return;
             
             html += `
                <div class="flex flex-col border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0">
                  <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">${f.key}</span>
                  <span class="text-sm text-slate-800 dark:text-slate-200 font-medium">${value}</span>
                </div>
             `;
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
}"""

content = content.replace(renderFeatureInfo_old, renderFeatureInfo_new)

# Replace saveFeatureData
saveFeatureData_old = """function saveFeatureData() {
  const inputs = document.querySelectorAll('.feature-data-input');
  inputs.forEach(input => {
    const key = input.getAttribute('data-key');
    activeFeatureLayer.feature.properties[key] = input.value;
  });
  
  syncMapDataToThemes(); // Salva no localstorage
  
  isFeatureEditMode = false;
  renderFeatureInfo();
  document.getElementById('feature-actions-container').classList.remove('hidden');
  document.getElementById('feature-save-container').classList.add('hidden');
}"""

saveFeatureData_new = """async function saveFeatureData() {
  const inputs = document.querySelectorAll('.feature-data-input');
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
}"""

content = content.replace(saveFeatureData_old, saveFeatureData_new)

# Replace stopGeometryEditing
stopGeometryEditing_old = """function stopGeometryEditing() {
  if (activeFeatureLayer && activeFeatureLayer.pm) {
    activeFeatureLayer.pm.disable();
    // Atualiza a geometria que foi modificada exportando de volta pro feature
    activeFeatureLayer.feature.geometry = activeFeatureLayer.toGeoJSON().geometry;
    syncMapDataToThemes();
  }
  const toolbar = document.getElementById('geometry-edit-toolbar');
  toolbar.classList.add('hidden');
  toolbar.classList.remove('flex');
}"""

stopGeometryEditing_new = """function stopGeometryEditing() {
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
}"""

content = content.replace(stopGeometryEditing_old, stopGeometryEditing_new)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
