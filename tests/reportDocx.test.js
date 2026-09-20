// tests/reportDocx.test.js
// Arquivo .docx do relatório: ZIP sem compressão, OOXML do documento e do rodapé (campos de página, QR).
// Rodar com: node tests/reportDocx.test.js

const D = require('../src/reportDocx.js');
const nodeZlib = require('zlib');

let total = 0;
let failed = 0;
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }
const txt = (u, n) => Buffer.from(u[n] || []).toString('utf8');

// ---------------------------------------------------------------- CRC-32 e ZIP
eq('CRC-32 de "123456789" (vetor padrão)', D.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
eq('CRC-32 do vazio', D.crc32(new Uint8Array(0)), 0);
const z = D.zip([{ name: 'a.txt', data: 'olá' }, { name: 'pasta/b.bin', data: new Uint8Array([0, 255, 128, 1]) }]);
ok('começa com a assinatura de arquivo local do ZIP (PK\\x03\\x04) e termina com o registro final', z[0] === 0x50 && z[1] === 0x4B && z[2] === 3 && z[3] === 4 && (z[z.length - 22] === 0x50 && z[z.length - 21] === 0x4B && z[z.length - 20] === 5 && z[z.length - 19] === 6));
const u = D.unzip(z);
eq('lê de volta os mesmos nomes e bytes (UTF-8 e binário)', [Object.keys(u), Buffer.from(u['a.txt']).toString('utf8'), Array.from(u['pasta/b.bin'])], [['a.txt', 'pasta/b.bin'], 'olá', [0, 255, 128, 1]]);
eq('o mesmo conteúdo gera os mesmos bytes (arquivo reprodutível)', Buffer.from(D.zip([{ name: 'a.txt', data: 'x' }])).toString('hex'), Buffer.from(D.zip([{ name: 'a.txt', data: 'x' }])).toString('hex'));
let erro = null;
const corrompido = Uint8Array.from(z); corrompido[36] ^= 0xFF; // estraga um byte do conteúdo
try { D.unzip(corrompido); } catch (e) { erro = e.message; }
ok('CRC detecta conteúdo corrompido', /CRC inválido/.test(erro || ''));
erro = null; try { D.unzip(new Uint8Array(10)); } catch (e) { erro = e.message; }
ok('arquivo que não é ZIP dá erro claro', /ZIP inválido/.test(erro || ''));
const grande = new Uint8Array(200000).map((_, i) => i % 251);
eq('arquivo grande (200 kB) volta idêntico', Buffer.compare(Buffer.from(D.unzip(D.zip([{ name: 'g.bin', data: grande }]))['g.bin']), Buffer.from(grande)), 0);
ok('base64 → bytes', Array.from(D.b64ToBytes('QUJD')).join() === '65,66,67' && Array.from(D.b64ToBytes('QU\nJD ')).join() === '65,66,67');

// ---------------------------------------------------------------- pacote .docx
const qr = D.b64ToBytes('R0lGODlhAQABAAAAACw=');
const rodape = { data: 'Emitido em 20/09/2026 às 19:51:27', hash: 'f410fc060120dc1c…', qr: qr, qrExt: 'gif' };
const bytes = D.build({ mhtml: 'MIME-Version: 1.0\r\n\r\ncorpo', page: { widthMm: 210, heightMm: 297 }, margins: { top: 15, bottom: 15, left: 15, right: 15 }, footer: rodape });
const f = D.unzip(bytes);
eq('partes do pacote', Object.keys(f).sort(), ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/_rels/footer1.xml.rels', 'word/afchunk.mht', 'word/document.xml', 'word/footer1.xml', 'word/media/qr.gif']);
ok('tipos de conteúdo: documento, rodapé, MHT (message/rfc822) e GIF', /word\/document\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"/.test(txt(f, '[Content_Types].xml')) && /footer1\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.footer\+xml"/.test(txt(f, '[Content_Types].xml')) && /Extension="mht" ContentType="message\/rfc822"/.test(txt(f, '[Content_Types].xml')) && /Extension="gif" ContentType="image\/gif"/.test(txt(f, '[Content_Types].xml')));
ok('relações: documento principal; corpo como aFChunk; rodapé', /officeDocument" Target="word\/document\.xml"/.test(txt(f, '_rels/.rels')) && /aFChunk" Target="afchunk\.mht"/.test(txt(f, 'word/_rels/document.xml.rels')) && /\/footer" Target="footer1\.xml"/.test(txt(f, 'word/_rels/document.xml.rels')));
eq('o corpo (MHTML) vai sem alteração', txt(f, 'word/afchunk.mht'), 'MIME-Version: 1.0\r\n\r\ncorpo');
const doc = txt(f, 'word/document.xml');
ok('documento: o corpo entra por altChunk e a seção referencia o rodapé', /<w:altChunk r:id="rIdHtml"\/>/.test(doc) && /<w:footerReference w:type="default" r:id="rIdFooter"\/>/.test(doc));
ok('papel A4 retrato em twips e margens de 15 mm', /w:w="11906" w:h="16838"/.test(doc) && !/orient/.test(doc) && /w:top="850" w:right="850" w:bottom="850" w:left="850"/.test(doc));
const a3 = txt(D.unzip(D.build({ mhtml: 'x', page: { widthMm: 297, heightMm: 420 }, margins: { top: 20, bottom: 20, left: 15, right: 15 }, footer: {} })), 'word/document.xml');
ok('papel A3 retrato (297×420 mm)', /w:w="16838" w:h="23811"/.test(a3) && /w:top="1134"/.test(a3));
const pais = txt(D.unzip(D.build({ mhtml: 'x', page: { widthMm: 420, heightMm: 297 }, footer: {} })), 'word/document.xml');
ok('papel A3 paisagem declara orient="landscape"', /w:w="23811" w:h="16838" w:orient="landscape"/.test(pais));

// ---------------------------------------------------------------- rodapé
const ftr = txt(f, 'word/footer1.xml');
ok('rodapé: data, SHA-256 (em negrito) e tabulação à direita na largura útil (180 mm)', /Emitido em 20\/09\/2026 às 19:51:27/.test(ftr) && /SHA-256: /.test(ftr) && /f410fc060120dc1c…/.test(ftr) && /<w:tab w:val="right" w:pos="10205"\/>/.test(ftr));
ok('rodapé: "Página X de Y" com os campos PAGE e NUMPAGES (o Word atualiza em cada folha)', /Página /.test(ftr) && /<w:fldSimple w:instr=" PAGE ">/.test(ftr) && /<w:fldSimple w:instr=" NUMPAGES ">/.test(ftr));
ok('rodapé: QR code como imagem alinhada na linha, com texto alternativo', /<w:drawing><wp:inline/.test(ftr) && /r:embed="rIdQr"/.test(ftr) && /descr="QR code de verificação de autenticidade"/.test(ftr) && /cx="381000" cy="381000"/.test(ftr));
ok('rodapé: linha superior fina separando do corpo e sem espaçamento extra', /<w:pBdr><w:top w:val="single"/.test(ftr) && /<w:spacing w:before="0" w:after="0"\/>/.test(ftr));
eq('imagem do QR guardada no pacote, ligada pela relação do rodapé', [Buffer.compare(Buffer.from(f['word/media/qr.gif']), Buffer.from(qr)), /rIdQr" Type="[^"]*\/image" Target="media\/qr\.gif"/.test(txt(f, 'word/_rels/footer1.xml.rels'))], [0, true]);
// opções desligadas no modelo do rodapé
const semTudo = D.unzip(D.build({ mhtml: 'x', footer: { data: 'Emitido em X', hash: 'abc…', qr: qr, mostrarData: false, mostrarHash: false, mostrarQr: false, mostrarPaginas: false } }));
const ftr2 = txt(semTudo, 'word/footer1.xml');
ok('sem data, hash, QR nem páginas: nada disso aparece e o pacote não leva o GIF', !/Emitido em/.test(ftr2) && !/SHA-256/.test(ftr2) && !/<w:drawing>/.test(ftr2) && !/PAGE/.test(ftr2) && !semTudo['word/media/qr.gif'] && !semTudo['word/_rels/footer1.xml.rels'] && !/Extension="gif"/.test(txt(semTudo, '[Content_Types].xml')));
const semQr = D.unzip(D.build({ mhtml: 'x', footer: { data: 'D', hash: 'H…' } }));
ok('sem QR disponível (ex.: biblioteca não carregou): rodapé sem imagem, com o resto', !semQr['word/media/qr.gif'] && /PAGE/.test(txt(semQr, 'word/footer1.xml')) && !/<w:drawing>/.test(txt(semQr, 'word/footer1.xml')));
ok('texto do rodapé é escapado no XML', /&lt;b&gt;&amp;/.test(txt(D.unzip(D.build({ mhtml: 'x', footer: { data: '<b>&', hash: '' } })), 'word/footer1.xml')));

// ---------------------------------------------------------------- todas as partes XML são bem formadas (verificação estrutural simples)
const wellFormed = (s) => { const st = []; const re = /<(\/?)([A-Za-z0-9:_-]+)([^>]*?)(\/?)>/g; let m; while ((m = re.exec(s.replace(/<\?[^>]*\?>/g, '')))) { if (m[4]) continue; if (m[1]) { if (st.pop() !== m[2]) return false; } else st.push(m[2]); } return st.length === 0; };
ok('XML bem formado: tipos, relações, documento e rodapé', ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/_rels/footer1.xml.rels', 'word/document.xml', 'word/footer1.xml'].every(n => wellFormed(txt(f, n))));

console.log(`reportDocx: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
