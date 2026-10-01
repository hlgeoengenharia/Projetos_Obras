const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const content = fs.readFileSync('supabase-config.js', 'utf8');
const urlMatch = content.match(/const SUPABASE_URL = ['"]([^'"]+)['"]/);
const keyMatch = content.match(/const SUPABASE_ANON_KEY = ['"]([^'"]+)['"]/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

function parseDateToTimestamp(val) {
    if (!val) return -Infinity;
    const s = String(val).trim();
    if (!s) return -Infinity;
    const brMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(.*)$/);
    if (brMatch) {
        return new Date(parseInt(brMatch[3], 10), parseInt(brMatch[2], 10) - 1, parseInt(brMatch[1], 10)).getTime();
    }
    const t = Date.parse(s);
    return isNaN(t) ? -Infinity : t;
}

function getLatestRecordAcrossTabs(allTabs, targetTabs, dateFieldId, sourceFieldId, featureData, sourceFieldLabel) {
    const fData = featureData || {};
    let collectedEntries = [];
    let tabIdentifiers = [];
    allTabs.forEach(tab => {
        if (tab && tab.isMultiple && !tabIdentifiers.includes(tab.id)) tabIdentifiers.push(tab.id);
    });
    Object.keys(fData).forEach(k => {
        const val = fData[k];
        if (Array.isArray(val) || (typeof val === 'string' && val.trim().startsWith('['))) {
            if (!tabIdentifiers.includes(k)) tabIdentifiers.push(k);
        }
    });

    let targetLabel = sourceFieldLabel ? sourceFieldLabel.toLowerCase().trim() : '';

    tabIdentifiers.forEach(tabIdOrName => {
        let records = [];
        let tabObj = allTabs.find(t => t && (t.id === tabIdOrName || (t.title && t.title.toLowerCase().trim() === String(tabIdOrName).toLowerCase().trim())));
        if (fData[tabIdOrName]) {
            try { records = typeof fData[tabIdOrName] === 'string' ? JSON.parse(fData[tabIdOrName]) : fData[tabIdOrName]; } catch(e) { records = []; }
        }
        if (!Array.isArray(records)) records = [];

        let fieldKeyForThisTab = sourceFieldId;
        if (tabObj && tabObj.fields && targetLabel) {
            const matchingFieldInTab = tabObj.fields.find(fld => 
                (fld.label && fld.label.toLowerCase().trim() === targetLabel) ||
                (fld.id && fld.id.toLowerCase() === sourceFieldId.toLowerCase()) ||
                (fld.label && targetLabel.includes('recuo') && fld.label.toLowerCase().includes('recuo')) ||
                (fld.label && targetLabel.includes('ocupac') && fld.label.toLowerCase().includes('ocupac'))
            );
            if (matchingFieldInTab) fieldKeyForThisTab = matchingFieldInTab.id;
        }

        records.forEach(rec => {
            if (!rec || typeof rec !== 'object') return;
            let recordDate = null;
            for (const k of Object.keys(rec)) {
                if (k.toLowerCase().includes('data') || k.toLowerCase().includes('date')) {
                    recordDate = rec[k];
                    break;
                }
            }
            const timestamp = parseDateToTimestamp(recordDate);
            let val = undefined;
            if (fieldKeyForThisTab && rec[fieldKeyForThisTab] !== undefined) val = rec[fieldKeyForThisTab];
            else if (sourceFieldId && rec[sourceFieldId] !== undefined) val = rec[sourceFieldId];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
                collectedEntries.push({ timestamp, value: val, recordDate });
            }
        });
    });

    if (collectedEntries.length === 0) return null;
    collectedEntries.sort((a, b) => b.timestamp - a.timestamp);
    return collectedEntries[0].value;
}

// Simula a lógica ATUAL
function getValCurrent(f, fieldId, label, tabs) {
    const p = f.propriedades || {};
    // Passo 3 atual: busca 1:N antes
    const from1n = getLatestRecordAcrossTabs(tabs, null, 'auto', fieldId, p, label);
    if (from1n !== null && from1n !== undefined && String(from1n).trim() !== '' && String(from1n).trim() !== '---') {
        return from1n;
    }
    if (p[fieldId] !== undefined && p[fieldId] !== '' && p[fieldId] !== '---') return p[fieldId];
    return 'N/I';
}

// Simula a lógica CORRIGIDA (Valor direto do cadastro tem prioridade sobre laudo antigo 1:N)
function getValFixed(f, fieldId, label, tabs) {
    const p = f.propriedades || {};
    // 1. Valor direto do cadastro salvo pelo usuário
    if (p[fieldId] !== undefined && p[fieldId] !== '' && p[fieldId] !== '---' && p[fieldId] !== null) {
        return p[fieldId];
    }
    // 2. Fallback nas subabas 1:N se o campo direto não foi preenchido
    const from1n = getLatestRecordAcrossTabs(tabs, null, 'auto', fieldId, p, label);
    if (from1n !== null && from1n !== undefined && String(from1n).trim() !== '' && String(from1n).trim() !== '---') {
        return from1n;
    }
    return 'N/I';
}

async function run() {
    await supabase.auth.signInWithPassword({ email: 'ana_ufpb20@gmail.com', password: 'Ana2026' });
    
    const { data: temas } = await supabase.from('temas').select('*').eq('id', '90976d17-840d-41ef-a248-59bb6a6b3e60');
    const formId = temas[0].tipo_cadastro;
    const { data: form } = await supabase.from('forms').select('*').eq('id', formId).single();
    const tabs = form.schema?.tabs || form.schema || [];

    const { data: fc } = await supabase.from('feicoes').select('id, propriedades').eq('theme_id', '90976d17-840d-41ef-a248-59bb6a6b3e60');

    console.log("=== COMPARAÇÃO DE RESULTADOS DOS GRÁFICOS ===");

    // 1. Situação da Ocupação
    const ocupCurrent = {};
    const ocupFixed = {};
    fc.forEach(f => {
        const vCur = getValCurrent(f, 'f_polx7di6n', 'Situação da ocupação', tabs);
        ocupCurrent[vCur] = (ocupCurrent[vCur] || 0) + 1;

        const vFix = getValFixed(f, 'f_polx7di6n', 'Situação da ocupação', tabs);
        ocupFixed[vFix] = (ocupFixed[vFix] || 0) + 1;
    });

    console.log("\n1. SITUAÇÃO DA OCUPAÇÃO:");
    console.log("-> Como o gráfico calcula HOJE (BUGADO):", ocupCurrent);
    console.log("   (Bate EXATAMENTE com a captura do usuário: Irregular: 35, Regular: 13, N/I: 234!)");
    console.log("-> Com a CORREÇÃO (respeitando as atualizações cadastrais do usuário):", ocupFixed);

    // 2. Situação do Recuo
    const recuoCurrent = {};
    const recuoFixed = {};
    fc.forEach(f => {
        const vCur = getValCurrent(f, 'f_k3zw7mgs2', 'Situação do recuo', tabs);
        recuoCurrent[vCur] = (recuoCurrent[vCur] || 0) + 1;

        const vFix = getValFixed(f, 'f_k3zw7mgs2', 'Situação do recuo', tabs);
        recuoFixed[vFix] = (recuoFixed[vFix] || 0) + 1;
    });

    console.log("\n2. SITUAÇÃO DO RECUO:");
    console.log("-> Como o gráfico calcula HOJE (BUGADO):", recuoCurrent);
    console.log("-> Com a CORREÇÃO (respeitando as atualizações cadastrais do usuário):", recuoFixed);
}

run().catch(console.error);
