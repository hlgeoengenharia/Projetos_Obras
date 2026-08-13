const fs = require('fs');

let content = fs.readFileSync('src/customFields.js', 'utf8');

// Function to generate the active template
function getActiveTemplate(urlVar, titleVar, nameVar, authorVar, dateStrVar, fieldIdVar) {
    return `\`
<div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm" data-url="\${${urlVar}}">
    <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-[150px]">
        \${leftIconActive}
        <div class="flex flex-col overflow-hidden w-full cursor-pointer hover:opacity-80 transition-opacity" onclick="window.open('\${${urlVar}}', '_blank')" title="Clique para abrir \${${nameVar}}">
            <div class="font-semibold text-base truncate">\${${titleVar} || 'Sem título'}</div>
            <div class="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 mt-1 truncate">Arq: \${${nameVar}}</div>
        </div>
    </div>
    <div class="flex flex-col gap-1 min-w-[150px] text-slate-500 border-l border-slate-200 dark:border-slate-700 pl-4">
        <div class="flex items-center gap-1 truncate" title="\${${authorVar}}">
            <span class="material-symbols-outlined text-[16px]">person</span> \${${authorVar}}
        </div>
        <div class="flex items-center gap-1 truncate">
            <span class="material-symbols-outlined text-[16px]">calendar_today</span> \${${dateStrVar}}
        </div>
    </div>
    <div class="flex items-center gap-2">
        <button type="button" onclick="editFileTitlePrompt('\${${fieldIdVar}}', '\${${urlVar}}')" class="text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">edit</span> Editar
        </button>
        <button type="button" onclick="removeFile('\${${fieldIdVar}}', '\${${urlVar}}', '\${${titleVar}}')" class="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">delete</span> Excluir
        </button>
    </div>
</div>\``;
}

// First, fix the leftIconActive definition to NOT show the blue document icon if !isPhoto.
content = content.replace(
    /const leftIconActive = isPhoto[\s\S]*?\? `[\s\S]*?`[\s\S]*?: `[\s\S]*?`;/g,
    `const leftIconActive = isPhoto \n                            ? \\\`<div class="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-700 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer" onclick="window.open('\${url}', '_blank')"><img src="\${url}" class="w-full h-full object-cover hover:scale-110 transition-transform duration-300" /></div>\\\`\n                            : '';`
);
// In handleSupabaseUpload, it's publicUrl instead of url
content = content.replace(
    /const leftIconActive = isPhoto[\s\S]*?\? `<div class="w-14[\s\S]*?\$\{publicUrl\}[\s\S]*?`[\s\S]*?: `<div[\s\S]*?`;/g,
    `const leftIconActive = isPhoto \n            ? \\\`<div class="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-700 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer" onclick="window.open('\${publicUrl}', '_blank')"><img src="\${publicUrl}" class="w-full h-full object-cover hover:scale-110 transition-transform duration-300" /></div>\\\`\n            : '';`
);

// We need to fix restoreFile's layout.
const restoreFileMatch = content.match(/window\.restoreFile = function[\s\S]*?el\.innerHTML = `([\s\S]*?)`;\s*}/);
if (restoreFileMatch) {
    // restoreFile doesn't have isPhoto, let's inject it by looking at the first field type or we can just assume it from something else. Wait, restoreFile doesn't have `isPhoto`!
    // But `isPhoto` logic is missing in restoreFile. We need to add it!
    // Let's rewrite restoreFile fully.
    const newRestoreFile = `window.restoreFile = function(fieldId, fileUrl) {
    const hiddenInput = document.querySelector(\`input[data-key="\${fieldId}"]\`);
    if (!hiddenInput) return;
    
    let files = [];
    let title = 'Documento';
    let author = 'Usuário Local';
    let dateStr = 'Agora';
    let name = 'Arquivo';
    let isPhoto = false;
    
    // Check if the field is a photo by looking at the preview container id or similar
    const uploadBtn = document.getElementById(\`file-upload-\${fieldId}\`);
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
    
    const previewDiv = document.getElementById(\`file-preview-\${fieldId}\`);
    const el = previewDiv.querySelector(\`[data-url="\${fileUrl}"]\`);
    if (el) {
        el.className = "flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm";
        const leftIconActive = isPhoto 
            ? \`<div class="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-700 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer" onclick="window.open('\${fileUrl}', '_blank')"><img src="\${fileUrl}" class="w-full h-full object-cover hover:scale-110 transition-transform duration-300" /></div>\`
            : '';
        el.innerHTML = ${getActiveTemplate('fileUrl', 'title', 'name', 'author', 'dateStr', 'fieldId').replace(/\\`/g, '`')};
    }
}`;
    content = content.replace(/window\.restoreFile = function[\s\S]*?el\.innerHTML = `([\s\S]*?)`;\s*}/, newRestoreFile);
}

fs.writeFileSync('src/customFields.js', content, 'utf8');
console.log('Unification script applied.');
