// src/reportEditor.js
// MOLDURA DE EDIÇÃO DOS BLOCOS DO RELATÓRIO. Usa o mesmo desenho do relatório (src/reportBlocks.js) e põe por cima os controles
// do construtor (título editável, alça de arrastar, largura, remover, colunas...). Os botões chamam ReportBuilder.<ação>(...):
//   • no construtor (folha clássica) isso é a própria função do construtor;
//   • na página real (relatorio_view.html?modo=edicao, dentro do iframe do construtor) ReportBuilder é uma ponte que manda a ação por mensagem.
// create({ blocks, esc }) — blocks = ReportBlocks.create(...). Os dados vêm de quem chama (feição de teste), nada é lido de fora.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReportEditor = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const escPadrao = (s) => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    // ---- campos de arquivo (foto e anexo): formato de exibição
    function isFileField(f) {
        const t = String((f && f.type) || '').toLowerCase();
        return t === 'photo' || t === 'attachment';
    }

    function fileFieldMode(bloco, f) {
        const m = bloco && bloco.campos_exibicao ? bloco.campos_exibicao[f.id] : null;
        if (m === 'lista' || m === 'imagem') return m;
        return String(f.type || '').toLowerCase() === 'photo' ? 'imagem' : 'lista';
    }

    function create(ctx) {
        const blocks = ctx.blocks;
        const esc = ctx.esc || escPadrao;

    function fileModeToggleHtml(index, f, mode) {
        if (!isFileField(f)) return '';
        const fid = esc(f.id);
        const btn = (m, icon, title) => '<button type="button" class="file-mode-btn px-1 py-0.5 rounded cursor-pointer transition-colors '
            + (mode === m ? 'bg-sky-100 text-sky-700' : 'text-slate-400 hover:text-sky-600') + '"'
            + ' onclick="ReportBuilder.setFieldFileMode(' + index + ", '" + fid + "', '" + m + "', event)\" title=\"" + title + '">'
            + '<span class="material-symbols-outlined text-[13px] leading-none">' + icon + '</span></button>';
        return '<div class="inline-flex items-center bg-white border border-slate-200 rounded p-0.5 shadow-2xs" title="Como exibir os arquivos deste campo">'
            + btn('lista', 'view_list', 'Lista: título e nome do arquivo')
            + btn('imagem', 'image', 'Imagem na íntegra, com título e metadados')
            + '</div>';
    }


    function grade(bloco, index, fields, featureData, colCount) {
        const dica = colCount === 1
            ? '<span class="text-[9px] text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded font-medium print:hidden">Arraste ⠿ para reordenar</span>'
            : '<span class="text-[9px] text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded font-medium print:hidden">Arraste ⠿ para reordenar • Use [-] [+] ou clique no % para a largura</span>';
        const edit = {
            titleClass: 'cursor-text hover:bg-sky-50 px-1 rounded',
            titleAttrs: `ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')"`,
            headerExtra: `<div class="flex items-center gap-2"><span class="text-[10px] font-mono text-slate-400 font-normal">${colCount === 1 ? 'Lista Corrida' : colCount + ' Colunas'}</span>${dica}</div>`,
            containerAttrs: `data-block-index="${index}"`,
            fieldAttrs: (f) => `data-field-id="${f.id}" data-block-index="${index}"`,
            lead: (f, pct, modo) => `<span class="field-drag-handle cursor-grab active:cursor-grabbing text-slate-300 group-hover/field:text-sky-600 hover:bg-slate-200/60 p-0.5 rounded transition-colors" title="Arraste para mover de posição ${modo === 'linha' ? 'na lista' : 'na grade'}"><span class="material-symbols-outlined text-[15px] leading-none">drag_indicator</span></span>`,
            tail: (f, pct, modo) => {
                const arquivo = fileModeToggleHtml(index, f, fileFieldMode(bloco, f));
                const remover = `<button type="button" class="field-remove-btn p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer print:hidden" onclick="ReportBuilder.removeFieldFromGrid(${index}, '${f.id}', event)" title="${modo === 'linha' ? 'Remover campo da grade' : 'Remover este campo da grade'}"><span class="material-symbols-outlined text-[14px] leading-none">close</span></button>`;
                if (modo === 'linha') return arquivo + remover;
                return arquivo + `<div class="inline-flex items-center bg-white border border-slate-200 rounded-md p-0.5 shadow-2xs"><button type="button" class="field-width-dec-btn px-1 py-0.5 text-slate-500 hover:text-sky-600 hover:bg-slate-100 rounded cursor-pointer transition-colors" onclick="ReportBuilder.changeFieldWidthStep(${index}, '${f.id}', -1, event)" title="Diminuir largura do campo (-)"><span class="material-symbols-outlined text-[13px] leading-none">remove</span></button><button type="button" class="field-width-badge-btn px-1.5 py-0.5 text-[9.5px] font-extrabold text-slate-700 hover:text-sky-600 cursor-pointer transition-colors" onclick="ReportBuilder.toggleFieldWidthPopover(${index}, '${f.id}', event)" title="Clique para escolher proporção exata ou regular slider">${pct}%</button><button type="button" class="field-width-inc-btn px-1 py-0.5 text-slate-500 hover:text-sky-600 hover:bg-slate-100 rounded cursor-pointer transition-colors" onclick="ReportBuilder.changeFieldWidthStep(${index}, '${f.id}', 1, event)" title="Aumentar largura do campo (+)"><span class="material-symbols-outlined text-[13px] leading-none">add</span></button></div>` + remover;
            }
        };
        return blocks.renderAttributeGrid(bloco, featureData, fields, { edit: edit });
    }


    function cabecalho(bloco, index, tpl, opts) {
        const todas = !!bloco.repetir_todas_folhas;
        const badgeHtml = `<span class="self-start text-[9px] font-sans font-bold ${todas ? 'text-sky-600 bg-sky-50 border-sky-200' : 'text-slate-500 bg-slate-100 border-slate-200'} border px-1.5 py-0.5 rounded select-none print:hidden">${todas ? 'Todas as Folhas' : 'Apenas 1ª Folha'}</span>`;
        const o = opts || {};
        return blocks.renderHeaderSlotHtml(bloco, tpl || {}, o.padLeftMm || 0, o.padRightMm || 0, {
            bare: !!o.bare,
            edit: {
                textClass: 'cursor-text hover:bg-sky-50 px-1 py-0.5 rounded',
                subtituloAttrs: `ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'subtitulo')" title="Duplo clique para editar"`,
                tituloAttrs: `ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')" title="Duplo clique para editar"`,
                badgeHtml: badgeHtml
            }
        });
    }


    function rodape(bloco) {
        const segunda = bloco.inicio_numeracao === 'segunda';
        const qrHtml = '<span class="text-slate-500 font-normal" title="O QR code é gerado na emissão do relatório">[QR code de verificação]</span>';
        return blocks.renderFooterSlotHtml(bloco, segunda ? 2 : 1, segunda ? 10 : 1, 0, 0, { bare: true, qrHtml: qrHtml });
    }


    function sintetica(bloco, index, featureData, opts) {
        const b = bloco;
        const btn = (dir, cIdx, icone, dica) => `<button type="button" onclick="ReportBuilder.moveSynthetic1nColumn(${index}, ${cIdx}, ${dir}, event)" class="opacity-0 group-hover/th:opacity-100 p-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded cursor-pointer print:hidden shrink-0" title="${dica}"><span class="material-symbols-outlined text-[13px] leading-none">${icone}</span></button>`;
        const edit = {
            titleClass: 'cursor-text hover:bg-sky-50 px-1 rounded',
            titleAttrs: `ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')"`,
            metaExtra: ` • ${b.colunas && b.colunas.length ? b.colunas.length : 3} coluna(s) • ${b.densidade}`,
            th: (c, cIdx, cols, rotuloHtml) => `<div class="flex items-center justify-between gap-1"><div class="flex items-center gap-0.5 min-w-0">${cIdx > 0 ? btn(-1, cIdx, 'chevron_left', 'Mover coluna para a esquerda') : ''}<span class="cursor-pointer hover:bg-sky-100 px-1 py-0.5 rounded transition-colors whitespace-normal break-words leading-tight" title="Duplo clique para renomear ou abreviar título" ondblclick="ReportBuilder.editSynthetic1nColTitle(${index}, ${cIdx}, event)">${rotuloHtml}</span>${cIdx < cols.length - 1 ? btn(1, cIdx, 'chevron_right', 'Mover coluna para a direita') : ''}</div><button type="button" onclick="ReportBuilder.removeColumnFromSynthetic1n(${index}, '${esc(c.id)}', event)" class="field-remove-btn opacity-0 group-hover/th:opacity-100 p-0.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all cursor-pointer print:hidden shrink-0" title="Remover esta coluna da tabela"><span class="material-symbols-outlined text-[13px] leading-none">close</span></button></div>`
        };
        return blocks.renderSyntheticTable(b, featureData, { full: !!(opts && opts.full), edit: edit });
    }


    function laudo(bloco, index, featureData, opts) {
        const b = bloco;
        const edit = {
            titleClass: 'cursor-text hover:bg-sky-50 px-1 rounded',
            titleAttrs: `ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')"`,
            metaExtra: ' • <span class="text-[9px] text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded font-medium print:hidden font-sans">Arraste ⠿ para reordenar campos (vale para todos os registros da aba)</span>',
            groupAttrs: (tabId) => `class="cursor-text hover:bg-sky-50 px-1 rounded transition-colors" title="Duplo clique para editar o texto da aba" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'custom_tab_title_${esc(String(tabId))}')"`,
            containerAttrs: `data-block-index="${index}"`,
            fieldAttrs: (f) => `data-field-id="${esc(f.id)}" data-block-index="${index}"`,
            lead: () => '<span class="field-drag-handle cursor-grab active:cursor-grabbing text-slate-300 group-hover/field:text-sky-600 hover:bg-slate-200/60 p-0.5 rounded transition-colors" title="Arraste para mover de posição no laudo"><span class="material-symbols-outlined text-[14px] leading-none">drag_indicator</span></span>',
            tail: (f, pct) => fileModeToggleHtml(index, f, fileFieldMode(bloco, f)) + `<div class="inline-flex items-center bg-white border border-slate-200 rounded p-0.5 shadow-2xs"><button type="button" class="field-width-dec-btn px-1 py-0.5 text-slate-500 hover:text-sky-600 hover:bg-slate-100 rounded cursor-pointer transition-colors" onclick="ReportBuilder.changeFieldWidthStep(${index}, '${esc(f.id)}', -1, event)" title="Diminuir largura do campo (-)"><span class="material-symbols-outlined text-[12px] leading-none">remove</span></button><button type="button" class="field-width-badge-btn px-1 py-0.5 text-[9px] font-extrabold text-slate-700 hover:text-sky-600 cursor-pointer transition-colors" onclick="ReportBuilder.toggleFieldWidthPopover(${index}, '${esc(f.id)}', event)" title="Clique para escolher proporção exata">${Math.round(pct)}%</button><button type="button" class="field-width-inc-btn px-1 py-0.5 text-slate-500 hover:text-sky-600 hover:bg-slate-100 rounded cursor-pointer transition-colors" onclick="ReportBuilder.changeFieldWidthStep(${index}, '${esc(f.id)}', 1, event)" title="Aumentar largura do campo (+)"><span class="material-symbols-outlined text-[12px] leading-none">add</span></button></div><button type="button" class="field-remove-btn p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer print:hidden" onclick="ReportBuilder.removeFieldFromAnalytical1n(${index}, '${esc(f.id)}', event)" title="Remover este campo do laudo"><span class="material-symbols-outlined text-[13px] leading-none">close</span></button>`,
            photoHeader: (f) => fileModeToggleHtml(index, f, fileFieldMode(bloco, f))
        };
        return blocks.renderAnalyticalLaudo(b, featureData, { full: !!(opts && opts.full), edit: edit });
    }


        return { grade, cabecalho, rodape, sintetica, laudo, fileModeToggleHtml };
    }

    return { create, isFileField, fileFieldMode };
});
