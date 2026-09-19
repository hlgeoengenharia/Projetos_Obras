// tests/fieldFormatter.test.js
// Testes do formatador único de campos. Rodar com: node tests/fieldFormatter.test.js
// Sem dependências externas. Sai com código 1 se algum caso falhar.

const F = require('../src/fieldFormatter.js');

let total = 0;
let failed = 0;

// O Intl usa espaço não separável entre "R$" e o valor; normalizamos para comparar.
const norm = (s) => String(s).replace(/ /g, ' ');

function eq(name, actual, expected) {
    total++;
    if (norm(actual) === norm(expected)) return;
    failed++;
    console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(expected)}\n     obtido:   ${JSON.stringify(actual)}`);
}

function ok(name, cond) {
    total++;
    if (cond) return;
    failed++;
    console.error(`  FALHOU: ${name}`);
}

const T = (type, extra) => Object.assign({ type }, extra || {});
const text = (v, f, o) => F.toText(v, f, o);
const html = (v, f, o) => F.toHtml(v, f, o);

// ------------------------------------------------------------------ vazio
['', '   ', null, undefined, 'null', 'undefined', '[]', '{}', []].forEach((v, i) => {
    eq(`vazio #${i}`, text(v, T('text')), '—');
});

// ------------------------------------------------------------------ texto simples
eq('text', text('Rua das Flores', T('text')), 'Rua das Flores');
eq('number', text('12', T('number')), '12');
eq('select', text('2º Ofício PRPB - GAB RPF', T('select')), '2º Ofício PRPB - GAB RPF');
eq('current_user', text('Helton Leite', T('current_user')), 'Helton Leite');
eq('current_date (mantém)', text('14/08/2026 10:30', T('current_date')), '14/08/2026 10:30');
eq('boolean true', text(true, T('text')), 'Sim');
eq('boolean false', text(false, T('text')), 'Não');

// ------------------------------------------------------------------ data
eq('date ISO', text('2026-08-14', T('date')), '14/08/2026');
eq('date ISO com hora', text('2026-08-14T10:30:00', T('date')), '14/08/2026 10:30');
eq('date já formatada', text('14/08/2026', T('date')), '14/08/2026');

// ------------------------------------------------------------------ numéricos
eq('currency cru', text('1234.5', T('currency')), 'R$ 1.234,50');
eq('currency BR', text('1.234,56', T('currency')), 'R$ 1.234,56');
eq('currency texto inválido', text('abc', T('currency')), 'abc');
eq('area_m2 cru', text('720.62', T('area_m2')), '720,62 m²');
eq('area_m2 BR', text('1.500,5', T('area_m2')), '1.500,50 m²');
eq('length_m', text('12,5', T('length_m')), '12,50 m');
eq('volume_m3', text('3', T('volume_m3')), '3,00 m³');

// ------------------------------------------------------------------ documentos e códigos (idempotentes)
eq('cpf cru', text('12345678901', T('cpfcnpj')), '123.456.789-01');
eq('cpf mascarado', text('123.456.789-01', T('cpfcnpj')), '123.456.789-01');
eq('cnpj cru', text('12345678000195', T('cpfcnpj')), '12.345.678/0001-95');
eq('cnpj mascarado', text('12.345.678/0001-95', T('cpfcnpj')), '12.345.678/0001-95');
eq('cpf incompleto (cru)', text('123', T('cpfcnpj')), '123');

eq('ipl 20 dígitos', text('00012345620258150001', T('ipl')), '0001234-56.2025.8.15.0001');
eq('ipl mascarado', text('0001234-56.2025.8.15.0001', T('ipl')), '0001234-56.2025.8.15.0001');
eq('ipf mesmo formato', text('00012345620258150001', T('ipf')), '0001234-56.2025.8.15.0001');
eq('ipl curto (cru)', text('12345', T('ipl')), '12345');

eq('epol', text('20231234567', T('epol')), '2023.1234567');
eq('epol mascarado', text('2023.1234567', T('epol')), '2023.1234567');
eq('epol legado (type text, name epol)', text('20231234567', T('text', { name: 'epol' })), '2023.1234567');
eq('epol_1n', text('["20231234567","20241111111"]', T('epol_1n')), '2023.1234567, 2024.1111111');

eq('rip', text('1965000115506', T('rip')), '19650001155-06');
eq('rip_1n', text('["1965000115506"]', T('rip_1n')), '19650001155-06');

eq('insc imob cabedelo', text('1000402804052100398', T('insc_imob_cabedelo')), '1.0004.028.04.0521.0039.8');
eq('insc imob mascarada', text('1.0004.028.04.0521.0039.8', T('insc_imob_cabedelo')), '1.0004.028.04.0521.0039.8');

eq('pa/anpp/ap 18 dígitos', text('000000000000000000', T('pa_anpp_ap')), '0.00.000.000000/0000-00');
eq('pa/anpp/ap mascarado', text('0.00.000.000000/0000-00', T('pa_anpp_ap')), '0.00.000.000000/0000-00');

// ------------------------------------------------------------------ CEP / endereço
const cepJson = JSON.stringify({ cep: '58310000', logradouro: 'Rua A', numero: '12', complemento: 'ap 1', bairro: 'Poço', cidade: 'Cabedelo', uf: 'PB' });
eq('cep completo', text(cepJson, T('cep')), 'Rua A, nº 12 (ap 1) - Poço - Cabedelo - PB - CEP: 58310-000');
eq('cep só número/S-N', text(JSON.stringify({ logradouro: 'Rua B', numero: 'S/N' }), T('cep')), 'Rua B, S/N');
eq('cep texto cru (legado)', text('58310-000', T('cep')), '58310-000');

// ------------------------------------------------------------------ links
const link = JSON.stringify({ title: 'Processo', number: '123', url: 'exemplo.gov.br/x' });
eq('hiperlink texto', text(link, T('hiperlink')), 'Processo - 123');
ok('hiperlink html com https', html(link, T('hiperlink')).includes('href="https://exemplo.gov.br/x"'));
ok('hiperlink html com rel seguro', html(link, T('hiperlink')).includes('rel="noopener noreferrer"'));
const evil = JSON.stringify({ title: 'X', url: 'javascript:alert(1)' });
ok('hiperlink javascript: não vira link', !html(evil, T('hiperlink')).includes('href'));
eq('hiperlink só URL', text('exemplo.com', T('hiperlink')), 'exemplo.com');
eq('hiperlink_1n texto', text(JSON.stringify([{ title: 'A', number: '1', url: 'a.com' }, { title: 'B', url: 'b.com' }]), T('hiperlink_1n')), 'A - 1; B');
ok('hiperlink_1n html separa por <br>', html(JSON.stringify([{ title: 'A', url: 'a.com' }, { title: 'B', url: 'b.com' }]), T('hiperlink_1n')).includes('<br>'));

// ------------------------------------------------------------------ fotos e anexos
const files = JSON.stringify([
    { name: 'a.jpg', url: 'https://x/a.jpg', title: 'Fachada' },
    { name: 'b.jpg', url: 'https://x/b.jpg', deleted: true }
]);
eq('photo ignora excluídos', text(files, T('photo')), '1 foto(s)');
eq('attachment', text(files, T('attachment')), '1 anexo(s)');
ok('attachment html lista links', html(files, T('attachment')).includes('>Fachada</a>'));
eq('photo vazio', text('[]', T('photo')), '—');

// ------------------------------------------------------------------ geolocalização
eq('geolocation JSON', text('{"lat":-7.0182,"lng":-34.8336}', T('geolocation')), '-7.018200, -34.833600');
eq('geolocation texto', text('-7.0182, -34.8336', T('geolocation')), '-7.018200, -34.833600');
eq('geolocation fallback', text('', T('geolocation'), { geometryCenter: { lat: -7.0, lng: -34.8 } }), '-7.000000, -34.800000');
eq('geolocation sem dado', text('', T('geolocation')), '—');

// ------------------------------------------------------------------ HTML seguro
eq('escapa HTML', html('<b>x</b>', T('text')), '&lt;b&gt;x&lt;/b&gt;');
eq('textarea preserva quebras', html('linha1\nlinha2', T('textarea')), 'linha1<br>linha2');

// ------------------------------------------------------------------ o que causava erro: NADA de adivinhação por nome/rótulo/id
eq('rótulo "Valor (R$)" em campo de texto NÃO vira moeda', text('100', T('text', { label: 'Valor (R$)' })), '100');
eq('rótulo com "m2" em campo de texto NÃO vira área', text('50', T('text', { label: 'Área total m2' })), '50');
eq('id com "rip" NÃO vira máscara RIP', text('123456', T('text', { id: 'f_abcripxyz' })), '123456');
eq('id com "ipl" NÃO vira máscara IPL', text('00012345620258150001', T('text', { id: 'f_ipl_0' })), '00012345620258150001');
eq('rótulo "CPF" em campo de texto NÃO vira máscara', text('12345678901', T('text', { label: 'CPF' })), '12345678901');
eq('mesmo valor, tipos diferentes → formatos diferentes', text('12345678901', T('cpfcnpj')), '123.456.789-01');

// ------------------------------------------------------------------ resultado
console.log(`fieldFormatter: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
