const fs = require('fs');

let content = fs.readFileSync('src/customFields.js', 'utf8');

// The goal is to dynamically select the icon block and use a unified card template for both Photo and Document fields in the 3 locations.

function applyUnifiedCardTemplate(sourceCode, functionName) {
    // This is complex to regex properly because the templates are large. 
    // We'll replace the whole generation block.
    // Let's just find the `files.map(file => {` block inside generateFeatureInputHtml
    return sourceCode;
}

// Since manipulating big HTML strings is prone to errors, I'll just write a script that does it safely by replacing specific blocks.

const oldGenBlock = `if (isPhoto) {
                            return \`<div class="relative group w-20 h-20 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden shadow-sm" data-url="\${url}">
                                        <img src="\${url}" class="w-full h-full object-cover" />
                                        <button type="button" onclick="removeFile('\${f.id}', '\${url}')" class="absolute inset-0 bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span class="material-symbols-outlined text-[20px]">delete</span>
                                        </button>
                                    </div>\`;
                        } else {
                            const title = file.title || name;
                            const author = file.uploadedBy || 'Usuário Local';
                            const dateStr = file.uploadedAt ? new Date(file.uploadedAt).toLocaleString('pt-BR') : 'Agora';
                            
                            if (file.deleted) {
                                const delDate = file.deletedAt ? new Date(file.deletedAt).toLocaleString('pt-BR') : '';
                                const delBy = file.deletedBy || 'Usuário';
                                return \`
                                <div class="flex items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-red-200 dark:border-red-900/30 w-full opacity-75" data-url="\${url}">
                                    <div class="flex items-center gap-3 overflow-hidden flex-1">
                                        <div class="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center shrink-0">
                                            <span class="material-symbols-outlined text-[20px]">delete</span>
                                        </div>
                                        <div class="flex flex-col overflow-hidden">
                                            <div class="font-semibold text-sm text-slate-500 line-through truncate" title="\${title}">\${title}</div>
                                            <div class="text-[11px] text-red-400 truncate mt-0.5">
                                                Excluído por \${delBy} • \${delDate}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-1 shrink-0">
                                        <button type="button" onclick="restoreFile('\${f.id}', '\${url}')" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors tooltip flex items-center gap-1 text-xs px-2" title="Restaurar">
                                            <span class="material-symbols-outlined text-[16px]">undo</span> Restaurar
                                        </button>
                                    </div>
                                </div>\`;
                            } else {
                                return \`
                                <div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm hover:shadow-md transition-shadow w-full" data-url="\${url}">
                                    <div class="flex items-center gap-3 overflow-hidden flex-1">
                                        <div class="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                            <span class="material-symbols-outlined text-[20px]">description</span>
                                        </div>
                                        <div class="flex flex-col overflow-hidden">
                                            <div class="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate" title="\${title}">\${title || 'Sem título'}</div>
                                            <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5" title="Arq: \${name} | Enviado por \${author} em \${dateStr}">
                                                \${author} • \${dateStr} • Arq: \${name}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-1 shrink-0">
                                        <button type="button" onclick="editFileTitlePrompt('\${f.id}', '\${url}')" class="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors tooltip" title="Editar Título">
                                            <span class="material-symbols-outlined text-[18px]">edit</span>
                                        </button>
                                        <a href="\${url}" target="_blank" class="p-2 rounded-lg text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors tooltip" title="Abrir Arquivo">
                                            <span class="material-symbols-outlined text-[18px]">open_in_new</span>
                                        </a>
                                        <button type="button" onclick="removeFile('\${f.id}', '\${url}', '\${title}')" class="p-2 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors tooltip" title="Excluir Arquivo">
                                            <span class="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    </div>
                                </div>\`;
                            }
                        }`;

const newGenBlock = `const title = file.title || name;
                            const author = file.uploadedBy || 'Usuário Local';
                            const dateStr = file.uploadedAt ? new Date(file.uploadedAt).toLocaleString('pt-BR') : 'Agora';
                            
                            const leftIconActive = isPhoto 
                                ? \`<div class="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer" onclick="window.open('\${url}', '_blank')"><img src="\${url}" class="w-full h-full object-cover hover:scale-110 transition-transform duration-300" /></div>\`
                                : \`<div class="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[20px]">description</span></div>\`;
                                
                            const leftIconDeleted = isPhoto
                                ? \`<div class="relative w-12 h-12 rounded-lg bg-red-50 dark:bg-red-900/20 shrink-0 overflow-hidden border border-red-200 dark:border-red-800"><img src="\${url}" class="w-full h-full object-cover opacity-50" /><div class="absolute inset-0 flex items-center justify-center text-red-500"><span class="material-symbols-outlined text-[24px] drop-shadow-md">delete</span></div></div>\`
                                : \`<div class="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[20px]">delete</span></div>\`;
                            
                            if (file.deleted) {
                                const delDate = file.deletedAt ? new Date(file.deletedAt).toLocaleString('pt-BR') : '';
                                const delBy = file.deletedBy || 'Usuário';
                                return \`
                                <div class="flex items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-red-200 dark:border-red-900/30 w-full opacity-75" data-url="\${url}">
                                    <div class="flex items-center gap-3 overflow-hidden flex-1">
                                        \${leftIconDeleted}
                                        <div class="flex flex-col overflow-hidden">
                                            <div class="font-semibold text-sm text-slate-500 line-through truncate" title="\${title}">\${title}</div>
                                            <div class="text-[11px] text-red-400 truncate mt-0.5">
                                                Excluído por \${delBy} • \${delDate}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-1 shrink-0">
                                        <button type="button" onclick="restoreFile('\${f.id}', '\${url}')" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors tooltip flex items-center gap-1 text-xs px-2" title="Restaurar">
                                            <span class="material-symbols-outlined text-[16px]">undo</span> Restaurar
                                        </button>
                                    </div>
                                </div>\`;
                            } else {
                                return \`
                                <div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm hover:shadow-md transition-shadow w-full" data-url="\${url}">
                                    <div class="flex items-center gap-3 overflow-hidden flex-1">
                                        \${leftIconActive}
                                        <div class="flex flex-col overflow-hidden">
                                            <div class="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate" title="\${title}">\${title || 'Sem título'}</div>
                                            <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5" title="Arq: \${name} | Enviado por \${author} em \${dateStr}">
                                                \${author} • \${dateStr} • Arq: \${name}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-1 shrink-0">
                                        <button type="button" onclick="editFileTitlePrompt('\${f.id}', '\${url}')" class="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors tooltip" title="Editar Título">
                                            <span class="material-symbols-outlined text-[18px]">edit</span>
                                        </button>
                                        <a href="\${url}" target="_blank" class="p-2 rounded-lg text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors tooltip" title="Abrir Arquivo">
                                            <span class="material-symbols-outlined text-[18px]">open_in_new</span>
                                        </a>
                                        <button type="button" onclick="removeFile('\${f.id}', '\${url}', '\${title}')" class="p-2 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors tooltip" title="Excluir \${isPhoto ? 'Foto' : 'Arquivo'}">
                                            <span class="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    </div>
                                </div>\`;
                            }`;

content = content.replace(oldGenBlock, newGenBlock);

// 2. handleSupabaseUpload logic
const oldUploadBlock = `if (isPhoto) {
            previewDiv.innerHTML += \`<div class="relative group w-20 h-20 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden shadow-sm" data-url="\${publicUrl}">
                                        <img src="\${publicUrl}" class="w-full h-full object-cover" />
                                        <button type="button" onclick="removeFile('\${fieldId}', '\${publicUrl}')" class="absolute inset-0 bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span class="material-symbols-outlined text-[20px]">delete</span>
                                        </button>
                                    </div>\`;
        } else {
            const dateStr = new Date().toLocaleString('pt-BR');
            const author = 'Usuário (Você)';
            previewDiv.innerHTML += \`
            <div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm hover:shadow-md transition-shadow w-full" data-url="\${publicUrl}">
                <div class="flex items-center gap-3 overflow-hidden flex-1">
                    <div class="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-[20px]">description</span>
                    </div>
                    <div class="flex flex-col overflow-hidden">
                        <div class="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate" title="\${inputTitle}">\${inputTitle || 'Sem título'}</div>
                        <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5" title="Arq: \${file.name} | Enviado por \${author} em \${dateStr}">
                            \${author} • \${dateStr} • Arq: \${file.name}
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    <button type="button" onclick="editFileTitlePrompt('\${fieldId}', '\${publicUrl}')" class="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors tooltip" title="Editar Título">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <a href="\${publicUrl}" target="_blank" class="p-2 rounded-lg text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors tooltip" title="Abrir Arquivo">
                        <span class="material-symbols-outlined text-[18px]">open_in_new</span>
                    </a>
                    <button type="button" onclick="removeFile('\${fieldId}', '\${publicUrl}', '')" class="p-2 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors tooltip" title="Excluir Arquivo">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            </div>\`;
        }`;

const newUploadBlock = `const dateStr = new Date().toLocaleString('pt-BR');
            const author = 'Usuário (Você)';
            const titleToRender = isPhoto ? inputTitle || file.name : inputTitle;
            
            const leftIconActive = isPhoto 
                ? \`<div class="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer" onclick="window.open('\${publicUrl}', '_blank')"><img src="\${publicUrl}" class="w-full h-full object-cover hover:scale-110 transition-transform duration-300" /></div>\`
                : \`<div class="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[20px]">description</span></div>\`;

            previewDiv.innerHTML += \`
            <div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm hover:shadow-md transition-shadow w-full" data-url="\${publicUrl}">
                <div class="flex items-center gap-3 overflow-hidden flex-1">
                    \${leftIconActive}
                    <div class="flex flex-col overflow-hidden">
                        <div class="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate" title="\${titleToRender}">\${titleToRender || 'Sem título'}</div>
                        <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5" title="Arq: \${file.name} | Enviado por \${author} em \${dateStr}">
                            \${author} • \${dateStr} • Arq: \${file.name}
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    <button type="button" onclick="editFileTitlePrompt('\${fieldId}', '\${publicUrl}')" class="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors tooltip" title="Editar Título">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <a href="\${publicUrl}" target="_blank" class="p-2 rounded-lg text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors tooltip" title="Abrir Arquivo">
                        <span class="material-symbols-outlined text-[18px]">open_in_new</span>
                    </a>
                    <button type="button" onclick="removeFile('\${fieldId}', '\${publicUrl}', '')" class="p-2 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors tooltip" title="Excluir \${isPhoto ? 'Foto' : 'Arquivo'}">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            </div>\`;`;

content = content.replace(oldUploadBlock, newUploadBlock);

// Wait, the prompt for isPhoto in handleSupabaseUpload needs to be enabled too!
// The user wants the SAME information. So the prompt must happen for photos too!
const oldPromptBlock = `if (!isPhoto) {
        while (!inputTitle || inputTitle.trim() === '') {
            inputTitle = prompt(\`Digite um título para o documento:\\n(Arquivo: \${file.name})\`);
            if (inputTitle === null) {
                event.target.value = '';
                return;
            }
        }
        inputTitle = inputTitle.trim();
    }`;

const newPromptBlock = `while (!inputTitle || inputTitle.trim() === '') {
        inputTitle = prompt(\`Digite um título para o \${isPhoto ? 'a foto' : 'documento'}:\\n(Arquivo: \${file.name})\`);
        if (inputTitle === null) {
            event.target.value = '';
            return;
        }
    }
    inputTitle = inputTitle.trim();`;

content = content.replace(oldPromptBlock, newPromptBlock);

// 3. restoreFile logic
const oldRestoreBlock = `<div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm hover:shadow-md transition-shadow w-full" data-url="\${fileUrl}">
            <div class="flex items-center gap-3 overflow-hidden flex-1">
                <div class="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <span class="material-symbols-outlined text-[20px]">description</span>
                </div>
                <div class="flex flex-col overflow-hidden">
                    <div class="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate" title="\${title}">\${title || 'Sem título'}</div>
                    <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5" title="Arq: \${name} | Enviado por \${author} em \${dateStr}">
                        \${author} • \${dateStr} • Arq: \${name}
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
                <button type="button" onclick="editFileTitlePrompt('\${fieldId}', '\${fileUrl}')" class="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors tooltip" title="Editar Título">
                    <span class="material-symbols-outlined text-[18px]">edit</span>
                </button>
                <a href="\${fileUrl}" target="_blank" class="p-2 rounded-lg text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors tooltip" title="Abrir Arquivo">
                    <span class="material-symbols-outlined text-[18px]">open_in_new</span>
                </a>
                <button type="button" onclick="removeFile('\${fieldId}', '\${fileUrl}', '\${title}')" class="p-2 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors tooltip" title="Excluir Arquivo">
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
            </div>
        </div>`;

const newRestoreBlock = `// Determine if it was a photo by checking if it's an image url
        const isPhoto = fileUrl.match(/\\.(jpeg|jpg|gif|png|webp|avif)$/i) != null;
        const leftIconActive = isPhoto 
            ? \`<div class="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer" onclick="window.open('\${fileUrl}', '_blank')"><img src="\${fileUrl}" class="w-full h-full object-cover hover:scale-110 transition-transform duration-300" /></div>\`
            : \`<div class="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[20px]">description</span></div>\`;

        el.innerHTML = \`
        <div class="flex items-center gap-3 overflow-hidden flex-1">
            \${leftIconActive}
            <div class="flex flex-col overflow-hidden">
                <div class="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate" title="\${title}">\${title || 'Sem título'}</div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5" title="Arq: \${name} | Enviado por \${author} em \${dateStr}">
                    \${author} • \${dateStr} • Arq: \${name}
                </div>
            </div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
            <button type="button" onclick="editFileTitlePrompt('\${fieldId}', '\${fileUrl}')" class="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors tooltip" title="Editar Título">
                <span class="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <a href="\${fileUrl}" target="_blank" class="p-2 rounded-lg text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors tooltip" title="Abrir Arquivo">
                <span class="material-symbols-outlined text-[18px]">open_in_new</span>
            </a>
            <button type="button" onclick="removeFile('\${fieldId}', '\${fileUrl}', '\${title}')" class="p-2 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors tooltip" title="Excluir Arquivo">
                <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
        </div>\`;`;

content = content.replace(oldRestoreBlock, newRestoreBlock);

fs.writeFileSync('src/customFields.js', content, 'utf8');
console.log('customFields.js unified photo card layout applied!');
