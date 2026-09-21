// tests/viewerTables.test.js
// Executa o Quadro Sintético e o Laudo Analítico REAIS do visualizador (extraídos de relatorio_view.html)
// com um formulário de exemplo. Rodar com: node tests/viewerTables.test.js

const fs = require('fs');
const path = require('path');
const FieldFormatter = require('../src/fieldFormatter.js');
const ReportData = require('../src/reportData.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'relatorio_view.html'), 'utf8');
const lines = html.split(/\r?\n/);

function extractFunction(name) {
    const start = lines.findIndex(l => l.startsWith(`        function ${name}(`));
    if (start < 0) throw new Error(`função ${name} não encontrada`);
    let end = start;
    while (lines[end] !== '        }') end++;
    return lines.slice(start, end + 1).join('\n');
}

const window = { reportViewerFormTabs: [] };
// os desenhistas ficam em src/reportBlocks.js (o visualizador e o construtor usam os mesmos)
const ReportBlocks = require('../src/reportBlocks.js');
const escapeHtml = new Function(extractFunction('escapeHtml') + '; return escapeHtml;')();
const B = ReportBlocks.create({ esc: escapeHtml, FieldFormatter: FieldFormatter, ReportData: ReportData, formTabs: () => window.reportViewerFormTabs, geometryCenter: () => null });
const { renderSyntheticTable, renderAnalyticalLaudo } = B;

let total = 0;
let failed = 0;
const norm = (s) => String(s).replace(/ /g, ' ');
function ok(name, cond) { total++; if (cond) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (norm(a) === norm(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

// ---------------------------------------------------------------- formulário de exemplo
const hist = (p) => ([
    { id: `${p}_data`, label: 'Data da vistoria', type: 'date' },
    { id: `${p}_ocup`, label: 'Situação da ocupação', type: 'select' },
    { id: `${p}_area`, label: 'Área invadida (m²)', type: 'area_m2' },
    { id: `${p}_obs`, label: 'Observações', type: 'textarea' },
    { id: `${p}_fotos`, label: 'Fotos', type: 'photo' },
    { id: `${p}_links`, label: 'Processos', type: 'hiperlink_1n' },
    { id: `${p}_anx`, label: 'Anexos', type: 'attachment' }
]);
window.reportViewerFormTabs = [
    { id: 't_dados', title: 'Dados do Imóvel', isMultiple: false, fields: [{ id: 'f_prop', label: 'Proprietário', type: 'text' }] },
    { id: 't_pf', title: 'PF', isMultiple: true, fields: hist('pf') },
    { id: 't_spu', title: 'SPU', isMultiple: true, fields: hist('spu') },
    { id: 't_hist', title: 'Histórico', tabType: 'consolidated', targetTabIds: ['t_pf', 't_spu'], fields: [] }
];
const data = {
    f_prop: 'Maria',
    t_pf: JSON.stringify([
        { pf_data: '2026-01-10', pf_ocup: 'Irregular', pf_area: '120.5', pf_obs: 'Constatada ocupação <b>irregular</b>.',
          pf_links: JSON.stringify([{ title: 'Inquérito Civil', number: '1.24.000/2026', url: 'mpf.mp.br/ic' }, { title: 'Processo PF', url: 'pf.gov.br/p' }]),
          pf_anx: JSON.stringify([{ name: 'logo_MPF.jpg', url: 'https://x/logo_MPF.jpg', title: 'MPF', uploadedBy: 'Joana Araujo', uploadedAt: '2026-08-14T15:00:00Z' }, { name: 'oficio.pdf', url: 'https://x/oficio.pdf', title: 'Ofício' }]) },
        { pf_data: '2026-08-15', pf_ocup: 'Regular', pf_area: '10,00',
          pf_fotos: JSON.stringify([{ url: 'https://x/1.jpg', title: 'Fachada' }]) }
    ]),
    t_spu: [{ spu_data: '2026-03-01', spu_ocup: 'Em análise' }]
};

// ---------------------------------------------------------------- quadro sintético
const colOcup = { id: 'ocup', label: 'Situação da ocupação', fieldIds: ['pf_ocup', 'spu_ocup'] };
const colArea = { id: 'area', label: 'Área', fieldIds: ['pf_area', 'spu_area'] };
let out = renderSyntheticTable({ colunas: ['aba', 'data', colOcup, colArea] }, data);
ok('devolve bloco divisível', out && out.split && Array.isArray(out.split.rowsHtml));
eq('3 registros (PF 2 + SPU 1)', out.split.rowsHtml.length, 3);
let full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('cabeçalho com o rótulo das colunas', full.includes('Situação da ocupação') && full.includes('>Área<'));
ok('valor da PF lido do campo da PF', full.includes('Irregular'));
ok('valor do SPU lido do campo do SPU', full.includes('Em análise'));
ok('área formatada pelo tipo', full.includes('120,50 m²'));
ok('mais recente primeiro (15/08 antes de 10/01)', full.indexOf('15/08/2026') < full.indexOf('10/01/2026'));
ok('tabela com cabeçalho repetível (thead)', full.includes('<thead>'));
ok('continuação sem repetir "1" de numeração: índices globais', full.includes('>1</td>') && full.includes('>3</td>'));
const cont = out.split.chunkHtml(out.split.rowsHtml.slice(2), false);
ok('trecho de continuação identifica "(continuação)"', cont.includes('(continuação)'));
ok('trecho de continuação mantém o cabeçalho', cont.includes('<thead>'));

// seleção de abas
out = renderSyntheticTable({ abas_selecionadas: ['t_spu'], colunas: ['aba', colOcup] }, data);
eq('só a aba escolhida (SPU)', out.split.rowsHtml.length, 1);
out = renderSyntheticTable({ abas_selecionadas: ['PF'], colunas: ['aba'] }, data);
eq('seleção por TÍTULO da aba também funciona', out.split.rowsHtml.length, 2);

// abas inexistentes/ocultas: mensagem clara, sem quebrar
out = renderSyntheticTable({ abas_selecionadas: ['t_removida'], colunas: ['aba'] }, data);
ok('aba escolhida indisponível → aviso explicando', typeof out === 'string' && out.includes('não estão disponíveis'));

// sem registros
out = renderSyntheticTable({ abas_selecionadas: ['t_dados'] }, { f_prop: '' });
ok('sem registros → aviso', typeof out === 'string' && out.includes('Nenhum registro'));

// dado escapado (sem XSS) e sem vazar aba oculta
window.reportViewerFormTabs = window.reportViewerFormTabs.filter(t => t.id !== 't_spu');
out = renderSyntheticTable({ colunas: ['aba', colOcup] }, data);
eq('aba SPU fora do schema (oculta): só PF', out.split.rowsHtml.length, 2);
ok('valor do SPU NÃO aparece', !out.split.chunkHtml(out.split.rowsHtml, true).includes('Em análise'));
window.reportViewerFormTabs.push({ id: 't_spu', title: 'SPU', isMultiple: true, fields: hist('spu') });

// ---------------------------------------------------------------- laudo analítico
out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf'] }, data);
ok('laudo devolve bloco divisível', out && out.split);
eq('um cartão por registro da PF', out.split.rowsHtml.length, 2);
full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('cartão do registro sem linha de ícone/data/sigla (relatório formal)', !full.includes('PF •') && !full.includes('event_available') && !full.includes('folder_open'));
ok('cabeçalho do grupo com a contagem', full.includes('Aba / Ente: PF') && full.includes('2 registro(s)'));
ok('HTML do dado é escapado', full.includes('&lt;b&gt;irregular&lt;/b&gt;') && !full.includes('<b>irregular</b>'));
ok('foto com legenda', full.includes('https://x/1.jpg') && full.includes('Fachada'));
ok('rótulo do campo aparece', full.includes('Situação da ocupação:'));

// campos escolhidos restringem o que aparece
out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf'], campos_selecionados: [{ id: 'pf_obs', label: 'Observações', tabId: 't_pf' }] }, data);
full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('só o campo escolhido', full.includes('Observações:') && !full.includes('Situação da ocupação:'));

// escopo "última"
out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf'], escopo: 'ultima' }, data);
eq('escopo "última vistoria" → 1 cartão', out.split.rowsHtml.length, 1);

// agrupado por aba: cabeçalho de grupo por aba
out = renderAnalyticalLaudo({ ordenar_por_aba: true }, data);
full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('grupos PF e SPU', full.includes('Aba / Ente: PF') && full.includes('Aba / Ente: SPU'));

// nenhum id de foto excluída / url perigosa vira imagem
window.reportViewerFormTabs[1].fields.push({ id: 'pf_ev', label: 'Evidência', type: 'photo' });
out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf'] }, { t_pf: JSON.stringify([{ pf_data: '2026-01-01', pf_ev: JSON.stringify([{ url: 'javascript:alert(1)' }]) }]) });
ok('foto com URL javascript: não vira <img>', !out.split.chunkHtml(out.split.rowsHtml, true).includes('javascript:'));

// ---------------------------------------------------------------- sequência de abas, última por aba, título e campos 1:N
out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf', 't_spu'], ordem_abas: ['t_spu', 't_pf'] }, data);
full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('laudo segue a sequência de abas escolhida (SPU antes de PF)', full.indexOf('Aba / Ente: SPU') < full.indexOf('Aba / Ente: PF'));
out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf', 't_spu'], ordem_abas: ['t_pf', 't_spu'] }, data);
full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('sequência invertida: PF antes de SPU', full.indexOf('Aba / Ente: PF') < full.indexOf('Aba / Ente: SPU'));
ok('laudo sempre agrupado por aba, sem intercalar', full.indexOf('Aba / Ente: SPU') > full.lastIndexOf('PF •'));

out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf', 't_spu'], escopo: 'ultima' }, data);
eq('"apenas última vistoria" = a mais recente de CADA aba (2 cartões)', out.split.rowsHtml.length, 2);
full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('a última da PF é a de 15/08', full.includes('15/08/2026') && !full.includes('10/01/2026'));

out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf'], custom_tab_title_t_pf: 'Polícia Federal — Vistorias' }, data);
ok('título da aba editado no construtor aparece no laudo', out.split.chunkHtml(out.split.rowsHtml, true).includes('Polícia Federal — Vistorias'));

// seleção legada (ids que não existem no formulário) não deixa o cartão vazio
out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf'], campos_selecionados: [{ id: 'data', label: 'Data' }, { id: 'conclusao', label: 'Conclusão' }] }, data);
full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('ids legados ignorados: mostra os campos reais da aba', full.includes('Situação da ocupação:') && !full.includes('Nenhum campo desta aba'));

// campo 1:N de link: título, número e endereço na íntegra
out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf'] }, data);
full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('campo 1:N de link: título, número e endereço aparecem', full.includes('Inquérito Civil') && full.includes('1.24.000/2026') && full.includes('>mpf.mp.br/ic</a>'));
ok('campo 1:N de link: todos os itens', full.includes('Processo PF') && full.includes('>pf.gov.br/p</a>'));

// ---------------------------------------------------------------- fotos e anexos: Lista x Imagem, por campo
out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf'] }, data);
full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('anexo (padrão) em lista: título e nome do arquivo, sem imagem',
    full.includes('<strong>MPF</strong>') && full.includes('logo_MPF.jpg') && !full.includes('src="https://x/logo_MPF.jpg"'));
ok('foto (padrão) continua na grade de imagens do laudo', full.includes('src="https://x/1.jpg"'));

out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf'], campos_exibicao: { pf_anx: 'imagem' } }, data);
full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('anexo em modo imagem: mostra a imagem na íntegra', full.includes('src="https://x/logo_MPF.jpg"'));
ok('imagem com título e metadados', full.includes('>MPF</div>') && full.includes('Enviado por: Joana Araujo'));
ok('PDF do mesmo campo continua em lista', !full.includes('src="https://x/oficio.pdf"') && full.includes('Ofício'));

out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf'], campos_exibicao: { pf_fotos: 'lista' } }, data);
full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('foto em modo lista: sem imagem no laudo', !full.includes('src="https://x/1.jpg"'));
ok('foto em modo lista: aparece o nome do arquivo', full.includes('1.jpg') && full.includes('Fotos:'));

// metadados da imagem seguem os interruptores do laudo (legenda, data, responsável)
out = renderAnalyticalLaudo({ abas_selecionadas: ['t_pf'], campos_exibicao: { pf_anx: 'imagem' }, exibirLegenda: false, exibirResp: false, exibirData: false }, data);
full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('sem legenda/responsável/data: a imagem aparece sem esses metadados', full.includes('src="https://x/logo_MPF.jpg"') && !full.includes('Enviado por'));

// tabelas (quadro sintético) sempre em lista compacta, nunca imagem
out = renderSyntheticTable({ abas_selecionadas: ['t_pf'], colunas: ['aba', { id: 'anx', label: 'Anexos', fieldIds: ['pf_anx'] }] }, data);
full = out.split.chunkHtml(out.split.rowsHtml, true);
ok('quadro sintético: anexos em lista, sem imagem', full.includes('logo_MPF.jpg') && !full.includes('<img'));

console.log(`viewerTables: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
