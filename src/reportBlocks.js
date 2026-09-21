// src/reportBlocks.js
// DESENHISTAS DOS BLOCOS DO RELATÓRIO (HTML). Ficam num módulo para que o visualizador (relatorio_view.html) e, aos poucos,
// o construtor mostrem EXATAMENTE o mesmo desenho de cada tipo de bloco.
// create(ctx) devolve as funções; ctx traz o que depende da página:
//   esc(texto)                       escapa HTML
//   FieldFormatter                   src/fieldFormatter.js (formatação pelo TIPO do campo)
//   geometryCenter()                 centro da feição (campos de geolocalização não gravados) ou null
//   emissaoTexto(kind), emissaoTitulo(), emissaoProtocolo(), qrDataUrl()  protocolo/SHA-256 da emissão e o QR do rodapé
//   formFields()                     campos do cadastro (menções @ do texto livre)
//   ReportData, formTabs()           src/reportData.js e as abas do formulário (tabelas 1:N e laudo)
// As funções abaixo foram movidas do visualizador sem mudar o desenho.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReportBlocks = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function create(ctx) {
        ctx = ctx || {};
        const esc = ctx.esc || ((s) => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
        const FieldFormatter = ctx.FieldFormatter;
        const emissaoTexto = (k) => (ctx.emissaoTexto ? ctx.emissaoTexto(k) : '');
        const emissaoTitulo = () => (ctx.emissaoTitulo ? ctx.emissaoTitulo() : '');
        const emissaoProtocolo = () => (ctx.emissaoProtocolo ? ctx.emissaoProtocolo() : '');
        const qrDataUrl = () => (ctx.qrDataUrl ? ctx.qrDataUrl() : '');
        const RD = ctx.ReportData || (typeof globalThis !== 'undefined' ? globalThis.ReportData : undefined);
        const formTabs = () => (ctx.formTabs ? (ctx.formTabs() || []) : []);

        function getOrgBadgeHtml(org) {
            const o = String(org || '').toUpperCase().trim();
            if (!o || o === 'VISTORIA') {
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs"><span class="material-symbols-outlined text-[12px]">visibility</span> Vistoria</span>`;
            }
            if (o.includes('MPF') || o.includes('MINISTÉRIO PÚBLICO') || o.includes('MINISTERIO PUBLICO') || o.includes('PROCURADORIA')) {
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs"><span class="material-symbols-outlined text-[12px]">gavel</span> ${esc(org)}</span>`;
            }
            if (o.includes('POLÍCIA') || o.includes('POLICIA') || (o.includes('PF') && !o.includes('MPF'))) {
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-blue-100 text-blue-800 border border-blue-200 shadow-2xs"><span class="material-symbols-outlined text-[12px]">local_police</span> ${esc(org)}</span>`;
            }
            if (o.includes('SPU') || o.includes('PATRIMÔNIO') || o.includes('PATRIMONIO') || o.includes('FEDERAL')) {
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs"><span class="material-symbols-outlined text-[12px]">account_balance</span> ${esc(org)}</span>`;
            }
            if (o.includes('MUNIC') || o.includes('PREFEITURA') || o.includes('SEDEC') || o.includes('SEPLAM') || o.includes('CABEDELO') || o === 'PM') {
                const displayOrg = (org === 'PM') ? 'MUNICÍPIO' : org;
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs"><span class="material-symbols-outlined text-[12px]">domain</span> ${esc(displayOrg)}</span>`;
            }
            const genericPalettes = [
                'bg-sky-100 text-sky-800 border-sky-200',
                'bg-teal-100 text-teal-800 border-teal-200',
                'bg-indigo-100 text-indigo-800 border-indigo-200',
                'bg-rose-100 text-rose-800 border-rose-200',
                'bg-orange-100 text-orange-800 border-orange-200'
            ];
            const gHash = Math.abs(String(org || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
            const gClass = genericPalettes[gHash % genericPalettes.length];
            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold ${gClass} shadow-2xs"><span class="material-symbols-outlined text-[12px]">corporate_fare</span> ${esc(org)}</span>`;
        }

        function getStatusBadgeHtml(status) {
            const s = String(status || '').toLowerCase().trim();
            if (!s || s === '—' || s === '---' || s === '-') return '<span class="text-slate-400 opacity-60 font-mono text-[10px]">—</span>';
            if (s.includes('irregular') || s.includes('invas') || s.includes('não conforme') || s.includes('nao conforme')) {
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-red-100 text-red-700 border border-red-200 shadow-2xs"><span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> ${esc(status)}</span>`;
            }
            if (s.includes('regular') || s.includes('conforme') || s.includes('legal')) {
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-2xs"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> ${esc(status)}</span>`;
            }
            return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-medium bg-slate-100 text-slate-700 border border-slate-200">${esc(status)}</span>`;
        }

        function getRecuoBadgeHtml(recuo) {
            const r = String(recuo || '').toLowerCase().trim();
            if (!r || r === '—' || r === '---' || r === '-') return '<span class="text-slate-400 opacity-60 font-mono text-[10px]">—</span>';
            if (r.includes('já recuou') || r.includes('ja recuou') || r.includes('recuado') || r.includes('com recuo') || r.includes('sim')) {
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-2xs"><span class="material-symbols-outlined text-[11px]">check_circle</span> ${esc(recuo)}</span>`;
            }
            if (r.includes('não') || r.includes('nao') || r.includes('sem recuo') || r.includes('pendente')) {
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs"><span class="material-symbols-outlined text-[11px]">warning</span> ${esc(recuo)}</span>`;
            }
            return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-medium bg-slate-100 text-slate-700 border border-slate-200">${esc(recuo)}</span>`;
        }

        function getGeometryCenter() {
            return ctx.geometryCenter ? ctx.geometryCenter() : null;
        }

        function formatFieldValueForDisplay(val, fieldDef = {}) {
            return FieldFormatter.toText(val, fieldDef || {}, { geometryCenter: getGeometryCenter() });
        }

        function readFieldRaw(f, data) {
            if (!f || !data) return undefined;
            const key = f.id || f.name;
            return key ? data[key] : undefined;
        }

        function isRichField(f) {
            return ['hiperlink', 'hiperlink_1n', 'attachment', 'photo', 'epol_1n', 'rip_1n', 'textarea'].includes(FieldFormatter.canonicalType(f || {}));
        }

        function resolveFieldHtml(f, featureData, fileMode) {
            if (!f || !featureData) return FieldFormatter.EMPTY;
            return FieldFormatter.toHtml(readFieldRaw(f, featureData), f, { geometryCenter: getGeometryCenter(), fileMode });
        }

        function resolveFieldValue(f, featureData, availableFields = []) {
            if (!f || !featureData) return FieldFormatter.EMPTY;
            return formatFieldValueForDisplay(readFieldRaw(f, featureData), f);
        }

        function getFieldWidthStyle(pct) {
            const p = Math.max(15, Math.min(100, Math.round(pct || 50)));
            if (p >= 98) return '100%';
            const gap = 10;
            const deduction = Math.round((gap * (1 - p / 100)) * 10) / 10;
            return `calc(${p}% - ${deduction}px)`;
        }

        function renderAttributeGrid(bloco, featureData, fields, opts) {
            // opts.edit (só no construtor): mesmo desenho e mesmos dados, com os controles de edição por cima:
            //   titleClass/titleAttrs: título editável   headerExtra: dica ao lado do título
            //   containerAttrs: atributos da grade (índice do bloco)   fieldAttrs(f, pct): atributos de cada campo (id e índice)
            //   lead(f, pct, modo): alça de arrastar   tail(f, pct, modo): largura, formato do arquivo e remover   (modo: 'linha' | 'card')
            const edit = (opts && opts.edit) || null;
            const fileModes = bloco.campos_exibicao || {};
            const colCount = bloco.colunasLayout || 2;
            const spans = bloco.campos_spans || {};
            const larguras = bloco.campos_larguras || {};

            const fieldsMap = new Map();
            fields.forEach(f => {
                fieldsMap.set(f.id, f);
                if (f.name) fieldsMap.set(f.name, f);
            });

            const rawSel = Array.isArray(bloco.campos_selecionados) ? bloco.campos_selecionados : [];
            let fldsToRender = rawSel
                .map(item => typeof item === 'string' ? { id: item } : item)
                .map(item => {
                    const baseField = fieldsMap.get(item.id) || fieldsMap.get(item.name) || {};
                    return { ...baseField, ...item };
                })
                .filter(f => f && (f.label || f.name));

            if (fldsToRender.length === 0 && rawSel.length > 0) {
                const selSet = new Set(rawSel.map(s => typeof s === 'string' ? s : s.id));
                fldsToRender = fields.filter(f => selSet.has(f.id));
            }
            if (fldsToRender.length === 0) fldsToRender = fields.slice(0, 8);

            const tituloHtml = `<span class="whitespace-pre-line${edit && edit.titleClass ? ' ' + edit.titleClass : ''}"${edit && edit.titleAttrs ? ' ' + edit.titleAttrs : ''}>${(esc(bloco.titulo || 'Dados Cadastrais')).replace(/\r?\n/g, '<br>')}</span>`;
            const cabecalho = `
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between${edit ? ' flex-wrap gap-1' : ''}">
                            ${tituloHtml}${edit && edit.headerExtra ? edit.headerExtra : ''}
                        </div>`;
            const topoEdicao = (f, pct, modo, rotuloHtml) => `
                                        <div class="flex items-center justify-between gap-1 mb-1">
                                            <div class="flex items-center gap-1 min-w-0 flex-1">${edit.lead ? edit.lead(f, pct, modo) : ''}${rotuloHtml}</div>
                                            <div class="flex items-center gap-1 shrink-0">${edit.tail ? edit.tail(f, pct, modo) : ''}</div>
                                        </div>`;

            if (colCount === 1) {
                return `
                    <div class="mb-4 page-break-avoid">${cabecalho}
                        <div class="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden${edit ? ' a4-grid-fields-container' : ''}"${edit && edit.containerAttrs ? ' ' + edit.containerAttrs : ''}>
                            ${fldsToRender.map(f => {
                                const val = resolveFieldValue(f, featureData);
                                if (edit) {
                                    // linha editável: alça + nome à esquerda; valor e controles à direita
                                    const attrs = edit.fieldAttrs ? edit.fieldAttrs(f, 100) : '';
                                    if (isRichField(f)) {
                                        return `
                                    <div class="px-3 py-1.5 text-xs bg-white odd:bg-slate-50/50 group/field select-none" ${attrs}>
                                        <div class="flex items-center justify-between gap-2">
                                            <div class="flex items-center gap-2 min-w-0">${edit.lead ? edit.lead(f, 100, 'linha') : ''}<span class="font-bold text-slate-600 truncate">${esc(f.label)}:</span></div>
                                            <div class="flex items-center gap-2">${edit.tail ? edit.tail(f, 100, 'linha') : ''}</div>
                                        </div>
                                        <div class="font-semibold text-slate-900 text-[11px] break-words whitespace-normal">${resolveFieldHtml(f, featureData, fileModes[f.id])}</div>
                                    </div>`;
                                    }
                                    return `
                                    <div class="flex items-center justify-between px-3 py-1.5 text-xs bg-white odd:bg-slate-50/50 group/field select-none" ${attrs}>
                                        <div class="flex items-center gap-2 min-w-0">${edit.lead ? edit.lead(f, 100, 'linha') : ''}<span class="font-bold text-slate-600 truncate">${esc(f.label)}:</span></div>
                                        <div class="flex items-center gap-2 min-w-0"><span class="font-semibold text-slate-900 truncate font-mono text-[11px]">${esc(val)}</span>${edit.tail ? edit.tail(f, 100, 'linha') : ''}</div>
                                    </div>`;
                                }
                                if (isRichField(f)) {
                                    return `
                                    <div class="px-3 py-1.5 text-xs bg-white odd:bg-slate-50/50">
                                        <div class="font-bold text-slate-600">${esc(f.label)}:</div>
                                        <div class="font-semibold text-slate-900 text-[11px] break-words whitespace-normal">${resolveFieldHtml(f, featureData, fileModes[f.id])}</div>
                                    </div>`;
                                }
                                return `
                                    <div class="flex items-center justify-between px-3 py-1.5 text-xs bg-white odd:bg-slate-50/50">
                                        <span class="font-bold text-slate-600 truncate">${esc(f.label)}:</span>
                                        <span class="font-semibold text-slate-900 truncate font-mono text-[11px]">${esc(val)}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            return `
                <div class="mb-4 page-break-avoid">${cabecalho}
                    <div class="flex flex-wrap gap-2.5${edit ? ' a4-grid-fields-container' : ''}"${edit && edit.containerAttrs ? ' ' + edit.containerAttrs : ''}>
                        ${fldsToRender.map(f => {
                            const val = resolveFieldValue(f, featureData);
                            let pct = larguras[f.id];
                            if (!pct) {
                                const span = Math.min(spans[f.id] || f.colSpan || 1, colCount);
                                if (span >= colCount) pct = 100;
                                else if (colCount === 3 && span === 2) pct = 66;
                                else pct = colCount === 3 ? 33 : 50;
                            }
                            pct = Math.round(pct);
                            const widthStyle = getFieldWidthStyle(pct);
                            const isLongText = pct >= 45 || String(val).length > 25 || (f.id && (f.id.includes('endereco') || f.id.includes('obs'))) || (f.label && (f.label.toLowerCase().includes('endereço') || f.label.toLowerCase().includes('observa')));
                            const valorHtml = isRichField(f) ? resolveFieldHtml(f, featureData, fileModes[f.id]) : esc(val);
                            const valorCls = (isLongText || isRichField(f)) ? 'break-words whitespace-normal leading-snug' : 'truncate';
                            if (edit) {
                                return `
                                <div class="relative group/field p-2 border ${pct > 55 ? 'border-sky-300 bg-sky-50/40' : 'border-slate-200 bg-slate-50/50'} rounded-lg select-none" ${edit.fieldAttrs ? edit.fieldAttrs(f, pct) : ''}
                                     style="flex: 0 0 ${widthStyle}; max-width: ${widthStyle}; width: ${widthStyle}; box-sizing: border-box;">${topoEdicao(f, pct, 'card', `<span class="text-[9.5px] uppercase font-bold text-slate-500 truncate" title="${esc(f.label)}">${esc(f.label)}</span>`)}
                                    <div class="text-xs font-bold text-slate-800 mt-0.5 ${valorCls}">${valorHtml}</div>
                                </div>
                            `;
                            }
                            return `
                                <div class="p-2 border border-slate-200 rounded-lg bg-slate-50/50"
                                     style="flex: 0 0 ${widthStyle}; max-width: ${widthStyle}; width: ${widthStyle}; box-sizing: border-box;">
                                    <div class="text-[9.5px] uppercase font-bold text-slate-500 truncate">${esc(f.label)}</div>
                                    <div class="text-xs font-bold text-slate-800 mt-0.5 ${valorCls}">${valorHtml}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        function replaceMentionsWithData(contentHtml, featureData) {
            if (!contentHtml) return '';
            
            const availableFields = (ctx.formFields && Array.isArray(ctx.formFields())) ? ctx.formFields() : [];

            // 1. Substitui spans com menção estruturada (@campo) priorizando data-field-id (único por campo e aba)
            let result = contentHtml.replace(/<span[^>]*class="[^"]*mention-[^"]*"[^>]*>[\s\S]*?<\/span>/gi, (match) => {
                const idMatch = match.match(/data-field-id="([^"]+)"/i);
                const nameMatch = match.match(/data-field-name="([^"]+)"/i);
                const fId = idMatch ? idMatch[1] : null;
                const fName = nameMatch ? nameMatch[1] : null;

                // Extrai rótulo limpo do texto da menção (ex: "@Loteamento (Dados do Imóvel)" -> "Loteamento")
                const rawInnerText = match.replace(/<[^>]+>/g, '').replace(/^@/, '').trim();
                const cleanLabel = rawInnerText.replace(/\s*\([^)]*\)$/, '').trim();

                let fieldDef = availableFields.find(f => (fId && f.id === fId) || (fName && f.name === fName));
                if (!fieldDef && cleanLabel) {
                    fieldDef = availableFields.find(f => f.label && f.label.toLowerCase().trim() === cleanLabel.toLowerCase().trim());
                }
                if (!fieldDef) {
                    fieldDef = { id: fId, name: fName, label: cleanLabel };
                }
                if (!fieldDef.label && cleanLabel) fieldDef.label = cleanLabel;

                // Resolve o valor formatado através de resolveFieldValue (que já faz busca inteligente, aliases e formatação)
                let val = undefined;
                if (typeof resolveFieldValue === 'function') {
                    const resolved = resolveFieldValue(fieldDef, featureData, availableFields);
                    if (resolved !== '—') val = resolved;
                }

                // Fallback direto em featureData caso resolveFieldValue não encontre
                if (val === undefined || val === null || val === '') {
                    if (fId && featureData[fId] !== undefined && featureData[fId] !== null && featureData[fId] !== '') {
                        val = formatFieldValueForDisplay(featureData[fId], fieldDef);
                    } else if (fName && featureData[fName] !== undefined && featureData[fName] !== null && featureData[fName] !== '') {
                        val = formatFieldValueForDisplay(featureData[fName], fieldDef);
                    } else if (fName && featureData[fName.toLowerCase()] !== undefined && featureData[fName.toLowerCase()] !== null && featureData[fName.toLowerCase()] !== '') {
                        val = formatFieldValueForDisplay(featureData[fName.toLowerCase()], fieldDef);
                    }
                }

                if (val === undefined || val === null || val === '') {
                    val = '—';
                }

                let displayVal = String(val);

                // Detecta opções de formatação ricas (Negrito, Itálico, Sublinhado) aplicadas na tag ou pelo editor
                const isBold = match.includes('data-format-bold="true"') || 
                               /font-weight\s*:\s*(bold|700|800|900)/i.test(match) || 
                               /\bfont-black\b/i.test(match) || 
                               /\bis-bold\b/i.test(match);

                const isItalic = match.includes('data-format-italic="true"') || 
                                 /font-style\s*:\s*italic/i.test(match) || 
                                 /\bitalic\b/i.test(match);

                const isUnderline = match.includes('data-format-underline="true"') || 
                                   /text-decoration\s*:\s*underline/i.test(match) || 
                                   /\bunderline\b/i.test(match);

                let formattedOutput = esc(displayVal);
                if (isUnderline) formattedOutput = `<u>${formattedOutput}</u>`;
                if (isItalic) formattedOutput = `<em>${formattedOutput}</em>`;
                if (isBold) formattedOutput = `<strong>${formattedOutput}</strong>`;

                return formattedOutput;
            });

            // 2. Substitui spans legados caso existam
            result = result.replace(/<span[^>]*data-field-id="([^"]+)"[^>]*>.*?<\/span>/gi, (match, fId) => {
                const isBold = match.includes('data-format-bold="true"') || /font-weight\s*:\s*(bold|700|800|900)/i.test(match) || /\bfont-black\b/i.test(match) || /\bis-bold\b/i.test(match);
                const isItalic = match.includes('data-format-italic="true"') || /font-style\s*:\s*italic/i.test(match) || /\bitalic\b/i.test(match);
                const isUnderline = match.includes('data-format-underline="true"') || /text-decoration\s*:\s*underline/i.test(match) || /\bunderline\b/i.test(match);

                let fieldDef = availableFields.find(f => f.id === fId) || { id: fId };
                let val = (typeof resolveFieldValue === 'function') ? resolveFieldValue(fieldDef, featureData, availableFields) : undefined;
                if (val === undefined || val === null || val === '—') {
                    val = featureData[fId] ? formatFieldValueForDisplay(featureData[fId], fieldDef) : '—';
                }
                let out = esc(String(val));
                if (isUnderline) out = `<u>${out}</u>`;
                if (isItalic) out = `<em>${out}</em>`;
                if (isBold) out = `<strong>${out}</strong>`;
                return out;
            });

            result = result.replace(/<span[^>]*data-field-name="([^"]+)"[^>]*>.*?<\/span>/gi, (match, fName) => {
                const isBold = match.includes('data-format-bold="true"') || /font-weight\s*:\s*(bold|700|800|900)/i.test(match) || /\bfont-black\b/i.test(match) || /\bis-bold\b/i.test(match);
                const isItalic = match.includes('data-format-italic="true"') || /font-style\s*:\s*italic/i.test(match) || /\bitalic\b/i.test(match);
                const isUnderline = match.includes('data-format-underline="true"') || /text-decoration\s*:\s*underline/i.test(match) || /\bunderline\b/i.test(match);

                let fieldDef = availableFields.find(f => f.name === fName) || { name: fName };
                let val = (typeof resolveFieldValue === 'function') ? resolveFieldValue(fieldDef, featureData, availableFields) : undefined;
                if (val === undefined || val === null || val === '—') {
                    val = featureData[fName] ? formatFieldValueForDisplay(featureData[fName], fieldDef) : '—';
                }
                let out = esc(String(val));
                if (isUnderline) out = `<u>${out}</u>`;
                if (isItalic) out = `<em>${out}</em>`;
                if (isBold) out = `<strong>${out}</strong>`;
                return out;
            });

            // 3. Substitui padrões como @[Nome] ou @nome_campo
            for (const [key, rawVal] of Object.entries(featureData)) {
                if (rawVal !== null && rawVal !== undefined) {
                    const regex = new RegExp(`@\\[?${key}\\]?`, 'gi');
                    if (regex.test(result)) {
                        const fieldDef = availableFields.find(f => f.name === key || f.id === key) || { id: key, name: key };
                        const formatted = formatFieldValueForDisplay(rawVal, fieldDef);
                        result = result.replace(regex, esc(String(formatted)));
                    }
                }
            }

            return result;
        }

        function getFooterPageNumberText(pageIdx, totalPages, ftrBloco) {
            if (!ftrBloco || ftrBloco.numeracao === false) return '';
            const startMode = ftrBloco.inicio_numeracao || 'primeira';

            const curPad = String(pageIdx).padStart(2, '0');
            const totalPad = totalPages < 10 ? String(totalPages).padStart(2, '0') : String(totalPages);

            if (startMode === 'segunda') {
                if (pageIdx === 1) {
                    return ''; // Na 1ª folha não exibe número
                }
                return `Página ${curPad} de ${totalPad}`;
            } else {
                return `Página ${curPad} de ${totalPad}`;
            }
        }

        /**
         * Cabeçalho da folha. opts (só no construtor):
         *   bare: devolve só o conteúdo (o construtor já tem o contêiner da folha)
         *   edit: { subtituloAttrs, tituloAttrs, textClass, badgeHtml } — títulos editáveis e selo (Todas as folhas / Apenas 1ª folha)
         */
        function renderHeaderSlotHtml(hdrBloco, tpl, padLeftMm, padRightMm, opts) {
            if (!hdrBloco) return '';
            const bare = !!(opts && opts.bare);
            const edit = (opts && opts.edit) || null;
            const conteudo = `
                    <div class="mb-2 page-break-avoid ${hdrBloco.repetir_todas_folhas ? 'cabecalho-repetir-todas' : ''}">
                        <!-- Metadados de Emissão e Protocolo fora do card/borda principal (topo direito) -->
                        ${(hdrBloco.exibirDataHora || hdrBloco.exibirProtocolo) ? `
                            <div class="flex items-center justify-end gap-3 text-[10px] font-mono text-slate-500 pb-1 mb-1 border-b border-slate-200/80">
                                ${hdrBloco.exibirDataHora ? `
                                    <div class="flex items-center gap-1">
                                        <span class="text-slate-400">Emissão:</span>
                                        <span class="font-medium text-slate-600">${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>
                                    </div>
                                ` : ''}
                                ${hdrBloco.exibirProtocolo ? `
                                    <div class="flex items-center gap-1 font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
                                        <span class="text-slate-400 font-normal">Protocolo:</span>
                                        <span data-emissao="protocolo">${emissaoTexto('protocolo')}</span>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}

                        <div class="flex items-center justify-between border-b-2 border-slate-900 pb-2.5 gap-4">
                            <div class="flex items-center gap-3">
                                ${hdrBloco.logo ? `
                                    <div class="w-14 h-14 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border border-slate-200">
                                        ${hdrBloco.logo_url ? `<img src="${hdrBloco.logo_url}" class="w-full h-full object-contain" />` : `<span class="material-symbols-outlined text-slate-800 text-[42px]">account_balance</span>`}
                                    </div>
                                ` : ''}
                                <div>
                                    <div class="text-[11px] uppercase font-bold text-slate-600 tracking-wider whitespace-pre-line${edit && edit.textClass ? ' ' + edit.textClass : ''}"${edit && edit.subtituloAttrs ? ' ' + edit.subtituloAttrs : ''}>${(esc(hdrBloco.subtitulo || 'Prefeitura Municipal')).replace(/\r?\n/g, '<br>')}</div>
                                    <div class="text-lg font-black uppercase text-slate-900 tracking-tight whitespace-pre-line${edit && edit.textClass ? ' ' + edit.textClass : ''}"${edit && edit.tituloAttrs ? ' ' + edit.tituloAttrs : ''}>${(esc(hdrBloco.titulo || tpl.nome || 'FICHA CADASTRAL DO IMÓVEL')).replace(/\r?\n/g, '<br>')}</div>
                                </div>
                            </div>
                            ${edit && edit.badgeHtml ? edit.badgeHtml : ''}
                        </div>
                    </div>
            `;
            if (bare) return conteudo;
            return `
                <div class="a4-page-header-slot w-full select-none" style="padding: 6mm ${padRightMm}mm 0 ${padLeftMm}mm;">${conteudo}
                </div>
            `;
        }

        /** Rodapé da folha. opts (só no construtor): bare = só o conteúdo; qrHtml = marcador no lugar do QR (ainda sem protocolo). */
        function renderFooterSlotHtml(ftrBloco, pageIdx, totalPages, padLeftMm, padRightMm, opts) {
            if (!ftrBloco) return '';
            const bare = !!(opts && opts.bare);
            const pageText = getFooterPageNumberText(pageIdx, totalPages, ftrBloco);
            const conteudo = `
                    <div class="border-t border-slate-300 pt-2 text-[10px] text-slate-500 flex items-center justify-between font-mono page-break-avoid w-full">
                        <div>
                            ${ftrBloco.exibirDataHora !== false ? `Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}` : ''}
                            ${ftrBloco.exibirHash !== false ? `<span class="ml-2 font-bold text-slate-600">SHA-256: <span data-emissao="hash" title="${emissaoTitulo()}">${emissaoTexto('hash')}</span></span>` : ''}
                        </div>
                        <div class="font-bold text-slate-700 flex items-center gap-2">
                            ${ftrBloco.exibirQr !== false ? (opts && opts.qrHtml ? opts.qrHtml : `<img data-emissao="qr" alt="QR code de verificação de autenticidade" title="Aponte a câmera para verificar a autenticidade" style="width:36px;height:36px;image-rendering:pixelated;${emissaoProtocolo() ? '' : 'display:none;'}" ${emissaoProtocolo() ? `src="${qrDataUrl()}"` : ''}>`) : ''}
                            <span>${pageText}</span>
                        </div>
                    </div>
            `;
            if (bare) return conteudo;
            return `
                <div class="a4-page-footer-slot w-full mt-auto select-none" style="padding: 0 ${padRightMm}mm 6mm ${padLeftMm}mm;">${conteudo}
                </div>
            `;
        }

        /** Bloco "Cabeçalho" (quando aparece dentro do corpo da folha). */
        function renderHeaderBlock(bloco, tpl) {
                    return `
                        <div class="mb-3 page-break-avoid ${bloco.repetir_todas_folhas ? 'cabecalho-repetir-todas' : ''}">
                            <!-- Metadados de Emissão e Protocolo fora do card/borda principal (topo direito) -->
                            ${(bloco.exibirDataHora || bloco.exibirProtocolo) ? `
                                <div class="flex items-center justify-end gap-3 text-[10px] font-mono text-slate-500 pb-1 mb-1 border-b border-slate-200/80">
                                    ${bloco.exibirDataHora ? `
                                        <div class="flex items-center gap-1">
                                            <span class="text-slate-400">Emissão:</span>
                                            <span class="font-medium text-slate-600">${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>
                                        </div>
                                    ` : ''}
                                    ${bloco.exibirProtocolo ? `
                                        <div class="flex items-center gap-1 font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
                                            <span class="text-slate-400 font-normal">Protocolo:</span>
                                            <span data-emissao="protocolo">${emissaoTexto('protocolo')}</span>
                                        </div>
                                    ` : ''}
                                </div>
                            ` : ''}

                            <div class="flex items-center justify-between border-b-2 border-slate-900 pb-3 gap-4">
                                <div class="flex items-center gap-3">
                                    ${bloco.logo ? `
                                        <div class="w-14 h-14 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border border-slate-200">
                                            ${bloco.logo_url ? `<img src="${bloco.logo_url}" class="w-full h-full object-contain" />` : `<span class="material-symbols-outlined text-slate-800 text-[42px]">account_balance</span>`}
                                        </div>
                                    ` : ''}
                                    <div>
                                        <div class="text-[11px] uppercase font-bold text-slate-600 tracking-wider whitespace-pre-line">${(esc(bloco.subtitulo || 'Prefeitura Municipal')).replace(/\r?\n/g, '<br>')}</div>
                                        <div class="text-lg font-black uppercase text-slate-900 tracking-tight whitespace-pre-line">${(esc(bloco.titulo || tpl.nome || 'FICHA CADASTRAL DO IMÓVEL')).replace(/\r?\n/g, '<br>')}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
        }

        /** Bloco "Caixa de texto livre": texto com menções @ trocadas pelos dados da feição (editável pontualmente na tela). */
        function renderFreeTextBlock(bloco, idx, featureData) {
                    // Substitui @mentions na sequência do texto com o dado do campo sem o título
                    const processedText = replaceMentionsWithData(bloco.conteudo || '', featureData);
                    return `
                        <div class="mb-4 page-break-avoid">
                            ${bloco.titulo ? `
                                <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between">
                                    <span class="whitespace-pre-line">${(esc(bloco.titulo)).replace(/\r?\n/g, '<br>')}</span>
                                    <span class="no-print text-[10px] text-slate-400 font-normal">Clique para editar pontualmente</span>
                                </div>
                            ` : ''}
                            <div id="viewer-free-text-${idx}" 
                                 contenteditable="true" 
                                 class="free-text-editable text-xs text-slate-800 leading-relaxed p-3 bg-white border border-dashed border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all cursor-text print:border-none print:p-0" 
                                 style="white-space: pre-wrap; line-height: ${bloco.espacamento || '1.6'}; text-align: ${bloco.alinhamento || 'justify'};"
                                 title="Clique para editar este texto antes de exportar">${processedText}</div>
                        </div>
                    `;
        }

        /** Converte a seleção do bloco (ids ou títulos de aba) nos ids das abas realmente disponíveis. */
        function resolveTabIds(list, tabs) {
            const out = [];
            (Array.isArray(list) ? list : []).forEach(entry => {
                const e = (entry && typeof entry === 'object') ? (entry.id || entry.tabId || entry.title) : entry;
                const tab = tabs.find(t => String(t.id) === String(e)) ||
                            tabs.find(t => RD.norm(t.title) === RD.norm(e));
                if (tab && !out.includes(tab.id)) out.push(tab.id);
            });
            return out;
        }

        /** Abas visíveis (permissão e condição já aplicadas no snapshot; a condição é reaplicada por segurança). */
        function getReportSchema(featureData) {
            const tabs = RD.visibleTabs(formTabs(), featureData);
            return { tabs, fieldIndex: RD.buildFieldIndex(tabs) };
        }

        function getTableDensityClasses(density) {
            if (density === 'comfortable') {
                return { th: 'p-2 text-[10.5px] font-bold text-slate-700 uppercase border-b-2 border-slate-300', td: 'p-2 text-[11px] border-b border-slate-200' };
            }
            if (density === 'ultracompact') {
                return { th: 'py-0.5 px-1 text-[8.5px] font-bold text-slate-700 uppercase border-b-2 border-slate-300', td: 'py-0.5 px-1 text-[9px] font-medium border-b border-slate-200' };
            }
            return { th: 'py-1.5 px-2 text-[9.5px] font-bold text-slate-700 uppercase border-b-2 border-slate-300', td: 'py-1.5 px-2 text-[10px] border-b border-slate-200' };
        }

        function reportBlockNotice(bloco, defaultTitle, message) {
            return `
                <div class="mb-4 page-break-avoid">
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2">
                        ${esc(bloco.titulo || defaultTitle)}
                    </div>
                    <div class="p-4 text-center text-slate-400 italic text-xs border border-dashed border-slate-300 rounded-lg bg-slate-50/60">${esc(message)}</div>
                </div>`;
        }

        const MSG_TABS_UNAVAILABLE = 'As abas escolhidas para este quadro não estão disponíveis (ocultas por permissão ou condição, ou removidas do formulário). Revise a seleção de abas no construtor.';

        const TONS_ENTE = ['bg-purple-50/40', 'bg-blue-50/40', 'bg-emerald-50/40', 'bg-amber-50/40', 'bg-sky-50/40', 'bg-rose-50/40', 'bg-teal-50/40', 'bg-indigo-50/40'];
        /** Cor de fundo da linha no zebrado "Tons por Ente/Aba": estável para o mesmo título de aba. */
        function enteTom(tabTitle, odd) {
            const h = Math.abs(String(tabTitle || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0));
            return odd ? TONS_ENTE[h % TONS_ENTE.length] : 'bg-white';
        }

        function renderSyntheticTable(bloco, featureData, opts) {
            // opts (só no construtor): full = devolve o quadro inteiro (sem quebrar por folhas);
            //   edit = { titleClass, titleAttrs, metaExtra, th(c, cIdx, cols, rotuloHtml) } — controles por cima do mesmo desenho
            const edit = (opts && opts.edit) || null;
            const TITLE = 'Quadro Sintético de Vistorias (Histórico 1:N)';
            const { tabs, fieldIndex } = getReportSchema(featureData);

            const sortOrder = bloco.ordem_cronologica || 'desc';
            const groupByTab = !!bloco.ordenar_por_aba;
            const hasSelection = Array.isArray(bloco.abas_selecionadas) && bloco.abas_selecionadas.length > 0;
            const tabIds = hasSelection ? resolveTabIds(bloco.abas_selecionadas, tabs) : [];
            if (hasSelection && tabIds.length === 0) return reportBlockNotice(bloco, TITLE, MSG_TABS_UNAVAILABLE);

            let records = RD.buildRecords(tabs, featureData, { tabIds });
            records = RD.sortRecords(records, sortOrder, groupByTab, bloco.ordem_abas);
            if (records.length === 0) {
                return reportBlockNotice(bloco, TITLE, 'Nenhum registro cadastrado nas abas selecionadas para este imóvel.');
            }

            const rawCols = (Array.isArray(bloco.colunas) && bloco.colunas.length) ? bloco.colunas : ['aba', 'data', 'qtd_fotos'];
            const cols = rawCols.map(c => ({
                col: c,
                id: (c && typeof c === 'object') ? c.id : c,
                label: RD.columnLabel(c, fieldIndex)
            }));
            const ctx = { fieldIndex, geometryCenter: getGeometryCenter() };
            const dens = getTableDensityClasses(bloco.densidade || 'compact');
            const striping = bloco.zebrado || 'slate';
            const NUMERIC = ['area_m2', 'length_m', 'volume_m3', 'currency'];

            const cellHtml = (c, r) => {
                const cell = RD.cellFor(c.col, r, ctx);
                if (c.id === 'aba' || c.id === 'org') return getOrgBadgeHtml(r.tabTitle);
                if (c.id === 'situacao_ocupacao') return getStatusBadgeHtml(cell.text);
                if (c.id === 'situacao_recuo') return getRecuoBadgeHtml(cell.text);
                return cell.html;
            };

            const rowsHtml = records.map((r, i) => {
                const odd = i % 2 === 1;
                let rowBg = odd ? 'bg-slate-50/70' : 'bg-white';
                if (striping === 'sky') rowBg = odd ? 'bg-sky-50/50' : 'bg-white';
                else if (striping === 'white') rowBg = 'bg-white';
                else if (striping === 'ente') rowBg = enteTom(r.tabTitle, odd);
                const tds = cols.map(c => {
                    const field = RD.fieldForColumn(c.col, r, fieldIndex);
                    const numeric = field && NUMERIC.includes(String(field.type || '').toLowerCase());
                    return `<td class="${dens.td} border-r last:border-r-0 border-slate-200 whitespace-normal break-words ${numeric ? 'text-right font-mono' : 'text-slate-700'}">${cellHtml(c, r)}</td>`;
                }).join('');
                return `<tr data-split-row class="${rowBg}" style="page-break-inside: avoid;">
                    <td class="${dens.td} border-r border-slate-200 text-center font-mono text-[10px] text-slate-400">${i + 1}</td>${tds}</tr>`;
            });

            const theadHtml = `<thead><tr class="bg-slate-100 border-b border-slate-200 text-slate-700">
                <th class="${dens.th} border-r border-slate-200 w-8 text-center">#</th>
                ${cols.map((c, cIdx) => edit && edit.th
                    ? `<th class="${dens.th} border-r last:border-r-0 border-slate-200 group/th relative select-none whitespace-normal break-words leading-tight" style="min-width: 60px;">${edit.th(c, cIdx, cols, esc(c.label))}</th>`
                    : `<th class="${dens.th} border-r last:border-r-0 border-slate-200 whitespace-normal break-words leading-tight">${esc(c.label)}</th>`).join('')}
            </tr></thead>`;

            const meta = `${records.length} registro(s) • ${sortOrder === 'asc' ? 'Antigo → Recente' : 'Recente → Antigo'}${groupByTab ? ' • Por Aba' : ''}`;
            const chunkHtml = (rows, isFirst) => `
                <div class="mb-4">
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between">
                        <span class="whitespace-pre-line${edit && edit.titleClass ? ' ' + edit.titleClass : ''}"${edit && edit.titleAttrs ? ' ' + edit.titleAttrs : ''}>${esc(bloco.titulo || TITLE)}${isFirst ? '' : ' (continuação)'}</span>
                        <span class="text-[10px] font-mono text-slate-500 normal-case">${esc(meta)}${edit && edit.metaExtra ? edit.metaExtra : ''}</span>
                    </div>
                    <div class="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                        <table class="w-full text-left border-collapse">${theadHtml}<tbody>${rows.join('')}</tbody></table>
                    </div>
                </div>`;

            if (opts && opts.full) return chunkHtml(rowsHtml, true);
            return { split: { rowsHtml, chunkHtml } };
        }

        function renderAnalyticalLaudo(bloco, featureData) {
            const TITLE = 'Laudo Analítico e Caderno Fotográfico';
            const { tabs, fieldIndex } = getReportSchema(featureData);

            const sortOrder = bloco.ordem_cronologica || 'desc';
            const groupByTab = !!bloco.ordenar_por_aba;

            // Campos escolhidos (por id) e abas: escolhidas no bloco, ou deduzidas dos campos, ou todas as 1:N
            const rawSel = Array.isArray(bloco.campos_selecionados) ? bloco.campos_selecionados : [];
            const selFieldIds = rawSel.map(cf => (typeof cf === 'string') ? cf : (cf && (cf.rawId || cf.id))).filter(id => id && fieldIndex[id]);
            const hasTabSelection = Array.isArray(bloco.abas_selecionadas) && bloco.abas_selecionadas.length > 0;
            let tabIds = hasTabSelection ? resolveTabIds(bloco.abas_selecionadas, tabs) : [];
            if (!hasTabSelection && selFieldIds.length) {
                selFieldIds.forEach(fid => {
                    const ref = fieldIndex[fid];
                    if (ref && !tabIds.includes(ref.tab.id)) tabIds.push(ref.tab.id);
                });
            }
            if (hasTabSelection && tabIds.length === 0) return reportBlockNotice(bloco, TITLE, MSG_TABS_UNAVAILABLE);

            let records = RD.buildRecords(tabs, featureData, { tabIds });
            if (bloco.escopo === 'ultima') {
                const seenTab = new Set();
                records = RD.sortRecords(records, 'desc', true, bloco.ordem_abas).filter(r => !seenTab.has(r.tabId) && seenTab.add(r.tabId));
            }
            records = RD.sortRecords(records, sortOrder, true, bloco.ordem_abas);
            if (records.length === 0) {
                return reportBlockNotice(bloco, TITLE, 'Nenhum registro cadastrado nas abas selecionadas para este imóvel.');
            }

            const layout = bloco.layoutFotos || '2_cols';
            const gridClass = layout === '1_col' ? 'grid-cols-1' : (layout === 'grid_4' ? 'grid-cols-4' : 'grid-cols-2');
            const striping = bloco.zebrado || 'slate';
            const larguras = bloco.campos_larguras || {};
            const modes = bloco.campos_exibicao || {};   // { idDoCampo: 'lista' | 'imagem' }
            const fileMeta = { titulo: bloco.exibirLegenda !== false, autor: bloco.exibirResp !== false, data: bloco.exibirData !== false };
            const geometryCenter = getGeometryCenter();
            const WIDE = ['textarea', 'hiperlink', 'hiperlink_1n', 'attachment', 'cep'];

            const widthOf = (pct) => {
                const p = Math.round(pct);
                return p >= 98 ? '100%' : (p >= 65 ? '66.666%' : (p <= 28 ? '25%' : (p <= 38 ? '33.333%' : '50%')));
            };

            const photosHtml = (r) => {
                // Campos de foto que o usuário mandou exibir como LISTA saem como texto (título + arquivo)
                const listFields = (r.tab.fields || []).filter(f => String(f.type || '').toLowerCase() === 'photo' && modes[f.id] === 'lista');
                const listHtml = listFields.map(f => {
                    const v = FieldFormatter.toHtml(r.values[f.id], f, { fileMode: 'lista', fileMeta });
                    if (v === FieldFormatter.EMPTY) return '';
                    return `<div class="p-2 bg-white rounded-lg border border-slate-200 text-xs">
                        <span class="font-bold text-slate-500 uppercase text-[9px] block mb-0.5">${esc(f.label || f.name || f.id)}:</span>
                        <div class="text-[10.5px] text-slate-800 font-semibold break-words">${v}</div></div>`;
                }).join('');
                const photos = RD.recordPhotos(r, listFields.map(f => f.id));
                if (photos.length === 0) return listHtml;
                return `<div class="grid ${gridClass} gap-3 pt-1">${photos.map(p => {
                    const href = FieldFormatter.normalizeUrl(p.url);
                    if (!href) return '';
                    return `<div class="border border-slate-200 rounded-lg overflow-hidden bg-white flex flex-col shadow-2xs">
                        <a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="block h-44 bg-slate-100 overflow-hidden">
                            <img src="${esc(href)}" class="w-full h-full object-cover" alt="${esc(p.title)}" />
                        </a>
                        <div class="p-2 text-[10.5px] space-y-0.5 text-slate-600">
                            ${bloco.exibirLegenda !== false && p.title ? `<div class="font-bold text-slate-800 break-words">${esc(p.title)}</div>` : ''}
                            ${bloco.exibirData !== false && p.date ? `<div class="text-slate-500">Data: ${esc(p.date)}</div>` : ''}
                            ${bloco.exibirResp !== false && p.author ? `<div class="text-slate-500">Resp: ${esc(p.author)}</div>` : ''}
                        </div></div>`;
                }).join('')}</div>` + listHtml;
            };

            const cardHtml = (r, idx) => {
                let cardBg = idx % 2 === 1 ? 'bg-slate-100/70 border-slate-300' : 'bg-white border-slate-200';
                if (striping === 'sky') cardBg = idx % 2 === 1 ? 'bg-sky-50/50 border-sky-200' : 'bg-white border-slate-200';
                else if (striping === 'white') cardBg = 'bg-white border-slate-200';

                const fields = RD.recordFields(r, selFieldIds.length ? selFieldIds : null)
                    .filter(f => String(f.type || '').toLowerCase() !== 'photo');
                const cells = fields.map(f => {
                    const type = String(f.type || '').toLowerCase();
                    const pct = larguras[f.id] || (WIDE.includes(type) ? 100 : 50);
                    const w = widthOf(pct);
                    return `<div class="p-2 bg-white rounded-lg border border-slate-200 text-xs" style="flex: 0 0 ${w}; max-width: ${w}; width: ${w}; box-sizing: border-box;">
                        <span class="font-bold text-slate-500 uppercase text-[9px] block truncate mb-0.5">${esc(f.label || f.name || f.id)}:</span>
                        <div class="text-[10.5px] text-slate-800 font-semibold break-words whitespace-normal ${type === 'textarea' ? 'font-normal text-justify' : ''}">${FieldFormatter.toHtml(r.values[f.id], f, { geometryCenter, fileMode: modes[f.id], fileMeta })}</div>
                    </div>`;
                }).join('');

                return `<div class="border rounded-xl p-3 ${cardBg} space-y-2.5 shadow-2xs">
                    ${cells ? `<div class="flex flex-wrap gap-2">${cells}</div>` : '<div class="text-[10px] italic text-slate-400">Nenhum campo desta aba foi selecionado para o laudo.</div>'}
                    ${photosHtml(r)}
                </div>`;
            };

            // Uma "unidade" por registro (a primeira de cada aba leva o título do grupo). Cada unidade é indivisível.
            const perTabCount = {};
            records.forEach(r => { perTabCount[r.tabId] = (perTabCount[r.tabId] || 0) + 1; });
            const seenTab = {};
            const rowsHtml = records.map((r, i) => {
                let groupHeader = '';
                if (!seenTab[r.tabId]) {
                    seenTab[r.tabId] = true;
                    groupHeader = `<div class="flex items-center justify-between px-2.5 py-1.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 uppercase tracking-wide mb-2">
                        <div class="flex items-center gap-1.5"><span>${esc(bloco['custom_tab_title_' + r.tabId] || ('Aba / Ente: ' + r.tabTitle))}</span></div>
                        <span class="text-[9.5px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">${perTabCount[r.tabId]} registro(s)</span>
                    </div>`;
                }
                return `<div data-split-row>${groupHeader}${cardHtml(r, i)}</div>`;
            });

            const meta = `${records.length} registro(s) • ${sortOrder === 'asc' ? 'Antigo → Recente' : 'Recente → Antigo'}`;
            const chunkHtml = (rows, isFirst) => `
                <div class="mb-4">
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2.5 flex items-center justify-between">
                        <span class="whitespace-pre-line">${esc(bloco.titulo || TITLE)}${isFirst ? '' : ' (continuação)'}</span>
                        <span class="text-[10px] font-mono text-slate-500 normal-case">${esc(meta)}</span>
                    </div>
                    <div class="space-y-3">${rows.join('')}</div>
                </div>`;

            return { split: { rowsHtml, chunkHtml } };
        }

        return {
            resolveTabIds, getReportSchema, getTableDensityClasses, reportBlockNotice, renderSyntheticTable, renderAnalyticalLaudo,
            getOrgBadgeHtml, getStatusBadgeHtml, getRecuoBadgeHtml,
            getGeometryCenter, formatFieldValueForDisplay, readFieldRaw, isRichField, resolveFieldHtml, resolveFieldValue,
            getFieldWidthStyle, renderAttributeGrid, replaceMentionsWithData,
            getFooterPageNumberText, renderHeaderSlotHtml, renderFooterSlotHtml,
            renderHeaderBlock, renderFreeTextBlock
        };
    }

    return { create };
});
