// src/reportBlocks.js
// DESENHISTAS DOS BLOCOS DO RELATÓRIO (HTML). Ficam num módulo para que o visualizador (relatorio_view.html) e, aos poucos,
// o construtor mostrem EXATAMENTE o mesmo desenho de cada tipo de bloco.
// create(ctx) devolve as funções; ctx traz o que depende da página:
//   esc(texto)                       escapa HTML
//   FieldFormatter                   src/fieldFormatter.js (formatação pelo TIPO do campo)
//   geometryCenter()                 centro da feição (campos de geolocalização não gravados) ou null
//   emissaoTexto(kind), emissaoTitulo(), emissaoProtocolo(), qrDataUrl()  protocolo/SHA-256 da emissão e o QR do rodapé
//   formFields()                     campos do cadastro (menções @ do texto livre)
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

        function renderAttributeGrid(bloco, featureData, fields) {
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

            if (colCount === 1) {
                return `
                    <div class="mb-4 page-break-avoid">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between">
                            <span class="whitespace-pre-line">${(esc(bloco.titulo || 'Dados Cadastrais')).replace(/\r?\n/g, '<br>')}</span>
                        </div>
                        <div class="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                            ${fldsToRender.map(f => {
                                const val = resolveFieldValue(f, featureData);
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
                <div class="mb-4 page-break-avoid">
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between">
                        <span class="whitespace-pre-line">${(esc(bloco.titulo || 'Dados Cadastrais')).replace(/\r?\n/g, '<br>')}</span>
                    </div>
                    <div class="flex flex-wrap gap-2.5">
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
                            return `
                                <div class="p-2 border border-slate-200 rounded-lg bg-slate-50/50" 
                                     style="flex: 0 0 ${widthStyle}; max-width: ${widthStyle}; width: ${widthStyle}; box-sizing: border-box;">
                                    <div class="text-[9.5px] uppercase font-bold text-slate-500 truncate">${esc(f.label)}</div>
                                    <div class="text-xs font-bold text-slate-800 mt-0.5 ${(isLongText || isRichField(f)) ? 'break-words whitespace-normal leading-snug' : 'truncate'}">${isRichField(f) ? resolveFieldHtml(f, featureData, fileModes[f.id]) : esc(val)}</div>
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

        function renderHeaderSlotHtml(hdrBloco, tpl, padLeftMm, padRightMm) {
            if (!hdrBloco) return '';
            return `
                <div class="a4-page-header-slot w-full select-none" style="padding: 6mm ${padRightMm}mm 0 ${padLeftMm}mm;">
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
                                    <div class="text-[11px] uppercase font-bold text-slate-600 tracking-wider whitespace-pre-line">${(esc(hdrBloco.subtitulo || 'Prefeitura Municipal')).replace(/\r?\n/g, '<br>')}</div>
                                    <div class="text-lg font-black uppercase text-slate-900 tracking-tight whitespace-pre-line">${(esc(hdrBloco.titulo || tpl.nome || 'FICHA CADASTRAL DO IMÓVEL')).replace(/\r?\n/g, '<br>')}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        function renderFooterSlotHtml(ftrBloco, pageIdx, totalPages, padLeftMm, padRightMm) {
            if (!ftrBloco) return '';
            const pageText = getFooterPageNumberText(pageIdx, totalPages, ftrBloco);
            return `
                <div class="a4-page-footer-slot w-full mt-auto select-none" style="padding: 0 ${padRightMm}mm 6mm ${padLeftMm}mm;">
                    <div class="border-t border-slate-300 pt-2 text-[10px] text-slate-500 flex items-center justify-between font-mono page-break-avoid w-full">
                        <div>
                            ${ftrBloco.exibirDataHora !== false ? `Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}` : ''}
                            ${ftrBloco.exibirHash !== false ? `<span class="ml-2 font-bold text-slate-600">SHA-256: <span data-emissao="hash" title="${emissaoTitulo()}">${emissaoTexto('hash')}</span></span>` : ''}
                        </div>
                        <div class="font-bold text-slate-700 flex items-center gap-2">
                            ${ftrBloco.exibirQr !== false ? `<img data-emissao="qr" alt="QR code de verificação de autenticidade" title="Aponte a câmera para verificar a autenticidade" style="width:36px;height:36px;image-rendering:pixelated;${emissaoProtocolo() ? '' : 'display:none;'}" ${emissaoProtocolo() ? `src="${qrDataUrl()}"` : ''}>` : ''}
                            <span>${pageText}</span>
                        </div>
                    </div>
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

        return {
            getOrgBadgeHtml, getStatusBadgeHtml, getRecuoBadgeHtml,
            getGeometryCenter, formatFieldValueForDisplay, readFieldRaw, isRichField, resolveFieldHtml, resolveFieldValue,
            getFieldWidthStyle, renderAttributeGrid, replaceMentionsWithData,
            getFooterPageNumberText, renderHeaderSlotHtml, renderFooterSlotHtml,
            renderHeaderBlock, renderFreeTextBlock
        };
    }

    return { create };
});
