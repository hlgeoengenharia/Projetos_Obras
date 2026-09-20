// src/reportExport.js
// EMISSÃO E EXPORTAÇÃO DO RELATÓRIO (funções puras, testáveis em Node):
//  - hash SHA-256 do conteúdo e protocolo de emissão;
//  - documento do Word (HTML) e empacotamento MHTML com as imagens dos mapas embutidas.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReportExport = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ------------------------------------------------------------------ hash e protocolo
    /** JSON estável: chaves ordenadas, sem espaços — o mesmo conteúdo sempre gera o mesmo texto. */
    function stableStringify(v) {
        if (v === undefined) return 'null';
        if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
        if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
        return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
    }

    /**
     * Conteúdo que o hash garante: modelo, feição (dados e geometria), o que o usuário ajustou no mapa e os
     * textos editados na folha. NÃO entra a hora da emissão (o mesmo conteúdo dá o mesmo hash).
     */
    function buildHashContent(parts) {
        parts = parts || {};
        const t = parts.template || {};
        return stableStringify({
            v: 1,
            modelo: { id: t.id || null, nome: t.nome || null, config_pagina: t.config_pagina || null, blocos: t.blocos || [] },
            feicao: { chave: parts.featureKey || null, dados: parts.featureData || {}, geometria: parts.geometry || null },
            mapa: parts.mapa || null,
            temporal: parts.temporal || null,
            textos: Array.isArray(parts.textos) ? parts.textos : []
        });
    }

    async function sha256Hex(text, cryptoImpl) {
        const c = cryptoImpl || (typeof crypto !== 'undefined' ? crypto : null);
        if (!c || !c.subtle) throw new Error('SHA-256 indisponível neste navegador (é preciso HTTPS ou localhost)');
        const buf = await c.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /** Protocolo: AAAAMMDD-XXXXXXXX (data da emissão + 8 primeiros caracteres do hash, em maiúsculas). */
    function makeProtocol(hashHex, date) {
        const d = date || new Date();
        const p = (n) => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + String(hashHex).slice(0, 8).toUpperCase();
    }

    // ------------------------------------------------------------------ HTML → Word (mapas como imagem, grades como tabela)
    /** Fim do <div> que abre em 'start' (conta divs aninhados). */
    function divEnd(html, start) {
        const re = /<div\b|<\/div>/g;
        re.lastIndex = start;
        let depth = 0, m;
        while ((m = re.exec(html))) {
            if (m[0] === '</div>') { depth--; if (depth === 0) return m.index + 6; } else depth++;
        }
        return -1;
    }

    /** Intervalo [inicio, fim) do <div id="..."> no HTML, ou null. */
    function findDivById(html, id) {
        const safe = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m = new RegExp('<div\\b[^>]*\\bid="' + safe + '"[^>]*>').exec(html);
        if (!m) return null;
        const end = divEnd(html, m.index);
        return end < 0 ? null : { start: m.index, end: end };
    }

    function replaceDivById(html, id, replacement) {
        const r = findDivById(html, id);
        return r ? html.slice(0, r.start) + replacement + html.slice(r.end) : html;
    }

    function imageTag(cap) {
        const w = Math.round(cap.w || 0), h = Math.round(cap.h || 0);
        return '<img src="' + cap.dataUrl + '"' + (w ? ' width="' + w + '"' : '') + (h ? ' height="' + h + '"' : '') + ' style="max-width:100%;height:auto;display:block" />';
    }

    /** Filhos diretos (<div>...</div>) de um trecho HTML. */
    function directDivChildren(inner) {
        const out = [];
        let i = 0;
        while (i < inner.length) {
            const s = inner.indexOf('<div', i);
            if (s < 0) break;
            const e = divEnd(inner, s);
            if (e < 0) break;
            out.push(inner.slice(s, e));
            i = e;
        }
        return out;
    }

    /** As fileiras em grade (quadros da análise temporal) viram tabelas: o Word não entende CSS grid. */
    function gridRowsToTables(html) {
        let out = html, from = 0;
        for (;;) {
            const m = /<div\b[^>]*class="[^"]*report-trow[^"]*"[^>]*>/.exec(out.slice(from));
            if (!m) break;
            const start = from + m.index;
            const end = divEnd(out, start);
            if (end < 0) break;
            const inner = out.slice(start + m[0].length, end - 6);
            const kids = directDivChildren(inner);
            const w = kids.length ? Math.floor(100 / kids.length) : 100;
            const table = '<table style="width:100%;border:0;border-collapse:collapse"><tr>' + kids.map(k => '<td valign="top" style="width:' + w + '%;border:0;padding:0 3pt">' + k + '</td>').join('') + '</tr></table>';
            out = out.slice(0, start) + table + out.slice(end);
            from = start + table.length;
        }
        return out;
    }

    /**
     * Corpo do Word: cada mapa (por id) vira a imagem capturada; o que não pôde ser capturado vira um aviso.
     * captures: { idDoElemento: { dataUrl, w, h } | null }
     */
    function prepareWordBody(html, captures) {
        let out = String(html);
        Object.keys(captures || {}).forEach(id => {
            const cap = captures[id];
            out = replaceDivById(out, id, cap && cap.dataUrl ? imageTag(cap) : '<p style="color:#b45309;font-size:9pt">[Mapa: não foi possível gerar a imagem]</p>');
        });
        return gridRowsToTables(out);
    }

    // ------------------------------------------------------------------ Word
    function escapeHtml(s) {
        return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /** Limpa o HTML da folha para o Word: sem ícones de fonte, sem edição, sem elementos só da tela. */
    function cleanForWord(html) {
        return String(html)
            .replace(/<span[^>]*material-symbols-outlined[^>]*>[^<]*<\/span>/g, '')
            .replace(/\scontenteditable="[^"]*"/g, '')
            .replace(/\sondblclick="[^"]*"/g, '')
            .replace(/\sonclick="[^"]*"/g, '');
    }

    const MM_TO_PT = 72 / 25.4;

    /** Documento HTML do Word (papel A4 ou A3, retrato ou paisagem, margens em mm). */
    function wordDocumentHtml(opts) {
        const pd = opts.page || { widthMm: 210, heightMm: 297 };
        const m = opts.margins || { top: 15, bottom: 15, left: 15, right: 15 };
        const w = (pd.widthMm * MM_TO_PT).toFixed(1);
        const h = (pd.heightMm * MM_TO_PT).toFixed(1);
        const orient = pd.heightMm < pd.widthMm ? 'landscape' : 'portrait';
        return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>${escapeHtml(opts.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
@page Section1 { size: ${w}pt ${h}pt; mso-page-orientation: ${orient}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; mso-header-margin: 35.4pt; mso-footer-margin: 35.4pt; mso-paper-source: 0; }
div.Section1 { page: Section1; }
body { font-family: 'Arial', sans-serif; font-size: 11pt; color: #111827; }
table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; }
th, td { border: 1px solid #cbd5e1; padding: 6pt; font-size: 10pt; }
th { background-color: #f1f5f9; font-weight: bold; }
h1, h2, h3 { color: #0f172a; }
.report-tframe-title { background: #0f172a; color: #ffffff; font: bold 9pt Arial; padding: 2pt 5pt; }
img { max-width: 100%; }
</style>
</head>
<body>
<div class="Section1">
${cleanForWord(opts.bodyHtml)}
</div>
</body>
</html>`;
    }

    // ------------------------------------------------------------------ MHTML (Word abre com as imagens dentro do arquivo)
    /**
     * Troca cada <img src="data:image/...;base64,..."> por uma referência local e devolve as imagens à parte.
     * O Word não exibe imagens "data:" de forma confiável; em MHTML elas viram partes do próprio arquivo.
     */
    function extractDataImages(html) {
        const images = [];
        const out = String(html).replace(/(<img\b[^>]*?\ssrc=")data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)(")/g, (m, pre, type, b64, post) => {
            const ext = type.split('/')[1].replace('jpeg', 'jpg').replace(/\+.*/, '');
            const name = 'imagem' + (images.length + 1) + '.' + ext;
            images.push({ name, contentType: type, base64: b64.replace(/\s+/g, '') });
            return pre + 'file:///C:/relatorio_arquivos/' + name + post;
        });
        return { html: out, images };
    }

    function wrapBase64(b64) {
        return b64.replace(/(.{76})/g, '$1\r\n');
    }

    /** Monta o arquivo MHTML (multipart/related): HTML + imagens. */
    function buildMhtml(html, images, boundary) {
        const b = boundary || ('----=_Relatorio_' + Math.random().toString(36).slice(2, 12));
        const utf8 = (s) => {
            const bytes = new TextEncoder().encode(s);
            let bin = '';
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            return typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
        };
        let out = 'MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="' + b + '"; type="text/html"\r\n\r\n';
        out += '--' + b + '\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\nContent-Location: file:///C:/relatorio_arquivos/documento.html\r\n\r\n';
        out += wrapBase64(utf8(html)) + '\r\n\r\n';
        (images || []).forEach(img => {
            out += '--' + b + '\r\nContent-Type: ' + img.contentType + '\r\nContent-Transfer-Encoding: base64\r\nContent-Location: file:///C:/relatorio_arquivos/' + img.name + '\r\n\r\n';
            out += wrapBase64(img.base64) + '\r\n\r\n';
        });
        out += '--' + b + '--\r\n';
        return out;
    }

    /** Do HTML do Word (com imagens data:) ao arquivo MHTML pronto para baixar como .doc */
    function toWordMhtml(wordHtml) {
        const ex = extractDataImages(wordHtml);
        return buildMhtml(ex.html, ex.images);
    }

    return { divEnd, findDivById, replaceDivById, directDivChildren, gridRowsToTables, prepareWordBody, stableStringify, buildHashContent, sha256Hex, makeProtocol, cleanForWord, wordDocumentHtml, extractDataImages, buildMhtml, toWordMhtml, escapeHtml };
});
