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
    return collectedEntries[0];
}

async function run() {
    await supabase.auth.signInWithPassword({ email: 'ana_ufpb20@gmail.com', password: 'Ana2026' });
    
    const { data: temas } = await supabase.from('temas').select('*').eq('id', '90976d17-840d-41ef-a248-59bb6a6b3e60');
    const formId = temas[0].tipo_cadastro;
    const { data: form } = await supabase.from('forms').select('*').eq('id', formId).single();
    const tabs = form.schema?.tabs || form.schema || [];

    const { data: fc } = await supabase.from('feicoes').select('id, propriedades').eq('theme_id', '90976d17-840d-41ef-a248-59bb6a6b3e60');

    console.log(`\n=== ANÁLISE DE DIVERGÊNCIA PARA SITUAÇÃO DO RECUO (f_k3zw7mgs2) ===`);
    let discRecuo = [];
    fc.forEach(f => {
        const p = f.propriedades || {};
        const directVal = p.f_k3zw7mgs2;
        const latest1n = getLatestRecordAcrossTabs(tabs, null, 'auto', 'f_k3zw7mgs2', p, 'Situação do recuo');
        const latestVal = latest1n ? latest1n.value : undefined;

        if (directVal && latestVal && directVal.toLowerCase() !== latestVal.toLowerCase()) {
            discRecuo.push({
                id: f.id,
                proprietario: p.f_qpl0kxija || p.Proprietario,
                directMPF: directVal,
                subtabLatest: latestVal,
                subtabDate: latest1n.recordDate
            });
        }
    });

    console.log(`Total de feições onde a Situação do Recuo na aba MPF diverge da subaba 1:N: ${discRecuo.length}`);
    discRecuo.forEach(d => {
        console.log(`- Feição #${d.id} (${d.proprietario}):`);
        console.log(`    Valor na aba MPF: "${d.directMPF}"`);
        console.log(`    Valor da subaba:  "${d.subtabLatest}" (${d.subtabDate})`);
    });
}

run().catch(console.error);
