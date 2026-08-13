const fs = require('fs');

let mainJs = fs.readFileSync('src/main.js', 'utf8');

// 1. Patch fetchDynamicForm
const fetchFormRegex = /let dynamicFormSchema = null;[\s\S]*?fetchDynamicForm\(\);/;
const newFetchForm = `let allForms = [];
async function fetchDynamicForm() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('forms').select('*').order('created_at', { ascending: false });
            if (data) {
                allForms = data;
                console.log("All Forms loaded from Supabase:", allForms);
                populateFormSelects();
            }
        } catch(e) { console.error(e); }
    } else {
        const saved = localStorage.getItem('constructive_forms');
        if (saved) {
            allForms = JSON.parse(saved);
            populateFormSelects();
        }
    }
}
function populateFormSelects() {
    const selects = ['theme-cadastro-type', 'edit-theme-cadastro-type', 'global-import-cadastro-type'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            let html = '<option value="">Padrão Genérico</option>';
            allForms.forEach(f => {
                html += \`<option value="\${f.id}">\${f.title || f.name}</option>\`;
            });
            el.innerHTML = html;
        }
    });
}
fetchDynamicForm();`;
mainJs = mainJs.replace(fetchFormRegex, newFetchForm);

// 2. Patch saveNewTheme
mainJs = mainJs.replace(
    /const geomType = document.getElementById\('theme-geometry'\).value;/,
    `const geomType = document.getElementById('theme-geometry').value;
    const formId = document.getElementById('theme-cadastro-type').value;`
);
mainJs = mainJs.replace(
    /themes\.push\(\{ id, name, color, geomType, icon, features: \[\] \}\);/,
    `themes.push({ id, name, color, geomType, icon, formId, features: [] });`
);

// 3. Patch openEditThemeModal
mainJs = mainJs.replace(
    /document\.getElementById\('edit-theme-disp2-input'\)\.value = theme\.displayField2 \|\| '';/,
    `document.getElementById('edit-theme-disp2-input').value = theme.displayField2 || '';
    if(document.getElementById('edit-theme-cadastro-type')) {
        document.getElementById('edit-theme-cadastro-type').value = theme.formId || '';
    }`
);

// 4. Patch saveEditedTheme
mainJs = mainJs.replace(
    /const disp2 = document\.getElementById\('edit-theme-disp2-input'\)\.value;/,
    `const disp2 = document.getElementById('edit-theme-disp2-input').value;
    const formId = document.getElementById('edit-theme-cadastro-type') ? document.getElementById('edit-theme-cadastro-type').value : '';`
);
mainJs = mainJs.replace(
    /theme\.displayField2 = disp2;/,
    `theme.displayField2 = disp2;
    theme.formId = formId;`
);

// 5. Patch confirmGlobalImport
mainJs = mainJs.replace(
    /const name = document\.getElementById\('global-import-theme-name'\)\.value\.trim\(\);/,
    `const name = document.getElementById('global-import-theme-name').value.trim();
    const formId = document.getElementById('global-import-cadastro-type') ? document.getElementById('global-import-cadastro-type').value : '';`
);
mainJs = mainJs.replace(
    /themes\.push\(\{ id, name, color, geomType, icon, features: \[\] \}\);/,
    `themes.push({ id, name, color, geomType, icon, formId, features: [] });`
); // Note: global import uses the same exact push string, so replace might hit the first one again if we use a global regex.
// Let's be safer with confirmGlobalImport
mainJs = mainJs.replace(
    /function confirmGlobalImport\(\) \{[\s\S]*?const id = 'theme_' \+ Date\.now\(\);[\s\S]*?themes\.push\(\{ id, name, color, geomType, icon, features: \[\] \}\);/g,
    function(match) {
        return match.replace(
            `themes.push({ id, name, color, geomType, icon, features: [] });`,
            `themes.push({ id, name, color, geomType, icon, formId, features: [] });`
        );
    }
);

// 6. Patch renderFeatureInfo
const renderInfoRegex = /function renderFeatureInfo\(\) \{[\s\S]*?const properties = activeFeatureLayer\.feature\.properties;/;
mainJs = mainJs.replace(renderInfoRegex, (match) => {
    return match + `
    const themeId = properties.themeId;
    const theme = themes.find(t => t.id === themeId);
    
    let dynamicFormSchema = null;
    if (theme && theme.formId) {
        const form = allForms.find(f => f.id === theme.formId);
        if (form) dynamicFormSchema = form.schema || form.tabs;
    }
`;
});


fs.writeFileSync('src/main.js', mainJs);
console.log('src/main.js patched successfully');
