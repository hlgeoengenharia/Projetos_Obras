// tests/verificarEmissao.test.js
// Verificação pública de autenticidade (protocolo do QR code + SHA-256). Rodar com: node tests/verificarEmissao.test.js

const VE = require('../src/verificarEmissao.js');

let total = 0;
let failed = 0;
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }

// ---------------------------------------------------------------- protocolo e código
eq('protocolo válido (aceita minúsculas, espaços soltos e "#")', [VE.normalizeProtocolo('20260920-7F83B165'), VE.normalizeProtocolo(' #20260920-7f83b165 '), VE.normalizeProtocolo('20260920 - 7f83b165')], ['20260920-7F83B165', '20260920-7F83B165', '20260920-7F83B165']);
eq('protocolo inválido', [VE.normalizeProtocolo(''), VE.normalizeProtocolo('abc'), VE.normalizeProtocolo('2026-09-20-7F83B165'), VE.normalizeProtocolo('20260920-7F83B16'), VE.normalizeProtocolo('20260920-7F83B16G'), VE.normalizeProtocolo(null)], [null, null, null, null, null, null]);
eq('código SHA-256: 8 a 64 hexadecimais, aceita o "…" do rodapé', [VE.normalizeHash('7F83B1657FF1FC53…'), VE.normalizeHash('7f83b165'), VE.normalizeHash('7f83b16'), VE.normalizeHash('zzzzzzzzzz'), VE.normalizeHash('a'.repeat(65))], ['7f83b1657ff1fc53', '7f83b165', null, null, null]);
eq('endereço do QR: só o protocolo', VE.verificationUrl('https://app.exemplo.gov.br/relatorio_view.html?templateId=x', '20260920-7F83B165'), 'https://app.exemplo.gov.br/verificar.html?p=20260920-7F83B165');
eq('endereço do QR em subpasta e no localhost', [VE.verificationUrl('http://localhost:8080/relatorio_view.html', '20260101-ABCDEF01'), VE.verificationUrl('https://x.com/app/relatorio_view.html', '20260101-ABCDEF01')], ['http://localhost:8080/verificar.html?p=20260101-ABCDEF01', 'https://x.com/app/verificar.html?p=20260101-ABCDEF01']);
ok('o endereço é curto (QR pequeno e legível no papel)', VE.verificationUrl('https://app.exemplo.gov.br/relatorio_view.html', '20260920-7F83B165').length < 70);
const dt = VE.fmtDataHora('2026-09-20T15:05:00');
ok('data e hora no formato brasileiro', /^20\/09\/2026 às 15:05$/.test(dt));
eq('data ilegível volta como veio', VE.fmtDataHora('ontem'), 'ontem');

// ---------------------------------------------------------------- interpretação da resposta do banco
const linha = { encontrado: true, emitido_em: '2026-09-20T15:05:00', formato: 'impressao', hash_confere: null };
let r = VE.interpretar('20260920-7F83B165', '', [linha]);
eq('protocolo registrado, sem SHA-256: pede o código para confirmar o conteúdo', [r.estado, r.titulo], ['ok', 'Protocolo registrado']);
ok('texto traz quando foi emitido e em que formato', /impressão\/PDF/.test(r.texto) && /20\/09\/2026 às 15:05/.test(r.texto) && /Informe também o código SHA-256/.test(r.texto));
r = VE.interpretar('20260920-7F83B165', '7f83b1657ff1fc53', [Object.assign({}, linha, { hash_confere: true, formato: 'word' })]);
eq('SHA-256 confere: documento autêntico', [r.estado, r.titulo], ['ok', 'Documento autêntico']);
ok('cita o Word e diz que o código confere', /exportação para Word/.test(r.texto) && /confere com o registrado/.test(r.texto));
r = VE.interpretar('20260920-7F83B165', '7f83b1657ff1fc53', [Object.assign({}, linha, { hash_confere: false })]);
eq('SHA-256 diferente: alerta de alteração (não diz "autêntico")', [r.estado, r.titulo], ['hash-diverge', 'Código SHA-256 não confere']);
ok('texto avisa que o conteúdo pode ter sido alterado', /pode ter sido alterado/.test(r.texto) && !/autêntico/i.test(r.titulo));
r = VE.interpretar('20260920-7F83B165', '', []);
eq('sem registro: não encontrado', [r.estado, r.titulo], ['nao-encontrado', 'Protocolo não encontrado']);
eq('resposta vazia ou nula = não encontrado', [VE.interpretar('20260920-7F83B165', '', null).estado, VE.interpretar('20260920-7F83B165', '', [{ encontrado: false }]).estado], ['nao-encontrado', 'nao-encontrado']);
eq('protocolo malformado: mensagem de formato, sem consultar', [VE.interpretar('xyz', '', []).estado, /AAAAMMDD-XXXXXXXX/.test(VE.interpretar('xyz', '', []).texto)], ['protocolo-invalido', true]);
eq('SHA-256 malformado: mensagem própria', [VE.interpretar('20260920-7F83B165', 'zz', [linha]).estado, /8 a 64 caracteres/.test(VE.interpretar('20260920-7F83B165', 'zz', [linha]).texto)], ['protocolo-invalido', true]);
ok('a resposta nunca inclui dados do relatório (só protocolo, data e formato)', !/feição|usuário|modelo|template/i.test(VE.interpretar('20260920-7F83B165', '', [linha]).texto));

console.log(`verificarEmissao: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
