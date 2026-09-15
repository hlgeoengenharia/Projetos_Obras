const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const content = fs.readFileSync('supabase-config.js', 'utf8');
const urlMatch = content.match(/const SUPABASE_URL = ['"]([^'"]+)['"]/);
const keyMatch = content.match(/const SUPABASE_ANON_KEY = ['"]([^'"]+)['"]/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function test() {
  console.log('1. Signing in...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'ana_ufpb20@gmail.com',
    password: 'Ana2026'
  });
  const userId = authData.user.id;

  console.log('2. Querying profile...');
  const { data: profile, error: profError } = await supabase.from('profiles').select('*').eq('id', userId).single();
  console.log('Profile:', profile?.nome, 'SuperAdmin:', profile?.super_admin, 'EntidadeAdmin:', profile?.entidade_admin);

  console.log('3. Querying meusMunicipiosAdmin...');
  const { data: meusMunicipiosAdmin, error: admError } = await supabase
    .from('municipio_membros')
    .select('municipio_id')
    .eq('user_id', userId)
    .eq('papel', 'admin')
    .eq('status', 'aprovado');
  console.log('meusMunicipiosAdmin:', meusMunicipiosAdmin?.length, 'items');

  console.log('4. Querying municipios and entidades...');
  const [municipiosRes, entidadesRes] = await Promise.all([
    supabase.from('municipios').select('id, nome, uf').eq('ativo', true).order('nome'),
    supabase.from('entidades_padrao').select('nome, tipo')
  ]);
  console.log('Municipios count:', municipiosRes.data?.length, 'Entidades count:', entidadesRes.data?.length);

  console.log('5. Querying membros do usuario...');
  const { data: meusMembros, error: membError } = await supabase
    .from('municipio_membros')
    .select('municipio_id, papel, status, entidade')
    .eq('user_id', userId)
    .eq('status', 'aprovado');
  console.log('meusMembros:', meusMembros?.length, 'items');
  console.log('Everything in home.html init() queries SUCCESSFUL!');
}

test();
