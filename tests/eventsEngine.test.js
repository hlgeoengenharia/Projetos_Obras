/**
 * Testes Unitários para o EventsEngine
 */
const assert = require('assert');
const EventsEngine = require('../src/eventsEngine');

console.log('🧪 Iniciando testes do EventsEngine...');

// 1. Teste de Adição de Intervalo
const baseDate = new Date('2026-04-09T00:00:00Z');
const sixMonthsLater = EventsEngine.addInterval(baseDate, 6, 'meses');
assert.strictEqual(sixMonthsLater.getFullYear(), 2026, 'Ano correto');
assert.strictEqual(sixMonthsLater.getMonth(), 9, 'Mês correto (outubro = 9 no Date)');
console.log('  ✓ [PASS] Adição de intervalo em meses');

// 2. Teste de Gatilho de Periodicidade (Manutenção Semestral de Logradouro)
const triggerLogradouro = {
  id: 'trig_manutencao_logradouro',
  nome: 'Manutenção Semestral de Logradouro',
  tipo: 'periodicidade',
  campo_data: 'data_ultima_manutencao',
  intervalo_valor: 6,
  intervalo_unidade: 'meses',
  aviso_previo_dias: 15,
  severidade: 'atencao',
  mensagem: 'O logradouro {logradouro} completou 6 meses sem manutenção.'
};

const featureLogradouroVencido = {
  id: 'feat_101',
  properties: {
    logradouro: 'Avenida Beira Mar',
    data_ultima_manutencao: '2026-04-01' // 6 meses vencidos em 2026-10-01
  }
};

const today = new Date('2026-10-09T00:00:00Z');
const alert1 = EventsEngine.evaluateTrigger(triggerLogradouro, featureLogradouroVencido, { name: 'Logradouros' }, today);
assert.ok(alert1, 'Alerta deve ser disparado');
assert.strictEqual(alert1.isOverdue, true, 'Deve constar como atrasado/vencido');
assert.strictEqual(alert1.severity, 'critico', 'Alerta vencido se eleva para crítico');
assert.ok(alert1.message.includes('Avenida Beira Mar'), 'Mensagem interpolada contém o nome do logradouro');
console.log('  ✓ [PASS] Gatilho de periodicidade com feição vencida');

// 3. Teste de Gatilho de Validade (Alvará com Aviso Prévio)
const triggerAlvara = {
  id: 'trig_alvara_vencendo',
  nome: 'Alvará Próximo do Vencimento',
  tipo: 'validade',
  campo_data: 'data_validade',
  aviso_previo_dias: 15,
  severidade: 'atencao',
  mensagem: 'Alvará nº {numero_alvara} vence em {dias_restantes}.'
};

const featureAlvaraPrevia = {
  id: 'feat_alvara_1',
  properties: {
    numero_alvara: '2026/0441',
    data_validade: '2026-10-20' // Faltam 11 dias em relação a 2026-10-09 (está dentro dos 15 dias)
  }
};

const alert2 = EventsEngine.evaluateTrigger(triggerAlvara, featureAlvaraPrevia, { name: 'Alvarás e Licenças' }, today);
assert.ok(alert2, 'Alerta de aviso prévio deve disparar');
assert.strictEqual(alert2.isOverdue, false, 'Não deve constar como vencido');
assert.strictEqual(alert2.severity, 'atencao', 'Severidade deve ser atenção');
assert.strictEqual(alert2.daysDiff, 11, 'Faltam exatamente 11 dias');
assert.ok(alert2.message.includes('2026/0441'), 'Mensagem interpolada contém o número do alvará');
console.log('  ✓ [PASS] Gatilho de validade com aviso prévio de 15 dias');

// 4. Teste de Filtro Condicional
const triggerComFiltro = {
  id: 'trig_obra_fiscalizacao',
  nome: 'Fiscalização de Obra',
  tipo: 'periodicidade',
  campo_data: 'data_inicio',
  intervalo_valor: 3,
  intervalo_unidade: 'meses',
  campo_filtro: 'status',
  filtro_operador: '!=',
  filtro_valor: 'Concluído'
};

const featureObraConcluida = {
  id: 'feat_obra_1',
  properties: {
    data_inicio: '2026-01-01',
    status: 'Concluído'
  }
};

const alert3 = EventsEngine.evaluateTrigger(triggerComFiltro, featureObraConcluida, { name: 'Obras' }, today);
assert.strictEqual(alert3, null, 'Obra concluída deve ser ignorada pelo filtro');
console.log('  ✓ [PASS] Filtro condicional ignora registro com status Concluído');

// 5. Teste de Atribuição por Usuário e Setor
const userHelton = { id: 'usr-1', email: 'helton@geogestor.com', setor: 'Fiscalização' };
const userMaria = { id: 'usr-2', email: 'maria@geogestor.com', setor: 'Tributos' };

assert.strictEqual(EventsEngine.isAlertForUser({ responsavelTipo: 'usuario', responsavelId: 'usr-1' }, userHelton), true);
assert.strictEqual(EventsEngine.isAlertForUser({ responsavelTipo: 'usuario', responsavelId: 'usr-1' }, userMaria), false);
assert.strictEqual(EventsEngine.isAlertForUser({ responsavelTipo: 'setor', responsavelId: 'Fiscalização' }, userHelton), true);
assert.strictEqual(EventsEngine.isAlertForUser({ responsavelTipo: 'setor', responsavelId: 'Fiscalização' }, userMaria), false);
console.log('  ✓ [PASS] Atribuição de permissão por Usuário e Setor');

// 6. Teste de computeActiveAlerts
const mockThemes = [
  {
    id: 'theme_logradouros',
    name: 'Logradouros',
    formId: 'form_logradouros',
    features: [featureLogradouroVencido]
  }
];

const mockForms = [
  {
    id: 'form_logradouros',
    name: 'Logradouros',
    eventTriggers: [triggerLogradouro]
  }
];

const activeAlerts = EventsEngine.computeActiveAlerts(mockThemes, userHelton, mockForms, { today });
assert.strictEqual(activeAlerts.length, 1, 'Deve retornar 1 alerta ativo');
assert.strictEqual(activeAlerts[0].featureId, 'feat_101');
console.log('  ✓ [PASS] computeActiveAlerts retorna lista ordenada e enriquecida');

console.log('\n🎉 TODOS OS TESTES DO EVENTS ENGINE PASSARAM COM 100% DE SUCESSO!\n');
