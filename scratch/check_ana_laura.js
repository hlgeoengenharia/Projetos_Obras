const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const content = fs.readFileSync('supabase-config.js', 'utf8');
const urlMatch = content.match(/const SUPABASE_URL = ['"]([^'"]+)['"]/);
const keyMatch = content.match(/const SUPABASE_ANON_KEY = ['"]([^'"]+)['"]/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
    const { data: muns } = await supabase.from('municipios').select('*');
    console.log('Municipios:', muns);
    const { data: rasters } = await supabase.from('imagens_raster').select('id, nome, entidade, municipio_id');
    console.log('Rasters:', rasters);
}
run();
