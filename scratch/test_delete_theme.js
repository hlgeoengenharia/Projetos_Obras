const https = require('https');

const SUPABASE_URL = 'https://iqejynikmeroiqyigsjo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxZWp5bmlrbWVyb2lxeWlnc2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjU2MDgsImV4cCI6MjA5ODk0MTYwOH0.aT91yVtQDYTluMUkx8HKoYrNhlniVC8Rd0iv2-LnASQ';

function deleteLucenaTheme(id) {
  const url = SUPABASE_URL + '/rest/v1/temas?id=eq.' + id;
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ id, statusCode: res.statusCode, data }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const ghostIds = [
    '89421179-d6cd-4c67-945c-4aa90d779d96',
    'eb895dab-cbdc-40f7-9ad8-6b743ecab4ef',
    'd404156f-cd29-4b87-a918-7d2bad4b170b',
    '00570e68-c69a-4c80-95f5-60a2f6bcb194',
    '4eaff97e-350a-4e2b-b503-8389aa864af3',
    '5574ca2d-7d08-4208-b2a3-4de35b497470'
  ];

  for (const id of ghostIds) {
    const res = await deleteLucenaTheme(id);
    console.log('Deleted:', res);
  }
})();
