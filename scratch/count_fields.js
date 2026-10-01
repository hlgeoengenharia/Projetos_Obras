const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const content = fs.readFileSync('supabase-config.js', 'utf8');
const urlMatch = content.match(/const SUPABASE_URL = ['"]([^'"]+)['"]/);
const keyMatch = content.match(/const SUPABASE_ANON_KEY = ['"]([^'"]+)['"]/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  await supabase.auth.signInWithPassword({ email: 'ana_ufpb20@gmail.com', password: 'Ana2026' });
  
  // 1. Get form definition
  const { data: temas } = await supabase.from('temas').select('*').eq('id', '90976d17-840d-41ef-a248-59bb6a6b3e60');
  const formId = temas[0].tipo_cadastro;
  const { data: form } = await supabase.from('forms').select('*').eq('id', formId).single();
  
  console.log('=== FORM CONFIGURATION ===');
  console.log('Form ID:', form.id, form.title);
  console.log('StatsConfig:', JSON.stringify(form.statsConfig || form.schema?.statsConfig, null, 2));

  console.log('\n=== TABS & FIELDS ===');
  const tabs = form.schema?.tabs || form.schema || [];
  tabs.forEach(t => {
    console.log(`\nTab [${t.id}] "${t.title}" (isMultiple: ${t.isMultiple}):`);
    (t.fields || []).forEach(f => {
      console.log(`  - Field [${f.id}] "${f.label}" (${f.type})`);
      if (f.formulaConfig) console.log(`      formulaConfig:`, f.formulaConfig);
    });
  });

  // 2. Count feicoes values
  const { data: fc } = await supabase.from('feicoes').select('id, propriedades').eq('theme_id', '90976d17-840d-41ef-a248-59bb6a6b3e60');
  console.log('\n=== DB FEATURES STATS (Total: ' + fc.length + ') ===');
  
  const polxCounts = {};
  const recuoCounts = {};
  const p1sCounts = {};
  
  // Also check 1:N subtab records!
  let totalWithPf = 0;
  let totalWithSpu = 0;
  let totalWithMun = 0;

  fc.forEach(f => {
    const p = f.propriedades || {};
    const valPolx = p.f_polx7di6n || 'VAZIO';
    polxCounts[valPolx] = (polxCounts[valPolx] || 0) + 1;
    const valRecuo = p.f_k3zw7mgs2 || 'VAZIO';
    recuoCounts[valRecuo] = (recuoCounts[valRecuo] || 0) + 1;
    const valP1s = p.f_p1s7jf9w0 || 'VAZIO';
    p1sCounts[valP1s] = (p1sCounts[valP1s] || 0) + 1;

    // Check tabs
    if (p.tab_ki5d2td7a && p.tab_ki5d2td7a.length > 0 && p.tab_ki5d2td7a !== '[]') totalWithPf++;
    if (p.tab_gyswshr6v && p.tab_gyswshr6v.length > 0 && p.tab_gyswshr6v !== '[]') totalWithSpu++;
    if (p.tab_6wlt0sn0q && p.tab_6wlt0sn0q.length > 0 && p.tab_6wlt0sn0q !== '[]') totalWithMun++;
  });

  console.log('f_polx7di6n direct in properties:', polxCounts);
  console.log('f_k3zw7mgs2 direct in properties:', recuoCounts);
  console.log('f_p1s7jf9w0 direct in properties:', p1sCounts);
  console.log(`Features with PF records: ${totalWithPf}`);
  console.log(`Features with SPU records: ${totalWithSpu}`);
  console.log(`Features with Município records: ${totalWithMun}`);
}
run().catch(console.error);
