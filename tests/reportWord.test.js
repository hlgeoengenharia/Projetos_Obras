// tests/reportWord.test.js
// Conversão da folha para o Word (estilos em linha, flex/grid → tabela, capturas de mapa, cabeçalho/rodapé).
// Usa uma árvore de elementos simulada (estilo e retângulo como o navegador entregaria).
// Rodar com: node tests/reportWord.test.js

const RW = require('../src/reportWord.js');

let total = 0;
let failed = 0;
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

// ---------------------------------------------------------------- árvore simulada
const BASE = {
    display: 'block', visibility: 'visible', position: 'static', fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400', fontStyle: 'normal',
    color: 'rgb(0, 0, 0)', backgroundColor: 'rgba(0, 0, 0, 0)', textAlign: 'start', lineHeight: 'normal', whiteSpace: 'normal', textTransform: 'none',
    borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px',
    borderTopStyle: 'none', borderRightStyle: 'none', borderBottomStyle: 'none', borderLeftStyle: 'none',
    borderTopColor: 'rgb(0, 0, 0)', borderRightColor: 'rgb(0, 0, 0)', borderBottomColor: 'rgb(0, 0, 0)', borderLeftColor: 'rgb(0, 0, 0)',
    paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px', marginTop: '0px', marginBottom: '0px', flexDirection: 'row', alignItems: 'normal'
};
const R = (l, t, w, h) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h });
function E(tag, o, ...children) {
    o = o || {};
    return { nodeType: 1, tagName: tag.toUpperCase(), id: o.id || '', className: o.cls || '', style: Object.assign({}, BASE, o.st || {}), rect: o.r || R(0, 0, 100, 20), childNodes: children, attrs: o.attrs || {}, getAttribute(n) { return this.attrs[n]; } };
}
const T = (s) => ({ nodeType: 3, nodeValue: s });
const env = (captures) => ({ cs: (el) => el.style, rect: (el) => el.rect, captures: captures || {} });
const conv = (captures) => RW.make(env(captures));

// ---------------------------------------------------------------- cores e estilo
eq('cor rgb → hex', [RW.colorHex('rgb(15, 23, 42)'), RW.colorHex('rgb(255, 255, 255)'), RW.colorHex('#0f172a'), RW.colorHex('#fff')], ['#0f172a', '#ffffff', '#0f172a', '#ffffff']);
eq('transparente e alfa zero não geram cor', [RW.colorHex('rgba(0, 0, 0, 0)'), RW.colorHex('transparent'), RW.colorHex(''), RW.colorHex('blue-ish')], [null, null, null, null]);
eq('cor translúcida é misturada com o branco', RW.colorHex('rgba(0, 0, 0, 0.5)'), '#808080');
eq('família: mono vira Consolas (com Courier New de reserva), o resto Arial', [RW.fontFamily('ui-monospace, "IBM Plex Mono"'), RW.fontFamily('Inter, sans-serif')], ["Consolas, 'Courier New', monospace", 'Arial, sans-serif']);

let h = conv().node(E('div', { st: { fontSize: '12px', fontWeight: '700', color: 'rgb(15, 23, 42)', textAlign: 'center' } }, T('Título')));
ok('texto: tamanho em pt (12px = 9pt), negrito, cor e alinhamento em linha', /font-size:9pt/.test(h) && /font-weight:bold/.test(h) && /color:#0f172a/.test(h) && /text-align:center/.test(h) && />Título<\/div>$/.test(h));
h = conv().node(E('span', { st: { display: 'inline', fontStyle: 'italic', fontWeight: '400' } }, T('x')));
ok('itálico; elemento em linha vira span sem margens', /^<span /.test(h) && /font-style:italic/.test(h) && !/font-weight:bold/.test(h));
h = conv().node(E('div', { st: { backgroundColor: 'rgb(241, 245, 249)', borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'rgb(203, 213, 225)', borderBottomWidth: '2px', borderBottomStyle: 'dashed', borderBottomColor: 'rgb(15, 23, 42)', paddingTop: '8px', paddingLeft: '12px', marginBottom: '16px' } }, T('c')));
ok('fundo, bordas por lado, preenchimento e margem em pt', /background:#f1f5f9/.test(h) && /border-top:0\.8pt solid #cbd5e1/.test(h) && /border-bottom:1\.5pt dashed #0f172a/.test(h) && /padding:6pt 0pt 0pt 9pt/.test(h) && /margin-bottom:12pt/.test(h));
h = conv().node(E('div', { st: { backgroundColor: 'rgb(255, 255, 255)' } }, T('x')));
ok('fundo branco não é escrito (o papel já é branco)', !/background/.test(h));
h = conv().node(E('div', { st: { textTransform: 'uppercase', fontSize: '10px' } }, T('aba / ente: pf')));
ok('caixa alta é aplicada no texto (o Word ignora text-transform)', /ABA \/ ENTE: PF/.test(h));
h = conv().node(E('div', { st: { whiteSpace: 'pre-wrap' } }, T('linha 1\nlinha 2')));
ok('quebras de linha de texto pré-formatado viram <br>', /linha 1<br>linha 2/.test(h));
h = conv().node(E('p', {}, T('a  b\n  c')));
ok('espaços em excesso são recolhidos como no navegador', />a b c<\/p>$/.test(h));
h = conv().node(E('div', {}, T('<script>alert("x")</script> & "aspas"')));
ok('texto é escapado', !/<script>/.test(h) && /&lt;script&gt;/.test(h) && /&amp;/.test(h) && /&quot;aspas&quot;/.test(h));

// ---------------------------------------------------------------- o que não vai para o Word
const oculto = E('div', {}, T('a'), E('button', {}, T('Salvar')), E('div', { cls: 'no-print x' }, T('só na tela')), E('span', { cls: 'material-symbols-outlined' }, T('navigation')),
    E('div', { st: { display: 'none' } }, T('escondido')), E('div', { st: { visibility: 'hidden' } }, T('invisível')), E('div', { st: { position: 'absolute' } }, T('sobreposto')), E('svg', {}, T('vetor')), E('input', {}), T('b'));
h = conv().node(oculto);
ok('botões, .no-print, ícones de fonte, ocultos, sobrepostos, svg e campos ficam de fora', /a/.test(h) && /b<\/div>$/.test(h) && !/Salvar|só na tela|navigation|escondido|invisível|sobreposto|vetor|<input/.test(h));

// ---------------------------------------------------------------- flex → tabela
const flexRow = E('div', { st: { display: 'flex' }, r: R(0, 0, 400, 30) },
    E('span', { st: { fontWeight: '700' }, r: R(0, 0, 100, 20) }, T('IPL:')),
    E('span', { r: R(300, 0, 100, 20) }, T('0001234')));
h = conv().node(flexRow);
ok('flex de uma linha vira UMA tabela (não sobra div de layout aninhado)', (h.match(/<table/g) || []).length === 1 && (h.match(/<tr>/g) || []).length === 1);
ok('células nas larguras reais (25% + espaço 50% + 25%), em ordem', (() => { const w = (h.match(/width:([\d.]+)%/g) || []).map(x => parseFloat(x.slice(6))); return w.length === 4 && w[0] === 100 && w[1] === 25 && w[2] === 50 && w[3] === 25; })());
ok('o conteúdo das células mantém o estilo (negrito no primeiro)', /font-weight:bold[^>]*>IPL:/.test(h) && /0001234/.test(h) && h.indexOf('IPL:') < h.indexOf('0001234'));
ok('tabela de layout sem borda e com largura fixa', /table-layout:fixed/.test(h) && /border:0/.test(h));

// linha com quebra (flex-wrap): duas linhas visuais
const wrap = E('div', { st: { display: 'flex' }, r: R(0, 0, 400, 80) },
    E('div', { r: R(0, 0, 195, 30) }, T('A')), E('div', { r: R(205, 0, 195, 30) }, T('B')),
    E('div', { r: R(0, 40, 195, 30) }, T('C')));
h = conv().node(wrap);
eq('flex-wrap: duas linhas visuais = duas tabelas', (h.match(/<table/g) || []).length, 2);
ok('espaço vertical entre as linhas preservado', /height:7\.5pt/.test(h));
ok('linha incompleta mantém a largura do quadro (C ocupa ~49%, sem esticar)', /width:48\.8%[^>]*padding:0[^>]*>[\s\S]*C/.test(h));
eq('ordem dos quadros na leitura', [h.indexOf('>A<') < h.indexOf('>B<'), h.indexOf('>B<') < h.indexOf('>C<')], [true, true]);

// coluna flex
h = conv().node(E('div', { st: { display: 'flex', flexDirection: 'column' } }, E('div', {}, T('um')), E('div', {}, T('dois'))));
ok('flex em coluna: blocos empilhados, sem tabela', !/<table/.test(h) && h.indexOf('um') < h.indexOf('dois'));

// grid
const grid = E('div', { st: { display: 'grid' }, r: R(0, 0, 300, 60) }, E('div', { r: R(0, 0, 145, 20) }, T('g1')), E('div', { r: R(155, 0, 145, 20) }, T('g2')), E('div', { r: R(0, 30, 145, 20) }, T('g3')), E('div', { r: R(155, 30, 145, 20) }, T('g4')));
h = conv().node(grid);
ok('grid 2×2 vira 2 tabelas com 2 células cada', (h.match(/<table/g) || []).length === 2 && ['g1', 'g2', 'g3', 'g4'].every(x => h.includes('>' + x + '<')));

// contêiner com caixa própria (cartão): borda/fundo/preenchimento ficam num div que envolve a tabela
const cartao = E('div', { st: { display: 'flex', backgroundColor: 'rgb(248, 250, 252)', borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'rgb(226, 232, 240)', paddingLeft: '10px', paddingRight: '10px' }, r: R(0, 0, 220, 30) }, E('span', { r: R(10, 0, 100, 20) }, T('x')));
h = conv().node(cartao);
ok('cartão: fundo e borda no envoltório e a tabela dentro', /^<div style="[^"]*background:#f8fafc/.test(h) && /border-top/.test(h) && /<table/.test(h.slice(h.indexOf('>'))));
ok('larguras consideram o preenchimento do cartão (100 de 200 = 50%)', /width:50%/.test(h));
h = conv().node(E('div', { st: { display: 'flex', alignItems: 'center' }, r: R(0, 0, 100, 20) }, E('span', { r: R(0, 0, 50, 20) }, T('m'))));
ok('alinhamento vertical central vira valign=middle', /valign="middle"/.test(h));
h = conv().node(E('div', { st: { display: 'flex' }, r: R(0, 0, 100, 20) }, T('só texto')));
ok('flex só com texto não perde o texto', /só texto/.test(h));

// cabeçalho: logo que só tinha um ícone (removido) não deixa recuo vazio antes do título
const cab = E('div', { st: { display: 'flex' }, r: R(0, 0, 700, 60) },
    E('div', { r: R(0, 0, 56, 56) }, E('span', { cls: 'material-symbols-outlined' }, T('account_balance'))),
    E('div', { r: R(68, 0, 500, 56) }, E('div', { st: { fontWeight: '700' } }, T('PREFEITURA MUNICIPAL')), E('div', { st: { fontSize: '20px' } }, T('FICHA CADASTRAL'))));
h = conv().node(cab);
ok('ícone removido: nenhuma célula vazia/recuo antes do título (ele começa na margem)', (h.match(/<td/g) || []).length === 2 && /^<div[^>]*><table[^>]*><tr><td[^>]*width:71\.4%/.test(h) && /PREFEITURA MUNICIPAL/.test(h) && !/<td[^>]*>&nbsp;<\/td><td/.test(h.split('PREFEITURA')[0]));
const logoImg = E('div', { st: { display: 'flex' }, r: R(0, 0, 700, 60) }, E('div', { r: R(0, 0, 56, 56) }, E('img', { r: R(0, 0, 56, 56), attrs: { src: 'data:image/png;base64,QQ==' } })), E('div', { r: R(68, 0, 500, 56) }, T('Título')));
h = conv().node(logoImg);
ok('logo em imagem de verdade continua na célula da esquerda', /<img /.test(h) && h.indexOf('<img') < h.indexOf('Título') && (h.match(/<td/g) || []).length >= 3);
const dir = E('div', { st: { display: 'flex' }, r: R(0, 0, 400, 20) }, E('span', { r: R(300, 0, 100, 20) }, T('à direita')));
ok('conteúdo propositalmente à direita mantém o espaço à esquerda (só o vazio é que some)', /<td[^>]*width:75%[^>]*>&nbsp;<\/td>/.test(conv().node(dir)));
// linha única não quebra no Word
const emissao = E('div', { st: { display: 'flex' }, r: R(0, 0, 300, 14) }, E('span', { st: { fontSize: '10px' }, r: R(0, 0, 60, 12) }, T('Emissão:')), E('span', { st: { fontSize: '10px' }, r: R(64, 0, 90, 12) }, T('20/09/2026 19:07')));
h = conv().node(emissao);
eq('o que cabia em uma linha na tela não quebra no Word (nowrap nas duas células)', (h.match(/white-space:nowrap[^"]*"[^>]*><span/g) || []).length, 2);
const longo = E('div', { st: { display: 'flex' }, r: R(0, 0, 300, 60) }, E('div', { st: { fontSize: '10px' }, r: R(0, 0, 100, 40) }, T('texto que na tela ocupa várias linhas')));
ok('o que já ocupava várias linhas na tela pode quebrar', !/white-space:nowrap/.test(conv().node(longo)));

// ---------------------------------------------------------------- imagens e capturas
h = conv().node(E('img', { r: R(0, 0, 120, 80), attrs: { src: 'https://x/foto.jpg', alt: 'Foto <1>' } }));
eq('imagem: tamanho vindo do layout e alt escapado', h, '<img src="https://x/foto.jpg" width="120" height="80" alt="Foto &lt;1&gt;" />');
const mapaEl = E('div', { id: 'map-wrap', r: R(0, 0, 600, 340), st: { position: 'relative' } }, E('div', { id: 'interactive-report-map' }, T('mapa vivo')), E('div', { id: 'map-north', st: { position: 'absolute' } }, T('N')));
h = conv({ 'map-wrap': { dataUrl: 'data:image/png;base64,QUJD', w: 1200, h: 680 } }).node(mapaEl);
ok('mapa capturado: vira a imagem, na largura do layout e com a proporção da captura', /<img src="data:image\/png;base64,QUJD" width="600" height="340"/.test(h) && !/mapa vivo|N</.test(h));
h = conv({ 'map-wrap': null }).node(mapaEl);
ok('captura que falhou: aviso no lugar do mapa', /não foi possível gerar a imagem/.test(h) && !/mapa vivo/.test(h));
h = conv({ 'map-wrap': { dataUrl: 'data:image/png;base64,QQ==', w: 300, h: 100 } }).node(E('div', { id: 'map-wrap', st: { position: 'absolute' }, r: R(0, 0, 300, 100) }));
ok('elemento capturado nunca é descartado, mesmo posicionado', /<img /.test(h));

// ---------------------------------------------------------------- tabelas de dados
const tabela = E('table', { st: { display: 'table' } },
    E('thead', {}, E('tr', {}, E('th', { st: { backgroundColor: 'rgb(241, 245, 249)', fontWeight: '700', borderRightWidth: '1px', borderRightStyle: 'solid', borderRightColor: 'rgb(226, 232, 240)' }, attrs: { colspan: '2' } }, T('Ponto')))),
    E('tbody', {}, E('tr', {}, E('td', { st: { textAlign: 'right' } }, T('1')), E('td', { st: { verticalAlign: 'middle' } }, T('2')))));
h = conv().node(tabela);
ok('tabela de dados: mantém a estrutura, colspan, cabeçalho em cinza e alinhamentos', /^<table/.test(h) && /<thead/.test(h) && /<th colspan="2"[^>]*background:#f1f5f9/.test(h) && /text-align:right/.test(h) && /valign="middle"/.test(h) && /border-collapse:collapse/.test(h));

// ---------------------------------------------------------------- documento: folhas → fluxo + cabeçalho + rodapé
const pagina = (n, corpo) => E('div', { cls: 'a4-page w-full', r: R(0, n * 1200, 794, 1123) },
    E('div', { cls: 'a4-page-header-slot' }, E('div', { st: { fontWeight: '700' } }, T('CABEÇALHO'))),
    E('div', { cls: 'a4-page-body-slot' }, ...corpo),
    E('div', { cls: 'a4-page-footer-slot' }, E('div', { st: { display: 'flex' }, r: R(0, 0, 700, 20) }, E('span', { r: R(0, 0, 300, 20) }, T('Emitido em 20/09/2026')), E('span', { r: R(600, 0, 100, 20) }, T('Página 01 de 02')))));
const raiz = E('div', {}, pagina(0, [E('p', {}, T('corpo da 1ª'))]), pagina(1, [E('p', {}, T('corpo da 2ª'))]));
const doc = RW.buildDocument(raiz, env());
ok('cabeçalho da primeira folha entra uma vez só', /CABEÇALHO/.test(doc.header) && !/CABEÇALHO/.test(doc.body));
ok('corpos de todas as folhas viram um fluxo contínuo, na ordem', doc.body.indexOf('corpo da 1ª') >= 0 && doc.body.indexOf('corpo da 1ª') < doc.body.indexOf('corpo da 2ª'));
ok('rodapé vira o do Word, com os campos PAGE e NUMPAGES no lugar do "Página 01 de 02"', /Emitido em 20\/09\/2026/.test(doc.footer) && /mso-field-code:" PAGE "/.test(doc.footer) && /mso-field-code:" NUMPAGES "/.test(doc.footer) && !/01 de 02/.test(doc.footer));
eq('sem folhas: converte o conteúdo inteiro', RW.buildDocument(E('div', {}, E('p', {}, T('solto'))), env()).body.includes('solto'), true);

const arquivo = RW.wordFileHtml({ title: 'Ficha <X>', page: { widthMm: 297, heightMm: 420 }, margins: { top: 20, bottom: 20, left: 15, right: 15 } }, doc);
ok('arquivo: papel A3 e margens do modelo', /size: 841\.9pt 1190\.6pt/.test(arquivo) && /margin: 20mm 15mm 20mm 15mm/.test(arquivo) && /mso-page-orientation: portrait/.test(arquivo));
ok('arquivo: o rodapé é uma tabela mso-element:footer FORA da seção (o <div> era repetido no fim do texto pelo Word)', /<\/div>\n<table id=f1 style='mso-element:footer'/.test(arquivo) && !/<div style='mso-element:footer'/.test(arquivo) && arquivo.indexOf('</div>\n<table id=f1') > arquivo.indexOf('corpo da 2ª'));
ok('arquivo: título escapado, rodapé ligado à seção e cabeçalho antes do corpo', /<title>Ficha &lt;X&gt;<\/title>/.test(arquivo) && /mso-footer: f1/.test(arquivo) && /mso-element:footer/.test(arquivo) && /Emitido em 20\/09\/2026/.test(arquivo.split('mso-element:footer')[1]) && arquivo.indexOf('CABEÇALHO') < arquivo.indexOf('corpo da 1ª'));
ok('arquivo: paisagem', /landscape/.test(RW.wordFileHtml({ title: 't', page: { widthMm: 420, heightMm: 297 } }, { body: '' })));

console.log(`reportWord: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
