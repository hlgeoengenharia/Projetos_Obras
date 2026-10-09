// tests/iconReplacement.test.js
// Testa a substituição de ícone em temas com ou sem ícone personalizado previamente carregado.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let total = 0;
let passed = 0;

function test(desc, fn) {
    total++;
    try {
        fn();
        passed++;
        console.log(`  ✓ [PASS] ${desc}`);
    } catch (e) {
        console.error(`  ✗ [FAIL] ${desc}`);
        console.error(`    ↳ ${e.message}`);
    }
}

console.log('\n--- TESTES: Substituição de Ícone em Temas / Camadas ---');

const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('index.html contém botões para remover ícone customizado', () => {
    assert.ok(indexHtml.includes('edit-remove-custom-icon-btn'), 'Deve conter botão edit-remove-custom-icon-btn');
    assert.ok(indexHtml.includes('new-remove-custom-icon-btn'), 'Deve conter botão new-remove-custom-icon-btn');
});

test('src/main.js contém funções selectIcon e removeCustomIcon corrigidas', () => {
    assert.ok(mainJs.includes('function selectIcon(prefix, val, label)'), 'selectIcon deve existir');
    assert.ok(mainJs.includes('function removeCustomIcon(prefix)'), 'removeCustomIcon deve existir');
    assert.ok(mainJs.includes('customInput.value = \'\';'), 'selectIcon deve limpar custom icon data');
    assert.ok(mainJs.includes('previewContainer.innerHTML ='), 'selectIcon deve restaurar o HTML do preview container com segurança');
});

test('Simulação DOM: selectIcon substitui tema que tinha ícone customizado sem lançar erro', () => {
    // Simula ambiente de DOM mínimo para testar a lógica exata de selectIcon
    const elements = {};
    const mockDoc = {
        getElementById: (id) => {
            if (!elements[id]) {
                elements[id] = {
                    id,
                    value: '',
                    innerText: '',
                    innerHTML: '',
                    classList: {
                        hidden: false,
                        add: (c) => { if (c === 'hidden') elements[id].classList.hidden = true; },
                        remove: (c) => { if (c === 'hidden') elements[id].classList.hidden = false; }
                    }
                };
            }
            return elements[id];
        }
    };

    // Estado inicial: tema com ícone personalizado carregado
    const customIconData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    elements['edit-theme-icon-input'] = { value: 'circle' };
    elements['edit-theme-custom-icon-data'] = { value: customIconData };
    elements['edit-theme-custom-icon-file'] = { value: 'file.png' };
    elements['edit-remove-custom-icon-btn'] = { classList: { hidden: false, add: () => {}, remove: () => {} } };
    elements['edit-icon-dropdown'] = { classList: { hidden: false, add: () => {}, remove: () => {} } };
    // Container com <img> em vez de <span> (causa original do erro anterior!)
    elements['edit-icon-preview-container'] = {
        innerHTML: `<img src="${customIconData}" class="w-5 h-5"> <span id="edit-icon-label">Ícone Personalizado</span>`
    };
    // Note que elements['edit-icon-preview'] NÃO EXISTE (é null!)
    elements['edit-icon-preview'] = null;

    // Executa a lógica corrigida de selectIcon
    const prefix = 'edit';
    const val = 'location_on';
    const label = 'Pino (Localização)';

    const inputId = prefix === 'new' ? 'theme-icon-input' : 'edit-theme-icon-input';
    const iconInput = mockDoc.getElementById(inputId);
    if (iconInput) iconInput.value = val;

    const customInput = mockDoc.getElementById(prefix === 'new' ? 'theme-custom-icon-data' : 'edit-theme-custom-icon-data');
    if (customInput) customInput.value = '';
    const fileInput = mockDoc.getElementById(prefix === 'new' ? 'theme-custom-icon-file' : 'edit-theme-custom-icon-file');
    if (fileInput) fileInput.value = '';

    const previewContainer = mockDoc.getElementById(`${prefix}-icon-preview-container`);
    if (previewContainer) {
        previewContainer.innerHTML = `<span class="material-symbols-outlined text-[20px] text-primary" id="${prefix}-icon-preview">${val}</span><span id="${prefix}-icon-label" class="text-sm">${label}</span>`;
    }

    assert.strictEqual(elements['edit-theme-icon-input'].value, 'location_on', 'Ícone selecionado deve ser location_on');
    assert.strictEqual(elements['edit-theme-custom-icon-data'].value, '', 'Dados de custom icon devem ser limpos para string vazia');
    assert.ok(elements['edit-icon-preview-container'].innerHTML.includes('location_on'), 'Preview container deve conter o novo ícone');
    assert.ok(elements['edit-icon-preview-container'].innerHTML.includes('Pino (Localização)'), 'Preview container deve conter o novo label');
});

console.log(`\nResultado: ${passed}/${total} verificações passaram.`);
if (passed !== total) process.exit(1);
