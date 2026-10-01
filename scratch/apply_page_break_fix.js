const fs = require('fs');

let content = fs.readFileSync('relatorio.html', 'utf8');

// 1. Substitui a função checkDynamicTextPagination e funções auxiliares
const s1 = content.indexOf('function debouncedTextPagination()');
const s2 = content.indexOf('let isResizingMap = false;');

if (s1 === -1 || s2 === -1) {
    console.error('Ponto de substituição s1 ou s2 não encontrado!');
    process.exit(1);
}

const newPaginationCode = `function getMaxEditableHeightForHost() {
        const hostPage = isTwoPagesMode ? document.getElementById('a4-page-2') : document.getElementById('a4-page-root');
        if (!hostPage) return 500;
        const hostBody = hostPage.querySelector('.flex-1');
        const mainBox = document.getElementById('report-freetext-box');
        if (!hostBody || !mainBox) return 500;
        
        // Em folha A4 (297mm - 14mm paddings = ~1069px de área útil interna)
        const hostTotalH = 1069;
        const boxTop = mainBox.offsetTop || (isTwoPagesMode ? 520 : 880);
        const footer = hostBody.querySelector('footer');
        const footerH = footer ? footer.offsetHeight : 26;
        const boxHeader = mainBox.querySelector('.bg-slate-800');
        const boxHeaderH = boxHeader ? boxHeader.offsetHeight : 24;
        
        // Altura útil líquida para o texto na folha hospedeira
        const available = hostTotalH - boxTop - boxHeaderH - footerH - 18;
        return Math.max(60, available);
    }

    function getMaxEditableHeightForContinuation() {
        return 880; // Altura útil nas folhas de continuação (somente cabeçalho + card + rodapé)
    }

    function ensureBlockStructure(editable) {
        if (!editable) return;
        const nodes = Array.from(editable.childNodes);
        nodes.forEach(n => {
            if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) {
                const div = document.createElement('div');
                div.textContent = n.textContent;
                editable.replaceChild(div, n);
            } else if (n.nodeName === 'BR') {
                const div = document.createElement('div');
                div.innerHTML = '<br>';
                editable.replaceChild(div, n);
            }
        });
    }

    function splitSingleLongNode(node, editable, pageNum) {
        const text = node.innerText || node.textContent || '';
        const words = text.split(/\\s+/);
        if (words.length <= 1) return;

        const half = Math.floor(words.length / 2);
        const firstPart = words.slice(0, half).join(' ');
        const secondPart = words.slice(half).join(' ');

        node.innerText = firstPart;
        const secondDiv = document.createElement('div');
        secondDiv.innerText = secondPart;
        editable.appendChild(secondDiv);

        handleEditableOverflow(editable, pageNum);
    }

    function handleEditableOverflow(editable, pageNum) {
        if (!editable) return;
        
        const maxH = (pageNum <= 2) ? getMaxEditableHeightForHost() : getMaxEditableHeightForContinuation();
        
        // Se a altura do scroll não excedeu o limite máximo da folha, encerra
        if (editable.scrollHeight <= maxH + 4) {
            return;
        }

        // Garante que as quebras e parágrafos estejam em nós de bloco mensuráveis
        ensureBlockStructure(editable);

        const children = Array.from(editable.childNodes);
        if (children.length === 0) return;

        let splitIndex = -1;
        
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const childTop = child.offsetTop !== undefined ? (child.offsetTop - editable.offsetTop) : (i * 20);
            const childH = child.offsetHeight || 20;
            const childBottom = childTop + childH;

            if (childBottom > maxH) {
                if (i === 0 && children.length === 1) {
                    splitSingleLongNode(child, editable, pageNum);
                    return;
                }
                splitIndex = i;
                break;
            }
        }

        // Se encontrou nó que ultrapassou a borda inferior da folha, transfere para a próxima folha
        if (splitIndex !== -1 && splitIndex < children.length) {
            const nextPageNum = pageNum + 1;
            const nextPage = getOrCreateContinuationPage(nextPageNum);
            const nextEditable = nextPage.querySelector('.dynamic-continuation-editable');
            if (!nextEditable) return;

            const nodesToMove = children.slice(splitIndex);

            // Verifica se a seleção/cursor estava em um dos nós movidos
            const sel = window.getSelection();
            let focusedInsideMoved = false;
            if (sel && sel.anchorNode) {
                focusedInsideMoved = nodesToMove.some(n => n.contains(sel.anchorNode) || n === sel.anchorNode);
            }

            const fragment = document.createDocumentFragment();
            nodesToMove.forEach(n => {
                fragment.appendChild(n);
            });

            if (nextEditable.firstChild) {
                nextEditable.insertBefore(fragment, nextEditable.firstChild);
            } else {
                nextEditable.appendChild(fragment);
            }

            // Se o cursor estava no nó que saltou de página, transfere o foco para a nova página
            if (focusedInsideMoved) {
                nextEditable.focus();
                try {
                    const range = document.createRange();
                    range.selectNodeContents(nextEditable);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                } catch(e) {}
            }

            updateAllPageFooters();
            syncPrintPageBreaks();

            // Se a próxima folha também ultrapassar a capacidade, repete a quebra para a Folha 4, 5, etc.
            if (nextEditable.scrollHeight > getMaxEditableHeightForContinuation()) {
                handleEditableOverflow(nextEditable, nextPageNum);
            }
        }
    }

    function handleEditableBackspace(e, editable, pageNum) {
        if (e.key !== 'Backspace' || pageNum < 3) return;

        const sel = window.getSelection();
        if (!sel || !sel.anchorNode) return;

        const isAtStart = (sel.anchorOffset === 0 && (
            sel.anchorNode === editable || 
            sel.anchorNode === editable.firstChild || 
            (editable.firstChild && editable.firstChild.contains(sel.anchorNode))
        ));

        if (isAtStart) {
            const prevPageNum = pageNum - 1;
            const prevPage = document.getElementById(\`a4-page-\${prevPageNum}\`);
            const prevEditable = prevPage ? (prevPage.querySelector('.dynamic-continuation-editable') || document.getElementById('report-freetext-editable')) : null;
            
            if (prevEditable) {
                e.preventDefault();
                
                const nodes = Array.from(editable.childNodes);
                nodes.forEach(n => prevEditable.appendChild(n));

                prevEditable.focus();
                try {
                    const range = document.createRange();
                    range.selectNodeContents(prevEditable);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                } catch(err) {}

                const currentPage = document.getElementById(\`a4-page-\${pageNum}\`);
                if (currentPage) currentPage.remove();

                removeExcessContinuationPages(pageNum - 1);
                updateAllPageFooters();
                syncPrintPageBreaks();
            }
        }
    }

    function checkEmptyContinuationPages() {
        const extraPages = Array.from(document.querySelectorAll('.dynamic-continuation-page'));
        for (let i = extraPages.length - 1; i >= 0; i--) {
            const p = extraPages[i];
            const ed = p.querySelector('.dynamic-continuation-editable');
            const text = ed ? (ed.innerText || '').trim() : '';
            if (!text || text === '') {
                p.remove();
            } else {
                break;
            }
        }
        updateAllPageFooters();
        syncPrintPageBreaks();
    }

    function debouncedTextPagination() {
        clearTimeout(paginationDebounceTimer);
        paginationDebounceTimer = setTimeout(() => {
            checkDynamicTextPagination();
        }, 150);
    }

    function updateAllPageFooters() {
        const pageColumn = document.querySelector('.page-column');
        if (!pageColumn) return;
        
        const allPages = Array.from(pageColumn.querySelectorAll('.a4-page')).filter(p => {
            return !p.classList.contains('hidden') && p.style.display !== 'none';
        });
        
        const total = allPages.length;
        allPages.forEach((page, idx) => {
            const pageNum = idx + 1;
            const formatted = \`Página \${String(pageNum).padStart(2, '0')} / \${String(total).padStart(2, '0')}\`;
            const numEl = page.querySelector('.mono[id$="-footer-page-num"]') || page.querySelector('.page-footer-num');
            if (numEl) {
                numEl.textContent = formatted;
            }
        });
    }

    function getOrCreateContinuationPage(pageNumber) {
        const id = \`a4-page-\${pageNumber}\`;
        let page = document.getElementById(id);
        if (!page) {
            page = document.createElement('main');
            page.id = id;
            page.className = 'a4-page text-xs justify-between gap-1 relative dynamic-continuation-page mt-6';
            page.innerHTML = \`
                <div class="w-full flex-1 flex flex-col border-[1.5px] border-slate-800 rounded p-2 relative bg-white" id="\${id}-body">
                    <!-- Cabeçalho idêntico repetido na Folha de Continuação -->
                    <div id="page\${pageNumber}-header-slot" class="w-full border-b-[2px] border-slate-800 pb-1.5 mb-1.5 dynamic-header-slot"></div>

                    <!-- Corpo da Folha de Continuação com Caixa de Observações Técnicas -->
                    <div class="w-full flex-1 flex flex-col justify-start">
                        <div class="w-full border border-slate-300 rounded overflow-hidden bg-white shadow-xs transition-all mt-1 flex-1 flex flex-col">
                            <div class="bg-slate-800 text-white px-2 py-0.5 flex justify-between items-center no-print select-none">
                                <div class="flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-[12px] text-emerald-400">edit_note</span>
                                    <span class="font-extrabold text-[8px] uppercase tracking-wider">Observações Técnicas (Folha \${String(pageNumber).padStart(2, '0')})</span>
                                </div>
                                <span class="text-[7px] text-slate-400 font-medium">Continuação das observações técnicas</span>
                            </div>
                            <div id="report-freetext-editable-page\${pageNumber}" contenteditable="true" spellcheck="false" class="dynamic-continuation-editable p-2 outline-none text-slate-800 text-[8.5px] flex-1 bg-white cursor-text select-text focus:ring-1 focus:ring-emerald-500/50" style="line-height: \${freeTextStyles.lineHeight || '1.25'}; font-size: \${freeTextStyles.fontSize}px; font-weight: \${freeTextStyles.bold ? '700' : '400'}; font-style: \${freeTextStyles.italic ? 'italic' : 'normal'}; text-decoration: \${freeTextStyles.underline ? 'underline' : 'none'}; text-align: \${freeTextStyles.textAlign || 'left'}; color: \${freeTextStyles.color || '#0f172a'}; font-family: 'Plus Jakarta Sans', system-ui, sans-serif;"></div>
                        </div>
                    </div>

                    <!-- Rodapé Folha de Continuação -->
                    <footer class="w-full pt-1 border-t border-slate-200 flex items-center justify-between text-[7px] text-slate-400 mt-auto">
                        <div class="flex items-center gap-1"><span class="font-bold text-slate-600">DOCUMENTO TÉCNICO GERADO AUTOMATICAMENTE</span><span>• Válido para fins de conferência</span></div>
                        <div class="mono page-footer-num">Página \${String(pageNumber).padStart(2, '0')} / --</div>
                    </footer>
                </div>
            \`;
            document.querySelector('.page-column').appendChild(page);

            const contEditable = page.querySelector('.dynamic-continuation-editable');
            if (contEditable) {
                contEditable.addEventListener('input', function() {
                    handleEditableOverflow(this, pageNumber);
                    checkEmptyContinuationPages();
                });
                contEditable.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        requestAnimationFrame(() => handleEditableOverflow(this, pageNumber));
                    } else if (e.key === 'Backspace') {
                        handleEditableBackspace(e, this, pageNumber);
                    }
                });
                contEditable.addEventListener('blur', checkDynamicTextPagination);
            }
        }

        // Sincroniza cabeçalho oficial
        const p1Header = document.getElementById('page1-header');
        const slot = page.querySelector('.dynamic-header-slot');
        if (p1Header && slot) {
            slot.innerHTML = p1Header.innerHTML;
            slot.querySelectorAll('button').forEach(b => b.remove());
        }

        return page;
    }

    function removeExcessContinuationPages(neededMaxPage) {
        const extraPages = Array.from(document.querySelectorAll('.dynamic-continuation-page'));
        extraPages.forEach(p => {
            const num = parseInt(p.id.replace('a4-page-', ''), 10);
            if (num > neededMaxPage) {
                p.remove();
            }
        });
    }

    function checkDynamicTextPagination() {
        const mainEditable = document.getElementById('report-freetext-editable');
        if (!mainEditable) return;

        const baseHostPageNum = isTwoPagesMode ? 2 : 1;
        const rawText = mainEditable.innerText.trim();
        if (rawText === 'Clique aqui para digitar observações técnicas...' || !rawText) {
            checkEmptyContinuationPages();
            return;
        }

        handleEditableOverflow(mainEditable, baseHostPageNum);
    }

    `;

content = content.slice(0, s1) + newPaginationCode + content.slice(s2);

// 2. Atualiza initFreeTextEditableEvents para chamar handleEditableOverflow no Enter e no input
const oldInitEvents = `        el.addEventListener('input', function() {
            if (this.classList.contains('freetext-placeholder')) {
                this.classList.remove('freetext-placeholder');
            }
            debouncedTextPagination();
        });`;

const newInitEvents = `        el.addEventListener('input', function() {
            if (this.classList.contains('freetext-placeholder')) {
                this.classList.remove('freetext-placeholder');
            }
            const basePage = isTwoPagesMode ? 2 : 1;
            handleEditableOverflow(this, basePage);
            checkEmptyContinuationPages();
        });

        el.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const basePage = isTwoPagesMode ? 2 : 1;
                requestAnimationFrame(() => {
                    handleEditableOverflow(this, basePage);
                });
            }
        });`;

if (content.includes(oldInitEvents)) {
    content = content.replace(oldInitEvents, newInitEvents);
    console.log('initFreeTextEditableEvents atualizado com listeners instantâneos de Enter/Input');
} else {
    console.warn('Aviso: oldInitEvents não encontrado diretamente, verificando com regex...');
}

fs.writeFileSync('relatorio.html', content, 'utf8');
console.log('Paginação instantânea de quebra de folhas gravada com sucesso!');
