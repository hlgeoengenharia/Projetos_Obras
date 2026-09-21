// tests/reportPreview.test.js
// Prévia real do relatório no construtor: feição de teste fixa (dados de exemplo por tipo de campo, geometria, vizinhos e rua).
// Rodar com: node tests/reportPreview.test.js

const RP = require('../src/reportPreview.js');
const MT = require('../src/mapTools.js');
const FF = require('../src/fieldFormatter.js');
const RD = require('../src/reportData.js');

let total = 0;
let failed = 0;
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

// ---------------------------------------------------------------- geometria fixa
const geom = RP.sampleGeometry();
ok('feição de teste: polígono de 20 m x 30 m (600 m²), fechado', geom.type === 'Polygon' && Math.abs(MT.polygonAreaM2(geom.coordinates) - 600) < 4 && JSON.stringify(geom.coordinates[0][0]) === JSON.stringify(geom.coordinates[0][4]));
eq('é sempre a mesma (não muda a cada chamada)', JSON.stringify(RP.sampleGeometry()), JSON.stringify(geom));
const med = MT.computeMeasures(geom);
eq('lados de 20, 30, 20 e 30 m', med.itens.filter(i => i.grupo === 'lados').map(i => Math.round(i.valor)), [20, 30, 20, 30]);

// ---------------------------------------------------------------- camadas de exemplo
const camadas = RP.sampleLayers();
eq('duas camadas de exemplo: lotes e logradouros, com os campos para escolher', camadas.map(c => [c.id, c.kind, c.campos.map(x => x.k)]), [['previa-lotes', 'polygon', ['nome', 'lote']], ['previa-ruas', 'line', ['nome']]]);
const conf = MT.confrontantes(geom, camadas[0], { tolM: 3 });
eq('os lotes vizinhos dividem a divisa: leste Lote 02, norte Lote 03, oeste Lote 01, sul ninguém', conf.map(r => r.confrontantes.map(x => x.r).join('|')), ['', 'Quadra A • Lote 02', 'Quadra A • Lote 03', 'Quadra A • Lote 01']);
const cc = { ativo: true, camadas: [{ id: 'previa-lotes', campos: ['nome'], logradouro: false }, { id: 'previa-ruas', campos: ['nome'], logradouro: true }], tolM: 3, distLogM: 30 };
const pr = MT.pointRows(geom, MT.normalizePontos({ ativo: true, memorial: true, ordem: ['v:0', 'v:1', 'v:2', 'v:3'], colConf: cc }), { camadas: camadas });
eq('coluna Confrontantes na tabela de pontos: rua ao sul (à frente, sem tocar), lotes nos outros lados', pr.rows.map(r => r.confrontantes), ['Rua das Flores', 'Maria Exemplo', 'João Exemplo', 'Ana Exemplo']);

// ---------------------------------------------------------------- valor de exemplo por tipo de campo: o formatador do relatório entende todos
const tipos = ['text', 'textarea', 'number', 'currency', 'area_m2', 'length_m', 'volume_m3', 'date', 'cpfcnpj', 'ipl', 'ipf', 'insc_imob_cabedelo', 'pa_anpp_ap', 'epol', 'rip', 'epol_1n', 'rip_1n', 'cep', 'hiperlink', 'hiperlink_1n', 'photo', 'attachment', 'geolocation', 'select', 'current_user', 'current_date', 'checkbox'];
const vazios = tipos.filter(t => { const f = { id: 'x', label: 'Campo ' + t, type: t, options: ['Regular', 'Irregular'] }; const v = RP.sampleValue(f, 0); const txt = FF.toText(v, f, { geometryCenter: RP.CENTRO }); return txt === '—' || txt === '' || v === undefined; });
eq('todos os tipos de campo geram um valor que aparece no relatório (nada em branco)', vazios, []);
eq('valores conhecidos: data, área e opção da lista', [RP.sampleValue({ type: 'date' }, 0), RP.sampleValue({ type: 'area_m2' }, 0), RP.sampleValue({ type: 'select', options: ['A', 'B'] }, 1), RP.sampleValue({ type: 'select', options: [{ label: 'Um' }] }, 0), RP.sampleValue({ type: 'select' }, 0)], ['2026-03-15', 550.26, 'B', 'Um', 'Opção de exemplo']);
ok('os registros seguintes variam (para a tabela 1:N não ficar com linhas iguais)', RP.sampleValue({ type: 'date' }, 1) !== RP.sampleValue({ type: 'date' }, 0) && RP.sampleValue({ type: 'text', label: 'Nome' }, 1) !== RP.sampleValue({ type: 'text', label: 'Nome' }, 0) && RP.sampleValue({ type: 'number' }, 1) !== RP.sampleValue({ type: 'number' }, 0));
ok('fotos e anexos de exemplo passam pelo filtro de URL segura do relatório', FF.parseFiles(RP.sampleValue({ type: 'photo' }, 0)).length === 2 && FF.parseFiles(RP.sampleValue({ type: 'attachment' }, 0)).length === 1);

// ---------------------------------------------------------------- dados da feição a partir das abas do cadastro
const abas = [
    { id: 'aba1', title: 'Dados do Imóvel', fields: [{ id: 'f_nome', label: 'Proprietário', type: 'text' }, { id: 'f_area', label: 'Área do terreno (m²)', type: 'area_m2' }, { id: 'f_sit', label: 'Situação', type: 'select', options: ['Regular', 'Irregular'] }] },
    { id: 'aba2', title: 'Histórico de Ocupação', isMultiple: true, fields: [{ id: 'h_data', label: 'Data', type: 'date' }, { id: 'h_obs', label: 'Observação', type: 'textarea' }, { id: 'h_foto', label: 'Fotos', type: 'photo' }] },
    { id: 'orcamento_obra', title: 'Orçamento', isNative: true, fields: [{ id: 'o1', label: 'X', type: 'text' }] },
    { id: 'rel', title: 'Relatórios', tabType: 'reports', fields: [] }
];
const dados = RP.sampleFeatureData(abas);
eq('aba simples: um valor por campo', [dados.f_nome, dados.f_area, dados.f_sit], ['Exemplo: Proprietário', 550.26, 'Regular']);
eq('aba 1:N: dois registros, com data e campos', [Array.isArray(dados.aba2), dados.aba2.length, dados.aba2[0].h_data, dados.aba2[1].h_data, dados.aba2[0]._created_at, Array.isArray(dados.aba2[0].h_foto)], [true, 2, '2026-03-15', '2026-02-10', '2026-03-15', true]);
ok('aba nativa (orçamento) e aba de relatórios não geram dados', !('o1' in dados) && !('rel' in dados) && !('orcamento_obra' in dados));
const regs = RD.buildRecords(abas, dados, {});
eq('o relatório lê os 2 registros da aba 1:N (cronologia)', [regs.length, regs.map(r => r.tabId).join('')], [2, 'aba2aba2']);
eq('campos com aba (para o painel e a comparação de área)', RP.fieldsFromTabs(abas).slice(0, 4).map(f => [f.id, f.tabId, f.tabTitle, f.isMultiple]), [['f_nome', 'aba1', 'Dados do Imóvel', false], ['f_area', 'aba1', 'Dados do Imóvel', false], ['f_sit', 'aba1', 'Dados do Imóvel', false], ['h_data', 'aba2', 'Histórico de Ocupação', true]]);
eq('sem abas: dados só com o essencial e nenhum erro', [Object.keys(RP.sampleFeatureData([])), Object.keys(RP.sampleFeatureData(null))], [['id_banco', '_created_at'], ['id_banco', '_created_at']]);

// ---------------------------------------------------------------- pacote enviado ao relatório
const tplComMapa = { id: 'rpt_1', form_id: 'f1', blocos: [{ tipo: 'cabecalho' }, { tipo: 'mapa_estatico', mapa: {} }] };
const p = RP.buildPreviewPayload({ template: tplComMapa, formId: 'f1', formTabs: abas });
eq('pacote: modelo em edição, cadastro, feição de teste, chave própria e marca de prévia', [p.templateId, p.template === tplComMapa, p.formId, p.featureKey, p.preview, p.featureGeometry.type, p.ortofotos, p.formFields.length], ['rpt_1', true, 'f1', 'exemplo-previa', true, 'Polygon', [], 7]);
eq('com mapa no modelo: as camadas de exemplo vão junto; sem mapa não', [p.camadasMapa.length, RP.buildPreviewPayload({ template: { id: 'x', form_id: 'f1', blocos: [{ tipo: 'cabecalho' }] }, formTabs: abas }).camadasMapa.length], [2, 0]);
ok('cabe no armazenamento do navegador (menos de 200 kB) e é JSON puro', (() => { const s = JSON.stringify(p); return s.length < 200000 && JSON.stringify(JSON.parse(s)) === s; })());
eq('sem nenhum argumento não quebra', (() => { const q = RP.buildPreviewPayload(); return [q.template, q.formId, q.preview, q.featureData.id_banco]; })(), [null, null, true, 'exemplo']);

console.log(`reportPreview: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
