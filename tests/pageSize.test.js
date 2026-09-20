// tests/pageSize.test.js
// Rodar com: node tests/pageSize.test.js

const PS = require('../src/pageSize.js');

let total = 0;
let failed = 0;
function eq(name, a, e) {
    total++;
    if (JSON.stringify(a) === JSON.stringify(e)) return;
    failed++;
    console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`);
}

const a4 = PS.dims({ tamanho: 'A4', orientacao: 'portrait' });
eq('A4 retrato em mm', [a4.widthMm, a4.heightMm], [210, 297]);
eq('A4 retrato em px (mantém 794 × 1123 já usados)', [a4.widthPx, a4.heightPx], [794, 1123]);
eq('A4 retrato: @page', a4.cssPageSize, 'A4 portrait');

const a4l = PS.dims({ tamanho: 'A4', orientacao: 'landscape' });
eq('A4 paisagem em mm', [a4l.widthMm, a4l.heightMm], [297, 210]);
eq('A4 paisagem em px', [a4l.widthPx, a4l.heightPx], [1123, 794]);

const a3 = PS.dims({ tamanho: 'A3', orientacao: 'portrait' });
eq('A3 retrato em mm', [a3.widthMm, a3.heightMm], [297, 420]);
eq('A3 retrato em px', [a3.widthPx, a3.heightPx], [1123, 1588]);
eq('A3 retrato: @page', a3.cssPageSize, 'A3 portrait');
eq('A3 retrato: legenda', a3.label, '297 × 420 mm (Retrato)');

const a3l = PS.dims({ tamanho: 'a3', orientacao: 'landscape' });
eq('A3 paisagem (minúsculo aceito)', [a3l.name, a3l.widthMm, a3l.heightMm], ['A3', 420, 297]);
eq('A3 paisagem: legenda', a3l.label, '420 × 297 mm (Paisagem)');

// modelos antigos (sem tamanho) e valores inválidos caem em A4 retrato
eq('sem config → A4 retrato', PS.dims(undefined).cssPageSize, 'A4 portrait');
eq('sem tamanho → A4', PS.dims({ orientacao: 'landscape' }).cssPageSize, 'A4 landscape');
eq('tamanho inválido → A4', PS.dims({ tamanho: 'A0' }).name, 'A4');

console.log(`pageSize: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
