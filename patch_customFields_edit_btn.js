const fs = require('fs');

let content = fs.readFileSync('src/customFields.js', 'utf8');

// 1. In Edit Mode generateFeatureInputHtml
const oldEditInput = `<input type="text" value="\${title || ''}" onchange="updateFileTitle('\${f.id}', '\${url}', this.value)" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Digite um título obrigatório">\n                                        <div class="text-[10px] text-slate-400 mt-1 truncate" title="\${name}">Arq: \${name}</div>`;
const newEditInput = `<div class="font-semibold text-sm truncate" title="\${title}">\${title || 'Sem título'}</div>\n                                        <div class="text-[10px] text-slate-400 mt-1 truncate" title="\${name}">Arq: \${name}</div>`;
content = content.replace(oldEditInput, newEditInput);

const oldEditButtons = `<a href="\${url}" target="_blank"`;
const newEditButtons = `<button type="button" onclick="editFileTitlePrompt('\${f.id}', '\${url}')" class="text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">\n                                            <span class="material-symbols-outlined text-[14px]">edit</span> Editar\n                                        </button>\n                                        <a href="\${url}" target="_blank"`;
// We only want to replace it in the 'not deleted' branch of Edit Mode
// The old Edit Mode is basically this exact string, but let's be careful.
// Let's use a regex to replace it inside generateFeatureInputHtml edit mode block.
// Wait, the easiest way is just to replace all `<a href="\${url}" target="_blank"` that are within the inline row with the edit button.
// Let's look at the occurrences. There is one in View Mode, one in Edit Mode (not deleted), one in Edit Mode (deleted - wait deleted doesn't have a tag), one in handleUpload preview, one in restoreFile.
// Let's replace ALL of them EXCEPT the one in View Mode.
// Actually, it's safer to just replace them specifically.

content = content.replace(
    /<div class="flex items-center gap-2">\s*<a href="\${url}" target="_blank"/g,
    `<div class="flex items-center gap-2">\n                                        <button type="button" onclick="editFileTitlePrompt('\${f.id}', '\${url}')" class="text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">\n                                            <span class="material-symbols-outlined text-[14px]">edit</span> Editar\n                                        </button>\n                                        <a href="\${url}" target="_blank"`
);

// 2. handleSupabaseUpload HTML Preview
const oldPreviewInput = `<input type="text" value="\${inputTitle}" onchange="updateFileTitle('\${fieldId}', '\${publicUrl}', this.value)" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Digite um título obrigatório">\n                    <div class="text-[10px] text-slate-400 mt-1 truncate" title="\${file.name}">Arq: \${file.name}</div>`;
const newPreviewInput = `<div class="font-semibold text-sm truncate" title="\${inputTitle}">\${inputTitle || 'Sem título'}</div>\n                    <div class="text-[10px] text-slate-400 mt-1 truncate" title="\${file.name}">Arq: \${file.name}</div>`;
content = content.replace(oldPreviewInput, newPreviewInput);

content = content.replace(
    /<div class="flex items-center gap-2">\s*<a href="\${publicUrl}" target="_blank"/g,
    `<div class="flex items-center gap-2">\n                    <button type="button" onclick="editFileTitlePrompt('\${fieldId}', '\${publicUrl}')" class="text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">\n                        <span class="material-symbols-outlined text-[14px]">edit</span> Editar\n                    </button>\n                    <a href="\${publicUrl}" target="_blank"`
);

// 3. restoreFile HTML preview
const oldRestoreInput = `<input type="text" value="\${title}" onchange="updateFileTitle('\${fieldId}', '\${fileUrl}', this.value)" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Título do Documento">`;
const newRestoreInput = `<div class="font-semibold text-sm truncate" title="\${title}">\${title || 'Sem título'}</div>\n                <div class="text-[10px] text-slate-400 mt-1 truncate" title="\${title}">Arq Original</div>`;
// Wait, in restoreFile we don't have file.name directly, we just have 'Arquivo' or whatever was saved. 
// Let's fetch it from files map!
// `const name = f.name || 'Arquivo';`
// I'll just change restoreFile function manually below.

// Let's add the editFileTitlePrompt function
if (!content.includes('function editFileTitlePrompt')) {
    content += `\n
window.editFileTitlePrompt = function(fieldId, fileUrl) {
    const hiddenInput = document.querySelector(\`input[data-key="\${fieldId}"]\`);
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
        const previewDiv = document.getElementById(\`file-preview-\${fieldId}\`);
        const el = previewDiv.querySelector(\`[data-url="\${fileUrl}"]\`);
        if (el) {
            const titleDiv = el.querySelector('.font-semibold.text-sm');
            if (titleDiv) {
                titleDiv.innerText = newTitle.trim();
                titleDiv.title = newTitle.trim();
            }
        }
    }
};
`;
}

fs.writeFileSync('src/customFields.js', content, 'utf8');
console.log('customFields.js patch edit btn applied!');
