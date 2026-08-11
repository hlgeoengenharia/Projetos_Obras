// Configurações do Supabase
// Substitua estas chaves com as credenciais reais do seu projeto no painel do Supabase.

const SUPABASE_URL = 'https://iqejynikmeroiqyigsjo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxZWp5bmlrbWVyb2lxeWlnc2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjU2MDgsImV4cCI6MjA5ODk0MTYwOH0.aT91yVtQDYTluMUkx8HKoYrNhlniVC8Rd0iv2-LnASQ';

// Inicializa o cliente do Supabase
// (A variável supabase será injetada globalmente via script na página HTML)
let supabaseClient = null;
try {
    if (window.supabase && SUPABASE_URL.startsWith('http')) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("Supabase client initialized.");
    } else {
        console.warn("Supabase credentials not set or invalid.");
    }
} catch (e) {
    console.error("Failed to initialize Supabase:", e);
}
