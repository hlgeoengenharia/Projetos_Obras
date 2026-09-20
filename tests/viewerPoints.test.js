// tests/viewerPoints.test.js
// Executa a tabela de pontos (e o memorial) REAL do visualizador, extraída de relatorio_view.html,
// com o controlador do mapa simulado sobre as funções reais de MapTools.
// Rodar com: node tests/viewerPoints.test.js

const fs = require('fs');
const path = require('path');
const MT = require('../src/mapTools.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'relatorio_view.html'), 'utf8');
const lines = html.split(/\r?\n/);

function extractFunction(name) {
    const start = lines.findIndex(l => l.startsWith(`        function ${name}(`));
    if (start < 0) throw new Error(`função ${name} não encontrada`);
    let end = start;
    while (lines[end] !== '        }') end++;
    return lines.slice(start, end + 1).join('\n');
}

// eslint-disable-next-line no-new-func
const load = new Function('state', `
    let mapController = state.controller;
    ${extractFunction('escapeHtml')}
    ${extractFunction('renderPointsTable')}
    return { renderPointsTable, setController: (c) => { mapController = c; } };
`);

const quad = { type: 'Polygon', coordinates: [[[-34.84, -7.02], [-34.839, -7.02], [-34.839, -7.019], [-34.84, -7.019], [-34.84, -7.02]]] };
function controllerFor(pontos, geometry) {
    const cfg = MT.normalizeMapConfig({ mapa: { pontos } });
    return { getConfig: () => cfg, pointRows: () => MT.pointRows(geometry || quad, cfg.pontos) };
}
const api = load({ controller: null });

let total = 0;
let failed = 0;
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

// ---------------------------------------------------------------- quando não há tabela
eq('sem mapa ainda: nada', api.renderPointsTable(), '');
api.setController(controllerFor({ ativo: false, ordem: ['v:0'] }));
eq('pontos desligados: nada', api.renderPointsTable(), '');
api.setController(controllerFor({ ativo: true, tabela: false, ordem: ['v:0'] }));
eq('tabela desligada: nada', api.renderPointsTable(), '');
api.setController(controllerFor({ ativo: true, ordem: [] }));
eq('sem pontos marcados: nada (a tabela não ocupa espaço)', api.renderPointsTable(), '');

// ---------------------------------------------------------------- tabela simples
api.setController(controllerFor({ ativo: true, sistema: 'utm', ordem: ['v:0', 'v:2'], titulos: { 'v:0': 'Marco <M-01>' } }));
let out = api.renderPointsTable();
ok('devolve bloco divisível entre folhas', !!out && !!out.split && Array.isArray(out.split.rowsHtml) && typeof out.split.chunkHtml === 'function');
eq('uma linha por ponto, cada uma marcada para a paginação', out.split.rowsHtml.length, 2);
ok('cada linha é medível (data-split-row)', out.split.rowsHtml.every(r => r.includes('data-split-row')));
const chunk = out.split.chunkHtml(out.split.rowsHtml, true);
ok('título e sistema de coordenadas', /Tabela de Pontos/.test(chunk) && /SIRGAS 2000 \/ UTM zona 25S \(EPSG:31985\)/.test(chunk) && /2 ponto\(s\)/.test(chunk));
ok('cabeçalho UTM: Ponto, E (m), N (m)', /Ponto/.test(chunk) && /E \(m\)/.test(chunk) && /N \(m\)/.test(chunk));
ok('sem memorial: sem colunas de azimute e distância', !/Azimute/.test(chunk) && !/Distância/.test(chunk));
ok('coordenadas do vértice na tabela', chunk.includes(MT.coordCells(-7.02, -34.84, 'utm')[0]) && chunk.includes(MT.coordCells(-7.019, -34.839, 'utm')[1]));
ok('nome do ponto é escapado', chunk.includes('Marco &lt;M-01&gt;') && !chunk.includes('<M-01>'));
ok('segundo ponto com nome padrão P2', chunk.includes('>P2<'));
ok('primeira parte não diz "continuação"; as seguintes dizem', !/continuação/.test(chunk) && /continuação/.test(out.split.chunkHtml(out.split.rowsHtml, false)));
ok('a tabela repete o cabeçalho a cada parte', /<thead>/.test(out.split.chunkHtml([out.split.rowsHtml[1]], false)));

// ---------------------------------------------------------------- memorial descritivo
api.setController(controllerFor({ ativo: true, sistema: 'geo_gms', memorial: true, ordem: ['v:0', 'v:1', 'v:2', 'v:3'] }));
out = api.renderPointsTable();
const memo = out.split.chunkHtml(out.split.rowsHtml, true);
ok('memorial: título próprio', /Memorial Descritivo — Tabela de Pontos/.test(memo));
ok('memorial: colunas Latitude, Longitude, Azimute e Distância', /Latitude/.test(memo) && /Longitude/.test(memo) && /Azimute até o ponto seguinte/.test(memo) && /Distância \(m\)/.test(memo));
const texto = (s) => s.replace(/<[^>]+>/g, '|').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
ok('memorial: coordenadas em graus, minutos e segundos (exatas)', texto(out.split.rowsHtml[0]).includes(MT.fmtGms(-7.02, 'N', 'S')) && texto(out.split.rowsHtml[0]).includes(MT.fmtGms(-34.84, 'L', 'O')));
ok('memorial: polígono fecha no primeiro ponto (nota e último azimute ao Sul)', /fechando no primeiro ponto/.test(memo) && /180° 00' 00/.test(out.split.rowsHtml[3]));
ok('memorial: azimute do primeiro lado é para Leste (~90°) e a distância é a do lado', /\|(89|90)° \d\d' \d\d"?\|/.test(texto(out.split.rowsHtml[0])) && texto(out.split.rowsHtml[0]).includes(MT.fmtNumber(MT.distanceM([-34.84, -7.02], [-34.839, -7.02]), 2)));

// ---------------------------------------------------------------- linha: sem fechamento
const linha = { type: 'LineString', coordinates: [[-34.84, -7.02], [-34.84, -7.019], [-34.839, -7.019]] };
api.setController(controllerFor({ ativo: true, memorial: true, ordem: ['v:0', 'v:1', 'v:2'] }, linha));
out = api.renderPointsTable();
ok('linha: último ponto sem azimute nem distância e sem "fechando"', /—/.test(out.split.rowsHtml[2]) && !/fechando/.test(out.split.chunkHtml(out.split.rowsHtml, true)));

console.log(`viewerPoints: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
