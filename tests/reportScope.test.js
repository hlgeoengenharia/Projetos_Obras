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
const docHandlers = {};
const pendentes = []; // temporizadores pedidos pelo construtor (só rodam quando o teste manda)
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
    addEventListener(tipo, fn) { (docHandlers[tipo] = docHandlers[tipo] || []).push(fn); }
};
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const sessionStore = {};
const sessionStorage = { getItem: (k) => (k in sessionStore ? sessionStore[k] : null), setItem: (k, v) => { sessionStore[k] = String(v); }, removeItem: (k) => { delete sessionStore[k]; } };
const forms = [{
    id: 'f1', name: 'MPF',
    tabs: [{ id: 't1', title: 'Dados', isPrimary: true, fields: [{ id: 'a', label: 'Nome', type: 'text' }] },
           { id: 't_rel', title: 'Relatórios', tabType: 'reports', isReportsTab: true, fields: [] }],
    statsConfig: [{ id: 'g1', title: 'Situação do recuo', type: 'pie', fieldId: 'a', fieldLabel: 'Nome' }]
}];
const winHandlers = {};
const window = { localStorage, sessionStorage, forms, currentFormId: 'f1', location: { origin: 'http://localhost:8080' }, addEventListener(t, fn) { (winHandlers[t] = winHandlers[t] || []).push(fn); } };
window.window = window;
const ctx = { window, document, localStorage, sessionStorage, forms, console, setTimeout: (fn) => { pendentes.push(fn); return 0; }, clearTimeout() {}, alert() {}, confirm: () => true, navigator: {} };
ctx.self = window;
vm.createContext(ctx);
['src/pageSize.js', 'src/mapTools.js', 'src/fieldFormatter.js', 'src/reportData.js', 'src/layerFilter.js', 'src/reportBlocks.js', 'src/reportEditor.js', 'src/reportFreeText.js', 'src/reportPreview.js', 'src/reportAdapter.js', 'src/reportBuilder.js'].forEach(f => vm.runInContext(read(f), ctx, { filename: f }));
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
ok('card do mapa: só o texto e o botão (nenhuma opção; tudo já vem ligado)', has(html, 'Mini-Mapa Cartográfico') && has(html, 'todas as opções ligadas') && ['cfg-map-x-rotulos', 'cfg-map-x-confr', 'cfg-map-x-area', 'cfg-map-x-sit', 'cfg-map-x-grade', 'cfg-map-temp-ativo', 'cfg-map-pts-ativo', 'cfg-map-pts-tab', 'cfg-map-pts-mem', 'cfg-map-med-ativo', 'cfg-map-destaque', 'cfg-map-base', 'cfg-map-altura', 'cfg-map-camadas', 'cfg-map-norte', 'cfg-map-escala', 'cfg-map-proj', 'cfg-map-note'].every(id => !has(html, 'id="' + id + '"')) && has(html, 'ReportBuilder.insertMapBlock()'));
ok('individual: botão "Ver como sairá" abre o relatório real com a feição de teste', has(html, 'ReportBuilder.previewReal()') && has(html, 'Ver como sairá') && typeof RB.previewReal === 'function');
ok('rodapé oficial: opção do QR code de verificação', has(html, 'id="cfg-ftr-qr"') && has(html, 'QR code para verificar a autenticidade online'));
ok('card explica que o usuário ajusta no relatório (Configurações do Mapa)', has(html, 'painel <em>Configurações do Mapa</em>'));
ok('o modelo padrão já traz o mapa na folha: o botão é "Restaurar o padrão completo"', has(html, 'Restaurar o padrão completo do Mini-Mapa') && !has(html, 'Atualizar o Mini-Mapa da Folha'));
ok('card não diz mais que a série temporal é "próxima etapa"', !has(html, 'próxima etapa'));
ok('modo "Série Multitemporal" com dados de mentira saiu', !has(html, 'Série Multitemporal</button>') && !has(html, 'Voo Aerofotogramétrico'));
// mesmo que existam valores em campos antigos, o mapa nasce com o padrão completo
inputs['cfg-map-note'] = { value: 'Nota X' };
inputs['cfg-map-cor'] = { value: '#ff8800' };
RB.insertMapBlock();
RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
let tplMapa = RA.getReportTemplates('f1')[0];
let mapas = tplMapa.blocos.filter(b => b.tipo === 'mapa_estatico');
eq('grava um UNICO bloco de mapa, com o padrão completo (a nota do modelo é mantida)', [mapas.length, mapas[0].mapa.destaque.cor, mapas[0].mapa.destaque.esmaecerEntorno, mapas[0].mapa.baseMap, mapas[0].mapa.camadasVizinhas, mapas[0].mapa.norte, mapas[0].mapa.alturaMm, mapas[0].notaTecnica === 'Nota X'], [1, '#10b981', true, 'osm', true, true, 90, false]);
eq('todas as opções ligadas: medidas, pontos (tabela, memorial e coluna Confrontantes), extras, elementos e análise temporal', [mapas[0].mapa.medidas.ativo && mapas[0].mapa.medidas.lados && mapas[0].mapa.medidas.total && mapas[0].mapa.medidas.perimetro, mapas[0].mapa.pontos.ativo && mapas[0].mapa.pontos.tabela && mapas[0].mapa.pontos.memorial && mapas[0].mapa.pontos.colConf.ativo, mapas[0].mapa.rotulos.ativo && mapas[0].mapa.confrontantes.ativo && mapas[0].mapa.comparacaoArea.ativo && mapas[0].mapa.situacao.ativo && mapas[0].mapa.quadriculado.ativo, mapas[0].mapa.escala && mapas[0].mapa.projecao, mapas[0].mapa.temporal.ativo && mapas[0].mapa.temporal.contorno && mapas[0].mapa.temporal.sincronizar], [true, true, true, true, true]);
eq('o que depende de escolha do usuário fica vazio no modelo (pontos, camada dos confrontantes, campo da área, ortofotos retiradas, textos)', [mapas[0].mapa.pontos.ordem, mapas[0].mapa.pontos.titulos, mapas[0].mapa.confrontantes.camada, mapas[0].mapa.comparacaoArea.campo, mapas[0].mapa.temporal.excluidas, mapas[0].mapa.anotacoes, mapas[0].mapa.referencia.ativo], [[], {}, '', '', [], [], false]);
ok('a vista, os textos editados e os rótulos arrastados (do usuário) não vão para o modelo', !('vista' in mapas[0].mapa) && !('edicoes' in mapas[0].mapa) && !('posicoes' in mapas[0].mapa));
RB.insertMapBlock();
RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
tplMapa = RA.getReportTemplates('f1')[0];
mapas = tplMapa.blocos.filter(b => b.tipo === 'mapa_estatico');
eq('clicar de novo restaura o padrão no MESMO mapa (não duplica)', [mapas.length, mapas[0].mapa.destaque.cor], [1, '#10b981']);
ok('card mostra "Restaurar o padrão completo" depois de inserido', has(container.innerHTML, 'Restaurar o padrão completo do Mini-Mapa'));
RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
const folha = sheet['a4-blocks-list'].innerHTML;
ok('prévia na folha é esquemática e reflete a configuração (padrão completo)', has(folha, 'Pré-visualização esquemática') && has(folha, 'border: 3px solid #10b981') && has(folha, 'height: 340px'));
ok('prévia avisa da análise temporal (colunas e ordem do padrão)', has(folha, 'Análise temporal: um mapa por ortofoto') && has(folha, '2 coluna(s)') && has(folha, 'antiga → recente'));
ok('prévia avisa que o usuário marca pontos e cita o memorial e o sistema (UTM)', has(folha, 'marca pontos nos vértices') && has(folha, 'com memorial descritivo') && has(folha, 'UTM'));
ok('prévia mostra a área e os lados (medidas todas ligadas)', has(folha, 'Área 1.012,40 m²') && has(folha, '25,40 m'));
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
ok('geral: também tem o botão "Ver como sairá" (usa a lista de exemplo, sem feição única)', has(html, 'ReportBuilder.previewReal()') && has(html, 'Ver como sairá') && has(html, 'lista de exemplo'));
{
    let abertaGeral;
    const openAntes = window.open;
    window.open = (url) => { abertaGeral = url; };
    RB.previewReal();
    window.open = openAntes;
    const payloadGeral = JSON.parse(store.constructive_active_report_payload);
    eq('geral: "Ver como sairá" abre com os gráficos do Dashboard e sem feição única', [payloadGeral.template.tipo, payloadGeral.charts.map(c => c.title), Object.keys(payloadGeral.featureData).length, Array.isArray(payloadGeral.featureList)], ['geral', ['Situação do recuo'], 0, true]);
    ok('geral: a janela abre em modo prévia', /previa=1/.test(abertaGeral));
}

// ---------------------------------------------------------------- Filtro de Feições (só no Relatório Geral)
{
    // salvarFiltro() atualiza o painel lateral direto (accordion-blocks-panel); neste teste, sem esse elemento
    // na tela simulada, redesenha a aba inteira para conferir o resultado — como o teste dos gráficos já faz.
    const redesenhar = () => RB.initReportBuilderTab('f1', 'MPF', { scope: 'geral' });

    RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
    ok('individual: sem o card de filtro', !has(container.innerHTML, 'Filtro de Feições'));

    const forms0 = window.forms[0];
    forms0.tabs = forms0.tabs.filter(t => t.id !== 't_filtro');
    forms0.tabs.push({ id: 't_filtro', title: 'Dados', fields: [{ id: 'sit', label: 'Situação', type: 'select' }, { id: 'area', label: 'Área', type: 'area_m2' }] });

    redesenhar();
    html = container.innerHTML;
    ok('geral: tem o card "Filtro de Feições", sem nenhum grupo ainda', has(html, 'Filtro de Feições') && has(html, 'Sem filtro (todas as feições)') && !has(html, 'Grupo 1'));

    RB.addFiltroGrupo();
    redesenhar();
    html = container.innerHTML;
    ok('1º grupo: uma condição em branco (campo vazio, operador "contém" por padrão)', has(html, 'Grupo 1') && has(html, "ReportBuilder.updateFiltroCondicao(0, 0, 'field', this.value)") && /<option value="sit"[^>]*>Situação<\/option>/.test(html) && /<option value="contem" selected>/.test(html));
    ok('badge mostra "1 grupo(s)"', has(html, '1 grupo(s)'));

    RB.updateFiltroCondicao(0, 0, 'field', 'sit');
    redesenhar();
    html = container.innerHTML;
    ok('campo do tipo lista: operadores sem "contém"/"entre" (só igual, diferente, vazio, preenchido)', has(html, "value=\"igual\" selected") && !has(html, 'value="contem"') && !has(html, 'value="entre"'));

    RB.updateFiltroCondicao(0, 0, 'field', 'area');
    redesenhar();
    html = container.innerHTML;
    ok('trocar para um campo numérico: operadores certos (maior/menor/entre) e campo de valor numérico', has(html, 'value="maior"') && has(html, 'value="entre"') && /type="number"[^>]*oninput="ReportBuilder.updateFiltroCondicao\(0, 0, 'value'/.test(html));

    RB.updateFiltroCondicao(0, 0, 'op', 'entre');
    RB.updateFiltroCondicao(0, 0, 'value', '100');
    RB.updateFiltroCondicao(0, 0, 'value2', '500');
    redesenhar();
    html = container.innerHTML;
    ok('operador "entre": aparece o segundo campo de valor, com "e" entre os dois', /value="100"/.test(html) && /value="500"/.test(html) && has(html, '<span class="text-[10px] text-slate-400">e</span>'));

    RB.addFiltroCondicao(0);
    redesenhar();
    html = container.innerHTML;
    ok('2ª condição no mesmo grupo: aparece o separador "E"', (html.match(/text-orange-500 uppercase">E</g) || []).length === 1 && has(html, "ReportBuilder.updateFiltroCondicao(0, 1, 'field', this.value)"));
    RB.updateFiltroCondicao(0, 1, 'field', 'sit');
    RB.updateFiltroCondicao(0, 1, 'op', 'igual');
    RB.updateFiltroCondicao(0, 1, 'value', 'irregular');

    RB.addFiltroGrupo();
    redesenhar();
    html = container.innerHTML;
    ok('2º grupo: aparece o separador "OU" entre os grupos', has(html, 'Grupo 2 (OU)') && has(html, 'uppercase tracking-wider">OU<'));
    ok('badge agora mostra "2 grupo(s)"', has(html, '2 grupo(s)'));
    ok('a prévia já aparece com o 1º grupo válido (o 2º, ainda em branco, é ignorado até ficar completo)', has(html, 'Na prévia (dados de exemplo):'));

    RB.updateFiltroCondicao(1, 0, 'field', 'sit');
    RB.updateFiltroCondicao(1, 0, 'op', 'preenchido');
    redesenhar();
    html = container.innerHTML;
    ok('"preenchido"/"vazio": some o campo de valor (não faz sentido digitar nada)', has(html, "ReportBuilder.updateFiltroCondicao(1, 0, 'op', this.value)") && !has(html, "ReportBuilder.updateFiltroCondicao(1, 0, 'value',"));
    ok('agora com os dois grupos completos, a prévia com dados de exemplo aparece', has(html, 'Na prévia (dados de exemplo):') && /de 8 feições casam com o filtro\./.test(html));

    RB.removeFiltroCondicao(0, 1);
    redesenhar();
    html = container.innerHTML;
    ok('remover a 2ª condição do grupo 1: volta a ter só uma, sem o separador "E"', (html.match(/text-orange-500 uppercase">E</g) || []).length === 0);

    RB.removeFiltroCondicao(1, 0);
    redesenhar();
    html = container.innerHTML;
    ok('remover a única condição de um grupo remove o grupo inteiro (não sobra um grupo vazio)', !has(html, 'Grupo 2') && has(html, '1 grupo(s)'));

    redesenhar();
    html = container.innerHTML;
    ok('o filtro persiste ao trocar de aba/voltar (foi salvo)', /value="100"/.test(html) && /value="500"/.test(html) && has(html, '1 grupo(s)'));

    RB.limparFiltro();
    redesenhar();
    html = container.innerHTML;
    ok('"Limpar filtro" volta ao estado sem nenhum grupo', has(html, 'Sem filtro (todas as feições)') && !has(html, 'Grupo 1'));
}

// gráficos: sem duplicar ao inserir de novo; a seleção e a disposição refletem o que já está na folha
{
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'geral' });
    RB.selectChartLayout('side');
    RB.insertChartBlock();
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'geral' });
    let tplG = RA.getReportTemplates('f1').find(t => t.tipo === 'geral');
    eq('1º clique: um único bloco, com o layout escolhido', [tplG.blocos.filter(b => b.tipo === 'grafico_existente').length, tplG.blocos.find(b => b.tipo === 'grafico_existente').layout], [1, 'lado_a_lado']);
    RB.selectChartLayout('full');
    RB.insertChartBlock();
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'geral' });
    tplG = RA.getReportTemplates('f1').find(t => t.tipo === 'geral');
    eq('2º clique: atualiza o mesmo bloco (não duplica)', [tplG.blocos.filter(b => b.tipo === 'grafico_existente').length, tplG.blocos.find(b => b.tipo === 'grafico_existente').layout], [1, 'largura_total']);
    html = container.innerHTML;
    ok('card mostra "Gráficos ativos na Folha A4" e o botão vira "Atualizar"', has(html, 'Gráficos ativos na Folha A4') && has(html, 'Atualizar Gráficos na Folha') && !has(html, 'Inserir Gráficos na Folha'));
}

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

// ---------------------------------------------------------------- "+ Criar Novo Modelo de Relatório...": folha em branco, até nome e atalho serem preenchidos
{
    // onTemplateChange com um id que não existe entre os modelos salvos é um "redesenhar sem trocar de modelo":
    // útil aqui para ver na tela o efeito de updateTemplateName/updateAtalhoAba, que não redesenham sozinhos.
    const redesenhar = () => RB.onTemplateChange('__id_inexistente__');

    RB.onTemplateChange('__new__');
    html = container.innerHTML;
    ok('novo modelo: "Nome do Documento" e a seleção do atalho aparecem vazios na tela', has(html, 'id="rpt-template-name" value=""') && has(html, 'Selecione onde exibir o atalho...'));
    ok('novo modelo: nenhum card de bloco mostra estado "ativo" (a folha está limpa)', !has(html, 'Grade ativa na Folha A4') && !has(html, 'Gráficos ativos na Folha A4') && !has(html, 'Laudo ativo na Folha A4'));
    ok('novo modelo: o botão "Salvar Modelo" vem desabilitado, com o motivo no título', has(html, '<button type="button" disabled') && has(html, 'Preencha o nome do documento e o atalho no popup da feição'));

    RB.saveCurrentTemplate(false);
    ok('tentar salvar sem nome nem atalho: nada novo é gravado', !RA.getReportTemplates('f1').some(t => !t.nome || !t.nome.trim()));

    RB.updateTemplateName('Ficha de Teste');
    redesenhar();
    html = container.innerHTML;
    ok('só o nome preenchido: o botão continua desabilitado (falta o atalho)', has(html, '<button type="button" disabled'));

    const alertas = [];
    const alertAntes = ctx.alert;
    ctx.alert = (m) => alertas.push(m);
    RB.saveCurrentTemplate();
    ok('tentar salvar só com o nome: não grava e avisa', !RA.getReportTemplates('f1').some(t => t.nome === 'Ficha de Teste') && alertas.length === 1);

    RB.updateAtalhoAba('header'); // escolher o atalho já tenta salvar sozinho (silencioso)
    redesenhar();
    html = container.innerHTML;
    ok('com os dois preenchidos: o botão fica habilitado e o auto-save ao escolher o atalho grava', has(html, 'onclick="ReportBuilder.saveCurrentTemplate()"') && !has(html, '<button type="button" disabled') && RA.getReportTemplates('f1').some(t => t.nome === 'Ficha de Teste' && t.atalho_aba === 'header'));
    ctx.alert = alertAntes;
}

// no Relatório Geral, o atalho no popup não existe: só o nome é exigido para salvar
{
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'geral' });
    RB.onTemplateChange('__new__');
    html = container.innerHTML;
    ok('geral, novo modelo: sem blocos e o botão desabilitado até ter nome', !has(html, 'Gráficos ativos na Folha A4') && has(html, '<button type="button" disabled') && has(html, 'Preencha o nome do documento'));
    RB.updateTemplateName('Camada de Teste');
    RB.onTemplateChange('__id_inexistente__');
    html = container.innerHTML;
    ok('geral: só com o nome já habilita (não pede atalho)', has(html, 'onclick="ReportBuilder.saveCurrentTemplate()"') && !has(html, '<button type="button" disabled'));
    RB.saveCurrentTemplate(false);
    ok('geral: salvou com só o nome preenchido', RA.getReportTemplates('f1').some(t => t.tipo === 'geral' && t.nome === 'Camada de Teste'));
}

RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });

// ---------------------------------------------------------------- gavetas de campo (Grade de Atributos, Quadro Sintético 1:N, Laudo): começam com tudo desmarcado
{
    const forms0 = window.forms[0];
    forms0.tabs = forms0.tabs.filter(t => t.id !== 't_check1n');
    forms0.tabs.push({ id: 't_check1n', title: 'Histórico', isMultiple: true, fields: [{ id: 'hc_a', label: 'Campo A', type: 'text' }, { id: 'hc_b', label: 'Campo B', type: 'text' }] });
    const tpl = RA.getReportTemplates('f1')[0];
    const blocosOriginais = JSON.parse(JSON.stringify(tpl.blocos));
    tpl.blocos = [{ id: 'h1', tipo: 'cabecalho' }];
    RA.saveReportTemplate(tpl);
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
    html = container.innerHTML;
    ok('Grade de Atributos: nenhum campo vem marcado por padrão', !/name="cfg-grid-field"[^>]*checked/.test(html) && (html.match(/name="cfg-grid-field"/g) || []).length > 0);
    ok('Quadro Sintético 1:N (aba "1. Tabela Sintética"): nenhum campo vem marcado por padrão', !/name="cfg-1n-field"[^>]*checked/.test(html) && (html.match(/name="cfg-1n-field"/g) || []).length > 0);
    ok('Laudo Analítico (aba "2."): sem laudo configurado ainda, nenhum campo vem marcado', !/name="cfg-1n-laudo-field"[^>]*checked/.test(html) && (html.match(/name="cfg-1n-laudo-field"/g) || []).length > 0);

    // com um laudo JÁ configurado na folha, a gaveta volta a refletir o que está salvo (isso continua igual)
    tpl.blocos = [{ id: 'h1', tipo: 'cabecalho' }, { id: 'l1', tipo: 'laudo_vistoria_fotos', abas_selecionadas: ['t_check1n'], campos_selecionados: [{ id: 'hc_a', rawId: 'hc_a', tabId: 't_check1n', tabTitle: 'Histórico' }] }];
    RA.saveReportTemplate(tpl);
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
    html = container.innerHTML;
    ok('laudo já configurado: o campo salvo aparece marcado na gaveta', new RegExp('name="cfg-1n-laudo-field"[^>]*value="hc_a"[^>]*checked').test(html));
    ok('laudo já configurado: o outro campo (não salvo) continua desmarcado', !new RegExp('name="cfg-1n-laudo-field"[^>]*value="hc_b"[^>]*checked').test(html));

    tpl.blocos = blocosOriginais; // devolve o modelo como estava, para não afetar os testes seguintes
    RA.saveReportTemplate(tpl);
}

RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });

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

// ---------------------------------------------------------------- Grade de Atributos no construtor: desenho REAL do relatório + controles de edição
{
    const tpl = RA.getReportTemplates('f1')[0];
    const salvarGrade = (colunas, extra) => {
        tpl.blocos = tpl.blocos.filter(b => b.tipo !== 'grade_campos');
        tpl.blocos.push(Object.assign({ id: 'g1', tipo: 'grade_campos', titulo: 'Dados <Cadastrais>', colunasLayout: colunas, campos_selecionados: ['a'], campos_larguras: { a: 50 } }, extra || {}));
        RA.saveReportTemplate(tpl);
        RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
        return sheet['a4-blocks-list'].innerHTML;
    };
    const idx = () => tpl.blocos.findIndex(b => b.tipo === 'grade_campos');
    let h = salvarGrade(2);
    ok('grade (2 colunas): mostra o valor de exemplo do campo, como no relatório (e não "[Valor de ...]")', has(h, 'Exemplo: Nome') && !has(h, '[Valor de Nome]'));
    ok('grade: título editável com duplo clique (escapado) e dica de arrastar/largura', has(h, "ReportBuilder.enableInlineEdit(this, " + idx() + ", 'titulo')") && has(h, 'Dados &lt;Cadastrais&gt;') && has(h, '2 Colunas') && has(h, 'Arraste ⠿ para reordenar'));
    ok('grade: mesmos ganchos do construtor (contêiner, alça, campo com id e índice) para o arrastar e soltar continuar funcionando', has(h, 'a4-grid-fields-container" data-block-index="' + idx() + '"') && has(h, 'data-field-id="a" data-block-index="' + idx() + '"') && has(h, 'field-drag-handle'));
    ok('grade: largura [-] [50%] [+] e remover campo', has(h, "ReportBuilder.changeFieldWidthStep(" + idx() + ", 'a', -1, event)") && has(h, "ReportBuilder.changeFieldWidthStep(" + idx() + ", 'a', 1, event)") && has(h, "ReportBuilder.toggleFieldWidthPopover(" + idx() + ", 'a', event)") && has(h, '>50%<') && has(h, "ReportBuilder.removeFieldFromGrid(" + idx() + ", 'a', event)"));
    ok('grade: a largura do campo aparece na folha (50%)', has(h, 'flex: 0 0 calc(50% - 5px)'));
    h = salvarGrade(1);
    ok('grade (lista corrida): linha com alça, valor de exemplo e remover; sem os botões de largura', has(h, 'Lista Corrida') && has(h, 'Exemplo: Nome') && has(h, 'field-drag-handle') && has(h, "ReportBuilder.removeFieldFromGrid(" + idx() + ", 'a', event)") && !has(h, 'changeFieldWidthStep'));
    // tipos com formatação própria aparecem formatados como no relatório
    const forms0 = window.forms[0];
    forms0.tabs[0].fields = [{ id: 'a', label: 'Nome', type: 'text' }, { id: 'ar', label: 'Área (m²)', type: 'area_m2' }, { id: 'dt', label: 'Data', type: 'date' }, { id: 'cp', label: 'CPF/CNPJ', type: 'cpfcnpj' }];
    h = salvarGrade(2, { campos_selecionados: ['a', 'ar', 'dt', 'cp'], campos_larguras: {} });
    ok('grade: valores de exemplo formatados pelo tipo do campo (área com m², data dd/mm/aaaa, CPF com máscara)', has(h, '550,26 m²') && has(h, '15/03/2026') && has(h, '123.456.789-09'));
    ok('grade: sem o desenho antigo (esquemático) quando os módulos compartilhados estão carregados', !has(h, 'Valor de'));
}

// ---------------------------------------------------------------- Cabeçalho e rodapé no construtor: desenho REAL do relatório + edição
{
    const tpl = RA.getReportTemplates('f1')[0];
    tpl.blocos = [
        { id: 'h1', tipo: 'cabecalho', titulo: 'Ficha <X>', subtitulo: 'Órgão', logo: true, exibirDataHora: true, exibirProtocolo: true, repetir_todas_folhas: true },
        { id: 'r1', tipo: 'rodape', exibirDataHora: true, exibirHash: true, exibirQr: true, numeracao: true, inicio_numeracao: 'segunda' }
    ];
    RA.saveReportTemplate(tpl);
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
    const h = sheet['a4-header-slot'].innerHTML;
    const r = sheet['a4-footer-slot'].innerHTML;
    ok('cabeçalho: título e subtítulo editáveis com duplo clique (título escapado)', has(h, "ReportBuilder.enableInlineEdit(this, 0, 'titulo')") && has(h, "ReportBuilder.enableInlineEdit(this, 0, 'subtitulo')") && has(h, 'Ficha &lt;X&gt;'));
    ok('cabeçalho: emissão e protocolo (de exemplo) e selo "Todas as Folhas"; sem a linha extra do contêiner', has(h, 'Protocolo:') && has(h, 'data-emissao="protocolo"') && has(h, 'Todas as Folhas') && !has(h, 'border-b border-slate-300 pb-2 mb-1'));
    ok('cabeçalho: mantém o botão de remover', has(h, 'ReportBuilder.removeBlock(0)'));
    ok('rodapé: emissão, SHA-256 de exemplo e marcador do QR (o real só existe na emissão)', has(r, 'Emitido em') && has(r, 'SHA-256:') && has(r, '7f83b1657ff1') && has(r, '[QR code de verificação]') && !has(r, 'data-emissao="qr"'));
    ok('rodapé: numeração a partir da 2ª folha mostra "Página 02 de 10"; sem a linha extra do contêiner', has(r, 'Página 02 de 10') && has(r, 'ReportBuilder.removeBlock(1)') && !has(r, 'border-t border-slate-300 pt-2 mt-auto'));
}

// ---------------------------------------------------------------- Quadro Sintético 1:N no construtor: desenho REAL + controles de coluna
{
    const tpl = RA.getReportTemplates('f1')[0];
    const forms0 = window.forms[0];
    forms0.tabs = forms0.tabs.filter(t => t.id !== 't_h');
    forms0.tabs.push({ id: 't_h', title: 'PF', isMultiple: true, fields: [{ id: 'h_d', label: 'Data da vistoria', type: 'date' }, { id: 'h_o', label: 'Ocupação <x>', type: 'text' }] });
    const salvar = (extra) => {
        tpl.blocos = [Object.assign({ id: 's1', tipo: 'tabela_sintetica_1n', titulo: 'Histórico <1:N>', colunas: ['aba', 'h_d', 'h_o'] }, extra || {})];
        RA.saveReportTemplate(tpl);
        RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
        return sheet['a4-blocks-list'].innerHTML;
    };
    let h = salvar();
    ok('quadro 1:N: registros de exemplo da aba (2 linhas) formatados pelo tipo do campo (data dd/mm/aaaa)', has(h, '15/03/2026') && has(h, '10/02/2026') && !has(h, '[Data da vistoria'));
    ok('quadro 1:N: título editável (escapado) e cabeçalho de coluna com o nome do campo (escapado)', has(h, "ReportBuilder.enableInlineEdit(this, 0, 'titulo')") && has(h, 'Histórico &lt;1:N&gt;') && has(h, 'Ocupação &lt;x&gt;'));
    ok('quadro 1:N: controles de coluna (mover, renomear com duplo clique, remover)', has(h, 'ReportBuilder.moveSynthetic1nColumn(0, 1, -1, event)') && has(h, 'ReportBuilder.moveSynthetic1nColumn(0, 1, 1, event)') && has(h, 'ReportBuilder.editSynthetic1nColTitle(0, 2, event)') && has(h, "ReportBuilder.removeColumnFromSynthetic1n(0, 'h_o', event)") && !has(h, 'moveSynthetic1nColumn(0, 0, -1'));
    ok('quadro 1:N: resumo "2 registro(s)" e densidade', has(h, '2 registro(s)') && has(h, '3 coluna(s)') && has(h, 'compact'));
    h = salvar({ ordem_cronologica: 'asc', zebrado: 'ente', densidade: 'ultracompact' });
    ok('quadro 1:N: ordem, densidade e zebrado do bloco valem no desenho', has(h, 'Antigo → Recente') && has(h, 'py-0.5 px-1') && has(h, 'ultracompact'));
    h = salvar({ abas_selecionadas: ['t_inexistente'] });
    ok('quadro 1:N: aba escolhida que não existe mais mostra o aviso do relatório', has(h, 'não estão disponíveis'));
}

// ---------------------------------------------------------------- Laudo Analítico no construtor: desenho REAL + controles de campo no 1º registro de cada aba
{
    const tpl = RA.getReportTemplates('f1')[0];
    const forms0 = window.forms[0];
    forms0.tabs = forms0.tabs.filter(t => t.id !== 't_h');
    forms0.tabs.push({ id: 't_h', title: 'PF', isMultiple: true, fields: [{ id: 'h_d', label: 'Data da vistoria', type: 'date' }, { id: 'h_o', label: 'Ocupação', type: 'text' }, { id: 'h_f', label: 'Fotos', type: 'photo' }] });
    tpl.blocos = [{ id: 'l1', tipo: 'laudo_vistoria_fotos', titulo: 'Laudo <X>', abas_selecionadas: ['t_h'], campos_selecionados: ['h_d', 'h_o'], campos_larguras: { h_o: 100 } }];
    RA.saveReportTemplate(tpl);
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
    const h = sheet['a4-blocks-list'].innerHTML;
    const conta = (s) => h.split(s).length - 1;
    ok('laudo: um cartão por registro de exemplo (2), como no relatório', conta('data-split-row') === 2 && has(h, '2 registro(s)'));
    ok('laudo: valores de exemplo formatados pelo tipo (data dd/mm/aaaa)', has(h, '15/03/2026') && has(h, '10/02/2026'));
    ok('laudo: título editável (escapado) e título da aba editável', has(h, "ReportBuilder.enableInlineEdit(this, 0, 'titulo')") && has(h, 'Laudo &lt;X&gt;') && has(h, "custom_tab_title_t_h"));
    ok('laudo: controles do campo só no 1º registro (alça, largura, remover, contêiner de arrastar): 2 campos = 2 alças', conta('field-drag-handle') === 2 && conta('a4-grid-fields-container') === 1 && has(h, "ReportBuilder.removeFieldFromAnalytical1n(0, 'h_d', event)") && has(h, "ReportBuilder.changeFieldWidthStep(0, 'h_o', 1, event)"));
    ok('laudo: largura do campo (100%) na folha e no botão', has(h, '>100%<') && has(h, 'flex: 0 0 100%'));
    ok('laudo: campo de foto com o seletor de formato (lista/imagem) e as fotos de exemplo', has(h, 'Fotos:') && has(h, '<img '));
    ok('laudo: sem o desenho antigo (por aba, com resumo/detalhes)', !has(h, '<details') && !has(h, 'Marque as abas do laudo'));
}

// ---------------------------------------------------------------- Lista de campos do "@" (texto livre): fecha ao clicar fora
{
    RB.insertFreeTextBlock(); // desenha um bloco de texto livre: só aí o editor (src/reportFreeText.js) é criado e liga o ouvinte
    const blocoEl = { style: { zIndex: '' } };
    const mkDrop = (id) => { const cls = new Set(); return { id, closest: () => blocoEl, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) }, _cls: cls }; };
    const dd = mkDrop('mention-dropdown-3');
    const antes = document.querySelectorAll;
    document.querySelectorAll = (sel) => (String(sel).includes('mention-dropdown') ? [dd] : []);
    const alvo = (dentro, botao) => ({ closest: (sel) => ((dentro && sel.includes('mention-dropdown-')) || (botao && sel.includes('showMentionDropdown')) ? {} : null) });
    const clicar = (a) => (docHandlers.mousedown || []).forEach(fn => fn({ target: a }));
    ok('há um ouvinte de clique no documento para fechar a lista do @', (docHandlers.mousedown || []).length >= 1);
    dd._cls.clear();
    clicar(alvo(false, false));
    ok('clique fora da lista: ela fecha', dd._cls.has('hidden'));
    ok('ao fechar, o bloco volta à camada normal', blocoEl.style.zIndex === '');
    dd._cls.clear();
    clicar(alvo(true, false));
    ok('clique dentro da lista: continua aberta (o item escolhido insere o campo)', !dd._cls.has('hidden'));
    clicar(alvo(false, true));
    ok('clique no botão "@ Inserir Campo": não fecha (ele é quem abre)', !dd._cls.has('hidden'));
    // aberta: o bloco da lista sobe acima dos blocos de baixo (senão eles são pintados por cima e a lista parece transparente)
    inputs['mention-dropdown-0'] = dd;
    RB.showMentionDropdown(0);
    ok('lista aberta: o bloco dela fica acima dos seguintes', !dd._cls.has('hidden') && blocoEl.style.zIndex === '60');
    RB.hideMentionDropdown && RB.hideMentionDropdown(0);
    delete inputs['mention-dropdown-0'];
    document.querySelectorAll = antes;
}

// ---------------------------------------------------------------- Página real (beta): a Folha A4 Interativa é o próprio relatorio_view.html em um iframe
{
    const attrs = {};
    const posts = [];
    const frame = { style: {}, contentWindow: { postMessage: (m, origem) => posts.push({ m, origem }) }, getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = v; } };
    const mkToggle = () => { const cls = new Set(); return { cls, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }, contains: (c) => cls.has(c) } }; };
    const classica = mkToggle(), real = mkToggle(), botao = mkToggle();
    const antes = { classica: sheet['a4-classica'], real: sheet['a4-real'] };
    Object.assign(sheet, { 'a4-real-frame': frame, 'a4-classica': classica, 'a4-real': real, 'btn-folha-real': botao });
    const tpl = RA.getReportTemplates('f1')[0];
    tpl.blocos = [{ id: 'h1', tipo: 'cabecalho', titulo: 'Ficha' }, { id: 'g1', tipo: 'grade_campos', titulo: 'Dados', colunasLayout: 2, campos_selecionados: ['a'] }];
    RA.saveReportTemplate(tpl);
    store.constructive_folha_real = '0';
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
    ok('quem escolheu a folha clássica a mantém: clássica visível, iframe sem endereço', !classica.cls.has('hidden') && real.cls.has('hidden') && !('src' in attrs));

    RB.alternarFolhaReal();
    eq('ligar a página real: guarda a escolha, esconde a folha clássica e aponta o iframe para o relatório em modo edição', [store.constructive_folha_real, classica.cls.has('hidden'), real.cls.has('hidden'), attrs.src], ['1', true, false, 'relatorio_view.html?modo=edicao']);
    const timers = [];
    ok('modelo só é enviado depois que a página avisa que está pronta', posts.length === 0);
    const msg = (data, fonte, origem) => (winHandlers.message || []).forEach(fn => fn({ data, source: fonte === undefined ? frame.contentWindow : fonte, origin: origem || 'http://localhost:8080' }));
    msg({ tipo: 'construtor:pronto' });
    ok('ao ficar pronta, recebe o modelo (payload da prévia com a feição de teste) na mesma origem', posts.length === 1 && posts[0].origem === 'http://localhost:8080' && posts[0].m.tipo === 'construtor:dados' && posts[0].m.payload.preview === true && posts[0].m.payload.template.blocos.length === 2 && posts[0].m.payload.featureKey === 'exemplo-previa');
    msg({ tipo: 'construtor:altura', altura: 2345.2 });
    eq('o iframe ganha a altura do conteúdo (sem rolagem própria)', frame.style.height, '2346px');
    msg({ tipo: 'construtor:altura', altura: 999 }, {});
    msg({ tipo: 'construtor:altura', altura: 999 }, frame.contentWindow, 'http://outro.site');
    eq('mensagem de outra janela ou de outra origem é ignorada', frame.style.height, '2346px');
    // ações da moldura de edição: só as permitidas
    msg({ tipo: 'construtor:acao', nome: 'removeBlock', args: [1] });
    pendentes.splice(0).forEach(fn => fn());
    const ultimo = posts[posts.length - 1].m.payload;
    ok('ação removeBlock vinda da página remove o bloco e o novo modelo é enviado para a página', posts.length >= 2 && ultimo.template.blocos.length === 1 && ultimo.template.blocos[0].tipo === 'cabecalho');
    // edição vinda da página: título por duplo clique e nova ordem dos campos
    tpl.blocos = [{ id: 'h1', tipo: 'cabecalho', titulo: 'Ficha' }, { id: 'g1', tipo: 'grade_campos', titulo: 'Dados', colunasLayout: 2, campos_selecionados: ['a', 'b', 'c'] }, { id: 't1', tipo: 'caixa_texto_livre', conteudo: 'x', espacamento: '1.6' }];
    RA.saveReportTemplate(tpl);
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
    msg({ tipo: 'construtor:acao', nome: 'atualizarPropriedade', args: [1, 'titulo', 'Título novo'] });
    msg({ tipo: 'construtor:acao', nome: 'reordenarCampos', args: [1, ['c', 'a', 'b']] });
    pendentes.splice(0).forEach(fn => fn());
    const ult = posts[posts.length - 1].m.payload.template.blocos[1];
    eq('atualizarPropriedade e reordenarCampos vindos da página mudam o modelo enviado de volta', [ult.titulo, ult.campos_selecionados], ['Título novo', ['c', 'a', 'b']]);
    msg({ tipo: 'construtor:acao', nome: 'saveFreeTextContent', args: [2, '<i>y</i>'] });
    msg({ tipo: 'construtor:acao', nome: 'changeLineHeight', args: [2, '2.0'] });
    const salvoTexto = RA.getReportTemplates('f1')[0].blocos[2];
    eq('texto livre editado na página: conteúdo e espaçamento gravados no modelo', [salvoTexto.conteudo, salvoTexto.espacamento], ['<i>y</i>', '2.0']);
    msg({ tipo: 'construtor:acao', nome: 'deleteCurrentTemplate', args: [] });
    ok('ação fora da lista permitida é ignorada (não apaga o modelo)', RA.getReportTemplates('f1').length >= 1);

    RB.alternarFolhaReal();
    eq('desligar volta à folha clássica', [store.constructive_folha_real, classica.cls.has('hidden'), real.cls.has('hidden')], ['0', false, true]);
    delete store.constructive_folha_real;
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
    ok('sem escolha guardada, a página real é o padrão (folha clássica escondida)', classica.cls.has('hidden') && !real.cls.has('hidden'));
    ['a4-real-frame', 'btn-folha-real'].forEach(k => delete sheet[k]);
    if (antes.classica) sheet['a4-classica'] = antes.classica; else delete sheet['a4-classica'];
    if (antes.real) sheet['a4-real'] = antes.real; else delete sheet['a4-real'];
}

// ---------------------------------------------------------------- Cards do painel lateral: uma cor fixa por tipo de informação
{
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
    const h = container.innerHTML;
    const cor = (id, c) => h.includes('data-cor-card="' + id + '"') && h.includes('border-l-' + c + '-500');
    ok('cards: folha=cinza, cabeçalho=índigo, texto livre=violeta, campos=azul, quadros 1:N=âmbar, mapa=verde, rodapé=ciano', cor('acc-layout', 'slate') && cor('acc-header', 'indigo') && cor('acc-free-text', 'violet') && cor('acc-grid', 'sky') && cor('acc-photos', 'amber') && cor('acc-map', 'emerald') && cor('acc-text-footer', 'cyan'));
    ok('cards: o corpo de cada card tem o tom da sua cor (fundo) e o ícone tem a cor cheia', h.includes('bg-indigo-50/70') && h.includes('bg-indigo-600 text-white') && h.includes('bg-emerald-50/70') && h.includes('bg-amber-50/70'));
    const cores = ['slate', 'indigo', 'violet', 'sky', 'amber', 'emerald', 'cyan'];
    ok('cards: cada tipo de informação tem cor diferente', new Set(cores).size === cores.length);
}

// ---------------------------------------------------------------- Painel lateral: abas da grade e seções do Quadro Analítico e Sintético expansíveis
{
    const forms0 = window.forms[0];
    forms0.tabs = forms0.tabs.filter(t => t.id !== 't_h');
    forms0.tabs.push({ id: 't_h', title: 'PF', isMultiple: true, fields: [{ id: 'h_d', label: 'Data', type: 'date' }] });
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
    let h = container.innerHTML;
    const balanco = (s) => (s.split('<div').length - 1) - (s.split('</div>').length - 1);
    eq('painel: as marcas <div> e </div> continuam equilibradas (nenhuma seção ficou aberta ou fechada a mais)', balanco(h), 0);
    ok('grade: cada aba é expansível (seta, corpo próprio); a 1ª aba abre por padrão e as outras ficam recolhidas', h.includes("ReportBuilder.toggleAccordionTab('cfg-grid-tab-body-t1')") && h.includes('id="cfg-grid-tab-body-t1"') && h.includes('id="cfg-grid-tab-body-t_h"') && /id="cfg-grid-tab-body-t1" class="[^"]*"/.exec(h)[0].indexOf('hidden') < 0 && /id="cfg-grid-tab-body-t_h" class="[^"]*hidden/.test(h));
    ok('quadro: "1. Tabela Sintética" e "2. Laudo Analítico" têm cabeçalho clicável com seta e corpo próprio, abertos por padrão', h.includes("ReportBuilder.toggleAccordionTab('sec-tabela-sintetica')") && h.includes('id="sec-tabela-sintetica"') && h.includes("ReportBuilder.toggleAccordionTab('sec-laudo-analitico')") && h.includes('id="sec-laudo-analitico"') && !/id="sec-tabela-sintetica" class="[^"]*hidden/.test(h) && !/id="sec-laudo-analitico" class="[^"]*hidden/.test(h));
    // a escolha do usuário sobrevive ao redesenho do painel
    const alvo = { classList: { _s: new Set(), toggle(c) { if (this._s.has(c)) this._s.delete(c); else this._s.add(c); }, contains(c) { return this._s.has(c); } } };
    inputs['sec-tabela-sintetica'] = alvo;
    RB.toggleAccordionTab('sec-tabela-sintetica');
    delete inputs['sec-tabela-sintetica'];
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
    h = container.innerHTML;
    ok('seção recolhida continua recolhida depois que o painel é redesenhado', /id="sec-tabela-sintetica" class="[^"]*hidden/.test(h) && !/id="sec-laudo-analitico" class="[^"]*hidden/.test(h));
    RB.toggleAccordionTab && (inputs['sec-tabela-sintetica'] = { classList: { toggle() {}, contains: () => true } });
    RB.toggleAccordionTab('sec-tabela-sintetica'); // reabre
    delete inputs['sec-tabela-sintetica'];
}

// ---------------------------------------------------------------- Relatório Geral (camada): teste geral dos cards e das inserções
{
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'geral' });
    const h = container.innerHTML;
    const geral = () => RA.getReportTemplates('f1').find(t => t.tipo === 'geral') || {};
    ok('geral: mostra só os cards da camada (folha, cabeçalho, texto livre, gráficos, rodapé)', ['Configuração da Folha', 'Cabeçalho Institucional', 'Caixa de texto livre', 'Gráficos do Dashboard', 'Rodapé Oficial'].every(x => h.includes(x)));
    ok('geral: não mostra os cards do relatório individual (grade, mapa, quadro 1:N)', !h.includes('Grade de Atributos') && !h.includes('Mini-Mapa') && !h.includes('Quadro Analítico'));
    eq('geral: o modelo padrão traz cabeçalho, gráficos e rodapé', [geral().tipo, (geral().blocos || []).map(b => b.tipo)], ['geral', ['cabecalho', 'grafico_existente', 'rodape']]);
}

console.log(`reportScope: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
