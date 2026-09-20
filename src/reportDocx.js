// src/reportDocx.js
// ARQUIVO .DOCX DO RELATÓRIO, com rodapé de verdade (data, SHA-256, QR code e "Página X de Y" em toda folha).
// O HTML da folha (em MHTML, com as imagens dentro) entra no documento como um "altChunk", que o Word converte ao
// abrir; o papel, as margens e o rodapé são escritos em OOXML — sem depender das marcações do Word para HTML,
// que repetiam o rodapé no fim do texto.
// Inclui um gerador de ZIP mínimo (sem compressão) e um leitor, para não depender de bibliotecas nem da internet.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReportDocx = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ------------------------------------------------------------------ bytes
    function utf8(s) { return new TextEncoder().encode(String(s)); }

    function b64ToBytes(b64) {
        const clean = String(b64).replace(/\s+/g, '');
        if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(clean, 'base64'));
        const bin = atob(clean);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    // ------------------------------------------------------------------ ZIP (método "store")
    let CRC_TABLE = null;
    function crc32(bytes) {
        if (!CRC_TABLE) {
            CRC_TABLE = new Uint32Array(256);
            for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
        }
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    /** files: [{ name, data: Uint8Array | string }] → Uint8Array (.zip sem compressão). */
    function zip(files) {
        const parts = [];
        const central = [];
        let offset = 0;
        const DOS_TIME = (12 << 11), DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // data fixa: o arquivo é reprodutível
        const u16 = (n) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF]);
        const u32 = (n) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]);
        const cat = (arrs) => { const len = arrs.reduce((s, a) => s + a.length, 0); const out = new Uint8Array(len); let o = 0; arrs.forEach(a => { out.set(a, o); o += a.length; }); return out; };
        files.forEach(f => {
            const name = utf8(f.name);
            const data = typeof f.data === 'string' ? utf8(f.data) : f.data;
            const crc = crc32(data);
            const local = cat([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(DOS_TIME), u16(DOS_DATE), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);
            central.push(cat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(DOS_TIME), u16(DOS_DATE), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
            parts.push(local);
            offset += local.length;
        });
        const cd = cat(central);
        const end = cat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0)]);
        return cat(parts.concat([cd, end]));
    }

    /** Lê um ZIP sem compressão gerado por zip(): devolve { nome: Uint8Array }. (Usado nos testes.) */
    function unzip(bytes) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let end = bytes.length - 22;
        while (end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end--;
        if (end < 0) throw new Error('ZIP inválido');
        const count = dv.getUint16(end + 10, true);
        let p = dv.getUint32(end + 16, true);
        const out = {};
        for (let i = 0; i < count; i++) {
            if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('diretório central inválido');
            const method = dv.getUint16(p + 10, true);
            const crc = dv.getUint32(p + 16, true);
            const size = dv.getUint32(p + 24, true);
            const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
            const off = dv.getUint32(p + 42, true);
            const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
            const lnlen = dv.getUint16(off + 26, true), lelen = dv.getUint16(off + 28, true);
            const start = off + 30 + lnlen + lelen;
            if (method !== 0) throw new Error('método de compressão não suportado');
            const data = bytes.subarray(start, start + size);
            if (crc32(data) !== crc) throw new Error('CRC inválido em ' + name);
            out[name] = data;
            p += 46 + nlen + elen + clen;
        }
        return out;
    }

    // ------------------------------------------------------------------ OOXML
    function xmlEsc(s) {
        return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const MM_TO_TWIP = 1440 / 25.4;
    const PX_TO_EMU = 9525;
    const tw = (mm) => Math.round(mm * MM_TO_TWIP);

    function contentTypes(hasQr) {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            '<Default Extension="mht" ContentType="message/rfc822"/>' +
            (hasQr ? '<Default Extension="gif" ContentType="image/gif"/><Default Extension="png" ContentType="image/png"/>' : '') +
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
            '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
            '</Types>';
    }

    function rels(items) {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            items.map(i => '<Relationship Id="' + i.id + '" Type="' + i.type + '" Target="' + i.target + '"/>').join('') + '</Relationships>';
    }

    function documentXml(page, margins) {
        const land = page.heightMm < page.widthMm;
        // no OOXML a folha em paisagem é declarada com largura maior que a altura e orient="landscape"
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<w:document xmlns:w="' + NS_W + '" xmlns:r="' + NS_R + '"><w:body>' +
            '<w:altChunk r:id="rIdHtml"/>' +
            '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>' +
            '<w:pgSz w:w="' + tw(page.widthMm) + '" w:h="' + tw(page.heightMm) + '"' + (land ? ' w:orient="landscape"' : '') + '/>' +
            '<w:pgMar w:top="' + tw(margins.top) + '" w:right="' + tw(margins.right) + '" w:bottom="' + tw(margins.bottom) + '" w:left="' + tw(margins.left) + '" w:header="567" w:footer="454" w:gutter="0"/>' +
            '</w:sectPr></w:body></w:document>';
    }

    function run(text, o) {
        o = o || {};
        return '<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' + (o.bold ? '<w:b/>' : '') +
            '<w:color w:val="' + (o.color || '64748B') + '"/><w:sz w:val="' + (o.size || 16) + '"/></w:rPr><w:t xml:space="preserve">' + xmlEsc(text) + '</w:t></w:r>';
    }

    function field(instr, sample, o) {
        return '<w:fldSimple w:instr=" ' + instr + ' ">' + run(sample, o) + '</w:fldSimple>';
    }

    /**
     * Rodapé da folha. footer = { data: 'Emitido em ...', hash: '...', hashFull, mostrarHash, mostrarData, mostrarQr, mostrarPaginas, qr: bytes|null }
     * A linha: [data] [SHA-256] ⇥ [QR] Página X de Y  (tabulação à direita na largura útil)
     */
    function footerXml(footer, page, margins) {
        const larguraUtil = tw(page.widthMm - margins.left - margins.right);
        const cel = [];
        if (footer.mostrarData !== false && footer.data) cel.push(run(footer.data + '  '));
        if (footer.mostrarHash !== false && footer.hash) cel.push(run('SHA-256: ', { bold: true, color: '334155' }) + run(footer.hash, { bold: true, color: '334155' }));
        cel.push('<w:r><w:tab/></w:r>');
        if (footer.mostrarQr !== false && footer.qr) {
            const emu = 40 * PX_TO_EMU;
            cel.push('<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + emu + '" cy="' + emu + '"/><wp:docPr id="1" name="QR de verificação" descr="QR code de verificação de autenticidade"/>' +
                '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
                '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="qr"/><pic:cNvPicPr/></pic:nvPicPr>' +
                '<pic:blipFill><a:blip r:embed="rIdQr"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
                '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + emu + '" cy="' + emu + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>');
        }
        if (footer.mostrarPaginas !== false) {
            cel.push(run('  Página ', { bold: true, color: '334155' }) + field('PAGE', '1', { bold: true, color: '334155' }) + run(' de ', { bold: true, color: '334155' }) + field('NUMPAGES', '1', { bold: true, color: '334155' }));
        }
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<w:ftr xmlns:w="' + NS_W + '" xmlns:r="' + NS_R + '" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
            '<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="CBD5E1"/></w:pBdr>' +
            '<w:tabs><w:tab w:val="clear" w:pos="4680"/><w:tab w:val="clear" w:pos="9360"/><w:tab w:val="right" w:pos="' + larguraUtil + '"/></w:tabs>' +
            '<w:spacing w:before="0" w:after="0"/></w:pPr>' + cel.join('') + '</w:p></w:ftr>';
    }

    /**
     * opts: { mhtml, page: {widthMm, heightMm}, margins: {top,right,bottom,left} (mm), footer }
     * Devolve os bytes do .docx.
     */
    function build(opts) {
        const page = opts.page || { widthMm: 210, heightMm: 297 };
        const m = Object.assign({ top: 15, bottom: 15, left: 15, right: 15 }, opts.margins || {});
        const footer = opts.footer || {};
        const qr = footer.mostrarQr !== false && footer.qr ? footer.qr : null;
        const files = [
            { name: '[Content_Types].xml', data: contentTypes(!!qr) },
            { name: '_rels/.rels', data: rels([{ id: 'rId1', type: REL + '/officeDocument', target: 'word/document.xml' }]) },
            { name: 'word/document.xml', data: documentXml(page, m) },
            { name: 'word/_rels/document.xml.rels', data: rels([
                { id: 'rIdHtml', type: REL + '/aFChunk', target: 'afchunk.mht' },
                { id: 'rIdFooter', type: REL + '/footer', target: 'footer1.xml' }]) },
            { name: 'word/afchunk.mht', data: opts.mhtml },
            { name: 'word/footer1.xml', data: footerXml(Object.assign({}, footer, { qr: qr }), page, m) }
        ];
        if (qr) {
            const ext = footer.qrExt || 'gif';
            files.push({ name: 'word/_rels/footer1.xml.rels', data: rels([{ id: 'rIdQr', type: REL + '/image', target: 'media/qr.' + ext }]) });
            files.push({ name: 'word/media/qr.' + ext, data: qr });
        }
        return zip(files);
    }

    return { build, zip, unzip, crc32, footerXml, documentXml, contentTypes, b64ToBytes, utf8, xmlEsc };
});
