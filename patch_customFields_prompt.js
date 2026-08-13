const fs = require('fs');

let content = fs.readFileSync('src/customFields.js', 'utf8');

// 1. Ask for title before upload
const oldUploadStart = `async function handleSupabaseUpload(event, fieldId, isPhoto) {\n    const file = event.target.files[0];\n    if (!file) return;\n    \n    if (!supabaseClient) {`;
const newUploadStart = `async function handleSupabaseUpload(event, fieldId, isPhoto) {\n    const file = event.target.files[0];\n    if (!file) return;\n    \n    let inputTitle = '';\n    if (!isPhoto) {\n        while (!inputTitle || inputTitle.trim() === '') {\n            inputTitle = prompt(\`Digite um título para o documento:\\n(Arquivo: \${file.name})\`);\n            if (inputTitle === null) {\n                event.target.value = '';\n                return;\n            }\n        }\n        inputTitle = inputTitle.trim();\n    }\n\n    if (!supabaseClient) {`;
content = content.replace(oldUploadStart, newUploadStart);

// 2. Add title to JSON array
const oldPush = `files.push({ \n            name: file.name, \n            title: '', `;
const newPush = `files.push({ \n            name: file.name, \n            title: isPhoto ? '' : inputTitle, `;
content = content.replace(oldPush, newPush);

// 3. Render the title in HTML preview
const oldHtmlPreview = `<input type="text" value="" onchange="updateFileTitle('\${fieldId}', '\${publicUrl}', this.value)" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Digite um título obrigatório">`;
const newHtmlPreview = `<input type="text" value="\${inputTitle}" onchange="updateFileTitle('\${fieldId}', '\${publicUrl}', this.value)" class="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Digite um título obrigatório">`;
content = content.replace(oldHtmlPreview, newHtmlPreview);

fs.writeFileSync('src/customFields.js', content, 'utf8');
console.log('customFields.js prompt updated!');
