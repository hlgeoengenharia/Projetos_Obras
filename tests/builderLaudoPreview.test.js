// tests/builderLaudoPreview.test.js
// Executa, no CONSTRUTOR (src/reportBuilder.js), a escolha das abas e dos campos do Laudo Analítico, a sequência das abas e o formato de fotos/anexos.
// (O desenho do laudo na folha é o do relatório, em src/reportBlocks.js; o construtor com os controles está em tests/reportScope.test.js.)
// Rodar com: node tests/builderLaudoPreview.test.js

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'reportBuilder.js'), 'utf8');
const lines = src.split(/\r?\n/);

function extractFunction(name) {
    const start = lines.findIndex(l => l.startsWith(`    function ${name}(`));
    if (start < 0) throw new Error(`função ${name} não encontrada em reportBuilder.js`);
    let end = start;
    while (lines[end] !== '    }') end++;
    return lines.slice(start, end + 1).join('\n');
}

// região dos helpers do laudo: do comentário de abertura até o fim de move1nLaudoTabSequence
const regionStart = lines.findIndex(l => l.includes('LAUDO ANALÍTICO 1:N — pré-visualização')) - 1;
const lastFn = lines.findIndex(l => l.startsWith('    function move1nLaudoTabSequence('));
let regionEnd = lastFn;
while (lines[regionEnd] !== '    }') regionEnd++;
const region = lines.slice(regionStart, regionEnd + 1).join('\n');

// ---------------------------------------------------------------- ambiente simulado
const saved = [];
const state = {
    currentTemplate: null,
    current1nLaudoDensity: 'compact',
    current1nLaudoRowStriping: 'slate',
    current1nTabOrder: [],
    current1nLaudoSelectedTabs: new Set()
};
let rerenders = 0;

const tabsMeta = [
    { id: 't_dados', title: 'Dados do Imóvel', isMultiple: false },
    { id: 't_mpf', title: 'MPF', isMultiple: false },
    { id: 't_pf', title: 'PF', isMultiple: true },
    { id: 't_spu', title: 'SPU', isMultiple: true },
    { id: 't_hist', title: 'Histórico', isMultiple: false, tabType: 'consolidated' }
];
const F = (id, label, type, tab) => ({ id, label, type, tabId: tab.id, tabTitle: tab.title, isMultiple: tab.isMultiple });
const byId = Object.fromEntries(tabsMeta.map(t => [t.id, t]));
const formFields = [
    F('f_prop', 'Proprietário', 'text', byId.t_dados),
    F('f_ipl', 'IPL', 'ipl', byId.t_mpf),
    F('pf_data', 'Data da vistoria', 'date', byId.t_pf),
    F('pf_ocup', 'Situação da ocupação', 'select', byId.t_pf),
    F('pf_obs', 'Observações', 'textarea', byId.t_pf),
    F('pf_links', 'Processos', 'hiperlink_1n', byId.t_pf),
    F('pf_fotos', 'Fotos', 'photo', byId.t_pf),
    F('spu_data', 'Data da vistoria', 'date', byId.t_spu),
    F('spu_ocup', 'Situação da ocupação', 'select', byId.t_spu)
];
const ReportAdapter = {
    getFormTabs: () => tabsMeta,
    getFormFields: () => formFields,
    saveReportTemplate: (t) => { saved.push(JSON.parse(JSON.stringify(t))); }
};
const document = { getElementById: () => null };
const window = { ReportAdapter };

// eslint-disable-next-line no-new-func
const ReportEditor = require('../src/reportEditor.js');
const load = new Function('state', 'window', 'document', 'ReportAdapter', 'onRerender', 'ReportEditor', `
    // formato de fotos/anexos: agora em src/reportEditor.js (o construtor e a página real usam o mesmo)
    const { isFileField, fileFieldMode } = ReportEditor;
    const fileModeToggleHtml = (i, f, m) => ReportEditor.create({}).fileModeToggleHtml(i, f, m);
    let currentTemplate = state.currentTemplate;
    let current1nLaudoDensity = state.current1nLaudoDensity;
    let current1nLaudoRowStriping = state.current1nLaudoRowStriping;
    let current1nTabOrder = state.current1nTabOrder;
    const current1nLaudoSelectedTabs = state.current1nLaudoSelectedTabs;
    function sync1nSelectedFieldsFromDOM() {}
    function renderA4Blocks() { onRerender(); }
    ${extractFunction('escapeHtml')}
    ${extractFunction('getFieldWidthStyle')}
    ${region}
    return { getLaudoPreviewTabs, laudoTabsSelecionadas, renderLaudoTabSequenceList, ensureLaudoFieldSelection,
             move1nLaudoTabSequence, isFileField, fileFieldMode, fileModeToggleHtml, setFieldFileMode, getOrder: () => current1nTabOrder, setTemplate: (t) => { currentTemplate = t; } };
`);
const api = load(state, window, document, ReportAdapter, () => { rerenders++; }, ReportEditor);

let total = 0;
let failed = 0;
function ok(name, cond) { total++; if (cond) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

const mkTemplate = (bloco) => ({ form_id: 'form1', blocos: [Object.assign({ id: 'b1', tipo: 'galeria_fotos' }, bloco)] });

// ---------------------------------------------------------------- abas do laudo
const tabs = api.getLaudoPreviewTabs(formFields);
eq('abas do laudo: consolidada fica de fora', tabs.map(t => t.id), ['t_dados', 't_mpf', 't_pf', 't_spu']);
eq('campos agrupados na aba certa (PF tem 5, incluindo a foto)', tabs.find(t => t.id === 't_pf').fields.length, 5);

// ---------------------------------------------------------------- abas escolhidas, na sequência definida pelo usuário
let bloco = { abas_selecionadas: ['t_pf', 't_spu'], ordem_abas: ['t_spu', 't_pf'], campos_selecionados: [] };
api.setTemplate(mkTemplate(bloco));
let escolhidas = api.laudoTabsSelecionadas(bloco, formFields);
eq('sequência escolhida: SPU antes de PF', escolhidas.map(t => t.id), ['t_spu', 't_pf']);
ok('aba ainda não escolhida (MPF) não entra', !escolhidas.some(t => t.id === 't_mpf'));

// seleção padrão materializada (sem escolha válida → todos os campos, exceto fotos)
api.ensureLaudoFieldSelection(bloco, escolhidas);
eq('seleção padrão criada com campos reais das abas', bloco.campos_selecionados.map(c => c.id),
    ['spu_data', 'spu_ocup', 'pf_data', 'pf_ocup', 'pf_obs', 'pf_links']);
ok('seleção padrão foi salva no modelo', saved.length >= 1);

// seleção com ids legados é substituída
bloco = { abas_selecionadas: ['t_pf'], campos_selecionados: [{ id: 'data', label: 'Data' }, { id: 'conclusao', label: 'Conclusão' }] };
api.setTemplate(mkTemplate(bloco));
api.ensureLaudoFieldSelection(bloco, api.laudoTabsSelecionadas(bloco, formFields));
ok('ids legados (data/conclusao) trocados por campos reais', bloco.campos_selecionados.every(c => formFields.some(f => f.id === c.id)));

// seleção válida é preservada (só os campos escolhidos, na ordem escolhida)
bloco = { abas_selecionadas: ['t_pf'], campos_selecionados: [{ id: 'pf_obs', tabId: 't_pf' }, { id: 'pf_data', tabId: 't_pf' }] };
api.setTemplate(mkTemplate(bloco));
api.ensureLaudoFieldSelection(bloco, api.laudoTabsSelecionadas(bloco, formFields));
eq('seleção válida e sua ordem não mudam', bloco.campos_selecionados.map(c => c.id), ['pf_obs', 'pf_data']);

// abas deduzidas dos campos escolhidos; sem nada válido cai nas abas 1:N
bloco = { campos_selecionados: [{ id: 'spu_data', tabId: 't_spu' }] };
eq('sem abas escolhidas: deduz as abas dos campos escolhidos', api.laudoTabsSelecionadas(bloco, formFields).map(t => t.id), ['t_spu']);
bloco = { abas_selecionadas: ['inexistente'] };
eq('aba inexistente: cai nas abas 1:N (PF e SPU)', api.laudoTabsSelecionadas(bloco, formFields).map(t => t.id).sort(), ['t_pf', 't_spu']);

// ---------------------------------------------------------------- sequência das abas no card
state.current1nLaudoSelectedTabs.add('t_pf');
state.current1nLaudoSelectedTabs.add('t_spu');
bloco = { abas_selecionadas: ['t_pf', 't_spu'], campos_selecionados: [{ id: 'pf_data', tabId: 't_pf' }] };
const tpl = mkTemplate(bloco);
api.setTemplate(tpl);
let list = api.renderLaudoTabSequenceList();
ok('lista mostra só as abas do laudo', list.includes('>PF<') && list.includes('>SPU<') && !list.includes('>MPF<'));
ok('primeira aba sem "subir" e última sem "descer"', (list.match(/ disabled class=/g) || []).length === 2);
const orderBefore = api.getOrder().filter(id => id === 't_pf' || id === 't_spu');
eq('ordem inicial: PF antes de SPU', orderBefore, ['t_pf', 't_spu']);

api.move1nLaudoTabSequence('t_spu', -1);
eq('mover SPU para cima inverte a ordem', api.getOrder().filter(id => id === 't_pf' || id === 't_spu'), ['t_spu', 't_pf']);
eq('sequência gravada no bloco do laudo', tpl.blocos[0].ordem_abas.filter(id => id === 't_pf' || id === 't_spu'), ['t_spu', 't_pf']);
ok('folha A4 é redesenhada', rerenders >= 1);
ok('modelo é salvo', saved.length >= 1);
list = api.renderLaudoTabSequenceList();
ok('lista reflete a nova ordem (SPU primeiro)', list.indexOf('>SPU<') < list.indexOf('>PF<'));

api.move1nLaudoTabSequence('t_spu', -1); // já é o primeiro: nada muda
eq('mover o primeiro para cima não faz nada', api.getOrder().filter(id => id === 't_pf' || id === 't_spu'), ['t_spu', 't_pf']);

// ---------------------------------------------------------------- a mesma sequência vale nas abas do laudo
eq('abas do laudo seguem a nova sequência', api.laudoTabsSelecionadas(tpl.blocos[0], formFields).map(t => t.id), ['t_spu', 't_pf']);


// ---------------------------------------------------------------- fotos/anexos: "Lista" x "Imagem na íntegra"
const fotos = formFields.find(f => f.id === 'pf_fotos');
const texto = formFields.find(f => f.id === 'pf_obs');
const anexo = { id: 'pf_anexo', label: 'Anexos', type: 'attachment' };
ok('só foto e anexo têm seletor', api.isFileField(fotos) && api.isFileField(anexo) && !api.isFileField(texto));
eq('foto: padrão é imagem', api.fileFieldMode({}, fotos), 'imagem');
eq('anexo: padrão é lista', api.fileFieldMode({}, anexo), 'lista');
eq('escolha salva vale', api.fileFieldMode({ campos_exibicao: { pf_fotos: 'lista' } }, fotos), 'lista');
eq('valor inválido cai no padrão', api.fileFieldMode({ campos_exibicao: { pf_fotos: 'x' } }, fotos), 'imagem');
ok('seletor não aparece em campo comum', api.fileModeToggleHtml(0, texto, 'lista') === '');
const tog = api.fileModeToggleHtml(3, fotos, 'lista');
ok('seletor tem os dois botões e chama a ação', tog.includes('view_list') && tog.includes('>image<') && tog.includes("ReportBuilder.setFieldFileMode(3, 'pf_fotos', 'imagem', event)"));

bloco = { abas_selecionadas: ['t_pf'], campos_selecionados: [{ id: 'pf_obs', tabId: 't_pf' }] };
const tplF = mkTemplate(bloco);
api.setTemplate(tplF);
const before = saved.length, rr = rerenders;
api.setFieldFileMode(0, 'pf_fotos', 'lista', null);
eq('escolha gravada em campos_exibicao', tplF.blocos[0].campos_exibicao, { pf_fotos: 'lista' });
ok('modelo salvo e folha redesenhada', saved.length > before && rerenders > rr);
api.setFieldFileMode(0, 'pf_fotos', 'invalido', null);
eq('modo inválido é ignorado', tplF.blocos[0].campos_exibicao.pf_fotos, 'lista');

// grade de atributos e laudo (renderA4Blocks): usam o seletor de formato do arquivo
ok('grade de atributos e laudo usam o seletor de formato', fs.readFileSync(path.join(__dirname, '..', 'src', 'reportEditor.js'), 'utf8').includes('fileModeToggleHtml(index, f, fileFieldMode(') && src.includes('setFieldFileMode,'));

console.log(`builderLaudoPreview: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
