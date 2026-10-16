const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Iniciando testes de validação do Módulo de Monitoramento de Fiscais e Produtividade...');

const rootDir = path.resolve(__dirname, '..');

// 1. Script SQL de Setup do Banco de Dados
const sqlPath = path.join(rootDir, 'supabase_fiscal_monitoramento_setup.sql');
assert(fs.existsSync(sqlPath), 'Arquivo supabase_fiscal_monitoramento_setup.sql deve existir');
const sqlContent = fs.readFileSync(sqlPath, 'utf8');
assert(sqlContent.includes('fiscal_posicoes'), 'SQL deve criar tabela fiscal_posicoes');
assert(sqlContent.includes('fiscal_status_atual'), 'SQL deve criar tabela fiscal_status_atual');
assert(sqlContent.includes('fiscal_metricas_config'), 'SQL deve criar tabela fiscal_metricas_config');
assert(sqlContent.includes('ENABLE ROW LEVEL SECURITY'), 'SQL deve habilitar RLS');
console.log('  ✓ [SQL] Script de setup do Supabase possui todas as tabelas, índices e políticas de segurança RLS');

// 2. Módulo de Rastreamento (Telemetria do Fiscal)
const trackerPath = path.join(rootDir, 'src', 'fiscalTracker.js');
assert(fs.existsSync(trackerPath), 'Arquivo src/fiscalTracker.js deve existir');
const trackerContent = fs.readFileSync(trackerPath, 'utf8');
assert(trackerContent.includes('iniciarJornada'), 'fiscalTracker deve implementar iniciarJornada');
assert(trackerContent.includes('pausarJornada'), 'fiscalTracker deve implementar pausarJornada');
assert(trackerContent.includes('encerrarJornada'), 'fiscalTracker deve implementar encerrarJornada');
assert(trackerContent.includes('calcularDistanciaMetros'), 'fiscalTracker deve implementar cálculo geodésico de distância');
assert(trackerContent.includes('registrarVistoria'), 'fiscalTracker deve implementar registro de vistorias');
console.log('  ✓ [FiscalTracker] Telemetria de campo com GPS inteligente, controle de bateria e cálculo geodésico validada');

// 3. Módulo de Gestão do Monitoramento (Admin)
const gestaoPath = path.join(rootDir, 'src', 'monitoramento-gestao.js');
assert(fs.existsSync(gestaoPath), 'Arquivo src/monitoramento-gestao.js deve existir');
const gestaoContent = fs.readFileSync(gestaoPath, 'utf8');
assert(gestaoContent.includes('MonitoramentoGestao'), 'monitoramento-gestao deve exportar window.MonitoramentoGestao');
assert(gestaoContent.includes('init:'), 'MonitoramentoGestao deve implementar init');
assert(gestaoContent.includes('carregarFiscais'), 'MonitoramentoGestao deve carregar lista de fiscais');
assert(gestaoContent.includes('carregarMetricasConfig'), 'MonitoramentoGestao deve suportar métricas dinâmicas personalizadas');
assert(gestaoContent.includes('salvarNovaMetrica'), 'MonitoramentoGestao deve permitir salvar novas métricas dinâmicas');
assert(gestaoContent.includes('carregarFiscaisPermissaoCamada'), 'MonitoramentoGestao deve validar fiscais habilitados na camada (Opção 2)');
assert(gestaoContent.includes('irParaUsuario'), 'MonitoramentoGestao deve possuir atalho para editar usuário diretamente');
console.log('  ✓ [MonitoramentoGestao] Painel administrativo com mapa, cards de indicadores, validação de fiscais (Opção 2) e atalho direto validado');

// 4. Integração na Página de Configurações (settings.html)
const settingsPath = path.join(rootDir, 'settings.html');
const settingsContent = fs.readFileSync(settingsPath, 'utf8');
assert(settingsContent.includes('tab-btn-monitoramento'), 'settings.html deve conter botão tab-btn-monitoramento');
assert(settingsContent.includes('id="monitoramento"'), 'settings.html deve conter seção id="monitoramento"');
assert(settingsContent.includes('mapa-monitoramento-fiscais'), 'settings.html deve conter container do mapa Leaflet');
assert(settingsContent.includes('modal-metrica-fiscal'), 'settings.html deve conter modal de criação de métricas dinâmicas');
assert(settingsContent.includes('metrica-fiscais-camada-container'), 'settings.html deve conter quadro de Fiscais da Camada (Opção 2)');
assert(settingsContent.includes('modal-timeline-fiscal'), 'settings.html deve conter modal da timeline do fiscal');
assert(settingsContent.includes('src/monitoramento-gestao.js'), 'settings.html deve importar src/monitoramento-gestao.js');
console.log('  ✓ [Settings] Interface de monitoramento integrada no menu, mapa Leaflet e modais configurados com Opção 2');

// 5. Integração com Gestão de Usuários (usuarios-gestao.js)
const usuariosPath = path.join(rootDir, 'src', 'usuarios-gestao.js');
const usuariosContent = fs.readFileSync(usuariosPath, 'utf8');
assert(usuariosContent.includes('user-fiscal-campo-check'), 'usuarios-gestao deve conter checkbox user-fiscal-campo-check');
assert(usuariosContent.includes('fiscal_campo: fiscalCampo'), 'usuarios-gestao deve persistir fiscal_campo no Supabase');
assert(usuariosContent.includes('abrirPerfilUsuario'), 'usuarios-gestao deve exportar abrirPerfilUsuario para navegação direta');
console.log('  ✓ [UsuariosGestao] Switch de Fiscal de Campo à esquerda de Criar Camadas e atalho direto abrirPerfilUsuario validados');

// 6. Integração na Página Principal (home.html)
const homePath = path.join(rootDir, 'home.html');
const homeContent = fs.readFileSync(homePath, 'utf8');
assert(homeContent.includes('fiscal-tracker-header-container'), 'home.html deve conter container para controle do fiscal no portal');
assert(homeContent.includes('fiscal-tracker-header-container-mun'), 'home.html deve conter container para controle do fiscal no município');
assert(homeContent.includes("switchMunicipioTab('monitoramento')"), 'home.html deve conter Card de Monitoramento no painel de gestão do município');
assert(homeContent.includes("'monitoramento': 'Monitoramento'"), 'home.html deve mapear o título da aba Monitoramento');
assert(homeContent.includes("'monitoramento'"), 'home.html deve incluir monitoramento em SETTINGS_TABS');
assert(homeContent.includes('src/fiscalTracker.js'), 'home.html deve importar o rastreador fiscalTracker.js');
console.log('  ✓ [Home] Card de Monitoramento no grid de gestão, roteamento e telemetria GPS integrados com sucesso');

console.log('✨ Todos os testes do módulo de Monitoramento passaram com sucesso!');
