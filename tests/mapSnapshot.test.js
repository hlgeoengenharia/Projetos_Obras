// tests/mapSnapshot.test.js
// Captura do mapa em duas etapas: html2canvas (tiles e vetores) + textos desenhados nas posições reais.
// Rodar com: node tests/mapSnapshot.test.js

const MS = require('../src/mapSnapshot.js');

let total = 0;
let failed = 0;
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

// ---------------------------------------------------------------- nós, estilo e canvas simulados
const BASE = { display: 'block', visibility: 'visible', opacity: '1', fontFamily: 'Consolas', fontSize: '9px', fontWeight: '400', fontStyle: 'normal', color: 'rgb(6, 95, 70)', backgroundColor: 'rgba(0, 0, 0, 0)', textTransform: 'none', textShadow: 'none',
    borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px', borderTopStyle: 'none', borderRightStyle: 'none', borderBottomStyle: 'none', borderLeftStyle: 'none',
    borderTopColor: 'rgb(0, 0, 0)', borderRightColor: 'rgb(0, 0, 0)', borderBottomColor: 'rgb(0, 0, 0)', borderLeftColor: 'rgb(0, 0, 0)', borderTopLeftRadius: '0px', borderTopRightRadius: '0px', borderBottomRightRadius: '0px', borderBottomLeftRadius: '0px' };
const R = (l, t, w, h) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h });
function E(tag, o, ...kids) { o = o || {}; return { nodeType: 1, tagName: tag.toUpperCase(), id: o.id || '', className: o.cls || '', style: Object.assign({}, BASE, o.st || {}), rect: o.r || R(0, 0, 0, 0), childNodes: kids, textContent: o.text || '' }; }
const T = (s, r) => ({ nodeType: 3, nodeValue: s, rect: r });
const env = { cs: (el) => el.style, rect: (el) => el.rect, textRect: (n) => n.rect };

function fakeCtx() {
    const calls = [];
    const ctx = { calls, save() { calls.push(['save']); }, restore() { calls.push(['restore']); }, scale(a, b) { calls.push(['scale', a, b]); },
        beginPath() { calls.push(['beginPath']); }, closePath() {}, moveTo(x, y) { calls.push(['moveTo', x, y]); }, lineTo(x, y) { calls.push(['lineTo', x, y]); },
        translate(x, y) { calls.push(['translate', x, y]); }, rotate(a) { calls.push(['rotate', a]); }, measureText(t) { return { width: t.length * 5 }; },
        setTransform(...a) { calls.push(['setTransform', ...a]); }, quadraticCurveTo() {}, rect(x, y, w, h) { calls.push(['rect', x, y, w, h]); }, fill() { calls.push(['fill', ctx.fillStyle]); }, stroke() { calls.push(['stroke', ctx.strokeStyle, ctx.lineWidth]); },
        fillText(t, x, y) { calls.push(['fillText', t, x, y, ctx.font, ctx.fillStyle, ctx.textBaseline]); }, strokeText(t, x, y) { calls.push(['strokeText', t, x, y]); }, setLineDash() {} };
    return ctx;
}
const of = (ctx, name) => ctx.calls.filter(c => c[0] === name);

// mapa em (100, 50), 600×340; rótulo de medida no meio do mapa
const rotulo = E('div', { cls: 'leaflet-marker-icon report-measure', r: R(400, 220, 0, 0) },
    E('span', { cls: 'report-measure-label', st: { backgroundColor: 'rgba(255, 255, 255, 0.92)', color: 'rgb(6, 95, 70)', borderTopWidth: '1px', borderRightWidth: '1px', borderBottomWidth: '1px', borderLeftWidth: '1px', borderTopStyle: 'solid', borderRightStyle: 'solid', borderBottomStyle: 'solid', borderLeftStyle: 'solid', borderTopColor: 'rgb(110, 231, 183)', borderRightColor: 'rgb(110, 231, 183)', borderBottomColor: 'rgb(110, 231, 183)', borderLeftColor: 'rgb(110, 231, 183)', borderTopLeftRadius: '4px', borderTopRightRadius: '4px', borderBottomRightRadius: '4px', borderBottomLeftRadius: '4px', fontWeight: '700' }, r: R(370, 213, 60, 14) },
        T('26,12 m', R(374, 214, 52, 12))));
const norte = E('div', { id: 'map-north', st: { backgroundColor: 'rgba(0, 0, 0, 0.72)', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', borderBottomRightRadius: '8px', borderBottomLeftRadius: '8px' }, r: R(640, 58, 34, 44) },
    E('span', { cls: 'material-symbols-outlined', st: { color: 'rgb(251, 191, 36)' }, text: 'navigation', r: R(645, 62, 24, 24) }, T('navigation', R(645, 62, 24, 24))),
    E('span', { st: { color: 'rgb(255, 255, 255)', fontWeight: '700' }, r: R(653, 88, 8, 10) }, T('N', R(653, 88, 8, 10))));
const escala = E('div', { cls: 'leaflet-control-scale leaflet-control', r: R(108, 380, 90, 20) },
    E('div', { cls: 'leaflet-control-scale-line', st: { borderBottomWidth: '2px', borderBottomStyle: 'solid', borderBottomColor: 'rgb(119, 119, 119)', borderLeftWidth: '2px', borderLeftStyle: 'solid', borderLeftColor: 'rgb(119, 119, 119)', borderRightWidth: '2px', borderRightStyle: 'solid', borderRightColor: 'rgb(119, 119, 119)', backgroundColor: 'rgba(255, 255, 255, 0.8)', color: 'rgb(51, 51, 51)' }, r: R(108, 380, 90, 18) }, T('30 m', R(112, 382, 28, 12))));
const brilho = E('div', { cls: 'report-nlabel', r: R(300, 200, 0, 0) }, E('span', { st: { textShadow: 'rgb(255, 255, 255) 0px 0px 2px', fontWeight: '700', color: 'rgb(15, 23, 42)' }, r: R(280, 195, 80, 10) }, T('Quadra E • Lote 02', R(280, 195, 80, 10))));
const oculto = E('div', { id: 'map-legend', st: { display: 'none' }, r: R(0, 0, 10, 10) }, T('Legenda', R(0, 0, 10, 10)));
const zoom = E('div', { cls: 'leaflet-control-zoom', r: R(108, 58, 30, 60) }, T('+', R(112, 60, 8, 8)));
const tile = E('div', { cls: 'leaflet-tile-pane', r: R(100, 50, 600, 340) }, T('não é texto do mapa', R(100, 50, 20, 10)));
const mapa = E('div', { id: 'map-wrap', r: R(100, 50, 600, 340) }, tile, rotulo, norte, escala, brilho, oculto, zoom);

// ---------------------------------------------------------------- quais elementos o html2canvas ignora
ok('rótulos, norte, escala, legenda, crédito e zoom são ignorados pelo html2canvas', [rotulo, norte, escala, brilho, oculto, E('div', { cls: 'leaflet-control-attribution' }), E('div', { id: 'map-info-bar' }), E('div', { cls: 'report-point' }), E('div', { cls: 'report-note' }), E('div', { cls: 'report-glabel' }), zoom, E('div', { cls: 'no-print x' })].every(MS.shouldIgnore));
ok('tiles e vetores NÃO são ignorados', !MS.shouldIgnore(tile) && !MS.shouldIgnore(mapa) && !MS.shouldIgnore(E('div', { cls: 'leaflet-overlay-pane' })));
ok('os quadros novos de escala aproximada e projeção também são texto sobre o mapa', ['map-escala-txt', 'map-proj-txt'].every(id => MS.isOverlay(E('div', { id })) && MS.shouldIgnore(E('div', { id }))));
ok('só os elementos de texto contam como "sobreposição" (o zoom só é ignorado)', MS.isOverlay(rotulo) && !MS.isOverlay(zoom));

// ---------------------------------------------------------------- desenho
const ctx = fakeCtx();
const n = MS.paintOverlays(ctx, mapa, env, 2);
eq('sobreposições encontradas (rótulo, norte, escala, brilho, legenda oculta)', n, 5);
eq('desenho na escala da captura', of(ctx, 'scale'), [['scale', 2, 2]]);
ok('a escala que o html2canvas deixou no contexto é zerada ANTES de aplicar a nossa (senão os textos saem 2× maiores e deslocados)', ctx.calls.findIndex(c => c[0] === 'setTransform') >= 0 && JSON.stringify(of(ctx, 'setTransform')[0]) === JSON.stringify(['setTransform', 1, 0, 0, 1, 0, 0]) && ctx.calls.findIndex(c => c[0] === 'setTransform') < ctx.calls.findIndex(c => c[0] === 'scale'));
const ft = of(ctx, 'fillText');
const rot = ft.find(c => c[1] === '26,12 m');
ok('texto do rótulo no centro vertical do retângulo do texto, relativo ao canto do mapa (374-100, 214-50+6)', rot && rot[2] === 274 && rot[3] === 170);
ok('fonte e cor vindas do estilo real (negrito, 9px, cor do rótulo)', rot[4] === 'normal bold 9px Consolas' && rot[5] === 'rgb(6,95,70)' && rot[6] === 'middle');
ok('caixa do rótulo: fundo branco translúcido e borda verde de 1px', of(ctx, 'fill').some(c => c[1] === 'rgba(255,255,255,0.92)') && of(ctx, 'stroke').some(c => c[1] === 'rgb(110,231,183)' && c[2] === 1));
ok('texto "N" do norte desenhado em branco', ft.some(c => c[1] === 'N' && c[5] === 'rgb(255,255,255)'));
ok('o ícone do norte vira uma seta amarela (não o texto "navigation")', !ft.some(c => c[1] === 'navigation') && of(ctx, 'fill').some(c => c[1] === 'rgb(251,191,36)') && of(ctx, 'fill').some(c => c[1] === 'rgba(0,0,0,0.72)'));
ok('escala: texto "30 m" e as bordas esquerda, direita e de baixo desenhadas separadamente', ft.some(c => c[1] === '30 m') && of(ctx, 'stroke').filter(c => c[1] === 'rgb(119,119,119)' && c[2] === 2).length === 3);
ok('brilho branco do rótulo do vizinho (contorno antes do texto)', of(ctx, 'strokeText').some(c => c[1] === 'Quadra E • Lote 02') && ctx.calls.findIndex(c => c[0] === 'strokeText') < ctx.calls.findIndex(c => c[0] === 'fillText' && c[1] === 'Quadra E • Lote 02'));
ok('elemento oculto (display:none) e o zoom não são desenhados', !ft.some(c => c[1] === 'Legenda' || c[1] === '+'));
ok('texto do painel de tiles não é desenhado por aqui', !ft.some(c => c[1] === 'não é texto do mapa'));
ok('marcadores são desenhados antes dos controles (controles por cima)', ft.findIndex(c => c[1] === '26,12 m') < ft.findIndex(c => c[1] === '30 m'));

// ---------------------------------------------------------------- mapa de localização (card próprio): tiles/vetores capturados normalmente; só a seta do norte é redesenhada
const locNorte = E('div', { cls: 'report-locator-north', r: R(748, 54, 16, 16) },
    E('span', { cls: 'material-symbols-outlined', st: { color: 'rgb(251, 191, 36)' }, text: 'navigation', r: R(750, 56, 13, 13) }, T('navigation', R(750, 56, 13, 13))));
const locTile = E('div', { cls: 'leaflet-tile-pane', r: R(740, 50, 128, 128) }, T('não é texto', R(740, 50, 10, 10)));
const locBox = E('div', { id: 'map-locator', r: R(740, 50, 128, 128) }, locTile, locNorte);
ok('a seta do norte da caixa de localização é ignorada pelo html2canvas (redesenhada manualmente)', MS.shouldIgnore(locNorte) && MS.isOverlay(locNorte));
ok('a caixa em si e os tiles dela NÃO são ignorados (capturados normalmente, com o resto do mapa)', !MS.shouldIgnore(locBox) && !MS.shouldIgnore(locTile) && !MS.isOverlay(locBox));
const ctxLoc = fakeCtx();
const nLoc = MS.paintOverlays(ctxLoc, locBox, env, 2);
eq('só a seta entra como sobreposição (a caixa não é percorrida por inteiro)', nLoc, 1);
ok('a seta vira o mesmo triângulo amarelo do norte principal, sem desenhar o texto "navigation"', !of(ctxLoc, 'fillText').some(c => c[1] === 'navigation') && of(ctxLoc, 'fill').some(c => c[1] === 'rgb(251,191,36)'));
eq('salva e restaura o estado do canvas', [of(ctx, 'save').length, of(ctx, 'restore').length], [1, 1]);

// texto em caixa alta e espaço em branco
const ctx2 = fakeCtx();
MS.paintOverlays(ctx2, E('div', { id: 'm', r: R(0, 0, 100, 100) }, E('div', { id: 'map-info-bar', st: { textTransform: 'uppercase' }, r: R(0, 0, 90, 12) }, T('  escala   aprox. ', R(0, 0, 60, 12)), T('   ', R(60, 0, 3, 12)))), env, 1);
eq('espaços recolhidos, texto vazio ignorado e caixa alta aplicada', of(ctx2, 'fillText').map(c => c[1]), ['ESCALA APROX.']);
const ctx3 = fakeCtx();
MS.paintOverlays(ctx3, E('div', { r: R(0, 0, 100, 100) }, E('div', { id: 'map-info-bar', r: R(0, 0, 10, 10) }, T('sem retângulo', null), T('largura zero', R(0, 0, 0, 0)))), env, 1);
eq('texto sem retângulo calculado não é desenhado (nunca em posição inventada)', of(ctx3, 'fillText').length, 0);

// ---------------------------------------------------------------- texto girado, sem card, sublinhado e ícone de girar
{
    const th = -30 * Math.PI / 180;
    const matriz = 'matrix(' + Math.cos(th).toFixed(4) + ', ' + Math.sin(th).toFixed(4) + ', ' + (-Math.sin(th)).toFixed(4) + ', ' + Math.cos(th).toFixed(4) + ', 0, 0)';
    const lado = E('div', { cls: 'leaflet-marker-icon report-measure', r: R(400, 220, 0, 0) },
        E('span', { cls: 'report-measure-label', st: { transform: matriz, fontWeight: '400', fontStyle: 'italic', textDecorationLine: 'underline', textShadow: 'rgb(255, 255, 255) 0px 0px 2px' }, r: R(370, 200, 60, 40) },
            T('26,12 m', R(372, 204, 56, 32)),
            E('span', { cls: 'report-rot no-print', r: R(430, 215, 15, 15) }, T('\u21bb', R(431, 216, 10, 12)))));
    const c = fakeCtx();
    MS.paintOverlays(c, E('div', { r: R(100, 50, 600, 340) }, lado), env, 2);
    const t = of(c, 'fillText');
    eq('só o texto é desenhado (o ícone de girar não vai para a imagem)', t.map(x => x[1]), ['26,12 m']);
    eq('o giro da matriz vira rotate() do canvas, em torno do centro do texto', [of(c, 'translate')[0], Math.round(of(c, 'rotate')[0][1] * 1000) / 1000], [['translate', 300, 170 + 0], Math.round(th * 1000) / 1000]);
    ok('texto girado: desenhado em (0, 0), centralizado, com fonte itálica normal e o brilho branco', t[0][2] === 0 && t[0][3] === 0 && /italic normal 9px/.test(t[0][4]) && of(c, 'strokeText').length === 1);
    ok('sublinhado desenhado à parte (linha na largura do texto)', of(c, 'lineTo').some(x => x[1] === 17.5 && x[2] > 0) && of(c, 'moveTo').some(x => x[1] === -17.5));
    ok('sem caixa (card) para o texto girado', of(c, 'fill').length === 0 && of(c, 'rect').length === 0);
    eq('salva/restaura em par (o giro não vaza para os outros textos)', [of(c, 'save').length, of(c, 'restore').length], [2, 2]);
    eq('rotationOf lê a matriz; sem matriz, zero', [Math.round(MS.rotationOf({ transform: matriz }) * 1000) / 1000, MS.rotationOf({ transform: 'none' }), MS.rotationOf({ transform: 'matrix(1, 0, 0, 1, 40, 12)' }) + 0], [Math.round(th * 1000) / 1000, 0, 0]);
    // anotação girada mantém o card (fundo branco e borda preta) desenhado em torno do centro
    const nota = E('div', { cls: 'leaflet-marker-icon report-note', r: R(300, 200, 0, 0) },
        E('span', { cls: 'report-note-label', st: { transform: matriz, backgroundColor: 'rgb(255, 255, 255)', borderTopWidth: '1px', borderRightWidth: '1px', borderBottomWidth: '1px', borderLeftWidth: '1px', borderTopStyle: 'solid', borderRightStyle: 'solid', borderBottomStyle: 'solid', borderLeftStyle: 'solid', borderTopColor: 'rgb(0, 0, 0)', borderRightColor: 'rgb(0, 0, 0)', borderBottomColor: 'rgb(0, 0, 0)', borderLeftColor: 'rgb(0, 0, 0)' }, r: R(260, 180, 80, 60) }, T('Muro', R(270, 195, 60, 30))));
    const cn = fakeCtx();
    MS.paintOverlays(cn, E('div', { r: R(100, 50, 600, 340) }, nota), { cs: env.cs, rect: env.rect, textRect: env.textRect, size: () => ({ w: 40, h: 14 }) }, 1);
    ok('anotação girada: caixa desenhada girada em torno do centro (200, 160) com o tamanho de layout (40 x 14)', of(cn, 'translate')[0][1] === 200 && of(cn, 'translate')[0][2] === 160 && of(cn, 'rotate').length >= 1 && of(cn, 'rect').some(x => x[1] === -20 && x[2] === -7 && x[3] === 40 && x[4] === 14));
    ok('anotação girada: fundo branco e borda preta preservados', of(cn, 'fill').some(c => c[1] === 'rgb(255,255,255)') && of(cn, 'stroke').some(c => c[1] === 'rgb(0,0,0)'));
    const semTam = fakeCtx();
    MS.paintOverlays(semTam, E('div', { r: R(100, 50, 600, 340) }, nota), env, 1);
    ok('sem o tamanho de layout, a caixa girada não é inventada (só o texto)', of(semTam, 'fill').length === 0 && of(semTam, 'fillText').length === 1);
    // contorno do texto na cor que o navegador calculou (escuro em cor clara)
    {
        const escuro = E('div', { cls: 'leaflet-marker-icon report-measure', r: R(400, 220, 0, 0) }, E('span', { st: { color: 'rgb(255, 255, 0)', textShadow: 'rgb(0, 0, 0) 0px 0px 2px, rgb(0, 0, 0) 0px 0px 2px', fontWeight: '700' }, r: R(370, 213, 40, 14) }, T('12,00 m', R(372, 214, 36, 12))));
        const ce = fakeCtx();
        MS.paintOverlays(ce, E('div', { r: R(100, 50, 600, 340) }, escuro), env, 1);
        ok('texto claro: contorno escuro (preto) e texto amarelo por cima', of(ce, 'strokeText').length === 1 && ce.calls.find(c => c[0] === 'fillText')[5] === 'rgb(255,255,0)');
    }
    const sub = fakeCtx();
    MS.paintOverlays(sub, E('div', { r: R(0, 0, 100, 100) }, E('div', { cls: 'report-point', r: R(10, 10, 0, 0) }, E('span', { st: { textDecoration: 'underline' }, r: R(10, 10, 40, 12) }, T('P1', R(10, 10, 40, 12))))), env, 1);
    ok('sublinhado também no texto sem giro (a partir do início do texto)', of(sub, 'moveTo').some(x => x[1] === 10) && of(sub, 'lineTo').some(x => x[1] === 20));
}

// ---------------------------------------------------------------- captura em duas etapas
(async () => {
    const chamadas = [];
    const canvas = { getContext: () => { const c = fakeCtx(); canvas.ctx = c; return c; }, toDataURL: (t) => 'data:' + t + ';base64,QUJD' };
    const html2canvas = async (el, opts) => { chamadas.push({ el, opts }); return canvas; };
    const r = await MS.capture(mapa, { html2canvas, cs: env.cs, rect: env.rect, textRect: env.textRect, scale: 2 });
    eq('devolve a imagem PNG e o tamanho do layout', [r.dataUrl, r.w, r.h], ['data:image/png;base64,QUJD', 600, 340]);
    ok('o html2canvas recebe o mapa, com CORS, escala 2 e fundo branco', chamadas[0].el === mapa && chamadas[0].opts.useCORS === true && chamadas[0].opts.scale === 2 && chamadas[0].opts.backgroundColor === '#ffffff');
    ok('o html2canvas ignora os textos (para não desenhá-los deslocados)', chamadas[0].opts.ignoreElements(rotulo) === true && chamadas[0].opts.ignoreElements(tile) === false);
    ok('depois do html2canvas, os textos são desenhados no mesmo canvas', of(canvas.ctx, 'fillText').some(c => c[1] === '26,12 m'));
    const semEscala = await MS.capture(mapa, { html2canvas, cs: env.cs, rect: env.rect, textRect: env.textRect });
    ok('escala padrão 2', chamadas[1].opts.scale === 2 && semEscala.w === 600);

    console.log(`mapSnapshot: ${total - failed}/${total} verificações passaram`);
    if (failed > 0) {
        console.error(`${failed} falha(s)`);
        process.exit(1);
    }
})();
