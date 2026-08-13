const fs = require('fs');

let content = fs.readFileSync('src/customFields.js', 'utf8');

// 1. handleSupabaseUpload JSON
content = content.replace(
    /title: file\.name,/g,
    `title: '',`
);

// 2. Edit Mode generateFeatureInputHtml
const oldEditInput = `<input type="text" value="\${title}" onchange="updateFileTitle('\${f.id}', '\${url}', this.value)" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Título do Documento">`;
const newEditInput = `<input type="text" value="\${title || ''}" onchange="updateFileTitle('\${f.id}', '\${url}', this.value)" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Digite um título obrigatório">\n                                        <div class="text-[10px] text-slate-400 mt-1 truncate" title="\${name}">Arq: \${name}</div>`;
content = content.replace(oldEditInput, newEditInput);

// 3. handleSupabaseUpload HTML Preview
const oldPreviewInput = `<input type="text" value="\${file.name}" onchange="updateFileTitle('\${fieldId}', '\${publicUrl}', this.value)" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Título do Documento">`;
const newPreviewInput = `<input type="text" value="" onchange="updateFileTitle('\${fieldId}', '\${publicUrl}', this.value)" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Digite um título obrigatório">\n                    <div class="text-[10px] text-slate-400 mt-1 truncate" title="\${file.name}">Arq: \${file.name}</div>`;
content = content.replace(oldPreviewInput, newPreviewInput);

// 4. View Mode generateFeatureInputHtml
// Also display the original file name in view mode just in case? Or just keep it as is.
// I'll just keep view mode as is, it shows title. But maybe add a tooltip with the original filename?
// Let's add the original filename in view mode too.
const oldViewTitle = `<div class="font-semibold text-sm truncate" title="\${title}">\${title}</div>`;
const newViewTitle = `<div class="font-semibold text-sm truncate" title="\${title}">\${title || 'Sem título'}</div>\n                                    <div class="text-[10px] text-slate-400 truncate" title="\${name}">Arq: \${name}</div>`;
content = content.replace(oldViewTitle, newViewTitle);

fs.writeFileSync('src/customFields.js', content, 'utf8');
console.log("customFields.js updated!");
