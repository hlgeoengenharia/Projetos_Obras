const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const content = fs.readFileSync('supabase-config.js', 'utf8');
const urlMatch = content.match(/const SUPABASE_URL = ['"]([^'"]+)['"]/);
const keyMatch = content.match(/const SUPABASE_ANON_KEY = ['"]([^'"]+)['"]/);
const supabase = createClient(urlMatch[1], keyMatch[1]);
async function test() {
  const { data: profiles } = await supabase.from('profiles').select('*').ilike('email', '%ana%');
  console.log('Profiles:', profiles);
  if (profiles && profiles.length > 0) {
    const { data: membros } = await supabase.from('municipio_membros').select('*, municipios(*)').eq('user_id', profiles[0].id);
    console.log('Membros:', JSON.stringify(membros, null, 2));
  }
}
test();
