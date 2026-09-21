// src/reportFreeText.js
// EDITOR DO "CAIXA DE TEXTO LIVRE": barra de formatação (negrito, itálico, sublinhado, alinhamento, espaçamento), editor com menção @campo
// e a lista de campos do "@". Usado pelo construtor (folha clássica) e pela página real (relatorio_view.html?modo=edicao).
// create(ctx): ctx = { getFields(): campos do formulário, save(indice, html): grava o texto, setLineHeight(indice, valor): grava o espaçamento }.
// Os botões chamam ReportBuilder.<função>(...): no construtor é o próprio construtor; na página real é a ponte de mensagens.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReportFreeText = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const escPadrao = (s) => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let fechamentoLigado = false;

    function create(ctx) {
        ctx = ctx || {};
        const esc = ctx.esc || escPadrao;

        function execFormat(command, value = null) {
            const cmd = String(command || '').toLowerCase();
            
            // 1. Executa formatação padrão no documento para texto comum selecionado
            document.execCommand(command, false, value);

            // 2. Detecta se há tags de menção (@campo) selecionadas ou ativas
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;

            const range = sel.getRangeAt(0);
            const tagsToFormat = new Set();

            // Verifica o container comum e os nós no range
            let container = range.commonAncestorContainer;
            if (container.nodeType === Node.TEXT_NODE) container = container.parentElement;

            if (container) {
                if (container.classList && container.classList.contains('mention-tag')) {
                    tagsToFormat.add(container);
                } else if (container.querySelectorAll) {
                    const candidates = container.querySelectorAll('.mention-tag');
                    candidates.forEach(tag => {
                        try {
                            if (sel.containsNode(tag, true) || (range.intersectsNode && range.intersectsNode(tag))) {
                                tagsToFormat.add(tag);
                            }
                        } catch(e) {}
                    });
                }
            }

            // Fallback: verifica se o cursor/âncora está dentro de uma tag
            if (sel.anchorNode) {
                let el = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
                if (el && el.closest('.mention-tag')) {
                    tagsToFormat.add(el.closest('.mention-tag'));
                }
            }
            if (sel.focusNode) {
                let el = sel.focusNode.nodeType === Node.ELEMENT_NODE ? sel.focusNode : sel.focusNode.parentElement;
                if (el && el.closest('.mention-tag')) {
                    tagsToFormat.add(el.closest('.mention-tag'));
                }
            }

            // 3. Aplica ou alterna o estilo de formatação (Negrito, Itálico, Sublinhado) diretamente nas tags encontradas
            if (tagsToFormat.size > 0) {
                tagsToFormat.forEach(tag => {
                    if (cmd === 'bold') {
                        const isBold = tag.getAttribute('data-format-bold') === 'true';
                        if (isBold) {
                            tag.removeAttribute('data-format-bold');
                            tag.style.fontWeight = 'normal';
                            tag.classList.remove('font-bold', 'font-black', 'is-bold');
                        } else {
                            tag.setAttribute('data-format-bold', 'true');
                            tag.style.fontWeight = 'bold';
                            tag.classList.add('font-bold', 'font-black', 'is-bold');
                        }
                    } else if (cmd === 'italic') {
                        const isItalic = tag.getAttribute('data-format-italic') === 'true';
                        if (isItalic) {
                            tag.removeAttribute('data-format-italic');
                            tag.style.fontStyle = 'normal';
                            tag.classList.remove('italic');
                        } else {
                            tag.setAttribute('data-format-italic', 'true');
                            tag.style.fontStyle = 'italic';
                            tag.classList.add('italic');
                        }
                    } else if (cmd === 'underline') {
                        const isUnderline = tag.getAttribute('data-format-underline') === 'true';
                        if (isUnderline) {
                            tag.removeAttribute('data-format-underline');
                            tag.style.textDecoration = 'none';
                            tag.classList.remove('underline');
                        } else {
                            tag.setAttribute('data-format-underline', 'true');
                            tag.style.textDecoration = 'underline';
                            tag.classList.add('underline');
                        }
                    }
                });
            }

            // Localiza o editor ativo e salva imediatamente o conteúdo com as tags formatadas
            let activeEditor = container ? container.closest('.free-text-editor') : null;
            if (!activeEditor && tagsToFormat && tagsToFormat.size > 0) {
                const firstTag = tagsToFormat.values().next().value;
                if (firstTag) activeEditor = firstTag.closest('.free-text-editor');
            }
            if (!activeEditor) {
                activeEditor = document.querySelector('.free-text-editor:focus');
            }
            if (activeEditor) {
                const blockIdxAttr = activeEditor.id ? activeEditor.id.replace('free-text-editor-', '') : null;
                const blockIdx = blockIdxAttr !== null ? parseInt(blockIdxAttr, 10) : null;
                if (blockIdx !== null && !isNaN(blockIdx)) {
                    saveFreeTextContent(blockIdx, activeEditor.innerHTML);
                }
            }
        }

        function changeLineHeight(blockIndex, lineHeight) {
            const editor = document.getElementById(`free-text-editor-${blockIndex}`);
            if (editor) {
                editor.style.lineHeight = lineHeight;
            }
            if (ctx.setLineHeight) ctx.setLineHeight(blockIndex, lineHeight);
        }

        function saveFreeTextContent(blockIndex, html) {
            if (ctx.save) ctx.save(blockIndex, html);
        }

        let activeMentionState = {
            blockIndex: null,
            query: '',
            selectedIndex: 0,
            activeRange: null
        };

        function handleFreeTextInput(event, blockIndex) {
            const selection = window.getSelection();
            if (!selection || !selection.rangeCount) return;

            const range = selection.getRangeAt(0);
            const node = range.startContainer;
            if (node.nodeType === Node.TEXT_NODE) {
                const textBeforeCaret = node.textContent.slice(0, range.startOffset);
                const atMatch = textBeforeCaret.match(/@([\w\u00C0-\u017F\s]*)$/);
                if (atMatch) {
                    const query = atMatch[1].trim();
                    activeMentionState.blockIndex = blockIndex;
                    activeMentionState.query = query;
                    activeMentionState.activeRange = range.cloneRange();
                    renderMentionDropdown(blockIndex, query);
                    return;
                }
            }
            hideMentionDropdown(blockIndex);
        }

        function handleFreeTextKeyDown(event, blockIndex) {
            // Atalhos de teclado rápidos para formatação rica (Ctrl+B, Ctrl+I, Ctrl+U)
            if (event.ctrlKey || event.metaKey) {
                const k = event.key.toLowerCase();
                if (k === 'b') {
                    event.preventDefault();
                    execFormat('bold');
                    return;
                }
                if (k === 'i') {
                    event.preventDefault();
                    execFormat('italic');
                    return;
                }
                if (k === 'u') {
                    event.preventDefault();
                    execFormat('underline');
                    return;
                }
            }

            const dropdown = document.getElementById(`mention-dropdown-${blockIndex}`);
            if (!dropdown || dropdown.classList.contains('hidden')) return;

            const items = dropdown.querySelectorAll('.mention-dropdown-item');
            if (items.length === 0) return;

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                activeMentionState.selectedIndex = (activeMentionState.selectedIndex + 1) % items.length;
                updateMentionDropdownHighlight(items);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                activeMentionState.selectedIndex = (activeMentionState.selectedIndex - 1 + items.length) % items.length;
                updateMentionDropdownHighlight(items);
            } else if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                const activeItem = items[activeMentionState.selectedIndex];
                if (activeItem) {
                    const fId = activeItem.getAttribute('data-field-id');
                    const fName = activeItem.getAttribute('data-field-name');
                    const fLabel = activeItem.getAttribute('data-field-label');
                    const tTitle = activeItem.getAttribute('data-tab-title') || '';
                    insertMentionField(blockIndex, fId, fName, fLabel, tTitle);
                }
            } else if (event.key === 'Escape') {
                hideMentionDropdown(blockIndex);
            }
        }

        function showMentionDropdown(blockIndex) {
            activeMentionState.blockIndex = blockIndex;
            activeMentionState.query = '';
            renderMentionDropdown(blockIndex, '');
        }

        function renderMentionDropdown(blockIndex, query) {
            const dropdown = document.getElementById(`mention-dropdown-${blockIndex}`);
            if (!dropdown) return;

            const allFields = (ctx.getFields ? ctx.getFields() : []) || [];
            const cleanQuery = (query || '').toLowerCase().trim();
            const filtered = allFields.filter(f => 
                (f.label && f.label.toLowerCase().includes(cleanQuery)) || 
                (f.name && f.name.toLowerCase().includes(cleanQuery)) ||
                (f.tabTitle && f.tabTitle.toLowerCase().includes(cleanQuery))
            );

            if (filtered.length === 0) {
                dropdown.innerHTML = '<div class="p-2.5 text-[11px] text-slate-400 italic text-center">Nenhum campo encontrado com "@' + esc(query) + '"</div>';
                dropdown.classList.remove('hidden');
                elevarBlocoDaLista(dropdown, true);
                return;
            }

            activeMentionState.selectedIndex = 0;
            dropdown.innerHTML = `
                <div class="px-2.5 py-1.5 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-t-lg">
                    <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[13px] text-sky-500">alternate_email</span> Campos com Origem da Aba</span>
                    <span class="text-[9px] font-mono">${filtered.length} encontrados</span>
                </div>
                <div class="py-1 space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
                    ${filtered.map((f, i) => `
                        <div class="mention-dropdown-item flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${i === 0 ? 'bg-sky-100 text-sky-900 dark:bg-sky-900/60 dark:text-sky-100 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}" 
                             data-field-id="${esc(f.id)}" 
                             data-field-name="${esc(f.name)}" 
                             data-field-label="${esc(f.label)}"
                             data-tab-title="${esc(f.tabTitle || 'Aba Geral')}"
                             onmousedown="event.preventDefault(); ReportBuilder.insertMentionField(${blockIndex}, '${esc(f.id)}', '${esc(f.name)}', '${esc(f.label)}', '${esc(f.tabTitle || 'Aba Geral')}')">
                            <div class="flex items-center gap-2 min-w-0 flex-1">
                                <span class="material-symbols-outlined text-[15px] text-sky-500 shrink-0">alternate_email</span>
                                <div class="flex flex-col min-w-0">
                                    <span class="truncate text-xs font-bold text-slate-800 dark:text-slate-100">${esc(f.label)}</span>
                                    <div class="flex items-center gap-1 text-[10.5px] text-slate-500 dark:text-slate-400">
                                        <span class="material-symbols-outlined text-[12px] text-slate-400">tab</span>
                                        <span>Aba: <strong class="text-slate-700 dark:text-slate-200 font-semibold">${esc(f.tabTitle || 'Aba Geral')}</strong></span>
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-1 shrink-0 ml-2">
                                ${f.condition ? `<span class="text-[8.5px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 px-1 py-0.2 rounded font-mono" title="Condicionado a: ${esc(f.condition)}">Cond.</span>` : ''}
                                <span class="text-[9px] font-mono text-slate-400 dark:text-slate-400 uppercase bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">${esc(f.type || 'text')}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            dropdown.classList.remove('hidden');
            elevarBlocoDaLista(dropdown, true);
        }

        /**
         * Cada bloco da folha cria a própria camada (z-10): sem isto, os blocos de baixo (campos, botões de largura) ficavam
         * PINTADOS POR CIMA da lista aberta, e ela parecia transparente. Enquanto a lista está aberta, o bloco dela sobe.
         */
        function elevarBlocoDaLista(dropdown, aberta) {
            const bloco = dropdown && dropdown.closest ? dropdown.closest('.report-block-item') : null;
            if (bloco && bloco.style) bloco.style.zIndex = aberta ? '60' : '';
        }

        function updateMentionDropdownHighlight(items) {
            items.forEach((item, idx) => {
                if (idx === activeMentionState.selectedIndex) {
                    item.className = 'mention-dropdown-item flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors bg-sky-100 text-sky-900 dark:bg-sky-900/60 dark:text-sky-100 font-bold';
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.className = 'mention-dropdown-item flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300';
                }
            });
        }

        function hideMentionDropdown(blockIndex) {
            const dropdown = document.getElementById(`mention-dropdown-${blockIndex}`);
            if (dropdown) { dropdown.classList.add('hidden'); elevarBlocoDaLista(dropdown, false); }
        }

        function insertMentionField(blockIndex, fieldId, fieldName, fieldLabel, tabTitle = '') {
            const editor = document.getElementById(`free-text-editor-${blockIndex}`);
            if (!editor) return;

            editor.focus();
            const selection = window.getSelection();

            // Se há um @ digitado no cursor, remove o texto do @query
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const node = range.startContainer;
                if (node && node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent;
                    const atIndex = text.lastIndexOf('@', range.startOffset);
                    if (atIndex !== -1) {
                        node.textContent = text.slice(0, atIndex) + text.slice(range.startOffset);
                        range.setStart(node, atIndex);
                        range.collapse(true);
                    }
                }
            }

            // Insere o token formatado com a indicação visual da aba (sem negrito forçado por padrão para permitir formatação rica personalizada)
            const displayTag = tabTitle ? `@${fieldLabel} (${tabTitle})` : `@${fieldLabel}`;
            const tokenHtml = `<span class="mention-tag inline-block bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200 px-1.5 py-0.5 rounded font-mono text-[11px] select-all align-middle cursor-pointer transition-all hover:ring-1 hover:ring-sky-400" data-field-id="${fieldId}" data-field-name="${fieldName}" data-tab-title="${tabTitle}" contenteditable="false" title="Clique para selecionar e aplicar Negrito, Itálico ou Sublinhado • Campo: ${fieldLabel} • Aba: ${tabTitle}">${displayTag}</span>&nbsp;`;
            document.execCommand('insertHTML', false, tokenHtml);

            hideMentionDropdown(blockIndex);
            saveFreeTextContent(blockIndex, editor.innerHTML);
        }


        /** Desenho do bloco em modo edição: título, barra de ferramentas, editor (texto bruto com as menções) e a lista do "@". */
        function renderEditor(bloco, index) {
                const lineHeight = bloco.espacamento || '1.6';
                const textAlign = bloco.alinhamento || 'justify';
                return `
                    <style>
                        .mention-tag { user-select: all; cursor: pointer; transition: all 0.15s ease-in-out; }
                        .mention-tag[data-format-bold="true"], .mention-tag.font-bold, .mention-tag.font-black, .mention-tag.is-bold { font-weight: 700 !important; }
                        .mention-tag[data-format-italic="true"], .mention-tag.italic { font-style: italic !important; }
                        .mention-tag[data-format-underline="true"], .mention-tag.underline { text-decoration: underline !important; text-underline-offset: 2px !important; }
                    </style>
                    <div class="mb-4 caixa-texto-livre-block page-break-avoid" data-block-index="${index}">
                        ${bloco.titulo ? `
                            <div class="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-1.5 flex items-center justify-between">
                                <span class="cursor-text hover:bg-sky-50 px-1 rounded whitespace-pre-line" ondblclick="ReportBuilder.enableInlineEdit(this, ${index}, 'titulo')">${(esc(bloco.titulo)).replace(/\r?\n/g, '<br>')}</span>
                                <span class="text-[10px] font-mono text-slate-400 no-print">Caixa de Texto Livre</span>
                            </div>
                        ` : ''}

                        <!-- Barra de Ferramentas Rica (Negrito, Itálico, Sublinhado, Alinhamento, Espaçamento e @) -->
                        <div class="rich-text-toolbar no-print flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-t-lg select-none text-slate-700 dark:text-slate-200 text-xs">
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('bold')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded font-bold transition-colors cursor-pointer" title="Negrito (Ctrl+B)">
                                <span class="material-symbols-outlined text-[16px]">format_bold</span>
                            </button>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('italic')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded italic transition-colors cursor-pointer" title="Itálico (Ctrl+I)">
                                <span class="material-symbols-outlined text-[16px]">format_italic</span>
                            </button>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('underline')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded underline transition-colors cursor-pointer" title="Sublinhado (Ctrl+U)">
                                <span class="material-symbols-outlined text-[16px]">format_underlined</span>
                            </button>
                            <div class="h-3.5 w-px bg-slate-300 dark:bg-slate-600 mx-0.5"></div>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('justifyLeft')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded transition-colors cursor-pointer" title="Alinhar à Esquerda">
                                <span class="material-symbols-outlined text-[16px]">format_align_left</span>
                            </button>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('justifyCenter')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded transition-colors cursor-pointer" title="Centralizar">
                                <span class="material-symbols-outlined text-[16px]">format_align_center</span>
                            </button>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('justifyRight')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded transition-colors cursor-pointer" title="Alinhar à Direita">
                                <span class="material-symbols-outlined text-[16px]">format_align_right</span>
                            </button>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.execFormat('justifyFull')" class="p-1 hover:bg-white dark:hover:bg-slate-700 rounded transition-colors cursor-pointer" title="Justificar">
                                <span class="material-symbols-outlined text-[16px]">format_align_justify</span>
                            </button>
                            <div class="h-3.5 w-px bg-slate-300 dark:bg-slate-600 mx-0.5"></div>
                            <select onchange="ReportBuilder.changeLineHeight(${index}, this.value)" class="text-[10.5px] py-0.5 px-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded cursor-pointer" title="Espaçamento entre linhas">
                                <option value="1.2" ${lineHeight === '1.2' ? 'selected' : ''}>Linhas 1.2</option>
                                <option value="1.4" ${lineHeight === '1.4' ? 'selected' : ''}>Linhas 1.4</option>
                                <option value="1.6" ${lineHeight === '1.6' ? 'selected' : ''}>Linhas 1.6 (Padrão)</option>
                                <option value="2.0" ${lineHeight === '2.0' ? 'selected' : ''}>Linhas 2.0 (Duplo)</option>
                            </select>
                            <div class="h-3.5 w-px bg-slate-300 dark:bg-slate-600 mx-0.5"></div>
                            <button type="button" onmousedown="event.preventDefault(); ReportBuilder.showMentionDropdown(${index})" class="px-2 py-0.5 bg-sky-100 hover:bg-sky-200 dark:bg-sky-900/60 dark:hover:bg-sky-800 text-sky-800 dark:text-sky-200 rounded font-bold text-[10.5px] flex items-center gap-1 cursor-pointer transition-colors" title="Inserir Campo Cadastral (@)">
                                <span class="material-symbols-outlined text-[14px]">alternate_email</span>
                                <span>@ Inserir Campo</span>
                            </button>
                        </div>

                        <!-- Editor de Texto Livre com suporte a @mention e quebras normais -->
                        <div class="relative">
                            <div id="free-text-editor-${index}" 
                                 contenteditable="true" 
                                 spellcheck="true"
                                 class="free-text-editor min-h-[60px] text-xs text-slate-800 dark:text-slate-900 p-3 bg-white border border-slate-200 rounded-b-lg focus:outline-none focus:ring-1 focus:ring-sky-500/50 transition-all cursor-text print:border-none print:p-0" 
                                 style="white-space: pre-wrap; line-height: ${lineHeight}; text-align: ${textAlign};" 
                                 oninput="ReportBuilder.handleFreeTextInput(event, ${index})" 
                                 onkeydown="ReportBuilder.handleFreeTextKeyDown(event, ${index})"
                                 onblur="ReportBuilder.saveFreeTextContent(${index}, this.innerHTML)">${bloco.conteudo || 'Digite seu texto livre aqui...'}</div>
                            
                            <!-- Dropdown de Autocomplete @ (injetado via JS com identificação de Abas) -->
                            <div id="mention-dropdown-${index}" class="hidden absolute left-2 top-2 z-50 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl max-h-72 w-80 sm:w-96 overflow-y-auto p-1.5 text-xs"></div>
                        </div>
                    </div>
                `;

        }

        // A lista de campos do "@" fecha ao clicar em qualquer lugar fora dela (o botão "@ Inserir Campo" só a abre)
        if (!fechamentoLigado && typeof document !== 'undefined' && document.addEventListener) {
            fechamentoLigado = true;
            document.addEventListener('mousedown', function (e) {
                const alvo = e.target;
                if (alvo && alvo.closest && (alvo.closest('[id^="mention-dropdown-"]') || alvo.closest('[onmousedown*="showMentionDropdown"]'))) return;
                document.querySelectorAll('[id^="mention-dropdown-"]').forEach(function (d) {
                    if (!d.classList.contains('hidden')) { d.classList.add('hidden'); elevarBlocoDaLista(d, false); }
                });
            });
        }

        return { renderEditor, execFormat, changeLineHeight, saveFreeTextContent, handleFreeTextInput, handleFreeTextKeyDown, showMentionDropdown, insertMentionField, hideMentionDropdown };
    }

    return { create };
});
