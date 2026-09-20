// src/mapSnapshot.js
// IMAGEM DO MAPA (PNG e Word) SEM TEXTO DESLOCADO.
// O html2canvas desenha bem os tiles e os vetores, mas posiciona o texto dos rótulos alguns pixels fora do
// lugar. Por isso a captura é feita em duas etapas: (1) o html2canvas desenha só o mapa (tiles e vetores),
// ignorando os elementos de texto; (2) este módulo desenha por cima os rótulos, o norte, a escala, a
// legenda e o crédito, caixa por caixa, usando as posições REAIS que o navegador calculou.
//
// Não depende do DOM global: recebe `env` = { cs(el), rect(el), textRect(textNode) } — testável com nós simulados.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MapSnapshot = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /** Classes/ids dos elementos de texto sobre o mapa (o html2canvas os ignora; este módulo os desenha). */
    const OVERLAY_CLASSES = ['report-measure', 'report-point', 'report-note', 'report-nlabel', 'report-glabel', 'leaflet-control-scale', 'leaflet-control-attribution'];
    const OVERLAY_IDS = ['map-north', 'map-info-bar', 'map-legend'];
    const IGNORED_ONLY = ['leaflet-control-zoom', 'no-print'];

    function hasClass(el, name) {
        const c = el && el.className;
        if (typeof c === 'string') return c.split(/\s+/).indexOf(name) >= 0;
        if (c && typeof c.baseVal === 'string') return c.baseVal.split(/\s+/).indexOf(name) >= 0;
        return !!(el && el.classList && el.classList.contains && el.classList.contains(name));
    }

    function isOverlay(el) {
        if (!el) return false;
        if (el.id && OVERLAY_IDS.indexOf(el.id) >= 0) return true;
        return OVERLAY_CLASSES.some(c => hasClass(el, c));
    }

    /** Predicado para o `ignoreElements` do html2canvas. */
    function shouldIgnore(el) {
        return isOverlay(el) || IGNORED_ONLY.some(c => hasClass(el, c));
    }

    function px(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }

    function colorCss(c) {
        if (!c) return null;
        const s = String(c).trim();
        if (s === 'transparent') return null;
        const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(s);
        if (m) {
            const a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
            if (!(a > 0)) return null;
            return a >= 1 ? 'rgb(' + m[1] + ',' + m[2] + ',' + m[3] + ')' : 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + a + ')';
        }
        return s;
    }

    function roundedRect(ctx, x, y, w, h, r) {
        const rr = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        if (rr <= 0) { ctx.rect(x, y, w, h); return; }
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    }

    /**
     * Desenha, sobre `ctx`, todos os elementos de texto sobre o mapa que estão dentro de `mapEl`.
     * As coordenadas são em px CSS relativos ao canto do mapa; `scale` é a razão canvas/CSS.
     */
    function paintOverlays(ctx, mapEl, env, scale) {
        const cs = env.cs, rect = env.rect;
        const origin = rect(mapEl);
        const roots = [];
        const collect = (n) => {
            if (!n || n.nodeType !== 1) return;
            if (isOverlay(n)) { roots.push(n); return; }
            Array.prototype.forEach.call(n.childNodes || [], collect);
        };
        collect(mapEl);
        // marcadores primeiro; controles e legenda por cima
        const rank = (n) => (n.id && OVERLAY_IDS.indexOf(n.id) >= 0) || hasClass(n, 'leaflet-control-scale') || hasClass(n, 'leaflet-control-attribution') ? 1 : 0;
        roots.sort((a, b) => rank(a) - rank(b));

        ctx.save();
        // o html2canvas devolve o contexto JÁ com a escala aplicada; sem zerar, os textos saem ampliados e fora do lugar
        if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(scale || 1, scale || 1);
        roots.forEach(r => paintTree(ctx, r, env, origin));
        ctx.restore();
        return roots.length;
    }

    function visible(st) {
        return st.display !== 'none' && st.visibility !== 'hidden' && String(st.opacity) !== '0';
    }

    /** Giro (rad) da matriz de transformação calculada ("matrix(a, b, ...)"), 0 se não houver. */
    function rotationOf(st) {
        const m = /^matrix(?:3d)?\(([^)]+)\)$/.exec(String((st && st.transform) || '').trim());
        if (!m) return 0;
        const v = m[1].split(',').map(parseFloat);
        return isFinite(v[0]) && isFinite(v[1]) ? Math.atan2(v[1], v[0]) : 0;
    }

    function paintTree(ctx, el, env, origin, ang) {
        if (hasClass(el, 'no-print')) return; // ícones de edição (girar etc.) não vão para a imagem
        const st = env.cs(el);
        if (!visible(st)) return;
        const r = env.rect(el);
        const x = r.left - origin.left, y = r.top - origin.top;
        const a = (ang || 0) + rotationOf(st);
        if (!a && r.width > 0 && r.height > 0) paintBox(ctx, st, x, y, r.width, r.height);
        Array.prototype.forEach.call(el.childNodes || [], n => {
            if (n.nodeType === 3) paintText(ctx, n, st, env, origin, a);
            else if (n.nodeType === 1) {
                if (hasClass(n, 'material-symbols-outlined')) paintIcon(ctx, n, env, origin);
                else paintTree(ctx, n, env, origin, a);
            }
        });
    }

    function paintBox(ctx, st, x, y, w, h) {
        const rad = Math.max(px(st.borderTopLeftRadius), px(st.borderTopRightRadius), px(st.borderBottomRightRadius), px(st.borderBottomLeftRadius));
        const bg = colorCss(st.backgroundColor);
        if (bg) { ctx.fillStyle = bg; roundedRect(ctx, x, y, w, h, rad); ctx.fill(); }
        const sides = ['Top', 'Right', 'Bottom', 'Left'].map(s => ({ w: px(st['border' + s + 'Width']), st: st['border' + s + 'Style'], c: colorCss(st['border' + s + 'Color']) }));
        const has = (s) => s.w > 0 && s.st && s.st !== 'none' && s.st !== 'hidden' && s.c;
        if (sides.every(has) && sides.every(s => s.w === sides[0].w && s.c === sides[0].c)) {
            ctx.strokeStyle = sides[0].c; ctx.lineWidth = sides[0].w;
            ctx.setLineDash && ctx.setLineDash(sides[0].st === 'dashed' ? [4, 3] : []);
            roundedRect(ctx, x + sides[0].w / 2, y + sides[0].w / 2, w - sides[0].w, h - sides[0].w, Math.max(0, rad - sides[0].w / 2));
            ctx.stroke();
            ctx.setLineDash && ctx.setLineDash([]);
            return;
        }
        const line = (s, x1, y1, x2, y2) => { if (!has(s)) return; ctx.strokeStyle = s.c; ctx.lineWidth = s.w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
        line(sides[0], x, y + sides[0].w / 2, x + w, y + sides[0].w / 2);
        line(sides[1], x + w - sides[1].w / 2, y, x + w - sides[1].w / 2, y + h);
        line(sides[2], x, y + h - sides[2].w / 2, x + w, y + h - sides[2].w / 2);
        line(sides[3], x + sides[3].w / 2, y, x + sides[3].w / 2, y + h);
    }

    function fontString(st) {
        const w = st.fontWeight === 'bold' || px(st.fontWeight) >= 600 ? 'bold' : 'normal';
        const it = st.fontStyle === 'italic' ? 'italic' : 'normal';
        return it + ' ' + w + ' ' + (px(st.fontSize) || 12) + 'px ' + (st.fontFamily || 'sans-serif');
    }

    /** O texto é desenhado no centro vertical do retângulo que o navegador calculou para ele. */
    function paintText(ctx, node, st, env, origin, ang) {
        let t = String(node.nodeValue === undefined || node.nodeValue === null ? '' : node.nodeValue).replace(/\s+/g, ' ').trim();
        if (!t) return;
        if (st.textTransform === 'uppercase') t = t.toUpperCase();
        const r = env.textRect(node);
        if (!r || !(r.width > 0)) return;
        ctx.font = fontString(st);
        ctx.textBaseline = 'middle';
        // texto girado: o retângulo é o da caixa que envolve o texto girado; o centro dele é o centro do texto
        const girado = !!ang;
        let x = r.left - origin.left, y = r.top - origin.top + r.height / 2;
        if (girado) {
            ctx.save();
            ctx.translate(x + r.width / 2, y);
            ctx.rotate(ang);
            ctx.textAlign = 'center';
            x = 0; y = 0;
        } else {
            ctx.textAlign = 'left';
        }
        // brilho branco ao redor (rótulos sobre o mapa)
        if (/#fff|255,\s*255,\s*255/i.test(String(st.textShadow || ''))) {
            ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.strokeText(t, x, y);
        }
        ctx.fillStyle = colorCss(st.color) || '#000';
        ctx.fillText(t, x, y);
        // sublinhado (o canvas não tem)
        if (/underline/.test(String(st.textDecorationLine || st.textDecoration || ''))) {
            const fs = px(st.fontSize) || 12;
            const w = ctx.measureText ? ctx.measureText(t).width : t.length * fs * 0.6;
            const x0 = girado ? x - w / 2 : x;
            ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1, fs / 12);
            ctx.beginPath(); ctx.moveTo(x0, y + fs * 0.5); ctx.lineTo(x0 + w, y + fs * 0.5); ctx.stroke();
        }
        if (girado) ctx.restore();
    }

    /** Ícone de fonte: só o norte ("navigation") é desenhado, como seta; os demais são ignorados. */
    function paintIcon(ctx, el, env, origin) {
        const txt = String(el.textContent || '').trim();
        if (txt !== 'navigation') return;
        const r = env.rect(el);
        const cx = r.left - origin.left + r.width / 2, cy = r.top - origin.top + r.height / 2;
        const s = Math.min(r.width, r.height) * 0.5 || 8;
        ctx.fillStyle = colorCss(env.cs(el).color) || '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s * 0.75, cy + s);
        ctx.lineTo(cx, cy + s * 0.45);
        ctx.lineTo(cx - s * 0.75, cy + s);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * Captura o mapa: html2canvas desenha tiles e vetores; depois os textos são desenhados por cima.
     * deps: { html2canvas, cs, rect, textRect, scale? }. Devolve { dataUrl, w, h }.
     */
    async function capture(mapEl, deps) {
        const scale = deps.scale || 2;
        const canvas = await deps.html2canvas(mapEl, {
            useCORS: true, backgroundColor: '#ffffff', scale: scale, logging: false,
            ignoreElements: (n) => shouldIgnore(n)
        });
        const ctx = canvas.getContext('2d');
        paintOverlays(ctx, mapEl, { cs: deps.cs, rect: deps.rect, textRect: deps.textRect }, scale);
        const r = deps.rect(mapEl);
        return { dataUrl: canvas.toDataURL('image/png'), w: r.width, h: r.height };
    }

    return { isOverlay, shouldIgnore, paintOverlays, paintTree, rotationOf, capture, colorCss, fontString, OVERLAY_CLASSES, OVERLAY_IDS };
});
