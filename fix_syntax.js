const fs = require('fs');
let content = fs.readFileSync('src/customFields.js', 'utf8');

// I need to replace the entire generateFeatureInputHtml function from line 4 to line 90.
// I will use substring to replace the exact block.

const correctFunction = `function generateFeatureInputHtml(f, value, isFeatureEditMode) {
    if (!value) value = '';
    
    // MODO VISUALIZAÇÃO (Somente Leitura)
    if (!isFeatureEditMode) {
        if (f.type === 'photo' || f.type === 'attachment') {
            try {
                const files = typeof value === 'string' && value.startsWith('[') ? JSON.parse(value) : (value ? [value] : []);
                if (files.length === 0) return '<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Nenhum arquivo anexado</p>';
                
                let html = '<div class="flex flex-wrap gap-2">';
                files.forEach(file => {
                    const url = typeof file === 'string' ? file : file.url;
                    const name = typeof file === 'string' ? 'Arquivo' : (file.name || 'Arquivo');
                    const title = file.title || name;
                    const author = file.uploadedBy || 'Usuário Local';
                    const dateStr = file.uploadedAt ? new Date(file.uploadedAt).toLocaleString('pt-BR') : 'Data desconhecida';
                    const isPhoto = f.type === 'photo';
                    
                    if (!file.deleted) {
                        const leftIconActive = isPhoto 
                            ? \`<div class="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-700 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer" onclick="window.open('\${url}', '_blank')"><img src="\${url}" class="w-full h-full object-cover hover:scale-110 transition-transform duration-300" /></div>\`
                            : \`<div class="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[24px]">description</span></div>\`;
                        
                        html += \`
                        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm mb-2">
                            <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-[150px]">
                                \${leftIconActive}
                                <div class="flex flex-col overflow-hidden w-full">
                                    <div class="font-semibold text-base truncate" title="\${title}">\${title || 'Sem título'}</div>
                                    <div class="text-sm text-slate-500 mt-1 truncate">Arq: \${name}</div>
                                </div>
                            </div>
                            <div class="flex flex-col gap-1 min-w-[150px] text-slate-500 border-l border-slate-200 dark:border-slate-700 pl-4">
                                <div class="flex items-center gap-1 truncate"><span class="material-symbols-outlined text-[16px]">person</span> \${author}</div>
                                <div class="flex items-center gap-1 truncate"><span class="material-symbols-outlined text-[16px]">calendar_today</span> \${dateStr}</div>
                            </div>
                            <div class="flex items-center gap-2">
                                <a href="\${url}" target="_blank" class="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                                    <span class="material-symbols-outlined text-[16px]">visibility</span> Abrir
                                </a>
                            </div>
                        </div>\`;
                    }
                });
                html += '</div>';
                return html;
            } catch(e) {
                return '<p class="text-sm text-red-500">Erro ao carregar arquivos</p>';
            }
        } else if (f.type === 'geolocation') {
`;

// Wait, since I only need to replace the start of the function up to `} else if (f.type === 'geolocation') {` ...
// Oh wait, I also need to fix the `isFeatureEditMode === true` part! The `isFeatureEditMode === true` part was completely deleted.
// Let's add the `isFeatureEditMode` part which is further down in the original function.
// Let me just grab the entire correct `generateFeatureInputHtml` function.

const correctFullFunction = \`function generateFeatureInputHtml(f, value, isFeatureEditMode) {
    if (!value) value = '';
    
    // MODO VISUALIZAÇÃO (Somente Leitura)
    if (!isFeatureEditMode) {
        if (f.type === 'photo' || f.type === 'attachment') {
            try {
                const files = typeof value === 'string' && value.startsWith('[') ? JSON.parse(value) : (value ? [value] : []);
                if (files.length === 0) return '<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Nenhum arquivo anexado</p>';
                
                let html = '<div class="flex flex-wrap gap-2">';
                files.forEach(file => {
                    const url = typeof file === 'string' ? file : file.url;
                    const name = typeof file === 'string' ? 'Arquivo' : (file.name || 'Arquivo');
                    const title = file.title || name;
                    const author = file.uploadedBy || 'Usuário Local';
                    const dateStr = file.uploadedAt ? new Date(file.uploadedAt).toLocaleString('pt-BR') : 'Data desconhecida';
                    const isPhoto = f.type === 'photo';
                    
                    if (!file.deleted) {
                        const leftIconActive = isPhoto 
                            ? \\\`<div class="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-700 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer" onclick="window.open('\${url}', '_blank')"><img src="\${url}" class="w-full h-full object-cover hover:scale-110 transition-transform duration-300" /></div>\\\`
                            : \\\`<div class="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[24px]">description</span></div>\\\`;
                        
                        html += \\\`
                        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm mb-2">
                            <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-[150px]">
                                \${leftIconActive}
                                <div class="flex flex-col overflow-hidden w-full">
                                    <div class="font-semibold text-base truncate" title="\${title}">\${title || 'Sem título'}</div>
                                    <div class="text-sm text-slate-500 mt-1 truncate">Arq: \${name}</div>
                                </div>
                            </div>
                            <div class="flex flex-col gap-1 min-w-[150px] text-slate-500 border-l border-slate-200 dark:border-slate-700 pl-4">
                                <div class="flex items-center gap-1 truncate"><span class="material-symbols-outlined text-[16px]">person</span> \${author}</div>
                                <div class="flex items-center gap-1 truncate"><span class="material-symbols-outlined text-[16px]">calendar_today</span> \${dateStr}</div>
                            </div>
                            <div class="flex items-center gap-2">
                                <a href="\${url}" target="_blank" class="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                                    <span class="material-symbols-outlined text-[16px]">visibility</span> Abrir
                                </a>
                            </div>
                        </div>\\\`;
                    }
                });
                html += '</div>';
                return html;
            } catch(e) {
                return '<p class="text-sm text-red-500">Erro ao carregar arquivos</p>';
            }
        } else if (f.type === 'geolocation') {
            let decStr = "N/A", dmsStr = "N/A", utmStr = "N/A";
            if (value && value.lat !== undefined && value.lng !== undefined) {
                decStr = \`\${parseFloat(value.lat).toFixed(6)}, \${parseFloat(value.lng).toFixed(6)}\`;
                if(typeof formatDMS === 'function') {
                    dmsStr = formatDMS(value.lat, value.lng);
                    utmStr = formatUTM(value.lat, value.lng);
                }
            }
            return \\\`
                <div class="space-y-1">
                    <span class="text-[10px] uppercase text-slate-400 font-bold block">Geográfica (Decimal)</span>
                    <div class="text-sm font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 select-all">\${decStr}</div>
                </div>
                <div class="space-y-1 mt-2">
                    <span class="text-[10px] uppercase text-slate-400 font-bold block">Geográfica (GMS)</span>
                    <div class="text-sm font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 select-all">\${dmsStr}</div>
                </div>
                <div class="space-y-1 mt-2">
                    <span class="text-[10px] uppercase text-slate-400 font-bold block">UTM (WGS84)</span>
                    <div class="text-sm font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 select-all">\${utmStr}</div>
                </div>
            \\\`;
        }
        
        return \\\`<div class="text-sm text-slate-700 dark:text-slate-300">\${value}</div>\\\`;
    }

    // MODO EDIÇÃO
    if (f.type === 'photo' || f.type === 'attachment') {
        const isPhoto = f.type === 'photo';
        const icon = isPhoto ? 'photo_camera' : 'upload_file';
        const label = isPhoto ? 'Adicionar Foto' : 'Adicionar Anexo';
        let files = [];
        try { files = typeof value === 'string' && value.startsWith('[') ? JSON.parse(value) : (value ? [value] : []); } catch(e){}
        
        return \\\`
            <div class="space-y-2">
                <div class="flex flex-col gap-2" id="file-preview-\${f.id}">
                    \${files.map(file => {
                        const url = typeof file === 'string' ? file : file.url;
                        const name = typeof file === 'string' ? 'Arquivo' : (file.name || 'Arquivo');
                        const title = file.title || name;
                        const author = file.uploadedBy || 'Usuário Local';
                        const dateStr = file.uploadedAt ? new Date(file.uploadedAt).toLocaleString('pt-BR') : 'Data desconhecida';
                        
                        const leftIconActive = isPhoto 
                            ? \\\`<div class="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-700 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer" onclick="window.open('\${url}', '_blank')"><img src="\${url}" class="w-full h-full object-cover hover:scale-110 transition-transform duration-300" /></div>\\\`
                            : \\\`<div class="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[24px]">description</span></div>\\\`;
                        
                        const leftIconDeleted = isPhoto
                            ? \\\`<div class="w-14 h-14 rounded-xl bg-red-100 dark:bg-red-900/40 shrink-0 overflow-hidden border border-red-200 dark:border-red-800 opacity-50 grayscale"><img src="\${url}" class="w-full h-full object-cover" /></div>\\\`
                            : \\\`<div class="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[24px]">delete</span></div>\\\`;

                        if (file.deleted) {
                            const delDate = file.deletedAt ? new Date(file.deletedAt).toLocaleString('pt-BR') : '';
                            const delBy = file.deletedBy || 'Usuário';
                            return \\\`
<div class="flex flex-col sm:flex-row items-center gap-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800 w-full opacity-75 shadow-sm" data-url="\${url}">
    <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-[150px]">
        \${leftIconDeleted}
        <div class="flex flex-col overflow-hidden w-full">
            <div class="font-semibold text-base line-through truncate" title="\${title}">\${title}</div>
        </div>
    </div>
    <div class="flex flex-col gap-1 min-w-[150px] border-l border-red-200 dark:border-red-800 pl-4">
        <div class="flex items-center gap-1 text-sm">
            <span class="material-symbols-outlined text-[16px]">person</span> Excluído por \${delBy}
        </div>
        <div class="flex items-center gap-1 text-sm">
            <span class="material-symbols-outlined text-[16px]">calendar_today</span> \${delDate}
        </div>
    </div>
    <button type="button" onclick="restoreFile('\${f.id}', '\${url}')" class="text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
        <span class="material-symbols-outlined text-[16px]">undo</span> Restaurar
    </button>
</div>\\\`;
                        } else {
                            return \\\`
<div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm" data-url="\${url}">
    <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-[150px]">
        \${leftIconActive}
        <div class="flex flex-col overflow-hidden w-full">
            <div class="font-semibold text-base truncate" title="\${title}">\${title || 'Sem título'}</div>
            <div class="text-sm text-slate-500 mt-1 truncate" title="\${name}">Arq: \${name}</div>
        </div>
    </div>
    <div class="flex flex-col gap-1 min-w-[150px] text-slate-500 border-l border-slate-200 dark:border-slate-700 pl-4">
        <div class="flex items-center gap-1 truncate" title="\${author}">
            <span class="material-symbols-outlined text-[16px]">person</span> \${author}
        </div>
        <div class="flex items-center gap-1 truncate">
            <span class="material-symbols-outlined text-[16px]">calendar_today</span> \${dateStr}
        </div>
    </div>
    <div class="flex items-center gap-2">
        <button type="button" onclick="editFileTitlePrompt('\${f.id}', '\${url}')" class="text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">edit</span> Editar
        </button>
        <a href="\${url}" target="_blank" class="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">visibility</span> Abrir
        </a>
        <button type="button" onclick="removeFile('\${f.id}', '\${url}', '\${title}')" class="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">delete</span> Excluir
        </button>
    </div>
</div>\\\`;
                        }
                    }).join('')}
                </div>
                <input type="file" id="file-upload-\${f.id}" class="hidden" \${isPhoto ? 'accept="image/*"' : ''} onchange="handleSupabaseUpload(event, '\${f.id}', \${isPhoto})">
                <button type="button" onclick="document.getElementById('file-upload-\${f.id}').click()" class="flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm w-full font-medium">
                    <span class="material-symbols-outlined text-[20px]">\${icon}</span>
                    <span id="file-upload-btn-text-\${f.id}">\${label}</span>
                </button>
            </div>
        \\\`;
    } else if (f.type === 'geolocation') {`

const startIdx = content.indexOf('function generateFeatureInputHtml(f, value, isFeatureEditMode) {');
const endIdx = content.indexOf("} else if (f.type === 'geolocation') {");
if (startIdx !== -1 && endIdx !== -1) {
    const fixedContent = content.substring(0, startIdx) + correctFullFunction + content.substring(endIdx + "} else if (f.type === 'geolocation') {".length);
    fs.writeFileSync('src/customFields.js', fixedContent, 'utf8');
    console.log('generateFeatureInputHtml completely replaced!');
} else {
    console.log('Could not find start or end index!');
}
