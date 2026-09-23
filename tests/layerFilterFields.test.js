const assert = require('assert');
const fs = require('fs');

console.log('🧪 Iniciando testes de personalização e referência de abas nos campos de filtro...');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const mainJs = fs.readFileSync('src/main.js', 'utf8');

// 1. Verifica presença do modal no index.html
assert(indexHtml.includes('id="filter-fields-modal"'), 'Modal filter-fields-modal deve estar presente no index.html');
assert(indexHtml.includes('id="filter-fields-modal-body"'), 'Corpo do modal filter-fields-modal-body deve existir');
assert(indexHtml.includes('saveFilterFieldsCustomSelection()'), 'Botão de salvar seleção de campos deve estar presente');
assert(indexHtml.includes('filterFieldsRestoreDefault()'), 'Botão de restaurar padrão deve estar presente');

// 2. Verifica funções e lógica no main.js
assert(mainJs.includes('function getThemeFilterCustomFieldsKey'), 'Função getThemeFilterCustomFieldsKey deve existir');
assert(mainJs.includes('function getThemeFilterCustomFields'), 'Função getThemeFilterCustomFields deve existir');
assert(mainJs.includes('function setThemeFilterCustomFields'), 'Função setThemeFilterCustomFields deve existir');
assert(mainJs.includes('window.openFilterFieldsModal = function'), 'openFilterFieldsModal deve estar exposta globalmente');
assert(mainJs.includes('window.saveFilterFieldsCustomSelection = function'), 'saveFilterFieldsCustomSelection deve estar exposta globalmente');

// 3. Testa getThemeFieldsOptions logicamente
const fakeTheme = {
    id: 'theme_test_1',
    name: 'Imóveis Orla',
    formId: 'form_test_1',
    features: [
        { properties: { extra_field: '123' } }
    ]
};

const fakeForm = {
    id: 'form_test_1',
    schema: [
        {
            id: 'tab_geral',
            title: 'Dados Gerais',
            fields: [
                { id: 'proprietario', label: 'Nome do Proprietário' },
                { id: 'cpf', label: 'CPF' }
            ]
        },
        {
            id: 'tab_juridico',
            title: 'Setor Jurídico',
            fields: [
                { id: 'processo', label: 'Número do Processo' }
            ]
        }
    ]
};

// Avalia a função getThemeFieldsOptions em escopo isolado
const mockLocalStorage = {};
global.localStorage = {
    getItem: (k) => mockLocalStorage[k] || null,
    setItem: (k, v) => { mockLocalStorage[k] = String(v); },
    removeItem: (k) => { delete mockLocalStorage[k]; }
};
global.allForms = [fakeForm];
global.currentUserProfile = { id: 'user_qa_1' };
global.activeMunicipioId = 'mun_cabedelo';
global.getThemeFieldLabel = () => null;
global.getThemeFilterCustomFields = (id) => {
    const raw = mockLocalStorage[`filter_custom_fields_${global.currentUserProfile.id}_${global.activeMunicipioId}_${id}`];
    return raw ? JSON.parse(raw) : null;
};

eval(mainJs.match(/function isFilterFieldChecked\([\s\S]*?\r?\n\}/)[0]);
global.isFilterFieldChecked = isFilterFieldChecked;

const fnMatch = mainJs.match(/function getThemeFieldsOptions\(theme\)\s*\{([\s\S]*?)\r?\n\}\r?\n\r?\nfunction clearSearch/);
assert(fnMatch, 'Deve encontrar a definição de getThemeFieldsOptions em main.js');

const getThemeFieldsOptions = new Function('theme', fnMatch[1]);
global.getThemeFieldsOptions = getThemeFieldsOptions;

// Teste A: Sem personalização, exibe os campos com indicação da aba
const htmlSemFiltro = getThemeFieldsOptions(fakeTheme);
assert(htmlSemFiltro.includes('Nome do Proprietário (Dados Gerais)'), 'Deve conter "Nome do Proprietário (Dados Gerais)"');
assert(htmlSemFiltro.includes('CPF (Dados Gerais)'), 'Deve conter "CPF (Dados Gerais)"');
assert(htmlSemFiltro.includes('Número do Processo (Setor Jurídico)'), 'Deve conter "Número do Processo (Setor Jurídico)"');
assert(htmlSemFiltro.includes('extra_field'), 'Deve incluir campos extras da amostragem de feições');

// Teste B: Com personalização ativa legada/simples (apenas 'cpf')
mockLocalStorage[`filter_custom_fields_${global.currentUserProfile.id}_${global.activeMunicipioId}_${fakeTheme.id}`] = JSON.stringify(['cpf']);
const htmlComFiltro = getThemeFieldsOptions(fakeTheme);
assert(!htmlComFiltro.includes('Nome do Proprietário (Dados Gerais)'), 'Não deve exibir "Nome do Proprietário" quando filtrado');
assert(htmlComFiltro.includes('CPF (Dados Gerais)'), 'Deve exibir "CPF"');
assert(!htmlComFiltro.includes('extra_field'), 'Não deve exibir extra_field quando filtrado');

// Teste C: Com personalização ativa composta de aba de formulário ('tab_geral:::cpf')
mockLocalStorage[`filter_custom_fields_${global.currentUserProfile.id}_${global.activeMunicipioId}_${fakeTheme.id}`] = JSON.stringify(['tab_geral:::cpf']);
const htmlComFiltroComposto = getThemeFieldsOptions(fakeTheme);
assert(!htmlComFiltroComposto.includes('Nome do Proprietário (Dados Gerais)'), 'Não deve exibir "Nome do Proprietário" com filtro composto tab_geral:::cpf');
assert(htmlComFiltroComposto.includes('CPF (Dados Gerais)'), 'Deve exibir "CPF (Dados Gerais)" com filtro composto');
assert(!htmlComFiltroComposto.includes('Número do Processo (Setor Jurídico)'), 'Não deve exibir Processo com filtro composto');
assert(!htmlComFiltroComposto.includes('extra_field'), 'Não deve exibir extra_field com filtro composto');

// Teste D: Com personalização ativa de atributo próprio da camada ('outros_atributos:::extra_field')
mockLocalStorage[`filter_custom_fields_${global.currentUserProfile.id}_${global.activeMunicipioId}_${fakeTheme.id}`] = JSON.stringify(['outros_atributos:::extra_field']);
const htmlComFiltroProp = getThemeFieldsOptions(fakeTheme);
assert(!htmlComFiltroProp.includes('Nome do Proprietário (Dados Gerais)'), 'Não deve exibir formulário quando apenas extra_field');
assert(!htmlComFiltroProp.includes('CPF (Dados Gerais)'), 'Não deve exibir CPF quando apenas extra_field');
assert(htmlComFiltroProp.includes('extra_field'), 'Deve exibir extra_field quando selecionado');

console.log('✅ Todos os testes de campos do filtro de camada passaram com sucesso!');
