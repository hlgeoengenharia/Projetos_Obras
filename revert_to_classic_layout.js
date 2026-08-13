const fs = require('fs');
let content = fs.readFileSync('src/customFields.js', 'utf8');

// There are three places where the new card layout exists:
// 1. generateFeatureInputHtml
// 2. handleSupabaseUpload
// 3. restoreFile

const classicActiveTemplate = (urlVar, titleVar, authorVar, dateStrVar, nameVar, fieldIdVar) => `
<div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm" data-url="\${${urlVar}}">
    <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-[150px]">
        \${leftIconActive}
        <div class="flex flex-col overflow-hidden w-full">
            <div class="font-semibold text-base truncate" title="\${${titleVar}}">\${${titleVar} || 'Sem título'}</div>
            <div class="text-sm text-slate-500 mt-1 truncate" title="\${${nameVar}}">Arq: \${${nameVar}}</div>
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
        <a href="\${${urlVar}}" target="_blank" class="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">visibility</span> Abrir
        </a>
        <button type="button" onclick="removeFile('\${${fieldIdVar}}', '\${${urlVar}}', '\${${titleVar}}')" class="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">delete</span> Excluir
        </button>
    </div>
</div>`;

const classicDeletedTemplate = (urlVar, titleVar, delByVar, delDateVar, fieldIdVar) => `
<div class="flex flex-col sm:flex-row items-center gap-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800 w-full opacity-75 shadow-sm" data-url="\${${urlVar}}">
    <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-[150px]">
        \${leftIconDeleted}
        <div class="flex flex-col overflow-hidden w-full">
            <div class="font-semibold text-base line-through truncate" title="\${${titleVar}}">\${${titleVar}}</div>
        </div>
    </div>
    <div class="flex flex-col gap-1 min-w-[150px] border-l border-red-200 dark:border-red-800 pl-4">
        <div class="flex items-center gap-1 text-sm">
            <span class="material-symbols-outlined text-[16px]">person</span> Excluído por \${${delByVar}}
        </div>
        <div class="flex items-center gap-1 text-sm">
            <span class="material-symbols-outlined text-[16px]">calendar_today</span> \${${delDateVar}}
        </div>
    </div>
    <button type="button" onclick="restoreFile('\${${fieldIdVar}}', '\${${urlVar}}')" class="text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
        <span class="material-symbols-outlined text-[16px]">undo</span> Restaurar
    </button>
</div>`;

// Regex replace in generateFeatureInputHtml
content = content.replace(
    /if \(file\.deleted\) {[\s\S]*?return `[\s\S]*?`;\s*} else {\s*return `[\s\S]*?`;\s*}/,
    `if (file.deleted) {
        const delDate = file.deletedAt ? new Date(file.deletedAt).toLocaleString('pt-BR') : '';
        const delBy = file.deletedBy || 'Usuário';
        return \`${classicDeletedTemplate('url', 'title', 'delBy', 'delDate', 'f.id')}\`;
    } else {
        return \`${classicActiveTemplate('url', 'title', 'author', 'dateStr', 'name', 'f.id')}\`;
    }`
);

// Regex replace in handleSupabaseUpload
content = content.replace(
    /previewDiv\.innerHTML \+= `\n\s*<div class="flex items-center justify-between gap-4 bg-slate-800 p-4[\s\S]*?<\/div>\s*<\/div>`;/,
    `previewDiv.innerHTML += \`${classicActiveTemplate('publicUrl', 'titleToRender', 'author', 'dateStr', 'file.name', 'fieldId')}\`;`
);

// Regex replace in restoreFile
content = content.replace(
    /el\.innerHTML = `\n\s*<div class="flex items-center gap-3 overflow-hidden flex-1">[\s\S]*?<\/div>`;/,
    // Note: restoreFile already has the outer container `el`, so we just replace its innerHTML.
    `el.innerHTML = \`
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
        <button type="button" onclick="editFileTitlePrompt('\${fieldId}', '\${fileUrl}')" class="text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">edit</span> Editar
        </button>
        <a href="\${fileUrl}" target="_blank" class="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">visibility</span> Abrir
        </a>
        <button type="button" onclick="removeFile('\${fieldId}', '\${fileUrl}', '\${title}')" class="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
            <span class="material-symbols-outlined text-[16px]">delete</span> Excluir
        </button>
    </div>\`;`
);

// Also need to fix renderCustomFields for read-only view
// Wait, in renderCustomFields, it was using the new layout too.
content = content.replace(
    /html \+= `\n\s*<div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700\/60 shadow-sm w-full mb-2">[\s\S]*?<\/div>\s*<\/div>`;/,
    `html += \`
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
    </div>\`;`
);

// We need to restore el.className in restoreFile
content = content.replace(
    /el\.className = "flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700\/60 shadow-sm hover:shadow-md transition-shadow w-full";/,
    `el.className = "flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm";`
);

// We need to revert className in removeFile (when moving to deleted state)
content = content.replace(
    /el\.className = "flex items-center justify-between gap-4 bg-slate-900\/50 p-4 rounded-xl border border-red-200 dark:border-red-900\/30 w-full opacity-75";/,
    `el.className = "flex flex-col sm:flex-row items-center gap-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800 w-full opacity-75 shadow-sm";`
);

content = content.replace(
    /el\.innerHTML = `\n\s*<div class="flex items-center gap-3 overflow-hidden flex-1">[\s\S]*?<\/div>`;/g,
    `el.innerHTML = \`
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
    <button type="button" onclick="restoreFile('\${fieldId}', '\${fileUrl}')" class="text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
        <span class="material-symbols-outlined text-[16px]">undo</span> Restaurar
    </button>\`;`
);

fs.writeFileSync('src/customFields.js', content, 'utf8');
console.log('Reverted to classic layout!');
