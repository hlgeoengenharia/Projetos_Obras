// Configurações do Supabase
const SUPABASE_URL = 'https://iqejynikmeroiqyigsjo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxZWp5bmlrbWVyb2lxeWlnc2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjU2MDgsImV4cCI6MjA5ODk0MTYwOH0.aT91yVtQDYTluMUkx8HKoYrNhlniVC8Rd0iv2-LnASQ';

// Inicializa o cliente do Supabase
let supabaseClient = null;
try {
    if (window.supabase && SUPABASE_URL.startsWith('http')) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        console.log("Supabase client initialized.");

        const currentPath = window.location.pathname;
        const isPublicPage = currentPath.endsWith('login.html') || currentPath.endsWith('register.html') || currentPath.endsWith('signup.html');

        // Monitoramento Proativo de Sessão
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT' && !isPublicPage) {
                sessionStorage.removeItem('municipio_ativo');
                window.location.href = 'login.html';
            }
        });

        // Verificação de integridade do token no carregamento da página
        // Evita chamadas repetidas de 400 Bad Request se o refresh token tiver sido revogado
        supabaseClient.auth.getSession().then(({ data, error }) => {
            if (error || (!data.session && !isPublicPage)) {
                if (error && (error.status === 400 || error.message?.toLowerCase().includes('refresh') || error.message?.toLowerCase().includes('token'))) {
                    console.warn("Sessão ou Refresh Token inválido. Limpando credenciais locais expiradas...");
                    try {
                        supabaseClient.auth.signOut({ scope: 'local' });
                        // Limpa resíduos de chaves auth do localStorage
                        Object.keys(localStorage).forEach(key => {
                            if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                                localStorage.removeItem(key);
                            }
                        });
                    } catch(eSignOut) {}

                    if (!isPublicPage) {
                        sessionStorage.removeItem('municipio_ativo');
                        window.location.href = 'login.html?expired=1';
                    }
                }
            }
        }).catch(err => {
            console.warn("Erro ao verificar sessão Supabase:", err);
        });

    } else {
        console.warn("Supabase credentials not set or invalid.");
    }
} catch (e) {
    console.error("Failed to initialize Supabase:", e);
}

