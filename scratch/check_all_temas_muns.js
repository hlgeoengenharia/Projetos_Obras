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
  const allTemas = await fetchSupabase('temas?select=id,nome,municipio_id,created_at');
  const munMap = {};
  allTemas.forEach(t => {
    munMap[t.municipio_id] = (munMap[t.municipio_id] || []);
    munMap[t.municipio_id].push(t);
  });
  console.log('Temas por município:');
  for (const [mId, list] of Object.entries(munMap)) {
    console.log(`Municipio ${mId}: ${list.length} temas`);
    list.forEach(t => console.log(`  - [${t.id}] "${t.nome}" (${t.created_at})`));
  }
})();
