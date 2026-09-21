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
const forms = [{
    id: 'f1', name: 'MPF',
    tabs: [{ id: 't1', title: 'Dados', isPrimary: true, fields: [{ id: 'a', label: 'Nome', type: 'text' }] },
           { id: 't_rel', title: 'Relatórios', tabType: 'reports', isReportsTab: true, fields: [] }],
    statsConfig: [{ id: 'g1', title: 'Situação do recuo', type: 'pie', fieldId: 'a', fieldLabel: 'Nome' }]
}];
const winHandlers = {};
const window = { localStorage, forms, currentFormId: 'f1', location: { origin: 'http://localhost:8080' }, addEventListener(t, fn) { (winHandlers[t] = winHandlers[t] || []).push(fn); } };
window.window = window;
const ctx = { window, document, localStorage, forms, console, setTimeout: (fn) => { pendentes.push(fn); return 0; }, clearTimeout() {}, alert() {}, confirm: () => true, navigator: {} };
ctx.self = window;
vm.createContext(ctx);
['src/pageSize.js', 'src/mapTools.js', 'src/fieldFormatter.js', 'src/reportData.js', 'src/reportBlocks.js', 'src/reportEditor.js', 'src/reportFreeText.js', 'src/reportPreview.js', 'src/reportAdapter.js', 'src/reportBuilder.js'].forEach(f => vm.runInContext(read(f), ctx, { filename: f }));
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
ok('individual: botão "Ver como sairá" abre o relatório real com a feição de teste; o geral não tem', has(html, 'ReportBuilder.previewReal()') && has(html, 'Ver como sairá') && typeof RB.previewReal === 'function');
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
    delete store.constructive_folha_real;
    RB.initReportBuilderTab('f1', 'MPF', { scope: 'individual' });
    ok('página real desligada por padrão: folha clássica visível, iframe sem endereço', !classica.cls.has('hidden') && real.cls.has('hidden') && !('src' in attrs));

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
    ['a4-real-frame', 'btn-folha-real'].forEach(k => delete sheet[k]);
    if (antes.classica) sheet['a4-classica'] = antes.classica; else delete sheet['a4-classica'];
    if (antes.real) sheet['a4-real'] = antes.real; else delete sheet['a4-real'];
}

console.log(`reportScope: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
