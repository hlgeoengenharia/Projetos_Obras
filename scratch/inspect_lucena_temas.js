const https = require('https');

const SUPABASE_URL = 'https://iqejynikmeroiqyigsjo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxZWp5bmlrbWVyb2lxeWlnc2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjU2MDgsImV4cCI6MjA5ODk0MTYwOH0.aT91yVtQDYTluMUkx8HKoYrNhlniVC8Rd0iv2-LnASQ';

function fetchSupabase(urlPath) {
  const url = SUPABASE_URL + '/rest/v1/' + urlPath;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

(async () => {
  const temasLucena = await fetchSupabase('temas?municipio_id=eq.bd6604ab-f657-4e9c-b249-76f9186cebd5');
  console.log('Temas de Lucena:', JSON.stringify(temasLucena, null, 2));

  const temasCabedelo = await fetchSupabase('temas?municipio_id=eq.ef6bfd13-9e40-4bb4-81d3-e2c839ff500d');
  console.log('Temas de Cabedelo:', JSON.stringify(temasCabedelo.map(t => ({ id: t.id, nome: t.nome, created_at: t.created_at })), null, 2));
})();
