// src/customFields.js

// === RENDERIZAÇÃO DE CAMPOS AVANÇADOS ===
function generateFeatureInputHtml(f, value, isFeatureEditMode) {
    if (!value) value = '';
    
    // MODO VISUALIZAÇÃO (Somente Leitura)
    if (!isFeatureEditMode) {
        if (f.type === 'photo' || f.type === 'attachment') {
            try {
                const files = Array.isArray(value) ? value : (typeof value === 'string' && value.startsWith('[') ? JSON.parse(value) : (value ? [value] : []));
                if (files.length === 0) return '<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Nenhum arquivo anexado</p>';
                
                let html = '<div class="flex flex-col gap-2 @container w-full">';
                files.forEach(file => {
                    const url = typeof file === 'string' ? file : file.url;
                    const name = typeof file === 'string' ? 'Arquivo' : file.name;
                    const title = file.title || name;
                    const author = file.uploadedBy || 'Usuário Local';
                    const dateStr = file.uploadedAt ? new Date(file.uploadedAt).toLocaleString('pt-BR') : 'Data desconhecida';
                    const isPhoto = f.type === 'photo';
                    
                    const leftIconActive = isPhoto 
                        ? `<div class="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer" onclick="window.open('${url}', '_blank')"><img src="${url}" class="w-full h-full object-cover hover:scale-110 transition-transform duration-300" /></div>`
                        : `<div class="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400"><span class="material-symbols-outlined">description</span></div>`;
                    
                    if (!file.deleted) {
                        html += `
                        <div class="flex flex-col @sm:flex-row items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm mb-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors" onclick="window.open('${url}', '_blank')" title="Clique para abrir ${name}">
                            <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-[150px] w-full @sm:w-auto">
                                ${leftIconActive}
                                <div class="flex flex-col overflow-hidden w-full">
                                        <div class="font-semibold text-sm break-words" title="${title}">${title || 'Sem título'}</div>
                                        <div class="text-xs text-slate-500 mt-1 break-words">Arq: ${name}</div>
                                    </div>
                                </div>
                                <div class="flex flex-col gap-1 min-w-[150px] w-full @sm:w-auto text-slate-500 border-t @sm:border-t-0 @sm:border-l border-slate-200 dark:border-slate-700 pt-2 @sm:pt-0 @sm:pl-4">
                                    <div class="flex items-center gap-1 break-words text-xs"><span class="material-symbols-outlined text-[14px]">person</span> ${author}</div>
                                    <div class="flex items-center gap-1 break-words text-xs"><span class="material-symbols-outlined text-[14px]">calendar_today</span> ${dateStr}</div>
                                </div>
                            </div>`;
                    }
                });
                html += '</div>';
                return html;
            } catch(e) {
                return '<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Nenhum arquivo anexado</p>';
            }
        } else if (f.type === 'geolocation') {
            const lat = value.lat;
            const lng = value.lng;
            
            return `
                <div class="space-y-1">
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Decimal</span>
                    <div class="text-xs font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 select-all">${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}</div>
                </div>
                <div class="space-y-1 mt-1.5">
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Graus, Min, Seg</span>
                    <div class="text-xs font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 select-all">${typeof formatDMS === 'function' ? formatDMS(lat, lng) : 'N/A'}</div>
                </div>
                <div class="space-y-1 mt-1.5">
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">UTM (WGS84)</span>
                    <div class="text-xs font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 select-all">${typeof formatUTM === 'function' ? formatUTM(lat, lng) : 'N/A'}</div>
                </div>
            `;
        } else if (f.type === 'cpfcnpj') {
            let cleanVal = (value || '').replace(/\D/g, '');
            let formattedVal = value;
            if (cleanVal.length === 11) {
                formattedVal = cleanVal.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
            } else if (cleanVal.length === 14) {
                formattedVal = cleanVal.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
            }
            return `<div class="text-xs font-mono text-slate-700 dark:text-slate-300 break-words">${formattedVal || '<span class="text-slate-400 opacity-50 tracking-widest">---</span>'}</div>`;
        } else if (f.type === 'ipf') {
            let cleanVal = (value || '').replace(/\D/g, '');
            let formattedVal = value;
            if (cleanVal.length === 21) {
                formattedVal = cleanVal.replace(/(\d{1})(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})/, "$1_$2-$3.$4.$5.$6.$7");
            }
            return `<div class="text-xs font-mono text-slate-700 dark:text-slate-300 break-words">${formattedVal || '<span class="text-slate-400 opacity-50 tracking-widest">---</span>'}</div>`;
        } else if (f.type === 'insc_imob_cabedelo') {
            let cleanVal = (value || '').replace(/\D/g, '');
            let formattedVal = value;
            if (cleanVal.length === 19) {
                formattedVal = cleanVal.replace(/(\d{1})(\d{4})(\d{3})(\d{2})(\d{4})(\d{4})(\d{1})/, "$1.$2.$3.$4.$5.$6.$7");
            }
            return `<div class="text-xs font-mono text-slate-700 dark:text-slate-300 break-words">${formattedVal || '<span class="text-slate-400 opacity-50 tracking-widest">---</span>'}</div>`;
        } else if (f.type === 'cep') {
            let cepData = {};
            try { cepData = typeof value === 'string' && value.startsWith('{') ? JSON.parse(value) : {}; } catch(e){}
            if (!cepData.cep && !cepData.logradouro && !value) {
                return `<div class="text-xs text-slate-700 dark:text-slate-300 break-words"><span class="text-slate-400 opacity-50 tracking-widest">---</span></div>`;
            }
            
            let htmlStr = `<div class="text-xs text-slate-700 dark:text-slate-300 space-y-1">`;
            if (cepData.cep) {
                let maskCep = cepData.cep.replace(/\D/g, '');
                if (maskCep.length === 8) maskCep = maskCep.replace(/^(\d{5})(\d{3})/, "$1-$2");
                htmlStr += `<div><span class="font-semibold text-slate-500">CEP:</span> ${maskCep || value}</div>`;
            }
            if (cepData.logradouro) {
                htmlStr += `<div><span class="font-semibold text-slate-500">Endereço:</span> ${cepData.logradouro}${cepData.numero ? ', ' + cepData.numero : ''}${cepData.complemento ? ' (' + cepData.complemento + ')' : ''}</div>`;
            }
            if (cepData.bairro || cepData.cidade || cepData.uf) {
                let locParts = [cepData.bairro, cepData.cidade, cepData.uf].filter(Boolean);
                if(locParts.length > 0) htmlStr += `<div><span class="font-semibold text-slate-500">Local:</span> ${locParts.join(' - ')}</div>`;
            }
            htmlStr += `</div>`;
            // Fallback for raw string
            if (Object.keys(cepData).length === 0 && typeof value === 'string' && value.length > 0) {
                return `<div class="text-xs text-slate-700 dark:text-slate-300 break-words">${value}</div>`;
            }
            return htmlStr;
        } else if (f.type === 'hiperlink') {
            let linkData = {};
            try { linkData = typeof value === 'string' && value.startsWith('{') ? JSON.parse(value) : { url: value }; } catch(e){ linkData = { url: value }; }
            
            if (!linkData.url || linkData.url.trim() === '') {
                return `<div class="text-xs text-slate-700 dark:text-slate-300 break-words"><span class="text-slate-400 opacity-50 tracking-widest">---</span></div>`;
            }
            
            const title = linkData.title && linkData.title.trim() !== '' ? linkData.title : linkData.url;
            let finalUrl = linkData.url.trim();
            if (!/^https?:\/\//i.test(finalUrl)) {
                finalUrl = 'https://' + finalUrl;
            }
            
            return `
            <div class="flex flex-col gap-1 w-full overflow-hidden bg-blue-50/50 dark:bg-blue-900/10 p-2 rounded-lg border border-blue-100 dark:border-blue-900/30">
                <a href="${finalUrl}" target="_blank" title="Abrir link" class="font-bold text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline flex items-center gap-1.5 break-words transition-colors">
                    <span class="material-symbols-outlined text-[16px] shrink-0">link</span>
                    <span class="truncate">${title}</span>
                </a>
                ${linkData.title && linkData.title.trim() !== '' ? `<div class="text-[10px] text-slate-500 truncate ml-5 opacity-70" title="${linkData.url}">${linkData.url}</div>` : ''}
            </div>`;
        }
        
        // FORMATTED VIEW OUTPUTS
        let formattedValue = value;
        if (value && value !== '') {
            // Smart parser: detects if value is BR format (1.000,50) or raw (720.62)
            const parseLocalNumber = (v) => {
                const s = String(v).trim();
                if (s.includes(',')) {
                    // Brazilian format: dots are thousands, comma is decimal
                    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
                }
                // International/raw format: dot is decimal
                return parseFloat(s);
            };
            if (f.type === 'currency') {
                const num = parseLocalNumber(value);
                if (!isNaN(num)) formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
            } else if (f.type === 'area_m2') {
                const num = parseLocalNumber(value);
                if (!isNaN(num)) formattedValue = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) + ' m²';
            } else if (f.type === 'length_m') {
                const num = parseLocalNumber(value);
                if (!isNaN(num)) formattedValue = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) + ' m';
            } else if (f.type === 'volume_m3') {
                const num = parseLocalNumber(value);
                if (!isNaN(num)) formattedValue = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) + ' m³';
            }
        }
        
        return `<div class="text-xs text-slate-700 dark:text-slate-300 break-words">${formattedValue || '<span class="text-slate-400 opacity-50 tracking-widest">---</span>'}</div>`;
    }

    // MODO EDIÇÃO
    let html = '';
    
    // Formatting script for input masking (money/numbers)
    const onInputMaskScript = `oninput="let v = this.value.replace(/\\D/g,''); if(v.length > 0) { v = (parseInt(v, 10)/100).toFixed(2).replace('.', ','); v = v.replace(/(\\d)(?=(\\d{3})+(?!\\d))/g, '$1.'); this.value = v; } else { this.value = ''; }"`;

    if (f.type === 'photo' || f.type === 'attachment') {
        const isPhoto = f.type === 'photo';
        const icon = isPhoto ? 'photo_camera' : 'upload_file';
        const label = isPhoto ? 'Adicionar Foto' : 'Adicionar Anexo';
        let files = [];
        try { files = Array.isArray(value) ? value : (typeof value === 'string' && value.startsWith('[') ? JSON.parse(value) : (value ? [value] : [])); } catch(e){}
        
        return `
            <div class="space-y-2">
                <div class="flex flex-col gap-2 @container w-full" id="file-preview-${f.id}">
                    ${files.map(file => {
                        const url = typeof file === 'string' ? file : file.url;
                        const name = typeof file === 'string' ? 'Arquivo' : (file.name || 'Arquivo');
                        const title = file.title || name;
                        const author = file.uploadedBy || 'Usuário Local';
                        const dateStr = file.uploadedAt ? new Date(file.uploadedAt).toLocaleString('pt-BR') : 'Data desconhecida';
                        
                        const leftIconActive = isPhoto 
                            ? `<div class="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-700 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer" onclick="window.open('${url}', '_blank')"><img src="${url}" class="w-full h-full object-cover hover:scale-110 transition-transform duration-300" /></div>`
                            : '';

                        const leftIconDeleted = `<div class="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0 border border-red-200 dark:border-red-800 text-red-500"><span class="material-symbols-outlined text-[20px]">delete_forever</span></div>`;

                        if (file.deleted) {
                            const delDate = file.deletedAt ? new Date(file.deletedAt).toLocaleString('pt-BR') : '';
                            const delBy = file.deletedBy || 'Usuário';
                            return `
<div class="flex flex-col @sm:flex-row items-center gap-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800 w-full opacity-75 shadow-sm" data-url="${url}">
    <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-[150px] w-full @sm:w-auto">
        ${leftIconDeleted}
        <div class="flex flex-col overflow-hidden w-full">
            <div class="font-semibold text-sm line-through break-words" title="${title}">${title}</div>
        </div>
    </div>
    <div class="flex flex-col gap-1 min-w-[150px] w-full @sm:w-auto border-t @sm:border-t-0 @sm:border-l border-red-200 dark:border-red-800 pt-2 @sm:pt-0 @sm:pl-4">
        <div class="flex items-center gap-1 text-sm">
            <span class="material-symbols-outlined text-[16px]">person</span> Excluído por ${delBy}
        </div>
        <div class="flex items-center gap-1 text-sm">
            <span class="material-symbols-outlined text-[16px]">calendar_today</span> ${delDate}
        </div>
    </div>
    <button type="button" onclick="restoreFile('${f.id}', '${url}')" class="w-full @sm:w-auto text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
        <span class="material-symbols-outlined text-[16px]">undo</span> Restaurar
    </button>
</div>`;
                        } else {
                            return `
<div class="flex flex-col gap-3 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm" data-url="${url}">
    <div class="flex flex-col @sm:flex-row justify-between gap-4 w-full">
        <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
            ${leftIconActive}
            <div class="flex flex-col overflow-hidden w-full cursor-pointer hover:opacity-80 transition-opacity" onclick="window.open('${url}', '_blank')" title="Clique para abrir ${name}">
                <div class="font-semibold text-sm break-words" title="${title}">${title || 'Sem título'}</div>
                <div class="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 mt-1 break-words" title="${name}">Arq: ${name}</div>
            </div>
        </div>
        <div class="flex flex-col gap-1 min-w-[150px] shrink-0 text-slate-500 border-t @sm:border-t-0 @sm:border-l border-slate-200 dark:border-slate-700 pt-2 @sm:pt-0 @sm:pl-4">
            <div class="flex items-center gap-1 break-words text-xs" title="${author}">
                <span class="material-symbols-outlined text-[14px]">person</span> ${author}
            </div>
            <div class="flex items-center gap-1 break-words text-xs">
                <span class="material-symbols-outlined text-[14px]">calendar_today</span> ${dateStr}
            </div>
        </div>
    </div>
    <div class="flex flex-col sm:flex-row items-center gap-2 w-full pt-2 border-t border-slate-100 dark:border-slate-700 mt-1">
        <button type="button" onclick="editFileTitlePrompt('${f.id}', '${url}')" class="flex-1 w-full text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">edit</span> Editar
        </button>
        <button type="button" onclick="removeFile('${f.id}', '${url}', '${title}')" class="flex-1 w-full text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">delete</span> Excluir
        </button>
    </div>
</div>`;
                        }
                    }).join('')}
                </div>
                <input type="file" id="file-upload-${f.id}" class="hidden" ${isPhoto ? 'accept="image/*"' : ''} onchange="handleSupabaseUpload(event, '${f.id}', ${isPhoto})">
                <button type="button" onclick="document.getElementById('file-upload-${f.id}').click()" class="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg shadow border border-transparent transition-colors text-base w-full font-semibold">
                    <span class="material-symbols-outlined text-[22px]">${icon}</span>
                    <span id="file-upload-btn-text-${f.id}">${label}</span>
                </button>
                <input type="hidden" data-key="${f.id}" id="custom-field-${f.id}" class="feature-data-input" value="${JSON.stringify(files).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">
            </div>
        `;
    } else if (f.type === 'geolocation') {
        let decStr = "N/A", dmsStr = "N/A", utmStr = "N/A";
        if (typeof activeFeatureLayer !== 'undefined' && activeFeatureLayer) {
            let latlng = null;
            if (typeof activeFeatureLayer.getLatLng === 'function') latlng = activeFeatureLayer.getLatLng();
            else if (typeof activeFeatureLayer.getBounds === 'function') latlng = activeFeatureLayer.getBounds().getCenter();
            
            if (latlng) {
                decStr = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
                if(typeof formatDMS === 'function') {
                    dmsStr = formatDMS(latlng.lat, latlng.lng);
                    utmStr = formatUTM(latlng.lat, latlng.lng);
                }
            }
        }
        
        html += `
            <div class="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
                <div class="flex items-center justify-between mb-1">
                   <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">location_on</span> Dados de Localização</h4>
                   <button type="button" onclick="updateGeolocation('${f.id}')" class="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors tooltip" title="Atualizar Coordenadas"><span class="material-symbols-outlined text-[16px]">refresh</span></button>
                </div>
                
                <div class="space-y-1">
                    <span class="text-[10px] uppercase text-slate-400 font-bold block">Geográfica (Decimal)</span>
                    <div id="geo-dec-${f.id}" class="text-sm font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 select-all">${decStr}</div>
                </div>
                <div class="space-y-1">
                    <span class="text-[10px] uppercase text-slate-400 font-bold block">Geográfica (GMS)</span>
                    <div id="geo-dms-${f.id}" class="text-sm font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 select-all">${dmsStr}</div>
                </div>
                <div class="space-y-1">
                    <span class="text-[10px] uppercase text-slate-400 font-bold block">UTM (SIRGAS 2000)</span>
                    <div id="geo-utm-${f.id}" class="text-sm font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 select-all">${utmStr}</div>
                </div>
                
                <input type="hidden" data-key="${f.id}" id="geo-input-${f.id}" class="feature-data-input" value='${value || ''}'>
            </div>
        `;
    } else if (f.type === 'cpfcnpj') {
        html += `
          <div class="relative">
              <input type="text" data-key="${f.id}" id="cpfcnpj-input-${f.id}" value="${value}" class="feature-data-input w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm dark:text-white font-mono transition-colors pr-10" placeholder="000.000.000-00 ou 00.000.000/0000-00" maxlength="18" oninput="maskCpfCnpj(this)" onblur="validateCpfCnpj(this, '${f.id}')" />
              <span id="cpfcnpj-icon-${f.id}" class="material-symbols-outlined absolute right-3 top-2.5 text-green-500 hidden pointer-events-none">check_circle</span>
          </div>
        `;
    } else if (f.type === 'ipf') {
        html += `
          <div class="relative">
              <input type="text" data-key="${f.id}" id="ipf-input-${f.id}" value="${value}" class="feature-data-input w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm dark:text-white font-mono transition-colors pr-10" placeholder="1_0800973-41.2024.4.05.8200" maxlength="27" oninput="maskIpf(this)" />
          </div>
        `;
    } else if (f.type === 'insc_imob_cabedelo') {
        html += `
          <div class="relative">
              <input type="text" data-key="${f.id}" id="insc-imob-cabedelo-input-${f.id}" value="${value}" class="feature-data-input w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm dark:text-white font-mono transition-colors pr-10" placeholder="1.0004.028.04.0521.0039.8" maxlength="25" oninput="maskInscImobCabedelo(this)" />
          </div>
        `;
    } else if (f.type === 'cep') {
        let cepData = {};
        try { cepData = typeof value === 'string' && value.startsWith('{') ? JSON.parse(value) : {}; } catch(e){}
        html += `
            <div class="space-y-3 bg-slate-50 dark:bg-slate-900/30 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <input type="hidden" data-key="${f.id}" id="cep-hidden-${f.id}" class="feature-data-input complex-cep-input" value="${JSON.stringify(cepData).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div class="sm:col-span-1">
                        <label class="block text-[10px] font-bold text-slate-500 uppercase">CEP</label>
                        <input type="text" id="cep-val-${f.id}" value="${cepData.cep || ''}" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded text-sm font-mono dark:text-white" maxlength="9" oninput="maskCep(this)" onblur="fetchCepData(this.value, '${f.id}')" onchange="updateCepHidden('${f.id}')" placeholder="00000-000">
                    </div>
                    <div class="sm:col-span-2">
                        <label class="block text-[10px] font-bold text-slate-500 uppercase">Logradouro</label>
                        <input type="text" id="cep-logradouro-${f.id}" value="${cepData.logradouro || ''}" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded text-sm dark:text-white" onchange="updateCepHidden('${f.id}')">
                    </div>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div class="col-span-1 sm:col-span-1">
                        <label class="block text-[10px] font-bold text-slate-500 uppercase">Número</label>
                        <input type="text" id="cep-numero-${f.id}" value="${cepData.numero || ''}" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded text-sm dark:text-white" onchange="updateCepHidden('${f.id}')">
                    </div>
                    <div class="col-span-1 sm:col-span-3">
                        <label class="block text-[10px] font-bold text-slate-500 uppercase">Complemento</label>
                        <input type="text" id="cep-complemento-${f.id}" value="${cepData.complemento || ''}" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded text-sm dark:text-white" onchange="updateCepHidden('${f.id}')">
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <div class="col-span-1">
                        <label class="block text-[10px] font-bold text-slate-500 uppercase">Bairro</label>
                        <input type="text" id="cep-bairro-${f.id}" value="${cepData.bairro || ''}" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 rounded text-sm text-slate-500" readonly>
                    </div>
                    <div class="col-span-1">
                        <label class="block text-[10px] font-bold text-slate-500 uppercase">Cidade</label>
                        <input type="text" id="cep-cidade-${f.id}" value="${cepData.cidade || ''}" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 rounded text-sm text-slate-500" readonly>
                    </div>
                    <div class="col-span-1">
                        <label class="block text-[10px] font-bold text-slate-500 uppercase">UF</label>
                        <input type="text" id="cep-uf-${f.id}" value="${cepData.uf || ''}" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 rounded text-sm text-slate-500" readonly>
                    </div>
                </div>
            </div>
        `;
    } else if (f.type === 'textarea') {
        html += `<textarea data-key="${f.id}" class="feature-data-input w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm" rows="4">${value}</textarea>`;
    } else if (f.type === 'current_date') {
        if (!value) {
            const now = new Date();
            const pad = n => n < 10 ? '0'+n : n;
            value = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        }
        html += `<input type="text" data-key="${f.id}" value="${value}" readonly class="feature-data-input w-full px-3 py-2 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none text-slate-600 dark:text-slate-400 text-sm cursor-not-allowed font-medium">`;
    } else if (f.type === 'current_user') {
        if (!value) {
            value = 'Usuário Logado';
        }
        html += `<input type="text" data-key="${f.id}" value="${value}" readonly class="feature-data-input w-full px-3 py-2 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none text-slate-600 dark:text-slate-400 text-sm cursor-not-allowed font-medium">`;
    } else if (f.type === 'currency' || f.type === 'area_m2' || f.type === 'length_m' || f.type === 'volume_m3') {
        const unitMap = { currency: { prefix: 'R$', suffix: '' }, area_m2: { prefix: '', suffix: 'm²' }, length_m: { prefix: '', suffix: 'm' }, volume_m3: { prefix: '', suffix: 'm³' } };
        const unit = unitMap[f.type];
        // Format initial value for display in the input
        let displayValue = value || '';
        if (displayValue) {
            const s = String(displayValue).trim();
            let num;
            if (s.includes(',')) {
                num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
            } else {
                num = parseFloat(s);
            }
            if (!isNaN(num)) {
                displayValue = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
            }
        }
        html += `<div class="flex items-center gap-0">`;
        if (unit.prefix) html += `<span class="px-2.5 py-2 bg-slate-200 dark:bg-slate-700 border border-r-0 border-slate-300 dark:border-slate-600 rounded-l-lg text-sm font-bold text-slate-600 dark:text-slate-300">${unit.prefix}</span>`;
        html += `<input type="text" data-key="${f.id}" value="${displayValue}" inputmode="decimal" class="feature-data-input w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 ${unit.prefix && !unit.suffix ? 'rounded-r-lg' : (!unit.prefix && unit.suffix ? 'rounded-l-lg' : (unit.prefix && unit.suffix ? '' : 'rounded-lg'))} focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm text-right font-mono" ${onInputMaskScript} placeholder="0,00">`;
        if (unit.suffix) html += `<span class="px-2.5 py-2 bg-slate-200 dark:bg-slate-700 border border-l-0 border-slate-300 dark:border-slate-600 rounded-r-lg text-sm font-bold text-slate-600 dark:text-slate-300">${unit.suffix}</span>`;
        html += `</div>`;
    } else if (f.type === 'hiperlink') {
        let linkData = { title: '', url: '' };
        try { 
            linkData = typeof value === 'string' && value.startsWith('{') ? JSON.parse(value) : { url: value || '', title: '' }; 
        } catch(e){}
        
        html += `
        <div class="flex flex-col gap-2">
            <input type="text" placeholder="Título (Ex: Autor, Dono do Arquivo)" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm" value="${linkData.title || ''}" onchange="updateHiperlinkData('${f.id}')">
            <input type="url" placeholder="URL (Ex: https://drive.google.com/...)" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm" value="${linkData.url || ''}" onchange="updateHiperlinkData('${f.id}')">
            <input type="hidden" data-key="${f.id}" id="input-hiperlink-${f.id}" class="feature-data-input" value="${value ? value.replace(/"/g, '&quot;') : ''}">
        </div>
        `;
    } else if (f.type === 'select') {
        const optionsList = (f.options || '').split(',').map(o => o.trim()).filter(o => o !== '');
        html += `
        <div class="relative">
            <select data-key="${f.id}" class="feature-data-input w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm appearance-none cursor-pointer">
                <option value="">Selecione...</option>
                ${optionsList.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('')}
            </select>
            <span class="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 pointer-events-none">expand_more</span>
        </div>`;
    } else {
        html += `<input type="${f.type==='date'?'date':f.type==='number'?'number':'text'}" data-key="${f.id}" value="${value}" class="feature-data-input w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm">`;
    }
    return html;
}

// === UPLOAD PARA SUPABASE STORAGE ===
async function handleSupabaseUpload(event, fieldId, isPhoto) {
    const file = event.target.files[0];
    if (!file) return;
    
    let inputTitle = '';
    while (!inputTitle || inputTitle.trim() === '') {
        inputTitle = prompt(`Digite um título para o ${isPhoto ? 'a foto' : 'documento'}:\n(Arquivo: ${file.name})`);
        if (inputTitle === null) {
            event.target.value = '';
            return;
        }
    }
    inputTitle = inputTitle.trim();

    const btnText = document.getElementById(`file-upload-btn-text-${fieldId}`);
    const originalText = btnText.innerText;
    btnText.innerText = 'Processando...';
    
    let publicUrl = '';
    let filePath = '';

    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            filePath = fileName; // Base path inside bucket

            const { data, error } = await supabaseClient.storage.from('arquivos-obras').upload(filePath, file);

            if (error) {
                console.error('Upload Error:', error);
                alert('Erro ao enviar! Detalhe: ' + error.message);
                btnText.innerText = originalText;
                return;
            }

            const { data: { publicUrl: url } } = supabaseClient.storage.from('arquivos-obras').getPublicUrl(filePath);
            publicUrl = url;
        } catch (err) {
            console.error(err);
            alert('Erro de comunicação com o banco.');
            btnText.innerText = originalText;
            return;
        }
    } else {
        // Fallback Local (Base64)
        try {
            publicUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = e => reject(e);
                reader.readAsDataURL(file);
            });
            filePath = `local_${Date.now()}_${file.name}`;
        } catch (e) {
            alert('Erro ao processar arquivo localmente.');
            btnText.innerText = originalText;
            return;
        }
    }

        // Update hidden input
        const hiddenInput = document.querySelector(`input[data-key="${fieldId}"]`);
        let files = [];
        try { files = JSON.parse(hiddenInput.value); } catch(e){}
        
        files.push({ 
            name: file.name, 
            title: isPhoto ? '' : inputTitle, 
            url: publicUrl, 
            path: filePath, 
            uploadedBy: 'Usuário (Você)',
            uploadedAt: new Date().toISOString()
        });
        hiddenInput.value = JSON.stringify(files);
        
        // Update Preview HTML
        const previewDiv = document.getElementById(`file-preview-${fieldId}`);
        const dateStr = new Date().toLocaleString('pt-BR');
        const author = 'Usuário (Você)';
        const titleToRender = isPhoto ? inputTitle || file.name : inputTitle;
        
        const leftIconActive = isPhoto 
                            ? `<div class="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-700 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer" onclick="window.open('${publicUrl}', '_blank')"><img src="${publicUrl}" class="w-full h-full object-cover hover:scale-110 transition-transform duration-300" /></div>`
                            : '';

        previewDiv.innerHTML += `
        <div class="flex flex-col gap-3 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm" data-url="${publicUrl}">
    <div class="flex flex-col @sm:flex-row justify-between gap-4 w-full">
        <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
            ${leftIconActive}
            <div class="flex flex-col overflow-hidden w-full cursor-pointer hover:opacity-80 transition-opacity" onclick="window.open('${publicUrl}', '_blank')" title="Clique para abrir ${file.name}">
                <div class="font-semibold text-base truncate" title="${titleToRender}">${titleToRender || 'Sem título'}</div>
                <div class="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 mt-1 truncate" title="${file.name}">Arq: ${file.name}</div>
            </div>
        </div>
        <div class="flex flex-col gap-1 min-w-[150px] shrink-0 text-slate-500 border-t @sm:border-t-0 @sm:border-l border-slate-200 dark:border-slate-700 pt-2 @sm:pt-0 @sm:pl-4">
            <div class="flex items-center gap-1 truncate" title="${author}">
                <span class="material-symbols-outlined text-[16px]">person</span> ${author}
            </div>
            <div class="flex items-center gap-1 truncate">
                <span class="material-symbols-outlined text-[16px]">calendar_today</span> ${dateStr}
            </div>
        </div>
    </div>
    <div class="flex flex-col sm:flex-row items-center gap-2 w-full pt-2 border-t border-slate-100 dark:border-slate-700 mt-1">
        <button type="button" onclick="editFileTitlePrompt('${fieldId}', '${publicUrl}')" class="flex-1 w-full text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">edit</span> Editar
        </button>
        <button type="button" onclick="removeFile('${fieldId}', '${publicUrl}', '${titleToRender}')" class="flex-1 w-full text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">delete</span> Excluir
        </button>
    </div>
</div>`;
        btnText.innerText = originalText;
        event.target.value = ''; // Reset input file
}

function removeFile(fieldId, fileUrl, titleParam) {
    const hiddenInput = document.querySelector(`input[data-key="${fieldId}"]`);
    if (!hiddenInput) return;
    
    let files = [];
    let title = titleParam || 'Documento';
    try { files = JSON.parse(hiddenInput.value); } catch(e){}
    files = files.map(f => {
        const u = typeof f === 'string' ? f : f.url;
        if (u === fileUrl) {
            if (typeof f === 'string') f = { name: 'Arquivo', title: title, url: f };
            f.deleted = true;
            f.deletedBy = 'Usuário (Você)';
            f.deletedAt = new Date().toISOString();
            if (f.title) title = f.title;
        }
        return f;
    });
    hiddenInput.value = JSON.stringify(files);
    
    const previewDiv = document.getElementById(`file-preview-${fieldId}`);
    const el = previewDiv.querySelector(`[data-url="${fileUrl}"]`);
    if (el) {
        const delDate = new Date().toLocaleString('pt-BR');
        const delBy = 'Usuário (Você)';
        el.className = "flex flex-col sm:flex-row items-center gap-3 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-200 dark:border-red-800 w-full opacity-70 shadow-sm";
        el.innerHTML = `
            <span class="material-symbols-outlined text-[16px]">delete_forever</span>
            <div class="flex-1 min-w-[150px]">
                <div class="font-semibold text-sm line-through truncate" title="${title}">${title}</div>
            </div>
            <div class="flex flex-col gap-1 min-w-[130px] border-l border-red-200 dark:border-red-800 pl-3">
                <div class="flex items-center gap-1 text-[10px]">
                    <span class="material-symbols-outlined text-[10px]">person</span> Excluído por ${delBy}
                </div>
                <div class="flex items-center gap-1 text-[10px]">
                    <span class="material-symbols-outlined text-[10px]">calendar_today</span> ${delDate}
                </div>
            </div>
            <button type="button" onclick="restoreFile('${fieldId}', '${fileUrl}')" class="text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                <span class="material-symbols-outlined text-[14px]">undo</span> Restaurar
            </button>`;
    }
}

window.restoreFile = function(fieldId, fileUrl) {
    const hiddenInput = document.querySelector(`input[data-key="${fieldId}"]`);
    if (!hiddenInput) return;
    
    let files = [];
    let title = 'Documento';
    let author = 'Usuário Local';
    let dateStr = 'Agora';
    let name = 'Arquivo';
    let isPhoto = false;
    
    // Check if the field is a photo by looking at the preview container id or similar
    const uploadBtn = document.getElementById(`file-upload-${fieldId}`);
    if (uploadBtn && uploadBtn.accept && uploadBtn.accept.includes('image')) {
        isPhoto = true;
    }

    try { files = JSON.parse(hiddenInput.value); } catch(e){}
    files = files.map(f => {
        const u = typeof f === 'string' ? f : f.url;
        if (u === fileUrl) {
            f.deleted = false;
            f.deletedBy = null;
            f.deletedAt = null;
            if (f.title) title = f.title;
            if (f.uploadedBy) author = f.uploadedBy;
            if (f.uploadedAt) dateStr = new Date(f.uploadedAt).toLocaleString('pt-BR');
            if (f.name) name = f.name;
        }
        return f;
    });
    hiddenInput.value = JSON.stringify(files);
    
    const previewDiv = document.getElementById(`file-preview-${fieldId}`);
    const el = previewDiv.querySelector(`[data-url="${fileUrl}"]`);
    if (el) {
        el.className = "flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm";
        const leftIconActive = isPhoto 
            ? `<div class="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-700 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer" onclick="window.open('${fileUrl}', '_blank')"><img src="${fileUrl}" class="w-full h-full object-cover hover:scale-110 transition-transform duration-300" /></div>`
            : '';
        el.innerHTML = `
<div class="flex flex-col gap-3 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm" data-url="${fileUrl}">
    <div class="flex flex-col @sm:flex-row justify-between gap-4 w-full">
        <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
            ${leftIconActive}
            <div class="flex flex-col overflow-hidden w-full cursor-pointer hover:opacity-80 transition-opacity" onclick="window.open('${fileUrl}', '_blank')" title="Clique para abrir ${name}">
                <div class="font-semibold text-base truncate">${title || 'Sem título'}</div>
                <div class="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 mt-1 truncate">Arq: ${name}</div>
            </div>
        </div>
        <div class="flex flex-col gap-1 min-w-[150px] shrink-0 text-slate-500 border-t @sm:border-t-0 @sm:border-l border-slate-200 dark:border-slate-700 pt-2 @sm:pt-0 @sm:pl-4">
            <div class="flex items-center gap-1 truncate" title="${author}">
                <span class="material-symbols-outlined text-[16px]">person</span> ${author}
            </div>
            <div class="flex items-center gap-1 truncate">
                <span class="material-symbols-outlined text-[16px]">calendar_today</span> ${dateStr}
            </div>
        </div>
    </div>
    <div class="flex flex-col sm:flex-row items-center gap-2 w-full pt-2 border-t border-slate-100 dark:border-slate-700 mt-1">
        <button type="button" onclick="editFileTitlePrompt('${fieldId}', '${fileUrl}')" class="flex-1 w-full text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">edit</span> Editar
        </button>
        <button type="button" onclick="removeFile('${fieldId}', '${fileUrl}', '${title}')" class="flex-1 w-full text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">delete</span> Excluir
        </button>
    </div>
</div>`;
    }
}

// === CEP VIA API ===
function maskCep(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 5) v = v.replace(/^(\d{5})(\d)/, '$1-$2');
    input.value = v;
}

async function fetchCepData(cep, fieldId) {
    cep = cep.replace(/\D/g, '');
    if (cep.length !== 8) return;
    
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (data.erro) {
            alert('CEP não encontrado no ViaCEP.');
            return;
        }
        
        document.getElementById(`cep-logradouro-${fieldId}`).value = data.logradouro || '';
        document.getElementById(`cep-bairro-${fieldId}`).value = data.bairro || '';
        document.getElementById(`cep-cidade-${fieldId}`).value = data.localidade || '';
        document.getElementById(`cep-uf-${fieldId}`).value = data.uf || '';
        
        updateCepHidden(fieldId);
    } catch (e) {
        console.error(e);
    }
}

function updateCepHidden(fieldId) {
    const data = {
        cep: document.getElementById(`cep-val-${fieldId}`)?.value || '',
        logradouro: document.getElementById(`cep-logradouro-${fieldId}`)?.value || '',
        numero: document.getElementById(`cep-numero-${fieldId}`)?.value || '',
        complemento: document.getElementById(`cep-complemento-${fieldId}`)?.value || '',
        bairro: document.getElementById(`cep-bairro-${fieldId}`)?.value || '',
        cidade: document.getElementById(`cep-cidade-${fieldId}`)?.value || '',
        uf: document.getElementById(`cep-uf-${fieldId}`)?.value || ''
    };
    const hidden = document.getElementById(`cep-hidden-${fieldId}`);
    if (hidden) hidden.value = JSON.stringify(data);
}

// === CPF E CNPJ ===
function maskCpfCnpj(input) {
    let v = input.value.replace(/\D/g, "");
    if (v.length <= 11) { // CPF
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else { // CNPJ
        v = v.replace(/^(\d{2})(\d)/, "$1.$2");
        v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
        v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
        v = v.replace(/(\d{4})(\d)/, "$1-$2");
    }
    input.value = v;
}

function maskIpf(input) {
    let v = input.value.replace(/\D/g, "");
    if (v.length > 0) {
        v = v.substring(0, 21);
        let res = "";
        res += v.substring(0, 1);
        if (v.length > 1) {
            res += "_" + v.substring(1, 8);
        }
        if (v.length > 8) {
            res += "-" + v.substring(8, 10);
        }
        if (v.length > 10) {
            res += "." + v.substring(10, 14);
        }
        if (v.length > 14) {
            res += "." + v.substring(14, 15);
        }
        if (v.length > 15) {
            res += "." + v.substring(15, 17);
        }
        if (v.length > 17) {
            res += "." + v.substring(17, 21);
        }
        v = res;
    }
    input.value = v;
}

function maskInscImobCabedelo(input) {
    let v = input.value.replace(/\D/g, "");
    if (v.length > 0) {
        v = v.substring(0, 19);
        let res = "";
        res += v.substring(0, 1);
        if (v.length > 1) {
            res += "." + v.substring(1, 5);
        }
        if (v.length > 5) {
            res += "." + v.substring(5, 8);
        }
        if (v.length > 8) {
            res += "." + v.substring(8, 10);
        }
        if (v.length > 10) {
            res += "." + v.substring(10, 14);
        }
        if (v.length > 14) {
            res += "." + v.substring(14, 18);
        }
        if (v.length > 18) {
            res += "." + v.substring(18, 19);
        }
        v = res;
    }
    input.value = v;
}

function isValidCPF(cpf) {
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let sum = 0, rest;
    for (let i = 1; i <= 9; i++) sum = sum + parseInt(cpf.substring(i-1, i)) * (11 - i);
    rest = (sum * 10) % 11;
    if ((rest === 10) || (rest === 11)) rest = 0;
    if (rest !== parseInt(cpf.substring(9, 10))) return false;
    sum = 0;
    for (let i = 1; i <= 10; i++) sum = sum + parseInt(cpf.substring(i-1, i)) * (12 - i);
    rest = (sum * 10) % 11;
    if ((rest === 10) || (rest === 11)) rest = 0;
    if (rest !== parseInt(cpf.substring(10, 11))) return false;
    return true;
}

function isValidCNPJ(cnpj) {
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    let size = cnpj.length - 2;
    let numbers = cnpj.substring(0, size);
    let digits = cnpj.substring(size);
    let sum = 0;
    let pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += numbers.charAt(size - i) * pos--;
      if (pos < 2) pos = 9;
    }
    let result = sum % 11 < 2 ? 0 : 11 - sum % 11;
    if (result != digits.charAt(0)) return false;
    size = size + 1;
    numbers = cnpj.substring(0, size);
    sum = 0;
    pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += numbers.charAt(size - i) * pos--;
      if (pos < 2) pos = 9;
    }
    result = sum % 11 < 2 ? 0 : 11 - sum % 11;
    if (result != digits.charAt(1)) return false;
    return true;
}

function validateCpfCnpj(input, fieldId) {
    const val = input.value.replace(/\D/g, "");
    const icon = document.getElementById(`cpfcnpj-icon-${fieldId}`);
    
    let isValid = false;
    if (val.length === 11) {
        isValid = isValidCPF(val);
    } else if (val.length === 14) {
        isValid = isValidCNPJ(val);
    }
    
    if (isValid) {
        input.classList.remove('border-red-500', 'border-slate-300');
        input.classList.add('border-green-500');
        if (icon) icon.classList.remove('hidden');
    } else if (val.length > 0) {
        input.classList.remove('border-green-500');
        input.classList.add('border-red-500');
        if (icon) icon.classList.add('hidden');
    } else {
        input.classList.remove('border-red-500', 'border-green-500');
        input.classList.add('border-slate-300');
        if (icon) icon.classList.add('hidden');
    }
}

// === GEOLOCATION ===
function updateGeolocation(fieldId) {
    if (typeof activeFeatureLayer !== 'undefined' && activeFeatureLayer) {
        let latlng = null;
        if (typeof activeFeatureLayer.getLatLng === 'function') latlng = activeFeatureLayer.getLatLng();
        else if (typeof activeFeatureLayer.getBounds === 'function') latlng = activeFeatureLayer.getBounds().getCenter();
        
        if (latlng) {
            const dec = document.getElementById(`geo-dec-${fieldId}`);
            const dms = document.getElementById(`geo-dms-${fieldId}`);
            const utm = document.getElementById(`geo-utm-${fieldId}`);
            
            if (dec) dec.innerText = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
            if (dms && typeof formatDMS === 'function') dms.innerText = formatDMS(latlng.lat, latlng.lng);
            if (utm && typeof formatUTM === 'function') utm.innerText = formatUTM(latlng.lat, latlng.lng);
        }
    }
}

// Expose to window
window.generateFeatureInputHtml = generateFeatureInputHtml;
window.handleSupabaseUpload = handleSupabaseUpload;
window.removeFile = removeFile;
window.maskCep = maskCep;
window.fetchCepData = fetchCepData;
window.updateCepHidden = updateCepHidden;
window.maskCpfCnpj = maskCpfCnpj;
window.validateCpfCnpj = validateCpfCnpj;
window.maskIpf = maskIpf;
window.maskInscImobCabedelo = maskInscImobCabedelo;
window.updateGeolocation = updateGeolocation;


function formatDMS(lat, lng) {
    const toDMS = (deg, isLat) => {
        const absolute = Math.abs(deg);
        const degrees = Math.floor(absolute);
        const minutesNotTruncated = (absolute - degrees) * 60;
        const minutes = Math.floor(minutesNotTruncated);
        const seconds = Math.floor((minutesNotTruncated - minutes) * 60);
        const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
        return `${degrees}° ${minutes}' ${seconds}" ${dir}`;
    };
    return `${toDMS(lat, true)}, ${toDMS(lng, false)}`;
}

function formatUTM(lat, lng) {
    if (typeof proj4 === 'undefined') return "Proj4 não carregado";
    const zone = Math.floor((lng + 180) / 6) + 1;
    const isNorth = lat >= 0;
    const projStr = `+proj=utm +zone=${zone} ${isNorth ? '+north' : '+south'} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
    try {
        const coords = proj4('EPSG:4326', projStr, [lng, lat]);
        return `Zona ${zone}${isNorth ? 'N' : 'S'}, X: ${coords[0].toFixed(2)} E, Y: ${coords[1].toFixed(2)} N`;
    } catch(e) {
        return "Erro ao calcular UTM";
    }
}


// === ATUALIZAR TÍTULO DE ARQUIVO ===
window.updateFileTitle = function(fieldId, url, newTitle) {
    const hiddenInput = document.querySelector(`input[data-key="${fieldId}"]`);
    if (!hiddenInput) return;
    
    try {
        let files = JSON.parse(hiddenInput.value);
        let updated = false;
        files = files.map(f => {
            if (f.url === url || f === url) {
                updated = true;
                if (typeof f === 'string') {
                    return { name: 'Arquivo', title: newTitle, url: f };
                } else {
                    f.title = newTitle;
                    return f;
                }
            }
            return f;
        });
        if (updated) {
            hiddenInput.value = JSON.stringify(files);
            console.log('Título do arquivo atualizado para:', newTitle);
        }
    } catch(e) {
        console.error('Erro ao atualizar título do arquivo:', e);
    }
};


window.editFileTitlePrompt = function(fieldId, fileUrl) {
    const hiddenInput = document.querySelector(`input[data-key="${fieldId}"]`);
    if (!hiddenInput) return;
    
    let files = [];
    try { files = JSON.parse(hiddenInput.value); } catch(e){}
    
    let currentTitle = '';
    files.forEach(f => {
        const u = typeof f === 'string' ? f : f.url;
        if (u === fileUrl) currentTitle = f.title || '';
    });

    let newTitle = prompt("Edite o título do documento:", currentTitle);
    if (newTitle !== null && newTitle.trim() !== '') {
        updateFileTitle(fieldId, fileUrl, newTitle.trim());
        const previewDiv = document.getElementById(`file-preview-${fieldId}`);
        const el = previewDiv.querySelector(`[data-url="${fileUrl}"]`);
        if (el) {
            const titleDiv = el.querySelector('.font-semibold.text-sm');
            if (titleDiv) {
                titleDiv.innerText = newTitle.trim();
                titleDiv.title = newTitle.trim();
            }
        }
    }
};

window.updateHiperlinkData = function(fieldId) {
    const inputs = document.querySelectorAll('#input-hiperlink-' + fieldId)[0].parentElement.querySelectorAll('input[type="text"], input[type="url"]');
    const title = inputs[0].value.trim();
    const url = inputs[1].value.trim();
    document.getElementById('input-hiperlink-' + fieldId).value = JSON.stringify({ title, url });
};
