// tests/reportExport.test.js
// Hash, protocolo e documento do Word (MHTML com imagens embutidas). Rodar com: node tests/reportExport.test.js

const RE = require('../src/reportExport.js');
const nodeCrypto = require('crypto');

let total = 0;
let failed = 0;
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

(async () => {
    // ---------------------------------------------------------------- JSON estável
    eq('chaves em ordem, sem espaços', RE.stableStringify({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } }), '{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}');
    eq('ordem das chaves não muda o resultado', RE.stableStringify({ a: 1, b: 2 }), RE.stableStringify({ b: 2, a: 1 }));
    eq('undefined some do objeto e vira null solto', [RE.stableStringify({ a: undefined, b: 1 }), RE.stableStringify(undefined)], ['{"b":1}', 'null']);
    eq('textos com aspas e acentos', RE.stableStringify({ t: 'a"ç' }), '{"t":"a\\"ç"}');

    // ---------------------------------------------------------------- SHA-256 (vetores conhecidos)
    eq('SHA-256 de "abc"', await RE.sha256Hex('abc', nodeCrypto.webcrypto), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    eq('SHA-256 do texto vazio', await RE.sha256Hex('', nodeCrypto.webcrypto), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    eq('SHA-256 com acento (UTF-8)', await RE.sha256Hex('ção', nodeCrypto.webcrypto), nodeCrypto.createHash('sha256').update('ção', 'utf8').digest('hex'));
    let erro = null;
    try { await RE.sha256Hex('x', {}); } catch (e) { erro = e.message; }
    ok('sem WebCrypto: erro claro', /indisponível/.test(erro || ''));

    // ---------------------------------------------------------------- conteúdo do hash
    const base = { template: { id: 'r1', nome: 'Ficha', config_pagina: { tamanho: 'A4' }, blocos: [{ id: 'b', tipo: 'mapa_estatico' }] }, featureKey: '10', featureData: { nome: 'Fulano' }, geometry: { type: 'Point', coordinates: [1, 2] }, mapa: { norte: true }, temporal: { ativo: false }, textos: ['a'] };
    const c1 = RE.buildHashContent(base);
    eq('mesmo conteúdo, mesmo texto (independe da ordem das chaves)', RE.buildHashContent(JSON.parse(JSON.stringify({ textos: base.textos, temporal: base.temporal, mapa: base.mapa, geometry: base.geometry, featureData: base.featureData, featureKey: base.featureKey, template: base.template }))), c1);
    const h1 = await RE.sha256Hex(c1, nodeCrypto.webcrypto);
    const variantes = {
        'dado da feição': Object.assign({}, base, { featureData: { nome: 'Beltrano' } }),
        'geometria': Object.assign({}, base, { geometry: { type: 'Point', coordinates: [1, 3] } }),
        'configuração do mapa': Object.assign({}, base, { mapa: { norte: false } }),
        'texto editado na folha': Object.assign({}, base, { textos: ['b'] }),
        'modelo': Object.assign({}, base, { template: Object.assign({}, base.template, { nome: 'Outra' }) }),
        'chave da feição': Object.assign({}, base, { featureKey: '11' })
    };
    for (const k of Object.keys(variantes)) ok(`hash muda quando muda: ${k}`, (await RE.sha256Hex(RE.buildHashContent(variantes[k]), nodeCrypto.webcrypto)) !== h1);
    ok('a hora não entra no hash (não há campo de hora no conteúdo)', !/emit|hora|timestamp/i.test(c1));
    eq('sem partes: conteúdo mínimo válido', JSON.parse(RE.buildHashContent({})).v, 1);

    // ---------------------------------------------------------------- protocolo
    eq('protocolo: data + 8 primeiros do hash em maiúsculas', RE.makeProtocol('7f83b1657ff1fc53b92dc18148a1d65d', new Date(2026, 8, 20)), '20260920-7F83B165');
    eq('protocolo com mês e dia de um dígito', RE.makeProtocol('abcdef0123456789', new Date(2026, 0, 5)), '20260105-ABCDEF01');

    // ---------------------------------------------------------------- Word
    eq('limpeza: tira ícones de fonte, edição e eventos', RE.cleanForWord('<div contenteditable="true" onclick="x()" ondblclick="y()">A<span class="material-symbols-outlined text-sm">navigation</span>B</div>'), '<div>AB</div>');
    const doc = RE.wordDocumentHtml({ title: 'Ficha <X>', bodyHtml: '<p>corpo</p>', page: { widthMm: 297, heightMm: 420 }, margins: { top: 15, bottom: 15, left: 20, right: 20 } });
    ok('Word: papel A3 retrato em pontos (297×420 mm)', /size: 841\.9pt 1190\.6pt/.test(doc) && /mso-page-orientation: portrait/.test(doc));
    ok('Word: margens do modelo', /margin: 15mm 20mm 15mm 20mm/.test(doc));
    ok('Word: título escapado e corpo dentro da seção', /<title>Ficha &lt;X&gt;<\/title>/.test(doc) && /<div class="Section1">\s*<p>corpo<\/p>/.test(doc));
    ok('Word: A4 paisagem', /size: 841\.9pt 595\.3pt/.test(RE.wordDocumentHtml({ title: 't', bodyHtml: '', page: { widthMm: 297, heightMm: 210 } })) && /landscape/.test(RE.wordDocumentHtml({ title: 't', bodyHtml: '', page: { widthMm: 297, heightMm: 210 } })));

    // ---------------------------------------------------------------- imagens dentro do arquivo
    const png = Buffer.from('imagem-de-mentira').toString('base64');
    const jpg = Buffer.from('outra').toString('base64');
    const html = `<p>a</p><img class="x" src="data:image/png;base64,${png}" style="width:10px"><img src="https://site/foto.jpg"><img alt="" src="data:image/jpeg;base64,${jpg}">`;
    const ex = RE.extractDataImages(html);
    eq('duas imagens data: extraídas, a de URL externa fica', ex.images.map(i => [i.name, i.contentType, i.base64]), [['imagem1.png', 'image/png', png], ['imagem2.jpg', 'image/jpeg', jpg]]);
    ok('HTML aponta para as partes do arquivo', ex.html.includes('src="file:///C:/relatorio_arquivos/imagem1.png"') && ex.html.includes('src="file:///C:/relatorio_arquivos/imagem2.jpg"') && ex.html.includes('https://site/foto.jpg') && !/data:image/.test(ex.html));

    const mh = RE.buildMhtml('<html><body>ação</body></html>', ex.images, 'FRONTEIRA');
    ok('MHTML: cabeçalho multipart/related com a fronteira', mh.startsWith('MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="FRONTEIRA"'));
    const partes = mh.split('--FRONTEIRA').slice(1, -1);
    eq('MHTML: uma parte de HTML + uma por imagem', partes.length, 3);
    ok('MHTML: HTML em base64 UTF-8 e volta igual', (() => { const b64 = partes[0].split('\r\n\r\n')[1].replace(/\s+/g, ''); return Buffer.from(b64, 'base64').toString('utf8') === '<html><body>ação</body></html>'; })());
    ok('MHTML: imagem com tipo e local corretos', /Content-Type: image\/png/.test(partes[1]) && /Content-Location: file:\/\/\/C:\/relatorio_arquivos\/imagem1\.png/.test(partes[1]) && partes[1].replace(/\s+/g, '').includes(png));
    ok('MHTML: termina com a fronteira final', mh.trimEnd().endsWith('--FRONTEIRA--'));
    const grande = 'A'.repeat(500);
    ok('MHTML: base64 quebrado em linhas de 76', RE.buildMhtml('x', [{ name: 'a.png', contentType: 'image/png', base64: grande }], 'F').split('\r\n').filter(l => /^A+$/.test(l)).every(l => l.length <= 76));
    ok('toWordMhtml: do HTML com data: ao arquivo pronto', (() => { const out = RE.toWordMhtml(`<img src="data:image/png;base64,${png}">`); return /multipart\/related/.test(out) && /imagem1\.png/.test(out) && !/data:image/.test(out.split('\r\n\r\n')[1] ? Buffer.from(out.split('\r\n\r\n')[1].split('--')[0].replace(/\s+/g, ''), 'base64').toString('utf8') : ''); })());

    // ---------------------------------------------------------------- mapas viram imagem; grades viram tabela
    const pagina = '<div class="a"><div id="map-wrap" class="relative"><div id="interactive-report-map" style="h:1"></div><div id="map-north">N</div></div><p>depois</p></div>';
    eq('acha o <div> pelo id com os aninhados dentro', RE.findDivById(pagina, 'map-wrap') && pagina.slice(RE.findDivById(pagina, 'map-wrap').start, RE.findDivById(pagina, 'map-wrap').end).endsWith('N</div></div>'), true);
    eq('id inexistente', RE.findDivById(pagina, 'nao-existe'), null);
    eq('id com caracteres especiais não quebra a busca', RE.findDivById('<div id="a.b+c">x</div>', 'a.b+c') !== null, true);
    eq('troca o mapa inteiro pela imagem, sem sobrar pedaços', RE.replaceDivById(pagina, 'map-wrap', '<img>'), '<div class="a"><img><p>depois</p></div>');
    const corpo = RE.prepareWordBody(pagina, { 'map-wrap': { dataUrl: 'data:image/png;base64,QUJD', w: 500.4, h: 300 } });
    ok('corpo do Word: imagem com tamanho e sem restos do mapa interativo', /<img src="data:image\/png;base64,QUJD" width="500" height="300"/.test(corpo) && !/interactive-report-map|map-north/.test(corpo) && /<p>depois<\/p>/.test(corpo));
    ok('captura que falhou vira aviso, não buraco', /não foi possível gerar a imagem/.test(RE.prepareWordBody(pagina, { 'map-wrap': null })) && !/map-north/.test(RE.prepareWordBody(pagina, { 'map-wrap': null })));
    const linha = '<div class="mb-4"><div data-split-row class="report-trow" style="display:grid;"><div class="report-tframe"><div class="report-tframe-title">A</div><div id="tmap-wrap-r1"><div id="tmap-r1"></div></div></div><div class="report-tframe"><div class="report-tframe-title">B</div><div id="tmap-wrap-r2"></div></div><div></div></div><div data-split-row class="report-trow"><div class="report-tframe">C</div><div></div></div></div>';
    const tab = RE.gridRowsToTables(linha);
    eq('grade vira tabela: uma linha de tabela por fileira', (tab.match(/<table/g) || []).length, 2);
    ok('cada quadro (e o espaço vazio) numa célula, na ordem', /<td[^>]*>\s*<div class="report-tframe">\s*<div class="report-tframe-title">A<\/div>/.test(tab) && (tab.match(/<td /g) || []).length === 5 && !/display:grid/.test(tab) && !/report-trow/.test(tab));
    ok('largura das células divide a linha', /width:33%/.test(tab) && /width:50%/.test(tab));
    const tudo = RE.prepareWordBody(linha, { 'tmap-wrap-r1': { dataUrl: 'data:image/jpeg;base64,QQ==', w: 300, h: 200 }, 'tmap-wrap-r2': null });
    ok('imagem do quadro e aviso do quadro sem captura, dentro das células', /<td[^>]*>[\s\S]*<img src="data:image\/jpeg/.test(tudo) && /não foi possível gerar a imagem/.test(tudo));
    ok('do HTML preparado ao arquivo: a imagem vai como parte do MHTML', /imagem1\.jpg/.test(RE.toWordMhtml(RE.wordDocumentHtml({ title: 't', bodyHtml: tudo, page: { widthMm: 210, heightMm: 297 } }))));

    console.log(`reportExport: ${total - failed}/${total} verificações passaram`);
    if (failed > 0) {
        console.error(`${failed} falha(s)`);
        process.exit(1);
    }
})();
