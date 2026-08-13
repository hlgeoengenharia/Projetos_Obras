const fs = require('fs');

// 1. Add scripts to settings.html
let html = fs.readFileSync('settings.html', 'utf8');
if (!html.includes('src="/src/formRenderer.js"')) {
    html = html.replace(
        '<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>',
        '<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>\n<script src="/src/customFields.js"></script>\n<script src="/src/formRenderer.js"></script>'
    );
}

// 2. Replace previewForm
const lines = html.split('\n');
const newLines = [];
let skip = false;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('function previewForm(id) {')) {
        skip = true;
        newLines.push('    function previewForm(id) {');
        newLines.push('      const form = forms.find(f => f.id === id);');
        newLines.push('      if (!form) return;');
        newLines.push('      document.getElementById(\'preview-title\').innerText = form.name;');
        newLines.push('      const container = document.getElementById(\'preview-container\');');
        newLines.push('      container.innerHTML = \'\';');
        newLines.push('      if (typeof window.renderDynamicForm === \'function\') {');
        newLines.push('          if (!window.mockAttachments) window.mockAttachments = {};');
        newLines.push('          window.renderDynamicForm(form.tabs, {}, true, \'preview-container\', { isPreview: true });');
        newLines.push('      } else { container.innerHTML = \'<p>Erro ao carregar formRenderer</p>\'; }');
        newLines.push('      document.getElementById(\'forms-view\').classList.add(\'hidden\');');
        newLines.push('      document.getElementById(\'form-builder-view\').classList.add(\'hidden\');');
        newLines.push('      document.getElementById(\'form-preview-view\').classList.remove(\'hidden\');');
        newLines.push('    }');
        continue;
    }
    if (skip && lines[i].includes('function closePreviewForm() {')) {
        skip = false;
    }
    if (!skip) {
        newLines.push(lines[i]);
    }
}

fs.writeFileSync('settings.html', newLines.join('\n'));
console.log('settings.html updated');
