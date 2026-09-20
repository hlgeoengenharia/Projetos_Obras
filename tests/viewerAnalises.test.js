// tests/viewerAnalises.test.js
// Executa as análises REAIS do visualizador (extraídas de relatorio_view.html): tabela de confrontantes e
// "Análises da Feição" (área cadastral x calculada, distância/sobreposição com camada de referência).
// Rodar com: node tests/viewerAnalises.test.js

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
const load = new Function('S', 'MapTools', 'window', `
    const reportPayload = S.payload;
    const renderArgs = S.args;
    const mapController = S.controller;
    ${extractFunction('escapeHtml')}
    ${extractFunction('readFieldRaw')}
    ${extractFunction('camadasDoPayload')}
    ${extractFunction('areaEmLinha')}
    ${extractFunction('renderConfrontantesTable')}
    ${extractFunction('renderAnaliseMapa')}
    return { renderConfrontantesTable, renderAnaliseMapa };
`);

const dLat = 20 / 111195, dLng = 30 / (111195 * Math.cos(7.02 * Math.PI / 180));
const lote = { type: 'Polygon', coordinates: [[[-34.84, -7.02], [-34.84 + dLng, -7.02], [-34.84 + dLng, -7.02 + dLat], [-34.84, -7.02 + dLat], [-34.84, -7.02]]] };
const retan = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const kx = 111195 * Math.cos(7.02 * Math.PI / 180);
const camadas = [
    { id: 'L1', name: 'Lotes', color: '#f00', kind: 'polygon', truncated: false, features: [
        { type: 'Feature', properties: { r: 'Quadra E • Lote 02', t: 'Beltrano <b>' }, geometry: retan(-34.84 + dLng + 1e-7, -7.02, -34.84 + 2 * dLng, -7.02 + dLat) },
        { type: 'Feature', properties: { r: 'Quadra D • Lote 09', t: 'Ciclano' }, geometry: retan(-34.84, -7.02 + dLat + 1e-7, -34.84 + dLng, -7.02 + 2 * dLat) }
    ] },
    { id: 'LPM', name: 'LPM', color: '#00f', kind: 'line', truncated: true, features: [{ type: 'Feature', properties: { r: 'Linha de Preamar' }, geometry: { type: 'LineString', coordinates: [[-34.84 + dLng + 50 / kx, -7.03], [-34.84 + dLng + 50 / kx, -7.01]] } }] },
    { id: 'FX', name: 'Faixa', color: '#0f0', kind: 'polygon', truncated: false, features: [{ type: 'Feature', properties: {}, geometry: retan(-34.8402, -7.0201, -34.8399, -7.0199) }] }
];
const campoArea = { id: 'f_area', label: 'Área do terreno (m²)', type: 'area_m2' };

function state(cfg, opts) {
    opts = opts || {};
    const config = MT.normalizeMapConfig({ mapa: cfg });
    return {
        payload: { camadasMapa: opts.camadas || camadas, formFields: [campoArea] },
        args: { featureGeometry: opts.geometry || lote, featureData: opts.dados || { f_area: '560,00' } },
        controller: { getConfig: () => config }
    };
}
const run = (cfg, opts, turf) => load(state(cfg, opts), MT, { turf: turf });

let total = 0;
let failed = 0;
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }
const texto = (s) => s.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/&quot;/g, '"');

// ---------------------------------------------------------------- confrontantes
eq('desligado ou sem camada escolhida: nada', [run({}).renderConfrontantesTable(), run({ confrontantes: { ativo: true } }).renderConfrontantesTable(), run({ confrontantes: { ativo: true, camada: 'inexistente' } }).renderConfrontantesTable()], ['', '', '']);
let out = run({ confrontantes: { ativo: true, camada: 'L1' } }).renderConfrontantesTable();
ok('bloco divisível entre folhas, uma linha por lado', !!out.split && out.split.rowsHtml.length === 4 && out.split.rowsHtml.every(r => r.includes('data-split-row')));
let chunk = out.split.chunkHtml(out.split.rowsHtml, true);
ok('título, camada e critério de divisa', /Confrontantes/.test(chunk) && /camada: Lotes/.test(chunk) && /3,0 m/.test(chunk) && /20% do lado/.test(chunk));
ok('colunas: Lado, Comprimento, Azimute, Confrontante(s)', ['Lado', 'Comprimento (m)', 'Azimute', 'Confrontante(s)'].every(h => chunk.includes(h)));
const t0 = texto(out.split.rowsHtml[0]), t1 = texto(out.split.rowsHtml[1]), t2 = texto(out.split.rowsHtml[2]);
ok('lado sul: sem confrontante identificado', /Sem confrontante identificado/.test(t0) && /L1/.test(t0) && /30,0\d|29,9\d/.test(t0));
ok('lado leste: Quadra E • Lote 02, sem o nome (padrão)', /Quadra E • Lote 02/.test(t1) && !/Beltrano/.test(t1));
ok('lado norte: Quadra D • Lote 09', /Quadra D • Lote 09/.test(t2));
ok('azimute do primeiro lado ≈ 90° (Leste)', /\|(89|90)° \d\d' \d\d"\|/.test(t0));
out = run({ confrontantes: { ativo: true, camada: 'L1', nomes: true } }).renderConfrontantesTable();
ok('com nomes: rótulo — nome, e o nome é escapado', /Quadra E • Lote 02 — Beltrano &lt;b&gt;/.test(out.split.rowsHtml[1]) && !/<b>/.test(out.split.rowsHtml[1]));
ok('camada recortada avisa no cabeçalho', /recortada/.test(run({ confrontantes: { ativo: true, camada: 'LPM' } }).renderConfrontantesTable().split.chunkHtml([], true)));
eq('feição que não é polígono: sem tabela', run({ confrontantes: { ativo: true, camada: 'L1' } }, { geometry: { type: 'Point', coordinates: [-34.84, -7.02] } }).renderConfrontantesTable(), '');
eq('continuação e cabeçalho repetido', [/continuação/.test(out.split.chunkHtml(out.split.rowsHtml, true)), /continuação/.test(out.split.chunkHtml([out.split.rowsHtml[0]], false)), /<thead>/.test(out.split.chunkHtml([out.split.rowsHtml[0]], false))], [false, true, true]);
const semRot = { id: 'S', name: 'Sem rótulo', kind: 'polygon', features: [{ type: 'Feature', properties: {}, geometry: retan(-34.84 + dLng + 1e-7, -7.02, -34.84 + 2 * dLng, -7.02 + dLat) }] };
ok('vizinho sem rótulo: "sem identificação" (não some nem quebra)', /sem identificação/.test(run({ confrontantes: { ativo: true, camada: 'S' } }, { camadas: [semRot] }).renderConfrontantesTable().split.rowsHtml[1]));

// ---------------------------------------------------------------- análises: área
eq('sem nada ligado: nada', run({}).renderAnaliseMapa(), '');
eq('área ligada sem escolher o campo: nada', run({ comparacaoArea: { ativo: true } }).renderAnaliseMapa(), '');
let a = run({ comparacaoArea: { ativo: true, campo: 'f_area' } }).renderAnaliseMapa();
const calc = MT.computeMeasures(lote).itens.find(i => i.id === 'area').valor;
ok('área: cadastral, calculada e diferença no padrão brasileiro', /Análises da Feição/.test(a) && /cadastral \(Área do terreno \(m²\)\) 560,00 m²/.test(a) && a.includes(MT.fmtNumber(calc, 2) + ' m²') && /diferença [+−]/.test(a));
ok('diferença grande: caixa de aviso e texto de divergência', /bg-amber-50/.test(a) && /divergência acima de 1%/.test(a));
a = run({ comparacaoArea: { ativo: true, campo: 'f_area' } }, { dados: { f_area: MT.fmtNumber(calc, 2) } }).renderAnaliseMapa();
ok('área igual: sem aviso', !/divergência/.test(a) && !/bg-amber-50/.test(a) && /bg-white/.test(a));
eq('campo sem valor: sem linha', run({ comparacaoArea: { ativo: true, campo: 'f_area' } }, { dados: {} }).renderAnaliseMapa(), '');

// ---------------------------------------------------------------- análises: camada de referência
a = run({ referencia: { ativo: true, camada: 'LPM' } }).renderAnaliseMapa();
ok('distância até a LPM (~50 m), com o rótulo dela e o aviso de recorte', /Distância até a camada <b>LPM<\/b> \(Linha de Preamar\): <b>(49|50),\d\d m<\/b>/.test(a) && /recortada/.test(a));
const turfFalso = { intersect: () => ({ type: 'Feature' }), area: () => 60 };
a = run({ referencia: { ativo: true, camada: 'FX' } }, {}, turfFalso).renderAnaliseMapa();
ok('camada que intersecta: área sobreposta e percentual, em aviso', /intersecta/.test(a) && /área sobreposta 60,00 m²/.test(a) && /% da feição/.test(a) && /bg-amber-50/.test(a));
a = run({ referencia: { ativo: true, camada: 'FX' } }, {}, undefined).renderAnaliseMapa();
ok('sem o Turf: informa que intersecta, sem inventar a área', /intersecta/.test(a) && !/área sobreposta/.test(a));
ok('camada vazia: nenhuma feição num raio de 400 m', /nenhuma feição num raio de 400 m/.test(run({ referencia: { ativo: true, camada: 'V' } }, { camadas: [{ id: 'V', name: 'Vazia', features: [] }] }).renderAnaliseMapa()));
eq('camada de referência que não está entre as ativas: nada', run({ referencia: { ativo: true, camada: 'X' } }).renderAnaliseMapa(), '');
a = run({ comparacaoArea: { ativo: true, campo: 'f_area' }, referencia: { ativo: true, camada: 'LPM' } }).renderAnaliseMapa();
ok('as duas análises juntas, uma caixa cada', (a.match(/rounded-lg border/g) || []).length === 2);

console.log(`viewerAnalises: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
