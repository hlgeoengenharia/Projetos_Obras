// src/fieldFormatter.js
// FORMATADOR ÚNICO DE VALORES DE CAMPO — decide SEMPRE pelo TIPO do campo (field.type),
// nunca por adivinhação em nome, rótulo ou id.
//
// Espelha o que o card da feição (customFields.js, modo leitura) exibe, mas sem depender de DOM,
// para servir ao relatório A4 (visualizador, construtor, Word) e aos testes em Node.
//
// Formatos de armazenamento (o que o formulário grava em `propriedades[field.id]`):
//   text/number/select/textarea/current_user/current_date → string
//   date                → 'YYYY-MM-DD'
//   currency/area_m2/length_m/volume_m3 → '1.234,56' (BR) ou '720.62' (cru)
//   cpfcnpj/ipl/ipf/epol/rip/insc_imob_cabedelo/pa_anpp_ap → string (com ou sem máscara)
//   epol_1n/rip_1n      → JSON de array de strings
//   cep                 → JSON {cep, logradouro, numero, complemento, bairro, cidade, uf}
//   hiperlink           → JSON {title, number, url} (ou URL crua)
//   hiperlink_1n        → JSON de array de {title, number, url}
//   photo/attachment    → JSON de array de {name, url, title, uploadedBy, uploadedAt, deleted}
//   geolocation         → JSON {lat, lng} ou 'lat, lng'
//
// Todas as funções são idempotentes: aceitam o valor cru ou já mascarado.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.FieldFormatter = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const EMPTY = '—';

    // ---------------------------------------------------------------- utilitários
    function escapeHtml(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function digitsOf(v) {
        return String(v === null || v === undefined ? '' : v).replace(/\D/g, '');
    }

    /** Vazio: null, undefined, '', 'null', 'undefined', '[]', '{}', array/objeto sem conteúdo. */
    function isEmptyValue(v) {
        if (v === null || v === undefined) return true;
        if (typeof v === 'string') {
            const s = v.trim();
            return s === '' || s === 'null' || s === 'undefined' || s === '[]' || s === '{}';
        }
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === 'object') return Object.keys(v).length === 0;
        return false;
    }

    /** Converte JSON em texto para objeto/array; devolve o valor original se não for JSON válido. */
    function parseMaybeJson(v) {
        if (typeof v !== 'string') return v;
        const s = v.trim();
        if (s.startsWith('[') || s.startsWith('{')) {
            try { return JSON.parse(s); } catch (e) { /* segue como texto */ }
        }
        return v;
    }

    /** Mesma leitura numérica do card: '1.234,56' (BR) ou '720.62' (cru). */
    function parseLocalNumber(v) {
        const s = String(v).trim();
        if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
        return parseFloat(s);
    }

    function formatNumber(n) {
        return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    }

    // ---------------------------------------------------------------- tipo canônico
    /**
     * Tipo do campo. Reproduz apenas a compatibilidade legada do card (campo de tipo 'text'
     * cujo NOME ou RÓTULO é exatamente 'epol' / 'rip' etc.); nada de busca parcial.
     */
    function canonicalType(field) {
        const t = String((field && field.type) || 'text').toLowerCase().trim();
        if (t !== 'text') return t;
        const name = String((field && field.name) || '').toLowerCase().trim();
        const label = String((field && field.label) || '').toLowerCase().trim();
        if (name === 'epol' || label === 'epol') return 'epol';
        if (name === 'epol_1n' || label === 'epol (1:n)') return 'epol_1n';
        if (name === 'rip' || label === 'rip') return 'rip';
        if (name === 'rip_1n' || label === 'rip (1:n)') return 'rip_1n';
        return 'text';
    }

    // ---------------------------------------------------------------- máscaras (idempotentes)
    const masks = {
        cpfcnpj(v) {
            const d = digitsOf(v);
            if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
            return String(v);
        },
        cep(v) {
            const d = digitsOf(v);
            return d.length === 8 ? d.replace(/^(\d{5})(\d{3})/, '$1-$2') : String(v);
        },
        /** IPL/IPF no padrão CNJ (20 dígitos): 0000000-00.0000.0.00.0000 */
        ipl(v) {
            const d = digitsOf(v);
            if (d.length >= 20) {
                return d.substring(d.length - 20)
                    .replace(/(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})/, '$1-$2.$3.$4.$5.$6');
            }
            return String(v);
        },
        epol(v) {
            const d = digitsOf(v).substring(0, 11);
            if (d.length === 0) return '';
            return d.length > 4 ? d.substring(0, 4) + '.' + d.substring(4) : d;
        },
        rip(v) {
            const d = digitsOf(v).substring(0, 13);
            if (d.length === 0) return '';
            return d.length > 11 ? d.substring(0, 11) + '-' + d.substring(11) : d;
        },
        inscImobCabedelo(v) {
            const d = digitsOf(v);
            if (d.length === 19) {
                return d.replace(/(\d{1})(\d{4})(\d{3})(\d{2})(\d{4})(\d{4})(\d{1})/, '$1.$2.$3.$4.$5.$6.$7');
            }
            return String(v);
        },
        /** PA/ANPP/AP: 1.22.333.444444/5555-66 (máscara progressiva, como na digitação). */
        paAnppAp(v) {
            let d = digitsOf(v).substring(0, 18);
            if (d.length === 0) return '';
            d = d.replace(/^(\d{1})(\d)/, '$1.$2');
            d = d.replace(/^(\d{1})\.(\d{2})(\d)/, '$1.$2.$3');
            d = d.replace(/^(\d{1})\.(\d{2})\.(\d{3})(\d)/, '$1.$2.$3.$4');
            d = d.replace(/^(\d{1})\.(\d{2})\.(\d{3})\.(\d{6})(\d)/, '$1.$2.$3.$4/$5');
            d = d.replace(/^(\d{1})\.(\d{2})\.(\d{3})\.(\d{6})\/(\d{4})(\d)/, '$1.$2.$3.$4/$5-$6');
            return d;
        }
    };

    // ---------------------------------------------------------------- leitores estruturados
    /** Lista de anexos/fotos ainda válidos (descarta os marcados como excluídos). */
    function parseFiles(value) {
        let arr = parseMaybeJson(value);
        if (typeof arr === 'string') arr = arr.trim() ? [arr] : [];
        if (!Array.isArray(arr)) arr = arr && typeof arr === 'object' ? [arr] : [];
        return arr
            .map(item => (typeof item === 'string' ? { url: item, name: 'Arquivo', title: '' } : item))
            .filter(item => item && typeof item === 'object' && !item.deleted && item.url);
    }

    function normalizeUrl(url) {
        const u = String(url || '').trim();
        if (!u) return '';
        if (/^https?:\/\//i.test(u)) return u;
        // Qualquer outro esquema (javascript:, data:, file: ...) é descartado por segurança
        if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';
        return 'https://' + u.replace(/^\/+/, '');
    }

    function parseLink(value) {
        const parsed = parseMaybeJson(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return {
                title: String(parsed.title || '').trim(),
                number: String(parsed.number || '').trim(),
                url: String(parsed.url || '').trim()
            };
        }
        return { title: '', number: '', url: String(parsed || '').trim() };
    }

    function parseLinks(value) {
        let arr = parseMaybeJson(value);
        if (!Array.isArray(arr)) arr = arr && typeof arr === 'object' ? [arr] : [];
        return arr.filter(x => x && typeof x === 'object').map(parseLink)
            .filter(l => l.url || l.title || l.number);
    }

    function parseCep(value) {
        const parsed = parseMaybeJson(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        return null;
    }

    function parseGeolocation(value, fallback) {
        let lat = null, lng = null;
        const parsed = parseMaybeJson(value);
        if (parsed && typeof parsed === 'object' && parsed.lat !== undefined && parsed.lng !== undefined) {
            lat = parseFloat(parsed.lat); lng = parseFloat(parsed.lng);
        } else if (typeof parsed === 'string' && parsed.trim()) {
            const parts = parsed.split(',').map(p => parseFloat(p.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) { lat = parts[0]; lng = parts[1]; }
        }
        if ((lat === null || isNaN(lat) || lng === null || isNaN(lng)) && fallback) {
            lat = parseFloat(fallback.lat); lng = parseFloat(fallback.lng);
        }
        if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) return null;
        return { lat, lng };
    }

    function formatDMS(lat, lng) {
        const conv = (v, pos, neg) => {
            const hemi = v >= 0 ? pos : neg;
            const a = Math.abs(v);
            const d = Math.floor(a);
            const m = Math.floor((a - d) * 60);
            const s = ((a - d) * 60 - m) * 60;
            return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(1).padStart(4, '0')}"${hemi}`;
        };
        return `${conv(lat, 'N', 'S')} ${conv(lng, 'E', 'W')}`;
    }

    function formatDate(value) {
        const s = String(value).trim();
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
        if (m) return `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` ${m[4]}:${m[5]}` : '');
        return s;
    }

    function formatCepText(cep) {
        const parts = [];
        if (cep.logradouro) {
            let line = String(cep.logradouro).trim();
            const numero = String(cep.numero || '').trim();
            if (numero) line += /^s\/?n$/i.test(numero) ? ', S/N' : `, nº ${numero}`;
            if (String(cep.complemento || '').trim()) line += ` (${String(cep.complemento).trim()})`;
            parts.push(line);
        }
        if (String(cep.bairro || '').trim()) parts.push(String(cep.bairro).trim());
        const city = [cep.cidade, cep.uf].map(x => String(x || '').trim()).filter(Boolean);
        if (city.length) parts.push(city.join(' - '));
        if (String(cep.cep || '').trim()) parts.push('CEP: ' + masks.cep(cep.cep));
        return parts.join(' - ');
    }

    function linkLabel(link) {
        const base = link.title || link.url;
        return link.number ? `${base} - ${link.number}` : base;
    }

    // ---------------------------------------------------------------- fotos e anexos: Lista x Imagem
    const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg|avif)$/i;

    function isImageFile(file) {
        const clean = (s) => String(s || '').split('?')[0].split('#')[0];
        return IMAGE_EXT.test(clean(file.name)) || IMAGE_EXT.test(clean(file.url)) || /^image\//i.test(String(file.type || ''));
    }

    /** Modo padrão: foto → imagem na íntegra; anexo → lista (título + nome do arquivo). */
    function defaultFileMode(type) {
        return type === 'photo' ? 'imagem' : 'lista';
    }

    /** Legenda da imagem: título, nome do arquivo, quem enviou e quando (cada item pode ser desligado em meta). */
    function fileMetaHtml(file, meta) {
        const m = meta || {};
        const parts = [];
        const title = String(file.title || '').trim();
        const name = String(file.name || '').trim();
        if (m.titulo !== false && title) parts.push('<div style="font-weight:700">' + escapeHtml(title) + '</div>');
        if (m.arquivo !== false && name && (m.titulo === false || !title || name !== title)) {
            parts.push('<div style="font-family:monospace;font-size:9px">' + escapeHtml(name) + '</div>');
        }
        const author = String(file.uploadedBy || '').trim();
        // "Usuário (Você)" e "Usuário Local" são valores provisórios do envio, sem significado no relatório
        if (m.autor !== false && author && !/^usu[aá]rio\s*(\(voc[eê]\)|local)$/i.test(author)) {
            parts.push('<div>Enviado por: ' + escapeHtml(author) + '</div>');
        }
        if (m.data !== false && file.uploadedAt) {
            const d = new Date(file.uploadedAt);
            if (!isNaN(d.getTime())) parts.push('<div>' + escapeHtml(d.toLocaleString('pt-BR')) + '</div>');
        }
        return parts.join('');
    }

    function fileListItemHtml(file) {
        const href = normalizeUrl(file.url);
        const name = escapeHtml(file.title || file.name || 'Arquivo');
        const title = href
            ? '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer"><strong>' + name + '</strong></a>'
            : '<strong>' + name + '</strong>';
        const fileName = (file.title && file.name && file.title !== file.name) ? '<br><span>' + escapeHtml(file.name) + '</span>' : '';
        return '<div class="ff-link" style="margin:0 0 3px 0">' + title + fileName + '</div>';
    }

    /**
     * Fotos/anexos em HTML. mode 'lista': título + nome do arquivo (um por linha).
     * mode 'imagem': a imagem na íntegra com legenda (título e metadados); arquivos que não são
     * imagem (PDF, DOC...) continuam como item de lista.
     */
    function filesHtml(files, mode, meta) {
        if (!files.length) return EMPTY;
        if (mode !== 'imagem') return files.map(fileListItemHtml).join('');
        const cells = files.map(file => {
            const href = normalizeUrl(file.url);
            if (!href || !isImageFile(file)) return '<div style="grid-column:1/-1">' + fileListItemHtml(file) + '</div>';
            const caption = fileMetaHtml(file, meta);
            return '<figure class="ff-figure" style="margin:0;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;background:#fff;page-break-inside:avoid">'
                + '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer" style="display:block;background:#f1f5f9">'
                + '<img src="' + escapeHtml(href) + '" alt="' + escapeHtml(file.title || file.name || '') + '" style="display:block;width:100%;height:auto;max-height:260px;object-fit:contain"></a>'
                + (caption ? '<figcaption style="padding:4px 6px;font-size:9.5px;line-height:1.35;color:#475569">' + caption + '</figcaption>' : '')
                + '</figure>';
        }).join('');
        return '<div class="ff-files" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px">' + cells + '</div>';
    }

    // ---------------------------------------------------------------- texto puro
    /**
     * Valor formatado em TEXTO PURO (tabelas, Word, PDF).
     * opts.geometryCenter: {lat, lng} — usado por 'geolocation' quando o valor não foi gravado.
     */
    function toText(value, field, opts) {
        opts = opts || {};
        const type = canonicalType(field);

        if (type === 'geolocation') {
            const g = parseGeolocation(value, opts.geometryCenter);
            return g ? `${g.lat.toFixed(6)}, ${g.lng.toFixed(6)}` : EMPTY;
        }
        if (isEmptyValue(value)) return EMPTY;

        if (typeof value === 'boolean') return value ? 'Sim' : 'Não';

        switch (type) {
            case 'photo': {
                const n = parseFiles(value).length;
                return n ? `${n} foto(s)` : EMPTY;
            }
            case 'attachment': {
                const n = parseFiles(value).length;
                return n ? `${n} anexo(s)` : EMPTY;
            }
            case 'hiperlink': {
                const l = parseLink(value);
                return (l.url || l.title || l.number) ? linkLabel(l) : EMPTY;
            }
            case 'hiperlink_1n': {
                const links = parseLinks(value);
                return links.length ? links.map(linkLabel).join('; ') : EMPTY;
            }
            case 'cep': {
                const cep = parseCep(value);
                if (!cep) return String(value).trim();
                return formatCepText(cep) || EMPTY;
            }
            case 'cpfcnpj': return masks.cpfcnpj(String(value).trim());
            case 'ipl':
            case 'ipf': return masks.ipl(String(value).trim());
            case 'insc_imob_cabedelo': return masks.inscImobCabedelo(String(value).trim());
            case 'pa_anpp_ap': return masks.paAnppAp(String(value).trim()) || EMPTY;
            case 'epol':
                return masks.epol(String(value)) || EMPTY;
            case 'rip':
                return masks.rip(String(value)) || EMPTY;
            case 'epol_1n':
            case 'rip_1n': {
                let arr = parseMaybeJson(value);
                if (!Array.isArray(arr)) arr = [arr];
                const fn = type === 'epol_1n' ? masks.epol : masks.rip;
                const out = arr.map(x => fn(String(x))).filter(Boolean);
                return out.length ? out.join(', ') : EMPTY;
            }
            case 'currency': {
                const n = parseLocalNumber(value);
                return isNaN(n) ? String(value).trim()
                    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
            }
            case 'area_m2':
            case 'length_m':
            case 'volume_m3': {
                const n = parseLocalNumber(value);
                if (isNaN(n)) return String(value).trim();
                const unit = { area_m2: 'm²', length_m: 'm', volume_m3: 'm³' }[type];
                return `${formatNumber(n)} ${unit}`;
            }
            case 'date': return formatDate(value);
            default: break;
        }

        // text, number, select, textarea, current_date, current_user e tipos desconhecidos
        const parsed = parseMaybeJson(value);
        if (Array.isArray(parsed)) {
            const items = parsed.map(x => (x && typeof x === 'object' ? (x.title || x.name || x.number || '') : String(x)))
                .map(x => String(x).trim()).filter(Boolean);
            return items.length ? items.join(', ') : EMPTY;
        }
        if (parsed && typeof parsed === 'object') {
            const items = Object.values(parsed).filter(x => x !== null && typeof x !== 'object')
                .map(x => String(x).trim()).filter(Boolean);
            return items.length ? items.join(' - ') : EMPTY;
        }
        const s = String(value).trim();
        return s === '' ? EMPTY : s;
    }

    // ---------------------------------------------------------------- HTML seguro
    /**
     * Valor formatado em HTML (já escapado): links viram <a>, quebras de linha viram <br>.
     * Só links http/https são clicáveis.
     */
    function toHtml(value, field, opts) {
        opts = opts || {};
        const type = canonicalType(field);

        // Campos de link/anexo (simples ou 1:N) saem NA ÍNTEGRA: título, número e o endereço do link,
        // um bloco por item. Só endereços http/https são clicáveis.
        const linkBlockHtml = (l) => {
            const href = normalizeUrl(l.url);
            const head = [];
            if (l.title) head.push(`<strong>${escapeHtml(l.title)}</strong>`);
            if (l.number) head.push(`<span>${escapeHtml(l.number)}</span>`);
            const urlHtml = l.url
                ? (href
                    ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="word-break:break-all">${escapeHtml(l.url)}</a>`
                    : `<span style="word-break:break-all">${escapeHtml(l.url)}</span>`)
                : '';
            const headHtml = head.join(' - ');
            return `<div class="ff-link" style="margin:0 0 3px 0">${headHtml}${headHtml && urlHtml ? '<br>' : ''}${urlHtml}</div>`;
        };

        if (type !== 'geolocation' && isEmptyValue(value)) return EMPTY;

        switch (type) {
            case 'hiperlink': {
                const l = parseLink(value);
                return (l.url || l.title || l.number) ? linkBlockHtml(l) : EMPTY;
            }
            case 'hiperlink_1n': {
                const links = parseLinks(value);
                return links.length ? links.map(linkBlockHtml).join('') : EMPTY;
            }
            case 'photo':
            case 'attachment':
                return filesHtml(parseFiles(value), opts.fileMode || defaultFileMode(type), opts.fileMeta);
            case 'epol_1n':
            case 'rip_1n':
                return escapeHtml(toText(value, field, opts)).replace(/, /g, '<br>');
            case 'textarea':
                return escapeHtml(toText(value, field, opts)).replace(/\r?\n/g, '<br>');
            default:
                return escapeHtml(toText(value, field, opts));
        }
    }

    return {
        EMPTY,
        escapeHtml,
        isEmptyValue,
        canonicalType,
        masks,
        parseLocalNumber,
        formatNumber,
        formatDate,
        formatDMS,
        normalizeUrl,
        parseFiles,
        isImageFile,
        defaultFileMode,
        filesHtml,
        parseLink,
        parseLinks,
        parseCep,
        parseGeolocation,
        toText,
        toHtml
    };
});
