// tests/builderLaudoPreview.test.js
// Executa a pré-visualização do Laudo Analítico e a sequência de abas do CONSTRUTOR (src/reportBuilder.js).
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
const load = new Function('state', 'window', 'document', 'ReportAdapter', 'onRerender', `
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
    return { getLaudoPreviewTabs, renderLaudoPreview, renderLaudoTabSequenceList, ensureLaudoFieldSelection,
             move1nLaudoTabSequence, isFileField, fileFieldMode, fileModeToggleHtml, setFieldFileMode, laudoSampleHtml, getOrder: () => current1nTabOrder, setTemplate: (t) => { currentTemplate = t; } };
`);
const api = load(state, window, document, ReportAdapter, () => { rerenders++; });

let total = 0;
let failed = 0;
function ok(name, cond) { total++; if (cond) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

const mkTemplate = (bloco) => ({ form_id: 'form1', blocos: [Object.assign({ id: 'b1', tipo: 'galeria_fotos' }, bloco)] });

// ---------------------------------------------------------------- abas do laudo
const tabs = api.getLaudoPreviewTabs(formFields);
eq('abas do laudo: consolidada fica de fora', tabs.map(t => t.id), ['t_dados', 't_mpf', 't_pf', 't_spu']);
eq('campos agrupados na aba certa (PF tem 5, incluindo a foto)', tabs.find(t => t.id === 't_pf').fields.length, 5);

// ---------------------------------------------------------------- pré-visualização: abas ABERTAS, na sequência escolhida
let bloco = { abas_selecionadas: ['t_pf', 't_spu'], ordem_abas: ['t_spu', 't_pf'], campos_selecionados: [] };
api.setTemplate(mkTemplate(bloco));
let html = api.renderLaudoPreview(bloco, 0, formFields);
ok('cada aba é uma seção ABERTA (<details open>)', (html.match(/<details open/g) || []).length === 2);
ok('sequência escolhida: SPU antes de PF', html.indexOf('Aba / Ente: SPU') < html.indexOf('Aba / Ente: PF'));
ok('campos da aba aparecem para editar (arraste, largura, remover)',
    html.includes('data-field-id="pf_ocup"') && html.includes('field-drag-handle') && html.includes('changeFieldWidthStep') && html.includes('removeFieldFromAnalytical1n'));
ok('container do arraste por aba', html.includes('a4-grid-fields-container'));
ok('campo repetido em outra aba aparece nas duas (ids diferentes)', html.includes('data-field-id="pf_ocup"') && html.includes('data-field-id="spu_ocup"'));
ok('foto fica fora da grade e vira área de fotos', !html.includes('data-field-id="pf_fotos"') && html.includes('Legenda da foto'));
ok('aba ainda não escolhida (MPF) não aparece', !html.includes('Aba / Ente: MPF'));

// campo 1:N: exibido na íntegra (título, número e link)
ok('campo 1:N de link mostra título, número e endereço', html.includes('Título 1') && html.includes('Número 1') && html.includes('https://endereço-do-link-1'));
ok('campo 1:N mostra vários itens', html.includes('Título 2'));
ok('data mostra o formato de data', html.includes('14/08/2026'));
ok('textarea indica exibição na íntegra', html.includes('exibido na íntegra'));

// seleção padrão materializada (sem escolha válida → todos os campos, exceto fotos)
eq('seleção padrão criada com campos reais das abas', bloco.campos_selecionados.map(c => c.id),
    ['spu_data', 'spu_ocup', 'pf_data', 'pf_ocup', 'pf_obs', 'pf_links']);
ok('seleção padrão foi salva no modelo', saved.length >= 1);

// seleção com ids legados é substituída
bloco = { abas_selecionadas: ['t_pf'], campos_selecionados: [{ id: 'data', label: 'Data' }, { id: 'conclusao', label: 'Conclusão' }] };
api.setTemplate(mkTemplate(bloco));
api.renderLaudoPreview(bloco, 0, formFields);
ok('ids legados (data/conclusao) trocados por campos reais', bloco.campos_selecionados.every(c => formFields.some(f => f.id === c.id)));

// só os campos escolhidos, na ordem escolhida
bloco = { abas_selecionadas: ['t_pf'], campos_selecionados: [{ id: 'pf_obs', tabId: 't_pf' }, { id: 'pf_data', tabId: 't_pf' }] };
api.setTemplate(mkTemplate(bloco));
html = api.renderLaudoPreview(bloco, 0, formFields);
ok('só os campos escolhidos aparecem', html.includes('data-field-id="pf_obs"') && html.includes('data-field-id="pf_data"') && !html.includes('data-field-id="pf_ocup"'));
ok('na ordem escolhida (Observações antes de Data)', html.indexOf('data-field-id="pf_obs"') < html.indexOf('data-field-id="pf_data"'));

// largura salva e padrão largo para tipos longos
bloco = { abas_selecionadas: ['t_pf'], campos_selecionados: [{ id: 'pf_obs', tabId: 't_pf' }, { id: 'pf_data', tabId: 't_pf' }], campos_larguras: { pf_data: 33 } };
api.setTemplate(mkTemplate(bloco));
html = api.renderLaudoPreview(bloco, 0, formFields);
ok('largura salva (33%) é respeitada', html.includes('>33%</button>'));
ok('textarea nasce com 100%', html.includes('>100%</button>'));

// título da aba editável
bloco = { abas_selecionadas: ['t_pf'], custom_tab_title_t_pf: 'Polícia Federal — Vistorias' };
api.setTemplate(mkTemplate(bloco));
ok('título de aba editado aparece na prévia', api.renderLaudoPreview(bloco, 0, formFields).includes('Polícia Federal — Vistorias'));

// sem abas escolhidas e sem 1:N → aviso
bloco = { abas_selecionadas: ['inexistente'] };
api.setTemplate(mkTemplate(bloco));
html = api.renderLaudoPreview(bloco, 0, formFields);
ok('sem aba escolhida cai nas abas 1:N (PF e SPU)', html.includes('Aba / Ente: PF') && html.includes('Aba / Ente: SPU'));

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

// ---------------------------------------------------------------- a mesma sequência vale na prévia
html = api.renderLaudoPreview(tpl.blocos[0], 0, formFields);
ok('prévia usa a nova sequência', html.indexOf('Aba / Ente: SPU') < html.indexOf('Aba / Ente: PF'));


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
ok('amostra em lista mostra título + arquivo', api.laudoSampleHtml(anexo, 'lista').includes('arquivo-1'));
ok('amostra em imagem mostra título, arquivo, autor e data', /Título/.test(api.laudoSampleHtml(anexo, 'imagem')) && api.laudoSampleHtml(anexo, 'imagem').includes('Enviado por'));

bloco = { abas_selecionadas: ['t_pf'], campos_selecionados: [{ id: 'pf_obs', tabId: 't_pf' }] };
const tplF = mkTemplate(bloco);
api.setTemplate(tplF);
html = api.renderLaudoPreview(bloco, 0, formFields);
ok('laudo: foto em imagem por padrão (miniatura com legenda)', html.includes('Legenda da foto') && html.includes("'imagem', event"));
const before = saved.length, rr = rerenders;
api.setFieldFileMode(0, 'pf_fotos', 'lista', null);
eq('escolha gravada em campos_exibicao', tplF.blocos[0].campos_exibicao, { pf_fotos: 'lista' });
ok('modelo salvo e folha redesenhada', saved.length > before && rerenders > rr);
html = api.renderLaudoPreview(tplF.blocos[0], 0, formFields);
ok('laudo: modo lista troca a miniatura pela lista', !html.includes('Legenda da foto') && html.includes('arquivo-1'));
api.setFieldFileMode(0, 'pf_fotos', 'invalido', null);
eq('modo inválido é ignorado', tplF.blocos[0].campos_exibicao.pf_fotos, 'lista');

// grade de atributos (renderA4Blocks): seletor e amostra por modo
ok('grade de atributos usa o seletor e a amostra por modo',
    src.includes('${fileModeToggleHtml(index, f, fileFieldMode(bloco, f))}') && src.includes('${isFileField(f)') && src.includes('setFieldFileMode,'));

console.log(`builderLaudoPreview: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
