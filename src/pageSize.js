// src/pageSize.js
// TAMANHO DA FOLHA DO RELATÓRIO (A4 ou A3, retrato ou paisagem) — fonte única para o construtor e o visualizador.
// config_pagina = { tamanho: 'A4' | 'A3', orientacao: 'portrait' | 'landscape', ... }

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PageSize = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // dimensões em mm, em retrato
    const SIZES = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };
    const MM_TO_PX = 3.78; // 1 mm ≈ 3,78 px a 96 DPI

    function normalizeName(tamanho) {
        return String(tamanho || '').toUpperCase() === 'A3' ? 'A3' : 'A4';
    }

    /** Dimensões efetivas da folha (mm e px) já considerando a orientação. */
    function dims(cfg) {
        const name = normalizeName(cfg && cfg.tamanho);
        const orient = (cfg && cfg.orientacao) === 'landscape' ? 'landscape' : 'portrait';
        const base = SIZES[name];
        const widthMm = orient === 'landscape' ? base.h : base.w;
        const heightMm = orient === 'landscape' ? base.w : base.h;
        return {
            name,
            orient,
            widthMm,
            heightMm,
            widthPx: Math.round(widthMm * MM_TO_PX),
            heightPx: Math.round(heightMm * MM_TO_PX),
            cssPageSize: name + ' ' + orient,
            label: widthMm + ' × ' + heightMm + ' mm (' + (orient === 'landscape' ? 'Paisagem' : 'Retrato') + ')'
        };
    }

    return { SIZES, MM_TO_PX, normalizeName, dims };
});
