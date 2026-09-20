// src/verificarEmissao.js
// Verificação pública de autenticidade: lê o protocolo (do QR code ou digitado), consulta a função
// verificar_emissao do banco e explica o resultado. Funções puras, testáveis em Node.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.VerificarEmissao = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /** Protocolo no formato AAAAMMDD-XXXXXXXX (aceita minúsculas, espaços e o "#" do documento). */
    function normalizeProtocolo(s) {
        const t = String(s === undefined || s === null ? '' : s).trim().replace(/^#/, '').toUpperCase().replace(/\s+/g, '');
        return /^\d{8}-[0-9A-F]{8}$/.test(t) ? t : null;
    }

    /** Código SHA-256 digitado: aceita os 8 a 64 primeiros caracteres hexadecimais (minúsculas). */
    function normalizeHash(s) {
        const t = String(s === undefined || s === null ? '' : s).trim().toLowerCase().replace(/[…\.\s]+$/g, '').replace(/\s+/g, '');
        return /^[0-9a-f]{8,64}$/.test(t) ? t : null;
    }

    /** Endereço de verificação que vai no QR code (só o protocolo: o QR fica pequeno e legível no papel). */
    function verificationUrl(baseHref, protocolo) {
        const u = new URL('verificar.html', baseHref);
        u.searchParams.set('p', protocolo);
        return u.href;
    }

    function fmtDataHora(iso) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return String(iso);
        const p = (n) => (n < 10 ? '0' : '') + n;
        return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' às ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    /**
     * Resposta da função verificar_emissao (linhas) → resultado para a tela.
     * estado: 'ok' | 'hash-diverge' | 'nao-encontrado' | 'protocolo-invalido'
     */
    function interpretar(protocoloBruto, hashBruto, linhas) {
        const protocolo = normalizeProtocolo(protocoloBruto);
        if (!protocolo) return { estado: 'protocolo-invalido', titulo: 'Protocolo inválido', texto: 'O protocolo deve ter o formato AAAAMMDD-XXXXXXXX (exemplo: 20260920-7F83B165).' };
        const hash = hashBruto ? normalizeHash(hashBruto) : null;
        if (hashBruto && !hash) return { estado: 'protocolo-invalido', titulo: 'Código SHA-256 inválido', texto: 'Digite de 8 a 64 caracteres hexadecimais (0-9 e a-f) do código impresso no rodapé.' };
        const r = Array.isArray(linhas) && linhas.length ? linhas[0] : null;
        if (!r || !r.encontrado) {
            return { estado: 'nao-encontrado', protocolo: protocolo, titulo: 'Protocolo não encontrado', texto: 'Não há emissão registrada com o protocolo ' + protocolo + '. O documento pode não ter sido emitido por este sistema, ou o protocolo foi digitado errado.' };
        }
        const quando = fmtDataHora(r.emitido_em);
        const formato = r.formato === 'word' ? 'exportação para Word' : (r.formato === 'impressao' ? 'impressão/PDF' : 'emissão');
        if (hash && r.hash_confere === false) {
            return { estado: 'hash-diverge', protocolo: protocolo, titulo: 'Código SHA-256 não confere', texto: 'O protocolo ' + protocolo + ' existe (' + formato + ' em ' + quando + '), mas o código SHA-256 informado é diferente do registrado. O conteúdo do documento pode ter sido alterado depois da emissão.' };
        }
        return {
            estado: 'ok', protocolo: protocolo,
            titulo: hash ? 'Documento autêntico' : 'Protocolo registrado',
            texto: 'O protocolo ' + protocolo + ' foi registrado pelo sistema (' + formato + ' em ' + quando + ').' + (hash ? ' O código SHA-256 informado confere com o registrado.' : ' Informe também o código SHA-256 do rodapé para confirmar que o conteúdo não foi alterado.')
        };
    }

    return { normalizeProtocolo, normalizeHash, verificationUrl, interpretar, fmtDataHora };
});
