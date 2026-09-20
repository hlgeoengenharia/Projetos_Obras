// tests/reportScope.test.js
// Construtor de Relatórios: escopo Individual x Geral (camada) e tamanho da folha (A4 / A3).
// Roda o reportBuilder.js e o reportAdapter.js reais em Node, com um DOM mínimo simulado.
// Rodar com: node tests/reportScope.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let total = 0;
let failed = 0;
function ok(name, cond) { total++; if (cond) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// ---------------------------------------------------------------- ambiente
const store = {};
const container = { innerHTML: '' };
const stub = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, innerHTML: '', textContent: '', addEventListener() {}, querySelectorAll: () => [], querySelector: () => null });
const document = {
    getElementById: (id) => (id === 'report-builder-container' ? container : null),
    querySelectorAll: () => [],
    querySelector: () => null,
    activeElement: null,
    createElement: stub,
    addEventListener() {}
};
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const forms = [{
    id: 'f1', name: 'MPF',
    tabs: [{ id: 't1', title: 'Dados', isPrimary: true, fields: [{ id: 'a', label: 'Nome', type: 'text' }] },
           { id: 't_rel', title: 'Relatórios', tabType: 'reports', isReportsTab: true, fields: [] }],
    statsConfig: [{ id: 'g1', title: 'Situação do recuo', type: 'pie', fieldId: 'a', fieldLabel: 'Nome' }]
}];
const window = { localStorage, forms, currentFormId: 'f1' };
window.window = window;
const ctx = { window, document, localStorage, forms, console, setTimeout: () => 0, clearTimeout() {}, alert() {}, confirm: () => true, navigator: {} };
ctx.self = window;
vm.createContext(ctx);
['src/pageSize.js', 'src/reportAdapter.js', 'src/reportBuilder.js'].forEach(f => vm.runInContext(read(f), ctx, { filename: f }));
const RB = window.ReportBuilder;
const RA = window.ReportAdapter;
ok('construtor e adaptador carregaram', !!RB && !!RA && !!window.PageSize);

const has = (html, text) => html.includes(text);

// ---------------------------------------------------------------- escopo INDIVIDUAL (padrão)
RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
let html = container.innerHTML;
ok('individual: modelo criado é uma Ficha Individual', has(html, 'Ficha Individual'));
ok('individual: NÃO tem o card Gráficos do Dashboard', !has(html, "acc-charts") && !has(html, 'Gráficos do Dashboard'));
ok('individual: tem Grade de Atributos, Quadro Analítico e Mapa', has(html, 'Grade de Atributos') && has(html, 'Quadro Analítico e Sintético') && has(html, 'Mini-Mapa Cartográfico'));
ok('individual: mantém Cabeçalho, Caixa de texto livre e Rodapé', has(html, 'Cabeçalho Institucional') && has(html, 'Caixa de texto livre') && has(html, 'Rodapé Oficial'));
ok('individual: tem o atalho no popup da feição', has(html, 'Atalho no Popup da Feição'));
ok('atalho lista a aba de Relatórios', has(html, 'Na Aba: Relatórios'));
ok('não há mais seletor Escopo nem botão Imprimir A4 / PDF', !has(html, '>Escopo<') && !has(html, 'Imprimir A4 / PDF'));
ok('seletor de folha A4 | A3', has(html, "ReportBuilder.setPageSize('A4')") && has(html, "ReportBuilder.setPageSize('A3')"));
ok('A4 marcado por padrão', /setPageSize\('A4'\)"[^>]*bg-primary/.test(html) && !/setPageSize\('A3'\)"[^>]*bg-primary/.test(html));
ok('folha A4 no título', has(html, 'Folha A4 Interativa') && has(html, '210 × 297 mm (Retrato)'));

// ---------------------------------------------------------------- A3
RB.setPageSize('A3');
html = container.innerHTML;
ok('A3: título e dimensões da folha', has(html, 'Folha A3 Interativa') && has(html, '297 × 420 mm (Retrato)'));
ok('A3: seletor marca A3', /setPageSize\('A3'\)"[^>]*bg-primary/.test(html) && !/setPageSize\('A4'\)"[^>]*bg-primary/.test(html));
ok('A3: card de layout cita as medidas do A3', has(html, 'Layout A3') && has(html, 'Retrato (297×420)') && has(html, 'Paisagem (420×297)'));
const salvos = RA.getReportTemplates('f1');
ok('A3 fica gravado no modelo', salvos.length === 1 && salvos[0].config_pagina.tamanho === 'A3');

RB.setPageSize('A4');
ok('volta para A4', has(container.innerHTML, 'Folha A4 Interativa'));

// ---------------------------------------------------------------- escopo GERAL (camada)
RB.initReportBuilderTab('f1', 'MPF', { scope: 'geral' });
html = container.innerHTML;
ok('geral: modelo criado é um Relatório Geral', has(html, 'Relatório Geral da Camada') || has(html, 'Relatório Geral - '));
ok('geral: não mistura a ficha individual salva antes', !has(html, 'Ficha Individual'));
ok('geral: tem Cabeçalho, Caixa de texto livre, Gráficos do Dashboard e Rodapé',
    has(html, 'Cabeçalho Institucional') && has(html, 'Caixa de texto livre') && has(html, 'Gráficos do Dashboard') && has(html, 'Rodapé Oficial'));
ok('geral: lista os gráficos do Dashboard do cadastro', has(html, 'Situação do recuo'));
ok('geral: NÃO tem Grade, Quadro Analítico nem Mapa', !has(html, 'Grade de Atributos') && !has(html, 'Quadro Analítico e Sintético') && !has(html, 'Mini-Mapa Cartográfico'));
ok('geral: sem atalho no popup da feição', !has(html, 'Atalho no Popup da Feição'));
ok('geral: também escolhe A4 | A3', has(html, "ReportBuilder.setPageSize('A3')"));

// o modelo geral é gravado à parte e o individual não o enxerga
RB.saveCurrentTemplate(false);
const todos = RA.getReportTemplates('f1');
ok('modelo geral gravado com tipo "geral"', todos.some(t => t.tipo === 'geral'));
ok('sem bloco de KPIs/tabela no modelo padrão do geral',
    todos.filter(t => t.tipo === 'geral').every(t => !t.blocos.some(b => b.tipo === 'kpi_cards' || b.tipo === 'tabela_sintetica')));
ok('modelo geral traz cabeçalho, gráfico e rodapé', (() => {
    const g = todos.find(t => t.tipo === 'geral');
    const tipos = g.blocos.map(b => b.tipo);
    return tipos.includes('cabecalho') && tipos.includes('grafico_existente') && tipos.includes('rodape');
})());
ok('geral não aparece como atalho no popup', todos.filter(t => t.tipo === 'geral').every(t => t.atalho_aba === 'none'));

RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
ok('voltando ao individual, o modelo geral não aparece na lista', !has(container.innerHTML, 'Relatório Geral'));

console.log(`reportScope: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
