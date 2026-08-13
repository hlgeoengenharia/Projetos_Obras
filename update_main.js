const fs = require('fs');
const lines = fs.readFileSync('src/main.js', 'utf8').split('\n');

let start = -1;
let end = -1;
for (let i=0; i<lines.length; i++) {
    if (lines[i].includes('function renderFeatureInfo() {')) start = i;
    if (start > -1 && lines[i].includes('function handleFeatureSelectChange(selectElem)')) {
        end = i;
        break;
    }
}

if (start !== -1 && end !== -1) {
    const replacement = \unction renderFeatureInfo() {
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
      properties['Coordenadas Geográficas WGS 84'] = \\\Latitude: \\\ e Longitude: \\\\\\;
  }

  const themeId = properties.themeId;
  const theme = themes.find(t => t.id === themeId);
  
  let dynamicFormSchema = null;
  if (theme && theme.formId) {
      const form = allForms.find(f => f.id === theme.formId);
      if (form) dynamicFormSchema = form.schema;
  }

  if (dynamicFormSchema && dynamicFormSchema.length > 0) {
      // Use Dynamic Form Builder Schema
      let html = '<div class="flex flex-col gap-4">';
      let primaryTabId = dynamicFormSchema.find(t=>t.isPrimary)?.id || dynamicFormSchema[0].id;
      
      dynamicFormSchema.forEach((tab) => {
         let isPrimary = tab.id === primaryTabId;
         html += \\\
           <div class="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm transition-all accordion-section" id="acc-section-\\\">
             <button type="button" onclick="switchDynamicTab('\\\')" class="w-full px-4 py-3 flex items-center justify-center bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/50 dark:hover:bg-slate-800 transition-colors">
               <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2 text-center">
                 \\\
               </h3>
             </button>
             <div id="acc-content-\\\" class="accordion-content transition-all duration-300 \\\">
         \\\;
         
         if (tab.fields && tab.fields.length > 0) {
            html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
            tab.fields.forEach(f => {
               const value = properties[f.id] || '';
               html += \\\
                  <div class="col-span-1 \\\">
                    <label class="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">\\\</label>
               \\\;
               if (typeof generateFeatureInputHtml === 'function') {
                   html += generateFeatureInputHtml(f, value, isFeatureEditMode);
               }
               html += \\\</div>\\\;
            });
            html += '</div>';
         }
         html += \\\</div></div>\\\;
      });
      html += '</div>';
      container.innerHTML = html;
      return;
  }

  // OLD LOGIC FALLBACK
  {
    let html = '';
    const formFields = isLine 
        ? ["Descrição", "Extensão (m)", "Observações"].map(k => ({id: k, label: k, type: k === 'Observações' ? 'textarea' : 'text', readonly: k === 'Extensão (m)'}))
        : [
            {id: "Descrição", label: "Descrição", type: "text"},
            {id: "Situação", label: "Situação", type: "select", options: "Regular,Irregular"},
            {id: "Tipo de estrutura", label: "Tipo de estrutura", type: "select", options: "Alvenaria,Madeira,Palafita,Trailer,Container,Barraco,Taipa,Não se aplica,Outros"},
            {id: "Estrutura Outros", label: "Estrutura Outros", type: "text", condition: "Tipo de estrutura", condValue: "Outros"},
            {id: "Uso", label: "Uso", type: "select", options: "Comercial,Residencial,Mista,Sem uso definido"},
            {id: "Motivo da visita", label: "Motivo da visita", type: "text"},
            {id: "Endereço", label: "Endereço", type: "text"},
            {id: "Número do imóvel", label: "Número do imóvel", type: "text"},
            {id: "Bairro", label: "Bairro", type: "text"},
            {id: "Município", label: "Município", type: "text"},
            {id: "UF", label: "UF", type: "text"},
            {id: "Coordenadas Geográficas WGS 84", label: "Coordenadas Geográficas WGS 84", type: "text", readonly: true},
            {id: "Ocupante", label: "Ocupante", type: "select", options: "Não,Sim"},
            {id: "Nome Ocupante", label: "Nome Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
            {id: "CPF Ocupante", label: "CPF Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
            {id: "RG Ocupante", label: "RG Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
            {id: "Endereço Ocupante", label: "Endereço Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
            {id: "Número Residencia Ocupante", label: "Número Residencia Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
            {id: "Bairro Ocupante", label: "Bairro Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
            {id: "Cidade Ocupante", label: "Cidade Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
            {id: "UF Ocupante", label: "UF Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
            {id: "CEP Ocupante", label: "CEP Ocupante", type: "text", condition: "Ocupante", condValue: "Sim"},
            {id: "Observação", label: "Observação", type: "textarea"}
        ];

    html += '<div class="flex flex-col gap-4">';
    html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
    
    formFields.forEach(f => {
       const value = properties[f.id] || '';
       if (!isFeatureEditMode && !value) return; // Hide empty in view mode
       if (f.condition && properties[f.condition] !== f.condValue) return; // Hide unmet conditions

       html += \\\<div class="col-span-1 \\\">\\\;
       html += \\\<label class="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">\\\</label>\\\;
       
       if (typeof generateFeatureInputHtml === 'function') {
           html += generateFeatureInputHtml(f, value, isFeatureEditMode);
       }
       html += '</div>';
    });

    html += '</div>';

    if (isFeatureEditMode && typeof generateFeatureInputHtml === 'function') {
        html += generateFeatureInputHtml({id: 'photos', label: 'Fotos Adicionais da Feição', type: 'photo'}, '', true);
    } else if (!isFeatureEditMode && properties.photos && properties.photos.length > 0) {
        html += '<div class="flex flex-col border-t border-slate-100 dark:border-slate-800 pt-3 mt-4">';
        html += '<span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Fotos da Feição</span>';
        properties.photos.forEach(p => {
            html += \\\<img src="\\\" class="w-full rounded border border-slate-200 mt-2">\\\;
        });
        html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }
}
\;

    const newLines = [...lines.slice(0, start), replacement, ...lines.slice(end)];
    fs.writeFileSync('src/main.js', newLines.join('\\n'));
    console.log('Replaced successfully');
}
