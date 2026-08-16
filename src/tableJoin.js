let currentJoinThemeId = null;
let currentJoinCsvData = null;

function triggerTableUpload(themeId) {
    document.getElementById(`table-upload-${themeId}`).click();
}

function handleTableUpload(event, themeId) {
    const file = event.target.files[0];
    if (!file) return;
    
    currentJoinThemeId = themeId;
    
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            if (results.errors.length && results.errors[0].code !== 'TooFewFields') {
                console.error('Erro ao ler CSV:', results.errors);
                alert('Ocorreu um erro ao ler o arquivo CSV.');
                return;
            }
            
            currentJoinCsvData = results.data;
            if (currentJoinCsvData.length === 0) {
                alert('O arquivo CSV está vazio.');
                return;
            }
            
            const headers = Object.keys(currentJoinCsvData[0]);
            openTableJoinModal(themeId, headers, currentJoinCsvData.length);
        },
        error: function(err) {
            console.error('Erro PapaParse:', err);
            alert('Não foi possível ler o arquivo.');
        }
    });
    
    // Reset file input
    event.target.value = '';
}

function openTableJoinModal(themeId, csvHeaders, rowCount) {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;
    
    document.getElementById('table-join-info').innerText = `Planilha carregada com ${rowCount} linhas. Configure o vínculo com a camada "${theme.name}".`;
    
    // Populate CSV headers select
    const csvKeySelect = document.getElementById('table-join-csv-key');
    csvKeySelect.innerHTML = csvHeaders.map(h => `<option value="${h}">${h}</option>`).join('');
    
    // Populate Map Key select
    let formFields = [];
    let tabs = [];
    if (theme.formId) {
        const form = allForms.find(f => f.id === theme.formId);
        if (form && form.tabs) {
            tabs = form.tabs;
            form.tabs.forEach(tab => {
                if (!tab.isMultiple && tab.fields) {
                    formFields = formFields.concat(tab.fields);
                }
            });
        }
    }
    
    const mapKeySelect = document.getElementById('table-join-map-key');
    mapKeySelect.innerHTML = formFields.map(f => `<option value="${f.id}">${f.label}</option>`).join('');
    
    // Populate Target Tabs select (only 1:N tabs)
    const targetTabSelect = document.getElementById('table-join-target-tab');
    const multipleTabs = tabs.filter(t => t.isMultiple);
    targetTabSelect.innerHTML = multipleTabs.map(t => `<option value="${t.id}">${t.title}</option>`).join('');
    
    if (multipleTabs.length === 0) {
        // Disable 1N mode if no multiple tabs exist
        const modeSelect = document.getElementById('table-join-mode');
        modeSelect.value = '11';
        modeSelect.querySelector('option[value="1N"]').disabled = true;
        document.getElementById('table-join-tab-container').style.display = 'none';
        document.getElementById('table-join-overwrite-container').style.display = 'flex';
    } else {
        document.getElementById('table-join-mode').querySelector('option[value="1N"]').disabled = false;
    }
    
    document.getElementById('table-join-modal').classList.remove('hidden');
}

function closeTableJoinModal() {
    document.getElementById('table-join-modal').classList.add('hidden');
    currentJoinThemeId = null;
    currentJoinCsvData = null;
}

function confirmTableJoin() {
    const theme = themes.find(t => t.id === currentJoinThemeId);
    if (!theme) return;
    
    const csvKey = document.getElementById('table-join-csv-key').value;
    const mapKey = document.getElementById('table-join-map-key').value;
    const mode = document.getElementById('table-join-mode').value;
    const overwrite = document.getElementById('table-join-overwrite').checked;
    
    let targetTabId = null;
    if (mode === '1N') {
        targetTabId = document.getElementById('table-join-target-tab').value;
        if (!targetTabId) {
            alert('Selecione a aba de destino para os múltiplos registros.');
            return;
        }
    }
    
    let matchedCount = 0;
    
    // Create an index map for faster lookups
    const mapIndex = new Map();
    theme.features.forEach(feature => {
        const val = feature.properties[mapKey];
        if (val !== undefined && val !== null) {
            const strVal = String(val).trim().toLowerCase();
            // Can have multiple features with same key technically, store as array
            if (!mapIndex.has(strVal)) mapIndex.set(strVal, []);
            mapIndex.get(strVal).push(feature);
        }
    });
    
    // Process each row
    currentJoinCsvData.forEach(row => {
        const rowKeyValue = row[csvKey];
        if (rowKeyValue === undefined || rowKeyValue === null) return;
        
        const strRowKey = String(rowKeyValue).trim().toLowerCase();
        const matchedFeatures = mapIndex.get(strRowKey);
        
        if (matchedFeatures && matchedFeatures.length > 0) {
            matchedCount++;
            
            matchedFeatures.forEach(feature => {
                if (mode === '11') {
                    // Update main properties
                    Object.keys(row).forEach(col => {
                        if (col === '') return;
                        const existingValue = feature.properties[col];
                        const hasValue = existingValue !== undefined && existingValue !== null && existingValue !== '';
                        
                        if (overwrite || !hasValue) {
                            feature.properties[col] = row[col];
                        }
                    });
                } else if (mode === '1N') {
                    // Append to 1:N tab
                    let records = [];
                    if (feature.properties[targetTabId]) {
                        try {
                            records = typeof feature.properties[targetTabId] === 'string' ? JSON.parse(feature.properties[targetTabId]) : feature.properties[targetTabId];
                        } catch(e) { records = []; }
                    }
                    if (!Array.isArray(records)) records = [];
                    
                    row['_created_at'] = new Date().toISOString();
                    records.push(row);
                    feature.properties[targetTabId] = JSON.stringify(records);
                }
            });
        }
    });
    
    alert(`Processo concluído! ${matchedCount} linhas da planilha encontraram correspondência no mapa.`);
    
    saveThemes();
    closeTableJoinModal();
    // Refresh UI
    renderThemes();
    loadAllFeaturesToMap();
}

window.triggerTableUpload = triggerTableUpload;
window.handleTableUpload = handleTableUpload;
window.closeTableJoinModal = closeTableJoinModal;
window.confirmTableJoin = confirmTableJoin;
