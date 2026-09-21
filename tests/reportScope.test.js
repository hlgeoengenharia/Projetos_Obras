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
const inputs = {}; // campos do card do mapa simulados por id
const sheetEl = () => ({ innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [], querySelector: () => null, appendChild() {}, addEventListener() {} });
const sheet = { 'a4-blocks-list': sheetEl(), 'a4-header-slot': sheetEl(), 'a4-footer-slot': sheetEl() };
const stub = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, innerHTML: '', textContent: '', addEventListener() {}, querySelectorAll: () => [], querySelector: () => null });
const document = {
    getElementById: (id) => (id === 'report-builder-container' ? container : (inputs[id] || sheet[id] || null)),
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
['src/pageSize.js', 'src/mapTools.js', 'src/reportAdapter.js', 'src/reportBuilder.js'].forEach(f => vm.runInContext(read(f), ctx, { filename: f }));
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

// ---------------------------------------------------------------- Mini-Mapa (card do Relatório Individual)
ok('card do mapa tem destaque, mapa base, camadas, norte, escala e projeção', ['cfg-map-x-rotulos', 'cfg-map-x-confr', 'cfg-map-x-area', 'cfg-map-x-sit', 'cfg-map-x-grade', 'cfg-map-temp-ativo', 'cfg-map-temp-ordem', 'cfg-map-temp-cols', 'cfg-map-temp-altura', 'cfg-map-temp-contorno', 'cfg-map-temp-sync', 'cfg-map-pts-ativo', 'cfg-map-pts-sistema', 'cfg-map-pts-tab', 'cfg-map-pts-mem', 'cfg-map-med-ativo', 'cfg-map-med-lados', 'cfg-map-med-total', 'cfg-map-med-perim', 'cfg-map-destaque', 'cfg-map-esmaecer', 'cfg-map-cor', 'cfg-map-base', 'cfg-map-camadas', 'cfg-map-norte', 'cfg-map-escala', 'cfg-map-proj', 'cfg-map-altura'].every(id => has(html, 'id="' + id + '"')));
ok('rodapé oficial: opção do QR code de verificação', has(html, 'id="cfg-ftr-qr"') && has(html, 'QR code para verificar a autenticidade online'));
ok('card explica que o usuário ajusta no relatório', has(html, 'painel <em>Mapa</em> do relatório'));
ok('o modelo padrão já traz o mapa na folha: o botão é "Atualizar"', has(html, 'Atualizar o Mini-Mapa da Folha'));
ok('card não diz mais que a série temporal é "próxima etapa"', !has(html, 'próxima etapa'));
ok('modo "Série Multitemporal" com dados de mentira saiu', !has(html, 'Série Multitemporal</button>') && !has(html, 'Voo Aerofotogramétrico'));
Object.assign(inputs, {
    'cfg-map-destaque': { checked: true }, 'cfg-map-esmaecer': { checked: true }, 'cfg-map-cor': { value: '#ff8800' },
    'cfg-map-base': { value: 'satelite' }, 'cfg-map-camadas': { checked: false }, 'cfg-map-norte': { checked: false },
    'cfg-map-escala': { checked: true }, 'cfg-map-proj': { checked: true },
    'cfg-map-x-rotulos': { checked: true }, 'cfg-map-x-confr': { checked: true }, 'cfg-map-x-ref': { checked: false }, 'cfg-map-x-area': { checked: true }, 'cfg-map-x-sit': { checked: true }, 'cfg-map-x-grade': { checked: false },
    'cfg-map-temp-ativo': { checked: true }, 'cfg-map-temp-ordem': { value: 'desc' }, 'cfg-map-temp-cols': { value: '3' }, 'cfg-map-temp-altura': { value: '90' }, 'cfg-map-temp-contorno': { checked: false }, 'cfg-map-temp-sync': { checked: true },
    'cfg-map-pts-ativo': { checked: true }, 'cfg-map-pts-sistema': { value: 'geo_gms' }, 'cfg-map-pts-tab': { checked: true }, 'cfg-map-pts-mem': { checked: true },
    'cfg-map-med-ativo': { checked: true }, 'cfg-map-med-lados': { checked: false }, 'cfg-map-med-total': { checked: true }, 'cfg-map-med-perim': { checked: true }, 'cfg-map-altura': { value: '120' }, 'cfg-map-note': { value: 'Nota X' }
});
RB.insertMapBlock();
RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
let tplMapa = RA.getReportTemplates('f1')[0];
let mapas = tplMapa.blocos.filter(b => b.tipo === 'mapa_estatico');
eq('grava a configuração escolhida no UNICO bloco de mapa', [mapas.length, mapas[0].mapa.destaque.cor, mapas[0].mapa.destaque.esmaecerEntorno, mapas[0].mapa.baseMap, mapas[0].mapa.camadasVizinhas, mapas[0].mapa.norte, mapas[0].mapa.alturaMm, mapas[0].notaTecnica], [1, '#ff8800', true, 'satelite', false, false, 120, 'Nota X']);
eq('medidas escolhidas ficam no modelo', mapas[0].mapa.medidas, { ativo: true, lados: false, total: true, perimetro: true, cor: '#065f46', estilo: { lados: { n: true, i: false, s: false }, total: { n: true, i: false, s: false }, perimetro: { n: true, i: false, s: false } } });
eq('pontos: padrão do modelo (sem os pontos do usuário)', [mapas[0].mapa.pontos.ativo, mapas[0].mapa.pontos.sistema, mapas[0].mapa.pontos.tabela, mapas[0].mapa.pontos.memorial, mapas[0].mapa.pontos.ordem, mapas[0].mapa.pontos.titulos], [true, 'geo_gms', true, true, [], {}]);
eq('análise temporal: padrão do modelo (sem ortofotos retiradas pelo usuário)', mapas[0].mapa.temporal, { ativo: true, ordem: 'desc', colunas: 3, alturaMm: 90, sincronizar: true, contorno: false, excluidas: [] });
eq('extras: padrão do modelo (camada e campo são escolhidos pelo usuário no relatório)', [mapas[0].mapa.rotulos.ativo, mapas[0].mapa.confrontantes.ativo, mapas[0].mapa.confrontantes.camada, mapas[0].mapa.referencia.ativo, mapas[0].mapa.comparacaoArea.ativo, mapas[0].mapa.comparacaoArea.campo, mapas[0].mapa.situacao.ativo, mapas[0].mapa.quadriculado.ativo, mapas[0].mapa.anotacoes], [true, true, '', false, true, '', true, false, []]);
ok('a vista, os textos editados e os rótulos arrastados (do usuário) não vão para o modelo', !('vista' in mapas[0].mapa) && !('edicoes' in mapas[0].mapa) && !('posicoes' in mapas[0].mapa));
inputs['cfg-map-cor'].value = '#0000ff';
RB.insertMapBlock();
RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
tplMapa = RA.getReportTemplates('f1')[0];
mapas = tplMapa.blocos.filter(b => b.tipo === 'mapa_estatico');
eq('clicar de novo ATUALIZA o mesmo mapa (não duplica)', [mapas.length, mapas[0].mapa.destaque.cor], [1, '#0000ff']);
ok('card passa a mostrar "Atualizar" e os valores salvos', has(container.innerHTML, 'Atualizar o Mini-Mapa da Folha') && has(container.innerHTML, 'value="#0000ff"'));
RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
const folha = sheet['a4-blocks-list'].innerHTML;
ok('prévia na folha é esquemática e reflete a configuração', has(folha, 'Pré-visualização esquemática') && has(folha, 'Imagens © Esri') && has(folha, 'border: 3px solid #0000ff') && has(folha, 'height: 454px'));
ok('prévia avisa da análise temporal (colunas e ordem)', has(folha, 'Análise temporal: um mapa por ortofoto') && has(folha, '3 coluna(s)') && has(folha, 'recente → antiga'));
ok('prévia avisa que o usuário marca pontos e cita o memorial e o sistema', has(folha, 'marca pontos nos vértices') && has(folha, 'com memorial descritivo') && has(folha, 'graus, minutos e segundos'));
ok('prévia mostra a área (medidas ligadas) e não os lados (desligados)', has(folha, 'Área 1.012,40 m²') && !has(folha, '25,40 m'));
Object.keys(inputs).forEach(k => delete inputs[k]);

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

// ---------------------------------------------------------------- dados que a página do mapa entrega ao relatório
{
    const tplMapa = RA.getReportTemplates('f1')[0];
    const quadG = { type: 'Polygon', coordinates: [[[-34.84, -7.02], [-34.839, -7.02], [-34.839, -7.019], [-34.84, -7.019], [-34.84, -7.02]]] };
    const sq = (x, y, s) => ({ type: 'Polygon', coordinates: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]] });
    window.themes = [
        { id: 'A', name: 'Lotes', color: '#ff0000', visible: true, features: [{ properties: { id_banco: 10 }, geometry: quadG }, { properties: { id_banco: 11 }, geometry: sq(-34.8398, -7.0198, 0.0003) }] },
        { id: 'B', name: 'Desligada', visible: false, features: [{ properties: {}, geometry: sq(-34.84, -7.02, 0.001) }] },
        { id: 'C', name: 'Sem permissão', visible: true, features: [{ properties: {}, geometry: sq(-34.84, -7.02, 0.001) }] }
    ];
    window.userCanOnTheme = (id) => id !== 'C';
    window.rasterLayers = [
        { id: 'r1', nome: 'Ortofoto_10-02-2026', url_imagem: 'https://s/{z}/{x}/{y}.png', tipo: 'xyz_tiles', bbox: [], visivel: false },
        { id: 'r9', nome: 'Voo longe', url_imagem: 'https://img/longe.webp', bbox: [[-10, -40], [-9, -39]], visivel: false }
    ];
    window.activeFeatureLayer = { feature: { properties: { id_banco: 10 }, geometry: quadG } };
    const store = {};
    ctx.sessionStorage = { setItem: (k, v) => { store['s:' + k] = v; }, getItem: (k) => store['s:' + k] || null };
    window.sessionStorage = ctx.sessionStorage;
    let aberta = null;
    window.open = (url) => { aberta = url; };
    window.openFeatureReportPage(tplMapa.id, { id_banco: 10, nome: 'x' }, quadG);
    const payload = JSON.parse(store['s:constructive_active_report_payload'] || 'null');
    ok('relatório abre em nova janela com o modelo certo', !!aberta && aberta.includes('relatorio_view.html') && aberta.includes(encodeURIComponent(tplMapa.id)));
    ok('payload leva a chave da feição', !!payload && payload.featureKey === '10');
    eq('camadas: só as ATIVAS e PERMITIDAS, sem a própria feição', payload.camadasMapa.map(c => [c.id, c.features.length]), [['A', 1]]);
    eq('ortofotos: as que podem cobrir a feição (bbox longe fica de fora), com data', payload.ortofotos.map(o => [o.id, o.dataTxt, o.coberturaConhecida]), [['r1', '10/02/2026', false]]);
    ok('só geometria vai (sem atributos) e cor válida', Object.keys(payload.camadasMapa[0].features[0].properties).length === 0 && payload.camadasMapa[0].color === '#ff0000');

    // rótulos (Quadra/Lote e nome principal) das feições vizinhas: só com permissão de ver os dados da camada
    window.getFeaturePropertyValue = (th, f, k) => (f.properties || {})[k];
    window.getThemeFieldLabel = (th, k) => k;
    window.canUserSeeThemeData = (th) => th.id !== 'A2';
    window.themes = [
        { id: 'A', name: 'Lotes', visible: true, disp1: 'Lote', disp2: 'Quadra', mainTitle: 'Proprietário', features: [{ properties: { id_banco: 10 }, geometry: quadG }, { properties: { id_banco: 11, Lote: '02', Quadra: 'E', 'Proprietário': 'Beltrano' }, geometry: sq(-34.8398, -7.0198, 0.0003) }] },
        { id: 'A2', name: 'Restrita', visible: true, features: [{ properties: { Lote: '09', 'Proprietário': 'Sigiloso' }, geometry: sq(-34.8398, -7.0198, 0.0003) }] }
    ];
    window.userCanOnTheme = () => true;
    window.openFeatureReportPage(tplMapa.id, { id_banco: 10 }, quadG);
    const p2 = JSON.parse(store['s:constructive_active_report_payload']);
    const camA = p2.camadasMapa.find(c => c.id === 'A'), camR = p2.camadasMapa.find(c => c.id === 'A2');
    eq('rótulo da feição vizinha: Quadra • Lote e o nome principal', [camA.features[0].properties.r, camA.features[0].properties.t], ['Quadra E • Lote 02', 'Beltrano']);
    eq('camada cujos dados o usuário não pode ver: a geometria vai, sem rótulo nem nome', [camR.features.length, Object.keys(camR.features[0].properties).length], [1, 0]);
    window.getFeaturePropertyValue = undefined;
    window.openFeatureReportPage(tplMapa.id, { id_banco: 10 }, quadG);
    ok('sem a função de leitura de atributos da página do mapa: sem rótulos, sem erro', Object.keys(JSON.parse(store['s:constructive_active_report_payload']).camadasMapa[0].features[0].properties).length === 0);
}

console.log(`reportScope: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
