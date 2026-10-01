import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://iqejynikmeroiqyigsjo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxZWp5bmlrbWVyb2lxeWlnc2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjU2MDgsImV4cCI6MjA5ODk0MTYwOH0.aT91yVtQDYTluMUkx8HKoYrNhlniVC8Rd0iv2-LnASQ';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    console.log("=== 1. BUSCANDO TEMAS ===");
    const { data: temas, error: errTemas } = await supabase.from('temas').select('*');
    if (errTemas) console.error("Erro temas:", errTemas);
    else {
        console.log(`Encontrados ${temas.length} temas:`);
        temas.forEach(t => console.log(`  - [${t.id}] "${t.name}" (form_id: ${t.form_id || t.formId})`));
    }

    console.log("\n=== 2. BUSCANDO FORMS ===");
    const { data: forms, error: errForms } = await supabase.from('forms').select('*');
    if (errForms) console.error("Erro forms:", errForms);
    else {
        console.log(`Encontrados ${forms.length} formulários:`);
        forms.forEach(f => {
            console.log(`\nForm [${f.id}] "${f.title || f.name}":`);
            const sc = f.schema || f.tabs || [];
            const stats = f.statsConfig || f.schema?.statsConfig || [];
            console.log("statsConfig:", JSON.stringify(stats, null, 2));
            const tabs = Array.isArray(sc) ? sc : (sc.tabs || []);
            tabs.forEach(t => {
                console.log(`  Aba [${t.id}] "${t.title}":`);
                (t.fields || []).forEach(fld => {
                    console.log(`    Field: id=${fld.id} label="${fld.label}" type=${fld.type}`);
                });
            });
        });
    }

    if (temas && temas.length > 0) {
        const orla = temas.find(t => t.name?.toLowerCase().includes('orla')) || temas[0];
        console.log(`\n=== 3. FEICOES DO TEMA ${orla.name} [${orla.id}] ===`);
        const { data: feicoes, error: errF } = await supabase
            .from('feicoes')
            .select('id, propriedades')
            .eq('theme_id', orla.id)
            .limit(20);
        if (errF) console.error("Erro feicoes:", errF);
        else {
            console.log(`Total feições obtidas: ${feicoes.length}`);
            feicoes.forEach(f => {
                const p = f.propriedades || {};
                console.log(`Feição #${f.id}:`, Object.entries(p).filter(([k]) => !k.startsWith('_')).slice(0, 10).map(([k, v]) => `${k}:${typeof v === 'object' ? JSON.stringify(v).slice(0, 30) : v}`).join(' | '));
            });
        }
    }
}

run().catch(console.error);
