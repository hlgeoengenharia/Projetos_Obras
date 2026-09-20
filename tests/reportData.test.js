// tests/reportData.test.js
// Testes da camada de dados dos relatórios (abas visíveis, registros 1:N/1:1, colunas por campo).
// Rodar com: node tests/reportData.test.js

const RD = require('../src/reportData.js');

let total = 0;
let failed = 0;
const norm = (s) => String(s).replace(/ /g, ' ');
function eq(name, actual, expected) {
    total++;
    const a = typeof actual === 'string' ? norm(actual) : JSON.stringify(actual);
    const e = typeof expected === 'string' ? norm(expected) : JSON.stringify(expected);
    if (a === e) return;
    failed++;
    console.error(`  FALHOU: ${name}\n     esperado: ${e}\n     obtido:   ${a}`);
}

// ---------------------------------------------------------------- formulário de exemplo (estrutura do MPF)
const histFields = (p) => ([
    { id: `${p}_data`, label: 'Data da vistoria', type: 'date' },
    { id: `${p}_ocup`, label: 'Situação da ocupação', type: 'select' },
    { id: `${p}_recuo`, label: 'Situação do recuo', type: 'select' },
    { id: `${p}_area`, label: 'Área invadida (m²)', type: 'area_m2' },
    { id: `${p}_obs`, label: 'Observações', type: 'textarea' },
    { id: `${p}_fotos`, label: 'Fotos', type: 'photo' },
    { id: `${p}_links`, label: 'Processos', type: 'hiperlink_1n' }
]);

const tabs = [
    { id: 't_dados', title: 'Dados do Imóvel', isMultiple: false,
      fields: [{ id: 'f_insc', label: 'Inscrição', type: 'insc_imob_cabedelo' }, { id: 'f_prop', label: 'Proprietário', type: 'text' }, { id: 'f_status', label: 'Status', type: 'select' }] },
    { id: 't_mpf', title: 'MPF', isMultiple: false, isPrimary: true,
      fields: [{ id: 'f_ipl', label: 'IPL', type: 'ipl' }, { id: 'f_dist', label: 'Distribuição', type: 'select' }] },
    { id: 't_pf', title: 'PF', isMultiple: true, fields: histFields('pf') },
    { id: 't_spu', title: 'SPU', isMultiple: true, fields: histFields('spu') },
    { id: 't_mun', title: 'Município', isMultiple: true,
      condition: { enabled: true, fieldId: 'f_status', operator: 'equals', value: 'Regular' }, fields: histFields('mun') },
    { id: 't_hist', title: 'Histórico de ocupação', tabType: 'consolidated', targetTabIds: ['t_pf', 't_spu', 't_mun'], fields: [] },
    { id: 'orcamento_obra', title: 'Orçamento', isNative: true, tabType: 'orcamento_nativo', fields: [] }
];

const data = {
    f_insc: '1000402804052100398', f_prop: 'Maria', f_status: 'Regular',
    f_ipl: '00012345620258150001', f_dist: '2ª Vara',
    t_pf: JSON.stringify([
        { pf_data: '2026-01-10', pf_ocup: 'Irregular', pf_recuo: 'Não recuou', pf_area: '120.5', pf_obs: 'PF 1' },
        { pf_data: '2026-08-15', pf_ocup: 'Regular', pf_area: '10,00',
          pf_fotos: JSON.stringify([{ url: 'https://x/1.jpg', name: '1.jpg' }, { url: 'https://x/2.jpg', deleted: true }]) }
    ]),
    t_spu: [{ spu_data: '2026-03-01', spu_ocup: 'Em análise' }],
    t_mun: '[]'
};

// ---------------------------------------------------------------- condição e permissão
eq('condição equals satisfeita → aba visível', RD.evaluateTabCondition(tabs[4], data), true);
eq('condição equals NÃO satisfeita → aba oculta', RD.evaluateTabCondition(tabs[4], { f_status: 'Irregular' }), false);
eq('condição not_equals exige preenchido',
    RD.evaluateTabCondition({ condition: { enabled: true, fieldId: 'x', operator: 'not_equals', value: 'a' } }, {}), false);
eq('condição not_equals preenchido e diferente',
    RD.evaluateTabCondition({ condition: { enabled: true, fieldId: 'x', operator: 'not_equals', value: 'a' } }, { x: 'b' }), true);
eq('operador desconhecido esconde (igual ao card)',
    RD.evaluateTabCondition({ condition: { enabled: true, fieldId: 'x', operator: 'foo', value: 'a' } }, { x: 'a' }), false);
eq('sem condição → visível', RD.evaluateTabCondition(tabs[2], data), true);

const visAll = RD.visibleTabs(tabs, data);
eq('abas visíveis (sem permissões): nativa fica de fora', visAll.map(t => t.id), ['t_dados', 't_mpf', 't_pf', 't_spu', 't_mun', 't_hist']);

const visNoSpu = RD.visibleTabs(tabs, data, { canSeeTab: (t) => t.id !== 't_spu' && t.id !== 't_mpf' });
eq('permissão de aba retira SPU e MPF', visNoSpu.map(t => t.id), ['t_dados', 't_pf', 't_mun', 't_hist']);

const visCond = RD.visibleTabs(tabs, { f_status: 'Irregular' });
eq('condição não satisfeita retira Município', visCond.map(t => t.id).includes('t_mun'), false);

// ---------------------------------------------------------------- filtro de dados (não vaza aba oculta)
const filtered = RD.filterData(data, tabs, visNoSpu);
eq('dado da aba SPU (1:N) removido', 't_spu' in filtered, false);
eq('campos da aba MPF (1:1) removidos', 'f_ipl' in filtered || 'f_dist' in filtered, false);
eq('dados de aba visível preservados', filtered.f_prop, 'Maria');
eq('1:N de aba visível preservado', typeof filtered.t_pf, 'string');
eq('original não é alterado', 'f_ipl' in data, true);

// ---------------------------------------------------------------- registros
const fi = RD.buildFieldIndex(tabs);
let recs = RD.buildRecords(tabs, data);
eq('padrão: só abas 1:N (PF 2 + SPU 1 + Município 0)', recs.map(r => `${r.tabTitle}#${r.index}`), ['PF#0', 'PF#1', 'SPU#0']);

recs = RD.buildRecords(tabs, data, { tabIds: ['t_mpf', 't_pf'] });
eq('seleção explícita inclui aba 1:1 como UM registro', recs.map(r => `${r.tabTitle}${r.single ? '(1:1)' : ''}`), ['MPF(1:1)', 'PF', 'PF']);

eq('aba 1:1 sem nenhum valor não gera registro', RD.buildRecords(tabs, {}, { tabIds: ['t_mpf'] }).length, 0);
eq('aba consolidada nunca é fonte', RD.buildRecords(tabs, data, { tabIds: ['t_hist'] }).length, 0);

// ordenação
const all = RD.buildRecords(tabs, data);
eq('mais recente primeiro (desc)', RD.sortRecords(all, 'desc').map(r => r.dateText), ['15/08/2026', '01/03/2026', '10/01/2026']);
eq('mais antigo primeiro (asc)', RD.sortRecords(all, 'asc').map(r => r.dateText), ['10/01/2026', '01/03/2026', '15/08/2026']);
eq('agrupado por aba (PF antes de SPU), data desc dentro do grupo',
    RD.sortRecords(all, 'desc', true, ['t_pf', 't_spu']).map(r => `${r.tabTitle} ${r.dateText}`),
    ['PF 15/08/2026', 'PF 10/01/2026', 'SPU 01/03/2026']);

// ---------------------------------------------------------------- colunas: lê pelo campo da PRÓPRIA aba
const ctx = { fieldIndex: fi };
const [pf0, pf1, spu0] = RD.sortRecords(all, 'asc').length ? [all[0], all[1], all[2]] : [];

// coluna mesclada entre abas (mesmo título, ids diferentes)
const colOcup = { id: 'ocup', label: 'Situação da ocupação', fieldIds: ['pf_ocup', 'spu_ocup', 'mun_ocup'] };
eq('coluna mesclada: registro da PF lê o campo da PF', RD.cellFor(colOcup, pf0, ctx).text, 'Irregular');
eq('coluna mesclada: registro do SPU lê o campo do SPU', RD.cellFor(colOcup, spu0, ctx).text, 'Em análise');

const colArea = { id: 'area', label: 'Área', fieldIds: ['pf_area', 'spu_area'] };
eq('área formatada pelo tipo (m²)', RD.cellFor(colArea, pf0, ctx).text, '120,50 m²');
eq('área BR', RD.cellFor(colArea, pf1, ctx).text, '10,00 m²');
eq('sem valor no registro → "—" (SPU não tem área)', RD.cellFor(colArea, spu0, ctx).text, '—');

// colunas legadas do modelo antigo, resolvidas só dentro da aba do registro
eq('legada "situacao_ocupacao" (PF)', RD.cellFor('situacao_ocupacao', pf0, ctx).text, 'Irregular');
eq('legada "situacao_ocupacao" (SPU)', RD.cellFor('situacao_ocupacao', spu0, ctx).text, 'Em análise');
eq('legada "situacao_recuo" ausente → "—"', RD.cellFor('situacao_recuo', spu0, ctx).text, '—');
eq('legada "area_invadida" (PF)', RD.cellFor('area_invadida', pf0, ctx).text, '120,50 m²');
eq('legada "data" usa a data do registro', RD.cellFor('data', pf0, ctx).text, '10/01/2026');

// coluna por id de campo (string)
eq('coluna = id de campo de outra aba → "—" (não vaza)', RD.cellFor('spu_ocup', pf0, ctx).text, '—');
eq('coluna = id de campo da própria aba', RD.cellFor('pf_obs', pf0, ctx).text, 'PF 1');

// aba/origem e anexos
eq('coluna "aba" mostra o TÍTULO da aba', RD.cellFor('aba', spu0, ctx).text, 'SPU');
eq('qtd_fotos ignora foto excluída', RD.cellFor('qtd_fotos', pf1, ctx).text, '1 foto(s)');
eq('qtd_fotos sem anexos → "—"', RD.cellFor('qtd_fotos', pf0, ctx).text, '—');

// rótulos
eq('rótulo explícito da coluna', RD.columnLabel(colOcup, fi), 'Situação da ocupação');
eq('rótulo da coluna legada', RD.columnLabel('situacao_recuo', fi), 'Situação do Recuo');
eq('rótulo pelo campo', RD.columnLabel('pf_obs', fi), 'Observações');

// registro 1:1 como fonte de coluna
const one = RD.buildRecords(tabs, data, { tabIds: ['t_mpf'] })[0];
eq('aba 1:1: coluna por campo', RD.cellFor({ id: 'ipl', fieldIds: ['f_ipl'] }, one, ctx).text, '0001234-56.2025.8.15.0001');

// fotos do registro
eq('fotos do registro (sem excluídas)', RD.recordPhotos(pf1).map(p => p.url), ['https://x/1.jpg']);
eq('fotos: campos ignorados (exibidos como lista) ficam de fora', RD.recordPhotos(pf1, ['pf_fotos']).length, 0);
eq('campos do registro restritos aos ids escolhidos', RD.recordFields(pf0, ['pf_obs', 'spu_obs']).map(f => f.id), ['pf_obs']);

// aba de Relatórios (A4): só botões, nunca fonte de dados
const tabsRel = tabs.concat([{ id: 't_rel', title: 'Relatórios', tabType: 'reports', isReportsTab: true, fields: [] }]);
eq('aba de relatórios não entra nas abas visíveis', RD.visibleTabs(tabsRel, data).map(t => t.id).includes('t_rel'), false);
eq('aba de relatórios nunca gera registros (nem por seleção explícita)', RD.buildRecords(tabsRel, data, { tabIds: ['t_rel'] }).length, 0);
eq('isReportsTab reconhece a aba', [RD.isReportsTab(tabsRel[tabsRel.length - 1]), RD.isReportsTab(tabs[0])], [true, false]);

console.log(`reportData: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
