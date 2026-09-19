// tests/viewerResolve.test.js
// Garante que o visualizador (relatorio_view.html) resolve campos pelo ID do schema e formata por TIPO.
// As funções são extraídas do próprio HTML, então o teste protege o código que roda de verdade.
// Rodar com: node tests/viewerResolve.test.js

const fs = require('fs');
const path = require('path');
const FieldFormatter = require('../src/fieldFormatter.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'relatorio_view.html'), 'utf8');
const lines = html.split(/\r?\n/);

/** Extrai o código de uma função declarada com 8 espaços de indentação, sem chaves por contagem. */
function extractFunction(name) {
    const start = lines.findIndex(l => l.startsWith(`        function ${name}(`));
    if (start < 0) throw new Error(`função ${name} não encontrada em relatorio_view.html`);
    let end = start;
    while (end < lines.length && lines[end] !== '        }') end++;
    return lines.slice(start, end + 1).join('\n');
}

const reportPayload = { featureGeometry: null };
const turf = undefined;
// eslint-disable-next-line no-new-func
const load = new Function('FieldFormatter', 'reportPayload', 'turf', `
    ${extractFunction('getGeometryCenter')}
    ${extractFunction('formatFieldValueForDisplay')}
    ${extractFunction('readFieldRaw')}
    ${extractFunction('resolveFieldValue')}
    return { resolveFieldValue, formatFieldValueForDisplay, readFieldRaw };
`);
const { resolveFieldValue } = load(FieldFormatter, reportPayload, turf);

let total = 0;
let failed = 0;
const norm = (s) => String(s).replace(/ /g, ' ');
function eq(name, actual, expected) {
    total++;
    if (norm(actual) === norm(expected)) return;
    failed++;
    console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(expected)}\n     obtido:   ${JSON.stringify(actual)}`);
}

// Cenário real do sistema: abas de entes diferentes com campos de MESMO título e ids distintos.
const ipl_mpf = { id: 'f_mpf_ipl', name: 'ipl', label: 'IPL', type: 'ipl' };
const ipl_pf = { id: 'f_pf_ipl', name: 'ipl', label: 'IPL', type: 'ipl' };
const data = {
    f_mpf_ipl: '00012345620258150001',
    f_pf_ipl: '',                       // vazio na aba da PF
    f_lote: '87',
    f_loteamento: '',                   // "Loteamento" vazio, "Lote" preenchido
    f_valor: '1234.5'
};

eq('campo repetido em outra aba lê o SEU id (MPF)', resolveFieldValue(ipl_mpf, data), '0001234-56.2025.8.15.0001');
eq('campo repetido em outra aba vazio continua vazio (PF), sem herdar o do MPF', resolveFieldValue(ipl_pf, data), '—');

eq('"Loteamento" vazio NÃO herda o valor de "Lote"',
    resolveFieldValue({ id: 'f_loteamento', label: 'Loteamento', type: 'text' }, data), '—');
eq('"Lote" preenchido continua correto',
    resolveFieldValue({ id: 'f_lote', label: 'Lote', type: 'text' }, data), '87');

eq('sem chave no dado → vazio, sem busca por rótulo',
    resolveFieldValue({ id: 'f_inexistente', label: 'Lote', type: 'text' }, data), '—');
eq('nome/rótulo iguais a uma chave do dado NÃO são usados quando há id',
    resolveFieldValue({ id: 'f_outro', name: 'f_lote', label: 'f_lote', type: 'text' }, data), '—');

eq('moeda formatada pelo tipo', resolveFieldValue({ id: 'f_valor', label: 'Valor venal', type: 'currency' }, data), 'R$ 1.234,50');
eq('mesmo valor em campo de texto NÃO vira moeda, mesmo com "Valor (R$)" no rótulo',
    resolveFieldValue({ id: 'f_valor', label: 'Valor (R$)', type: 'text' }, data), '1234.5');

eq('definição sem id (menção antiga) usa o nome exato',
    resolveFieldValue({ name: 'f_lote', type: 'text' }, data), '87');

eq('sem dados → vazio', resolveFieldValue(ipl_mpf, null), '—');
eq('sem campo → vazio', resolveFieldValue(null, data), '—');

console.log(`viewerResolve: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
