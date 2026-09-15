const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const content = fs.readFileSync('supabase-config.js', 'utf8');
const urlMatch = content.match(/const SUPABASE_URL = ['"]([^'"]+)['"]/);
const keyMatch = content.match(/const SUPABASE_ANON_KEY = ['"]([^'"]+)['"]/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function test() {
  console.log('1. Attempting login for ana_ufpb20@gmail.com...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'ana_ufpb20@gmail.com',
    password: 'Ana2026'
  });

  if (authError) {
    console.error('Auth error:', authError);
    return;
  }

  console.log('2. Logged in successfully! User ID:', authData.user.id);
  const userId = authData.user.id;

  console.log('3. Querying profile...');
  const { data: profile, error: profError } = await supabase
    .from('profiles')
    .select('super_admin, entidade_admin')
    .eq('id', userId)
    .single();
  console.log('Profile:', profile, 'Error:', profError);

  console.log('4. Querying municipio_membros...');
  const { data: membros, error: membError } = await supabase
    .from('municipio_membros')
    .select('papel, municipios(id, nome, uf)')
    .eq('user_id', userId)
    .eq('status', 'aprovado');
  console.log('Membros:', JSON.stringify(membros, null, 2), 'Error:', membError);

  const municipiosAtribuidos = (membros || [])
    .filter(m => m.municipios)
    .map(m => ({ id: m.municipios.id, nome: m.municipios.nome, uf: m.municipios.uf, papel: m.papel }));
  console.log('Municipios atribuidos:', municipiosAtribuidos);

  if (municipiosAtribuidos.length === 1 && !profile?.entidade_admin) {
    console.log('-> ROUTE TO: index.html with activeMunicipio =', municipiosAtribuidos[0]);
  } else {
    console.log('-> ROUTE TO: home.html');
  }
}

test();
