const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const content = fs.readFileSync('supabase-config.js', 'utf8');
const urlMatch = content.match(/const SUPABASE_URL = ['"]([^'"]+)['"]/);
const keyMatch = content.match(/const SUPABASE_ANON_KEY = ['"]([^'"]+)['"]/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
    const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
        email: 'ana_ufpb20@gmail.com',
        password: 'Ana2026'
    });
    if (authErr) {
        console.error("Erro auth:", authErr);
        return;
    }
    console.log("Autenticado como:", auth.user.email);

    // 1. Temas
    const { data: temas, error: tErr } = await supabase.from('temas').select('*');
    if (tErr) console.error("Erro temas:", tErr);
    
    const orlaTema = temas?.find(t => t.id.startsWith('90976d17') || t.nome.toLowerCase().includes('imóveis orla') || t.nome.toLowerCase().includes('imoveis orla'));
    console.log("\nTema Orla:", orlaTema?.id, orlaTema?.nome, "tipo_cadastro:", orlaTema?.tipo_cadastro);

    if (!orlaTema) {
        console.log("Todos os temas:", temas?.map(t => `${t.id}: ${t.nome}`));
        return;
    }

    // 2. Form específico
    const { data: form, error: fErr } = await supabase.from('forms').select('*').eq('id', orlaTema.tipo_cadastro).single();
    if (fErr) console.error("Erro form:", fErr);
    else {
        console.log(`\n=== FORMULÁRIO DO TEMA [${form.id}] "${form.title || form.name}" ===`);
        const stats = form.statsConfig || form.schema?.statsConfig || [];
        console.log("StatsConfig:", JSON.stringify(stats, null, 2));
        const tabs = form.schema?.tabs || form.schema || [];
        tabs.forEach(t => {
            console.log(`\n  Aba [${t.id}] "${t.title}": isMultiple=${t.isMultiple} tabType=${t.tabType}`);
            (t.fields || []).forEach(fld => {
                console.log(`    Campo: id=${fld.id} label="${fld.label}" type=${fld.type}`);
            });
        });
    }

    // 3. Feições da Orla
    console.log(`\n=== FEICOES DO TEMA "${orlaTema.nome}" [${orlaTema.id}] ===`);
    const { data: feicoes, error: fcErr } = await supabase
        .from('feicoes')
        .select('id, propriedades')
        .eq('theme_id', orlaTema.id);
    
    if (fcErr) console.error("Erro feicoes:", fcErr);
    else {
        console.log(`Total de feições no banco: ${feicoes.length}`);
        
        let comOcup = 0;
        let comFpolx = 0;
        let comRecuo = 0;
        let comFk3z = 0;
        let comFp1s = 0;
        let amostras = [];

        feicoes.forEach(fc => {
            const p = fc.propriedades || {};
            if (p.f_polx7di6n) comFpolx++;
            if (p.Situacao_Ocupacao || p.situacao_ocupacao || p['Situação da ocupação'] || p['Situação da Ocupação']) comOcup++;
            if (p.Situacao_recuo || p.situacao_recuo) comRecuo++;
            if (p.f_k3zw7mgs2) comFk3z++;
            if (p.f_p1s7jf9w0) comFp1s++;

            if (p.f_polx7di6n || p.Situacao_Ocupacao || p.situacao_ocupacao || p.t_pf || p.t_spu || p.t_mun || p.records_1n || p.f_k3zw7mgs2 || p.Situacao_recuo) {
                if (amostras.length < 5) {
                    amostras.push({
                        id: fc.id,
                        f_polx7di6n: p.f_polx7di6n,
                        Situacao_Ocupacao: p.Situacao_Ocupacao,
                        situacao_ocupacao: p.situacao_ocupacao,
                        f_k3zw7mgs2: p.f_k3zw7mgs2,
                        Situacao_recuo: p.Situacao_recuo,
                        todasChavesComValor: Object.entries(p).filter(([k, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
                    });
                }
            }
        });

        console.log(`\nEstatísticas de preenchimento das ${feicoes.length} feições:`);
        console.log(`- Preenchidos f_polx7di6n: ${comFpolx}`);
        console.log(`- Preenchidos Situacao_Ocupacao / situacao_ocupacao: ${comOcup}`);
        console.log(`- Preenchidos f_k3zw7mgs2 (recuo): ${comFk3z}`);
        console.log(`- Preenchidos Situacao_recuo: ${comRecuo}`);
        console.log(`- Preenchidos f_p1s7jf9w0 (fase): ${comFp1s}`);
        console.log("\nAmostras detalhadas de feições com dados:\n", JSON.stringify(amostras, null, 2));
    }
}

run().catch(console.error);
