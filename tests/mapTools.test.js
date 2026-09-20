// tests/mapTools.test.js
// Rodar com: node tests/mapTools.test.js

const MT = require('../src/mapTools.js');

let total = 0;
let failed = 0;
function eq(name, a, e) {
    total++;
    if (JSON.stringify(a) === JSON.stringify(e)) return;
    failed++;
    console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`);
}
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function near(name, a, e, tol) { total++; if (Math.abs(a - e) <= tol) return; failed++; console.error(`  FALHOU: ${name}\n     esperado ≈ ${e} (±${tol})\n     obtido:   ${a}`); }

// ---------------------------------------------------------------- configuração
const c0 = MT.normalizeMapConfig({});
eq('padrão: destaque, norte, escala e projeção ligados', [c0.destaque.ativo, c0.norte, c0.escala, c0.projecao], [true, true, true, true]);
eq('padrão: base OSM e 90 mm', [c0.baseMap, c0.alturaMm], ['osm', 90]);
eq('modelo legado (exibirNorte/exibirEscala) é respeitado', (() => { const c = MT.normalizeMapConfig({ exibirNorte: false, exibirEscala: false }); return [c.norte, c.escala]; })(), [false, false]);
eq('bloco.mapa vence o legado', MT.normalizeMapConfig({ exibirNorte: false, mapa: { norte: true } }).norte, true);
const sujo = MT.normalizeMapConfig({ mapa: { baseMap: 'xyz', alturaMm: 9999, destaque: { cor: 'vermelho', espessura: -3, preenchimento: 5 } } });
eq('valores inválidos voltam ao padrão / limites', [sujo.baseMap, sujo.alturaMm, sujo.destaque.cor, sujo.destaque.espessura, sujo.destaque.preenchimento], ['osm', 220, '#10b981', 1, 0.9]);
eq('base satélite e nenhum são aceitas', [MT.normalizeMapConfig({ mapa: { baseMap: 'satelite' } }).baseMap, MT.normalizeMapConfig({ mapa: { baseMap: 'nenhum' } }).baseMap], ['satelite', 'nenhum']);

const aj = MT.mergeAjustes(c0, { norte: false, baseMap: 'satelite', camadasLigadas: [7, 'b'], destaque: { esmaecerEntorno: true }, lixo: 1 });
eq('ajustes do usuário sobrepõem o modelo', [aj.norte, aj.baseMap, aj.camadasLigadas, aj.destaque.esmaecerEntorno], [false, 'satelite', ['7', 'b'], true]);
eq('ajustes não apagam o resto do destaque', [aj.destaque.cor, aj.destaque.ativo], ['#10b981', true]);
ok('chave desconhecida é descartada', !('lixo' in aj));
eq('sem ajustes devolve o modelo', MT.mergeAjustes(c0, null), c0);

// ---------------------------------------------------------------- geometria
const poly = { type: 'Polygon', coordinates: [[[-34.84, -7.02], [-34.83, -7.02], [-34.83, -7.01], [-34.84, -7.01], [-34.84, -7.02]]] };
eq('bbox do polígono', MT.geometryBBox(poly), [-34.84, -7.02, -34.83, -7.01]);
eq('bbox de Feature', MT.geometryBBox({ type: 'Feature', geometry: poly }), [-34.84, -7.02, -34.83, -7.01]);
eq('bbox de ponto', MT.geometryBBox({ type: 'Point', coordinates: [-34.8, -7] }), [-34.8, -7, -34.8, -7]);
eq('bbox de multi-geometria', MT.geometryBBox({ type: 'MultiLineString', coordinates: [[[0, 0], [1, 2]], [[-1, 5], [3, 1]]] }), [-1, 0, 3, 5]);
eq('bbox de geometria vazia', MT.geometryBBox(null), null);
eq('centro do bbox', MT.bboxCenter([0, 0, 2, 4]), [1, 2]);
eq('tipos de geometria', [MT.geomKind(poly), MT.geomKind({ type: 'MultiLineString', coordinates: [] }), MT.geomKind({ type: 'Point', coordinates: [0, 0] })], ['polygon', 'line', 'point']);

const big = MT.expandBBoxMeters([-34.84, -7.02, -34.83, -7.01], 400);
near('buffer em latitude ≈ 400 m (0,003593°)', (-7.02 - big[1]), 400 / 111320, 1e-9);
ok('buffer em longitude é maior que em latitude (cos φ<1)', (-34.84 - big[0]) > (-7.02 - big[1]));
ok('bbox intersecta', MT.bboxIntersects([0, 0, 2, 2], [1, 1, 3, 3]) && !MT.bboxIntersects([0, 0, 1, 1], [2, 2, 3, 3]));
eq('arredonda coordenadas', MT.roundCoords([[-34.83914159265, -7.018949999]], 6), [[-34.839142, -7.01895]]);

// ---------------------------------------------------------------- projeção e escala
const pj = MT.projectionInfo(-7.019, -34.833);
eq('Cabedelo-PB: zona 25S, SIRGAS 2000 (EPSG:31985)', [pj.zone, pj.hemisphere, pj.epsg, pj.datum], [25, 'S', 31985, 'SIRGAS 2000']);
eq('rótulo da projeção', pj.label, 'SIRGAS 2000 / UTM zona 25S');
eq('Manaus: zona 21S (EPSG:31981)', (() => { const p = MT.projectionInfo(-3.1, -60.0); return [p.zone, p.epsg]; })(), [21, 31981]);
eq('Boa Vista (hemisfério norte): zona 20N (EPSG:31974)', (() => { const p = MT.projectionInfo(2.8, -60.67); return [p.zone, p.hemisphere, p.epsg]; })(), [20, 'N', 31974]);
eq('fora do Brasil cai em WGS 84', (() => { const p = MT.projectionInfo(48.8, 2.3); return [p.datum, p.epsg]; })(), ['WGS 84', null]);

near('escala no zoom 19 em Cabedelo (~1:1.117)', MT.scaleDenominator(19, -7.02), 1117, 30);
eq('escala redonda', [MT.niceScale(1690), MT.niceScale(2400), MT.niceScale(4300), MT.niceScale(8000)], [2000, 2500, 5000, 10000]);
eq('formata escala com ponto de milhar', [MT.formatScale(2500), MT.formatScale(100), MT.formatScale(1250000)], ['1:2.500', '1:100', '1:1.250.000']);

// ---------------------------------------------------------------- camadas ativas → relatório
const sq = (x, y, s) => ({ type: 'Polygon', coordinates: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]] });
const themes = [
    { id: 1, name: 'Lotes', color: '#ff0000', visible: true, features: [
        { properties: { id_banco: 10, nome: 'a' }, geometry: sq(-34.8399, -7.0199, 0.0008) },     // a própria feição
        { properties: { id_banco: 11 }, geometry: sq(-34.8390, -7.0199, 0.0008) },               // vizinha
        { properties: { id_banco: 12 }, geometry: sq(-33.0, -5.0, 0.001) },                      // longe
        { properties: { id_banco: 13 } }                                                         // sem geometria
    ] },
    { id: 2, name: 'LPM', color: 'azul', visible: false, features: [{ properties: {}, geometry: sq(-34.84, -7.02, 0.001) }] },
    { id: 3, name: 'Sigilosa', visible: true, features: [{ properties: {}, geometry: sq(-34.84, -7.02, 0.001) }] },
    { id: 4, name: 'Linhas', color: '#00ff00', features: [{ properties: {}, geometry: { type: 'LineString', coordinates: [[-34.8405, -7.0205], [-34.838, -7.0195]] } }] }
];
const cam = MT.collectNearbyLayers(themes, poly, { excludeKey: '10', canSee: (id) => id !== 3 });
eq('só camadas ativas e permitidas (2 fica de fora: desligada; 3: sem permissão)', cam.map(c => c.id), ['1', '4']);
eq('recorta a vizinhança e exclui a própria feição e as sem geometria', cam[0].features.length, 1);
eq('cor inválida vira padrão; cor válida é mantida', [cam[0].color, cam[1].color], ['#ff0000', '#00ff00']);
eq('tipo de geometria da camada', [cam[0].kind, cam[1].kind], ['polygon', 'line']);
ok('só geometria vai para o relatório (sem atributos)', Object.keys(cam[0].features[0].properties).length === 0);
eq('theme.visible ausente conta como ativa', cam[1].id, '4');
eq('limite por camada marca truncado', (() => {
    const many = { id: 9, name: 'M', visible: true, features: Array.from({ length: 5 }, (_, i) => ({ properties: {}, geometry: sq(-34.8399 + i * 0.00001, -7.0199, 0.0001) })) };
    const r = MT.collectNearbyLayers([many], poly, { maxPerLayer: 3 });
    return [r[0].features.length, r[0].truncated];
})(), [3, true]);
eq('sem geometria da feição não coleta nada', MT.collectNearbyLayers(themes, null, {}), []);
eq('chave da feição', [MT.featureKey({ id_banco: 5, _tempId: 'x' }), MT.featureKey({ _tempId: 'x' }), MT.featureKey({})], ['5', 'x', '']);

// vista salva, escala aproximada e anéis para o esmaecimento
eq('vista válida é mantida', MT.normalizeMapConfig({ mapa: { vista: { lat: '-7.02', lng: -34.83, zoom: 18 } } }).vista, { lat: -7.02, lng: -34.83, zoom: 18 });
eq('vista inválida vira nula', [MT.normalizeMapConfig({ mapa: { vista: { lat: 200, lng: 0, zoom: 5 } } }).vista, MT.normalizeMapConfig({ mapa: { vista: 'x' } }).vista, MT.normalizeMapConfig({}).vista], [null, null, null]);
eq('ajustes carregam a vista', MT.mergeAjustes(c0, { vista: { lat: -7, lng: -34, zoom: 17 } }).vista, { lat: -7, lng: -34, zoom: 17 });
eq('escala aproximada (2 algarismos)', [MT.approxScale(1117), MT.approxScale(2647), MT.approxScale(87), MT.approxScale(123456)], [1100, 2600, 87, 120000]);
eq('anel externo do polígono', MT.polygonOuterRings(poly).length, 1);
eq('anéis de multipolígono', MT.polygonOuterRings({ type: 'MultiPolygon', coordinates: [poly.coordinates, poly.coordinates] }).length, 2);
eq('ponto e linha não têm anel', [MT.polygonOuterRings({ type: 'Point', coordinates: [0, 0] }).length, MT.polygonOuterRings(null).length], [0, 0]);

// ---------------------------------------------------------------- medidas da feição
near('1° de latitude ≈ 111.195 m', MT.distanceM([0, 0], [0, 1]), 111194.93, 1);
near('1° de longitude no equador ≈ 111.195 m', MT.distanceM([0, 0], [1, 0]), 111194.93, 1);
near('longitude encolhe com a latitude (cos 60° = 0,5)', MT.distanceM([0, 60], [1, 60]), 111194.93 / 2, 30);
eq('distância de ponto a si mesmo', MT.distanceM([-34.8, -7], [-34.8, -7]), 0);
eq('formata no padrão brasileiro', [MT.fmtNumber(1012.4, 2), MT.fmtNumber(0.5, 4), MT.fmtNumber(-7.5, 1), MT.fmtNumber(1234567.891, 2), MT.fmtNumber(25, 0), MT.fmtNumber(-0.001, 2)], ['1.012,40', '0,5000', '-7,5', '1.234.567,89', '25', '0,00']);

const quad = { type: 'Polygon', coordinates: [[[-34.84, -7.02], [-34.839, -7.02], [-34.839, -7.019], [-34.84, -7.019], [-34.84, -7.02]]] };
const mq = MT.computeMeasures(quad);
const byId = (m, id) => m.itens.find(i => i.id === id);
eq('quadrilátero: 4 lados + área + perímetro', mq.itens.map(i => i.id), ['lado:0', 'lado:1', 'lado:2', 'lado:3', 'area', 'perimetro']);
near('lado N-S ≈ 111,19 m', byId(mq, 'lado:1').valor, 111.195, 0.05);
near('lado L-O ≈ 110,36 m (cos φ)', byId(mq, 'lado:0').valor, 111.195 * Math.cos(7.0195 * Math.PI / 180), 0.1);
near('área ≈ produto dos lados', byId(mq, 'area').valor, 111.195 * 110.36, 15);
near('perímetro = soma dos lados', byId(mq, 'perimetro').valor, mq.itens.slice(0, 4).reduce((s, i) => s + i.valor, 0), 1e-9);
ok('textos no padrão brasileiro', /^\d+,\d{2} m$/.test(byId(mq, 'lado:0').texto) && /^Área [\d.]+,\d{2} m²$/.test(byId(mq, 'area').texto) && /^Perím\. /.test(byId(mq, 'perimetro').texto));
ok('resumo da área traz hectares', /Área: .* m² \(.* ha\)/.test(byId(mq, 'area').resumo));
eq('resumo dos lados numerados', byId(mq, 'lado:2').resumo.slice(0, 3), 'L3:');
eq('lados por grupo', [byId(mq, 'lado:0').grupo, byId(mq, 'area').grupo, byId(mq, 'perimetro').grupo], ['lados', 'total', 'perimetro']);
ok('lado é rotulado no meio do segmento', Math.abs(byId(mq, 'lado:0').pos[0] - -7.02) < 1e-9 && Math.abs(byId(mq, 'lado:0').pos[1] - -34.8395) < 1e-9);
ok('área no centro do polígono; perímetro logo abaixo', Math.abs(byId(mq, 'area').pos[0] - -7.0195) < 1e-6 && byId(mq, 'perimetro').dy > 0);
eq('sem omissão de lados', mq.ladosOmitidos, false);

const comFuro = { type: 'Polygon', coordinates: [quad.coordinates[0], [[-34.8398, -7.0198], [-34.8398, -7.0192], [-34.8392, -7.0192], [-34.8392, -7.0198], [-34.8398, -7.0198]]] };
ok('furo é descontado da área e não entra no perímetro', byId(MT.computeMeasures(comFuro), 'area').valor < byId(mq, 'area').valor * 0.75 && Math.abs(byId(MT.computeMeasures(comFuro), 'perimetro').valor - byId(mq, 'perimetro').valor) < 1e-9);

const multi = { type: 'MultiPolygon', coordinates: [quad.coordinates, [[[-34.83, -7.02], [-34.829, -7.02], [-34.829, -7.019], [-34.83, -7.019], [-34.83, -7.02]]]] };
const mm = MT.computeMeasures(multi);
eq('multipolígono: lados numerados em sequência', mm.itens.filter(i => i.tipo === 'lado').map(i => i.id).slice(3, 6), ['lado:3', 'lado:4', 'lado:5']);
near('multipolígono: área é a soma', byId(mm, 'area').valor, 2 * byId(mq, 'area').valor, 30);

const muitos = { type: 'Polygon', coordinates: [Array.from({ length: 101 }, (_, i) => { const a = i / 100 * 2 * Math.PI; return i === 100 ? [-34.84 + 0.001, -7.02] : [-34.84 + 0.001 * Math.cos(a), -7.02 + 0.001 * Math.sin(a)]; })] };
const mmany = MT.computeMeasures(muitos);
ok('mais de 80 lados: rótulos dos lados omitidos, área e perímetro mantidos', mmany.ladosOmitidos === true && !mmany.itens.some(i => i.tipo === 'lado') && !!byId(mmany, 'area') && !!byId(mmany, 'perimetro'));

const linha3 = { type: 'LineString', coordinates: [[-34.84, -7.02], [-34.84, -7.019], [-34.839, -7.019]] };
const ml = MT.computeMeasures(linha3);
eq('linha: trechos + comprimento (sem área nem perímetro)', ml.itens.map(i => i.id), ['trecho:0', 'trecho:1', 'comprimento']);
near('comprimento = soma dos trechos', byId(ml, 'comprimento').valor, ml.itens[0].valor + ml.itens[1].valor, 1e-9);
ok('comprimento é rotulado no meio do percurso', (() => { const p = byId(ml, 'comprimento').pos; return p[0] > -7.0195 && p[0] < -7.0185 && Math.abs(p[1] - -34.84) < 0.0006; })());
eq('trecho tem resumo T1', ml.itens[0].resumo.slice(0, 3), 'T1:');

eq('ponto: coordenada em graus decimais', MT.computeMeasures({ type: 'Point', coordinates: [-34.835, -7.015] }).itens.map(i => [i.id, i.texto]), [['coordenada', '-7.015000, -34.835000']]);
eq('multiponto: uma coordenada por ponto', MT.computeMeasures({ type: 'MultiPoint', coordinates: [[-34.8, -7], [-34.7, -7.1]] }).itens.map(i => i.id), ['coordenada:0', 'coordenada:1']);
eq('sem geometria: nada', MT.computeMeasures(null), { itens: [], ladosOmitidos: false });
eq('aceita Feature', MT.computeMeasures({ type: 'Feature', geometry: quad }).itens.length, 6);

const ed = MT.applyEdits(mq.itens, { 'lado:0': '110,00 m (medido em campo)' });
eq('edição substitui texto e resumo e guarda o valor calculado', [ed[0].texto, ed[0].resumo, ed[0].editado, ed[0].padrao], ['110,00 m (medido em campo)', '110,00 m (medido em campo)', true, mq.itens[0].texto]);
eq('medida sem edição não muda', [ed[1].texto === mq.itens[1].texto, ed[1].editado], [true, false]);

// configuração das medidas, edições e posições dos rótulos
eq('medidas ligadas por padrão, perímetro desligado', MT.normalizeMapConfig({}).medidas, { ativo: true, lados: true, total: true, perimetro: false });
eq('medidas: o usuário pode desligar tudo ou só parte', [MT.mergeAjustes(c0, { medidas: { ativo: false } }).medidas.ativo, MT.mergeAjustes(c0, { medidas: { perimetro: true } }).medidas.perimetro, MT.mergeAjustes(c0, { medidas: { perimetro: true } }).medidas.lados], [false, true, true]);
const e2 = MT.normalizeMapConfig({ mapa: { edicoes: { 'lado:1': '  20 m  ', area: 'x'.repeat(200), 'nao valido!': 'a', perimetro: '   ', trecho: 5, 'lado:2': 'a\nb' } } }).edicoes;
eq('edições: limpa espaços, limita o tamanho, tira quebras e descarta o inválido/vazio', [e2['lado:1'], e2.area.length, e2['nao valido!'], e2.perimetro, e2.trecho, e2['lado:2']], ['20 m', 60, undefined, undefined, undefined, 'a b']);
eq('posições: só coordenadas válidas', MT.normalizeMapConfig({ mapa: { posicoes: { 'lado:0': { lat: '-7.02', lng: -34.8 }, area: { lat: 999, lng: 0 }, perimetro: 'x' } } }).posicoes, { 'lado:0': { lat: -7.02, lng: -34.8 } });
eq('ajustes trazem edições e posições', (() => { const a = MT.mergeAjustes(c0, { edicoes: { area: '1.000 m²' }, posicoes: { area: { lat: -7, lng: -34 } } }); return [a.edicoes, a.posicoes]; })(), [{ area: '1.000 m²' }, { area: { lat: -7, lng: -34 } }]);

// ---------------------------------------------------------------- coordenadas
const u0 = MT.latLngToUtm(-7.018950, -34.833140);
eq('UTM confere com a ferramenta de medição do sistema (zona 25S)', [u0.zone, u0.hemisphere, u0.e.toFixed(2), u0.n.toFixed(2)], [25, 'S', '297502.24', '9223760.33']);
const back = MT.utmToLatLng(u0.e, u0.n, 25, true);
near('UTM → lat/lng volta ao ponto (lat)', back.lat, -7.018950, 1e-8);
near('UTM → lat/lng volta ao ponto (lng)', back.lng, -34.833140, 1e-8);
const uN = MT.latLngToUtm(2.8, -60.67);
eq('hemisfério norte: sem falso norte', [uN.zone, uN.hemisphere, uN.n < 1000000], [20, 'N', true]);
const bN = MT.utmToLatLng(uN.e, uN.n, 20, false);
near('ida e volta no hemisfério norte', bN.lat, 2.8, 1e-8);
near('meridiano central: E = 500000 (zona 25 → -33°)', MT.latLngToUtm(-7, -33, 25).e, 500000, 1e-6);
near('logo ao sul do equador: N ≈ 10.000.000 - 11 m (falso norte do hemisfério sul)', MT.latLngToUtm(-0.0001, -33, 25).n, 10000000 - 11.06, 0.1);
eq('GMS da ferramenta de medição (com segundos decimais)', [MT.fmtGms(-7.01895, 'N', 'S'), MT.fmtGms(-34.83314, 'L', 'O')], ["7° 01' 08,22\" S", "34° 49' 59,30\" O"]);
eq('GMS arredonda 59,999" para o minuto seguinte', MT.fmtGms(10.999999999, 'N', 'S'), "11° 00' 00,00\" N");
eq('células no sistema escolhido', [MT.coordCells(-7.01895, -34.83314, 'utm'), MT.coordCells(-7.01895, -34.83314, 'geo_dec'), MT.coordCells(-7.01895, -34.83314, 'geo_gms')],
    [['297.502,24', '9.223.760,33'], ['-7,018950', '-34,833140'], ["7° 01' 08,22\" S", "34° 49' 59,30\" O"]]);
eq('WGS 84 em graus decimais usa os mesmos números', MT.coordCells(-7.01895, -34.83314, 'wgs84_dec'), ['-7,018950', '-34,833140']);
eq('cabeçalhos', [MT.coordHeaders('utm'), MT.coordHeaders('geo_gms')], [['E (m)', 'N (m)'], ['Latitude', 'Longitude']]);
eq('rótulo do sistema UTM traz zona e EPSG', MT.coordSystemLabel('utm', MT.projectionInfo(-7.019, -34.833)), 'SIRGAS 2000 / UTM zona 25S (EPSG:31985)');
eq('sistemas disponíveis (sem SAD69)', MT.COORD_SYSTEMS.map(s => s.id), ['utm', 'geo_dec', 'geo_gms', 'wgs84_dec']);

// azimute
near('azimute para Norte = 0°', MT.azimuthDeg([-34.8, -7.0], [-34.8, -6.9]), 0, 1e-6);
near('azimute para Leste ≈ 90°', MT.azimuthDeg([-34.8, -7.0], [-34.7, -7.0]), 90, 0.05);
near('azimute para Sul = 180°', MT.azimuthDeg([-34.8, -7.0], [-34.8, -7.1]), 180, 1e-6);
near('azimute para Oeste ≈ 270°', MT.azimuthDeg([-34.8, -7.0], [-34.9, -7.0]), 270, 0.05);
eq('azimute em graus, minutos e segundos', [MT.fmtAzimuth(45.5083333), MT.fmtAzimuth(359.99999), MT.fmtAzimuth(0)], ["45° 30' 30\"", "0° 00' 00\"", "0° 00' 00\""]);

// ---------------------------------------------------------------- vértices
const vq = MT.vertices(quad);
eq('vértices do polígono: sem repetir o ponto de fechamento', vq.itens.map(v => v.id), ['v:0', 'v:1', 'v:2', 'v:3']);
eq('vértice 0 é o primeiro ponto', [vq.itens[0].lat, vq.itens[0].lng], [-7.02, -34.84]);
eq('multipolígono numera em sequência', MT.vertices(multi).itens.length, 8);
eq('linha: todos os vértices', MT.vertices(linha3).itens.length, 3);
eq('ponto: um vértice', MT.vertices({ type: 'Point', coordinates: [-34.8, -7] }).itens.length, 1);
ok('feição sem geometria não tem vértices', MT.vertices(null).itens.length === 0);
ok('mais de 400 vértices: marcadores omitidos', (() => { const g = { type: 'LineString', coordinates: Array.from({ length: 401 }, (_, i) => [-34.8 + i * 1e-5, -7]) }; const v = MT.vertices(g); return v.omitidos === true && v.itens.length === 0 && v.total === 401; })());

// ---------------------------------------------------------------- pontos e memorial
const pn = MT.normalizeMapConfig({}).pontos;
eq('pontos: desligados, UTM, com tabela e sem memorial', [pn.ativo, pn.sistema, pn.tabela, pn.memorial, pn.ordem], [false, 'utm', true, false, []]);
const pn2 = MT.normalizeMapConfig({ mapa: { pontos: { ativo: true, sistema: 'sad69', ordem: ['v:2', 'v:0', 'v:2', 'x', 5, 'v:1'], titulos: { 'v:0': '  Marco M-01 ', 'v:9': 'a'.repeat(99), lixo: 'x', 'v:1': '   ' } } } }).pontos;
eq('pontos: sistema inválido volta ao padrão; ordem sem duplicados nem ids inválidos; títulos limpos e limitados', [pn2.sistema, pn2.ordem, pn2.titulos['v:0'], pn2.titulos['v:9'].length, pn2.titulos.lixo, pn2.titulos['v:1']], ['utm', ['v:2', 'v:0', 'v:1'], 'Marco M-01', 40, undefined, undefined]);
eq('ajustes trazem os pontos do usuário', MT.mergeAjustes(c0, { pontos: { ativo: true, ordem: ['v:1', 'v:3'] } }).pontos.ordem, ['v:1', 'v:3']);
eq('ajustes não apagam o sistema do modelo', MT.mergeAjustes(MT.normalizeMapConfig({ mapa: { pontos: { sistema: 'geo_gms' } } }), { pontos: { ativo: true } }).pontos.sistema, 'geo_gms');

const rows0 = MT.pointRows(quad, { sistema: 'utm', memorial: false, ordem: ['v:2', 'v:0'], titulos: { 'v:0': 'Marco 01' } });
eq('tabela: pontos na ordem escolhida, título padrão pela posição', rows0.rows.map(r => [r.vid, r.titulo]), [['v:2', 'P1'], ['v:0', 'Marco 01']]);
eq('tabela: coordenadas UTM', rows0.rows[1].cells, MT.coordCells(-7.02, -34.84, 'utm'));
eq('tabela: cabeçalhos e rótulo do sistema', [rows0.headers, rows0.sistemaLabel], [['E (m)', 'N (m)'], 'SIRGAS 2000 / UTM zona 25S (EPSG:31985)']);
ok('sem memorial não há azimute nem distância', rows0.rows[0].azimute === undefined && rows0.memorial === false);
const rows1 = MT.pointRows(quad, { sistema: 'geo_dec', memorial: true, ordem: ['v:0', 'v:1', 'v:2', 'v:3'], titulos: {} });
eq('memorial: polígono fecha voltando ao primeiro ponto', [rows1.fecha, rows1.rows.length], [true, 4]);
near('memorial: azimute do lado L→O... v:0→v:1 é para Leste (~90°)', parseInt(rows1.rows[0].azimute, 10), 90, 1);
eq('memorial: v:1→v:2 vai para o Norte (0°)', rows1.rows[1].azimute.split('°')[0], '0');
ok('memorial: último ponto volta ao primeiro (v:3→v:0 para o Sul, 180°)', rows1.rows[3].azimute.split('°')[0] === '180');
eq('memorial: distância do lado N-S ≈ 111,19 m', rows1.rows[1].distancia, MT.fmtNumber(MT.distanceM([-34.839, -7.02], [-34.839, -7.019]), 2));
const rowsL = MT.pointRows(linha3, { sistema: 'utm', memorial: true, ordem: ['v:0', 'v:1', 'v:2'], titulos: {} });
eq('memorial em linha: o último ponto não tem seguinte', [rowsL.fecha, rowsL.rows[2].azimute, rowsL.rows[2].distancia], [false, '—', '—']);
const rowsD = MT.pointRows(quad, { sistema: 'utm', memorial: true, ordem: ['v:0', 'v:1'], titulos: {} });
eq('memorial com 2 pontos de polígono não fecha', [rowsD.fecha, rowsD.rows[1].azimute], [false, '—']);
eq('ponto que não existe mais é ignorado', MT.pointRows(quad, { sistema: 'utm', ordem: ['v:0', 'v:99'], titulos: {} }).rows.length, 1);
ok('pontos escolhidos continuam valendo com mais de 400 vértices', (() => { const g = { type: 'LineString', coordinates: Array.from({ length: 401 }, (_, i) => [-34.8 + i * 1e-5, -7]) }; return MT.pointRows(g, { sistema: 'geo_dec', ordem: ['v:400'], titulos: {} }).rows.length === 1; })());

// ---------------------------------------------------------------- ortofotos (análise temporal)
const tcfg = MT.normalizeMapConfig({}).temporal;
eq('temporal: desligada, mais antiga primeiro, 2 colunas, contorno e sincronia', [tcfg.ativo, tcfg.ordem, tcfg.colunas, tcfg.sincronizar, tcfg.contorno, tcfg.excluidas], [false, 'asc', 2, true, true, []]);
const tc2 = MT.normalizeMapConfig({ mapa: { temporal: { ativo: true, ordem: 'x', colunas: 9, alturaMm: 5, excluidas: ['a1', 'a1', 'b 2', 7, '../x', 'ok_2'] } } }).temporal;
eq('temporal: valores inválidos voltam ao padrão/limite; ids repetidos ou suspeitos saem', [tc2.ordem, tc2.colunas, tc2.alturaMm, tc2.excluidas], ['asc', 2, 40, ['a1', '7', 'ok_2']]);
eq('temporal: ajustes do usuário', (() => { const a = MT.mergeAjustes(c0, { temporal: { ativo: true, excluidas: ['r1'], ordem: 'desc' } }).temporal; return [a.ativo, a.excluidas, a.ordem, a.colunas]; })(), [true, ['r1'], 'desc', 2]);

eq('data: data_imagem em ISO', MT.rasterDateInfo({ data_imagem: '2026-02-10' }), { iso: '2026-02-10', precisao: 'dia' });
eq('data: data_imagem em DD/MM/AAAA', MT.rasterDateInfo({ data_imagem: '10/02/2026' }), { iso: '2026-02-10', precisao: 'dia' });
eq('data: guardada no navegador quando não há data_imagem', MT.rasterDateInfo({ nome: 'x' }, '2025-05-01'), { iso: '2025-05-01', precisao: 'dia' });
eq('data: completa no nome do arquivo', MT.rasterDateInfo({ nome: 'Ortofoto_10-02-2026' }), { iso: '2026-02-10', precisao: 'dia' });
eq('data: só o ano no nome', MT.rasterDateInfo({ nome: 'Base Cabedelo 2021' }), { iso: '2021-01-01', precisao: 'ano' });
eq('data: nada a aproveitar', MT.rasterDateInfo({ nome: 'Levantamento' }), { iso: null, precisao: null });
eq('data: data_imagem vence o nome', MT.rasterDateInfo({ data_imagem: '2024-03-04', nome: 'Ortofoto_10-02-2026' }).iso, '2024-03-04');
eq('texto da data', [MT.fmtRasterDate({ iso: '2026-02-10', precisao: 'dia' }), MT.fmtRasterDate({ iso: '2021-01-01', precisao: 'ano' }), MT.fmtRasterDate({ iso: null })], ['10/02/2026', '2021', 'Data não informada']);

eq('tile: origem', [MT.tileXY(0, 0, 0), MT.tileXY(0, 0, 1)], [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
eq('tile: canto noroeste', MT.tileXY(80, -179, 1), { x: 0, y: 0 });
const tk = MT.tileXY(-7.019, -34.833, 17);
eq('tile: Cabedelo no zoom 17 (conta independente, com asinh)', tk, { x: Math.floor((-34.833 + 180) / 360 * 131072), y: Math.floor((1 - Math.asinh(Math.tan(-7.019 * Math.PI / 180)) / Math.PI) / 2 * 131072) });
ok('tile: linha coerente com a latitude (hemisfério sul fica na metade de baixo)', tk.y > 65536 && tk.y < 68500);
eq('url do tile', MT.tileUrl('https://x.co/{z}/{x}/{y}.png', 3, 4, 5), 'https://x.co/5/3/4.png');
eq('url do tile com subdomínio', MT.tileUrl('https://{s}.x.co/{z}/{x}/{y}.png', 3, 4, 5), 'https://a.x.co/5/3/4.png');
eq('zoom de teste respeita os limites da ortofoto', [MT.probeZoom({ zoomMin: 14, zoomMax: 22 }), MT.probeZoom({ zoomMin: 18, zoomMax: 22 }), MT.probeZoom({ zoomMin: 10, zoomMax: 15 }), MT.probeZoom({})], [17, 18, 15, 17]);
eq('bbox de ortofoto (canto sul-oeste, canto norte-leste) → [minLng,minLat,maxLng,maxLat]', MT.rasterBBox([[-7.03, -34.85], [-7.0, -34.82]]), [-34.85, -7.03, -34.82, -7.0]);
eq('bbox vazio ou inválido', [MT.rasterBBox([]), MT.rasterBBox(null), MT.rasterBBox([[1, 2]]), MT.rasterBBox([['a', 'b'], ['c', 'd']])], [null, null, null, null]);

const rasters = [
    { id: 'r1', nome: 'Ortofoto_10-02-2026', url_imagem: 'https://s/{z}/{x}/{y}.png', tipo: 'xyz_tiles', bbox: [], zoom_min: 14, zoom_max: 22, opacidade: 0.9 },
    { id: 'r2', nome: 'Base Cabedelo 2021', url_imagem: 'https://s2/{z}/{x}/{y}.png', tipo: 'xyz_tiles', bbox: [], data_imagem: null },
    { id: 'r3', nome: 'Voo longe', url_imagem: 'https://img/longe.webp', bbox: [[-10, -40], [-9, -39]] },
    { id: 'r4', nome: 'Voo cobre', url_imagem: 'https://img/cobre.webp', bbox: [[-7.03, -34.85], [-7.0, -34.82]], data_imagem: '2023-07-01' },
    { id: 'r5', nome: 'Sem data', url_imagem: 'https://s5/{z}/{x}/{y}.png' },
    { id: 'r6', nome: 'Sem url', url_imagem: '' }
];
const lst = MT.buildOrtofotoList(rasters, quad, { storedDate: (id) => (id === 'r5' ? null : null) });
eq('lista: descarta sem URL e as que não cruzam a feição (bbox conhecido)', lst.map(o => o.id), ['r1', 'r2', 'r4', 'r5']);
eq('lista: cobertura conhecida só onde há bbox', lst.map(o => o.coberturaConhecida), [false, false, true, false]);
eq('lista: data e precisão', lst.map(o => [o.dataTxt, o.precisao]), [['10/02/2026', 'dia'], ['2021', 'ano'], ['01/07/2023', 'dia'], ['Data não informada', null]]);
eq('lista: tipo, zoom e opacidade normalizados', [lst[0].tipo, lst[0].zoomMin, lst[0].zoomMax, lst[0].opacidade, lst[2].tipo, lst[3].zoomMax, lst[3].opacidade], ['xyz_tiles', 14, 22, 0.9, 'imagem', 22, 1]);
eq('lista: sem geometria não há o que cruzar', MT.buildOrtofotoList(rasters, null, {}), []);
eq('ordem: mais antiga primeiro; sem data no fim', MT.sortOrtofotos(lst, 'asc').map(o => o.id), ['r2', 'r4', 'r1', 'r5']);
eq('ordem: mais recente primeiro; sem data continua no fim', MT.sortOrtofotos(lst, 'desc').map(o => o.id), ['r1', 'r4', 'r2', 'r5']);
eq('ordenar não altera a lista original', lst.map(o => o.id), ['r1', 'r2', 'r4', 'r5']);

// ---------------------------------------------------------------- extras: configuração
const ex0 = MT.normalizeMapConfig({});
eq('extras: tudo desligado por padrão', [ex0.rotulos.ativo, ex0.confrontantes.ativo, ex0.referencia.ativo, ex0.comparacaoArea.ativo, ex0.situacao.ativo, ex0.quadriculado.ativo, ex0.anotacoes], [false, false, false, false, false, false, []]);
eq('rótulos: campo válido ou padrão', [MT.normalizeMapConfig({ mapa: { rotulos: { campo: 'titulo' } } }).rotulos.campo, MT.normalizeMapConfig({ mapa: { rotulos: { campo: 'x' } } }).rotulos.campo], ['titulo', 'rotulo']);
const cf = MT.normalizeMapConfig({ mapa: { confrontantes: { ativo: true, camada: 'abc-1', tolM: 999, nomes: 1 } } }).confrontantes;
eq('confrontantes: tolerância limitada, camada válida', [cf.ativo, cf.camada, cf.tolM, cf.nomes], [true, 'abc-1', 20, true]);
eq('camada com caracteres suspeitos é descartada', [MT.normalizeMapConfig({ mapa: { confrontantes: { camada: '../x' } } }).confrontantes.camada, MT.normalizeMapConfig({ mapa: { referencia: { camada: 'a b' } } }).referencia.camada, MT.normalizeMapConfig({ mapa: { comparacaoArea: { campo: '<x>' } } }).comparacaoArea.campo], ['', '', '']);
eq('quadriculado: espaçamento só dos valores permitidos (0 = automático)', [MT.normalizeMapConfig({ mapa: { quadriculado: { espacamento: 100 } } }).quadriculado.espacamento, MT.normalizeMapConfig({ mapa: { quadriculado: { espacamento: 77 } } }).quadriculado.espacamento], [100, 0]);
const an = MT.normalizeMapConfig({ mapa: { anotacoes: [{ id: 'a1', lat: -7, lng: -34, texto: '  Muro  ' }, { id: 'a1', lat: -7, lng: -34, texto: 'repetido' }, { lat: 999, lng: 0, texto: 'x' }, { lat: -7, lng: -34, texto: '   ' }, { lat: -7.1, lng: -34.1, texto: 'a\nb' }, 'lixo'] } }).anotacoes;
eq('anotações: limpas, sem duplicar id, sem coordenada inválida nem texto vazio', an.map(x => [x.id, x.texto]), [['a1', 'Muro'], ['a2', 'a b']]);
eq('anotações: no máximo 30', MT.normalizeMapConfig({ mapa: { anotacoes: Array.from({ length: 50 }, (_, i) => ({ lat: -7, lng: -34, texto: 't' + i })) } }).anotacoes.length, 30);
eq('ajustes trazem os extras', (() => { const a = MT.mergeAjustes(ex0, { rotulos: { ativo: true }, quadriculado: { ativo: true, espacamento: 50 }, anotacoes: [{ lat: -7, lng: -34, texto: 'x' }], situacao: { ativo: true } }); return [a.rotulos.ativo, a.rotulos.campo, a.quadriculado.espacamento, a.anotacoes.length, a.situacao.ativo]; })(), [true, 'rotulo', 50, 1, true]);

// rótulos das camadas vizinhas (só quando a página do mapa libera)
const comRot = MT.collectNearbyLayers([{ id: 'L', name: 'Lotes', visible: true, features: [{ properties: { id_banco: 1, nome: 'Fulano' }, geometry: sq(-34.8398, -7.0198, 0.0003) }] }], quad, { labelFn: (th, f) => ({ r: 'Quadra 06 • Lote 08', t: f.properties.nome }) });
eq('camada leva o rótulo e o nome por feição', [comRot[0].features[0].properties.r, comRot[0].features[0].properties.t], ['Quadra 06 • Lote 08', 'Fulano']);
eq('sem labelFn (dados restritos): nenhum atributo vai', Object.keys(MT.collectNearbyLayers([{ id: 'L', name: 'Lotes', visible: true, features: [{ properties: { nome: 'Fulano' }, geometry: sq(-34.8398, -7.0198, 0.0003) }] }], quad, {})[0].features[0].properties).length, 0);
eq('rótulos são limitados em tamanho', MT.collectNearbyLayers([{ id: 'L', name: 'x', visible: true, features: [{ properties: {}, geometry: sq(-34.8398, -7.0198, 0.0003) }] }], quad, { labelFn: () => ({ r: 'r'.repeat(99), t: 't'.repeat(99) }) })[0].features[0].properties.r.length, 40);

// ---------------------------------------------------------------- geometria plana: distância, confrontantes
// lote de 30 m x 20 m (aprox.) e vizinhos ao redor
const dLat = 20 / 111195, dLng = 30 / (111195 * Math.cos(7.02 * Math.PI / 180));
const lote = { type: 'Polygon', coordinates: [[[-34.84, -7.02], [-34.84 + dLng, -7.02], [-34.84 + dLng, -7.02 + dLat], [-34.84, -7.02 + dLat], [-34.84, -7.02]]] };
const retan = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const gap = 0.0000001; // vizinhos colados
const viz = { features: [
    { geometry: retan(-34.84 + dLng + gap, -7.02, -34.84 + 2 * dLng, -7.02 + dLat), properties: { r: 'Quadra E • Lote 02', t: 'Beltrano' } },           // leste
    { geometry: retan(-34.84 - dLng, -7.02, -34.84 - gap, -7.02 + dLat), properties: { r: 'Quadra E • Lote 00', t: 'Ciclano' } },                    // oeste
    { geometry: retan(-34.84, -7.02 + dLat + gap, -34.84 + dLng, -7.02 + 2 * dLat), properties: { r: 'Quadra D • Lote 09' } },                        // norte
    { geometry: retan(-34.84 + dLng + 0.0002, -7.02 + 0.0004, -34.84 + dLng + 0.0004, -7.02 + 0.0006), properties: { r: 'Longe' } }                   // longe
] };
const conf = MT.confrontantes(lote, viz, { tolM: 3 });
eq('confrontantes: um registro por lado, com a mesma numeração das medidas', conf.map(c => c.id), ['lado:0', 'lado:1', 'lado:2', 'lado:3']);
eq('confrontantes: lado sul (lado:0) sem vizinho, norte (lado:2) com Quadra D', [conf[0].confrontantes.length, conf[2].confrontantes.map(x => x.r)], [0, ['Quadra D • Lote 09']]);
eq('confrontantes: leste (lado:1) e oeste (lado:3)', [conf[1].confrontantes.map(x => x.r), conf[3].confrontantes.map(x => x.r)], [['Quadra E • Lote 02'], ['Quadra E • Lote 00']]);
ok('confrontantes: vizinho distante não entra e o nome (t) acompanha', !conf.some(c => c.confrontantes.some(x => x.r === 'Longe')) && conf[1].confrontantes[0].t === 'Beltrano');
ok('confrontantes: lados com comprimento e azimute', conf[0].rotuloLado === 'L1' && Math.abs(conf[0].comprimento - 30) < 0.5 && Math.abs(conf[0].azimute - 90) < 0.5 && Math.abs(conf[1].comprimento - 20) < 0.5);
ok('confrontantes: fração do lado que encosta', conf[1].confrontantes[0].fracao > 0.9);
const so2 = MT.confrontantes(lote, viz, { tolM: 3, minFracao: 1.1 });
ok('confrontantes: exigência maior que 100% não devolve ninguém', so2.every(c => c.confrontantes.length === 0));
const canto = { features: [{ geometry: retan(-34.84 + dLng + gap, -7.02 - dLat, -34.84 + 2 * dLng, -7.02 - gap), properties: { r: 'Só no canto' } }] };
ok('vizinho que só toca o canto não vira confrontante do lado (menos de 20% encosta)', MT.confrontantes(lote, canto, { tolM: 3 }).every(c => c.confrontantes.length === 0));
eq('sem polígono ou sem camada: nada', [MT.confrontantes({ type: 'Point', coordinates: [0, 0] }, viz), MT.confrontantes(lote, null)], [[], []]);
eq('confrontantes de multipolígono continuam a numeração', MT.confrontantes({ type: 'MultiPolygon', coordinates: [lote.coordinates, retan(-34.83, -7.02, -34.8295, -7.0195).coordinates] }, { features: [] }).map(c => c.id).slice(3, 6), ['lado:3', 'lado:4', 'lado:5']);

// distância à camada de referência
const lpm = { features: [{ geometry: { type: 'LineString', coordinates: [[-34.84 + dLng + 50 / (111195 * Math.cos(7.02 * Math.PI / 180)), -7.03], [-34.84 + dLng + 50 / (111195 * Math.cos(7.02 * Math.PI / 180)), -7.01]] }, properties: { r: 'LPM' } }] };
const dist = MT.distanciaCamada(lote, lpm);
ok('distância à linha de referência (~50 m a leste do lote)', Math.abs(dist.metros - 50) < 1 && dist.intersecta === false && dist.r === 'LPM');
const lpmCruza = { features: [{ geometry: { type: 'LineString', coordinates: [[-34.84 + dLng / 2, -7.03], [-34.84 + dLng / 2, -7.01]] }, properties: {} }] };
ok('linha que atravessa o lote: distância 0 e intersecta', (() => { const d = MT.distanciaCamada(lote, lpmCruza); return d.metros === 0 && d.intersecta === true; })());
ok('feição dentro de um polígono de referência: distância 0', MT.distanciaCamada(lote, { features: [{ geometry: retan(-34.85, -7.03, -34.8, -7.0), properties: {} }] }).metros === 0);
ok('polígono vizinho separado: distância entre contornos', (() => { const d = MT.distanciaCamada(lote, { features: [{ geometry: retan(-34.84 + dLng + 20 / (111195 * Math.cos(7.02 * Math.PI / 180)), -7.02, -34.84 + 2 * dLng, -7.02 + dLat), properties: {} }] }); return Math.abs(d.metros - 20) < 1; })());
ok('escolhe a mais próxima entre várias', (() => { const d = MT.distanciaCamada(lote, { features: [lpm.features[0], { geometry: { type: 'Point', coordinates: [-34.84 + dLng + 5 / (111195 * Math.cos(7.02 * Math.PI / 180)), -7.02] }, properties: { r: 'Marco' } }] }); return d.r === 'Marco' && Math.abs(d.metros - 5) < 0.5; })());
eq('sem camada ou vazia: nulo', [MT.distanciaCamada(lote, null), MT.distanciaCamada(lote, { features: [] })], [null, null]);

// sobreposição (o Turf é injetado)
const turfFalso = { intersect: (a, b) => (b.geometry.type === 'Polygon' && b.geometry.coordinates[0][0][0] < -34.85 ? null : { type: 'Feature', geometry: b.geometry }), area: () => 100 };
const sob = MT.sobreposicaoCamada(lote, { features: [{ geometry: retan(-34.84, -7.02, -34.8399, -7.0199), properties: {} }, { geometry: retan(-34.86, -7.02, -34.85, -7.0199), properties: {} }, { geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} }] }, turfFalso);
ok('sobreposição soma só as interseções e dá o percentual da feição', sob.areaM2 === 100 && Math.abs(sob.totalM2 - 600) < 15 && Math.abs(sob.pct - 100 / sob.totalM2 * 100) < 1e-9);
eq('sobreposição sem Turf, sem polígono ou sem camada: nulo', [MT.sobreposicaoCamada(lote, { features: [] }, null), MT.sobreposicaoCamada({ type: 'Point', coordinates: [0, 0] }, { features: [] }, turfFalso), MT.sobreposicaoCamada(lote, null, turfFalso)], [null, null, null]);
eq('erro do Turf numa geometria não derruba as outras', MT.sobreposicaoCamada(lote, { features: [{ geometry: retan(0, 0, 1, 1), properties: {} }, { geometry: retan(-34.84, -7.02, -34.8399, -7.0199), properties: {} }] }, { intersect: (a, b) => { if (b.geometry.coordinates[0][0][0] === 0) throw new Error('inválida'); return { type: 'Feature' }; }, area: () => 40 }).areaM2, 40);

// área cadastral x calculada
eq('número no padrão brasileiro e cru', [MT.parseNumeroBR('550,26'), MT.parseNumeroBR('1.012,40'), MT.parseNumeroBR('720.62'), MT.parseNumeroBR(' 550,26 m² '), MT.parseNumeroBR(''), MT.parseNumeroBR('abc'), MT.parseNumeroBR(12.5)], [550.26, 1012.4, 720.62, 550.26, null, null, 12.5]);
const cmp = MT.compararAreas('550,26', 560);
ok('área calculada maior que a cadastral: diferença, percentual e alerta acima de 1%', Math.abs(cmp.diferenca - 9.74) < 1e-9 && Math.abs(cmp.pct - 1.7702) < 0.001 && cmp.alerta === true);
eq('dentro da tolerância não alerta', MT.compararAreas('550,26', 552).alerta, false);
eq('tolerância própria', [MT.compararAreas('100', 103, 5).alerta, MT.compararAreas('100', 103, 2).alerta], [false, true]);
eq('sem valor cadastral: nulo; cadastro zero não divide', [MT.compararAreas('', 100), MT.compararAreas('0', 100).pct, MT.compararAreas('0', 100).alerta], [null, null, false]);

// quadriculado UTM
eq('espaçamento automático (~5 linhas na extensão)', [MT.autoGridSpacing(60), MT.autoGridSpacing(500), MT.autoGridSpacing(5000)], [10, 100, 1000]);
const gr = MT.gradeUTM([-34.8412, -7.0211, -34.8388, -7.0189], 50);
eq('grade: zona 25 e espaçamento pedido', [gr.zona, gr.espacamento], [25, 50]);
ok('grade: linhas de E e de N, todas múltiplas do espaçamento', gr.linhas.some(l => l.tipo === 'e') && gr.linhas.some(l => l.tipo === 'n') && gr.linhas.every(l => l.valor % 50 === 0));
ok('grade: cada linha tem pontos dentro do retângulo (com folga de curvatura)', gr.linhas.every(l => l.pts.length === 7 && l.pts.every(p => p[0] > -7.0215 && p[0] < -7.0185 && p[1] > -34.8416 && p[1] < -34.8384)));
ok('grade: linhas de E são quase verticais e as de N quase horizontais', (() => { const e = gr.linhas.find(l => l.tipo === 'e'), n = gr.linhas.find(l => l.tipo === 'n'); return Math.abs(e.pts[0][1] - e.pts[6][1]) < 5e-5 && Math.abs(n.pts[0][0] - n.pts[6][0]) < 5e-5; })());
ok('grade automática também funciona', MT.gradeUTM([-34.8412, -7.0211, -34.8388, -7.0189]).espacamento > 0);

console.log(`mapTools: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
