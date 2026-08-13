import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://iqejynikmeroiqyigsjo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxZWp5bmlrbWVyb2lxeWlnc2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjU2MDgsImV4cCI6MjA5ODk0MTYwOH0.aT91yVtQDYTluMUkx8HKoYrNhlniVC8Rd0iv2-LnASQ';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testUpload() {
    const fileContent = new Blob(['Hello World'], { type: 'text/plain' });
    
    console.log("Testing upload to 'arquivos-obras'...");
    const { data, error } = await supabase.storage.from('arquivos-obras').upload('test.txt', fileContent, {
        upsert: true
    });
    
    if (error) {
        console.error('Error on arquivos-obras:', error);
    } else {
        console.log('Success on arquivos-obras:', data);
    }
}

testUpload();
