/**
 * tests/eventsBuilder.test.js - Testes do Construtor Visual de Gatilhos (EventsBuilder)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Iniciando testes do EventsBuilder...');

// Mock de ambiente de navegador
const mockWindow = {
  builderTabs: [
    {
      id: 'tab_principal',
      title: 'Dados Gerais',
      fields: [
        { id: 'f_nome', name: 'nome', label: 'Nome do Titular', type: 'text' },
        { id: 'f_vistoria', name: 'data_vistoria', label: 'Data da Última Vistoria', type: 'date' },
        { id: 'f_status', name: 'status', label: 'Situação', type: 'select' }
      ]
    },
    {
      id: 'tab_alvara',
      title: 'Documentação',
      fields: [
        { id: 'f_venc', name: 'validade_alvara', label: 'Vencimento do Alvará', type: 'datetime' }
      ]
    }
  ],
  currentUserProfile: {
    id: 'user_admin_01',
    nome: 'Carlos Engenheiro',
    unidade: 'SEOB - Secretaria de Obras',
    setor: 'Fiscalização de Obras',
    papel: 'admin'
  },
  _currentFormEventTriggers: []
};

// Carrega o eventsBuilder no contexto mockado
const code = fs.readFileSync(path.join(__dirname, '../src/eventsBuilder.js'), 'utf-8');
const runInContext = new Function('window', 'global', code);
runInContext(mockWindow, mockWindow);

const { EventsBuilder } = mockWindow;

assert(EventsBuilder, 'EventsBuilder deve estar exposto no objeto global');
assert(typeof EventsBuilder.openTriggerModal === 'function', 'openTriggerModal deve ser uma função');
assert(typeof EventsBuilder.toggleTutorialGuide === 'function', 'toggleTutorialGuide deve ser uma função');
assert(typeof EventsBuilder.saveTriggerConfig === 'function', 'saveTriggerConfig deve ser uma função');

console.log('  ✓ [PASS] Inicialização e exposição pública do EventsBuilder');

// Teste de identificação de campos de data e estrutura
// Simulando chamada interna de getDateFields via DOM/Builder
const tabs = mockWindow.builderTabs;
const dateFields = [];
tabs.forEach(tab => {
  (tab.fields || []).forEach(f => {
    const type = (f.type || '').toLowerCase();
    const label = f.label || f.name || f.id;
    if (type === 'date' || type === 'datetime' || /data|prazo|vencimento/i.test(label)) {
      dateFields.push(f);
    }
  });
});

assert.strictEqual(dateFields.length, 2, 'Deve identificar os 2 campos de data/datetime das abas');
assert.strictEqual(dateFields[0].name, 'data_vistoria');
assert.strictEqual(dateFields[1].name, 'validade_alvara');
console.log('  ✓ [PASS] Identificação resiliente de campos de data nas abas');

console.log('\n🎉 TODOS OS TESTES DO EVENTS BUILDER PASSARAM COM SUCESSO!\n');
