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

// 7. Teste de Normalização Resiliente de Propriedades (Caso Real: "DATA DA ÚLTIMA MANUTENÇÃO" vs "[Infraestrutura] Data da última manutenção")
const triggerUserCase = {
  id: 'trig_vias_manutencao',
  nome: 'Manutenção de vias',
  tipo: 'periodicidade',
  campo_data: 'data_da_ultima_manutencao',
  campo_data_label: '[Infraestrutura] Data da última manutenção',
  intervalo_valor: 6,
  intervalo_unidade: 'meses',
  aviso_previo_dias: 15,
  severidade: 'atencao',
  mensagem: 'A via {Nome} está com manutenção pendente.'
};

const featureRuaEribaldo = {
  id: 'feat_rua_eribaldo',
  properties: {
    'Nome': 'RUA ERIBALDO DA SILVA ARAUJO',
    'DATA DA ÚLTIMA MANUTENÇÃO': '2026-01-02'
  }
};

const alertUserCase = EventsEngine.evaluateTrigger(triggerUserCase, featureRuaEribaldo, { name: 'Logradouro' }, today);
assert.ok(alertUserCase, 'Alerta da rua com manutenção em janeiro deve ser identificado com sucesso');
assert.strictEqual(alertUserCase.isOverdue, true, 'Manutenção de janeiro de 2026 está vencida em outubro de 2026');
assert.strictEqual(alertUserCase.severity, 'critico', 'Status vencido deve ser crítico');
assert.ok(alertUserCase.message.includes('RUA ERIBALDO DA SILVA ARAUJO'), 'Mensagem deve conter o nome da via');
console.log('  ✓ [PASS] Normalização resiliente: "DATA DA ÚLTIMA MANUTENÇÃO" identificado com sucesso');

// 8. Teste de Snooze / Adiar (mantém no sino com isSnoozed=true, exclui apenas do mapa)
if (typeof localStorage === 'undefined') {
  const store = {};
  global.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
}

EventsEngine.snoozeAlert('trig_manutencao_logradouro_feat_101', 7, 'usr-1');
assert.strictEqual(EventsEngine.isAlertSnoozed('trig_manutencao_logradouro_feat_101', 'usr-1'), true, 'Alerta deve constar como adiado');

// No sino: includeSnoozed: true -> Retorna o alerta e marca alert.isSnoozed = true
const alertsNoSino = EventsEngine.computeActiveAlerts(mockThemes, userHelton, mockForms, { today, includeSnoozed: true });
assert.strictEqual(alertsNoSino.length, 1, 'Deve continuar aparecendo no sino');
assert.strictEqual(alertsNoSino[0].isSnoozed, true, 'Deve estar marcado como isSnoozed=true');

// No mapa: includeSnoozed: false -> Exclui o alerta do mapa
const alertsNoMapa = EventsEngine.computeActiveAlerts(mockThemes, userHelton, mockForms, { today, includeSnoozed: false });
assert.strictEqual(alertsNoMapa.length, 0, 'Deve ser ocultado do mapa enquanto adiado');

// Reativação
EventsEngine.unsnoozeAlert('trig_manutencao_logradouro_feat_101', 'usr-1');
assert.strictEqual(EventsEngine.isAlertSnoozed('trig_manutencao_logradouro_feat_101', 'usr-1'), false, 'Alerta não deve mais estar adiado após reativar');
console.log('  ✓ [PASS] Snooze: mantido no sino com contagem e ocultado apenas do mapa');

// 9. Teste de Ciente e Reversão "Trazer de volta"
EventsEngine.markAlertDismissed('trig_manutencao_logradouro_feat_101', 'usr-1');
assert.strictEqual(EventsEngine.isAlertDismissed('trig_manutencao_logradouro_feat_101', 'usr-1'), true, 'Alerta deve estar marcado como ciente');

// Alertas pendentes (sem includeDismissed) não devem incluir o alerta ciente
const alertsPendentes = EventsEngine.computeActiveAlerts(mockThemes, userHelton, mockForms, { today, includeDismissed: false });
assert.strictEqual(alertsPendentes.length, 0, 'Alerta ciente não deve estar na lista de pendentes');

// Aba Ciente (com includeDismissed: true) inclui o alerta com alert.isDismissed = true
const alertsAbaCiente = EventsEngine.computeActiveAlerts(mockThemes, userHelton, mockForms, { today, includeDismissed: true });
assert.strictEqual(alertsAbaCiente.length, 1, 'Deve ser mantido no cache global para a aba Ciente');
assert.strictEqual(alertsAbaCiente[0].isDismissed, true, 'Propriedade isDismissed deve ser true');

// Ação do usuário: "Trazer de volta" (unmarkAlertDismissed)
EventsEngine.unmarkAlertDismissed('trig_manutencao_logradouro_feat_101', 'usr-1');
assert.strictEqual(EventsEngine.isAlertDismissed('trig_manutencao_logradouro_feat_101', 'usr-1'), false, 'Alerta não deve mais estar marcado como ciente');

const alertsReativados = EventsEngine.computeActiveAlerts(mockThemes, userHelton, mockForms, { today, includeDismissed: false });
assert.strictEqual(alertsReativados.length, 1, 'Alerta deve voltar para a lista de alertas ativos');
assert.strictEqual(alertsReativados[0].isDismissed, false, 'Propriedade isDismissed deve ser false');
console.log('  ✓ [PASS] Aba Ciente: arquivamento com Dar Ciente e restauração com Trazer de volta');

// 10. Funções exportadas para manipulação e drag do Drawer
assert.strictEqual(typeof EventsEngine.initDraggableAlertsDrawer, 'function', 'initDraggableAlertsDrawer deve estar exportada');
assert.strictEqual(typeof EventsEngine.unacknowledgeAlert, 'function', 'unacknowledgeAlert deve estar exportada');
console.log('  ✓ [PASS] Métodos de interface (arrastar drawer e reversão de ciente) exportados');

// 11. Renderização de pulso vetorial no mapa (linhas e polígonos)
const mockLayersAdded = [];
global.L = {
  layerGroup: () => ({
    addTo: () => {},
    clearLayers: () => { mockLayersAdded.length = 0; },
    addLayer: (layer) => { mockLayersAdded.push(layer); }
  }),
  geoJSON: (feat, opts) => {
    const style = typeof opts.style === 'function' ? opts.style(feat) : opts.style;
    return {
      _isGeoJson: true,
      feature: feat,
      style: style,
      on: () => {},
      bindTooltip: () => {}
    };
  },
  divIcon: (opts) => opts,
  marker: (coords, opts) => ({
    _isMarker: true,
    coords: coords,
    bindTooltip: () => {}
  })
};

const featureLinhaVencida = {
  id: 'feat_via_teste',
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [[-34.83, -7.02], [-34.84, -7.03]]
  },
  properties: {
    logradouro: 'Avenida Principal',
    data_ultima_manutencao: '2026-01-10'
  }
};

global.window = {
  map: {
    addLayer: () => {},
    hasLayer: () => true
  },
  themes: [
    {
      id: 'theme_vias_vetor',
      name: 'Logradouros',
      formId: 'form_logradouros',
      features: [featureLinhaVencida]
    }
  ],
  forms: mockForms,
  currentUserProfile: userHelton
};

EventsEngine.refreshAlerts();
EventsEngine.updateMapHaloGlow();

const hasVectorPulse = mockLayersAdded.some(l => l._isGeoJson && l.style && l.style.className && l.style.className.includes('alert-feature-pulse'));
assert.ok(hasVectorPulse, 'Deve renderizar a própria feição vetorial com classe de animação pulsante');
console.log('  ✓ [PASS] Efeito de pulso cartográfico diretamente no traçado/contorno da feição');

// 10. Teste das 3 Mensagens Padronizadas por Situação com @ e Tempo Dinâmico
const triggerComTresMensagens = {
  id: 'trig_tres_msgs',
  nome: 'Monitoramento com 3 Mensagens',
  tipo: 'periodicidade',
  campo_data: 'data_vistoria',
  intervalo_valor: 6,
  intervalo_unidade: 'meses',
  aviso_previo_dias: 15,
  mensagem_em_dia: '@Nome está em conformidade com o cronograma regular.',
  mensagem_atencao: 'Atenção: @Nome entrará em período de vencimento em x dias.',
  mensagem_critico: '@Nome atingiu o prazo limite em x dias e requer manutenção/vistoria urgente.'
};

// Cenário A: Alerta Crítico (vencido há 90 dias / 3 meses)
const featCritica = {
  id: 'feat_critica',
  properties: {
    Nome: 'Rua das Flores',
    data_vistoria: '2026-01-09' // Venceu em 2026-07-09 (+92 dias atrás de 2026-10-09)
  }
};
const alertCritico = EventsEngine.evaluateTrigger(triggerComTresMensagens, featCritica, { name: 'Vias' }, today);
assert.ok(alertCritico, 'Alerta crítico deve disparar');
assert.strictEqual(alertCritico.severity, 'critico');
assert.ok(alertCritico.message.includes('Rua das Flores'), 'Substitui @Nome pelo nome da feição');
assert.ok(alertCritico.message.includes('3 meses') || alertCritico.message.includes('dias'), 'Substitui x dias por cálculo inteligente de meses/dias');
assert.ok(alertCritico.message.includes('requer manutenção/vistoria urgente'), 'Usa template mensagem_critico');
console.log('  ✓ [PASS] Alerta crítico: utiliza mensagem_critico com @Nome e cálculo de x dias');

// Cenário B: Alerta de Atenção (vencendo em 10 dias)
const featAtencao = {
  id: 'feat_atencao',
  properties: {
    Nome: 'Avenida Brasil',
    data_vistoria: '2026-04-19' // Vence em 2026-10-19 (+10 dias em relação a 2026-10-09)
  }
};
const alertAtencao = EventsEngine.evaluateTrigger(triggerComTresMensagens, featAtencao, { name: 'Vias' }, today);
assert.ok(alertAtencao, 'Alerta de atenção deve disparar');
assert.strictEqual(alertAtencao.severity, 'atencao');
assert.ok(alertAtencao.message.includes('Avenida Brasil'), 'Substitui @Nome pelo nome da feição');
assert.ok(alertAtencao.message.includes('em 10 dias'), 'Substitui em x dias por em 10 dias');
assert.ok(alertAtencao.message.includes('período de vencimento'), 'Usa template mensagem_atencao');
console.log('  ✓ [PASS] Alerta de atenção: utiliza mensagem_atencao com @Nome e cálculo de x dias');

// Cenário C: Gatilho Legado (criado antes, com texto antigo "A feição {nome} atingiu o prazo estabelecido em {data_limite}.")
const triggerLegado = {
  id: 'trig_legado',
  nome: 'Gatilho Antigo',
  tipo: 'validade',
  campo_data: 'data_validade',
  aviso_previo_dias: 15,
  severidade: 'atencao',
  mensagem: 'A feição {nome} atingiu o prazo estabelecido em {data_limite}.' // Texto legado pré-existente
};

const featLegadaAtencao = {
  id: 'feat_vitorino',
  properties: {
    Nome: 'Rua Vitorino Cardoso',
    data_validade: '2026-10-11' // Faltam 2 dias em relação a 2026-10-09
  }
};

const alertLegado = EventsEngine.evaluateTrigger(triggerLegado, featLegadaAtencao, { name: 'Logradouro' }, today);
assert.ok(alertLegado, 'Alerta deve disparar');
assert.strictEqual(alertLegado.severity, 'atencao');
assert.ok(alertLegado.message.includes('Rua Vitorino Cardoso'), 'Nome interpolado');
assert.ok(alertLegado.message.includes('em 2 dias'), 'Calcula dinamicamente a contagem dos dias restantes (em 2 dias)');
assert.ok(alertLegado.message.includes('período de vencimento'), 'Assume novo padrão inteligente de Atenção');
console.log('  ✓ [PASS] Gatilho legado: migrado automaticamente para o padrão de Atenção com contagem de dias');

console.log('\n🎉 TODOS OS TESTES DO EVENTS ENGINE PASSARAM COM 100% DE SUCESSO!\n');


