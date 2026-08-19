// src/formRenderer.js
// MOTOR DE RENDERIZAÇÃO UNIFICADO (100% FIDELIDADE)

/**
 * Renderiza o formulário dinâmico mantendo 100% de fidelidade com o Form Builder.
 * @param {Array} formConfig - Array de abas e campos do schema JSON.
 * @param {Object} featureData - Objeto com as propriedades (properties) da feição atual.
 * @param {Boolean} isEditMode - true se for modo de edição, false para visualização.
 * @param {String} containerId - O ID da div onde o HTML será injetado.
 * @param {Object} options - { isPreview: false, formName: '' }
 */
window.renderDynamicForm = function(formConfig, featureData, isEditMode, containerId, options = {}) {
    if (!formConfig || formConfig.length === 0) return;
    
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!featureData) featureData = {};
    
    // Store current state globally for 1:N handlers
    window.currentFormFeatures = formConfig;
    window.currentFormContainerId = containerId;
    window.currentFormFeatureData = featureData;
    window.currentFormIsEditMode = isEditMode;
    window.currentFormIsPreview = options.isPreview || false;
    window.currentFormEditTabId = options.editTabId || null;
    
    let html = '<div class="flex flex-col border-t border-slate-200 dark:border-slate-700">';
    
    let primaryTabId = options.activeTabId || formConfig.find(t => t.isPrimary)?.id;
    if (!primaryTabId && formConfig.length > 0) primaryTabId = formConfig[0].id;
    
    formConfig.forEach((tab) => {
        let isPrimary = tab.id === primaryTabId;
        
        let recordCountHtml = '';
        if (tab.isMultiple) {
            let records = [];
            try {
                records = typeof featureData[tab.id] === 'string' ? JSON.parse(featureData[tab.id]) : (featureData[tab.id] || []);
            } catch(e) { records = []; }
            if (!Array.isArray(records)) records = [];
            
            if (records.length > 0) {
                recordCountHtml = `<span class="ml-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm group-hover:bg-white group-hover:text-emerald-600 transition-colors">${records.length}</span>`;
            }
        }
        
        html += `
            <div class="border-b last:border-b-0 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all accordion-section ${isPrimary ? 'border-l-4 border-l-sky-500 shadow-inner' : ''}" id="acc-section-${tab.id}" ${(tab.condition && tab.condition.enabled && tab.condition.fieldId) ? `data-condition-field="${tab.condition.fieldId}" data-condition-operator="${tab.condition.operator}" data-condition-value="${(tab.condition.value || '').toLowerCase()}"` : ''}>
                <button type="button" onclick="switchDynamicTab('${tab.id}')" class="group w-full px-3 py-3 sm:px-4 sm:py-3.5 flex items-center justify-center ${isPrimary ? 'bg-blue-50 dark:bg-blue-950/20' : 'bg-slate-50 dark:bg-transparent'} hover:bg-blue-600 dark:hover:bg-blue-600 active:bg-blue-700 dark:active:bg-blue-700 active:scale-95 hover:shadow-[0_0_25px_rgba(59,130,246,0.6)] hover:z-10 relative transition-all duration-300 ease-out overflow-hidden">
                    <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out"></div>
                    <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-white dark:group-hover:text-white uppercase tracking-wider flex items-center gap-2 text-center transition-all duration-300 group-hover:scale-105 group-hover:tracking-widest relative z-10">
                        ${isPrimary ? '<span class="material-symbols-outlined text-amber-500 group-hover:text-yellow-300 group-hover:drop-shadow-[0_0_8px_rgba(253,224,71,0.8)] transition-all text-[18px]">star</span>' : ''}
                        ${tab.title}
                        ${recordCountHtml}
                    </h3>
                </button>
                
                <div id="acc-content-${tab.id}" class="accordion-content transition-all duration-300 ${isPrimary ? 'block p-4 sm:p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900' : 'hidden'}">
        `;
        
        let isTabEditMode = false;
        if (isEditMode) {
            if (window.currentFormEditTabId) {
                isTabEditMode = (tab.id === window.currentFormEditTabId);
            } else {
                isTabEditMode = true;
            }
        }
        
        // Render Edit button inside the tab if we are NOT in edit mode
        if (!isEditMode) {
            html += `
            <div class="flex justify-center mb-4">
                <button type="button" onclick="toggleFeatureEditMode('${tab.id}')" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm flex items-center justify-center gap-2 w-full sm:w-auto text-sm">
                    <span class="material-symbols-outlined text-[18px]">edit</span>
                    Editar esta aba
                </button>
            </div>`;
        }

        if (tab.isMultiple) {
            html += renderMultipleTab(tab, featureData, isTabEditMode);
        } else {
            html += `<div class="flex flex-col gap-2">`;
            if (tab.fields && tab.fields.length > 0) {
                tab.fields.forEach(f => {
                    const value = featureData[f.id] !== undefined ? featureData[f.id] : '';
                    if (isTabEditMode) {
                        html += `<div>
                            <label class="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">${f.label}</label>
                            ${window.generateFeatureInputHtml ? window.generateFeatureInputHtml(f, value, true) : ''}
                        </div>`;
                    } else {
                        html += `
                        <div class="flex flex-col gap-0.5">
                            <div class="bg-blue-50/50 dark:bg-slate-800/50 border-l-[2px] border-cyan-500 rounded-md px-1.5 py-0.5 w-fit shadow-sm">
                                <span class="text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">${f.label}</span>
                            </div>
                            <div class="border border-dashed border-slate-300/50 dark:border-slate-600/50 rounded-md px-2 py-1 bg-slate-50/30 dark:bg-slate-900/10 min-h-[24px] flex flex-col justify-center">
                                ${window.generateFeatureInputHtml ? window.generateFeatureInputHtml(f, value, false) : ''}
                            </div>
                        </div>`;
                    }
                });
            }
            html += `</div>`;
        }
        
        if (isTabEditMode) {
            html += `
            <div class="mt-6 pt-4 border-t border-slate-200/50 dark:border-slate-700/50 flex flex-col-reverse sm:flex-row justify-end gap-3">
                <button type="button" onclick="cancelFeatureEdit()" class="px-5 py-2.5 bg-slate-100/50 dark:bg-slate-800/50 border border-slate-300/50 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors shadow-sm w-full sm:w-auto text-sm">
                    Cancelar
                </button>
                <button type="button" onclick="saveFeatureData()" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm flex items-center justify-center gap-2 w-full sm:w-auto text-sm">
                    <span class="material-symbols-outlined text-[18px]">save</span> Salvar
                </button>
            </div>`;
        }
        
        html += `
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    // Inject Tab Logic Engine for conditions
    html += `
    <script>
        function evaluateTabConditions() {
            const accordions = document.querySelectorAll('.accordion-section[data-condition-field]');
            accordions.forEach(acc => {
                const triggerFieldId = acc.getAttribute('data-condition-field');
                const operator = acc.getAttribute('data-condition-operator') || 'equals';
                const expectedValue = acc.getAttribute('data-condition-value');
                
                const triggerInput = document.querySelector(\`[data-key="\${triggerFieldId}"]\`) || document.querySelector(\`[id$="\${triggerFieldId}"]\`);
                
                let isMatch = false;
                if (triggerInput) {
                    const val = (triggerInput.value || '').toLowerCase().trim();
                    if (operator === 'equals') {
                        isMatch = (val === expectedValue);
                    } else if (operator === 'not_equals') {
                        isMatch = (val !== expectedValue && val !== '');
                    }
                }
                
                if (isMatch) {
                    acc.style.display = 'block';
                } else {
                    acc.style.display = 'none';
                }
            });
        }
        
        setTimeout(() => {
            const allInputs = document.querySelectorAll('.accordion-content input, .accordion-content select, .accordion-content textarea');
            allInputs.forEach(inp => {
                inp.addEventListener('input', evaluateTabConditions);
                inp.addEventListener('change', evaluateTabConditions);
            });
            evaluateTabConditions();
        }, 100);
    </script>
    `;
    
    container.innerHTML = html;
};

// Abaixo vamos colocar funções auxiliares de 1:N que a interface precisa
function renderMultipleTab(tab, featureData, isEditMode) {
    let records = [];
    try {
        records = typeof featureData[tab.id] === 'string' ? JSON.parse(featureData[tab.id]) : (featureData[tab.id] || []);
    } catch(e) { records = []; }
    if (!Array.isArray(records)) records = [];
    
    let html = `
        <!-- 1:N Table View -->
        <div id="multiple-table-view-${tab.id}">
            <div class="flex justify-between items-center mb-4">
                <h4 class="text-sm font-bold text-slate-700 dark:text-slate-300">${isEditMode ? 'Gerenciar Registros' : 'Histórico de Registros'}</h4>
                ${isEditMode ? `
                <button type="button" onclick="toggleMultipleForm('${tab.id}', true)" class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm font-medium shadow-sm">
                    <span class="material-symbols-outlined text-[18px]">add</span> Novo Registro
                </button>` : ''}
            </div>
            
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm overflow-hidden">
                <table class="w-full text-left text-xs sm:text-sm">
                    <thead class="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                        <tr>
                            <th class="px-4 py-3">Data</th>
                            <th class="px-4 py-3">Título</th>
                            ${isEditMode ? '<th class="px-4 py-3 text-right">Ações</th>' : ''}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200 dark:divide-slate-700" id="multiple-table-body-${tab.id}">
    `;
    
    if (records.length === 0) {
        html += `<tr id="empty-row-${tab.id}"><td colspan="3" class="px-4 py-6 text-center text-slate-500 italic">Nenhum registro encontrado.</td></tr>`;
    } else {
        records.forEach((rec, idx) => {
            const dateVal = rec['_created_at'] ? new Date(rec['_created_at']).toLocaleDateString('pt-BR') : 'Sem data';
            let summary = '';
            // Pega o primeiro campo preenchido pra usar como resumo
            if (tab.fields && tab.fields.length > 0) {
                const firstField = tab.fields.find(f => rec[f.id]);
                if (firstField) {
                    let val = rec[firstField.id];
                    try {
                        if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
                            let parsed = JSON.parse(val);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                summary = parsed[0].title || parsed[0].name || 'Arquivo Anexado';
                            } else if (parsed.title || parsed.name) {
                                summary = parsed.title || parsed.name;
                            } else {
                                summary = 'Registro Completo';
                            }
                        } else {
                            summary = String(val);
                        }
                    } catch(e) {
                        summary = String(val);
                    }
                }
            }
            if(summary.length > 50) summary = summary.substring(0, 50) + '...';
            
            html += `
                <tr class="bg-white even:bg-slate-50/50 dark:bg-slate-900 dark:even:bg-slate-800/40 hover:!bg-blue-50/80 dark:hover:!bg-blue-900/30 active:!bg-blue-100 dark:active:!bg-blue-900/50 transition-all duration-200 cursor-pointer" onclick="viewMultipleRecord('${tab.id}', ${idx})">
                    <td class="px-4 py-3 text-slate-900 dark:text-slate-100 font-medium">${dateVal}</td>
                    <td class="px-4 py-3 text-slate-500">${summary}</td>
                    ${isEditMode ? `
                    <td class="px-4 py-3 text-right" onclick="event.stopPropagation()">
                        <div class="flex items-center justify-end gap-1">
                            <button type="button" onclick="editMultipleRecord('${tab.id}', ${idx})" class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/20 rounded transition-colors" title="Editar"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                            <button type="button" onclick="deleteMultipleRecord('${tab.id}', ${idx})" class="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Excluir"><span class="material-symbols-outlined text-[18px]">delete</span></button>
                        </div>
                    </td>
                    ` : ''}
                </tr>
            `;
        });
    }
    
    html += `
                    </tbody>
                </table>
            </div>
            <input type="hidden" data-key="${tab.id}" id="multiple-data-${tab.id}" class="feature-data-input" value="${JSON.stringify(records).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">
        </div>
        
        <!-- 1:N Inline Form View -->
        <div id="multiple-form-view-${tab.id}" class="hidden">
            <div class="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
                <button type="button" onclick="toggleMultipleForm('${tab.id}', false)" class="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <span class="material-symbols-outlined">arrow_back</span>
                </button>
                <h4 class="text-base font-bold text-slate-800 dark:text-slate-100">Criar Novo Registro</h4>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-5" id="multiple-form-inputs-${tab.id}">
    `;
    
    if (tab.fields && tab.fields.length > 0) {
        tab.fields.forEach(f => {
            html += `<div class="${['textarea', 'attachment', 'photo', 'geolocation', 'cep', 'hiperlink'].includes(f.type) ? 'md:col-span-2' : ''}">
                <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">${f.label}</label>
                ${window.generateFeatureInputHtml ? window.generateFeatureInputHtml(f, '', true, true) : ''}
            </div>`;
        });
    }
    
    html += `
            </div>
            <div class="mt-6 flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-700 mobile-sticky-bottom">
                <button type="button" onclick="toggleMultipleForm('${tab.id}', false)" class="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-md font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm shadow-sm">Cancelar</button>
                <button type="button" onclick="saveMultipleRecord('${tab.id}')" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors text-sm shadow-sm flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">save</span> Salvar Registro</button>
            </div>
        </div>
    `;
    
    return html;
}

window.switchDynamicTab = function(tabId) {
    const content = document.getElementById('acc-content-' + tabId);
    const isAlreadyOpen = content && !content.classList.contains('hidden');

    document.querySelectorAll('.accordion-content').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('block', 'p-4', 'sm:p-6', 'border-t', 'border-slate-200', 'dark:border-slate-700', 'bg-slate-100', 'dark:bg-slate-900');
    });
    
    document.querySelectorAll('.accordion-section').forEach(el => {
        el.classList.remove('border-l-4', 'border-l-sky-500', 'shadow-inner');
        const btn = el.querySelector('button');
        if (btn) {
            btn.classList.remove('bg-blue-50', 'dark:bg-blue-950/20');
            btn.classList.add('bg-slate-50', 'dark:bg-transparent');
        }
    });
    
    if (content && !isAlreadyOpen) {
        window.currentActiveTabId = tabId;
        content.classList.remove('hidden');
        content.classList.add('block', 'p-4', 'sm:p-6', 'border-t', 'border-slate-200', 'dark:border-slate-700', 'bg-slate-100', 'dark:bg-slate-900');
        
        const section = document.getElementById('acc-section-' + tabId);
        if (section) {
            section.classList.add('border-l-4', 'border-l-sky-500', 'shadow-inner');
            const btn = section.querySelector('button');
            if (btn) {
                btn.classList.remove('bg-slate-50', 'dark:bg-transparent');
                btn.classList.add('bg-blue-50', 'dark:bg-blue-950/20');
            }
            setTimeout(() => {
                section.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    } else {
        window.currentActiveTabId = null;
    }
};

window.toggleMultipleForm = function(tabId, showForm) {
    const tableView = document.getElementById('multiple-table-view-' + tabId);
    const formView = document.getElementById('multiple-form-view-' + tabId);
    
    if (showForm) {
        tableView.classList.add('hidden');
        formView.classList.remove('hidden');
        
        // Reset subform
        const tab = window.currentFormFeatures ? window.currentFormFeatures.find(f => f.id === tabId) : null;
        if (tab && tab.fields) {
            const subformContainer = formView.querySelector('#multiple-form-inputs-' + tabId);
            if (subformContainer) {
                subformContainer.innerHTML = tab.fields.map(f => {
                    return `<div class="${['textarea', 'attachment', 'photo', 'geolocation', 'cep', 'hiperlink'].includes(f.type) ? 'md:col-span-2' : ''}">
                        <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">${f.label}</label>
                        ${typeof generateFeatureInputHtml !== 'undefined' ? generateFeatureInputHtml(f, '', true, true) : ''}
                    </div>`;
                }).join('');
            }
        }
        
        formView.removeAttribute('data-edit-index');
        const titleEl = formView.querySelector('h4');
        if (titleEl && tab) titleEl.innerText = 'Novo Registro em ' + tab.title;
        
        const saveBtn = formView.querySelector('button[onclick^="saveMultipleRecord"]');
        if (saveBtn) saveBtn.style.display = 'inline-flex';
    } else {
        formView.classList.add('hidden');
        tableView.classList.remove('hidden');
    }
};

window.editMultipleRecord = function(tabId, idx, readonly = false) {
    const hiddenDataInput = document.getElementById('multiple-data-' + tabId);
    let records = [];
    try { records = JSON.parse(hiddenDataInput.value); } catch(e){}
    
    const record = records[idx];
    if (!record) return;
    
    const tableView = document.getElementById('multiple-table-view-' + tabId);
    const formView = document.getElementById('multiple-form-view-' + tabId);
    
    tableView.classList.add('hidden');
    formView.classList.remove('hidden');
    
    const tab = window.currentFormFeatures ? window.currentFormFeatures.find(f => f.id === tabId) : null;
    if (tab && tab.fields) {
        const subformContainer = formView.querySelector('#multiple-form-inputs-' + tabId);
        if (subformContainer) {
            subformContainer.innerHTML = tab.fields.map(f => {
                return `<div class="${['textarea', 'attachment', 'photo', 'geolocation', 'cep', 'hiperlink'].includes(f.type) ? 'md:col-span-2' : ''}">
                    <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">${f.label}</label>
                    ${typeof generateFeatureInputHtml !== 'undefined' ? generateFeatureInputHtml(f, record[f.id] || '', !readonly, true) : ''}
                </div>`;
            }).join('');
        }
        
        const titleEl = formView.querySelector('h4');
        if (titleEl) {
            titleEl.innerText = readonly ? 'Visualizar Registro: ' + tab.title : 'Editar Registro: ' + tab.title;
        }
    }
    
    const actionButtonsContainer = formView.querySelector('.mobile-sticky-bottom');
    if (readonly) {
        formView.removeAttribute('data-edit-index'); // don't save view
        if (actionButtonsContainer) actionButtonsContainer.style.display = 'none';
    } else {
        formView.setAttribute('data-edit-index', idx);
        if (actionButtonsContainer) actionButtonsContainer.style.display = 'flex';
    }
};

window.viewMultipleRecord = function(tabId, idx) {
    window.editMultipleRecord(tabId, idx, true);
};

window.saveMultipleRecord = function(tabId) {
    const formView = document.getElementById('multiple-form-view-' + tabId);
    // Find all inputs in the subform
    const inputs = formView.querySelectorAll('.feature-data-input-subform, .feature-data-input'); 
    
    let newRecord = { _created_at: new Date().toISOString() };
    inputs.forEach(inp => {
        const key = inp.getAttribute('data-key');
        if(key && key !== tabId) newRecord[key] = inp.value;
    });
    
    const hiddenDataInput = document.getElementById('multiple-data-' + tabId);
    let records = [];
    try { records = JSON.parse(hiddenDataInput.value); } catch(e){}
    
    const editIndex = formView.getAttribute('data-edit-index');
    if (editIndex !== null && editIndex !== '') {
        const idx = parseInt(editIndex, 10);
        if (!isNaN(idx) && records[idx]) {
            newRecord._created_at = records[idx]._created_at || newRecord._created_at;
            records[idx] = newRecord;
        } else {
            records.push(newRecord);
        }
    } else {
        records.push(newRecord);
    }
    
    hiddenDataInput.value = JSON.stringify(records);
    
    if (window.currentFormFeatureData) {
        window.currentFormFeatureData[tabId] = JSON.stringify(records);
    }
    
    // Instead of appending a row, just re-render the whole dynamic form to keep it simple and clean
    if (typeof window.renderDynamicForm === 'function' && window.currentFormContainerId) {
        window.renderDynamicForm(window.currentFormFeatures, window.currentFormFeatureData, window.currentFormIsEditMode, window.currentFormContainerId, { isPreview: window.currentFormIsPreview, activeTabId: tabId });
    } else {
        toggleMultipleForm(tabId, false);
    }
};

window.deleteMultipleRecord = function(tabId, idx) {
    if(!confirm("Deseja realmente remover este registro?")) return;
    
    const hiddenDataInput = document.getElementById('multiple-data-' + tabId);
    let records = [];
    try { records = JSON.parse(hiddenDataInput.value); } catch(e){}
    
    records.splice(idx, 1);
    hiddenDataInput.value = JSON.stringify(records);
    
    if(window.currentFormFeatureData) {
        window.currentFormFeatureData[tabId] = JSON.stringify(records);
    }
    
    // Simplest way is to just hide the row or re-render
    const tbody = document.getElementById('multiple-table-body-' + tabId);
    if (tbody.children[idx]) {
        tbody.children[idx].style.display = 'none';
    }
};
