const fs = require('fs');
let content = fs.readFileSync('src/customFields.js', 'utf8');

const deletedCardOld = `<div class="flex flex-col sm:flex-row items-center gap-3 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-200 dark:border-red-800 w-full opacity-70 shadow-sm" data-url="\${url}">
                                    <span class="material-symbols-outlined text-[16px]">delete_forever</span>
                                    <div class="flex-1 min-w-[150px]">
                                        <div class="font-semibold text-sm line-through truncate" title="\${title}">\${title}</div>
                                    </div>
                                    <div class="flex flex-col gap-1 min-w-[130px] border-l border-red-200 dark:border-red-800 pl-3">
                                        <div class="flex items-center gap-1 text-[10px]">
                                            <span class="material-symbols-outlined text-[10px]">person</span> Excluído por \${delBy}
                                        </div>
                                        <div class="flex items-center gap-1 text-[10px]">
                                            <span class="material-symbols-outlined text-[10px]">calendar_today</span> \${delDate}
                                        </div>
                                    </div>
                                    <button type="button" onclick="restoreFile('\${f.id}', '\${url}')" class="text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                                        <span class="material-symbols-outlined text-[14px]">undo</span> Restaurar
                                    </button>
                                </div>`;

const deletedCardNew = `<div class="flex items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-red-200 dark:border-red-900/30 w-full opacity-75" data-url="\${url}">
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
                                </div>`;

const activeCardOld = `<div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm" data-url="\${url}">
                                    <div class="flex-1 min-w-[150px]">
                                        <div class="font-semibold text-sm truncate" title="\${title}">\${title || 'Sem título'}</div>
                                        <div class="text-[10px] text-slate-400 mt-1 truncate" title="\${name}">Arq: \${name}</div>
                                    </div>
                                    <div class="flex flex-col gap-1 min-w-[130px] text-slate-500 border-l border-slate-200 dark:border-slate-700 pl-3">
                                        <div class="flex items-center gap-1 truncate" title="\${author}">
                                            <span class="material-symbols-outlined text-[12px]">person</span> \${author}
                                        </div>
                                        <div class="flex items-center gap-1 truncate">
                                            <span class="material-symbols-outlined text-[12px]">calendar_today</span> \${dateStr}
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <button type="button" onclick="editFileTitlePrompt('\${f.id}', '\${url}')" class="text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                                            <span class="material-symbols-outlined text-[14px]">edit</span> Editar
                                        </button>
                                        <a href="\${url}" target="_blank" class="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                                            <span class="material-symbols-outlined text-[14px]">visibility</span> Abrir
                                        </a>
                                        <button type="button" onclick="removeFile('\${f.id}', '\${url}', '\${title}')" class="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                                            <span class="material-symbols-outlined text-[14px]">delete</span> Excluir
                                        </button>
                                    </div>
                                </div>`;

const activeCardNew = `<div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm hover:shadow-md transition-shadow w-full" data-url="\${url}">
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
                                </div>`;

content = content.replace(deletedCardOld, deletedCardNew);
content = content.replace(activeCardOld, activeCardNew);

// --- Now for handleSupabaseUpload
const uploadCardOld = `<div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm" data-url="\${publicUrl}">
                <div class="flex-1 min-w-[150px]">
                    <div class="font-semibold text-sm truncate" title="\${inputTitle}">\${inputTitle || 'Sem título'}</div>
                    <div class="text-[10px] text-slate-400 mt-1 truncate" title="\${file.name}">Arq: \${file.name}</div>
                </div>
                <div class="flex flex-col gap-1 min-w-[130px] text-slate-500 border-l border-slate-200 dark:border-slate-700 pl-3">
                    <div class="flex items-center gap-1 truncate" title="\${author}">
                        <span class="material-symbols-outlined text-[12px]">person</span> \${author}
                    </div>
                    <div class="flex items-center gap-1 truncate">
                        <span class="material-symbols-outlined text-[12px]">calendar_today</span> \${dateStr}
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="editFileTitlePrompt('\${fieldId}', '\${publicUrl}')" class="text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                        <span class="material-symbols-outlined text-[14px]">edit</span> Editar
                    </button>
                    <a href="\${publicUrl}" target="_blank" class="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                        <span class="material-symbols-outlined text-[14px]">visibility</span> Abrir
                    </a>
                    <button type="button" onclick="removeFile('\${fieldId}', '\${publicUrl}', '')" class="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                        <span class="material-symbols-outlined text-[14px]">delete</span> Excluir
                    </button>
                </div>
            </div>`;

const uploadCardNew = `<div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm hover:shadow-md transition-shadow w-full" data-url="\${publicUrl}">
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
            </div>`;

content = content.replace(uploadCardOld, uploadCardNew);

// --- Now for restoreFile
const restoreCardOld = `<div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm" data-url="\${fileUrl}">
            <div class="flex-1 min-w-[150px]">
                <div class="font-semibold text-sm truncate" title="\${title}">\${title || 'Sem título'}</div>
                <div class="text-[10px] text-slate-400 mt-1 truncate" title="\${name}">Arq: \${name}</div>
            </div>
            <div class="flex flex-col gap-1 min-w-[130px] text-slate-500 border-l border-slate-200 dark:border-slate-700 pl-3">
                <div class="flex items-center gap-1 truncate" title="\${author}">
                    <span class="material-symbols-outlined text-[12px]">person</span> \${author}
                </div>
                <div class="flex items-center gap-1 truncate">
                    <span class="material-symbols-outlined text-[12px]">calendar_today</span> \${dateStr}
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button type="button" onclick="editFileTitlePrompt('\${fieldId}', '\${fileUrl}')" class="text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                    <span class="material-symbols-outlined text-[14px]">edit</span> Editar
                </button>
                <a href="\${fileUrl}" target="_blank" class="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                    <span class="material-symbols-outlined text-[14px]">visibility</span> Abrir
                </a>
                <button type="button" onclick="removeFile('\${fieldId}', '\${fileUrl}', '\${title}')" class="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                    <span class="material-symbols-outlined text-[14px]">delete</span> Excluir
                </button>
            </div>
        </div>`;

const restoreCardNew = `<div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm hover:shadow-md transition-shadow w-full" data-url="\${fileUrl}">
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

content = content.replace(restoreCardOld, restoreCardNew);

fs.writeFileSync('src/customFields.js', content, 'utf8');
console.log('customFields.js visual UI update applied!');
