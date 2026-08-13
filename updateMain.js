const fs = require('fs');

const html = fs.readFileSync('src/main.js', 'utf8');
const lines = html.split('\n');
const newLines = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('if (dynamicFormSchema && dynamicFormSchema.length > 0) {')) {
        skip = true;
        newLines.push(lines[i]);
        newLines.push('      if (typeof window.renderDynamicForm === \'function\') {');
        newLines.push('          window.renderDynamicForm(dynamicFormSchema, properties, isFeatureEditMode, \'feature-info-content\');');
        newLines.push('          return;');
        newLines.push('      }');
        continue;
    }
    if (skip && lines[i].includes('// OLD LOGIC FALLBACK')) {
        skip = false;
        newLines.push('  }');
    }
    if (!skip) {
        newLines.push(lines[i]);
    }
}

fs.writeFileSync('src/main.js', newLines.join('\n'));
console.log('src/main.js updated');
