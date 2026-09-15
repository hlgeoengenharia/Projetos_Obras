const https = require('https');

const SUPABASE_URL = 'https://iqejynikmeroiqyigsjo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxZWp5bmlrbWVyb2lxeWlnc2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjU2MDgsImV4cCI6MjA5ODk0MTYwOH0.aT91yVtQDYTluMUkx8HKoYrNhlniVC8Rd0iv2-LnASQ';

function fetchSupabase(table) {
  const url = SUPABASE_URL + '/rest/v1/' + table + '?select=*';
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

(async () => {
  const municipios = await fetchSupabase('municipios');
  console.log('Municipios:', municipios.map(m => ({ id: m.id, nome: m.nome, uf: m.uf })));
  
  const temas = await fetchSupabase('temas');
  console.log('Temas count:', temas.length);
  temas.forEach(t => console.log('Tema:', { id: t.id, nome: t.nome, mun_id: t.municipio_id, entidade: t.entidade, meta_entidade: t.metadata ? t.metadata.entidade : null }));
  
  const rasters = await fetchSupabase('imagens_raster');
  console.log('Rasters count:', rasters.length);
  rasters.forEach(r => console.log('Raster:', { id: r.id, nome: r.nome, mun_id: r.municipio_id, entidade: r.entidade }));
})();
