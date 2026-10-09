const fs = require('fs');
const s = fs.readFileSync('relatorio_view.html', 'utf8');
s.split('\n').forEach((l, i) => {
    if (l.includes('isGeral') || l.includes('mapa-feicoes') || l.includes('renderMapToolsPanel') || l.includes('applyMapPanelVisibility')) {
        console.log((i+1) + ': ' + l.trim());
    }
});
