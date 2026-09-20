// src/reportWord.js
// CONVERSÃO DA FOLHA DA TELA PARA O WORD, mantendo a formatação.
// O Word não conhece CSS externo, Tailwind, flexbox nem grid. Este módulo percorre a folha VIVA (com o layout
// já calculado pelo navegador) e gera HTML que o Word entende: estilos escritos em cada elemento e, no lugar
// de cada flex/grid, uma tabela cujas células reproduzem as posições e larguras reais na tela.
//
// Não depende do DOM global: recebe `env` = { cs(el), rect(el), captures } — testável com uma árvore simulada.
//   cs(el)    → estilo computado (como getComputedStyle)
//   rect(el)  → { left, top, right, bottom, width, height }
//   captures  → { idDoElemento: { dataUrl, w, h } | null }  (mapas já capturados como imagem)

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReportWord = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'noscript', 'button', 'input', 'select', 'textarea', 'svg', 'canvas', 'iframe', 'video', 'audio', 'template']);
    const BLOCK_KEEP = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'sup', 'sub', 'a', 'label', 'small']);
    const TABLE_TAGS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col']);

    function esc(s) {
        return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function px(v) {
        const n = parseFloat(v);
        return isFinite(n) ? n : 0;
    }
    const r1 = (n) => Math.round(n * 10) / 10;

    // ------------------------------------------------------------------ cores
    function parseColor(c) {
        if (!c) return null;
        c = String(c).trim();
        if (c === 'transparent') return null;
        let m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(c);
        if (m) {
            let a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
            if (!(a > 0)) return null;
            // cor translúcida sobre fundo branco (o Word não tem transparência em fundos)
            const mix = (v) => Math.round(Number(v) * a + 255 * (1 - a));
            return [mix(m[1]), mix(m[2]), mix(m[3])];
        }
        m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
        if (m) {
            const h = m[1].length === 3 ? m[1].split('').map(x => x + x).join('') : m[1];
            return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
        }
        return null;
    }
    function hex(rgb) { return '#' + rgb.map(v => (v < 16 ? '0' : '') + v.toString(16)).join(''); }
    function colorHex(c) { const p = parseColor(c); return p ? hex(p) : null; }

    // ------------------------------------------------------------------ estilo em linha
    function fontFamily(ff) {
        const s = String(ff || '').toLowerCase();
        if (/mono|courier|consolas/.test(s)) return "Consolas, 'Courier New', monospace";
        return 'Arial, sans-serif';
    }

    /** Estilo (texto) que o Word entende, a partir do estilo computado. isBlock = pode ter margem/borda de caixa. */
    function inlineStyle(st, opts) {
        opts = opts || {};
        const out = [];
        out.push('font-family:' + fontFamily(st.fontFamily));
        const fs = px(st.fontSize);
        if (fs) out.push('font-size:' + r1(fs * 0.75) + 'pt');
        const fw = st.fontWeight;
        if (fw === 'bold' || px(fw) >= 600) out.push('font-weight:bold');
        if (st.fontStyle === 'italic') out.push('font-style:italic');
        if (/underline/.test(st.textDecorationLine || st.textDecoration || '')) out.push('text-decoration:underline');
        const col = colorHex(st.color);
        if (col) out.push('color:' + col);
        const ta = st.textAlign;
        if (ta === 'center' || ta === 'right' || ta === 'justify') out.push('text-align:' + ta);
        else if (ta === 'end') out.push('text-align:right');
        const lh = px(st.lineHeight);
        if (lh && fs) out.push('line-height:' + r1(lh * 0.75) + 'pt');
        if (st.whiteSpace === 'nowrap') out.push('white-space:nowrap');
        const bg = colorHex(st.backgroundColor);
        if (bg && bg !== '#ffffff') out.push('background:' + bg);
        else if (bg === '#ffffff' && opts.keepWhite) out.push('background:#ffffff');
        // bordas (cada lado) e espaçamentos
        ['top', 'right', 'bottom', 'left'].forEach(side => {
            const w = px(st['border' + cap(side) + 'Width']);
            const style = st['border' + cap(side) + 'Style'];
            const c = colorHex(st['border' + cap(side) + 'Color']);
            if (w > 0 && style && style !== 'none' && style !== 'hidden' && c) out.push('border-' + side + ':' + Math.max(0.5, r1(w * 0.75)) + 'pt ' + (style === 'dashed' || style === 'dotted' ? style : 'solid') + ' ' + c);
        });
        const pad = ['top', 'right', 'bottom', 'left'].map(s => px(st['padding' + cap(s)]));
        if (pad.some(v => v > 0)) out.push('padding:' + pad.map(v => r1(v * 0.75) + 'pt').join(' '));
        if (opts.margins) {
            const mt = px(st.marginTop), mb = px(st.marginBottom);
            if (mt > 0) out.push('margin-top:' + r1(mt * 0.75) + 'pt');
            if (mb > 0) out.push('margin-bottom:' + r1(mb * 0.75) + 'pt');
        }
        if (opts.extra) out.push(opts.extra);
        return out.join(';');
    }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    // ------------------------------------------------------------------ texto
    function textOf(node, st) {
        let t = String(node.nodeValue === undefined || node.nodeValue === null ? '' : node.nodeValue);
        const pre = /pre/.test(st.whiteSpace || '');
        if (!pre) t = t.replace(/\s+/g, ' ');
        if (st.textTransform === 'uppercase') t = t.toUpperCase();
        else if (st.textTransform === 'lowercase') t = t.toLowerCase();
        let h = esc(t);
        if (pre) h = h.replace(/\r?\n/g, '<br>');
        return h;
    }

    function hasClass(el, name) {
        const c = el.className;
        if (typeof c === 'string') return c.split(/\s+/).indexOf(name) >= 0;
        if (c && typeof c.baseVal === 'string') return c.baseVal.split(/\s+/).indexOf(name) >= 0;
        return false;
    }

    /** HTML que só tem marcas (sem texto nem imagem): um ícone removido deixa isso para trás. */
    function visuallyEmpty(html) {
        if (/<img/i.test(html)) return false;
        return String(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';
    }

    // ------------------------------------------------------------------ conversão
    /** Cria o conversor para um ambiente (estilo, retângulo, capturas). */
    function make(env) {
        const cs = env.cs;
        const rect = env.rect;
        const captures = env.captures || {};

        function visibleChildren(el) {
            return Array.prototype.filter.call(el.childNodes || [], n => {
                if (n.nodeType === 3) return true;
                return n.nodeType === 1 && !skipped(n);
            });
        }

        function skipped(el) {
            const tag = String(el.tagName || '').toLowerCase();
            if (SKIP_TAGS.has(tag)) return true;
            if (hasClass(el, 'no-print') || hasClass(el, 'material-symbols-outlined')) return true;
            if (el.id && Object.prototype.hasOwnProperty.call(captures, el.id)) return false;
            const st = cs(el);
            if (st.display === 'none' || st.visibility === 'hidden') return true;
            if (st.position === 'absolute' || st.position === 'fixed') return true;
            return false;
        }

        function nodesHtml(el) {
            const st = cs(el);
            return Array.prototype.map.call(el.childNodes || [], n => {
                if (n.nodeType === 3) return textOf(n, st);
                if (n.nodeType === 1) return node(n);
                return '';
            }).join('');
        }

        function imgHtml(el, st) {
            const r = rect(el);
            const w = Math.round(r.width) || px(el.getAttribute && el.getAttribute('width')) || 0;
            const h = Math.round(r.height) || 0;
            const src = (el.getAttribute && el.getAttribute('src')) || el.src || '';
            if (!src) return '';
            return '<img src="' + esc(src) + '"' + (w ? ' width="' + w + '"' : '') + (h ? ' height="' + h + '"' : '') + ' alt="' + esc((el.getAttribute && el.getAttribute('alt')) || '') + '" />';
        }

        function captureHtml(el, cap) {
            if (!cap || !cap.dataUrl) return '<p style="font-family:Arial;font-size:9pt;color:#b45309">[Mapa: não foi possível gerar a imagem]</p>';
            const r = rect(el);
            const w = Math.round(r.width) || Math.round(cap.w) || 600;
            const h = cap.w ? Math.round(w * cap.h / cap.w) : Math.round(cap.h);
            return '<p style="margin:0"><img src="' + cap.dataUrl + '" width="' + w + '" height="' + h + '" alt="mapa" /></p>';
        }

        /** flex/grid → tabelas: uma por linha visual, células nas posições e larguras reais. */
        function layoutToTable(el, st) {
            const kids = visibleChildren(el).filter(n => n.nodeType === 1 || /\S/.test(n.nodeValue || ''));
            const container = rect(el);
            const bl = px(st.borderLeftWidth), br = px(st.borderRightWidth);
            const innerLeft = container.left + bl + px(st.paddingLeft);
            const innerWidth = Math.max(1, container.width - bl - br - px(st.paddingLeft) - px(st.paddingRight));
            const isColumn = /column/.test(st.flexDirection || '') && st.display.indexOf('flex') >= 0;
            const boxStyle = inlineStyle(st, { margins: true });
            const wrap = (inner) => '<div style="' + esc(boxStyle) + '">' + inner + '</div>';

            if (isColumn || !kids.length) {
                return wrap(kids.map(k => (k.nodeType === 3 ? esc(String(k.nodeValue).replace(/\s+/g, ' ')) : node(k))).join(''));
            }

            // agrupa os filhos em linhas visuais
            const rows = [];
            kids.forEach(k => {
                const r = k.nodeType === 1 ? rect(k) : null;
                if (!r) { const last = rows[rows.length - 1]; if (last) last.items.push({ k: k, r: null }); else rows.push({ items: [{ k: k, r: null }], top: 0, bottom: 0 }); return; }
                const cur = rows[rows.length - 1];
                if (cur && cur.top !== null && r.top < cur.bottom - 2) { cur.items.push({ k: k, r: r }); cur.bottom = Math.max(cur.bottom, r.bottom); cur.top = Math.min(cur.top, r.top); }
                else rows.push({ items: [{ k: k, r: r }], top: r.top, bottom: r.bottom });
            });

            const align = st.alignItems === 'center' ? 'middle' : (/end/.test(st.alignItems || '') ? 'bottom' : 'top');
            let html = '';
            let prevBottom = null;
            rows.forEach(row => {
                if (prevBottom !== null && row.top - prevBottom > 2) {
                    const gap = r1((row.top - prevBottom) * 0.75);
                    html += '<p style="margin:0;height:' + gap + 'pt;line-height:' + gap + 'pt;font-size:1pt">&nbsp;</p>';
                }
                prevBottom = row.bottom;
                let cursor = innerLeft;
                let cells = '';
                let colapsar = false; // depois de um item vazio, o próximo encosta no lugar dele (sem recuo fantasma)
                row.items.forEach(it => {
                    if (!it.r) { cells += '<td valign="' + align + '">' + esc(String(it.k.nodeValue).replace(/\s+/g, ' ')) + '</td>'; return; }
                    const conteudo = node(it.k);
                    if (visuallyEmpty(conteudo)) { colapsar = true; cursor = it.r.right; return; }
                    const gap = colapsar ? 0 : it.r.left - cursor;
                    colapsar = false;
                    if (gap > 4) cells += '<td style="width:' + r1(gap / innerWidth * 100) + '%">&nbsp;</td>';
                    // o que cabia numa linha na tela não pode quebrar no Word (as fontes dele são um pouco mais largas)
                    const linhaUnica = it.r.height <= px(cs(it.k).fontSize) * 1.9;
                    cells += '<td valign="' + align + '" style="width:' + r1(it.r.width / innerWidth * 100) + '%;padding:0' + (linhaUnica ? ';white-space:nowrap' : '') + '">' + conteudo + '</td>';
                    cursor = it.r.right;
                });
                const rest = innerLeft + innerWidth - cursor;
                if (rest > 4) cells += '<td style="width:' + r1(rest / innerWidth * 100) + '%">&nbsp;</td>';
                html += '<table width="100%" style="width:100%;table-layout:fixed;border-collapse:collapse;border:0"><tr>' + cells + '</tr></table>';
            });
            return wrap(html);
        }

        function tableTagHtml(el, tag, st) {
            const attrs = [];
            if (tag === 'td' || tag === 'th') {
                const cs2 = el.getAttribute && el.getAttribute('colspan');
                const rs2 = el.getAttribute && el.getAttribute('rowspan');
                if (cs2) attrs.push('colspan="' + esc(cs2) + '"');
                if (rs2) attrs.push('rowspan="' + esc(rs2) + '"');
                const va = st.verticalAlign;
                if (va === 'middle' || va === 'bottom') attrs.push('valign="' + va + '"');
            }
            let style = inlineStyle(st, { keepWhite: false });
            if (tag === 'table') style += ';border-collapse:collapse;width:100%';
            return '<' + tag + (attrs.length ? ' ' + attrs.join(' ') : '') + ' style="' + esc(style) + '">' + nodesHtml(el) + '</' + tag + '>';
        }

        function node(el) {
            const tag = String(el.tagName || '').toLowerCase();
            if (skipped(el)) return '';
            if (el.id && Object.prototype.hasOwnProperty.call(captures, el.id)) return captureHtml(el, captures[el.id]);
            const st = cs(el);
            if (tag === 'img') return imgHtml(el, st);
            if (tag === 'br') return '<br>';
            if (TABLE_TAGS.has(tag)) return tableTagHtml(el, tag, st);
            if (/flex|grid/.test(st.display || '') && visibleChildren(el).length) return layoutToTable(el, st);
            const inline = /^inline/.test(st.display || '') || ['span', 'b', 'strong', 'i', 'em', 'u', 'a', 'small', 'sup', 'sub', 'label'].indexOf(tag) >= 0;
            const outTag = BLOCK_KEEP.has(tag) ? tag : (inline ? 'span' : 'div');
            const extra = tag === 'a' && el.getAttribute && el.getAttribute('href') ? '' : '';
            const href = tag === 'a' && el.getAttribute && el.getAttribute('href') ? ' href="' + esc(el.getAttribute('href')) + '"' : '';
            return '<' + outTag + href + ' style="' + esc(inlineStyle(st, { margins: !inline, extra: extra })) + '">' + nodesHtml(el) + '</' + outTag + '>';
        }

        return { node: node, nodesHtml: nodesHtml, skipped: skipped };
    }

    // ------------------------------------------------------------------ documento inteiro (folhas → corpo contínuo, cabeçalho uma vez, rodapé do Word)
    function fieldSpan(code, sample) {
        return "<span style='mso-field-code:\" " + code + " \"'><!--[if supportFields]><span style='mso-element:field-begin'></span> " + code +
            " <span style='mso-element:field-separator'></span><![endif]--><span style='mso-no-proof:yes'>" + sample + "</span><!--[if supportFields]><span style='mso-element:field-end'></span><![endif]--></span>";
    }

    /** "Página 01 de 10" → com os campos PAGE e NUMPAGES do Word. */
    function withPageFields(html) {
        return html.replace(/P[áa]gina\s+\d+\s+de\s+\d+/, 'Página ' + fieldSpan('PAGE', '1') + ' de ' + fieldSpan('NUMPAGES', '1'));
    }

    /**
     * root: contêiner das folhas (.a4-page). Devolve { body, header, footer } em HTML para o Word.
     * O cabeçalho da primeira folha entra uma vez no topo; os corpos de todas as folhas viram um fluxo só
     * (o Word refaz as quebras de página); o rodapé vira rodapé do Word com número de página.
     */
    function buildDocument(rootEl, env) {
        const conv = make(env);
        const pages = Array.prototype.filter.call(rootEl.childNodes || [], n => n.nodeType === 1 && hasClass(n, 'a4-page'));
        const findSlot = (page, cls) => Array.prototype.find.call(page.childNodes || [], n => n.nodeType === 1 && hasClass(n, cls));
        let header = '', footer = '';
        const parts = [];
        pages.forEach((page, i) => {
            const h = findSlot(page, 'a4-page-header-slot');
            const b = findSlot(page, 'a4-page-body-slot');
            const f = findSlot(page, 'a4-page-footer-slot');
            if (i === 0 && h) header = conv.nodesHtml(h);
            if (i === 0 && f) footer = withPageFields(conv.nodesHtml(f));
            if (b) parts.push(conv.nodesHtml(b));
        });
        if (!pages.length) parts.push(conv.nodesHtml(rootEl));
        return { header: header, body: parts.join(''), footer: footer };
    }

    /** Documento Word completo (HTML) com cabeçalho, corpo e rodapé; papel/margens vêm de `opts`. */
    function wordFileHtml(opts, parts) {
        const pd = opts.page || { widthMm: 210, heightMm: 297 };
        const m = opts.margins || { top: 15, bottom: 15, left: 15, right: 15 };
        const MM = 72 / 25.4;
        const w = (pd.widthMm * MM).toFixed(1), h = (pd.heightMm * MM).toFixed(1);
        const orient = pd.heightMm < pd.widthMm ? 'landscape' : 'portrait';
        return "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>\n<head>\n<meta charset='utf-8'>\n<title>" + esc(opts.title) + "</title>\n" +
            "<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->\n<style>\n" +
            '@page Section1 { size: ' + w + 'pt ' + h + 'pt; mso-page-orientation: ' + orient + '; margin: ' + m.top + 'mm ' + m.right + 'mm ' + m.bottom + 'mm ' + m.left + 'mm; mso-header-margin: 10mm; mso-footer-margin: 8mm; mso-footer: f1; mso-paper-source: 0; }\n' +
            'div.Section1 { page: Section1; }\nbody { font-family: Arial, sans-serif; font-size: 11pt; color: #111827; }\np { margin: 0; }\ntable { border-collapse: collapse; }\nimg { border: 0; }\n</style>\n</head>\n<body>\n' +
            '<div class="Section1">\n' + (parts.header || '') + '\n' + (parts.body || '') + '\n</div>\n' +
            "<table id=f1 style='mso-element:footer' border=0 cellspacing=0 cellpadding=0 width=\"100%\"><tr><td><div class=MsoFooter style='margin:0'>" + (parts.footer || '') + '</div></td></tr></table>\n</body>\n</html>';
    }

    return { make, buildDocument, wordFileHtml, withPageFields, fieldSpan, inlineStyle, parseColor, colorHex, fontFamily };
});
