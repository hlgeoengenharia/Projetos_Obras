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

// tabela centralizada e editável por duplo clique
{
    api.setController(controllerFor({ ativo: true, sistema: 'utm', memorial: true, ordem: ['v:0', 'v:1', 'v:2'], titulos: { 'v:0': 'M-01' }, textos: { titulo: 'Descrição <dos> limites', 'v:1:az': '10° 00\' 00"', 'v:0:c1': '7.999.999,00' } }));
    const o2 = api.renderPointsTable();
    const c2 = o2.split.chunkHtml(o2.split.rowsHtml, true);
    const celulas = o2.split.rowsHtml.join('');
    ok('todas as células e cabeçalhos centralizados (nenhum alinhado à direita ou à esquerda)', !/text-right|text-left/.test(celulas + (c2.match(/<thead>[\s\S]*<\/thead>/) || [''])[0]) && (c2.match(/<th [^>]*text-center/g) || []).length === 6 && (celulas.match(/<td [^>]*text-center/g) || []).length === 18);
    ok('cada texto da tabela é editável por duplo clique (nome, coordenadas, azimute, distância)', ['v:0:t', 'v:0:c0', 'v:0:c1', 'v:0:az', 'v:0:dist', 'v:2:dist'].every(k => celulas.includes('data-pt-edit="' + k + '"')));
    ok('título editável e texto do usuário escapado', c2.includes('data-pt-edit="titulo"') && c2.includes('Descrição &lt;dos&gt; limites') && !/Memorial Descritivo/.test(c2));
    ok('textos editados aparecem na tabela', celulas.includes('7.999.999,00') && celulas.includes('10° 00\' 00&quot;'));
    ok('a parte seguinte (continuação) mantém o título editado', /Descrição &lt;dos&gt; limites<\/span><span> \(continuação\)/.test(o2.split.chunkHtml(o2.split.rowsHtml, false)));
}

// ---------------------------------------------------------------- memorial descritivo
api.setController(controllerFor({ ativo: true, sistema: 'geo_gms', memorial: true, ordem: ['v:0', 'v:1', 'v:2', 'v:3'] }));
out = api.renderPointsTable();
const memo = out.split.chunkHtml(out.split.rowsHtml, true);
ok('memorial: título próprio', /Memorial Descritivo — Tabela de Pontos/.test(memo));
ok('memorial: colunas Latitude, Longitude, Azimute e Distância', /Latitude/.test(memo) && /Longitude/.test(memo) && /Azimute até o<br>ponto seguinte/.test(memo) && /Distância \(m\)/.test(memo));
const texto = (s) => s.replace(/<[^>]+>/g, '|').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
ok('memorial: coordenadas em graus, minutos e segundos (exatas)', texto(out.split.rowsHtml[0]).includes(MT.fmtGms(-7.02, 'N', 'S')) && texto(out.split.rowsHtml[0]).includes(MT.fmtGms(-34.84, 'L', 'O')));
ok('memorial: polígono fecha no primeiro ponto (nota e último azimute ao Sul)', /fecha no primeiro ponto/.test(memo) && /180° 00' 00/.test(out.split.rowsHtml[3]));
ok('memorial: azimute do primeiro lado é para Leste (~90°) e a distância é a do lado', /\|(89|90)° \d\d' \d\d"?\|/.test(texto(out.split.rowsHtml[0])) && texto(out.split.rowsHtml[0]).includes(MT.fmtNumber(MT.distanceM([-34.84, -7.02], [-34.839, -7.02]), 2)));

// ---------------------------------------------------------------- colunas Orientação e Confrontantes, distância somada
{
    const anel = { type: 'Polygon', coordinates: [[[-34.84, -7.02], [-34.8395, -7.02], [-34.839, -7.02], [-34.839, -7.019], [-34.84, -7.019], [-34.84, -7.02]]] };
    api.setController(controllerFor({ ativo: true, sistema: 'utm', memorial: true, ordem: ['v:0', 'v:2', 'v:3', 'v:4'], titulos: { 'v:3': 'Marco 3' }, textos: { 'v:3:cf': 'Rua <X>' }, colConf: { ativo: true } }, anel));
    const o3 = api.renderPointsTable();
    const c3 = o3.split.chunkHtml(o3.split.rowsHtml, true);
    ok('cabeçalho: Ponto, Orientação (logo depois), coordenadas, Azimute em duas linhas, Distância e Confrontantes', /Ponto[\s\S]*Orientação[\s\S]*E \(m\)[\s\S]*N \(m\)[\s\S]*Azimute até o<br>ponto seguinte[\s\S]*Distância \(m\)[\s\S]*Confrontantes/.test(c3) && (c3.match(/<th /g) || []).length === 7);
    const linhas = o3.split.rowsHtml.join('');
    ok('orientação: "P1 até P2" com os nomes da coluna Ponto (nome renomeado vale; volta ao primeiro no fim)', /data-pt-edit="v:0:or"[^>]*>P1 até P2</.test(linhas) && /data-pt-edit="v:2:or"[^>]*>P2 até Marco 3</.test(linhas) && /data-pt-edit="v:3:or"[^>]*>Marco 3 até P4</.test(linhas) && /data-pt-edit="v:4:or"[^>]*>P4 até P1</.test(linhas));
    ok('distância com vértice não escolhido no meio: lados somados e total', /data-pt-edit="v:0:dist"[^>]*>[\d.,]+ m \+ [\d.,]+ m, totalizando [\d.,]+ m</.test(linhas) && /data-pt-edit="v:2:dist"[^>]*>[\d.,]+</.test(linhas) && !/data-pt-edit="v:2:dist"[^>]*>[^<]*totalizando/.test(linhas));
    ok('confrontantes: célula editável, texto do usuário escapado; sem camadas fica em branco', /data-pt-edit="v:3:cf"[^>]*>Rua &lt;X&gt;</.test(linhas) && /data-pt-edit="v:0:cf"[^>]*><\/td>/.test(linhas));
    api.setController(controllerFor({ ativo: true, sistema: 'utm', memorial: true, ordem: ['v:0', 'v:2', 'v:3', 'v:4'] }, anel));
    const o4 = api.renderPointsTable();
    ok('coluna Confrontantes só aparece quando ligada', !/Confrontantes/.test(o4.split.chunkHtml(o4.split.rowsHtml, true)) && !/data-pt-edit="v:0:cf"/.test(o4.split.rowsHtml.join('')));
    api.setController(controllerFor({ ativo: true, sistema: 'utm', memorial: false, ordem: ['v:0', 'v:2'], colConf: { ativo: true } }, anel));
    const o5 = api.renderPointsTable();
    ok('sem memorial: sem Orientação nem Confrontantes', !/Orientação|Confrontantes|Azimute/.test(o5.split.chunkHtml(o5.split.rowsHtml, true)));
}

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
