const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const content = fs.readFileSync('supabase-config.js', 'utf8');
const urlMatch = content.match(/const SUPABASE_URL = ['"]([^'"]+)['"]/);
const keyMatch = content.match(/const SUPABASE_ANON_KEY = ['"]([^'"]+)['"]/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function inspectAll() {
  console.log('=== AUDITORIA COMPLETA DE PERFIS, HIERARQUIA E PERMISSÕES ===\n');

  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'heltonleite.geotec@gmail.com',
    password: 'Helton2026'
  });
  if (authErr) {
    console.error('Erro ao logar como SuperAdmin:', authErr);
    return;
  }
  console.log('Autenticado com sucesso como:', auth.user.email, 'ID:', auth.user.id);

  // 1. Profiles
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*').order('nome');
  console.log(`1. Perfis encontrados: ${profiles?.length || 0}`);
  profiles?.forEach(p => {
    console.log(` - ID: ${p.id} | Nome: ${p.nome} | Email: ${p.email} | Papel: ${p.papel} | SuperAdmin: ${p.super_admin} | EntidadeAdmin: ${p.entidade_admin} | Entidade: ${p.entidade}`);
  });

  // 2. Membros
  const { data: membros, error: mErr } = await supabase.from('municipio_membros').select('*, municipios(nome, uf)').order('user_id');
  console.log(`\n2. Vínculos de Município Membros: ${membros?.length || 0}`);
  membros?.forEach(m => {
    console.log(` - UserID: ${m.user_id} | Mun: ${m.municipios?.nome}-${m.municipios?.uf} | Papel: ${m.papel} | Status: ${m.status} | Entidade: ${m.entidade} | Unidade: ${m.unidade} | Setor: ${m.setor}`);
  });

  // 3. Permissões de camada
  const { data: permsCamada, error: cErr } = await supabase.from('permissoes_camada').select('*');
  console.log(`\n3. Permissões de Camada explícitas no BD: ${permsCamada?.length || 0}`);
  permsCamada?.forEach(c => {
    console.log(` - UserID: ${c.user_id} | TemaID: ${c.theme_id} | Ver: ${c.pode_ver} | Excluir: ${c.pode_excluir} | Estatística: ${c.pode_estatistica} | EditarTema: ${c.pode_editar_tema}`);
  });

  // 4. Permissões de aba
  const { data: permsAba, error: aErr } = await supabase.from('permissoes_aba').select('*');
  console.log(`\n4. Permissões de Aba explícitas no BD: ${permsAba?.length || 0}`);
  permsAba?.forEach(a => {
    console.log(` - UserID: ${a.user_id} | Form: ${a.form_id} | Tab: ${a.tab_id} | Ver: ${a.pode_ver} | Editar: ${a.pode_editar}`);
  });

  // 5. Temas (camadas)
  const { data: temas, error: tErr } = await supabase.from('temas').select('id, nome, municipio_id, entidade');
  console.log(`\n5. Total de Camadas no BD: ${temas?.length || 0}`);
  temas?.forEach(t => {
    console.log(` - Tema: ${t.nome} (ID: ${t.id}) | MunID: ${t.municipio_id} | Entidade: ${t.entidade}`);
  });

  // 6. Rasters (ortofotos)
  const { data: rasters, error: rErr } = await supabase.from('rasters').select('id, nome, municipio_id, entidade');
  console.log(`\n6. Total de Ortofotos no BD: ${rasters?.length || 0}`);
  rasters?.forEach(r => {
    console.log(` - Raster: ${r.nome} (ID: ${r.id}) | MunID: ${r.municipio_id} | Entidade: ${r.entidade}`);
  });
}

inspectAll();
