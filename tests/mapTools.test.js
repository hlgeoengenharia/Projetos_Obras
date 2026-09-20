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

console.log(`mapTools: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
