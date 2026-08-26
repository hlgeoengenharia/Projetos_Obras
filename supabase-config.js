// Configurações do Supabase
const SUPABASE_URL = 'https://iqejynikmeroiqyigsjo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxZWp5bmlrbWVyb2lxeWlnc2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjU2MDgsImV4cCI6MjA5ODk0MTYwOH0.aT91yVtQDYTluMUkx8HKoYrNhlniVC8Rd0iv2-LnASQ';

// Inicializa o cliente do Supabase
let supabaseClient = null;
try {
    if (window.supabase && SUPABASE_URL.startsWith('http')) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("Supabase client initialized.");

        // Monitoramento Proativo de Sessão: se a sessão expirar ou for encerrada, retorna ao login
        supabaseClient.auth.onAuthStateChange((event, session) => {
            const currentPath = window.location.pathname;
            const isPublicPage = currentPath.endsWith('login.html') || currentPath.endsWith('register.html');
            
            if (event === 'SIGNED_OUT' && !isPublicPage) {
                sessionStorage.removeItem('municipio_ativo');
                window.location.href = 'login.html';
            }
        });
    } else {
        console.warn("Supabase credentials not set or invalid.");
    }
} catch (e) {
    console.error("Failed to initialize Supabase:", e);
}
