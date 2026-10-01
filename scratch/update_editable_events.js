const fs = require('fs');
let content = fs.readFileSync('relatorio.html', 'utf8');

const targetIdx = content.indexOf('function initFreeTextEditableEvents()');
if (targetIdx !== -1) {
    const endFnIdx = content.indexOf('}\r\n</script>', targetIdx) !== -1 
        ? content.indexOf('}\r\n</script>', targetIdx) 
        : content.indexOf('}\n</script>', targetIdx);

    const newFn = `function initFreeTextEditableEvents() {
        const el = document.getElementById('report-freetext-editable');
        if (!el) return;

        if (el.innerText.trim() === 'Clique aqui para digitar observações técnicas...') {
            el.classList.add('freetext-placeholder');
        }

        el.addEventListener('focus', function() {
            if (this.innerText.trim() === 'Clique aqui para digitar observações técnicas...') {
                this.innerText = '';
                this.classList.remove('freetext-placeholder');
            }
        });

        el.addEventListener('blur', function() {
            if (!this.innerText.trim()) {
                this.innerText = 'Clique aqui para digitar observações técnicas...';
                this.classList.add('freetext-placeholder');
            }
            checkDynamicTextPagination();
        });

        el.addEventListener('input', function() {
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
        });

        el.addEventListener('paste', function() {
            setTimeout(() => {
                const basePage = isTwoPagesMode ? 2 : 1;
                handleEditableOverflow(this, basePage);
                checkEmptyContinuationPages();
            }, 50);
        });
    }`;

    content = content.slice(0, targetIdx) + newFn + content.slice(endFnIdx + 1);
    fs.writeFileSync('relatorio.html', content, 'utf8');
    console.log('initFreeTextEditableEvents updated successfully!');
} else {
    console.error('initFreeTextEditableEvents not found');
}
