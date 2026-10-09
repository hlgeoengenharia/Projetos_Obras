const fs = require('fs');
['relatorio_view.html', 'src/reportBuilder.js', 'src/reportBlocks.js'].forEach(f => {
    if (!fs.existsSync(f)) return;
    const s = fs.readFileSync(f, 'utf8');
    s.split('\n').forEach((l, i) => {
        if (l.includes('data-mapa-feicoes') || l.includes('mapa_geral') || l.includes('mapa_camada') || l.includes('tipo === \'geral\'') || l.includes('escopo === \'geral\'')) {
            console.log(f + ':' + (i+1) + ': ' + l.trim());
        }
    });
});
