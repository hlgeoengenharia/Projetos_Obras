// tests/reportBlocks.test.js
// Desenhistas dos blocos do relatório (src/reportBlocks.js): cabeçalho, rodapé, texto livre com menções e emblemas.
// Os testes de grade, campos e tabelas 1:N ficam em viewerGrid / viewerResolve / viewerTables (usam este mesmo módulo).
// Rodar com: node tests/reportBlocks.test.js

const RB = require('../src/reportBlocks.js');
const FF = require('../src/fieldFormatter.js');

let total = 0;
let failed = 0;
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const campos = [{ id: 'f_nome', label: 'Proprietário', type: 'text' }, { id: 'f_area', label: 'Área do terreno (m²)', type: 'area_m2' }, { id: 'f_cpf', label: 'CPF/CNPJ', type: 'cpfcnpj' }];
const B = RB.create({ esc, FieldFormatter: FF, geometryCenter: () => null, emissaoTexto: (k) => (k === 'protocolo' ? '20260921-ABCD1234' : 'f410fc06'), emissaoTitulo: () => 'SHA-256 completo', formFields: () => campos });

ok('o módulo expõe os desenhistas dos blocos', ['getOrgBadgeHtml', 'getStatusBadgeHtml', 'getRecuoBadgeHtml', 'formatFieldValueForDisplay', 'readFieldRaw', 'isRichField', 'resolveFieldHtml', 'resolveFieldValue', 'getFieldWidthStyle', 'renderAttributeGrid', 'replaceMentionsWithData', 'getFooterPageNumberText', 'renderHeaderSlotHtml', 'renderFooterSlotHtml', 'renderHeaderBlock', 'renderFreeTextBlock'].every(n => typeof B[n] === 'function'));
ok('funciona sem nenhum contexto (padrões seguros)', typeof RB.create().renderHeaderBlock === 'function' && /Teste &lt;b&gt;/.test(RB.create().renderHeaderBlock({ titulo: 'Teste <b>' }, { nome: 'X' })));

// ---------------------------------------------------------------- cabeçalho
const cab = B.renderHeaderBlock({ titulo: 'FICHA\nCADASTRAL <MPF>', subtitulo: 'Prefeitura\nde Cabedelo', exibirDataHora: true, exibirProtocolo: true, logo: true, repetir_todas_folhas: true }, { nome: 'Modelo' });
ok('cabeçalho: título e subtítulo com quebra de linha e texto escapado', /FICHA<br>CADASTRAL &lt;MPF&gt;/.test(cab) && /Prefeitura<br>de Cabedelo/.test(cab) && !/<MPF>/.test(cab));
ok('cabeçalho: emissão e protocolo no topo direito, protocolo vindo da emissão', /Emissão:/.test(cab) && /data-emissao="protocolo">20260921-ABCD1234</.test(cab));
ok('cabeçalho: logo (ícone) e marca de repetição em todas as folhas', /account_balance/.test(cab) && /cabecalho-repetir-todas/.test(cab));
const cab2 = B.renderHeaderBlock({}, { nome: 'Ficha do Modelo' });
ok('cabeçalho sem opções: título do modelo, sem emissão, protocolo nem logo', /FICHA DO MODELO|Ficha do Modelo/i.test(cab2) && !/Emissão:/.test(cab2) && !/data-emissao="protocolo"/.test(cab2) && !/account_balance/.test(cab2));
ok('logo por endereço vira imagem', /<img src="https:\/\/x\/logo\.png"/.test(B.renderHeaderBlock({ logo: true, logo_url: 'https://x/logo.png' }, {})));

// ---------------------------------------------------------------- cabeçalho e rodapé da folha
const slot = B.renderHeaderSlotHtml({ titulo: 'T', exibirProtocolo: true, repetir_todas_folhas: true }, { nome: 'M' }, 12, 8);
ok('slot do cabeçalho: margens da folha (esquerda 12 mm, direita 8 mm), protocolo e repetição', /padding: 6mm 8mm 0 12mm/.test(slot) && /data-emissao="protocolo"/.test(slot) && /cabecalho-repetir-todas/.test(slot));
eq('sem bloco de cabeçalho: nada', [B.renderHeaderSlotHtml(null, {}, 1, 1), B.renderFooterSlotHtml(null, 1, 1, 1, 1)], ['', '']);
eq('numeração: "Página 01 de 05" com dois dígitos; a partir da 2ª folha a 1ª fica sem número; desligada não mostra', [B.getFooterPageNumberText(1, 5, {}), B.getFooterPageNumberText(2, 12, {}), B.getFooterPageNumberText(1, 5, { inicio_numeracao: 'segunda' }), B.getFooterPageNumberText(2, 5, { inicio_numeracao: 'segunda' }), B.getFooterPageNumberText(1, 5, { numeracao: false })], ['Página 01 de 05', 'Página 02 de 12', '', 'Página 02 de 05', '']);
const rod = B.renderFooterSlotHtml({ exibirDataHora: true, exibirHash: true, exibirQr: true }, 3, 7, 10, 10);
ok('slot do rodapé: emissão, SHA-256 (com o texto completo no título), QR e número da página', /Emitido em/.test(rod) && /data-emissao="hash" title="SHA-256 completo">f410fc06</.test(rod) && /data-emissao="qr"/.test(rod) && /Página 03 de 07/.test(rod));
const rod2 = B.renderFooterSlotHtml({ exibirDataHora: false, exibirHash: false, exibirQr: false, numeracao: false }, 1, 1, 10, 10);
ok('rodapé com tudo desligado: sem emissão, hash, QR nem página', !/Emitido em/.test(rod2) && !/SHA-256/.test(rod2) && !/data-emissao="qr"/.test(rod2) && !/Página/.test(rod2));

// modo do construtor: só o conteúdo (sem o recuo das margens), títulos editáveis, selo e marcador do QR
const hb = B.renderHeaderSlotHtml({ titulo: 'Ficha', subtitulo: 'Órgão' }, {}, 12, 8, { bare: true, edit: { textClass: 'cursor-text', tituloAttrs: 'ondblclick="ed(this, \'titulo\')"', subtituloAttrs: 'ondblclick="ed(this, \'subtitulo\')"', badgeHtml: '<i>SELO</i>' } });
ok('cabeçalho (construtor): sem contêiner de margens, com títulos editáveis e selo', !hb.includes('a4-page-header-slot') && !hb.includes('padding: 6mm') && hb.includes("ed(this, 'titulo')") && hb.includes("ed(this, 'subtitulo')") && hb.includes('cursor-text') && hb.includes('<i>SELO</i>') && hb.includes('Ficha') && hb.includes('Órgão'));
ok('cabeçalho: a saída normal (relatório) não muda e não traz o modo de edição', slot.includes('a4-page-header-slot') && !slot.includes('ondblclick') && !slot.includes('cursor-text'));
const fb = B.renderFooterSlotHtml({ exibirQr: true }, 2, 10, 5, 5, { bare: true, qrHtml: '<b>QR-EXEMPLO</b>' });
ok('rodapé (construtor): sem contêiner, marcador no lugar do QR e numeração informada', !fb.includes('a4-page-footer-slot') && fb.includes('<b>QR-EXEMPLO</b>') && !fb.includes('data-emissao="qr"') && fb.includes('Página 02 de 10'));
ok('rodapé: a saída normal (relatório) mantém o QR e o contêiner', rod.includes('a4-page-footer-slot') && rod.includes('data-emissao="qr"') && !rod.includes('QR-EXEMPLO'));

// ---------------------------------------------------------------- texto livre com menções
const dados = { f_nome: 'Maria <da> Silva', f_area: 550.26, f_cpf: '12345678909' };
const menc = (id, label, fmt) => '<span class="mention-chip" data-field-id="' + id + '"' + (fmt || '') + '>@' + label + '</span>';
const txt = B.replaceMentionsWithData('Proprietário: ' + menc('f_nome', 'Proprietário (Dados)') + '; área ' + menc('f_area', 'Área do terreno (m²)', ' data-format-bold="true"') + '; doc ' + menc('f_cpf', 'CPF/CNPJ', ' data-format-italic="true" data-format-underline="true"') + '.', dados);
ok('menções viram o dado do campo pelo id; texto escapado', /Proprietário: Maria &lt;da&gt; Silva;/.test(txt) && !/<da>/.test(txt));
ok('formatação rica da menção: negrito, itálico e sublinhado', /<strong>550,26 m²<\/strong>/.test(txt) && /<em><u>123\.456\.789-09<\/u><\/em>/.test(txt));
eq('menção sem valor vira travessão; sem conteúdo devolve vazio', [B.replaceMentionsWithData(menc('f_inexistente', 'Outro'), {}), B.replaceMentionsWithData('', dados), B.replaceMentionsWithData(null, dados)], ['—', '', '']);
eq('@[campo] direto no texto', B.replaceMentionsWithData('Dono: @f_nome', { f_nome: 'João' }), 'Dono: João');
const caixa = B.renderFreeTextBlock({ titulo: 'Parecer\nTécnico', conteudo: 'Vistoria de ' + menc('f_nome', 'Proprietário'), espacamento: '1.8', alinhamento: 'left' }, 4, dados);
ok('caixa de texto: título, id próprio por posição, edição pontual, espaçamento e alinhamento', /Parecer<br>Técnico/.test(caixa) && /id="viewer-free-text-4"/.test(caixa) && /contenteditable="true"/.test(caixa) && /line-height: 1\.8; text-align: left/.test(caixa) && /Vistoria de Maria &lt;da&gt; Silva/.test(caixa) && /Clique para editar pontualmente/.test(caixa));
ok('caixa de texto sem título e com padrões (1,6 e justificado)', (() => { const c = B.renderFreeTextBlock({ conteudo: 'Texto' }, 0, {}); return !/border-b border-slate-300/.test(c) && /line-height: 1\.6; text-align: justify/.test(c); })());

// ---------------------------------------------------------------- emblemas e largura
ok('emblema de órgão: cor por órgão (MPF roxo, PF azul, SPU verde, município âmbar) e genérico estável', /purple/.test(B.getOrgBadgeHtml('MPF')) && /blue/.test(B.getOrgBadgeHtml('PF')) && /emerald/.test(B.getOrgBadgeHtml('SPU')) && /amber/.test(B.getOrgBadgeHtml('MUNICÍPIO')) && B.getOrgBadgeHtml('ABC') === B.getOrgBadgeHtml('ABC'));
ok('emblema de situação e de recuo (regular, irregular, sem valor e texto escapado)', /emerald/.test(B.getStatusBadgeHtml('Regular')) && /red/.test(B.getStatusBadgeHtml('Irregular')) && /—/.test(B.getStatusBadgeHtml('')) && /&lt;x&gt;/.test(B.getStatusBadgeHtml('<x>')) && /emerald/.test(B.getRecuoBadgeHtml('Recuo total; sim')) && /amber/.test(B.getRecuoBadgeHtml('Não recuou')));
eq('largura do campo na grade: 100% (a partir de 98%), 50% e limites de 15 a 100', [B.getFieldWidthStyle(100), B.getFieldWidthStyle(99), B.getFieldWidthStyle(50), B.getFieldWidthStyle(5), B.getFieldWidthStyle(undefined)], ['100%', '100%', 'calc(50% - 5px)', 'calc(15% - 8.5px)', 'calc(50% - 5px)']);

// ---------------------------------------------------------------- grade: modo de edição (construtor) x leitura (relatório)
{
    const bloco = { titulo: 'Dados', colunasLayout: 2, campos_selecionados: ['f_nome', 'f_area'], campos_larguras: { f_nome: 66 } };
    const leitura = B.renderAttributeGrid(bloco, dados, campos);
    ok('leitura: sem nenhum controle de edição', !/field-drag-handle|a4-grid-fields-container|data-field-id|group\/field|select-none/.test(leitura) && /Maria &lt;da&gt; Silva/.test(leitura) && /550,26 m²/.test(leitura));
    const edicao = { titleClass: 'tt', titleAttrs: 'data-t="1"', headerExtra: '<i>dica</i>', containerAttrs: 'data-block-index="7"', fieldAttrs: (f, pct) => 'data-field-id="' + f.id + '" data-pct="' + pct + '"', lead: (f, pct, modo) => '<b>alça-' + modo + '</b>', tail: (f, pct, modo) => '<u>fim-' + f.id + '-' + pct + '-' + modo + '</u>' };
    const ed = B.renderAttributeGrid(bloco, dados, campos, { edit: edicao });
    ok('edição: mesmo conteúdo do relatório, com título editável, dica, contêiner e campos identificados', ed.includes('class="whitespace-pre-line tt" data-t="1"') && ed.includes('<i>dica</i>') && ed.includes('a4-grid-fields-container" data-block-index="7"') && ed.includes('data-field-id="f_nome" data-pct="66"') && ed.includes('data-field-id="f_area" data-pct="50"') && ed.includes('Maria &lt;da&gt; Silva') && ed.includes('550,26 m²'));
    ok('edição: alça antes do nome e controles depois (modo card com a largura de cada campo)', ed.indexOf('<b>alça-card</b>') >= 0 && ed.indexOf('<b>alça-card</b>') < ed.indexOf('Proprietário') && ed.includes('<u>fim-f_nome-66-card</u>') && ed.includes('<u>fim-f_area-50-card</u>'));
    const lista = B.renderAttributeGrid(Object.assign({}, bloco, { colunasLayout: 1 }), dados, campos, { edit: edicao });
    ok('edição em lista corrida: alça, nome, valor e controles na mesma linha (modo linha)', lista.includes('<b>alça-linha</b>') && lista.includes('<u>fim-f_nome-100-linha</u>') && lista.includes('Maria &lt;da&gt; Silva') && lista.includes('a4-grid-fields-container" data-block-index="7"'));
    const foto = B.renderAttributeGrid({ colunasLayout: 1, campos_selecionados: ['f_foto'], campos_exibicao: { f_foto: 'imagem' } }, { f_foto: [{ url: 'https://x/a.jpg', name: 'a.jpg', title: 'Fachada' }] }, [{ id: 'f_foto', label: 'Fotos', type: 'photo' }], { edit: edicao });
    ok('edição: foto/anexo aparece de verdade (imagem na íntegra) com os controles', /<img[^>]+src="https:\/\/x\/a\.jpg"/.test(foto) && foto.includes('<u>fim-f_foto-100-linha</u>'));
}

console.log(`reportBlocks: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
